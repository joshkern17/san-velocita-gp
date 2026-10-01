// San Velocita Grand Prix — app shell: screens, menus, flow
import * as THREE from 'three';
import { PS2Post } from './post.js';
import { Race } from './race.js';
import { HUD, fmtTime, RADAR_ZOOMS } from './hud.js';
import { Editor } from './editor.js';
import { initInput, pressed, clearEdges, pollGamepad, driveControls, gp } from './input.js';
import { initAudio, sfx, setVolume } from './audio.js';
import { presetTracks, sampleTrack, trackStats, THEMES, cloneTrack } from './track.js';
import { TEAMS } from './car.js';
import { Garage } from './garage.js';
import { PARTS, DEFAULT_CAR, chassisReady } from './carmodel.js';
import * as CAREER from './career.js';
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
  res: 'ps2', filter: 'soft', trails: true, scan: false, dither: true, retro: 'psx', palette: 128, psxMat: 'strong', crt: 'flat', grain: 'light', rays: true, fringe: true, shadows: true, look: 'arcade', units: 'kmh', gearbox: 'auto', tc: true,
  volume: 7, camera: 'chase', racingLine: 'full', wear: 'normal', damage: 'normal', startTyre: 'auto', drift: 'off', aiChassis: 'class', radarMap: 'satellite', radarZoom: 'normal', car: null, difficulty: 'medium', grid: 'back', team: 0, time: 'track', weather: 'track',
};
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('svgp.settings') || '{}') }; } catch (e) {}
settings.car = { ...DEFAULT_CAR, ...(settings.car || {}) };
if (settings.grain === true) settings.grain = 'medium'; else if (settings.grain === false) settings.grain = 'off';
if (settings.team === 0 || settings.team === undefined) settings.team = 'garage';
// (new car classes: the AI now follows your class by default)
if (!settings.carsV) { if (settings.aiChassis === 'custom') settings.aiChassis = 'class'; settings.carsV = 1; }
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
  setVolume(settings.volume / 10);
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
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  screen = id;
  canvas.style.display = id === 's-editor' ? 'none' : 'block';
  if (menus[id]) menus[id].forEach((m, k) => m.setActive(k === (focusIdx[id] || 0)));
}
function fadeTo(fn, ms = 320) {
  const f = $('fade'); f.classList.add('on');
  setTimeout(() => { fn(); requestAnimationFrame(() => f.classList.remove('on')); }, ms);
}

