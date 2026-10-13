// Vector shapes for the Livery Designer, Figma-style. You draw right on the car on the turntable (nodes and handles
// sit on the bodywork and the paint updates as you drag), or on a flat, square-on picture of it from one panel's side
// (the left flank, the top, the nose...), rendered from the real car. Shapes are Bézier paths: the pen (click for corners, drag for curves, click the first node to close), rectangles
// and ellipses; move, scale and turn whole shapes, or edit their nodes and handles. Shapes are ordinary decals
// ({ path, fill, stroke, sw }: livery.js), so they're in the decal list and mirror, save, export and go online like
// the rest. Each shape still belongs to one panel and is projected from its side (that's what wraps it over the
// curves and mirrors it), so on the 3D car a click lands where that side's projector meets the surface you hit. In
// the flat view the car is painted without the shapes on this panel (they're drawn live on top, clipped to the car's
// outline, and faintly where they hang off it).
import * as THREE from 'three';
import { shapePath, shapeBounds, panelArt, drawDecal, drapeSticker, stickerPoint, stickerCoords, stickerRay, rayMesh, STICK_MARGIN } from './livery.js';

const NODE = 4, HIT = 7, KAPPA = 0.5523, ROT_OUT = 18; // node square half-size, hit radius, rotate zone past a corner (px)
const RED = '#ff2b00', AMBER = '#ffc21a', PAPER = '#fff1e8';
export const HINTS = {
  move: '<b>Click</b> a shape to pick it and drag to move it. Drag a corner to scale (Shift keeps its proportions), just outside one to turn it. <b>Double-click</b> or Enter to edit its nodes. Alt-drag copies it.',
  node: '<b>Drag</b> nodes and handles. <b>Click a line</b> to add a node, <b>double-click</b> a node for corner or curve, Alt-drag a handle to break it. Delete removes nodes, Esc when you\'re done.',
  pen: '<b>Click</b> for a corner, <b>click and drag</b> for a curve. Click the first node to close the shape, or Enter to leave it open as a line. Shift keeps to 45°.',
  rect: '<b>Drag</b> to draw a rectangle. Shift for a square, Alt to draw from the center.',
  ellipse: '<b>Drag</b> to draw an ellipse. Shift for a circle, Alt to draw from the center.',
};
const isShape = (d) => !!(d && d.path);
const hex = (c) => '#' + ((c ?? 0) >>> 0).toString(16).padStart(6, '0').slice(-6);
const rid = () => 'd' + Math.random().toString(36).slice(2, 8);

// a shape's drawing transform (as drawDecal: translate, rotate, flip, scale): x' = a x + c y + e, y' = b x + d y + f
function frame(d) {
  const k = (d.size || d.path.w || 1) / (d.path.w || 1), t = ((d.rot || 0) * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t), f = d.flip ? -1 : 1;
  return { k, a: k * cs * f, b: k * sn * f, c: -k * sn, d: k * cs, e: d.x, f: d.y };
}
const apply = (M, x, y) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f];
const applyV = (M, x, y) => [M.a * x + M.c * y, M.b * x + M.d * y];
function invert(M, X, Y) { const det = M.a * M.d - M.b * M.c || 1e-9, x = X - M.e, y = Y - M.f; return [(M.d * x - M.c * y) / det, (-M.b * x + M.a * y) / det]; }
// fold rotation, flip and scale into the nodes (then node positions are simply d.x + x, d.y + y), and re-center the
// decal on its shape so it turns, scales and mirrors about the middle. keep: leave the centre where it is (on the 3D
// car the centre is where the sticker is pinned: moving it would re-lay the sticker and nudge the shape on curves)
function normalize(d, keep = false) {
  const M = frame(d), P = d.path;
  if (d.rot || d.flip || Math.abs(M.k - 1) > 1e-9) {
    for (const n of P.n) { [n[0], n[1]] = applyV(M, n[0], n[1]); [n[2], n[3]] = applyV(M, n[2], n[3]); [n[4], n[5]] = applyV(M, n[4], n[5]); }
    d.rot = 0; d.flip = false;
  }
  const b = shapeBounds(P), cx = keep ? 0 : (b[0] + b[2]) / 2, cy = keep ? 0 : (b[1] + b[3]) / 2;
  for (const n of P.n) { n[0] -= cx; n[1] -= cy; }
  d.x += cx; d.y += cy;
  P.w = d.size = Math.max(0.002, b[2] - b[0]);
}
// a point on a node's segment to the next (de Casteljau), and the split there
function bez(a, b, t) {
  const u = 1 - t, p0 = [a[0], a[1]], p1 = [a[0] + a[4], a[1] + a[5]], p2 = [b[0] + b[2], b[1] + b[3]], p3 = [b[0], b[1]];
  const L = (p, q, s = t) => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
  const q0 = L(p0, p1), q1 = L(p1, p2), q2 = L(p2, p3), r0 = L(q0, q1), r1 = L(q1, q2), s = L(r0, r1);
  return { s, q0, r0, r1, q2, u };
}

