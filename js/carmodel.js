// Procedural F1 car: sculpted, livery-mapped body + interchangeable parts + working suspension.
// Local space: +z forward, +x = car's left, y up, ground at y = 0.
import * as THREE from 'three';
import { paintCar, paintHelmet, paintSuit, fillLivery, VISOR_COL } from './livery.js';

// ---------------- part catalogue ----------------
export const PARTS = {
  chassis: { custom: 'Your F1 Car', svgp: 'SVGP Classic' },
  nose:   { modern: 'Modern Low', high: 'High Nose', stepped: 'Stepped' },
  fwing:  { modern: 'Modern Swept', classic: 'Classic 3-Plane', spoon: 'Simple Spoon' },
  pods:   { downwash: 'Downwash', zeropod: 'Zero-Pod', bathtub: 'Bathtub' },
  cover:  { fin: 'Shark Fin', clean: 'Clean', split: 'Split Intake' },
  rwing:  { high: 'High Downforce', medium: 'Medium', low: 'Low Drag' },
  halo:   { carbon: 'Carbon', painted: 'Painted' },
  rims:   { spokes: '5-Spoke', covers: 'Aero Covers', mesh: 'Multi-Spoke' },
  rimCol: { silver: 'Silver', black: 'Black', gold: 'Gold', white: 'White' },
  pattern:{ solid: 'Solid', stripe: 'Centre Stripe', split: 'Two-Tone', arrow: 'Arrow Nose', fade: 'Fade', sash: 'Side Sash' },
};
export const DEFAULT_CAR = {
  chassis: 'custom',
  nose: 'modern', fwing: 'modern', pods: 'downwash', cover: 'fin', rwing: 'medium', halo: 'carbon', rims: 'covers', rimCol: 'black',
  pattern: 'sash', main: 0xc8141c, accent: 0xf2f2f2, third: 0x121214, number: 7, sponsor: 'VOLTA',
};

// wheelbase / track
const FZ = 1.8, RZ = -1.8, FX = 0.8, RX = 0.78, FR = 0.36, RR = 0.37, FWID = 0.34, RWID = 0.42;

// atlas rects (u0, v0, u1, v1) in the 2:1 livery texture
const ATLAS = {
  body: [0, 0, 0.58, 1], plateL: [0.58, 0.5, 0.66, 1], plateR: [0.58, 0, 0.66, 0.5],
  podL: [0.66, 0.5, 0.83, 1], podR: [0.66, 0, 0.83, 0.5], cover: [0.83, 0, 1, 0.5], fwing: [0.83, 0.5, 0.915, 1], rwing: [0.915, 0.5, 1, 1],
};
// The livery contract for this model (see js/livery.js and docs/CAR-MODELS.md). Panel UV frames are
// rect-local: o = the panel's top-left corner as seen from outside the car, ds = its "right", dt = its "down".
// (Lofts: u runs rear -> front, v runs round the section: 0 floor, .25 left (+x), .5 top, .75 right.)
export const MODEL = {
  id: 'svgp-f1-2026', aspect: 2, helmetFront: 0.25,
  dark: [[0, 0, 0.58, 0.08], [0, 0.92, 0.58, 1]],
  panels: {
    top:    { rect: ATLAS.body,   o: [1, 0.4],  ds: [0, 0.2],  dt: [-1, 0],   W: 0.5,  H: 5.1,  role: 'top',   nose: 'top',   label: 'Nose + cockpit top' },
    sideL:  { rect: ATLAS.body,   o: [1, 0.4],  ds: [-1, 0],   dt: [0, -0.3], W: 5.1,  H: 0.5,  role: 'side',  nose: 'left',  pair: 'sideR', label: 'Left flank' },
    sideR:  { rect: ATLAS.body,   o: [0, 0.6],  ds: [1, 0],    dt: [0, 0.3],  W: 5.1,  H: 0.5,  role: 'side',  nose: 'right', pair: 'sideL', label: 'Right flank' },
    podL:   { rect: ATLAS.podL,   o: [1, 0.5],  ds: [-1, 0],   dt: [0, -0.42], W: 2.2, H: 0.45, role: 'pod',   nose: 'left',  pair: 'podR', label: 'Left sidepod' },
    podR:   { rect: ATLAS.podR,   o: [0, 0.5],  ds: [1, 0],    dt: [0, -0.42], W: 2.2, H: 0.45, role: 'pod',   nose: 'right', pair: 'podL', label: 'Right sidepod' },
    coverL: { rect: ATLAS.cover,  o: [1, 0.42], ds: [-1, 0],   dt: [0, -0.3], W: 1.95, H: 0.42, role: 'cover', nose: 'left',  pair: 'coverR', label: 'Engine cover, left' },
    coverR: { rect: ATLAS.cover,  o: [0, 0.58], ds: [1, 0],    dt: [0, 0.3],  W: 1.95, H: 0.42, role: 'cover', nose: 'right', pair: 'coverL', label: 'Engine cover, right' },
    fwing:  { rect: ATLAS.fwing,  o: [1, 0],    ds: [-1, 0],   dt: [0, 0.55], W: 2.0,  H: 0.3,  role: 'wing',  label: 'Front wing (from behind)' },
    rwing:  { rect: ATLAS.rwing,  o: [1, 0],    ds: [-1, 0],   dt: [0, 0.55], W: 1.08, H: 0.3,  role: 'wing',  label: 'Rear wing (from behind)' },
    plateL: { rect: ATLAS.plateL, o: [1, 1],    ds: [-1, 0],   dt: [0, -1],   W: 0.54, H: 0.68, role: 'plate', nose: 'left',  pair: 'plateR', label: 'Wing endplates, left' },
    plateR: { rect: ATLAS.plateR, o: [0, 1],    ds: [1, 0],    dt: [0, -1],   W: 0.54, H: 0.68, role: 'plate', nose: 'right', pair: 'plateL', label: 'Wing endplates, right' },
  },
};

