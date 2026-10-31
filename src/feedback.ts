import { createSystem, Grabbed, Pressed } from '@iwsdk/core';
import { playClick, playDrop, playPick } from './audio.js';

/**
 * Sound for every interaction, in one place: a click when any target is
 * pressed (look + pinch, poke, or hand ray), and pick/drop sounds for grabs.
 * Production gaze shows no cursor, so this and each target's glow are the
 * only confirmation the user gets.
 */
export class FeedbackSystem extends createSystem({
  pressed: { required: [Pressed] },
  grabbed: { required: [Grabbed] },
}) {
  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', () => playClick()),
      this.queries.grabbed.subscribe('qualify', () => playPick()),
      this.queries.grabbed.subscribe('disqualify', () => playDrop()),
    );
  }
}
