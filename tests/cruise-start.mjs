// Dev: choose the first card, set 25 min and take off (normal clock).
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => {
    const s = window.seat14c;
    s.chooseCard(0); s.releaseKnobAt(-20); s.takeOff();
  });
  await page.waitForTimeout(500);
  return 'ok';
}
