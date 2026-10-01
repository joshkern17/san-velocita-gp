// Landmark props: hand-built low-poly models of real buildings.
// Local space: origin at ground level in the middle of the footprint, front faces +z, 1 unit = 1 m.
import * as THREE from 'three';

const texCache = {};
function tex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (texCache[key] = t);
}
// a box whose faces each show `bays` window bays of the given facade texture (UVs scaled per face)
function facadeBox(w, h, d, mat, bays = 5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // faces: +x, -x, +y, -y, +z, -z (4 verts each). Tile the texture horizontally by face width.
  const widths = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++) {
    const rep = Math.max(1, Math.round((widths[f] / w) * bays)) / bays;
    for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setX(i, uv.getX(i) * rep * bays / 5); }
  }
  const m = new THREE.Mesh(g, mat);
  return m;
}

// ---------------- Placer County Courthouse, Auburn CA (1898) ----------------
export function buildCourthouse(night = false) {
  const G = new THREE.Group();
  const W = 30, D = 24;         // main block footprint
  const baseH = 5.5, upH = 12;  // granite ground floor + two brick storeys

  // textures: rusticated granite with arched openings, tan brick with arched windows + pilasters
  const lit = night ? '#ffd98a' : null;
  const granite = tex('ch-granite' + night, 512, 128, (g, w, h) => {
    g.fillStyle = '#c9c6bf'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,78,72,.45)'; g.lineWidth = 2;
    for (let y = 10; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let r = 0; r < 8; r++) for (let x = (r % 2) * 24; x < w; x += 48) { g.beginPath(); g.moveTo(x, 10 + r * 16); g.lineTo(x, 26 + r * 16); g.stroke(); }
    for (let b = 0; b < 5; b++) { // arched openings
      const cx = (b + 0.5) * (w / 5);
      g.fillStyle = lit || '#2a2c30'; g.beginPath(); g.moveTo(cx - 14, h - 6); g.lineTo(cx - 14, 60); g.arc(cx, 60, 14, Math.PI, 0); g.lineTo(cx + 14, h - 6); g.fill();
      g.strokeStyle = '#e8e6e0'; g.lineWidth = 4; g.beginPath(); g.arc(cx, 60, 17, Math.PI, 0); g.stroke();
    }
  });
  const brick = tex('ch-brick' + night, 512, 256, (g, w, h) => {
    g.fillStyle = '#d9a95f'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(120,70,30,.12)';
    for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 1);
    const bw = w / 5;
    for (let b = 0; b <= 5; b++) { g.fillStyle = '#e6be78'; g.fillRect(b * bw - 7, 0, 14, h); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(b * bw + 7, 0, 3, h); } // pilasters
    g.fillStyle = '#ecd29a'; g.fillRect(0, h * 0.47, w, 10); // string course between the storeys
    for (let b = 0; b < 5; b++) for (const [yTop, hh] of [[26, 76], [h * 0.47 + 28, 70]]) {
      const cx = (b + 0.5) * bw, ww = 30;
      g.fillStyle = '#efdcae'; g.beginPath(); g.moveTo(cx - ww / 2 - 5, yTop + hh + 4); g.lineTo(cx - ww / 2 - 5, yTop + 14); g.arc(cx, yTop + 14, ww / 2 + 5, Math.PI, 0); g.lineTo(cx + ww / 2 + 5, yTop + hh + 4); g.fill();
      g.fillStyle = lit || '#27313d'; g.beginPath(); g.moveTo(cx - ww / 2, yTop + hh); g.lineTo(cx - ww / 2, yTop + 14); g.arc(cx, yTop + 14, ww / 2, Math.PI, 0); g.lineTo(cx + ww / 2, yTop + hh); g.fill();
      g.strokeStyle = '#f4f0e6'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, yTop); g.lineTo(cx, yTop + hh); g.moveTo(cx - ww / 2, yTop + hh * 0.45); g.lineTo(cx + ww / 2, yTop + hh * 0.45); g.stroke();
    }
  });
  const gMat = new THREE.MeshLambertMaterial({ map: granite });
  const bMat = new THREE.MeshLambertMaterial({ map: brick });
  const cream = new THREE.MeshLambertMaterial({ color: 0xefe2c0 });
  const stone = new THREE.MeshLambertMaterial({ color: 0xd8d5ce });
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 });
  const dome = new THREE.MeshPhongMaterial({ color: 0x7c8088, specular: 0x555555, shininess: 40, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2c30 });
  const add = (geo, mat, x, y, z, parent = G) => { const m = geo.isMesh ? geo : new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // ground floor (granite) + upper storeys (brick) + cornices
  add(facadeBox(W, baseH, D, gMat), null, 0, baseH / 2, 0);
  add(new THREE.BoxGeometry(W + 0.6, 0.5, D + 0.6), stone, 0, baseH + 0.25, 0);
  add(facadeBox(W - 1, upH, D - 1, bMat), null, 0, baseH + 0.5 + upH / 2, 0);
  const topY = baseH + 0.5 + upH;
  add(new THREE.BoxGeometry(W + 0.4, 0.9, D + 0.4), cream, 0, topY + 0.45, 0);   // main cornice
  add(new THREE.BoxGeometry(W + 1.2, 0.35, D + 1.2), cream, 0, topY + 1.05, 0);
  // roof + balustrade
  add(new THREE.BoxGeometry(W - 2, 0.8, D - 2), new THREE.MeshLambertMaterial({ color: 0x6c645a }), 0, topY + 1.4, 0);
  for (const [w, d, x, z] of [[W, 0.3, 0, D / 2], [W, 0.3, 0, -D / 2], [0.3, D, W / 2, 0], [0.3, D, -W / 2, 0]]) {
    add(new THREE.BoxGeometry(w, 0.9, d), white, x, topY + 1.7, z);
  }
  // central pavilions: slightly proud of each face, with a pediment on top
  const pediment = (width, depth) => {
    const s = new THREE.Shape(); s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(0, width * 0.26); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g;
  };
  for (const [ax, sgn] of [['z', 1], ['z', -1], ['x', 1], ['x', -1]]) {
    const along = ax === 'z' ? W : D, pw = along * 0.36;
    const box = facadeBox(ax === 'z' ? pw : 1.2, upH + baseH + 0.5, ax === 'z' ? 1.2 : pw, bMat, 2);
    const px = ax === 'x' ? sgn * (W / 2 - 0.1) : 0, pz = ax === 'z' ? sgn * (D / 2 - 0.1) : 0;
    add(box, null, px, (upH + baseH + 0.5) / 2, pz);
    const ped = new THREE.Mesh(pediment(pw + 1.2, 1.8), cream);
    ped.position.set(px, topY + 1.2, pz); if (ax === 'x') ped.rotation.y = Math.PI / 2;
    G.add(ped);
    // statue on the pediment apex
    statue(G, px, topY + 1.2 + (pw + 1.2) * 0.26, pz, white);
  }
  // corner statues on the balustrade
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) statue(G, sx * (W / 2 - 0.6), topY + 2.1, sz * (D / 2 - 0.6), white);

  // drum with a ring of columns, dome, lantern, finial
  const drumY = topY + 1.8;
  add(new THREE.CylinderGeometry(6.2, 6.6, 1.2, 16), stone, 0, drumY + 0.6, 0);
  add(new THREE.CylinderGeometry(4.6, 4.6, 5.2, 16), bMat, 0, drumY + 3.8, 0);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    add(new THREE.CylinderGeometry(0.28, 0.32, 5.2, 8), white, Math.cos(a) * 5.4, drumY + 3.8, Math.sin(a) * 5.4);
  }
  add(new THREE.CylinderGeometry(6.1, 6.1, 0.8, 16), cream, 0, drumY + 6.8, 0);
  add(new THREE.CylinderGeometry(5.2, 5.6, 1.4, 16), cream, 0, drumY + 7.8, 0);
  const dm = add(new THREE.SphereGeometry(5.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dome, 0, drumY + 8.4, 0);
  dm.scale.set(1, 0.95, 1);
  // dome ribs
  for (let k = 0; k < 8; k++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(5.02, 0.09, 4, 12, Math.PI / 2), cream);
    rib.position.set(0, drumY + 8.4, 0); rib.rotation.set(0, (k / 8) * Math.PI * 2, Math.PI / 2); rib.scale.set(0.95, 1, 1); G.add(rib);
  }
  add(new THREE.CylinderGeometry(1.1, 1.2, 2.2, 10), white, 0, drumY + 14.0, 0);            // lantern
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; add(new THREE.BoxGeometry(0.3, 1.2, 0.05), dark, Math.cos(a) * 1.16, drumY + 14.0, Math.sin(a) * 1.16).rotation.y = -a + Math.PI / 2; }
  add(new THREE.SphereGeometry(1.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), dome, 0, drumY + 15.1, 0);
  add(new THREE.CylinderGeometry(0.06, 0.12, 1.4, 6), white, 0, drumY + 16.8, 0);

  // columned porch on the left (-x) side
  const porchH = baseH + 0.2;
  add(new THREE.BoxGeometry(5, 0.6, D * 0.55), stone, -W / 2 - 2.5, porchH, -D * 0.12);
  add(new THREE.BoxGeometry(5.4, 0.5, D * 0.6), cream, -W / 2 - 2.5, porchH + 5.0, -D * 0.12);
  for (let k = 0; k < 4; k++) add(new THREE.CylinderGeometry(0.3, 0.34, 4.4, 10), white, -W / 2 - 4.5, porchH + 2.5, -D * 0.12 - D * 0.24 + k * D * 0.16);
  add(new THREE.BoxGeometry(5, baseH, D * 0.55), gMat, -W / 2 - 2.5, baseH / 2, -D * 0.12);

  // two-storey portico with a balcony on the front right
  const pxc = W * 0.22;
  add(new THREE.BoxGeometry(11, 0.6, 4.2), stone, pxc, porchH, D / 2 + 2.1);
  add(new THREE.BoxGeometry(11.4, 0.6, 4.6), cream, pxc, porchH + 5.2, D / 2 + 2.2);        // balcony floor
  for (let k = 0; k < 11; k++) add(new THREE.BoxGeometry(0.08, 1, 0.08), dark, pxc - 5.4 + k * 1.08, porchH + 6.0, D / 2 + 4.35); // railing posts
  add(new THREE.BoxGeometry(11.4, 0.1, 0.1), dark, pxc, porchH + 6.5, D / 2 + 4.35);
  for (let k = 0; k < 5; k++) add(new THREE.CylinderGeometry(0.32, 0.36, 4.8, 10), white, pxc - 4.6 + k * 2.3, porchH + 2.7, D / 2 + 3.8);
  add(new THREE.BoxGeometry(11, baseH, 4.2), gMat, pxc, baseH / 2, D / 2 + 2.1);

  // grand granite staircase running down the right (+x) side
  const steps = 16, run = 14, rise = porchH / steps;
  // steps rise from the street (+x) up to the portico
  const stair = new THREE.Group();
  for (let k = 0; k < steps; k++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(run / steps, rise * (k + 1), 3.6), stone);
    g.position.set(W / 2 + run - (k + 0.5) * (run / steps), rise * (k + 1) / 2, D / 2 + 2.2); stair.add(g);
  }
  for (const zz of [D / 2 + 0.3, D / 2 + 4.1]) { // stair side walls
    const w = new THREE.Mesh(new THREE.BoxGeometry(run, 0.5, 0.4), stone);
    w.position.set(W / 2 + run / 2, porchH * 0.5 + 0.2, zz); w.rotation.z = Math.atan2(porchH, run); stair.add(w);
  }
  G.add(stair);
  // a lamp post at the foot of the stairs
  add(new THREE.CylinderGeometry(0.1, 0.14, 4.2, 6), dark, W / 2 + run + 1.5, 2.1, D / 2 + 2.2);
  add(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: night ? 0xfff0c0 : 0xf4f4f0 }), W / 2 + run + 1.5, 4.4, D / 2 + 2.2);

  G.traverse(o => { if (o.isMesh) { o.castShadow = false; o.matrixAutoUpdate = false; o.updateMatrix(); } });
  return G;
}

