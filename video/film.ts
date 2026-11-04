/**
 * Seat 14C — demo film. A deterministic motion-graphics piece that follows
 * the demo video script: soft clay figures, an endless cabin of identical
 * seats in fog, slow surreal camera moves and thin tracked type, in Meta's
 * blues on navy. `window.renderAt(t)` draws the frame at `t` seconds, so
 * the renderer can step frame by frame at any speed.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { drawPostcard } from '../src/postcard-art';

export const W = 1920;
export const H = 1080;
export const DURATION = 165;

// --- Palette -----------------------------------------------------------------
const META_BLUE = 0x0081fb;
const META_DEEP = 0x0064e0;
const NAVY = 0x0a1428;
const FOG = 0x0d1a33;
const CLAY = 0xe6ecf3;
const CLAY_BLUE = 0xb7c6d8;
const CLAY_DARK = 0x2b3b57;
const CSS_BLUE = '#0081FB';
const CSS_INK = '#EEF3FA';

// --- Easing and timing -------------------------------------------------------
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp01(x); return t * t * t * (t * (t * 6 - 15) + 10); };
const outBack = (x: number) => { const t = clamp01(x); const c = 1.4; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
/** 0..1 progress of `t` through [a, b], eased. */
const seg = (t: number, a: number, b: number, ease = smoother) => ease((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const inRange = (t: number, a: number, b: number) => t >= a && t < b;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// --- Renderer, post pass and HUD ----------------------------------------------
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const target = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.HalfFloatType });
target.texture.colorSpace = THREE.LinearSRGBColorSpace;

const hudCanvas = document.createElement('canvas');
hudCanvas.width = W;
hudCanvas.height = H;
const hud = hudCanvas.getContext('2d')!;
const hudTexture = new THREE.CanvasTexture(hudCanvas);
// Sampled raw: the post shader composites it over already-encoded colour.
hudTexture.colorSpace = THREE.NoColorSpace;

/** Grade (navy shadows, cool highlights), vignette, grain, then the type. */
const post = new THREE.ShaderMaterial({
  uniforms: {
    scene: { value: target.texture },
    hud: { value: hudTexture },
    time: { value: 0 },
    mono: { value: 0 },
    warm: { value: 0 },
    fade: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D scene; uniform sampler2D hud; uniform float time; uniform float mono;
    uniform float warm; uniform float fade; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 37.0) * 43758.5453); }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    void main(){
      vec2 d = (vUv - 0.5);
      float ca = 0.0014 * dot(d, d) * 4.0;
      vec3 c;
      c.r = texture2D(scene, vUv + d * ca).r;
      c.g = texture2D(scene, vUv).g;
      c.b = texture2D(scene, vUv - d * ca).b;
      c = aces(c * 1.05);
      c = pow(c, vec3(1.0/2.2));
      // Grade: lift shadows toward navy, cool the highlights.
      vec3 navy = vec3(0.04, 0.08, 0.16);
      c = mix(navy, vec3(1.0), c) * vec3(0.97, 1.0, 1.03);
      c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))) * vec3(1.06), mono);
      c = mix(c, c * vec3(1.12, 0.98, 0.82), warm);
      float vig = smoothstep(0.95, 0.25, length(d * vec2(1.0, 0.85)));
      c *= mix(0.55, 1.0, vig);
      vec4 h = texture2D(hud, vUv);
      c = mix(c, h.rgb, h.a);
      c += (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * 0.035;
      gl_FragColor = vec4(c * fade, 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// --- Scene, lights -------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(NAVY);
scene.fog = new THREE.FogExp2(FOG, 0.06);
const camera = new THREE.PerspectiveCamera(32, W / H, 0.05, 200);

const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x0a1428, 0.9);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(2.5, 6, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4;
key.shadow.camera.right = 4;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -4;
key.shadow.bias = -0.0004;
key.shadow.radius = 6;
scene.add(key);
scene.add(key.target);
const rim = new THREE.DirectionalLight(META_BLUE, 2.2);
rim.position.set(-4, 2.5, -5);
scene.add(rim);
const pool = new THREE.SpotLight(0xffffff, 0, 6, 0.55, 0.7, 1.5);
pool.position.set(0, 2.6, 0.2);
pool.castShadow = true;
pool.shadow.mapSize.set(1024, 1024);
scene.add(pool);
scene.add(pool.target);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x0f1d36, roughness: 0.55, metalness: 0.1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- Materials -------------------------------------------------------------------
const clay = (color: number, rough = 0.42) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color(0xcfe3ff) });
const M = {
  skin: clay(CLAY, 0.38),
  suit: clay(CLAY_DARK, 0.55),
  seat: clay(CLAY_BLUE, 0.6),
  seatDark: clay(0x50627e, 0.6),
  tray: clay(0xd5dde7, 0.5),
  trayRim: clay(0x8796ab, 0.5),
  blue: new THREE.MeshPhysicalMaterial({ color: META_BLUE, roughness: 0.3, clearcoat: 0.8, emissive: META_DEEP, emissiveIntensity: 0.25 }),
  visor: new THREE.MeshPhysicalMaterial({ color: 0x08101f, roughness: 0.15, metalness: 0.4, clearcoat: 1 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xdbeafe, roughness: 0.05, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false }),
  paper: clay(0xfbf7ef, 0.8),
  walnut: clay(0x6b4a32, 0.5),
};

// --- Geometry helpers --------------------------------------------------------------
function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const x = -w / 2 + r, y = -d / 2 + r, iw = w - 2 * r, id = d - 2 * r;
  shape.moveTo(x, y);
  shape.lineTo(x + iw, y);
  shape.absarc(x + iw, y, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + iw + r, y + id);
  shape.absarc(x + iw, y + id, r, 0, Math.PI / 2, false);
  shape.lineTo(x, y + id + r);
  shape.absarc(x, y + id, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x - r, y);
  shape.absarc(x, y, r, Math.PI, Math.PI * 1.5, false);
  const bevel = Math.min(r, h / 2) * 0.9;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, h - bevel * 2), bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel * 0.6, bevelSegments: 4, curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -(h - bevel * 2) / 2, 0);
  geo.computeVertexNormals();
  return geo;
}
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
};
function textTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, ctx, canvas: c };
}
const FONT = `'Inter', 'Helvetica Neue', Arial, sans-serif`;

// --- Seat ------------------------------------------------------------------------
function seatGeometry(): THREE.BufferGeometry {
  const parts = [
    roundedBox(0.5, 0.12, 0.5, 0.05).translate(0, 0.45, 0),
    roundedBox(0.5, 0.75, 0.12, 0.05).rotateX(-0.12).translate(0, 0.85, -0.25),
    roundedBox(0.34, 0.18, 0.1, 0.05).translate(0, 1.32, -0.3),
    roundedBox(0.06, 0.06, 0.45, 0.03).translate(0.27, 0.62, 0),
    roundedBox(0.06, 0.06, 0.45, 0.03).translate(-0.27, 0.62, 0),
    roundedBox(0.08, 0.4, 0.08, 0.03).translate(0, 0.2, 0),
  ];
  // Normalize attributes so they merge.
  for (const g of parts) { g.deleteAttribute('uv'); }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
const SEAT_GEO = seatGeometry();
const ROWS = 36;
const corridor = new THREE.InstancedMesh(SEAT_GEO, M.seat, ROWS * 4);
corridor.castShadow = true;
corridor.receiveShadow = true;
scene.add(corridor);
const tmp = new THREE.Object3D();
function layoutCorridor(sink: number, t: number) {
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (const x of [-1.15, -0.6, 0.6, 1.15]) {
      const z = -r * 0.95;
      // The surreal sink: seats melt into the floor row by row, wobbling.
      const s = clamp01(sink * 1.6 - r * 0.03 - (Math.abs(x) > 1 ? 0.05 : 0));
      // The hero passenger's own seat stands in this spot.
      const hero = r === 0 && x === 0.6;
      tmp.position.set(x, -s * 1.5 + Math.sin(t * 2 + r) * 0.02 * s, z);
      tmp.scale.set(1 + s * 0.15, Math.max(0.02, 1 - s * 0.9), 1 + s * 0.15);
      if (hero) tmp.scale.setScalar(0.0001);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      corridor.setMatrixAt(i++, tmp.matrix);
    }
  }
  corridor.instanceMatrix.needsUpdate = true;
}

