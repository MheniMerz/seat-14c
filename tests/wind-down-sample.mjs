// Restarts the breathing guide and samples one full breath (10 s) every
// half second: [seconds, inhale, ring scale].
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => window.seat14c.skipWindDownTo(0));
  const samples = [];
  for (let i = 0; i <= 20; i++) {
    const w = await app.evaluate(() => window.seat14c.windDown());
    samples.push([w.elapsed, w.breath.inhale, w.ringScale, w.label]);
    await page.waitForTimeout(500);
  }
  return JSON.stringify(samples);
}
