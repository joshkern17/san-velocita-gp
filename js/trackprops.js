// Trackside props from the race-track pack (tools/props/trackprops.py -> assets/env/trackprops.glb, catalogue
// cat 'trackside'): grandstands with fans in their seats, ad towers, banner gantries, boards, flags, lamp posts,
// floodlights, arches, fences, pit buildings. A placed one is a track prop { type: '<asset id>', x, z, rot, sx? }.
//
//   trackPropFamilies()                 the editor's tiles: one per family, its variants (asset ids) inside
//   placeTrackProps(ctx)                the world's: models into the scenery batches (envPl), the fans in the stands,
//                                       the floodlights' night glow. Returns { update(t, camera) } or null
//   buildStartGantry(ctx)               the start lights over the grid (the pack's gantry, five lamp boxes); its lamps
//                                       are the world's startLights (race.js lights them)
//   LOGOS / applyLogos(track)           the logo sheet every banner, board and flag shares, with the track's own logos
//                                       (track.logos { slot: data URL }) drawn over the pack's
import * as THREE from 'three';
import { envAssets, envAsset, envModel } from './envlib.js';
import { loadCrowd, buildCrowd } from './crowd.js';

export const isTrackProp = (type) => typeof type === 'string' && /^(tp|gs)_/.test(type) && !!envAsset(type); // (gs_: the modular grandstands, js/gstands.js)

// ---------------- the editor's families ----------------
// (in the order the tiles go in; colour on the map; how far apart on a line by default: their width plus gap)
const FAMILY = {
  // the modular grandstands (js/gstands.js): a line is a stand, end to end, 12 m bays
  gs_S: { color: '#5a8ab8', gap: 0, kit: true, sub: 'Modular · 10 rows on a steel frame, any length' },
  gs_M: { color: '#4a6ab0', gap: 0, kit: true, sub: 'Modular · 18 rows under a cantilever roof' },
  gs_L: { color: '#3a4a98', gap: 0, kit: true, sub: 'Modular · two decks, hospitality glass, 27 m roof' },
  stand_roof: { color: '#5a7ab8', gap: 0.4, sub: '90 seats, with fans' },
  stand_flags: { color: '#b85a5a', gap: 0.4, sub: '90 seats, with fans' },
  adtower: { color: '#d8b43a', gap: 3, sub: 'Spotlights aimed at the track, lit at night' },
  gantry: { color: '#c8a030', gap: 6, sub: 'Over the track' },
  gantry_wide: { color: '#c8a030', gap: 6, sub: 'Over the track' },
  board: { color: '#e0c050', gap: 0.15, sub: 'Draw a line of them' },
  flag: { color: '#e05050', gap: 2.5, sub: 'Draw a line of them' },
  lamppost: { color: '#8a8f99', gap: 10 },
  lamppost_plain: { color: '#8a8f99', gap: 10 },
  floodmast: { color: '#f3e7a1', gap: 30, sub: 'Warm floodlight at night' },
  stadium_light: { color: '#f3e7a1', gap: 30, sub: 'Warm floodlight at night' },
  worklight: { color: '#e8dc98', gap: 8 },
  camera_tower: { color: '#7a7f88', gap: 10 },
  arch: { color: '#9aa0a8', gap: 10, sub: 'Over the track' },
  arch_balloons: { color: '#e070a0', gap: 10, sub: 'Over the track' },
  festoon: { color: '#f0e090', gap: 1 },
  fence: { color: '#606570', gap: 0.05, sub: 'Draw a line of them' },
  tire_rack: { color: '#303030', gap: 1 },
  pit_building: { color: '#6a8aa8', gap: 1 },
};
export function trackPropFamilies() {
  const all = envAssets({ cat: 'trackside' }).filter(a => !a.hidden), out = [];
  for (const cls of Object.keys(FAMILY)) {
    const ids = all.filter(a => a.cls === cls);
    if (!ids.length) continue;
    const a = ids[0];
    out.push({ cls, label: a.label, ids: ids.map(q => q.id), span: !!a.span, w: a.w, d: a.d, h: a.h, ...FAMILY[cls] });
  }
  return out;
}
// the families that light up at night (and have a light strength)
export const LIGHT_FAMILIES = ['floodmast', 'stadium_light', 'worklight', 'adtower'];
export const trackPropFamily = (id) => { const a = envAsset(id); return a ? { ...FAMILY[a.cls], cls: a.cls, label: a.label, span: !!a.span, w: a.w, d: a.d } : null; };

