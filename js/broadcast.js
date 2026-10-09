// The broadcast booth's director: watches a race and decides what the two commentators talk about (the exchanges in
// assets/voice/san_velocita_lines_with_announcer.txt, [booth]). It works like a TV director, not a sensor log: most
// moments go unsaid. What gets on air is what matters (your car, your teammate, the leaders, the cars around you),
// while it's fresh, and with room to breathe: a pause after every exchange that grows the more they've talked lately,
// the same moment not again for a couple of minutes, the same kind of moment not back to back, every take of a moment
// before any repeats, and small talk only after a real silence. The finish and a big crash can't wait: they go now.
// Pure logic (no audio): it pushes { type: 'booth', id, force } into race.events; main.js plays it (vo.js) and tells it
// when the booth or the engineer is talking (busy). race.js calls update(dt) every frame of a race, and contact() /
// hit() from its collisions.

// w: how much it matters (times how much the cars in it matter, rel()), min: the score it needs to get on air,
// p: the chance it does when it qualifies (variety), gap: seconds of quiet it needs first, cd: seconds before the same
// moment again, cat: moments of a kind (a kind waits CAT_GAP after the last one), force: says it now, over anything,
// alt: other exchanges that can stand in for it
const M = {
  'start.green': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'start', force: true },
  'start.chaos': { w: 8, min: 0, gap: 0, cd: 1e9, cat: 'start', stale: 6 },
  'pass.clean': { w: 3, min: 4.5, p: 0.75, gap: 6, cd: 80, cat: 'pass' },
  'pass.aggressive': { w: 4, min: 4.5, p: 0.85, gap: 5, cd: 80, cat: 'pass', alt: ['moment.wouldve'] },
  'pass.failed': { w: 2.5, min: 4.5, p: 0.6, gap: 8, cd: 100, cat: 'pass' },
  'moment.ambitious': { w: 3, min: 4.5, p: 0.8, gap: 6, cd: 150, cat: 'pass' },
  'battle.sidebyside': { w: 3, min: 4.5, p: 0.8, gap: 5, cd: 90, cat: 'battle' },
  'battle.defense': { w: 2.5, min: 4.5, p: 0.7, gap: 10, cd: 150, cat: 'battle' },
  'battle.closing': { w: 2.5, min: 4.5, p: 0.7, gap: 10, cd: 120, cat: 'battle' },
  'battle.stuck': { w: 2, min: 4.5, p: 0.7, gap: 12, cd: 180, cat: 'battle' },
  'moment.closecall': { w: 3, min: 4.5, p: 0.7, gap: 4, cd: 120, cat: 'incident', stale: 4 },
  'moment.surprise': { w: 3, min: 5, p: 0.9, gap: 10, cd: 240, cat: 'battle' },
  'incident.spin': { w: 3.5, min: 3.5, p: 0.9, gap: 3, cd: 60, cat: 'incident', stale: 7 },
  'incident.save': { w: 3.5, min: 5, p: 0.9, gap: 3, cd: 90, cat: 'incident', stale: 6 },
  'incident.offtrack': { w: 2.5, min: 4.5, p: 0.7, gap: 5, cd: 90, cat: 'incident', stale: 6 },
  'incident.crash': { w: 8, min: 0, gap: 0, cd: 25, cat: 'crash', force: true },
  'incident.multicar': { w: 10, min: 0, gap: 0, cd: 60, cat: 'crash', force: true },
  'incident.crash.relief': { w: 5, min: 0, gap: 3, cd: 60, cat: 'relief', stale: 20 },
  'finish.finallap': { w: 6, min: 0, gap: 0, cd: 1e9, cat: 'flow', stale: 15 },
  'finish.close': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'finish', force: true },
  'finish.win': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'finish', force: true },
  'finish.dominant': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'finish', force: true },
  'finish.upset': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'finish', force: true },
  'finish.reflect': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'finish', force: true },
  // small talk: only after a real silence
  'quiet.early': { w: 2, min: 0, gap: 14, cd: 1e9, cat: 'quiet' },
  'quiet.gap': { w: 2, min: 0, gap: 30, cd: 300, cat: 'quiet' },
  'quiet.mirrors': { w: 2, min: 3, gap: 30, cd: 400, cat: 'quiet' },
  'quiet.pitwindow': { w: 2.5, min: 0, gap: 20, cd: 1e9, cat: 'quiet', stale: 30 },
  'quiet.rain': { w: 2.5, min: 0, gap: 20, cd: 1e9, cat: 'quiet', stale: 30 },
  'quiet.tires': { w: 2, min: 0, gap: 30, cd: 1e9, cat: 'quiet', stale: 60 },
};
const CAT_GAP = { pass: 25, battle: 40, incident: 10, quiet: 60, crash: 8, start: 0, flow: 0, finish: 0, relief: 0 };
const STALE = 2.5; // (seconds: a moment older than this isn't news any more; m.stale: incidents keep a little longer)
const TAKE_CD = 300; // (seconds before the same recorded take again: a single-take moment waits that long, unless it's forced)

