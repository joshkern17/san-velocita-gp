// dev: an endurance race with a co-driver, like a player: you (the AI in your car) box when the tires are done, the
// engineer's swap call is answered, your co-driver drives a stint (watched at 4x), you skip their next one, and both
// of you make the minimum drive time. Checks the swaps, who drove, the driver-change time, the result.
//   node .devtest/crewrace.mjs [seconds=600] [clockK=36] [track preset=Maple Ridge GP]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const secs = +(process.argv[2] || 600), K = +(process.argv[3] || 36), NAME = process.argv[4] || 'Maple Ridge GP';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([secs, K, NAME]) => {
    const t = (await import('/js/track.js')).presetTracks().find(t => t.name === NAME); t.env.weather = 'clear';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 7, car: window.__svgp.settings.car, extra: { duration: secs, clockK: K, startHour: 12, strategy: false, codriver: { name: 'Ana Silva', paceK: 0.96, aggr: 0.4 } } }, 'menu');
  }, [secs, K, NAME]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 2 && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const r = await pg.evaluate(() => {
    const sim = window.__svgp.sim, pl = sim.player, c = sim.crew, T = sim.T, N = T.N;
    sim.state = 'racing'; sim.stateT = 0; sim.goAt = 0; pl.autoT = 1e9;
    const log = [], calls = [], stops = []; let cStints = 0, watched = false, skipped = false, aiOk = true, stopT0 = 0;
    for (let f = 0; f < 60 * 1400 && !(sim.state === 'finished' && sim.cars.every(x => x.finished || x.gone)); f++) {
      // (you: box when the tires are done, as a player would, driving into the lane)
      if (c.cur === 'P' && !pl.pitting && !pl.finished && sim.pit && (pl.stintCall || Math.min(pl.phys.tyre.wf, pl.phys.tyre.wr) < 0.4)) {
        const toEntry = ((sim.pit.start - pl.idx + N) % N) * T.ds;
        if (toEntry < 250 && toEntry > 200) { pl.pitting = true; pl.pitPhase = 'in'; pl.pitReq = { tyre: 'medium', repair: false }; sim.events.push({ type: 'pitIn' }); sim.crewStop(pl); }
      }
      if (sim.call && sim.call.kind === 'crew' && !sim.call.seen) { sim.call.seen = true; calls.push(`${c.cur}:${sim.call.msg.replace(/<[^>]+>/g, '')}`); sim.answerCall('a'); }
      if (pl.pitPhase === 'stop' && !stopT0) stopT0 = pl.pitTotal; if (pl.pitPhase !== 'stop' && stopT0) { stops.push(+stopT0.toFixed(1)); stopT0 = 0; }
      // (their first stint: watched at 4x; the next: skipped)
      const reps = sim.skipping ? 15 : sim.ff;
      // (out of the box it's yours to drive: here the crew's own driving stands in for yours)
      for (let k = 0; k < reps; k++) { const dt = sim.skipping ? 1 / 30 : 1 / 60; sim.update(dt, c.cur === 'P' && pl.pitting && pl.pitPhase === 'out' ? sim.pitControls(pl, dt) : { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); }
      if (c.cur === 'C' && pl.ai !== c.ai && sim.state === 'racing' && !pl.finished && !pl.pitting) aiOk = false;
      for (const e of sim.events.splice(0)) if (e.type === 'crew') { log.push(`${e.who}@${(sim.raceTime / 60).toFixed(1)}m`); if (e.who === 'C') { cStints++; if (cStints === 1 && sim.call && sim.call.kind === 'crewDrive') { sim.answerCall('a'); watched = sim.ff === 4; } else if (sim.call && sim.call.kind === 'crewDrive') { sim.answerCall('b'); skipped = sim.skipping; } } }
      if (sim.state === 'finished' && pl.finished && sim.skipping) sim.skipping = false;
    }
    const res = sim.results().find(x => x.isPlayer);
    const lt = sim.cars.flatMap(x => x.lapTimes.slice(1)).sort((a, b) => a - b);
    return { clock: sim.timed.dur + ' s race, ' + sim.raceTime.toFixed(0) + ' s run · lap estimate ' + sim.timed.lapEst.toFixed(1) + ' s, real median ' + lt[lt.length >> 1].toFixed(1) + ' s · stints ' + sim.timed.stints, log, calls, stops, cStints, watched, skipped, aiOk, t: c.t, min: c.min * sim.timed.dur, dur: sim.timed.dur, res: { pos: res.pos, dsq: res.dsq, laps: res.lap - 1, pits: res.pits, gap: res.gap }, field: sim.results().slice(0, 3).map(x => x.name + ' ' + (x.lap - 1)) };
  });
  console.log(r.clock);
  console.log('swaps:', r.log.join(' '), '| calls:', r.calls.join(' / '));
  console.log('your stops (s):', r.stops.join(' '), '| drove: you', (r.t.P / 60).toFixed(1), 'min, co-driver', (r.t.C / 60).toFixed(1), 'min (minimum', (r.min / 60).toFixed(1), ')');
  console.log('result:', JSON.stringify(r.res), '| top 3', r.field.join(', '));
  ok(r.cStints >= 2, `your co-driver drove ${r.cStints} stints`);
  ok(r.log.filter(x => x.startsWith('P')).length >= 1, 'and handed back to you');
  ok(r.calls.length >= 1, `the engineer asked about the swap (${r.calls.length} calls)`);
  ok(r.aiOk, 'the co-driver (the AI, at their pace) drove your car during their stints');
  ok(r.watched, 'their stint could be watched at 4x');
  ok(r.skipped, 'and the next one skipped to your stint');
  ok(r.t.P >= r.min * 0.97 && r.t.C >= r.min * 0.97, 'both made the minimum drive time');
  ok(!r.res.dsq && r.res.pits >= 2, `classified (P${r.res.pos}, ${r.res.pits} stops)`);
  ok(r.stops.some(x => x > 9), `a driver change adds ~5 s to the stop (${r.stops.join(', ')} s)`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