// ---------------- the logo sheet ----------------
// Where each logo sits on the pack's sheet (0..1 from the top left: x, y, w, h). A track can put its own image over
// any of them (track.logos[slot], a data URL): every banner, board and flag showing that logo shows the new one.
export const LOGOS = {
  kn: { label: 'K&N', r: [0.0, 0.02, 0.48, 0.17] }, nos: { label: 'NOS', r: [0.527, 0.005, 0.318, 0.181] },
  hks: { label: 'HKS', r: [0.024, 0.19, 0.4, 0.1] }, tk: { label: 'TK Racing', r: [0.459, 0.222, 0.508, 0.1] },
  brembo: { label: 'Brembo', r: [0.024, 0.306, 0.44, 0.08] }, motul: { label: 'Motul', r: [0.02, 0.408, 0.464, 0.127] },
  monster: { label: 'Monster', r: [0.524, 0.354, 0.41, 0.193] }, liquimoly: { label: 'Liqui Moly', r: [0.02, 0.555, 0.464, 0.073] },
  yokohama: { label: 'Yokohama', r: [0.02, 0.646, 0.422, 0.152] }, pirelli: { label: 'Pirelli', r: [0.561, 0.569, 0.405, 0.227] },
  zigen: { label: '5Zigen', r: [0.451, 0.645, 0.064, 0.342], tall: true }, michelin: { label: 'Michelin', r: [0.02, 0.806, 0.415, 0.18] },
  castrol: { label: 'Castrol', r: [0.532, 0.83, 0.459, 0.112] },
};
let brandsMat = null, brandsOrig = null;
const findBrands = () => {
  if (brandsMat) return brandsMat;
  for (const id of ['tp_board_0', 'tp_flag_0', 'tp_adtower_0']) {
    const parts = envModel(id); if (!parts) continue;
    const pt = parts.find(p => /Brands/.test(p.mat.name)); if (pt) { brandsMat = pt.mat; brandsOrig = pt.mat.map; break; }
  }
  return brandsMat;
};
// the sheet as a picture (the editor's logo panel): a canvas of the original, or null before the models are in
export function logoSheetImage() { findBrands(); return brandsOrig && brandsOrig.image || null; }
const loaded = new Map(); // data URL -> Image (loaded)
function loadImg(src) {
  if (loaded.has(src)) return Promise.resolve(loaded.get(src));
  return new Promise((res) => { const im = new Image(); im.onload = () => { loaded.set(src, im); res(im); }; im.onerror = () => res(null); im.src = src; });
}
// draw an image into a logo's slot: its background first (the slot's own corner colour), then the image fitted
// inside with a little margin, never stretched (tall slots: turned a quarter, like the pack's vertical logo)
export function drawLogo(g, im, slot, W, H) {
  const [x, y, w, h] = LOGOS[slot].r, px = x * W, py = y * H, pw = w * W, ph = h * H;
  g.save();
  g.fillStyle = '#ffffff'; g.fillRect(px - 1, py - 1, pw + 2, ph + 2);
  g.beginPath(); g.rect(px, py, pw, ph); g.clip();
  const tall = LOGOS[slot].tall && im.width > im.height;
  const iw = tall ? im.height : im.width, ih = tall ? im.width : im.height;
  const k = Math.min(pw * 0.92 / iw, ph * 0.9 / ih), dw = iw * k, dh = ih * k;
  g.translate(px + pw / 2, py + ph / 2);
  if (tall) g.rotate(-Math.PI / 2);
  g.drawImage(im, tall ? -dh / 2 : -dw / 2, tall ? -dw / 2 : -dh / 2, tall ? dh : dw, tall ? dw : dh);
  g.restore();
}
let sheetKey = '';
// the track's logos onto the shared sheet (or the pack's own back, for a track with none). Async: the images decode
export async function applyLogos(track) {
  const m = findBrands(); if (!m || !brandsOrig || !brandsOrig.image) return;
  const L = track && track.logos || {}, slots = Object.keys(L).filter(k => LOGOS[k] && L[k]);
  const key = slots.map(k => k + ':' + L[k].length + L[k].slice(-24)).join('|');
  if (key === sheetKey) return;
  sheetKey = key;
  if (!slots.length) { m.map = brandsOrig; m.needsUpdate = true; return; }
  const src = brandsOrig.image, W = 1024, H = Math.round(1024 * (src.height || 1024) / (src.width || 1024));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0, W, H);
  const ims = await Promise.all(slots.map(k => loadImg(L[k])));
  if (sheetKey !== key) return; // (another track since)
  slots.forEach((k, i) => { if (ims[i]) drawLogo(g, ims[i], k, W, H); });
  const t = new THREE.CanvasTexture(c);
  t.flipY = brandsOrig.flipY; t.colorSpace = brandsOrig.colorSpace; t.wrapS = brandsOrig.wrapS; t.wrapT = brandsOrig.wrapT;
  t.magFilter = brandsOrig.magFilter; t.anisotropy = brandsOrig.anisotropy;
  m.map = t; m.needsUpdate = true;
}