export class Broadcast {
  constructor(race) {
    this.r = race;
    this.lines = null;   // the booth's recorded exchanges (main.js, from vo.js): a moment needs one to be said
    this.busy = false;   // main.js: the booth or the engineer is talking
    this.t = 0;
    this.lastEnd = -99; this.lastSay = -99; this.saidT = {}; this.catT = {}; this.used = {}; this.takeT = {}; this.recent = []; this.sayT = [];
    this.cand = [];
    this.cs = new Map(); // per car: slides, spins, offs, hits
    this.ps = new Map(); // per pair (a ahead of b): side by side, attempts, gaps
    this.passT = {}; this.once = {};
    this.prevOrder = null;
  }
  rel(car) {
    const r = this.r, pl = r.player;
    if (!car) return 1;
    if (car.isPlayer) return 3;
    if (pl && r.teamMate && r.teamMate(pl) === car) return 2.2;
    if (car.pos <= 3) return 2;
    if (pl && Math.abs(car.pos - pl.pos) <= 2) return 1.6;
    return 1;
  }
  // a moment happened: it goes in this frame's candidates (the best one, if any, gets on air)
  note(id, cars = [], o = {}) {
    const m = M[id]; if (!m) return;
    const score = m.w * Math.max(1, ...cars.map(c => this.rel(c))) * (o.k || 1);
    if (score < m.min) return;
    const old = this.cand.find(c => c.id === id);
    if (old) { if (score > old.score) Object.assign(old, { score, cars }); return; } // (still happening: the first sighting stands)
    this.cand.push({ id, score, t: this.t, m, cars });
  }
  // the exchange to say for a moment: a take that hasn't been used (or the least used), never the last one again, and
  // none heard in the last TAKE_CD seconds (a forced moment takes the least recent if it has to)
  pick(id) {
    const m = M[id], L = this.lines;
    const ids = [id, ...(m.alt || [])].flatMap(b => L ? [...L].filter(k => k === b || (k.startsWith(b + '.') && /^\d+$/.test(k.slice(b.length + 1)))) : [b]);
    if (!ids.length) return null;
    const last = this.recent[this.recent.length - 1];
    let pool = ids.filter(k => k !== last && this.t - (this.takeT[k] ?? -1e9) >= TAKE_CD);
    if (!pool.length) { if (!m.force) return null; pool = [...ids].sort((a, b) => (this.takeT[a] ?? -1e9) - (this.takeT[b] ?? -1e9)).slice(0, 1); }
    const least = Math.min(...pool.map(k => this.used[k] || 0));
    const fresh = pool.filter(k => (this.used[k] || 0) === least);
    return fresh[Math.floor(Math.random() * fresh.length)];
  }
  // how much quiet the next exchange needs: more, the more they've said in the last two minutes
  chatter() { return this.recent.filter((_, i) => this.t - this.sayT[i] < 120).length; }
  decide() {
    const now = this.t;
    this.cand = this.cand.filter(c => now - c.t < (c.m.stale || STALE));
    if (!this.cand.length) return;
    this.cand.sort((a, b) => (b.m.force ? 1e3 : 0) + b.score - ((a.m.force ? 1e3 : 0) + a.score));
    for (const c of this.cand) {
      const m = c.m;
      if (now - (this.saidT[c.id] ?? -1e9) < m.cd) continue;
      if (!m.force) {
        if (this.busy) continue;
        const quiet = now - Math.max(this.lastEnd, this.lastSay);
        if (quiet < m.gap + (m.cat === 'incident' ? 0 : Math.min(12, 2.5 * this.chatter()))) continue; // (incidents can't wait for a breather)
        if (now - (this.catT[m.cat] ?? -1e9) < CAT_GAP[m.cat]) continue;
        // (variety: a moment that qualifies still sometimes goes by; never one of yours)
        if (!c.cars.some(x => x && x.isPlayer) && Math.random() > (m.p ?? 1)) { this.saidT[c.id] = now - m.cd * 0.7; continue; }
      }
      const id = this.pick(c.id); if (!id) continue;
      this.say(c.id, id, m);
      this.cand = this.cand.filter(x => x.m.cat !== m.cat && !x.m.force); // (said: the rest of its kind is old news)
      break;
    }
  }
  say(moment, id, m) {
    this.saidT[moment] = this.t; this.catT[m.cat] = this.t; this.lastSay = this.t;
    this.used[id] = (this.used[id] || 0) + 1; this.takeT[id] = this.t; this.recent.push(id); this.sayT.push(this.t);
    this.busy = true;
    this.r.events.push({ type: 'booth', id, force: !!m.force });
  }

