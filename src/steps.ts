import {
  createSystem,
  Entity,
  Group,
  Hovered,
  MeshBasicMaterial,
  PokeInteractable,
  Pressed,
  RayInteractable,
} from '@iwsdk/core';
import { playTick } from './audio.js';
import { StepRow } from './cabin-components.js';
import { CardSystem } from './cards.js';
import { flightPhase, FlightPhase, flightPlan } from './flight-state.js';
import { loadTasks, saveTasks, Subtask } from './storage.js';
import { createTextPanel, roundRect, TextPanel } from './text-panel.js';
import { TRAY_DEFAULTS, TraySystem } from './tray.js';

const deg = Math.PI / 180;

/**
 * Rows are 4 cm apart: about 4.5° at this distance. IWSDK's gaze picks the
 * target closest to the centre of its 5° cone, so neighbours stay apart.
 */
const ROW = { width: 0.16, height: 0.034, spacing: 0.04 };
/** Where the list stands in tray space: left of the Now stand. */
const PANEL = { x: -0.19, y: 0.035, z: -0.075, yawDeg: 20 };
/** Look at the card this long (s) to reveal the steps. */
const REVEAL_AFTER = 0.4;
/** Fade back after this long (s) without looking at the card or a step. */
const HIDE_AFTER = 4;
const FADED = 0.45;

/**
 * The active task's steps, beside the Now card during cruise. They sit
 * faded until the user looks at the card (or a step), then come forward.
 * Look + pinch, a hand ray, or a direct poke ticks a step; it is saved and
 * the card's "n/m steps" line updates.
 */
export class StepsSystem extends createSystem({
  rows: { required: [StepRow] },
  pressedRows: { required: [StepRow, Pressed] },
}) {
  private panel!: Entity;
  private panels = new Map<Entity, TextPanel>();
  private steps: Subtask[] = [];
  private time = 0;
  private cardHoverSince = -1;
  private lastAttention = -Infinity;
  private opacity = FADED;

  init(): void {
    const group = new Group();
    group.name = 'steps-panel';
    group.position.set(PANEL.x, PANEL.y, PANEL.z);
    // Upright (undo the tray tilt), then turned toward the user.
    group.rotation.set(-TRAY_DEFAULTS.tiltDeg * deg, PANEL.yawDeg * deg, 0);
    this.panel = this.world.createTransformEntity(group, {
      parent: this.world.getSystem(TraySystem)!.tray,
    });

    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        if (phase === FlightPhase.Cruise) this.buildRows();
        else this.clearRows();
      }),
      this.queries.pressedRows.subscribe('disqualify', (row) => {
        this.toggle(row.getValue(StepRow, 'index')!);
      }),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        stepsState: () => ({
          steps: this.steps.map((s) => `${s.done ? 'x' : ' '} ${s.title}`),
          opacity: +this.opacity.toFixed(2),
        }),
        tickStep: (index: number) => this.toggle(index),
      });
    }
  }

  update(delta: number): void {
    this.time += delta;
    if (this.steps.length === 0) return;

    const cards = this.world.getSystem(CardSystem)!;
    const card = cards.nowCard();
    const cardHovered = card != null && cards.isHovered(card);
    let rowHovered = false;
    for (const row of this.queries.rows.entities) {
      if (row.hasComponent(Hovered)) rowHovered = true;
    }

    if (cardHovered) {
      if (this.cardHoverSince < 0) this.cardHoverSince = this.time;
    } else {
      this.cardHoverSince = -1;
    }
    const revealed =
      (this.cardHoverSince >= 0 && this.time - this.cardHoverSince >= REVEAL_AFTER) ||
      rowHovered;
    if (revealed) this.lastAttention = this.time;

    const target = this.time - this.lastAttention < HIDE_AFTER ? 1 : FADED;
    this.opacity += (target - this.opacity) * Math.min(1, delta * 6);
    for (const panel of this.panels.values()) {
      (panel.mesh.material as MeshBasicMaterial).opacity = this.opacity;
    }
  }

  private toggle(index: number): void {
    const taskId = flightPlan.taskId.peek();
    if (taskId == null || flightPhase.peek() !== FlightPhase.Cruise) return;
    const tasks = loadTasks();
    const task = tasks.find((t) => t.id === taskId);
    const step = task?.subtasks[index];
    if (task == null || step == null) return;
    step.done = !step.done;
    saveTasks(tasks);
    this.steps = task.subtasks;
    this.lastAttention = this.time;
    playTick(step.done);
    for (const [row, panel] of this.panels) {
      if (row.getValue(StepRow, 'index') === index) drawRow(panel, step);
    }
    this.world.getSystem(CardSystem)!.refreshCard(taskId);
  }

  private buildRows(): void {
    this.clearRows();
    const taskId = flightPlan.taskId.peek();
    const task = loadTasks().find((t) => t.id === taskId);
    this.steps = task?.subtasks ?? [];
    this.opacity = FADED;
    this.lastAttention = -Infinity;
    const count = this.steps.length;
    this.steps.forEach((step, index) => {
      const panel = createTextPanel(`step-${index + 1}`, ROW.width, ROW.height, 4000);
      // First step on top.
      panel.mesh.position.set(0, (count - 1 - index) * ROW.spacing + ROW.height / 2, 0);
      drawRow(panel, step);
      const row = this.world.createTransformEntity(panel.mesh, { parent: this.panel });
      row.addComponent(StepRow, { index });
      row.addComponent(RayInteractable);
      row.addComponent(PokeInteractable);
      this.panels.set(row, panel);
    });
  }

  private clearRows(): void {
    for (const [row, panel] of this.panels) {
      (panel.mesh.material as MeshBasicMaterial).map?.dispose();
      row.dispose();
    }
    this.panels.clear();
    this.steps = [];
  }
}

function drawRow(panel: TextPanel, step: Subtask): void {
  panel.draw((ctx, w, h) => {
    ctx.fillStyle = step.done ? 'rgba(31, 52, 44, 0.92)' : 'rgba(20, 24, 42, 0.9)';
    roundRect(ctx, 0, 0, w, h, h / 2);
    ctx.fill();

    const box = h * 0.5;
    const bx = h * 0.3;
    const by = (h - box) / 2;
    ctx.lineWidth = 6;
    ctx.strokeStyle = step.done ? '#7dffa8' : '#a6aed0';
    roundRect(ctx, bx, by, box, box, 10);
    ctx.stroke();
    if (step.done) {
      ctx.beginPath();
      ctx.moveTo(bx + box * 0.2, by + box * 0.52);
      ctx.lineTo(bx + box * 0.42, by + box * 0.74);
      ctx.lineTo(bx + box * 0.8, by + box * 0.28);
      ctx.stroke();
    }

    ctx.fillStyle = step.done ? '#a6d9b8' : '#eef1fb';
    ctx.font = '600 52px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    let text = step.title;
    const maxWidth = w - bx - box - 60;
    while (ctx.measureText(text).width > maxWidth && text.length > 1) {
      text = `${text.slice(0, -2)}…`;
    }
    ctx.fillText(text, bx + box + 28, h / 2 + 2);
    if (step.done) {
      const width = ctx.measureText(text).width;
      ctx.fillRect(bx + box + 28, h / 2, width, 4);
    }
  });
}
