"""Voiceover for the Seat 14C film: each script line spoken by Kokoro, a local
neural TTS model, placed on its caption's cue, then mixed over the score with
the music ducking under the voice.

Setup (once):
    python3 -m venv .venv-tts && .venv-tts/bin/pip install kokoro-onnx soundfile
    mkdir -p video/models && cd video/models && for f in kokoro-v1.0.onnx voices-v1.0.bin; do
      curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f; done

Run:
    .venv-tts/bin/python video/voiceover.py [--voice af_heart] [--speed 0.95]
    -> video/out/voiceover.wav (voice alone) and video/out/mix.wav (voice + score)
"""
import argparse
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = Path(__file__).resolve().parent
OUT = HERE / 'out'
SR = 48000
DUR = 165.0

# (cue in seconds, text as spoken, latest end). Cues follow video/captions.srt;
# a line must finish before the next one starts.
LINES = [
    (9.2, 'You have twenty minutes, and one thing that has to get done.', 19.6),
    (21.0, 'Seat fourteen C turns that into a flight.', 27.4),
    (27.9, 'Check in with up to three tasks... then board.', 34.6),
    (36.0, 'Rest your hands, and the tray meets them.', 44.6),
    (45.2, 'Your first flight teaches the three gestures: pinch, grab, and twist.', 54.6),
    (56.0, 'Pick one task. Set the length. Take off.', 66.6),
    (67.2, 'The cabin lights dim, and everything but your task steps back.', 79.6),
    (81.0, 'Glance at the card for its steps.', 89.6),
    (91.2, 'A stray thought? Flick it into the jar. It waits for you after landing.', 104.6),
    (106.0, 'Turn your palm up to pause... or to land early.', 114.6),
    (116.5, 'The chime means landing. Drop the card on Done, and take a breath.', 125.6),
    (126.2, 'And watch the route grow. Every new place leaves a postcard.', 139.6),
    (141.0, 'Every action works by hand, by look and pinch, or by looking alone.', 148.6),
    (149.2, 'And a three-day streak earns a night cabin.', 156.6),
    (158.4, 'Seat fourteen C. Finish one thing before you land.', 164.0),
]


def to_48k(samples: np.ndarray, rate: int) -> np.ndarray:
    """Resample with ffmpeg, with a gentle high-pass and light compression."""
    proc = subprocess.run(
        ['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(rate), '-ac', '1', '-i', '-',
         '-af', 'highpass=f=70,acompressor=threshold=0.15:ratio=2:attack=12:release=150:makeup=1.3,aresample=48000',
         '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-'],
        input=samples.astype(np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


def read_wav(path: Path) -> np.ndarray:
    data, rate = sf.read(path, always_2d=True)
    assert rate == SR, f'{path} is {rate} Hz'
    return data


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--voice', default='af_heart')
    parser.add_argument('--speed', type=float, default=0.95)
    args = parser.parse_args()

    kokoro = Kokoro(str(HERE / 'models/kokoro-v1.0.onnx'), str(HERE / 'models/voices-v1.0.bin'))
    voice = np.zeros(int(DUR * SR))
    for cue, text, latest in LINES:
        speed = args.speed
        while True:
            samples, rate = kokoro.create(text, voice=args.voice, speed=speed, lang='en-us')
            # Trim the model's leading and trailing silence.
            # Keep a generous margin so soft onsets ("ch", "f") survive.
            loud = np.flatnonzero(np.abs(samples) > 0.004)
            samples = samples[max(0, loud[0] - int(0.1 * rate)):loud[-1] + int(0.25 * rate)]
            length = len(samples) / rate
            if cue + length <= latest or speed >= 1.15:
                break
            speed += 0.05  # a touch faster rather than overrun the next cue
        clip = to_48k(samples, rate)
        start = int(cue * SR)
        end = min(len(voice), start + len(clip))
        voice[start:end] += clip[:end - start]
        status = 'ok' if cue + length <= latest else 'OVER'
        print(f'{cue:6.1f}s  {length:4.1f}s  speed {speed:.2f}  {status}  {text}')

    voice *= 10 ** (-1 / 20) / max(1e-9, np.max(np.abs(voice)))
    OUT.mkdir(exist_ok=True)
    sf.write(OUT / 'voiceover.wav', voice.astype(np.float32), SR, subtype='PCM_16')

    # Duck the score about 11 dB under the voice, easing in and out.
    score = read_wav(OUT / 'score.wav')
    active = np.abs(voice) > 0.02
    window = int(0.25 * SR)
    activity = np.convolve(active.astype(np.float32), np.ones(window) / window, mode='same') > 0.01
    # Hold the duck through short gaps between words, then smooth the edges.
    hold = np.convolve(activity.astype(np.float32), np.ones(int(0.6 * SR)), mode='same') > 0
    ramp = int(0.35 * SR)
    duck = np.convolve(hold.astype(np.float32), np.ones(ramp) / ramp, mode='same')
    gain = 1 - duck * (1 - 10 ** (-11 / 20))
    mix = score[:len(voice)] * gain[:, None] * 0.9 + voice[:, None] * 0.95
    mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
    sf.write(OUT / 'mix-raw.wav', mix.astype(np.float32), SR, subtype='FLOAT')
    # Broadcast-style loudness for YouTube: -16 LUFS, peaks under -1.5 dBTP.
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(OUT / 'mix-raw.wav'),
                    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', str(SR), '-c:a', 'pcm_s16le',
                    str(OUT / 'mix.wav')], check=True)
    print('wrote', OUT / 'voiceover.wav', 'and', OUT / 'mix.wav')


if __name__ == '__main__':
    sys.exit(main())
