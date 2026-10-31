// Dev: what each pointer is currently hitting, to debug gaze suppression.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate(() => {
    const xr = window.seat14c.world.input.xr;
    const out = {};
    for (const hand of ['left', 'right']) {
      const mp = xr.multiPointers[hand];
      out[hand] = Object.fromEntries(['ray', 'grab', 'touch'].map((k) => {
        const p = mp.getPointer(k);
        return [k, { enabled: p.getEnabled(), hit: p.getIntersection()?.object?.name ?? null }];
      }));
    }
    const g = xr.gazePointer;
    out.gaze = { keys: Object.keys(g).slice(0, 25), hit: g.pointer?.getIntersection?.()?.object?.name ?? null, enabled: g.pointer?.getEnabled?.() };
    return out;
  }));
}