// ---------------- menu widget ----------------
class Menu {
  constructor(el, items, opts = {}) { this.el = el; this.items = items; this.i = 0; this.opts = opts; this.active = true; this.render(); }
  setItems(items, keep = false) { this.items = items; if (!keep) this.i = 0; this.i = Math.min(this.i, items.length - 1); this.render(); }
  valText(it) { const v = it.get(); const o = it.values.find(x => x[0] === v); return o ? o[1] : v; }
  render() {
    if (this.items[this.i] && this.items[this.i].disabled) { const n = this.items.findIndex((it, k) => k > this.i && !it.disabled); if (n >= 0) this.i = n; }
    this.el.innerHTML = this.items.map((it, k) => {
      if (it.head) return `<div class="item head" data-k="${k}">${it.label}</div>`;
      const cls = ['item', it.values ? 'opt' : '', it.cls || '', k === this.i ? 'sel' : '', it.disabled ? 'disabled' : ''].join(' ');
      return `<div class="${cls}" data-k="${k}"><span>${it.label}</span>${it.values ? `<span class="val">${this.valText(it)}</span>` : ''}</div>`;
    }).join('');
    this.el.classList.toggle('inactive', !this.active);
    this.el.querySelectorAll('.item').forEach(div => {
      const k = +div.dataset.k;
      div.addEventListener('mouseenter', () => { if (this.items[k].disabled) return; if (this.i !== k || !this.active) { this.focusMe(); this.i = k; this.render(); sfx.move(); this.opts.onMove && this.opts.onMove(this.items[k]); } });
      div.addEventListener('click', (e) => {
        this.i = k;
        const it = this.items[k];
        if (it.values) { const r = div.getBoundingClientRect(); this.change(e.clientX < r.left + r.width * 0.55 && e.clientX > r.left + r.width * 0.4 ? -1 : 1); }
        else this.activate();
      });
    });
    const sel = this.el.querySelector('.sel');
    if (sel && this.el.scrollHeight > this.el.clientHeight) sel.scrollIntoView({ block: 'nearest' });
  }
  focusMe() { const scr = this.el.closest('.screen').id; const list = menus[scr]; if (list) { focusIdx[scr] = list.indexOf(this); list.forEach(m => m.setActive(m === this)); } }
  setActive(a) { this.active = a; this.el.classList.toggle('inactive', !a); }
  move(d) {
    const n = this.items.length; if (!n) return;
    let i = this.i;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!this.items[i].disabled) break; }
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
    sfx.select(); it.action && it.action();
  }
}
const menus = {};
const focusIdx = {};
const backs = {};

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
menus['s-main'] = [new Menu($('m-main'), [
  { label: 'Race', action: () => openSetup() },
  { label: 'Career', action: () => openCareer() },
  { label: 'Online', action: () => openOnline() },
  { label: 'Garage', action: () => openGarage() },
  { label: 'Track Editor', action: () => openEditor() },
  { label: 'Options', action: () => openOptions('s-main') },
  { label: 'How To Play', action: () => fadeTo(() => show('s-help'), 200) },
  { label: 'Credits', action: () => fadeTo(() => { fillCredits(); show('s-credits'); }, 200) },
])];
backs['s-help'] = () => { sfx.back(); fadeTo(() => show('s-main'), 200); };
backs['s-credits'] = () => { sfx.back(); fadeTo(() => show('s-main'), 200); };
// scenery asset credits (the CC BY licences ask for attribution), straight from the baked catalogue
function fillCredits() {
  const c = envCatalog(), el = $('credits-list');
  const esc = (t) => String(t || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const packs = [...(c ? Object.values(c.packs) : []), ...Object.values(CAR_CREDITS)];
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
const part = (label, key, rebuild = true) => ({ label, values: Object.entries(PARTS[key]).map(([k, v]) => [k, v]), get: () => settings.car[key], set: v => { settings.car[key] = v; rebuild ? garage.setCar(settings.car) : garage.car.repaint(settings.car); } });
const paintOpt = (label, key) => ({ label, values: colVals, get: () => settings.car[key], set: v => { settings.car[key] = v; garage.setCar(settings.car); } });
menus['s-garage'] = [new Menu($('m-garage'), [
  { label: 'Bodywork', cls: 'head', disabled: true },
  { label: 'Car', values: CAR_CHOICES, get: () => settings.car.chassis || 'custom', set: v => { settings.car.chassis = v; classicOnly(); garage.setCar(settings.car); } },
  { label: 'Class', values: Object.entries(CLASSES).map(([k, c]) => [k, c.label]), get: () => carOf(settings.car).cls, set: () => {}, disabled: true },
  part('Nose', 'nose'), part('Front Wing', 'fwing'), part('Sidepods', 'pods'), part('Engine Cover', 'cover'), part('Rear Wing', 'rwing'), part('Halo', 'halo'),
  part('Wheels', 'rims'), part('Rim Colour', 'rimCol'),
  { label: 'Livery', cls: 'head', disabled: true },
  { label: 'Livery Designer', cls: 'action', action: () => openLivery() },
  part('Pattern', 'pattern', false), paintOpt('Main', 'main'), paintOpt('Accent', 'accent'), paintOpt('Detail', 'third'),
  { label: 'Number', values: Array.from({ length: 99 }, (_, i) => [i + 1, String(i + 1)]), get: () => settings.car.number, set: v => { settings.car.number = v; garage.car.repaint(settings.car); } },
  { label: 'Sponsor', values: SPONSORS.map(s => [s, s]), get: () => settings.car.sponsor, set: v => { settings.car.sponsor = v; garage.car.repaint(settings.car); } },
  { label: 'Done', cls: 'action', action: () => backs['s-garage']() },
])];
menus['s-garage'][0].i = 1;
// bodywork swaps only exist on the classic car; grey them out while your own model is selected
function classicOnly() {
  const custom = (settings.car.chassis || 'custom') !== 'svgp' && customCarStatus() === 'ready';
  const C = carOf(settings.car), road = C.cls !== 'f1';
  for (const it of menus['s-garage'][0].items) {
    if (['Nose', 'Front Wing', 'Sidepods', 'Engine Cover', 'Rear Wing', 'Halo', 'Wheels'].includes(it.label)) it.disabled = custom || road;
    // road cars keep their own paint job: only the main colour (on cars that can be repainted)
    if (['Livery Designer', 'Pattern', 'Accent', 'Detail', 'Number', 'Sponsor', 'Rim Colour'].includes(it.label)) it.disabled = road;
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
    else if (garageReturn === 's-lobby' && lobby) { onGarageDoneOnline(); startAttract(); renderLobby(); show('s-lobby'); } else { startAttract(); show('s-main'); } garageReturn = 's-main'; }); };

// ---------------- options ----------------
let optionsReturn = 's-main';
const onOff = [[true, 'ON'], [false, 'OFF']];
menus['s-options'] = [new Menu($('m-options'), [
  { label: 'Display', head: true, disabled: true },
  { label: 'Screen Look', values: [['arcade', 'Arcade Sunset'], ['retro', 'RetroPass Palette'], ['crt', 'PS2 CRT'], ['film', 'Film'], ['light', 'Light (fast)'], ['off', 'Effects Off'], ['custom', 'Custom']], get: () => settings.look, set: v => { settings.look = v; applyLook(v); applyVideo(); saveSettings(); menus['s-options'][0].render(); } },
  { label: 'Resolution', values: [['r240', 'PS1 240p'], ['r288', 'PS1 288p'], ['r360', 'Arcade 360p'], ['ps2', 'PS2 448p'], ['hd', 'HD 720p'], ['native', 'Native']], get: () => settings.res, set: v => { settings.res = v; settings.look = 'custom'; applyVideo(); saveSettings(); } },
  { label: 'Upscaling', values: [['sharp', 'Sharp pixels'], ['soft', 'Soft (CRT)']], get: () => settings.filter, set: v => { settings.filter = v; applyVideo(); saveSettings(); } },
  { label: 'Fullscreen', values: [[false, 'OFF'], [true, 'ON']], get: () => !!document.fullscreenElement, set: () => toggleFullscreen() },
  { label: 'Retro', head: true, disabled: true },
  { label: 'Retro Filter', values: [['psx', 'PSX Dither'], ['palette', 'RetroPass Palette'], ['off', 'Off']], get: () => settings.retro, set: v => { settings.retro = v; settings.look = 'custom'; applyVideo(); saveSettings(); } },
  { label: 'Palette Colours', values: [[64, '64'], [128, '128'], [256, '256']], get: () => settings.palette, set: v => { settings.palette = v; applyVideo(); saveSettings(); } },
  { label: 'PSX Materials', values: [['off', 'Off'], ['subtle', 'Subtle'], ['strong', 'Strong']], get: () => settings.psxMat, set: v => { settings.psxMat = v; settings.look = 'custom'; applyVideo(); saveSettings(); } },
  { label: 'CRT Filter', values: [['off', 'Off'], ['flat', 'Flat'], ['curved', 'Curved']], get: () => settings.crt, set: v => { settings.crt = v; settings.look = 'custom'; applyVideo(); saveSettings(); } },
  { label: 'Scanlines', values: onOff, get: () => settings.scan, set: v => { settings.scan = v; applyVideo(); saveSettings(); } },
  { label: 'Effects', head: true, disabled: true },
  { label: 'Shadows', values: onOff, get: () => settings.shadows, set: v => { settings.shadows = v; applyVideo(); saveSettings(); } },
  { label: 'Light Shafts', values: onOff, get: () => settings.rays, set: v => { settings.rays = v; applyVideo(); saveSettings(); } },
  { label: 'Trails FX', values: onOff, get: () => settings.trails, set: v => { settings.trails = v; applyVideo(); saveSettings(); } },
  { label: 'Film Grain', values: [['off', 'Off'], ['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy']], get: () => settings.grain, set: v => { settings.grain = v; settings.look = 'custom'; applyVideo(); saveSettings(); } },
  { label: 'Colour Fringe', values: onOff, get: () => settings.fringe, set: v => { settings.fringe = v; settings.look = 'custom'; applyVideo(); saveSettings(); } },
  { label: 'Racing', head: true, disabled: true },
  { label: 'Camera', values: [['chase', 'Chase'], ['far', 'Far Chase'], ['tcam', 'T-Cam'], ['bumper', 'Nose']], get: () => settings.camera, set: v => { settings.camera = v; saveSettings(); } },
  { label: 'Racing Line', values: [['full', 'Full'], ['brake', 'Braking only'], ['off', 'Off']], get: () => settings.racingLine, set: v => { settings.racingLine = v; saveSettings(); if (sim && sim.lineMesh) sim.lineMode = v; } },
  { label: 'Gearbox', values: [['auto', 'Automatic'], ['manual', 'Manual']], get: () => settings.gearbox, set: v => { settings.gearbox = v; saveSettings(); } },
  { label: 'Driving Aids', values: onOff, get: () => settings.tc, set: v => { settings.tc = v; saveSettings(); } },
  { label: 'AI Cars', values: [['class', 'Same Class As You'], ['multi', 'All Classes Mixed'], ['custom', 'F1: Your Model'], ['mixed', 'F1: Mixed Models'], ['svgp', 'F1: SVGP Classic']], get: () => settings.aiChassis, set: v => { settings.aiChassis = v; saveSettings(); } },
  { label: 'Speed Units', values: [['kmh', 'KM/H'], ['mph', 'MPH']], get: () => settings.units, set: v => { settings.units = v; applyVideo(); saveSettings(); } },
  { label: 'HUD & Sound', head: true, disabled: true },
  { label: 'Minimap Map', values: [['satellite', 'Satellite'], ['streets', 'Streets'], ['off', 'Off']], get: () => settings.radarMap, set: v => { settings.radarMap = v; applyVideo(); saveSettings(); } },
  { label: 'Minimap Zoom', values: [['near', 'Close'], ['normal', 'Normal'], ['far', 'Far'], ['vfar', 'Very Far']], get: () => settings.radarZoom, set: v => { settings.radarZoom = v; applyVideo(); saveSettings(); } },
  { label: 'Volume', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => [v, '|'.repeat(v) || 'MUTE']), get: () => settings.volume, set: v => { settings.volume = v; applyVideo(); saveSettings(); } },
  { label: 'Back', cls: 'action', action: () => backs['s-options']() },
])];
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
function openOptions(from) { optionsReturn = from; fadeTo(() => show('s-options'), 200); }
backs['s-options'] = () => { sfx.back(); if (optionsReturn === 's-pause') show('s-pause'); else fadeTo(() => show(optionsReturn), 200); };

// ---------------- race setup ----------------
let setupTracks = [];
let setupSel = 0;
let editorTrack = null;
let raceCfg = { laps: 3, opponents: 7 };
function savedTracks() { try { return JSON.parse(localStorage.getItem('svgp.tracks')) || []; } catch (e) { return []; } }
function bestLaps() { try { return JSON.parse(localStorage.getItem('svgp.best')) || {}; } catch (e) { return {}; } }

