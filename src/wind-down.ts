import { CABIN, cabinSettings, INK } from './accessibility.js';
import {
  createSystem,
  Entity,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  PokeInteractable,
  Pressed,
  RayInteractable,
  RingGeometry,
  VisibilityState,
} from '@iwsdk/core';
import { WindDownSkip } from './cabin-components.js';
import { flightPhase, FlightPhase, windDownStep } from './flight-state.js';
import { BUTTON, buttonMesh, LandingSystem } from './landing.js';
import { slabFace } from './models.js';
import { createTextPanel, roundRect, TextPanel } from './text-panel.js';

/** One breath: in through an opening hand, out through a closing one (s). */
export const BREATH_IN = 4;
export const BREATH_OUT = 6;
/** Six breaths make the one-minute wind-down. */
export const BREATHS = 6;
export const WIND_DOWN_SECONDS = BREATHS * (BREATH_IN + BREATH_OUT);

const PANEL = { width: 0.34, height: 0.15 };
const RING_X = -0.11;
const RING_MIN = 0.45;

/**
 * The one-minute breathing wind-down after landing. A ring swells for a
 * four-second in-breath while the user opens both hands, and shrinks for a
 * six-second out-breath while they close them. Skip goes straight to the
 * summary card, which also follows once the minute is up.
 */
