// Dev: restart seat calibration with the hands where they are now, and
// report how it ended.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => window.seat14c.setPhase('calibrating'));
  await app.waitForFunction(() => window.seat14c.phase !== 'calibrating', null, { timeout: 8000 });
  return JSON.stringify(await app.evaluate(() => ({ phase: window.seat14c.phase, ...window.seat14c.calibration() })));
}
