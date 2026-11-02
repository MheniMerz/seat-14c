// Dev: from a progress of 2-day streak flown yesterday and 0 miles, fly the
// first card for 5 minutes (fast clock) and drop it on Done. That reaches
// Harbor Point (40 miles) and makes a 3-day streak.
import { boardWithSampleTasks, findAppFrame } from './helpers.mjs';
export default async function run({ page }) {
  const frame = await findAppFrame(page);
  const y = new Date(); y.setDate(y.getDate() - 1);
  const iso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  const app = await boardWithSampleTasks(page, frame, {
    version: 1, totalMiles: 0, streakDays: 2, lastFlightDate: iso,
    postcards: [], themes: [], boardingDone: true, settings: {},
  });
  await app.waitForFunction(() => window.seat14c.phase === 'preflight', null, { timeout: 12000 });
  await app.evaluate(() => {
    const s = window.seat14c;
    s.chooseCard(0); s.releaseKnobAt(60); s.takeOff(); s.setTimeScale(5000);
  });
  await app.waitForFunction(() => window.seat14c.phase === 'landing', null, { timeout: 5000 });
  await app.evaluate(() => { window.seat14c.setTimeScale(1); window.seat14c.land('done'); });
  await app.waitForFunction(() => window.seat14c.phase === 'winddown', null, { timeout: 3000 });
  await app.evaluate(() => window.seat14c.skipWindDownTo(60));
  await page.waitForTimeout(500);
  return JSON.stringify(await app.evaluate(() => {
    const s = window.seat14c;
    const card = s.world.scene.getObjectByName('summary-postcard');
    let visible = !!card;
    for (let o = card; visible && o; o = o.parent) visible = o.visible;
    return { record: s.lastRecord(), postcardVisible: visible, postcardName: card?.userData.destination ?? null };
  }));
}
