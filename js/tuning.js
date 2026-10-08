// The Tuning screen (s-tuning): a car's setup (setup.js), in three tabs down the left (laid out like the Garage, the
// car in full view beside it, and you can look round it):
//   SIMPLE      up to seven plain controls (each moves several adjustments together)
//   REALISTIC   every adjustment, grouped as the Garage groups its parts (aero, suspension, alignment, brakes & diff,
//               gearing)
//   SAVED       the car's setups: pick the one it races with, name it, start a new one from it, delete it
// You edit a draft of the car's active setup: nothing reaches the car until you Save (Esc with unsaved changes asks
// once, then leaves them). Saving the Standard setup makes a new one, named after the circuit if you're at one
// ("Auburn"), else "Setup 1"; Save As New keeps the one you started from. Across the top right, what
// the setup does against the standard car, measured (setup.js measure): top speed, 0-100, slow and fast corner grip,
// braking, and where it sits from understeer to oversteer.
// main.js owns the screen (input, the Menu widget, the 3D backdrop); this builds the rows, the strip and the naming.
import { CARS } from './cars.js';
import {
  defaultSetup, activeSetup, activeName, setupList, saveSetup, useSetup, deleteSetup, renameSetup, nextName, isStandard,
  simpleFields, realisticFields, applySetup, measure, measureBase, fixGears, TABS, units,
} from './setup.js';

const TAB_NAMES = ['Simple', 'Realistic', 'Saved'];
const snap = (v, step) => +(Math.round(v / step) * step).toFixed(4);
// names to pick from with a controller (the circuit you're at goes first)
const NAMES = ['Qualifying', 'Race', 'Wet', 'High Downforce', 'Low Downforce', 'Stable', 'Agile', 'Long Run'];

export class Tuning {
  // el: { sub, tabs, resp, col } elements; menu: the screen's Menu; hooks: { sfx, onChange() }
  constructor(el, menu, hooks = {}) { this.el = el; this.menu = menu; this.hooks = hooks; this.tab = 0; this.id = null; this.mT = 0; }

  // track: the circuit's name when it's opened at one (the pit garage, the grid): new setups are named after it
  open(id, { mph = false, tab = null, track = null } = {}) {
    this.id = id; units.mph = mph; this.track = track;
    this.load(activeName(id));
    if (tab != null) this.tab = tab;
    this.base = measureBase(id); this.cur = null; this.lastTab = -1;
    this.render(); this.measureSoon(0);
  }
  close() { this.endTyping(false); this.id = null; clearTimeout(this.mT); }
  // a saved setup (or the standard, null) into the editor: the draft, and what it was when loaded
  load(name) { this.name = name; this.st = (name && activeSetup(this.id)) || defaultSetup(this.id); this.saved = JSON.stringify(this.st); this.armed = false; }
  get dirty() { return !!this.id && JSON.stringify(this.st) !== this.saved; }
  save(asNew = false) {
    const id = this.id; if (!this.name || asNew) { this.name = nextName(id, this.track); this.names = null; }
    saveSetup(id, this.name, this.st); this.saved = JSON.stringify(this.st); this.armed = false;
    this.hooks.sfx?.select(); this.render(); this.hooks.onChange && this.hooks.onChange(this.st);
  }
  discard() { this.st = JSON.parse(this.saved); this.armed = false; this.render(); this.measureSoon(0); this.hooks.onChange && this.hooks.onChange(this.st); }
  // leaving: fine when it's all saved; with unsaved changes the first Esc says so, the second leaves them behind
  leave() {
    if (!this.dirty || this.armed) { if (this.dirty) this.discard(); return true; }
    this.armed = true; this.renderHead(); return false;
  }
  setTab(t) { this.endTyping(false); this.tab = (t + TAB_NAMES.length) % TAB_NAMES.length; this.render(); }

  // ---- the setup changing: saved straight away (a change to the Standard setup starts a new one) ----
  // (the draft changed: the strip measures it and the car on screen shows it; nothing's saved yet)
  changed() { this.armed = false; this.renderHead(); this.measureSoon(); this.hooks.onChange && this.hooks.onChange(this.st); }
  measureSoon(ms = 140) {
    clearTimeout(this.mT); this.el.resp.classList.add('busy');
    this.mT = setTimeout(() => { if (!this.id) return; this.cur = measure(applySetup(CARS[this.id].spec, this.st, this.id)); this.el.resp.classList.remove('busy'); this.renderResp(); }, ms);
  }

