// The broadcast booth's director: watches a race and decides what the two commentators talk about (the exchanges in
// assets/voice/san_velocita_lines_with_announcer.txt, [booth]). It works like a TV director, not a sensor log: most
// moments go unsaid. What gets on air is what matters (your car, your teammate, the leaders, the cars around you),
// while it's fresh, and with room to breathe: a pause after every exchange that grows the more they've talked lately,
// the same moment not again for a couple of minutes, the same kind of moment not back to back, every take of a moment
// before any repeats, and small talk only after a real silence. The finish and a big crash can't wait: they go now.
// It only calls what you can see: a moment with cars in it needs you, or one of them in the camera's view (race.onScreen),
// except the few that matter wherever they are (a big crash, the finish, the leader), and each comes with a caption,
// so the graphic says who they mean (hud.js cap: a 2005 TV lower-third).
// Pure logic (no audio): it pushes { type: 'booth', id, force, cap } into race.events; main.js plays it (vo.js) and tells it
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
  'pass.aggressive': { w: 4, min: 4.5, p: 0.85, gap: 5, cd: 80, cat: 'pass' },
  'moment.wouldve': { w: 3, min: 0, gap: 2, cd: 300, cat: 'react', anywhere: true },
  'battle.pressure': { w: 2.5, min: 4.5, p: 0.8, gap: 6, cd: 60, cat: 'battle' },
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
  'incident.crash': { w: 8, min: 0, gap: 0, cd: 45, cat: 'crash', force: true },
  'incident.multicar': { w: 10, min: 0, gap: 0, cd: 60, cat: 'crash', force: true },
  'incident.crash.relief': { w: 5, min: 0, gap: 3, cd: 60, cat: 'relief', stale: 20 , anywhere: true },
  'finish.finallap': { w: 6, min: 0, gap: 0, cd: 1e9, cat: 'flow', stale: 15 , anywhere: true },
  'finish.close': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'finish', force: true, stale: 15 , anywhere: true },
  'finish.win': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'finish', force: true, stale: 15 , anywhere: true },
  'finish.dominant': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'finish', force: true, stale: 15 , anywhere: true },
  'finish.upset': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'finish', force: true, stale: 15 , anywhere: true },
  'finish.reflect': { w: 10, min: 0, gap: 0, cd: 1e9, cat: 'finish', force: true, stale: 15 , anywhere: true },
  // small talk: only after a real silence
  'quiet.early': { w: 2, min: 0, gap: 14, cd: 1e9, cat: 'quiet' },
  'quiet.chat': { w: 1.5, min: 0, gap: 40, cd: 100, cat: 'quiet', stale: 999 }, // (the conversations: after a real silence)
  'quiet.gap': { w: 2, min: 0, gap: 30, cd: 300, cat: 'quiet' , anywhere: true },
  'quiet.mirrors': { w: 2, min: 3, gap: 30, cd: 400, cat: 'quiet' },
  'quiet.pitwindow': { w: 2.5, min: 0, gap: 20, cd: 1e9, cat: 'quiet', stale: 30 },
  'quiet.rain': { w: 2.5, min: 0, gap: 20, cd: 1e9, cat: 'quiet', stale: 30 },
  'quiet.tires': { w: 2, min: 0, gap: 30, cd: 1e9, cat: 'quiet', stale: 60 },
};
const CAT_GAP = { pass: 25, battle: 40, incident: 10, quiet: 60, crash: 30, start: 0, flow: 0, finish: 0, relief: 0, react: 0 };