// --- Figure ------------------------------------------------------------------------
/** A faceless clay passenger in a dark suit, wearing glasses. */
function buildFigure() {
  const root = new THREE.Group();
  const torso = mesh(new THREE.CapsuleGeometry(0.17, 0.32, 8, 20), M.suit);
  torso.position.set(0, 0.92, -0.08);
  torso.rotation.x = -0.1;
  root.add(torso);
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 16), M.skin);
  neck.position.set(0, 1.2, -0.1);
  root.add(neck);
  const head = mesh(new THREE.SphereGeometry(0.12, 32, 24), M.skin);
  head.scale.set(0.92, 1.08, 1);
  head.position.set(0, 1.34, -0.08);
  root.add(head);
  const visor = mesh(roundedBox(0.2, 0.06, 0.08, 0.03), M.visor);
  visor.position.set(0, 1.36, 0.02);
  root.add(visor);
  const visorGlow = mesh(new THREE.BoxGeometry(0.17, 0.006, 0.002), M.blue, false);
  visorGlow.position.set(0, 1.33, 0.063);
  root.add(visorGlow);
  const thighs = mesh(new THREE.CapsuleGeometry(0.075, 0.32, 6, 14), M.suit);
  thighs.rotation.x = Math.PI / 2;
  thighs.position.set(0.09, 0.56, 0.12);
  root.add(thighs);
  const thigh2 = thighs.clone();
  thigh2.position.x = -0.09;
  root.add(thigh2);
  const arms: Record<'left' | 'right', { shoulder: THREE.Group; elbow: THREE.Group }> = {} as never;
  for (const side of ['left', 'right'] as const) {
    const sx = side === 'right' ? 1 : -1;
    const shoulder = new THREE.Group();
    shoulder.position.set(0.2 * sx, 1.1, -0.08);
    const upper = mesh(new THREE.CapsuleGeometry(0.05, 0.22, 6, 12), M.suit);
    upper.position.y = -0.14;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    const fore = mesh(new THREE.CapsuleGeometry(0.045, 0.2, 6, 12), M.suit);
    fore.position.y = -0.12;
    elbow.add(fore);
    const hand = mesh(new THREE.SphereGeometry(0.05, 16, 12), M.skin);
    hand.scale.set(0.8, 1.3, 0.55);
    hand.position.y = -0.27;
    elbow.add(hand);
    shoulder.add(elbow);
    root.add(shoulder);
    arms[side] = { shoulder, elbow };
  }
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { root, arms, head, visorGlow };
}
const figure = buildFigure();
scene.add(figure.root);
const heroSeat = mesh(SEAT_GEO, M.seat);
scene.add(heroSeat);

// --- Hand (close-ups) ---------------------------------------------------------------
/** A large clay hand: palm, four fingers, a thumb; thumb and index pinch. */
function buildHand() {
  const root = new THREE.Group();
  const palm = mesh(roundedBox(0.34, 0.11, 0.38, 0.07), M.skin);
  root.add(palm);
  const finger = (x: number, len: number, curl: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.0, -0.18);
    const m = mesh(new THREE.CapsuleGeometry(0.036, len, 6, 14), M.skin);
    m.rotation.x = Math.PI / 2;
    m.position.z = -len / 2 - 0.03;
    g.add(m);
    g.rotation.x = curl;
    root.add(g);
    return g;
  };
  const index = finger(0.12, 0.2, 0.1);
  finger(0.04, 0.22, 0.35);
  finger(-0.04, 0.2, 0.45);
  finger(-0.115, 0.15, 0.55);
  const thumb = new THREE.Group();
  thumb.position.set(0.17, -0.01, -0.02);
  const thumbMesh = mesh(new THREE.CapsuleGeometry(0.042, 0.15, 6, 14), M.skin);
  thumbMesh.rotation.x = Math.PI / 2;
  thumbMesh.position.z = -0.11;
  thumb.add(thumbMesh);
  root.add(thumb);
  const cuff = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 28), M.suit);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = 0.3;
  root.add(cuff);
  return { root, index, thumb };
}
const bigHand = buildHand();
scene.add(bigHand.root);
/** 0 = open, 1 = thumb and index tips meet. */
function pinch(k: number) {
  bigHand.index.rotation.y = lerp(0.15, -0.28, k);
  bigHand.index.rotation.x = lerp(0, 0.18, k);
  bigHand.thumb.rotation.y = lerp(-0.7, -0.05, k);
}

// --- Boarding pass ------------------------------------------------------------------
const pass = textTexture(1024, 400, (ctx, w, h) => {
  ctx.fillStyle = '#FBF7EF';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = CSS_BLUE;
  ctx.fillRect(0, 0, w, 70);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText('BOARDING PASS', 30, 48);
  ctx.fillStyle = '#1C2B33';
  ctx.font = `300 26px ${FONT}`;
  ctx.fillText('FROM', 30, 130);
  ctx.fillText('TO', 330, 130);
  ctx.font = `600 54px ${FONT}`;
  ctx.fillText('Gate 14', 30, 195);
  ctx.fillText('Harbor Pt', 330, 195);
  ctx.font = `300 26px ${FONT}`;
  ctx.fillText('SEAT', 30, 270);
  ctx.fillText('FLIGHT', 330, 270);
  ctx.font = `600 48px ${FONT}`;
  ctx.fillText('14C', 30, 330);
  ctx.fillText('25 MIN', 330, 330);
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = '#9AA8BA';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(760, 80);
  ctx.lineTo(760, h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.save();
  ctx.translate(890, h / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = CSS_BLUE;
  ctx.font = `700 90px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('14C', 0, 30);
  ctx.restore();
});
pass.tex.repeat.set(760 / 1024, 1);
const stubTex = pass.tex.clone();
stubTex.offset.set(760 / 1024, 0);
stubTex.repeat.set(264 / 1024, 1);
stubTex.needsUpdate = true;
const passGroup = new THREE.Group();
const PASS_W = 0.76 * 0.9, PASS_H = 0.4 * 0.9, STUB_W = 0.264 * 0.9;
const passBody = new THREE.Mesh(new THREE.PlaneGeometry(PASS_W, PASS_H), new THREE.MeshStandardMaterial({ map: pass.tex, roughness: 0.85, side: THREE.DoubleSide }));
passBody.castShadow = true;
passBody.position.x = -STUB_W / 2;
const passStub = new THREE.Mesh(new THREE.PlaneGeometry(STUB_W, PASS_H), new THREE.MeshStandardMaterial({ map: stubTex, roughness: 0.85, side: THREE.DoubleSide }));
passStub.castShadow = true;
const stubPivot = new THREE.Group();
stubPivot.position.x = PASS_W / 2 - STUB_W / 2;
passStub.position.x = STUB_W / 2;
stubPivot.add(passStub);
passGroup.add(passBody, stubPivot);
scene.add(passGroup);

// --- Tray, cards, dial, jar, stacks ---------------------------------------------------
const trayGroup = new THREE.Group();
const trayTop = mesh(roundedBox(0.9, 0.035, 0.56, 0.05), M.tray);
const trayRim = mesh(roundedBox(0.92, 0.025, 0.58, 0.055), M.trayRim);
trayRim.position.y = -0.012;
trayGroup.add(trayTop, trayRim);
const nowStand = new THREE.Group();
const nowPlate = mesh(roundedBox(0.28, 0.012, 0.19, 0.02), M.blue);
nowStand.add(nowPlate);
nowStand.position.set(0, 0.11, -0.14);
nowStand.rotation.x = 0.85;
trayGroup.add(nowStand);
const post1 = mesh(roundedBox(0.05, 0.11, 0.02, 0.008), M.trayRim);
post1.position.set(0, 0.055, -0.18);
trayGroup.add(post1);
const doneStack = mesh(roundedBox(0.2, 0.03, 0.14, 0.02), clay(0x4d7a8f, 0.5));
doneStack.position.set(-0.31, 0.03, -0.12);
trayGroup.add(doneStack);
const doneLabel = textTexture(256, 64, (ctx, w, h) => { ctx.fillStyle = CSS_INK; ctx.font = `600 34px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('✓ DONE', w / 2, h / 2 + 12); });
const doneLabelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.045), new THREE.MeshBasicMaterial({ map: doneLabel.tex, transparent: true }));
doneLabelMesh.rotation.x = -Math.PI / 2;
doneLabelMesh.position.set(-0.31, 0.047, -0.07);
trayGroup.add(doneLabelMesh);
scene.add(trayGroup);

