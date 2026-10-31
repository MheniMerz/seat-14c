import { createSystem, VisibilityState } from '@iwsdk/core';
import { duckEngines, startEngines, stopEngines } from './audio.js';
import { flightPhase, FlightPhase } from './flight-state.js';

/**
 * The cabin soundscape follows the flight: engines spool up at takeoff, hum
 * through cruise, duck while a system menu is open, and spool down on
 * landing (when the seat-belt chime plays) or on leaving the session.
 */
export class SoundscapeSystem extends createSystem({}) {
  init(): void {
    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        if (phase === FlightPhase.Cruise) startEngines();
        else stopEngines();
      }),
      this.world.visibilityState.subscribe((state) => {
        duckEngines(state === VisibilityState.VisibleBlurred);
      }),
      () => stopEngines(),
    );
  }
}
