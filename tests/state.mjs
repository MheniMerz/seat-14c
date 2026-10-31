// Prints the debug state (phase, plan, cards, tray) as JSON.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate(() => ({
    phase: window.seat14c.phase,
    plan: window.seat14c.plan(),
    cards: window.seat14c.cards?.(),
    tray: window.seat14c.trayState?.(),
    calibration: window.seat14c.calibration?.(),
  })));
}