function openSetup(track = null) {
  setupTracks = [];
  if (track) setupTracks.push({ t: track, tag: 'EDITOR' });
  presetTracks().forEach(t => setupTracks.push({ t, tag: 'PRESET' }));
  savedTracks().forEach(t => setupTracks.push({ t, tag: 'SAVED' }));
  setupSel = 0;
  const list = menus['s-setup'][0];
  list.setItems(setupTracks.map((e, k) => ({ label: `${e.t.name}<small>${e.tag}</small>`, action: () => { focusIdx['s-setup'] = 1; menus['s-setup'].forEach((m, j) => m.setActive(j === 1)); sfx.select(); }, k })));
  selectSetupTrack(0);
  focusIdx['s-setup'] = 0;
  fadeTo(() => { if (!sim) startAttract(); show('s-setup'); }, 200);
}
function selectSetupTrack(k) {
  setupSel = k;
  const t = setupTracks[k].t;
  raceCfg.laps = t.env.laps || 3;
  raceCfg.opponents = t.env.opponents ?? 7;
  menus['s-setup'][1].render();
  drawPreview(t);
}
function drawPreview(t, cvId = 'setup-preview', infoId = 'setup-info', over = null) {
  const cv = $(cvId), c = cv.getContext('2d');
  const T = sampleTrack(t);
  const st = trackStats(T);
  c.fillStyle = { grass: '#1b3020', desert: '#3a2a18', city: '#1c1e26', coast: '#12304a' }[t.env.theme] || '#111';
  c.fillRect(0, 0, cv.width, cv.height);
  c.strokeStyle = 'rgba(255,255,255,.05)';
  for (let x = 0; x < cv.width; x += 20) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, cv.height); c.stroke(); }
  for (let y = 0; y < cv.height; y += 20) { c.beginPath(); c.moveTo(0, y); c.lineTo(cv.width, y); c.stroke(); }
  let a = Infinity, b = -Infinity, e = Infinity, f = -Infinity;
  for (let i = 0; i < T.N; i++) { a = Math.min(a, T.X[i]); b = Math.max(b, T.X[i]); e = Math.min(e, T.Z[i]); f = Math.max(f, T.Z[i]); }
  const s = Math.min((cv.width - 50) / (b - a), (cv.height - 50) / (f - e));
  const X = (i) => (T.X[i] - (a + b) / 2) * s + cv.width / 2, Y = (i) => (T.Z[i] - (e + f) / 2) * s + cv.height / 2;
  c.lineJoin = c.lineCap = 'round';
  const pth = () => { c.beginPath(); for (let i = 0; i <= T.N; i++) { const k = T.open ? (T.cut + 1 + Math.min(i, T.N - 1)) % T.N : i % T.N; i ? c.lineTo(X(k), Y(k)) : c.moveTo(X(k), Y(k)); } };
  pth(); c.strokeStyle = '#000'; c.lineWidth = 11; c.stroke();
  pth(); c.strokeStyle = '#e8e8e8'; c.lineWidth = 6; c.stroke();
  const maxY = Math.max(1, st.elevMax);
  for (let i = 0; i < T.N; i += 3) { const y = T.Y[i] / maxY; c.fillStyle = `hsl(${210 - y * 210},80%,50%)`; c.fillRect(X(i) - 1, Y(i) - 1, 2, 2); }
  c.fillStyle = '#6ae04a'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(X(0), Y(0), 6, 0, 7); c.fill(); c.stroke();
  if (T.open) { c.fillStyle = '#ff5a4a'; c.beginPath(); c.arc(X(T.finish), Y(T.finish), 6, 0, 7); c.fill(); c.stroke(); }
  const best = bestLaps()[t.name];
  const o = over || settings;
  const tm = o.time === 'track' ? t.env.time : o.time, wt = o.weather === 'track' ? t.env.weather : o.weather;
  $(infoId).innerHTML = `
    <b>${t.name.toUpperCase()}</b>
    <div class="row"><span>Location</span><span>${THEMES[t.env.theme].label}</span></div>
    <div class="row"><span>Layout</span><span>${st.open ? 'Point-to-point (one run)' : 'Circuit'}</span></div>
    <div class="row"><span>Length</span><span>${(st.length / 1000).toFixed(2)} km</span></div>
    <div class="row"><span>Corners</span><span>${st.turns}</span></div>
    <div class="row"><span>Elevation change</span><span>${(st.elevMax - st.elevMin).toFixed(0)} m</span></div>
    <div class="row"><span>Conditions</span><span>${tm.toUpperCase()} · ${wt.toUpperCase()}</span></div>
    ${over && over.laps ? `<div class="row"><span>Laps</span><span>${over.laps}</span></div>` : ''}
    <div class="row"><span>Best lap</span><span>${best ? fmtTime(best, 3) : '--'}</span></div>`;
}
const teamVals = [['garage', '<span class="swatch" style="background:#e8b13a"></span>My Car (Garage)'], ...TEAMS.map((t, i) => [i, `<span class="swatch" style="background:${hex(t.main)}"></span>${t.name}`])];
menus['s-setup'] = [
  new Menu($('m-tracks'), [], { onMove: (it) => selectSetupTrack(it.k) }),
  new Menu($('m-setup'), [
    { label: 'Laps', values: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50].map(v => [v, String(v)]), get: () => raceCfg.laps, set: v => raceCfg.laps = v },
    { label: 'Opponents', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(v => [v, String(v)]), get: () => raceCfg.opponents, set: v => raceCfg.opponents = v },
    { label: 'Difficulty', values: [['easy', 'Rookie'], ['medium', 'Pro'], ['hard', 'Legend'], ['alien', 'Alien']], get: () => settings.difficulty, set: v => { settings.difficulty = v; saveSettings(); } },
    { label: 'Grid', values: [['back', 'Back of grid'], ['random', 'Random'], ['pole', 'Pole position']], get: () => settings.grid, set: v => { settings.grid = v; saveSettings(); } },
    { label: 'Team', values: teamVals, get: () => settings.team, set: v => { settings.team = v; saveSettings(); } },
    { label: 'Time', values: [['track', 'Track default'], ['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], get: () => settings.time, set: v => { settings.time = v; saveSettings(); drawPreview(setupTracks[setupSel].t); } },
    { label: 'Weather', values: [['track', 'Track default'], ['clear', 'Clear'], ['overcast', 'Overcast'], ['rain', 'Rain'], ['fog', 'Fog']], get: () => settings.weather, set: v => { settings.weather = v; saveSettings(); drawPreview(setupTracks[setupSel].t); } },
    { label: 'Gearbox', values: [['auto', 'Automatic'], ['manual', 'Manual']], get: () => settings.gearbox, set: v => { settings.gearbox = v; saveSettings(); } },
    { label: 'Tyre Wear', values: [['off', 'Off'], ['normal', 'Normal'], ['fast', 'Fast (x2.5)']], get: () => settings.wear, set: v => { settings.wear = v; saveSettings(); } },
    { label: 'Damage', values: [['off', 'Off'], ['normal', 'Normal'], ['high', 'Realistic']], get: () => settings.damage, set: v => { settings.damage = v; saveSettings(); } },
    { label: 'Start Tyre', values: [['auto', 'Auto'], ['soft', 'Soft'], ['medium', 'Medium'], ['hard', 'Hard'], ['wet', 'Wet']], get: () => settings.startTyre, set: v => { settings.startTyre = v; saveSettings(); } },
    { label: 'Drift Points', values: [['off', 'Off'], ['on', 'On']], get: () => settings.drift, set: v => { settings.drift = v; saveSettings(); } },
    { label: 'Start Race', cls: 'action', action: () => launch('race') },
    { label: 'Time Trial', cls: 'action', action: () => launch('test') },
    { label: 'Back', cls: 'action', action: () => backs['s-setup']() },
  ]),
];
backs['s-setup'] = () => { sfx.back(); fadeTo(() => show(editorTrack && setupTracks[0]?.tag === 'EDITOR' ? 's-main' : 's-main'), 200); };

function launch(mode) {
  const t = cloneTrack(setupTracks[setupSel].t);
  if (settings.time !== 'track') t.env.time = settings.time;
  if (settings.weather !== 'track') t.env.weather = settings.weather;
  startRace(t, { mode, laps: raceCfg.laps, opponents: raceCfg.opponents, pick: true }, 'setup');
}


// ---------------- career / grand prix ----------------
let career = null;
const DIFF_LABEL = { easy: 'Rookie', medium: 'Pro', hard: 'Legend', alien: 'Alien' };
const newOpts = { rounds: 4, hard: false, laps: 5, pool: 'presets', gpPool: 'presets', gpLaps: 5, gpDiff: 'medium' };
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
  const h = hist.slice(0, 5).map(r => `${new Date(r.date).toLocaleDateString()} · ${r.kind === 'gp' ? 'Grand Prix' : 'Career'} · ${r.fired ? 'FIRED after ' + r.rounds + ' rounds' : 'P' + r.champPos + ' in the championship'}`).join('<br>');
  el.innerHTML = kind === 'gp'
    ? `<h3>GRAND PRIX</h3>A championship over a series of circuits. F1 points (25-18-15-12-10-8-6-4-2-1, +1 for fastest lap). Same teams all season, grid set by the standings after round 1. No upgrades — pure racing.`
    : `<h3>CAREER</h3>A season on random circuits with random weather. The AI gets faster every round.<br><br>
       The Team Principal sets a <b>target</b> each round — miss it and you lose a <b>&#9733;</b>. Lose all three and you're fired.<br><br>
       Earn prize money to buy <b>upgrades</b> (engine, aero, suspension, tyres, durability, pit crew) and pick a <b>perk card</b> after every race. Every run plays differently.
       ${h ? `<div class="hist"><b>RECENT RUNS</b><br>${h}</div>` : ''}`;
}
function openCareer() {
  const saved = CAREER.loadRun('career'), savedGP = CAREER.loadRun('gp');
  const items = [];
  if (saved && !saved.over) items.push({ label: `Continue Career <small style="font-size:13px;color:#9aa6ba">RND ${saved.round + 1}/${saved.schedule.length}</small>`, action: () => { career = saved; fadeTo(() => { renderPaddock(); show('s-paddock'); }, 200); } });
  if (savedGP && !savedGP.over) items.push({ label: `Continue Grand Prix <small style="font-size:13px;color:#9aa6ba">RND ${savedGP.round + 1}/${savedGP.schedule.length}</small>`, action: () => { career = savedGP; fadeTo(() => { renderPaddock(); show('s-paddock'); }, 200); } });
  items.push(
    { label: 'New Career', cls: 'head', disabled: true },
    { label: 'Rounds', values: [[4, '4 (short)'], [6, '6'], [8, '8 (season)']], get: () => newOpts.rounds, set: v => newOpts.rounds = v, k: 'c' },
    { label: 'Challenge', values: [[false, 'Normal'], [true, 'Hard']], get: () => newOpts.hard, set: v => newOpts.hard = v, k: 'c' },
    { label: 'Race Laps', values: [3, 5, 8, 12, 15].map(v => [v, String(v)]), get: () => newOpts.laps, set: v => newOpts.laps = v, k: 'c' },
    { label: 'Circuits', values: [['presets', 'Presets'], ['all', 'Presets + Mine'], ['mine', 'My Circuits']], get: () => newOpts.pool, set: v => newOpts.pool = v, k: 'c' },
    { label: 'Start Career', cls: 'action', action: () => startNewCareer(), k: 'c' },
    { label: 'Grand Prix', cls: 'head', disabled: true },
    { label: 'Circuits', values: [['presets', 'All Presets'], ['all', 'Presets + Mine'], ['mine', 'My Circuits']], get: () => newOpts.gpPool, set: v => newOpts.gpPool = v, k: 'gp' },
    { label: 'Race Laps', values: [3, 5, 8, 12, 15, 20].map(v => [v, String(v)]), get: () => newOpts.gpLaps, set: v => newOpts.gpLaps = v, k: 'gp' },
    { label: 'Difficulty', values: Object.entries(DIFF_LABEL), get: () => newOpts.gpDiff, set: v => newOpts.gpDiff = v, k: 'gp' },
    { label: 'Start Grand Prix', cls: 'action', action: () => startNewGP(), k: 'gp' },
    { label: 'Back', cls: 'action', action: () => backs['s-career']() },
  );
  const m = menus['s-career'][0];
  m.setItems(items);
  m.i = items.findIndex(it => !it.disabled);
  m.render();
  careerInfo('c');
  fadeTo(() => { if (!sim) startAttract(); show('s-career'); }, 200);
}
menus['s-career'] = [new Menu($('m-career'), [], { onMove: (it) => careerInfo(it.k === 'gp' ? 'gp' : 'c') })];
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
  CAREER.saveRun(career);
  fadeTo(() => { renderPaddock(); show('s-paddock'); });
}
function startNewGP() {
  career = withRoster(CAREER.newGrandPrix({ tracks: trackPool(newOpts.gpPool), laps: newOpts.gpLaps, difficulty: newOpts.gpDiff }));
  CAREER.saveRun(career);
  fadeTo(() => { renderPaddock(); show('s-paddock'); });
}

