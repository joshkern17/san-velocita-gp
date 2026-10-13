// dev: the Circuit Designer's PIT LANE tool, used like a player: pick it, drag a lane node out 6 m, drag where the
// garages start, look at it in the 3D View; then remove the pit lane and draw a new one by dragging
//   node .devtest/edpit.mjs <outdir> [id=zandvoort]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', id = process.argv[3] || 'zandvoort';
const PORT = 9600 + Math.floor(Math.random() * 100);
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
  await pg.click('#ed-tools [data-tool="pit"]');
  const scr = (fn, arg) => pg.evaluate(fn, arg);
  const info = () => scr(() => { const e = window.__svgp.editor, p = e.pit, o = e.pitNodes(); return JSON.stringify({ own: e.pitOwn(), side: o && o.side, nodes: o && o.pts.length, main: o && e.pitMain(o).map(Math.round), boxes: p && p.boxes.length, len: p && Math.round(p.length) }); });
  console.log('pit lane:', await info());
  // frame the middle of the lane; a node near it, on screen
  const nd = await scr(() => { const e = window.__svgp.editor, o = e.pitNodes(), k = o.pts.length >> 1, [x, z] = e.barXZ(o.side, ...o.pts[k]); e.view.cx = x; e.view.cz = z; e.view.scale = 2.5; e.dirty = true;
    const r = e.canvas.getBoundingClientRect(), [sx, sy] = e.w2s(x, z), [sx2, sy2] = e.w2s(...e.barXZ(o.side, o.pts[k][0], o.pts[k][1] + 6)); return { k, was: o.pts[k], x: r.left + sx, y: r.top + sy, x2: r.left + sx2, y2: r.top + sy2 }; });
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(out, 'edp_0.png') });
  await pg.mouse.move(nd.x, nd.y); await pg.mouse.down(); await pg.mouse.move(nd.x2, nd.y2, { steps: 10 }); await pg.mouse.up(); await pg.waitForTimeout(400);
  console.log('node', nd.k, 'was', JSON.stringify(nd.was), 'now', await scr((k) => JSON.stringify(window.__svgp.editor.pitNodes().pts[k]), nd.k));
  // the garages' start diamond: 40 m further down the lane
  const dm = await scr(() => { const e = window.__svgp.editor, o = e.pitNodes(), m = e.pitMain(o), L = e.T.L, r = e.canvas.getBoundingClientRect();
    const at = (d) => { const u = ((d - o.pts[0][0]) % L + L) % L, off = (() => { const P = o.pts, d0 = P[0][0]; let up = 0; for (let k = 1; k < P.length; k++) { const uk = ((P[k][0] - d0) % L + L) % L; if (u <= uk) return P[k - 1][1] + (P[k][1] - P[k - 1][1]) * (u - up) / Math.max(1e-6, uk - up); up = uk; } return 0; })(); const [x, z] = e.barXZ(o.side, d, off); e.view.cx = x; e.view.cz = z; return [x, z]; };
    const [x, z] = at(m[0]); e.view.scale = 2.5; e.dirty = true; const [sx, sy] = e.w2s(x, z), [x2, z2] = (() => { const [a, c] = [x, z]; return e.barXZ(o.side, m[0] + 40, 0); })(); const [sx2, sy2] = e.w2s(x2, z2);
    return { m0: m[0], x: r.left + sx, y: r.top + sy, x2: r.left + sx2, y2: r.top + sy2 }; });
  await pg.waitForTimeout(500);
  await pg.mouse.move(dm.x, dm.y); await pg.mouse.down(); await pg.mouse.move(dm.x2, dm.y2, { steps: 10 }); await pg.mouse.up(); await pg.waitForTimeout(400);
  console.log('garages moved from', Math.round(dm.m0), '->', await info());
  await pg.screenshot({ path: join(out, 'edp_1.png') });
  // 3D view there
  await pg.mouse.move(dm.x2, dm.y2); await pg.keyboard.press('v');
  await pg.waitForFunction(() => window.__svgp.editor.v3d, null, { timeout: 60000 }); await pg.waitForTimeout(1200);
  await pg.screenshot({ path: join(out, 'edp_3d.png') });
  await pg.keyboard.press('v'); await pg.waitForTimeout(500);
  // remove it, draw a new one on the other side of the main straight
  await pg.click('#pl-none'); await pg.waitForTimeout(400);
  console.log('removed:', await info());
  const tr = await scr(() => { const e = window.__svgp.editor, T = e.T, r = e.canvas.getBoundingClientRect(), side = -e.track.dress?.pit?.side || 1, pts = [];
    const i0 = T.N - Math.round(200 / T.ds); e.view.cx = T.X[0]; e.view.cz = T.Z[0]; e.view.scale = 1.2; e.dirty = true;
    for (let k = 0; k <= 60; k++) { const i = (i0 + k * 4) % T.N, f = Math.min(1, k / 8, (60 - k) / 8), o = 1 * (T.W[i] / 2 + 1 + 14 * f); const [x, y] = e.w2s(T.X[i] + T.RX[i] * o, T.Z[i] + T.RZ[i] * o); pts.push([r.left + x, r.top + y]); }
    return pts; });
  await pg.waitForTimeout(300);
  await pg.mouse.move(...tr[0]); await pg.mouse.down(); for (const p of tr.slice(1)) await pg.mouse.move(...p); await pg.mouse.up(); await pg.waitForTimeout(500);
  console.log('new pit lane:', await info());
  console.log('its nodes:', await scr(() => JSON.stringify(window.__svgp.editor.track.dress.pit)), 'L', await scr(() => window.__svgp.editor.T.L));
  await pg.screenshot({ path: join(out, 'edp_2.png') });
} finally { await b.close(); server.kill(); }
