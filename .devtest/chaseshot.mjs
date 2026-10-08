// dev: the chase camera behind a car, a few seconds into a race   node .devtest/chaseshot.mjs <ids> <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const id of (process.argv[2] || 'transit,rs964').split(',')) {
    const GRID = process.env.GRID || 'front'; const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
    pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
    await pg.evaluate(async ([id, G]) => { const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
      window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 3, grid: G, car: window.__svgp.settings.car }, 'menu'); }, [id, GRID]);
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 1 && window.__svgp.sim.lineV, null, { timeout: 120000 }).catch(e => console.log('wait', e.message));
    // racing, the AI driving your car too, a few seconds in (the field close behind)
    await pg.evaluate(() => { const s = window.__svgp.sim; s.state = 'racing'; s.stateT = 0; s.goAt = 0; s.player.autoT = 1e9; });
    await pg.waitForTimeout(+(process.env.SECS || 7) * 1000);
    if (process.env.BEHIND) await pg.evaluate((d) => { const s = window.__svgp.sim, p = s.player.phys, o = s.cars.find(c => c !== s.player).phys;
      o.h = p.h; o.x = p.x - Math.sin(p.h) * d + Math.cos(p.h) * 1.5; o.z = p.z - Math.cos(p.h) * d - Math.sin(p.h) * 1.5; o.vx = p.vx; o.vz = p.vz; o.r = 0; }, +process.env.BEHIND).then(() => pg.waitForTimeout(300));
    console.log(id, JSON.stringify(await pg.evaluate(() => { const s = window.__svgp.sim; return s.camSize(s.player); })), await pg.evaluate(() => window.__svgp.sim.state));
    await pg.screenshot({ path: join(process.argv[3] || '/tmp', `chase-${id}.png`) });
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
