import { createSystem } from '@iwsdk/core';

/**
 * How close (m) a fingertip must be before a poke target counts as hovered.
 * IWSDK's default is 20 cm, and gaze switches off while a hand hovers
 * anything. On a tray inside a two-foot bubble that kept gaze off almost
 * permanently, so hover only counts when a finger is really reaching.
 */
const TOUCH_HOVER_RADIUS = 0.06;

type TunablePointer = { options?: { hoverRadius?: number } };
type MultiPointerLike = { getPointer(kind: 'touch'): TunablePointer };

/** Seated, hands-first tuning of IWSDK's default pointer thresholds. */
export class InputTuningSystem extends createSystem({}) {
  init(): void {
    const pointers = this.world.input.xr.multiPointers as unknown as Record<
      'left' | 'right',
      MultiPointerLike
    >;
    for (const hand of ['left', 'right'] as const) {
      const options = pointers[hand]?.getPointer('touch')?.options;
      if (options == null || typeof options.hoverRadius !== 'number') {
        console.warn('[seat14c] touch pointer options not found; hover radius not tuned');
        continue;
      }
      options.hoverRadius = TOUCH_HOVER_RADIUS;
    }
  }
}