function standingsTable(c, highlightPts) {
  const list = CAREER.standingsList(c);
  if (!list.length) return '<tr><td style="color:#9aa6ba;font-weight:400">No races yet — the championship starts at round 1.</td></tr>';
  return `<tr><th>POS</th><th>DRIVER</th><th style="text-align:right">WINS</th><th style="text-align:right">PTS</th></tr>` + list.slice(0, 12).map((r, k) =>
    `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${k + 1}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.name}</td><td class="n">${r.wins}</td><td class="n">${r.pts}</td></tr>`).join('');
}
function renderPaddock() {
  const c = career; if (!c) return;
  const isCareer = c.kind === 'career';
  const t = c.schedule[c.round];
  $('pad-title').textContent = `${isCareer ? 'Paddock' : 'Grand Prix'} · Round ${c.round + 1}/${c.schedule.length}`;
  $('pad-top').innerHTML = isCareer ? `<div><span class="lbl">BUDGET</span><span class="money">${money(c.money)}</span></div><div><span class="lbl">TEAM PRINCIPAL</span><span class="stars">${starsHtml(c.stars)}</span></div>` : '';
  const diff = CAREER.roundDifficulty(c), target = CAREER.roundTarget(c, 12);
  const perks = (c.perks || []).map(k => `<span>${CAREER.PERKS[k].name}</span>`).join('');
  $('pad-next').innerHTML = `<div class="panel-title">NEXT RACE</div><h3>${t.name}</h3>
    <div class="cond">${THEMES[t.env.theme].label.toUpperCase()} · ${t.env.time.toUpperCase()} · ${t.env.weather.toUpperCase()}</div>
    <div class="row"><span>Laps</span><span>${c.laps}</span></div>
    <div class="row"><span>Opposition</span><span>${DIFF_LABEL[diff]}</span></div>
    <div class="row"><span>Grid</span><span>${c.round === 0 ? 'Back of the grid' : 'Championship order'}</span></div>
    ${isCareer ? `<div class="target">&#9733; Target: finish <b>P${target}</b> or better</div>` : ''}
    ${perks ? `<div class="perks">${perks}</div>` : ''}`;
  $('pad-table').innerHTML = standingsTable(c);
  const items = [{ label: `Start Round ${c.round + 1}`, cls: 'action', action: () => startCareerRound() }];
  if (isCareer) items.push({ label: 'Upgrades', action: () => openShop() });
  items.push({ label: 'Garage', action: () => openGarage('s-paddock') }, { label: 'Save & Quit', action: () => { CAREER.saveRun(c); quitToMenu(); } });
  menus['s-paddock'][0].setItems(items);
}
menus['s-paddock'] = [new Menu($('m-paddock'), [])];
backs['s-paddock'] = () => {};

function renderShop() {
  const c = career;
  $('shop-top').innerHTML = `<div><span class="lbl">BUDGET</span><span class="money">${money(c.money)}</span></div>`;
  const m = menus['s-shop'][0];
  m.setItems([...Object.entries(CAREER.UPGRADES).map(([k, u]) => {
    const lvl = c.upgrades[k], cost = CAREER.upgradeCost(lvl), maxed = lvl >= CAREER.MAX_LEVEL;
    const pips = Array.from({ length: CAREER.MAX_LEVEL }, (_, i) => i < lvl ? '&#9632;' : '<i>&#9632;</i>').join('');
    return { label: `<span style="display:flex;justify-content:space-between;width:620px"><span>${u.label}</span><span><span class="pips">${pips}</span><span class="cost ${!maxed && c.money < cost ? 'no' : ''}">${maxed ? 'MAX' : money(cost)}</span></span></span>`,
      desc: u.desc, action: () => { if (CAREER.buyUpgrade(c, k)) { sfx.best(); CAREER.saveRun(c); renderShop(); } else sfx.error(); } };
  }), { label: 'Back', cls: 'action', action: () => backs['s-shop'](), desc: '' }], true);
  $('shop-desc').textContent = m.items[m.i]?.desc || '';
}
menus['s-shop'] = [new Menu($('m-shop'), [], { onMove: (it) => { $('shop-desc').textContent = it.desc || ''; } })];
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
  $('cards').innerHTML = draft.map((k, i) => { const p = CAREER.PERKS[k]; return `<div class="card${i === draftSel ? ' sel' : ''}" data-i="${i}"><div class="tag ${p.tag}">${p.tag}</div><h4>${p.name}</h4><p>${p.desc}</p><div class="ico">${i + 1}</div></div>`; }).join('');
  $('cards').querySelectorAll('.card').forEach(el => {
    el.addEventListener('mouseenter', () => { draftSel = +el.dataset.i; renderDraft(); });
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
  startRace(track, {
    mode: 'race', laps: c.laps, opponents: 11, brief, pick: true,
    extra: { difficulty: diff, grid: 'back', roster: c.roster, teamPace: c.teamPace, gridOrder, mods: CAREER.playerMods(c) },
  }, 'career');
}

function careerRoundDone(retired = false) {
  const c = career; if (!c || !sim) return;
  let res = sim.results();
  if (retired) { const me = res.find(r => r.isPlayer); res = res.filter(r => !r.isPlayer).concat([{ ...me, gap: 'DNF', time: null, cleanFinish: false }]); res.forEach((r, k) => r.pos = k + 1); }
  for (const car of sim.cars) c.nameToTeam[car.name] = car.isPlayer ? 'P' : car.teamIdx;
  const out = CAREER.recordRound(c, res, sim.player ? sim.player.startPos : 12);
  sim.setPaused(true);
  if (c.over) { CAREER.recordHistory(c); CAREER.clearRun(c.kind); } else CAREER.saveRun(c);
  // table: this race + points
  $('round-title').textContent = `Round ${out.round + 1} · ${out.track}`;
  $('round-table').innerHTML = `<tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th style="text-align:right">PTS</th></tr>` + out.rows.map(r =>
    `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${r.pos}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.name}${r.fl ? ' <span style="color:#b98cff;font-size:11px">FASTEST LAP</span>' : ''}</td><td>${r.team}</td><td class="n">${r.pts ? '+' + r.pts : ''}</td></tr>`).join('');
  const me = out.player;
  let info = `<div class="big">${me ? 'P' + me.pos : 'DNF'}</div>`;
  if (c.kind === 'career' && out.money) {
    info += `<div class="big ${out.hit ? 'ok' : 'bad'}">${out.hit ? 'TARGET MET' : 'TARGET MISSED'}</div>
      <div class="row"><span>Team Principal wanted</span><span>P${out.target}</span></div>
      <div class="row"><span>Patience</span><span style="color:#ffd66b">${starsHtml(c.stars)}</span></div>
      <div class="row"><span>Prize money</span><span class="money">${money(out.money.prize)}</span></div>
      ${out.money.gained ? `<div class="row"><span>Places gained</span><span class="money">+${money(out.money.gained)}</span></div>` : ''}
      ${out.money.flBonus ? `<div class="row"><span>Fastest lap</span><span class="money">+${money(out.money.flBonus)}</span></div>` : ''}
      ${out.money.clean ? `<div class="row"><span>Clean race</span><span class="money">+${money(out.money.clean)}</span></div>` : ''}
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
  menus['s-round'][0].setItems([{ label: c.over ? 'Season Summary' : 'Continue', action: next }]);
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
  $('round-table').innerHTML = standingsTable(c);
  $('round-info').innerHTML = c.fired
    ? `<div class="big bad">FIRED</div>The Team Principal ran out of patience after round ${c.results.length}.<br>Final championship position: <b>P${pos}</b>.`
    : `<div class="big ${pos === 1 ? 'ok' : ''}">P${pos} IN THE CHAMPIONSHIP</div>${pos === 1 ? 'You took the title. RESPECT +' : 'Next season, the title.'}${c.kind === 'career' ? `<div class="row"><span>Budget left</span><span class="money">${money(c.money)}</span></div>` : ''}`;
  menus['s-round'][0].setItems([{ label: 'Main Menu', action: () => { career = null; quitToMenu(); } }]);
  if (!c.fired && pos === 1) sfx.finish();
  fadeTo(() => { disposeSim(); startAttract(); show('s-round'); });
}

