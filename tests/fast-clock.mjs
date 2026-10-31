// Dev only: run the flight clock 120x so a 5-minute flight lands in 2.5 s.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => window.seat14c.setTimeScale(120));
  return 'ok';
}
