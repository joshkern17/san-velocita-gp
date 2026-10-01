// The imported car model (models/car.glb, made in Blender) as a playable chassis.
//
// Loaded once into a TEMPLATE (geometry baked into car space, shared by every car on the grid), then each car
// gets its own materials and livery texture. Conventions the .glb follows (see docs/CAR-MODELS.md):
//   objects  Body_* (moves on the springs), Body_*FrontWing / Body_*RearWing (can bend / break off),
//            Wheel_FL/FR/RL/RR (tyre + rim), Arm_<corner>_* (suspension links, pivot at the chassis end)
//   materials Livery (painted), Carbon, Tyre, TyreStripe (compound colour), Rim (garage rim colour), others keep
//            their Blender colour
//   space    metres, +Y up, nose along +Z (Blender -Y), left side +X, ground at 0
//
// Liveries are painted by PROJECTION: every texel of the livery texture knows where it sits on the car, so the
// same panels as the classic car (sideL, podL, coverL, top, fwing, rwing, plateL...) are projected onto the
// surface. The model's own UV layout doesn't matter, and every livery / decal ports over.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { CHASSIS, driverKit, carLights, blobShadow, carbonTex, RIMCOL } from './carmodel.js';
import { paintCar, fillLivery } from './livery.js';

let TPL = null, loading = null, loadError = null;
const modelUrl = () => (typeof window !== 'undefined' && window.__SVGP_CAR_GLB) || 'models/car.glb';

export function loadCustomCar() {
  if (loading) return loading;
  loading = new GLTFLoader().loadAsync(modelUrl())
    .then(g => { TPL = makeTemplate(g.scene); return true; })
    .catch(e => { loadError = e; console.warn('custom car model not loaded:', e && e.message); return false; });
  return loading;
}
export const customCarStatus = () => (TPL ? 'ready' : loadError ? 'missing' : 'loading');

CHASSIS.custom = { ready: () => !!TPL, build: (cfg, opts) => buildCar(cfg, opts) };

// ---------------- panels (projections onto the car) ----------------
// proj(x, y, z) -> panel metres (x right, y down, as seen from outside). W/H = panel size in metres.
function makePanels(bb) {
  const zF = bb.max.z + 0.02, zR = bb.min.z - 0.02, top = bb.max.y + 0.02, half = Math.max(bb.max.x, -bb.min.x) + 0.02;
  const len = zF - zR;
  return {
    top:    { W: half * 2, H: len, role: 'top', nose: 'top', label: 'Nose + top', proj: (x, y, z) => [half - x, zF - z] },
    sideL:  { W: len, H: top - 0.1, role: 'side', nose: 'left', pair: 'sideR', label: 'Left flank', proj: (x, y, z) => [zF - z, top - y] },
    sideR:  { W: len, H: top - 0.1, role: 'side', nose: 'right', pair: 'sideL', label: 'Right flank', proj: (x, y, z) => [z - zR, top - y] },
    podL:   { W: 2.1, H: 0.62, role: 'pod', nose: 'left', pair: 'podR', label: 'Left sidepod', proj: (x, y, z) => [0.7 - z, 0.8 - y] },
    podR:   { W: 2.1, H: 0.62, role: 'pod', nose: 'right', pair: 'podL', label: 'Right sidepod', proj: (x, y, z) => [z + 1.4, 0.8 - y] },
    coverL: { W: 2.0, H: 0.55, role: 'cover', nose: 'left', pair: 'coverR', label: 'Engine cover, left', proj: (x, y, z) => [0.1 - z, 1.15 - y] },
    coverR: { W: 2.0, H: 0.55, role: 'cover', nose: 'right', pair: 'coverL', label: 'Engine cover, right', proj: (x, y, z) => [z + 1.9, 1.15 - y] },
    fwing:  null, rwing: null, plateL: null, plateR: null, // filled in from the wing objects' sizes
  };
}
const inPod = (x, y, z) => Math.abs(x) > 0.45 && y <= 0.8 && z > -1.4 && z < 0.7;
const inCover = (x, y, z) => y > 0.78 && z < 0.1 && z > -1.9;

