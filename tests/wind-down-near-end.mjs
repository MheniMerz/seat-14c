// Dev: jump the breathing guide to half a second before its minute is up.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => window.seat14c.skipWindDownTo(59.5));
  return 'ok';
}
