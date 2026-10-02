// San Velocita Grand Prix — app shell: screens, menus, flow
import * as THREE from 'three';
import { PS2Post } from './post.js';
import { Race, TYRE_FIT, buildScenery } from './race.js';
import { realTracks, needsHydrate, hydrateReal, nameCorners } from './realtracks.js';
import { HUD, fmtTime, RADAR_ZOOMS, readThemeColours } from './hud.js';
import { Editor } from './editor.js';
import { initInput, pressed, isDown, clearEdges, pollGamepad, driveControls, gp, device, onDevice, rumble, padFeel, STEER_CURVES, DEADZONES, STEER_LAGS } from './input.js';
import { lapKey, lapsFor, loadPB, referenceLap, analyze } from './telemetry.js';
import { drawChart, drawMap, notesHtml, fmtGap, fmtSpeed, drawLineMap, lineMapHit, lineMapZoom, lineMapPan, chartHit, popHtml, boardZones, lineRange } from './lapreview.js';
import { AIDS, AID_KEYS, PRESETS, PRESET_VALS, aidsOf, presetOf, applyPreset, aidBonus, AID_RULES, AID_RULE_DESC, limitAids } from './aids.js';
import { initAudio, sfx, setVolume, setMusicVolume, setMusicScene, updateMusic } from './audio.js';
import { presetTracks, sampleTrack, trackStats, THEMES, cloneTrack } from './track.js';
import { TEAMS } from './car.js';
import { Garage } from './garage.js';
import { PitGarage } from './pitgarage.js';
import { Computer } from './computer.js';
import { carPhoto } from './carphoto.js';
import { PARTS, DEFAULT_CAR, chassisReady } from './carmodel.js';
import * as CAREER from './career.js';
import * as WC from './wcareer.js';
import { Phone } from './phone.js';
import { Net, PROTO } from './net.js';
import { LiveryDesigner } from './liverydesigner.js';
import { loadCustomCar, customCarStatus } from './glbcar.js';
import { loadRoadCars } from './roadcar.js';
import { DriftHUD } from './drifthud.js';
import { CARS, CLASSES, CAR_CREDITS, carId, carOf, chassisKey } from './cars.js';
import { assets, liveryAssetIds } from './livery.js';
import { loadEnvCatalog, loadEnvModels, envCatalog } from './envlib.js';
import { setWorldOptions } from './world.js';
import { setVertexSnapEnabled, setJitterScale, setAffineAmount, setAffineCap, setAffineFade } from '../vendor/psx/src/PSXMaterial.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ---------------- settings ----------------
const DEFAULTS = {
  uiTheme: 'red', res: 'ps2', filter: 'soft', trails: true, scan: false, dither: true, retro: 'psx', palette: 128, psxMat: 'strong', crt: 'flat', grain: 'light', rays: true, fringe: true, shadows: true, look: 'arcade', units: 'kmh', gearbox: 'auto', tc: true,
  volume: 7, music: 5, camera: 'chase', racingLine: 'full', wear: 'normal', damage: 'normal', startTyre: 'auto', drift: 'off', aiChassis: 'class', rules: 'arcade', aiMistakes: 'normal', quali: 0, radarMap: 'satellite', radarZoom: 'normal', car: null, difficulty: 'medium', grid: 'back', team: 0, time: 'track', weather: 'track',
};
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('svgp.settings') || '{}') }; } catch (e) {}
settings.car = { ...DEFAULT_CAR, ...(settings.car || {}) };
if (settings.grain === true) settings.grain = 'medium'; else if (settings.grain === false) settings.grain = 'off';
document.documentElement.dataset.theme = settings.uiTheme; // (before the first screen, so the boot screen is already in your colours)
if (settings.team === 0 || settings.team === undefined) settings.team = 'garage';
// (new car classes: the AI now follows your class by default)
if (!settings.carsV) { if (settings.aiChassis === 'custom') settings.aiChassis = 'class'; settings.carsV = 1; }
// driver aids: old saves had one on/off 'tc' switch
if (!settings.aids) settings.aids = aidsOf(settings);
settings.ghost ??= 'best'; settings.vibration ??= 'normal'; settings.steerCurve ??= 'normal'; settings.deadzone ??= 'normal'; settings.steerSpeed ??= 'normal';
const applyPadFeel = () => { padFeel.curve = STEER_CURVES[settings.steerCurve] ?? 1.6; padFeel.dz = DEADZONES[settings.deadzone] ?? 0.12; padFeel.lag = STEER_LAGS[settings.steerSpeed] ?? 0.05; };
applyPadFeel();
const saveSettings = () => { try { localStorage.setItem('svgp.settings', JSON.stringify(settings)); } catch (e) {} };
if (!settings.lookV3) { settings.lookV2 = settings.lookV3 = true; settings.look = 'arcade'; applyLook('arcade'); saveSettings(); } // new pipeline: start on Arcade Sunset

// ---------------- renderer ----------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const post = new PS2Post(renderer);
function applyVideo() {
  post.configure({ crt: settings.crt, mode: settings.res, filter: settings.filter, scanlines: settings.scan, trails: settings.trails, retro: settings.retro, palette: settings.palette, grain: settings.grain, rays: settings.rays, fringe: settings.fringe, bypass: settings.look === 'off' });
  applyPsxMaterials(settings.psxMat);
  setWorldOptions({ shadows: settings.shadows });
  document.body.classList.toggle('no-scan', !settings.scan);
  document.documentElement.dataset.theme = settings.uiTheme; readThemeColours(); // (css/sv.css: the blue palette)
  setVolume(settings.volume / 10); setMusicVolume(settings.music / 10);
  hud.units = settings.units;
  hud.radarMap = settings.radarMap; hud.radarZoom = settings.radarZoom;
}
// the whole UI scales with the window (designed at 1400x820); the 3D view always fills it
function fitScreen() {
  const w = window.innerWidth, h = window.innerHeight;
  const ui = Math.max(0.5, Math.min(2.2, Math.min(w / 1400, h / 820)));
  document.documentElement.style.setProperty('--ui', ui.toFixed(3));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(w, h, false);
  post.resize();
}
window.addEventListener('resize', fitScreen);
// moving the window to a screen with a different pixel density
(function watchDpr() { const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`); mq.addEventListener('change', () => { fitScreen(); watchDpr(); }, { once: true }); })();
document.addEventListener('fullscreenchange', () => setTimeout(fitScreen, 50));
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

const hud = new HUD();
const driftHud = new DriftHUD(document.getElementById('hud'));
initInput();
fitScreen();

// ---------------- screens ----------------
let screen = null;
function show(id) {
  if (id === 's-main') buildMainMenu();
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  screen = id;
  canvas.style.display = id === 's-editor' ? 'none' : 'block';
  if (menus[id]) menus[id].forEach((m, k) => m.setActive(k === (focusIdx[id] || 0)));
  renderHints();
}
function fadeTo(fn, ms = 320) {
  const f = $('fade'); f.classList.add('on');
  setTimeout(() => { fn(); requestAnimationFrame(() => f.classList.remove('on')); }, ms);
}

// ---------------- button prompts (keyboard keys or pad buttons, whichever you used last) ----------------
const GLYPHS = {
  kb: { nav: '<kbd>&#8593;</kbd><kbd>&#8595;</kbd>', lr: '<kbd>&#8592;</kbd><kbd>&#8594;</kbd>', ok: '<kbd>Enter</kbd>', back: '<kbd>Esc</kbd>', tab: '<kbd>Q</kbd><kbd>E</kbd>', view: '<kbd>V</kbd>', scrub: '<kbd>Z</kbd><kbd>X</kbd>', cls: '<kbd>&#8593;</kbd><kbd>&#8595;</kbd>', phone: '<kbd>P</kbd>' },
  pad: { nav: '<kbd class="dpad"></kbd>', lr: '<kbd class="dpad h"></kbd>', ok: '<kbd class="pb a">A</kbd>', back: '<kbd class="pb b">B</kbd>', tab: '<kbd class="pl">LB</kbd><kbd class="pl">RB</kbd>', view: '<kbd class="pb y">Y</kbd>', scrub: '<kbd class="pl">LT</kbd><kbd class="pl">RT</kbd>', cls: '<kbd class="pl">LB</kbd><kbd class="pl">RB</kbd>', phone: '<kbd class="pb y">Y</kbd>' },
};
// per screen: [glyph, label] pairs; a function for screens whose prompts change
const HINTS = {
  's-main': [['nav', 'Navigate'], ['ok', 'Select']],
  's-setup': () => [['nav', 'Circuit'], ['ok', 'Choose circuit'], ['back', fromEditor ? 'Back to editor' : 'Back']],
  's-raceset': () => [['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select'], ['back', fromEditor ? 'Back to editor' : 'Circuits']],
  's-career': [['tab', 'Career type'], ['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select'], ['back', 'Back']],
  's-online': [['nav', 'Navigate'], ['ok', 'Select'], ['back', 'Back']],
  's-lobby': () => [['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select'], ['back', net && net.isHost ? 'Close room' : 'Leave room']],
  's-paddock': [['nav', 'Navigate'], ['ok', 'Select']],
  's-shop': [['nav', 'Navigate'], ['ok', 'Buy'], ['back', 'Back']],
  's-draft': [['lr', 'Choose'], ['ok', 'Take card']],
  's-round': [['ok', 'Continue']],
  's-garage': [['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select'], ['back', 'Save & back']],
  's-options': [['tab', 'Section'], ['nav', 'Navigate'], ['lr', 'Change'], ['back', 'Back']],
  's-help': [['tab', 'Page'], ['back', 'Back']],
  's-credits': [['nav', 'Scroll'], ['back', 'Back']],
  's-carsel': () => [['lr', 'Car'], ['cls', 'Class'], ['ok', 'Select car'], ...(raceReturn === 'setup' ? [['back', 'Back']] : [])],
  's-strat': () => [['nav', 'Navigate'], ['lr', 'Edit custom plan'], ['ok', sim && sim.net ? 'Lock in' : 'Confirm & race'], ...(sim && sim.pickedCar && !sim.net || raceReturn === 'setup' ? [['back', 'Back']] : [])],
  's-pause': [['nav', 'Navigate'], ['ok', 'Select'], ['back', 'Resume']],
  's-results': [['nav', 'Navigate'], ['ok', 'Select']],
};
function renderHints() {
  const el = document.querySelector(`#${screen} .footer-hints`); if (!el) return;
  let h = HINTS[screen]; if (typeof h === 'function') h = h();
  const G = GLYPHS[device.kind] || GLYPHS.kb;
  el.innerHTML = (h || []).map(([g, label]) => `<span class="hint${['ok', 'back', 'tab', 'view', 'phone'].includes(g) ? ' click' : ''}" data-g="${g}">${G[g]}<em>${label}</em></span>`).join('');
}
onDevice(() => renderHints());
// the prompts double as buttons for mouse players
document.addEventListener('click', (e) => {
  const h = e.target.closest('.footer-hints .hint.click'); if (!h) return;
  const g = h.dataset.g;
  if (g === 'back') { if (backs[screen]) backs[screen](); }
  else if (g === 'tab') { if (tabbers[screen]) tabbers[screen](1); else cycleFocus(1); }
  else if (g === 'view') { if (screen === 's-review') toggleReviewView(); }
  else if (g === 'phone') togglePhone();
  else if (g === 'ok') {
    if (screen === 's-draft') takeDraft(); else if (screen === 's-carsel') confirmCar();
    else { const l = menus[screen]; if (l) l[focusIdx[screen] || 0].activate(); }
  }
});

// ---------------- menu widget ----------------
// items: { label, action } buttons, { label, values: [[v, text]], get, set } choices, { label, head: true } section headings;
// any item may carry `desc` (shown in the screen's description bar while it's highlighted)
let lastMouse = '';
class Menu {
  constructor(el, items, opts = {}) { this.el = el; this.items = items; this.i = 0; this.opts = opts; this.active = true; this.descEl = opts.desc ? $(opts.desc) : null; this.render(); }
  setItems(items, keep = false) {
    if (keep) items.forEach((it, k) => { const o = this.items[k]; if (o && o.armed && o.label === it.label) it.armed = true; });
    this.items = items; if (!keep) this.i = 0; this.i = Math.max(0, Math.min(this.i, items.length - 1)); this.render(); }
  valText(it) { if (it.show) return it.show(); const v = it.get(); const o = it.values.find(x => x[0] === v); return o ? o[1] : v; }
  render() {
    this.items.forEach((it, k) => { if (k !== this.i) it.armed = false; });
    const cur = this.items[this.i];
    if (cur && (cur.disabled || cur.head)) { const n = this.items.findIndex((it, k) => k > this.i && !it.disabled && !it.head); if (n >= 0) this.i = n; }
    this.el.innerHTML = this.items.map((it, k) => {
      if (it.head) return `<div class="item head" data-k="${k}">${it.label}</div>`;
      const cls = ['item', it.values ? 'opt' : '', it.cls || '', k === this.i ? 'sel' : '', it.disabled ? 'disabled' : ''].join(' ');
      const val = it.values ? `<span class="val"><i class="arr" data-d="-1">&#8249;</i><span class="vt">${this.valText(it)}</span><i class="arr" data-d="1">&#8250;</i></span>` : '';
      const idesc = this.opts.inlineDesc && k === this.i && it.desc ? `<span class="idesc">${it.desc}</span>` : '';
      return `<div class="${cls}${it.armed ? ' armed' : ''}" data-k="${k}"><span class="lbl">${it.armed ? it.confirm : it.label}</span>${val}${idesc}</div>`;
    }).join('');
    this.el.classList.toggle('inactive', !this.active);
    this.el.querySelectorAll('.item:not(.head)').forEach(div => {
      const k = +div.dataset.k;
      // follow the mouse only when it really moves (not when the list re-renders under a resting pointer)
      div.addEventListener('mousemove', (e) => {
        const at = e.screenX + ',' + e.screenY; if (at === lastMouse) return; lastMouse = at;
        if (this.items[k].disabled) return;
        if (this.i !== k || !this.active) { this.focusMe(); this.i = k; this.render(); sfx.move(); this.opts.onMove && this.opts.onMove(this.items[k]); }
      });
      div.addEventListener('click', (e) => {
        const it = this.items[k]; if (it.disabled) return;
        if (this.i !== k || !this.active) { this.focusMe(); this.i = k; this.opts.onMove && this.opts.onMove(it); }
        if (it.values) { const a = e.target.closest('.arr'); this.change(a ? +a.dataset.d : 1); }
        else this.activate();
      });
    });
    const sel = this.el.querySelector('.sel');
    if (sel && this.el.scrollHeight > this.el.clientHeight + 2) sel.scrollIntoView({ block: 'nearest' });
    this.showDesc();
  }
  showDesc() { if (this.descEl && this.active) { const d = this.items[this.i]?.desc; this.descEl.innerHTML = d || ''; this.descEl.classList.toggle('on', !!d); } }
  focusMe() { const scr = this.el.closest('.screen').id; const list = menus[scr]; if (list) { focusIdx[scr] = list.indexOf(this); list.forEach(m => m.setActive(m === this)); } }
  setActive(a) { this.active = a; this.el.classList.toggle('inactive', !a); if (a) this.showDesc(); }
  move(d) {
    const n = this.items.length; if (!n) return;
    let i = this.i;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!this.items[i].disabled && !this.items[i].head) break; }
    this.i = i; sfx.move(); this.render();
    this.opts.onMove && this.opts.onMove(this.items[i]);
  }
  change(d) {
    const it = this.items[this.i]; if (!it || !it.values) return;
    const vals = it.values.map(v => v[0]);
    let k = vals.indexOf(it.get()); k = (k + d + vals.length) % vals.length;
    it.set(vals[k]); sfx.move(); this.render();
  }
  activate() {
    const it = this.items[this.i]; if (!it || it.disabled) return;
    if (it.values) return this.change(1);
    // destructive choices ask twice
    if (it.confirm && !it.armed) { it.armed = true; sfx.move(); this.render(); return; }
    it.armed = false;
    sfx.select(); it.action && it.action();
  }
}
const menus = {};
const focusIdx = {};
const backs = {};
const tabbers = {}; // screens with tabs: (dir) => switch tab
function cycleFocus(d) {
  const list = menus[screen]; if (!list || list.length < 2) return;
  focusIdx[screen] = ((focusIdx[screen] || 0) + d + list.length) % list.length;
  list.forEach((x, k) => x.setActive(k === focusIdx[screen])); sfx.move(); renderHints();
}
// a row of tabs (Options, How To Play): click them, or Q/E, LB/RB
function tabRow(el, names, cur, pick) {
  el.innerHTML = names.map((n, k) => `<span class="${k === cur ? 'on' : ''}" data-k="${k}">${n}</span>`).join('');
  el.querySelectorAll('span').forEach(s => s.onclick = () => { if (+s.dataset.k !== cur) { sfx.move(); pick(+s.dataset.k); } });
}

// ---------------- simulation ----------------
let sim = null;
let attractTrackIdx = Math.floor(Math.random() * 4);
function startAttract() {
  if (sim && sim.mode === 'attract') return;
  disposeSim();
  const presets = presetTracks();
  const t = cloneTrack(presets[attractTrackIdx++ % presets.length]);
  // dress the menu background like a real race: a generated setting at dusk (or night), clear skies
  const kinds = ['town', 'city', 'japan', 'industrial'], kind = kinds[Math.floor(Math.random() * kinds.length)];
  const theme = { town: 'grass', city: 'city', japan: 'city', industrial: 'grass' }[kind];
  t.env = { ...t.env, theme, runoff: THEMES[theme].runoff, barrier: THEMES[theme].barrier, time: Math.random() < 0.7 ? 'dusk' : 'night', weather: 'clear',
    setting: { kind, density: 0.8, height: 0.55, green: 0.5, furniture: 0.6, litter: 0.5, streetTrees: 0.5, life: 0.7, seed: 1 + Math.floor(Math.random() * 9999), models: true } };
  const want = attractTrackIdx;
  loadEnvModels().then(() => {
    if (want !== attractTrackIdx || sim) return; // (a race was started meanwhile: leave it alone)
    sim = new Race(t, { mode: 'attract', difficulty: 'hard', units: settings.units }, renderer);
  });
}
function disposeSim() { driftHud.hide(); if (sim) { sim.dispose(); sim = null; } }

// ---------------- boot ----------------
let booted = false;
function boot() {
  show('s-boot');
  setTimeout(() => { $('boot-legal').style.opacity = 0; }, 2200);
  setTimeout(() => { $('boot-legal').style.display = 'none'; $('boot-logo').classList.add('on'); }, 3000);
  setTimeout(() => { $('boot-press').classList.add('on'); }, 3800);
  const go = () => {
    if (booted) return; booted = true;
    initAudio(); applyVideo(); sfx.select();
    fadeTo(() => { startAttract(); show('s-main'); });
  };
  $('s-boot').addEventListener('click', go);
  backs['s-boot'] = go;
  bootGo = go;
}
let bootGo = null;

// ---------------- main menu ----------------
const MAIN_ITEMS = [
  { label: 'Quick Race', action: () => { fromEditor = false; openSetup(); }, desc: 'Any circuit, your rules. Race the AI or set a time trial.' },
  { label: 'Career', action: () => openCareer(), desc: 'A championship season with upgrades, perks and a Team Principal to keep happy. Or a straight Grand Prix.' },
  { label: 'Online', action: () => openOnline(), desc: 'Host a room or join a friend with a room code. Up to 8 drivers.' },
  { label: 'Garage', action: () => openGarage(), desc: 'Choose your car, build your F1 car and design its livery, helmet and suit.' },
  { label: 'Track Editor', action: () => openEditor(), desc: 'Draw your own circuit, even on a real map of your town, then race it.' },
  { label: 'Options', action: () => openOptions('s-main'), desc: 'Screen look, retro effects, driving aids, units and sound.', cls: 'gap' },
  { label: 'How To Play', action: () => fadeTo(() => { openHelp(0); }, 200), desc: 'Controls for keyboard and controller, and racing tips.' },
  { label: 'Credits', action: () => fadeTo(() => { fillCredits(); show('s-credits'); }, 200), desc: 'The artists and libraries behind the game.' },
];
// the highlighted entry's description sits right under it (see .main-menu .idesc)
menus['s-main'] = [new Menu($('m-main'), MAIN_ITEMS, { inlineDesc: true })];
// a saved championship goes straight to the top of the menu
function buildMainMenu() {
  const m = menus['s-main'][0], items = [];
  const last = WC.listWorlds()[0], wsave = last ? WC.loadWorld(last.id) : null;
  if (wsave) items.push({ label: 'Continue Career', cls: 'cont', desc: `${wsave.player.name} · ${wsave.year} ${WC.seriesById(wsave.player.series).name} · ${wsave.over ? 'season complete' : 'round ' + (wsave.round + 1) + ' of ' + wsave.opts.len}.`,
    action: () => { world = wsave; careerTab = 0; openHub(); } });
  for (const kind of ['career', 'gp']) {
    const run = CAREER.loadRun(kind);
    if (run && !run.over) items.push({ label: `Continue ${kind === 'gp' ? 'Grand Prix' : 'Challenge'}`, cls: 'cont',
      desc: `Round ${run.round + 1} of ${run.schedule.length}: ${run.schedule[run.round].name}.`, action: () => { career = run; fadeTo(() => { renderPaddock(); show('s-paddock'); }, 200); } });
  }
  // keep the highlighted entry, unless a saved run just appeared or went away (then offer to continue it)
  const selLabel = m.items[m.i]?.label, contKey = items.map(it => it.label + it.desc).join();
  m.setItems([...items, ...MAIN_ITEMS]);
  const k = m.items.findIndex(it => it.label === selLabel);
  m.i = contKey !== m.contKey ? 0 : k >= 0 ? k : 0; m.contKey = contKey; m.render();
  // your current car, bottom right (click it for the garage)
  const C = carOf(settings.car);
  $('main-car').innerHTML = `<small>YOUR CAR</small><b>${C.name}</b><span class="cls" style="--c:${CLASS_COL[C.cls] || '#2a7fd0'}">${CLASSES[C.cls].label}</span>${settings.playerName ? `<small class="drv">DRIVER &middot; ${settings.playerName}</small>` : ''}`;
}
$('main-car').onclick = () => { if (screen === 's-main') { sfx.select(); openGarage(); } };
backs['s-help'] = () => { sfx.back(); fadeTo(() => show('s-main'), 200); };
backs['s-credits'] = () => { sfx.back(); fadeTo(() => show('s-main'), 200); };
// how to play: tabbed pages
const HELP_PAGES = [['drive', 'Controls'], ['craft', 'Race Craft'], ['aids', 'Driver Aids'], ['flags', 'Flags & Rules'], ['editor', 'Track Editor'], ['career', 'Career'], ['online', 'Online']];
let helpPage = 0;
function openHelp(k) {
  helpPage = k;
  tabRow($('help-tabs'), HELP_PAGES.map(p => p[1]), k, openHelp);
  document.querySelectorAll('#s-help .help-page').forEach(el => el.hidden = el.dataset.page !== HELP_PAGES[k][0]);
  if (screen !== 's-help') show('s-help');
}
tabbers['s-help'] = (d) => { sfx.move(); openHelp((helpPage + d + HELP_PAGES.length) % HELP_PAGES.length); };
// scenery asset credits (the CC BY licences ask for attribution), straight from the baked catalogue
function fillCredits() {
  const c = envCatalog(), el = $('credits-list');
  const esc = (t) => String(t || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const packs = [...(c ? Object.values(c.packs) : []), ...Object.values(CAR_CREDITS), { title: 'PSX Mobile Phone', author: 'Retro Assets Library', license: 'see pack' },
    // the real-world circuits: layouts, buildings, trees, water from the map; hills from the terrain tiles
    ...(realTracks().length ? [{ title: 'Real-World Circuits: map data', author: 'OpenStreetMap contributors', license: 'ODbL 1.0' }, { title: 'Real-World Circuits: F1 outlines', author: 'bacinger/f1-circuits', license: 'MIT' }, { title: 'Real-World Circuits: elevation', author: 'AWS Terrain Tiles (Mapzen, USGS, SRTM)', license: 'see source' }] : [])];
  el.innerHTML = packs.length ? packs.sort((a, b) => a.title.localeCompare(b.title)).map(p => {
    const author = (p.author || '').replace(/\s*\(https?:[^)]*\)/, ''), lic = (p.license || '').replace(/\s*\(https?:[^)]*\)/, '').replace(/^CC-BY-?(.*)-4\.0$/, (m, x) => 'CC BY' + (x ? '-' + x : '') + ' 4.0').replace(/^CC-BY-4\.0$/, 'CC BY 4.0');
    return `<div><b>${esc(p.title)}</b><br>by ${esc(author)} <span>&middot; ${esc(lic)}</span></div>`;
  }).join('') : '';
}

// ---------------- garage ----------------
const garage = new Garage(renderer, post);
const PALETTE = [[0xc8141c, 'Racing Red'], [0xf2f2f2, 'White'], [0x121214, 'Black'], [0x1d4fb8, 'Azure'], [0x0e2a55, 'Navy'], [0x1c7a3a, 'Racing Green'],
  [0xa4e04a, 'Lime'], [0xf4c01a, 'Yellow'], [0xf07a2a, 'Orange'], [0x8d2bd8, 'Purple'], [0xff5ce1, 'Pink'], [0x3ef0ff, 'Cyan'], [0xb8bcc4, 'Silver'],
  [0xc9a23a, 'Gold'], [0x7a3b12, 'Bronze'], [0x2a2a30, 'Graphite']];
const colVals = PALETTE.map(([c, n]) => [c, `<span class="swatch" style="background:${hex(c)}"></span>${n}`]);
const SPONSORS = ['VOLTA', 'KOBRA', 'NEON FM', 'RAPID', 'BURGER DUCK', 'SUNSET', 'SVGP', 'MESA', 'BAYSIDE', 'PINE'];
// every car, grouped by class: [chassis key, label]
const CAR_CHOICES = Object.entries(CARS).map(([id, c]) => [id === 'f1' ? 'custom' : id, `${CLASSES[c.cls].short} · ${c.name}`]);
const part = (label, key, rebuild = true, desc = '') => ({ label, desc, values: Object.entries(PARTS[key]).map(([k, v]) => [k, v]), get: () => settings.car[key], set: v => { settings.car[key] = v; rebuild ? garage.setCar(settings.car) : garage.car.repaint(settings.car); } });
const paintOpt = (label, key, desc) => ({ label, desc, values: colVals, get: () => settings.car[key], set: v => { settings.car[key] = v; garage.setCar(settings.car); } });
const BODY_DESC = 'Bodywork parts. These swap on the SVGP Classic F1 car only.';
menus['s-garage'] = [new Menu($('m-garage'), [
  { label: 'Car', head: true, disabled: true },
  { label: 'Car', values: CAR_CHOICES, get: () => settings.car.chassis || 'custom', set: v => { settings.car.chassis = v; classicOnly(); garage.setCar(settings.car); },
    desc: 'The car you drive. You can also switch on the grid before every race. F1 cars and the M1 ProCar wear your livery; other cars keep their own paint.' },
  { label: 'Class', values: Object.entries(CLASSES).map(([k, c]) => [k, c.label]), get: () => carOf(settings.car).cls, set: () => {}, disabled: true },
  { label: 'Bodywork', head: true, disabled: true },
  part('Nose', 'nose', true, BODY_DESC), part('Front Wing', 'fwing', true, BODY_DESC), part('Sidepods', 'pods', true, BODY_DESC), part('Engine Cover', 'cover', true, BODY_DESC), part('Rear Wing', 'rwing', true, BODY_DESC), part('Halo', 'halo', true, BODY_DESC),
  part('Wheels', 'rims', true, BODY_DESC), part('Rim Colour', 'rimCol', true, 'Colour of the wheel rims.'),
  { label: 'Livery', head: true, disabled: true },
  { label: 'Livery Designer', cls: 'action', action: () => openLivery(), desc: 'Place decals (your own PNG or SVG too), design the helmet and suit, and save whole team liveries.' },
  part('Pattern', 'pattern', false, 'The paint pattern your three colours are laid out in.'), paintOpt('Main', 'main', 'The main body colour.'), paintOpt('Accent', 'accent', 'The second colour of the pattern.'), paintOpt('Detail', 'third', 'Stripes, pinstripes and small details.'),
  { label: 'Number', values: Array.from({ length: 99 }, (_, i) => [i + 1, String(i + 1)]), get: () => settings.car.number, set: v => { settings.car.number = v; garage.car.repaint(settings.car); }, desc: 'Your race number.' },
  { label: 'Sponsor', values: SPONSORS.map(s => [s, s]), get: () => settings.car.sponsor, set: v => { settings.car.sponsor = v; garage.car.repaint(settings.car); }, desc: 'The title sponsor sticker. Hide it, or the race numbers, in the Livery Designer.' },
], { desc: 'd-garage' })];
menus['s-garage'][0].i = 1;
// bodywork swaps only exist on the classic car; grey them out while your own model is selected
function classicOnly() {
  const custom = (settings.car.chassis || 'custom') !== 'svgp' && customCarStatus() === 'ready';
  const C = carOf(settings.car), road = C.cls !== 'f1';
  for (const it of menus['s-garage'][0].items) {
    if (['Nose', 'Front Wing', 'Sidepods', 'Engine Cover', 'Rear Wing', 'Halo', 'Wheels'].includes(it.label)) it.disabled = custom || road;
    // road cars keep their own paint job: only the main colour (on cars that can be repainted)
    if (['Livery Designer', 'Pattern', 'Accent', 'Detail', 'Number', 'Sponsor'].includes(it.label)) it.disabled = road && !C.livery;
    if (it.label === 'Rim Colour') it.disabled = road;
    if (it.label === 'Car') it.disabled = !!(garageSwap && world && world.car); // (World Career: the car you bought)
    if (it.label === 'Main') it.disabled = road && !C.paint;
  }
  menus['s-garage'][0].render();
}
function onGarageDoneOnline() {
  const car = { ...settings.car };
  if (net.isHost) { const p = me(); if (p) p.car = car; net.send({ t: 'assets', assets: assets.pick(liveryAssetIds(car)) }); hostBroadcast(); }
  else { net.send({ t: 'assets', assets: assets.pick(liveryAssetIds(car)) }); net.send({ t: 'update', car }); }
}
// livery designer (decals, helmet, suit, saved teams) over the garage turntable
const designer = new LiveryDesigner({
  garage,
  getCar: () => settings.car,
  setCar: (car, rebuild) => { if (rebuild || !garage.car) garage.setCar(car); else garage.car.repaint(car); saveSettingsSoon(); },
  onDone: () => { saveSettings(); show('s-garage'); menus['s-garage'][0].render(); },
});
let saveT = 0;
const saveSettingsSoon = () => { clearTimeout(saveT); saveT = setTimeout(saveSettings, 400); };
function openLivery() { fadeTo(() => { show('s-livery'); designer.open(); }, 200); }
assets.load(liveryAssetIds(settings.car));
function openGarage(from = 's-main') { garageReturn = from; fadeTo(() => { disposeSim(); show('s-garage'); garage.open(settings.car); classicOnly(); }); }
let garageReturn = 's-main';
backs['s-garage'] = () => { sfx.back(); saveSettings(); fadeTo(() => { garage.close(); if (garageReturn === 's-paddock') { renderPaddock(); show('s-paddock'); startAttract(); }
    else if (garageReturn === 's-hub' && world) { closeWorldGarage(); enterHub(); }
    else if (garageReturn === 's-lobby' && lobby) { onGarageDoneOnline(); startAttract(); renderLobby(); show('s-lobby'); } else { startAttract(); show('s-main'); } garageReturn = 's-main'; }); };

