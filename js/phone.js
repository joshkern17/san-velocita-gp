// The career phone: a PS1-era "Noxia" handset (models/phone.glb, PSX Mobile Phone by Retro Assets Library) that
// slides up over the menus. Texts from your teammate, rivals and the series, the news, and choices you answer by
// reply all happen on its LCD, which is a canvas drawn here and mapped onto the model's screen.
// It renders in its own little WebGL canvas (bottom right), at low resolution with chunky upscaling.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

// the LCD: a small logical canvas (chunky pixels), copied into the screen's area of a 1024 texture
const LW = 150, LH = 188, SS = 3; // (logical size; drawn at SS x so the text stays sharp)
// where the screen quad's UVs sit in its texture (flipY off, as glTF does): u .113-.880, v .012-.971
const UV = { x: 116, y: 12, w: 785, h: 982 };
const LCD = { bg: '#9fb38d', bg2: '#93a882', ink: '#18240f', mid: '#4f6343', inv: '#a9bd96' };
const FONT = (px) => `${px}px VT323, monospace`;

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
    this.lcd = document.createElement('canvas'); this.lcd.width = LW * SS; this.lcd.height = LH * SS;
    this.tex = document.createElement('canvas'); this.tex.width = this.tex.height = 1024;
    this.texture = new THREE.CanvasTexture(this.tex); this.texture.flipY = false; this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.LinearFilter; this.texture.minFilter = THREE.LinearMipmapLinearFilter; this.texture.anisotropy = 4;
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

  // ---------- the LCD ----------
  drawLCD() {
    const c = this.lcd.getContext('2d');
    c.setTransform(SS, 0, 0, SS, 0, 0);
    c.fillStyle = LCD.bg; c.fillRect(0, 0, LW, LH);
    c.textBaseline = 'top'; c.fillStyle = LCD.ink;
    // status bar: signal, envelope (unread), battery, and the season clock
    for (let i = 0; i < 4; i++) c.fillRect(6 + i * 3, 12 - i * 2, 2, 3 + i * 2);
    const unread = this.src.msgs().filter(m => !m.read).length;
    if (unread) { c.strokeStyle = LCD.ink; c.lineWidth = 1; c.strokeRect(22.5, 6.5, 11, 8); c.beginPath(); c.moveTo(23, 7); c.lineTo(28, 11); c.lineTo(33, 7); c.stroke(); }
    c.strokeStyle = LCD.ink; c.strokeRect(LW - 24.5, 6.5, 16, 8); c.fillRect(LW - 8, 9, 2, 3); c.fillRect(LW - 23, 8, 13, 5);
    c.font = FONT(13); c.textAlign = 'center'; c.fillText(this.src.status?.() || '', LW / 2, 4); c.textAlign = 'left';
    c.fillRect(4, 19, LW - 8, 1);
    const body = { x: 5, y: 23, w: LW - 10, h: LH - 23 - 17 };
    if (this.state !== 'open') this.drawIdle(c, body, unread);
    else if (this.page === 'msg') this.drawText(c, body, this.cur.from.toUpperCase(), this.cur.body, true);
    else if (this.page === 'item') this.drawText(c, body, this.cur.head, this.cur.body, false);
    else this.drawList(c, body);
    // soft keys
    c.fillRect(4, LH - 17, LW - 8, 1);
    c.font = FONT(13);
    const okLbl = this.state !== 'open' ? 'Open' : this.items().length ? (this.page === 'msg' ? 'Reply' : 'Select') : '';
    c.fillText(okLbl, 6, LH - 14); c.textAlign = 'right'; c.fillText(this.state === 'open' ? (this.page === 'home' ? 'Exit' : 'Back') : '', LW - 6, LH - 14); c.textAlign = 'left';
    // into the texture's screen area
    const t = this.tex.getContext('2d'); t.imageSmoothingEnabled = true; t.imageSmoothingQuality = 'high';
    t.fillStyle = LCD.bg; t.fillRect(0, 0, 1024, 1024);
    t.drawImage(this.lcd, UV.x, UV.y, UV.w, UV.h);
    this.texture.needsUpdate = true;
  }
  drawIdle(c, b, unread) {
    c.textAlign = 'center';
    c.font = FONT(30); c.fillText('NOXIA', LW / 2, b.y + 22);
    c.font = FONT(15);
    if (unread) {
      // a blinking envelope while it buzzes
      if (this.buzzT <= 0 || Math.floor(performance.now() / 300) % 2) { c.fillText(`${unread} new message${unread > 1 ? 's' : ''}`, LW / 2, b.y + 64); }
    } else c.fillText('No new messages', LW / 2, b.y + 64);
    c.textAlign = 'left';
  }
  drawList(c, b) {
    const items = this.items(), rowH = 18, title = { home: 'MENU', msgs: 'MESSAGES', news: 'NEWS' }[this.page];
    c.font = FONT(15); c.fillText(title, b.x, b.y);
    const top = b.y + 18, rows = Math.floor((b.h - 18) / rowH);
    if (!items.length) { c.fillStyle = LCD.mid; c.fillText(this.page === 'msgs' ? 'No messages' : 'Nothing yet', b.x, top); c.fillStyle = LCD.ink; return; }
    if (this.sel < this.scroll) this.scroll = this.sel; if (this.sel >= this.scroll + rows) this.scroll = this.sel - rows + 1;
    for (let i = 0; i < rows && this.scroll + i < items.length; i++) {
      const k = this.scroll + i, it = items[k], y = top + i * rowH, on = k === this.sel;
      if (on) { c.fillStyle = LCD.ink; c.fillRect(b.x - 2, y - 1, b.w + 4, rowH); c.fillStyle = LCD.inv; } else c.fillStyle = LCD.ink;
      let s = it.t;
      if (it.k === 'msgs') { const u = this.src.msgs().filter(m => !m.read).length; s = `Messages${u ? ` (${u})` : ''}`; }
      if (it.k === 'm') s = `${it.m.read ? ' ' : '*'}${it.m.from}: ${it.m.body}`;
      if (it.k === 'n') s = it.n.head;
      c.font = FONT(17); c.fillText(fit(c, s, b.w), b.x, y + 1);
    }
    c.fillStyle = LCD.ink;
    // scroll bar
    if (items.length > rows) { const h = (b.h - 18) * rows / items.length, y = top + (b.h - 18 - h) * this.scroll / (items.length - rows); c.fillRect(LW - 4, y, 2, h); }
  }
  drawText(c, b, head, text, isMsg) {
    c.font = FONT(17);
    const headLines = wrap(c, head, b.w);
    const lines = wrap(c, text, b.w);
    const choices = isMsg && this.cur.choices ? this.cur.choices : null;
    const answered = choices && this.cur.answer ? choices.find(ch => ch[0] === this.cur.answer) : null;
    if (answered) lines.push('', ...wrap(c, '> ' + answered[1], b.w));
    const all = [...headLines.map(l => ({ l, head: true })), { l: '' }, ...lines.map(l => ({ l }))];
    const rowH = 16, room = Math.floor((b.h - (choices && !answered ? choices.length * 18 + 4 : 0)) / rowH);
    this.scroll = Math.max(0, Math.min(this.scroll, all.length - room));
    for (let i = 0; i < room && this.scroll + i < all.length; i++) {
      const L = all[this.scroll + i];
      c.fillStyle = LCD.ink; c.font = FONT(17);
      c.fillText(L.l, b.x, b.y + i * rowH);
      if (L.head) c.fillRect(b.x, b.y + i * rowH + 14, c.measureText(L.l).width, 1);
    }
    if (all.length > room) { const h = b.h * room / all.length; c.fillRect(LW - 4, b.y + (b.h - h) * this.scroll / Math.max(1, all.length - room), 2, h); }
    if (choices && !answered) {
      const y0 = b.y + b.h - choices.length * 18;
      c.fillRect(b.x, y0 - 3, b.w, 1);
      choices.forEach(([, t], k) => {
        const y = y0 + k * 18, on = k === this.sel;
        if (on) { c.fillStyle = LCD.ink; c.fillRect(b.x - 2, y - 1, b.w + 4, 18); c.fillStyle = LCD.inv; } else c.fillStyle = LCD.ink;
        c.font = FONT(17); c.fillText(fit(c, t, b.w), b.x, y + 1);
      });
      c.fillStyle = LCD.ink;
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

function fit(c, s, w) { if (c.measureText(s).width <= w) return s; while (s.length > 1 && c.measureText(s + '..').width > w) s = s.slice(0, -1); return s + '..'; }
function wrap(c, text, w) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (c.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