  // ---- rows ----
  // one adjustment as a Menu row: ‹ › nudge it a step (clamped, no wrapping), a little range bar with the standard
  // marked, the value as the car would quote it; its description: what turning it down / up does
  row(f, std) {
    const id = this.id, st = this.st;
    const val = () => snap(f.get(st), f.step), p = (v) => (v - f.min) / (f.max - f.min);
    return {
      label: f.label, values: [[0, '']],
      show: () => {
        const v = val(), s0 = snap(f.get(std), f.step), moved = Math.abs(v - s0) > f.step / 2;
        return `<i class="tn-rng${moved ? ' moved' : ''}" style="--p:${p(v).toFixed(3)};--s:${p(s0).toFixed(3)}"></i><span class="tn-v">${f.fmt(v, st)}</span>`;
      },
      nudge: (d) => {
        const v = Math.max(f.min, Math.min(f.max, snap(val() + d * f.step, f.step)));
        if (v === val()) return false;
        f.set(st, v); if (f.gearCheck || f.k === 'final') fixGears(st, id); this.changed(); return true;
      },
      desc: `<p><b>&#8249; Less</b>${f.less}</p><p><b>More &#8250;</b>${f.more}</p>`,
    };
  }
  items() {
    const id = this.id, std = defaultSetup(id);
    if (this.tab === 0) return [...simpleFields(id).map(f => this.row(f, std)), ...this.actions()];
    if (this.tab === 1) {
      const out = [], fs = realisticFields(id);
      for (const [k, name] of TABS) { const g = fs.filter(f => f.tab === k); if (!g.length) continue; out.push({ head: true, label: name }); out.push(...g.map(f => this.row(f, std))); }
      return [...out, ...this.actions()];
    }
    // saved setups: the standard, then yours (the one you race with marked); select one to race with it
    const list = setupList(id), act = this.name;
    const pick = (name) => { useSetup(id, name); this.names = null; this.load(name); this.hooks.sfx?.select(); this.render(); this.measureSoon(0); this.hooks.onChange && this.hooks.onChange(this.st); };
    const T = this; // (picking another setup throws away unsaved changes: it asks first)
    const choose = (o) => Object.defineProperty(o, 'confirm', { get: () => T.dirty ? 'Lose unsaved changes? Select again' : null, enumerable: true });
    const tag = (on) => on ? '<small class="tn-live">Racing with it</small>' : '';
    // (the names to step through stay put while you're on this setup, so ‹ › walks one list)
    if (act && (!this.names || this.namesFor !== id || !this.names.includes(act))) { this.names = [...new Set([act, ...(this.track ? [this.track] : []), ...NAMES])]; this.namesFor = id; }
    const names = act ? this.names : [];
    return [
      { head: true, label: 'Setups for this car' },
      choose({ label: `Standard${tag(!act)}`, action: () => pick(null), desc: '<p>The car as it comes: what the AI races with. Your own setups stay saved.</p>' }),
      ...list.map(x => choose({ label: `${x.name}${tag(x.name === act)}`, action: () => pick(x.name), desc: `<p>Race with ${x.name}. Saved ${new Date(x.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.</p>` })),
      ...(act ? [
        { head: true, label: act },
        { label: 'Name', values: names.map(n => [n, n]), get: () => this.name, set: (n) => { this.name = renameSetup(id, this.name, n); this.render(); },
          action: () => this.startTyping(), desc: '<p>&#8249; &#8250; pick a name. Enter to type your own.</p>' },
        { label: 'Save As New Setup', cls: 'action', action: () => this.save(true),
          desc: `<p>Saves what's on the car now under a new name, and races with it. ${act} stays as it was saved.</p>` },
        { label: `Delete ${act}`, confirm: 'Delete it? Select again', cls: 'action',
          action: () => { deleteSetup(id, act); this.load(null); this.render(); this.measureSoon(0); this.hooks.onChange && this.hooks.onChange(this.st); },
          desc: `<p>Delete ${act}. The car goes back to the standard setup.</p>` },
      ] : []),
    ];
  }
  // Save, Save As New, Discard, Reset (their state follows the draft: getters, read each time the list draws)
  actions() {
    const id = this.id, T = this;
    return [
      { head: true, label: 'Setup' },
      { get label() { return `Save<small>${T.name || nextName(id, T.track)}</small>`; }, cls: 'action primary', get disabled() { return !T.dirty; }, action: () => this.save(),
        get desc() { return T.name ? `<p>Saves these changes to ${T.name}: the car races with it from now on.</p>` : `<p>Saves these changes as a new setup, ${nextName(id, T.track)}, and races with it. The standard setup stays as it is.</p>`; } },
      { label: 'Save As New Setup', cls: 'action', get disabled() { return !T.dirty || !T.name; }, action: () => this.save(true),
        get desc() { return `<p>Saves these changes under a new name and races with it. ${T.name || ''} stays as it was saved.</p>`; } },
      { label: 'Discard Changes', confirm: 'Discard them? Select again', cls: 'action', get disabled() { return !T.dirty; }, action: () => this.discard(),
        get desc() { return `<p>Back to ${T.name || 'the standard setup'} as it was saved.</p>`; } },
      { label: 'Reset To Standard', confirm: 'Reset every adjustment? Select again', cls: 'action', get disabled() { return isStandard(id, T.st); },
        action: () => { this.st = defaultSetup(id); this.changed(); this.render(); }, desc: '<p>Every adjustment back to how the car comes (not saved until you Save).</p>' },
    ];
  }