// ---------------- in the world ----------------
// fans in the stands: off for now (2026-10-19: the stands stand empty until the crowds are worth having)
export const CROWDS = false;
// ctx: { track, T, A, root, envPl, groundHeight, lit (the floodlights on: dusk / night), night }
// Pushes the models into envPl (drawn with the rest of the scenery), seats fans in the stands (once the characters
// are in), and puts up the floodlights' glow. Returns { update(t, camera) } (the lights near the camera) or null.
export function placeTrackProps(ctx) {
  const { track, T, root, envPl, groundHeight } = ctx;
  const props = (track.props || []).filter(p => isTrackProp(p.type));
  applyLogos(track);
  lensGlow(ctx.lit);
  if (!props.length) return null;
  const people = [], floods = [], heads = [];
  const frac = (v) => v - Math.floor(v), h01 = (a, b, k) => frac(Math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453);
  // a line of grandstands on a bank one smooth terrace: each stand's height (its front row on the ground) eased with
  // its neighbours' along the line, its front never sunk more than 0.4 m (one by one they step like a staircase)
  const front = (p) => { const a = envAsset(p.type), rot = p.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot), W = a.w * (p.sx || 1) / 2, D = a.d / 2; let y = -Infinity; for (const [lx, lz] of [[-W, D], [W, D], [0, D]]) y = Math.max(y, groundHeight(p.x + lx * cs + lz * sn, p.z - lx * sn + lz * cs)); return y; };
  const kitOf = new Map(); for (const st of ctx.kits || []) for (const pc of st.pieces) kitOf.set(pc.p, st);
  const standY = new Map(), lines = new Map();
  for (const p of props) if (p.ln != null && /^stand/.test((envAsset(p.type) || {}).cls || '')) { if (!lines.has(p.ln)) lines.set(p.ln, []); lines.get(p.ln).push(p); }
  for (const L of lines.values()) {
    const f = L.map(front);
    L.forEach((p, k) => { let s = 0, n = 0; for (let q = Math.max(0, k - 2); q <= Math.min(L.length - 1, k + 2); q++) { s += f[q]; n++; } standY.set(p, Math.max(s / n, f[k] - 0.4)); });
  }
  for (const p of props) {
    const a = envAsset(p.type), rot = p.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot), sx = p.sx || 1;
    const W = a.w * sx / 2, D = a.d / 2;
    // on the highest ground under it (its legs reach down to the rest); over the track: on the track. A grandstand
    // stands on its front (the track side, local +z: the front row's on the ground), its back built into a bank that
    // rises behind it, as real ones are; on the highest ground it'd hang its front rows in the air
    const stand = /^stand/.test(a.cls || '');
    let y = -Infinity;
    for (const [lx, lz] of stand ? [[-W, D], [W, D], [0, D]] : [[-W, -D], [W, -D], [-W, D], [W, D], [0, 0]]) y = Math.max(y, groundHeight(p.x + lx * cs + lz * sn, p.z - lx * sn + lz * cs));
    if (a.span) y = groundHeight(p.x, p.z);
    if (standY.has(p)) y = standY.get(p);
    if (p.kit !== undefined || /^gs_/.test(p.type)) { const st = kitOf.get(p); if (st) y = st.level; } // (a modular stand: all its pieces level)
    envPl.push({ id: p.type, x: p.x, y: y - 0.03, z: p.z, rot, s: 1, sx, sy: 1, sz: 1 });
    // fans on the seats
    if (CROWDS && a.seats && p.crowd !== false) a.seats.forEach(([x, py, z], k) => {
      if (h01(p.x, p.z, k) > (p.fill ?? 0.8)) return; // (some seats empty)
      const j = h01(p.z, p.x, k);
      people.push({ x: p.x + x * cs + z * sn, y: y - 0.03 + py - 0.48, z: p.z - x * sn + z * cs, rot: rot + (j - 0.5) * 0.3, sit: true, s: j });
    });
    // ad towers: their spotlights, each turned to aim at the nearest bit of track (put back on the tower: the heads
    // were cut off it in the bake, tools/props/trackprops.py)
    if (a.heads && a.heads.length) {
      const H = a.heads.map(([x, hy, z]) => [p.x + x * sx * cs + z * sn, y - 0.03 + hy, p.z - x * sx * sn + z * cs]);
      const c = H.reduce((q, h) => [q[0] + h[0] / H.length, q[1] + h[1] / H.length, q[2] + h[2] / H.length], [0, 0, 0]);
      const aim = nearestTrack(T, c[0], c[2], p, groundHeight);
      for (const h of H) heads.push({ at: h, aim });
      floods.push({ lamps: H, c, aim, size: 'mid', k: Math.max(0, p.light ?? 1) });
    }
    // floodlights: where their lamps are and what they light (the nearest bit of track, or 30 m out in front)
    const lamps = a.lamps && a.lamps.length ? a.lamps : a.cls === 'worklight' ? [[0, a.h - 0.5, 0.35]] : null;
    if (lamps) {
      const L = lamps.map(([x, ly, z]) => [p.x + x * sx * cs + z * sn, y + ly, p.z - x * sx * sn + z * cs]);
      const c = L.reduce((s, q) => [s[0] + q[0] / L.length, s[1] + q[1] / L.length, s[2] + q[2] / L.length], [0, 0, 0]);
      let ax = p.x + sn * 30, az = p.z + cs * 30, bd = Infinity;
      for (let i = 0; i < T.N; i += 2) { const d = (T.X[i] - c[0]) ** 2 + (T.Z[i] - c[2]) ** 2; if (d < bd) { bd = d; ax = T.X[i]; az = T.Z[i]; } }
      const reach = Math.min(70, Math.max(18, Math.sqrt(bd)));
      if (Math.sqrt(bd) > 70) { ax = c[0] + sn * 40; az = c[2] + cs * 40; }
      // (k: how strong, the prop's own light setting: 1 as made, 0.2 a glimmer, 2 twice as bright)
      floods.push({ lamps: L, c, aim: [ax, groundHeight(ax, az), az], big: a.cls === 'floodmast' || a.cls === 'stadium_light', reach, k: Math.max(0, p.light ?? 1) });
    }
  }
  if (people.length) loadCrowd().then(ok => { if (ok) root.add(buildCrowd(people)); });
  if (heads.length) spotHeads(root, heads);
  return ctx.lit && floods.length ? floodlights(root, floods) : null;
}
// the nearest bit of track to (x, z), on its surface; where a prop far from the track is turned (40 m out in front)
function nearestTrack(T, x, z, p, groundHeight) {
  let bd = Infinity, bi = 0;
  for (let i = 0; i < T.N; i += 2) { const d = (T.X[i] - x) ** 2 + (T.Z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  if (Math.sqrt(bd) > 90) { const rot = p.rot || 0, ax = x + Math.sin(rot) * 40, az = z + Math.cos(rot) * 40; return [ax, groundHeight(ax, az), az]; }
  return [T.X[bi], T.Y[bi], T.Z[bi]];
}
// spotlight heads (tp_adtower_head: lens toward +Z), each pointed at its aim from where it hangs: one batch per part
function spotHeads(root, heads) {
  const parts = envModel('tp_adtower_head'); if (!parts) return;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), from = new THREE.Vector3(), to = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), look = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  for (const pt of parts) {
    // (lit evenly: the library darkens a model's lower half, and a head is centred on its pivot)
    const geo = pt.geo.clone(); const col = geo.getAttribute('color'); if (col) { col.array.fill(1); col.needsUpdate = true; }
    const im = new THREE.InstancedMesh(geo, pt.mat, heads.length);
    heads.forEach((h, k) => {
      from.set(...h.at); to.set(...h.aim);
      // (Matrix4.lookAt points -Z at the target: turned round, +Z (the lens) does)
      look.lookAt(to, from, up); q.setFromRotationMatrix(look);
      m.compose(from, q, one); im.setMatrixAt(k, m);
    });
    im.computeBoundingSphere(); root.add(im);
  }
}
// the lamp lenses on the masts glow (warm) when the floodlights are on, plain white when they're off
function lensGlow(on) {
  for (const id of ['tp_floodmast', 'tp_stadium_light', 'tp_worklight_a', 'tp_worklight_b', 'tp_adtower_head']) {
    const parts = envModel(id); if (!parts) continue;
    for (const pt of parts) {
      if (/MastLens/.test(pt.mat.name)) { pt.mat.emissive.setHex(on ? 0xffc890 : 0x000000); pt.mat.emissiveIntensity = on ? 1.6 : 0; }
    }
  }
}