function statue(parent, x, y, z, mat) {
  const s = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.5, 8), mat); body.position.y = 0.9; s.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat); head.position.y = 1.85; s.add(head);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), mat); base.position.y = 0.15; s.add(base);
  s.position.set(x, y, z);
  parent.add(s);
  s.traverse(o => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
}

// ---------------- branded businesses (props + zone lots) ----------------
// Front faces +z, origin at ground in the middle of the lot. Materials are cached per business type and
// each model is merged by material, so a street full of them stays cheap to draw.
const bizMats = {};
const lambert = (key, opts) => bizMats[key] || (bizMats[key] = new THREE.MeshLambertMaterial(opts));
const basic = (key, opts) => bizMats[key] || (bizMats[key] = new THREE.MeshBasicMaterial(opts));
function signTex(text, bg, fg, w = 512, h = 128, font = 'Anton, Impact, sans-serif') {
  return tex('sign-' + text + bg + fg + w, w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = h * 0.06; g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = h * 0.62; g.font = `${fs}px ${font}`;
    while (g.measureText(text).width > w * 0.88 && fs > 8) { fs -= 2; g.font = `${fs}px ${font}`; }
    g.fillText(text, w / 2, h * 0.54);
  });
}
function shopfrontTex(key, wall, frame, night, opts = {}) {
  return tex('front-' + key + night, 512, 256, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    const glass = (x, y, ww, hh) => {
      const gr = g.createLinearGradient(x, y, x + ww, y + hh);
      if (night) { gr.addColorStop(0, '#fff1c8'); gr.addColorStop(1, '#ffd88a'); } else { gr.addColorStop(0, '#9fc4dc'); gr.addColorStop(0.5, '#4f6f88'); gr.addColorStop(1, '#8fb4cc'); }
      g.fillStyle = gr; g.fillRect(x, y, ww, hh);
      g.strokeStyle = frame; g.lineWidth = 8; g.strokeRect(x, y, ww, hh);
    };
    const n = opts.panes || 3, top = h * 0.3, bot = h * 0.95, door = opts.door ?? Math.floor(n / 2);
    const pw = (w * 0.9) / n;
    for (let k = 0; k < n; k++) {
      const x = w * 0.05 + k * pw;
      if (k === door) { glass(x + pw * 0.2, top + 10, pw * 0.6, bot - top - 10); g.fillStyle = frame; g.fillRect(x + pw * 0.48, top + 10, 4, bot - top - 10); }
      else glass(x + 6, top, pw - 12, (bot - top) * 0.78);
    }
    if (opts.bays) { // roll-up garage doors
      for (let k = 0; k < opts.bays; k++) {
        const x = w * 0.08 + k * (w * 0.84 / opts.bays), ww = w * 0.84 / opts.bays - 20;
        g.fillStyle = '#b8bcc2'; g.fillRect(x, h * 0.28, ww, h * 0.67);
        g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = h * 0.3; y < h * 0.95; y += 10) g.fillRect(x, y, ww, 2);
        if (night) { g.fillStyle = 'rgba(255,230,160,.35)'; g.fillRect(x, h * 0.8, ww, h * 0.15); }
      }
    }
  });
}
function stripeTex(a, b) { return tex('stripe' + a + b, 64, 16, (g) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? a : b; g.fillRect(k * 8, 0, 8, 16); } }); }

