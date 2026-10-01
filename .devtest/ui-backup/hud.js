// HUD: DOM updates + circular radar
import { TileLayer } from './geo.js';
const $ = (id) => document.getElementById(id);

export function fmtTime(t, dp = 2) {
  if (!isFinite(t) || t <= 0) return dp === 0 ? '0:00' : '0:00.' + '0'.repeat(dp);
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(dp);
}
const ord = (n) => { const s = ['TH', 'ST', 'ND', 'RD'], v = n % 100; return s[(v - 20) % 10] || s[v] || s[0]; };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const RADAR_ZOOM = { near: 1.35, normal: 1, far: 0.62, vfar: 0.36 };
export const RADAR_ZOOMS = ['near', 'normal', 'far', 'vfar'];
const TYRE_CSS = { soft: '#e0302a', medium: '#f2d22a', hard: '#f0f0f0', wet: '#3a8af0' };

export class HUD {
  constructor() {
    this.el = {
      pos: $('h-pos'), lap: $('h-lap'), time: $('h-time'), last: $('h-last'), best: $('h-best'),
      speed: $('h-speed'), gear: $('h-gear'), rpm: $('h-rpm'), unit: $('h-unit'), tower: $('h-tower'),
      help: $('h-help'), lights: $('h-lights'), center: $('h-center'), split: $('h-split'), area: $('h-area'), wrong: $('h-wrong'),
    };
    this.radar = $('radar');
    this.carCv = $('h-car'); this.cc = this.carCv.getContext('2d');
    this.pitEl = $('h-pit');
    this.rc = this.radar.getContext('2d');
    this.cache = {};
    this.timers = {};
    this.units = 'kmh';
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
    this.el.tower.style.display = mode === 'race' ? '' : 'none';
    this.el.help.classList.remove('shift');
  }

  update(s, race) {
    if (!s) return;
    const E = this.el;
    if (this.mode === 'race') this.set('pos', E.pos, `${s.pos}<small>${ord(s.pos)}</small><small style="color:#aab6ca">/${s.total}</small>`, true);
    else this.set('pos', E.pos, `<small style="font-size:34px;color:#fff">TIME TRIAL</small>`, true);
    this.set('lap', E.lap, this.mode === 'race' ? `${s.lap}/${s.laps}` : `${Math.max(1, race.player.lap)}`);
    this.set('time', E.time, fmtTime(s.lapTime));
    this.set('last', E.last, s.last > 0 ? fmtTime(s.last) : '\u2014');
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
    if (this.cache.rpm !== rw) { this.cache.rpm = rw; E.rpm.style.width = rw + '%'; E.rpm.classList.toggle('hot', r > 0.93); }
    E.wrong.classList.toggle('on', !!s.wrongWay);
    if (this.mode === 'race') {
      const html = s.standings.slice(0, 12).map(r =>
        `<div class="r${r.isPlayer ? ' me' : ''}"><span class="n">${r.pos}</span><span class="c" style="background:${hex(r.color)}"></span><span class="nm">${r.name}</span>${r.pit ? '<span class="pt">PIT</span>' : ''}${s.wear ? `<span class="ty" style="background:${TYRE_CSS[r.tyre]}">${r.tyre[0].toUpperCase()}</span>` : ''}<span class="g">${r.gap}</span></div>`).join('');
      if (this.cache.towerT === undefined || performance.now() - this.cache.towerT > 250) { this.cache.towerT = performance.now(); this.set('tower', E.tower, html, true); }
    }
    this.drawRadar(race);
    this.drawCar(s);
    const plan = s.wear && s.plan ? `BOX LAP ${s.plan.lap}<i style="background:${TYRE_CSS[s.plan.tyre]}"></i>${s.plan.tyre.toUpperCase()}` : '';
    this.set('plan', $('h-plan'), plan, true);
  }