// ---------------- online ----------------
let net = null;          // Net connection (null when offline)
let lobby = null;        // host-authoritative lobby state (clients hold a copy)
let lobbyTrack = null;   // the chosen circuit (full JSON)
let netRace = null;      // { id, recorded } for the race in progress
let netSendT = 0;
const ONLINE_SET = { track: 0, laps: 5, ai: 5, difficulty: 'medium', grid: 'random', wear: 'normal', damage: 'normal', time: 'track', weather: 'track' };
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
  { label: 'Host Game', action: () => hostGame() },
  { label: 'Join Game', action: () => { if (!$('on-code').value.trim()) { $('on-code').focus(); onlineStatus('Type the room code your friend gave you, then press Enter.'); } else joinGame(); } },
  { label: 'Edit Name', action: () => $('on-name').focus() },
  { label: 'Back', cls: 'action', action: () => backs['s-online']() },
])];
backs['s-online'] = () => { sfx.back(); fadeTo(() => show('s-main'), 200); };
$('on-name').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.target.blur(); } });
$('on-name').addEventListener('change', () => { settings.playerName = cleanName($('on-name').value); $('on-name').value = settings.playerName; saveSettings(); });
$('on-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); joinGame(); } else if (e.key === 'Escape') e.target.blur(); });
$('on-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
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
  if (msg) toast(msg, 5000);
  quitToMenu();
}

// host: circuits it can pick from
function onlineTracks() { const l = [...presetTracks(), ...savedTracks()]; if (editorTrack) l.unshift(editorTrack); return l; }
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
  net.on('state', (m) => { if (sim && sim.net && netRace && m.race === netRace.id) sim.netReceive(m.cars, m.time); });
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
  $('lob-players').innerHTML = lobby.players.map(p => {
    const [st, cls] = statusTxt(p);
    return `<tr class="${p.id === net.id ? 'me' : ''}"><td><span class="swatch" style="background:${hex(p.car?.main ?? 0xffffff)}"></span>${p.name}${p.id === lobby.hostId ? '<span class="host">&#9733;</span>' : ''}</td><td class="ping">${p.id === lobby.hostId ? '' : (p.ping ? p.ping + ' ms' : '')}</td><td class="st ${cls}">${st}</td></tr>`;
  }).join('') + (lobby.players.length < 2 ? `<tr><td colspan="3" style="color:#9aa6ba;font-weight:400">Waiting for friends… send them the room code.</td></tr>` : '');
  const pts = Object.entries(lobby.points || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.pts - a.pts);
  $('lob-points').innerHTML = pts.length ? pts.map((r, k) => `<tr class="${r.id === net.id ? 'me' : ''}"><td class="p">${k + 1}</td><td>${r.name}</td><td class="n">${r.wins} W</td><td class="n">${r.pts}</td></tr>`).join('')
    : `<tr><td style="color:#9aa6ba;font-weight:400">F1 points for every race you do together.</td></tr>`;
  if (lobbyTrack) drawPreview(lobbyTrack, 'lob-preview', 'lob-info', { time: S.time, weather: S.weather, laps: S.laps });
  const m = menus['s-lobby'][0];
  const humans = lobby.players.length;
  if (host) {
    const tracks = onlineTracks();
    const ready = lobby.players.filter(p => p.id === net.id || p.ready).length;
    const busy = lobby.players.some(p => p.id !== net.id && p.status !== 'lobby');
    m.setItems([
      { label: `Start Race <small style="font-size:13px;color:#9aa6ba">${ready}/${humans} READY${busy ? ' · SOME STILL RACING' : ''}</small>`, cls: 'action', action: () => hostStart() },
      { label: 'Circuit', values: tracks.map((t, k) => [k, t.name]), get: () => S.track, set: v => { hostPickTrack(v); hostBroadcast(); } },
      { label: 'Laps', values: [1, 2, 3, 5, 8, 10, 15, 20].map(v => [v, String(v)]), get: () => S.laps, set: v => { S.laps = v; hostBroadcast(); } },
      { label: 'AI Cars', values: Array.from({ length: 13 - humans }, (_, i) => [i, String(i)]), get: () => Math.min(S.ai, 12 - humans), set: v => { S.ai = v; hostBroadcast(); } },
      { label: 'AI Difficulty', values: Object.entries(DIFF_LABEL), get: () => S.difficulty, set: v => { S.difficulty = v; hostBroadcast(); } },
      { label: 'Grid', values: [['random', 'Random'], ['back', 'Humans at back'], ['front', 'Humans on front']], get: () => S.grid, set: v => { S.grid = v; hostBroadcast(); } },
      { label: 'Time', values: [['track', 'Track default'], ['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], get: () => S.time, set: v => { S.time = v; hostBroadcast(); } },
      { label: 'Weather', values: [['track', 'Track default'], ['clear', 'Clear'], ['overcast', 'Overcast'], ['rain', 'Rain'], ['fog', 'Fog']], get: () => S.weather, set: v => { S.weather = v; hostBroadcast(); } },
      { label: 'Tyre Wear', values: [['off', 'Off'], ['normal', 'Normal'], ['fast', 'Fast (x2.5)']], get: () => S.wear, set: v => { S.wear = v; hostBroadcast(); } },
      { label: 'Damage', values: [['off', 'Off'], ['normal', 'Normal'], ['high', 'Realistic']], get: () => S.damage, set: v => { S.damage = v; hostBroadcast(); } },
      { label: 'Garage', action: () => openGarage('s-lobby') },
      { label: 'Copy Room Code', action: () => { navigator.clipboard?.writeText(lobby.code).then(() => toast('Room code <b>' + lobby.code + '</b> copied'), () => toast('Room code: <b>' + lobby.code + '</b>')); } },
      { label: 'Close Room', action: () => backs['s-lobby']() },
    ], true);
  } else {
    const mine = me();
    m.setItems([
      { label: 'Ready', values: [[true, 'READY'], [false, 'NOT READY']], get: () => !!mine?.ready, set: v => { if (mine) mine.ready = v; net.send({ t: 'update', ready: v }); renderLobby(); } },
      { label: 'Garage', action: () => openGarage('s-lobby') },
      { label: 'Leave Room', action: () => backs['s-lobby']() },
    ], true);
  }
}
menus['s-lobby'] = [new Menu($('m-lobby'), [])];
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
  const m = { t: 'start', race: Math.random().toString(36).slice(2, 9), track, grid, cfg: { laps: S.laps, difficulty: S.difficulty, wear: S.wear, damage: S.damage },
    aiChassis: settings.aiChassis, aiClassCar: carId(settings.car), t0: net.now() + 4500, goDelay: 4.5 + 0.6 + Math.random() * 1.2, strat: 20 };
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
      aiChassis: m.aiChassis || 'custom', aiClassCar: m.aiClassCar || 'f1', difficulty: m.cfg.difficulty, wear: m.cfg.wear, damage: m.cfg.damage, team: 'garage', startTyre: 'auto', grid: 'back',
      net: { host: net.isHost, myId: net.id, grid: m.grid, t0: m.t0, goDelay: m.goDelay, strat: m.strat || 0, clock: () => net.now() },
    },
  }, 'online');
}
// every frame of an online race: stream my car(s); the host scores the race once all humans are done
let lobbyPingT = 0;
function netTick(dt) {
  if (net && net.isHost && lobby && screen === 's-lobby' && (lobbyPingT += dt) > 3) { lobbyPingT = 0; hostBroadcast(); }
  if (!sim || !sim.net || !net || !netRace) return;
  netSendT += dt;
  if (netSendT >= 0.05) { netSendT = 0; net.sendState({ t: 'st', race: netRace.id, time: net.now(), cars: sim.netStates() }); }
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
  });
  netRace.final = rows.map(slimRow);
  net.send({ t: 'end', race: netRace.id, rows: netRace.final, forced });
  hostBroadcast();
  if (screen === 's-results') renderNetResults();
}
const slimRow = (r) => ({ pos: r.pos, name: r.name, team: r.team, color: r.color, human: r.human, key: r.key, time: r.time, gap: r.gap, best: isFinite(r.best) ? r.best : null, pits: r.pits, dnf: r.dnf, finished: r.finished, lap: r.lap });

