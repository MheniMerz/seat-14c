// Dev: advance the scripted capture flight one step (see the capture loop).
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  const step = await app.evaluate(() => {
    const s = window.seat14c;
    s.captureStep = (s.captureStep ?? 0) + 1;
    return s.captureStep;
  });
  await app.evaluate((step) => {
    const s = window.seat14c;
    if (step === 1) { s.chooseCard(0); s.releaseKnobAt(-20); }
    if (step === 2) { s.takeOff(); s.setTimeScale(400); }
    if (step === 3) { s.setTimeScale(1); }
    if (step === 4) { s.land('done'); s.skipWindDownTo(1.5); }
    if (step === 5) { s.skipWindDownTo(60); }
  }, step);
  if (step === 2) await page.waitForTimeout(1500);
  if (step === 2) await app.evaluate(() => window.seat14c.setTimeScale(1));
  if (step === 3) await app.waitForFunction(() => window.seat14c.phase === 'landing', null, { timeout: 1 }).catch(async () => {
    await app.evaluate(() => window.seat14c.setTimeScale(100000));
    await page.waitForTimeout(300);
  });
  await page.waitForTimeout(700);
  return String(step);
}