// ---------------- template ----------------
function partOf(o, root) { let p = o; while (p.parent && p.parent !== root) p = p.parent; return p.name || o.name; }
function makeTemplate(scene) {
  scene.updateMatrixWorld(true);
  const parts = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const src = o.material || {};
    parts.push({ part: partOf(o, scene), mat: src.name || '', color: src.color ? src.color.getHex() : 0x888888, geo });
  });
  const T = { body: [], fwing: [], rwing: [], wheels: {}, arms: [], livery: [] };
  const corner = (n) => (n.match(/_(FL|FR|RL|RR)/i) || [])[1]?.toUpperCase();
  for (const p of parts) {
    if (/^wheel/i.test(p.part) && corner(p.part)) (T.wheels[corner(p.part)] ||= []).push(p);
    else if (/^arm/i.test(p.part) && corner(p.part)) T.arms.push({ ...p, corner: corner(p.part) });
    else if (/frontwing/i.test(p.part)) T.fwing.push(p);
    else if (/rearwing/i.test(p.part)) T.rwing.push(p);
    else T.body.push(p);
  }
  // overall bounds of the bodywork (for panel sizes)
  const bb = new THREE.Box3();
  for (const p of [...T.body, ...T.fwing, ...T.rwing]) { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); }
  const box = (list) => { const b = new THREE.Box3(); for (const p of list) { p.geo.computeBoundingBox(); b.union(p.geo.boundingBox); } return b; };
  // wheels: centre + radius, geometry re-centred on the axle
  T.wheelInfo = {};
  for (const [c, list] of Object.entries(T.wheels)) {
    const b = box(list), ctr = b.getCenter(new THREE.Vector3()), r = (b.max.y - b.min.y) / 2;
    for (const p of list) p.geo.translate(-ctr.x, -ctr.y, -ctr.z);
    T.wheelInfo[c] = { ctr, r };
  }
  // arms: pivot at the chassis end (the end nearest the centre line), aim at the wheel end
  for (const a of T.arms) {
    const P = a.geo.attributes.position; let mn = Infinity, mx = 0;
    for (let i = 0; i < P.count; i++) { const ax = Math.abs(P.getX(i)); mn = Math.min(mn, ax); mx = Math.max(mx, ax); }
    const inner = new THREE.Vector3(), outer = new THREE.Vector3(); let ni = 0, no = 0;
    for (let i = 0; i < P.count; i++) { const ax = Math.abs(P.getX(i)); const v = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)); if (ax <= mn + 0.03) { inner.add(v); ni++; } if (ax >= mx - 0.03) { outer.add(v); no++; } }
    inner.divideScalar(Math.max(1, ni)); outer.divideScalar(Math.max(1, no));
    a.geo.translate(-inner.x, -inner.y, -inner.z);
    a.inner = inner; a.dir0 = outer.clone().sub(inner).normalize();
    const w = T.wheelInfo[a.corner]; a.outerRel = w ? outer.clone().sub(w.ctr) : null;
  }
  // wings pivot about their own centres (they bend / fall off with damage)
  for (const k of ['fwing', 'rwing']) {
    if (!T[k].length) { T[k + 'Ctr'] = new THREE.Vector3(); continue; }
    const b = box(T[k]); T[k + 'Box'] = b.clone(); const ctr = b.getCenter(new THREE.Vector3());
    for (const p of T[k]) p.geo.translate(-ctr.x, -ctr.y, -ctr.z);
    T[k + 'Ctr'] = ctr;
  }
  // panels
  const panels = makePanels(bb);
  const fb = T.fwingBox, rb = T.rwingBox;
  if (fb) panels.fwing = { W: fb.max.x - fb.min.x, H: fb.max.z - fb.min.z, role: 'wing', label: 'Front wing (from behind)', proj: (x, y, z) => [fb.max.x - x, fb.max.z - z] };
  else delete panels.fwing;
  if (rb) {
    panels.rwing = { W: rb.max.x - rb.min.x, H: rb.max.z - rb.min.z, role: 'wing', label: 'Rear wing (from behind)', proj: (x, y, z) => [rb.max.x - x, rb.max.z - z] };
    const pw = rb.max.z - rb.min.z, ph = rb.max.y - rb.min.y;
    panels.plateL = { W: pw, H: ph, role: 'plate', nose: 'left', pair: 'plateR', label: 'Rear wing endplates, left', proj: (x, y, z) => [rb.max.z - z, rb.max.y - y] };
    panels.plateR = { W: pw, H: ph, role: 'plate', nose: 'right', pair: 'plateL', label: 'Rear wing endplates, right', proj: (x, y, z) => [z - rb.min.z, rb.max.y - y] };
  } else { delete panels.rwing; delete panels.plateL; delete panels.plateR; }
  for (const k of Object.keys(panels)) if (!panels[k]) delete panels[k];
  T.panels = panels; T.panelNames = Object.keys(panels);

  // livery atlas: the biggest livery object takes the left 62%, the others share the right column
  const liv = [...T.body, ...T.fwing, ...T.rwing].filter(p => p.mat === 'Livery');
  const area = (g) => { const P = g.attributes.position, I = g.index; let a = 0; const n = I ? I.count : P.count; const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(); for (let t = 0; t < n; t += 3) { const ia = I ? I.getX(t) : t, ib = I ? I.getX(t + 1) : t + 1, ic = I ? I.getX(t + 2) : t + 2; A.fromBufferAttribute(P, ia); B.fromBufferAttribute(P, ib); C.fromBufferAttribute(P, ic); a += B.sub(A).cross(C.sub(A)).length() / 2; } return a; };
  liv.sort((a, b) => area(b.geo) - area(a.geo));
  liv.forEach((p, k) => {
    const rest = liv.length - 1;
    p.rect = k === 0 ? [0, 0, rest ? 0.62 : 1, 1] : [0.62, 1 - k / rest, 1, 1 - (k - 1) / rest];
    const uv = p.geo.attributes.uv;
    if (!uv) { p.geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.geo.attributes.position.count * 2), 2)); }
    const U = p.geo.attributes.uv, [r0, r1, r2, r3] = p.rect;
    for (let i = 0; i < U.count; i++) U.setXY(i, r0 + (r2 - r0) * Math.min(1, Math.max(0, U.getX(i))), r1 + (r3 - r1) * Math.min(1, Math.max(0, U.getY(i))));
    U.needsUpdate = true;
    p.group = T.fwing.includes(p) ? 'fwing' : T.rwing.includes(p) ? 'rwing' : 'body';
  });
  T.livery = liv;
  T.maps = {};
  // cockpit: helmet goes under the halo (or the middle of the tub if there's no halo)
  const halo = parts.find(p => /halo/i.test(p.part));
  if (halo) { const b = box([halo]); T.helmet = new THREE.Vector3(0, Math.min(b.max.y - 0.19, 0.95), b.min.z + (b.max.z - b.min.z) * 0.42); }
  else T.helmet = new THREE.Vector3(0, bb.max.y * 0.78, (bb.max.z + bb.min.z) / 2);
  T.bb = bb;
  T.def = makeDef(T);
  return T;
}

