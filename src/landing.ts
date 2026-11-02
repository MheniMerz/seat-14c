import { drawPostcard } from './postcard-art.js';
import { INK } from './accessibility.js';
import {
  BoxGeometry,
  CanvasTexture,
  createSystem,
  Entity,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PokeInteractable,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playSeatbeltChime } from './audio.js';
import { DoneStack, LandingAction, LandingButton } from './cabin-components.js';
import { CardSystem, DONE_STACK_TOP } from './cards.js';
import { PALETTE, roundedSlabGeometry, slabFace, slabMesh } from './models.js';
import {
  flightClock,
  flightOutcome,
  flightPhase,
  FlightPhase,
  flightPlan,
  setFlightPhase,
  windDownStep,
} from './flight-state.js';
import { JarSystem } from './jar.js';
import { FlightRecord, recordFlight } from './progress.js';
import { loadOpenTasks } from './storage.js';
import { createTextPanel, roundRect, TextPanel } from './text-panel.js';
import { TRAY_LAYOUT, TraySystem } from './tray.js';

export const BUTTON = { width: 0.12, height: 0.014, depth: 0.045 };
/** Summary buttons sit this far apart so gaze can tell them apart. */
const SUMMARY_BUTTON_SPACING = 0.15;

type Action = (typeof LandingAction)[keyof typeof LandingAction];

/**
 * Landing and the summary card. When the clock runs out the chime plays and
 * the user drops the active card on the Done stack (or looks at it and
 * pinches), or puts it back in the pocket with "Not yet". The flight is then
 * saved as miles and streak, and a summary card offers another flight.
 */
