import {
  BoxGeometry,
  CanvasTexture,
  createSystem,
  effect,
  Entity,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PokeInteractable,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
  VisibilityState,
} from '@iwsdk/core';
import { TakeoffButton } from './cabin-components.js';
import { demoTimeScale } from './desktop-emulator.js';
import { PALETTE, slabMesh } from './models.js';
import {
  flightClock,
  flightPhase,
  FlightPhase,
  flightPlan,
  setFlightPhase,
} from './flight-state.js';
import { TRAY_LAYOUT, TraySystem } from './tray.js';

const BUTTON = { width: 0.13, height: 0.014, depth: 0.05 };
const PROGRESS = { width: 0.12, height: 0.004, depth: 0.006, offsetZ: 0.054 };

/**
 * Take off and cruise. The Take off button appears once a task is in the Now
 * slot and a length is set; it can be poked or looked at and pinched. In
 * cruise the focus clock runs (only while the session is visible and not
 * paused) and a slim line under the active card fills toward landing.
 */
export class FlightTimerSystem extends createSystem({
  pressedButton: { required: [TakeoffButton, Pressed] },
}) {
  private button!: Entity;
  private buttonFace!: MeshStandardMaterial;
  private progressFill!: Object3D;
  private progressTrack!: Object3D;
  /** Clock multiplier: `?demo` in the URL, or set by scripted dev flights. */
  timeScale = demoTimeScale();

  init(): void {
    const traySystem = this.world.getSystem(TraySystem)!;
    this.buildButton(traySystem.tray);
    this.buildProgress(traySystem.tray.object3D!.getObjectByName('now-stand')!);

    this.cleanupFuncs.push(
      effect(() => {
        const ready =
          flightPhase.value === FlightPhase.Preflight &&
          flightPlan.taskId.value != null &&
          flightPlan.minutes.value > 0;
        this.setButtonEnabled(ready);
        const cruising =
          flightPhase.value === FlightPhase.Cruise ||
          flightPhase.value === FlightPhase.Landing;
        this.progressTrack.visible = cruising;
      }),
      this.queries.pressedButton.subscribe('disqualify', () => this.takeOff()),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        takeOff: () => this.takeOff(),
        setTimeScale: (scale: number) => (this.timeScale = scale),
        buttonState: () => ({
          visible: this.button.object3D!.visible,
          interactable: this.button.hasComponent(RayInteractable),
        }),
      });
    }
  }

  update(delta: number): void {
    const glow = this.button.hasComponent(Pressed)
      ? 0.45
      : this.button.hasComponent(Hovered)
        ? 0.22
        : 0;
    this.buttonFace.emissiveIntensity +=
      (glow - this.buttonFace.emissiveIntensity) * Math.min(1, delta * 14);

    if (flightPhase.peek() !== FlightPhase.Cruise) return;
    const total = flightPlan.minutes.peek() * 60;
    if (
      !flightClock.paused.peek() &&
      this.world.visibilityState.peek() === VisibilityState.Visible
    ) {
      // Never log more focus than the flight was planned for.
      flightClock.elapsed.value = Math.min(
        total,
        flightClock.elapsed.peek() + delta * this.timeScale,
      );
    }
    const progress = total > 0 ? Math.min(1, flightClock.elapsed.peek() / total) : 0;
    this.progressFill.scale.x = Math.max(0.0001, progress);
    if (progress >= 1) {
      setFlightPhase(FlightPhase.Landing);
    }
  }

  private takeOff(): void {
    if (!this.button.hasComponent(RayInteractable)) return;
    flightClock.elapsed.value = 0;
    flightClock.paused.value = false;
    this.progressFill.scale.x = 0.0001;
    setFlightPhase(FlightPhase.Cruise);
  }

  /** Hidden buttons must not catch gaze or pokes, so drop the components. */
  private setButtonEnabled(enabled: boolean): void {
    this.button.object3D!.visible = enabled;
    if (enabled && !this.button.hasComponent(RayInteractable)) {
      this.button.addComponent(RayInteractable);
      this.button.addComponent(PokeInteractable);
    } else if (!enabled && this.button.hasComponent(RayInteractable)) {
      this.button.removeComponent(RayInteractable);
      this.button.removeComponent(PokeInteractable);
    }
  }

  private buildButton(tray: Entity): void {
    const canvas = document.createElement('canvas');
    canvas.width = 416;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffb547';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1406';
    ctx.font = '700 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Take off', canvas.width / 2, canvas.height / 2 + 2);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;

    const side = new MeshStandardMaterial({ color: PALETTE.amberDeep, roughness: 0.6 });
    this.buttonFace = new MeshStandardMaterial({
      map: texture,
      roughness: 0.6,
      emissive: 0xffffff,
      emissiveIntensity: 0,
    });
    const mesh = slabMesh(
      'takeoff-button',
      { width: BUTTON.width, depth: BUTTON.depth, thickness: BUTTON.height, radius: 0.01 },
      this.buttonFace,
      side,
    );
    mesh.position.set(
      0,
      TRAY_LAYOUT.surfaceY + BUTTON.height / 2,
      TRAY_LAYOUT.cardRowZ,
    );
    this.button = this.world.createTransformEntity(mesh, { parent: tray });
    this.button.addComponent(TakeoffButton);
    mesh.visible = false;
  }

  private buildProgress(stand: Object3D): void {
    const track = new Mesh(
      new BoxGeometry(PROGRESS.width, PROGRESS.height, PROGRESS.depth),
      new MeshBasicMaterial({ color: 0x2b3245 }),
    );
    track.name = 'progress-track';
    track.position.set(0, 0, PROGRESS.offsetZ);
    const fillGeometry = new BoxGeometry(
      PROGRESS.width,
      PROGRESS.height * 1.3,
      PROGRESS.depth * 1.1,
    );
    // Grow from the left edge.
    fillGeometry.translate(PROGRESS.width / 2, 0, 0);
    const fill = new Mesh(fillGeometry, new MeshBasicMaterial({ color: 0xffb547 }));
    fill.name = 'progress-fill';
    fill.position.x = -PROGRESS.width / 2;
    fill.scale.x = 0.0001;
    track.add(fill);
    track.visible = false;
    stand.add(track);
    this.progressTrack = track;
    this.progressFill = fill;
  }
}
