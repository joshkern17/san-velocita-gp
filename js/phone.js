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
const BODY = { x: 2, y: 13, w: LW - 6, h: LH - 13 - 11 }; // (the screen between the status bar and the soft keys)
const LCD = { bg: '#9fb38d', bg2: '#93a882', ink: '#18240f', mid: '#4f6343', inv: '#a9bd96' };

export class Phone {
  // src: { msgs() -> [{ id, from, body, read, choices?, answer? }], news() -> [{ head, body, y, r }], status() -> 'R3 2026',
  //        choose(msg, key), read(msg), sfx: { move, select, back, buzz } }
  constructor(src) {
    this.src = src;
    this.state = 'hidden'; this.k = 0; this.target = 0; this.buzzT = 0; this.page = 'home'; this.sel = 0; this.scroll = 0; this.cur = null;
    this.cv = document.createElement('canvas'); this.cv.id = 'phone-cv';
    document.body.appendChild(this.cv);
    // only a click on the phone itself raises it (its canvas is much bigger than the phone, and lets clicks through)
    this.cv.style.pointerEvents = 'none';
    document.addEventListener('click', (e) => { if (this.state === 'peek' && this.hit(e.clientX, e.clientY)) { e.stopPropagation(); this.open(); } }, true);
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
  // is (x, y) (CSS pixels) on the phone? Its bounding box, projected
  hit(x, y) {
    if (!this.model || this.cv.style.display === 'none') return false;
    const r = this.cv.getBoundingClientRect(), box = new THREE.Box3().setFromObject(this.model);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const px of [box.min.x, box.max.x]) for (const py of [box.min.y, box.max.y]) for (const pz of [box.min.z, box.max.z]) {
      const v = new THREE.Vector3(px, py, pz).project(this.camera);
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
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
    if (page === 'home' && !this.hasHome) page = 'msgs';
    this.state = 'open'; this.target = 1; this.page = page; this.sel = 0; this.scroll = 0; this.cur = msg; this.dirty = true;
    if (msg) this.openThread(msg.from);
    this.src.sfx?.select?.();
  }
  close() { if (this.state !== 'open') return; this.state = 'peek'; this.target = 0.35; this.page = 'home'; this.sel = 0; this.dirty = true; this.src.sfx?.back?.(); }
  buzz() { this.buzzT = 1.1; this.dirty = true; this.src.sfx?.buzz?.(); }
  refresh() { this.dirty = true; }
  readMsg(m) { if (m && !m.read) { m.read = true; this.src.read?.(m); } }
  // texts come in threads, one per person: [{ from, msgs (newest first) }], the most recent conversation first
  threads() {
    const by = new Map();
    for (const m of this.src.msgs()) { if (!by.has(m.from)) by.set(m.from, { from: m.from, msgs: [] }); by.get(m.from).msgs.push(m); }
    // (the people you can always text, even before they've texted you: at the end, if they haven't)
    for (const c of this.src.contacts ? this.src.contacts() : []) if (!by.has(c)) by.set(c, { from: c, msgs: [] });
    return [...by.values()];
  }
  thread() { return this.threads().find(t => t.from === this.who) || { from: this.who || '', msgs: [] }; }
  // a menu before the texts only when there's more than texts (World Career's news is on the computer: its phone opens on them)
  get hasHome() { return !!this.src.news; }
  // open one: everything in it is read; it opens at the first text you hadn't seen (marked NEW), else at the newest
  // a reply's landed (or failed): show the thread again, at the newest
  // (after a talk: your message at the top of the screen, their reply under it)
  talked() { this.talking = false; this.pending = null; if (this.page === 'msg') { this.openThread(this.who); this.scroll = -2; } this.dirty = true; }
  openThread(from) {
    this.who = from; this.page = 'msg'; this.sel = 0;
    const t = this.thread(), unread = t.msgs.filter(m => !m.read);
    this.newId = unread.length ? unread[unread.length - 1].id : null;
    for (const m of t.msgs) this.readMsg(m);
    this.cur = t.msgs.find(m => m.choices && !m.answer) || t.msgs[0] || null;
    this.scroll = this.newId ? -1 : 1e6; // (-1: at the NEW marker, once the thread is laid out)
  }

  // ---------- input (while open) ----------
  input({ up, down, ok, back }) {
    const items = this.items(), n = items.length;
    if (back) {
      if (this.page === 'home' || (this.page === 'msgs' && !this.hasHome)) this.close();
      else { const from = this.page; this.page = from === 'msg' ? 'msgs' : from === 'item' ? 'news' : 'home'; this.sel = this.lastSel?.[this.page] ?? 0; this.scroll = 0; this.src.sfx?.back?.(); }
      this.dirty = true; return;
    }
    if (this.page === 'msg' && (up || down)) this.threadKey(down ? 1 : -1, n);
    else if (this.page === 'item' && (up || down)) { this.scroll = Math.max(0, this.scroll + (down ? 1 : -1)); this.dirty = true; }
    else if ((up || down) && n) { this.sel = (this.sel + (down ? 1 : -1) + n) % n; this.src.sfx?.move?.(); this.dirty = true; }
    if (ok && n) { this.pick(items[this.sel]); this.dirty = true; }
  }
  // in a conversation, down reads on to the newest text, then on into the replies (if they're waiting for one); up goes back
  threadKey(d, n) {
    const { max } = this.threadView(), STEP = 20;
    if (d > 0) { if (this.scroll < max) this.scroll = Math.min(max, this.scroll + STEP); else if (this.sel < n - 1) { this.sel++; this.src.sfx?.move?.(); } }
    else if (this.sel > 0) { this.sel--; this.src.sfx?.move?.(); }
    else this.scroll = Math.max(0, this.scroll - STEP);
    this.dirty = true;
  }
  items() {
    if (this.page === 'home') return [{ k: 'msgs', t: 'Messages' }, ...(this.src.news ? [{ k: 'news', t: 'News' }] : []), { k: 'exit', t: 'Put away' }];
    if (this.page === 'msgs') return this.threads().map(t => ({ k: 't', t }));
    if (this.page === 'news') return (this.src.news ? this.src.news() : []).map(n => ({ k: 'n', n }));
    if (this.page === 'msg' && this.cur?.choices && !this.cur.answer) return this.cur.choices.map(([key, t]) => ({ k: 'c', key, t }));
    // someone you can talk to (character voices on): what to say, by tone, or type it
    if (this.page === 'msg' && !this.talking && this.src.talkItems) return this.src.talkItems(this.who);
    return [];
  }
  pick(it) {
    this.lastSel = this.lastSel || {}; this.lastSel[this.page] = this.sel;
    if (it.k === 'exit') return this.close();
    if (it.k === 'msgs' || it.k === 'news') { this.page = it.k; this.sel = 0; this.src.sfx?.select?.(); return; }
    if (it.k === 't') { this.openThread(it.t.from); this.src.sfx?.select?.(); return; }
    if (it.k === 'n') { this.cur = it.n; this.page = 'item'; this.sel = 0; this.scroll = 0; this.src.sfx?.select?.(); return; }
    if (it.k === 'c') { this.cur.answer = it.key; this.src.choose?.(this.cur, it.key); this.openThread(this.who); this.src.sfx?.select?.(); }
    if (it.k === 'say') { this.talking = true; this.pending = it.t; this.scroll = 1e6; this.src.sfx?.select?.(); this.src.talk(this.who, { intent: it.intent }); }
    if (it.k === 'type') { this.src.sfx?.select?.(); this.src.typeReply(this.who); }
  }

  // ---------- the LCD: a 112x140 dot matrix, a 5x7 pixel font (with descenders), upscaled with hard pixels ----------
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
    const body = BODY;
    if (this.state !== 'open') this.drawIdle(c, body, unread);
    else if (this.page === 'msg') this.drawThread(c, body);
    else if (this.page === 'msgs') this.drawInbox(c, body);
    else if (this.page === 'item') this.drawText(c, body, this.cur.head, this.cur.body);
    else this.drawList(c, body);
    // soft keys
    c.fillStyle = LCD.ink; c.fillRect(1, LH - 10, LW - 2, 1);
    const okLbl = this.state !== 'open' ? 'Open' : !this.items().length ? '' : this.page === 'msg' ? 'Send' : this.page === 'msgs' ? 'Open' : 'Select';
    const bk = this.state !== 'open' ? '' : this.page === 'home' || (this.page === 'msgs' && !this.hasHome) ? 'Exit' : 'Back';
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
  // a page's title: the name on the left, a note on the right, a rule under them; returns where the page starts
  head(c, b, title, right = '') {
    c.fillStyle = LCD.ink; txt(c, fit(title, b.w - (right ? tw(right) + 6 : 0)), b.x, b.y);
    if (right) { c.fillStyle = LCD.mid; txt(c, right, b.x + b.w - tw(right), b.y); }
    c.fillStyle = LCD.ink; c.fillRect(b.x - 1, b.y + 9, b.w + 2, 1);
    return b.y + 12;
  }
  drawIdle(c, b, unread) {
    txt(c, 'NOXIA', Math.round((LW - tw('NOXIA', 2)) / 2), b.y + 18, 2);
    let s = unread ? `${unread} new message${unread > 1 ? 's' : ''}` : 'No new messages';
    if (unread && this.buzzT > 0 && Math.floor(performance.now() / 300) % 2 === 0) s = '';
    txt(c, s, Math.round((LW - tw(s)) / 2), b.y + 50);
    // who they're from
    if (unread) {
      const who = [...new Set(this.src.msgs().filter(m => !m.read).map(m => m.from))], f = fit(who.join(', '), b.w);
      c.fillStyle = LCD.mid; txt(c, f, Math.round((LW - tw(f)) / 2), b.y + 62); c.fillStyle = LCD.ink;
    }
  }
  drawList(c, b) {
    const items = this.items(), rowH = 11, title = { home: 'MENU', news: 'NEWS' }[this.page] || '';
    const top = this.head(c, b, title), rows = Math.floor((b.y + b.h - top) / rowH);
    if (!items.length) { c.fillStyle = LCD.mid; txt(c, 'Nothing yet', b.x, top + 2); c.fillStyle = LCD.ink; return; }
    if (this.sel < this.scroll) this.scroll = this.sel; if (this.sel >= this.scroll + rows) this.scroll = this.sel - rows + 1;
    for (let i = 0; i < rows && this.scroll + i < items.length; i++) {
      const k = this.scroll + i, it = items[k], y = top + i * rowH, on = k === this.sel;
      let s = it.t;
      if (it.k === 'msgs') { const u = this.src.msgs().filter(m => !m.read).length; s = `Messages${u ? ` (${u})` : ''}`; }
      if (it.k === 'n') s = it.n.head;
      if (on) { c.fillStyle = LCD.ink; c.fillRect(b.x - 1, y, b.w + 2, rowH); c.fillStyle = LCD.bg; }
      txt(c, fit(s, b.w), b.x, y + 2);
      c.fillStyle = LCD.ink;
    }
    scrollbar(c, top, b.y + b.h, items.length, rows, this.scroll);
  }
  // the conversations: who, how many unread (or a question waiting on you, or when they last wrote), and the latest line
  drawInbox(c, b) {
    const ts = this.threads(), u = this.src.msgs().filter(m => !m.read).length;
    const top = this.head(c, b, 'MESSAGES', u ? `${u} new` : ''), rowH = 20, rows = Math.floor((b.y + b.h - top) / rowH);
    if (!ts.length) { const s = 'No messages yet'; c.fillStyle = LCD.mid; txt(c, s, Math.round((LW - tw(s)) / 2), top + 36); c.fillStyle = LCD.ink; return; }
    if (this.sel < this.scroll) this.scroll = this.sel; if (this.sel >= this.scroll + rows) this.scroll = this.sel - rows + 1;
    const year = Math.max(...this.src.msgs().map(m => m.y || 0));
    for (let i = 0; i < rows && this.scroll + i < ts.length; i++) {
      const k = this.scroll + i, t = ts[k], y = top + i * rowH, on = k === this.sel, m0 = t.msgs[0];
      const n = t.msgs.filter(m => !m.read).length, ask = t.msgs.some(m => m.choices && !m.answer);
      const ink = on ? LCD.bg : LCD.ink, dim = on ? LCD.inv : LCD.mid;
      if (on) { c.fillStyle = LCD.ink; c.fillRect(b.x - 1, y, b.w + 2, rowH); }
      // right: a tag (unread count, or ? for a question you haven't answered), else when
      const tag = n ? String(n) : ask ? '?' : '', when = !m0 || m0.y == null ? '' : m0.y === year ? `R${(m0.r ?? 0) + 1}` : String(m0.y);
      let rw;
      if (tag) { rw = tw(tag) + 4; const x = b.x + b.w - rw; c.fillStyle = ink; c.fillRect(x, y + 1, rw, 9); c.fillStyle = on ? LCD.ink : LCD.bg; txt(c, tag, x + 2, y + 2); }
      else { rw = tw(when); c.fillStyle = dim; txt(c, when, b.x + b.w - rw, y + 2); }
      // the name, and the latest line (or your reply to it)
      c.fillStyle = ink; const name = fit(t.from, b.w - rw - 5); txt(c, name, b.x + 1, y + 2);
      const a = m0?.choices && m0.answer ? m0.choices.find(ch => ch[0] === m0.answer) : null;
      c.fillStyle = dim; txt(c, fit(a ? `You: ${a[1]}` : m0 ? String(m0.body).replace(/\s+/g, ' ').trim() : 'Send a text', b.w - 2), b.x + 1, y + 11); // (a contact who hasn't texted yet)
      c.fillStyle = LCD.ink;
    }
    scrollbar(c, top, b.y + b.h, ts.length, rows, this.scroll);
  }
  // a conversation, oldest at the top: their texts in bubbles on the left (a burst grouped, the tail on its last), your
  // replies filled in on the right, the round each was sent in between, and NEW above what you hadn't read
  drawThread(c, b) {
    const t = this.thread(), choices = this.items(); this.head(c, b, t.from.toUpperCase());
    const { top, bot, V, L, max } = this.threadView(t, b, choices);
    c.save(); c.beginPath(); c.rect(0, top, LW, V); c.clip();
    for (const it of L.items) {
      const y = top + it.y - this.scroll; if (y > bot || y + it.h < top) continue;
      if (it.k === 'day') { const x = Math.round((LW - tw(it.s)) / 2); c.fillStyle = LCD.mid; txt(c, it.s, x, y + 1); c.fillRect(b.x + 2, y + 4, x - b.x - 6, 1); c.fillRect(x + tw(it.s) + 4, y + 4, b.x + b.w - 2 - (x + tw(it.s) + 4), 1); }
      else if (it.k === 'new') { const w = tw('NEW') + 4, x = Math.round((LW - w) / 2); c.fillStyle = LCD.ink; c.fillRect(x, y, w, 9); c.fillRect(b.x + 2, y + 4, x - b.x - 4, 1); c.fillRect(x + w + 2, y + 4, b.x + b.w - 2 - (x + w + 2), 1); c.fillStyle = LCD.bg; txt(c, 'NEW', x + 2, y + 1); }
      else bubble(c, it, it.k === 'out' ? b.x + b.w - 2 - it.w : b.x + 2, y);
    }
    c.restore(); c.fillStyle = LCD.ink;
    if (max > 0) { const h = Math.max(4, Math.round(V * V / L.h)), y = top + Math.round((V - h) * this.scroll / max); for (let k = top; k < bot; k += 2) c.fillRect(LW - 2, k, 1, 1); c.fillRect(LW - 2, y, 1, h); }
    // waiting on your reply: the answers, under a rule
    if (choices.length) {
      const y0 = bot + 3;
      c.fillRect(b.x - 1, bot + 1, b.w + 2, 1);
      choices.forEach((it, k) => {
        const y = y0 + k * 11, on = k === this.sel;
        if (on) { c.fillStyle = LCD.ink; c.fillRect(b.x - 1, y, b.w + 2, 11); c.fillStyle = LCD.bg; }
        txt(c, fit(it.t, b.w), b.x, y + 2);
        c.fillStyle = LCD.ink;
      });
    }
  }
  // where the conversation sits on the screen, laid out, and the scroll settled (at NEW, or the newest, on opening)
  threadView(t = this.thread(), b = BODY, choices = this.items()) {
    const top = b.y + 12, bot = b.y + b.h - (choices.length ? choices.length * 11 + 3 : 0), V = bot - top;
    const L = this.layThread(t, b.w), max = Math.max(0, L.h - V);
    if (this.scroll === -2) this.scroll = L.mineY != null ? Math.max(0, L.mineY - 4) : max; // (your last message at the top)
    else if (this.scroll < 0) this.scroll = L.newY != null ? L.newY : max;
    this.scroll = Math.max(0, Math.min(max, this.scroll)); this.lay = { max };
    return { top, bot, V, L, max };
  }
  layThread(t, w) {
    const items = []; let y = 0, when = null, newY = null;
    const push = (it, gap) => { if (items.length) y += gap; it.y = y; items.push(it); y += it.h; };
    const bub = (k, text) => { const lines = wrap(String(text).replace(/\s+/g, ' ').trim(), w - 22); return { k, lines, w: Math.max(...lines.map(l => tw(l))) + 6, h: lines.length * 10 + 3 }; };
    for (const m of t.msgs.slice().reverse()) {
      const s = m.y != null ? `R${(m.r ?? 0) + 1} ${m.y}` : null;
      if (s && s !== when) { push({ k: 'day', s, h: 9 }, 7); when = s; }
      if (m.id === this.newId) { const d = items.at(-1)?.k === 'day' ? items.at(-1) : null; push({ k: 'new', h: 9 }, d ? 3 : 7); newY = d ? d.y : items.at(-1).y; } // (opened here: with the round above it, if it starts one)
      if (m.note) { push({ k: 'day', s: String(m.body).toUpperCase(), h: 9 }, 5); continue; } // (what your message did)
      const last = items.at(-1)?.k, side = m.mine ? 'out' : 'in';
      push(bub(side, m.body), last === side ? 2 : last ? 6 : 4);
      const a = m.choices && m.answer ? m.choices.find(ch => ch[0] === m.answer) : null;
      if (a) push(bub('out', a[1]), 4);
    }
    // (while they're typing: what you picked, or typed, as your message; then their dots)
    if (this.talking && this.pending) push(bub('out', this.pending), items.at(-1)?.k === 'out' ? 2 : 6);
    if (this.talking) push(bub('in', '...'), 6); // (they're typing)
    const mineY = [...items].reverse().find(it => it.k === 'out')?.y ?? null;
    // the tail goes on the last bubble of a run from the same side
    items.forEach((it, i) => { if ((it.k === 'in' || it.k === 'out') && items[i + 1]?.k !== it.k) it.tail = true; });
    return { items, h: y, newY, mineY };
  }
  // a news story (and any long text): the headline, then the text, scrolled a line at a time
  drawText(c, b, head, text) {
    const lines = wrap(text, b.w);
    const all = [...wrap(head, b.w).map(l => ({ l, head: true })), { l: '' }, ...lines.map(l => ({ l }))];
    const rowH = 10, room = Math.floor(b.h / rowH);
    this.scroll = Math.max(0, Math.min(this.scroll, all.length - room));
    for (let i = 0; i < room && this.scroll + i < all.length; i++) {
      const L = all[this.scroll + i], y = b.y + i * rowH;
      txt(c, L.l, b.x, y);
      if (L.head) c.fillRect(b.x, y + 9, tw(L.l), 1);
    }
    scrollbar(c, b.y, b.y + b.h, all.length, room, this.scroll);
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
    this.rig.position.set(0.045 * (1 - open), -0.46 + 0.29 * peek + 0.17 * open + Math.sin(t * 1.3) * 0.003, 0);
    this.rig.rotation.set(-0.3 + 0.24 * open, -0.34 + 0.26 * open, 0.1 * (1 - open));
    if (this.buzzT > 0) { this.rig.rotation.z += Math.sin(t * 90) * 0.035 * Math.min(1, this.buzzT * 2); this.rig.position.x += Math.sin(t * 77) * 0.003; }
    if (this.dirty || this.buzzT > 0 || (this.state !== 'open' && Math.floor(t * 3.3) !== this.blink)) { this.blink = Math.floor(t * 3.3); this.drawLCD(); this.dirty = false; }
    if (Math.abs(was - this.k) > 1e-4 || this.buzzT > 0 || true) this.renderer.render(this.scene, this.camera);
  }
}

// ---------- a 5x7 dot-matrix font (each glyph: 7 rows of 5 bits, the left dot = 16; g j p q y hang 2 rows below) ----------
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
  'f': '06 09 08 1C 08 08 08', 'g': '00 00 0F 11 11 11 0F 01 0E', 'h': '10 10 16 19 11 11 11', 'i': '04 00 0C 04 04 04 0E', 'j': '02 00 06 02 02 02 02 12 0C',
  'k': '10 10 12 14 18 14 12', 'l': '0C 04 04 04 04 04 0E', 'm': '00 00 1A 15 15 11 11', 'n': '00 00 16 19 11 11 11', 'o': '00 00 0E 11 11 11 0E',
  'p': '00 00 1E 11 11 11 1E 10 10', 'q': '00 00 0F 11 11 11 0F 01 01', 'r': '00 00 16 19 10 10 10', 's': '00 00 0E 10 0E 01 1E', 't': '08 08 1C 08 08 09 06',
  'u': '00 00 11 11 11 13 0D', 'v': '00 00 11 11 11 0A 04', 'w': '00 00 11 11 15 15 0A', 'x': '00 00 11 0A 04 0A 11', 'y': '00 00 11 11 11 11 0F 01 0E',
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
    for (let r = 0; r < g.length; r++) { const row = g[r]; if (!row) continue; for (let b = 0; b < 5; b++) if (row & (16 >> b)) c.fillRect(ox + b * k, y + r * k, k, k); }
  }
}
// a text bubble: theirs outlined, yours filled; corners rounded off, and a tail on the last of a run
function bubble(c, it, x, y) {
  const { w, h } = it, mine = it.k === 'out';
  c.fillStyle = LCD.ink;
  if (mine) { c.fillRect(x + 1, y, w - 2, h); c.fillRect(x, y + 1, 1, h - 2); c.fillRect(x + w - 1, y + 1, 1, h - 2); }
  else { c.fillRect(x + 1, y, w - 2, 1); c.fillRect(x + 1, y + h - 1, w - 2, 1); c.fillRect(x, y + 1, 1, h - 2); c.fillRect(x + w - 1, y + 1, 1, h - 2); }
  if (it.tail) { if (mine) { c.fillRect(x + w - 1, y + h - 1, 3, 1); c.fillRect(x + w, y + h - 2, 1, 1); } else { c.fillRect(x - 2, y + h - 1, 3, 1); c.fillRect(x - 1, y + h - 2, 1, 1); } }
  c.fillStyle = mine ? LCD.bg : LCD.ink;
  it.lines.forEach((l, i) => txt(c, l, x + 3, y + 2 + i * 10));
  c.fillStyle = LCD.ink;
}
// a 1-dot scrollbar at the screen's right edge: a dotted track, a solid thumb (only when there's more than fits)
function scrollbar(c, top, bot, n, rows, at) {
  if (n <= rows) return;
  const H = bot - top, h = Math.max(4, Math.round(H * rows / n)), y = top + Math.round((H - h) * at / Math.max(1, n - rows));
  for (let k = top; k < bot; k += 2) c.fillRect(LW - 2, k, 1, 1);
  c.fillRect(LW - 2, y, 1, h);
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
