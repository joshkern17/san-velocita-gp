// Circuit Designer on a controller: an on-screen cursor the left stick moves (a dead zone for drift, slow and exact on a
// light push), and A is the mouse button: a click, held for a drag, twice quickly for a double-click. Everything on the
// map works as it does with a mouse, because it is the mouse: the same events, at the cursor.
//   left stick: the cursor · A: click / drag / double-click · X: delete · B: back (Esc) · Y: undo
//   LB RB: the modes · d-pad left right: the open mode's tools · LT RT: zoom at the cursor · right stick: pan
//   Start: the menu (test drive, race, save, open...) · View: the 3D view
// main.js reads the pad and calls padTick(dt, P) while the editor's up.
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const dz = (v, z = 0.22) => Math.abs(v) < z ? 0 : Math.sign(v) * (Math.abs(v) - z) / (1 - z);

export function installPad(Editor) {
  const draw0 = Editor.prototype.draw;
  Object.assign(Editor.prototype, {
    // P: { lx, ly, rx, ry, lt, rt (0..1), a (held), pressed: { a, b, x, y, lb, rb, left, right, up, down, start, view } }
    padTick(dt, P) {
      if (!this.active) return;
      if (!$('ed-modal').hidden) return this.padModal(P.pressed);
      if (this.v3d) { if (P.pressed.view || P.pressed.b) this.toggle3d(); return; } // (the 3D view flies on its own pad controls)
      if (!this.W) return;
      if (!this.pc || !isFinite(this.pc.x)) this.pc = { x: this.W / 2, y: this.H / 2, a: false, lastA: -1, ax: 0, ay: 0 }; // (the middle of the map, once it has a size)
      const C = this.pc, p = P.pressed, lx = dz(P.lx), ly = dz(P.ly);
      let moved = false;
      if (lx || ly) { // (squared: a light push creeps for the fine work, a full one crosses the map)
        const sp = 950 * dt; C.x = Math.max(0, Math.min(this.W, C.x + Math.sign(lx) * lx * lx * sp)); C.y = Math.max(0, Math.min(this.H, C.y + Math.sign(ly) * ly * ly * sp)); moved = true;
      }
      const rx = dz(P.rx), ry = dz(P.ry);
      if (rx || ry) { const k = 900 * dt / this.view.scale; this.view.cx += rx * k; this.view.cz += ry * k; this.dirty = true; if (C.a) moved = true; }
      const zoom = (P.rt || 0) - (P.lt || 0);
      if (Math.abs(zoom) > 0.05) { const [wx, wz] = this.s2w(C.x, C.y); this.view.scale = Math.max(0.04, Math.min(8, this.view.scale * Math.pow(2.2, zoom * dt))); const [nx, nz] = this.s2w(C.x, C.y); this.view.cx += wx - nx; this.view.cz += wz - nz; this.dirty = true; }
      if (moved) { this.padMouse('mousemove'); this.dirty = true; }
      // A: down, held (drag), up; twice quickly on the same spot: a double-click
      if (P.a && !C.a) {
        const t = performance.now(), again = t - C.lastA < 320 && Math.hypot(C.x - C.ax, C.y - C.ay) < 8;
        C.a = true; C.lastA = t; C.ax = C.x; C.ay = C.y;
        this.padMouse('mousedown');
        if (again) { this.padMouse('mouseup'); C.a = false; this.padMouse('dblclick'); C.lastA = -1; }
      } else if (!P.a && C.a) { C.a = false; this.padMouse('mouseup'); }
      if (p.x) this.padKey('Delete');
      if (p.b) this.padKey('Escape');
      if (p.y) this.undo();
      if (p.lb || p.rb) { const M = ['shape', 'trackside', 'scenery', 'location']; this.setMode(M[(M.indexOf(this.mode) + (p.rb ? 1 : -1) + M.length) % M.length]); sfx.move(); }
      if (p.left || p.right) this.padTool(p.right ? 1 : -1);
      if (p.start) this.padMenu();
      if (p.view) this.toggle3d();
      if (!this.padOn) { this.padOn = true; document.getElementById('s-editor').classList.add('pad'); this.dirty = true; }
    },
    // (a mouse event at the cursor: down and double-click on the map, move and up on the window, as the mouse's are)
    padMouse(type) {
      const r = this.canvas.getBoundingClientRect(), C = this.pc;
      const ev = new MouseEvent(type, { clientX: r.left + C.x, clientY: r.top + C.y, button: 0, buttons: type === 'mouseup' ? 0 : 1, bubbles: true, cancelable: true });
      (type === 'mousedown' || type === 'dblclick' ? this.canvas : window).dispatchEvent(ev);
    },
    padKey(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); },
    // the open mode's tools in the dock, in order
    padTool(d) {
      const B = [...document.querySelectorAll('.ed-strip [data-tool]')].filter(b => b.offsetParent);
      if (!B.length) return;
      const lit = this.tool === 'paint' && this.paintMode === 'shape' ? 'runoff' : this.tool, k = B.findIndex(b => b.dataset.tool === lit);
      this.setTool(B[(k + d + B.length) % B.length].dataset.tool); sfx.move();
    },
    // Start: what the top bar does, as a list
    padMenu() {
      const act = (a) => () => { this.closeModal(); this.action(a); };
      this.modalList('Menu', [
        { title: 'Test Drive', desc: 'Drive it now. Back To Editor (pause) brings you back here, undo and all.', pick: act('test') },
        { title: 'Race It', desc: 'Race it: laps, opponents and the conditions next.', pick: act('race') },
        { title: '3D View', desc: 'Fly round it as it will look (View button).', pick: act('view3d') },
        { title: 'Save', desc: 'Keep it in My Circuits.', pick: act('save') },
        { title: 'Save As', desc: 'A copy under a new name.', pick: act('saveas') },
        { title: 'Open', desc: 'One of your circuits.', pick: act('open') },
        { title: 'New', desc: 'A blank circuit or point-to-point road.', pick: act('new') },
        { title: 'Presets', desc: 'The built-in and real circuits, to start from.', pick: act('presets') },
        { title: 'Redo', desc: 'Y is undo.', pick: act('redo') },
        { title: 'Exit', desc: 'Back to the menu (it asks first if this isn\'t saved).', pick: act('exit') },
      ]);
    },
    // a list in the pop-up (Menu, New, Open, Presets, Exit): up / down to pick, A to choose, B to close
    padModal(p) {
      const box = $('ed-modal-box'), items = [...box.querySelectorAll('.li, .foot button, [data-ok]')].filter(x => x.offsetParent);
      if (!items.length) return;
      let k = items.findIndex(x => x.classList.contains('padsel'));
      if (k < 0) { k = 0; items[0].classList.add('padsel'); }
      if (p.up || p.down) { items[k].classList.remove('padsel'); k = (k + (p.down ? 1 : -1) + items.length) % items.length; items[k].classList.add('padsel'); items[k].scrollIntoView({ block: 'nearest' }); sfx.move(); }
      if (p.a) items[k].click();
      if (p.b) this.closeModal();
    },
    // the cursor over everything on the map (a pad in hand)
    draw() {
      draw0.call(this);
      if (!this.padOn || !this.pc || this.v3d) return;
      const c = this.ctx, { x, y } = this.pc;
      c.save(); c.strokeStyle = '#ffc21a'; c.lineWidth = 2; c.shadowColor = '#ffc21a'; c.shadowBlur = 6;
      c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(x - 15, y); c.lineTo(x - 5, y); c.moveTo(x + 5, y); c.lineTo(x + 15, y); c.moveTo(x, y - 15); c.lineTo(x, y - 5); c.moveTo(x, y + 5); c.lineTo(x, y + 15); c.stroke();
      c.restore();
    },
  });
}
