// dev: co-op and online tests without the internet. A stand-in for PeerJS (window.Peer) goes into each page before
// the game loads; its messages are carried between the pages by the test itself (node), so two pages, each in its own
// browser context (their own saves), connect at once with no matchmaking server, STUN or WebRTC.
//   import { loopNet } from './loopnet.mjs';  await loopNet([hostPage, guestPage]);  (before page.goto)
// Covers what js/net.js uses: new Peer(id?), open / error / connection, connect(id, { label }), the connection's open /
// data / close, send, close, destroy. Data goes as JSON (net.js sends plain objects).
const FAKE = () => {
  const peers = {}; let n = 0;
  const tx = (m) => window.__loopSend(JSON.stringify(m));
  class Ev { on(t, f) { ((this.h ||= {})[t] ||= []).push(f); return this; } emit(t, ...a) { for (const f of (this.h || {})[t] || []) { try { f(...a); } catch (e) { console.error(e); } } } }
  class Conn extends Ev {
    constructor(p, remote, label, cid, o = {}) { super(); this.p = p; this.peer = remote; this.label = label; this.cid = cid; this.open = false; this.reliable = o.reliable; this.serialization = o.serialization; }
    send(d) { if (this.open) tx({ k: 'data', to: this.peer, cid: this.cid, d }); }
    close() { if (!this.open) return; this.open = false; tx({ k: 'close', to: this.peer, cid: this.cid }); this.emit('close'); }
  }
  class Peer extends Ev {
    constructor(id, opts) {
      super(); if (typeof id !== 'string') id = 'loop-' + Math.random().toString(36).slice(2, 10);
      this.id = id; this.conns = {}; this.destroyed = false; peers[id] = this;
      tx({ k: 'reg', id }).then(r => r === 'taken' ? this.emit('error', { type: 'unavailable-id' }) : this.emit('open', id));
    }
    connect(remote, o = {}) {
      const cid = `${this.id}:${++n}`, c = new Conn(this, remote, o.label || '', cid, o); this.conns[cid] = c;
      tx({ k: 'conn', to: remote, from: this.id, cid, label: c.label }).then(r => { if (r === 'nopeer') this.emit('error', { type: 'peer-unavailable' }); });
      return c;
    }
    destroy() { this.destroyed = true; for (const c of Object.values(this.conns)) c.close(); tx({ k: 'unreg', id: this.id }); delete peers[this.id]; }
    reconnect() {} disconnect() {}
  }
  window.__loopRecv = (json) => {
    const m = JSON.parse(json), p = peers[m.to]; if (!p) return;
    if (m.k === 'conn') { const c = new Conn(p, m.from, m.label, m.cid); p.conns[m.cid] = c; c.open = true; p.emit('connection', c); setTimeout(() => { c.emit('open'); tx({ k: 'ok', to: m.from, cid: m.cid }); }, 0); }
    else if (m.k === 'ok') { const c = p.conns[m.cid]; if (c && !c.open) { c.open = true; c.emit('open'); } }
    else if (m.k === 'data') { const c = p.conns[m.cid]; if (c) c.emit('data', m.d); }
    else if (m.k === 'close') { const c = p.conns[m.cid]; if (c && c.open) { c.open = false; c.emit('close'); } }
  };
  Object.defineProperty(window, 'Peer', { get: () => Peer, set() {}, configurable: false }); // (vendor/peerjs.min.js assigns over it: ignored)
};
export async function loopNet(pages) {
  const owner = new Map(); // peer id -> its page
  const queue = new Map(); // page -> the delivery chain (in order, one after another)
  for (const pg of pages) {
    await pg.addInitScript(FAKE);
    await pg.exposeFunction('__loopSend', (json) => {
      const m = JSON.parse(json);
      if (m.k === 'reg') { if (owner.has(m.id) && owner.get(m.id) !== pg) return 'taken'; owner.set(m.id, pg); return 'ok'; }
      if (m.k === 'unreg') { if (owner.get(m.id) === pg) owner.delete(m.id); return 'ok'; }
      const to = owner.get(m.to); if (!to) return 'nopeer';
      const q = (queue.get(to) || Promise.resolve()).then(() => to.evaluate((j) => window.__loopRecv && window.__loopRecv(j), json)).catch(() => {});
      queue.set(to, q);
      return 'ok';
    });
  }
}
