// Circuit Designer: the CURBS tool (9). Every curb is a stretch of one track edge (track.dress.kerbs, js/track.js) with
// its own colors, profile (raised, flat, sawtooth, sausage), width and tapered ends. A track that has never had its
// curbs edited shows its automatic ones (on every corner); the first edit turns those into its own, to change freely.
//   drag along an edge: a new curb, with the settings on the right
//   click a curb: pick it (the right panel edits it); drag its end squares to stretch it, its body to slide it along
//   DEL removes the picked one
import { KERB_STYLES, KERB_TYPES, KERB_W, kerbOf, kerbW, kerbColors, cutStretches } from './track.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const norm = (d, L) => ((d % L) + L) % L;

export function installKerbTool(Ed) {
  const P = Ed.prototype;

  // the curbs as they are (the automatic ones until the first edit)
  P.kerbList = function () { const d = this.track.dress; return d && d.kerbs && d.kerbs.length ? d.kerbs : (this.A && this.A.kerbs) || []; };
  P.kerbsOwn = function () { const d = this.track.dress; return !!(d && d.kerbs && d.kerbs.length); };
  // (before the first change: the automatic curbs become the track's own)
  P.kerbsEditable = function () {
    const t = this.track;
    t.dress = t.dress || {};
    if (!this.kerbsOwn()) { t.dress.kerbs = ((this.A && this.A.kerbs) || []).map(k => ({ ...k })); t.dress.walls = t.dress.walls || []; }
    return t.dress.kerbs;
  };
  P.kerbNewDefaults = function () { return (this.kerbNew ??= { style: 'rw', c: null, type: 'raised', w: KERB_W, tin: 3, tout: 3 }); };

  // where a world point is against the track: sample, side, m along the lap, m out from the edge. near: m along the
  // lap a drag has got to: only the track within 80 m of it counts (where two parts of the circuit run side by side,
  // the drag stays on the one it's following)
  P.kerbSpot = function (wx, wz, near = null) {
    const T = this.T;
    let i;
    if (near == null) i = this.nearestSample(wx, wz).i;
    else {
      const c = Math.round((((near % T.L) + T.L) % T.L) / T.ds), r = Math.round(80 / T.ds); let bd = Infinity;
      for (let k = -r; k <= r; k++) { const q = ((c + k) % T.N + T.N) % T.N, d = (T.X[q] - wx) ** 2 + (T.Z[q] - wz) ** 2; if (d < bd) { bd = d; i = q; } }
    }
    const lat = (wx - T.X[i]) * T.RX[i] + (wz - T.Z[i]) * T.RZ[i], fw = (wx - T.X[i]) * T.FX[i] + (wz - T.Z[i]) * T.FZ[i];
    return { i, side: lat < 0 ? -1 : 1, d: norm(T.D[i] + fw, T.L), out: Math.abs(lat) - T.W[i] / 2 };
  };
  // a curb's end on the map (the middle of its width there)
  P.kerbEndXZ = function (k, end) {
    const T = this.T, d = end === 'a' ? k.a : k.b, i = Math.round(norm(d, T.L) / T.ds) % T.N, off = k.side * (T.W[i] / 2 + (k.w ?? KERB_W) / 2);
    return [T.X[i] + T.RX[i] * off, T.Z[i] + T.RZ[i] * off];
  };
  P.hitKerb = function (wx, wz, sx, sy) {
    const list = this.kerbList();
    if (this.kerbSel >= 0 && list[this.kerbSel]) for (const end of ['a', 'b']) {
      const [x, z] = this.kerbEndXZ(list[this.kerbSel], end), [px, py] = this.w2s(x, z);
      if (Math.hypot(px - sx, py - sy) < 10) return { n: this.kerbSel, end };
    }
    const s = this.kerbSpot(wx, wz), k = kerbOf(this.A, s.i, s.side);
    if (k && s.out > -0.6 && s.out < kerbW(this.A, s.i, s.side) + Math.max(0.8, 6 / this.view.scale)) return { n: list.indexOf(k) };
    return null;
  };

  P.kerbDown = function (wx, wz, sx, sy) {
    const h = this.hitKerb(wx, wz, sx, sy), s = this.kerbSpot(wx, wz);
    if (h && h.n >= 0) {
      this.kerbSel = h.n; this.renderNodeTab(); sfx.move();
      const k = this.kerbList()[h.n];
      this.drag = { type: 'kerb', mode: h.end || 'move', n: h.n, d0: s.d, a0: k.a, b0: k.b, moved: false };
      return;
    }
    if (s.out < -T_IN(this) || s.out > 10) { this.kerbSel = -1; this.renderNodeTab(); this.dirty = true; return; }
    this.drag = { type: 'kerb', mode: 'new', side: s.side, d0: s.d, a: s.d, b: s.d };
  };
  P.kerbMove = function (wx, wz) {
    const d = this.drag, T = this.T, L = T.L, s = this.kerbSpot(wx, wz, d.last ?? d.d0);
    d.last = s.d;
    if (d.mode === 'new') {
      if (norm(s.d - d.d0, L) <= L / 2) { d.a = d.d0; d.b = s.d; } else { d.a = s.d; d.b = d.d0; }
      this.dirty = true; return;
    }
    const list = this.kerbsEditable(), k = list[d.n]; if (!k) return;
    const delta = ((s.d - d.d0 + L * 1.5) % L) - L / 2;
    if (!d.moved) { if (Math.abs(delta) < 0.5) return; this.push(); d.moved = true; }
    const len0 = norm(d.b0 - d.a0, L);
    if (d.mode === 'move') { k.a = +norm(d.a0 + delta, L).toFixed(1); k.b = +norm(d.b0 + delta, L).toFixed(1); }
    else if (d.mode === 'a') { const nl = len0 - delta; if (nl > 1 && nl < L - 2) k.a = +norm(d.a0 + delta, L).toFixed(1); }
    else { const nl = len0 + delta; if (nl > 1 && nl < L - 2) k.b = +norm(d.b0 + delta, L).toFixed(1); }
    this.kerbLive();
  };
  P.kerbUp = function (d) {
    const L = this.T.L;
    if (d.mode === 'new') {
      if (norm(d.b - d.a, L) < 2) { this.kerbSel = -1; this.renderNodeTab(); this.dirty = true; return; }
      this.push();
      const list = this.kerbsEditable(), nk = { ...this.kerbNewDefaults(), a: +d.a.toFixed(1), b: +d.b.toFixed(1), side: d.side };
      if (!nk.c) delete nk.c;
      this.track.dress.kerbs = [...cutStretches(list, nk.a, nk.b, nk.side, L), nk];
      this.kerbSel = this.track.dress.kerbs.length - 1;
      sfx.place(); this.changed(); this.renderNodeTab();
      return;
    }
    if (d.moved) {
      // (a curb dragged over another on its side takes that bit from it)
      const list = this.track.dress.kerbs, k = list[d.n], rest = cutStretches(list.filter(q => q !== k), k.a, k.b, k.side, L);
      this.track.dress.kerbs = [...rest, k]; this.kerbSel = this.track.dress.kerbs.length - 1;
      this.changed(); this.renderNodeTab();
    }
  };
  // (while dragging: the curbs redone, a frame at a time)
  P.kerbLive = function () {
    if (this._kerbRaf) return;
    this._kerbRaf = requestAnimationFrame(() => { this._kerbRaf = 0; this.recompute(); this.dirty = true; });
  };
  P.kerbDelete = function () {
    const list = this.kerbList(); if (!(this.kerbSel >= 0 && list[this.kerbSel])) return false;
    this.push(); const own = this.kerbsEditable(); own.splice(this.kerbSel, 1);
    // (deleting the last one leaves the track with no curbs at all, not the automatic ones again)
    if (!own.length) this.track.env.kerbs = false;
    this.kerbSel = -1; sfx.del(); this.changed(); this.renderNodeTab(); return true;
  };

  // ---- the map ----
  P.drawKerbs = function (c) {
    const T = this.T, A = this.A; if (!T || !A || !A.KI) return;
    const sc = this.view.scale, on = this.tool === 'kerbs';
    if (sc < 0.25 && !on) return;
    const list = this.kerbList(), sel = on && this.kerbSel >= 0 ? list[this.kerbSel] : null;
    const pt = (i, s) => this.w2s(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s);
    for (const side of [-1, 1]) {
      const si = side < 0 ? 0 : 1;
      for (let i = 0; i < T.N; i++) {
        if (i === T.cut) continue;
        const j = (i + 1) % T.N, ki = A.KI[si][i], kj = A.KI[si][j];
        if (!ki && !kj) continue;
        const k = list[(ki || kj) - 1] || A.kerbs[(ki || kj) - 1]; if (!k) continue;
        const wi = ki === (ki || kj) ? A.KW[si][i] : 0, wj = kj === (ki || kj) ? A.KW[si][j] : kj ? wi : 0;
        const e0 = side * T.W[i] / 2, e1 = side * T.W[j] / 2;
        const q = [pt(i, e0), pt(j, e1), pt(j, e1 + side * wj), pt(i, e0 + side * wi)];
        const cols = kerbColors(k);
        c.fillStyle = Math.floor(T.D[i] / 2) % 2 ? cols[1] : cols[0];
        c.beginPath(); c.moveTo(...q[0]); for (let n = 1; n < 4; n++) c.lineTo(...q[n]); c.closePath(); c.fill();
        if (k.type === 'sausage' && sc > 3) { c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(...pt(i, e0 + side * wi / 2)); c.lineTo(...pt(j, e1 + side * wj / 2)); c.stroke(); }
      }
    }
    if (on && !this.kerbsOwn() && sc > 0.25) { /* (automatic: outlined faintly, so you can tell) */ }
    // the picked one: outlined, with its end squares
    if (sel) {
      const si = sel.side < 0 ? 0 : 1, idx = [];
      for (let i = 0; i < T.N; i++) if (A.kerbs[A.KI[si][i] - 1] === sel || list[A.KI[si][i] - 1] === sel) idx.push(i);
      // (in lap order from its start, across the line too)
      const a = norm(sel.a, T.L); idx.sort((p, q) => norm(T.D[p] - a, T.L) - norm(T.D[q] - a, T.L));
      c.strokeStyle = '#ffd34a'; c.lineWidth = 2;
      for (const off of [0, 1]) { c.beginPath(); idx.forEach((i, n) => { const p = pt(i, sel.side * (T.W[i] / 2 + off * A.KW[si][i] + (off ? 0.3 : -0.3))); n ? c.lineTo(...p) : c.moveTo(...p); }); c.stroke(); }
      for (const end of ['a', 'b']) { const [x, z] = this.kerbEndXZ(sel, end), [px, py] = this.w2s(x, z); c.fillStyle = '#ffd34a'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.fillRect(px - 5, py - 5, 10, 10); c.strokeRect(px - 5, py - 5, 10, 10); }
    }
    // the one being drawn
    const d = this.drag;
    if (on && d && d.type === 'kerb' && d.mode === 'new' && norm(d.b - d.a, T.L) > 0.5) {
      const nk = this.kerbNewDefaults(), w = nk.w, a = d.a, len = norm(d.b - d.a, T.L), cols = nk.c || KERB_STYLES[nk.style].c;
      c.strokeStyle = cols[0]; c.lineWidth = Math.max(3, w * sc); c.setLineDash([Math.max(3, 2 * sc), Math.max(3, 2 * sc)]);
      c.beginPath(); let first = true;
      for (let u = 0; u <= len; u += T.ds) { const i = Math.round(norm(a + u, T.L) / T.ds) % T.N, p = pt(i, d.side * (T.W[i] / 2 + w / 2)); first ? c.moveTo(...p) : c.lineTo(...p); first = false; }
      c.stroke(); c.setLineDash([]);
    }
  };

  // ---- the panel ----
  P.renderKerbTab = function () {
    const el = $('tab-node'), list = this.kerbList(), k = this.kerbSel >= 0 ? list[this.kerbSel] : null, own = this.kerbsOwn();
    const v = k || this.kerbNewDefaults(), cols = kerbColors(v), L = this.T ? this.T.L : 1;
    const total = list.reduce((s, q) => s + norm(q.b - q.a, L), 0);
    const f1 = (id, label, min, max, step, val, unit) => `<div class="fld"><label>${label}<span id="${id}-v">${val}${unit}</span></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
    el.innerHTML = `
      <h4>${k ? `CURB · ${k.side < 0 ? 'LEFT' : 'RIGHT'} · ${norm(k.b - k.a, L).toFixed(0)} M` : 'NEW CURBS'}</h4>
      <div class="fld"><label>Colors<span>${v.c ? 'Your Own' : (KERB_STYLES[v.style] || KERB_STYLES.rw).label}</span></label><div class="seg" id="kb-style">${Object.entries(KERB_STYLES).map(([key, s]) => `<button data-v="${key}" title="${s.label}" class="${!v.c && (v.style || 'rw') === key ? 'on' : ''}"><i style="display:inline-block;width:26px;height:12px;vertical-align:middle;background:repeating-linear-gradient(90deg,${s.c[0]} 0 6.5px,${s.c[1]} 6.5px 13px)"></i></button>`).join('')}</div></div>
      <div class="fld kb-own"><label>Your Own</label><span style="display:flex;gap:6px"><input type="color" id="kb-c1" value="${cols[0]}" style="width:44px;height:26px;padding:0;border:0;background:none"><input type="color" id="kb-c2" value="${cols[1]}" style="width:44px;height:26px;padding:0;border:0;background:none"></span></div>
      <div class="fld"><label>Type</label><div class="seg" id="kb-type">${Object.entries(KERB_TYPES).map(([key, s]) => `<button data-v="${key}" class="${(v.type || 'raised') === key ? 'on' : ''}">${s.label}</button>`).join('')}</div></div>
      ${f1('kb-w', 'Width', 0.4, 3, 0.1, v.w ?? KERB_W, 'm')}
      ${f1('kb-tin', 'Taper In', 0, 15, 0.5, v.tin || 0, 'm')}
      ${f1('kb-tout', 'Taper Out', 0, 15, 0.5, v.tout || 0, 'm')}
      <p class="muted">${{ raised: 'Slopes up to its outer edge with rumble strips: you feel it, it doesn\'t unsettle the car.', flat: 'Painted on the road: no rise, barely a rumble.', saw: 'Raised, with deep ridges: it shakes the car hard.', sausage: 'A tall round hump: cut over it and it kicks the car up.' }[v.type || 'raised']} The taper is the wedge it starts and ends with.</p>
      ${k ? `<div class="seg" style="margin-top:8px"><button id="kb-flip">Other Side</button><button id="kb-del">Delete</button><button id="kb-done">Done</button></div>` : ''}
      <p class="muted" style="margin-top:12px">${list.length} curb${list.length === 1 ? '' : 's'}, ${total.toFixed(0)} m${own ? '' : ' (automatic: on every corner. Edit any of them and they become this track\'s own)'}.${k ? '' : ' Drag along a track edge to lay one with these settings. Click one to change it.'}</p>
      ${own || this.track.env.kerbs === false ? `<div class="seg"><button id="kb-auto">Back To Automatic</button><button id="kb-clear">Remove All</button></div>` : `<div class="seg"><button id="kb-clear">Remove All</button></div>`}`;
    // a change: to the picked curb (one undo step per change), else the settings new ones get
    const set = (patch) => {
      if (k) { this.push(); const own = this.kerbsEditable(), q = own[this.kerbSel]; Object.assign(q, patch); for (const key in patch) if (patch[key] == null) delete q[key]; this.changed(); }
      else Object.assign(this.kerbNewDefaults(), patch);
      this.renderKerbTab();
    };
    el.querySelectorAll('#kb-style button').forEach(b => b.addEventListener('click', () => { sfx.move(); set({ style: b.dataset.v, c: null }); }));
    el.querySelectorAll('#kb-type button').forEach(b => b.addEventListener('click', () => { sfx.move(); set({ type: b.dataset.v }); }));
    const col = () => set({ c: [$('kb-c1').value, $('kb-c2').value] });
    $('kb-c1').addEventListener('change', col); $('kb-c2').addEventListener('change', col);
    for (const [id, key, unit] of [['kb-w', 'w', 'm'], ['kb-tin', 'tin', 'm'], ['kb-tout', 'tout', 'm']]) {
      const inp = $(id);
      inp.addEventListener('input', () => { $(id + '-v').textContent = inp.value + unit; if (k) { const q = this.kerbsEditable()[this.kerbSel]; if (!this._kbSlide) { this.push(); this._kbSlide = true; } q[key] = +inp.value; this.kerbLive(); } });
      inp.addEventListener('change', () => { this._kbSlide = false; if (k) this.changed(); else this.kerbNewDefaults()[key] = +inp.value; });
    }
    if (k) {
      $('kb-flip').addEventListener('click', () => { sfx.move(); set({ side: -k.side }); });
      $('kb-del').addEventListener('click', () => this.kerbDelete());
      $('kb-done').addEventListener('click', () => { this.kerbSel = -1; sfx.move(); this.renderKerbTab(); this.dirty = true; });
    }
    const auto = $('kb-auto');
    if (auto) auto.addEventListener('click', () => { this.push(); if (this.track.dress) this.track.dress.kerbs = []; this.track.env.kerbs = true; this.kerbSel = -1; sfx.del(); this.changed(true); this.toast('CURBS BACK TO AUTOMATIC'); });
    $('kb-clear').addEventListener('click', () => { this.push(); this.track.dress = { ...(this.track.dress || {}), kerbs: [] }; this.track.env.kerbs = false; this.kerbSel = -1; sfx.del(); this.changed(true); this.toast('ALL CURBS REMOVED'); });
  };
}
// (how far inside the edge a drag still starts a curb: a few pixels' worth when zoomed out)
const T_IN = (ed) => Math.max(1.5, 8 / ed.view.scale);
