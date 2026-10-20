// Top-down circuit designer
import { sampleTrack, analyzeTrack, buildPitLane, computeRacingLine, computeSpeedProfile, trackStats, cloneTrack, newTrack, presetTracks, archivedTracks, THEMES, PROP_TYPES, PAINTS, defaultEnv, trackReady, minNodes, fenceHeight, kerbOn, wallTypeAt, nodeHandles, densePath, trackFrame, trackProject } from './track.js';
import { CARSPEC } from './car.js';
import { sfx } from './audio.js';
import { fmtTime } from './hud.js';
import { ZONE_TYPES, STYLE_COLORS, newZone, collectScenery, BUSINESSES, BUSINESS_KEYS, pointInPoly, centroid, buildingClear } from './zones.js';
import { ROAD_TYPES, MEET, newRoad, roadLayout, applyRoadsToCircuit, raiseTrackOverRoads } from './roads.js';
import { runoffLayout, runoffStyle, runoffCell, surfaceGrid, RUNOFF_STYLES, RUN_RES } from './runoff.js';
import { trackPropFamilies, trackPropFamily, isTrackProp, LOGOS, logoSheetImage, drawLogo, LIGHT_FAMILIES } from './trackprops.js';
import { thumb } from './propthumbs.js';
import { SETTINGS, SETTING_KEYS, settingOf, FLORA, FLORA_KEYS, BUILDING_KINDS, randomBuilding, houseAssets, modelFootprint, styleOf, frontTarget, eraseHits, PROP_FLORA, natureModel } from './scenery.js';
import { envReady, envAsset, envModelsReady, loadEnvModels, HOUSE_WALLS, HOUSE_ROOFS, HOUSE_PAINTS, houseLook, houseSwatch } from './envlib.js';
import { SCULPT_MODES, SCULPT_MAX, sculptPreview } from './sculpt.js';
import { TileLayer, MAP_STYLES, searchPlace, myLocation, importOSM } from './geo.js';
import { realTracks, hydrateReal } from './realtracks.js';
import { fitStroke, simplifyTrack, lapRemap, remapDress } from './spline.js';
import { fetchElevation, packTerrain, projectOntoTrack, rawHeight, inGrid, EXAG_MAX, TERRAIN_ATTR } from './terrain.js';
import { groundMap, groundSource, GROUND_MARGIN } from './groundmap.js';
import { installKerbTool } from './edkerbs.js';
import { installBarrierTool } from './edbarriers.js';
import { lapShift } from './lapshift.js';
import { installView3d } from './ed3d.js';
import { installPitTool } from './edpit.js';
import { installPaintShapes } from './edpaint.js';
import { installCheck } from './edcheck.js';
import { installPad } from './edpad.js';
import { installShare } from './edshare.js';
import { DEV } from './dev.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const THEME_BG = { grass: '#142417', desert: '#2a1f14', city: '#16181e', coast: '#0c2030' };
// house walls / roofs in the top-down view (when the texture swatches aren't loaded yet)
const WALL_COL = ['#9a4a3c', '#e8e6df', '#5c5c5c', '#3f6a6a', '#a8a060', '#a4a29c'];
const ROOF_COL = ['#4c6450', '#8a3a30', '#6a6e74', '#6e5e50', '#a0624c', '#2e3034'];
const THEME_RUN = { grass: 'rgba(96,150,70,0.55)', desert: 'rgba(200,150,90,0.5)', city: 'rgba(150,150,150,0.45)', coast: 'rgba(210,190,130,0.45)' };

const MODES = ['shape', 'trackside', 'scenery', 'location'];
const TOOL_MODE = { draw: 'shape', edit: 'shape', kerbs: 'trackside', bars: 'trackside', runoff: 'trackside', pit: 'trackside', props: 'scenery', paint: 'scenery', zones: 'scenery', roads: 'scenery', sculpt: 'scenery' }; // (pan: any)

export class Editor {
  constructor(cb) {
    this.cb = cb;
    this.canvas = $('ed-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.pcan = $('ed-profile');
    this.pctx = this.pcan.getContext('2d');
    this.view = { cx: 0, cz: 0, scale: 0.8 };
    this.tool = 'edit';
    this.sel = new Set();
    this.selProp = -1; this.selRoad = -1; this.selBld = null;
    this.propType = 'house';   // what a click with PROPS places: 'house', 'house:<model>', 'bld:<kind>' or a PROP_TYPES key
    this.propCat = 'houses';
    this.propRot = 0;
    this.lineGap = null;       // spacing of a line of props (drag with PROPS), m; null: from the prop's size
    this.tpPick = {};          // the race-track pack's families: the look picked for new ones (none: mixed)
    this.tpSeed = 0;
    this.housePaint = { random: true, w: 2, r: 3, c: null }; // the look new houses get (PROPS and the Houses brush)
    this.sculptMode = 'up'; this.sculptR = 24; this.sculptK = 4; this.sculptS = 0.8;
    this.eraseWhat = 'gnb';
    this.history = []; this.future = [];
    this.snap = false;
    this.defaultWidth = 13;
    this.mouse = { x: 0, y: 0, wx: 0, wz: 0, inside: false };
    this.drag = null;
    this.dirty = true;
    this.active = false;
    this.hoverSample = -1;
    this.tiles = new TileLayer(() => { this.dirty = true; });
    this.selZone = -1;
    this.kerbSel = -1; this.barSel = -1; this.barNode = -1; this.pitNode = -1; this.paintSel = -1; this.paintNode = -1; this.paintMode = 'brush'; this.shapeDraw = null;
    this.zoneDef = newZone('houses', []);
    this.scen = null;
    this.bindUI();
  }

  // ---------------- lifecycle ----------------
  // resume: back from a Test Drive / race of this track, so undo, redo and the saved state carry on
  open(track, { resume = false } = {}) {
    this.active = true;
    const fresh = !track && !this.loadWork(); // (nothing to carry on with: the start screen)
    this.track = cloneTrack(track || this.loadWork() || presetTracks()[0]);
    this.normalize(this.track);
    if (!resume) { this.history = []; this.future = []; this.mine = this.savedList().some(x => x.name === this.track.name && x.saved === this.track.saved) ? this.track.name : null; }
    this.sel.clear(); this.selProp = -1; this.kerbSel = -1; this.barSel = -1; this.barNode = -1; this.pitNode = -1; this.paintSel = -1; this.paintNode = -1; this.shapeDraw = null;
    $('ed-name').value = this.track.name;
    if (!this.mode) this.setMode(TOOL_MODE[this.tool] || 'shape');
    this.setTool(this.tool); // (its panel and how-to, whichever mode it's in)
    this.recompute(true);
    if (!resume) this.markSaved();
    this.needFit = true;
    requestAnimationFrame(() => { this.resize(); if (this.W > 50 && this.H > 50) { this.needFit = false; this.fit(); } this.renderPanels(); if (fresh) this.startScreen(); });
    this.loop();
  }
  // the first time in (nothing to carry on with): how to start, rather than someone else's circuit
  startScreen() {
    this.modalList('Circuit Designer', [
      { title: 'Blank circuit', desc: 'A loop, raced lap after lap. Draw it in one go.', pick: () => this.newBlank(false) },
      { title: 'Point-to-point road', desc: 'From a start to a finish, one run: a hill climb, a mountain pass.', pick: () => this.newBlank(true) },
      { title: 'Start from a circuit', desc: 'One of the built-in or real circuits, to change as you like.', pick: () => { this.closeModal(); this.action('presets'); } },
      { title: 'On my town', desc: 'A real map under it: find your town, then draw the circuit on its streets.', pick: () => { this.newBlank(false); this.setMode('location'); this.toast('Find your town in the panel on the right, then draw', 3200); } },
    ], '', 'Three steps: draw it, test drive it, save it. Everything trackside is added for you.');
  }
  // the three steps, once: shown over the how-to until each has been done (draw a road, drive it, save it)
  guideStep(k) { const g = this.guide(); if (g[k]) return; g[k] = true; try { localStorage.setItem('svgp.edGuide', JSON.stringify(g)); } catch (e) {} this.setHint(); }
  guide() { if (!this._guide) { try { this._guide = JSON.parse(localStorage.getItem('svgp.edGuide')) || {}; } catch (e) { this._guide = {}; } } return this._guide; }
  close() { if (this.v3d) this.close3d(); this.active = false; this.saveWork(); }

  normalize(t) {
    t.env = { ...defaultEnv(t.env?.theme || 'grass'), ...(t.env || {}) };
    t.props = t.props || [];
    t.propLines = t.propLines || [];
    t.zones = t.zones || [];
    t.paint = t.paint || [];
    t.roads = t.roads || []; t.hidden = t.hidden || []; t.buildings = t.buildings || []; t.sculpt = t.sculpt || [];
    t.map = { style: 'satellite', opacity: 0.8, ...(t.map || {}) };
    t.start = t.start || 0;
    t.points = t.points.map(p => ({ x: +p.x, z: +p.z, w: +(p.w ?? 13), e: +(p.e ?? 0), b: +(p.b ?? 0), ...(p.hi ? { hi: [+p.hi[0], +p.hi[1]] } : {}), ...(p.ho ? { ho: [+p.ho[0], +p.ho[1]] } : {}) }));
  }

  loop() {
    if (!this.active) return;
    requestAnimationFrame(() => this.loop());
    if (this.dirty) { this.dirty = false; try { this.draw(); this.drawProfile(); } catch (e) { if (!this.drawErr) console.error(e); this.drawErr = true; } }
  }

  loadWork() { try { return JSON.parse(localStorage.getItem('svgp.editorWork')); } catch (e) { return null; } }
  saveWork() { try { localStorage.setItem('svgp.editorWork', JSON.stringify(this.track)); } catch (e) {} }

  // ---------------- history ----------------
  snapshot() { return { j: JSON.stringify({ ...this.track, osm: null, ground: null }), osm: this.track.osm, ground: this.track.ground }; } // (the big ones by reference)
  restore(sn) { const t = JSON.parse(sn.j); t.osm = sn.osm; t.ground = sn.ground || null; return t; }
  push() {
    this.history.push(this.snapshot());
    if (this.history.length > 120) this.history.shift();
    this.future = [];
  }
  undo() {
    if (!this.history.length) return this.toast('NOTHING TO UNDO');
    this.future.push(this.snapshot());
    this.track = this.restore(this.history.pop());
    this.afterRestore();
  }
  redo() {
    if (!this.future.length) return this.toast('NOTHING TO REDO');
    this.history.push(this.snapshot());
    this.track = this.restore(this.future.pop());
    this.afterRestore();
  }
  afterRestore() {
    this.sel = new Set([...this.sel].filter(i => i < this.track.points.length));
    if (this.selProp >= this.track.props.length) this.selProp = -1;
    if (this.selLine && !this.lineById(this.selLine)) this.selLine = null;
    if (this.selZone >= this.track.zones.length) this.selZone = -1;
    // (curbs / barriers stay picked through undo and redo while they're still there)
    if (!(this.kerbSel >= 0 && this.kerbSel < ((this.track.dress && this.track.dress.kerbs) || []).length)) this.kerbSel = -1;
    const bl = (this.track.dress && this.track.dress.barriers) || []; if (!(this.barSel >= 0 && this.barSel < bl.length)) { this.barSel = -1; this.barNode = -1; } else if (!(this.barNode < bl[this.barSel].pts.length)) this.barNode = -1;
    const pl = this.track.dress && this.track.dress.pit; if (!pl || !(this.pitNode < pl.pts.length)) this.pitNode = -1;
    if (!(this.paintSel >= 0 && this.paintSel < this.track.paint.length)) { this.paintSel = -1; this.paintNode = -1; } this.shapeDraw = null;
    $('ed-name').value = this.track.name;
    this.changed(true);
    this.setTool(this.tool);
  }

  changed(panels = false) {
    this.recompute();
    if (this.T && trackReady(this.track)) this.guideStep('drawn');
    this.dirty = true;
    if (panels) this.renderPanels(); else this.refreshStats();
    clearTimeout(this.workT); this.workT = setTimeout(() => this.saveWork(), 400);
  }

  recompute(fit = false) {
    const t = this.track;
    const n = t.points.length;
    this.nodeD = new Float32Array(n).fill(-1);
    // too few nodes (everything deleted, or placing the first few): no road yet, and nothing to save or race
    if (!trackReady(t)) {
      this.T = this.A = this.pit = null; this.chunks = []; this.scen = null; this.lapEst = 0; this.maxY = 10;
      clearTimeout(this.scenT); clearTimeout(this.lapT);
      this.refreshStats(); this.checkTrack();
      if (fit) this.fit();
      return;
    }
    try {
      this.T = sampleTrack(t);
      raiseTrackOverRoads(t, this.T);
      this.A = analyzeTrack(this.T, t.env, t.paint, t.osm, t.dress);
      this.pit = buildPitLane(this.T, this.A, t.env, t.osm && t.osm.pitLane, surfaceGrid(t.osm && t.osm.surface), t.dress && t.dress.pit);
      this.A.pit = this.pit;
      applyRoadsToCircuit(t, this.T, this.A);
      this.A.run = runoffLayout(this.T, this.A, t);
    } catch (e) { console.error(e); this.T = this.A = this.pit = null; this.chunks = []; this.checkTrack(); return; }
    this.checkTrack(); // (what's wrong, and where: edcheck.js)
    // node -> lap distance
    const T = this.T;
    const bestF = new Float32Array(n).fill(1e9);
    for (let i = 0; i < T.N; i++) {
      const r = Math.round(T.NODE[i]) % n, fr = Math.abs(T.NODE[i] - Math.round(T.NODE[i]));
      if (fr < bestF[r]) { bestF[r] = fr; this.nodeD[r] = T.D[i]; }
    }
    // chunks for drawing
    const C = 6;
    this.chunks = [];
    // samples in driving order: a loop closes back on sample 0, a point-to-point runs back of grid -> end of run-off
    const seq = [];
    if (T.open) for (let k = 0; k < T.N; k++) seq.push((T.cut + 1 + k) % T.N);
    else { for (let k = 0; k < T.N; k++) seq.push(k); seq.push(0); }
    for (let s = 0; s < seq.length - 1; s += C) {
      const idx = seq.slice(s, Math.min(s + C, seq.length - 1) + 1);
      let y = 0, w = 0, br = 0;
      idx.forEach(i => { y += T.Y[i]; w += T.W[i]; br += this.A.BRIDGE[i]; });
      this.chunks.push({ idx, y: y / idx.length, w: w / idx.length, bridge: br > idx.length / 2 });
    }
    this.maxY = Math.max(10, ...Array.from(T.Y));
    this.scheduleScenery(fit ? 0 : 120);
    clearTimeout(this.lapT);
    this.lapT = setTimeout(() => {
      if (!this.active || !this.T) return;
      const O = computeRacingLine(this.T, 1.8, 160);
      this.lapEst = computeSpeedProfile(this.T, O, { mu: CARSPEC.mu * 0.97 * (this.track.env.surface === 'dirt' ? 0.68 : 1), kdm: CARSPEC.kd / CARSPEC.mass, vmax: 92 }).lapEstimate; // (dirt: race.js SURFACES.dirt)
      this.refreshStats();
    }, 300);
    if (fit) this.fit();
  }

  // mid-drag: the points move with the cursor every frame; the road (everything recompute works out) is redone as often
  // as it keeps up: at once on a small circuit, a few times a second on a big real one, and exactly on letting go
  dragRecompute() {
    const wait = (this.rcCost || 0) * 1.5 - (performance.now() - (this.rcAt || 0));
    clearTimeout(this.rcT);
    if (wait > 0) { this.rcT = setTimeout(() => this.dragRecompute(), wait); return; }
    const a = performance.now(); this.recompute(); this.rcAt = performance.now(); this.rcCost = this.rcAt - a;
  }

  scheduleScenery(ms = 120) {
    clearTimeout(this.scenT);
    const run = () => {
      if (!this.T) return;
      const t = this.track;
      this.scen = (t.osm || t.zones.length || t.buildings.length || (t.env.setting && t.env.setting.kind && t.env.setting.kind !== 'none') || (t.paint || []).some(s => s.kind === 'flora')) ? collectScenery(t, this.T, this.A) : null;
      this.dirty = true;
      this.refreshStats();
      if (this.tool === 'zones') this.renderZoneCount();
    };
    if (ms <= 0) run(); else this.scenT = setTimeout(run, ms);
  }

  // ---------------- view ----------------
  resize() {
    const wrap = $('ed-wrap');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = wrap.clientWidth; this.H = wrap.clientHeight;
    this.canvas.width = this.W * dpr; this.canvas.height = this.H * dpr;
    const pw = this.pcan.clientWidth, ph = this.pcan.clientHeight;
    this.pcan.width = pw * dpr; this.pcan.height = ph * dpr;
    this.PW = pw; this.PH = ph;
    this.dirty = true;
  }
  fit() {
    if (!this.W) return;
    const T = this.T, P = this.track.points;
    if (!T && !P.length) return;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    if (T) for (let i = 0; i < T.N; i++) { a = Math.min(a, T.X[i]); b = Math.max(b, T.X[i]); c = Math.min(c, T.Z[i]); d = Math.max(d, T.Z[i]); }
    else for (const p of P) { a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.z); d = Math.max(d, p.z); }
    this.view.cx = (a + b) / 2; this.view.cz = (c + d) / 2;
    this.view.scale = clamp(Math.min(this.W / (b - a + 160), this.H / (d - c + 160)), 0.05, 6);
    this.dirty = true;
  }
  w2s(x, z) { return [(x - this.view.cx) * this.view.scale + this.W / 2, (z - this.view.cz) * this.view.scale + this.H / 2]; }
  s2w(x, y) { return [(x - this.W / 2) / this.view.scale + this.view.cx, (y - this.H / 2) / this.view.scale + this.view.cz]; }

