// Task cards: choose, swap, exclusive Now slot, drop in pocket.
//   npx @iwsdk/cli browser run tests/cards-smoke.mjs
import { boardWithSampleTasks, near, reporter } from './helpers.mjs';

export default async function run({ page, frame }) {
  const { check, report } = reporter();
  const app = await boardWithSampleTasks(page, frame);
  const s = (fn, ...args) => app.evaluate(([fn, args]) => {
    const v = window.seat14c[fn];
    return typeof v === 'function' ? v(...args) : v;
  }, [fn, args]);
  const places = async () => (await s('cards')).map((c) => c.place).join(',');

  await s('setPhase', 'preflight');
  await page.waitForTimeout(300);
  const cards = await s('cards');
  check('three cards spawned', cards.length === 3, cards.map((c) => c.name).join(','));
  check('all start on tray', (await places()) === 'tray,tray,tray', await places());

  await s('chooseCard', 1);
  check('look+pinch card 2 -> Now, rest to pocket', (await places()) === 'pocket,now,pocket', await places());
  check('plan has task 2', (await s('plan')).taskId === 't-2');

  await s('dropCardAt', 0, 0.01, 0.06, -0.06);
  check('drop card 1 on stand swaps it in', (await places()) === 'now,pocket,pocket', await places());
  const nowCount = (await s('cards')).filter((c) => c.place === 'now').length;
  check('Now slot holds exactly one card', nowCount === 1, String(nowCount));
  check('plan has task 1', (await s('plan')).taskId === 't-1');

  await s('dropCardAt', 2, 0, 0.01, 0.1);
  check('pocket card dropped on tray front stays in pocket', (await places()) === 'now,pocket,pocket', await places());

  await page.waitForTimeout(800);
  const eased = (await s('cards'))[2].local;
  check('released card eases back to pocket slot', near(eased, [0.15, 0.03, -0.168], 0.01), JSON.stringify(eased));

  await s('dropCardAt', 0, 0, 0.02, -0.15);
  check('Now card dropped behind tray goes to pocket', (await places()) === 'pocket,pocket,pocket', await places());
  check('plan cleared', (await s('plan')).taskId === null);

  await s('chooseCard', 0);
  return report();
}
