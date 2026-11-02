// Prints the wind-down state and whether the summary card is showing.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate(() => {
    const s = window.seat14c;
    const card = s.world.scene.getObjectByName('summary-card');
    const panel = s.world.scene.getObjectByName('wind-down');
    return { phase: s.phase, ...s.windDown(), summaryVisible: !!card?.visible, panelVisible: !!panel?.visible };
  }));
}
