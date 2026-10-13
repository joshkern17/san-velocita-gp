// Circuit Designer: the PIT LANE tool (P). The pit lane exactly where you want it (track.dress.pit, js/track.js
// ownPitLane): its centre line as nodes beside one side of the track, each how far along the lap and how far out from
// the track edge (the first and last a little inside it: where it leaves and rejoins the track), and the stretch along
// it with the garages and the pit wall (the two diamonds). A track that's never had it moved shows the one it works
// out; the first edit makes it its own.
//   drag a node to move it, the lane to move it all in or out, a diamond to move where the garages start / end
//   double-click the lane: a new node;  DEL: the picked node
//   no pit lane: drag beside the track to lay one along your drag
import { pitToOwn, nodeU } from './track.js';
import { offAt, lenOf } from './edbarriers.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const norm = (d, L) => ((d % L) + L) % L;
const IN = -2.2; // (its ends: this far inside the track edge, where it peels off and joins)

export function installPitTool(Ed) {
  const P = Ed.prototype;

  P.pitOwn = function () { return !!(this.track.dress && this.track.dress.pit); };
  // the lane as nodes: its own, else the one the track works out (null: none)
  P.pitNodes = function () {
    if (this.pitOwn()) return this.track.dress.pit;
    if (!this.pit || !this.T) return null;
    if (this._autoPitOf !== this.pit) { this._autoPit = pitToOwn(this.T, this.pit); this._autoPitOf = this.pit; }
    return this._autoPit;
  };
  P.pitEditable = function () {
    if (!this.pitOwn()) { const a = this.pitNodes(); if (!a) return null; this.track.dress = { ...(this.track.dress || {}), pit: { side: a.side, pts: a.pts.map(p => [...p]), main: [...a.main] } }; }
    return this.track.dress.pit;
  };
  // the garages' ends on the lane (m along the lap), as built (its own, else where the track put them)
  P.pitMain = function (o) { return o.main || (this.pit ? [this.T.D[this.pit.mainStart], this.T.D[this.pit.mainEnd]] : null); };

  P.hitPit = function (sx, sy) {
    const o = this.pitNodes(); if (!o) return null;
    const L = this.T.L, sel = this.tool === 'pit';
    if (sel) {
      for (let k = 0; k < o.pts.length; k++) { const [px, py] = this.w2s(...this.barXZ(o.side, ...o.pts[k])); if (Math.hypot(px - sx, py - sy) < 9) return { node: k }; }
      const m = this.pitMain(o);
      if (m) for (const e of [0, 1]) { const u = norm(m[e] - o.pts[0][0], L), [px, py] = this.w2s(...this.barXZ(o.side, m[e], offAt(o, u, L) ?? 0)); if (Math.hypot(px - sx, py - sy) < 11) return { main: e }; }
    }
    const line = this.barLine(o);
    for (let k = 0; k + 1 < line.length; k++) {
      const [ax, ay] = this.w2s(...line[k]), [bx, by] = this.w2s(...line[k + 1]);
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / l2));
      if (Math.hypot(sx - ax - dx * t, sy - ay - dy * t) < Math.max(8, 4.5 * this.view.scale)) return { lane: true };
    }
    return null;
  };

  P.pitDown = function (wx, wz, sx, sy) {
    const h = this.hitPit(sx, sy), s = this.kerbSpot(wx, wz), o = this.pitNodes();
    if (h) {
      this.pitNode = h.node ?? -1; this.renderNodeTab(); this.dirty = true; sfx.move();
      this.drag = { type: 'pit', dClick: s.d, mode: h.node != null ? 'node' : h.main != null ? 'main' : 'move', node: h.node, end: h.main, out0: s.out, side: o.side, orig: o.pts.map(p => [...p]), main0: this.pitMain(o), moved: false };
      return;
    }
    this.pitNode = -1; this.renderNodeTab(); this.dirty = true;
    if (o && this.track.env.pits !== false) return; // (one pit lane: move this one, or remove it to draw another)
    if (s.out < 0 || s.out > 80) return;
    this.drag = { type: 'pit', dClick: s.d, mode: 'new', side: s.side, trail: [[s.d, Math.max(IN, s.out)]] };
  };
  P.pitMove = function (wx, wz) {
    const d = this.drag, T = this.T, L = T.L, s = this.kerbSpot(wx, wz, d.last ?? d.dClick);
    d.last = s.d;
    const out = s.side === d.side ? s.out : -s.out - T.W[s.i];
    if (d.mode === 'new') {
      const last = d.trail[d.trail.length - 1];
      if (s.side === d.side && Math.abs(((s.d - last[0] + L * 1.5) % L) - L / 2) > 2) d.trail.push([s.d, Math.max(0.5, s.out)]);
      this.dirty = true; return;
    }
    if (!d.moved) { this.push(); d.moved = true; }
    const o = this.pitEditable(), d0 = d.orig[0][0];
    if (d.mode === 'move') { const dd = out - d.out0; o.pts = d.orig.map(([q, v], k) => [q, +(k === 0 || k === d.orig.length - 1 ? v : Math.max(0.5, v + dd)).toFixed(2)]); }
    else if (d.mode === 'main') {
      const u = norm(s.d - d0, L), len = lenOf({ pts: d.orig }, L), m = [...d.main0].map(q => norm(q - d0, L));
      m[d.end] = Math.max(4, Math.min(len - 4, u));
      if (m[1] - m[0] >= 20) o.main = m.map(q => +norm(d0 + q, L).toFixed(1));
    } else {
      const k = d.node, UO = nodeU(d.orig, L), uo = (q) => UO[q];
      let u = k === 0 ? ((s.d - d0 + L * 1.5) % L) - L / 2 : norm(s.d - d0, L);
      u = Math.max(k > 0 ? uo(k - 1) + 0.5 : -L / 2, Math.min(k < o.pts.length - 1 ? uo(k + 1) - 0.5 : L - 2, u));
      o.pts[k] = [+norm(d0 + u, L).toFixed(1), +Math.max(-T.W[s.i] / 2 + 1, Math.min(80, out)).toFixed(2)];
      // (the garages stay on the lane)
      if (o.main && (k === 0 || k === o.pts.length - 1)) { const a = o.pts[0][0], len = lenOf(o, L); o.main = o.main.map(q => +norm(a + Math.max(4, Math.min(len - 4, norm(q - a, L))), L).toFixed(1)); }
    }
    this.barLive();
  };
  P.pitUp = function (d) {
    const L = this.T.L;
    if (d.mode === 'new') {
      const tr = d.trail, len = tr.length > 1 ? norm(tr[tr.length - 1][0] - tr[0][0], L) : 0;
      if (tr.length < 3 || len < 80 || len > L / 2) { if (tr.length > 2) this.toast('A PIT LANE NEEDS 80 M OR MORE'); this.dirty = true; return; }
      const fw = norm(tr[tr.length - 1][0] - tr[0][0], L) <= L / 2, pts = fw ? [...tr] : [...tr].reverse();
      // (fewest nodes that follow your drag to 0.5 m; its ends peel off from the track edge)
      const u = pts.map(p => norm(p[0] - pts[0][0], L)), keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
      const rdp = (a, b) => { let bi = -1, bd = 0.5; for (let n = a + 1; n < b; n++) { const f = (u[n] - u[a]) / Math.max(1e-6, u[b] - u[a]), e = Math.abs(pts[n][1] - (pts[a][1] + (pts[b][1] - pts[a][1]) * f)); if (e > bd) { bd = e; bi = n; } } if (bi >= 0) { keep[bi] = 1; rdp(a, bi); rdp(bi, b); } };
      rdp(0, pts.length - 1);
      const P2 = pts.filter((_, n) => keep[n]).map(([q, v]) => [+q.toFixed(1), +v.toFixed(2)]);
      P2[0][1] = IN; P2[P2.length - 1][1] = IN;
      const a = P2[0][0];
      this.push();
      this.track.env.pits = true;
      this.track.dress = { ...(this.track.dress || {}), pit: { side: d.side, pts: P2, main: [+norm(a + len * 0.25, L).toFixed(1), +norm(a + len * 0.82, L).toFixed(1)] } };
      sfx.place(); this.changed(true);
      if (!this.pit) this.toast('THAT PIT LANE DOESN\'T WORK THERE: MOVE ITS NODES OR GARAGES');
      return;
    }
    if (d.moved) { this.changed(); this.renderNodeTab(); }
  };
  P.pitDbl = function () {
    const h = this.hitPit(this.mouse.x, this.mouse.y);
    if (!h || !h.lane) return false;
    this.push();
    const o = this.pitEditable(), L = this.T.L, s = this.kerbSpot(this.mouse.wx, this.mouse.wz), d0 = o.pts[0][0], u = norm(s.d - d0, L), U = nodeU(o.pts, L);
    let k = 1; while (k < o.pts.length && U[k] < u) k++;
    o.pts.splice(k, 0, [+s.d.toFixed(1), +offAt(o, u, L).toFixed(2)]);
    this.pitNode = k; sfx.place(); this.changed(); this.renderNodeTab();
    return true;
  };
  P.pitDelete = function () {
    const o = this.pitNodes(); if (!o || !(this.pitNode >= 0) || o.pts.length <= 2) return false;
    this.push(); this.pitEditable().pts.splice(this.pitNode, 1); this.pitNode = -1; sfx.del(); this.changed(); this.renderNodeTab(); return true;
  };

  // ---- the map: the lane's centre line, its nodes and the garages' diamonds (PIT LANE tool only) ----
  P.drawPitEdit = function (c) {
    if (this.tool !== 'pit' || !this.T) return;
    const o = this.pitNodes(), L = this.T.L;
    if (o) {
      const line = this.barLine(o);
      c.strokeStyle = '#ffd34a'; c.lineWidth = 2; c.setLineDash([8, 5]); c.beginPath(); line.forEach((p, k) => { const q = this.w2s(...p); k ? c.lineTo(...q) : c.moveTo(...q); }); c.stroke(); c.setLineDash([]);
      o.pts.forEach((p, k) => { const [px, py] = this.w2s(...this.barXZ(o.side, ...p)); c.fillStyle = k === this.pitNode ? '#ff2b00' : '#ffd34a'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.fillRect(px - 4.5, py - 4.5, 9, 9); c.strokeRect(px - 4.5, py - 4.5, 9, 9); });
      const m = this.pitMain(o);
      if (m) for (const e of [0, 1]) {
        const u = norm(m[e] - o.pts[0][0], L), [px, py] = this.w2s(...this.barXZ(o.side, m[e], offAt(o, u, L) ?? 0));
        c.fillStyle = '#50d0ff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(px, py - 8); c.lineTo(px + 8, py); c.lineTo(px, py + 8); c.lineTo(px - 8, py); c.closePath(); c.fill(); c.stroke();
      }
    }
    const d = this.drag;
    if (d && d.type === 'pit' && d.mode === 'new' && d.trail.length > 1) {
      c.strokeStyle = '#ffd34a'; c.lineWidth = Math.max(3, 9 * this.view.scale); c.globalAlpha = 0.5; c.beginPath();
      d.trail.forEach(([q, v], k) => { const p = this.w2s(...this.barXZ(d.side, q, v)); k ? c.lineTo(...p) : c.moveTo(...p); });
      c.stroke(); c.globalAlpha = 1;
    }
  };

  // ---- the panel ----
  P.renderPitTab = function () {
    const el = $('tab-node'), o = this.pitNodes(), own = this.pitOwn(), L = this.T ? this.T.L : 1, none = this.track.env.pits === false || !o;
    const node = o && this.pitNode >= 0 ? o.pts[this.pitNode] : null, m = o && this.pitMain(o);
    el.innerHTML = none ? `
      <h4>PIT LANE</h4>
      <p class="muted">${this.track.env.pits === false ? 'This track has no pit lane.' : 'No pit lane fits on its own here.'} <b>Drag</b> beside the track, from where cars should peel off to where they rejoin (80 m or more), to lay one along your drag. Then move its nodes, and the two diamonds: where the garages and pit wall start and end.</p>
      ${own ? `<div class="seg"><button id="pl-auto">Back To Automatic</button></div>` : ''}` : `
      <h4>PIT LANE · ${o.side < 0 ? 'LEFT' : 'RIGHT'} · ${lenOf(o, L).toFixed(0)} M</h4>
      ${this.pit ? `<p class="muted">Leaves the track at ${o.pts[0][0].toFixed(0)} m, rejoins at ${o.pts[o.pts.length - 1][0].toFixed(0)} m. Garages and pit wall from ${m ? m[0].toFixed(0) : '?'} m to ${m ? m[1].toFixed(0) : '?'} m (${this.pit.boxes.length} garages).</p>` : '<p class="warn">! This pit lane doesn\'t work: make it longer, or give the garages more room (drag the diamonds apart).</p>'}
      ${node ? `<div class="fld"><label>Node ${this.pitNode + 1} of ${o.pts.length} · Out From The Edge<span id="pl-out-v">${node[1].toFixed(1)}m</span></label><input type="range" id="pl-out" min="-4" max="60" step="0.1" value="${node[1]}"></div>
      <p class="muted" style="margin-top:-4px">${node[0].toFixed(0)} m round the lap. Below 0 it's on the track: where the lane peels off and joins.</p>
      <div class="seg"><button id="pl-delnode">Delete Node</button><button id="pl-done">Done</button></div>` : ''}
      <p class="muted" style="margin-top:12px">${own ? '' : 'Worked out from the track: move anything and it becomes this track\'s own. '}Drag a node to move it, the lane to move it all in or out, a diamond to move where the garages start or end. Double-click the lane for another node.</p>
      <div class="seg">${own ? '<button id="pl-auto">Back To Automatic</button>' : ''}<button id="pl-none">Remove Pit Lane</button></div>`;
    const out = $('pl-out');
    if (out) {
      out.addEventListener('input', () => { $('pl-out-v').textContent = (+out.value).toFixed(1) + 'm'; if (!this._plSlide) { this.push(); this._plSlide = true; } this.pitEditable().pts[this.pitNode][1] = +out.value; this.barLive(); });
      out.addEventListener('change', () => { this._plSlide = false; this.changed(); this.renderPitTab(); });
    }
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
    on('pl-delnode', () => this.pitDelete());
    on('pl-done', () => { this.pitNode = -1; sfx.move(); this.renderPitTab(); this.dirty = true; });
    on('pl-auto', () => { this.push(); delete this.track.dress.pit; this.track.env.pits = true; this.pitNode = -1; sfx.del(); this.changed(true); this.toast('PIT LANE BACK TO AUTOMATIC'); });
    on('pl-none', () => { this.push(); if (this.track.dress) delete this.track.dress.pit; this.track.env.pits = false; this.pitNode = -1; sfx.del(); this.changed(true); this.toast('PIT LANE REMOVED: DRAG TO LAY A NEW ONE'); });
  };
}
