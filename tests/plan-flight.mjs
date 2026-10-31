// Dev: choose the first card and set 25 minutes (no takeoff).
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => { window.seat14c.chooseCard(0); window.seat14c.releaseKnobAt(-20); });
  await page.waitForTimeout(600);
  return JSON.stringify(await app.evaluate(() => window.seat14c.mapState()));
}
