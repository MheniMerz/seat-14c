import {
  loadProgress,
  loadTasks,
  MILES_PER_MINUTE,
  Progress,
  saveProgress,
  saveTasks,
} from './storage.js';
import { Destination, destinationsBetween } from './route.js';

/** A 3-day streak earns the first seat upgrade: the Night flight cabin. */
export const NIGHT_UNLOCK_STREAK = 3;

export type FlightOutcome = 'done' | 'later';

export type FlightRecord = {
  outcome: FlightOutcome;
  focusMinutes: number;
  miles: number;
  /** Destinations reached on this flight; each stamps a postcard. */
  reached: Destination[];
  /** Cabin themes this flight unlocked. */
  unlocked: string[];
  progress: Progress;
};

/** Local calendar date as YYYY-MM-DD, so streaks follow the user's day. */
export function localDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function previousDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return localDate(new Date(y, m - 1, d - 1));
}

/**
 * The streak after a flight on `today`: unchanged for a second flight the
 * same day, +1 after a flight yesterday, otherwise a fresh 1.
 */
export function nextStreak(progress: Progress, today: string): number {
  if (progress.lastFlightDate === today) return Math.max(1, progress.streakDays);
  if (progress.lastFlightDate === previousDay(today)) return progress.streakDays + 1;
  return 1;
}

/**
 * Save a landed flight: miles for the focus time, the streak, and the task's
 * new status. Returns what the summary card shows.
 */
export function recordFlight(
  taskId: string | null,
  focusSeconds: number,
  outcome: FlightOutcome,
  now = new Date(),
): FlightRecord {
  const focusMinutes = Math.max(0, focusSeconds / 60);
  const miles = Math.round(focusMinutes * MILES_PER_MINUTE);
  const today = localDate(now);

  const progress = loadProgress();
  const reached = destinationsBetween(progress.totalMiles, progress.totalMiles + miles);
  progress.totalMiles += miles;
  for (const destination of reached) {
    if (!progress.postcards.includes(destination.name)) {
      progress.postcards.push(destination.name);
    }
  }
  progress.streakDays = nextStreak(progress, today);
  progress.lastFlightDate = today;
  const unlocked: string[] = [];
  if (progress.streakDays >= NIGHT_UNLOCK_STREAK && !progress.themes.includes('night')) {
    progress.themes.push('night');
    unlocked.push('night');
  }
  saveProgress(progress);

  if (taskId != null && outcome === 'done') {
    const tasks = loadTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (task != null) {
      task.status = 'done';
      saveTasks(tasks);
    }
  }

  return { outcome, focusMinutes, miles, reached, unlocked, progress };
}
