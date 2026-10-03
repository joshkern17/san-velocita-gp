// The day planner (World Career): how you spend a day of the week before a round. Game UI over the garage, in the
// Team Setup's clothes (js/teamsetup.js): the week runs along the top like sectors (each day you've spent says what it
// went on and what it made), today's choices are a list, and the one you're on is laid out beside it: what it pays or
// costs, whether it takes the day, what it does. Doing it plays the day: a card with the day and what came of it, the
// money rolling, the day stamped on the week, then on to tomorrow.
// The choices come from main.js (src.choices(): { key, short, head, desc, money, mcls, time, effect, icon, vis, go, run }):
// run() does it here and returns { amt, line, note }; a choice with go (the computer, a test day, race day) closes
// the planner and main.js takes it from there (src.leave).
// Controls: up / down choose, A / Enter do it (twice for one that leaves the week), B / Esc back to the garage.
import * as WC from './wcareer.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FULL = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const flick = (el, d = 0) => !calm() && el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: d, easing: 'ease-out', fill: 'backwards' });
// line icons, drawn in light (24 x 24)
const ICONS = {
  work: '<rect x="3" y="7" width="18" height="13" rx="1"/><path d="M8 7V4h8v3M3 12h18M11 12v2h2v-2"/>',
  gig: '<path d="M2 16V7h12v9M14 10h4l3 3v3h-7"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  fix: '<path d="M14.5 4.5a4.5 4.5 0 0 0-5.9 5.6L3.5 15.2a1.8 1.8 0 0 0 2.6 2.6l5.1-5.1a4.5 4.5 0 0 0 5.6-5.9l-2.7 2.7-2.4-.4-.4-2.4z"/>',
  proj: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  projs: '<path d="M4 6h10M4 12h10M4 18h7M18 13v8M14 17h8"/>',
  sim: '<rect x="2.5" y="4" width="19" height="12" rx="1"/><path d="M8 20h8M12 16v4M7 12l3-3 2 2 4-4"/>',
  test: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9M10 2.5h4M18.5 6l1.5-1.5"/>',
  off: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  race: '<path d="M5 21V3.5M5 4h13l-2.5 4.5L18 13H5"/><path d="M9 4v9M13 4v9M5 8.5h11.5" opacity=".55"/>',
};
const icon = (k, cls = '') => `<svg class="dp-ico ${cls}" viewBox="0 0 24 24">${ICONS[k] || ICONS.off}</svg>`;

export class DayPlan {
  constructor(el, src) {
    this.el = el; this.src = src; this.isOpen = false; this.busy = false; this.sel = 0; this.armed = null;
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('mousemove', (e) => { const r = e.target.closest('.dp-row'); if (r && !this.busy && +r.dataset.i !== this.sel) this.focus(+r.dataset.i); });
  }
  get w() { return this.src.world(); }

  open(pick) {
    const w = this.w; if (!w || WC.daysLeft(w) <= 0) return;
    this.isOpen = true; this.busy = false; this.armed = null; this.bank = w.money.balance;
    this.el.innerHTML = `<div class="tsw-shade"></div><div class="tsw-scan"></div>
      <header class="tsw-head"><h1></h1><p></p></header>
      <div class="tsw-money"><div><small>In the bank</small><b data-k="bank"></b></div><div><small>This week</small><b data-k="week"></b><em class="tsw-delta"></em></div></div>
      <nav class="tsw-rail dp-week"></nav>
      <div class="dp-body"><div class="dp-list"></div><div class="dp-pane"></div></div>
      <div class="dp-card sv-frame"><small></small><h3></h3><b></b><p></p></div>`;
    this.el.hidden = false; this.el.classList.remove('leave'); this.el.classList.add('enter');
    setTimeout(() => this.el.classList.remove('enter'), 1400);
    this.render(pick, true);
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; this.el.classList.add('leave');
    setTimeout(() => { if (!this.isOpen) { this.el.hidden = true; this.el.innerHTML = ''; this.el.classList.remove('leave'); } }, 300);
  }