// ---------------- options ----------------
let optionsReturn = 's-main';
const onOff = [[true, 'ON'], [false, 'OFF']];
const LOOK_DESC = 'Changing this switches the look to Custom.';
const meter = (v, n = 10) => `<span class="meter" style="--n:${n}">${Array.from({ length: n }, (_, i) => `<i class="${i < v ? 'on' : ''}" style="--k:${i}"></i>`).join('')}</span>`;
const GRID_VALS = [['back', 'Back of grid'], ['random', 'Random'], ['pole', 'Pole position']];
const GRID_DESC = 'Where you start. With qualifying on, your qualifying lap decides it.';
// race weekends: what's in them, and how long the sessions run ([practice, qualifying] seconds)
const WEEKEND_VALS = [['race', 'Race only'], ['quali', 'Quali + Race'], ['full', 'Full weekend']];
const WEEKEND_DESC = 'What the weekend holds. <b>Full weekend</b>: practice, qualifying, then the race. <b>Qualifying</b> sets the grid; <b>Practice</b> first to learn the circuit and try tyres. Sessions start in your garage on a clear track, against the AI\'s times.';
const SESSION_LENS = { short: [600, 300], normal: [1200, 600], long: [1800, 900], full: [3600, 1200] }; // (the old presets)
const PRAC_VALS = [[600, '10 min'], [1200, '20 min'], [1800, '30 min'], [3600, '60 min']];
const QUALI_VALS = [[300, '5 min'], [600, '10 min'], [900, '15 min'], [1200, '20 min']];
const PRAC_DESC = 'How long practice runs. The clock keeps running while you\'re in the garage; skip ahead from there.';
const QUALI_DESC = 'How long qualifying runs. The clock keeps running while you\'re in the garage; skip ahead from there.';
// (the old Qualifying on / off setting carries over)
const wkFmt = () => settings.weekend ?? (settings.quali ? 'quali' : 'race');
// session lengths [practice, qualifying] in seconds (the old one-row preset carries over)
const wkPrac = () => settings.pracLen ?? SESSION_LENS[settings.sessLen ?? 'normal'][0];
const wkQuali = () => settings.qualiLen ?? SESSION_LENS[settings.sessLen ?? 'normal'][1];
// with a weekend on, the grid comes from qualifying: the Grid row says so and can't be changed (and with none, the
// session lengths don't apply)
function syncGridItem() {
  const m = menus['s-raceset'] && menus['s-raceset'][0]; if (!m) return;
  const on = wkFmt() !== 'race';
  const it = m.items.find(x => x.label === 'Grid');
  if (it) { it.disabled = on; it.values = on ? [['quali', 'From qualifying']] : GRID_VALS; }
  const pr = m.items.find(x => x.label === 'Practice'), ql = m.items.find(x => x.label === 'Qualifying');
  if (pr) { const use = wkFmt() === 'full'; pr.disabled = !use; pr.values = use ? PRAC_VALS : [[wkPrac(), '\u2014']]; }
  if (ql) { ql.disabled = !on; ql.values = on ? QUALI_VALS : [[wkQuali(), '\u2014']]; }
  m.render();
}
const RULES_VALS = [['off', 'Off'], ['arcade', 'Arcade'], ['realistic', 'Realistic']];
const RULES_DESC = 'Flags and penalties. <b>Arcade</b>: yellow flags, no passing under yellow, relaxed track limits: kerbs and a bit of run-off are fine, cutting corners isn\'t. <b>Realistic</b>: the white line is the limit, running wide counts too, and warnings run out sooner.';
const MISTAKE_VALS = [['off', 'Off'], ['normal', 'Normal'], ['frequent', 'Frequent']];
const MISTAKE_DESC = 'How often AI drivers brake too late, run wide or spin. Harder AI makes fewer mistakes.';
const rulesItem = (desc = '') => ({ label: 'Race Rules', values: RULES_VALS, get: () => settings.rules, set: v => { settings.rules = v; saveSettings(); }, desc: RULES_DESC + desc });
const mistakesItem = (desc = '') => ({ label: 'AI Mistakes', values: MISTAKE_VALS, get: () => settings.aiMistakes, set: v => { settings.aiMistakes = v; saveSettings(); }, desc: MISTAKE_DESC + desc });
// ---------------- driver aids + controller ----------------
// online, the host can limit the aids for a race (raceAidRule); everywhere else they're yours
let raceAidRule = 'any';
const aidsNow = () => limitAids(aidsOf(settings), raceAidRule);
const bonusNow = () => aidBonus(aidsNow(), settings.gearbox, settings.racingLine);
const bonusTxt = () => ` <span class="bonus-note">Career prize bonus with your settings: <b>+${bonusNow()}%</b></span>`;
const presetLabel = () => { const k = presetOf(settings); return k === 'custom' ? 'Custom' : PRESETS[k].label; };
// the lowest bonus you raced with counts: turning aids back on mid-race lowers it
function noteAidBonus() { if (sim && sim.player && sim.mode !== 'attract') sim.aidBonus = Math.min(sim.aidBonus ?? Infinity, bonusNow()); }
function aidsChanged() {
  saveSettings();
  if (sim && sim.player && sim.mode !== 'attract') { sim.setPlayerAids(aidsNow(), settings.gearbox); if (sim.lineMesh) sim.lineMode = settings.racingLine; noteAidBonus(); }
  for (const id of ['s-options', 's-raceset', 's-paddock']) menus[id]?.[0]?.render();
}
const lockedByHost = (k) => raceAidRule === 'sim' || (raceAidRule === 'noassist' && (k === 'brake' || k === 'steer'));
const presetItem = (extra = '') => ({ label: 'Driver Aids', values: PRESET_VALS.filter(v => v[0] !== 'custom'), show: presetLabel, get: () => presetOf(settings),
  set: v => { applyPreset(settings, v); aidsChanged(); },
  get desc() { const k = presetOf(settings); return (k === 'custom' ? 'Your own mix of aids.' : PRESETS[k].desc) + extra + bonusTxt(); } });
const aidItem = (k) => ({ label: AIDS[k].label, values: AIDS[k].values, get: () => aidsNow()[k], set: v => { settings.aids = { ...settings.aids, [k]: v }; aidsChanged(); },
  get disabled() { return lockedByHost(k); },
  get desc() { return AIDS[k].desc + (lockedByHost(k) ? ' <b>Set by the host for this race.</b>' : '') + bonusTxt(); } });
const lineItem = { label: 'Racing Line', values: [['full', 'Full'], ['brake', 'Braking only'], ['off', 'Off']], get: () => settings.racingLine, set: v => { settings.racingLine = v; aidsChanged(); },
  get desc() { return 'A guide line on the road that turns red where you should brake. Press L (or d-pad up) to toggle in a race.' + bonusTxt(); } };
const gearboxItem = { label: 'Gearbox', values: [['auto', 'Automatic'], ['manual', 'Manual']], get: () => settings.gearbox, set: v => { settings.gearbox = v; aidsChanged(); },
  get desc() { return 'Manual: shift with E / Q or RB / LB. The rev bar turns gold when it is time to shift.' + bonusTxt(); } };
const GHOST_VALS = [['best', 'Your Best'], ['ref', 'Reference'], ['off', 'Off']];
const GHOST_DESC = 'In time trial, practice and qualifying a see-through car drives a lap with you from the line: <b>Your Best</b> lap here in this car, or the Lap Review\'s <b>Reference</b>. It fades as you get close.';
const VIBES = { off: 0, low: 0.45, normal: 0.8, strong: 1.15 };
let vibeTestUntil = 0;
const OPTION_TABS = [
  ['Game', [
    { label: 'Volume', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => [v, v ? meter(v) : 'MUTE']), get: () => settings.volume, set: v => { settings.volume = v; applyVideo(); saveSettings(); }, desc: 'Master volume for engines, effects and menus.' },
    { label: 'Music', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => [v, v ? meter(v) : 'OFF']), get: () => settings.music, set: v => { settings.music = v; applyVideo(); saveSettings(); }, desc: 'Soundtrack volume. The eight tracks play in order and loop: fuller in the menus, quietly in the background on track.' },
    { label: 'Camera', values: [['chase', 'Chase'], ['far', 'Far Chase'], ['tcam', 'T-Cam'], ['bumper', 'Nose']], get: () => settings.camera, set: v => { settings.camera = v; saveSettings(); }, desc: 'The view you start races in. Press C (or Y) while driving to switch.' },
    { label: 'AI Cars', values: [['class', 'Same Class As You'], ['multi', 'All Classes Mixed'], ['custom', 'F1: Your Model'], ['mixed', 'F1: Mixed Models'], ['svgp', 'F1: SVGP Classic']], get: () => settings.aiChassis, set: v => { settings.aiChassis = v; saveSettings(); }, desc: 'Which cars your opponents drive.' },
    { label: 'Ghost Car', values: GHOST_VALS, get: () => settings.ghost, set: v => { settings.ghost = v; saveSettings(); if (sim && sim.setGhostMode) sim.setGhostMode(v); }, desc: GHOST_DESC },
    rulesItem(' Changes apply from the next race.'),
    mistakesItem(' Changes apply from the next race.'),
    { label: 'Speed Units', values: [['kmh', 'KM/H'], ['mph', 'MPH']], get: () => settings.units, set: v => { settings.units = v; applyVideo(); saveSettings(); }, desc: 'Speedometer units.' },
  ]],
  ['Aids', [
    presetItem(' Pick a preset, or set each aid below.'),
    ...AID_KEYS.map(aidItem),
    lineItem, gearboxItem,
  ]],
  ['Controller', [
    { label: 'Vibration', values: [['off', 'Off'], ['low', 'Low'], ['normal', 'Normal'], ['strong', 'Strong']], get: () => settings.vibration, set: v => { settings.vibration = v; saveSettings(); if (VIBES[v]) { vibeTestUntil = performance.now() + 300; rumble(0.6 * VIBES[v], 0.5 * VIBES[v]); } },
      desc: 'Feel the car through the pad: the tyres scrubbing when you understeer, the rear stepping out, wheelspin, lock-ups, ABS, kerbs and knocks. Needs a pad that rumbles (Xbox or PlayStation) in Chrome or Edge.' },
    { label: 'Steering Response', values: [['linear', 'Linear'], ['normal', 'Normal'], ['smooth', 'Soft Centre']], get: () => settings.steerCurve, set: v => { settings.steerCurve = v; applyPadFeel(); saveSettings(); },
      desc: 'How the stick maps to the wheels. <b>Linear</b>: half the stick is half the lock. <b>Soft Centre</b>: small movements do less, for fine control at speed.' },
    { label: 'Stick Deadzone', values: [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']], get: () => settings.deadzone, set: v => { settings.deadzone = v; applyPadFeel(); saveSettings(); },
      desc: 'How far the stick moves before the wheels turn. Go <b>Large</b> if the car drifts to one side on its own (a worn stick).' },
    { label: 'Steering Speed', values: [['quick', 'Quick'], ['normal', 'Normal'], ['smooth', 'Smooth']], get: () => settings.steerSpeed, set: v => { settings.steerSpeed = v; applyPadFeel(); saveSettings(); },
      desc: 'How fast the wheels follow the stick. <b>Smooth</b> takes the twitch out of quick thumb movements.' },
  ]],
  ['Display', [
    { label: 'UI Colour', values: [['red', 'Red'], ['blue', 'Blue']], get: () => settings.uiTheme, set: v => { settings.uiTheme = v; applyVideo(); saveSettings(); },
      desc: 'The colour of menus and the HUD. <b>Red</b>: red type with cyan accents. <b>Blue</b>: the other way round.' },
    { label: 'Screen Look', values: [['arcade', 'Arcade Sunset'], ['retro', 'RetroPass Palette'], ['crt', 'PS2 CRT'], ['film', 'Film'], ['light', 'Light (fast)'], ['off', 'Effects Off'], ['custom', 'Custom']], get: () => settings.look, set: v => { settings.look = v; applyLook(v); applyVideo(); saveSettings(); menus['s-options'][0].render(); }, desc: 'A preset for all the video settings at once. Pick <b>Light</b> if the game runs slowly.' },
    { label: 'Resolution', values: [['r240', 'PS1 240p'], ['r288', 'PS1 288p'], ['r360', 'Arcade 360p'], ['ps2', 'PS2 448p'], ['hd', 'HD 720p'], ['native', 'Native']], get: () => settings.res, set: v => { settings.res = v; settings.look = 'custom'; applyVideo(); saveSettings(); }, desc: 'The resolution the 3D view renders at. Lower is chunkier and faster. ' + LOOK_DESC },
    { label: 'Upscaling', values: [['sharp', 'Sharp pixels'], ['soft', 'Soft (CRT)']], get: () => settings.filter, set: v => { settings.filter = v; applyVideo(); saveSettings(); }, desc: 'How the low-resolution picture is stretched to your screen.' },
    { label: 'Fullscreen', values: [[false, 'OFF'], [true, 'ON']], get: () => !!document.fullscreenElement, set: () => toggleFullscreen(), desc: 'You can also press F at any time.' },
    { label: 'Minimap Map', values: [['satellite', 'Satellite'], ['streets', 'Streets'], ['off', 'Off']], get: () => settings.radarMap, set: v => { settings.radarMap = v; applyVideo(); saveSettings(); }, desc: 'The real-world map under the minimap, on circuits built on a map.' },
    { label: 'Minimap Zoom', values: [['near', 'Close'], ['normal', 'Normal'], ['far', 'Far'], ['vfar', 'Very Far']], get: () => settings.radarZoom, set: v => { settings.radarZoom = v; applyVideo(); saveSettings(); }, desc: 'Press M (or d-pad down) to change it while racing.' },
  ]],
  ['Retro FX', [
    { label: 'Retro Filter', values: [['psx', 'PSX Dither'], ['palette', 'RetroPass Palette'], ['off', 'Off']], get: () => settings.retro, set: v => { settings.retro = v; settings.look = 'custom'; applyVideo(); saveSettings(); }, desc: 'Colour dithering like a PlayStation, or a limited colour palette. ' + LOOK_DESC },
    { label: 'Palette Colours', values: [[64, '64'], [128, '128'], [256, '256']], get: () => settings.palette, set: v => { settings.palette = v; applyVideo(); saveSettings(); }, desc: 'How many colours the RetroPass palette uses.' },
    { label: 'PSX Materials', values: [['off', 'Off'], ['subtle', 'Subtle'], ['strong', 'Strong']], get: () => settings.psxMat, set: v => { settings.psxMat = v; settings.look = 'custom'; applyVideo(); saveSettings(); }, desc: 'Wobbly vertices and warping textures, like the original hardware. ' + LOOK_DESC },
    { label: 'CRT Filter', values: [['off', 'Off'], ['flat', 'Flat'], ['curved', 'Curved']], get: () => settings.crt, set: v => { settings.crt = v; settings.look = 'custom'; applyVideo(); saveSettings(); }, desc: 'Makes the picture look like an old TV. ' + LOOK_DESC },
    { label: 'Scanlines', values: onOff, get: () => settings.scan, set: v => { settings.scan = v; applyVideo(); saveSettings(); }, desc: 'Dark lines across the whole screen, menus included.' },
    { label: 'Shadows', values: onOff, get: () => settings.shadows, set: v => { settings.shadows = v; applyVideo(); saveSettings(); }, desc: 'Real-time shadows. Turn off for speed.' },
    { label: 'Light Shafts', values: onOff, get: () => settings.rays, set: v => { settings.rays = v; applyVideo(); saveSettings(); }, desc: 'Sun rays through buildings and trees.' },
    { label: 'Trails FX', values: onOff, get: () => settings.trails, set: v => { settings.trails = v; applyVideo(); saveSettings(); }, desc: 'Motion trails at speed.' },
    { label: 'Film Grain', values: [['off', 'Off'], ['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy']], get: () => settings.grain, set: v => { settings.grain = v; settings.look = 'custom'; applyVideo(); saveSettings(); }, desc: 'Noise over the picture. ' + LOOK_DESC },
    { label: 'Colour Fringe', values: onOff, get: () => settings.fringe, set: v => { settings.fringe = v; settings.look = 'custom'; applyVideo(); saveSettings(); }, desc: 'Coloured edges towards the corners of the screen. ' + LOOK_DESC },
  ]],
];
let optTab = 0;
menus['s-options'] = [new Menu($('m-options'), [], { desc: 'd-options' })];
function setOptTab(k) {
  optTab = k;
  tabRow($('opt-tabs'), OPTION_TABS.map(t => t[0]), k, setOptTab);
  menus['s-options'][0].setItems(OPTION_TABS[k][1]);
}
tabbers['s-options'] = (d) => { sfx.move(); setOptTab((optTab + d + OPTION_TABS.length) % OPTION_TABS.length); };
// Screen Look presets: set several video options at once
function applyLook(v) {
  const L = {
    arcade: { res: 'ps2', crt: 'flat', filter: 'soft', scan: false, retro: 'psx', palette: 128, grain: 'light', fringe: true, psxMat: 'strong', rays: true, shadows: true, trails: true },
    retro: { res: 'r288', crt: 'off',  filter: 'sharp', scan: false, retro: 'palette', palette: 128, grain: 'off', fringe: false, psxMat: 'subtle', rays: true, shadows: true },
    crt: { crt: 'flat', res: 'ps2', filter: 'soft', scan: true, retro: 'psx', grain: 'off', fringe: false, psxMat: 'off' },
    film: { res: 'hd', crt: 'off',  filter: 'soft', scan: false, retro: 'off', grain: 'medium', fringe: true, psxMat: 'off' },
    light: { res: 'r288', crt: 'off',  filter: 'sharp', scan: false, retro: 'psx', grain: 'off', fringe: false, psxMat: 'subtle', rays: false, shadows: false, trails: false },
    off: { res: 'native', crt: 'off',  filter: 'sharp', scan: false, retro: 'off', grain: 'off', fringe: false, psxMat: 'off' },
  }[v];
  if (L) Object.assign(settings, L);
}
// PSX vertex snapping + affine texture warping (vendor/psx) on the world's materials
function applyPsxMaterials(v) {
  const on = v !== 'off', strong = v === 'strong';
  setVertexSnapEnabled(on); setJitterScale(strong ? 2 : 1);
  setAffineAmount(on ? (strong ? 0.9 : 0.45) : 0); setAffineCap(strong ? 0.14 : 0.06); setAffineFade(strong ? 4 : 9);
}
function openOptions(from) { optionsReturn = from; setOptTab(optTab); if (from === 's-pause') show('s-options'); else fadeTo(() => show('s-options'), 200); }
backs['s-options'] = () => { sfx.back(); if (optionsReturn === 's-pause') show('s-pause'); else fadeTo(() => show(optionsReturn), 200); };

// ---------------- race setup ----------------
let setupTracks = [];
let setupSel = 0;
let editorTrack = null;
let fromEditor = false; // Quick Race opened with the editor's Race It: every exit leads back there
let raceCfg = { laps: 3, opponents: 7 };
function savedTracks() { try { return JSON.parse(localStorage.getItem('svgp.tracks')) || []; } catch (e) { return []; } }
function bestLaps() { try { return JSON.parse(localStorage.getItem('svgp.best')) || {}; } catch (e) { return {}; } }

// Quick Race is two pages: pick a circuit (a picture of it + the live track behind the menu), then the rules
const TAGS = { EDITOR: 'From the editor', PRESET: 'Built-in circuit', SAVED: 'One of your circuits', REAL: 'Real-world circuit' };
function openSetup(track = null, { select = null, toSettings = false } = {}) {
  setupTracks = [];
  if (track) setupTracks.push({ t: track, tag: 'EDITOR' });
  realTracks().forEach(t => setupTracks.push({ t, tag: 'REAL' }));
  presetTracks().forEach(t => setupTracks.push({ t, tag: 'PRESET' }));
  savedTracks().forEach(t => setupTracks.push({ t, tag: 'SAVED' }));
  const list = menus['s-setup'][0];
  // real-world circuits and the originals each get a heading (only once there's more than one kind)
  const heads = { REAL: 'Real-World Circuits', PRESET: 'San Velocita Originals', SAVED: 'Your Circuits' }, items = [];
  const many = new Set(setupTracks.map(e => e.tag === 'EDITOR' ? 'PRESET' : e.tag)).size > 1;
  setupTracks.forEach((e, k) => {
    if (many && heads[e.tag] && (k === 0 || setupTracks[k - 1].tag !== e.tag)) items.push({ head: true, label: heads[e.tag] });
    items.push({ label: `${e.t.name}<small class="tag ${e.tag.toLowerCase()}">${e.tag === 'PRESET' || e.tag === 'REAL' ? (e.t.real ? e.t.real.country : '') : e.tag}</small>`, k, action: () => openRaceSettings() });
  });
  list.setItems(items);
  const k = Math.max(0, select ? setupTracks.findIndex(e => e.t.name === select) : 0);
  list.i = Math.max(0, items.findIndex(it => it.k === k)); list.render();
  selectSetupTrack(k);
  fadeTo(() => { if (!sim) startAttract(); if (toSettings) openRaceSettings(true); else show('s-setup'); }, 200);
}
function selectSetupTrack(k) {
  setupSel = k;
  const t = setupTracks[k].t;
  raceCfg.laps = t.env.laps || 3;
  raceCfg.opponents = t.env.opponents ?? 7;
  renderPick(t);
}
// the picker shows every circuit in its best light: dusk (or its own night), in its own weather
const pickConditions = (t) => ({ time: t.env.time === 'night' ? 'night' : 'dusk', weather: t.env.weather || 'clear' });
// the conditions you'll actually race in
const raceConditions = (t) => ({ time: settings.time === 'track' ? t.env.time : settings.time, weather: settings.weather === 'track' ? t.env.weather : settings.weather });
function trackCard(t, st, cond) {
  const best = bestLaps()[t.name];
  const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  return `<div class="ti-chips"><span>${THEMES[t.env.theme].label}</span><span>${st.open ? 'Point-to-point' : 'Circuit'}</span><span class="wx-chip">${cond.time} &middot; ${cond.weather}</span></div>
    <div class="ti-grid four">${cell('Length', (st.length / 1000).toFixed(2) + ' km')}${cell('Corners', st.turns)}${cell('Elevation', (st.elevMax - st.elevMin).toFixed(0) + ' m')}${cell('Best lap', best ? fmtTime(best, 3) : '&mdash;')}</div>`;
}
function renderPick(t) {
  const T = sampleTrack(t), st = trackStats(T), cond = pickConditions(t), card = $('pick-card');
  card.querySelector('.pc-name').textContent = t.name;
  card.querySelector('.pc-sub').textContent = `${TAGS[setupTracks[setupSel].tag]} · ${t.real ? t.real.country : THEMES[t.env.theme].label}`;
  drawTrackMap(T, card.querySelector('.pc-map'));
  $('pick-stats').innerHTML = trackCard(t, st, { time: t.env.time, weather: t.env.weather });
  showPostcard(card, t, cond);
}
function openRaceSettings(instant = false) {
  const t = setupTracks[setupSel].t;
  $('rs-sub').textContent = t.name;
  menus['s-raceset'][0].i = menus['s-raceset'][0].items.findIndex(it => it.cls && it.cls.includes('primary'));
  menus['s-raceset'][0].render();
  renderRaceSetInfo();
  const go = () => show('s-raceset');
  if (instant) go(); else { sfx.select(); fadeTo(go, 180); }
}
function renderRaceSetInfo() {
  const t = setupTracks[setupSel].t, T = sampleTrack(t), card = $('rs-card');
  drawTrackMap(T, card.querySelector('.pc-map'));
  showPostcard(card.querySelector('.postcard'), t, pickConditions(t), false);
  card.querySelector('.rs-info').innerHTML = `<div class="ti-name">${t.name}</div>` + trackCard(t, trackStats(T), raceConditions(t));
}
// conditions changed on the settings page: show them
function conditionsChanged() { renderRaceSetInfo(); }

// the circuit's outline, for laying over pictures
function drawTrackMap(T, cv) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  c.clearRect(0, 0, W, H);
  let a = Infinity, b = -Infinity, e = Infinity, f = -Infinity;
  for (let i = 0; i < T.N; i++) { a = Math.min(a, T.X[i]); b = Math.max(b, T.X[i]); e = Math.min(e, T.Z[i]); f = Math.max(f, T.Z[i]); }
  const s = Math.min((W - 30) / (b - a), (H - 30) / (f - e));
  const X = (i) => (T.X[i] - (a + b) / 2) * s + W / 2, Y = (i) => (T.Z[i] - (e + f) / 2) * s + H / 2;
  const pth = () => { c.beginPath(); for (let i = 0; i <= T.N; i++) { const k = T.open ? (T.cut + 1 + Math.min(i, T.N - 1)) % T.N : i % T.N; i ? c.lineTo(X(k), Y(k)) : c.moveTo(X(k), Y(k)); } };
  c.lineJoin = c.lineCap = 'round';
  pth(); c.strokeStyle = 'rgba(0,0,0,.75)'; c.lineWidth = 10; c.stroke();
  pth(); c.shadowColor = 'rgba(255,214,107,.8)'; c.shadowBlur = 10; c.strokeStyle = '#fff4d6'; c.lineWidth = 4; c.stroke(); c.shadowBlur = 0;
  const dot = (i, col) => { c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(X(i), Y(i), 5.5, 0, 7); c.fill(); c.stroke(); };
  dot(0, '#6ae04a'); if (T.open) dot(T.finish, '#ff5a4a');
}

