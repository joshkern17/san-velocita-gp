// dev: the booth's director (js/broadcast.js) on scripted race situations, no browser: what it says, what it lets go,
// and how it paces itself. node .devtest/broadcast.mjs
import { Broadcast } from '../js/broadcast.js';
// (the same dice every run)
let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

let fails = 0;
const expect = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) fails++; };
const LINES = new Set(['start.green', 'start.green.2', 'pass.clean', 'pass.aggressive', 'moment.wouldve', 'pass.failed', 'battle.sidebyside',
  'incident.spin', 'incident.save', 'incident.crash', 'incident.crash.relief', 'incident.multicar', 'finish.close', 'finish.win', 'finish.upset',
  'finish.dominant', 'finish.reflect', 'finish.finallap', 'quiet.early', 'battle.stuck', 'battle.defense', 'moment.closecall', 'quiet.gap']);

// a straight track, cars with a progress (m along the race), a lateral s, a speed and a slip angle
function race(n = 8, playerAt = 4) {
  const T = { N: 1000, ds: 5, L: 5000, K: new Float32Array(1000) };
  const cars = Array.from({ length: n }, (_, k) => ({ pid: 'c' + k, name: 'X. C' + k, isPlayer: k === playerAt - 1, startPos: k + 1, lap: 1, s: 0, idx: 0,
    progress: 1000 - k * 40, onRoad: true, phys: { speed: 50, beta: 0, tyre: { wf: 1, wr: 1 } } }));
  const r = { mode: 'race', state: 'racing', raceTime: 0, T, cars, laps: 5, events: [], finishOrder: [], teamMate: () => null };
  r.player = cars[playerAt - 1];
  r.sort = () => { r.order = [...cars].sort((a, b) => b.progress - a.progress); r.order.forEach((c, k) => c.pos = k + 1); };
  r.sort();
  const bc = new Broadcast(r); bc.lines = LINES;
  // a frame: the cars move, positions update, the director looks; whatever it says "plays" for talkS seconds
  r.step = (dt = 1 / 30, talkS = 8) => {
    r.raceTime += dt;
    for (const c of cars) { c.progress += c.phys.speed * dt; c.idx = Math.floor((c.progress / T.ds) % T.N); }
    r.sort();
    bc.busy = r.talkUntil != null && r.raceTime < r.talkUntil;
    bc.update(dt);
    for (const e of r.events) { r.said.push({ id: e.type === 'pbp' ? 'LIVE ' + e.parts.join(' ') : e.id, parts: e.parts, t: r.raceTime, force: e.force, cap: e.cap }); r.talkUntil = r.raceTime + (e.type === 'pbp' ? 2.5 : talkS); } // (a live call is a couple of seconds)
    r.events.length = 0;
  };
  r.said = []; r.bc = bc;
  return r;
}
const run = (r, sec, f) => { for (let t = 0; t < sec; t += 1 / 30) { f && f(r); r.step(); } };

// 1. the green flag, straight away
{ const r = race(); run(r, 1); expect(r.said[0] && r.said[0].id.startsWith('start.green'), 'the green flag is called at the start', r.said.map(s => s.id).join(',')); }

// 2. you pass someone: said. A backmarker passing another far from you: let go.
{
  const r = race(12, 4); run(r, 20);
  const n0 = r.said.length;
  r.cars[2].progress = r.player.progress - 1; r.player.progress += 2; run(r, 3); // (the player gets by the car ahead, and stays there)
  expect(r.said.slice(n0).some(s => s.id.startsWith('pass.')), 'your pass gets on air', r.said.slice(n0).map(s => s.id).join(','));
  const cap = r.said.slice(n0).find(s => s.id.startsWith('pass.'))?.cap;
  expect(cap && cap.name === 'C3' && /PASSES C2 FOR 3RD/.test(cap.sub), 'with its caption: who passed whom, for what', JSON.stringify(cap));
  run(r, 40);
  const n1 = r.said.length;
  r.cars[10].progress = r.cars[9].progress + 2; run(r, 1);
  expect(r.said.length === n1, 'a pass at the back, far from you, goes unsaid');
}

// 2b. two cars you can't see (off the camera): their battle goes unsaid; the same on screen gets on air
{
  const r = race(8, 6); run(r, 40);
  r.onScreen = (c) => c.isPlayer || c.pos >= 5;
  const a = r.cars[0], b = r.cars[1], n0 = r.said.length;
  run(r, 15, () => { b.progress = a.progress - 1.5; a.s = -1.5; b.s = 1.6; });
  expect(!r.said.slice(n0).some(s => s.id === 'battle.sidebyside'), 'side by side for the lead, off your screen: not called');
  r.onScreen = () => true; const n1 = r.said.length;
  run(r, 15, () => { b.progress = a.progress - 1.5; a.s = -1.5; b.s = 1.6; });
  expect(r.said.slice(n1).some(s => s.id === 'battle.sidebyside'), 'the same battle in view: called');
}

