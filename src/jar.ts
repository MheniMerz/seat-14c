import {
  CylinderGeometry,
  createSystem,
  Entity,
  Grabbed,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Pressed,
  RayInteractable,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { playDrop } from './audio.js';
import { ThoughtJar } from './cabin-components.js';
import { flightClock, flightPhase, FlightPhase, flightPlan } from './flight-state.js';
import { PALETTE, roundedSlabGeometry } from './models.js';
import { loadTasks, loadThoughts, parkThought } from './storage.js';
import { createTextPanel, TextPanel } from './text-panel.js';
import { TRAY_LAYOUT, TraySystem } from './tray.js';

/** Front-right corner of the tray: empty in cruise, clear of the dial. */
export const JAR_POSITION = [0.15, 0, 0.06] as const;
const JAR = { radius: 0.028, height: 0.07 };
/** A flick: pinch, move at least this far toward the jar, release quickly. */
const FLICK_MIN_DISTANCE = 0.08;
const FLICK_MAX_SECONDS = 0.8;
const FLICK_MAX_ANGLE = 50 * (Math.PI / 180);
/** Slips drawn inside the jar; more thoughts just fill the label. */
const MAX_SLIPS = 8;
const SLIP_FLIGHT_SECONDS = 0.35;

const HANDS = ['left', 'right'] as const;
type Hand = (typeof HANDS)[number];

type Pinch = { active: boolean; start: Vector3; time: number; grabbed: boolean };

/**
 * The parking-lot jar. A stray thought mid-flight goes in the jar instead of
 * breaking focus: pinch the air and flick toward the jar, or look at the jar
 * and pinch. A paper slip drops in, the jar counts it, and the thought waits
 * on the check-in page until after landing. Only active in cruise.
 */
export class JarSystem extends createSystem({
  jars: { required: [ThoughtJar] },
  pressedJar: { required: [ThoughtJar, Pressed] },
  grabbed: { required: [Grabbed] },
}) {
  /** Reduced motion: slips appear in the jar instead of flying there. */
  reduceMotion = false;
  /** Thoughts parked on this flight. */
  parkedThisFlight = 0;
  private jar!: Entity;
  private glass!: MeshStandardMaterial;
  private label!: TextPanel;
  private slips: Mesh[] = [];
  private flying: Mesh | null = null;
  private flyFrom = new Vector3();
  private flyTo = new Vector3();
  private flyTime = 0;
  private pinches: Record<Hand, Pinch> = {
    left: { active: false, start: new Vector3(), time: 0, grabbed: false },
    right: { active: false, start: new Vector3(), time: 0, grabbed: false },
  };
  private hand = new Vector3();
  private toJar = new Vector3();
  private jarWorld = new Vector3();
  private session: XRSession | null = null;
  private onSelectStart = (event: XRInputSourceEvent) => this.selectStart(event);
  private onSelectEnd = (event: XRInputSourceEvent) => this.selectEnd(event);

  init(): void {
    this.build(this.world.getSystem(TraySystem)!.tray);

    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        const cruise = phase === FlightPhase.Cruise;
        this.jar.object3D!.visible = cruise;
        if (cruise && !this.jar.hasComponent(RayInteractable)) {
          this.jar.addComponent(RayInteractable);
        } else if (!cruise && this.jar.hasComponent(RayInteractable)) {
          this.jar.removeComponent(RayInteractable);
        }
        if (phase === FlightPhase.Preflight) this.parkedThisFlight = 0;
        if (cruise) this.showSlips();
      }),
      this.queries.pressedJar.subscribe('disqualify', () => this.park(null)),
      this.world.visibilityState.subscribe((state) => this.watchSession(state)),
      () => this.watchSession(VisibilityState.NonImmersive),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        jar: () => ({
          visible: this.jar.object3D!.visible,
          interactable: this.jar.hasComponent(RayInteractable),
          parkedThisFlight: this.parkedThisFlight,
          slips: this.slips.filter((s) => s.visible).length,
          thoughts: loadThoughts().length,
        }),
      });
    }
  }

  update(delta: number): void {
    const hovered = this.jar.hasComponent(Hovered) || this.jar.hasComponent(Pressed);
    const glow = hovered ? 0.35 : 0;
    this.glass.emissiveIntensity += (glow - this.glass.emissiveIntensity) * Math.min(1, delta * 14);

    // Remember whether a pinch picked something up, so letting go of a
    // grabbed card is never mistaken for a flick.
    if (this.queries.grabbed.entities.size > 0) {
      for (const hand of HANDS) if (this.pinches[hand].active) this.pinches[hand].grabbed = true;
    }

    const slip = this.flying;
    if (slip != null) {
      this.flyTime += delta;
      const t = Math.min(1, this.flyTime / SLIP_FLIGHT_SECONDS);
      // Arc up a little, then drop into the jar.
      slip.position.lerpVectors(this.flyFrom, this.flyTo, t);
      slip.position.y += Math.sin(t * Math.PI) * 0.04;
      slip.rotation.z = t * Math.PI * 1.5;
      if (t >= 1) {
        slip.rotation.z = slip.userData.restTilt as number;
        this.flying = null;
        playDrop();
      }
    }
  }

  /** Park a thought; `from` is where a flicked slip starts (world space). */
  park(from: Vector3 | null): void {
    if (flightPhase.peek() !== FlightPhase.Cruise) return;
    const taskId = flightPlan.taskId.peek();
    const task = loadTasks().find((t) => t.id === taskId);
    parkThought(task?.title ?? '', Math.floor(flightClock.elapsed.peek() / 60));
    this.parkedThisFlight++;
    this.showSlips(from);
  }

  /** Lay one slip per parked thought in the jar; animate the newest in. */
  private showSlips(from?: Vector3 | null): void {
    const count = loadThoughts().length;
    this.slips.forEach((slip, i) => (slip.visible = i < Math.min(count, MAX_SLIPS)));
    this.label.draw((ctx, w, h) => {
      ctx.fillStyle = count > 0 ? '#eef1fb' : '#a6aed0';
      ctx.font = '600 44px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count > 0 ? `${count} parked` : 'Park a thought', w / 2, h / 2);
    });
    if (from === undefined || count === 0) return;

    const slip = this.slips[Math.min(count, MAX_SLIPS) - 1];
    this.flyTo.copy(slip.userData.rest as Vector3);
    if (from == null || this.reduceMotion) {
      // Look + pinch: drop in from just above the jar.
      if (this.reduceMotion) return playDrop();
      this.flyFrom.set(this.flyTo.x, JAR.height + 0.05, this.flyTo.z);
    } else {
      slip.parent!.worldToLocal(this.flyFrom.copy(from));
    }
    this.flyTime = 0;
    slip.position.copy(this.flyFrom);
    this.flying = slip;
  }

  // --- Flick detection, from the session's select (pinch) events ----------

  private watchSession(state: VisibilityState): void {
    const session = state === VisibilityState.NonImmersive
      ? null
      : this.world.renderer.xr.getSession();
    if (session === this.session) return;
    this.session?.removeEventListener('selectstart', this.onSelectStart);
    this.session?.removeEventListener('selectend', this.onSelectEnd);
    this.session = session;
    session?.addEventListener('selectstart', this.onSelectStart);
    session?.addEventListener('selectend', this.onSelectEnd);
  }

  private handOf(event: XRInputSourceEvent): Hand | null {
    const source = event.inputSource;
    if (source.hand == null) return null;
    return source.handedness === 'left' || source.handedness === 'right'
      ? source.handedness
      : null;
  }

  private selectStart(event: XRInputSourceEvent): void {
    const hand = this.handOf(event);
    if (hand == null) return;
    const pinch = this.pinches[hand];
    pinch.active = true;
    pinch.grabbed = this.queries.grabbed.entities.size > 0;
    pinch.time = performance.now() / 1000;
    this.player.gripSpaces[hand].getWorldPosition(pinch.start);
  }

  private selectEnd(event: XRInputSourceEvent): void {
    const hand = this.handOf(event);
    if (hand == null) return;
    const pinch = this.pinches[hand];
    if (!pinch.active) return;
    pinch.active = false;
    if (pinch.grabbed || flightPhase.peek() !== FlightPhase.Cruise) return;
    if (performance.now() / 1000 - pinch.time > FLICK_MAX_SECONDS) return;

    this.player.gripSpaces[hand].getWorldPosition(this.hand);
    this.hand.sub(pinch.start);
    const moved = this.hand.length();
    if (moved < FLICK_MIN_DISTANCE) return;
    this.jar.object3D!.getWorldPosition(this.jarWorld);
    this.toJar.copy(this.jarWorld).sub(pinch.start);
    if (this.hand.angleTo(this.toJar) > FLICK_MAX_ANGLE) return;
    this.player.gripSpaces[hand].getWorldPosition(this.hand);
    this.park(this.hand);
  }

  // --- Model ----------------------------------------------------------------

  private build(tray: Entity): void {
    const group = new Group();
    group.name = 'thought-jar';
    group.position.set(JAR_POSITION[0], TRAY_LAYOUT.surfaceY, JAR_POSITION[2]);
    group.visible = false;

    this.glass = new MeshStandardMaterial({
      color: 0xcfe3ff,
      roughness: 0.1,
      metalness: 0,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      emissive: PALETTE.doneGlow,
      emissiveIntensity: 0,
    });
    const glass = new Mesh(
      new CylinderGeometry(JAR.radius, JAR.radius * 0.94, JAR.height, 32, 1, true),
      this.glass,
    );
    glass.name = 'jar-glass';
    glass.position.y = JAR.height / 2;
    group.add(glass);
    const base = new Mesh(
      new CylinderGeometry(JAR.radius * 0.94, JAR.radius * 0.94, 0.004, 32),
      new MeshStandardMaterial({ color: 0xcfe3ff, roughness: 0.2, transparent: true, opacity: 0.5 }),
    );
    base.name = 'jar-base';
    base.position.y = 0.002;
    group.add(base);
    const lid = new Mesh(
      new CylinderGeometry(JAR.radius * 1.06, JAR.radius * 1.06, 0.012, 32),
      new MeshStandardMaterial({ color: 0xffb547, roughness: 0.5 }),
    );
    lid.name = 'jar-lid';
    lid.position.y = JAR.height + 0.006;
    group.add(lid);

    // Paper slips, laid in a loose stack at the bottom.
    const paper = new MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.9 });
    const slipGeometry = roundedSlabGeometry(0.03, 0.018, 0.002, 0.003);
    for (let i = 0; i < MAX_SLIPS; i++) {
      const slip = new Mesh(slipGeometry, paper);
      slip.name = `jar-slip-${i + 1}`;
      const angle = i * 2.4;
      const rest = new Vector3(Math.cos(angle) * 0.006, 0.006 + i * 0.004, Math.sin(angle) * 0.006);
      slip.userData.rest = rest;
      slip.userData.restTilt = 0.15 * Math.sin(i);
      slip.position.copy(rest);
      slip.rotation.set(0, angle, slip.userData.restTilt);
      slip.visible = false;
      group.add(slip);
      this.slips.push(slip);
    }

    // Label in front of the jar, tipped back toward the user.
    this.label = createTextPanel('jar-label', 0.08, 0.018);
    this.label.mesh.rotation.x = -Math.PI / 2 + 0.6;
    this.label.mesh.position.set(0, 0.006, JAR.radius + 0.016);
    group.add(this.label.mesh);

    // A larger invisible target so gaze lands on the jar easily.
    const hit = new Mesh(
      new CylinderGeometry(0.045, 0.045, JAR.height + 0.02, 20),
      new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    hit.name = 'jar-hit';
    hit.position.y = (JAR.height + 0.02) / 2;
    group.add(hit);

    this.jar = this.world.createTransformEntity(group, { parent: tray });
    this.jar.addComponent(ThoughtJar);
    this.showSlips();
  }
}
