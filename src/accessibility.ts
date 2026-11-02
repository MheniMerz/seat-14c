import {
  createSystem,
  Entity,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  Pressed,
  RayInteractable,
  RingGeometry,
  signal,
  Vector3,
} from '@iwsdk/core';
import { flightPhase, FlightPhase } from './flight-state.js';
import { loadProgress, Progress } from './storage.js';

export type CabinSettings = Progress['settings'];

/** Settings in force for this flight; re-read from storage on every boarding. */
export const cabinSettings = signal<CabinSettings>(loadProgress().settings);

const STANDARD_INK = {
  panel: 'rgba(20, 24, 42, 0.9)',
  text: '#eef1fb',
  muted: '#a6aed0',
  accent: '#ffb547',
  line: '#343c63',
};
const HIGH_CONTRAST_INK = {
  panel: '#000000',
  text: '#ffffff',
  muted: '#f2f2f2',
  accent: '#ffd400',
  line: '#8a8a8a',
};

/** Colours for every panel drawn at runtime. High contrast swaps them. */
export const INK = { ...STANDARD_INK };

/** Cabin-wide look and motion, read by the systems that draw and animate. */
export const CABIN = {
  /** How dark the passthrough room gets in cruise (0..1). */
  focusDim: 0.45,
  /** Snap instead of animating: slips, cards, the dial, the breathing ring. */
  reducedMotion: false,
  /** Scale of floating text panels: hints, steps, wind-down, summary. */
  textScale: 1,
};

const TEXT_SCALES = { S: 0.85, M: 1, L: 1.3 } as const;

/** Floating panels that follow the text size setting. */
const SCALED_PANELS = [
  'calibration-hint',
  'boarding-hint',
  'steps-panel',
  'wind-down',
  'summary-card',
  'wrist-menu',
];

/** Look-only mode: hold your gaze on a target this long (s) to select it. */
export const DWELL_SECONDS = 1;
/**
 * After a selection nothing arms until the eyes move this far (radians).
 * Whatever a selection puts under a resting gaze (the summary appearing
 * where Skip was) is not something the user chose to look at.
 */
const MOVE_TO_REARM = 4 * (Math.PI / 180);
const DWELL_SEGMENTS = 16;

function applySettings(settings: CabinSettings): void {
  Object.assign(INK, settings.highContrast ? HIGH_CONTRAST_INK : STANDARD_INK);
  CABIN.focusDim = settings.highContrast ? 0.7 : 0.45;
  CABIN.reducedMotion = settings.reduceMotion;
  CABIN.textScale = TEXT_SCALES[settings.textSize] ?? 1;
}
applySettings(cabinSettings.peek());

/**
 * Applies the check-in page's accessibility settings on every boarding, and
 * runs look-only mode: with it on, resting gaze on any target for a second
 * selects it, so no pinch is ever needed. A ring fills around the target
 * while the gaze rests, and the gaze must leave and return to select again.
 */
export class AccessibilitySystem extends createSystem({
  hovered: { required: [RayInteractable, Hovered] },
}) {
  private target: Entity | null = null;
  private dwell = 0;
  private armed = false;
  /** Gaze direction at the last selection, while waiting for the eyes to move. */
  private lockedGaze = new Vector3();
  private locked = false;
  private gaze = new Vector3();
  private releasePress: Entity | null = null;
  private ring!: Group;
  private segments: Mesh[] = [];
  private head = new Vector3();
  private at = new Vector3();

  init(): void {
    this.buildRing();
    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        if (phase === FlightPhase.Calibrating) {
          cabinSettings.value = loadProgress().settings;
        }
      }),
      cabinSettings.subscribe((settings) => {
        applySettings(settings);
        for (const name of SCALED_PANELS) {
          this.world.scene.getObjectByName(name)?.scale.setScalar(CABIN.textScale);
        }
      }),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        accessibility: () => ({
          settings: cabinSettings.peek(),
          ink: { ...INK },
          cabin: { ...CABIN },
          dwell: {
            target: this.target?.object3D?.name ?? null,
            seconds: +this.dwell.toFixed(2),
            armed: this.armed,
            locked: this.locked,
            ringVisible: this.ring.visible,
          },
        }),
        applySettings: (patch: Partial<CabinSettings>) => {
          cabinSettings.value = { ...cabinSettings.peek(), ...patch };
        },
      });
    }
  }

  update(delta: number): void {
    // A dwell "press" lasts one frame, like a quick pinch.
    if (this.releasePress != null) {
      if (this.releasePress.hasComponent(Pressed)) this.releasePress.removeComponent(Pressed);
      this.releasePress = null;
    }
    if (!cabinSettings.peek().gazeOnly) {
      this.ring.visible = false;
      this.target = null;
      return;
    }

    let hovered: Entity | null = null;
    for (const entity of this.queries.hovered.entities) {
      hovered = entity;
      break;
    }
    if (this.locked) {
      this.player.eyeSpace.getWorldDirection(this.gaze);
      if (this.gaze.angleTo(this.lockedGaze) > MOVE_TO_REARM) {
        this.locked = false;
        this.target = null;
      }
    }
    if (hovered !== this.target) {
      this.target = hovered;
      this.dwell = 0;
      this.armed = hovered != null && !this.locked;
    }
    if (hovered == null || !this.armed) {
      this.ring.visible = false;
      return;
    }

    this.dwell += delta;
    const fill = Math.min(1, this.dwell / DWELL_SECONDS);
    this.placeRing(hovered, fill);
    if (fill >= 1) {
      this.armed = false;
      this.locked = true;
      this.player.eyeSpace.getWorldDirection(this.lockedGaze);
      this.ring.visible = false;
      if (!hovered.hasComponent(Pressed)) {
        hovered.addComponent(Pressed);
        this.releasePress = hovered;
      }
    }
  }

  /** Show the dwell ring just in front of the target, facing the eyes. */
  private placeRing(target: Entity, fill: number): void {
    const lit = Math.ceil(fill * DWELL_SEGMENTS);
    this.segments.forEach((segment, i) => (segment.visible = i < lit));
    this.player.head.getWorldPosition(this.head);
    target.object3D!.getWorldPosition(this.at);
    // Pull it 4 cm toward the eyes so it is never buried in the target.
    this.ring.position.copy(this.at).lerp(this.head, 0.04 / Math.max(0.05, this.at.distanceTo(this.head)));
    this.ring.lookAt(this.head);
    this.ring.visible = true;
  }

  private buildRing(): void {
    const material = new MeshBasicMaterial({
      color: 0xffd400,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const ring = new Group();
    ring.name = 'dwell-ring';
    const step = (Math.PI * 2) / DWELL_SEGMENTS;
    for (let i = 0; i < DWELL_SEGMENTS; i++) {
      // Clockwise from the top, like a clock hand.
      const segment = new Mesh(
        new RingGeometry(0.018, 0.024, 4, 1, Math.PI / 2 - (i + 1) * step + 0.03, step - 0.06),
        material,
      );
      segment.renderOrder = 10;
      ring.add(segment);
      this.segments.push(segment);
    }
    ring.visible = false;
    this.ring = ring;
    this.world.createTransformEntity(ring);
  }
}
