import { cabinSettings, INK } from './accessibility.js';
import {
  CanvasTexture,
  createSystem,
  Entity,
  Group,
  Hovered,
  Mesh,
  MeshStandardMaterial,
  PokeInteractable,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { BoardingSystem } from './boarding.js';
import { TrayHeightButton } from './cabin-components.js';
import { slabFace, slabMesh } from './models.js';
import { SCREEN_CENTER_Y, SEAT_BACK, SEAT_BACK_BUTTON_X } from './seatback.js';
import { flightPhase, FlightPhase, setFlightPhase } from './flight-state.js';
import { createTextPanel, roundRect, TextPanel } from './text-panel.js';
import { TRAY_DEFAULTS, TraySystem } from './tray.js';

/** Both hands must stay this still (m/s) for this long (s) to calibrate. */
const STILL_SPEED = 0.03;
const STILL_SECONDS = 1;
/** Give up and use the default height after this long (s). */
const TIMEOUT_SECONDS = 5;
/** Hands must rest at least this far below the eyes (m) to count. */
const MIN_HAND_DROP = 0.15;
/**
 * The tray surface sits this far above the resting hands (m). Hands closer
 * than this hover tray items, and IWSDK turns gaze off while a hand hovers.
 */
const TRAY_ABOVE_HANDS = 0.08;
/** One press of Raise or Lower moves the tray this far (m). */
const HEIGHT_STEP = 0.03;

const HANDS = ['left', 'right'] as const;
const deg = Math.PI / 180;

export type CalibrationResult = 'pending' | 'hands' | 'timeout';

/**
 * Seat calibration. In passthrough the user rests both hands where the tray
 * should be; once both are still for a second the tray moves just above
 * them. After 5 seconds without that, the tray stays at its default height.
 * Raise and Lower buttons on the tray's side edges adjust it before takeoff.
 */
export class CalibrationSystem extends createSystem({
  heightButtons: { required: [TrayHeightButton] },
  pressedHeight: { required: [TrayHeightButton, Pressed] },
}) {
  result: CalibrationResult = 'pending';
  private tray!: TraySystem;
  private hint!: TextPanel;
  private hintEntity!: Entity;
  private elapsed = 0;
  private stillTime = 0;
  private hadSample = false;
  private shownStep = -1;
  private last = { left: new Vector3(), right: new Vector3() };
  private tracked = { left: false, right: false };
  private now = { left: new Vector3(), right: new Vector3() };
  private head = new Vector3();
  private forward = new Vector3();

  init(): void {
    this.tray = this.world.getSystem(TraySystem)!;
    this.buildHint();
    this.buildHeightButtons();

    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        const calibrating = phase === FlightPhase.Calibrating;
        this.hintEntity.object3D!.visible = false;
        if (calibrating) {
          this.result = 'pending';
          this.elapsed = 0;
          this.stillTime = 0;
          this.hadSample = false;
          this.tracked.left = this.tracked.right = false;
          this.shownStep = -1;
        }
        this.setButtonsEnabled(phase === FlightPhase.Preflight);
      }),
      this.queries.pressedHeight.subscribe('disqualify', (button) => {
        const direction = button.getValue(TrayHeightButton, 'direction')!;
        // Raising the tray means a smaller drop below the eyes.
        this.tray.setDrop(this.tray.drop - direction * HEIGHT_STEP);
      }),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        calibration: () => ({
          result: this.result,
          elapsed: +this.elapsed.toFixed(2),
          stillTime: +this.stillTime.toFixed(2),
        }),
        pressTrayHeight: (direction: number) =>
          this.tray.setDrop(this.tray.drop - direction * HEIGHT_STEP),
      });
    }
  }

  update(delta: number): void {
    for (const button of this.queries.heightButtons.entities) {
      const face = slabFace(button.object3D as Mesh);
      const glow = button.hasComponent(Pressed) ? 0.45 : button.hasComponent(Hovered) ? 0.22 : 0;
      face.emissiveIntensity += (glow - face.emissiveIntensity) * Math.min(1, delta * 14);
    }

    if (flightPhase.peek() !== FlightPhase.Calibrating) return;
    if (this.world.visibilityState.peek() !== VisibilityState.Visible) return;

    // Wait out the same settle frames as the tray before sampling hands.
    if (!this.tray.tray.object3D!.visible) return;
    if (!this.hintEntity.object3D!.visible) this.showHint();

    this.elapsed += delta;
    this.tray.getHeadPosition(this.head);

    // Both hands must rest, or any one hand in one-hand mode.
    const oneHand = cabinSettings.peek().oneHand;
    let resting = 0;
    let restingY = 0;
    let moving = false;
    for (const hand of HANDS) {
      if (this.input.xr.getPrimaryInputSource(hand) == null) continue;
      const position = this.player.gripSpaces[hand].getWorldPosition(this.now[hand]);
      const wasTracked = this.tracked[hand];
      this.tracked[hand] = this.head.y - position.y >= MIN_HAND_DROP;
      if (!this.tracked[hand]) continue;
      if (wasTracked && this.hadSample && position.distanceTo(this.last[hand]) > STILL_SPEED * delta) {
        moving = true;
      }
      this.last[hand].copy(position);
      resting++;
      restingY += position.y;
    }
    for (const hand of HANDS) {
      if (this.input.xr.getPrimaryInputSource(hand) == null) this.tracked[hand] = false;
    }
    this.hadSample = true;
    const enough = oneHand ? resting >= 1 : resting === 2;
    this.stillTime = enough && !moving ? this.stillTime + delta : 0;

    if (this.stillTime >= STILL_SECONDS) {
      const handsY = restingY / resting;
      this.tray.setDrop(this.head.y - (handsY + TRAY_ABOVE_HANDS));
      this.finish('hands');
    } else if (this.elapsed >= TIMEOUT_SECONDS) {
      this.finish('timeout');
    } else {
      this.drawHint();
    }
  }

  private finish(result: CalibrationResult): void {
    this.result = result;
    this.hintEntity.object3D!.visible = false;
    setFlightPhase(
      BoardingSystem.isFirstLaunch() ? FlightPhase.Boarding : FlightPhase.Preflight,
    );
  }

  /** Float the hint just above the tray, facing the user. */
  private showHint(): void {
    const head = this.player.head;
    this.tray.getHeadPosition(this.head);
    head.getWorldDirection(this.forward).negate();
    this.forward.y = 0;
    this.forward.normalize();
    const object = this.hintEntity.object3D!;
    object.position.copy(this.head).addScaledVector(this.forward, 0.5);
    // Just below eye line, clear of the Now stand.
    object.position.y = this.head.y - 0.03;
    object.lookAt(this.head);
    object.visible = true;
  }

  /** Redraw when the stillness fill or countdown moves a visible step. */
  private drawHint(): void {
    const fill = Math.min(1, this.stillTime / STILL_SECONDS);
    const secondsLeft = Math.ceil(TIMEOUT_SECONDS - this.elapsed);
    const step = Math.round(fill * 10) * 10 + secondsLeft;
    if (step === this.shownStep) return;
    this.shownStep = step;

    this.hint.draw((ctx, w, h) => {
      ctx.fillStyle = INK.panel;
      roundRect(ctx, 0, 0, w, h, 36);
      ctx.fill();

      const cx = 90;
      const cy = h / 2;
      ctx.lineWidth = 14;
      ctx.strokeStyle = INK.line;
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = INK.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, 46, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = INK.text;
      ctx.font = '600 40px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        cabinSettings.peek().oneHand
          ? 'Rest a hand where your tray goes'
          : 'Rest both hands where your tray goes',
        170,
        cy - 22,
      );
      ctx.fillStyle = INK.muted;
      ctx.font = '500 32px system-ui, sans-serif';
      ctx.fillText(`Default height in ${secondsLeft}s`, 170, cy + 30);
    });
  }

  private buildHint(): void {
    this.hint = createTextPanel('calibration-hint', 0.48, 0.1);
    this.hintEntity = this.world.createTransformEntity(this.hint.mesh);
    this.hint.mesh.visible = false;
  }

  /**
   * Lower and Raise on the seat back, either side of the screen, like real
   * seat-back controls: at eye level, inside the glasses' view, and well
   * clear of every tray target for gaze.
   */
  private buildHeightButtons(): void {
    // Same frame as the seat back: upright, behind the tray.
    const frame = new Group();
    frame.name = 'seat-back-controls';
    frame.position.set(0, 0, SEAT_BACK.z);
    frame.rotation.x = -TRAY_DEFAULTS.tiltDeg * deg;
    const parent = this.world.createTransformEntity(frame, { parent: this.tray.tray });
    for (const [direction, label] of [
      [-1, 'Lower'],
      [1, 'Raise'],
    ] as const) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 192;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#3d4656';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#eef1fb';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 64px system-ui, sans-serif';
      ctx.fillText(direction > 0 ? '▲' : '▼', 64, 70);
      ctx.font = '600 30px system-ui, sans-serif';
      ctx.fillText(label, 64, 140);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;

      const side = new MeshStandardMaterial({ color: 0x2a3142, roughness: 0.7 });
      const face = new MeshStandardMaterial({
        map: texture,
        roughness: 0.7,
        emissive: 0xffffff,
        emissiveIntensity: 0,
      });
      const mesh = slabMesh(
        `tray-${label.toLowerCase()}`,
        { width: 0.04, depth: 0.06, thickness: 0.02, radius: 0.008 },
        face,
        side,
      );
      // Stand the slab up so its face (+Y) points at the user (+Z).
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(direction * SEAT_BACK_BUTTON_X, SCREEN_CENTER_Y, 0.01);
      const button = this.world.createTransformEntity(mesh, { parent });
      button.addComponent(TrayHeightButton, { direction });
    }
  }

  private setButtonsEnabled(enabled: boolean): void {
    for (const button of this.queries.heightButtons.entities) {
      button.object3D!.visible = enabled;
      if (enabled && !button.hasComponent(RayInteractable)) {
        button.addComponent(RayInteractable);
        button.addComponent(PokeInteractable);
      } else if (!enabled && button.hasComponent(RayInteractable)) {
        button.removeComponent(RayInteractable);
        button.removeComponent(PokeInteractable);
      }
    }
  }
}