  // top-down car: tyre wear per axle, wing / chassis damage
  drawCar(s) {
    const c = this.cc, W = this.carCv.width, H = this.carCv.height;
    const show = s.wear || s.damage;
    this.carCv.style.display = show ? '' : 'none';
    if (!show) return;
    const key = [s.tyre.c, (s.tyre.wf * 50) | 0, (s.tyre.wr * 50) | 0, (s.dmg.fw * 20) | 0, (s.dmg.rw * 20) | 0, (s.dmg.ch * 20) | 0].join();
    if (this.cache.car === key) return; this.cache.car = key;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,0.62)'; c.fillRect(0, 0, W, H);
    const wearCol = (w) => w > 0.6 ? '#5ad84a' : w > 0.3 ? '#f2c83a' : '#ff4a3a';
    const dmgCol = (d) => d < 0.15 ? '#9aa6b8' : d < 0.45 ? '#f2a03a' : '#ff3a2a';
    const cx = W / 2;
    // front wing
    if (s.dmg.fw < 0.72) { c.fillStyle = dmgCol(s.dmg.fw); c.fillRect(cx - 34, 14, 68, 7); } else { c.strokeStyle = '#ff3a2a'; c.setLineDash([4, 3]); c.strokeRect(cx - 34, 14, 68, 7); c.setLineDash([]); }
    // body
    c.fillStyle = dmgCol(s.dmg.ch);
    c.beginPath(); c.moveTo(cx - 5, 22); c.lineTo(cx + 5, 22); c.lineTo(cx + 13, 70); c.lineTo(cx + 18, 100); c.lineTo(cx + 10, 120); c.lineTo(cx - 10, 120); c.lineTo(cx - 18, 100); c.lineTo(cx - 13, 70); c.closePath(); c.fill();
    // rear wing
    if (s.dmg.rw < 0.72) { c.fillStyle = dmgCol(s.dmg.rw); c.fillRect(cx - 24, 122, 48, 8); } else { c.strokeStyle = '#ff3a2a'; c.setLineDash([4, 3]); c.strokeRect(cx - 24, 122, 48, 8); c.setLineDash([]); }
    // tyres
    const tyre = (x, y, w, h, wear) => { c.fillStyle = s.wear ? wearCol(wear) : '#777'; c.fillRect(x, y, w, h); c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(x, y, w, h); };
    tyre(cx - 33, 30, 14, 24, s.tyre.wf); tyre(cx + 19, 30, 14, 24, s.tyre.wf);
    tyre(cx - 36, 88, 16, 28, s.tyre.wr); tyre(cx + 20, 88, 16, 28, s.tyre.wr);
    // compound + %
    c.font = '16px Anton'; c.textAlign = 'center';
    c.fillStyle = TYRE_CSS[s.tyre.c]; c.fillText(s.tyre.c.toUpperCase(), cx, 146);
    if (s.wear) { c.font = '11px Arimo'; c.fillStyle = '#fff'; c.fillText(Math.round(s.tyre.wf * 100) + '%', cx, 64); c.fillText(Math.round(s.tyre.wr * 100) + '%', cx, 86); }
  }

  pitMenu(s, sel, open) {
    const el = this.pitEl;
    if (!open || !s || !s.pitting) { el.classList.remove('on'); return; }
    el.classList.add('on');
    const r = s.pitReq || {};
    const dmgAny = Math.max(s.dmg.fw, s.dmg.rw, s.dmg.ch) > 0.02;
    let html = `<h3>Pit Stop</h3>`;
    if (s.pitPhase === 'stop' || s.pitPhase === 'out') {
      const done = s.pitPhase === 'out' ? 1 : 1 - Math.max(0, s.pitTimer) / (s.pitTotal || 1);
      html += `<div class="row"><span>${s.pitPhase === 'out' ? 'GO GO GO!' : 'SERVICING'}</span><span class="v">${s.pitPhase === 'out' ? '' : Math.max(0, s.pitTimer).toFixed(1) + 's'}</span></div><div class="bar"><i style="width:${(done * 100).toFixed(0)}%"></i></div>`;
    } else {
      html += `<div class="row${sel === 0 ? ' sel' : ''}"><span>TYRES</span><span class="v"><span class="tyre-dot" style="background:${TYRE_CSS[r.tyre] || '#777'}"></span>${(r.tyre || 'no change').toUpperCase()}</span></div>`;
      html += `<div class="row${sel === 1 ? ' sel' : ''}"><span>REPAIR</span><span class="v">${dmgAny ? (r.repair ? 'FIX DAMAGE' : 'NO') : 'NOT NEEDED'}</span></div>`;
      html += `<div class="foot">&#8593;&#8595; SELECT &nbsp; &#8592;&#8594; CHANGE &nbsp;·&nbsp; the crew is driving you to the box</div>`;
    }
    this.set('pitm', el, html, true);
  }

  drawRadar(race) {
    const c = this.rc, W = this.radar.width, R = W / 2 - 6;
    const pl = race.player || race.focus, p = pl.phys;
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(W / 2, W / 2, R, 0, Math.PI * 2); c.clip();
    const mapStyle = this.radarMap && this.radarMap !== 'off' && race.track.geo ? this.radarMap : null;
    // background
    const th = race.track.env.theme;
    c.fillStyle = th === 'coast' ? '#3a6f86' : th === 'desert' ? '#a88458' : th === 'city' ? '#56585e' : '#5d7a44';
    if (mapStyle) c.fillStyle = '#1a1d22';
    c.globalAlpha = 0.82; c.fillRect(0, 0, W, W); c.globalAlpha = 1;
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
    if (this.roadPath) { c.strokeStyle = mapStyle ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.35)'; c.lineWidth = 11 * lw; c.stroke(this.roadPath); c.strokeStyle = mapStyle ? 'rgba(210,210,200,.55)' : '#9a9c9e'; c.lineWidth = 6 * lw; c.stroke(this.roadPath); }
    if (mapStyle) { c.globalAlpha = 0.75; c.strokeStyle = '#000'; c.lineWidth = 16 * lw; c.stroke(this.path); c.strokeStyle = '#f2f2f2'; c.lineWidth = 9 * lw; c.stroke(this.path); c.globalAlpha = 1; }
    else { c.strokeStyle = '#000'; c.lineWidth = 26 * lw; c.stroke(this.path); c.strokeStyle = '#d6d6d6'; c.lineWidth = 17 * lw; c.stroke(this.path); }
    // pit lane: grey, or blue when the racing line is on (it's where the blue guide line goes)
    if (this.pitPath) {
      const lineOn = race.lineMode && race.lineMode !== 'off';
      c.strokeStyle = '#000'; c.lineWidth = 12 * lw; c.stroke(this.pitPath);
      c.strokeStyle = lineOn ? '#3a9cff' : '#8d939c'; c.lineWidth = 6.5 * lw; c.stroke(this.pitPath);
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
      const s = 11 / zoom;
      c.fillStyle = '#000'; c.fillRect(car.phys.x - s / 2 - 2 / zoom, car.phys.z - s / 2 - 2 / zoom, s + 4 / zoom, s + 4 / zoom);
      c.fillStyle = hex(car.team.main === 0x121214 ? 0x555555 : car.team.main); c.fillRect(car.phys.x - s / 2, car.phys.z - s / 2, s, s);
    }
    c.restore();
    // ring
    c.lineWidth = 6; c.strokeStyle = '#000'; c.beginPath(); c.arc(W / 2, W / 2, R, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(W / 2, W / 2, R - 4, 0, Math.PI * 2); c.stroke();
    // player arrow
    c.save(); c.translate(W / 2, W / 2);
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath();
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; c.stroke(); c.fill();
    c.restore();
    // north marker
    const th2 = p.h - Math.PI;
    const nx = W / 2 + Math.sin(th2) * (R - 2), ny = W / 2 - Math.cos(th2) * (R - 2);
    c.beginPath(); c.arc(nx, ny, 10, 0, Math.PI * 2); c.fillStyle = '#000'; c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 13px Arimo'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', nx, ny + 1);
  }

  help(html, ms = 5000, shift = false) {
    const e = this.el.help;
    e.innerHTML = html; e.classList.add('on'); e.classList.toggle('shift', shift || this.mode === 'race');
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
