// Flight dial, Take off button and the cruise timer.
//   npx @iwsdk/cli browser run tests/dial-smoke.mjs
import { boardWithSampleTasks, reporter } from './helpers.mjs';

export default async function run({ page, frame }) {
  const { check, report } = reporter();
  const app = await boardWithSampleTasks(page, frame);
  const s = (fn, ...args) => app.evaluate(([fn, args]) => {
    const v = window.seat14c[fn];
    return typeof v === 'function' ? v(...args) : v;
  }, [fn, args]);

  await s('setPhase', 'preflight');
  await page.waitForTimeout(300);
  check('dial starts unset', (await s('dialState')).label === 'Set length', (await s('dialState')).label);
  check('Take off hidden with nothing chosen', (await s('buttonState')).visible === false);

  await s('stepDial');
  check('look+pinch steps to 5 min', (await s('plan')).minutes === 5);
  await s('stepDial'); await s('stepDial'); await s('stepDial'); await s('stepDial');
  check('stepping wraps 45 -> 5', (await s('plan')).minutes === 5);

  await s('releaseKnobAt', -27);
  check('twist released at -27deg snaps to 25 min', (await s('plan')).minutes === 25);
  await page.waitForTimeout(600);
  const dial = await s('dialState');
  check('knob eases to the 25 stop (-20deg)', Math.abs(dial.angleDeg + 20) < 1.5, `${dial.angleDeg}deg`);
  check('dial label shows choice', dial.label === '25 min', dial.label);

  check('Take off still hidden without a task', (await s('buttonState')).visible === false);
  await s('chooseCard', 0);
  await page.waitForTimeout(50);
  const button = await s('buttonState');
  check('Take off appears with task + length', button.visible && button.interactable, JSON.stringify(button));

  await s('releaseKnobAt', 70);
  check('5 min flight', (await s('plan')).minutes === 5);
  await s('takeOff');
  check('take off -> cruise', (await s('phase')) === 'cruise');
  check('Take off hidden in cruise', (await s('buttonState')).visible === false);

  await s('stepDial');
  check('dial locked in cruise', (await s('plan')).minutes === 5);

  await s('setTimeScale', 120); // 5 min flight in 2.5 s
  await page.waitForTimeout(1200);
  const mid = await s('plan');
  check('clock runs in cruise', mid.elapsed > 60 && mid.elapsed < 300, `${mid.elapsed}s`);
  check('dial shows time to go', /min to go$/.test((await s('dialState')).label), (await s('dialState')).label);
  await page.waitForTimeout(2500);
  check('lands when the clock runs out', (await s('phase')) === 'landing', await s('phase'));
  await s('setTimeScale', 1);
  return report();
}
