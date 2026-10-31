// Seeds the sample tasks, boards, and jumps to preflight. Leaves XR running.
import { boardWithSampleTasks } from './helpers.mjs';
export default async function run({ page, frame }) {
  const app = await boardWithSampleTasks(page, frame);
  await app.evaluate(() => window.seat14c.setPhase('preflight'));
  await page.waitForTimeout(500);
  return JSON.stringify(await app.evaluate(() => window.seat14c.cards().map((c) => [c.name, c.place, c.world])));
}
