// dev: lap sectors (race.js buildSectors / secHud): a bot laps a time trial, the HUD strip mid-lap; then a practice
// session's garage timing and results with the field's sectors. node .devtest/sectorshot.mjs [outdir] [car]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const out = process.argv[2] || HERE, id = process.argv[3] || 'm1procar';
const track = JSON.parse(readFileSync(join(HERE, 'auburn2.json'), 'utf8')); delete track.hidden; track.env.weather = 'clear';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; try { localStorage.removeItem('svgp.sectorBests'); } catch (e) {} });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(({ track, id }) => { window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id }; window.__svgp.startRace(track, { mode: 'test', laps: 3, opponents: 0, car: window.__svgp.settings.car }, 'menu'); }, { track, id });
  await pg.waitForFunction(() => window.__svgp.screen === 'hud' && window.__svgp.sim && window.__svgp.sim.state === 'racing', null, { timeout: 90000 });
  // drive: lap 1, then lap 2 to just past the second split
  const drive = (until) => pg.evaluate((until) => {
    const sim = window.__svgp.sim, car = sim.player, p = car.phys, T = sim.T, RV = sim.referenceTelemetry(car.carId, sim.condTyre('soft')).ch.v, log = [];
    for (let f = 0; f < 60 * 400; f++) {
      if (until === 'lap2s2' ? car.lapTimes.length >= 1 && car.sec && car.sec.k >= 2 && sim.raceTime - car.sec.t0 > 9 : car.lapTimes.length >= 1) break;
      const i = car.idx, la = (i + Math.round((8 + p.speed * 0.35) / T.ds)) % T.N, off = sim.line[la];
      const tx = T.X[la] + T.RX[la] * off, tz = T.Z[la] + T.RZ[la] * off, dx = tx - p.x, dz = tz - p.z;
      const left = dx * Math.cos(p.h) - dz * Math.sin(p.h), fwd = dx * Math.sin(p.h) + dz * Math.cos(p.h);
      const sx = Math.max(-1, Math.min(1, -Math.atan2(left, fwd) * 2.5 + (p.beta || 0) * 1.2)), steer = Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
      const pace = car.lapTimes.length ? 1.0 : 0.95, vt = RV[i] * pace, vt2 = RV[(i + Math.round(25 / T.ds)) % T.N] * pace;
      sim.update(1 / 60, { steer, throttle: p.speed < Math.min(vt, vt2 + 6) ? 1 : 0, brake: p.speed > Math.min(vt, vt2 + 6) + 2 ? 1 : 0, handbrake: 0, analog: true, pad: true, lag: 0.05 }, {});
      sim.events.length = 0;
    }
    return { cut: sim.secCut, frac: sim.secFrac.map(x => x.toFixed(3)), laps: car.lapTimes.map(x => x.toFixed(3)), best: (car.secBest || []).map(x => x.toFixed(3)), top: sim.secTop.map(x => x.toFixed(3)), hud: sim.hudState().sectors, delta: sim.hudState().delta, dbg: car.bestTrace ? { i: car.i, idx: car.idx, el: sim.raceTime - car.lapStart, bt: [0, 200, 500, 900, 1200, 1600, 2000, 2400, car.i].map(k => [k, +car.bestTrace[k]?.toFixed(2)]), cur: car.trace ? [200, 900, 1600, car.i].map(k => [k, +car.trace[k]?.toFixed(2)]) : null } : null };
  }, until);
  console.log('lap1', JSON.stringify(await drive('lap1')));
  console.log('lap2', JSON.stringify(await drive('lap2s2')));
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: join(out, 'sectors-hud.png') });
  console.log('stored', await pg.evaluate(() => localStorage.getItem('svgp.sectorBests')));
  // practice: the field's sectors in the garage timing, then the results
  await pg.evaluate((track) => window.__svgp.dbg.startWeekend(track, { mode: 'race', laps: 3, opponents: 7, pick: false }, 'setup', 'full', [600, 300]), track);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await pg.evaluate(() => { const sim = window.__svgp.sim; sim.skipTime(400); sim.player.secBest = [31.5, 40.2, 33.1]; sim.player.best = 104.9; });
  await pg.evaluate(() => { [...document.querySelectorAll('#m-pitgarage .item')].find(e => e.textContent.trim() === 'Timing').click(); });
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: join(out, 'sectors-garage.png') });
  await pg.evaluate(() => { [...document.querySelectorAll('#m-pitgarage .item')].find(e => e.textContent.trim() === 'Timing').click(); });
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: join(out, 'sectors-garage-card.png') });
  await pg.evaluate(() => window.__svgp.sim.qualiEnd());
  await pg.waitForFunction(() => window.__svgp.screen === 's-results', null, { timeout: 20000 });
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: join(out, 'sectors-results.png') });
} finally { await b.close(); server.kill(); }
