// Check-in page: turn on Look only, High contrast and Large text through the
// settings panel (plus Reduce motion and One hand), then board with them.
import { boardWithSampleTasks, findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const frame = await findAppFrame(page);
  await frame.evaluate(() => localStorage.removeItem('seat14c.progress.v1'));
  await frame.evaluate(() => location.reload());
  await page.waitForTimeout(500);
  const app = await findAppFrame(page);
  await app.locator('#settings summary').click();
  for (const name of ['Look only', 'One hand', 'High contrast', 'Reduce motion']) {
    await app.getByLabel(name).check();
  }
  await app.getByLabel('Text size in the cabin').selectOption('L');
  const saved = await app.evaluate(() => JSON.parse(localStorage.getItem('seat14c.progress.v1')).settings);
  const progress = {
    version: 1, totalMiles: 0, streakDays: 0, lastFlightDate: '',
    postcards: [], themes: [], boardingDone: true, settings: saved,
  };
  const boarded = await boardWithSampleTasks(page, app, progress);
  await page.waitForTimeout(300);
  return JSON.stringify({ saved, applied: await boarded.evaluate(() => window.seat14c.accessibility()) });
}
