// dev: PAINT › Shape, used like a player: draw a gravel area beside a corner point by point, close it with Enter,
// drag a node, look at it in the 3D View; then race there and ask the physics what's under a wheel inside it
//   node .devtest/edshape.mjs <outdir> [id=zandvoort] [at=m along the lap] [side=1]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', id = process.argv[3] || 'zandvoort', AT = +(process.argv[4] || 450), SIDE = +(process.argv[5] || 1);
const PORT = 9700 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(async (id) => { const { cloneTrack } = await import('/js/track.js'); const R = await import('/js/realtracks.js'); await R.realTracksReady();
    const t = await R.hydrateReal(cloneTrack(R.realTracks().find(p => p.real.id === id))); window.__svgp.openEditor(t); }, id);
  await pg.waitForTimeout(2500);
  await pg.click('#ed-tools [data-tool="paint"]'); await pg.click('#p-mode button[data-v="shape"]'); await pg.click('#ps-kind button[data-v="gravel"]');
  const scr = (fn, arg) => pg.evaluate(fn, arg);
  // the outline: 2-14 m out from the edge, 40 m along
  const pts = await scr(([AT, S]) => { const e = window.__svgp.editor, T = e.T, i0 = Math.round(AT / T.ds), r = e.canvas.getBoundingClientRect();
    e.view.cx = T.X[i0] + T.RX[i0] * S * 15; e.view.cz = T.Z[i0] + T.RZ[i0] * S * 15; e.view.scale = 5; e.dirty = true;
    const P = (k, o) => { const i = i0 + k, s = S * (T.W[i] / 2 + o); const [x, y] = e.w2s(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s); return [r.left + x, r.top + y]; };
    return [P(-10, 2), P(0, 2), P(10, 2), P(10, 14), P(0, 18), P(-10, 14)]; }, [AT, SIDE]);
  await pg.waitForTimeout(800);
  for (const p of pts) { await pg.mouse.click(...p); await pg.waitForTimeout(120); }
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(500);
  const st = () => scr(() => { const e = window.__svgp.editor, s = e.track.paint[e.paintSel]; return s ? JSON.stringify({ kind: s.kind, area: s.area, nodes: s.pts.length }) : 'none'; });
  console.log('shape:', await st());
  // drag its 5th node (the far middle one) 6 m further out
  const far = await scr(([AT, S]) => { const e = window.__svgp.editor, T = e.T, i = Math.round(AT / T.ds), r = e.canvas.getBoundingClientRect(), s = S * (T.W[i] / 2 + 24); const [x, y] = e.w2s(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s); return [r.left + x, r.top + y]; }, [AT, SIDE]);
  await pg.mouse.move(...pts[4]); await pg.mouse.down(); await pg.mouse.move(...far, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(400);
  console.log('after node drag:', await scr(() => { const e = window.__svgp.editor; return JSON.stringify(e.track.paint[e.paintSel].pts[4]); }));
  await pg.screenshot({ path: join(out, 'eds_1.png') });
  // 3D
  await pg.mouse.move(...pts[1]); await pg.keyboard.press('v');
  await pg.waitForFunction(() => window.__svgp.editor.v3d, null, { timeout: 60000 }); await pg.waitForTimeout(1200);
  await scr(([AT, S]) => { const v = window.__svgp.editor.v3d, T = v.S.T, i = Math.round((AT - 30) / T.ds); v.pos.set(T.X[i] + T.RX[i] * S * 2, T.Y[i] + 7, T.Z[i] + T.RZ[i] * S * 2); v.yaw = Math.atan2(-T.FX[i], -T.FZ[i]) - S * 0.35; v.pitch = -0.3; }, [AT, SIDE]);
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(out, 'eds_3d.png') });
  await pg.keyboard.press('v'); await pg.waitForTimeout(400);
  // the physics: what's under a wheel 8 m out (inside it), and 30 m out (past it)
  await scr(() => { const e = window.__svgp.editor, t = JSON.parse(JSON.stringify(e.track)); window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu'); });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player, null, { timeout: 120000 }); await pg.waitForTimeout(800);
  console.log('surface:', await scr(([AT, S]) => { const s = window.__svgp.sim, T = s.T, i = Math.round(AT / T.ds); const at = (o) => { const sd = S * (T.W[i] / 2 + o); return s.surfaceKind(i, sd, T.X[i] + T.RX[i] * sd, T.Z[i] + T.RZ[i] * sd); }; return JSON.stringify({ '4m': at(4), '8m': at(8), '12m': at(12), '30m': at(30) }); }, [AT, SIDE]));
} finally { await b.close(); server.kill(); }