// ---- track previews: the live background becomes the chosen circuit, and a still of it is kept as its postcard ----
const pcKey = (t, cond) => { let h = 2166136261; const { time, weather, ...env } = t.env || {}; const str = JSON.stringify({ ...t, env }) + cond.time + cond.weather; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return 'v2' + (h >>> 0).toString(36); }; // (v2: pictures without cars)
const postcards = new Map(); // key -> jpeg data url (also kept in IndexedDB between sessions)
const pcStore = (() => {
  let db = null;
  const open = () => db || (db = new Promise((res, rej) => { const r = indexedDB.open('svgp-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  return {
    get: (k) => open().then(d => new Promise(res => { const q = d.transaction('kv').objectStore('kv').get('pc:' + k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); })).catch(() => null),
    set: (k, v) => open().then(d => { d.transaction('kv', 'readwrite').objectStore('kv').put(v, 'pc:' + k); }).catch(() => {}),
  };
})();
async function getPostcard(key) {
  if (postcards.has(key)) return postcards.get(key);
  const v = await pcStore.get(key); if (v) postcards.set(key, v); return v;
}
// fill a .postcard frame: the painted title card straight away, the real picture when we have one.
// A circuit without a picture gets one once you rest on it (built from the scenery alone, then saved for good).
let developT = 0;
function showPostcard(card, t, cond, develop = true) {
  const key = pcKey(t, cond), img = card.querySelector('.pc-img');
  card.dataset.key = key;
  card.classList.remove('developing');
  clearTimeout(developT);
  drawLoadArt(t, card.querySelector('.pc-art'), cond.time);
  const put = (v) => { if (card.dataset.key !== key) return; img.src = v; img.classList.add('on'); };
  const cached = postcards.get(key);
  if (cached) { put(cached); return; }
  img.classList.remove('on');
  getPostcard(key).then(v => {
    if (v) return put(v);
    if (!develop || card.dataset.key !== key) return;
    developT = setTimeout(() => {
      if (card.dataset.key !== key || screen !== 's-setup') return;
      card.classList.add('developing');
      // let the "developing" frame paint (its animation keeps running on the compositor while we work)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (card.dataset.key !== key || screen !== 's-setup') { card.classList.remove('developing'); return; }
        loadEnvModels().then(() => needsHydrate(t) ? hydrateReal(cloneTrack(t)).catch(() => t) : t).then((tt) => {
          if (card.dataset.key !== key) { card.classList.remove('developing'); return; }
          const url = capturePostcard(tt, cond, key);
          card.classList.remove('developing');
          if (url) put(url);
        });
      }));
    }, 650);
  });
}
// a composed shot from behind the start line, looking up the track: the world alone, no cars
function capturePostcard(t, cond, key) {
  const tt = cloneTrack(t); tt.env.time = cond.time; tt.env.weather = cond.weather;
  let S = null, url = null;
  try {
    S = buildScenery(tt);
    const T = S.T, idx = (k) => ((k % T.N) + T.N) % T.N;
    const i = idx(Math.round(-70 / T.ds)), j = idx(Math.round(40 / T.ds));
    const x = T.X[i] + T.RX[i] * 6, z = T.Z[i] + T.RZ[i] * 6;
    const y = Math.max(T.Y[i], S.world.groundHeight(x, z)) + 6.5;
    const cam = new THREE.PerspectiveCamera(52, renderer.domElement.width / renderer.domElement.height, 0.3, 5000);
    cam.position.set(x, y, z); cam.lookAt(T.X[j] - T.RX[j] * 2, T.Y[j] + 2.5, T.Z[j] - T.RZ[j] * 2);
    S.scene.add(cam);
    for (let k = 0; k < 3; k++) { S.world.update(0.016, cam, [], []); post.render(S.scene, cam, { trails: 0, grade: S.world.P.grade, look: S.world.P.look }); }
    const src = renderer.domElement, W = 640, H = 360, out = document.createElement('canvas'); out.width = W; out.height = H;
    const sw = Math.min(src.width, src.height * 16 / 9), sh = sw * 9 / 16;
    out.getContext('2d').drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
    url = out.toDataURL('image/jpeg', 0.84);
  } catch (e) { console.warn('postcard', e); }
  if (S) S.dispose();
  if (sim) sim.render(post, settings); // put the menu background straight back
  if (url) { postcards.set(key, url); pcStore.set(key, url); }
  return url;
}

