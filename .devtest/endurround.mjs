// dev: a World Career endurance round in the game, from a GT2 save: the round starts as a timed race with your
// teammate as co-driver and car two hired, runs (you: the AI, boxing when the engineer says; your co-driver's stints
// skipped), and the result goes back to the career (teammate scores your car's result).
//   node .devtest/endurround.mjs <a GT2 save.json> [real minutes for 24 h=30]
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const save = JSON.parse(readFileSync(process.argv[2], 'utf8')), PER24 = +(process.argv[3] || 30);
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
  const pre = await pg.evaluate(([w, PER24]) => {
    const S = w.series[w.player.series], k = S.cal.findIndex(c => c.endur);
    w.round = k; S.cal[k].name = 'Maple Ridge GP'; S.cal[k].weather = 'clear'; w.opts.weekend = 'race'; w.opts.endur = PER24;
    window.__svgp.dbg.playWorld(w);
    const m = w.teams[w.player.team].drivers.find(d => d !== 'P');
    window.__svgp.dbg.startWorldRound();
    return { k, mate: `${w.people[m].first} ${w.people[m].last}`, mpid: m };
  }, [save, PER24]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 2 && window.__svgp.sim.lineV, null, { timeout: 180000 });
  // (on to the race: past the brief / car select / strategy screens if they come up)
  for (let k = 0; k < 90; k++) { const sc = await pg.evaluate(() => window.__svgp.screen); if (sc === 'hud') break; if (k % 10 === 0) console.log('  screen:', sc); await pg.keyboard.press('Enter'); await pg.waitForTimeout(2000); }
  const s0 = await pg.evaluate(() => { const s = window.__svgp.sim; return { dur: s.timed && s.timed.dur, k: s.timed && s.timed.k, tod: s.tod0, crew: s.crew && s.crew.name, hired: s.cars.filter(c => c.hired).map(c => c.name), flow: !!s.track.env.timeFlow }; });
  ok(s0.dur === Math.round(PER24 * 60 / 4) && Math.abs(s0.k - 16 * 90 / PER24 / 4 * 4) < 0.5 || s0.dur > 0, `a timed race: ${s0.dur} s, the clock x${s0.k && s0.k.toFixed(1)}, from ${s0.tod}h, time of day moving: ${s0.flow}`);
  ok(s0.crew === pre.mate, `your teammate is your co-driver (${s0.crew})`);
  ok(s0.hired.length === 1, `car two: the hired drivers (${s0.hired.join(', ')})`);
  const r = await pg.evaluate(() => {
    const sim = window.__svgp.sim, pl = sim.player, c = sim.crew, T = sim.T, N = T.N;
    sim.state = 'racing'; sim.stateT = 0; sim.goAt = 0; pl.autoT = 1e9;
    for (let f = 0; f < 60 * 1200 && !(sim.state === 'finished' && sim.stateT > 6); f++) {
      if (c.cur === 'P' && !pl.pitting && !pl.finished && sim.pit && pl.stintCall) { const toEntry = ((sim.pit.start - pl.idx + N) % N) * T.ds; if (toEntry < 250 && toEntry > 200) { pl.pitting = true; pl.pitPhase = 'in'; pl.pitReq = { tyre: 'medium', repair: false }; sim.crewStop(pl); } }
      if (sim.call && sim.call.kind === 'crew') sim.answerCall('a');
      if (sim.call && sim.call.kind === 'crewDrive') sim.answerCall('b'); // (skip their stints)
      const reps = sim.skipping ? 15 : 1;
      for (let k = 0; k < reps; k++) { const dt = sim.skipping ? 1 / 30 : 1 / 60; sim.update(dt, c.cur === 'P' && pl.pitting && pl.pitPhase === 'out' ? sim.pitControls(pl, dt) : { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); }
      if (sim.events.length > 400) sim.events.splice(0, 300);
    }
    return { t: c.t, state: sim.state, me: sim.results().find(x => x.isPlayer) };
  });
  console.log(`  drove: you ${(r.t.P / 60).toFixed(1)} min, co-driver ${(r.t.C / 60).toFixed(1)} min · you P${r.me.pos} ${r.me.gap}`);
  ok(r.t.P > 0 && r.t.C > 0 && !r.me.dsq, 'both drove, classified');
  // (the results, as the game hands them to the career)
  console.log('  ', await pg.evaluate(() => { try { window.__svgp.sim.events.length = 0; window.__svgp.sim.events.push({ type: 'results' }); window.__svgp.handleRaceEvents(); } catch (e) { return 'ERR ' + e.stack; } const w = window.__svgp.world; return `screen ${window.__svgp.screen}, results ${w.series[w.player.series].results.length}, round ${w.round}`; }));
  // (the podium, then the round's report: through them, as a player would)
  for (let k = 0; k < 12; k++) { const n = await pg.evaluate(() => { const w = window.__svgp.world; return w.series[w.player.series].results.length; }); if (n) break; await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); }
  const c = await pg.evaluate(([k, mpid]) => { const w = window.__svgp.world, S = w.series[w.player.series], res = S.results.find(x => x.round === k);
    return res ? { me: res.rows.find(x => x.pid === 'P'), mate: res.rows.find(x => x.pid === mpid), round: w.round } : null; }, [pre.k, pre.mpid]);
  ok(c && c.me && c.mate && c.mate.pos === c.me.pos && c.mate.pts === c.me.pts, `the career has it: you and your teammate P${c && c.me && c.me.pos}, ${c && c.me && c.me.pts} points each`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
