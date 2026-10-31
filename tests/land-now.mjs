// Dev: run the flight clock fast enough that any flight lands within a second.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => window.seat14c.setTimeScale(5000));
  await app.waitForFunction(() => window.seat14c.phase === 'landing', null, { timeout: 5000 });
  await app.evaluate(() => window.seat14c.setTimeScale(1));
  return 'ok';
}