// ---------------- geometry helpers ----------------
// superellipse ring: v=0 bottom, 0.25 left (+x), 0.5 top, 0.75 right (-x)
function ringPoint(s, k, R) {
  const a = -Math.PI / 2 + (2 * Math.PI * k) / R;
  const c = Math.cos(a), sn = Math.sin(a);
  const e = s.e ?? 0.6, eb = s.eb ?? 0.35; // squarer at the bottom (flat floor)
  const ex = Math.sign(c) * Math.pow(Math.abs(c), e);
  const ey = sn < 0 ? -Math.pow(-sn, eb) : Math.pow(sn, e);
  const yc = (s.yt + s.yb) / 2, h = (s.yt - s.yb) / 2;
  const wTop = s.wt ?? s.w; // narrower towards the top (tumblehome)
  const w = sn > 0 ? s.w + (wTop - s.w) * sn : s.w;
  return [(s.x || 0) + w * ex, yc + h * ey];
}

function loft(sections, R, rect, opts = {}) {
  const zs = sections.map(s => s.z), zmin = Math.min(...zs), zmax = Math.max(...zs);
  const pos = [], uv = [], idx = [];
  const [u0, v0, u1, v1] = rect;
  sections.forEach((s) => {
    for (let k = 0; k <= R; k++) {
      const [x, y] = ringPoint(s, k, R);
      pos.push(opts.mirror ? -x : x, y, s.z);
      uv.push(u0 + (u1 - u0) * ((s.z - zmin) / (zmax - zmin || 1)), v0 + (v1 - v0) * (k / R));
    }
  });
  const W = R + 1;
  for (let i = 0; i < sections.length - 1; i++) for (let k = 0; k < R; k++) {
    const a = i * W + k, b = a + 1, c = a + W, d = c + 1;
    if (opts.mirror) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  // end caps
  const cap = (si, flip) => {
    const s = sections[si], base = pos.length / 3;
    pos.push(opts.mirror ? -(s.x || 0) : (s.x || 0), (s.yt + s.yb) / 2, s.z); uv.push(u0, v0);
    for (let k = 0; k < R; k++) {
      const a = si * W + k, b = a + 1;
      if ((!flip) !== !!opts.mirror) idx.push(base, a, b); else idx.push(base, b, a);
    }
  };
  if (!opts.openFront) cap(sections.length - 1, false);
  if (!opts.openBack) cap(0, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// airfoil element extruded along the span (x). st(x) -> { z (leading edge), y, c (chord), a (angle) }
const FOIL = [[0, 0], [0.06, 0.055], [0.3, 0.08], [0.7, 0.05], [1, 0.012], [1, -0.004], [0.7, 0.005], [0.3, -0.018], [0.06, -0.02]];
function wingElement(x0, x1, nseg, st, rect) {
  const pos = [], uv = [], idx = [], P = FOIL.length, [u0, v0, u1, v1] = rect;
  for (let i = 0; i <= nseg; i++) {
    const x = x0 + (x1 - x0) * i / nseg, s = st(x);
    const dz = -Math.cos(s.a), dy = Math.sin(s.a), nz = Math.sin(s.a), ny = Math.cos(s.a);
    for (let k = 0; k <= P; k++) {
      const [u, t] = FOIL[k % P];
      const th = t * (s.th ?? 1.5);
      pos.push(x, s.y + dy * u * s.c + ny * th * s.c, s.z + dz * u * s.c + nz * th * s.c);
      uv.push(u0 + (u1 - u0) * (i / nseg), v0 + (v1 - v0) * (k / P));
    }
  }
  const W = P + 1;
  for (let i = 0; i < nseg; i++) for (let k = 0; k < P; k++) {
    const a = i * W + k, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// flat plate from a 2D outline in the (z, y) plane, extruded in x
function plate(outline, x, thick, rect = null) {
  const sh = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // shape x -> world z, shape y -> world y, depth -> world -x
  g.translate(x + thick / 2, 0, 0);
  if (rect) {
    // map the outline's (z, y) box onto an atlas rect: u rear -> front, v bottom -> top
    const zs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
    const z0 = Math.min(...zs), z1 = Math.max(...zs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const P = g.attributes.position, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) U.setXY(i, rect[0] + (rect[2] - rect[0]) * (P.getZ(i) - z0) / (z1 - z0 || 1), rect[1] + (rect[3] - rect[1]) * (P.getY(i) - y0) / (y1 - y0 || 1));
    U.needsUpdate = true;
  }
  return g;
}

function rodMesh(mat, r = 0.017) {
  const g = new THREE.CylinderGeometry(r, r, 1, 5, 1);
  g.rotateX(Math.PI / 2); // along z
  return new THREE.Mesh(g, mat);
}
const _a = new THREE.Vector3(), _m = new THREE.Vector3();

// ---------------- textures ----------------
const texCache = {};
function canvasTex(key, w, h, draw, repeat = false) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (texCache[key] = t);
}
const RIMCOL = { silver: '#c8ccd4', black: '#26282e', gold: '#c9a23a', white: '#eeeeee' };
function rimTexture(style, col) {
  return canvasTex('rim-' + style + col, 64, 64, (g, W) => {
    const c = W / 2, base = RIMCOL[col] || '#888';
    g.fillStyle = '#111'; g.fillRect(0, 0, W, W);
    g.fillStyle = base; g.beginPath(); g.arc(c, c, 30, 0, 7); g.fill();
    if (style === 'covers') {
      const grd = g.createRadialGradient(c - 8, c - 8, 2, c, c, 30); grd.addColorStop(0, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(0,0,0,.25)');
      g.fillStyle = grd; g.beginPath(); g.arc(c, c, 29, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, 22, 0, 7); g.stroke();
      g.fillStyle = '#e8b13a'; g.font = 'bold 9px Arial'; g.textAlign = 'center'; g.fillText('SVGP', c, c + 3);
    } else {
      g.fillStyle = '#0c0c0e';
      const n = style === 'mesh' ? 12 : 5;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + Math.PI / n;
        g.beginPath(); g.moveTo(c, c);
        g.arc(c, c, 27, a - (style === 'mesh' ? 0.13 : 0.36), a + (style === 'mesh' ? 0.13 : 0.36)); g.closePath(); g.fill();
      }
      g.fillStyle = base; g.beginPath(); g.arc(c, c, 8, 0, 7); g.fill();
    }
    g.fillStyle = '#444'; g.beginPath(); g.arc(c, c, 4, 0, 7); g.fill();
  });
}
function sidewallTexture() {
  return canvasTex('sidewall', 128, 16, (g, W, H) => {
    g.fillStyle = '#16161a'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = 'bold 9px Arial';
    for (let x = 4; x < W; x += 64) g.fillText('SVGP RACING', x, 11);
  }, true);
}
function carbonTex() {
  return canvasTex('carbon', 16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = ((x >> 1) + (y >> 1)) % 2 ? '#1a1a1e' : '#26262c'; g.fillRect(x, y, 1, 1); }
  }, true);
}

// ---------------- livery ----------------
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
export const paintLivery = (canvas, L) => paintCar(canvas, L, MODEL);

// ---------------- chassis registry ----------------
// Other car models (e.g. the imported .glb in glbcar.js) register here: { ready(): bool, build(cfg, opts) }.
// If the chosen one isn't available (file missing / still loading) the procedural SVGP car is built instead.
export const CHASSIS = {};
export const chassisReady = (k) => !!(CHASSIS[k] && CHASSIS[k].ready());

// shared bits other chassis reuse: carbon texture, rim colours, the driver (helmet, visor, shoulders + suit)
export { carbonTex, RIMCOL, canvasTex };
export function driverKit(cfg, opts = {}) {
  const low = !!opts.low, hs = low ? 64 : opts.texSize >= 1024 ? 256 : 128;
  const helCanvas = document.createElement('canvas'); helCanvas.width = hs * 2; helCanvas.height = hs;
  const helTex = new THREE.CanvasTexture(helCanvas); helTex.colorSpace = THREE.SRGBColorSpace;
  const cvs = [0, 1, 2].map(() => { const c = document.createElement('canvas'); c.width = c.height = low ? 64 : 128; return c; });
  const [suitTex, limbTex, armTex] = cvs.map(c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; });
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, low ? 10 : 16, low ? 7 : 11), new THREE.MeshPhongMaterial({ map: helTex, specular: 0x777777, shininess: 100 }));
  helmet.scale.set(1, 1, 1.12);
  const visorMat = new THREE.MeshPhongMaterial({ color: 0x1a2530, specular: 0xaaccff, shininess: 120 });
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.158, 10, 4, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.36, Math.PI * 0.17), visorMat);
  visor.scale.copy(helmet.scale);
  const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.16, low ? 8 : 12, 1), new THREE.MeshLambertMaterial({ map: suitTex }));
  const repaint = (c, again) => {
    paintHelmet(helCanvas, c, MODEL.helmetFront, again); helTex.needsUpdate = true;
    paintSuit(cvs[0], cvs[1], cvs[2], c, again); suitTex.needsUpdate = true; limbTex.needsUpdate = true; armTex.needsUpdate = true;
    const [vc, vs] = VISOR_COL[c.helmetDesign.visor] || VISOR_COL.dark; visorMat.color.setHex(vc); visorMat.specular.setHex(vs);
  };
  // place: helmet centre at (x, y, z) in the car's space; shoulders sit just below
  const place = (parent, x, y, z) => { helmet.position.set(x, y, z); visor.position.copy(helmet.position); shoulders.position.set(x, y - 0.155, z - 0.02); parent.add(helmet, visor, shoulders); };
  return { helmet, visor, visorMat, shoulders, helTex, helCanvas, suitTex, limbTex, armTex, repaint, place };
}
// brake / rain light + its glow, and the blob shadow under the car
export function carLights(parent, x, y, z) {
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x551010 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.03), lightMat); box.position.set(x, y, z); parent.add(box);
  const glow = canvasTex('glow', 64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.75)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.15)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });
  const coronaMat = new THREE.SpriteMaterial({ map: glow, color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const tail = new THREE.Sprite(coronaMat); tail.position.set(x, y, z - 0.04); tail.scale.set(0.55, 0.55, 1); parent.add(tail);
  return { lightMat, coronaMat, tail };
}
export function blobShadow(w = 2.7, l = 6.4) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,.85)'); grd.addColorStop(0.6, 'rgba(0,0,0,.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: canvasTex('blob', 64, 64, (gg) => gg.drawImage(c, 0, 0)), transparent: true, depthWrite: false, opacity: 0.8, color: 0x000000 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1;
  return m;
}