  // ---- hooks from race.js ----
  // two cars touched (vn: how hard)
  contact(a, b, vn) { if (vn < 2) return; const t = this.t; for (const c of [a, b]) { const s = this.car(c); s.touchT = t; s.touchWith = c === a ? b : a; } }
  // a car hit something hard (a wall or a car): v, m/s
  hit(car, v) {
    const s = this.car(car), t = this.t;
    if (v < 22 || car.pitting) return;
    if (t - (s.bigT ?? -99) < 15) return;
    s.bigT = t; s.bigV = v;
    (this.bigs ||= []).push({ car, t });
    this.bigs = this.bigs.filter(x => t - x.t < 3);
    const near = this.bigs.filter(x => x.car !== car && Math.abs(x.car.progress - car.progress) < 80);
    if (near.length >= 2 && !this.multiT) { this.multiT = t; this.note('incident.multicar', [car, ...near.map(x => x.car)]); return; }
    this.note('incident.crash', [car]);
    if (!this.relief) this.relief = { car, t };
  }

  car(c) { let s = this.cs.get(c); if (!s) this.cs.set(c, s = { beta: 0 }); return s; }
  pair(a, b) { const k = (a.pid || a.idxNo || a.name) + '|' + (b.pid || b.idxNo || b.name); let s = this.ps.get(k); if (!s) this.ps.set(k, s = { sbs: 0, near: 0, close: 0, att: 0, gh: [] }); return s; }

  update(dt) {
    const r = this.r;
    if (r.mode !== 'race' || r.state !== 'racing' && r.state !== 'finished') return;
    if (!this.started) { this.started = true; this.t = r.raceTime; }
    this.t = r.raceTime;
    if (this.busy) this.wasBusy = true; else if (this.wasBusy) { this.wasBusy = false; this.lastEnd = this.t; }
    const order = (r.order || []).filter(c => !c.gone);
    if (!this.once.green && r.state === 'racing') { this.once.green = true; this.note('start.green'); }
    if (r.state === 'racing') {
      this.start(order);
      this.passes(order);
      this.pairs(order, dt);
      for (const c of order) this.perCar(c, dt);
      this.flow(order);
    }
    this.finish(order);
    this.decide();
    this.prevOrder = order;
  }

  // three wide into the first corner
  start(order) {
    if (this.once.chaos || this.t > 12 || this.t < 1) return;
    for (let i = 0; i + 2 < order.length; i++) {
      const g = order.slice(i, i + 4).filter(c => Math.abs(c.progress - order[i].progress) < 7);
      if (g.length < 3) continue;
      const s = g.map(c => c.s).sort((a, b) => a - b);
      if (s.slice(1).every((x, k) => x - s[k] > 1.6)) { this.once.chaos = true; this.note('start.chaos', g); return; }
    }
  }

