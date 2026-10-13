// Circuit Designer: RUNOFF (R), PAINT › Shape. Runoff exactly where you want it, drawn with a pen: a shape of nodes
// (grass, paved or gravel), each a sharp corner or a smooth curve with handles, kept in track.paint as
// { kind, area: true, r, nodes, pts }: nodes, [x, z] or [x, z, { hi, ho }] (handles in from the node before / out to
// the next, [dx, dz] from it); pts, its outline worked out from them (what runoff.js strokeDist and the game read).
// It can be reshaped, repainted or removed any time. Brush strokes can be picked here too, to repaint or remove them.
//   click: a sharp node; click and drag: a smooth one, its handles pulled out as you drag (click the first node,
//   double-click, or Enter to close it; Esc stops)
//   click a shape or stroke: pick it; drag a node / a handle / the shape; double-click an edge for a node; DEL removes
import { PAINTS } from './track.js';
import { strokeDist } from './runoff.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const KINDS = ['grass', 'paved', 'gravel'];
const EDGE = 0.3; // (a shape's edge: soft over this many metres)
const r1 = (v) => +v.toFixed(1), r2 = (v) => +v.toFixed(2);

// a shape's nodes (an old one only has its outline: those are its nodes, all sharp)
export const shapeNodes = (st) => st.nodes || st.pts;
// one edge, node k to the next: its points from node k up to (not including) the next node, straight, or a cubic
// Bezier wherever either end has a handle, a point every ~1 m
function edgePts(nodes, k) {
  const n = nodes.length, a = nodes[k], b = nodes[(k + 1) % n], ho = a[2] && a[2].ho, hi = b[2] && b[2].hi, out = [[r1(a[0]), r1(a[1])]];
  if (!ho && !hi) return out;
  const c1 = ho ? [a[0] + ho[0], a[1] + ho[1]] : [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
  const c2 = hi ? [b[0] + hi[0], b[1] + hi[1]] : [b[0] + (a[0] - b[0]) / 3, b[1] + (a[1] - b[1]) / 3];
  const len = Math.hypot(c1[0] - a[0], c1[1] - a[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(b[0] - c2[0], b[1] - c2[1]);
  const m = Math.max(2, Math.min(80, Math.ceil(len)));
  for (let q = 1; q < m; q++) {
    const t = q / m, u = 1 - t, A = u * u * u, B = 3 * u * u * t, C = 3 * u * t * t, D = t * t * t;
    out.push([r1(A * a[0] + B * c1[0] + C * c2[0] + D * b[0]), r1(A * a[1] + B * c1[1] + C * c2[1] + D * b[1])]);
  }
  return out;
}
// its outline (closed: back round to the first node; open: one being drawn, ending at its last node)
export function shapeOutline(nodes, closed = true) {
  const n = nodes.length; if (!n) return [];
  if (closed && !nodes.some(p => p[2])) return nodes.map(p => [p[0], p[1]]);
  const out = [];
  for (let k = 0; k < (closed ? n : n - 1); k++) out.push(...edgePts(nodes, k));
  if (!closed) out.push([r1(nodes[n - 1][0]), r1(nodes[n - 1][1])]);
  return out;
}
// (after any change to its nodes)
function reshape(st) {
  if (st.nodes && st.nodes.some(p => p[2])) st.pts = shapeOutline(st.nodes);
  else { if (st.nodes) st.pts = st.nodes.map(p => [p[0], p[1]]); delete st.nodes; }
}
// the handles a smooth node gets when it's made smooth: along the line from the node before to the one after
function autoHandles(nodes, k) {
  const n = nodes.length, a = nodes[(k - 1 + n) % n], b = nodes[(k + 1) % n], dx = (b[0] - a[0]) / 6, dz = (b[1] - a[1]) / 6;
  return { hi: [r2(-dx), r2(-dz)], ho: [r2(dx), r2(dz)] };
}

export function installPaintShapes(Ed) {
  const P = Ed.prototype;

  // the picked shape's (or the one being drawn's) node k: its handles on the map
  P.shapeHandles = function (nodes, k) {
    const p = nodes[k], o = p && p[2]; if (!o) return [];
    return ['hi', 'ho'].filter(e => o[e]).map(end => ({ end, x: p[0] + o[end][0], z: p[1] + o[end][1] }));
  };
  P.shapeHit = function (wx, wz, sx, sy) {
    const list = this.track.paint, sel = list[this.paintSel];
    if (sel && sel.area) {
      const N = shapeNodes(sel);
      if (this.paintNode >= 0) for (const h of this.shapeHandles(N, this.paintNode)) { const [px, py] = this.w2s(h.x, h.z); if (Math.hypot(px - sx, py - sy) < 8) return { n: this.paintSel, node: this.paintNode, handle: h.end }; }
      for (let k = 0; k < N.length; k++) { const [px, py] = this.w2s(N[k][0], N[k][1]); if (Math.hypot(px - sx, py - sy) < 9) return { n: this.paintSel, node: k }; }
    }
    // (the last painted is on top)
    for (let n = list.length - 1; n >= 0; n--) {
      const st = list[n]; if (!(st.pts || []).length || !(st.area || KINDS.includes(st.kind))) continue;
      if (strokeDist(st, wx, wz) <= (st.area ? Math.max(0.5, 4 / this.view.scale) : st.r || 8)) return { n, node: -1 };
    }
    return null;
  };
  P.shapeDown = function (wx, wz, sx, sy) {
    const dr = this.shapeDraw;
    if (dr) { // drawing one: a node (drag for its handles), or close it on its first node
      const [fx, fy] = this.w2s(dr.pts[0][0], dr.pts[0][1]);
      if (dr.pts.length >= 3 && Math.hypot(fx - sx, fy - sy) < 10) return this.shapeClose();
      dr.pts.push([r1(wx), r1(wz)]); sfx.move(); this.dirty = true;
      this.drag = { type: 'shape', pen: true, k: dr.pts.length - 1, wx, wz };
      return;
    }
    const h = this.shapeHit(wx, wz, sx, sy);
    if (h) {
      this.paintSel = h.n; this.paintNode = h.node; this.renderPaintTab(); this.dirty = true; sfx.move();
      const st = this.track.paint[h.n];
      if (st.area) { if (!st.nodes) st.nodes = st.pts.map(p => [p[0], p[1]]); this.drag = { type: 'shape', n: h.n, node: h.node, handle: h.handle, wx, wz, orig: st.nodes.map(p => [p[0], p[1], ...(p[2] ? [{ ...p[2] }] : [])]), moved: false }; }
      return;
    }
    if (this.paintSel >= 0) { this.paintSel = -1; this.paintNode = -1; this.renderPaintTab(); this.dirty = true; return; }
    this.shapeDraw = { pts: [[r1(wx), r1(wz)]] }; this.dirty = true;
    this.drag = { type: 'shape', pen: true, k: 0, wx, wz };
  };
  P.shapeMove = function (wx, wz) {
    const d = this.drag;
    if (d.pen) { // pulling out a new node's handles: out along the drag, in the opposite way
      const dr = this.shapeDraw, p = dr && dr.pts[d.k]; if (!p) return;
      const dx = wx - p[0], dz = wz - p[1];
      if (Math.hypot(dx, dz) * this.view.scale < 4) { p.length = 2; this.dirty = true; return; }
      p[2] = { ho: [r2(dx), r2(dz)], hi: [r2(-dx), r2(-dz)] }; this.dirty = true; return;
    }
    const st = this.track.paint[d.n]; if (!st) return;
    if (!d.moved) { if (Math.hypot(wx - d.wx, wz - d.wz) < 0.2) return; this.push(); d.moved = true; }
    const N = st.nodes;
    if (d.handle) {
      // a handle: the other turns to match, keeping its length (Shift: this one alone)
      const p = N[d.node], o = p[2] ||= {}, h = [r2(wx - p[0]), r2(wz - p[1])], other = d.handle === 'ho' ? 'hi' : 'ho';
      o[d.handle] = h;
      if (o[other] && !this.shiftDown) { const lh = Math.hypot(...h) || 1, lo = Math.hypot(...o[other]); o[other] = [r2(-h[0] * lo / lh), r2(-h[1] * lo / lh)]; }
    } else if (d.node >= 0) { const p = N[d.node]; N[d.node] = p[2] ? [r1(wx), r1(wz), p[2]] : [r1(wx), r1(wz)]; }
    else st.nodes = d.orig.map(([x, z, o]) => (o ? [r1(x + wx - d.wx), r1(z + wz - d.wz), o] : [r1(x + wx - d.wx), r1(z + wz - d.wz)]));
    st.pts = shapeOutline(st.nodes);
    this.dirty = true;
  };
  P.shapeUp = function (d) {
    if (d.pen) return;
    const st = this.track.paint[d.n]; if (st && st.area) reshape(st);
    if (d.moved) { this.changed(); this.scheduleScenery(0); this.renderPaintTab(); }
  };
  P.shapeClose = function () {
    const dr = this.shapeDraw; this.shapeDraw = null;
    if (!dr || dr.pts.length < 3) { this.dirty = true; return; }
    this.push();
    const st = { kind: KINDS.includes(this.paintKind) ? this.paintKind : 'gravel', area: true, r: EDGE, nodes: dr.pts, pts: [] };
    reshape(st);
    this.track.paint.push(st);
    this.paintSel = this.track.paint.length - 1; this.paintNode = -1;
    sfx.place(); this.changed(); this.renderPaintTab(); this.scheduleScenery(0);
  };
  P.shapeDbl = function (wx, wz) {
    if (this.shapeDraw) { if (this.shapeDraw.pts.length > 3) this.shapeDraw.pts.pop(); return this.shapeClose(); } // (the double-click's own click added a node)
    const st = this.track.paint[this.paintSel]; if (!st || !st.area) return;
    const N = st.nodes || (st.nodes = st.pts.map(p => [p[0], p[1]]));
    // a node on the nearest edge
    let edge = -1, bd = Math.max(1, 8 / this.view.scale);
    for (let k = 0; k < N.length; k++) {
      const E = [...edgePts(N, k), N[(k + 1) % N.length]];
      for (let q = 0; q + 1 < E.length; q++) {
        const [ax, az] = E[q], dx = E[q + 1][0] - ax, dz = E[q + 1][1] - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wz - az) * dz) / L2));
        const d = Math.hypot(wx - ax - dx * t, wz - az - dz * t); if (d < bd) { bd = d; edge = k; }
      }
    }
    if (edge < 0) { reshape(st); return; }
    this.push(); N.splice(edge + 1, 0, [r1(wx), r1(wz)]); this.paintNode = edge + 1; reshape(st); sfx.place(); this.changed(); this.renderPaintTab(); this.scheduleScenery(0);
  };
  P.shapeKey = function (e) {
    if (this.shapeDraw && (e.code === 'Enter' || e.code === 'NumpadEnter')) { this.shapeClose(); return true; }
    if (this.shapeDraw && e.code === 'Escape') { this.shapeDraw = null; this.dirty = true; return true; }
    if ((e.code === 'Delete' || e.code === 'Backspace') && this.paintSel >= 0) { this.shapeDelete(); return true; }
    return false;
  };
  P.shapeDelete = function () {
    const st = this.track.paint[this.paintSel]; if (!st) return;
    this.push();
    const N = st.area ? shapeNodes(st) : null;
    if (st.area && this.paintNode >= 0 && N.length > 3) { st.nodes = N; N.splice(this.paintNode, 1); this.paintNode = -1; reshape(st); }
    else { this.track.paint.splice(this.paintSel, 1); this.paintSel = -1; this.paintNode = -1; }
    sfx.del(); this.changed(); this.renderPaintTab(); this.scheduleScenery(0);
  };
  // the picked node: sharp (handles off) or smooth (handles along its neighbours)
  P.shapeNodeKind = function (smooth) {
    const st = this.track.paint[this.paintSel]; if (!st || !st.area || this.paintNode < 0) return;
    this.push();
    const N = st.nodes || (st.nodes = st.pts.map(p => [p[0], p[1]])), p = N[this.paintNode];
    if (smooth) p[2] = autoHandles(N, this.paintNode); else p.length = 2;
    reshape(st); sfx.move(); this.changed(); this.renderPaintTab(); this.scheduleScenery(0);
  };

  // ---- the map: the picked one outlined (a shape with its nodes and the picked node's handles), the one being drawn ----
  const drawHandles = (c, ed, nodes, k, col) => {
    const p = nodes[k]; if (!p) return;
    const [nx, ny] = ed.w2s(p[0], p[1]);
    for (const h of ed.shapeHandles(nodes, k)) {
      const [hx, hy] = ed.w2s(h.x, h.z);
      c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.moveTo(nx, ny); c.lineTo(hx, hy); c.stroke();
      c.beginPath(); c.arc(hx, hy, 5, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.strokeStyle = '#000'; c.stroke();
    }
  };
  P.drawShapeEdit = function (c) {
    if (this.tool !== 'paint' || this.paintMode !== 'shape') return;
    const st = this.track.paint[this.paintSel];
    if (st) {
      c.strokeStyle = '#ffd34a'; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath();
      if (st.area) { st.pts.forEach((p, k) => { const q = this.w2s(p[0], p[1]); k ? c.lineTo(...q) : c.moveTo(...q); }); c.closePath(); }
      else { c.lineWidth = Math.max(2, (st.r || 8) * 2 * this.view.scale); c.globalAlpha = 0.35; st.pts.forEach((p, k) => { const q = this.w2s(p[0], p[1]); k ? c.lineTo(...q) : c.moveTo(...q); }); }
      c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      if (st.area) {
        const N = shapeNodes(st);
        if (this.paintNode >= 0) drawHandles(c, this, N, this.paintNode, '#ffd34a');
        N.forEach((p, k) => {
          const [px, py] = this.w2s(p[0], p[1]); c.fillStyle = k === this.paintNode ? '#ff2b00' : '#ffd34a'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
          // (a smooth node round, a sharp one square)
          if (p[2]) { c.beginPath(); c.arc(px, py, 5, 0, Math.PI * 2); c.fill(); c.stroke(); } else { c.fillRect(px - 4.5, py - 4.5, 9, 9); c.strokeRect(px - 4.5, py - 4.5, 9, 9); }
        });
      }
    }
    const dr = this.shapeDraw;
    if (dr) {
      const col = (PAINTS[this.paintKind] || PAINTS.gravel).color;
      // (so far, and on to the mouse; closing back to the first node once there are three)
      const open = shapeOutline(dr.pts, false);
      c.fillStyle = col; c.strokeStyle = '#ffd34a'; c.lineWidth = 2; c.beginPath();
      open.forEach((p, k) => { const q = this.w2s(p[0], p[1]); k ? c.lineTo(...q) : c.moveTo(...q); });
      if (this.mouse.inside && !(this.drag && this.drag.pen)) c.lineTo(this.mouse.x, this.mouse.y);
      if (dr.pts.length > 1) { c.globalAlpha = 0.6; c.fill(); c.globalAlpha = 1; } c.stroke();
      drawHandles(c, this, dr.pts, dr.pts.length - 1, '#ffd34a');
      dr.pts.forEach((p, k) => { const [px, py] = this.w2s(p[0], p[1]); c.fillStyle = k === 0 ? '#ff2b00' : '#ffd34a'; if (p[2]) { c.beginPath(); c.arc(px, py, 4.5, 0, Math.PI * 2); c.fill(); } else c.fillRect(px - 4, py - 4, 8, 8); });
    }
  };

  // ---- the panel (PAINT in Shape mode, or RUNOFF) ----
  P.renderShapePanel = function (modeHtml) {
    const el = $('tab-node'), t = this.track, st = t.paint[this.paintSel], kind = st ? st.kind : KINDS.includes(this.paintKind) ? this.paintKind : 'gravel';
    const shapes = t.paint.filter(s => s.area).length, N = st && st.area ? shapeNodes(st) : null, node = N && this.paintNode >= 0 ? N[this.paintNode] : null;
    el.innerHTML = `
      <h4>${st ? (st.area ? 'SHAPE' : 'BRUSH STROKE') + ' · ' + PAINTS[st.kind].label.toUpperCase() : 'RUNOFF · SHAPE'}</h4>
      ${modeHtml}
      <div class="fld"><label>Surface</label><div class="seg" id="ps-kind">${KINDS.map(k => `<button data-v="${k}" class="${kind === k ? 'on' : ''}">${PAINTS[k].label}</button>`).join('')}</div></div>
      ${node ? `<div class="fld"><label>Node ${this.paintNode + 1} of ${N.length}</label><div class="seg" id="ps-nk"><button data-v="0" class="${node[2] ? '' : 'on'}">Sharp Corner</button><button data-v="1" class="${node[2] ? 'on' : ''}">Smooth Curve</button></div></div>` : ''}
      ${st ? `<div class="seg" style="margin-top:8px">${node && N.length > 3 ? '<button id="ps-delnode">Delete Node</button>' : ''}<button id="ps-front">Bring To Front</button><button id="ps-del">Delete</button><button id="ps-done">Done</button></div>
      <p class="muted">${st.area ? `${N.length} nodes. Drag a node to move it, a round handle to bend the curve (Shift: one handle alone), the shape to move it all. Double-click an edge for another node.` : 'A brush stroke: repaint it or delete it.'} Where two overlap, the one painted later wins: Bring To Front puts this one on top.</p>`
      : `<p class="muted"><b>Click</b> for a sharp corner, <b>click and drag</b> for a smooth curve (the drag pulls out its handles), round the area you want. Click the first node, double-click or press Enter to finish (Esc stops). It's ${PAINTS[kind].label.toLowerCase()} exactly inside the line: past the barrier, the barrier moves back to take it in.<br><br><b>Click</b> any shape or brush stroke to pick it, then change it here.</p>`}
      <p class="muted" style="margin-top:12px">${shapes} shape${shapes === 1 ? '' : 's'}.</p>`;
    el.querySelectorAll('#ps-kind button').forEach(b => b.addEventListener('click', () => {
      sfx.move();
      if (st) { this.push(); st.kind = b.dataset.v; this.changed(); this.scheduleScenery(0); } else this.paintKind = b.dataset.v;
      this.renderPaintTab(); this.dirty = true;
    }));
    el.querySelectorAll('#ps-nk button').forEach(b => b.addEventListener('click', () => this.shapeNodeKind(b.dataset.v === '1')));
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
    on('ps-delnode', () => this.shapeDelete());
    on('ps-del', () => { this.paintNode = -1; this.shapeDelete(); });
    on('ps-front', () => { this.push(); t.paint.splice(this.paintSel, 1); t.paint.push(st); this.paintSel = t.paint.length - 1; sfx.move(); this.changed(); this.renderPaintTab(); this.scheduleScenery(0); });
    on('ps-done', () => { this.paintSel = -1; this.paintNode = -1; sfx.move(); this.renderPaintTab(); this.dirty = true; });
    this.bindPaintMode();
  };
}
