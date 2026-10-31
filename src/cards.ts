import {
  BoxGeometry,
  createSystem,
  Entity,
  Euler,
  Grabbed,
  Group,
  Hovered,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OneHandGrabbable,
  Pressed,
  Quaternion,
  RayInteractable,
  Vector3,
} from '@iwsdk/core';
import { CardBody, CardPlace, TaskCard } from './cabin-components.js';
import { CARD_SIZE, createCardTexture } from './card-texture.js';
import {
  flightOutcome,
  flightPhase,
  FlightPhase,
  flightPlan,
} from './flight-state.js';
import type { FlightOutcome } from './progress.js';
import { loadOpenTasks } from './storage.js';
import { TRAY_LAYOUT, TraySystem } from './tray.js';

/** A released card this close to the Now slot (metres) snaps into it. */
const NOW_SNAP_RADIUS = 0.09;
/** Released behind this line (tray-space Z) means "put it in the pocket". */
const POCKET_DROP_Z = -0.12;
/** A press that ends this soon after a grab release is not a look + pinch. */
const PRESS_AFTER_GRAB_GRACE = 0.3;
/** Easing rate toward a card's resting pose, per second. */
const EASE_RATE = 14;
/** On landing, a card released this close to the Done stack finishes it. */
const DONE_SNAP_RADIUS = 0.08;
/** Height of the Done stack's tray-space top surface, and card size on it. */
export const DONE_STACK_TOP = TRAY_LAYOUT.surfaceY + 0.008;
const DONE_CARD_SCALE = 0.8;
/** The invisible ray/gaze hit area extends this far past the card edges. */
const HIT_MARGIN = 0.015;

const deg = Math.PI / 180;
const FACE_INDEX = 2; // BoxGeometry material order: +x, -x, +y (face), -y, +z, -z

/**
 * Task cards on the tray. Each card works with a direct pinch-grab (drop it
 * on the Now stand) or a look + pinch (it flies to the stand). Choosing a
 * card sends the others into the seat pocket; any card can be picked back
 * out of the pocket to swap.
 *
 * A card is two entities: the TaskCard root carries the ray/gaze hit area
 * and the resting pose; its CardBody child is the visible, grabbable mesh.
 */