export class WindDownSystem extends createSystem({
  skip: { required: [WindDownSkip] },
  pressedSkip: { required: [WindDownSkip, Pressed] },
}) {
  /** Seconds into the wind-down; paused while the headset is blurred. */
  elapsed = 0;
  private panel!: TextPanel;
  private root!: Entity;
  private ring!: Mesh;
  private ringMaterial!: MeshBasicMaterial;
  private skipButton!: Entity;
  private shown = '';
  private breath: Breath = { index: 0, inhale: true, progress: 0 };

  init(): void {
    this.build();

    this.cleanupFuncs.push(
      flightPhase.subscribe(() => this.refresh()),
      windDownStep.subscribe(() => this.refresh()),
      this.queries.pressedSkip.subscribe('disqualify', () => this.finish()),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        windDown: () => ({
          step: windDownStep.peek(),
          elapsed: +this.elapsed.toFixed(2),
          breath: breathAt(this.elapsed),
          ringScale: +this.ring.scale.x.toFixed(3),
          label: this.shown,
        }),
        skipWindDownTo: (seconds: number) => (this.elapsed = seconds),
      });
    }
  }

  update(delta: number): void {
    const face = slabFace(this.skipButton.object3D as Mesh);
    const glow = this.skipButton.hasComponent(Pressed)
      ? 0.45
      : this.skipButton.hasComponent(Hovered)
        ? 0.22
        : 0;
    face.emissiveIntensity += (glow - face.emissiveIntensity) * Math.min(1, delta * 14);

    if (!this.active()) return;
    if (this.world.visibilityState.peek() === VisibilityState.Visible) {
      this.elapsed += delta;
    }
    if (this.elapsed >= WIND_DOWN_SECONDS) {
      this.finish();
      return;
    }

    const breath = breathAt(this.elapsed, this.breath);
    // Ease in and out so the ring moves like a breath, not a metronome.
    const fill = breath.inhale
      ? easeInOut(breath.progress)
      : 1 - easeInOut(breath.progress);
    // Reduced motion: the ring keeps its size and only changes colour.
    const scale = CABIN.reducedMotion ? 1 : RING_MIN + (1 - RING_MIN) * fill;
    this.ring.scale.setScalar(scale);
    this.ringMaterial.color.setRGB(
      0.35 + 0.65 * fill,
      0.45 + 0.26 * fill,
      0.75 - 0.47 * fill,
    );
    this.draw(breath);
  }

  private active(): boolean {
    return flightPhase.peek() === FlightPhase.WindDown && windDownStep.peek() === 'breathe';
  }

  private finish(): void {
    if (this.active()) windDownStep.value = 'summary';
  }

  private refresh(): void {
    const active = this.active();
    if (active && !this.root.object3D!.visible) {
      this.elapsed = 0;
      this.shown = '';
      this.world.getSystem(LandingSystem)!.placeAboveTray(this.root, -0.06);
    }
    this.root.object3D!.visible = active;
    if (active && !this.skipButton.hasComponent(RayInteractable)) {
      this.skipButton.addComponent(RayInteractable);
      this.skipButton.addComponent(PokeInteractable);
    } else if (!active && this.skipButton.hasComponent(RayInteractable)) {
      this.skipButton.removeComponent(RayInteractable);
      this.skipButton.removeComponent(PokeInteractable);
    }
  }

  /** Redraws only when the instruction or the seconds left change. */
  private draw(breath: Breath): void {
    const left = Math.ceil(WIND_DOWN_SECONDS - this.elapsed);
    const label = `${breath.inhale ? 'in' : 'out'} ${breath.index} ${left}`;
    if (label === this.shown) return;
    this.shown = label;
    this.panel.draw((ctx, w, h) => {
      ctx.fillStyle = INK.panel;
      roundRect(ctx, 0, 0, w, h, 40);
      ctx.fill();
      const x = w * 0.36;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = INK.accent;
      ctx.font = '600 26px system-ui, sans-serif';
      ctx.fillText(`WIND-DOWN · BREATH ${breath.index + 1} OF ${BREATHS}`, x, 62);
      ctx.fillStyle = INK.text;
      ctx.font = '700 56px system-ui, sans-serif';
      ctx.fillText(breath.inhale ? 'Breathe in' : 'Breathe out', x, 140);
      ctx.fillStyle = INK.muted;
      ctx.font = '500 30px system-ui, sans-serif';
      const { gazeOnly, oneHand } = cabinSettings.peek();
      ctx.fillText(
        gazeOnly
          ? breath.inhale ? 'As the ring grows' : 'As the ring shrinks'
          : breath.inhale
            ? oneHand ? 'Slowly open your hand' : 'Slowly open both hands'
            : 'Slowly close again',
        x,
        192,
      );
      ctx.fillText(`${left}s to the summary`, x, 246);
    });
  }

  private build(): void {
    const group = new Group();
    group.name = 'wind-down';
    group.visible = false;
    this.root = this.world.createTransformEntity(group);

    this.panel = createTextPanel('wind-down-panel', PANEL.width, PANEL.height);
    group.add(this.panel.mesh);

    // The ring sits on the panel's left; its scale is the breath.
    this.ringMaterial = new MeshBasicMaterial({ color: 0xffb547 });
    this.ring = new Mesh(new RingGeometry(0.036, 0.046, 64), this.ringMaterial);
    this.ring.name = 'wind-down-ring';
    this.ring.position.set(RING_X, 0, 0.002);
    group.add(this.ring);

    const mesh = buttonMesh('wind-down-skip', 'Skip');
    // Stand the button up so its face (+Y) points at the user (+Z).
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(0, -PANEL.height / 2 - BUTTON.depth / 2 - 0.01, 0.01);
    this.skipButton = this.world.createTransformEntity(mesh, { parent: this.root });
    this.skipButton.addComponent(WindDownSkip);
  }
}

type Breath = { index: number; inhale: boolean; progress: number };

/** Which breath, which half of it, and how far through that half. */
export function breathAt(
  seconds: number,
  out: Breath = { index: 0, inhale: true, progress: 0 },
): Breath {
  const cycle = BREATH_IN + BREATH_OUT;
  out.index = Math.min(BREATHS - 1, Math.floor(seconds / cycle));
  const t = seconds - out.index * cycle;
  out.inhale = t < BREATH_IN;
  out.progress = out.inhale ? t / BREATH_IN : Math.min(1, (t - BREATH_IN) / BREATH_OUT);
  return out;
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