// The floodlights at night: atmospheric and a little warm. Each lamp a bright core and a soft halo, a hazy beam
// down to what it lights, a warm pool on the ground there, and the masts nearest the camera throw real light on the
// cars and walls (eased in and out as you drive, like the circuit's lamps).
// Each light's strength (f.k) scales all of it: its glows (their colour: they're additive), its beam, its pool and
// the real light it throws.
const WARM = 0xffc58a;
function floodlights(root, floods) {
  floods = floods.filter(f => f.k > 0);
  if (!floods.length) return null;
  const g = new THREE.Group(); g.name = 'floodlights'; root.add(g);
  const tex = glowTexture(), core = [], coreK = [], halo = [], haloK = [];
  for (const f of floods) { for (const q of f.lamps) { core.push(...q); coreK.push(f.k, f.k, f.k); } halo.push(...f.c); haloK.push(f.k, f.k, f.k); }
  const pts = (arr, ks, size, color, opacity) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(ks, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size, color, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
    m.renderOrder = 6; g.add(m);
  };
  pts(core, coreK, 2.2, new THREE.Color(0xffe2b8).multiplyScalar(1.3), 1);
  pts(halo, haloK, 26, 0xffa860, 0.11);
  pts(halo, haloK, 9, 0xffd0a0, 0.24);
  // beams: a cone from the lamps to the ground they light, haze in the night air. Soft: brightest where you look
  // through the middle of it, fading to nothing at its edges (no hard outline) and along its length
  const cone = beamCone();
  const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  for (const f of floods) {
    v.set(f.c[0] - f.aim[0], f.c[1] - f.aim[1], f.c[2] - f.aim[2]);
    const len = v.length(); v.normalize();
    const r = f.big ? Math.min(22, len * 0.3) : f.size === 'mid' ? Math.min(12, len * 0.32) : Math.min(7, len * 0.4);
    const b = new THREE.Mesh(cone, beamMaterial(f.k));
    b.position.set(f.c[0], f.c[1], f.c[2]); b.quaternion.setFromUnitVectors(up, v);
    b.scale.set(r, len, r); b.renderOrder = 5; b.frustumCulled = false; g.add(b);
  }
  // pools of light where they land
  const pool = poolTexture();
  const disc = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (const f of floods) {
    const poolMat = new THREE.MeshBasicMaterial({ map: pool, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0xffbc84).multiplyScalar(Math.min(1.8, f.k)), opacity: 0.24, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const m = new THREE.Mesh(disc, poolMat), R = (f.big ? 46 : f.size === 'mid' ? 26 : 16) * (0.75 + 0.25 * Math.min(2, f.k));
    m.position.set(f.aim[0], f.aim[1] + 0.12, f.aim[2]); m.scale.set(R, 1, R); m.renderOrder = 2; g.add(m);
  }
  // real light from the masts nearest the camera (a handful, shared)
  const K = 4, lights = [];
  for (let k = 0; k < K; k++) { const l = new THREE.PointLight(WARM, 0, 120, 1.4); g.add(l); lights.push(l); }
  const w = new Float32Array(floods.length);
  let lastT = null;
  return {
    update(t, camera) {
      if (!camera) return;
      const dt = lastT === null ? 1 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      const cx = camera.position.x, cz = camera.position.z;
      const order = floods.map((f, i) => i).sort((a, b) => ((floods[a].aim[0] - cx) ** 2 + (floods[a].aim[2] - cz) ** 2) - ((floods[b].aim[0] - cx) ** 2 + (floods[b].aim[2] - cz) ** 2));
      order.forEach((i, k) => {
        const f = floods[i], d = Math.hypot(f.aim[0] - cx, f.aim[2] - cz);
        const target = k < K ? Math.max(0, Math.min(1, (220 - d) / 90)) : 0;
        w[i] += (target - w[i]) * Math.min(1, dt * 1.5);
      });
      const lit = order.filter(i => w[i] > 0.003).slice(0, K);
      for (let k = 0; k < K; k++) {
        const i = lit[k], l = lights[k];
        if (i === undefined) { l.intensity = 0; continue; }
        const f = floods[i];
        // (between the lamps and where they point: the light falls on the ground and on what's in the way)
        l.position.set(f.c[0] * 0.45 + f.aim[0] * 0.55, f.c[1] * 0.45 + f.aim[1] * 0.55 + 4, f.c[2] * 0.45 + f.aim[2] * 0.55);
        l.intensity = (f.big ? 620 : f.size === 'mid' ? 260 : 110) * f.k * w[i];
      }
    },
  };
}
// Soft volumetric beam. Not shaded by the cone's faces (their facets would show): for each pixel, how close the line
// of sight passes to the beam's axis, against the beam's radius there (bright down the core, nothing at its edge), and
// how far down the beam that is (it thins out toward the ground). Only the cone's far side is drawn, so each pixel
// is counted once (and still, from inside the beam). Additive and fogged.
// The beam is wherever its mesh puts the cone: a cone of base radius baseRad with its tip at the origin and its base
// at y = -1 (beamCone), placed and stretched by the mesh (or each instance: one draw for a whole circuit's lamps, each
// instance's strength in its instance colour). strength: all of them.
export function beamCone(baseRad = 1) { return new THREE.ConeGeometry(baseRad, 1, 32, 1, true).translate(0, -0.5, 0); }
export function beamMaterial(strength = 1, baseRad = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(0xffc68c) }, k: { value: 0.11 * strength }, baseRad: { value: baseRad },
      fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 }, fogDensity: { value: 0 } },
    vertexShader: `uniform float baseRad; varying vec3 vWorld; varying vec3 vApex; varying vec3 vAxis; varying float vLen; varying float vRad; varying float vK;
      #include <fog_pars_vertex>
      void main() {
        mat4 im = modelMatrix;
        #ifdef USE_INSTANCING
        im = modelMatrix * instanceMatrix;
        #endif
        vec4 wp = im * vec4(position, 1.0); vWorld = wp.xyz;
        vec3 ay = im[1].xyz; vLen = length(ay); vAxis = -ay / max(vLen, 1e-4); vApex = im[3].xyz; vRad = baseRad * length(im[0].xyz);
        vK = 1.0;
        #ifdef USE_INSTANCING_COLOR
        vK = instanceColor.r;
        #endif
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 col; uniform float k; varying vec3 vWorld; varying vec3 vApex; varying vec3 vAxis; varying float vLen; varying float vRad; varying float vK;
      #include <fog_pars_fragment>
      void main() {
        // the closest the line of sight comes to the axis (both as lines; the sight from the camera onward)
        vec3 axis = normalize(vAxis), rd = normalize(vWorld - cameraPosition), w0 = cameraPosition - vApex;
        float b = dot(rd, axis), d = dot(rd, w0), e = dot(axis, w0), den = max(1.0 - b * b, 1e-4);
        float s = max((b * e - d) / den, 0.0), t = clamp((e - b * d) / den, 0.0, vLen);
        float dist = length(cameraPosition + rd * s - (vApex + axis * t)), r = max(vRad * t / vLen, 0.08);
        float core = 1.0 - smoothstep(0.0, r, dist), f = t / vLen;
        float a = k * vK * core * core * pow(1.0 - f, 1.4) * smoothstep(0.0, 0.08, f);
        gl_FragColor = vec4(col * a, 1.0);
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: true,
  });
}
let _glow = null;
function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15, 'rgba(255,255,255,0.85)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.25)');
  grd.addColorStop(0.65, 'rgba(255,255,255,0.05)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c); _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}
let _pool = null;
function poolTexture() {
  if (_pool) return _pool;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.15)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  _pool = new THREE.CanvasTexture(c); _pool.colorSpace = THREE.SRGBColorSpace;
  return _pool;
}

// ---------------- the start lights ----------------
// The pack's gantry over the grid (tp_start_gantry): its legs moved in to the track's edges (the truss between them
// stretched or squeezed to fit, the light boxes left as they are), five lamp boxes in the middle facing both ways.
// Each lamp's material is its own: off, they're dark glass; a red on is bright, with a glow you can see from the back
// of the grid. lights: five objects with color.setHex (race.js sets them red as the count goes up, dark at lights
// out: 0xff2010 on, anything else off). At lights out the greens come on for a couple of seconds, so the start reads
// from anywhere on the grid.
// ctx: { T, i (the sample it stands over), root }. null without the model (the old gantry then)
export function buildStartGantry({ T, i, root, y }) {
  const parts = envModel('tp_start_gantry'), a = envAsset('tp_start_gantry');
  if (!parts || !a) return null;
  const half = T.W[i] / 2, H = a.w / 2;
  // the legs: measured off the model (everything below 4 m is legs)
  let L = H;
  for (const pt of parts) { const pos = pt.geo.getAttribute('position'); for (let k = 0; k < pos.count; k++) if (pos.getY(k) < 4) L = Math.min(L, Math.abs(pos.getX(k))); }
  const legW = H - L, legW2 = Math.min(legW, 1.6), boxHalf = 3.4;
  const L2 = half + 1.1; // (the legs' inside edge, just off the track)
  const mapX = (x) => {
    const s = Math.sign(x), ax = Math.abs(x);
    if (ax <= boxHalf) return x;
    if (ax >= L) return s * (L2 + (ax - L) * legW2 / legW);
    return s * (boxHalf + (ax - boxHalf) * (L2 - boxHalf) / (L - boxHalf));
  };
  const grp = new THREE.Group(); grp.name = 'StartGantry';
  const lamps = { R: [], G: [] };
  for (const pt of parts) {
    const geo = pt.geo.clone(), pos = geo.getAttribute('position');
    for (let k = 0; k < pos.count; k++) pos.setX(k, mapX(pos.getX(k)));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const lamp = /^Lamp([RG])(\d)/.exec(pt.mat.name);
    let mat = pt.mat;
    if (lamp) {
      mat = new THREE.MeshBasicMaterial({ map: pt.mat.map, color: 0x161616 });
      lamps[lamp[1]][+lamp[2]] = mat;
    }
    grp.add(new THREE.Mesh(geo, mat));
  }
  grp.position.set(T.X[i], y, T.Z[i]);
  grp.rotation.y = Math.atan2(T.FX[i], T.FZ[i]);
  root.add(grp);
  // glows over each lamp, just off both its faces: off unless lit
  const glowAt = (kind) => lamps[kind].map((m, k) => {
    const pt = parts.find(q => q.mat.name === 'Lamp' + kind + k); if (!pt) return null;
    const bb = new THREE.Box3().setFromBufferAttribute(pt.geo.getAttribute('position'));
    const c = bb.getCenter(new THREE.Vector3()), sm = new THREE.SpriteMaterial({ map: glowTexture(), color: kind === 'R' ? 0xff3018 : 0x30ff60, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const two = [bb.min.z - 0.12, bb.max.z + 0.12].map(z => { const sp = new THREE.Sprite(sm); sp.position.set(c.x, c.y, z); sp.scale.set(3.6, 3.6, 1); sp.renderOrder = 7; grp.add(sp); return sp; });
    return { set visible(v) { two[0].visible = two[1].visible = v; } };
  });
  const glowR = glowAt('R'), glowG = glowAt('G');
  const ON = { R: new THREE.Color(0xff2a14).multiplyScalar(2.2), G: new THREE.Color(0x2aff5a).multiplyScalar(2) }, OFF = 0x161616;
  const set = (kind, k, on) => { const m = lamps[kind][k]; if (m) m.color.copy(on ? ON[kind] : new THREE.Color(OFF)); const s = (kind === 'R' ? glowR : glowG)[k]; if (s) s.visible = on; };
  for (let k = 0; k < 5; k++) { set('R', k, false); set('G', k, false); }
  // race.js sets each light: red on, else off; all five going off together is lights out
  let reds = 0, greenT = -1, time = 0;
  const lights = [0, 1, 2, 3, 4].map(k => ({ color: { setHex: (hex) => {
    const on = hex === 0xff2010;
    const was = !!(reds & (1 << k));
    if (on === was) return;
    if (on) reds |= 1 << k; else reds &= ~(1 << k);
    set('R', k, on);
    if (!on && k === 4 && reds === 0) { greenT = time; for (let q = 0; q < 5; q++) set('G', q, true); } // (lights out)
  } } }));
  return {
    lights,
    update(t) {
      time = t;
      if (greenT >= 0 && t - greenT > 2.5) { greenT = -1; for (let q = 0; q < 5; q++) set('G', q, false); }
    },
  };
}

// ---------------- the catch fence ----------------
// The pack's paddock fence (tp_fence_2: chain link between square posts, the top cranked in over the track) along the
// barriers and the pit wall, any height. strips: the fence's foot, segment by segment in order along each run
// { a: [x, y, z], b, nx, nz } (n: level, toward the track: the way the top leans). H: metres tall. fallback: a
// material for the mesh when the models aren't in (no posts then). Adds its meshes to root.
const FENCE_PITCH = 3.0; // (posts this far apart, as in the pack)
let _postSrc = null;
function fencePostSource() {
  if (_postSrc) return _postSrc;
  const parts = envModel('tp_fence_2'); if (!parts) return null;
  const trim = parts.find(p => /MetalTrim/.test(p.mat.name)), grill = parts.find(p => /FenceGrill/.test(p.mat.name));
  if (!trim || !grill) return null;
  // one post (the left one, x < 0), moved to the origin: its foot's middle at (0, 0, 0), its top cranked to +Z
  const g = trim.geo, P = g.getAttribute('position'), idx = g.index ? g.index.array : [...Array(P.count).keys()];
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) if (P.getX(idx[t]) < 0 && P.getX(idx[t + 1]) < 0 && P.getX(idx[t + 2]) < 0) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = g.getAttribute(name); if (!a) continue;
    const f = new Float32Array(keep.length * a.itemSize);
    keep.forEach((v, k) => { for (let q = 0; q < a.itemSize; q++) f[k * a.itemSize + q] = a.array[v * a.itemSize + q]; });
    out.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
  }
  const p = out.getAttribute('position');
  for (let k = 0; k < p.count; k++) { p.setX(k, p.getX(k) + 1.405); p.setZ(k, p.getZ(k) + 0.27); }
  _postSrc = { geo: out, mat: trim.mat, grill: grill.mat };
  return _postSrc;
}
// the fence's shape at height H: straight up for most of it, the last part cranked in (a short one stays straight)
export const fenceProfile = (H) => {
  const up = H < 1.4 ? H : H * 0.77;
  return { up, lean: H < 1.4 ? 0 : Math.min(0.6, (H - up) * 0.65) };
};
function fencePost(src, H) {
  const { up, lean } = fenceProfile(H), g = src.geo.clone(), p = g.getAttribute('position');
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k), z = p.getZ(k);
    if (y <= 2.75) p.setY(k, y * up / 2.75);
    else { const t = (y - 2.75) / 0.84; p.setY(k, up + t * (H - up)); p.setZ(k, z - 0.54 * t + lean * t); }
  }
  g.computeBoundingSphere();
  return g;
}
export function buildCatchFence(root, strips, H, fallback) {
  if (!strips.length || !(H > 0.1)) return;
  const src = fencePostSource(), { up, lean } = fenceProfile(H);
  const pos = [], uv = [], posts = [];
  let along = 0, nextPost = 0, last = null, lastYaw = 0;
  const push = (a, b, c, d, ua, ub, va, vb) => { pos.push(...a, ...b, ...c, ...b, ...d, ...c); uv.push(ua, va, ub, va, ua, vb, ub, va, ub, vb, ua, vb); };
  for (const s of strips) {
    const { a, b, nx, nz } = s, len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    // a new run: a post at the end of the last one, and at its start
    if (!last || Math.hypot(a[0] - last[0], a[2] - last[2]) > 0.05 || Math.abs(a[1] - last[1]) > 0.3) { if (last) posts.push([...last, lastYaw]); along = 0; nextPost = 0; }
    const ua = along / 0.9, ub = (along + len) / 0.9;
    const ka = [a[0], a[1] + up, a[2]], kb = [b[0], b[1] + up, b[2]];
    push(a, b, ka, kb, ua, ub, 0, up / 0.9);
    if (lean > 0) push(ka, kb, [a[0] + nx * lean, a[1] + H, a[2] + nz * lean], [b[0] + nx * lean, b[1] + H, b[2] + nz * lean], ua, ub, up / 0.9, (up + Math.hypot(H - up, lean)) / 0.9);
    while (nextPost <= along + len) {
      const t = len > 1e-4 ? Math.max(0, (nextPost - along) / len) : 0;
      posts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, Math.atan2(nx, nz)]);
      nextPost += FENCE_PITCH;
    }
    along += len; last = b; lastYaw = Math.atan2(nx, nz);
  }
  if (last) posts.push([...last, lastYaw]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  root.add(new THREE.Mesh(geo, src ? src.grill : fallback));
  if (!src || !posts.length) return;
  const im = new THREE.InstancedMesh(fencePost(src, H), src.mat, posts.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  posts.forEach((p, k) => { q.setFromEuler(e.set(0, p[3], 0)); m.compose(v.set(p[0], p[1], p[2]), q, one); im.setMatrixAt(k, m); });
  im.computeBoundingSphere();
  root.add(im);
}
