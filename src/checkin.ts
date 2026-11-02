import { VisibilityState, World } from '@iwsdk/core';
import { unlockAudio } from './audio.js';
import { demoTimeScale, isDesktopEmulator } from './desktop-emulator.js';
import { nextDestination } from './route.js';
import {
  loadProgress,
  loadTasks,
  MAX_TASKS,
  newTaskId,
  saveTasks,
  Task,
} from './storage.js';

/**
 * The 2D check-in page. Typing happens here, with the system keyboard, so
 * the immersive session never needs text entry. It only reads and writes
 * storage; the 3D world loads tasks from storage when it needs them.
 */
export function mountCheckIn(world: World): void {
  const root = document.getElementById('checkin') as HTMLElement;
  const list = root.querySelector<HTMLOListElement>('#task-list')!;
  const addButton = root.querySelector<HTMLButtonElement>('#add-task')!;
  const boardButton = root.querySelector<HTMLButtonElement>('#board')!;
  const status = root.querySelector<HTMLElement>('#board-status')!;
  const stats = root.querySelector<HTMLElement>('#stats')!;
  const emulatorNote = root.querySelector<HTMLElement>('#emulator-note')!;
  emulatorNote.hidden = !isDesktopEmulator();
  if (demoTimeScale() > 1) {
    emulatorNote.querySelector('.demo-hint')!.textContent =
      'Demo mode: flights run ten times faster.';
  }

  // Finished and parked tasks are kept for history; only open ones are shown.
  let archived: Task[] = [];
  let tasks: Task[] = [];
  let xrSupported = false;

  const persist = () => saveTasks([...tasks, ...archived]);

  const reload = () => {
    const all = loadTasks();
    tasks = all.filter((task) => task.status === 'open').slice(0, MAX_TASKS);
    archived = all.filter((task) => !tasks.includes(task));
    const progress = loadProgress();
    const next = nextDestination(progress.totalMiles);
    stats.textContent =
      progress.totalMiles > 0
        ? `${progress.totalMiles.toLocaleString()} miles flown · ${progress.streakDays}-day streak` +
          (next ? ` · next stop ${next.name}` : '')
        : 'First flight. Add up to three things to finish.';
    if (tasks.length === 0) {
      tasks.push(emptyTask());
    }
    render();
  };

  const render = () => {
    list.replaceChildren(...tasks.map((task, index) => renderTask(task, index)));
    addButton.disabled = tasks.length >= MAX_TASKS;
    updateBoard();
  };

  const updateBoard = () => {
    const ready = tasks.some((task) => task.title.trim() !== '');
    boardButton.disabled = !ready || !xrSupported;
    status.textContent = !xrSupported
      ? 'Open this page in your headset browser to board.'
      : ready
        ? ''
        : 'Name at least one task to board.';
  };

  const renderTask = (task: Task, index: number): HTMLLIElement => {
    const item = document.createElement('li');
    item.className = 'task';

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'task-title';
    title.placeholder = `Task ${index + 1}`;
    title.maxLength = 60;
    title.value = task.title;
    title.setAttribute('aria-label', `Task ${index + 1}`);
    title.dataset.testid = `task-title-${index + 1}`;
    title.addEventListener('input', () => {
      task.title = title.value;
      persist();
      updateBoard();
    });

    const steps = document.createElement('textarea');
    steps.className = 'task-steps';
    steps.placeholder = 'Optional steps, one per line';
    steps.rows = 2;
    steps.value = task.subtasks.map((s) => s.title).join('\n');
    steps.setAttribute('aria-label', `Steps for task ${index + 1}`);
    steps.dataset.testid = `task-steps-${index + 1}`;
    steps.addEventListener('input', () => {
      const previous = new Map(task.subtasks.map((s) => [s.title, s.done]));
      task.subtasks = steps.value
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .slice(0, 5)
        .map((line) => ({ title: line, done: previous.get(line) ?? false }));
      persist();
    });

    const controls = document.createElement('div');
    controls.className = 'task-controls';
    controls.append(
      iconButton('↑', `Move task ${index + 1} up`, index === 0, () =>
        move(index, -1),
      ),
      iconButton('↓', `Move task ${index + 1} down`, index === tasks.length - 1, () =>
        move(index, 1),
      ),
      iconButton('×', `Remove task ${index + 1}`, false, () => remove(index)),
    );

    item.append(title, controls, steps);
    return item;
  };

  const move = (index: number, offset: number) => {
    const target = index + offset;
    [tasks[index], tasks[target]] = [tasks[target], tasks[index]];
    persist();
    render();
  };

  const remove = (index: number) => {
    tasks.splice(index, 1);
    if (tasks.length === 0) {
      tasks.push(emptyTask());
    }
    persist();
    render();
  };

  addButton.addEventListener('click', () => {
    if (tasks.length >= MAX_TASKS) {
      return;
    }
    tasks.push(emptyTask());
    render();
    list.querySelector<HTMLInputElement>('li:last-child .task-title')?.focus();
  });

  boardButton.addEventListener('click', () => {
    // Drop blank rows before boarding so the tray only shows real cards.
    tasks = tasks.filter((task) => task.title.trim() !== '');
    tasks.forEach((task) => (task.title = task.title.trim()));
    persist();
    unlockAudio();
    world.launchXR();
  });

  world.visibilityState.subscribe((state) => {
    const is2D = state === VisibilityState.NonImmersive;
    root.hidden = !is2D;
    if (is2D) {
      reload();
    }
  });

  if (world.xrEnabled && navigator.xr != null) {
    navigator.xr
      .isSessionSupported('immersive-ar')
      .then((supported) => {
        xrSupported = supported;
        updateBoard();
      })
      .catch(() => updateBoard());
  }

  reload();
}

function emptyTask(): Task {
  return { id: newTaskId(), title: '', subtasks: [], status: 'open' };
}

function iconButton(
  label: string,
  ariaLabel: string,
  disabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.textContent = label;
  button.disabled = disabled;
  button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', onClick);
  return button;
}