export class LandingSystem extends createSystem({
  doneStacks: { required: [DoneStack] },
  pressedStack: { required: [DoneStack, Pressed] },
  buttons: { required: [LandingButton] },
  pressedButtons: { required: [LandingButton, Pressed] },
}) {
  lastRecord: FlightRecord | null = null;
  private tray!: TraySystem;
  private stackTop!: MeshStandardMaterial;
  private summary!: TextPanel;
  private summaryEntity!: Entity;
  private postcard!: TextPanel;
  private head = new Vector3();
  private forward = new Vector3();

  init(): void {
    this.tray = this.world.getSystem(TraySystem)!;
    this.buildDoneStack();
    this.buildLaterButton();
    this.buildSummary();
    this.buildPostcard();

    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        // The landing instruction shows on the seat-back screen.
        if (phase === FlightPhase.Landing) playSeatbeltChime();
        this.onPhase(phase);
      }),
      flightOutcome.subscribe((outcome) => {
        if (outcome == null) return;
        this.lastRecord = recordFlight(
          flightPlan.taskId.peek(),
          flightClock.elapsed.peek(),
          outcome,
        );
        windDownStep.value = 'breathe';
        setFlightPhase(FlightPhase.WindDown);
      }),
      windDownStep.subscribe(() => this.onPhase(flightPhase.peek())),
      this.queries.pressedStack.subscribe('disqualify', () => {
        if (flightPhase.peek() === FlightPhase.Landing) this.cards().land('done');
      }),
      this.queries.pressedButtons.subscribe('disqualify', (button) => {
        this.act(button.getValue(LandingButton, 'action') as Action);
      }),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        lastRecord: () => this.lastRecord,
        landingAction: (action: Action) => this.act(action),
        landingButtons: () =>
          [...this.queries.buttons.entities].map((b) => ({
            name: b.object3D!.name,
            visible: b.object3D!.visible,
            interactable: b.hasComponent(RayInteractable),
          })),
      });
    }
  }

  update(delta: number): void {
    const k = Math.min(1, delta * 14);
    for (const button of this.queries.buttons.entities) {
      const face = slabFace(button.object3D as Mesh);
      const glow = button.hasComponent(Pressed) ? 0.45 : button.hasComponent(Hovered) ? 0.22 : 0;
      face.emissiveIntensity += (glow - face.emissiveIntensity) * k;
    }
    for (const stack of this.queries.doneStacks.entities) {
      const landing = flightPhase.peek() === FlightPhase.Landing;
      const glow = !landing
        ? 0
        : stack.hasComponent(Pressed)
          ? 0.6
          : stack.hasComponent(Hovered)
            ? 0.4
            : 0.15;
      this.stackTop.emissiveIntensity += (glow - this.stackTop.emissiveIntensity) * k;
    }
  }

  private cards(): CardSystem {
    return this.world.getSystem(CardSystem)!;
  }

  private act(action: Action): void {
    const phase = flightPhase.peek();
    if (action === LandingAction.Later && phase === FlightPhase.Landing) {
      this.cards().land('later');
    } else if (action === LandingAction.Again && phase === FlightPhase.WindDown) {
      flightOutcome.value = null;
      flightPlan.taskId.value = null;
      flightPlan.minutes.value = 0;
      flightClock.elapsed.value = 0;
      setFlightPhase(FlightPhase.Preflight);
    } else if (action === LandingAction.Finish && phase === FlightPhase.WindDown) {
      this.world.exitXR();
    }
  }

  private onPhase(phase: FlightPhase): void {
    const landing = phase === FlightPhase.Landing;
    // The summary waits for the breathing guide to finish.
    const windDown = phase === FlightPhase.WindDown && windDownStep.peek() === 'summary';

    for (const stack of this.queries.doneStacks.entities) {
      setInteractable(stack, landing, false);
    }
    const anotherFlight = windDown && loadOpenTasks().length > 0;
    for (const button of this.queries.buttons.entities) {
      const action = button.getValue(LandingButton, 'action');
      const show =
        action === LandingAction.Later
          ? landing
          : action === LandingAction.Again
            ? anotherFlight
            : windDown;
      button.object3D!.visible = show;
      setInteractable(button, show, true);
    }

    const reached = this.lastRecord?.reached ?? [];
    const newest = reached[reached.length - 1];
    this.postcard.mesh.visible = windDown && newest != null;
    if (windDown && newest != null) {
      drawPostcardPanel(this.postcard, newest.name, newest.miles);
    }
    if (windDown && this.lastRecord != null) {
      this.drawSummary(this.lastRecord, anotherFlight);
      // Slightly above eye line so its buttons hang clear of the Now stand.
      this.placeAboveTray(this.summaryEntity, -0.06);
    }
    this.summaryEntity.object3D!.visible = windDown;
  }

  /** Float a panel in front of the head, facing it, clear of the Now stand. */
  placeAboveTray(entity: Entity, dropBelowEyes: number): void {
    this.tray.getHeadPosition(this.head);
    this.player.head.getWorldDirection(this.forward).negate();
    this.forward.y = 0;
    this.forward.normalize();
    const object = entity.object3D!;
    object.position.copy(this.head).addScaledVector(this.forward, 0.55);
    object.position.y = this.head.y - dropBelowEyes;
    object.lookAt(this.head);
  }

  private drawSummary(record: FlightRecord, anotherFlight: boolean): void {
    const { progress } = record;
    this.summary.draw((ctx, w, h) => {
      ctx.fillStyle = INK.panel;
      roundRect(ctx, 0, 0, w, h, 40);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      ctx.fillStyle = INK.accent;
      ctx.font = '600 30px system-ui, sans-serif';
      ctx.fillText(
        record.outcome === 'done' ? 'TASK DONE' : 'SAVED FOR NEXT FLIGHT',
        w / 2,
        70,
      );
      ctx.fillStyle = INK.text;
      ctx.font = '700 92px system-ui, sans-serif';
      ctx.fillText(`+${record.miles.toLocaleString()} miles`, w / 2, 175);
      ctx.fillStyle = INK.muted;
      ctx.font = '500 32px system-ui, sans-serif';
      const parked = this.world.getSystem(JarSystem)?.parkedThisFlight ?? 0;
      ctx.fillText(
        `${Math.round(record.focusMinutes)} min of focus` +
          (parked > 0 ? ` · ${parked} thought${parked > 1 ? 's' : ''} in the jar` : ''),
        w / 2,
        235,
      );
      ctx.fillText(
        `${progress.totalMiles.toLocaleString()} miles total · ${progress.streakDays}-day streak`,
        w / 2,
        285,
      );
      ctx.fillStyle = INK.text;
      const reached = record.reached[record.reached.length - 1];
      ctx.fillText(
        record.unlocked.includes('night')
          ? `${progress.streakDays}-day streak: Night flight cabin unlocked!`
          : reached
          ? `Reached ${reached.name}. Postcard on your tray.`
          : anotherFlight
            ? 'Fly again, or finish for today.'
            : 'All tasks flown. See you tomorrow.',
        w / 2,
        345,
      );
    });
  }

  /** The new postcard stands on the Now stand while the summary shows. */
  private buildPostcard(): void {
    this.postcard = createTextPanel('summary-postcard', 0.15, 0.1, 3000);
    const stand = this.tray.tray.object3D!.getObjectByName('now-stand')!;
    // Lying on the stand's plate, just above the card that was there.
    this.postcard.mesh.rotation.x = -Math.PI / 2;
    this.postcard.mesh.position.set(0, 0.004, 0);
    this.postcard.mesh.visible = false;
    stand.add(this.postcard.mesh);
  }

  private buildDoneStack(): void {
    const group = new Group();
    group.name = 'done-stack';
    const [x, , z] = TRAY_LAYOUT.done.position;
    group.position.set(x, 0, z);
    this.stackTop = new MeshStandardMaterial({
      color: PALETTE.done,
      roughness: 0.7,
      emissive: PALETTE.doneGlow,
      emissiveIntensity: 0,
    });
    const base = new Mesh(roundedSlabGeometry(0.11, 0.075, DONE_STACK_TOP * 2, 0.01), this.stackTop);
    base.name = 'done-base';
    group.add(base);
    const label = createTextPanel('done-label', 0.1, 0.03);
    label.draw((ctx, w, h) => {
      ctx.fillStyle = '#eef1fb';
      ctx.font = '700 40px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓ DONE', w / 2, h / 2);
    });
    label.mesh.rotation.x = -Math.PI / 2;
    label.mesh.position.set(0, DONE_STACK_TOP + 0.0005, 0.05);
    group.add(label.mesh);
    // Just past the stack's edges, clear of the Lower button beside it.
    const hit = new Mesh(
      new BoxGeometry(0.115, 0.03, 0.08),
      new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    hit.name = 'done-hit';
    hit.position.y = 0.015;
    hit.pointerEventsType = { deny: 'grab' };
    group.add(hit);
    const stack = this.world.createTransformEntity(group, { parent: this.tray.tray });
    stack.addComponent(DoneStack);
  }

  private buildLaterButton(): void {
    const mesh = buttonMesh('landing-later', 'Not yet');
    mesh.position.set(0, TRAY_LAYOUT.surfaceY + BUTTON.height / 2, TRAY_LAYOUT.cardRowZ);
    const button = this.world.createTransformEntity(mesh, { parent: this.tray.tray });
    button.addComponent(LandingButton, { action: LandingAction.Later });
    mesh.visible = false;
  }

  private buildSummary(): void {
    this.summary = createTextPanel('summary-card', 0.36, 0.19);
    this.summaryEntity = this.world.createTransformEntity(this.summary.mesh);
    this.summary.mesh.visible = false;

    // Buttons hang under the card, facing the user with it.
    for (const [action, label, x] of [
      [LandingAction.Again, 'Fly again', -SUMMARY_BUTTON_SPACING / 2],
      [LandingAction.Finish, 'Finish', SUMMARY_BUTTON_SPACING / 2],
    ] as const) {
      const mesh = buttonMesh(`summary-${action}`, label);
      // Stand the button up so its face (+Y) points at the user (+Z).
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, -0.095 - BUTTON.depth / 2 - 0.01, 0.01);
      mesh.visible = false;
      const button = this.world.createTransformEntity(mesh, { parent: this.summaryEntity });
      button.addComponent(LandingButton, { action });
    }
  }
}

