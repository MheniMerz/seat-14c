// Prints the id of card 1's face texture; it changes when the face repaints.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return app.evaluate(() =>
    String(window.seat14c.world.scene.getObjectByName('card-1-body').material[2].map.id));
}