// ---------------- build ----------------
// Each wheel's tilt on screen (about the car's forward axis), once the wheels are at their heights: a wheel on
// independent suspension sits between square to its axle's line (one wheel up a kerb: both lean) and leaning with the
// body (the links hold it to the body as it rolls); a live axle (solidR) tilts both its wheels with the beam. A wheel
// hanging at full droop as the body lifts tilts the same way. roll: the body's roll as drawn.
export function tiltWheels(wheels, roll = 0, solidR = false) {
  for (const w of wheels) {
    const m = w.mate ?? (w.mate = wheels.find(o => o !== w && o.front === w.front) || null);
    if (!m) continue;
    const a = w.pivot.position, b = m.pivot.position, dx = a.x - b.x;
    const axle = Math.abs(dx) > 0.1 ? Math.atan((a.y - b.y) / dx) : 0;
    w.pivot.rotation.z = solidR && !w.front ? axle : (axle + roll) / 2;
  }
}

// A setup's stance on a car model (setup.js stanceOf): the body raised / lowered and pitched by the ride height
// (front against rear), each wheel leaned by its camber, all against the car's standard (a car on its standard
// setup looks as it always has). And a bent corner (Realistic damage, setBend): that wheel leaned out and turned out of
// line, read live from the physics (so a repair straightens it). Both wrap the model's animate once, so they stay
// through every frame's suspension.
const BEND_LOOK = [6 * Math.PI / 180, 6 * Math.PI / 180]; // (a corner bent all the way: its wheel 6° out of true, camber and toe)
function wrapAnimate(model) {
  if (model.animate0) return;
  const a = model.animate0 = model.animate;
  model.animate = (o = {}) => {
    const S = model.stance, B = model.bendOf;
    a(S ? { ...o, heave: (o.heave || 0) + S.dy, pitch: (o.pitch || 0) + S.pitch } : o);
    for (const w of model.wheels) {
      const sx = Math.sign(w.pivot.position.x) || 1; // (the model's +x is the physics' left)
      if (S) w.pivot.rotation.z += -sx * S.cam[w.front ? 0 : 1];
      // (animate sets each wheel's lean every frame, and the fronts' turn (the steering); a rear's turn isn't, so it's set
      // here, or a bent rear's toe would add up frame on frame and the wheel spin round)
      if (B) { const k = (w.front ? 0 : 2) + (sx > 0 ? 0 : 1), b = B.bent[k]; if (!w.front) w.pivot.rotation.y = 0; if (b) { w.pivot.rotation.z += -sx * b * BEND_LOOK[0]; w.pivot.rotation.y += -B.bentDir[k] * sx * b * BEND_LOOK[1]; } }
    }
  };
}
export function setStance(model, st) {
  if (!model) return;
  model.stance = st || null; wrapAnimate(model); model.animate();
}
export function setBend(model, phys) {
  if (!model || !phys) return;
  model.bendOf = phys; wrapAnimate(model);
}

