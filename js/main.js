// San Velocita Grand Prix — app shell: screens, menus, flow
import * as THREE from 'three';
import { PS2Post } from './post.js';
import { Race, TYRE_FIT, buildScenery, setMirror } from './race.js';
import { PROGRAMMES, progById, ACCLIM_PASS } from './practice.js';
import { FX } from './tirefx.js';
import { realTracks, needsHydrate, hydrateReal, nameCorners } from './realtracks.js';
import { HUD, fmtTime, RADAR_ZOOMS, readThemeColours, condCol } from './hud.js';
import { Editor } from './editor.js';
import { initInput, pressed, isDown, clearEdges, pollGamepad, driveControls, gp, device, onDevice, rumble, rightStick, padFeel, STEER_CURVES, DEADZONES, STEER_LAGS, wheel, looksLikeWheel } from './input.js';
import { WheelSetup } from './wheelsetup.js';
import { ffb, ffbSend } from './ffb.js';
import { lapKey, lapsFor, loadPB, referenceLap, analyze } from './telemetry.js';
import { drawChart, drawMap, notesHtml, fmtGap, fmtSpeed, drawLineMap, lineMapHit, lineMapZoom, lineMapPan, chartHit, popHtml, boardZones, lineRange, setScramble, tipText } from './lapreview.js';
import { garbleTree } from './garble.js';
import { AIDS, AID_KEYS, PRESETS, PRESET_VALS, aidsOf, presetOf, applyPreset, aidBonus, AID_RULES, AID_RULE_DESC, limitAids } from './aids.js';
import { initAudio, sfx, setVolume, setMusicVolume, setMusicScene, updateMusic } from './audio.js';
import { presetTracks, sampleTrack, trackStats, THEMES, cloneTrack } from './track.js';
import { TEAMS } from './car.js';
import { Garage } from './garage.js';
import { PitGarage } from './pitgarage.js';
import { Opening, trailerModel } from './opening.js';
import { driveHomeTrack, PARK } from './drivehome.js';
import { Computer } from './computer.js';
import { restoreSaves, exportBackup, importBackup } from './backup.js';
import { voiceState, voiceStatus, voiceSignIn, voiceSignOut, voiceReacts, converse, pressAnswer, pitchAnswer, voiceStories, TALK_INTENTS } from './voice.js';
import { carPhoto } from './carphoto.js';
import { PARTS, DEFAULT_CAR, chassisReady, setStance } from './carmodel.js';
import * as CAREER from './career.js';
import * as WCX from './wcareer.js';
// co-op: on the friend's copy every change to the career (WC_OPS) runs there at once, so the screens answer, and is
// sent to the host, whose copy is the career (coopSend / coopHostMessage 'op'); the host's copy comes back a moment later
const WC_OPS = new Set(['acquireCar', 'buyCar', 'buyCar2', 'buyFit', 'newPart', 'rebuildPart', 'rebuildSelf', 'startProject', 'workOnProject', 'buildFacility', 'sellFacility', 'sellCar',
  'orderTyres', 'hireStaff', 'fireStaff', 'payBack', 'setPay', 'applyLoan', 'sellAnnuity', 'offerDriver', 'extendMate', 'setMatePay', 'setCar2Fix', 'removeFit', 'removeGrey',
  'answerSponsor', 'answerWorks', 'answerInvestor', 'answerBuyout', 'answerPoach', 'answerGent', 'answerStory', 'answerOffer', 'rsvpEvent', 'coopDay', 'coopAsk', 'coopCancelAsk', 'coopTogether', 'coopGigTake', 'coopGigDone']);
const WC = new Proxy(WCX, { get(m, k) {
  const f = m[k]; if (typeof f !== 'function' || !WC_OPS.has(k)) return f;
  return (...a) => {
    const guest = coop && !coop.host && world && a[0] === world;
    if (guest && !GUEST_OPS.has(k)) { coopNotYours(); return undefined; }
    const send = guest ? a.slice(1).map(coopRef) : null; const r = f(...a); if (send) coopSend(k, send); return r;
  };
} });
// (what the co-owner may do on their own: their car, its upgrades and development, the tyres; the rest is the host's)
const GUEST_OPS = new Set(['buyCar2', 'setCar2Fix', 'buyFit', 'removeFit', 'startProject', 'workOnProject', 'orderTyres', 'coopDay', 'coopAsk', 'coopCancelAsk', 'coopTogether', 'coopGigTake', 'coopGigDone']);
import { Phone } from './phone.js';
import { Net, PROTO } from './net.js';
import { LiveryDesigner } from './liverydesigner.js';
import { loadCustomCar, customCarStatus } from './glbcar.js';
import { loadRoadCars } from './roadcar.js';
import { DriftHUD } from './drifthud.js';
import { PhotoMode, OPTS as PHOTO_OPTS } from './photomode.js';
import { CARS, CLASSES, CAR_CREDITS, carId, carOf, chassisKey, carsInClass } from './cars.js';
import { Tuning } from './tuning.js';
import { activeName, activeSetup, stanceOf } from './setup.js';
import { assets, liveryAssetIds, importImageFile, fillLivery } from './livery.js';
import { savedLiveries, saveLivery, deleteLivery, liveryDate } from './liveries.js';
import { loadEnvCatalog, loadEnvModels, envCatalog } from './envlib.js';
import { setWorldOptions } from './world.js';
import { TeamSetup } from './teamsetup.js';
import { DayPlan } from './dayplan.js';
import { CarPanel, partEffect } from './carsheet.js';
import { ListPaper } from './thelist.js';
import { Ending } from './ending.js';
import { portrait, photoOf, setPhotoContext, driverLivery, driverFace, setPeopleSource } from './drivers.js';
import { setVertexSnapEnabled, setJitterScale, setAffineAmount, setAffineCap, setAffineFade } from '../vendor/psx/src/PSXMaterial.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ---------------- your saves: restored from saves/ (serve.py) if the browser lost them, then mirrored there ----------------
const backup = await restoreSaves();
voiceStatus(); // (character voices: is serve.py here, and is someone signed in with ChatGPT?)

// ---------------- settings ----------------
const DEFAULTS = {
  uiTheme: 'red', res: 'ps2', filter: 'soft', trails: true, scan: false, dither: true, retro: 'psx', palette: 128, psxMat: 'strong', crt: 'flat', grain: 'light', rays: true, fringe: true, shadows: true, dirtFx: 5, look: 'arcade', units: 'kmh', gearbox: 'auto', tc: true,
  volume: 7, music: 5, camera: 'chase', mirror: 'on', racingLine: 'full', wear: 'normal', damage: 'normal', startTyre: 'auto', drift: 'off', aiChassis: 'class', rules: 'arcade', aiMistakes: 'normal', quali: 0, radarMap: 'satellite', radarZoom: 'normal', car: null, difficulty: 'medium', grid: 'back', team: 0, time: 'track', weather: 'track',
};
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('svgp.settings') || '{}') }; } catch (e) {}
settings.car = { ...DEFAULT_CAR, ...(settings.car || {}) };
setMirror(settings.mirror !== 'off');
if (settings.grain === true) settings.grain = 'medium'; else if (settings.grain === false) settings.grain = 'off';
document.documentElement.dataset.theme = settings.uiTheme; // (before the first screen, so the boot screen is already in your colours)
if (settings.team === 0 || settings.team === undefined) settings.team = 'garage';
// (new car classes: the AI now follows your class by default)
if (!settings.carsV) { if (settings.aiChassis === 'custom') settings.aiChassis = 'class'; settings.carsV = 1; }
// driver aids: old saves had one on/off 'tc' switch
if (!settings.aids) settings.aids = aidsOf(settings);
settings.ghost ??= 'best'; settings.temps ??= 'normal'; settings.dirtyAir ??= 'on'; settings.voices ??= 'written'; settings.vibration ??= 'normal'; settings.steerCurve ??= 'normal'; settings.deadzone ??= 'normal'; settings.steerSpeed ??= 'normal'; settings.brakeCurve ??= 'linear';
settings.wheelOn ??= true; settings.wheelRot ??= 900; settings.wheelLock ??= 360; settings.ffb ??= 'normal'; settings.ffbDir ??= 1;
const FFB_GAIN = { off: 0, light: 0.55, normal: 0.85, strong: 1.15 };
const applyWheel = () => { wheel.cfg = settings.wheel || null; wheel.on = !!settings.wheelOn; wheel.rot = settings.wheelRot; wheel.lock = settings.wheelLock; ffb.on = !!(settings.wheel && settings.wheelOn && settings.ffb !== 'off'); };
let ffbTestUntil = 0;
applyWheel();
const applyPadFeel = () => { padFeel.curve = STEER_CURVES[settings.steerCurve] ?? 1.6; padFeel.dz = DEADZONES[settings.deadzone] ?? 0.12; padFeel.lag = STEER_LAGS[settings.steerSpeed] ?? 0.05; padFeel.brake = settings.brakeCurve; };
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
  FX.dirt = (settings.dirtFx ?? 5) / 5; // (dust and thrown dirt: 0 off, 1 as designed, 2 double)
  document.body.classList.toggle('no-scan', !settings.scan);
  document.documentElement.dataset.theme = settings.uiTheme; readThemeColours(); // (css/sv.css: the blue palette)
  setVolume(settings.volume / 10); setMusicVolume(settings.music / 10);
  hud.units = settings.units; hud.dirtyAir = settings.dirtyAir !== 'off';
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
hud.padGlyphs = device.kind === 'pad'; onDevice((k) => { hud.padGlyphs = k === 'pad'; });
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
  requestAnimationFrame(() => document.querySelectorAll(`#${id} .scroll-fade, #${id} .credits-scroll, #${id} .help-page:not([hidden])`).forEach(markScroll)); // (sized now it's on screen)
}
function fadeTo(fn, ms = 320) {
  const f = $('fade'); f.classList.add('on');
  setTimeout(() => { fn(); requestAnimationFrame(() => f.classList.remove('on')); }, ms);
}

// ---------------- button prompts (keyboard keys or pad buttons, whichever you used last) ----------------
const GLYPHS = {
  kb: { tune: '<kbd>T</kbd>', nav: '<kbd>&#8593;</kbd><kbd>&#8595;</kbd>', lr: '<kbd>&#8592;</kbd><kbd>&#8594;</kbd>', ok: '<kbd>Enter</kbd>', back: '<kbd>Esc</kbd>', tab: '<kbd>Q</kbd><kbd>E</kbd>', skip: '<kbd>Enter</kbd>', view: '<kbd>V</kbd>', scrub: '<kbd>Z</kbd><kbd>X</kbd>', cls: '<kbd>&#8593;</kbd><kbd>&#8595;</kbd>', phone: '<kbd>P</kbd>',
    cam: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', look: '<kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd>', dolly: '<kbd>Q</kbd><kbd>E</kbd>', zoom: '<kbd>Z</kbd><kbd>X</kbd>', shoot: '<kbd>Space</kbd>', hide: '<kbd>H</kbd>' },
  pad: { tune: '<kbd class="pb y">Y</kbd>', nav: '<kbd class="dpad"></kbd>', lr: '<kbd class="dpad h"></kbd>', ok: '<kbd class="pb a">A</kbd>', back: '<kbd class="pb b">B</kbd>', tab: '<kbd class="pl">LB</kbd><kbd class="pl">RB</kbd>', skip: '<kbd>Enter</kbd>', view: '<kbd class="pb y">Y</kbd>', scrub: '<kbd class="pl">LT</kbd><kbd class="pl">RT</kbd>', cls: '<kbd class="pl">LB</kbd><kbd class="pl">RB</kbd>', phone: '<kbd class="pb y">Y</kbd>',
    cam: '<kbd class="pl">LS</kbd>', look: '<kbd class="pl">RS</kbd>', dolly: '<kbd class="pl">LB</kbd><kbd class="pl">RB</kbd>', zoom: '<kbd class="pl">LT</kbd><kbd class="pl">RT</kbd>', shoot: '<kbd class="pb a">A</kbd>', hide: '<kbd class="pb y">Y</kbd>' },
};
// per screen: [glyph, label] pairs; a function for screens whose prompts change
const HINTS = {
  's-main': [['nav', 'Navigate'], ['ok', 'Select']],
  's-setup': () => [['nav', 'Circuit'], ['ok', 'Choose circuit'], ['back', fromEditor ? 'Back to editor' : 'Back']],
  's-raceset': () => [['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select'], ['back', fromEditor ? 'Back to editor' : 'Circuits']],
  's-career': [['tab', 'Career type'], ['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select'], ['back', 'Back']],
  's-online': [['nav', 'Navigate'], ['ok', 'Select'], ['back', 'Back']],
  's-lobby': () => [['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select'], ['back', net && net.isHost ? 'Close room' : 'Leave room']],
  's-buyin': [['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select'], ['back', 'Leave']],
  's-paddock': [['nav', 'Navigate'], ['ok', 'Select']],
  's-shop': [['nav', 'Navigate'], ['ok', 'Buy'], ['back', 'Back']],
  's-draft': [['lr', 'Choose'], ['ok', 'Take card']],
  's-round': [['ok', 'Continue']],
  's-garage': [['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select'], ['back', 'Save & back']],
  's-options': [['tab', 'Section'], ['nav', 'Navigate'], ['lr', 'Change'], ['back', 'Back']],
  's-wheel': () => wheelSetup.hints(),
  's-help': [['tab', 'Page'], ['back', 'Back']],
  's-credits': [['nav', 'Scroll'], ['back', 'Back']],
  's-carsel': () => [['lr', 'Car'], ['cls', 'Class'], ...(sim && sim.net ? [] : [['tune', 'Tuning']]), ['ok', 'Select car'], ...(raceReturn === 'setup' ? [['back', 'Back']] : [])],
  's-tuning': [['tab', 'Section'], ['nav', 'Navigate'], ['lr', 'Adjust'], ['ok', 'Select'], ['back', 'Done']],
  's-strat': () => [['nav', 'Navigate'], ['lr', 'Edit custom plan'], ['ok', sim && sim.net ? 'Lock in' : 'Confirm & race'], ...(sim && sim.pickedCar && !sim.net || raceReturn === 'setup' ? [['back', 'Back']] : [])],
  's-pause': [['nav', 'Navigate'], ['ok', 'Select'], ['back', 'Resume']],
  's-photo': [['nav', 'Options'], ['cam', 'Orbit'], ['look', 'Look'], ['dolly', 'Distance'], ['zoom', 'Zoom'], ['shoot', 'Take photo'], ['hide', 'Hide menu'], ['back', 'Back']],
  's-results': [['nav', 'Navigate'], ['ok', 'Select']],
};
const hintKeys = (g) => (GLYPHS[device.kind] || GLYPHS.kb)[g];
function renderHints() {
  const el = document.querySelector(`#${screen} .footer-hints`); if (!el) return;
  let h = HINTS[screen]; if (typeof h === 'function') h = h();
  if (fp) h = [['lr', 'Choose'], ['ok', 'Fit it'], ['back', 'Leave it']]; // (the fit chooser's open over it)
  const G = GLYPHS[device.kind] || GLYPHS.kb;
  el.innerHTML = (h || []).map(([g, label]) => `<span class="hint${['ok', 'back', 'tab', 'view', 'phone', 'shoot', 'hide', 'skip'].includes(g) ? ' click' : ''}" data-g="${g}">${G[g]}<em>${label}</em></span>`).join('');
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
  else if (g === 'shoot') photoShot = true;
  else if (g === 'hide') photoHide();
  else if (g === 'skip') { if (screen === 's-wheel') wheelSetup.skip(); }
  else if (g === 'ok') {
    if (screen === 's-wheel') wheelSetup.finish();
    else if (screen === 's-draft') takeDraft(); else if (screen === 's-carsel') confirmCar();
    else if (screen === 's-hub' && ending.isOpen) ending.input({ ok: true });
    else { const l = menus[screen]; if (l) l[focusIdx[screen] || 0].activate(); }
  }
});

// ---------------- menu widget ----------------
// items: { label, action } buttons, { label, values: [[v, text]], get, set } choices, { label, head: true } section headings;
// any item may carry `desc` (shown in the screen's description bar while it's highlighted)
let lastMouse = '';
function scrollerOf(el) {
  for (let e = el; e && !e.classList.contains('screen'); e = e.parentElement) { const o = getComputedStyle(e).overflowY; if (o === 'auto' || o === 'scroll') return e; }
  return null;
}
function markScroll(sc) {
  if (!sc.classList.contains('scroll-fade')) { sc.classList.add('scroll-fade'); sc.addEventListener('scroll', () => markScroll(sc), { passive: true }); }
  sc.classList.toggle('more-up', sc.scrollTop > 2);
  sc.classList.toggle('more-down', sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2);
}
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
        if (it.values) { const a = e.target.closest('.arr'); if (a) this.change(+a.dataset.d); else if (it.action) this.activate(); else this.change(1); }
        else this.activate();
      });
    });
    // keep the focused row in view in whatever scrolls the list (the list itself, or its panel), and fade the edge
    // where there's more
    const sel = this.el.querySelector('.sel'), sc = scrollerOf(this.el);
    if (sc) { if (sel && sc.scrollHeight > sc.clientHeight + 2) sel.scrollIntoView({ block: 'nearest' }); markScroll(sc); }
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
  // a grid: d cells on, stopping at the edges (no wrapping), skipping headings
  jump(d) {
    let i = Math.max(0, Math.min(this.items.length - 1, this.i + d));
    while (this.items[i] && (this.items[i].head || this.items[i].disabled) && i !== this.i) i += Math.sign(d);
    if (!this.items[i] || i === this.i) return;
    this.i = i; sfx.move(); this.render(); this.opts.onMove && this.opts.onMove(this.items[i]);
  }
  change(d) {
    const it = this.items[this.i]; if (!it || !it.values) return;
    // (a stepped value, the Tuning screen's: nudged a step, stopping at its ends rather than wrapping round)
    if (it.nudge) { if (it.nudge(d) !== false) { sfx.move(); this.render(); } return; }
    const vals = it.values.map(v => v[0]);
    let k = vals.indexOf(it.get()); k = (k + d + vals.length) % vals.length;
    it.set(vals[k]); sfx.move(); this.render();
  }
  activate() {
    const it = this.items[this.i]; if (!it || it.disabled) return;
    if (it.values && !it.action) return this.change(1); // (a picker with an action: the arrows choose, select does it)
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

// the opening (js/opening.js): the trailer, the pile on the side table, the lottery on TV. Plays before a new World
// Career (then: your garage, with how you took the winnings, chosen at the claim office), or from the main menu as a
// preview (then: back to the menu). Esc / B skips it.
// which opening a new World Career plays: 'classic' (the couch and the pile) or 'story' (the pizzeria and the drive home)
const OPENING_VERSION = 'classic';
function openOpening(then = null, extra = {}) {
  const done = (r) => fadeTo(() => { opening.leave(); if (then) then(r); else show('s-main'); }, 400);
  fadeTo(() => { opening.enter({ name: settings.driverName || 'Driver', done, pad: () => device.kind === 'pad', skipLabel: then ? 'Skip' : 'Back', drive: (back) => startDriveHome(back), version: OPENING_VERSION, ...extra }); show('s-opening'); });
}

// ---------------- main menu ----------------
const MAIN_ITEMS = [
  { label: 'Quick Race', action: () => { fromEditor = false; openSetup(); }, desc: 'Any circuit, your rules. Race the AI or set a time trial.' },
  { label: 'Career', action: () => openCareer(), desc: 'A championship season with upgrades, perks and a Team Principal to keep happy. Or a straight Grand Prix.' },
  { label: 'Online', action: () => openOnline(), desc: 'Host a room or join a friend with a room code. Up to 8 drivers.' },
  { label: 'Garage', action: () => openGarage(), desc: 'Choose your car, build your F1 car and design its livery, helmet and suit.' },
  { label: 'The Opening', action: () => openOpening(), desc: 'Preview: how a World Career begins. The trailer, the pile on the side table, the lottery draw, the claim office. Look around with the mouse or a stick.' },
  { label: 'The Ending', action: () => openEndingPreview(), desc: 'Preview: how a World Career ends when the money runs out. The garage at night, the car going, the list off the wall, the Wire, the record. A made-up career: nothing is saved.' },
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
    action: () => { world = wsave; WC.syncStreetCars(world, streetCarList()); careerTab = 0; openHub(); } });
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
  requestAnimationFrame(() => document.querySelectorAll('#s-help .help-page:not([hidden])').forEach(markScroll));
  if (screen !== 's-help') show('s-help');
}
tabbers['s-help'] = (d) => { sfx.move(); openHelp((helpPage + d + HELP_PAGES.length) % HELP_PAGES.length); };
// scenery asset credits (the CC BY licences ask for attribution), straight from the baked catalogue
function fillCredits() {
  const c = envCatalog(), el = $('credits-list');
  const esc = (t) => String(t || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const packs = [...(c ? Object.values(c.packs) : []), ...Object.values(CAR_CREDITS), { title: 'PSX Mobile Phone', author: 'Retro Assets Library', license: 'see pack' },
    { title: 'TV Remote - (PSX)', author: 'Kasugay', license: 'CC-BY-4.0' }, { title: 'PSX Computer Asset Pack', author: 'see pack', license: 'see pack' }, { title: 'Office furniture pack (chairs)', author: 'see pack', license: 'see pack' }, { title: 'PSX Trailer Park', author: 'see pack', license: 'see pack' },
    // the real-world circuits: layouts, buildings, trees, water from the map; hills from the terrain tiles
    ...(realTracks().length ? [{ title: 'Real-World Circuits: map data', author: 'OpenStreetMap contributors', license: 'ODbL 1.0' }, { title: 'Real-World Circuits: F1 outlines', author: 'bacinger/f1-circuits', license: 'MIT' }, { title: 'Real-World Circuits: elevation', author: 'AWS Terrain Tiles (Mapzen, USGS, SRTM)', license: 'see source' },
      { title: 'Real-World Circuits: road heights (LiDAR)', author: 'Service public de Wallonie · IGN France · GSI Japan · USGS 3DEP', license: 'open data, attribution' }] : [])];
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
const part = (label, key, rebuild = true, desc = '') => ({ label, desc, values: Object.entries(PARTS[key]).map(([k, v]) => [k, v]), get: () => settings.car[key], set: v => { settings.car[key] = v; rebuild ? garage.setCar(settings.car) : garage.repaint(settings.car); } });
const paintOpt = (label, key, desc) => ({ label, desc, values: colVals, get: () => settings.car[key], set: v => { settings.car[key] = v; garage.setCar(settings.car); } });
const BODY_DESC = 'Bodywork parts. These swap on the SVGP Classic F1 car only.';
menus['s-garage'] = [new Menu($('m-garage'), [
  { label: 'Car', head: true, disabled: true },
  { label: 'Car', values: CAR_CHOICES, get: () => settings.car.chassis || 'custom', set: v => { settings.car.chassis = v; classicOnly(); garage.setCar(settings.car); },
    desc: 'The car you drive. You can also switch on the grid before every race. F1 cars and your own models (M1 ProCar, 935, Civic, Skyline) wear your full livery; the others take your main color or keep their own paint.' },
  { label: 'Class', values: Object.entries(CLASSES).map(([k, c]) => [k, c.label]), get: () => carOf(settings.car).cls, set: () => {}, disabled: true },
  { get label() { return `Tuning<small>${activeName(carId(settings.car)) || 'Standard'}</small>`; }, cls: 'action', action: () => openTuning('s-garage', carId(settings.car)),
    desc: 'Wings, springs, anti-roll bars, brakes, the differential and the gearing for this car, with what each change does before you drive it. Saved per car.' },
  { label: 'Bodywork', head: true, disabled: true },
  part('Nose', 'nose', true, BODY_DESC), part('Front Wing', 'fwing', true, BODY_DESC), part('Sidepods', 'pods', true, BODY_DESC), part('Engine Cover', 'cover', true, BODY_DESC), part('Rear Wing', 'rwing', true, BODY_DESC), part('Halo', 'halo', true, BODY_DESC),
  part('Wheels', 'rims', true, BODY_DESC), part('Rim Colour', 'rimCol', true, 'Colour of the wheel rims.'),
  { label: 'Livery', head: true, disabled: true },
  { label: 'Livery Designer', cls: 'action', action: () => openLivery(), desc: 'Place decals (your own PNG or SVG too), design the helmet and suit, and save whole team liveries.' },
  { get label() { return `Saved Liveries<small>${savedLiveries().length}</small>`; }, cls: 'action', action: () => openSavedLiveries(), desc: 'Every livery you\'ve saved, each one tried on the car as you move to it. Load one, save this one as a new entry, or delete old ones.' },
  part('Pattern', 'pattern', false, 'The paint pattern your three colours are laid out in.'), paintOpt('Main', 'main', 'The main body colour.'), paintOpt('Accent', 'accent', 'The second colour of the pattern.'), paintOpt('Detail', 'third', 'Stripes, pinstripes and small details.'),
  { label: 'Number', values: Array.from({ length: 99 }, (_, i) => [i + 1, String(i + 1)]), get: () => settings.car.number, set: v => { settings.car.number = v; garage.repaint(settings.car); }, desc: 'Your race number.' },
  { label: 'Sponsor', values: SPONSORS.map(s => [s, s]), get: () => settings.car.sponsor, set: v => { settings.car.sponsor = v; garage.repaint(settings.car); }, desc: 'The title sponsor sticker. Move it or take it off in the Livery Designer (Decals).' },
], { desc: 'd-garage' })];
menus['s-garage'][0].i = 1;
// ---- saved liveries (liveries.js) in the garage: the list in place of the menu, each one on the car as you move to it;
// loading keeps the car you're in (in the World Career, the car you bought). Back puts your livery back.
const GARAGE_ITEMS = menus['s-garage'][0].items;
let lvList = null; // { was: the livery before the list opened, del: deleting }
const lvCar = (e) => ({ ...fillLivery(JSON.parse(JSON.stringify(e.car))), chassis: lvList.was.chassis });
function lvShow(c) { garage.setCar(c); assets.load(liveryAssetIds(c)).then(() => { if (lvList && screen === 's-garage') garage.repaint(c); }).catch(() => {}); }
function openSavedLiveries() { lvList = { was: JSON.parse(JSON.stringify(settings.car)), del: false }; sfx.select(); renderSavedLiveries(true); }
function renderSavedLiveries(first = false) {
  const list = savedLiveries(), m = menus['s-garage'][0], D = lvList.del;
  const items = [{ label: `Saved Liveries<small>${list.length}</small>`, head: true }];
  if (!list.length) items.push({ label: 'None Saved Yet', disabled: true });
  for (const e of list) items.push({ label: `${escP(e.name)}<small>#${e.car.number} &middot; ${liveryDate(e)}</small>`, lv: e, confirm: D ? 'Delete it? Select again' : 'Wear it? Select again',
    action: () => D ? lvDelete(e) : lvLoad(e), desc: D ? `Deletes this ${escP(e.name)} livery for good. Your other saves stay.` : `Saved ${liveryDate(e)}. It's on the car now: select it twice to keep it${world && garageSwap ? ' (your car stays the same model)' : ''}.` });
  items.push({ label: 'Save This Livery', action: () => { if (saveLivery(settings.car, () => { if (lvList && screen === 's-garage') renderSavedLiveries(); })) { sfx.best(); toast(`Saved <b>${escP(settings.car.teamName || 'My Team')}</b> as a new livery.`); } else { sfx.error(); toast('There\'s no room left to save it.'); } renderSavedLiveries(); },
      desc: 'The livery on your car, saved as a new entry. Nothing is written over.' },
    ...(list.length ? [{ label: D ? 'Stop Deleting' : 'Delete Liveries', action: () => { lvList.del = !D; sfx.select(); renderSavedLiveries(); }, desc: D ? 'Back to trying them on.' : 'Pick the ones to delete.' }] : []),
    { label: 'Back', action: () => closeSavedLiveries(), desc: 'Back to the garage, in the livery you had.' });
  m.setItems(items, !first);
  if (first) { m.i = list.length ? 1 : items.findIndex(it => it.label === 'Save This Livery'); m.render(); }
  lvPreview(m.items[m.i]);
}
function lvPreview(it) { if (!lvList) return; lvShow(it && it.lv ? lvCar(it.lv) : settings.car); }
function lvLoad(e) {
  const c = lvCar(e); Object.keys(settings.car).forEach(k => delete settings.car[k]); Object.assign(settings.car, c);
  lvList.was = JSON.parse(JSON.stringify(settings.car)); saveSettings(); sfx.best(); toast(`<b>${escP(e.name)}</b> is on your car.`); closeSavedLiveries(true);
}
function lvDelete(e) { deleteLivery(e.id); sfx.back(); toast(`Deleted <b>${escP(e.name)}</b> (${liveryDate(e)}).`); renderSavedLiveries(); }
function closeSavedLiveries(kept = false) {
  if (!lvList) return; lvList = null; if (!kept) sfx.back();
  const m = menus['s-garage'][0]; m.setItems(GARAGE_ITEMS); m.i = GARAGE_ITEMS.findIndex(it => it.action && String(it.label).startsWith('Saved Liveries')); m.render();
  garage.setCar(settings.car); classicOnly();
}
menus['s-garage'][0].opts.onMove = (it) => { if (lvList) lvPreview(it); };
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
  setCar: (car, rebuild) => { if (rebuild || !garage.car) garage.setCar(car); else garage.repaint(car); saveSettingsSoon(); },
  onDone: () => { saveSettings(); show('s-garage'); menus['s-garage'][0].render(); },
});
let saveT = 0;
const saveSettingsSoon = () => { clearTimeout(saveT); saveT = setTimeout(saveSettings, 400); };
function openLivery() { fadeTo(() => { show('s-livery'); if (pendingDecal) { designer.pending = pendingDecal; pendingDecal = null; } designer.open(); }, 200); }
assets.load(liveryAssetIds(settings.car));
function openGarage(from = 's-main') { garageReturn = from; fadeTo(() => { disposeSim(); show('s-garage'); garage.open(settings.car); classicOnly(); }); }
let garageReturn = 's-main';
backs['s-garage'] = () => { if (lvList) return closeSavedLiveries(); sfx.back(); saveSettings(); fadeTo(() => { garage.close(); if (garageReturn === 's-paddock') { renderPaddock(); show('s-paddock'); startAttract(); }
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
const TEMPS_VALS = [['off', 'Off'], ['normal', 'Normal'], ['realistic', 'Realistic']];
const TEMPS_DESC = 'Tires grip best when they\'re warm. They heat up when you push and cool down when you don\'t: cold out of the pits, too hot if you slide around a lot. The car diagram shows each one: dull is cold, blue is right, orange to pink is too hot. <b>Normal</b>: a wide window, a small penalty either side. <b>Realistic</b>: a narrower window, more grip lost outside it, and a slide heats the surface in an instant. Race cars start on tire warmers, road cars start cold.';
const GHOST_VALS = [['best', 'Your Best'], ['ref', 'Reference'], ['off', 'Off']];
const GHOST_DESC = 'In time trial, practice and qualifying a see-through car drives a lap with you from the line: <b>Your Best</b> lap here in this car, or the Lap Review\'s <b>Reference</b>. It fades as you get close.';
const VIBES = { off: 0, low: 0.45, normal: 0.8, strong: 1.15 };
let vibeTestUntil = 0;
const OPTION_TABS = [
  ['Game', [
    { label: 'Volume', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => [v, v ? meter(v) : 'MUTE']), get: () => settings.volume, set: v => { settings.volume = v; applyVideo(); saveSettings(); }, desc: 'Master volume for engines, effects and menus.' },
    { label: 'Music', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => [v, v ? meter(v) : 'OFF']), get: () => settings.music, set: v => { settings.music = v; applyVideo(); saveSettings(); }, desc: 'Soundtrack volume. The eight tracks play in order and loop: fuller in the menus, quietly in the background on track.' },
    { label: 'Camera', values: [['chase', 'Chase'], ['far', 'Far Chase'], ['tcam', 'T-Cam'], ['bumper', 'Nose']], get: () => settings.camera, set: v => { settings.camera = v; saveSettings(); }, desc: 'The view you start races in. Press C (or Y) while driving to switch.' },
    { label: 'Rear-View Mirror', values: [['on', 'On'], ['off', 'Off']], get: () => settings.mirror, set: v => { settings.mirror = v; setMirror(v !== 'off'); saveSettings(); }, desc: 'A mirror at the top of the screen, with your lap time under it.' },
    { label: 'AI Cars', values: [['class', 'Same Class As You'], ['same', 'Same Car As You'], ['multi', 'All Classes Mixed'], ['custom', 'F1: Your Model'], ['mixed', 'F1: Mixed Models'], ['svgp', 'F1: SVGP Classic']], get: () => settings.aiChassis, set: v => { settings.aiChassis = v; saveSettings(); }, desc: 'Which cars your opponents drive. <b>Same Class As You</b>: a mix of your class, each one tuned so it races as hard at your level as your own car would. <b>Same Car As You</b>: everyone in your model, so it comes down to the drivers.' },
    { label: 'Ghost Car', values: GHOST_VALS, get: () => settings.ghost, set: v => { settings.ghost = v; saveSettings(); if (sim && sim.setGhostMode) sim.setGhostMode(v); }, desc: GHOST_DESC },
    rulesItem(' Changes apply from the next race.'),
    mistakesItem(' Changes apply from the next race.'),
    { label: 'Speed Units', values: [['kmh', 'KM/H'], ['mph', 'MPH']], get: () => settings.units, set: v => { settings.units = v; applyVideo(); saveSettings(); }, desc: 'Speedometer units.' },
    { label: 'Dirty Air Indicator', values: [['on', 'On'], ['off', 'Off']], get: () => settings.dirtyAir, set: v => { settings.dirtyAir = v; applyVideo(); saveSettings(); },
      desc: 'Following close behind another car costs you downforce in the corners: your front end grips less and the car pushes wide. <b>DIRTY AIR</b> lights up above your speed when it\'s happening. Most noticeable in F1 and GT cars; road cars make almost no downforce to lose.' },
    { label: 'Backup', head: true },
    { label: 'Export Backup', action: () => exportBackup().then(n => toast(`Backup saved to your Downloads: ${n.keys} saves, ${n.assets} images.`)),
      get desc() { return `Everything in one file: tracks, liveries, careers, settings and your images. ${backup.online ? 'Your saves are also kept automatically in the game folder (saves/).' : ''}`; } },
    { label: 'Import Backup', confirm: 'Replace what\'s here with the file? Select again', action: () => importBackup().then(r => { if (!r) return; if (r.error) return toast(r.error); toast(`Restored ${r.keys} saves and ${r.assets} images. Reloading...`); setTimeout(() => location.reload(), 1600); }),
      desc: 'Load a backup file you exported. Anything in it replaces what the game has now.' },
    { label: 'Character Voices', head: true },
    { label: 'Voices', values: [['written', 'Written'], ['chatgpt', 'ChatGPT']], get: () => settings.voices, set: v => { settings.voices = v; saveSettings(); runVoices(); },
      get desc() { return `<b>Written</b>: the story as written. <b>ChatGPT</b>: on top of that, people react to what you actually do (Danny, your teammate, the rival owner, your ex), written by ChatGPT on your plan from the facts the game gives them. ${voiceLine()}`; } },
    { get label() { return voiceState.signedIn ? 'Sign Out Of ChatGPT' : 'Sign In With ChatGPT'; },
      action: () => voiceState.signedIn ? voiceSignOut().then(() => { toast('Signed out of ChatGPT.'); menus['s-options']?.[0]?.render(); })
        : voiceState.server === false ? toast('Character voices need the game\'s own server (the San Velocita GP app, or serve.py).')
        : voiceSignIn((ok) => { if (ok) { settings.voices = 'chatgpt'; saveSettings(); toast(`Signed in with ChatGPT${voiceState.email ? ` as <b>${voiceState.email}</b>` : ''}.`); runVoices(); } menus['s-options']?.[0]?.render(); }).then(ok => ok && toast('Sign in on the page that just opened, then come back.')),
      get desc() { return voiceState.signedIn ? `Signed in${voiceState.email ? ` as <b>${voiceState.email}</b>` : ''}${voiceState.model ? ` (${voiceState.model})` : ''}. Rewording counts against your ChatGPT plan's allowance; you can set a limit for this app in ChatGPT's settings.` : 'Opens OpenAI\'s sign-in page in your browser. Needs ChatGPT Plus or Pro. Your account stays on this computer (saves/llm/), never in the game\'s saves.'; } },
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
    { label: 'Brake Response', values: [['linear', 'Linear'], ['progressive', 'Progressive']], get: () => settings.brakeCurve, set: v => { settings.brakeCurve = v; applyPadFeel(); saveSettings(); },
      desc: 'How the brake trigger maps to the brakes. <b>Progressive</b>: the last part before the tires lock is spread over more of the trigger, so it\'s easier to brake hard without locking up with ABS off. A full pull is still full brake.' },
  ]],
  ['Wheel', [
    { get label() { return `Set Up Wheel<small>${settings.wheel ? settings.wheel.name : 'NOT SET UP'}</small>`; }, cls: 'action primary', action: () => openWheelSetup(),
      desc: 'Turn the wheel, press the pedals and the buttons you want, once. Then the wheel drives the car and works every menu. Do it again if you plug in a different wheel.' },
    { label: 'Use Wheel', values: [[true, 'ON'], [false, 'OFF']], get: () => !!settings.wheelOn, set: v => { settings.wheelOn = v; applyWheel(); saveSettings(); },
      desc: 'Off: the wheel is ignored and a pad or the keyboard drives.' },
    { label: 'Wheel Rotation', values: [270, 360, 540, 720, 900, 1080].map(v => [v, v + '\u00b0']), get: () => settings.wheelRot, set: v => { settings.wheelRot = v; applyWheel(); saveSettings(); },
      desc: 'How far the wheel itself turns, lock to lock. Set it to match the wheel\'s own control panel (Thrustmaster Control Panel or G HUB), or the steering won\'t line up.' },
    { label: 'Steering Lock', values: [180, 270, 360, 450, 540, 720, 900].map(v => [v, v + '\u00b0']), get: () => settings.wheelLock, set: v => { settings.wheelLock = v; applyWheel(); saveSettings(); },
      desc: 'How far you turn the wheel, lock to lock, for the car\'s full steering. <b>Lower</b> is quicker steering with less arm movement. 360\u00b0 suits most race cars, 540\u00b0 or more feels like a road car.' },
    { get label() { return `Force Feedback<small>${!ffb.on ? '' : ffb.live ? 'HELPER RUNNING' : 'HELPER NOT RUNNING'}</small>`; }, values: [['off', 'Off'], ['light', 'Light'], ['normal', 'Normal'], ['strong', 'Strong']], get: () => settings.ffb, set: v => { settings.ffb = v; applyWheel(); saveSettings(); },
      desc: 'Feel the car through the rim: it loads up through a corner, goes light when the front tires wash out, and kicks over curbs and in crashes. Needs the force feedback helper running on this computer: double-click <b>Start Wheel FFB.bat</b> (in the wheelffb folder) before you play.' },
    { label: 'Force Direction', values: [[1, 'Normal'], [-1, 'Reversed']], get: () => settings.ffbDir, set: v => { settings.ffbDir = v; saveSettings(); },
      desc: 'If the wheel pulls the wrong way (it should fight you as you turn in), reverse it. <b>Test Force Feedback</b> shows which way it goes.' },
    { label: 'Test Force Feedback', get disabled() { return !ffb.on; }, action: () => { ffbTestUntil = performance.now() + 1600; setTimeout(() => menus['s-options'][0].render(), 1700); },
      get desc() { return ffb.live ? 'The wheel should pull to the <b>left</b>, then to the <b>right</b>. If it goes right first, set Force Direction to Reversed.' : 'The helper isn\'t running. Double-click <b>Start Wheel FFB.bat</b> (in the wheelffb folder), wait for "Ready", then try again.'; } },
    { label: 'Forget Wheel', confirm: 'Forget it? Select again', get disabled() { return !settings.wheel; }, action: () => { settings.wheel = null; applyWheel(); saveSettings(); toast('Wheel setup cleared.'); menus['s-options'][0].render(); },
      desc: 'Clears the setup. The wheel then works like a plain controller until you set it up again.' },
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
    { label: 'Dirt & Dust', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => [v, v ? meter(v) : 'OFF']), get: () => settings.dirtFx ?? 5, set: v => { settings.dirtFx = v; applyVideo(); saveSettings(); },
      desc: 'How much dust and dirt the tires throw up on dirt tracks, gravel, grass and sand. <b>Lower</b> it if the dust makes the cars ahead hard to see. Tire smoke on tarmac stays as it is.' },
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
// ---------------- wheel setup (Options > Wheel) ----------------
const wheelSetup = new WheelSetup($('s-wheel'), () => { if (screen === 's-wheel') renderHints(); });
function openWheelSetup() {
  sfx.select();
  fadeTo(() => {
    wheelSetup.open((cfg) => {
      if (cfg) { settings.wheel = cfg; settings.wheelOn = true; applyWheel(); saveSettings(); toast(`<b>${cfg.name}</b> is set up.`); }
      sfx[cfg ? 'select' : 'back']();
      fadeTo(() => { menus['s-options'][0].render(); show('s-options'); }, 200);
    });
    show('s-wheel');
  }, 200);
}
// the keyboard or a pad here (the wheel is read raw by the setup): Enter skips a button or finishes, Esc / B cancels
function wheelInput() {
  if (pressed('Escape') | pressed('Backspace') | pressed('GP1')) { backs['s-wheel'](); return; }
  if (pressed('Enter') | pressed('Space') | pressed('GP0')) { if (wheelSetup.step === 'done') wheelSetup.finish(); else wheelSetup.skip(); }
}
backs['s-wheel'] = () => { if (wheelSetup.isOpen) wheelSetup.close(false); };
// a wheel plugged in that isn't set up: say where to set it up
window.addEventListener('gamepadconnected', (e) => {
  const id = e.gamepad && e.gamepad.id;
  if (looksLikeWheel(id) && !(settings.wheel && settings.wheel.id === id)) setTimeout(() => toast('Wheel found. Set it up in <b>Options &rsaquo; Wheel</b>.', 6000), 400);
});
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
const raceConditions = (t) => ({ time: settings.time === 'track' ? t.env.time : settings.time, weather: settings.weather === 'track' ? t.env.weather : settings.weather === 'changeable' ? 'overcast' : settings.weather });
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
// ---------------- tuning (js/tuning.js) ----------------
menus['s-tuning'] = [new Menu($('m-tuning'), [], { desc: 'd-tuning' })];
const tuning = new Tuning({ sub: $('tn-sub'), tabs: $('tn-tabs'), resp: $('tn-resp'), col: $('tn-col') }, menus['s-tuning'][0], { sfx, onChange: (st) => tuningStance(st) });
// the car behind the screen shows the setup being worked on (its ride height and camber), and what's saved once you leave
function tuningModel() { return tuningFrom === 's-garage' ? garage.car : tuningFrom === 's-pitgarage' ? pitGarage.car : sim && sim.player && sim.player.carId === tuning.id ? sim.player.model : null; }
function tuningStance(st) { const m = tuningModel(); if (m && tuning.id) setStance(m, stanceOf(st, tuning.id)); }
let tuningFrom = 's-garage';
function openTuning(from, id) {
  tuningFrom = from;
  // (at a circuit, the pit garage or the grid: a new setup is named after it)
  const track = from !== 's-garage' && sim && sim.track ? sim.track.name : null;
  fadeTo(() => { tuning.open(id, { mph: settings.units === 'mph', track }); tuningStance(tuning.st); show('s-tuning'); renderHints(); }, 160);
}
// looking round the car behind the screen (drag, wheel, right stick): the Garage turntable, the pit garage, the grid
function tuningLook(dy, dp, zoom = 1) {
  if (tuningFrom === 's-garage') { garage.auto = false; garage.yaw += dy; garage.pitch = Math.max(-0.05, Math.min(1.35, garage.pitch + dp)); garage.dist = Math.max(1.2, Math.min(18, garage.dist * zoom)); }
  else if (tuningFrom === 's-pitgarage') pitGarage.look(dy, dp, zoom);
  else if (sim && sim.showroomLook) sim.showroomLook(dy, dp, zoom);
}
{
  let drag = null; // (the Garage turntable takes its own drags and wheel: garage.js)
  canvas.addEventListener('pointerdown', (e) => { if (screen === 's-tuning' && tuningFrom !== 's-garage') drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointermove', (e) => { if (!drag || screen !== 's-tuning') return; tuningLook(-(e.clientX - drag.x) * 0.008, (e.clientY - drag.y) * 0.005); drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => { if (screen === 's-tuning' && tuningFrom !== 's-garage') tuningLook(0, 0, Math.pow(1.001, e.deltaY)); }, { passive: true });
}
tabbers['s-tuning'] = (d) => { sfx.move(); tuning.setTab(tuning.tab + d); };
backs['s-tuning'] = () => {
  if (!tuning.leave()) { sfx.move(); return; } // (unsaved changes: the first Esc says so)
  sfx.back(); const id = tuning.id; tuningStance(activeSetup(id)); tuning.close();
  fadeTo(() => {
    if (tuningFrom === 's-pitgarage') { pitGarage.look(null); if (sim && sim.player) { sim.applySetup(sim.player); renderGarageMenu(); } }
    if (tuningFrom === 's-garage') menus['s-garage'][0].render();
    if (tuningFrom === 's-carsel' && csel) renderCarSelect();
    show(tuningFrom); renderHints();
  }, 160);
};
menus['s-raceset'] = [
  new Menu($('m-setup'), [
    { label: 'Race', head: true },
    { label: 'Laps', values: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50].map(v => [v, String(v)]), get: () => raceCfg.laps, set: v => raceCfg.laps = v, desc: 'Race distance. Long races bring tyre wear and pit strategy into play.' },
    { label: 'Opponents', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(v => [v, String(v)]), get: () => raceCfg.opponents, set: v => raceCfg.opponents = v, desc: 'How many AI cars you race against.' },
    { label: 'Difficulty', values: [['easy', 'Rookie'], ['medium', 'Pro'], ['hard', 'Legend'], ['alien', 'Alien'], ['phantom', 'Phantom'], ['godlike', 'Godlike']], get: () => settings.difficulty, set: v => { settings.difficulty = v; saveSettings(); }, desc: 'How fast the AI is. <b>Rookie</b> to learn a circuit, <b>Legend</b> to match a clean lap at your best, <b>Alien</b> and up to be beaten. Above <b>Legend</b> the AI cars get extra grip and power, more at each level.' },
    { label: 'Weekend', values: WEEKEND_VALS, get: wkFmt, set: v => { settings.weekend = v; saveSettings(); syncGridItem(); }, desc: WEEKEND_DESC },
    { label: 'Practice', values: PRAC_VALS, get: wkPrac, set: v => { settings.pracLen = v; saveSettings(); }, desc: PRAC_DESC },
    { label: 'Qualifying', values: QUALI_VALS, get: wkQuali, set: v => { settings.qualiLen = v; saveSettings(); }, desc: QUALI_DESC },
    { label: 'Grid', values: GRID_VALS, get: () => wkFmt() !== 'race' ? 'quali' : settings.grid, set: v => { if (v !== 'quali') { settings.grid = v; saveSettings(); } }, desc: GRID_DESC },
    { label: 'Conditions', head: true },
    { label: 'Time', values: [['track', 'Track default'], ['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], get: () => settings.time, set: v => { settings.time = v; saveSettings(); conditionsChanged(); }, desc: 'Time of day. Track default uses what the circuit was designed with.' },
    { label: 'Weather', values: [['track', 'Track default'], ['clear', 'Clear'], ['overcast', 'Overcast'], ['rain', 'Rain'], ['changeable', 'Changeable'], ['fog', 'Fog']], get: () => settings.weather, set: v => { settings.weather = v; saveSettings(); conditionsChanged(); }, desc: 'Rain costs around 18% grip: brake earlier and use wet tyres.' },
    { label: 'Rules', head: true },
    { label: 'Team', values: teamVals, get: () => settings.team, set: v => { settings.team = v; saveSettings(); }, desc: 'Race in your own Garage livery or in one of the teams\' colours.' },
    presetItem(' Set each aid in Options > Aids.'),
    { label: 'Tyre Wear', values: [['off', 'Off'], ['normal', 'Normal'], ['fast', 'Fast (x2.5)']], get: () => settings.wear, set: v => { settings.wear = v; saveSettings(); }, desc: 'Tyres lose grip as they wear. Fast wear makes pit stops matter in short races.' },
    { label: 'Tire Temps', values: TEMPS_VALS, get: () => settings.temps, set: v => { settings.temps = v; saveSettings(); }, desc: TEMPS_DESC },
    { label: 'Damage', values: [['off', 'Off'], ['normal', 'Normal'], ['high', 'Realistic']], get: () => settings.damage, set: v => { settings.damage = v; saveSettings(); }, desc: 'Contact breaks wings and chassis, costing grip and speed until you pit. <b>Realistic</b>: a big enough hit tears a wheel off or breaks the suspension, and that car is out of the race (yours too).' },
    rulesItem(), mistakesItem(),
    { label: 'Start Tyre', values: [['auto', 'Auto'], ['soft', 'Soft'], ['medium', 'Medium'], ['hard', 'Hard'], ['wet', 'Wet'], ['dirt', 'Dirt']], get: () => settings.startTyre, set: v => { settings.startTyre = v; saveSettings(); }, desc: 'The compound you start on. Auto picks the best one for the conditions (dirt tyres on a dirt track).' },
    { label: 'Pit Wall Calls', values: [['on', 'On'], ['off', 'Off']], get: () => settings.pitWall || 'on', set: v => { settings.pitWall = v; saveSettings(); }, desc: 'Your engineer asks you on the radio when there\'s a call to make: undercut, cover, a cheap stop under the VSC, your teammate. Answer with <b>X / B</b> (or <b>1 / 2</b>); if you don\'t, their pick happens. Off: they make the pit calls and tell you.' },
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
  if (settings.weather !== 'track') t.env.weather = settings.weather === 'changeable' ? 'overcast' : settings.weather;
  // (changeable: overcast, and rain at some point in the race, or not: a shower, or for good)
  const wx = settings.weather === 'changeable' && Math.random() < 0.75 ? (() => { const at = 0.2 + Math.random() * 0.4; return { to: 'rain', at, until: Math.random() < 0.45 ? at + 0.2 + Math.random() * 0.15 : null }; })() : null;
  if (wx) t.env.wxChange = true;
  const race = { mode, laps: raceCfg.laps, opponents: raceCfg.opponents, pick: true, ...(wx ? { extra: { wx } } : {}) };
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
  const carry = w.ret === 'world' && wkUse && world && world.money ? { startSet: sessionSet(kind) } : {}; // (raceReturn isn't 'world' yet on the first session)
  const extra = { ...(w.race.extra || {}), ...(w.car ? { car: w.car } : {}), ...(w.roster ? { roster: w.roster, aiSetup: w.aiSetup } : {}), ...(w.rubber ? { rubber: w.rubber } : {}), ...(w.data ? { trackData: w.data } : {}), ...carry };
  startRace(w.track, { ...w.race, mode: kind, practiceTime: w.len[0], qualiTime: w.len[1], pick: first && w.race.pick, extra }, w.ret);
}
// the track data the run plan has gathered (race.tdata, practice.js): kept for the sessions after this one. A World
// Career keeps it for the week (a test day's counts on race weekend); in co-op each of you keeps your own.
function keepTrackData() {
  if (!sim || !sim.tdata) return;
  const d = JSON.parse(JSON.stringify(sim.tdata));
  if (weekend) weekend.data = d;
  if (world && (raceReturn === 'world' || raceReturn === 'testday')) { WC.weekOf(world).trackData = d; saveWorld(); }
  if (coop && raceReturn === 'coop') coop.tdata = { key: sim.track.name, d };
}
// what the next session keeps from this one
function keepWeekend() {
  const g = sim.qualiGrid();
  weekend.car = { ...sim.opts.car }; weekend.roster = g.roster; weekend.aiSetup = g.aiSetup;
  if (sim.rubber) weekend.rubber = sim.rubber.state(); // (the track as this session left it: rubber.js)
}
const SESSION_NAME = { practice: 'Practice', quali: 'Qualifying' };
function showQualiResults() {
  if (!sim || !sim.quali) return;
  useSession();
  if (!weekend) weekend = { track: cloneTrack(lastRace.track), race: { ...lastRace.cfg, mode: 'race' }, ret: lastRace.ret, format: 'quali', len: [1200, sim.quali.time], stage: 'quali' };
  if (pc.app === 'weekend') pc.close(); pitGarage.close();
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
    if (wkOn() && wkUse.carry) { WC.keepUsed(world, wkUse.carry); wkUse.carry = null; } // (the qualifying set comes off for the race)
    startRace(w.track, { ...w.race, mode: 'race', pick: false, fromQuali: true, extra: { ...(w.race.extra || {}), ...g, car: { ...sim.opts.car }, ...(sim.rubber ? { rubber: sim.rubber.state() } : {}), trackData: sim.tdata } }, w.ret);
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
// Tyres come from your stock (WC.stockOf / usedOf: ordered on the computer); a session starts on a set from it
// (qualifying: on the set practice ended on); run out and the trackside service sells you one at a premium, which goes
// on the bill with fuel (by the lap) and repairs. The garage's receipt shows each charge as it happens (pgReceipt).
let wkUse = null;
const wkOn = () => raceReturn === 'world' && wkUse && world && world.money;
const dmgOf = (d) => Math.min(1, (d.fw + d.rw + d.ch + (d.rad || 0) * 0.6 + (d.gb || 0) * 0.7 + (d.fl || 0) * 0.5) / 3); // (0..1: all three parts written off; a radiator on top, Realistic damage)
// a session is over: add up what it used (once per session)
function useSession() {
  if (!wkOn() || !sim || !sim.player || wkUse.seen === sim) return;
  const pl = sim.player; wkUse.seen = sim;
  try { logSessionTelemetry(pl); } catch (e) { console.warn('telemetry log', e); }
  wkUse.laps += pl.lapTimes.length;
  // the race's sets come out of stock now (the start, each stop); short, and it was the trackside service
  if (sim.mode === 'race') for (const c of pl.setsUsed || []) if (!WC.takeSet(world, c)) wkUse.trackside++;
  wkUse.carry = { c: pl.phys.tyre.c, wf: pl.phys.tyre.wf, wr: pl.phys.tyre.wr }; // (what the next session can start on)
  // (crashed out: a corner rebuilt, more if the wheel came off, on top of whatever else it broke)
  wkUse.damage += sim.mode === 'race' ? Math.max(dmgOf(pl.phys.dmg), (pl.maxDmg || 0) / 3, pl.wreck ? (pl.wreck.kind === 'wheel' ? 0.6 : 0.5) : 0) : dmgOf(pl.phys.dmg);
}
// the session's best lap, analysed against the reference, kept for the computer's Team app (the Data tab)
function logSessionTelemetry(pl) {
  const key = lapKey(sim.track, sim.T, pl.carId), mine = lapsFor(key).filter(l => l.valid && l.time > 0);
  const n = pl.lapTimes.length; if (!n || !mine.length) return;
  const lap = mine.slice(-Math.max(1, n)).reduce((b, l) => (!b || l.time < b.time ? l : b), null);
  const ref = sim.referenceTelemetry(pl.carId, lap.tyre || 'medium') || referenceLap(sim.T, pl.lineV || sim.lineV);
  const an = analyze(lap, ref, sim.T, sim.corners.list);
  if (sim.track) nameCorners(sim.track, sim.T, an.corners);
  const kind = sim.quali ? sim.quali.kind : 'race';
  WC.logTelemetry(world, { track: sim.track.name, kind, best: lap.time, ref: ref.time, top: an.top, laps: n, tyre: lap.tyre || '',
    corners: an.corners.map(c => ({ name: c.name || `Turn ${c.n}`, loss: +c.loss.toFixed(3), tip: (c.tips && c.tips[0]) || '' })).sort((a, b) => b.loss - a.loss).slice(0, 5) });
}
// spent so far this weekend (tyres, fuel, repairs; the session in progress included)
function wkSpend() {
  const c = WC.COSTS[world.player.series], pl = sim && sim.player, live = pl && wkUse.seen !== sim;
  const laps = wkUse.laps + (live ? pl.lapTimes.length : 0), dmg = wkUse.damage + (live ? dmgOf(pl.phys.dmg) : 0);
  return wkUse.trackside * WC.buyTrackside(world) + laps * c.fuelLap + WC.repairQuote(world, dmg);
}
// the set a session starts on: practice's set again (qualifying), else a new one from stock (wets if it's raining),
// else the best used one of that compound, else one from the trackside service
function sessionSet(kind) {
  if (kind === 'quali' && wkUse.carry) return wkUse.carry;
  if (wkUse.carry) { WC.keepUsed(world, wkUse.carry); wkUse.carry = null; }
  const c = weekend && weekend.track.env.surface === 'dirt' ? 'dirt' : weekend && weekend.track.env.weather === 'rain' ? 'wet' : 'soft';
  if (WC.takeSet(world, c)) return { c, wf: 1, wr: 1 };
  const u = WC.usedOf(world), k = u.findIndex(x => x.c === c);
  if (k >= 0) return u.splice(k, 1)[0];
  wkUse.trackside++; (wkUse.receipt = wkUse.receipt || []).push([`${capit(c)}s (trackside)`, WC.buyTrackside(world)]);
  return { c, wf: 1, wr: 1 };
}

// ---------------- the pit garage (practice / qualifying) ----------------
// your box: go out on a flying lap or down the pit lane, pick tyres, watch the timing, skip ahead. The session goes on.
const pitGarage = new PitGarage(renderer, post);
// the list on the garage wall (World Career): js/thelist.js draws it, the garage puts it up
const listPaper = new ListPaper(); listPaper.onDraw = () => pitGarage.refreshList(); pitGarage.setList(listPaper.canvas);
const opening = new Opening(renderer, post);
let pgView = 'main', pgInfoT = 0, pgTiming = false, pgSkipLbl = '', pgBusy = false, pgWorkKey = '';
const PG_TYRE_COL = { soft: '#e0302a', medium: '#f2d22a', hard: '#f0f0f0', wet: '#3a8af0', dirt: '#b8824a' };
const capit = (c) => c[0].toUpperCase() + c.slice(1);
const tyreDot = (c) => `<span class="tyre-dot" style="background:${PG_TYRE_COL[c]}"></span>`;
const mmss = (t) => { t = Math.round(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
// your tyres this weekend: the set on the car, used sets on the rack (what you took off, with their wear), new sets
// (World Career: each one goes on the bill). The rack lasts the weekend (World Career) or the session.
const rackOf = () => wkOn() ? WC.usedOf(world) : (sim.__rack = sim.__rack || []);
const pct = (t) => Math.round(Math.min(t.wf, t.wr) * 100);
// a set's wear, front and rear (the fronts usually go first)
const fr = (t) => `F ${Math.round(t.wf * 100)}% &middot; R ${Math.round(t.wr * 100)}%`;
function tyreItems() {
  const pl = sim.player, t = pl.phys.tyre, rack = rackOf(), world$ = wkOn(), st = world$ ? WC.stockOf(world) : null;
  const items = [{ label: `On The Car<small>${capit(t.c)} &middot; ${fr(t)}</small>`, head: true }];
  // rotate the set on the car: the fronts to the back and the rears to the front (worth it once the two are apart)
  const gap = Math.round(Math.abs(t.wf - t.wr) * 100);
  if (gap >= 2) items.push({ label: `Rotate Front To Back<small>F ${Math.round(t.wr * 100)}% &middot; R ${Math.round(t.wf * 100)}%</small>`,
    action: () => fitTyre({ c: t.c, wf: t.wr, wr: t.wf, rotate: true }),
    desc: `Swap the ${t.wf < t.wr ? 'worn fronts with the fresher rears' : 'worn rears with the fresher fronts'}: the front tires go to ${Math.round(t.wr * 100)}%, the rears to ${Math.round(t.wf * 100)}%. The fronts usually wear faster, so this evens the set out and makes it last. Free; the crew needs ${TYRE_FIT} seconds of the session.` });
  items.push({ label: world$ ? 'New Sets In Stock' : 'New Sets', head: true });
  for (const c of ['soft', 'medium', 'hard', 'wet', ...(sim && sim.dirt ? ['dirt'] : [])]) { // (dirt tyres: on a dirt track)
    const have = st ? st[c] || 0 : Infinity, buy = st && !have;
    items.push({ label: `${tyreDot(c)}${buy ? capit(c) : 'New ' + capit(c)}${st ? `<small>${buy ? 'trackside ' + WC.money$(WC.buyTrackside(world)) : have + ' left'}</small>` : ''}`,
      action: () => fitTyre({ c, wf: 1, wr: 1, fresh: true, buy }),
      desc: `${{ soft: 'Fastest over a lap, wears quickest.', medium: 'The middle ground.', hard: 'Slowest, lasts longest.', wet: 'For rain. Overheats in the dry.' }[c]} The crew needs ${TYRE_FIT} seconds of the session.${buy ? ` You have none: the trackside service sells you a set for <b>${WC.money$(WC.buyTrackside(world))}</b> (order ahead on the computer for less).` : st ? ` From your stock: ${have} left.` : ''}` });
  }
  if (rack.length) {
    items.push({ label: 'Used Sets', head: true });
    rack.forEach((r, k) => items.push({ label: `${tyreDot(r.c)}${capit(r.c)}<small>${fr(r)}</small>`, action: () => fitTyre(r, k), desc: `A set you ran earlier. Free to put back on${Math.abs(r.wf - r.wr) >= 0.02 ? ', and you can rotate it once it\'s on' : ''}.` }));
  }
  items.push({ label: 'Back', action: () => { pgView = 'main'; sfx.back(); renderGarageMenu(); renderHints(); }, desc: 'Back to the garage.' });
  return items;
}
// the crew fits a set now: a short progress bar, the session clock jumps on, the old set goes on the rack
function fitTyre(set, rackIdx = -1) {
  if (pgBusy) return;
  const pl = sim.player; pgBusy = true; sfx.select();
  const el = $('pg-work'), bar = $('pg-work-bar'), t0 = performance.now(), dur = 1300;
  $('pg-work-t').textContent = `${set.rotate ? 'Rotating the' : set.fresh ? 'New' : 'Used'} ${capit(set.c)}${set.rotate ? 's' : ''} · ${mmss(TYRE_FIT)}`; el.hidden = false; bar.style.width = '0%';
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    bar.style.width = (k * 100).toFixed(1) + '%';
    if (k < 1 && screen === 's-pitgarage') return requestAnimationFrame(tick);
    if (!sim || !sim.player) return;
    const rack = rackOf(), off = { c: pl.phys.tyre.c, wf: pl.phys.tyre.wf, wr: pl.phys.tyre.wr };
    if (rackIdx >= 0) rack.splice(rackIdx, 1);
    if (set.rotate) {} // (the same set, turned round: nothing comes off the car)
    else if (wkOn()) WC.keepUsed(world, off);
    else { if (pct(off) > 10) rack.push(off); rack.sort((a, b) => pct(b) - pct(a)); if (rack.length > 6) rack.length = 6; }
    sim.fitSet(pl, set);
    if (pitGarage.car && pitGarage.car.setCompound) pitGarage.car.setCompound(set.c);
    pitGarage.setTyre(set.c);
    if (set.fresh && wkOn()) {
      if (set.buy || !WC.takeSet(world, set.c)) { wkUse.trackside++; pgReceipt(`${capit(set.c)}s (trackside)`, WC.buyTrackside(world)); }
      else pgReceipt(`New ${set.c}s from stock`, 0);
      saveWorld();
    }
    el.hidden = true; pgBusy = false; sfx.go(); pgView = 'main';
    renderGarageMenu(); renderGarageInfo(); renderHints();
  };
  requestAnimationFrame(tick);
}
// World Career: each charge as it happens, and the weekend so far
function pgReceipt(what, amt) {
  if (!wkOn()) return;
  if (what) (wkUse.receipt = wkUse.receipt || []).push([what, amt]);
  const el = $('pg-receipt'), lines = (wkUse.receipt || []).slice(-4);
  el.hidden = pgDesk; // (at the desk it's on the computer: the Race Weekend app's Session)
  const st = WC.stockOf(world);
  el.innerHTML = `<div class="panel-title">THIS WEEKEND</div>` + lines.map(([w, a], k) => `<div class="pg-rline${what && k === lines.length - 1 ? ' fresh' : ''}"><span>${w}</span><b>${a ? WC.money$(a) : 'paid'}</b></div>`).join('')
    + `<div class="pg-rtot"><span>So far</span><b>${WC.money$(wkSpend())}</b></div><small>Fuel, repairs and trackside tyres go on this round's bill. In stock: ${['soft', 'medium', 'hard', 'wet'].map(c => `${st[c]} ${c}`).join(', ')}.</small>`;
}
function openPitGarage() {
  if (!sim || !sim.quali || !sim.player) return;
  const pl = sim.player;
  pgView = 'main'; pgBusy = false; $('pg-work').hidden = true;
  $('pg-receipt').hidden = true; if (wkOn()) pgReceipt();
  pitGarage.open(pl.model.cfg || sim.opts.car, pl.team, pl.phys.tyre.c, pl.phys.dmg);
  pitGarage.setPeople(raceReturn === 'world' && world ? mateInRoom(world) : []);
  pgTiming = false; $('pg-timing').hidden = true; $('pg-car').hidden = false;
  // (World Career: you start at the computer, the Race Weekend app open beside the menu)
  pgPcFocus = false; $('s-pitgarage').classList.remove('pc-focus');
  pgDesk = raceReturn === 'world' && !!world; if (pgDesk) { pitGarage.setDesk(true); $('pg-car').hidden = true; $('pg-receipt').hidden = true; }
  $('pg-title').textContent = SESSION_NAME[sim.quali.kind];
  $('pg-sub').textContent = `${sim.track.name} · your garage`;
  renderGarageMenu(); renderGarageInfo();
  show('s-pitgarage');
}
let pgDesk = false, pgPcT = 0, pgPcFocus = false;
// the controls to the computer (and back: B / Esc), at the desk
function pcFocus(on) {
  pgPcFocus = on && pc.isOpen; $('s-pitgarage').classList.toggle('pc-focus', pgPcFocus);
  if (!pgPcFocus && pc.isOpen && pc.app !== 'weekend') pc.goto('weekend');
  sfx[on ? 'select' : 'back'](); renderHints();
}
function pgPcInput() {
  const up = pressed('ArrowUp') | pressed('KeyW') | pressed('GP12') | pressed('GPSU'), down = pressed('ArrowDown') | pressed('KeyS') | pressed('GP13') | pressed('GPSD');
  const left = pressed('ArrowLeft') | pressed('KeyA') | pressed('GP14') | pressed('GPSL'), right = pressed('ArrowRight') | pressed('KeyD') | pressed('GP15') | pressed('GPSR');
  const ok = pressed('Enter') | pressed('Space') | pressed('GP0'), back = pressed('Escape') | pressed('Backspace') | pressed('GP1');
  const tabPrev = pressed('KeyQ') | pressed('GP4'), tabNext = pressed('Tab') | pressed('KeyE') | pressed('GP5');
  if (back || !pc.isOpen) return pcFocus(false);
  if (pc.input({ up, down, left, right, ok, back: false, tabPrev, tabNext }) === 'stand') pcFocus(false);
}
// the desk or the car (World Career)
function deskView(on) { pgDesk = on; if (!on) { if (pgPcFocus) pcFocus(false); pc.close(); } pitGarage.setDesk(on); $('pg-car').hidden = on || pgTiming; $('pg-timing').hidden = on || !pgTiming; if (on) $('pg-receipt').hidden = true; else if (wkOn()) pgReceipt(); sfx.select(); renderGarageMenu(); }
function renderGarageMenu() {
  const q = sim.quali, quick = raceReturn !== 'career' && raceReturn !== 'world';
  pgSkipLbl = q.left > 330 ? 'Skip 5 Minutes' : 'Skip To The End';
  if (pgView === 'tyres') { const m = menus['s-pitgarage'][0]; m.setItems(tyreItems(), false); m.i = m.items.findIndex(it => !it.head); m.render(); renderHints(); return; }
  if (pgView === 'repair') { const m = menus['s-pitgarage'][0]; m.setItems(repairItems(), false); m.i = m.items.findIndex(it => !it.head); m.render(); renderHints(); return; }
  if (pgView === 'plan') { const m = menus['s-pitgarage'][0], items = planItems(); m.setItems(items, false); m.i = Math.max(0, items.findIndex(it => it.on)); m.render(); renderHints(); return; }
  const t = sim.player.phys.tyre;
  const open = sim.T.open, runsLeft = open ? (q.runs || 1) - (q.used || 0) : 0;
  const items = [
    ...(open ? [{ label: `Start Run ${(q.used || 0) + 1}<small>OF ${q.runs || 1}</small>`, cls: 'action primary', action: () => goOut('run'),
        desc: `From the top: a standing start, timed from the line to the finish, then back up here. ${runsLeft === 1 ? '<b>Your last run.</b>' : `${runsLeft} runs left.`} ${q.kind === 'practice' ? 'Learn the road.' : 'Your best run sets your grid slot.'}` }]
      : [{ label: 'Flying Lap', cls: 'action primary', action: () => goOut('flying'), desc: 'Straight onto a flying lap: the clock starts at the line.' }]),
    ...(sim.pit && !open ? [{ label: 'Drive Out', cls: 'action', action: () => goOut('drive'), desc: 'Down the pit lane and an out lap first, to get the tyres going.' }] : []),
    ...(q.kind === 'practice' ? [{ label: `Run Plan<small>${sim.prog ? progById(sim.prog.id).name : 'Free Running'}</small>`, action: () => { pgView = 'plan'; sfx.select(); renderGarageMenu(); },
        desc: `What to do on track: free running, or a job from the engineer that gathers track data for the weekend. ${planSummary()}` }] : []),
    { label: `Tyres<small>${capit(t.c)} &middot; ${pct(t)}%</small>`, action: () => { pgView = 'tyres'; sfx.select(); renderGarageMenu(); }, desc: `Change tyres: a new set of any compound${wkOn() ? ` (${WC.money$(WC.tyreCost(world))} each)` : ''}, or one you ran earlier.` },
    repairItem(),
    { label: `Tuning<small>${activeName(sim.player.carId) || 'Standard'}</small>`, action: () => openTuning('s-pitgarage', sim.player.carId),
      desc: 'Wings, springs, anti-roll bars, brakes, the differential and the gearing, with what each change does. Applies from your next run.' },
    presetItem(' Applies from your next run.'),
    ...(pgDesk ? [{ label: 'Use The Computer', action: () => pcFocus(true), desc: 'Move around the Race Weekend app with the controller (or click it). <b>B / Esc</b> brings you back to this menu.' }] : []),
    ...(raceReturn === 'world' && world ? [pgDesk ? { label: 'Look At The Car', action: () => deskView(false), desc: 'Get up from the computer: the car, its damage and its tyres.' }
      : { label: 'Back To The Computer', action: () => deskView(true), desc: 'The Race Weekend app: timing, the weather and the forecast, your tyres, both cars, who to watch.' }] : []),
    ...(pgDesk ? [] : [{ label: 'Timing', action: () => { pgTiming = !pgTiming; $('pg-timing').hidden = !pgTiming; $('pg-car').hidden = pgTiming; renderGarageInfo(); }, desc: 'The full timing screen for the session (select again for the car).' }]),
    ...(typeof openLapReview === 'function' ? [{ label: 'Review Laps', action: () => openLapReview('s-pitgarage'), desc: 'Your laps against the reference: where the time went.' }] : []),
    ...(sim.net ? [] : [{ label: pgSkipLbl, action: () => { sim.skipTime(q.left > 330 ? 300 : q.left); sfx.select(); renderGarageMenu(); renderGarageInfo(); }, desc: 'Fast-forward the session clock. The AI keep setting times meanwhile.' }]),
    { label: 'Options', action: () => openOptions('s-pitgarage'), desc: 'Sound, camera, driving aids and the screen look.' },
    { label: 'End Session', confirm: 'End it? Select again', action: () => sim.qualiEnd(), desc: sim.net ? `You're done with ${SESSION_NAME[q.kind].toLowerCase()}: your best lap stands. The times come up once everyone's done.` : `Finish ${SESSION_NAME[q.kind].toLowerCase()} now. The AI still post their laps.` },
    ...(raceReturn === 'coop' ? [{ label: 'Leave Session', confirm: 'Leave? Select again', action: () => { pitGarage.close(); leaveOnline(); }, desc: 'Leave the career and go back to the main menu.' }] : []),
    ...(quick && raceReturn !== 'coop' ? [{ label: 'Quit', confirm: 'Quit? Select again', action: () => { weekend = null; pitGarage.close(); quitToMenu(); }, desc: 'Back to the main menu.' }] : []),
  ];
  const m = menus['s-pitgarage'][0]; m.setItems(items, true); m.render();
}
// the run plan (practice.js): free running or one of the engineer's jobs, each with how it's gone this weekend. Pick
// a job and it's on from your next lap (the menu goes back with Flying Lap / Start Run under the cursor)
const progStatus = (id) => {
  const a = sim && sim.tdata && sim.tdata[id]; if (!a || !a.best) return 'Not done yet';
  return `${a.done ? 'Done' : 'Best'} &middot; ${Math.round(a.best * 100)}%`;
};
function planSummary() {
  const a = sim.tdata.acclim;
  return a && a.marks && a.marks.length ? `Brake markers out so far: <b>${a.marks.length}</b>.` : '';
}
function planItems() {
  const cur = sim.prog ? sim.prog.id : null, pick = (id) => {
    sim.setProgramme(id); sfx.select(); pgView = 'main'; renderGarageMenu(); renderGarageInfo(); renderHints();
    const m = menus['s-pitgarage'][0]; m.i = 0; m.render(); // (back on Flying Lap / Start Run)
  };
  const items = [{ label: 'Run Plan', head: true },
    { label: `Free Running${cur ? '' : '<small>On</small>'}`, on: !cur, action: () => pick(null), desc: 'No job: drive as you like.' }];
  for (const P of PROGRAMMES) items.push({ label: `${P.name}<small>${cur === P.id ? 'On &middot; ' : ''}${progStatus(P.id)}</small>`, on: cur === P.id, action: () => pick(P.id),
    desc: P.desc + (P.id === 'acclim' && sim.tdata.acclim?.marks?.length ? ` You've marked <b>${sim.tdata.acclim.marks.length}</b> so far.` : '') });
  items.push({ label: 'Back', action: () => { pgView = 'main'; sfx.back(); renderGarageMenu(); renderHints(); }, desc: 'Back to the garage.' });
  return items;
}
// the repair row: how long the crew needs (it comes off the session clock)
// the repairs row: what all of it would take; select it for the list, part by part
function repairItem() {
  const w = sim.garageWork(sim.player), tot = Object.values(w).reduce((a, x) => a + x, 0), cost = wkOn() && tot ? WC.repairQuote(world, dmgOf(sim.player.phys.dmg)) : 0;
  return {
    label: tot ? `Repairs<small>${mmss(tot)}${cost ? ' &middot; ' + WC.money$(cost) : ''}</small>` : 'No Damage', disabled: !tot, action: () => { pgView = 'repair'; sfx.select(); renderGarageMenu(); renderHints(); },
    desc: tot ? 'Choose what the crew fixes: each part takes its own time off the session clock, and the AI keep setting times meanwhile.' : 'Nothing to fix.',
  };
}
// what's broken, part by part (each with the time it takes, and what it costs in World Career), and all of it
const PART_NAME = { fw: 'Front Wing', rw: 'Rear Wing', fl: 'Floor', ch: 'Suspension', rad: 'Radiator', gb: 'Gearbox' };
const PART_WHY = { fw: 'Front downforce back: the car turns in again.', rw: 'Rear downforce back: stable in fast corners.', fl: 'A new floor and diffuser: the downforce underneath back.', ch: 'The suspension straightened: no pull, the grip back at every corner.',
  rad: 'A new radiator: the engine runs cool again.', gb: 'The gearbox rebuilt: quick shifts and every gear back.' };
function repairItems() {
  const pl = sim.player, w = sim.garageWork(pl), q = sim.quali, d = pl.phys.dmg;
  const only = (k) => { const z = { fw: 0, rw: 0, ch: 0, rad: 0, gb: 0, fl: 0 }; z[k] = k === 'ch' ? Math.max(d.ch, ...pl.phys.bent) : d[k] || 0; return z; };
  const cost = (ks) => wkOn() ? WC.repairQuote(world, dmgOf(ks.reduce((z, k) => { const o = only(k); for (const x in o) z[x] += o[x]; return z; }, { fw: 0, rw: 0, ch: 0, rad: 0, gb: 0, fl: 0 }))) : 0;
  const keys = Object.keys(w).filter(k => w[k] > 0), all = keys.reduce((a, k) => a + w[k], 0);
  const items = [{ label: 'Repairs', head: true }];
  for (const k of keys) {
    const c = cost([k]);
    items.push({ label: `${PART_NAME[k]}<small>${mmss(w[k])}${c ? ' &middot; ' + WC.money$(c) : ''}</small>`, action: () => repairNow([k]),
      confirm: w[k] >= q.left ? 'Longer than the session! Select again' : null, desc: `${PART_WHY[k]} The session clock runs on ${mmss(w[k])}.${c ? ` It costs <b>${WC.money$(c)}</b>.` : ''}` });
  }
  if (keys.length > 1) { const c = cost(keys); items.push({ label: `Fix Everything<small>${mmss(all)}${c ? ' &middot; ' + WC.money$(c) : ''}</small>`, cls: 'action', action: () => repairNow(null),
    confirm: all >= q.left ? 'Longer than the session! Select again' : null, desc: `The crew fixes it all: ${mmss(all)} off the session clock.${c ? ` It costs <b>${WC.money$(c)}</b>.` : ''}` }); }
  items.push({ label: 'Back', action: () => { pgView = 'main'; sfx.back(); renderGarageMenu(); renderHints(); }, desc: 'Back to the garage.' });
  return items;
}
// the crew at work: a short progress bar, then the clock jumps on by the repair time
function repairNow(keys = null) {
  if (pgBusy) return;
  const w = sim.garageWork(sim.player), tot = (keys || Object.keys(w)).reduce((a, k) => a + (w[k] || 0), 0); if (!tot) return;
  pgBusy = true; sfx.select();
  const el = $('pg-work'), bar = $('pg-work-bar'), t0 = performance.now(), dur = 1800;
  $('pg-work-t').textContent = `Repairs · ${mmss(tot)}`; el.hidden = false; bar.style.width = '0%';
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    bar.style.width = (k * 100).toFixed(1) + '%';
    if (k < 1 && screen === 's-pitgarage') return requestAnimationFrame(tick);
    if (!sim || !sim.player) return;
    // (what's fixed is paid for: the parts chosen)
    const before = { ...sim.player.phys.dmg, ch: Math.max(sim.player.phys.dmg.ch, ...sim.player.phys.bent) };
    sim.garageRepair(sim.player, keys);
    if (wkOn()) { const after = sim.player.phys.dmg, fixed = {}; for (const k of ['fw', 'rw', 'fl', 'ch', 'rad', 'gb']) fixed[k] = Math.max(0, (before[k] || 0) - (after[k] || 0)); const dd = dmgOf(fixed); pgReceipt('Repairs', WC.repairQuote(world, dd)); wkUse.damage += dd; }
    pitGarage.setDamage(sim.player.phys.dmg);
    el.hidden = true; pgBusy = false; sfx.go();
    if (!Object.values(sim.garageWork(sim.player)).some(x => x > 0)) pgView = 'main';
    renderGarageMenu(); renderGarageInfo();
  };
  requestAnimationFrame(tick);
}
function renderGarageInfo() {
  const q = sim.quali, rows = sim.qualiRows(), me = rows.find(r => r.isPlayer);
  const late = q.left < 60;
  $('pg-clock').textContent = fmtTime(Math.ceil(q.left), 0); $('pg-clock').classList.toggle('late', late);
  const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  $('pg-card').innerHTML = `<div class="ti-grid">${cell('Position', `${me.pos}<small>/${rows.length}</small>`)}${cell(sim.T.open ? 'Best run' : 'Best lap', isFinite(me.best) ? fmtTime(me.best, 3) : '&mdash;')}${cell(q.kind === 'practice' ? 'Gap to fastest' : 'Gap to pole', me.pos === 1 || !isFinite(me.best) ? '&mdash;' : '+' + me.gap.toFixed(3))}${sim.T.open ? cell('Runs', `${q.used || 0}<small>/${q.runs || 1}</small>`) : cell('Laps', sim.player.lapTimes.length)}</div>`;
  if (pgTiming) $('pg-table').innerHTML = `<tr><th>POS</th><th>DRIVER</th><th class="r">BEST</th><th class="r">GAP</th></tr>` + rows.map(r =>
    `<tr class="${r.isPlayer ? 'me' : ''}"><td class="p">${posBadge(r.pos)}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.name}</td><td class="t">${isFinite(r.best) ? fmtTime(r.best, 3) : '&mdash;'}</td><td class="t">${r.pos === 1 || !isFinite(r.best) ? '' : '+' + r.gap.toFixed(3)}</td></tr>`).join('');
  pitGarage.setTiming(`${SESSION_NAME[q.kind].toUpperCase()} · ${fmtTime(Math.ceil(q.left), 0)}`, rows);
  // the car: each part, how bad, how long to fix; the tyres on it (and what goes on when you go out)
  if (!pgTiming) {
    const pl = sim.player, d = pl.phys.dmg, w = sim.garageWork(pl), t = pl.phys.tyre;
    const col = (x) => condCol(x / 0.72); // (the car's condition: green through amber to pink, as on the HUD)
    const part = (name, x, secs) => `<div class="pg-row"><span>${name}</span><i class="pg-bar"><b style="width:${Math.round((1 - x) * 100)}%;background:${col(x)};color:${col(x)}"></b></i><em>${secs ? mmss(secs) : 'OK'}</em></div>`;
    const wear = Math.min(t.wf, t.wr);
    const rack = rackOf(), next = rack.length ? `${rack.length} used set${rack.length === 1 ? '' : 's'} on the rack` : '';
    const real = pl.phys.engOn, key = [d.fw, d.rw, d.ch, d.rad || 0, d.gb || 0, d.fl || 0, wear, t.c, rack.length, wkOn() ? wkSpend() : 0, JSON.stringify(sim.tdata), sim.prog?.id].map(v => typeof v === 'number' ? v.toFixed(2) : v).join();
    if (key !== pgWorkKey) {
      pgWorkKey = key;
      const wc = condCol((1 - wear) / 0.7);
      $('pg-car').innerHTML = `<div class="panel-title">CAR</div>` + part('Front wing', d.fw, w.fw) + part('Rear wing', d.rw, w.rw) + part('Suspension', d.ch, w.ch)
        + (real ? part('Floor', d.fl || 0, w.fl) + part('Radiator', d.rad || 0, w.rad) + part('Gearbox', d.gb || 0, w.gb) : '') // (Realistic damage)
        + `<div class="pg-row"><span>${tyreDot(t.c)}${capit(t.c)} tyres</span><i class="pg-bar"><b style="width:${Math.round(wear * 100)}%;background:${wc};color:${wc}"></b></i><em>${Math.round(wear * 100)}%</em></div>`
        + (next ? `<p class="pg-note">${next}</p>` : '') + (q.kind === 'practice' ? planRows() : '');
      if (wkOn()) pgReceipt();
    }
  }
  if ((q.left > 330 ? 'Skip 5 Minutes' : 'Skip To The End') !== pgSkipLbl) renderGarageMenu();
}
// the garage's car panel, in practice: each job on the run plan and how far it's got (its best lap's rating, the line
// where it's done), and what it's paid out so far
function planRows() {
  const rows = PROGRAMMES.map(P => {
    const a = sim.tdata[P.id] || {}, b = a.best || 0, col = a.done ? 'var(--sv-good)' : 'var(--sv-cyan)';
    return `<div class="pg-row pg-plan${sim.prog?.id === P.id ? ' on' : ''}"><span>${P.short}</span><i class="pg-bar"><b style="width:${Math.round(b * 100)}%;background:${col};color:${col}"></b><u style="left:${ACCLIM_PASS * 100}%"></u></i><em>${b ? Math.round(b * 100) + '%' : '&mdash;'}</em></div>`;
  }).join('');
  const m = sim.tdata.acclim?.marks?.length || 0;
  return `<div class="panel-title pg-plan-title">RUN PLAN</div>${rows}${m ? `<p class="pg-note">${m} brake marker${m === 1 ? '' : 's'} out for the weekend</p>` : ''}`;
}
function goOut(how) {
  if (sim && sim.net && sim.net.goT == null) { sfx.error(); const wt = netWaiting().filter(n => n !== sim.player?.name); toast(`The clock starts when everyone's loaded${wt.length ? `: waiting for <b>${wt.join(', ')}</b>` : ''}.`); return; }
  sfx.go();
  if (pgBusy) return;
  if (pgPcFocus) pcFocus(false);
  fadeTo(() => { if (pc.app === 'weekend') pc.close(); pitGarage.close(); sim.leaveGarage(sim.player, how, null); beginHud(); }, 250);
}
menus['s-pitgarage'] = [new Menu($('m-pitgarage'), [], { desc: 'd-pitgarage' })];
backs['s-pitgarage'] = () => { if (pgView !== 'main' && !pgBusy) { pgView = 'main'; sfx.back(); renderGarageMenu(); renderHints(); } };
HINTS['s-pitgarage'] = () => pgPcFocus ? [['nav', 'Move'], ['ok', 'Select'], ['tab', 'Sections'], ['back', 'Menu']] : pgView === 'tyres' ? [['nav', 'Navigate'], ['ok', 'Fit'], ['back', 'Back']] : pgView === 'repair' ? [['nav', 'Navigate'], ['ok', 'Fix'], ['back', 'Back']] : pgView === 'plan' ? [['nav', 'Navigate'], ['ok', 'Choose'], ['back', 'Back']] : [['nav', 'Navigate'], ['lr', 'Change'], ['ok', 'Select'], ...(pgDesk && pc.isOpen ? [['tab', 'Computer']] : [])];

// ---------------- career / grand prix ----------------
let career = null;
const DIFF_LABEL = { easy: 'Rookie', medium: 'Pro', hard: 'Legend', alien: 'Alien', phantom: 'Phantom', godlike: 'Godlike' };
const newOpts = { rounds: 4, hard: false, dist: 15, pool: 'presets', gpPool: 'presets', gpDist: 15, gpDiff: 'medium', weekend: 'quali', prac: 1200, quali: 600, gpWeekend: 'quali', gpPrac: 1200, gpQuali: 600 };
const starsHtml = (n, max = 3) => Array.from({ length: Math.max(max, n) }, (_, i) => i < n ? '&#9733;' : '<span class="lost">&#9733;</span>').join('');
// race distance, like F1: every race runs the fewest laps that cover it, so a short circuit gets more of them
const DIST_VALS = [8, 15, 25, 40, 60, 100].map(v => [v, v + ' km']);
const DIST_DESC = 'Every race runs the fewest laps that cover this distance, like F1: a short circuit gets more laps than a long one. Point-to-point circuits are one run.';
const distLaps = (dist, T) => T.open ? 1 : WC.lapsForDistance(dist, T.L / 1000);
// a Challenge / Grand Prix round's laps (runs from before race distance have a set number)
const careerLaps = (c, t) => c.dist ? distLaps(c.dist, sampleTrack(t)) : c.laps;
// the career screen's side panel while Race Distance is highlighted: the chosen circuits and their laps at that distance,
// shortest lap first; the panel goes back to what it was when you move off
let careerSide = () => {};
const DIST_ROWS = 12;
function distInfo(dist, tracks) {
  const rows = tracks.map(t => { const T = (() => { try { return sampleTrack(t); } catch (e) { return null; } })(); return T && { name: t.name, km: T.L / 1000, shown: trackStats(T).length / 1000, open: T.open }; })
    .filter(Boolean).sort((a, b) => a.open - b.open || a.km - b.km);
  const row = (r) => `<div><span>${r.name}</span><span>${r.shown.toFixed(1)} km</span><b>${r.open ? '1 run' : `${distLaps(dist, { L: r.km * 1000 })} laps`}</b></div>`;
  $('career-info').innerHTML = `<h3>RACE DISTANCE</h3><p class="lead">${dist} km a race. Short circuits get more laps, long ones fewer.</p>
    <div class="dist-laps"><div class="panel-title">YOUR CIRCUITS</div>${rows.slice(0, DIST_ROWS).map(row).join('')}${rows.length > DIST_ROWS ? `<div class="more">and ${rows.length - DIST_ROWS} more</div>` : ''}</div>`;
}
const distItem = (o, key, tracks, extra = {}) => ({ label: 'Race Distance', values: DIST_VALS, get: () => o[key], set: v => { o[key] = v; distInfo(v, tracks()); },
  desc: DIST_DESC, dist: () => distInfo(o[key], tracks()), ...extra });
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
    careerSide = () => careerPick ? careerSummary(careerPick) : worldInfo(); careerSide();
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
    distItem(newOpts, 'dist', () => trackPool(newOpts.pool), { k: 'c' }),
    { label: 'Weekend', values: WEEKEND_VALS, get: () => newOpts.weekend, set: v => { newOpts.weekend = v; menus['s-career'][0].render(); }, k: 'c', desc: WEEKEND_DESC + ' <b>Race only</b>: the grid is in championship order.' },
    { label: 'Practice', values: PRAC_VALS, get: () => newOpts.prac, set: v => newOpts.prac = v, k: 'c', desc: PRAC_DESC, get disabled() { return newOpts.weekend !== 'full'; } },
    { label: 'Qualifying', values: QUALI_VALS, get: () => newOpts.quali, set: v => newOpts.quali = v, k: 'c', desc: QUALI_DESC, get disabled() { return newOpts.weekend === 'race'; } },
    { label: 'Circuits', values: [['presets', 'Presets'], ['all', 'Presets + Mine'], ['mine', 'My Circuits']], get: () => newOpts.pool, set: v => newOpts.pool = v, k: 'c', desc: 'Which circuits the season is drawn from. Mine are the ones saved in the Track Editor.' },
    { label: 'Start Career', cls: 'action primary', action: () => startNewCareer(), k: 'c', desc: 'Start a new career season.' + over(saved) },
  );
  else items.push(
    { label: 'New Grand Prix', head: true },
    { label: 'Circuits', values: [['presets', 'All Presets'], ['all', 'Presets + Mine'], ['mine', 'My Circuits']], get: () => newOpts.gpPool, set: v => newOpts.gpPool = v, k: 'gp', desc: 'One round on every circuit in the list.' },
    distItem(newOpts, 'gpDist', () => trackPool(newOpts.gpPool), { k: 'gp' }),
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
  careerSide = () => careerInfo(gp ? 'gp' : 'c'); careerSide();
  if (!switching) fadeTo(() => { if (!sim) startAttract(); show('s-career'); }, 200);
}
let careerTab = 0;
tabbers['s-career'] = (d) => { sfx.move(); careerTab = (careerTab + d + 3) % 3; openCareer(true); };
menus['s-career'] = [new Menu($('m-career'), [], { desc: 'd-career', onMove: (it) => it && it.dist ? it.dist() : careerSide() })];
backs['s-career'] = () => { sfx.back(); if (careerPick) { careerPick = null; openCareer(true); return; } fadeTo(() => show('s-main'), 200); };
const reservedTeam = () => (settings.team === 'garage' || settings.team === undefined ? 0 : +settings.team);
function withRoster(c) {
  const res = reservedTeam();
  const r = TEAMS.map((t, i) => i).filter(i => i !== res);
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  c.roster = r; c.nameToTeam = {};
  return c;
}
function startNewCareer() {
  career = withRoster(CAREER.newCareer({ rounds: newOpts.rounds, hard: newOpts.hard, dist: newOpts.dist, pool: trackPool(newOpts.pool) }));
  career.weekend = newOpts.weekend; career.pracLen = newOpts.prac; career.qualiLen = newOpts.quali;
  CAREER.saveRun(career);
  fadeTo(() => { renderPaddock(); show('s-paddock'); });
}
function startNewGP() {
  career = withRoster(CAREER.newGrandPrix({ tracks: trackPool(newOpts.gpPool), dist: newOpts.gpDist, difficulty: newOpts.gpDiff }));
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
    <div class="ti-grid three">${cell('Laps', careerLaps(c, t))}${cell('Opposition', DIFF_LABEL[diff])}${cell('Grid', careerFmt(c) !== 'race' ? 'Qualifying' : c.round === 0 ? 'Back' : 'Champ. order')}</div>
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
    mode: 'race', laps: careerLaps(c, track), opponents: 11, brief, pick: true,
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
let optSub = false;  // ... or Career Options
let gig = null;      // a gig being driven: { g, t, ref, comfort, dmg, lat, lon; rides: fun (0..100), sick (0..100), tIn/tLo/tHi (s), lapRides }
const worldOpts = { len: 6, difficulty: 'medium', dist: 15, weekend: 'quali', prac: 1200, quali: 600, pool: 'presets', tracks: null, name: '' };
// every circuit a career can use: the presets, yours, and the real ones
const allTracks = () => { const seen = new Set(); return [...presetTracks(), ...savedTracks(), ...realTracks()].filter(t => t && t.name && !seen.has(t.name) && seen.add(t.name)); };
// a career's circuits: the ones picked on the Circuits screen (opts.tracks), else the old preset/mine setting
const poolOf = (o) => { const l = o.tracks && o.tracks.length ? allTracks().filter(t => o.tracks.includes(t.name)) : []; return l.length ? l : trackPool(o.pool); };
const worldPool = () => poolOf(world ? world.opts : worldOpts);
// a World Career round's laps, from its circuit's length
const worldLaps = (w, R) => { const tr = findCalTrack(R.name), T = tr ? hubTrackT(tr) : null; return T ? WC.raceLaps(w, T.L / 1000, T.open) : w.opts.laps; };
// a calendar's circuit: from the career's pool, else any circuit the game knows (a calendar made from another pool, a
// circuit since renamed)
const findCalTrack = (name) => worldPool().find(t => t.name === name) || allTracks().find(t => t.name === name) || null;
// ... and for a round about to be driven: if it's gone altogether, the first preset stands in and the calendar says so
// (so the emails and the results name the circuit you actually raced)
function calTrack(R) {
  let base = findCalTrack(R.name);
  if (!base) { base = presetTracks()[0]; R.name = base.name; R.theme = base.env.theme; saveWorld(); }
  R.surface ??= base.env?.surface === 'dirt' ? 'dirt' : 'tarmac'; // (calendars from before it was kept: the tyres it needs)
  return base;
}
let coop = null; // (co-op World Career: see coopHost)
const saveWorld = () => { if (coop && !coop.host) return; if (world && !world.preview) WC.saveWorld(world); coopPush(); }; // (a preview career is never saved; a co-op friend's copy neither: the host's is sent to them)
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
  // talking (character voices on): Danny and your teammate always in the phone; what to say, by tone, or typed
  contacts: () => talkOn() ? WC.talkContacts(world) : [],
  talkItems: (name) => !talkOn() || !WC.talkWho(world, name) ? [] : [...TALK_INTENTS.filter(([k]) => device.kind === 'pad' || k !== 'straight').map(([intent, t]) => ({ k: 'say', intent, t })), ...(device.kind === 'pad' ? [] : [{ k: 'type', t: 'Type a message' }])],
  talk: (name, o) => talkTo(name, o),
  typeReply: (name) => openTalkBox(`Message ${name}`, (text) => { phone.talking = true; phone.pending = text; phone.scroll = 1e6; phone.dirty = true; talkTo(name, { text }); }),
});
// ---- talking to people (js/voice.js writes what they say; wcareer.js decides what it does) ----
const talkOn = () => !!world && settings.voices === 'chatgpt' && voiceState.signedIn && !!world.founding?.reg;
async function talkTo(name, o) {
  const w = world, who = WC.talkWho(w, name); if (!who) { phone.talked(); return; }
  const m = WC.mateOf(w), p = who === 'mate' && m ? w.people[m.pid] : null;
  const res = await converse({ who, name, traits: p ? WC.traitsOf(w, p).map(t => WC.TRAITS[t]?.name).filter(Boolean).join(', ') : '', facts: WC.talkFacts(w, who), history: WC.talkHistory(w, name), ...o });
  if (world !== w) return;
  if (res.error) { toast(voiceLine() || 'No reply. Try again in a bit.', 4000); phone.talked(); return; }
  WC.talkDone(w, name, res); saveWorld(); phone.talked(); sfx.buzz(); renderHubMenu();
}
// the typing box (keyboard): label, then send(text) on Enter; Esc puts it away
let talkSend = null;
function openTalkBox(label, send) {
  const el = $('talk-box'), inp = el.querySelector('input');
  el.querySelector('label').textContent = label; inp.value = ''; talkSend = send; el.hidden = false; setTimeout(() => inp.focus(), 30);
}
function closeTalkBox() { const el = $('talk-box'); el.hidden = true; talkSend = null; el.querySelector('input').blur(); }
$('talk-box').querySelector('input').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeTalkBox(); }
  if (e.key === 'Enter') { e.preventDefault(); const t = e.target.value.trim(), f = talkSend; closeTalkBox(); if (t && f) f(t); }
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
HINTS['s-hub'] = () => ending.isOpen ? { scene: [['back', 'Skip']], wire: [['ok', 'Continue']], record: [['nav', 'Choose'], ['ok', 'Select']] }[ending.stage] || [] : dayPlan.isOpen ? [['nav', 'Choose'], ...(dayPlan.onSubs ? [['lr', 'Ideas']] : []), ['ok', 'Do it'], ['back', 'Garage']] : tsw.isOpen ? [['lr', 'Choose'], ['ok', tsw.step === 'ready' ? 'Start the season' : 'Next'], ['back', tsw.at ? 'Back' : 'Garage']] : pcSeat ? [['nav', 'Move'], ['ok', 'Select'], ...(pc.hasTabs ? [['tab', 'Sections']] : []), ['back', pc.app ? 'Back' : 'Stand up']]
  : phone.isOpen ? phoneHints : hubMode === 'car' ? [['nav', 'Part'], ['ok', 'Select'], ['back', 'Back']]
  : hubMode === 'list' ? (listStep ? [['nav', 'Choose'], ['ok', 'Write it'], ['back', 'Garage']] : [['ok', 'Select'], ['back', 'Garage']]) : [['nav', 'Navigate'], ['ok', 'Select'], ['phone', 'Phone']];

// the computer on the desk: Mail, the news, the series' websites, the driver database (js/computer.js)
const pc = new Computer({
  world: () => world,
  // the Race Weekend app (the garage's computer during practice and qualifying)
  weekend: () => sim && sim.quali && sim.player && raceReturn === 'world' ? { kind: sim.quali.kind, left: sim.quali.left, rows: sim.qualiRows(), laps: sim.player.lapTimes.length,
    car: { c: sim.player.phys.tyre.c, wf: sim.player.phys.tyre.wf, wr: sim.player.phys.tyre.wr }, rack: rackOf().filter(r => r && r.c), spend: wkOn() ? wkSpend() : 0 } : null,
  // the press (character voices on): answer the Paddock Wire's reporter, and be quoted
  pressOn: (m) => talkOn() && WC.isPressMail(m),
  pressTones: () => TALK_INTENTS,
  // an investor's question: a pitch, or your own words (read by ChatGPT, with character voices on)
  pitches: () => WC.PITCHES,
  pitchType: () => talkOn(),
  pitch: async (m, o, done) => {
    const w = world; let res = { pitch: o.intent };
    if (o.text) {
      res = await pitchAnswer({ facts: WC.talkFacts(w, 'investor'), asked: (Array.isArray(m.body) ? m.body.join(' ') : m.body), ...o });
      if (world !== w) return;
      if (res.error) { toast(voiceLine() || 'It didn\'t send. Try again in a bit.', 4000); done(); return; }
    }
    const r = WC.pitchDone(w, m.id, res.pitch, res); saveWorld(); done();
    if (r && r.note) toast(r.note, 3500);
    renderHub();
  },
  press: async (m, o, done) => {
    const w = world;
    const res = await pressAnswer({ facts: WC.talkFacts(w, 'press'), asked: (Array.isArray(m.body) ? m.body.join(' ') : m.body), ...o });
    if (world !== w) return;
    if (res.error) { toast(voiceLine() || 'It didn\'t send. Try again in a bit.', 4000); done(); return; }
    const r = WC.pressDone(w, m.id, res); saveWorld(); done();
    if (r && r.note) toast(r.note, 3500);
    renderHub();
  },
  answer: (m, key) => {
    if (coopGuest()) return coopNotYours();
    // (Kev's engine map: which car it goes on, through the chooser, then the answer)
    if (m.tempt === 'grey' && key === 'yes' && !m.fitTo && WC.mateOf(world)) return fitPick({ title: 'Engine map (Kev)', from: 'Danny\'s mate Kev &middot; cash, no paperwork', price: m.price, bothPrice: m.price * 2, onPick: (to) => { m.fitTo = to; pc.src.answer(m, key); pc.render(); } });
    m.answer = key;
    if (m.lottery) { WC.claimLottery(world, key); sfx.best(); renderHub(); if (!WC.setupDone(world)) setTimeout(() => { if (pcSeat) pc.goto('setup'); }, 900); } // (then: setting up the team)
    if (m.sponsorOffer) { const r = WC.answerSponsor(world, m, key); updateLogoShown(); if (r === 'full') toast('You have no free sponsor slots.'); else if (r !== 'declined') { sfx.best(); if (screen === 's-hub') pitGarage.setCar(hubCar()); } }
    if (m.gig && key === 'in') {
      const r = WC.bookGig(world, m.gig);
      if (r === 'ok') { sfx.best(); toast('It\'s in your week: drive it from the day planner.', 3500); }
      else { if (r !== 'gone') m.answer = null; toast(r === 'nodays' ? 'Every day left this week is spoken for.' : r === 'nocar' ? 'You need a car for that.' : 'That was for another week.'); }
    }
    if (m.appear && key === 'go' && !WC.appear(world, m.appear)) { m.answer = null; toast('You have no days left this week.'); }
    if (m.event) { WC.rsvpEvent(world, m.event, key); if (key === 'yes') toast('It\'s in your week: plan the day it\'s on.', 3500); }
    if (m.worksOffer) { if (WC.answerWorks(world, key) === 'signed') { sfx.best(); renderHub(); } }
    if (m.invOffer) { if (WC.answerInvestor(world, key) === 'in') { sfx.best(); renderHub(); } }
    if (m.invOut) { const r = WC.answerBuyout(world, key); if (r && r.err) { m.answer = null; sfx.error(); toast(r.err); } else if (r && r.msg) { toast(r.msg, 4000); renderHub(); } }
    if (m.dayJob && key === 'go') { if (WC.takeDayJob(world, m)) { sfx.best(); toast('It\'s in your week: do it from the day planner.', 3500); } else { m.answer = null; toast('Every day left this week is spoken for.'); } }
    if (m.poach) { const r = WC.answerPoach(world, m, key); if (r === 'kept') sfx.best(); renderHub(); }
    // a gentleman driver's offer: they take the second seat (whoever's in it is let go)
    if (m.gent) { const r = WC.answerGent(world, m, key); if (r === 'signed') { sfx.best(); renderHub(); } else if (r === 'gone') toast('They have signed for someone else.'); else if (r !== 'declined') { m.answer = null; toast(r, 5000); } }
    // the director's stories and the temptations
    if (m.tempt || m.arc || m.inflate) {
      const r = WC.answerStory(world, m, key);
      if (r && r.err) { m.answer = null; sfx.error(); toast(r.err); }
      else if (r && r.msg) toast(r.msg);
      updateLogoShown(); if (screen === 's-hub') pitGarage.setCar(hubCar());
    }
    if (m.offer) {
      WC.answerOffer(world, key);
      const mate = world.people[world.teams[world.player.team].drivers.find(d => d !== 'P')];
      if (key === 'move' && mate) { WC.text(world, mate.first, pick([`Heard we're moving up! About time.`, `We're going up a series? Brilliant. I'll start packing.`])); phone.buzz(); }
    }
    saveWorld(); renderHubMenu(); sfx.select();
  },
  changed: () => { saveWorld(); renderHubMenu(); },
  logo: (what, sid) => { if (what === 'tocar') logoToCar(sid); else if (what === 'upload') uploadLogo(sid); },
  logoSrc: (sid) => { const d = WC.dealsOf(world).find(x => x.sid === sid); return d ? assets.get(logoOf(d)) : null; },
  logoOn: (sid) => !world.logoShown || world.logoShown.includes(sid),
  daysFree: () => coopGuest() ? WC.coopDaysLeft(world) : null, // (whose week GigGo books into)
  // GigGo: take a job, and go and drive it
  gig: (id) => {
    if (coopGuest()) { // (co-op: the co-owner's own job, a day of their week)
      if (WC.coopDaysLeft(world) <= 0) { sfx.error(); toast('Every day left this week is spoken for.'); return; }
      const g = WC.gigById(world, id); if (!g || !WC.coopGigTake(world, id)) { sfx.error(); toast('That job has gone.'); return; }
      sfx.best(); standUp(); setTimeout(() => { if (screen === 's-hub') startGig(g); }, 350); return;
    }
    const r = WC.bookGig(world, id);
    if (r !== 'ok') { sfx.error(); toast(r === 'nodays' ? 'Every day left this week is spoken for.' : 'That job has gone.'); return; }
    const g = WC.gigById(world, id); saveWorld(); sfx.best();
    standUp(); setTimeout(() => { if (screen === 's-hub') startGig(g); }, 350);
  },
  loan: () => { const r = WC.applyLoan(world); if (r.ok) sfx.best(); else { sfx.error(); toast(r.why); } saveWorld(); renderHub(); },
  sell: () => { const cash = WC.sellAnnuity(world); if (cash) { sfx.best(); saveWorld(); renderHub(); } },
  // Form SV-1 filed: the team takes its name and colours (and your livery starts in them)
  register: (f) => {
    WC.registerTeam(world, f);
    world.livery = { ...settings.car, main: f.colors[0], accent: f.colors[1], teamName: f.team };
    settings.driverName = f.name; saveSettings();
    sfx.best(); saveWorld(); renderHub(); phone.buzz();
  },
  // the Team app: facilities and projects
  team: (what, arg) => {
    // (a project: which car it's for, through the same chooser as the parts)
    if (what === 'proj') { const [how, key] = arg.split('|'), P = WC.projectList(world).find(x => x.key === key); if (!P) return; const c = how === 'shop' ? P.shopCost : P.cost;
      return fitPick({ title: P.name, from: `Development &middot; ${how === 'shop' ? 'at a shop' : 'your own bench'}`, price: c, bothPrice: Math.round(c * 1.6 / 50) * 50, onPick: (to) => { const r = WC.startProject(world, key, how, to); if (r.ok) sfx.best(); else { sfx.error(); toast(r.why, 4000); } saveWorld(); renderHub(); pc.render(); } }); }
    const r = what === 'build' ? WC.buildFacility(world, arg) : what === 'sellfac' ? WC.sellFacility(world, arg) : WC.startProject(world, arg.split('|')[1], arg.split('|')[0], arg.split('|')[2] || 'me');
    if (r.ok) { sfx.best(); if (what === 'sellfac') toast(`Sold for ${WC.money$(r.value)}.`); } else { sfx.error(); toast(r.why, 4000); }
    saveWorld(); renderHub();
  },
  // a customer racing car (GT up): buy, lease, or an ex-works one
  getcar: (how, id) => { if (WC.acquireCar(world, how, id)) { sfx.best(); updateLogoShown(); saveWorld(); pitGarage.showCar(true); pitGarage.setCar(hubCar()); renderHub(); } },
  buy: (id) => { if (WC.buyCar(world, id)) { sfx.best(); updateLogoShown(); saveWorld(); pitGarage.showCar(true); pitGarage.setCar(hubCar()); renderHub(); } },
  // the Workshop and the parts sites
  car: (what, arg) => {
    if (what === 'rebuild') WC.rebuildPart(world, arg);
    else if (what === 'newpart') WC.newPart(world, arg);
    else if (what === 'unfit') { const [k, i] = arg.split('|'); WC.removeFit(world, k, +i || 0); }
    else if (what === 'fitpart') { const part = [...WC.catalogue(world), ...(world.usedParts || [])].find(x => x.id === arg.split('|')[0]); if (part) return fitPick({ title: part.name, from: `${part.used ? `SVList, ${part.seller}` : 'Speed Parts Direct'} &middot; ${WC.PARTS[part.slot].name}`, price: part.price, bothPrice: part.used ? null : part.price * 2, onPick: (to) => { WC.buyFit(world, part, to); saveWorld(); renderHub(); pc.render(); } }); }
    sfx.select(); saveWorld(); renderHub();
  },
  // the Team app's Drivers tab: sign, lowball, extend, pay
  drivers: (what, arg) => {
    if (what === 'c2fix') { WC.setCar2Fix(world, arg); saveWorld(); return; }
    if (what === 'c2buy') { if (WC.buyCar2(world, arg)) sfx.best(); else sfx.error(); saveWorld(); renderHub(); return; }
    if (what === 'pay') WC.setMatePay(world, arg);
    else if (what === 'mextend') { WC.extendMate(world); sfx.best(); }
    else { const r = WC.offerDriver(world, arg, what === 'dlow'); if (!r.ok) { toast(r.why, 5000); sfx.back(); } else { sfx.best(); renderHub(); } }
    saveWorld(); renderHubMenu();
  },
  order: (o) => { const cost = WC.orderTyres(world, o); if (cost) { sfx.best(); saveWorld(); renderHub(); } },
  // the Team app and SVJobs: hire, let go, pay back, payroll instructions
  staff: (what, id, mode) => {
    if (what === 'hire') WC.hireStaff(world, id);
    else if (what === 'fire') WC.fireStaff(world, id);
    else if (what === 'backpay') WC.payBack(world, id);
    else if (what === 'pay') WC.setPay(world, id, mode);
    if (what !== 'pay') sfx.select();
    saveWorld(); renderHubMenu();
  },
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
// drivers' portraits (js/drivers.js): their World Career team's suit; the computer redraws once a few have landed
let photoT = 0;
setPeopleSource(() => world && world.people);
setPhotoContext({
  teamOf: (p) => (world && (p.id === 'P' ? world.teams[world.player.team] : p.team && world.teams[p.team])) || null,
  // you ({ id: 'P' }): in your own livery, with the face your character has at the races
  ownOf: (p) => { if (p.id !== 'P' || !world) return null; const L = worldCar(), id = 'P:' + (settings.driverName || 'You'); return { id, livery: L, face: L.face, key: JSON.stringify([L.main, L.accent, L.suit, L.face]) }; },
  changed: () => { clearTimeout(photoT); photoT = setTimeout(() => { if (pc.isOpen) pc.render(); }, 250); },
});
// your teammate, standing in the garage (at home, and in your box on a race weekend): in the team's suit, their own face
// (off for now: nobody stands in the career garage)
const MATE_IN_ROOM = false;
function mateInRoom(w) {
  if (!MATE_IN_ROOM) return [];
  const m = WC.mateOf(w), p = m && w.people[m.pid], t = w.teams[w.player.team]; if (!p || !t) return [];
  return [{ key: p.id + '|' + t.main + '|' + t.accent, livery: driverLivery(p.id, t), face: driverFace(p.id) }];
}
// (made ahead, while you're in the garage: everyone in your series, and anyone the Team Setup offers you)
function warmPortraits(w) {
  const ids = new Set([...(w.setup && !w.setup.done ? w.setup.drivers || (w.setup.seats || []).flatMap(d => d.pids) : []), ...Object.values(w.teams).filter(t => t.series === w.player.series).flatMap(t => t.drivers)]);
  for (const id of ids) if (id !== 'P' && w.people[id]) photoOf(w.people[id]);
}
// the Team Setup Wizard: game UI over the garage (js/teamsetup.js)
const tsw = new TeamSetup($('tsw'), {
  world: () => world,
  sfx: (k) => sfx[k] && sfx[k](),
  toast: (m) => toast(m, 4000),
  save: () => { saveWorld(); renderHints(); },
  photo: (ad) => pc.src.photo(ad), carInfo: (c) => pc.src.carInfo(c),
  logo: (sid) => assets.get(logoOf({ sid })),
  closed: () => { $('s-hub').classList.remove('wizard'); renderHub(); renderHints(); hubEnter(); maybeList(); },
  // the lights are out: buy it, sign it, and back to the garage
  apply: () => {
    const r = WC.setupApply(world);
    if (!r.ok) { sfx.error(); toast(r.why, 4000); return r; }
    updateLogoShown(); saveWorld(); pitGarage.setCar(hubCar());
    setTimeout(() => { $('s-hub').classList.remove('wizard'); renderHub(); renderHints(); hubEnter(); phone.buzz(); }, 350);
    return r;
  },
});
function openTeamSetup() {
  if (!world || WC.setupDone(world) || tsw.isOpen) return;
  phone.close(); phone.hide(); $('s-hub').classList.add('wizard'); sfx.select();
  tsw.open(); renderHints();
}
function tswInput() {
  if (!tsw.isOpen) return false;
  const up = pressed('ArrowUp') | pressed('KeyW') | pressed('GP12') | pressed('GPSU'), down = pressed('ArrowDown') | pressed('KeyS') | pressed('GP13') | pressed('GPSD');
  const left = pressed('ArrowLeft') | pressed('KeyA') | pressed('GP14') | pressed('GPSL'), right = pressed('ArrowRight') | pressed('KeyD') | pressed('GP15') | pressed('GPSR');
  const ok = pressed('Enter') | pressed('Space') | pressed('GP0') | pressed('GP9'), back = pressed('Escape') | pressed('Backspace') | pressed('GP1');
  const tabPrev = pressed('KeyQ') | pressed('GP4'), tabNext = pressed('Tab') | pressed('KeyE') | pressed('GP5');
  const was = tsw.isOpen && tsw.step;
  tsw.input({ left: left | up, right: right | down, ok, back, tabPrev, tabNext });
  if (!tsw.isOpen || was !== tsw.step) renderHints();
  return true;
}
function standUp() {
  if (!pcSeat) return;
  pc.close(); pitGarage.refreshScreen(); pitGarage.setView(hubMode === 'car' ? 'car' : 'room', hubMode === 'car' ? carPart : null);
  pcSeat = false; $('s-hub').classList.remove('seated'); sfx.back(); renderHub(); renderHints();
}
function pcInput() {
  if (fp) { fitPickInput(); return true; }
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
  if (ending.isOpen) ending.update(dt);
  if (pcSeat && pitGarage.seated && !pc.isOpen) {
    pc.open(); if (pcWant && pcWant[0]) pc.goto(pcWant[0], pcWant[1]); pcWant = null; renderHints();
  }
  if (pc.isOpen) { const r = pitGarage.screenRect(); if (r) pc.place(r); }
  if (pc.idleDirty) { pc.idleDirty = false; pitGarage.refreshScreen(); }
  // the neon tag over the monitor: there whenever you're standing in the room; lit up when the Computer item is
  // highlighted or the mouse is on the monitor; pulsing while there's unread mail
  carTags();
  const tag = $('pc-tag'), at = !pcSeat && hubMode === 'room' && pitGarage.atRoom && !phone.isOpen ? pitGarage.screenAnchor() : null;
  tag.hidden = !at;
  if (at) {
    const z = hubZoom(); tag.style.left = at.x / z + 'px'; tag.style.top = at.y / z + 'px';
    const m = menus['s-hub'][0], n = world ? WC.unreadMail(world) : 0;
    tag.classList.toggle('hot', pcHover || /^Computer/.test(m.items[m.i]?.label || ''));
    tag.classList.toggle('new', n > 0);
    const t = n ? `${n} NEW` : ''; if ($('pc-tag-n').textContent !== t) $('pc-tag-n').textContent = t;
  }
  // the bank's final notice on the desk: its own tag, always lit while it's there
  { const nt = $('notice-tag'), on = !!world && WC.bankNote(world)?.stage >= 2, na = on && !pcSeat && hubMode === 'room' && pitGarage.atRoom && !phone.isOpen ? pitGarage.noticeAnchor() : null;
    nt.hidden = !na; if (na) { const z = hubZoom(); nt.style.left = na.x / z + 'px'; nt.style.top = na.y / z + 'px'; } }
  // the list's tag: the same, over the sheet on the wall (pulsing when there's something to write or cross off)
  // (only when it wants you, or you're pointing at it: the sheet itself is always on the wall, and the computer's tag is
  // just below it)
  const lm = menus['s-hub'][0], lHot = listHover || /^The List/.test(lm.items[lm.i]?.label || ''), lNew = !!world && (WC.listWants(world) || WC.listFresh(world).length > 0);
  const lt = $('list-tag'), la = world && founded(world) && (lHot || lNew) && !pcSeat && hubMode === 'room' && pitGarage.atRoom && !phone.isOpen ? pitGarage.listAnchor() : null;
  lt.hidden = !la;
  if (la) {
    const z = hubZoom(); lt.style.left = la.x / z + 'px'; lt.style.top = la.y / z + 'px';
    lt.classList.toggle('hot', lHot); lt.classList.toggle('new', lNew);
  }
}
// the mouse over the monitor: a pointer, and the tag lights up
let pcHover = false, listHover = false;
$('s-hub').addEventListener('mousemove', (e) => {
  const li = onList(e); if (li !== listHover) listHover = li;
  const on = !li && !!onRoom(e), car = !li && !on && hubMode === 'room' && world && world.car && !pcSeat && !phone.isOpen && !tsw.isOpen && !dayPlan.isOpen && !e.target.closest('.panel, .footer-hints, .desc-bar, .scr-head') && pitGarage.hitCar(e.clientX, e.clientY);
  pcHover = on; carHover = car;
  const cur = on || car || li ? 'pointer' : ''; if ($('s-hub').style.cursor !== cur) $('s-hub').style.cursor = cur;
});
$('pc-tag').addEventListener('click', () => { if (screen === 's-hub' && !pcSeat) sitDown(); });
// a click on the monitor sits you down (the hub's layer is over the 3D view, so it listens there, past its panels)
const onRoom = (e) => screen === 's-hub' && world && !pcSeat && !phone.isOpen && !tsw.isOpen && !dayPlan.isOpen && !e.target.closest('.panel, .footer-hints, .desc-bar, .scr-head, .pc-tag') && pitGarage.hitScreen(e.clientX, e.clientY);
// the list on the wall: a click on it walks you over
const onList = (e) => screen === 's-hub' && world && founded(world) && hubMode === 'room' && !pcSeat && !phone.isOpen && !tsw.isOpen && !dayPlan.isOpen && !e.target.closest('.panel, .footer-hints, .desc-bar, .scr-head, .pc-tag') && pitGarage.hitList(e.clientX, e.clientY);
$('list-tag').addEventListener('click', () => { if (screen === 's-hub' && !pcSeat) goToList(); });
// the final notice: a click on it (or its tag) opens it at the computer
const readNotice = () => { const b = world && WC.bankNote(world); if (b && b.notice) sitDown('mail', b.notice); };
$('notice-tag').addEventListener('click', () => { if (screen === 's-hub' && !pcSeat) readNotice(); });
$('s-hub').addEventListener('click', (e) => {
  if (screen === 's-hub' && world && hubMode === 'room' && !pcSeat && !phone.isOpen && !tsw.isOpen && !dayPlan.isOpen && !e.target.closest('.panel, .footer-hints, .desc-bar, .scr-head, .pc-tag') && pitGarage.hitNotice(e.clientX, e.clientY)) { readNotice(); return; }
  if (onList(e)) { goToList(); return; }
  if (onRoom(e)) { sitDown(); return; }
  if (screen === 's-hub' && world && world.car && !pcSeat && !phone.isOpen && !tsw.isOpen && !dayPlan.isOpen && hubMode === 'room' && !e.target.closest('.panel, .footer-hints, .desc-bar, .scr-head, .pc-tag') && pitGarage.hitCar(e.clientX, e.clientY)) goToCar();
});
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---- new career (Career screen, World Career tab) ----
let careerPick = null; // the saved career whose page is open (Continue / Delete), or null for the list
function worldItems(saves) {
  const items = [], pick = careerPick && saves.find(e => e.id === careerPick);
  if (pick) {
    items.push({ label: pick.team, head: true },
      { label: pick.ended ? 'The Record' : 'Continue', cls: 'action primary', action: () => { const w = WC.loadWorld(pick.id); if (w) { WC.syncStreetCars(w, streetCarList()); careerPick = null; world = w; openHub(); } }, desc: pick.ended ? `How ${pick.team} went, and how it ended.` : 'Back to your garage.' },
      { label: 'Delete Career', confirm: `Delete ${pick.team} for good? Select again`, action: () => { WC.deleteWorld(pick.id); careerPick = null; sfx.back(); toast(`${pick.team} has been deleted.`); openCareer(true); },
        desc: `Deletes ${pick.team}: the team, the money, the history. It can't be undone.` },
      { label: 'Back', action: () => { careerPick = null; sfx.back(); openCareer(true); }, desc: 'Your other careers, or a new one.' });
    return items;
  }
  if (saves.length) items.push({ label: 'Your Careers', head: true });
  for (const e of saves.slice(0, 6)) items.push({ label: `${e.team}<small>${e.ended ? `FOLDED ${e.ended}` : `${e.year} · ${e.over ? 'SEASON OVER' : 'RND ' + (e.round + 1) + '/' + e.len}`}</small>`, cls: 'cont',
    desc: `${e.name}, ${seriesName(e.series)}. Select to continue it or delete it.`, action: () => { careerPick = e.id; sfx.select(); openCareer(true); } });
  const n = poolOf(worldOpts).length;
  items.push(
    { label: 'New Career', head: true },
    { label: 'Season Length', values: WC.SEASON_LENGTHS.map(n => [n, n + ' rounds']), get: () => worldOpts.len, set: v => worldOpts.len = v, desc: 'Rounds in every season, in every series.' },
    { label: 'Difficulty', values: Object.entries(DIFF_LABEL), get: () => worldOpts.difficulty, set: v => worldOpts.difficulty = v, desc: 'The pace of the field. Higher series have better drivers on top of this, so it gets harder as you climb. Pick one you can\'t win at yet: upgrades and a better car are how you catch them. Above <b>Legend</b> the AI cars get extra grip and power.' },
    distItem(worldOpts, 'dist', () => poolOf(worldOpts)),
    { label: 'Weekend', values: WEEKEND_VALS, get: () => worldOpts.weekend, set: v => { worldOpts.weekend = v; menus['s-career'][0].render(); }, desc: WEEKEND_DESC + ' <b>Race only</b>: the grid is in championship order.' },
    { label: 'Practice', values: PRAC_VALS, get: () => worldOpts.prac, set: v => worldOpts.prac = v, desc: PRAC_DESC, get disabled() { return worldOpts.weekend !== 'full'; } },
    { label: 'Qualifying', values: QUALI_VALS, get: () => worldOpts.quali, set: v => worldOpts.quali = v, desc: QUALI_DESC, get disabled() { return worldOpts.weekend === 'race'; } },
    { label: `Circuits<small>${n} CHOSEN</small>`, action: () => openTrackPick(worldOpts, 's-career', () => openCareer(true)), desc: `The circuits your calendars are drawn from: ${n} chosen. You can change them again before each season.` },
    { label: 'Start Career', cls: 'action primary', action: () => startWorld(), desc: 'Your name, your team and your first car are set up on the computer in your garage.' },
  );
  return items;
}
// a saved career's page: where it's at
function careerSummary(id) {
  const w = WC.loadWorld(id), el = $('career-info'); if (!w) return worldInfo();
  const sid = w.player.series, st = WC.seriesStandings(w, sid), cp = st.findIndex(e => e.pid === 'P') + 1, raced = w.series[sid].results.length > 0;
  const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`, e = WC.listWorlds().find(x => x.id === id);
  el.innerHTML = `<h3>${w.teams[w.player.team].name.toUpperCase()}</h3><p class="lead">${w.player.name}, owner-driver. ${seriesName(sid)}, ${w.year} season, ${w.over ? 'season over' : `round ${w.round + 1} of ${w.opts.len}`}.</p>
    <div class="ti-grid three cs-cells">${cell('Championship', raced && cp ? ord(cp) : '&mdash;')}${cell('Bank', w.money && w.money.choice ? WC.money$(w.money.balance) : '&mdash;')}${cell('Seasons', w.player.hist.length + (w.over ? 0 : 1))}</div>
    <p class="lead small">${w.car ? `${w.car.year} ${w.car.name}. ` : 'No car yet. '}${DIFF_LABEL[w.opts.difficulty] || ''} difficulty, ${w.opts.len}-round seasons, ${poolOf(w.opts).length} circuits.${e && e.saved ? ` Last played ${new Date(e.saved).toLocaleDateString()}.` : ''}</p>`;
}
function worldInfo() {
  const el = $('career-info');
  const feat = (ico, t, d) => `<div class="feat"><i>${ico}</i><div><b>${t}</b><span>${d}</span></div></div>`;
  el.innerHTML = `<h3>WORLD CAREER</h3><p class="lead">You won the lottery, got divorced, and decided to start a racing team. Run it from your garage for as long as the money lasts, and then some.</p>
    ${feat('&#9873;', 'Three series', 'Street Cup, GT Championship and Formula SV. Finish in the top three to be offered a step up, if you can afford it.')}
    ${feat('&#36;', 'Every lap costs', 'Entry, travel, the crew, tyres, fuel and repairs. Prize money comes back. The bank is watching.')}
    ${feat('&#9636;', 'The computer', 'Email, the news, the classifieds, the bank. Most of the story happens on a screen in your garage.')}`;
}
// the street cars for the classifieds (a loaded career is brought up to date: WC.syncStreetCars)
const streetCarList = () => carsInClass('street').map(id => ({ key: chassisKey(id), name: CARS[id].name, value: Math.round(12000 + CARS[id].spec.power * 0.11) }));
function startWorld(noOpening = false) {
  const name = settings.driverName || 'Driver';
  const streetCars = streetCarList();
  world = WC.newWorld({ name, len: worldOpts.len, difficulty: worldOpts.difficulty, dist: worldOpts.dist, weekend: worldOpts.weekend, pracLen: worldOpts.prac, qualiLen: worldOpts.quali, pool: worldOpts.pool,
    teamName: `${name.split(' ').pop()} Racing`, colors: [settings.car.main, settings.car.accent], seed: Date.now(), streetCars }, poolOf(worldOpts)); // (this career's choice, not the last one loaded)
  world.opts.tracks = worldOpts.tracks ? worldOpts.tracks.slice() : null;
  saveWorld();
  if (noOpening) fadeTo(openingDone, 200); else openOpening(openingDone); // (the opening first: the lottery, then the garage)
}
// after the opening (or skipping it): the lottery choice and Form SV-1, then the garage and the setup
function openingDone(r) {
  if (r && r.lottery) WC.pickLottery(world, r.lottery);
  // (Form SV-1 was filed at the registry desk: as if on the computer; then the wizard comes in, not the computer)
  if (r && r.reg) {
    const f = r.reg; WC.registerTeam(world, f);
    world.livery = { ...settings.car, main: f.colors[0], accent: f.colors[1], teamName: f.team };
    settings.driverName = f.name; saveSettings(); saveWorld();
    enterHub(); setTimeout(() => { if (screen === 's-hub') openTeamSetup(); }, 900);
    return;
  }
  saveWorld(); enterHub(); const m = world.mail.find(x => x.link && x.link[0] === 'registry'); setTimeout(() => { if (screen === 's-hub') sitDown('mail', m && m.id); }, 700);
}
// after an ending: the same you, in the same world, from the lottery (again)
function startAgain() {
  const w = world; if (!w || !w.ended) return;
  WC.restartWorld(w, poolOf(w.opts)); WC.setCarCatalog(w, carCatalog()); saveWorld();
  $('s-hub').classList.remove('ending-on'); pitGarage.close();
  openOpening(openingDone, { again: true, ex: w.backstory?.ex });
}

// ---- the ending, from the main menu: a made-up career that goes broke (never saved), straight to its end ----
let endPreviewWas = null;
function openEndingPreview() {
  const name = settings.driverName || 'Driver';
  const streetCars = streetCarList();
  endPreviewWas = world;
  const w = WC.newWorld({ name, len: 6, difficulty: worldOpts.difficulty, dist: 15, weekend: 'race', pool: worldOpts.pool, teamName: `${name.split(' ').pop()} Racing`, colors: [settings.car.main, settings.car.accent], seed: Date.now(), streetCars }, poolOf(worldOpts));
  w.preview = true;
  WC.registerTeam(w, { name, team: `${name.split(' ').pop()} Racing`, colors: [settings.car.main, settings.car.accent], home: Object.keys(WC.TOWNS)[0], background: Object.keys(WC.BACKGROUNDS)[0], ex: 'Jo', years: 7 });
  WC.claimLottery(w, 'lump');
  WC.setupPick(w, 'entry', 'takeover'); WC.setupPick(w, 'sponsor', 0); WC.setupPick(w, 'mate', w.setup.drivers[0]); WC.setupApply(w);
  w.livery = { ...settings.car }; w.liveryDone = true;
  WC.setWhy(w, 'prove'); WC.setAmbition(w, WC.ambitionChoices(w)[1].t);
  // a couple of rounds, then the money's gone and the bank does the rest
  w.simSkill = 0.45;
  for (let i = 0; i < 2; i++) { WC.weekOf(w); if (w.staff) WC.runPayroll(w); WC.simPlayerRound(w); }
  w.money.balance = -60000;
  for (let i = 0; i < 6 && !w.ended; i++) { WC.weekOf(w); WC.simPlayerRound(w); }
  WC.listSeen(w);
  world = w; WC.setCarCatalog(w, carCatalog());
  fadeTo(() => enterHub(), 200);
}
// (the preview's over: back to whatever career was loaded before)
const endPreviewDone = () => { if (world && world.preview) { world = endPreviewWas; endPreviewWas = null; } };

// ---- the drive home (js/drivehome.js): the opening's road from the 6twelve to the trailer park, at night ----
// In 'test' mode (no lights, no timing), the HUD hidden; past the end of the road, back to the opening (the trailer).
// Your own car if the career has one; otherwise an old Pony GT.
let drive = null;
function startDriveHome(back) {
  const plain = CARS.mustang ? 'mustang' : carsOfClass('street')[0]; // (a Pony GT, not something with a wing)
  const car = world && world.car ? worldCar() : { ...settings.car, chassis: chassisKey(plain) };
  drive = { back, parked: false, done: false };
  startRace(driveHomeTrack(), { mode: 'test', pick: false, extra: { car, ghost: 'off', strategy: false, racingLine: 'off' } }, 'drivehome');
  document.body.classList.add('drive-on');
}
function driveTick() {
  if (!drive || !sim || !sim.T || !sim.player) return;
  const T = sim.T, p = sim.player;
  if (!drive.parked && sim.scene && sim.world) { // (the trailer park, beside the end of the road)
    drive.parked = true;
    trailerModel().then(m => {
      if (!m || !sim || raceReturn !== 'drivehome') return;
      // (just the homes and fences: the model's own ground and painted backdrops would run across the road)
      m.traverse(o => { if (/^(Terrain|Background|cable)/.test(o.name)) o.visible = false; });
      const i = Math.min(T.cut, T.finish + Math.round(PARK.along / T.ds)), x = T.X[i] + T.RX[i] * PARK.right, z = T.Z[i] + T.RZ[i] * PARK.right;
      m.position.set(x, sim.world.groundHeight(x, z) - 0.45, z); m.rotation.y = Math.atan2(T.FX[i], T.FZ[i]) - Math.PI / 2;
      sim.scene.add(m);
    });
    setTimeout(() => hud.help('Drive home. Follow the road out of town.', 6000), 1500);
  }
  if (!drive.done && p.idx >= T.finish && p.idx <= T.cut) finishDrive();
}
function finishDrive() {
  if (!drive || drive.done) return;
  drive.done = true; const back = drive.back;
  fadeTo(() => { disposeSim(); document.body.classList.remove('drive-on'); drive = null; raceReturn = null; show('s-opening'); if (back) back(); }, 500);
}

// ---- Circuits: which circuits a career's calendars use (a grid of cards; select toggles one) ----
// o: the options holding the choice (worldOpts for a new career, world.opts for this one); back: the screen to return
// to; done: called after (a career already running gets new calendars from it, if it's before its first race)
let tkCtx = null;
const tkThumbs = new Map();
function tkThumb(t) {
  if (!tkThumbs.has(t.name)) { const cv = document.createElement('canvas'); cv.width = 240; cv.height = 150; try { drawTrackMap(sampleTrack(t), cv); } catch (e) {} tkThumbs.set(t.name, cv.toDataURL()); }
  return tkThumbs.get(t.name);
}
const tkKind = (t) => savedTracks().some(x => x.name === t.name) ? 'Yours' : presetTracks().some(x => x.name === t.name) ? 'Preset' : 'Real';
function openTrackPick(o, back, done) {
  if (!o.tracks || !o.tracks.length) o.tracks = poolOf(o).map(t => t.name);
  tkCtx = { o, back, done };
  renderTrackPick(true);
  fadeTo(() => show('s-circuits'), 180);
}
function renderTrackPick(first = false) {
  const { o } = tkCtx, all = allTracks(), on = new Set(o.tracks), mine = savedTracks().length, len = o.len || worldOpts.len;
  const set = (names) => { o.tracks = names.slice(); sfx.select(); renderTrackPick(); };
  const chip = (label, desc, fn, extra = {}) => ({ label, cls: 'tk-chip', desc, action: fn, ...extra });
  const items = [
    chip('Done', 'Back, with these circuits.', () => closeTrackPick(), { cls: 'tk-chip primary' }),
    chip('All', 'Every circuit the game has: the presets, yours and the real ones.', () => set(all.map(t => t.name))),
    chip('Presets', 'Only the circuits that come with the game.', () => set(presetTracks().map(t => t.name))),
    chip('Yours', mine ? 'Only the circuits you\'ve made in the editor.' : 'You haven\'t made any circuits yet (Track Editor, from the main menu).', () => set(savedTracks().map(t => t.name)), { disabled: !mine }),
    ...all.map(t => {
      const T = (() => { try { return sampleTrack(t); } catch (e) { return null; } })(), km = T ? (trackStats(T).length / 1000).toFixed(1) : '?', sel = on.has(t.name);
      return { label: `<img src="${tkThumb(t)}" alt=""><b>${t.name}</b><span>${THEMES[t.env?.theme]?.label || ''} &middot; ${km} km${t.open ? ' &middot; point to point' : T && o.dist ? ` &middot; ${distLaps(o.dist, T)} laps` : ''}</span><em>${tkKind(t)}</em><i>${sel ? 'In' : 'Out'}</i>`,
        cls: 'tk-card' + (sel ? ' on' : ''), name: t.name,
        desc: `<span class="dh">${t.name}</span>${((t.desc || '').replace(/^[^·]*·\s*/, '') || 'A circuit').replace(/\.?$/, '.')} ${sel ? 'In your calendars: select to leave it out.' : 'Not in your calendars: select to add it.'}`,
        action: () => {
          if (sel && o.tracks.length <= 1) { sfx.error(); toast('A season needs at least one circuit.'); return; }
          o.tracks = sel ? o.tracks.filter(n => n !== t.name) : [...o.tracks, t.name]; sfx.select(); renderTrackPick();
        } };
    }),
  ];
  const m = menus['s-circuits'][0], keep = m.items[m.i]?.name || m.items[m.i]?.label;
  m.setItems(items, true);
  if (first) m.i = 0; else { const k = items.findIndex(it => (it.name || it.label) === keep); if (k >= 0) m.i = k; }
  m.render();
  const n = o.tracks.length;
  $('tk-sub').textContent = `${n} chosen · ${n >= len ? `${len}-round seasons: no circuit twice in a season` : `${len}-round seasons: some circuits come round twice`}`;
}
function closeTrackPick() {
  const { back, done } = tkCtx; sfx.back();
  fadeTo(() => { show(back); done && done(); }, 180);
}
HINTS['s-circuits'] = () => [['nav', 'Move'], ['ok', 'In / Out'], ['back', 'Done']];
menus['s-circuits'] = [new Menu($('m-circuits'), [], { desc: 'd-circuits', cols: () => 4 })];
backs['s-circuits'] = () => closeTrackPick();

// ---- the hub: your garage ----
// this career's car: its own livery (designed from the hub), on the chassis you bought
function worldCar() {
  const c = { ...(world.livery || settings.car) };
  if (world.car) c.chassis = world.car.chassis;
  // the title sponsor's name goes on the car (no title sponsor: whatever you've written there yourself)
  const t = WC.dealsOf(world).find(d => d.slot === 'title');
  if (t) { let n = ''; for (const wd of WC.sponsorName(t.sid).toUpperCase().replace(/'S\b/, 'S').split(' ')) { if ((n + ' ' + wd).trim().length > 14) break; n = (n + ' ' + wd).trim(); } c.sponsor = n || WC.sponsorName(t.sid).toUpperCase().slice(0, 14); } // (whole words that fit)
  return c;
}
// ---- sponsors' logos: one each (a plain one made up from their name and colour, or one you upload), on the car ----
const canDecal = () => { const C = CARS[carId(worldCar())]; return !!C && (C.cls === 'f1' || !!C.livery); };
function logoOf(d) {
  if (d.logo && assets.has(d.logo)) return d.logo;
  const id = 'spl' + d.sid;
  if (!assets.has(id)) {
    const sp = WC.sponsorInfo(d.sid), c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const g = c.getContext('2d'), col = '#' + sp.color.toString(16).padStart(6, '0');
    g.fillStyle = col; g.beginPath(); g.roundRect(6, 6, 500, 148, 22); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke();
    let size = 70; const name = sp.name.toUpperCase();
    g.font = `bold italic ${size}px Arial, sans-serif`; while (g.measureText(name).width > 450 && size > 20) { size -= 2; g.font = `bold italic ${size}px Arial, sans-serif`; }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 256, 84);
    assets.save(id, c.toDataURL('image/png'));
  }
  return d.logo || id;
}
// which sponsors are on the car (the title sponsor: its name sticker); null when the car can't carry logos
function updateLogoShown() {
  if (!world) return;
  if (!world.car || !canDecal()) { world.logoShown = null; return; }
  const c = worldCar(), on = new Set((c.decals || []).map(x => x.asset).filter(Boolean));
  // (a livery the designer hasn't turned into decals yet still has the built-in sticker, unless it was switched off)
  const nameOn = c.stickers === 'decals' ? (c.decals || []).some(x => x.bind === 'sponsor') : c.showSponsor !== false;
  world.logoShown = WC.dealsOf(world).filter(d => d.slot === 'title' ? nameOn : on.has(d.logo) || on.has('spl' + d.sid)).map(d => d.sid);
}
// the livery designer, opened with a sponsor's logo ready to place
let pendingDecal = null;
function logoToCar(sid) {
  const d = WC.dealsOf(world).find(x => x.sid === sid); if (!d) return;
  if (!canDecal()) { toast('This car only takes a paint colour: sponsors\' stickers go on the windows.'); return; }
  pendingDecal = d.slot === 'title' ? { bind: 'sponsor' } : { asset: logoOf(d), name: WC.sponsorName(sid) };
  standUp(); openWorldGarage(); setTimeout(() => openLivery(), 450);
}
async function uploadLogo(sid) {
  const d = WC.dealsOf(world).find(x => x.sid === sid); if (!d) return;
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/svg+xml,.svg';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      const a = await importImageFile(f), old = logoOf(d);
      d.logo = a.id;
      // the old logo on the car becomes the new one
      if (world.livery && world.livery.decals) for (const x of world.livery.decals) if (x.asset === old) x.asset = a.id;
      saveWorld(); updateLogoShown(); pc.render(); toast(`Logo for ${WC.sponsorName(sid)} saved.`);
    } catch (e) { toast(e.message || 'Couldn\'t read that image.'); }
  };
  inp.click();
}

// the garage from the hub edits this career's car, not the one in your other modes
let garageSwap = null;
function openWorldGarage() { garageSwap = settings.car; settings.car = worldCar(); openGarage('s-hub'); }
function closeWorldGarage() {
  if (!garageSwap) return;
  world.livery = { ...settings.car }; world.liveryDone = true; settings.car = garageSwap; garageSwap = null;
  updateLogoShown();
  saveSettings(); saveWorld();
}
// the car in the bay is your car for this series; the room is your garage model
function hubCar() {
  const cls = WC.seriesById(world.player.series).cls, car = worldCar();
  return CARS[carId(car)]?.cls === cls ? car : { ...car, chassis: chassisKey(carsOfClass(cls)[0]) };
}
function enterHub() {
  disposeSim(); updateLogoShown();
  const t = world.teams[world.player.team];
  if (world.livery) { t.main = world.livery.main; t.accent = world.livery.accent; }
  pitGarage.openHome(hubCar(), { main: t.main, accent: t.accent, name: t.name }); pitGarage.showCar(!!world.car);
  pitGarage.setPeople(mateInRoom(world));
  pcSeat = false; pc.close(); if (tsw.isOpen) tsw.close(); if (dayPlan.isOpen) dayPlan.close(); $('s-hub').classList.remove('seated', 'at-car', 'wizard', 'planning', 'at-list');
  hubMode = 'room'; carSub = null; carPart = null; optSub = false; listStep = null; listPrev = null;
  drawList(); renderHub(); show('s-hub'); hubEnter();
  if (world.ended) startEnding(!!world.endSeen); else if (!coopGuest()) maybeList();
  setTimeout(() => { if (world) warmPortraits(world); }, 1500);
}
// ---- the end of a career (js/ending.js): the garage at night, the Wire, the record ----
const ending = new Ending($('ending'), {
  garage: () => pitGarage,
  sfx: (k) => sfx[k] && sfx[k](),
  seen: () => { if (world && !world.endSeen) { world.endSeen = true; saveWorld(); } },
  hints: () => renderHints(),
  ad: () => endAd(world), wire: () => endWire(world), record: () => endRecord(world),
});
// (again: straight to the record)
function startEnding(again) {
  phone.close(); phone.hide(); $('s-hub').classList.add('ending-on'); pitGarage.setNotice(false);
  pitGarage.roomReady().then(() => setTimeout(() => { if (screen === 's-hub' && world && world.ended) ending.play(again); }, again ? 0 : 400));
}
function endInput() {
  if (!ending.isOpen) return false;
  const ok = pressed('Enter') | pressed('Space') | pressed('GP0') | pressed('GP9'), back = pressed('Escape') | pressed('Backspace') | pressed('GP1');
  const up = pressed('ArrowUp') | pressed('KeyW') | pressed('GP12') | pressed('GPSU'), down = pressed('ArrowDown') | pressed('KeyS') | pressed('GP13') | pressed('GPSD');
  ending.input({ ok, back, up, down });
  return true;
}
const endFirstYear = (w) => (w.player.hist[0] && w.player.hist[0].y) || (w.ended ? w.ended.y : w.year);
const endSeasons = (w) => w.player.hist.length + (w.over ? 0 : 1);
const endBest = (w) => { const h = w.player.hist; return h.length ? Math.min(...h.map(x => x.pos)) : null; };
// the listing on the computer: the car, or what's left of the garage
function endAd(w) {
  const s = WC.carSale(w), town = WC.TOWNS[w.home]?.name || 'San Velocita', foot = `Posted ${w.ended.y} · ${town} · reply by email`;
  if (w.car) return { section: 'cars+trucks', title: `${w.car.year || ''} ${w.car.name} race car`.trim(), price: `${WC.money$(s ? s.value : 0)} OBO`, foot,
    body: [`One owner. Raced in the ${seriesName(w.player.series)}. Some wear, all of it honest.`, `Selling due to a change in circumstances. Comes with what's left of the spares and a set of used tires.`, `Cash only. Must go this week. No time wasters. No "is this still available".`] };
  return { section: 'tools', title: 'Garage clear-out', price: 'Make an offer', foot,
    body: [`Everything must go: tools, a desk, an office chair, a CRT monitor (works), a dartboard, some used tires.`, `Also a handwritten list. Not for sale.`] };
}
function endWire(w) {
  const E = w.ended, team = E.team, starts = w.player.starts, wins = w.player.wins, best = endBest(w), n = endSeasons(w);
  const record = `In ${n} season${n === 1 ? '' : 's'} the team started ${starts} race${starts === 1 ? '' : 's'}${wins ? ` and won ${wins}` : ''}${best ? `. Its best championship finish was ${ord(best)}` : ''}.`;
  return E.why === 'bank'
    ? { when: `${E.y} · ROUND ${E.r + 1}`, head: `${team.toUpperCase()} FOLDS`, body: [`${team}, founded in ${endFirstYear(w)} by lottery winner ${w.player.name}, has stopped racing after its bank closed the team's account with ${WC.money$(-E.bal)} still owed.`, record, `${w.player.name.split(' ')[0]} could not be reached for comment. A man who answered the garage phone said "yeah no they're not here" and hung up.`] }
    : { when: `${E.y} · ROUND ${E.r + 1}`, head: `${team.toUpperCase()} LOSES ITS ENTRY`, body: [`The ${E.series || seriesName(w.player.series)} has withdrawn the entry of ${team}, founded in ${endFirstYear(w)} by lottery winner ${w.player.name}, after the team failed to start ${WC.satOut(w)} rounds this season.`, record, `The entry goes to the next team on the series' waiting list, which the series describes as "short, but real".`] };
}
function endRecord(w) {
  const E = w.ended, h = w.player.hist, best = endBest(w), y0 = endFirstYear(w);
  listPaper.draw(listState(w));
  return {
    list: listPaper.canvas.toDataURL('image/png'), cap: `${y0}${E.y !== y0 ? `&ndash;${E.y}` : ''} &middot; Folded`, team: escP(E.team),
    sub: `${escP(w.player.name)}, owner-driver.${w.list && w.list.why ? ` ${escP(WC.WHYS[w.list.why].line)}` : ''}`,
    cells: [['Seasons', endSeasons(w)], ['Races', w.player.starts], ['Wins', w.player.wins], ['Podiums', w.player.pods], ['Best finish', best ? ord(best) : '&mdash;'], ['Titles', w.player.titles]],
    how: E.why === 'bank' ? `Round ${E.r + 1} of the ${E.y} ${escP(E.series || seriesName(w.player.series))}: the bank closed the account, ${WC.money$(-E.bal)} overdrawn.` : `Round ${E.r + 1} of the ${E.y} ${escP(E.series || seriesName(w.player.series))}: the series withdrew the entry after ${WC.satOut(w)} rounds missed.`,
    acts: [...(w.preview ? [] : [{ label: 'Start Again In This World', run: () => startAgain() }]),
      { label: 'Back To The Menu', run: () => { $('s-hub').classList.remove('ending-on'); saveWorld(); pitGarage.close(); endPreviewDone(); quitToMenu(); } }],
  };
}
// the cars of each class, for the customer racing programmes (World Career: moving up)
function carCatalog() {
  const of = (cls) => carsOfClass(cls).filter(id => cls !== 'f1' || id === 'f1').map(id => { const st = carStats(id); return { key: chassisKey(id), name: id === 'f1' ? 'SV-F spec chassis' : CARS[id].name, hp: Math.round(st.power), kg: Math.round(st.weight) }; });
  return { gt1: of('gt1'), f1: of('f1') };
}
function openHub(first = false) {
  if (world) WC.setCarCatalog(world, carCatalog());
  fadeTo(() => {
    enterHub();
    if (WC.unread(world)) setTimeout(() => { if (screen === 's-hub') phone.buzz(); }, first ? 900 : 500);
  }, 200);
}
function renderHub() {
  if (world && !world.carCat) WC.setCarCatalog(world, carCatalog());
  if (!world) return;
  if (screen === 's-hub' || pitGarage.mode === 'home') pitGarage.setPeople(mateInRoom(world));
  const w = world, sid = w.player.series, S = w.series[sid];
  $('hub-title').textContent = w.teams[w.player.team].name;
  $('hub-sub').textContent = `${seriesName(sid)} · ${w.year} · ${w.over ? 'season complete' : `round ${w.round + 1} of ${w.opts.len}`}${coopGuest() ? ` · ${w.player.name.split(' ')[0]} is ${coop.doing || 'in the garage'}` : ''}${coop && coop.host ? ` · co-op ${coop.peer ? `· ${WC.coopPerson(w)?.first || coop.name} is here${coop.ready ? ', ready' : ''}` : `room ${coop.code}`}` : ''}`;
  const st = WC.seriesStandings(w, sid), cp = S.results.length ? st.findIndex(e => e.pid === 'P') + 1 : 0;
  const pips = S.cal.map((c, k) => `<i class="${k < w.round ? 'done' : k === w.round && !w.over ? 'now' : ''}" title="${c.name}"></i>`).join('');
  const champ = cellW('Championship', cp ? `${ord(cp)}<small> ${st[cp - 1].pts} PTS</small>` : '&mdash;');
  const bank = w.money && w.money.choice ? cellW('Bank', `<span class="${w.money.balance < 0 ? 'bad' : ''}">${WC.money$(w.money.balance)}</span>`) : cellW('Bank', '&mdash;');
  const F = w.founding || {};
  pitGarage.setNotice(WC.bankNote(w)?.stage >= 2);
  pitGarage.setMemories(WC.memoriesOf(w)); // (the clippings, trophies, bills and the mattress)
  if (w.ended) {
    const E = w.ended, bank = E.why === 'bank';
    $('hub-card').innerHTML = `<div class="panel-title">${E.y} &middot; ${bank ? 'Account closed' : 'Entry withdrawn'}</div><div class="ti-grid three">${cellW('Seasons', w.seasons.filter(x => x.you).length + (w.over ? 0 : 1))}${cellW('Wins', w.player.wins)}${cellW(E.bal < 0 ? 'Owed' : 'Bank', `<span class="${E.bal < 0 ? 'bad' : ''}">${WC.money$(Math.abs(E.bal))}</span>`)}</div>
      <p class="br-hint">${bank ? 'First Velocita has closed the account.' : `The ${escP(E.series || '')} has withdrawn your entry.`} ${escP(E.team)} is finished.</p>`;
  } else if (hubMode === 'list') {
    $('hub-card').innerHTML = listCard(w);
  } else if (hubMode === 'car' && w.car) {
    const risk = WC.failRisk(w), m = WC.staffOf(w, 'mechanic');
    $('hub-card').innerHTML = `<div class="panel-title">THE CAR</div><div class="ti-name">${w.car.year} ${w.car.name}</div>
      <div class="ti-grid">${cellW('Failure risk', `<span class="${risk >= 0.08 ? 'bad' : ''}">${risk < 0.03 ? 'Low' : risk < 0.08 ? 'Some' : risk < 0.15 ? 'High' : 'Very high'}</span>`)}${cellW('Bank', WC.money$(w.money.balance))}</div>
      <p class="hub-note">${m ? `${m.first} does the rebuilds.` : 'No chief mechanic: rebuilds go to a shop.'}</p>`;
  } else if (!founded(w)) {
    const step = (done, t) => `<div class="row"><span>${t}</span><span class="${done ? 'ok' : ''}">${done ? 'DONE' : '&mdash;'}</span></div>`;
    $('hub-card').innerHTML = `<div class="panel-title">GETTING STARTED</div><div class="hub-steps">
      ${step(F.reg, 'Register the team')}${step(w.money && w.money.choice, 'Claim your winnings')}${w.setup ? step(WC.setupDone(w), 'Set up the team') : step(F.car, 'Buy a car')}${step(!!w.livery && w.liveryDone, 'Paint it (optional)')}${step((w.staff || []).length > 0, 'Hire staff (optional)')}</div>
      <p class="hub-note">It all happens on the <b>computer</b>.</p>`;
  } else if (!w.over) {
    // the team at a glance: the three things to build up, a hint, and what needs attention
    const B = WC.briefing(w), [gc, gr, gm] = B.goals;
    const cell = (g, v) => `<div><small>${g.label}</small><b>${v}</b><span class="br-bar"><i style="--v:${g.pct.toFixed(3)}"></i></span></div>`;
    const wt = B.watch.slice(0, 2).map(x => `<div class="br-row ${x.bad ? 'bad' : 'warn'}"><i></i><span>${x.text}</span></div>`).join('') + (B.watch.length > 2 ? `<div class="br-more">and ${B.watch.length - 2} more: ${B.watch.slice(2).map(x => x.text.split(':')[0].toLowerCase()).join(', ')}</div>` : '');
    $('hub-card').innerHTML = `<div class="panel-title">The team</div>
      <div class="ti-grid three br-goals">${cell(gc, cp ? `${ord(cp)}<small> ${st[cp - 1].pts} PTS</small>` : '&mdash;')}${cell(gr, gr.value.length > 9 ? `<span class="br-long">${gr.value}</span>` : gr.value)}${cell(gm, `<span class="hub-roll ${w.money.balance < 0 ? 'bad' : ''}">${WC.money$(w.money.balance)}</span>`)}</div>
      <p class="br-hint">${B.hint}</p>
      <div class="panel-title br-att">Needs attention</div>${wt || '<div class="br-none">Nothing on fire.</div>'}`;
  } else {
    const sum = w.seasons.at(-1), you = sum && sum.you, off = w.player.offer;
    $('hub-card').innerHTML = `<div class="panel-title">${w.year} &middot; SEASON COMPLETE</div><div class="season-pips">${pips}</div>
      <div class="ti-grid three">${cellW('Finished', you ? ord(you.pos) : '&mdash;')}${cellW('Wins', you ? you.wins : 0)}${bank}</div>
      ${off ? `<p class="hub-note">${off.answer === 'move' ? `You're moving up to the <b>${seriesName(off.to)}</b>.` : off.answer === 'stay' ? `You're staying in the ${seriesName(sid)}.` : `The <b>${seriesName(off.to)}</b> has emailed you an offer.`}</p>` : ''}`;
  }
  renderWeekStrip();
  renderHubMenu();
  rollHubMoney();
  runVoices();
}
// the garage's money, rolling to its new number when it changes (and the change floating off it)
let hubBal = null, hubBalOf = null;
function rollHubMoney() {
  const el = document.querySelector('#hub-card .hub-roll'), w = world; if (!el || !w.money) return;
  const to = w.money.balance, from = hubBalOf === w ? hubBal : to; hubBal = to; hubBalOf = w;
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const d = to - from, t0 = performance.now(), fl = document.createElement('em');
  fl.className = `hub-delta ${d < 0 ? 'neg' : 'gain'}`; fl.textContent = `${d < 0 ? '\u2212' : '+'}${WC.money$(Math.abs(d))}`; el.parentElement.append(fl);
  setTimeout(() => fl.remove(), 1700);
  const tick = (t) => { const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); if (el.isConnected) el.textContent = WC.money$(Math.round(from + d * e)); if (k < 1) requestAnimationFrame(tick); };
  el.textContent = WC.money$(from); requestAnimationFrame(tick);
}
// arriving in the garage (or back from an overlay): the hub comes up the way the Team Setup does
function hubEnter() {
  const el = $('s-hub'); if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
  clearTimeout(hubEnter.t); hubEnter.t = setTimeout(() => el.classList.remove('enter'), 1300);
}
// character voices: reword the new messages (js/voice.js), then show them as they land
function voiceLine() {
  if (voiceState.server === false) return 'Needs the game\'s own server (the San Velocita GP app, or serve.py).';
  if (!voiceState.signedIn) return 'Not signed in.';
  return { limit: 'Your ChatGPT plan\'s limit for now has been reached: written versions until it resets.', plan: 'This ChatGPT account doesn\'t include plan usage (it needs Plus or Pro).', signin: 'ChatGPT needs you to sign in again.' }[voiceState.error] || '';
}
function runVoices() {
  if (!world || settings.voices !== 'chatgpt' || !voiceState.signedIn) return;
  const w = world, B = WC.briefing(w), st = WC.seriesStandings(w, w.player.series), cp = st.findIndex(e => e.pid === 'P') + 1;
  const ctx = `${w.player.name.split(' ')[0]}, owner-driver of ${w.teams[w.player.team].name} in the ${seriesName(w.player.series)}, ${w.year} season, round ${w.round + 1} of ${w.opts.len}. ${cp && w.series[w.player.series].results.length ? `${ord(cp)} in the championship.` : 'No races yet.'} ${w.money ? `Bank: ${WC.money$(w.money.balance)}.` : ''} ${B.watch.slice(0, 2).map(x => x.text).join('. ')}`;
  // (then the Wire's storylines, written up)
  const stories = () => voiceStories(w, (id) => WC.storyFacts(w, id), (id, lead) => { WC.voiceStory(w, id, lead); saveWorld(); if (pc.isOpen) pc.render(); });
  voiceReacts(w, ctx, (r, text) => {
    if (r.who === 'rival') WC.mail(w, r.from, r.addr, pick(['A note', 'This weekend', 'Re: your season']), text.split(/\n\s*\n/).filter(Boolean), { voiced: true });
    else { const lines = text.split(/\n+/).map(x => x.trim()).filter(Boolean).slice(0, 3); WC.texts(w, r.from, lines, { voiced: true }); } // (a burst of texts, read top to bottom)
    saveWorld(); phone.buzz(); if (screen === 's-hub') { renderHubMenu(); if (pc.isOpen) pc.render(); }
  }).then(stories, stories);
}
// (the next circuit's samples, kept: the garage redraws often)
const hubTrackCache = new Map();
const hubTrackT = (tr) => { if (!hubTrackCache.has(tr.name)) hubTrackCache.set(tr.name, sampleTrack(tr)); return hubTrackCache.get(tr.name); };
// the week, as a calendar across the top: what each day went on, today, race day
let wkStamp = -1; // (the day the planner just spent: stamped once on the strip)
function renderWeekStrip() {
  const w = world, el = $('hub-week'), on = !!founded(w) && !w.over && !w.ended && hubMode === 'room';
  el.hidden = !on; if (!on) return;
  const wk = myWeek(w), R = w.series[w.player.series].cal[w.round], left = wk.left;
  const days = WC.DAY_NAMES.map((d, i) => {
    const e = wk.log.filter(x => x.day === i), x = e[e.length - 1];
    if (x) {
      const amt = e.reduce((a, y) => a + (y.amt || 0), 0), todo = x.gig && !x.done;
      return `<div class="wk-day done${todo ? ' todo' : ''}${i === wkStamp ? ' stamp' : ''}"><small>${d}</small><b>${x.tag || 'Busy'}</b><em class="${amt < 0 ? 'neg' : ''}">${todo ? 'To drive' : amt ? `${amt > 0 ? '+' : '&minus;'}${WC.money$(Math.abs(amt))}` : '&nbsp;'}</em></div>`;
    }
    const today = i === wk.used;
    return `<div class="wk-day${today ? ' today' : ''}"><small>${d}</small><b>${today ? 'Today' : 'Free'}</b><em>&nbsp;</em></div>`;
  }).join('');
  // (the storyline that's live in this race, first, in a line: the targets make room for it)
  const SL = WC.storyLine(w), sl = SL ? `<div class="br-row tg story"><span><b>${SL.who}:</b> ${SL.text}</span></div>` : '';
  const B = WC.briefing(w), tg = sl + B.targets.slice(0, SL ? 2 : 3).map(t => `<div class="br-row tg"><span><b>${t.who}:</b> ${t.text.charAt(0).toLowerCase() + t.text.slice(1)}</span>${t.amt ? `<em>+${WC.money$(t.amt)}</em>` : ''}</div>`).join('');
  const tr = findCalTrack(R.name), T = tr ? hubTrackT(tr) : null, km = T ? (trackStats(T).length / 1000).toFixed(1) : null;
  el.innerHTML = `<div class="wk-head"><span>The week before round ${w.round + 1} of ${w.opts.len}</span><b>${left ? `${left} day${left === 1 ? '' : 's'} left${wk.booked ? `, ${wk.booked} booked` : ''}` : 'Race day next'}</b></div>
    <div class="wk-days">${days}<div class="wk-day race"><small>Sat</small><b>Race</b><em>Round ${w.round + 1}</em></div></div>
    <div class="wk-targets"><canvas class="wk-map" width="180" height="132"></canvas><div class="wk-tg">
      <div class="wk-track">${R.gp ? WC.GP_NAME : R.name}</div><div class="wk-cond">${R.gp ? `${R.name} &middot; ` : ''}${tr ? THEMES[tr.env.theme].label : ''}${km ? ` &middot; ${km} km, ${T.open ? 'point to point' : `${WC.raceLaps(w, T.L / 1000, false)} laps`}` : ''} &middot; ${R.time}, ${R.weather}</div>
      ${tg || '<div class="br-none">No targets set. Race well.</div>'}</div></div>`;
  if (T) drawTrackMap(T, el.querySelector('.wk-map'));
  wkStamp = -1;
}
function renderHubMenu() {
  if (!world) return;
  if (hubMode === 'car') return renderCarMenu();
  if (hubMode === 'list') return renderListMenu();
  if (coopGuest()) return renderGuestMenu();
  if (world.ended) { // (the team's finished: what's left is reading about it)
    const m = menus['s-hub'][0];
    m.setItems([{ label: 'Computer', action: () => sitDown('mail'), desc: 'The letters.' }, { label: 'Phone', action: () => { phone.open(); renderHints(); }, desc: 'Texts.' },
      { label: 'The List', action: () => goToList(), desc: 'What you got done.' }, { label: 'Save & Quit', cls: 'action primary', action: () => { saveWorld(); pitGarage.close(); quitToMenu(); }, desc: 'The career is over. It stays on the Career screen.' }], true);
    return;
  }
  if (optSub) return renderOptMenu();
  const w = world, sid = w.player.series, n = WC.unread(w), nm = WC.unreadMail(w);
  const items = [];
  const off = w.player.offer, offerMail = off && !off.answer && (w.mail || []).find(m => m.offer && !m.answer);
  const claim = w.money && !w.money.choice && (w.mail || []).find(m => m.lottery && !m.answer);
  const F = w.founding || {};
  if (!F.reg) items.push({ label: 'Register The Team', cls: 'action primary', action: () => sitDown('registry'), desc: 'Form SV-1, on the computer.' });
  else if (claim) items.push({ label: 'Claim Your Winnings', cls: 'action primary', action: () => sitDown('mail', claim.id), desc: 'The State Lottery needs to know how you want your money. It\'s waiting in your email.' });
  else if (!WC.setupDone(w)) items.push(WC.setupKind(w) === 'season'
    ? { label: 'Set Up The Season', cls: 'action primary', action: () => openTeamSetup(), desc: `${WC.needsCar(w) ? 'A car for the ' + seriesName(sid) + ', ' : ''}who pays for the second car${w.setup.sponsors.length ? ', a title sponsor' : ''}, and the season's money. Nothing is spent until you start the season.` }
    : { label: 'Set Up The Team', cls: 'action primary', action: () => openTeamSetup(), desc: 'How you get in, the car, a title sponsor and your second driver. Nothing is spent until you start the season.' });
  else if (!F.car) items.push({ label: 'Buy A Car', cls: 'action primary', action: () => sitDown('classifieds'), desc: 'Danny sent you some listings. They\'re on the computer.' });
  else if (!w.over && WC.payrollShort(w)) items.push({ label: 'Sort Out Payroll', cls: 'action primary', action: () => sitDown('staff'), desc: `Payroll is ${WC.money$(WC.payrollDue(w))} and you have ${WC.money$(w.money.balance)}. Decide who gets paid (Team, on the computer: the Staff tab).` });
  else if (!w.over) {
    const r = w.series[sid].cal[w.round];
    const tg = WC.dealsOf(w).map(d => `<b>${WC.sponsorName(d.sid)}</b>: ${WC.objText(w, WC.dealObjective(w, d)).toLowerCase()}`).join(' · ');
    // the week: jobs you've booked, then today (pick what to do with it), then race day
    const left = WC.daysLeft(w), booked = WC.bookedGigs(w);
    // (jobs you've booked are in the day planner, first; with no days left to plan, they're here)
    if (left <= 0) for (const g of booked) items.push({ label: `Drive: ${WC.GIG_KINDS[g.kind].name}`, cls: 'action primary', action: () => startGig(g), desc: gigDesc(g) });
    // (no race car: the week's still yours to work, and race day can only be sat out)
    const noCar = WC.needsCar(w);
    if (left > 0) items.push(dayItem(w, !WC.bookedDays(w) && !noCar));
    else if (noCar) items.push(sitOutItem(w, true));
    else items.push({ label: `Round ${w.round + 1}: Race`, cls: 'action primary', action: () => startWorldRound(), desc: raceDesc(w) }, sitOutItem(w, false));
    if (noCar) items.push(getCarItem(w));
  } else {
    items.push({ label: `Start ${w.year + 1} Season`, cls: 'action primary', action: () => beginNextSeason(),
      desc: offerMail ? `First answer the ${seriesName(off.to)}'s email.` : 'Everyone a year older. Retirements, promotions and rookies, then a new calendar.' });
    if (off && off.answer === 'move') {
      const miss = WC.seriesMissing(WC.myTeam(w), off.to);
      if (miss.length) items.push({ label: `${seriesName(off.to)} Requirements<small>MISSING</small>`, action: () => sitDown('facilities'), desc: `The ${seriesName(off.to)} won't take your entry without ${miss.map(([k, n]) => WC.needName(k, n)).join(' and ')}. Build them before you start the season (Team, Facilities), or the entry is withdrawn.` });
      items.push({ label: `${seriesName(off.to)} Cars`, action: () => sitDown('customer'), desc: `Sort out a car for the ${seriesName(off.to)} now, or when the new season starts (on the computer).` });
    }
  }
  items.push(
    { label: `Computer${nm ? `<small>${nm} NEW</small>` : ''}`, action: () => sitDown(offerMail ? 'mail' : null, offerMail ? offerMail.id : null), desc: 'Sit down at the desk: Mail, Team (the car, tyres, staff, data) and the Internet. You can also click the monitor.' },
    { label: `Phone${n ? `<small>${n} NEW</small>` : ''}`, action: () => { phone.open(); renderHints(); }, desc: 'Texts from your teammate, rivals and friends.' },
    ...(founded(w) && !w.over && tyreShort(w) ? [{ label: 'Order Tyres<small>LOW</small>', action: () => sitDown('tyres'), desc: `In stock: ${WC.COMPOUNDS.filter(c => c !== 'dirt' || WC.stockOf(w).dirt || WC.tyreNeeds(w).dirt).map(c => `${WC.stockOf(w)[c]} ${c}`).join(', ')}. Order before the weekend (on the computer): trackside sets cost ${Math.round((WC.TRACKSIDE - 1) * 100)}% more. A team manager would order for you.` }] : []),
    ...(w.car ? [{ label: `Work On The Car${carNeedsWork(w) ? '<small>NEEDS WORK</small>' : ''}`, action: () => goToCar(), desc: 'Walk over to the car: each part\'s condition, rebuilds and new parts. Upgrades are bought on the computer.' }] : []),
    ...(founded(w) ? [{ label: `The List${WC.listWants(w) ? '<small>TO WRITE</small>' : WC.listFresh(w).length ? '<small>NEW</small>' : ''}`, action: () => goToList(), desc: listDesc(w) }] : []),
    { label: 'Car & Livery', action: () => openWorldGarage(), desc: w.car ? `Your ${w.car.year} ${w.car.name}: paint it, design the livery, the helmet and the suit.` : `Your livery, helmet and suit. In the ${seriesName(sid)} you race ${CLASSES[WC.seriesById(sid).cls].label} cars.` },
    { label: `Career Options<small>${(DIFF_LABEL[w.opts.difficulty] || '').toUpperCase()}</small>`, action: () => { optSub = true; sfx.select(); renderHubMenu(); }, desc: `Difficulty (${DIFF_LABEL[w.opts.difficulty] || ''}), driver aids, circuits, and Save & Quit.` },
  );
  // (Save & Quit is in Career Options: the column stays short)
  const m = menus['s-hub'][0], keep = m.items[m.i]?.label?.replace(/<small>.*$/, '');
  m.setItems(items, true);
  const k = items.findIndex(it => it.label.replace(/<small>.*$/, '') === keep); if (k >= 0) { m.i = k; m.render(); }
}
menus['s-hub'] = [new Menu($('m-hub'), [], { desc: 'd-hub', onMove: (it) => { if (it && it.part && hubMode === 'car') { carPart = it.part; pitGarage.setView('car', it.part); } if (hubMode === 'car') showCarPerf(it); if (hubMode === 'list') listPreview(it); } })];
backs['s-hub'] = () => {
  if (ending.isOpen) { ending.input({ back: true }); return; }
  if (tsw.isOpen) { tsw.back(); renderHints(); return; }
  if (dayPlan.isOpen) return;
  if (hubMode === 'list') { if (!listPaper.busy) leaveList(); return; }
  if (pcSeat && pc.isOpen) { if (pc.app) { pc.back(); renderHints(); } else standUp(); return; }
  if (hubMode === 'car') { if (carSub) { carSub = null; sfx.back(); renderHubMenu(); } else leaveCar(); }
  else if (optSub) { optSub = false; sfx.back(); renderHubMenu(); }
};
tabbers['s-hub'] = (d) => { if (pc.isOpen) pc.flip(d); };
const cellW = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
// short of tyres for the next round (and nobody ordering for you)?
function tyreShort(w) {
  if (w.over || !w.founding || w.founding.legacy || WC.staffOf(w, 'manager')) return null;
  const need = WC.tyreNeeds(w), st = WC.stockOf(w), short = WC.COMPOUNDS.filter(c => st[c] < need[c]);
  return short.length ? short : null;
}
// ---- at the car: the parts, tagged on the car itself, and the work you can do there ----
let hubMode = 'room', carPart = null, carSub = null;
const carNeedsWork = (w) => { const P = w.car && WC.carParts(w); return !!P && WC.PART_KEYS.some(k => P[k].cond < 0.5); };
// (part: straight to that part's work; otherwise the parts list, on the one in the worst state)
function goToCar(part = null) {
  if (!world || !world.car) return;
  const P = WC.carParts(world), worst = WC.PART_KEYS.slice().sort((a, b) => P[a].cond - P[b].cond)[0];
  hubMode = 'car'; carSub = part; carPart = part || worst;
  $('s-hub').classList.add('at-car');
  pitGarage.setView('car', carPart); sfx.select();
  renderHub(); renderHints();
}
function sellTheCar() {
  const s = WC.sellCar(world); if (!s) return;
  sfx.best(); saveWorld(); toast(s.lease ? 'Handed back.' : `Sold for ${WC.money$(s.value)}.`);
  hubMode = 'room'; carSub = null; carPart = null; $('s-hub').classList.remove('at-car');
  pitGarage.setView('room'); pitGarage.showCar(false); renderHub(); renderHints();
}
function leaveCar() {
  hubMode = 'room'; carSub = null; carPart = null; optSub = false;
  $('s-hub').classList.remove('at-car');
  pitGarage.setView('room'); sfx.back();
  renderHub(); renderHints();
}
const condWord = (c) => c >= 0.8 ? 'good' : c >= 0.6 ? 'fair' : c >= 0.4 ? 'worn' : c >= 0.2 ? 'bad' : 'shot';
function renderCarMenu() {
  const w = world, P = WC.carParts(w), m = menus['s-hub'][0], odds = WC.failOdds(w), lvl = WC.dataLevel(w);
  let items;
  if (!carSub) {
    const imp = settings.units === 'mph';
    items = [...WC.PART_KEYS.map(k => {
      const p = P[k], c = Math.round(p.cond * 100);
      return { label: `${WC.PARTS[k].name}<small>${c}%</small>`, part: k, action: () => { carSub = k; carPart = k; sfx.select(); renderHubMenu(); },
        desc: `${WC.PARTS[k].name}: <b>${condWord(p.cond)}</b> (${c}%).${odds[k] != null ? (lvl === 2 ? ` ${(odds[k] * 100).toFixed(1)}% chance it fails next race.` : p.cond < 0.5 ? ' It could let go in a race.' : '') : ''}${p.fits.length ? ` Fitted: ${p.fits.map(f => `<b>${f.name}</b>, "${f.feel}"${f.measured ? `, measured ${f.measured.val >= 0 ? '+' : ''}${(f.measured.val * 100).toFixed(1)}% ${f.measured.stat}` : ''}`).join('; ')}.` : ''} ${partEffect(w, k, imp)}` };
    })];
    const sale = WC.carSale(w);
    items.push({ label: 'Shop For Upgrades', action: () => sitDown('parts'), desc: 'Speed Parts Direct and SVList, on the computer.' },
      ...(sale ? [{ label: `${sale.lease ? 'Hand It Back' : 'Sell The Car'}<small>+${WC.money$(sale.value)}</small>`, confirm: `${sale.lease ? 'Hand it back' : 'Sell it'}? Select again`, action: () => sellTheCar(),
        desc: sale.lease ? `Back to the programme: you get <b>${WC.money$(sale.value)}</b> of the deposit back (less what it needs putting right). No race car until you get another.` : `A dealer gives <b>${WC.money$(sale.value)}</b> for it this week (what it cost you, less wear). No race car until you buy another: you can still work the week and sit rounds out.` }] : []),
      { label: 'Back', action: () => leaveCar(), desc: 'Back to the garage.' });
  } else {
    const k = carSub, p = P[k], mech = WC.staffOf(w, 'mechanic');
    items = [
      { label: `${WC.PARTS[k].name}<small>${Math.round(p.cond * 100)}%</small>`, head: true },
      { label: `Rebuild<small>${WC.money$(WC.rebuildCost(w, k))}</small>`, part: k, preview: 'rebuild', confirm: 'Pay for it? Select again', action: () => { WC.rebuildPart(w, k); sfx.best(); saveWorld(); renderHub(); },
        desc: mech ? `${mech.first} rebuilds it: back to good, not new.` : 'No chief mechanic: a shop rebuilds it (dearer, and only back to OK).' },
      ...(WC.weekOpen(w) ? [{ label: `Rebuild It Yourself<small>${WC.money$(WC.selfCost(w, k))} + A DAY</small>`, part: k, preview: 'self', confirm: 'Spend a day on it? Select again',
        action: () => { if (!WC.rebuildSelf(w, k)) { sfx.error(); toast('No days left this week.'); return; } sfx.best(); saveWorld(); renderHub(); },
        desc: `Parts only, and a day of your week (${WC.daysLeft(w)} left). ${w.background === 'mechanic' ? 'You know what you\'re doing: back to good.' : 'You\'ll get it back to OK.'}` }] : []),
      { label: `New ${WC.PARTS[k].name}<small>${WC.money$(WC.newPartCost(w, k))}</small>`, part: k, preview: 'new', confirm: 'Pay for it? Select again', action: () => { WC.newPart(w, k); sfx.best(); saveWorld(); renderHub(); }, desc: 'A brand new part: 100%.' },
      ...(k === 'engine' && w.grey ? [{ label: "Take Kev's Map Off", part: k, preview: 'map', confirm: 'Take it off? Select again', action: () => { WC.removeGrey(w); sfx.select(); saveWorld(); renderHub(); }, desc: 'Back to the standard engine software. A little slower, and nothing for the scrutineers to find.' }] : []),
      ...p.fits.map((f, i) => ({ label: `Remove ${f.name}`, part: k, preview: 'remove', fitIdx: i, confirm: 'Take it off? Select again', action: () => { WC.removeFit(w, k, i); saveWorld(); renderHub(); }, desc: 'The part comes off and is thrown away. Any other upgrades on it stay.' })),
      { label: 'Upgrades For It', part: k, action: () => sitDown('parts'), desc: 'Speed Parts Direct and SVList, on the computer.' },
      { label: 'Back', part: k, action: () => { carSub = null; sfx.back(); renderHubMenu(); }, desc: 'The other parts.' },
    ];
  }
  m.setItems(items, true);
  const want = carSub ? 1 : Math.max(0, WC.PART_KEYS.indexOf(carPart));
  if (m.i >= items.length || !carSub) { m.i = want; m.render(); }
  showCarPerf(m.items[m.i]);
}
// the performance panel beside the car (js/carsheet.js): the part you're on, and what the action you're on would do
const carPerf = new CarPanel($('car-perf'), { world: () => world, imperial: () => settings.units === 'mph' });
function showCarPerf(it) {
  if (hubMode !== 'car' || !world || !world.car) return;
  carPerf.render(it && it.part ? it.part : null, it && it.preview ? { kind: it.preview, part: it.part, idx: it.fitIdx } : null);
}
// the car's tags: in the room, one over the car (like the computer's: the part in the worst state, if one needs
// work); at the car, one on the part you're looking at
function carTags() {
  const box = $('car-tags'), w = world, P = w && w.car && !w.ended && screen === 's-hub' && !pcSeat && !phone.isOpen ? WC.carParts(w) : null;
  const key = !P ? '' : hubMode === 'car' ? (pitGarage.settled ? 'p:' + carPart : '') : pitGarage.atRoom ? 'car' : '';
  if (box.dataset.keys !== key) {
    box.dataset.keys = key;
    box.innerHTML = key ? `<div class="pc-tag car-tag" data-part="${key === 'car' ? '' : carPart}"><span><b></b><small></small></span><i></i></div>` : '';
  }
  const el = box.firstElementChild; if (!el) return;
  const worst = WC.PART_KEYS.slice().sort((a, b) => P[a].cond - P[b].cond)[0], k = el.dataset.part;
  const a = k ? pitGarage.partAnchor(k)?.add(new THREE.Vector3(0, 0.25, 0)) : pitGarage.carAnchor(), at = a && pitGarage.toScreen(a);
  el.hidden = !at; if (!at) return;
  const z = hubZoom(); el.style.left = at.x / z + 'px'; el.style.top = at.y / z + 'px';
  const shown = k || (P[worst].cond < 0.5 ? worst : null);
  const b = k ? WC.PARTS[k].name.toUpperCase() : 'CAR', sm = shown ? `${k ? '' : WC.PARTS[shown].name.toUpperCase() + ' '}${Math.round(P[shown].cond * 100)}%` : '';
  if (el.querySelector('b').textContent !== b) el.querySelector('b').textContent = b;
  if (el.querySelector('small').textContent !== sm) el.querySelector('small').textContent = sm;
  el.classList.toggle('hot', !!k || carHover);
  el.classList.toggle('bad', !!shown && P[shown].cond < 0.5);
}
let carHover = false;
// the hub screen is scaled to the window (CSS zoom): the tags inside it are placed in its own, unscaled pixels
const hubZoom = () => parseFloat(getComputedStyle($('s-hub')).zoom) || 1;
$('car-tags').addEventListener('click', (e) => { const t = e.target.closest('.car-tag'); if (!t) return; if (hubMode === 'car') { carSub = carPart; renderHubMenu(); sfx.select(); } else goToCar(); });

// ---- the list on the wall: why you're doing this, what's next, this year's ambition (js/thelist.js) ----
// Walking over to it plays the pen first (anything crossed off since you last looked, this year's ambition made or
// missed), then asks for anything still to write: your why (once), and this year's ambition (before the first race).
// While you choose, the one you're on is pencilled in on the sheet.
let listStep = null, listPrev = null, listHide = new Set();
function listState(w) {
  const L = WC.listOf(w), next = WC.listNext(w), a = WC.ambitionOf(w);
  let rungs = WC.listRungs(w);
  // (choosing your why: its two lines pencilled in where they'd go)
  if (listStep === 'why' && listPrev) rungs = Object.entries(WC.RUNGS).filter(([, r]) => !r.why || r.why === listPrev).sort((x, y) => x[1].at - y[1].at)
    .map(([key, r]) => ({ key, text: r.text(w), done: L.done[key] || null, pencil: !!r.why }));
  rungs = rungs.map(r => listHide.has(r.key) ? { ...r, hidden: true } : r);
  return { why: L.why ? WC.WHYS[L.why].line : null, whyPreview: listStep === 'why' && listPrev ? WC.WHYS[listPrev].line : null,
    rungs, next: next && !listHide.has(next.key) ? next.key : null, fresh: L.fresh, allDone: !next, year: w.year,
    amb: a ? { label: a.label, result: a.result } : null, ambPreview: listStep === 'amb' && listPrev ? listPrev.label : null };
}
function drawList() { if (world && !listPaper.busy) listPaper.draw(listState(world)); }
// the pen, one line after another (keys: a rung to cross off, 'w:' + a rung to write in, 'why', 'amb', 'amb-result')
function listPlay(keys, done) {
  const k = keys.shift(); if (k == null) { done && done(); return; }
  if (k.startsWith('w:')) listHide.delete(k.slice(2));
  listPaper.state = listState(world); sfx.move();
  listPaper.play(k, k.startsWith('w:') ? 420 : k === 'why' || k === 'amb' ? 750 : 650, () => setTimeout(() => listPlay(keys, done), 140));
}
function goToList() {
  if (!world || hubMode === 'list' || !founded(world)) return;
  if (hubMode === 'car') { hubMode = 'room'; carSub = null; carPart = null; $('s-hub').classList.remove('at-car'); }
  optSub = false; hubMode = 'list'; listStep = null; listPrev = null;
  $('s-hub').classList.add('at-list'); pitGarage.setView('list'); sfx.select();
  // nothing new crossed off: straight to anything there is to write (the choices are up while the camera moves);
  // otherwise, once the camera's there, the pen first
  if (!WC.listFresh(world).length) { listNextStep(); return; }
  drawList(); renderHub(); renderHints();
  const go = () => { if (hubMode !== 'list') return; if (!pitGarage.atList) { setTimeout(go, 80); return; } listCatchUp(); };
  setTimeout(go, 200);
}
function listCatchUp() {
  const w = world, fr = WC.listFresh(w).slice();
  if (!fr.length) return listNextStep();
  renderHubMenu();
  listPlay(fr.map(k => k === 'amb' ? 'amb-result' : k), () => { WC.listSeen(w); saveWorld(); sfx.best(); listNextStep(); });
}
function listNextStep() {
  const w = world; if (hubMode !== 'list') return;
  listStep = !WC.listOf(w).why ? 'why' : WC.ambitionDue(w) ? 'amb' : null; listPrev = null;
  drawList(); renderHub(); renderHints();
}
function leaveList() {
  hubMode = 'room'; listStep = null; listPrev = null; listHide.clear();
  $('s-hub').classList.remove('at-list'); pitGarage.setView('room'); sfx.back();
  drawList(); renderHub(); renderHints();
}
// coming into the garage with something on the list to write or to cross off: straight over to it
function maybeList() {
  const w = world; if (!w || !founded(w) || tsw.isOpen || !WC.setupDone(w) || (!WC.listWants(w) && !WC.listFresh(w).length)) return;
  setTimeout(() => { if (screen === 's-hub' && world === w && hubMode === 'room' && !pcSeat && !tsw.isOpen && !dayPlan.isOpen && !phone.isOpen) goToList(); }, 900);
}
function writeWhy(k) {
  const w = world; WC.setWhy(w, k); saveWorld();
  const added = Object.entries(WC.RUNGS).filter(([, r]) => r.why === k).map(([key]) => key);
  added.forEach(key => listHide.add(key)); listStep = null; listPrev = null; renderHubMenu(); renderHints();
  listPlay(['why', ...added.map(key => 'w:' + key)], () => { listHide.clear(); sfx.best(); listNextStep(); });
}
function writeAmb(c) {
  const w = world; WC.setAmbition(w, c.t); saveWorld();
  listStep = null; listPrev = null; renderHubMenu(); renderHints();
  listPlay(['amb'], () => { sfx.best(); listNextStep(); });
}
// what's pencilled in: the choice the menu's on
function listPreview(it) {
  if (hubMode !== 'list' || listPaper.busy) return;
  const p = listStep === 'why' ? it?.why || null : listStep === 'amb' ? it?.amb || null : null;
  if (p !== listPrev) { listPrev = p; drawList(); }
}
function ambDesc(w, c) {
  const sp = WC.dealsOf(w).find(d => d.slot === 'title'), pc = Math.round(Math.abs(c.fee - 1) * 100), fund = WC.finances(w)?.funds.drivers[c.t - 1];
  return [...(fund ? [`P${c.t} pays <b>${WC.money$(fund)}</b> at the end.`] : []),
    c.fee !== 1 ? `Sponsors <b>${c.fee > 1 ? '+' : '&minus;'}${pc}%</b> a round.` : '',
    `Make it: <b>+${c.repWin} rep</b>${c.bonus && sp ? `, <b>${WC.money$(c.bonus)}</b> from ${WC.sponsorName(sp.sid)}` : ''}.`,
    `Miss it: <b>&minus;${c.repMiss} rep</b>${c.renew ? ', renewals at risk' : ''}.`].filter(Boolean).join(' ');
}
function renderListMenu() {
  const w = world, m = menus['s-hub'][0];
  let items;
  if (listPaper.busy) items = [{ label: 'The List', head: true }];
  else if (listStep === 'why') items = [{ label: 'Why are you doing this?', head: true },
    ...Object.entries(WC.WHYS).map(([k, x]) => ({ label: x.name, why: k, action: () => writeWhy(k), desc: x.desc }))];
  else if (listStep === 'amb') items = [{ label: `${w.year}: what are you going for?`, head: true },
    ...WC.ambitionChoices(w).map(c => ({ label: `${c.label}<small>${c.name.toUpperCase()}</small>`, amb: c, action: () => writeAmb(c), desc: ambDesc(w, c) }))];
  else {
    const a = WC.ambitionOf(w), early = a && !a.result && w.round === 0 && !w.series[w.player.series].results.length;
    items = [{ label: 'Back', action: () => leaveList(), desc: 'Back to the garage.' },
      ...(early ? [{ label: `Rewrite ${w.year}`, action: () => { w.amb = null; saveWorld(); listNextStep(); }, desc: 'Before the first race you can still change your mind.' }] : [])];
  }
  m.setItems(items, true);
  if (m.items[m.i]?.head) { m.i = m.items.findIndex(it => !it.head); if (m.i < 0) m.i = 0; m.render(); }
  listPreview(m.items[m.i]);
}
// the card beside it: where you stand, and what you need to know to choose
function listCard(w) {
  const rs = WC.listRungs(w), done = rs.filter(r => r.done).length, a = WC.ambitionOf(w), nx = WC.listNext(w);
  const st = WC.seriesStandings(w, w.player.series), cp = w.series[w.player.series].results.length ? st.findIndex(e => e.pid === 'P') + 1 : 0;
  const O = WC.seasonOutlook(w);
  const note = listStep === 'why' ? 'Nobody else reads it. It\'s taped above the desk so you see it every morning.'
    : listStep === 'amb' ? `The car is the <b>${ord(O.rank)} quickest of ${O.teams}</b> in the ${seriesName(w.player.series)}${O.last ? `, and you finished <b>P${O.last}</b> last year` : ''}. That's about <b>P${O.pos}</b>. Bolder targets pay more if you make them and cost more if you don't.`
    : nx ? `Next: <b>${nx.text}</b>.` : 'All of it. Every line.';
  return `<div class="panel-title">The list</div>
    <div class="ti-grid three">${cellW('Done', `${done}<small> OF ${rs.length}</small>`)}${cellW(String(w.year), a ? a.label.replace(/^Top /, 'TOP ') : '&mdash;')}${cellW('Championship', cp ? ord(cp) : '&mdash;')}</div>
    <p class="br-hint">${note}</p>`;
}
function listDesc(w) {
  const nx = WC.listNext(w), a = WC.ambitionOf(w);
  if (!WC.listOf(w).why) return 'Taped above the desk. Write down why you\'re doing this.';
  if (WC.ambitionDue(w)) return `Taped above the desk. Write down what you're going for in ${w.year}.`;
  return `Taped above the desk.${nx ? ` Next: <b>${nx.text}</b>.` : ''}${a ? ` ${w.year}: <b>${a.label.toLowerCase()}</b>.` : ''}`;
}

// the car needs work (the riskiest part), from the Workshop's numbers
function carNote(w) {
  const P = w.car && WC.carParts(w); if (!P || WC.failRisk(w) < 0.08) return '';
  const worst = WC.PART_KEYS.slice().sort((a, b) => P[a].cond - P[b].cond)[0];
  return `<p class="hub-note">The car needs work: <b>${WC.PARTS[worst].name.toLowerCase()} ${Math.round(P[worst].cond * 100)}%</b>. Worn parts can fail in a race (Team: the Car tab, on the computer).</p>`;
}
function tyreNote(w) {
  const short = tyreShort(w); if (!short) return '';
  const st = WC.stockOf(w);
  return `<p class="hub-note">Tyres in stock: ${WC.COMPOUNDS.filter(c => c !== 'dirt' || st.dirt || WC.tyreNeeds(w).dirt).map(c => `${st[c]} ${c}`).join(', ')}. <b>Order before the weekend</b>: trackside sets cost ${Math.round((WC.TRACKSIDE - 1) * 100)}% more.</p>`;
}
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
  wkUse = { trackside: 0, laps: 0, damage: 0, seen: null, carry: null };
  updateLogoShown();
  if (w.staff) { WC.managerRestock(w); WC.runPayroll(w); saveWorld(); }
  const base = calTrack(r);
  const track = cloneTrack(base); track.env.time = r.time; track.env.weather = r.weather;
  // (the forecast: does it come true this time, and when: race.js changes the weather then)
  const wx = WC.raceWx(w, r); if (wx) track.env.wxChange = true;
  // your team wears your livery
  const mine = w.teams[w.player.team], wc = worldCar(); mine.main = wc.main; mine.accent = wc.accent;
  const ent = WC.raceEntries(w);
  const clsCars = carsOfClass(WC.seriesById(sid).cls);
  for (const e of Object.values(ent.entries)) e.chassis = WC.seriesById(sid).cls === 'f1' ? 'custom' : WC.teamChassis(w, e.tid, clsCars.map(chassisKey));
  // race only: the grid in championship order after round 1 (pid -> slot)
  let gridOrder = null;
  if (w.round > 0 && w.opts.weekend === 'race') {
    const slotOf = Object.fromEntries(Object.entries(ent.entries).map(([slot, e]) => [e.pid, +slot]));
    gridOrder = WC.seriesStandings(w, sid).map(e => e.pid === 'P' ? 'P' : slotOf[e.pid]).filter(x => x !== undefined);
  }
  const cls = WC.seriesById(sid).cls;
  // your car: the one you bought (its condition costs a little power); a car of the wrong class (you've moved up and not
  // bought one yet) gets the car select instead
  const owned = w.car && !WC.needsCar(w) && CARS[carId(wc)]?.cls === cls;
  const car = CARS[carId(wc)]?.cls === cls ? wc : { ...wc, chassis: chassisKey(carsOfClass(cls)[0]) };
  // (its parts: condition and upgrades; and whether one of them lets go this race)
  const mods = owned ? { ...WC.carMods(w), pitTime: w.staff ? WC.staffEffects(w).pitTime : 0 } : null;
  const failure = owned ? WC.rollFailure(w) : null;
  const tgs = WC.dealsOf(w).map(d => `${WC.sponsorName(d.sid)}: ${WC.objText(w, WC.dealObjective(w, d)).toLowerCase()}`);
  if (w.coop && w.people[w.coop.pid]) tgs.unshift(`Targets: you top ${WC.driverTarget(w, 'P')}, ${w.people[w.coop.pid].first} top ${WC.driverTarget(w, w.coop.pid)} (${WC.money$(WC.targetBonus(w))} each)`);
  const brief = `<b>${seriesName(sid).toUpperCase()} &middot; ROUND ${w.round + 1} OF ${w.opts.len}</b>${tgs.length ? '<br>' + tgs.join('<br>') : ''}`;
  const race = { mode: 'race', laps: worldLaps(w, r), opponents: 11, brief, pick: !owned, onlyClass: cls,
    extra: { car, mods, failure, bop: WC.bopTable(w, carsOfClass(cls).map(chassisKey)), difficulty: w.opts.difficulty, grid: 'back', team: 'garage', engineer: WC.staffOf(w, 'engineer')?.skill ?? 0, wx, roster: ent.roster, entries: ent.entries, teamPace: ent.teamPace, gridOrder, aiChassis: 'class', playerName: w.player.name.split(' ').pop().toUpperCase(),
      trackData: WC.weekOf(w).trackData || null } };
  phone.hide();
  if (coopLive()) return w.opts.weekend === 'race' ? coopStartRace(track, race, ent) : coopStartSession(w.opts.weekend === 'full' ? 'practice' : 'quali', { track, race, ent }); // (co-op: the weekend online)
  if (w.opts.weekend !== 'race') return startWeekend(track, race, 'world', w.opts.weekend, [w.opts.pracLen, w.opts.qualiLen]);
  weekend = null;
  startRace(track, race, 'world');
}
// World Career: a part failed in the race. Fatal: the moment (bars close in, the car coasts, a panel says what broke),
// then you're out. Otherwise: a warning, and you carry on with a wounded car.
function carFailure(f) {
  if (wkUse) wkUse.failed = f.part;
  if (!f.fatal) { hud.center(`<b>${f.name.toUpperCase()}</b><small>${f.hurt}</small>`, 'warn', 3500); sfx.lap(); return; }
  sfx.lap();
  const el = $('failure');
  el.innerHTML = `<div class="fl-bar top"></div><div class="fl-bar bot"></div><div class="fl-card"><small>${f.name.toUpperCase()} FAILURE</small><b>${f.why}</b><span>Your race is over.</span></div>`;
  el.hidden = false; requestAnimationFrame(() => el.classList.add('on')); document.body.classList.add('cine');
  setTimeout(() => { document.body.classList.remove('cine'); if (!sim || raceReturn !== 'world') return; el.classList.remove('on'); setTimeout(() => { el.hidden = true; }, 400); worldEnd(true); }, 5200);
}
// Realistic damage: you crashed out (race.js wreckCar). The same moment as a failure, then you're out, classified DNF:
// a career round ends there; online and in a quick race you watch the results come in.
function crashOut(ev) {
  sfx.lap();
  const el = $('failure'), race = sim;
  el.innerHTML = `<div class="fl-bar top"></div><div class="fl-bar bot"></div><div class="fl-card"><small>${(ev.title || 'Crashed out').toUpperCase()}</small><b>${ev.why}</b><span>Your race is over.</span></div>`;
  el.hidden = false; requestAnimationFrame(() => el.classList.add('on')); document.body.classList.add('cine');
  const out = () => {
    if (!sim || sim !== race || !sim.player || sim.player.gone || sim.player.finished || (screen !== 'hud' && screen !== 's-pause')) return;
    if (screen === 's-pause') return setTimeout(out, 300); // (paused in the moment: once you're back)
    if (raceReturn === 'world') worldEnd(true);
    else if (raceReturn === 'career') careerRoundDone(true);
    else if (raceReturn === 'online') { sim.retire(); showNetResults(); }
    else if (raceReturn === 'coop') { sim.retire(); showCoopLive(); }
    else sim.retire(); // (the results follow: race.js sends them once the race is finished for you)
  };
  setTimeout(() => { document.body.classList.remove('cine'); el.classList.remove('on'); setTimeout(() => { el.hidden = true; }, 400); out(); }, 5200);
}
function worldRoundDone(retired = false) {
  const w = world; if (!w || !sim) return;
  let res = sim.results();
  if (retired) { const me = res.find(r => r.isPlayer); res = res.filter(r => !r.isPlayer).concat([{ ...me, gap: 'DNF', time: null, dnf: true }]); res.forEach((r, k) => r.pos = k + 1); }
  const sid = w.player.series, round = w.round, trackName = w.series[sid].cal[round].name;
  useSession();
  if (wkUse && wkUse.carry) WC.keepUsed(w, wkUse.carry); // (the race's last set goes on the shelf, for what it's worth)
  const mine = res.find(r => r.isPlayer) || {}, blamed = (sim.log || []).some(e => e.type === 'contact' && e.blame && e.a === 'P');
  const deals = WC.dealsOf(w).map(d => ({ name: WC.sponsorName(d.sid), obj: WC.objText(w, WC.dealObjective(w, d)) }));
  const goal = WC.storyGoal(w);
  const tg = w.coop && w.people[w.coop.pid] ? { P: WC.driverTarget(w, 'P'), C: WC.driverTarget(w, w.coop.pid) } : null; // (before the round's scored: set from the rounds before)
  let car2 = null;
  if (coop && coop.race) { coop.race.done = true; coop.race.wait = null;
    const u = coop.race.use; if (u && w.money) { let t = 0; for (const c of u.sets) if (!WC.takeSet(w, c)) t++; car2 = { trackside: t, laps: u.laps }; } }
  const out = WC.recordPlayerRound(w, res, sim.log || [], wkUse && w.money ? { trackside: wkUse.trackside, laps: wkUse.laps, damage: wkUse.damage, failed: wkUse.failed || null, aidPct: Math.max(0, sim.aidBonus ?? 0), grid: mine.grid ?? null, led: mine.led || 0, blamed, teamTrust: sim.trustDelta || 0, car2 } : null);
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
    ${tg ? coopTargetRows(w, scored, tg, 'P') : ''}
    ${out.bill ? deals.map(d => { const got = out.bill.items.some(([t]) => t.startsWith(d.name + ' bonus')); return `<div class="row"><span>${d.name}: ${d.obj.toLowerCase()}</span><span class="${got ? 'ok' : 'bad'}">${got ? 'MET' : 'MISSED'}</span></div>`; }).join('') : ''}
    ${goal ? (() => { const met = me && !me.dnf && scored.rows.filter(r => WC.teamOfPid(w, r.pid) === goal.tid).every(r => r.dnf || r.pos > me.pos); return `<div class="row"><span>${goal.text}</span><span class="${met ? 'ok' : 'bad'}">${met ? 'DONE' : 'NOT DONE'}</span></div>`; })() : ''}
    ${out.bill ? `<div class="row"><span>The weekend</span><span class="${out.bill.net < 0 ? 'bad' : 'ok'}">${out.bill.net > 0 ? '+' : ''}${WC.money$(out.bill.net)}</span></div><div class="row"><span>Bank balance</span><span class="${w.money.balance < 0 ? 'bad' : ''}">${WC.money$(w.money.balance)}</span></div>` : ''}
    ${WC.listFresh(w).filter(k => WC.RUNGS[k] && w.list.done[k]?.r >= round && w.list.done[k]?.y === w.year).map(k => `<div class="row"><span>Crossed off the list</span><span class="ok">${WC.RUNGS[k].text(w)}</span></div>`).join('')}
    ${n ? `<div class="row"><span>Phone</span><span>${n} new</span></div>` : ''}`;
  if (coop && coop.host && coop.peer && sim.net) coop.net.sendTo(coop.peer, { t: 'cround', round, tg, res: res.map(r => ({ ...slimRow(r), pid: r.isPlayer ? 'P' : r.pid || null })), net: out.bill ? out.bill.net : null, w });
  menus['s-round'][0].setItems([{ label: out.over ? 'Season Review' : 'Continue', cls: 'action primary', action: () => openHub() }]);
  show('s-round');
  if (me && !me.dnf && me.pos <= 3) sfx.finish();
}

// ---------------- the week: the hub's This Week menu, gigs (short drives) and test days ----------------
const GIG_LINE = { courier: 'GigGo', hearse: 'Restwell Funeral Home', rides: 'SV Track Days', attack: 'Club time attack', street: 'Street race' };
// today: one row that asks what to do with the day (left/right to choose, select to do it)
let dayPick = 'work';
const DAY_FULL = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };
function raceDesc(w) {
  const r = w.series[w.player.series].cal[w.round], g = WC.storyGoal(w);
  const pz = WC.finances(w)?.prize || [];
  return `Round ${w.round + 1}: ${r.gp ? `the ${WC.GP_NAME}, at ${r.name}` : r.name}, ${r.time}, ${r.weather}. ${coopLive() ? `With ${WC.coopPerson(w).first} in car two, online: ${{ full: 'practice, qualifying, then the race.', quali: 'qualifying, then the race.', race: 'straight to the race, the grid in championship order.' }[w.opts.weekend]}` : { full: 'Practice, qualifying, then the race.', quali: 'Qualifying, then the race.', race: 'Straight to the race: the grid is in championship order.' }[w.opts.weekend]}${pz.length ? ` Prize money a car: P1 ${WC.money$(pz[0])}, P3 ${WC.money$(pz[2])}, P5 ${WC.money$(pz[4])}, P10 ${WC.money$(pz[9])}.` : ''}${g ? `<br><b>${g.text}.</b>` : ''}`;
}
function dayChoices(w, canRace) {
  // { key, short (the list), tag (its number), head, desc, money, mcls, time, effect, vis (a picture), go (leaves the
  // planner), confirm (select twice), run (does it: { amt, line, note }) }
  const job = WC.dayJob(w), P = WC.carParts(w), wk = WC.weekOf(w), R = w.series[w.player.series].cal[w.round], $ = WC.money$;
  const worst = P ? WC.PART_KEYS.slice().sort((a, b) => P[a].cond - P[b].cond)[0] : null;
  const map = { type: 'map', label: `${R.name} · ${R.time}, ${R.weather}` };
  // jobs you've booked (by email, from GigGo): the day's already theirs; drive them when you like, before race day
  const booked = WC.bookedGigs(w).map(g => { const K = WC.GIG_KINDS[g.kind];
    return { key: 'bk' + g.id, icon: 'gig', short: K.tag, tag: 'Booked', head: `Drive: ${K.name}`, desc: gigDesc(g), money: g.pay ? `${g.kind === 'rides' ? `${$(g.pay)} a ride` : `Up to ${$(g.pay)}`}` : 'Prizes', mcls: 'gain',
      time: 'Booked: driving it uses the day', effect: 'You drive it now', go: true, goLabel: 'Drive it', run: () => startGig(g) }; });
  // days you said yes to by email: the same, done here
  const plans = WC.plansOf(w).map(p => ({ key: 'pl' + p.id, icon: p.fx === 'seat' ? 'mate' : p.fx === 'wedding' ? 'off' : 'work', short: p.tag, tag: 'Booked', head: p.what, mcls: p.pay ? 'gain' : '',
    desc: p.fx === 'press' ? 'Nadia from The Paddock Wire spends the day with the team. You said yes by email.' : p.fx === 'wedding' ? 'You said you\'d come.' : p.pay ? 'A day\'s coaching. You said yes by email.' : 'You said yes to it.',
    money: p.pay ? `+${$(p.pay)}` : 'Free', time: 'Booked: doing it uses the day', effect: p.fx === 'press' ? (p.given ? 'The piece runs this week' : '+2 reputation, the piece runs this week') : p.pay ? 'Pays' : 'You turn up',
    run: () => WC.doPlan(w, p.id) || { line: 'No days left' } }));
  // (every day left is spoken for: only what's booked)
  if (WC.freeDays(w) <= 0 && booked.length + plans.length) return [...booked, ...plans];
  const out = [...booked, ...plans, { key: 'work', short: 'Day job', tag: `+${$(job.pay)}`, mcls: 'gain', head: job.name, desc: `A day's pay for a day of your week.${job.sale ? ' Sell a car and there\'s commission on top.' : ''}`,
    money: `+${$(job.pay)}${job.sale ? '<small> + commission</small>' : ''}`, effect: 'Pays the bills',
    run: () => { const r = WC.workDay(w); return { amt: r.amt, line: job.name, note: r.note || '' }; } }];
  const gr = WC.gigRating(w);
  out.push({ key: 'gig', short: 'Find work', tag: 'GigGo', head: 'GigGo', desc: `Courier runs and funeral transport. ${gr < 4.2 ? 'Fewer jobs while your account is under review.' : 'Better paid than the day job.'} Taking one uses the day, and you drive it.`,
    money: 'Depends on the job', time: 'Uses the day, if you take one', effect: `Rating ${gr.toFixed(2)} &#9733;`, go: true, goLabel: 'Open GigGo', run: () => sitDown('giggo') });
  if (worst && P[worst].cond < 0.75) { const c = P[worst].cond, to = w.background === 'mechanic' ? 0.84 : 0.72;
    out.push({ key: 'fix', short: 'Rebuild', tag: `−${$(WC.selfCost(w, worst))}`, mcls: 'neg', head: `Rebuild the ${WC.PARTS[worst].name.toLowerCase()} yourself`,
      desc: `Parts only, and the day. ${w.background === 'mechanic' ? 'You know what you\'re doing.' : 'You\'re no mechanic, but you\'ll get it back to OK.'} A shop would charge ${$(WC.rebuildCost(w, worst))}.`,
      money: `−${$(WC.selfCost(w, worst))}`, mcls: 'neg', effect: `${WC.PARTS[worst].name} ${Math.round(c * 100)}% &rarr; about ${Math.round(to * 100)}%`,
      vis: { type: 'bar', label: WC.PARTS[worst].name, from: c, to: Math.max(c, to), text: `${Math.round(c * 100)}% → ~${Math.round(to * 100)}%` },
      run: () => { const was = P[worst].cond; WC.rebuildSelf(w, worst); return { amt: -WC.selfCost(w, worst), line: `Rebuilt the ${WC.PARTS[worst].name.toLowerCase()}`, note: `${Math.round(was * 100)}% &rarr; ${Math.round(P[worst].cond * 100)}%` }; } }); }
  // development: a day on a project under way (or, with none, the list of them on the computer)
  const proj = (w.projects || []).find(x => !x.done && !x.shop);
  if (proj) { const mr = WC.mechRate(w), mine = 1 + WC.facLevel(WC.myTeam(w), 'tools') * 0.25, pg = proj.prog || 0;
    out.push({ key: 'proj', short: 'Car work', tag: `${Math.round(pg / proj.days * 100)}%`, head: `Work on: ${proj.name}`, desc: `A day of yours adds ${mine.toFixed(2)} days of work${mr ? `; your mechanic adds ${(mr / WC.WEEK_DAYS).toFixed(1)} every day whatever you do` : '. Nobody else is working on it'}.`,
      money: 'Free', effect: `${pg.toFixed(1)} &rarr; ${Math.min(proj.days, pg + mine).toFixed(1)} of ${proj.days} days`,
      vis: { type: 'bar', label: proj.name, from: pg / proj.days, to: Math.min(1, (pg + mine) / proj.days), text: `${pg.toFixed(1)} → ${Math.min(proj.days, pg + mine).toFixed(1)} / ${proj.days}` },
      run: () => { WC.workOnProject(w, proj.id); return { line: proj.name, note: proj.done ? 'Finished.' : `${Math.min(proj.days, proj.prog || 0).toFixed(1)} of ${proj.days} days of work done` }; } }); }
  else if (WC.hasRaceCar(w)) out.push({ key: 'projs', short: 'Projects', tag: 'Computer', head: 'Start a project on the car', desc: 'Engine, chassis, aero, brakes, reliability: the list is on the computer (Team, Development).',
    money: 'Each has a price', time: 'Doesn\'t use the day', effect: 'Opens Development', go: true, goLabel: 'To the computer', run: () => sitDown('dev') });
  const car = WC.hasRaceCar(w);
  if (car && WC.facLevel(WC.myTeam(w), 'sim') && !wk.sim && !wk.tested) out.push({ key: 'sim', short: 'Sim rig', tag: 'Free', head: `Sim session: ${R.name}`, desc: 'Learn the circuit on the sim: some of the setup a test day would find, with no track hire, no fuel and no wear.',
    money: 'Free', effect: 'Some setup for this weekend', vis: map, run: () => { WC.simDay(w); return { line: `Sim session: ${R.name}`, note: 'Some of the setup found.' }; } });
  // sponsors' events: one each, on or before its day (they stack; each is a day)
  for (const e of WC.openEvents(w)) {
    // (an investor's dinner: a day; their question comes by email after)
    if (e.inv) { const I = WC.investorOf(w), day = WC.DAY_NAMES[e.by], today = wk.used === e.by;
      out.push({ key: 'din', short: 'Dinner', tag: today ? 'Today' : `By ${day}`, head: e.what, desc: `${today ? 'It\'s tonight.' : `On ${day}.`} ${I.name[0]} wants to get to know you before putting money in. A no-show is remembered.`,
        money: 'Free', effect: 'A question by email after: answer it well', run: () => { const ok = WC.attendEvent(w, e.id); return { line: e.what, note: ok ? `${I.name[0]} picked the wine. It was expensive, and ${I.name[0]} let you know.` : 'No days left.' }; } });
      continue; }
    const sp = WC.sponsorInfo(e.sid), day = WC.DAY_NAMES[e.by], today = wk.used === e.by;
    // (hospitality: part of the deal, every week)
    if (e.hosp) { out.push({ key: 'ev' + e.id, short: sp.name, tag: today ? 'Today' : `By ${day}`, head: `${sp.name}: ${e.what}`, desc: `Part of the deal: their clients, one day every week, by ${day}. Miss it and it counts as a missed target.`,
      money: 'Free', effect: 'Keeps the deal sweet', run: () => { const ok = WC.attendEvent(w, e.id); return { line: `${sp.name}: ${e.what}`, note: ok ? 'One of them asked if the car was real. Another asked if you were.' : 'No days left.' }; } }); continue; }
    out.push({ key: 'ev' + e.id, short: sp.name, tag: today ? 'Today' : `By ${day}`, head: `${sp.name}: ${e.what}`, desc: `${today ? 'It\'s today.' : `On ${day}: go any day up to then.`} They remember who turns up. ${e.rsvp === 'yes' ? 'You said you\'d be there: not turning up costs double.' : 'Not answering and not going counts as a missed target.'}`,
      money: 'Free', effect: '+2 reputation, a missed target forgiven', run: () => { const ok = WC.attendEvent(w, e.id); return { line: `${sp.name}: ${e.what}`, note: ok ? 'Photos with customers. One of them was quite famous, apparently.' : 'No days left.' }; } });
  }
  if (car && !wk.tested) out.push({ key: 'test', short: 'Test day', tag: `−${$(WC.testCost(w))}`, mcls: 'neg', head: `Test day at ${R.name}`, desc: 'Track hire, plus fuel and wear. Do five laps or more and you find a setup: a little more grip there this weekend. Pause to end the day.',
    money: `−${$(WC.testCost(w))} + wear`, mcls: 'neg', effect: 'More grip this weekend', vis: map, go: true, goLabel: 'Book it', confirm: 'Book it? Select again', run: () => startTestDay() });
  // a day with your teammate: the week's ideas, side by side in the pane
  { const m = WC.mateOf(w), p = m && w.people[m.pid], ideas = WC.mateIdeas(w).map((x, i) => ({ ...WC.mateIdeaInfo(w, x), i })).filter(x => x.name && !x.done);
    if (p && ideas.length) out.push({ key: 'mate', icon: 'mate', short: `With ${p.first}`, tag: `${ideas.length} idea${ideas.length === 1 ? '' : 's'}`,
      subs: ideas.map(I => ({ pick: I.short, price: I.cost ? `−${$(I.cost)}` : 'Free', mcls: I.cost ? 'neg' : '', star: I.likes ? `${p.first}'s kind of thing` : '',
        head: I.name, desc: I.desc, money: I.cost ? `−${$(I.cost)}` : 'Free', effect: I.does,
        run: () => { const r = WC.mateDay(w, I.i); return r ? { amt: r.amt, line: r.line, note: r.note } : { line: 'No days left' }; } })) }); }
  out.push(...togetherChoices(w, 'P'));
  out.push({ key: 'off', short: 'Day off', tag: '', head: 'A day off', desc: 'Nothing. It\'s allowed.', money: 'Free', effect: 'Nothing', run: () => { WC.spendDay(w, 'A day off', 'Day off'); return { line: 'A day off', note: 'You slept in. The car didn\'t fix itself.' }; } });
  if (canRace) { const left = WC.daysLeft(w); out.push({ key: 'race', short: 'Race day', tag: `Round ${w.round + 1}`, head: `Go to race day: round ${w.round + 1}`, desc: raceDesc(w),
    money: 'Prize money', time: `Skips ${left} day${left === 1 ? '' : 's'}`, effect: `${R.name}`, vis: map, go: true, goLabel: 'Go racing', confirm: 'Race now? Select again', run: () => startWorldRound() }); }
  return out;
}
// days together (co-op): what the other's asked for, to say yes to; or asking them (it waits in their planner)
function togetherChoices(w, me) {
  if (!w.coop || !(coopGuest() || coopLive())) return [];
  const $ = WC.money$, wk = WC.coopWeek(w), other = me === 'P' ? WC.coopPerson(w).first : w.player.name.split(' ')[0], out = [];
  const cost = (k) => k === 'garage' ? `−${$(WC.coopCarCost(w))}` : 'Free';
  const otherLeft = me === 'P' ? wk.left : WC.daysLeft(w);
  if (wk.ask && wk.ask.from !== me) { const T = WC.COOP_TOGETHER[wk.ask.what];
    out.push({ key: 'yes', icon: 'mate', short: T.short, tag: `${other} asks`, head: `${T.name}?`, desc: `${other} asked. Say yes and it's a day from each of you: you do it together.${otherLeft <= 0 ? ` (${other} has no days left now.)` : ''}`,
      money: cost(wk.ask.what), mcls: wk.ask.what === 'garage' ? 'neg' : '', effect: T.does, run: () => WC.coopTogether(w, me) || { line: `${other} has no days left` } }); }
  else if (wk.ask) { const T = WC.COOP_TOGETHER[wk.ask.what];
    out.push({ key: 'asked', icon: 'mate', short: `Asked ${other}`, tag: T.short, head: `Waiting for ${other}`, desc: `You asked ${other}: ${T.name.toLowerCase()}. It's in their day planner; when they say yes, it's a day from each of you.`,
      money: cost(wk.ask.what), effect: T.does, time: 'Doesn\'t use the day', go: true, goLabel: 'Take it back', run: () => { WC.coopCancelAsk(w); saveWorld(); toast(`You took it back.`); } }); }
  else for (const [k, T] of Object.entries(WC.COOP_TOGETHER)) out.push({ key: 'ask' + k, icon: 'mate', short: `With ${other}`, tag: T.short, head: `Ask ${other}: ${T.name.toLowerCase()}`,
    desc: `It goes to ${other}'s day planner. When they say yes it's a day from each of you, done together.`, money: cost(k), mcls: k === 'garage' ? 'neg' : '', effect: T.does, time: 'Doesn\'t use the day until they say yes',
    go: true, goLabel: `Ask ${other}`, run: () => { WC.coopAsk(w, k, me); saveWorld(); toast(`Asked <b>${other}</b>: ${T.name.toLowerCase()}.`); } });
  return out;
}
// the co-owner's day planner: their job, their car, development, SVList, a day off, and days together
function coopDayChoices(w) {
  const $ = WC.money$, j = WC.coopJob(w), host = w.player.name.split(' ')[0], c2 = WC.car2Of(w), x = (w.projects || []).find(p => !p.done && !p.shop), out = [];
  const day = (key) => () => WC.coopDay(w, key) || { line: 'Not today' };
  out.push(...togetherChoices(w, 'C').filter(o => o.key === 'yes'));
  out.push({ key: 'work', short: 'Work', tag: `+${$(j.pay)}`, mcls: 'gain', head: j.name, desc: `Your pay goes in the team account.${w.coop.boss ? ` ${w.coop.boss} sponsors you: turn up for at least one shift a week, or they pay the team half.` : ''}`,
    money: `+${$(j.pay)}`, effect: w.coop.boss ? 'Pays, and keeps your boss sweet' : 'Pays the team', run: day('work') });
  if (c2 && ['match', 'old'].includes(c2.kind) && c2.cond < 0.99) out.push({ key: 'fix', short: 'Your car', tag: `−${$(WC.coopCarCost(w))}`, mcls: 'neg', head: 'Work on your car', desc: 'Parts from the team account, and your day. Car two gets better for the weekend.',
    money: `−${$(WC.coopCarCost(w))}`, mcls: 'neg', effect: `Car two ${Math.round(c2.cond * 100)}% &rarr; ${Math.round(Math.min(1, c2.cond + 0.15) * 100)}%`,
    vis: { type: 'bar', label: 'Car two', from: c2.cond, to: Math.min(1, c2.cond + 0.15), text: `${Math.round(c2.cond * 100)}% → ${Math.round(Math.min(1, c2.cond + 0.15) * 100)}%` }, run: day('car') });
  else if (c2 && !['match', 'old'].includes(c2.kind)) out.push({ key: 'buy', icon: 'fix', short: 'Your car', tag: 'Computer', head: 'Buy your own car', desc: `You race a ${c2.kind === 'lease' ? 'leased' : 'hire'} car. Buy one on the computer (Team, Drivers: car two), and then you can work on it yourself.`,
    money: 'On the computer', time: 'Doesn\'t use the day', effect: 'Opens the computer', go: true, goLabel: 'To the computer', run: () => sitDown('drivers') });
  if (x) { const pg = x.prog || 0, add = 1 + WC.facLevel(WC.myTeam(w), 'tools') * 0.25;
    out.push({ key: 'proj', short: 'Car work', tag: `${Math.round(pg / x.days * 100)}%`, head: `Work on: ${x.name}`, desc: 'A day on the team\'s development project.', money: 'Free', effect: `${pg.toFixed(1)} &rarr; ${Math.min(x.days, pg + add).toFixed(1)} of ${x.days} days`,
      vis: { type: 'bar', label: x.name, from: pg / x.days, to: Math.min(1, (pg + add) / x.days), text: `${pg.toFixed(1)} → ${Math.min(x.days, pg + add).toFixed(1)} / ${x.days}` }, run: day('proj') }); }
  { const gr = WC.gigRating(w); out.push({ key: 'gig', short: 'Find work', tag: 'GigGo', head: 'GigGo', desc: `Courier runs, funeral transport, track-day rides, a time attack, the odd street race (in your car). ${gr < 4.2 ? 'Fewer jobs while the account is under review.' : 'Usually better paid than a shift.'} The pay goes in the team account; taking one uses the day, and you drive it.`,
    money: 'Depends on the job', time: 'Uses the day, if you take one', effect: `Rating ${gr.toFixed(2)} &#9733;`, go: true, goLabel: 'Open GigGo', run: () => sitDown('giggo') }); }
  if ((w.usedParts || []).some(p => !p.scouted)) out.push({ key: 'scout', icon: 'gig', short: 'SVList', tag: 'Haggle', head: 'Go through SVList', desc: 'Ring round the sellers of the used parts and talk one of them down. Buy it on the computer after.',
    money: 'Free', effect: 'The dearest part, about 30% off', run: day('scout') });
  out.push(...togetherChoices(w, 'C').filter(o => o.key !== 'yes'));
  out.push({ key: 'off', short: 'Day off', tag: '', head: 'A day off', desc: 'Nothing. It\'s allowed.', money: 'Free', effect: 'Nothing', run: day('off') });
  return out;
}
function dayItem(w, canRace) {
  const ch = dayChoices(w, canRace), wk = WC.weekOf(w), left = WC.daysLeft(w);
  if (!ch.some(c => c.key === dayPick)) dayPick = ch[0].key;
  return { label: `Plan ${DAY_FULL[WC.DAY_NAMES[wk.used]] || 'Today'}<small>${left} DAY${left === 1 ? '' : 'S'} LEFT</small>`, cls: 'action primary day', action: () => openDayPlan(canRace),
    // (one line: the sponsors' events counted as one, however many there are)
    desc: `<span class="dh">How you spend the day</span>${(() => { const ev = ch.filter(c => c.key.startsWith('ev')), rest = ch.filter(c => !c.key.startsWith('ev'));
      const parts = rest.map(c => `${c.short}${c.tag ? ` <span class="dk">${c.tag}</span>` : ''}`);
      if (ev.length) parts.splice(Math.min(4, parts.length), 0, `Sponsor event${ev.length > 1 ? `s <span class="dk">${ev.length}</span>` : ` <span class="dk">${ev[0].tag}</span>`}`);
      return parts.join(' &middot; '); })()}` };
}
// no race car (sold, burned, or the wrong class after moving up): where to get one
function getCarItem(w) {
  const sid = w.player.series, street = WC.seriesById(sid).car === 'classifieds';
  return street ? { label: 'Buy A Car', action: () => sitDown('classifieds'), desc: `No race car. Danny's SVList listings are on the computer (cheapest ${WC.money$(Math.min(...(w.ads || []).map(a => a.price), Infinity))}). Until then you can work the week and sit rounds out.` }
    : { label: 'Get A Car', action: () => sitDown('customer'), desc: `${w.car ? `Your ${w.car.name} isn't eligible for the ${seriesName(sid)}.` : 'No race car.'} Buy or lease one from the makers' customer programmes, or buy a team's car from last season (on the computer). Until then you can work the week and sit rounds out.` };
}
// sitting a round out: what it saves and what it costs, before you choose
function sitOutItem(w, only) {
  const r = w.series[w.player.series].cal[w.round], q = WC.sitOutSaves(w), $ = WC.money$, last = WC.satOut(w) >= WC.sitMax(w);
  // (past what the series allows, it's the end of the team: said on the item itself)
  if (last) return { label: `Sit Out: End The Team`, cls: only ? 'action primary' : '', confirm: 'This ends the team. Select again', action: () => sitOutRound(),
    desc: `You've missed the ${WC.sitMax(w)} round${WC.sitMax(w) === 1 ? '' : 's'} the ${seriesName(w.player.series)} allows a season. Miss this one and it withdraws your entry: the team is finished.` };
  return { label: `Sit Out Round ${w.round + 1}<small>SAVES ${$(q.saves)}</small>`, cls: only ? 'action primary' : '', confirm: 'Sit it out? Select again', action: () => sitOutRound(),
    desc: `${only ? 'No race car. ' : ''}Saves <b>${$(q.saves)}</b> (entry, travel, crew, fuel).${q.loses ? ` Sponsors pay nothing (<b>&minus;${$(q.loses)}</b>) and count a miss.` : ''} No points. Rent, payroll and loans still go out.` };
}
function sitOutRound() {
  const w = world, sid = w.player.series, out = WC.sitOut(w); if (!out) return;
  saveWorld();
  const res = w.series[sid].results.find(x => x.round === out.round), R = w.series[sid].cal[out.round];
  $('round-title').textContent = 'Did Not Start';
  $('round-sub').textContent = `${seriesName(sid)} · round ${out.round + 1} of ${w.opts.len} · ${R.name}`;
  $('round-table').innerHTML = `<tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th class="r">PTS</th></tr>` + (res ? res.rows.slice().sort((a, b) => a.pos - b.pos) : []).map(r => {
    const t = w.teams[WC.teamOfPid(w, r.pid)] || {};
    return `<tr><td class="p">${posBadge(r.pos)}</td><td><span class="swatch" style="background:${hex(t.main ?? 0x888888)}"></span>${WC.displayName(w, r.pid, true)}</td><td>${t.name || ''}</td><td class="n">${r.pts ? '+' + r.pts : ''}</td></tr>`;
  }).join('');
  const st = WC.seriesStandings(w, sid), cp = st.findIndex(e => e.pid === 'P') + 1, n = WC.unread(w);
  $('round-info').innerHTML = `<div class="big-pos">DNS<small>DID NOT START</small></div>
    <div class="row"><span>Championship</span><span>${cp ? `${ord(cp)} &middot; ${st[cp - 1].pts} pts` : '&mdash;'}</span></div>
    <div class="row"><span>The weekend</span><span class="${out.bill.net < 0 ? 'bad' : 'ok'}">${out.bill.net > 0 ? '+' : ''}${WC.money$(out.bill.net)}</span></div>
    <div class="row"><span>Bank balance</span><span class="${w.money.balance < 0 ? 'bad' : ''}">${WC.money$(w.money.balance)}</span></div>
    ${n ? `<div class="row"><span>Phone</span><span>${n} new</span></div>` : ''}`;
  menus['s-round'][0].setItems([{ label: out.over ? 'Season Review' : 'Continue', cls: 'action primary', action: () => openHub() }]);
  fadeTo(() => show('s-round'), 200);
}
// the day planner: game UI over the garage (js/dayplan.js)
let dayRace = true;
// whose week the planner and the strip show: yours, or the co-owner's own
const myWeek = (w) => coopGuest() ? WC.coopWeek(w) : { used: WC.weekOf(w).used, log: WC.weekOf(w).log, left: WC.daysLeft(w), booked: WC.bookedDays(w) };
const dayPlan = new DayPlan($('dayplan'), {
  world: () => world,
  week: (w) => coopGuest() ? WC.coopWeek(w) : null,
  choices: () => coopGuest() ? coopDayChoices(world) : dayChoices(world, dayRace),
  pick: (k) => { dayPick = k; renderHints(); },
  sfx: (k) => sfx[k] && sfx[k](),
  save: () => saveWorld(),
  map: (cv) => { const R = world.series[world.player.series].cal[world.round], tr = findCalTrack(R.name); if (tr) drawTrackMap(hubTrackT(tr), cv); },
  closed: () => { wkStamp = myWeek(world).used - 1; $('s-hub').classList.remove('planning'); renderHub(); renderHints(); hubEnter(); },
  leave: (o) => { dayPick = o.key; $('s-hub').classList.remove('planning'); renderHub(); renderHints(); setTimeout(() => o.run(), 120); },
});
function openDayPlan(canRace) {
  if (!world || dayPlan.isOpen || myWeek(world).left <= 0) return;
  dayRace = canRace; phone.close(); phone.hide(); $('s-hub').classList.add('planning'); sfx.select();
  dayPlan.open(dayPick); renderHints();
}
function dayInput() {
  if (!dayPlan.isOpen) return false;
  const up = pressed('ArrowUp') | pressed('KeyW') | pressed('GP12') | pressed('GPSU'), down = pressed('ArrowDown') | pressed('KeyS') | pressed('GP13') | pressed('GPSD');
  const ok = pressed('Enter') | pressed('Space') | pressed('GP0') | pressed('GP9'), back = pressed('Escape') | pressed('Backspace') | pressed('GP1');
  const left = pressed('ArrowLeft') | pressed('KeyA') | pressed('GP14') | pressed('GPSL'), right = pressed('ArrowRight') | pressed('KeyD') | pressed('GP15') | pressed('GPSR');
  dayPlan.input({ up, down, left, right, ok, back });
  return true;
}
// the next round somewhere else: another circuit from the career's pool (not already on this season's calendar, if
// there is one), the round's conditions kept, its forecast made afresh
function swapNextCircuit() {
  const w = world, S = w.series[w.player.series], R = S.cal[w.round]; if (!R) return;
  const on = new Set(S.cal.map(r => r.name)), all = worldPool().filter(t => t.name !== R.name), fresh = all.filter(t => !on.has(t.name));
  const list = fresh.length ? fresh : all, t = list[Math.floor(Math.random() * list.length)];
  if (!t) { toast('There\'s no other circuit in your career\'s list. Add some in Circuits.', 4000); sfx.error(); return; }
  const was = R.name;
  R.name = t.name; R.theme = t.env?.theme || R.theme; R.surface = t.env?.surface === 'dirt' ? 'dirt' : 'tarmac'; delete R.fc;
  saveWorld(); sfx.best(); toast(`Round ${w.round + 1}: ${t.name} instead of ${was}.`, 4000); renderHub(); renderOptMenu();
}
// the co-owner's hub: the computer, the phone and the car like the host's (what's theirs to change: coopOps); race day
// is the host's to start, so theirs is being ready for it
function renderGuestMenu() {
  const w = world, n = WC.unread(w), nm = WC.unreadMail(w), host = w.player.name.split(' ')[0], R = !w.over && w.series[w.player.series].cal[w.round], m = menus['s-hub'][0];
  if (optSub) {
    m.setItems([{ label: 'Career Options', head: true },
      { label: 'Pit Wall Calls', values: [['on', 'On'], ['off', 'Off']], get: () => settings.pitWall || 'on', set: v => { settings.pitWall = v; saveSettings(); }, desc: 'Your engineer asks you on the radio when there\'s a call to make. Answer with <b>X / B</b> (or <b>1 / 2</b>).' },
      { label: 'Leave The Career', confirm: 'Leave? Select again', action: () => { optSub = false; pitGarage.close(); leaveOnline(); }, desc: `Back to the main menu. The career lives on ${host}'s computer: join again with their room code any time.` },
      { label: 'Back', action: () => { optSub = false; sfx.back(); renderHubMenu(); }, desc: 'Back to the garage.' }], true);
    return;
  }
  const keep = m.items[m.i]?.label?.replace(/<small>.*$/, '');
  const wk = WC.coopWeek(w), ask = wk.ask && wk.ask.from === 'P' ? WC.COOP_TOGETHER[wk.ask.what] : null;
  const items = [
    ...(R && wk.left > 0 ? [{ label: `Plan ${DAY_FULL[WC.DAY_NAMES[wk.used]] || 'Today'}<small>${ask ? `${host.toUpperCase()} ASKS` : `${wk.left} DAY${wk.left === 1 ? '' : 'S'} LEFT`}</small>`, cls: 'action primary day', action: () => openDayPlan(false),
      desc: `<span class="dh">How you spend the day</span>${coopDayChoices(w).map(c => `${c.short}${c.tag ? ` <span class="dk">${c.tag}</span>` : ''}`).join(' &middot; ')}` }] : []),
    R ? { label: `Round ${w.round + 1}: Race Day`, cls: wk.left > 0 ? '' : 'action primary', values: [[true, 'READY'], [false, 'NOT READY']], get: () => !!coop.ready, set: v => { coop.ready = v; net.send({ t: 'ready', ready: v }); renderHub(); },
      desc: `${R.name}, ${R.time}, ${R.weather}. ${host} starts race day from their garage and you're on the grid when they do: straight to the race. Tell them you're ready.` }
      : { label: `${w.year} Season Complete`, disabled: true, desc: `${host} starts next season.` },
    { label: `Computer${nm ? `<small>${nm} NEW</small>` : ''}`, action: () => sitDown(), desc: `The team's computer: Mail, Team (the cars, tyres, staff, data) and the Internet. Your car's upgrades, development and tyres are yours to buy; the rest of the business is ${host}'s.` },
    { label: `Phone${n ? `<small>${n} NEW</small>` : ''}`, action: () => { phone.open(); renderHints(); }, desc: 'The team\'s texts.' },
    ...(w.car ? [{ label: 'Look At The Car', action: () => goToCar(), desc: `The race car's parts and their condition. Rebuilds and new parts are ${host}'s call.` }] : []),
    { label: 'Career Options', action: () => { optSub = true; sfx.select(); renderHubMenu(); }, desc: 'Pit wall calls, and leaving the career.' },
  ];
  m.setItems(items, true);
  const k = items.findIndex(it => it.label.replace(/<small>.*$/, '') === keep); if (k >= 0) { m.i = k; m.render(); }
}
// Career Options: the co-op room (open it, its code, close it)
function coopItems(w) {
  if (!coopOk(w)) return [];
  const C = WC.coopPerson(w), who = C ? C.first : 'your friend';
  if (!coop) return [{ label: `${C ? `Invite ${C.first}` : 'Invite A Friend'}<small>CO-OP</small>`, action: () => coopHost(),
    desc: C ? `Open a room so ${C.first} can join: they drive car two and own ${w.coop.stake}% of the team. Race day becomes an online race for the two of you.`
      : 'Open a room and send the code to a friend. They buy into the team, own a share of it and drive your second car (your teammate makes way). Race day becomes an online race for the two of you.' }];
  return [
    { label: `Co-op Room<small>${coop.code}</small>`, action: () => { navigator.clipboard?.writeText(coop.code).then(() => toast('Room code <b>' + coop.code + '</b> copied'), () => toast('Room code: <b>' + coop.code + '</b>')); },
      desc: coop.peer ? `${C ? C.first : coop.name} is here${coop.ready ? ' and ready for race day' : ''}. Race day starts the race for both of you, straight to the race.` : `Waiting for ${who}: they pick <b>Online › Join Game</b> and type <b>${coop.code}</b>. Select to copy the code.` },
    { label: 'Close Co-op Room', confirm: 'Close it? Select again', action: () => { coopEnd(); sfx.back(); renderHub(); renderOptMenu(); }, desc: `${coop.peer ? `${C ? C.first : coop.name} goes back to their menu. ` : ''}Their car is raced for them until they're back.` },
  ];
}
// Career Options: difficulty, aids, the test button
function renderOptMenu() {
  const w = world, items = [{ label: 'Career Options', head: true },
    { label: 'Difficulty', values: Object.entries(DIFF_LABEL), get: () => w.opts.difficulty, set: v => { w.opts.difficulty = v; saveWorld(); renderHub(); },
      desc: 'The pace of the field from the next race. Pick one you can\'t win at yet: upgrades and a better car are how you catch them. Above <b>Legend</b> the AI cars get extra grip and power.' },
    presetItem(' Set each aid in Options > Aids.'),
    // the weekend: from the next round (co-op races are race-only for now: online qualifying isn't in yet)
    { label: 'Weekend', values: WEEKEND_VALS, get: () => w.opts.weekend, set: v => { w.opts.weekend = v; saveWorld(); renderHub(); renderOptMenu(); },
      desc: WEEKEND_DESC + ` From the next round.${w.coop ? ' <b>Co-op</b>: with your co-owner here the sessions are online, both of you on track at once against the same clock.' : ''}` },
    ...(w.opts.weekend === 'full' ? [{ label: 'Practice', values: PRAC_VALS, get: () => w.opts.pracLen, set: v => { w.opts.pracLen = v; saveWorld(); }, desc: PRAC_DESC }] : []),
    ...(w.opts.weekend !== 'race' ? [{ label: 'Qualifying', values: QUALI_VALS, get: () => w.opts.qualiLen, set: v => { w.opts.qualiLen = v; saveWorld(); }, desc: QUALI_DESC }] : []),
    { label: 'Pit Wall Calls', values: [['on', 'On'], ['off', 'Off']], get: () => settings.pitWall || 'on', set: v => { settings.pitWall = v; saveSettings(); }, desc: 'Your engineer asks you on the radio when there\'s a call to make: undercut, cover, a cheap stop under the VSC, your teammate. Answer with <b>X / B</b> (or <b>1 / 2</b>); if you don\'t, their pick happens. Off: they make the pit calls and tell you.' },
    // circuits: before a season's first race (this season's calendars are drawn again), or at the end of one (next season's)
    ...(() => { const fresh = !w.over && w.round === 0 && !w.series[w.player.series].results.length, n = worldPool().length;
      return fresh || w.over ? [{ label: `Circuits<small>${n} CHOSEN</small>`, action: () => openTrackPick(w.opts, 's-hub', () => { if (fresh) WC.newCalendars(w, worldPool()); saveWorld(); renderHub(); }),
        desc: `The circuits your calendars use: ${n} chosen. ${fresh ? 'This season\'s calendars are drawn again from them.' : 'Next season\'s calendars are drawn from them.'}` }]
        : [{ label: `Circuits<small>${n} CHOSEN</small>`, disabled: true, desc: 'You can change the circuits before a season\'s first race, or once it\'s over.' }]; })(),
    ...(!w.over && w.series[w.player.series].cal[w.round] ? [{ label: `Swap Next Circuit<small>${w.series[w.player.series].cal[w.round].name.toUpperCase()}</small>`, confirm: 'Swap it? Select again', action: () => swapNextCircuit(),
      desc: `Round ${w.round + 1}'s circuit, ${w.series[w.player.series].cal[w.round].name}, swapped for another from your circuits that isn't on this season's calendar. Same time of day and weather; your week so far stays (a sim session's setup too).` }] : []),
    ...(!w.over ? [{ label: 'Sim Rest Of Season', confirm: 'Simulate it all? Select again', action: () => simWorldSeason(), desc: 'For testing: simulates every remaining round, your races too (you as a mid-field driver).' }] : []),
    ...coopItems(w),
    { label: 'Save & Quit', action: () => { optSub = false; saveWorld(); pitGarage.close(); quitToMenu(); }, desc: `Your career is saved. Continue it from the main menu.${coop ? ' The co-op room closes.' : ''}` },
    { label: 'Back', action: () => { optSub = false; sfx.back(); renderHubMenu(); }, desc: 'Back to the garage.' }];
  const m = menus['s-hub'][0]; m.setItems(items, true);
  if (m.i >= items.length || items[m.i]?.head) { m.i = 1; m.render(); }
}
function gigDesc(g) {
  const open = gigTrack(g)?.open, laps = open ? 1 : g.laps;
  if (g.kind === 'courier') return `${g.client}: ${g.what}. ${open ? 'Across town' : `${laps} lap${laps === 1 ? '' : 's'} of town`} in GigGo's van.${g.fragile ? ' Fragile: damage comes off the fare.' : ''}${g.urgent ? ' Urgent: the time is tight.' : ''} Fare ${WC.money$(g.pay)}, before GigGo's fee.`;
  if (g.kind === 'hearse') return `${g.client}. Arrive inside the time window and drive smoothly: the family is following. ${WC.money$(g.pay)}, before GigGo's fee.`;
  if (g.kind === 'rides') return `Three laps in your race car, a passenger each lap: ${g.riders.join('; ')}. Each has their own idea of a good ride: keep their excitement in it. Too tame and they're bored; too wild and they're scared, then sick. ${WC.money$(g.pay)} a ride, tips for a lap they enjoyed, nothing if they're sick. All three happy: reputation too.`;
  if (g.kind === 'attack') return `Three laps in your race car; your best lap counts. Gold ${WC.money$(g.prizes[0])}, silver ${WC.money$(g.prizes[1])}, bronze ${WC.money$(g.prizes[2])}.`;
  return `${g.client}, one on one, two laps, at night. ${WC.money$(g.pay)} if you win; half of it if you lose. The police sometimes come.`;
}
// a gig's place: a circuit like the town (the street race: the city at night)
function gigTrack(g) {
  // (rides and time attacks are laps: circuits only)
  const pool = worldPool().filter(t => !(t.open && (g.kind === 'rides' || g.kind === 'attack'))), same = pool.filter(t => t.env.theme === g.theme), list = same.length ? same : pool;
  return list[(parseInt(g.id.slice(1), 10) || 0) % list.length];
}
function startGig(g) {
  const w = world, K = WC.GIG_KINDS[g.kind], base = gigTrack(g); if (!base) return;
  const track = cloneTrack(base); track.env.time = g.night ? 'night' : 'day'; track.env.weather = 'clear';
  const guest = coopGuest(), mine = guest ? coopCar() : worldCar(); // (co-op: the co-owner drives car two)
  const car = K.van ? { ...mine, chassis: K.van } : mine, mods = K.van ? null : WC.carMods(w, guest ? 'mate' : 'me');
  const brief = `<b>${GIG_LINE[g.kind].toUpperCase()}</b><br>${gigDesc(g)}`;
  const race = { mode: 'race', laps: g.laps, opponents: g.kind === 'street' ? 1 : 0, brief, pick: false,
    extra: { car, mods, strategy: false, difficulty: w.opts.difficulty, grid: g.kind === 'street' ? 'random' : 'front', aiChassis: 'class', playerName: (guest ? WC.coopPerson(w).last : w.player.name.split(' ').pop()).toUpperCase() } };
  gig = { g, spec: CARS[carId(car)].spec, t: 0, ref: null, comfort: 100, fun: 30, sick: 0, tIn: 0, tLo: 0, tHi: 0, lapRides: [], dmg: 0, lat: 0, lon: 0 };
  phone.hide(); document.body.classList.add('gig-on');
  startRace(track, race, 'gig');
}
// a clean lap for this car here: the AI's corner speeds, with the car's own acceleration between them (a van gets
// nowhere near the corner limits on the straights), in seconds
function refLap() {
  const T = sim.T, V = sim.player.lineV || sim.lineV, sp = gig.spec; if (!V) return null;
  // (point-to-point: start to the finish line, not the run-off and the road back)
  const N = T.N, n = T.open ? T.finish : N, v = new Float64Array(N), ds = (i) => { const j = (i + 1) % N; return Math.hypot(T.X[j] - T.X[i], T.Z[j] - T.Z[i]); };
  v[0] = T.open ? 0 : V[0];
  for (let pass = 0; pass < (T.open ? 1 : 2); pass++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % N, u = Math.max(3, v[i]), a = (Math.min(sp.maxForce || 12000, sp.power / u) - (sp.drag || 0.4) * u * u) / sp.mass;
    v[j] = Math.min(V[j], Math.sqrt(Math.max(0, v[i] * v[i] + 2 * Math.max(0, a) * ds(i))));
  }
  let t = 0; for (let i = 0; i < n; i++) t += ds(i) / Math.max(3, (v[i] + v[(i + 1) % N]) / 2);
  return t;
}
function gigTick(dt) {
  if (!gig || !sim || !sim.player || raceReturn !== 'gig') return;
  const pl = sim.player, ph = pl.phys, g = gig.g;
  if (gig.ref == null) { gig.ref = refLap(); if (g.kind === 'rides') rideScale(); }
  if (sim.state === 'racing' && !pl.finished && dt > 0 && !sim.paused) {
    gig.t += dt;
    const a = 1 - Math.exp(-dt / 0.2);
    gig.lat += ((ph.latG || 0) - gig.lat) * a; gig.lon += ((ph.lonG || 0) - gig.lon) * a;
    // the family, following: firm braking (past ~0.45 g) and fast corners (past ~0.55 g) upset them, in proportion. The
    // window asks for 60-77% of the car's pace, which corners at about 0.4-0.55 g: driven smoothly, that costs nothing;
    // driven like a race (1 g+ corners, hard braking) the meter is gone in a couple of corners
    if (g.kind === 'hearse') { const hurt = (Math.max(0, Math.abs(gig.lon) - 0.45) + Math.max(0, Math.abs(gig.lat) - 0.55)) * dt * 18; gig.comfort = Math.max(0, gig.comfort - hurt); gig.hurtT = hurt > 0 ? 0.35 : Math.max(0, (gig.hurtT || 0) - dt); }
    if (g.kind === 'rides') rideTick(dt, pl, Math.min(pl.lapTimes.length, g.laps - 1));
    const d = Math.max(dmgOf(ph.dmg), (pl.maxDmg || 0) / 3);
    if (d > gig.dmg + 0.01) { if (g.kind === 'hearse') { gig.comfort = Math.max(0, gig.comfort - Math.min(40, Math.max(5, (d - gig.dmg) * 500))); gig.hurtT = 0.6; } if (g.kind === 'rides') gig.fun = Math.min(100, gig.fun + Math.min(45, Math.max(10, (d - gig.dmg) * 600))); } // (a scrape, a little; a real hit, a lot)
    gig.dmg = Math.max(gig.dmg, d);
  }
  const row = (k, v) => `<div class="hud-row"><span class="lbl">${k}</span><span class="val">${v}</span></div>`;
  const meter = (k, v, hurt = false) => `<div class="gig-meter${hurt ? ' hurt' : ''}"><span class="lbl">${k}</span><i style="--v:${Math.max(0, v) / 100}"></i></div>`;
  const ref = gig.ref || 0, laps = Math.min(g.laps, sim.laps); // (a point-to-point route is one run)
  let body = '', fun = '';
  if (g.kind === 'courier') body = row('TIME', mmss(gig.t)) + row('DUE', ref ? mmss(ref * laps * g.tight) : '&mdash;') + meter(g.fragile ? 'FRAGILE' : 'GOODS', 100 - Math.min(100, gig.dmg * (g.fragile ? 350 : 160)));
  else if (g.kind === 'hearse') body = row('TIME', mmss(gig.t)) + row('ARRIVE', ref ? `${mmss(ref * g.window[0] * laps)}&ndash;${mmss(ref * g.window[1] * laps)}` : '&mdash;') + meter('THE FAMILY', gig.comfort, gig.hurtT > 0);
  else if (g.kind === 'rides') { const k = Math.min(pl.lapTimes.length, laps - 1), [lo, hi] = WC.riderWants(g.riders[k]), f = gig.fun;
    const mood = gig.sick >= 100 ? 'SICK' : gig.sick > 50 ? 'FEELING SICK' : f < lo ? 'BORED' : f > hi ? 'TOO MUCH' : 'LOVING IT';
    body = row('RIDER', `${k + 1} OF ${laps}`) + `<div class="gig-who">${g.riders[k]}</div>`;
    fun = `<div class="gig-meter fun${f > hi || gig.sick >= 100 ? ' hurt' : ''}"><span class="lbl">${g.riders[k].split(',')[0].toUpperCase()} &middot; ${mood}</span><i style="--v:${(f / 100).toFixed(3)};--lo:${lo / 100};--hi:${hi / 100}"><b></b></i>${gig.sick > 0 ? `<s style="--s:${(Math.min(100, gig.sick) / 100).toFixed(3)}"></s>` : ''}</div>`; }
  else if (g.kind === 'attack') body = ['GOLD', 'SILVER', 'BRONZE'].map((k, i) => row(k, ref ? fmtTime(ref * WC.ATTACK_TIERS[i], 1) : '&mdash;')).join('');
  else body = row('VS', g.client.toUpperCase()) + row('CASH', WC.money$(g.pay));
  const html = `<div class="hud-cap">${GIG_LINE[g.kind].toUpperCase()}</div><div class="hud-rows">${body}</div>`;
  const el = $('h-gig'); if (el._h !== html) { el._h = html; el.innerHTML = html; }
  const fe = $('h-fun'); if (fe._h !== fun) { fe._h = fun; fe.innerHTML = fun; }
}
// a ride's excitement: how hard the car's being driven, for this car: its top speed here, and its typical cornering
// on the racing line (the median of the corners' g, from the line's curvature over 10 m and the AI's speeds)
function rideScale() {
  const T = sim.T, V = sim.player.lineV || sim.lineV, O = sim.line, N = T.N; gig.vMax = 40; gig.gRef = 1;
  if (!V || !O) return;
  const m = Math.max(2, Math.round(10 / T.ds)), at = (i) => { i = (i + N) % N; return [T.X[i] + T.RX[i] * O[i], T.Z[i] + T.RZ[i] * O[i]]; };
  const lat = []; let vm = 0;
  for (let i = 0; i < N; i++) {
    vm = Math.max(vm, V[i]);
    const [ax, az] = at(i - m), [bx, bz] = at(i), [cx, cz] = at(i + m);
    const k = 2 * Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / (Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az) + 1e-9);
    const g = V[i] * V[i] * k / 9.81; if (g > 0.3) lat.push(g);
  }
  lat.sort((a, b) => a - b);
  gig.vMax = Math.max(20, vm); gig.gRef = Math.max(0.7, lat[Math.floor(lat.length / 2)] || 1);
}
// what the passenger feels: speed, cornering, braking, sliding and curbs push it up; it settles back slowly. Over their
// range their stomach fills (sick at 100); a lap's shares in, under and over it are what they make of the ride
function rideTick(dt, pl, k) {
  const ph = pl.phys, [lo, hi] = WC.riderWants(gig.g.riders[k]);
  const sK = Math.min(1, ph.speed / gig.vMax), lat = Math.min(1.2, Math.abs(gig.lat) / gig.gRef), brk = Math.min(1, Math.max(0, -gig.lon) / gig.gRef);
  const slide = ph.speed > 8 ? Math.min(1, Math.max(0, (Math.abs(ph.beta || 0) - 0.07) / 0.2)) : 0;
  // (measured: a tidy lap at the AI's pace sits around 55-60, half pace around 20; slides and curbs push it higher)
  const x = 0.68 * sK * sK + 0.54 * lat * lat + 0.34 * brk + 0.6 * slide + (pl.surface === 'kerb' ? 0.16 : 0);
  const to = Math.min(100, x * 100);
  gig.fun += (to - gig.fun) * (1 - Math.exp(-dt / (to > gig.fun ? 0.5 : 2.5)));
  if (gig.sick >= 100) return; // (it's happened: the rest of the lap is the clean-up)
  if (gig.fun > hi) { gig.tHi += dt; gig.sick += (gig.fun - hi) * dt; }
  else { if (gig.fun < lo) gig.tLo += dt; else gig.tIn += dt; gig.sick = Math.max(0, gig.sick - dt * 3); }
}
function gigLap() {
  if (!gig || gig.g.kind !== 'rides') return;
  const T = Math.max(1e-6, gig.tIn + gig.tLo + gig.tHi);
  gig.lapRides.push({ in: +(gig.tIn / T).toFixed(3), lo: +(gig.tLo / T).toFixed(3), hi: +(gig.tHi / T).toFixed(3), sick: gig.sick >= 100 });
  gig.fun = 30; gig.sick = 0; gig.tIn = gig.tLo = gig.tHi = 0;
}
function gigFinish(abandon = false) {
  const w = world; if (!w || !sim || !gig) return;
  const pl = sim.player, g = gig.g, me = sim.results().find(r => r.isPlayer);
  const finished = !abandon && !!pl.finished;
  const r = { finished, time: gig.t, ref: (gig.ref || 60) * (g.kind === 'courier' || g.kind === 'hearse' ? Math.min(g.laps, sim.laps) : 1), dmg: gig.dmg, comfort: gig.comfort,
    lapTimes: pl.lapTimes.slice(0, g.laps), lapRides: gig.lapRides, won: finished && me && me.pos === 1 };
  const out = coopGuest() ? WC.coopGigDone(w, g.id, r) : WC.gigDone(w, g.id, r);
  gig = null; document.body.classList.remove('gig-on'); sim.setPaused(true); saveWorld();
  if (!out) return openHub();
  const stars = out.stars != null ? `<div class="row"><span>Customer rating</span><span>${'&#9733;'.repeat(out.stars)}${'&#9734;'.repeat(5 - out.stars)}</span></div><div class="row"><span>Your GigGo rating</span><span>${WC.gigRating(w).toFixed(2)}</span></div>` : '';
  weekResult(out.head, `${WC.GIG_KINDS[g.kind].name} · ${g.client}`, out.rows, `${stars}<p class="hub-note">${out.line}</p>`, out.net);
  if (out.net > 0) sfx.finish();
}
// the result of a day: the round screen, as a receipt
function weekResult(title, sub, rows, extra, net) {
  const w = world;
  $('round-title').textContent = title;
  $('round-sub').textContent = sub;
  $('round-table').innerHTML = `<tr><th>ITEM</th><th class="r">AMOUNT</th></tr>` + (rows.length ? rows.map(([t, a]) => `<tr><td>${t}</td><td class="n ${a < 0 ? 'bad' : ''}">${a > 0 ? '+' : ''}${WC.money$(a)}</td></tr>`).join('') : '<tr><td>Nothing</td><td class="n">$0</td></tr>');
  $('round-info').innerHTML = `<div class="big-pos cash">${net >= 0 ? '+' : '&minus;'}${WC.money$(Math.abs(net))}<small>THE DAY</small></div>${extra}
    <div class="row"><span>Bank balance</span><span class="${w.money.balance < 0 ? 'bad' : ''}">${WC.money$(w.money.balance)}</span></div>
    <div class="row"><span>This week</span><span>${myWeek(w).left} day${myWeek(w).left === 1 ? '' : 's'} left</span></div>`;
  menus['s-round'][0].setItems([{ label: 'Continue', cls: 'action primary', action: () => openHub() }]);
  show('s-round');
}
// a test day: the next round's circuit, your car, as many laps as you like
function startTestDay() {
  const w = world, R = w.series[w.player.series].cal[w.round];
  if (!WC.bookTest(w)) return;
  saveWorld();
  const base = calTrack(R);
  const track = cloneTrack(base); track.env.time = R.time; track.env.weather = R.weather;
  phone.hide();
  startRace(track, { mode: 'test', pick: false, brief: `<b>TEST DAY &middot; ${R.name.toUpperCase()}</b><br>Five laps or more finds a setup for the race. The acclimatization gates are out: nail the red ones and your brake points are marked for the weekend. Pause to end the day.`,
    extra: { car: worldCar(), mods: WC.carMods(w), trackData: WC.weekOf(w).trackData || null, programme: 'acclim' } }, 'testday');
}
// what the test day's run plan found (the gates' best lap, the brake markers out for the weekend)
function testPlanRows() {
  const a = sim && sim.tdata && sim.tdata.acclim; if (!a || !a.best) return '';
  return `<div class="row"><span>Acclimatization</span><span>${Math.round(a.best * 100)}%${a.done ? ' &middot; done' : ''}</span></div>`
    + (a.marks.length ? `<div class="row"><span>Brake markers</span><span>${a.marks.length} for the weekend</span></div>` : '');
}
function testFinish() {
  const w = world; if (!w || !sim || !sim.player) return;
  const pl = sim.player, laps = pl.lapTimes.length, before = w.money.balance, best = laps ? Math.min(...pl.lapTimes) : null;
  const ok = WC.testDone(w, laps);
  sim.setPaused(true); saveWorld();
  const R = w.series[w.player.series].cal[w.round];
  weekResult('Test Day', `${R.name} · ${laps} lap${laps === 1 ? '' : 's'}`, [['Track hire (paid when booked)', -WC.testCost(w)], ['Fuel', w.money.balance - before]],
    `${best ? `<div class="row"><span>Best lap</span><span>${fmtTime(best, 3)}</span></div>` : ''}${testPlanRows()}<p class="hub-note">${ok ? `You found a setup: a little more grip at ${R.name} this weekend.` : `Not enough laps to find a setup (five needed).`}</p>`, w.money.balance - before - WC.testCost(w));
}

// ---------------- online ----------------
let net = null;          // Net connection (null when offline)
let lobby = null;        // host-authoritative lobby state (clients hold a copy)
let lobbyTrack = null;   // the chosen circuit (full JSON)
let netRace = null;      // { id, recorded } for the race in progress
let netSendT = 0;
const ONLINE_SET = { track: 0, laps: 5, ai: 5, difficulty: 'medium', grid: 'random', wear: 'normal', temps: 'normal', damage: 'normal', rules: 'arcade', mistakes: 'normal', time: 'track', weather: 'track', drift: 'off', aids: 'any' };
const shuffleArr = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
let toastT = 0;
// ---------------- which car (World Career): yours, your teammate's, or both ----------------
// One chooser, the same wherever the part comes from (Speed Parts Direct, SVList, an email, a development project):
// the three cars side by side, what each costs, what your teammate will make of it, left / right and A to fit, B to
// leave it. o: { title, from (where it's from), price, bothPrice (null: there's only one), onPick(to) }. No teammate:
// straight onto yours.
let fp = null;
function fitPick(o) {
  const m = WC.mateOf(world); if (!m) return o.onPick('me');
  const p = world.people[m.pid], lean = WC.carLean(world), $m = WC.money$, host = world.player.name.split(' ')[0];
  // (co-op: no feelings to hurt, just whose car it is; the co-owner's own car comes first on theirs)
  const opts = m.human ? (coopGuest()
    ? [['mate', 'Your car', $m(o.price), lean ? `Yours is ${Math.abs(lean)} upgrade${Math.abs(lean) === 1 ? '' : 's'} ${lean > 0 ? 'behind' : 'ahead of'} ${host}'s` : ''], ['me', `${host}'s car`, $m(o.price), 'A present']]
    : [['me', 'Your car', $m(o.price), lean >= 1 ? `${p.first}'s is ${WC.leanText(lean).toLowerCase()}` : ''], ['mate', `${p.first}'s car`, $m(o.price), '']])
    .concat([['both', 'Both cars', o.bothPrice == null ? 'Only one of these' : $m(o.bothPrice), o.bothPrice == null ? '' : 'One for each car']]) : [['me', 'Your car', $m(o.price), lean >= 1 ? `${p.first} will notice: their car's ${WC.leanText(lean).toLowerCase()}` : `${p.first} will notice`],
    ['mate', `${p.first}'s car`, $m(o.price), `${p.first} will like that`],
    ['both', 'Both cars', o.bothPrice == null ? 'Only one of these' : $m(o.bothPrice), o.bothPrice == null ? '' : 'One for each car']];
  fp = { ...o, opts, sel: 0 }; const el = $('fitpick'); el.hidden = false; renderFitPick(); sfx.select(); renderHints();
}
function renderFitPick() {
  const el = $('fitpick');
  el.innerHTML = `<div class="fp-box"><small>Fit it to</small><h2>${fp.title}</h2><p>${fp.from || ''}</p>
    <div class="fp-opts">${fp.opts.map(([k, n, pr, says], i) => `<div class="fp-o${i === fp.sel ? ' on' : ''}${k === 'both' && fp.bothPrice == null ? ' no' : ''}" data-i="${i}"><b>${n}</b><em>${pr}</em><span>${says}</span></div>`).join('')}</div>
    <div class="fp-keys">${hintKeys('lr')}<span>Choose</span>${hintKeys('ok')}<span>Fit it</span>${hintKeys('back')}<span>Leave it</span></div></div>`;
  el.querySelectorAll('.fp-o').forEach(d => { d.onclick = () => { const i = +d.dataset.i; if (i === fp.sel) fitPickDo(); else { fp.sel = i; sfx.move(); renderFitPick(); } }; });
}
function fitPickDo() {
  const [k] = fp.opts[fp.sel]; if (k === 'both' && fp.bothPrice == null) { sfx.error(); return; }
  const f = fp; fitPickClose(); sfx.best(); f.onPick(k);
}
function fitPickClose() { fp = null; $('fitpick').hidden = true; renderHints(); }
function fitPickInput() {
  const left = pressed('ArrowLeft') | pressed('KeyA') | pressed('GP14') | pressed('GPSL'), right = pressed('ArrowRight') | pressed('KeyD') | pressed('GP15') | pressed('GPSR');
  const ok = pressed('Enter') | pressed('Space') | pressed('GP0'), back = pressed('Escape') | pressed('Backspace') | pressed('GP1');
  clearEdges();
  if (left || right) { fp.sel = (fp.sel + (right ? 1 : -1) + 3) % 3; sfx.move(); renderFitPick(); }
  else if (ok) fitPickDo();
  else if (back) { sfx.back(); fitPickClose(); }
}
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
    net.send({ t: 'hello', ver: PROTO, name: myName(), car: { ...settings.car }, token: coopToken() });
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
  net.on('state', (m) => { if (sim && sim.net && ((netRace && m.race === netRace.id) || (coop && coop.race && m.race === coop.race.id))) { sim.netReceive(m.cars, m.time); if (m.rc !== undefined) sim.rc.netApply(m.rc); } });
  net.on('left', (pid) => {
    const p = lobby && lobby.players.find(x => x.id === pid);
    if (!p) return;
    lobby.players = lobby.players.filter(x => x.id !== pid);
    toast(`<b>${p.name}</b> left the room`);
    if (sim && sim.net) { sim.dropCar('h:' + pid); net.send({ t: 'drop', key: 'h:' + pid }); hostMaybeGo(); }
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
  } else if (m.t === 'lock') hostLocked(from, m.race);
  else if (m.t === 'bye') net.hostDrop(from);
}
function clientMessage(m) {
  if (m.t === 'locks') { if (m.race === netRaceId()) { locksOf().ids = new Set(m.ids || []); } return; }
  if (m.t === 'go') { if (sim && sim.net && m.race === netRaceId() && sim.net.goT == null) sim.net.goT = m.at; else if (m.race === netRaceId()) pendingGo = m; return; }
  if (m.t === 'cworld' || m.t === 'cstat' || m.t === 'cstart' || m.t === 'cround' || m.t === 'csess' || m.t === 'cfield' || m.t === 'cqres') { coopClient(m); return; }
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
      { label: 'Tire Temps', values: TEMPS_VALS, get: () => S.temps || 'normal', set: v => { S.temps = v; hostBroadcast(); }, desc: TEMPS_DESC },
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
  const m = { t: 'start', race: Math.random().toString(36).slice(2, 9), track, grid, cfg: { laps: S.laps, difficulty: S.difficulty, wear: S.wear, temps: S.temps || 'normal', damage: S.damage, rules: S.rules || 'arcade', mistakes: S.mistakes || 'normal', drift: S.drift || 'off', aids: S.aids || 'any' },
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
      aiChassis: m.aiChassis || 'custom', aiClassCar: m.aiClassCar || 'f1', difficulty: m.cfg.difficulty, wear: m.cfg.wear, temps: m.cfg.temps || 'off', damage: m.cfg.damage, rules: m.cfg.rules || 'arcade', aiMistakes: m.cfg.mistakes || 'normal', team: 'garage', startTyre: 'auto', grid: 'back', drift: m.cfg.drift || 'off', aidRule: m.cfg.aids || 'any',
      net: { host: net.isHost, myId: net.id, grid: m.grid, t0: m.t0, goDelay: m.goDelay, pick: m.pick || 0, strat: m.strat || 0, clock: () => net.now() },
    },
  }, 'online');
}
// every frame of an online race: stream my car(s); the host scores the race once all humans are done
let lobbyPingT = 0;
function netTick(dt) {
  if (pendingGo && sim && sim.net && sim.net.goT == null && pendingGo.race === netRaceId()) { sim.net.goT = pendingGo.at; pendingGo = null; } // (a start that came while loading)
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
// ----- the start, online: everyone locks in, then the host starts it (no timers) -----
// Each driver locks in when their strategy's locked (netLock); the host keeps who has (raceLocks, sent round as
// 'locks') and, once every driver still in the race has, sets the start 1.5 s ahead for everyone ('go'). The host can
// start without whoever's missing by picking their strategy again.
let raceLocks = null; // { race, ids: Set of peer ids }
let pendingGo = null; // (a start that came while this copy was still loading the race)
const netLink = () => coop && coop.race ? coop.net : net;
const netRaceId = () => coop && coop.race ? coop.race.id : netRace ? netRace.id : null;
function locksOf() { const id = netRaceId(); if (!raceLocks || raceLocks.race !== id) raceLocks = { race: id, ids: new Set() }; return raceLocks; }
// the drivers not locked in yet (names), of those still in the race
function netWaiting() { if (!sim || !sim.net) return []; const L = locksOf(); return sim.cars.filter(c => c.human && !(c.gone && !c.inGarage) && c.key && !L.ids.has(c.key.slice(2))).map(c => c.name); } // (in a session's garage counts as here)
function netLock() {
  const L = netLink(); if (!L || !sim || !sim.net) return;
  if (L.isHost) hostLocked(L.id); else L.send({ t: 'lock', race: netRaceId() });
}
function hostLocked(id, race = netRaceId()) {
  const L = netLink(); if (!L || race !== netRaceId()) return;
  locksOf().ids.add(id); L.send({ t: 'locks', race, ids: [...locksOf().ids] }); hostMaybeGo();
}
function hostMaybeGo(force = false) {
  const L = netLink(); if (!L || !L.isHost || !sim || !sim.net || sim.net.goT != null) return;
  if (!locksOf().ids.has(L.id) || (!force && netWaiting().length)) return;
  const at = L.now() + 1500; sim.net.goT = at; L.send({ t: 'go', race: netRaceId(), at });
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

// ---------------- co-op World Career ----------------
// The host's career, shared: a friend joins with the room code (Online > Join Game, the same as a race), buys into the
// team (wcareer.js coopJoin) and drives the second car. The host's copy is the career: it's saved there only, and sent
// whole to the friend whenever it changes. Race day is an online race with the career's field (straight to the race):
// the host runs the AI, scores the round once both of you are home, and sends the friend the result. The friend's own
// week comes later; for now their page is the team, the championship and the next race.
// coop: { net, host, code (host), peer (host: the friend's peer id), name, ready, doing (the host, for the friend's
// page), race: { id, wait (the host: waiting at the finish for the friend), done } }
const coopToken = () => { let t = null; try { t = localStorage.getItem('svgp.coopToken'); if (!t) { t = Math.random().toString(36).slice(2, 12); localStorage.setItem('svgp.coopToken', t); } } catch (e) {} return t || 'anon'; };
const coopGuest = () => !!(coop && !coop.host);
const coopLive = () => !!(coop && coop.host && coop.peer && world && world.coop);
const coopOk = (w) => w && founded(w) && WC.setupDone(w) && !w.ended && !w.preview;
// "joshua o'neil" -> { first: 'Joshua', last: "O'Neil" } (one word: it's both)
function personName(s) {
  const parts = String(s || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().split(/\s+/).filter(Boolean).slice(0, 4)
    .map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase().replace(/(['-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()));
  if (!parts.length) return null;
  return { first: parts[0].slice(0, 14), last: (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]).slice(0, 18) };
}
// the friend's changes, to the host: an argument that's part of the career (an email, a staff member, a used part)
// goes as a reference to it, so the host finds its own copy
function coopRef(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a) || !world) return a;
  for (const [base, o] of [['', world], ['week.', world.week || {}]]) for (const k of Object.keys(o)) { const v = o[k]; if (Array.isArray(v)) { const i = v.indexOf(a); if (i >= 0) return { $ref: base + k, id: a.id ?? null, i }; } }
  return a;
}
function coopUnref(a) {
  if (!a || typeof a !== 'object' || !a.$ref) return a;
  const arr = a.$ref.startsWith('week.') ? world.week?.[a.$ref.slice(5)] : world[a.$ref]; if (!Array.isArray(arr)) return null;
  return (a.id != null ? arr.find(x => x && x.id === a.id) : null) || arr[a.i] || null;
}
function coopSend(fn, args) { if (net && coop && !coop.host) net.send({ t: 'op', fn, args }); }
function coopNotYours() { sfx.error(); toast(`That's ${world.player.name.split(' ')[0]}'s call: the team's business is theirs.`, 3500); }
// the host's copy, on the friend's: swapped in place (the screens hold on to the same object), then redrawn
function coopTakeWorld(nw) {
  if (!world || world === nw) { world = nw; return; }
  for (const k of Object.keys(world)) if (!(k in nw)) delete world[k];
  Object.assign(world, nw);
}
function coopRedraw() { if (screen !== 's-hub' || !world) return; renderHub(); if (pcSeat) pc.render?.(); }
// the friend's car: the team's, with their number (and their boss's name on it, if that's how they bought in)
function coopCar() {
  const w = world, c = { ...worldCar(), number: w.coop.number };
  if (w.coop.boss) { let n = ''; for (const wd of w.coop.boss.toUpperCase().split(' ')) { if ((n + ' ' + wd).trim().length > 14) break; n = (n + ' ' + wd).trim(); } c.sponsor = n; }
  return c;
}

// ----- the host -----
async function coopHost() {
  if (coop || connecting || !coopOk(world)) return; connecting = true;
  const n = new Net();
  try {
    const code = await n.host();
    coop = { net: n, host: true, code, peer: null, name: null, ready: false, race: null, pushT: 0 };
    wireCoop(n);
    toast(`Co-op room <b>${code}</b> is open. Your friend picks <b>Online › Join Game</b> and types it.`, 7000); sfx.best();
  } catch (e) { toast(e.message, 5000); sfx.error(); }
  connecting = false;
  if (screen === 's-hub') { renderHub(); if (optSub) renderOptMenu(); }
}
function coopEnd(msg) { if (!coop) return; const c = coop; coop = null; clearTimeout(c.pushT); try { c.net.close(); } catch (e) {} if (msg) toast(msg, 5000); }
function wireCoop(n) {
  n.on('message', (m, from) => coopHostMessage(m, from));
  n.on('state', (m) => { if (sim && sim.net && coop && coop.race && m.race === coop.race.id) sim.netReceive(m.cars, m.time); });
  n.on('left', (pid) => {
    if (!coop || pid !== coop.peer) return;
    const who = world && world.coop ? WC.coopPerson(world).first : coop.name;
    coop.peer = null; coop.ready = false;
    toast(`<b>${who}</b> left. Their car is raced for them until they're back.`, 5000);
    if (sim && sim.net) { sim.dropCar('h:' + pid); hostMaybeGo(); }
    if (screen === 's-hub') { renderHub(); if (optSub) renderOptMenu(); }
  });
}
function coopHostMessage(m, from) {
  const w = world; if (!w || !coop) return;
  if (m.t === 'hello') {
    const no = (why) => { coop.net.sendTo(from, { t: 'reject', reason: why }); setTimeout(() => coop && coop.net.hostDrop(from), 400); };
    if (m.ver !== PROTO) return no('Your game version does not match the host. Get the latest copy.');
    if (coop.peer) return no('Someone is already in this career with the host.');
    if (w.coop && w.coop.token !== m.token) { const p = WC.coopPerson(w); return no(`This career already has a co-owner: ${p.first} ${p.last}.`); }
    coop.peer = from; coop.name = cleanName(m.name); coop.ready = false;
    coop.assetKey = null; // (the livery's images go with the career, coopPush)
    coopPush(true);
    toast(w.coop ? `<b>${WC.coopPerson(w).first}</b> is here` : `<b>${coop.name}</b> joined. They're reading the agreement.`); sfx.best();
    if (screen === 's-hub') { renderHub(); if (optSub) renderOptMenu(); }
    return;
  }
  if (from !== coop.peer) return;
  if (m.t === 'sign') {
    const nm = personName(`${m.first} ${m.last}`); if (w.coop || !nm) return;
    const number = Math.max(1, Math.min(99, m.number | 0)) || 2;
    const r = WC.coopJoin(w, { ...nm, number, kind: m.kind, token: m.token }); if (!r) return;
    saveWorld(); // (and the friend gets the career with them in it)
    toast(`<b>${nm.first} ${nm.last}</b> bought ${r.stake}% of the team${r.cash ? ` for ${WC.money$(r.cash)}` : ''}. Car two is theirs.`, 6000); sfx.best();
    if (screen === 's-hub') { renderHub(); if (optSub) renderOptMenu(); }
  } else if (m.t === 'op') {
    if (!w.coop || !GUEST_OPS.has(m.fn) || typeof WCX[m.fn] !== 'function') return;
    const before = w.money ? w.money.balance : 0, tx0 = w.money ? w.money.tx[0] : null;
    try { WCX[m.fn](w, ...(m.args || []).map(coopUnref)); } catch (e) { console.error('co-op', m.fn, e); }
    saveWorld();
    const spent = w.money ? w.money.balance - before : 0, tx = w.money && w.money.tx[0] !== tx0 ? w.money.tx[0] : null;
    const who = WC.coopPerson(w).first, ask = w.week?.co?.ask;
    if (m.fn === 'coopAsk' && ask) toast(`<b>${who}</b> asks: ${WC.COOP_TOGETHER[ask.what].name.toLowerCase()}. Say yes in your day planner.`, 6000);
    else if (m.fn === 'coopTogether') toast(`<b>${who}</b> said yes: a day together. It's in both your weeks.`, 5000);
    else if (spent && tx) toast(`<b>${who}</b>: ${escP(tx.what)} <b>${WC.money$(spent)}</b>`, 5000);
    if (screen === 's-hub') { renderHub(); if (pcSeat) pc.render?.(); if (dayPlan.isOpen && !dayPlan.busy) dayPlan.render(); }
  } else if (m.t === 'lock') { hostLocked(from, m.race);
  } else if (m.t === 'cuse') { if (coop.race && m.race === coop.race.id) coop.race.use = { sets: (m.sets || []).filter(c => typeof c === 'string').slice(0, 8), laps: Math.max(0, Math.min(500, m.laps | 0)) };
  } else if (m.t === 'ready') { coop.ready = !!m.ready; if (screen === 's-hub') { renderHub(); if (optSub) renderOptMenu(); } }
  else if (m.t === 'bye') coop.net.hostDrop(from);
}
// the career to the friend: whenever it's saved (a moment after, so a burst of changes goes once)
function coopPush(now = false) {
  if (!coop || !coop.host || !coop.peer || !world) return;
  clearTimeout(coop.pushT);
  const go = () => {
    if (!coop || !coop.peer || !world) return;
    // (a livery with new images of your own: they go first, so the car two they see is painted)
    const ids = liveryAssetIds(worldCar()), key = ids.join('|');
    if (key && key !== coop.assetKey) { coop.assetKey = key; coop.net.sendTo(coop.peer, { t: 'assets', assets: assets.pick(ids) }); }
    coop.net.sendTo(coop.peer, { t: 'cworld', w: world, doing: coopDoing() });
  };
  if (now) go(); else coop.pushT = setTimeout(go, 400);
}
const coopDoing = () => sim && sim.mode !== 'attract' && raceReturn === 'world' ? 'racing' : sim && sim.mode !== 'attract' && raceReturn === 'gig' ? 'out on a job' : pcSeat ? 'at the computer' : 'in the garage';
// race day, together: the career's field online, the grid in championship order (the first round: you two at the back)
function coopStartRace(track, race, ent, qg = null) {
  const w = world, x = race.extra, C = WC.coopPerson(w), T = w.teams[w.player.team];
  const slotOf = Object.fromEntries(Object.entries(ent.entries).map(([s, e]) => [e.pid, +s])), cSlot = slotOf[w.coop.pid];
  if (qg) x.aiSetup = qg.aiSetup; // (qualifying: the AI drivers as quick as they were)
  const order = qg ? qg.gridOrder.slice() : w.round > 0 ? WC.seriesStandings(w, w.player.series).map(e => e.pid === 'P' ? 'P' : slotOf[e.pid]).filter(k => k !== undefined) : [...ent.roster.filter(k => k !== cSlot), cSlot, 'P'];
  for (const k of ent.roster) if (!order.includes(k)) order.push(k);
  if (!order.includes('P')) order.push('P');
  const team = { name: T.name, main: x.car.main, accent: x.car.accent, helmet: x.car.accent }, cName = C.last.toUpperCase();
  const grid = order.map(k => k === 'P' ? { k: 'h', id: coop.net.id, pid: 'P', team: 0, name: x.playerName, car: x.car, teamObj: { ...team, driver: x.playerName } }
    : k === cSlot ? { k: 'h', id: coop.peer, pid: w.coop.pid, team: cSlot, name: cName, car: coopCar(), teamObj: { ...team, driver: cName } }
    : { k: 'a', team: k });
  const m = { t: 'cstart', race: Math.random().toString(36).slice(2, 9), track, grid, laps: race.laps, cls: race.onlyClass, difficulty: x.difficulty, bop: x.bop, wx: x.wx,
    entries: x.entries, teamPace: x.teamPace, roster: x.roster, t0: coop.net.now() + 4500, goDelay: 4.5 + 0.6 + Math.random() * 1.2, strat: 20 };
  coop.net.sendTo(coop.peer, m);
  beginCoopRace(m, race);
}
function beginCoopRace(m, hostRace = null) {
  coop.race = { id: m.race, wait: null, done: false };
  const host = coop.host, mine = m.grid.find(g => g.k === 'h' && g.id === coop.net.id), w = world;
  const extra = host ? { ...hostRace.extra, gridOrder: null }
    : { car: mine.car, mods: w && w.car ? WC.carMods(w, 'mate') : null, bop: m.bop, difficulty: m.difficulty, grid: 'back', team: 'garage', wx: m.wx, roster: m.roster, entries: m.entries, teamPace: m.teamPace, aiChassis: 'class', playerName: mine.name };
  extra.net = { host, myId: coop.net.id, grid: m.grid, t0: m.t0, goDelay: m.goDelay, pick: 0, strat: m.strat || 0, clock: () => coop.net.now() };
  extra.trackData = coopTrackData(m.track);
  weekend = null;
  if (!host) { if (pcSeat) { pcSeat = false; pc.close(); $('s-hub').classList.remove('seated'); } phone.close(); phone.hide(); if (fp) fitPickClose(); }
  const R = w && w.series[w.player.series].cal[w.round];
  const brief = host ? hostRace.brief : `<b>${seriesName(w.player.series).toUpperCase()} &middot; ROUND ${w.round + 1} OF ${w.opts.len}</b><br>${w.teams[w.player.team].name}, car two${R ? ` &middot; ${R.name}` : ''}<br>Targets: you top ${WC.driverTarget(w, w.coop.pid)}, ${w.player.name.split(' ')[0]} top ${WC.driverTarget(w, 'P')} (${WC.money$(WC.targetBonus(w))} each)`;
  startRace(m.track, { mode: 'race', laps: m.laps, opponents: 11, brief, pick: false, onlyClass: m.cls, extra }, host ? 'world' : 'coop');
}
// your track data for this round (the run plan's, practice.js): the host's is the career week's, the friend's their own
const coopTrackData = (track) => coop.host ? (world && WC.weekOf(world).trackData) || null : coop.tdata && coop.tdata.key === track.name ? coop.tdata.d : null;
// ----- practice and qualifying, online: both of you on track, one clock (the host's), the AI field's laps simulated by
// the host and sent over (race.js netField); the session ends for each when the flag's out and their lap is done, and
// the host shows both the times once you're both in. The race after qualifying starts on that grid.
function coopStartSession(kind, wkd) {
  const w = world, x = wkd.race.extra, C = WC.coopPerson(w), T = w.teams[w.player.team];
  const slotOf = Object.fromEntries(Object.entries(wkd.ent.entries).map(([s, e]) => [e.pid, +s])), cSlot = slotOf[w.coop.pid];
  const team = { name: T.name, main: x.car.main, accent: x.car.accent, helmet: x.car.accent }, cName = C.last.toUpperCase();
  coop.weekend = { ...wkd, stage: kind };
  const m = { t: 'csess', race: Math.random().toString(36).slice(2, 9), kind, time: kind === 'practice' ? w.opts.pracLen : w.opts.qualiLen, track: wkd.track, laps: wkd.race.laps, cls: wkd.race.onlyClass,
    grid: [{ k: 'h', id: coop.net.id, pid: 'P', team: 0, name: x.playerName, car: x.car, teamObj: { ...team, driver: x.playerName } }, { k: 'h', id: coop.peer, pid: w.coop.pid, team: cSlot, name: cName, car: coopCar(), teamObj: { ...team, driver: cName } }],
    qualiTeams: wkd.ent.roster.filter(k => k !== cSlot), difficulty: x.difficulty, bop: x.bop, wx: x.wx, entries: x.entries, teamPace: x.teamPace, roster: x.roster };
  coop.net.sendTo(coop.peer, m);
  beginCoopSession(m, wkd.race);
}
function beginCoopSession(m, hostRace = null) {
  coop.race = { id: m.race, session: m.kind, done: false };
  const host = coop.host, mine = m.grid.find(g => g.k === 'h' && g.id === coop.net.id), w = world;
  const extra = host ? { ...hostRace.extra, gridOrder: null, ...(wkUse ? { startSet: sessionSet(m.kind) } : {}) }
    : { car: mine.car, mods: w && w.car ? WC.carMods(w, 'mate') : null, bop: m.bop, difficulty: m.difficulty, grid: 'back', team: 'garage', wx: m.wx, roster: m.roster, entries: m.entries, teamPace: m.teamPace, aiChassis: 'class', playerName: mine.name };
  extra.net = { host, myId: coop.net.id, grid: m.grid, pick: 0, strat: 0, goDelay: 0, qualiTeams: m.qualiTeams, clock: () => coop.net.now() };
  extra.trackData = coopTrackData(m.track);
  weekend = null;
  if (!host) { if (pcSeat) { pcSeat = false; pc.close(); $('s-hub').classList.remove('seated'); } phone.close(); phone.hide(); if (fp) fitPickClose(); }
  const brief = `<b>${SESSION_NAME[m.kind].toUpperCase()} &middot; ONLINE</b><br>${Math.round(m.time / 60)} minutes, both of you on track. The clock starts when you've both loaded.`;
  startRace(m.track, { mode: m.kind, laps: m.laps, opponents: 11, practiceTime: m.time, qualiTime: m.time, brief, pick: false, onlyClass: m.cls, extra }, host ? 'world' : 'coop');
}
// a session over for you (the flag, your lap done): the host waits for the friend, then shows both the times
function coopSessionDone() {
  if (!coop || !coop.race || coop.race.qOver) return;
  coop.race.qOver = true;
  if (!coop.host) return showCoopQuali(null);
  coopSessionCheck();
}
function coopSessionCheck() {
  if (!coop || !coop.host || !coop.race || !coop.race.qOver || coop.race.done) return;
  const f = sim && sim.cars.find(c => c.human && c.remote);
  if (f && !f.qDone && !f.gone && coop.peer) { if (screen !== 's-results') showCoopQuali(null); return; }
  coop.race.done = true;
  useSession();
  const g = sim.qualiGrid(), rows = sim.qualiRows().map(r => ({ pos: r.pos, name: r.name, team: r.team, color: r.color, best: isFinite(r.best) ? r.best : null, gap: r.gap, who: r.isPlayer ? 'P' : r.human ? 'C' : null }));
  coop.weekend.grid = g;
  if (coop.peer) coop.net.sendTo(coop.peer, { t: 'cqres', race: coop.race.id, kind: coop.race.session, rows });
  showCoopQuali(rows);
}
// the session's times (rows: the final ones; null: still going, the live timing)
function showCoopQuali(rows) {
  if (!sim || !sim.quali) return;
  const kind = coop?.race?.session || sim.quali.kind, practice = kind === 'practice', host = coop?.host, final = !!rows, hostName = world.player.name.split(' ')[0];
  if (pc.app === 'weekend') pc.close(); pitGarage.close();
  const me = host ? 'P' : 'C';
  const R = rows || sim.qualiRows().map(r => ({ pos: r.pos, name: r.name, team: r.team, color: r.color, best: isFinite(r.best) ? r.best : null, gap: r.gap, who: r.isPlayer ? me : r.human ? (host ? 'C' : 'P') : null }));
  const other = sim.cars.find(c => c.human && c.remote);
  $('results-title').textContent = SESSION_NAME[kind];
  $('results-sub').textContent = `${sim.track.name} · ${Math.round(sim.quali.time / 60)} minute session · ${practice ? 'qualifying next' : 'grid for the race'}`;
  $('results-table').innerHTML = (final ? '' : `<caption class="live">${other && !other.qDone && !other.gone ? `Waiting for ${other.name} to finish the session&hellip;` : host ? 'Posting the times&hellip;' : `Waiting for ${hostName}&hellip;`}</caption>`)
    + `<tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th class="r">BEST LAP</th><th class="r">GAP</th></tr>` + R.map(r =>
    `<tr class="${r.who === me ? 'me' : ''}"><td class="p">${posBadge(r.pos)}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.name}</td><td>${r.team}</td><td class="t">${r.best ? fmtTime(r.best, 3) : 'NO TIME'}</td><td class="t">${r.pos === 1 || r.gap == null ? '' : '+' + r.gap.toFixed(3)}</td></tr>`).join('');
  const mine = R.find(r => r.who === me), p = mine ? mine.pos : R.length, o = ['TH', 'ST', 'ND', 'RD'][(p % 100 - 20) % 10] || ['TH', 'ST', 'ND', 'RD'][p % 100] || 'TH', row = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
  const tag = !mine || !mine.best ? 'NO TIME SET' : practice ? (p === 1 ? 'FASTEST IN PRACTICE' : 'IN PRACTICE') : p === 1 ? 'POLE POSITION' : 'ON THE GRID';
  $('result-card').innerHTML = `<div class="big-pos ${p === 1 ? 'gold' : p <= 3 ? 'podium' : ''}">${p}<sup>${o}</sup><small>${tag}</small></div>` + row('Best lap', mine && mine.best ? fmtTime(mine.best, 3) : '&mdash;') + row(practice ? 'Gap to fastest' : 'Gap to pole', p === 1 || !mine || mine.gap == null ? '&mdash;' : '+' + mine.gap.toFixed(3))
    + row('Next', practice ? 'Qualifying' : 'The race');
  const items = !final ? (host ? [{ label: 'Finish Without Them', confirm: 'Post the times now? Select again', action: () => { const f = sim.cars.find(c => c.human && c.remote); if (f) f.qDone = true; coopSessionCheck(); }, desc: 'Post the times now: what they\'ve done so far counts.' }]
      : [{ label: `Waiting For ${hostName}`, disabled: true }, { label: 'Leave Session', confirm: 'Leave? Select again', action: () => leaveOnline(), desc: 'Leave the career and go back to the main menu.' }])
    : host ? (practice ? [{ label: 'Continue To Qualifying', cls: 'action primary', action: () => coopStartSession('quali', coop.weekend), desc: 'Same cars, same field: now it counts.' }]
        : [{ label: 'Start The Race', cls: 'action primary', action: () => { const W = coop.weekend; coopStartRace(W.track, W.race, W.ent, W.grid); }, desc: 'Line up on the grid you just set.' }])
      : [{ label: `${hostName} Starts ${practice ? 'Qualifying' : 'The Race'}`, disabled: true, desc: `You're on the grid when they do.` }, { label: 'Leave Session', confirm: 'Leave? Select again', action: () => leaveOnline(), desc: 'Leave the career and go back to the main menu.' }];
  sim.setPaused(false);
  if (screen !== 's-results') show('s-results');
  const mm = menus['s-results'][0], i = mm.i; mm.setItems(items); mm.i = Math.min(i, items.length - 1); mm.render();
}
// the host at the finish (or out of it): the round's scored once the friend's home too
// the friend's race is over for the host: home or gone, and what they used has arrived (or a few seconds have passed)
function coopFriendDone() {
  const f = sim && sim.cars.find(c => c.human && c.pid === world.coop.pid);
  if (!f) return true; if (!f.finished && !f.gone) return false;
  if (coop.race.use || !coop.peer) return true;
  coop.race.doneAt ??= performance.now(); return performance.now() - coop.race.doneAt > 4000;
}
function coopFinish(retired = false) {
  if (!coop || !coop.race || coop.race.wait || coop.race.done) return;
  if (coopFriendDone()) return worldRoundDone(retired);
  const f = sim && sim.cars.find(c => c.human && c.pid === world.coop.pid);
  coop.race.wait = { retired };
  sim.focus = f; // (watch theirs)
  showCoopLive();
}
// a World Career race ends early for you (retired, a failure, crashed out): offline the round's over; in a co-op race
// you watch the friend's
function worldEnd(retired) {
  if (sim && sim.net && coop && coop.host) { sim.retire(); coopFinish(true); }
  else worldRoundDone(retired);
}
// the round, for the friend: the host scored it (m: { res, round, net (the weekend's money), w })
function coopGuestRound(m) {
  coopTakeWorld(m.w); const w = world, sid = w.player.series, round = m.round, pid = w.coop && w.coop.pid;
  if (coop && coop.race) coop.race.done = true;
  if (sim) sim.setPaused(true);
  const scored = w.series[sid].results.find(x => x.round === round), ptsOf = (p) => scored ? scored.rows.find(r => r.pid === p)?.pts || 0 : 0;
  const mine = scored && scored.rows.find(r => r.pid === pid), you = scored && scored.rows.find(r => r.pid === 'P');
  $('round-title').textContent = 'Round Complete';
  $('round-sub').textContent = `${seriesName(sid)} · round ${round + 1} of ${w.opts.len} · ${w.series[sid].cal[round].name}`;
  $('round-table').innerHTML = `<tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th class="r">PTS</th></tr>` + m.res.map(r => {
    const fl = scored && scored.rows.find(x => x.pid === r.pid)?.fl;
    return `<tr class="${r.pid === pid ? 'me' : ''}"><td class="p">${posBadge(r.pos)}</td><td><span class="swatch" style="background:${hex(r.color)}"></span>${r.pid ? WC.displayName(w, r.pid, true) : r.name}${fl ? ' <span class="fl">FASTEST LAP</span>' : ''}${r.pen || r.dt ? ` <span class="pen">${penText(r)}</span>` : ''}${r.dsq ? ' <span class="pen">DSQ</span>' : ''}</td><td>${r.team}</td><td class="n">${r.pid && ptsOf(r.pid) ? '+' + ptsOf(r.pid) : ''}</td></tr>`;
  }).join('');
  const st = WC.seriesStandings(w, sid), cp = st.findIndex(e => e.pid === pid) + 1;
  $('round-info').innerHTML = `<div class="big-pos">${!mine || mine.dnf ? (mine && mine.dsq ? 'DSQ' : 'DNF') : 'P' + mine.pos}<small>${!mine || mine.dnf ? 'RETIRED' : 'FINISHED'}</small></div>
    <div class="row"><span>Points</span><span>+${mine ? mine.pts : 0}</span></div>
    <div class="row"><span>Championship</span><span>${cp ? `${ord(cp)} &middot; ${st[cp - 1].pts} pts` : '&mdash;'}</span></div>
    ${you ? `<div class="row"><span>${w.player.name.split(' ').pop()}</span><span>${you.dnf ? 'DNF' : 'P' + you.pos}</span></div>` : ''}
    ${m.tg && scored ? coopTargetRows(w, scored, m.tg, 'C') : ''}
    ${m.net != null ? `<div class="row"><span>The weekend</span><span class="${m.net < 0 ? 'bad' : 'ok'}">${m.net > 0 ? '+' : ''}${WC.money$(m.net)}</span></div><div class="row"><span>Bank balance</span><span class="${w.money.balance < 0 ? 'bad' : ''}">${WC.money$(w.money.balance)}</span></div>` : ''}`;
  menus['s-round'][0].setItems([{ label: 'Continue', cls: 'action primary', action: () => { if (coop) coop.race = null; openHub(); } }]);
  show('s-round');
  if (mine && !mine.dnf && mine.pos <= 3) sfx.finish();
}
// the round screen's co-op rows (me: 'P' the host, 'C' the friend): each driver's target, met or not, and the team's
// place in the team championship
function coopTargetRows(w, scored, tg, me) {
  const C = w.people[w.coop.pid], who = (k) => k === me ? 'Your target' : `${k === 'P' ? w.player.name.split(' ')[0] : C.first}'s target`;
  const row = (k) => { const r = scored.rows.find(x => x.pid === (k === 'P' ? 'P' : w.coop.pid)), met = r && !r.dnf && r.pos <= tg[k];
    return `<div class="row"><span>${who(k)}: top ${tg[k]}</span><span class="${met ? 'ok' : 'bad'}">${met ? `MET &middot; +${WC.money$(WC.targetBonus(w))}` : 'MISSED'}</span></div>`; };
  const ts = WC.teamStandings(w, w.player.series), k = ts.findIndex(e => e.tid === w.player.team);
  return row(me) + row(me === 'P' ? 'C' : 'P') + (k >= 0 ? `<div class="row"><span>Team championship</span><span>${ord(k + 1)} &middot; ${ts[k].pts} pts</span></div>` : '');
}
// the results as they come in (either of you, home before the other)
function showCoopLive() { renderCoopLive(); menus['s-results'][0].i = 0; show('s-results'); }
function renderCoopLive() {
  if (!sim || !coop) return;
  $('results-title').textContent = 'Race Results';
  const myKey = sim.player && sim.player.key;
  renderResultsTable(sim.results().map(r => ({ ...slimRow(r), isPlayer: r.key === myKey, gap: !r.finished && !r.dnf ? `RUNNING · L${Math.min(r.lap, sim.laps)}` : r.gap })));
  const other = sim.cars.find(c => c.human && c !== sim.player), out = !other || other.finished || other.gone;
  $('results-table').insertAdjacentHTML('afterbegin', `<caption class="live">${!out ? `Race in progress &middot; waiting for ${other.name} to finish&hellip;` : coop.host ? 'Scoring the round&hellip;' : `Waiting for ${world.player.name.split(' ')[0]} to score the round&hellip;`}</caption>`);
  const items = coop.host
    ? [{ label: 'End Race Now', confirm: 'End it for both of you? Select again', action: () => { const r = coop.race && coop.race.wait; if (coop.race) coop.race.wait = null; worldRoundDone(!!(r && r.retired)); }, desc: 'Score the round now: anyone still running is classified where they are.' }]
    : [{ label: 'Leave Session', confirm: 'Leave? Select again', action: () => leaveOnline(), desc: 'Leave the career and go back to the main menu.' }];
  const mm = menus['s-results'][0], i = mm.i; mm.setItems(items); mm.i = Math.min(i, items.length - 1); mm.render();
}
// every frame: the host's whereabouts for the friend's page; in a race, my car to the other, and the host's wait
let coopSendT = 0, coopStatT = 0, coopLiveT = 0;
function coopTick(dt) {
  if (!coop) return;
  if (coop.host && coop.peer && (coopStatT += dt) > 3) { coopStatT = 0; coop.net.sendTo(coop.peer, { t: 'cstat', doing: coopDoing() }); }
  if (!sim || !sim.net || !coop.race || coop.race.done) return;
  if (sim.quali) {
    if (coop.host && coop.peer && !coop.race.fieldSent && sim.quali.field && sim.quali.field.length) { coop.race.fieldSent = true; coop.net.sendTo(coop.peer, { t: 'cfield', race: coop.race.id, field: sim.fieldForNet() }); }
    if (!coop.host && coop.race.field && !sim.quali.netField) sim.netField(coop.race.field);
    if (coop.race.qOver && coop.host) coopSessionCheck();
    if (coop.race.qOver && screen === 's-results' && (coopLiveT += dt) > 1) { coopLiveT = 0; if (!coop.race.done) showCoopQuali(null); }
  }
  if ((coopSendT += dt) >= 0.05) { coopSendT = 0; coop.net.sendState({ t: 'st', race: coop.race.id, time: coop.net.now(), cars: sim.netStates(), ...(coop.host ? { rc: sim.rc.netState() } : {}) }); }
  if (coop.host && coop.race.wait && coopFriendDone()) { const r = coop.race.wait; coop.race.wait = null; worldRoundDone(r.retired); return; }
  // the friend: once you're home (or out), what your car used goes to the host for the bill
  if (!coop.host && !coop.race.useSent && sim.player && (sim.player.finished || sim.player.gone)) { coop.race.useSent = true; net.send({ t: 'cuse', race: coop.race.id, sets: sim.player.setsUsed || [], laps: sim.player.lapTimes.length }); }
  if (!sim.quali && screen === 's-results' && (coopLiveT += dt) > 1) { coopLiveT = 0; renderCoopLive(); }
}

// ----- the friend -----
function coopClient(m) {
  if (m.t === 'cworld') {
    const first = !coop;
    if (first) coop = { net, host: false, ready: false, race: null };
    const was = world && world.week?.co?.ask; coopTakeWorld(m.w); coop.doing = m.doing;
    { const a = world.week?.co?.ask; if (a && a.from === 'P' && !(was && was.from === 'P' && was.what === a.what) && world.coop) setTimeout(() => toast(`<b>${world.player.name.split(' ')[0]}</b> asks: ${WC.COOP_TOGETHER[a.what].name.toLowerCase()}. Say yes in your day planner.`, 6000), 300); }
    if (dayPlan.isOpen && !dayPlan.busy && !coop.race) dayPlan.render();
    if (coop.race) return; // (racing: the hub catches up after the round)
    const mine = world.coop && world.coop.token === coopToken();
    if (!mine) { if (screen === 's-buyin') renderBuyin(); else openBuyin(); }
    else if (screen === 's-hub') coopRedraw();
    else if (first || screen === 's-buyin' || screen === 's-online') { const signed = screen === 's-buyin'; openHub(); if (signed) setTimeout(() => { sfx.best(); toast(`Welcome to <b>${world.teams[world.player.team].name}</b>. You own ${world.coop.stake}% of it, and car two is yours.`, 6000); }, 700); }
  } else if (m.t === 'cstat') { if (coop && coop.doing !== m.doing) { coop.doing = m.doing; if (screen === 's-hub' && world) renderHub(); } }
  else if (m.t === 'cstart') { if (coop && world) beginCoopRace(m); }
  else if (m.t === 'csess') { if (coop && world) beginCoopSession(m); }
  else if (m.t === 'cfield') { if (coop && coop.race && m.race === coop.race.id) { coop.race.field = m.field; if (sim && sim.quali && !sim.quali.netField) sim.netField(m.field); } }
  else if (m.t === 'cqres') { if (coop && coop.race && m.race === coop.race.id) { coop.race.done = true; coop.race.qOver = true; showCoopQuali(m.rows); } }
  else if (m.t === 'cround') { if (coop) coopGuestRound(m); }
}
// the agreement: how they buy in, their number, their name
const buyin = { kind: 'car', number: 0 };
function openBuyin() {
  if (!$('bi-name').value) $('bi-name').value = settings.driverName && settings.driverName !== 'Driver' ? settings.driverName : '';
  const taken = worldCar().number ?? 7; if (!buyin.number || buyin.number === taken) buyin.number = taken === 2 ? 3 : 2;
  focusIdx['s-buyin'] = 0; renderBuyin();
  fadeTo(() => { if (!sim) startAttract(); show('s-buyin'); }, 200);
}
function renderBuyin() {
  const w = world, T = w.teams[w.player.team], b = WC.buyinOf(w, buyin.kind), host = w.player.name.split(' ')[0], taken = worldCar().number ?? 7;
  $('bi-sub').textContent = `${T.name} · ${w.player.name}, owner · ${seriesName(w.player.series)}`;
  const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  $('bi-terms').innerHTML = `<div class="panel-title">The terms</div><div class="ti-name">${b.name}</div>
    <div class="ti-grid">${cell('To the team', b.cash ? WC.money$(b.cash) : b.per ? `${WC.money$(b.per)}<small> a round</small>` : '$0')}${cell('Your stake', b.stake + '%')}</div>
    <p>${b.blurb}</p>
    <div class="steps">
      <div><b>1</b><span>${host} drives car one. You drive car two, number ${buyin.number}.</span></div>
      <div><b>2</b><span>One team account. The bills are shared too: entries, travel, the crew, both cars' repairs.</span></div>
      <div><b>3</b><span>Disputes over who gets the new parts are settled by lap time.</span></div>
    </div>`;
  menus['s-buyin'][0].setItems([
    { label: 'How You Buy In', values: Object.keys(WC.BUYINS).map(k => [k, WC.BUYINS[k].short]), get: () => buyin.kind, set: v => { buyin.kind = v; renderBuyin(); },
      desc: `${T.name} has ${WC.money$(w.money.balance)} in the bank. What you bring goes in with it; your stake is your share of the team.` },
    { label: 'Your Number', values: Array.from({ length: 99 }, (_, i) => i + 1).filter(n => n !== taken).map(n => [n, String(n)]), get: () => buyin.number, set: v => { buyin.number = v; renderBuyin(); }, desc: `On your car and the timing screens. ${host} is number ${taken}.` },
    { label: 'Edit Name', action: () => $('bi-name').focus(), desc: 'Your first and last name, as the Wire will print it.' },
    { label: 'Sign The Agreement', cls: 'action primary', confirm: 'Sign it? Select again', action: () => signBuyin(), desc: `Sign, and you own ${b.stake}% of ${T.name}. The other driver in the team makes way for you.` },
    { label: 'Leave', action: () => backs['s-buyin'](), desc: 'Leave without signing.' },
  ], true);
}
function signBuyin() {
  const nm = personName($('bi-name').value);
  if (!nm || !nm.last || nm.first === nm.last) { $('bi-name').focus(); toast('Type your first and last name first.'); sfx.error(); return; }
  settings.driverName = `${nm.first} ${nm.last}`; saveSettings();
  net.send({ t: 'sign', ...nm, number: buyin.number, kind: buyin.kind, token: coopToken() });
  toast('Signed. Waiting for the countersignature&hellip;');
}
menus['s-buyin'] = [new Menu($('m-buyin'), [], { desc: 'd-buyin' })];
backs['s-buyin'] = () => { sfx.back(); leaveOnline(); };
$('bi-name').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.target.blur(); } });
$('bi-name').addEventListener('blur', () => clearEdges());

// ---------------- car select (on the grid, before the strategy) ----------------
const ENGINE_NAME = { f1v6: '1.6 V6 turbo hybrid', v10: '3.0 V10', v8flat: 'Flat-plane V8', v8cross: 'V8', v8truck: 'Big-block V8', i6: 'Straight six',
  i6turbo: 'Twin-turbo straight six', v6turbo: 'Twin-turbo V6', v6na: 'V6', flat6: 'Flat six', flat6turbo: 'Turbo flat six', flat12: 'Flat twelve', i4turbo: 'Turbo four', diesel: 'Turbo diesel' };
const CLASS_COL = { f1: '#e1261c', gt1: '#2a7fd0', street: '#e8b13a', shitbox: '#a8743a', fun: '#4f9a3c' };
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
    <div class="cs-chips"><span>${drive}</span><span>${s.gears.length - 1}-speed ${s.box || ''}</span><span>${ENGINE_NAME[C.sound] || ''}</span><span class="gold">${paint}</span><span>Setup: ${activeName(id) || 'Standard'}</span></div>
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
// drag the open space of the car select to look round the car, the wheel to come closer
(function carSelectDrag() {
  const el = $('s-carsel'); let drag = null;
  el.addEventListener('pointerdown', (e) => { if (e.target !== el || !sim || sim.state !== 'carselect') return; drag = { x: e.clientX, y: e.clientY }; el.classList.add('drag'); });
  window.addEventListener('pointermove', (e) => {
    if (!drag || !sim) return;
    sim.showroomLook(-(e.clientX - drag.x) * 0.008, (e.clientY - drag.y) * 0.005); drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerup', () => { drag = null; el.classList.remove('drag'); });
  el.addEventListener('wheel', (e) => { if (e.target !== el || !sim || sim.state !== 'carselect') return; sim.showroomLook(0, 0, Math.pow(1.001, e.deltaY)); }, { passive: true });
})();
function carSelectInput(dt) {
  const left = pressed('ArrowLeft') | pressed('KeyA') | pressed('GP14') | pressed('GPSL');
  const right = pressed('ArrowRight') | pressed('KeyD') | pressed('GP15') | pressed('GPSR');
  const up = pressed('ArrowUp') | pressed('KeyW') | pressed('GP12') | pressed('GPSU') | pressed('GP4') | pressed('KeyQ');
  const down = pressed('ArrowDown') | pressed('KeyS') | pressed('GP13') | pressed('GPSD') | pressed('GP5') | pressed('KeyE');
  const ok = pressed('Enter') | pressed('Space') | pressed('GP0') | pressed('GP9');
  const back = pressed('Escape') | pressed('Backspace') | pressed('GP1');
  const [rx, ry] = rightStick();
  if ((rx || ry) && sim) sim.showroomLook(rx * dt * 2.2, ry * dt * 1.2);
  if (csel.busy) return;
  if (back) { backs['s-carsel'](); return; }
  if (ok) { confirmCar(); return; }
  if ((pressed('KeyT') | pressed('GP3')) && !sim.net) { openTuning('s-carsel', csel.id); return; } // (online the grid's on a clock)
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
  // (a new car: its line, and for a new class the AI field's plans, can take a while the first time: the loading
  // screen says so rather than a black screen)
  const r = sim, car = { ...settings.car };
  fadeTo(async () => {
    if (!sim || sim !== r) return;
    showLoading(r.track); loadStep(0, 'Getting your car ready');
    await r.prepareCar(car, (f, label) => loadStep(f * 0.95, label));
    if (sim !== r) return;
    loadStep(1, '');
    fadeTo(() => { if (sim !== r) return; r.commitCar(car); r.startAfterPick(); enterRace(); });
  });
}
backs['s-carsel'] = () => { if (raceReturn === 'setup') { sfx.back(); fadeTo(() => { disposeSim(); openSetup(editorTrack, { select: sim?.track?.name ?? lastRace.track.name, toSettings: true }); }); } };

// ---------------- pre-race strategy ----------------
const TYRE_COL = { soft: '#e0302a', medium: '#f2d22a', hard: '#f0f0f0', wet: '#3a8af0', dirt: '#b8824a' };
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
  const comps = sim.dirt ? ['dirt', 'soft', 'medium', 'hard'] : sim.rain ? ['wet', 'soft', 'medium', 'hard'] : ['soft', 'medium', 'hard', 'wet'];
  const bounds = () => { const b = []; let a = 0; for (let k = 0; k < cu.length - 1; k++) { a += cu[k].laps; b.push(a); } return b; };
  const setBounds = (b) => { const cuts = [0, ...b, R]; cu.forEach((s, k) => s.laps = cuts[k + 1] - cuts[k]); };
  const tyreName = (c) => `<span class="tyre-dot" style="background:${TYRE_COL[c]}"></span>${c.toUpperCase()}`;
  const rows = [{ label: 'Pit Stops', cls: 'srow', values: Array.from({ length: Math.min(3, R - 1) + 1 }, (_, i) => [i, String(i)]), get: () => cu.length - 1,
    set: v => {
      const n = v + 1, cycle = sim.dirt ? ['dirt'] : sim.rain ? ['wet'] : ['medium', 'hard', 'soft'];
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
  const again = strat.locked === k;
  strat.locked = k;
  sim.confirmStrategy({ stints: plan.stints.map(s => ({ ...s })) });
  if (!sim.net) { beginHud(); return; }
  // online: locked in; the race starts when everyone is (the host, picking the same again, starts without them)
  netLock(); if (again && netLink()?.isHost && netWaiting().length) hostMaybeGo(true);
  sfx.best(); renderStrategy(); updateStratTimer();
}
function updateStratTimer() {
  const el = $('st-timer');
  if (!sim || !sim.net) { el.innerHTML = ''; return; }
  const wait = netWaiting(), host = netLink()?.isHost, list = (a) => a.length > 1 ? `${a.slice(0, -1).join(', ')} AND ${a.at(-1)}` : a[0];
  const others = wait.filter(n => n !== sim.player?.name);
  el.innerHTML = strat && strat.locked !== null
    ? (sim.net.goT != null ? 'LOCKED IN &middot; <b>STARTING</b>' : others.length ? `LOCKED IN &middot; WAITING FOR <b>${list(others)}</b>${host ? ' &middot; PICK IT AGAIN TO START WITHOUT THEM' : ''}` : 'LOCKED IN &middot; <b>STARTING</b>')
    : 'PICK A STRATEGY &middot; THE RACE STARTS WHEN EVERYONE HAS LOCKED IN';
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

// the loading screen's progress bar and what it's doing
function loadStep(v, label) {
  $('load-fill').style.setProperty('--v', v);
  if (label !== undefined) $('load-step').textContent = label;
}
// the loading screen for a circuit (its picture, conditions and a tip)
function showLoading(track) {
  show('s-loading');
  $('load-name').textContent = track.name;
  $('load-sub').textContent = `${THEMES[track.env.theme].label} · ${track.env.time} · ${track.env.weather}`.toUpperCase();
  $('load-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  drawLoadArt(track);
  const li = $('load-img'); li.classList.remove('on');
  getPostcard(pcKey(track, { time: track.env.time, weather: track.env.weather })).then(v => v || getPostcard(pcKey(track, pickConditions(track))))
    .then(v => { if (v && screen === 's-loading') { li.src = v; li.classList.add('on'); } });
}

function startRace(track, cfg, ret, quick = false) {
  if (ret !== 'gig') { gig = null; document.body.classList.remove('gig-on'); }
  clearTimeout(developT);
  raceReturn = ret;
  raceAidRule = ret === 'online' ? (cfg.extra && cfg.extra.aidRule) || 'any' : 'any';
  lastRace = { track: cloneTrack(track), cfg: { ...cfg }, ret };
  fadeTo(() => {
    disposeSim();
    showLoading(track); // (with the real picture of the circuit, if we've taken one in these conditions)
    const fill = $('load-fill');
    fill.style.setProperty('--v', 0); loadStep(0, 'Loading the scenery');
    setTimeout(async () => {
      await loadEnvModels(); // the setting's models (usually loaded long before)
      if (needsHydrate(track)) track = await hydrateReal(cloneTrack(track)).catch(() => track); // a real circuit's hills + scenery
      loadStep(0.05, 'Building the circuit');
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      const t0 = performance.now();
      // (built a step at a time: the first race on a circuit in a car fits its line and the AI learns the circuit,
      // which takes a while; the page stays responsive and says what it's doing)
      const r = new Race(track, {
        mode: cfg.mode, laps: cfg.laps || track.env.laps || 3, opponents: cfg.opponents ?? track.env.opponents ?? 7, qualiTime: cfg.qualiTime, practiceTime: cfg.practiceTime,
        difficulty: settings.difficulty, grid: settings.grid, team: settings.team, gearbox: settings.gearbox, aids: aidsNow(), ghost: settings.ghost,
        units: settings.units, camera: settings.camera, racingLine: settings.racingLine, car: settings.car,
        wear: settings.wear, temps: settings.temps, damage: settings.damage, rules: settings.rules, aiMistakes: settings.aiMistakes, startTyre: settings.startTyre, aiChassis: settings.aiChassis, drift: raceReturn === 'setup' ? settings.drift : 'off',
        pickCar: !!cfg.pick && !quick, pitWall: settings.pitWall !== 'off',
        ...(cfg.extra || {}), defer: true,
      }, renderer);
      await r.prepare((f, label) => loadStep(0.08 + f * 0.82, label));
      if (screen !== 's-loading') { r.dispose?.(); return; } // (left while it was building)
      sim = r;
      loadStep(0.92, 'Warming up');
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
        loadStep(1, '');
        setTimeout(() => fadeTo(enterRace), 250);
      }, wait);
    }, 120);
  });
}

// after loading (and after the car select): the next pre-race screen, or straight into the race
function enterRace() {
  if (sim.state === 'carselect') { openCarSelect(); return; }
  if (sim.state === 'strategy') { openStrategy(); return; }
  if (sim.quali && sim.player && sim.player.inGarage) { if (sim.net) netLock(); openPitGarage(); return; } // (sessions start in your garage; online, the clock starts once everyone's loaded)
  beginHud();
  if (sim.quali) {
    const q = Math.round(sim.quali.time / 60), name = SESSION_NAME[sim.quali.kind].toUpperCase();
    hud.help(`<b>${name} &middot; ${q} MINUTES</b><br>Runs from the start line, the clock starts as you cross it. ${sim.quali.kind === 'practice' ? 'Learn the circuit and find your pace.' : 'Your fastest lap decides where you start the race.'}`, 7000);
  }
  if (sim.mode === 'test' && raceReturn === 'testday') hud.help(lastRace.cfg.brief, 7000);
  else if (sim.mode === 'test') {
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
      if ((raceReturn === 'career' || raceReturn === 'world' || raceReturn === 'gig') && lastRace.cfg.brief) setTimeout(() => hud.help(lastRace.cfg.brief, 7000), 1200);
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
      if (raceReturn === 'gig') gigLap();
      if (sim.mode === 'race' && ev.lap <= ev.laps) hud.center(ev.lap === ev.laps ? 'FINAL LAP' : `LAP ${ev.lap}`, '', 1600);
    } else if (ev.type === 'finish') {
      sfx.finish();
      const p = ev.pos, o = ['TH', 'ST', 'ND', 'RD'][(p % 100 - 20) % 10] || ['TH', 'ST', 'ND', 'RD'][p % 100] || 'TH';
      const ds = sim.drift ? ` &middot; DRIFT ${Math.round(sim.drift.total).toLocaleString('en-US')}` : '';
      const pen = ev.pen ? ` &middot; +${ev.pen}s PENALTY TO ADD` : '';
      hud.center(p === 1 ? `WINNER!<span class="sub">${pen ? 'ACROSS THE LINE FIRST' + pen : 'RACE PASSED &middot; RESPECT +'}${ds}</span>` : `${p}${o} PLACE<span class="sub">RACE COMPLETE${pen}${ds}</span>`, p === 1 ? '' : 'white', 4500);
    } else if (ev.type === 'results') {
      const go = () => { if (raceReturn === 'gig') gigFinish(); else if (raceReturn === 'world') { if (sim.net) coopFinish(); else worldRoundDone(); } else if (raceReturn === 'career') careerRoundDone(); else if (raceReturn === 'online') { if (screen !== 's-results') showNetResults(); } else if (raceReturn === 'coop') { if (screen !== 's-results' && screen !== 's-round') showCoopLive(); } else showResults(); };
      if (sim.net || !openPodium(go)) go();
    }
    else if (ev.type === 'qflag') { if (ev.onLap) hud.center('CHEQUERED FLAG<span class="sub">FINISH THIS LAP</span>', 'white', 2600); }
    else if (ev.type === 'qpole') { sim.rc.say(`${ev.kind === 'practice' ? 'Fastest' : 'Provisional pole'} · ${ev.name} · ${fmtTime(ev.time, 3)}`, { cls: 'g', me: ev.name === sim.player?.name }); }
    else if (ev.type === 'garage') { if (!ev.first && screen === 'hud') fadeTo(() => openPitGarage(), 250); }
    else if (ev.type === 'qdone') {
      const me = sim.qualiRows().find(r => r.isPlayer);
      sfx.finish();
      const inGarage = screen === 's-pitgarage';
      hud.center(`SESSION COMPLETE<span class="sub">${me.pos === 1 ? (sim.quali.kind === 'practice' ? 'FASTEST' : 'POLE POSITION') : 'P' + me.pos}${isFinite(me.best) ? ' &middot; ' + fmtTime(me.best, 3) : ''}</span>`, me.pos === 1 ? '' : 'white', 2600);
      setTimeout(() => { if (sim && sim.quali && sim.quali.done && (screen === 'hud' || screen === 's-pitgarage')) { if (sim.net) coopSessionDone(); else showQualiResults(); } }, inGarage ? 900 : 2600);
    }
    else if (ev.type === 'gate') hud.gate(ev);
    else if (ev.type === 'tdata') keepTrackData();
    else if (ev.type === 'progLap') {
      const pc = Math.round(ev.rating * 100), need = Math.round(ACCLIM_PASS * 100);
      hud.radio('eng', ev.done ? `That's the job done, ${pc}% on that lap. ${ev.marks ? `${ev.marks} brake point${ev.marks === 1 ? '' : 's'} marked for the weekend.` : 'Nail the red gates and we\'ll mark your brake points.'}`
        : ev.rating >= ev.best && ev.rating >= ACCLIM_PASS ? `${pc}%. Best one yet.`
        : ev.rating >= ACCLIM_PASS ? `${pc}% that time.` : `${pc}% on that lap. We need ${need}. Get the speed right in the red gates.`, { big: ev.done });
      if (ev.done) sfx.best();
    }
    else if (ev.type === 'dsq') { hud.center('DISQUALIFIED<span class="sub">BLACK FLAG</span>', 'white', 4500); sfx.error(); }
    else if (ev.type === 'rc') { hud.rcMessage(ev.msg, ev.cls, ev.me); if (ev.me && (ev.cls === 'pen' || ev.cls === 'bw' || ev.cls === 'bk' || ev.cls === 'mo')) sfx.error(); else if (ev.me) sfx.select(); }
    else if (ev.type === 'failure') carFailure(ev);
    else if (ev.type === 'crashout') crashOut(ev);
    else if (ev.type === 'radio') { hud.radio(ev.who || 'eng', ev.msg, { big: ev.big, name: ev.name, color: ev.color }); if (ev.big) sfx.lap(); }
    // the pit wall's calls (race.js wallUpdate): the question, then what was chosen
    else if (ev.type === 'call') { const c = ev.call; hud.radioCall(c.who, c.msg, c.a, c.b, c.rec); sfx.lap(); }
    else if (ev.type === 'callDone') { hud.callDone(ev.which); if (!ev.late) sfx.select(); }
    else if (ev.type === 'pitIn') { pitSel = 0; sfx.select(); }
    else if (ev.type === 'pitOut') { hud.split(`<span class="t">PIT STOP</span><span class="faster">${ev.time.toFixed(1)}s</span>`, 2500); sfx.go(); }
    else if (ev.type === 'line') { settings.racingLine = ev.mode; saveSettings(); noteAidBonus(); menus['s-options']?.[0]?.render(); hud.help(`Racing line: <b>${{ off: 'OFF', brake: 'BRAKING ONLY', full: 'FULL' }[ev.mode]}</b>`, 1500); }
  }
}

const driftRecords = () => { try { return JSON.parse(localStorage.getItem('svgp.drift') || '{}'); } catch (e) { return {}; } };
// ---- the podium: after a race, the top three on the steps, before the results ----
let podiumNext = null;
const escP = (t) => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function openPodium(next) {
  if (!sim || sim.mode !== 'race' || sim.drift || sim.net || raceReturn === 'gig' || !sim.drivers) return false;
  const top = sim.classified().slice(0, 3);
  if (!top.length || !sim.drivers.podium(top)) return false;
  podiumNext = next; sim.setPaused(true);
  const plate = (car, k) => {
    const who = podiumWho(car), img = portrait(who.id, who.team, () => { if (screen === 's-podium') renderPodiumPlates(top); }, who.own);
    return `<div class="pod-plate p${k + 1}${car.isPlayer ? ' me' : ''}"><div class="pod-face">${img ? `<img src="${img}">` : ''}</div><b>${k + 1}</b><div><span>${escP(car.isPlayer ? (settings.driverName || car.name) : car.name)}</span><small>${escP(car.team.name)}</small></div></div>`;
  };
  renderPodiumPlates = (cars) => { $('pod-plates').innerHTML = [1, 0, 2].filter(k => cars[k]).map(k => plate(cars[k], k)).join(''); };
  renderPodiumPlates(top);
  $('pod-sub').textContent = `${sim.track.name} \u00b7 ${sim.laps} lap${sim.laps === 1 ? '' : 's'}`;
  menus['s-podium'][0].setItems([{ label: 'Results', cls: 'action primary', action: () => podiumDone(), desc: '' }]);
  fadeTo(() => show('s-podium'), 400);
  return true;
}
let renderPodiumPlates = () => {};
// who a car's driver is, for their portrait: you in your own suit; a World Career person; the stock field's names
function podiumWho(car) {
  if (car.isPlayer) return { id: 'P:' + (settings.driverName || 'You'), team: car.team, own: { livery: car.model.cfg, face: car.model.cfg?.face, key: 'me' } };
  return { id: sim.driverId(car.teamIdx, car.team), team: car.team };
}
function podiumDone() { const n = podiumNext; podiumNext = null; if (n) { sfx.select(); n(); } }
menus['s-podium'] = [new Menu($('m-podium'), [])];
backs['s-podium'] = () => podiumDone();
HINTS['s-podium'] = [['ok', 'Results']];
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
  $('pause-title').textContent = raceReturn === 'online' || sim.net ? 'Race Menu' : 'Paused';
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
  $('pause-sub').textContent = `${sim.track.name} · ${raceReturn === 'online' || sim.net ? 'the race goes on while this menu is open' : race ? (raceReturn === 'career' ? 'Challenge round ' + (career.round + 1) : raceReturn === 'world' ? `${WC.seriesById(world.player.series).name} round ${world.round + 1}` : raceReturn === 'gig' && gig ? WC.GIG_KINDS[gig.g.kind].name : 'Quick Race') : raceReturn === 'editor' ? 'Test drive' : raceReturn === 'testday' ? 'Test day' : 'Time Trial'}`;
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
      <div>${key('<kbd>1</kbd><kbd>2</kbd>', '<kbd class="pb x">X</kbd><kbd class="pb b">B</kbd>')}<span>Answer the radio</span></div>
      <div>${key('<kbd>Space</kbd>', '<kbd class="pb a">A</kbd>')}<span>Handbrake</span></div>
      <div>${key('<kbd>E</kbd><kbd>Q</kbd>', '<kbd class="pl">RB</kbd><kbd class="pl">LB</kbd>')}<span>Shift (manual)</span></div>
    </div>`;
}
function pause() {
  if (!sim || sim.mode === 'attract') return;
  driftHud.quiet();
  const opts = { label: 'Options', action: () => openOptions('s-pause'), desc: 'Sound, camera, driving aids and the screen look.' };
  // (offline only: online the race goes on; not on the podium, which has its own stage)
  const photoItem = { label: 'Photo Mode', action: () => openPhoto(), desc: 'Frame a shot of your car, with your driver out beside it if you like.' };
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
  if (sim.net && (raceReturn === 'world' || raceReturn === 'coop')) {
    // (co-op: the same, the round's scored when you're both done; a session: back to the garage instead of retiring)
    const host = raceReturn === 'world';
    if (sim.quali) { menus['s-pause'][0].setItems([{ label: 'Resume', cls: 'action primary', action: () => show('hud') }, opts,
      ...(sim.player && !sim.player.inGarage && !sim.T.open ? [{ label: 'Return To Garage', action: () => { sim.enterGarage(sim.player); openPitGarage(); }, desc: 'Back to your box: change tyres, watch the timing, go out again. The clock keeps running.' }] : []),
      ...(host ? [] : [{ label: 'Leave Session', confirm: 'Leave? Select again', action: () => leaveOnline(), desc: 'Leave the career and go back to the main menu.' }])]);
      pauseInfo(); show('s-pause'); sfx.back(); return; }
    menus['s-pause'][0].setItems([
      { label: 'Resume', cls: 'action primary', action: () => show('hud') },
      opts,
      { label: 'Retire', confirm: 'Retire? Select again', action: () => { if (host) worldEnd(true); else { sim.retire(); showCoopLive(); } }, desc: 'Stop racing: you\'re classified as retired. Watch the rest come in.' },
      ...(host ? [] : [{ label: 'Leave Session', confirm: 'Leave? Select again', action: () => leaveOnline(), desc: 'Leave the career and go back to the main menu.' }]),
    ]);
    pauseInfo(); show('s-pause'); sfx.back();
    return;
  }
  sim.setPaused(true);
  const test = raceReturn === 'editor';
  // (for testing race control: the next step each time, VSC, then the safety car taking over from it, then in)
  const rc = sim.rc, rcTest = sim.mode === 'race' && rc && rc.on && sim.state === 'racing' ? (rc.sc ? { label: 'Test: Safety Car In', action: () => { resume(); if (sim.sc && rc.sc.phase === 'out') rc.setSc('in'); }, desc: 'For testing. Its lights go out and it comes in at the end of this lap.' }
    : rc.vsc ? { label: 'Test: Upgrade To Safety Car', action: () => { resume(); if (sim.pit) rc.setSc('out', 'test'); }, desc: sim.pit ? 'For testing. The VSC becomes a full safety car, out ahead of the leader.' : 'This circuit has no pit lane, so no safety car (VSC only).' }
    : { label: 'Test: Call A VSC', action: () => { resume(); rc.setVsc('on', 'test'); }, desc: 'For testing. A Virtual Safety Car now. Pause again to upgrade it to a full safety car.' }) : null;
  if (sim.quali) {
    const nm = SESSION_NAME[sim.quali.kind].toLowerCase();
    const end = { label: 'End Session', confirm: 'End it? Select again', action: () => { resume(); sim.qualiEnd(); }, desc: `Finish ${nm} now. The AI still post their laps.` };
    const box = sim.T.open ? (sim.player && !sim.player.inGarage ? [{ label: 'Back To The Top', confirm: 'Give up this run? Select again', action: () => { sim.setPaused(false); sim.endRun(sim.player); if (!sim.quali.done) openPitGarage(); else show('hud'); }, desc: `Abandon this run and go back up to the garage. It still counts as one of your ${sim.quali.runs || 1} runs.` }] : [])
      : [{ label: 'Return To Garage', action: () => { sim.setPaused(false); sim.enterGarage(sim.player); openPitGarage(); }, desc: 'Back to your box: change tyres, watch the timing, go out again when you like.' }];
    menus['s-pause'][0].setItems(raceReturn === 'career' || raceReturn === 'world' ? [{ label: 'Resume', cls: 'action primary', action: resume }, photoItem, ...box, end, opts]
      : [{ label: 'Resume', cls: 'action primary', action: resume }, photoItem, ...box, end,
         { label: 'Restart Session', confirm: 'Restart? Select again', action: () => { if (weekend.car || weekend.roster) keepWeekend(); startSession(weekend.stage); }, desc: `The ${nm} session again from the start.` },
         opts, { label: 'Quit', confirm: 'Quit? Select again', action: () => { weekend = null; quitToMenu(); }, desc: 'Back to the main menu.' }]);
    pauseInfo(); show('s-pause'); sfx.back();
    return;
  }
  // (time trial, a test day, the editor's test drive: the acclimatization gates, on or off)
  const gates = sim.mode === 'test' && sim.player && raceReturn !== 'drivehome' && raceReturn !== 'gig' ? [{ label: `Acclimatization Gates<small>${sim.prog ? 'On' : 'Off'}</small>`,
    action: () => { sim.setProgramme(sim.prog ? null : 'acclim'); sfx.select(); resume(); },
    desc: sim.prog ? 'Take the gates down.' : progById('acclim').desc.replace('for the rest of the weekend', raceReturn === 'testday' ? 'for the race weekend' : 'for the rest of this drive') }] : [];
  if (raceReturn === 'drivehome') {
    menus['s-pause'][0].setItems([
      { label: 'Resume', cls: 'action primary', action: resume }, photoItem, opts,
      { label: 'Skip The Drive', action: () => { sim.setPaused(false); finishDrive(); }, desc: 'Home already.' },
    ]);
  } else if (raceReturn === 'gig' || raceReturn === 'testday') {
    menus['s-pause'][0].setItems([
      { label: 'Resume', cls: 'action primary', action: resume }, photoItem, ...gates,
      opts,
      raceReturn === 'gig' ? { label: 'Abandon The Job', confirm: 'Abandon it? Select again', action: () => gigFinish(true), desc: 'You won\'t be paid, and it goes on your record.' }
        : { label: 'End The Test Day', action: () => testFinish(), desc: 'Pack up and go home. Five laps or more finds a setup.' },
    ]);
  } else if (raceReturn === 'career' || raceReturn === 'world') {
    menus['s-pause'][0].setItems([
      { label: 'Resume', cls: 'action primary', action: resume }, photoItem,
      opts,
      ...(rcTest ? [rcTest] : []),
      { label: 'Retire', confirm: 'Retire? Select again', action: () => raceReturn === 'world' ? worldEnd(true) : careerRoundDone(true), desc: 'You will be classified last in this round.' },
    ]);
  } else menus['s-pause'][0].setItems([
    { label: 'Resume', cls: 'action primary', action: resume }, photoItem, ...gates,
    { label: 'Restart', confirm: 'Restart? Select again', action: () => startRace(lastRace.track, lastRace.cfg, lastRace.ret, true), desc: 'Start this race again from the grid.' },
    ...(rcTest ? [rcTest] : []),
    opts,
    ...(test || fromEditor ? [{ label: 'Back To Editor', confirm: test ? null : 'Back to editor? Select again', action: () => backToEditor(), desc: 'Carry on building this circuit.' }] : []),
    ...(test ? [] : [{ label: 'Quit Race', confirm: 'Quit? Select again', action: () => quitToMenu(), desc: 'Back to the main menu.' }]),
  ]);
  pauseInfo();
  show('s-pause');
  sfx.back();
}
function resume() { show('hud'); sim.setPaused(false); }

// ---------------- photo mode ----------------
// From the pause menu: the race stays frozen, the camera's yours (js/photomode.js). The options sit in a small panel
// on the left (the d-pad / arrows), the sticks or WASD move the camera, A / Space takes the shot (saved as a PNG)
const photo = new PhotoMode();
let photoShot = false, photoBusy = false;
function photoItems() {
  const row = (k, label, desc) => ({ label, values: PHOTO_OPTS[k], get: () => photo.o[k], set: v => photo.set(k, v), desc });
  return [
    { label: 'Lens', values: [[-1, ''], [1, '']], get: () => 0, set: () => {}, show: () => photo.lensLabel(), desc: 'Wide (14 mm) to telephoto (200 mm). A long lens from further back flattens the shot; a wide one up close stretches it. <b>Zoom</b> goes in between. <b>Look</b> turns the camera off the car; click the right stick (or <b>C</b>) to face it again.' },
    row('pose', 'Driver', 'Your driver out of the car. A lean needs bodywork at hip height: by an F1 car they stand.'),
    row('side', 'Side', 'Which side of the car they stand.'),
    row('spot', 'Where', 'By the door, or at a wheel.'),
    row('helmet', 'Helmet', 'On or off.'),
    row('others', 'Other cars', 'Hide everyone else for a clean shot.'),
    row('fstop', 'Aperture', 'How much is in focus. A wide aperture (<b>f/1.4</b>) on a long lens close up blurs everything but the subject; <b>f/11</b> keeps nearly all of it sharp.'),
    row('focus', 'Focus', 'What the lens focuses on. <b>Background</b>: the far distance sharp, the car soft in front of it.'),
    row('look', 'Picture', '<b>Game</b>: the shot as you see it, scaled up crisply. <b>Sharp</b>: full resolution, no pixelation.'),
  ];
}
function openPhoto() {
  if (!sim || sim.net || !(sim.player || sim.focus)) return;
  photo.enter(sim);
  $('s-photo').classList.remove('bare');
  menus['s-photo'][0].setItems(photoItems());
  show('s-photo');
}
function leavePhoto() { photo.leave(); post.setSharp(false); post.setDof(null); pauseInfo(); show('s-pause'); sfx.back(); }
function photoHide() { $('s-photo').classList.toggle('bare'); sfx.move(); }
menus['s-photo'] = [new Menu($('m-photo'), [], { desc: 'd-photo' })];
// the Lens row's arrows step through the lenses (its value list is just the two directions)
menus['s-photo'][0].change = function (d) { const it = this.items[this.i]; if (!it || !it.values) return; if (it.label === 'Lens') photo.lens(d); else Menu.prototype.change.call(this, d); sfx.move(); this.render(); };
backs['s-photo'] = () => leavePhoto();
let photoDrag = null;
// (the mouse: drag to orbit, right-drag to look about)
canvas.addEventListener('pointerdown', (e) => { if (screen === 's-photo') { photoDrag = { x: e.clientX, y: e.clientY, look: e.button === 2 }; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('contextmenu', (e) => { if (screen === 's-photo') e.preventDefault(); });
canvas.addEventListener('pointermove', (e) => {
  if (screen !== 's-photo' || !photoDrag) return;
  const dx = e.clientX - photoDrag.x, dy = e.clientY - photoDrag.y, k = Math.min(1, 35 / photo.mm);
  if (photoDrag.look) { photo.lookYaw = Math.max(-Math.PI, Math.min(Math.PI, photo.lookYaw - dx * 0.004 * k)); photo.lookPitch = Math.max(-1.2, Math.min(1.2, photo.lookPitch - dy * 0.004 * k)); }
  else { photo.yaw -= dx * 0.006; photo.pitch = Math.max(-0.15, Math.min(1.45, photo.pitch + dy * 0.004)); }
  photoDrag.x = e.clientX; photoDrag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => { photoDrag = null; });
canvas.addEventListener('wheel', (e) => { if (screen === 's-photo') { e.preventDefault(); photo.dist = Math.max(1.5, Math.min(30, photo.dist * Math.exp(e.deltaY * 0.001))); } }, { passive: false });
function photoInput(dt, pad) {
  const m = menus['s-photo'][0];
  if (pressed('Escape') | pressed('Backspace') | pressed('GP1')) return leavePhoto();
  if (pressed('KeyH') | pressed('GP3')) photoHide();
  if (pressed('KeyC') | pressed('GP11')) photo.recenter();
  if (pressed('Space') | pressed('Enter') | pressed('GP0')) photoShot = true;
  // the menu on the d-pad / arrows only (the sticks and WASD are the camera)
  if (pressed('ArrowUp') | pressed('GP12')) m.move(-1);
  if (pressed('ArrowDown') | pressed('GP13')) m.move(1);
  if (pressed('ArrowLeft') | pressed('GP14')) m.change(-1);
  if (pressed('ArrowRight') | pressed('GP15')) m.change(1);
  const k = (a, b) => (isDown(a) ? 1 : 0) - (isDown(b) ? 1 : 0);
  const dz = (v) => Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
  const ax = (i) => pad ? dz(pad.axes[i] || 0) : 0, bt = (i) => pad && pad.buttons[i] && pad.buttons[i].value > 0.08 ? pad.buttons[i].value : 0;
  photo.update(dt, {
    orbitX: k('KeyD', 'KeyA') + ax(0), orbitY: k('KeyW', 'KeyS') - ax(1),
    lookX: k('KeyL', 'KeyJ') + ax(2), lookY: k('KeyI', 'KeyK') - ax(3),
    dolly: k('KeyE', 'KeyQ') + bt(5) - bt(4), zoom: k('KeyX', 'KeyZ') + bt(7) - bt(6),
  });
  post.setDof(photo.dof());
  const vt = m.el.querySelector('.item[data-k="0"] .vt'); if (vt) vt.textContent = photo.lensLabel(); // (the zoom moves it)
}
// right after the frame's render: the canvas still holds it
function photoCapture() {
  if (photoBusy) return;
  photoBusy = true; sfx.shutter();
  const fl = $('photo-flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  photo.capture(renderer.domElement, post.cfg.filter === 'sharp').then(url => {
    photoBusy = false;
    if (!url) return;
    const img = $('photo-last'); img.src = url; img.classList.remove('on'); void img.offsetWidth; img.classList.add('on');
    const d = $('d-photo'); d.innerHTML = 'Saved to your <b>Downloads</b> folder.'; d.classList.add('on');
  });
}
menus['s-pause'] = [new Menu($('m-pause'), [], { desc: 'd-pause' })];
backs['s-pause'] = () => resume();
backs['hud'] = () => pause();
function quitToMenu() { fromEditor = false; weekend = null; if (coop) { if (coop.host) coopEnd(); else { coop = null; world = null; } } if (net) { net.close(); net = null; lobby = null; netRace = null; } fadeTo(() => { disposeSim(); startAttract(); show('s-main'); }); }

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
  if (m.opts.cols) { const c = m.opts.cols(); if (up) m.jump(-c); if (down) m.jump(c); if (left) m.jump(-1); if (right) m.jump(1); if (ok) m.activate(); return; } // (a grid of cards)
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
// World Career: how much of the review you can read depends on your data engineer (WC.dataLevel: 0 junk, 1 the charts,
// 2 the notes too). Elsewhere it's all readable.
let rvLevel = 2;
const RV_JUNK = '.rv-laps .menu, #rv-sum, #rv-tabs, #rv-notes, #rv-pop, #rv-legend-trace, #rv-legend-line, #rv-sub, #d-review';
const rvWatch = new MutationObserver(() => rvTidy());
function rvTidy() {
  if (screen !== 's-review') return;
  rvWatch.disconnect();
  if (rvLevel === 0) document.querySelectorAll(RV_JUNK).forEach(el => garbleTree(el));
  else if (rvLevel === 1) { const n = $('rv-notes'); if (!n.querySelector('.rv-junior')) n.innerHTML = `<p class="rv-junior">${staffName('engineer')} reads the charts, not the driver. A senior data engineer would add notes here on where the time went.</p>`; }
  if (rvLevel < 2) document.querySelectorAll(RV_JUNK).forEach(el => rvWatch.observe(el, { childList: true, subtree: true, characterData: true }));
}
const staffName = (role) => { const x = world && WC.staffOf(world, role); return x ? x.first : 'Your engineer'; };
function openLapReview(from = 's-pitgarage') {
  if (!sim || !sim.player) return;
  reviewFrom = from;
  rvLevel = raceReturn === 'world' && world ? WC.dataLevel(world) : 2;
  setScramble(rvLevel === 0);
  requestAnimationFrame(() => rvTidy());
  const pl = sim.player, T = sim.T, key = lapKey(sim.track, T, pl.carId);
  rv = { key, T, corners: sim.corners.list, laps: lapsFor(key).slice(-14), carId: pl.carId, pb: loadPB(key, T), cmp: rv ? rv.cmp : 'ref', focus: -1, sel: 0, cursor: -1, map: null, boards: sim.world.boards || [] };
  rv.zones = boardZones(rv.boards, T);
  const best = rv.laps.reduce((b, l, k) => (l.valid && (b < 0 || l.time < rv.laps[b].time) ? k : b), -1);
  rv.best = best; rv.sel = best >= 0 ? best : rv.laps.length - 1;
  const kind = sim.quali ? (sim.quali.kind === 'practice' ? 'Practice' : 'Qualifying') : sim.mode === 'test' ? 'Time Trial' : 'Race';
  $('rv-sub').textContent = `${sim.track.name} · ${CARS[pl.carId]?.name || ''} · ${kind}`;
  $('s-review').classList.toggle('empty', !rv.laps.length);
  $('rv-nodata').hidden = rvLevel !== 0 || !rv.laps.length; // (no laps: there's nothing to not understand yet)
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
backs['s-review'] = () => { sfx.back(); rvWatch.disconnect(); setScramble(false); show(reviewFrom); if (reviewFrom === 's-pitgarage' && sim && sim.quali && sim.quali.done) showQualiResults(); };
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
  if (screen === 's-opening') return 'silent'; // (the opening has its own sound: the TV)
  if (!sim || sim.mode === 'attract' || (screen !== 'hud' && screen !== 's-pause' && screen !== 's-options' && screen !== 's-photo')) return 'menu';
  if (screen !== 'hud' || sim.paused) return 'pause';
  if (sim.state === 'racing' || sim.state === 'finished') return 'race';
  return sim.state === 'intro' || sim.state === 'countdown' ? 'grid' : 'pause';
}
let last = performance.now();
let resultsT = 0;
// every frame. An error in one doesn't stop the game (online the AI and the clock would freeze for everyone): it's
// logged, shown once with what it was, kept (svgp.lastError: the message and where), and the next frame goes on
let frameErr = null;
function frame(now) {
  try { frameBody(now); }
  catch (e) {
    console.error('frame', e);
    const key = String(e && e.message);
    if (frameErr !== key) { frameErr = key; try { localStorage.setItem('svgp.lastError', JSON.stringify({ at: new Date().toISOString(), msg: key, stack: String(e && e.stack || '').split('\n').slice(0, 6).join(' | '), screen, mode: sim && sim.mode, online: !!(sim && sim.net) })); } catch (x) {}
      toast(`Something went wrong: <b>${escP(key).slice(0, 140)}</b>. The game carried on; tell Claude this message.`, 9000); }
  }
  requestAnimationFrame(frame);
}
function frameBody(now) {
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
      // (rows: the tyres, then each damaged part: fix it or leave it)
      const parts = pl.pitReq.tyre !== undefined ? sim.pitParts(pl) : [], n = 1 + parts.length;
      pitSel = Math.min(pitSel, n - 1);
      if (up || dn) { pitSel = (pitSel + (dn ? 1 : -1) + n) % n; sfx.move(); }
      if (lf || rt) {
        const d = rt ? 1 : -1;
        if (pitSel === 0) { const opts = [null, 'soft', 'medium', 'hard', 'wet', ...(sim.dirt ? ['dirt'] : [])]; let k = opts.indexOf(pl.pitReq.tyre); pl.pitReq.tyre = opts[(k + d + opts.length) % opts.length]; }
        else sim.toggleFix(pl, parts[pitSel - 1].k);
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
    // the radio's call: X / 1, B / 2 (only while one's open: X is a brake button too, so a call takes its tap)
    if (sim.call) { if (pressed('Digit1') || pressed('GP2')) sim.answerCall('a'); else if (pressed('Digit2') || pressed('GP1')) sim.answerCall('b'); hud.callTick(sim.call ? sim.call.left : 0); }
    if (pressed('Escape') || pressed('KeyP') || pressed('GP9')) pause();
    else {
      sim.update(dt, ctl, press);
      handleRaceEvents();
      if (sim) { const hs = sim.hudState(); hud.update(hs, sim); hud.pitMenu(hs, pitSel, true); driftHud.update(sim.drift, dt); }
      if (gig) gigTick(dt);
      if (drive) driveTick();
    }
  } else if (screen === 's-carsel' && sim) {
    carSelectInput(dt);
    if (sim && sim.net && csel) {
      const txt = csel.busy ? 'Locked In' : 'Select Car';
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
  } else if (screen === 's-tuning') {
    // tuning: whatever it was opened over carries on behind it (the pit garage's session, the grid); the right stick
    // looks round the car
    menuInput();
    { const [rx, ry] = rightStick(); if (rx || ry) tuningLook(rx * dt * 2.2, ry * dt * 1.2); }
    if (sim && (tuningFrom === 's-pitgarage' || tuningFrom === 's-carsel')) { sim.update(dt, { steer: 0, throttle: 0, brake: 0 }, {}); handleRaceEvents(); }
    if (tuningFrom === 's-pitgarage') pitGarage.update(dt);
    if (tuningFrom === 's-garage') garage.update(dt);
  } else if (screen === 's-pitgarage' && sim) {
    // the pit garage: the session carries on (the clock, the AI's laps) while you're in the menu
    if (pgPcFocus) pgPcInput(); else menuInput();
    if (sim) {
      sim.update(dt, { steer: 0, throttle: 0, brake: 0 }, {});
      handleRaceEvents();
      if (sim && sim.quali && screen === 's-pitgarage' && (pgInfoT += dt) > 0.25) { pgInfoT = 0; renderGarageInfo(); }
    }
    pitGarage.update(dt);
    // at the desk: the computer rides the monitor's glass once the camera's there; LB / RB (Q / E) flip its sections;
    // the timing on it moves on every second
    if (pgDesk && screen === 's-pitgarage') {
      if (pitGarage.atDesk && !pc.isOpen) { pc.crisp = true; pc.open(); pc.goto('weekend'); renderHints(); }
      if (pc.isOpen) { const r = pitGarage.screenRect(); if (r) pc.place(r); if (!pgPcFocus && (pressed('KeyQ') | pressed('GP4'))) pc.flip(-1); if (!pgPcFocus && (pressed('KeyE') | pressed('Tab') | pressed('GP5'))) pc.flip(1); if ((pgPcT += dt) > 1) { pgPcT = 0; pc.render(); } }
      if (pc.idleDirty) { pc.idleDirty = false; pitGarage.refreshScreen(); }
    }
  } else if (screen === 's-garage' || screen === 's-livery') {
    if (screen === 's-garage') menuInput(); else clearEdges();
    garage.update(dt);
  } else if (screen === 's-opening') {
    if (pressed('Escape') | pressed('Backspace') | pressed('GP1')) opening.back();
    if (pressed('Enter') | pressed('Space') | pressed('GP0')) opening.confirm();
    if (pressed('ArrowLeft') | pressed('GP14')) opening.nav(-1);
    if (pressed('ArrowRight') | pressed('GP15')) opening.nav(1);
    if (pressed('ArrowUp') | pressed('GP12')) opening.nav(-1, 'y');
    if (pressed('ArrowDown') | pressed('GP13')) opening.nav(1, 'y');
    opening.update(dt);
  } else if (screen === 's-wheel') {
    wheelInput();
    wheelSetup.update(dt);
    if (sim && sim.mode === 'attract') sim.update(dt, {}, {});
  } else if (screen === 's-photo' && sim) {
    photoInput(dt, pad);
  } else if (PHONE_SCREENS.includes(screen)) {
    // World Career, your garage: the computer has the controls while you're sat at it, the phone while it's up (P / Y)
    if (!endInput() && !tswInput() && !dayInput() && !pcInput() && !phoneInput()) menuInput();
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
  // wheel force feedback: the rack's force from the physics, a damper for weight, and the bumps the pad would rumble
  if (now < ffbTestUntil) ffbSend((ffbTestUntil - now > 800 ? -0.45 : 0.45) * settings.ffbDir, 0.1);
  else if (screen === 'hud' && sim && !sim.paused && sim.mode !== 'attract' && sim.player && sim.player.phys && !window.__autopilot) {
    const G = FFB_GAIN[settings.ffb] ?? 0.85, pl = sim.player, ph = pl.phys, v15 = Math.min(1, (ph.speed || 0) / 15);
    // (curbs and grass rattle the rim; a crash kicks it)
    const jolt = ((pl.surface === 'kerb' || pl.rumble ? 0.35 : 0) + (!pl.onRoad ? 0.2 : 0)) * v15 + Math.min(1, (sim.shake || 0) * 1.2);
    const buzz = jolt > 0.05 ? (((now / 33) | 0) % 2 ? 1 : -1) * jolt * 0.3 : 0;
    ffbSend(Math.max(-1, Math.min(1, ((ph.ffb || 0) * 0.75 + buzz) * G)) * settings.ffbDir, 0.08 + 0.12 * G);
  } else ffbSend(0, 0, 0);
  setMusicScene(musicScene()); updateMusic(dt);
  if (PHONE_SCREENS.includes(screen) && world && !pcSeat && !tsw.isOpen && !dayPlan.isOpen && !ending.isOpen && !world.ended) phone.show(); else phone.hide();
  // sat at the garage computer: the 3D view at full resolution, so the screen in the scene is readable
  post.setSharp((screen === 's-hub' && (pcSeat || pitGarage.nearScreen)) || (screen === 's-photo' && photo.sharp));
  phone.update(dt);
  netTick(dt);
  coopTick(dt);
  if (screen === 's-garage' || screen === 's-livery' || (screen === 's-tuning' && tuningFrom === 's-garage')) garage.render();
  else if (screen === 's-opening') opening.render();
  else if (screen === 's-pitgarage' || screen === 's-hub' || (screen === 's-review' && reviewFrom === 's-pitgarage') || (screen === 's-tuning' && tuningFrom === 's-pitgarage')) pitGarage.render();
  else if (sim && screen !== 's-editor' && screen !== 's-loading') { sim.render(post, settings); if (photoShot && screen === 's-photo') { photoShot = false; photoCapture(); } }
  else if (screen !== 's-editor') { renderer.setRenderTarget(null); renderer.setClearColor(0x000000); renderer.clear(); }
  clearEdges();
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
window.__svgp = { get world() { return world; }, get photo() { return photo; }, get hud() { return hud; }, get phone() { return phone; }, get pc() { return pc; }, get post() { return post; }, get sim() { return sim; }, get editor() { return editor; }, get net() { return net; }, get lobby() { return lobby; }, get garage() { return garage; }, settings, startRace, openEditor, show, get screen() { return screen; },
  open: { review: (from) => openLapReview(from), setup: () => openSetup(), career: () => openCareer(), online: () => openOnline(), garage: () => openGarage(), options: () => openOptions('s-main'), help: () => show('s-help'), credits: () => { fillCredits(); show('s-credits'); }, main: () => show('s-main') },
  dbg: { startWeekend: (t, race, ret, format = 'quali', len = [1200, 600]) => startWeekend(t, race, ret, format, len), get pitGarage() { return pitGarage; }, careerRoundDone: (r) => careerRoundDone(r), showResults: () => showResults(), openDraft: () => openDraft(), openShop: () => openShop(), showSeasonEnd: () => showSeasonEnd(), get career() { return career; }, gigTrack: (g) => gigTrack(g), startGig: (g) => startGig(g), get gig() { return gig; }, runVoices: () => runVoices(), get opening() { return opening; }, openOpening: (extra) => openOpening(null, extra), startDriveHome: () => startDriveHome(() => {}), get drive() { return drive; }, voiceState, startWorldRound: () => startWorldRound(), renderHub: () => renderHub(), startWorld: (opening = false) => startWorld(!opening), openPodium: (n) => openPodium(n || (() => show('s-main'))), openTeamSetup: () => openTeamSetup(), get tsw() { return tsw; }, get dayPlan() { return dayPlan; }, openDayPlan: () => openDayPlan(true), sitDown: (a, x) => sitDown(a, x), standUp: () => standUp(), openHub: () => openHub(), get ending() { return ending; }, openEndingPreview: () => openEndingPreview(), goToList: () => goToList(), get listPaper() { return listPaper; }, get coop() { return coop; }, coopHost: () => coopHost(), coopOp: (fn, ...a) => WC[fn](world, ...a), playWorld: (w) => { world = w; openHub(); } } };