const TASKS = ['Write Devpost description', 'Review flight dial design', 'Reply to playtest volunteers'];
const STEPS = ['Inspiration', 'How it was built', 'What is next'];
const CARD = { w: 0.24, d: 0.15 };
const ACCENTS = ['#0081FB', '#5EC8E5', '#B892FF'];
function cardFace(title: string, accent: string, steps: number) {
  return textTexture(512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#F6F1E7';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 22);
    ctx.fillStyle = '#1C2B33';
    ctx.font = `600 40px ${FONT}`;
    const words = title.split(' ');
    let line = '', y = 92;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > w - 60) { ctx.fillText(line, 30, y); line = word; y += 50; } else line = next;
    }
    ctx.fillText(line, 30, y);
    if (steps > 0) {
      ctx.font = `400 28px ${FONT}`;
      ctx.fillStyle = '#5C6B80';
      ctx.fillText(`${steps} steps`, 30, h - 36);
    }
  });
}
const cards = TASKS.map((title, i) => {
  const face = cardFace(title, ACCENTS[i], i === 0 ? 3 : 0);
  const g = new THREE.Group();
  const body = mesh(roundedBox(CARD.w, 0.008, CARD.d, 0.012), M.paper);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w * 0.96, CARD.d * 0.94), new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.8 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.0045;
  g.add(body, top);
  trayGroup.add(g);
  return { g, top };
});
const CARD_ROW = [v3(-0.29, 0.024, 0.13), v3(0, 0.024, 0.13), v3(0.29, 0.024, 0.13)];

const dialGroup = new THREE.Group();
const dialFace = textTexture(512, 512, () => {});
function drawDial(minutes: number, label: string) {
  const ctx = dialFace.ctx, c = 256;
  ctx.clearRect(0, 0, 512, 512);
  ctx.fillStyle = '#1C2B47';
  ctx.beginPath(); ctx.arc(c, c, 250, 0, Math.PI * 2); ctx.fill();
  const stops = [5, 10, 25, 45], angles = [60, 20, -20, -60];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  stops.forEach((s, i) => {
    const a = angles[i] * Math.PI / 180;
    ctx.fillStyle = s === minutes ? CSS_BLUE : '#A6B4CC';
    ctx.font = `${s === minutes ? 700 : 400} 58px ${FONT}`;
    ctx.fillText(String(s), c - Math.sin(a) * 180, c - Math.cos(a) * 180);
  });
  ctx.fillStyle = CSS_INK; ctx.font = `500 44px ${FONT}`;
  ctx.fillText(label, c, 430);
  dialFace.tex.needsUpdate = true;
}
const dialPlate = new THREE.Mesh(new THREE.CircleGeometry(0.11, 48), new THREE.MeshStandardMaterial({ map: dialFace.tex, roughness: 0.6 }));
dialPlate.rotation.x = -Math.PI / 2;
dialPlate.position.y = 0.021;
const knob = new THREE.Group();
const knobCap = mesh(new THREE.CylinderGeometry(0.05, 0.053, 0.04, 40), clay(0xdfe5ee, 0.3));
knobCap.position.y = 0.04;
const ridge = mesh(new THREE.BoxGeometry(0.01, 0.01, 0.05), M.blue);
ridge.position.set(0, 0.065, -0.025);
knob.add(knobCap, ridge);
dialGroup.add(dialPlate, knob);
dialGroup.position.set(0.31, 0, -0.12);
trayGroup.add(dialGroup);

const jarGroup = new THREE.Group();
const jarGlass = mesh(new THREE.CylinderGeometry(0.055, 0.052, 0.14, 40, 1, true), M.glass, false);
jarGlass.position.y = 0.07;
const jarLid = mesh(new THREE.CylinderGeometry(0.059, 0.059, 0.022, 40), M.blue);
jarLid.position.y = 0.151;
jarGroup.add(jarGlass, jarLid);
const slips: THREE.Mesh[] = [];
for (let i = 0; i < 3; i++) {
  const s = mesh(roundedBox(0.06, 0.004, 0.036, 0.006), M.paper);
  s.position.set(Math.cos(i * 2.4) * 0.01, 0.01 + i * 0.008, Math.sin(i * 2.4) * 0.01);
  s.rotation.y = i * 2.4;
  jarGroup.add(s);
  slips.push(s);
}
jarGroup.position.set(0.33, 0.02, 0.15);
trayGroup.add(jarGroup);
const flyingSlip = mesh(roundedBox(0.06, 0.004, 0.036, 0.006), M.paper);
scene.add(flyingSlip);

// Steps panel and wrist menu share the floating-panel look.
function panelTexture(w: number, h: number) { return textTexture(w, h, () => {}); }
const stepsPanel = panelTexture(640, 380);
function drawSteps(ticked: number, reveal: number) {
  const ctx = stepsPanel.ctx;
  ctx.clearRect(0, 0, 640, 380);
  STEPS.forEach((step, i) => {
    const y = 20 + i * 120;
    const a = clamp01(reveal * 3 - i);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(12, 22, 44, 0.88)';
    ctx.beginPath(); ctx.roundRect(0, y, 640, 100, 26); ctx.fill();
    ctx.strokeStyle = i < ticked ? '#7DFFA8' : '#A6B4CC';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.roundRect(30, y + 26, 48, 48, 10); ctx.stroke();
    if (i < ticked) {
      ctx.beginPath(); ctx.moveTo(40, y + 50); ctx.lineTo(52, y + 64); ctx.lineTo(72, y + 36); ctx.stroke();
    }
    ctx.fillStyle = i < ticked ? '#A6D9B8' : CSS_INK;
    ctx.font = `500 44px ${FONT}`;
    ctx.fillText(step, 110, y + 66);
  });
  ctx.globalAlpha = 1;
  stepsPanel.tex.needsUpdate = true;
}
const stepsMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.19), new THREE.MeshBasicMaterial({ map: stepsPanel.tex, transparent: true, depthWrite: false }));
scene.add(stepsMesh);