export function buildF1(cfg = DEFAULT_CAR, opts = {}) {
  cfg = fillLivery({ ...DEFAULT_CAR, ...cfg });
  if (cfg.chassis && cfg.chassis !== 'svgp' && chassisReady(cfg.chassis)) return CHASSIS[cfg.chassis].build(cfg, opts);
  const lowDetail = !!opts.low;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // materials
  const livCanvas = document.createElement('canvas'); livCanvas.width = opts.texSize || 512; livCanvas.height = (opts.texSize || 512) / 2;
  const livTex = new THREE.CanvasTexture(livCanvas); livTex.colorSpace = THREE.SRGBColorSpace; livTex.anisotropy = 4;
  // helmet + race suit textures
  const hs = lowDetail ? 64 : opts.texSize >= 1024 ? 256 : 128;
  const helCanvas = document.createElement('canvas'); helCanvas.width = hs * 2; helCanvas.height = hs;
  const helTex = new THREE.CanvasTexture(helCanvas); helTex.colorSpace = THREE.SRGBColorSpace;
  const suitT = document.createElement('canvas'), suitL = document.createElement('canvas'), suitA = document.createElement('canvas');
  suitT.width = suitT.height = suitL.width = suitL.height = suitA.width = suitA.height = lowDetail ? 64 : 128;
  const armTex = new THREE.CanvasTexture(suitA); armTex.colorSpace = THREE.SRGBColorSpace;
  const suitTex = new THREE.CanvasTexture(suitT); suitTex.colorSpace = THREE.SRGBColorSpace;
  const limbTex = new THREE.CanvasTexture(suitL); limbTex.colorSpace = THREE.SRGBColorSpace;
  let later = 0; // decal images that arrive after the first paint trigger one repaint
  const repaintAll = () => {
    const again = () => { if (later) return; later = setTimeout(() => { later = 0; repaintAll(); }, 30); };
    paintCar(livCanvas, cfg, MODEL, again); livTex.needsUpdate = true;
    paintHelmet(helCanvas, cfg, MODEL.helmetFront, again); helTex.needsUpdate = true;
    paintSuit(suitT, suitL, suitA, cfg, again); suitTex.needsUpdate = true; limbTex.needsUpdate = true; armTex.needsUpdate = true;
  };
  repaintAll();
  const paint = new THREE.MeshPhongMaterial({ map: livTex, specular: 0x5a5a5a, shininess: 80 });
  const paintFlat = new THREE.MeshPhongMaterial({ map: livTex, specular: 0x444444, shininess: 60, side: THREE.DoubleSide });
  const plain = new THREE.MeshPhongMaterial({ color: cfg.main, specular: 0x555555, shininess: 70, side: THREE.DoubleSide });
  const accent = new THREE.MeshPhongMaterial({ color: cfg.accent, specular: 0x444444, shininess: 60, side: THREE.DoubleSide });
  const carbon = new THREE.MeshPhongMaterial({ map: carbonTex(), color: 0x9a9aa0, specular: 0x333333, shininess: 40, side: THREE.DoubleSide });
  const black = new THREE.MeshLambertMaterial({ color: 0x0e0e10, side: THREE.DoubleSide });
  const metal = new THREE.MeshPhongMaterial({ color: 0x8a8c92, specular: 0x999999, shininess: 90 });
  const add = (geo, mat, parent = body) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };

  // ---- monocoque + nose ----
  const noseSecs = {
    modern:  [[2.82, 0.05, 0.2, 0.27], [2.6, 0.1, 0.17, 0.32], [2.25, 0.14, 0.15, 0.39], [1.85, 0.18, 0.14, 0.46], [1.35, 0.23, 0.12, 0.54]],
    high:    [[2.78, 0.07, 0.33, 0.42], [2.55, 0.12, 0.3, 0.47], [2.2, 0.16, 0.28, 0.52], [1.85, 0.2, 0.25, 0.55], [1.35, 0.24, 0.16, 0.58]],
    stepped: [[2.8, 0.07, 0.19, 0.28], [2.5, 0.12, 0.17, 0.34], [2.0, 0.16, 0.15, 0.4], [1.75, 0.2, 0.15, 0.43], [1.6, 0.22, 0.14, 0.56], [1.3, 0.24, 0.12, 0.58]],
  }[cfg.nose] || [];
  const tub = [
    ...noseSecs.map(([z, w, yb, yt]) => ({ z, w, yb, yt, wt: w * 0.75, e: 0.7 })),
    { z: 0.85, w: 0.29, wt: 0.2, yb: 0.1, yt: 0.62 },
    { z: 0.42, w: 0.34, wt: 0.22, yb: 0.1, yt: 0.67 },
    { z: 0.05, w: 0.37, wt: 0.25, yb: 0.1, yt: 0.63 },
    { z: -0.45, w: 0.38, wt: 0.26, yb: 0.1, yt: 0.61 },
    { z: -0.85, w: 0.35, wt: 0.24, yb: 0.11, yt: 0.58 },
    { z: -1.35, w: 0.29, wt: 0.2, yb: 0.12, yt: 0.52 },
    { z: -1.8, w: 0.2, wt: 0.15, yb: 0.14, yt: 0.45 },
    { z: -2.15, w: 0.12, wt: 0.09, yb: 0.17, yt: 0.38 },
    { z: -2.32, w: 0.075, wt: 0.06, yb: 0.2, yt: 0.32 },
  ].sort((a, b) => a.z - b.z);
  add(loft(tub, lowDetail ? 12 : 18, ATLAS.body), paint);
  // cockpit opening + headrest + steering wheel hint
  add(new THREE.BoxGeometry(0.4, 0.02, 0.78).translate(0, 0.635, 0.02), black);
  add(new THREE.BoxGeometry(0.46, 0.08, 0.18).translate(0, 0.64, -0.36), carbon);
  add(new THREE.BoxGeometry(0.2, 0.08, 0.04).translate(0, 0.66, 0.34), carbon);
  // driver helmet with visor
  const helmetMat = new THREE.MeshPhongMaterial({ map: helTex, specular: 0x777777, shininess: 100 });
  const helmet = add(new THREE.SphereGeometry(0.155, lowDetail ? 10 : 16, lowDetail ? 7 : 11), helmetMat);
  helmet.position.set(0, 0.74, -0.08); helmet.scale.set(1, 1, 1.12);
  const visorMat = new THREE.MeshPhongMaterial({ color: 0x1a2530, specular: 0xaaccff, shininess: 120 });
  const visor = add(new THREE.SphereGeometry(0.158, 10, 4, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.36, Math.PI * 0.17), visorMat);
  visor.position.copy(helmet.position); visor.scale.copy(helmet.scale);
  const setVisor = () => { const [c, sp] = VISOR_COL[cfg.helmetDesign.visor] || VISOR_COL.dark; visorMat.color.setHex(c); visorMat.specular.setHex(sp); };
  setVisor();
  // shoulders in the cockpit (race suit)
  const suitMat = new THREE.MeshLambertMaterial({ map: suitTex });
  add(new THREE.CylinderGeometry(0.17, 0.21, 0.16, lowDetail ? 8 : 12, 1).translate(0, 0.585, -0.1), suitMat);

  // ---- floor, bargeboards, diffuser ----
  const floorShape = new THREE.Shape();
  floorShape.moveTo(-0.55, 0.9); floorShape.lineTo(-0.75, 0.4); floorShape.lineTo(-0.78, -1.2); floorShape.lineTo(-0.6, -1.85); floorShape.lineTo(0.6, -1.85);
  floorShape.lineTo(0.78, -1.2); floorShape.lineTo(0.75, 0.4); floorShape.lineTo(0.55, 0.9); floorShape.closePath();
  const floorG = new THREE.ExtrudeGeometry(floorShape, { depth: 0.03, bevelEnabled: false });
  floorG.rotateX(Math.PI / 2); floorG.translate(0, 0.085, 0);
  add(floorG, carbon);
  for (const s of [-1, 1]) {
    add(plate([[0.9, 0.08], [0.55, 0.08], [0.6, 0.3], [0.85, 0.26]], s * 0.5, 0.012), carbon);                 // bargeboard
    add(plate([[-1.2, 0.06], [-1.85, 0.06], [-1.85, 0.2], [-1.3, 0.12]], s * 0.78, 0.01), carbon);           // floor edge wing
  }
  // diffuser ramp + strakes
  const dif = new THREE.PlaneGeometry(1.1, 0.62); dif.rotateX(-Math.PI / 2 + 0.42); dif.translate(0, 0.19, -2.12);
  add(dif, carbon);
  for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) add(plate([[-1.85, 0.08], [-2.42, 0.36], [-2.42, 0.22], [-1.9, 0.08]], x, 0.012), carbon);

  // ---- sidepods ----
  const podDefs = {
    downwash: [[0.62, 0.52, 0.06, 0.14, 0.44], [0.45, 0.55, 0.23, 0.12, 0.55], [0.0, 0.54, 0.26, 0.11, 0.56], [-0.6, 0.5, 0.23, 0.11, 0.45], [-1.2, 0.44, 0.15, 0.12, 0.3], [-1.62, 0.38, 0.07, 0.13, 0.2]],
    zeropod:  [[0.6, 0.47, 0.05, 0.16, 0.5], [0.45, 0.48, 0.15, 0.13, 0.54], [0.0, 0.47, 0.15, 0.12, 0.5], [-0.6, 0.44, 0.13, 0.12, 0.4], [-1.25, 0.4, 0.09, 0.13, 0.26], [-1.6, 0.36, 0.05, 0.14, 0.18]],
    bathtub:  [[0.62, 0.56, 0.07, 0.13, 0.46], [0.45, 0.6, 0.26, 0.12, 0.5], [0.0, 0.6, 0.27, 0.11, 0.51], [-0.6, 0.56, 0.25, 0.11, 0.49], [-1.2, 0.48, 0.17, 0.12, 0.36], [-1.62, 0.4, 0.08, 0.13, 0.22]],
  }[cfg.pods];
  for (const side of [1, -1]) {
    const secs = podDefs.map(([z, x, w, yb, yt]) => ({ z, x, w, yb, yt, wt: w * 0.8, e: 0.55 })).sort((a, b) => a.z - b.z);
    add(loft(secs, lowDetail ? 10 : 14, side > 0 ? ATLAS.podL : ATLAS.podR, { mirror: side < 0 }), paint);
    // inlet mouth
    const f = podDefs[1];
    const mouth = add(new THREE.PlaneGeometry(f[2] * 1.5, (f[4] - f[3]) * 0.55), black);
    mouth.position.set(side * f[1], f[3] + (f[4] - f[3]) * 0.55, f[0] + 0.012);
    if (cfg.pods === 'bathtub') add(new THREE.BoxGeometry(0.16, 0.012, 1.0).translate(side * 0.6, podDefs[2][4] + 0.001, -0.25), black);
  }

  // ---- engine cover / airbox ----
  const coverSecs = [
    { z: -0.33, w: 0.13, yb: 0.56, yt: 0.99 }, { z: -0.6, w: 0.17, yb: 0.55, yt: 0.97 }, { z: -1.0, w: 0.2, yb: 0.5, yt: 0.87 },
    { z: -1.5, w: 0.17, yb: 0.45, yt: 0.72 }, { z: -2.0, w: 0.1, yb: 0.4, yt: 0.56 }, { z: -2.28, w: 0.05, yb: 0.37, yt: 0.46 },
  ].map(s => ({ ...s, wt: s.w * 0.6, e: 0.7 })).sort((a, b) => a.z - b.z);
  add(loft(coverSecs, lowDetail ? 10 : 14, ATLAS.cover), paint);
  if (cfg.cover === 'split') {
    for (const s of [-1, 1]) { const m = add(new THREE.CircleGeometry(0.055, 10), black); m.position.set(s * 0.07, 0.9, -0.325); }
  } else {
    const m = add(new THREE.CircleGeometry(0.075, 12), black); m.scale.set(1.25, 1, 1); m.position.set(0, 0.9, -0.325);
  }
  // T-cam pod on top of the airbox
  add(new THREE.BoxGeometry(0.1, 0.05, 0.14).translate(0, 1.01, -0.42), accent);
  if (cfg.cover === 'fin') add(plate([[-0.75, 0.9], [-2.2, 0.52], [-2.2, 0.72], [-1.2, 0.97]], 0, 0.012, [ATLAS.cover[0], 0.24, ATLAS.cover[2], 0.25]), paintFlat);

  // ---- halo + mirrors ----
  const haloMat = cfg.halo === 'painted' ? plain : carbon;
  const haloCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.25, 0.63, -0.36), new THREE.Vector3(0.3, 0.83, -0.12), new THREE.Vector3(0.24, 0.87, 0.18),
    new THREE.Vector3(0, 0.88, 0.34), new THREE.Vector3(-0.24, 0.87, 0.18), new THREE.Vector3(-0.3, 0.83, -0.12), new THREE.Vector3(-0.25, 0.63, -0.36),
  ]);
  add(new THREE.TubeGeometry(haloCurve, lowDetail ? 16 : 28, 0.032, 6, false), haloMat);
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.88, 0.34), new THREE.Vector3(0, 0.78, 0.48), new THREE.Vector3(0, 0.66, 0.56)]), 8, 0.028, 6, false), haloMat);
  for (const s of [-1, 1]) {
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.34, 0.58, 0.38), new THREE.Vector3(s * 0.44, 0.72, 0.42)]), 3, 0.012, 4, false), black);
    add(new THREE.BoxGeometry(0.15, 0.06, 0.05).translate(s * 0.5, 0.74, 0.42), plain);
  }

  // ---- front wing (own group so it can bend / break) ----
  const fwing = new THREE.Group(); body.add(fwing);
  const fw = cfg.fwing;
  const els = fw === 'classic'
    ? [{ z: 2.9, y: 0.085, c: 0.3, a: 0.04 }, { z: 2.62, y: 0.13, c: 0.16, a: 0.32 }, { z: 2.5, y: 0.2, c: 0.12, a: 0.55 }]
    : fw === 'spoon'
      ? [{ z: 2.9, y: 0.085, c: 0.34, a: 0.06 }, { z: 2.58, y: 0.15, c: 0.2, a: 0.42 }]
      : [{ z: 2.92, y: 0.08, c: 0.26, a: 0.05 }, { z: 2.7, y: 0.12, c: 0.17, a: 0.25 }, { z: 2.57, y: 0.17, c: 0.14, a: 0.42 }, { z: 2.47, y: 0.23, c: 0.11, a: 0.6 }];
  els.forEach((e, k) => {
    const st = (x) => {
      const ax = Math.abs(x), out = Math.max(0, (ax - 0.25) / 0.75);
      const sweep = fw === 'modern' ? out * out * 0.12 * (k + 1) : 0;
      const rise = fw === 'modern' ? out * 0.06 * k : fw === 'spoon' ? -Math.max(0, 0.3 - ax) * 0.2 : 0;
      return { z: e.z - sweep - (fw === 'modern' ? out * 0.05 : 0), y: e.y + rise, c: e.c * (1 - out * 0.2), a: e.a + (fw === 'modern' ? out * 0.1 : 0) };
    };
    add(wingElement(-1.0, 1.0, lowDetail ? 8 : 16, st, ATLAS.fwing), paintFlat, fwing);
  });
  for (const s of [-1, 1]) add(plate([[2.98, 0.05], [2.35, 0.05], [2.32, 0.24], [2.55, 0.33], [2.98, 0.14]], s * 1.0, 0.018, s > 0 ? ATLAS.plateL : ATLAS.plateR), paintFlat, fwing);
  if (cfg.nose === 'high') for (const s of [-1, 1]) add(plate([[2.75, 0.09], [2.5, 0.09], [2.5, 0.32], [2.72, 0.36]], s * 0.08, 0.02), carbon, fwing);

  // ---- rear wing ----
  const rwing = new THREE.Group(); body.add(rwing);
  const rw = cfg.rwing;
  const K = rw === 'high' ? 1.2 : rw === 'low' ? 0.75 : 1;
  const rMain = { z: -2.26, y: 0.8, c: 0.3 * K, a: 0.1 * K, th: 1.6 };
  const rFlap = { z: -2.48 - 0.04 * K, y: 0.86 + 0.04 * K, c: 0.2 * K, a: 0.45 * K, th: 1.4 };
  add(wingElement(-0.54, 0.54, lowDetail ? 4 : 8, (x) => ({ ...rMain, y: rMain.y - (rw === 'high' ? 0 : Math.max(0, 0.3 - Math.abs(x)) * 0.1) }), ATLAS.rwing), paintFlat, rwing);
  add(wingElement(-0.54, 0.54, lowDetail ? 4 : 8, () => rFlap, ATLAS.rwing), paintFlat, rwing);
  add(wingElement(-0.45, 0.45, 4, () => ({ z: -2.22, y: 0.42, c: 0.16, a: 0.2, th: 1.4 }), ATLAS.rwing), carbon, rwing);  // beam wing
  for (const s of [-1, 1]) add(plate([[-2.18, 0.34], [-2.72, 0.36], [-2.72, 1.0], [-2.45, 1.04], [-2.2, 0.96]], s * 0.55, 0.02, s > 0 ? ATLAS.plateL : ATLAS.plateR), paintFlat, rwing);
  add(plate([[-2.15, 0.36], [-2.3, 0.36], [-2.4, 0.82], [-2.28, 0.82]], 0, 0.03), carbon, rwing);                  // swan-neck pylon
  // rain light
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x551010 });
  add(new THREE.BoxGeometry(0.14, 0.06, 0.03).translate(0, 0.28, -2.36), lightMat);

  // ---- wheels + suspension ----
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1e });
  const sideTex = sidewallTexture();
  const stripeMats = {};
  const rim = new THREE.MeshLambertMaterial({ map: rimTexture(cfg.rims, cfg.rimCol) });
  const wheels = [];
  const armMat = carbon;
  const rods = [];
  const mkWheel = (x, z, r, w, front) => {
    const pivot = new THREE.Group(); pivot.position.set(x, r, z); group.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    // tyre: lathe profile with rounded shoulders, axle along x
    const hw = w / 2, rr = r * 0.66;
    const prof = [[rr, -hw], [r * 0.93, -hw], [r, -hw * 0.82], [r, hw * 0.82], [r * 0.93, hw], [rr, hw]].map(([a, b]) => new THREE.Vector2(a, b));
    const tg = new THREE.LatheGeometry(prof, lowDetail ? 12 : 20); tg.rotateZ(Math.PI / 2);
    spin.add(new THREE.Mesh(tg, tyreMat));
    const out = x > 0 ? 1 : -1;
    for (const sd of [-1, 1]) {
      // sidewall lettering ring + compound stripe + rim disc
      const wall = new THREE.Mesh(new THREE.RingGeometry(rr, r * 0.95, lowDetail ? 12 : 20, 1), new THREE.MeshLambertMaterial({ map: sideTex }));
      wall.rotation.y = sd * Math.PI / 2; wall.position.x = sd * (hw + 0.002); spin.add(wall);
      const stripe = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r * 0.84, lowDetail ? 12 : 20, 1), null);
      stripe.rotation.y = sd * Math.PI / 2; stripe.position.x = sd * (hw + 0.004); spin.add(stripe);
      stripe.userData.stripe = true;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(rr, lowDetail ? 12 : 20), rim);
      disc.rotation.y = sd * Math.PI / 2; disc.position.x = sd * (hw - 0.03); spin.add(disc);
    }
    // brake duct / upright (does not spin)
    const upr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.14), black); upr.position.x = -out * (hw - 0.02); pivot.add(upr);
    wheels.push({ pivot, mesh: spin, r, front, x, z, baseY: r });
    // wishbones: inner points on the chassis (body space), outer on the upright (wheel space)
    const inner = front
      ? [[0.2, 0.44, z + 0.25], [0.2, 0.44, z - 0.25], [0.18, 0.17, z + 0.3], [0.18, 0.17, z - 0.3], [0.2, 0.55, z - 0.35]]
      : [[0.3, 0.47, z + 0.3], [0.3, 0.47, z - 0.2], [0.28, 0.2, z + 0.35], [0.28, 0.2, z - 0.2], [0.26, 0.55, z + 0.1]];
    const outer = [[0, 0.1, 0], [0, 0.1, 0], [0, -0.1, 0], [0, -0.1, 0], [0, -0.08, 0]];
    inner.forEach((p, k) => {
      const m = rodMesh(armMat, k === 4 ? 0.013 : 0.017); m.userData.keep = true; body.add(m);
      rods.push({ m, a: new THREE.Vector3(p[0] * out, p[1], p[2]), b: new THREE.Vector3(outer[k][0] - out * (hw - 0.02), outer[k][1], outer[k][2]), wheel: wheels.length - 1 });
    });
    if (!front) { const m = rodMesh(metal, 0.022); m.userData.keep = true; body.add(m); rods.push({ m, a: new THREE.Vector3(out * 0.2, 0.3, z), b: new THREE.Vector3(-out * (hw - 0.02), 0, 0), wheel: wheels.length - 1 }); } // driveshaft
  };
  mkWheel(FX, FZ, FR, FWID, true); mkWheel(-FX, FZ, FR, FWID, true);
  mkWheel(RX, RZ, RR, RWID, false); mkWheel(-RX, RZ, RR, RWID, false);

  // ---- shadow + lights ----
  const blobC = document.createElement('canvas'); blobC.width = blobC.height = 64;
  { const g = blobC.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(0,0,0,.85)'); grd.addColorStop(0.6, 'rgba(0,0,0,.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 6.4), new THREE.MeshBasicMaterial({ map: canvasTex('blob', 64, 64, (g) => g.drawImage(blobC, 0, 0)), transparent: true, depthWrite: false, opacity: 0.8, color: 0x000000 }));
  shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1;
  // soft round glow (not a solid square) for the rain / brake light
  const glow = canvasTex('glow', 64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.15)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });
  const coronaMat = new THREE.SpriteMaterial({ map: glow, color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const tail = new THREE.Sprite(coronaMat); tail.position.set(0, 0.28, -2.4); tail.scale.set(0.55, 0.55, 1); body.add(tail);

  const model = { group, body, wheels, shadow, lightMat, tail, coronaMat, fwing, rwing, livery: livCanvas, livTex, cfg, def: MODEL, helmet, suitTex, limbTex, armTex, helTex, helCanvas, visorMat };

  model.setCompound = (c, css) => {
    const col = { soft: 0xe0302a, medium: 0xf2d22a, hard: 0xf0f0f0, wet: 0x2a7ae0, dirt: 0xa8743a }[c] ?? 0xf2d22a;
    const mat = stripeMats[c] || (stripeMats[c] = new THREE.MeshBasicMaterial({ color: col }));
    for (const w of wheels) w.mesh.traverse(o => { if (o.userData.stripe) o.material = mat; });
  };
  model.setCompound('medium');
  model.setDamage = (d) => {
    const wob = (g, v, dir) => { g.visible = v < 0.72; g.rotation.z = v > 0.3 ? (v - 0.3) * 0.5 * dir : 0; g.rotation.x = v > 0.3 ? (v - 0.3) * 0.3 : 0; };
    wob(fwing, d.fw, model.pull || 1); wob(rwing, d.rw, -(model.pull || 1));
  };
  model.repaint = (L) => { if (L && L !== model.cfg) Object.assign(model.cfg, fillLivery(L)); cfg = model.cfg; repaintAll(); setVisor(); };

  // suspension: body heaves / pitches / rolls on the springs, wheels stay planted, arms follow
  const _tmp = new THREE.Vector3();
  model.animate = ({ steer = 0, spin = 0, pitch = 0, roll = 0, heave = 0, bump = [0, 0, 0, 0], solidR = false } = {}) => {
    body.rotation.x = pitch; body.rotation.z = roll; body.position.y = heave;
    wheels.forEach((w, k) => {
      w.mesh.rotation.x += spin / w.r;
      if (w.front) w.pivot.rotation.y = steer;
      w.pivot.position.y = w.baseY + bump[k];
    });
    tiltWheels(wheels, roll, solidR);
    body.updateMatrix();
    const inv = body.matrix.clone().invert();
    for (const r of rods) {
      const w = wheels[r.wheel];
      // outer point: wheel space -> group space -> body space
      _tmp.copy(r.b).applyAxisAngle(_Y, w.front ? w.pivot.rotation.y : 0).add(w.pivot.position).applyMatrix4(inv);
      _m.addVectors(r.a, _tmp).multiplyScalar(0.5);
      r.m.position.copy(_m);
      r.m.lookAt(_a.copy(_tmp).applyMatrix4(body.matrix).applyMatrix4(group.matrixWorld));
      r.m.scale.set(1, 1, Math.max(0.01, r.a.distanceTo(_tmp)));
    }
  };
  mergeStatic(body); mergeStatic(fwing); mergeStatic(rwing);
  for (const w of wheels) mergeStatic(w.mesh);
  group.updateMatrixWorld(true);
  model.animate();
  return model;
}
const _Y = new THREE.Vector3(0, 1, 0);

// merge a group's static child meshes that share a material (fewer draw calls per car)
function mergeStatic(parent) {
  const byMat = new Map();
  for (const o of [...parent.children]) {
    if (!o.isMesh || o.userData.keep || Array.isArray(o.material)) continue;
    const k = o.material.uuid;
    if (!byMat.has(k)) byMat.set(k, []);
    byMat.get(k).push(o);
  }
  for (const list of byMat.values()) {
    if (list.length < 2) continue;
    const P = [], N = [], U = [];
    for (const o of list) {
      o.updateMatrix();
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrix);
      if (!g.attributes.normal) g.computeVertexNormals();
      P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array);
      const n = g.attributes.position.count;
      if (g.attributes.uv) U.push(...g.attributes.uv.array); else for (let i = 0; i < n; i++) U.push(0, 0);
      parent.remove(o); o.geometry.dispose(); g.dispose();
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    m.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    m.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    const mm = new THREE.Mesh(m, list[0].material);
    mm.userData = { ...list[0].userData }; // e.g. keeps the tyre-compound stripe tag
    parent.add(mm);
  }
}

