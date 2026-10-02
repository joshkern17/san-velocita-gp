// The garage computer: a late-90s desktop on the CRT in your garage (World Career). Sit down at the desk and the
// camera pushes into the screen (js/pitgarage.js); this is what's on it: Mail, the Paddock Wire news site, the series'
// websites and the driver database, all drawn from the world (js/wcareer.js).
// It's real DOM, laid out at a fixed "screen resolution" (W x H), but what you see is always the monitor in the 3D
// room: every change is snapshotted (the DOM drawn into an SVG image, then onto a canvas) and that canvas is the
// screen's texture, lit, graded and dithered like everything else. The DOM itself sits invisibly on the glass while
// you're seated, for the mouse. (Browsers that won't let a page draw its own DOM, Safari, see the DOM instead.)
// Controls: the d-pad / arrows move between anything you can select (spatially), A / Enter selects, B / Esc goes back
// (or stands you up from the desktop), LB / RB flip a site's sections. The mouse works too.
import * as WC from './wcareer.js';
import { garble, hexDump } from './garble.js';
import { tipText } from './lapreview.js';

export const W = 760, H = 600; // the screen's resolution (the CRT's glass is about 1.27 : 1)
const S = 2; // the texture's pixels per screen pixel (sharp enough to read sat at the desk)
const TASK_H = 30;
const NAT = { ITA: 'Italy', GBR: 'Britain', JPN: 'Japan', BRA: 'Brazil', GER: 'Germany', FRA: 'France', ESP: 'Spain', SWE: 'Sweden', POL: 'Poland', NGA: 'Nigeria', USA: 'USA', AUS: 'Australia', MEX: 'Mexico', KOR: 'Korea' };
const hex = (c) => '#' + ((c ?? 0x888888) >>> 0).toString(16).padStart(6, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ord = (p) => p + (['th', 'st', 'nd', 'rd'][(p % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][p % 100] || 'th');

// the desktop's icons (the same spots on the canvas copy)
const APPS = [
  { id: 'mail', label: 'Mail', title: 'Mail' },
  { id: 'news', label: 'Paddock Wire', title: 'Web Browser' },
  { id: 'series', label: 'Series Site', title: 'Web Browser' },
  { id: 'drivers', label: 'Driver Database', title: 'Web Browser' },
  { id: 'bank', label: 'Bank', title: 'Web Browser' },
  { id: 'classifieds', label: 'Classifieds', title: 'Web Browser' },
  { id: 'team', label: 'Team', title: 'Team' },
  { id: 'tyres', label: 'Tyre Orders', title: 'Web Browser' },
  { id: 'telemetry', label: 'Telemetry', title: 'Telemetry' },
  { id: 'jobs', label: 'SVJobs', title: 'Web Browser', hidden: true }, // (reached from the Team app)
  { id: 'registry', label: 'Registry', title: 'Web Browser', hidden: true }, // (reached from its email)
];
// team colours on Form SV-1
const PALETTE = [0xc8141c, 0xf2f2f2, 0x15181d, 0x1d4fd8, 0xf2c21a, 0x18a058, 0xf06a12, 0x7a2cc8, 0x1fb5c8, 0xe0569a, 0x7a5a3a, 0x9aa2ad];
const ICON_X = 22, ICON_Y = 16, ICON_STEP = 88, ICON_ROWS = 6, ICON_COL = 96;
// little icons, drawn the same way on the desktop and the canvas
const ICONS = {
  mail: [['#f4f1e4', 6, 14, 52, 36], ['#c9c2a6', 6, 14, 52, 4], ['path', '#8a8268', 'M6 14 L32 34 L58 14'], ['#d23a2a', 44, 6, 14, 14]],
  news: [['#ffffff', 10, 6, 44, 52], ['#1a1a1a', 15, 11, 34, 7], ['#9a9a9a', 15, 22, 34, 3], ['#9a9a9a', 15, 28, 34, 3], ['#9a9a9a', 15, 34, 22, 3], ['#c23', 40, 34, 9, 14], ['#9a9a9a', 15, 40, 22, 3], ['#9a9a9a', 15, 46, 22, 3]],
  series: [['#5a5a5a', 12, 6, 4, 54], ['#111', 16, 8, 36, 24], ['#fff', 16, 8, 9, 6], ['#fff', 34, 8, 9, 6], ['#fff', 25, 14, 9, 6], ['#fff', 43, 14, 9, 6], ['#fff', 16, 20, 9, 6], ['#fff', 34, 20, 9, 6], ['#fff', 25, 26, 9, 6], ['#fff', 43, 26, 9, 6]],
  drivers: [['#2a4fa0', 14, 10, 36, 34], ['#e8e8e8', 18, 20, 28, 12], ['#111', 20, 22, 24, 8], ['#2a4fa0', 10, 44, 44, 14]],
  tyres: [['#111', 10, 10, 44, 44], ['#3a3a3a', 18, 18, 28, 28], ['#c8c8c8', 26, 26, 12, 12], ['#e0302a', 10, 30, 6, 4], ['#f2d22a', 48, 30, 6, 4]],
  team: [['#c8141c', 18, 8, 28, 20], ['#e8c9a8', 22, 12, 20, 14], ['#2a4fa0', 10, 32, 44, 24], ['#e8e8e8', 28, 34, 8, 20]],
  telemetry: [['#101418', 6, 10, 52, 40], ['#3ddc84', 10, 36, 6, 3], ['#3ddc84', 16, 30, 6, 3], ['#3ddc84', 22, 22, 6, 3], ['#3ddc84', 28, 26, 6, 3], ['#3ddc84', 34, 16, 6, 3], ['#3ddc84', 40, 20, 6, 3], ['#3ddc84', 46, 14, 6, 3], ['#8a8f96', 22, 50, 20, 6]],
  classifieds: [['#f4f1e4', 8, 8, 48, 48], ['#7a2cc8', 8, 8, 48, 10], ['#7a2cc8', 14, 24, 22, 3], ['#7a2cc8', 14, 32, 30, 3], ['#7a2cc8', 14, 40, 18, 3], ['#7a2cc8', 14, 48, 26, 3]],
  bank: [['#d8b54a', 8, 18, 48, 6], ['#e9e2c8', 12, 24, 6, 22], ['#e9e2c8', 24, 24, 6, 22], ['#e9e2c8', 34, 24, 6, 22], ['#e9e2c8', 46, 24, 6, 22], ['#d8b54a', 6, 46, 52, 8], ['#d8b54a', 28, 6, 8, 12]],
};
function iconSvg(id) {
  return `<svg viewBox="0 0 64 64" width="44" height="44">${ICONS[id].map(p => p[0] === 'path' ? `<path d="${p[2]}" fill="none" stroke="${p[1]}" stroke-width="3"/>` : `<rect x="${p[1]}" y="${p[2]}" width="${p[3]}" height="${p[4]}" fill="${p[0]}"/>`).join('')}</svg>`;
}

export class Computer {
  // src: { world() -> the World Career world, answer(mail, key), changed(), sfx: { move, select, back } }
  constructor(src) {
    this.src = src;
    this.el = document.createElement('div'); this.el.id = 'pc'; this.el.hidden = true;
    this.el.innerHTML = `<div class="pc-screen"><div class="pc-desk"></div><div class="pc-win" hidden></div><div class="pc-task"></div></div><div class="pc-glass"></div>`;
    document.body.appendChild(this.el);
    this.scr = this.el.querySelector('.pc-screen');
    this.app = null; this.page = {}; this.hist = []; this.cur = null; this.isOpen = false;
    this.idle = document.createElement('canvas'); this.idle.width = W * S; this.idle.height = H * S;
    this.el.addEventListener('scroll', () => this.snapSoon(), true);
    this.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]'); if (!a || !this.isOpen) return;
      this.focusEl(a, false); this.act(a.dataset.act, a.dataset.arg);
    });
    this.el.addEventListener('mousemove', (e) => { const a = e.target.closest('[data-nav]'); if (a && a !== this.cur) this.focusEl(a, false); });
  }

  // ---------- open / close (main.js calls these as the camera arrives at / leaves the screen) ----------
  open() { this.isOpen = true; this.el.hidden = false; this.el.classList.toggle('ghost', !this.fallback); requestAnimationFrame(() => this.el.classList.add('on')); this.render(); }
  close() { this.isOpen = false; this.el.classList.remove('on'); this.el.hidden = true; this.app = null; this.hist = []; if (this.w) this.render(); }
  // fit the screen onto a rect (CSS pixels: the monitor's glass on screen)
  place(r) {
    const s = this.el.style; s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px';
    this.scr.style.transform = `scale(${r.w / W}, ${r.h / H})`;
  }
  // straight to something: ('mail', mailId) opens that email
  goto(app, arg) { this.launch(app); if (app === 'mail' && arg) this.go({ mail: arg }); }

  get w() { return this.src.world(); }
  // does the open app have sections to flip through (LB / RB)?
  get hasTabs() { return this.app === 'series' || (this.app === 'drivers' && !this.page.pid); }

  // ---------- input ----------
  input({ up, down, left, right, ok, back, tabPrev, tabNext }) {
    if (this.typing) return; // (a text field has the keyboard: Enter or Esc gives it back)
    if (back) { if (this.app) this.back(); else return 'stand'; return; }
    if ((left || right) && this.cur && this.cur.dataset.cycle) { this.cycle(this.cur.dataset.cycle, right ? 1 : -1); return; }
    if (tabPrev || tabNext) { this.flip(tabNext ? 1 : -1); return; }
    if (up) this.move(0, -1); if (down) this.move(0, 1); if (left) this.move(-1, 0); if (right) this.move(1, 0);
    if (ok && this.cur) { const a = this.cur; if (a.dataset.act) { this.act(a.dataset.act, a.dataset.arg); } }
  }
  // what you can select: the open window's contents, else the desktop's icons
  navs() { return [...this.scr.querySelectorAll(this.app ? '.pc-win [data-nav]' : '.pc-desk [data-nav]')].filter(e => e.offsetParent !== null); }
  focusEl(e, scroll = true) {
    if (this.cur) this.cur.classList.remove('f');
    this.cur = e; if (!e) return;
    e.classList.add('f'); this.curKey = e.dataset.key || null;
    if (scroll) e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.snapSoon();
  }
  move(dx, dy) {
    const els = this.navs(); if (!els.length) return;
    const cur = this.cur && els.includes(this.cur) ? this.cur : null;
    if (!cur) { this.focusEl(els[0]); return; }
    // a scrolling pane (an email, an article) scrolls before the focus leaves it
    if (dy && cur.dataset.scroll !== undefined) {
      const sc = cur, room = dy > 0 ? sc.scrollHeight - sc.clientHeight - sc.scrollTop : sc.scrollTop;
      if (room > 2) { sc.scrollBy({ top: dy * 90, behavior: 'smooth' }); return; }
    }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const e of els) {
      if (e === cur) continue;
      const b = e.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const along = dx ? (bx - ax) * dx : (by - ay) * dy;
      if (along <= 1) continue;
      // overlapping across the move's axis counts as straight ahead
      const overlap = dx ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const perp = overlap > 0 ? 0 : dx ? Math.abs(by - ay) : Math.abs(bx - ax);
      const s = along + perp * 3;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) { this.focusEl(best); this.src.sfx?.move?.(); }
  }

  // ---------- apps + pages ----------
  launch(app) {
    this.app = app; this.hist = []; this._lastApp = app;
    const w = this.w;
    this.page = app === 'mail' ? { mail: (w.mail || [])[0]?.id || null }
      : app === 'news' ? { news: 'home' }
      : app === 'series' ? { s: w.player.series, tab: 'standings' }
      : app === 'bank' ? { bank: 'home' }
      : app === 'classifieds' ? { ad: null }
      : app === 'team' ? { team: 1 }
      : app === 'tyres' ? { tyres: 1 }
      : app === 'jobs' ? { role: 'mechanic' }
      : app === 'telemetry' ? { file: null }
      : app === 'registry' ? { reg: 1 }
      : { db: w.player.series, pid: null };
    if (app === 'mail' && this.page.mail) this.markRead(this.page.mail);
    this.curKey = null; this.render(); this.src.sfx?.select?.();
  }
  go(page) { this.hist.push(this.page); this.page = { ...this.page, ...page }; this.curKey = null; if (page.mail) this.markRead(page.mail); this.render(); }
  back() {
    if (this.hist.length && this.app !== 'mail') { this.page = this.hist.pop(); this.curKey = null; this.render(); }
    else if (this.app === 'jobs') { this.launch('team'); }
    else { this.app = null; this.hist = []; this.curKey = 'app-' + (this._lastApp || 'mail'); this.render(); }
    this.src.sfx?.back?.();
  }
  flip(d) {
    if (this.app === 'series') { const t = SITE_TABS, k = (t.indexOf(this.page.tab) + d + t.length) % t.length; this.page = { ...this.page, tab: t[k] }; this.hist = []; this.curKey = 'tab-' + t[k]; this.render(); this.src.sfx?.move?.(); }
    else if (this.app === 'drivers' && !this.page.pid) { const t = DB_TABS, k = (t.indexOf(this.page.db) + d + t.length) % t.length; this.page = { db: t[k], pid: null }; this.curKey = 'db-' + t[k]; this.render(); this.src.sfx?.move?.(); }
  }
  markRead(id) { const m = (this.w.mail || []).find(x => x.id === id); if (m && !m.read) { m.read = true; this.src.changed?.(); } }
  act(a, arg) {
    if (a === 'app') { this.launch(arg); return; }
    if (a === 'close') { this.back(); return; }
    if (a === 'back') { this.back(); return; }
    if (a === 'mail') { this.page = { mail: arg }; this.markRead(arg); this.curKey = 'mail-' + arg; this.render(); this.src.sfx?.select?.(); return; }
    if (a === 'reply') { const [id, key] = arg.split(':'), m = this.w.mail.find(x => x.id === id); if (m && !m.answer) { this.src.answer(m, key); this.curKey = null; this.render(); } return; }
    if (a === 'article') { this.go({ news: +arg }); this.src.sfx?.select?.(); return; }
    if (a === 'site') { this.hist = []; this.page = { s: arg, tab: 'standings' }; this.curKey = null; this.render(); this.src.sfx?.select?.(); return; }
    if (a === 'tab') { this.hist = []; this.page = { ...this.page, tab: arg }; this.curKey = 'tab-' + arg; this.render(); this.src.sfx?.select?.(); return; }
    if (a === 'db') { this.page = { db: arg, pid: null }; this.hist = []; this.curKey = 'db-' + arg; this.render(); this.src.sfx?.select?.(); return; }
    if (a === 'driver') { this.go({ pid: arg }); this.src.sfx?.select?.(); return; }
    if (a === 'open') { this.launch(arg); return; }
    if (a === 'jobs') { this.launch('jobs'); this.page = { role: arg }; this.render(); return; }
    if (a === 'role') { this.page = { role: arg }; this.curKey = 'role-' + arg; this.render(); this.src.sfx?.move?.(); return; }
    if (a === 'hire') { if (this.hireArmed !== arg) { this.hireArmed = arg; this.curKey = 'hire-' + arg; this.render(); this.src.sfx?.move?.(); return; } this.hireArmed = null; this.src.staff?.('hire', arg); this.launch('team'); return; }
    if (a === 'fire') { if (this.fireArmed !== arg) { this.fireArmed = arg; this.curKey = 'fire-' + arg; this.render(); this.src.sfx?.move?.(); return; } this.fireArmed = null; this.src.staff?.('fire', arg); this.curKey = null; this.render(); return; }
    if (a === 'backpay') { this.src.staff?.('backpay', arg); this.curKey = 'bp-' + arg; this.render(); return; }
    if (a === 'placeorder') { const n = WC.COMPOUNDS.reduce((x, c) => x + (this.order[c] || 0), 0); if (!n) return; if (!this.orderArmed) { this.orderArmed = true; this.curKey = 'placeorder'; this.render(); this.src.sfx?.move?.(); return; } this.orderArmed = false; this.src.order?.({ ...this.order }); this._order = null; this.curKey = null; this.render(); return; }
    if (a === 'file2') { this.go({ file: arg }); this.src.sfx?.select?.(); return; }
    if (a === 'cyc') { const [f, d] = arg.split(':'); this.cycle(f, +d); return; }
    if (a === 'type') { this.type(arg); return; }
    if (a === 'file') { if (!this.formOk()) { this.src.sfx?.back?.(); return; } this.src.register?.({ ...this.form, name: this.form.name.trim(), team: this.form.team.trim(), ex: this.form.ex.trim() }); this.curKey = null; this.render(); return; }
    if (a === 'ad') { this.go({ ad: arg }); this.buyArmed = false; this.src.sfx?.select?.(); return; }
    if (a === 'buy') { if (!this.buyArmed) { this.buyArmed = true; this.curKey = 'buy'; this.render(); this.src.sfx?.move?.(); return; } this.buyArmed = false; this.src.buy?.(arg); this.page = { ad: null }; this.hist = []; this.curKey = null; this.render(); return; }
    // selling the annuity: select twice
    if (a === 'sell') { if (!this.sellArmed) { this.sellArmed = true; this.curKey = 'sell'; this.render(); this.src.sfx?.move?.(); return; } this.sellArmed = false; this.src.sell?.(); this.curKey = null; this.render(); return; }
  }

  // ---------- drawing ----------
  render() {
    const w = this.w; if (!w) return;
    const team = w.teams[w.player.team];
    this.scr.style.setProperty('--team', hex(team.main)); this.scr.style.setProperty('--team2', hex(team.accent));
    const desk = this.scr.querySelector('.pc-desk'), win = this.scr.querySelector('.pc-win'), task = this.scr.querySelector('.pc-task');
    const nMail = WC.unreadMail(w);
    desk.innerHTML = `<div class="pc-wall"><b>${esc(team.name)}</b><small>${esc(WC.seriesById(w.player.series).name)} &middot; ${w.year}</small></div>` +
      APPS.filter(a => !a.hidden).map((a, k) => `<div class="pc-icon" data-nav data-act="app" data-arg="${a.id}" data-key="app-${a.id}" style="left:${ICON_X + Math.floor(k / ICON_ROWS) * ICON_COL}px;top:${ICON_Y + (k % ICON_ROWS) * ICON_STEP}px">${iconSvg(a.id)}<span>${a.label}</span>${a.id === 'mail' && nMail ? `<em>${nMail}</em>` : ''}</div>`).join('');
    const app = APPS.find(a => a.id === this.app);
    task.innerHTML = `<span class="pc-start">SV</span>${app ? `<span class="pc-tb on">${app.label}</span>` : ''}<span class="pc-clock">${esc(this.clock())}</span>`;
    win.hidden = !app;
    if (app) {
      // re-drawing the same page (a field changed, a list item picked) keeps its panes scrolled where they were
      const where = this.app === 'mail' ? 'mail' : this.app + ':' + this.url(), keepScroll = where === this.lastWhere ? [...win.querySelectorAll('*')].map(e => e.scrollTop) : null;
      this.lastWhere = where;
      const body = this.app === 'mail' ? this.mailApp() : this.app === 'team' ? this.teamApp() : this.app === 'telemetry' ? this.telApp() : this.browser();
      const plain = ['mail', 'team', 'telemetry'].includes(this.app);
      win.innerHTML = `<div class="pc-title"><span>${app.title}${!plain ? ' &mdash; ' + esc(this.url()) : ''}</span><i data-nav data-act="close" data-key="close">&times;</i></div>${body}`;
      if (keepScroll) win.querySelectorAll('*').forEach((e, i) => { if (keepScroll[i]) e.scrollTop = keepScroll[i]; });
      if (this.app === 'mail' && this.page.mail !== this.lastMail) { const b = win.querySelector('.pc-mbody'); if (b) b.scrollTop = 0; } // (a different email starts at its top)
      this.lastMail = this.page.mail;
    } else this.lastWhere = null;
    // focus: what you had, else the first thing worth selecting
    const els = this.navs();
    const keep = this.curKey && els.find(e => e.dataset.key === this.curKey);
    this.cur = null;
    this.focusEl(keep || els.find(e => e.dataset.first !== undefined) || els.find(e => e.dataset.act !== 'close') || els[0], !!keep);
    this.snapSoon(); this.src.view?.();
  }
  clock() { const w = this.w; return `${WC.whenOf(w)} ${w.year}`; }

  // Mail: the inbox on the left, the open email on the right
  mailApp() {
    const w = this.w, list = w.mail || [], cur = list.find(m => m.id === this.page.mail) || list[0];
    const rows = list.map(m => `<div class="pc-mrow${m.read ? '' : ' unread'}${cur && m.id === cur.id ? ' sel' : ''}" data-nav data-act="mail" data-arg="${m.id}" data-key="mail-${m.id}"${cur && m.id === cur.id && !(cur.choices && !cur.answer) && !cur.link ? ' data-first' : ''}>
      <b>${esc(m.from)}</b><span>${esc(m.subj)}</span><small>${esc(m.when || '')} ${m.y}</small></div>`).join('') || '<p class="pc-empty">No mail.</p>';
    const me = `${w.player.name.split(' ')[0].toLowerCase()}@${w.teams[w.player.team].name.toLowerCase().replace(/[^a-z]+/g, '')}.sv`;
    let read = '<p class="pc-empty">Select an email to read it.</p>';
    if (cur) {
      const gated = cur.lottery && w.founding && !w.founding.reg;
      const link = cur.link || (gated ? ['registry', 'Open Form SV-1'] : null);
      const ch = gated ? `<div class="pc-reply"><p class="pc-note">Winnings can only be paid to a registered business. Please file Form SV-1 first.</p><button class="pc-btn" data-nav data-act="open" data-arg="registry" data-key="link" data-first>Open Form SV-1</button></div>`
        : link && !(link[0] === 'registry' && w.founding?.reg) && !(link[0] === 'classifieds' && w.car) ? `<div class="pc-reply"><button class="pc-btn" data-nav data-act="open" data-arg="${link[0]}" data-key="link" data-first>${esc(link[1])} &rarr;</button></div>`
        : cur.choices && !cur.answer ? `<div class="pc-reply">${cur.choices.map(([k, t], i) => `<button class="pc-btn" data-nav data-act="reply" data-arg="${cur.id}:${k}" data-key="reply-${k}"${i === 0 ? ' data-first' : ''}>${esc(t)}</button>`).join('')}</div>` : '';
      const ans = cur.answer ? `<p class="pc-sent">You replied: ${esc(cur.choices.find(c => c[0] === cur.answer)?.[1] || cur.answer)}</p>` : '';
      read = `<div class="pc-mhead"><div><small>From:</small> ${esc(cur.from)} &lt;${esc(cur.addr)}&gt;</div><div><small>To:</small> ${esc(me)}</div><div><small>Date:</small> ${esc(cur.when || '')} ${cur.y}</div><div class="subj">${esc(cur.subj)}</div></div>
        <div class="pc-mbody" data-nav data-scroll data-key="mbody">${(Array.isArray(cur.body) ? cur.body : [cur.body]).map(p => `<p>${esc(p)}</p>`).join('')}${this.billTable(cur.bill)}${this.reportTable(cur.report, cur.y)}${ans}</div>${ch}`;
    }
    return `<div class="pc-mail"><div class="pc-mbar">Inbox (${WC.unreadMail(w)} unread)</div><div class="pc-mlist">${rows}</div><div class="pc-mread">${read}</div></div>`;
  }

  // the browser: one of the websites
  url() {
    const p = this.page;
    if (this.app === 'news') return 'www.paddockwire.sv' + (p.news === 'home' ? '/' : `/story/${p.news}`);
    if (this.app === 'series') return `www.${WC.siteOf(WC.seriesById(p.s))}/${p.tab}`;
    if (this.app === 'bank') return 'secure.firstvelocita.sv/business/account';
    if (this.app === 'classifieds') return 'svlist.sv/cars' + (p.ad ? '/' + p.ad : '');
    if (this.app === 'registry') return 'www.registry.sv.gov/forms/SV-1.htm';
    if (this.app === 'jobs') return `www.svjobs.sv/motorsport/${p.role}`;
    if (this.app === 'tyres') return 'trade.vtr.sv/orders';
    return 'www.driverdb.sv' + (p.pid ? `/driver/${p.pid}` : `/${p.db}`);
  }
  browser() {
    const site = { tyres: () => this.tyreSite(), jobs: () => this.jobsSite(), news: () => this.newsSite(), series: () => this.seriesSite(), bank: () => this.bankSite(), classifieds: () => this.classSite(), registry: () => this.regSite() }[this.app]?.() ?? this.driverSite();
    return `<div class="pc-bar"><button class="pc-btn sm" data-nav data-act="back" data-key="bback">&larr; Back</button><div class="pc-url">http://${esc(this.url())}</div></div><div class="pc-page">${site}</div>`;
  }

  // the Paddock Wire: headlines, and a story page (race reports carry the classification)
  newsSite() {
    const w = this.w, items = w.news || [];
    const mast = `<div class="nw-mast"><b>THE PADDOCK WIRE</b><small>Motorsport news from San Velocita &middot; ${w.year}</small></div>`;
    if (this.page.news !== 'home') {
      const n = items[this.page.news]; if (!n) return mast;
      return mast + `<div class="nw-story" data-nav data-scroll data-key="story" data-first><div class="nw-date">${esc(n.when || '')} ${n.y}</div><h1>${esc(cap(n.head))}</h1><div class="nw-by">By Wire staff</div><p>${esc(n.body)}</p>${this.reportTable(n.report, n.y)}</div>`;
    }
    if (!items.length) return mast + '<p class="pc-empty">No stories yet.</p>';
    const lead = items[0];
    const rest = items.slice(1, 40).map((n, k) => `<div class="nw-row" data-nav data-act="article" data-arg="${k + 1}" data-key="art-${k + 1}"><small>${esc(n.when || '')} ${n.y}</small><a>${esc(cap(n.head))}</a></div>`).join('');
    return mast + `<div class="nw-lead" data-nav data-act="article" data-arg="0" data-key="art-0" data-first><small>LATEST &middot; ${esc(lead.when || '')} ${lead.y}</small><h1>${esc(cap(lead.head))}</h1><p>${esc(lead.body)}</p></div>
      <div class="nw-ad">YOUR LOGO HERE &middot; Advertise on the Wire &middot; call 555-0199</div><div class="nw-list">${rest}</div>`;
  }
  // ---------- Form SV-1: the San Velocita Business Registry ----------
  get form() {
    const w = this.w, name = w.player.name;
    if (this._form && this._formFor === w) return this._form;
    this._formFor = w;
    return (this._form = { name, team: `${name.split(' ').pop()} Racing`, colors: [w.teams[w.player.team].main, w.teams[w.player.team].accent], home: 'pinewood', background: 'mechanic', ex: WC.EX_NAMES[Math.floor(Math.random() * WC.EX_NAMES.length)], years: 7 });
  }
  formOk() { const f = this.form; return f.name.trim() && f.team.trim() && f.ex.trim(); }
  cycle(field, d) {
    const f = this.form, wrap = (a, i) => a[(i + a.length) % a.length];
    if (field === 'home') { const k = Object.keys(WC.TOWNS); f.home = wrap(k, k.indexOf(f.home) + d); }
    else if (field === 'background') { const k = Object.keys(WC.BACKGROUNDS); f.background = wrap(k, k.indexOf(f.background) + d); }
    else if (field === 'years') f.years = Math.max(1, Math.min(30, f.years + d));
    else if (field.startsWith('q-')) { const c = field.slice(2), o = this.order; o[c] = Math.max(0, Math.min(8, (o[c] || 0) + d)); this.orderArmed = false; }
    else if (field.startsWith('pay-')) { const id = field.slice(4), x = (this.w.staff || []).find(s => s.id === id); if (x) { const k = WC.PAY_MODES.map(m => m[0]); this.src.staff?.('pay', id, wrap(k, k.indexOf(x.pay) + d)); } }
    else if (field === 'c0' || field === 'c1') { const i = +field[1]; f.colors[i] = wrap(PALETTE, Math.max(0, PALETTE.indexOf(f.colors[i])) + d); }
    this.curKey = 'f-' + field; this.render(); this.src.sfx?.move?.();
  }
  // typing into a text field: the real input takes the keyboard until Enter / Esc / a click elsewhere
  type(field) {
    const inp = this.scr.querySelector(`input[data-field="${field}"]`); if (!inp) return;
    this.typing = field; inp.closest('.rg-field').classList.add('typing');
    inp.focus(); inp.select(); // (typing replaces the default)
    const done = () => { inp.removeEventListener('blur', done); this.typing = null; this.curKey = 'f-' + field; this.render(); };
    inp.addEventListener('blur', done);
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); inp.blur(); } };
    inp.oninput = () => { this.form[field] = inp.value.slice(0, 24); inp.closest('.rg-field').querySelector('.rg-val').textContent = this.form[field]; this.snapSoon(); };
    this.snapSoon();
  }
  regSite() {
    const w = this.w, f = this.form;
    const head = `<div class="rg-head"><b>San Velocita Business Registry</b><small>Province of San Velocita &middot; Department of Forms &middot; Est. 1957</small></div>`;
    if (w.founding?.reg) {
      const t = w.teams[w.player.team];
      return head + `<div class="rg-body"><h1>Form SV-1: received</h1><p>Thank you. <b>${esc(t.name)}</b> is a registered Sporting Enterprise based in ${esc(WC.TOWNS[w.home]?.name || '')}.</p><p>You can't change your registration online. To amend it, visit any Registry office between 10:15 and 10:45 on alternate Wednesdays.</p></div>`;
    }
    const text = (k, label, hint) => `<div class="rg-field" data-nav data-act="type" data-arg="${k}" data-key="f-${k}"${k === 'name' ? ' data-first' : ''}><label>${label}</label><span class="rg-box"><span class="rg-val">${esc(f[k])}</span><span class="rg-caret"></span><input data-field="${k}" value="${esc(f[k])}" maxlength="24" spellcheck="false" autocomplete="off"></span>${hint ? `<small>${hint}</small>` : ''}</div>`;
    const cyc = (k, label, val, hint) => `<div class="rg-field" data-nav data-cycle="${k}" data-key="f-${k}"><label>${label}</label><span class="rg-cyc"><i data-act="cyc" data-arg="${k}:-1">&#9664;</i><b>${val}</b><i data-act="cyc" data-arg="${k}:1">&#9654;</i></span>${hint ? `<small>${hint}</small>` : ''}</div>`;
    const sw = (c) => `<i class="rg-sw" style="background:${hex(c)}"></i>`;
    const T = WC.TOWNS[f.home], B = WC.BACKGROUNDS[f.background];
    return head + `<div class="rg-body"><h1>Form SV-1: Registration of a Sporting Enterprise</h1>
      <p class="rg-small">Please complete all sections.</p>
      <h2>Section A: the enterprise</h2>
      ${text('team', 'Name of enterprise')}
      ${cyc('c0', 'Principal colour', sw(f.colors[0]))}${cyc('c1', 'Secondary colour', sw(f.colors[1]))}
      ${cyc('home', 'Registered premises', esc(T.name), `${esc(T.blurb)} <em>${esc(WC.HOME_PERK)}</em>`)}
      <h2>Section B: the proprietor</h2>
      ${text('name', 'Full name')}
      ${cyc('background', 'Previous occupation', esc(B.name), `<em>${esc(B.perk)}</em>`)}
      <h2>Section C: marital status</h2>
      ${text('ex', 'Former spouse')}
      ${cyc('years', 'Years married', f.years)}
      <div class="rg-submit"><button class="pc-btn" data-nav data-act="file" data-key="file">Submit Form SV-1 and pay $250</button>${this.formOk() ? '' : '<small class="neg">Please fill in every field.</small>'}</div></div>`;
  }

  // ---------- Team: your staff and the payroll ----------
  teamApp() {
    const w = this.w, staff = w.staff || [];
    if (!w.founding?.reg) return '<div class="tm"><p class="pc-empty">Register the team first.</p></div>';
    const roles = Object.keys(WC.ROLES);
    const rows = roles.map(role => {
      const x = WC.staffOf(w, role), R = WC.ROLES[role];
      if (!x) return `<div class="tm-row vacant"><div class="tm-who"><b>${R.name}</b><small>Vacant &middot; ${esc(R.perk)}</small></div><button class="pc-btn sm" data-nav data-act="jobs" data-arg="${role}" data-key="find-${role}">Find one</button></div>`;
      const mood = x.morale >= 70 ? 'happy' : x.morale >= 45 ? 'fine' : x.morale >= 25 ? 'unhappy' : 'furious';
      return `<div class="tm-row"><div class="tm-who"><b>${esc(x.first)} ${esc(x.last)}</b><small>${R.name} &middot; skill ${'&#9733;'.repeat(x.skill)}${'&#9734;'.repeat(5 - x.skill)} &middot; ${WC.money$(WC.wageNow(w, x))} a round</small></div>
        <div class="tm-mood ${mood}"><i><b style="width:${x.morale}%"></b></i><small>${mood}${x.owed ? ` &middot; owed <span class="neg">${WC.money$(x.owed)}</span>` : ''}</small></div>
        <div class="tm-pay" data-nav data-cycle="pay-${x.id}" data-key="pay-${x.id}"><i data-act="cyc" data-arg="pay-${x.id}:-1">&#9664;</i><b>${WC.PAY_MODES.find(m => m[0] === x.pay)[1]}</b><i data-act="cyc" data-arg="pay-${x.id}:1">&#9654;</i></div>
        <div class="tm-acts">${x.owed ? `<button class="pc-btn sm" data-nav data-act="backpay" data-arg="${x.id}" data-key="bp-${x.id}">Pay back ${WC.money$(x.owed)}</button>` : ''}<button class="pc-btn sm" data-nav data-act="fire" data-arg="${x.id}" data-key="fire-${x.id}">${this.fireArmed === x.id ? 'Sure? Select again' : 'Let go'}</button></div></div>`;
    }).join('');
    const due = WC.payrollDue(w), short = WC.payrollShort(w);
    return `<div class="tm"><div class="tm-head"><b>${esc(w.teams[w.player.team].name)}</b><small>Staff and payroll</small></div>
      <div class="tm-list">${rows}</div>
      <div class="tm-foot ${short ? 'short' : ''}">Next payroll (as the next round starts): <b>${WC.money$(due)}</b> &middot; balance <b class="${w.money.balance < 0 ? 'neg' : ''}">${WC.money$(w.money.balance)}</b>${short ? `<br><span class="neg">That doesn't cover it. Pay someone half, or hold their wages this round.</span>` : ''}${w.wageClaims ? `<br>Includes ${WC.money$(w.wageClaims)} in wage claims from former staff.` : ''}</div>
      <p class="tm-note">Pay on time and people stay happy. Half or hold and they're owed the rest, and they notice. Someone unhappy enough, and owed money, walks out.</p>
      <div class="tm-links"><button class="pc-btn sm" data-nav data-act="open" data-arg="jobs" data-key="jobs">Applicants on SVJobs &rarr;</button></div></div>`;
  }
  // Velocita Tyre & Rubber: your stock, the next round's forecast, an order form
  get order() { return this._order || (this._order = { soft: 0, medium: 0, hard: 0, wet: 0 }); }
  tyreSite() {
    const w = this.w, st = WC.stockOf(w), used = WC.usedOf(w), price = WC.tyreCost(w), o = this.order;
    const head = `<div class="tr-head"><b>VELOCITA TYRE &amp; RUBBER</b><small>Trade orders &middot; account: ${esc(w.teams[w.player.team].name)}</small></div>`;
    if (!w.founding?.reg) return head + '<p class="pc-empty">Trade accounts are for registered businesses only.</p>';
    const S = w.series[w.player.series], R = !w.over ? S.cal[w.round] : null, need = R ? WC.tyreNeeds(w) : null;
    const mgr = WC.staffOf(w, 'manager');
    const rows = WC.COMPOUNDS.map(c => `<tr><td><i class="tr-dot ${c}"></i>${c[0].toUpperCase() + c.slice(1)}</td><td class="r">${st[c]}</td><td class="r">${used.filter(u => u.c === c).length}</td>${need ? `<td class="r">${need[c]}</td>` : ''}
      <td><div class="tr-qty" data-nav data-cycle="q-${c}" data-key="q-${c}"${c === 'soft' ? ' data-first' : ''}><i data-act="cyc" data-arg="q-${c}:-1">&#9664;</i><b>${o[c] || 0}</b><i data-act="cyc" data-arg="q-${c}:1">&#9654;</i></div></td></tr>`).join('');
    const n = WC.COMPOUNDS.reduce((x, c) => x + (o[c] || 0), 0);
    return head + `<div class="tr-body">
      ${R ? `<p class="tr-next">Next round: <b>${esc(R.name)}</b>, ${esc(R.time)}, forecast <b>${esc(R.weather)}</b>.</p>` : ''}
      ${mgr ? `<p class="tr-mgr">${esc(mgr.first)} orders for each round. You can still order extra here.</p>` : ''}
      <table class="pc-tbl tr-tbl"><tr><th>COMPOUND</th><th class="r">NEW IN STOCK</th><th class="r">USED</th>${need ? '<th class="r">A WEEKEND USES</th>' : ''}<th>ORDER</th></tr>${rows}</table>
      <div class="tr-total">${n} set${n === 1 ? '' : 's'} &times; ${WC.money$(price)} = <b>${WC.money$(n * price)}</b>
        <button class="pc-btn" data-nav data-act="placeorder" data-key="placeorder">${this.orderArmed ? 'Confirm order? Select again' : 'Place order'}</button></div>
      <p class="tr-fine">Orders are delivered before your next round. Trackside service at events is charged at ${Math.round((WC.TRACKSIDE - 1) * 100)}% over list. Used sets are not accepted for return.</p></div>`;
  }

  // SVJobs: the applicants, by job
  jobsSite() {
    const w = this.w, role = this.page.role || 'mechanic', jobs = (w.jobs || []).filter(j => j.role === role);
    const head = `<div class="jb-head"><b>SVJobs</b><small>Motorsport &middot; San Velocita</small></div>`;
    const tabs = Object.keys(WC.ROLES).map(r => `<span class="jb-tab${r === role ? ' on' : ''}" data-nav data-act="role" data-arg="${r}" data-key="role-${r}">${WC.ROLES[r].name}</span>`).join('');
    const cur = WC.staffOf(w, role);
    const rows = jobs.map((j, k) => `<div class="jb-row"><div><b>${esc(j.first)} ${esc(j.last)}</b>, ${j.age}<small>${esc(j.cv)}</small></div>
      <div class="jb-meta">skill ${'&#9733;'.repeat(j.skill)}${'&#9734;'.repeat(5 - j.skill)}<br>${WC.money$(WC.wageNow(w, j))} a round</div>
      <button class="pc-btn sm" data-nav data-act="hire" data-arg="${j.id}" data-key="hire-${j.id}"${k === 0 ? ' data-first' : ''}>${this.hireArmed === j.id ? (cur ? `Replace ${esc(cur.first)}? Select again` : 'Hire? Select again') : 'Hire'}</button></div>`).join('');
    return head + `<div class="jb-tabs">${tabs}</div><div class="jb-body"><p class="jb-perk">${esc(WC.ROLES[role].perk)}</p>${cur ? `<p class="jb-cur">You have one: ${esc(cur.first)} ${esc(cur.last)}. Hiring someone else lets ${esc(cur.first)} go.</p>` : ''}${rows || '<p class="pc-empty">No applicants this season.</p>'}</div>`;
  }

  // ---------- Telemetry: the session files (readable only with a data engineer) ----------
  telApp() {
    const w = this.w, files = w.telemetry || [], lvl = WC.dataLevel(w), eng = WC.staffOf(w, 'engineer');
    const name = (t) => `R${t.r + 1}_${t.track.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 14)}_${t.kind.toUpperCase().slice(0, 5)}.DAT`;
    const cur = files.find(t => t.id === this.page.file) || null;
    const list = files.map((t, k) => `<div class="tl-row${cur && cur.id === t.id ? ' sel' : ''}" data-nav data-act="file2" data-arg="${t.id}" data-key="tf-${t.id}"${(!cur && k === 0) || (cur && cur.id === t.id) ? ' data-first' : ''}><b>${name(t)}</b><small>${t.y} &middot; ${(t.laps * 37 + 12)} KB</small></div>`).join('') || '<p class="pc-empty">No session data yet. Every session you drive is logged here.</p>';
    let view = '';
    if (!cur) view = `<p class="tl-hint">${lvl ? `${esc(eng.first)} has the data. Pick a session.` : 'Pick a file.'}</p>`;
    else if (lvl === 0) view = `<div class="tl-raw" data-nav data-scroll data-key="tlraw"><div class="tl-chan">${['CH_00', 'CH_03', 'CH_07', 'CH_0A', 'CH_11'].map(c => `<span>${c}</span>`).join('')}</div><pre>${hexDump(cur.id + cur.best, 22)}</pre><p class="tl-junk">${esc(garble('Best lap ' + cur.best.toFixed(3) + ' reference ' + cur.ref.toFixed(3)))}</p></div>
      <p class="tl-hint">You can't make sense of this. A data engineer could.</p>`;
    else {
      const gap = cur.best - cur.ref, mm = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
      view = `<div class="tl-read" data-nav data-scroll data-key="tlread"><h2>${esc(cur.track)} &middot; ${cur.kind === 'quali' ? 'Qualifying' : cur.kind === 'practice' ? 'Practice' : 'Race'} ${cur.y}</h2>
        <div class="db-cells"><div><small>Your best lap</small><b>${mm(cur.best)}</b></div><div><small>Reference</small><b>${mm(cur.ref)}</b></div><div><small>Gap</small><b class="${gap > 0 ? 'neg' : 'pos'}">${gap >= 0 ? '+' : '-'}${Math.abs(gap).toFixed(3)}</b></div><div><small>Laps</small><b>${cur.laps}</b></div></div>
        <h3>Where the time went</h3><table class="pc-tbl"><tr><th>CORNER</th><th class="r">LOST</th>${lvl === 2 ? '<th>NOTE</th>' : ''}</tr>${cur.corners.map(c => `<tr><td>${esc(c.name)}</td><td class="r ${c.loss > 0 ? 'neg' : 'pos'}">${c.loss >= 0 ? '+' : '-'}${Math.abs(c.loss).toFixed(3)}</td>${lvl === 2 ? `<td class="tl-tip">${esc(tipText(c.tip || '', 'kmh'))}</td>` : ''}</tr>`).join('')}</table>
        ${lvl === 2 ? `<p class="tl-sig">&mdash; ${esc(eng.first)}</p>` : `<p class="tl-hint">${esc(eng.first)} can show you where, not why. A senior engineer would.</p>`}</div>`;
    }
    return `<div class="tl"><div class="tl-files">${list}</div><div class="tl-view">${view}</div></div>`;
  }

  // ---------- the classifieds: SVList ----------
  classSite() {
    const w = this.w, ads = w.ads || [], p = this.page;
    const head = `<div class="cl-head"><b>SVList</b><small>san velocita &gt; for sale &gt; cars &amp; trucks &gt; by owner</small></div>`;
    if (!w.founding?.reg) return head + '<p class="pc-empty">Register your team first (Form SV-1).</p>';
    if (p.ad) {
      const ad = ads.find(a => a.id === p.ad); if (!ad) return head + '<p class="pc-empty">This posting has been deleted by its author.</p>';
      const can = !w.car, broke = w.money.balance < ad.price;
      return head + `<div class="cl-ad" data-nav data-scroll data-key="adpage">
        <h1>${ad.year} ${esc(ad.name)} &ndash; ${WC.money$(ad.price)} <small>(${esc(WC.TOWNS[['pinewood', 'gulch', 'city', 'azure'][ad.price % 4]].name)})</small></h1>
        <div class="cl-top">${this.photo(ad, 'cl-photo')}
        <table class="cl-attrs"><tr><td>condition:</td><td><b>${WC.condName(ad.cond).toLowerCase()}</b></td></tr><tr><td>odometer:</td><td><b>${ad.miles.toLocaleString('en-US')}</b></td></tr><tr><td>title status:</td><td><b>${ad.cond < 0.6 ? 'salvage' : 'clean'}</b></td></tr>${this.specRows(ad.chassis)}<tr><td>seller:</td><td><b>${esc(ad.seller)}</b></td></tr></table></div>
        <p>${esc(ad.blurb)}</p><p class="cl-fine">cash only. no test drives. post id: ${ad.id.slice(2)}${ad.price}</p></div>
        <div class="cl-buy">${can ? `<button class="pc-btn" data-nav data-act="buy" data-arg="${ad.id}" data-key="buy" data-first>${this.buyArmed ? `Pay ${WC.money$(ad.price)}? Select again` : `Buy it: ${WC.money$(ad.price)}`}</button>${broke ? '<small class="neg">This is more than your balance.</small>' : ''}<small>Condition matters: a tired car is down on power until it's sorted out.</small>` : '<small>You already own a car.</small>'}</div>`;
    }
    const rows = ads.map((ad, k) => `<div class="cl-row" data-nav data-act="ad" data-arg="${ad.id}" data-key="ad-${ad.id}"${k === 0 ? ' data-first' : ''}>${this.photo(ad, 'cl-thumb')}<span class="cl-price">${WC.money$(ad.price)}</span><a>${ad.year} ${esc(ad.name)} &ndash; ${esc(ad.blurb.split('.')[0].toLowerCase())}</a><small>${WC.condName(ad.cond).toLowerCase()} &middot; ${Math.round(ad.miles / 1000)}k miles</small></div>`).join('');
    return head + (w.car ? `<p class="cl-note">Your car: ${w.car.year} ${esc(w.car.name)}.</p>` : '') + `<div class="cl-list">${rows || '<p class="pc-empty">No listings.</p>'}</div>`;
  }
  // a listing's photo (rendered once, then cached by main.js)
  photo(ad, cls) { const src = this.src.photo?.(ad); return src ? `<img class="${cls}" src="${src}">` : `<div class="${cls} none">no image</div>`; }
  // the car's spec, as the ad would list it
  specRows(chassis) {
    const c = this.src.carInfo?.(chassis); if (!c) return '';
    return `<tr><td>engine:</td><td><b>${esc(c.engine)}, ${c.hp} hp</b></td></tr><tr><td>transmission:</td><td><b>${esc(c.box)}</b></td></tr><tr><td>drive:</td><td><b>${esc(c.drive)}</b></td></tr><tr><td>weight:</td><td><b>${c.kg} kg</b></td></tr><tr><td>top speed:</td><td><b>${esc(c.top)}</b></td></tr>`;
  }

  // a weekend's statement, line by line
  billTable(b) {
    if (!b) return '';
    return `<table class="pc-tbl bill">${b.items.map(([what, amt]) => `<tr><td>${esc(what)}</td><td class="r ${amt < 0 ? 'neg' : 'pos'}">${amt > 0 ? '+' : ''}${WC.money$(amt)}</td></tr>`).join('')}
      <tr class="tot"><td>Net for the weekend</td><td class="r ${b.net < 0 ? 'neg' : 'pos'}">${b.net > 0 ? '+' : ''}${WC.money$(b.net)}</td></tr><tr class="tot"><td>Balance</td><td class="r ${b.bal < 0 ? 'neg' : ''}">${WC.money$(b.bal)}</td></tr></table>`;
  }
  // First Velocita Bank: the balance, the annuity (and the people who'd like to buy it), every transaction
  bankSite() {
    const w = this.w, m = w.money;
    const head = `<div class="bk-head"><b>First Velocita Bank</b><small>Business Online &middot; ${esc(w.teams[w.player.team].name)}</small></div>`;
    if (!m || !m.choice) return head + '<p class="pc-empty">No money in the account yet. Claim your lottery winnings first: the email from the State Lottery is in your inbox.</p>';
    const season = m.tx.filter(t => t.y === w.year), inn = season.filter(t => t.amt > 0).reduce((a, t) => a + t.amt, 0), out = season.filter(t => t.amt < 0).reduce((a, t) => a + t.amt, 0);
    const offer = WC.annuityOffer(w);
    const ann = m.choice === 'annuity'
      ? `<div class="bk-box"><b>State Lottery annuity</b><span>${m.annuityLeft} yearly payment${m.annuityLeft === 1 ? '' : 's'} still to come.</span></div>
         ${offer ? `<div class="bk-ad"><b>QuickCash Settlements</b><span>Why wait for YOUR money? We'll pay you <u>${WC.money$(offer)}</u> TODAY for your remaining lottery payments!</span><button class="pc-btn" data-nav data-act="sell" data-key="sell">${this.sellArmed ? 'Are you sure? Select again' : 'Sell my payments'}</button></div>` : ''}`
      : `<div class="bk-box"><b>State Lottery</b><span>Paid as a lump sum. There's no more coming.</span></div>`;
    const rows = m.tx.slice(0, 60).map(t => `<tr><td class="d">${esc(t.when)} ${t.y}</td><td>${esc(t.what)}</td><td class="r ${t.amt < 0 ? 'neg' : 'pos'}">${t.amt > 0 ? '+' : ''}${WC.money$(t.amt)}</td><td class="r ${t.bal < 0 ? 'neg' : ''}">${WC.money$(t.bal)}</td></tr>`).join('');
    return head + `<div class="bk-body">
      <div class="db-cells bk-cells"><div><small>Balance</small><b class="${m.balance < 0 ? 'neg' : ''}">${WC.money$(m.balance)}</b></div><div><small>In this season</small><b class="pos">${WC.money$(inn)}</b></div><div><small>Out this season</small><b class="neg">${WC.money$(-out)}</b></div></div>
      ${m.balance < 0 ? `<p class="bk-warn">Your account is overdrawn. Overdrawn balances are charged 1.5% a round plus a $250 fee.</p>` : ''}
      ${ann}
      <h2>Transactions</h2><div class="bk-txw" data-nav data-scroll data-key="tx" data-first><table class="pc-tbl bk-tx"><tr><th>WHEN</th><th>DESCRIPTION</th><th class="r">AMOUNT</th><th class="r">BALANCE</th></tr>${rows}</table></div></div>`;
  }
  // a round's classification (only while that season's results are still kept)
  reportTable(rep, y) {
    const w = this.w; if (!rep || y !== w.year) return '';
    const res = w.series[rep.s]?.results.find(r => r.round === rep.round); if (!res) return '';
    return `<table class="pc-tbl"><tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th class="r">PTS</th></tr>${res.rows.slice().sort((a, b) => (a.dnf - b.dnf) || a.pos - b.pos).map(r => {
      const tid = WC.teamOfPid(w, r.pid), t = w.teams[tid];
      return `<tr class="${r.pid === 'P' ? 'me' : ''}"><td>${r.dnf ? 'DNF' : r.pos}</td><td><i class="sw" style="background:${hex(t?.main)}"></i>${esc(WC.displayName(w, r.pid))}${r.fl ? ' <small>FL</small>' : ''}</td><td>${esc(t?.name || '')}</td><td class="r">${r.pts || ''}</td></tr>`; }).join('')}</table>`;
  }

  // a series' website: standings, teams, calendar, champions; links to the other series
  seriesSite() {
    const w = this.w, s = WC.seriesById(this.page.s), S = w.series[s.id], tab = this.page.tab;
    const nav = SITE_TABS.map(t => `<span class="ss-tab${t === tab ? ' on' : ''}" data-nav data-act="tab" data-arg="${t}" data-key="tab-${t}"${t === tab ? ' data-first' : ''}>${SITE_TAB_NAME[t]}</span>`).join('');
    const others = WC.SERIES.filter(x => x.id !== s.id).map(x => `<span class="ss-link" data-nav data-act="site" data-arg="${x.id}" data-key="site-${x.id}">${esc(x.name)} &rarr;</span>`).join('');
    let body = '';
    if (tab === 'standings') {
      const st = WC.seriesStandings(w, s.id);
      body = !S.results.length ? '<p class="pc-empty">The season hasn\'t started.</p>' : `<table class="pc-tbl"><tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th class="r">WINS</th><th class="r">PTS</th></tr>${st.map((e, k) => {
        const t = w.teams[WC.teamOfPid(w, e.pid)];
        return `<tr class="${e.pid === 'P' ? 'me' : ''}"><td>${k + 1}</td><td><i class="sw" style="background:${hex(t?.main)}"></i>${esc(WC.displayName(w, e.pid))}</td><td>${esc(t?.name || '')}</td><td class="r">${e.wins}</td><td class="r">${e.pts}</td></tr>`; }).join('')}</table>`;
    } else if (tab === 'teams') {
      const st = WC.teamStandings(w, s.id), list = st.length ? st : S.teams.map(tid => ({ tid, pts: 0, wins: 0 }));
      body = `<table class="pc-tbl"><tr><th>POS</th><th>TEAM</th><th>DRIVERS</th><th class="r">WINS</th><th class="r">PTS</th></tr>${list.map((e, k) => {
        const t = w.teams[e.tid];
        return `<tr class="${t.mine ? 'me' : ''}"><td>${k + 1}</td><td><i class="sw" style="background:${hex(t.main)}"></i>${esc(t.name)}</td><td>${t.drivers.map(d => esc(WC.displayName(w, d))).join(', ')}</td><td class="r">${e.wins}</td><td class="r">${e.pts}</td></tr>`; }).join('')}</table>`;
    } else if (tab === 'calendar') {
      body = `<table class="pc-tbl"><tr><th>RD</th><th>CIRCUIT</th><th>CONDITIONS</th><th>WINNER</th></tr>${S.cal.map((c, k) => {
        const res = S.results.find(x => x.round === k), win = res && res.rows.find(x => x.pos === 1 && !x.dnf);
        const now = s.id === w.player.series && k === w.round && !w.over;
        return `<tr class="${now ? 'now' : ''}"><td>${k + 1}</td><td>${esc(c.name)}${now ? ' <small>NEXT</small>' : ''}</td><td>${esc(c.time)}${c.weather === 'clear' ? '' : ', ' + esc(c.weather)}</td><td>${win ? esc(WC.displayName(w, win.pid)) : ''}</td></tr>`; }).join('')}</table>`;
    } else {
      const rows = w.seasons.slice().reverse().map(sum => { const pid = sum.champs[s.id], tid = sum.teamChamps[s.id]; return `<tr class="${pid === 'P' ? 'me' : ''}"><td>${sum.year}</td><td>${pid ? esc(WC.displayName(w, pid)) : ''}</td><td>${tid ? esc(w.teams[tid].name) : ''}</td></tr>`; }).join('');
      body = rows ? `<table class="pc-tbl"><tr><th>YEAR</th><th>CHAMPION</th><th>TEAMS' CHAMPION</th></tr>${rows}</table>` : '<p class="pc-empty">No champions yet: the first title is decided this year.</p>';
    }
    return `<div class="ss" style="--ss:${SERIES_COL[s.id]}"><div class="ss-head"><b>${esc(s.name.toUpperCase())}</b><small>Official website &middot; ${w.year} season</small></div><div class="ss-nav">${nav}</div><div class="ss-body">${body}</div><div class="ss-foot">Other series: ${others}</div></div>`;
  }

  // the driver database: everyone, by series (and the retired), and a page per driver
  driverSite() {
    const w = this.w, p = this.page;
    const head = `<div class="db-head"><b>Velocita Driver Database</b><small>Every driver, every season</small></div>`;
    if (p.pid) return head + this.driverPage(p.pid);
    const nav = DB_TABS.map(t => `<span class="db-tab${t === p.db ? ' on' : ''}" data-nav data-act="db" data-arg="${t}" data-key="db-${t}">${t === 'retired' ? 'Retired' : esc(WC.seriesById(t).name)}</span>`).join('');
    let ids;
    if (p.db !== 'retired') {
      const st = WC.seriesStandings(w, p.db), order = st.map(e => e.pid);
      for (const tid of w.series[p.db].teams) for (const pid of w.teams[tid].drivers) if (!order.includes(pid)) order.push(pid);
      ids = order.filter(pid => pid === 'P' || (w.people[pid] && !w.people[pid].retired && w.teams[WC.teamOfPid(w, pid)]?.series === p.db));
    } else ids = Object.values(w.people).filter(x => x.retired && x.starts > 0).sort((a, b) => b.titles - a.titles || b.wins - a.wins || b.starts - a.starts).slice(0, 40).map(x => x.id);
    const rows = ids.map((pid, k) => {
      const isP = pid === 'P', x = isP ? w.player : w.people[pid], t = w.teams[WC.teamOfPid(w, pid)];
      return `<tr class="${isP ? 'me' : ''}" data-nav data-act="driver" data-arg="${pid}" data-key="drv-${pid}"${k === 0 ? ' data-first' : ''}><td><a>${esc(WC.displayName(w, pid))}</a></td><td>${isP ? 'You' : NAT[x.nat] || x.nat}</td><td>${p.db === 'retired' ? x.retiredYear : esc(t?.name || '')}</td><td class="r">${x.wins}</td><td class="r">${x.titles}</td></tr>`;
    }).join('');
    return head + `<div class="db-nav">${nav}</div>` + (rows ? `<table class="pc-tbl db"><tr><th>DRIVER</th><th>FROM</th><th>${p.db === 'retired' ? 'RETIRED' : 'TEAM'}</th><th class="r">WINS</th><th class="r">TITLES</th></tr>${rows}</table>` : '<p class="pc-empty">Nobody here yet.</p>');
  }
  driverPage(pid) {
    const w = this.w, isP = pid === 'P', p = isP ? null : w.people[pid], c = isP ? w.player : p;
    if (!c) return '';
    const t = w.teams[isP ? w.player.team : p.team];
    const bar = (k, v) => `<div class="db-stat"><span>${k}</span><i><b style="width:${Math.round(v)}%"></b></i><em>${Math.round(v)}</em></div>`;
    const hist = c.hist.slice().reverse().map(h => `<tr><td>${h.y}</td><td>${esc(WC.seriesById(h.s).name)}</td><td>${esc(h.team)}</td><td class="r">${ord(h.pos)}</td><td class="r">${h.wins}</td><td class="r">${h.pts}</td></tr>`).join('');
    const h = !isP ? WC.h2hOf(w, pid) : null;
    return `<div class="db-page" data-nav data-scroll data-key="dbpage" data-first>
      <h1>${esc(isP ? w.player.name : WC.nameOf(p))}</h1>
      <div class="db-facts">${isP ? 'You' : `${NAT[p.nat] || p.nat} &middot; age ${WC.ageOf(w, p)}`} &middot; ${p && p.retired ? 'retired ' + p.retiredYear : t ? esc(t.name) : 'no seat'}</div>
      <div class="db-cells"><div><small>Starts</small><b>${c.starts}</b></div><div><small>Wins</small><b>${c.wins}</b></div><div><small>Podiums</small><b>${c.pods}</b></div><div><small>Titles</small><b>${c.titles}</b></div></div>
      ${isP ? '' : `<h2>Scouting report</h2>${bar('Pace', p.pace)}${bar('Consistency', p.cons)}${bar('Racecraft', p.craft)}${bar('Wet weather', p.wet)}${bar('Aggression', p.aggr)}`}
      ${h && h.races ? `<h2>Against you</h2><div class="db-cells"><div><small>Races</small><b>${h.races}</b></div><div><small>Ahead of you</small><b>${h.behind}</b></div><div><small>Passes</small><b>${h.youPassed} / ${h.passedYou}</b></div><div><small>Contact</small><b>${h.contacts}</b></div></div>` : ''}
      <h2>Career</h2>${hist ? `<table class="pc-tbl"><tr><th>YEAR</th><th>SERIES</th><th>TEAM</th><th class="r">POS</th><th class="r">WINS</th><th class="r">PTS</th></tr>${hist}</table>` : '<p class="pc-empty">No full seasons yet.</p>'}
    </div>`;
  }

  // ---------- the monitor's texture: a snapshot of the DOM ----------
  snapSoon() {
    if (this.snapQueued) return;
    this.snapQueued = true;
    requestAnimationFrame(() => { this.snapQueued = false; this.snap(); });
  }
  // the styles the snapshot needs (the computer's own rules; it uses system fonts, so nothing to embed)
  css() {
    if (this._css) return this._css;
    const out = [], want = /#pc|\.(pc|nw|ss|db|bk|rg|cl|tm|jb|tl|tr)(-|\b)/; // (the class prefixes of the computer's styles: a new site needs its prefix here)
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; } for (const r of rules) if (r.selectorText && want.test(r.selectorText)) out.push(r.cssText); }
    return (this._css = out.join('\n'));
  }
  snap() {
    if (!this.w) return;
    if (this.fallback) { this.drawIdle(); return; }
    if (this.snapping) { this.snapAgain = true; return; }
    this.snapping = true;
    const clone = this.scr.cloneNode(true);
    clone.style.transform = 'none';
    clone.querySelectorAll('input').forEach(e => e.remove()); // (the fields show their text in spans)
    // (photos: if this browser won't snapshot a page with images, they become grey boxes instead)
    const imgs = clone.querySelectorAll('img');
    if (this.noImgSnap) imgs.forEach(e => { const d = document.createElement('div'); d.className = e.className + ' none'; e.replaceWith(d); });
    // scrolled panes: an image can't scroll, so their contents are shifted up instead
    const live = this.scr.querySelectorAll('*'), cl = clone.querySelectorAll('*');
    live.forEach((e, i) => {
      if (e.scrollTop <= 0) return;
      const c = cl[i], wrap = document.createElement('div');
      wrap.style.transform = `translateY(${-e.scrollTop}px)`;
      while (c.firstChild) wrap.appendChild(c.firstChild);
      c.appendChild(wrap); c.style.overflow = 'hidden';
    });
    const body = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}"><foreignObject width="${W * S}" height="${H * S}"><div xmlns="http://www.w3.org/1999/xhtml" id="pc" class="on" style="position:relative;left:0;top:0;width:${W}px;height:${H}px;transform:scale(${S});transform-origin:0 0;opacity:1;border-radius:0"><style>${this.css().replace(/</g, '\\3c ')}</style>${body}</div></foreignObject></svg>`;
    // (a data: URL: Chrome treats a blob: one as foreign and "taints" any canvas it's drawn on, which WebGL then refuses)
    const img = new Image();
    const done = () => { this.snapping = false; if (this.snapAgain) { this.snapAgain = false; this.snapSoon(); } };
    const fail = () => {
      if (imgs.length && !this.noImgSnap) { this.noImgSnap = true; this.snapping = false; this.snapSoon(); return; } // (try again without the photos)
      this.fallback = true; this.el.classList.remove('ghost'); this.drawIdle(); done();
    };
    img.onload = () => {
      // drawn on a scratch canvas first: if this browser taints it anyway (Safari), the texture's canvas stays clean
      const tmp = this.tmp || (this.tmp = Object.assign(document.createElement('canvas'), { width: W * S, height: H * S }));
      const t = tmp.getContext('2d'); t.clearRect(0, 0, W * S, H * S); t.drawImage(img, 0, 0);
      try { t.getImageData(0, 0, 1, 1); } catch (e) { this.tmp = null; fail(); return; }
      const g = this.idle.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W * S, H * S); g.drawImage(tmp, 0, 0);
      this.glass(g);
      this.idleDirty = true; done();
    };
    img.onerror = fail;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  // the CRT's glass, on the texture: faint scanlines and a darker rim
  glass(g) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(0,0,0,.09)'; for (let y = 0; y < H * S; y += 3 * S) g.fillRect(0, y, W * S, S);
    const v = g.createRadialGradient(W * S / 2, H * S * 0.45, H * S * 0.35, W * S / 2, H * S / 2, H * S * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = v; g.fillRect(0, 0, W * S, H * S);
  }
  // the fallback texture (no snapshots): the desktop, drawn by hand
  drawIdle() {
    const w = this.w; if (!w) return;
    const g = this.idle.getContext('2d'), team = w.teams[w.player.team];
    g.setTransform(S, 0, 0, S, 0, 0);
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#0e4a52'); grd.addColorStop(1, '#06262b');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // the wallpaper's team name (bottom right)
    g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.font = "bold 46px Arial, sans-serif"; g.fillStyle = 'rgba(255,255,255,.14)'; g.fillText(team.name.toUpperCase(), W - 30, H - TASK_H - 52);
    g.font = "16px Arial, sans-serif"; g.fillStyle = 'rgba(255,255,255,.3)'; g.fillText(`${WC.seriesById(w.player.series).name} · ${w.year}`.toUpperCase(), W - 30, H - TASK_H - 28);
    g.fillStyle = hex(team.main); g.fillRect(W - 30 - 120, H - TASK_H - 112, 120, 6);
    // icons
    const nMail = WC.unreadMail(w);
    APPS.filter(a => !a.hidden).forEach((a, k) => {
      const x = ICON_X + Math.floor(k / ICON_ROWS) * ICON_COL + 8, y = ICON_Y + (k % ICON_ROWS) * ICON_STEP + 4, s = 44 / 64;
      for (const p of ICONS[a.id]) {
        if (p[0] === 'path') { g.strokeStyle = p[1]; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(x + 6 * s, y + 14 * s); g.lineTo(x + 32 * s, y + 34 * s); g.lineTo(x + 58 * s, y + 14 * s); g.stroke(); }
        else { g.fillStyle = p[0]; g.fillRect(x + p[1] * s, y + p[2] * s, p[3] * s, p[4] * s); }
      }
      g.textAlign = 'center'; g.font = "13px Arial, sans-serif"; g.fillStyle = '#fff'; g.fillText(a.label, x + 22, y + 64);
      if (a.id === 'mail' && nMail) { g.fillStyle = '#d23a2a'; g.beginPath(); g.arc(x + 46, y + 2, 10, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = "bold 12px Arial, sans-serif"; g.fillText(String(nMail), x + 46, y + 6); }
    });
    // the taskbar
    g.fillStyle = '#c3c0b6'; g.fillRect(0, H - TASK_H, W, TASK_H);
    g.fillStyle = '#fff'; g.fillRect(0, H - TASK_H, W, 2);
    g.fillStyle = '#e6e3da'; g.fillRect(4, H - TASK_H + 4, 44, TASK_H - 8);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.font = "bold 13px Arial, sans-serif"; g.fillText('SV', 26, H - 10);
    g.textAlign = 'right'; g.font = "13px Arial, sans-serif"; g.fillText(this.clock(), W - 12, H - 10);
    this.idleDirty = true;
  }
}
const SITE_TABS = ['standings', 'teams', 'calendar', 'champions'];
const SITE_TAB_NAME = { standings: 'Standings', teams: 'Teams', calendar: 'Calendar', champions: 'Champions' };
const DB_TABS = ['street', 'gt', 'formula', 'retired'];
const SERIES_COL = { street: '#e0642a', gt: '#2a8f5a', formula: '#2a4fa0' };
// headlines are stored in capitals (for the phone); the news site writes them in title case
function cap(s) { return String(s).toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(At|To|For|Of|The|In|Up)\b(?!$)/g, (m, x, i) => i ? m.toLowerCase() : m); }
