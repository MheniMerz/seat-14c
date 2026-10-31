// Prints steps, focus level and the stored steps of task t-1.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate(() => ({
    phase: window.seat14c.phase,
    steps: window.seat14c.stepsState(),
    focus: window.seat14c.focusLevel(),
    stored: JSON.parse(localStorage.getItem('seat14c.tasks.v1'))[0].subtasks.map((s) => s.done),
    dome: window.seat14c.world.scene.getObjectByName('cabin-dim').material.opacity.toFixed(2),
  })));
}