// random-but-stable parts for AI teams
export function teamCar(team, idx) {
  let s = (idx + 1) * 9301 + 49297;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const pick = (o) => { const k = Object.keys(o); return k[Math.floor(r() * k.length)]; };
  return {
    nose: pick(PARTS.nose), fwing: pick(PARTS.fwing), pods: pick(PARTS.pods), cover: pick(PARTS.cover), rwing: pick(PARTS.rwing),
    halo: pick(PARTS.halo), rims: pick(PARTS.rims), rimCol: pick(PARTS.rimCol), pattern: pick(PARTS.pattern),
    main: team.main, accent: team.accent, third: team.main === 0x121214 ? 0x2a2a30 : 0x121214, helmet: team.helmet,
    number: [1, 4, 11, 16, 22, 27, 31, 44, 55, 63, 77, 81][idx % 12], sponsor: team.name.split(' ')[0], teamName: team.name,
    helmetDesign: { base: team.helmet, accent: team.main, third: team.accent, pattern: ['stripe', 'crown', 'bands', 'halves', 'flames', 'stars'][idx % 6], visor: ['dark', 'gold', 'blue', 'dark', 'red', 'clear'][idx % 6], number: true },
    suit: { base: team.main, accent: team.accent, pattern: ['sides', 'twotone', 'shoulders', 'sash'][idx % 4], chest: 'team' },
  };
}
