// Field-of-view check for the current phase against Meta VR Glasses
// (70° x 66°). Each element's mesh bounds are projected into head space.
// "straight": fully visible looking straight ahead.
// "glance":   fully visible with the head tipped 15° down, as when reading
//             something on a tray.
import { findAppFrame } from './helpers.mjs';

const HALF_W = 35;
const HALF_H = 33;
const GLANCE = 15;

// Elements per phase; "!" marks those that must be visible straight ahead.
const SCREENS = {
  calibrating: ['!calibration-hint', 'tray-top'],
  boarding: ['!boarding-hint', '!boarding-pass', 'dial'],
  preflight: ['card-1', 'card-2', 'card-3', 'dial', '!seat-back-screen', 'tray-raise',
    'tray-lower', 'done-stack', 'takeoff-button', '!NOW'],
  cruise: ['!NOW', '!progress-track', '!dial-plate', 'steps-panel', '!seat-back-screen',
    'thought-jar'],
  landing: ['!NOW', 'done-stack', 'landing-later', '!seat-back-screen'],
  winddown: ['!wind-down-panel', '!wind-down-ring', '!wind-down-skip', '!summary-card',
    '!summary-again', '!summary-finish', 'summary-postcard'],
};

export default async function run({ page }) {
  const app = await findAppFrame(page);
  return JSON.stringify(await app.evaluate(({ SCREENS, HALF_W, HALF_H, GLANCE }) => {
    const s = window.seat14c;
    const scene = s.world.scene;
    const V = scene.position.constructor;
    const head = s.world.player.head;
    head.updateWorldMatrix(true, false);
    const toHead = head.matrixWorld.clone().invert();
    const now = s.cards?.().find((c) => c.place === 'now')?.name;
    const out = [];
    for (const entry of SCREENS[s.phase] ?? []) {
      const strict = entry.startsWith('!');
      const name = entry.replace('!', '') === 'NOW' ? now : entry.replace('!', '');
      const object = name && scene.getObjectByName(name);
      let visible = !!object;
      for (let o = object; visible && o; o = o.parent) visible = o.visible;
      if (!visible) continue;
      let yaw = [Infinity, -Infinity];
      let pitch = [Infinity, -Infinity];
      object.updateWorldMatrix(true, true);
      object.traverseVisible((mesh) => {
        if (!mesh.isMesh) return;
        const materials = [].concat(mesh.material);
        if (materials.every((m) => m.colorWrite === false)) return;
        mesh.geometry.computeBoundingBox();
        const b = mesh.geometry.boundingBox;
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
          const p = new V(x, y, z).applyMatrix4(mesh.matrixWorld).applyMatrix4(toHead);
          const a = Math.atan2(p.x, -p.z) * 180 / Math.PI;
          const e = Math.atan2(p.y, Math.hypot(p.x, p.z)) * 180 / Math.PI;
          yaw = [Math.min(yaw[0], a), Math.max(yaw[1], a)];
          pitch = [Math.min(pitch[0], e), Math.max(pitch[1], e)];
        }
      });
      const inYaw = yaw[0] >= -HALF_W && yaw[1] <= HALF_W;
      const straight = inYaw && pitch[0] >= -HALF_H && pitch[1] <= HALF_H;
      const glance = inYaw && pitch[0] >= -HALF_H - GLANCE && pitch[1] <= HALF_H - GLANCE;
      out.push({
        name: entry.replace('NOW', name),
        yaw: yaw.map((v) => Math.round(v)),
        pitch: pitch.map((v) => Math.round(v)),
        ok: strict ? straight : straight || glance,
        view: straight ? 'straight' : glance ? 'glance' : 'out',
      });
    }
    return { phase: s.phase, elements: out };
  }, { SCREENS, HALF_W, HALF_H, GLANCE }));
}