function showNetResults() {
  setMyStatus('results');
  renderNetResults();
  show('s-results');
  menus['s-results'][0].i = 0;
}
function renderNetResults() {
  if (!sim) return;
  const final = netRace && netRace.final;
  const myKey = sim.player && sim.player.key;
  const rows = (final || sim.results().map(slimRow)).map(r => ({ ...r, isPlayer: r.key === myKey,
    gap: !final && !r.finished && !r.dnf ? `RUNNING · L${Math.min(r.lap, sim.laps)}` : r.gap }));
  renderResultsTable(rows);
  $('results-table').insertAdjacentHTML('afterbegin', final ? '' : `<caption style="caption-side:top;color:#ffd66b;text-align:left;padding-bottom:6px">Race in progress — waiting for everyone to finish…</caption>`);
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
  i6turbo: 'Twin-turbo straight six', v6turbo: 'Twin-turbo V6', v6na: 'V6', flat6: 'Flat six', flat12: 'Flat twelve', i4turbo: 'Turbo four', diesel: 'Turbo diesel' };
const CLASS_COL = { f1: '#e1261c', gt1: '#2a7fd0', street: '#e8b13a', fun: '#4f9a3c' };
let csel = null; // { cls, id, shownId, t, blip }
const carReady = (id) => id === 'svgp' || (id === 'f1' ? customCarStatus() === 'ready' : chassisReady(id));
const carsOfClass = (cls) => Object.keys(CARS).filter(id => CARS[id].cls === cls && carReady(id));
const classList = () => Object.keys(CLASSES).filter(k => carsOfClass(k).length);
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
  const want = carId(settings.car), id = carReady(want) ? want : 'svgp';
  csel = { cls: CARS[id].cls, id, shownId: carId(sim.opts.car), t: 0, blip: 0 };
  const env = sim.track.env;
  $('cs-track').textContent = sim.track.name;
  $('cs-cond').textContent = `${sim.mode === 'test' ? 'Time Trial' : sim.laps + (sim.laps === 1 ? ' Lap' : ' Laps')} · ${env.time} · ${env.weather}`;
  $('cs-back').style.display = raceReturn === 'setup' ? '' : 'none';
  renderCarSelect(true);
  show('s-carsel');
}
function renderCarSelect(swap = false) {
  const { cls, id } = csel, C = CARS[id], st = carStats(id), s = C.spec, col = CLASS_COL[cls] || '#2a7fd0';
  const cur = carId(settings.car), mph = settings.units === 'mph';
  $('cs-tabs').innerHTML = classList().map(k => `<span data-cls="${k}" class="${k === cls ? 'on' : ''}" style="--c:${CLASS_COL[k]}">${CLASSES[k].label}</span>`).join('');
  $('cs-cars').innerHTML = carsOfClass(cls).map(k => `<div class="cs-card${k === id ? ' on' : ''}${k === cur ? ' cur' : ''}" data-id="${k}" style="--c:${col}"><small>${CLASSES[cls].short}</small><b>${CARS[k].name}</b></div>`).join('');
  const drive = s.drive >= 0.99 ? 'Front-wheel drive' : s.drive > 0.01 ? 'All-wheel drive' : 'Rear-wheel drive';
  const paint = C.cls === 'f1' ? 'Your livery' : C.paint ? 'Takes your colour' : 'Original livery';
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
  if (up || down) { const cl = classList(), k = cl.indexOf(csel.cls); setSelClass(cl[(k + (down ? 1 : -1) + cl.length) % cl.length]); }
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
  fadeTo(() => { sim.commitCar(settings.car); sim.startAfterPick(); enterRace(); });
}
backs['s-carsel'] = () => { if (raceReturn === 'setup') { sfx.back(); fadeTo(() => { disposeSim(); openSetup(editorTrack); }); } };

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
  if (sim && sim.pickedCar) { sfx.back(); fadeTo(() => { sim.state = 'carselect'; sim.stateT = 0; openCarSelect(); }); return; }
  if (raceReturn === 'setup') { sfx.back(); fadeTo(() => { disposeSim(); openSetup(editorTrack); }); } };
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
];
let raceReturn = 'setup';
let pitSel = 0;
let lastRace = null;

