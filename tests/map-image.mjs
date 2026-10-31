// Dev: saves the seat-back screen canvas as a PNG data URL.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return app.evaluate(() => {
    const mesh = window.seat14c.world.scene.getObjectByName('seat-back-screen');
    return mesh.material.map.image.toDataURL('image/png');
  });
}
