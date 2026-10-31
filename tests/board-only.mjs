// Seeds the sample tasks and boards; leaves the flight in calibration.
import { boardWithSampleTasks } from './helpers.mjs';
export default async function run({ page, frame }) {
  await boardWithSampleTasks(page, frame);
  return 'boarded';
}
