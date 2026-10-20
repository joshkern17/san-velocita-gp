// Livery Designer UI: the car's paint, decals placed on the car (by stick or by dragging), the driver's kit and the
// crew, saving and sharing. Its panel is a list of the game's Menu rows (main.js passes it in), so a pad, the keyboard
// and the mouse all work it. Works on the model-independent livery data (livery.js).
import { MODEL as CLASSIC } from './carmodel.js';
import { PATTERNS, HELMET_PATTERNS, SUIT_PATTERNS, SUIT_NUMBERS, CREW_STYLES, VISORS, VISOR_STRIPS, FONTS, assets, importImageFile, decalImage, uvToPanel, uvTemplate, liveryAssetIds, fillLivery, stickerDecals, boundText, boundLogo, BOUND, pathD, shapeBounds } from './livery.js';
import { SPONSOR_LOGOS, logoAsset, parseLogoAsset, logoForName } from './sponsorlogos.js';
const LOGO_SHORT = { color: 'Color', main: 'Brand', black: 'Black', white: 'White' }; // (a sponsor logo's versions, one word each so the buttons line up)
import { VectorEditor } from './vectoredit.js';
import { sfx } from './audio.js';
import { saveLivery, updateLivery, savedLiveries } from './liveries.js';
import { DEV } from './dev.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + ((c ?? 0) >>> 0).toString(16).padStart(6, '0').slice(-6);
const unhex = (s) => parseInt(String(s).replace('#', ''), 16);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SWATCH = [0xc8141c, 0xf2f2f2, 0x121214, 0x1d4fb8, 0x0e2a55, 0x1c7a3a, 0xa4e04a, 0xf4c01a, 0xf07a2a, 0x8d2bd8, 0xff5ce1, 0x3ef0ff, 0xb8bcc4, 0xc9a23a, 0x7a3b12, 0x2a2a30];
const SWATCH_NAMES = ['Red', 'White', 'Black', 'Blue', 'Navy', 'Green', 'Lime', 'Yellow', 'Orange', 'Purple', 'Pink', 'Cyan', 'Silver', 'Gold', 'Brown', 'Charcoal'];
const swatch = (c) => `<span class="swatch" style="background:${hex(c)}"></span>`;
const TABS = [['paint', 'Paint'], ['decals', 'Decals'], ['kit', 'Driver &amp; Crew'], ['saved', 'Saved']];
const KIT_PARTS = { torso: 'Suit', armL: 'Left sleeve', armR: 'Right sleeve', legL: 'Left leg', legR: 'Right leg', helmet: 'Helmet' };
// where a decal lands when it's moved to a part from the list (his left breast; the outside of a sleeve or leg; the side of the helmet)
const KIT_START = { torso: [0.09, 0.3], armL: [0.25, 0.25], armR: [0.75, 0.25], legL: [0.25, 0.3], legR: [0.75, 0.3], helmet: [0.25, 0.42] };