// which panel a surface point belongs to
function assign(T, group, x, y, z, nx, ny, nz) {
  if (group === 'fwing') return Math.abs(nx) > 0.6 ? (nx > 0 ? 'sideL' : 'sideR') : 'fwing';
  if (group === 'rwing') return Math.abs(nx) > 0.6 && T.panels.plateL ? (nx > 0 ? 'plateL' : 'plateR') : 'rwing';
  const left = Math.abs(nx) > 0.2 ? nx > 0 : x >= 0;
  if (inCover(x, y, z) && ny < 0.82 && Math.abs(nx) > 0.25) return left ? 'coverL' : 'coverR'; // sloped cover flanks
  if (ny > 0.55) return 'top';
  if (inPod(x, y, z)) return left ? 'podL' : 'podR';
  return left ? 'sideL' : 'sideR';
}

// per-texel map (panel index + panel metres) at a given texture resolution; built once and cached
function texelMap(T, R) {
  if (T.maps[R]) return T.maps[R];
  const panel = new Uint8Array(R * R), X = new Float32Array(R * R), Y = new Float32Array(R * R);
  const idxOf = Object.fromEntries(T.panelNames.map((n, k) => [n, k + 1]));
  const offs = { body: new THREE.Vector3(), fwing: T.fwingCtr, rwing: T.rwingCtr };
  for (const p of T.livery) {
    const g = p.geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, I = g.index;
    const n = I ? I.count : P.count, o = offs[p.group];
    for (let t = 0; t < n; t += 3) {
      const ids = [0, 1, 2].map(k => I ? I.getX(t + k) : t + k);
      const us = ids.map(i => U.getX(i) * R), vs = ids.map(i => (1 - U.getY(i)) * R);
      const minX = Math.max(0, Math.floor(Math.min(...us))), maxX = Math.min(R - 1, Math.ceil(Math.max(...us)));
      const minY = Math.max(0, Math.floor(Math.min(...vs))), maxY = Math.min(R - 1, Math.ceil(Math.max(...vs)));
      const [x0, x1, x2] = us, [y0, y1, y2] = vs;
      const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(den) < 1e-9) continue;
      for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5, cy = py + 0.5;
        const a = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cy - y2)) / den, b = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cy - y2)) / den, c = 1 - a - b;
        if (a < -0.02 || b < -0.02 || c < -0.02) continue;
        const [i0, i1, i2] = ids;
        const x = P.getX(i0) * a + P.getX(i1) * b + P.getX(i2) * c + o.x, y = P.getY(i0) * a + P.getY(i1) * b + P.getY(i2) * c + o.y, z = P.getZ(i0) * a + P.getZ(i1) * b + P.getZ(i2) * c + o.z;
        const nx = N.getX(i0) * a + N.getX(i1) * b + N.getX(i2) * c, ny = N.getY(i0) * a + N.getY(i1) * b + N.getY(i2) * c, nz = N.getZ(i0) * a + N.getZ(i1) * b + N.getZ(i2) * c;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const name = assign(T, p.group, x, y, z, nx / nl, ny / nl, nz / nl), pn = T.panels[name];
        const [sx, sy] = pn.proj(x, y, z), id = py * R + px;
        panel[id] = idxOf[name]; X[id] = Math.min(pn.W, Math.max(0, sx)); Y[id] = Math.min(pn.H, Math.max(0, sy));
      }
    }
  }
  // grow islands by a few texels so filtering never shows seams
  for (let pass = 0; pass < 3; pass++) {
    const src = panel.slice();
    for (let py = 0; py < R; py++) for (let px = 0; px < R; px++) {
      const id = py * R + px; if (src[id]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= R || qy >= R) continue;
        const q = qy * R + qx; if (src[q]) { panel[id] = src[q]; X[id] = X[q]; Y[id] = Y[q]; break; }
      }
    }
  }
  return (T.maps[R] = { panel, X, Y });
}

