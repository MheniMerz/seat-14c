/**
 * On-device persistence for tasks and progress. Every read and write is
 * wrapped so a cleared, blocked or corrupt store starts fresh instead of
 * breaking the session.
 */

export type Subtask = { title: string; done: boolean };

export type Task = {
  id: string;
  title: string;
  subtasks: Subtask[];
  status: 'open' | 'done' | 'parked';
};

export type Progress = {
  version: 1;
  totalMiles: number; // 8 miles per focus minute, roughly jet cruise speed
  streakDays: number;
  lastFlightDate: string; // ISO date
  postcards: string[];
  themes: string[];
  settings: {
    gazeOnly: boolean;
    oneHand: boolean;
    highContrast: boolean;
    textSize: 'S' | 'M' | 'L';
    reduceMotion: boolean;
  };
};

export const MAX_TASKS = 3;
export const MILES_PER_MINUTE = 8;

const TASKS_KEY = 'seat14c.tasks.v1';
const PROGRESS_KEY = 'seat14c.progress.v1';

export function defaultProgress(): Progress {
  return {
    version: 1,
    totalMiles: 0,
    streakDays: 0,
    lastFlightDate: '',
    postcards: [],
    themes: [],
    settings: {
      gazeOnly: false,
      oneHand: false,
      highContrast: false,
      textSize: 'M',
      reduceMotion: false,
    },
  };
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch (error) {
    console.warn(`[seat14c] could not read ${key}, starting fresh`, error);
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[seat14c] could not save ${key}`, error);
    return false;
  }
}

function isTask(value: unknown): value is Task {
  const task = value as Task;
  return (
    task != null &&
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    Array.isArray(task.subtasks) &&
    (task.status === 'open' ||
      task.status === 'done' ||
      task.status === 'parked')
  );
}

export function newTaskId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadTasks(): Task[] {
  const stored = readJson(TASKS_KEY);
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored.filter(isTask);
}

export function saveTasks(tasks: Task[]): boolean {
  return writeJson(TASKS_KEY, tasks);
}

/** Tasks still waiting to be flown, in the order the user arranged them. */
export function loadOpenTasks(): Task[] {
  return loadTasks()
    .filter((task) => task.status === 'open')
    .slice(0, MAX_TASKS);
}

export function loadProgress(): Progress {
  const stored = readJson(PROGRESS_KEY) as Partial<Progress> | null;
  const fallback = defaultProgress();
  if (stored == null || stored.version !== 1) {
    return fallback;
  }
  return {
    ...fallback,
    ...stored,
    settings: { ...fallback.settings, ...stored.settings },
  };
}

export function saveProgress(progress: Progress): boolean {
  return writeJson(PROGRESS_KEY, progress);
}
