// dev: a repeatable AI race. Every random thing (the field's cars, pace, reactions, aggression, mistakes) comes from one
// seed, so the same seed is the same race, and a change can be compared race for race instead of against the noise
// (single races differ by 0-7 wrecks on identical code). Everyone on the AI (you too, from the back).
//   node .devtest/aiseed.mjs [car] [seed] [laps]      EXTRA='{"opt":v}' race options ({"__opp":1}: one AI car alone), DIFF=alien
//   LOG=1: each contact, wall hit and wreck, with who was doing what
// → contacts (first 25 s / rest), wall hits, wrecks, slides, winner's time, pack (the field's median race lap vs a clean lap of your car with the level's edge, %), you (your autopilot car's place at the end: it drives with the AI's aids but none of the level's edge, so it stands in for a player about as quick as Legend; from the back), swaps (places changing hands between AI cars from lap 2 on), traffic loss (the field's median % slower
//   from lap 2 on than each car alone on a clear track, laps under a safety car / VSC left out; needs 3+ laps), and each corner's average time on lap 1
//   and later laps against the quickest anyone went through it (the CORNERS env: which corners, default the first four)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', seed = +(process.argv[3] || 1), laps = +(process.argv[4] || 2);
const SEEDRNG = `(() => { let a = ${seed} * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()`;
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, laps, diff, extra, SEEDRNG]) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.damage = 'high'; S.rules = 'arcade'; S.difficulty = diff; S.grid = 'back';
    (0, eval)(SEEDRNG);
    window.__svgp.startRace(t, { mode: 'race', laps, opponents: +(extra.__opp ?? 11), aiChassis: 'class', car: S.car, extra }, 'menu');
  }, [id, laps, process.env.DIFF || 'alien', JSON.parse(process.env.EXTRA || '{}'), SEEDRNG]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 0 && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const r = await pg.evaluate(([SEEDRNG, nC, LOGON]) => {
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false; window.__svgp.sim = null;
    // (the race was built while the page was busy elsewhere: re-roll each driver from the seed now, as addCar does)
    (0, eval)(SEEDRNG);
    for (const c of sim.cars) if (c.ai) { c.ai.pace = sim.diff.pace * (1 - Math.random() * sim.diff.spread); c.ai.bias = (Math.random() - 0.5) * 1.2; c.ai.react = 0.06 + Math.random() * 0.14; delete c.ai.aggr; delete c.ai.craft; }
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    const T = sim.T, L = T.L, C = sim.corners.list.slice(0, nC);
    const st = { start: 0, contacts: 0, walls: 0, slides: 0, offT: 0, offMax: 0 };
    const LOG = [], W = (c) => `${c.isPlayer ? 'YOU' : c.name}(${(c.phys.u * 3.6).toFixed(0)}kph s${c.s.toFixed(1)}${c.ai?.pass ? ' P:' + c.ai.pass.stage + (c.ai.pass.own ? '!' : '') : ''}${c.ai?.dMove ? ' DEF' : ''}${c.ai?.err ? ' ERR:' + c.ai.err.type : ''}${(c.ctl?.brake || 0) > 0.1 ? ' brk' : ''}${Math.abs(c.phys.beta) > 0.1 ? ' β' + (c.phys.beta * 57.3).toFixed(0) : ''}${c.rc?.hold > 0 ? ' held' : ''})`;
    const fc = sim.rc.contact.bind(sim.rc); sim.rc.contact = (a, b2, ia, ib, v) => { if (sim.raceTime < 25) st.start++; else st.contacts++; if (LOGON && LOG.length < 80) { const [r, fr] = a.progress < b2.progress ? [a, b2] : [b2, a]; LOG.push(`t${sim.raceTime.toFixed(1)} @${(r.idx * T.ds).toFixed(0)}m L${r.lap} K${(T.K[r.idx] * 1000).toFixed(1)} v${v.toFixed(0)} behind ${W(r)} -> ahead ${W(fr)} gap${(fr.progress - r.progress).toFixed(1)}`); } return fc(a, b2, ia, ib, v); };
    const fb = sim.breakCheck.bind(sim); sim.breakCheck = (car, v, part, lx, ly, lim) => { if (v > 10 && lim >= 25 && !(sim.raceTime - (car._wT ?? -9) < 1)) { car._wT = sim.raceTime; st.walls++; if (LOGON && LOG.length < 80) LOG.push(`t${sim.raceTime.toFixed(1)} @${(car.idx * T.ds).toFixed(0)}m WALL ${W(car)} hit${v.toFixed(0)}`); } return fb(car, v, part, lx, ly, lim); };
    // corner times: from 60 m before its entry to 40 m past its exit (distance along the lap)
    const zone = C.map(c => ({ a: (c.entry * T.ds - 60 + L) % L, b: (c.exit * T.ds + 40) % L, t1: [], t2: [] }));
    const mem = new Map(sim.cars.map(c => [c, { sl: false, at: {} }]));
    let f = 0, win = 0; const BT = { n: 0, s1: 0, s05: 0, along: 0, att: 0, al: {}, sw: {}, repass: 0 }; sim.passLog = [];
    let swaps = 0, ord = null; // (places changing hands between AI cars, lap 2 on: overtakes, near enough)
    // each AI car's lap times (lap 2 on: the start's shuffle left out), for the traffic loss below
    const lapAt = new Map(sim.cars.map(c => [c, { lap: c.lap, t: 0, laps: [] }]));
    const along = (c) => ((c.idx * T.ds) % L);
    const lone = sim.cars.length === 2; if (lone) sim.removeCar(sim.player);
    while ((sim.state === 'racing' || lone && f < 60 * 60 * 8 && !sim.cars.find(c => !c.isPlayer).finished) && f < 60 * 60 * 8) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); f++;
      if (!win && sim.cars.some(c => c.finished)) win = sim.raceTime;
      if (f % 30 === 0) { const ais = sim.cars.filter(c => c.ai && !c.isPlayer && !c.gone && !c.wreck && !c.finished && !c.pitting && c.lap >= 2).sort((x, y) => y.progress - x.progress).map(c => c.name);
        if (ord) { const was = new Map(ord.map((n, k) => [n, k])); for (let k = 0; k < ais.length; k++) for (let m = k + 1; m < ais.length; m++) if (was.has(ais[k]) && was.has(ais[m]) && was.get(ais[k]) > was.get(ais[m])) swaps++; }
        // battles (lap 2 on): each AI car against the one just ahead: within 1 s / 0.5 s, alongside, pulling alongside
        const live = sim.cars.filter(c => c.ai && !c.isPlayer && !c.gone && !c.wreck && !c.finished && !c.pitting && c.lap >= 2).sort((x, y) => y.progress - x.progress);
        for (let k = 1; k < live.length; k++) { const a = live[k], o = live[k - 1], gm = o.progress - a.progress, gs = gm / Math.max(10, a.phys.u), now = gm < 4.5 && Math.abs(o.s - a.s) > 1.6;
          BT.n++; if (gs < 1) BT.s1++; if (gs < 0.5) BT.s05++; if (gm < 6 && Math.abs(o.s - a.s) > 1.6) BT.along++; if (now && !BT.al[a.name]) BT.att++; BT.al[a.name] = now; }
        // a place lost and taken back between the same two cars within 10 s
        if (ord) { const was = new Map(ord.map((n, k) => [n, k])); for (let k = 0; k < ais.length; k++) for (let m = k + 1; m < ais.length; m++) if (was.has(ais[k]) && was.has(ais[m]) && was.get(ais[k]) > was.get(ais[m])) { const key = [ais[k], ais[m]].sort().join('|'), last = BT.sw[key]; if (last && last.w === ais[m] && sim.raceTime - last.t < 10) BT.repass++; BT.sw[key] = { w: ais[k], t: sim.raceTime }; } }
        ord = ais; }
      // (a lap with a safety car or VSC out in any of it isn't racing pace: left out)
      const sc = sim.rc && sim.rc.vscOn();
      for (const c of sim.cars) { const m = lapAt.get(c); if (sc) m.sc = true; if (c.lap !== m.lap) { if (m.lap >= 2 && !m.sc) m.laps.push(sim.raceTime - m.t); m.lap = c.lap; m.t = sim.raceTime; m.sc = sc; } }
      if (LOGON) for (const c of sim.cars) if (c.wreck && !c._wl) { c._wl = 1; LOG.push(`t${sim.raceTime.toFixed(1)} @${(c.idx * T.ds).toFixed(0)}m WRECK ${c.name} ${c.wreck.kind}`); }
      for (const c of sim.cars) {
        if (c.gone || c.finished || c.isPlayer) continue; // (you're on the autopilot, without the AI's level boosts: not counted)
        const m = mem.get(c), d = along(c);
        const sl = Math.abs(c.phys.beta) > 0.14 && c.phys.speed > 15; if (sl && !m.sl) st.slides++; m.sl = sl;
        // off the track (all four wheels past the edge: the sidewalk, the grass), lap 1 on: total seconds, longest stint
        if (c.lap >= 1 && !c.pitting && !c.wreck && Math.abs(c.s) > T.W[c.idx] / 2 + 0.95) { if (!m.off) m.offAt = `@${(c.idx * T.ds).toFixed(0)}m s${c.s.toFixed(1)} W/2 ${(T.W[c.idx] / 2).toFixed(1)} line${sim.line[c.idx].toFixed(1)} ${W(c)}`; m.off = (m.off || 0) + 1 / 60; st.offT += 1 / 60; st.offMax = Math.max(st.offMax, m.off); } else { if (LOGON && m.off > 2.5 && LOG.length < 80) LOG.push(`t${sim.raceTime.toFixed(1)} OFF ${m.off.toFixed(1)}s from ${m.offAt} -> back @${(c.idx * T.ds).toFixed(0)}m`); m.off = 0; }
        zone.forEach((z, k) => {
          const inZ = z.a < z.b ? d >= z.a && d < z.b : d >= z.a || d < z.b;
          if (inZ && m.at[k] == null && c.lap >= 1) m.at[k] = { t: sim.raceTime, lap: c.lap };
          if (!inZ && m.at[k] != null) { const s = m.at[k]; m.at[k] = null; const dt = sim.raceTime - s.t; if (dt < 30) (s.lap === 1 ? z.t1 : z.t2).push(dt); }
        });
      }
    }
    const best = zone.map(z => Math.min(...z.t1, ...z.t2));
    // traffic loss: how much slower each AI car lapped in the race (lap 2 on, its median) than the same car alone on a
    // clear track at the same level (one clean hidden lap); the field's median, % (0 = everyone raced at their own pace)
    const clean = {}, med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? (b[(b.length - 1) >> 1] + b[b.length >> 1]) / 2 : NaN; };
    // pack: the field's median race lap (lap 2 on) against one clean lap of YOUR car with the level's edge (a Phantom AI in
    // your car), %: how hard the race is for you (+ = the pack's slower than that)
    const tYou = sim.balance?.__t ?? sim.simLap(sim.mainCarId(), { pace: 1, power: sim.diff.power, grip: sim.diff.grip, tyre: 'soft' });
    const packs = sim.cars.filter(c => c.ai && !c.isPlayer && !c.wreck && lapAt.get(c).laps.length).map(c => (med(lapAt.get(c).laps) / tYou - 1) * 100);
    const losses = sim.cars.filter(c => c.ai && !c.isPlayer && !c.wreck && lapAt.get(c).laps.length).map(c => {
      clean[c.carId] ??= sim.simLap(c.carId, { pace: 1, power: sim.diff.power, grip: sim.diff.grip, tyre: 'soft' });
      return (med(lapAt.get(c).laps) / clean[c.carId] - 1) * 100;
    });
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
    return { bal: sim.balance ? Object.entries(sim.balance).filter(e => e[0] !== '__t').map(([k, v]) => `${k} g${v.grip} p${v.power}`).join(', ') : null, log: LOGON ? LOG : null, t: Math.round(f / 60), win: +win.toFixed(1), ...st, wrecks: sim.cars.filter(c => c.wreck).length, you: (() => { const pl = sim.cars.find(c => c.isPlayer); if (!pl) return null; const ord = sim.cars.filter(c => !c.gone).sort((x, y) => (y.finished - x.finished) || (x.finished ? x.finishTime - y.finishTime : y.progress - x.progress)); return ord.indexOf(pl) + 1; })(), plog: sim.passLog.slice(0, 150).map(e => `${e.t} ${e.a}->${e.b} ${e.kind} ${e.ev} g${e.g} dv${e.dv}`) , offS: +st.offT.toFixed(1), offLong: +st.offMax.toFixed(1), battle1s: +(BT.s1 / BT.n * 100).toFixed(0), battle05: +(BT.s05 / BT.n * 100).toFixed(0), alongPct: +(BT.along / BT.n * 100).toFixed(1), alongside: BT.att, repass: BT.repass,
      plan: (() => { const L = sim.passLog.filter(e => e.lap >= 2), n = (f) => L.filter(f).length; const kinds = {}; for (const e of L) if (e.ev === 'done') kinds[e.kind] = (kinds[e.kind] || 0) + 1; return { tries: n(e => e.ev === 'try'), own: n(e => e.ev === 'own'), yield: n(e => e.ev === 'yield' || e.ev === 'shut'), lunge: n(e => e.ev === 'lunge'), backout: n(e => e.ev === 'backout'), done: kinds }; })(), pack: +med(packs).toFixed(1), packBest: +Math.min(...packs).toFixed(1), loss: +med(losses).toFixed(1), swaps, lossMax: +Math.max(...losses).toFixed(1),
      shape: C.map((c, k) => `T${k + 1} ${c.dir > 0 ? 'L' : 'R'} ${(c.entry * T.ds).toFixed(0)}-${(c.exit * T.ds).toFixed(0)}m`).join(' '), corners: zone.map((z, k) => `T${k + 1} best ${best[k].toFixed(2)} L1 +${(avg(z.t1) - best[k]).toFixed(2)} later +${(avg(z.t2) - best[k]).toFixed(2)}`).join(' | ') };
  }, [SEEDRNG, +(process.env.CORNERS || 4), !!process.env.LOG]);
  if (r.log) { console.log(r.log.join('\n')); delete r.log; }
  if (r.plog && process.env.PLOG) console.log(r.plog.join('\n')); delete r.plog;
  console.log(`${id} seed ${seed} ${process.env.EXTRA || ''} ${JSON.stringify(r)}`);
} finally { await b.close(); server.kill(); }