  // ---------- input ----------
  input({ up, down, ok, back }) {
    if (!this.isOpen) return false;
    if (this.busy) { if ((ok || back) && this.skip) this.skip(); return true; }
    const n = this.opts.length;
    if (up) this.focus((this.sel + n - 1) % n);
    else if (down) this.focus((this.sel + 1) % n);
    else if (ok) this.choose();
    else if (back) { this.src.sfx('back'); this.close(); this.src.closed(); }
    return true;
  }
  click(e) {
    if (this.busy) { if (this.skip) this.skip(); return; }
    const r = e.target.closest('.dp-row'), go = e.target.closest('[data-act="do"]');
    if (r) { const i = +r.dataset.i; if (i !== this.sel) this.focus(i); else this.choose(); }
    else if (go) this.choose();
  }
  focus(i) {
    if (i === this.sel) return;
    this.sel = i; this.armed = null; this.src.sfx('move'); this.src.pick(this.opts[i].key);
    this.el.querySelectorAll('.dp-row').forEach((r, k) => r.classList.toggle('on', k === i));
    this.pane();
  }
  choose() {
    const o = this.opts[this.sel]; if (!o) return;
    // (leaving the week, or paying for a test day: select again to be sure)
    if (o.confirm && this.armed !== o.key) { this.armed = o.key; this.src.sfx('move'); this.pane(false); return; }
    this.armed = null;
    if (o.go) { this.src.sfx('select'); this.close(); this.src.leave(o); return; }
    const day = WC.DAY_NAMES[WC.weekOf(this.w).used], r = o.run() || {};
    this.src.save();
    this.passDay(day, o, r);
  }

