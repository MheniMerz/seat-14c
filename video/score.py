"""Original score and sound cues for the Seat 14C film (165 s, 48 kHz stereo).

A slow, cool pad in D minor with a sparse bell-piano motif, and cues that
land on the film's beats: the stub tearing, Board, take-off, the flick, the
wrist menu, the seat-belt chime, one breath and the miles counter.

    python3 video/score.py video/out/score.wav
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 165.0
N = int(SR * DUR)
rng = np.random.default_rng(14)
out = np.zeros((N, 2))


def hz(note: int) -> float:
    """MIDI note to Hz."""
    return 440.0 * 2 ** ((note - 69) / 12)


def place(sig: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0) -> None:
    """Mix a mono or stereo signal into the score at `at` seconds."""
    i = int(at * SR)
    if i >= N:
        return
    if sig.ndim == 1:
        left = np.cos((pan + 1) * np.pi / 4)
        right = np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * left, sig * right], axis=1)
    n = min(len(sig), N - i)
    out[i:i + n] += sig[:n] * gain


def env(n: int, attack: float, release: float) -> np.ndarray:
    a = max(1, min(n // 2, int(attack * SR)))
    r = max(1, min(n - a, int(release * SR)))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a) ** 2
    e[-r:] *= np.linspace(1, 0, r) ** 2
    return e


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    """A gentle low-pass (two one-pole stages' magnitude), applied in the frequency domain."""
    spectrum = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spectrum /= 1 + (f / cutoff) ** 2
    y = np.fft.irfft(spectrum, len(x))
    return y / (np.max(np.abs(y)) + 1e-9)


def pad(notes: list[int], dur: float, gain: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = np.zeros((n, 2))
    for note in notes:
        f = hz(note)
        for side, det in ((0, -0.08), (1, 0.08)):
            ff = f * 2 ** (det / 12)
            tone = (np.sin(2 * np.pi * ff * t) + 0.35 * np.sin(2 * np.pi * 2 * ff * t + 0.3)
                    + 0.12 * np.sin(2 * np.pi * 3 * ff * t + 1.1))
            tone *= 1 + 0.15 * np.sin(2 * np.pi * 0.17 * t + note)
            sig[:, side] += tone
    sig *= env(n, dur * 0.35, dur * 0.4)[:, None] * gain / len(notes)
    return sig


def bell(note: int, dur: float = 3.2) -> np.ndarray:
    """A soft bell-piano note: a few partials with their own decays."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(note)
    sig = (np.sin(2 * np.pi * f * t) * np.exp(-t * 1.6)
           + 0.4 * np.sin(2 * np.pi * 2.0 * f * t) * np.exp(-t * 2.8)
           + 0.15 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 4.5)
           + 0.06 * np.sin(2 * np.pi * 4.2 * f * t) * np.exp(-t * 7))
    sig *= env(n, 0.004, 0.4)
    return sig


def noise(dur: float, cutoff: float) -> np.ndarray:
    return lowpass(rng.standard_normal(int(dur * SR)), cutoff)


# --- Harmony: D minor, slow; brightens to F major / B-flat at landing -------
CHORDS = [
    (0, [50, 57, 62, 65]),    # Dm
    (8, [46, 53, 62, 65]),    # Bb
    (16, [48, 55, 60, 64]),   # C
    (24, [45, 52, 61, 64]),   # A
    (32, [50, 57, 62, 65]),
    (40, [46, 53, 62, 65]),
    (48, [43, 50, 58, 62]),   # Gm
    (56, [45, 52, 57, 61]),   # A
    (64, [38, 50, 57, 62]),   # low Dm: take-off
    (76, [46, 53, 58, 62]),
    (88, [43, 50, 55, 62]),
    (100, [45, 52, 57, 64]),
    (112, [41, 53, 57, 60]),  # F: landing
    (124, [46, 53, 58, 65]),  # Bb
    (136, [48, 55, 60, 67]),  # C
    (148, [41, 53, 60, 65]),  # F
    (157, [38, 50, 57, 62, 69]),  # Dm, end card
]
for i, (start, notes) in enumerate(CHORDS):
    end = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else DUR
    dur = end - start + 3.0
    place(pad(notes, dur, 0.16), max(0.0, start - 1.5))

# --- Motif: sparse bells, every 2 s, following the chord -------------------
for i, (start, notes) in enumerate(CHORDS):
    end = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else DUR - 3
    if start < 8:
        continue
    pattern = [notes[-1] + 12, notes[-2] + 12, notes[-3] + 12, notes[-2] + 12]
    k = 0
    t = start
    while t < end - 0.5:
        if not (64 <= t < 72):  # leave take-off to the engines
            place(bell(pattern[k % 4]), t, 0.11, pan=0.3 if k % 2 else -0.3)
        k += 1
        t += 2.0

# --- Cues ----------------------------------------------------------------------
# Cold open: a low swell, then the stub tears.
place(noise(6, 300) * env(int(6 * SR), 3, 2), 0.0, 0.25)
tear = noise(0.35, 6000) * np.exp(-np.arange(int(0.35 * SR)) / SR * 14)
place(tear, 2.95, 0.5, pan=0.2)
place(bell(74, 5), 4.6, 0.18)
place(bell(81, 5), 4.62, 0.08)
# Typing ticks on the check-in page, then Board.
for i in range(46):
    tick = noise(0.03, 5000) * np.exp(-np.arange(int(0.03 * SR)) / SR * 120)
    place(tick, 21.5 + i * 0.17 + (i % 3) * 0.02, 0.12, pan=0.1)
place(bell(86, 1.5), 30.5, 0.12)
whoosh = noise(3.0, 1200) * np.sin(np.linspace(0, np.pi, int(3.0 * SR))) ** 2
place(whoosh, 31.2, 0.35)
# Tray rises; dial detents.
place(noise(5, 180) * env(int(5 * SR), 2, 2), 38.5, 0.3)
for i in range(3):
    det = noise(0.02, 7000) * np.exp(-np.arange(int(0.02 * SR)) / SR * 200)
    place(det, 50.6 + i * 0.9, 0.3, pan=0.4)
# Take-off: engines spool up, then settle into a hum as the cabin dims.
n = int(16 * SR)
spool = noise(16, 250)
spool *= np.concatenate([np.linspace(0, 1, int(4 * SR)) ** 2, np.ones(n - int(4 * SR))]) * env(n, 0.1, 6)
tt = np.arange(n) / SR
hum = 0.25 * np.sin(2 * np.pi * (55 + 20 * np.minimum(tt / 4, 1)) * tt) * env(n, 2, 6)
place(spool * 1.2 + hum, 64.3, 0.35)
# Step tick and the flick into the jar.
place(bell(79, 1.2), 86.0, 0.12)
place(noise(0.6, 2500) * np.sin(np.linspace(0, np.pi, int(0.6 * SR))), 94.6, 0.3, pan=0.5)
place(bell(91, 1.0), 96.3, 0.16, pan=0.5)
# Wrist menu rises; Pause.
place(noise(1.0, 900) * np.sin(np.linspace(0, np.pi, int(1.0 * SR))), 107.3, 0.2)
place(bell(84, 0.8), 111.0, 0.14)
# Seat-belt chime: two tones.
place(bell(76, 3) + 0.0, 115.2, 0.35)
place(bell(72, 3), 115.75, 0.35)
# Card onto Done.
place(noise(0.08, 3000) * np.exp(-np.arange(int(0.08 * SR)) / SR * 60), 119.3, 0.3)
# One breath: in for 2.7 s, out for 2.7 s.
b = noise(5.4, 700)
b *= np.sin(np.linspace(0, np.pi, len(b))) ** 2
place(b, 119.8, 0.28)
# Miles counter ticks.
for i in range(12):
    place(bell(88 + (i % 2) * 2, 0.25), 126.5 + i * 0.25, 0.05)
# Postcard lands.
place(bell(81, 2.5), 138.4, 0.12)
# Cuts: a soft tick on each.
for c in (140, 143.4, 146.8, 150.2, 153.6):
    place(noise(0.05, 4000) * np.exp(-np.arange(int(0.05 * SR)) / SR * 80), c, 0.18)
# End card: a last, high bell over the final chord.
place(bell(74, 6), 157.4, 0.2)
place(bell(81, 6), 158.1, 0.12)

# --- Master: gentle fade out, normalize to -1 dBFS ---------------------------------
fade = int(1.5 * SR)
out[-fade:] *= np.linspace(1, 0, fade)[:, None]
out *= 10 ** (-1 / 20) / np.max(np.abs(out))
pcm = (out * 32767).astype(np.int16)
path = sys.argv[1] if len(sys.argv) > 1 else 'score.wav'
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', path)
