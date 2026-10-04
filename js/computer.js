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
import { photoOf } from './drivers.js';

export const W = 760, H = 600; // the screen's resolution (the CRT's glass is about 1.27 : 1)
const S = 2; // the texture's pixels per screen pixel (sharp enough to read sat at the desk)
const TASK_H = 30;
const NAT = { ITA: 'Italy', GBR: 'Britain', JPN: 'Japan', BRA: 'Brazil', GER: 'Germany', FRA: 'France', ESP: 'Spain', SWE: 'Sweden', POL: 'Poland', NGA: 'Nigeria', USA: 'USA', AUS: 'Australia', MEX: 'Mexico', KOR: 'Korea' };
const hex = (c) => '#' + ((c ?? 0x888888) >>> 0).toString(16).padStart(6, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ord = (p) => p + (['th', 'st', 'nd', 'rd'][(p % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][p % 100] || 'th');

// the desktop's icons (the same spots on the canvas copy)
// Three things on the desktop: Mail, Team (running the team, in tabs) and Internet (a home page of bookmarks to the
// websites). The websites are 'apps' of their own underneath, reached from the home page, from links, or from Team.
const APPS = [
  { id: 'mail', label: 'Mail', title: 'Mail' },
  { id: 'team', label: 'Team', title: 'Team' },
  { id: 'web', label: 'Internet', title: 'Web Browser' },
  ...[['news', 'Paddock Wire'], ['series', 'Series Site'], ['drivers', 'Driver Database'], ['bank', 'Bank'], ['classifieds', 'SVList'], ['parts', 'Speed Parts Direct'], ['jobs', 'SVJobs'], ['registry', 'Registry'], ['giggo', 'GigGo'], ['customer', 'Customer Racing']]
    .map(([id, label]) => ({ id, label, title: 'Web Browser', hidden: true, site: true })),
];
// the Team app's tabs (and the names they used to have as apps of their own, for links into them)
const TEAM_TABS = [['overview', 'Overview'], ['money', 'Finances'], ['car', 'Car'], ['dev', 'Development'], ['tyres', 'Tyres'], ['drivers', 'Drivers'], ['staff', 'Staff'], ['facilities', 'Facilities'], ['sponsors', 'Sponsors'], ['data', 'Data']];
const TEAM_ALIAS = { money: 'money', finances: 'money', facilities: 'facilities', dev: 'dev', workshop: 'car', tyres: 'tyres', staff: 'staff', telemetry: 'data', sponsors: 'sponsors', teamdrivers: 'drivers' }; // ('drivers' alone is the Driver Database website)
// the Internet's home page
const BOOKMARKS = [['news', 'The Paddock Wire', 'Motorsport news'], ['series', 'Series websites', 'Standings, teams, calendars, champions'], ['drivers', 'Velocita Driver Database', 'Every driver, every season'],
  ['classifieds', 'SVList', 'Cars and parts, by owner'], ['parts', 'Speed Parts Direct', 'Performance parts'], ['jobs', 'SVJobs', 'Hire staff'], ['giggo', 'GigGo Driver', 'Driving jobs. Be your own boss'], ['bank', 'First Velocita Bank', 'Business banking'],
  ['customer', 'Customer Racing', 'Homologated race cars: buy or lease']];
// the Paddock Wire's sections, and what each kind of article is called on the page
const NEWS_SECS = [['all', 'Front page'], ['report', 'Race reports'], ['paddock', 'Paddock'], ['opinion', 'Opinion'], ['brief', 'Other series']];
const NEWS_KIND = { report: 'Race report', paddock: 'Paddock', opinion: 'Opinion', brief: 'In brief' };
const NEWS_ADS = ['YOUR LOGO HERE · Advertise on the Wire · call 555-0199', "DALE'S TIRE & LUBE · Open Sundays · Ask about our rotation special", 'VELOCITA MOTORS · 0% finance* · *Not on anything you want', 'GIGGO · Be your own boss · Terms apply', 'FIRST VELOCITA BANK · Banking for winners · Lottery winners especially'];
// the bookmarks' little site icons (16 x 16, drawn as rects: [colour, x, y, w, h])
const BM_ICON = {
  news: [['#fff', 1, 1, 14, 14], ['#111', 3, 3, 10, 3], ['#888', 3, 8, 10, 1], ['#888', 3, 10, 10, 1], ['#c23', 9, 12, 4, 2]],
  series: [['#555', 2, 1, 1, 14], ['#111', 3, 1, 11, 7], ['#fff', 3, 1, 3, 2], ['#fff', 9, 1, 3, 2], ['#fff', 6, 3, 3, 2], ['#fff', 12, 3, 2, 2], ['#fff', 3, 5, 3, 2], ['#fff', 9, 5, 3, 2]],
  drivers: [['#ffd23a', 1, 1, 14, 14], ['#111', 4, 3, 8, 6], ['#e8e8e8', 5, 5, 6, 2], ['#111', 3, 10, 10, 4]],
  classifieds: [['#7a2cc8', 1, 1, 14, 14], ['#fff', 4, 4, 8, 1], ['#fff', 4, 7, 8, 1], ['#fff', 4, 10, 5, 1]],
  parts: [['#c8141c', 1, 1, 14, 14], ['#f06a12', 1, 8, 14, 7], ['#fff', 5, 3, 6, 10], ['#c8141c', 7, 5, 2, 6]],
  jobs: [['#1f6b8c', 1, 1, 14, 14], ['#fff', 4, 5, 8, 7], ['#1f6b8c', 6, 3, 4, 3], ['#fff', 7, 4, 2, 1]],
  giggo: [['#16c784', 1, 1, 14, 14], ['#fff', 4, 4, 8, 8], ['#16c784', 6, 6, 4, 4], ['#fff', 9, 9, 3, 3]],
  customer: [['#14161a', 1, 1, 14, 14], ['#e8e8e8', 3, 9, 10, 3], ['#e8e8e8', 5, 7, 6, 2], ['#c8141c', 3, 4, 10, 1], ['#14161a', 4, 12, 2, 2], ['#14161a', 10, 12, 2, 2]],
  bank: [['#0d2350', 1, 1, 14, 14], ['#d8b54a', 3, 4, 10, 2], ['#d8b54a', 4, 7, 2, 5], ['#d8b54a', 7, 7, 2, 5], ['#d8b54a', 10, 7, 2, 5], ['#d8b54a', 3, 12, 10, 1]],
};
const standWord = (r) => r < 15 ? 'unknown' : r < 30 ? 'local' : r < 45 ? 'noticed' : r < 60 ? 'respected' : r < 75 ? 'sought after' : 'a big name';
const bmIcon = (id) => `<svg class="hp-ico" viewBox="0 0 16 16" width="24" height="24">${(BM_ICON[id] || []).map(r => `<rect x="${r[1]}" y="${r[2]}" width="${r[3]}" height="${r[4]}" fill="${r[0]}"/>`).join('')}</svg>`;
// ---------- the Team app's look: a navy sidebar, titled panels, big numbers, segmented meters, chips ----------
// (early-2000s team management software: everything at a glance, the detail a select away)
const TX_ICON = {
  overview: [['#4a7bd8', 1, 1, 6, 6], ['#d84a4a', 9, 1, 6, 6], ['#4ad87b', 1, 9, 6, 6], ['#d8c84a', 9, 9, 6, 6]],
  car: [['#c8141c', 1, 7, 14, 4], ['#c8141c', 4, 4, 7, 3], ['#9fd3ff', 6, 5, 4, 2], ['#111', 3, 11, 3, 3], ['#111', 10, 11, 3, 3]],
  dev: [['#bfc4cc', 7, 1, 2, 14], ['#bfc4cc', 1, 7, 14, 2], ['#7d848f', 4, 4, 8, 8], ['#e9edf2', 6, 6, 4, 4], ['#7d848f', 7, 7, 2, 2]],
  tyres: [['#151515', 2, 2, 12, 12], ['#4a4a4a', 5, 5, 6, 6], ['#d0d0d0', 7, 7, 2, 2], ['#e0302a', 2, 7, 2, 2]],
  drivers: [['#c8141c', 3, 2, 10, 10], ['#9fd3ff', 6, 5, 7, 3], ['#f2f2f2', 3, 11, 10, 2], ['#111', 13, 6, 1, 4]],
  staff: [['#e8c9a8', 5, 1, 6, 6], ['#3a2a1a', 5, 1, 6, 2], ['#2a4fa0', 3, 8, 10, 7], ['#f2f2f2', 7, 8, 2, 4]],
  facilities: [['#7a5a3a', 1, 4, 14, 3], ['#c8a070', 2, 7, 12, 8], ['#9fd3ff', 3, 9, 3, 3], ['#9fd3ff', 10, 9, 3, 3], ['#5a3a1a', 7, 10, 2, 5]],
  sponsors: [['#d8b54a', 2, 2, 12, 12], ['#fff4c8', 7, 3, 2, 10], ['#fff4c8', 5, 4, 6, 2], ['#fff4c8', 5, 7, 6, 2], ['#fff4c8', 5, 10, 6, 2]],
  money: [['#1f7a34', 1, 4, 14, 9], ['#2fa64a', 2, 5, 12, 7], ['#d8f5dc', 6, 6, 4, 5], ['#1f7a34', 7, 7, 2, 3], ['#d8b54a', 11, 1, 4, 4]],
  data: [['#101418', 1, 2, 14, 12], ['#3ddc84', 3, 10, 2, 2], ['#3ddc84', 6, 7, 2, 5], ['#3ddc84', 9, 5, 2, 7], ['#3ddc84', 12, 8, 2, 4]],
  // facilities
  base: [['#7a5a3a', 1, 4, 14, 3], ['#c8a070', 2, 7, 12, 8], ['#9fd3ff', 3, 9, 3, 3], ['#9fd3ff', 10, 9, 3, 3], ['#5a3a1a', 7, 10, 2, 5]],
  tools: [['#c8141c', 2, 9, 12, 5], ['#8a0f14', 2, 9, 12, 1], ['#bfc4cc', 6, 2, 2, 7], ['#bfc4cc', 4, 2, 6, 2], ['#e9edf2', 7, 11, 2, 1]],
  dyno: [['#5d636c', 2, 5, 10, 7], ['#8a9099', 4, 3, 2, 2], ['#8a9099', 8, 3, 2, 2], ['#c8141c', 12, 7, 3, 2], ['#2a2d33', 3, 12, 8, 2]],
  fab: [['#7d848f', 1, 11, 14, 3], ['#f06a12', 6, 4, 4, 4], ['#ffd23a', 7, 5, 2, 2], ['#ffd23a', 4, 3, 1, 1], ['#ffd23a', 11, 3, 1, 1], ['#ffd23a', 10, 8, 1, 1]],
  sim: [['#2a2d33', 1, 2, 14, 8], ['#3a8af0', 2, 3, 12, 6], ['#9fd3ff', 3, 4, 4, 2], ['#5d636c', 6, 10, 4, 2], ['#2a2d33', 4, 12, 8, 2]],
  data2: [['#2a2d33', 1, 3, 7, 6], ['#3ddc84', 2, 4, 5, 4], ['#2a2d33', 8, 3, 7, 6], ['#3ddc84', 9, 4, 5, 4], ['#8a9099', 3, 11, 10, 3]],
  truck: [['#e8e8e8', 1, 3, 10, 9], ['#c8141c', 1, 7, 10, 2], ['#2a4fa0', 11, 6, 4, 6], ['#9fd3ff', 12, 7, 2, 2], ['#111', 2, 12, 3, 3], ['#111', 11, 12, 3, 3]],
  tunnel: [['#cfe6ff', 1, 3, 14, 10], ['#ffffff', 2, 5, 12, 1], ['#ffffff', 2, 10, 12, 1], ['#c8141c', 5, 7, 6, 2], ['#7d848f', 7, 9, 2, 3]],
};
const txIcon = (k, px = 16) => `<svg class="tx-ico" viewBox="0 0 16 16" width="${px}" height="${px}">${(TX_ICON[k] || []).map(r => `<rect x="${r[1]}" y="${r[2]}" width="${r[3]}" height="${r[4]}" fill="${r[0]}"/>`).join('')}</svg>`;
// a segmented meter (f: 0..1), coloured by what it means
const seg = (f, cls = '', n = 10) => { const on = Math.round(Math.max(0, Math.min(1, f)) * n); return `<i class="tx-seg ${cls}">${Array.from({ length: n }, (_, i) => `<b${i < on ? ' class="on"' : ''}></b>`).join('')}</i>`; };
const condCls = (c) => c >= 0.7 ? 'good' : c >= 0.45 ? 'warn' : 'bad';
const chip = (t, cls = '') => `<span class="tx-chip ${cls}">${t}</span>`;
const panel = (title, body, meta = '', cls = '') => `<section class="tx-panel ${cls}"><header><b>${title}</b>${meta ? `<span>${meta}</span>` : ''}</header><div class="tx-pb">${body}</div></section>`;
const kpi = (label, value, sub = '', cls = '') => `<div class="tx-kpi ${cls}"><small>${label}</small><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
const pageHead = (icon, title, sub, right = '') => `<div class="tx-head">${txIcon(icon, 28)}<div><h1>${title}</h1><p>${sub}</p></div>${right ? `<div class="tx-hr">${right}</div>` : ''}</div>`;
// a driver's photo: their portrait (js/drivers.js), or a grey silhouette while it's being made
const face = (p, px = 40, cls = '') => { const src = photoOf(p); return src ? `<img class="pc-face ${cls}" src="${src}" width="${px}" height="${px}">`
  : `<svg class="pc-face ${cls}" viewBox="0 0 40 40" width="${px}" height="${px}"><rect width="40" height="40" fill="#cbcbcb"/><circle cx="20" cy="15.5" r="7.5" fill="#a6a6a6"/><path d="M5 41c0-9 6.7-14 15-14s15 5 15 14z" fill="#a6a6a6"/></svg>`; };
const FAC_ICON = { base: 'base', tools: 'tools', dyno: 'dyno', fab: 'fab', sim: 'sim', data: 'data2', truck: 'truck', tunnel: 'tunnel' };
// team colours on Form SV-1
const PALETTE = [0xc8141c, 0xf2f2f2, 0x15181d, 0x1d4fd8, 0xf2c21a, 0x18a058, 0xf06a12, 0x7a2cc8, 0x1fb5c8, 0xe0569a, 0x7a5a3a, 0x9aa2ad];
const ICON_X = 22, ICON_Y = 20, ICON_STEP = 96, ICON_ROWS = 6, ICON_COL = 96;
// little icons, drawn the same way on the desktop and the canvas
const ICONS = {
  mail: [['#f4f1e4', 6, 14, 52, 36], ['#c9c2a6', 6, 14, 52, 4], ['path', '#8a8268', 'M6 14 L32 34 L58 14'], ['#d23a2a', 44, 6, 14, 14]],
  news: [['#ffffff', 10, 6, 44, 52], ['#1a1a1a', 15, 11, 34, 7], ['#9a9a9a', 15, 22, 34, 3], ['#9a9a9a', 15, 28, 34, 3], ['#9a9a9a', 15, 34, 22, 3], ['#c23', 40, 34, 9, 14], ['#9a9a9a', 15, 40, 22, 3], ['#9a9a9a', 15, 46, 22, 3]],
  series: [['#5a5a5a', 12, 6, 4, 54], ['#111', 16, 8, 36, 24], ['#fff', 16, 8, 9, 6], ['#fff', 34, 8, 9, 6], ['#fff', 25, 14, 9, 6], ['#fff', 43, 14, 9, 6], ['#fff', 16, 20, 9, 6], ['#fff', 34, 20, 9, 6], ['#fff', 25, 26, 9, 6], ['#fff', 43, 26, 9, 6]],
  drivers: [['#2a4fa0', 14, 10, 36, 34], ['#e8e8e8', 18, 20, 28, 12], ['#111', 20, 22, 24, 8], ['#2a4fa0', 10, 44, 44, 14]],
  workshop: [['#8a8f96', 8, 30, 48, 8], ['#5e646c', 26, 10, 12, 22], ['#c8141c', 24, 6, 16, 8], ['#3a3d44', 12, 38, 8, 16], ['#3a3d44', 44, 38, 8, 16]],
  tyres: [['#111', 10, 10, 44, 44], ['#3a3a3a', 18, 18, 28, 28], ['#c8c8c8', 26, 26, 12, 12], ['#e0302a', 10, 30, 6, 4], ['#f2d22a', 48, 30, 6, 4]],
  web: [['#1d4fd8', 8, 8, 48, 48], ['#3ddc84', 14, 16, 16, 10], ['#3ddc84', 34, 26, 16, 14], ['#3ddc84', 18, 38, 10, 8], ['#e8e8e8', 30, 6, 4, 52], ['#e8e8e8', 6, 30, 52, 4]],
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
  goto(app, arg) { this.stack = []; this.launch(app); if (app === 'mail' && arg) this.go({ mail: arg }); }

  get w() { return this.src.world(); }
  // does the open app have sections to flip through (LB / RB)?
  get hasTabs() { return this.app === 'team' || this.app === 'series' || (this.app === 'drivers' && !this.page.pid) || (this.app === 'news' && this.page.news === 'home'); }

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
    const tab = TEAM_ALIAS[app]; if (tab) app = 'team';
    this.app = app; this.hist = []; this._lastApp = APPS.find(a => a.id === app)?.site ? 'web' : app;
    const w = this.w;
    this.page = app === 'mail' ? { mail: (w.mail || [])[0]?.id || null }
      : app === 'team' ? { tab: tab || 'overview', file: null }
      : app === 'web' ? { home: 1 }
      : app === 'news' ? { news: 'home', sec: 'all' }
      : app === 'series' ? { s: w.player.series, tab: 'standings' }
      : app === 'bank' ? { bank: 'home' }
      : app === 'classifieds' ? { ad: null }
      : app === 'parts' ? { slot: 'engine' }
      : app === 'jobs' ? { role: 'mechanic' }
      : app === 'registry' ? { reg: 1 }
      : app === 'giggo' ? { gg: 1 }
      : app === 'customer' ? { cc: null }
      : { db: w.player.series, pid: null };
    if (app === 'mail' && this.page.mail) this.markRead(this.page.mail);
    this.curKey = null; this.render(); this.src.sfx?.select?.();
  }
  go(page) { this.hist.push(this.page); this.page = { ...this.page, ...page }; this.curKey = null; if (page.mail) this.markRead(page.mail); this.render(); }
  // back: a page within the app, else wherever you came from (a link from Team or Mail), else the Internet's home page
  // (from a website), else the desktop
  back() {
    const site = APPS.find(a => a.id === this.app)?.site;
    if (this.hist.length && this.app !== 'mail') { this.page = this.hist.pop(); this.curKey = null; this.render(); }
    else if (this.stack && this.stack.length) { const s = this.stack.pop(); this.app = s.app; this.page = s.page; this.hist = s.hist; this.curKey = s.key; this._lastApp = APPS.find(x => x.id === s.app)?.site ? 'web' : s.app; this.render(); }
    else if (site) { this.launch('web'); this.curKey = 'bm-' + this.app; }
    else { this.app = null; this.hist = []; this.curKey = 'app-' + (this._lastApp || 'mail'); this.render(); }
    this.src.sfx?.back?.();
  }
  // follow a link to another app or site (Back comes back here)
  follow(app, page) {
    (this.stack = this.stack || []).push({ app: this.app, page: this.page, hist: this.hist, key: this.curKey });
    if (this.stack.length > 8) this.stack.shift();
    this.launch(app); if (page) { this.page = { ...this.page, ...page }; this.render(); }
  }
  flip(d) {
    if (this.app === 'team') { const t = TEAM_TABS.map(x => x[0]), k = (t.indexOf(this.page.tab) + d + t.length) % t.length; this.page = { tab: t[k], file: null }; this.hist = []; this.armed = null; this.curKey = 'ttab-' + t[k]; this.render(); this.src.sfx?.move?.(); }
    else if (this.app === 'series') { const t = SITE_TABS, k = (t.indexOf(this.page.tab) + d + t.length) % t.length; this.page = { ...this.page, tab: t[k] }; this.hist = []; this.curKey = 'tab-' + t[k]; this.render(); this.src.sfx?.move?.(); }
    else if (this.app === 'news' && this.page.news === 'home') { const t = NEWS_SECS.map(x => x[0]), k = (t.indexOf(this.page.sec || 'all') + d + t.length) % t.length; this.act('nwsec', t[k]); }
    else if (this.app === 'drivers' && !this.page.pid) { const t = DB_TABS, k = (t.indexOf(this.page.db) + d + t.length) % t.length; this.page = { db: t[k], pid: null }; this.curKey = 'db-' + t[k]; this.render(); this.src.sfx?.move?.(); }
  }
  markRead(id) { const m = (this.w.mail || []).find(x => x.id === id); if (m && !m.read) { m.read = true; this.src.changed?.(); } }
  act(a, arg) {
    if (a === 'app') { this.stack = []; this.launch(arg); return; }
    if (a === 'profile') { const p = this.w.people[arg]; this.follow('drivers', { db: p?.series || this.w.player.series, pid: arg }); this.src.sfx?.select?.(); return; }
    if (a === 'dsign' || a === 'dlow' || a === 'mextend') {
      const k = a + ':' + arg; if (this.armed !== k) { this.armed = k; this.curKey = k; this.render(); this.src.sfx?.move?.(); return; }
      this.armed = null; this.src.drivers?.(a, arg); this.curKey = null; this.render(); return;
    }
    if (a === 'logo') { const [what, sid] = arg.split(':'); this.src.logo?.(what, sid); return; }
    if (a === 'mailto') { this.follow('mail', { mail: arg }); this.markRead(arg); this.render(); return; }
    if (a === 'ttab') { this.page = { tab: arg, file: null }; this.hist = []; this.armed = null; this.curKey = 'ttab-' + arg; this.render(); this.src.sfx?.move?.(); return; }
    if (a === 'bm') { this.follow(arg); return; }
    if (a === 'close') { this.back(); return; }
    if (a === 'back') { this.back(); return; }
    if (a === 'mail') { this.page = { mail: arg }; this.markRead(arg); this.curKey = 'mail-' + arg; this.render(); this.src.sfx?.select?.(); return; }
    if (a === 'reply') { const [id, key] = arg.split(':'), m = this.w.mail.find(x => x.id === id); if (m && !m.answer) { this.src.answer(m, key); this.curKey = null; this.render(); } return; }
    if (a === 'article') { this.go({ news: +arg }); this.src.sfx?.select?.(); return; }
    if (a === 'nwsec') { this.page = { news: 'home', sec: arg }; this.hist = []; this.curKey = 'sec-' + arg; this.render(); this.src.sfx?.move?.(); return; }
    if (a === 'site') { this.hist = []; this.page = { s: arg, tab: 'standings' }; this.curKey = null; this.render(); this.src.sfx?.select?.(); return; }
    if (a === 'tab') { this.hist = []; this.page = { ...this.page, tab: arg }; this.curKey = 'tab-' + arg; this.render(); this.src.sfx?.select?.(); return; }
    if (a === 'db') { this.page = { db: arg, pid: null }; this.hist = []; this.curKey = 'db-' + arg; this.render(); this.src.sfx?.select?.(); return; }
    if (a === 'driver') { this.go({ pid: arg }); this.src.sfx?.select?.(); return; }
    if (a === 'open') { if (this.app === 'team' && TEAM_ALIAS[arg]) { this.act('ttab', TEAM_ALIAS[arg]); return; } this.follow(arg); return; }
    if (a === 'jobs') { this.follow('jobs', { role: arg }); return; }
    if (a === 'take') { if (this.armed !== 'take:' + arg) { this.armed = 'take:' + arg; this.curKey = 'take:' + arg; this.render(); this.src.sfx?.move?.(); return; } this.armed = null; this.src.gig?.(arg); return; }
    if (a === 'role') { this.page = { role: arg }; this.curKey = 'role-' + arg; this.render(); this.src.sfx?.move?.(); return; }
    if (a === 'hire') { if (this.hireArmed !== arg) { this.hireArmed = arg; this.curKey = 'hire-' + arg; this.render(); this.src.sfx?.move?.(); return; } this.hireArmed = null; this.src.staff?.('hire', arg); this.back(); return; }
    if (a === 'fire') { if (this.fireArmed !== arg) { this.fireArmed = arg; this.curKey = 'fire-' + arg; this.render(); this.src.sfx?.move?.(); return; } this.fireArmed = null; this.src.staff?.('fire', arg); this.curKey = null; this.render(); return; }
    if (a === 'backpay') { this.src.staff?.('backpay', arg); this.curKey = 'bp-' + arg; this.render(); return; }
    if (a === 'slot') { this.page = { ...this.page, slot: arg }; this.curKey = 'slot-' + arg; this.armed = null; this.render(); this.src.sfx?.move?.(); return; }
    if (a === 'cltab') { this.page = { ad: null, tab: arg }; this.hist = []; this.curKey = 'cltab-' + arg; this.armed = null; this.render(); this.src.sfx?.move?.(); return; }
    // the car: rebuild / new / remove an upgrade / buy and fit one (select twice for anything that costs)
    if (['rebuild', 'newpart', 'unfit', 'fitpart'].includes(a)) {
      const k = a + ':' + arg;
      if (this.armed !== k) { this.armed = k; this.curKey = k; this.render(); this.src.sfx?.move?.(); return; }
      this.armed = null; this.src.car?.(a, arg); this.curKey = null;
      if (a === 'fitpart') { if (this.stack && this.stack.length) this.back(); else this.launch('workshop'); return; }
      this.render(); return;
    }
    if (a === 'placeorder') { const n = WC.COMPOUNDS.reduce((x, c) => x + (this.order[c] || 0), 0); if (!n) return; if (!this.orderArmed) { this.orderArmed = true; this.curKey = 'placeorder'; this.render(); this.src.sfx?.move?.(); return; } this.orderArmed = false; this.src.order?.({ ...this.order }); this._order = null; this.curKey = null; this.render(); return; }
    if (a === 'file2') { this.go({ file: arg }); this.src.sfx?.select?.(); return; }
    if (a === 'cyc') { const [f, d] = arg.split(':'); this.cycle(f, +d); return; }
    if (a === 'type') { this.type(arg); return; }
    if (a === 'file') { if (!this.formOk()) { this.src.sfx?.back?.(); return; } this.src.register?.({ ...this.form, name: this.form.name.trim(), team: this.form.team.trim(), ex: this.form.ex.trim() }); this.curKey = null; this.render(); return; }
    // facilities and projects: select twice
    if (a === 'parea') { this.page = { ...this.page, area: arg }; this.armed = null; this.curKey = 'parea-' + arg; this.render(); this.src.sfx?.move?.(); return; }
    if (a === 'build' || a === 'proj' || a === 'sellfac') { const k = a + ':' + arg; if (this.armed !== k) { this.armed = k; this.curKey = k; this.render(); this.src.sfx?.move?.(); return; } this.armed = null; this.src.team?.(a, arg); this.curKey = k; this.render(); return; }
    if (a === 'cc') { this.go({ cc: arg }); this.armed = null; this.src.sfx?.select?.(); return; }
    if (a === 'getcar') { if (this.armed !== 'getcar:' + arg) { this.armed = 'getcar:' + arg; this.curKey = 'getcar:' + arg; this.render(); this.src.sfx?.move?.(); return; } this.armed = null; const [how, id] = arg.split('|'); this.src.getcar?.(how, id); this.page = { cc: null }; this.hist = []; this.curKey = null; this.render(); return; }
    if (a === 'ad') { this.go({ ad: arg }); this.buyArmed = false; this.src.sfx?.select?.(); return; }
    if (a === 'buy') { if (!this.buyArmed) { this.buyArmed = true; this.curKey = 'buy'; this.render(); this.src.sfx?.move?.(); return; } this.buyArmed = false; this.src.buy?.(arg); this.page = { ad: null }; this.hist = []; this.curKey = null; this.render(); return; }
    // selling the annuity: select twice
    if (a === 'loan') { if (!this.loanArmed) { this.loanArmed = true; this.curKey = 'loan'; this.render(); this.src.sfx?.move?.(); return; } this.loanArmed = false; this.src.loan?.(); this.curKey = 'loan'; this.render(); return; }
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
    task.innerHTML = `<span class="pc-start">SV</span>${app ? `<span class="pc-tb on">${app.site ? 'Internet' : app.label}</span>` : ''}<span class="pc-clock">${esc(this.clock())}</span>`;
    win.hidden = !app;
    if (app) {
      // re-drawing the same page (a field changed, a list item picked) keeps its panes scrolled where they were
      const where = this.app === 'mail' ? 'mail' : this.app + ':' + this.url(), keepScroll = where === this.lastWhere ? [...win.querySelectorAll('*')].map(e => e.scrollTop) : null;
      this.lastWhere = where;
      const body = this.app === 'mail' ? this.mailApp() : this.app === 'team' ? this.teamFrame() : this.browser();
      const plain = ['mail', 'team'].includes(this.app);
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
      <b>${esc(m.from)}</b><span>${esc(m.subj)}</span><small>${esc(m.when || '')} ${m.y}${m.choices && !m.answer ? ' <em class="pc-ask">Needs an answer</em>' : ''}</small></div>`).join('') || '<p class="pc-empty">No mail.</p>';
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
    if (this.app === 'giggo') return 'driver.giggo.sv/jobs';
    if (this.app === 'customer') return `www.${WC.siteOf(WC.carSeries(this.w))}/homologated` + (p.cc ? '/' + p.cc : '');
    if (this.app === 'web') return 'home.svnet.sv';
    if (this.app === 'tyres') return 'trade.vtr.sv/orders';
    if (this.app === 'parts') return `www.speedpartsdirect.sv/${p.slot}`;
    return 'www.driverdb.sv' + (p.pid ? `/driver/${p.pid}` : `/${p.db}`);
  }
  browser() {
    const site = { web: () => this.homePage(), parts: () => this.partsSite(), jobs: () => this.jobsSite(), news: () => this.newsSite(), series: () => this.seriesSite(), bank: () => this.bankSite(), classifieds: () => this.classSite(), registry: () => this.regSite(), giggo: () => this.gigSite(), customer: () => this.customerSite() }[this.app]?.() ?? this.driverSite();
    return `<div class="pc-bar"><button class="pc-btn sm" data-nav data-act="back" data-key="bback">&larr; Back</button><div class="pc-url">http://${esc(this.url())}</div></div><div class="pc-page">${site}</div>`;
  }

  // the Paddock Wire: headlines, and a story page (race reports carry the classification)
  // The Paddock Wire: sections (all / race reports / paddock / opinion / other series), a front page, articles
  newsSite() {
    const w = this.w, items = w.news || [], sec = this.page.sec || 'all';
    const kindOf = (n) => n.kind || (n.report ? 'brief' : 'paddock'), paras = (n) => (Array.isArray(n.body) ? n.body : [n.body]).filter(Boolean);
    const inSec = (n) => sec === 'all' || kindOf(n) === sec || (sec === 'brief' && n.s && n.s !== w.player.series);
    const mast = `<div class="nw-mast"><b>THE PADDOCK WIRE</b><small>Motorsport news from San Velocita &middot; ${w.year}</small></div>
      <div class="nw-nav">${NEWS_SECS.map(([k, n]) => `<span class="nw-sec${k === sec ? ' on' : ''}" data-nav data-act="nwsec" data-arg="${k}" data-key="sec-${k}"${k === sec && this.page.news === 'home' ? ' data-first' : ''}>${n}</span>`).join('')}</div>`;
    const kick = (n) => `<span class="nw-kick">${NEWS_KIND[kindOf(n)] || 'News'}</span>`;
    if (this.page.news !== 'home') {
      const n = items[this.page.news]; if (!n) return mast;
      const more = items.map((x, k) => [x, k]).filter(([x, k]) => k !== this.page.news && kindOf(x) !== 'brief').slice(0, 4)
        .map(([x, k]) => `<div class="nw-row" data-nav data-act="article" data-arg="${k}" data-key="art-${k}">${kick(x)}<a>${esc(cap(x.head))}</a></div>`).join('');
      const body = paras(n).map(p => /^\d+\. /.test(p) ? `<p class="nw-rank">${esc(p)}</p>` : `<p>${esc(p)}</p>`).join('');
      return mast + `<div class="nw-story" data-nav data-scroll data-key="story" data-first>${kick(n)}<h1>${esc(cap(n.head))}</h1><div class="nw-by">By ${esc(n.by || 'Wire staff')} &middot; ${esc(n.when || '')} ${n.y}</div>${body}${this.reportTable(n.report, n.y)}</div>`
        + (more ? `<div class="nw-more"><b>More from the Wire</b>${more}</div>` : '');
    }
    const list = items.map((n, k) => [n, k]).filter(([n]) => inSec(n));
    if (!list.length) return mast + '<p class="pc-empty">Nothing in this section yet.</p>';
    const [lead, lk] = list[0];
    const rest = list.slice(1, 40).map(([n, k]) => `<div class="nw-row" data-nav data-act="article" data-arg="${k}" data-key="art-${k}">${kick(n)}<a>${esc(cap(n.head))}</a><small>${esc(n.when || '')} ${n.y}${n.by && n.by !== 'Wire staff' ? ` &middot; ${esc(n.by)}` : ''}</small></div>`).join('');
    return mast + `<div class="nw-lead" data-nav data-act="article" data-arg="${lk}" data-key="art-${lk}">${kick(lead)}<h1>${esc(cap(lead.head))}</h1><p>${esc(paras(lead)[0] || '')}</p><small>${esc(lead.when || '')} ${lead.y}${lead.by ? ` &middot; By ${esc(lead.by)}` : ''}</small></div>
      <div class="nw-ad">${esc(NEWS_ADS[(w.round + w.year) % NEWS_ADS.length])}</div><div class="nw-list">${rest}</div>`;
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
    else if (field === 'mpay') { const m = WC.mateOf(this.w); if (m) { const k = WC.PAY_MODES.map(x => x[0]); this.src.drivers?.('pay', wrap(k, k.indexOf(m.pay) + d)); } }
    else if (field.startsWith('q-')) { const c = field.slice(2), o = this.order; o[c] = Math.max(0, Math.min(8, (o[c] || 0) + d)); this.orderArmed = false; }
    else if (field.startsWith('pay-')) { const id = field.slice(4), x = (this.w.staff || []).find(s => s.id === id); if (x) { const k = WC.PAY_MODES.map(m => m[0]); this.src.staff?.('pay', id, wrap(k, k.indexOf(x.pay) + d)); } }
    else if (field === 'c0' || field === 'c1') { const i = +field[1]; f.colors[i] = wrap(PALETTE, Math.max(0, PALETTE.indexOf(f.colors[i])) + d); }
    this.curKey = ['home', 'background', 'years', 'c0', 'c1'].includes(field) ? 'f-' + field : field; // (the form's fields are keyed f-…; the rest by their own name)
    this.render(); this.src.sfx?.move?.();
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

  // Velocita Tyre & Rubber: your stock, the next round's forecast, an order form
  get order() { return this._order || (this._order = { soft: 0, medium: 0, hard: 0, wet: 0 }); }
  tyreTab() {
    const w = this.w, st = WC.stockOf(w), used = WC.usedOf(w), price = WC.tyreCost(w), o = this.order;
    const head = `<div class="tm-head"><b>Tyres</b><small>Ordered from Velocita Tyre &amp; Rubber &middot; ${WC.money$(price)} a set</small></div>`;
    if (!w.founding?.reg) return head + '<p class="pc-empty">Register the team first.</p>';
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

  // ---------- Team: running the team (a sidebar of sections) ----------
  teamFrame() {
    const w = this.w, tab = this.page.tab || 'overview', t = w.teams[w.player.team], S = WC.seriesById(w.player.series), m = w.money, badge = this.navBadges();
    const nav = TEAM_TABS.map(([k, n]) => `<div class="tx-nl${k === tab ? ' on' : ''}" data-nav data-act="ttab" data-arg="${k}" data-key="ttab-${k}">${txIcon(k)}<span>${n}</span>${badge[k] ? `<em class="${badge[k][1]}">${badge[k][0]}</em>` : ''}</div>`).join('');
    const body = tab === 'car' ? this.workshopApp() : tab === 'tyres' ? `<div class="tm tx-page">${this.tyreTab()}</div>` : tab === 'staff' ? this.teamApp() : tab === 'sponsors' ? this.sponsorTab() : tab === 'drivers' ? this.driversTab() : tab === 'data' ? this.telApp() : tab === 'facilities' ? this.facTab() : tab === 'dev' ? this.devTab() : tab === 'money' ? this.moneyTab() : this.overview();
    return `<div class="tw tx"><nav class="tx-nav"><div class="tx-brand"><i style="background:${hex(t.main)};border-color:${hex(t.accent)}"></i><b>${esc(t.name)}</b><small>${esc(S.name)} &middot; ${w.year}</small></div>${nav}
      <div class="tx-nfoot"><small>Balance</small><b class="${m && m.balance < 0 ? 'neg' : ''}">${m && m.choice ? WC.money$(m.balance) : '&mdash;'}</b></div></nav>${body}</div>`;
  }
  // the little flags on the sidebar: what needs you
  navBadges() {
    const w = this.w, out = {}; if (!w.founding?.reg) return out;
    const P = WC.carParts(w); if (P && WC.PART_KEYS.some(k => P[k].cond < 0.5)) out.car = ['!', 'bad'];
    if (w.car && WC.needsCar(w)) out.car = ['!', 'bad'];
    const live = (w.projects || []).filter(x => !x.done).length; if (live) out.dev = [live, ''];
    if (!w.over && w.car) { const need = WC.tyreNeeds(w), st = WC.stockOf(w); if (WC.COMPOUNDS.some(c => st[c] < need[c])) out.tyres = ['!', 'warn']; }
    const vac = Object.keys(WC.ROLES).filter(r => !WC.staffOf(w, r)).length; if (vac) out.staff = [vac, 'dim'];
    if ((w.staff || []).some(x => x.owed > 0)) out.staff = ['!', 'bad'];
    const off = w.player.offer; if (off && off.answer === 'move' && WC.seriesMissing(WC.myTeam(w), off.to).length) out.facilities = ['!', 'bad'];
    const offers = (w.mail || []).filter(x => x.sponsorOffer && !x.answer).length; if (offers) out.sponsors = [offers, 'warn'];
    return out;
  }
  // the whole team at a glance
  overview() {
    const w = this.w, m = w.money;
    if (!w.founding?.reg) return `<div class="tm tx-page">${pageHead('overview', 'Your team', 'Register the team first: Form SV-1 is in your email.')}</div>`;
    const S = w.series[w.player.series], R = !w.over ? S.cal[w.round] : null, B = WC.briefing(w), P = WC.carParts(w), t = WC.myTeam(w), sv = WC.savingFor(w);
    const pos = B.goals.find(g => g.label === 'Championship'), diff = { easy: 'Rookie', medium: 'Pro', hard: 'Legend', alien: 'Alien', phantom: 'Phantom', godlike: 'Godlike' }[w.opts.difficulty] || '';
    const link = (tab, label) => `<a class="tx-link" data-nav data-act="ttab" data-arg="${tab}" data-key="ovl-${tab}">${label} &rarr;</a>`;
    const ucf = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const fz = WC.finances(w), lasts = fz ? (fz.net >= 0 ? 'making money' : `lasts about ${Math.max(0, Math.floor(fz.runway))} round${Math.floor(fz.runway) === 1 ? '' : 's'}`) : '';
    const kpis = `<div class="tx-kpis">${kpi('Balance', m && m.choice ? WC.money$(m.balance) : '&mdash;', lasts, (m && m.balance < 0) || (fz && fz.net < 0 && fz.runway < fz.left) ? 'bad' : '')}
      ${kpi('Next race', R ? `Round ${w.round + 1}` : 'Season over', R ? `${esc(R.name)} &middot; ${esc(R.weather)}` : `${w.year} is done`)}
      ${kpi('Championship', pos ? pos.value : '&mdash;', `${esc(WC.seriesById(w.player.series).name)} &middot; ${diff}`)}
      ${sv && m ? kpi('Saving for', esc(ucf(sv.name)), m.balance >= sv.cost ? `${WC.money$(sv.cost)} &middot; <span class="pos">affordable</span>` : `${seg(m.balance / sv.cost, 'blue', 8)}<span>${WC.money$(sv.cost)}</span>`, 'long') : ''}</div>`;
    const watch = B.watch.slice(0, 6).map(x => `<div class="tx-li ${x.bad ? 'bad' : 'warn'}"><i></i>${esc(x.text)}</div>`).join('') || '<div class="tx-li good"><i></i>Nothing urgent.</div>';
    const targets = B.targets.map(x => `<div class="tx-tg"><div><small>${esc(x.who)}</small><span>${esc(x.text)}</span></div>${x.amt ? `<b class="pos">+${WC.money$(x.amt)}</b>` : ''}</div>`).join('') || '<p class="tx-dim">No targets this weekend.</p>';
    const worst = P ? WC.PART_KEYS.slice().sort((a, b) => P[a].cond - P[b].cond)[0] : null, risk = P ? WC.failRisk(w) : 0;
    const live = (w.projects || []).filter(x => !x.done);
    const car = P ? `<div class="tx-mini"><span>${esc(w.car.name)}</span>${chip(`Failure risk: ${risk < 0.03 ? 'low' : risk < 0.08 ? 'some' : risk < 0.15 ? 'high' : 'very high'}`, risk < 0.03 ? 'good' : risk < 0.08 ? 'warn' : 'bad')}</div>
      <div class="tx-mrow st"><small>Most worn: ${WC.PARTS[worst].name.toLowerCase()}</small>${seg(P[worst].cond, condCls(P[worst].cond))}<b>${Math.round(P[worst].cond * 100)}%</b></div>
      ${live.length ? live.map(x => `<div class="tx-mrow st"><small>${esc(x.name)}${x.shop ? ' (at a shop)' : ''}</small>${seg((x.prog || 0) / x.days, 'good')}<b>${Math.round((x.prog || 0) / x.days * 100)}%</b></div>`).join('') : '<p class="tx-dim">No development under way.</p>'}` : '<p class="tx-dim">No car yet.</p>';
    const built = WC.FAC_KEYS.filter(k => k !== 'base' && WC.facLevel(t, k)).map(k => chip(esc(WC.facName(t, k)))).join(' ');
    const team = `<div class="tx-mini"><span>${esc(WC.facName(t, 'base'))}</span>${chip(`${WC.money$(WC.facUpkeep(t))} a round`)}</div><div class="tx-chips">${built || '<span class="tx-dim">No facilities yet.</span>'}</div>
      ${Object.keys(WC.ROLES).map(r => { const x = WC.staffOf(w, r); return `<div class="tx-mrow"><small>${WC.ROLES[r].name}</small><span class="${x ? '' : 'tx-dim'}">${x ? `${esc(x.first)} ${esc(x.last)} ${'&#9733;'.repeat(x.skill)}` : 'Vacant'}</span></div>`; }).join('')}`;
    const deals = WC.dealsOf(w);
    const spons = deals.length ? deals.map(d => `<div class="tx-mrow"><small>${esc(WC.sponsorName(d.sid))}</small><span>${WC.money$(d.fee)} a round</span></div>`).join('') : '<p class="tx-dim">No sponsors yet.</p>';
    return `<div class="tm tx-page">${pageHead('overview', esc(w.teams[w.player.team].name), `${esc(WC.seriesById(w.player.series).name)} &middot; ${w.year} season &middot; ${esc(WC.facName(t, 'base').toLowerCase())}`)}
      ${kpis}
      <div class="tx-grid">${panel('Needs attention', watch)}${panel('This weekend', targets, R ? esc(R.name) : '')}
        ${panel('Car and development', car, link('car', 'Car'))}${panel('Team and base', team, link('facilities', 'Facilities'))}</div>
      ${panel('Sponsors', spons, link('sponsors', 'Sponsors'))}</div>`;
  }
  // ---------- Finances: are you going to run out, and what to do about it ----------
  moneyTab() {
    const w = this.w, f = WC.finances(w);
    if (!f) return `<div class="tm tx-page">${pageHead('money', 'Finances', 'Claim your lottery winnings first: the email is in your inbox.')}</div>`;
    const $ = WC.money$, bal = w.money.balance, R = (n) => `${Math.max(0, Math.floor(n))} round${Math.floor(n) === 1 ? '' : 's'}`;
    const verdict = f.net >= 0 ? ['good', 'Making money', `+${$(f.net)} a round, as things stand`]
      : f.runway < 1 ? ['bad', 'Out of money', 'This weekend is more than you have']
      : f.runway < f.left ? ['bad', `Broke in about ${R(f.runway)}`, `before the season ends (${R(f.left)} left)`]
      : f.runway < f.left + 6 ? ['warn', `Lasts about ${R(f.runway)}`, 'into next season']
      : ['good', `Lasts about ${R(f.runway)}`, 'at this rate'];
    // the projection: the balance after each round to the season's end, then the prize funds
    const pts = f.proj.concat(f.left ? [f.end] : []), lo = Math.min(0, ...pts), hi = Math.max(1, ...pts), W = 640, H = 130, pad = 18, bw = Math.min(70, (W - 40) / pts.length - 10);
    const y = (v) => pad + (hi - v) / (hi - lo) * (H - pad * 2), x0 = (i) => 30 + i * ((W - 40) / pts.length);
    const bars = pts.map((v, i) => { const end = f.left && i === pts.length - 1, top = Math.min(y(v), y(0)), h = Math.max(2, Math.abs(y(v) - y(0)));
      return `<rect x="${x0(i)}" y="${top}" width="${bw}" height="${h}" fill="${v < 0 ? '#c8141c' : end ? '#2f59c0' : '#2c9a43'}"/><text x="${x0(i) + bw / 2}" y="${v < 0 ? top + h + 11 : top - 4}" text-anchor="middle" font-size="10" fill="#333">${v < 0 ? '-' : ''}$${Math.round(Math.abs(v) / 1000)}k</text>
        <text x="${x0(i) + bw / 2}" y="${H - 2}" text-anchor="middle" font-size="10" fill="#777">${i === 0 ? 'Now' : end ? 'Prize funds' : `After R${w.round + i}`}</text>`; }).join('');
    const chart = `<svg class="tx-chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}"><line x1="22" x2="${W - 6}" y1="${y(0)}" y2="${y(0)}" stroke="#999" stroke-dasharray="3 3"/>${bars}</svg>`;
    const list = (rows, total, cls) => { const max = Math.max(1, ...rows.map(r => r[1]));
      return rows.sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="tx-frow"><span>${esc(k)}</span><i class="tx-fbar ${cls}"><b style="width:${Math.round(v / max * 100)}%"></b></i><b>${$(v)}</b></div>`).join('') + `<div class="tx-frow tot"><span>Total</span><i></i><b>${$(total)}</b></div>`; };
    return `<div class="tm tx-page">${pageHead('money', 'Finances', `${w.year} season &middot; ${f.left} round${f.left === 1 ? '' : 's'} left`, chip(verdict[1], verdict[0]))}
      <div class="tx-kpis">${kpi('Balance', $(bal), w.money.balance < 0 ? 'overdrawn: 1.5% a round' : 'in the bank', bal < 0 ? 'bad' : '')}${kpi('Each round', `${f.net >= 0 ? '+' : '-'}${$(Math.abs(f.net))}`, 'income less costs', f.net < 0 ? 'bad' : '')}
        ${kpi('Money lasts', f.net >= 0 ? 'No end in sight' : R(f.runway), verdict[2], verdict[0] === 'bad' ? 'bad' : '')}${kpi('Season ends with', $(f.end), f.left ? `with ${$(f.fundEnd)} prize funds` : 'season over', f.end < 0 ? 'bad' : '')}</div>
      ${panel('The season, as things stand', chart, 'the balance after each round')}
      <div class="tx-grid">${panel('Each round costs', list(f.costs, f.out, 'out'))}${panel('Each round brings in', list(f.income, f.inn, 'in'))}</div>
      ${panel('What finishing pays', this.payouts(f), 'each car, each race')}
      ${f.levers.length ? panel('What you could change', f.levers.map(t => `<div class="tx-li warn"><i></i>${esc(t)}</div>`).join('')) : ''}
      <p class="tx-note">Estimates: what your setup costs now (staff on their pay settings, premises, lease, loan), wear on the car, prize money at your average finishing positions, and what your weeks have averaged. Projects, upgrades and new facilities aren't counted: they're your choice.</p>
      <div class="tx-actions"><button class="pc-btn" data-nav data-act="open" data-arg="bank" data-key="tobank">Bank statement &rarr;</button></div></div>`;
  }
  // the prize money by place, where your cars are, where you'd break even; and the season's prize funds
  payouts(f) {
    const $ = WC.money$, top = f.prize[0] || 1, mate = f.matePos != null;
    const rows = f.prize.map((v, i) => { const p = i + 1, tags = (p === f.myPos ? chip('You', 'blue') : '') + (mate && p === f.matePos ? chip('Car 2', 'blue') : '');
      return `<div class="tx-prow${f.even && p <= (f.even.mate || f.even.you) ? ' even' : ''}"><span>P${p}</span><i class="tx-fbar in"><b style="width:${Math.round(v / top * 100)}%"></b></i><b>${$(v)}</b><em>${tags}</em></div>`; }).join('');
    const say = f.need <= 0 ? `You're covering your costs before prize money.`
      : f.even ? `<b>To break even</b>, your cars need to finish about <b>P${f.even.you}${mate ? ` and P${f.even.mate}` : ''}</b>: ${$(f.even.pays)} a round in prize money, and about ${$(f.even.fund)} a round from the season's prize funds at those places.`
      : `<b>Even a one-two won't cover your costs</b> this season (${$(f.need)} a round short before prize money). Bring in sponsors, work the week, or cut costs.`;
    const fund = (arr, label) => `<div class="tx-fund"><small>${label}</small>${arr.slice(0, 6).map((v, i) => `<div><span>P${i + 1}</span><b>${$(v)}</b></div>`).join('')}</div>`;
    return `<p class="tx-even">${say}</p><div class="tx-pay"><div>${rows}<p class="tx-dim">Green: places that would break you even.</p></div><div class="tx-funds">${fund(f.funds.drivers, 'Season end: you')}${fund(f.funds.teams, 'Season end: team')}</div></div>`;
  }
  // ---------- the car: each part's condition, what's fitted, rebuilds ----------
  workshopApp() {
    const w = this.w, P = WC.carParts(w);
    if (!P) return `<div class="tm tx-page">${pageHead('car', 'No car yet', 'Danny sent some listings: they\'re on SVList.')}<div class="tx-actions"><button class="pc-btn pri" data-nav data-act="open" data-arg="classifieds" data-key="tocl" data-first>SVList &rarr;</button></div></div>`;
    const odds = WC.failOdds(w), risk = WC.failRisk(w), lvl = WC.dataLevel(w), m = WC.staffOf(w, 'mechanic'), eng = WC.staffOf(w, 'engineer');
    const riskTxt = risk < 0.03 ? 'low' : risk < 0.08 ? 'some' : risk < 0.15 ? 'high' : 'very high', riskCls = risk < 0.03 ? 'good' : risk < 0.08 ? 'warn' : 'bad';
    const btn = (a, k, label) => `<button class="pc-btn sm" data-nav data-act="${a}" data-arg="${k}" data-key="${a}:${k}">${this.armed === a + ':' + k ? 'Sure? Select again' : label}</button>`;
    const rows = WC.PART_KEYS.map(k => {
      const p = P[k], c = p.cond, f = p.fit, odd = odds[k], prog = w.car.lease && (k === 'engine' || k === 'gearbox');
      const fit = f ? `<div class="tx-fit">${chip('Fitted', 'blue')} <b>${esc(f.name)}</b>${f.used ? ' (used)' : ''} &middot; <i>"${esc(f.feel)}"</i>${f.measured ? ` &middot; <span class="ws-meas">${esc(f.measured.by)} measures ${f.measured.val >= 0 ? '+' : ''}${(f.measured.val * 100).toFixed(1)}% ${f.measured.stat}${f.measured.lvl < 2 ? ' (roughly)' : ''}</span>` : ''}</div>` : '';
      return `<div class="tx-part"><b>${WC.PARTS[k].name}</b>${seg(c, condCls(c))}<span class="tx-pct ${condCls(c)}">${Math.round(c * 100)}%</span><small>${odd != null && lvl === 2 ? `${(odd * 100).toFixed(1)}% to fail` : ''}</small>
        <div class="tm-acts">${prog ? `<small class="tx-dim">Rebuilt by ${esc(w.car.lease.prog)}</small>` : `${btn('rebuild', k, `Rebuild ${WC.money$(WC.rebuildCost(w, k))}`)}${btn('newpart', k, `New ${WC.money$(WC.newPartCost(w, k))}`)}`}${f ? btn('unfit', k, 'Remove') : ''}</div>${fit}</div>`;
    }).join('');
    return `<div class="tm tx-page">${pageHead('car', `${WC.carClsOf(w) === 'street' ? w.car.year + ' ' : ''}${esc(w.car.name)}`, m ? `Chief mechanic: ${esc(m.first)} ${esc(m.last)}` : 'No chief mechanic: rebuilds go to a shop (dearer, and no better than OK)', chip(`Failure risk: ${riskTxt}${lvl === 2 ? ` (${(risk * 100).toFixed(1)}%)` : ''}`, riskCls))}
      ${this.carRules()}
      ${panel('Condition', rows, lvl === 2 ? `${esc(eng.first)}'s numbers` : 'Worn parts are slower, and can fail')}
      <div class="tx-actions"><button class="pc-btn" data-nav data-act="ttab" data-arg="dev" data-key="todev">Development &rarr;</button><button class="pc-btn" data-nav data-act="open" data-arg="parts" data-key="toparts">Speed Parts Direct &rarr;</button><button class="pc-btn" data-nav data-act="open" data-arg="classifieds" data-key="tocl">Used parts on SVList &rarr;</button></div>
      <p class="tx-note">Upgrades go on a part: you know how they feel, and what they really do once a data engineer has looked at the data.</p></div>`;
  }
  // GT and up: the lease, balance of performance, success ballast (as chips)
  carRules() {
    const w = this.w, c = w.car, bits = [];
    if (WC.needsCar(w)) bits.push(chip(`Not eligible for the ${esc(WC.seriesById(w.player.series).name)}`, 'bad'));
    if (c.lease) bits.push(chip(`Leased from ${esc(c.lease.prog)}: ${WC.money$(c.lease.perRound)} a round`, 'blue'));
    if (WC.seriesById(w.player.series).ballast && !WC.needsCar(w)) {
      const kg = Math.round((1 - WC.bopOf(w)) / 0.0006 / 5) * 5, bl = WC.ballastOf(w);
      bits.push(chip(`Balance of performance: ${kg > 0 ? `${kg} kg added` : kg < 0 ? `restrictor opened (about ${-kg} kg)` : 'unchanged'}`));
      bits.push(chip(`Success ballast: ${bl ? `${bl} kg` : 'none'}`, bl ? 'warn' : ''));
    }
    return bits.length ? `<div class="tx-chips tx-rules">${bits.join('')}${WC.needsCar(w) ? ` <button class="pc-btn sm pri" data-nav data-act="open" data-arg="customer" data-key="tocust">Customer Racing &rarr;</button>` : ''}</div>` : '';
  }
  // ---------- Development: the car's spec, the bench, the projects ----------
  devTab() {
    const w = this.w, t = WC.myTeam(w);
    if (!w.car || WC.needsCar(w)) return `<div class="tm tx-page">${pageHead('dev', 'Development', 'No car to work on.')}</div>`;
    const d = WC.devOf(w), lvl = WC.dataLevel(w), m = WC.staffOf(w, 'mechanic'), dyno = WC.facLevel(t, 'dyno'), ser = WC.seriesById(w.player.series), CAP = WC.devCapOf(w);
    const word = (v, cap) => v <= 0.0005 ? 'standard' : v < cap * 0.25 ? 'some work' : v < cap * 0.55 ? 'developed' : 'near the limit';
    const spec = [['power', 'Engine', dyno || lvl], ['grip', 'Chassis', lvl], ['downforce', 'Aero', lvl], ['brake', 'Brakes', lvl], ['rel', 'Reliability', lvl]].map(([k, n, exact]) =>
      `<div class="tx-spec"><b>${n}</b>${seg((d[k] || 0) / CAP[k], 'blue', 8)}<span>${exact ? (k === 'rel' ? `${Math.round((d[k] || 0) * 100)}% fewer faults` : `+${((d[k] || 0) * 100).toFixed(1)}%`) : word(d[k] || 0, CAP[k])}</span></div>`).join('');
    const rate = WC.mechRate(w), max = WC.maxProjects(w);
    const live = (w.projects || []).filter(x => !x.done), mine = live.filter(x => !x.shop), shop = live.filter(x => x.shop);
    const card = (x) => { const left = x.days - (x.prog || 0), days = rate ? Math.ceil(left / (rate / WC.WEEK_DAYS)) : 0;
      return `<div class="tx-bench${!x.shop && !rate ? ' idle' : ''}"><b>${esc(x.name)}</b>${seg((x.prog || 0) / x.days, 'good')}<small>${x.shop ? 'At Precision Race Prep &middot; back after the next race' : `${(x.prog || 0).toFixed(1)} of ${x.days} days of work done`}</small>
        ${x.shop ? '' : rate ? `<small>${esc(m.first)}: ${(rate / WC.WEEK_DAYS).toFixed(1)} a day, done in about ${days} day${days === 1 ? '' : 's'}. A Car work day of yours adds ${(1 + WC.facLevel(t, 'tools') * 0.25).toFixed(2)}.</small>` : `<small class="neg">Nobody's working on it. Pick Car work in the day picker (a day of yours is ${(1 + WC.facLevel(t, 'tools') * 0.25).toFixed(2)} days of work), hire a chief mechanic, or send it to a shop.</small>`}</div>`; };
    const bench = mine.map(card).join('') + Array.from({ length: Math.max(0, max - mine.length) }, () => `<div class="tx-bench empty"><b>Empty bench</b><small>Pick a project below</small></div>`).join('') + shop.map(card).join('');
    const AREAS = ['engine', 'chassis', 'aero', 'brakes', 'reliability'], list = WC.projectList(w), area = AREAS.includes(this.page.area) ? this.page.area : 'engine';
    const tabs = AREAS.map(a => `<span class="tx-st${a === area ? ' on' : ''}" data-nav data-act="parea" data-arg="${a}" data-key="parea-${a}">${a[0].toUpperCase() + a.slice(1)}<em>${list.filter(P => P.area === a && !P.locked).length}</em></span>`).join('');
    const btn = (how, P, label, cls = '') => { const key = 'proj:' + how + '|' + P.key; return `<button class="pc-btn sm ${cls}" data-nav data-act="proj" data-arg="${how}|${P.key}" data-key="${key}">${this.armed === key ? 'Sure? Select again' : label}</button>`; };
    const gainTxt = (P) => P.stat === 'rel' ? 'Fewer failures' : `About +${(P.gain * 100).toFixed(1)}% ${P.stat === 'downforce' ? 'downforce' : P.stat === 'brake' ? 'braking' : P.stat}`;
    const projs = list.filter(P => P.area === area).map(P => { const c = P.odds.chance;
      return `<div class="tx-proj${P.locked && P.locked !== 'Under way' ? ' locked' : ''}"><div class="tx-pn"><b>${esc(P.name)}</b><div class="tx-chips">${chip(`${P.days} day${P.days === 1 ? '' : 's'} of work`)}${chip(gainTxt(P), 'blue')}${P.joker ? chip('Uses a joker', 'warn') : ''}
          <span class="tx-odds">${seg(c, c >= 0.75 ? 'good' : c >= 0.6 ? 'warn' : 'bad', 8)}<span>${Math.round(c * 100)}% it works</span></span></div></div>
        <div class="tm-acts">${P.locked === 'Under way' ? chip('Under way', 'good') : P.locked ? `<span class="tx-lock">${esc(P.locked)}</span>` : `${btn('team', P, `Do it &middot; ${WC.money$(P.cost)}`, 'pri')}${btn('shop', P, `Shop &middot; ${WC.money$(P.shopCost)}`)}`}</div></div>`; }).join('');
    const right = chip(`${mine.length} of ${max} bench${max === 1 ? '' : 'es'} in use`, mine.length >= max ? 'warn' : '') + (ser.ballast ? chip(`${WC.jokersLeft(w)} of ${WC.JOKERS} jokers left`, WC.jokersLeft(w) ? '' : 'bad') : '');
    return `<div class="tm tx-page">${pageHead('dev', 'Development', esc(w.car.name), right)}
      <div class="tx-grid">${panel('The car', spec, dyno || lvl ? 'measured' : 'how it feels')}${panel('On the bench', bench, m ? `${esc(m.first)}: ${rate.toFixed(1)} days of work a week` : 'no mechanic: only your days')}</div>
      ${panel('Projects', `<div class="tx-sts">${tabs}</div>${projs}`, 'a shop costs more, but it\'s done by the next round')}
      <p class="tx-note">Development fades over the winter: the rest of the field doesn't stand still. A dyno tells you exactly what engine work gained; a data engineer, everything.</p></div>`;
  }
  // ---------- Facilities: the premises (a ladder), what's in them (cards), what the series above asks for ----------
  facTab() {
    const w = this.w, t = WC.myTeam(w), up = WC.SERIES[WC.seriesById(w.player.series).tier + 1], off = w.player.offer;
    if (!w.founding?.reg) return `<div class="tm tx-page">${pageHead('facilities', 'Facilities', 'Register the team first.')}</div>`;
    const target = off && off.answer === 'move' ? WC.seriesById(off.to) : up, need = target ? WC.SERIES_NEEDS[target.id] || {} : {}, miss = target ? WC.seriesMissing(t, target.id).map(m => m[0]) : [];
    const bb = (k, label, cls = '') => { const key = 'build:' + k; return `<button class="pc-btn sm ${cls}" data-nav data-act="build" data-arg="${k}" data-key="${key}">${this.armed === key ? 'Sure? Select again' : label}</button>`; };
    // selling up: what it brings and what it saves a round, on the button (only what can be sold)
    const sb = (k) => { const x = WC.facSale(w, k); if (!x || x.why) return ''; const key = 'sellfac:' + k; return `<button class="pc-btn sm" data-nav data-act="sellfac" data-arg="${k}" data-key="${key}" title="${k === 'base' ? `Move back to the ${esc(x.to.toLowerCase())}` : 'Sell it'}: saves ${WC.money$(x.saves)} a round">${this.armed === key ? 'Sure? Select again' : `${k === 'base' ? 'Move out' : 'Sell'} +${WC.money$(x.value)}`}</button>`; };
    const n = WC.facLevel(t, 'base'), L = WC.FACILITIES.base.levels, nxB = WC.facNext(t, 'base');
    const ladder = L.map((l, i) => `<div class="tx-step${i < n ? ' done' : i === n ? ' on' : ''}${need.base === i && miss.includes('base') ? ' need' : ''}"><i>${i + 1}</i><b>${esc(l[0])}</b><small>${1 + Math.min(2, i)} bench${i ? 'es' : ''} &middot; ${WC.money$(l[2])} a round</small>${i > n ? `<small class="tx-cost">${WC.money$(l[1])} to move</small>` : ''}${i === n + 1 ? `<div>${bb('base', 'Move', 'pri')}</div>` : ''}${i === n && sb('base') ? `<div>${sb('base')}</div>` : ''}</div>`).join('<span class="tx-arrow"></span>');
    const reqs = target && Object.keys(need).length ? panel(`${esc(target.name)} requirements`, Object.entries(need).map(([k, lv]) => { const ok = WC.facLevel(t, k) >= lv; return `<div class="tx-req ${ok ? 'ok' : 'no'}"><i>${ok ? '&#10004;' : '&#10008;'}</i><b>${esc(WC.needName(k, lv).replace(/^an? /, '').replace(/^./, c => c.toUpperCase()))}</b><span>${ok ? 'Done' : 'Missing'}</span></div>`; }).join(''), off && off.answer === 'move' ? 'before the season starts, or the entry is withdrawn' : 'to take an entry', miss.length ? 'need' : '') : '';
    const keys = WC.FAC_KEYS.filter(k => k !== 'base' && (k !== 'tunnel' || w.player.series === 'formula' || need.tunnel));
    const cards = keys.map(k => {
      const F = WC.FACILITIES[k], lv = WC.facLevel(t, k), nx = WC.facNext(t, k), req = need[k] && miss.includes(k);
      const short = nx && n < nx.needsBase ? `Needs ${WC.FACILITIES.base.levels[nx.needsBase][0].toLowerCase()} premises` : '';
      const pips = Array.from({ length: F.levels.length }, (_, i) => `<b${i < lv ? ' class="on"' : ''}></b>`).join('');
      return `<div class="tx-fac${lv ? ' built' : ''}${req ? ' need' : ''}"><div class="tx-fh">${txIcon(FAC_ICON[k], 26)}<div><b>${esc(lv ? WC.facName(t, k) : F.name)}</b><span class="tx-pips">${pips}</span></div>${req ? chip('Required', 'warn') : lv ? chip('Built', 'good') : ''}</div>
        <ul class="tx-pl one${lv ? '' : ' dim'}">${(lv && nx ? WC.facCompare(w, k, lv) : WC.facPerks(w, k, Math.max(1, lv)).map(t => [t, false])).map(([t, up]) => `<li${up ? ' class="up"' : ''}>${esc(t).replace(/&amp;rarr;/g, '<b>&rarr;</b>')}</li>`).join('')}</ul>
        ${lv && nx ? '<p class="tx-nextp">Blue: what the upgrade changes</p>' : ''}
        <div class="tx-ff">${nx ? `<span><b>${esc(nx.name)}</b><small>${WC.money$(nx.cost)}${nx.upkeep ? ` + ${WC.money$(nx.upkeep)} a round` : ''}</small></span>${short ? `<span class="tx-lock">${esc(short)}</span>` : bb(k, lv ? 'Upgrade' : 'Build', req ? 'pri' : '')}` : '<span class="tx-dim">Fully built</span>'}${lv ? sb(k) : ''}</div></div>`;
    }).join('');
    return `<div class="tm tx-page">${pageHead('facilities', esc(WC.facName(t, 'base')), 'It all stays with the team when you move up', kpi('Rent and upkeep', WC.money$(WC.facUpkeep(t)), 'a round'))}
      ${panel('Premises', `<div class="tx-ladder">${ladder}</div>`, 'bigger premises have room for more at once')}
      ${reqs}
      ${panel('Facilities', `<div class="tx-facs">${cards}</div>`)}</div>`;
  }
  // ---------- Staff: three jobs, cards; payroll ----------
  teamApp() {
    const w = this.w;
    if (!w.founding?.reg) return `<div class="tm tx-page">${pageHead('staff', 'Staff', 'Register the team first.')}</div>`;
    const AV = { manager: '#2a4fa0', mechanic: '#c8141c', engineer: '#16742a' };
    const perks = (role, sk) => `<ul class="tx-pl">${WC.staffPerks(w, role, sk).map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
    const cards = Object.keys(WC.ROLES).map(role => {
      const x = WC.staffOf(w, role), R = WC.ROLES[role];
      if (!x) return `<div class="tx-card vacant"><div class="tx-av">?</div><div class="tx-ci"><b>${R.name}</b><small>Vacant. A three-star one would:</small>${perks(role, 3)}</div><div class="tm-acts"><button class="pc-btn sm pri" data-nav data-act="jobs" data-arg="${role}" data-key="find-${role}">Find one</button></div></div>`;
      const mood = x.morale >= 70 ? 'happy' : x.morale >= 45 ? 'fine' : x.morale >= 25 ? 'unhappy' : 'furious', mc = x.morale >= 70 ? 'good' : x.morale >= 45 ? 'warn' : 'bad';
      return `<div class="tx-card"><div class="tx-av" style="background:${AV[role]}">${esc(x.first[0])}${esc(x.last[0])}</div><div class="tx-ci"><b>${esc(x.first)} ${esc(x.last)}</b><small>${R.name}</small><span class="tx-stars">${'&#9733;'.repeat(x.skill)}<i>${'&#9733;'.repeat(5 - x.skill)}</i></span></div>
        <div class="tx-cm"><small>Morale: ${mood}</small>${seg(x.morale / 100, mc)}${x.owed ? `<small class="neg">Owed ${WC.money$(x.owed)}</small>` : ''}</div>
        <div class="tx-cp"><small>Pay &middot; ${WC.money$(WC.wageNow(w, x))} a round</small><div class="tm-pay" data-nav data-cycle="pay-${x.id}" data-key="pay-${x.id}"><i data-act="cyc" data-arg="pay-${x.id}:-1">&#9664;</i><b>${WC.PAY_MODES.find(m => m[0] === x.pay)[1]}</b><i data-act="cyc" data-arg="pay-${x.id}:1">&#9654;</i></div></div>
        <div class="tm-acts">${x.owed ? `<button class="pc-btn sm" data-nav data-act="backpay" data-arg="${x.id}" data-key="bp-${x.id}">Pay back</button>` : ''}<button class="pc-btn sm" data-nav data-act="fire" data-arg="${x.id}" data-key="fire-${x.id}">${this.fireArmed === x.id ? 'Sure? Select again' : 'Let go'}</button></div>
        <div class="tx-perks">${perks(role, x.skill)}</div></div>`;
    }).join('');
    const due = WC.payrollDue(w), short = WC.payrollShort(w);
    return `<div class="tm tx-page">${pageHead('staff', 'Staff', 'Good people get better, and get offers', `${kpi('Payroll', WC.money$(due), 'as the next round starts', short ? 'bad' : '')}`)}
      ${short ? `<div class="tx-alert bad">That's more than your ${WC.money$(w.money.balance)}. Pay someone half, or hold their wages this round.</div>` : ''}${w.wageClaims ? `<div class="tx-alert warn">Includes ${WC.money$(w.wageClaims)} in wage claims from former staff.</div>` : ''}
      <div class="tx-cards">${cards}</div>
      <p class="tx-note">Pay on time and people stay happy. Half or hold and they're owed the rest, and they notice. Someone unhappy enough, and owed money, walks out.</p>
      <div class="tx-actions"><button class="pc-btn" data-nav data-act="open" data-arg="jobs" data-key="jobs">SVJobs &rarr;</button></div></div>`;
  }
  // ---------- Sponsors: your standing, three slots ----------
  sponsorTab() {
    const w = this.w, deals = WC.dealsOf(w), rep = WC.repOf(w), offers = (w.mail || []).filter(m => m.sponsorOffer && !m.answer);
    if (!w.founding?.reg) return `<div class="tm tx-page">${pageHead('sponsors', 'Sponsors', 'Register the team first.')}</div>`;
    const slots = WC.SPONSOR_SLOTS.map((slot, i) => {
      const d = deals.filter(x => x.slot === slot)[slot === 'title' ? 0 : i - 1], isTitle = slot === 'title';
      if (!d) return `<div class="tx-spon vacant${isTitle ? ' title' : ''}"><small>${isTitle ? 'Title sponsor' : 'Associate sponsor'}</small><b>Open</b><p>Offers come by email.</p></div>`;
      const sp = WC.sponsorInfo(d.sid), o = WC.dealObjective(w, d), src = this.src.logoSrc?.(d.sid), on = this.src.logoOn?.(d.sid) ?? true, tot = d.met + d.misses;
      return `<div class="tx-spon${isTitle ? ' title' : ''}"><small>${isTitle ? 'Title sponsor' : 'Associate sponsor'}</small><div class="tx-sh">${src ? `<img src="${src}">` : ''}<b>${esc(sp.name)}</b></div>
        <div class="tx-kpis sm">${kpi('A round', WC.money$(d.fee))}${kpi('Target bonus', WC.money$(d.bonus))}</div>
        <div class="tx-target"><small>Next race</small><b>${esc(WC.objText(w, o))}</b></div>
        <div class="tx-mrow"><small>Targets met ${d.met} of ${tot}</small>${seg(tot ? d.met / tot : 0, 'good')}</div>
        <div class="tx-chips">${chip(isTitle ? 'Name on the car' : on ? 'Logo on the car' : 'Logo not on the car: no pay', isTitle || on ? 'good' : 'bad')}${d.misses >= WC.patienceOf(d) ? chip('Losing patience', 'bad') : ''}</div>
        <div class="tm-acts">${isTitle ? '' : `<button class="pc-btn sm" data-nav data-act="logo" data-arg="tocar:${d.sid}" data-key="lc-${d.sid}">${on ? 'Move logo' : 'Put it on'}</button>`}<button class="pc-btn sm" data-nav data-act="logo" data-arg="upload:${d.sid}" data-key="lu-${d.sid}">Upload logo</button></div></div>`;
    }).join('');
    return `<div class="tm tx-page">${pageHead('sponsors', 'Sponsors', 'A fee every round, a bonus for each target met', kpi('Standing', standWord(rep), seg(rep / 100, 'blue')))}
      ${offers.length ? `<div class="tx-alert warn">${offers.length} offer${offers.length === 1 ? '' : 's'} waiting in Mail <button class="pc-btn sm pri" data-nav data-act="mailto" data-arg="${offers[0].id}" data-key="offers">Read &rarr;</button></div>` : ''}
      <div class="tx-spons">${slots}</div>
      <p class="tx-note">Better results, met targets and clean racing bring bigger names.</p></div>`;
  }
  // drivers: your teammate (contract, mood, pay), your reputation with drivers, who's available, who has it in for you
  driversTab() {
    const w = this.w, m = WC.mateOf(w), drep = WC.drepOf(w);
    if (!w.founding?.reg) return '<div class="tm"><p class="pc-empty">Register the team first.</p></div>';
    const chips = (p) => WC.traitsOf(w, p).map(t => `<span class="dv-chip" title="${esc(WC.TRAITS[t].desc)}">${esc(WC.TRAITS[t].name)}</span>`).join('');
    const quick = (p) => p.pace >= 75 ? 'very quick' : p.pace >= 65 ? 'quick' : p.pace >= 55 ? 'decent' : p.pace >= 45 ? 'average' : 'slow';
    const btn = (a, arg, label, armed) => `<button class="pc-btn sm" data-nav data-act="${a}" data-arg="${arg}" data-key="${a}:${arg}">${this.armed === a + ':' + arg ? armed : label}</button>`;
    let me = `<div class="tx-card vacant"><div class="tx-av">?</div><div class="tx-ci"><b>Second seat</b><small>Empty. Sign someone below.</small></div></div>`;
    if (m) {
      const p = WC.people(w)[m.pid], h = WC.h2hOf(w, m.pid), mood = m.morale >= 70 ? 'happy' : m.morale >= 45 ? 'fine' : m.morale >= 25 ? 'unhappy' : 'furious', mc = m.morale >= 70 ? 'good' : m.morale >= 45 ? 'warn' : 'bad';
      const last = m.until <= w.year, st = (k, v) => `<div class="wz-stat"><span>${k}</span>${seg(v / 100, v >= 65 ? 'good' : v >= 50 ? 'blue' : 'warn', 8)}<em>${Math.round(v)}</em></div>`;
      me = `<div class="tx-mate">${face(p, 72)}
        <div class="tx-mi"><b><a class="dv-name" data-nav data-act="profile" data-arg="${p.id}" data-key="pf-${p.id}">${esc(p.first)} ${esc(p.last)}</a></b><small>${WC.ageOf(w, p)} &middot; ${esc(p.nat)} &middot; ${quick(p)}</small><div class="tx-chips">${WC.traitsOf(w, p).map(t => chip(esc(WC.TRAITS[t].name), 'blue')).join('')}</div>
          <div class="tx-mk"><div><small>Pay</small><b>${m.fee ? `Brought ${WC.money$(m.fee)}` : `${WC.money$(m.wage)} a round`}</b></div><div><small>Contract</small><b>To the end of ${m.until}</b></div>${h.races ? `<div><small>Ahead of you</small><b>${h.behind} of ${h.races}</b></div>` : ''}</div></div>
        <div class="tx-ms">${st('Pace', p.pace)}${st('Consistency', p.cons)}${st('Racecraft', p.craft)}<div class="tx-cm"><small>Morale: ${mood}${m.owed ? ` &middot; <span class="neg">owed ${WC.money$(m.owed)}</span>` : ''}</small>${seg(m.morale / 100, mc, 8)}</div></div>
        <div class="tx-ma">${m.wage ? `<div class="tx-cp"><small>Pay setting</small><div class="tm-pay" data-nav data-cycle="mpay" data-key="mpay"><i data-act="cyc" data-arg="mpay:-1">&#9664;</i><b>${WC.PAY_MODES.find(x => x[0] === m.pay)[1]}</b><i data-act="cyc" data-arg="mpay:1">&#9654;</i></div></div>` : ''}
          ${last && !m.fee ? btn('mextend', '1', `Extend: ${WC.money$(WC.askOf(w, p).wage)} a round`, 'Sure? Select again') : ''}</div></div>`;
    }
    const market = WC.driverMarket(w).map(p => {
      const a = WC.askOf(w, p), t = p.team ? w.teams[p.team] : null, g = WC.grudgeOf(w, p.id);
      return `<div class="jb-row dv-row"><div class="dv-who">${face(p, 40)}<div><b><a class="dv-name" data-nav data-act="profile" data-arg="${p.id}" data-key="pf-${p.id}">${esc(p.first)} ${esc(p.last)}</a></b>, ${WC.ageOf(w, p)} ${chips(p)}<small>${quick(p)} &middot; ${t ? esc(t.name) : 'no seat'} &middot; ${p.wins} win${p.wins === 1 ? '' : 's'}${g >= 1 ? ` &middot; <span class="neg">${g >= 3 ? 'won\'t talk to you' : 'holds a grudge'}</span>` : ''}</small></div></div>
        <div class="jb-meta">${a.fee ? `brings ${WC.money$(a.fee)}` : `asks ${WC.money$(a.wage)} a round`}</div>
        <div class="tm-acts">${btn('dsign', p.id, a.fee ? 'Sign' : 'Offer', m ? `Replace ${esc(WC.people(w)[m.pid].first)}?` : 'Sure?')}${a.fee ? '' : btn('dlow', p.id, 'Lowball', '75%? Select again')}</div></div>`;
    }).join('');
    return `<div class="tm tx-page"><div class="tm-head"><b>Drivers</b><small>Your reputation with drivers: ${drep >= 70 ? 'good' : drep >= 45 ? 'fine' : drep >= 25 ? 'poor' : 'bad'}. Paying late, dropping people mid-season and dirty racing all get around.</small></div>
      <h3 class="dv-h">Your teammate</h3>${me}
      <h3 class="dv-h">${w.over ? 'Available for next season' : 'Free agents'}</h3>${market || '<p class="pc-empty">Nobody available right now.</p>'}
      <p class="tm-note">${w.over ? 'Between seasons you can approach drivers on other teams too.' : 'During the season only drivers without a seat are free. Between seasons, everyone in your series and below.'} Dropping your teammate mid-season means paying their wages to the end of it.</p></div>`;
  }
  // the Internet's home page: bookmarks
  homePage() {
    const rows = BOOKMARKS.filter(([id]) => id !== 'customer' || WC.carSeries(this.w).car !== 'classifieds').map(([id, name, sub], k) => `<div class="hp-bm" data-nav data-act="bm" data-arg="${id}" data-key="bm-${id}"${k === 0 ? ' data-first' : ''}>${bmIcon(id)}<div><a>${esc(name)}</a><small>${esc(sub)}</small></div></div>`).join('');
    return `<div class="hp"><div class="hp-head"><b>SVNet</b><small>Your home on the web &middot; ${esc(this.clock())}</small></div><div class="hp-body"><h2>Bookmarks</h2>${rows}</div></div>`;
  }

  // Speed Parts Direct: new parts, with the supplier's own claims
  partsSite() {
    const w = this.w, slot = this.page.slot || 'engine', items = WC.catalogue(w).filter(c => c.slot === slot), P = WC.carParts(w);
    const head = `<div class="sp-head"><b>SPEED PARTS DIRECT</b><small>Performance parts &middot; next-day delivery &middot; trade prices</small></div>`;
    if (!P) return head + '<p class="pc-empty">You need a car first.</p>';
    const tabs = WC.PART_KEYS.map(k => `<span class="jb-tab${k === slot ? ' on' : ''}" data-nav data-act="slot" data-arg="${k}" data-key="slot-${k}">${WC.PARTS[k].name}</span>`).join('');
    const claim = (c) => Object.entries(c.claim || c.gains).map(([s2, v]) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}% ${s2}`).join(', ');
    const cur = P[slot].fit;
    const rows = items.map((c, k) => `<div class="jb-row"><div><b>${esc(c.name)}</b><small>Manufacturer's figures: ${claim(c)}.</small></div><div class="jb-meta">${WC.money$(c.price)}</div>
      ${WC.isFitted(w, c) ? '<span class="sp-fitted">Fitted</span>' : `<button class="pc-btn sm" data-nav data-act="fitpart" data-arg="${c.id}" data-key="fitpart:${c.id}"${k === 0 ? ' data-first' : ''}>${this.armed === 'fitpart:' + c.id ? (cur ? `Replace ${esc(cur.name)}? Select again` : 'Buy & fit? Select again') : 'Buy & fit'}</button>`}</div>`).join('');
    return head + `<div class="jb-tabs">${tabs}</div><div class="jb-body">${cur ? `<p class="jb-cur">On your car now: ${esc(cur.name)}. A new one replaces it.</p>` : ''}${rows}<p class="tr-fine">Figures are the manufacturer's own, measured under ideal conditions.</p></div>`;
  }

  // GigGo: driving jobs by the job (the courier runs and the funeral home's work; drive them as soon as you take them)
  gigSite() {
    const w = this.w, wk = WC.weekOf(w), r = WC.gigRating(w), G = w.gig || { jobs: 0 }, left = WC.daysLeft(w);
    const head = `<div class="gg-head"><b>GigGo</b><span>Driver</span><small>${esc(w.player.name)} &middot; &#9733; ${r.toFixed(2)} &middot; ${G.jobs} job${G.jobs === 1 ? '' : 's'}</small></div>`;
    const warn = r < 4.2 ? `<p class="gg-warn">Your account is under review. While we review it, you may be offered fewer jobs.</p>` : r >= 4.8 && G.jobs >= 5 ? `<p class="gg-pro">GigGo Pro: you're seeing our best-paying jobs first.</p>` : '';
    const gigs = wk.gigs.filter(g => !g.booked);
    const rows = gigs.map((g, k) => `<div class="gg-row"><div><b>${esc(g.kind === 'hearse' ? g.client : g.client)}</b><small>${esc(g.kind === 'hearse' ? g.what : g.what + (g.fragile ? ' (fragile)' : '') + (g.urgent ? ' (urgent)' : ''))} &middot; ${g.laps} lap${g.laps === 1 ? '' : 's'}${g.kind === 'hearse' ? ' &middot; time window' : ''}</small></div>
      <div class="gg-fare">${WC.money$(g.pay)}<small>est. fare</small></div>
      <button class="pc-btn sm" data-nav data-act="take" data-arg="${g.id}" data-key="take:${g.id}"${k === 0 ? ' data-first' : ''}>${this.armed === 'take:' + g.id ? 'Take it and drive? Select again' : 'Accept'}</button></div>`).join('');
    const body = !w.car ? '<p class="pc-empty">Sign-up incomplete.</p>' : left <= 0 ? '<p class="pc-empty">You\'ve set yourself as unavailable for the rest of the week.</p>' : rows || '<p class="pc-empty">No jobs near you right now. Check back next week.</p>';
    return head + `<div class="gg-body">${warn}<p class="gg-avail">Available: ${left} day${left === 1 ? '' : 's'} this week</p>${body}
      <p class="tr-fine">Fares are estimates. A service fee of 25% and a Trust &amp; Safety fee apply to every fare. GigGo drivers are independent contractors. Vans are provided by GigGo; damage is the driver's responsibility.</p></div>`;
  }

  // SVJobs: the applicants, by job
  jobsSite() {
    const w = this.w, role = this.page.role || 'mechanic', jobs = (w.jobs || []).filter(j => j.role === role);
    const head = `<div class="jb-head"><b>SVJobs</b><small>Motorsport &middot; San Velocita</small></div>`;
    const tabs = Object.keys(WC.ROLES).map(r => `<span class="jb-tab${r === role ? ' on' : ''}" data-nav data-act="role" data-arg="${r}" data-key="role-${r}">${WC.ROLES[r].name}</span>`).join('');
    const cur = WC.staffOf(w, role);
    const perks = (sk) => `<ul class="jb-pl">${WC.staffPerks(w, role, sk).map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
    const rows = jobs.map((j, k) => `<div class="jb-row"><div><b>${esc(j.first)} ${esc(j.last)}</b>, ${j.age}<small>${esc(j.cv)}</small>${perks(j.skill)}</div>
      <div class="jb-meta">skill ${'&#9733;'.repeat(j.skill)}${'&#9734;'.repeat(5 - j.skill)}<br>${WC.money$(WC.wageNow(w, j))} a round</div>
      <button class="pc-btn sm" data-nav data-act="hire" data-arg="${j.id}" data-key="hire-${j.id}"${k === 0 ? ' data-first' : ''}>${this.hireArmed === j.id ? (cur ? `Replace ${esc(cur.first)}? Select again` : 'Hire? Select again') : 'Hire'}</button></div>`).join('');
    return head + `<div class="jb-tabs">${tabs}</div><div class="jb-body"><p class="jb-perk">${esc(WC.ROLES[role].perk)}</p>${cur ? `<div class="jb-cur">You have one: <b>${esc(cur.first)} ${esc(cur.last)}</b> (${'&#9733;'.repeat(cur.skill)}). Hiring someone else lets ${esc(cur.first)} go. ${esc(cur.first)} now:${perks(cur.skill)}</div>` : ''}${rows || '<p class="pc-empty">No applicants this season.</p>'}</div>`;
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

  // ---------- customer racing: the cars a series homologates, from the makers' programmes (and last year's, from teams) ----------
  customerSite() {
    const w = this.w, S = WC.carSeries(w), p = this.page, L = w.opts.len;
    const head = `<div class="cr-head"><b>${esc(S.name)}</b><span>Homologated cars</span><small>${S.car === 'spec' ? 'One chassis, leased from the series' : 'Customer racing programmes &middot; ex-works cars'}</small></div>`;
    if (S.car === 'classifieds') return head + '<p class="pc-empty">Customer programmes sell to licensed teams only.</p>';
    const cars = WC.customerCars(w, S), used = WC.exWorks(w, S), mine = w.car && w.car.cls === S.cls ? w.car : null;
    const can = true, col = w.teams[w.player.team].main;
    const old = w.car ? (w.car.lease ? `Your ${esc(w.car.name)} goes back to ${esc(w.car.lease.prog)}.` : `Your ${esc(w.car.name)}: <b>${WC.money$(WC.tradeIn(w))}</b> in part exchange.`) : '';
    const btn = (how, id, label, k) => { const key = 'getcar:' + how + '|' + id; return `<button class="pc-btn${k ? '' : ' sm'}" data-nav data-act="getcar" data-arg="${how}|${id}" data-key="${key}"${k === 1 ? ' data-first' : ''}>${this.armed === key ? 'Sure? Select again' : label}</button>`; };
    if (p.cc) {
      const c = cars.find(x => x.key === p.cc) || used.find(x => x.id === p.cc); if (!c) return head + '<p class="pc-empty">That car is no longer available.</p>';
      const xw = !!c.team, short = (n) => w.money.balance < n ? ' <small class="neg">more than your balance</small>' : '';
      const deals = xw ? `<div class="cr-deal"><b>${WC.money$(c.price)}</b><small>${esc(c.team)}'s car from ${c.year}. ${WC.condName(c.cond)} (${Math.round(c.cond * 100)}%).</small>${short(c.price)}${can ? btn('used', c.id, `Buy it: ${WC.money$(c.price)}`, 1) : ''}</div>`
        : `<div class="cr-deal"><b>Lease</b><small>${WC.money$(c.deposit)} deposit, then ${WC.money$(c.perRound)} a round (${WC.money$(c.deposit + c.perRound * L)} for a ${L}-round season). The engine and gearbox are rebuilt by the programme between rounds.</small>${short(c.deposit)}${can ? btn('lease', c.key, `Lease it: ${WC.money$(c.deposit)} now`, 1) : ''}</div>
           ${c.buy ? `<div class="cr-deal"><b>Buy new</b><small>${WC.money$(c.price)}. Yours to keep, sell, or rebuild.</small>${short(c.price)}${can ? btn('buy', c.key, `Buy it: ${WC.money$(c.price)}`) : ''}</div>` : ''}`;
      return head + `<div class="cr-page" data-nav data-scroll data-key="crpage"><div class="cr-top">${this.photo({ id: 'cc' + c.key + col, chassis: c.key, color: col }, 'cr-photo')}
        <div><h1>${esc(c.name)}</h1><p class="cr-prog">${esc(c.prog)}${xw ? `, ex-${esc(c.team)}` : ''}</p><table class="cl-attrs">${this.specRows(c.key)}</table><p class="cr-note">${esc(cars.find(x => x.key === c.key)?.note || '')}</p></div></div>
        ${old ? `<p class="cr-old">${old}</p>` : ''}${deals}</div>`;
    }
    const b = WC.seasonBudget(w, S);
    const row = (c, k) => `<div class="cr-row" data-nav data-act="cc" data-arg="${c.id || c.key}" data-key="cc-${c.id || c.key}"${k === 0 ? ' data-first' : ''}>${this.photo({ id: 'cc' + c.key + col, chassis: c.key, color: col }, 'cr-thumb')}
      <div><b>${esc(c.name)}</b><small>${c.team ? `Ex-${esc(c.team)}, ${c.year} &middot; ${WC.condName(c.cond).toLowerCase()}` : `${esc(c.prog)} &middot; ${c.hp} hp, ${c.kg} kg`}</small></div>
      <div class="cr-price">${c.team ? WC.money$(c.price) : `${WC.money$(c.perRound)}<small>a round, leased</small>`}</div></div>`;
    return head + `<div class="cr-body">${mine ? `<p class="cr-own">Your car: ${esc(mine.name)}${mine.lease ? `, leased from ${esc(mine.lease.prog)} (${WC.money$(mine.lease.perRound)} a round)` : ''}.</p>` : ''}${old && !mine ? `<p class="cr-old">${old}</p>` : ''}
      <h2>${S.car === 'spec' ? 'The chassis' : 'New, from the makers'}</h2>${cars.map(row).join('') || '<p class="pc-empty">No cars listed.</p>'}
      ${used.length ? `<h2>Last season's cars, from teams</h2>${used.map((c, k) => row(c, cars.length + k)).join('')}` : ''}
      <p class="tr-fine">A season costs about ${WC.money$(b.run)} to run, before the car. Crash damage is the customer's.</p></div>`;
  }

  // ---------- the classifieds: SVList ----------
  classSite() {
    const w = this.w, ads = w.ads || [], p = this.page;
    const tab = p.tab || (w.car ? 'parts' : 'cars');
    const head = `<div class="cl-head"><b>SVList</b><small>san velocita &gt; for sale &gt; ${tab === 'parts' ? 'auto parts' : 'cars &amp; trucks'} &gt; by owner</small></div>
      <div class="cl-tabs">${['cars', 'parts'].map(t => `<span class="cl-tab${t === tab ? ' on' : ''}" data-nav data-act="cltab" data-arg="${t}" data-key="cltab-${t}">${t === 'cars' ? 'cars &amp; trucks' : 'auto parts'}</span>`).join('')}</div>`;
    if (tab === 'parts' && !p.ad) return head + this.usedPartsList();
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
  // SVList auto parts: used parts, some good; your mechanic's take if you have one (a better one sees more)
  usedPartsList() {
    const w = this.w, list = w.usedParts || [], m = WC.staffOf(w, 'mechanic');
    if (!w.car) return '<p class="pc-empty">Buy a car first.</p>';
    const take = (u) => !m ? '' : m.skill >= 4 || (m.skill >= 2 && (u.q < 0.4 || u.q > 0.75)) ? `<em>${esc(m.first)}: "${u.q >= 0.75 ? 'that looks clean' : u.q >= 0.5 ? 'it\'ll do' : u.q >= 0.35 ? 'I wouldn\'t' : 'that\'s junk'}"</em>` : `<em>${esc(m.first)}: "can't tell from a listing"</em>`;
    const rows = list.map((u, k) => `<div class="cl-prow"><span class="cl-price">${WC.money$(u.price)}</span><div><a>${esc(u.name)} &ndash; ${esc(u.blurb.toLowerCase())}</a>${u.danny ? ' <b class="cl-danny">(Danny\'s guy)</b>' : ''}<small>${WC.PARTS[u.slot].name.toLowerCase()} &middot; seller ${esc(u.seller)}</small>${take(u)}</div>
      ${WC.isFitted(w, u) ? '<span class="sp-fitted">Fitted</span>' : `<button class="pc-btn sm" data-nav data-act="fitpart" data-arg="${u.id}" data-key="fitpart:${u.id}"${k === 0 ? ' data-first' : ''}>${this.armed === 'fitpart:' + u.id ? (WC.carParts(w)[u.slot].fit ? `Replace ${esc(WC.carParts(w)[u.slot].fit.name)}? Select again` : 'Buy & fit? Select again') : 'Buy & fit'}</button>`}</div>`).join('');
    return `<div class="cl-list">${rows || '<p class="pc-empty">Nothing this week.</p>'}<p class="tr-fine">New listings every week. Cash only. No returns.</p></div>`;
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
      ${ann}${this.loanBox()}
      <h2>Transactions</h2><div class="bk-txw" data-nav data-scroll data-key="tx" data-first><table class="pc-tbl bk-tx"><tr><th>WHEN</th><th>DESCRIPTION</th><th class="r">AMOUNT</th><th class="r">BALANCE</th></tr>${rows}</table></div></div>`;
  }
  // the bank's business loan: apply (select twice), or what's left to pay
  loanBox() {
    const w = this.w, L = (w.loans || []).find(l => !l.shark && !l.paid), t = WC.loanTerms(w);
    return L ? `<div class="bk-box"><b>Business loan</b><span>${L.left} instalment${L.left === 1 ? '' : 's'} of ${WC.money$(L.per)} left, taken after each round.</span></div>`
      : `<div class="bk-box"><b>Business loan</b><span>Borrow ${WC.money$(t.amt)}, repaid in ${t.rounds} instalments of ${WC.money$(t.per)} after each round. Subject to status.</span><button class="pc-btn sm" data-nav data-act="loan" data-key="loan">${this.loanArmed ? 'Apply? Select again' : 'Apply'}</button></div>`;
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
      // (where they work and what's in it is public; how quick their car is, your data engineer can estimate)
      const eng = WC.dataLevel(w) >= 1 && s.id === w.player.series, vals = S.teams.map(tid => WC.carValue(w, w.teams[tid])).sort((a, b) => b - a);
      const FAC_SHORT = { tools: 'tools', dyno: 'dyno', fab: 'fab shop', sim: 'sim', data: 'data room', truck: 'transporter', tunnel: 'tunnel' };
      body = `<table class="pc-tbl"><tr><th>POS</th><th>TEAM</th><th>DRIVERS</th><th>BASE</th>${eng ? '<th>CAR</th>' : ''}<th class="r">WINS</th><th class="r">PTS</th></tr>${list.map((e, k) => {
        const t = w.teams[e.tid], kit = Object.keys(FAC_SHORT).filter(f => WC.facLevel(t, f)).map(f => FAC_SHORT[f]).join(', '), rank = vals.indexOf(WC.carValue(w, t));
        return `<tr class="${t.mine ? 'me' : ''}"><td>${k + 1}</td><td><i class="sw" style="background:${hex(t.main)}"></i>${esc(t.name)}</td><td>${t.drivers.map(d => esc(WC.displayName(w, d))).join(', ')}</td><td>${esc(WC.facName(t, 'base'))}${kit ? `<small class="ss-kit">${esc(kit)}</small>` : ''}</td>${eng ? `<td>${rank < 2 ? 'Quick' : rank < 4 ? 'Average' : 'Slow'}</td>` : ''}<td class="r">${e.wins}</td><td class="r">${e.pts}</td></tr>`; }).join('')}</table>
        ${eng ? '' : '<p class="tr-fine">A data engineer could tell you whose car is quick.</p>'}`;
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
      return `<tr class="${isP ? 'me' : ''}" data-nav data-act="driver" data-arg="${pid}" data-key="drv-${pid}"${k === 0 ? ' data-first' : ''}><td class="db-fc">${face(isP ? { id: 'P' } : x, 22)}<a>${esc(WC.displayName(w, pid))}</a></td><td>${isP ? 'You' : NAT[x.nat] || x.nat}</td><td>${p.db === 'retired' ? x.retiredYear : esc(t?.name || '')}</td><td class="r">${x.wins}</td><td class="r">${x.titles}</td></tr>`;
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
    // this season, round by round
    const sid = isP ? w.player.series : p.series || (t && t.series), S = sid && w.series[sid];
    const season = S ? S.cal.map((c, k) => { const res = S.results.find(r => r.round === k), row = res && res.rows.find(r => r.pid === pid); return `<td class="${row && !row.dnf && row.pos <= 3 ? 'pos' : ''}">${row ? (row.dnf ? 'DNF' : row.pos) : res ? '&ndash;' : ''}</td>`; }).join('') : '';
    const mate = WC.mateOf(w), market = !isP && WC.driverMarket(w).some(x => x.id === pid), mine = !isP && mate && mate.pid === pid;
    const ask = !isP ? WC.askOf(w, p) : null;
    const status = isP ? 'You' : p.retired ? `Retired in ${p.retiredYear}` : mine ? `Your teammate &middot; ${mate.fee ? `brought ${WC.money$(mate.fee)}` : `${WC.money$(mate.wage)} a round`}, to the end of ${mate.until}` : p.team ? `Drives for ${esc(t.name)}${market ? ' &middot; available next season' : ''}` : 'Free agent';
    const best = c.hist.length ? c.hist.reduce((b, h) => (!b || h.pos < b.pos ? h : b), null) : null;
    const btn = (a, label, armed) => `<button class="pc-btn sm" data-nav data-act="${a}" data-arg="${pid}" data-key="${a}:${pid}">${this.armed === a + ':' + pid ? armed : label}</button>`;
    return `<div class="db-page" data-nav data-scroll data-key="dbpage" data-first>
      ${face(isP ? { id: 'P' } : p, 96, 'db-photo')}<h1>${esc(isP ? w.player.name : WC.nameOf(p))}</h1>
      <div class="db-status">${status}</div>
      ${market && !p.retired ? `<div class="db-offer"><span>${ask.fee ? `Brings ${WC.money$(ask.fee)} for a seat` : `Asks ${WC.money$(ask.wage)} a round`}</span>${btn('dsign', ask.fee ? 'Sign' : 'Offer', mate ? `Replace ${esc(w.people[mate.pid]?.first || '')}? Select again` : 'Sure? Select again')}${ask.fee ? '' : btn('dlow', 'Lowball', '75%? Select again')}</div>` : ''}
      <div class="db-facts">${isP ? 'You' : `${NAT[p.nat] || p.nat} &middot; age ${WC.ageOf(w, p)}`} &middot; ${p && p.retired ? 'retired ' + p.retiredYear : t ? esc(t.name) : 'no seat'}</div>
      ${isP ? '' : `<div class="db-traits">${WC.traitsOf(w, p).map(k => `<span class="dv-chip">${esc(WC.TRAITS[k].name)}</span> ${esc(WC.TRAITS[k].desc)}`).join('<br>')}${WC.grudgeOf(w, pid) >= 1 ? `<br><span class="neg">Holds a grudge against you.</span>` : ''}</div>`}
      <div class="db-cells"><div><small>Starts</small><b>${c.starts}</b></div><div><small>Wins</small><b>${c.wins}</b></div><div><small>Podiums</small><b>${c.pods}</b></div><div><small>Titles</small><b>${c.titles}</b></div></div>
      ${isP ? '' : `<h2>Scouting report</h2>${bar('Pace', p.pace)}${bar('Consistency', p.cons)}${bar('Racecraft', p.craft)}${bar('Wet weather', p.wet)}${bar('Aggression', p.aggr)}`}
      ${h && h.races ? `<h2>Against you</h2><div class="db-cells"><div><small>Races</small><b>${h.races}</b></div><div><small>Ahead of you</small><b>${h.behind}</b></div><div><small>Passes</small><b>${h.youPassed} / ${h.passedYou}</b></div><div><small>Contact</small><b>${h.contacts}</b></div></div>${h.dirty ? `<p class="neg">You've driven them off the road or worse ${h.dirty} time${h.dirty === 1 ? '' : 's'}.</p>` : ''}` : ''}
      ${S && S.results.length ? `<h2>${w.year} ${esc(WC.seriesById(sid).name)}</h2><table class="pc-tbl db-season"><tr>${S.cal.map((c, k) => `<th>R${k + 1}</th>`).join('')}</tr><tr>${season}</tr></table>` : ''}
      ${best ? `<p class="db-best">Best season: ${ord(best.pos)} in the ${esc(WC.seriesById(best.s).name)}, ${best.y} (${esc(best.team)}).</p>` : ''}
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
    const out = [], want = /#pc|\.(pc|nw|ss|db|bk|rg|cl|tm|jb|tl|tr|ws|sp|tw|ov|hp|sw|dv|gg|cr|fc|pj|tx|wz)(-|\b)/; // (the class prefixes of the computer's styles: a new site needs its prefix here)
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
function cap(s) { return String(s).toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(At|To|For|Of|The|In|Up)\b(?!$)/g, (m, x, i) => i ? m.toLowerCase() : m).replace(/\b(Sv|Gt|Gp|F1|Tv|Ai)\b/g, (m) => m.toUpperCase()); } // (series and initials stay capitals)