  // ---------- drawing ----------
  render(pick, first = false) {
    const w = this.w, wk = WC.weekOf(w), day = WC.DAY_NAMES[wk.used], R = w.series[w.player.series].cal[w.round], left = WC.daysLeft(w);
    this.opts = this.src.choices();
    const k = this.opts.findIndex(o => o.key === (pick ?? this.opts[this.sel]?.key)); this.sel = Math.max(0, k);
    const h = this.el.querySelector('.tsw-head');
    h.querySelector('h1').textContent = FULL[day] || 'Today';
    h.querySelector('p').textContent = `Round ${w.round + 1} of ${w.opts.len}: ${R.name} · ${left} day${left === 1 ? '' : 's'} before race day`;
    if (!first && !calm()) h.querySelector('h1').animate([{ clipPath: 'inset(-10% 100% -10% 0)' }, { clipPath: 'inset(-10% -2% -10% 0)' }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
    this.week(); this.purse(false);
    const list = this.el.querySelector('.dp-list');
    list.innerHTML = this.opts.map((o, i) => `<div class="dp-row${i === this.sel ? ' on' : ''}" data-i="${i}"><i class="tsw-cur"></i>${icon(o.icon || o.key)}<b>${esc(o.short)}</b><em class="${o.mcls || ''}">${o.tag || ''}</em></div>`).join('');
    [...list.children].forEach((r, i) => flick(r, (first ? 380 : 80) + i * 45));
    this.pane();
  }
  // the one you're on: what it is, the numbers, and a picture where there is one
  pane(fresh = true) {
    const o = this.opts[this.sel], el = this.el.querySelector('.dp-pane'); if (!o) return;
    const facts = [['Money', o.money || '&mdash;', o.mcls], ['Time', o.time || 'Uses the day'], ['Does', o.effect || '&mdash;']];
    const v = o.vis;
    const vis = !v ? '' : v.type === 'map' ? `<div class="dp-vis map"><canvas width="360" height="200"></canvas><span>${esc(v.label)}</span></div>`
      : `<div class="dp-vis bar"><span>${esc(v.label)}</span><i class="dp-gauge"><b class="was" style="--a:${v.from.toFixed(3)}"></b><b class="now" style="--a:${v.from.toFixed(3)};--b:${v.to.toFixed(3)}"></b></i><em>${esc(v.text)}</em></div>`;
    const btn = this.armed === o.key ? (o.confirm || 'Sure? Select again') : o.go ? (o.goLabel || 'Go') : 'Do it';
    el.innerHTML = `<div class="dp-top">${icon(o.icon || o.key, 'big')}<div><h2>${o.head}</h2><p>${o.desc}</p></div></div>
      <div class="dp-facts">${facts.map(([k, x, c]) => `<div><small>${k}</small><b class="${c || ''}">${x}</b></div>`).join('')}</div>${vis}
      <div class="dp-go"><button class="sv-btn hot${this.armed === o.key ? ' on' : ''}" data-act="do">${btn} &rsaquo;</button></div>`;
    if (v && v.type === 'map') this.src.map(el.querySelector('canvas'));
    if (fresh) flick(el);
  }
  // the week across the top: Monday to Friday, then race day
  week(stamp = -1) {
    const w = this.w, wk = WC.weekOf(w), el = this.el.querySelector('.dp-week'), at = wk.used;
    const cells = WC.DAY_NAMES.map((d, i) => {
      const e = wk.log.filter(x => x.day === i), x = e[e.length - 1], amt = e.reduce((a, y) => a + (y.amt || 0), 0);
      const sub = x ? (x.gig && !x.done ? 'To drive' : amt ? `${amt > 0 ? '+' : '−'}${WC.money$(Math.abs(amt))}` : '') : i === at ? 'Today' : '';
      return `<li class="${i < at ? 'done' : i === at ? 'on' : ''}${i === stamp ? ' stamp' : ''}" data-i="${i}"><i></i><span>${d}</span><b>${x ? esc(x.tag || 'Busy') : i === at ? 'Today' : 'Free'}</b><small class="${amt < 0 ? 'neg' : amt > 0 ? 'gain' : ''}">${x ? sub : '&nbsp;'}</small></li>`;
    }).join('');
    el.style.setProperty('--n', 6);
    const was = this.lineAt ?? at; this.lineAt = at;
    el.innerHTML = `<i class="tsw-line"><b style="width:${(Math.min(at, 5) / 5 * 100).toFixed(2)}%"></b></i><ol>${cells}<li class="race"><i></i><span>Sat</span><b>Race</b><small>Round ${w.round + 1}</small></li></ol>`;
    const b = el.querySelector('.tsw-line b');
    if (was !== at && !calm()) b.animate([{ width: `${(Math.min(was, 5) / 5 * 100).toFixed(2)}%` }, { width: b.style.width }], { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  // the bank and the week's takings, rolling to their new numbers
  purse(roll = true) {
    const w = this.w, wk = WC.weekOf(w), el = this.el.querySelector('.tsw-money'), net = wk.log.reduce((a, e) => a + (e.amt || 0), 0), bal = w.money.balance;
    const fmt = { bank: (v) => WC.money$(v), week: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${WC.money$(Math.abs(v))}` };
    const set = (k, v) => { const b = el.querySelector(`[data-k="${k}"]`); b.textContent = fmt[k](v); b.classList.toggle('neg', v < 0); };
    const from = { bank: this.bank ?? bal, week: this.net ?? net }; this.bank = bal; this.net = net;
    if (!roll || calm() || (from.bank === bal && from.week === net)) { set('bank', bal); set('week', net); return; }
    const t0 = performance.now(), T = 700, tick = (t) => { const k = Math.min(1, (t - t0) / T), e = 1 - Math.pow(1 - k, 3);
      set('bank', Math.round(from.bank + (bal - from.bank) * e)); set('week', Math.round(from.week + (net - from.week) * e)); if (k < 1 && this.isOpen) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // ---------- a day passes: the card, the money, the stamp, then tomorrow ----------
  passDay(day, o, r) {
    const card = this.el.querySelector('.dp-card'), amt = r.amt || 0, w = this.w;
    this.busy = true;
    card.querySelector('small').textContent = FULL[day] || day;
    card.querySelector('h3').innerHTML = r.line || o.head;
    const b = card.querySelector('b'); b.className = amt > 0 ? 'gain' : amt < 0 ? 'neg' : '';
    card.querySelector('p').innerHTML = r.note || '';
    card.classList.add('on'); this.el.classList.add('passing');
    const fmt = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${WC.money$(Math.abs(v))}`;
    b.textContent = amt ? fmt(0) : 'Done';
    let landed = false;
    const land = () => { if (landed) return; landed = true; if (amt) b.textContent = fmt(amt); this.src.sfx(amt > 0 ? 'best' : 'select'); this.week(WC.weekOf(w).used - 1); this.purse(); };
    const t0 = performance.now(), T = calm() || !amt ? 0 : 650;
    const tick = (t) => { const k = T ? Math.min(1, (t - t0 - 250) / T) : 1; if (k > 0 && amt && !landed) b.textContent = fmt(Math.round(amt * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(tick); else land(); };
    requestAnimationFrame(tick);
    let done = false;
    const next = () => {
      if (done) return; done = true; land(); clearTimeout(tm); this.skip = null;
      card.classList.remove('on'); this.el.classList.remove('passing'); this.busy = false;
      if (WC.daysLeft(w) <= 0) { this.close(); this.src.closed(true); return; }
      this.render(o.key);
    };
    const tm = setTimeout(next, calm() ? 700 : 2100);
    this.skip = next;
  }
}
