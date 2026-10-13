// dev: AI on a real circuit with its mapped barriers vs the old layout: wall hits + progress over ~75 s of race
//   node .devtest/realwalls.mjs [id=spa]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const id = process.argv[2] || 'spa';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 480, height: 270 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  for (const style of ['real', 'mixed']) {
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
    await pg.evaluate(async ([id, style]) => {
      const R = await import('./js/realtracks.js'); await R.realTracksReady();
      const t = await R.hydrateReal(JSON.parse(JSON.stringify(R.realTracks().find(t => t.real.id === id))));
      t.env.runoffStyle = style; if (style !== 'real') t.osm.walls = null; t.env.weather = 'clear'; t.env.time = 'day';
      window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 3, grid: 'front', car: window.__svgp.settings.car }, 'menu');
    }, [id, style]);
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.T && window.__svgp.sim.player, null, { timeout: 180000 });
    const r = await pg.evaluate(() => {
      const s = window.__svgp.sim; s.state = 'racing'; s.stateT = 0; s.goAt = 0; s.player.autoT = 1e9;
      const hits = new Map(), off = new Map();
      for (let f = 0; f < 4500; f++) {
        s.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
        for (const c of s.cars) { if (c.phys.hitT > 0) hits.set(c, (hits.get(c) || 0) + 1); if (!c.onRoad) off.set(c, (off.get(c) || 0) + 1); }
        s.events.length = 0;
      }
      return s.cars.map(c => `${(c.name || (c.isPlayer ? 'you' : '?')).slice(0, 10)}: ${Math.round(c.dist || (c.lap * s.T.L + c.idx * s.T.ds))} m, wall ${((hits.get(c) || 0) / 60).toFixed(1)} s, off ${((off.get(c) || 0) / 60).toFixed(1)} s`).join(' | ');
    });
    console.log(style.padEnd(6), r);
  }
} finally { await b.close(); server.kill(); }
