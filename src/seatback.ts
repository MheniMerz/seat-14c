import {
  createSystem,
  effect,
  Entity,
  Group,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';
import { flightClock, flightPhase, FlightPhase, flightPlan } from './flight-state.js';
import { LandingSystem } from './landing.js';
import { legIndex, nextDestination, positionAt, ROUTE } from './route.js';
import { loadProgress, MILES_PER_MINUTE } from './storage.js';
import { PALETTE, roundedSlabGeometry } from './models.js';
import { createTextPanel, roundRect, TextPanel } from './text-panel.js';
import { TRAY_DEFAULTS, TraySystem } from './tray.js';

const deg = Math.PI / 180;

/** Seat-back screen size (16:9) and where it stands in tray space. */
const SCREEN = { width: 0.24, height: 0.135, pixelsPerMetre: 4000 };
export const SEAT_BACK = { width: 0.34, height: 0.3, z: -0.19, bottomY: -0.06 };
/** Height of the screen's centre in the upright seat-back frame. */
export const SCREEN_CENTER_Y = SEAT_BACK.bottomY + SEAT_BACK.height - SCREEN.height / 2 - 0.025;
/** Seat-back controls sit this far either side of the screen's centre. */
export const SEAT_BACK_BUTTON_X = SCREEN.width / 2 + 0.035;
/** Seconds between map redraws while cruising. */
const CRUISE_REDRAW = 0.5;

const COLORS = {
  sky: '#101a33',
  land: '#1b2a4a',
  grid: 'rgba(166, 174, 208, 0.12)',
  future: 'rgba(166, 174, 208, 0.55)',
  flown: '#ffb547',
  text: '#eef1fb',
  muted: '#a6aed0',
};

type MapView = { minX: number; minY: number; scale: number; offX: number; offY: number };

/**
 * The seat-back screen: an in-flight map at eye level behind the tray. In
 * preflight it plots the route the chosen length will fly; in cruise the
 * plane moves along it; after landing the flown route stays drawn and any
 * destination reached is announced.
 */
export class SeatbackSystem extends createSystem({}) {
  private screen!: TextPanel;
  private seatBack!: Entity;
  private sinceRedraw = 0;
  private point = { x: 0, y: 0 };
  /** Miles flown before this flight, read when a flight is planned. */
  private baseMiles = 0;

  init(): void {
    this.build(this.world.getSystem(TraySystem)!.tray);

    this.cleanupFuncs.push(
      flightPhase.subscribe((phase) => {
        if (phase === FlightPhase.Preflight) {
          this.baseMiles = loadProgress().totalMiles;
        }
        this.seatBack.object3D!.visible =
          phase !== FlightPhase.CheckIn &&
          phase !== FlightPhase.Calibrating &&
          phase !== FlightPhase.Boarding;
      }),
      effect(() => {
        // Redraw on any change to what the map shows.
        void flightPhase.value;
        void flightPlan.minutes.value;
        this.redraw();
      }),
    );

    if (import.meta.env.DEV) {
      const debug = window as unknown as { seat14c?: Record<string, unknown> };
      debug.seat14c = Object.assign(debug.seat14c ?? {}, {
        mapState: () => ({ ...this.view(), baseMiles: this.baseMiles }),
      });
    }
  }

  update(delta: number): void {
    if (flightPhase.peek() !== FlightPhase.Cruise) return;
    this.sinceRedraw += delta;
    if (this.sinceRedraw >= CRUISE_REDRAW) {
      this.sinceRedraw = 0;
      this.redraw();
    }
  }

  /** Miles before, planned for, and flown on the current flight. */
  private view(): { base: number; planned: number; flown: number; header: string; banner: string } {
    const phase = flightPhase.peek();
    const record = this.world.getSystem(LandingSystem)?.lastRecord;
    if (phase === FlightPhase.WindDown && record != null) {
      const base = record.progress.totalMiles - record.miles;
      const reached = record.reached[record.reached.length - 1];
      const next = nextDestination(record.progress.totalMiles);
      return {
        base,
        planned: record.miles,
        flown: record.miles,
        header: next ? `Next: ${next.name} · ${next.miles - record.progress.totalMiles} mi` : 'Route complete',
        banner: reached ? `Postcard stamped: ${reached.name}` : `+${record.miles} miles`,
      };
    }
    const planned = flightPlan.minutes.peek() * MILES_PER_MINUTE;
    const flown =
      phase === FlightPhase.Cruise || phase === FlightPhase.Landing
        ? Math.round((flightClock.elapsed.peek() / 60) * MILES_PER_MINUTE)
        : 0;
    const next = nextDestination(this.baseMiles + flown);
    const header = next
      ? `Next: ${next.name} · ${next.miles - this.baseMiles - flown} mi`
      : 'Route complete';
    let banner = '';
    if (phase === FlightPhase.Landing) {
      banner = 'Landed · drop the card on Done, or tap Not yet';
    } else if (phase === FlightPhase.Preflight) {
      const passed = ROUTE.filter(
        (d) => d.miles > this.baseMiles && d.miles <= this.baseMiles + planned,
      );
      const passes = passed[passed.length - 1];
      banner =
        planned === 0
          ? 'Set a flight length to plot the route'
          : passes
            ? `${planned} mi · reaches ${passes.name}`
            : `${planned} mi toward ${next?.name ?? 'home'}`;
    }
    return { base: this.baseMiles, planned, flown, header, banner };
  }

  private redraw(): void {
    const { base, planned, flown, header, banner } = this.view();
    this.screen.draw((ctx, w, h) => {
      ctx.fillStyle = COLORS.sky;
      roundRect(ctx, 0, 0, w, h, 28);
      ctx.fill();

      const top = 64;
      const view = fitView(base, Math.max(planned, flown), w, h - top, top);
      drawGrid(ctx, w, h, top);
      this.drawRoute(ctx, view, base, planned, flown);

      ctx.fillStyle = COLORS.muted;
      ctx.font = '600 26px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('FLIGHT MAP', 28, 34);
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.text;
      ctx.font = '600 28px system-ui, sans-serif';
      ctx.fillText(header, w - 28, 34);

      if (banner !== '') {
        ctx.font = '600 30px system-ui, sans-serif';
        const bw = ctx.measureText(banner).width + 48;
        ctx.fillStyle = 'rgba(16, 26, 51, 0.85)';
        roundRect(ctx, (w - bw) / 2, h - 70, bw, 50, 25);
        ctx.fill();
        ctx.fillStyle = COLORS.flown;
        ctx.textAlign = 'center';
        ctx.fillText(banner, w / 2, h - 45);
      }
    });
  }

  private drawRoute(
    ctx: CanvasRenderingContext2D,
    view: MapView,
    base: number,
    planned: number,
    flown: number,
  ): void {
    const project = (x: number, y: number): [number, number] => [
      view.offX + (x - view.minX) * view.scale,
      view.offY + (y - view.minY) * view.scale,
    ];
    const along = (from: number, to: number) => {
      positionAt(from, this.point);
      ctx.beginPath();
      ctx.moveTo(...project(this.point.x, this.point.y));
      for (const d of ROUTE) {
        if (d.miles > from && d.miles < to) ctx.lineTo(...project(d.x, d.y));
      }
      positionAt(to, this.point);
      ctx.lineTo(...project(this.point.x, this.point.y));
    };
    const last = ROUTE[ROUTE.length - 1].miles;

    // Whole route ahead, dotted.
    ctx.lineWidth = 4;
    ctx.setLineDash([4, 12]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.future;
    along(0, last);
    ctx.stroke();

    // The planned flight, dashed amber.
    if (planned > flown) {
      ctx.setLineDash([18, 12]);
      ctx.strokeStyle = 'rgba(255, 181, 71, 0.7)';
      ctx.lineWidth = 6;
      along(base + flown, base + planned);
      ctx.stroke();
    }

    // Everything flown so far, solid.
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.flown;
    ctx.lineWidth = 6;
    along(0, base + flown);
    ctx.stroke();

    // Destinations.
    const reachedUpTo = base + flown;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const d of ROUTE) {
      const [px, py] = project(d.x, d.y);
      const reached = d.miles <= reachedUpTo;
      ctx.beginPath();
      ctx.arc(px, py, reached ? 10 : 8, 0, Math.PI * 2);
      ctx.fillStyle = reached ? COLORS.flown : COLORS.sky;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = reached ? COLORS.flown : COLORS.future;
      ctx.stroke();
      ctx.fillStyle = reached ? COLORS.text : COLORS.muted;
      ctx.font = `${reached ? 600 : 500} 24px system-ui, sans-serif`;
      ctx.fillText(d.name, px, py - 20);
    }

    // The plane, pointing along its current leg.
    positionAt(base + flown, this.point);
    const [px, py] = project(this.point.x, this.point.y);
    const leg = Math.min(legIndex(base + flown), ROUTE.length - 2);
    const heading = Math.atan2(
      ROUTE[leg + 1].y - ROUTE[leg].y,
      ROUTE[leg + 1].x - ROUTE[leg].x,
    );
    drawPlane(ctx, px, py, heading);
  }

  private build(tray: Entity): void {
    const group = new Group();
    group.name = 'seat-back';
    // Stand upright in the world: undo the tray's tilt.
    group.rotation.x = -TRAY_DEFAULTS.tiltDeg * deg;
    group.position.set(0, 0, SEAT_BACK.z);

    const shell = new Mesh(
      roundedSlabGeometry(SEAT_BACK.width, SEAT_BACK.height, 0.03, 0.04),
      new MeshStandardMaterial({ color: PALETTE.seatBack, roughness: 0.85 }),
    );
    shell.name = 'seat-back-shell';
    // Stand the slab up: its depth becomes height.
    shell.rotation.x = Math.PI / 2;
    shell.position.set(0, SEAT_BACK.bottomY + SEAT_BACK.height / 2, -0.016);
    const bezel = new Mesh(
      roundedSlabGeometry(SCREEN.width + 0.014, SCREEN.height + 0.014, 0.004, 0.012),
      new MeshStandardMaterial({ color: 0x0b0f1c, roughness: 0.4 }),
    );
    bezel.name = 'seat-back-bezel';
    bezel.rotation.x = Math.PI / 2;
    bezel.position.set(0, SCREEN_CENTER_Y, 0);
    group.add(bezel);
    group.add(shell);

    this.screen = createTextPanel(
      'seat-back-screen',
      SCREEN.width,
      SCREEN.height,
      SCREEN.pixelsPerMetre,
    );
    this.screen.mesh.position.set(0, SCREEN_CENTER_Y, 0.0025);
    group.add(this.screen.mesh);

    this.seatBack = this.world.createTransformEntity(group, { parent: tray });
    group.visible = false;
  }
}

/** Fit the base position, flight end and next destination into the map. */
function fitView(
  base: number,
  span: number,
  width: number,
  height: number,
  top: number,
): MapView {
  const start = ROUTE[legIndex(base)];
  const end = base + span;
  const ahead = nextDestination(end) ?? ROUTE[ROUTE.length - 1];
  const points = [start, positionAt(base), positionAt(end), ahead];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  // Keep a minimum span so short hops don't zoom in absurdly.
  const minSpan = 120;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spanX = Math.max(maxX - minX, minSpan) * 1.35;
  const spanY = Math.max(maxY - minY, minSpan * 0.4) * 1.6;
  const scale = Math.min(width / spanX, height / spanY);
  return {
    minX: cx - width / scale / 2,
    minY: cy - height / scale / 2,
    scale,
    offX: 0,
    offY: top,
  };
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, top: number): void {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  for (let x = 60; x < w; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = top + 60; y < h; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.fillStyle = COLORS.text;
  ctx.strokeStyle = COLORS.sky;
  ctx.lineWidth = 3;
  ctx.beginPath();
  // Simple top-down airliner: fuselage, wings, tail.
  ctx.moveTo(22, 0);
  ctx.lineTo(4, -4);
  ctx.lineTo(-2, -20);
  ctx.lineTo(-8, -20);
  ctx.lineTo(-6, -4);
  ctx.lineTo(-16, -3);
  ctx.lineTo(-20, -10);
  ctx.lineTo(-24, -10);
  ctx.lineTo(-22, 0);
  ctx.lineTo(-24, 10);
  ctx.lineTo(-20, 10);
  ctx.lineTo(-16, 3);
  ctx.lineTo(-6, 4);
  ctx.lineTo(-8, 20);
  ctx.lineTo(-2, 20);
  ctx.lineTo(4, 4);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}