export class VectorEditor {
  // ld: the LiveryDesigner (car, def, garage, sel, render(), toast(), save())
  constructor(ld) {
    this.ld = ld; this.open = false; this.tool = 'move';
    this.cv = document.getElementById('lv-vcan'); this.g = this.cv.getContext('2d');
    this.layer = document.createElement('canvas'); this.lg = this.layer.getContext('2d');
    this.scratch = document.createElement('canvas').getContext('2d');
    this.z = 200; this.ox = 0; this.oy = 0; this.snap = null; this.drag = null; this.hover = null; this.nsel = new Set();
    this.undo = []; this.redo = []; this.guides = [];
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => this.down(e));
    cv.addEventListener('pointermove', (e) => this.move(e));
    cv.addEventListener('pointerup', (e) => this.up(e));
    cv.addEventListener('pointercancel', (e) => this.up(e));
    cv.addEventListener('dblclick', (e) => this.dbl(e));
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.flat) { const G = this.ld.garage; G.dist = Math.max(1.2, Math.min(18, G.dist * Math.pow(1.001, e.deltaY))); return; }
      const [sx, sy] = this.pt(e); this.zoomAt(sx, sy, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
    document.querySelectorAll('#lv-vtools button').forEach(b => b.addEventListener('click', () => this.setTool(b.dataset.t)));
    document.getElementById('lv-vpanel').addEventListener('change', (e) => this.setPanel(e.target.value));
    document.getElementById('lv-vfit').addEventListener('click', () => { this.fit(); this.snapSoon(); });
    document.getElementById('lv-vundo').addEventListener('click', () => this.doUndo());
    document.getElementById('lv-vredo').addEventListener('click', () => this.doRedo());
    document.getElementById('lv-vmode').addEventListener('click', () => this.setFlat(!this.flat));
    document.getElementById('lv-vexit').addEventListener('click', () => this.close());
    this.ray = new THREE.Raycaster(); this.surfs = new Map();
    window.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.space = false; this.cursor(); } });
    window.addEventListener('resize', () => { if (this.open) { this.resize(); this.snapSoon(); } });
  }
  get car() { return this.ld.car; }
  norm(d) { normalize(d, !this.flat); }
  get def() { return this.ld.def; }
  get p() { return this.def.panels[this.panel]; }
  get cur() { const d = this.car.decals[this.ld.sel]; return isShape(d) && d.panel === this.panel ? d : null; }
  shapes() { const out = []; this.car.decals.forEach((d, i) => { if (isShape(d) && d.panel === this.panel) out.push(i); }); return out; }

  // ---------- open / close ----------
  // (the 3D car needs a model whose panels project onto it: the classic atlas car only has the flat view)
  get can3d() { return !!(this.def.texels && this.ld.garage.car && this.ld.garage.car.body && Object.values(this.def.panels).some(p => p.proj)); }
  start(panel, tool) {
    const P = this.def.panels, G = this.ld.garage;
    panel = P[panel] ? panel : P.sideL ? 'sideL' : P[this.def.startPanel] ? this.def.startPanel : Object.keys(P)[0];
    this.open = true; this.undo = []; this.redo = []; this.nsel.clear(); this.drawing = null; this.painted = null;
    this.flat = !this.can3d;
    document.getElementById('s-livery').classList.add('vec-on');
    document.getElementById('s-livery').classList.toggle('vec-flat', this.flat);
    document.getElementById('lv-vmode').style.display = this.can3d ? '' : 'none';
    const sel = document.getElementById('lv-vpanel');
    sel.innerHTML = Object.entries(P).map(([k, v]) => `<option value="${k}">${v.label || k}</option>`).join('');
    G.auto = false; G.afterRender = () => { if (this.open && !this.flat) this.draw(); };
    this.resize();
    this.setPanel(panel, true);
    this.setTool(tool || (this.cur ? 'move' : 'pen'));
  }
  close() {
    if (!this.open) return;
    this.finishPen();
    this.open = false; this.drag = null; this.ld.garage.afterRender = null;
    const el = document.getElementById('s-livery'); el.classList.remove('vec-on', 'vec-flat');
    if (this.flat) {
      const views = { sideL: 'left', podL: 'left', coverL: 'left', plateL: 'left', sideR: 'right', podR: 'right', coverR: 'right', plateR: 'right', top: 'top', front: 'front', rear: 'rear', fwing: 'top', rwing: 'rear' };
      this.ld.garage.view(views[this.panel] || 'three');
    }
    this.ld.repaint(); this.ld.render();
  }
  // the flat view (one panel, square-on) or the car itself
  setFlat(on) {
    if (on && !this.can3d && !this.flat) return;
    if (!on && !this.can3d) return;
    this.finishPen(); this.drag = null; this.nsel.clear();
    this.flat = on; this.painted = null;
    document.getElementById('s-livery').classList.toggle('vec-flat', on);
    if (on && !this.cur) this.panel = this.ld.garageSide() || this.panel;
    this.resize();
    if (on) this.setPanel(this.panel, true);
    else this.draw();
    this.setTool(this.tool); this.ld.render();
  }
  setPanel(name, first) {
    if (!this.def.panels[name]) return;
    this.finishPen();
    if (!this.flat) { // (on the car: the panel just follows the selected shape)
      this.panel = name; this.nsel.clear();
      for (const i of this.shapes()) this.norm(this.car.decals[i]);
      this.ld.render(); this.draw(); return;
    }
    if (!first && this.panel === name) return;
    this.panel = name; this.nsel.clear();
    document.getElementById('lv-vpanel').value = name;
    for (const i of this.shapes()) this.norm(this.car.decals[i]);
    if (!this.cur) { const s = this.shapes(); this.ld.sel = s.length ? s[s.length - 1] : -1; }
    this.fit(); this.backdrop(); this.ld.render();
  }
  setTool(t) {
    if (t !== 'pen') this.finishPen();
    if (t === 'node' && !this.cur) t = 'move';
    this.tool = t; this.nsel.clear();
    document.querySelectorAll('#lv-vtools button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    document.getElementById('lv-vmode').textContent = this.flat ? '3D View' : 'Flat View';
    const h = document.getElementById('lv-hint'); if (h) h.innerHTML = HINTS[t] + (this.flat ? '' : ' <b>Drag off your shapes</b> (or right-drag) to spin the car, scroll to zoom.');
    this.cursor(); this.draw();
  }
  cursor() { this.cv.style.cursor = this.space || this.drag?.kind === 'pan' || this.drag?.kind === 'orbit' ? 'grab' : /pen|rect|ellipse/.test(this.tool) ? 'crosshair' : 'default'; }

  // ---------- view ----------
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = Math.max(1, r.width); this.ch = Math.max(1, r.height); this.dpr = dpr;
    this.cv.width = this.layer.width = Math.round(this.cw * dpr); this.cv.height = this.layer.height = Math.round(this.ch * dpr);
    this.draw();
  }
  fit() {
    const p = this.p, padX = 70, padY = 60;
    this.z = Math.max(20, Math.min((this.cw - padX * 2) / p.W, (this.ch - padY * 2) / p.H));
    this.ox = (this.cw - p.W * this.z) / 2; this.oy = (this.ch - p.H * this.z) / 2;
    this.draw();
  }
  zoomAt(sx, sy, f) {
    const z = Math.max(15, Math.min(6000, this.z * f)), k = z / this.z;
    this.ox = sx - (sx - this.ox) * k; this.oy = sy - (sy - this.oy) * k; this.z = z;
    this.draw(); this.snapSoon();
  }
  pt(e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  toP(sx, sy) { return this.flat ? [(sx - this.ox) / this.z, (sy - this.oy) / this.z] : this.toP3(sx, sy); }
  // (where the pointer is in the panel's projection, whatever's selected: moving a whole shape, starting a new one)
  toPproj(sx, sy) { return this.flat ? this.toP(sx, sy) : this.toPview(sx, sy); }
  toS(x, y, name = this.panel, d = this.cur) { return this.flat ? [this.ox + x * this.z, this.oy + y * this.z] : this.toS3m(x, y, name, d); }

  // ---------- on the 3D car ----------
  // a panel's projector: panel metres (u, v) = o + (gu . X, gv . X) for a point X on the car (body coordinates)
  axes(name) {
    const p = this.def.panels[name], o = p.proj(0, 0, 0), X = p.proj(1, 0, 0), Y = p.proj(0, 1, 0), Z = p.proj(0, 0, 1);
    return { o, gu: [X[0] - o[0], Y[0] - o[0], Z[0] - o[0]], gv: [X[1] - o[1], Y[1] - o[1], Z[1] - o[1]], dir: p.dir };
  }
  // the outer surface as that panel's projector sees it: a 2 cm grid of how far out the body is along its
  // direction (from where each painted texel sits), gaps and the space round the car filled from the nearest
  surf(name) {
    if (this.surfDef !== this.def) { this.surfs = new Map(); this.surfDef = this.def; }
    if (this.surfs.has(name)) return this.surfs.get(name);
    const p = this.def.panels[name], T = this.def.texels && this.def.texels();
    let S = null;
    if (T && p.proj) {
      const C = 0.02, M = 1.2, nx = Math.ceil((p.W + 2 * M) / C), ny = Math.ceil((p.H + 2 * M) / C), D = new Float32Array(nx * ny).fill(-Infinity), [dx, dy, dz] = p.dir, pos = T.pos;
      for (let k = 0; k < pos.length; k += 3) {
        const x = pos[k], y = pos[k + 1], z = pos[k + 2], [u, v] = p.proj(x, y, z), i = Math.floor((u + M) / C), j = Math.floor((v + M) / C);
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
        const dd = x * dx + y * dy + z * dz, q = j * nx + i; if (dd > D[q]) D[q] = dd;
      }
      for (let pass = 0, empty = true; empty && pass < 400; pass++) {
        empty = false; const src = D.slice();
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const q = j * nx + i; if (src[q] !== -Infinity) continue;
          let b = -Infinity; if (i > 0 && src[q - 1] > b) b = src[q - 1]; if (i < nx - 1 && src[q + 1] > b) b = src[q + 1]; if (j > 0 && src[q - nx] > b) b = src[q - nx]; if (j < ny - 1 && src[q + nx] > b) b = src[q + nx];
          if (b > -Infinity) D[q] = b; else empty = true;
        }
      }
      S = { C, M, nx, ny, D, A: this.axes(name) };
    }
    this.surfs.set(name, S);
    return S;
  }
  depthAt(S, u, v) { const i = Math.max(0, Math.min(S.nx - 1, Math.floor((u + S.M) / S.C))), j = Math.max(0, Math.min(S.ny - 1, Math.floor((v + S.M) / S.C))); return S.D[j * S.nx + i]; }
  // panel metres -> the point on the car (body coordinates)
  local(name, u, v) {
    const S = this.surf(name); if (!S) return null;
    const { o, gu, gv, dir } = S.A, a = u - o[0], b = v - o[1], d = this.depthAt(S, u, v);
    return new THREE.Vector3(gu[0] * a + gv[0] * b + dir[0] * d, gu[1] * a + gv[1] * b + dir[1] * d, gu[2] * a + gv[2] * b + dir[2] * d);
  }
  // world -> editor canvas px (NaN behind the camera)
  w2s(v) {
    const p = v.clone().project(this.ld.garage.camera), rr = this.rr, cr = this.cr;
    if (p.z > 1) return [NaN, NaN];
    return [rr.left + (p.x + 1) / 2 * rr.width - cr.left, rr.top + (1 - p.y) / 2 * rr.height - cr.top];
  }
  toS3(x, y, name) { const L = this.local(name, x, y); return L ? this.w2s(this.ld.garage.car.body.localToWorld(L)) : [NaN, NaN]; }
  // whether a panel's side faces the camera (shapes round the back aren't drawn or picked)
  faces(name) {
    const G = this.ld.garage, body = G.car.body, p = this.def.panels[name]; if (!p || !p.dir) return false;
    const c = body.getWorldPosition(new THREE.Vector3()), d = new THREE.Vector3(...p.dir).transformDirection(body.matrixWorld);
    return d.dot(G.camera.position.clone().sub(c).normalize()) > 0.08;
  }
  // which side shows a panel's shapes right now: its own, or (for a mirrored shape seen from the other side) its pair
  view(name) {
    if (this.faces(name)) return { name, m: false };
    const P = this.def.panels, p = P[name], d = this.cur;
    if (p && p.pair && P[p.pair] && d && d.mirror && d.panel === name && this.faces(p.pair)) return { name: p.pair, m: true };
    return null;
  }
  // a shape's own sticker (as it's painted: draped over the body from its centre; mirror: its copy on the other side),
  // kept until it moves or grows
  // (reach: work it out at least that far from its centre, for a click beyond the shape so far)
  stick(d, mirror = false, reach = 0) {
    const P = this.def.panels, p = P[d.panel]; if (!this.def.mesh || !p || !p.proj) return null;
    let name = d.panel, cx = d.x, cy = d.y;
    if (mirror) { const Q = P[p.pair]; if (!Q) return null; name = p.pair; cx = (1 - d.x / p.W) * Q.W; cy = d.y / p.H * Q.H; }
    const b = shapeBounds(d.path), k = frame(d).k, rx = Math.ceil((Math.max(-b[0], b[2], reach) * k + 0.05) * 10) / 10, ry = Math.ceil((Math.max(-b[1], b[3], reach) * k + 0.05) * 10) / 10;
    const key = [name, cx.toFixed(4), cy.toFixed(4), rx, ry, this.def.id].join('|');
    if (!this.stk || this.stk.size > 60) this.stk = new Map();
    if (!this.stk.has(key)) this.stk.set(key, drapeSticker(this.def.mesh(), P[name], cx, cy, rx, ry, STICK_MARGIN));
    return this.stk.get(key);
  }
  // the surface under the pointer: { p: body point, depth along the panel's view } or null
  surfaceAt(sx, sy, name = this.panel) {
    const h = this.meshHit(sx, sy); if (!h) return null;
    const tp = this.def.mesh().tp, q = h.tri * 9, b0 = 1 - h.b1 - h.b2, p = [0, 1, 2].map(i => tp[q + i] * b0 + tp[q + 3 + i] * h.b1 + tp[q + 6 + i] * h.b2), dir = this.def.panels[name].dir;
    return { p, depth: p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2] };
  }
  // the pointer on the car's own triangles (body coordinates): { tri, b1, b2 } or null
  meshHit(sx, sy) {
    if (!this.def.mesh) return null;
    this.aim(sx, sy);
    const inv = this.ld.garage.car.body.matrixWorld.clone().invert(), o = this.ray.ray.origin.clone().applyMatrix4(inv), r = this.ray.ray.direction.clone().transformDirection(inv);
    return rayMesh(this.def.mesh(), [o.x, o.y, o.z], [r.x, r.y, r.z], true);
  }
  toS3m(x, y, name, d = this.cur) {
    const v = this.view(name); if (!v) return [NaN, NaN];
    if (d && isShape(d) && d.panel === name) { // (on its sticker, so the nodes sit exactly on the paint)
      const S = this.stick(d, v.m), q = S && stickerPoint(S, v.m ? -(x - d.x) : x - d.x, y - d.y);
      if (q) return this.w2s(this.ld.garage.car.body.localToWorld(new THREE.Vector3(q[0], q[1], q[2])));
    }
    if (!v.m) return this.toS3(x, y, name);
    const P = this.def.panels[name], Q = this.def.panels[v.name];
    return this.toS3((1 - x / P.W) * Q.W, y / P.H * Q.H, v.name);
  }
  toP3(sx, sy) {
    const d = this.cur;
    if (d) { // (the pointer on the selected shape's sticker, in its own metres)
      const v = this.view(this.panel), m = !!(v && v.m);
      let S = this.stick(d, m);
      if (S) {
        // (a surface edge-on to the shape's side, the flank under a bonnet shape say, gives no good spot on it: there,
        // where the pointer's ray meets the sheet the shape is draped on)
        let h = this.meshHit(sx, sy); if (h && !this.facesSide(h.tri, m ? this.def.panels[this.panel].pair : this.panel)) h = null;
        let c = h && stickerCoords(S, h.tri, h.b1, h.b2);
        // (beyond the shape so far: lay the sticker out further first, so the spot is exact, not guessed)
        if (h && !c) { const [pu, pv] = this.toPview(sx, sy); S = this.stick(d, m, Math.hypot(pu - d.x, pv - d.y) + 0.1); c = S && stickerCoords(S, h.tri, h.b1, h.b2); if (!c) S = this.stick(d, m); }
        if (!c) { const [pu, pv] = this.toPview(sx, sy), far = Math.hypot(pu - d.x, pv - d.y) + 0.1; if (isFinite(far)) S = this.stick(d, m, far) || S; this.aim(sx, sy); }
        if (!c) { const inv = this.ld.garage.car.body.matrixWorld.clone().invert(), o = this.ray.ray.origin.clone().applyMatrix4(inv), r = this.ray.ray.direction.clone().transformDirection(inv); c = stickerRay(S, [o.x, o.y, o.z], [r.x, r.y, r.z]); }
        if (c) return [d.x + (m ? -c[0] : c[0]), d.y + c[1]];
      }
    }
    return this.toPview(sx, sy);
  }
  facesSide(tri, name) {
    const M = this.def.mesh(), p = this.def.panels[name]; if (!p || !p.dir) return true;
    return M.fn[tri * 3] * p.dir[0] + M.fn[tri * 3 + 1] * p.dir[1] + M.fn[tri * 3 + 2] * p.dir[2] > 0.15;
  }
  toPview(sx, sy) {
    const name = this.panel, v = this.view(name) || { name, m: false };
    // (the spot you're pointing at on the car, whatever its depth; off the car, the outer surface's grid)
    const sf = this.def.mesh && this.surfaceAt(sx, sy, v.name), [u, w] = sf ? this.def.panels[v.name].proj(...sf.p) : this.fromScreen(sx, sy, v.name);
    if (!v.m) return [u, w];
    const P = this.def.panels[name], Q = this.def.panels[v.name];
    return [P.W * (1 - u / Q.W), w * P.H / Q.H];
  }
  aim(sx, sy) {
    const rr = this.rr, cr = this.cr, cx = sx + cr.left, cy = sy + cr.top;
    this.ray.setFromCamera(new THREE.Vector2((cx - rr.left) / rr.width * 2 - 1, -((cy - rr.top) / rr.height) * 2 + 1), this.ld.garage.camera);
  }
  // what's under the pointer on the car: { local (body coordinates), normal (body), uv } or null
  hitCar(sx, sy) {
    const car = this.ld.garage.car; if (!car) return null;
    this.aim(sx, sy);
    const inv = car.body.matrixWorld.clone().invert();
    for (const h of this.ray.intersectObject(car.group, true)) {
      let o = h.object, vis = o.isMesh; for (let q = o; q && vis; q = q.parent) if (!q.visible || q === car.shadow) vis = false;
      if (!vis || !h.face) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(inv);
      return { local: h.point.clone().applyMatrix4(inv), normal: n };
    }
    return null;
  }
  // screen -> a panel's metres: where its projector meets the car under the pointer, or (off the car) a flat sheet
  // at the depth of the shape being edited
  // (marched into the same surface the nodes are drawn on, so a node lands exactly where you click it, and wheels,
  // the driver and the floor don't get in the way)
  fromScreen(sx, sy, name) {
    const p = this.def.panels[name];
    this.aim(sx, sy);
    const body = this.ld.garage.car.body, inv = body.matrixWorld.clone().invert(), dir = new THREE.Vector3(...p.dir);
    const o = this.ray.ray.origin.clone().applyMatrix4(inv), r = this.ray.ray.direction.clone().transformDirection(inv);
    const S = this.surf(name), d = this.cur;
    if (S) {
      const at = (t) => [o.x + r.x * t, o.y + r.y * t, o.z + r.z * t];
      const inside = (t) => { const X = at(t), [u, v] = p.proj(...X); return X[0] * dir.x + X[1] * dir.y + X[2] * dir.z <= this.depthAt(S, u, v); };
      if (!inside(0)) for (let t = 0.015; t < 40; t += 0.015) if (inside(t)) {
        let lo = t - 0.015, hi = t;
        for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (inside(mid)) hi = mid; else lo = mid; }
        return p.proj(...at(hi));
      }
    }
    const d0 = S ? this.depthAt(S, d ? d.x : p.W / 2, d ? d.y : p.H / 2) : 0, den = r.dot(dir);
    const t = Math.abs(den) < 1e-4 ? 5 : (d0 - o.dot(dir)) / den, X = o.addScaledVector(r, Math.max(0, t));
    return p.proj(X.x, X.y, X.z);
  }
  // the panel a new shape starts on: the side the surface you clicked faces (leaning toward the camera), its biggest panel
  pickPanel(hit) {
    const G = this.ld.garage, inv = G.car.body.matrixWorld.clone().invert();
    const cam = G.camera.position.clone().applyMatrix4(inv).sub(hit.local).normalize(), groups = new Map();
    for (const [k, p] of Object.entries(this.def.panels)) {
      if (!p.proj || !p.dir) continue;
      const key = p.dir.join(','), g = groups.get(key) || { dir: p.dir, best: null };
      if (!g.best || p.W * p.H > this.def.panels[g.best].W * this.def.panels[g.best].H) g.best = k;
      groups.set(key, g);
    }
    let pick = null, ps = -Infinity;
    for (const g of groups.values()) { const D = new THREE.Vector3(...g.dir), sc = hit.normal.dot(D) + 0.5 * cam.dot(D); if (sc > ps) { ps = sc; pick = g.best; } }
    return pick || this.panel;
  }
  // the side a shape started on triangle tri belongs to (its biggest panel looking that way): of the sides that surface
  // faces fairly well, the one you're looking at it from, so a shape drawn on the flank from the side is projected
  // from the side even where the first click lands on the top of the wing (from above, the flank is edge-on)
  // (the pointer's ray must be aimed: meshHit)
  panelFacing(tri) {
    const M = this.def.mesh(), n = [M.fn[tri * 3], M.fn[tri * 3 + 1], M.fn[tri * 3 + 2]], P = this.def.panels;
    const inv = this.ld.garage.car.body.matrixWorld.clone().invert(), r = this.ray.ray.direction.clone().transformDirection(inv), cam = [-r.x, -r.y, -r.z];
    let best = null, bs = -Infinity, alt = null, as = -Infinity;
    for (const [k, p] of Object.entries(P)) {
      if (!p.proj || !p.dir) continue;
      const f = n[0] * p.dir[0] + n[1] * p.dir[1] + n[2] * p.dir[2], c = cam[0] * p.dir[0] + cam[1] * p.dir[1] + cam[2] * p.dir[2], big = p.W * p.H * 1e-4; // (ties: the bigger panel)
      if (f > 0.3 && c + 0.5 * f + big > bs) { bs = c + 0.5 * f + big; best = k; }
      if (f + big > as) { as = f + big; alt = k; }
    }
    return best || alt || this.panel;
  }
  prep3d() {
    const G = this.ld.garage;
    this.rr = G.r.domElement.getBoundingClientRect(); this.cr = this.cv.getBoundingClientRect();
    const a = G.aim.clone(), r = new THREE.Vector3().setFromMatrixColumn(G.camera.matrixWorld, 0), s0 = this.w2s(a), s1 = this.w2s(a.add(r));
    this.z = Math.max(5, Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) || 100); // (px per metre round the car: hit sizes, snapping)
  }
  // the car repainted with your shapes (a few times a second at most; only when something changed). A path still
  // being drawn shows as a line.
  paintSoon() {
    if (this.pt3) return;
    this.pt3 = setTimeout(() => {
      this.pt3 = 0;
      if (!this.open || this.flat) return;
      const s = JSON.stringify(this.car.decals) + this.drawing;
      if (s === this.painted) return;
      this.painted = s;
      const dr = this.car.decals[this.drawing], cfg = dr && !dr.path.closed ? { ...this.car, decals: this.car.decals.map(d => d === dr ? { ...d, fill: null, stroke: d.stroke ?? d.fill ?? 0xffffff, sw: d.stroke != null ? d.sw : 0.02 } : d) } : this.car;
      this.ld.garage.car.repaint(cfg);
    }, 70);
  }
  // a shape's path as points (panel metres), curves and straight runs both cut up so they follow the body
  samplePath(d) {
    const A = this.absNodes(d), n = A.length, out = [], segs = d.path.closed ? n : n - 1;
    if (!n) return out;
    out.push([A[0][0], A[0][1]]);
    for (let i = 0; i < segs; i++) { const a = A[i], b = A[(i + 1) % n]; for (let s = 1; s <= 12; s++) out.push(bez(a, b, s / 12).s); }
    return out;
  }
  // every shape on the car, picked where you point (its own side, or its mirror copy on the other side)
  shapeAt3(sx, sy) {
    const h = this.meshHit(sx, sy); if (!h) return null;
    const P = this.def.panels, g = this.scratch;
    for (let i = this.car.decals.length - 1; i >= 0; i--) {
      const d = this.car.decals[i]; if (!isShape(d)) continue;
      const p = P[d.panel]; if (!p || !p.proj) continue;
      const spots = [];
      if (this.faces(d.panel)) spots.push([false, 1]);
      if (d.mirror && p.pair && P[p.pair] && this.faces(p.pair)) spots.push([true, -1]);
      for (const [m, sg] of spots) {
        const S = this.stick(d, m), c = S && stickerCoords(S, h.tri, h.b1, h.b2); if (!c) continue;
        const X = d.x + sg * c[0], Y = d.y + c[1], M = frame(d), [lx, ly] = invert(M, X, Y), p2 = shapePath(d.path);
        if (d.fill != null && g.isPointInPath(p2, lx, ly)) return i;
        g.lineWidth = Math.max(d.stroke != null ? (d.sw || 0) / M.k : 0, (HIT * 2) / (this.z * M.k));
        if (g.isPointInStroke(p2, lx, ly)) return i;
      }
    }
    return null;
  }


  // ---------- the car behind ----------
  // paint the car without this panel's shapes, then picture it
  backdrop() {
    const c = this.car, hide = (d) => isShape(d) && d.panel === this.panel;
    this.bare = { ...c, decals: c.decals.filter(d => !hide(d)) };
    this.ld.garage.repaint(this.bare);
    this.snap = this.picture();
    this.draw();
  }
  backdropSoon() { clearTimeout(this.bt); this.bt = setTimeout(() => { if (this.open) this.backdrop(); }, 200); }
  snapSoon() { clearTimeout(this.st); this.st = setTimeout(() => { if (this.open && !this.drag) { this.snap = this.picture(); this.draw(); } }, 150); }
  // what's in view: the car square-on along the panel's direction (orthographic), plus its outline as a mask
  picture() {
    const G = this.ld.garage, car = G.car, el = G.r.domElement, rect = [...this.toP(0, 0), ...this.toP(this.cw, this.ch)];
    // (as sharp as the editor, or as the game's canvas allows: the picture is rendered into its corner)
    const f = Math.min(this.dpr, el.width / this.cw, el.height / this.ch), w = Math.max(1, Math.floor(this.cw * f)), h = Math.max(1, Math.floor(this.ch * f));
    const img = document.createElement('canvas'), mask = document.createElement('canvas');
    img.width = mask.width = w; img.height = mask.height = h;
    const p = this.p;
    if (!p.proj || !car || !car.body) return this.flatPicture(img, mask, rect);
    const o = p.proj(0, 0, 0), X = p.proj(1, 0, 0), Y = p.proj(0, 1, 0), Z = p.proj(0, 0, 1);
    const gu = new THREE.Vector3(X[0] - o[0], Y[0] - o[0], Z[0] - o[0]), gv = new THREE.Vector3(X[1] - o[1], Y[1] - o[1], Z[1] - o[1]), dir = new THREE.Vector3(...p.dir);
    const uc = (rect[0] + rect[2]) / 2, vc = (rect[1] + rect[3]) / 2;
    const c = gu.clone().multiplyScalar(uc - o[0]).addScaledVector(gv, vc - o[1]);
    G.scene.updateMatrixWorld(true);
    const body = car.body, W = (v) => body.localToWorld(v.clone());
    const cw = W(c), scale = W(c.clone().add(gu)).distanceTo(cw) || 1;
    const halfW = (rect[2] - rect[0]) / 2 * scale, halfH = (rect[3] - rect[1]) / 2 * scale;
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.05, 80);
    cam.position.copy(W(c.clone().addScaledVector(dir, 30)));
    cam.up.copy(W(c.clone().sub(gv)).sub(cw).normalize());
    cam.lookAt(cw); cam.updateProjectionMatrix();
    // only the car, lit from the camera so both sides read true
    const r = G.r, size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
    const hidden = [], hide = (o2) => { if (o2.visible) { o2.visible = false; hidden.push(o2); } };
    for (const o2 of G.scene.children) if (o2 !== G.table && !o2.isLight) hide(o2);
    for (const o2 of G.table.children) if (o2 !== car.group) hide(o2);
    if (car.shadow) hide(car.shadow);
    const lamp = new THREE.DirectionalLight(0xffffff, 1.6), amb = new THREE.AmbientLight(0xffffff, 0.5);
    lamp.position.copy(cam.position); lamp.target.position.copy(cw); G.scene.add(lamp, lamp.target, amb);
    const clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha(), auto = r.autoClear;
    try {
      r.setRenderTarget(null); r.autoClear = true;
      r.setViewport(0, 0, w / pr, h / pr); r.setScissor(0, 0, w / pr, h / pr); r.setScissorTest(true);
      r.setClearColor(0x07080c, 1); r.render(G.scene, cam);
      img.getContext('2d').drawImage(el, 0, el.height - h, w, h, 0, 0, w, h);
      G.scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      r.setClearColor(0x000000, 1); r.render(G.scene, cam);
      const mg = mask.getContext('2d', { willReadFrequently: true });
      mg.drawImage(el, 0, el.height - h, w, h, 0, 0, w, h);
      const id = mg.getImageData(0, 0, w, h), px = id.data;
      for (let i = 0; i < px.length; i += 4) { px[i + 3] = px[i]; px[i] = px[i + 1] = px[i + 2] = 255; }
      mg.putImageData(id, 0, 0);
    } finally {
      G.scene.overrideMaterial = null;
      G.scene.remove(lamp, lamp.target, amb);
      for (const o2 of hidden) o2.visible = true;
      r.setScissorTest(false); r.setViewport(0, 0, size.x, size.y); r.setClearColor(clear, alpha); r.autoClear = auto;
    }
    return { img, mask, rect };
  }
  // (a car without a 3D projection, the classic atlas car: the panel's flat paint)
  flatPicture(img, mask, rect) {
    const p = this.p, k = img.width / (rect[2] - rect[0]), tf = [k, 0, 0, k, -rect[0] * k, -rect[1] * k];
    const g = img.getContext('2d'); g.fillStyle = '#07080c'; g.fillRect(0, 0, img.width, img.height);
    g.setTransform(...tf); g.save(); g.beginPath(); g.rect(0, 0, p.W, p.H); g.clip();
    g.fillStyle = hex((this.bare || this.car).main); g.fillRect(0, 0, p.W, p.H);
    panelArt(g, this.panel, p, this.bare || this.car, this.def, () => this.backdropSoon());
    g.restore();
    const m = mask.getContext('2d'); m.setTransform(...tf); m.fillStyle = '#fff'; m.fillRect(0, 0, p.W, p.H);
    return { img, mask, rect };
  }

  // ---------- drawing ----------
  draw() {
    if (!this.open || !this.p) return;
    if (!this.flat) {
      const g = this.g; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height);
      if (!this.ld.garage.car) return;
      this.prep3d(); this.overlay(); this.paintSoon();
      return;
    }
    const g = this.g, lg = this.lg, dpr = this.dpr, z = this.z, p = this.p, S = this.snap;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#07080c'; g.fillRect(0, 0, this.cv.width, this.cv.height);
    const place = (c, im) => { const [x, y] = this.toS(S.rect[0], S.rect[1]); c.drawImage(im, x * dpr, y * dpr, (S.rect[2] - S.rect[0]) * z * dpr, (S.rect[3] - S.rect[1]) * z * dpr); };
    if (S) place(g, S.img);
    // the panel's edges, and its center line where shapes mirror onto themselves
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [px0, py0] = this.toS(0, 0), [px1, py1] = this.toS(p.W, p.H);
    g.setLineDash([4, 4]); g.lineWidth = 1; g.strokeStyle = 'rgba(255,43,0,.45)'; g.strokeRect(px0 + 0.5, py0 + 0.5, px1 - px0, py1 - py0);
    if (!(p.pair && this.def.panels[p.pair])) { g.strokeStyle = 'rgba(255,43,0,.3)'; g.beginPath(); g.moveTo((px0 + px1) / 2, py0); g.lineTo((px0 + px1) / 2, py1); g.stroke(); }
    g.setLineDash([]);
    // the shapes: on the car (clipped to its outline), and faintly where they hang off it
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, this.layer.width, this.layer.height);
    lg.setTransform(dpr * z, 0, 0, dpr * z, dpr * this.ox, dpr * this.oy);
    for (const i of this.shapes()) {
      const d = this.car.decals[i];
      if (this.drawing === i && !d.path.closed) continue; // (a path being drawn: outline only, below)
      drawDecal(lg, d, d.x, d.y);
      if (d.mirror && !(p.pair && this.def.panels[p.pair])) drawDecal(lg, { ...d, flip: !d.flip, rot: -(d.rot || 0) }, p.W - d.x, d.y);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 0.28; g.drawImage(this.layer, 0, 0); g.globalAlpha = 1;
    if (S) { lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'destination-in'; place(lg, S.mask); lg.globalCompositeOperation = 'source-over'; }
    g.drawImage(this.layer, 0, 0);
    this.overlay();
  }
  // outline of a shape in screen space
  outline(d, width, color) {
    if (!this.flat) {
      const g = this.g; g.save(); g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.beginPath();
      let on = false;
      for (const [x, y] of this.samplePath(d)) { const [sx, sy] = this.toS(x, y, d.panel, d); if (!isFinite(sx)) { on = false; continue; } on ? g.lineTo(sx, sy) : g.moveTo(sx, sy); on = true; }
      g.lineWidth = width; g.strokeStyle = color; g.stroke(); g.restore();
      return;
    }
    const g = this.g, M = frame(d), z = this.z, dpr = this.dpr;
    g.save(); g.setTransform(dpr * z, 0, 0, dpr * z, dpr * this.ox, dpr * this.oy); g.transform(M.a, M.b, M.c, M.d, M.e, M.f);
    g.lineWidth = width / (z * M.k); g.strokeStyle = color; g.stroke(shapePath(d.path)); g.restore();
  }
  absNodes(d) { const M = frame(d); return d.path.n.map(n => { const [x, y] = apply(M, n[0], n[1]), [ix, iy] = applyV(M, n[2], n[3]), [ox, oy] = applyV(M, n[4], n[5]); return [x, y, ix, iy, ox, oy]; }); }
  corners(d) { // the selection box (panel metres) of a normalized shape
    const b = shapeBounds(d.path), M = frame(d);
    return [apply(M, b[0], b[1]), apply(M, b[2], b[1]), apply(M, b[2], b[3]), apply(M, b[0], b[3])];
  }
  overlay() {
    const g = this.g, d = this.cur, sq = (x, y, fill) => { g.fillStyle = fill ? RED : PAPER; g.strokeStyle = RED; g.lineWidth = 1.2; g.fillRect(x - NODE, y - NODE, NODE * 2, NODE * 2); g.strokeRect(x - NODE, y - NODE, NODE * 2, NODE * 2); };
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // snap guides
    g.strokeStyle = AMBER; g.lineWidth = 1;
    for (const q of this.guides) {
      g.beginPath();
      if (!this.flat) { // (on the car: the guide runs across the panel, over the body)
        let on = false;
        for (let s = 0; s <= 40; s++) { const t = s / 40, [sx, sy] = q.x != null ? this.toS(q.x, -0.2 + t * (this.p.H + 0.4)) : this.toS(-0.2 + t * (this.p.W + 0.4), q.y); if (!isFinite(sx)) { on = false; continue; } on ? g.lineTo(sx, sy) : g.moveTo(sx, sy); on = true; }
        g.stroke(); continue;
      }
      if (q.x != null) { const [sx] = this.toS(q.x, 0); g.moveTo(sx + 0.5, 0); g.lineTo(sx + 0.5, this.ch); } else { const [, sy] = this.toS(0, q.y); g.moveTo(0, sy + 0.5); g.lineTo(this.cw, sy + 0.5); } g.stroke(); }
    const hv = this.hover != null && this.car.decals[this.hover];
    if (hv && hv !== d && isShape(hv)) this.outline(hv, 1.5, RED);
    if (!d) return;
    if (this.tool === 'move' || this.tool === 'rect' || this.tool === 'ellipse') {
      this.outline(d, 1, RED);
      const C = this.corners(d).map(([x, y]) => this.toS(x, y));
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.strokeStyle = RED; g.lineWidth = 1;
      g.beginPath(); C.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke();
      for (const [x, y] of C) sq(x, y, false);
      return;
    }
    // node editing / pen: the path, nodes, and the handles round the selected nodes
    this.outline(d, 1.2, RED);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const A = this.absNodes(d), n = A.length, show = new Set();
    for (const i of this.nsel) { show.add(i); if (d.path.closed || i > 0) show.add((i - 1 + n) % n); if (d.path.closed || i < n - 1) show.add((i + 1) % n); }
    if (this.drawing != null && n) { show.add(n - 1); }
    for (const i of show) {
      const a = A[i]; if (!a) continue;
      const [x, y] = this.toS(a[0], a[1]);
      for (const [hx, hy, which] of [[a[2], a[3], 'in'], [a[4], a[5], 'out']]) {
        if (!hx && !hy) continue;
        if (!this.nsel.has(i) && this.drawing == null) { // (a neighbour: only its handle toward the selected node)
          const towards = which === 'in' ? this.nsel.has((i - 1 + n) % n) : this.nsel.has((i + 1) % n); if (!towards) continue;
        }
        const [ex, ey] = this.toS(a[0] + hx, a[1] + hy);
        g.strokeStyle = RED; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
        g.fillStyle = PAPER; g.beginPath(); g.arc(ex, ey, 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
    A.forEach((a, i) => { const [x, y] = this.toS(a[0], a[1]); sq(x, y, this.nsel.has(i)); });
    // the pen's next segment
    if (this.drawing != null && this.mouse && !this.drag && n) {
      const a = A[n - 1], [x0, y0] = this.toS(a[0], a[1]), [x1, y1] = this.mouse, [c1x, c1y] = this.toS(a[0] + a[4], a[1] + a[5]);
      g.strokeStyle = RED; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(c1x, c1y, x1, y1); g.stroke(); g.setLineDash([]);
      if (n > 1) { const [fx, fy] = this.toS(A[0][0], A[0][1]); if (Math.hypot(fx - x1, fy - y1) < HIT) { g.strokeStyle = AMBER; g.lineWidth = 2; g.strokeRect(fx - NODE - 2, fy - NODE - 2, NODE * 2 + 4, NODE * 2 + 4); } }
    }
  }

  // ---------- hit tests ----------
  shapeAt(sx, sy) {
    if (!this.flat) return this.shapeAt3(sx, sy);
    const [X, Y] = this.toP(sx, sy), g = this.scratch, ids = this.shapes(), p = this.p;
    for (let j = ids.length - 1; j >= 0; j--) {
      const d = this.car.decals[ids[j]], spots = [d];
      if (d.mirror && !(p.pair && this.def.panels[p.pair])) spots.push({ ...d, x: p.W - d.x, flip: !d.flip, rot: -(d.rot || 0) });
      for (const s of spots) {
        const M = frame(s), [lx, ly] = invert(M, X, Y), p2 = shapePath(s.path);
        if (s.fill != null && g.isPointInPath(p2, lx, ly)) return ids[j];
        g.lineWidth = Math.max(s.stroke != null ? (s.sw || 0) / M.k : 0, (HIT * 2) / (this.z * M.k));
        if (g.isPointInStroke(p2, lx, ly)) return ids[j];
      }
    }
    return null;
  }
  nodeAt(sx, sy) {
    const d = this.cur; if (!d) return null;
    const A = this.absNodes(d), n = A.length;
    // handles first (they sit over nodes when short), only those on show
    for (let i = 0; i < n; i++) {
      const vis = this.nsel.has(i) || this.nsel.has((i + 1) % n) || this.nsel.has((i - 1 + n) % n);
      if (!vis) continue;
      for (const [k, which] of [[2, 'in'], [4, 'out']]) {
        if (!A[i][k] && !A[i][k + 1]) continue;
        const [hx, hy] = this.toS(A[i][0] + A[i][k], A[i][1] + A[i][k + 1]);
        if (Math.hypot(hx - sx, hy - sy) < HIT) return { i, h: which };
      }
    }
    for (let i = n - 1; i >= 0; i--) { const [x, y] = this.toS(A[i][0], A[i][1]); if (Math.hypot(x - sx, y - sy) < HIT) return { i }; }
    return null;
  }
  segmentAt(sx, sy) {
    const d = this.cur; if (!d) return null;
    const A = this.absNodes(d), n = A.length, segs = d.path.closed ? n : n - 1;
    let best = null;
    for (let i = 0; i < segs; i++) {
      const a = A[i], b = A[(i + 1) % n];
      for (let s = 1; s < 40; s++) {
        const t = s / 40, { s: q } = bez(a, b, t), [x, y] = this.toS(q[0], q[1]), dd = Math.hypot(x - sx, y - sy);
        if (dd < HIT && (!best || dd < best.dd)) best = { i, t, dd };
      }
    }
    return best;
  }
  // which selection box corner (or the turn zone just outside it) is under the pointer
  cornerAt(sx, sy) {
    const d = this.cur; if (!d) return null;
    const C = this.corners(d).map(([x, y]) => this.toS(x, y)), mx = C.reduce((s, c) => s + c[0], 0) / 4, my = C.reduce((s, c) => s + c[1], 0) / 4;
    for (let k = 0; k < 4; k++) if (Math.hypot(C[k][0] - sx, C[k][1] - sy) < HIT) return { k, kind: 'scale' };
    for (let k = 0; k < 4; k++) {
      const [cx, cy] = C[k], ux = cx - mx, uy = cy - my, ul = Math.hypot(ux, uy) || 1, along = ((sx - cx) * ux + (sy - cy) * uy) / ul;
      if (Math.hypot(cx - sx, cy - sy) < ROT_OUT + HIT && along > 0) return { k, kind: 'rotate' };
    }
    return null;
  }

  // ---------- undo ----------
  mark() {
    const s = JSON.stringify(this.car.decals);
    if (this.undo[this.undo.length - 1] === s) return;
    this.undo.push(s); if (this.undo.length > 150) this.undo.shift(); this.redo = [];
  }
  restore(s) { this.car.decals = JSON.parse(s); this.ld.sel = Math.min(this.ld.sel, this.car.decals.length - 1); this.nsel.clear(); this.drawing = null; if (this.flat) this.backdrop(); else { if (this.cur == null && this.car.decals[this.ld.sel]?.path) this.panel = this.car.decals[this.ld.sel].panel; this.draw(); } this.ld.render(); this.ld.save(); }
  doUndo() { if (!this.undo.length) return; this.redo.push(JSON.stringify(this.car.decals)); this.restore(this.undo.pop()); }
  doRedo() { if (!this.redo.length) return; this.undo.push(JSON.stringify(this.car.decals)); this.restore(this.redo.pop()); }
  changed(list = false) { this.ld.save(); this.draw(); if (list) this.ld.render(); }
  // something changed in the designer's side panel: a shape here just redraws, anything else repaints the car behind
  changedFromPanel() {
    const d = this.car.decals[this.ld.sel]; this.ld.save();
    if (!this.flat) { if (isShape(d) && d.panel !== this.panel) this.panel = d.panel; if (!isShape(d)) this.ld.setCar(this.car, false); this.draw(); return; }
    if (isShape(d) && d.panel === this.panel) this.draw(); else this.backdropSoon();
  }

  // ---------- snapping (panel center + edges, other shapes' boxes and nodes; Ctrl / Cmd turns it off) ----------
  snapTargets(skip) {
    const p = this.p, xs = [0, p.W / 2, p.W], ys = [0, p.H / 2, p.H];
    for (const i of this.shapes()) {
      const d = this.car.decals[i];
      if (d === skip) continue;
      const C = this.corners(d); xs.push(C[0][0], C[2][0], (C[0][0] + C[2][0]) / 2); ys.push(C[0][1], C[2][1], (C[0][1] + C[2][1]) / 2);
    }
    return { xs, ys };
  }
  snap1(vals, targets, off) { // best shift (m) for any of vals onto any target, within the pull
    const pull = 6 / this.z; let best = null;
    for (const v of vals) for (const t of targets) { const dd = t - v; if (Math.abs(dd) < pull && (!best || Math.abs(dd) < Math.abs(best.dd))) best = { dd, t }; }
    return off ? null : best;
  }

  // ---------- pointer ----------
  down(e) {
    if (!this.open) return;
    const [sx, sy] = this.pt(e);
    if (!this.flat) this.prep3d();
    let [X, Y] = this.toP(sx, sy);
    this.cv.setPointerCapture(e.pointerId);
    this.mouse = [sx, sy];
    if (!this.flat) this.prep3d();
    if (this.cur && this.drawing == null) this.norm(this.cur); // (rotation / size from the sliders folded in: node math is in plain metres)
    if (e.button === 1 || e.button === 2 || this.space) return this.panStart(sx, sy);
    if (e.button !== 0) return;
    const t = this.tool;
    // on the car, a new shape starts on the side you click (off the car, the drag spins it instead)
    if (!this.flat && /pen|rect|ellipse/.test(t) && this.drawing == null && !(t === 'pen' && this.nearOpenEnd(sx, sy))) {
      const h = this.def.mesh ? this.meshHit(sx, sy) : null, hit = h ? null : this.hitCar(sx, sy);
      if (!h && !hit) return this.panStart(sx, sy);
      this.panel = h ? this.panelFacing(h.tri) : this.pickPanel(hit);
      [X, Y] = this.toPproj(sx, sy);
    }
    if (t === 'pen') return this.penDown(X, Y, sx, sy, e);
    if (t === 'rect' || t === 'ellipse') {
      this.mark();
      const d = this.newShape(X, Y, { closed: true, n: [[0, 0, 0, 0, 0, 0, 0]] });
      this.drag = { kind: 'create', d, x0: X, y0: Y, sx, sy };
      return;
    }
    if (t === 'node') {
      const hit = this.nodeAt(sx, sy), d = this.cur;
      if (hit) {
        this.mark();
        if (hit.h) { this.drag = { kind: 'handle', i: hit.i, h: hit.h, alt: e.altKey }; return; }
        if (e.shiftKey) { this.nsel.has(hit.i) ? this.nsel.delete(hit.i) : this.nsel.add(hit.i); }
        else if (!this.nsel.has(hit.i)) { this.nsel.clear(); this.nsel.add(hit.i); }
        this.drag = { kind: 'nodes', X, Y, orig: JSON.parse(JSON.stringify(d.path.n)), x: d.x, y: d.y };
        return this.draw();
      }
      const seg = this.segmentAt(sx, sy);
      if (seg) { this.mark(); this.split(seg.i, seg.t); return; }
      const other = this.shapeAt(sx, sy);
      if (other != null && other !== this.ld.sel) { this.select(other); return; }
      if (other == null && !this.flat) { this.nsel.clear(); this.draw(); return this.panStart(sx, sy); }
      if (other == null) { this.drag = { kind: 'marquee', X, Y, X1: X, Y1: Y, add: e.shiftKey }; if (!e.shiftKey) this.nsel.clear(); this.draw(); }
      return;
    }
    // move
    const c = this.cornerAt(sx, sy);
    if (c) {
      const d = this.cur; this.mark(); this.norm(d);
      const C = this.corners(d);
      this.drag = { kind: c.kind, k: c.k, anchor: C[(c.k + 2) % 4], from: C[c.k], orig: JSON.parse(JSON.stringify(d.path.n)), x: d.x, y: d.y, ctr: [d.x, d.y], a0: Math.atan2(Y - d.y, X - d.x) };
      return;
    }
    const i = this.shapeAt(sx, sy);
    if (i == null) { if (!this.flat) return this.panStart(sx, sy, true); this.ld.sel = -1; this.ld.render(); this.draw(); return; }
    this.mark();
    if (i !== this.ld.sel) this.select(i, false);
    if (!this.flat) [X, Y] = this.toPproj(sx, sy); // (a whole shape moves with the panel's projection, not its own sticker)
    let d = this.car.decals[i];
    if (e.altKey) { d = JSON.parse(JSON.stringify(d)); d.id = rid(); this.car.decals.splice(i + 1, 0, d); this.ld.sel = i + 1; this.ld.render(); }
    this.norm(d);
    this.drag = { kind: 'move', X, Y, x: d.x, y: d.y };
  }
  // drag the view: the flat view pans, the car spins (a click on nothing, with desel, also drops the selection)
  panStart(sx, sy, desel = false) {
    const G = this.ld.garage;
    this.drag = this.flat ? { kind: 'pan', sx, sy, ox: this.ox, oy: this.oy } : { kind: 'orbit', sx, sy, yaw: G.yaw, pitch: G.pitch, desel };
    this.cursor();
  }
  nearOpenEnd(sx, sy) {
    const d = this.cur; if (!d || d.path.closed) return false;
    const A = this.absNodes(d), near = (a) => { const [x, y] = this.toS(a[0], a[1]); return Math.hypot(x - sx, y - sy) < HIT; };
    return near(A[0]) || near(A[A.length - 1]);
  }
  move(e) {
    if (!this.open) return;
    if (!this.flat) this.prep3d();
    const [sx, sy] = this.pt(e), D = this.drag, [X, Y] = D && (D.kind === 'move' || D.kind === 'create') ? this.toPproj(sx, sy) : this.toP(sx, sy);
    this.mouse = [sx, sy];
    if (!D) {
      const h = this.tool === 'move' || this.tool === 'node' ? this.shapeAt(sx, sy) : null;
      if (this.tool === 'move') { const c = this.cornerAt(sx, sy); this.cv.style.cursor = c ? (c.kind === 'rotate' ? 'alias' : (c.k % 2 ? 'nesw-resize' : 'nwse-resize')) : h != null ? 'move' : 'default'; }
      if (h !== this.hover || this.drawing != null) { this.hover = h; this.draw(); }
      return;
    }
    const d = this.cur, off = e.ctrlKey || e.metaKey;
    this.guides = [];
    if (D.kind === 'pan') { this.ox = D.ox + sx - D.sx; this.oy = D.oy + sy - D.sy; this.draw(); return; }
    if (D.kind === 'orbit') {
      const G = this.ld.garage; if (Math.hypot(sx - D.sx, sy - D.sy) > 3) D.moved = true;
      G.yaw = D.yaw - (sx - D.sx) * 0.008; G.pitch = Math.max(-0.05, Math.min(1.35, D.pitch + (sy - D.sy) * 0.006)); return;
    }
    if (D.kind === 'move' && d) {
      let nx = D.x + X - D.X, ny = D.y + Y - D.Y;
      if (e.shiftKey) { if (Math.abs(X - D.X) > Math.abs(Y - D.Y)) ny = D.y; else nx = D.x; }
      d.x = nx; d.y = ny;
      const C = this.corners(d), T = this.snapTargets(d);
      const bx = this.snap1([C[0][0], C[2][0], (C[0][0] + C[2][0]) / 2], T.xs, off), by = this.snap1([C[0][1], C[2][1], (C[0][1] + C[2][1]) / 2], T.ys, off);
      if (bx) { d.x += bx.dd; this.guides.push({ x: bx.t }); }
      if (by) { d.y += by.dd; this.guides.push({ y: by.t }); }
      return this.draw();
    }
    if (D.kind === 'scale' && d) {
      const [ax, ay] = D.anchor, [fx, fy] = D.from;
      let kx = (X - ax) / ((fx - ax) || 1e-6), ky = (Y - ay) / ((fy - ay) || 1e-6);
      if (e.shiftKey) { const k = Math.abs(kx) > Math.abs(ky) ? kx : ky; kx = Math.sign(kx || 1) * Math.abs(k); ky = Math.sign(ky || 1) * Math.abs(k); }
      d.path.n = D.orig.map(n => { const x = D.x + n[0], y = D.y + n[1]; return [ax + (x - ax) * kx - D.x, ay + (y - ay) * ky - D.y, n[2] * kx, n[3] * ky, n[4] * kx, n[5] * ky, n[6]]; });
      d.x = D.x; d.y = D.y; this.norm(d);
      return this.draw();
    }
    if (D.kind === 'rotate' && d) {
      let a = Math.atan2(Y - D.ctr[1], X - D.ctr[0]) - D.a0;
      if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      const cs = Math.cos(a), sn = Math.sin(a), R = (x, y) => [x * cs - y * sn, x * sn + y * cs];
      d.path.n = D.orig.map(n => [...R(n[0], n[1]), ...R(n[2], n[3]), ...R(n[4], n[5]), n[6]]);
      d.x = D.x; d.y = D.y; this.norm(d);
      return this.draw();
    }
    if (D.kind === 'nodes' && d) {
      let dx = X - D.X, dy = Y - D.Y;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      // snap the node under the pointer onto other nodes / the panel's center and edges
      const lead = [...this.nsel][0];
      if (lead != null && D.orig[lead]) {
        const T = this.snapTargets(null), A = this.absNodes(d);
        A.forEach((a, k) => { if (!this.nsel.has(k)) { T.xs.push(a[0]); T.ys.push(a[1]); } });
        const lx = D.x + D.orig[lead][0] + dx, ly = D.y + D.orig[lead][1] + dy;
        const bx = this.snap1([lx], T.xs, off), by = this.snap1([ly], T.ys, off);
        if (bx) { dx += bx.dd; this.guides.push({ x: bx.t }); }
        if (by) { dy += by.dd; this.guides.push({ y: by.t }); }
      }
      d.x = D.x; d.y = D.y;
      d.path.n = D.orig.map((n, k) => this.nsel.has(k) ? [n[0] + dx, n[1] + dy, ...n.slice(2)] : [...n]);
      return this.draw();
    }
    if (D.kind === 'handle' && d) this.dragHandle(d, D.i, D.h, X, Y, D.alt || e.altKey);
    if (D.kind === 'marquee') { D.X1 = X; D.Y1 = Y; this.marquee(D); return; }
    if (D.kind === 'create') return this.dragCreate(D, X, Y, e);
    if (D.kind === 'pen' && d) {
      const n = d.path.n[D.i], ax = d.x + n[0], ay = d.y + n[1];
      if (Math.hypot(sx - D.sx, sy - D.sy) > 3) { const hx = X - ax, hy = Y - ay; n[4] = hx; n[5] = hy; n[2] = -hx; n[3] = -hy; n[6] = 1; }
      return this.draw();
    }
  }
  up(e) {
    const D = this.drag; if (!D) return;
    this.drag = null; this.guides = [];
    const d = this.cur;
    if (D.kind === 'pan') { this.cursor(); this.snapSoon(); return; }
    if (D.kind === 'orbit') { this.cursor(); if (!D.moved && D.desel) { this.ld.sel = -1; this.nsel.clear(); this.ld.render(); this.draw(); } return; }
    if (D.kind === 'create') {
      if (!D.made) { this.removeShape(this.ld.sel, true); this.undo.pop(); this.draw(); return; }
      this.norm(D.d); this.setTool('move'); this.changed(true); return;
    }
    if (D.kind === 'pen') {
      if (D.closing && d) { this.finishPen(); this.setTool('move'); }
      if (d) this.norm(d);
      this.changed(true); return;
    }
    if (D.kind === 'marquee') { this.draw(); return; }
    if (d) this.norm(d);
    this.changed(true);
  }
  dbl(e) {
    const [sx, sy] = this.pt(e);
    if (this.tool === 'move') { const i = this.shapeAt(sx, sy); if (i != null) { this.select(i); this.setTool('node'); } return; }
    if (this.tool === 'node') {
      const hit = this.nodeAt(sx, sy), d = this.cur;
      if (hit && !hit.h && d) { this.mark(); this.toggleSmooth(d, hit.i); this.norm(d); this.changed(); return; }
      if (!hit && this.shapeAt(sx, sy) == null) this.setTool('move');
    }
  }
  key(e) {
    if (!this.open || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase(), d = this.cur;
    if (e.code === 'Space') { e.preventDefault(); if (!this.space) { this.space = true; this.cursor(); } return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.doRedo(); return; }
    if (mod && k === 'd') { e.preventDefault(); if (d) { this.mark(); const c = JSON.parse(JSON.stringify(d)); c.id = rid(); c.x += 0.05; c.y += 0.05; this.car.decals.splice(this.ld.sel + 1, 0, c); this.ld.sel++; this.changed(true); } return; }
    if (mod) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.drawing != null) { this.finishPen(); this.setTool('move'); }
      else if (this.tool !== 'move') this.setTool('move');
      else if (d) { this.ld.sel = -1; this.ld.render(); this.draw(); }
      else this.close();
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); if (this.drawing != null) { this.finishPen(); this.setTool('move'); } else if (this.tool === 'move' && d) this.setTool('node'); else if (this.tool === 'node') this.setTool('move'); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); if (!d) return;
      this.mark();
      if (this.tool === 'node' && this.nsel.size) {
        d.path.n = d.path.n.filter((_, i) => !this.nsel.has(i)); this.nsel.clear();
        if (d.path.n.length < 2) { this.removeShape(this.ld.sel); this.setTool('move'); return; }
        if (d.path.n.length < 3) d.path.closed = false;
        this.norm(d); this.changed(true); return;
      }
      this.removeShape(this.ld.sel); return;
    }
    if (e.key.startsWith('Arrow') && d) {
      e.preventDefault(); this.mark();
      const s = e.shiftKey ? 0.1 : 0.01, dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
      if (this.tool === 'node' && this.nsel.size) { for (const i of this.nsel) { d.path.n[i][0] += dx; d.path.n[i][1] += dy; } this.norm(d); }
      else { d.x += dx; d.y += dy; }
      this.changed(); return;
    }
    const tools = { v: 'move', a: 'node', p: 'pen', r: 'rect', o: 'ellipse', e: 'ellipse' };
    if (tools[k]) { e.preventDefault(); this.setTool(tools[k]); return; }
    if (this.flat && (k === 'f' || (e.shiftKey && e.code === 'Digit1'))) { this.fit(); this.snapSoon(); }
  }

  // ---------- shape operations ----------
  newShape(X, Y, path) {
    const c = this.car, p = this.p, pairs = !!(p.pair && this.def.panels[p.pair]);
    const d = { id: rid(), panel: this.panel, x: X, y: Y, size: 0.002, rot: 0, opacity: 1, mirror: pairs, flip: false, name: null, path: { w: 0.002, ...path }, fill: c.accent ?? 0xffffff, stroke: null, sw: 0.04 };
    c.decals.push(d); this.ld.sel = c.decals.length - 1;
    return d;
  }
  select(i, render = true) { this.ld.sel = i; this.nsel.clear(); const d = this.car.decals[i]; if (!this.flat && isShape(d)) this.panel = d.panel; if (isShape(d)) this.norm(d); if (render) this.ld.render(); this.draw(); }
  removeShape(i, quiet) {
    if (i < 0 || !this.car.decals[i]) return;
    this.car.decals.splice(i, 1); this.ld.sel = -1; this.nsel.clear(); this.drawing = null;
    if (!quiet) this.changed(true);
  }
  dragCreate(D, X, Y, e) {
    const d = D.d, [sx, sy] = this.mouse;
    if (!D.made && Math.hypot(sx - D.sx, sy - D.sy) < 4) return;
    D.made = true;
    let w = X - D.x0, h = Y - D.y0;
    if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    let x0 = D.x0, y0 = D.y0;
    if (e.altKey) { x0 -= w; y0 -= h; w *= 2; h *= 2; }
    const cx = x0 + w / 2, cy = y0 + h / 2, hw = Math.abs(w) / 2, hh = Math.abs(h) / 2;
    d.x = cx; d.y = cy; d.rot = 0; d.flip = false;
    if (this.tool === 'rect') d.path.n = [[-hw, -hh, 0, 0, 0, 0, 0], [hw, -hh, 0, 0, 0, 0, 0], [hw, hh, 0, 0, 0, 0, 0], [-hw, hh, 0, 0, 0, 0, 0]];
    else { const kx = hw * KAPPA, ky = hh * KAPPA; d.path.n = [[0, -hh, -kx, 0, kx, 0, 1], [hw, 0, 0, -ky, 0, ky, 1], [0, hh, kx, 0, -kx, 0, 1], [-hw, 0, 0, ky, 0, -ky, 1]]; }
    d.path.w = d.size = Math.max(0.002, hw * 2);
    this.draw();
  }
  penDown(X, Y, sx, sy, e) {
    let d = this.cur;
    if (this.drawing == null) {
      // carry on an open path from either end, else start a new one
      if (d && !d.path.closed) {
        const A = this.absNodes(d), near = (a) => { const [x, y] = this.toS(a[0], a[1]); return Math.hypot(x - sx, y - sy) < HIT; };
        if (near(A[A.length - 1]) || near(A[0])) {
          this.mark(); this.norm(d);
          if (near(A[0]) && !near(A[A.length - 1])) d.path.n = d.path.n.reverse().map(n => [n[0], n[1], n[4], n[5], n[2], n[3], n[6]]);
          this.drawing = this.ld.sel; this.draw(); return;
        }
      }
      this.mark();
      d = this.newShape(X, Y, { closed: false, n: [[0, 0, 0, 0, 0, 0, 0]] });
      this.drawing = this.ld.sel;
      this.drag = { kind: 'pen', i: 0, sx, sy };
      this.ld.render(); this.draw();
      return;
    }
    d = this.car.decals[this.drawing]; if (!d) { this.drawing = null; return; }
    this.norm(d);
    const n = d.path.n, first = n[0], [fx, fy] = this.toS(d.x + first[0], d.y + first[1]);
    if (n.length > 1 && Math.hypot(fx - sx, fy - sy) < HIT) { // close the shape
      d.path.closed = true;
      this.drag = { kind: 'pen', i: 0, sx, sy, closing: true };
      this.draw(); return;
    }
    let x = X - d.x, y = Y - d.y;
    if (e.shiftKey) { const l = n[n.length - 1], dx = x - l[0], dy = y - l[1], a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), r = Math.hypot(dx, dy); x = l[0] + Math.cos(a) * r; y = l[1] + Math.sin(a) * r; }
    n.push([x, y, 0, 0, 0, 0, 0]);
    this.drag = { kind: 'pen', i: n.length - 1, sx, sy };
    this.draw();
  }
  // stop drawing: an open path becomes a line (stroked), a closed one a filled shape; a single node is dropped
  finishPen() {
    if (this.drawing == null) return;
    const i = this.drawing, d = this.car.decals[i]; this.drawing = null;
    if (!d) return;
    if (d.path.n.length < 2) { this.removeShape(i, true); this.ld.render(); this.draw(); return; }
    if (!d.path.closed && d.stroke == null) { d.stroke = d.fill ?? this.car.accent ?? 0xffffff; d.fill = null; d.sw = d.sw || 0.04; }
    this.norm(d); this.changed(true);
  }
  dragHandle(d, i, which, X, Y, broken) {
    const n = d.path.n[i], hx = X - (d.x + n[0]), hy = Y - (d.y + n[1]);
    const [k, o] = which === 'in' ? [2, 4] : [4, 2];
    n[k] = hx; n[k + 1] = hy;
    if (broken) n[6] = 0;
    else if (n[6]) { const l = Math.hypot(n[o], n[o + 1]) || Math.hypot(hx, hy), m = Math.hypot(hx, hy) || 1; n[o] = -hx / m * l; n[o + 1] = -hy / m * l; }
    this.draw();
  }
  toggleSmooth(d, i) {
    const n = d.path.n, c = n[i], N = n.length;
    if (c[6] || c[2] || c[3] || c[4] || c[5]) { c[2] = c[3] = c[4] = c[5] = 0; c[6] = 0; return; }
    const prev = n[(i - 1 + N) % N], next = n[(i + 1) % N];
    const ends = !d.path.closed && (i === 0 || i === N - 1);
    const a = ends ? (i === 0 ? c : prev) : prev, b = ends ? (i === 0 ? next : c) : next;
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const lp = Math.hypot(c[0] - prev[0], c[1] - prev[1]) / 3, ln = Math.hypot(next[0] - c[0], next[1] - c[1]) / 3;
    c[2] = -tx * lp; c[3] = -ty * lp; c[4] = tx * ln; c[5] = ty * ln; c[6] = 1;
  }
  split(i, t) {
    const d = this.cur; this.norm(d);
    const n = d.path.n, a = n[i], b = n[(i + 1) % n.length], curved = a[4] || a[5] || b[2] || b[3];
    let node;
    if (!curved) { node = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0, 0, 0, 0, 0]; }
    else {
      const { s, q0, r0, r1, q2 } = bez(a, b, t);
      a[4] = q0[0] - a[0]; a[5] = q0[1] - a[1]; b[2] = q2[0] - b[0]; b[3] = q2[1] - b[1];
      node = [s[0], s[1], r0[0] - s[0], r0[1] - s[1], r1[0] - s[0], r1[1] - s[1], 1];
    }
    n.splice(i + 1, 0, node);
    this.nsel.clear(); this.nsel.add(i + 1);
    const D = { kind: 'nodes', orig: JSON.parse(JSON.stringify(n)), x: d.x, y: d.y };
    [D.X, D.Y] = [d.x + node[0], d.y + node[1]];
    this.drag = D; this.draw();
  }
  marquee(D) {
    const d = this.cur; if (!d) return;
    const x0 = Math.min(D.X, D.X1), x1 = Math.max(D.X, D.X1), y0 = Math.min(D.Y, D.Y1), y1 = Math.max(D.Y, D.Y1);
    if (!D.add) this.nsel.clear();
    this.absNodes(d).forEach((a, i) => { if (a[0] >= x0 && a[0] <= x1 && a[1] >= y0 && a[1] <= y1) this.nsel.add(i); });
    this.draw();
    const g = this.g, [sx0, sy0] = this.toS(x0, y0), [sx1, sy1] = this.toS(x1, y1);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.fillStyle = 'rgba(255,43,0,.08)'; g.strokeStyle = RED; g.lineWidth = 1;
    g.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0); g.strokeRect(sx0 + 0.5, sy0 + 0.5, sx1 - sx0, sy1 - sy0);
  }
}
