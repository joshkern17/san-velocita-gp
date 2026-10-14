// Circuit Designer: the BARRIERS tool (0). Every barrier is a line of nodes beside one side of the track
// (track.dress.barriers, js/track.js): each node is how far along the lap and how far out from the track edge, so the
// barriers follow the track when it's reshaped. A track that's never had its barriers edited shows the ones it works
// out itself; the first edit turns those into its own.
//   click a barrier: pick it (its nodes show); drag a node to move it, the barrier itself to move it in or out
//   double-click a barrier: a new node there;  drag anywhere beside the track: a new barrier along your drag
//   DEL: the picked node (or the barrier, if it's down to two)
// A stretch either side of a node you've moved runs straight across the ground to the next node (a wall cut across a
// corner), not along the track's curve; the picked node's handles bend it. Follow The Track puts it back.
import { WALL_TYPES, autoBarriers, nodeU, barrierLine, trackFrame } from './track.js';
import { sfx } from './audio.js';
import { evenBarriers } from './evenbarriers.js';

const $ = (id) => document.getElementById(id);
const norm = (d, L) => ((d % L) + L) % L;
const TYPES = ['concrete', 'armco', 'tires', 'fence'];
const COL = { concrete: '#e8e4da', armco: '#8fd0ff', tires: '#ff4a3a', fence: '#f2d24a' };

// a barrier's offset (m out from the edge) u m along it from its first node, or null past its ends
export function offAt(b, u, L) {
  const P = b.pts, U = nodeU(P, L);
  for (let k = 1; k < P.length; k++) {
    const up = U[k - 1], uk = U[k];
    if (u <= uk + 1e-6) { const f = uk > up ? (u - up) / (uk - up) : 0; return P[k - 1][1] + (P[k][1] - P[k - 1][1]) * Math.max(0, Math.min(1, f)); }
  }
  return null;
}
export const lenOf = (b, L) => { const U = nodeU(b.pts, L); return U[U.length - 1]; };
// barriers on this side with [a, b] (m along the lap) taken out: cut short or split, a node put where each is cut
export function cutBarriers(list, a, b, side, L) {
  const out = [];
  for (const w of list) {
    if (w.side !== side) { out.push(w); continue; }
    const d0 = w.pts[0][0], len = lenOf(w, L), ca = norm(a - d0, L), cb = ca + norm(b - a, L);
    // the kept spans of [0, len] (in u from its start)
    let keep = [[0, len]];
    for (const [x0, x1] of [[ca, cb], [ca - L, cb - L]]) keep = keep.flatMap(([p, q]) => (x1 <= p || x0 >= q ? [[p, q]] : [...(x0 > p ? [[p, x0]] : []), ...(x1 < q ? [[x1, q]] : [])]));
    for (const [p, q] of keep) {
      if (q - p < 2) continue;
      const pts = [[norm(d0 + p, L), offAt(w, p, L)]];
      const U = nodeU(w.pts, L);
      w.pts.forEach((n, k) => { const u = U[k]; if (u > p + 0.1 && u < q - 0.1) pts.push(n.length > 2 ? [n[0], n[1], n[2]] : [n[0], n[1]]); });
      pts.push([norm(d0 + q, L), offAt(w, q, L)]);
      out.push({ ...w, pts: pts.map(([d, o, x]) => (x ? [+d.toFixed(1), +o.toFixed(2), x] : [+d.toFixed(1), +o.toFixed(2)])) });
    }
  }
  return out;
}