  // ---------------- UI binding ----------------
  bindUI() {
    new ResizeObserver(() => {
      if (!this.active) return;
      this.resize();
      if (this.needFit && this.W > 50 && this.H > 50) { this.needFit = false; this.fit(); }
    }).observe($('ed-wrap'));
    new ResizeObserver(() => { if (this.active) this.resize(); }).observe(this.pcan);
    document.querySelectorAll('#s-editor [data-tool]').forEach(b => b.addEventListener('click', () => { this.setTool(b.dataset.tool); sfx.move(); }));
    document.querySelectorAll('#ed-modes span').forEach(x => x.addEventListener('click', () => { if (x.dataset.m !== this.mode) { this.setMode(x.dataset.m); sfx.move(); } }));
    document.querySelectorAll('#s-editor [data-act]').forEach(b => b.addEventListener('click', () => this.action(b.dataset.act)));
    document.querySelectorAll('.ed-tabs button').forEach(b => b.addEventListener('click', () => this.showTab(b.dataset.tab)));
    $('ed-name').addEventListener('input', (e) => { this.track.name = e.target.value || 'Untitled'; this.saveWork(); });
    $('ed-check').addEventListener('click', () => this.nextProblem()); // (the status: to each problem in turn, edcheck.js)
    $('ed-file').addEventListener('change', (e) => this.importFile(e.target.files[0]));

    loadEnvModels().then(() => { if (this.active) { this.renderNodeTab(); this.scheduleScenery(0); } }); // (house swatches, model sizes)

    const cv = this.canvas;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => this.onDown(e));
    window.addEventListener('mousemove', e => this.onMove(e));
    window.addEventListener('mouseup', e => this.onUp(e));
    cv.addEventListener('dblclick', e => this.onDbl(e));
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const [wx, wz] = this.s2w(e.offsetX, e.offsetY);
      const k = Math.pow(1.0015, -e.deltaY);
      this.view.scale = clamp(this.view.scale * k, 0.04, 8);
      const [nx, nz] = this.s2w(e.offsetX, e.offsetY);
      this.view.cx += wx - nx; this.view.cz += wz - nz;
      this.dirty = true;
    }, { passive: false });
    cv.addEventListener('mouseleave', () => { this.mouse.inside = false; this.dirty = true; });

    const pc = this.pcan;
    pc.addEventListener('mousedown', e => this.onProfileDown(e));
    pc.addEventListener('mousemove', e => this.onProfileHover(e));
    pc.addEventListener('mouseleave', () => { this.hoverSample = -1; this.dirty = true; });

    window.addEventListener('keydown', e => this.onKey(e));
  }

  // Four modes, each its own tools (the dock at the bottom of the map): Shape (the road), Trackside (curbs, barriers,
  // runoff, the pit lane), Scenery (props, paint, zones, roads, the land), Location (a real map). Tab goes round them.
  setMode(m, tool = null) {
    if (!MODES.includes(m)) return;
    const was = this.mode; this.mode = m;
    const el = $('s-editor'); MODES.forEach(k => el.classList.toggle('mode-' + k, k === m));
    document.querySelectorAll('#ed-modes span').forEach(x => x.classList.toggle('on', x.dataset.m === m));
    if (was && was !== m) { const st = document.querySelector('#s-editor .ed-strip'); st.classList.remove('wipe-in'); void st.offsetWidth; st.classList.add('wipe-in'); } // (the new mode's tools wipe in)
    if (tool || TOOL_MODE[this.tool] !== m) this.setTool(tool || (m === 'shape' ? (trackReady(this.track) ? 'edit' : 'draw') : m === 'trackside' ? 'kerbs' : m === 'scenery' ? 'props' : 'pan'));
    if (m === 'location') this.showTab('map');
    if (was !== m) requestAnimationFrame(() => { this.resize(); this.dirty = true; }); // (the profile comes and goes: the map's size changes)
  }
  setTool(t) {
    if (TOOL_MODE[t] && TOOL_MODE[t] !== this.mode) return this.setMode(TOOL_MODE[t], t); // (a tool's key or button takes you to its mode)
    // (RUNOFF: PAINT drawing shapes with the pen)
    if (t === 'runoff') { if (this.tool !== 'paint' || this.paintMode !== 'shape') { this.paintSel = -1; this.paintNode = -1; } this.paintMode = 'shape'; if (!['grass', 'paved', 'gravel'].includes(this.paintKind)) this.paintKind = 'gravel'; t = 'paint'; }
    else if (t === 'paint' && this.tool !== 'paint') this.paintMode = 'brush';
    if (t !== this.tool) this.shapeDraw = null;
    this.tool = t;
    this.placing = false;
    this.toolButtons();
    const nb = document.querySelector('.ed-tabs [data-tab="node"]');
    if (nb) nb.textContent = t === 'zones' ? 'ZONE' : t === 'paint' ? 'PAINT' : t === 'roads' ? 'ROAD' : t === 'props' ? 'PROPS' : t === 'sculpt' ? 'SCULPT' : t === 'kerbs' ? 'CURBS' : t === 'bars' ? 'BARRIERS' : t === 'pit' ? 'PIT LANE' : 'NODE';
    if (t === 'zones' || t === 'paint' || t === 'roads' || t === 'props' || t === 'sculpt' || t === 'kerbs' || t === 'bars' || t === 'pit') { this.showTab('node'); }
    if (this.track) this.renderNodeTab();
    this.updatePalette();
    const hints = {
      draw: '<b>DRAW</b> &mdash; hold the left mouse button and sketch a loop. Release to turn it into a circuit. The end joins back to the start automatically.',
      edit: '<b>EDIT</b> &mdash; drag nodes to reshape. Click a node for its round curve <b>handles</b>: drag one to bend the corner (<b>Shift</b>: one alone), so a turn takes fewer nodes. <b>Double-click</b> the road to add a node, <b>DEL</b> removes. <b>Shift</b>+click or drag a box to multi-select, then tune width / elevation / banking on the right.',
      props: '<b>PROPS</b> &mdash; pick something on the right and click the map to place it (houses and buildings turn to face the nearest road), or <b>drag</b> to draw a line of props, as far apart as you set. Click any <b>building</b> or prop to select it: drag to move, <b>Q/E</b> rotate, <b>DEL</b> or right-click removes. Selected houses can be <b>painted</b> on the right.',
      sculpt: '<b>SCULPT</b> &mdash; drag to raise, lower, smooth or flatten the land. Each stroke adds the strength once; go over it again for more. The track and its runoff never move: hills blend into the embankments. <b>[ ]</b> brush size.',
      pan: '<b>PAN</b> &mdash; drag to move the map. Scroll to zoom. (Right-drag pans in every tool.)',
      roads: '<b>ROADS</b> &mdash; drag to draw a street. Click a road to select it: drag its <b>nodes</b> to reshape it, <b>double-click</b> the road to add a node, <b>DEL</b> removes the picked node (or the road). Drag the road itself to move it.',
      runoff: '<b>RUNOFF</b> &mdash; draw grass, paved or gravel runoff with a pen: <b>click</b> for a sharp corner, <b>click and drag</b> for a smooth curve, round the area; click the first node, double-click or press <b>Enter</b> to finish. <b>Click</b> a shape to pick it: drag its nodes, the round <b>handles</b> to bend it (<b>Shift</b>: one alone), or the shape to move it. Press <b>T</b> to see the map through the track.',
      paint: '<b>PAINT</b> &mdash; <b>Shape</b> (on the right): click round an area, point by point, for grass, paved or gravel exactly there; click one later to reshape or repaint it. <b>Brush</b>: drag to paint <b>grass</b>, <b>paved</b> runoff or <b>gravel</b> (past the barrier, it moves back), <b>Nature</b> (trees and plants), a street of <b>Houses</b> or a <b>Crowd</b> of spectators. <b>Erase</b> removes anything under it: grass, every tree and plant (painted or from the World tab) and buildings. <b>[ ]</b> brush size.',
      kerbs: '<b>CURBS</b> &mdash; <b>drag</b> along a track edge to lay a curb with the settings on the right. <b>Click</b> a curb to change its colors, type, width and tapered ends; drag its <b>end squares</b> to stretch it, or the curb itself to slide it along. <b>DEL</b> removes it.',
      bars: '<b>BARRIERS</b> &mdash; <b>click</b> a barrier to pick it, then drag its <b>nodes</b>: the barrier either side of a node you move runs <b>straight</b> to the next one; drag the round <b>handles</b> to bend it (<b>Shift</b>: one handle alone). Drag the barrier itself to move it all in or out. <b>Double-click</b> it for another node; <b>DEL</b> removes the picked node. <b>Drag</b> beside the track to put up a new barrier.',
      pit: '<b>PIT LANE</b> &mdash; drag the lane\'s <b>nodes</b> to put it exactly where you want it, or the lane itself to move it in or out. Drag the blue <b>diamonds</b> to set where the garages start and end, the <b>white dots</b> where the pit wall does (it runs on beside the lane to where it meets the track). <b>Double-click</b> the lane for another node, <b>DEL</b> removes the picked one. No pit lane? <b>Drag</b> beside the track to lay one.',
      zones: '<b>ZONES</b> &mdash; draw a line and buildings spawn along it. Pick the type, height, spacing and side on the right. Click a zone line to select it, drag to move it, <b>DEL</b> removes.',
    };
    if (this.track && this.track.open) {
      hints.draw = '<b>DRAW</b> &mdash; hold the left mouse button and sketch the road from the <b>start</b> to the <b>finish</b>. Release to turn it into a point-to-point track. A grid behind the start and a run-off past the finish are added for you.';
      hints.edit = hints.edit.replace('<b>Double-click</b> the road to add a node', '<b>Double-click</b> the road to add a node (on the run-off or behind the start to extend the track)');
    }
    this.hints = hints;
    this.setHint();
    this.canvas.style.cursor = t === 'pan' ? 'grab' : t === 'draw' || t === 'paint' || t === 'roads' || t === 'sculpt' || t === 'kerbs' || t === 'bars' || t === 'pit' ? 'crosshair' : 'default';
    this.dirty = true;
  }
  setHint() {
    const t = this.track, h = { ...this.hints };
    if (t && !trackReady(t)) h.edit = `<b>EDIT</b> &mdash; no track yet. <b>Click</b> the map to place nodes (${minNodes(t)} or more), or use <b>DRAW</b> to sketch one.`;
    else if (this.placing) h.edit = `<b>EDIT</b> &mdash; placing nodes: <b>click</b> to add the next one${t.open ? ' (the last one is the finish)' : ''}. Press <b>Enter</b> or <b>Esc</b> when you're done.`;
    const g = this.guide(), steps = [['drawn', 'Draw a road'], ['driven', 'Test Drive it'], ['saved', 'Save it']];
    const guide = steps.every(([k]) => g[k]) ? '' : `<div class="ed-guide">${steps.map(([k, n], i) => `<span class="${g[k] ? 'done' : ''}">${i + 1} ${n}${g[k] ? ' &#10003;' : ''}</span>`).join('')}</div>`;
    $('ed-hint').innerHTML = guide + h[this.tool === 'paint' && this.paintMode === 'shape' ? 'runoff' : this.tool];
  }
  updatePalette() {
    document.querySelectorAll('#pr-grid [data-prop]').forEach(b => b.classList.toggle('on', b.dataset.prop === this.propType));
  }
  showTab(t) {
    document.querySelectorAll('.ed-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    ['node', 'track', 'world', 'map'].forEach(k => $('tab-' + k).hidden = k !== t);
  }

  toast(msg, ms = 1600) {
    const e = $('ed-toast'); e.textContent = msg; e.classList.add('on');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => e.classList.remove('on'), ms);
  }

  // ---------------- actions ----------------
  action(a) {
    const t = this.track;
    sfx.select();
    if (a === 'view3d') return this.toggle3d();
    if (this.v3d && ['test', 'race', 'exit'].includes(a)) this.close3d(); // (the rest work on the 3D view too)
    switch (a) {
      case 'new': this.modalList('New', [
        { title: 'Circuit', desc: 'A loop, raced lap after lap. Draw it in one go, back to where you started.', pick: () => this.newBlank(false) },
        { title: 'Point-to-point', desc: 'A road from a start to a finish, one run. Draw it from start to finish.', pick: () => this.newBlank(true) },
      ], '', this.isSaved() ? '' : 'Your changes stay in Undo, but they aren\'t saved in My Circuits.'); break;
      case 'presets': this.modalList('Presets', [
        ...realTracks().map(p => ({ title: p.name + ' (real)', ...this.thumbRow(p, p.real.country), pick: () => hydrateReal(cloneTrack(p)).then(t => this.load(t), () => this.toast('COULD NOT LOAD THE CIRCUIT DATA')) })),
        ...presetTracks().map(p => ({ title: p.name, ...this.thumbRow(p, `${THEMES[p.env.theme].label} · ${p.env.time} · ${p.env.weather}`), pick: () => this.load(p) })),
        ...(DEV ? archivedTracks() : []).map(p => ({ title: p.name + ' (archived)', desc: `Old built-in ${p.open ? 'track' : 'circuit'} · ${THEMES[p.env.theme].label} · ${p.env.time} · ${p.env.weather}`, pick: () => this.load(p) })),
      ]); break;
      case 'open': this.openModal(); break;
      case 'save': if (this.needTrack('SAVE')) this.save(); break;
      case 'saveas': if (this.needTrack('SAVE')) this.saveAs(); break;
      case 'share': this.shareModal(); break;
      case 'export': if (this.needTrack('EXPORT')) this.exportFile(); break;
      case 'import': $('ed-file').value = ''; $('ed-file').click(); break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'test': if (!this.needTrack('TEST')) break; this.guideStep('driven'); this.saveWork(); this.cb.onTest(cloneTrack(t)); break;
      case 'race': if (!this.needTrack('RACE')) break;
        if (this.blocking().length) { sfx.error(); this.probAt = this.problems.indexOf(this.blocking()[0]) - 1; this.nextProblem(); break; } // (a flat crossing: to it, with what to do)
        this.saveWork(); this.cb.onRace(cloneTrack(t)); break;
      case 'exit': this.exit(); break;
      case 'smooth': if (!this.needTrack()) break; this.push(); this.smooth(); break;
      case 'simplify': if (!this.needTrack()) break; this.simplify(); break;
      case 'reverse': this.push(); t.points.reverse(); t.points.forEach(p => { p.b = -p.b; const hi = p.hi; if (p.ho) p.hi = p.ho; else delete p.hi; if (hi) p.ho = hi; else delete p.ho; }); t.start = t.open ? 0 : (t.points.length - 1 - t.start); this.sel.clear(); this.changed(true); this.toast(t.open ? 'DIRECTION REVERSED · START AND FINISH SWAPPED' : 'DIRECTION REVERSED'); break;
      case 'autobank': if (!this.needTrack()) break; this.push(); this.autoBank(); break;
      case 'flatten': this.push(); t.points.forEach(p => { p.e = 0; p.b = 0; }); this.changed(true); this.toast('ELEVATION RESET'); break;
      case 'fit': this.fit(); break;
      case 'seethru': { // the track drawn see-through over the map (100% / 50% / 25%), remembered between sessions
        const steps = [1, 0.5, 0.25], k = steps.indexOf(this.trackAlpha);
        this.trackAlpha = steps[(k + 1) % steps.length];
        try { localStorage.setItem('svgp.edTrackAlpha', String(this.trackAlpha)); } catch (e) {}
        $('ed-seethru').classList.toggle('on', this.trackAlpha < 1);
        this.toast(this.trackAlpha < 1 ? `TRACK ${Math.round(this.trackAlpha * 100)}% · SEE THE MAP THROUGH IT` : 'TRACK SOLID'); this.dirty = true; break;
      }
      case 'grid': this.snap = !this.snap; $('ed-grid').classList.toggle('on', this.snap); this.toast(this.snap ? 'GRID SNAP ON (10M)' : 'GRID SNAP OFF'); break;
    }
  }

  // an unfinished track (fewer than the minimum nodes) can't be saved, exported, tested or raced
  needTrack(what) {
    if (trackReady(this.track)) return true;
    sfx.error();
    const n = minNodes(this.track), have = this.track.points.length;
    this.toast(what ? `CAN'T ${what} · A TRACK NEEDS ${n}+ NODES (HAS ${have})` : `NO TRACK YET · NEEDS ${n}+ NODES`);
    return false;
  }

  load(track, fromSaves = false) {
    this.push();
    this.track = cloneTrack(track);
    this.normalize(this.track);
    $('ed-name').value = this.track.name;
    this.sel.clear(); this.selProp = -1;
    this.closeModal();
    this.changed(true); this.fit();
    this.markSaved(); this.mine = fromSaves ? this.track.name : null;
    this.toast('Loaded: ' + this.track.name);
  }
  newBlank(open) {
    this.closeModal(); this.push();
    const env = this.track.env, n = newTrack('New Circuit');
    n.env = { ...defaultEnv(env.theme), time: env.time, weather: env.weather };
    n.points = []; if (open) n.open = true;
    this.track = n; this.normalize(n);
    $('ed-name').value = n.name; this.sel.clear(); this.selProp = -1;
    this.changed(true); this.markSaved(); this.mine = null;
    if (this.W) { this.view.cx = 0; this.view.cz = 0; this.view.scale = clamp(Math.min(this.W / 1400, this.H / 1000), 0.05, 6); }
    this.setTool('draw');
    this.toast(open ? 'Draw the road from start to finish' : 'Draw a loop, back to where you started');
  }

  // nothing to lose: what's on screen is as it was loaded or last saved (mine = the My Circuits name it's saved as)
  markSaved() { this.savedJ = this.snapshot().j; }
  isSaved() { return this.savedJ === this.snapshot().j; }
  exit() {
    this.saveWork();
    if (this.isSaved() || !trackReady(this.track)) return this.cb.onExit();
    this.modalList('Exit', [
      { title: 'Save and exit', desc: `Keep "${this.track.name}" in My Circuits.`, pick: () => { this.closeModal(); if (this.save()) this.cb.onExit(); } },
      { title: 'Exit without saving', desc: 'It comes back the next time you open the editor, until you start something else.', pick: () => { this.closeModal(); this.cb.onExit(); } },
      { title: 'Keep editing', desc: '', pick: () => this.closeModal() },
    ], '', 'This circuit has changes that aren\'t in My Circuits.');
  }
  // a name in use: one of yours (replace it?) or a built-in / real circuit (that name's taken, so pick another)
  nameClash(name) {
    if ([...presetTracks(), ...realTracks()].some(p => p.name === name)) return 'builtin';
    return this.savedList().some(x => x.name === name) ? 'mine' : null;
  }
  saveAs(note = '') {
    const box = $('ed-modal-box');
    let name = this.track.name;
    if (this.nameClash(name) === 'builtin') { let k = 2; while (this.nameClash(`${this.track.name} ${k}`)) k++; name = `${this.track.name} ${k}`; }
    box.innerHTML = `<h3>Save As</h3>${note ? `<p class="muted">${esc(note)}</p>` : ''}<input id="ed-saveas" class="ed-saveas" maxlength="40" value="${esc(name)}"><p class="muted" id="ed-saveas-msg"></p><div class="foot"><button data-close>Cancel</button> <button data-ok class="hot">Save</button></div>`;
    $('ed-modal').hidden = false;
    const inp = $('ed-saveas'), msg = $('ed-saveas-msg'), ok = box.querySelector('[data-ok]');
    let armed = null;
    const check = () => { const n = inp.value.trim(), c = n && this.nameClash(n); armed = null; ok.textContent = 'Save';
      msg.textContent = !n ? 'Give it a name.' : c === 'builtin' ? 'A built-in circuit has that name. Pick another.' : c === 'mine' ? 'You already have a circuit with that name. Saving replaces it.' : ''; };
    const go = () => { const n = inp.value.trim(), c = n && this.nameClash(n);
      if (!n || c === 'builtin') { sfx.error(); return; }
      if (c === 'mine' && armed !== n) { armed = n; ok.textContent = 'Replace it'; sfx.select(); return; }
      this.track.name = n; $('ed-name').value = n; this.closeModal(); this.save(true); };
    inp.addEventListener('input', check);
    inp.addEventListener('keydown', (e) => { if (e.code === 'Enter') go(); if (e.code === 'Escape') this.closeModal(); e.stopPropagation(); });
    ok.addEventListener('click', go);
    box.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
    $('ed-modal').onclick = (e) => { if (e.target.id === 'ed-modal') this.closeModal(); };
    check(); inp.focus(); inp.select();
  }

  savedList() { try { return JSON.parse(localStorage.getItem('svgp.tracks')) || []; } catch (e) { return []; } }
  // Save keeps this circuit under its name. It never quietly replaces a different circuit: a name a built-in or real
  // circuit has, or one of yours this didn't come from, goes through Save As first. (replace: Save As said yes)
  save(replace = false) {
    if (!this.needTrack('SAVE')) return false;
    const clash = this.nameClash(this.track.name);
    if (clash === 'builtin') { this.saveAs('A built-in circuit has that name, so yours needs its own.'); return false; }
    if (clash === 'mine' && !replace && this.mine !== this.track.name) { this.saveAs('You already have a circuit with that name.'); return false; }
    const list = this.savedList();
    const t = cloneTrack(this.track);
    t.saved = Date.now(); this.track.saved = t.saved;
    const k = list.findIndex(x => x.name === t.name);
    if (k >= 0) list[k] = t; else list.push(t);
    try { localStorage.setItem('svgp.tracks', JSON.stringify(list)); this.markSaved(); this.mine = t.name; this.saveWork(); this.guideStep('saved'); this.toast('Saved: ' + t.name); return true; }
    catch (e) { sfx.error(); this.toast(t.osm ? 'Out of storage space. Share › Save As A File keeps big towns.' : 'Could not save'); return false; }
  }
  modalList(title, items, empty = '', note = '') {
    const box = $('ed-modal-box');
    box.innerHTML = `<h3>${title}</h3>` + (note ? `<p class="muted">${esc(note)}</p>` : '') + (items.length ? items.map((it, i) => `<div class="li" data-i="${i}">${it.thumb != null ? `<span class="th">${it.thumb}</span>` : ''}<div class="tx"><div class="t">${esc(it.title)}</div><div class="d">${esc(it.desc)}</div></div>${it.share ? `<button data-share="${i}">Share</button>` : ''}${it.del ? `<button data-del="${i}">Delete</button>` : ''}</div>`).join('') : `<p class="muted">${empty}</p>`) + `<div class="foot"><button data-close>Close</button></div>`;
    $('ed-modal').hidden = false;
    box.querySelectorAll('.li').forEach(el => el.addEventListener('click', (e) => { if (e.target.dataset.del || e.target.dataset.share) return; items[+el.dataset.i].pick(); }));
    box.querySelectorAll('[data-share]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); items[+el.dataset.share].share(); }));
    box.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation();
      if (el.dataset.armed) return items[+el.dataset.del].del();
      el.dataset.armed = 1; el.textContent = 'Delete it?'; sfx.select(); }));
    box.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
    $('ed-modal').onclick = (e) => { if (e.target.id === 'ed-modal') this.closeModal(); };
  }
  closeModal() { $('ed-modal').hidden = true; }

  exportFile(t = this.track) {
    const blob = new Blob([JSON.stringify(t, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (t.name || 'circuit').replace(/[^a-z0-9]+/gi, '_') + '.svgp.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.toast('EXPORTED');
  }
  importFile(f) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const t = JSON.parse(r.result);
        if (!Array.isArray(t.points) || t.points.length < minNodes(t)) throw new Error('bad');
        t.name = t.name || f.name;
        this.load(t);
      } catch (e) { sfx.error(); this.toast('NOT A VALID CIRCUIT FILE'); }
    };
    r.readAsText(f);
  }

  smooth() {
    const P = this.track.points, n = P.length;
    const src = P.map(p => ({ ...p }));
    const targets = this.sel.size > 1 ? this.sel : null;
    for (let i = 0; i < n; i++) {
      if (targets && !targets.has(i)) continue;
      if (this.track.open && (i === 0 || i === n - 1)) continue; // (point-to-point: start and finish stay put)
      const a = src[(i - 1 + n) % n], b = src[(i + 1) % n];
      P[i].x = src[i].x * 0.5 + (a.x + b.x) * 0.25;
      P[i].z = src[i].z * 0.5 + (a.z + b.z) * 0.25;
      P[i].e = src[i].e * 0.5 + (a.e + b.e) * 0.25;
    }
    this.changed(true); this.toast(targets ? 'SELECTION SMOOTHED' : 'TRACK SMOOTHED');
  }
  // fewer points, same road: refitted with curve handles, the line kept within 0.75 m, heights 15 cm, widths half a
  // metre; the start stays point 0, and the dressing (pit lane, kerbs, barriers: placed by m along the lap) moves
  // onto the refit so it stays where it was (js/spline.js simplifyTrack, remapDress)
  simplify() {
    const was = this.track.points.length, pts = simplifyTrack(this.track, densePath);
    if (!pts) return this.toast('Already as simple as it gets');
    this.push();
    const old = densePath(this.track, 1), T1 = this.T;
    this.track.points = pts; this.track.start = 0;
    if (this.track.dress) {
      const map = lapRemap(old, densePath(this.track, 1), !!this.track.open), T2 = sampleTrack(this.track);
      const place = (d, off, side) => { // (where it stands, found again beside the new road)
        const F = trackFrame(T1, d), o = side * (F.w / 2 + off), g = map(d);
        return trackProject(T2, F.x + F.rx * o, F.z + F.rz * o, side, g - 40, g + 40) || [g, off];
      };
      this.track.dress = remapDress(this.track.dress, map, place);
    }
    this.sel.clear();
    this.changed(true); this.toast(`Simplified: ${was} points to ${pts.length}, the same road`);
  }
  autoBank() {
    const T = this.T, P = this.track.points, n = P.length;
    for (let k = 0; k < n; k++) {
      // curvature near node
      let best = 0, bestD = Infinity;
      for (let i = 0; i < T.N; i++) { const d = Math.abs(T.NODE[i] - k); const dd = Math.min(d, n - d); if (dd < bestD) { bestD = dd; best = i; } }
      let kk = 0; for (let j = -8; j <= 8; j++) kk += T.K[(best + j + T.N) % T.N]; kk /= 17;
      // right turn (K>0) -> left side higher -> negative bank
      P[k].b = Math.round(clamp(-kk * 600, -12, 12));
    }
    this.changed(true); this.toast('CORNERS BANKED');
  }

  // ---------------- hit testing ----------------
  hitNode(sx, sy) {
    const P = this.track.points;
    let best = -1, bd = 12 * 12;
    for (let i = 0; i < P.length; i++) {
      const [x, y] = this.w2s(P[i].x, P[i].z);
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // the one picked node's curve handles (EDIT): { k, end: 'hi' | 'ho' }
  trackHandles() {
    if (this.tool !== 'edit' || this.sel.size !== 1 || !this.T) return [];
    const k = [...this.sel][0], p = this.track.points[k]; if (!p) return [];
    const H = nodeHandles(this.track, k), out = [];
    for (const end of ['hi', 'ho']) if (H[end]) out.push({ k, end, x: p.x + H[end][0], z: p.z + H[end][1], own: !!p[end] });
    return out;
  }
  hitTrackHandle(sx, sy) {
    for (const h of this.trackHandles()) { const [x, y] = this.w2s(h.x, h.z); if (Math.hypot(x - sx, y - sy) < 8) return h; }
    return null;
  }
  hitProp(wx, wz) {
    const P = this.track.props;
    let best = -1, bd = Infinity;
    for (let i = 0; i < P.length; i++) {
      const tp = isTrackProp(P[i].type) && trackPropFamily(P[i].type);
      const r = Math.max(PROP_TYPES[P[i].type]?.r || (tp ? Math.max(tp.w * (P[i].sx || 1), tp.d) / 2 : 3), 8 / this.view.scale);
      const d = Math.hypot(P[i].x - wx, P[i].z - wz);
      if (d < r && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  nearestSample(wx, wz) {
    const T = this.T;
    let best = 0, bd = Infinity;
    for (let i = 0; i < T.N; i++) { const d = (T.X[i] - wx) ** 2 + (T.Z[i] - wz) ** 2; if (d < bd) { bd = d; best = i; } }
    return { i: best, d: Math.sqrt(bd) };
  }
  snapPt(x, z) { return this.snap ? [Math.round(x / 10) * 10, Math.round(z / 10) * 10] : [x, z]; }

  // ---------------- mouse ----------------
  onDown(e) {
    if (!this.active) return;
    const sx = e.offsetX, sy = e.offsetY;
    const [wx, wz] = this.s2w(sx, sy);
    if (e.button === 2 && this.tool === 'props') {
      const lh = this.hitLine(wx, wz, sx, sy);
      if (lh && lh.node >= 0) { if (lh.L.pts.length > 2) { this.push(); lh.L.pts.splice(lh.node, 1); this.regenLine(lh.L); sfx.del(); this.changed(); this.renderItemTab(); } return; }
      if (lh) { this.push(); this.removeLine(lh.L); sfx.del(); this.changed(); this.renderItemTab(); this.toast('LINE REMOVED'); return; }
      const h = this.hitProp(wx, wz);
      if (h >= 0) { this.push(); this.track.props.splice(h, 1); this.selProp = -1; sfx.del(); this.changed(); return; }
      const hb = this.hitBuilding(wx, wz);
      if (hb) { this.selBld = hb; this.deleteBuilding(); return; }
    }
    if (e.button === 1 || e.button === 2 || this.tool === 'pan' || e.altKey) {
      this.drag = { type: 'pan', sx, sy, cx: this.view.cx, cz: this.view.cz };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    if (this.tool === 'kerbs') { if (this.T) this.kerbDown(wx, wz, sx, sy); return; }
    if (this.tool === 'bars') { if (this.T) this.barDown(wx, wz, sx, sy); return; }
    if (this.tool === 'pit') { if (this.T) this.pitDown(wx, wz, sx, sy); return; }
    if (this.tool === 'draw') {
      this.drag = { type: 'draw', pts: [[wx, wz]] };
      return;
    }
    if (this.tool === 'edit') {
      const th = this.hitTrackHandle(sx, sy);
      if (th) { this.drag = { type: 'thandle', k: th.k, end: th.end, moved: false }; sfx.move(); return; }
      const h = this.hitNode(sx, sy);
      if (h < 0 && (this.placing || !trackReady(this.track)) && !e.shiftKey) { // no track yet: build one node by node
        this.push();
        this.placing = true;
        const [x, z] = this.snapPt(wx, wz), P = this.track.points, last = P[P.length - 1];
        P.push({ x, z, w: last ? last.w : this.defaultWidth, e: last ? last.e : 0, b: 0 });
        this.sel.clear(); this.sel.add(P.length - 1);
        sfx.place();
        this.changed(true);
        if (P.length === minNodes(this.track)) this.toast('TRACK CREATED · KEEP CLICKING TO ADD NODES, ENTER WHEN DONE');
        this.setHint();
        return;
      }
      if (h >= 0) {
        if (e.shiftKey) { if (this.sel.has(h)) this.sel.delete(h); else this.sel.add(h); }
        else if (!this.sel.has(h)) { this.sel.clear(); this.sel.add(h); }
        const orig = [...this.sel].map(i => ({ i, x: this.track.points[i].x, z: this.track.points[i].z }));
        this.drag = { type: 'nodes', wx, wz, orig, moved: false, anchor: h };
        this.renderPanels(); this.showTab('node'); this.dirty = true;
        sfx.move();
      } else {
        this.drag = { type: 'box', sx, sy, ex: sx, ey: sy, add: e.shiftKey };
      }
      return;
    }
    if (this.tool === 'roads') {
      const nk = this.hitRoadNode(sx, sy);
      if (nk >= 0) { this.selRoadNode = nk; this.drag = { type: 'rnode', i: this.selRoad, k: nk, moved: false }; this.renderNodeTab(); this.dirty = true; sfx.move(); return; }
      this.selRoadNode = -1;
      const h = this.hitRoad(wx, wz);
      if (h >= 0) { this.selRoad = h; this.renderNodeTab(); this.drag = { type: 'rmove', i: h, wx, wz, orig: this.track.roads[h].pts.map(q => q.slice()), moved: false }; sfx.move(); }
      else { this.selRoad = -1; this.drag = { type: 'rdraw', pts: [[wx, wz]] }; this.renderNodeTab(); }
      this.dirty = true;
      return;
    }
    if (this.tool === 'sculpt') {
      const m = this.sculptMode;
      this.drag = { type: 'sculpt', stroke: { m, r: Math.round(this.sculptR), k: m === 'up' || m === 'down' ? this.sculptK : this.sculptS, pts: [[+wx.toFixed(1), +wz.toFixed(1)]] } };
      this.dirty = true;
      return;
    }
    if (this.tool === 'paint' && this.paintMode === 'shape') { this.shapeDown(wx, wz, sx, sy); return; }
    if (this.tool === 'paint') {
      const kind = this.paintKind || 'grass', stroke = { kind, r: this.brush || 12, pts: [[+wx.toFixed(1), +wz.toFixed(1)]] };
      if (kind === 'flora') Object.assign(stroke, { mix: this.floraMix || 'blossom', d: this.floraDens ?? 0.6, seed: 1 + Math.floor(Math.random() * 1e6) });
      if (kind === 'erase') stroke.what = this.eraseWhat || 'gnb';
      if (kind === 'crowd') Object.assign(stroke, { d: this.crowdDens ?? 0.5, seed: 1 + Math.floor(Math.random() * 1e6) });
      this.drag = { type: 'paint', stroke };
      this.dirty = true;
      return;
    }
    if (this.tool === 'zones') {
      const h = this.hitZone(sx, sy);
      if (h >= 0) {
        this.selZone = h; this.renderNodeTab();
        this.drag = { type: 'zmove', i: h, wx, wz, orig: this.track.zones[h].pts.map(q => q.slice()), moved: false };
        sfx.move();
      } else {
        this.drag = { type: 'zdraw', pts: [[wx, wz]] };
      }
      this.dirty = true;
      return;
    }
    if (this.tool === 'props') {
      // a line: a node of the picked one (reshape), or the line / one of its props (pick it, and move it all)
      const lh = this.hitLine(wx, wz, sx, sy);
      if (lh) {
        this.selLine = lh.L.id; this.selProp = -1; this.selBld = null;
        this.drag = lh.node >= 0 ? { type: 'lnode', L: lh.L, k: lh.node, moved: false } : { type: 'lmove', L: lh.L, wx, wz, pts0: lh.L.pts.map(q => [...q]), moved: false };
        this.renderItemTab(); this.dirty = true; sfx.move();
        return;
      }
      this.selLine = null;
      const h = this.hitProp(wx, wz);
      const hb = h < 0 ? this.hitBuilding(wx, wz) : null;
      if (hb) { // select a building (zone / imported / detached)
        this.selProp = -1; this.selBld = hb;
        this.drag = { type: 'bld', wx, wz, moved: false };
        this.renderNodeTab(); this.dirty = true; sfx.move();
        return;
      }
      this.selBld = null;
      if (h >= 0) {
        this.selProp = h;
        const p = this.track.props[h];
        this.drag = { type: 'prop', i: h, dx: p.x - wx, dz: p.z - wz, moved: false };
        this.renderItemTab(); sfx.move(); // (its picture and settings, straight away)
      } else if (this.modelProp()) {
        this.placeModel(...this.snapPt(wx, wz));
      } else { // (a prop, or a line of them if you drag: placed when the button comes up, finishPropLine)
        const [x, z] = this.snapPt(wx, wz);
        this.drag = { type: 'pline', x0: x, z0: z, x1: x, z1: z };
      }
      this.dirty = true;
    }
  }

  onMove(e) {
    this.shiftDown = e.shiftKey;
    if (!this.active) return;
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    this.mouse.x = sx; this.mouse.y = sy;
    this.mouse.inside = sx >= 0 && sy >= 0 && sx <= r.width && sy <= r.height;
    const [wx, wz] = this.s2w(sx, sy);
    this.mouse.wx = wx; this.mouse.wz = wz;
    const d = this.drag;
    if (this.profileDrag) return this.onProfileDrag(e);
    if (!d) { this.hoverNode = this.tool === 'edit' ? this.hitNode(sx, sy) : -1; this.hoverBld = this.tool === 'props' && (this.hitProp(wx, wz) >= 0 || !!this.hitBuilding(wx, wz)); this.dirty = true; return; }
    if (d.type === 'pan') {
      this.view.cx = d.cx - (sx - d.sx) / this.view.scale;
      this.view.cz = d.cz - (sy - d.sy) / this.view.scale;
    } else if (d.type === 'kerb') {
      this.kerbMove(wx, wz);
    } else if (d.type === 'bar') {
      this.barMove(wx, wz);
    } else if (d.type === 'pit') {
      this.pitMove(wx, wz);
    } else if (d.type === 'shape') {
      this.shapeMove(wx, wz);
    } else if (d.type === 'rdraw') {
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(wx - last[0], wz - last[1]) > 2) d.pts.push([wx, wz]);
    } else if (d.type === 'rnode') {
      if (!d.moved) { this.push(); d.moved = true; }
      this.track.roads[d.i].pts[d.k] = [Math.round(wx * 10) / 10, Math.round(wz * 10) / 10];
      this.roadsDirty = true;
    } else if (d.type === 'rmove') {
      if (!d.moved) { this.push(); d.moved = true; }
      this.track.roads[d.i].pts = d.orig.map(q => [q[0] + wx - d.wx, q[1] + wz - d.wz]);
      this.roadsDirty = true;
    } else if (d.type === 'bld') {
      if (!d.moved) { this.push(); d.moved = true; this.detachSel(); }
      const b = this.track.buildings[this.selBld?.ci]; if (b) {
        const dx = wx - d.wx, dz = wz - d.wz; d.wx = wx; d.wz = wz;
        b.p.forEach(q => { q[0] += dx; q[1] += dz; }); if (b.c) { b.c[0] += dx; b.c[1] += dz; }
        const sb = this.scen && this.scen.buildings.find(q => q.from === 'custom' && q.ci === this.selBld.ci);
        if (sb) { sb.p.forEach(q => { q[0] += dx; q[1] += dz; }); } else this.scheduleScenery(40);
      }
    } else if (d.type === 'paint' || d.type === 'sculpt') {
      const pts = d.stroke.pts, last = pts[pts.length - 1];
      if (Math.hypot(wx - last[0], wz - last[1]) > Math.max(1, d.stroke.r * 0.35)) pts.push([+wx.toFixed(1), +wz.toFixed(1)]);
    } else if (d.type === 'zdraw') {
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(wx - last[0], wz - last[1]) > 2) d.pts.push([wx, wz]);
    } else if (d.type === 'pline') {
      [d.x1, d.z1] = this.snapPt(wx, wz);
    } else if (d.type === 'lmove') {
      if (!d.moved) { this.push(); d.moved = true; }
      const dx = wx - d.wx, dz = wz - d.wz;
      d.L.pts = d.pts0.map(q => [+(q[0] + dx).toFixed(1), +(q[1] + dz).toFixed(1)]); this.regenLine(d.L);
    } else if (d.type === 'lnode') {
      if (!d.moved) { this.push(); d.moved = true; }
      const [x, z] = this.snapPt(wx, wz); d.L.pts[d.k] = [+x.toFixed(1), +z.toFixed(1)]; this.regenLine(d.L);
    } else if (d.type === 'zmove') {
      if (!d.moved) { this.push(); d.moved = true; }
      const z = this.track.zones[d.i];
      z.pts = d.orig.map(q => [q[0] + wx - d.wx, q[1] + wz - d.wz]);
      this.scheduleScenery(60);
    } else if (d.type === 'draw') {
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(wx - last[0], wz - last[1]) > 2.5) d.pts.push([wx, wz]);
    } else if (d.type === 'thandle') {
      // a curve handle: the other one turns to match (straight through the node), keeping its length; Shift: this one alone
      if (!d.moved) { this.push(); d.moved = true; }
      const p = this.track.points[d.k], cur = nodeHandles(this.track, d.k), h = [+(wx - p.x).toFixed(2), +(wz - p.z).toFixed(2)];
      const other = d.end === 'ho' ? 'hi' : 'ho';
      p[d.end] = h;
      if (cur[other] && !e.shiftKey) { const lh = Math.hypot(...h) || 1, lo = Math.hypot(...cur[other]); p[other] = [+(-h[0] * lo / lh).toFixed(2), +(-h[1] * lo / lh).toFixed(2)]; }
      this.dragRecompute();
    } else if (d.type === 'nodes') {
      if (!d.moved) { this.push(); d.moved = true; }
      let dx = wx - d.wx, dz = wz - d.wz;
      if (this.snap) {
        const a = d.orig.find(o => o.i === d.anchor);
        const [sx2, sz2] = this.snapPt(a.x + dx, a.z + dz);
        dx = sx2 - a.x; dz = sz2 - a.z;
      }
      for (const o of d.orig) { this.track.points[o.i].x = o.x + dx; this.track.points[o.i].z = o.z + dz; }
      this.dragRecompute();
    } else if (d.type === 'box') {
      d.ex = sx; d.ey = sy;
    } else if (d.type === 'prop') {
      if (!d.moved) { this.push(); d.moved = true; }
      const [x, z] = this.snapPt(wx + d.dx, wz + d.dz);
      const p = this.track.props[d.i]; p.x = x; p.z = z;
    }
    this.dirty = true;
  }

  onUp(e) {
    if (!this.active) return;
    const d = this.drag;
    this.drag = null; clearTimeout(this.rcT);
    if (this.profileDrag) { this.profileDrag = null; this.changed(true); return; }
    if (!d) return;
    this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : ['draw', 'paint', 'roads', 'sculpt'].includes(this.tool) ? 'crosshair' : 'default';
    if (d.type === 'kerb') this.kerbUp(d);
    else if (d.type === 'bar') this.barUp(d);
    else if (d.type === 'pit') this.pitUp(d);
    else if (d.type === 'shape') this.shapeUp(d);
    else if (d.type === 'rdraw') this.finishRoad(d.pts);
    else if ((d.type === 'rmove' || d.type === 'rnode') && d.moved) { this.changed(); this.scheduleScenery(0); }
    else if (d.type === 'bld' && d.moved) { this.changed(); this.scheduleScenery(0); }
    if (d.type === 'paint' && d.stroke.kind === 'houses') this.paintHouses(d.stroke);
    else if (d.type === 'paint') { this.push(); if (d.stroke.kind === 'erase') this.eraseUnder(d.stroke); this.track.paint.push(d.stroke); sfx.place(); this.changed(); this.renderNodeTab(); this.scheduleScenery(0); }
    else if (d.type === 'sculpt') { this.push(); this.track.sculpt.push(d.stroke); this.sculptView = null; sfx.place(); this.changed(); this.renderNodeTab(); }
    else if (d.type === 'draw') this.finishDraw(d.pts);
    else if (d.type === 'zdraw') this.finishZone(d.pts);
    else if (d.type === 'zmove' && d.moved) this.changed();
    else if ((d.type === 'nodes' || d.type === 'thandle') && d.moved) { this.changed(true); if (d.type === 'thandle') this.renderPanels(); }
    else if (d.type === 'prop' && d.moved) this.changed();
    else if (d.type === 'pline') this.finishPropLine(d);
    else if ((d.type === 'lmove' || d.type === 'lnode') && d.moved) { this.changed(); this.renderItemTab(); }
    else if (d.type === 'box') {
      const x0 = Math.min(d.sx, d.ex), x1 = Math.max(d.sx, d.ex), y0 = Math.min(d.sy, d.ey), y1 = Math.max(d.sy, d.ey);
      if (!d.add) this.sel.clear();
      if (x1 - x0 > 4 || y1 - y0 > 4) {
        this.track.points.forEach((p, i) => { const [x, y] = this.w2s(p.x, p.z); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) this.sel.add(i); });
        if (this.sel.size) this.showTab('node');
      }
      this.renderPanels();
    }
    this.dirty = true;
  }

  onDbl(e) {
    if (this.tool === 'roads') return this.insertRoadNode(...this.s2w(e.offsetX, e.offsetY));
    if (this.tool === 'bars') return this.T && this.barDbl(...this.s2w(e.offsetX, e.offsetY));
    if (this.tool === 'pit') return this.T && this.pitDbl();
    if (this.tool === 'paint' && this.paintMode === 'shape') return this.shapeDbl(...this.s2w(e.offsetX, e.offsetY));
    if (this.tool === 'props') return this.insertLineNode(...this.s2w(e.offsetX, e.offsetY));
    if (this.tool !== 'edit') return;
    const [wx, wz] = this.s2w(e.offsetX, e.offsetY);
    if (this.hitNode(e.offsetX, e.offsetY) >= 0) return;
    const T = this.T;
    if (!T) return;
    const ns = this.nearestSample(wx, wz);
    if (ns.d > T.W[ns.i] / 2 + 6) return;
    const P = this.track.points, n = P.length;
    if (T.open && (ns.i > T.finish)) { // on the run-off (extend the finish) or the grid lead-in (extend the start)
      const front = ns.i > T.cut, end = front ? P[0] : P[n - 1];
      if (Math.hypot(wx - end.x, wz - end.z) < 20) return;
      this.push();
      const [x, z] = this.snapPt(wx, wz), np = { x, z, w: end.w, e: end.e, b: 0 };
      if (front) { P.unshift(np); this.sel.clear(); this.sel.add(0); } else { P.push(np); this.sel.clear(); this.sel.add(P.length - 1); }
      sfx.place(); this.changed(true); this.toast(front ? 'START MOVED BACK' : 'FINISH EXTENDED');
      return;
    }
    const a = Math.floor(T.NODE[ns.i]) % n, b = (a + 1) % n;
    const f = T.NODE[ns.i] - Math.floor(T.NODE[ns.i]);
    this.push();
    const np = { x: T.X[ns.i], z: T.Z[ns.i], w: P[a].w + (P[b].w - P[a].w) * f, e: P[a].e + (P[b].e - P[a].e) * f, b: P[a].b + (P[b].b - P[a].b) * f };
    if (P[a].ho || P[b].hi) { // a curve with handles: split it exactly there (de Casteljau), so the road doesn't move
      const ho = nodeHandles(this.track, a).ho, hi = nodeHandles(this.track, b).hi, L = (p, q) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
      const p0 = [P[a].x, P[a].z], p1 = [p0[0] + ho[0], p0[1] + ho[1]], p3 = [P[b].x, P[b].z], p2 = [p3[0] + hi[0], p3[1] + hi[1]];
      const q0 = L(p0, p1), q1 = L(p1, p2), q2 = L(p2, p3), r0 = L(q0, q1), r1 = L(q1, q2), m = L(r0, r1), r = (v) => Math.round(v * 10) / 10;
      Object.assign(np, { x: r(m[0]), z: r(m[1]), hi: [r(r0[0] - m[0]), r(r0[1] - m[1])], ho: [r(r1[0] - m[0]), r(r1[1] - m[1])] });
      P[a].ho = [r(q0[0] - p0[0]), r(q0[1] - p0[1])]; P[b].hi = [r(q2[0] - p3[0]), r(q2[1] - p3[1])];
    }
    P.splice(a + 1, 0, np);
    if (this.track.start > a) this.track.start++;
    this.sel.clear(); this.sel.add(a + 1);
    sfx.place();
    this.changed(true);
  }

  finishDraw(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const open = !!this.track.open;
    if (len < (open ? 150 : 250)) { sfx.error(); this.toast(open ? 'DRAW A LONGER ROAD (150M+)' : 'DRAW A BIGGER LOOP (250M+)'); this.dirty = true; return; }
    // resample every 4m
    const rs = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let [x0, z0] = pts[i - 1]; const [x1, z1] = pts[i];
      let seg = Math.hypot(x1 - x0, z1 - z0);
      while (acc + seg >= 4) {
        const k = (4 - acc) / seg;
        x0 = x0 + (x1 - x0) * k; z0 = z0 + (z1 - z0) * k;
        rs.push([x0, z0]); seg = Math.hypot(x1 - x0, z1 - z0); acc = 0;
      }
      acc += seg;
    }
    // smooth jitter
    const sm = rs.map((p, i) => {
      let x = 0, z = 0, c = 0;
      for (let k = -4; k <= 4; k++) { const q = rs[clamp(i + k, 0, rs.length - 1)]; x += q[0]; z += q[1]; c++; }
      return [x / c, z / c];
    });
    // the road: a point about every corner, each with its curve handles (js/spline.js)
    let S = sm;
    if (!open) { // (where the end runs back over the start it's dropped: the loop closes itself with a curve)
      let k = S.length; while (k > S.length / 2 && Math.hypot(S[k - 1][0] - S[0][0], S[k - 1][1] - S[0][1]) < 30) k--; S = S.slice(0, k);
    }
    const out = fitStroke(S, open, clamp(5 / this.view.scale, 3, 20)); // (as close as a hand can draw: about 5 pixels at this zoom)
    if (out.length < minNodes(this.track)) { sfx.error(); this.toast(open ? 'TRY AGAIN — DRAW A LONGER ROAD' : 'TRY AGAIN — NEED A PROPER LOOP'); return; }
    this.push();
    const r1 = (v) => Math.round(v * 10) / 10;
    this.track.points = out.map(p => { const [sx, sz] = this.snapPt(p.x, p.z); return { x: sx, z: sz, w: this.defaultWidth, e: 0, b: 0, ...(p.hi ? { hi: p.hi.map(r1) } : {}), ...(p.ho ? { ho: p.ho.map(r1) } : {}) }; });
    this.track.start = 0;
    this.sel.clear();
    sfx.select();
    this.changed(true);
    this.toast(`${open ? 'Road' : 'Circuit'} drawn: ${out.length} points. Drag a point, or click it for its curve handles`);
    this.setTool('edit');
  }

  onKey(e) {
    if (!this.active) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (!$('ed-modal').hidden) { if (e.code === 'Escape') this.closeModal(); return; }
    if (this.v3d && this.key3d(e)) { e.preventDefault(); return; } // (what the 3D view doesn't take goes on: undo, delete, save...)
    if (this.tool === 'paint' && this.paintMode === 'shape' && !(e.ctrlKey || e.metaKey) && this.shapeKey(e)) { e.preventDefault(); return; }
    if (e.code === 'KeyV' && !(e.ctrlKey || e.metaKey)) { this.open3d(); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (ctrl && e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
    if (ctrl && e.code === 'KeyS') { e.preventDefault(); this.save(); return; }
    if (ctrl && e.code === 'KeyA' && this.tool === 'edit') { e.preventDefault(); this.track.points.forEach((p, i) => this.sel.add(i)); this.renderPanels(); this.dirty = true; return; }
    if (e.code === 'Tab') { e.preventDefault(); this.setMode(MODES[(MODES.indexOf(this.mode) + (e.shiftKey ? -1 : 1) + MODES.length) % MODES.length]); sfx.move(); return; }
    if (e.code === 'Digit1') this.setTool('draw');
    if (e.code === 'Digit2') this.setTool('edit');
    if (e.code === 'Digit3') this.setTool('props');
    if (e.code === 'Digit4') this.setTool('zones');
    if (e.code === 'Digit5') this.setTool('pan');
    if (e.code === 'Digit6') this.setTool('paint');
    if (e.code === 'Digit7') this.setTool('roads');
    if (e.code === 'Digit8') this.setTool('sculpt');
    if (e.code === 'Digit9') this.setTool('kerbs');
    if (e.code === 'Digit0') this.setTool('bars');
    if (e.code === 'KeyP' && !(e.ctrlKey || e.metaKey)) this.setTool('pit');
    if (e.code === 'KeyR' && !(e.ctrlKey || e.metaKey)) this.setTool('runoff');
    if (this.tool === 'paint' && (e.code === 'BracketLeft' || e.code === 'BracketRight')) { this.brush = Math.max(0.5, Math.min(80, (this.brush || 12) * (e.code === 'BracketRight' ? 1.25 : 0.8))); this.renderNodeTab(); this.dirty = true; }
    if (this.tool === 'sculpt' && (e.code === 'BracketLeft' || e.code === 'BracketRight')) { this.sculptR = Math.max(8, Math.min(150, this.sculptR * (e.code === 'BracketRight' ? 1.25 : 0.8))); this.renderNodeTab(); this.dirty = true; }
    if (e.code === 'KeyF') this.fit();
    if (e.code === 'KeyG') this.action('grid');
    if (e.code === 'KeyT') this.action('seethru');
    if ((e.code === 'Escape' || e.code === 'Enter') && this.placing) { this.placing = false; this.setHint(); if (e.code === 'Enter') return; }
    if (e.code === 'Escape') { this.sel.clear(); this.selProp = -1; this.selBld = null; this.selRoad = -1; this.selLine = null; this.renderPanels(); this.dirty = true; }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      e.preventDefault();
      if (this.tool === 'props' && this.selLine && this.lineById(this.selLine)) { this.push(); this.removeLine(this.lineById(this.selLine)); sfx.del(); this.changed(); this.renderItemTab(); }
      else if (this.tool === 'props' && this.selProp >= 0) { this.push(); this.track.props.splice(this.selProp, 1); this.selProp = -1; sfx.del(); this.changed(); }
      else if (this.tool === 'props' && this.selBld) this.deleteBuilding();
      else if (this.tool === 'roads' && this.selRoad >= 0 && this.selRoadNode >= 0) this.deleteRoadNode();
      else if (this.tool === 'roads' && this.selRoad >= 0) this.deleteRoad();
      else if (this.tool === 'zones' && this.selZone >= 0) this.deleteZone();
      else if (this.tool === 'kerbs') this.kerbDelete();
      else if (this.tool === 'bars') this.barDelete();
      else if (this.tool === 'pit') this.pitDelete();
      else if (this.sel.size) this.deleteNodes();
    }
    if ((e.code === 'KeyQ' || e.code === 'KeyE') && this.tool === 'props') {
      const d = (e.code === 'KeyQ' ? -1 : 1) * Math.PI / 12;
      const Ls = this.selLine && this.lineById(this.selLine);
      if (Ls) { this.push(); Ls.turn = (Ls.turn || 0) + d; this.regenLine(Ls); this.changed(); }
      else if (this.selProp >= 0) { this.push(); this.track.props[this.selProp].rot += d; this.changed(); }
      else if (this.selBld) this.rotateBuilding(d);
      else { this.propRot += d; this.nextRot = null; }
      this.dirty = true;
    }
  }

  deleteNodes() {
    const P = this.track.points;
    if (!this.sel.size) return;
    // (deleting down below the minimum, even every node, is fine: there's just no track until you draw one)
    this.push();
    const idx = [...this.sel].sort((a, b) => b - a);
    const startNode = P[this.track.start];
    idx.forEach(i => P.splice(i, 1));
    const ns = P.indexOf(startNode);
    this.track.start = ns >= 0 ? ns : 0;
    this.sel.clear();
    sfx.del();
    this.changed(true);
    if (!trackReady(this.track)) { this.setTool(this.tool); this.toast(P.length ? `${P.length} NODE${P.length > 1 ? 'S' : ''} LEFT · DRAW A NEW TRACK OR CLICK TO ADD NODES` : 'TRACK CLEARED · DRAW A NEW ONE'); }
  }


  // ---------------- zones ----------------
  hitZone(sx, sy) {
    let best = -1, bd = 9;
    this.track.zones.forEach((z, i) => {
      for (let k = 1; k < z.pts.length; k++) {
        const [ax, ay] = this.w2s(z.pts[k - 1][0], z.pts[k - 1][1]), [bx, by] = this.w2s(z.pts[k][0], z.pts[k][1]);
        const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
        let t = l ? ((sx - ax) * dx + (sy - ay) * dy) / l : 0; t = clamp(t, 0, 1);
        const d = Math.hypot(sx - ax - dx * t, sy - ay - dy * t);
        if (d < bd) { bd = d; best = i; }
      }
    });
    return best;
  }
  finishZone(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len < 20) { this.dirty = true; return; }
    // simplify the stroke
    const keep = [pts[0]];
    const eps = 2.5;
    const rdp = (a, b) => {
      let md = 0, mi = -1;
      const [ax, az] = pts[a], [bx, bz] = pts[b], L = Math.hypot(bx - ax, bz - az) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L; if (d > md) { md = d; mi = i; } }
      if (md > eps && mi > 0) { rdp(a, mi); rdp(mi, b); } else keep.push(pts[b]);
    };
    rdp(0, pts.length - 1);
    this.push();
    const z = { ...this.zoneDef, bizTypes: [...(this.zoneDef.bizTypes || BUSINESS_KEYS)], pts: keep.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]), seed: Math.floor(Math.random() * 1e9) };
    this.track.zones.push(z);
    this.selZone = this.track.zones.length - 1;
    sfx.place();
    this.changed();
    this.renderNodeTab();
    this.scheduleScenery(0);
  }
  deleteZone() {
    if (this.selZone < 0) return;
    this.push();
    this.track.zones.splice(this.selZone, 1);
    this.selZone = -1;
    sfx.del();
    this.changed(); this.renderNodeTab(); this.scheduleScenery(0);
  }
  zoneTarget() { return this.selZone >= 0 ? this.track.zones[this.selZone] : this.zoneDef; }
  renderZoneCount() {
    const el = $('z-count'); if (!el) return;
    if (this.selZone < 0 || !this.scen) { el.innerHTML = ''; return; }
    const k = this.scen.buildings.filter(b => b.zi === this.selZone).length, r = this.scen.rejected.filter(b => b.zi === this.selZone).length;
    const z = this.track.zones[this.selZone];
    el.innerHTML = ZONE_TYPES[z.kind].trees ? '' : `<b>${k}</b> buildings in this zone${r ? ` · <span style="color:var(--sv-bad)">${r} skipped (on track)</span>` : ''}`;
  }
  renderZoneTab() {
    const el = $('tab-node');
    const z = this.zoneTarget();
    const def = ZONE_TYPES[z.kind];
    const editing = this.selZone >= 0;
    el.innerHTML = `
      <h4>${editing ? 'ZONE · ' + def.label.toUpperCase() : 'NEW ZONE SETTINGS'}</h4>
      <div class="fld"><label>Type</label><div class="seg" id="z-kind">${Object.entries(ZONE_TYPES).map(([k, v]) => `<button data-v="${k}" class="${z.kind === k ? 'on' : ''}">${v.label}</button>`).join('')}</div></div>
      <div class="fld"><label>Side of line</label><div class="seg" id="z-side">${['left', 'both', 'right'].map(k => `<button data-v="${k}" class="${z.side === k ? 'on' : ''}">${k}</button>`).join('')}</div></div>
      ${def.trees ? '' : fld('Min height', 'z-hmin', 3, 200, 1, z.hMin, 'm') + fld('Max height', 'z-hmax', 3, 200, 1, z.hMax, 'm')}
      ${fld(def.trees ? 'Tree spacing' : 'Gap between', 'z-gap', 0, 40, 0.5, z.gap, 'm')}
      ${fld('Setback from line', 'z-set', 0, 40, 0.5, z.setback, 'm')}
      ${def.trees ? '' : fld('Building size', 'z-size', 0.5, 2, 0.05, z.size, 'x')}
      ${def.style === 'shop' ? fld('Business mix', 'z-biz', 0, 100, 5, Math.round((z.bizMix ?? def.bizMix ?? 0) * 100), '%') + `<div class="fld"><label>Businesses to mix in</label><div class="seg" id="z-biztypes">${BUSINESS_KEYS.map(k => `<button data-v="${k}" class="${(z.bizTypes || BUSINESS_KEYS).includes(k) ? 'on' : ''}">${BUSINESSES[k].label}</button>`).join('')}</div></div>` : ''}
      ${editing ? '<div class="seg" style="margin-top:8px"><button id="z-reroll">Reroll Layout</button><button id="z-del">Delete Zone</button></div>' : ''}
      <p class="muted" style="margin-top:12px">${editing ? 'Drag the zone line to move it.' : 'Draw a line with the mouse and buildings spawn along it.'} Left / right is relative to the direction you drew. Anything that lands on the track or its runoff is skipped automatically.</p>
      ${editing ? '<div class="seg"><button id="z-new">New Zone Settings</button></div>' : ''}
      <div class="count" id="z-count"></div>`;
    const apply = () => { if (editing) { this.scheduleScenery(80); this.dirty = true; } };
    segBind('z-kind', v => {
      if (editing) this.push();
      const d = ZONE_TYPES[v];
      Object.assign(z, { kind: v, hMin: d.hMin, hMax: d.hMax, gap: d.gap, setback: d.setback, size: 1, bizMix: d.bizMix ?? 0 });
      this.renderZoneTab(); apply(); if (editing) this.changed();
    });
    segBind('z-side', v => { if (editing) this.push(); z.side = v; apply(); if (editing) this.changed(); });
    const num = (id, key, unit) => {
      const inp = $(id); if (!inp) return;
      inp.addEventListener('pointerdown', () => { if (editing) this.push(); });
      inp.addEventListener('input', () => { z[key] = +inp.value; $(id + '-v').textContent = inp.value + unit; apply(); });
      inp.addEventListener('change', () => { if (editing) this.changed(); });
    };
    num('z-hmin', 'hMin', 'm'); num('z-hmax', 'hMax', 'm'); num('z-gap', 'gap', 'm'); num('z-set', 'setback', 'm'); num('z-size', 'size', 'x');
    const zb = $('z-biz');
    if (zb) {
      zb.addEventListener('pointerdown', () => { if (editing) this.push(); });
      zb.addEventListener('input', () => { z.bizMix = +zb.value / 100; $('z-biz-v').textContent = zb.value + '%'; apply(); });
      zb.addEventListener('change', () => { if (editing) this.changed(); });
    }
    document.querySelectorAll('#z-biztypes button').forEach(b => b.addEventListener('click', () => {
      if (editing) this.push();
      const list = new Set(z.bizTypes || BUSINESS_KEYS);
      if (list.has(b.dataset.v)) { if (list.size > 1) list.delete(b.dataset.v); } else list.add(b.dataset.v);
      z.bizTypes = BUSINESS_KEYS.filter(k => list.has(k));
      b.classList.toggle('on', list.has(b.dataset.v)); sfx.move(); apply(); if (editing) this.changed();
    }));
    $('z-reroll') && $('z-reroll').addEventListener('click', () => { this.push(); z.seed = Math.floor(Math.random() * 1e9); sfx.select(); apply(); this.changed(); });
    $('z-del') && $('z-del').addEventListener('click', () => this.deleteZone());
    $('z-new') && $('z-new').addEventListener('click', () => { this.selZone = -1; this.renderZoneTab(); this.dirty = true; });
    this.renderZoneCount();
  }

  // ---------------- real-world map ----------------
  renderMapTab() {
    const el = $('tab-map'), t = this.track, g = t.geo;
    const osm = t.osm;
    el.innerHTML = `
      <h4>LOCATION</h4>
      <div class="m-search"><input id="map-q" placeholder="Search a town, street or circuit…" spellcheck="false"><button id="map-go">Go</button></div>
      <div class="map-results" id="map-results"></div>
      <div class="seg"><button id="map-me">Use My Location</button></div>
      <div class="map-cur">${g ? '&#9679; ' + esc(g.label || 'Custom location') + `<br><span style="color:var(--sv-red-dim)">${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}</span>` : '<span style="color:#7f8ca6">No real location yet — search for your home town to put the circuit on the map.</span>'}</div>
      <h4 style="margin-top:14px">MAP LAYER</h4>
      <div class="fld"><div class="seg" id="map-style">${[['off', 'Off'], ['streets', 'Streets'], ['satellite', 'Satellite']].map(([k, l]) => `<button data-v="${k}" class="${t.map.style === k ? 'on' : ''}" ${!g && k !== 'off' ? 'disabled' : ''}>${l}</button>`).join('')}</div></div>
      ${fld('Map opacity', 'map-op', 0.1, 1, 0.05, t.map.opacity, '')}
      <h4 style="margin-top:14px">REAL ELEVATION</h4>
      ${this.elevHtml()}
      <h4 style="margin-top:14px">GROUND FROM PHOTO</h4>
      ${this.groundHtml()}
      <h4 style="margin-top:14px">REAL-WORLD SCENERY</h4>
      <p class="muted">Pull real buildings and trees from OpenStreetMap around your circuit. Houses get pitched roofs, heights come from the map data where available. Anything on the track or runoff is removed automatically.</p>
      <div class="fld"><div class="seg" id="map-what"><button data-v="b" class="${this.impB !== false ? 'on' : ''}">Buildings</button><button data-v="t" class="${this.impT !== false ? 'on' : ''}">Trees & Woods</button></div></div>
      ${fld('Area around circuit', 'map-margin', 50, 600, 25, this.impMargin || 250, 'm')}
      <button id="map-import" class="hot wide" ${g ? '' : 'disabled'}>Import Around Circuit</button>
      <div class="map-status" id="map-status">${osm ? `Imported <b>${osm.buildings.length}</b> buildings and <b>${osm.trees.length}</b> trees.` : ''}</div>
      ${osm ? '<button id="map-clear" class="wide">Clear Imported Scenery</button>' : ''}
      <p class="muted" style="margin-top:12px">Tip: use DRAW to trace real streets over the map, then import. Re-import after big changes so new areas are filled in. Map data © OpenStreetMap contributors.</p>`;
    const q = $('map-q');
    const showResults = () => {
      const box = $('map-results'), res = this.searchRes || [];
      if (res.length < 2) { box.innerHTML = ''; return; }
      box.innerHTML = '<div class="r" style="color:var(--sv-red-dim);cursor:default">Not the right place? Pick another:</div>' +
        res.map((r, i) => `<div class="r" data-i="${i}">${i === this.searchPick ? '&#9658; ' : ''}${esc(r.label)}</div>`).join('');
      box.querySelectorAll('[data-i]').forEach(d => d.addEventListener('click', () => { this.searchPick = +d.dataset.i; this.setLocation(res[this.searchPick]); }));
    };
    const go = async () => {
      const v = q.value.trim(); if (!v) return;
      this.searchQ = v;
      const box = $('map-results'); box.innerHTML = '<div class="r">Searching…</div>';
      $('map-go').disabled = true;
      try {
        const res = await searchPlace(v);
        this.searchRes = res; this.searchPick = 0;
        if (!res.length) { box.innerHTML = '<div class="r">No places found — try adding the city or country.</div>'; }
        else this.setLocation(res[0]); // jump straight to the best match
      } catch (e) { box.innerHTML = `<div class="r">Search failed: ${esc(e.message)}. Check your internet connection.</div>`; }
      const b = $('map-go'); if (b) b.disabled = false;
    };
    if (this.searchQ) q.value = this.searchQ;
    showResults();
    $('map-go').addEventListener('click', go);
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } e.stopPropagation(); });
    $('map-me').addEventListener('click', async () => {
      $('map-results').innerHTML = '<div class="r">Finding you…</div>';
      try { this.setLocation(await myLocation()); } catch (e) { $('map-results').innerHTML = `<div class="r">${esc(e.message)}</div>`; }
    });
    segBind('map-style', v => { t.map.style = v; this.dirty = true; this.updateAttr(); this.saveWork(); });
    const op = $('map-op');
    op.addEventListener('input', () => { t.map.opacity = +op.value; $('map-op-v').textContent = op.value; this.dirty = true; });
    op.addEventListener('change', () => this.saveWork());
    document.querySelectorAll('#map-what button').forEach(b => b.addEventListener('click', () => {
      b.classList.toggle('on'); if (b.dataset.v === 'b') this.impB = b.classList.contains('on'); else this.impT = b.classList.contains('on'); sfx.move();
    }));
    const mg = $('map-margin');
    mg.addEventListener('input', () => { this.impMargin = +mg.value; $('map-margin-v').textContent = mg.value + 'm'; });
    $('map-import').addEventListener('click', () => this.doImport());
    this.bindElev();
    this.bindGround();
    $('map-clear') && $('map-clear').addEventListener('click', () => { this.push(); this.track.osm = null; this.changed(true); this.scheduleScenery(0); this.toast('IMPORTED SCENERY CLEARED'); });
    this.updateAttr();
  }
  updateAttr() {
    const t = this.track, st = t && t.geo && t.map.style !== 'off' ? MAP_STYLES[t.map.style] : null;
    $('ed-attr').textContent = st ? st.attr : '';
  }
  setLocation(place) {
    this.push();
    const t = this.track;
    // centre the circuit on the new location
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const p of t.points) { a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.z); d = Math.max(d, p.z); }
    const ox = (a + b) / 2, oz = (c + d) / 2;
    t.points.forEach(p => { p.x -= ox; p.z -= oz; });
    t.props.forEach(p => { p.x -= ox; p.z -= oz; });
    t.zones.forEach(z => z.pts.forEach(q => { q[0] -= ox; q[1] -= oz; }));
    const moved = !!t.osm;
    t.osm = null; t.ground = null;
    t.geo = { lat: place.lat, lon: place.lon, label: (place.label || '').split(',').slice(0, 3).join(',') };
    if (t.map.style === 'off') t.map.style = 'satellite';
    if (t.env.theme !== 'city') { t.env.theme = 'city'; t.env.runoff = THEMES.city.runoff; t.env.barrier = THEMES.city.barrier; }
    this.changed(true);
    this.view.cx = 0; this.view.cz = 0;
    this.view.scale = Math.max(this.view.scale, 0.6);
    sfx.select();
    this.toast(moved ? 'LOCATION SET · OLD IMPORT CLEARED' : 'LOCATION SET · TRACE THE STREETS WITH DRAW');
    this.showTab('map');
  }
  // ---------------- real elevation ----------------
  elevStats() {
    const t = this.track, terr = t.terrain; if (!terr || !this.T) return null;
    const T = this.T; let lo = Infinity, hi = -Infinity, grade = 0;
    for (let i = 0; i < T.N; i++) { lo = Math.min(lo, T.Y[i]); hi = Math.max(hi, T.Y[i]); }
    const k = Math.max(1, Math.round(20 / T.ds));
    for (let i = 0; i < T.N; i++) grade = Math.max(grade, Math.abs(T.Y[(i + k) % T.N] - T.Y[i]) / (k * T.ds));
    return { range: hi - lo, real: (hi - lo) / terr.exag, grade: grade * 100, asl: terr.lo + terr.base };
  }
  elevHtml() {
    const t = this.track, terr = t.terrain, st = this.elevStats();
    if (!t.geo) return '<p class="muted">Set a real location first, then the hills of the real place can be projected onto your circuit.</p>';
    if (!this.T) return '<p class="muted">Draw a track first, then the real hills can be projected onto it.</p>';
    if (!terr) return `<p class="muted">Project the real hills and valleys of this place onto the circuit, and shape the land around it to match.</p>
      <button id="elev-get" class="hot wide">Get Real Elevation</button><div class="map-status" id="elev-status"></div>`;
    return `<div class="map-cur">Real climb along the circuit: <b>${st.real.toFixed(0)} m</b> (lowest point ${st.asl.toFixed(0)} m above sea level)<br>
        In game: <b>${st.range.toFixed(0)} m</b> &middot; steepest ${st.grade.toFixed(0)}%${st.grade > 22 ? ' <span style="color:var(--sv-bad)">(very steep!)</span>' : ''}</div>
      ${fld('Exaggeration', 'elev-x', 0.25, EXAG_MAX, 0.25, terr.exag, 'x')}
      <div class="fld"><div class="seg" id="elev-ground"><button data-v="1" class="${terr.ground !== false ? 'on' : ''}">Real ground around track</button><button data-v="0" class="${terr.ground === false ? 'on' : ''}">Road only</button></div></div>
      <div class="seg"><button id="elev-reapply">Re-project onto track</button><button id="elev-clear">Remove</button></div>
      <div class="map-status" id="elev-status"></div>
      <p class="muted">Re-project after moving the circuit (hand-edited heights are replaced). ${TERRAIN_ATTR}.</p>`;
  }
  bindElev() {
    const t = this.track;
    $('elev-get') && $('elev-get').addEventListener('click', () => this.getElevation());
    const x = $('elev-x');
    if (x) {
      x.addEventListener('input', () => {
        $('elev-x-v').textContent = x.value + 'x';
        t.terrain.exag = +x.value;
        projectOntoTrack(t, sampleTrack); this.changed(false);
      });
      x.addEventListener('change', () => { this.saveWork(); this.renderMapTab(); });
      x.addEventListener('pointerdown', () => this.push());
    }
    segBind('elev-ground', v => { this.push(); t.terrain.ground = v === '1'; this.changed(false); this.saveWork(); });
    $('elev-reapply') && $('elev-reapply').addEventListener('click', () => {
      // moved outside the downloaded area? fetch again
      const T = this.T; let out = false;
      if (!T) return;
      // re-download if the track moved, or the data only covers the old (smaller) area around it
      for (let i = 0; i < T.N; i += 10) if (!inGrid(t.terrain, T.X[i] + 1400, T.Z[i]) || !inGrid(t.terrain, T.X[i] - 1400, T.Z[i]) || !inGrid(t.terrain, T.X[i], T.Z[i] + 1400) || !inGrid(t.terrain, T.X[i], T.Z[i] - 1400)) { out = true; break; }
      if (out) return this.getElevation();
      this.push(); const added = projectOntoTrack(t, sampleTrack); this.changed(true); this.showTab('map');
      this.toast(added ? `ELEVATION RE-PROJECTED · ${added} NODES ADDED` : 'ELEVATION RE-PROJECTED');
    });
    $('elev-clear') && $('elev-clear').addEventListener('click', () => { this.push(); t.terrain = null; this.changed(true); this.showTab('map'); this.toast('REAL ELEVATION REMOVED'); });
  }
  async getElevation() {
    const t = this.track; if (!t.geo || !this.T) return;
    const st = $('elev-status'), btn = $('elev-get') || $('elev-reapply');
    if (btn) btn.disabled = true;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let i = 0; i < this.T.N; i++) { a = Math.min(a, this.T.X[i]); b = Math.max(b, this.T.X[i]); c = Math.min(c, this.T.Z[i]); d = Math.max(d, this.T.Z[i]); }
    const m = 1650, box = [a - m, c - m, b + m, d + m]; // out to the 1.6 km ring of real ground the game builds
    const area = (box[2] - box[0]) * (box[3] - box[1]);
    const step = Math.max(16, Math.ceil(Math.sqrt(area / 30000))); // keep the grid ~30k points
    try {
      const g = await fetchElevation(t.geo, box, step, (msg) => { if (st) { st.className = 'map-status'; st.textContent = msg; } });
      this.push();
      const old = t.terrain;
      t.terrain = packTerrain(g);
      if (old) { t.terrain.exag = old.exag; t.terrain.ground = old.ground; }
      const added = projectOntoTrack(t, sampleTrack);
      this.changed(true);
      this.showTab('map');
      const s2 = this.elevStats();
      sfx.select();
      this.toast(`REAL ELEVATION · ${s2.real.toFixed(0)} M CLIMB${added ? ` · ${added} NODE${added > 1 ? "S" : ""} ADDED` : ''}`);
    } catch (e) {
      sfx.error();
      const s3 = $('elev-status'); if (s3) { s3.className = 'map-status err'; s3.textContent = e.message; }
      if (btn) btn.disabled = false;
    }
  }

  // ---------------- ground from photo (groundmap.js) ----------------
  groundHtml() {
    const t = this.track, G = t.ground, src = groundSource(t.geo);
    if (!t.geo) return '<p class="muted">Set a real location first, then the land around the circuit can be colored like the real place.</p>';
    if (!this.T) return '<p class="muted">Draw a track first, then the land around it can be colored like the real place.</p>';
    if (!src) return '<p class="muted">No open aerial photos for this place yet. So far: the Netherlands, Wallonia (Belgium), the USA and Japan.</p>';
    return `<p class="muted">Colors the land around the circuit like the real place, from open aerial photos (${src.name}): grass, dry grass, sand, woods, car parks. Takes about a minute the first time. Anything it gets wrong, paint over with PAINT &rsaquo; Grass.${src.approx ? ' (No infrared photos here: grass and paving are told apart by color only, so expect more touch-ups.)' : ''}</p>
      <button id="gnd-make" class="hot wide">${G ? 'Redo From Photo' : 'Ground From Photo'}</button>
      <div class="map-status" id="gnd-status">${G ? `Ground colored over <b>${(G.w * G.res / 1000).toFixed(1)} &times; ${(G.h * G.res / 1000).toFixed(1)} km</b>.` : ''}</div>
      ${G ? `<div class="seg"><button id="gnd-show" class="${this.showGround !== false ? 'on' : ''}">Show On Map</button><button id="gnd-clear">Remove</button></div>
      <p class="muted">${esc(G.credit || '')}</p>` : ''}`;
  }
  bindGround() {
    $('gnd-make') && $('gnd-make').addEventListener('click', () => this.makeGround());
    $('gnd-show') && $('gnd-show').addEventListener('click', () => { this.showGround = this.showGround === false; sfx.move(); this.dirty = true; this.renderMapTab(); });
    $('gnd-clear') && $('gnd-clear').addEventListener('click', () => { this.push(); this.track.ground = null; sfx.del(); this.changed(true); this.showTab('map'); this.toast('GROUND MAP REMOVED'); });
  }
  async makeGround() {
    const t = this.track; if (!t.geo || !this.T || this.groundBusy) return;
    const st = $('gnd-status'), btn = $('gnd-make'), m = GROUND_MARGIN;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let i = 0; i < this.T.N; i++) { a = Math.min(a, this.T.X[i]); b = Math.max(b, this.T.X[i]); c = Math.min(c, this.T.Z[i]); d = Math.max(d, this.T.Z[i]); }
    const box = [a - m, c - m, b + m, d + m], km2 = (box[2] - box[0]) * (box[3] - box[1]) / 1e6;
    if (km2 > 40) { st.className = 'map-status err'; st.textContent = `That's ${km2.toFixed(0)} km² of photos: too big. Make the circuit smaller first.`; return; }
    this.groundBusy = true; btn.disabled = true; st.className = 'map-status';
    const say = (msg) => { const e = $('gnd-status'); if (e) e.textContent = msg; };
    try {
      const geo = t.geo, G = await groundMap(geo, box, say);
      if (this.track !== t || t.geo !== geo) return; // (another circuit, or moved, while the photos came in)
      this.push();
      t.ground = G;
      this.changed(true);
      this.showTab('map');
      sfx.select();
      this.toast('GROUND COLORED FROM THE AERIAL PHOTOS');
    } catch (e) {
      sfx.error();
      const s3 = $('gnd-status'); if (s3) { s3.className = 'map-status err'; s3.textContent = e.message; }
    } finally {
      this.groundBusy = false; const b2 = $('gnd-make'); if (b2) b2.disabled = false;
    }
  }

  async doImport() {
    const t = this.track;
    if (!t.geo) return;
    if (!this.T) { this.needTrack('IMPORT'); return; }
    const st = $('map-status');
    const m = this.impMargin || 250;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let i = 0; i < this.T.N; i++) { a = Math.min(a, this.T.X[i]); b = Math.max(b, this.T.X[i]); c = Math.min(c, this.T.Z[i]); d = Math.max(d, this.T.Z[i]); }
    const box = [a - m, c - m, b + m, d + m];
    const km2 = (box[2] - box[0]) * (box[3] - box[1]) / 1e6;
    if (km2 > 30) { st.className = 'map-status err'; st.textContent = `That area is ${km2.toFixed(0)} km² — too big. Reduce the area or make the circuit smaller.`; return; }
    if (this.impB === false && this.impT === false) { st.className = 'map-status err'; st.textContent = 'Pick buildings and/or trees first.'; return; }
    const btn = $('map-import'); btn.disabled = true;
    st.className = 'map-status';
    try {
      const res = await importOSM(t.geo, box, { buildings: this.impB !== false, trees: this.impT !== false }, (msg) => { st.textContent = msg; });
      this.push();
      t.osm = res;
      this.changed(true);
      this.scheduleScenery(0);
      sfx.select();
      this.toast(`IMPORTED ${res.buildings.length} BUILDINGS · ${res.trees.length} TREES`);
      if (!res.buildings.length && !res.trees.length) { $('map-status').textContent = 'No mapped buildings or trees here — try the ZONES tool to add your own.'; }
    } catch (e) {
      sfx.error();
      st.className = 'map-status err'; st.textContent = e.message;
      btn.disabled = false;
    }
  }

  // ---------------- profile ----------------
  profLen() { return this.T.open ? this.T.raceL : this.T.L; }
  profileX(d) { return 40 + (d / this.profLen()) * (this.PW - 60); }
  profileY(e) { const top = 28, bot = this.PH - 18; return bot - (e / this.profileMax) * (bot - top); }
  profileE(y) { const top = 28, bot = this.PH - 18; return ((bot - y) / (bot - top)) * this.profileMax; }
  onProfileDown(e) {
    if (!this.T) return;
    const x = e.offsetX, y = e.offsetY;
    const P = this.track.points;
    let best = -1, bd = 14;
    P.forEach((p, i) => { if (this.nodeD[i] < 0) return; const d = Math.hypot(this.profileX(this.nodeD[i]) - x, this.profileY(p.e) - y); if (d < bd) { bd = d; best = i; } });
    if (best < 0) {
      // pick nearest node by x
      P.forEach((p, i) => { const d = Math.abs(this.profileX(this.nodeD[i]) - x); if (d < bd) { bd = d; best = i; } });
    }
    if (best < 0) return;
    this.push();
    if (!this.sel.has(best)) { this.sel.clear(); this.sel.add(best); }
    this.profileDrag = { i: best };
    this.renderPanels(); this.showTab('node');
    this.onProfileDrag(e);
  }
  onProfileDrag(e) {
    const r = this.pcan.getBoundingClientRect();
    const y = e.clientY - r.top;
    const v = Math.round(clamp(this.profileE(y), 0, 40) * 2) / 2;
    this.track.points[this.profileDrag.i].e = v;
    this.recompute();
    this.dirty = true;
    this.syncNodeFields();
  }
  onProfileHover(e) {
    if (!this.T) return;
    const d = ((e.offsetX - 40) / (this.PW - 60)) * this.profLen();
    this.hoverSample = d < 0 || d > this.profLen() ? -1 : Math.floor(d / this.T.ds) % this.T.N;
    this.dirty = true;
  }

  drawProfile() {
    const c = this.pctx, T = this.T;
    if (!this.PW) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#05070d'; c.fillRect(0, 0, this.PW, this.PH);
    if (!T) { c.font = '16px VT323'; c.fillStyle = '#56627e'; c.fillText('No track yet', 40, this.PH / 2 + 5); return; }
    const PL = this.profLen(), last = T.open ? T.finish : T.N; // (point-to-point: start to finish)
    this.profileMax = Math.max(20, Math.ceil((this.maxY + 5) / 5) * 5);
    c.font = '14px VT323'; c.fillStyle = '#56627e'; c.strokeStyle = '#141c30'; c.lineWidth = 1;
    for (let e = 0; e <= this.profileMax; e += 5) {
      const y = this.profileY(e);
      c.beginPath(); c.moveTo(40, y); c.lineTo(this.PW - 20, y); c.stroke();
      c.fillText(e + 'm', 8, y + 4);
    }
    for (let d = 0; d <= PL; d += 500) { const x = this.profileX(d); c.beginPath(); c.moveTo(x, 28); c.lineTo(x, this.PH - 18); c.stroke(); c.fillText((d / 1000).toFixed(1) + 'km', x - 10, this.PH - 4); }
    // fill
    const g = c.createLinearGradient(0, this.profileY(this.profileMax), 0, this.profileY(0));
    g.addColorStop(0, 'rgba(232,177,58,0.55)'); g.addColorStop(1, 'rgba(134,167,216,0.15)');
    c.beginPath(); c.moveTo(this.profileX(0), this.profileY(0));
    for (let i = 0; i <= last; i++) { const k = i % T.N; c.lineTo(this.profileX(i === T.N ? T.L : T.D[k]), this.profileY(T.Y[k])); }
    c.lineTo(this.profileX(PL), this.profileY(0)); c.closePath(); c.fillStyle = g; c.fill();
    c.beginPath();
    for (let i = 0; i <= last; i++) { const k = i % T.N; const x = this.profileX(i === T.N ? T.L : T.D[k]), y = this.profileY(T.Y[k]); i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.strokeStyle = '#e8b13a'; c.lineWidth = 2; c.stroke();
    // bridges
    c.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < last; i++) if (this.A.BRIDGE[i]) c.fillRect(this.profileX(T.D[i]), 28, this.profileX(T.ds) - 40 + 1, this.PH - 46);
    // hover
    if (this.hoverSample >= 0 && this.hoverSample <= last) {
      const x = this.profileX(T.D[this.hoverSample]);
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.moveTo(x, 24); c.lineTo(x, this.PH - 18); c.stroke();
      c.fillStyle = '#fff'; c.fillText(T.Y[this.hoverSample].toFixed(1) + 'm', x + 4, 38);
    }
    // nodes
    this.track.points.forEach((p, i) => {
      if (this.nodeD[i] < 0) return;
      const x = this.profileX(this.nodeD[i]), y = this.profileY(p.e);
      const s = this.sel.has(i);
      c.fillStyle = s ? '#ffd66b' : '#d8e6ff'; c.strokeStyle = '#000'; c.lineWidth = 2;
      c.fillRect(x - (s ? 5 : 4), y - (s ? 5 : 4), s ? 10 : 8, s ? 10 : 8); c.strokeRect(x - (s ? 5 : 4), y - (s ? 5 : 4), s ? 10 : 8, s ? 10 : 8);
    });
  }

  // the runoff each side, out to the barrier, with its paved, gravel and painted grass (runoff.js), as quads from
  // sample to sample in world units (built once per layout, drawn under the view's transform)
  runoffPaths() {
    const T = this.T, A = this.A, L = A && A.run;
    if (!L) return null;
    if (this.runP && this.runP.L === L) return this.runP;
    const P = { L, ground: new Path2D(), kinds: [new Path2D(), new Path2D(), new Path2D()] }, N = T.N, C = L.C;
    const pt = (i, side, t) => { const s = side * (T.W[i] / 2 + t); return [T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s]; };
    const quad = (path, i, j, side, a0, a1, b0, b1) => {
      const p = [pt(i, side, a0), pt(i, side, a1), pt(j, side, b1), pt(j, side, b0)];
      path.moveTo(p[0][0], p[0][1]); for (let k = 1; k < 4; k++) path.lineTo(p[k][0], p[k][1]); path.closePath();
    };
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1, R = L.reach[s];
      for (let i = 0; i < N; i++) {
        if (i === T.cut || A.BRIDGE[i]) continue;
        const j = (i + 1) % N;
        quad(P.ground, i, j, side, 0, R[i], 0, R[j]);
        // (each run of cells where one surface covers most)
        let run = -1, c0 = 0;
        for (let c = 0; c <= C; c++) {
          let k = -1;
          if (c < C) k = runoffCell(L, i, s, c) - 1; // (paved 0, gravel 1, grass 2; the ground -1)
          if (k === run) continue;
          if (run >= 0) quad(P.kinds[run], i, j, side, c0 * RUN_RES, c * RUN_RES, c0 * RUN_RES, c * RUN_RES);
          run = k; c0 = c;
        }
      }
    }
    return (this.runP = P);
  }
  drawRunoff(c) {
    const P = this.runoffPaths(); if (!P) return;
    c.save();
    c.translate(this.W / 2, this.H / 2); c.scale(this.view.scale, this.view.scale); c.translate(-this.view.cx, -this.view.cz);
    c.fillStyle = THEME_RUN[this.track.env.theme]; c.fill(P.ground);
    ['rgba(128,130,138,0.95)', 'rgba(214,186,128,0.95)', 'rgba(96,150,70,0.8)'].forEach((col, k) => { c.fillStyle = col; c.fill(P.kinds[k]); });
    c.restore();
  }

  // ---------------- main draw ----------------
  draw() {
    let c = this.ctx;
    const T = this.T, A = this.A, t = this.track;
    if (!this.W) return;
    if (this.trackAlpha === undefined) { let a = 1; try { a = +localStorage.getItem('svgp.edTrackAlpha') || 1; } catch (e) {} this.trackAlpha = [1, 0.5, 0.25].includes(a) ? a : 1; const b = $('ed-seethru'); if (b) b.classList.toggle('on', this.trackAlpha < 1); }
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sc = this.view.scale;
    c.fillStyle = THEME_BG[t.env.theme] || '#101820';
    c.fillRect(0, 0, this.W, this.H);
    // real-world map underneath everything
    const mapOn = t.geo && t.map.style !== 'off';
    if (mapOn) {
      this.tiles.draw(c, t.geo, t.map.style, this.view, this.W, this.H, (x, z) => this.w2s(x, z), (x, y) => this.s2w(x, y), this.dpr, t.map.opacity);
      c.fillStyle = 'rgba(5,8,16,0.18)'; c.fillRect(0, 0, this.W, this.H);
    }
    // the ground map (MAP › Ground From Photo): how the land will look, over the map
    if (t.ground && this.showGround !== false) {
      const G = t.ground;
      if (!this._gImg || this._gImg.src !== G.img) { this._gImg = new Image(); this._gImg.onload = () => { this.dirty = true; }; this._gImg.src = G.img; }
      if (this._gImg.complete && this._gImg.naturalWidth) {
        const [sx, sy] = this.w2s(G.x0, G.z0), [ex, ey] = this.w2s(G.x0 + G.w * G.res, G.z0 + G.h * G.res);
        c.save(); c.globalAlpha = 0.85; c.imageSmoothingEnabled = false; c.drawImage(this._gImg, sx, sy, ex - sx, ey - sy); c.restore();
      }
    }
    // grid
    const [x0, z0] = this.s2w(0, 0), [x1, z1] = this.s2w(this.W, this.H);
    const drawGrid = (step, col) => {
      c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const [sx] = this.w2s(x, 0); c.moveTo(Math.round(sx) + .5, 0); c.lineTo(Math.round(sx) + .5, this.H); }
      for (let z = Math.floor(z0 / step) * step; z <= z1; z += step) { const [, sy] = this.w2s(0, z); c.moveTo(0, Math.round(sy) + .5); c.lineTo(this.W, Math.round(sy) + .5); }
      c.stroke();
    };
    if (sc > 0.3) drawGrid(10 * (sc > 2 ? 1 : 5), 'rgba(255,255,255,0.035)');
    drawGrid(100, 'rgba(255,255,255,0.06)');
    drawGrid(500, 'rgba(255,255,255,0.11)');
    // (SEE-THROUGH: the land, paint, scenery and track go on a layer of their own, put over the map faded; what you
    // edit with (nodes, handles) stays solid on top)
    const seeThru = this.trackAlpha < 1;
    if (seeThru) {
      const L = this.layer ||= document.createElement('canvas'), cv = this.ctx.canvas;
      if (L.width !== cv.width || L.height !== cv.height) { L.width = cv.width; L.height = cv.height; }
      c = L.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, L.width, L.height); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    const unLayer = () => {
      if (!seeThru || c === this.ctx) return;
      const L = c.canvas; c = this.ctx;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = this.trackAlpha; c.drawImage(L, 0, 0); c.restore();
    };
    this.drawSculpt(c);
    this.drawPaint(c);
    this.drawScenery(c);

    const runoff = t.env.runoff;
    if (T) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    const path = (idx, off = 0) => {
      c.beginPath();
      idx.forEach((i, k) => {
        const x = T.X[i] + T.RX[i] * off, z = T.Z[i] + T.RZ[i] * off;
        const [sx, sy] = this.w2s(x, z); k ? c.lineTo(sx, sy) : c.moveTo(sx, sy);
      });
    };
    const ground = this.chunks.filter(ch => !ch.bridge);
    const bridges = this.chunks.filter(ch => ch.bridge).sort((a, b) => a.y - b.y);
    this.drawRunoff(c);
    this.drawRoads(c); // (over the runoff: roads run up to the track edge)
    c.lineJoin = 'round'; c.lineCap = 'round';
    // barriers (each in its type's color: tire walls dark, concrete grey, armco steel, a fence yellow)
    const BAR_COL = { tires: '#1a1a1a', concrete: '#b8b4a8', armco: '#c8ccd4', fence: '#d8c25a' };
    const drawBarriers = (chs) => {
      c.lineWidth = Math.max(1.5, 1 * sc);
      for (const ch of chs) for (const side of [-1, 1]) {
        const has = side < 0 ? A.HAS_L : A.HAS_R, off = side < 0 ? A.BL : A.BR;
        let on = false, col = null;
        for (const i of ch.idx) {
          if (!has[i]) { if (on) c.stroke(); on = false; continue; }
          const k = BAR_COL[wallTypeAt(A, i, side, t.env)] || '#c8ccd4';
          const s = off[i] * side, [sx, sy] = this.w2s(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s);
          if (on && k !== col) { c.lineTo(sx, sy); c.stroke(); on = false; }
          if (!on) { c.strokeStyle = col = k; c.beginPath(); c.moveTo(sx, sy); on = true; } else c.lineTo(sx, sy);
        }
        if (on) c.stroke();
      }
    };
    drawBarriers(ground);
    this.drawPit(c);
    const drawRoad = (chs, deck) => {
      for (const ch of chs) {
        if (deck) { c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = (ch.w + 8) * sc; path(ch.idx); c.stroke(); }
        c.strokeStyle = '#000'; c.lineWidth = (ch.w + 1.6) * sc + 2; path(ch.idx); c.stroke();
      }
      const dirt = this.track.env.surface === 'dirt';
      for (const ch of chs) { c.strokeStyle = dirt ? (deck ? '#8a6a4a' : '#76583a') : deck ? '#565a64' : '#43464e'; c.lineWidth = ch.w * sc; path(ch.idx); c.stroke(); }
      // kerbs (each as it is: edkerbs.js)
      this.drawKerbs(c);
      // centre line coloured by elevation
      for (const ch of chs) {
        const y = ch.y / Math.max(1, this.maxY);
        c.strokeStyle = `hsl(${210 - y * 210}, 85%, ${y > 0.02 ? 58 : 40}%)`;
        c.lineWidth = Math.max(1.5, 0.8 * sc); c.setLineDash(sc > 0.5 ? [6, 6] : []); path(ch.idx); c.stroke(); c.setLineDash([]);
      }
      if (deck) drawBarriers(chs);
    };
    drawRoad(ground, false);
    if (bridges.length) drawRoad(bridges, true);
    unLayer();
    this.drawBarrierEdit(c); // (BARRIERS: the picked one's nodes: edbarriers.js)
    this.drawPitEdit(c); // (PIT LANE: its nodes and garages: edpit.js)
    this.drawShapeEdit(c); // (PAINT › Shape: the picked one, the one being drawn: edpaint.js)
    this.drawProblems(c); // (what's wrong, red where it is: edcheck.js)

    // direction arrows
    c.fillStyle = 'rgba(255,255,255,0.75)';
    const every = Math.max(8, Math.round((90 / sc < 60 ? 60 : 90 / sc) / T.ds));
    for (let i = Math.round(every / 2); i < (T.open ? T.finish : T.N); i += every) {
      const [sx, sy] = this.w2s(T.X[i], T.Z[i]);
      const a = Math.atan2(T.FZ[i], T.FX[i]);
      const s = clamp(T.W[i] * sc * 0.3, 4, 12);
      c.save(); c.translate(sx, sy); c.rotate(a);
      c.beginPath(); c.moveTo(s, 0); c.lineTo(-s * 0.6, s * 0.7); c.lineTo(-s * 0.2, 0); c.lineTo(-s * 0.6, -s * 0.7); c.closePath(); c.fill();
      c.restore();
    }
    // start line & grid (point-to-point: a finish line too)
    {
      const chequer = (i) => {
        const [sx, sy] = this.w2s(T.X[i], T.Z[i]);
        const a = Math.atan2(T.FZ[i], T.FX[i]);
        const w = T.W[i] * sc, h = Math.max(4, 2 * sc);
        c.save(); c.translate(sx, sy); c.rotate(a);
        const n = 8, cell = w / n;
        for (let k = 0; k < n; k++) for (let r = 0; r < 2; r++) { c.fillStyle = (k + r) % 2 ? '#111' : '#fff'; c.fillRect(-h + r * h, -w / 2 + k * cell, h, cell); }
        c.restore();
      };
      chequer(0);
      if (T.open) {
        chequer(T.finish);
        // end walls
        c.strokeStyle = '#e8e4d8'; c.lineWidth = Math.max(2, 1.2 * sc);
        for (const [i, dir] of [[T.cut, 1], [(T.cut + 1) % T.N, -1]]) {
          const ax = T.X[i] + T.FX[i] * dir * 4, az = T.Z[i] + T.FZ[i] * dir * 4;
          const [x0, y0] = this.w2s(ax - T.RX[i] * A.BL[i], az - T.RZ[i] * A.BL[i]), [x1, y1] = this.w2s(ax + T.RX[i] * A.BR[i], az + T.RZ[i] * A.BR[i]);
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
        }
      }
      c.fillStyle = 'rgba(255,255,255,.55)';
      for (let k = 0; k < Math.min(12, (t.env.opponents || 0) + 1); k++) {
        const back = 10 + k * 8; const ii = ((Math.round(-back / T.ds) % T.N) + T.N) % T.N;
        const s = (k % 2 ? 1 : -1) * T.W[ii] * 0.22;
        const [gx, gy] = this.w2s(T.X[ii] + T.RX[ii] * s, T.Z[ii] + T.RZ[ii] * s);
        const r = Math.max(1.5, 1 * sc);
        c.fillRect(gx - r, gy - r, r * 2, r * 2);
      }
      // label
      c.font = 'bold 11px Arimo'; c.fillStyle = '#fff';
      const label = (i, txt) => { const [lx, ly] = this.w2s(T.X[i] + T.RX[i] * (T.W[i] / 2 + runoff + 6), T.Z[i] + T.RZ[i] * (T.W[i] / 2 + runoff + 6)); c.fillText(txt, lx, ly); };
      if (T.open) {
        label(0, 'START'); label(T.finish, 'FINISH');
        c.font = '11px Arimo'; c.fillStyle = 'rgba(255,255,255,0.55)';
        label(Math.round(T.finish + (T.cut - T.finish) / 2), 'RUN-OFF'); label((T.cut + 1 + Math.round((T.N - T.cut - 1) / 2)) % T.N, 'GRID');
      } else label(0, 'START / FINISH');
    }
    }
    unLayer(); // (no track yet: the land and paint)

    this.drawZoneLines(c);
    // props
    this.drawRoadBridges(c);
    t.props.forEach((p, i) => this.drawProp(c, p, (i === this.selProp || (p.ln && p.ln === this.selLine)) && this.tool === 'props'));
    this.drawLines(c);
    if (this.tool === 'props' && this.mouse.inside && !this.drag && !this.hoverBld) {
      c.globalAlpha = 0.5;
      const [x, z] = this.snapPt(this.mouse.wx, this.mouse.wz);
      if (this.modelProp()) {
        const a = this.pendingModel();
        if (a) {
          const rot = this.faceRot(x, z), p = modelFootprint(a, x, z, rot);
          c.beginPath(); p.forEach((q, k) => { const [sx, sy] = this.w2s(q[0], q[1]); k ? c.lineTo(sx, sy) : c.moveTo(sx, sy); }); c.closePath();
          c.fillStyle = a.paint ? '#e0a060' : STYLE_COLORS[styleOf(a)] || '#999'; c.fill();
          c.globalAlpha = 0.9; c.strokeStyle = '#ffd66b'; c.lineWidth = 1.5; c.setLineDash([4, 3]); c.stroke(); c.setLineDash([]);
          // front door side
          const [fx, fy] = this.w2s((p[2][0] + p[3][0]) / 2, (p[2][1] + p[3][1]) / 2), [mx, my] = this.w2s(x, z);
          c.beginPath(); c.moveTo(mx, my); c.lineTo(fx, fy); c.stroke();
        }
      } else { const p = this.propAt(this.propType, x, z); if (p) this.drawProp(c, p, false); }
      c.globalAlpha = 1;
    }
    // a line of props being drawn: where each one will go, and how far apart
    if (this.drag && this.drag.type === 'pline') {
      const d = this.drag, L = Math.hypot(d.x1 - d.x0, d.z1 - d.z0);
      const list = L < 2.5 ? [this.propAt(this.propType, d.x0, d.z0)] : this.propLine(d.x0, d.z0, d.x1, d.z1);
      c.globalAlpha = 0.6; list.forEach(p => p && this.drawProp(c, p, false)); c.globalAlpha = 1;
      if (L >= 2.5) {
        const [ax, ay] = this.w2s(d.x0, d.z0), [bx, by] = this.w2s(d.x1, d.z1);
        c.strokeStyle = '#ffd66b'; c.lineWidth = 1.5; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.setLineDash([]);
        const txt = `${list.length} · ${+this.lineGapFor(this.propType).toFixed(1)} m apart`;
        c.font = '600 12px ' + getComputedStyle(document.body).getPropertyValue('--f-body'); c.textAlign = 'left'; c.textBaseline = 'middle';
        c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(txt, bx + 12, by); c.fillStyle = '#ffd66b'; c.fillText(txt, bx + 12, by);
      }
    }

    // nodes
    if (this.tool !== 'props') {
      const P = t.points;
      // control polygon
      const bare = !T; // no road yet: make the node chain easy to see
      c.strokeStyle = bare ? 'rgba(255,214,107,0.6)' : 'rgba(216,230,255,0.18)'; c.lineWidth = bare ? 2 : 1; c.beginPath();
      P.forEach((p, i) => { const [x, y] = this.w2s(p.x, p.z); i ? c.lineTo(x, y) : c.moveTo(x, y); }); if (!t.open) c.closePath(); c.stroke();
      P.forEach((p, i) => {
        const [x, y] = this.w2s(p.x, p.z);
        const s = this.sel.has(i), h = i === this.hoverNode;
        const r = s ? 6 : h ? 6 : 4.5;
        c.fillStyle = s ? '#ffd66b' : h ? '#ffffff' : (t.open ? i === 0 : i === t.start) ? '#6ae04a' : t.open && i === P.length - 1 && P.length > 1 ? '#ff6a5a' : '#d8e6ff';
        c.strokeStyle = '#000'; c.lineWidth = 2;
        c.fillRect(x - r, y - r, r * 2, r * 2); c.strokeRect(x - r, y - r, r * 2, r * 2);
        if (s || (DEV && sc > 1.1)) { c.font = '14px VT323'; c.fillStyle = '#fff'; c.fillText(String(i), x + 8, y - 6); } // (every point's number: a development aid)
        if ((s || h) && (p.e || p.b)) { c.font = '14px VT323'; c.fillStyle = '#ffd66b'; c.fillText(`${p.e.toFixed(1)}m ${p.b ? p.b.toFixed(0) + '°' : ''}`, x + 8, y + 12); }
      });
      // the picked node's curve handles (round: filled once they're its own)
      for (const hd of this.trackHandles()) {
        const p = P[hd.k], [nx, ny] = this.w2s(p.x, p.z), [hx, hy] = this.w2s(hd.x, hd.z);
        c.strokeStyle = '#ffd66b'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(nx, ny); c.lineTo(hx, hy); c.stroke();
        c.beginPath(); c.arc(hx, hy, 5, 0, Math.PI * 2); c.fillStyle = hd.own ? '#ffd66b' : '#1a1a1a'; c.fill(); c.strokeStyle = hd.own ? '#000' : '#ffd66b'; c.stroke();
      }
    }
    // profile hover marker
    if (T && this.hoverSample >= 0 && this.hoverSample < T.N) {
      const [x, y] = this.w2s(T.X[this.hoverSample], T.Z[this.hoverSample]);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.stroke();
    }
    // drawing stroke
    const d = this.drag;
    if (d && d.type === 'draw') {
      c.strokeStyle = '#ffd66b'; c.lineWidth = Math.max(3, this.defaultWidth * sc); c.globalAlpha = 0.7;
      c.beginPath(); d.pts.forEach((p, i) => { const [x, y] = this.w2s(p[0], p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
      c.globalAlpha = 1;
      const [fx, fy] = this.w2s(d.pts[0][0], d.pts[0][1]);
      c.fillStyle = '#6ae04a'; c.beginPath(); c.arc(fx, fy, 7, 0, Math.PI * 2); c.fill();
    }
    if (d && d.type === 'box') {
      c.strokeStyle = '#ffd66b'; c.lineWidth = 1; c.setLineDash([4, 4]);
      c.strokeRect(d.sx, d.sy, d.ex - d.sx, d.ey - d.sy); c.setLineDash([]);
      c.fillStyle = 'rgba(255,214,107,0.08)'; c.fillRect(d.sx, d.sy, d.ex - d.sx, d.ey - d.sy);
    }
    // scale label
    const m = 100 * sc;
    $('ed-scale').textContent = `${Math.round(this.mouse.wx)}, ${Math.round(this.mouse.wz)}  ·  100m = ${Math.round(m)}px`;
  }

  drawScenery(c) {
    const S = this.scen; if (!S) return;
    const sc = this.view.scale;
    const [vx0, vz0] = this.s2w(-40, -40), [vx1, vz1] = this.s2w(this.W + 40, this.H + 40);
    const vis = (q) => q[0] > vx0 && q[0] < vx1 && q[1] > vz0 && q[1] < vz1;
    const poly = (p) => { c.beginPath(); p.forEach((q, k) => { const [x, y] = this.w2s(q[0], q[1]); k ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
    // a setting's street props / bushes (zoomed in)
    if (S.props && sc > 1.2) {
      c.fillStyle = 'rgba(200,196,180,0.8)';
      const pr = Math.max(1, 0.8 * sc);
      for (const q of S.props) { if (!vis([q.x, q.z])) continue; const [x, y] = this.w2s(q.x, q.z); c.fillRect(x - pr / 2, y - pr / 2, pr, pr); }
    }
    // trees
    c.fillStyle = 'rgba(70,140,55,0.9)';
    const tr = Math.max(1.2, 2.6 * sc);
    for (const q of S.trees) { if (!vis(q)) continue; const [x, y] = this.w2s(q[0], q[1]); c.beginPath(); c.arc(x, y, tr, 0, Math.PI * 2); c.fill(); }
    // buildings
    c.lineWidth = 1;
    const selZ = this.tool === 'zones' ? this.selZone : -1;
    for (const b of S.buildings) {
      if (!vis(b.p[0])) continue;
      poly(b.p);
      const house = this.isHouse(b), look = house && houseLook(b.hv, ...centroid(b.p));
      // (a PSX house from above: its roof, with its walls round the edge)
      c.fillStyle = house ? ROOF_COL[look.r - 1] : b.hv && b.hv.c ? b.hv.c : b.biz ? BUSINESSES[b.biz].color : b.lm ? '#b89ad8' : STYLE_COLORS[b.s] || '#999';
      c.globalAlpha = b.from === 'zone' && b.zi === selZ ? 1 : 0.85;
      c.fill();
      c.globalAlpha = 1;
      if (house && sc > 0.5) { c.strokeStyle = look.c || WALL_COL[look.w - 1]; c.lineWidth = Math.max(1.5, 1.6 * sc); c.stroke(); }
      const picked = this.selBld && this.tool === 'props' && (this.selBld.from === 'custom' ? b.from === 'custom' && b.ci === this.selBld.ci : b.key === this.selBld.key);
      c.strokeStyle = picked ? '#ffd66b' : b.from === 'zone' && b.zi === selZ ? '#ffd66b' : 'rgba(0,0,0,0.7)';
      c.lineWidth = picked ? 3 : 1;
      c.stroke();
      if (b.r === 'gable' && sc > 1.2) { // ridge line
        const q = b.p, e01 = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), e12 = Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]);
        const [a0, a1, a2, a3] = e12 > e01 ? [q[1], q[2], q[3], q[0]] : q;
        const m1 = this.w2s((a1[0] + a2[0]) / 2, (a1[1] + a2[1]) / 2), m2 = this.w2s((a3[0] + a0[0]) / 2, (a3[1] + a0[1]) / 2);
        c.beginPath(); c.moveTo(m1[0], m1[1]); c.lineTo(m2[0], m2[1]); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.stroke();
      }
    }
    // things that will be removed because they sit on the circuit
    c.strokeStyle = 'rgba(255,90,70,0.55)'; c.setLineDash([3, 3]);
    for (const b of S.rejected) { if (!vis(b.p[0])) continue; poly(b.p); c.stroke(); }
    c.setLineDash([]);
  }
  drawPit(c) {
    const p = this.pit, T = this.T; if (!p) return;
    const sc = this.view.scale;
    const idx = []; for (let i = 0; i < T.N; i++) if (p.REG[i] >= 0) idx.push(i);
    idx.sort((a, b) => p.REG[a] - p.REG[b]);
    const pt = (i, s) => this.w2s(T.X[i] + T.RX[i] * s * p.side, T.Z[i] + T.RZ[i] * s * p.side);
    // lane
    c.beginPath();
    idx.forEach((i, k) => { const [x, y] = pt(i, T.W[i] / 2); k ? c.lineTo(x, y) : c.moveTo(x, y); });
    for (let k = idx.length - 1; k >= 0; k--) { const i = idx[k]; const [x, y] = pt(i, p.OUT ? p.OUT[i] : p.CEN[i] + p.width / 2); c.lineTo(x, y); }
    c.closePath(); c.fillStyle = '#50535c'; c.fill();
    // garages
    const main = idx.filter(i => p.MAIN ? p.MAIN[i] : !isNaN(p.WALL[i])), walls = idx.filter(i => !isNaN(p.WALL[i]));
    c.beginPath();
    main.forEach((i, k) => { const [x, y] = pt(i, p.CEN[i] + p.width / 2 + 0.6); k ? c.lineTo(x, y) : c.moveTo(x, y); });
    for (let k = main.length - 1; k >= 0; k--) { const i = main[k]; const [x, y] = pt(i, p.CEN[i] + p.width / 2 + 16.6); c.lineTo(x, y); }
    c.closePath(); c.fillStyle = '#2a2f3a'; c.fill(); c.strokeStyle = '#e8b13a'; c.lineWidth = 1; c.stroke();
    // pit wall
    c.beginPath();
    walls.forEach((i, k) => { const [x, y] = pt(i, p.WALL[i]); k ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.strokeStyle = '#e8e8e0'; c.lineWidth = Math.max(1.5, 0.5 * sc); c.stroke();
    if (sc > 0.35 && main.length) {
      const i = main[Math.floor(main.length / 2)], [x, y] = pt(i, p.CEN[i] + p.width / 2 + 8.6);
      c.font = 'bold 11px Arimo'; c.fillStyle = '#ffd66b'; c.textAlign = 'center'; c.fillText('PIT LANE', x, y + 4); c.textAlign = 'left';
    }
  }

  drawZoneLines(c) {
    const zs = this.track.zones; if (!zs.length && !(this.drag && this.drag.type === 'zdraw')) return;
    const on = this.tool === 'zones';
    zs.forEach((z, i) => {
      const col = ZONE_TYPES[z.kind]?.color || '#fff';
      c.beginPath(); z.pts.forEach((q, k) => { const [x, y] = this.w2s(q[0], q[1]); k ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.lineWidth = i === this.selZone && on ? 4 : 2.5;
      c.strokeStyle = i === this.selZone && on ? '#ffd66b' : col;
      c.globalAlpha = on ? 1 : 0.5;
      c.setLineDash(on ? [] : [6, 5]); c.stroke(); c.setLineDash([]);
      if (on) { // direction arrow at the end
        const a = z.pts[z.pts.length - 2], b = z.pts[z.pts.length - 1];
        const [bx, by] = this.w2s(b[0], b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        c.save(); c.translate(bx, by); c.rotate(ang); c.fillStyle = c.strokeStyle;
        c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, 5); c.lineTo(-5, -5); c.closePath(); c.fill(); c.restore();
      }
      c.globalAlpha = 1;
    });
    const d = this.drag;
    if (d && d.type === 'zdraw') {
      c.beginPath(); d.pts.forEach((q, k) => { const [x, y] = this.w2s(q[0], q[1]); k ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.lineWidth = 3; c.strokeStyle = ZONE_TYPES[this.zoneDef.kind].color; c.stroke();
    }
  }

  // ---------------- placing props: a click, or a line of them (drag) ----------------
  tpFam(type) { const cls = type.slice(3); return trackPropFamilies().find(f => f.cls === cls) || null; }
  // a prop of this type at (x, z): turned to face the track (stands, boards, the race-track pack's pieces) or, for the
  // pieces that go over the track (gantries, arches) dropped on or near it, centred across it and stretched to its
  // width (marked over: true, dropped before it's kept). k: its place in a line (a family with several looks takes
  // them in turn, unless one's picked)
  propAt(type, x, z, k = 0, look, seed = this.tpSeed) {
    let id = type;
    if (type.startsWith('tp:')) {
      const f = this.tpFam(type); if (!f) return null;
      const pick = look === undefined ? this.tpPick[f.cls] : look;
      id = pick && f.ids.includes(pick) ? pick : f.ids[(seed + k) % f.ids.length];
    }
    const p = { type: id, x: +x.toFixed(1), z: +z.toFixed(1), rot: this.propRot };
    if (!this.T) return p;
    const T = this.T, ns = this.nearestSample(x, z), i = ns.i, fam = isTrackProp(id) ? trackPropFamily(id) : null;
    if (fam && fam.span && ns.d < T.W[i] / 2 + 4) {
      p.x = +T.X[i].toFixed(1); p.z = +T.Z[i].toFixed(1); p.rot = +Math.atan2(T.FX[i], T.FZ[i]).toFixed(3);
      const sx = (T.W[i] + 3) / fam.w; if (sx > 1.02) p.sx = +sx.toFixed(3);
      p.over = true;
    } else if (fam || ['grandstand', 'billboard', 'bleachers'].includes(type)) p.rot = +Math.atan2(T.X[i] - x, T.Z[i] - z).toFixed(3);
    return p;
  }
  // how far apart a line of them goes: the slider, or by default the prop's width and a little room
  lineGapFor(type) {
    if (this.lineGap != null) return this.lineGap;
    if (type.startsWith('tp:')) { const f = this.tpFam(type); return f ? +(f.w + f.gap).toFixed(1) : 8; }
    const def = PROP_TYPES[type]; if (!def) return 8;
    return def.w ? def.w + (def.back ? 0.2 : 1) : Math.max(2, (def.r || 2) * 2.2); // (bleachers: side by side)
  }
  // the props a line from (x0, z0) to (x1, z1) would get (drawing one: the preview), as lineProps lays them out
  propLine(x0, z0, x1, z1) {
    const f = this.propType.startsWith('tp:') && this.tpFam(this.propType);
    return this.lineProps({ id: 0, type: this.propType, pts: [[x0, z0], [x1, z1]], gap: this.lineGapFor(this.propType), look: f ? this.tpPick[f.cls] || '' : '', seed: this.tpSeed });
  }
  // a click: one prop; a drag: a line of them, kept as a line (it can be moved, reshaped and re-spaced after)
  finishPropLine(d) {
    const len = Math.hypot(d.x1 - d.x0, d.z1 - d.z0), t = this.track;
    if (len < 2.5) {
      const p = this.propAt(this.propType, d.x0, d.z0); if (!p) return;
      const { over, ...q } = p;
      this.push(); t.props.push(q); this.selProp = t.props.length - 1;
    } else {
      const f = this.propType.startsWith('tp:') && this.tpFam(this.propType);
      const L = { id: 1 + Math.max(0, ...t.propLines.map(q => q.id)), type: this.propType, pts: [[+d.x0.toFixed(1), +d.z0.toFixed(1)], [+d.x1.toFixed(1), +d.z1.toFixed(1)]],
        gap: +this.lineGapFor(this.propType).toFixed(1), look: f ? this.tpPick[f.cls] || '' : '', seed: this.tpSeed };
      this.push(); t.propLines.push(L); this.regenLine(L);
      this.selLine = L.id; this.selProp = -1;
      this.toast(`${t.props.filter(p => p.ln === L.id).length} PLACED · ${L.gap} M APART · CLICK THE LINE TO EDIT IT`);
    }
    this.tpSeed = Math.floor(Math.random() * 1e6); // (the next one: another look)
    sfx.place(); this.changed(); this.renderItemTab();
  }

  // ---------------- lines of props ----------------
  // A line drawn with PROPS stays a line (track.propLines): { id, type (what the PROPS tool placed: a PROP_TYPES key
  // or 'tp:<family>'), pts [[x, z], ...] (two or more nodes), gap (m), look ('' mixed, or one asset id), seed, flip
  // (face away from the track), turn, crowd / fill (stands), light (floodlights) }. Its props are ordinary props, each
  // marked ln: the line's id (so everything that reads track.props, the world, the crowd, sees them), made again from
  // the line whenever it changes.
  lineById(id) { return (this.track.propLines || []).find(L => L.id === id) || null; }
  lineProps(L) {
    const P = L.pts, gap = Math.max(0.5, L.gap), segs = [];
    let tot = 0;
    for (let i = 0; i + 1 < P.length; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); segs.push({ i, s0: tot, l }); tot += l; }
    if (!segs.length) return [];
    // each stretch faces the track from its side of it (or the other way, flipped)
    const side = segs.map(sg => {
      const a = P[sg.i], b = P[sg.i + 1], ux = (b[0] - a[0]) / (sg.l || 1), uz = (b[1] - a[1]) / (sg.l || 1);
      let nx = -uz, nz = ux;
      if (this.T) { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, ns = this.nearestSample(mx, mz); if ((this.T.X[ns.i] - mx) * nx + (this.T.Z[ns.i] - mz) * nz < 0) { nx = -nx; nz = -nz; } }
      return L.flip ? [-nx, -nz] : [nx, nz];
    });
    const out = [];
    for (let k = 0; k < 300; k++) {
      const s = k * gap; if (s > tot + 1e-6) break;
      let j = segs.findIndex(sg => s <= sg.s0 + sg.l + 1e-6); if (j < 0) j = segs.length - 1;
      const sg = segs[j], a = P[sg.i], b = P[sg.i + 1], f = sg.l ? (s - sg.s0) / sg.l : 0;
      const p = this.propAt(L.type, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, k, L.look, L.seed); if (!p) continue;
      const faces = isTrackProp(p.type) || ['grandstand', 'billboard', 'bleachers'].includes(p.type);
      if (!p.over) p.rot = +((faces ? Math.atan2(side[j][0], side[j][1]) : p.rot) + (L.turn || 0)).toFixed(3);
      delete p.over; p.ln = L.id;
      if (L.crowd === false) p.crowd = false;
      if (L.fill !== undefined) p.fill = L.fill;
      if (L.light !== undefined) p.light = L.light;
      out.push(p);
    }
    return out;
  }
  regenLine(L) { const t = this.track; t.props = t.props.filter(p => p.ln !== L.id).concat(this.lineProps(L)); this.dirty = true; }
  removeLine(L) { const t = this.track; t.props = t.props.filter(p => p.ln !== L.id); t.propLines = t.propLines.filter(q => q !== L); if (this.selLine === L.id) this.selLine = null; this.selProp = -1; }
  // what's under the pointer: a node of the picked line, else a line (on it, or one of its props). { L, node } or null
  hitLine(wx, wz, sx, sy) {
    const t = this.track, L0 = this.selLine && this.lineById(this.selLine);
    if (L0) for (let k = 0; k < L0.pts.length; k++) { const [x, y] = this.w2s(L0.pts[k][0], L0.pts[k][1]); if ((x - sx) ** 2 + (y - sy) ** 2 < 100) return { L: L0, node: k }; }
    const h = this.hitProp(wx, wz);
    if (h >= 0 && t.props[h].ln) { const L = this.lineById(t.props[h].ln); if (L) return { L, node: -1 }; }
    const tol = Math.max(2, 7 / this.view.scale);
    for (const L of t.propLines) for (let i = 0; i + 1 < L.pts.length; i++) if (segDist(wx, wz, L.pts[i], L.pts[i + 1]) < tol) return { L, node: -1 };
    return null;
  }
  // double-click on the picked line: a node there
  insertLineNode(wx, wz) {
    const L = this.selLine && this.lineById(this.selLine); if (!L) return;
    let best = -1, bd = Math.max(2, 9 / this.view.scale);
    for (let i = 0; i + 1 < L.pts.length; i++) { const d = segDist(wx, wz, L.pts[i], L.pts[i + 1]); if (d < bd) { bd = d; best = i; } }
    if (best < 0) return;
    this.push(); L.pts.splice(best + 1, 0, [+wx.toFixed(1), +wz.toFixed(1)]); this.regenLine(L); sfx.place(); this.changed(); this.renderItemTab();
  }
  drawLines(c) {
    const on = this.tool === 'props';
    for (const L of this.track.propLines || []) {
      const sel = on && L.id === this.selLine;
      c.beginPath(); L.pts.forEach((q, k) => { const [x, y] = this.w2s(q[0], q[1]); k ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.lineWidth = sel ? 2 : 1; c.strokeStyle = sel ? '#ffd66b' : 'rgba(255,214,107,.35)'; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]);
      if (sel) L.pts.forEach(q => { const [x, y] = this.w2s(q[0], q[1]); c.fillStyle = '#ffd66b'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.fillRect(x - 5, y - 5, 10, 10); c.strokeRect(x - 5, y - 5, 10, 10); });
    }
  }
  // the picked line's panel: spacing, look, facing, the stands' crowd, the floodlights' strength
  renderLinePanel() {
    const el = $('tab-node'), t = this.track, L = this.lineById(this.selLine);
    const fam = L.type.startsWith('tp:') ? this.tpFam(L.type) : null, def = PROP_TYPES[L.type];
    const label = fam ? fam.label : def ? def.label : L.type, n = t.props.filter(p => p.ln === L.id).length;
    let len = 0; for (let i = 0; i + 1 < L.pts.length; i++) len += Math.hypot(L.pts[i + 1][0] - L.pts[i][0], L.pts[i + 1][1] - L.pts[i][1]);
    const stand = fam ? fam.cls.startsWith('stand') : L.type === 'bleachers', light = fam && LIGHT_FAMILIES.includes(fam.cls);
    const faces = !!fam || ['grandstand', 'billboard', 'bleachers'].includes(L.type);
    el.innerHTML = `<h4>LINE OF ${esc(label).toUpperCase()}</h4>
      ${this.cardHtml(L.type, label, `${n} along ${Math.round(len)} m`)}
      <p class="muted">Drag the line (or any of them) to move it all, a square to reshape it. Double-click the line to add a corner; right-click a corner to take it out.</p>
      ${fld('Spacing', 'ln-gap', 0.5, 60, 0.5, L.gap, 'm')}
      ${fam && fam.ids.length > 1 ? `<div class="fld"><label>Look</label><div class="seg" id="ln-look"><button data-v="" class="${!L.look ? 'on' : ''}">Mixed</button>${fam.ids.map((id, k) => `<button data-v="${id}" class="${L.look === id ? 'on' : ''}">${k + 1}</button>`).join('')}</div></div>` : ''}
      ${faces ? `<div class="fld"><label>Facing</label><div class="seg" id="ln-flip"><button data-v="0" class="${!L.flip ? 'on' : ''}">The track</button><button data-v="1" class="${L.flip ? 'on' : ''}">Away</button></div></div>` : ''}
      ${stand ? `<div class="fld"><label>Crowd</label><div class="seg" id="ln-crowd"><button data-v="1" class="${L.crowd !== false ? 'on' : ''}">People</button><button data-v="0" class="${L.crowd === false ? 'on' : ''}">Empty</button></div></div>
      ${L.crowd !== false ? fld('How full', 'ln-fill', 0.1, 1, 0.05, L.fill ?? 0.8, '') : ''}` : ''}
      ${light ? fld('Light strength', 'ln-light', 0.2, 2, 0.05, L.light ?? 1, '×') : ''}
      <div class="seg" style="margin-top:4px"><button id="ln-break">Break into single props</button></div>
      <div class="seg" style="margin-top:8px"><button id="ln-del">Delete line</button><button id="ln-back">Done</button></div>`;
    this.fillCards();
    const live = (id, fn, fmt) => { const i = $(id); if (!i) return; i.addEventListener('pointerdown', () => this.push()); i.addEventListener('input', () => { fn(+i.value); $(id + '-v').textContent = fmt(+i.value); this.regenLine(L); }); i.addEventListener('change', () => { this.changed(); this.renderLinePanel(); }); };
    live('ln-gap', v => L.gap = v, v => v + 'm');
    live('ln-fill', v => L.fill = v, v => v.toFixed(2));
    live('ln-light', v => L.light = v, v => v.toFixed(2) + '×');
    const set = (fn) => { this.push(); fn(); this.regenLine(L); this.changed(); this.renderLinePanel(); };
    segBind('ln-look', v => set(() => { L.look = v; }));
    segBind('ln-flip', v => set(() => { L.flip = v === '1'; }));
    segBind('ln-crowd', v => set(() => { if (v === '1') delete L.crowd; else L.crowd = false; }));
    $('ln-break').addEventListener('click', () => { this.push(); for (const p of t.props) if (p.ln === L.id) delete p.ln; t.propLines = t.propLines.filter(q => q !== L); this.selLine = null; sfx.move(); this.changed(); this.renderItemTab(); this.toast(`${n} SINGLE PROPS NOW`); });
    $('ln-del').addEventListener('click', () => { this.push(); this.removeLine(L); sfx.del(); this.changed(); this.renderItemTab(); });
    $('ln-back').addEventListener('click', () => { this.selLine = null; this.renderItemTab(); this.dirty = true; });
  }
  // the race-track pack's pieces on the map: their footprint (stretched over the track if they span it), the front
  // (the track side) in white, fans in a stand, a lamp's glow
  drawTrackProp(c, p, sel) {
    const f = trackPropFamily(p.type); if (!f) return;
    const sc = this.view.scale, [x, y] = this.w2s(p.x, p.z);
    const w = Math.max(4, f.w * (p.sx || 1) * sc), d = Math.max(3, f.d * sc);
    c.save(); c.translate(x, y); c.rotate(-(p.rot || 0));
    c.fillStyle = f.color; c.fillRect(-w / 2, -d / 2, w, d);
    c.lineWidth = 2; c.strokeStyle = sel ? '#ffd66b' : '#000'; c.strokeRect(-w / 2, -d / 2, w, d);
    if (f.cls.startsWith('stand') && p.crowd !== false) { c.fillStyle = 'rgba(232,120,150,.85)'; for (let k = 0; k < 18; k++) c.fillRect(-w / 2 + ((k * 37) % 17 + 0.5) / 17 * w - 1, -d / 2 + ((k * 23) % 11 + 0.5) / 11 * d - 1, 2, 2); }
    if (f.span) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(w / 2, 0); c.stroke(); c.setLineDash([]); }
    else { c.fillStyle = '#fff'; c.fillRect(-w / 2, d / 2 - Math.max(1.2, d * 0.12), w, Math.max(1.2, d * 0.12)); }
    if (LIGHT_FAMILIES.includes(f.cls)) { c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(0, d / 2, Math.max(2.5, 2 * sc), 0, 7); c.fill(); }
    c.restore();
  }

  drawProp(c, p, sel) {
    if (isTrackProp(p.type)) return this.drawTrackProp(c, p, sel);
    const def = PROP_TYPES[p.type]; if (!def) return;
    const sc = this.view.scale;
    const [x, y] = this.w2s(p.x, p.z);
    c.save(); c.translate(x, y); c.rotate(-(p.rot || 0));
    c.lineWidth = 2; c.strokeStyle = sel ? '#ffd66b' : '#000';
    c.fillStyle = def.color;
    if (def.w) {
      const w = Math.max(6, def.w * sc), d = Math.max(4, def.d * sc);
      if (def.back) c.translate(0, -d / 2); // (bleachers: the click is the front edge, the stand goes back from it)
      c.fillRect(-w / 2, -d / 2, w, d); c.strokeRect(-w / 2, -d / 2, w, d);
      if (def.back) { c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; for (let k = 1; k < 6; k++) { const yy = -d / 2 + (d * k) / 6; c.beginPath(); c.moveTo(-w / 2, yy); c.lineTo(w / 2, yy); c.stroke(); } if (p.crowd !== false) { c.fillStyle = 'rgba(232,120,150,.85)'; for (let k = 0; k < 18; k++) c.fillRect(-w / 2 + ((k * 37) % 17 + 0.5) / 17 * w - 1, -d / 2 + ((k * 23) % 11 + 0.5) / 11 * d - 1, 2, 2); } c.fillStyle = '#fff'; c.fillRect(-w / 2, d / 2 - Math.max(1.5, d * 0.1), w, Math.max(1.5, d * 0.1)); }
      if (p.type === 'grandstand' || p.type === 'billboard') { c.fillStyle = '#fff'; c.fillRect(-w / 2, d / 2 - Math.max(1.5, d * 0.15), w, Math.max(1.5, d * 0.15)); }
      if (p.type === 'tower') { c.strokeStyle = 'rgba(0,0,0,.5)'; c.strokeRect(-w / 4, -d / 4, w / 2, d / 2); }
    } else {
      const r = Math.max(3.5, def.r * sc);
      c.beginPath();
      if (p.type === 'cones') { c.moveTo(0, -r); c.lineTo(r, r); c.lineTo(-r, r); c.closePath(); }
      else if (p.type === 'rock') { for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const rr = r * (k % 2 ? 0.8 : 1); k ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); }
      else c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill(); c.stroke();
      if (p.type === 'lamp') { c.fillStyle = 'rgba(255,230,150,0.2)'; c.beginPath(); c.arc(0, 0, Math.max(8, 16 * sc), 0, Math.PI * 2); c.fill(); }
    }
    c.restore();
  }

  // ---------------- side panels ----------------
  renderPanels() {
    this.renderNodeTab();
    this.renderTrackTab();
    this.renderWorldTab();
    this.renderMapTab();
    this.refreshStats();
  }

  renderPaintTab() {
    const el = $('tab-node'), t = this.track, kind = this.paintKind || 'grass', r = this.brush || 12;
    const area = t.paint.filter(s => PAINTS[s.kind]).length, nat = t.paint.filter(s => s.kind === 'flora').length, er = t.paint.filter(s => s.kind === 'erase').length, cr = t.paint.filter(s => s.kind === 'crowd').length;
    const mix = this.floraMix || 'blossom', dens = this.floraDens ?? 0.6, what = this.eraseWhat || 'gnb';
    // (Brush: strokes as before; Shape: runoff drawn point by point and picked to change later: edpaint.js)
    const modeHtml = `<div class="fld"><label>Paint With</label><div class="seg" id="p-mode"><button data-v="brush" class="${this.paintMode !== 'shape' ? 'on' : ''}">Brush</button><button data-v="shape" class="${this.paintMode === 'shape' ? 'on' : ''}">Shape</button></div></div>`;
    if (this.paintMode === 'shape') return this.renderShapePanel(modeHtml);
    el.innerHTML = `
      <h4>PAINT</h4>
      ${modeHtml}
      <div class="fld"><label>Brush</label><div class="seg" id="p-kind">${[...Object.entries(PAINTS).map(([k, v]) => [k, v.label]), ['flora', 'Nature'], ['houses', 'Houses'], ['crowd', 'Crowd'], ['erase', 'Erase']].map(([k, l]) => `<button data-v="${k}" class="${kind === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${kind === 'flora' ? `
      <div class="fld"><label>Mix</label><div class="seg" id="p-mix">${FLORA_KEYS.filter(k => k !== 'auto').map(k => `<button data-v="${k}" class="${mix === k ? 'on' : ''}"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;background:${FLORA[k].color}"></i>${FLORA[k].label}</button>`).join('')}</div></div>
      ${fld('Density', 'p-d', 0.05, 1, 0.05, dens, '')}` : ''}
      ${kind === 'crowd' ? `${fld('Density', 'p-cd', 0.05, 1, 0.05, this.crowdDens ?? 0.5, '')}
      <p class="muted">Spectators on their feet, cheering and waving at the cars, turned toward the track. They keep off the track, its runoff, the roads and the pit lane. An eraser stroke clears them.</p>` : ''}
      ${kind === 'houses' ? `${fld('Gap between houses', 'p-gap', 0, 20, 0.5, this.houseGap ?? 4, 'm')}
      <p class="muted">A wide brush (16 m or more) lays a row each side of your stroke, facing each other across it like a street. A narrow one lays a single row facing the nearest road or the track. Houses never land on the track or roads, and use the look set in PROPS &rsaquo; Houses (${this.housePaint.random ? 'random' : 'your chosen paint'}).</p>` : ''}
      ${PAINTS[kind] && PAINTS[kind].runoff ? `<p class="muted">Lays ${kind === 'paved' ? 'paved runoff' : 'a gravel trap'} beside the track. Paint out past the barrier and the barrier moves back to take it in, up to 80 m from the track. Grass paints over it; Erase &rsaquo; Ground puts the circuit's own runoff back.</p>` : ''}
      ${kind === 'erase' ? `<div class="fld"><label>Erase</label><div class="seg" id="p-what">${[['g', 'Ground'], ['n', 'Trees &amp; plants'], ['b', 'Buildings']].map(([k, l]) => `<button data-v="${k}" class="${what.includes(k) ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="muted">Removes everything you pick under the brush: painted grass, paved and gravel, every tree and plant (painted, from the World tab setting, zone tree lines, the map or placed with PROPS) and buildings of any kind.</p>` : ''}
      ${fld('Brush size', 'p-r', 0.5, 80, 0.5, r, 'm')}
      <p class="muted">${area} ground, ${nat} nature, ${cr} crowd and ${er} eraser stroke${er === 1 ? '' : 's'}. Painted ground grips (and slows you) like the real thing when you run wide.${envReady() ? '' : ' (Scenery models are still loading.)'}</p>
      <div class="seg"><button id="p-undo">Undo Last Stroke</button><button id="p-clear">Clear All Paint</button></div>`;
    document.querySelectorAll('#p-kind button').forEach(b => b.addEventListener('click', () => { this.paintKind = b.dataset.v; sfx.move(); this.renderPaintTab(); this.dirty = true; }));
    document.querySelectorAll('#p-mix button').forEach(b => b.addEventListener('click', () => { this.floraMix = b.dataset.v; sfx.move(); this.renderPaintTab(); }));
    document.querySelectorAll('#p-what button').forEach(b => b.addEventListener('click', () => {
      const set = new Set(this.eraseWhat || 'gnb'); if (set.has(b.dataset.v)) { if (set.size > 1) set.delete(b.dataset.v); } else set.add(b.dataset.v);
      this.eraseWhat = ['g', 'n', 'b'].filter(k => set.has(k)).join(''); sfx.move(); this.renderPaintTab();
    }));
    const pd = $('p-d'); if (pd) pd.addEventListener('input', () => { this.floraDens = +pd.value; $('p-d-v').textContent = (+pd.value).toFixed(2); });
    const pcd = $('p-cd'); if (pcd) pcd.addEventListener('input', () => { this.crowdDens = +pcd.value; $('p-cd-v').textContent = (+pcd.value).toFixed(2); });
    const pg = $('p-gap'); if (pg) pg.addEventListener('input', () => { this.houseGap = +pg.value; $('p-gap-v').textContent = pg.value + 'm'; });
    this.bindPaintMode();
    const pr = $('p-r'); pr.addEventListener('input', () => { this.brush = +pr.value; $('p-r-v').textContent = pr.value + 'm'; this.dirty = true; });
    $('p-undo').addEventListener('click', () => { if (!t.paint.length) return; this.push(); t.paint.pop(); sfx.del(); this.changed(); this.renderPaintTab(); this.scheduleScenery(0); });
    $('p-clear').addEventListener('click', () => { if (!t.paint.length) return; this.push(); t.paint = []; sfx.del(); this.changed(); this.renderPaintTab(); this.scheduleScenery(0); this.toast('PAINT CLEARED'); });
  }
  // the tool buttons lit (PAINT drawing shapes lights RUNOFF)
  toolButtons() {
    const lit = this.tool === 'paint' && this.paintMode === 'shape' ? 'runoff' : this.tool;
    document.querySelectorAll('#s-editor [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === lit));
  }
  bindPaintMode() {
    document.querySelectorAll('#p-mode button').forEach(b => b.addEventListener('click', () => {
      this.paintMode = b.dataset.v; this.shapeDraw = null; this.paintSel = -1; this.paintNode = -1;
      if (this.paintMode === 'shape' && !['grass', 'paved', 'gravel'].includes(this.paintKind)) this.paintKind = 'gravel';
      sfx.move(); this.renderPaintTab(); this.toolButtons(); this.setHint && this.setHint(); this.dirty = true;
    }));
  }
  renderSculptTab() {
    const el = $('tab-node'), t = this.track, m = this.sculptMode, height = m === 'up' || m === 'down';
    el.innerHTML = `
      <h4>SCULPT</h4>
      <div class="fld"><label>Brush</label><div class="seg" id="sc-mode">${Object.entries(SCULPT_MODES).map(([k, v]) => `<button data-v="${k}" class="${m === k ? 'on' : ''}">${v.label}</button>`).join('')}</div></div>
      ${fld('Brush size', 'sc-r', 8, 150, 1, Math.round(this.sculptR), 'm')}
      ${height ? fld('Height per stroke', 'sc-k', 0.5, SCULPT_MAX, 0.5, this.sculptK, 'm') : fld('Strength', 'sc-s', 0.1, 1, 0.05, this.sculptS, '')}
      <p class="muted">${{ up: 'Raises the ground under the stroke. Go over it again to build it higher.', down: 'Digs the ground down: valleys, dips, a lake bed.', smooth: 'Rounds off bumps and sharp edges.', flat: 'Levels the ground to the height where the stroke starts. Start on a hilltop to make a plateau.' }[m]}</p>
      <p class="muted">The track, its runoff and roads keep their own heights: the ground blends into them. Hills show in the test drive and race. Your own edits sit on top of the location's hills${t.terrain ? ' (here, the real elevation)' : ''}.</p>
      <p class="muted">${t.sculpt.length} stroke${t.sculpt.length === 1 ? '' : 's'}.</p>
      <div class="seg"><button id="sc-undo">Undo Last Stroke</button><button id="sc-clear">Clear Sculpting</button></div>`;
    segBind('sc-mode', v => { this.sculptMode = v; this.renderSculptTab(); this.dirty = true; });
    const num = (id, key, unit, dec) => { const e = $(id); if (!e) return; e.addEventListener('input', () => { this[key] = +e.value; $(id + '-v').textContent = (dec ? (+e.value).toFixed(2) : e.value) + unit; this.dirty = true; }); };
    num('sc-r', 'sculptR', 'm'); num('sc-k', 'sculptK', 'm'); num('sc-s', 'sculptS', '', true);
    $('sc-undo').addEventListener('click', () => { if (!t.sculpt.length) return; this.push(); t.sculpt.pop(); this.sculptView = null; sfx.del(); this.changed(); this.renderSculptTab(); });
    $('sc-clear').addEventListener('click', () => { if (!t.sculpt.length) return; this.push(); t.sculpt = []; this.sculptView = null; sfx.del(); this.changed(); this.renderSculptTab(); this.toast('SCULPTING CLEARED'); });
  }
  // ---------------- roads ----------------
  roadLayoutCached() {
    if (!this.T) return null;
    if (this.roadsDirty) { this.roadsDirty = false; this.recompute(); } // fresh analysis (gaps / decks aren't cumulative)
    return this.A.roadL || null;
  }
  hitRoad(wx, wz) {
    const R = this.track.roads; let best = -1, bd = Infinity;
    R.forEach((r, i) => {
      for (let k = 0; k < r.pts.length - 1; k++) {
        const a = r.pts[k], b = r.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((wx - a[0]) * dx + (wz - a[1]) * dz) / L2));
        const d = Math.hypot(wx - a[0] - dx * t, wz - a[1] - dz * t);
        if (d < Math.max(r.w / 2 + (r.walk || 0), 6 / this.view.scale) && d < bd) { bd = d; best = i; }
      }
    });
    return best;
  }
  finishRoad(pts) {
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len < 12) { this.dirty = true; return; }
    // simplify the stroke (keeps curves, drops jitter)
    const keep = [pts[0]], eps = 1.5;
    const rdp = (a, b) => {
      let md = 0, mi = -1; const [ax, az] = pts[a], [bx, bz] = pts[b], L = Math.hypot(bx - ax, bz - az) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L; if (d > md) { md = d; mi = i; } }
      if (md > eps) { rdp(a, mi); keep.push(pts[mi]); rdp(mi, b); }
    };
    rdp(0, pts.length - 1); keep.push(pts[pts.length - 1]);
    keep.sort((p, q) => pts.indexOf(p) - pts.indexOf(q));
    this.push();
    const kind = this.roadKind || 'street';
    this.track.roads.push(newRoad(kind, keep.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10])));
    this.selRoad = this.track.roads.length - 1;
    sfx.place(); this.changed(); this.scheduleScenery(0); this.renderNodeTab();
  }
  // node editing on the selected road
  hitRoadNode(sx, sy) {
    const r = this.track.roads[this.selRoad]; if (!r) return -1;
    let best = -1, bd = 9;
    r.pts.forEach((q, k) => { const [x, y] = this.w2s(q[0], q[1]), d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = k; } });
    return best;
  }
  insertRoadNode(wx, wz) {
    const h = this.hitRoad(wx, wz); if (h < 0) return;
    const r = this.track.roads[h]; let bk = 0, bd = Infinity, bp = null;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k], b = r.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((wx - a[0]) * dx + (wz - a[1]) * dz) / (dx * dx + dz * dz || 1e-9)));
      const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(wx - px, wz - pz);
      if (d < bd) { bd = d; bk = k; bp = [Math.round(px * 10) / 10, Math.round(pz * 10) / 10]; }
    }
    this.push(); r.pts.splice(bk + 1, 0, bp);
    this.selRoad = h; this.selRoadNode = bk + 1; sfx.place(); this.changed(); this.scheduleScenery(0); this.renderNodeTab();
  }
  deleteRoadNode() {
    const r = this.track.roads[this.selRoad]; if (!r) return;
    if (r.pts.length <= 2) return this.deleteRoad();
    this.push(); r.pts.splice(this.selRoadNode, 1); this.selRoadNode = -1; sfx.del(); this.changed(); this.scheduleScenery(0); this.renderNodeTab();
  }
  deleteRoad() { if (this.selRoad < 0) return; this.push(); this.track.roads.splice(this.selRoad, 1); this.selRoad = -1; sfx.del(); this.changed(); this.scheduleScenery(0); this.renderNodeTab(); }
  renderRoadTab() {
    const el = $('tab-node'), t = this.track, r = t.roads[this.selRoad], kind = r ? r.kind : (this.roadKind || 'street');
    const L = this.roadLayoutCached();
    const cutN = L && r ? L.cut.length : 0;
    el.innerHTML = `
      <h4>${r ? 'ROAD · ' + ROAD_TYPES[r.kind].label.toUpperCase() : 'NEW ROAD'}</h4>
      <div class="fld"><label>Type</label><div class="seg" id="r-kind">${Object.entries(ROAD_TYPES).map(([k, v]) => `<button data-v="${k}" class="${kind === k ? 'on' : ''}">${v.label}</button>`).join('')}</div></div>
      ${r ? `<div class="fld"><label>Where it meets the circuit</label><div class="seg" id="r-meet">${Object.entries(MEET).map(([k, v]) => `<button data-v="${k}" class="${((r.meet) || ROAD_TYPES[r.kind].meet) === k ? 'on' : ''}">${v.split(' (')[0]}</button>`).join('')}</div></div>
        <p class="muted" id="r-meet-help">${{ barrier: 'The road runs right up to the track edge and the circuit\'s barrier closes off the junction, like a side street on a real street circuit on race day.', open: 'Joins the track: the barrier opens and the road meets the track edge. Driving off down it counts as leaving the track.', gate: 'A closed gate in the barrier where the road arrives. You can see through it but not drive through it.', over: 'Where it crosses the circuit it rises onto a bridge over the track, with ramps either side.', under: 'Where it crosses the circuit the track climbs onto a bridge over it (about 4.5 m, on smooth ramps) and the road dips a little underneath. This adds a crest to the track.' }[(r.meet) || ROAD_TYPES[r.kind].meet]} ${['over', 'under'].includes(r.meet || ROAD_TYPES[r.kind].meet) ? 'Only applies where the road crosses right over the circuit; a road that just ends at it gets a barrier.' : ''}</p>` : ''}
      ${r ? fld('Width', 'r-w', 4, 30, 0.5, r.w, 'm') + fld('Sidewalks', 'r-walk', 0, 6, 0.5, r.walk || 0, 'm') + `
        <div class="fld"><label>Markings</label><div class="seg" id="r-lines">${[['dash', 'Centre line'], ['double', 'Avenue'], ['freeway', 'Freeway'], ['none', 'None']].map(([k, l]) => `<button data-v="${k}" class="${r.lines === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <h4 style="margin-top:14px">BUILDINGS ALONG IT</h4>
        <div class="seg" id="r-zone">${['shops', 'businesses', 'houses', 'apartments'].map(k => `<button data-v="${k}">${ZONE_TYPES[k].label}</button>`).join('')}</div>
        <p class="muted">Adds a zone on both sides of this road, set back past the sidewalks. Edit it with the ZONES tool.</p>
        <div class="seg" style="margin-top:8px"><button id="r-del">Delete Road</button></div>` : ''}
      <p class="muted" style="margin-top:12px">${r ? 'Drag the road to move it.' : 'Drag on the map to draw a road.'} Where a road meets the circuit it runs up to the track edge; its setting decides whether the barrier closes it off, opens or has a gate (dots on the map). Only the pit lane blocks roads (shown dashed red). Roads crossing each other form junctions.</p>`;
    segBind('r-kind', v => {
      this.roadKind = v;
      if (r) { this.push(); Object.assign(r, { kind: v, w: ROAD_TYPES[v].w, walk: ROAD_TYPES[v].walk, lines: ROAD_TYPES[v].lines, meet: ROAD_TYPES[v].meet }); this.changed(); this.scheduleScenery(0); }
      this.renderRoadTab(); this.dirty = true;
    });
    if (!r) return;
    for (const [id, key, unit] of [['r-w', 'w', 'm'], ['r-walk', 'walk', 'm']]) {
      const inp = $(id);
      inp.addEventListener('pointerdown', () => this.push());
      inp.addEventListener('input', () => { r[key] = +inp.value; $(id + '-v').textContent = inp.value + unit; this.roadsDirty = true; this.dirty = true; });
      inp.addEventListener('change', () => { this.changed(); this.scheduleScenery(0); });
    }
    segBind('r-lines', v => { this.push(); r.lines = v; this.changed(); });
    segBind('r-meet', v => { this.push(); r.meet = v; this.changed(); this.scheduleScenery(0); this.renderRoadTab(); });
    segBind('r-zone', v => {
      this.push();
      const z = newZone(v, r.pts.map(q => q.slice())); z.side = 'both'; z.setback = r.w / 2 + (r.walk || 0) + 1.5;
      this.track.zones.push(z); this.changed(); this.scheduleScenery(0); sfx.place();
      this.toast(ZONE_TYPES[v].label.toUpperCase() + ' ADDED ALONG THE ROAD');
    });
    $('r-del').addEventListener('click', () => this.deleteRoad());
  }
  drawRoads(c) {
    const t = this.track, live = this.drag && this.drag.type === 'rdraw' ? this.drag.pts : null;
    const L = this.roadLayoutCached(), sc = this.view.scale;
    if (!(L && L.pieces.length) && !live) return;
    c.save(); c.lineCap = c.lineJoin = 'round';
    const line = (pts) => { c.beginPath(); pts.forEach((q, k) => { const [x, y] = this.w2s(q.x ?? q[0], q.z ?? q[1]); k ? c.lineTo(x, y) : c.moveTo(x, y); }); };
    if (L) {
      c.lineCap = 'butt';
      for (const pc of L.pieces) { if (pc.walk > 0) { line(pc.s); c.strokeStyle = '#a8a69e'; c.lineWidth = (pc.w + pc.walk * 2) * sc; c.stroke(); } }
      // junctions with the track: sidewalks round the flared corners, then the apron itself
      for (const jn of L.junctions || []) for (const w of jn.walks) {
        const P = w.pts, out = [];
        let pn = null;
        P.forEach((q, k) => {
          const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          let nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
          if (k === 0) { nx = q.x - jn.E.x; nz = q.z - jn.E.z; const m = Math.hypot(nx, nz) || 1; nx /= m; nz /= m; }
          else if (nx * pn[0] + nz * pn[1] < 0) { nx = -nx; nz = -nz; }
          pn = [nx, nz];
          const wk = Math.min(1, (P.length - 1 - k) / 4 + (jn.circuitWalk ? 1 : 0));
          out.push({ x: q.x + nx * jn.walk * wk, z: q.z + nz * jn.walk * wk });
        });
        line([...P, ...out.reverse()]); c.closePath(); c.fillStyle = '#a8a69e'; c.fill();
      }
      for (const pc of L.pieces) { line(pc.s); c.strokeStyle = ROAD_TYPES[pc.kind]?.color || '#555'; c.lineWidth = pc.w * sc; c.stroke(); }
      for (const jn of L.junctions || []) { line(jn.poly); c.closePath(); c.fillStyle = ROAD_TYPES[jn.kind]?.color || '#555'; c.fill(); }
      c.lineCap = 'round';
      if (sc > 0.6) for (const pc of L.pieces) if (pc.lines !== 'none') { line(pc.s); c.strokeStyle = pc.lines === 'double' ? 'rgba(242,194,27,.8)' : 'rgba(240,240,240,.7)'; c.lineWidth = 1; c.setLineDash([6, 6]); c.stroke(); c.setLineDash([]); }
      // the bits removed where the road meets the circuit
      c.strokeStyle = 'rgba(255,90,70,0.6)'; c.lineWidth = 1.5; c.setLineDash([4, 4]);
      for (const cs of L.cut) { line(cs); c.stroke(); }
      c.setLineDash([]);
    }
    const sel = this.tool === 'roads' ? t.roads[this.selRoad] : null;
    if (sel) {
      line(sel.pts); c.strokeStyle = '#ffd66b'; c.lineWidth = 2.5; c.stroke();
      sel.pts.forEach((q, k) => { const [x, y] = this.w2s(q[0], q[1]); c.fillStyle = k === this.selRoadNode ? '#ffd66b' : '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.fillRect(x - 4.5, y - 4.5, 9, 9); c.strokeRect(x - 4.5, y - 4.5, 9, 9); });
    }
    if (live) { line(live); c.strokeStyle = ROAD_TYPES[this.roadKind || 'street'].color; c.lineWidth = Math.max(2, ROAD_TYPES[this.roadKind || 'street'].w * sc); c.globalAlpha = 0.7; c.stroke(); }
    c.restore();
  }

  // road bridges drawn on top of the track; tunnels shown as dashed outlines across it; gaps / gates marked
  drawRoadBridges(c) {
    const L = this.roadLayoutCached(); if (!L) return;
    const sc = this.view.scale, T = this.T;
    c.save(); c.lineCap = 'butt'; c.lineJoin = 'round';
    for (const pc of L.pieces) {
      let run = [];
      const flush = (tun) => {
        if (run.length < 2) { run = []; return; }
        c.beginPath(); run.forEach((q, k) => { const [x, y] = this.w2s(q.x, q.z); k ? c.lineTo(x, y) : c.moveTo(x, y); });
        if (tun) { c.strokeStyle = 'rgba(255,214,107,.85)'; c.lineWidth = 1.5; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); }
        else { c.strokeStyle = '#222'; c.lineWidth = (pc.w + pc.walk * 2) * sc + 4; c.stroke(); c.strokeStyle = ROAD_TYPES[pc.kind]?.color || '#555'; c.lineWidth = pc.w * sc; c.stroke(); }
        run = [];
      };
      let mode = null;
      for (const q of pc.s) { const m = q.br ? 'br' : q.tun ? 'tun' : null; if (m !== mode) { flush(mode === 'tun'); mode = m; } if (m) run.push(q); }
      flush(mode === 'tun');
    }
    for (const g of L.gaps) {
      const i = g.ti, off = g.side * ((g.side < 0 ? this.A.BL[i] : this.A.BR[i]));
      const [x, y] = this.w2s(T.X[i] + T.RX[i] * off, T.Z[i] + T.RZ[i] * off);
      c.fillStyle = g.closed ? '#d8d4c8' : g.gate ? '#ff8a5a' : '#7cff9a'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); c.stroke();
    }
    c.restore();
  }

  // ---------------- individual buildings (PROPS tool) ----------------
  hitBuilding(wx, wz) {
    const S = this.scen; if (!S) return null;
    for (let i = S.buildings.length - 1; i >= 0; i--) {
      const b = S.buildings[i];
      if (pointInPoly(wx, wz, b.p)) return b.from === 'custom' ? { from: 'custom', ci: b.ci } : { from: b.from, key: b.key };
    }
    return null;
  }
  // an edited zone / imported building becomes an independent one (original hidden) so it stays put
  detachSel() {
    const s = this.selBld, t = this.track; if (!s) return -1;
    if (s.from === 'custom') return s.ci;
    const b = this.scen && this.scen.buildings.find(q => q.key === s.key); if (!b) return -1;
    const nb = { p: b.p.map(q => q.slice()), h: b.h, s: b.s, r: b.r };
    if (b.m) nb.m = b.m;
    // (a house keeps the look it had where it stood; a tint carries over)
    if (this.isHouse(b)) nb.hv = houseLook(b.hv, ...centroid(b.p)); else if (b.hv) nb.hv = { ...b.hv };
    if (b.biz) { nb.biz = b.biz; nb.c = b.c.slice(); nb.face = b.face; }
    t.hidden.push(s.key); t.buildings.push(nb);
    this.selBld = { from: 'custom', ci: t.buildings.length - 1 };
    return this.selBld.ci;
  }
  rotateBuilding(d) {
    this.push();
    const ci = this.detachSel(), b = this.track.buildings[ci]; if (!b) return;
    const [cx, cz] = b.c || centroid(b.p), c = Math.cos(d), s = Math.sin(d);
    // same sense as a 3D rotation about +y (what the game uses for props / businesses)
    b.p = b.p.map(([x, z]) => [Math.round((cx + (x - cx) * c + (z - cz) * s) * 100) / 100, Math.round((cz - (x - cx) * s + (z - cz) * c) * 100) / 100]);
    if (b.biz) b.face = (b.face || 0) + d;
    this.changed(); this.scheduleScenery(0); this.renderNodeTab();
  }
  deleteBuilding() {
    const s = this.selBld; if (!s) return;
    this.push();
    if (s.from === 'custom') { this.track.buildings.splice(s.ci, 1); }
    else this.track.hidden.push(s.key);
    this.selBld = null; sfx.del(); this.changed(); this.scheduleScenery(0); this.renderNodeTab();
  }
  // ---------------- PROPS: houses, buildings, nature, trackside ----------------
  // what the PROPS tool places that is a model building (a house or a random building), or null
  modelProp(t = this.propType) {
    if (t === 'house') return { kind: 'house' };
    if (t.startsWith('house:')) return { kind: 'house', id: t.slice(6) };
    if (t.startsWith('bld:')) return { kind: t.slice(4) };
    return null;
  }
  // the model the next click places (picked now so the ghost under the mouse shows exactly that)
  pendingModel() {
    const mp = this.modelProp(); if (!mp || !envReady()) return null;
    if (this.pending && this.pending.key === this.propType && envAsset(this.pending.a.id)) return this.pending.a;
    const a = mp.id ? envAsset(mp.id) : randomBuilding(mp.kind);
    this.pending = a ? { key: this.propType, a } : null;
    return a;
  }
  // turned to face the nearest road or the circuit (plus any Q/E turn)
  faceRot(x, z) {
    const tg = this.T && frontTarget(x, z, this.A && this.A.roadL, this.T, this.A);
    return (tg ? Math.atan2(tg[0] - x, tg[1] - z) : 0) + this.propRot;
  }
  newHouseLook() {
    const hp = this.housePaint;
    return hp.random ? houseLook(null, Math.random() * 1e5, Math.random() * 1e5) : { w: hp.w, r: hp.r, c: hp.c || null };
  }
  placeModel(x, z) {
    const a = this.pendingModel();
    if (!a) { sfx.error(); this.toast(envReady() ? 'NO MODELS FOR THAT' : 'MODELS STILL LOADING'); return; }
    this.push();
    const rot = this.faceRot(x, z), b = { p: modelFootprint(a, x, z, rot).map(q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]), h: a.h, s: styleOf(a), r: 'flat', m: a.id, placed: 1 };
    if (a.paint) b.hv = this.newHouseLook();
    this.track.buildings.push(b);
    this.selBld = { from: 'custom', ci: this.track.buildings.length - 1 }; this.selProp = -1;
    this.pending = null;
    if (this.T && !buildingClear(b.p, this.T, this.A)) this.toast('TOO CLOSE TO THE TRACK · DRAG IT CLEAR');
    this.drag = { type: 'bld', wx: x, wz: z, moved: false }; // (keep holding to drag it into place)
    sfx.place(); this.changed(); this.scheduleScenery(0); this.renderNodeTab();
  }
  isHouse(b) { const a = b && b.m && envAsset(b.m); return !!(a && a.paint); }
  selBuilding() {
    const s = this.selBld; if (!s) return null;
    return s.from === 'custom' ? this.track.buildings[s.ci] : this.scen && this.scen.buildings.find(q => q.key === s.key);
  }
  // change the selected building (it becomes an independent copy first if it came from a zone / map / setting)
  editBld(fn) {
    this.push();
    const b = this.track.buildings[this.detachSel()]; if (!b) return;
    fn(b);
    this.changed(); this.scheduleScenery(0); this.renderNodeTab();
  }
  // swap the selected building's model for another (same spot, same way round)
  swapModel(a) {
    this.editBld(b => {
      const [cx, cz] = centroid(b.p), ux = b.p[1][0] - b.p[0][0], uz = b.p[1][1] - b.p[0][1];
      const rot = Math.atan2(-uz, ux);
      b.p = modelFootprint(a, cx, cz, rot).map(q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]);
      b.m = a.id; b.h = a.h; b.s = styleOf(a);
      if (a.paint && !b.hv) b.hv = this.newHouseLook();
    });
  }

  // House paint swatches: walls, roofs, paint colours. look: { w, r, c }; pick(change) gets { w } / { r } / { c }
  swatchImg(kind, n) {
    this.swatches = this.swatches || {};
    const k = kind + n;
    if (!this.swatches[k]) { const u = houseSwatch(kind, n); if (u) this.swatches[k] = u; }
    return this.swatches[k] ? `<img src="${this.swatches[k]}" alt="">` : `<i style="background:${(kind === 'wall' ? WALL_COL : ROOF_COL)[n - 1]}"></i>`;
  }
  paintHtml(look, id) {
    return `
      <div class="fld"><label>Walls<span>${HOUSE_WALLS[look.w - 1].label}</span></label><div class="sw" id="${id}-w">${HOUSE_WALLS.map((w, i) => `<button data-v="${i + 1}" class="${look.w === i + 1 ? 'on' : ''}" title="${w.label}">${this.swatchImg('wall', i + 1)}</button>`).join('')}</div></div>
      <div class="fld"><label>Roof<span>${HOUSE_ROOFS[look.r - 1].label}</span></label><div class="sw" id="${id}-r">${HOUSE_ROOFS.map((w, i) => `<button data-v="${i + 1}" class="${look.r === i + 1 ? 'on' : ''}" title="${w.label}">${this.swatchImg('roof', i + 1)}</button>`).join('')}</div></div>
      ${this.colourHtml(look.c, id, 'Paint')}
      <p class="muted" style="margin-top:-4px">Paint colors the walls (strongest on white siding).</p>`;
  }
  colourHtml(c, id, label) {
    return `<div class="fld"><label>${label}<span>${c ? c.toUpperCase() : 'None'}</span></label><div class="sw" id="${id}-c">
      <button data-v="" class="${!c ? 'on' : ''}" title="No paint"><i class="none"></i></button>
      ${HOUSE_PAINTS.map(p => `<button data-v="${p}" class="${c === p ? 'on' : ''}" title="${p}"><i style="background:${p}"></i></button>`).join('')}
      <span class="pick ${c && !HOUSE_PAINTS.includes(c) ? 'on' : ''}" title="Any color"><i style="background:${c && !HOUSE_PAINTS.includes(c) ? c : 'conic-gradient(#f55,#fd5,#5f8,#5cf,#a6f,#f55)'}"></i><input type="color" id="${id}-cc" value="${c || '#ffffff'}"></span>
    </div></div>`;
  }
  bindPaint(id, pick) {
    document.querySelectorAll(`#${id}-w button`).forEach(b => b.addEventListener('click', () => { sfx.move(); pick({ w: +b.dataset.v }); }));
    document.querySelectorAll(`#${id}-r button`).forEach(b => b.addEventListener('click', () => { sfx.move(); pick({ r: +b.dataset.v }); }));
    this.bindColour(id, pick);
  }
  bindColour(id, pick) {
    document.querySelectorAll(`#${id}-c button`).forEach(b => b.addEventListener('click', () => { sfx.move(); pick({ c: b.dataset.v || null }); }));
    const cc = $(id + '-cc'); if (cc) cc.addEventListener('change', () => pick({ c: cc.value }));
  }

  renderItemTab() {
    const el = $('tab-node'), t = this.track;
    if (this.selBld) return this.renderBuildingPanel();
    if (this.selLine && this.lineById(this.selLine)) return this.renderLinePanel();
    if (this.selProp >= 0 && t.props[this.selProp]) return this.renderPropPanel();
    const cat = this.propCat;
    // a picture card per prop, in groups; the one you're placing up top, big, with its options
    const tile = (k, label) => `<button data-prop="${k}" class="pr-card${this.propType === k ? ' on' : ''}" title="${esc(label)}"><img data-thumb="${this.thumbKey(k) || ''}" alt=""><span>${esc(label)}</span></button>`;
    const groups = [];
    let extra = '';
    if (cat === 'houses') {
      const hs = envReady() ? houseAssets() : [];
      groups.push(['', [['house', 'Random House'], ...hs.map((a, i) => ['house:' + a.id, 'House ' + (i + 1)])]]);
      const hp = this.housePaint;
      extra = `<h4>NEW HOUSES LOOK</h4>
        <div class="fld"><div class="seg" id="hp-mode"><button data-v="1" class="${hp.random ? 'on' : ''}">Random</button><button data-v="0" class="${!hp.random ? 'on' : ''}">Choose</button></div></div>
        ${hp.random ? '<p class="muted">Each house gets one of the pack\'s own wall and roof combinations, white siding often painted. Click a placed house to repaint it.</p>' : this.paintHtml(hp, 'hp')}`;
    } else if (cat === 'buildings') {
      groups.push(['By kind', [['bld:any', 'Random Building'], ...Object.entries(BUILDING_KINDS).filter(([k]) => k !== 'house' && k !== 'any').map(([k, v]) => ['bld:' + k, v.label])]]);
      groups.push(['Landmarks', [...BUSINESS_KEYS.map(k => [k, BUSINESSES[k].label]), ['courthouse', PROP_TYPES.courthouse.label]]]);
    } else if (cat === 'nature') {
      groups.push(['', Object.keys(PROP_FLORA).map(k => [k, PROP_TYPES[k].label])]);
    } else {
      // (the classic props and the race-track pack's families, by what they're for)
      const fams = envReady() ? trackPropFamilies() : [], have = new Set(fams.map(f => f.cls));
      const fam = (...cls) => cls.filter(c => have.has(c)).map(c => ['tp:' + c, fams.find(f => f.cls === c).label]);
      const classic = (...ks) => ks.map(k => [k, PROP_TYPES[k].label]);
      groups.push(['Stands', [...fam('stand_roof', 'stand_flags'), ...classic('bleachers', 'grandstand')]]);
      groups.push(['Sponsors and signs', [...fam('board', 'flag', 'adtower', 'lamppost'), ...classic('billboard')]]);
      groups.push(['Over the track', fam('gantry', 'gantry_wide', 'arch', 'arch_balloons')]);
      groups.push(['Lights', [...fam('floodmast', 'stadium_light', 'worklight', 'lamppost_plain', 'festoon'), ...classic('lamp')]]);
      groups.push(['Barriers and pit', [...classic('tires', 'cones'), ...fam('fence', 'tire_rack', 'camera_tower', 'pit_building')]]);
      extra = this.logoHtml();
    }
    const hiddenN = t.hidden.length;
    el.innerHTML = `<h4>PLACE</h4>
      <div class="fld"><div class="seg" id="pr-cat">${[['houses', 'Houses'], ['buildings', 'Buildings'], ['nature', 'Nature'], ['track', 'Trackside']].map(([k, l]) => `<button data-v="${k}" class="${cat === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div id="pr-sel">${this.selectedHtml()}</div>
      <div id="pr-grid">${groups.filter(g => g[1].length).map(([title, list]) => `${title ? `<h5 class="pr-group">${title}</h5>` : ''}<div class="pr-cards">${list.map(([k, l]) => tile(k, l)).join('')}</div>`).join('')}</div>
      ${extra}
      ${hiddenN ? `<div class="seg" style="margin-top:12px"><button id="i-restore">Restore ${hiddenN} removed / edited original${hiddenN > 1 ? 's' : ''}</button></div>` : ''}`;
    segBind('pr-cat', v => { this.propCat = v; this.renderItemTab(); });
    document.querySelectorAll('#pr-grid [data-prop]').forEach(b => b.addEventListener('click', () => {
      this.propType = b.dataset.prop; this.pending = null; this.propRot = 0; this.updatePalette(); sfx.move(); this.dirty = true;
      // (just the card up top: the list keeps its place)
      $('pr-sel').innerHTML = this.selectedHtml(); this.bindSelected(); this.fillCards($('pr-sel'));
    }));
    segBind('hp-mode', v => { this.housePaint.random = v === '1'; this.renderItemTab(); });
    this.bindSelected();
    this.bindLines();
    this.bindPaint('hp', (ch) => { Object.assign(this.housePaint, ch); this.renderItemTab(); });
    $('i-restore') && $('i-restore').addEventListener('click', () => { this.push(); t.hidden = []; t.buildings = t.buildings.filter(b => b.placed); this.changed(); this.scheduleScenery(0); this.renderItemTab(); this.toast('ORIGINAL BUILDINGS RESTORED'); });
    this.fillCards();
  }
  // ---- prop pictures (js/propthumbs.js) ----
  // what to draw for a prop type (a tile, a placed one): its scenery model where it has one
  thumbKey(type) {
    if (!type) return null;
    if (type.startsWith('tp:')) { const f = this.tpFam(type); if (!f) return null; const pick = this.tpPick[f.cls]; return 'env:' + (pick && f.ids.includes(pick) ? pick : f.ids[0]); }
    if (type.startsWith('tp_')) return 'env:' + type;
    if (PROP_FLORA[type]) { const m = envReady() && natureModel(type, () => 0.37, this.track.env); return m ? 'env:' + m.id : null; }
    if (type === 'house') { const hs = envReady() ? houseAssets() : []; return hs.length ? 'env:' + hs[0].id : null; }
    if (type.startsWith('house:')) return 'env:' + type.slice(6);
    if (type.startsWith('bld:')) { const k = type.slice(4), a = envReady() && randomBuilding(k === 'any' ? 'apartment' : k, () => 0.3); return a ? 'env:' + a.id : null; }
    if (BUSINESSES[type]) return 'biz:' + type;
    if (type === 'courthouse') return 'courthouse';
    if (type === 'bleachers') return 'bleachers';
    if (['grandstand', 'billboard', 'tires', 'cones', 'lamp'].includes(type)) return 'classic:' + type;
    return null;
  }
  // every picture in the panel (or in el) that isn't drawn yet
  fillCards(el = $('tab-node')) {
    if (!el) return;
    el.querySelectorAll('img[data-thumb]').forEach(img => {
      const key = img.dataset.thumb; if (!key || img.dataset.done === key) return;
      img.dataset.done = key;
      thumb(key).then(url => { if (url && img.dataset.done === key) { img.src = url; img.classList.add('in'); } });
    });
  }
  // a big picture with a name and a line under it (the prop you're placing; a picked line or prop)
  cardHtml(type, label, sub) {
    return `<div class="pr-big"><img data-thumb="${this.thumbKey(type) || ''}" alt=""><div><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
  }
  // the prop you're placing: its picture, what it is, how it goes down, and its options (its look, a line's spacing)
  selectedHtml() {
    const type = this.propType, fam = type.startsWith('tp:') ? this.tpFam(type) : null, def = PROP_TYPES[type];
    if (this.modelProp()) {
      const label = type === 'house' ? 'Random House' : type.startsWith('house:') ? 'House' : type.startsWith('bld:') ? (BUILDING_KINDS[type.slice(4)] || { label: 'Building' }).label : (def ? def.label : '');
      return this.cardHtml(type, label, 'Click the map to place it. It turns to face the nearest road.');
    }
    if (!fam && !def) return '';
    const label = fam ? fam.label : def.label;
    const how = fam && fam.span ? 'Drop it on the track: it spans it. Drag along the track for a row of them.'
      : 'Click to place one, or drag to draw a line of them' + (fam || ['grandstand', 'billboard', 'bleachers'].includes(type) ? ', facing the track.' : '.');
    const what = fam ? fam.sub || '' : type === 'bleachers' ? 'Compact, 11 rows, with a crowd. They stand back from where you click' : '';
    return this.cardHtml(type, label, [what, how].filter(Boolean).join(' · ')) + this.lookHtml() + this.lineHtml();
  }
  bindSelected() {
    segBind('pr-look', v => { const f = this.tpFam(this.propType); if (f) { if (v) this.tpPick[f.cls] = v; else delete this.tpPick[f.cls]; } $('pr-sel').innerHTML = this.selectedHtml(); this.bindSelected(); this.fillCards($('pr-sel')); this.dirty = true; });
    const gi = $('pr-gap');
    if (gi) gi.addEventListener('input', () => { this.lineGap = +gi.value; $('pr-gap-v').textContent = gi.value + 'm'; const a = $('pr-gap-auto'); if (a) a.classList.remove('on'); this.dirty = true; });
    const ga = $('pr-gap-auto'); if (ga) ga.addEventListener('click', () => { this.lineGap = null; sfx.move(); $('pr-sel').innerHTML = this.selectedHtml(); this.bindSelected(); this.fillCards($('pr-sel')); this.dirty = true; });
  }
  // ---- the PLACE panel's extras: a family's looks, lines, logos ----
  lookHtml() {
    if (!this.propType.startsWith('tp:')) return '';
    const f = this.tpFam(this.propType); if (!f || f.ids.length < 2) return '';
    const pick = this.tpPick[f.cls] || '';
    return `<div class="fld"><label>Look</label><div class="seg" id="pr-look"><button data-v="" class="${!pick ? 'on' : ''}" title="A different one each time (in turn along a line)">Mixed</button>${f.ids.map((id, k) => `<button data-v="${id}" class="${pick === id ? 'on' : ''}">${k + 1}</button>`).join('')}</div></div>`;
  }
  lineHtml() {
    const g = this.lineGapFor(this.propType), auto = this.lineGap == null;
    return `<div class="pr-gap">${fld('Line spacing', 'pr-gap', 0.5, 60, 0.5, Math.min(60, +g.toFixed(1)), 'm')}<button id="pr-gap-auto" class="${auto ? 'on' : ''}" title="From the prop's size">Auto</button></div>`;
  }
  logoHtml() {
    const L = this.track.logos || {};
    return `<h4 style="margin-top:18px">SPONSOR LOGOS</h4>
      <p class="muted" style="margin-top:-2px">The logos on the banners, boards and flags. Click one to put your own image there (a team logo, your sponsor): everything showing it shows yours. Right-click puts the original back.</p>
      <div class="logo-grid" id="pr-logos">${Object.entries(LOGOS).map(([k, v]) => `<button data-v="${k}" title="${esc(v.label)}" class="${L[k] ? 'on' : ''}"><canvas width="112" height="44"></canvas></button>`).join('')}</div>
      <input type="file" id="pr-logo-file" accept="image/*" hidden>`;
  }
  bindLines() {
    const grid = $('pr-logos'); if (!grid) return;
    const t = this.track, sheet = logoSheetImage();
    grid.querySelectorAll('button').forEach(b => {
      const k = b.dataset.v, cv = b.querySelector('canvas'), g = cv.getContext('2d');
      const own = t.logos && t.logos[k];
      const show = (im, crop) => { g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); const [sx, sy, sw, sh] = crop || [0, 0, im.width, im.height]; const tall = sh > sw * 1.6, w = tall ? sh : sw, h = tall ? sw : sh, kk = Math.min(cv.width * 0.92 / w, cv.height * 0.86 / h); g.save(); g.translate(cv.width / 2, cv.height / 2); if (tall) g.rotate(Math.PI / 2); g.drawImage(im, sx, sy, sw, sh, -sw * kk / 2, -sh * kk / 2, sw * kk, sh * kk); g.restore(); };
      if (own) { const im = new Image(); im.onload = () => show(im); im.src = own; }
      else if (sheet) { const [x, y, w, h] = LOGOS[k].r, W = sheet.width, H = sheet.height; show(sheet, [x * W, y * H, w * W, h * H]); }
      b.addEventListener('click', () => { this.logoSlot = k; $('pr-logo-file').click(); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!t.logos || !t.logos[k]) return; this.push(); delete t.logos[k]; sfx.del(); this.changed(); this.renderItemTab(); });
    });
    $('pr-logo-file').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0], k = this.logoSlot; if (!file || !k) return;
      const im = new Image(), url = URL.createObjectURL(file);
      im.onload = () => {
        // (kept small: it travels with the track. Its shape is kept; it's fitted into the slot in the game)
        const s = Math.min(1, 384 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.width * s)); cv.height = Math.max(1, Math.round(im.height * s));
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        this.push(); t.logos = { ...(t.logos || {}), [k]: cv.toDataURL('image/png') };
        sfx.place(); this.changed(); this.renderItemTab(); this.toast(`${LOGOS[k].label.toUpperCase()} REPLACED`);
      };
      im.src = url;
    });
  }
  // a placed piece of the race-track pack: its look, its fans (stands), turning, deleting
  renderTrackPropPanel() {
    const el = $('tab-node'), p = this.track.props[this.selProp], f = trackPropFamily(p.type), fam = f && this.tpFam('tp:' + f.cls);
    const stand = f && f.cls.startsWith('stand'), light = f && LIGHT_FAMILIES.includes(f.cls);
    el.innerHTML = `<h4>${esc((f ? f.label : p.type)).toUpperCase()}</h4>
      ${this.cardHtml(p.type, f ? f.label : p.type, 'Drag it on the map to move it.' + (f && f.span ? ' Drop it on the track and it spans it.' : ''))}
      ${light ? fld('Light strength', 'pp-light', 0.2, 2, 0.05, p.light ?? 1, '×') : ''}
      ${fam && fam.ids.length > 1 ? `<div class="fld"><label>Look</label><div class="seg" id="tp-look">${fam.ids.map((id, k) => `<button data-v="${id}" class="${p.type === id ? 'on' : ''}">${k + 1}</button>`).join('')}</div></div>` : ''}
      ${stand ? `<div class="fld"><label>Crowd</label><div class="seg" id="pp-crowd"><button data-v="1" class="${p.crowd !== false ? 'on' : ''}">People</button><button data-v="0" class="${p.crowd === false ? 'on' : ''}">Empty</button></div></div>
      ${p.crowd !== false ? fld('How full', 'pp-fill', 0.1, 1, 0.05, p.fill ?? 0.8, '') : ''}` : ''}
      <div class="seg"><button id="pp-l">&#10226; Turn 15&deg;</button><button id="pp-r">Turn 15&deg; &#10227;</button></div>
      <div class="seg" style="margin-top:8px"><button id="pp-del">Delete</button><button id="pp-back">Done</button></div>`;
    this.fillCards();
    segBind('tp-look', v => { this.push(); p.type = v; this.changed(); this.renderTrackPropPanel(); this.dirty = true; });
    const pl = $('pp-light'); if (pl) { pl.addEventListener('pointerdown', () => this.push()); pl.addEventListener('input', () => { p.light = +pl.value; $('pp-light-v').textContent = (+pl.value).toFixed(2) + '×'; }); pl.addEventListener('change', () => this.changed()); }
    segBind('pp-crowd', v => { this.push(); if (v === '1') delete p.crowd; else p.crowd = false; this.changed(); this.renderTrackPropPanel(); this.dirty = true; });
    const pf = $('pp-fill'); if (pf) { pf.addEventListener('pointerdown', () => this.push()); pf.addEventListener('input', () => { p.fill = +pf.value; $('pp-fill-v').textContent = (+pf.value).toFixed(2); }); pf.addEventListener('change', () => this.changed()); }
    const turn = (d) => { this.push(); p.rot = (p.rot || 0) + d; this.changed(); this.dirty = true; };
    $('pp-l').addEventListener('click', () => turn(-Math.PI / 12));
    $('pp-r').addEventListener('click', () => turn(Math.PI / 12));
    $('pp-del').addEventListener('click', () => { this.push(); this.track.props.splice(this.selProp, 1); this.selProp = -1; sfx.del(); this.changed(); this.renderItemTab(); });
    $('pp-back').addEventListener('click', () => { this.selProp = -1; this.renderItemTab(); this.dirty = true; });
  }
  renderPropPanel() {
    if (isTrackProp(this.track.props[this.selProp].type)) return this.renderTrackPropPanel();
    const el = $('tab-node'), p = this.track.props[this.selProp], def = PROP_TYPES[p.type] || { label: p.type };
    el.innerHTML = `<h4>${esc(def.label).toUpperCase()}</h4>
      ${this.cardHtml(p.type, def.label, 'Drag it on the map to move it. Q / E turns it.')}
      ${p.type === 'lamp' ? fld('Light strength', 'pp-light', 0.2, 2, 0.05, p.light ?? 1, '×') : ''}
      ${p.type === 'bleachers' ? `<div class="fld"><label>Crowd</label><div class="seg" id="pp-crowd"><button data-v="1" class="${p.crowd !== false ? 'on' : ''}">People</button><button data-v="0" class="${p.crowd === false ? 'on' : ''}">Empty</button></div></div>
      ${p.crowd !== false ? fld('How full', 'pp-fill', 0.1, 1, 0.05, p.fill ?? 0.8, '') : ''}` : ''}
      <div class="seg"><button id="pp-l">&#10226; Turn 15&deg;</button><button id="pp-r">Turn 15&deg; &#10227;</button></div>
      <div class="seg" style="margin-top:8px"><button id="pp-del">Delete</button><button id="pp-back">Done</button></div>`;
    const turn = (d) => { this.push(); p.rot = (p.rot || 0) + d; this.changed(); this.dirty = true; };
    this.fillCards();
    const pl = $('pp-light'); if (pl) { pl.addEventListener('pointerdown', () => this.push()); pl.addEventListener('input', () => { p.light = +pl.value; $('pp-light-v').textContent = (+pl.value).toFixed(2) + '×'; }); pl.addEventListener('change', () => this.changed()); }
    segBind('pp-crowd', v => { this.push(); if (v === '1') delete p.crowd; else p.crowd = false; this.changed(); this.renderPropPanel(); this.dirty = true; });
    const pf = $('pp-fill'); if (pf) { pf.addEventListener('pointerdown', () => this.push()); pf.addEventListener('input', () => { p.fill = +pf.value; $('pp-fill-v').textContent = (+pf.value).toFixed(2); }); pf.addEventListener('change', () => this.changed()); }
    $('pp-l').addEventListener('click', () => turn(-Math.PI / 12));
    $('pp-r').addEventListener('click', () => turn(Math.PI / 12));
    $('pp-del').addEventListener('click', () => { this.push(); this.track.props.splice(this.selProp, 1); this.selProp = -1; sfx.del(); this.changed(); this.renderItemTab(); });
    $('pp-back').addEventListener('click', () => { this.selProp = -1; this.renderItemTab(); this.dirty = true; });
  }
  renderBuildingPanel() {
    const el = $('tab-node'), s = this.selBld, b = this.selBuilding();
    if (!b) { this.selBld = null; return this.renderItemTab(); }
    const a = b.m && envAsset(b.m), house = this.isHouse(b);
    const what = b.biz ? BUSINESSES[b.biz].label : b.lm ? 'Landmark' : ({ house: 'House', shop: 'Shop', apartment: 'Apartments', office: 'Office', tower: 'Skyscraper', warehouse: 'Industrial' }[b.s] || 'Building');
    const from = s.from === 'zone' ? 'From a zone' : s.from === 'osm' ? 'From OpenStreetMap' : s.from === 'gen' ? 'From the World tab setting' : 'Placed by you';
    let body = '';
    if (house) {
      const [cx, cz] = centroid(b.p), look = houseLook(b.hv, cx, cz), hs = houseAssets();
      body = `<div class="fld"><label>Shape<span>House ${hs.findIndex(q => q.id === b.m) + 1}</span></label><div class="sw sw-num" id="bh-shape">${hs.map((q, i) => `<button data-v="${q.id}" class="${q.id === b.m ? 'on' : ''}">${i + 1}</button>`).join('')}<button data-v="?" title="Random shape">?</button></div></div>
        ${this.paintHtml(look, 'bp')}
        <div class="seg"><button id="bp-rand">Random Look</button><button id="bp-copy">Use For New Houses</button></div>`;
    } else if (a) {
      body = `${this.colourHtml(b.hv && b.hv.c, 'bt', 'Tint')}
        <div class="seg"><button id="b-swap">Swap For Another ${esc(what)}</button></div>
        ${fld('Height', 'b-h', 3, 200, 1, Math.round(b.h), 'm')}`;
    } else if (!b.biz) body = fld('Height', 'b-h', 3, 200, 1, Math.round(b.h), 'm');
    el.innerHTML = `<h4>${what.toUpperCase()}</h4>
      <p class="muted">${from}. Drag it on the map to move it.</p>
      ${body}
      <div class="seg" style="margin-top:12px"><button id="b-l">&#10226; Turn 15&deg;</button><button id="b-r">Turn 15&deg; &#10227;</button></div>
      <div class="seg" style="margin-top:6px"><button id="b-del">Delete</button><button id="b-back">Done</button></div>`;
    $('b-l').addEventListener('click', () => this.rotateBuilding(-Math.PI / 12));
    $('b-r').addEventListener('click', () => this.rotateBuilding(Math.PI / 12));
    $('b-del').addEventListener('click', () => this.deleteBuilding());
    $('b-back').addEventListener('click', () => { this.selBld = null; this.renderItemTab(); this.dirty = true; });
    if (house) {
      const [cx, cz] = centroid(b.p);
      this.bindPaint('bp', (ch) => this.editBld(nb => { nb.hv = { ...houseLook(nb.hv, cx, cz), ...ch }; }));
      document.querySelectorAll('#bh-shape button').forEach(btn => btn.addEventListener('click', () => {
        const hs = houseAssets(); let q = btn.dataset.v === '?' ? hs[Math.floor(Math.random() * hs.length)] : envAsset(btn.dataset.v);
        if (btn.dataset.v === '?' && hs.length > 1) while (q.id === b.m) q = hs[Math.floor(Math.random() * hs.length)];
        if (q) { sfx.move(); this.swapModel(q); }
      }));
      $('bp-rand').addEventListener('click', () => { sfx.select(); this.editBld(nb => { nb.hv = this.newHouseLookRandom(); }); });
      $('bp-copy').addEventListener('click', () => { const l = houseLook(b.hv, cx, cz); this.housePaint = { random: false, ...l }; sfx.select(); this.toast('NEW HOUSES WILL LOOK LIKE THIS'); });
    } else if (a) {
      this.bindColour('bt', (ch) => this.editBld(nb => { nb.hv = { ...(nb.hv || {}), c: ch.c }; if (!nb.hv.c) delete nb.hv; }));
      $('b-swap').addEventListener('click', () => {
        const kind = { shop: 'shop', apartment: 'apartment', office: 'office', tower: 'tower', warehouse: 'warehouse' }[b.s] || 'any';
        let q = randomBuilding(kind); for (let k = 0; k < 6 && q && q.id === b.m; k++) q = randomBuilding(kind);
        if (q) { sfx.move(); this.swapModel(q); }
      });
    }
    const bh = $('b-h');
    if (bh) {
      bh.addEventListener('pointerdown', () => { this.push(); this.detachSel(); });
      bh.addEventListener('input', () => { const nb = this.track.buildings[this.detachSel()]; if (nb) nb.h = +bh.value; $('b-h-v').textContent = bh.value + 'm'; });
      bh.addEventListener('change', () => { this.changed(); this.scheduleScenery(0); });
    }
  }
  newHouseLookRandom() { return houseLook(null, Math.random() * 1e5, Math.random() * 1e5); }

  // ---------------- PAINT: a street of houses, and the eraser ----------------
  // Houses along the stroke: a wide brush gives a row each side facing each other (a street between them), a
  // narrow one a single row facing the nearest road or the circuit. Each house is an ordinary placed building.
  paintHouses(st) {
    const T = this.T, A = this.A;
    if (!T) { this.needTrack('PAINT HOUSES'); return; }
    const list = envReady() ? houseAssets() : [];
    if (!list.length) { sfx.error(); this.toast('HOUSE MODELS STILL LOADING'); return; }
    const P = st.pts, cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = cum[cum.length - 1];
    const at = (d) => {
      let i = 1; while (i < P.length - 1 && cum[i] < d) i++;
      if (P.length < 2) return { x: P[0][0], z: P[0][1], tx: 1, tz: 0 };
      const a = P[i - 1], b = P[i], l = cum[i] - cum[i - 1] || 1, k = Math.max(0, Math.min(1, (d - cum[i - 1]) / l));
      return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l };
    };
    const roads = A.roadL, grid = this.scen && this.scen.grid, made = [], gap = this.houseGap ?? 4;
    const lanes = st.r >= 16 ? [-1, 1] : [0];
    for (const lane of lanes) {
      for (let d = 0, n = 0; (d <= L || n === 0) && n < 200; n++) {
        const a = list[Math.floor(Math.random() * list.length)], sc = 0.92 + Math.random() * 0.16, w = a.w * sc, dp = a.d * sc;
        const c = at(Math.min(L, d + w / 2)), nx = -c.tz, nz = c.tx;
        const off = lane * Math.max(dp / 2 + 3, st.r - dp / 2);
        const x = c.x + nx * off, z = c.z + nz * off;
        let fx = -nx * lane, fz = -nz * lane;
        if (!lane) { const tg = frontTarget(x, z, roads, T, A), sg = tg && (tg[0] - x) * nx + (tg[1] - z) * nz < 0 ? -1 : 1; fx = nx * sg; fz = nz * sg; }
        const rot = Math.atan2(fx, fz), p = modelFootprint(a, x, z, rot, sc);
        const rad = Math.hypot(w, dp) / 2;
        const ok = buildingClear(p, T, A) && !(roads && (p.some(q => roads.onRoad(q[0], q[1])) || roads.onRoad(x, z))) && !(grid && grid.hits(x, z, Math.min(w, dp) * 0.3)) && !made.some(m => Math.hypot(m[0] - x, m[1] - z) < (m[2] + rad) * 0.75);
        if (ok) { made.push([x, z, rad, { p: p.map(q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]), h: +(a.h * sc).toFixed(2), s: 'house', r: 'flat', m: a.id, hv: this.newHouseLook(), placed: 1 }]); d += w + gap * (0.6 + Math.random() * 0.8); }
        else d += 3;
      }
    }
    if (!made.length) { sfx.error(); this.toast('NO ROOM FOR HOUSES THERE'); this.dirty = true; return; }
    this.push();
    for (const m of made) this.track.buildings.push(m[3]);
    sfx.place(); this.changed(); this.scheduleScenery(0); this.renderNodeTab();
    this.toast(`${made.length} HOUSE${made.length > 1 ? 'S' : ''} PAINTED`);
  }
  // an eraser stroke takes out placed props and your own buildings under it straight away; trees, plants and
  // buildings the world made are removed by the stroke itself (it's kept in track.paint)
  eraseUnder(st) {
    const t = this.track, under = (x, z) => this.nearStroke(st, x, z);
    const N = eraseHits(st, 'n'), B = eraseHits(st, 'b');
    const bProps = new Set(['building', 'tower', 'courthouse', ...BUSINESS_KEYS]);
    const before = t.props.length + t.buildings.length;
    t.props = t.props.filter(p => !(((N && PROP_FLORA[p.type]) || (B && bProps.has(p.type))) && under(p.x, p.z)));
    if (B) t.buildings = t.buildings.filter(b => !under(...centroid(b.p)));
    if (t.props.length + t.buildings.length !== before) { this.selProp = -1; this.selBld = null; }
  }
  nearStroke(st, x, z) {
    const p = st.pts || [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[Math.min(p.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
      const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      if (Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k) < st.r) return true;
    }
    return false;
  }

  // sculpted land: a shaded relief (brown = raised, blue = dug down) under everything, plus the brush
  drawSculpt(c) {
    const t = this.track, live = this.drag && this.drag.type === 'sculpt' ? this.drag.stroke : null;
    if (t.sculpt.length) {
      let V = this.sculptView;
      if (!V || V.src !== t.sculpt || V.n !== t.sculpt.length) {
        const g = sculptPreview(t.sculpt);
        V = this.sculptView = { src: t.sculpt, n: t.sculpt.length, g, cv: null };
        if (g) {
          const cv = document.createElement('canvas'); cv.width = g.nx; cv.height = g.nz;
          const ctx = cv.getContext('2d'), im = ctx.createImageData(g.nx, g.nz), H = g.H;
          for (let j = 0; j < g.nz; j++) for (let k = 0; k < g.nx; k++) {
            const i = j * g.nx + k, h = H[i], o = i * 4;
            if (Math.abs(h) < 0.05) { im.data[o + 3] = 0; continue; }
            // light from the top left, contour lines every 2 m
            const dx = H[j * g.nx + Math.min(g.nx - 1, k + 1)] - H[j * g.nx + Math.max(0, k - 1)], dz = H[Math.min(g.nz - 1, j + 1) * g.nx + k] - H[Math.max(0, j - 1) * g.nx + k];
            const shade = Math.max(0.45, Math.min(1.35, 1 - (dx + dz) / (g.step * 2) * 0.9));
            const band = (v) => Math.floor(v / 2), line = band(h) !== band(H[j * g.nx + Math.min(g.nx - 1, k + 1)]) || band(h) !== band(H[Math.min(g.nz - 1, j + 1) * g.nx + k]) ? 0.5 : 1;
            const base = h > 0 ? [196, 140, 82] : [70, 130, 200], a = Math.min(1, Math.abs(h) / 6);
            im.data[o] = base[0] * shade * line; im.data[o + 1] = base[1] * shade * line; im.data[o + 2] = base[2] * shade * line; im.data[o + 3] = 40 + 150 * a;
          }
          ctx.putImageData(im, 0, 0); V.cv = cv;
        }
      }
      if (V.g && V.cv) {
        const g = V.g, [x0, y0] = this.w2s(g.x0 - g.step / 2, g.z0 - g.step / 2), [x1, y1] = this.w2s(g.x0 + (g.nx - 0.5) * g.step, g.z0 + (g.nz - 0.5) * g.step);
        c.save(); c.globalAlpha = this.tool === 'sculpt' ? 0.95 : 0.55; c.imageSmoothingEnabled = true; c.drawImage(V.cv, x0, y0, x1 - x0, y1 - y0); c.restore();
      }
    }
    if (this.tool !== 'sculpt') return;
    // smoothing / flattening strokes don't show in the relief (it's drawn over flat ground): outline where they went
    c.save(); c.lineCap = c.lineJoin = 'round'; c.globalAlpha = 0.18;
    for (const st of t.sculpt) {
      if (st.m !== 'smooth' && st.m !== 'flat') continue;
      c.strokeStyle = SCULPT_MODES[st.m].color; c.lineWidth = Math.max(2, st.r * 2 * this.view.scale);
      c.beginPath(); st.pts.forEach((q, k) => { const [x, y] = this.w2s(q[0], q[1]); k ? c.lineTo(x, y) : c.moveTo(x, y); });
      if (st.pts.length === 1) { const [x, y] = this.w2s(st.pts[0][0], st.pts[0][1]); c.lineTo(x + 0.01, y); }
      c.stroke();
    }
    c.restore();
    const col = SCULPT_MODES[this.sculptMode].color;
    if (live) {
      c.save(); c.lineCap = c.lineJoin = 'round'; c.globalAlpha = 0.35; c.strokeStyle = col; c.lineWidth = Math.max(2, live.r * 2 * this.view.scale);
      c.beginPath(); live.pts.forEach((q, k) => { const [x, y] = this.w2s(q[0], q[1]); k ? c.lineTo(x, y) : c.moveTo(x, y); });
      if (live.pts.length === 1) { const [x, y] = this.w2s(live.pts[0][0], live.pts[0][1]); c.lineTo(x + 0.01, y); }
      c.stroke(); c.restore();
    }
    if (this.mouse.inside) {
      const [x, y] = this.w2s(this.mouse.wx, this.mouse.wz), R = this.sculptR * this.view.scale;
      c.strokeStyle = col; c.lineWidth = 1.5; c.setLineDash([4, 3]);
      c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 0.6; c.beginPath(); c.arc(x, y, R * 0.55, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; c.setLineDash([]);
    }
  }

  // painted ground: strokes onto an offscreen layer (erase = cut out), then onto the map
  drawPaint(c) {
    const t = this.track, live = this.drag && this.drag.type === 'paint' ? this.drag.stroke : null;
    const list = live ? [...t.paint, live] : t.paint;
    if (!list.length && this.tool !== 'paint') return;
    if (!this.paintLayer) this.paintLayer = document.createElement('canvas');
    const L = this.paintLayer, W = Math.round(this.W * this.dpr), H = Math.round(this.H * this.dpr);
    if (L.width !== W || L.height !== H) { L.width = W; L.height = H; }
    const g = L.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.lineCap = g.lineJoin = 'round';
    for (const s of list) {
      if (s.area) { // (a shape: filled inside its outline)
        if (s.pts.length < 3) continue;
        g.globalCompositeOperation = 'source-over'; g.fillStyle = (PAINTS[s.kind] || PAINTS.grass).color.replace(/[\d.]+\)$/, '1)');
        g.beginPath(); s.pts.forEach((p, k) => { const [x, y] = this.w2s(p[0], p[1]); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill();
        continue;
      }
      g.globalCompositeOperation = s.kind === 'erase' ? 'destination-out' : 'source-over';
      g.strokeStyle = s.kind === 'erase' ? '#000' : s.kind === 'houses' ? '#e0a060' : s.kind === 'crowd' ? '#e8789a' : s.kind === 'flora' ? (FLORA[s.mix] || FLORA.mixed).color : (PAINTS[s.kind] || PAINTS.grass).color.replace(/[\d.]+\)$/, '1)');
      g.lineWidth = Math.max(1, s.r * 2 * this.view.scale);
      g.beginPath();
      s.pts.forEach((p, k) => { const [x, y] = this.w2s(p[0], p[1]); k ? g.lineTo(x, y) : g.moveTo(x, y); });
      if (s.pts.length === 1) { const [x, y] = this.w2s(s.pts[0][0], s.pts[0][1]); g.lineTo(x + 0.01, y); }
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.62; c.drawImage(L, 0, 0); c.restore();
    // brush outline under the mouse
    if (this.tool === 'paint' && this.paintMode !== 'shape' && this.mouse.inside) {
      const [x, y] = this.w2s(this.mouse.wx, this.mouse.wz);
      c.strokeStyle = (this.paintKind || 'grass') === 'erase' ? '#ff8a5a' : this.paintKind === 'houses' ? '#e0a060' : this.paintKind === 'crowd' ? '#ff9ab8' : this.paintKind === 'flora' ? (FLORA[this.floraMix || 'blossom'] || FLORA.mixed).color : this.paintKind === 'paved' ? '#d4d6dc' : this.paintKind === 'gravel' ? '#f0d49a' : '#bfff9a'; c.lineWidth = 1.5; c.setLineDash([4, 3]);
      c.beginPath(); c.arc(x, y, (this.brush || 12) * this.view.scale, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
  }

  renderNodeTab() {
    if (this.tool === 'zones') return this.renderZoneTab();
    if (this.tool === 'kerbs') return this.renderKerbTab();
    if (this.tool === 'bars') return this.renderBarrierTab();
    if (this.tool === 'pit') return this.renderPitTab();
    if (this.tool === 'paint') return this.renderPaintTab();
    if (this.tool === 'sculpt') return this.renderSculptTab();
    if (this.tool === 'roads') return this.renderRoadTab();
    if (this.tool === 'props') return this.renderItemTab();
    const el = $('tab-node');
    const P = this.track.points;
    const sel = [...this.sel].filter(i => i < P.length);
    if (!sel.length) {
      el.innerHTML = `<h4>NODE</h4><p class="muted">Select a node on the map (EDIT tool) to change its width, elevation and banking.<br><br>Shift-click or drag a box to select several nodes and edit them all at once.<br><br>Tip: drag nodes in the elevation profile below to sculpt hills.</p>`;
      return;
    }
    const p = P[sel[0]];
    el.innerHTML = `
      <h4>${sel.length > 1 ? sel.length + ' NODES' : 'NODE ' + sel[0]}</h4>
      ${fld('Width', 'n-w', 8, 22, 0.5, p.w, 'm')}
      ${fld('Elevation', 'n-e', 0, Math.max(40, Math.ceil(p.e / 10) * 10 + 20), 0.5, p.e, 'm')}
      ${fld('Banking', 'n-b', -15, 15, 1, p.b, '°')}
      <p class="muted" style="margin-top:-4px">Positive banking raises the right-hand edge (in the direction of travel).</p>
      <div class="seg" style="margin-top:10px">
        ${sel.length === 1 && !this.track.open ? '<button id="n-start">Start Here</button>' : ''}
        <button id="n-flat">Level</button>
        ${sel.some(i => P[i].hi || P[i].ho) ? '<button id="n-curve">Reset Curve</button>' : ''}
        <button id="n-del">Delete</button>
      </div>
      ${sel.length > 1 ? '<div class="seg" style="margin-top:6px"><button id="n-ramp">Ramp Elevation</button><button id="n-smooth">Smooth</button></div>' : ''}`;
    const bind = (id, key) => {
      const inp = $(id), lab = $(id + '-v');
      inp.addEventListener('pointerdown', () => this.push());
      inp.addEventListener('keydown', () => this.push());
      inp.addEventListener('input', () => {
        const v = +inp.value; lab.textContent = v + (key === 'b' ? '°' : 'm');
        sel.forEach(i => P[i][key] = v);
        this.recompute(); this.dirty = true;
      });
      inp.addEventListener('change', () => this.changed());
    };
    bind('n-w', 'w'); bind('n-e', 'e'); bind('n-b', 'b');
    $('n-start') && $('n-start').addEventListener('click', () => { this.push(); lapShift(this.T, this.track, sel[0]); this.track.start = sel[0]; sfx.select(); this.changed(true); this.toast('START/FINISH MOVED'); });
    $('n-flat').addEventListener('click', () => { this.push(); sel.forEach(i => { P[i].b = 0; }); if (sel.length > 1) { const avg = sel.reduce((a, i) => a + P[i].e, 0) / sel.length; sel.forEach(i => P[i].e = Math.round(avg * 2) / 2); } this.changed(true); });
    $('n-del').addEventListener('click', () => this.deleteNodes());
    if ($('n-curve')) $('n-curve').addEventListener('click', () => { this.push(); sel.forEach(i => { delete P[i].hi; delete P[i].ho; }); sfx.move(); this.changed(true); this.renderPanels(); });
    $('n-ramp') && $('n-ramp').addEventListener('click', () => {
      this.push();
      const s = [...sel].sort((a, b) => a - b), a = P[s[0]].e, b = P[s[s.length - 1]].e;
      s.forEach((i, k) => P[i].e = Math.round((a + (b - a) * k / (s.length - 1)) * 2) / 2);
      this.changed(true);
    });
    $('n-smooth') && $('n-smooth').addEventListener('click', () => { this.push(); this.smooth(); });
  }
  syncNodeFields() {
    const sel = [...this.sel];
    if (!sel.length || !$('n-e')) return;
    const p = this.track.points[sel[0]];
    $('n-e').value = p.e; $('n-e-v').textContent = p.e + 'm';
  }

  renderTrackTab() {
    const el = $('tab-track'), env = this.track.env;
    const open = !!this.track.open;
    el.innerHTML = `
      <h4>LAYOUT</h4>
      <div class="fld"><div class="seg" id="t-layout"><button data-v="loop" class="${!open ? 'on' : ''}">Circuit (loop)</button><button data-v="open" class="${open ? 'on' : ''}">Point-to-point</button></div></div>
      <p class="muted" style="margin-top:-4px">${open ? 'Starts at the first node (green) and finishes at the last (red). One run, no laps and no pit lane; a grid behind the start and a run-off past the finish are added for you.' : 'The end joins back to the start. Switch to point-to-point to race from one place to another.'}</p>
      <h4>RACE</h4>
      ${open ? '' : fld('Laps', 't-laps', 1, 20, 1, env.laps, '')}
      ${fld('Opponents', 't-opp', 0, 11, 1, env.opponents, '')}
      <h4 style="margin-top:18px">${open ? 'TRACK' : 'CIRCUIT'}</h4>
      ${fld('Runoff width', 't-run', 2, 30, 1, env.runoff, 'm')}
      <div class="fld"><label>Runoff</label><div class="seg" id="t-rstyle">${Object.entries(RUNOFF_STYLES).map(([k, v]) => `<button data-v="${k}" class="${(env.runoffStyle || 'auto') === k ? 'on' : ''}">${v.label}</button>`).join('')}</div></div>
      <p class="muted" style="margin-top:-4px">${(() => { const st = runoffStyle(env); return (env.runoffStyle || 'auto') === 'auto' ? (st === 'none' ? (env.theme === 'city' ? 'Auto: a street circuit keeps its concrete.' : 'Auto: under 6 m of runoff it\'s a road, so plain ground beside it.') : 'Auto: ' + RUNOFF_STYLES[st].hint) : RUNOFF_STYLES[st].hint; })()} Fast corners get more room. Paint Paved or Gravel to change it anywhere.</p>
      <div class="fld"><label>Barriers</label><div class="seg" id="t-bar">${['tires', 'armco', 'concrete'].map(b => `<button data-v="${b}" class="${env.barrier === b ? 'on' : ''}">${b}</button>`).join('')}</div></div>
      ${env.barrier === 'tires' ? '' : fld('Catch fence', 't-fence', 0, 6, 0.25, fenceHeight(env), 'm')}
      <div class="fld"><label>Circuit lights</label><div class="seg" id="t-lights">${[['masts', 'Lamp posts'], ['banners', 'Banner posts'], ['off', 'Off']].map(([v, l]) => `<button data-v="${v}" class="${(env.circuitLights || 'masts') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="muted" style="margin-top:-4px">${{ masts: 'Tall lamps along the circuit, lit at night.', banners: 'Lamp posts with sponsor banners along the circuit (your logos too), lit at night.', off: 'No lamps along the circuit: just your own lights and floodlights.' }[env.circuitLights || 'masts']}</p>
      ${open ? '' : `<div class="fld"><label>Pit lane</label><div class="seg" id="t-pit">${[['1', 'On'], ['0', 'Off']].map(([v, l]) => `<button data-v="${v}" class="${(env.pits !== false) === (v === '1') ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="fld"><label>Pit side</label><div class="seg" id="t-pitside">${['auto', 'left', 'right'].map(v => `<button data-v="${v}" class="${(env.pitSide || 'auto') === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>`}
      <div class="fld"><label>Sidewalks</label><div class="seg" id="t-walk"><button data-v="1" class="${env.walks ? 'on' : ''}">On</button><button data-v="0" class="${!env.walks ? 'on' : ''}">Off</button></div></div>
      ${env.walks ? fld('Sidewalk width', 't-walkw', 1.5, 5, 0.25, env.walkW || 2.5, 'm') : ''}
      <div class="fld"><label>Surface</label><div class="seg" id="t-surf"><button data-v="asphalt" class="${env.surface !== 'dirt' ? 'on' : ''}">Asphalt</button><button data-v="dirt" class="${env.surface === 'dirt' ? 'on' : ''}">Dirt</button></div></div>
      ${env.surface === 'dirt' ? '<p class="muted" style="margin-top:-4px">Loose dirt: about two thirds of the grip, slides and dust. No kerbs. The pit lane and paved runoff stay paved.</p>' : ''}
      ${env.surface === 'dirt' ? '' : `<div class="fld"><label>Curbs</label><div class="seg" id="t-kerb"><button data-v="1" class="${env.kerbs !== false ? 'on' : ''}">On</button><button data-v="0" class="${env.kerbs === false ? 'on' : ''}">Off</button></div></div>`}
      ${fld('Draw width', 't-dw', 8, 22, 0.5, this.defaultWidth, 'm')}
      <div class="seg"><button id="t-allw">Apply Width To All Nodes</button></div>
      <p class="muted" style="margin-top:12px">Draw width is used for new ${open ? 'tracks' : 'circuits'} sketched with the DRAW tool.</p>`;
    const num = (id, fn, unit) => {
      const inp = $(id), lab = $(id + '-v');
      inp.addEventListener('pointerdown', () => this.push());
      inp.addEventListener('input', () => { lab.textContent = inp.value + unit; fn(+inp.value); });
      inp.addEventListener('change', () => this.changed());
    };
    if ($('t-laps')) num('t-laps', v => env.laps = v, '');
    segBind('t-layout', v => this.setLayout(v === 'open'));
    num('t-opp', v => { env.opponents = v; this.dirty = true; }, '');
    num('t-run', v => { env.runoff = v; this.recompute(); this.dirty = true; }, 'm');
    num('t-dw', v => this.defaultWidth = v, 'm');
    segBind('t-bar', v => { this.push(); env.barrier = v; this.changed(true); this.renderTrackTab(); });
    const fh = $('t-fence');
    if (fh) { fh.addEventListener('pointerdown', () => this.push()); fh.addEventListener('input', () => { env.fenceH = +fh.value; $('t-fence-v').textContent = +fh.value ? fh.value + 'm' : 'Off'; }); fh.addEventListener('change', () => this.changed(true)); }
    segBind('t-lights', v => { this.push(); if (v === 'masts') delete env.circuitLights; else env.circuitLights = v; this.changed(true); });
    segBind('t-rstyle', v => { this.push(); if (v === 'auto') delete env.runoffStyle; else env.runoffStyle = v; this.changed(true); });
    segBind('t-kerb', v => { this.push(); env.kerbs = v === '1'; this.changed(true); });
    segBind('t-surf', v => { this.push(); if (v === 'dirt') env.surface = 'dirt'; else delete env.surface; this.changed(true); this.renderTrackTab(); });
    segBind('t-walk', v => { this.push(); env.walks = v === '1'; this.changed(true); });
    const ww = $('t-walkw');
    if (ww) { ww.addEventListener('pointerdown', () => this.push()); ww.addEventListener('input', () => { env.walkW = +ww.value; $('t-walkw-v').textContent = ww.value + 'm'; }); ww.addEventListener('change', () => this.changed(true)); }
    segBind('t-pit', v => { this.push(); env.pits = v === '1'; this.changed(true); });
    segBind('t-pitside', v => { this.push(); env.pitSide = v; this.changed(true); });
    $('t-allw').addEventListener('click', () => { this.push(); this.track.points.forEach(p => p.w = this.defaultWidth); this.changed(true); this.toast('WIDTH APPLIED'); });
  }

  // circuit <-> point-to-point. Going open, the start node becomes the first node (so the road starts where the
  // start line was); going back to a loop, the last node joins the first again.
  setLayout(open) {
    const t = this.track;
    if (!!t.open === open) return;
    this.push();
    if (open && t.points.length) { const k = ((t.start || 0) % t.points.length + t.points.length) % t.points.length; t.points = [...t.points.slice(k), ...t.points.slice(0, k)]; }
    t.open = open; t.start = 0;
    this.sel.clear();
    this.changed(true); this.setTool(this.tool);
    this.toast(open ? 'POINT-TO-POINT · START GREEN, FINISH RED' : 'CIRCUIT · THE END JOINS THE START');
  }

  renderWorldTab() {
    const el = $('tab-world'), env = this.track.env, st = settingOf(env);
    el.innerHTML = `
      <h4>LOCATION</h4>
      <div class="fld"><div class="seg" id="w-theme">${Object.entries(THEMES).map(([k, v]) => `<button data-v="${k}" class="${env.theme === k ? 'on' : ''}">${v.label}</button>`).join('')}</div></div>
      <h4>TIME OF DAY</h4>
      <div class="fld"><div class="seg" id="w-time">${['day', 'dusk', 'night'].map(k => `<button data-v="${k}" class="${env.time === k ? 'on' : ''}">${k}</button>`).join('')}</div></div>
      <h4>WEATHER</h4>
      <div class="fld"><div class="seg" id="w-weather">${['clear', 'overcast', 'rain', 'fog'].map(k => `<button data-v="${k}" class="${env.weather === k ? 'on' : ''}">${k}</button>`).join('')}</div></div>
      <h4>SETTING</h4>
      ${envReady() ? `<div class="seg set-cards" id="w-set">${SETTING_KEYS.map(k => `<button data-v="${k}" class="${st.kind === k ? 'on' : ''}">${SETTINGS[k].label}</button>`).join('')}</div>
      <p class="muted">${SETTINGS[st.kind].desc}</p>
      ${st.kind !== 'none' ? `
        ${fld('Density', 'w-sd', 0, 1, 0.05, st.density, '')}
        ${fld('Building height', 'w-sh', 0, 1, 0.05, st.height, '')}
        ${SETTINGS[st.kind].front && Object.keys(SETTINGS[st.kind].front).length ? `
        ${fld('Spacing between buildings', 'w-sgap', 0, 20, 0.5, st.gap ?? SETTINGS[st.kind].gapM ?? 3, 'm')}
        ${fld('Setback from the road', 'w-ssb', 0, 25, 0.5, st.setback ?? SETTINGS[st.kind].setback ?? 6, 'm')}
        ${fld('Alleys', 'w-sal', 0, 1, 0.05, st.alleys ?? SETTINGS[st.kind].alleysD ?? 0.2, '')}
        <p class="muted" style="margin-top:-4px">Spacing 0 = buildings wall to wall. Alleys open up between buildings, with dumpsters, bin bags, bins and payphones.</p>
        <div class="fld"><label>Behind the pit lane</label><div class="seg" id="w-spit"><button data-v="1" class="${st.pitBuildings ? 'on' : ''}">Buildings</button><button data-v="0" class="${!st.pitBuildings ? 'on' : ''}">Keep clear</button></div></div>` : ''}
        ${fld('Greenery', 'w-sg', 0, 1, 0.05, st.green, '')}
        ${fld('Street furniture', 'w-sf', 0, 1, 0.05, st.furniture, '')}
        ${fld('Litter &amp; trash', 'w-sl', 0, 1, 0.05, st.litter, '')}
        ${fld('Street trees', 'w-st', 0, 1, 0.05, st.streetTrees, '')}
        ${fld('Ambient life', 'w-sa', 0, 1, 0.05, st.life, '')}
        <p class="muted" style="margin-top:-4px">Ambient life: paper blowing along the sidewalks (cars kick it up), steam from vents, pigeons, glowing vending machines and signs at night.</p>
        <div class="seg"><button id="w-reroll">&#8635; New Layout</button>${SETTINGS[st.kind].streets ? `<button id="w-streets" class="${st.streets !== false ? 'on' : ''}">Town streets: ${st.streets !== false ? 'On' : 'Off'}</button>` : ''}</div>
        <p class="muted">Every building can be clicked with the PROPS tool to move, turn or delete it. Your own zones, roads and imported buildings stay; the setting fills in around them.</p>` : ''}
      <h4>TREES</h4>
      <div class="seg set-cards" id="w-flora">${FLORA_KEYS.filter(k => !FLORA[k].brush).map(k => `<button data-v="${k}" class="${(st.flora || 'auto') === k ? 'on' : ''}">${FLORA[k].label}</button>`).join('')}</div>
      <p class="muted">The trees ${st.kind === 'none' ? 'around the circuit' : 'in this setting'}, zone tree lines and map trees, with grass, flowers, shrubs or rocks under them. Paint extra with the PAINT tool's <b>Nature</b> brush, or place single trees with PROPS.</p>
      <div class="fld" style="margin-top:8px"><label>Zone &amp; map buildings</label><div class="seg" id="w-models"><button data-v="1" class="${st.models ? 'on' : ''}">PS1 models</button><button data-v="0" class="${!st.models ? 'on' : ''}">Plain blocks</button></div></div>
      <p class="muted" style="margin-top:-4px">Houses are always PSX houses, each with its own walls, roof and paint (click one with PROPS to repaint it).</p>`
      : '<p class="muted">Scenery models are still loading…</p>'}
      <h4>SCENERY</h4>
      ${fld('Auto scenery density', 'w-den', 0, 1, 0.05, env.scenery, '')}
      <p class="muted">${st.kind === 'none' ? 'Trees, buildings, grandstands and billboards are generated automatically around the circuit.' : 'Grandstands and billboards around the circuit.'} Use the PROPS tool to hand-place extra items.</p>
      <div class="seg" style="margin-top:8px"><button id="w-clear">Clear All Props (${this.track.props.length})</button></div>
      <p class="muted" style="margin-top:14px">Rain reduces grip by ~18%. Night races are floodlit.</p>`;
    segBind('w-theme', v => {
      this.push(); env.theme = v; env.runoff = THEMES[v].runoff; env.barrier = THEMES[v].barrier;
      this.changed(true); this.toast(THEMES[v].label.toUpperCase() + ' · RUNOFF & BARRIERS UPDATED');
    });
    segBind('w-time', v => { this.push(); env.time = v; this.changed(true); });
    segBind('w-weather', v => { this.push(); env.weather = v; this.changed(true); });
    const d = $('w-den');
    d.addEventListener('pointerdown', () => this.push());
    d.addEventListener('input', () => { env.scenery = +d.value; $('w-den-v').textContent = (+d.value).toFixed(2); });
    d.addEventListener('change', () => this.changed());
    $('w-clear').addEventListener('click', () => { if (!this.track.props.length) return; this.push(); this.track.props = []; this.track.propLines = []; this.selProp = -1; this.selLine = null; this.changed(true); });
    // setting: pick one (the ground / location follows it), tune it, reroll it
    const setSet = (patch, panels = false) => { env.setting = { ...settingOf(env), ...patch }; this.changed(panels); this.scheduleScenery(0); };
    segBind('w-set', v => {
      this.push();
      const S = SETTINGS[v], patch = { kind: v };
      if (v !== 'none' && settingOf(env).kind === 'none') patch.seed = 1 + Math.floor(Math.random() * 9999);
      if (S.theme && S.theme !== env.theme) { env.theme = S.theme; env.runoff = THEMES[S.theme].runoff; env.barrier = THEMES[S.theme].barrier; }
      setSet(patch, true);
      this.toast(S.label.toUpperCase() + (v !== 'none' ? ' · CLICK NEW LAYOUT TO REROLL' : ''));
    });
    for (const [id, key, unit] of [['w-sgap', 'gap', 'm'], ['w-ssb', 'setback', 'm'], ['w-sal', 'alleys'], ['w-sd', 'density'], ['w-sh', 'height'], ['w-sg', 'green'], ['w-sf', 'furniture'], ['w-sl', 'litter'], ['w-st', 'streetTrees'], ['w-sa', 'life']]) {
      const e = $(id); if (!e) continue;
      e.addEventListener('pointerdown', () => this.push());
      e.addEventListener('input', () => { $(id + '-v').textContent = unit ? (+e.value) + unit : (+e.value).toFixed(2); });
      e.addEventListener('change', () => setSet({ [key]: +e.value }));
    }
    $('w-reroll') && $('w-reroll').addEventListener('click', () => { this.push(); setSet({ seed: 1 + Math.floor(Math.random() * 99999) }); sfx.place(); });
    $('w-streets') && $('w-streets').addEventListener('click', () => { this.push(); setSet({ streets: settingOf(env).streets === false }, true); });
    segBind('w-models', v => { this.push(); setSet({ models: v === '1' }); });
    segBind('w-flora', v => { this.push(); setSet({ flora: v }, true); this.toast(FLORA[v].label.toUpperCase() + ' TREES'); });
    segBind('w-spit', v => { this.push(); setSet({ pitBuildings: v === '1' }); });
  }

  refreshStats() {
    if (!this.T) {
      const n = this.track.points.length, need = minNodes(this.track);
      $('ed-stats').innerHTML = `NODES <b>${n}</b> &middot; PROPS <b>${this.track.props.length}</b>
        <div class="warn">! No track yet${n ? ` (${n} of ${need} nodes)` : ''}. Use <b>DRAW</b> to sketch a new ${this.track.open ? 'road from start to finish' : 'loop'}, or click the map with <b>EDIT</b> to place nodes. You can't save, test or race until it has ${need}+ nodes.</div>`;
      return;
    }
    const s = trackStats(this.T);
    const bridges = Array.from(this.A.BRIDGE).filter(Boolean).length * this.T.ds;
    $('ed-stats').innerHTML = `
      LENGTH <b>${(s.length / 1000).toFixed(2)} km</b> &middot; CORNERS <b>${s.turns}</b><br>
      ELEVATION <b>${Math.round(s.elevMin) || 0}–${Math.round(s.elevMax) || 0} m</b> &middot; BRIDGES <b>${bridges ? Math.round(bridges) + ' m' : 'none'}</b><br>
      NODES <b>${this.track.points.length}</b> &middot; PROPS <b>${this.track.props.length}</b><br>
      ${this.scen ? `BUILDINGS <b>${this.scen.buildings.length}</b> &middot; TREES <b>${this.scen.trees.length}</b>${this.scen.rejected.length ? ` <span style="color:var(--sv-bad)">(${this.scen.rejected.length} on track, removed)</span>` : ''}<br>` : ''}
      ${this.T.open ? 'POINT-TO-POINT &middot; ONE RUN' : `PIT LANE <b>${this.pit ? Math.round(this.pit.length) + ' m (' + (this.pit.side > 0 ? 'right' : 'left') + ')' : 'none'}</b>`}<br>
      ${this.T.open ? 'EST. RUN' : 'EST. LAP'} <b>${this.lapEst ? fmtTime(this.lapEst) : '…'}</b>
      ${(this.problems || []).map((p, k) => `<div class="warn${k === this.probAt ? ' on' : ''}">${k + 1}. ${p.text}</div>`).join('')}`;
  }
}
installKerbTool(Editor);
installBarrierTool(Editor);
installView3d(Editor);
installPitTool(Editor);
installPaintShapes(Editor);
installCheck(Editor);
installShare(Editor);
installPad(Editor); // (last: it wraps draw() to put the pad's cursor on top)

function fld(label, id, min, max, step, val, unit) {
  return `<div class="fld"><label>${label}<span id="${id}-v">${val}${unit}</span></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
}
function segBind(id, fn) {
  document.querySelectorAll('#' + id + ' button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#' + id + ' button').forEach(x => x.classList.toggle('on', x === b));
    sfx.move(); fn(b.dataset.v);
  }));
}
// distance from (x, z) to the segment a-b ([x, z] each)
function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
