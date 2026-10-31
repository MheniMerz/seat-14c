import {
  BoxGeometry,
  CanvasTexture,
  createSystem,
  Entity,
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
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playSlot, playTick } from './audio.js';
import { TutorialBody, TutorialKind, TutorialTarget } from './cabin-components.js';
import { flightPhase, FlightPhase, flightPlan, setFlightPhase } from './flight-state.js';
import { slabMesh } from './models.js';
import { loadProgress, saveProgress } from './storage.js';
import { createTextPanel, roundRect, TextPanel } from './text-panel.js';
import { TRAY_DEFAULTS, TRAY_LAYOUT, TraySystem } from './tray.js';

const deg = Math.PI / 180;

/** Pass size in metres; the stub is the right-hand part. */
const PASS = { width: 0.13, stubWidth: 0.045, height: 0.075, thickness: 0.002 };
/** Where the pass floats in tray space, tilted up toward the user. */
const FLOAT = { y: 0.1, z: -0.01, tiltDeg: 55 };
/** Pulling the stub this far (m) from the pass tears it off. */
const TEAR_DISTANCE = 0.03;
/** Released behind this line (tray-space Z) the pass goes in the pocket. */
const POCKET_DROP_Z = -0.12;
const HIT_MARGIN = 0.012;
const EASE_RATE = 10;

type Step = 'stub' | 'pocket' | 'dial' | 'done';

const HINTS: Record<Step, string> = {
  stub: 'Look at the stub and pinch to tear it off',
  pocket: 'Pinch the pass and drop it in the seat pocket',
  dial: 'Pinch the dial and twist to set your flight',
  done: 'Ready for departure',
};

type Kind = (typeof TutorialKind)[keyof typeof TutorialKind];

/**
 * The boarding-pass tutorial, on the first launch only. It teaches the three
 * gestures by doing each once: look + pinch (or pinch and pull) to tear the
 * stub, grab the pass and drop it in the seat pocket, twist the dial. Each
 * step has one line of text and also works by look + pinch alone.
 */
