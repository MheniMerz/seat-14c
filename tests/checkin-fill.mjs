// Clears storage, reloads, and types two tasks on the check-in page.
// Seeds a flight yesterday (streak 2, 100 miles) to check streak growth.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page, frame }) {
  const yesterday = new Date(Date.now() - 864e5);
  const iso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  await frame.evaluate((iso) => {
    localStorage.removeItem('seat14c.tasks.v1');
    localStorage.setItem('seat14c.progress.v1', JSON.stringify({
      version: 1, totalMiles: 100, streakDays: 2, lastFlightDate: iso,
      postcards: [], themes: [], settings: {} }));
    location.reload();
  }, iso);
  await page.waitForTimeout(500);
  const app = await findAppFrame(page);
  await app.getByTestId('task-title-1').fill('Write Devpost description');
  await app.getByTestId('task-steps-1').fill('Inspiration\nHow it was built');
  await app.getByRole('button', { name: '+ Add a task' }).click();
  await app.getByTestId('task-title-2').fill('Review flight dial design');
  return (await app.locator('#stats').textContent()) ?? '';
}
