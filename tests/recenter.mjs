// Dev: re-place the tray in front of the current head pose.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => window.seat14c.recenterTray());
  return 'ok';
}
