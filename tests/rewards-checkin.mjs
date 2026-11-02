// From the summary: Finish, then read the check-in postcards and cabin
// choice, pick the Night flight cabin, and board again.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => window.seat14c.landingAction('finish'));
  await app.waitForFunction(() => window.seat14c.phase === 'checkin', null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const postcards = await app.locator('#postcards .postcard').evaluateAll((els) =>
    els.map((e) => `${e.dataset.destination}:${e.classList.contains('locked') ? 'locked' : 'collected'}`));
  const cabin = app.getByLabel('Cabin', { exact: true });
  const nightEnabled = await cabin.locator('option[value="night"]').isEnabled();
  await cabin.selectOption('night');
  const saved = await app.evaluate(() => JSON.parse(localStorage.getItem('seat14c.progress.v1')).cabinTheme);
  await app.getByRole('button', { name: 'Board' }).click();
  await app.waitForFunction(() => window.seat14c.phase !== 'checkin', null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  const trayTop = await app.evaluate(() =>
    '#' + window.seat14c.world.scene.getObjectByName('tray-top').material.color.getHexString());
  return JSON.stringify({ postcards, nightEnabled, saved, trayTop,
    heading: await app.locator('#postcards-heading').textContent().catch(() => null) });
}