const teamVals = [['garage', '<span class="swatch" style="background:#e8b13a"></span>My Car (Garage)'], ...TEAMS.map((t, i) => [i, `<span class="swatch" style="background:${hex(t.main)}"></span>${t.name}`])];
menus['s-setup'] = [new Menu($('m-tracks'), [], { onMove: (it) => selectSetupTrack(it.k) })];
menus['s-raceset'] = [
  new Menu($('m-setup'), [
    { label: 'Race', head: true },
    { label: 'Laps', values: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50].map(v => [v, String(v)]), get: () => raceCfg.laps, set: v => raceCfg.laps = v, desc: 'Race distance. Long races bring tyre wear and pit strategy into play.' },
    { label: 'Opponents', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(v => [v, String(v)]), get: () => raceCfg.opponents, set: v => raceCfg.opponents = v, desc: 'How many AI cars you race against.' },
    { label: 'Difficulty', values: [['easy', 'Rookie'], ['medium', 'Pro'], ['hard', 'Legend'], ['alien', 'Alien']], get: () => settings.difficulty, set: v => { settings.difficulty = v; saveSettings(); }, desc: 'How fast the AI is. <b>Rookie</b> to learn a circuit, <b>Alien</b> if you never make a mistake. In the road and GT classes the <b>Legend</b> and <b>Alien</b> cars get a little extra grip and power.' },
    { label: 'Weekend', values: WEEKEND_VALS, get: wkFmt, set: v => { settings.weekend = v; saveSettings(); syncGridItem(); }, desc: WEEKEND_DESC },
    { label: 'Practice', values: PRAC_VALS, get: wkPrac, set: v => { settings.pracLen = v; saveSettings(); }, desc: PRAC_DESC },
    { label: 'Qualifying', values: QUALI_VALS, get: wkQuali, set: v => { settings.qualiLen = v; saveSettings(); }, desc: QUALI_DESC },
    { label: 'Grid', values: GRID_VALS, get: () => wkFmt() !== 'race' ? 'quali' : settings.grid, set: v => { if (v !== 'quali') { settings.grid = v; saveSettings(); } }, desc: GRID_DESC },
    { label: 'Conditions', head: true },
    { label: 'Time', values: [['track', 'Track default'], ['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], get: () => settings.time, set: v => { settings.time = v; saveSettings(); conditionsChanged(); }, desc: 'Time of day. Track default uses what the circuit was designed with.' },
    { label: 'Weather', values: [['track', 'Track default'], ['clear', 'Clear'], ['overcast', 'Overcast'], ['rain', 'Rain'], ['fog', 'Fog']], get: () => settings.weather, set: v => { settings.weather = v; saveSettings(); conditionsChanged(); }, desc: 'Rain costs around 18% grip: brake earlier and use wet tyres.' },
    { label: 'Rules', head: true },
    { label: 'Team', values: teamVals, get: () => settings.team, set: v => { settings.team = v; saveSettings(); }, desc: 'Race in your own Garage livery or in one of the teams\' colours.' },
    presetItem(' Set each aid in Options > Aids.'),
    { label: 'Tyre Wear', values: [['off', 'Off'], ['normal', 'Normal'], ['fast', 'Fast (x2.5)']], get: () => settings.wear, set: v => { settings.wear = v; saveSettings(); }, desc: 'Tyres lose grip as they wear. Fast wear makes pit stops matter in short races.' },
    { label: 'Damage', values: [['off', 'Off'], ['normal', 'Normal'], ['high', 'Realistic']], get: () => settings.damage, set: v => { settings.damage = v; saveSettings(); }, desc: 'Contact breaks wings and chassis, costing grip and speed until you pit.' },
    rulesItem(), mistakesItem(),
    { label: 'Start Tyre', values: [['auto', 'Auto'], ['soft', 'Soft'], ['medium', 'Medium'], ['hard', 'Hard'], ['wet', 'Wet']], get: () => settings.startTyre, set: v => { settings.startTyre = v; saveSettings(); }, desc: 'The compound you start on. Auto picks the best one for the conditions.' },
    { label: 'Drift Points', values: [['off', 'Off'], ['on', 'On']], get: () => settings.drift, set: v => { settings.drift = v; saveSettings(); }, desc: 'Score points for sliding road and GT cars. Records are kept per circuit.' },
    { label: 'Start Race', cls: 'action primary', action: () => launch('race'), desc: 'Load the circuit. You choose your car on the grid.' },
    { label: 'Time Trial', cls: 'action', action: () => launch('test'), desc: 'Just you and the clock. Your best lap on every circuit is saved.' },
  ], { desc: 'd-setup' }),
];
backs['s-setup'] = () => { sfx.back(); clearTimeout(developT); if (fromEditor) backToEditor(); else fadeTo(() => show('s-main'), 200); };
syncGridItem();
backs['s-raceset'] = () => { sfx.back(); if (fromEditor) return backToEditor(); fadeTo(() => { show('s-setup'); renderPick(setupTracks[setupSel].t); }, 180); };

function launch(mode) {
  const t = cloneTrack(setupTracks[setupSel].t);
  if (settings.time !== 'track') t.env.time = settings.time;
  if (settings.weather !== 'track') t.env.weather = settings.weather;
  const race = { mode, laps: raceCfg.laps, opponents: raceCfg.opponents, pick: true };
  if (mode === 'race' && wkFmt() !== 'race' && raceCfg.opponents > 0) return startWeekend(t, race, 'setup', wkFmt(), [wkPrac(), wkQuali()]);
  weekend = null;
  startRace(t, race, 'setup');
}

// ---------------- race weekend: (practice,) qualifying, then the race on the grid it set ----------------
// weekend: { track, race (the race's startRace cfg), ret, format 'quali' | 'full', len [practice, quali] s, stage,
//            car / roster / aiSetup once the first session has run (the same car and the same field all weekend) }
let weekend = null;
function startWeekend(track, race, ret, format, len) {
  weekend = { track: cloneTrack(track), race, ret, format, len };
  startSession(format === 'full' ? 'practice' : 'quali', true);
}
function startSession(kind, first = false) {
  const w = weekend; w.stage = kind;
  const extra = { ...(w.race.extra || {}), ...(w.car ? { car: w.car } : {}), ...(w.roster ? { roster: w.roster, aiSetup: w.aiSetup } : {}) };
  startRace(w.track, { ...w.race, mode: kind, practiceTime: w.len[0], qualiTime: w.len[1], pick: first && w.race.pick, extra }, w.ret);
}
// what the next session keeps from this one
function keepWeekend() {
  const g = sim.qualiGrid();
  weekend.car = { ...sim.opts.car }; weekend.roster = g.roster; weekend.aiSetup = g.aiSetup;
}
const SESSION_NAME = { practice: 'Practice', quali: 'Qualifying' };
function showQualiResults() {
  if (!sim || !sim.quali) return;
  useSession();
  if (!weekend) weekend = { track: cloneTrack(lastRace.track), race: { ...lastRace.cfg, mode: 'race' }, ret: lastRace.ret, format: 'quali', len: [1200, sim.quali.time], stage: 'quali' };
  pitGarage.close();
  const kind = sim.quali.kind, practice = kind === 'practice';
  const rows = sim.qualiRows(), me = rows.find(r => r.isPlayer), n = rows.length;
  sim.setPaused(true);
  $('results-title').textContent = SESSION_NAME[kind];
  $('results-sub').textContent = `${sim.track.name} · ${Math.round(sim.quali.time / 60)} minute session · ${practice ? 'qualifying next' : 'grid for the race'}`;
  $('results-table').innerHTML = `<tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th class="r">BEST LAP</th><th class="r">GAP</th></tr>` + rows.map(r =>
    `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${posBadge(r.pos)}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.name}</td><td>${r.team}</td><td class="t">${isFinite(r.best) ? fmtTime(r.best, 3) : 'NO TIME'}</td><td class="t">${r.pos === 1 || !isFinite(r.best) ? '' : '+' + r.gap.toFixed(3)}</td></tr>`).join('');
  const row = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
  const p = me.pos, o = ['TH', 'ST', 'ND', 'RD'][(p % 100 - 20) % 10] || ['TH', 'ST', 'ND', 'RD'][p % 100] || 'TH';
  const tag = !isFinite(me.best) ? 'NO TIME SET' : practice ? (p === 1 ? 'FASTEST IN PRACTICE' : 'IN PRACTICE') : p === 1 ? 'POLE POSITION' : 'ON THE GRID';
  $('result-card').innerHTML = `<div class="big-pos ${p === 1 ? 'gold' : p <= 3 ? 'podium' : ''}">${p}<sup>${o}</sup><small>${tag}</small></div>`
    + row('Best lap', isFinite(me.best) ? fmtTime(me.best, 3) : '&mdash;')
    + row(practice ? 'Gap to fastest' : 'Gap to pole', p === 1 || !isFinite(me.best) ? '&mdash;' : '+' + me.gap.toFixed(3))
    + row(practice ? 'Next' : 'Race', practice ? `Qualifying &middot; ${Math.round(weekend.len[1] / 60)} min` : `${weekend.race.laps} lap${weekend.race.laps === 1 ? '' : 's'} &middot; ${n} cars`);
  const toRace = () => {
    const w = weekend, g = sim.qualiGrid();
    startRace(w.track, { ...w.race, mode: 'race', pick: false, fromQuali: true, extra: { ...(w.race.extra || {}), ...g, car: { ...sim.opts.car } } }, w.ret);
  };
  const items = practice
    ? [{ label: 'Continue To Qualifying', cls: 'action primary', action: () => { keepWeekend(); startSession('quali'); }, desc: 'Same car, same field: now it counts.' }]
    : [{ label: 'Start The Race', cls: 'action primary', action: toRace, desc: 'Line up on the grid you just set.' }];
  if (weekend.ret !== 'career' && weekend.ret !== 'world') items.push(
    { label: practice ? 'Practice Again' : 'Qualify Again', action: () => { keepWeekend(); startSession(kind); }, desc: 'Another go at the session.' },
    { label: 'Main Menu', action: () => { weekend = null; quitToMenu(); } });
  show('s-results');
  const m = menus['s-results'][0]; m.setItems(items); m.i = 0; m.render();
}

// ---------------- World Career: what a weekend uses (the bill: WC.settleRound) ----------------
// Every session starts on a fresh set; new sets in the garage, tyre stops and repairs add to it; fuel is billed by the lap.
let wkUse = null;
const wkOn = () => raceReturn === 'world' && wkUse && world && world.money;
const dmgOf = (d) => (d.fw + d.rw + d.ch) / 3; // (0..1: all three parts written off)
// a session is over: add up what it used (once per session)
function useSession() {
  if (!wkOn() || !sim || !sim.player || wkUse.seen === sim) return;
  const pl = sim.player; wkUse.seen = sim;
  wkUse.laps += pl.lapTimes.length;
  wkUse.sets += 1 + (sim.mode === 'race' ? pl.pits : 0);
  wkUse.damage += sim.mode === 'race' ? Math.max(dmgOf(pl.phys.dmg), (pl.maxDmg || 0) / 3) : dmgOf(pl.phys.dmg);
}
// spent so far this weekend (tyres, fuel, repairs; the session in progress included)
function wkSpend() {
  const c = WC.COSTS[world.player.series], pl = sim && sim.player, live = pl && wkUse.seen !== sim;
  const sets = wkUse.sets + (live ? 1 : 0), laps = wkUse.laps + (live ? pl.lapTimes.length : 0), dmg = wkUse.damage + (live ? dmgOf(pl.phys.dmg) : 0);
  return sets * c.tyre + laps * c.fuelLap + Math.round(dmg * c.repair / 100) * 100;
}

// ---------------- the pit garage (practice / qualifying) ----------------
// your box: go out on a flying lap or down the pit lane, pick tyres, watch the timing, skip ahead. The session goes on.
const pitGarage = new PitGarage(renderer, post);
let pgTyre = 'keep', pgInfoT = 0, pgTiming = false, pgSkipLbl = '', pgBusy = false, pgWorkKey = '';
const PG_TYRE_COL = { soft: '#e0302a', medium: '#f2d22a', hard: '#f0f0f0', wet: '#3a8af0' };
const capit = (c) => c[0].toUpperCase() + c.slice(1);
const tyreDot = (c) => `<span class="tyre-dot" style="background:${PG_TYRE_COL[c]}"></span>`;
const mmss = (t) => { t = Math.round(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
// the tyres row: keep the set on the car, or a new set of any compound
function pgTyreVals() {
  const t = sim.player.phys.tyre, wear = Math.round(Math.min(t.wf, t.wr) * 100);
  return [['keep', `${tyreDot(t.c)}Current ${wear}%`], ...['soft', 'medium', 'hard', 'wet'].map(c => [c, `${tyreDot(c)}New ${capit(c)}`])];
}
function openPitGarage() {
  if (!sim || !sim.quali || !sim.player) return;
  const pl = sim.player;
  pgTyre = 'keep'; pgBusy = false; $('pg-work').hidden = true;
  pitGarage.open(pl.model.cfg || sim.opts.car, pl.team, pl.phys.tyre.c, pl.phys.dmg);
  pgTiming = false; $('pg-timing').hidden = true; $('pg-car').hidden = false;
  $('pg-title').textContent = SESSION_NAME[sim.quali.kind];
  $('pg-sub').textContent = `${sim.track.name} · your garage`;
  renderGarageMenu(); renderGarageInfo();
  show('s-pitgarage');
}
function renderGarageMenu() {
  const q = sim.quali, quick = raceReturn !== 'career' && raceReturn !== 'world';
  pgSkipLbl = q.left > 330 ? 'Skip 5 Minutes' : 'Skip To The End';
  const items = [
    { label: 'Flying Lap', cls: 'action primary', action: () => goOut('flying'), desc: 'Straight onto a flying lap: the clock starts at the line.' },
    ...(sim.pit ? [{ label: 'Drive Out', cls: 'action', action: () => goOut('drive'), desc: 'Down the pit lane and an out lap first, to get the tyres going.' }] : []),
    { label: 'Tyres', values: pgTyreVals(), get: () => pgTyre, set: v => { pgTyre = v; pitGarage.setTyre(v === 'keep' ? sim.player.phys.tyre.c : v); renderGarageInfo(); }, desc: `Keep the set on the car, or fit a new set when you go out (${TYRE_FIT} seconds of the session). Softs are fastest over a lap.${wkOn() ? ` A new set costs <b>${WC.money$(WC.COSTS[world.player.series].tyre)}</b>.` : ''}` },
    repairItem(),
    presetItem(' Applies from your next run.'),
    { label: 'Timing', action: () => { pgTiming = !pgTiming; $('pg-timing').hidden = !pgTiming; $('pg-car').hidden = pgTiming; renderGarageInfo(); }, desc: 'The full timing screen for the session (select again for the car).' },
    ...(typeof openLapReview === 'function' ? [{ label: 'Review Laps', action: () => openLapReview('s-pitgarage'), desc: 'Your laps against the reference: where the time went.' }] : []),
    { label: pgSkipLbl, action: () => { sim.skipTime(q.left > 330 ? 300 : q.left); sfx.select(); renderGarageMenu(); renderGarageInfo(); }, desc: 'Fast-forward the session clock. The AI keep setting times meanwhile.' },
    { label: 'Options', action: () => openOptions('s-pitgarage'), desc: 'Sound, camera, driving aids and the screen look.' },
    { label: 'End Session', confirm: 'End it? Select again', action: () => sim.qualiEnd(), desc: `Finish ${SESSION_NAME[q.kind].toLowerCase()} now. The AI still post their laps.` },
    ...(quick ? [{ label: 'Quit', confirm: 'Quit? Select again', action: () => { weekend = null; pitGarage.close(); quitToMenu(); }, desc: 'Back to the main menu.' }] : []),
  ];
  const m = menus['s-pitgarage'][0]; m.setItems(items, true); m.render();
}
// the repair row: how long the crew needs (it comes off the session clock)
function repairItem() {
  const w = sim.garageWork(sim.player), tot = w.fw + w.rw + w.ch, q = sim.quali;
  return {
    label: tot ? `Repair Damage · ${mmss(tot)}` : 'No Damage', disabled: !tot, action: () => repairNow(),
    confirm: tot && tot >= q.left ? 'Longer than the session! Select again' : null,
    desc: tot ? `The crew fixes the car. The session clock runs on ${mmss(tot)} meanwhile, and the AI keep setting times.` : 'Nothing to fix.',
  };
}
// the crew at work: a short progress bar, then the clock jumps on by the repair time
function repairNow() {
  if (pgBusy) return;
  const w = sim.garageWork(sim.player), tot = w.fw + w.rw + w.ch; if (!tot) return;
  pgBusy = true; sfx.select();
  const el = $('pg-work'), bar = $('pg-work-bar'), t0 = performance.now(), dur = 1800;
  $('pg-work-t').textContent = `Repairs · ${mmss(tot)}`; el.hidden = false; bar.style.width = '0%';
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    bar.style.width = (k * 100).toFixed(1) + '%';
    if (k < 1 && screen === 's-pitgarage') return requestAnimationFrame(tick);
    if (!sim || !sim.player) return;
    if (wkOn()) wkUse.damage += dmgOf(sim.player.phys.dmg);
    sim.garageRepair(sim.player);
    pitGarage.setDamage(sim.player.phys.dmg);
    el.hidden = true; pgBusy = false; sfx.go();
    renderGarageMenu(); renderGarageInfo();
  };
  requestAnimationFrame(tick);
}
function renderGarageInfo() {
  const q = sim.quali, rows = sim.qualiRows(), me = rows.find(r => r.isPlayer);
  const late = q.left < 60;
  $('pg-clock').textContent = fmtTime(Math.ceil(q.left), 0); $('pg-clock').classList.toggle('late', late);
  const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  $('pg-card').innerHTML = `<div class="ti-grid">${cell('Position', `${me.pos}<small>/${rows.length}</small>`)}${cell('Best lap', isFinite(me.best) ? fmtTime(me.best, 3) : '&mdash;')}${cell(q.kind === 'practice' ? 'Gap to fastest' : 'Gap to pole', me.pos === 1 || !isFinite(me.best) ? '&mdash;' : '+' + me.gap.toFixed(3))}${cell('Laps', sim.player.lapTimes.length)}</div>`;
  if (pgTiming) $('pg-table').innerHTML = `<tr><th>POS</th><th>DRIVER</th><th class="r">BEST</th><th class="r">GAP</th></tr>` + rows.map(r =>
    `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${posBadge(r.pos)}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.name}</td><td class="t">${isFinite(r.best) ? fmtTime(r.best, 3) : '&mdash;'}</td><td class="t">${r.pos === 1 || !isFinite(r.best) ? '' : '+' + r.gap.toFixed(3)}</td></tr>`).join('');
  pitGarage.setTiming(`${SESSION_NAME[q.kind].toUpperCase()} · ${fmtTime(Math.ceil(q.left), 0)}`, rows);
  // the car: each part, how bad, how long to fix; the tyres on it (and what goes on when you go out)
  if (!pgTiming) {
    const pl = sim.player, d = pl.phys.dmg, w = sim.garageWork(pl), t = pl.phys.tyre;
    const col = (x) => x < 0.15 ? 'var(--sv-good)' : x < 0.45 ? 'var(--sv-hot)' : 'var(--sv-bad)';
    const part = (name, x, secs) => `<div class="pg-row"><span>${name}</span><i class="pg-bar"><b style="width:${Math.round((1 - x) * 100)}%;background:${col(x)};color:${col(x)}"></b></i><em>${secs ? mmss(secs) : 'OK'}</em></div>`;
    const wear = Math.min(t.wf, t.wr);
    const next = pgTyre === 'keep' ? 'Keeping this set' : `New ${capit(pgTyre)} on the way out · ${mmss(TYRE_FIT)}`;
    const key = [d.fw, d.rw, d.ch, wear, t.c, pgTyre, wkOn() ? wkSpend() : 0].map(v => typeof v === 'number' ? v.toFixed(2) : v).join();
    if (key !== pgWorkKey) {
      pgWorkKey = key;
      $('pg-car').innerHTML = `<div class="panel-title">CAR</div>` + part('Front wing', d.fw, w.fw) + part('Rear wing', d.rw, w.rw) + part('Suspension', d.ch, w.ch)
        + `<div class="pg-row"><span>${tyreDot(t.c)}${capit(t.c)} tyres</span><i class="pg-bar"><b style="width:${Math.round(wear * 100)}%;background:${wear > 0.6 ? 'var(--sv-good)' : wear > 0.3 ? 'var(--sv-hot)' : 'var(--sv-bad)'};color:${wear > 0.6 ? 'var(--sv-good)' : wear > 0.3 ? 'var(--sv-hot)' : 'var(--sv-bad)'}"></b></i><em>${Math.round(wear * 100)}%</em></div>`
        + `<p class="pg-note">${next}</p>`
        + (wkOn() ? `<p class="pg-note">This weekend so far: <b>${WC.money$(wkSpend())}</b> in tyres, fuel and repairs &middot; balance ${WC.money$(world.money.balance)}</p>` : '');
    }
  }
  if ((q.left > 330 ? 'Skip 5 Minutes' : 'Skip To The End') !== pgSkipLbl) renderGarageMenu();
}
function goOut(how) {
  sfx.go();
  if (pgBusy) return;
  if (pgTyre !== 'keep' && wkOn()) wkUse.sets++;
  fadeTo(() => { pitGarage.close(); sim.leaveGarage(sim.player, how, pgTyre === 'keep' ? null : pgTyre); beginHud(); }, 250);
}
menus['s-pitgarage'] = [new Menu($('m-pitgarage'), [], { desc: 'd-pitgarage' })];
backs['s-pitgarage'] = () => {};
HINTS['s-pitgarage'] = [['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select']];

// ---------------- career / grand prix ----------------
let career = null;
const DIFF_LABEL = { easy: 'Rookie', medium: 'Pro', hard: 'Legend', alien: 'Alien' };
const newOpts = { rounds: 4, hard: false, laps: 5, pool: 'presets', gpPool: 'presets', gpLaps: 5, gpDiff: 'medium', weekend: 'quali', prac: 1200, quali: 600, gpWeekend: 'quali', gpPrac: 1200, gpQuali: 600 };
const starsHtml = (n, max = 3) => Array.from({ length: Math.max(max, n) }, (_, i) => i < n ? '&#9733;' : '<span class="lost">&#9733;</span>').join('');
const money = (k) => '$' + (k >= 1000 ? (k / 1000).toFixed(2) + 'M' : k + 'k');
function trackPool(which) {
  const mine = savedTracks();
  if (which === 'mine') return mine.length ? mine : presetTracks();
  if (which === 'all') return [...presetTracks(), ...mine];
  return presetTracks();
}
function careerInfo(kind) {
  const el = $('career-info');
  const hist = (() => { try { return JSON.parse(localStorage.getItem('svgp.careerHistory') || '[]'); } catch (e) { return []; } })();
  const h = hist.slice(0, 4).map(r => `<div><span>${new Date(r.date).toLocaleDateString()}</span><span>${r.kind === 'gp' ? 'Grand Prix' : 'Career'}</span><b class="${r.fired ? 'bad' : r.champPos === 1 ? 'ok' : ''}">${r.fired ? 'Fired after ' + r.rounds + ' rounds' : 'P' + r.champPos + ' in the championship'}</b></div>`).join('');
  const feat = (ico, t, d) => `<div class="feat"><i>${ico}</i><div><b>${t}</b><span>${d}</span></div></div>`;
  el.innerHTML = kind === 'gp'
    ? `<h3>GRAND PRIX</h3><p class="lead">A pure championship. Same teams all season, no upgrades, no perks: just racing.</p>
       ${feat('&#9873;', 'F1 points', '25-18-15-12-10-8-6-4-2-1, plus 1 for the fastest lap.')}
       ${feat('&#9636;', 'Race weekends', 'Qualifying (and practice, if you like) sets the grid. Race only: the back in round 1, then championship order.')}
       ${feat('&#9881;', 'Your settings', 'Pick the circuits, race length and AI difficulty.')}`
    : `<h3>CHALLENGE</h3><p class="lead">A season on random circuits in random weather. The AI gets faster every round and every run plays differently.</p>
       ${feat('&#9733;', 'Keep the boss happy', 'The Team Principal sets a target each round. Miss it and you lose a star. Lose all three and you\'re fired.')}
       ${feat('$', 'Prize money', 'Buy upgrades between races: engine, aero, suspension, tyres, durability and pit crew.')}
       ${feat('&#9830;', 'Perk cards', 'Pick one card after every race. Perks stack for the rest of the run.')}`;
  if (h) el.innerHTML += `<div class="hist"><div class="panel-title">RECENT RUNS</div>${h}</div>`;
}
function openCareer(switching = false) {
  const saved = CAREER.loadRun('career'), savedGP = CAREER.loadRun('gp');
  const items = [];
  const cont = (run, name) => ({ label: `Continue ${name}<small>RND ${run.round + 1}/${run.schedule.length}</small>`, cls: 'cont', k: run.kind === 'gp' ? 'gp' : 'c',
    desc: `Pick up where you left off: round ${run.round + 1}, ${run.schedule[run.round].name}.`, action: () => { career = run; fadeTo(() => { renderPaddock(); show('s-paddock'); }, 200); } });
  // three tabs (Q / E, LB / RB): World Career (the endless one), Challenge (a roguelike season) and Grand Prix
  tabRow($('career-tabs'), ['World Career', 'Challenge', 'Grand Prix'], careerTab, (k) => { careerTab = k; openCareer(true); });
  if (careerTab === 0) {
    const m = menus['s-career'][0], items = worldItems(WC.listWorlds());
    m.setItems(items); m.i = items.findIndex(it => !it.disabled && !it.head); m.render();
    worldInfo();
    if (!switching) fadeTo(() => { if (!sim) startAttract(); show('s-career'); }, 200);
    return;
  }
  const gp = careerTab === 2;
  if (!gp && saved && !saved.over) items.push(cont(saved, 'Challenge'));
  if (gp && savedGP && !savedGP.over) items.push(cont(savedGP, 'Grand Prix'));
  const over = (run) => run && !run.over ? ' This replaces the run you have saved.' : '';
  if (!gp) items.push(
    { label: 'New Career', head: true },
    { label: 'Rounds', values: [[4, '4 (short)'], [6, '6'], [8, '8 (season)']], get: () => newOpts.rounds, set: v => newOpts.rounds = v, k: 'c', desc: 'How many races in the season.' },
    { label: 'Challenge', values: [[false, 'Normal'], [true, 'Hard']], get: () => newOpts.hard, set: v => newOpts.hard = v, k: 'c', desc: 'Normal: the AI starts at Rookie and ends at Legend. Hard: it starts at Legend and ends at Alien.' },
    { label: 'Race Laps', values: [3, 5, 8, 12, 15].map(v => [v, String(v)]), get: () => newOpts.laps, set: v => newOpts.laps = v, k: 'c', desc: 'Laps in every race.' },
    { label: 'Weekend', values: WEEKEND_VALS, get: () => newOpts.weekend, set: v => { newOpts.weekend = v; menus['s-career'][0].render(); }, k: 'c', desc: WEEKEND_DESC + ' <b>Race only</b>: the grid is in championship order.' },
    { label: 'Practice', values: PRAC_VALS, get: () => newOpts.prac, set: v => newOpts.prac = v, k: 'c', desc: PRAC_DESC, get disabled() { return newOpts.weekend !== 'full'; } },
    { label: 'Qualifying', values: QUALI_VALS, get: () => newOpts.quali, set: v => newOpts.quali = v, k: 'c', desc: QUALI_DESC, get disabled() { return newOpts.weekend === 'race'; } },
    { label: 'Circuits', values: [['presets', 'Presets'], ['all', 'Presets + Mine'], ['mine', 'My Circuits']], get: () => newOpts.pool, set: v => newOpts.pool = v, k: 'c', desc: 'Which circuits the season is drawn from. Mine are the ones saved in the Track Editor.' },
    { label: 'Start Career', cls: 'action primary', action: () => startNewCareer(), k: 'c', desc: 'Start a new career season.' + over(saved) },
  );
  else items.push(
    { label: 'New Grand Prix', head: true },
    { label: 'Circuits', values: [['presets', 'All Presets'], ['all', 'Presets + Mine'], ['mine', 'My Circuits']], get: () => newOpts.gpPool, set: v => newOpts.gpPool = v, k: 'gp', desc: 'One round on every circuit in the list.' },
    { label: 'Race Laps', values: [3, 5, 8, 12, 15, 20].map(v => [v, String(v)]), get: () => newOpts.gpLaps, set: v => newOpts.gpLaps = v, k: 'gp', desc: 'Laps in every race.' },
    { label: 'Weekend', values: WEEKEND_VALS, get: () => newOpts.gpWeekend, set: v => { newOpts.gpWeekend = v; menus['s-career'][0].render(); }, k: 'gp', desc: WEEKEND_DESC + ' <b>Race only</b>: the grid is in championship order.' },
    { label: 'Practice', values: PRAC_VALS, get: () => newOpts.gpPrac, set: v => newOpts.gpPrac = v, k: 'gp', desc: PRAC_DESC, get disabled() { return newOpts.gpWeekend !== 'full'; } },
    { label: 'Qualifying', values: QUALI_VALS, get: () => newOpts.gpQuali, set: v => newOpts.gpQuali = v, k: 'gp', desc: QUALI_DESC, get disabled() { return newOpts.gpWeekend === 'race'; } },
    { label: 'Difficulty', values: Object.entries(DIFF_LABEL), get: () => newOpts.gpDiff, set: v => newOpts.gpDiff = v, k: 'gp', desc: 'How fast the AI is, all season.' },
    { label: 'Start Grand Prix', cls: 'action primary', action: () => startNewGP(), k: 'gp', desc: 'Start a new Grand Prix championship.' + over(savedGP) },
  );
  const m = menus['s-career'][0];
  m.setItems(items);
  m.i = items.findIndex(it => !it.disabled && !it.head);
  m.render();
  careerInfo(gp ? 'gp' : 'c');
  if (!switching) fadeTo(() => { if (!sim) startAttract(); show('s-career'); }, 200);
}
let careerTab = 0;
tabbers['s-career'] = (d) => { sfx.move(); careerTab = (careerTab + d + 3) % 3; openCareer(true); };
menus['s-career'] = [new Menu($('m-career'), [], { desc: 'd-career' })];
backs['s-career'] = () => { sfx.back(); fadeTo(() => show('s-main'), 200); };
const reservedTeam = () => (settings.team === 'garage' || settings.team === undefined ? 0 : +settings.team);
function withRoster(c) {
  const res = reservedTeam();
  const r = TEAMS.map((t, i) => i).filter(i => i !== res);
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  c.roster = r; c.nameToTeam = {};
  return c;
}
function startNewCareer() {
  career = withRoster(CAREER.newCareer({ rounds: newOpts.rounds, hard: newOpts.hard, laps: newOpts.laps, pool: trackPool(newOpts.pool) }));
  career.weekend = newOpts.weekend; career.pracLen = newOpts.prac; career.qualiLen = newOpts.quali;
  CAREER.saveRun(career);
  fadeTo(() => { renderPaddock(); show('s-paddock'); });
}
function startNewGP() {
  career = withRoster(CAREER.newGrandPrix({ tracks: trackPool(newOpts.gpPool), laps: newOpts.gpLaps, difficulty: newOpts.gpDiff }));
  career.weekend = newOpts.gpWeekend; career.pracLen = newOpts.gpPrac; career.qualiLen = newOpts.gpQuali;
  CAREER.saveRun(career);
  fadeTo(() => { renderPaddock(); show('s-paddock'); });
}

const posBadge = (p) => `<b class="pos${p <= 3 ? ' p' + p : ''}">${p}</b>`;
function standingsTable(c) {
  const list = CAREER.standingsList(c);
  if (!list.length) return '<tr><td class="empty">No races yet. The championship starts at round 1.</td></tr>';
  return `<tr><th>POS</th><th>DRIVER</th><th class="r">WINS</th><th class="r">PTS</th></tr>` + list.slice(0, 12).map((r, k) =>
    `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${posBadge(k + 1)}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.name}</td><td class="n">${r.wins}</td><td class="n">${r.pts}</td></tr>`).join('');
}
function renderPaddock() {
  const c = career; if (!c) return;
  const isCareer = c.kind === 'career';
  const t = c.schedule[c.round];
  $('pad-title').textContent = isCareer ? 'Paddock' : 'Grand Prix';
  $('pad-sub').textContent = `Round ${c.round + 1} of ${c.schedule.length} · ${isCareer ? 'Career' : 'Championship'}${isCareer && c.hard ? ' · Hard' : ''}`;
  $('pad-top').innerHTML = isCareer ? `<div><span class="lbl">BUDGET</span><span class="money">${money(c.money)}</span></div><div><span class="lbl">TEAM PRINCIPAL</span><span class="stars">${starsHtml(c.stars)}</span></div>` : '';
  const diff = CAREER.roundDifficulty(c), target = CAREER.roundTarget(c, 12);
  const perks = (c.perks || []).map(k => `<span title="${CAREER.PERKS[k].desc.replace(/"/g, '&quot;')}">${CAREER.PERKS[k].name}</span>`).join('');
  const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  // the season so far: a pip per round
  const pips = c.schedule.map((tr, k) => `<i class="${k < c.round ? 'done' : k === c.round ? 'now' : ''}" title="${tr.name}"></i>`).join('');
  $('pad-next').innerHTML = `<div class="panel-title">NEXT RACE</div><div class="season-pips">${pips}</div><h3>${t.name}</h3>
    <div class="ti-chips"><span>${THEMES[t.env.theme].label}</span><span class="wx-chip">${t.env.time} &middot; ${t.env.weather}</span></div>
    <div class="ti-grid three">${cell('Laps', c.laps)}${cell('Opposition', DIFF_LABEL[diff])}${cell('Grid', careerFmt(c) !== 'race' ? 'Qualifying' : c.round === 0 ? 'Back' : 'Champ. order')}</div>
    ${isCareer ? `<div class="target"><i>&#9733;</i><span>The Team Principal wants <b>P${target}</b> or better</span></div>` : ''}
    ${perks ? `<div class="panel-title" style="margin-top:14px">YOUR PERKS</div><div class="perks">${perks}</div>` : ''}`;
  $('pad-table').innerHTML = standingsTable(c);
  const items = [{ label: `Start Round ${c.round + 1}`, cls: 'action primary', action: () => startCareerRound(), desc: `Load ${t.name}. ${{ full: 'Pick your car, practise, qualify, then choose your strategy on the grid.', quali: 'Pick your car, qualify, then choose your strategy on the grid.', race: 'You pick your car and strategy on the grid.' }[careerFmt(c)]}` }];
  if (isCareer) items.push({ label: 'Upgrades', action: () => openShop(), desc: `Spend your ${money(c.money)} budget on car upgrades.` });
  items.push(presetItem(isCareer ? ' Fewer aids pay a bigger prize. Set each aid in Options > Aids.' : ' Set each aid in Options > Aids.'),
    { label: 'Garage', action: () => openGarage('s-paddock'), desc: 'Change your car and livery.' },
    { label: 'Save & Quit', action: () => { CAREER.saveRun(c); quitToMenu(); }, desc: 'Your run is saved. Continue it from the main menu.' });
  menus['s-paddock'][0].setItems(items);
}
menus['s-paddock'] = [new Menu($('m-paddock'), [], { desc: 'd-paddock' })];
backs['s-paddock'] = () => {};

function renderShop() {
  const c = career;
  $('shop-top').innerHTML = `<div><span class="lbl">BUDGET</span><span class="money">${money(c.money)}</span></div>`;
  const m = menus['s-shop'][0];
  m.setItems(Object.entries(CAREER.UPGRADES).map(([k, u]) => {
    const lvl = c.upgrades[k], cost = CAREER.upgradeCost(lvl), maxed = lvl >= CAREER.MAX_LEVEL;
    const pips = Array.from({ length: CAREER.MAX_LEVEL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    return { label: `<span class="up-name">${u.label}</span><span class="up-pips">${pips}</span><span class="cost ${maxed ? 'max' : c.money < cost ? 'no' : ''}">${maxed ? 'MAXED' : money(cost)}</span>`, cls: 'up',
      desc: u.desc + (maxed ? '. Fully upgraded.' : c.money < cost ? `. <span class="bad">You need ${money(cost - c.money)} more.</span>` : `. Next level: ${money(cost)}.`),
      action: () => { if (CAREER.buyUpgrade(c, k)) { sfx.best(); CAREER.saveRun(c); renderShop(); } else sfx.error(); } };
  }), true);
}
menus['s-shop'] = [new Menu($('m-shop'), [], { desc: 'd-shop' })];
function openShop() { renderShop(); fadeTo(() => show('s-shop'), 150); }
backs['s-shop'] = () => { sfx.back(); renderPaddock(); fadeTo(() => show('s-paddock'), 150); };

// perk draft
let draft = [], draftSel = 1;
function openDraft() {
  draft = CAREER.drawCards(career, 3);
  if (!draft.length) { renderPaddock(); show('s-paddock'); return; }
  draftSel = Math.min(1, draft.length - 1);
  renderDraft();
  fadeTo(() => show('s-draft'), 200);
}
function renderDraft() {
  $('cards').innerHTML = draft.map((k, i) => { const p = CAREER.PERKS[k]; return `<div class="card${i === draftSel ? ' sel' : ''}" data-i="${i}"><div class="tag ${p.tag}">${p.tag}</div><h4>${p.name}</h4><p>${p.desc}</p><div class="take">${i === draftSel ? 'TAKE THIS CARD' : ''}</div><div class="ico">${i + 1}</div></div>`; }).join('');
  $('cards').querySelectorAll('.card').forEach(el => {
    el.addEventListener('mousemove', (e) => { const at = e.screenX + ',' + e.screenY; if (at === lastMouse) return; lastMouse = at; if (draftSel !== +el.dataset.i) { draftSel = +el.dataset.i; sfx.move(); renderDraft(); } });
    el.addEventListener('click', () => { draftSel = +el.dataset.i; takeDraft(); });
  });
}
function takeDraft() {
  CAREER.takePerk(career, draft[draftSel]);
  CAREER.saveRun(career);
  sfx.best();
  fadeTo(() => { renderPaddock(); show('s-paddock'); });
}
backs['s-draft'] = () => {};

function startCareerRound() {
  const c = career;
  const track = cloneTrack(c.schedule[c.round]);
  const diff = CAREER.roundDifficulty(c);
  // grid in championship order after round 1
  let gridOrder = null;
  if (c.round > 0) {
    const names = CAREER.standingsList(c).map(s => s.name);
    gridOrder = names.map(n => c.nameToTeam[n]).filter(k => k !== undefined);
  }
  const target = CAREER.roundTarget(c, 12);
  const brief = c.kind === 'career'
    ? `<b>ROUND ${c.round + 1} OF ${c.schedule.length}</b><br>The Team Principal expects <b>P${target}</b> or better.`
    : `<b>GRAND PRIX · ROUND ${c.round + 1} OF ${c.schedule.length}</b>`;
  const race = {
    mode: 'race', laps: c.laps, opponents: 11, brief, pick: true,
    extra: { difficulty: diff, grid: 'back', roster: c.roster, teamPace: c.teamPace, gridOrder, mods: CAREER.playerMods(c) },
  };
  const fmt = careerFmt(c);
  if (fmt !== 'race') return startWeekend(track, race, 'career', fmt, careerLen(c));
  weekend = null;
  startRace(track, race, 'career');
}

// a season's weekend format + session lengths (seasons saved before weekends existed: qualifying, as they had it)
const careerFmt = (c) => c.weekend ?? ((c.quali ?? 300) ? 'quali' : 'race');
const careerLen = (c) => c.pracLen ? [c.pracLen, c.qualiLen] : c.sessLen ? SESSION_LENS[c.sessLen] : [1200, Math.max(300, c.quali || 600)];
function careerRoundDone(retired = false) {
  const c = career; if (!c || !sim) return;
  let res = sim.results();
  if (retired) { const me = res.find(r => r.isPlayer); res = res.filter(r => !r.isPlayer).concat([{ ...me, gap: 'DNF', time: null, cleanFinish: false, dnf: true }]); res.forEach((r, k) => r.pos = k + 1); }
  for (const car of sim.cars) c.nameToTeam[car.name] = car.isPlayer ? 'P' : car.teamIdx;
  const out = CAREER.recordRound(c, res, sim.player ? sim.player.startPos : 12, Math.max(0, sim.aidBonus ?? 0));
  sim.setPaused(true);
  if (c.over) { CAREER.recordHistory(c); CAREER.clearRun(c.kind); } else CAREER.saveRun(c);
  // table: this race + points
  $('round-title').textContent = 'Round Complete';
  $('round-sub').textContent = `Round ${out.round + 1} of ${c.schedule.length} · ${out.track}`;
  $('round-table').innerHTML = `<tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th class="r">PTS</th></tr>` + out.rows.map(r =>
    `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${posBadge(r.pos)}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.name}${r.fl ? ' <span class="fl">FASTEST LAP</span>' : ''}${r.pen || r.dt ? ` <span class="pen">${penText(r)}</span>` : ''}${r.dsq ? ' <span class="pen">DSQ</span>' : ''}</td><td>${r.team}</td><td class="n">${r.pts ? '+' + r.pts : ''}</td></tr>`).join('');
  const me = out.player;
  let info = `<div class="big-pos">${!me ? 'DNF' : me.dsq ? 'DSQ' : 'P' + me.pos}<small>${!me ? 'RETIRED' : me.dsq ? 'DISQUALIFIED' : 'FINISHED'}</small></div>`;
  if (c.kind === 'career' && out.money) {
    info += `<div class="big ${out.hit ? 'ok' : 'bad'}">${out.hit ? 'TARGET MET' : 'TARGET MISSED'}</div>
      <div class="row"><span>Team Principal wanted</span><span>P${out.target}</span></div>
      <div class="row"><span>Patience</span><span style="color:var(--sv-amber)">${starsHtml(c.stars)}</span></div>
      <div class="row"><span>Prize money</span><span class="money">${money(out.money.prize)}</span></div>
      ${out.money.gained ? `<div class="row"><span>Places gained</span><span class="money">+${money(out.money.gained)}</span></div>` : ''}
      ${out.money.flBonus ? `<div class="row"><span>Fastest lap</span><span class="money">+${money(out.money.flBonus)}</span></div>` : ''}
      ${out.money.clean ? `<div class="row"><span>Clean race</span><span class="money">+${money(out.money.clean)}</span></div>` : ''}
      ${out.money.aids ? `<div class="row"><span>Driver aids bonus (+${out.money.aidPct}%)</span><span class="money">+${money(out.money.aids)}</span></div>` : ''}
      ${me && (me.pen || me.dt) ? `<div class="row"><span>Penalties</span><span class="pen">${penText(me)} &middot; no clean race bonus</span></div>` : ''}
      ${out.money.frenzy ? `<div class="row"><span>Sponsor Frenzy</span><span class="money">x1.4</span></div>` : ''}
      <div class="row"><b>Total</b><span class="money">${money(out.money.total)}</span></div>`;
  } else info += `<div class="row"><span>Points this race</span><span>${me ? me.pts : 0}</span></div>`;
  const champPos = CAREER.standingsList(c).findIndex(s => s.isPlayer) + 1;
  info += `<div class="row"><span>Championship</span><span>P${champPos} · ${c.standings[me?.name]?.pts ?? 0} pts</span></div>`;
  $('round-info').innerHTML = info;
  const next = () => {
    if (c.over) return showSeasonEnd();
    fadeTo(() => { disposeSim(); startAttract(); if (c.kind === 'career') openDraft(); else { renderPaddock(); show('s-paddock'); } });
  };
  menus['s-round'][0].setItems([{ label: c.over ? 'Season Summary' : 'Continue', cls: 'action primary', action: next }]);
  show('s-round');
  if (c.kind === 'career') { if (out.hit) sfx.finish(); else sfx.error(); }
}
menus['s-round'] = [new Menu($('m-round'), [])];
backs['s-round'] = () => {};

function showSeasonEnd() {
  const c = career;
  const list = CAREER.standingsList(c);
  const pos = list.findIndex(s => s.isPlayer) + 1;
  $('round-title').textContent = c.fired ? 'You’re Fired' : pos === 1 ? 'World Champion!' : 'Season Complete';
  $('round-sub').textContent = `${c.kind === 'gp' ? 'Grand Prix' : 'Career'} · final standings after ${c.results.length} round${c.results.length === 1 ? '' : 's'}`;
  $('round-table').innerHTML = standingsTable(c);
  $('round-info').innerHTML = c.fired
    ? `<div class="big bad">FIRED</div><p>The Team Principal ran out of patience after round ${c.results.length}.</p><div class="row"><span>Championship</span><span>P${pos}</span></div>`
    : `<div class="big-pos ${pos === 1 ? 'gold' : ''}">P${pos}<small>IN THE CHAMPIONSHIP</small></div><p>${pos === 1 ? 'You took the title. RESPECT +' : 'Next season, the title.'}</p>${c.kind === 'career' ? `<div class="row"><span>Budget left</span><span class="money">${money(c.money)}</span></div>` : ''}`;
  menus['s-round'][0].setItems([{ label: 'Main Menu', cls: 'action primary', action: () => { career = null; quitToMenu(); } }]);
  if (!c.fired && pos === 1) sfx.finish();
  fadeTo(() => { disposeSim(); startAttract(); show('s-round'); });
}

// ---------------- World Career: the hub between rounds (your garage), the computer, the phone ----------------
// js/wcareer.js keeps the world (people, teams, three series, results, news and texts); this is its UI.
let world = null;
const worldOpts = { len: 6, difficulty: 'medium', laps: 5, weekend: 'quali', prac: 1200, quali: 600, pool: 'presets', name: '' };
const worldPool = () => trackPool(world ? world.opts.pool : worldOpts.pool);
const saveWorld = () => { if (world) WC.saveWorld(world); };
const seriesName = (sid) => WC.seriesById(sid).name;
const ord = (p) => p + (['th', 'st', 'nd', 'rd'][(p % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][p % 100] || 'th');

// the phone: texts and news from the world, choices answered by reply
const phone = new Phone({
  msgs: () => world ? world.msgs : [],
  status: () => !world ? '' : world.over ? `${world.year} END` : `R${world.round + 1}/${world.opts.len} ${world.year}`,
  read: () => { saveWorld(); renderHubMenu(); },
  choose: (m, key) => {
    if (m.offer) {
      WC.answerOffer(world, key);
      WC.text(world, m.from, key === 'move' ? 'Great. We will send the paperwork over. See you on the grid.' : 'Understood. The offer stands for next year if you change your mind.');
      phone.buzz();
    }
    saveWorld(); renderHub();
  },
  sfx: { move: () => sfx.move(), select: () => sfx.select(), back: () => sfx.back(), buzz: () => { sfx.buzz(); rumble(0.35, 0.1); setTimeout(() => rumble(0, 0), 300); } },
});
const PHONE_SCREENS = ['s-hub'];
function togglePhone() { if (phone.isOpen) phone.close(); else phone.open(); renderHints(); }
function phoneInput() {
  if (pressed('KeyP') || pressed('GP3')) { togglePhone(); return true; }
  if (!phone.isOpen) return false;
  const up = pressed('ArrowUp') | pressed('KeyW') | pressed('GP12') | pressed('GPSU'), down = pressed('ArrowDown') | pressed('KeyS') | pressed('GP13') | pressed('GPSD');
  const ok = pressed('Enter') | pressed('Space') | pressed('GP0'), back = pressed('Escape') | pressed('Backspace') | pressed('GP1');
  const was = phone.isOpen;
  phone.input({ up, down, ok, back });
  if (was !== phone.isOpen) renderHints();
  return true;
}
const phoneHints = [['nav', 'Scroll'], ['ok', 'Select'], ['back', 'Back'], ['phone', 'Put away']];
HINTS['s-hub'] = () => pcSeat ? [['nav', 'Move'], ['ok', 'Select'], ...(pc.hasTabs ? [['tab', 'Sections']] : []), ['back', pc.app ? 'Back' : 'Stand up']]
  : phone.isOpen ? phoneHints : [['nav', 'Navigate'], ['ok', 'Select'], ['phone', 'Phone']];

// the computer on the desk: Mail, the news, the series' websites, the driver database (js/computer.js)
const pc = new Computer({
  world: () => world,
  answer: (m, key) => {
    m.answer = key;
    if (m.lottery) { WC.claimLottery(world, key); sfx.best(); renderHub(); }
    if (m.offer) {
      WC.answerOffer(world, key);
      const mate = world.people[world.teams[world.player.team].drivers.find(d => d !== 'P')];
      if (key === 'move' && mate) { WC.text(world, mate.first, pick([`Heard we're moving up! About time.`, `We're going up a series? Brilliant. I'll start packing.`])); phone.buzz(); }
    }
    saveWorld(); renderHubMenu(); sfx.select();
  },
  changed: () => { saveWorld(); renderHubMenu(); },
  sell: () => { const cash = WC.sellAnnuity(world); if (cash) { sfx.best(); saveWorld(); renderHub(); } },
  // Form SV-1 filed: the team takes its name and colours (and your livery starts in them)
  register: (f) => {
    WC.registerTeam(world, f);
    world.livery = { ...settings.car, main: f.colors[0], accent: f.colors[1], teamName: f.team };
    settings.driverName = f.name; saveSettings();
    sfx.best(); saveWorld(); renderHub(); phone.buzz();
  },
  buy: (id) => { if (WC.buyCar(world, id)) { sfx.best(); saveWorld(); renderHub(); } },
  photo: (ad) => {
    if (adPhotos.has(ad.id)) return adPhotos.get(ad.id);
    let src = null;
    try { src = carPhoto({ ...settings.car, chassis: ad.chassis, main: ad.color, accent: 0xf2f2f2 }, parseInt(ad.id.slice(2), 10) || 1); } catch (e) { console.warn('car photo', e); }
    adPhotos.set(ad.id, src); return src;
  },
  carInfo: (chassis) => {
    const id = carId({ chassis }), C = CARS[id]; if (!C) return null;
    const st = carStats(id), s = C.spec, mph = settings.units === 'mph';
    return { hp: Math.round(st.power), kg: Math.round(st.weight), top: mph ? Math.round(st.top / 1.609) + ' mph' : Math.round(st.top) + ' km/h',
      drive: s.drive >= 0.99 ? 'front-wheel drive' : s.drive > 0.01 ? 'all-wheel drive' : 'rear-wheel drive', box: `${s.gears.length - 1}-speed ${s.box || 'manual'}`, engine: ENGINE_NAME[C.sound] || 'petrol' };
  },
  view: () => { if (screen === 's-hub') renderHints(); },
  sfx: { move: () => sfx.move(), select: () => sfx.select(), back: () => sfx.back() },
});
pitGarage.setScreen(pc.idle);
const adPhotos = new Map(); // (the classifieds' photos: rendered once a session)
let pcSeat = false; // sat at the computer (the camera on its way in, or there)
function sitDown(app, arg) {
  if (pcSeat) return;
  pcSeat = true; phone.close(); phone.hide(); pcWant = [app, arg];
  pitGarage.setZoom(true); $('s-hub').classList.add('seated'); sfx.select(); renderHints();
}
let pcWant = null;
function standUp() {
  if (!pcSeat) return;
  pc.close(); pitGarage.refreshScreen(); pitGarage.setZoom(false);
  pcSeat = false; $('s-hub').classList.remove('seated'); sfx.back(); renderHub(); renderHints();
}
function pcInput() {
  if (!pcSeat) return false;
  if (!pc.isOpen) { clearEdges(); return true; } // (still on the way in)
  const up = pressed('ArrowUp') | pressed('KeyW') | pressed('GP12') | pressed('GPSU'), down = pressed('ArrowDown') | pressed('KeyS') | pressed('GP13') | pressed('GPSD');
  const left = pressed('ArrowLeft') | pressed('KeyA') | pressed('GP14') | pressed('GPSL'), right = pressed('ArrowRight') | pressed('KeyD') | pressed('GP15') | pressed('GPSR');
  const ok = pressed('Enter') | pressed('Space') | pressed('GP0'), back = pressed('Escape') | pressed('Backspace') | pressed('GP1');
  const tabPrev = pressed('KeyQ') | pressed('GP4'), tabNext = pressed('Tab') | pressed('KeyE') | pressed('GP5');
  const was = pc.app + pc.hasTabs;
  if (pc.input({ up, down, left, right, ok, back, tabPrev, tabNext }) === 'stand') standUp();
  else if (was !== pc.app + pc.hasTabs) renderHints();
  return true;
}
// every frame in the hub: the computer's DOM rides the monitor's glass once the camera has arrived
function hubTick(dt) {
  pitGarage.update(dt);
  if (pcSeat && pitGarage.seated && !pc.isOpen) {
    pc.open(); if (pcWant && pcWant[0]) pc.goto(pcWant[0], pcWant[1]); pcWant = null; renderHints();
  }
  if (pc.isOpen) { const r = pitGarage.screenRect(); if (r) pc.place(r); }
  if (pc.idleDirty) { pc.idleDirty = false; pitGarage.refreshScreen(); }
  // the neon tag over the monitor: there whenever you're standing in the room; lit up when the Computer item is
  // highlighted or the mouse is on the monitor; pulsing while there's unread mail
  const tag = $('pc-tag'), at = !pcSeat && pitGarage.zoomK === 0 && !phone.isOpen ? pitGarage.screenAnchor() : null;
  tag.hidden = !at;
  if (at) {
    tag.style.left = at.x + 'px'; tag.style.top = at.y + 'px';
    const m = menus['s-hub'][0], n = world ? WC.unreadMail(world) : 0;
    tag.classList.toggle('hot', pcHover || /^Computer/.test(m.items[m.i]?.label || ''));
    tag.classList.toggle('new', n > 0);
    const t = n ? `${n} NEW` : ''; if ($('pc-tag-n').textContent !== t) $('pc-tag-n').textContent = t;
  }
}
// the mouse over the monitor: a pointer, and the tag lights up
let pcHover = false;
$('s-hub').addEventListener('mousemove', (e) => {
  const on = !!onRoom(e);
  if (on !== pcHover) { pcHover = on; $('s-hub').style.cursor = on ? 'pointer' : ''; }
});
$('pc-tag').addEventListener('click', () => { if (screen === 's-hub' && !pcSeat) sitDown(); });
// a click on the monitor sits you down (the hub's layer is over the 3D view, so it listens there, past its panels)
const onRoom = (e) => screen === 's-hub' && world && !pcSeat && !phone.isOpen && !e.target.closest('.panel, .footer-hints, .desc-bar, .scr-head, .pc-tag') && pitGarage.hitScreen(e.clientX, e.clientY);
$('s-hub').addEventListener('click', (e) => { if (onRoom(e)) sitDown(); });
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---- new career (Career screen, World Career tab) ----
let delPick = null;
function worldItems(saves) {
  const items = [];
  if (saves.length) items.push({ label: 'Your Careers', head: true });
  for (const e of saves.slice(0, 6)) items.push({ label: `${e.team}<small>${e.year} · ${e.over ? 'SEASON OVER' : 'RND ' + (e.round + 1) + '/' + e.len}</small>`, cls: 'cont',
    desc: `${e.name}, ${seriesName(e.series)}. Pick it up where you left it.`, action: () => { const w = WC.loadWorld(e.id); if (w) { world = w; openHub(); } } });
  items.push(
    { label: 'New Career', head: true },
    { label: 'Season Length', values: WC.SEASON_LENGTHS.map(n => [n, n + ' rounds']), get: () => worldOpts.len, set: v => worldOpts.len = v, desc: 'Rounds in every season, in every series.' },
    { label: 'Difficulty', values: Object.entries(DIFF_LABEL), get: () => worldOpts.difficulty, set: v => worldOpts.difficulty = v, desc: 'The pace of the field. Higher series have better drivers on top of this, so it gets harder as you climb.' },
    { label: 'Race Laps', values: [3, 5, 8, 12, 15, 20].map(v => [v, String(v)]), get: () => worldOpts.laps, set: v => worldOpts.laps = v, desc: 'Laps in every race (point-to-point circuits are one run).' },
    { label: 'Weekend', values: WEEKEND_VALS, get: () => worldOpts.weekend, set: v => { worldOpts.weekend = v; menus['s-career'][0].render(); }, desc: WEEKEND_DESC + ' <b>Race only</b>: the grid is in championship order.' },
    { label: 'Practice', values: PRAC_VALS, get: () => worldOpts.prac, set: v => worldOpts.prac = v, desc: PRAC_DESC, get disabled() { return worldOpts.weekend !== 'full'; } },
    { label: 'Qualifying', values: QUALI_VALS, get: () => worldOpts.quali, set: v => worldOpts.quali = v, desc: QUALI_DESC, get disabled() { return worldOpts.weekend === 'race'; } },
    { label: 'Circuits', values: [['presets', 'Presets'], ['all', 'Presets + Mine'], ['mine', 'My Circuits']], get: () => worldOpts.pool, set: v => worldOpts.pool = v, desc: 'Which circuits the calendars are drawn from.' },
    { label: 'Start Career', cls: 'action primary', action: () => startWorld(), desc: 'Your name, your team and your first car are set up on the computer in your garage.' },
  );
  if (saves.length) {
    if (!saves.some(e => e.id === delPick)) delPick = saves[0].id;
    items.push({ label: 'Delete Career', values: saves.map(e => [e.id, e.team]), get: () => delPick, set: v => delPick = v, confirm: 'Delete it for good? Select again',
      action: () => { WC.deleteWorld(delPick); sfx.back(); openCareer(true); }, desc: 'Pick a career with left / right, then select twice. It can\'t be undone.' });
  }
  return items;
}
function worldInfo() {
  const el = $('career-info');
  const feat = (ico, t, d) => `<div class="feat"><i>${ico}</i><div><b>${t}</b><span>${d}</span></div></div>`;
  el.innerHTML = `<h3>WORLD CAREER</h3><p class="lead">You won the lottery, got divorced, and decided to start a racing team. Run it from your garage for as long as the money lasts, and then some.</p>
    ${feat('&#9873;', 'Three series', 'Street Cup, GT Championship and Formula SV. Finish in the top three to be offered a step up, if you can afford it.')}
    ${feat('&#36;', 'Every lap costs', 'Entry, travel, the crew, tyres, fuel and repairs. Prize money comes back. The bank is watching.')}
    ${feat('&#9636;', 'The computer', 'Email, the news, the classifieds, the bank. Most of the story happens on a screen in your garage.')}`;
}
function startWorld() {
  const name = settings.driverName || 'Driver';
  const streetCars = carsOfClass('street').map(id => ({ key: chassisKey(id), name: CARS[id].name, value: Math.round(12000 + CARS[id].spec.power * 0.11) }));
  world = WC.newWorld({ name, len: worldOpts.len, difficulty: worldOpts.difficulty, laps: worldOpts.laps, weekend: worldOpts.weekend, pracLen: worldOpts.prac, qualiLen: worldOpts.quali, pool: worldOpts.pool,
    teamName: `${name.split(' ').pop()} Racing`, colors: [settings.car.main, settings.car.accent], seed: Date.now(), streetCars }, worldPool());
  saveWorld();
  fadeTo(() => { enterHub(); const m = world.mail.find(x => x.link && x.link[0] === 'registry'); setTimeout(() => { if (screen === 's-hub') sitDown('mail', m && m.id); }, 700); }, 200);
}

