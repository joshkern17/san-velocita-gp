// dev: tire smoke / dust shots behind the player   node .devtest/fxshot.mjs <smoke|dirt|wetdirt|grass> <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const mode = process.argv[2] || 'smoke', out = process.argv[3] || '/tmp';
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async (mode) => { const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = mode === 'wetdirt' ? 'rain' : 'clear'; t.env.time = mode.endsWith('dusk') ? 'dusk' : 'day';
    if (mode.includes('dirt')) t.env.surface = 'dirt';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 3, grid: 'back', car: window.__svgp.settings.car }, 'menu'); }, mode);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 1 && window.__svgp.sim.lineV, null, { timeout: 120000 });
  await pg.evaluate((mode) => { const s = window.__svgp.sim; s.state = 'racing'; s.stateT = 0; s.goAt = 0; s.player.autoT = 1e9;
    const f = s.tireFx.bind(s); s.tireFx = (car, y, dt) => { if (mode.startsWith('smoke') && car.isPlayer) { const p = car.phys, o = p.spin; p.spin = 0.25; f(car, y, dt); p.spin = o; } else f(car, y, dt); };
    // (swiftshader runs slowly: start everyone already at speed)
    for (const c of s.cars) { const p = c.phys; p.vx = Math.sin(p.h) * 30; p.vz = Math.cos(p.h) * 30; }
    if (mode === 'grass') { const sk = s.surfaceEnv.bind(s); s.surfaceEnv = (car) => { const r = sk(car); if (car.isPlayer) { car.surface = 'grass'; car.onRoad = false; } return r; }; }
  }, mode);
  for (const t of [2.5, 5]) {
    await pg.waitForTimeout(t === 2.5 ? 2500 : 2500);
    console.log(mode, t, await pg.evaluate(() => ({ n: window.__svgp.sim.fx.n, sp: window.__svgp.sim.player.phys.speed.toFixed(0), surf: window.__svgp.sim.player.surface })));
    if (process.env.RED) await pg.evaluate(() => { const m = window.__svgp.sim.player.model; m.shadow.material.color.set(0xff0000); m.shadow.material.map = null; m.shadow.material.opacity = 1; m.shadow.material.needsUpdate = true; });
    if (process.env.CHECK) console.log(await pg.evaluate(() => { const s = window.__svgp.sim; let cast = 0, recv = 0, tot = 0, lightCast = 0; s.player.model.group.traverse(o => { if (o.isMesh) { tot++; if (o.castShadow) cast++; } });
      s.scene.traverse(o => { if (o.isMesh && o.receiveShadow) recv++; if (o.isDirectionalLight && o.castShadow) lightCast++; }); const r = window.__svgp.renderer || null;
      return { cast, tot, recv, lightCast, sm: r ? r.shadowMap.enabled : '?', sun: s.world.P.sun }; }));
    await pg.screenshot({ path: join(out, `fx-${mode}-${t}.png`) });
  }
} finally { await b.close(); server.kill(); }