// The live calls: short whole sentences as it happens, by name when there's one recorded (calls.txt x names.txt:
// "Valdez gets the run... and makes it stick!"), else one without ([pbp]), and now and then the color commentator
// takes the call himself ([pbpc]: "Oh, buddy! Look at that!"). They come quicker than the booth (a few seconds
// apart, cd: the same moment again, and the same cars not again for 25 s), and only when nobody's talking unless
// force. A moment with no live call, or whose names aren't recorded, goes to the booth as before.
const LIVE = {
  'start.green': { force: true }, 'pass.clean': { cd: 6 }, 'pass.aggressive': { cd: 6 }, 'pass.failed': { cd: 20 },
  'moment.ambitious': { cd: 20 }, 'moment.closecall': { cd: 40 }, 'battle.sidebyside': { cd: 25, pair: 60 }, 'battle.closing': { cd: 30, pair: 150 }, 'battle.pressure': { cd: 40, pair: 150 },
  'incident.spin': { cd: 8 }, 'incident.save': { cd: 15 }, 'incident.offtrack': { cd: 15 }, 'incident.crash': { force: true, cd: 20 },
  'finish.finallap': { half: true }, 'finish.win': { force: true }, 'finish.close': { force: true },
};
// after a live call, sometimes the booth picks it up (the exchange, the chance)
const FOLLOW = { 'pass.aggressive': ['moment.wouldve', 0.3], 'moment.ambitious': ['moment.ambitious', 0.6] };
const LIVE_GAP = 3.5, PIECE_CD = 90;
// the color commentator's one line after a live call ([react]), sometimes (the chance), once the call's done
const REACT = { 'pass.clean': 'pass', 'pass.aggressive': 'bold', 'incident.spin': 'spin', 'incident.save': 'save', 'incident.crash': 'crash',
  'battle.sidebyside': 'sbs', 'moment.ambitious': 'contact', 'battle.pressure': 'pressure', 'battle.closing': 'pressure', 'finish.win': 'win', 'finish.close': 'win' };
