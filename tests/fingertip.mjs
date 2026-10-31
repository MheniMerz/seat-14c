// Prints the right index fingertip and grip world positions.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate(() => {
    const w = window.seat14c.world;
    const V = w.scene.position.constructor;
    const r = (o) => o.getWorldPosition(new V()).toArray().map((v) => +v.toFixed(3));
    return { tip: r(w.player.indexTipSpaces.right), grip: r(w.player.gripSpaces.right) };
  }));
}
