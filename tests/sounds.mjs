// Prints and clears the dev sound log.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return (await app.evaluate(() => window.seat14c.sounds())).join(',');
}
