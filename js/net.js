// Online play: WebRTC peer-to-peer via PeerJS (window.Peer, vendor/peerjs.min.js).
// Star topology: the host's browser is the hub. Every client simulates its own car and
// streams its state; the host also runs the AI cars and relays everyone's state.
// The public PeerJS broker is only used to introduce the two browsers (room code -> peer).
export const PROTO = 17; // 4: point-to-point tracks, 5: tree mixes / Nature brush / new tree models, 6: GT / street / utility cars online, 7: race control (flags, penalties), 8: car pick on the grid + drift scores, 9: VSC / drive-throughs / black flags, 10: handling rework (tyres, braking, drift control), 11: steering kept under braking (absF), 12: driver aids + host aid rule, 13: longer pit lane (garages further in, entry line at the wall), 14: braking pitch tapers at high speed (GT cars no longer swap ends braking into fast kinks), 15: spinning wheels (slip ratio, real ABS / TC, lock-ups, engine braking), 16: full weight transfer under power, stability control engine cut, 17: four tyres on a sprung body (suspension, per-wheel kerbs / grass), stability control braking
const PREFIX = 'svgp-gp1-';
const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export class Net {
  constructor() {
    this.peer = null; this.isHost = false; this.id = null; this.code = null;
    this.conns = new Map(); // host: peerId -> { rel, fast, rtt }
    this.rel = null; this.fast = null; // client: links to the host
    this.handlers = {};
    this.offset = 0; this.rtt = 0; this.samples = [];
    this.closed = false;
  }
  static available() { return typeof window !== 'undefined' && !!window.Peer; }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  emit(type, ...a) { (this.handlers[type] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }
  now() { return performance.now() + this.offset; }

  // ---------------- host ----------------
  host() {
    this.isHost = true;
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        this.code = makeCode();
        const peer = new window.Peer(PREFIX + this.code, { config: { iceServers: ICE }, debug: 0 });
        this.peer = peer;
        let opened = false;
        const to = setTimeout(() => { if (!opened) { peer.destroy(); reject(new Error('Could not reach the matchmaking server. Check your internet connection.')); } }, 15000);
        peer.on('open', (id) => { opened = true; clearTimeout(to); this.id = id; resolve(this.code); });
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && tries++ < 4) { clearTimeout(to); peer.destroy(); attempt(); return; }
          if (!opened) { clearTimeout(to); reject(new Error(errText(e))); } else this.emit('error', errText(e));
        });
        peer.on('disconnected', () => { if (!this.closed) try { peer.reconnect(); } catch (e) {} }); // lost the broker only; games keep running
        peer.on('connection', (c) => this.hostAccept(c));
      };
      attempt();
    });
  }
  hostAccept(c) {
    const pid = c.peer;
    const e = this.conns.get(pid) || { rel: null, fast: null, rtt: 0 };
    this.conns.set(pid, e);
    if (c.label === 'fast') e.fast = c; else e.rel = c;
    c.on('data', (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'ping') { this.sendTo(pid, { t: 'pong', c: m.c, h: performance.now() }); e.rtt = m.rtt || e.rtt; return; }
      if (m.t === 'st') { // relay car state to everybody else
        for (const [id, o] of this.conns) if (id !== pid) sendFast(o, m);
        this.emit('state', m, pid);
        return;
      }
      this.emit('message', m, pid);
    });
    c.on('close', () => this.hostDrop(pid));
    c.on('error', () => this.hostDrop(pid));
  }
  hostDrop(pid) {
    const e = this.conns.get(pid); if (!e) return;
    this.conns.delete(pid);
    try { e.rel && e.rel.close(); e.fast && e.fast.close(); } catch (x) {}
    this.emit('left', pid);
  }
  kick(pid) { this.sendTo(pid, { t: 'kick' }); setTimeout(() => this.hostDrop(pid), 300); }

  // ---------------- client ----------------
  join(code) {
    this.isHost = false;
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.code = code;
    return new Promise((resolve, reject) => {
      if (code.length < 4) return reject(new Error('Enter the 5-letter room code.'));
      const peer = new window.Peer({ config: { iceServers: ICE }, debug: 0 });
      this.peer = peer;
      let done = false;
      const fail = (msg) => { if (done) return; done = true; clearTimeout(to); try { peer.destroy(); } catch (e) {} reject(new Error(msg)); };
      const to = setTimeout(() => fail('Could not connect to the host. Check the code — if it is right, your networks may be blocking peer-to-peer (see README).'), 20000);
      peer.on('error', (e) => { if (!done) fail(errText(e)); else this.emit('error', errText(e)); });
      peer.on('disconnected', () => { if (!this.closed) try { peer.reconnect(); } catch (e) {} });
      peer.on('open', (id) => {
        this.id = id;
        const hostId = PREFIX + code;
        const rel = peer.connect(hostId, { label: 'rel', reliable: true });
        const fast = peer.connect(hostId, { label: 'fast', reliable: false, serialization: 'json' });
        this.rel = rel; this.fast = fast;
        let n = 0;
        const ready = () => { if (++n === 2 && !done) { done = true; clearTimeout(to); this.startPings(); resolve(); } };
        rel.on('open', ready); fast.on('open', ready);
        const onData = (m) => {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'pong') return this.onPong(m);
          if (m.t === 'st') return this.emit('state', m, m.from);
          this.emit('message', m, hostId);
        };
        rel.on('data', onData); fast.on('data', onData);
        const lost = () => { if (this.closed) return; this.closed = true; clearInterval(this.pingIv); this.emit('hostLost'); };
        rel.on('close', lost); rel.on('error', lost);
      });
    });
  }
  startPings() {
    const ping = () => { if (this.rel && this.rel.open) this.rel.send({ t: 'ping', c: performance.now(), rtt: Math.round(this.rtt) }); };
    ping(); setTimeout(ping, 300); setTimeout(ping, 700);
    this.pingIv = setInterval(ping, 2000);
  }
  onPong(m) {
    const now = performance.now(), rtt = now - m.c;
    this.samples.push({ rtt, off: m.h + rtt / 2 - now });
    if (this.samples.length > 12) this.samples.shift();
    // the quickest round trips give the most accurate clock offset
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt)[0];
    const target = best.off;
    this.offset = this.samples.length < 3 || Math.abs(target - this.offset) > 250 ? target : this.offset + (target - this.offset) * 0.3;
    this.rtt = this.rtt ? this.rtt * 0.7 + rtt * 0.3 : rtt;
  }

  // ---------------- sending ----------------
  send(m) { // reliable: host -> everyone, client -> host
    if (this.isHost) { for (const [, o] of this.conns) if (o.rel && o.rel.open) o.rel.send(m); }
    else if (this.rel && this.rel.open) this.rel.send(m);
  }
  sendTo(pid, m) { const o = this.conns.get(pid); if (o && o.rel && o.rel.open) o.rel.send(m); }
  sendState(m) { // unreliable, fire and forget
    m.from = this.id;
    if (this.isHost) { for (const [, o] of this.conns) sendFast(o, m); }
    else if (this.fast && this.fast.open) { try { this.fast.send(m); } catch (e) {} }
  }
  pingOf(pid) { return this.isHost ? (this.conns.get(pid)?.rtt || 0) : this.rtt; }
  peers() { return [...this.conns.keys()]; }

  close() {
    this.closed = true;
    clearInterval(this.pingIv);
    try { if (!this.isHost) this.send({ t: 'bye' }); else this.send({ t: 'closed' }); } catch (e) {}
    setTimeout(() => { try { this.peer && this.peer.destroy(); } catch (e) {} }, 150);
  }
}

function sendFast(o, m) {
  const c = o.fast && o.fast.open ? o.fast : o.rel && o.rel.open ? o.rel : null;
  if (c) try { c.send(m); } catch (e) {}
}
function errText(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'No room with that code. Check it with your friend (codes are 5 characters).';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Could not reach the matchmaking server. Check your internet connection.';
  if (t === 'browser-incompatible') return 'This browser does not support WebRTC. Use Chrome, Edge or Firefox.';
  if (t === 'unavailable-id') return 'Room code clash, try again.';
  return (e && e.message) || String(e);
}