const REACT_P = 0.35;
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
    this.pbp = null; this.pbpc = null; this.calls = null; this.react = null; // (main.js: the recorded live calls: no name, the color's, named; his reactions)
    this.heard = null; // (main.js: exchanges heard in earlier races, id -> when: the conversations come round in order of least recently heard)
    this.reactQ = null;
    this.liveT = -99; this.liveSaid = {}; this.later = [];
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
    if (cars.length && !m.anywhere && !o.anywhere && !cars.some(c => c && (c.isPlayer || this.seen(c)))) return; // (nothing on your screen to see)
    // (the race is won: only the finish now)
    if ((this.r.finishOrder || []).length && m.cat !== 'finish' && m.cat !== 'relief') return;
    const score = m.w * Math.max(1, ...cars.map(c => this.rel(c))) * (o.k || 1);
    if (score < m.min) return;
    const old = this.cand.find(c => c.id === id && !!(c.o && c.o.booth) === !!o.booth);
    if (old) { if (score > old.score) Object.assign(old, { score, cars }); return; } // (still happening: the first sighting stands)
    this.cand.push({ id, score, t: this.t, m, cars, o });
  }
  // in the camera's view right now (race.onScreen; a test race without one sees everything)
  seen(c) { return this.r.onScreen ? this.r.onScreen(c) : true; }
  // the exchange to say for a moment: a take that hasn't been used (or the least used), never the last one again, and
  // none heard in the last TAKE_CD seconds (a forced moment takes the least recent if it has to)
  pick(id) {
    const m = M[id], L = this.lines;
    const ids = [id, ...(m.alt || [])].flatMap(b => L ? [...L].filter(k => k === b || (k.startsWith(b + '.') && /^\d+$/.test(k.slice(b.length + 1)))) : [b]);
    if (!ids.length) return null;
    const last = this.recent[this.recent.length - 1];
    let pool = ids.filter(k => k !== last && this.t - (this.takeT[k] ?? -1e9) >= TAKE_CD);
    // (heard in earlier races: the ones heard longest ago, or never, first)
    if (this.heard && pool.length > 1) { const h = (k) => this.heard[k] || 0, min = Math.min(...pool.map(h)); pool = pool.filter(k => h(k) === min); }
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
    // (the race is won: whatever was waiting that isn't about the finish is old news)
    if ((this.r.finishOrder || []).length) this.cand = this.cand.filter(c => c.m.cat === 'finish');
    if (!this.cand.length) return;
    this.cand.sort((a, b) => (b.m.force ? 1e3 : 0) + b.score - ((a.m.force ? 1e3 : 0) + a.score));
    for (const c of this.cand) {
      const m = c.m;
      if (LIVE[c.id] && !c.o.booth && this.pbp) {
        const r = this.live(c);
        if (r === 'said') { this.cand = this.cand.filter(x => x !== c && !(x.m.cat === m.cat && !x.m.force)); return; }
        if (r === 'wait') continue;
        // ('none': its names aren't recorded: the booth's exchange instead)
      }
      if (now - (this.saidT[c.id] ?? -1e9) < m.cd) continue;
      if (m.force && m.cat === 'crash' && now - (this.catT.crash ?? -1e9) < CAT_GAP.crash) continue; // (one wreck call at a time, even cutting in)
      if (c.o.after && this.busy) continue; // (a story that follows a call: once the call's done)
      if (!m.force) {
        if (this.busy) continue;
        const quiet = now - Math.max(this.lastEnd, this.lastSay);
        if (quiet < m.gap + (m.cat === 'incident' ? 0 : Math.min(12, 2.5 * this.chatter()))) continue; // (incidents can't wait for a breather)
        if (now - (this.catT[m.cat] ?? -1e9) < CAT_GAP[m.cat]) continue;
        // (variety: a moment that qualifies still sometimes goes by; never one of yours)
        if (!c.cars.some(x => x && x.isPlayer) && Math.random() > (m.p ?? 1)) { this.saidT[c.id] = now - m.cd * 0.7; continue; }
      }
      const id = this.pick(c.id); if (!id) continue;
      this.say(c.id, id, m, c);
      this.cand = this.cand.filter(x => x.m.cat !== m.cat && !x.m.force); // (said: the rest of its kind is old news)
      break;
    }
  }
  // a live call for a candidate: 'said', 'wait' (not now), 'none' (no call for it: the booth's turn)
  live(c) {
    const L = LIVE[c.id], now = this.t;
    if (L.half && c.o.half == null) c.o.half = Math.random() < 0.5;
    if (c.o.half === false) return 'none';
    const parts = this.build(c); if (!parts) return 'none';
    if (!L.force) {
      if (this.busy || now - this.liveT < LIVE_GAP) return 'wait';
      if (now - (this.liveSaid[c.id] ?? -1e9) < (L.cd || 0)) return 'wait';
      const key = (c.id === 'battle.closing' ? 'battle.pressure' : c.id) + ':' + c.cars.map(x => x && (x.pid || x.name)).join('|'); // (closing in and right on the back: one story)
      if (now - (this.liveSaid[key] ?? -1e9) < (L.pair || 25)) return 'wait'; // (the same cars again: not so soon, and a long battle much later)
      this.liveSaid[key] = now;
    } else if (now - (this.liveSaid[c.id] ?? -1e9) < (L.cd || 0)) return 'wait';
    this.liveT = now; this.liveSaid[c.id] = now; this.lastSay = now; this.busy = true;
    for (const p of parts) this.takeT[p] = now;
    this.r.events.push({ type: 'pbp', parts, force: !!L.force, cap: caption(c.id, c.cars, c.o, this.r) });
    const f = FOLLOW[c.id], fol = f && Math.random() < f[1];
    if (fol) this.later.push({ t: now + 1.5, id: f[0], cars: c.cars, o: { booth: true, anywhere: true } });
    else if (REACT[c.id] && !c.o.story && this.react && Math.random() < REACT_P) this.reactQ = { type: REACT[c.id], until: now + 7 };
    if (c.o.story) this.later.push({ t: now + 0.5, id: c.o.story, cars: c.cars, o: { booth: true, after: true } });
    return 'said';
  }
  // a take of base (base, base.2, ...) from a set, not heard in the last PIECE_CD seconds, else the least recent
  take(base, set = this.pbp) {
    if (!set) return null;
    const ids = [...set].filter(k => k === base || (k.startsWith(base + '.') && /^\d+$/.test(k.slice(base.length + 1))));
    if (!ids.length) return null;
    const fresh = ids.filter(k => this.t - (this.takeT[k] ?? -1e9) >= PIECE_CD * (ids.length === 1 ? 2 : 1));
    if (!fresh.length && ids.length === 1) return null; // (a single take heard lately: leave it be)
    const pool = fresh.length ? fresh : [...ids].sort((a, b) => (this.takeT[a] ?? -1e9) - (this.takeT[b] ?? -1e9)).slice(0, 1);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // a car's name as the recordings know it (names.txt: call.<type>.<name>); you: your commentary name
  slugOf(car) {
    if (!car) return null;
    return slugName(car.isPlayer ? this.r.opts && this.r.opts.commentaryName : String(car.name || '').split(' ').pop()) || null;
  }
  // the named call of a type for a car (a whole sentence with the name in it), if it's recorded
  named(type, car) { const s = this.slugOf(car), id = s && `call.${type}.${s}`; return id && this.calls && this.calls.has(id) ? id : null; }
  // the call for a moment: a whole sentence (named if it can be, else one without a name), now and then the color
  // commentator's burst instead. null: nothing to say live (the booth's turn)
  build(c) {
    const [a] = c.cars, G = (k) => this.take(k, this.pbp), C = (k) => this.take(k, this.pbpc), N = (t) => this.named(t, a);
    const color = (p) => Math.random() < p;
    const one = (id) => id ? [id] : null;
    switch (c.id) {
      case 'start.green': return one(G('pbp.green'));
      case 'pass.clean': case 'pass.aggressive': {
        if (a && a.pos === 1) return one(N('lead') || G('pbp.pass'));
        if (c.id === 'pass.aggressive' && color(0.4)) return one(N('bold') || C('pbpc.bold'));
        return one(color(0.5) && N('pass') || G('pbp.pass') || N('pass'));
      }
      case 'pass.failed': return one(G('pbp.look'));
      case 'moment.ambitious': return one(G('pbp.contact'));
      case 'battle.sidebyside': return one(color(0.3) && C('pbpc.sbs') || G('pbp.sbs'));
      case 'battle.closing': case 'battle.pressure': return one(color(0.3) && C('pbpc.run') || G('pbp.pressure'));
      case 'moment.closecall': return one(C('pbpc.close'));
      case 'incident.spin': return one(N('spin') || G('pbp.spin'));
      case 'incident.save': return one(N('save') || C('pbpc.save'));
      case 'incident.offtrack': return one(G('pbp.offtrack'));
      case 'incident.crash': return one(N('crash') || G('pbp.crash'));
      case 'finish.finallap': return one(G('pbp.finallap'));
      case 'finish.win': case 'finish.close': return one(N('win'));
      default: return null;
    }
  }
  say(moment, id, m, c = {}) {
    this.saidT[moment] = this.t; this.catT[m.cat] = this.t; this.lastSay = this.t;
    this.used[id] = (this.used[id] || 0) + 1; this.takeT[id] = this.t; this.recent.push(id); this.sayT.push(this.t);
    this.busy = true;
    this.r.events.push({ type: 'booth', id, force: !!m.force, cap: caption(moment, c.cars || [], c.o || {}, this.r) });
    if (this.heard) this.heard[id] = Date.now();
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
    if (near.length >= 2 && !this.multiT) { this.multiT = t; this.note('incident.multicar', [car, ...near.map(x => x.car)], { anywhere: near.some(x => x.car.pos <= 3) || car.pos <= 3 }); return; }
    this.note('incident.crash', [car], { anywhere: car.pos <= 3 });
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
    // (racing: not a wreck, not parked, not in the pits; a car going past one of those isn't a pass or a battle)
    const live = order.filter(c => !c.wreck && !c.pitting && !(c.phys && c.phys.speed < 8 && this.t > 10));
    if (!this.once.green && r.state === 'racing') { this.once.green = true; this.note('start.green'); }
    // (his reaction, once the call's finished: a moment after it, while nobody's talking)
    if (this.reactQ) {
      const Q = this.reactQ;
      if (this.t > Q.until) this.reactQ = null;
      else if (!this.busy && this.t - this.liveT > 0.6) {
        this.reactQ = null;
        const id = this.take('react.' + Q.type, this.react);
        if (id) { this.takeT[id] = this.t; this.busy = true; this.lastSay = this.t; this.r.events.push({ type: 'pbp', parts: [id] }); }
      }
    }
    // (booth follow-ups due: they pick up a live call a moment later)
    if (this.later.length) { const due = this.later.filter(x => this.t >= x.t); this.later = this.later.filter(x => this.t < x.t); for (const x of due) this.note(x.id, x.cars, x.o); }
    if (r.state === 'racing') {
      this.start(order);
      this.passes(live);
      this.pairs(live, dt);
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
      // (it has to stick: still ahead a second and a half later, or it was a swap that swapped straight back)
      // (how: in a corner, the inside or the outside of it (the inside is the side it turns towards), late on the
      // brakes going in; off a corner; or flat out down a straight)
      const K = T.K, NN = T.N, ks = (i0, i1) => { let v = 0; if (K) for (let i = i0; i <= i1; i++) v += K[((a.idx + i) % NN + NN) % NN]; return v; };
      const here = ks(-6, 14), before = ks(-40, -8);
      const kind = touched ? 'contact' : Math.abs(here) > 0.02 ? ((a.s - b.s) * Math.sign(here) > 0 ? (Math.random() < 0.4 ? 'brakes' : 'inside') : 'outside')
        : Math.abs(before) > 0.03 ? 'exit' : 'straight';
      (this.pend ||= []).push({ a, b, t: this.t, id: corner || touched ? 'pass.aggressive' : 'pass.clean', kind });
    }
    for (const P of (this.pend || []).filter(P => this.t - P.t >= 1.5)) {
      if (!P.a.gone && !P.b.gone && P.a.progress > P.b.progress && !P.a.pitting && !P.b.pitting) {
        this.note(P.id, [P.a, P.b], { kind: P.kind });
        const ps = this.pair(P.b, P.a); ps.att = 0; ps.close = 0; ps.attempt = null; // (the old pair's story is over)
      }
    }
    if (this.pend) this.pend = this.pend.filter(P => this.t - P.t < 1.5);
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
      if (s.sbs > 1.2) this.note('battle.sidebyside', [a, b]);
      if (s.sbs > 8) this.note('battle.sidebyside', [a, b], { booth: true }); // (still at it: the booth talks about it)
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
      if (s.near > 4 && s.near < 30 && s.sbs === 0 && along > 3) this.note('battle.pressure', [b, a]); // (behind, not alongside)
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
    if (t > 60 && !lead.finished) this.note('quiet.chat'); // (a conversation: it waits for a long silence)
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
    // (the margin: second's time across the line, or if they're not there yet, how far back they are at their speed)
    const run = (r.order || []).find(c => c !== w && !c.gone);
    const n = r.cars.length, margin = second ? second.finishTime - w.finishTime : run ? Math.max(0, (w.progress < 1e8 ? w.progress : w.raw ?? w.progress) - (run.raw ?? run.progress)) / Math.max(15, run.phys.speed) : 99;
    const led = (w.bcLed || 0) / Math.max(1, w.bcSeen || 1);
    // the call (the announcer: who won), then the story of it (the booth: an upset, a runaway, a comeback)
    const story = (w.startPos || 1) >= Math.max(6, Math.ceil(n / 2)) ? 'finish.upset'
      : led > 0.75 && margin > 4 ? 'finish.dominant'
      : (w.bcWorst || 1) >= 5 ? 'finish.reflect' : null;
    const call = margin < 0.3 ? 'finish.close' : 'finish.win';
    if (this.pbp && this.named('win', w)) this.note(call, [w], { story });
    else this.note(story || call, [w]); // (no name to call: the booth's exchange, as before)
  }
}

