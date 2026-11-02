// Prints the wrist menu, flight clock and phase.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate(() => ({
    phase: window.seat14c.phase,
    elapsed: +window.seat14c.plan().elapsed.toFixed(2),
    normals: window.seat14c.palmNormals(),
    ...window.seat14c.wristMenu(),
  })));
}