// ---- the hub: your garage ----
// this career's car: its own livery (designed from the hub), on the chassis you bought
function worldCar() {
  const c = { ...(world.livery || settings.car) };
  if (world.car) c.chassis = world.car.chassis;
  return c;
}
// the garage from the hub edits this career's car, not the one in your other modes
let garageSwap = null;
function openWorldGarage() { garageSwap = settings.car; settings.car = worldCar(); openGarage('s-hub'); }
function closeWorldGarage() {
  if (!garageSwap) return;
  world.livery = { ...settings.car }; world.liveryDone = true; settings.car = garageSwap; garageSwap = null;
  saveSettings(); saveWorld();
}
// the car in the bay is your car for this series; the room is your garage model
function hubCar() {
  const cls = WC.seriesById(world.player.series).cls, car = worldCar();
  return CARS[carId(car)]?.cls === cls ? car : { ...car, chassis: chassisKey(carsOfClass(cls)[0]) };
}
function enterHub() {
  disposeSim();
  const t = world.teams[world.player.team];
  if (world.livery) { t.main = world.livery.main; t.accent = world.livery.accent; }
  pitGarage.openHome(hubCar(), { main: t.main, accent: t.accent, name: t.name });
  pcSeat = false; pc.close(); $('s-hub').classList.remove('seated');
  renderHub(); show('s-hub');
}
function openHub(first = false) {
  fadeTo(() => {
    enterHub();
    if (WC.unread(world)) setTimeout(() => { if (screen === 's-hub') phone.buzz(); }, first ? 900 : 500);
  }, 200);
}
function renderHub() {
  if (!world) return;
  const w = world, sid = w.player.series, S = w.series[sid];
  $('hub-title').textContent = w.teams[w.player.team].name;
  $('hub-sub').textContent = `${seriesName(sid)} · ${w.year} season · ${w.over ? 'season complete' : `round ${w.round + 1} of ${w.opts.len}`}`;
  const st = WC.seriesStandings(w, sid), cp = S.results.length ? st.findIndex(e => e.pid === 'P') + 1 : 0;
  const pips = S.cal.map((c, k) => `<i class="${k < w.round ? 'done' : k === w.round && !w.over ? 'now' : ''}" title="${c.name}"></i>`).join('');
  const champ = cellW('Championship', cp ? `${ord(cp)}<small> ${st[cp - 1].pts} PTS</small>` : '&mdash;');
  const bank = w.money && w.money.choice ? cellW('Bank', `<span class="${w.money.balance < 0 ? 'bad' : ''}">${WC.money$(w.money.balance)}</span>`) : cellW('Bank', '&mdash;');
  const F = w.founding || {};
  if (!founded(w)) {
    const step = (done, t) => `<div class="row"><span>${t}</span><span class="${done ? 'ok' : ''}">${done ? 'DONE' : '&mdash;'}</span></div>`;
    $('hub-card').innerHTML = `<div class="panel-title">GETTING STARTED</div><div class="hub-steps">
      ${step(F.reg, 'Register the team')}${step(w.money && w.money.choice, 'Claim your winnings')}${step(F.car, 'Buy a car')}${step(!!w.livery && w.liveryDone, 'Paint it (optional)')}</div>
      <p class="hub-note">It all happens on the <b>computer</b>.</p>`;
  } else if (!w.over) {
    const r = S.cal[w.round], tr = worldPool().find(t => t.name === r.name);
    $('hub-card').innerHTML = `<div class="panel-title">NEXT &middot; ROUND ${w.round + 1} OF ${w.opts.len}</div><div class="season-pips">${pips}</div>
      <div class="ti-name">${r.name}</div><div class="ti-chips"><span>${tr ? THEMES[tr.env.theme].label : ''}</span><span class="wx-chip">${r.time} &middot; ${r.weather}</span></div>
      <div class="ti-grid">${champ}${bank}</div>
      ${w.money && !w.money.choice ? `<p class="hub-note">You won the lottery. <b>Check your email</b> to claim it.</p>` : ''}`;
  } else {
    const sum = w.seasons.at(-1), you = sum && sum.you, off = w.player.offer;
    $('hub-card').innerHTML = `<div class="panel-title">${w.year} &middot; SEASON COMPLETE</div><div class="season-pips">${pips}</div>
      <div class="ti-grid three">${cellW('Finished', you ? ord(you.pos) : '&mdash;')}${cellW('Wins', you ? you.wins : 0)}${bank}</div>
      ${off ? `<p class="hub-note">${off.answer === 'move' ? `You're moving up to the <b>${seriesName(off.to)}</b>.` : off.answer === 'stay' ? `You're staying in the ${seriesName(sid)}.` : `The <b>${seriesName(off.to)}</b> has emailed you an offer.`}</p>` : ''}`;
  }
  renderHubMenu();
}
function renderHubMenu() {
  if (!world) return;
  const w = world, sid = w.player.series, n = WC.unread(w), nm = WC.unreadMail(w);
  const items = [];
  const off = w.player.offer, offerMail = off && !off.answer && (w.mail || []).find(m => m.offer && !m.answer);
  const claim = w.money && !w.money.choice && (w.mail || []).find(m => m.lottery && !m.answer);
  const F = w.founding || {};
  if (!F.reg) items.push({ label: 'Register The Team', cls: 'action primary', action: () => sitDown('registry'), desc: 'Form SV-1, on the computer.' });
  else if (claim) items.push({ label: 'Claim Your Winnings', cls: 'action primary', action: () => sitDown('mail', claim.id), desc: 'The State Lottery needs to know how you want your money. It\'s waiting in your email.' });
  else if (!F.car) items.push({ label: 'Buy A Car', cls: 'action primary', action: () => sitDown('classifieds'), desc: 'Danny sent you some listings. They\'re on the computer.' });
  else if (!w.over) {
    const r = w.series[sid].cal[w.round];
    items.push({ label: `Round ${w.round + 1}: Race`, cls: 'action primary', action: () => startWorldRound(), desc: `${r.name}, ${r.time}, ${r.weather}. ${{ full: 'Practice, qualifying, then the race.', quali: 'Qualifying, then the race.', race: 'Straight to the race: the grid is in championship order.' }[w.opts.weekend]}` });
  } else {
    items.push({ label: `Start ${w.year + 1} Season`, cls: 'action primary', action: () => beginNextSeason(),
      desc: offerMail ? `First answer the ${seriesName(off.to)}'s email.` : 'Everyone a year older. Retirements, promotions and rookies, then a new calendar.' });
  }
  items.push(
    { label: `Computer${nm ? `<small>${nm} NEW</small>` : ''}`, action: () => sitDown(offerMail ? 'mail' : null, offerMail ? offerMail.id : null), desc: 'Sit down at the desk: your email, the news, the series\' websites and the driver database. You can also click the monitor.' },
    { label: `Phone${n ? `<small>${n} NEW</small>` : ''}`, action: () => { phone.open(); renderHints(); }, desc: 'Texts from your teammate, rivals and friends. Press <b>P</b> / <b>Y</b> any time.' },
    { label: 'Car & Livery', action: () => openWorldGarage(), desc: w.car ? `Your ${w.car.year} ${w.car.name}: paint it, design the livery, the helmet and the suit.` : `Your livery, helmet and suit. In the ${seriesName(sid)} you race ${CLASSES[WC.seriesById(sid).cls].label} cars.` },
    presetItem(' Set each aid in Options > Aids.'),
  );
  if (!w.over) items.push({ label: 'Sim Rest Of Season', confirm: 'Simulate it all? Select again', action: () => simWorldSeason(), desc: 'For testing: simulates every remaining round, your races too (you as a mid-field driver).' });
  items.push({ label: 'Save & Quit', action: () => { saveWorld(); pitGarage.close(); quitToMenu(); }, desc: 'Your career is saved. Continue it from the main menu.' });
  const m = menus['s-hub'][0], keep = m.items[m.i]?.label?.replace(/<small>.*$/, '');
  m.setItems(items, true);
  const k = items.findIndex(it => it.label.replace(/<small>.*$/, '') === keep); if (k >= 0) { m.i = k; m.render(); }
}
menus['s-hub'] = [new Menu($('m-hub'), [], { desc: 'd-hub' })];
backs['s-hub'] = () => { if (pcSeat && pc.isOpen) { if (pc.app) { pc.back(); renderHints(); } else standUp(); } };
tabbers['s-hub'] = (d) => { if (pc.isOpen) pc.flip(d); };
const cellW = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
// ready to race: registered, paid, a car in the garage
const founded = (w) => { const F = w.founding || {}; return F.reg && F.car && w.money && w.money.choice; };
function beginNextSeason() {
  const off = world.player.offer;
  if (off && !off.answer) { const m = (world.mail || []).find(x => x.offer && !x.answer); sitDown('mail', m && m.id); return; }
  WC.nextSeason(world, worldPool());
  saveWorld(); sfx.best();
  openHub();
}
function simWorldSeason() {
  while (!world.over) WC.simPlayerRound(world);
  saveWorld(); renderHub(); pc.drawIdle(); phone.buzz();
}

// ---- a round ----
function startWorldRound() {
  const w = world, sid = w.player.series, r = w.series[sid].cal[w.round];
  wkUse = { sets: 0, laps: 0, damage: 0, seen: null };
  const base = worldPool().find(t => t.name === r.name) || presetTracks()[0];
  const track = cloneTrack(base); track.env.time = r.time; track.env.weather = r.weather;
  // your team wears your livery
  const mine = w.teams[w.player.team], wc = worldCar(); mine.main = wc.main; mine.accent = wc.accent;
  const ent = WC.raceEntries(w);
  const clsCars = carsOfClass(WC.seriesById(sid).cls);
  for (const e of Object.values(ent.entries)) e.chassis = WC.seriesById(sid).cls === 'f1' ? 'custom' : chassisKey(clsCars[e.teamNo % clsCars.length]);
  // race only: the grid in championship order after round 1 (pid -> slot)
  let gridOrder = null;
  if (w.round > 0 && w.opts.weekend === 'race') {
    const slotOf = Object.fromEntries(Object.entries(ent.entries).map(([slot, e]) => [e.pid, +slot]));
    gridOrder = WC.seriesStandings(w, sid).map(e => e.pid === 'P' ? 'P' : slotOf[e.pid]).filter(x => x !== undefined);
  }
  const cls = WC.seriesById(sid).cls;
  // your car: the one you bought (its condition costs a little power); a car of the wrong class (you've moved up and not
  // bought one yet) gets the car select instead
  const owned = w.car && CARS[carId(wc)]?.cls === cls;
  const car = CARS[carId(wc)]?.cls === cls ? wc : { ...wc, chassis: chassisKey(carsOfClass(cls)[0]) };
  const mods = owned ? { power: WC.condPower(w.car.cond), downforce: 1, drag: 1, brake: 1, grip: 1, rainGrip: 1, wear: 1, damage: 1, pitTime: 0, slip: 1, softs: false, launch: false } : null;
  const brief = `<b>${seriesName(sid).toUpperCase()} &middot; ROUND ${w.round + 1} OF ${w.opts.len}</b>`;
  const race = { mode: 'race', laps: w.opts.laps, opponents: 11, brief, pick: !owned, onlyClass: cls,
    extra: { car, mods, difficulty: w.opts.difficulty, grid: 'back', team: 'garage', roster: ent.roster, entries: ent.entries, teamPace: ent.teamPace, gridOrder, aiChassis: 'class', playerName: w.player.name.split(' ').pop().toUpperCase() } };
  phone.hide();
  if (w.opts.weekend !== 'race') return startWeekend(track, race, 'world', w.opts.weekend, [w.opts.pracLen, w.opts.qualiLen]);
  weekend = null;
  startRace(track, race, 'world');
}
function worldRoundDone(retired = false) {
  const w = world; if (!w || !sim) return;
  let res = sim.results();
  if (retired) { const me = res.find(r => r.isPlayer); res = res.filter(r => !r.isPlayer).concat([{ ...me, gap: 'DNF', time: null, dnf: true }]); res.forEach((r, k) => r.pos = k + 1); }
  const sid = w.player.series, round = w.round, trackName = w.series[sid].cal[round].name;
  useSession();
  const out = WC.recordPlayerRound(w, res, sim.log || [], wkUse && w.money ? { sets: wkUse.sets, laps: wkUse.laps, damage: wkUse.damage, aidPct: Math.max(0, sim.aidBonus ?? 0) } : null);
  wkUse = null;
  saveWorld();
  sim.setPaused(true);
  const scored = w.series[sid].results.find(x => x.round === round), ptsOf = (pid) => scored.rows.find(r => r.pid === pid)?.pts || 0;
  $('round-title').textContent = 'Round Complete';
  $('round-sub').textContent = `${seriesName(sid)} · round ${round + 1} of ${w.opts.len} · ${trackName}`;
  $('round-table').innerHTML = `<tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th class="r">PTS</th></tr>` + res.map(r => {
    const pid = r.isPlayer ? 'P' : r.pid, fl = scored.rows.find(x => x.pid === pid)?.fl;
    return `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${posBadge(r.pos)}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${pid ? WC.displayName(w, pid, true) : r.name}${fl ? ' <span class="fl">FASTEST LAP</span>' : ''}${r.pen || r.dt ? ` <span class="pen">${penText(r)}</span>` : ''}${r.dsq ? ' <span class="pen">DSQ</span>' : ''}</td><td>${r.team}</td><td class="n">${pid && ptsOf(pid) ? '+' + ptsOf(pid) : ''}</td></tr>`;
  }).join('');
  const me = out.me, st = WC.seriesStandings(w, sid), cp = st.findIndex(e => e.pid === 'P') + 1;
  const mateId = w.teams[w.player.team].drivers.find(d => d !== 'P'), mr = scored.rows.find(r => r.pid === mateId);
  const n = WC.unread(w);
  $('round-info').innerHTML = `<div class="big-pos">${!me || me.dnf ? (me && me.dsq ? 'DSQ' : 'DNF') : 'P' + me.pos}<small>${!me || me.dnf ? 'RETIRED' : 'FINISHED'}</small></div>
    <div class="row"><span>Points</span><span>${me ? '+' + me.pts : 0}</span></div>
    <div class="row"><span>Championship</span><span>${ord(cp)} &middot; ${st[cp - 1]?.pts ?? 0} pts</span></div>
    ${mr ? `<div class="row"><span>${w.people[mateId].last}</span><span>${mr.dnf ? 'DNF' : 'P' + mr.pos}</span></div>` : ''}
    ${out.bill ? `<div class="row"><span>The weekend</span><span class="${out.bill.net < 0 ? 'bad' : 'ok'}">${out.bill.net > 0 ? '+' : ''}${WC.money$(out.bill.net)}</span></div><div class="row"><span>Bank balance</span><span class="${w.money.balance < 0 ? 'bad' : ''}">${WC.money$(w.money.balance)}</span></div>` : ''}
    ${n ? `<div class="row"><span>Phone</span><span>${n} new</span></div>` : ''}`;
  menus['s-round'][0].setItems([{ label: out.over ? 'Season Review' : 'Continue', cls: 'action primary', action: () => openHub() }]);
  show('s-round');
  if (me && !me.dnf && me.pos <= 3) sfx.finish();
}

