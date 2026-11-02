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
  /** The boarding-pass tutorial has been completed once. */
  boardingDone: boolean;
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
    boardingDone: false,
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

/**
 * A stray thought parked in the jar mid-flight. Nothing is typed in the
 * cabin, so it holds only when and during which task; the user writes down
 * what it was on the check-in page after landing.
 */
export type ParkedThought = {
  id: string;
  /** ISO time it was parked. */
  at: string;
  /** Title of the task being flown, or '' if none. */
  taskTitle: string;
  /** Whole focus minutes into the flight. */
  minute: number;
};

const THOUGHTS_KEY = 'seat14c.thoughts.v1';

function isThought(value: unknown): value is ParkedThought {
  const thought = value as ParkedThought;
  return (
    thought != null &&
    typeof thought.id === 'string' &&
    typeof thought.at === 'string' &&
    typeof thought.taskTitle === 'string' &&
    typeof thought.minute === 'number'
  );
}

export function loadThoughts(): ParkedThought[] {
  const stored = readJson(THOUGHTS_KEY);
  return Array.isArray(stored) ? stored.filter(isThought) : [];
}

export function saveThoughts(thoughts: ParkedThought[]): boolean {
  return writeJson(THOUGHTS_KEY, thoughts);
}

export function parkThought(taskTitle: string, minute: number): ParkedThought {
  const thought: ParkedThought = {
    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    taskTitle,
    minute,
  };
  saveThoughts([...loadThoughts(), thought]);
  return thought;
}
