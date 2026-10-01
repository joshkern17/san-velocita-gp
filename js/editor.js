// Top-down circuit designer
import { sampleTrack, analyzeTrack, buildPitLane, computeRacingLine, computeSpeedProfile, trackStats, cloneTrack, newTrack, presetTracks, archivedTracks, THEMES, PROP_TYPES, PAINTS, defaultEnv, trackReady, minNodes } from './track.js';
import { CARSPEC } from './car.js';
import { sfx } from './audio.js';
import { fmtTime } from './hud.js';
import { ZONE_TYPES, STYLE_COLORS, newZone, collectScenery, BUSINESSES, BUSINESS_KEYS, pointInPoly, centroid } from './zones.js';
import { ROAD_TYPES, MEET, newRoad, roadLayout, applyRoadsToCircuit, raiseTrackOverRoads } from './roads.js';
import { SETTINGS, SETTING_KEYS, settingOf, FLORA, FLORA_KEYS } from './scenery.js';
import { envReady } from './envlib.js';
import { TileLayer, MAP_STYLES, searchPlace, myLocation, importOSM } from './geo.js';
import { fetchElevation, packTerrain, projectOntoTrack, rawHeight, inGrid, EXAG_MAX, TERRAIN_ATTR } from './terrain.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const THEME_BG = { grass: '#142417', desert: '#2a1f14', city: '#16181e', coast: '#0c2030' };
const THEME_RUN = { grass: 'rgba(96,150,70,0.55)', desert: 'rgba(200,150,90,0.5)', city: 'rgba(150,150,150,0.45)', coast: 'rgba(210,190,130,0.45)' };

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
    this.propType = 'tree';
    this.propRot = 0;
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
    this.zoneDef = newZone('houses', []);
    this.scen = null;
    this.bindUI();
  }

  // ---------------- lifecycle ----------------
  open(track) {
    this.active = true;
    this.track = cloneTrack(track || this.loadWork() || presetTracks()[0]);
    this.normalize(this.track);
    this.history = []; this.future = [];
    this.sel.clear(); this.selProp = -1;
    $('ed-name').value = this.track.name;
    this.setTool(this.tool);
    this.recompute(true);
    this.needFit = true;
    requestAnimationFrame(() => { this.resize(); if (this.W > 50 && this.H > 50) { this.needFit = false; this.fit(); } this.renderPanels(); });
    this.loop();
  }
  close() { this.active = false; this.saveWork(); }

  normalize(t) {
    t.env = { ...defaultEnv(t.env?.theme || 'grass'), ...(t.env || {}) };
    t.props = t.props || [];
    t.zones = t.zones || [];
    t.paint = t.paint || [];
    t.roads = t.roads || []; t.hidden = t.hidden || []; t.buildings = t.buildings || [];
    t.map = { style: 'satellite', opacity: 0.8, ...(t.map || {}) };
    t.start = t.start || 0;
    t.points = t.points.map(p => ({ x: +p.x, z: +p.z, w: +(p.w ?? 13), e: +(p.e ?? 0), b: +(p.b ?? 0) }));
  }

  loop() {
    if (!this.active) return;
    if (this.dirty) { this.draw(); this.drawProfile(); this.dirty = false; }
    requestAnimationFrame(() => this.loop());
  }

  loadWork() { try { return JSON.parse(localStorage.getItem('svgp.editorWork')); } catch (e) { return null; } }
  saveWork() { try { localStorage.setItem('svgp.editorWork', JSON.stringify(this.track)); } catch (e) {} }

  // ---------------- history ----------------
  snapshot() { return { j: JSON.stringify({ ...this.track, osm: null }), osm: this.track.osm }; }
  restore(sn) { const t = JSON.parse(sn.j); t.osm = sn.osm; return t; }
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
    if (this.selZone >= this.track.zones.length) this.selZone = -1;
    $('ed-name').value = this.track.name;
    this.changed(true);
    this.setTool(this.tool);
  }

  changed(panels = false) {
    this.recompute();
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
      this.refreshStats();
      if (fit) this.fit();
      return;
    }
    try {
      this.T = sampleTrack(t);
      raiseTrackOverRoads(t, this.T);
      this.A = analyzeTrack(this.T, t.env);
      this.pit = buildPitLane(this.T, this.A, t.env);
      this.A.pit = this.pit;
      applyRoadsToCircuit(t, this.T, this.A);
    } catch (e) { console.error(e); this.T = this.A = this.pit = null; this.chunks = []; return; }
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
      this.lapEst = computeSpeedProfile(this.T, O, { mu: CARSPEC.mu * 0.97, kdm: CARSPEC.kd / CARSPEC.mass, vmax: 92 }).lapEstimate;
      this.refreshStats();
    }, 300);
    if (fit) this.fit();
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
    document.querySelectorAll('#s-editor [data-act]').forEach(b => b.addEventListener('click', () => this.action(b.dataset.act)));
    document.querySelectorAll('.ed-tabs button').forEach(b => b.addEventListener('click', () => this.showTab(b.dataset.tab)));
    $('ed-name').addEventListener('input', (e) => { this.track.name = e.target.value || 'Untitled'; this.saveWork(); });
    $('ed-file').addEventListener('change', (e) => this.importFile(e.target.files[0]));

    const pal = $('ed-palette');
    pal.innerHTML = Object.entries(PROP_TYPES).map(([k, v]) => `<button data-prop="${k}"><i style="background:${v.color}"></i>${v.label}</button>`).join('');
    pal.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { this.propType = b.dataset.prop; this.updatePalette(); sfx.move(); }));

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

  setTool(t) {
    this.tool = t;
    this.placing = false;
    document.querySelectorAll('#s-editor [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    $('ed-palette').classList.toggle('on', t === 'props');
    const nb = document.querySelector('.ed-tabs [data-tab="node"]');
    if (nb) nb.textContent = t === 'zones' ? 'ZONE' : t === 'paint' ? 'PAINT' : t === 'roads' ? 'ROAD' : t === 'props' ? 'ITEM' : 'NODE';
    if (t === 'zones' || t === 'paint' || t === 'roads' || t === 'props') { this.showTab('node'); }
    if (this.track) this.renderNodeTab();
    this.updatePalette();
    const hints = {
      draw: '<b>DRAW</b> &mdash; hold the left mouse button and sketch a loop. Release to turn it into a circuit. The end joins back to the start automatically.',
      edit: '<b>EDIT</b> &mdash; drag nodes to reshape. <b>Double-click</b> the road to add a node, <b>DEL</b> removes. <b>Shift</b>+click or drag a box to multi-select, then tune width / elevation / banking on the right.',
      props: '<b>PROPS</b> &mdash; pick an item below and click to place. Click any <b>building</b> (zones, imported, placed) to select it: drag to move, <b>Q/E</b> rotate, <b>DEL</b> removes. Right-click removes a prop.',
      pan: '<b>PAN</b> &mdash; drag to move the map. Scroll to zoom. (Right-drag pans in every tool.)',
      roads: '<b>ROADS</b> &mdash; drag to draw a street. Click a road to select it: drag its <b>nodes</b> to reshape it, <b>double-click</b> the road to add a node, <b>DEL</b> removes the picked node (or the road). Drag the road itself to move it.',
      paint: '<b>PAINT</b> &mdash; drag to paint <b>grass</b> onto the ground, or pick <b>Nature</b> to paint trees and plants (cherry blossom, pine forest, autumn, meadow, rocks...). Cars on painted grass get grass grip. <b>Erase</b> removes paint and nature. Brush size on the right, <b>[ ]</b> to resize.',
      zones: '<b>ZONES</b> &mdash; draw a line and buildings spawn along it. Pick the type, height, spacing and side on the right. Click a zone line to select it, drag to move it, <b>DEL</b> removes.',
    };
    if (this.track && this.track.open) {
      hints.draw = '<b>DRAW</b> &mdash; hold the left mouse button and sketch the road from the <b>start</b> to the <b>finish</b>. Release to turn it into a point-to-point track. A grid behind the start and a run-off past the finish are added for you.';
      hints.edit = hints.edit.replace('<b>Double-click</b> the road to add a node', '<b>Double-click</b> the road to add a node (on the run-off or behind the start to extend the track)');
    }
    this.hints = hints;
    this.setHint();
    this.canvas.style.cursor = t === 'pan' ? 'grab' : t === 'draw' || t === 'paint' || t === 'roads' ? 'crosshair' : 'default';
    this.dirty = true;
  }
  setHint() {
    const t = this.track, h = { ...this.hints };
    if (t && !trackReady(t)) h.edit = `<b>EDIT</b> &mdash; no track yet. <b>Click</b> the map to place nodes (${minNodes(t)} or more), or use <b>DRAW</b> to sketch one.`;
    else if (this.placing) h.edit = `<b>EDIT</b> &mdash; placing nodes: <b>click</b> to add the next one${t.open ? ' (the last one is the finish)' : ''}. Press <b>Enter</b> or <b>Esc</b> when you're done.`;
    $('ed-hint').innerHTML = h[this.tool];
  }
  updatePalette() {
    document.querySelectorAll('#ed-palette button').forEach(b => b.classList.toggle('on', b.dataset.prop === this.propType));
  }
  showTab(t) {
    document.querySelectorAll('.ed-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    ['node', 'track', 'world', 'map'].forEach(k => $('tab-' + k).hidden = k !== t);
  }

  toast(msg) {
    const e = $('ed-toast'); e.textContent = msg; e.classList.add('on');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => e.classList.remove('on'), 1600);
  }

  // ---------------- actions ----------------
  action(a) {
    const t = this.track;
    sfx.select();
    switch (a) {
      case 'new': this.push(); { const n = newTrack('New Circuit'); n.env = { ...t.env }; if (t.open) { n.open = true; n.points = []; } this.track = n; } $('ed-name').value = this.track.name; this.sel.clear(); this.selProp = -1; this.changed(true); this.fit(); this.setTool('draw'); this.toast(this.track.open ? 'NEW TRACK — DRAW IT FROM START TO FINISH' : 'NEW CIRCUIT — DRAW A LOOP'); break;
      case 'presets': this.modalList('Presets', [
        ...presetTracks().map(p => ({ title: p.name, desc: p.desc || `${THEMES[p.env.theme].label} · ${p.env.time} · ${p.env.weather}`, pick: () => this.load(p) })),
        ...archivedTracks().map(p => ({ title: p.name + ' (archived)', desc: `Old built-in ${p.open ? 'track' : 'circuit'} · ${THEMES[p.env.theme].label} · ${p.env.time} · ${p.env.weather}`, pick: () => this.load(p) })),
      ]); break;
      case 'open': this.openModal(); break;
      case 'save': if (this.needTrack('SAVE')) this.save(); break;
      case 'export': if (this.needTrack('EXPORT')) this.exportFile(); break;
      case 'import': $('ed-file').value = ''; $('ed-file').click(); break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'test': if (!this.needTrack('TEST')) break; this.saveWork(); this.cb.onTest(cloneTrack(t)); break;
      case 'race': if (!this.needTrack('RACE')) break; this.saveWork(); this.cb.onRace(cloneTrack(t)); break;
      case 'exit': this.saveWork(); this.cb.onExit(); break;
      case 'smooth': if (!this.needTrack()) break; this.push(); this.smooth(); break;
      case 'simplify': if (!this.needTrack()) break; this.push(); this.simplify(); break;
      case 'reverse': this.push(); t.points.reverse(); t.points.forEach(p => p.b = -p.b); t.start = t.open ? 0 : (t.points.length - 1 - t.start); this.sel.clear(); this.changed(true); this.toast(t.open ? 'DIRECTION REVERSED · START AND FINISH SWAPPED' : 'DIRECTION REVERSED'); break;
      case 'autobank': if (!this.needTrack()) break; this.push(); this.autoBank(); break;
      case 'flatten': this.push(); t.points.forEach(p => { p.e = 0; p.b = 0; }); this.changed(true); this.toast('ELEVATION RESET'); break;
      case 'fit': this.fit(); break;
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

  load(track) {
    this.push();
    this.track = cloneTrack(track);
    this.normalize(this.track);
    $('ed-name').value = this.track.name;
    this.sel.clear(); this.selProp = -1;
    this.closeModal();
    this.changed(true); this.fit();
    this.toast('LOADED: ' + this.track.name.toUpperCase());
  }

  savedList() { try { return JSON.parse(localStorage.getItem('svgp.tracks')) || []; } catch (e) { return []; } }
  save() {
    if (!this.needTrack('SAVE')) return;
    const list = this.savedList();
    const t = cloneTrack(this.track);
    t.saved = Date.now();
    const k = list.findIndex(x => x.name === t.name);
    if (k >= 0) list[k] = t; else list.push(t);
    try { localStorage.setItem('svgp.tracks', JSON.stringify(list)); this.toast('SAVED: ' + t.name.toUpperCase()); }
    catch (e) { sfx.error(); this.toast(t.osm ? 'BROWSER STORAGE FULL — USE EXPORT TO SAVE BIG TOWNS' : 'SAVE FAILED'); }
  }
  openModal() {
    const list = this.savedList();
    if (!list.length) return this.modalList('My Circuits', [], 'No saved circuits yet. Press SAVE to store the current one.');
    this.modalList('My Circuits', list.map((p, i) => ({
      title: p.name, desc: `${THEMES[p.env?.theme || 'grass'].label} · ${new Date(p.saved || 0).toLocaleDateString()}`,
      pick: () => this.load(p),
      del: () => { const l = this.savedList(); l.splice(i, 1); localStorage.setItem('svgp.tracks', JSON.stringify(l)); this.openModal(); },
    })));
  }
  modalList(title, items, empty = '') {
    const box = $('ed-modal-box');
    box.innerHTML = `<h3>${title}</h3>` + (items.length ? items.map((it, i) => `<div class="li" data-i="${i}"><div><div class="t">${esc(it.title)}</div><div class="d">${esc(it.desc)}</div></div>${it.del ? `<button data-del="${i}">Delete</button>` : ''}</div>`).join('') : `<p class="muted">${empty}</p>`) + `<div class="foot"><button data-close>Close</button></div>`;
    $('ed-modal').hidden = false;
    box.querySelectorAll('.li').forEach(el => el.addEventListener('click', (e) => { if (e.target.dataset.del) return; items[+el.dataset.i].pick(); }));
    box.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('Delete this circuit?')) items[+el.dataset.del].del(); }));
    box.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
    $('ed-modal').onclick = (e) => { if (e.target.id === 'ed-modal') this.closeModal(); };
  }
  closeModal() { $('ed-modal').hidden = true; }

  exportFile() {
    const blob = new Blob([JSON.stringify(this.track, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (this.track.name || 'circuit').replace(/[^a-z0-9]+/gi, '_') + '.svgp.json';
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
  simplify() {
    const P = this.track.points;
    let removed = 0;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < P.length && P.length > (this.track.open ? 3 : 6); i++) {
        const n = P.length, a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
        if (i === this.track.start % n) continue;
        if (this.track.open && (i === 0 || i === n - 1)) continue;
        const abx = b.x - a.x, abz = b.z - a.z, bcx = c.x - b.x, bcz = c.z - b.z;
        const l1 = Math.hypot(abx, abz), l2 = Math.hypot(bcx, bcz);
        const cos = (abx * bcx + abz * bcz) / (l1 * l2 + 1e-9);
        if ((cos > 0.985 || l1 < 12) && l1 + l2 < 260 && Math.abs(b.e - (a.e + c.e) / 2) < 1 && Math.abs(b.w - (a.w + c.w) / 2) < 1) {
          P.splice(i, 1); removed++;
          if (this.track.start > i) this.track.start--;
          i--;
        }
      }
    }
    this.sel.clear();
    this.changed(true); this.toast(removed ? `REMOVED ${removed} NODES` : 'ALREADY SIMPLE');
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
  hitProp(wx, wz) {
    const P = this.track.props;
    let best = -1, bd = Infinity;
    for (let i = 0; i < P.length; i++) {
      const r = Math.max(PROP_TYPES[P[i].type]?.r || 3, 8 / this.view.scale);
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
      const h = this.hitProp(wx, wz);
      if (h >= 0) { this.push(); this.track.props.splice(h, 1); this.selProp = -1; sfx.del(); this.changed(); return; }
    }
    if (e.button === 1 || e.button === 2 || this.tool === 'pan' || e.altKey) {
      this.drag = { type: 'pan', sx, sy, cx: this.view.cx, cz: this.view.cz };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    if (this.tool === 'draw') {
      this.drag = { type: 'draw', pts: [[wx, wz]] };
      return;
    }
    if (this.tool === 'edit') {
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
    if (this.tool === 'paint') {
      const kind = this.paintKind || 'grass', stroke = { kind, r: this.brush || 12, pts: [[+wx.toFixed(1), +wz.toFixed(1)]] };
      if (kind === 'flora') Object.assign(stroke, { mix: this.floraMix || 'blossom', d: this.floraDens ?? 0.6, seed: 1 + Math.floor(Math.random() * 1e6) });
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
      } else {
        this.push();
        const [x, z] = this.snapPt(wx, wz);
        let rot = this.propRot;
        if (['grandstand', 'billboard'].includes(this.propType) && this.T) {
          const ns = this.nearestSample(x, z);
          rot = Math.atan2(this.T.X[ns.i] - x, this.T.Z[ns.i] - z);
        }
        this.track.props.push({ type: this.propType, x, z, rot });
        this.selProp = this.track.props.length - 1;
        sfx.place();
        this.changed();
      }
      this.dirty = true;
    }
  }

  onMove(e) {
    if (!this.active) return;
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    this.mouse.x = sx; this.mouse.y = sy;
    this.mouse.inside = sx >= 0 && sy >= 0 && sx <= r.width && sy <= r.height;
    const [wx, wz] = this.s2w(sx, sy);
    this.mouse.wx = wx; this.mouse.wz = wz;
    const d = this.drag;
    if (this.profileDrag) return this.onProfileDrag(e);
    if (!d) { this.hoverNode = this.tool === 'edit' ? this.hitNode(sx, sy) : -1; this.dirty = true; return; }
    if (d.type === 'pan') {
      this.view.cx = d.cx - (sx - d.sx) / this.view.scale;
      this.view.cz = d.cz - (sy - d.sy) / this.view.scale;
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
    } else if (d.type === 'paint') {
      const pts = d.stroke.pts, last = pts[pts.length - 1];
      if (Math.hypot(wx - last[0], wz - last[1]) > Math.max(1, d.stroke.r * 0.35)) pts.push([+wx.toFixed(1), +wz.toFixed(1)]);
    } else if (d.type === 'zdraw') {
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(wx - last[0], wz - last[1]) > 2) d.pts.push([wx, wz]);
    } else if (d.type === 'zmove') {
      if (!d.moved) { this.push(); d.moved = true; }
      const z = this.track.zones[d.i];
      z.pts = d.orig.map(q => [q[0] + wx - d.wx, q[1] + wz - d.wz]);
      this.scheduleScenery(60);
    } else if (d.type === 'draw') {
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(wx - last[0], wz - last[1]) > 2.5) d.pts.push([wx, wz]);
    } else if (d.type === 'nodes') {
      if (!d.moved) { this.push(); d.moved = true; }
      let dx = wx - d.wx, dz = wz - d.wz;
      if (this.snap) {
        const a = d.orig.find(o => o.i === d.anchor);
        const [sx2, sz2] = this.snapPt(a.x + dx, a.z + dz);
        dx = sx2 - a.x; dz = sz2 - a.z;
      }
      for (const o of d.orig) { this.track.points[o.i].x = o.x + dx; this.track.points[o.i].z = o.z + dz; }
      this.recompute();
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
    this.drag = null;
    if (this.profileDrag) { this.profileDrag = null; this.changed(true); return; }
    if (!d) return;
    this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : this.tool === 'draw' ? 'crosshair' : 'default';
    if (d.type === 'rdraw') this.finishRoad(d.pts);
    else if ((d.type === 'rmove' || d.type === 'rnode') && d.moved) { this.changed(); this.scheduleScenery(0); }
    else if (d.type === 'bld' && d.moved) { this.changed(); this.scheduleScenery(0); }
    if (d.type === 'paint') { this.push(); this.track.paint.push(d.stroke); sfx.place(); this.changed(); this.renderNodeTab(); if (this.track.paint.some(s => s.kind === 'flora')) this.scheduleScenery(0); }
    else if (d.type === 'draw') this.finishDraw(d.pts);
    else if (d.type === 'zdraw') this.finishZone(d.pts);
    else if (d.type === 'zmove' && d.moved) this.changed();
    else if (d.type === 'nodes' && d.moved) this.changed(true);
    else if (d.type === 'prop' && d.moved) this.changed();
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
    // RDP
    const eps = 3.5;
    const rdp = (a, b, out) => {
      let md = 0, mi = -1;
      const [ax, az] = sm[a], [bx, bz] = sm[b];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((bx - ax) * (az - sm[i][1]) - (ax - sm[i][0]) * (bz - az)) / L;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps && mi > 0) { rdp(a, mi, out); rdp(mi, b, out); } else out.push(b);
    };
    const keep = [0];
    rdp(0, sm.length - 1, keep);
    let P = keep.map(i => sm[i]);
    // enforce spacing
    const out = [P[0]];
    for (let i = 1; i < P.length; i++) {
      const l = out[out.length - 1];
      const d = Math.hypot(P[i][0] - l[0], P[i][1] - l[1]);
      if (d < 22) continue;
      if (d > 110) { const k = Math.ceil(d / 90); for (let j = 1; j < k; j++) out.push([l[0] + (P[i][0] - l[0]) * j / k, l[1] + (P[i][1] - l[1]) * j / k]); }
      out.push(P[i]);
    }
    if (open) { // keep the very end of the stroke as the finish
      const e = sm[sm.length - 1], l = out[out.length - 1];
      if (Math.hypot(e[0] - l[0], e[1] - l[1]) > 8) { if (out.length > 1 && Math.hypot(e[0] - l[0], e[1] - l[1]) < 22) out[out.length - 1] = e; else out.push(e); }
    } else {
      while (out.length > 4 && Math.hypot(out[out.length - 1][0] - out[0][0], out[out.length - 1][1] - out[0][1]) < 30) out.pop();
      // closing gap
      const l = out[out.length - 1], f = out[0];
      const gap = Math.hypot(f[0] - l[0], f[1] - l[1]);
      if (gap > 110) { const k = Math.ceil(gap / 90); for (let j = 1; j < k; j++) out.push([l[0] + (f[0] - l[0]) * j / k, l[1] + (f[1] - l[1]) * j / k]); }
    }
    if (out.length < minNodes(this.track)) { sfx.error(); this.toast(open ? 'TRY AGAIN — DRAW A LONGER ROAD' : 'TRY AGAIN — NEED A PROPER LOOP'); return; }
    this.push();
    this.track.points = out.map(([x, z]) => { const [sx, sz] = this.snapPt(x, z); return { x: sx, z: sz, w: this.defaultWidth, e: 0, b: 0 }; });
    this.track.start = 0;
    this.sel.clear();
    sfx.select();
    this.changed(true);
    this.toast(`${open ? 'TRACK' : 'CIRCUIT'} CREATED · ${out.length} NODES`);
    this.setTool('edit');
  }

  onKey(e) {
    if (!this.active) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (!$('ed-modal').hidden) { if (e.code === 'Escape') this.closeModal(); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (ctrl && e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
    if (ctrl && e.code === 'KeyS') { e.preventDefault(); this.save(); return; }
    if (ctrl && e.code === 'KeyA' && this.tool === 'edit') { e.preventDefault(); this.track.points.forEach((p, i) => this.sel.add(i)); this.renderPanels(); this.dirty = true; return; }
    if (e.code === 'Digit1') this.setTool('draw');
    if (e.code === 'Digit2') this.setTool('edit');
    if (e.code === 'Digit3') this.setTool('props');
    if (e.code === 'Digit4') this.setTool('zones');
    if (e.code === 'Digit5') this.setTool('pan');
    if (e.code === 'Digit6') this.setTool('paint');
    if (e.code === 'Digit7') this.setTool('roads');
    if (this.tool === 'paint' && (e.code === 'BracketLeft' || e.code === 'BracketRight')) { this.brush = Math.max(2, Math.min(80, (this.brush || 12) * (e.code === 'BracketRight' ? 1.25 : 0.8))); this.renderNodeTab(); this.dirty = true; }
    if (e.code === 'KeyF') this.fit();
    if (e.code === 'KeyG') this.action('grid');
    if ((e.code === 'Escape' || e.code === 'Enter') && this.placing) { this.placing = false; this.setHint(); if (e.code === 'Enter') return; }
    if (e.code === 'Escape') { this.sel.clear(); this.selProp = -1; this.selBld = null; this.selRoad = -1; this.renderPanels(); this.dirty = true; }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      e.preventDefault();
      if (this.tool === 'props' && this.selProp >= 0) { this.push(); this.track.props.splice(this.selProp, 1); this.selProp = -1; sfx.del(); this.changed(); }
      else if (this.tool === 'props' && this.selBld) this.deleteBuilding();
      else if (this.tool === 'roads' && this.selRoad >= 0 && this.selRoadNode >= 0) this.deleteRoadNode();
      else if (this.tool === 'roads' && this.selRoad >= 0) this.deleteRoad();
      else if (this.tool === 'zones' && this.selZone >= 0) this.deleteZone();
      else if (this.sel.size) this.deleteNodes();
    }
    if ((e.code === 'KeyQ' || e.code === 'KeyE') && this.tool === 'props') {
      const d = (e.code === 'KeyQ' ? -1 : 1) * Math.PI / 12;
      if (this.selProp >= 0) { this.push(); this.track.props[this.selProp].rot += d; this.changed(); }
      else if (this.selBld) this.rotateBuilding(d);
      else this.propRot += d;
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
    el.innerHTML = ZONE_TYPES[z.kind].trees ? '' : `<b>${k}</b> buildings in this zone${r ? ` · <span style="color:#ff8a70">${r} skipped (on track)</span>` : ''}`;
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
      <div class="map-cur">${g ? '&#9679; ' + esc(g.label || 'Custom location') + `<br><span style="color:#7f8ca6">${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}</span>` : '<span style="color:#7f8ca6">No real location yet — search for your home town to put the circuit on the map.</span>'}</div>
      <h4 style="margin-top:14px">MAP LAYER</h4>
      <div class="fld"><div class="seg" id="map-style">${[['off', 'Off'], ['streets', 'Streets'], ['satellite', 'Satellite']].map(([k, l]) => `<button data-v="${k}" class="${t.map.style === k ? 'on' : ''}" ${!g && k !== 'off' ? 'disabled' : ''}>${l}</button>`).join('')}</div></div>
      ${fld('Map opacity', 'map-op', 0.1, 1, 0.05, t.map.opacity, '')}
      <h4 style="margin-top:14px">REAL ELEVATION</h4>
      ${this.elevHtml()}
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
      box.innerHTML = '<div class="r" style="color:#7f8ca6;cursor:default">Not the right place? Pick another:</div>' +
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
    t.osm = null;
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
        In game: <b>${st.range.toFixed(0)} m</b> &middot; steepest ${st.grade.toFixed(0)}%${st.grade > 22 ? ' <span style="color:#ff8a5a">(very steep!)</span>' : ''}</div>
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

  // ---------------- main draw ----------------
  draw() {
    const c = this.ctx, T = this.T, A = this.A, t = this.track;
    if (!this.W) return;
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
    // runoff
    c.strokeStyle = THEME_RUN[t.env.theme];
    for (const ch of ground) { c.lineWidth = (ch.w + runoff * 2) * sc; path(ch.idx); c.stroke(); }
    this.drawRoads(c); // (over the runoff: roads run up to the track edge)
    c.lineJoin = 'round'; c.lineCap = 'round';
    // barriers
    const drawBarriers = (chs) => {
      c.lineWidth = Math.max(1.5, 1 * sc);
      c.strokeStyle = t.env.barrier === 'tires' ? '#1a1a1a' : t.env.barrier === 'concrete' ? '#b8b4a8' : '#c8ccd4';
      for (const ch of chs) for (const side of [-1, 1]) {
        const has = side < 0 ? A.HAS_L : A.HAS_R, off = side < 0 ? A.BL : A.BR;
        c.beginPath(); let on = false;
        for (const i of ch.idx) {
          if (!has[i]) { on = false; continue; }
          const s = off[i] * side, [sx, sy] = this.w2s(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s);
          on ? c.lineTo(sx, sy) : c.moveTo(sx, sy); on = true;
        }
        c.stroke();
      }
    };
    drawBarriers(ground);
    this.drawPit(c);
    const drawRoad = (chs, deck) => {
      for (const ch of chs) {
        if (deck) { c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = (ch.w + 8) * sc; path(ch.idx); c.stroke(); }
        c.strokeStyle = '#000'; c.lineWidth = (ch.w + 1.6) * sc + 2; path(ch.idx); c.stroke();
      }
      for (const ch of chs) { c.strokeStyle = deck ? '#565a64' : '#43464e'; c.lineWidth = ch.w * sc; path(ch.idx); c.stroke(); }
      // kerbs
      if (sc > 0.25) for (const ch of chs) for (const side of [-1, 1]) {
        const idx = ch.idx.filter(i => A.KERB[i]);
        if (idx.length < 2) continue;
        c.lineWidth = Math.max(1.5, 1.3 * sc);
        c.setLineDash([]); c.strokeStyle = '#c3221f'; path(idx, side * (T.W[idx[0]] / 2 + 0.65)); c.stroke();
        c.setLineDash([2 * sc, 2 * sc]); c.strokeStyle = '#eee'; c.stroke(); c.setLineDash([]);
      }
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

    this.drawZoneLines(c);
    // props
    this.drawRoadBridges(c);
    t.props.forEach((p, i) => this.drawProp(c, p, i === this.selProp && this.tool === 'props'));
    if (this.tool === 'props' && this.mouse.inside && !this.drag) {
      c.globalAlpha = 0.5;
      const [x, z] = this.snapPt(this.mouse.wx, this.mouse.wz);
      this.drawProp(c, { type: this.propType, x, z, rot: this.propRot }, false);
      c.globalAlpha = 1;
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
        if (sc > 1.1 || s) { c.font = '14px VT323'; c.fillStyle = '#fff'; c.fillText(String(i), x + 8, y - 6); }
        if ((s || h) && (p.e || p.b)) { c.font = '14px VT323'; c.fillStyle = '#ffd66b'; c.fillText(`${p.e.toFixed(1)}m ${p.b ? p.b.toFixed(0) + '°' : ''}`, x + 8, y + 12); }
      });
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
      c.fillStyle = b.biz ? BUSINESSES[b.biz].color : b.lm ? '#b89ad8' : STYLE_COLORS[b.s] || '#999';
      c.globalAlpha = b.from === 'zone' && b.zi === selZ ? 1 : 0.85;
      c.fill();
      c.globalAlpha = 1;
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
    for (let k = idx.length - 1; k >= 0; k--) { const i = idx[k]; const [x, y] = pt(i, p.CEN[i] + p.width / 2); c.lineTo(x, y); }
    c.closePath(); c.fillStyle = '#50535c'; c.fill();
    // garages
    const main = idx.filter(i => !isNaN(p.WALL[i]));
    c.beginPath();
    main.forEach((i, k) => { const [x, y] = pt(i, p.CEN[i] + p.width / 2 + 0.6); k ? c.lineTo(x, y) : c.moveTo(x, y); });
    for (let k = main.length - 1; k >= 0; k--) { const i = main[k]; const [x, y] = pt(i, p.CEN[i] + p.width / 2 + 16.6); c.lineTo(x, y); }
    c.closePath(); c.fillStyle = '#2a2f3a'; c.fill(); c.strokeStyle = '#e8b13a'; c.lineWidth = 1; c.stroke();
    // pit wall
    c.beginPath();
    main.forEach((i, k) => { const [x, y] = pt(i, p.WALL[i]); k ? c.lineTo(x, y) : c.moveTo(x, y); });
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

  drawProp(c, p, sel) {
    const def = PROP_TYPES[p.type]; if (!def) return;
    const sc = this.view.scale;
    const [x, y] = this.w2s(p.x, p.z);
    c.save(); c.translate(x, y); c.rotate(-(p.rot || 0));
    c.lineWidth = 2; c.strokeStyle = sel ? '#ffd66b' : '#000';
    c.fillStyle = def.color;
    if (def.w) {
      const w = Math.max(6, def.w * sc), d = Math.max(4, def.d * sc);
      c.fillRect(-w / 2, -d / 2, w, d); c.strokeRect(-w / 2, -d / 2, w, d);
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
    const area = t.paint.filter(s => s.kind === 'grass').length, nat = t.paint.filter(s => s.kind === 'flora').length;
    const mix = this.floraMix || 'blossom', dens = this.floraDens ?? 0.6;
    el.innerHTML = `
      <h4>PAINT</h4>
      <div class="fld"><label>Brush</label><div class="seg" id="p-kind">${[...Object.entries(PAINTS).map(([k, v]) => [k, v.label]), ['flora', 'Nature'], ['erase', 'Erase']].map(([k, l]) => `<button data-v="${k}" class="${kind === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${kind === 'flora' ? `
      <div class="fld"><label>Mix</label><div class="seg" id="p-mix">${FLORA_KEYS.filter(k => k !== 'auto').map(k => `<button data-v="${k}" class="${mix === k ? 'on' : ''}"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;background:${FLORA[k].color}"></i>${FLORA[k].label}</button>`).join('')}</div></div>
      ${fld('Density', 'p-d', 0.05, 1, 0.05, dens, '')}` : ''}
      ${fld('Brush size', 'p-r', 2, 80, 1, Math.round(r), 'm')}
      <p class="muted">${area} grass stroke${area === 1 ? '' : 's'}, ${nat} nature stroke${nat === 1 ? '' : 's'}. Painted grass has grass grip when you run wide. Nature paints trees with grass, flowers, shrubs or rocks under them &mdash; never on the track or roads.${envReady() ? '' : ' (Scenery models are still loading.)'}</p>
      <div class="seg"><button id="p-undo">Undo Last Stroke</button><button id="p-clear">Clear All Paint</button></div>`;
    document.querySelectorAll('#p-kind button').forEach(b => b.addEventListener('click', () => { this.paintKind = b.dataset.v; sfx.move(); this.renderPaintTab(); }));
    document.querySelectorAll('#p-mix button').forEach(b => b.addEventListener('click', () => { this.floraMix = b.dataset.v; sfx.move(); this.renderPaintTab(); }));
    const pd = $('p-d'); if (pd) pd.addEventListener('input', () => { this.floraDens = +pd.value; $('p-d-v').textContent = (+pd.value).toFixed(2); });
    const pr = $('p-r'); pr.addEventListener('input', () => { this.brush = +pr.value; $('p-r-v').textContent = pr.value + 'm'; this.dirty = true; });
    $('p-undo').addEventListener('click', () => { if (!t.paint.length) return; this.push(); t.paint.pop(); sfx.del(); this.changed(); this.renderPaintTab(); this.scheduleScenery(0); });
    $('p-clear').addEventListener('click', () => { if (!t.paint.length) return; this.push(); t.paint = []; sfx.del(); this.changed(); this.renderPaintTab(); this.scheduleScenery(0); this.toast('PAINT CLEARED'); });
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
  renderItemTab() {
    const el = $('tab-node'), t = this.track, s = this.selBld;
    const hiddenN = t.hidden.length;
    if (!s) {
      el.innerHTML = `<h4>ITEMS</h4><p class="muted">Pick a prop below and click the map to place it.<br><br>Click any <b>building</b> (from a zone, an OpenStreetMap import or one you've edited) to select it: drag to move it, <b>Q/E</b> to rotate, <b>DEL</b> to remove.</p>
        ${hiddenN ? `<div class="seg"><button id="i-restore">Restore ${hiddenN} removed / edited original${hiddenN > 1 ? 's' : ''}</button></div>` : ''}`;
      $('i-restore') && $('i-restore').addEventListener('click', () => { this.push(); t.hidden = []; t.buildings = []; this.changed(); this.scheduleScenery(0); this.renderItemTab(); this.toast('ORIGINAL BUILDINGS RESTORED'); });
      return;
    }
    const b = s.from === 'custom' ? t.buildings[s.ci] : this.scen?.buildings.find(q => q.key === s.key);
    if (!b) { this.selBld = null; return this.renderItemTab(); }
    const what = b.biz ? BUSINESSES[b.biz].label : b.lm ? 'Landmark' : ({ house: 'House', shop: 'Shop', apartment: 'Apartments', office: 'Office', tower: 'Skyscraper', warehouse: 'Warehouse' }[b.s] || 'Building');
    el.innerHTML = `<h4>${what.toUpperCase()}</h4>
      <p class="muted">${s.from === 'zone' ? 'From a zone' : s.from === 'osm' ? 'Imported from OpenStreetMap' : s.from === 'gen' ? 'From the setting' : 'Edited building'}${b.m ? ` &middot; model <b>${esc(b.m)}</b>` : ''}. Drag it on the map to move it.</p>
      ${b.biz ? '' : fld('Height', 'b-h', 3, 200, 1, Math.round(b.h), 'm')}
      <div class="seg"><button id="b-l">&#10226; Rotate 15&deg;</button><button id="b-r">Rotate 15&deg; &#10227;</button></div>
      <div class="seg" style="margin-top:8px"><button id="b-del">Delete Building</button></div>`;
    $('b-l').addEventListener('click', () => this.rotateBuilding(-Math.PI / 12));
    $('b-r').addEventListener('click', () => this.rotateBuilding(Math.PI / 12));
    $('b-del').addEventListener('click', () => this.deleteBuilding());
    const bh = $('b-h');
    if (bh) {
      bh.addEventListener('pointerdown', () => { this.push(); this.detachSel(); });
      bh.addEventListener('input', () => { const nb = t.buildings[this.detachSel()]; if (nb) nb.h = +bh.value; $('b-h-v').textContent = bh.value + 'm'; });
      bh.addEventListener('change', () => { this.changed(); this.scheduleScenery(0); });
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
      g.globalCompositeOperation = s.kind === 'erase' ? 'destination-out' : 'source-over';
      g.strokeStyle = s.kind === 'erase' ? '#000' : s.kind === 'flora' ? (FLORA[s.mix] || FLORA.mixed).color : (PAINTS[s.kind] || PAINTS.grass).color.replace(/[\d.]+\)$/, '1)');
      g.lineWidth = Math.max(1, s.r * 2 * this.view.scale);
      g.beginPath();
      s.pts.forEach((p, k) => { const [x, y] = this.w2s(p[0], p[1]); k ? g.lineTo(x, y) : g.moveTo(x, y); });
      if (s.pts.length === 1) { const [x, y] = this.w2s(s.pts[0][0], s.pts[0][1]); g.lineTo(x + 0.01, y); }
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.62; c.drawImage(L, 0, 0); c.restore();
    // brush outline under the mouse
    if (this.tool === 'paint' && this.mouse.inside) {
      const [x, y] = this.w2s(this.mouse.wx, this.mouse.wz);
      c.strokeStyle = (this.paintKind || 'grass') === 'erase' ? '#ff8a5a' : this.paintKind === 'flora' ? (FLORA[this.floraMix || 'blossom'] || FLORA.mixed).color : '#bfff9a'; c.lineWidth = 1.5; c.setLineDash([4, 3]);
      c.beginPath(); c.arc(x, y, (this.brush || 12) * this.view.scale, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
  }

  renderNodeTab() {
    if (this.tool === 'zones') return this.renderZoneTab();
    if (this.tool === 'paint') return this.renderPaintTab();
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
    $('n-start') && $('n-start').addEventListener('click', () => { this.push(); this.track.start = sel[0]; sfx.select(); this.changed(true); this.toast('START/FINISH MOVED'); });
    $('n-flat').addEventListener('click', () => { this.push(); sel.forEach(i => { P[i].b = 0; }); if (sel.length > 1) { const avg = sel.reduce((a, i) => a + P[i].e, 0) / sel.length; sel.forEach(i => P[i].e = Math.round(avg * 2) / 2); } this.changed(true); });
    $('n-del').addEventListener('click', () => this.deleteNodes());
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
      <div class="fld"><label>Barriers</label><div class="seg" id="t-bar">${['tires', 'armco', 'concrete'].map(b => `<button data-v="${b}" class="${env.barrier === b ? 'on' : ''}">${b}</button>`).join('')}</div></div>
      ${open ? '' : `<div class="fld"><label>Pit lane</label><div class="seg" id="t-pit">${[['1', 'On'], ['0', 'Off']].map(([v, l]) => `<button data-v="${v}" class="${(env.pits !== false) === (v === '1') ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="fld"><label>Pit side</label><div class="seg" id="t-pitside">${['auto', 'left', 'right'].map(v => `<button data-v="${v}" class="${(env.pitSide || 'auto') === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>`}
      <div class="fld"><label>Sidewalks</label><div class="seg" id="t-walk"><button data-v="1" class="${env.walks ? 'on' : ''}">On</button><button data-v="0" class="${!env.walks ? 'on' : ''}">Off</button></div></div>
      ${env.walks ? fld('Sidewalk width', 't-walkw', 1.5, 5, 0.25, env.walkW || 2.5, 'm') : ''}
      <div class="fld"><label>Kerbs</label><div class="seg" id="t-kerb"><button data-v="1" class="${env.kerbs !== false ? 'on' : ''}">On</button><button data-v="0" class="${env.kerbs === false ? 'on' : ''}">Off</button></div></div>
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
    segBind('t-bar', v => { this.push(); env.barrier = v; this.changed(true); });
    segBind('t-kerb', v => { this.push(); env.kerbs = v === '1'; this.changed(true); });
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
        <p class="muted" style="margin-top:-4px">Ambient life: paper blowing along the pavements (cars kick it up), steam from vents, pigeons, glowing vending machines and signs at night.</p>
        <div class="seg"><button id="w-reroll">&#8635; New Layout</button>${SETTINGS[st.kind].streets ? `<button id="w-streets" class="${st.streets !== false ? 'on' : ''}">Town streets: ${st.streets !== false ? 'On' : 'Off'}</button>` : ''}</div>
        <p class="muted">Every building can be clicked with the PROPS tool to move, turn or delete it. Your own zones, roads and imported buildings stay; the setting fills in around them.</p>` : ''}
      <h4>TREES</h4>
      <div class="seg set-cards" id="w-flora">${FLORA_KEYS.filter(k => !FLORA[k].brush).map(k => `<button data-v="${k}" class="${(st.flora || 'auto') === k ? 'on' : ''}">${FLORA[k].label}</button>`).join('')}</div>
      <p class="muted">The trees ${st.kind === 'none' ? 'around the circuit' : 'in this setting'}, zone tree lines and map trees, with grass, flowers, shrubs or rocks under them. Paint extra with the PAINT tool's <b>Nature</b> brush, or place single trees with PROPS.</p>
      <div class="fld" style="margin-top:8px"><label>Zone &amp; map buildings</label><div class="seg" id="w-models"><button data-v="1" class="${st.models ? 'on' : ''}">PS1 models</button><button data-v="0" class="${!st.models ? 'on' : ''}">Plain blocks</button></div></div>`
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
    $('w-clear').addEventListener('click', () => { if (!this.track.props.length) return; this.push(); this.track.props = []; this.selProp = -1; this.changed(true); });
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
    const warns = [];
    if (s.minRadius < 14) warns.push('Very tight corner (R ' + s.minRadius.toFixed(0) + 'm) — cars may struggle.');
    if (Array.from(this.A.LIFT).some(v => v > 0)) warns.push('Flat crossing detected. Raise one side 5m+ to build a bridge.');
    if (s.length < (s.open ? 400 : 800)) warns.push(s.open ? 'Short run — consider a longer road.' : 'Short circuit — consider a longer loop.');
    const bridges = Array.from(this.A.BRIDGE).filter(Boolean).length * this.T.ds;
    $('ed-stats').innerHTML = `
      LENGTH <b>${(s.length / 1000).toFixed(2)} km</b> &middot; CORNERS <b>${s.turns}</b><br>
      ELEVATION <b>${Math.round(s.elevMin) || 0}–${Math.round(s.elevMax) || 0} m</b> &middot; BRIDGES <b>${bridges ? Math.round(bridges) + ' m' : 'none'}</b><br>
      NODES <b>${this.track.points.length}</b> &middot; PROPS <b>${this.track.props.length}</b><br>
      ${this.scen ? `BUILDINGS <b>${this.scen.buildings.length}</b> &middot; TREES <b>${this.scen.trees.length}</b>${this.scen.rejected.length ? ` <span style="color:#ff8a70">(${this.scen.rejected.length} on track, removed)</span>` : ''}<br>` : ''}
      ${this.T.open ? 'POINT-TO-POINT &middot; ONE RUN' : `PIT LANE <b>${this.pit ? Math.round(this.pit.length) + ' m (' + (this.pit.side > 0 ? 'right' : 'left') + ')' : 'none'}</b>`}<br>
      ${this.T.open ? 'EST. RUN' : 'EST. LAP'} <b>${this.lapEst ? fmtTime(this.lapEst) : '…'}</b>
      ${this.track.env.pits !== false && !this.pit && !this.T.open ? '<div class="warn">! No room for a pit lane near the start line — give the start straight some space, or turn pits off.</div>' : ''}
      ${warns.map(w => `<div class="warn">! ${w}</div>`).join('')}`;
  }
}

function fld(label, id, min, max, step, val, unit) {
  return `<div class="fld"><label>${label}<span id="${id}-v">${val}${unit}</span></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
}
function segBind(id, fn) {
  document.querySelectorAll('#' + id + ' button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#' + id + ' button').forEach(x => x.classList.toggle('on', x === b));
    sfx.move(); fn(b.dataset.v);
  }));
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
