/**
 * Postcard art for each destination on the route, painted on a 2D canvas
 * so the same card shows in the cabin (as a texture) and on the check-in
 * page. Each place is a few flat shapes in the cabin palette: a sky, a
 * landscape, and one landmark, plus a stamp and the place's name.
 */

type Ground = 'sea' | 'hills' | 'mountains' | 'dunes' | 'marsh' | 'city';
type Landmark = 'lighthouse' | 'waterfall' | 'boat' | 'lanterns' | 'aurora' | 'sun' | 'islands' | 'towers';

type Scene = { sky: [string, string]; ground: Ground; land: string; landmark: Landmark };

const SCENES: Record<string, Scene> = {
  'Harbor Point': { sky: ['#7fb8e6', '#d9eefc'], ground: 'sea', land: '#2f5f8a', landmark: 'lighthouse' },
  'Juniper Falls': { sky: ['#8cc7b8', '#e6f4ea'], ground: 'hills', land: '#3d6b4f', landmark: 'waterfall' },
  Saltmarsh: { sky: ['#f2c6a0', '#fbe9d6'], ground: 'marsh', land: '#7a8b4f', landmark: 'sun' },
  'Cobalt Bay': { sky: ['#4f7fd6', '#bcd3f5'], ground: 'sea', land: '#1f3f8a', landmark: 'boat' },
  'Ember Ridge': { sky: ['#e2703a', '#f7c873'], ground: 'mountains', land: '#5a2e2a', landmark: 'sun' },
  Lanternport: { sky: ['#1d2148', '#4a3f7a'], ground: 'sea', land: '#121633', landmark: 'lanterns' },
  'Mistral Isles': { sky: ['#9fd3e0', '#f0fafc'], ground: 'sea', land: '#2b7a8c', landmark: 'islands' },
  'Aurora Station': { sky: ['#0d1630', '#24365e'], ground: 'mountains', land: '#e6eef7', landmark: 'aurora' },
  'Velvet Dunes': { sky: ['#d98c5f', '#f6d9a8'], ground: 'dunes', land: '#b8653a', landmark: 'sun' },
  'Glass Harbor': { sky: ['#5c8fb8', '#cfe3f1'], ground: 'city', land: '#2a4a66', landmark: 'towers' },
  'Summit City': { sky: ['#6f86c9', '#e3e8f7'], ground: 'mountains', land: '#3a4470', landmark: 'towers' },
};
const FALLBACK: Scene = { sky: ['#7fb8e6', '#d9eefc'], ground: 'hills', land: '#3d6b4f', landmark: 'sun' };

