// Dev: empty the parking-lot jar.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  await app.evaluate(() => localStorage.removeItem('seat14c.thoughts.v1'));
  return 'ok';
}
