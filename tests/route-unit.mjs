// Unit checks for route, miles, streak and postcards, run in the page via
// Vite's module server.  npx @iwsdk/cli browser run tests/route-unit.mjs
import { findAppFrame, reporter } from './helpers.mjs';

export default async function run({ page }) {
  const { check, report } = reporter();
  const app = await findAppFrame(page);
  const r = await app.evaluate(async () => {
    const route = await import('/src/route.ts');
    const progress = await import('/src/progress.ts');
    const saved = localStorage.getItem('seat14c.progress.v1');
    const savedTasks = localStorage.getItem('seat14c.tasks.v1');
    localStorage.removeItem('seat14c.progress.v1');
    localStorage.setItem('seat14c.tasks.v1', JSON.stringify([
      { id: 'a', title: 'A', subtasks: [], status: 'open' }]));
    const day = (d) => new Date(2026, 10, d, 9);
    const first = progress.recordFlight('a', 5 * 60, 'done', day(3));
    const second = progress.recordFlight(null, 10 * 60, 'later', day(3));
    const third = progress.recordFlight(null, 25 * 60, 'later', day(4));
    const gap = progress.recordFlight(null, 5 * 60, 'later', day(7));
    const tasks = JSON.parse(localStorage.getItem('seat14c.tasks.v1'));
    if (saved) localStorage.setItem('seat14c.progress.v1', saved); else localStorage.removeItem('seat14c.progress.v1');
    if (savedTasks) localStorage.setItem('seat14c.tasks.v1', savedTasks);
    return {
      firstMiles: first.miles, firstReached: first.reached.map((d) => d.name),
      secondReached: second.reached.map((d) => d.name), secondStreak: second.progress.streakDays,
      thirdTotal: third.progress.totalMiles, thirdReached: third.reached.map((d) => d.name),
      thirdStreak: third.progress.streakDays, gapStreak: gap.progress.streakDays,
      postcards: gap.progress.postcards, taskStatus: tasks[0].status,
      mid: route.positionAt(80), next: route.nextDestination(40).name,
      end: route.nextDestination(99999),
    };
  });
  check('5 min = 40 miles', r.firstMiles === 40, r.firstMiles);
  check('first 5-min flight reaches Harbor Point', r.firstReached.join() === 'Harbor Point', r.firstReached.join());
  check('done flight marks task done', r.taskStatus === 'done');
  check('second flight same day keeps streak at 1', r.secondStreak === 1, r.secondStreak);
  check('landing exactly on 120 mi reaches Juniper Falls', r.secondReached.join() === 'Juniper Falls', r.secondReached.join());
  check('next day grows streak to 2', r.thirdStreak === 2, r.thirdStreak);
  check('320 mi total passes Saltmarsh', r.thirdTotal === 320 && r.thirdReached.join() === 'Saltmarsh', `${r.thirdTotal} ${r.thirdReached.join()}`);
  check('missed days reset streak to 1', r.gapStreak === 1, r.gapStreak);
  check('postcards collected in order', r.postcards.join() === 'Harbor Point,Juniper Falls,Saltmarsh', r.postcards.join());
  check('positionAt interpolates a leg', Math.abs(r.mid.x - 105) < 0.01 && Math.abs(r.mid.y + 5) < 0.01, JSON.stringify(r.mid));
  check('next after exactly 40 mi is Juniper Falls', r.next === 'Juniper Falls', r.next);
  check('route end returns null', r.end === null);
  return report();
}