export class BoardingSystem extends createSystem({
  targets: { required: [TutorialTarget] },
  pressedTargets: { required: [TutorialTarget, Pressed] },
  bodies: { required: [TutorialBody] },
  heldBodies: { required: [TutorialBody, Grabbed] },
}) {
  step: Step = 'done';
  /** True from the start of the tutorial until it finishes or is left. */
  private active = false;
  private tray!: Entity;
  private pass!: Group;
  private parts = new Map<Kind, { target: Entity; body: Entity; face: MeshStandardMaterial }>();
  private hint!: TextPanel;
  private hintEntity!: Entity;
  /** Where each part is heading once let go, in tray space. */
  private goal = new Map<Kind, { position: Vector3; quaternion: Quaternion; scale: number }>();
  private matrix = new Matrix4();
  private vec = new Vector3();
  private stepTime = 0;

  init(): void {
    this.tray = this.world.getSystem(TraySystem)!.tray;
    this.buildPass();
    this.buildHint();

    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        if (phase === FlightPhase.Boarding) this.start();
        else if (this.step !== 'done') this.hide();
      }),
      flightPlan.minutes.subscribe((minutes) => {
        if (this.step === 'dial' && minutes > 0) this.advance('done');
      }),
      this.queries.pressedTargets.subscribe('disqualify', (target) => {
        if (this.parts.get(this.kindOf(target))!.body.hasComponent(Grabbed)) return;
        this.complete(this.kindOf(target));
      }),
      this.queries.heldBodies.subscribe('disqualify', (body) => this.onRelease(body)),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        boardingStep: () => this.step,
        boardingComplete: (kind: Kind) => this.complete(kind),
      });
    }
  }

  /** The first launch: tutorial not done and nothing flown yet. */
  static isFirstLaunch(): boolean {
    const progress = loadProgress();
    return !progress.boardingDone && progress.totalMiles === 0;
  }

  update(delta: number): void {
    if (!this.active) return;
    this.stepTime += delta;
    const k = 1 - Math.exp(-delta * EASE_RATE);
    for (const [kind, part] of this.parts) {
      const goal = this.goal.get(kind);
      const object = part.target.object3D!;
      if (goal != null && !part.body.hasComponent(Grabbed)) {
        object.position.lerp(goal.position, k);
        object.quaternion.slerp(goal.quaternion, k);
        object.scale.setScalar(object.scale.x + (goal.scale - object.scale.x) * k);
        // A body let go somewhere else eases back into its root.
        part.body.object3D!.position.lerp(this.vec.set(0, 0, 0), k);
      }
      const glow =
        part.target.hasComponent(Pressed) ? 0.35
        : part.target.hasComponent(Hovered) || part.body.hasComponent(Hovered) ? 0.2
        : this.isCurrent(kind) ? 0.08 + 0.06 * Math.sin(this.stepTime * 4)
        : 0;
      part.face.emissiveIntensity += (glow - part.face.emissiveIntensity) * k;
    }
    // Once in the pocket, the pass sinks out of sight.
    if (this.parts.get(TutorialKind.Pass)!.target.object3D!.scale.x < 0.02) {
      this.pass.visible = false;
    }
    if (this.step === 'done' && this.stepTime > 1.2) this.finish();
  }

  private isCurrent(kind: Kind): boolean {
    return (kind === TutorialKind.Stub && this.step === 'stub') ||
      (kind === TutorialKind.Pass && this.step === 'pocket');
  }

  private kindOf(target: Entity): Kind {
    return target.getValue(TutorialTarget, 'kind') as Kind;
  }

  private start(): void {
    this.active = true;
    this.pass.visible = true;
    for (const [kind, part] of this.parts) {
      part.target.object3D!.visible = true;
      part.target.object3D!.scale.setScalar(1);
      part.body.object3D!.position.set(0, 0, 0);
      this.resetPose(kind);
    }
    this.advance('stub');
  }

  private resetPose(kind: Kind): void {
    const object = this.parts.get(kind)!.target.object3D!;
    const x = kind === TutorialKind.Stub ? PASS.width / 2 + PASS.stubWidth / 2 + 0.002 : 0;
    object.position.set(x, 0, 0);
    object.quaternion.identity();
    this.goal.set(kind, {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: 1,
    });
  }

  private advance(step: Step): void {
    this.step = step;
    this.stepTime = 0;
    setInteractable(this.parts.get(TutorialKind.Stub)!.target, step === 'stub');
    setInteractable(this.parts.get(TutorialKind.Pass)!.target, step === 'pocket');
    this.drawHint();
    this.hintEntity.object3D!.visible = true;
  }

  /** Finish the part's step, by look + pinch or by the hand gesture. */
  private complete(kind: Kind): void {
    if (kind === TutorialKind.Stub && this.step === 'stub') {
      // The torn stub flies up and away.
      this.goal.set(kind, {
        position: new Vector3(0.16, 0.08, -0.05),
        quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -25 * deg),
        scale: 0.001,
      });
      playTick(true);
      this.advance('pocket');
    } else if (kind === TutorialKind.Pass && this.step === 'pocket') {
      // Into the seat pocket: upright, then down out of sight. The pass sits
      // in a group lifted above the tray, so the goal is in that group's space.
      const [, , pz] = TRAY_LAYOUT.pocket.position;
      this.vec.set(0, -0.06, pz);
      this.pass.worldToLocal(this.tray.object3D!.localToWorld(this.vec));
      this.goal.set(kind, {
        position: this.vec.clone(),
        quaternion: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (90 - FLOAT.tiltDeg) * deg),
        scale: 0.001,
      });
      playSlot();
      this.advance('dial');
      if (flightPlan.minutes.peek() > 0) this.advance('done');
    }
  }

  private onRelease(body: Entity): void {
    const target = body.getValue(TutorialBody, 'target') as Entity | null;
    if (target == null) return;
    const kind = this.kindOf(target);
    if (kind === TutorialKind.Stub) {
      if (this.step === 'stub' && body.object3D!.position.length() > TEAR_DISTANCE) {
        this.complete(kind);
      }
      return;
    }
    // Where was the pass let go, in tray space?
    this.tray.object3D!.updateWorldMatrix(true, false);
    body.object3D!.updateWorldMatrix(true, false);
    this.matrix.copy(this.tray.object3D!.matrixWorld).invert().multiply(body.object3D!.matrixWorld);
    this.vec.setFromMatrixPosition(this.matrix);
    if (this.step === 'pocket' && this.vec.z < POCKET_DROP_Z) this.complete(kind);
  }

  private finish(): void {
    const progress = loadProgress();
    progress.boardingDone = true;
    saveProgress(progress);
    this.hide();
    setFlightPhase(FlightPhase.Preflight);
  }

  private hide(): void {
    this.active = false;
    this.step = 'done';
    this.pass.visible = false;
    this.hintEntity.object3D!.visible = false;
    for (const part of this.parts.values()) setInteractable(part.target, false);
  }

  private drawHint(): void {
    const order: Step[] = ['stub', 'pocket', 'dial'];
    const current = order.indexOf(this.step);
    this.hint.draw((ctx, w, h) => {
      ctx.fillStyle = 'rgba(20, 24, 42, 0.88)';
      roundRect(ctx, 0, 0, w, h, 36);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.step === 'done' ? '#7dffa8' : '#eef1fb';
      ctx.font = '600 40px system-ui, sans-serif';
      ctx.fillText(HINTS[this.step], w / 2, h * 0.42);
      order.forEach((_, i) => {
        ctx.beginPath();
        ctx.arc(w / 2 + (i - 1) * 34, h * 0.8, 8, 0, Math.PI * 2);
        ctx.fillStyle = i < current || current < 0 ? '#ffb547' : i === current ? '#eef1fb' : '#343c63';
        ctx.fill();
      });
    });
  }

  private buildHint(): void {
    this.hint = createTextPanel('boarding-hint', 0.48, 0.075);
    // Above the floating pass, tilted to face the user like the pass.
    this.hint.mesh.rotation.x = -TRAY_DEFAULTS.tiltDeg * deg;
    this.hint.mesh.position.set(0, FLOAT.y + 0.1, FLOAT.z - 0.04);
    this.hintEntity = this.world.createTransformEntity(this.hint.mesh, { parent: this.tray });
    this.hint.mesh.visible = false;
  }

  private buildPass(): void {
    this.pass = new Group();
    this.pass.name = 'boarding-pass';
    this.pass.position.set(0, FLOAT.y, FLOAT.z);
    this.pass.rotation.x = FLOAT.tiltDeg * deg;
    // The parts are centred together: shift so the whole pass is centred.
    this.pass.position.x = -PASS.stubWidth / 2;
    this.pass.visible = false;
    const passEntity = this.world.createTransformEntity(this.pass, { parent: this.tray });

    for (const [kind, width, paint] of [
      [TutorialKind.Pass, PASS.width, paintPass],
      [TutorialKind.Stub, PASS.stubWidth, paintStub],
    ] as const) {
      const root = new Group();
      root.name = `boarding-${kind}`;
      const hit = new Mesh(
        new BoxGeometry(width + HIT_MARGIN * 2, 0.012, PASS.height + HIT_MARGIN * 2),
        new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      );
      hit.name = `boarding-${kind}-hit`;
      hit.pointerEventsType = { deny: 'grab' };
      root.add(hit);
      const target = this.world.createTransformEntity(root, { parent: passEntity });
      target.addComponent(TutorialTarget, { kind });

      const face = new MeshStandardMaterial({
        map: canvasTexture(paint, width),
        roughness: 0.7,
        emissive: 0xffffff,
        emissiveIntensity: 0,
      });
      const side = new MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 });
      const mesh = slabMesh(
        `boarding-${kind}-body`,
        { width, depth: PASS.height, thickness: PASS.thickness, radius: 0.004 },
        face,
        side,
      );
      const body = this.world.createTransformEntity(mesh, { parent: target });
      body.addComponent(TutorialBody, { target });
      body.addComponent(OneHandGrabbable, { rotate: false, translate: true });
      this.parts.set(kind, { target, body, face });
    }
  }
}