// merge a group's meshes that share a material into one mesh each
function mergeByMaterial(G) {
  G.updateMatrixWorld(true);
  const byMat = new Map();
  G.traverse(o => { if (o.isMesh) { if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(o); } });
  const out = new THREE.Group();
  for (const [mat, list] of byMat) {
    const P = [], N = [], U = [];
    for (const o of list) {
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      if (!g.attributes.normal) g.computeVertexNormals();
      P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array);
      if (g.attributes.uv) U.push(...g.attributes.uv.array); else for (let i = 0; i < g.attributes.position.count; i++) U.push(0, 0);
      g.dispose();
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    m.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    m.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    out.add(new THREE.Mesh(m, mat));
  }
  return out;
}

export function buildBusiness(type, night = false, seed = 1) {
  const G = new THREE.Group();
  const B = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); G.add(m); return m; };
  const C = (rt, rb, h, mat, x, y, z, seg = 8) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); G.add(m); return m; };
  const Pl = (w, h, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; G.add(m); return m; };
  const sign = (text, bg, fg) => night ? basic('sb' + text + night, { map: signTex(text, bg, fg), fog: true }) : lambert('sl' + text, { map: signTex(text, bg, fg) });
  const grey = lambert('grey', { color: 0x6c7078 }), dark = lambert('dark', { color: 0x2a2c30 }), concrete = lambert('conc', { color: 0xb8b6ae });
  const white = lambert('white', { color: 0xeeeeea }), roof = lambert('roof', { color: 0x55504a });
  const lamp = night ? basic('lampon', { color: 0xfff2d0 }) : lambert('lampoff', { color: 0xdedcd4 });
  // building shell with a shop front, a parapet and a fascia sign
  const shell = (w, d, h, wallHex, frameHex, key, opts = {}) => {
    const wall = lambert('w' + key, { color: wallHex });
    B(w, h, d, wall, 0, h / 2, 0);
    B(w + 0.3, 0.6, d + 0.3, lambert('p' + key, { color: opts.parapet ?? wallHex }), 0, h + 0.3, 0);
    B(w - 0.6, 0.1, d - 0.6, roof, 0, h + 0.05, 0);
    const front = night ? basic('fn' + key, { map: shopfrontTex(key, '#' + wallHex.toString(16).padStart(6, '0'), frameHex, true, opts) })
      : lambert('fd' + key, { map: shopfrontTex(key, '#' + wallHex.toString(16).padStart(6, '0'), frameHex, false, opts) });
    Pl(w - 0.2, h, front, 0, h / 2, d / 2 + 0.02);
    B(w * 0.2, 0.9, 0.9, grey, -w * 0.3, h + 0.9, -d * 0.2); // rooftop AC unit
    return wall;
  };
  const def = { coffee: 0, burger: 0, pizza: 0, gas: 0, mart: 0, tyres: 0 };
  if (!(type in def)) type = 'mart';

  if (type === 'coffee') {
    const w = 11, d = 9, h = 4.4;
    shell(w, d, h, 0x6e4a32, '#2a1a10', 'coffee', { panes: 3, parapet: 0xefe0c8 });
    B(w - 1, 1.1, 0.25, sign('BEAN MACHINE', '#1e3a2a', '#f4e6c8'), 0, h - 0.5, d / 2 + 0.15);
    // striped awning
    const aw = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.12, 2.2), lambert('awc', { map: stripeTex('#2a6e44', '#f0ead8') }));
    aw.position.set(0, h * 0.62, d / 2 + 1.0); aw.rotation.x = 0.28; G.add(aw);
    // outdoor tables + umbrellas
    for (const x of [-3.6, 0, 3.6]) {
      C(0.5, 0.5, 0.05, white, x, 0.75, d / 2 + 2.8, 10); C(0.04, 0.04, 0.75, dark, x, 0.37, d / 2 + 2.8);
      for (const sx of [-0.7, 0.7]) B(0.4, 0.45, 0.4, dark, x + sx, 0.23, d / 2 + 2.8);
    }
  } else if (type === 'burger') {
    const w = 13, d = 11, h = 4.8;
    shell(w, d, h, 0xc8141c, '#5a0808', 'burger', { panes: 4, door: 1, parapet: 0xf4c01a });
    B(w * 0.8, 1.3, 0.3, sign('BURGER DUCK', '#f4c01a', '#b31313'), 0, h + 0.2, d / 2 + 0.1);
    // drive-thru lane marker + menu board
    B(0.3, 1.6, 1.4, sign('MENU', '#222', '#f4c01a'), w / 2 + 1.2, 0.8, -1);
    // tall pole sign
    C(0.18, 0.24, 11, grey, w / 2 + 2.2, 5.5, d / 2 + 1.5);
    const ps = B(4.2, 2.2, 0.4, sign('BURGER DUCK', '#b31313', '#f4c01a'), w / 2 + 2.2, 11.5, d / 2 + 1.5);
    ps.rotation.y = 0.2;
  } else if (type === 'pizza') {
    const w = 10, d = 10, h = 5.2;
    shell(w, d, h, 0x9a4a32, '#3a1a10', 'pizza', { panes: 2, door: 1, parapet: 0x6a3020 });
    B(w - 1.2, 1.0, 0.25, sign("TONY'S PIZZA", '#1c5a2a', '#fff4e0'), 0, h - 0.5, d / 2 + 0.15);
    const aw = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, 0.12, 1.8), lambert('awp', { map: stripeTex('#c8141c', '#f4f0e8') }));
    aw.position.set(0, h * 0.6, d / 2 + 0.85); aw.rotation.x = 0.3; G.add(aw);
    B(1.1, 2.6, 1.1, lambert('brick', { color: 0x7a3a28 }), w * 0.3, h + 1.3, -d * 0.25); // pizza-oven chimney
  } else if (type === 'gas') {
    const w = 10, d = 7, h = 4;
    // kiosk at the back of the lot
    const kz = -6;
    const wall = lambert('wgas', { color: 0xe8ecf0 });
    B(w, h, d, wall, 0, h / 2, kz);
    B(w + 0.3, 0.8, d + 0.3, lambert('pgas', { color: 0x1d6fd8 }), 0, h + 0.4, kz);
    Pl(w - 0.2, h, night ? basic('fngas', { map: shopfrontTex('gas', '#e8ecf0', '#1d6fd8', true) }) : lambert('fdgas', { map: shopfrontTex('gas', '#e8ecf0', '#1d6fd8', false) }), 0, h / 2, kz + d / 2 + 0.02);
    B(w - 1, 0.9, 0.2, sign('VOLTA FUEL', '#1d6fd8', '#ffffff'), 0, h - 0.5, kz + d / 2 + 0.12);
    // canopy over the pumps
    const cz = 4;
    B(16, 0.9, 9, white, 0, 5.4, cz);
    B(16.2, 0.5, 9.2, lambert('pgas', { color: 0x1d6fd8 }), 0, 5.0, cz);
    B(15.6, 0.05, 8.6, lamp, 0, 4.72, cz); // lit underside
    for (const x of [-5, 5]) for (const z of [cz - 2.5, cz + 2.5]) C(0.25, 0.25, 4.8, white, x, 2.4, z);
    for (const x of [-5, 5]) for (const z of [cz - 2.5, cz + 2.5]) { B(0.8, 1.6, 0.5, lambert('pump', { color: 0xd8dce2 }), x + (x > 0 ? -1.2 : 1.2), 0.8, z); B(0.82, 0.4, 0.52, lambert('pgas', { color: 0x1d6fd8 }), x + (x > 0 ? -1.2 : 1.2), 1.45, z); }
    B(16, 0.1, 9, concrete, 0, 0.05, cz);
    // price sign
    C(0.2, 0.25, 7, grey, 11, 3.5, 8.5);
    B(2.6, 3.2, 0.4, sign('VOLTA', '#1d6fd8', '#fff'), 11, 7.6, 8.5);
    B(2.6, 1.6, 0.42, sign('3.99', '#111', '#ffd21a', 256, 128, 'VT323, monospace'), 11, 5.3, 8.5);
  } else if (type === 'mart') {
    const w = 15, d = 11, h = 4.6;
    shell(w, d, h, 0xf2f2ee, '#1a4fb0', 'mart', { panes: 5, door: 2, parapet: 0x2aa0a0 });
    B(w * 0.85, 1.1, 0.3, sign('24/7 QUICK MART', '#2aa0a0', '#ffffff'), 0, h + 0.1, d / 2 + 0.12);
    B(2.2, 1.2, 0.9, lambert('ice', { color: 0xdfeefa }), -w / 2 + 1.6, 0.6, d / 2 + 0.7); // ice box
    B(2.1, 0.3, 0.3, sign('ICE', '#3a8af0', '#fff', 256, 128), -w / 2 + 1.6, 0.95, d / 2 + 1.16);
  } else if (type === 'tyres') {
    const w = 18, d = 13, h = 6.2;
    shell(w, d, h, 0x8a8e96, '#2a2c30', 'tyres', { panes: 1, bays: 3, parapet: 0xe8e8e8 });
    B(w * 0.7, 1.3, 0.3, sign('RAPID TYRES', '#ffffff', '#1a4fb0'), 0, h + 0.3, d / 2 + 0.12);
    // tyre stacks
    const tyre = lambert('tyre', { color: 0x1a1a1c });
    for (const [x, z, n] of [[-w / 2 - 1.2, d / 2 - 1, 5], [-w / 2 - 1.2, d / 2 - 2.6, 3], [w / 2 + 1.2, d / 2 - 1.5, 4]]) for (let k = 0; k < n; k++) C(0.62, 0.62, 0.28, tyre, x, 0.14 + k * 0.29, z, 12);
  }
  // forecourt / pavement slab
  const bd = BIZ_LOT[type];
  B(bd[0], 0.12, bd[1], concrete, 0, 0.06, 0).position.z = type === 'gas' ? 0 : 0.6;
  const merged = mergeByMaterial(G);
  merged.userData.biz = type;
  return merged;
}
const BIZ_LOT = { coffee: [12, 11], burger: [15, 14], pizza: [11, 12], gas: [24, 20], mart: [16, 13], tyres: [19, 15] };
