import {
  createSystem,
  Entity,
  Group,
  Hovered,
  Mesh,
  MeshStandardMaterial,
  PokeInteractable,
  Pressed,
  Quaternion,
  RayInteractable,
  Texture,
  Vector3,
} from '@iwsdk/core';
import { INK } from './accessibility.js';
import { duckEngines } from './audio.js';
import { WristAction, WristButton } from './cabin-components.js';
import { flightClock, flightPhase, FlightPhase, setFlightPhase } from './flight-state.js';
import { buttonMesh } from './landing.js';
import { slabFace } from './models.js';
import { createTextPanel, roundRect, TextPanel } from './text-panel.js';

const HANDS = ['left', 'right'] as const;
type Hand = (typeof HANDS)[number];

/** Palm counts as up when its normal is within this angle of straight up. */
const PALM_UP_COS = Math.cos(50 * (Math.PI / 180));
/** Hold the palm up this long (s) to open the menu… */
const OPEN_AFTER = 0.35;
/** …and the menu stays this long (s) after the palm turns away, to be used. */
const CLOSE_AFTER = 2.5;
/** The menu floats this far above the wrist (m): clear of that hand's own
 * fingertips, which would otherwise hover the buttons and switch gaze off. */
const ABOVE_WRIST = 0.13;

type Action = (typeof WristAction)[keyof typeof WristAction];

/**
 * The wrist menu. During a flight, turn either palm up for a moment and a
 * small menu rises above it: Pause (Resume while paused) and Land now. Poke a button
 * with the other hand, or look at it and pinch. It folds away a few seconds
 * after the palm turns back down.
 */