/** Paint the postcard for `name` filling the canvas (any size, ~3:2). */
export function drawPostcard(ctx: CanvasRenderingContext2D, w: number, h: number, name: string, miles: number): void {
  const scene = SCENES[name] ?? FALLBACK;
  const r = Math.min(w, h) * 0.06;
  ctx.save();
  // Card stock with a white border, like a real postcard.
  ctx.fillStyle = '#fbf7ef';
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fill();
  const m = w * 0.04;
  const pw = w - m * 2;
  const ph = h - m * 2;
  ctx.beginPath();
  roundRect(ctx, m, m, pw, ph, r * 0.6);
  ctx.clip();
  ctx.translate(m, m);

  const sky = ctx.createLinearGradient(0, 0, 0, ph);
  sky.addColorStop(0, scene.sky[0]);
  sky.addColorStop(1, scene.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, pw, ph);

  const horizon = ph * 0.62;
  drawLandmarkBehind(ctx, scene, pw, ph, horizon);
  drawGround(ctx, scene, pw, ph, horizon);
  drawLandmarkFront(ctx, scene, pw, ph, horizon);

  // Name banner across the lower left.
  ctx.fillStyle = 'rgba(20, 24, 42, 0.78)';
  ctx.fillRect(0, ph * 0.74, pw, ph * 0.26);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `italic 700 ${Math.round(ph * 0.12)}px Georgia, 'Times New Roman', serif`;
  ctx.fillText(`Greetings from ${name}`, pw * 0.05, ph * 0.87, pw * 0.7);
  ctx.restore();

  // Stamp in the top right corner, with the miles it took.
  const sw = w * 0.16;
  const sh = sw * 1.15;
  const sx = w - m - sw - w * 0.02;
  const sy = m + h * 0.04;
  ctx.fillStyle = '#fbf7ef';
  ctx.fillRect(sx - 3, sy - 3, sw + 6, sh + 6);
  ctx.fillStyle = '#ffb547';
  ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = '#1a1406';
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(sh * 0.22)}px system-ui, sans-serif`;
  ctx.fillText('14C', sx + sw / 2, sy + sh * 0.38);
  ctx.font = `600 ${Math.round(sh * 0.15)}px system-ui, sans-serif`;
  ctx.fillText(`${miles.toLocaleString()} mi`, sx + sw / 2, sy + sh * 0.72);
}

function drawGround(ctx: CanvasRenderingContext2D, scene: Scene, w: number, h: number, y: number): void {
  ctx.fillStyle = scene.land;
  ctx.beginPath();
  switch (scene.ground) {
    case 'sea':
      ctx.rect(0, y, w, h - y);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = h * 0.012;
      for (let i = 0; i < 3; i++) {
        const wy = y + (h - y) * (0.2 + i * 0.22);
        ctx.beginPath();
        for (let x = 0; x <= w; x += w / 24) {
          ctx.lineTo(x, wy + Math.sin(x / (w / 12) + i) * h * 0.012);
        }
        ctx.stroke();
      }
      return;
    case 'hills':
    case 'dunes':
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 40) {
        const k = scene.ground === 'dunes' ? 3 : 2;
        ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * k) * h * 0.06);
      }
      ctx.lineTo(w, h);
      break;
    case 'mountains':
      ctx.moveTo(0, h);
      ctx.lineTo(0, y);
      ctx.lineTo(w * 0.22, y - h * 0.3);
      ctx.lineTo(w * 0.4, y - h * 0.08);
      ctx.lineTo(w * 0.6, y - h * 0.38);
      ctx.lineTo(w * 0.82, y - h * 0.1);
      ctx.lineTo(w, y - h * 0.2);
      ctx.lineTo(w, h);
      break;
    case 'marsh':
      ctx.rect(0, y, w, h - y);
      ctx.fill();
      ctx.strokeStyle = '#4f5d2e';
      ctx.lineWidth = w * 0.006;
      for (let i = 0; i < 18; i++) {
        const x = (i / 18) * w + (i % 3) * w * 0.01;
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.1);
        ctx.lineTo(x + w * 0.01, y - h * 0.05 - (i % 4) * h * 0.02);
        ctx.stroke();
      }
      return;
    case 'city':
      ctx.rect(0, y, w, h - y);
      ctx.fill();
      return;
  }
  ctx.closePath();
  ctx.fill();
}

function drawLandmarkBehind(ctx: CanvasRenderingContext2D, scene: Scene, w: number, h: number, y: number): void {
  switch (scene.landmark) {
    case 'sun':
      ctx.fillStyle = 'rgba(255, 236, 170, 0.95)';
      ctx.beginPath();
      ctx.arc(w * 0.3, y - h * 0.05, h * 0.16, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'aurora':
      for (const [color, dy] of [['rgba(125, 255, 168, 0.55)', 0], ['rgba(94, 200, 229, 0.45)', 0.08]] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = h * 0.08;
        ctx.beginPath();
        for (let x = 0; x <= w; x += w / 30) {
          ctx.lineTo(x, h * (0.22 + dy) + Math.sin(x / (w / 5)) * h * 0.07);
        }
        ctx.stroke();
      }
      starField(ctx, w, y);
      return;
    case 'lanterns':
      starField(ctx, w, y);
      return;
    case 'towers':
      ctx.fillStyle = 'rgba(30, 44, 70, 0.85)';
      for (let i = 0; i < 9; i++) {
        const tw = w * 0.07;
        const th = h * (0.18 + ((i * 37) % 23) / 60);
        ctx.fillRect(w * 0.05 + i * w * 0.1, y - th, tw, th);
      }
      return;
    case 'islands':
      ctx.fillStyle = '#3f8f5a';
      for (const [x, s] of [[0.25, 0.14], [0.55, 0.09], [0.78, 0.12]] as const) {
        ctx.beginPath();
        ctx.ellipse(w * x, y + h * 0.01, w * s, h * 0.09, 0, Math.PI, 0);
        ctx.fill();
      }
      return;
    default:
      return;
  }
}

function drawLandmarkFront(ctx: CanvasRenderingContext2D, scene: Scene, w: number, h: number, y: number): void {
  switch (scene.landmark) {
    case 'lighthouse': {
      const x = w * 0.72;
      ctx.fillStyle = '#fbf7ef';
      ctx.beginPath();
      ctx.moveTo(x - w * 0.035, y + h * 0.04);
      ctx.lineTo(x - w * 0.022, y - h * 0.32);
      ctx.lineTo(x + w * 0.022, y - h * 0.32);
      ctx.lineTo(x + w * 0.035, y + h * 0.04);
      ctx.fill();
      ctx.fillStyle = '#d9534f';
      ctx.fillRect(x - w * 0.03, y - h * 0.14, w * 0.06, h * 0.05);
      ctx.fillStyle = '#ffb547';
      ctx.fillRect(x - w * 0.025, y - h * 0.38, w * 0.05, h * 0.06);
      return;
    }
    case 'waterfall':
      ctx.fillStyle = '#e6f6ff';
      ctx.fillRect(w * 0.62, y - h * 0.22, w * 0.06, h * 0.36);
      ctx.fillStyle = '#2f5a42';
      ctx.fillRect(w * 0.56, y - h * 0.26, w * 0.18, h * 0.05);
      return;
    case 'boat':
      ctx.fillStyle = '#fbf7ef';
      ctx.beginPath();
      ctx.moveTo(w * 0.62, y + h * 0.05);
      ctx.lineTo(w * 0.62, y - h * 0.24);
      ctx.lineTo(w * 0.76, y + h * 0.03);
      ctx.fill();
      ctx.fillStyle = '#5a2e2a';
      ctx.fillRect(w * 0.55, y + h * 0.05, w * 0.24, h * 0.04);
      return;
    case 'lanterns':
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = 'rgba(255, 181, 71, 0.9)';
        ctx.beginPath();
        ctx.arc(w * (0.12 + i * 0.12), h * (0.2 + ((i * 7) % 5) * 0.06), h * 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    case 'towers':
      // Reflections in the water below the skyline.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      for (let i = 0; i < 9; i++) {
        ctx.fillRect(w * 0.05 + i * w * 0.1, y + h * 0.02, w * 0.07, h * 0.08);
      }
      return;
    default:
      return;
  }
}

function starField(ctx: CanvasRenderingContext2D, w: number, horizon: number): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 40; i++) {
    const x = ((i * 97) % 100) / 100 * w;
    const y = ((i * 53) % 100) / 100 * horizon * 0.9;
    ctx.fillRect(x, y, 2, 2);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
