import { VisibilityState, World } from '@iwsdk/core';
import { unlockAudio } from './audio.js';
import { demoTimeScale, isDesktopEmulator } from './desktop-emulator.js';
import { drawPostcard } from './postcard-art.js';
import { nextDestination, ROUTE } from './route.js';
import {
  loadProgress,
  loadTasks,
  loadThoughts,
  MAX_TASKS,
  saveProgress,
  newTaskId,
  ParkedThought,
  saveTasks,
  saveThoughts,
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
  const thoughtsSection = root.querySelector<HTMLElement>('#thoughts')!;
  const thoughtList = root.querySelector<HTMLOListElement>('#thought-list')!;
  const emulatorNote = root.querySelector<HTMLElement>('#emulator-note')!;
  mountSettings(root);
  const renderPostcards = mountPostcards(root);
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
    renderPostcards();
    render();
  };

  const render = () => {
    list.replaceChildren(...tasks.map((task, index) => renderTask(task, index)));
    addButton.disabled = tasks.length >= MAX_TASKS;
    renderThoughts();
    updateBoard();
  };

  const namedTasks = () => tasks.filter((task) => task.title.trim() !== '');

  const renderThoughts = () => {
    const thoughts = loadThoughts();
    thoughtsSection.hidden = thoughts.length === 0;
    thoughtList.replaceChildren(
      ...thoughts.map((thought, index) => renderThought(thought, index)),
    );
  };

  const renderThought = (thought: ParkedThought, index: number): HTMLLIElement => {
    const item = document.createElement('li');
    item.className = 'thought';

    const when = document.createElement('p');
    when.className = 'thought-when';
    const time = new Date(thought.at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    when.textContent = thought.taskTitle
      ? `${time} · minute ${thought.minute} of “${thought.taskTitle}”`
      : `${time} · during a flight`;

    const note = document.createElement('input');
    note.type = 'text';
    note.className = 'thought-note';
    note.placeholder = 'What was it?';
    note.maxLength = 60;
    note.setAttribute('aria-label', `Parked thought ${index + 1}`);
    note.dataset.testid = `thought-note-${index + 1}`;

    const makeTask = document.createElement('button');
    makeTask.type = 'button';
    makeTask.className = 'secondary';
    makeTask.textContent = 'Make it a task';
    const full = () => namedTasks().length >= MAX_TASKS;
    makeTask.disabled = true;
    makeTask.title = full() ? 'Three tasks already; finish or remove one first.' : '';
    note.addEventListener('input', () => {
      makeTask.disabled = note.value.trim() === '' || full();
    });
    makeTask.addEventListener('click', () => {
      const title = note.value.trim();
      if (title === '' || full()) return;
      // Fill the blank first row rather than adding next to it.
      const blank = tasks.findIndex((task) => task.title.trim() === '');
      const task: Task = { id: newTaskId(), title, subtasks: [], status: 'open' };
      if (blank >= 0) tasks[blank] = task;
      else tasks.push(task);
      persist();
      dropThought(thought.id);
    });

    const letGo = document.createElement('button');
    letGo.type = 'button';
    letGo.className = 'secondary';
    letGo.textContent = 'Let it go';
    letGo.addEventListener('click', () => dropThought(thought.id));

    const actions = document.createElement('div');
    actions.className = 'thought-actions';
    actions.append(makeTask, letGo);
    item.append(when, note, actions);
    return item;
  };

  const dropThought = (id: string) => {
    saveThoughts(loadThoughts().filter((thought) => thought.id !== id));
    render();
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

/** Accessibility settings, saved with progress and applied on boarding. */
function mountSettings(root: HTMLElement): void {
  type Settings = ReturnType<typeof loadProgress>['settings'];
  const controls = root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '#settings [data-setting]',
  );
  const settings = loadProgress().settings;
  for (const control of controls) {
    const key = control.dataset.setting as keyof Settings;
    if (control instanceof HTMLInputElement) control.checked = settings[key] === true;
    else control.value = String(settings[key]);
    control.addEventListener('change', () => {
      const progress = loadProgress();
      const value = control instanceof HTMLInputElement ? control.checked : control.value;
      progress.settings = { ...progress.settings, [key]: value };
      saveProgress(progress);
    });
  }
  // Keep the panel open for anyone who has changed something.
  const changed = settings.gazeOnly || settings.oneHand || settings.highContrast ||
    settings.reduceMotion || settings.textSize !== 'M';
  root.querySelector<HTMLDetailsElement>('#settings')!.open = changed;
}

/**
 * The postcard collection: one card per destination, collected ones painted,
 * the rest as blank outlines with their distance. Shown once anything has
 * been flown. Below it, the cabin choice, which unlocks with a 3-day streak.
 */
function mountPostcards(root: HTMLElement): () => void {
  const section = root.querySelector<HTMLElement>('#postcards')!;
  const heading = root.querySelector<HTMLElement>('#postcards-heading')!;
  const list = root.querySelector<HTMLOListElement>('#postcard-list')!;
  const cabin = root.querySelector<HTMLSelectElement>('#cabin')!;
  const hint = root.querySelector<HTMLElement>('#cabin-hint')!;
  const destinations = ROUTE.slice(1);

  cabin.addEventListener('change', () => {
    const progress = loadProgress();
    progress.cabinTheme = cabin.value === 'night' ? 'night' : 'day';
    saveProgress(progress);
  });

  return () => {
    const progress = loadProgress();
    section.hidden = progress.totalMiles <= 0 && progress.postcards.length === 0;
    heading.textContent =
      `Postcards · ${progress.postcards.length} of ${destinations.length}`;
    list.replaceChildren(
      ...destinations.map((destination) => {
        const item = document.createElement('li');
        const collected = progress.postcards.includes(destination.name);
        item.className = collected ? 'postcard' : 'postcard locked';
        item.dataset.destination = destination.name;
        if (collected) {
          const canvas = document.createElement('canvas');
          canvas.width = 300;
          canvas.height = 200;
          drawPostcard(canvas.getContext('2d')!, 300, 200, destination.name, destination.miles);
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `Postcard from ${destination.name}`);
          item.append(canvas);
        } else {
          const left = destination.miles - progress.totalMiles;
          item.textContent = `${destination.name} · ${left.toLocaleString()} mi to go`;
        }
        return item;
      }),
    );

    const night = cabin.querySelector<HTMLOptionElement>('option[value="night"]')!;
    const unlocked = progress.themes.includes('night');
    night.disabled = !unlocked;
    night.textContent = unlocked ? 'Night flight' : 'Night flight (locked)';
    cabin.value = unlocked && progress.cabinTheme === 'night' ? 'night' : 'day';
    hint.textContent = unlocked
      ? 'Walnut tray and a warm reading light. Earned with a 3-day streak.'
      : `A 3-day streak unlocks the Night flight cabin (now ${progress.streakDays}).`;
  };
}
