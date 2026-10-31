import {
  BoxGeometry,
  CanvasTexture,
  createSystem,
  CylinderGeometry,
  Entity,
  Grabbed,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OneHandGrabbable,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
} from '@iwsdk/core';
import { playDetent } from './audio.js';
import { DialKnob, DialRoot } from './cabin-components.js';
import {
  FLIGHT_LENGTHS,
  flightClock,
  flightPhase,
  FlightPhase,
  flightPlan,
} from './flight-state.js';
import { TRAY_LAYOUT, TraySystem } from './tray.js';

const deg = Math.PI / 180;

/**
 * Knob angle (about tray-space +Y) for each length in {@link FLIGHT_LENGTHS}.
 * Turning clockwise, seen from above, makes the flight longer.
 */
const STOP_ANGLES = [60 * deg, 20 * deg, -20 * deg, -60 * deg];
const ANGLE_LIMIT = 80 * deg;
const EASE_RATE = 16;

const PLATE_SIZE = 0.12;
const KNOB_RADIUS = 0.028;
const CANVAS_SIZE = 256;

/**
 * The flight-length dial. Pinch the knob and twist: it turns about one axis
 * only and snaps to 5, 10, 25 or 45 minutes on release. Look at it and pinch
 * to step to the next length instead. In cruise it shows the time to landing.
 */
