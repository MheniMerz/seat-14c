// Dev: back to default settings so other suites run as before.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => {
    const raw = localStorage.getItem('seat14c.progress.v1');
    if (raw) { const p = JSON.parse(raw); p.settings = {}; localStorage.setItem('seat14c.progress.v1', JSON.stringify(p)); }
    window.seat14c.applySettings({ gazeOnly: false, oneHand: false, highContrast: false, reduceMotion: false, textSize: 'M' });
  });
  return 'ok';
}
