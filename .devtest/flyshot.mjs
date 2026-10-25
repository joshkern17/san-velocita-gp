// dev: Flying Lap spawns (race.js flyingStart) on preset tracks + auburn: where it puts you, and whether 2 s of auto-drive
// then 3 s of the bot keeps you off the walls. node .devtest/flyshot.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const auburn = JSON.parse(readFileSync(join(HERE, 'auburn2.json'), 'utf8')); delete auburn.hidden; auburn.env.weather = 'clear';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage({ viewport: { width: 800, height: 450 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  const presets = await pg.evaluate(() => import('./js/track.js').then(m => m.presetTracks().slice(0, 4)));
  for (const track of [auburn, ...presets]) for (const id of ['civicek', 'm1procar', 'f1']) {
    await pg.evaluate(({ track, id }) => { window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id }; window.__svgp.dbg.startWeekend(track, { mode: 'race', laps: 3, opponents: 3, pick: false, extra: { car: window.__svgp.settings.car } }, 'setup', 'full', [1800, 600]); }, { track, id });
    await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
    await pg.evaluate(() => [...document.querySelectorAll('#m-pitgarage .item')].find(e => e.textContent.trim() === 'Flying Lap').click());
    await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 20000 });
    const r = await pg.evaluate(() => {
      const sim = window.__svgp.sim, car = sim.player, p = car.phys, T = sim.T, i0 = car.idx, v0 = p.speed;
      let hits = 0, off = 0, minV = 1e9;
      for (let f = 0; f < 300; f++) {
        const i = car.idx, la = (i + Math.round((8 + p.speed * 0.35) / T.ds)) % T.N, o = sim.line[la];
        const dx = T.X[la] + T.RX[la] * o - p.x, dz = T.Z[la] + T.RZ[la] * o - p.z;
        const left = dx * Math.cos(p.h) - dz * Math.sin(p.h), fwd = dx * Math.sin(p.h) + dz * Math.cos(p.h);
        const steer = Math.max(-1, Math.min(1, -Math.atan2(left, fwd) * 2.5)), vt = sim.lineV[(i + 10) % T.N] * 0.9;
        sim.update(1 / 60, { steer, throttle: p.speed < vt ? 1 : 0, brake: p.speed > vt + 3 ? 1 : 0, handbrake: 0, analog: true, pad: true }, {});
        if (p.hitT > 0) hits++; if (!car.onRoad) off++; minV = Math.min(minV, p.speed);
        sim.events.length = 0;
      }
      return { back: Math.round(((T.N - i0) % T.N) * T.ds), v0: Math.round(v0 * 3.6), hits, off, minV: Math.round(minV * 3.6), lap: car.lap };
    });
    console.log((track.name || '?').padEnd(22), id.padEnd(9), JSON.stringify(r));
    await pg.evaluate(() => window.__svgp.sim.qualiEnd());
    await pg.waitForFunction(() => window.__svgp.screen === 's-results', null, { timeout: 30000 });
  }
} finally { await b.close(); server.kill(); }
