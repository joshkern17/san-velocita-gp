// dev: a timed race (endurance), every car driven by the AI: the clock runs down in the race's own hours, at zero the
// leader takes the flag at the line and everyone else at theirs, the results go by laps then time.
//   node .devtest/timedrace.mjs [seconds=60] [clockK=360] [preset name, default the Auburn test track]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const secs = +(process.argv[2] || 60), K = +(process.argv[3] || 360), PRESET = process.argv[4] || '';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([secs, K, PRESET]) => {
    const t = PRESET ? (await import('/js/track.js')).presetTracks().find(t => t.name === PRESET) : await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 7, grid: 'back', car: window.__svgp.settings.car, extra: { duration: secs, clockK: K, strategy: false } }, 'menu');
  }, [secs, K, PRESET]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 2 && window.__svgp.sim.lineV && window.__svgp.sim.player && window.__svgp.sim.mode === "race", null, { timeout: 120000 });
  const r = await pg.evaluate(() => {
    const sim = window.__svgp.sim; sim.state = 'racing'; sim.stateT = 0; sim.goAt = 0; sim.player.autoT = 1e9;
    const ev = [], clocks = [], est0 = sim.laps;
    for (let f = 0; f < 60 * 900 && !(sim.state === 'finished' && sim.cars.every(c => c.finished || c.gone)); f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      for (const e of sim.events.splice(0)) if (['timeup', 'timedflag', 'finish'].includes(e.type)) ev.push(`${e.type}@${sim.raceTime.toFixed(1)}`);
      if (f % 900 === 0) { const h = sim.hudState(); clocks.push(h.timed ? `${(h.timed.left / 3600).toFixed(2)}h L${h.lapNo} est${sim.laps}` : 'none'); }
    }
    const res = sim.results();
    return { dbg: { pit: !!sim.pit, wear: sim.cars.map(c => Math.min(c.phys.tyre.wf, c.phys.tyre.wr).toFixed(2)).join(' '), env: sim.track.env.pits }, stints: sim.timed.stints, wearK: sim.wearK, pits: sim.cars.map(c => c.pits || 0), plans: sim.cars.filter(c => c.plan).map(c => c.plan.stints.map(x => x.c[0] + x.laps).join('-')), est0, ev, clocks, dur: sim.timed.dur, raceTime: sim.raceTime, laps: sim.laps, res: res.map(x => ({ pos: x.pos, name: x.name, lap: x.lap, time: x.time, gap: x.gap, fin: x.finished })) };
  });
  console.log('clock:', r.clocks.join(' | '));
  console.log('debug', JSON.stringify(r.dbg));
  console.log('stints', r.stints, 'wear x', r.wearK.toFixed(2), '| stops per car', r.pits.join(' '), '| AI plans', r.plans.join('  '));
  console.log('events:', r.ev.join(' '), '| first lap estimate', r.est0, 'final laps', r.laps);
  for (const x of r.res) console.log(`  P${x.pos} ${x.name.padEnd(16)} laps ${x.lap - 1} ${x.fin ? x.time.toFixed(1) + ' s' : 'running'} ${x.gap}`);
  const up = r.ev.find(e => e.startsWith('timeup')), flag = r.ev.find(e => e.startsWith('timedflag'));
  ok(up && Math.abs(+up.split('@')[1] - r.dur) < 0.1, `the clock ran out at ${r.dur} s (${up})`);
  ok(flag && +flag.split('@')[1] > r.dur, `then the leader took the flag at the line (${flag})`);
  ok(r.res.every(x => x.fin || x.gap === 'DNF'), 'everyone took the flag');
  ok(r.res.every((x, k) => !k || x.lap < r.res[k - 1].lap || (x.lap === r.res[k - 1].lap && x.time >= r.res[k - 1].time)), 'results by laps, then time');
  ok(r.res[0].time >= r.dur, `the winner's time is past the clock (${r.res[0].time.toFixed(1)} s)`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
