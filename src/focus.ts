import { CABIN } from './accessibility.js';
import {
  BackSide,
  Color,
  createSystem,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
} from '@iwsdk/core';
import { CardSystem } from './cards.js';
import { flightPhase, FlightPhase } from './flight-state.js';
import { TraySystem } from './tray.js';

/** How much everything but the active card darkens in cruise. */
const FADE_BACK = 0.55;
/** Seconds to dim at takeoff and to come back up at landing. */
const DIM_SECONDS = 2.5;
const RISE_SECONDS = 1.2;

/** Objects that stay bright while everything else fades back. */
const KEEP_BRIGHT = ['steps-panel', 'progress-track'];

type Colored = Material & { color: Color; userData: { focusBase?: Color } };

/**
 * Focus mode. At takeoff the cabin lights dim: a dark dome around the seat
 * darkens the passthrough room, and every tray item except the active card
 * (and its steps and progress line) fades back. Landing brings it all up.
 */
export class FocusSystem extends createSystem({}) {
  /** 0 = cabin lights up, 1 = full focus. */
  level = 0;
  private dome!: Mesh;
  private faded: Colored[] = [];

  init(): void {
    this.dome = new Mesh(
      new SphereGeometry(4, 24, 16),
      new MeshBasicMaterial({
        color: 0x05070f,
        side: BackSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.dome.name = 'cabin-dim';
    this.dome.renderOrder = -1;
    this.dome.visible = false;
    this.world.createTransformEntity(this.dome);

    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        if (phase === FlightPhase.Cruise) this.collect();
      }),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        focusLevel: () => +this.level.toFixed(2),
      });
    }
  }

  update(delta: number): void {
    const cruising = flightPhase.peek() === FlightPhase.Cruise;
    const rate = cruising ? delta / DIM_SECONDS : -delta / RISE_SECONDS;
    // Reduced motion: the lights change at once instead of fading.
    const level = CABIN.reducedMotion
      ? (cruising ? 1 : 0)
      : Math.min(1, Math.max(0, this.level + rate));
    if (level === this.level) return;
    this.level = level;

    // Ease in and out so the lights dim like a cabin, not a switch.
    const eased = level * level * (3 - 2 * level);
    const dome = this.dome.material as MeshBasicMaterial;
    dome.opacity = CABIN.focusDim * eased;
    this.dome.visible = level > 0;
    this.player.head.getWorldPosition(this.dome.position);

    const brightness = 1 - FADE_BACK * eased;
    for (const material of this.faded) {
      material.color.copy(material.userData.focusBase!).multiplyScalar(brightness);
    }
    if (level === 0) this.faded.length = 0;
  }

  /** Gather the materials on the tray that fade, skipping the active card. */
  private collect(): void {
    const tray = this.world.getSystem(TraySystem)!.tray.object3D!;
    const active = this.world.getSystem(CardSystem)!.nowCard()?.object3D;
    const seen = new Set<Material>();
    this.faded.length = 0;
    const visit = (object: Object3D) => {
      if (object === active || KEEP_BRIGHT.includes(object.name)) return;
      const mesh = object as Mesh;
      if (mesh.isMesh) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const colored = material as Colored;
          if (seen.has(material) || !(colored.color instanceof Color)) continue;
          if (!material.colorWrite) continue;
          seen.add(material);
          colored.userData.focusBase ??= colored.color.clone();
          this.faded.push(colored);
        }
      }
      for (const child of object.children) visit(child);
    };
    visit(tray);
  }
}