const wristPanel = panelTexture(640, 300);
function drawWrist(paused: boolean, glow: number) {
  const ctx = wristPanel.ctx;
  ctx.clearRect(0, 0, 640, 300);
  ctx.fillStyle = 'rgba(12, 22, 44, 0.9)';
  ctx.beginPath(); ctx.roundRect(70, 0, 500, 80, 24); ctx.fill();
  ctx.fillStyle = paused ? CSS_BLUE : CSS_INK;
  ctx.font = `500 40px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(paused ? 'Paused at 12 min' : 'In flight', 320, 54);
  for (const [i, label] of ['Pause', 'Land now'].entries()) {
    const x = 20 + i * 320;
    ctx.fillStyle = i === 0 && glow > 0 ? `rgba(0, 129, 251, ${0.4 + glow * 0.6})` : '#EEF3FA';
    ctx.beginPath(); ctx.roundRect(x, 120, 280, 140, 30); ctx.fill();
    ctx.fillStyle = i === 0 && glow > 0.5 ? '#FFFFFF' : '#14182A';
    ctx.font = `600 50px ${FONT}`;
    ctx.fillText(i === 0 && paused ? 'Resume' : label, x + 140, 208);
  }
  ctx.textAlign = 'left';
  wristPanel.tex.needsUpdate = true;
}
const wristMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.15), new THREE.MeshBasicMaterial({ map: wristPanel.tex, transparent: true, depthWrite: false }));
scene.add(wristMesh);

// Check-in slab (a tall glossy panel showing the 2D page).
const checkinFace = panelTexture(900, 1500);
function drawCheckin(typed: number, pressed: number) {
  const ctx = checkinFace.ctx, w = 900, h = 1500;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#101E3A'); g.addColorStop(1, '#0A1428');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = CSS_BLUE; ctx.font = `600 34px ${FONT}`;
  ctx.fillText('CHECK-IN', 70, 140);
  ctx.fillStyle = CSS_INK; ctx.font = `600 96px ${FONT}`;
  ctx.fillText('Seat 14C', 70, 250);
  ctx.fillStyle = '#A6B4CC'; ctx.font = `400 38px ${FONT}`;
  ctx.fillText('What will you finish on this flight?', 70, 340);
  let chars = typed;
  TASKS.forEach((task, i) => {
    const y = 420 + i * 200;
    ctx.fillStyle = '#1A2A4C';
    ctx.beginPath(); ctx.roundRect(70, y, 760, 150, 26); ctx.fill();
    const n = Math.max(0, Math.min(task.length, Math.floor(chars)));
    chars -= task.length;
    ctx.fillStyle = CSS_INK; ctx.font = `500 44px ${FONT}`;
    ctx.fillText(task.slice(0, n) + (n > 0 && n < task.length ? '|' : ''), 110, y + 90);
  });
  const by = 1100;
  ctx.fillStyle = pressed > 0 ? `rgb(${lerp(0, 255, pressed * 0.3)}, ${lerp(129, 200, pressed * 0.3)}, 251)` : CSS_BLUE;
  ctx.beginPath(); ctx.roundRect(70, by, 760, 160, 30); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 64px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText('Board', 450, by + 102);
  ctx.textAlign = 'left';
  checkinFace.tex.needsUpdate = true;
}
const slab = new THREE.Group();
const slabBody = mesh(roundedBox(0.62, 0.04, 1.02, 0.05), M.visor);
slabBody.rotation.x = Math.PI / 2;
const slabScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.97), new THREE.MeshBasicMaterial({ map: checkinFace.tex }));
slabScreen.position.z = 0.022;
slab.add(slabBody, slabScreen);
scene.add(slab);
// The slab breaking into tiles at Board.
const TILE = 14;
const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58 / TILE, 0.97 / (TILE * 1.6), 0.01), M.blue, TILE * Math.round(TILE * 1.6));
scene.add(tiles);

// Breathing ring, chime ripples, dwell ring, FoV frame.
const breathRing = mesh(new THREE.TorusGeometry(0.16, 0.012, 16, 96), M.blue, false);
scene.add(breathRing);
const ripples = [0, 1, 2].map(() => {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 128), new THREE.MeshBasicMaterial({ color: META_BLUE, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  r.rotation.x = -Math.PI / 2;
  scene.add(r);
  return r;
});
const dwellSegments: THREE.Mesh[] = [];
const dwellRing = new THREE.Group();
for (let i = 0; i < 24; i++) {
  const step = (Math.PI * 2) / 24;
  const s = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.09, 4, 1, Math.PI / 2 - (i + 1) * step + 0.03, step - 0.06), new THREE.MeshBasicMaterial({ color: 0xffd400, depthTest: false, transparent: true }));
  s.renderOrder = 20;
  dwellRing.add(s);
  dwellSegments.push(s);
}
scene.add(dwellRing);

// Route map: a vast floor with the route and destinations.
const ROUTE = [
  { name: 'Gate 14', x: 0, y: 0 }, { name: 'Harbor Point', x: 60, y: -30 }, { name: 'Juniper Falls', x: 150, y: 20 },
  { name: 'Saltmarsh', x: 260, y: -40 }, { name: 'Cobalt Bay', x: 390, y: 30 }, { name: 'Ember Ridge', x: 520, y: -60 },
];
const mapGroup = new THREE.Group();
const MAP_SCALE = 0.03;
const routePts = ROUTE.map((d) => v3(d.x * MAP_SCALE, 0.01, d.y * MAP_SCALE));
const routeCurve = new THREE.CatmullRomCurve3(routePts);
const routeTube = new THREE.Mesh(new THREE.TubeGeometry(routeCurve, 400, 0.022, 8), M.blue);
const plannedTube = new THREE.Mesh(new THREE.TubeGeometry(routeCurve, 400, 0.007, 6), new THREE.MeshBasicMaterial({ color: 0x5c6b80 }));
mapGroup.add(plannedTube, routeTube);
const destLabels: THREE.Mesh[] = [];
ROUTE.forEach((d, i) => {
  const dot = mesh(new THREE.SphereGeometry(i < 2 ? 0.06 : 0.04, 24, 16), i < 2 ? M.blue : clay(0x8796ab));
  dot.position.copy(routePts[i]);
  mapGroup.add(dot);
  const label = textTexture(512, 96, (ctx, w, h) => { ctx.fillStyle = i < 2 ? CSS_INK : '#7F8DA3'; ctx.font = `500 52px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(d.name, w / 2, h / 2 + 18); });
  const lm = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.18), new THREE.MeshBasicMaterial({ map: label.tex, transparent: true, depthWrite: false }));
  lm.position.copy(routePts[i]).add(v3(0, 0.16, 0));
  mapGroup.add(lm);
  destLabels.push(lm);
});
const planeIcon = mesh(new THREE.ConeGeometry(0.05, 0.16, 3), clay(0xffffff, 0.3));
planeIcon.rotation.x = Math.PI / 2;
mapGroup.add(planeIcon);
scene.add(mapGroup);

const postcardFace = textTexture(900, 600, (ctx, w, h) => drawPostcard(ctx, w, h, 'Harbor Point', 40));
const postcard = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshStandardMaterial({ map: postcardFace.tex, roughness: 0.7, side: THREE.DoubleSide }));
postcard.castShadow = true;
scene.add(postcard);

// --- Type ---------------------------------------------------------------------------
type Caption = [number, number, string];
const CAPTIONS: Caption[] = [
  [8.8, 19.6, 'You have twenty minutes and one thing that has to get done.'],
  [20.6, 27.4, 'Seat 14C turns that into a flight.'],
  [27.6, 34.6, 'Check in with up to three tasks, then board.'],
  [35.6, 44.6, 'Rest your hands and the tray meets them.'],
  [44.8, 54.6, 'Your first flight teaches the three gestures: pinch, grab and twist.'],
  [55.6, 66.6, 'Pick one task, set the length, take off.'],
  [66.8, 79.6, 'The cabin lights dim and everything but your task steps back.'],
  [80.6, 89.6, 'Glance at the card for its steps.'],
  [89.8, 104.6, 'A stray thought? Flick it into the jar. It waits for you after landing.'],
  [105.6, 114.6, 'Turn your palm up to pause, or to land early.'],
  [115.6, 125.6, 'The chime means landing. Drop the card on Done, take a breath,'],
  [125.8, 139.6, 'and watch the route grow. Every new place leaves a postcard.'],
  [140.6, 148.6, 'Every action works by hand, by look and pinch, or by looking alone.'],
  [148.8, 156.6, 'And a three-day streak earns a night cabin.'],
];