export class WristMenuSystem extends createSystem({
  buttons: { required: [WristButton] },
  pressed: { required: [WristButton, Pressed] },
}) {
  /** Hand the menu is on, or null while it is closed. */
  openOn: Hand | null = null;
  private root!: Entity;
  private header!: TextPanel;
  private shownHeader = '';
  private pauseFace!: MeshStandardMaterial;
  private labels!: { pause: Texture; resume: Texture };
  private palmUpFor = { left: 0, right: 0 };
  private sinceDown = 0;
  private wrist = new Vector3();
  private head = new Vector3();
  private normal = new Vector3();
  private quaternion = new Quaternion();
  /**
   * The grip's local axis that points out of the palm. Measured in the
   * emulator, where both hands agree on +X; check on a headset.
   */
  private palmAxis = { left: new Vector3(1, 0, 0), right: new Vector3(1, 0, 0) };

  init(): void {
    this.build();
    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        if (phase !== FlightPhase.Cruise) this.close();
        if (phase !== FlightPhase.Cruise && flightClock.paused.peek()) this.setPaused(false);
      }),
      flightClock.paused.subscribe((paused) => this.drawHeader(paused)),
      this.queries.pressed.subscribe('disqualify', (button) => {
        this.act(button.getValue(WristButton, 'action') as Action);
      }),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        wristMenu: () => ({
          openOn: this.openOn,
          paused: flightClock.paused.peek(),
          palmUp: { ...this.palmUpFor },
          buttons: [...this.queries.buttons.entities].map((b) => ({
            name: b.object3D!.name,
            interactable: b.hasComponent(RayInteractable),
          })),
        }),
        palmNormals: () => {
          const out: Record<string, number[]> = {};
          for (const hand of HANDS) {
            this.palmNormal(hand, this.normal);
            out[hand] = this.normal.toArray().map((v) => +v.toFixed(2));
          }
          return out;
        },
      });
    }
  }

  update(delta: number): void {
    for (const button of this.queries.buttons.entities) {
      const face = slabFace(button.object3D as Mesh);
      const glow = button.hasComponent(Pressed) ? 0.45 : button.hasComponent(Hovered) ? 0.22 : 0;
      face.emissiveIntensity += (glow - face.emissiveIntensity) * Math.min(1, delta * 14);
    }
    if (flightPhase.peek() !== FlightPhase.Cruise) return;

    for (const hand of HANDS) {
      const up = this.isPalmUp(hand);
      this.palmUpFor[hand] = up ? this.palmUpFor[hand] + delta : 0;
      if (this.openOn == null && this.palmUpFor[hand] >= OPEN_AFTER) this.open(hand);
    }

    if (this.openOn != null) {
      const hand = this.openOn;
      this.sinceDown = this.palmUpFor[hand] > 0 ? 0 : this.sinceDown + delta;
      if (this.sinceDown >= CLOSE_AFTER) {
        this.close();
        return;
      }
      // Follow the wrist while the palm is up; hold still once it turns
      // away, so the other hand or the eyes can reach the buttons.
      if (this.palmUpFor[hand] > 0) this.place(hand);
    }
  }

  private isPalmUp(hand: Hand): boolean {
    if (this.input.xr.getPrimaryInputSource(hand)?.hand == null) return false;
    this.palmNormal(hand, this.normal);
    return this.normal.y > PALM_UP_COS;
  }

  private palmNormal(hand: Hand, out: Vector3): Vector3 {
    this.player.gripSpaces[hand].getWorldQuaternion(this.quaternion);
    return out.copy(this.palmAxis[hand]).applyQuaternion(this.quaternion);
  }

  private place(hand: Hand): void {
    const object = this.root.object3D!;
    this.player.gripSpaces[hand].getWorldPosition(this.wrist);
    this.player.head.getWorldPosition(this.head);
    object.position.copy(this.wrist);
    object.position.y += ABOVE_WRIST;
    object.lookAt(this.head);
  }

  private open(hand: Hand): void {
    this.openOn = hand;
    this.sinceDown = 0;
    this.place(hand);
    this.drawHeader(flightClock.paused.peek());
    this.setVisible(true);
  }

  private close(): void {
    this.openOn = null;
    this.setVisible(false);
  }

  private act(action: Action): void {
    if (this.openOn == null || flightPhase.peek() !== FlightPhase.Cruise) return;
    if (action === WristAction.Pause) {
      this.setPaused(!flightClock.paused.peek());
    } else if (action === WristAction.Land) {
      this.setPaused(false);
      this.close();
      setFlightPhase(FlightPhase.Landing);
    }
  }

  private setPaused(paused: boolean): void {
    flightClock.paused.value = paused;
    duckEngines(paused);
    // One toggle button: its label swaps between Pause and Resume.
    this.pauseFace.map = paused ? this.labels.resume : this.labels.pause;
  }

  private setVisible(visible: boolean): void {
    this.root.object3D!.visible = visible;
    for (const button of this.queries.buttons.entities) {
      button.object3D!.visible = visible;
      this.setInteractable(button, visible);
    }
  }

  private setInteractable(button: Entity, enabled: boolean): void {
    if (enabled && !button.hasComponent(RayInteractable)) {
      button.addComponent(RayInteractable);
      button.addComponent(PokeInteractable);
    } else if (!enabled && button.hasComponent(RayInteractable)) {
      button.removeComponent(RayInteractable);
      button.removeComponent(PokeInteractable);
    }
  }

  private drawHeader(paused: boolean): void {
    const label = paused ? 'paused' : 'flying';
    if (label === this.shownHeader) return;
    this.shownHeader = label;
    const minutes = Math.floor(flightClock.elapsed.peek() / 60);
    this.header.draw((ctx, w, h) => {
      ctx.fillStyle = INK.panel;
      roundRect(ctx, 0, 0, w, h, 24);
      ctx.fill();
      ctx.fillStyle = paused ? INK.accent : INK.text;
      ctx.font = '600 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(paused ? `Paused at ${minutes} min` : 'In flight', w / 2, h / 2);
    });
  }

  private build(): void {
    const group = new Group();
    group.name = 'wrist-menu';
    group.visible = false;
    this.root = this.world.createTransformEntity(group);

    this.header = createTextPanel('wrist-menu-header', 0.12, 0.026);
    this.header.mesh.position.y = 0.05;
    group.add(this.header.mesh);

    // Two buttons side by side, 9 cm apart so gaze can tell them apart.
    for (const [action, label, x] of [
      [WristAction.Pause, 'Pause', -0.045],
      [WristAction.Land, 'Land now', 0.045],
    ] as const) {
      const mesh = buttonMesh(`wrist-${action}`, label);
      mesh.scale.setScalar(0.7);
      // Stand the button up so its face (+Y) points at the user (+Z).
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, 0.012, 0.005);
      mesh.visible = false;
      const button = this.world.createTransformEntity(mesh, { parent: this.root });
      button.addComponent(WristButton, { action });
      if (action === WristAction.Pause) this.pauseFace = slabFace(mesh);
    }
    this.labels = {
      pause: this.pauseFace.map!,
      resume: slabFace(buttonMesh('wrist-resume-label', 'Resume')).map!,
    };
  }
}
