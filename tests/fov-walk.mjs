// Dev: advance through the flight one phase per run, for the FoV walk.
import { findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const app = await findAppFrame(page);
  const phase = await app.evaluate(() => {
    const s = window.seat14c;
    switch (s.phase) {
      case 'calibrating': s.setPhase('boarding'); break;
      case 'boarding': s.boardingComplete('stub'); s.boardingComplete('pass'); s.releaseKnobAt(-20); break;
      case 'preflight':
        if (s.plan().taskId == null) s.chooseCard(0);
        else { s.takeOff(); }
        break;
      case 'cruise': s.setTimeScale(100000); break;
      case 'landing': s.setTimeScale(1); s.land('done'); break;
      case 'winddown': s.skipWindDownTo(60); break;
    }
    return s.phase;
  });
  await page.waitForTimeout(phase === 'boarding' ? 1800 : 900);
  return app.evaluate(() => window.seat14c.phase);
}