// 3. pacing: the player passing and being passed every few seconds for four minutes
{
  const r = race(10, 3); run(r, 15);
  let flip = 0;
  run(r, 240, (r) => { if (Math.round(r.raceTime * 30) % 120 === 0) { const a = r.player, b = r.cars[flip++ % 2 ? 1 : 3]; const p = a.progress; a.progress = b.progress; b.progress = p; } });
  const passes = r.said.filter(s => s.t > 15 && (s.id.startsWith('pass.') || s.id === 'moment.wouldve'));
  const gaps = passes.slice(1).map((s, i) => s.t - passes[i].t);
  expect(passes.length >= 1 && passes.length <= 8, `passes every 4 s for 4 minutes: some said, most not (${passes.length} said)`);
  expect(gaps.every(g => g >= 20), 'never two passes back to back', gaps.map(g => g.toFixed(0)).join(' '));
  expect(passes.slice(1).every((s, i) => s.id !== passes[i].id), 'never the same exchange twice in a row', passes.map(s => s.id).join(','));
}

// 4. a spin: sideways, then going again
{
  const r = race(8, 2); run(r, 30);
  const c = r.player, n0 = r.said.length;
  run(r, 1.5, () => { c.phys.beta = 2.2; c.phys.speed = 12; });
  run(r, 8, () => { c.phys.beta = 0.05; c.phys.speed = 18; }); // (then a moment for the booth to get to it)
  expect(r.said.slice(n0).some(s => s.id === 'incident.spin'), 'your spin is called', r.said.slice(n0).map(s => s.id).join(','));
}

// 5. a big crash while they're talking: it goes now; later, the relief
{
  const r = race(8, 2); run(r, 30);
  r.talkUntil = r.raceTime + 30; // (mid-exchange)
  const c = r.cars[0]; r.bc.hit(c, 35); c.phys.speed = 0; c.wreck = true;
  run(r, 0.5);
  expect(r.said.some(s => s.id === 'incident.crash' && s.force), 'a big crash cuts in');
  r.talkUntil = null; run(r, 20);
  expect(r.said.some(s => s.id === 'incident.crash.relief'), 'and later: the driver is out of the car');
}

// 6. the finish: a photo finish, an underdog, a runaway win
const finish = (setup) => { const r = race(10, 3); run(r, 60); setup(r); r.state = 'finished'; run(r, 1.5); return r.said.filter(s => s.id.startsWith('finish.')).map(s => s.id); };
expect(finish(r => { const [a, b] = r.cars; a.finishTime = 300; b.finishTime = 300.12; r.finishOrder.push(a, b); })[0] === 'finish.close', 'two across the line together: the close finish');
expect(finish(r => { const w = r.cars[8]; w.startPos = 9; w.finishTime = 300; r.finishOrder.push(w, r.cars[0]); r.cars[0].finishTime = 302; })[0] === 'finish.upset', 'won from ninth on the grid: the upset');
expect(finish(r => { const w = r.cars[0]; w.bcLed = 100; w.bcSeen = 110; w.finishTime = 300; r.cars[1].finishTime = 309; r.finishOrder.push(w, r.cars[1]); })[0] === 'finish.dominant', 'led nearly all of it, 9 s clear: dominant');

// 7. side by side for a few seconds, you and the car ahead
{
  const r = race(8, 2); run(r, 30);
  const a = r.cars[0], b = r.player, n0 = r.said.length;
  run(r, 15, () => { b.progress = a.progress - 1.5; a.s = -1.5; b.s = 1.6; });
  expect(r.said.slice(n0).some(s => s.id === 'battle.sidebyside'), 'side by side down the straight', r.said.slice(n0).map(s => s.id).join(','));
}

// 8. a quiet race: they don't fill every second
{
  const r = race(8, 4); run(r, 300);
  expect(r.said.length <= 6, `five uneventful minutes: a few words, not a stream (${r.said.length}: ${r.said.map(s => s.id).join(',')})`);
}