function startRace(track, cfg, ret, quick = false) {
  raceReturn = ret;
  lastRace = { track: cloneTrack(track), cfg: { ...cfg }, ret };
  fadeTo(() => {
    disposeSim();
    show('s-loading');
    $('load-name').textContent = track.name;
    $('load-sub').textContent = `${THEMES[track.env.theme].label} · ${track.env.time} · ${track.env.weather}`.toUpperCase();
    $('load-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    drawLoadArt(track);
    const fill = $('load-fill');
    fill.style.width = '0%';
    let p = 0;
    const iv = setInterval(() => { p = Math.min(p + 4 + Math.random() * 6, 90); fill.style.width = p + '%'; }, 60);
    setTimeout(async () => {
      await loadEnvModels(); // the setting's models (usually loaded long before)
      const t0 = performance.now();
      sim = new Race(track, {
        mode: cfg.mode, laps: cfg.laps || track.env.laps || 3, opponents: cfg.opponents ?? track.env.opponents ?? 7,
        difficulty: settings.difficulty, grid: settings.grid, team: settings.team, gearbox: settings.gearbox, tc: settings.tc,
        units: settings.units, camera: settings.camera, racingLine: settings.racingLine, car: settings.car,
        wear: settings.wear, damage: settings.damage, startTyre: settings.startTyre, aiChassis: settings.aiChassis, drift: raceReturn === 'setup' ? settings.drift : 'off',
        pickCar: !!cfg.pick && !quick,
        ...(cfg.extra || {}),
      }, renderer);
      // warm-up render so shaders compile behind the loading screen
      sim.update(0.016, { steer: 0, throttle: 0, brake: 0 }, {});
      sim.render(post, settings);
      hud.setTrack(sim.T, sim.A, sim.world.roadLines);
      hud.reset(cfg.mode === 'race' ? 'race' : 'test');
      driftHud.reset(); if (sim.drift) driftHud.show(); else driftHud.hide();
      const wait = Math.max(0, 1300 - (performance.now() - t0));
      setTimeout(() => {
        clearInterval(iv); fill.style.width = '100%';
        setTimeout(() => fadeTo(enterRace), 250);
      }, wait);
    }, 120);
  });
}

// after loading (and after the car select): the next pre-race screen, or straight into the race
function enterRace() {
  if (sim.state === 'carselect') { openCarSelect(); return; }
  if (sim.state === 'strategy') { openStrategy(); return; }
  beginHud();
  if (sim.mode === 'test') {
    hud.help('<b>TIME TRIAL</b><br>Set your fastest lap. <b>W/S</b> throttle &amp; brake, <b>A/D</b> steer, <b>C</b> camera, <b>R</b> reset, <b>ESC</b> pause.', 7000);
  }
}

function drawLoadArt(track) {
  const cv = $('load-canvas'), c = cv.getContext('2d'), W = cv.width, H = cv.height;
  const th = track.env.theme, tm = track.env.time;
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
      if (raceReturn === 'career' && lastRace.cfg.brief) setTimeout(() => hud.help(lastRace.cfg.brief, 7000), 1200);
      if (!localStorage.getItem('svgp.seenHelp')) {
        localStorage.setItem('svgp.seenHelp', '1');
        hud.help('Hold <b>W</b> to accelerate and <b>S</b> to brake. Steer with <b>A</b> and <b>D</b>.<br>Press <b>C</b> to change camera and <b>R</b> if you get stuck.', 8000);
      }
    } else if (ev.type === 'lap') {
      const prevBest = sim.player.lapTimes.length > 1 ? Math.min(...sim.player.lapTimes.slice(0, -1)) : null;
      let delta = '';
      if (prevBest) { const d = ev.time - prevBest; delta = `<span class="${d < 0 ? 'faster' : 'slower'}">${d < 0 ? '-' : '+'}${Math.abs(d).toFixed(3)}</span>`; }
      hud.split(`<span class="t">${fmtTime(ev.time, 3)}</span>${delta}`);
      if (ev.best && prevBest) { sfx.best(); } else sfx.lap();
      const name = sim.track.name, bl = bestLaps();
      if (!bl[name] || ev.time < bl[name]) { bl[name] = ev.time; try { localStorage.setItem('svgp.best', JSON.stringify(bl)); } catch (e) {} if (sim.mode === 'test' && prevBest !== null) hud.center('NEW RECORD', 'white', 1600); }
      if (sim.mode === 'race' && ev.lap <= ev.laps) hud.center(ev.lap === ev.laps ? 'FINAL LAP' : `LAP ${ev.lap}`, '', 1600);
    } else if (ev.type === 'finish') {
      sfx.finish();
      const p = ev.pos, o = ['TH', 'ST', 'ND', 'RD'][(p % 100 - 20) % 10] || ['TH', 'ST', 'ND', 'RD'][p % 100] || 'TH';
      const ds = sim.drift ? ` &middot; DRIFT ${Math.round(sim.drift.total).toLocaleString('en-US')}` : '';
      hud.center(p === 1 ? `WINNER!<span class="sub">RACE PASSED &middot; RESPECT +${ds}</span>` : `${p}${o} PLACE<span class="sub">RACE COMPLETE${ds}</span>`, p === 1 ? '' : 'white', 4500);
    } else if (ev.type === 'results') { if (raceReturn === 'career') careerRoundDone(); else if (raceReturn === 'online') { if (screen !== 's-results') showNetResults(); } else showResults(); }
    else if (ev.type === 'radio') { hud.help(`<b>RADIO</b><br>${ev.msg}`, ev.big ? 6000 : 4500); if (ev.big) sfx.lap(); }
    else if (ev.type === 'pitIn') { pitSel = 0; sfx.select(); }
    else if (ev.type === 'pitOut') { hud.split(`<span class="t">PIT STOP</span><span class="faster">${ev.time.toFixed(1)}s</span>`, 2500); sfx.go(); }
    else if (ev.type === 'line') { settings.racingLine = ev.mode; saveSettings(); hud.help(`Racing line: <b>${{ off: 'OFF', brake: 'BRAKING ONLY', full: 'FULL' }[ev.mode]}</b>`, 1500); }
  }
}

