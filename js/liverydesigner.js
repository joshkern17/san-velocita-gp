// Livery Designer UI: team colours + pattern, PNG/SVG + text decals placed by clicking on the car,
// helmet, race suit, saved teams and livery files. Works on the model-independent livery data (livery.js).
import { MODEL as CLASSIC } from './carmodel.js';
import { PATTERNS, HELMET_PATTERNS, SUIT_PATTERNS, SUIT_NUMBERS, CREW_STYLES, VISORS, VISOR_STRIPS, FONTS, assets, importImageFile, decalImage, uvToPanel, uvTemplate, liveryAssetIds, fillLivery, stickerDecals, boundText, BOUND, pathD, shapeBounds } from './livery.js';
import { VectorEditor } from './vectoredit.js';
import { sfx } from './audio.js';
import { savedLiveries, saveLivery, deleteLivery, ensureThumb, liveryDate } from './liveries.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + ((c ?? 0) >>> 0).toString(16).padStart(6, '0').slice(-6);
const unhex = (s) => parseInt(String(s).replace('#', ''), 16);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SWATCH = [0xc8141c, 0xf2f2f2, 0x121214, 0x1d4fb8, 0x0e2a55, 0x1c7a3a, 0xa4e04a, 0xf4c01a, 0xf07a2a, 0x8d2bd8, 0xff5ce1, 0x3ef0ff, 0xb8bcc4, 0xc9a23a, 0x7a3b12, 0x2a2a30];
const KIT_PARTS = { torso: 'Suit', armL: 'Left sleeve', armR: 'Right sleeve', legL: 'Left leg', legR: 'Right leg', helmet: 'Helmet' };
// where a decal lands when it's moved to a part from the list (his left breast; the outside of a sleeve or leg; the side of the helmet)
const KIT_START = { torso: [0.09, 0.3], armL: [0.25, 0.25], armR: [0.75, 0.25], legL: [0.25, 0.3], legR: [0.75, 0.3], helmet: [0.25, 0.42] };


