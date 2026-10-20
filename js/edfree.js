// Circuit Designer: the BARRIERS tool (0), free barriers (track.dress.free, js/freebar.js). A barrier is a line of
// nodes on the ground, anywhere: it bends smoothly through each one (or turns sharply at a corner node).
//   click a barrier: pick it (its nodes show); drag a node to move it anywhere; drag the picked barrier's line to bend
//     it there (a new node); Shift+drag the picked barrier to move all of it
//   drag on open ground: a new barrier along your drag;  click, click, click...: one node at a time (Enter, Esc or a
//     double-click finishes it; click its first node to close it into a loop)
//   drop an end node on another barrier's end: they join;  on its own first node: a loop
//   double-click a node: corner / smooth;  double-click the line: a new node;  X: a gap under the cursor
//   DEL: the picked node (or the barrier, if it's down to two);  Shift+DEL: the barrier
// OUTLINE THE TRACK (panel) puts one barrier all the way round the track and its pit lane, this far from the road.
// Until the first edit the barriers shown are the ones the track works out itself; the first edit makes them its own.
import { WALL_TYPES, wallTypeAt } from './track.js';
import { freeLine, freeLen, outlineTrack, freeFromTrack, simplifyLine } from './freebar.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const TYPES = ['concrete', 'armco', 'tires', 'fence'];
const COL = { concrete: '#e8e4da', armco: '#8fd0ff', tires: '#ff4a3a', fence: '#f2d24a' };
const HIT = 9, SNAP = 14; // (px: how near a node or line counts as on it; how near an end snaps to another)
const r1 = (v) => +v.toFixed(1);

