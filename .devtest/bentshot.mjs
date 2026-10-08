// dev: Realistic damage, a bent corner: your car's front left knocked out of line, seen from beside it, and the HUD's
// car diagram   node .devtest/bentshot.mjs <outdir> [car] [bent 0..1]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '.', CAR = process.argv[3] || 'm1procar', B = +(process.argv[4] || 0.8);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.evaluate((d) => { window.__camD = d; }, process.env.CAMD || 5.5);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async (c) => { const S = window.__svgp.settings; S.damage = 'high'; S.car = { ...S.car, chassis: c };
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: S.car }, 'menu'); }, CAR);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player && window.__svgp.sim.lineV, null, { timeout: 240000 });
  await pg.waitForTimeout(1500);
  const r = await pg.evaluate((B) => { const s = window.__svgp.sim, p = s.player.phys; p.addBend(0, B); p.bentDir[0] = -1; s.player.model.animate(); return { on: p.bentOn, bent: Array.from(p.bent), ch: p.dmg.ch }; }, B);
  console.log(JSON.stringify(r));
  await pg.waitForTimeout(800); await pg.screenshot({ path: join(OUT, 'bent-hud.png') });
  // a still camera in front of the car, a little to its left, low: the bent wheel's lean and toe
  await pg.evaluate(() => { const s = window.__svgp.sim, p = s.player.phys; s.updateCamera = () => {};
    const f = [Math.sin(p.h), Math.cos(p.h)], l = [Math.cos(p.h), -Math.sin(p.h)], y = s.player.model.group.position.y;
    const D = +(window.__camD || 5.5); s.camera.position.set(p.x + f[0] * D + l[0] * 0.9, y + 0.7, p.z + f[1] * D + l[1] * 0.9); s.camera.lookAt(p.x + f[0] * 1.6 + l[0] * 0.5, y + 0.3, p.z + f[1] * 1.6 + l[1] * 0.5); });
  await pg.waitForTimeout(800); await pg.screenshot({ path: join(OUT, 'bent-front.png') });
} finally { await b.close(); server.kill(); }
