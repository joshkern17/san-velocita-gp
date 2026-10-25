// dev: the Mini-Sectors job (practice.js) in practice, then its payoff in qualifying (the pips against your practice
// bests). A bot drives at the reference lap's speeds. node .devtest/minishot.mjs [outdir] [car] [laps]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const out = process.argv[2] || HERE, id = process.argv[3] || 'm1procar', laps = +(process.argv[4] || 3);
const track = JSON.parse(readFileSync(join(HERE, 'auburn2.json'), 'utf8')); delete track.hidden; track.env.weather = 'clear';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// the bot: until(sim, car) says when to stop
const DRIVE = `(until, pace) => {
  const sim = window.__svgp.sim, car = sim.player, p = car.phys, T = sim.T, RV = sim.referenceTelemetry(car.carId, sim.condTyre('soft')).ch.v, ev = [];
  const stop = new Function('sim', 'car', 'return ' + until);
  for (let f = 0; f < 60 * 700 && !stop(sim, car); f++) {
    const i = car.idx, la = (i + Math.round((8 + p.speed * 0.35) / T.ds)) % T.N, off = sim.line[la];
    const tx = T.X[la] + T.RX[la] * off, tz = T.Z[la] + T.RZ[la] * off, dx = tx - p.x, dz = tz - p.z;
    const left = dx * Math.cos(p.h) - dz * Math.sin(p.h), fwd = dx * Math.sin(p.h) + dz * Math.cos(p.h);
    const sx = Math.max(-1, Math.min(1, -Math.atan2(left, fwd) * 2.5 + (p.beta || 0) * 1.2)), steer = Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
    const vt = RV[i] * pace, vt2 = RV[(i + Math.round(25 / T.ds)) % T.N] * pace;
    sim.update(1 / 60, { steer, throttle: p.speed < Math.min(vt, vt2 + 6) ? 1 : 0, brake: p.speed > Math.min(vt, vt2 + 6) + 2 ? 1 : 0, handbrake: 0, analog: true, pad: true, lag: 0.05 }, {});
    for (const e of sim.events) if (e.type === 'progLap') ev.push(JSON.stringify(e));
    sim.events.length = 0;
  }
  return { ev, laps: car.lapTimes.map(x => x.toFixed(2)), hud: sim.hudState().sectors, prog: sim.hudState().prog, msec: sim.tdata.msec, mini: sim.mini };
}`;
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(({ track, id }) => { window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id }; window.__svgp.dbg.startWeekend(track, { mode: 'race', laps: 3, opponents: 5, pick: false, extra: { car: window.__svgp.settings.car } }, 'setup', 'full', [1800, 600]); }, { track, id });
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await pg.evaluate(() => window.__svgp.sim.setProgramme('msec'));
  await pg.evaluate(() => [...document.querySelectorAll('#m-pitgarage .item')].find(e => e.textContent.trim() === 'Flying Lap').click());
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 20000 });
  const r = await pg.evaluate(`(${DRIVE})('car.lapTimes.length >= ${laps} && car.ms && car.ms.j >= 6', 1)`);
  console.log('practice', JSON.stringify({ ...r, mini: { per: r.mini.per, n: r.mini.n } }));
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: join(out, 'mini-practice.png') });
  // on to qualifying (the bot's laps vary too much to always do the job: if it hasn't, it's marked done here, to see the payoff)
  console.log('forced done', await pg.evaluate(() => { const D = window.__svgp.sim.tdata.msec; if (D.done) return false; D.done = true; window.__svgp.sim.events.push({ type: 'tdata' }); return true; }));
  await pg.waitForTimeout(300);
  await pg.evaluate(() => window.__svgp.sim.qualiEnd());
  await pg.waitForFunction(() => window.__svgp.screen === 's-results', null, { timeout: 30000 });
  await pg.evaluate(() => { [...document.querySelectorAll('#s-results .item')].find(e => /Qualifying/.test(e.textContent)).click(); });
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage' && window.__svgp.sim.quali.kind === 'quali', null, { timeout: 120000 });
  await pg.evaluate(() => [...document.querySelectorAll('#m-pitgarage .item')].find(e => e.textContent.trim() === 'Flying Lap').click());
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 20000 });
  const q = await pg.evaluate(`(${DRIVE})('car.lapTimes.length >= 1 && car.ms && car.ms.j >= 8', 1.02)`);
  console.log('quali', JSON.stringify({ laps: q.laps, pips: q.hud.pips, prog: q.prog }));
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: join(out, 'mini-quali.png') });
} finally { await b.close(); server.kill(); }