// ---------------- online ----------------
let net = null;          // Net connection (null when offline)
let lobby = null;        // host-authoritative lobby state (clients hold a copy)
let lobbyTrack = null;   // the chosen circuit (full JSON)
let netRace = null;      // { id, recorded } for the race in progress
let netSendT = 0;
const ONLINE_SET = { track: 0, laps: 5, ai: 5, difficulty: 'medium', grid: 'random', wear: 'normal', damage: 'normal', rules: 'arcade', mistakes: 'normal', time: 'track', weather: 'track', drift: 'off', aids: 'any' };
const shuffleArr = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
let toastT = 0;
function toast(msg, ms = 3500) { const t = $('toast'); t.innerHTML = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
const cleanName = (s) => (String(s || '').toUpperCase().replace(/[^A-Z0-9 ._-]/g, '').trim().slice(0, 14) || 'PLAYER');
function onlineStatus(msg, err = false) { const e = $('on-status'); e.textContent = msg; e.classList.toggle('err', err); }

function openOnline() {
  if (!Net.available()) { toast('Online needs <b>vendor/peerjs.min.js</b> — it is missing from this copy of the game.'); return; }
  $('on-name').value = settings.playerName || '';
  onlineStatus('');
  fadeTo(() => { if (!sim) startAttract(); show('s-online'); }, 200);
}
menus['s-online'] = [new Menu($('m-online'), [
  { label: 'Host Game', cls: 'action primary', action: () => hostGame(), desc: 'Open a room and get a code to send to your friends. You pick the circuit and rules.' },
  { label: 'Join Game', action: () => { if ($('on-code').value.trim().length < 5) { $('on-code').focus(); onlineStatus('Type the 5-letter room code your friend sent you, then press Enter.'); } else joinGame(); }, desc: 'Join a friend: type their room code, then press Enter.' },
  { label: 'Edit Name', action: () => $('on-name').focus(), desc: 'The name the other drivers see on the timing tower.' },
], { desc: 'd-online' })];
backs['s-online'] = () => { sfx.back(); fadeTo(() => show('s-main'), 200); };
$('on-name').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.target.blur(); } });
$('on-name').addEventListener('change', () => { settings.playerName = cleanName($('on-name').value); $('on-name').value = settings.playerName; saveSettings(); });
$('on-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); joinGame(); } else if (e.key === 'Escape') e.target.blur(); });
$('on-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
// Enter / Escape leave the text boxes; the menu picks up again
for (const id of ['on-name', 'on-code']) $(id).addEventListener('blur', () => clearEdges());
function myName() { settings.playerName = cleanName($('on-name').value || settings.playerName); saveSettings(); return settings.playerName; }
let connecting = false;

async function hostGame() {
  if (connecting) return; connecting = true;
  onlineStatus('Opening a room…');
  const n = new Net();
  try {
    const code = await n.host();
    net = n; wireNet();
    lobby = { code, hostId: n.id, players: [{ id: n.id, name: myName(), car: { ...settings.car }, ready: true, status: 'lobby' }], set: { ...ONLINE_SET }, points: {}, races: 0, rev: 0 };
    hostPickTrack(lobby.set.track);
    openLobby();
  } catch (e) { onlineStatus(e.message, true); sfx.error(); }
  connecting = false;
}
async function joinGame() {
  if (connecting) return; connecting = true;
  const code = $('on-code').value;
  onlineStatus('Connecting to ' + code.toUpperCase() + '…');
  const n = new Net();
  try {
    await n.join(code);
    net = n; wireNet();
    net.send({ t: 'assets', assets: assets.pick(liveryAssetIds(settings.car)) });
    net.send({ t: 'hello', ver: PROTO, name: myName(), car: { ...settings.car } });
    onlineStatus('Connected, waiting for the host…');
  } catch (e) { onlineStatus(e.message, true); sfx.error(); }
  connecting = false;
}
function leaveOnline(msg) {
  if (net) net.close();
  net = null; lobby = null; netRace = null;
  raceAidRule = 'any'; // (the host's driver-aid rule ends with the session)
  if (msg) toast(msg, 5000);
  quitToMenu();
}

// host: circuits it can pick from
// (real circuits go light: everyone loads the scenery from their own copy)
function onlineTracks() { const l = [...realTracks(), ...presetTracks(), ...savedTracks()]; if (editorTrack) l.unshift(editorTrack); return l; }
function hostPickTrack(k) {
  const list = onlineTracks();
  lobby.set.track = Math.max(0, Math.min(list.length - 1, k));
  lobbyTrack = cloneTrack(list[lobby.set.track]);
  lobby.trackName = lobbyTrack.name; lobby.trackRev = (lobby.trackRev || 0) + 1;
  if (net) net.send({ t: 'track', track: lobbyTrack, rev: lobby.trackRev });
}
function hostBroadcast() { if (!net || !net.isHost) return; lobby.rev++; lobby.players.forEach(p => { if (p.id !== net.id) p.ping = Math.round(net.pingOf(p.id)); }); net.send({ t: 'lobby', lobby }); renderLobby(); }
function me() { return lobby && lobby.players.find(p => p.id === net.id); }
function setMyStatus(status) {
  if (!net || !lobby) return;
  if (net.isHost) { const p = me(); if (p) p.status = status; hostBroadcast(); }
  else net.send({ t: 'status', status });
}

function wireNet() {
  net.on('message', (m, from) => {
    if (net.isHost) hostMessage(m, from); else clientMessage(m);
  });
  net.on('state', (m) => { if (sim && sim.net && netRace && m.race === netRace.id) { sim.netReceive(m.cars, m.time); if (m.rc !== undefined) sim.rc.netApply(m.rc); } });
  net.on('left', (pid) => {
    const p = lobby && lobby.players.find(x => x.id === pid);
    if (!p) return;
    lobby.players = lobby.players.filter(x => x.id !== pid);
    toast(`<b>${p.name}</b> left the room`);
    if (sim && sim.net) { sim.dropCar('h:' + pid); net.send({ t: 'drop', key: 'h:' + pid }); }
    hostBroadcast();
  });
  net.on('hostLost', () => { if (net) leaveOnline('The host closed the room.'); });
}
// custom decal images travel once, separately from the (small) car data
function allLobbyAssets() { const ids = []; for (const p of lobby.players) ids.push(...liveryAssetIds(p.car || {})); return assets.pick(ids); }
function hostMessage(m, from) {
  if (m.t === 'assets') { for (const [id, url] of Object.entries(m.assets || {})) assets.put(id, url); net.send({ t: 'assets', assets: m.assets || {} }); return; }
  if (m.t === 'hello') {
    if (m.ver !== PROTO) { net.sendTo(from, { t: 'reject', reason: 'Your game version does not match the host. Get the latest copy.' }); setTimeout(() => net.hostDrop(from), 400); return; }
    if (lobby.players.length >= 8) { net.sendTo(from, { t: 'reject', reason: 'That room is full (8 drivers).' }); setTimeout(() => net.hostDrop(from), 400); return; }
    let name = cleanName(m.name), k = 2;
    while (lobby.players.some(p => p.name === name)) name = cleanName(m.name).slice(0, 12) + ' ' + k++;
    lobby.players.push({ id: from, name, car: m.car, ready: false, status: 'lobby' });
    net.sendTo(from, { t: 'track', track: lobbyTrack, rev: lobby.trackRev });
    net.sendTo(from, { t: 'assets', assets: allLobbyAssets() });
    toast(`<b>${name}</b> joined`); sfx.best();
    hostBroadcast();
  } else if (m.t === 'update') {
    const p = lobby.players.find(x => x.id === from); if (!p) return;
    if (m.car) p.car = m.car;
    if (m.ready !== undefined) p.ready = !!m.ready;
    hostBroadcast();
  } else if (m.t === 'car') {
    const p = lobby.players.find(x => x.id === from); if (!p || !m.car) return;
    p.car = m.car;
    net.send({ t: 'car', race: m.race, key: 'h:' + from, car: m.car });
    if (sim && sim.net && netRace && m.race === netRace.id) sim.netCarPicked('h:' + from, m.car);
  } else if (m.t === 'status') {
    const p = lobby.players.find(x => x.id === from); if (!p) return;
    p.status = m.status; hostBroadcast();
  } else if (m.t === 'bye') net.hostDrop(from);
}
function clientMessage(m) {
  if (m.t === 'reject') { leaveOnline(m.reason); return; }
  if (m.t === 'kick') { leaveOnline('You were removed from the room.'); return; }
  if (m.t === 'closed') { leaveOnline('The host closed the room.'); return; }
  if (m.t === 'track') { lobbyTrack = m.track; if (screen === 's-lobby') renderLobby(); return; }
  if (m.t === 'assets') { for (const [id, url] of Object.entries(m.assets || {})) assets.put(id, url); return; }
  if (m.t === 'lobby') {
    const first = !lobby;
    lobby = m.lobby;
    if (first) openLobby(); else if (screen === 's-lobby') renderLobby();
    return;
  }
  if (m.t === 'start') { beginNetRace(m); return; }
  if (m.t === 'drop') { if (sim && sim.net) sim.dropCar(m.key); return; }
  if (m.t === 'car') { if (sim && sim.net && netRace && m.race === netRace.id && m.key !== 'h:' + net.id) sim.netCarPicked(m.key, m.car); return; }
  if (m.t === 'end') { if (sim && sim.net && netRace && m.race === netRace.id) { netRace.final = m.rows; if (screen === 'hud' || screen === 's-pause') showNetResults(); else if (screen === 's-results') renderNetResults(); } return; }
}

// ----- lobby screen -----
function openLobby() {
  $('lob-code').textContent = lobby.code || net.code;
  renderLobby();
  focusIdx['s-lobby'] = 0;
  fadeTo(() => { if (!sim || sim.net) { disposeSim(); startAttract(); } show('s-lobby'); }, 200);
}
const statusTxt = (p) => p.status === 'race' ? ['RACING', 'run'] : p.status === 'results' ? ['RESULTS', 'run'] : p.id === lobby.hostId ? ['HOST', 'ok'] : p.ready ? ['READY', 'ok'] : ['NOT READY', 'no'];
function renderLobby() {
  if (!lobby) return;
  const host = net.isHost, S = lobby.set;
  $('lob-code').textContent = lobby.code || net.code;
  $('lob-sub').textContent = `${lobby.players.length} driver${lobby.players.length === 1 ? '' : 's'} in the room · ${host ? 'you are the host' : 'the host sets up the race'}`;
  $('lob-players').innerHTML = lobby.players.map(p => {
    const [st, cls] = statusTxt(p);
    return `<tr class="${p.id === net.id ? 'me' : ''}"><td><span class="swatch" style="background:${hex(p.car?.main ?? 0xffffff)}"></span>${p.name}${p.id === lobby.hostId ? '<span class="host">&#9733;</span>' : ''}</td><td class="ping">${p.id === lobby.hostId ? '' : (p.ping ? p.ping + ' ms' : '')}</td><td class="st ${cls}">${st}</td></tr>`;
  }).join('') + (lobby.players.length < 2 ? `<tr><td colspan="3" class="empty">Waiting for friends&hellip; send them the room code.</td></tr>` : '');
  const pts = Object.entries(lobby.points || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.pts - a.pts);
  const drift = pts.some(r => r.drift) || (S.drift || 'off') === 'on', fmtD = (n) => Math.round(n || 0).toLocaleString('en-US');
  $('lob-points').innerHTML = pts.length ? (drift ? `<tr><th></th><th></th><th class="n">WINS</th><th class="n">PTS</th><th class="n">DRIFT</th></tr>` : '')
    + pts.map((r, k) => `<tr class="${r.id === net.id ? 'me' : ''}"><td class="p">${k + 1}</td><td>${r.name}</td><td class="n">${r.wins} W</td><td class="n">${r.pts}</td>${drift ? `<td class="n">${fmtD(r.drift)}</td>` : ''}</tr>`).join('')
    : `<tr><td class="empty">F1 points for every race you do together.</td></tr>`;
  if (lobbyTrack) {
    const t = lobbyTrack, T = sampleTrack(t);
    drawTrackMap(T, $('lob-preview'));
    const cond = { time: S.time === 'track' ? t.env.time : S.time, weather: S.weather === 'track' ? t.env.weather : S.weather }, st = trackStats(T);
    $('lob-info').innerHTML = `<div class="ti-name">${t.name}</div>` + trackCard(t, st, cond) + (() => {
      // (the host's driver-aid rule shows for everyone, since it changes how you drive)
      const chips = [st.open ? '' : `<span>${S.laps} lap${S.laps === 1 ? '' : 's'}</span>`, (S.aids || 'any') !== 'any' ? `<span class="wx-chip">${AID_RULES.find(r => r[0] === S.aids)[1]}</span>` : ''].join('');
      return chips ? `<div class="ti-chips">${chips}</div>` : '';
    })();
  }
  const m = menus['s-lobby'][0];
  const humans = lobby.players.length;
  if (host) {
    const tracks = onlineTracks();
    const ready = lobby.players.filter(p => p.id === net.id || p.ready).length;
    const busy = lobby.players.filter(p => p.id !== net.id && p.status !== 'lobby').length;
    m.setItems([
      { label: `Start Race<small>${ready}/${humans} READY${busy ? ` · ${busy} RACING` : ''}</small>`, cls: 'action primary', action: () => hostStart(), desc: humans < 2 ? 'You can race on your own with AI, or wait for friends to join with the room code.' : 'Start the race for everyone in the room.' },
      { label: 'Circuit', values: tracks.map((t, k) => [k, t.name]), get: () => S.track, set: v => { hostPickTrack(v); hostBroadcast(); }, desc: 'The circuit. Your saved circuits are sent to everyone automatically.' },
      { label: 'Laps', values: [1, 2, 3, 5, 8, 10, 15, 20].map(v => [v, String(v)]), get: () => S.laps, set: v => { S.laps = v; hostBroadcast(); } },
      { label: 'AI Cars', values: Array.from({ length: 13 - humans }, (_, i) => [i, String(i)]), get: () => Math.min(S.ai, 12 - humans), set: v => { S.ai = v; hostBroadcast(); }, desc: 'AI cars that fill the rest of the grid.' },
      { label: 'AI Difficulty', values: Object.entries(DIFF_LABEL), get: () => S.difficulty, set: v => { S.difficulty = v; hostBroadcast(); } },
      { label: 'Grid', values: [['random', 'Random'], ['back', 'Humans at back'], ['front', 'Humans on front']], get: () => S.grid, set: v => { S.grid = v; hostBroadcast(); } },
      { label: 'Time', values: [['track', 'Track default'], ['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], get: () => S.time, set: v => { S.time = v; hostBroadcast(); } },
      { label: 'Weather', values: [['track', 'Track default'], ['clear', 'Clear'], ['overcast', 'Overcast'], ['rain', 'Rain'], ['fog', 'Fog']], get: () => S.weather, set: v => { S.weather = v; hostBroadcast(); } },
      { label: 'Tyre Wear', values: [['off', 'Off'], ['normal', 'Normal'], ['fast', 'Fast (x2.5)']], get: () => S.wear, set: v => { S.wear = v; hostBroadcast(); } },
      { label: 'Damage', values: [['off', 'Off'], ['normal', 'Normal'], ['high', 'Realistic']], get: () => S.damage, set: v => { S.damage = v; hostBroadcast(); } },
      { label: 'Drift Points', values: [['off', 'Off'], ['on', 'On']], get: () => S.drift || 'off', set: v => { S.drift = v; hostBroadcast(); }, desc: 'Score points for sliding road and GT cars. Everyone\'s drift score adds up in the session table.' },
      { label: 'Race Rules', values: RULES_VALS, get: () => S.rules || 'arcade', set: v => { S.rules = v; hostBroadcast(); }, desc: RULES_DESC },
      { label: 'AI Mistakes', values: MISTAKE_VALS, get: () => S.mistakes || 'normal', set: v => { S.mistakes = v; hostBroadcast(); }, desc: MISTAKE_DESC },
      { label: 'Driver Aids', values: AID_RULES, get: () => S.aids || 'any', set: v => { S.aids = v; hostBroadcast(); }, desc: AID_RULE_DESC },
      { label: 'Garage', action: () => openGarage('s-lobby'), desc: 'Change your car and livery. Everyone sees it.' },
      { label: 'Copy Room Code', action: () => { navigator.clipboard?.writeText(lobby.code).then(() => toast('Room code <b>' + lobby.code + '</b> copied'), () => toast('Room code: <b>' + lobby.code + '</b>')); }, desc: 'Copy the code to paste into a message to your friends.' },
      { label: 'Close Room', confirm: 'Close room? Select again', action: () => backs['s-lobby'](), desc: 'Everyone goes back to the menu.' },
    ], true);
  } else {
    const mine = me();
    m.setItems([
      { label: 'Ready', values: [[true, 'READY'], [false, 'NOT READY']], get: () => !!mine?.ready, set: v => { if (mine) mine.ready = v; net.send({ t: 'update', ready: v }); renderLobby(); }, desc: 'Tell the host you are ready. The host starts the race.' },
      { label: 'Garage', action: () => openGarage('s-lobby'), desc: 'Change your car and livery. Everyone sees it.' },
      { label: 'Leave Room', confirm: 'Leave? Select again', action: () => backs['s-lobby'](), desc: 'Leave the room and go back to the menu.' },
    ], true);
  }
}
menus['s-lobby'] = [new Menu($('m-lobby'), [], { desc: 'd-lobby' })];
backs['s-lobby'] = () => { sfx.back(); leaveOnline(); };

function hostStart() {
  const S = lobby.set;
  if (!lobbyTrack) return;
  const humans = shuffleArr(lobby.players.map(p => ({ k: 'h', id: p.id, name: p.name, car: p.car, teamName: p.car?.teamName })));
  // team 0 is the "player" team (driver YOU), so only humans may use it
  const teams = [0, ...shuffleArr(TEAMS.map((_, i) => i).slice(1))];
  humans.forEach((h, i) => h.team = teams[i]);
  const nAI = Math.max(0, Math.min(S.ai, 12 - humans.length));
  const ais = teams.slice(humans.length, humans.length + nAI).map(t => ({ k: 'a', team: t }));
  const grid = S.grid === 'back' ? [...shuffleArr(ais), ...humans] : S.grid === 'front' ? [...humans, ...shuffleArr(ais)] : shuffleArr([...humans, ...ais]);
  const track = cloneTrack(lobbyTrack);
  if (S.time !== 'track') track.env.time = S.time;
  if (S.weather !== 'track') track.env.weather = S.weather;
  const m = { t: 'start', race: Math.random().toString(36).slice(2, 9), track, grid, cfg: { laps: S.laps, difficulty: S.difficulty, wear: S.wear, damage: S.damage, rules: S.rules || 'arcade', mistakes: S.mistakes || 'normal', drift: S.drift || 'off', aids: S.aids || 'any' },
    aiChassis: settings.aiChassis, aiClassCar: carId(settings.car), t0: net.now() + 4500, goDelay: 4.5 + 0.6 + Math.random() * 1.2, pick: 15, strat: 20 };
  net.send(m);
  lobby.races++;
  beginNetRace(m);
}
function beginNetRace(m) {
  netRace = { id: m.race, recorded: false, final: null };
  setMyStatus('race');
  if (screen === 's-garage') garage.close();
  startRace(m.track, {
    mode: 'race', laps: m.cfg.laps,
    extra: {
      aiChassis: m.aiChassis || 'custom', aiClassCar: m.aiClassCar || 'f1', difficulty: m.cfg.difficulty, wear: m.cfg.wear, damage: m.cfg.damage, rules: m.cfg.rules || 'arcade', aiMistakes: m.cfg.mistakes || 'normal', team: 'garage', startTyre: 'auto', grid: 'back', drift: m.cfg.drift || 'off', aidRule: m.cfg.aids || 'any',
      net: { host: net.isHost, myId: net.id, grid: m.grid, t0: m.t0, goDelay: m.goDelay, pick: m.pick || 0, strat: m.strat || 0, clock: () => net.now() },
    },
  }, 'online');
}
// every frame of an online race: stream my car(s); the host scores the race once all humans are done
let lobbyPingT = 0;
function netTick(dt) {
  if (net && net.isHost && lobby && screen === 's-lobby' && (lobbyPingT += dt) > 3) { lobbyPingT = 0; hostBroadcast(); }
  if (!sim || !sim.net || !net || !netRace) return;
  netSendT += dt;
  if (netSendT >= 0.05) { netSendT = 0; net.sendState({ t: 'st', race: netRace.id, time: net.now(), cars: sim.netStates(), ...(net.isHost ? { rc: sim.rc.netState() } : {}) }); }
  if (net.isHost && !netRace.recorded) {
    // score once everyone is home, or 60s after the winner (like a real chequered flag cut-off)
    const humansDone = sim.cars.filter(c => c.human).every(c => c.finished || c.gone);
    const allDone = sim.cars.every(c => c.finished || c.gone);
    const win = sim.finishOrder[0];
    if (humansDone && (allDone || (win && sim.raceTime - win.finishTime > 60))) hostRecord(false);
  }
}
function hostRecord(forced) {
  if (netRace.recorded) return;
  netRace.recorded = true;
  const rows = sim.results();
  rows.forEach((r, k) => {
    if (!r.human) return;
    const id = r.key.slice(2), pts = !r.dnf && k < 10 ? CAREER.POINTS[k] : 0;
    const e = lobby.points[id] || (lobby.points[id] = { name: r.name, pts: 0, wins: 0 });
    e.name = r.name; e.pts += pts; if (k === 0 && !r.dnf) e.wins++;
    e.drift = (e.drift || 0) + (r.drift || 0);
  });
  netRace.final = rows.map(slimRow);
  net.send({ t: 'end', race: netRace.id, rows: netRace.final, forced });
  hostBroadcast();
  if (screen === 's-results') renderNetResults();
}
const slimRow = (r) => ({ pos: r.pos, name: r.name, team: r.team, color: r.color, human: r.human, key: r.key, time: r.time, gap: r.gap, best: isFinite(r.best) ? r.best : null, pits: r.pits, pen: r.pen || 0, dt: r.dt || 0, dsq: !!r.dsq, dnf: r.dnf, finished: r.finished, lap: r.lap, drift: r.drift || 0 });

function showNetResults() {
  setMyStatus('results');
  renderNetResults();
  show('s-results');
  menus['s-results'][0].i = 0;
}
function renderNetResults() {
  if (!sim) return;
  $('results-title').textContent = 'Race Results';
  const final = netRace && netRace.final;
  const myKey = sim.player && sim.player.key;
  const rows = (final || sim.results().map(slimRow)).map(r => ({ ...r, isPlayer: r.key === myKey,
    gap: !final && !r.finished && !r.dnf ? `RUNNING · L${Math.min(r.lap, sim.laps)}` : r.gap }));
  renderResultsTable(rows);
  const drifts = sim.drift ? rows.filter(r => r.human).sort((a, b) => b.drift - a.drift).map(r => `${r.name} <b>${Math.round(r.drift || 0).toLocaleString('en-US')}</b>`).join(' &middot; ') : '';
  $('results-table').insertAdjacentHTML('afterbegin', !final ? `<caption class="live">Race in progress &middot; waiting for everyone to finish&hellip;</caption>`
    : drifts ? `<caption class="drift-res">DRIFT <span>${drifts}</span></caption>` : '');
  const waiting = sim.cars.some(c => c.human && !c.finished && !c.gone);
  const items = [];
  if (net && net.isHost) items.push({ label: waiting && !final ? 'End Race For Everyone' : 'Back To Lobby', action: () => { if (!netRace.recorded) hostRecord(true); backToLobby(); } });
  else items.push({ label: 'Back To Lobby', action: () => backToLobby() });
  items.push({ label: 'Leave Session', action: () => leaveOnline() });
  const m = menus['s-results'][0], i = m.i;
  m.setItems(items); m.i = Math.min(i, items.length - 1); m.render();
}
function backToLobby() {
  if (!net) return quitToMenu();
  setMyStatus('lobby');
  fadeTo(() => { disposeSim(); startAttract(); renderLobby(); show('s-lobby'); });
}

// ---------------- car select (on the grid, before the strategy) ----------------
const ENGINE_NAME = { f1v6: '1.6 V6 turbo hybrid', v10: '3.0 V10', v8flat: 'Flat-plane V8', v8cross: 'V8', v8truck: 'Big-block V8', i6: 'Straight six',
  i6turbo: 'Twin-turbo straight six', v6turbo: 'Twin-turbo V6', v6na: 'V6', flat6: 'Flat six', flat6turbo: 'Turbo flat six', flat12: 'Flat twelve', i4turbo: 'Turbo four', diesel: 'Turbo diesel' };
const CLASS_COL = { f1: '#e1261c', gt1: '#2a7fd0', street: '#e8b13a', fun: '#4f9a3c' };
let csel = null; // { cls, id, shownId, t, blip }
const carReady = (id) => id === 'svgp' || (id === 'f1' ? customCarStatus() === 'ready' : chassisReady(id));
const carsOfClass = (cls) => Object.keys(CARS).filter(id => CARS[id].cls === cls && carReady(id));
const classList = () => Object.keys(CLASSES).filter(k => carsOfClass(k).length);
const selClasses = () => csel && csel.only ? [csel.only] : classList();
// stats, with bars scaled across the whole garage
const carStats = (id) => {
  const s = CARS[id].spec;
  return { power: s.power / 745.7, weight: s.mass, top: s.gears[s.gears.length - 1] * 3.6, grip: s.mu, df: s.kd };
};
let statRange = null;
function statBar(key, v, invert = false) {
  if (!statRange) {
    statRange = {};
    const all = Object.keys(CARS).map(carStats);
    for (const k of Object.keys(all[0])) statRange[k] = [Math.min(...all.map(a => a[k])), Math.max(...all.map(a => a[k]))];
  }
  const [lo, hi] = statRange[key];
  let f = (v - lo) / Math.max(1e-6, hi - lo); if (invert) f = 1 - f;
  return (10 + 90 * f).toFixed(1) + '%';
}
function openCarSelect() {
  const only = lastRace && lastRace.cfg.onlyClass; // (World Career: the series decides the class)
  const want = carId(settings.car);
  let id = carReady(want) ? want : 'svgp';
  if (only && CARS[id].cls !== only) id = carId(sim.opts.car) in CARS && CARS[carId(sim.opts.car)].cls === only ? carId(sim.opts.car) : carsOfClass(only)[0];
  csel = { cls: CARS[id].cls, id, shownId: carId(sim.opts.car), t: 0, blip: 0, only };
  const env = sim.track.env;
  $('cs-track').textContent = sim.track.name;
  $('cs-cond').textContent = `${sim.mode === 'test' ? 'Time Trial' : sim.quali ? SESSION_NAME[sim.quali.kind] : sim.laps + (sim.laps === 1 ? ' Lap' : ' Laps')} · ${env.time} · ${env.weather}`;
  $('cs-go').innerHTML = 'Select Car &#9656;';
  renderCarSelect(true);
  show('s-carsel');
}
function renderCarSelect(swap = false) {
  const { cls, id } = csel, C = CARS[id], st = carStats(id), s = C.spec, col = CLASS_COL[cls] || '#2a7fd0';
  const cur = carId(settings.car), mph = settings.units === 'mph';
  $('cs-tabs').innerHTML = selClasses().map(k => `<span data-cls="${k}" class="${k === cls ? 'on' : ''}" style="--c:${CLASS_COL[k]}">${CLASSES[k].label}</span>`).join('');
  $('cs-cars').innerHTML = carsOfClass(cls).map(k => `<div class="cs-card${k === id ? ' on' : ''}${k === cur ? ' cur' : ''}" data-id="${k}" style="--c:${col}"><small>${CLASSES[cls].short}</small><b>${CARS[k].name}</b></div>`).join('');
  const drive = s.drive >= 0.99 ? 'Front-wheel drive' : s.drive > 0.01 ? 'All-wheel drive' : 'Rear-wheel drive';
  const paint = C.cls === 'f1' || C.livery ? 'Your livery' : C.paint ? 'Takes your colour' : 'Original livery';
  const cr = CAR_CREDITS[id];
  const row = (label, key, v, text, inv) => `<div class="cs-stat"><span>${label}</span><i><b style="--w:${statBar(key, v, inv)}"></b></i><em>${text}</em></div>`;
  const info = $('cs-info');
  info.style.setProperty('--c', col);
  info.innerHTML = `<div class="cs-cls">${CLASSES[cls].label}</div>
    <div class="cs-name">${C.name}</div>
    <div class="cs-chips"><span>${drive}</span><span>${s.gears.length - 1}-speed ${s.box || ''}</span><span>${ENGINE_NAME[C.sound] || ''}</span><span class="gold">${paint}</span></div>
    <div class="cs-stats">
      ${row('Power', 'power', st.power, Math.round(st.power) + ' hp')}
      ${row('Weight', 'weight', st.weight, Math.round(st.weight) + ' kg', true)}
      ${row('Top Speed', 'top', st.top, mph ? Math.round(st.top / 1.609) + ' mph' : Math.round(st.top) + ' km/h')}
      ${row('Grip', 'grip', st.grip, st.grip.toFixed(2) + ' g')}
      ${row('Downforce', 'df', st.df, st.df < 0.05 ? 'None' : st.df < 1 ? 'Low' : st.df < 2 ? 'Medium' : 'High')}
    </div>
    <div class="cs-credit">${cr ? `Model: ${cr.author} &middot; ${cr.license}` : 'Model: yours'}</div>`;
  if (swap) { info.classList.remove('swap'); void info.offsetWidth; info.classList.add('swap'); }
  const on = $('cs-cars').querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $('cs-tabs').querySelectorAll('span').forEach(el => el.onclick = () => setSelClass(el.dataset.cls));
  $('cs-cars').querySelectorAll('.cs-card').forEach(el => el.onclick = () => { if (el.dataset.id === csel.id) confirmCar(); else pickSelCar(el.dataset.id); });
}
$('cs-go').onclick = () => confirmCar();
function pickSelCar(id) { if (id === csel.id) return; csel.id = id; csel.cls = CARS[id].cls; sfx.move(); renderCarSelect(true); }
function setSelClass(cls) {
  if (cls === csel.cls) return;
  const list = carsOfClass(cls), cur = carId(settings.car);
  pickSelCar(list.includes(cur) ? cur : list[0]);
}
function carSelectInput(dt) {
  const left = pressed('ArrowLeft') | pressed('KeyA') | pressed('GP14') | pressed('GPSL');
  const right = pressed('ArrowRight') | pressed('KeyD') | pressed('GP15') | pressed('GPSR');
  const up = pressed('ArrowUp') | pressed('KeyW') | pressed('GP12') | pressed('GPSU') | pressed('GP4') | pressed('KeyQ');
  const down = pressed('ArrowDown') | pressed('KeyS') | pressed('GP13') | pressed('GPSD') | pressed('GP5') | pressed('KeyE');
  const ok = pressed('Enter') | pressed('Space') | pressed('GP0') | pressed('GP9');
  const back = pressed('Escape') | pressed('Backspace') | pressed('GP1');
  if (csel.busy) return;
  if (back) { backs['s-carsel'](); return; }
  if (ok) { confirmCar(); return; }
  const list = carsOfClass(csel.cls), i = list.indexOf(csel.id);
  if (left || right) pickSelCar(list[(i + (right ? 1 : -1) + list.length) % list.length]);
  if (up || down) { const cl = selClasses(), k = cl.indexOf(csel.cls); setSelClass(cl[(k + (down ? 1 : -1) + cl.length) % cl.length]); }
  // the car on the grid follows (a short wait so scrolling past cars doesn't build every one), with a throttle blip
  csel.t += dt; csel.blip = Math.max(0, csel.blip - dt);
  if (csel.id !== csel.shownId && csel.t > 0.12) {
    sim.previewCar({ ...settings.car, chassis: chassisKey(csel.id) });
    csel.shownId = csel.id; csel.t = 0; csel.blip = 0.35;
  }
}
function confirmCar() {
  if (!csel || screen !== 's-carsel' || csel.busy) return;
  csel.busy = true; sfx.select();
  settings.car.chassis = chassisKey(csel.id); saveSettings();
  if (sim.net && net && netRace) {
    const car = { ...settings.car };
    if (net.isHost) { const p = me(); if (p) p.car = car; net.send({ t: 'car', race: netRace.id, key: 'h:' + net.id, car }); }
    else net.send({ t: 'car', race: netRace.id, car });
  }
  fadeTo(() => { if (!sim) return; sim.commitCar(settings.car); sim.startAfterPick(); enterRace(); });
}
backs['s-carsel'] = () => { if (raceReturn === 'setup') { sfx.back(); fadeTo(() => { disposeSim(); openSetup(editorTrack, { select: sim?.track?.name ?? lastRace.track.name, toSettings: true }); }); } };

// ---------------- pre-race strategy ----------------
const TYRE_COL = { soft: '#e0302a', medium: '#f2d22a', hard: '#f0f0f0', wet: '#3a8af0' };
let strat = null; // { choices, custom, locked }
function stratChart(pr, R) {
  const W = 470, H = 124, L = 34, Rm = 62, top = 16, bot = 22, w = W - L - Rm, h = H - top - bot;
  const X = (l) => L + (l / R) * w, Y = (f) => top + (1 - f) * h;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><text x="${L}" y="11" class="ax">TYRE LIFE</text>`;
  svg += `<text x="${L - 4}" y="${Y(1) + 4}" class="yl">100%</text><text x="${L - 4}" y="${Y(0.5) + 4}" class="yl">50%</text><text x="${L - 4}" y="${Y(0) + 4}" class="yl">0%</text>`;
  svg += `<line x1="${L}" x2="${L + w}" y1="${Y(0.3)}" y2="${Y(0.3)}" class="cliff"/>`;
  let a = 0;
  pr.tyre.forEach((t, k) => {
    const x0 = X(a), x1 = X(a + t.laps), col = TYRE_COL[t.c];
    svg += `<polygon points="${x0},${Y(0)} ${x0},${Y(1)} ${x1},${Y(t.end)} ${x1},${Y(0)}" fill="${col}" fill-opacity=".32"/>`;
    svg += `<line x1="${x0}" y1="${Y(1)}" x2="${x1}" y2="${Y(t.end)}" stroke="${col}" stroke-width="2.5"/>`;
    svg += `<text x="${(x0 + x1) / 2}" y="${Y(0.12)}" class="n">${t.laps}</text>`;
    a += t.laps;
    if (k < pr.tyre.length - 1) svg += `<line x1="${x1}" x2="${x1}" y1="${Y(1)}" y2="${Y(0)}" class="pit"/><text x="${x1}" y="${H - 6}" class="pl">${a}</text>`;
  });
  svg += `<text x="${L}" y="${H - 6}" class="pl" text-anchor="start">PIT LAP</text><text x="${X(R)}" y="${H - 6}" class="pl">${R}</text>`;
  // projected lap times (dashed), ignoring the start and pit laps
  const clean = pr.laps.map((t, i) => { let s = t; if (i === 0) s -= 2.5; return s; }).map((t, i, arr) => (i > 0 && t - arr[i - 1] > sim.pitLoss * 0.8 ? t - sim.pitLoss : t));
  const lo = Math.min(...clean), hi = Math.max(...clean) + 0.001, span = Math.max(hi - lo, 1);
  const pts = clean.map((t, i) => `${X(i + 0.5)},${Y(0.08 + 0.5 * (t - lo) / span)}`).join(' ');
  svg += `<polyline points="${pts}" class="lt"/>`;
  svg += `<text x="${L + w + 6}" y="${Y(0.58) + 4}" class="rl">${fmtTime(lo + span, 1)}</text><text x="${L + w + 6}" y="${Y(0.08) + 4}" class="rl">${fmtTime(lo, 1)}</text><text x="${L + w + 6}" y="11" class="ax" text-anchor="start">LAP TIME</text>`;
  return svg + '</svg>';
}
function stratCard(title, desc, plan, recTotal, tag = 'Projected') {
  const pr = sim.projectPlan(plan), R = sim.laps;
  const d = recTotal != null ? pr.total - recTotal : null;
  const delta = d != null && Math.abs(d) > 0.05 ? `<em class="${d < 0 ? 'f' : 's'}">${d < 0 ? '-' : '+'}${Math.abs(d).toFixed(1)}s</em>` : '';
  return `<div class="sc"><div class="sc-l"><div class="sc-h"><i class="chk"></i>${title}<small>${tag}</small></div><p>${desc}</p>
    <div class="sc-n"><div><span>Pit Stops</span><b>${pr.stops}</b></div><div><span>Laps</span><b>${R}</b></div><div><span>Time</span><b>${fmtTime(pr.total, 3)}</b>${delta}</div></div>
    ${pr.cliff ? '<div class="warn">&#9888; A stint runs past the tyre cliff (30%)</div>' : ''}</div>
    <div class="sc-r">${stratChart(pr, R)}</div></div>`;
}
function stratForecast(env) {
  const wx = env.weather, tm = env.time;
  const ico = wx === 'rain' ? '<i class="wx rain">&#9730;</i>' : wx === 'fog' ? '<i class="wx fog">&#8776;</i>' : wx === 'overcast' ? '<i class="wx cloud">&#9729;</i>' : tm === 'night' ? '<i class="wx moon">&#9790;</i>' : '<i class="wx sun">&#9728;</i>';
  $('st-fore').innerHTML = Array.from({ length: 5 }, () => `<span>${ico}</span>`).join('');
  const track = { day: 34, dusk: 27, night: 21 }[tm] - (wx === 'rain' ? 8 : wx === 'overcast' || wx === 'fog' ? 6 : 0);
  $('st-track').textContent = sim.track.name;
  $('st-cond').innerHTML = `<div>${ico}<span><small>Track</small><b>${track}&deg;C</b></span></div><div><i class="wx air">&#8779;</i><span><small>Air</small><b>${track - 7}&deg;C</b></span></div>`;
}
function openStrategy() {
  const choices = sim.strategyChoices();
  strat = { choices, custom: { stints: choices[0].plan.stints.map(s => ({ ...s })) }, locked: null };
  stratForecast(sim.track.env);
  renderStrategy(true);
  show('s-strat');
  updateStratTimer();
}
function customRows() {
  const R = sim.laps, cu = strat.custom.stints;
  const comps = sim.rain ? ['wet', 'soft', 'medium', 'hard'] : ['soft', 'medium', 'hard', 'wet'];
  const bounds = () => { const b = []; let a = 0; for (let k = 0; k < cu.length - 1; k++) { a += cu[k].laps; b.push(a); } return b; };
  const setBounds = (b) => { const cuts = [0, ...b, R]; cu.forEach((s, k) => s.laps = cuts[k + 1] - cuts[k]); };
  const tyreName = (c) => `<span class="tyre-dot" style="background:${TYRE_COL[c]}"></span>${c.toUpperCase()}`;
  const rows = [{ label: 'Pit Stops', cls: 'srow', values: Array.from({ length: Math.min(3, R - 1) + 1 }, (_, i) => [i, String(i)]), get: () => cu.length - 1,
    set: v => {
      const n = v + 1, cycle = sim.rain ? ['wet'] : ['medium', 'hard', 'soft'];
      while (cu.length < n) cu.push({ c: cycle[(cu.length - 1) % cycle.length], laps: 1 });
      cu.length = n;
      setBounds(Array.from({ length: v }, (_, k) => Math.round(R * (k + 1) / n)));
      renderStrategy();
    } }];
  cu.forEach((st, k) => {
    rows.push({ label: `Stint ${k + 1} Tyre`, cls: 'srow', values: comps.map(c => [c, tyreName(c)]), get: () => cu[k].c, set: v => { cu[k].c = v; renderStrategy(); } });
    if (k < cu.length - 1) {
      const b = bounds(), lo = (b[k - 1] || 0) + 1, hi = (b[k + 1] || R) - 1;
      rows.push({ label: `Stop ${k + 1} · End Of Lap`, cls: 'srow', values: Array.from({ length: Math.max(1, hi - lo + 1) }, (_, i) => [lo + i, String(lo + i)]), get: () => bounds()[k],
        set: v => { const bb = bounds(); bb[k] = v; setBounds(bb); renderStrategy(); } });
    }
  });
  return rows;
}
function renderStrategy(first = false) {
  const m = menus['s-strat'][0], online = !!sim.net;
  const recTotal = sim.projectPlan(strat.choices[0].plan).total;
  const mark = (k) => strat.locked === k ? 'Selected' : 'Projected';
  const items = strat.choices.map((ch, k) => ({ label: stratCard(ch.title, ch.desc, ch.plan, k ? recTotal : null, mark(k)), cls: 'scard' + (strat.locked === k ? ' locked' : ''), action: () => pickStrategy(k) }));
  items.push({ label: stratCard('Custom Strategy', 'Your call: set the stops and compounds below, then pick this card.', strat.custom, recTotal, mark('custom')), cls: 'scard' + (strat.locked === 'custom' ? ' locked' : ''), action: () => pickStrategy('custom') });
  items.push(...customRows());
  m.setItems(items, !first);
  if (first) { m.i = 0; m.render(); }
}
function pickStrategy(k) {
  const plan = k === 'custom' ? strat.custom : strat.choices[k].plan;
  strat.locked = k;
  sim.confirmStrategy({ stints: plan.stints.map(s => ({ ...s })) });
  if (!sim.net) { beginHud(); return; }
  sfx.best(); renderStrategy(); updateStratTimer(); // online: wait for the shared start
}
function updateStratTimer() {
  const el = $('st-timer');
  if (!sim || !sim.net) { el.innerHTML = ''; return; }
  const left = Math.max(0, Math.ceil(sim.stateT));
  el.innerHTML = strat && strat.locked !== null ? `LOCKED IN &middot; RACE STARTS IN <b>${left}</b>` : `PICK A STRATEGY &middot; <b>${left}</b>`;
}
menus['s-strat'] = [new Menu($('m-strat'), [])];
backs['s-strat'] = () => {
  // back to the car select when you came through it
  if (sim && sim.pickedCar && !sim.net) { sfx.back(); fadeTo(() => { sim.state = 'carselect'; sim.stateT = 0; openCarSelect(); }); return; }
  if (raceReturn === 'setup') { sfx.back(); fadeTo(() => { disposeSim(); openSetup(editorTrack, { select: lastRace.track.name, toSettings: true }); }); } };
function beginHud() {
  show('hud');
  hud.area(sim.track.name, THEMES[sim.track.env.theme].label.toUpperCase());
}

// ---------------- loading + race ----------------
const TIPS = [
  'Brake in a straight line before the corner, then roll the throttle on as you unwind the steering.',
  'Kerbs are fine to clip, but gravel traps on the outside of fast corners will ruin your lap.',
  'Rain costs you around 18% grip. Brake earlier and be gentle with the throttle.',
  'Press C to cycle cameras. The T-Cam gives the purest sense of speed.',
  'In the Track Editor, raise one side of a crossover 5m or more and a bridge is built for you.',
  'Try Legend difficulty once you can lap consistently. The AI will not wait for you.',
  'Manual gearbox? E shifts up, Q shifts down. Watch the rev bar turn gold.',
  'Road and GT cars drift: flick the handbrake (SPACE / A) into a corner, then hold the angle with the throttle.',
  'Downforce grows with speed: fast corners hold more grip than you think.',
  'Learning a circuit? The Easy driver aids brake for you. Turn aids off one at a time as you get quicker: each one pays a Career bonus.',
  'Watch the aid lights under the rev bar: when TC or SC flashes gold, that was the car saving you.',
  'No ABS? Squeeze the brake, don\'t stamp on it. Locked fronts won\'t steer.',
  'In practice, pick Review Laps in your garage: your lap against a reference, corner by corner, with what to try next time.',
];
let raceReturn = 'setup';
let pitSel = 0;
let lastRace = null;

function startRace(track, cfg, ret, quick = false) {
  clearTimeout(developT);
  raceReturn = ret;
  raceAidRule = ret === 'online' ? (cfg.extra && cfg.extra.aidRule) || 'any' : 'any';
  lastRace = { track: cloneTrack(track), cfg: { ...cfg }, ret };
  fadeTo(() => {
    disposeSim();
    show('s-loading');
    $('load-name').textContent = track.name;
    $('load-sub').textContent = `${THEMES[track.env.theme].label} · ${track.env.time} · ${track.env.weather}`.toUpperCase();
    $('load-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    drawLoadArt(track);
    // the real picture of the circuit, if we've taken one in these conditions
    const li = $('load-img'); li.classList.remove('on');
    getPostcard(pcKey(track, { time: track.env.time, weather: track.env.weather })).then(v => v || getPostcard(pcKey(track, pickConditions(track))))
      .then(v => { if (v && screen === 's-loading') { li.src = v; li.classList.add('on'); } });
    const fill = $('load-fill');
    fill.style.setProperty('--v', 0);
    let p = 0;
    const iv = setInterval(() => { p = Math.min(p + 4 + Math.random() * 6, 90); fill.style.setProperty('--v', p / 100); }, 60);
    setTimeout(async () => {
      await loadEnvModels(); // the setting's models (usually loaded long before)
      if (needsHydrate(track)) track = await hydrateReal(cloneTrack(track)).catch(() => track); // a real circuit's hills + scenery
      const t0 = performance.now();
      sim = new Race(track, {
        mode: cfg.mode, laps: cfg.laps || track.env.laps || 3, opponents: cfg.opponents ?? track.env.opponents ?? 7, qualiTime: cfg.qualiTime, practiceTime: cfg.practiceTime,
        difficulty: settings.difficulty, grid: settings.grid, team: settings.team, gearbox: settings.gearbox, aids: aidsNow(), ghost: settings.ghost,
        units: settings.units, camera: settings.camera, racingLine: settings.racingLine, car: settings.car,
        wear: settings.wear, damage: settings.damage, rules: settings.rules, aiMistakes: settings.aiMistakes, startTyre: settings.startTyre, aiChassis: settings.aiChassis, drift: raceReturn === 'setup' ? settings.drift : 'off',
        pickCar: !!cfg.pick && !quick,
        ...(cfg.extra || {}),
      }, renderer);
      sim.aidBonus = bonusNow(); // (the lowest you race with counts: see noteAidBonus)
      // warm-up render so shaders compile behind the loading screen (all of them, not just what the start camera sees)
      sim.update(0.016, { steer: 0, throttle: 0, brake: 0 }, {});
      sim.warmUp(post, settings);
      sim.render(post, settings);
      hud.setTrack(sim.T, sim.A, sim.world.roadLines);
      hud.reset(cfg.mode === 'race' ? 'race' : cfg.mode === 'quali' || cfg.mode === 'practice' ? 'quali' : 'test');
      driftHud.reset(); if (sim.drift) driftHud.show(); else driftHud.hide();
      const wait = Math.max(0, 1300 - (performance.now() - t0));
      setTimeout(() => {
        clearInterval(iv); fill.style.setProperty('--v', 1);
        setTimeout(() => fadeTo(enterRace), 250);
      }, wait);
    }, 120);
  });
}

// after loading (and after the car select): the next pre-race screen, or straight into the race
function enterRace() {
  if (sim.state === 'carselect') { openCarSelect(); return; }
  if (sim.state === 'strategy') { openStrategy(); return; }
  if (sim.quali && sim.player && sim.player.inGarage) { openPitGarage(); return; } // (sessions start in your garage)
  beginHud();
  if (sim.quali) {
    const q = Math.round(sim.quali.time / 60), name = SESSION_NAME[sim.quali.kind].toUpperCase();
    hud.help(`<b>${name} &middot; ${q} MINUTES</b><br>Runs from the start line, the clock starts as you cross it. ${sim.quali.kind === 'practice' ? 'Learn the circuit and find your pace.' : 'Your fastest lap decides where you start the race.'}`, 7000);
  }
  if (sim.mode === 'test') {
    hud.help(device.kind === 'pad' ? '<b>TIME TRIAL</b><br>Set your fastest lap. <b>RT/LT</b> throttle &amp; brake, <b>left stick</b> steer, <b>Y</b> camera, <b>View</b> reset, <b>Start</b> pause.'
      : '<b>TIME TRIAL</b><br>Set your fastest lap. <b>W/S</b> throttle &amp; brake, <b>A/D</b> steer, <b>C</b> camera, <b>R</b> reset, <b>ESC</b> pause.', 7000);
  }
}

function drawLoadArt(track, cv = $('load-canvas'), tm = track.env.time) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  const th = track.env.theme;
  const skies = { day: ['#3a78c8', '#bcd6ea'], dusk: ['#2a2a6e', '#f29058'], night: ['#03050c', '#22304e'] };
  const [s0, s1] = skies[tm] || skies.day;
  const g = c.createLinearGradient(0, 0, 0, H * 0.7); g.addColorStop(0, s0); g.addColorStop(1, s1);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // sun / moon
  c.fillStyle = tm === 'night' ? '#e8ecff' : tm === 'dusk' ? '#ffcf7a' : '#fff6d8';
  c.beginPath(); c.arc(W * 0.78, H * (tm === 'dusk' ? 0.52 : 0.22), tm === 'dusk' ? 70 : 42, 0, 7); c.fill();
  // hills / skyline
  const land = { grass: ['#2e4a2a', '#466a36'], desert: ['#8a4a2a', '#c07a48'], city: ['#1c2030', '#2e3448'], coast: ['#28506a', '#3a6a48'] }[th];
  let seed = track.name.length * 97;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  c.fillStyle = land[0];
  if (th === 'city') {
    for (let x = 0; x < W; x += 28 + rnd() * 30) { const h = 80 + rnd() * 220; c.fillRect(x, H * 0.7 - h, 24 + rnd() * 30, h);
      if (tm !== 'day') { c.fillStyle = '#ffd98a'; for (let k = 0; k < 14; k++) c.fillRect(x + 4 + rnd() * 18, H * 0.7 - h + rnd() * h, 3, 4); c.fillStyle = land[0]; } }
  } else {
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) c.lineTo(x, H * 0.62 - Math.abs(Math.sin(x * 0.006 + seed)) * (th === 'desert' ? 140 : 90) - rnd() * 8);
    c.lineTo(W, H); c.fill();
  }
  c.fillStyle = land[1]; c.fillRect(0, H * 0.7, W, H * 0.3);
  if (th === 'coast') { c.fillStyle = '#2a6f8c'; c.fillRect(0, H * 0.7, W, H * 0.12); }
  // track sketch
  const T = sampleTrack(track);
  let a = Infinity, b = -Infinity, e = Infinity, f = -Infinity;
  for (let i = 0; i < T.N; i++) { a = Math.min(a, T.X[i]); b = Math.max(b, T.X[i]); e = Math.min(e, T.Z[i]); f = Math.max(f, T.Z[i]); }
  const s = Math.min((W * 0.42) / (b - a), (H * 0.5) / (f - e));
  c.save(); c.translate(W * 0.68, H * 0.5);
  c.transform(1, 0, -0.35, 0.55, 0, 0);
  const pth = () => { c.beginPath(); for (let i = 0; i <= T.N; i += 2) { const k = i % T.N; const x = (T.X[k] - (a + b) / 2) * s, y = (T.Z[k] - (e + f) / 2) * s - T.Y[k] * s * 2; i ? c.lineTo(x, y) : c.moveTo(x, y); } };
  c.lineJoin = c.lineCap = 'round';
  pth(); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 34; c.stroke();
  pth(); c.strokeStyle = '#000'; c.lineWidth = 22; c.stroke();
  pth(); c.strokeStyle = '#f2efe6'; c.lineWidth = 12; c.stroke();
  c.restore();
  // halftone overlay
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < W; x += 6) c.fillRect(x, y, 1.6, 1.6);
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.65)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}

function handleRaceEvents() {
  if (!sim || sim.mode === 'attract') return;
  while (sim.events.length) {
    const ev = sim.events.shift();
    if (ev.type === 'countdown') hud.lights(0, true);
    else if (ev.type === 'lights') hud.lights(ev.n, true);
    else if (ev.type === 'go') {
      hud.lights(0, true); setTimeout(() => hud.lights(0, false), 700);
      hud.center('GO!', 'go', 900);
      if ((raceReturn === 'career' || raceReturn === 'world') && lastRace.cfg.brief) setTimeout(() => hud.help(lastRace.cfg.brief, 7000), 1200);
      if (!localStorage.getItem('svgp.seenHelp')) {
        localStorage.setItem('svgp.seenHelp', '1');
        hud.help(device.kind === 'pad' ? 'Squeeze <b>RT</b> to accelerate and <b>LT</b> to brake. Steer with the <b>left stick</b>.<br>Press <b>Y</b> to change camera and <b>View</b> if you get stuck.'
          : 'Hold <b>W</b> to accelerate and <b>S</b> to brake. Steer with <b>A</b> and <b>D</b>.<br>Press <b>C</b> to change camera and <b>R</b> if you get stuck.', 8000);
      }
    } else if (ev.type === 'lap') {
      // (deleted laps don't count: compare against your best valid lap)
      const pl = sim.player, prev = pl.lapTimes.slice(0, -1).filter((t, k) => !pl.lapValid || pl.lapValid[k]);
      const prevBest = prev.length ? Math.min(...prev) : null;
      let delta = '';
      if (ev.invalid) delta = '<span class="slower">DELETED</span>';
      else if (prevBest) { const d = ev.time - prevBest; delta = `<span class="${d < 0 ? 'faster' : 'slower'}">${d < 0 ? '-' : '+'}${Math.abs(d).toFixed(3)}</span>`; }
      hud.split(`<span class="t${ev.invalid ? ' void' : ''}">${fmtTime(ev.time, 3)}</span>${delta}`);
      if (ev.best && prevBest) { sfx.best(); } else sfx.lap();
      const name = sim.track.name, bl = bestLaps();
      if (!ev.invalid && (!bl[name] || ev.time < bl[name])) { bl[name] = ev.time; try { localStorage.setItem('svgp.best', JSON.stringify(bl)); } catch (e) {} if (sim.mode === 'test' && prevBest !== null) hud.center('NEW RECORD', 'white', 1600); }
      if (sim.mode === 'race' && ev.lap <= ev.laps) hud.center(ev.lap === ev.laps ? 'FINAL LAP' : `LAP ${ev.lap}`, '', 1600);
    } else if (ev.type === 'finish') {
      sfx.finish();
      const p = ev.pos, o = ['TH', 'ST', 'ND', 'RD'][(p % 100 - 20) % 10] || ['TH', 'ST', 'ND', 'RD'][p % 100] || 'TH';
      const ds = sim.drift ? ` &middot; DRIFT ${Math.round(sim.drift.total).toLocaleString('en-US')}` : '';
      const pen = ev.pen ? ` &middot; +${ev.pen}s PENALTY TO ADD` : '';
      hud.center(p === 1 ? `WINNER!<span class="sub">${pen ? 'ACROSS THE LINE FIRST' + pen : 'RACE PASSED &middot; RESPECT +'}${ds}</span>` : `${p}${o} PLACE<span class="sub">RACE COMPLETE${pen}${ds}</span>`, p === 1 ? '' : 'white', 4500);
    } else if (ev.type === 'results') { if (raceReturn === 'world') worldRoundDone(); else if (raceReturn === 'career') careerRoundDone(); else if (raceReturn === 'online') { if (screen !== 's-results') showNetResults(); } else showResults(); }
    else if (ev.type === 'qflag') { if (ev.onLap) hud.center('CHEQUERED FLAG<span class="sub">FINISH THIS LAP</span>', 'white', 2600); }
    else if (ev.type === 'qpole') { sim.rc.say(`${ev.kind === 'practice' ? 'Fastest' : 'Provisional pole'} · ${ev.name} · ${fmtTime(ev.time, 3)}`, { cls: 'g', me: ev.name === sim.player?.name }); }
    else if (ev.type === 'garage') { if (!ev.first && screen === 'hud') fadeTo(() => openPitGarage(), 250); }
    else if (ev.type === 'qdone') {
      const me = sim.qualiRows().find(r => r.isPlayer);
      sfx.finish();
      const inGarage = screen === 's-pitgarage';
      hud.center(`SESSION COMPLETE<span class="sub">${me.pos === 1 ? (sim.quali.kind === 'practice' ? 'FASTEST' : 'POLE POSITION') : 'P' + me.pos}${isFinite(me.best) ? ' &middot; ' + fmtTime(me.best, 3) : ''}</span>`, me.pos === 1 ? '' : 'white', 2600);
      setTimeout(() => { if (sim && sim.quali && sim.quali.done && (screen === 'hud' || screen === 's-pitgarage')) showQualiResults(); }, inGarage ? 900 : 2600);
    }
    else if (ev.type === 'dsq') { hud.center('DISQUALIFIED<span class="sub">BLACK FLAG</span>', 'white', 4500); sfx.error(); }
    else if (ev.type === 'rc') { hud.rcMessage(ev.msg, ev.cls, ev.me); if (ev.me && (ev.cls === 'pen' || ev.cls === 'bw' || ev.cls === 'bk' || ev.cls === 'mo')) sfx.error(); else if (ev.me) sfx.select(); }
    else if (ev.type === 'radio') { hud.help(`<b>RADIO</b><br>${ev.msg}`, ev.big ? 6000 : 4500); if (ev.big) sfx.lap(); }
    else if (ev.type === 'pitIn') { pitSel = 0; sfx.select(); }
    else if (ev.type === 'pitOut') { hud.split(`<span class="t">PIT STOP</span><span class="faster">${ev.time.toFixed(1)}s</span>`, 2500); sfx.go(); }
    else if (ev.type === 'line') { settings.racingLine = ev.mode; saveSettings(); noteAidBonus(); menus['s-options']?.[0]?.render(); hud.help(`Racing line: <b>${{ off: 'OFF', brake: 'BRAKING ONLY', full: 'FULL' }[ev.mode]}</b>`, 1500); }
  }
}

const driftRecords = () => { try { return JSON.parse(localStorage.getItem('svgp.drift') || '{}'); } catch (e) { return {}; } };
function showResults() {
  const res = sim.results();
  $('results-title').textContent = 'Race Results';
  renderResultsTable(res);
  if (sim.drift) {
    // drift score + this track's drift record
    const D = sim.drift, rec = driftRecords(), name = sim.track.name, prev = rec[name] || 0;
    if (D.total > prev) { rec[name] = D.total; try { localStorage.setItem('svgp.drift', JSON.stringify(rec)); } catch (e) {} }
    const f = (n) => Math.round(n).toLocaleString('en-US');
    $('results-table').insertAdjacentHTML('afterbegin', `<caption class="drift-res">DRIFT SCORE <b>${f(D.total)}</b> <span>&middot; BEST CHAIN ${f(D.best)} &middot; ${D.chains} DRIFTS &middot; ${D.total > prev ? '<em>NEW TRACK RECORD</em>' : 'RECORD ' + f(prev)}</span></caption>`);
  }
  sim.setPaused(true);
  show('s-results');
  // (after a weekend: go again from qualifying, or re-run the race on the same grid)
  const items = weekend && lastRace.cfg.fromQuali
    ? [{ label: 'Restart Weekend', cls: 'action primary', action: () => startWeekend(weekend.track, weekend.race, weekend.ret, weekend.time), desc: 'Qualifying, then the race.' },
       { label: 'Race Again', action: () => startRace(lastRace.track, lastRace.cfg, lastRace.ret), desc: 'The same race, from the grid you qualified.' }, ...RESULT_ITEMS.slice(1)]
    : RESULT_ITEMS;
  menus['s-results'][0].setItems(fromEditor ? [...items.slice(0, -1), { label: 'Back To Editor', action: () => backToEditor() }, items[items.length - 1]] : items);
  menus['s-results'][0].i = 0; menus['s-results'][0].render();
}
// what a driver was penalised: '+5s', 'DT', '+5s · DT'
const penText = (r) => [r.pen > 0 ? '+' + r.pen + 's' : '', r.dt > 0 ? (r.dt > 1 ? r.dt + '× DT' : 'DT') : ''].filter(Boolean).join(' · ');
function renderResultsTable(res) {
  // penalty column only when somebody got one (times already include them)
  const pens = res.some(r => r.pen > 0 || r.dt > 0);
  $('results-table').innerHTML = `<tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th class="r">TIME</th><th class="r">BEST LAP</th><th class="r">PITS</th>${pens ? '<th class="r">PEN</th>' : ''}</tr>` + res.map(r =>
    `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${posBadge(r.pos)}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.name}</td><td>${r.team}</td><td class="t">${r.pos === 1 && r.time ? fmtTime(r.time, 3) : r.gap}</td><td class="t">${r.best && isFinite(r.best) ? fmtTime(r.best, 3) : '—'}</td><td class="t">${r.pits}</td>${pens ? `<td class="t pen">${penText(r)}</td>` : ''}</tr>`).join('');
  // your race at a glance
  const me = res.find(r => r.isPlayer), n = res.length, test = sim && sim.mode === 'test';
  const fastest = Math.min(...res.map(r => r.best && isFinite(r.best) ? r.best : Infinity));
  $('results-sub').textContent = sim ? `${sim.track.name} · ${test ? 'Time Trial' : sim.laps + (sim.laps === 1 ? ' lap' : ' laps')}` : '';
  if (!me) { $('result-card').innerHTML = ''; return; }
  const p = me.pos, ord = ['TH', 'ST', 'ND', 'RD'][(p % 100 - 20) % 10] || ['TH', 'ST', 'ND', 'RD'][p % 100] || 'TH';
  const row = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
  $('result-card').innerHTML = (test ? `<div class="big-pos">${me.best && isFinite(me.best) ? fmtTime(me.best, 3) : '&mdash;'}<small>BEST LAP</small></div>`
    : `<div class="big-pos ${p === 1 ? 'gold' : p <= 3 ? 'podium' : ''}">${me.dnf ? 'DNF' : p + '<sup>' + ord + '</sup>'}<small>${me.dnf ? 'RETIRED' : p === 1 ? 'RACE WINNER' : p <= 3 ? 'PODIUM FINISH' : 'OF ' + n}</small></div>`)
    + (test ? '' : row('Time', me.pos === 1 && me.time ? fmtTime(me.time, 3) : me.gap))
    + row('Best lap', me.best && isFinite(me.best) ? fmtTime(me.best, 3) + (me.best <= fastest + 1e-6 && !test ? ' <span class="fl">FASTEST</span>' : '') : '&mdash;')
    + (test ? '' : row('Pit stops', me.pits))
    + (!test && (me.pen > 0 || me.dt > 0) ? row('Penalties', `<span class="pen">${penText(me)}</span>`) : '');
}
const RESULT_ITEMS = [
  { label: 'Race Again', cls: 'action primary', action: () => startRace(lastRace.track, lastRace.cfg, lastRace.ret) },
  { label: 'Change Settings', action: () => { disposeSim(); openSetup(editorTrack, { select: lastRace.track.name, toSettings: true }); } },
  { label: 'Main Menu', action: () => quitToMenu() },
];
menus['s-results'] = [new Menu($('m-results'), RESULT_ITEMS)];
backs['s-results'] = () => {};

// pause
const settingsLabel = (vals, v) => (vals.find(x => x[0] === v) || [, v])[1];
function pauseInfo() {
  const hs = sim.hudState(), race = sim.mode === 'race', pad = device.kind === 'pad';
  $('pause-title').textContent = raceReturn === 'online' ? 'Race Menu' : 'Paused';
  if (sim.quali) {
    const me = sim.qualiRows().find(r => r.isPlayer), q = sim.quali, practice = q.kind === 'practice';
    $('pause-title').textContent = 'Paused';
    $('pause-sub').textContent = `${sim.track.name} · ${SESSION_NAME[q.kind]}`;
    const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
    $('pause-info').innerHTML = `<div class="panel-title">${SESSION_NAME[q.kind].toUpperCase()}</div>
      <div class="ti-grid">${cell('Time left', fmtTime(Math.ceil(q.left), 0))}${cell('Position', `${me.pos}<small>/${sim.qualiRows().length}</small>`)}${cell('Best lap', isFinite(me.best) ? fmtTime(me.best, 3) : '&mdash;')}${cell(practice ? 'Gap to fastest' : 'Gap to pole', me.pos === 1 || !isFinite(me.best) ? '&mdash;' : '+' + me.gap.toFixed(3))}</div>
      <p class="tip" style="margin:12px 0 0">${practice ? 'Practice doesn\'t set the grid: learn the circuit and find your pace.' : 'Your best lap sets your grid slot.'} Laps that break track limits don't count.</p>`;
    return;
  }
  $('pause-sub').textContent = `${sim.track.name} · ${raceReturn === 'online' ? 'the race goes on while this menu is open' : race ? (raceReturn === 'career' ? 'Challenge round ' + (career.round + 1) : raceReturn === 'world' ? `${WC.seriesById(world.player.series).name} round ${world.round + 1}` : 'Quick Race') : raceReturn === 'editor' ? 'Test drive' : 'Time Trial'}`;
  const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  const tyre = hs && hs.tyre ? `<span class="tyre-dot" style="background:${TYRE_COL[hs.tyre.c]}"></span>${hs.tyre.c}` : '&mdash;';
  const key = (kb, gp) => pad ? gp : kb;
  $('pause-info').innerHTML = !hs ? '' : `<div class="panel-title">${race ? 'RACE' : 'SESSION'}</div>
    <div class="ti-grid">${race ? cell('Position', `${hs.pos}<small>/${hs.total}</small>`) + cell('Lap', `${hs.lap}<small>/${hs.laps}</small>`) : cell('Lap', Math.max(1, sim.player.lap))}${cell('Best lap', isFinite(hs.best) ? fmtTime(hs.best, 3) : '&mdash;')}${cell('Last lap', hs.last > 0 ? fmtTime(hs.last, 3) : '&mdash;')}${hs.wear ? cell('Tyres', tyre) : ''}</div>
    ${race && hs.rc ? `<div class="panel-title" style="margin-top:14px">RACE CONTROL</div>
    <div class="ti-grid three">${cell('Rules', settingsLabel(RULES_VALS, sim.rc.level))}${cell('Track limits', !hs.rc.limits ? 'Off' : hs.rc.strikes >= hs.rc.warnAt ? 'Final flag' : `${hs.rc.strikes}<small>/${hs.rc.warnAt - 1} warnings</small>`)}${cell('Penalties', hs.rc.penTotal || hs.rc.dtTotal ? `<span class="pen">${penText({ pen: hs.rc.penTotal, dt: hs.rc.dtTotal })}</span>` : 'None')}</div>` : ''}
    <div class="panel-title" style="margin-top:14px">QUICK CONTROLS</div>
    <div class="qk">
      <div>${key('<kbd>C</kbd>', '<kbd class="pb y">Y</kbd>')}<span>Camera</span></div>
      <div>${key('<kbd>R</kbd>', '<kbd class="pl">View</kbd>')}<span>Reset car</span></div>
      <div>${key('<kbd>L</kbd>', 'D-pad &#8593;')}<span>Racing line</span></div>
      <div>${key('<kbd>M</kbd>', 'D-pad &#8595;')}<span>Minimap zoom</span></div>
      <div>${key('<kbd>Space</kbd>', '<kbd class="pb a">A</kbd>')}<span>Handbrake</span></div>
      <div>${key('<kbd>E</kbd><kbd>Q</kbd>', '<kbd class="pl">RB</kbd><kbd class="pl">LB</kbd>')}<span>Shift (manual)</span></div>
    </div>`;
}
function pause() {
  if (!sim || sim.mode === 'attract') return;
  driftHud.quiet();
  const opts = { label: 'Options', action: () => openOptions('s-pause'), desc: 'Sound, camera, driving aids and the screen look.' };
  if (raceReturn === 'online') {
    // online races never stop: your car coasts to a halt while the menu is open
    menus['s-pause'][0].setItems([
      { label: 'Resume', cls: 'action primary', action: () => show('hud') },
      opts,
      { label: 'Retire', confirm: 'Retire? Select again', action: () => { sim.retire(); showNetResults(); }, desc: 'Stop racing and watch the results come in.' },
      { label: 'Leave Session', confirm: 'Leave? Select again', action: () => leaveOnline(), desc: 'Leave the room and go back to the main menu.' },
    ]);
    pauseInfo(); show('s-pause'); sfx.back();
    return;
  }
  sim.setPaused(true);
  const test = raceReturn === 'editor';
  if (sim.quali) {
    const nm = SESSION_NAME[sim.quali.kind].toLowerCase();
    const end = { label: 'End Session', confirm: 'End it? Select again', action: () => { resume(); sim.qualiEnd(); }, desc: `Finish ${nm} now. The AI still post their laps.` };
    const box = sim.T.open ? [] : [{ label: 'Return To Garage', action: () => { sim.setPaused(false); sim.enterGarage(sim.player); openPitGarage(); }, desc: 'Back to your box: change tyres, watch the timing, go out again when you like.' }];
    menus['s-pause'][0].setItems(raceReturn === 'career' || raceReturn === 'world' ? [{ label: 'Resume', cls: 'action primary', action: resume }, ...box, end, opts]
      : [{ label: 'Resume', cls: 'action primary', action: resume }, ...box, end,
         { label: 'Restart Session', confirm: 'Restart? Select again', action: () => { if (weekend.car || weekend.roster) keepWeekend(); startSession(weekend.stage); }, desc: `The ${nm} session again from the start.` },
         opts, { label: 'Quit', confirm: 'Quit? Select again', action: () => { weekend = null; quitToMenu(); }, desc: 'Back to the main menu.' }]);
    pauseInfo(); show('s-pause'); sfx.back();
    return;
  }
  if (raceReturn === 'career' || raceReturn === 'world') {
    menus['s-pause'][0].setItems([
      { label: 'Resume', cls: 'action primary', action: resume },
      opts,
      { label: 'Retire', confirm: 'Retire? Select again', action: () => raceReturn === 'world' ? worldRoundDone(true) : careerRoundDone(true), desc: 'You will be classified last in this round.' },
    ]);
  } else menus['s-pause'][0].setItems([
    { label: 'Resume', cls: 'action primary', action: resume },
    { label: 'Restart', confirm: 'Restart? Select again', action: () => startRace(lastRace.track, lastRace.cfg, lastRace.ret, true), desc: 'Start this race again from the grid.' },
    opts,
    ...(test || fromEditor ? [{ label: 'Back To Editor', confirm: test ? null : 'Back to editor? Select again', action: () => backToEditor(), desc: 'Carry on building this circuit.' }] : []),
    ...(test ? [] : [{ label: 'Quit Race', confirm: 'Quit? Select again', action: () => quitToMenu(), desc: 'Back to the main menu.' }]),
  ]);
  pauseInfo();
  show('s-pause');
  sfx.back();
}
function resume() { show('hud'); sim.setPaused(false); }
menus['s-pause'] = [new Menu($('m-pause'), [], { desc: 'd-pause' })];
backs['s-pause'] = () => resume();
backs['hud'] = () => pause();
function quitToMenu() { fromEditor = false; weekend = null; if (net) { net.close(); net = null; lobby = null; netRace = null; } fadeTo(() => { disposeSim(); startAttract(); show('s-main'); }); }

// ---------------- editor ----------------
const editor = new Editor({
  onTest: (t) => { editorTrack = t; startRace(t, { mode: 'test' }, 'editor'); },
  onRace: (t) => { editorTrack = t; fromEditor = true; fadeTo(() => { editor.close(); }, 1); setTimeout(() => openSetup(t, { toSettings: true }), 50); },
  onExit: () => { editor.close(); fadeTo(() => { startAttract(); show('s-main'); }); },
});
function openEditor(track) {
  fadeTo(() => { disposeSim(); show('s-editor'); editor.open(track || editorTrack); });
}
function backToEditor() { fadeTo(() => { disposeSim(); show('s-editor'); editor.open(editorTrack); }); }

// ---------------- input routing ----------------
function menuInput() {
  const ae = document.activeElement;
  if (ae && ae.tagName === 'INPUT') { clearEdges(); return; }
  const list = menus[screen];
  const up = pressed('ArrowUp') | pressed('KeyW') | pressed('GP12') | pressed('GPSU');
  const down = pressed('ArrowDown') | pressed('KeyS') | pressed('GP13') | pressed('GPSD');
  const left = pressed('ArrowLeft') | pressed('KeyA') | pressed('GP14') | pressed('GPSL');
  const right = pressed('ArrowRight') | pressed('KeyD') | pressed('GP15') | pressed('GPSR');
  const ok = pressed('Enter') | pressed('Space') | pressed('GP0') | pressed('GP9');
  const back = pressed('Escape') | pressed('Backspace') | pressed('GP1');
  // next / previous tab or panel: Tab, Q / E, LB / RB
  const tabPrev = pressed('KeyQ') | pressed('GP4'), tabNext = pressed('Tab') | pressed('KeyE') | pressed('GP5');
  if (screen === 's-boot') { if (ok || back) bootGo && bootGo(); return; }
  if (screen === 's-draft') {
    if (left && draftSel > 0) { draftSel--; sfx.move(); renderDraft(); }
    if (right && draftSel < draft.length - 1) { draftSel++; sfx.move(); renderDraft(); }
    if (ok) takeDraft();
    return;
  }
  if (back && backs[screen]) { backs[screen](); return; }
  if (tabPrev || tabNext) {
    const d = tabNext ? 1 : -1;
    if (tabbers[screen]) { tabbers[screen](d); return; }
    if (list && list.length > 1) { cycleFocus(d); return; }
  }
  if (screen === 's-help') { if (left || right) tabbers['s-help'](right ? 1 : -1); return; }
  if (screen === 's-credits') { const el = $('credits-scroll'); if (up || down) el.scrollBy({ top: (down ? 1 : -1) * 160, behavior: 'smooth' }); return; }
  if (!list) return;
  const m = list[focusIdx[screen] || 0];
  if (up) m.move(-1);
  if (down) m.move(1);
  if (left) { if (m.items[m.i]?.values) m.change(-1); else if (list.length > 1 && focusIdx[screen] > 0) cycleFocus(-1); else if (tabbers[screen]) tabbers[screen](-1); }
  if (right) { if (m.items[m.i]?.values) m.change(1); else if (list.length > 1 && (focusIdx[screen] || 0) < list.length - 1) cycleFocus(1); else if (tabbers[screen]) tabbers[screen](1); }
  if (ok) m.activate();
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' && screen !== 's-editor') e.preventDefault();
  if (e.code === 'KeyF' && screen !== 's-editor' && !(e.target && e.target.tagName === 'INPUT')) toggleFullscreen();
});
document.addEventListener('click', () => initAudio(), { once: true });
document.addEventListener('keydown', () => initAudio(), { once: true });

// ---------------- lap review ----------------
// Your laps this session (and earlier ones today in the same car), against the reference lap, your best today, your
// best ever or the lap before: the speed trace, the gap, where each corner won or lost time and what to try.
// Opened from the pit garage's Review Laps; the session carries on behind it.
let reviewFrom = 's-pitgarage', rv = null, rvView = 'trace'; // (trace: the speed chart, line: the racing line map)
const RV_CMP = { ref: 'Reference', best: 'Best today', pb: 'Best ever', prev: 'Lap before' };
function openLapReview(from = 's-pitgarage') {
  if (!sim || !sim.player) return;
  reviewFrom = from;
  const pl = sim.player, T = sim.T, key = lapKey(sim.track, T, pl.carId);
  rv = { key, T, corners: sim.corners.list, laps: lapsFor(key).slice(-14), carId: pl.carId, pb: loadPB(key, T), cmp: rv ? rv.cmp : 'ref', focus: -1, sel: 0, cursor: -1, map: null, boards: sim.world.boards || [] };
  rv.zones = boardZones(rv.boards, T);
  const best = rv.laps.reduce((b, l, k) => (l.valid && (b < 0 || l.time < rv.laps[b].time) ? k : b), -1);
  rv.best = best; rv.sel = best >= 0 ? best : rv.laps.length - 1;
  const kind = sim.quali ? (sim.quali.kind === 'practice' ? 'Practice' : 'Qualifying') : sim.mode === 'test' ? 'Time Trial' : 'Race';
  $('rv-sub').textContent = `${sim.track.name} · ${CARS[pl.carId]?.name || ''} · ${kind}`;
  $('s-review').classList.toggle('empty', !rv.laps.length);
  const menu = menus['s-review'][0];
  const items = rv.laps.map((l, k) => ({
    k, cls: 'lap' + (k === best ? ' best' : '') + (l.valid ? '' : ' void'),
    label: `<span>LAP ${l.lap}<small>${(l.tyre || '').toUpperCase()}${l.mode && l.mode !== sim.mode && l.mode !== (sim.quali && sim.quali.kind) ? ' · ' + l.mode.toUpperCase() : ''}</small></span><span class="t">${fmtTime(l.time, 3)}</span>`,
    action: () => selectReviewLap(k),
    desc: `Lap ${l.lap}${l.valid ? '' : ' · <b>deleted</b> (track limits): it doesn\'t count, but you can still learn from it'} · ${l.tyre ? l.tyre[0].toUpperCase() + l.tyre.slice(1) + ' tyres' : ''}${l.wear != null ? ` at ${Math.round(l.wear * 100)}%` : ''}${k === best ? ' · <b>your best</b>' : ''}`,
  }));
  items.push({ label: 'Compare With', head: true },
    { label: 'Against', values: Object.entries(RV_CMP), get: () => rv.cmp, set: v => { rv.cmp = v; selectReviewLap(rv.sel); },
      get desc() { return { ref: 'A quick, clean lap in this car: the pace the racing line is built on.', best: 'Your fastest valid lap today in this car on this circuit.', pb: 'Your fastest lap ever in this car here, kept between sessions.', prev: 'The lap you drove just before this one.' }[rv.cmp] + ' <b>Q / E</b> (LB / RB) steps through the corners.'; } },
    { label: 'Ghost Car', values: GHOST_VALS, get: () => settings.ghost, set: v => { settings.ghost = v; saveSettings(); if (sim && sim.setGhostMode) sim.setGhostMode(v); }, desc: GHOST_DESC });
  menu.setItems(items);
  menu.i = Math.max(0, rv.sel); menu.render();
  show('s-review');
  requestAnimationFrame(() => selectReviewLap(rv.sel));
}
// the lap to compare the selected one with (falls back to the reference when there isn't one)
function reviewCmp(lap) {
  const L = rv.laps, sel = rv.sel;
  if (rv.cmp === 'best' && rv.best >= 0 && rv.best !== sel) return { lap: L[rv.best], name: 'best today' };
  if (rv.cmp === 'pb' && rv.pb && Math.abs(rv.pb.time - lap.time) > 1e-3) return { lap: rv.pb, name: 'best ever' };
  if (rv.cmp === 'prev' && sel > 0) return { lap: L[sel - 1], name: 'lap before' };
  // (the reference drives on the same compound as the lap you're looking at)
  const ref = sim.referenceTelemetry(rv.carId, lap.tyre || 'medium') || referenceLap(rv.T, sim.player.lineV || sim.lineV);
  return { lap: ref, name: 'reference', fell: rv.cmp !== 'ref' };
}
function selectReviewLap(k) {
  if (!rv || !rv.laps.length || screen !== 's-review') return;
  rv.sel = Math.max(0, Math.min(rv.laps.length - 1, k));
  const lap = rv.laps[rv.sel], c = reviewCmp(lap);
  rv.c = c; rv.an = analyze(lap, c.lap, rv.T, rv.corners);
  if (sim && sim.track) nameCorners(sim.track, rv.T, rv.an.corners); // real circuits: Turn 3 · Eau Rouge
  rv.focus = Math.min(rv.focus, rv.an.corners.length - 1);
  rv.map = null; rv.cursor = -1;
  renderReview();
}
function renderReview() {
  if (!rv || !rv.an) return;
  const an = rv.an, lap = rv.laps[rv.sel], c = rv.c, u = settings.units, focus = rv.focus;
  const worst = [...an.corners].sort((a, b) => b.loss - a.loss)[0];
  const cell = (k, v, cls = '') => `<div><small>${k}</small><b class="${cls}">${v}</b></div>`;
  const gap = focus >= 0 ? an.corners[focus].loss : an.total;
  $('rv-sum').innerHTML = cell('Lap time', fmtTime(lap.time, 3))
    + cell(focus >= 0 ? `Turn ${an.corners[focus].n} vs ${c.name}` : `vs ${c.name}${c.fell ? ' *' : ''}`, fmtGap(gap), gap > 0.0005 ? 'bad' : 'good')
    + cell('Top speed', fmtSpeed(an.top, u))
    + cell('Most time lost', worst && worst.loss > 0.01 ? `T${worst.n} ${fmtGap(worst.loss)}` : '&mdash;');
  $('rv-cmpname').textContent = c.name.toUpperCase() + (c.fell ? ' (NO OTHER LAP YET)' : '');
  const tabs = ['All', ...an.corners.map(x => 'T' + x.n)];
  tabRow($('rv-tabs'), tabs, focus + 1, (k) => { rv.focus = k - 1; rv.map = null; rv.cursor = -1; renderReview(); });
  tabRow($('rv-view'), ['Trace', 'Line'], rvView === 'line' ? 1 : 0, (k) => toggleReviewView(k ? 'line' : 'trace'));
  $('s-review').classList.toggle('lineview', rvView === 'line');
  $('rv-cmpname2').textContent = c.name.toUpperCase();
  // keep the lit tab in view when there are more corners than fit
  const on = $('rv-tabs').querySelector('span.on'); if (on) $('rv-tabs').scrollLeft = Math.max(0, on.offsetLeft - $('rv-tabs').clientWidth / 2);
  $('rv-notes').innerHTML = notesHtml(an, focus, u, c.name, rv.zones);
  drawReviewPlots();
}
// the chart or line map + the small map, with the cursor (cheap enough to redraw on every mouse move)
function drawReviewPlots() {
  const lap = rv.laps[rv.sel], c = rv.c, an = rv.an;
  if (rvView === 'line') rv.map = drawLineMap($('rv-line'), { T: rv.T, you: lap.ch, cmp: c.lap.ch, an, focus: rv.focus, view: rv.map, cursor: rv.cursor, boards: rv.boards });
  else drawChart($('rv-chart'), { you: lap.ch, cmp: c.lap.ch, an, focus: rv.focus, ds: rv.T.ds, units: settings.units, cursor: rv.cursor, boards: rv.boards });
  drawMap($('rv-map'), rv.T, an, rv.focus, rv.cursor);
  const pop = $('rv-pop');
  pop.classList.toggle('on', rv.cursor >= 0);
  if (rv.cursor >= 0) pop.innerHTML = popHtml(rv.cursor, { T: rv.T, you: lap.ch, cmp: c.lap.ch, an, units: settings.units, cmpName: c.name, zones: rv.zones });
}
function toggleReviewView(v) {
  if (!rv) return;
  rvView = v || (rvView === 'line' ? 'trace' : 'line'); sfx.move();
  rv.map = null; rv.cursor = -1;
  renderReview(); renderHints();
}
// put the tooltip beside a point, inside the plot
function placePop(x, y) {
  const pop = $('rv-pop'), box = pop.parentElement, W = box.clientWidth, H = box.clientHeight, pw = pop.offsetWidth || 250, ph = pop.offsetHeight || 110;
  // line map: in whichever corner of the map has the least of the lap under it (never on the cursor)
  if (rvView === 'line') {
    const f = $('rv-line')._xf, cands = [[6, 6], [W - pw - 6, 6], [6, H - ph - 6], [W - pw - 6, H - ph - 6]];
    let best = cands[0], bn = Infinity;
    if (f && rv && rv.an) {
      const [i0, i1] = lineRange(rv.an, rv.focus, rv.T.ds), T = rv.T, ch = rv.laps[rv.sel].ch;
      for (const [cx, cy] of cands) {
        const inside = (px, py) => px > cx - 12 && px < cx + pw + 12 && py > cy - 12 && py < cy + ph + 12;
        let n = inside(x, y) ? 1e6 : 0;
        for (let i = i0; i <= i1; i += 3) { const [px, py] = f.S(T.X[i] + T.RX[i] * ch.s[i], T.Z[i] + T.RZ[i] * ch.s[i]); if (inside(px, py)) n++; }
        if (n < bn) { bn = n; best = [cx, cy]; }
      }
    }
    pop.style.transform = `translate(${best[0]}px, ${best[1]}px)`; return;
  }
  const left = x + 18 + pw > W ? x - 18 - pw : x + 18, top = Math.min(H - ph - 4, Math.max(4, y - ph / 2));
  pop.style.transform = `translate(${Math.max(4, left)}px, ${top}px)`;
}
// scrub along the lap (triggers, Z / X): the cursor moves, the tooltip follows it
function scrubReview(d) {
  if (!rv || !rv.an) return;
  const n = rv.an.n, [a, b] = rvView === 'line' || rv.focus >= 0 ? (rv.focus >= 0 ? [rv.an.corners[rv.focus].from, rv.an.corners[rv.focus].to] : [0, n - 1]) : [0, n - 1];
  rv.cursor = rv.cursor < 0 ? a : Math.max(a, Math.min(b, Math.round(rv.cursor + d)));
  drawReviewPlots();
  // tooltip beside the cursor
  const lap = rv.laps[rv.sel], T = rv.T;
  if (rvView === 'line') { const f = $('rv-line')._xf; if (f) { const [x, y] = f.S(T.X[rv.cursor] + T.RX[rv.cursor] * lap.ch.s[rv.cursor], T.Z[rv.cursor] + T.RZ[rv.cursor] * lap.ch.s[rv.cursor]); placePop(x, y); } }
  else { const r = $('rv-chart')._xr; if (r) placePop(r.L + (rv.cursor - r.i0) / Math.max(1, r.i1 - r.i0) * (r.w - r.L - r.R), 60); }
}
// mouse: hover shows the point, wheel zooms the line map, drag pans it
{
  const lineCv = $('rv-line'), chartCv = $('rv-chart');
  let drag = null;
  const local = (e, el) => { const r = el.getBoundingClientRect(), z = r.width / el.clientWidth || 1; return [(e.clientX - r.left) / z, (e.clientY - r.top) / z]; };
  const hover = (i, x, y) => { if (!rv || !rv.an) return; if (i !== rv.cursor) { rv.cursor = i; drawReviewPlots(); } if (i >= 0) placePop(x, y); };
  chartCv.addEventListener('mousemove', (e) => { const [x, y] = local(e, chartCv); hover(chartHit(chartCv, x), x, y); });
  chartCv.addEventListener('mouseleave', () => hover(-1));
  lineCv.addEventListener('mousemove', (e) => {
    const [x, y] = local(e, lineCv);
    if (drag) { rv.map = lineMapPan(rv.map, x - drag[0], y - drag[1]); drag = [x, y]; drawReviewPlots(); return; }
    hover(lineMapHit(lineCv, x, y), x, y);
  });
  lineCv.addEventListener('mouseleave', () => { drag = null; lineCv.classList.remove('drag'); hover(-1); });
  lineCv.addEventListener('mousedown', (e) => { if (!rv || !rv.map) return; drag = local(e, lineCv); lineCv.classList.add('drag'); });
  window.addEventListener('mouseup', () => { drag = null; lineCv.classList.remove('drag'); });
  lineCv.addEventListener('wheel', (e) => { if (!rv || !rv.map) return; e.preventDefault(); const [x, y] = local(e, lineCv); rv.map = lineMapZoom(lineCv, rv.map, x, y, Math.exp(-e.deltaY * 0.0015)); drawReviewPlots(); }, { passive: false });
}
menus['s-review'] = [new Menu($('m-review'), [], { desc: 'd-review', onMove: (it) => { if (it && it.k !== undefined) selectReviewLap(it.k); } })];
backs['s-review'] = () => { sfx.back(); show(reviewFrom); if (reviewFrom === 's-pitgarage' && sim && sim.quali && sim.quali.done) showQualiResults(); };
tabbers['s-review'] = (d) => { if (!rv || !rv.an) return; sfx.move(); const n = rv.an.corners.length + 1; rv.focus = ((rv.focus + 1 + d + n) % n) - 1; rv.map = null; rv.cursor = -1; renderReview(); };
HINTS['s-review'] = () => [['nav', 'Lap'], ['tab', 'Corner'], ['view', rvView === 'line' ? 'Trace' : 'Line'], ['scrub', 'Scrub'], ['lr', 'Change'], ['back', reviewFrom === 's-pitgarage' ? 'Garage' : 'Back']];
function reviewClock() {
  const q = sim && sim.quali, box = $('rv-clockbox');
  box.hidden = !q;
  if (q) { const t = Math.max(0, Math.ceil(q.left || 0)); $('rv-clock').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
}

// ---------------- main loop ----------------
// how loud the soundtrack sits (js/audio.js): quiet under the racing, almost gone on the grid, fuller in the menus
function musicScene() {
  if (!sim || sim.mode === 'attract' || (screen !== 'hud' && screen !== 's-pause' && screen !== 's-options')) return 'menu';
  if (screen !== 'hud' || sim.paused) return 'pause';
  if (sim.state === 'racing' || sim.state === 'finished') return 'race';
  return sim.state === 'intro' || sim.state === 'countdown' ? 'grid' : 'pause';
}
let last = performance.now();
let resultsT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const pad = pollGamepad();
  if (screen === 'hud' && sim && !sim.paused) {
    const ctl = window.__autopilot && sim.player ? sim.aiControlsFor(sim.player, dt) : driveControls(pad);
    const press = {
      camera: pressed('KeyC') || pressed('GP3'), reset: pressed('KeyR') || pressed('GP8'), line: pressed('KeyL') || pressed('GP12'),
      shiftUp: pressed('KeyE') || pressed('GP5'), shiftDown: pressed('KeyQ') || pressed('GP4'),
      skip: pressed('Enter') || pressed('GP0'),
    };
    const pl = sim.player;
    if (pl && pl.pitting && pl.pitPhase === 'in' && pl.pitReq) {
      // pit menu: arrows / WASD / d-pad (the crew drives the car)
      const up = pressed('ArrowUp') | pressed('KeyW') | pressed('GP12'), dn = pressed('ArrowDown') | pressed('KeyS') | pressed('GP13');
      const lf = pressed('ArrowLeft') | pressed('KeyA') | pressed('GP14'), rt = pressed('ArrowRight') | pressed('KeyD') | pressed('GP15');
      press.line = false;
      if (up || dn) { pitSel = (pitSel + 1) % 2; sfx.move(); }
      if (lf || rt) {
        const d = rt ? 1 : -1;
        if (pitSel === 0) { const opts = [null, 'soft', 'medium', 'hard', 'wet']; let k = opts.indexOf(pl.pitReq.tyre); pl.pitReq.tyre = opts[(k + d + opts.length) % opts.length]; }
        else pl.pitReq.repair = !pl.pitReq.repair;
        sfx.move();
      }
    }
    // minimap zoom: M / d-pad down (d-pad is the pit menu while the crew drives you in)
    const pitMenu = pl && pl.pitting && pl.pitPhase === 'in';
    if (pressed('KeyM') || (!pitMenu && pressed('GP13'))) {
      settings.radarZoom = RADAR_ZOOMS[(RADAR_ZOOMS.indexOf(settings.radarZoom) + 1) % RADAR_ZOOMS.length];
      applyVideo(); saveSettings(); sfx.move();
      hud.help(`Minimap zoom: <b>${{ near: 'CLOSE', normal: 'NORMAL', far: 'FAR', vfar: 'VERY FAR' }[settings.radarZoom]}</b>`, 1200);
    }
    if (pressed('Escape') || pressed('KeyP') || pressed('GP9')) pause();
    else {
      sim.update(dt, ctl, press);
      handleRaceEvents();
      if (sim) { const hs = sim.hudState(); hud.update(hs, sim); hud.pitMenu(hs, pitSel, true); driftHud.update(sim.drift, dt); }
    }
  } else if (screen === 's-carsel' && sim) {
    carSelectInput(dt);
    if (sim && sim.net && csel) {
      const left = Math.max(0, Math.ceil(sim.stateT)), txt = csel.busy ? 'Locked In' : `Select Car &middot; ${left}`;
      if (csel.go !== txt) { csel.go = txt; $('cs-go').innerHTML = txt + ' &#9656;'; }
      if (sim.state !== 'carselect' && !csel.busy) confirmCar();
    }
    if (sim) { sim.update(dt, { steer: 0, throttle: csel && csel.blip > 0 ? 1 : 0, brake: 0 }, {}); handleRaceEvents(); }
  } else if (screen === 's-strat' && sim) {
    menuInput();
    if (sim) {
      sim.update(dt, { steer: 0, throttle: 0, brake: 0 }, {});
      handleRaceEvents();
      if (sim.net) {
        updateStratTimer();
        // online: when the window closes you race with whatever is highlighted / locked
        if (sim.state !== 'strategy') { if (strat.locked === null) { const m = menus['s-strat'][0], k = m.i < strat.choices.length ? m.i : 'custom'; strat.locked = k; sim.confirmStrategy(k === 'custom' ? strat.custom : strat.choices[k].plan); } beginHud(); }
      }
    }
  } else if (sim && sim.net && (screen === 's-pause' || screen === 's-results' || screen === 's-options')) {
    // online: the race carries on behind the menus
    menuInput();
    if (sim) {
      const pl = sim.player;
      const ctl = pl && (pl.finished || pl.gone) ? sim.aiControlsFor(pl, dt) : { steer: 0, throttle: 0, brake: 0.6 };
      sim.update(dt, ctl, {});
      handleRaceEvents();
      if (screen === 's-results' && !(netRace && netRace.final) && (resultsT += dt) > 0.5) { resultsT = 0; renderNetResults(); }
    }
  } else if (screen === 's-review' && sim) {
    // lap review: the session carries on behind it, as in the pit garage
    if (pressed('KeyV') || pressed('GP3')) toggleReviewView();
    { const lt = pad && pad.buttons[6] ? pad.buttons[6].value : 0, rt = pad && pad.buttons[7] ? pad.buttons[7].value : 0;
      const d = (rt - lt) * 90 * dt + (isDown('KeyX') ? 60 * dt : 0) - (isDown('KeyZ') ? 60 * dt : 0);
      if (Math.abs(d) > 0.01) { rv.scrubAcc = (rv.scrubAcc || 0) + d; if (Math.abs(rv.scrubAcc) >= 1) { scrubReview(Math.trunc(rv.scrubAcc)); rv.scrubAcc -= Math.trunc(rv.scrubAcc); } } }
    menuInput();
    if (sim) { sim.update(dt, { steer: 0, throttle: 0, brake: 0 }, {}); handleRaceEvents(); reviewClock(); }
    if (reviewFrom === 's-pitgarage') pitGarage.update(dt);
  } else if (screen === 's-pitgarage' && sim) {
    // the pit garage: the session carries on (the clock, the AI's laps) while you're in the menu
    menuInput();
    if (sim) {
      sim.update(dt, { steer: 0, throttle: 0, brake: 0 }, {});
      handleRaceEvents();
      if (sim && sim.quali && screen === 's-pitgarage' && (pgInfoT += dt) > 0.25) { pgInfoT = 0; renderGarageInfo(); }
    }
    pitGarage.update(dt);
  } else if (screen === 's-garage' || screen === 's-livery') {
    if (screen === 's-garage') menuInput(); else clearEdges();
    garage.update(dt);
  } else if (PHONE_SCREENS.includes(screen)) {
    // World Career, your garage: the computer has the controls while you're sat at it, the phone while it's up (P / Y)
    if (!pcInput() && !phoneInput()) menuInput();
    hubTick(dt);
  } else if (screen !== 's-editor') {
    menuInput();
    if (sim && sim.mode === 'attract') sim.update(dt, {}, {});
  } else {
    clearEdges();
  }
  // controller vibration: only while you're driving (and a short buzz when you try the setting)
  if (screen === 'hud' && sim && !sim.paused && sim.mode !== 'attract') { const [a, b] = sim.feel(), k = VIBES[settings.vibration] ?? 0.8; rumble(a * k, b * k); }
  else if (now > vibeTestUntil) rumble(0, 0);
  setMusicScene(musicScene()); updateMusic(dt);
  if (PHONE_SCREENS.includes(screen) && world && !pcSeat) phone.show(); else phone.hide();
  // sat at the garage computer: the 3D view at full resolution, so the screen in the scene is readable
  post.setSharp(screen === 's-hub' && (pcSeat || pitGarage.zoomK > 0));
  phone.update(dt);
  netTick(dt);
  if (screen === 's-garage' || screen === 's-livery') garage.render();
  else if (screen === 's-pitgarage' || screen === 's-hub' || (screen === 's-review' && reviewFrom === 's-pitgarage')) pitGarage.render();
  else if (sim && screen !== 's-editor' && screen !== 's-loading') sim.render(post, settings);
  else if (screen !== 's-editor') { renderer.setRenderTarget(null); renderer.setClearColor(0x000000); renderer.clear(); }
  clearEdges();
  requestAnimationFrame(frame);
}

applyVideo();
// make sure the game fonts are ready before the first frame (canvas text needs them too)
Promise.race([
  Promise.all([...["40px 'Pirata One'", "40px Anton", "16px Arimo", "bold 16px Arimo", "16px VT323", "40px 'SV Display'", "40px 'SV UI'", "500 40px 'SV UI'", "16px 'SV Body'", "500 16px 'SV Body'", "bold 16px 'SV Body'", "16px 'SV Num'", "500 16px 'SV Num'"].map(f => document.fonts.load(f)), loadCustomCar(), loadRoadCars(), loadEnvCatalog()]),
  new Promise(r => setTimeout(r, 2500)),
]).then(() => { boot(); loadEnvModels(); }); // scenery models keep loading in the background (a race waits for them)
// keep the local server alive while the game is open (it auto-exits after the window closes)
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) setInterval(() => fetch('/__ping', { cache: 'no-store' }).catch(() => {}), 20000);
requestAnimationFrame(frame);

// debug handle
window.__svgp = { get world() { return world; }, get phone() { return phone; }, get pc() { return pc; }, get post() { return post; }, get sim() { return sim; }, get editor() { return editor; }, get net() { return net; }, get lobby() { return lobby; }, get garage() { return garage; }, settings, startRace, openEditor, show, get screen() { return screen; },
  open: { review: (from) => openLapReview(from), setup: () => openSetup(), career: () => openCareer(), online: () => openOnline(), garage: () => openGarage(), options: () => openOptions('s-main'), help: () => show('s-help'), credits: () => { fillCredits(); show('s-credits'); }, main: () => show('s-main') },
  dbg: { startWeekend: (t, race, ret, format = 'quali', len = [1200, 600]) => startWeekend(t, race, ret, format, len), get pitGarage() { return pitGarage; }, careerRoundDone: (r) => careerRoundDone(r), showResults: () => showResults(), openDraft: () => openDraft(), openShop: () => openShop(), showSeasonEnd: () => showSeasonEnd(), get career() { return career; } } };
