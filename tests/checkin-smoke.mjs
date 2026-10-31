// Check-in page: type tasks, reorder, persist, Board.
//   npx @iwsdk/cli browser run tests/checkin-smoke.mjs
import { findAppFrame, reporter } from './helpers.mjs';

export default async function run({ page, frame }) {
  const { check, report } = reporter();
  await frame.evaluate(() => {
    localStorage.removeItem('seat14c.tasks.v1');
    localStorage.removeItem('seat14c.progress.v1');
    location.reload();
  });
  await page.waitForTimeout(500);
  const app = await findAppFrame(page);

  check('first-flight stats line', (await app.locator('#stats').textContent()).startsWith('First flight'));
  check('Board disabled with no task', await app.getByRole('button', { name: 'Board' }).isDisabled());

  await app.getByTestId('task-title-1').fill('Write Devpost description');
  await app.getByTestId('task-steps-1').fill('Inspiration\nHow it was built\nWhat is next');
  await app.getByRole('button', { name: '+ Add a task' }).click();
  await app.getByTestId('task-title-2').fill('Review flight dial design');
  await app.getByRole('button', { name: '+ Add a task' }).click();
  await app.getByTestId('task-title-3').fill('Reply to playtesters');
  check('add disabled at three tasks', await app.getByRole('button', { name: '+ Add a task' }).isDisabled());
  await app.getByRole('button', { name: 'Move task 2 up' }).click();

  const stored = await app.evaluate(() => JSON.parse(localStorage.getItem('seat14c.tasks.v1') ?? '[]'));
  check('tasks persisted in new order', stored.map((t) => t.title).join('|') ===
    'Review flight dial design|Write Devpost description|Reply to playtesters', stored.map((t) => t.title).join('|'));
  check('subtasks persisted', stored[1].subtasks.length === 3, String(stored[1].subtasks.length));

  await app.getByRole('button', { name: 'Board' }).click();
  await app.waitForFunction(() => window.seat14c?.phase === 'calibrating', null, { timeout: 10000 });
  check('Board enters calibration', true);
  check('check-in hidden in XR', await app.locator('#checkin').isHidden());
  await page.waitForTimeout(1000);
  check('tray visible in XR', (await app.evaluate(() => window.seat14c.trayState())).visible);

  await page.keyboard.press('3');
  check('debug key 3 jumps to preflight', (await app.evaluate(() => window.seat14c.phase)) === 'preflight');
  return report();
}
