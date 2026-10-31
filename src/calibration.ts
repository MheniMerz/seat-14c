import {
  BoxGeometry,
  CanvasTexture,
  createSystem,
  Entity,
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
import { TrayHeightButton } from './cabin-components.js';
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
      const face = (button.object3D as Mesh).material as MeshStandardMaterial[];
      const glow = button.hasComponent(Pressed) ? 0.45 : button.hasComponent(Hovered) ? 0.22 : 0;
      face[2].emissiveIntensity += (glow - face[2].emissiveIntensity) * Math.min(1, delta * 14);
    }

    if (flightPhase.peek() !== FlightPhase.Calibrating) return;
    if (this.world.visibilityState.peek() !== VisibilityState.Visible) return;

    // Wait out the same settle frames as the tray before sampling hands.
    if (!this.tray.tray.object3D!.visible) return;
    if (!this.hintEntity.object3D!.visible) this.showHint();

    this.elapsed += delta;
    this.tray.getHeadPosition(this.head);

    let tracked = true;
    let moving = false;
    for (const hand of HANDS) {
      if (this.input.xr.getPrimaryInputSource(hand) == null) {
        tracked = false;
        continue;
      }
      const position = this.player.gripSpaces[hand].getWorldPosition(this.now[hand]);
      if (this.head.y - position.y < MIN_HAND_DROP) tracked = false;
      if (this.hadSample && position.distanceTo(this.last[hand]) > STILL_SPEED * delta) {
        moving = true;
      }
      this.last[hand].copy(position);
    }
    this.hadSample = true;
    this.stillTime = tracked && !moving ? this.stillTime + delta : 0;

    if (this.stillTime >= STILL_SECONDS) {
      const handsY = (this.now.left.y + this.now.right.y) / 2;
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
    // The boarding-pass tutorial (first launch) will slot in here.
    setFlightPhase(FlightPhase.Preflight);
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
      ctx.fillStyle = 'rgba(20, 24, 42, 0.88)';
      roundRect(ctx, 0, 0, w, h, 36);
      ctx.fill();

      const cx = 90;
      const cy = h / 2;
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#343c63';
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffb547';
      ctx.beginPath();
      ctx.arc(cx, cy, 46, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#eef1fb';
      ctx.font = '600 40px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('Rest both hands where your tray goes', 170, cy - 22);
      ctx.fillStyle = '#a6aed0';
      ctx.font = '500 32px system-ui, sans-serif';
      ctx.fillText(`Default height in ${secondsLeft}s`, 170, cy + 30);
    });
  }

  private buildHint(): void {
    this.hint = createTextPanel('calibration-hint', 0.48, 0.1);
    this.hintEntity = this.world.createTransformEntity(this.hint.mesh);
    this.hint.mesh.visible = false;
  }

  /** Lower on the tray's left edge, Raise on its right; far apart for gaze. */
  private buildHeightButtons(): void {
    const parent = this.tray.tray;
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
      const mesh = new Mesh(new BoxGeometry(0.04, 0.02, 0.06), [
        side,
        side,
        face,
        side,
        side,
        side,
      ]);
      mesh.name = `tray-${label.toLowerCase()}`;
      mesh.position.set(
        direction * (TRAY_DEFAULTS.width / 2 + 0.024),
        0,
        0.02,
      );
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