  // places changing hands (not in the pits, not a car going off and rejoining: a swap with the car next to it)
  passes(order) {
    const prev = this.prevOrder; if (!prev || this.t < 8) return;
    for (let k = 0; k < order.length; k++) {
      const a = order[k], was = prev.indexOf(a);
      if (was !== k + 1 || a.pitting || a.lap < 1) continue; // (up exactly one place)
      const b = prev[k]; if (!b || b === a || b.pitting || b.gone || order.indexOf(b) !== k + 1) continue;
      const key = (a.pid || a.name) + '>' + (b.pid || b.name);
      if (this.t - (this.passT[key] ?? -99) < 8) continue; // (side by side through a corner: one pass, not three)
      this.passT[key] = this.t;
      const T = this.r.T, corner = T.K ? Math.abs(T.K[a.idx]) > 1 / 150 : false;
      const sa = this.car(a), touched = this.t - (sa.touchT ?? -99) < 2 && sa.touchWith === b;
      this.note(corner || touched ? 'pass.aggressive' : 'pass.clean', [a, b]);
      const ps = this.pair(b, a); ps.att = 0; ps.close = 0; ps.attempt = null; // (the old pair's story is over)
    }
    // a car from well back now on the podium places
    for (const c of order) {
      if (c.pos <= 3 && (c.startPos || 0) - c.pos >= 5 && !this.once['surp' + (c.pid || c.name)] && c.lap >= 2) {
        this.once['surp' + (c.pid || c.name)] = true; this.note('moment.surprise', [c]);
      }
    }
  }

  // each car and the one ahead of it
  pairs(order, dt) {
    for (let k = 1; k < order.length; k++) {
      const a = order[k - 1], b = order[k];
      if (a.pitting || b.pitting || a.finished || b.finished || a.lap < 1) continue;
      const s = this.pair(a, b), along = a.progress - b.progress, lat = Math.abs((a.s || 0) - (b.s || 0));
      const v = Math.max(15, b.phys.speed), gap = along / v;
      const fast = b.phys.speed > 25;
      // side by side
      if (along < 4 && lat > 1.4 && lat < 5 && fast) s.sbs += dt; else s.sbs = 0;
      if (s.sbs > 2.5) this.note('battle.sidebyside', [a, b]);
      // a close call: right alongside, inches apart, and nobody touched
      if (along < 4 && lat > 1.3 && lat < 2.15 && fast) s.tight = this.t;
      if (s.tight != null && this.t - s.tight > 1) {
        const touched = this.t - (this.car(b).touchT ?? -99) < 2;
        if (!touched) this.note('moment.closecall', [a, b]);
        s.tight = null;
      }
      // a look: alongside for a moment; if they drop back without getting by, it didn't come off
      if (along < 3 && lat > 1.4) { if (!s.attempt) s.attempt = { t: this.t, touch: this.car(b).touchT ?? -99 }; }
      else if (s.attempt && along > 10) {
        const A = s.attempt; s.attempt = null;
        if (this.t - A.t > 0.6) {
          s.att++;
          const touched = (this.car(b).touchT ?? -99) > A.t;
          this.note(touched ? 'moment.ambitious' : 'pass.failed', [b, a]);
        }
      }
      // the gap over time (a sample a second): closing in, stuck behind, the mirrors
      s.acc = (s.acc || 0) + dt;
      if (s.acc >= 1) { s.acc = 0; s.gh.push(gap); if (s.gh.length > 40) s.gh.shift(); }
      const then = s.gh.length >= 25 ? s.gh[s.gh.length - 25] : null;
      if (then != null && then > 1.8 && gap < 0.8 && !s.closingSaid) { s.closingSaid = true; this.note('battle.closing', [b, a]); }
      if (gap > 2.5) s.closingSaid = false;
      if (gap < 1) s.close += dt; else { s.close = 0; s.att = 0; }
      if (s.close > 45 && !s.stuckSaid) { s.stuckSaid = true; this.note(s.att >= 2 ? 'battle.defense' : 'battle.stuck', [a, b]); }
      if (s.close === 0) s.stuckSaid = false;
      if (gap < 0.6) s.near += dt; else s.near = 0;
      if (s.near > 20) { s.near = -1e9; this.note('quiet.mirrors', [a, b]); }
    }
  }