function makeDef(T) {
  const def = {
    id: 'custom-glb', aspect: 1, projected: true, panels: T.panels,
    labels: { topNumber: [0.8, 0.5], sideNumber: [0.7, 0.55] },
    paintProjected(canvas, L, drawPanel) {
      const R = canvas.width, map = texelMap(T, R), ppm = Math.max(40, R / 8);
      const datas = [null];
      for (const name of T.panelNames) {
        const p = T.panels[name], pc = document.createElement('canvas');
        pc.width = Math.max(2, Math.ceil(p.W * ppm)); pc.height = Math.max(2, Math.ceil(p.H * ppm));
        const g = pc.getContext('2d', { willReadFrequently: true });
        g.setTransform(ppm, 0, 0, ppm, 0, 0); g.beginPath(); g.rect(0, 0, p.W, p.H); g.clip();
        drawPanel(g, name, p);
        datas.push({ d: g.getImageData(0, 0, pc.width, pc.height).data, w: pc.width, h: pc.height });
      }
      const ctx = canvas.getContext('2d'), out = ctx.createImageData(R, R), o = out.data;
      const mc = (L.main ?? 0) >>> 0, sr = (mc >> 16) & 255, sg = (mc >> 8) & 255, sb = mc & 255; // unmapped texels: main colour
      const { panel, X, Y } = map;
      for (let i = 0, n = R * R; i < n; i++) {
        const k = panel[i], j = i * 4;
        if (!k) { o[j] = sr; o[j + 1] = sg; o[j + 2] = sb; o[j + 3] = 255; continue; }
        const D = datas[k], px = Math.min(D.w - 1, (X[i] * ppm) | 0), py = Math.min(D.h - 1, (Y[i] * ppm) | 0), q = (py * D.w + px) * 4;
        o[j] = D.d[q]; o[j + 1] = D.d[q + 1]; o[j + 2] = D.d[q + 2]; o[j + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
    },
    // designer click-to-place: livery uv -> panel + metres
    uvToPanel(u, v) {
      const R = 1024, map = texelMap(T, R);
      const px = Math.min(R - 1, Math.max(0, (u * R) | 0)), py = Math.min(R - 1, Math.max(0, ((1 - v) * R) | 0));
      const id = py * R + px, k = map.panel[id];
      if (!k) return null;
      return { panel: T.panelNames[k - 1], x: map.X[id], y: map.Y[id] };
    },
    // a picture of which panel covers which part of this model's texture (for modellers)
    template() {
      const R = 1024, map = texelMap(T, R), c = document.createElement('canvas'); c.width = c.height = R;
      const g = c.getContext('2d'), img = g.createImageData(R, R);
      const cols = [[40, 44, 52], [224, 80, 80], [80, 160, 224], [224, 176, 64], [96, 192, 112], [176, 112, 224], [224, 128, 64], [64, 192, 192], [192, 192, 64], [224, 112, 176], [128, 144, 255], [112, 224, 160]];
      for (let i = 0; i < R * R; i++) { const cc = cols[map.panel[i] % cols.length]; img.data.set([cc[0], cc[1], cc[2], 255], i * 4); }
      g.putImageData(img, 0, 0);
      g.font = 'bold 22px Arial'; g.fillStyle = '#fff';
      T.panelNames.forEach((n, k) => { const cc = cols[(k + 1) % cols.length]; g.fillStyle = `rgb(${cc})`; g.fillRect(12, 12 + k * 28, 20, 20); g.fillStyle = '#fff'; g.fillText(n, 40, 30 + k * 28); });
      return c;
    },
  };
  return def;
}

// ---------------- a car from the template ----------------
const shared = {};
const phong = (key, opts) => shared[key] || (shared[key] = new THREE.MeshPhongMaterial(opts));
function buildCar(cfg, opts = {}) {
  cfg = fillLivery({ ...cfg });
  const T = TPL, low = !!opts.low, R = opts.texSize >= 1024 ? 1024 : 512;
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const livCanvas = document.createElement('canvas'); livCanvas.width = livCanvas.height = R;
  const livTex = new THREE.CanvasTexture(livCanvas); livTex.colorSpace = THREE.SRGBColorSpace; livTex.anisotropy = 4;
  const paint = new THREE.MeshPhongMaterial({ map: livTex, specular: 0x5a5a5a, shininess: 80, side: THREE.DoubleSide });
  const carbon = phong('carbon', { map: carbonTex(), color: 0x9a9aa0, specular: 0x333333, shininess: 40, side: THREE.DoubleSide });
  const tyre = phong('tyre', { color: 0x1b1b1e, specular: 0x111111, shininess: 8 });
  const rimMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(RIMCOL[cfg.rimCol] || '#26282e'), specular: 0x888888, shininess: 70 });
  const matFor = (p) => {
    if (p.mat === 'Livery') return paint;
    if (p.mat === 'Carbon') return carbon;
    if (p.mat === 'Tyre') return tyre;
    if (p.mat === 'Rim') return rimMat;
    if (p.mat === 'TyreStripe') return null; // set by setCompound
    if (/dark|black/i.test(p.mat)) return phong('dark', { color: 0x0e0e10, side: THREE.DoubleSide });
    if (/metal|steel|chrome/i.test(p.mat)) return phong('metal', { color: 0x8a8c92, specular: 0x999999, shininess: 90 });
    return phong('m-' + p.mat, { color: p.color, specular: 0x444444, shininess: 50, side: THREE.DoubleSide });
  };
  const mesh = (p, parent) => { const m = new THREE.Mesh(p.geo, matFor(p)); if (p.mat === 'TyreStripe') m.userData.stripe = true; parent.add(m); return m; };
  for (const p of T.body) mesh(p, body);
  const fwing = new THREE.Group(); fwing.position.copy(T.fwingCtr); body.add(fwing); for (const p of T.fwing) mesh(p, fwing);
  const rwing = new THREE.Group(); rwing.position.copy(T.rwingCtr); body.add(rwing); for (const p of T.rwing) mesh(p, rwing);
  // wheels
  const wheels = [], order = ['FL', 'FR', 'RL', 'RR'];
  for (const c of order) {
    const info = T.wheelInfo[c], list = T.wheels[c]; if (!info) continue;
    const pivot = new THREE.Group(); pivot.position.copy(info.ctr); group.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    for (const p of list) mesh(p, spin);
    wheels.push({ pivot, mesh: spin, r: info.r, front: c[0] === 'F', x: info.ctr.x, z: info.ctr.z, baseY: info.ctr.y, corner: c });
  }
  // suspension links: pivot at the chassis end, aimed at the wheel every frame
  const arms = [];
  for (const a of T.arms) {
    const holder = new THREE.Group(); holder.position.copy(a.inner); body.add(holder);
    const m = new THREE.Mesh(a.geo, matFor(a)); holder.add(m);
    arms.push({ holder, dir0: a.dir0, outerRel: a.outerRel, wheel: wheels.findIndex(w => w.corner === a.corner) });
  }
  // driver + lights + shadow
  const kit = driverKit(cfg, { low, texSize: R });
  kit.place(body, T.helmet.x, T.helmet.y, T.helmet.z);
  const lights = carLights(body, 0, Math.max(0.3, T.bb.min.y + 0.25), T.bb.min.z - 0.02);
  const shadow = blobShadow(2.5, (T.bb.max.z - T.bb.min.z) + 0.8);

  let later = 0;
  const repaintAll = () => {
    const again = () => { if (later) return; later = setTimeout(() => { later = 0; repaintAll(); }, 30); };
    paintCar(livCanvas, cfg, T.def, again); livTex.needsUpdate = true;
    kit.repaint(cfg, again);
    rimMat.color.set(RIMCOL[cfg.rimCol] || '#26282e');
  };
  repaintAll();

  const model = { group, body, wheels, shadow, lightMat: lights.lightMat, tail: lights.tail, coronaMat: lights.coronaMat, fwing, rwing,
    livery: livCanvas, livTex, cfg, def: T.def, helmet: kit.helmet, visorMat: kit.visorMat, suitTex: kit.suitTex, limbTex: kit.limbTex, armTex: kit.armTex, helTex: kit.helTex, helCanvas: kit.helCanvas };
  const stripeMats = {};
  model.setCompound = (c) => {
    const col = { soft: 0xe0302a, medium: 0xf2d22a, hard: 0xf0f0f0, wet: 0x2a7ae0 }[c] ?? 0xf2d22a;
    const mat = stripeMats[c] || (stripeMats[c] = new THREE.MeshBasicMaterial({ color: col }));
    for (const w of wheels) w.mesh.traverse(o => { if (o.userData.stripe) o.material = mat; });
  };
  model.setCompound('medium');
  const fw0 = fwing.position.clone(), rw0 = rwing.position.clone();
  model.setDamage = (d) => {
    const wob = (g, v, dir) => { g.visible = v < 0.72; g.rotation.z = v > 0.3 ? (v - 0.3) * 0.5 * dir : 0; g.rotation.x = v > 0.3 ? (v - 0.3) * 0.3 : 0; };
    wob(fwing, d.fw, model.pull || 1); wob(rwing, d.rw, -(model.pull || 1));
    fwing.position.copy(fw0); rwing.position.copy(rw0);
  };
  model.repaint = (L) => { if (L && L !== model.cfg) Object.assign(model.cfg, fillLivery(L)); cfg = model.cfg; repaintAll(); };
  const _t = new THREE.Vector3(), _d = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), inv = new THREE.Matrix4();
  model.animate = ({ steer = 0, spin = 0, pitch = 0, roll = 0, heave = 0, bump = [0, 0, 0, 0] } = {}) => {
    body.rotation.x = pitch; body.rotation.z = roll; body.position.y = heave;
    wheels.forEach((w, k) => {
      w.mesh.rotation.x += spin / w.r;
      if (w.front) w.pivot.rotation.y = steer;
      w.pivot.position.y = w.baseY + (bump[k] || 0);
    });
    body.updateMatrix(); inv.copy(body.matrix).invert();
    for (const a of arms) {
      const w = wheels[a.wheel]; if (!w || !a.outerRel) continue;
      // wheel end (moves with steering + bumps) in the body's space
      _t.copy(a.outerRel).applyAxisAngle(Y, w.front ? w.pivot.rotation.y : 0).add(w.pivot.position).applyMatrix4(inv);
      _d.copy(_t).sub(a.holder.position).normalize();
      a.holder.quaternion.setFromUnitVectors(a.dir0, _d);
    }
  };
  group.updateMatrixWorld(true);
  model.animate();
  return model;
}
