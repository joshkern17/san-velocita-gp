// HUD: DOM updates + circular radar
import { TileLayer } from './geo.js';
const $ = (id) => document.getElementById(id);

export function fmtTime(t, dp = 2) {
  if (!isFinite(t) || t <= 0) return dp === 0 ? '0:00' : '0:00.' + '0'.repeat(dp);
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(dp);
}
const pad2 = (n) => String(n).padStart(2, '0');
const hms = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 3600)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`; }; // (a timed race's clock)
// tower name: the surname in full ("M. OKAFOR" -> OKAFOR); you stay YOU
const code = (r) => r.isPlayer ? 'YOU' : String(r.name).trim().split(/\s+/).pop().toUpperCase() || r.name;
// canvas drawing uses the design system's colours and fonts (css/sv.css)
// a tyre's temperature (-1 cold .. 0 at its best .. 1 overheated) as a colour
// (any CSS colour, read back through a canvas as #rrggbb or rgba(): the theme's colours come from the stylesheet)
let rgbCtx = null;
const rgbOf = (c) => { rgbCtx ||= document.createElement('canvas').getContext('2d'); rgbCtx.fillStyle = '#000'; rgbCtx.fillStyle = c; const f = rgbCtx.fillStyle;
  return f[0] === '#' ? [1, 3, 5].map(k => parseInt(f.slice(k, k + 2), 16)) : f.match(/[\d.]+/g).slice(0, 3).map(Number); };
const mixHex = (a, b, t) => { const A = rgbOf(a), B = rgbOf(b), q = Math.max(0, Math.min(1, t));
  return '#' + [0, 1, 2].map(k => Math.round(A[k] + (B[k] - A[k]) * q).toString(16).padStart(2, '0')).join(''); };
// The car's condition (damage, wear, heat) has a scale of its own, green (fine) through amber to pink (bad), so it
// never reads as the UI's red and blue (labels, the cursor, "good" times)
const COND = { ok: '#3ee07a', mid: '#ffc21a', bad: '#ff2d6f', cold: '#4a4a5e' };
export const condCol = (x) => { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? mixHex(COND.ok, COND.mid, x / 0.5) : mixHex(COND.mid, COND.bad, (x - 0.5) / 0.5); };
const tempCol = (x) => x < -0.25 ? mixHex(COND.cold, COND.ok, (x + 1) / 0.75) : x < 0.3 ? COND.ok : condCol((x - 0.3) / 0.7);
const SV = { red: '#ff2b00', hot: '#ff6a1c', amber: '#ffc21a', cyan: '#2d36f2', good: '#2d36f2', blue: '#2d36f2', bad: '#ff2d6f', ink: '#05060c' };
// (re-read from the stylesheet when the UI colour changes: Options > Display > UI Colour)
export function readThemeColours() {
  const cs = getComputedStyle(document.documentElement), v = (k) => cs.getPropertyValue(k).trim();
  Object.assign(SV, { red: v('--sv-red'), hot: v('--sv-hot'), amber: v('--sv-amber'), cyan: v('--sv-cyan'), good: v('--sv-good') || v('--sv-cyan'), blue: v('--sv-map'), bad: v('--sv-bad') });
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const RADAR_ZOOM = { near: 1.35, normal: 1, far: 0.62, vfar: 0.36 };
export const RADAR_ZOOMS = ['near', 'normal', 'far', 'vfar'];
const TOWER_HEAD = '<div class="h"><span class="n">POS</span><span class="nm">DRIVER</span><span class="g">GAP</span></div>';
// a tower's rows cut to fit n lines: all of them if they fit; else the leaders (3), a line for the cars left out, and
// the cars round yours (yours in the middle); a number in the list = that many cars left out
export function towerCut(rows, n) {
  if (rows.length <= n) return rows;
  const me = Math.max(0, rows.findIndex(r => r.isPlayer));
  if (me < n - 1) return [...rows.slice(0, n - 1), rows.length - (n - 1)];
  const top = 3, w = n - top - 2, a = Math.min(rows.length - w, Math.max(top, me - Math.floor((w - 1) / 2)));
  const out = [...rows.slice(0, top)]; if (a > top) out.push(a - top);
  out.push(...rows.slice(a, a + w)); if (a + w < rows.length) out.push(rows.length - a - w);
  return out;
}
const TYRE_CSS = { soft: '#e0302a', medium: '#f2d22a', hard: '#f0f0f0', wet: '#3a8af0', dirt: '#b8824a' };

export class HUD {
  constructor() {
    this.el = {
      pos: $('h-pos'), posLbl: $('h-poslbl'), lap: $('h-lap'), time: $('h-time'), last: $('h-last'), best: $('h-best'),
      speed: $('h-speed'), gear: $('h-gear'), rpm: $('h-rpm'), unit: $('h-unit'), tower: $('h-tower'),
      help: $('h-help'), lights: $('h-lights'), center: $('h-center'), split: $('h-split'), area: $('h-area'), wrong: $('h-wrong'),
      timeLbl: $('h-timelbl'), penRow: $('h-penrow'), pen: $('h-pen'), deltaRow: $('h-deltarow'), delta: $('h-delta'),
      flag: $('h-flag'), flagI: $('h-flag-i'), flagT: $('h-flag-t'), flagS: $('h-flag-s'), flagBar: $('h-flag-bar'), flagD: $('h-flag-d'), feed: $('h-rc'),
    };
    this.feedEls = []; this.radioEls = [];
    this.st = { el: $('h-strat'), tyre: $('h-st-tyre'), plan: $('h-st-plan'), pitRow: $('h-st-pitrow'), pit: $('h-st-pit'), pitSub: $('h-st-pitsub'), mateRow: $('h-st-materow'), mateLbl: $('h-st-matelbl'), mate: $('h-st-mate'), wxRow: $('h-st-wxrow'), wx: $('h-st-wx') };
    this.padGlyphs = false; // (main.js: true when the pad is the device, for the radio's answers)
    this.radar = $('radar');
    this.carCv = $('h-car'); this.cc = this.carCv.getContext('2d');
    this.pitEl = $('h-pit');
    this.rc = this.radar.getContext('2d');
    this.cache = {};
    this.timers = {};
    this.units = 'kmh';
  }

  // driver aid chips: which are on, and which are stepping in right now
  aids(list) {
    const box = this.aidBox || (this.aidBox = { el: $('h-aids'), chips: {} });
    if (!box.el) return;
    if (!box.n) { box.el.querySelectorAll('i').forEach(i => box.chips[i.dataset.k] = i); box.n = 1; }
    const key = (list || []).map(a => a.k + (a.act ? '!' : '')).join(',');
    if (key === box.key) return;
    box.key = key;
    const on = new Map((list || []).map(a => [a.k, a.act]));
    for (const [k, i] of Object.entries(box.chips)) { i.classList.toggle('on', on.has(k)); i.classList.toggle('act', !!on.get(k)); }
    box.el.classList.toggle('none', !on.size);
  }

  set(key, el, v, html = false) {
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    if (html) el.innerHTML = v; else el.textContent = v;
  }

  setTrack(T, A, roadLines = []) {
    this.roadPath = null;
    if (roadLines.length) { const rp = new Path2D(); for (const l of roadLines) l.forEach(([x, z], k) => k ? rp.lineTo(x, z) : rp.moveTo(x, z)); this.roadPath = rp; }
    const p = new Path2D();
    if (T.open) { // point-to-point: back of the grid to the end of the run-off, never joined up
      for (let n = 0; n < T.N; n += 2) { const k = (T.cut + 1 + n) % T.N; n === 0 ? p.moveTo(T.X[k], T.Z[k]) : p.lineTo(T.X[k], T.Z[k]); }
      p.lineTo(T.X[T.cut], T.Z[T.cut]);
    } else {
      for (let i = 0; i <= T.N; i += 2) { const k = i % T.N; i === 0 ? p.moveTo(T.X[k], T.Z[k]) : p.lineTo(T.X[k], T.Z[k]); }
      p.closePath();
    }
    this.path = p;
    // pit lane centre line (entry ramp -> lane -> exit ramp)
    this.pitPath = null;
    const pit = A && A.pit;
    if (pit) {
      const idx = []; for (let i = 0; i < T.N; i++) if (pit.REG[i] >= 0) idx.push(i);
      idx.sort((a, b) => pit.REG[a] - pit.REG[b]);
      const pp = new Path2D();
      idx.forEach((i, k) => { const o = pit.side * pit.CEN[i], x = T.X[i] + T.RX[i] * o, z = T.Z[i] + T.RZ[i] * o; k ? pp.lineTo(x, z) : pp.moveTo(x, z); });
      this.pitPath = pp;
    }
    this.T = T;
    this.cache = {};
  }

  // how many tower lines fit down the left column (above the radio messages), at least 8
  towerFit() {
    // (measured once a second: a layout read)
    const now = performance.now(); if (this._fit && now - this._fitT < 1000) return this._fit;
    const col = this.el.tower.parentElement, h = col ? col.clientHeight : 0, r = this.el.tower.querySelector('.r');
    this._fitT = now; return this._fit = h && r ? Math.max(8, Math.floor((h - 44 - 90) / r.offsetHeight)) : 12;
  }
  reset(mode) {
    this.cap(null);
    this.mode = mode;
    this.cache = {};
    Object.values(this.timers).forEach(clearTimeout);
    ['help', 'center', 'split', 'area', 'lights'].forEach(k => this.el[k].classList.remove('on'));
    this.pitEl.classList.remove('on');
    this.el.lights.querySelectorAll('i').forEach(i => i.classList.remove('lit'));
    this.el.tower.style.display = mode === 'race' || mode === 'quali' ? '' : 'none'; // ('quali': practice too)
    this.el.deltaRow.classList.remove('on');
    this.el.help.classList.remove('shift');
    this.el.flag.className = 'rc-board';
    this.el.feed.innerHTML = ''; this.feedEls = [];
    $('h-radio').innerHTML = ''; $('h-radio').classList.remove('calling', 'asking'); this.radioEls = []; this.call = null; this.askEl = null;
    this.st.el.classList.remove('on');
    $('h-prog').classList.remove('on'); $('h-gate').className = 'gate-msg'; this.gateOn = false; $('h-secs').classList.remove('on'); $('h-pips').classList.remove('on');
    this.secPaths = null; this.quali = null;
  }

  update(s, race) {
    if (!s) return;
    this.quali = s.quali;
    const E = this.el;
    const Q = s.quali;
    this.set('poslbl', E.posLbl, this.mode === 'race' ? (s.cls ? `${s.cls} POSITION` : 'POSITION') : Q ? 'SESSION' : 'MODE');
    // (multiclass: your place in your class)
    if (this.mode === 'race' && s.cls) this.set('pos', E.pos, `${pad2(s.clsPos)}<small> / ${pad2(s.clsN)}</small>`, true);
    else if (this.mode === 'race') this.set('pos', E.pos, `${pad2(s.pos)}<small> / ${pad2(s.total)}</small>`, true);
    else if (Q) {
      // the session clock where your position goes (bad-red in the last minute, the chequered flag at zero)
      const c = Q.left <= 0 ? '<span class="qclock end">FLAG</span>' : `<span class="qclock${Q.left < 60 ? ' late' : ''}">${fmtTime(Math.ceil(Q.left), 0)}</span>`;
      this.set('pos', E.pos, c, true);
    }
    else this.set('pos', E.pos, `<small class="tt">TIME TRIAL</small>`, true);
    // (a timed race: the race clock left, in the race's own hours, and the lap you're on)
    const ll = E.lap.previousElementSibling, lt = s.timed ? 'CLOCK' : 'LAP'; if (ll && ll.textContent !== lt) ll.textContent = lt;
    if (Q) this.set('lap', E.lap, `<span class="qstat">${Q.status}</span>`, true);
    else if (s.timed) this.set('lap', E.lap, s.timed.flag ? '<span class="qclock end">FLAG</span>' : `<span class="qclock${s.timed.left < 15 * 60 ? ' late' : ''}">${hms(s.timed.left)}</span><small> L${pad2(Math.max(1, s.lapNo))}</small>`, true);
    else this.set('lap', E.lap, this.mode === 'race' ? `${pad2(s.lap)} / ${pad2(s.laps)}` : pad2(Math.max(1, race.player.lap)));
    // live delta to your best lap (qualifying, time trial)
    const dl = s.sectors && this.secOn !== false ? null : s.delta;
    E.deltaRow.classList.toggle('on', dl !== null && dl !== undefined);
    if (dl !== null && dl !== undefined) { this.set('delta', E.delta, (dl < 0 ? '\u2212' : '+') + Math.abs(dl).toFixed(2)); E.delta.classList.toggle('faster', dl < 0); E.delta.classList.toggle('slower', dl >= 0); }
    this.set('time', E.time, fmtTime(s.lapTime));
    this.set('last', E.last, s.last > 0 ? fmtTime(s.last) : '\u2014');
    const rc = s.rc;
    const invalid = !!(rc && rc.invalid && !s.pitting);
    if (this.cache.inv !== invalid) { this.cache.inv = invalid; E.timeLbl.textContent = invalid ? 'LAP DELETED' : 'LAP TIME'; E.timeLbl.classList.toggle('void', invalid); E.time.classList.toggle('void', invalid); }
    E.last.classList.toggle('void', !!s.lastInvalid);
    // what you owe: time (served at your next stop) and / or a drive-through
    const pen = rc && rc.pen > 0 && !s.penServing ? rc.pen : 0, dt = rc && rc.dt;
    this.set('pen', E.pen, [pen ? '+' + pen + 's' : '', dt ? 'DRIVE-THRU' : ''].filter(Boolean).join(' · '));
    E.penRow.classList.toggle('on', !!(pen || dt));
    this.flagBoard(rc);
    this.set('best', E.best, isFinite(s.best) ? fmtTime(s.best) : '\u2014');
    const sp = this.units === 'mph' ? s.speed * 2.23694 : s.speed * 3.6;
    this.set('speed', E.speed, String(Math.round(sp)));
    const lim = s.pitLim ?? (s.pitting && s.pitPhase !== 'stop');
    this.set('unit', E.unit, lim ? 'PIT LIMITER' : this.units === 'mph' ? 'MPH' : 'KM/H');
    E.speed.classList.toggle('lim', !!lim);
    // the tow on a straight; through a corner, a car ahead's dirty air costing you grip (Options: Dirty Air Indicator)
    // (held on 0.6 s after it fades, so it doesn't flicker through a corner's changes of load)
    const now = performance.now();
    if (this.dirtyAir && !lim && (s.wake || 0) > 0.02 && Math.abs(s.latG || 0) > 0.5) this.dirtyUntil = now + 600;
    const dirty = !lim && now < (this.dirtyUntil || 0);
    $('h-tow').classList.toggle('on', (s.slip || 0) > 0.3 && !lim && !dirty);
    $('h-dirty').classList.toggle('on', !!dirty);
    this.set('gear', E.gear, s.gear === -1 ? 'R' : s.speed < 0.5 && s.gear === 1 ? 'N' : String(s.gear));
    const r = Math.max(0, Math.min(1, (s.rpm - 4000) / 8500));
    const rw = Math.round(r * 100);
    if (this.cache.rpm !== rw) { this.cache.rpm = rw; E.rpm.style.setProperty('--v', (rw / 100).toFixed(2)); E.rpm.classList.toggle('hot', r > 0.93); }
    E.wrong.classList.toggle('on', !!s.wrongWay);
    this.aids(s.aids);
    if (Q) {
      // timing screen: pole time, then gaps; a time just set flashes purple
      const now = race.raceTime;
      const html = TOWER_HEAD.replace('GAP', 'TIME') + Q.rows.slice(0, 12).map(r => {
        const t = !isFinite(r.best) ? '\u2014' : r.pos === 1 || r.gap == null ? fmtTime(r.best, 3) : '+' + r.gap.toFixed(3);
        const fresh = r.flash !== undefined && now - r.flash < 3;
        return `<div class="r${r.isPlayer ? ' me' : ''}${fresh ? ' new' : ''}"><span class="n">${r.pos}</span><span class="c" style="background:${hex(r.color)}"></span><span class="nm">${code(r)}</span><span class="g q">${t}</span></div>`;
      }).join('');
      if (this.cache.towerT === undefined || performance.now() - this.cache.towerT > 250) { this.cache.towerT = performance.now(); this.set('tower', E.tower, html, true); }
    } else if (this.mode === 'race') {
      // (multiclass: your class's cars and their places in it, or the whole field (towerAll: Tab / d-pad left-right),
      // each with a stripe of its class's colour. More cars than fit: the leaders, then the cars round you)
      const all = !s.cls || this.towerAll;
      if (s.cls && !this.cache.towerHint && s.raceTime > 6) { this.cache.towerHint = true; this.help(`Leaderboard: <b>${this.towerAll ? 'WHOLE FIELD' : 'YOUR CLASS'}</b> · Tab / d-pad \u25C0 \u25B6 to switch`, 4000); }
      const rows = all ? s.standings : s.standings.filter(r => r.mine);
      const row = (r) => `<div class="r${r.isPlayer ? ' me' : ''}${r.mate ? ' mt' : ''}"${r.clsCol ? ` style="box-shadow:inset 3px 0 0 ${r.clsCol}"` : ''}><span class="n">${all ? r.pos : r.clsPos || r.pos}</span><span class="c" style="background:${hex(r.color)}"></span><span class="nm">${code(r)}</span>${r.pit ? '<span class="pt">PIT</span>' : ''}${r.pen ? `<span class="pn">+${r.pen}s</span>` : ''}${r.dt ? '<span class="pn">DT</span>' : ''}${s.wear ? `<span class="ty" style="background:${TYRE_CSS[r.tyre]}">${r.tyre[0].toUpperCase()}</span>` : ''}<span class="g">${(all && s.cls ? r.gapAll : r.gap) || '\u2014'}</span></div>`;
      const gap = (n) => `<div class="r sep"><span class="n"></span><span class="nm">${n} car${n === 1 ? '' : 's'}</span></div>`;
      const html = TOWER_HEAD.replace('GAP', 'INT').replace('POS', s.cls ? (all ? 'ALL' : s.cls) : 'POS') + towerCut(rows, this.towerFit()).map(x => typeof x === 'number' ? gap(x) : row(x)).join('');
      if (this.cache.towerT === undefined || performance.now() - this.cache.towerT > 250) { this.cache.towerT = performance.now(); this.set('tower', E.tower, html, true); }
    }
    this.drawRadar(race);
    this.drawCar(s);
    // (the plan used to sit over the car: it's in the strategy panel now)
    this.set('plan', $('h-plan'), s.wear && s.plan && !s.strat ? `BOX LAP ${s.plan.lap}<i style="background:${TYRE_CSS[s.plan.tyre]}"></i>${s.plan.tyre.toUpperCase()}` : '', true);
    this.strategy(s);
    this.programme(s.prog);
    this.gateNear(s.gateNear);
    this.sectors(s.sectors);
  }

  // the lap's sectors under the lap time (race.js secHud): the cell you're in outlined, the ones done filled in their
  // color with the time against your best (your first time through: the time itself)
  sectors(S) {
    const el = $('h-secs'), on = !!S && this.secOn !== false;
    el.classList.toggle('on', on); if (!on) { this.pips(null); return; }
    const txt = (c) => c.d == null ? (c.t >= 60 ? fmtTime(c.t, 2) : c.t.toFixed(2)) : (c.d < 0 ? '\u2212' : '+') + Math.abs(c.d).toFixed(3);
    // (the one you're in: its live delta, or its time so far)
    const n = S.now, live = n ? (n.d != null ? (n.d < 0 ? '\u2212' : '+') + Math.abs(n.d).toFixed(2) : n.t >= 60 ? fmtTime(n.t, 1) : n.t.toFixed(1)) : '';
    const liveCls = n && n.d != null ? (n.d < 0 ? ' faster' : ' slower') : '';
    el.querySelectorAll('i').forEach((i, k) => { const c = S.cells[k], now = !c && k === S.k; const cls = c ? c.col : now ? 'now' + liveCls : ''; if (i.className !== cls) i.className = cls; const tx = c ? txt(c) : now ? live : ''; if (i.textContent !== tx) i.textContent = tx; });
    this.pips(S.pips);
  }
  // the mini-sectors under each sector cell: g green (lit / quicker than your practice best), h beaten once (the job),
  // y yellow (slower / missed its target), v a deleted lap's, now the one you're in, '' to come
  pips(P) {
    const el = $('h-pips'); el.classList.toggle('on', !!P); if (!P) { this.cache.pips = null; return; }
    const key = P.per.join() + '|' + P.cells.join();
    if (key === this.cache.pips) return; this.cache.pips = key;
    let j = 0;
    el.innerHTML = P.per.map(n => `<span>${Array.from({ length: n }, () => `<b class="${P.cells[j++]}"></b>`).join('')}</span>`).join('');
  }

  // the run plan's job on track (practice.js): gates through on this lap, its rating so far, the best lap's rating,
  // and the brake points marked for the weekend
  programme(P) {
    const el = $('h-prog'); el.classList.toggle('on', !!P); if (!P) return;
    this.set('pgName', $('h-pg-name'), P.title);
    this.set('pgRows', $('h-pg-rows'), P.rows.map(([l, v]) => `<div class="hud-row"><span class="lbl">${l}</span><span class="val">${v}</span></div>`).join(''), true);
  }
  // the gate you're closing on: your speed against its target (pink +18 too fast, blue ON IT, amber -12 slow), where
  // the verdict comes up; the verdict has the spot while it's showing
  gateNear(G) {
    const e = $('h-gate'); if (this.gateOn) return;
    if (!G) { if (e.classList.contains('near')) e.className = 'gate-msg'; this.cache.gateNear = null; return; }
    const txt = G.state === 'on' ? 'ON IT' : `${G.d > 0 ? '+' : '\u2212'}${Math.abs(G.d)}<small>${G.state === 'fast' ? (G.kind === 'brake' ? 'BRAKE' : 'LIFT') : 'CARRY MORE SPEED'}</small>`;
    const key = G.state + txt; if (key === this.cache.gateNear) return; this.cache.gateNear = key;
    e.className = 'gate-msg on near ' + (G.state === 'on' ? 'ok' : G.state); // ('ok': 'on' is what shows it) e.innerHTML = txt;
  }
  // a gate just driven through: PERFECT / GOOD / TOO FAST / TOO SLOW / MISSED, and how far off its speed you were
  gate(ev) {
    const e = $('h-gate'), u = this.units === 'mph' ? 2.23694 : 3.6, d = Math.round(ev.dv * u), unit = this.units === 'mph' ? 'MPH' : 'KM/H';
    const word = { perfect: 'PERFECT', good: 'GOOD', fast: 'TOO FAST', slow: 'TOO SLOW', wide: 'MISSED' }[ev.res];
    const sub = ev.nailed ? 'BRAKE POINT MARKED' : ev.res === 'wide' ? 'OFF THE LINE' : `${d > 0 ? '+' : d < 0 ? '\u2212' : '\u00b1'}${Math.abs(d)} ${unit}`;
    e.className = 'gate-msg on ' + (ev.res === 'perfect' ? 'perfect' : ev.res === 'good' ? 'good' : 'miss');
    e.innerHTML = `${word}<small>${sub}</small>`;
    clearTimeout(this.timers.gate); this.gateOn = true; this.cache.gateNear = null;
    this.timers.gate = setTimeout(() => { e.classList.remove('on'); this.gateOn = false; }, 900);
  }

  // the strategy panel (races with a pit lane, or tyre wear): the set you're on and how old it is, the plan, where a
  // stop now would put you (and who you'd come out behind), your teammate (World Career)
  strategy(s) {
    const S = this.st, x = s.strat, show = !!(x && this.mode === 'race' && (s.wear || s.hasPit));
    S.el.classList.toggle('on', show); if (!show) return;
    const dot = (c) => `<span class="ty" style="background:${TYRE_CSS[c] || '#777'}">${c[0].toUpperCase()}</span>`;
    // (a race whose weather may change: the track as it is, and the rain on its way)
    const X = x.wx; S.wxRow.classList.toggle('off', !X);
    if (X) this.set('st-wx', S.wx, X.eta != null ? `RAIN IN ${Math.max(1, Math.round(X.eta))} LAP${Math.round(X.eta) > 1 ? 'S' : ''}` : X.wet > 0.6 ? (X.rainK > 0.3 ? 'WET' : 'DRYING') : X.wet > 0.2 ? (X.rainK > 0.3 ? 'GETTING WET' : 'DRYING') : X.rainK > 0.3 ? 'SPITTING' : 'DRY', true);
    this.set('st-tyre', S.tyre, `${dot(s.tyre.c)}${x.tyreLaps} LAP${x.tyreLaps === 1 ? '' : 'S'}`, true);
    this.set('st-plan', S.plan, s.plan ? `BOX L${s.plan.lap}${dot(s.plan.tyre)}` : 'TO THE END', true);
    const P = x.proj, pit = !!(P && s.hasPit && !s.pitting);
    S.pitRow.classList.toggle('off', !pit);
    this.set('st-pit', S.pit, pit ? `P${P.pos}` : '', true);
    this.set('st-pitsub', S.pitSub, pit ? (P.ahead ? `behind ${String(P.ahead).split(' ').pop()} +${Math.max(0.1, P.aheadBy).toFixed(1)}` : P.pos === 1 ? 'in the lead' : '') : '', true);
    const M = x.mate; S.mateRow.classList.toggle('off', !M);
    if (M) { this.set('st-matelbl', S.mateLbl, String(M.name).split(' ').pop().toUpperCase());
      this.set('st-mate', S.mate, `P${M.pos}${M.gap == null ? '' : M.gap < 0 ? ` <span class="up">&#9650;${(-M.gap).toFixed(1)}</span>` : ` <span class="dn">&#9660;${M.gap.toFixed(1)}</span>`}`, true); }
  }

  // the radio (your engineer, your teammate), bottom centre: a wide strip with an EQ that jumps while they're talking.
  // The newest sits at the bottom; the one before shrinks to a dim line above it (one at most, and none during a call).
  // who: 'eng' | 'mate'; o: { name (the label), color (their team's), big (stays longer) }
  radio(who, msg, o = {}) {
    const el = document.createElement('div');
    el.className = 'rd-msg sv-frame ' + who; if (o.color) el.style.setProperty('--f', o.color);
    el.innerHTML = `<div class="rd-eq">${'<i></i>'.repeat(9)}</div><div class="rd-body"><small>${o.name || (who === 'eng' ? 'Engineer' : 'Teammate')}</small><p>${msg}</p></div>`;
    this.pushRadio(el, o.big ? 8000 : 6000);
    // (talking: about as long as it'd take to say it)
    el.classList.add('talk'); el.talkT = setTimeout(() => el.classList.remove('talk'), Math.max(1200, Math.min(4000, String(msg).length * 45)));
    return el;
  }
  pushRadio(el, ms) {
    const box = $('h-radio'); box.append(el); this.radioEls.forEach(e => { e.classList.add('old'); e.classList.remove('talk'); }); this.radioEls.push(el);
    requestAnimationFrame(() => el.classList.add('on'));
    while (this.radioEls.filter(e => !e.call).length > 2) { const old = this.radioEls.find(e => !e.call); old.remove(); this.radioEls = this.radioEls.filter(e => e !== old); }
    if (ms) el.dropT = setTimeout(() => this.dropRadio(el), ms);
  }
  dropRadio(el) { clearTimeout(el.dropT); clearTimeout(el.talkT); el.classList.remove('on'); setTimeout(() => { el.remove(); this.radioEls = this.radioEls.filter(e => e !== el); }, 350); }
  // a call: a question with two answers (a: X / 1, b: B / 2) side by side under it, the recommended one lit; callTick(k)
  // runs the segmented bar along the bottom down (k: what's left, 1..0), callDone(which) shows what was chosen and lets it go
  radioCall(who, msg, a, b, rec, o = {}) {
    if (this.call) this.dropRadio(this.call);
    const el = this.radio(who, msg, { ...o, big: true }); clearTimeout(el.dropT); el.call = true; el.classList.add('call');
    $('h-radio').classList.add('calling'); // (while a call's open, it's the only thing on the radio)
    const key = (k) => this.padGlyphs ? `<kbd class="pb ${k === 'a' ? 'x' : 'b'}">${k === 'a' ? 'X' : 'B'}</kbd>` : `<kbd>${k === 'a' ? '1' : '2'}</kbd>`;
    el.querySelector('.rd-body').insertAdjacentHTML('beforeend', `<div class="rd-acts"><span class="${rec === 'a' ? 'rec' : ''}" data-k="a">${key('a')}<b>${a}</b></span><span class="${rec === 'b' ? 'rec' : ''}" data-k="b">${key('b')}<b>${b}</b></span></div>`);
    el.insertAdjacentHTML('beforeend', '<i class="rd-bar"></i>');
    this.call = el; return el;
  }
  // ask the engineer (d-pad right / T): the menu, over the radio's place while it's open. m: { title, crumb, rows:
  // [{ label, sub, go (has a level under it) }], sel } or null (closed). Drawn again only when something on it changes.
  askMenu(m) {
    const box = $('h-radio');
    if (!m) {
      const el = this.askEl; if (!el) return; this.askEl = null; box.classList.remove('asking');
      el.classList.remove('on'); setTimeout(() => el.remove(), 300); return;
    }
    const sig = JSON.stringify(m) + this.padGlyphs;
    let el = this.askEl;
    if (el && el.sig === sig) return;
    if (!el) { el = this.askEl = document.createElement('div'); el.className = 'rd-ask sv-frame'; box.append(el); box.classList.add('asking'); requestAnimationFrame(() => el.classList.add('on')); }
    el.sig = sig;
    const pad = this.padGlyphs, k = (pd, kb) => pad ? `<kbd>${pd}</kbd>` : `<kbd>${kb}</kbd>`;
    el.innerHTML = `<div class="ra-head"><small>${m.title}</small>${m.crumb ? `<b>${m.crumb}</b>` : ''}</div>`
      + `<div class="ra-rows">${m.rows.map((r, i) => `<div class="ra-row${i === m.sel ? ' sel' : ''}">${pad ? '<i class="sv-cursor"></i>' : `<kbd>${i + 1}</kbd>`}<span>${r.label}</span><em>${r.sub || ''}</em>${r.go ? '<u>&#8250;</u>' : ''}</div>`).join('')}</div>`
      + `<div class="ra-foot">${pad ? `<span>${k('&#9650;&#9660;', '')}Move</span>` : `<span><kbd>1</kbd>-<kbd>${m.rows.length}</kbd>Pick</span>`}<span>${k('&#9654;', 'T')}${pad ? (m.rows[m.sel]?.go ? 'Open' : 'Ask') : 'Close'}</span><span>${k('&#9664;', '&#9003;')}${m.crumb ? 'Back' : 'Close'}</span></div>`;
  }
  callTick(k) { if (this.call) this.call.querySelector('.rd-bar').style.setProperty('--v', Math.max(0, Math.min(1, k)).toFixed(3)); }
  callDone(which) {
    const el = this.call; if (!el) return; this.call = null; el.call = false; $('h-radio').classList.remove('calling');
    el.querySelectorAll('.rd-acts span').forEach(x => x.classList.add(x.dataset.k === which ? 'pick' : 'no'));
    el.querySelector('.rd-bar').remove(); el.dropT = setTimeout(() => this.dropRadio(el), 2500);
  }

  // race control's board: what the marshals are showing you right now (one thing at a time, most urgent first)
  flagBoard(rc) {
    let f = null, t = '', sub = '', bar = -1, delta = '', dcls = '';
    if (rc) {
      if (rc.dsq) { f = 'bk'; t = 'BLACK FLAG'; sub = 'Disqualified'; }
      else if (rc.giveBack) { f = 'y'; t = 'GIVE THE PLACE BACK'; sub = `Let ${rc.giveBack.name} past · ${Math.ceil(rc.giveBack.left)}s`; bar = rc.giveBack.left / rc.giveBack.total; }
      else if (rc.mo) { f = 'mo'; t = 'BLACK & ORANGE FLAG'; sub = rc.mo.laps > 1 ? `Box for repairs · ${rc.mo.laps} laps` : 'Box this lap for repairs'; }
      else if (rc.sc) { f = 'vsc'; t = rc.sc.phase === 'in' ? 'SAFETY CAR IN THIS LAP' : 'SAFETY CAR'; sub = rc.sc.phase === 'in' ? 'Get ready · no overtaking' : 'No overtaking · pit lane open'; }
      else if (rc.vsc) {
        f = 'vsc'; t = rc.vsc.phase === 'ending' ? 'VSC ENDING' : 'VIRTUAL SAFETY CAR';
        sub = rc.vsc.phase === 'ending' ? 'Get ready · no overtaking' : 'Slow down · no overtaking';
        const d = rc.vsc.delta; delta = (d >= 0 ? '+' : '\u2212') + Math.abs(d).toFixed(1); dcls = rc.vsc.ok ? 'ok' : 'bad';
      }
      else if (rc.bw) { f = 'bw'; t = 'BLACK & WHITE FLAG'; sub = 'Final warning · track limits'; }
      else if (rc.flag === 'dy') { f = 'dy'; t = 'DOUBLE YELLOW'; sub = (rc.ahead ? 'Ahead · ' : '') + 'Slow down · no overtaking'; }
      else if (rc.flag === 'y') { f = 'y'; t = 'YELLOW FLAG'; sub = (rc.ahead ? 'Ahead · ' : '') + 'No overtaking'; }
      else if (rc.blue) { f = 'blue'; t = 'BLUE FLAG'; sub = `Let ${rc.blue} through`; }
      else if (rc.flag === 'g') { f = 'g'; t = 'GREEN FLAG'; sub = 'Track clear'; }
      else if (rc.dt && rc.dt.laps <= 1) { f = 'dt'; t = 'DRIVE-THROUGH'; sub = 'Last lap to serve it'; }
    }
    if (!f && this.quali && this.quali.flag && !this.quali.done) { f = 'chq'; t = 'CHEQUERED FLAG'; sub = 'Finish this lap'; }
    const E = this.el, key = f ? f + t + sub : '';
    if (this.cache.flag !== key) {
      this.cache.flag = key;
      if (f) { E.flagI.className = 'rc-flag ' + f + (f === 'y' || f === 'dy' || f === 'blue' ? ' blink' : ''); E.flagI.textContent = f === 'vsc' ? (rc && rc.sc ? 'SC' : 'VSC') : ''; E.flagT.textContent = t; E.flagS.textContent = sub; }
      E.flag.className = 'rc-board' + (f ? ' on ' + f : '') + (bar >= 0 ? ' timed' : '') + (delta ? ' delta' : '');
    }
    if (this.cache.delta !== delta + dcls) { this.cache.delta = delta + dcls; E.flagD.textContent = delta; E.flagD.className = 'rc-delta ' + dcls; }
    if (bar >= 0) E.flagBar.style.width = (bar * 100).toFixed(1) + '%';
  }
  // the stewards' messages: newest on top (older ones step down and fade out at the bottom, so nothing jumps up),
  // three at most, each fades after a few seconds
  rcMessage(msg, cls = '', me = false) {
    const el = document.createElement('div');
    el.className = 'rc-msg ' + cls + (me ? ' me' : '');
    el.textContent = msg;
    this.el.feed.prepend(el);
    this.feedEls.push(el);
    requestAnimationFrame(() => el.classList.add('on'));
    while (this.feedEls.length > 3) this.feedEls.shift().remove();
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => { el.remove(); this.feedEls = this.feedEls.filter(e => e !== el); }, 350); }, me ? 6500 : 4500);
  }

  // top-down car: tyre wear per axle (% beside each axle), wing / chassis damage
  // The car diagram (bottom right): your car from above, drawn to its own proportions: an open-wheeler (tub, wings,
  // sidepods: its radiators) or a closed car (body outline, bumpers or a splitter, a wing if it has one, the radiator
  // in the nose). Its tyres: temperature as their colour (with temperatures on; else wear), wear as the numbers beside
  // them, a bent corner (Realistic damage) turned out of line and outlined. Wings / bumpers and the radiator take the
  // damage colour. Under it: the compound (COLD / HOT), and the engine's water temperature (Realistic damage).
  drawCar(s) {
    const c = this.cc, cv = this.carCv;
    const show = s.wear || s.damage || s.temps;
    cv.style.display = show ? '' : 'none';
    if (!show) return;
    const T = s.temps, E = s.eng, S = s.shape || { open: true, aero: true, f: 2.9, r: 2.7, w: 1, a: 1.85, b: 1.75, tw: 1.6, wr: 0.33 };
    const q = (x, n) => Math.round(x * n);
    const key = [SV.red, s.tyre.c, q(s.tyre.wf, 50), q(s.tyre.wr, 50), q(s.dmg.fw, 20), q(s.dmg.rw, 20), q(s.dmg.ch, 20), T ? T.map(x => q(x, 12)).join('/') : '',
      s.bent ? s.bent.map(x => q(x, 20)).join('/') : '', E ? [q(E.t, 1), q(E.rad, 20), q(E.gb, 20), q(E.fl, 20), E.lost].join('/') : '', S.open, S.f, this.units].join();
    if (this.cache.car === key) return; this.cache.car = key;
    // (drawn at twice the size it's shown, in a 128 x 146 frame)
    const W = 128, H = 160; c.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0); c.clearRect(0, 0, W, H);
    const wearCol = (w) => condCol((1 - w) / 0.7); // (new: green; at the 30% cliff: pink)
    const dmgCol = (d) => condCol(d / 0.72);        // (whole: green; about to break off: pink)
    const glow = (col) => { c.fillStyle = col; c.strokeStyle = col; c.shadowColor = col; };
    c.shadowBlur = 3; c.lineJoin = 'round';
    // the frame: the car's length fills 92 px; everything to the same scale
    const k = 92 / (S.f + S.r), cx = W / 2, y0 = 6, yF = y0, yR = y0 + (S.f + S.r) * k;
    const yAF = y0 + (S.f - S.a) * k, yAR = y0 + (S.f + S.b) * k, hw = S.w * k, tx = S.tw / 2 * k;
    const tW = Math.max(6, (S.open ? 0.34 : 0.26) * k), tH = Math.max(11, S.wr * 2 * k);
    const body = s.bent ? 0 : s.dmg.ch; // (Realistic damage shows the suspension at its corners instead)
    const part = (x, y, w, h, d) => { if (d < 0.72) { glow(dmgCol(d)); c.fillRect(x, y, w, h); } else { glow(COND.bad); c.lineWidth = 1.5; c.setLineDash([3, 2]); c.strokeRect(x, y, w, h); c.setLineDash([]); } };
    const rad = E ? E.rad : 0;
    // the floor (Realistic damage): the plank between the axles, under everything, in its condition
    // (an open-wheeler's tub and sidepods cover it: there it's the floor's outline round them)
    if (E) {
      glow(condCol(E.fl / 0.72));
      if (S.open) { const fw = tx - tW / 2 - 1.5, y1 = yAF + tH / 2 + 3, y2 = yAR - tH / 2 - 3; c.globalAlpha = 0.85; c.lineWidth = 1.5; c.strokeRect(cx - fw, y1, fw * 2, y2 - y1); }
      else { const fw = hw * 0.86; c.globalAlpha = 0.3; c.fillRect(cx - fw, yAF + 6, fw * 2, yAR - yAF - 12); }
      c.globalAlpha = 1;
    }
    if (S.open) {
      // tub: a narrow nose widening to the cockpit, the sidepods (radiators) either side, the engine cover tapering back
      glow(dmgCol(body)); c.beginPath();
      c.moveTo(cx - 3, yF + 7); c.lineTo(cx + 3, yF + 7); c.lineTo(cx + 7, yAF + 18); c.lineTo(cx + 8, yAR - 8); c.lineTo(cx + 5, yR - 6);
      c.lineTo(cx - 5, yR - 6); c.lineTo(cx - 8, yAR - 8); c.lineTo(cx - 7, yAF + 18); c.closePath(); c.fill();
      const pw = Math.max(5, tx - tW / 2 - 10), py = yAF + (yAR - yAF) * 0.38, ph = (yAR - yAF) * 0.36;
      glow(dmgCol(rad)); c.fillRect(cx - 9 - pw, py, pw, ph); c.fillRect(cx + 9, py, pw, ph);
      part(cx - tx - tW / 2, yF, 2 * tx + tW, 5, s.dmg.fw);             // front wing, as wide as the car
      part(cx - tx * 0.62, yR - 5, tx * 1.24, 6, s.dmg.rw);              // rear wing
    } else {
      // body: its outline (the roof a fainter inner one), bumpers front and rear in the damage colour, the radiator
      // behind the grille, a splitter and a wing on a car with real aero
      glow(dmgCol(body)); c.lineWidth = 2; const r = Math.min(hw * 0.55, 9);
      c.beginPath(); c.roundRect(cx - hw, yF, hw * 2, yR - yF, r); c.stroke();
      c.globalAlpha = 0.4; c.lineWidth = 1.5; c.beginPath(); c.roundRect(cx - hw * 0.62, yF + (yR - yF) * 0.34, hw * 1.24, (yR - yF) * 0.36, 4); c.stroke(); c.globalAlpha = 1;
      part(cx - hw * 0.8, yF + 1, hw * 1.6, S.aero ? 5 : 4, s.dmg.fw);
      part(cx - hw * 0.8, yR - 5, hw * 1.6, 4, s.dmg.rw);
      if (S.aero) part(cx - hw * 0.9, yR - 1, hw * 1.8, 5, s.dmg.rw);
      if (E) { glow(dmgCol(rad)); c.fillRect(cx - hw * 0.42, yF + 8, hw * 0.84, 3); }
    }
    // the gearbox: at the driven end (between the rear wheels; the front on a front-wheel drive), in its condition
    if (E) { const gy = E.fd >= 1 ? yAF : yAR; glow(condCol(E.gb)); c.fillRect(cx - 4, gy - 4, 8, 8); }
    // tyres
    const tyre = (k2, x, y) => {
      const b = s.bent ? s.bent[k2] : 0, wear = k2 < 2 ? s.tyre.wf : s.tyre.wr;
      c.save(); c.translate(x, y);
      if (b > 0.05) c.rotate((s.bentDir[k2] || -1) * (k2 % 2 ? -1 : 1) * b * 0.35); // (toe-out: the front of the tyre turned outward)
      glow(T ? tempCol(T[k2]) : s.wear ? wearCol(wear) : '#6a6a72'); c.fillRect(-tW / 2, -tH / 2, tW, tH);
      if (b > 0.12) { glow(dmgCol(b)); c.lineWidth = 1.5; c.strokeRect(-tW / 2 - 2.5, -tH / 2 - 2.5, tW + 5, tH + 5); }
      c.restore();
    };
    tyre(0, cx - tx, yAF); tyre(1, cx + tx, yAF); tyre(2, cx - tx, yAR); tyre(3, cx + tx, yAR);
    // wear beside them (just outside each car's own track, the same gap either side)
    c.textBaseline = 'middle';
    if (s.wear) {
      c.font = "500 11px 'SV UI'";
      const pf = Math.round(s.tyre.wf * 100) + '%', pr = Math.round(s.tyre.wr * 100) + '%', gx = tx + tW / 2 + 5;
      glow(wearCol(s.tyre.wf)); c.textAlign = 'right'; c.fillText(pf, cx - gx, yAF); c.textAlign = 'left'; c.fillText(pf, cx + gx, yAF);
      glow(wearCol(s.tyre.wr)); c.textAlign = 'right'; c.fillText(pr, cx - gx, yAR); c.textAlign = 'left'; c.fillText(pr, cx + gx, yAR);
    }
    // the compound (and the set's state), then the engine's water
    const cold = T && T.reduce((a, x) => a + x, 0) / 4 < -0.35, hot = T && Math.max(...T) > 0.45;
    c.textAlign = 'center'; c.font = "500 13px 'SV UI'"; glow(TYRE_CSS[s.tyre.c]);
    c.fillText(s.tyre.c.toUpperCase() + (cold ? ' · COLD' : hot ? ' · HOT' : ''), cx, 116);
    if (E) {
      const t = E.t, txt = this.units === 'mph' ? Math.round(t * 1.8 + 32) + '°F' : Math.round(t) + '°C';
      c.font = "500 12px 'SV UI'"; glow(condCol((t - 100) / 30)); // (green up to 100°C, pink by 130°C)
      c.fillText(`WATER ${txt}${E.k < 0.98 ? ' · −' + Math.round((1 - E.k) * 100) + '%' : ''}`, cx, 133); // (and the power it's costing)
      if (E.gb >= 0.15) { // (a damaged gearbox: how bad, and the gear it's lost)
        const ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10] || 'th');
        glow(condCol(E.gb)); c.fillText(E.lost ? `GEARBOX · NO ${ord(E.lost).toUpperCase()}` : E.gb >= 0.35 ? 'GEARBOX · MISSES' : 'GEARBOX · SLOW', cx, 150);
      }
    }
    c.shadowBlur = 0; c.setTransform(1, 0, 0, 1, 0, 0);
  }

  pitMenu(s, sel, open) {
    const el = this.pitEl;
    // (qualifying: driven out of the box at the start of the session, no stop was made: nothing to show)
    if (!open || !s || !s.pitting || (!s.pitReq && s.pitPhase === 'out')) { el.classList.remove('on'); return; }
    el.classList.add('on');
    const r = s.pitReq || {};
    let html = `<h3>${r.garage ? 'Garage' : 'Pit Stop'}</h3>`;
    if (s.pitPhase === 'stop' || s.pitPhase === 'out') {
      const done = s.pitPhase === 'out' ? 1 : 1 - Math.max(0, s.pitTimer) / (s.pitTotal || 1);
      // a time penalty is served first, the crew waits
      const penLeft = s.pitPhase === 'stop' && s.penServing ? s.penServing - (s.pitTotal - s.pitTimer) : 0;
      const label = s.pitPhase === 'out' ? 'GO GO GO!' : penLeft > 0 ? 'SERVING PENALTY' : 'SERVICING';
      const val = s.pitPhase === 'out' ? '' : (penLeft > 0 ? penLeft : Math.max(0, s.pitTimer)).toFixed(1) + 's';
      html += `<div class="row"><span>${label}</span><span class="v">${val}</span></div><div class="bar"><i style="width:${(done * 100).toFixed(0)}%"></i></div>`;
    } else if (r.garage) {
      html += `<div class="row"><span>GARAGE</span><span class="v">BACK TO THE BOX</span></div>`;
      html += `<div class="foot">the crew is driving you in &middot; choose tyres in the garage</div>`;
    } else if (r.dt) {
      html += `<div class="row"><span>DRIVE-THROUGH</span><span class="v">NO STOP</span></div>`;
      html += `<div class="foot">penalty · the crew waves you straight through the pit lane</div>`;
    } else {
      // tyres, then each damaged part (how bad, in the car's condition colours; fix it or leave it, and what it adds),
      // then the stop it comes to
      html += `<div class="row${sel === 0 ? ' sel' : ''}"><span>TIRES</span><span class="v"><span class="tyre-dot" style="background:${TYRE_CSS[r.tyre] || '#777'}"></span>${(r.tyre || 'no change').toUpperCase()}</span></div>`;
      const parts = s.pitParts || [];
      if (!parts.length) html += `<div class="row dim"><span>REPAIRS</span><span class="v">NOT NEEDED</span></div>`;
      parts.forEach((x, k) => {
        const col = condCol(x.dmg / 0.72);
        html += `<div class="row part${sel === k + 1 ? ' sel' : ''}${x.fix ? '' : ' off'}"><span>${x.label.toUpperCase()}</span><i class="cond"><b style="width:${Math.round((1 - Math.min(1, x.dmg)) * 100)}%;background:${col};color:${col}"></b></i>`
          + `<span class="v">${x.fix ? `FIX <small>+${x.secs.toFixed(1)}s</small>` : 'LEAVE'}</span></div>`;
      });
      // (double stacking: queued behind your teammate, and how long they've left in the box)
      if (s.pitStack) html += `<div class="row stack"><span>BEHIND ${s.pitStack.name.toUpperCase()}</span><span class="v">${s.pitStack.left != null ? 'WAIT ' + s.pitStack.left.toFixed(1) + 's' : 'IN THE BOX'}</span></div>`;
      html += `<div class="row total"><span>STOP</span><span class="v">${(s.pitEst || 0).toFixed(1)}s</span></div>`;
      html += `<div class="foot">&#8593;&#8595; SELECT &nbsp; &#8592;&#8594; CHANGE &nbsp;&middot;&nbsp; the crew is driving you to the box</div>`;
    }
    this.set('pitm', el, html, true);
  }

  drawRadar(race) {
    const c = this.rc, W = this.radar.width, R = W / 2 - 6; // (room for the ring's soft edge)
    const pl = race.player || race.focus, p = pl.phys;
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(W / 2, W / 2, R, 0, Math.PI * 2); c.clip();
    const mapStyle = this.radarMap && this.radarMap !== 'off' && race.track.geo ? this.radarMap : null;
    // background
    const th = race.track.env.theme;
    c.fillStyle = th === 'coast' ? '#0a1420' : th === 'desert' ? '#1a1008' : th === 'city' ? '#0e0c14' : '#0a120c';
    if (mapStyle) c.fillStyle = '#0c0b10';
    c.globalAlpha = 0.72; c.fillRect(0, 0, W, W); c.globalAlpha = 1;
    const zk = RADAR_ZOOM[this.radarZoom] ?? 1;
    const zoom = (0.42 + Math.max(0, 1 - p.speed / 80) * 0.15) * zk;
    c.translate(W / 2, W / 2);
    c.rotate(p.h - Math.PI);
    c.scale(zoom, zoom);
    c.translate(-p.x, -p.z);
    // real map under the circuit (the canvas transform does the rotation; tiles are drawn in metres)
    if (mapStyle) {
      if (!this.tiles) this.tiles = new TileLayer(() => {});
      const r = (R / zoom) * 1.05;
      this.tiles.draw(c, race.track.geo, mapStyle, { scale: zoom }, 1, 1, (x, z) => [x, z], (sx) => sx === 0 ? [p.x - r, p.z - r] : [p.x + r, p.z + r], 1, 0.95);
    }
    c.lineJoin = 'round'; c.lineCap = 'round';
    const lw = 1 / Math.sqrt(zk); // keep lines readable when zoomed out
    if (this.roadPath) { c.globalAlpha = 0.22; c.strokeStyle = SV.red; c.lineWidth = 6 * lw; c.stroke(this.roadPath); c.globalAlpha = 1; }
    // the circuit: a glowing blue line (shadow blur is in screen pixels, so it survives the zoom)
    c.shadowColor = SV.blue; c.shadowBlur = 4;
    c.globalAlpha = 0.35; c.strokeStyle = SV.blue; c.lineWidth = (mapStyle ? 16 : 24) * lw; c.stroke(this.path); c.globalAlpha = 1;
    c.strokeStyle = SV.blue; c.lineWidth = (mapStyle ? 7 : 11) * lw; c.stroke(this.path);
    c.shadowBlur = 0;
    // marshal sectors showing a flag
    const rc = race.rc;
    if (rc && rc.on && rc.flag.some(f => f)) {
      if (!this.secPaths || this.secPaths.rc !== rc) this.secPaths = this.buildSectorPaths(race);
      const blink = Math.floor(performance.now() / 350) % 2;
      rc.flag.forEach((f, k) => {
        if (!f) return;
        c.strokeStyle = f === 'g' ? '#22c84a' : blink && f === 'dy' ? '#8a6a08' : '#ffc414';
        c.lineWidth = (mapStyle ? 9 : 17) * lw; c.stroke(this.secPaths[k]);
      });
    }
    // pit lane: grey, or blue when the racing line is on (it's where the blue guide line goes)
    if (this.pitPath) {
      const lineOn = race.lineMode && race.lineMode !== 'off';
      c.strokeStyle = lineOn ? SV.cyan : SV.blue; c.lineWidth = 5 * lw; c.stroke(this.pitPath);
    }
    // start line (point-to-point: and the finish line)
    const T = race.T;
    for (const i of T.open ? [0, T.finish] : [0]) {
      c.save(); c.translate(T.X[i], T.Z[i]); c.rotate(Math.atan2(T.FX[i], -T.FZ[i]));
      c.fillStyle = '#fff'; c.fillRect(-12, -3, 24, 6); c.fillStyle = '#000'; for (let k = -12; k < 12; k += 6) c.fillRect(k, -3, 3, 3), c.fillRect(k + 3, 0, 3, 3);
      c.restore();
    }
    // blips
    for (const car of race.cars) {
      if (car === pl || car.gone) continue;
      const s = 6 / zoom, col = hex(car.team.main === 0x121214 ? 0x8a8a96 : car.team.main);
      c.beginPath(); c.arc(car.phys.x, car.phys.z, s + 1.5 / zoom, 0, Math.PI * 2); c.fillStyle = SV.ink; c.fill();
      c.beginPath(); c.arc(car.phys.x, car.phys.z, s, 0, Math.PI * 2); c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 3; c.fill(); c.shadowBlur = 0;
    }
    // the safety car: a blinking yellow dot, a little bigger than a car's
    if (race.sc && race.sc.model && Math.floor(performance.now() / 350) % 2 === 0) {
      const m = race.sc.model.position, s = 8 / zoom;
      c.beginPath(); c.arc(m.x, m.z, s + 1.5 / zoom, 0, Math.PI * 2); c.fillStyle = SV.ink; c.fill();
      c.beginPath(); c.arc(m.x, m.z, s, 0, Math.PI * 2); c.fillStyle = '#ffc414'; c.shadowColor = '#ffc414'; c.shadowBlur = 6; c.fill(); c.shadowBlur = 0;
    }
    c.restore();
    // ring: a glowing red hairline with compass ticks that turn with the map
    const th2 = p.h - Math.PI;
    c.save(); c.translate(W / 2, W / 2);
    c.shadowColor = SV.red; c.shadowBlur = 4; c.strokeStyle = SV.red; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2;
    for (let k = 0; k < 8; k++) { const a = th2 + k * Math.PI / 4, l = k % 2 ? 6 : 10; c.beginPath(); c.moveTo(Math.sin(a) * R, -Math.cos(a) * R); c.lineTo(Math.sin(a) * (R - l), -Math.cos(a) * (R - l)); c.stroke(); }
    // player arrow
    c.beginPath(); c.moveTo(0, -12); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath();
    c.shadowColor = SV.hot; c.shadowBlur = 4; c.fillStyle = SV.hot; c.fill();
    // north marker, just inside the ring
    c.shadowColor = SV.red; c.shadowBlur = 3; c.fillStyle = SV.red;
    c.font = "500 15px 'SV UI'"; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', Math.sin(th2) * (R - 18), -Math.cos(th2) * (R - 18) + 1);
    c.restore();
  }

  buildSectorPaths(race) {
    const T = race.T, rc = race.rc, out = Array.from({ length: rc.M }, () => new Path2D());
    out.rc = rc;
    let prev = -1;
    const n = T.open ? T.cut + 1 : T.N;
    for (let i = 0; i <= n; i++) {
      const j = i % T.N, k = rc.SEC[j];
      if (T.open && i === n) break;
      if (k !== prev) { if (prev >= 0) out[prev].lineTo(T.X[j], T.Z[j]); out[k].moveTo(T.X[j], T.Z[j]); prev = k; }
      else out[k].lineTo(T.X[j], T.Z[j]);
    }
    return out;
  }

  help(html, ms = 5000, shift = false) {
    const e = this.el.help;
    e.innerHTML = html; e.classList.add('on'); e.classList.toggle('shift', shift || this.mode === 'race' || this.mode === 'quali'); // (clear of the timing tower)
    clearTimeout(this.timers.help);
    this.timers.help = setTimeout(() => e.classList.remove('on'), ms);
  }
  // the broadcast graphic (a 2005 TV lower-third): { tag, name, sub, alert, win } from broadcast.js caption; wipes in,
  // holds while they talk about it, wipes out
  cap(c, ms = 5500) {
    const e = $('h-cap'); if (!e) return;
    clearTimeout(this.timers.cap); clearTimeout(this.timers.capIn);
    if (!c) { e.classList.remove('on'); return; }
    const fill = () => {
      e.querySelector('.bc-tag b').textContent = c.tag || '';
      e.querySelector('.bc-name').textContent = c.name || '';
      const sub = e.querySelector('.bc-sub'); sub.textContent = c.sub || ''; sub.style.display = c.sub ? '' : 'none';
      e.classList.toggle('alert', !!c.alert); e.classList.toggle('win', !!c.win); e.classList.toggle('notag', !c.tag);
      void e.offsetWidth; e.classList.add('on');
      this.timers.cap = setTimeout(() => e.classList.remove('on'), ms);
    };
    // (one already up: it wipes out first)
    if (e.classList.contains('on')) { e.classList.remove('on'); this.timers.capIn = setTimeout(fill, 320); } else fill();
  }
  center(html, cls = '', ms = 1800) {
    const e = this.el.center;
    e.className = 'center-msg ' + cls;
    e.innerHTML = html;
    void e.offsetWidth;
    e.classList.add('on');
    clearTimeout(this.timers.center);
    if (ms) this.timers.center = setTimeout(() => e.classList.remove('on'), ms);
  }
  split(html, ms = 3000) {
    const e = this.el.split; e.innerHTML = html; e.classList.add('on');
    clearTimeout(this.timers.split); this.timers.split = setTimeout(() => e.classList.remove('on'), ms);
  }
  area(name, sub, ms = 4000) {
    const e = this.el.area; e.innerHTML = `${name}<small>${sub}</small>`; e.classList.add('on');
    clearTimeout(this.timers.area); this.timers.area = setTimeout(() => e.classList.remove('on'), ms);
  }
  lights(n, on = true) {
    this.el.lights.classList.toggle('on', on);
    this.el.lights.querySelectorAll('i').forEach((i, k) => i.classList.toggle('lit', k < n));
  }
}
