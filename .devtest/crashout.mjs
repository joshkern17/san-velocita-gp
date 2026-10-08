// dev: Realistic damage crash-outs (race.js breakCheck / wreckCar): an AI car thrown at the wall, then the player
//   node .devtest/crashout.mjs [car]   (Auburn; screenshots to $OUT or the scratch dir)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'), OUT = process.env.OUT || '/tmp';
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar';
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async (id) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id }; window.__svgp.settings.damage = 'high'; window.__svgp.settings.rules = 'arcade';
    window.__svgp.startRace(t, { mode: 'race', laps: 5, opponents: 5, aiChassis: 'class', damage: 'high', rules: 'arcade', car: window.__svgp.settings.car }, 'menu');
  }, id);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 1, null, { timeout: 90000 }).catch(e => console.log('wait', e.message));
  await pg.evaluate(() => { const sim = window.__svgp.sim; sim.state = 'racing'; sim.stateT = 99; sim.goAt = 0; sim.raceTime = 30; window.__ev = []; const push = sim.events.push.bind(sim.events); sim.events.push = (...e) => { window.__ev.push(...e); return push(...e); }; });
  const step = (secs) => pg.evaluate((secs) => { const sim = window.__svgp.sim; for (let f = 0; f < secs * 60; f++) sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0, analog: true }, {}); }, secs);
  const info = await pg.evaluate(() => {
    const sim = window.__svgp.sim, T = sim.T, A = sim.A, me = sim.player, ai = sim.cars.find(c => c !== me), out = [];
    out.push(`damageK ${sim.damageK} pit ${!!sim.pit} rc ${!!sim.rc && sim.rc.on}`);
    const orig = sim.breakCheck.bind(sim); window.__hits = [];
    sim.breakCheck = (car, v, part, lx, ly, lim) => { if (v > 12) window.__hits.push(`  hit ${car.isPlayer ? 'ME' : car.name} v ${v.toFixed(1)} part ${part} lim ${lim}`); return orig(car, v, part, lx, ly, lim); };
    const i0 = (Math.round(60 / T.ds)) % T.N;
    const put = (car, i, s, ang, v) => { const h = Math.atan2(T.FX[i], T.FZ[i]) + ang, p = car.phys; p.place(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s, h); p.vx = Math.sin(h) * v; p.vz = Math.cos(h) * v; car.idx = i; sim.updateTracker(car, true); };
    // everyone else parked well up the road
    sim.cars.forEach((c, k) => { if (c !== ai) put(c, (i0 + Math.round((300 + k * 15) / T.ds)) % T.N, (k % 2 ? 3 : -3), 0, 0); });
    put(ai, i0, A.BR[i0] - 6, 0.8, 50);
    sim.focus = ai; window.__ai = ai;
    return out;
  });
  await step(2.5);
  console.log(info.join('\n')); console.log((await pg.evaluate(() => window.__hits)).join('\n'));
  console.log(await pg.evaluate(() => { const sim = window.__svgp.sim, ai = window.__ai; return `after hit: wreck ${ai.wreck ? ai.wreck.kind + ' ' + (ai.wreck.front ? 'F' : 'R') + (ai.wreck.side > 0 ? 'L' : 'R') : 'none'} v ${(ai.phys.speed * 3.6).toFixed(0)} kmh  sc ${sim.rc.sc ? sim.rc.sc.phase : '-'} vsc ${sim.rc.vsc ? sim.rc.vsc.phase : '-'} loose ${(sim.loose || []).length}\n  rc: ${sim.rc.feed.map(f => f.msg).join(' | ')}`; }));
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: `${OUT}/crashout-ai.png` });
  await step(3);
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: `${OUT}/crashout-ai2.png` });
  await step(30);
  console.log(await pg.evaluate(() => { const ai = window.__ai, sim = window.__svgp.sim; return `after 35 s: gone ${!!ai.gone}  results: ${sim.results().map(r => r.name + ' ' + r.gap).join(', ')}`; }));
  // the player, into the wall
  const r2 = await pg.evaluate(() => {
    const sim = window.__svgp.sim, T = sim.T, A = sim.A, me = sim.player;
    const i0 = (Math.round(900 / T.ds)) % T.N, h = Math.atan2(T.FX[i0], T.FZ[i0]) + 0.9, p = me.phys;
    p.place(T.X[i0] + T.RX[i0] * (A.BR[i0] - 6), T.Z[i0] + T.RZ[i0] * (A.BR[i0] - 6), h); p.vx = Math.sin(h) * 55; p.vz = Math.cos(h) * 55; me.idx = i0; sim.updateTracker(me, true);
    sim.focus = me; return `player placed`;
  });
  await step(1.5);
  console.log(r2, await pg.evaluate(() => { const me = window.__svgp.sim.player; return window.__hits.slice(-4).join('\n') + `\nwreck ${me.wreck ? me.wreck.kind : 'none'}; events ${window.__ev.filter(e => e.type === 'crashout').map(e => e.why).join(' / ')}`; }));
  await pg.waitForFunction(() => document.getElementById('failure').classList.contains('on'), null, { timeout: 8000 }).catch(e => console.log('no moment', e.message));
  await pg.waitForTimeout(1600);
  await pg.screenshot({ path: `${OUT}/crashout-me.png` });
  await pg.waitForTimeout(5000);
  console.log(await pg.evaluate(() => `after moment: player gone ${!!window.__svgp.sim.player.gone} state ${window.__svgp.sim.state}`));
} finally { await b.close(); server.kill(); }