export class DialSystem extends createSystem({
  knobs: { required: [DialKnob] },
  heldKnobs: { required: [DialKnob, Grabbed] },
  pressedDial: { required: [DialRoot, Pressed] },
}) {
  private root!: Entity;
  private knob!: Entity;
  private knobFace!: MeshStandardMaterial;
  private canvas!: HTMLCanvasElement;
  private texture!: CanvasTexture;
  private shownLabel = '';
  private previewIndex = -1;
  private shownMinute = -1;

  init(): void {
    const tray = this.world.getSystem(TraySystem)!.tray;
    this.buildDial(tray);

    this.cleanupFuncs.push(
      flightPlan.minutes.subscribe((minutes) => {
        const index = FLIGHT_LENGTHS.indexOf(minutes as never);
        this.knob.setValue(
          DialKnob,
          'targetAngle',
          index >= 0 ? STOP_ANGLES[index] : 0,
        );
        this.redraw();
      }),
      flightPhase.subscribe(() => this.redraw()),
      this.queries.heldKnobs.subscribe('disqualify', (knob) => {
        if (flightPhase.peek() !== FlightPhase.Preflight) return;
        this.previewIndex = -1;
        const index = nearestStop(knob.object3D!.rotation.y);
        // Re-snap even if the length did not change.
        knob.setValue(DialKnob, 'targetAngle', STOP_ANGLES[index]);
        flightPlan.minutes.value = FLIGHT_LENGTHS[index];
      }),
      this.queries.pressedDial.subscribe('disqualify', () => this.step()),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        dialState: () => ({
          angleDeg: +(this.knob.object3D!.rotation.y / deg).toFixed(1),
          minutes: flightPlan.minutes.peek(),
          label: this.shownLabel,
        }),
        stepDial: () => this.step(),
        releaseKnobAt: (angleDeg: number) => {
          this.knob.object3D!.rotation.set(0, angleDeg * deg, 0);
          const index = nearestStop(angleDeg * deg);
          this.knob.setValue(DialKnob, 'targetAngle', STOP_ANGLES[index]);
          flightPlan.minutes.value = FLIGHT_LENGTHS[index];
        },
      });
    }
  }

  update(delta: number): void {
    const knob = this.knob.object3D!;
    const held = this.knob.hasComponent(Grabbed);
    if (held) {
      const index = nearestStop(knob.rotation.y);
      if (index !== this.previewIndex) {
        if (this.previewIndex >= 0) playDetent();
        this.previewIndex = index;
        this.redraw();
      }
    } else {
      const target = this.knob.getValue(DialKnob, 'targetAngle')!;
      const k = 1 - Math.exp(-delta * EASE_RATE);
      knob.rotation.set(0, knob.rotation.y + (target - knob.rotation.y) * k, 0);
    }

    const glow =
      this.root.hasComponent(Pressed) ? 0.4
      : held || this.root.hasComponent(Hovered) || this.knob.hasComponent(Hovered) ? 0.2
      : 0;
    this.knobFace.emissiveIntensity +=
      (glow - this.knobFace.emissiveIntensity) * Math.min(1, delta * EASE_RATE);

    if (flightPhase.peek() === FlightPhase.Cruise) {
      const left = Math.ceil(flightClock.elapsed.peek() / 60);
      if (left !== this.shownMinute) {
        this.shownMinute = left;
        this.redraw();
      }
    }
  }

  /** Look + pinch: advance to the next length, wrapping after 45. */
  private step(): void {
    if (flightPhase.peek() !== FlightPhase.Preflight) return;
    const current = FLIGHT_LENGTHS.indexOf(flightPlan.minutes.peek() as never);
    flightPlan.minutes.value = FLIGHT_LENGTHS[(current + 1) % FLIGHT_LENGTHS.length];
    playDetent();
  }

  private label(): string {
    const minutes = flightPlan.minutes.peek();
    if (flightPhase.peek() === FlightPhase.Cruise && minutes > 0) {
      const left = Math.max(0, Math.ceil(minutes - flightClock.elapsed.peek() / 60));
      return `${left} min to go`;
    }
    if (this.previewIndex >= 0) return `${FLIGHT_LENGTHS[this.previewIndex]} min`;
    return minutes > 0 ? `${minutes} min` : 'Set length';
  }

  /** Repaint the dial face; skipped when nothing visible changed. */
  private redraw(): void {
    const label = this.label();
    if (label === this.shownLabel) return;
    this.shownLabel = label;

    const ctx = this.canvas.getContext('2d')!;
    const c = CANVAS_SIZE / 2;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = '#2b3245';
    ctx.beginPath();
    ctx.arc(c, c, c - 4, 0, Math.PI * 2);
    ctx.fill();

    const minutes = this.previewIndex >= 0
      ? FLIGHT_LENGTHS[this.previewIndex]
      : flightPlan.minutes.peek();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    FLIGHT_LENGTHS.forEach((length, i) => {
      // Canvas top is the far side of the tray; +x is right.
      const angle = STOP_ANGLES[i];
      const x = c - Math.sin(angle) * c * 0.74;
      const y = c - Math.cos(angle) * c * 0.74;
      ctx.fillStyle = length === minutes ? '#ffb547' : '#a6aed0';
      ctx.font = `${length === minutes ? 700 : 500} 30px system-ui, sans-serif`;
      ctx.fillText(String(length), x, y);
    });

    ctx.fillStyle = '#eef1fb';
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillText(label, c, CANVAS_SIZE * 0.86);
    this.texture.needsUpdate = true;
  }

  private buildDial(tray: Entity): void {
    const group = new Group();
    group.name = 'dial';
    const [x, , z] = TRAY_LAYOUT.dial.position;
    group.position.set(x, TRAY_LAYOUT.surfaceY, z);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = CANVAS_SIZE;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const plate = new Mesh(
      new PlaneGeometry(PLATE_SIZE, PLATE_SIZE),
      new MeshBasicMaterial({ map: this.texture, transparent: true }),
    );
    plate.name = 'dial-plate';
    plate.rotation.x = -90 * deg;
    plate.position.y = 0.001;
    group.add(plate);

    // A larger invisible target so gaze can land on the dial easily.
    const hit = new Mesh(
      new CylinderGeometry(0.05, 0.05, 0.04, 24),
      new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    hit.name = 'dial-hit';
    hit.position.y = 0.02;
    hit.pointerEventsType = { deny: 'grab' };
    group.add(hit);

    this.root = this.world.createTransformEntity(group, { parent: tray });
    this.root.addComponent(DialRoot);
    this.root.addComponent(RayInteractable);

    this.knobFace = new MeshStandardMaterial({
      color: 0xd9dde8,
      roughness: 0.4,
      metalness: 0.2,
      emissive: 0xffb547,
      emissiveIntensity: 0,
    });
    const knob = new Group();
    knob.name = 'dial-knob';
    const cap = new Mesh(
      new CylinderGeometry(KNOB_RADIUS, KNOB_RADIUS * 1.05, 0.022, 32),
      this.knobFace,
    );
    cap.name = 'dial-cap';
    cap.position.y = 0.011;
    knob.add(cap);
    // Pointer ridge toward local -Z, so the stop angles read off it.
    const ridge = new Mesh(
      new BoxGeometry(0.006, 0.006, KNOB_RADIUS),
      new MeshStandardMaterial({ color: 0xffb547, roughness: 0.5 }),
    );
    ridge.name = 'dial-ridge';
    ridge.position.set(0, 0.024, -KNOB_RADIUS / 2);
    knob.add(ridge);

    this.knob = this.world.createTransformEntity(knob, { parent: this.root });
    this.knob.addComponent(DialKnob);
    this.knob.addComponent(OneHandGrabbable, {
      translate: false,
      rotate: true,
      rotateMin: [0, -ANGLE_LIMIT, 0],
      rotateMax: [0, ANGLE_LIMIT, 0],
    });
    this.redraw();
  }
}

function nearestStop(angle: number): number {
  let best = 0;
  for (let i = 1; i < STOP_ANGLES.length; i++) {
    if (Math.abs(angle - STOP_ANGLES[i]) < Math.abs(angle - STOP_ANGLES[best])) {
      best = i;
    }
  }
  return best;
}
