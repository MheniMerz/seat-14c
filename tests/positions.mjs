// Prints world positions of named scene objects as {name: {x,y,z}}.
import { findAppFrame } from './helpers.mjs';
const NAMES = ['card-1', 'card-2', 'card-3', 'dial-knob', 'dial', 'takeoff-button',
  'done-stack', 'landing-later', 'summary-again', 'summary-finish', 'tray-raise', 'tray-lower',
  'step-1', 'step-2', 'step-3'];
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate((names) => {
    const scene = window.seat14c.world.scene;
    const out = {};
    for (const name of names) {
      const o = scene.getObjectByName(name);
      if (!o) continue;
      const p = o.getWorldPosition(new (scene.position.constructor)());
      out[name] = { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) };
    }
    return out;
  }, NAMES));
}