export function installBarrierTool(Ed) {
  const P = Ed.prototype;

  P.barsOwn = function () { return !!(this.track.dress && Array.isArray(this.track.dress.barriers)); };
  // the barriers as they are (worked out from the track until the first edit)
  P.barList = function () {
    if (this.barsOwn()) return this.track.dress.barriers;
    if (!this._autoBars || this._autoBarsA !== this.A) { this._autoBars = this.A && this.T ? autoBarriers(this.T, this.A, this.track.env) : []; this._autoBarsA = this.A; }
    return this._autoBars;
  };
  P.barsEditable = function () {
    if (!this.barsOwn()) { const l = this.barList().map(b => ({ ...b, pts: b.pts.map(p => [p[0], p[1]]) })); this.track.dress = { ...(this.track.dress || {}), barriers: l }; }
    return this.track.dress.barriers;
  };
  P.barWide = true; // (Even Out: wider on the outside of the corners)
  P.barEvenDist = function () { return this._barEvenDist ?? Math.round(this.track.env.runoff || 14); };
  P.barNewType = function () { return (this.barType ??= this.track.env.barrier && TYPES.includes(this.track.env.barrier) ? this.track.env.barrier : 'armco'); };

  // a node's spot on the map
  P.barXZ = function (side, d, off) {
    const T = this.T, u = norm(d, T.L) / T.ds, i = Math.floor(u) % T.N, j = (i + 1) % T.N, f = u - Math.floor(u);
    const L = (a, b) => a + (b - a) * f, s = side * (L(T.W[i], T.W[j]) / 2 + off);
    return [L(T.X[i], T.X[j]) + L(T.RX[i], T.RX[j]) * s, L(T.Z[i], T.Z[j]) + L(T.RZ[i], T.RZ[j]) * s];
  };
  // the line it draws (a point every sample), for the map and picking
  P.barLine = function (b) {
    const T = this.T, L = T.L, len = lenOf(b, L), d0 = b.pts[0][0], out = [], D = { pts: barrierLine(b, T) };
    for (let u = 0; u <= len + 0.01; u += T.ds) out.push(this.barXZ(b.side, d0 + u, offAt(D, u, L)));
    if (len % T.ds > 0.01) out.push(this.barXZ(b.side, b.pts[b.pts.length - 1][0], b.pts[b.pts.length - 1][1]));
    return out;
  };
  // the picked node's handles (only where the stretch beside it runs free): [{ end: 'ho' | 'hi', x, z, own }]
  P.barHandles = function (b, k) {
    const out = [], P = b.pts, p = P[k]; if (!p) return out;
    const at = (q) => { const [x, z] = this.barXZ(b.side, q[0], q[1]); return { x, z, F: trackFrame(this.T, q[0]) }; };
    const A = at(p), o = p[2] || {};
    for (const [end, nb, free] of [['ho', P[k + 1], o.f], ['hi', P[k - 1], P[k - 1] && P[k - 1][2] && P[k - 1][2].f]]) {
      if (!nb || !free) continue;
      const h = o[end];
      if (h) out.push({ end, x: A.x + A.F.fx * h[0] + A.F.rx * b.side * h[1], z: A.z + A.F.fz * h[0] + A.F.rz * b.side * h[1], own: true });
      else { const B = at(nb); out.push({ end, x: A.x + (B.x - A.x) / 3, z: A.z + (B.z - A.z) / 3, own: false }); }
    }
    return out;
  };
  P.hitBarrier = function (sx, sy) {
    const list = this.barList(), sel = list[this.barSel];
    if (sel && this.barNode >= 0) for (const h of this.barHandles(sel, this.barNode)) {
      const [px, py] = this.w2s(h.x, h.z);
      if (Math.hypot(px - sx, py - sy) < 8) return { n: this.barSel, node: this.barNode, handle: h.end };
    }
    if (sel) for (let k = 0; k < sel.pts.length; k++) {
      const [x, z] = this.barXZ(sel.side, ...sel.pts[k]), [px, py] = this.w2s(x, z);
      if (Math.hypot(px - sx, py - sy) < 9) return { n: this.barSel, node: k };
    }
    let best = null, bd = 9;
    list.forEach((b, n) => {
      const line = this.barLine(b);
      for (let k = 0; k + 1 < line.length; k++) {
        const [ax, ay] = this.w2s(...line[k]), [bx, by] = this.w2s(...line[k + 1]);
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / l2));
        const d = Math.hypot(sx - ax - dx * t, sy - ay - dy * t);
        if (d < bd) { bd = d; best = { n, node: -1 }; }
      }
    });
    return best;
  };

  P.barDown = function (wx, wz, sx, sy) {
    const h = this.hitBarrier(sx, sy), s = this.kerbSpot(wx, wz);
    if (h) {
      const b = this.barList()[h.n];
      this.barSel = h.n; this.barNode = h.node; this.renderNodeTab(); sfx.move(); this.dirty = true;
      this.drag = { type: 'bar', dClick: s.d, mode: h.handle ? 'handle' : h.node >= 0 ? 'node' : 'move', handle: h.handle, n: h.n, node: h.node, out0: s.out, side: b.side, orig: b.pts.map(p => [...p]), moved: false };
      return;
    }
    if (s.out < 0 || s.out > 120) { this.barSel = -1; this.barNode = -1; this.renderNodeTab(); this.dirty = true; return; }
    this.drag = { type: 'bar', dClick: s.d, mode: 'new', side: s.side, trail: [[s.d, s.out]], d0: s.d };
  };
  P.barMove = function (wx, wz) {
    const d = this.drag, T = this.T, L = T.L, s = this.kerbSpot(wx, wz, d.last ?? d.dClick);
    d.last = s.d;
    // (the side it's on: a point over on the other side counts as just off the edge)
    const out = s.side === d.side ? s.out : -s.out - T.W[s.i];
    if (d.mode === 'new') {
      const last = d.trail[d.trail.length - 1];
      if (s.side === d.side && Math.abs(((s.d - last[0] + L * 1.5) % L) - L / 2) > 1) d.trail.push([s.d, Math.max(0.3, s.out)]);
      this.dirty = true; return;
    }
    if (!d.moved) { this.push(); d.moved = true; }
    const b = this.barsEditable()[d.n];
    if (d.mode === 'move') { const dd = out - d.out0; b.pts = d.orig.map(([q, o, x]) => (x ? [q, +Math.max(0.3, o + dd).toFixed(2), x] : [q, +Math.max(0.3, o + dd).toFixed(2)])); }
    else if (d.mode === 'handle') {
      // as [m along, m out] from the node, in the track's frame there; the other handle turns to match (Shift: this one alone)
      const k = d.node, p = b.pts[k], o = p[2] ||= {}, F = trackFrame(T, p[0]), [nx, nz] = this.barXZ(b.side, p[0], p[1]);
      const dx = wx - nx, dz = wz - nz, h = [+(dx * F.fx + dz * F.fz).toFixed(2), +((dx * F.rx + dz * F.rz) * b.side).toFixed(2)];
      o[d.handle] = h;
      const other = d.handle === 'ho' ? 'hi' : 'ho', freeOther = other === 'ho' ? o.f : b.pts[k - 1] && b.pts[k - 1][2] && b.pts[k - 1][2].f;
      if (freeOther && !this.shiftDown) {
        const lh = Math.hypot(...h) || 1, prev = o[other], lo = prev ? Math.hypot(...prev) : lh;
        o[other] = [+(-h[0] * lo / lh).toFixed(2), +(-h[1] * lo / lh).toFixed(2)];
      }
    }
    else {
      // a node stays between its neighbours (the first can be dragged back past where it was)
      const k = d.node, pts = b.pts, d0 = d.orig[0][0], UO = nodeU(d.orig, L), uo = (q) => UO[q];
      let u = k === 0 ? ((s.d - d0 + L * 1.5) % L) - L / 2 : norm(s.d - d0, L);
      const ua = k > 0 ? uo(k - 1) + 0.5 : -L / 2, ub = k < pts.length - 1 ? uo(k + 1) - 0.5 : L - 2;
      u = Math.max(ua, Math.min(ub, u));
      pts[k] = [+norm(d0 + u, L).toFixed(1), +Math.max(0.3, out).toFixed(2), pts[k][2] || {}];
      // (moved by hand: the stretches either side run straight to the next nodes, not along the track's curve)
      pts[k][2].f = 1; if (k > 0) { const q = pts[k - 1]; (q[2] ||= {}).f = 1; }
      if (k === pts.length - 1) delete pts[k][2].f;
    }
    this.barLive();
  };
  P.barUp = function (d) {
    const L = this.T.L;
    if (d.mode === 'new') {
      const tr = d.trail;
      const len = tr.reduce((s, p, k) => (k ? s + Math.abs(((p[0] - tr[k - 1][0] + L * 1.5) % L) - L / 2) : 0), 0);
      if (tr.length < 2 || len < 4) { this.barSel = -1; this.barNode = -1; this.renderNodeTab(); this.dirty = true; return; }
      // (in lap order: a drag the wrong way round is turned round)
      const fw = norm(tr[tr.length - 1][0] - tr[0][0], L) <= L / 2, pts = fw ? tr : [...tr].reverse();
      // fewest nodes that follow your drag to 0.4 m
      const u = pts.map(p => norm(p[0] - pts[0][0], L)), keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
      const rdp = (a, b) => { let bi = -1, bd = 0.4; for (let n = a + 1; n < b; n++) { const f = (u[n] - u[a]) / Math.max(1e-6, u[b] - u[a]), e = Math.abs(pts[n][1] - (pts[a][1] + (pts[b][1] - pts[a][1]) * f)); if (e > bd) { bd = e; bi = n; } } if (bi >= 0) { keep[bi] = 1; rdp(a, bi); rdp(bi, b); } };
      rdp(0, pts.length - 1);
      const nb = { side: d.side, type: this.barNewType(), pts: pts.filter((_, n) => keep[n]).map(([q, o]) => [+q.toFixed(1), +o.toFixed(2)]) };
      this.push();
      const list = cutBarriers(this.barsEditable(), nb.pts[0][0], nb.pts[nb.pts.length - 1][0], nb.side, L);
      this.track.dress.barriers = [...list, nb]; this.barSel = list.length; this.barNode = -1;
      sfx.place(); this.changed(); this.renderNodeTab();
      return;
    }
    if (d.moved) { this.changed(); this.renderNodeTab(); }
  };
  // does a stretch beside node k run free?
  P.barFree = function (b, k) { const P = b.pts; return !!((P[k] && P[k][2] && P[k][2].f && k < P.length - 1) || (P[k - 1] && P[k - 1][2] && P[k - 1][2].f)); };
  P.barLive = function () {
    if (this._barRaf) return;
    this._barRaf = requestAnimationFrame(() => { this._barRaf = 0; this.recompute(); this.dirty = true; });
  };
  P.barDbl = function (wx, wz) {
    const sx = this.mouse.x, sy = this.mouse.y, h = this.hitBarrier(sx, sy);
    if (!h || h.node >= 0) return false;
    this.push();
    const list = this.barsEditable(), b = list[h.n], L = this.T.L, s = this.kerbSpot(wx, wz), d0 = b.pts[0][0], u = norm(s.d - d0, L), U = nodeU(b.pts, L);
    let k = 1; while (k < b.pts.length && U[k] < u) k++;
    const free = b.pts[k - 1][2] && b.pts[k - 1][2].f;
    b.pts.splice(k, 0, free ? [+s.d.toFixed(1), +offAt({ pts: barrierLine(b, this.T) }, u, L).toFixed(2), { f: 1 }] : [+s.d.toFixed(1), +offAt(b, u, L).toFixed(2)]);
    this.barSel = h.n; this.barNode = k; sfx.place(); this.changed(); this.renderNodeTab();
    return true;
  };
  P.barDelete = function () {
    const list = this.barList(); if (!(this.barSel >= 0 && list[this.barSel])) return false;
    this.push();
    const own = this.barsEditable(), b = own[this.barSel];
    if (this.barNode >= 0 && b.pts.length > 2) { b.pts.splice(this.barNode, 1); this.barNode = -1; }
    else { own.splice(this.barSel, 1); this.barSel = -1; this.barNode = -1; }
    sfx.del(); this.changed(); this.renderNodeTab(); return true;
  };

  // ---- the map: the picked barrier outlined with its nodes; a new one as you drag it ----
  P.drawBarrierEdit = function (c) {
    if (this.tool !== 'bars' || !this.T) return;
    const list = this.barList(), sel = list[this.barSel];
    // every barrier in its type's color, its ends marked (a split shows as two)
    if (this._barLinesA !== this.A || this._barLinesL !== list) { this._barLines = new WeakMap(); this._barLinesA = this.A; this._barLinesL = list; }
    const lineOf = (b) => { let l = this._barLines.get(b); if (!l || l.pts !== b.pts) { l = { pts: b.pts, line: this.barLine(b) }; this._barLines.set(b, l); } return l.line; };
    for (const b of list) {
      if (b === sel || b.pts.length < 2) continue;
      const line = lineOf(b);
      c.strokeStyle = COL[b.type] || '#c8ccd4'; c.lineWidth = 2; c.globalAlpha = 0.85; c.beginPath(); line.forEach((p, k) => { const q = this.w2s(...p); k ? c.lineTo(...q) : c.moveTo(...q); }); c.stroke(); c.globalAlpha = 1;
      for (const p of [line[0], line[line.length - 1]]) { const [px, py] = this.w2s(...p); c.fillStyle = COL[b.type] || '#c8ccd4'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, 4, 0, Math.PI * 2); c.fill(); c.stroke(); }
    }
    if (sel) {
      const line = this.barLine(sel);
      c.strokeStyle = '#ffd34a'; c.lineWidth = 5; c.globalAlpha = 0.55; c.beginPath(); line.forEach((p, k) => { const q = this.w2s(...p); k ? c.lineTo(...q) : c.moveTo(...q); }); c.stroke(); c.globalAlpha = 1;
      if (this.barNode >= 0) {
        const [nx, ny] = this.w2s(...this.barXZ(sel.side, sel.pts[this.barNode][0], sel.pts[this.barNode][1]));
        for (const h of this.barHandles(sel, this.barNode)) {
          const [hx, hy] = this.w2s(h.x, h.z);
          c.strokeStyle = '#ffd34a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(nx, ny); c.lineTo(hx, hy); c.stroke();
          c.beginPath(); c.arc(hx, hy, 5, 0, Math.PI * 2); c.fillStyle = h.own ? '#ffd34a' : '#1a1a1a'; c.fill(); c.strokeStyle = h.own ? '#000' : '#ffd34a'; c.stroke();
        }
      }
      sel.pts.forEach((p, k) => { const [px, py] = this.w2s(...this.barXZ(sel.side, p[0], p[1])); c.fillStyle = k === this.barNode ? '#ff2b00' : '#ffd34a'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.fillRect(px - 4.5, py - 4.5, 9, 9); c.strokeRect(px - 4.5, py - 4.5, 9, 9); });
    }
    const d = this.drag;
    if (d && d.type === 'bar' && d.mode === 'new' && d.trail.length > 1) {
      c.strokeStyle = COL[this.barNewType()]; c.lineWidth = 3; c.setLineDash([6, 4]); c.beginPath();
      d.trail.forEach(([q, o], k) => { const p = this.w2s(...this.barXZ(d.side, q, o)); k ? c.lineTo(...p) : c.moveTo(...p); });
      c.stroke(); c.setLineDash([]);
    }
  };

  // ---- the panel ----
  P.renderBarrierTab = function () {
    const el = $('tab-node'), list = this.barList(), b = this.barSel >= 0 ? list[this.barSel] : null, own = this.barsOwn(), L = this.T ? this.T.L : 1;
    const type = b ? b.type : this.barNewType(), node = b && this.barNode >= 0 ? b.pts[this.barNode] : null;
    const total = list.reduce((s, q) => s + lenOf(q, L), 0);
    el.innerHTML = `
      <h4>${b ? `BARRIER · ${b.side < 0 ? 'LEFT' : 'RIGHT'} · ${lenOf(b, L).toFixed(0)} M` : 'NEW BARRIERS'}</h4>
      <div class="fld"><label>Type</label><div class="seg" id="br-type">${TYPES.map(k => `<button data-v="${k}" class="${type === k ? 'on' : ''}"><i style="display:inline-block;width:10px;height:10px;margin-right:6px;vertical-align:middle;background:${COL[k]}"></i>${WALL_TYPES[k].label}</button>`).join('')}</div></div>
      ${node ? `<div class="fld"><label>Node ${this.barNode + 1} of ${b.pts.length} · Out From The Edge<span id="br-out-v">${node[1].toFixed(1)}m</span></label><input type="range" id="br-out" min="0.3" max="60" step="0.1" value="${node[1]}"></div>
      <p class="muted" style="margin-top:-4px">${node[0].toFixed(0)} m round the lap. ${this.barFree(b, this.barNode) ? 'Runs straight to the next node: drag the round handles to bend it (Shift: one handle alone).' : 'Follows the track\'s curve: drag the node and it runs straight instead.'}</p>
      <div class="seg">${this.barFree(b, this.barNode) ? '<button id="br-straight">Straighten</button><button id="br-follow">Follow The Track</button>' : '<button id="br-free">Run Straight</button>'}</div>` : ''}
      ${b ? `<div class="seg" style="margin-top:8px">${node && this.barNode > 0 && this.barNode < b.pts.length - 1 ? '<button id="br-split">Split Here</button>' : ''}${node ? '<button id="br-delnode">Delete Node</button>' : ''}<button id="br-del">Delete Barrier</button><button id="br-done">Done</button></div>` : ''}
      <p class="muted" style="margin-top:12px">${list.length} barrier${list.length === 1 ? '' : 's'}, ${total.toFixed(0)} m${own ? '' : ' (worked out from the track: edit any and they become this track\'s own)'}. ${b ? 'Drag a node to move it, the barrier to move it all in or out. Double-click the barrier for another node.' : 'Drag beside the track to put up a barrier where you drag. Click one to change it.'} Where there's no barrier, cars run on until the world's edge.</p>
      ${b ? '' : `<div class="fld" style="margin-top:12px"><label>Even Out · Distance From The Edge<span id="br-even-v">${this.barEvenDist().toFixed(0)}m</span></label><input type="range" id="br-even-d" min="2" max="40" step="1" value="${this.barEvenDist()}"></div>
      <p class="muted" style="margin-top:-4px">Replaces every barrier with one down each side, this far from the track edge all the way round (further out on the outside of the corners, if you like), with as few nodes as keep it smooth (closer in only where it can't fit). Each node has handles, so dragging one keeps the barrier smooth.</p>
      <div class="fld"><label>At Corners</label><div class="seg" id="br-wide"><button data-v="1" class="${this.barWide ? 'on' : ''}">Wider Outside</button><button data-v="0" class="${this.barWide ? '' : 'on'}">Even</button></div></div>
      <div class="seg"><button id="br-even">Even Out All</button></div>`}
      ${own ? `<div class="seg"><button id="br-auto">Back To Automatic</button><button id="br-clear">Remove All</button></div>` : `<div class="seg"><button id="br-clear">Remove All</button></div>`}`;
    el.querySelectorAll('#br-type button').forEach(btn => btn.addEventListener('click', () => {
      sfx.move();
      if (b) { this.push(); this.barsEditable()[this.barSel].type = btn.dataset.v; this.changed(); } else this.barType = btn.dataset.v;
      this.renderBarrierTab();
    }));
    const out = $('br-out');
    if (out) {
      out.addEventListener('input', () => { $('br-out-v').textContent = (+out.value).toFixed(1) + 'm'; if (!this._brSlide) { this.push(); this._brSlide = true; } this.barsEditable()[this.barSel].pts[this.barNode][1] = +out.value; this.barLive(); });
      out.addEventListener('change', () => { this._brSlide = false; this.changed(); });
    }
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
    on('br-split', () => {
      // (two barriers that meet at the node: each its own copy of it, the first ending there, the second starting there;
      // the second one picked, so you see both)
      this.push(); const own = this.barsEditable(), w = own[this.barSel], k = this.barNode;
      const copy = (p) => (p[2] ? [p[0], p[1], { ...p[2] }] : [p[0], p[1]]);
      const a = w.pts.slice(0, k + 1).map(copy), b = w.pts.slice(k).map(copy);
      const end = a[a.length - 1][2]; if (end) { delete end.f; delete end.ho; }
      const st = b[0][2]; if (st) delete st.hi;
      own.splice(this.barSel, 1, { ...w, pts: a }, { ...w, pts: b });
      this.barSel++; this.barNode = 0; sfx.place(); this.changed(); this.renderBarrierTab(); this.toast('SPLIT INTO 2 BARRIERS');
    });
    on('br-delnode', () => this.barDelete());
    // the picked node's stretches: straight (handles off), back along the track, or free
    const nodeEdit = (fn) => () => { this.push(); const w = this.barsEditable()[this.barSel], k = this.barNode; fn(w.pts, k); sfx.move(); this.changed(); this.renderBarrierTab(); };
    on('br-straight', nodeEdit((P, k) => { const o = P[k][2]; if (o) { delete o.ho; delete o.hi; } }));
    on('br-follow', nodeEdit((P, k) => { for (const q of [P[k - 1], P[k]]) if (q && q[2]) { delete q[2].f; delete q[2].ho; delete q[2].hi; if (!Object.keys(q[2]).length) q.length = 2; } }));
    on('br-free', nodeEdit((P, k) => { if (k < P.length - 1) (P[k][2] ||= {}).f = 1; if (k > 0) (P[k - 1][2] ||= {}).f = 1; }));
    on('br-del', () => { this.barNode = -1; this.barDelete(); });
    on('br-done', () => { this.barSel = -1; this.barNode = -1; sfx.move(); this.renderBarrierTab(); this.dirty = true; });
    on('br-auto', () => { this.push(); delete this.track.dress.barriers; this.barSel = -1; this.barNode = -1; sfx.del(); this.changed(true); this.toast('BARRIERS BACK TO AUTOMATIC'); });
    const ev = $('br-even-d');
    if (ev) ev.addEventListener('input', () => { this._barEvenDist = +ev.value; $('br-even-v').textContent = ev.value + 'm'; });
    el.querySelectorAll('#br-wide button').forEach(btn => btn.addEventListener('click', () => { this.barWide = btn.dataset.v === '1'; sfx.move(); this.renderBarrierTab(); }));
    on('br-even', () => {
      if (!this.T) return;
      // (the type most of the barriers are now, else the circuit's own)
      const n = {}; for (const q of list) n[q.type] = (n[q.type] || 0) + lenOf(q, L);
      const type = Object.keys(n).sort((a, c) => n[c] - n[a])[0] || this.barNewType();
      const { barriers, stats } = evenBarriers(this.T, this.A, this.track.env, { dist: this.barEvenDist(), type, wide: this.barWide ? 1 : 0 });
      this.push(); this.track.dress = { ...(this.track.dress || {}), barriers }; this.barSel = -1; this.barNode = -1;
      sfx.place(); this.changed(true); this.toast(`BARRIERS EVENED OUT · ${stats.reduce((s, q) => s + q.nodes, 0)} NODES`);
    });
    on('br-clear', () => { this.push(); this.track.dress = { ...(this.track.dress || {}), barriers: [] }; this.barSel = -1; this.barNode = -1; sfx.del(); this.changed(true); this.toast('ALL BARRIERS REMOVED'); });
  };
}