/** A labelled cabin button: a rounded slab whose top face carries the text. */
export function buttonMesh(name: string, label: string): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 144;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#eef1fb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#14182a';
  ctx.font = '700 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const side = new MeshStandardMaterial({ color: PALETTE.buttonEdge, roughness: 0.6 });
  const face = new MeshStandardMaterial({
    map: texture,
    roughness: 0.6,
    emissive: 0xffffff,
    emissiveIntensity: 0,
  });
  return slabMesh(
    name,
    { width: BUTTON.width, depth: BUTTON.depth, thickness: BUTTON.height, radius: 0.01 },
    face,
    side,
  );
}

/** Hidden targets must not catch gaze or pokes, so drop the components. */
function setInteractable(entity: Entity, enabled: boolean, poke: boolean): void {
  if (enabled && !entity.hasComponent(RayInteractable)) {
    entity.addComponent(RayInteractable);
    if (poke) entity.addComponent(PokeInteractable);
  } else if (!enabled && entity.hasComponent(RayInteractable)) {
    entity.removeComponent(RayInteractable);
    if (entity.hasComponent(PokeInteractable)) entity.removeComponent(PokeInteractable);
  }
}

function drawPostcardPanel(panel: TextPanel, name: string, miles: number): void {
  if (panel.mesh.userData.destination === name) return;
  panel.mesh.userData.destination = name;
  panel.draw((ctx, w, h) => drawPostcard(ctx, w, h, name, miles));
}