export class CardSystem extends createSystem({
  cards: { required: [TaskCard] },
  bodies: { required: [CardBody] },
  heldBodies: { required: [CardBody, Grabbed] },
  pressed: { required: [TaskCard, Pressed] },
}) {
  private tray!: Entity;
  private lastPhase: FlightPhase = FlightPhase.CheckIn;
  private time = 0;
  private releasedAt = new Map<Entity, number>();
  private euler = new Euler();
  private quat = new Quaternion();
  private vec = new Vector3();
  private matrix = new Matrix4();
  private scale = new Vector3();

  init(): void {
    this.tray = this.world.getSystem(TraySystem)!.tray;

    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        if (phase === FlightPhase.CheckIn) {
          this.disposeCards();
        } else if (phase === FlightPhase.Preflight) {
          // A new flight after landing deals a fresh hand of open tasks.
          if (this.lastPhase === FlightPhase.WindDown) this.disposeCards();
          if (this.queries.cards.entities.size === 0) this.spawnCards();
        }
        this.lastPhase = phase;
      }),
      this.queries.heldBodies.subscribe('qualify', (body) => {
        this.cardOf(body)?.setValue(TaskCard, 'held', true);
      }),
      this.queries.heldBodies.subscribe('disqualify', (body) => {
        const card = this.cardOf(body);
        if (card == null) return;
        card.setValue(TaskCard, 'held', false);
        this.releasedAt.set(card, this.time);
        this.adoptBodyPose(card, body);
        this.onRelease(card);
      }),
      this.queries.pressed.subscribe('disqualify', (card) => {
        const released = this.releasedAt.get(card) ?? -Infinity;
        if (
          card.getValue(TaskCard, 'held') ||
          this.time - released < PRESS_AFTER_GRAB_GRACE
        ) {
          return;
        }
        if (flightPhase.peek() === FlightPhase.Preflight) this.choose(card);
      }),
    );

    if (import.meta.env.DEV) {
      this.installDebugHooks();
    }
  }

  update(delta: number): void {
    this.time += delta;
    const k = 1 - Math.exp(-delta * EASE_RATE);

    for (const card of this.queries.cards.entities) {
      if (card.getValue(TaskCard, 'held')) continue;
      const object = card.object3D!;
      const p = card.getVectorView(TaskCard, 'targetPosition');
      const r = card.getVectorView(TaskCard, 'targetRotation');
      const s = card.getValue(TaskCard, 'targetScale')!;
      this.vec.set(p[0], p[1], p[2]);
      object.position.lerp(this.vec, k);
      this.quat.set(r[0], r[1], r[2], r[3]);
      object.quaternion.slerp(this.quat, k);
      object.scale.setScalar(object.scale.x + (s - object.scale.x) * k);
    }

    for (const body of this.queries.bodies.entities) {
      const card = this.cardOf(body);
      const face = faceMaterial(body);
      const target =
        card?.hasComponent(Pressed) === true
          ? 0.35
          : card?.hasComponent(Hovered) === true ||
              body.hasComponent(Hovered) ||
              body.hasComponent(Grabbed)
            ? 0.18
            : 0;
      face.emissiveIntensity += (target - face.emissiveIntensity) * k;
    }
  }

  /** Put `card` on the Now stand; whatever was there goes to the pocket. */
  choose(card: Entity): void {
    for (const other of this.queries.cards.entities) {
      if (other === card) continue;
      const place = other.getValue(TaskCard, 'place');
      if (place === CardPlace.Now || place === CardPlace.Tray) {
        other.setValue(TaskCard, 'place', CardPlace.Pocket);
      }
    }
    card.setValue(TaskCard, 'place', CardPlace.Now);
    flightPlan.taskId.value = card.getValue(TaskCard, 'taskId')!;
    this.relayout();
  }

  /**
   * End the flight for the card on the Now stand: onto the Done stack, or
   * back into the pocket for another flight. Sets {@link flightOutcome}.
   */
  land(outcome: FlightOutcome): void {
    if (flightOutcome.peek() != null) return;
    for (const card of this.queries.cards.entities) {
      if (card.getValue(TaskCard, 'place') === CardPlace.Now) {
        card.setValue(
          TaskCard,
          'place',
          outcome === 'done' ? CardPlace.Done : CardPlace.Pocket,
        );
      }
    }
    this.relayout();
    flightOutcome.value = outcome;
  }

  private onRelease(card: Entity): void {
    const phase = flightPhase.peek();
    const position = card.object3D!.position;
    if (phase === FlightPhase.Landing) {
      if (card.getValue(TaskCard, 'place') === CardPlace.Now) {
        const [dx, dy, dz] = TRAY_LAYOUT.done.position;
        this.vec.set(dx, dy, dz);
        if (position.distanceTo(this.vec) < DONE_SNAP_RADIUS) {
          this.land('done');
          return;
        }
        if (position.z < POCKET_DROP_Z) {
          this.land('later');
          return;
        }
      }
      this.relayout();
      return;
    }
    if (phase !== FlightPhase.Preflight) {
      // The plan is locked after takeoff; anything moved eases back.
      this.relayout();
      return;
    }
    const [nx, ny, nz] = TRAY_LAYOUT.now.position;
    this.vec.set(nx, ny, nz);
    if (position.z < POCKET_DROP_Z) {
      if (card.getValue(TaskCard, 'place') === CardPlace.Now) {
        flightPlan.taskId.value = null;
      }
      card.setValue(TaskCard, 'place', CardPlace.Pocket);
    } else if (position.distanceTo(this.vec) < NOW_SNAP_RADIUS) {
      this.choose(card);
      return;
    }
    // Anywhere else: ease back to where it was.
    this.relayout();
  }

  /**
   * The grab moved the body inside the card root. Move the root to where
   * the body was let go, in tray space, and put the body back at its origin.
   */
  private adoptBodyPose(card: Entity, body: Entity): void {
    const root = card.object3D!;
    const mesh = body.object3D!;
    this.tray.object3D!.updateWorldMatrix(true, false);
    mesh.updateWorldMatrix(true, false);
    this.matrix
      .copy(this.tray.object3D!.matrixWorld)
      .invert()
      .multiply(mesh.matrixWorld);
    this.matrix.decompose(root.position, root.quaternion, this.scale);
    root.scale.setScalar(this.scale.x);
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.setScalar(1);
  }

  /** Recompute every card's resting pose from its place. */
  private relayout(): void {
    const { surfaceY, cardRowZ, cardRowX, now, pocket } = TRAY_LAYOUT;
    const cards = [...this.queries.cards.entities].sort(
      (a, b) => a.getValue(TaskCard, 'order')! - b.getValue(TaskCard, 'order')!,
    );
    let pocketSlot = 0;
    let doneSlot = 0;
    for (const card of cards) {
      const order = card.getValue(TaskCard, 'order')!;
      const p = card.getVectorView(TaskCard, 'targetPosition');
      let scale = 1;
      switch (card.getValue(TaskCard, 'place')) {
        case CardPlace.Now:
          p.set(now.position);
          this.euler.set(now.tiltDeg * deg, 0, 0);
          break;
        case CardPlace.Pocket:
          p.set([
            pocket.slotX[pocketSlot++ % pocket.slotX.length],
            pocket.cardY,
            pocket.position[2],
          ]);
          this.euler.set(90 * deg, 0, 0);
          scale = pocket.cardScale;
          break;
        case CardPlace.Done:
          p.set([
            TRAY_LAYOUT.done.position[0],
            DONE_STACK_TOP + CARD_SIZE.thickness * (doneSlot++ + 0.5),
            TRAY_LAYOUT.done.position[2],
          ]);
          // A little skew so a stack reads as a pile of finished cards.
          this.euler.set(0, (doneSlot % 2 ? 6 : -4) * deg, 0);
          scale = DONE_CARD_SCALE;
          break;
        default:
          p.set([cardRowX[order], surfaceY + CARD_SIZE.thickness / 2, cardRowZ]);
          this.euler.set(0, 0, 0);
      }
      this.quat.setFromEuler(this.euler);
      card.getVectorView(TaskCard, 'targetRotation').set(this.quat.toArray());
      card.setValue(TaskCard, 'targetScale', scale);
    }
  }

  private spawnCards(): void {
    const tasks = loadOpenTasks();
    tasks.forEach((task, order) => {
      const root = new Group();
      root.name = `card-${order + 1}`;
      const hit = new Mesh(
        new BoxGeometry(
          CARD_SIZE.width + HIT_MARGIN * 2,
          CARD_SIZE.thickness + 0.01,
          CARD_SIZE.height + HIT_MARGIN * 2,
        ),
        new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      );
      hit.name = `card-${order + 1}-hit`;
      // Hands grab the body; only rays and gaze use the larger hit area.
      hit.pointerEventsType = { deny: 'grab' };
      root.add(hit);

      const card = this.world.createTransformEntity(root, { parent: this.tray });
      card.addComponent(TaskCard, { taskId: task.id, order });
      card.addComponent(RayInteractable);

      const side = new MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.8 });
      const face = new MeshStandardMaterial({
        map: createCardTexture(task, order),
        roughness: 0.75,
        emissive: 0xffffff,
        emissiveIntensity: 0,
      });
      const mesh = new Mesh(
        new BoxGeometry(CARD_SIZE.width, CARD_SIZE.thickness, CARD_SIZE.height),
        [side, side, face, side, side, side],
      );
      mesh.name = `card-${order + 1}-body`;
      const body = this.world.createTransformEntity(mesh, { parent: card });
      body.addComponent(CardBody, { card });
      body.addComponent(OneHandGrabbable, { rotate: false, translate: true });
    });
    this.relayout();
    // Start each card at its resting pose rather than easing in from 0,0,0.
    for (const card of this.queries.cards.entities) {
      const p = card.getVectorView(TaskCard, 'targetPosition');
      const r = card.getVectorView(TaskCard, 'targetRotation');
      card.object3D!.position.set(p[0], p[1], p[2]);
      card.object3D!.quaternion.set(r[0], r[1], r[2], r[3]);
    }
  }

  private disposeCards(): void {
    for (const body of [...this.queries.bodies.entities]) {
      faceMaterial(body).map?.dispose();
      body.dispose();
    }
    for (const card of [...this.queries.cards.entities]) {
      card.dispose();
    }
    this.releasedAt.clear();
  }

  private cardOf(body: Entity): Entity | null {
    return body.getValue(CardBody, 'card') as Entity | null;
  }

  private findByOrder(order: number): Entity | undefined {
    for (const card of this.queries.cards.entities) {
      if (card.getValue(TaskCard, 'order') === order) return card;
    }
    return undefined;
  }

  private installDebugHooks(): void {
    const debug = window as unknown as { seat14c?: Record<string, unknown> };
    debug.seat14c = Object.assign(debug.seat14c ?? {}, {
      cards: () =>
        [...this.queries.cards.entities].map((card) => ({
          name: card.object3D!.name,
          taskId: card.getValue(TaskCard, 'taskId'),
          place: card.getValue(TaskCard, 'place'),
          held: card.getValue(TaskCard, 'held'),
          local: card.object3D!.position.toArray().map((v) => +v.toFixed(3)),
          world: card
            .object3D!.getWorldPosition(new Vector3())
            .toArray()
            .map((v) => +v.toFixed(3)),
        })),
      land: (outcome: FlightOutcome) => this.land(outcome),
      chooseCard: (order: number) => {
        const card = this.findByOrder(order);
        if (card) this.choose(card);
      },
      dropCardAt: (order: number, x: number, y: number, z: number) => {
        const card = this.findByOrder(order);
        if (card) {
          card.object3D!.position.set(x, y, z);
          this.onRelease(card);
        }
      },
    });
  }
}

function faceMaterial(body: Entity): MeshStandardMaterial {
  const mesh = body.object3D as Mesh;
  return (mesh.material as MeshStandardMaterial[])[FACE_INDEX];
}
