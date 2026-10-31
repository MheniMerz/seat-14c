// Seeds tasks with no progress (a first launch) and boards.
import { boardWithSampleTasks } from './helpers.mjs';
export default async function run({ page, frame }) {
  await boardWithSampleTasks(page, frame, 'first-launch');
  return 'boarded';
}
