// Dev: choose the first card, 5 min, take off, land immediately, "Not yet".
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => {
    const s = window.seat14c;
    s.chooseCard(0); s.releaseKnobAt(60); s.takeOff(); s.setTimeScale(600);
  });
  await app.waitForFunction(() => window.seat14c.phase === 'landing', null, { timeout: 5000 });
  await app.evaluate(() => window.seat14c.landingAction('later'));
  await app.waitForFunction(() => window.seat14c.phase === 'winddown', null, { timeout: 2000 });
  await app.evaluate(() => window.seat14c.setTimeScale(1));
  return 'ok';
}
