import {
  BoxGeometry,
  createSystem,
  Entity,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { flightPhase, FlightPhase } from './flight-state.js';

/**
 * Placement of the tray relative to the seated head, in metres and degrees.
 * The tray stays inside the two-foot reach bubble and is tilted toward the
 * user rather than lowered, so it stays inside the VR Glasses' 70° x 66° view
 * (its centre sits about 28° below eye line).
 */
export const TRAY_DEFAULTS = {
  forward: 0.42,
  drop: 0.22,
  tiltDeg: 20,
  width: 0.44,
  depth: 0.28,
  thickness: 0.018,
  /**
   * Limits for calibration and the raise/lower buttons, below eye height.
   * At the lowest setting the Now card still sits about 26° below eye line,
   * inside the glasses' 33° half-view; the tray is tilted rather than lowered.
   */
  minDrop: 0.12,
  maxDrop: 0.32,
};

const deg = Math.PI / 180;

/**
 * Where things sit on the tray, in tray space: +X right, +Y up off the
 * surface, +Z toward the user. The Now slot is raised on a stand at the back
 * and tilted further so the active card sits about 15–17° below eye line.
 */
export const TRAY_LAYOUT = {
  surfaceY: TRAY_DEFAULTS.thickness / 2,
  cardRowZ: 0.065,
  cardRowX: [-0.14, 0, 0.14],
  now: { position: [0, 0.055, -0.07] as const, tiltDeg: 50 },
  pocket: {
    position: [0, -0.015, -0.168] as const,
    slotX: [-0.15, 0.15, 0],
    cardY: 0.03,
    cardScale: 0.8,
  },
  dial: { position: [0.155, 0, -0.07] as const },
  done: { position: [-0.155, 0, -0.07] as const },
};

/** Frames to wait after entering XR so the head pose has settled. */
const SETTLE_FRAMES = 10;

/**
 * The tray table every interactable sits on. It is placed in front of the
 * head on every XR entry; calibration and the raise/lower buttons change
 * its height through {@link TraySystem.setDrop}.
 */
export class TraySystem extends createSystem({}) {
  tray!: Entity;
  /** Current distance of the tray centre below eye height. */
  drop = TRAY_DEFAULTS.drop;
  private framesUntilPlace = -1;
  private headPosition = new Vector3();
  private headForward = new Vector3();

  init(): void {
    this.tray = this.world.createTransformEntity(buildTray());
    this.tray.object3D!.name = 'tray';
    this.tray.object3D!.visible = false;

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.NonImmersive) {
          this.tray.object3D!.visible = false;
          this.framesUntilPlace = -1;
        } else if (this.framesUntilPlace < 0 && !this.tray.object3D!.visible) {
          this.framesUntilPlace = SETTLE_FRAMES;
        }
      }),
      flightPhase.subscribe((phase) => {
        if (phase === FlightPhase.CheckIn) {
          this.tray.object3D!.visible = false;
        }
      }),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        recenterTray: () => this.place(),
        trayState: () => {
          const tray = this.tray.object3D!;
          const position = tray.getWorldPosition(new Vector3());
          return {
            visible: tray.visible,
            drop: +this.drop.toFixed(3),
            position: position.toArray().map((v) => +v.toFixed(3)),
          };
        },
      });
    }
  }

  update(): void {
    if (this.framesUntilPlace < 0) {
      return;
    }
    if (this.framesUntilPlace-- === 0) {
      this.place();
    }
  }

  /** Set how far below eye height the tray sits, then re-place it. */
  setDrop(drop: number): void {
    this.drop = Math.min(
      TRAY_DEFAULTS.maxDrop,
      Math.max(TRAY_DEFAULTS.minDrop, drop),
    );
    this.place();
  }

  /** Eye height of the seated user, in world space. */
  getHeadPosition(target: Vector3): Vector3 {
    this.player.head.updateWorldMatrix(true, false);
    return this.player.head.getWorldPosition(target);
  }

  /** Put the tray in front of the head, facing the user, yaw only. */
  place(): void {
    const head = this.player.head;
    this.getHeadPosition(this.headPosition);
    head.getWorldDirection(this.headForward);
    // Object3D.getWorldDirection returns +Z; the camera looks down -Z.
    this.headForward.negate();
    this.headForward.y = 0;
    if (this.headForward.lengthSq() < 1e-6) {
      this.headForward.set(0, 0, -1);
    }
    this.headForward.normalize();

    const tray = this.tray.object3D!;
    tray.position
      .copy(this.headPosition)
      .addScaledVector(this.headForward, TRAY_DEFAULTS.forward);
    tray.position.y = this.headPosition.y - this.drop;
    tray.rotation.set(0, Math.atan2(-this.headForward.x, -this.headForward.z), 0);
    tray.rotateX(TRAY_DEFAULTS.tiltDeg * deg);
    tray.visible = true;
    this.framesUntilPlace = -1;
  }
}

function buildTray(): Group {
  const { width, depth, thickness } = TRAY_DEFAULTS;
  const group = new Group();

  const trim = new MeshStandardMaterial({ color: 0x3d4656, roughness: 0.5 });

  const top = new Mesh(
    new BoxGeometry(width, thickness, depth),
    new MeshStandardMaterial({ color: 0x8a94a6, roughness: 0.7 }),
  );
  top.name = 'tray-top';
  group.add(top);

  // A raised lip on the far edge, like a seat-back tray latch rail.
  const lip = new Mesh(new BoxGeometry(width, thickness * 1.5, 0.012), trim);
  lip.name = 'tray-lip';
  lip.position.set(0, thickness, -depth / 2 + 0.006);
  group.add(lip);

  // Stand that holds the active card up toward eye line.
  const [nx, ny, nz] = TRAY_LAYOUT.now.position;
  const stand = new Group();
  stand.name = 'now-stand';
  stand.position.set(nx, ny, nz);
  stand.rotation.x = TRAY_LAYOUT.now.tiltDeg * deg;
  const plate = new Mesh(
    new BoxGeometry(0.14, 0.006, 0.095),
    new MeshStandardMaterial({ color: 0xffb547, roughness: 0.6 }),
  );
  plate.name = 'now-plate';
  plate.position.y = -0.006;
  stand.add(plate);
  group.add(stand);
  const post = new Mesh(new BoxGeometry(0.03, ny, 0.012), trim);
  post.name = 'now-post';
  post.position.set(nx, ny / 2, nz - 0.02);
  group.add(post);

  // Seat pocket hanging off the far edge, cards peek out of its top.
  const [px, py, pz] = TRAY_LAYOUT.pocket.position;
  const pocket = new Mesh(
    new BoxGeometry(width * 0.95, 0.07, 0.02),
    new MeshStandardMaterial({ color: 0x2a3142, roughness: 0.95 }),
  );
  pocket.name = 'seat-pocket';
  pocket.position.set(px, py, pz);
  group.add(pocket);

  return group;
}
