import { createSystem, signal, VisibilityState } from '@iwsdk/core';
import type { FlightOutcome } from './progress.js';

/**
 * One "flight" is the whole session loop. `checkin` is the 2D page; the other
 * six phases run inside the immersive passthrough session.
 */
export const FlightPhase = {
  CheckIn: 'checkin',
  Calibrating: 'calibrating',
  Boarding: 'boarding',
  Preflight: 'preflight',
  Cruise: 'cruise',
  Landing: 'landing',
  WindDown: 'winddown',
} as const;

export type FlightPhase = (typeof FlightPhase)[keyof typeof FlightPhase];

export const IMMERSIVE_PHASES: readonly FlightPhase[] = [
  FlightPhase.Calibrating,
  FlightPhase.Boarding,
  FlightPhase.Preflight,
  FlightPhase.Cruise,
  FlightPhase.Landing,
  FlightPhase.WindDown,
];

/** Current phase. Other systems subscribe to it to enable or hide themselves. */
export const flightPhase = signal<FlightPhase>(FlightPhase.CheckIn);

/** Flight lengths the dial snaps to, in minutes. */
export const FLIGHT_LENGTHS = [5, 10, 25, 45] as const;

/** What the user has chosen for the current flight. */
export const flightPlan = {
  /** Task in the Now slot, or null. */
  taskId: signal<string | null>(null),
  /** Chosen length in minutes, or 0 until the dial is set. */
  minutes: signal(0),
};

/** Clock for the current flight; written by the flight timer. */
export const flightClock = {
  /** Focus seconds elapsed in cruise. */
  elapsed: signal(0),
  paused: signal(false),
};

/** How the active task ended, set once on landing; null before that. */
export const flightOutcome = signal<FlightOutcome | null>(null);

export function resetFlightPlan(): void {
  flightOutcome.value = null;
  flightPlan.taskId.value = null;
  flightPlan.minutes.value = 0;
  flightClock.elapsed.value = 0;
  flightClock.paused.value = false;
}

export function setFlightPhase(phase: FlightPhase): void {
  if (flightPhase.peek() !== phase) {
    flightPhase.value = phase;
  }
}

/**
 * Owns the phase signal's link to the XR session: leaving XR always returns
 * to check-in, and entering XR always starts at seat calibration.
 */
export class FlightSystem extends createSystem({}) {
  init(): void {
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.NonImmersive) {
          setFlightPhase(FlightPhase.CheckIn);
        } else if (flightPhase.peek() === FlightPhase.CheckIn) {
          resetFlightPlan();
          setFlightPhase(FlightPhase.Calibrating);
        }
      }),
    );

    if (import.meta.env.DEV) {
      this.installDebugControls();
    }
  }

  /** Keys 1–6 jump between immersive phases; `window.seat14c` drives tests. */
  private installDebugControls(): void {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) {
        return;
      }
      const index = Number(event.key) - 1;
      const phase = IMMERSIVE_PHASES[index];
      if (phase != null && flightPhase.peek() !== FlightPhase.CheckIn) {
        setFlightPhase(phase);
      }
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));

    const debug = document.createElement('div');
    debug.id = 'flight-debug';
    document.body.appendChild(debug);
    this.cleanupFuncs.push(
      () => debug.remove(),
      flightPhase.subscribe((phase) => {
        debug.hidden = phase === FlightPhase.CheckIn;
        debug.textContent = IMMERSIVE_PHASES.map(
          (p, i) => (p === phase ? `[${i + 1} ${p}]` : `${i + 1} ${p}`),
        ).join('  ');
      }),
    );

    (window as unknown as { seat14c: object }).seat14c = {
      get phase() {
        return flightPhase.peek();
      },
      setPhase: setFlightPhase,
      phases: IMMERSIVE_PHASES,
      world: this.world,
      plan: () => ({
        taskId: flightPlan.taskId.peek(),
        minutes: flightPlan.minutes.peek(),
        elapsed: +flightClock.elapsed.peek().toFixed(2),
      }),
    };
  }
}