// ---- the captions (what the graphic says, with the call) ----
let youAre = 'YOU'; // (main.js, through race.opts.commentaryLabel: what the graphic calls you)
const last = (c) => c ? (c.isPlayer && (!c.name || c.name === 'YOU') ? youAre : String(c.name || '').split(' ').pop().toUpperCase()) : '';
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
const P = (c) => c && c.pos ? 'P' + c.pos : '';
// { tag (the block on the left: a position, or a short word), name (the big line), sub (the line under it) }; null: none
export function caption(id, cars, o, race) {
  youAre = (race && race.opts && race.opts.commentaryLabel) || 'YOU';
  const [a, b] = cars, gap = (x, y) => x && y ? Math.abs((x.progress - y.progress) / Math.max(15, (y.phys && y.phys.speed) || 15)).toFixed(1) : null;
  const F = race && race.finishOrder || [];
  switch (id) {
    case 'pass.clean': case 'pass.aggressive': return { tag: P(a), name: last(a), sub: `PASSES ${last(b)} FOR ${ord(a.pos)}` };
    case 'pass.failed': return { tag: P(a), name: last(a), sub: `HAS A LOOK AT ${last(b)}` };
    case 'moment.ambitious': return { tag: P(a), name: last(a), sub: `CONTACT WITH ${last(b)}` };
    case 'battle.sidebyside': return { tag: P(a), name: `${last(a)} · ${last(b)}`, sub: `SIDE BY SIDE FOR ${ord(a.pos)}` };
    case 'battle.defense': case 'battle.stuck': return { tag: P(a), name: last(a), sub: `HOLDING OFF ${last(b)} · ${gap(a, b)}S` };
    case 'battle.closing': return { tag: P(a), name: last(a), sub: `CLOSING ON ${last(b)} · ${gap(b, a)}S` };
    case 'battle.pressure': return { tag: P(a), name: last(a), sub: `ON THE BACK OF ${last(b)} · ${gap(b, a)}S` };
    case 'moment.wouldve': return null;
    case 'moment.closecall': return { tag: P(a), name: `${last(a)} · ${last(b)}`, sub: 'TOO CLOSE FOR COMFORT' };
    case 'moment.surprise': return { tag: P(a), name: last(a), sub: `UP TO ${ord(a.pos)} FROM ${ord(a.startPos || a.pos)} ON THE GRID` };
    case 'incident.spin': return { tag: P(a), name: last(a), sub: 'SPINS' };
    case 'incident.save': return { tag: P(a), name: last(a), sub: 'BIG MOMENT' };
    case 'incident.offtrack': return { tag: P(a), name: last(a), sub: `OFF TRACK · DOWN TO ${ord(a.pos)}` };
    case 'incident.crash': return { tag: '!', name: last(a), sub: 'HEAVY IMPACT', alert: true };
    case 'incident.multicar': return { tag: '!', name: 'MULTI-CAR INCIDENT', sub: cars.slice(0, 3).map(last).join(' · '), alert: true };
    case 'incident.crash.relief': return { tag: '+', name: last(a), sub: 'OUT OF THE CAR' };
    case 'finish.finallap': return { tag: 'LAP', name: 'FINAL LAP', sub: `${last(a)} LEADS` };
    case 'finish.close': case 'finish.win': case 'finish.dominant': case 'finish.upset': case 'finish.reflect': {
      const m = F[1] && F[0] && F[0] === a ? (F[1].finishTime - F[0].finishTime).toFixed(3) : null;
      return { tag: 'P1', name: last(a), sub: id === 'finish.upset' ? `WINS FROM ${ord(a.startPos || 1)} ON THE GRID` : m ? `WINS BY ${m}S` : 'WINS', win: true };
    }
    case 'quiet.gap': return { tag: 'P1', name: last(a), sub: `LEADS BY ${gap(a, (race.order || [])[1])}S` };
    case 'quiet.mirrors': return { tag: P(a), name: last(a), sub: `${last(b)} ${gap(a, b)}S BEHIND` };
    case 'quiet.pitwindow': return { tag: 'PIT', name: 'PIT WINDOW OPEN', sub: '' };
    case 'quiet.rain': return { tag: 'WX', name: 'RAIN ON THE WAY', sub: '' };
    case 'start.chaos': return { tag: 'T1', name: 'THREE WIDE', sub: cars.slice(0, 3).map(last).join(' · ') };
    default: return null;
  }
}
// the nicknames the announcer can call you (assets/voice/names.txt [nicknames]: keep the two the same), for when your
// surname isn't one he has (Options > Commentary Name)
export const NICKNAMES = ['Ace', 'Rookie', 'The Kid', 'Hot Rod', 'Lightning', 'Maverick', 'Showtime', 'Smokey', 'Bulldog', 'Iceman', 'Tex', 'Doc',
  'Flash', 'Rocket', 'Bandit', 'Cowboy', 'Gator', 'Hollywood', 'Junior', 'Lucky', 'Outlaw', 'Pistol', 'Rebel', 'Slick', 'Thunder', 'Tiger', 'Wildcat',
  'Turbo', 'Hurricane', 'The Boss'];
// a name's id in the recordings (tools/voice/gen.mjs uses the same): "O'Brien" -> obrien, "Hot Rod" -> hotrod
export const slugName = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
