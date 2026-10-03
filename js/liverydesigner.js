// Livery Designer UI: team colours + pattern, PNG/SVG + text decals placed by clicking on the car,
// helmet, race suit, saved teams and livery files. Works on the model-independent livery data (livery.js).
import { MODEL as CLASSIC } from './carmodel.js';
import { PATTERNS, HELMET_PATTERNS, SUIT_PATTERNS, VISORS, VISOR_STRIPS, FONTS, assets, importImageFile, decalImage, uvToPanel, uvTemplate, liveryAssetIds, fillLivery } from './livery.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + ((c ?? 0) >>> 0).toString(16).padStart(6, '0').slice(-6);
const unhex = (s) => parseInt(String(s).replace('#', ''), 16);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SWATCH = [0xc8141c, 0xf2f2f2, 0x121214, 0x1d4fb8, 0x0e2a55, 0x1c7a3a, 0xa4e04a, 0xf4c01a, 0xf07a2a, 0x8d2bd8, 0xff5ce1, 0x3ef0ff, 0xb8bcc4, 0xc9a23a, 0x7a3b12, 0x2a2a30];
const TEAMS_KEY = 'svgp.teams';

export class LiveryDesigner {
  constructor({ garage, getCar, setCar, onDone }) {
    this.garage = garage; this.getCar = getCar; this.setCar = setCar; this.onDone = onDone;
    this.tab = 'team'; this.sel = -1;
    document.querySelectorAll('#lv-tabs button').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; sfx.move(); this.render(); }));
    document.querySelectorAll('#lv-views button').forEach(b => b.addEventListener('click', () => { garage.view(b.dataset.v); sfx.move(); }));
    $('lv-done').addEventListener('click', () => this.close());
    $('lv-file').addEventListener('change', (e) => this.importFile(e.target.files[0], e.target.dataset.for));
    $('lv-import').addEventListener('change', (e) => this.importLivery(e.target.files[0]));
    window.addEventListener('keydown', (e) => {
      if (!this.active || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel >= 0) { e.preventDefault(); this.removeDecal(this.sel); }
      if (e.key === 'Escape') this.close();
    });
  }
  get car() { return this.getCar(); }
  // the livery panel map of whichever car model is on the turntable (classic or your imported one)
  get def() { return (this.garage.car && this.garage.car.def) || CLASSIC; }
  open() {
    this.active = true; this.sel = -1;
    const c = this.car;
    Object.assign(c, fillLivery(c));
    assets.load(liveryAssetIds(c)).then(() => this.repaint());
    this.garage.shift = -0.13; this.garage.view('three');
    this.garage.onPick = (hit, phase) => this.onPick(hit, phase);
    this.render();
    // (World Career: a sponsor's logo, ready to place)
    if (this.pending) { const d = this.pending; this.pending = null; assets.load([d.asset]).then(() => this.addDecal({ asset: d.asset, name: d.name, size: 0.45 })); }
  }
  close() {
    if (!this.active) return;
    this.active = false; this.garage.onPick = null; this.garage.shift = 0.14; this.garage.target.set(0.2, 0.55, 0);
    sfx.back(); this.onDone();
  }
  toast(msg) { const t = $('lv-toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(this.tt); this.tt = setTimeout(() => t.classList.remove('on'), 1600); }
  repaint() { this.setCar(this.car, false); }
  rebuild() { this.setCar(this.car, true); }
  changed(render = false) { this.repaint(); if (render) this.render(); }

  // ---------- click on the car ----------
  onPick(hit, phase) {
    if (phase === 'up') { if (this.dragged) { this.dragged = false; this.render(); } return true; }
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
    $('lv-hint').style.display = this.tab === 'decals' ? '' : 'none';
  }
  colour(label, id, val) {
    return `<div class="lv-col">${label}<input type="color" id="${id}" value="${hex(val)}"><div class="lv-swatches" data-for="${id}">${SWATCH.map(c => `<i style="background:${hex(c)}" data-c="${c}"></i>`).join('')}</div></div>`;
  }
  bindColour(id, set) {
    const inp = $(id); if (!inp) return;
    inp.addEventListener('input', () => { set(unhex(inp.value)); this.repaint(); });
    document.querySelectorAll(`.lv-swatches[data-for="${id}"] i`).forEach(i => i.addEventListener('click', () => { inp.value = hex(+i.dataset.c); set(+i.dataset.c); sfx.move(); this.repaint(); }));
  }
  seg(id, opts, cur) { return `<div class="fld"><div class="seg" id="${id}">${Object.entries(opts).map(([k, v]) => `<button data-v="${k}" class="${String(cur) === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>`; }
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
      <h4>PATTERN</h4>
      ${this.seg('lv-pat', PATTERNS, c.pattern)}
      ${this.check('lv-shown', 'Race numbers on the car', c.showNumber)}
      ${this.check('lv-shows', 'Sponsor + team name stickers', c.showSponsor)}
      <p class="muted">Add your own logos and stickers in DECALS. Bodywork parts are in the Garage menu.</p>`;
  }
  bind_team() {
    const c = this.car;
    this.bindText('lv-team', v => c.teamName = v.toUpperCase());
    this.bindText('lv-sp', v => c.sponsor = v.toUpperCase());
    const n = $('lv-num'); n.addEventListener('input', () => { c.number = Math.max(0, Math.min(99, parseInt(n.value || '0', 10))); this.repaint(); }); n.addEventListener('keydown', e => e.stopPropagation());
    this.bindColour('lv-c1', v => c.main = v); this.bindColour('lv-c2', v => c.accent = v); this.bindColour('lv-c3', v => c.third = v);
    this.bindSeg('lv-pat', v => { c.pattern = v; this.repaint(); });
    this.bindCheck('lv-shown', v => c.showNumber = v); this.bindCheck('lv-shows', v => c.showSponsor = v);
  }

  // DECALS
  tab_decals() {
    const c = this.car, d = c.decals[this.sel];
    const list = c.decals.map((x, i) => {
      const url = x.asset && assets.get(x.asset);
      const th = x.text != null ? `<span class="th" style="color:${hex(x.color)}">${esc(x.text.slice(0, 3))}</span>` : `<span class="th" style="background-image:url('${url || ''}')"></span>`;
      return `<div class="lv-item ${i === this.sel ? 'sel' : ''}" data-i="${i}">${th}<span class="nm">${esc(x.name || x.text || 'Decal')}<br><span class="pn">${esc(this.def.panels[x.panel]?.label || x.panel)}${x.mirror ? ' · BOTH SIDES' : ''}</span></span>
        <button data-act="up" title="Draw earlier">&#9650;</button><button data-act="dup" title="Duplicate">+</button><button data-act="del" title="Delete">&#10005;</button></div>`;
    }).join('');
    let props = '<p class="muted">Select a decal to edit it.</p>';
    if (d) {
      const p = this.def.panels[d.panel] || Object.values(this.def.panels)[0];
      props = `<h4>SELECTED</h4>
        ${d.text != null ? `<div class="fld"><label>Text</label>${this.text('lv-dt', d.text, 20)}</div>
          <div class="fld"><label>Font</label><select id="lv-df">${Object.entries(FONTS).map(([k, v]) => `<option value="${k}" ${d.font === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="lv-row">${this.colour('Colour', 'lv-dc', d.color ?? 0xffffff)}${this.colour('Outline', 'lv-do', d.outline ?? 0x000000)}</div>
          ${this.check('lv-dno', 'Outline', d.outline != null)}` : ''}
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
      <p class="muted">Images are stored in your browser. SVGs stay sharp at any size.</p>
      <div class="lv-list" id="lv-list">${list || '<p class="muted">No decals yet.</p>'}</div>
      <div id="lv-props">${props}</div>`;
  }
  bind_decals() {
    const c = this.car;
    $('lv-addimg').addEventListener('click', () => { const f = $('lv-file'); f.dataset.for = 'decal'; f.value = ''; f.click(); });
    $('lv-addtxt').addEventListener('click', () => this.addDecal({ text: c.sponsor || 'SPONSOR', font: 'impact', color: 0xffffff, outline: 0x000000, size: 0.12, name: null }));
    document.querySelectorAll('#lv-list .lv-item').forEach(it => it.addEventListener('click', (e) => {
      const i = +it.dataset.i, act = e.target.dataset?.act;
      if (act === 'del') return this.removeDecal(i);
      if (act === 'dup') { const cp = { ...c.decals[i], id: 'd' + Math.random().toString(36).slice(2, 8) }; if (this.def.panels[cp.panel]) cp.x = Math.min(this.def.panels[cp.panel].W, cp.x + 0.15); c.decals.splice(i + 1, 0, cp); this.sel = i + 1; this.changed(true); return; }
      if (act === 'up') { if (i > 0) { [c.decals[i - 1], c.decals[i]] = [c.decals[i], c.decals[i - 1]]; this.sel = i - 1; this.changed(true); } return; }
      this.sel = i; sfx.move(); this.render();
    }));
    this.bindDecalProps();
  }
  bindDecalProps() {
    const d = this.car.decals[this.sel]; if (!d) return;
    if (d.text != null) {
      this.bindText('lv-dt', v => { d.text = v; });
      $('lv-df').addEventListener('change', (e) => { d.font = e.target.value; this.repaint(); });
      this.bindColour('lv-dc', v => d.color = v); this.bindColour('lv-do', v => { d.outline = v; });
      this.bindCheck('lv-dno', v => { d.outline = v ? unhex($('lv-do').value) : null; });
    }
    $('lv-dp').addEventListener('change', (e) => { const q = this.def.panels[e.target.value]; d.panel = e.target.value; d.x = q.W / 2; d.y = q.H / 2; this.changed(true); });
    this.bindRange('lv-dx', v => d.x = v, ' m'); this.bindRange('lv-dy', v => d.y = v, ' m', 3);
    this.bindRange('lv-ds', v => d.size = v, ' m'); this.bindRange('lv-dr', v => d.rot = v, '°', 0); this.bindRange('lv-da', v => d.opacity = v, '', 2);
    this.bindCheck('lv-dm', v => d.mirror = v); this.bindCheck('lv-dflip', v => d.flip = v);
  }
  syncDecalFields() {
    const d = this.car.decals[this.sel]; if (!d) return;
    for (const [id, v, dp] of [['lv-dx', d.x, 2], ['lv-dy', d.y, 3]]) { const r = $(id); if (r) { r.value = v; $(id + '-v').textContent = (+v).toFixed(dp) + ' m'; } }
  }
  addDecal(d) {
    const c = this.car;
    // start on the left sidepod (the most visible spot; the flank on cars without one), mirrored to the right one
    const pn = this.def.startPanel || 'podL', p = this.def.panels[pn];
    c.decals.push({ id: 'd' + Math.random().toString(36).slice(2, 8), panel: pn, x: p.W * 0.5, y: p.H * 0.4, size: 0.5, rot: 0, opacity: 1, mirror: true, flip: false, ...d });
    this.sel = c.decals.length - 1;
    sfx.select(); this.changed(true);
    this.toast('NOW CLICK ON THE CAR TO PLACE IT');
  }
  removeDecal(i) { this.car.decals.splice(i, 1); this.sel = Math.min(this.sel, this.car.decals.length - 1); sfx.back(); this.changed(true); }
  async importFile(file, target) {
    if (!file) return;
    if (file.size > 12e6) { this.toast('THAT FILE IS TOO BIG (MAX 12 MB)'); return; }
    try {
      const a = await importImageFile(file);
      if (target === 'helmet') { this.car.helmetDesign.decal = a.id; this.changed(true); }
      else if (target === 'suit') { this.car.suit.decal = a.id; this.changed(true); }
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
    const s = this.car.suit;
    return `<h4>RACE SUIT</h4>
      <div class="lv-row">${this.colour('Base', 'lv-s1', s.base)}${this.colour('Accent', 'lv-s2', s.accent)}</div>
      <div class="fld"><label>Design</label></div>${this.seg('lv-sp2', SUIT_PATTERNS, s.pattern)}
      <div class="fld"><label>Chest</label></div>${this.seg('lv-sc', { team: 'Team name', sponsor: 'Sponsor', none: 'Nothing' }, s.chest)}
      <div class="fld"><label>Shoulder patches</label></div>
      <div class="seg"><button id="lv-slogo">${s.decal ? 'Change image' : 'Add image (PNG / SVG)'}</button>${s.decal ? '<button id="lv-sclr">Remove</button>' : ''}</div>
      <p class="muted">Gloves, boots and belt use the livery's detail colour.</p>`;
  }
  bind_suit() {
    const s = this.car.suit;
    this.bindColour('lv-s1', v => s.base = v); this.bindColour('lv-s2', v => s.accent = v);
    this.bindSeg('lv-sp2', v => { s.pattern = v; this.repaint(); }); this.bindSeg('lv-sc', v => { s.chest = v; this.repaint(); });
    $('lv-slogo').addEventListener('click', () => { const f = $('lv-file'); f.dataset.for = 'suit'; f.value = ''; f.click(); });
    $('lv-sclr') && $('lv-sclr').addEventListener('click', () => { s.decal = null; this.changed(true); });
    this.garage.view('driver');
  }

  // FILES: saved teams, export / import, modeller tools
  teams() { try { return JSON.parse(localStorage.getItem(TEAMS_KEY)) || []; } catch (e) { return []; } }
  tab_files() {
    const list = this.teams().map((t, i) => `<div class="lv-item" data-i="${i}"><span class="th" style="background:${hex(t.car.main)}"></span><span class="nm">${esc(t.name)}<br><span class="pn">#${t.car.number} · ${esc(t.car.sponsor || '')}</span></span><button data-act="load">Load</button><button data-act="del">&#10005;</button></div>`).join('');
    return `<h4>MY TEAMS</h4>
      <div class="lv-teams" id="lv-teams">${list || '<p class="muted">No saved teams yet.</p>'}</div>
      <button class="wide hot" id="lv-save">Save "${esc(this.car.teamName)}"</button>
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
      if (act === 'del') { list.splice(i, 1); localStorage.setItem(TEAMS_KEY, JSON.stringify(list)); sfx.back(); return this.render(); }
      if (act === 'load') { const t = list[i]; Object.keys(c).forEach(k => delete c[k]); Object.assign(c, fillLivery(JSON.parse(JSON.stringify(t.car)))); assets.load(liveryAssetIds(c)).then(() => this.repaint()); this.sel = -1; this.rebuild(); this.toast('LOADED ' + t.name.toUpperCase()); sfx.select(); this.render(); }
    }));
    $('lv-save').addEventListener('click', () => {
      const list = this.teams(), name = c.teamName || 'My Team';
      const k = list.findIndex(t => t.name === name), entry = { name, car: JSON.parse(JSON.stringify(c)), saved: Date.now() };
      if (k >= 0) list[k] = entry; else list.unshift(entry);
      try { localStorage.setItem(TEAMS_KEY, JSON.stringify(list.slice(0, 30))); this.toast('SAVED ' + name.toUpperCase()); sfx.best(); } catch (e) { this.toast('COULD NOT SAVE (STORAGE FULL)'); }
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

function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
