// HUD: DOM updates + circular radar
import { TileLayer } from './geo.js';
const $ = (id) => document.getElementById(id);

export function fmtTime(t, dp = 2) {
  if (!isFinite(t) || t <= 0) return dp === 0 ? '0:00' : '0:00.' + '0'.repeat(dp);
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(dp);
}
const pad2 = (n) => String(n).padStart(2, '0');
// tower name: the surname in full ("M. OKAFOR" -> OKAFOR); you stay YOU
const code = (r) => r.isPlayer ? 'YOU' : String(r.name).trim().split(/\s+/).pop().toUpperCase() || r.name;
// canvas drawing uses the design system's colours and fonts (css/sv.css)
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
const TYRE_CSS = { soft: '#e0302a', medium: '#f2d22a', hard: '#f0f0f0', wet: '#3a8af0' };

export class HUD {
  constructor() {
    this.el = {
      pos: $('h-pos'), posLbl: $('h-poslbl'), lap: $('h-lap'), time: $('h-time'), last: $('h-last'), best: $('h-best'),
      speed: $('h-speed'), gear: $('h-gear'), rpm: $('h-rpm'), unit: $('h-unit'), tower: $('h-tower'),
      help: $('h-help'), lights: $('h-lights'), center: $('h-center'), split: $('h-split'), area: $('h-area'), wrong: $('h-wrong'),
      timeLbl: $('h-timelbl'), penRow: $('h-penrow'), pen: $('h-pen'), deltaRow: $('h-deltarow'), delta: $('h-delta'),
      flag: $('h-flag'), flagI: $('h-flag-i'), flagT: $('h-flag-t'), flagS: $('h-flag-s'), flagBar: $('h-flag-bar'), flagD: $('h-flag-d'), feed: $('h-rc'),
    };
    this.feedEls = [];
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

  reset(mode) {
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
    this.secPaths = null; this.quali = null;
  }

  update(s, race) {
    if (!s) return;
    this.quali = s.quali;
    const E = this.el;
    const Q = s.quali;
    this.set('poslbl', E.posLbl, this.mode === 'race' ? 'POSITION' : Q ? 'SESSION' : 'MODE');
    if (this.mode === 'race') this.set('pos', E.pos, `${pad2(s.pos)}<small> / ${pad2(s.total)}</small>`, true);
    else if (Q) {
      // the session clock where your position goes (bad-red in the last minute, the chequered flag at zero)
      const c = Q.left <= 0 ? '<span class="qclock end">FLAG</span>' : `<span class="qclock${Q.left < 60 ? ' late' : ''}">${fmtTime(Math.ceil(Q.left), 0)}</span>`;
      this.set('pos', E.pos, c, true);
    }
    else this.set('pos', E.pos, `<small class="tt">TIME TRIAL</small>`, true);
    if (Q) this.set('lap', E.lap, `<span class="qstat">${Q.status}</span>`, true);
    else this.set('lap', E.lap, this.mode === 'race' ? `${pad2(s.lap)} / ${pad2(s.laps)}` : pad2(Math.max(1, race.player.lap)));
    // live delta to your best lap (qualifying, time trial)
    const dl = s.delta;
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
    const lim = s.pitting && s.pitPhase !== 'stop';
    this.set('unit', E.unit, lim ? 'PIT LIMITER' : this.units === 'mph' ? 'MPH' : 'KM/H');
    E.speed.classList.toggle('lim', !!lim);
    $('h-tow').classList.toggle('on', (s.slip || 0) > 0.3 && !lim);
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
        const t = !isFinite(r.best) ? '\u2014' : r.pos === 1 ? fmtTime(r.best, 3) : '+' + r.gap.toFixed(3);
        const fresh = r.flash !== undefined && now - r.flash < 3;
        return `<div class="r${r.isPlayer ? ' me' : ''}${fresh ? ' new' : ''}"><span class="n">${r.pos}</span><span class="c" style="background:${hex(r.color)}"></span><span class="nm">${code(r)}</span><span class="g q">${t}</span></div>`;
      }).join('');
      if (this.cache.towerT === undefined || performance.now() - this.cache.towerT > 250) { this.cache.towerT = performance.now(); this.set('tower', E.tower, html, true); }
    } else if (this.mode === 'race') {
      const html = TOWER_HEAD + s.standings.slice(0, 12).map(r =>
        `<div class="r${r.isPlayer ? ' me' : ''}"><span class="n">${r.pos}</span><span class="c" style="background:${hex(r.color)}"></span><span class="nm">${code(r)}</span>${r.pit ? '<span class="pt">PIT</span>' : ''}${r.pen ? `<span class="pn">+${r.pen}s</span>` : ''}${r.dt ? '<span class="pn">DT</span>' : ''}${s.wear ? `<span class="ty" style="background:${TYRE_CSS[r.tyre]}">${r.tyre[0].toUpperCase()}</span>` : ''}<span class="g">${r.gap || '\u2014'}</span></div>`).join('');
      if (this.cache.towerT === undefined || performance.now() - this.cache.towerT > 250) { this.cache.towerT = performance.now(); this.set('tower', E.tower, html, true); }
    }
    this.drawRadar(race);
    this.drawCar(s);
    const plan = s.wear && s.plan ? `BOX LAP ${s.plan.lap}<i style="background:${TYRE_CSS[s.plan.tyre]}"></i>${s.plan.tyre.toUpperCase()}` : '';
    this.set('plan', $('h-plan'), plan, true);
  }

  // race control's board: what the marshals are showing you right now (one thing at a time, most urgent first)
  flagBoard(rc) {
    let f = null, t = '', sub = '', bar = -1, delta = '', dcls = '';
    if (rc) {
      if (rc.dsq) { f = 'bk'; t = 'BLACK FLAG'; sub = 'Disqualified'; }
      else if (rc.giveBack) { f = 'y'; t = 'GIVE THE PLACE BACK'; sub = `Let ${rc.giveBack.name} past · ${Math.ceil(rc.giveBack.left)}s`; bar = rc.giveBack.left / rc.giveBack.total; }
      else if (rc.mo) { f = 'mo'; t = 'BLACK & ORANGE FLAG'; sub = rc.mo.laps > 1 ? `Box for repairs · ${rc.mo.laps} laps` : 'Box this lap for repairs'; }
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
      if (f) { E.flagI.className = 'rc-flag ' + f + (f === 'y' || f === 'dy' || f === 'blue' ? ' blink' : ''); E.flagI.textContent = f === 'vsc' ? 'VSC' : ''; E.flagT.textContent = t; E.flagS.textContent = sub; }
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
  drawCar(s) {
    const c = this.cc, W = this.carCv.width, H = this.carCv.height;
    const show = s.wear || s.damage;
    this.carCv.style.display = show ? '' : 'none';
    if (!show) return;
    const key = [SV.red, s.tyre.c, (s.tyre.wf * 50) | 0, (s.tyre.wr * 50) | 0, (s.dmg.fw * 20) | 0, (s.dmg.rw * 20) | 0, (s.dmg.ch * 20) | 0].join();
    if (this.cache.car === key) return; this.cache.car = key;
    c.clearRect(0, 0, W, H);
    const wearCol = (w) => w > 0.6 ? SV.good : w > 0.3 ? SV.amber : SV.bad;
    const dmgCol = (d) => d < 0.15 ? SV.blue : d < 0.45 ? SV.amber : SV.bad;
    const cx = W / 2, y0 = 6;
    c.shadowBlur = 3;
    const glow = (col) => { c.fillStyle = col; c.shadowColor = col; };
    // front wing, body, rear wing
    const wing = (x, y, w, h, d) => { if (d < 0.72) { glow(dmgCol(d)); c.fillRect(x, y, w, h); } else { c.strokeStyle = c.shadowColor = SV.bad; c.setLineDash([4, 3]); c.strokeRect(x, y, w, h); c.setLineDash([]); } };
    wing(cx - 30, y0 + 4, 60, 6, s.dmg.fw);
    glow(dmgCol(s.dmg.ch));
    c.beginPath(); c.moveTo(cx - 4, y0 + 11); c.lineTo(cx + 4, y0 + 11); c.lineTo(cx + 11, y0 + 56); c.lineTo(cx + 15, y0 + 86); c.lineTo(cx + 9, y0 + 104); c.lineTo(cx - 9, y0 + 104); c.lineTo(cx - 15, y0 + 86); c.lineTo(cx - 11, y0 + 56); c.closePath(); c.fill();
    wing(cx - 21, y0 + 106, 42, 7, s.dmg.rw);
    // tyres
    const tyre = (x, y, w, h, wear) => { glow(s.wear ? wearCol(wear) : '#6a6a72'); c.fillRect(x, y, w, h); };
    tyre(cx - 30, y0 + 18, 12, 22, s.tyre.wf); tyre(cx + 18, y0 + 18, 12, 22, s.tyre.wf);
    tyre(cx - 32, y0 + 70, 14, 26, s.tyre.wr); tyre(cx + 18, y0 + 70, 14, 26, s.tyre.wr);
    // wear % either side, the compound underneath
    c.textBaseline = 'middle';
    if (s.wear) {
      c.font = "500 15px 'SV UI'"; glow(SV.red);
      const pf = Math.round(s.tyre.wf * 100) + '%', pr = Math.round(s.tyre.wr * 100) + '%';
      c.textAlign = 'right'; c.fillText(pf, cx - 36, y0 + 30); c.fillText(pr, cx - 38, y0 + 84);
      c.textAlign = 'left'; c.fillText(pf, cx + 36, y0 + 30); c.fillText(pr, cx + 38, y0 + 84);
    }
    c.font = "500 17px 'SV UI'"; c.textAlign = 'center'; glow(TYRE_CSS[s.tyre.c]); c.fillText(s.tyre.c.toUpperCase(), cx, H - 12);
    c.shadowBlur = 0;
  }

  pitMenu(s, sel, open) {
    const el = this.pitEl;
    // (qualifying: driven out of the box at the start of the session, no stop was made: nothing to show)
    if (!open || !s || !s.pitting || (!s.pitReq && s.pitPhase === 'out')) { el.classList.remove('on'); return; }
    el.classList.add('on');
    const r = s.pitReq || {};
    const dmgAny = Math.max(s.dmg.fw, s.dmg.rw, s.dmg.ch) > 0.02;
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
      html += `<div class="row${sel === 0 ? ' sel' : ''}"><span>TYRES</span><span class="v"><span class="tyre-dot" style="background:${TYRE_CSS[r.tyre] || '#777'}"></span>${(r.tyre || 'no change').toUpperCase()}</span></div>`;
      html += `<div class="row${sel === 1 ? ' sel' : ''}"><span>REPAIR</span><span class="v">${dmgAny ? (r.repair ? 'FIX DAMAGE' : 'NO') : 'NOT NEEDED'}</span></div>`;
      html += `<div class="foot">&#8593;&#8595; SELECT &nbsp; &#8592;&#8594; CHANGE &nbsp;·&nbsp; the crew is driving you to the box</div>`;
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