  // one car: a spin, a big save, a trip through the grass
  perCar(c, dt) {
    if (c.pitting || c.finished || c.wreck) return;
    const s = this.car(c), p = c.phys, beta = Math.abs(p.beta || 0), t = this.t;
    // spun: way past sideways, and then going again
    if (beta > 1.3 && p.speed > 6 && !s.spin) s.spin = { t, hit: s.bigT ?? -99 };
    if (s.spin) {
      if (t - s.spin.t > 10 || (s.bigT ?? -99) > s.spin.hit) s.spin = null; // (stopped there, or it became a crash)
      else if (beta < 0.3 && p.speed > 10 && t - s.spin.t > 1) { s.spin = null; s.slide = null; this.note('incident.spin', [c]); }
    }
    // a big slide at speed, caught
    if (!s.spin && beta > 0.45 && beta < 1.1 && p.speed > 25 && !s.slide) s.slide = { t, touch: s.touchT ?? -99 };
    if (s.slide) {
      if (s.spin || t - s.slide.t > 3) s.slide = null;
      else if (beta < 0.12) {
        const clean = (s.touchT ?? -99) <= s.slide.t && c.onRoad !== false;
        if (clean && t - s.slide.t > 0.4) this.note('incident.save', [c]);
        s.slide = null;
      }
    }
    // off the road (grass, gravel) at speed, back on, and it cost places
    if (c.onRoad === false && p.speed > 15) { s.offT = (s.offT || 0) + dt; if (s.offT > 0.8 && !s.off) s.off = { t, pos: c.pos }; }
    else if (c.onRoad !== false) {
      s.offT = 0;
      if (s.off && !s.off.back) s.off.back = t;
      if (s.off && s.off.back && t - s.off.back > 3) {
        if (c.pos > s.off.pos && !s.spin) this.note('incident.offtrack', [c]);
        s.off = null;
      }
    }
  }

  // the race itself: the pit window, tires, rain, an early word, a leader pulling away, the last lap, a crash's after
  flow(order) {
    const r = this.r, lead = order[0], t = this.t;
    if (!lead) return;
    if (!this.saidT['quiet.early'] && lead.lap === 1 && t > 25 && t < 70) this.note('quiet.early');
    if (!this.once.pit && t > 30 && order.some(c => c.pitting && !c.isPlayer && c.lap >= 2)) { this.once.pit = true; this.note('quiet.pitwindow'); }
    if (!this.once.tires && lead.lap >= 3) {
      const ws = order.filter(c => c.phys && c.phys.tyre).map(c => Math.min(c.phys.tyre.wf ?? 1, c.phys.tyre.wr ?? 1));
      if (ws.length && ws.reduce((a, b) => a + b, 0) / ws.length < 0.55) { this.once.tires = true; this.note('quiet.tires'); }
    }
    if (!this.once.rain && r.wx && r.wx.to === 'rain' && r.wxEta) { const e = r.wxEta(); if (e != null && e > 0.3 && e < 2.5) { this.once.rain = true; this.note('quiet.rain'); } }
    const second = order[1];
    if (second && lead.lap >= 3 && !lead.finished && (lead.progress - second.progress) / Math.max(15, second.phys.speed) > 3.5) this.note('quiet.gap', [lead]);
    if (!this.once.last && r.laps >= 2 && lead.lap === r.laps && !lead.finished) { this.once.last = true; this.note('finish.finallap', [lead]); }
    // after a big crash: once the car's stopped (or out), the driver's fine
    const R = this.relief;
    if (R && t - R.t > 12) {
      if (R.car.gone || R.car.wreck || R.car.phys.speed < 1) { this.note('incident.crash.relief', [R.car]); }
      if (t - R.t > 40 || this.saidT['incident.crash.relief'] != null) this.relief = null;
    }
    // who's led, and the worst place the leader's been since the first lap (for the finish)
    for (const c of order) if (c.lap >= 2) c.bcWorst = Math.max(c.bcWorst || 0, c.pos);
    for (const c of order) { if (c.pos === 1) c.bcLed = (c.bcLed || 0) + 1; c.bcSeen = (c.bcSeen || 0) + 1; }
  }

  // the winner crosses the line: which finish was it?
  finish() {
    const r = this.r, F = r.finishOrder || [];
    if (this.once.fin || !F.length) return;
    const w = F[0];
    if (this.finWait == null) this.finWait = this.t;
    const second = F[1];
    if (!second && this.t - this.finWait < 0.8) return; // (a moment for second place to cross)
    this.once.fin = true;
    const n = r.cars.length, margin = second ? second.finishTime - w.finishTime : 99;
    const led = (w.bcLed || 0) / Math.max(1, w.bcSeen || 1);
    const id = margin < 0.3 ? 'finish.close'
      : (w.startPos || 1) >= Math.max(6, Math.ceil(n / 2)) ? 'finish.upset'
      : led > 0.75 && margin > 4 ? 'finish.dominant'
      : (w.bcWorst || 1) >= 5 ? 'finish.reflect'
      : 'finish.win';
    this.note(id, [w]);
  }
}
