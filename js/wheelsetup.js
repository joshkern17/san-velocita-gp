// Wheel Setup (Options > Wheel): a racing wheel is set up once by pressing things, because every maker lays out its
// axes and buttons differently. Five steps on one screen: find it (press any button on it, hands off, so its resting
// axes are read), steering (full left, full right), pedals (each pressed and let go, so its true rest is read: Chrome
// reports an axis as 0 until it first moves), buttons (press the one you want for each pad button; Enter skips), and a
// live test. The result is input.js's wheel.cfg.
import { wheel, WHEEL_BTNS, bindHit, pedal, wheelAngle, allPads } from './input.js';

const BTN_LABEL = { ok: ['Select', 'A'], back: ['Back', 'B'], x: ['X', 'Team calls'], y: ['Y', 'Camera'], lb: ['Left paddle', 'Shift down'], rb: ['Right paddle', 'Shift up'],
  view: ['View', 'Reset car'], menu: ['Menu', 'Pause'], up: ['Up', 'D-pad'], down: ['Down', 'D-pad'], left: ['Left', 'D-pad'], right: ['Right', 'D-pad'] };
const STAGES = ['Find', 'Steering', 'Pedals', 'Buttons', 'Test'];
// the steps in order: [stage, the instruction, the line under it]
const STEPS = [
  ['find', 0, 'Center the wheel and take your feet off the pedals', 'Then press any button on the wheel.'],
  ['steer', 1, 'Turn the wheel all the way left, then all the way right', 'Then bring it back to the middle and press any button on the wheel.'],
  ['thr', 2, 'Press the throttle to the floor', 'Hold it there for a moment.'],
  ['thrUp', 2, 'Let the throttle go', 'Take your foot right off.'],
  ['brk', 2, 'Press the brake to the floor', 'Hold it there for a moment.'],
  ['brkUp', 2, 'Let the brake go', 'Take your foot right off.'],
  ...WHEEL_BTNS.map(([k]) => ['btn:' + k, 3, '', '']),
  ['done', 4, 'Your wheel is set up', 'Try everything: the bars and buttons follow you.'],
];
const HOLD = 0.4; // s an axis has to sit still at a new place to count
const cleanName = (id) => (id || 'Wheel').replace(/\s*\((?:STANDARD GAMEPAD )?Vendor:.*$/i, '').replace(/\s+/g, ' ').trim() || 'Wheel';

export class WheelSetup {
  constructor(root, onChange) {
    this.root = root; this.onChange = onChange || (() => {});
    this.isOpen = false;
    root.querySelector('.wh-stages').innerHTML = STAGES.map((s, i) => `<span data-i="${i}"><em class="sv-num">${i + 1}</em>${s}</span>`).join('');
    root.querySelector('.wh-btns').innerHTML = WHEEL_BTNS.map(([k]) => `<div class="wh-btn" data-k="${k}"><b>${BTN_LABEL[k][0]}</b><small>${BTN_LABEL[k][1]}</small></div>`).join('');
    this.el = (c) => root.querySelector(c);
  }
  open(onDone) {
    this.onDone = onDone; this.isOpen = true;
    this.cfg = { id: null, name: '', steer: null, thr: null, brk: null, btn: {} };
    this.pad = null; this.rest = []; this.prevBtn = new Map();
    wheel.raw = true; wheel.rawId = null; // (the wheel's buttons are read here, not passed on as pad buttons)
    this.go(0);
  }
  close(save) {
    this.isOpen = false; wheel.raw = false; wheel.rawId = null;
    const f = this.onDone; this.onDone = null;
    if (f) f(save ? this.cfg : null);
  }
  get step() { return STEPS[this.i][0]; }
  go(i) {
    this.i = i; this.t = 0; this.cand = null; this.sweep = null; this.armed = false; this.base = null; this.armT = 0; this.note('');
    const [key, stage, say, then] = STEPS[i];
    const btn = key.startsWith('btn:') ? key.slice(4) : null;
    this.el('.wh-say').textContent = btn ? `Press the button for ${BTN_LABEL[btn][0]}` : say;
    this.el('.wh-then').textContent = btn ? (['up', 'down', 'left', 'right'].includes(btn) ? 'The menus move with these. Enter skips it.' : `${BTN_LABEL[btn][1]}. Enter skips it.`) : then;
    this.root.querySelectorAll('.wh-stages span').forEach((s, k) => { s.classList.toggle('on', k === stage); s.classList.toggle('past', k < stage); });
    this.root.querySelector('.wh-btns').classList.toggle('show', stage >= 3);
    this.root.classList.toggle('wh-test', key === 'done');
    // the instruction fades in fresh each step (no slide)
    const txt = this.el('.wh-text'); txt.classList.remove('in'); void txt.offsetWidth; txt.classList.add('in');
    this.drawButtons();
    this.onChange();
  }
  note(msg) { const n = this.el('.wh-note'); n.textContent = msg; n.classList.toggle('on', !!msg); }
  // keyboard / a normal pad: skip a button, finish, cancel
  skip() { if (this.step.startsWith('btn:')) { delete this.cfg.btn[this.step.slice(4)]; this.go(this.i + 1); } }
  finish() { if (this.step === 'done') this.close(true); }
  hints() {
    const s = this.step;
    if (s === 'done') return [['ok', 'Finish'], ['back', 'Cancel']];
    if (s.startsWith('btn:')) return [['skip', 'Skip'], ['back', 'Cancel']];
    return [['back', 'Cancel']];
  }

  // a button pressed on this pad since the last frame
  btnEdge(p) {
    let hit = -1;
    p.buttons.forEach((b, i) => { const was = this.prevBtn.get(i); if (b.pressed && !was && hit < 0) hit = i; this.prevBtn.set(i, b.pressed); });
    return hit;
  }
  usedAxis(a) { const c = this.cfg; return (c.steer && c.steer.a === a) || (c.thr && c.thr.a === a) || (c.brk && c.brk.a === a); }
  // the axis that's moved furthest from 'from' (not one already used), if it's at least 'min' away and has sat still for HOLD
  settle(p, from, min, dt, skip = () => false) {
    let best = -1, bd = min;
    p.axes.forEach((v, a) => { if (skip(a)) return; const d = Math.abs(v - (from[a] ?? 0)); if (d > bd) { bd = d; best = a; } });
    if (best < 0) { this.cand = null; return null; }
    const v = p.axes[best];
    if (!this.cand || this.cand.a !== best || Math.abs(this.cand.v - v) > 0.08) { this.cand = { a: best, v, t: 0 }; return null; }
    this.cand.t += dt;
    return this.cand.t >= HOLD ? this.cand : null;
  }

  update(dt) {
    if (!this.isOpen) return;
    this.t += dt;
    const s = this.step;
    if (s === 'find') {
      for (const p of allPads()) {
        if (!this.prevBtn.has(p.id)) { this.prevBtn.set(p.id, p.buttons.map(b => b.pressed)); continue; }
        const prev = this.prevBtn.get(p.id), hit = p.buttons.findIndex((b, i) => b.pressed && !prev[i]);
        this.prevBtn.set(p.id, p.buttons.map(b => b.pressed));
        if (hit >= 0) {
          this.pad = p.id; wheel.rawId = p.id; this.cfg.id = p.id; this.cfg.name = cleanName(p.id); this.rest = [...p.axes];
          this.prevBtn = new Map(p.buttons.map((b, i) => [i, b.pressed]));
          this.el('.wh-name').textContent = this.cfg.name;
          this.go(this.i + 1); return;
        }
      }
      this.el('.wh-name').textContent = allPads().length ? 'Press any button on the wheel' : 'No wheel found. Is it plugged in?';
      this.drawLive(null); return;
    }
    const p = allPads().find(q => q.id === this.pad);
    if (!p) { this.note('The wheel was unplugged. Plug it back in to carry on.'); this.drawLive(null); return; }
    const c = this.cfg;
    if (s === 'steer') {
      // (no holding still: every axis's furthest point each way, and when it got there; a button press takes the axis
      // that swept furthest, its end reached first being left)
      if (!this.sweep) this.sweep = p.axes.map(v => ({ v0: v, lo: v, hi: v, tLo: Infinity, tHi: Infinity }));
      p.axes.forEach((v, a) => { const w = this.sweep[a]; if (!w) return; w.lo = Math.min(w.lo, v); w.hi = Math.max(w.hi, v);
        if (v < w.v0 - 0.3 && w.tLo === Infinity) w.tLo = this.t; if (v > w.v0 + 0.3 && w.tHi === Infinity) w.tHi = this.t; }); // (when it first went well each way)
      if (this.btnEdge(p) >= 0) {
        let best = -1, br = 0.6;
        this.sweep.forEach((w, a) => { if (w.hi - w.lo > br) { br = w.hi - w.lo; best = a; } });
        if (best < 0) this.note('The wheel didn\'t seem to turn. Turn it all the way left and right, then press a button.');
        else { const w = this.sweep[best]; const mid = p.axes[best]; // (where it is now, back in the middle: each side is measured from here, as wheels aren't always symmetric)
          c.steer = w.tLo <= w.tHi ? { a: best, l: w.lo, r: w.hi, c: mid } : { a: best, l: w.hi, r: w.lo, c: mid }; this.sweep = null; this.go(this.i + 1); }
      }
    } else if (s === 'thr' || s === 'brk') {
      const got = this.settle(p, this.rest, 0.5, dt, a => this.usedAxis(a));
      if (got) { c[s] = { a: got.a, rest: this.rest[got.a], full: got.v }; this.go(this.i + 1); }
    } else if (s === 'thrUp' || s === 'brkUp') {
      // let go: the axis comes back a long way from the floor and sits still; that's its true rest
      const k = s === 'thrUp' ? 'thr' : 'brk', ax = c[k].a, v = p.axes[ax];
      if (Math.abs(v - c[k].full) > 0.5) {
        if (!this.cand || Math.abs(this.cand.v - v) > 0.08) this.cand = { v, t: 0 };
        else if ((this.cand.t += dt) >= HOLD) { c[k].rest = v; this.rest[ax] = v; this.go(this.i + 1); }
      } else this.cand = null;
    } else if (s.startsWith('btn:')) {
      const key = s.slice(4);
      // wait for everything to be let go (and any hat switch back in the middle), then listen
      if (!this.armed) {
        const anyDown = p.buttons.some(b => b.pressed) || Object.values(c.btn).some(b => bindHit(p, b)); // (a hat switch just set: until it's back in the middle)
        if (!this.base || anyDown || p.axes.some((v, a) => Math.abs(v - this.base[a]) > 0.02)) { this.base = [...p.axes]; this.armT = 0; }
        else if ((this.armT += dt) > 0.2) { this.armed = true; this.prevBtn = new Map(p.buttons.map((b, i) => [i, b.pressed])); }
      } else {
        let bind = null;
        const hit = this.btnEdge(p);
        if (hit >= 0) bind = { b: hit };
        else p.axes.forEach((v, a) => { if (!bind && !this.usedAxis(a) && Math.abs(v - this.base[a]) > 0.1) bind = { a, v }; }); // (a hat switch)
        if (bind) {
          const dup = Object.entries(c.btn).find(([k2, b2]) => k2 !== key && (b2.b != null ? b2.b === bind.b : b2.a === bind.a && Math.abs(b2.v - bind.v) < 0.1));
          if (dup) { this.note(`That one's already ${BTN_LABEL[dup[0]][0]}. Press another, or Enter to skip.`); this.armed = false; this.base = null; }
          else { c.btn[key] = bind; this.go(this.i + 1); }
        }
      }
    } else if (s === 'done') {
      // the wheel's own Select / Back finish or cancel here
      const ok = bindHit(p, c.btn.ok), bk = bindHit(p, c.btn.back);
      if (ok && !this.okWas && this.t > 0.4) { this.okWas = ok; return this.close(true); }
      if (bk && !this.bkWas && this.t > 0.4) { this.bkWas = bk; return this.close(false); }
      this.okWas = ok; this.bkWas = bk;
    }
    this.drawLive(p);
  }

  // the live readout: steering (a bar with a marker from the middle) and the two pedals, then the buttons
  drawLive(p) {
    const c = this.cfg, s = this.step;
    let st = null;
    if (p && c.steer && c.steer.r != null) st = wheelAngle(p, c.steer);
    else if (p && s === 'steer' && this.sweep) { let best = -1, br = 0.05; this.sweep.forEach((w, a) => { if (w.hi - w.lo > br) { br = w.hi - w.lo; best = a; } }); if (best >= 0) st = Math.max(-1, Math.min(1, p.axes[best] - this.rest[best])); }
    const deg = st == null ? null : Math.round(st * wheel.rot / 2);
    const dot = this.el('.wh-dot');
    dot.style.left = `${50 + (st ?? 0) * 50}%`; dot.classList.toggle('off', st == null);
    this.el('.wh-steer-v').textContent = deg == null ? '—' : `${deg > 0 ? '+' : ''}${deg}°`;
    for (const k of ['thr', 'brk']) {
      // (while it's being found: how far the likeliest axis has moved)
      const v = !p ? null : c[k] ? pedal(p, c[k]) : s === k && this.cand ? Math.min(1, Math.abs(p.axes[this.cand.a] - this.rest[this.cand.a])) : null;
      this.el(`.wh-${k} .sv-signal`).style.setProperty('--v', v == null ? 0 : v.toFixed(3));
      this.el(`.wh-${k} b`).textContent = v == null ? '—' : `${Math.round(v * 100)}%`;
    }
    this.el('.wh-raw').textContent = p && s !== 'done' ? 'Axes  ' + p.axes.map((v, a) => `${a}: ${v >= 0 ? '+' : ''}${v.toFixed(2)}`).join('   ') : '';
    if (s === 'done' && p) this.root.querySelectorAll('.wh-btn').forEach(b => b.classList.toggle('hit', bindHit(p, c.btn[b.dataset.k])));
  }
  drawButtons() {
    const s = this.step, cur = s.startsWith('btn:') ? s.slice(4) : null, idx = WHEEL_BTNS.findIndex(([k]) => k === cur);
    this.root.querySelectorAll('.wh-btn').forEach((b, k) => {
      const key = b.dataset.k;
      b.classList.toggle('cur', key === cur);
      b.classList.toggle('set', !!this.cfg.btn[key] && key !== cur);
      b.classList.toggle('skip', !this.cfg.btn[key] && key !== cur && (s === 'done' || (idx >= 0 && k < idx)));
      b.classList.remove('hit');
    });
  }
}
