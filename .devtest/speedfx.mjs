// dev: Speed FX side by side - the same moment at speed with it off / on   node .devtest/speedfx.mjs <car> <outdir> [levels]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100), id = process.argv[2] || 'f1gtr', out = process.argv[3] || '/tmp';
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 800, height: 450 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async (id) => { const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.speedFx = 'strong';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 1, grid: 'front', car: S.car }, 'menu'); }, id);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 1 && window.__svgp.sim.lineV, null, { timeout: 120000 }).catch(e => console.log('wait', e.message));
  await pg.evaluate(() => { const s = window.__svgp.sim; s.state = 'racing'; s.stateT = 0; s.goAt = 0; s.player.autoT = 1e9; });
  await pg.waitForTimeout(+(process.env.SECS || 4) * 1000);
  // (swiftshader runs the sim slowly: put the car at speed along its heading, held there for a moment)
  const V = +(process.env.KMH || 250) / 3.6;
  for (let i = 0; i < 12; i++) { await pg.evaluate((V) => { const p = window.__svgp.sim.player.phys; p.vx = Math.sin(p.h) * V; p.vz = Math.cos(p.h) * V; p.speed = V; }, V); await pg.waitForTimeout(150); }
  for (const lv of (process.argv[4] || 'strong,off').split(',')) {
    await pg.evaluate((lv) => { window.__svgp.settings.speedFx = lv; window.__svgp.sim.speedFxLevel = lv; window.__svgp.post.configure({ speedFx: lv !== 'off' }); }, lv);
    for (let i = 0; i < 6; i++) { await pg.evaluate((V) => { const p = window.__svgp.sim.player.phys; p.vx = Math.sin(p.h) * V; p.vz = Math.cos(p.h) * V; p.speed = V; }, V); await pg.waitForTimeout(150); }
    const st = await pg.evaluate(() => { const s = window.__svgp.sim; return { kmh: Math.round(s.player.phys.speed * 3.6), fov: Math.round(s.camera.fov), fx: s.speedFx && { a: +s.speedFx.amount.toFixed(2), rect: s.speedFx.rect?.map(v => +v.toFixed(2)), near: +(s.speedFx.near || 0).toFixed(1) } }; });
    console.log(lv, JSON.stringify(st));
    await pg.screenshot({ path: join(out, `speed-${id}-${lv}.png`) });
  }
} finally { await b.close(); server.kill(); }
