// The career phone: a PS1-era "Noxia" handset (models/phone.glb, PSX Mobile Phone by Retro Assets Library) that
// slides up over the menus. Texts from your teammate, rivals and the series, the news, and choices you answer by
// reply all happen on its LCD, which is a canvas drawn here and mapped onto the model's screen.
// It renders in its own little WebGL canvas (bottom right), at low resolution with chunky upscaling.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

// the LCD: a small logical canvas (chunky pixels), copied into the screen's area of a 1024 texture
const LW = 112, LH = 140; // (the dot matrix: every pixel of it is one LCD dot)
// where the screen quad's UVs sit in its texture (flipY off, as glTF does): u .113-.880, v .012-.971
const UV = { x: 116, y: 12, w: 785, h: 982 };
const LCD = { bg: '#9fb38d', bg2: '#93a882', ink: '#18240f', mid: '#4f6343', inv: '#a9bd96' };

export class Phone {
  // src: { msgs() -> [{ id, from, body, read, choices?, answer? }], news() -> [{ head, body, y, r }], status() -> 'R3 2026',
  //        choose(msg, key), read(msg), sfx: { move, select, back, buzz } }
  constructor(src) {
    this.src = src;
    this.state = 'hidden'; this.k = 0; this.target = 0; this.buzzT = 0; this.page = 'home'; this.sel = 0; this.scroll = 0; this.cur = null;
    this.cv = document.createElement('canvas'); this.cv.id = 'phone-cv';
    document.body.appendChild(this.cv);
    this.cv.addEventListener('click', () => { if (this.state === 'peek') this.open(); });
    this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, alpha: true, antialias: false, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(24, 0.6, 0.05, 10);
    this.camera.position.set(0, 0, 1.0);
    this.scene.add(new THREE.HemisphereLight(0xfff0e8, 0x201018, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(0.6, 0.8, 1.2); this.scene.add(key);
    this.rig = new THREE.Group(); this.scene.add(this.rig);
    // the LCD texture
    this.lcd = document.createElement('canvas'); this.lcd.width = LW; this.lcd.height = LH;
    this.tex = document.createElement('canvas'); this.tex.width = this.tex.height = 1024;
    this.texture = new THREE.CanvasTexture(this.tex); this.texture.flipY = false; this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.LinearFilter; this.texture.minFilter = THREE.LinearMipmapLinearFilter; this.texture.anisotropy = 8;
    this.dirty = true;
    this.load();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  load() {
    const url = window.__SVGP_PHONE_GLB || 'models/phone.glb';
    new GLTFLoader().loadAsync(url).then(g => {
      const m = g.scene;
      // centre it, about 0.36 tall, screen facing the camera (+Z)
      const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      m.position.sub(c); const holder = new THREE.Group(); holder.add(m); holder.scale.setScalar(0.36 / s.y);
      m.traverse(o => {
        if (!o.isMesh) return;
        if (/screen|_V\d/i.test(o.material.name)) o.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
        else if (o.material.map) { o.material.map.magFilter = THREE.NearestFilter; o.material.roughness = 0.75; }
      });
      this.rig.add(holder); this.model = holder; this.dirty = true;
    }).catch(e => console.warn('phone model', e));
  }
  resize() {
    const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
    const w = Math.round(470 * ui), h = Math.round(800 * ui);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    // low resolution, upscaled with hard pixels (the PS1 look)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---------- states ----------
  get isOpen() { return this.state === 'open'; }
  show() { if (this.state === 'hidden') { this.state = 'peek'; this.target = 0.35; this.page = 'home'; this.sel = 0; this.dirty = true; } }
  hide() { this.state = 'hidden'; this.target = 0; }
  open(page = 'home', msg = null) {
    this.state = 'open'; this.target = 1; this.page = page; this.sel = 0; this.scroll = 0; this.cur = msg; this.dirty = true;
    if (msg) this.readMsg(msg);
    this.src.sfx?.select?.();
  }
  close() { if (this.state !== 'open') return; this.state = 'peek'; this.target = 0.35; this.page = 'home'; this.sel = 0; this.dirty = true; this.src.sfx?.back?.(); }
  buzz() { this.buzzT = 1.1; this.dirty = true; this.src.sfx?.buzz?.(); }
  refresh() { this.dirty = true; }
  readMsg(m) { if (m && !m.read) { m.read = true; this.src.read?.(m); } }

  // ---------- input (while open) ----------
  input({ up, down, ok, back }) {
    const items = this.items(), n = items.length;
    if (back) {
      if (this.page === 'home') this.close();
      else { const from = this.page; this.page = from === 'msg' ? 'msgs' : from === 'item' ? 'news' : 'home'; this.sel = this.lastSel?.[this.page] ?? 0; this.scroll = 0; this.src.sfx?.back?.(); }
      this.dirty = true; return;
    }
    if ((up || down) && n) { this.sel = (this.sel + (down ? 1 : -1) + n) % n; this.src.sfx?.move?.(); this.dirty = true; }
    if ((up || down) && !n && (this.page === 'msg' || this.page === 'item')) { this.scroll = Math.max(0, this.scroll + (down ? 1 : -1)); this.dirty = true; }
    if (ok && n) { this.pick(items[this.sel]); this.dirty = true; }
  }
  items() {
    if (this.page === 'home') return [{ k: 'msgs', t: 'Messages' }, { k: 'news', t: 'News' }, { k: 'exit', t: 'Put away' }];
    if (this.page === 'msgs') return this.src.msgs().map(m => ({ k: 'm', m }));
    if (this.page === 'news') return this.src.news().map(n => ({ k: 'n', n }));
    if (this.page === 'msg' && this.cur?.choices && !this.cur.answer) return this.cur.choices.map(([key, t]) => ({ k: 'c', key, t }));
    return [];
  }
  pick(it) {
    this.lastSel = this.lastSel || {}; this.lastSel[this.page] = this.sel;
    if (it.k === 'exit') return this.close();
    if (it.k === 'msgs' || it.k === 'news') { this.page = it.k; this.sel = 0; this.src.sfx?.select?.(); return; }
    if (it.k === 'm') { this.cur = it.m; this.readMsg(it.m); this.page = 'msg'; this.sel = 0; this.scroll = 0; this.src.sfx?.select?.(); return; }
    if (it.k === 'n') { this.cur = it.n; this.page = 'item'; this.sel = 0; this.scroll = 0; this.src.sfx?.select?.(); return; }
    if (it.k === 'c') { this.cur.answer = it.key; this.src.choose?.(this.cur, it.key); this.sel = 0; this.src.sfx?.select?.(); }
  }

  // ---------- the LCD: a 112x140 dot matrix, a 5x7 pixel font, upscaled with hard pixels ----------
  drawLCD() {
    const c = this.lcd.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = LCD.bg; c.fillRect(0, 0, LW, LH);
    c.fillStyle = LCD.ink;
    // status bar: signal, envelope (unread), the season clock, battery
    for (let i = 0; i < 4; i++) c.fillRect(2 + i * 2, 7 - i * 2, 1, 1 + i * 2);
    const unread = this.src.msgs().filter(m => !m.read).length;
    if (unread) { box(c, 12, 2, 7, 5); c.fillRect(13, 3, 1, 1); c.fillRect(14, 4, 1, 1); c.fillRect(15, 5, 1, 1); c.fillRect(16, 4, 1, 1); c.fillRect(17, 3, 1, 1); }
    box(c, LW - 11, 2, 8, 5); c.fillRect(LW - 3, 3, 1, 3); c.fillRect(LW - 10, 3, 6, 3);
    const st = this.src.status?.() || ''; txt(c, st, Math.round((LW - tw(st)) / 2), 1);
    c.fillRect(1, 10, LW - 2, 1);
    const body = { x: 2, y: 13, w: LW - 6, h: LH - 13 - 11 };
    if (this.state !== 'open') this.drawIdle(c, body, unread);
    else if (this.page === 'msg') this.drawText(c, body, this.cur.from.toUpperCase(), this.cur.body, true);
    else if (this.page === 'item') this.drawText(c, body, this.cur.head, this.cur.body, false);
    else this.drawList(c, body);
    // soft keys
    c.fillStyle = LCD.ink; c.fillRect(1, LH - 10, LW - 2, 1);
    const okLbl = this.state !== 'open' ? 'Open' : this.items().length ? (this.page === 'msg' ? 'Reply' : 'Select') : '';
    const bk = this.state === 'open' ? (this.page === 'home' ? 'Exit' : 'Back') : '';
    txt(c, okLbl, 2, LH - 8); txt(c, bk, LW - 2 - tw(bk), LH - 8);
    // into the texture: hard pixels, a faint gap between dots, and the slight ghost a real LCD leaves
    const t = this.tex.getContext('2d'); t.imageSmoothingEnabled = false;
    t.fillStyle = LCD.bg; t.fillRect(0, 0, 1024, 1024);
    const sx = UV.w / LW, sy = UV.h / LH;
    t.globalAlpha = 0.16; t.drawImage(this.lcd, UV.x + sx * 0.6, UV.y + sy * 0.7, UV.w, UV.h); t.globalAlpha = 1;
    t.drawImage(this.lcd, UV.x, UV.y, UV.w, UV.h);
    t.fillStyle = 'rgba(190, 210, 170, 0.32)';
    for (let x = 0; x <= LW; x++) t.fillRect(Math.round(UV.x + x * sx) - 1, UV.y, 1.5, UV.h);
    for (let y = 0; y <= LH; y++) t.fillRect(UV.x, Math.round(UV.y + y * sy) - 1, UV.w, 1.5);
    this.texture.needsUpdate = true;
  }
  drawIdle(c, b, unread) {
    txt(c, 'NOXIA', Math.round((LW - tw('NOXIA', 2)) / 2), b.y + 18, 2);
    let s = unread ? `${unread} new message${unread > 1 ? 's' : ''}` : 'No new messages';
    if (unread && this.buzzT > 0 && Math.floor(performance.now() / 300) % 2 === 0) s = '';
    txt(c, s, Math.round((LW - tw(s)) / 2), b.y + 50);
  }
  drawList(c, b) {
    const items = this.items(), rowH = 11, title = { home: 'MENU', msgs: 'MESSAGES', news: 'NEWS' }[this.page];
    txt(c, title, b.x, b.y); c.fillRect(b.x, b.y + 8, tw(title), 1);
    const top = b.y + 12, rows = Math.floor((b.h - 12) / rowH);
    if (!items.length) { txt(c, this.page === 'msgs' ? 'No messages' : 'Nothing yet', b.x, top + 2); return; }
    if (this.sel < this.scroll) this.scroll = this.sel; if (this.sel >= this.scroll + rows) this.scroll = this.sel - rows + 1;
    for (let i = 0; i < rows && this.scroll + i < items.length; i++) {
      const k = this.scroll + i, it = items[k], y = top + i * rowH, on = k === this.sel;
      let s = it.t;
      if (it.k === 'msgs') { const u = this.src.msgs().filter(m => !m.read).length; s = `Messages${u ? ` (${u})` : ''}`; }
      if (it.k === 'm') s = `${it.m.read ? ' ' : '*'}${it.m.from}: ${it.m.body}`;
      if (it.k === 'n') s = it.n.head;
      if (on) { c.fillStyle = LCD.ink; c.fillRect(b.x - 1, y, b.w + 2, rowH); c.fillStyle = LCD.bg; }
      txt(c, fit(s, b.w), b.x, y + 2);
      c.fillStyle = LCD.ink;
    }
    if (items.length > rows) { const h = Math.max(3, Math.round((b.h - 12) * rows / items.length)), y = top + Math.round((b.h - 12 - h) * this.scroll / (items.length - rows)); c.fillRect(LW - 2, y, 1, h); }
  }
  drawText(c, b, head, text, isMsg) {
    const choices = isMsg && this.cur.choices ? this.cur.choices : null;
    const answered = choices && this.cur.answer ? choices.find(ch => ch[0] === this.cur.answer) : null;
    const lines = wrap(text, b.w);
    if (answered) lines.push('', ...wrap('> ' + answered[1], b.w));
    const all = [...wrap(head, b.w).map(l => ({ l, head: true })), { l: '' }, ...lines.map(l => ({ l }))];
    const rowH = 9, room = Math.floor((b.h - (choices && !answered ? choices.length * 11 + 3 : 0)) / rowH);
    this.scroll = Math.max(0, Math.min(this.scroll, all.length - room));
    for (let i = 0; i < room && this.scroll + i < all.length; i++) {
      const L = all[this.scroll + i], y = b.y + i * rowH;
      txt(c, L.l, b.x, y);
      if (L.head) c.fillRect(b.x, y + 8, tw(L.l), 1);
    }
    if (all.length > room) { const h = Math.max(3, Math.round(b.h * room / all.length)); c.fillRect(LW - 2, b.y + Math.round((b.h - h) * this.scroll / Math.max(1, all.length - room)), 1, h); }
    if (choices && !answered) {
      const y0 = b.y + b.h - choices.length * 11;
      c.fillRect(b.x, y0 - 2, b.w, 1);
      choices.forEach(([, t], k) => {
        const y = y0 + k * 11, on = k === this.sel;
        if (on) { c.fillStyle = LCD.ink; c.fillRect(b.x - 1, y, b.w + 2, 11); c.fillStyle = LCD.bg; }
        txt(c, fit(t, b.w), b.x, y + 2);
        c.fillStyle = LCD.ink;
      });
    }
  }

  // ---------- per frame ----------
  update(dt) {
    const was = this.k;
    this.k += (this.target - this.k) * Math.min(1, dt * 9);
    if (Math.abs(this.k - this.target) < 0.002) this.k = this.target;
    this.buzzT = Math.max(0, this.buzzT - dt);
    const visible = this.k > 0.01 || this.state !== 'hidden';
    this.cv.style.display = visible ? 'block' : 'none';
    this.cv.classList.toggle('open', this.state === 'open');
    if (!visible || !this.model) return;
    // peek: low, just the screen showing; open: up and turned to you
    const k = this.k, open = Math.max(0, (k - 0.35) / 0.65), peek = Math.min(1, k / 0.35);
    const t = performance.now() / 1000;
    // hidden (below the frame) -> peek (small, bottom right, the screen showing) -> open (big, facing you)
    const sc = 0.55 + 0.45 * open;
    this.rig.scale.setScalar(sc);
    this.rig.position.set(0.045 * (1 - open), -0.46 + 0.33 * peek + 0.13 * open + Math.sin(t * 1.3) * 0.003, 0);
    this.rig.rotation.set(-0.3 + 0.24 * open, -0.34 + 0.26 * open, 0.1 * (1 - open));
    if (this.buzzT > 0) { this.rig.rotation.z += Math.sin(t * 90) * 0.035 * Math.min(1, this.buzzT * 2); this.rig.position.x += Math.sin(t * 77) * 0.003; }
    if (this.dirty || this.buzzT > 0 || (this.state !== 'open' && Math.floor(t * 3.3) !== this.blink)) { this.blink = Math.floor(t * 3.3); this.drawLCD(); this.dirty = false; }
    if (Math.abs(was - this.k) > 1e-4 || this.buzzT > 0 || true) this.renderer.render(this.scene, this.camera);
  }
}

// ---------- a 5x7 dot-matrix font (each glyph: 7 rows of 5 bits, the left dot = 16) ----------
const G = {};
const defs = {
  ' ': '00 00 00 00 00 00 00', '!': '04 04 04 04 00 00 04', '"': '0A 0A 0A 00 00 00 00', '#': '0A 0A 1F 0A 1F 0A 0A', '$': '04 0F 14 0E 05 1E 04',
  '%': '18 19 02 04 08 13 03', '&': '0C 12 14 08 15 12 0D', "'": '04 04 08 00 00 00 00', '(': '02 04 08 08 08 04 02', ')': '08 04 02 02 02 04 08',
  '*': '00 04 15 0E 15 04 00', '+': '00 04 04 1F 04 04 00', ',': '00 00 00 00 0C 04 08', '-': '00 00 00 1F 00 00 00', '.': '00 00 00 00 00 0C 0C',
  '/': '00 01 02 04 08 10 00', '0': '0E 11 13 15 19 11 0E', '1': '04 0C 04 04 04 04 0E', '2': '0E 11 01 02 04 08 1F', '3': '1F 02 04 02 01 11 0E',
  '4': '02 06 0A 12 1F 02 02', '5': '1F 10 1E 01 01 11 0E', '6': '06 08 10 1E 11 11 0E', '7': '1F 01 02 04 08 08 08', '8': '0E 11 11 0E 11 11 0E',
  '9': '0E 11 11 0F 01 02 0C', ':': '00 0C 0C 00 0C 0C 00', ';': '00 0C 0C 00 0C 04 08', '<': '02 04 08 10 08 04 02', '=': '00 00 1F 00 1F 00 00',
  '>': '08 04 02 01 02 04 08', '?': '0E 11 01 02 04 00 04', '@': '0E 11 01 0D 15 15 0E', 'A': '0E 11 11 11 1F 11 11', 'B': '1E 11 11 1E 11 11 1E',
  'C': '0E 11 10 10 10 11 0E', 'D': '1C 12 11 11 11 12 1C', 'E': '1F 10 10 1E 10 10 1F', 'F': '1F 10 10 1E 10 10 10', 'G': '0E 11 10 17 11 11 0F',
  'H': '11 11 11 1F 11 11 11', 'I': '0E 04 04 04 04 04 0E', 'J': '07 02 02 02 02 12 0C', 'K': '11 12 14 18 14 12 11', 'L': '10 10 10 10 10 10 1F',
  'M': '11 1B 15 15 11 11 11', 'N': '11 11 19 15 13 11 11', 'O': '0E 11 11 11 11 11 0E', 'P': '1E 11 11 1E 10 10 10', 'Q': '0E 11 11 11 15 12 0D',
  'R': '1E 11 11 1E 14 12 11', 'S': '0F 10 10 0E 01 01 1E', 'T': '1F 04 04 04 04 04 04', 'U': '11 11 11 11 11 11 0E', 'V': '11 11 11 11 11 0A 04',
  'W': '11 11 11 15 15 15 0A', 'X': '11 11 0A 04 0A 11 11', 'Y': '11 11 11 0A 04 04 04', 'Z': '1F 01 02 04 08 10 1F', '[': '0E 08 08 08 08 08 0E',
  '\\': '00 10 08 04 02 01 00', ']': '0E 02 02 02 02 02 0E', '^': '04 0A 11 00 00 00 00', '_': '00 00 00 00 00 00 1F', '`': '08 04 02 00 00 00 00',
  'a': '00 00 0E 01 0F 11 0F', 'b': '10 10 16 19 11 11 1E', 'c': '00 00 0E 10 10 11 0E', 'd': '01 01 0D 13 11 11 0F', 'e': '00 00 0E 11 1F 10 0E',
  'f': '06 09 08 1C 08 08 08', 'g': '00 0F 11 11 0F 01 0E', 'h': '10 10 16 19 11 11 11', 'i': '04 00 0C 04 04 04 0E', 'j': '02 00 06 02 02 12 0C',
  'k': '10 10 12 14 18 14 12', 'l': '0C 04 04 04 04 04 0E', 'm': '00 00 1A 15 15 11 11', 'n': '00 00 16 19 11 11 11', 'o': '00 00 0E 11 11 11 0E',
  'p': '00 00 1E 11 1E 10 10', 'q': '00 00 0D 13 0F 01 01', 'r': '00 00 16 19 10 10 10', 's': '00 00 0E 10 0E 01 1E', 't': '08 08 1C 08 08 09 06',
  'u': '00 00 11 11 11 13 0D', 'v': '00 00 11 11 11 0A 04', 'w': '00 00 11 11 15 15 0A', 'x': '00 00 11 0A 04 0A 11', 'y': '00 00 11 11 0F 01 0E',
  'z': '00 00 1F 02 04 08 1F', '{': '02 04 04 08 04 04 02', '|': '04 04 04 04 04 04 04', '}': '08 04 04 02 04 04 08', '~': '00 00 08 15 02 00 00',
};
for (const [ch, rows] of Object.entries(defs)) G[ch] = rows.split(' ').map(h => parseInt(h, 16));
const CW = 6; // (5 dots + 1 gap)
const tw = (s, k = 1) => s ? (s.length * CW - 1) * k : 0;
// draw text in the current fillStyle; k = size multiplier
function txt(c, s, x, y, k = 1) {
  s = String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/·/g, '-').replace(/[^\x20-\x7e]/g, '?');
  for (let i = 0; i < s.length; i++) {
    const g = G[s[i]] || G['?'], ox = x + i * CW * k;
    for (let r = 0; r < 7; r++) { const row = g[r]; if (!row) continue; for (let b = 0; b < 5; b++) if (row & (16 >> b)) c.fillRect(ox + b * k, y + r * k, k, k); }
  }
}
function box(c, x, y, w, h) { c.fillRect(x, y, w, 1); c.fillRect(x, y + h - 1, w, 1); c.fillRect(x, y, 1, h); c.fillRect(x + w - 1, y, 1, h); }
function fit(s, w) { const n = Math.floor((w + 1) / CW); return s.length <= n ? s : s.slice(0, Math.max(1, n - 2)) + '..'; }
function wrap(text, w) {
  const n = Math.floor((w + 1) / CW), out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (t.length > n && line) { out.push(line); line = word; } else line = t;
      while (line.length > n) { out.push(line.slice(0, n)); line = line.slice(n); }
    }
    out.push(line);
  }
  return out;
}