export function installFreeBarrierTool(Ed) {
  const P = Ed.prototype;

  P.barsOwn = function () { return !!(this.track.dress && Array.isArray(this.track.dress.free)); };
  // the barriers as they are: the track's own free ones, else what it has now as free ones (until the first edit)
  P.barList = function () {
    if (this.barsOwn()) return this.track.dress.free;
    if (!this._autoBars || this._autoBarsA !== this.A) {
      const T = this.T, A = this.A, env = this.track.env;
      this._autoBars = T && A ? freeFromTrack(T, A, (i, s) => wallTypeAt(A, i, s, env)) : [];
      this._autoBarsA = A;
    }
    return this._autoBars;
  };
  P.barsEditable = function () {
    if (!this.barsOwn()) {
      const l = this.barList().map(b => ({ ...b, pts: b.pts.map(p => [...p]) }));
      const d = { ...(this.track.dress || {}), free: l }; delete d.barriers; delete d.walls;
      this.track.dress = d;
    }
    return this.track.dress.free;
  };
  P.barNewType = function () { return (this.barType ??= this.track.env.barrier && TYPES.includes(this.track.env.barrier) ? this.track.env.barrier : 'armco'); };
  P.barOutlineDist = function () { return this._barOutline ?? Math.max(2, Math.min(30, Math.round(this.track.env.runoff || 8))); };

  // the line a barrier draws (cached till its nodes change), with which node each point comes after
  P.barLine = function (b) {
    const sig = b.pts.length + ':' + (b.loop ? 1 : 0) + ':' + b.pts.map(p => p[0] + ',' + p[1] + (p[2] ? 'c' : '')).join(';');
    const c = (this._barLines ||= new WeakMap()).get(b);
    if (c && c.sig === sig) return c;
    const spans = [], line = freeLine(b, spans), out = { sig, line, spans };
    this._barLines.set(b, out); return out;
  };
  // how far (x, z) is from the road's edge (negative: on it), and the nearest bit of track
  P.barRoadDist = function (x, z) {
    const T = this.T, A = this.A; if (!T || !A) return { d: 99, i: -1 };
    let bd = 1e18, bi = -1;
    A.hash.query(x, z, 90, (j) => { const d = Math.hypot(x - T.X[j], z - T.Z[j]) - T.W[j] / 2; if (d < bd) { bd = d; bi = j; } });
    return { d: bi < 0 ? 99 : bd, i: bi };
  };

  // what's under the cursor: a node of the picked barrier, else any barrier's line (and where on it)
  P.hitBarrier = function (sx, sy) {
    const list = this.barList(), sel = list[this.barSel];
    if (sel) for (let k = 0; k < sel.pts.length; k++) {
      const [px, py] = this.w2s(sel.pts[k][0], sel.pts[k][1]);
      if (Math.hypot(px - sx, py - sy) < HIT) return { n: this.barSel, node: k };
    }
    let best = null, bd = HIT;
    list.forEach((b, n) => {
      const { line, spans } = this.barLine(b);
      let prev = this.w2s(...line[0]);
      for (let k = 0; k + 1 < line.length; k++) {
        const nxt = this.w2s(...line[k + 1]), dx = nxt[0] - prev[0], dy = nxt[1] - prev[1], l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((sx - prev[0]) * dx + (sy - prev[1]) * dy) / l2)), d = Math.hypot(sx - prev[0] - dx * t, sy - prev[1] - dy * t);
        const dd = n === this.barSel ? d - 3 : d; // (the picked one wins a near tie)
        if (dd < bd) {
          bd = dd;
          best = { n, node: -1, span: spans[k], at: [line[k][0] + (line[k + 1][0] - line[k][0]) * t, line[k][1] + (line[k + 1][1] - line[k][1]) * t] };
        }
        prev = nxt;
      }
    });
    return best;
  };
  // an end of some barrier (not `skip`'s end `skipEnd`) within SNAP px of the screen point: { n, end: 0 | 1 } or null
  P.barEndNear = function (sx, sy, skipN = -1, skipEnd = -1) {
    let best = null, bd = SNAP;
    this.barList().forEach((b, n) => {
      if (b.loop || b.pts.length < 2) return;
      for (const end of [0, 1]) {
        if (n === skipN && end === skipEnd) continue;
        const p = b.pts[end ? b.pts.length - 1 : 0], [px, py] = this.w2s(p[0], p[1]), d = Math.hypot(px - sx, py - sy);
        if (d < bd) { bd = d; best = { n, end }; }
      }
    });
    return best;
  };
  P.barHover = function (sx, sy) {
    if (!this.T) return;
    const h = this.barPen ? null : this.hitBarrier(sx, sy), k = h ? h.n + ':' + h.node : '';
    if (k !== this._barHoverK) { this._barHoverK = k; this.barHoverHit = h; }
    this.dirty = true;
  };
  P.barPick = function (n, node = -1) { this.barSel = n; this.barNode = node; this.renderNodeTab(); this.dirty = true; };

  // ---- the mouse ----
  P.barDown = function (wx, wz, sx, sy) {
    if (this.barPen) return this.barPenClick(wx, wz, sx, sy);
    const h = this.hitBarrier(sx, sy);
    if (h) {
      const was = this.barSel === h.n;
      this.barSel = h.n; this.barNode = h.node; sfx.move(); this.dirty = true;
      const b = this.barList()[h.n];
      if (h.node >= 0) this.drag = { type: 'bar', mode: 'node', n: h.n, node: h.node, sx, sy, moved: false };
      else if (was && this.shiftDown) this.drag = { type: 'bar', mode: 'move', n: h.n, w0: [wx, wz], orig: b.pts.map(p => [...p]), sx, sy, moved: false };
      else if (was) this.drag = { type: 'bar', mode: 'bend', n: h.n, span: h.span, at: h.at, sx, sy, moved: false };
      this.renderNodeTab();
      return;
    }
    // open ground: a new barrier (a drag draws it; a click starts placing nodes one at a time, unless it was only to
    // let go of the picked one)
    const had = this.barSel >= 0;
    this.barSel = -1; this.barNode = -1; this.renderNodeTab(); this.dirty = true;
    this.drag = { type: 'bar', mode: 'new', sx, sy, trail: [[wx, wz]], moved: false, had };
  };
  P.barMove = function (wx, wz) {
    const d = this.drag, sx = this.mouse.x, sy = this.mouse.y;
    if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
    if (d.mode === 'new') {
      d.moved = true;
      const last = d.trail[d.trail.length - 1];
      if (Math.hypot(wx - last[0], wz - last[1]) > Math.max(0.5, 3 / this.view.scale)) d.trail.push([wx, wz]);
      this.dirty = true; return;
    }
    if (!d.moved) {
      this.push(); d.moved = true;
      if (d.mode === 'bend') { // (a new node where you grabbed the line, and that's what you drag)
        const b = this.barsEditable()[d.n], k = d.span + 1;
        b.pts.splice(k, 0, [r1(d.at[0]), r1(d.at[1])]);
        d.mode = 'node'; d.node = k; this.barNode = k;
      }
    }
    const b = this.barsEditable()[d.n];
    if (d.mode === 'node') {
      const p = b.pts[d.node];
      let x = wx, z = wz;
      // (an end over another end: it snaps there, and joins it when you let go)
      d.snap = null;
      const end = b.loop ? -1 : d.node === 0 ? 0 : d.node === b.pts.length - 1 ? 1 : -1;
      if (end >= 0 && !this.shiftDown) {
        const e = this.barEndNear(sx, sy, d.n, end);
        if (e) { const q = this.barList()[e.n].pts[e.end ? this.barList()[e.n].pts.length - 1 : 0]; x = q[0]; z = q[1]; d.snap = e; }
      }
      p[0] = r1(x); p[1] = r1(z);
      this.barNode = d.node;
    } else if (d.mode === 'move') {
      const dx = wx - d.w0[0], dz = wz - d.w0[1];
      b.pts = d.orig.map(p => { const q = [r1(p[0] + dx), r1(p[1] + dz)]; if (p[2]) q.push(p[2]); return q; });
    }
    this.dirty = true;
  };
  P.barUp = function (d) {
    if (d.mode === 'new') {
      if (!d.moved) { if (!d.had) this.barPenClick(d.trail[0][0], d.trail[0][1], d.sx, d.sy); return; }
      const tr = d.trail; if (freeLen(tr) < 3) { this.dirty = true; return; }
      // (as few smooth nodes as follow your drag to 0.5 m)
      const pts = simplifyLine(tr, Math.max(0.5, 2 / this.view.scale));
      this.barAdd(pts, d.sx, d.sy);
      return;
    }
    if (!d.moved) return;
    if (d.mode === 'node' && d.snap) this.barJoin(d.n, d.node === 0 ? 0 : 1, d.snap);
    this.changed(); this.renderNodeTab();
  };
  // a new barrier with these nodes (its ends joining any barrier's end they were dropped on)
  P.barAdd = function (pts, sx0, sy0) {
    this.push();
    const list = this.barsEditable(), b = { type: this.barNewType(), pts: pts.map(p => [r1(p[0]), r1(p[1])]) };
    list.push(b);
    let n = list.length - 1;
    const atEnd = this.barEndNear(...this.w2s(...pts[pts.length - 1]), n, 1);
    if (atEnd) n = this.barJoin(n, 1, atEnd);
    if (!list[n].loop) { const atStart = this.barEndNear(...this.w2s(...list[n].pts[0]), n, 0); if (atStart) n = this.barJoin(n, 0, atStart); }
    this.barSel = n; this.barNode = -1;
    sfx.place(); this.changed(); this.renderNodeTab();
    this.toast(`BARRIER ${freeLen(this.barLine(list[n]).line).toFixed(0)} M`);
  };
  // barrier n's end (0: first node, 1: last) joined to another's end (or its own other end: a loop); returns the
  // joined barrier's index
  P.barJoin = function (n, end, to) {
    const list = this.barsEditable(), a = list[n];
    if (to.n === n) { if (end === 0) a.pts.shift(); else a.pts.pop(); a.loop = 1; sfx.place(); this.toast('CLOSED INTO A LOOP'); return n; }
    const b = list[to.n];
    // (a's end meets b's end: one barrier, a then b, the shared node once)
    let A = a.pts.map(p => [...p]), B = b.pts.map(p => [...p]);
    if (end === 0) A.reverse();
    if (to.end === 1) B.reverse();
    const joined = { ...b, type: a.type, pts: [...A, ...B.slice(1)] };
    const keep = Math.min(n, to.n);
    list.splice(Math.max(n, to.n), 1); list[keep] = joined;
    sfx.place(); this.toast('BARRIERS JOINED');
    return keep;
  };
  // placing nodes one click at a time
  P.barPenClick = function (wx, wz, sx, sy) {
    const pen = this.barPen;
    if (!pen) { this.barPen = { pts: [[wx, wz]] }; this.setHint(); this.dirty = true; sfx.move(); return; }
    const first = pen.pts[0], [fx, fy] = this.w2s(...first);
    if (pen.pts.length >= 3 && Math.hypot(fx - sx, fy - sy) < SNAP) { this.barPenFinish(true); return; }
    const last = pen.pts[pen.pts.length - 1], [lx, ly] = this.w2s(...last);
    if (Math.hypot(lx - sx, ly - sy) < 5) { this.barPenFinish(); return; } // (the same spot twice: done)
    pen.pts.push([wx, wz]); sfx.move(); this.dirty = true;
  };
  P.barPenFinish = function (loop = false) {
    const pen = this.barPen; this.barPen = null; this.setHint();
    if (!pen || pen.pts.length < 2) { this.dirty = true; return; }
    if (loop) {
      this.push(); const list = this.barsEditable();
      list.push({ type: this.barNewType(), pts: pen.pts.map(p => [r1(p[0]), r1(p[1])]), loop: 1 });
      this.barSel = list.length - 1; this.barNode = -1; sfx.place(); this.changed(); this.renderNodeTab(); this.toast('BARRIER LOOP'); return;
    }
    this.barAdd(pen.pts);
  };
  // keys the tool takes (true if it took it): Enter / Esc finish placing nodes; X opens a gap
  P.barKey = function (e) {
    if (this.barPen && (e.code === 'Enter' || e.code === 'Escape')) { this.barPenFinish(); return true; }
    if (e.code === 'KeyX' && !(e.ctrlKey || e.metaKey)) { this.barGap(); return true; }
    if ((e.code === 'Delete' || e.code === 'Backspace') && e.shiftKey && this.barSel >= 0) { this.barNode = -1; this.barDelete(); return true; }
    return false;
  };
  // a 5 m gap in the barrier under the cursor (a loop opens there; a line splits in two)
  P.barGap = function () {
    const h = this.hitBarrier(this.mouse.x, this.mouse.y);
    if (!h || h.node >= 0) { this.toast('POINT AT A BARRIER TO OPEN A GAP IN IT'); sfx.error && sfx.error(); return; }
    this.push();
    const list = this.barsEditable(), b = list[h.n], { line } = this.barLine(b);
    // (the line's points either side of the gap: the barrier keeps its shape up to it)
    let ci = 0, cd = 1e18; line.forEach((p, k) => { const d = Math.hypot(p[0] - h.at[0], p[1] - h.at[1]); if (d < cd) { cd = d; ci = k; } });
    const U = [0]; for (let k = 1; k < line.length; k++) U.push(U[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
    const u0 = U[ci] - 2.5, u1 = U[ci] + 2.5, total = U[U.length - 1];
    const part = (a, c) => simplifyLine(line.filter((_, k) => U[k] >= a && U[k] <= c), 0.3).map(p => [r1(p[0]), r1(p[1])]);
    let parts;
    if (b.loop) parts = [simplifyLine([...line.filter((_, k) => U[k] >= u1), ...line.filter((_, k) => U[k] <= u0)], 0.3).map(p => [r1(p[0]), r1(p[1])])];
    else parts = [part(0, u0), part(u1, total)];
    parts = parts.filter(p => p.length >= 2 && freeLen(p) > 1.5).map(pts => ({ type: b.type, pts }));
    list.splice(h.n, 1, ...parts);
    this.barSel = -1; this.barNode = -1; sfx.del(); this.changed(); this.renderNodeTab(); this.toast('GAP OPENED');
  };
  P.barDbl = function (wx, wz) {
    if (this.barPen) { this.barPenFinish(); return true; }
    const h = this.hitBarrier(this.mouse.x, this.mouse.y); if (!h) return false;
    this.push();
    const b = this.barsEditable()[h.n];
    if (h.node >= 0) { const p = b.pts[h.node]; if (p[2]) p.length = 2; else p[2] = 1; this.barSel = h.n; this.barNode = h.node; this.toast(p[2] ? 'CORNER NODE' : 'SMOOTH NODE'); }
    else { b.pts.splice(h.span + 1, 0, [r1(h.at[0]), r1(h.at[1])]); this.barSel = h.n; this.barNode = h.span + 1; }
    sfx.place(); this.changed(); this.renderNodeTab();
    return true;
  };
  P.barDelete = function () {
    const list = this.barList(); if (!(this.barSel >= 0 && list[this.barSel])) return false;
    this.push();
    const own = this.barsEditable(), b = own[this.barSel];
    if (this.barNode >= 0 && b.pts.length > (b.loop ? 3 : 2)) { b.pts.splice(this.barNode, 1); this.barNode = -1; }
    else { own.splice(this.barSel, 1); this.barSel = -1; this.barNode = -1; }
    sfx.del(); this.changed(); this.renderNodeTab(); return true;
  };
  // the picked barrier pushed out from the road (or in) by dd m, each node along the way out from the nearest road
  P.barPush = function (orig, dd) {
    const b = this.barsEditable()[this.barSel], T = this.T;
    b.pts = orig.map(p => {
      const { i } = this.barRoadDist(p[0], p[1]); if (i < 0) return [...p];
      const dx = p[0] - T.X[i], dz = p[1] - T.Z[i], l = Math.hypot(dx, dz) || 1, q = [r1(p[0] + dx / l * dd), r1(p[1] + dz / l * dd)];
      if (p[2]) q.push(p[2]); return q;
    });
  };

  // ---- the map (and the 3D view: drawn through its camera) ----
  P.drawBarrierEdit = function (c) {
    if (this.tool !== 'bars' || !this.T) return;
    const list = this.barList(), sel = list[this.barSel], hov = this.barHoverHit;
    const path = (line) => { c.beginPath(); line.forEach((p, k) => { const q = this.w2s(p[0], p[1]); k ? c.lineTo(...q) : c.moveTo(...q); }); };
    c.lineJoin = 'round'; c.lineCap = 'round';
    list.forEach((b, n) => {
      const { line } = this.barLine(b), on = b === sel, hv = hov && hov.n === n && !on;
      // (black under, its type's color over: picked, wider and amber)
      c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = on ? 8 : hv ? 6 : 4.5; path(line); c.stroke();
      c.strokeStyle = on ? '#ffd34a' : COL[b.type] || '#c8ccd4'; c.lineWidth = on ? 4 : hv ? 3.5 : 2.5; path(line); c.stroke();
      // (too near the road, or across it: red there)
      c.strokeStyle = '#ff2b00'; c.lineWidth = on ? 4 : 2.5;
      let run = false;
      for (let k = 0; k < line.length; k++) {
        const near = this.barRoadDist(line[k][0], line[k][1]).d < 0.5, q = this.w2s(line[k][0], line[k][1]);
        if (near && !run) { c.beginPath(); c.moveTo(...q); run = true; } else if (near) c.lineTo(...q); else if (run) { c.lineTo(...q); c.stroke(); run = false; }
      }
      if (run) c.stroke();
      if (!b.loop) for (const p of [b.pts[0], b.pts[b.pts.length - 1]]) { const [px, py] = this.w2s(p[0], p[1]); c.fillStyle = on ? '#ffd34a' : COL[b.type] || '#c8ccd4'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, on ? 4 : 3.5, 0, Math.PI * 2); c.fill(); c.stroke(); }
    });
    if (sel) sel.pts.forEach((p, k) => {
      const [px, py] = this.w2s(p[0], p[1]), act = k === this.barNode, hv = hov && hov.n === this.barSel && hov.node === k;
      c.fillStyle = act ? '#ff2b00' : hv ? '#fff2b0' : '#ffd34a'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      const r = act || hv ? 6 : 4.5;
      if (p[2]) { c.fillRect(px - r, py - r, r * 2, r * 2); c.strokeRect(px - r, py - r, r * 2, r * 2); } // (corner: square)
      else { c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill(); c.stroke(); } // (smooth: round)
    });
    // the line you'd bend: a ghost node where you'd grab it
    if (hov && hov.node < 0 && hov.n === this.barSel && !this.drag) { const [px, py] = this.w2s(...hov.at); c.strokeStyle = '#ffd34a'; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, 5, 0, Math.PI * 2); c.stroke(); }
    // what you're drawing: the drag, or the nodes placed so far and the next one at the cursor
    const d = this.drag, col = COL[this.barNewType()];
    const ghost = (pts) => { c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 5; path(pts); c.stroke(); c.strokeStyle = col; c.lineWidth = 3; c.setLineDash([7, 5]); path(pts); c.stroke(); c.setLineDash([]); };
    if (d && d.type === 'bar' && d.mode === 'new' && d.moved && d.trail.length > 1) ghost(d.trail);
    if (this.barPen) {
      const m = this.s2w(this.mouse.x, this.mouse.y), pts = [...this.barPen.pts, m];
      ghost(freeLine({ pts }));
      this.barPen.pts.forEach((p, k) => { const [px, py] = this.w2s(p[0], p[1]); c.fillStyle = k === 0 && this.barPen.pts.length >= 3 ? '#fff' : col; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, k === 0 ? 6 : 4.5, 0, Math.PI * 2); c.fill(); c.stroke(); });
    }
    // while a node moves: how far it is from the road (red when it's on it)
    const lab = (d && d.type === 'bar' && d.mode === 'node' && d.moved && sel) ? sel.pts[d.node] : null;
    if (lab) {
      const { d: dist } = this.barRoadDist(lab[0], lab[1]), [px, py] = this.w2s(lab[0], lab[1]);
      const txt = d.snap ? 'JOIN' : dist < 0 ? 'ON THE ROAD' : `${dist.toFixed(1)} M FROM THE ROAD`;
      c.font = '600 12px "Helvetica Now Display", Helvetica, Arial, sans-serif'; const w = c.measureText(txt).width + 12;
      c.fillStyle = 'rgba(0,0,0,0.8)'; c.fillRect(px + 12, py - 26, w, 20); c.fillStyle = dist < 0.5 && !d.snap ? '#ff2b00' : '#ffd34a'; c.fillText(txt, px + 18, py - 12);
      if (d.snap) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(px, py, 10, 0, Math.PI * 2); c.stroke(); }
    }
  };

  // ---- the panel ----
  P.renderBarrierTab = function () {
    const el = $('tab-node'), list = this.barList(), b = this.barSel >= 0 ? list[this.barSel] : null, own = this.barsOwn();
    const type = b ? b.type : this.barNewType(), node = b && this.barNode >= 0 ? b.pts[this.barNode] : null;
    const total = list.reduce((s, q) => s + freeLen(this.barLine(q).line), 0);
    const near = b ? Math.min(...this.barLine(b).line.map(p => this.barRoadDist(p[0], p[1]).d)) : 0;
    el.innerHTML = `
      <h4>${b ? `BARRIER · ${freeLen(this.barLine(b).line).toFixed(0)} M${b.loop ? ' · LOOP' : ''}` : 'BARRIERS'}</h4>
      <div class="fld"><label>${b ? 'Type' : 'New Barriers'}</label><div class="seg" id="br-type">${TYPES.map(k => `<button data-v="${k}" class="${type === k ? 'on' : ''}"><i style="display:inline-block;width:10px;height:10px;margin-right:6px;vertical-align:middle;background:${COL[k]}"></i>${WALL_TYPES[k].label}</button>`).join('')}</div></div>
      ${b ? `
      <div class="fld"><label>Push Out From The Road<span id="br-push-v">0.0m</span></label><input type="range" id="br-push" min="-10" max="10" step="0.1" value="0"></div>
      <p class="muted" style="margin-top:-4px">${near < 0.5 ? '<b style="color:#ff2b00">Part of it is on or right by the road (red).</b> ' : `Nearest the road: ${near.toFixed(1)} m. `}Drag a node anywhere. Drag the line to bend it there. Shift+drag moves all of it. Double-click a node for a ${node && node[2] ? 'smooth bend' : 'sharp corner'}; X opens a gap where you point.</p>
      ${node ? `<div class="seg"><button id="br-corner">${node[2] ? 'Smooth Node' : 'Corner Node'}</button>${!b.loop && this.barNode > 0 && this.barNode < b.pts.length - 1 ? '<button id="br-split">Split Here</button>' : ''}<button id="br-delnode">Delete Node</button></div>` : ''}
      <div class="seg" style="margin-top:8px">${b.pts.length > 2 ? `<button id="br-loop">${b.loop ? 'Open The Loop' : 'Close Into A Loop'}</button>` : ''}<button id="br-del">Delete Barrier</button><button id="br-done">Done</button></div>` : `
      <p class="muted">${list.length} barrier${list.length === 1 ? '' : 's'}, ${total.toFixed(0)} m${own ? '' : ' (worked out from the track: edit any and they become this track\'s own)'}. <b>Drag</b> on open ground to draw a barrier, or <b>click</b> node by node (Enter finishes, click the first node for a loop). Drop an end on another barrier's end to join them. Click a barrier to change it.</p>
      <div class="fld" style="margin-top:12px"><label>Outline The Track · From The Road<span id="br-ol-v">${this.barOutlineDist()}m</span></label><input type="range" id="br-ol" min="1" max="40" step="1" value="${this.barOutlineDist()}"></div>
      <p class="muted" style="margin-top:-4px">One barrier all the way round the track and its pit lane, this far from the road: round a hairpin it rounds off, and where two stretches pass closer than twice this, one barrier runs down the middle. Then shape it however you like.</p>
      <div class="seg"><button id="br-outline">${this._barOlArm ? 'Replace All Barriers?' : 'Outline The Track'}</button></div>
      <div class="seg">${own ? '<button id="br-auto">Back To Automatic</button>' : ''}<button id="br-clear">Remove All</button></div>`}`;
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
    el.querySelectorAll('#br-type button').forEach(btn => btn.addEventListener('click', () => {
      sfx.move();
      if (b) { this.push(); this.barsEditable()[this.barSel].type = btn.dataset.v; this.changed(); } else this.barType = btn.dataset.v;
      this.renderBarrierTab(); this.dirty = true;
    }));
    const push = $('br-push');
    if (push) {
      let orig = null;
      push.addEventListener('input', () => { if (!orig) { this.push(); orig = this.barsEditable()[this.barSel].pts.map(p => [...p]); } $('br-push-v').textContent = (+push.value > 0 ? '+' : '') + (+push.value).toFixed(1) + 'm'; this.barPush(orig, +push.value); this.dirty = true; });
      push.addEventListener('change', () => { orig = null; this.changed(); this.renderBarrierTab(); });
    }
    const edit = (fn) => () => { this.push(); fn(this.barsEditable()[this.barSel]); sfx.move(); this.changed(); this.renderBarrierTab(); this.dirty = true; };
    on('br-corner', edit((w) => { const p = w.pts[this.barNode]; if (p[2]) p.length = 2; else p[2] = 1; }));
    on('br-loop', edit((w) => { if (w.loop) delete w.loop; else w.loop = 1; }));
    on('br-split', () => {
      this.push(); const own = this.barsEditable(), w = own[this.barSel], k = this.barNode;
      own.splice(this.barSel, 1, { ...w, pts: w.pts.slice(0, k + 1).map(p => [...p]) }, { ...w, pts: w.pts.slice(k).map(p => [...p]) });
      this.barSel++; this.barNode = 0; sfx.place(); this.changed(); this.renderBarrierTab(); this.toast('SPLIT INTO 2 BARRIERS');
    });
    on('br-delnode', () => this.barDelete());
    on('br-del', () => { this.barNode = -1; this.barDelete(); });
    on('br-done', () => { this.barSel = -1; this.barNode = -1; sfx.move(); this.renderBarrierTab(); this.dirty = true; });
    const ol = $('br-ol');
    if (ol) ol.addEventListener('input', () => { this._barOutline = +ol.value; $('br-ol-v').textContent = ol.value + 'm'; });
    on('br-outline', () => {
      if (!this.T || !this.A) return;
      // (a circuit with barriers of its own: a second press to replace them)
      if (own && list.length && !this._barOlArm) { this._barOlArm = true; sfx.select(); this.renderBarrierTab(); clearTimeout(this._barOlT); this._barOlT = setTimeout(() => { this._barOlArm = false; if (this.tool === 'bars' && this.barSel < 0) this.renderBarrierTab(); }, 3000); return; }
      this._barOlArm = false;
      const out = outlineTrack(this.T, this.A, this.barOutlineDist(), this.barNewType());
      this.push(); const dd = { ...(this.track.dress || {}), free: out }; delete dd.barriers; delete dd.walls; this.track.dress = dd;
      this.barSel = -1; this.barNode = -1; sfx.place(); this.changed(true); this.renderBarrierTab();
      this.toast(`TRACK OUTLINED · ${out.length} BARRIER${out.length === 1 ? '' : 'S'}`);
    });
    on('br-auto', () => { this.push(); const dd = { ...this.track.dress }; delete dd.free; delete dd.barriers; this.track.dress = dd; this.barSel = -1; this.barNode = -1; sfx.del(); this.changed(true); this.toast('BARRIERS BACK TO AUTOMATIC'); });
    on('br-clear', () => { this.push(); const dd = { ...(this.track.dress || {}), free: [] }; delete dd.barriers; delete dd.walls; this.track.dress = dd; this.barSel = -1; this.barNode = -1; sfx.del(); this.changed(true); this.toast('ALL BARRIERS REMOVED'); });
  };
}