function tracked(text: string, x: number, y: number, size: number, weight: number, spacing: number, color: string, alpha: number, align: 'center' | 'left' = 'center') {
  if (alpha <= 0) return;
  hud.save();
  hud.globalAlpha = alpha;
  hud.fillStyle = color;
  hud.font = `${weight} ${size}px ${FONT}`;
  hud.textBaseline = 'middle';
  (hud as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
  hud.textAlign = align;
  hud.fillText(text, x, y);
  hud.restore();
}
const fadeInOut = (t: number, a: number, b: number, f = 0.6) => Math.min(seg(t, a, a + f, smooth), 1 - seg(t, b - f, b, smooth));

function drawHud(t: number) {
  hud.clearRect(0, 0, W, H);
  for (const [a, b, text] of CAPTIONS) {
    if (!inRange(t, a, b)) continue;
    const alpha = fadeInOut(t, a, b, 0.5);
    tracked(text, W / 2, H - 92, 36, 300, 1.5, '#FFFFFF', alpha * 0.95);
  }
  // Cold-open title.
  const titleA = fadeInOut(t, 4.6, 8.2, 1.2);
  tracked('SEAT 14C', W / 2, H / 2 - 10, 120, 200, 46, '#FFFFFF', titleA);
  tracked('A FOCUS CABIN FOR META VR GLASSES', W / 2, H / 2 + 92, 22, 400, 10, CSS_BLUE, titleA * 0.9);
  // Problem title over the cabin.
  const probA = fadeInOut(t, 9.4, 18.8, 1.2);
  tracked('20 minutes on a train.', W / 2, 190, 64, 200, 4, '#FFFFFF', probA);
  tracked('One thing to finish.', W / 2, 270, 64, 200, 4, '#FFFFFF', seg(t, 11, 12.4) * probA);
  // Miles counter.
  if (inRange(t, 126, 139.5)) {
    const a = fadeInOut(t, 126, 139.5, 0.8);
    const miles = Math.round(40 * seg(t, 126.5, 129.5, smooth));
    tracked(`+${miles} miles`, W / 2, 170, 96, 200, 6, '#FFFFFF', a);
    tracked('GATE 14  →  HARBOR POINT', W / 2, 255, 22, 400, 10, CSS_BLUE, a);
  }
  // Accessibility cut labels.
  const CUTS: [number, string][] = [[140, 'LOOK ONLY'], [143.4, 'HIGH CONTRAST'], [146.8, 'LARGE TEXT'], [150.2, 'NIGHT CABIN · 3-DAY STREAK'], [153.6, 'BUILT FOR THE 70° × 66° GLASSES VIEW']];
  for (const [start, label] of CUTS) {
    if (!inRange(t, start, start + 3.4)) continue;
    tracked(label, 120, 120, 26, 500, 10, label === 'HIGH CONTRAST' ? '#FFFFFF' : CSS_BLUE, fadeInOut(t, start, start + 3.4, 0.3), 'left');
  }
  // FoV frame overlay.
  if (inRange(t, 153.6, 157)) {
    const a = fadeInOut(t, 153.6, 157, 0.3);
    hud.save();
    hud.globalAlpha = a;
    hud.strokeStyle = CSS_BLUE;
    hud.lineWidth = 3;
    hud.setLineDash([18, 12]);
    const fw = 1180, fh = 1180 * (Math.tan(33 * Math.PI / 180) / Math.tan(35 * Math.PI / 180)) * 0.62;
    hud.strokeRect(W / 2 - fw / 2, H / 2 - fh / 2 + 40, fw, fh);
    hud.restore();
  }
  // End card.
  if (t >= 157) {
    const a = seg(t, 157.2, 158.6, smooth);
    hud.fillStyle = `rgba(10, 20, 40, ${seg(t, 157, 157.8, smooth)})`;
    hud.fillRect(0, 0, W, H);
    const g = hud.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0);
    g.addColorStop(0, '#0064E0'); g.addColorStop(1, '#0081FB');
    hud.save(); hud.globalAlpha = a; hud.fillStyle = g;
    hud.fillRect(W / 2 - 300 * seg(t, 157.4, 159), H / 2 - 120, 600 * seg(t, 157.4, 159), 3);
    hud.restore();
    tracked('SEAT 14C', W / 2, H / 2 - 30, 110, 200, 42, '#FFFFFF', a);
    tracked('Finish one thing before you land.', W / 2, H / 2 + 70, 38, 300, 2, '#FFFFFF', seg(t, 158.2, 159.4, smooth));
    tracked('mhenimerz.github.io/seat-14c', W / 2, H / 2 + 150, 26, 400, 4, CSS_BLUE, seg(t, 158.8, 160, smooth));
    tracked('BUILT WITH IWSDK FOR META VR GLASSES AND QUEST', W / 2, H - 110, 20, 500, 9, '#A6B4CC', seg(t, 159.4, 160.6, smooth));
  }
  hudTexture.needsUpdate = true;
}

