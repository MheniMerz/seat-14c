// Drives the emulated right hand from inside the page so a flick happens at
// real speed: pinch, move, release. Three runs: a quick flick toward the jar,
// a quick flick away from it, and a slow pinch-and-carry toward it. Reports
// the jar's parked count after each.
import { findAppFrame } from './helpers.mjs';

export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate(async () => {
    const s = window.seat14c;
    const hand = window.IWER_DEVICE.hands.right;
    const V = s.world.scene.position.constructor;
    const jar = s.world.scene.getObjectByName('thought-jar').getWorldPosition(new V());
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const wait = async (ms) => { const end = performance.now() + ms; while (performance.now() < end) await frame(); };
    const move = async (from, to, ms) => {
      const start = performance.now();
      for (let t = 0; t < 1; t = (performance.now() - start) / ms) {
        hand.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t);
        await frame();
      }
      hand.position.set(to.x, to.y, to.z);
      await frame();
    };
    const gesture = async (from, to, ms) => {
      hand.position.set(from.x, from.y, from.z);
      await wait(200);
      hand.setPinchValueImmediate(1);
      await wait(120);
      await move(from, to, ms);
      hand.setPinchValueImmediate(0);
      await wait(500);
      return s.jar().parkedThisFlight;
    };
    // Start up and to the left of the jar, above the tray.
    const from = { x: jar.x - 0.18, y: jar.y + 0.2, z: jar.z - 0.02 };
    const toward = { x: jar.x - 0.04, y: jar.y + 0.07, z: jar.z };
    const away = { x: from.x - 0.14, y: from.y + 0.13, z: from.z };
    return {
      flickToward: await gesture(from, toward, 180),
      flickAway: await gesture(from, away, 180),
      slowCarry: await gesture(from, toward, 1400),
    };
  }));
}
