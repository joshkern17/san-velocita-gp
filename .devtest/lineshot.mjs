// dev: the 3D block racing line from the bumper cam, approaching a brake zone (the AI drives your car)
//   [CAM=2] [DS=70,45,25,10] [STYLE=flat] node .devtest/lineshot.mjs <outdir> [chassis]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', id = process.argv[3];
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async ([id, style]) => { const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; t.env.time = 'day'; const S = window.__svgp.settings;
    S.racingLine = 'full'; S.lineStyle = style; if (id) S.car = { ...S.car, chassis: id };
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: S.car }, 'menu'); }, [id, process.env.STYLE || 'blocks']);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.tileMesh, null, { timeout: 120000 });
  await pg.evaluate((cam) => { const s = window.__svgp.sim; s.state = 'racing'; s.stateT = 0; s.goAt = 0; s.player.autoT = 1e9; s.camMode = cam; s.lineMode = 'full'; }, +(process.env.CAM || 0));
  // the biggest brake zone: where the planned speed drops most
  const zone = await pg.evaluate(() => { const s = window.__svgp.sim, T = s.T, N = T.N; let best = 0, bi = 0;
    for (let i = 0; i < N; i++) if (s.lineBase[i] >= 0.95 && s.lineBase[(i - 1 + N) % N] < 0.95) { const drop = s.refV[i] - s.refV[(i + 40) % N]; if (drop > best) { best = drop; bi = i; } } return bi; });
  for (const d of (process.env.DS || '140,80,45,20').split(',').map(Number)) {
    // frozen: the car on the line d m before the zone at the planned speed, the line and camera settled there
    const info = await pg.evaluate(([z, d]) => { const s = window.__svgp.sim, T = s.T, N = T.N, i = (z - Math.round(d / T.ds) + N) % N, pl = s.player, p = pl.phys;
      s.paused = true; pl.idx = i;
      p.place(T.X[i] + T.RX[i] * s.line[i], T.Z[i] + T.RZ[i] * s.line[i], Math.atan2(T.FX[i], T.FZ[i]));
      const v = s.refV[i]; p.vx = T.FX[i] * v; p.vz = T.FZ[i] * v; p.u = v;
      s.updateTracker(pl, true); s.placeModel(pl, 1); s.snapCamera();
      for (let k = 0; k < 40; k++) { s.updateRacingLine(0.05); s.updateCamera(0.05); }
      const a = []; for (let k = 0; k < 90; k += 4) { const j = (pl.idx + k) % N; a.push(k * 2 + ':' + s.lineSev[j].toFixed(2) + '/' + s.tileLift[j / 2 | 0].toFixed(2)); } return [Math.round(v), pl.idx, i, z, Math.round(p.u), s.tileMesh.geometry.drawRange.count / 6, a.join(' ')];
    }, [zone, d]);
    await pg.waitForTimeout(500);
    console.log(d, info);
    await pg.screenshot({ path: join(out, `line-${d}m.png`) });
  }
} finally { await b.close(); server.kill(); }