// --- Shot helpers --------------------------------------------------------------------
const look = new THREE.Vector3();
function shot(pos: THREE.Vector3, at: THREE.Vector3, fov = 32, roll = 0) {
  camera.position.copy(pos);
  look.copy(at);
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(look);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
const P = (a: THREE.Vector3, b: THREE.Vector3, k: number) => a.clone().lerp(b, k);

/** The passenger sits in the front row; the endless cabin stretches behind. */
const SEAT_POS = v3(0.6, 0, 0);
function placePassenger(visible: boolean) {
  figure.root.visible = visible;
  heroSeat.visible = visible;
  figure.root.position.copy(SEAT_POS);
  heroSeat.position.copy(SEAT_POS);
  figure.root.rotation.y = 0;
  heroSeat.rotation.y = 0;
}
/** Arms: 0 = in the lap, 1 = forearms resting forward on the tray. */
function armsTo(k: number, wave = 0, t = 0) {
  for (const side of ['left', 'right'] as const) {
    const a = figure.arms[side];
    a.shoulder.rotation.x = lerp(-0.25, -0.75, k) + Math.sin(t * 1.3 + (side === 'left' ? 0 : 1)) * 0.02 * wave;
    a.elbow.rotation.x = lerp(-1.1, -1.05, k);
    a.shoulder.rotation.z = (side === 'left' ? -1 : 1) * 0.08;
  }
}
const TRAY_AT = (k: number) => v3(SEAT_POS.x, lerp(0.35, 0.78, k), SEAT_POS.z + 0.62);

function resetAll() {
  for (const o of [figure.root, heroSeat, bigHand.root, passGroup, trayGroup, stepsMesh, wristMesh, slab, tiles, breathRing, dwellRing, mapGroup, postcard, flyingSlip, ...ripples]) o.visible = false;
  corridor.visible = false;
  floor.visible = true;
  passGroup.scale.setScalar(1);
  passGroup.rotation.set(0, 0, 0);
  stubPivot.rotation.set(0, 0, 0);
  stubPivot.position.set(PASS_W / 2 - STUB_W / 2, 0, 0);
  trayGroup.scale.setScalar(1);
  trayGroup.rotation.set(0, 0, 0);
  scene.fog = new THREE.FogExp2(FOG, 0.06);
  (scene.fog as THREE.FogExp2).density = 0.06;
  hemi.intensity = 0.9;
  key.intensity = 2.6;
  rim.intensity = 2.2;
  pool.intensity = 0;
  M.tray.color.setHex(0xd5dde7);
  key.color.setHex(0xffffff);
  post.uniforms.mono.value = 0;
  post.uniforms.warm.value = 0;
  post.uniforms.fade.value = 1;
  stepsMesh.scale.setScalar(1);
  cards.forEach((c, i) => {
    c.g.position.copy(CARD_ROW[i]);
    c.g.rotation.set(0, 0, 0);
    (c.top.material as THREE.MeshStandardMaterial).color.setScalar(1);
  });
  slips.forEach((s, i) => (s.visible = i < 0));
  jarGroup.visible = false;
}

// --- Scenes ---------------------------------------------------------------------------
/** 0:00–0:08 — a hand tears the boarding-pass stub in a blue void. */
function sceneColdOpen(t: number) {
  scene.fog = new THREE.FogExp2(0x0b1630, 0.12);
  floor.visible = false;
  passGroup.visible = true;
  bigHand.root.visible = true;
  const away = seg(t, 4.2, 8, smooth);
  passGroup.position.set(-away * 0.5, 1.6 + Math.sin(t * 0.8) * 0.01 + away * 0.35, -away * 2.6);
  passGroup.rotation.set(-0.1, 0.18 - t * 0.02 + away * 0.5, 0.04);
  // Hand drifts in, pinches the stub at 2.6 s, tears it down and away.
  const reach = seg(t, 0.2, 2.6);
  const tear = seg(t, 2.9, 4.4);
  const stubWorld = v3(PASS_W / 2 - STUB_W / 2 + STUB_W * 0.55, 1.62, 0.06);
  bigHand.root.position.copy(P(v3(1.4, 1.2, 0.9), stubWorld.clone().add(v3(0.16, -0.02, 0.32)), reach)).add(v3(tear * 0.25, -tear * 0.55, tear * 0.15));
  bigHand.root.rotation.set(-0.35, 0.65, 0.5);
  bigHand.root.scale.setScalar(0.55);
  pinch(seg(t, 2.2, 2.8));
  stubPivot.rotation.set(tear * 0.3, -tear * 0.5, -tear * 0.9);
  stubPivot.position.set(PASS_W / 2 - STUB_W / 2 + tear * 0.12, -tear * 0.55, tear * 0.12);
  const cam = P(v3(0.05, 1.66, 1.75), v3(-0.05, 1.62, 1.25), seg(t, 0, 8, smooth));
  shot(cam, v3(0.05, 1.6, 0), 32, 0.02 - t * 0.003);
  rim.position.set(-3, 2, -2);
  post.uniforms.fade.value = seg(t, 0, 0.8, smooth);
}

/** 0:08–0:20 — an endless cabin of identical seats; one passenger. */
function sceneCabin(t: number, local: number) {
  corridor.visible = true;
  layoutCorridor(0, t);
  placePassenger(true);
  armsTo(0, 1, t);
  // Train-window light bars streak past on the right.
  const k = seg(local, 0, 12, (x) => x);
  const cam = P(v3(-0.15, 1.3, 4.2), v3(0.05, 1.42, 2.1), smooth(k));
  const roll = Math.sin(local * 0.25) * 0.05 + lerp(-0.08, 0.04, k);
  shot(cam, v3(0.35, 1.0, -2.5), 30, roll);
  rim.position.set(4, 2, -3 + Math.sin(local * 3) * 4);
  rim.intensity = 2 + Math.sin(local * 7) * 0.8;
}

/** 0:20–0:35 — the check-in page on a floating slab; Board shatters it. */
function sceneCheckin(t: number, local: number) {
  scene.fog = new THREE.FogExp2(0x0b1630, 0.1);
  floor.visible = false;
  slab.visible = local < 11.6;
  slab.position.set(0, 1.55 + Math.sin(local * 0.6) * 0.01, 0);
  slab.rotation.set(0, Math.sin(local * 0.3) * 0.12 - 0.15, 0);
  const typed = seg(local, 1.5, 9.5, (x) => clamp01(x)) * TASKS.join('').length;
  const press = seg(local, 10.4, 10.8, smooth) - seg(local, 10.8, 11.2, smooth);
  drawCheckin(typed, press);
  bigHand.root.visible = local > 8.6 && local < 12.2;
  if (bigHand.root.visible) {
    const r = seg(local, 8.6, 10.4) - seg(local, 11.2, 12.2) * 0.8;
    bigHand.root.position.copy(P(v3(0.6, 0.6, 1.2), v3(0.05, 1.05, 0.33), r));
    bigHand.root.rotation.set(-0.2, 0.25, 0.1);
    bigHand.root.scale.setScalar(0.42);
    pinch(0.2);
  }
  // Tiles: the slab breaks apart and streams past the camera.
  if (local >= 11.2) {
    tiles.visible = true;
    const k = seg(local, 11.2, 14.6, (x) => clamp01(x));
    let i = 0;
    const rows = Math.round(TILE * 1.6);
    for (let r = 0; r < rows; r++) for (let c = 0; c < TILE; c++) {
      const seed = Math.sin(i * 12.9898) * 43758.5453 % 1;
      const lag = Math.abs(seed) * 0.35;
      const kk = clamp01((k - lag) / (1 - lag));
      const e = kk * kk;
      tmp.position.set(
        (c + 0.5) / TILE * 0.58 - 0.29 + Math.sin(i) * e * 1.2,
        1.55 + 0.485 - (r + 0.5) / rows * 0.97 + Math.cos(i * 1.7) * e * 0.8,
        e * 4.5,
      );
      tmp.rotation.set(e * 6 * seed, e * 4, e * 3);
      tmp.scale.setScalar(1 - e * 0.4);
      tmp.updateMatrix();
      tiles.setMatrixAt(i++, tmp.matrix);
    }
    tiles.instanceMatrix.needsUpdate = true;
  }
  const cam = P(v3(-0.3, 1.62, 2.7), v3(0.08, 1.56, 2.0), seg(local, 0, 11, smooth));
  shot(cam, v3(0, 1.55, 0), 32, -0.015);
}

/** 0:35–0:55 — hands rest, the tray rises to meet them; pass into pocket; dial twist. */
function sceneCalibrate(t: number, local: number) {
  corridor.visible = true;
  layoutCorridor(0, t);
  placePassenger(true);
  trayGroup.visible = true;
  const rise = seg(local, 3.5, 9);
  armsTo(seg(local, 0.5, 3.5), 0, t);
  trayGroup.position.copy(TRAY_AT(rise));
  trayGroup.rotation.x = lerp(0.5, 0, rise);
  cards.forEach((c) => (c.g.visible = false));
  if (local < 10) {
    // Wide: the tray floats up from the dark like it was always there.
    const cam = P(v3(-0.7, 1.35, 2.6), v3(-0.45, 1.25, 2.0), seg(local, 0, 10, smooth));
    shot(cam, v3(0.6, 0.85, 0.2), 30, 0.03);
  } else {
    // Close: the boarding pass slides into the seat pocket, then the dial twists.
    passGroup.visible = local < 15.5;
    const slide = seg(local, 11, 14.5);
    const trayPos = trayGroup.position;
    passGroup.scale.setScalar(0.35);
    passGroup.position.copy(trayPos).add(v3(-0.05 - slide * 0.55, 0.03 - slide * slide * 0.3, 0.12 - slide * 0.1));
    passGroup.rotation.set(-Math.PI / 2, 0, slide * 0.6);
    stubPivot.visible = false;
    const twist = seg(local, 15.5, 18.5);
    knob.rotation.y = lerp(0.9, -0.35, twist);
    drawDial(twist > 0.9 ? 25 : twist > 0.5 ? 10 : 5, twist > 0 ? `${twist > 0.9 ? 25 : twist > 0.5 ? 10 : 5} min` : 'Set length');
    const close = local < 15.5;
    const cam = close
      ? P(v3(trayPos.x + 0.1, trayPos.y + 0.5, trayPos.z + 0.8), v3(trayPos.x - 0.05, trayPos.y + 0.4, trayPos.z + 0.65), seg(local, 10, 15.5, smooth))
      : P(v3(trayPos.x + 0.6, trayPos.y + 0.3, trayPos.z + 0.3), v3(trayPos.x + 0.48, trayPos.y + 0.22, trayPos.z + 0.18), seg(local, 15.5, 20, smooth));
    const at = close ? trayPos.clone().add(v3(-0.2, 0.0, 0.05)) : trayPos.clone().add(v3(0.31, 0, -0.12));
    shot(cam, at, close ? 34 : 30, 0.02);
  }
}

/** 0:55–1:20 — card to Now, dial to 25, take off; the cabin melts into the dark. */
function sceneTakeoff(t: number, local: number) {
  jarGroup.visible = local > 9.5;
  corridor.visible = true;
  const sink = seg(local, 11, 21, smooth);
  layoutCorridor(sink, t);
  placePassenger(true);
  armsTo(1, 0, t);
  trayGroup.visible = true;
  trayGroup.position.copy(TRAY_AT(1));
  cards.forEach((c) => (c.g.visible = true));
  // Card 1 lifts from the row and glides onto the Now stand.
  const lift = seg(local, 1.5, 5);
  const c0 = cards[0];
  const standLocal = v3(0, 0.125, -0.14);
  c0.g.position.copy(P(CARD_ROW[0], standLocal, lift)).add(v3(0, Math.sin(lift * Math.PI) * 0.08, 0));
  c0.g.rotation.x = lift * 0.85;
  drawDial(25, local > 9 ? 'Take off' : '25 min');
  knob.rotation.y = -0.35;
  // Take off at 9.5 s: lights dim, other cards fade, a pool of light stays.
  const dim = seg(local, 9.5, 14, smooth);
  (scene.fog as THREE.FogExp2).density = lerp(0.06, 0.2, dim);
  hemi.intensity = lerp(0.9, 0.12, dim);
  key.intensity = lerp(2.6, 0.5, dim);
  rim.intensity = lerp(2.2, 0.6, dim);
  pool.intensity = lerp(0, 9, dim);
  pool.position.copy(trayGroup.position).add(v3(0, 1.6, 0.2));
  pool.target.position.copy(trayGroup.position);
  for (let i = 1; i < 3; i++) (cards[i].top.material as THREE.MeshStandardMaterial).color.setScalar(lerp(1, 0.35, dim));
  // Cards that weren't chosen sink into the tray's shadow.
  for (let i = 1; i < 3; i++) cards[i].g.position.y = CARD_ROW[i].y - dim * 0.02;
  const tp = trayGroup.position;
  if (local < 9.5) {
    const cam = P(v3(tp.x - 0.5, tp.y + 0.75, tp.z + 0.6), v3(tp.x - 0.25, tp.y + 0.62, tp.z + 0.5), seg(local, 0, 9.5, smooth));
    shot(cam, tp.clone().add(v3(0, 0.05, -0.05)), 32, -0.02);
  } else {
    // Slow pull back and up: the cabin sinks away around one lit tray.
    const k = seg(local, 9.5, 25, smooth);
    const cam = P(v3(tp.x + 0.2, tp.y + 0.8, tp.z + 1.0), v3(tp.x + 1.6, tp.y + 2.4, tp.z + 3.4), k);
    shot(cam, tp.clone().add(v3(0, -0.1 * k, -0.2)), lerp(32, 38, k), lerp(0, 0.08, k));
  }
}

/** 1:20–1:45 — steps rise from the card; a thought is flicked into the jar. */
function sceneFocus(t: number, local: number) {
  jarGroup.visible = true;
  floor.visible = true;
  placePassenger(true);
  armsTo(1, 0, t);
  trayGroup.visible = true;
  trayGroup.position.copy(TRAY_AT(1));
  cards.forEach((c, i) => { c.g.visible = true; if (i > 0) (c.top.material as THREE.MeshStandardMaterial).color.setScalar(0.35); });
  cards[0].g.position.set(0, 0.125, -0.14);
  cards[0].g.rotation.x = 0.85;
  drawDial(25, `${25 - Math.floor(local / 6)} min to go`);
  scene.fog = new THREE.FogExp2(FOG, 0.2);
  hemi.intensity = 0.12; key.intensity = 0.5; rim.intensity = 0.6; pool.intensity = 9;
  pool.position.copy(trayGroup.position).add(v3(0, 1.6, 0.2));
  pool.target.position.copy(trayGroup.position);
  const tp = trayGroup.position;
  // Steps panel beside the card: reveal, then tick the first.
  stepsMesh.visible = local < 10.5;
  stepsMesh.position.copy(tp).add(v3(-0.34, 0.2, -0.12));
  stepsMesh.rotation.set(-0.35, 0.3, 0);
  drawSteps(local > 6 ? 1 : 0, seg(local, 1.2, 4, (x) => clamp01(x)));
  slips.forEach((s, i) => (s.visible = i < (local > 19 ? 1 : 0)));
  if (local < 10.5) {
    shot(P(v3(tp.x - 0.1, tp.y + 0.55, tp.z + 0.75), v3(tp.x - 0.18, tp.y + 0.45, tp.z + 0.6), seg(local, 0, 10.5, smooth)), tp.clone().add(v3(-0.15, 0.12, -0.12)), 34, 0.01);
  } else {
    // Flick: a hand pinches the air, flicks toward the jar; a slip arcs in.
    bigHand.root.visible = local < 19;
    const jarWorld = tp.clone().add(v3(0.33, 0.2, 0.15));
    const start = tp.clone().add(v3(0.05, 0.42, 0.42));
    const flick = seg(local, 14.2, 14.8, (x) => clamp01(x));
    bigHand.root.position.copy(P(start, start.clone().add(v3(0.2, -0.08, -0.05)), flick));
    bigHand.root.rotation.set(-0.4, 0.4 - flick * 0.4, 0.3);
    bigHand.root.scale.setScalar(0.22);
    pinch(seg(local, 12, 12.6) - seg(local, 14.6, 14.9));
    flyingSlip.visible = local > 14.6 && local < 16.6;
    if (flyingSlip.visible) {
      const k = seg(local, 14.6, 16.4, (x) => clamp01(x));
      const from = start.clone().add(v3(0.12, 0, -0.06));
      flyingSlip.position.copy(P(from, jarWorld.clone().add(v3(0, -0.16, 0)), k)).add(v3(0, Math.sin(k * Math.PI) * 0.12, 0));
      flyingSlip.rotation.set(k * 5, k * 3, k * 2);
    }
    shot(P(v3(tp.x + 0.75, tp.y + 0.5, tp.z + 0.85), v3(tp.x + 0.62, tp.y + 0.38, tp.z + 0.7), seg(local, 10.5, 25, smooth)), tp.clone().add(v3(0.22, 0.12, 0.12)), 34, -0.02);
  }
}

/** 1:45–1:55 — a palm turns up; the wrist menu rises; Pause. */
function sceneWrist(t: number, local: number) {
  scene.fog = new THREE.FogExp2(FOG, 0.18);
  floor.visible = false;
  hemi.intensity = 0.35;
  key.intensity = 1.4;
  shot(P(v3(0.2, 1.62, 1.1), v3(0.1, 1.58, 0.9), seg(local, 0, 10, smooth)), v3(0, 1.38, 0), 32, 0.03);
  bigHand.root.visible = true;
  const turn = seg(local, 0.5, 2.5);
  bigHand.root.position.set(0, 1.25, 0);
  bigHand.root.rotation.set(0.3, 0.2, lerp(0, Math.PI, turn));
  bigHand.root.scale.setScalar(0.5);
  pinch(0);
  wristMesh.visible = turn > 0.6;
  const rise = seg(local, 2.4, 3.6, outBack);
  wristMesh.position.set(0, 1.36 + rise * 0.14, 0.05);
  wristMesh.scale.setScalar(Math.max(0.001, rise));
  wristMesh.lookAt(camera.position);
  const press = seg(local, 6, 6.5, smooth);
  drawWrist(local > 6.5, press);
}

/** 1:55–2:20 — chime, Done, a breath, the route grows, a postcard lands. */
function sceneLanding(t: number, local: number) {
  jarGroup.visible = true;
  floor.visible = true;
  placePassenger(true);
  armsTo(1, 0, t);
  trayGroup.visible = true;
  trayGroup.position.copy(TRAY_AT(1));
  const tp = trayGroup.position;
  const lights = seg(local, 0.3, 3, smooth);
  scene.fog = new THREE.FogExp2(FOG, lerp(0.2, 0.08, lights));
  hemi.intensity = lerp(0.12, 0.9, lights); key.intensity = lerp(0.5, 2.4, lights); rim.intensity = lerp(0.6, 2, lights);
  pool.intensity = lerp(9, 2, lights);
  pool.position.copy(tp).add(v3(0, 1.6, 0.2));
  pool.target.position.copy(tp);
  cards.forEach((c, i) => { c.g.visible = i === 0; });
  // Chime ripples spread across the floor.
  ripples.forEach((r, i) => {
    const k = clamp01((local - i * 0.35) / 2.6);
    r.visible = k > 0 && k < 1;
    r.position.copy(tp).setY(0.02);
    r.scale.setScalar(0.2 + k * 3.5);
    (r.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
  });
  // Card from the Now stand to the Done stack.
  const drop = seg(local, 2.2, 4.4);
  cards[0].g.position.copy(P(v3(0, 0.125, -0.14), v3(-0.31, 0.05, -0.12), drop)).add(v3(0, Math.sin(drop * Math.PI) * 0.1, 0));
  cards[0].g.rotation.x = lerp(0.85, 0, drop);
  // One breath: the ring swells and settles.
  breathRing.visible = inRange(local, 4.6, 10.5);
  const breath = Math.sin(clamp01((local - 4.8) / 5.4) * Math.PI);
  breathRing.position.copy(tp).add(v3(0, 0.42, 0.05));
  breathRing.scale.setScalar(0.5 + breath * 0.6);
  (breathRing.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.25 + breath * 0.8;
  if (local < 10.5) {
    shot(P(v3(tp.x + 0.15, tp.y + 0.62, tp.z + 1.05), v3(tp.x + 0.05, tp.y + 0.55, tp.z + 0.9), seg(local, 0, 10.5, smooth)), tp.clone().add(v3(0, 0.22, -0.05)), 34, 0);
  } else {
    // Crane up and away: the route map spreads across the floor below.
    mapGroup.visible = true;
    mapGroup.position.set(tp.x + 0.9, 0.02, tp.z + 1.8);
    const grow = seg(local, 12, 15.5, smooth);
    const reach = 0.2 * grow; // Gate 14 → Harbor Point is the first fifth.
    routeTube.geometry.setDrawRange(0, Math.floor(routeTube.geometry.index!.count * reach));
    planeIcon.position.copy(routeCurve.getPoint(Math.max(0.0001, reach))).add(v3(0, 0.06, 0));
    const ahead = routeCurve.getTangent(Math.max(0.0001, reach));
    planeIcon.rotation.set(Math.PI / 2, 0, -Math.atan2(ahead.x, ahead.z));
    const k = seg(local, 10.5, 18, smooth);
    const cam = P(v3(tp.x + 0.3, tp.y + 0.9, tp.z + 1.4), v3(tp.x + 2.0, 3.3, tp.z + 5.4), k);
    shot(cam, P(tp, mapGroup.position.clone().add(v3(1.3, 0, -0.3)), k), lerp(34, 40, k), 0);
    destLabels.forEach((l) => l.lookAt(camera.position));
    // Postcard drifts down onto the tray in the last shot.
    postcard.visible = local > 18;
    if (postcard.visible) {
      const fall = seg(local, 18, 23.5, smooth);
      postcard.position.copy(tp).add(v3(0.02, lerp(0.9, 0.04, fall), lerp(-0.1, 0.06, fall)));
      postcard.rotation.set(lerp(-0.4, -Math.PI / 2, fall), lerp(1.6, 0.1, fall), Math.sin(fall * 6) * 0.2 * (1 - fall));
      const cam2 = P(v3(tp.x + 0.25, tp.y + 0.75, tp.z + 0.7), v3(tp.x + 0.12, tp.y + 0.5, tp.z + 0.45), seg(local, 18, 25, smooth));
      shot(cam2, tp.clone().add(v3(0.02, 0.06, 0.02)), 34, 0.02);
      mapGroup.visible = false;
    }
  }
}

/** 2:20–2:37 — quick cuts: look only, high contrast, large text, night cabin, FoV. */
function sceneCuts(t: number, local: number) {
  jarGroup.visible = true;
  floor.visible = true;
  placePassenger(true);
  armsTo(1, 0, t);
  trayGroup.visible = true;
  trayGroup.position.copy(TRAY_AT(1));
  const tp = trayGroup.position;
  cards.forEach((c) => (c.g.visible = true));
  drawDial(25, '25 min');
  const cut = Math.min(4, Math.floor(local / 3.4));
  const k = (local - cut * 3.4) / 3.4;
  const baseCam = (dx: number) => shot(P(v3(tp.x + dx, tp.y + 0.6, tp.z + 0.8), v3(tp.x + dx * 0.8, tp.y + 0.55, tp.z + 0.7), smooth(k)), tp.clone().add(v3(dx * 0.3, 0.05, -0.02)), 34, 0);
  if (cut === 0) {
    // Look only: a ring fills around the card the gaze rests on.
    dwellRing.visible = true;
    const fill = clamp01((k - 0.15) / 0.6);
    dwellSegments.forEach((s, i) => (s.visible = i < Math.ceil(fill * 24)));
    dwellRing.position.copy(tp).add(CARD_ROW[1]).add(v3(0, 0.03, 0));
    dwellRing.rotation.set(-Math.PI / 2, 0, 0);
    if (fill >= 1) { cards[1].g.position.y = CARD_ROW[1].y + 0.04 * seg(k, 0.75, 0.9); }
    baseCam(0);
  } else if (cut === 1) {
    post.uniforms.mono.value = 1;
    hemi.intensity = 1.4;
    baseCam(-0.15);
  } else if (cut === 2) {
    stepsMesh.visible = true;
    stepsMesh.position.copy(tp).add(v3(-0.22, 0.26, -0.08));
    stepsMesh.rotation.set(-0.35, 0.25, 0);
    stepsMesh.scale.setScalar(lerp(1, 1.3, seg(k, 0.1, 0.5, outBack)));
    drawSteps(1, 1);
    baseCam(-0.2);
  } else if (cut === 3) {
    M.tray.color.setHex(0x6b4a32);
    key.color.setHex(0xffc98a);
    post.uniforms.warm.value = 0.7;
    baseCam(0.12);
  } else {
    baseCam(0);
  }
}

// --- Frame ----------------------------------------------------------------------------
drawDial(0, 'Set length');
drawSteps(0, 0);
drawWrist(false, 0);
drawCheckin(0, 0);

function renderAt(t: number): void {
  resetAll();
  if (t < 8) sceneColdOpen(t);
  else if (t < 20) sceneCabin(t, t - 8);
  else if (t < 35) sceneCheckin(t, t - 20);
  else if (t < 55) sceneCalibrate(t, t - 35);
  else if (t < 80) sceneTakeoff(t, t - 55);
  else if (t < 105) sceneFocus(t, t - 80);
  else if (t < 115) sceneWrist(t, t - 105);
  else if (t < 140) sceneLanding(t, t - 115);
  else if (t < 157) sceneCuts(t, t - 140);
  else sceneCuts(t, 16.9);
  // Short dips to navy between scenes, like slow cuts.
  const BOUNDS = [8, 20, 35, 55, 80, 105, 115, 140];
  for (const b of BOUNDS) {
    const d = Math.abs(t - b);
    if (d < 0.35) post.uniforms.fade.value *= smooth(d / 0.35) * 0.85 + 0.15;
  }
  if (t > 163.5) post.uniforms.fade.value *= 1 - seg(t, 163.5, 165, smooth);
  post.uniforms.time.value = t;
  drawHud(t);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCamera);
}

declare global {
  interface Window { renderAt: (t: number) => void; filmReady: boolean; FILM: { W: number; H: number; DURATION: number } }
}
window.renderAt = renderAt;
window.FILM = { W, H, DURATION };
document.fonts.ready.then(() => { window.filmReady = true; });