// 9. live calls: whole sentences, by name when there's one recorded
const PBP = new Set(['pbp.green', ...Array.from({ length: 11 }, (_, k) => 'pbp.green.' + (k + 2)), 'pbp.pass', 'pbp.pass.2', 'pbp.pass.3', 'pbp.sbs', 'pbp.sbs.2',
  'pbp.pressure', 'pbp.look', 'pbp.contact', 'pbp.spin', 'pbp.offtrack', 'pbp.crash', 'pbp.finallap']);
const PBPC = new Set(['pbpc.bold', 'pbpc.run', 'pbpc.sbs', 'pbpc.save', 'pbpc.close']);
const TYPES = ['pass', 'lead', 'spin', 'crash', 'win', 'bold', 'save'];
const live = (n = 8, at = 2, named = (k) => true) => { const r = race(n, at); r.bc.pbp = PBP; r.bc.pbpc = PBPC;
  r.bc.calls = new Set(r.cars.flatMap((c, k) => named(k) ? TYPES.map(t => `call.${t}.c${k}`) : [])); r.opts = { commentaryName: 'c' + (at - 1) }; return r; };
{
  const r = live(); run(r, 1);
  expect(/^LIVE pbp\.green/.test(r.said[0]?.id), 'the start: the green flag called live', r.said[0]?.id);
  const greens = new Set(); for (let k = 0; k < 12; k++) { const q = live(); run(q, 1); greens.add(q.said[0]?.parts?.[0]); }
  expect(greens.size >= 6, `the green-flag call varies race to race (${greens.size} different in 12 races)`);
}
{
  // your passes, many times over: by name some of the time, a call without it other times, never two the same in a row
  const got = [];
  for (let k = 0; k < 10; k++) {
    const r = live(12, 4); run(r, 20);
    const n0 = r.said.length; r.cars[2].progress = r.player.progress - 1; r.player.progress += 2; run(r, 3);
    const call = r.said.slice(n0).find(s => s.parts); if (call) got.push(call.parts[0]);
  }
  expect(got.length === 10 && got.some(x => x === 'call.pass.c3') && got.some(x => x.startsWith('pbp.pass')), 'your pass, live: sometimes by your name, sometimes not', got.join(' '));
}
{
  const r = live(8, 3); run(r, 20); // (a pass for the lead: the named lead call)
  const n0 = r.said.length; r.cars[0].progress = r.cars[1].progress; r.cars[1].progress += 3; run(r, 3);
  expect(r.said.slice(n0).some(s => s.parts && s.parts[0] === 'call.lead.c1'), 'a pass for the lead: "<name> takes the lead!"', r.said.slice(n0).map(s => s.id).join(' / '));
}
{
  const r = live(8, 2, (k) => k !== 1); r.opts = {}; run(r, 30); // (your name isn't recorded: the call without one)
  const c = r.player, n0 = r.said.length;
  run(r, 1.5, () => { c.phys.beta = 2.2; c.phys.speed = 12; }); run(r, 8, () => { c.phys.beta = 0.05; c.phys.speed = 18; });
  expect(r.said.slice(n0).some(s => s.parts && s.parts[0] === 'pbp.spin'), 'no name for you: "Spin! Around it goes!"', r.said.slice(n0).map(s => s.id).join(' / '));
}
{
  // the color commentator takes some calls: over many side-by-sides, both voices
  const who = new Set();
  for (let k = 0; k < 12; k++) {
    const r = live(8, 2); run(r, 30); const a = r.cars[0], b = r.player, n0 = r.said.length;
    run(r, 6, () => { b.progress = a.progress - 1.5; a.s = -1.5; b.s = 1.6; });
    const call = r.said.slice(n0).find(s => s.parts); if (call) who.add(call.parts[0].split('.')[0]);
  }
  expect(who.has('pbp') && who.has('pbpc'), 'side by side: the announcer calls it, and sometimes the color commentator does', [...who].join(','));
}
{
  const r = live(10, 3); run(r, 15); let flip = 0;
  run(r, 120, (r) => { if (Math.round(r.raceTime * 30) % 60 === 0) { const a = r.player, b = r.cars[flip++ % 2 ? 1 : 3]; const p = a.progress; a.progress = b.progress; b.progress = p; } });
  const lv = r.said.filter(s => s.parts && s.t > 15), gaps = lv.slice(1).map((s, i) => s.t - lv[i].t);
  expect(lv.length >= 3 && gaps.every(g => g >= 3.4), `live calls come quicker than the booth but never on top of each other (${lv.length} in 2 min)`, gaps.map(g => g.toFixed(1)).join(' '));
  expect(lv.slice(1).every((s, i) => s.parts[0] !== lv[i].parts[0]), 'never the same call twice in a row', lv.map(s => s.parts[0]).join(' '));
}

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
