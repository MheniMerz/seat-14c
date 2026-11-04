// Renders video/index.html frame by frame in headless Chromium and pipes the
// frames to ffmpeg. Usage:
//   node video/render.mjs [--fps 24] [--from 0] [--to 165] [--out video/out/film.mp4] [--stills 3,12,40]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Prefer the machine's preinstalled Playwright (its browser is already there);
// fall back to the project's copy.
let playwright;
try { playwright = require('/opt/node22/lib/node_modules/playwright'); } catch { playwright = require('playwright'); }

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
const fps = Number(args.fps ?? 24);
const from = Number(args.from ?? 0);
const to = Number(args.to ?? 165);
const out = resolve(args.out ?? resolve(here, 'out/film.mp4'));
mkdirSync(dirname(out), { recursive: true });

const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(pathToFileURL(resolve(here, 'index.html')).href + '?t=0');
await page.waitForFunction(() => window.filmReady === true, null, { timeout: 30000 });

const grab = (t) => page.evaluate((t) => {
  window.renderAt(t);
  return document.querySelector('canvas').toDataURL('image/jpeg', 0.95).split(',')[1];
}, t);

if (args.stills) {
  for (const t of args.stills.split(',').map(Number)) {
    const { writeFileSync } = await import('node:fs');
    const file = resolve(dirname(out), `still-${String(t).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(await grab(t), 'base64'));
    console.log('wrote', file);
  }
  await browser.close();
  process.exit(0);
}

const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const frames = Math.round((to - from) * fps);
const started = Date.now();
for (let i = 0; i < frames; i++) {
  const buf = Buffer.from(await grab(from + i / fps), 'base64');
  if (!ffmpeg.stdin.write(buf)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
  if (i % (fps * 5) === 0) {
    const rate = (i + 1) / ((Date.now() - started) / 1000);
    console.log(`frame ${i}/${frames}  ${rate.toFixed(2)} fps  eta ${Math.round((frames - i) / rate)} s`);
  }
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on('close', r));
await browser.close();
console.log('wrote', out);
