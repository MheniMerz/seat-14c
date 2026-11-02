// Prints the parking-lot jar's state.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate(() => window.seat14c.jar()));
}
