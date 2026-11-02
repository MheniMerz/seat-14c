// The live site's desktop emulator: hand mode with cursor gaze, where a left
// click on the view means "look at this and pinch". Board, wait for preflight,
// then left-click a tray card on screen and expect it on the Now stand.
import { boardWithSampleTasks, reporter } from './helpers.mjs';

export default async function run({ page, frame }) {
  const { check, report } = reporter();
  const app = await boardWithSampleTasks(page, frame);
  // What setUpDesktopEmulator() does in production builds.
  const mode = await app.evaluate(() => {
    const device = window.IWER_DEVICE;
    device.primaryInputMode = 'hand';
    for (const key of Object.getOwnPropertySymbols(device)) {
      const devui = device[key]?.devui;
      if (devui?.setGazeMode) devui.setGazeMode('cursor');
    }
    return { input: device.primaryInputMode, gaze: device.gaze?.connected };
  });
  check('emulator in hand mode with gaze', mode.input === 'hand' && mode.gaze, JSON.stringify(mode));
  await app.waitForFunction(() => window.seat14c.phase === 'preflight', null, { timeout: 12000 });

  // Project the second tray card into the canvas through the XR camera.
  const target = await app.evaluate(() => {
    const { world } = window.seat14c;
    const card = window.seat14c.cards().find((c) => c.place === 'tray');
    const xrCamera = world.renderer.xr.getCamera();
    const eye = xrCamera.cameras[0] ?? xrCamera;
    const v = eye.position.clone().set(...card.world).project(eye);
    const canvases = [...document.querySelectorAll('canvas')]
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 200);
    const rect = canvases[canvases.length - 1];
    return {
      name: card.name,
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  });
  const box = await (await app.frameElement()).boundingBox();
  const x = box.x + target.x;
  const y = box.y + target.y;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(250);
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(800);
  const after = await app.evaluate((name) => window.seat14c.cards().find((c) => c.name === name)?.place, target.name);
  // Leave the emulator as other suites expect it: head-locked gaze.
  await app.evaluate(() => {
    const device = window.IWER_DEVICE;
    for (const key of Object.getOwnPropertySymbols(device)) {
      device[key]?.devui?.setGazeMode?.('head-locked');
    }
  });
  check('left click on a tray card puts it on the Now stand', after === 'now', `${target.name} -> ${after} at ${x.toFixed(0)},${y.toFixed(0)}`);
  return report();
}