  // ---- typing a name (a keyboard: Enter on the Name row) ----
  startTyping() {
    const row = this.menu.el.querySelector('.item.sel'); if (!row || !this.name) return;
    const inp = this.input = document.createElement('input');
    inp.className = 'tn-name'; inp.maxLength = 24; inp.value = this.name; inp.spellcheck = false;
    const m = this.menu.el; inp.style.top = (m.offsetTop + row.offsetTop - m.scrollTop) + 'px'; inp.style.height = row.offsetHeight + 'px';
    this.menu.el.parentElement.appendChild(inp); inp.focus(); inp.select();
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') this.endTyping(true); else if (e.key === 'Escape') this.endTyping(false); };
    inp.onblur = () => this.endTyping(true);
  }
  endTyping(keep) {
    const inp = this.input; if (!inp) return; this.input = null;
    if (keep && this.id && this.name) { this.name = renameSetup(this.id, this.name, inp.value); this.hooks.sfx?.select(); }
    inp.remove(); if (this.id) this.render();
  }
  get typing() { return !!this.input; }

  // ---- drawing ----
  render() {
    if (!this.id) return;
    this.el.tabs.innerHTML = TAB_NAMES.map((n, k) => `<span class="${k === this.tab ? 'on' : ''}" data-k="${k}">${n}</span>`).join('');
    this.el.tabs.querySelectorAll('span').forEach(s => s.onclick = () => { if (+s.dataset.k !== this.tab) { this.hooks.sfx?.move(); this.setTab(+s.dataset.k); } });
    const keep = this.lastTab === this.tab;
    this.menu.setItems(this.items(), keep); this.lastTab = this.tab;
    // (the Saved tab opens on the setup you race with)
    if (this.tab === 2 && !keep) { const k = this.menu.items.findIndex(it => !it.head && it.label.includes('tn-live')); if (k >= 0) { this.menu.i = k; this.menu.render(); } }
    this.renderHead(); this.renderResp();
  }
  renderHead() {
    const tail = this.armed ? ' &middot; <em class="tn-warn">Unsaved: Esc again to leave without saving</em>' : this.dirty ? ' &middot; <em class="tn-warn">Unsaved changes</em>' : '';
    this.el.sub.innerHTML = `${CARS[this.id].name} &middot; ${this.name || 'Standard setup'}${tail}`;
  }
  renderResp() {
    const b = this.base, c = this.cur || b, mph = units.mph;
    const sp = (ms) => mph ? ms * 2.23694 : ms * 3.6;
    // a column of the strip: label, figure + unit, its change against the standard (better blue, worse pink)
    const col = (label, v, v0, fmt, unit, higher, eps) => {
      const d = v - v0, show = Math.abs(d) >= eps, good = higher ? d > 0 : d < 0;
      return `<div><small>${label}</small><b>${fmt(v)}<i>${unit}</i></b><em class="${show ? (good ? 'good' : 'bad') : ''}">${show ? (d > 0 ? '+' : '−') + fmt(Math.abs(d)) : '&mdash;'}</em></div>`;
    };
    const spin = c.balSlow >= 0.3 || c.balFast >= 0.3;
    const pos = (bal) => Math.max(0.02, Math.min(0.98, 0.5 + bal * 0.5));
    const word = spin ? 'Spins at the limit' : c.bal < -0.55 ? 'Strong understeer' : c.bal < -0.2 ? 'Safe understeer' : c.bal < 0.05 ? 'Neutral' : 'Loose';
    this.el.resp.innerHTML = `<div class="tn-strip">`
      + col('Top Speed', sp(c.top), sp(b.top), v => Math.round(v), mph ? 'MPH' : 'KM/H', true, 1)
      + col(mph ? '0-60 MPH' : '0-100 KM/H', mph ? c.t60 : c.t100, mph ? b.t60 : b.t100, v => v.toFixed(2), 'S', false, 0.02)
      + col('Slow Corners', c.slowG, b.slowG, v => v.toFixed(2), 'G', true, 0.01)
      + col('Fast Corners', c.fastG, b.fastG, v => v.toFixed(2), 'G', true, 0.01)
      + col(mph ? 'Braking 100-0' : 'Braking 160-0', mph ? c.stop * 3.28 : c.stop, mph ? b.stop * 3.28 : b.stop, v => v.toFixed(1), mph ? 'FT' : 'M', false, 0.2)
      // the balance: a column like the strip's (its verdict), then where it sits between the two ends (the standard dim)
      + `</div><div class="tn-bal${spin ? ' spin' : ''}"><div class="tn-bal-k"><small>Balance</small><b>${word}</b></div>`
      + `<div class="tn-bal-m"><div class="tn-bal-bar"><i class="std" style="left:${(pos(b.bal) * 100).toFixed(1)}%"></i><i class="cur" style="left:${(pos(c.bal) * 100).toFixed(1)}%"></i></div>`
      + `<div class="tn-bal-e"><span>Understeer</span><span>Neutral</span><span>Oversteer</span></div></div></div>`;
  }
}