export class LiveryDesigner {
  constructor({ garage, getCar, setCar, onDone, save }) {
    this.garage = garage; this.getCar = getCar; this.setCar = setCar; this.onDone = onDone; this.save = save || (() => {});
    this.tab = 'team'; this.sel = -1; this.ksel = -1; this.dtarget = 'car'; // (ksel: the selected decal on the uniform)
    this.vec = new VectorEditor(this); // (the shape editor: js/vectoredit.js)
    document.querySelectorAll('#lv-tabs button').forEach(b => b.addEventListener('click', () => { if (b.dataset.tab !== 'decals') this.vec.close(); this.tab = b.dataset.tab; sfx.move(); this.render(); }));
    document.querySelectorAll('#lv-views button').forEach(b => b.addEventListener('click', () => { garage.view(b.dataset.v); sfx.move(); }));
    $('lv-done').addEventListener('click', () => this.close());
    $('lv-file').addEventListener('change', (e) => this.importFile(e.target.files[0], e.target.dataset.for));
    $('lv-import').addEventListener('change', (e) => this.importLivery(e.target.files[0]));
    window.addEventListener('keydown', (e) => {
      if (!this.active || this.vec.open || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.tab === 'decals' && this.dtarget === 'driver' && this.ksel >= 0) { e.preventDefault(); this.removeKitDecal(this.ksel); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel >= 0) { e.preventDefault(); this.removeDecal(this.sel); }
      if (e.key === 'Escape') this.close();
    });
  }
  get car() { return this.getCar(); }
  // the livery panel map of whichever car model is on the turntable (classic or your imported one)
  get def() { return (this.garage.car && this.garage.car.def) || CLASSIC; }
  open() {
    this.active = true; this.sel = -1; this.ksel = -1;
    const c = this.car;
    Object.assign(c, fillLivery(c));
    // the built-in sponsor + team name stickers become decals here (same places), so they move like the rest
    if (c.stickers !== 'decals') { if (c.showSponsor) c.decals.unshift(...stickerDecals(c, this.def)); c.stickers = 'decals'; }
    assets.load(liveryAssetIds(c)).then(() => this.repaint());
    this.garage.shift = -0.13; this.garage.view('three'); this.garage.still = true;
    this.garage.onPick = (hit, phase) => this.onPick(hit, phase);
    this.render();
    // (World Career: a sponsor's logo, ready to place)
    // (World Career: a sponsor's logo or name, picked out if it's already on the car, else added, ready to place)
    if (this.pending) {
      const d = this.pending; this.pending = null; this.tab = 'decals'; this.dtarget = 'car';
      const i = c.decals.findIndex(x => d.bind ? x.bind === d.bind : x.asset === d.asset);
      if (i >= 0) { this.sel = i; this.render(); this.toast('CLICK OR DRAG ON THE CAR TO MOVE IT'); }
      else if (d.bind) this.addBound(d.bind);
      else assets.load([d.asset]).then(() => this.addDecal({ asset: d.asset, name: d.name, size: 0.45 }));
    }
  }
  close() {
    if (!this.active) return;
    this.vec.close();
    this.active = false; this.garage.still = false; this.garage.onPick = null; this.garage.pickMode = 'car'; this.garage.showCrew(false); this.garage.shift = 0.14; this.garage.target.set(0.2, 0.55, 0);
    sfx.back(); this.onDone();
  }
  toast(msg) { const t = $('lv-toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(this.tt); this.tt = setTimeout(() => t.classList.remove('on'), 1600); }
  // (while the shape editor is open the car is painted without the shapes being edited: it redraws them itself)
  repaint() { if (this.vec.open) return this.vec.changedFromPanel(); this.setCar(this.car, false); }
  rebuild() { this.setCar(this.car, true); }
  changed(render = false) { this.repaint(); if (render) this.render(); }

  // ---------- click on the car ----------
  onPick(hit, phase) {
    if (phase === 'up') { if (this.dragged) { this.dragged = false; this.render(); } return true; }
    if (this.tab === 'decals' && this.dtarget === 'driver') { // clicks land on the racer's kit
      const d = this.car.suit.decals[this.ksel];
      if (!d || !hit.kit) return false;
      d.part = hit.kit.part; d.u = +hit.kit.u.toFixed(3); d.v = +hit.kit.v.toFixed(3);
      this.dragged = true; this.repaint();
      if (phase === 'down') this.render(); else this.syncKitFields();
      return true;
    }
    const d = this.car.decals[this.sel];
    if (!d || this.tab !== 'decals') return false;
    const def = this.def, p = def.uvToPanel ? def.uvToPanel(hit.uv.x, hit.uv.y) : uvToPanel(def.panels, hit.uv.x, hit.uv.y);
    if (!p) return false;
    d.panel = p.panel; d.x = +p.x.toFixed(3); d.y = +p.y.toFixed(3);
    this.dragged = true;
    this.repaint();
    if (phase === 'down') this.render();
    else this.syncDecalFields();
    return true;
  }

  // ---------- panels ----------
  render() {
    document.querySelectorAll('#lv-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    const el = $('lv-tab');
    el.innerHTML = this['tab_' + this.tab]();
    this['bind_' + this.tab]();
    const hint = $('lv-hint');
    const onDriver = this.tab === 'decals' && this.dtarget === 'driver';
    hint.style.display = this.tab === 'decals' ? '' : 'none';
    if (this.vec.open) return;
    hint.innerHTML = onDriver ? 'Pick a decal, then <b>click the driver</b> to place it: suit, sleeves, legs or helmet. Drag on him to slide it. Drag anywhere else to spin, scroll to zoom.'
      : 'Pick a decal, then <b>click the car</b> to place it. Drag on the car to slide it. Drag anywhere else to spin the car, scroll to zoom.';
    this.garage.pickMode = onDriver ? 'racer' : 'car';
    this.garage.showCrew(this.tab === 'suit');
  }
  colour(label, id, val) {
    return `<div class="lv-col">${label}<input type="color" id="${id}" value="${hex(val)}"><div class="lv-swatches" data-for="${id}">${SWATCH.map(c => `<i style="background:${hex(c)}" data-c="${c}"></i>`).join('')}</div></div>`;
  }
  bindColour(id, set) {
    const inp = $(id); if (!inp) return;
    inp.addEventListener('input', () => { set(unhex(inp.value)); this.repaint(); });
    document.querySelectorAll(`.lv-swatches[data-for="${id}"] i`).forEach(i => i.addEventListener('click', () => { inp.value = hex(+i.dataset.c); set(+i.dataset.c); sfx.move(); this.repaint(); }));
  }
  seg(id, opts, cur, cls = '') { return `<div class="fld"><div class="seg ${cls}" id="${id}">${Object.entries(opts).map(([k, v]) => `<button data-v="${k}" class="${String(cur) === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>`; }
  bindSeg(id, fn) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); sfx.move(); fn(b.dataset.v);
    }));
  }
  range(label, id, min, max, step, val, unit = '') { return `<div class="fld"><label>${label}<span id="${id}-v">${(+val).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}${unit}</span></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`; }
  bindRange(id, fn, unit = '', dp = 2) { const r = $(id); if (!r) return; r.addEventListener('input', () => { $(id + '-v').textContent = (+r.value).toFixed(dp) + unit; fn(+r.value); this.repaint(); }); }
  check(id, label, on) { return `<label class="chk"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${label}</label>`; }
  bindCheck(id, fn) { const c = $(id); if (c) c.addEventListener('change', () => { fn(c.checked); sfx.move(); this.repaint(); }); }
  text(id, val, max = 16) { return `<input type="text" id="${id}" value="${esc(val)}" maxlength="${max}" spellcheck="false" autocomplete="off">`; }
  bindText(id, fn) { const t = $(id); if (!t) return; t.addEventListener('input', () => { fn(t.value); this.repaint(); }); t.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') t.blur(); }); }

  // TEAM
  tab_team() {
    const c = this.car;
    return `<h4>TEAM</h4>
      <div class="fld"><label>Team name</label>${this.text('lv-team', c.teamName, 22)}</div>
      <div class="lv-row"><div class="fld" style="flex:2"><label>Title sponsor</label>${this.text('lv-sp', c.sponsor, 14)}</div><div class="fld"><label>Number</label><input type="number" id="lv-num" min="0" max="99" value="${c.number}"></div></div>
      <h4>COLOURS</h4>
      <div class="lv-row">${this.colour('Main', 'lv-c1', c.main)}${this.colour('Accent', 'lv-c2', c.accent)}${this.colour('Detail', 'lv-c3', c.third)}</div>
      ${this.check('lv-wown', 'Own rear wing color', c.wingColor != null)}
      ${c.wingColor != null ? `<div class="lv-row">${this.colour('Rear wing', 'lv-cw', c.wingColor)}</div>` : ''}
      <h4>PATTERN</h4>
      ${this.seg('lv-pat', PATTERNS, c.pattern)}
      ${this.check('lv-shown', 'Race numbers on the car', c.showNumber)}
      <p class="muted">The sponsor and team name stickers, your own logos and text are in DECALS. Bodywork parts are in the Garage menu.</p>`;
  }
  bind_team() {
    const c = this.car;
    this.bindText('lv-team', v => c.teamName = v.toUpperCase());
    this.bindText('lv-sp', v => c.sponsor = v.toUpperCase());
    const n = $('lv-num'); n.addEventListener('input', () => { c.number = Math.max(0, Math.min(99, parseInt(n.value || '0', 10))); this.repaint(); }); n.addEventListener('keydown', e => e.stopPropagation());
    this.bindColour('lv-c1', v => c.main = v); this.bindColour('lv-c2', v => c.accent = v); this.bindColour('lv-c3', v => c.third = v);
    // rear wing: the car's own default (road cars: the main colour, single-seaters: the accent) unless picked here
    this.bindCheck('lv-wown', v => { c.wingColor = v ? (c.wingColor ?? c.main) : null; this.render(); });
    this.bindColour('lv-cw', v => c.wingColor = v);
    this.bindSeg('lv-pat', v => { c.pattern = v; this.repaint(); });
    this.bindCheck('lv-shown', v => c.showNumber = v);
  }

  // DECALS
  // DECALS: on the car, or on the driver (suit, sleeves, legs, helmet). Same list, same click-and-drag
  tab_decals() {
    const sw = `<div class="seg" id="lv-dtgt"><button data-v="car" class="${this.dtarget !== 'driver' ? 'on' : ''}">On the car</button><button data-v="driver" class="${this.dtarget === 'driver' ? 'on' : ''}">On the driver</button></div>`;
    return sw + (this.dtarget === 'driver' ? this.kitDecalsHtml() : this.carDecalsHtml());
  }
  bind_decals() {
    this.bindSeg('lv-dtgt', v => { this.dtarget = v; this.render(); this.garage.view(v === 'driver' ? 'driver' : 'three'); });
    if (this.dtarget === 'driver') this.bindKitDecals(); else this.bindCarDecals();
  }
  carDecalsHtml() {
    const c = this.car, d = c.decals[this.sel];
    const list = c.decals.map((x, i) => {
      const url = x.asset && assets.get(x.asset), txt = x.bind ? boundText(c, x.bind) : x.text;
      const th = x.path ? shapeThumb(x) : txt != null ? `<span class="th" style="color:${hex(x.color)}">${esc(txt.slice(0, 3))}</span>` : `<span class="th" style="background-image:url('${url || ''}')"></span>`;
      return `<div class="lv-item ${i === this.sel ? 'sel' : ''}" data-i="${i}">${th}<span class="nm">${esc(x.bind ? BOUND[x.bind] : x.name || x.text || (x.path ? (x.path.closed ? 'Shape' : 'Line') : 'Decal'))}<br><span class="pn">${esc(this.def.panels[x.panel]?.label || x.panel)}${x.mirror ? ' · BOTH SIDES' : ''}</span></span>
        <button data-act="up" title="Draw earlier">&#9650;</button><button data-act="dup" title="Duplicate">+</button><button data-act="del" title="Delete">&#10005;</button></div>`;
    }).join('');
    let props = '<p class="muted">Select a decal to edit it.</p>';
    if (d) {
      const p = this.def.panels[d.panel] || Object.values(this.def.panels)[0];
      props = `<h4>SELECTED</h4>
        ${d.path ? this.shapeProps(d) : ''}
        ${d.text != null ? `${d.bind ? `<p class="muted">Reads ${esc(boundText(c, d.bind) || '(nothing yet)')}: it follows the ${d.bind === 'sponsor' ? 'title sponsor' : 'team name'}.</p>` : `<div class="fld"><label>Text</label>${this.text('lv-dt', d.text, 20)}</div>`}
          <div class="fld"><label>Font</label><select id="lv-df">${Object.entries(FONTS).map(([k, v]) => `<option value="${k}" ${d.font === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="lv-row">${this.colour('Colour', 'lv-dc', d.color ?? 0xffffff)}${this.colour('Outline', 'lv-do', d.outline ?? 0x000000)}</div>
          ${this.check('lv-dno', 'Outline', d.outline != null)}${this.check('lv-dbar', 'Background bar', d.bar != null)}` : ''}
        <div class="fld"><label>Panel</label><select id="lv-dp">${Object.entries(this.def.panels).map(([k, v]) => `<option value="${k}" ${d.panel === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
        ${this.range('Across', 'lv-dx', 0, p.W, 0.01, d.x, ' m')}
        ${this.range('Up / down', 'lv-dy', 0, p.H, 0.005, d.y, ' m')}
        ${this.range(d.text != null ? 'Letter height' : 'Width', 'lv-ds', 0.03, Math.max(0.2, Math.min(3, p.W)), 0.01, d.size, ' m')}
        ${this.range('Rotation', 'lv-dr', -180, 180, 1, d.rot || 0, '°')}
        ${this.range('Opacity', 'lv-da', 0.1, 1, 0.05, d.opacity ?? 1, '')}
        ${this.check('lv-dm', 'Both sides (mirror onto the other side)', d.mirror)}
        ${this.check('lv-dflip', 'Flip horizontally', d.flip)}`;
    }
    return `<h4>DECALS</h4>
      <div class="seg"><button id="lv-addimg" class="hot">+ Image (PNG / SVG)</button><button id="lv-addtxt">+ Text</button></div>
      <div class="seg"><button id="lv-addsp">+ Sponsor name</button><button id="lv-addteam">+ Team name</button></div>
      <div class="seg"><button id="lv-addshape" class="hot">${this.vec.open ? 'Exit shapes' : '+ Shape (pen, rectangle, ellipse)'}</button></div>
      <p class="muted">${!this.vec.open ? 'Images are stored in your browser. SVGs stay sharp at any size. Shapes are drawn right on the car.' : this.vec.flat ? 'You\'re drawing on a flat view of the car. Pick the side in the bar at the top.' : 'Draw right on the car. Flat View (top bar) gives you a square-on view for exact lines.'}</p>
      <div class="lv-list" id="lv-list">${list || '<p class="muted">No decals yet.</p>'}</div>
      <div id="lv-props">${props}</div>`;
  }
  bindCarDecals() {
    const c = this.car;
    $('lv-addimg').addEventListener('click', () => { const f = $('lv-file'); f.dataset.for = 'decal'; f.value = ''; f.click(); });
    $('lv-addtxt').addEventListener('click', () => this.addDecal({ text: c.sponsor || 'SPONSOR', font: 'impact', color: 0xffffff, outline: 0x000000, size: 0.12, name: null }));
    $('lv-addsp').addEventListener('click', () => this.addBound('sponsor')); $('lv-addteam').addEventListener('click', () => this.addBound('team'));
    $('lv-addshape').addEventListener('click', () => { sfx.select(); if (this.vec.open) return this.vec.close(); this.sel = -1; this.vec.start(this.garageSide(), 'pen'); });
    // (the shape editor's undo takes in changes made here too)
    for (const id of ['lv-list', 'lv-props']) $(id).addEventListener('pointerdown', () => { if (this.vec.open) this.vec.mark(); }, true);
    document.querySelectorAll('#lv-list .lv-item').forEach(it => it.addEventListener('click', (e) => {
      const i = +it.dataset.i, act = e.target.dataset?.act;
      if (act === 'del') return this.removeDecal(i);
      if (act === 'dup') { const cp = { ...c.decals[i], id: 'd' + Math.random().toString(36).slice(2, 8) }; if (this.def.panels[cp.panel]) cp.x = Math.min(this.def.panels[cp.panel].W, cp.x + 0.15); c.decals.splice(i + 1, 0, cp); this.sel = i + 1; this.changed(true); return; }
      if (act === 'up') { if (i > 0) { [c.decals[i - 1], c.decals[i]] = [c.decals[i], c.decals[i - 1]]; this.sel = i - 1; this.changed(true); } return; }
      this.sel = i; sfx.move(); this.render();
      if (this.vec.open) { const d = c.decals[i]; if (!d.path) this.vec.close(); else if (d.panel !== this.vec.panel) this.vec.setPanel(d.panel); else this.vec.select(i); }
    }));
    this.bindDecalProps();
  }
  bindDecalProps() {
    const d = this.car.decals[this.sel]; if (!d) return;
    if (d.path) this.bindShapeProps(d);
    if (d.text != null) {
      if (!d.bind) this.bindText('lv-dt', v => { d.text = v; });
      $('lv-df').addEventListener('change', (e) => { d.font = e.target.value; this.repaint(); });
      this.bindColour('lv-dc', v => d.color = v); this.bindColour('lv-do', v => { d.outline = v; });
      this.bindCheck('lv-dno', v => { d.outline = v ? unhex($('lv-do').value) : null; });
      this.bindCheck('lv-dbar', v => { d.bar = v ? this.car.third : null; });
    }
    $('lv-dp').addEventListener('change', (e) => { const q = this.def.panels[e.target.value]; d.panel = e.target.value; d.x = q.W / 2; d.y = q.H / 2; this.changed(true); });
    this.bindRange('lv-dx', v => d.x = v, ' m'); this.bindRange('lv-dy', v => d.y = v, ' m', 3);
    this.bindRange('lv-ds', v => d.size = v, ' m'); this.bindRange('lv-dr', v => d.rot = v, '°', 0); this.bindRange('lv-da', v => d.opacity = v, '', 2);
    this.bindCheck('lv-dm', v => d.mirror = v); this.bindCheck('lv-dflip', v => d.flip = v);
  }
  // a vector shape's own fields: fill, stroke, open / closed, and the way into the editor
  shapeProps(d) {
    return `<button class="wide hot" id="lv-dedit" style="margin:0 0 12px">${this.vec.open ? 'Edit nodes (A)' : 'Edit shape'}</button>
      <div class="lv-row">${this.colour('Fill', 'lv-dfi', d.fill ?? this.car.accent)}${this.colour('Stroke', 'lv-dst', d.stroke ?? this.car.third)}</div>
      <div class="lv-row lv-checks">${this.check('lv-dfo', 'Fill', d.fill != null)}${this.check('lv-dso', 'Stroke', d.stroke != null)}${this.check('lv-dcl', 'Closed', d.path.closed)}</div>
      ${d.stroke != null ? this.range('Stroke width', 'lv-dsw', 0.005, 0.3, 0.005, d.sw || 0.04, ' m') : ''}`;
  }
  bindShapeProps(d) {
    $('lv-dedit').addEventListener('click', () => { sfx.select(); if (this.vec.open) this.vec.setTool('node'); else this.vec.start(d.panel, 'move'); });
    this.bindColour('lv-dfi', v => { d.fill = v; }); this.bindColour('lv-dst', v => { d.stroke = v; });
    this.bindCheck('lv-dfo', v => { d.fill = v ? unhex($('lv-dfi').value) : null; });
    this.bindCheck('lv-dso', v => { d.stroke = v ? unhex($('lv-dst').value) : null; d.sw = d.sw || 0.04; this.render(); });
    this.bindCheck('lv-dcl', v => { d.path.closed = v && d.path.n.length > 2; this.render(); });
    this.bindRange('lv-dsw', v => d.sw = v, ' m', 3);
  }
  // the panel facing the camera now (where a new shape starts)
  garageSide() {
    const P = this.def.panels, y = ((this.garage.yaw - this.garage.table.rotation.y) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), p = this.garage.pitch;
    const pick = (...names) => names.find(n => P[n]);
    if (p > 0.9) return pick('top');
    if (Math.abs(Math.sin(y)) >= 0.5) return Math.sin(y) > 0 ? pick('sideL', 'podL', this.def.startPanel) : pick('sideR', 'podR', 'sideL');
    return Math.cos(y) > 0 ? pick('front', 'sideL', this.def.startPanel) : pick('rear', 'sideL', this.def.startPanel);
  }
  syncDecalFields() {
    const d = this.car.decals[this.sel]; if (!d) return;
    for (const [id, v, dp] of [['lv-dx', d.x, 2], ['lv-dy', d.y, 3]]) { const r = $(id); if (r) { r.value = v; $(id + '-v').textContent = (+v).toFixed(dp) + ' m'; } }
  }
  addDecal(d) {
    this.vec.close(); // (images and text are placed on the 3D car the usual way)
    const c = this.car;
    // start on the left sidepod (the most visible spot; the flank on cars without one), mirrored to the right one
    const pn = this.def.startPanel || 'podL', p = this.def.panels[pn];
    c.decals.push({ id: 'd' + Math.random().toString(36).slice(2, 8), panel: pn, x: p.W * 0.5, y: p.H * 0.4, size: 0.5, rot: 0, opacity: 1, mirror: true, flip: false, ...d });
    this.sel = c.decals.length - 1; this.dtarget = 'car';
    sfx.select(); this.changed(true);
    this.toast('NOW CLICK ON THE CAR TO PLACE IT');
  }
  // the title sponsor's name / the team name, as a sticker that keeps up with it
  addBound(bind) {
    const c = this.car;
    this.addDecal({ bind, text: '', font: 'impact', color: c.accent, outline: null, bar: c.third, size: bind === 'sponsor' ? 0.12 : 0.09, name: null });
  }
  removeDecal(i) { this.car.decals.splice(i, 1); this.sel = Math.min(this.sel, this.car.decals.length - 1); sfx.back(); this.changed(true); }
  async importFile(file, target) {
    if (!file) return;
    if (file.size > 12e6) { this.toast('THAT FILE IS TOO BIG (MAX 12 MB)'); return; }
    try {
      const a = await importImageFile(file);
      if (target === 'helmet') { this.car.helmetDesign.decal = a.id; this.changed(true); }
      else if (target === 'suit') { this.car.suit.decal = a.id; this.changed(true); }
      else if (target === 'kit') {
        const im = await new Promise(r => { const i = decalImage(a.id, () => r(decalImage(a.id))); if (i) r(i); });
        const aspect = im ? im.naturalHeight / im.naturalWidth : 1;
        this.addKitDecal({ asset: a.id, name: a.name, size: Math.min(0.2, 0.08 / Math.max(0.2, aspect)) });
      }
      else {
        const im = await new Promise(r => { const i = decalImage(a.id, () => r(decalImage(a.id))); if (i) r(i); });
        const aspect = im ? im.naturalHeight / im.naturalWidth : 1;
        this.addDecal({ asset: a.id, name: a.name, size: Math.min(0.9, 0.3 / Math.max(0.2, aspect)) });
      }
    } catch (e) { this.toast(String(e.message || e).toUpperCase().slice(0, 60)); sfx.error(); }
  }

  // HELMET
  tab_helmet() {
    const h = this.car.helmetDesign;
    return `<h4>HELMET</h4>
      <div class="lv-row">${this.colour('Base', 'lv-h1', h.base)}${this.colour('Design', 'lv-h2', h.accent)}${this.colour('Trim', 'lv-h3', h.third)}</div>
      <div class="fld"><label>Design</label></div>${this.seg('lv-hp', HELMET_PATTERNS, h.pattern)}
      <div class="fld"><label>Visor</label></div>${this.seg('lv-hv', VISORS, h.visor)}
      <div class="fld"><label>Visor strip</label></div>${this.seg('lv-hs', VISOR_STRIPS, h.strip || 'team')}
      ${this.check('lv-hn', 'Race number on the sides', h.number)}
      <div class="fld"><label>Logo on the sides</label></div>
      <div class="seg"><button id="lv-hlogo">${h.decal ? 'Change image' : 'Add image (PNG / SVG)'}</button>${h.decal ? '<button id="lv-hclr">Remove</button>' : ''}</div>
      <p class="muted">More logos and text anywhere on the helmet: DECALS → On the driver.</p>
      <button class="wide" id="lv-hview">Look at the helmet</button>`;
  }
  bind_helmet() {
    const h = this.car.helmetDesign;
    this.bindColour('lv-h1', v => h.base = v); this.bindColour('lv-h2', v => h.accent = v); this.bindColour('lv-h3', v => h.third = v);
    this.bindSeg('lv-hp', v => { h.pattern = v; this.repaint(); }); this.bindSeg('lv-hv', v => { h.visor = v; this.repaint(); }); this.bindSeg('lv-hs', v => { h.strip = v; this.repaint(); });
    this.bindCheck('lv-hn', v => h.number = v);
    $('lv-hlogo').addEventListener('click', () => { const f = $('lv-file'); f.dataset.for = 'helmet'; f.value = ''; f.click(); });
    $('lv-hclr') && $('lv-hclr').addEventListener('click', () => { h.decal = null; this.changed(true); });
    $('lv-hview').addEventListener('click', () => this.garage.view('helmet'));
    this.garage.view('helmet');
  }

  // SUIT
  tab_suit() {
    const c = this.car, s = c.suit, cr = c.crew;
    return `<h4>RACE SUIT</h4>
      <div class="lv-row">${this.colour('Base', 'lv-s1', s.base)}${this.colour('Accent', 'lv-s2', s.accent)}</div>
      <div class="fld"><label>Design</label></div>${this.seg('lv-sp2', SUIT_PATTERNS, s.pattern, 'grid4')}
      <div class="fld"><label>Chest</label></div>${this.seg('lv-sc', { team: 'Team name', sponsor: 'Sponsor', none: 'Nothing' }, s.chest)}
      <div class="fld"><label>Race number</label></div>${this.seg('lv-sn', SUIT_NUMBERS, s.number)}
      <div class="fld"><label>Shoulder patches</label></div>
      <div class="seg"><button id="lv-slogo">${s.decal ? 'Change image' : 'Add image (PNG / SVG)'}</button>${s.decal ? '<button id="lv-sclr">Remove</button>' : ''}</div>
      <h4>GLOVES + BOOTS</h4>
      <div class="lv-row">${this.colour('Gloves', 'lv-sg', s.gloves)}${this.colour('Boots', 'lv-sb', s.boots)}</div>
      <p class="muted">Boots get a stripe in the suit's accent colour.</p>
      <p class="muted">Sponsors and logos on the suit and helmet: DECALS → On the driver.</p>
      <h4>PIT CREW</h4>
      ${this.seg('lv-cs', CREW_STYLES, cr.style)}
      ${cr.style === 'own' ? `<div class="lv-row">${this.colour('Base', 'lv-cb', cr.base)}${this.colour('Accent', 'lv-ca', cr.accent)}</div>` : ''}
      <p class="muted">${cr.style === 'classic' ? 'Your crew wear mechanic\'s coveralls in a colour near the team\'s.' : 'Your crew wear the kit with your sponsors, without race numbers.'} </p>
      <button class="wide" id="lv-crewview">Look at the crew</button>`;
  }
  bind_suit() {
    const c = this.car, s = c.suit;
    this.bindColour('lv-s1', v => s.base = v); this.bindColour('lv-s2', v => s.accent = v);
    this.bindSeg('lv-sp2', v => { s.pattern = v; this.repaint(); }); this.bindSeg('lv-sc', v => { s.chest = v; this.repaint(); });
    this.bindSeg('lv-sn', v => { s.number = v; this.repaint(); });
    $('lv-slogo').addEventListener('click', () => { const f = $('lv-file'); f.dataset.for = 'suit'; f.value = ''; f.click(); });
    $('lv-sclr') && $('lv-sclr').addEventListener('click', () => { s.decal = null; this.changed(true); });
    this.bindColour('lv-sg', v => s.gloves = v); this.bindColour('lv-sb', v => s.boots = v);
    this.bindSeg('lv-cs', v => { c.crew.style = v; this.changed(true); });
    this.bindColour('lv-cb', v => c.crew.base = v); this.bindColour('lv-ca', v => c.crew.accent = v);
    $('lv-crewview').addEventListener('click', () => { this.garage.view('crew'); sfx.move(); });
    this.garage.view('driver');
  }
  kitDecalsHtml() {
    const s = this.car.suit, d = s.decals[this.ksel];
    const list = s.decals.map((x, i) => {
      const url = x.asset && assets.get(x.asset);
      const th = x.text != null ? `<span class="th" style="color:${hex(x.color)}">${esc(x.text.slice(0, 3))}</span>` : `<span class="th" style="background-image:url('${url || ''}')"></span>`;
      return `<div class="lv-item ${i === this.ksel ? 'sel' : ''}" data-i="${i}">${th}<span class="nm">${esc(x.name || x.text || 'Decal')}<br><span class="pn">${KIT_PARTS[x.part] || x.part}${x.mirror ? ' · BOTH SIDES' : ''}</span></span>
        <button data-act="up" title="Draw earlier">&#9650;</button><button data-act="dup" title="Duplicate">+</button><button data-act="del" title="Delete">&#10005;</button></div>`;
    }).join('');
    let props = '<p class="muted">Select a decal to edit it.</p>';
    if (d) props = `<h4>SELECTED</h4>
        ${d.text != null ? `<div class="fld"><label>Text</label>${this.text('lv-kt', d.text, 20)}</div>
          <div class="fld"><label>Font</label><select id="lv-kf">${Object.entries(FONTS).map(([k, v]) => `<option value="${k}" ${d.font === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="lv-row">${this.colour('Colour', 'lv-kc', d.color ?? 0xffffff)}${this.colour('Outline', 'lv-ko', d.outline ?? 0x000000)}</div>
          ${this.check('lv-kno', 'Outline', d.outline != null)}` : ''}
        <div class="fld"><label>Part</label><select id="lv-kp">${Object.entries(KIT_PARTS).map(([k, v]) => `<option value="${k}" ${d.part === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        ${this.range('Around', 'lv-ku', 0, 1, 0.005, d.u, '')}
        ${this.range('Up / down', 'lv-kv', 0, 1, 0.005, d.v, '')}
        ${this.range(d.text != null ? 'Letter height' : 'Width', 'lv-ks', 0.02, 0.6, 0.01, d.size, '')}
        ${this.range('Rotation', 'lv-kr', -180, 180, 1, d.rot || 0, '°')}
        ${this.range('Opacity', 'lv-ka', 0.1, 1, 0.05, d.opacity ?? 1, '')}
        ${this.check('lv-km', 'Both sides (mirror onto the other side)', d.mirror)}
        ${this.check('lv-kflip', 'Flip horizontally', d.flip)}`;
    return `<h4>DECALS ON THE DRIVER</h4>
      <div class="seg"><button id="lv-kaddimg" class="hot">+ Image (PNG / SVG)</button><button id="lv-kaddtxt">+ Text</button></div>
      <p class="muted">Click on his suit, a sleeve, a leg or his helmet to place it. Your pit crew wear them too.</p>
      <div class="lv-list" id="lv-klist">${list || '<p class="muted">No decals on the driver yet.</p>'}</div>
      <div id="lv-kprops">${props}</div>`;
  }
  bindKitDecals() {
    const c = this.car, s = c.suit;
    $('lv-kaddimg').addEventListener('click', () => { const f = $('lv-file'); f.dataset.for = 'kit'; f.value = ''; f.click(); });
    $('lv-kaddtxt').addEventListener('click', () => this.addKitDecal({ text: c.sponsor || 'SPONSOR', font: 'impact', color: 0xffffff, outline: null, size: 0.07, name: null }));
    document.querySelectorAll('#lv-klist .lv-item').forEach(it => it.addEventListener('click', (e) => {
      const i = +it.dataset.i, act = e.target.dataset?.act;
      if (act === 'del') return this.removeKitDecal(i);
      if (act === 'up') { if (i > 0) { [s.decals[i - 1], s.decals[i]] = [s.decals[i], s.decals[i - 1]]; this.ksel = i - 1; this.changed(true); } return; }
      if (act === 'dup') { const cp = { ...s.decals[i], id: 'k' + Math.random().toString(36).slice(2, 8), v: Math.min(1, s.decals[i].v + 0.08) }; s.decals.splice(i + 1, 0, cp); this.ksel = i + 1; this.changed(true); return; }
      this.ksel = i; sfx.move(); this.render();
      this.garage.view(s.decals[i].part === 'helmet' ? 'helmet' : 'driver');
    }));
    const d = s.decals[this.ksel];
    if (d) {
      if (d.text != null) {
        this.bindText('lv-kt', v => { d.text = v; });
        $('lv-kf').addEventListener('change', (e) => { d.font = e.target.value; this.repaint(); });
        this.bindColour('lv-kc', v => d.color = v); this.bindColour('lv-ko', v => { d.outline = v; });
        this.bindCheck('lv-kno', v => { d.outline = v ? unhex($('lv-ko').value) : null; });
      }
      $('lv-kp').addEventListener('change', (e) => { d.part = e.target.value; [d.u, d.v] = KIT_START[d.part]; this.changed(true); this.garage.view(d.part === 'helmet' ? 'helmet' : 'driver'); });
      this.bindRange('lv-ku', v => d.u = v, '', 3); this.bindRange('lv-kv', v => d.v = v, '', 3);
      this.bindRange('lv-ks', v => d.size = v, ''); this.bindRange('lv-kr', v => d.rot = v, '°', 0); this.bindRange('lv-ka', v => d.opacity = v, '', 2);
      this.bindCheck('lv-km', v => d.mirror = v); this.bindCheck('lv-kflip', v => d.flip = v);
    }
  }
  syncKitFields() {
    const d = this.car.suit.decals[this.ksel]; if (!d) return;
    for (const [id, v] of [['lv-ku', d.u], ['lv-kv', d.v]]) { const r = $(id); if (r) { r.value = v; $(id + '-v').textContent = (+v).toFixed(3); } }
  }
  addKitDecal(d) {
    const s = this.car.suit;
    // start on his left breast, over the heart
    s.decals.push({ id: 'k' + Math.random().toString(36).slice(2, 8), part: 'torso', u: 0.09, v: 0.3, size: 0.12, rot: 0, opacity: 1, mirror: false, flip: false, ...d });
    this.ksel = s.decals.length - 1; this.tab = 'decals'; this.dtarget = 'driver';
    sfx.select(); this.changed(true); this.garage.view('driver');
    this.toast('NOW CLICK ON THE DRIVER TO PLACE IT');
  }
  removeKitDecal(i) { const s = this.car.suit; s.decals.splice(i, 1); this.ksel = Math.min(this.ksel, s.decals.length - 1); sfx.back(); this.changed(true); }

  // FILES: saved teams, export / import, modeller tools
  // (every save its own entry, with a photo: liveries.js)
  teams() { return savedLiveries(); }
  tab_files() {
    const list = this.teams().map((t, i) => { if (!t.thumb) ensureThumb(t.id, () => { if (this.tab === 'files') this.render(); });
      return `<div class="lv-item" data-i="${i}"><span class="th" style="background:${t.thumb ? `#000 url(${t.thumb}) center/cover` : hex(t.car.main)}"></span><span class="nm">${esc(t.name)}<br><span class="pn">#${t.car.number} · ${esc(liveryDate(t))}</span></span><button data-act="load">Load</button><button data-act="del">${this.delArm === t.id ? 'Sure?' : '&#10005;'}</button></div>`; }).join('');
    return `<h4>MY LIVERIES</h4>
      <div class="lv-teams" id="lv-teams">${list || '<p class="muted">No saved liveries yet.</p>'}</div>
      <button class="wide hot" id="lv-save">Save "${esc(this.car.teamName)}" as a new livery</button>
      <h4 style="margin-top:16px">SHARE</h4>
      <p class="muted">A livery file holds the whole design including your images. Send it to a friend, or keep a backup.</p>
      <div class="seg"><button id="lv-exp">Export livery file</button><button id="lv-imp">Import livery file</button></div>
      <h4 style="margin-top:16px">FOR 3D MODELLERS</h4>
      <p class="muted">Liveries are stored per panel, not per model. To make a new car model take every livery: UV-unwrap it so each panel lands in the same area and the same direction as this template. See docs/CAR-MODELS.md.</p>
      <div class="seg"><button id="lv-uv">UV template (PNG)</button><button id="lv-tex">This livery's texture</button></div>`;
  }
  bind_files() {
    const c = this.car;
    document.querySelectorAll('#lv-teams .lv-item').forEach(it => it.addEventListener('click', (e) => {
      const i = +it.dataset.i, list = this.teams(), act = e.target.dataset?.act;
      if (act === 'del') { const t = list[i]; if (this.delArm !== t.id) { this.delArm = t.id; sfx.select(); return this.render(); } this.delArm = null; deleteLivery(t.id); sfx.back(); this.toast('DELETED ' + t.name.toUpperCase()); return this.render(); }
      if (act === 'load') { const t = list[i]; Object.keys(c).forEach(k => delete c[k]); Object.assign(c, fillLivery(JSON.parse(JSON.stringify(t.car)))); assets.load(liveryAssetIds(c)).then(() => this.repaint()); this.sel = -1; this.rebuild(); this.toast('LOADED ' + t.name.toUpperCase()); sfx.select(); this.render(); }
    }));
    $('lv-save').addEventListener('click', () => {
      const name = c.teamName || 'My Team';
      if (saveLivery(c, () => { if (this.tab === 'files') this.render(); })) { this.toast('SAVED ' + name.toUpperCase()); sfx.best(); } else this.toast('COULD NOT SAVE (STORAGE FULL)');
      this.render();
    });
    $('lv-exp').addEventListener('click', () => {
      const data = { svgpLivery: 1, model: this.def.id, car: c, assets: assets.pick(liveryAssetIds(c)) };
      download(`${(c.teamName || 'livery').replace(/[^\w -]/g, '').trim() || 'livery'}.svgp-livery.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
      this.toast('LIVERY EXPORTED');
    });
    $('lv-imp').addEventListener('click', () => { const f = $('lv-import'); f.value = ''; f.click(); });
    $('lv-uv').addEventListener('click', () => (this.def.template ? this.def.template() : uvTemplate(this.def)).toBlob(b => download(`uv-template-${this.def.id}.png`, b)));
    $('lv-tex').addEventListener('click', () => { const cv = this.garage.car?.livery; if (cv) cv.toBlob(b => download(`${(c.teamName || 'livery').replace(/\W+/g, '-')}-texture.png`, b)); });
  }
  async importLivery(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !data.svgpLivery || !data.car) throw new Error('not a livery file');
      for (const [id, url] of Object.entries(data.assets || {})) await assets.save(id, url);
      const c = this.car; Object.keys(c).forEach(k => delete c[k]); Object.assign(c, fillLivery(data.car));
      this.sel = -1; this.rebuild(); this.render(); sfx.select(); this.toast('IMPORTED ' + String(c.teamName || '').toUpperCase());
    } catch (e) { sfx.error(); this.toast('THAT IS NOT A LIVERY FILE'); }
  }
}

// a shape's list thumbnail: its path as a little SVG
function shapeThumb(d) {
  const b = shapeBounds(d.path), pad = (d.stroke != null ? d.sw || 0 : 0) / 2 + 0.01, w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
  const fill = d.fill != null ? hex(d.fill) : 'none', st = d.stroke != null ? `stroke="${hex(d.stroke)}" stroke-width="${d.sw}" stroke-linejoin="round" stroke-linecap="round"` : '';
  return `<span class="th"><svg viewBox="${b[0] - pad} ${b[1] - pad} ${w} ${h}" width="34" height="22" style="transform:scaleX(${d.flip ? -1 : 1}) rotate(${d.rot || 0}deg)"><path d="${pathD(d.path)}" fill="${fill}" ${st}/></svg></span>`;
}

function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
