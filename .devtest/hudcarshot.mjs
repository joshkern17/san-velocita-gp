// dev: the HUD's car diagram (hud.js drawCar) for a few cars, on Realistic damage with tyre temperatures: clean, and
// with damage (a bent front left, the front hit, the radiator holed and the water hot)   node .devtest/hudcarshot.mjs <outdir> [cars]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '.', CARS = (process.argv[3] || 'f1,m1procar,jsport').split(',');
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const CAR of CARS) {
    const pg = await b.newPage(); await pg.setViewportSize({ width: 1600, height: 900 });
    pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
    await pg.evaluate(async (c) => { const S = window.__svgp.settings; S.damage = 'high'; S.temps = 'normal'; S.wear = 'normal'; S.car = { ...S.car, chassis: c === 'f1' ? 'custom' : c };
      const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
      window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: S.car }, 'menu'); }, CAR);
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player && window.__svgp.sim.lineV, null, { timeout: 240000 });
    await pg.waitForTimeout(1500);
    await pg.evaluate(() => { const s = window.__svgp.sim; s.state = 'racing'; s.stateT = 0; s.goAt = 0; }); await pg.waitForTimeout(1200);
    const box = await pg.evaluate(() => { const r = document.getElementById('h-car').getBoundingClientRect(); return { x: Math.max(0, r.x - 60), y: Math.max(0, r.y - 30), width: r.width + 120, height: r.height + 40, raw: [r.x, r.y, r.width, r.height] }; });
    console.log(CAR, JSON.stringify(box.raw)); delete box.raw;
    await pg.screenshot({ path: join(OUT, `hudcar-${CAR}-clean.png`), clip: box });
    await pg.evaluate(() => { const s = window.__svgp.sim, p = s.player.phys; p.addBend(0, 0.7); p.bentDir[0] = -1; p.dmg.fw = 0.35; p.gbHurt(0.7); p.dmg.fl = 0.5; p.dmg.rad = 0.5; p.engT = 121; p.engK = 0.86; p.tyre.wf = 0.62; p.tS[1] = p.tC[1] = p.tyreOpt + 45; p.tempGrips(); });
    await pg.waitForTimeout(900);
    await pg.screenshot({ path: join(OUT, `hudcar-${CAR}-hurt.png`), clip: box });
    console.log('shot', CAR);
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
