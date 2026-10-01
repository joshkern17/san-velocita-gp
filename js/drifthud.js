// Drift score HUD: live chain counter, multiplier, angle meter, bonus pop-ups, banking (points fly into your total) and
// losing a chain (the digits fall off the screen). Reads a DriftScore (drift.js) and plays its sounds.
import { sfx, DriftPad } from './audio.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
// multiplier colour tiers
const TIERS = [[1, '#ffffff'], [2, '#7fe7ff'], [3.5, '#5cff9d'], [5, '#ff5ce1'], [7, '#ff9a3c'], [9, '#ffd84a']];
const tierOf = (m) => { let c = TIERS[0][1], k = 0; TIERS.forEach(([t, col], i) => { if (m >= t) { c = col; k = i; } }); return { c, k }; };
// effects run through the Web Animations API: no forced layout to restart them, and transform / opacity animate on the
// compositor
const BUMP = [{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }];
const PULSE = [{ transform: 'skewX(-14deg) scale(1.8)', opacity: 0.6 }, { transform: 'skewX(-14deg) scale(1)', opacity: 1 }];
const ENTER = [{ transform: 'translateX(-50%) scale(.4) rotate(-6deg)' }, { transform: 'translateX(-50%) scale(1)' }];
const SWING = [{ transform: 'translateX(-50%)' }, { transform: 'translateX(-50%) scale(1.12) skewX(-10deg)', offset: 0.3 }, { transform: 'translateX(-50%) scale(1.04) skewX(6deg)', offset: 0.6 }, { transform: 'translateX(-50%)' }];
const SHAKE = [{ transform: 'none' }, { transform: 'translate(-8px, 3px)' }, { transform: 'translate(7px, -4px)' }, { transform: 'translate(-5px, 2px)' }, { transform: 'translate(3px, -1px)' }, { transform: 'none' }];
const PLUS = [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none', offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0, transform: 'translateY(-14px)' }];
const WHY = { crash: 'CRASHED', spin: 'SPUN OUT', off: 'OFF TRACK', reset: 'LOST' };

export class DriftHUD {
  constructor(root) {
    this.root = root;
    const el = document.createElement('div'); el.className = 'drift'; el.innerHTML = `
      <div class="drift-glow"></div>
      <div class="drift-chain">
        <div class="drift-plate"></div>
        <div class="drift-tag pd">DRIFT</div>
        <div class="drift-main"><div class="drift-pts pd">0</div><div class="drift-mult pd"><small>X</small><b>1.0</b></div></div>
        <div class="drift-meter"><div class="drift-bar"><i class="l"></i><i class="r"></i><em></em><em class="b l"></em><em class="b r"></em></div><span class="drift-ang pd">0&deg;</span></div>
        <div class="drift-grace"><i></i></div>
      </div>
      <div class="drift-pops"></div>
      <div class="drift-fx"></div>`;
    root.appendChild(el);
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.chain = q('.drift-chain'); this.multEl = q('.drift-mult b'); this.multBox = q('.drift-mult'); this.ptsEl = q('.drift-pts');
    this.barL = q('.drift-bar i.l'); this.barR = q('.drift-bar i.r'); this.angEl = q('.drift-ang'); this.graceEl = q('.drift-grace i');
    // the running total: its own row under the lap times
    const row = document.createElement('div'); row.className = 'hud-row drift-total';
    row.innerHTML = '<span class="lbl">DRIFT</span><span class="pd val">0</span><span class="drift-plus pd"></span>';
    const rows = root.querySelector('.hud-rows'); (rows || el).appendChild(row);
    this.totalRow = row; this.totalEl = row.querySelector('.val'); this.totalBox = row; this.plusEl = row.querySelector('.drift-plus');
    this.pops = q('.drift-pops'); this.fx = q('.drift-fx'); this.glow = q('.drift-glow');
    this.bits = []; // falling digits / flying numbers
    this.disp = 0; this.dispTotal = 0; this.tickN = 0; this.tickT = 0; this.lastK = -1;
    this.pad = null;
    this.cache = {}; this.ptsT = 0;
    this.hide();
  }
  show() { this.el.style.display = ''; this.totalRow.style.display = ''; this.on = true; if (!this.pad) this.pad = new DriftPad(); }
  hide() { this.el.style.display = 'none'; this.totalRow.style.display = 'none'; this.on = false; if (this.pad) { this.pad.stop(); this.pad = null; } }
  quiet() { if (this.pad) this.pad.set(0, 1); }
  reset() { this.disp = 0; this.dispTotal = 0; this.cache = {}; this.totalEl.textContent = '0'; this.chain.classList.remove('on'); for (const b of this.bits) b.el.remove(); this.bits = []; this.pops.innerHTML = ''; }

  anim(node, frames, ms, ease = 'cubic-bezier(.3,1.6,.5,1)') { if (node.animate) node.animate(frames, { duration: ms, easing: ease }); }
  // set text only when it changed (every write re-draws the text)
  write(key, node, text) { if (this.cache[key] !== text) { this.cache[key] = text; node.textContent = text; } }
  pop(text, color = '#fff', big = false) {
    const p = document.createElement('div'); p.className = 'drift-pop pd' + (big ? ' big' : ''); p.style.color = color; p.innerHTML = text;
    this.pops.appendChild(p); setTimeout(() => p.remove(), 1400);
  }

  update(D, dt) {
    if (!this.on || !D) return;
    // events first
    for (const e of D.events.splice(0)) this.onEvent(e, D);
    const active = D.active;
    this.chain.classList.toggle('on', active);
    this.chain.classList.toggle('grace', active && !D.drifting);
    const val = D.value;
    // rolling counter (fast catch-up, never overshoots). The number is re-drawn at most 30 times a second and only
    // when its digits change: re-rasterising big outlined text every frame is what cost frames while counting up
    this.disp += (val - this.disp) * Math.min(1, dt * 14);
    if (Math.abs(val - this.disp) < 1) this.disp = val;
    this.ptsT -= dt;
    if (active && (this.ptsT <= 0 || this.disp === val)) { this.ptsT = 1 / 30; this.write('pts', this.ptsEl, fmt(this.disp)); }
    // bump the counter every 1,000
    const k = Math.floor(val / 1000);
    if (active && k > this.lastK && this.lastK >= 0) this.anim(this.ptsEl, BUMP, 220);
    this.lastK = active ? k : -1;
    // multiplier + colour tier (style writes only when they change: each one re-styles the whole banner)
    const tier = tierOf(D.mult);
    this.write('mult', this.multEl, D.mult.toFixed(1));
    if (this.cache.tier !== tier.k) {
      this.cache.tier = tier.k;
      this.chain.style.setProperty('--tier', tier.c); this.chain.dataset.tier = tier.k; this.glow.style.setProperty('--tier', tier.c);
    }
    // angle bar: fills toward the side you're sliding, full at 70 degrees (quantised so small wobbles don't re-draw)
    const a = Math.round(Math.min(70, D.angle)) / 70, left = (D.side || 1) < 0;
    const bar = (left ? -a : a).toFixed(3);
    if (this.cache.bar !== bar) {
      this.cache.bar = bar;
      this.barL.style.transform = `scaleX(${left ? a : 0})`; this.barR.style.transform = `scaleX(${left ? 0 : a})`;
    }
    this.write('ang', this.angEl, Math.round(D.angle) + '°');
    this.chain.classList.toggle('big', D.angle >= 45 && D.drifting);
    const gr = D.grace.toFixed(2);
    if (this.cache.grace !== gr) { this.cache.grace = gr; this.graceEl.style.transform = `scaleX(${gr})`; }
    // screen-edge glow for high multipliers
    const go = (active ? Math.min(0.85, Math.max(0, (D.mult - 1.5) / 7)) * (D.drifting ? 1 : 0.5) : 0).toFixed(2);
    if (this.cache.glow !== go) { this.cache.glow = go; this.glow.style.opacity = go; }
    // score ticks: rising pentatonic plucks as points pour in (rate-limited)
    this.tickT -= dt;
    if (active && D.drifting && this.tickT <= 0 && val > (this.tickN + 1) * 120 * Math.max(1, D.mult * 0.6)) {
      this.tickN++; this.tickT = 0.07; sfx.driftTick(Math.min(14, 2 + Math.floor(this.tickN / 3)));
    }
    if (!active) this.tickN = 0;
    if (this.pad) this.pad.set(active ? (D.drifting ? 1 : 0.55) : 0, D.mult, active ? Math.max(0.2, D.grace) : 1);
    // total counter rolls up after a bank
    this.dispTotal += (D.total - this.dispTotal) * Math.min(1, dt * 5);
    if (Math.abs(D.total - this.dispTotal) < 1) this.dispTotal = D.total;
    this.write('total', this.totalEl, fmt(this.dispTotal));
    // falling / flying bits
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i]; b.t += dt;
      if (b.kind === 'fall') {
        b.vy += 2600 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
        b.el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.rot}deg)`;
        b.el.style.opacity = Math.max(0, 1 - Math.max(0, b.t - 0.6) / 0.9);
        if (b.t > 1.6) { b.el.remove(); this.bits.splice(i, 1); }
      } else if (b.kind === 'fly') {
        const k2 = Math.min(1, b.t / b.dur), e = k2 * k2 * (3 - 2 * k2);
        const x = b.x0 + (b.x1 - b.x0) * e, y = b.y0 + (b.y1 - b.y0) * e - Math.sin(k2 * Math.PI) * 60;
        b.el.style.transform = `translate(${x}px, ${y}px) scale(${1 - 0.7 * e})`;
        b.el.style.opacity = k2 > 0.85 ? (1 - k2) / 0.15 : 1;
        if (k2 >= 1) { b.el.remove(); this.bits.splice(i, 1); this.anim(this.totalEl, BUMP, 300, 'ease-out'); }
      }
    }
  }

  onEvent(e, D) {
    const tier = tierOf(e.mult || D.mult);
    switch (e.type) {
      case 'start': sfx.driftStart(); this.disp = 0; this.chain.classList.remove('instant'); this.anim(this.chain, ENTER, 350); break;
      case 'mult':
        sfx.driftMult(e.mult); this.anim(this.multBox, PULSE, 380);
        if (e.why === 'HOLD') this.pop(`X${e.mult.toFixed(1)}`, tier.c);
        break;
      case 'transition': sfx.driftTransition(); this.pop(e.n > 1 ? `TRANSITION X${e.n}` : 'TRANSITION', '#7fe7ff', true); this.anim(this.chain, SWING, 400, 'ease-out'); break;
      case 'bonus': sfx.driftBonus(); this.pop(e.label + (e.pts ? ` <small>+${fmt(e.pts)}</small>` : ''), '#ffd84a', true); break;
      case 'bank': {
        if (e.pts <= 0) break;
        sfx.driftBank(Math.min(1, e.pts / 20000));
        // the chain number flies up into the total
        const r0 = this.ptsEl.getBoundingClientRect(), r1 = this.totalEl.getBoundingClientRect(), z = this.zoom();
        const f = document.createElement('div'); f.className = 'drift-fly pd'; f.textContent = fmt(e.pts); f.style.color = tier.c;
        this.fx.appendChild(f);
        this.bits.push({ kind: 'fly', el: f, t: 0, dur: 0.65, x0: r0.left / z, y0: r0.top / z, x1: r1.left / z, y1: r1.top / z });
        this.plusEl.textContent = '+' + fmt(e.pts); this.anim(this.plusEl, PLUS, 1400, 'ease-out');
        if (e.pts >= 10000) this.pop(e.pts >= 40000 ? 'LEGENDARY!' : e.pts >= 20000 ? 'INSANE!' : 'SICK DRIFT!', '#ffd84a', true);
        break;
      }
      case 'lose': {
        if (e.pts > 0) {
          sfx.driftLose();
          this.dropDigits(fmt(Math.max(e.pts, this.disp)));
          this.pop(WHY[e.why] || 'LOST', '#ff4a4a', true);
          this.anim(this.el, SHAKE, 350, 'linear');
        }
        this.disp = 0;
        break;
      }
    }
  }
  zoom() { return parseFloat(document.documentElement.style.getPropertyValue('--ui')) || 1; } // (set inline by fitScreen: no style recalc)
  // split the chain number into digits that tumble down off the screen
  dropDigits(text) {
    const r = this.ptsEl.getBoundingClientRect(), z = this.zoom();
    const w = r.width / z / Math.max(1, text.length);
    [...text].forEach((ch, i) => {
      const d = document.createElement('div'); d.className = 'drift-digit pd'; d.textContent = ch;
      this.fx.appendChild(d);
      const x = r.left / z + i * w, y = r.top / z;
      this.bits.push({ kind: 'fall', el: d, t: 0, x, y, vx: (Math.random() - 0.5) * 380 + (i - text.length / 2) * 40, vy: -380 - Math.random() * 380, rot: 0, vr: (Math.random() - 0.5) * 720 });
      d.style.transform = `translate(${x}px, ${y}px)`;
    });
    this.chain.classList.add('instant'); this.chain.classList.remove('on'); // (the digits replace it at once)
  }
}
