// From landing: save the task for later, skip the wind-down, Finish, then on
// the check-in page turn the first parked thought into a task and let the
// second go.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  if (await app.evaluate(() => window.seat14c.phase !== 'checkin')) await finish(app, page);
  return review(app);
}

async function finish(app, page) {
  await app.evaluate(() => window.seat14c.landingAction('later'));
  await app.waitForFunction(() => window.seat14c.phase === 'winddown', null, { timeout: 2000 });
  await app.evaluate(() => window.seat14c.skipWindDownTo(60));
  await page.waitForTimeout(300);
  await app.evaluate(() => window.seat14c.landingAction('finish'));
  await app.waitForFunction(() => window.seat14c.phase === 'checkin', null, { timeout: 8000 });
  await page.waitForTimeout(300);
}

async function review(app) {
  const items = app.locator('#thought-list li');
  const before = await items.count();
  await app.getByTestId('thought-note-1').fill('Email Sam about the venue');
  // Three open tasks already: no room for a fourth until one goes.
  const blockedWhenFull = await items.first().getByRole('button', { name: 'Make it a task' }).isDisabled();
  await app.getByRole('button', { name: 'Remove task 3' }).click();
  await app.getByTestId('thought-note-1').fill('Email Sam about the venue');
  await items.first().getByRole('button', { name: 'Make it a task' }).click();
  await items.first().getByRole('button', { name: 'Let it go' }).click();
  const after = await items.count();
  const tasks = await app.locator('#task-list .task-title').evaluateAll((els) => els.map((e) => e.value));
  const stored = await app.evaluate(() => JSON.parse(localStorage.getItem('seat14c.thoughts.v1') ?? '[]').length);
  return JSON.stringify({ blockedWhenFull, before, after, stored, tasks, sectionHidden: await app.locator('#thoughts').isHidden() });
}