const driftRecords = () => { try { return JSON.parse(localStorage.getItem('svgp.drift') || '{}'); } catch (e) { return {}; } };
function showResults() {
  const res = sim.results();
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
  menus['s-results'][0].setItems(RESULT_ITEMS);
  menus['s-results'][0].i = 0; menus['s-results'][0].render();
}
function renderResultsTable(res) {
  $('results-table').innerHTML = `<tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th>TIME</th><th>BEST LAP</th><th>PITS</th></tr>` + res.map(r =>
    `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${r.pos}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.name}</td><td>${r.team}</td><td class="t">${r.pos === 1 && r.time ? fmtTime(r.time, 3) : r.gap}</td><td class="t">${r.best && isFinite(r.best) ? fmtTime(r.best, 3) : '\u2014'}</td><td class="t">${r.pits}</td></tr>`).join('');
}
const RESULT_ITEMS = [
  { label: 'Race Again', action: () => startRace(lastRace.track, lastRace.cfg, lastRace.ret) },
  { label: 'Race Setup', action: () => { disposeSim(); openSetup(editorTrack); } },
  { label: 'Main Menu', action: () => quitToMenu() },
];
menus['s-results'] = [new Menu($('m-results'), RESULT_ITEMS)];
backs['s-results'] = () => {};

// pause
function pause() {
  if (!sim || sim.mode === 'attract') return;
  driftHud.quiet();
  if (raceReturn === 'online') {
    // online races never stop: your car coasts to a halt while the menu is open
    menus['s-pause'][0].setItems([
      { label: 'Resume', action: () => show('hud') },
      { label: 'Options', action: () => openOptions('s-pause') },
      { label: 'Retire', action: () => { sim.retire(); showNetResults(); } },
      { label: 'Leave Session', action: () => leaveOnline() },
    ]);
    show('s-pause'); sfx.back();
    return;
  }
  sim.setPaused(true);
  const test = raceReturn === 'editor';
  if (raceReturn === 'career') {
    menus['s-pause'][0].setItems([
      { label: 'Resume', action: resume },
      { label: 'Options', action: () => openOptions('s-pause') },
      { label: 'Retire (Last Place)', action: () => careerRoundDone(true) },
    ]);
  } else menus['s-pause'][0].setItems([
    { label: 'Resume', action: resume },
    { label: 'Restart', action: () => startRace(lastRace.track, lastRace.cfg, lastRace.ret, true) },
    { label: 'Options', action: () => openOptions('s-pause') },
    { label: test ? 'Back To Editor' : 'Quit Race', action: () => test ? backToEditor() : quitToMenu() },
  ]);
  show('s-pause');
  sfx.back();
}
function resume() { show('hud'); sim.setPaused(false); }
menus['s-pause'] = [new Menu($('m-pause'), [])];
backs['s-pause'] = () => resume();
backs['hud'] = () => pause();
function quitToMenu() { if (net) { net.close(); net = null; lobby = null; netRace = null; } fadeTo(() => { disposeSim(); startAttract(); show('s-main'); }); }

// ---------------- editor ----------------
const editor = new Editor({
  onTest: (t) => { editorTrack = t; startRace(t, { mode: 'test' }, 'editor'); },
  onRace: (t) => { editorTrack = t; fadeTo(() => { editor.close(); }, 1); setTimeout(() => openSetup(t), 50); },
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
  const tab = pressed('Tab');
  if (screen === 's-boot') { if (ok || back) bootGo && bootGo(); return; }
  if (screen === 's-draft') {
    if (left && draftSel > 0) { draftSel--; sfx.move(); renderDraft(); }
    if (right && draftSel < draft.length - 1) { draftSel++; sfx.move(); renderDraft(); }
    if (ok) takeDraft();
    return;
  }
  if (back && backs[screen]) { backs[screen](); return; }
  if (!list) return;
  const m = list[focusIdx[screen] || 0];
  if (tab && list.length > 1) { focusIdx[screen] = ((focusIdx[screen] || 0) + 1) % list.length; list.forEach((x, k) => x.setActive(k === focusIdx[screen])); sfx.move(); return; }
  if (up) m.move(-1);
  if (down) m.move(1);
  if (left) { if (m.items[m.i]?.values) m.change(-1); else if (list.length > 1 && focusIdx[screen] > 0) { focusIdx[screen]--; list.forEach((x, k) => x.setActive(k === focusIdx[screen])); sfx.move(); } }
  if (right) { if (m.items[m.i]?.values) m.change(1); else if (list.length > 1 && (focusIdx[screen] || 0) < list.length - 1) { focusIdx[screen] = (focusIdx[screen] || 0) + 1; list.forEach((x, k) => x.setActive(k === focusIdx[screen])); sfx.move(); } }
  if (ok) m.activate();
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' && screen !== 's-editor') e.preventDefault();
  if (e.code === 'KeyF' && screen !== 's-editor' && !(e.target && e.target.tagName === 'INPUT')) toggleFullscreen();
});
document.addEventListener('click', () => initAudio(), { once: true });

// ---------------- main loop ----------------
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
  } else if (screen === 's-garage' || screen === 's-livery') {
    if (screen === 's-garage') menuInput(); else clearEdges();
    garage.update(dt);
  } else if (screen !== 's-editor') {
    menuInput();
    if (sim && sim.mode === 'attract') sim.update(dt, {}, {});
  } else {
    clearEdges();
  }
  netTick(dt);
  if (screen === 's-garage' || screen === 's-livery') garage.render();
  else if (sim && screen !== 's-editor' && screen !== 's-loading') sim.render(post, settings);
  else if (screen !== 's-editor') { renderer.setRenderTarget(null); renderer.setClearColor(0x000000); renderer.clear(); }
  clearEdges();
  requestAnimationFrame(frame);
}

applyVideo();
// make sure the game fonts are ready before the first frame (canvas text needs them too)
Promise.race([
  Promise.all([...["40px 'Pirata One'", "40px Anton", "16px Arimo", "bold 16px Arimo", "16px VT323"].map(f => document.fonts.load(f)), loadCustomCar(), loadRoadCars(), loadEnvCatalog()]),
  new Promise(r => setTimeout(r, 2500)),
]).then(() => { boot(); loadEnvModels(); }); // scenery models keep loading in the background (a race waits for them)
// keep the local server alive while the game is open (it auto-exits after the window closes)
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) setInterval(() => fetch('/__ping', { cache: 'no-store' }).catch(() => {}), 20000);
requestAnimationFrame(frame);

// debug handle
window.__svgp = { get post() { return post; }, get sim() { return sim; }, get editor() { return editor; }, get net() { return net; }, get lobby() { return lobby; }, get garage() { return garage; }, settings, startRace, openEditor, show, get screen() { return screen; },
  open: { setup: () => openSetup(), career: () => openCareer(), online: () => openOnline(), garage: () => openGarage(), options: () => openOptions('s-main'), help: () => show('s-help'), credits: () => { fillCredits(); show('s-credits'); }, main: () => show('s-main') } };