export class LiveryDesigner {
  // menu: the panel's Menu (main.js); hints(): redraw the footer prompts; sponsors: the game's sponsor names
  constructor({ garage, getCar, setCar, onDone, save, locked, menu, hints, sponsors }) {
    this.locked = locked || (() => false); this.menu = menu; this.hints = hints || (() => {}); this.sponsors = sponsors || [];
    this.adding = null; this.place = null;
    this.garage = garage; this.getCar = getCar; this.setCar = setCar; this.onDone = onDone; this.save = save || (() => {});
    this.tab = 'paint'; this.sel = -1; this.ksel = -1; // (ksel: the picked decal on the driver's kit)
    this.vec = new VectorEditor(this); // (the shape editor: js/vectoredit.js)
    document.querySelectorAll('#lv-views button').forEach(b => b.addEventListener('click', () => { garage.view(b.dataset.v); sfx.move(); }));
    $('lv-done').addEventListener('click', () => this.close());
    $('lv-file').addEventListener('change', (e) => this.importFile(e.target.files[0], e.target.dataset.for));
    $('lv-import').addEventListener('change', (e) => this.importLivery(e.target.files[0]));
    window.addEventListener('keydown', (e) => {
      if (!this.active || this.vec.open || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
      if (e.key === 'Delete' && !this.place) { e.preventDefault(); this.deleteSelected(); } // (Esc and the rest: the menu, main.js)
    });
  }
  // B / Esc (the menu's back): the shape editor first, then out (a placed decal's B is Place mode's, main.js)
  back() {
    if (this.vec.open) { this.vec.close(); this.render(); return; }
    if (this.adding) return this.closeAdd();
    this.close();
  }
  get car() { return this.getCar(); }
  // the livery panel map of whichever car model is on the turntable (classic or your imported one)
  get def() { return (this.garage.car && this.garage.car.def) || CLASSIC; }
  open() {
    this.active = true; this.sel = -1; this.ksel = -1; this.place = null; this.viewNow = null; this.menu.i = 0;
    const c = this.car;
    Object.assign(c, fillLivery(c));
    // the built-in sponsor + team name stickers become decals here (same places), so they move like the rest
    if (c.stickers !== 'decals') { if (c.showSponsor) c.decals.unshift(...stickerDecals(c, this.def)); c.stickers = 'decals'; }
    assets.load(liveryAssetIds(c)).then(() => this.repaint());
    this.garage.shift = -0.13; this.garage.view('three'); this.garage.still = true;
    this.garage.onPick = (hit, phase) => this.onPick(hit, phase);
    this.render(); this.firstRow();
    // (World Career: a sponsor's logo, ready to place)
    // (World Career: a sponsor's logo or name, picked out if it's already on the car, else added, ready to place)
    if (this.pending) {
      const d = this.pending; this.pending = null; this.tab = 'decals';
      const i = c.decals.findIndex(x => d.bind ? x.bind === d.bind : x.asset === d.asset);
      if (i >= 0) { this.sel = i; this.render(); this.cursorTo(it => it.dec === i); this.toast('SELECT IT TO PLACE IT'); }
      else if (d.bind) this.addBound(d.bind);
      else assets.load([d.asset]).then(() => this.addDecal({ asset: d.asset, name: d.name, size: 0.45 }));
    }
  }
  close() {
    if (!this.active) return;
    this.vec.close(); this.place = null; document.querySelectorAll('.lv-type').forEach(x => x.remove());
    $('s-livery').classList.remove('placing');
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
    // (only in Place mode does a drag on the car move the decal; otherwise dragging turns the car)
    if (!this.place) return false;
    if (this.tab === 'kit') { // clicks land on the racer's kit
      const d = this.car.suit.decals[this.ksel];
      if (!d || !hit.kit) return false;
      d.part = hit.kit.part; d.u = +hit.kit.u.toFixed(3); d.v = +hit.kit.v.toFixed(3);
      this.dragged = true; this.repaint();
      if (phase === 'down') this.render();
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
    return true;
  }

  // ---------- the panel: one list of the game's Menu rows (pad, keyboard and mouse alike) ----------
  // Four tabs on LB / RB: Paint, Decals, Driver & Crew, Saved. Colors are swatch values (‹ ›, Select opens a full
  // picker); sizes and turns step; text starts from presets (Select types your own). A on a decal: Place mode.
  setTab(k) { if (k === this.tab) return; if (this.tab === 'decals') this.vec.close(); this.adding = null; this.tab = k; this.menu.i = 0; sfx.move(); this.render(); this.firstRow(); }
  stepTab(d) { const k = TABS.findIndex(t => t[0] === this.tab); this.setTab(TABS[(k + d + TABS.length) % TABS.length][0]); }
  // (the cursor on the tab's first row you can use, and the camera where that row wants it)
  firstRow() { const m = this.menu, k = m.items.findIndex(it => !it.head && !it.disabled && !(it.hide && it.hide())); if (k >= 0) { m.i = k; m.render(); this.onRow(m.items[k]); } }
  render() {
    if (!this.active) return;
    const T = $('lv-tabs');
    T.innerHTML = TABS.map(([k, n]) => `<span class="${k === this.tab ? 'on' : ''}" data-k="${k}">${n}</span>`).join('');
    T.querySelectorAll('span').forEach(s => s.onclick = () => this.setTab(s.dataset.k));
    this.menu.setItems(this.rows(), true);
    $('s-livery').classList.toggle('placing', !!this.place);
    const P = this.place, pd = P && this.placeDecal();
    $('lv-place').innerHTML = pd ? `<b>Placing: ${esc(this.decalName(pd))} &middot; ${esc(P.kind === 'kit' ? KIT_PARTS[pd.part] || pd.part : this.def.panels[pd.panel]?.label || pd.panel)}</b><small>${pd.bind === 'number' ? 'Shows each car\'s own number: a teammate\'s car shows theirs here.' : pd.mirror ? 'Mirrored on the far side.' : 'On this side only.'}</small>` : '';
    $('lv-hint').style.display = this.vec.open ? '' : 'none'; // (the shape editor's own how-to; the footer has the rest)
    this.garage.pickMode = this.tab === 'kit' ? 'racer' : 'car';
    this.garage.showCrew(this.tab === 'kit');
    this.hints();
  }
  // the menu's cursor moved: the decal it's on is the one to edit, and the camera goes where that row is about
  onRow(it) {
    if (!it) return;
    let again = false;
    if (it.dec != null && it.dec !== this.sel) { this.sel = it.dec; again = true; if (this.vec.open && !this.car.decals[it.dec]?.path) this.vec.close(); }
    if (it.kdec != null && it.kdec !== this.ksel) { this.ksel = it.kdec; again = true; }
    const v = it.view || (this.tab === 'kit' ? null : 'three');
    if (v && v !== this.viewNow) { this.viewNow = v; this.garage.view(v); }
    if (again) this.render();
  }
  decalName(x) { return x.bind ? BOUND[x.bind] : x.name || x.text || (x.path ? (x.path.closed ? 'Shape' : 'Line') : 'Image'); }
  rows() { return this.adding ? this.rows_add() : this['rows_' + this.tab](); }
  // Add: a list of what you can add (not a ‹ › picker: there's a lot of it), sponsor logos a list of their own
  openAdd(what = this.tab === 'kit' ? 'kit' : 'car') { if (this.tab !== 'kit') this.tab = 'decals'; this.adding = what; this.menu.i = 0; sfx.select(); this.render(); this.firstRow(); }
  closeAdd() { const was = this.adding; this.adding = was === 'logos' ? 'car' : null; this.menu.i = 0; sfx.back(); this.render(); if (this.adding) this.firstRow(); else this.cursorTo(it => it.addRow); }
  rows_add() {
    const T = this, done = (f) => () => { T.adding = null; f(); };
    if (this.adding === 'logos') return [{ label: 'Sponsor Logos', head: true },
      ...Object.entries(SPONSOR_LOGOS).sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => ({ label: esc(n), action: done(() => T.addLogo(k)), desc: `${esc(n)}'s logo, in full color (Version, once it's on, for its other colors).` })),
      { label: 'Back', action: () => T.closeAdd() }];
    if (this.adding === 'kit') return [{ label: 'Add To The Driver', head: true },
      { label: 'Text', action: done(() => T.addOf('kit')), desc: 'Letters on his chest to start with: place them on the suit, a sleeve, a leg or the helmet.' },
      { label: 'Image File (mouse)', action: done(() => T.fileFor('kit')), desc: 'A PNG or SVG of your own.' },
      { label: 'Back', action: () => T.closeAdd() }];
    return [{ label: 'Add To The Car', head: true },
      { label: 'Race Number', action: done(() => T.addOf('number')), desc: 'The car\'s race number, as big outlined figures. Each car shows its own: a teammate in your livery gets theirs here.' },
      { label: 'Team Name', action: done(() => T.addOf('team')), desc: 'Your team\'s name on a bar; it changes when the name does.' },
      { label: 'Sponsor Name', action: done(() => T.addOf('sponsor')), desc: 'The title sponsor\'s name (or logo, if it has one); it changes with the sponsor.' },
      { label: 'Text', action: done(() => T.addOf('text')), desc: 'Your own words: pick a preset or type them.' },
      { label: 'Sponsor Logo &rsaquo;', action: () => { T.adding = 'logos'; T.menu.i = 0; sfx.select(); T.render(); T.firstRow(); }, desc: 'One of the game\'s sponsors\' logos.' },
      { label: 'Image File (mouse)', action: done(() => T.addOf('image')), desc: 'A PNG or SVG of your own. SVGs stay sharp at any size.' },
      { label: 'Shape (mouse)', action: done(() => T.addOf('shape')), desc: 'Draw lines and shapes right on the car with the pen, rectangle or ellipse.' },
      { label: 'Back', action: () => T.closeAdd() }];
  }

  // -- row makers --
  // a color: the swatches on ‹ ›, Select opens the full picker (none: 'None' first, for an outline or a fill)
  colorRow(label, get, set, { none = false, desc = '', view } = {}) {
    const T = this;
    return { label, view, desc: desc || `${label}: &lsaquo; &rsaquo; for the swatches, Select for any color.`,
      get values() { const v = get(), out = [...(none ? [[null, 'None']] : []), ...SWATCH.map((c, k) => [c, `${swatch(c)}${SWATCH_NAMES[k]}`])]; if (v != null && !SWATCH.includes(v)) out.push([v, `${swatch(v)}Custom`]); return out; },
      get: () => { const v = get(); return v ?? null; }, set: (v) => { set(v); T.changed(true); },
      action: () => T.pickColor(get() ?? 0xffffff, (v) => { set(v); T.changed(true); }) };
  }
  // a number stepped by ‹ ›, stopping at its ends
  stepRow(label, get, set, step, min, max, fmt, desc = '', view) {
    const T = this;
    return { label, view, desc, values: [[0, '']], get: () => 0, set: () => {}, show: () => fmt(get()),
      nudge: (d) => { const v = Math.max(min, Math.min(max, +(get() + d * step).toFixed(4))); if (v === get()) return false; set(v); T.changed(true); } };
  }
  pickRow(label, map, get, set, desc = '', view) {
    const T = this;
    return { label, view, desc, values: Object.entries(map), get: () => String(get()), set: (v) => { set(v); T.changed(true); } };
  }
  onOff(label, get, set, desc = '', view) {
    const T = this;
    return { label, view, desc, values: [[true, 'On'], [false, 'Off']], get: () => !!get(), set: (v) => { set(v); T.changed(true); } };
  }
  // text: presets on ‹ ›, Select to type your own (a keyboard)
  textRow(label, get, set, max, presets, desc = '', view) {
    const T = this;
    return { label, view, desc: desc || 'Pick one with &lsaquo; &rsaquo;, or Select to type your own with a keyboard.',
      get values() { const v = get(); return [...new Set([v, ...presets].filter(Boolean))].map(x => [x, esc(x)]); },
      get: () => get(), set: (v) => { set(v); T.changed(true); }, action: () => T.typeText(get(), max, (v) => { set(v); T.changed(true); }) };
  }
  info(text) { return { label: `<span class="lv-note">${text}</span>`, disabled: true }; }
  // the full color picker (the browser's own): a mouse or a keyboard
  pickColor(c, done) { const p = $('lv-pick'); p.value = hex(c); p.oninput = () => done(unhex(p.value)); p.click(); }
  // typing over the row the cursor's on (Enter keeps it, Esc leaves it as it was)
  typeText(val, max, done) {
    const row = this.menu.el.querySelector('.item.sel'); if (!row) return;
    const inp = document.createElement('input'); inp.className = 'lv-type'; inp.maxLength = max; inp.value = val || ''; inp.spellcheck = false;
    inp.style.top = (row.getBoundingClientRect().top - this.menu.el.closest('.lv-side').getBoundingClientRect().top) / (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1) + 'px';
    this.menu.el.closest('.lv-side').appendChild(inp); inp.focus(); inp.select();
    let over = false; // (Enter, then the blur as it goes: once)
    const end = (keep) => { if (over) return; over = true; if (keep && inp.value.trim()) done(inp.value.trim().toUpperCase()); inp.remove(); this.render(); };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); };
    inp.onblur = () => end(true);
  }
  fileFor(what) { const f = $('lv-file'); f.dataset.for = what; f.value = ''; f.click(); }

  // -- PAINT: the team on it, its colors and pattern --
  rows_paint() {
    const c = this.car, L = this.locked(), T = this;
    return [
      { label: 'Team', head: true },
      L ? { label: `Team Name<small>${esc(c.teamName)}</small>`, disabled: true } : this.textRow('Team Name', () => c.teamName, v => c.teamName = v, 22, [], 'Your team\'s name, on the car and the kit. Select to type it.'),
      L ? { label: `Title Sponsor<small>${esc(c.sponsor)}</small>`, disabled: true } : this.textRow('Title Sponsor', () => c.sponsor, v => c.sponsor = v, 14, this.sponsors, 'The sponsor sticker\'s name: &lsaquo; &rsaquo; for the game\'s sponsors, Select to type your own.'),
      this.stepRow('Number', () => c.number, v => c.number = v, 1, 1, 99, v => String(v), 'Your race number. A Race Number decal (Decals) shows it wherever you put it.'),
      ...(L ? [this.info('In the career the team name is the one on Form SV-1 and the sponsor is your title sponsor.')] : []),
      { label: 'Colors', head: true },
      this.colorRow('Main', () => c.main, v => c.main = v), this.colorRow('Accent', () => c.accent, v => c.accent = v), this.colorRow('Detail', () => c.third, v => c.third = v),
      { label: 'Rear Wing', desc: 'The rear wing in its own color, or the car\'s own (road cars: the main color; single-seaters: the accent).',
        get values() { return [['auto', 'Car default'], ...SWATCH.map((x, k) => [x, `${swatch(x)}${SWATCH_NAMES[k]}`]), ...(c.wingColor != null && !SWATCH.includes(c.wingColor) ? [[c.wingColor, `${swatch(c.wingColor)}Custom`]] : [])]; },
        get: () => c.wingColor ?? 'auto', set: (v) => { c.wingColor = v === 'auto' ? null : v; T.changed(true); }, action: () => T.pickColor(c.wingColor ?? c.main, (v) => { c.wingColor = v; T.changed(true); }) },
      { label: 'Pattern', head: true },
      this.pickRow('Pattern', PATTERNS, () => c.pattern, v => c.pattern = v, 'How your three colors are laid out on the car.'),
      this.onOff('Race Numbers', () => c.showNumber, v => c.showNumber = v, 'The car\'s standard number boards. Off if you\'d rather place your own (Decals: Race Number).'),
    ];
  }

  // -- DECALS: add one, the list (A: place it), the picked one's settings --
  addOf(k) {
    const c = this.car;
    if (k === 'kit') return this.addKitDecal({ text: c.sponsor || 'SPONSOR', font: 'impact', color: 0xffffff, outline: null, size: 0.07, name: null }); // (X on Driver & Crew)
    if (k === 'number' || k === 'team' || k === 'sponsor') return this.addBound(k);
    if (k === 'text') return this.addDecal({ text: c.sponsor || 'SPONSOR', font: 'impact', color: 0xffffff, outline: 0x000000, size: 0.12, name: null });
    if (k.startsWith('logo:')) return this.addLogo(k.slice(5));
    if (k === 'image') return this.fileFor('decal');
    if (k === 'shape') { sfx.select(); if (this.vec.open) return this.vec.close(); this.sel = -1; this.vec.start(this.garageSide(), 'pen'); }
  }
  rows_decals() {
    const c = this.car, T = this, d = c.decals[this.sel];
    const rows = [
      { label: 'Add', head: true },
      { label: 'Add A Decal&hellip;', addRow: true, cls: 'action', action: () => T.openAdd('car'), desc: 'A race number, the team or sponsor name, text, a sponsor logo, an image or a shape (X on a pad, from anywhere in the list).' },
      { label: `On The Car<small>${c.decals.length}</small>`, head: true },
      ...(c.decals.length ? [] : [this.info('Nothing on the car yet.')]),
      ...c.decals.map((x, i) => ({ label: `${esc(this.decalName(x))}<small>${esc(this.def.panels[x.panel]?.label || x.panel)}${x.mirror ? ' &middot; both sides' : ''}</small>`, dec: i, action: () => T.startPlace('car', i),
        desc: 'Select to move it on the car. Its settings are under the list.' })),
    ];
    if (!d) return rows;
    const lg = parseLogoAsset(d.asset), bl = d.bind === 'sponsor' && logoForName(boundText(c, 'sponsor')), text = d.text != null && !(bl && d.logo !== 'name');
    rows.push({ label: esc(this.decalName(d)), head: true },
      { label: 'Move It', cls: 'action primary', action: () => T.startPlace('car', T.sel), desc: 'Move it on the car: the d-pad, the left stick, WASD or the arrows (or drag it with the mouse); Y or P for the next panel; LT RT or Z X for size; LB RB or Q E to turn it. A or Enter when it\'s right.' });
    if (d.bind) rows.push(this.info(`Reads ${esc(boundText(c, d.bind) || '(nothing yet)')}: it follows the ${d.bind === 'sponsor' ? 'title sponsor' : d.bind === 'number' ? 'car\'s race number (a teammate in your livery shows theirs here)' : 'team name'}.`));
    if (d.path) rows.push(
      { label: 'Edit Shape (mouse)', action: () => { sfx.select(); if (T.vec.open) T.vec.setTool('node'); else T.vec.start(d.panel, 'move'); }, desc: 'Its points and curves, in the shape editor.' },
      this.colorRow('Fill', () => d.fill, v => d.fill = v, { none: true }), this.colorRow('Stroke', () => d.stroke, v => { d.stroke = v; d.sw = d.sw || 0.04; }, { none: true }),
      this.onOff('Closed', () => d.path.closed, v => { d.path.closed = v && d.path.n.length > 2; }),
      ...(d.stroke != null ? [this.stepRow('Stroke Width', () => d.sw || 0.04, v => d.sw = v, 0.005, 0.005, 0.3, v => v.toFixed(3) + ' m')] : []));
    if (lg) rows.push(this.pickRow('Version', LOGO_SHORT, () => lg.v, v => { d.asset = logoAsset(lg.slug, v); }, 'The logo in color, in its brand color, black or white.'));
    if (bl) rows.push(this.pickRow('Logo', { ...LOGO_SHORT, name: 'Name' }, () => d.logo || 'color', v => { d.logo = v; }, `${esc(SPONSOR_LOGOS[bl])}'s logo, or just its name in letters.`));
    if (bl && d.logo !== 'name') rows.push(this.onOff('Plate', () => d.bar != null, v => { d.bar = v ? c.third : null; }, 'A plate behind the logo.'));
    if (text) rows.push(
      ...(d.bind ? [] : [this.textRow('Text', () => d.text, v => d.text = v, 20, [c.teamName, c.sponsor, 'RACING', 'MOTORSPORT', 'TEAM', 'SAN VELOCITA', 'GP'].filter(Boolean))]),
      this.pickRow('Font', FONTS, () => d.font || 'impact', v => d.font = v),
      this.colorRow('Color', () => d.color ?? 0xffffff, v => d.color = v), this.colorRow('Outline', () => d.outline, v => d.outline = v, { none: true }),
      this.onOff('Background Bar', () => d.bar != null, v => { d.bar = v ? c.third : null; }, 'A bar of the detail color behind the letters.'));
    rows.push(
      { label: 'Panel', get values() { return Object.entries(T.def.panels).map(([k, p]) => [k, esc(p.label)]); }, get: () => d.panel, set: (v) => { const q = T.def.panels[v]; d.panel = v; d.x = q.W / 2; d.y = q.H / 2; T.changed(true); }, desc: 'Which part of the car it\'s on.' },
      this.stepRow(text ? 'Letter Height' : 'Size', () => d.size, v => d.size = v, 0.01, 0.03, 3, v => v.toFixed(2) + ' m'),
      this.stepRow('Rotation', () => d.rot || 0, v => d.rot = v, 5, -180, 180, v => Math.round(v) + '&deg;'),
      this.stepRow('Opacity', () => d.opacity ?? 1, v => d.opacity = v, 0.05, 0.1, 1, v => Math.round(v * 100) + '%'),
      this.onOff('Both Sides', () => d.mirror, v => d.mirror = v, 'Mirrored onto the other side of the car.'),
      this.onOff('Flip', () => d.flip, v => d.flip = v, 'Flipped left to right.'),
      { label: 'Bring Forward', action: () => { const i = T.sel; if (i < c.decals.length - 1) { [c.decals[i + 1], c.decals[i]] = [c.decals[i], c.decals[i + 1]]; T.sel = i + 1; T.changed(true); } }, desc: 'Over the decals after it in the list.' },
      { label: 'Send Back', action: () => { const i = T.sel; if (i > 0) { [c.decals[i - 1], c.decals[i]] = [c.decals[i], c.decals[i - 1]]; T.sel = i - 1; T.changed(true); } }, desc: 'Under the decals before it in the list.' },
      { label: 'Duplicate', action: () => { const i = T.sel, cp = { ...c.decals[i], id: 'd' + Math.random().toString(36).slice(2, 8) }; if (T.def.panels[cp.panel]) cp.x = Math.min(T.def.panels[cp.panel].W, cp.x + 0.15); c.decals.splice(i + 1, 0, cp); T.sel = i + 1; T.changed(true); } },
      { label: 'Delete', confirm: 'Delete it? Select again', action: () => T.removeDecal(T.sel) });
    return rows;
  }

  // -- DRIVER & CREW: helmet, suit, gloves and boots, the logos on them, the crew; the camera on each --
  rows_kit() {
    const c = this.car, h = c.helmetDesign, s = c.suit, cr = c.crew, T = this, d = s.decals[this.ksel];
    const H = 'helmet', D = 'driver', C = 'crew';
    const rows = [
      { label: 'Helmet', head: true },
      this.colorRow('Base', () => h.base, v => h.base = v, { view: H }), this.colorRow('Design', () => h.accent, v => h.accent = v, { view: H }), this.colorRow('Trim', () => h.third, v => h.third = v, { view: H }),
      this.pickRow('Pattern', HELMET_PATTERNS, () => h.pattern, v => h.pattern = v, '', H), this.pickRow('Visor', VISORS, () => h.visor, v => h.visor = v, '', H),
      this.pickRow('Visor Strip', VISOR_STRIPS, () => h.strip || 'team', v => h.strip = v, 'The strip across the top of the visor.', H),
      this.onOff('Number On The Sides', () => h.number, v => h.number = v, '', H),
      { label: `Side Logo (mouse)<small>${h.decal ? 'Image' : 'None'}</small>`, view: H, action: () => h.decal ? (h.decal = null, T.changed(true)) : T.fileFor('helmet'), desc: h.decal ? 'Select to take the image off.' : 'An image of your own (PNG or SVG) on both sides of the helmet.' },
      { label: 'Race Suit', head: true },
      this.colorRow('Base', () => s.base, v => s.base = v, { view: D }), this.colorRow('Accent', () => s.accent, v => s.accent = v, { view: D }),
      this.pickRow('Design', SUIT_PATTERNS, () => s.pattern, v => s.pattern = v, '', D),
      this.pickRow('Chest', { team: 'Team name', sponsor: 'Sponsor', none: 'Nothing' }, () => s.chest, v => s.chest = v, '', D),
      this.pickRow('Race Number', SUIT_NUMBERS, () => s.number, v => s.number = v, '', D),
      { label: `Shoulder Patches (mouse)<small>${s.decal ? 'Image' : 'None'}</small>`, view: D, action: () => s.decal ? (s.decal = null, T.changed(true)) : T.fileFor('suit'), desc: s.decal ? 'Select to take the image off.' : 'An image of your own (PNG or SVG) on both shoulders.' },
      this.colorRow('Gloves', () => s.gloves, v => s.gloves = v, { view: D }), this.colorRow('Boots', () => s.boots, v => s.boots = v, { view: D, desc: 'Boots get a stripe in the suit\'s accent color.' }),
      { label: `Logos On The Driver<small>${s.decals.length}</small>`, head: true },
      { label: 'Add A Logo&hellip;', addRow: true, cls: 'action', view: D, action: () => T.openAdd('kit'), desc: 'Text or an image on the suit, a sleeve, a leg or the helmet (X on a pad). Your pit crew wear them too.' },
      ...s.decals.map((x, i) => ({ label: `${esc(x.name || x.text || 'Image')}<small>${KIT_PARTS[x.part] || x.part}${x.mirror ? ' &middot; both sides' : ''}</small>`, kdec: i, view: x.part === 'helmet' ? H : D,
        action: () => T.startPlace('kit', i), desc: 'Select to move it on the driver. Its settings are under the list.' })),
    ];
    if (d) {
      const v = d.part === 'helmet' ? H : D;
      rows.push({ label: esc(d.name || d.text || 'Image'), head: true },
        { label: 'Move It', cls: 'action primary', view: v, action: () => T.startPlace('kit', T.ksel), desc: 'Move it on the driver: the d-pad, the left stick, WASD or the arrows (or drag it with the mouse); Y or P for the next part. A or Enter when it\'s right.' });
      if (d.text != null) rows.push(this.textRow('Text', () => d.text, x => d.text = x, 20, [c.teamName, c.sponsor, 'RACING'].filter(Boolean), '', v),
        this.pickRow('Font', FONTS, () => d.font || 'impact', x => d.font = x, '', v),
        this.colorRow('Color', () => d.color ?? 0xffffff, x => d.color = x, { view: v }), this.colorRow('Outline', () => d.outline, x => d.outline = x, { none: true, view: v }));
      rows.push(
        { label: 'Part', view: v, values: Object.entries(KIT_PARTS), get: () => d.part, set: (x) => { d.part = x; [d.u, d.v] = KIT_START[x]; T.changed(true); T.garage.view(x === 'helmet' ? H : D); }, desc: 'Where on the driver it goes.' },
        this.stepRow(d.text != null ? 'Letter Height' : 'Size', () => d.size, x => d.size = x, 0.01, 0.02, 0.6, x => Math.round(x * 100) + '%', '', v),
        this.stepRow('Rotation', () => d.rot || 0, x => d.rot = x, 5, -180, 180, x => Math.round(x) + '&deg;', '', v),
        this.stepRow('Opacity', () => d.opacity ?? 1, x => d.opacity = x, 0.05, 0.1, 1, x => Math.round(x * 100) + '%', '', v),
        this.onOff('Both Sides', () => d.mirror, x => d.mirror = x, '', v), this.onOff('Flip', () => d.flip, x => d.flip = x, '', v),
        { label: 'Duplicate', view: v, action: () => { const i = T.ksel, cp = { ...s.decals[i], id: 'k' + Math.random().toString(36).slice(2, 8), v: Math.min(1, s.decals[i].v + 0.08) }; s.decals.splice(i + 1, 0, cp); T.ksel = i + 1; T.changed(true); } },
        { label: 'Delete', view: v, confirm: 'Delete it? Select again', action: () => T.removeKitDecal(T.ksel) });
    }
    rows.push({ label: 'Pit Crew', head: true },
      this.pickRow('Crew Kit', CREW_STYLES, () => cr.style, x => cr.style = x, cr.style === 'classic' ? 'Mechanic\'s coveralls in a color near the team\'s.' : 'Your crew wear the kit with your sponsors, without race numbers.', C),
      ...(cr.style === 'own' ? [this.colorRow('Crew Base', () => cr.base, x => cr.base = x, { view: C }), this.colorRow('Crew Accent', () => cr.accent, x => cr.accent = x, { view: C })] : []));
    return rows;
  }

  // -- SAVED: keep it, share it --
  rows_saved() {
    const c = this.car, T = this, mine = c.design && savedLiveries().find(e => e.id === c.design);
    const saved = (e, verb) => { if (!e) { sfx.error(); return T.toast('COULD NOT SAVE (STORAGE FULL)'); } c.design = e.id; T.save(); sfx.best(); T.toast(e.dropped ? `${verb} · STORAGE WAS FULL: ${e.dropped} OLDEST REMOVED (EXPORT TO KEEP COPIES)` : verb); T.render(); };
    return [
      { label: 'Save', head: true },
      ...(mine ? [{ label: `Update ${esc(mine.name)}`, confirm: 'Write over it? Select again', action: () => saved(updateLivery(mine.id, c, () => {}), 'UPDATED ' + mine.name.toUpperCase()), desc: `Saves this livery over ${esc(mine.name)}, the one it came from.` }] : []),
      { label: mine ? 'Save As New' : `Save ${esc(c.teamName || 'This Livery')}`, cls: 'action primary', action: () => saved(saveLivery(c, () => {}), 'SAVED ' + String(c.teamName || 'Your Team').toUpperCase()),
        desc: 'Keeps a copy in Saved Liveries (in the Garage), where each one is tried on the car as you move to it. Your car keeps this look anyway: it saves as you go.' },
      { label: 'Share', head: true },
      { label: 'Export Livery File', action: () => T.exportLivery(), desc: 'One file with the whole design and your images: send it to a friend, or keep a backup. It goes to your Downloads.' },
      { label: 'Import Livery File (mouse)', action: () => { const f = $('lv-import'); f.value = ''; f.click(); }, desc: 'A livery file someone sent you, onto this car.' },
      ...(DEV ? [{ label: 'For 3D Modelers', head: true },
        { label: 'UV Template (PNG)', action: () => (T.def.template ? T.def.template() : uvTemplate(T.def)).toBlob(b => download(`uv-template-${T.def.id}.png`, b)), desc: 'Liveries are stored per panel, not per model: UV-unwrap a new model so each panel lands where this template has it. See docs/CAR-MODELS.md.' },
        { label: 'This Livery\'s Texture', action: () => { const cv = T.garage.car?.livery; if (cv) cv.toBlob(b => download(`${(c.teamName || 'livery').replace(/\W+/g, '-')}-texture.png`, b)); } }] : []),
    ];
  }
  exportLivery() {
    const c = this.car, data = { svgpLivery: 1, model: this.def.id, car: c, assets: assets.pick(liveryAssetIds(c)) };
    download(`${(c.teamName || 'livery').replace(/[^\w -]/g, '').trim() || 'livery'}.svgp-livery.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
    this.toast('LIVERY EXPORTED');
  }

  // ---------- Place mode: the decal on the stick (or WASD); ‹ › the next panel; size, turn; A drops, B puts it back ----------
  placeDecal() { const P = this.place; return P && (P.kind === 'kit' ? this.car.suit.decals : this.car.decals)[P.i]; }
  startPlace(kind, i) {
    const d = (kind === 'kit' ? this.car.suit.decals : this.car.decals)[i]; if (!d) return;
    this.place = { kind, i, orig: JSON.parse(JSON.stringify(d)), t: 0 };
    if (kind === 'kit') { this.ksel = i; this.garage.view(d.part === 'helmet' ? 'helmet' : 'driver'); } else this.sel = i;
    sfx.select(); this.render();
  }
  // inp: x, y (-1..1, the stick), next (-1 / 0 / 1), size, rot (-1..1 held), drop, cancel
  placeTick(dt, inp) {
    const P = this.place, d = this.placeDecal(); if (!d) { this.place = null; return this.render(); }
    if (inp.cancel) { const arr = P.kind === 'kit' ? this.car.suit.decals : this.car.decals; arr[P.i] = P.orig; this.place = null; sfx.back(); return this.changed(true); }
    if (inp.drop) { this.place = null; sfx.select(); return this.changed(true); }
    let moved = false;
    if (P.kind === 'kit') {
      if (inp.next) { const ks = Object.keys(KIT_PARTS), k = (ks.indexOf(d.part) + inp.next + ks.length) % ks.length; d.part = ks[k]; [d.u, d.v] = KIT_START[d.part]; this.garage.view(d.part === 'helmet' ? 'helmet' : 'driver'); sfx.move(); moved = true; this.render(); }
      if (inp.x || inp.y) { d.u = Math.max(0, Math.min(1, d.u + inp.x * dt * 0.35)); d.v = Math.max(0, Math.min(1, d.v + inp.y * dt * 0.35)); moved = true; }
      if (inp.size) { d.size = Math.max(0.02, Math.min(0.6, d.size * (1 + inp.size * dt * 0.9))); moved = true; }
    } else {
      const ks = Object.keys(this.def.panels);
      if (inp.next) { const k = (ks.indexOf(d.panel) + inp.next + ks.length) % ks.length, q = this.def.panels[ks[k]]; d.panel = ks[k]; d.x = q.W / 2; d.y = q.H / 2; sfx.move(); moved = true; this.render(); }
      const p = this.def.panels[d.panel];
      if (p && (inp.x || inp.y)) { const sp = Math.max(0.5, Math.min(2, p.W * 0.35)); d.x = Math.max(0, Math.min(p.W, d.x + inp.x * dt * sp)); d.y = Math.max(0, Math.min(p.H, d.y + inp.y * dt * sp)); moved = true; }
      if (inp.size) { d.size = Math.max(0.03, Math.min(3, d.size * (1 + inp.size * dt * 0.9))); moved = true; }
    }
    if (inp.rot) { let r = (d.rot || 0) + inp.rot * dt * 90; r = ((r + 180) % 360 + 360) % 360 - 180; d.rot = r; moved = true; }
    // (painting the car is the slow part: at most every 50 ms while it moves)
    if (moved) { P.t += dt; if (P.t > 0.05 || inp.next) { P.t = 0; this.repaint(); } }
  }
  cursorTo(f) { const k = this.menu.items.findIndex(f); if (k >= 0) { this.menu.i = k; this.menu.render(); } }
  deleteSelected() {
    if (this.tab === 'decals' && this.car.decals[this.sel]) this.removeDecal(this.sel);
    else if (this.tab === 'kit' && this.car.suit.decals[this.ksel]) this.removeKitDecal(this.ksel);
  }

  // the panel facing the camera now (where a new shape starts)
  garageSide() {
    const P = this.def.panels, y = ((this.garage.yaw - this.garage.table.rotation.y) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), p = this.garage.pitch;
    const pick = (...names) => names.find(n => P[n]);
    if (p > 0.9) return pick('top');
    if (Math.abs(Math.sin(y)) >= 0.5) return Math.sin(y) > 0 ? pick('sideL', 'podL', this.def.startPanel) : pick('sideR', 'podR', 'sideL');
    return Math.cos(y) > 0 ? pick('front', 'sideL', this.def.startPanel) : pick('rear', 'sideL', this.def.startPanel);
  }
  addDecal(d) {
    this.vec.close(); // (images and text are placed on the 3D car the usual way)
    const c = this.car;
    // start on the left sidepod (the most visible spot; the flank on cars without one), mirrored to the right one
    const pn = this.def.startPanel || 'podL', p = this.def.panels[pn];
    c.decals.push({ id: 'd' + Math.random().toString(36).slice(2, 8), panel: pn, x: p.W * 0.5, y: p.H * 0.4, size: 0.5, rot: 0, opacity: 1, mirror: true, flip: false, ...d });
    this.sel = c.decals.length - 1; this.tab = 'decals';
    sfx.select(); this.changed(true); this.cursorTo(it => it.label === 'Move It'); // (one press to move it)
    this.toast('ADDED ON BOTH SIDES: MOVE IT IS UNDER THE LIST');
  }
  // the title sponsor's name / the team name, as a sticker that keeps up with it
  addBound(bind) {
    const c = this.car;
    if (bind === 'number') return this.addDecal({ bind, text: '', font: 'impact', color: c.accent, outline: c.third, bar: null, size: 0.2, name: null }); // (big and outlined, like a race number)
    this.addDecal({ bind, text: '', font: 'impact', color: c.accent, outline: null, bar: c.third, size: bind === 'sponsor' ? 0.12 : 0.09, name: null });
  }
  // a sponsor's logo (js/sponsorlogos.js) as an image decal, its width set so it's about as tall as a name sticker
  addLogo(slug) {
    const id = logoAsset(slug), place = (im) => this.addDecal({ asset: id, name: SPONSOR_LOGOS[slug], size: +Math.min(0.9, 0.24 * im.naturalWidth / im.naturalHeight).toFixed(2) });
    const im = decalImage(id, () => place(decalImage(id))); if (im) place(im);
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

  addKitDecal(d) {
    const s = this.car.suit;
    // start on his left breast, over the heart
    s.decals.push({ id: 'k' + Math.random().toString(36).slice(2, 8), part: 'torso', u: 0.09, v: 0.3, size: 0.12, rot: 0, opacity: 1, mirror: false, flip: false, ...d });
    this.ksel = s.decals.length - 1; this.tab = 'kit';
    sfx.select(); this.changed(true); this.garage.view('driver'); this.cursorTo(it => it.label === 'Move It');
    this.toast('ADDED ON HIS CHEST: MOVE IT IS UNDER THE LIST');
  }
  removeKitDecal(i) { const s = this.car.suit; s.decals.splice(i, 1); this.ksel = Math.min(this.ksel, s.decals.length - 1); sfx.back(); this.changed(true); }


  async importLivery(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !data.svgpLivery || !data.car) throw new Error('not a livery file');
      for (const [id, url] of Object.entries(data.assets || {})) await assets.save(id, url);
      // (onto this car, the model you're in, and you keep your own helmet, suit and crew)
      const c = this.car, keep = { chassis: c.chassis, helmet: c.helmet, helmetDesign: c.helmetDesign, suit: c.suit, crew: c.crew }; Object.keys(c).forEach(k => delete c[k]); Object.assign(c, fillLivery({ ...data.car, ...keep }));
      this.sel = -1; this.rebuild(); this.render(); sfx.select(); this.toast('IMPORTED ' + String(c.teamName || '').toUpperCase());
    } catch (e) { sfx.error(); this.toast('THAT IS NOT A LIVERY FILE'); }
  }
}

function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
