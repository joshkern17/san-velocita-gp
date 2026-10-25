// dev: a race with tyre temperatures and the field close by, your car on autopilot from the back: how often the HUD
// shows DIRTY AIR / SLIPSTREAM, the tyre colours, screenshots (start, the first DIRTY AIR, the end)
//   TEMPS=normal|realistic node .devtest/tempshot.mjs <car> <outdir> [secs]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100), id = process.argv[2] || 'f1', OUT = process.argv[3] || '/tmp', SECS = +(process.argv[4] || 45);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async ([id, temps]) => { const S = window.__svgp.settings; S.temps = temps; S.dirtyAir = 'on'; S.car = { ...S.car, chassis: id === 'f1' ? 'custom' : id };
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 5, grid: 'back', car: S.car }, 'menu'); }, [id, process.env.TEMPS || 'normal']);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 1 && window.__svgp.sim.lineV, null, { timeout: 240000 });
  await pg.evaluate(() => { const s = window.__svgp.sim; s.state = 'racing'; s.stateT = 0; s.goAt = 0; s.player.autoT = 1e9; });
  await pg.waitForTimeout(1500); await pg.screenshot({ path: join(OUT, `temps-${id}-start.png`) });
  let dirty = 0, tow = 0, n = 0, shot = false;
  for (let k = 0; k < SECS * 10; k++) {
    await pg.waitForTimeout(100);
    const h = await pg.evaluate(() => ({ d: document.getElementById('h-dirty').classList.contains('on'), t: document.getElementById('h-tow').classList.contains('on') }));
    n++; if (h.d) dirty++; if (h.t) tow++;
    if (h.d && !shot) { shot = true; await pg.screenshot({ path: join(OUT, `temps-${id}-dirty.png`) }); }
  }
  const st = await pg.evaluate(() => { const p = window.__svgp.sim.player.phys; return { tS: Array.from(p.tS, x => +x.toFixed(0)), tC: Array.from(p.tC, x => +x.toFixed(0)), grip: +p.tempGrip.toFixed(3), opt: p.tyreOpt }; });
  console.log(id, `dirty air shown ${(dirty / n * 100).toFixed(0)}% of the time, slipstream ${(tow / n * 100).toFixed(0)}%`, JSON.stringify(st));
  await pg.screenshot({ path: join(OUT, `temps-${id}-end.png`) });
} finally { await b.close(); server.kill(); }