/** Interactable only while its step is current, so stray pinches do nothing. */
function setInteractable(entity: Entity, enabled: boolean): void {
  if (enabled && !entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
  else if (!enabled && entity.hasComponent(RayInteractable)) entity.removeComponent(RayInteractable);
}

const PX_PER_M = 4000;

function canvasTexture(
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  widthM: number,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthM * PX_PER_M);
  canvas.height = Math.round(PASS.height * PX_PER_M);
  paint(canvas.getContext('2d')!, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function paintPass(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#f6f1e7';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#14182a';
  ctx.fillRect(0, 0, w, 64);
  ctx.fillStyle = '#ffb547';
  ctx.font = '700 36px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('BOARDING PASS', 24, 33);
  ctx.fillStyle = '#5b5446';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText('FROM', 24, 98);
  ctx.fillText('TO', 250, 98);
  ctx.fillText('SEAT', 24, 210);
  ctx.fillText('GATE', 250, 210);
  ctx.fillStyle = '#1a1406';
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillText('Gate 14', 24, 140);
  ctx.fillText('Harbor Pt', 250, 140);
  ctx.fillText('14C', 24, 252);
  ctx.fillText('14', 250, 252);
}

function paintStub(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#f6f1e7';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#14182a';
  ctx.fillRect(0, 0, w, 64);
  // Perforation along the tear line.
  ctx.fillStyle = '#a69d89';
  for (let y = 8; y < h; y += 18) ctx.fillRect(0, y, 5, 9);
  ctx.save();
  ctx.translate(w / 2 + 4, h / 2 + 30);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#1a1406';
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('14C', 0, 0);
  ctx.restore();
}
