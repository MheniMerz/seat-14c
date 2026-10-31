// Prints the phase, tutorial step and the stored boardingDone flag.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return app.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem('seat14c.progress.v1') ?? '{}');
    return `${window.seat14c.phase} ${window.seat14c.boardingStep()} ${progress.boardingDone === true}`;
  });
}
