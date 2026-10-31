/**
 * Procedural cabin audio, synthesized with WebAudio so the app ships no
 * sound files. Browsers only start audio after a user gesture, so
 * {@link unlockAudio} is called from the Board button.
 */

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

/** Dev builds keep the last sounds played so scripted tests can check them. */
export const soundLog: string[] = [];

function log(name: string): void {
  if (!import.meta.env.DEV) return;
  soundLog.push(name);
  if (soundLog.length > 50) soundLog.shift();
}

/** Create or resume the audio context. Call from a user gesture. */
export function unlockAudio(): void {
  try {
    if (context == null) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.8;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') void context.resume();
  } catch (error) {
    console.warn('[seat14c] audio unavailable', error);
  }
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master != null && context != null) {
    master.gain.setTargetAtTime(value ? 0 : 0.8, context.currentTime, 0.05);
  }
}

/** The shared context and output, or null before unlock or when muted. */
export function audioOut(): { ctx: AudioContext; out: GainNode } | null {
  if (context == null || master == null || muted || context.state !== 'running') {
    return null;
  }
  return { ctx: context, out: master };
}

type ToneOptions = {
  frequency: number;
  endFrequency?: number;
  duration: number;
  volume: number;
  type?: OscillatorType;
  delay?: number;
  attack?: number;
};

function tone({
  frequency,
  endFrequency,
  duration,
  volume,
  type = 'sine',
  delay = 0,
  attack = 0.004,
}: ToneOptions): void {
  const audio = audioOut();
  if (audio == null) return;
  const { ctx, out } = audio;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (endFrequency != null) {
    osc.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  }
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Soft click for a press on any button or target. */
export function playClick(): void {
  log('click');
  tone({ frequency: 1800, endFrequency: 900, duration: 0.05, volume: 0.18, type: 'triangle' });
}

/** A card or knob picked up. */
export function playPick(): void {
  log('pick');
  tone({ frequency: 520, endFrequency: 780, duration: 0.08, volume: 0.12 });
}

/** A card or knob let go. */
export function playDrop(): void {
  log('drop');
  tone({ frequency: 640, endFrequency: 380, duration: 0.1, volume: 0.12 });
}

/** A card settling into a slot: a short low thunk. */
export function playSlot(): void {
  log('slot');
  tone({ frequency: 220, endFrequency: 110, duration: 0.12, volume: 0.25, type: 'triangle' });
  tone({ frequency: 1400, duration: 0.03, volume: 0.06, type: 'square' });
}

/** One detent of the flight dial. */
export function playDetent(): void {
  log('detent');
  tone({ frequency: 2400, duration: 0.025, volume: 0.1, type: 'square' });
}

/** A step ticked off (rising) or unticked (falling). */
export function playTick(done: boolean): void {
  log(done ? 'tick' : 'untick');
  tone({ frequency: done ? 880 : 1320, endFrequency: done ? 1320 : 880, duration: 0.12, volume: 0.14 });
}

/** The two-tone seat-belt chime ("bing-bong"). */
export function playSeatbeltChime(): void {
  log('seatbeltChime');
  tone({ frequency: 1047, duration: 1.4, volume: 0.22, attack: 0.01 });
  tone({ frequency: 2094, duration: 0.6, volume: 0.04, attack: 0.01 });
  tone({ frequency: 784, duration: 1.8, volume: 0.22, attack: 0.01, delay: 0.55 });
  tone({ frequency: 1568, duration: 0.7, volume: 0.04, attack: 0.01, delay: 0.55 });
}
