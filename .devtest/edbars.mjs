// dev: the Circuit Designer's BARRIERS tool, used like a player: open a circuit, pick BARRIERS, click a barrier,
// drag one of its nodes out 8 m, double-click for a new node, make it a tire wall, put up a new one by dragging,
// then see the moved barrier from the car (chase shot) and hit it
//   node .devtest/edbars.mjs <outdir> [id=zandvoort] [at=m along the lap]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', id = process.argv[3] || 'zandvoort', AT = +(process.argv[4] || 1150);
const PORT = 9400 + Math.floor(Math.random() * 100);
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
  await pg.click('#ed-tools [data-tool="bars"]');
  const scr = (fn, arg) => pg.evaluate(fn, arg);
  // frame the spot; the right-hand barrier there on screen
  const at = await scr((AT) => { const e = window.__svgp.editor, T = e.T, A = e.A, i = Math.round(AT / T.ds); e.view.cx = T.X[i]; e.view.cz = T.Z[i]; e.view.scale = 3; e.dirty = true;
    const r = e.canvas.getBoundingClientRect(), side = A.HAS_R[i] ? 1 : -1, o = (side > 0 ? A.BR : A.BL)[i] * side, [x, y] = e.w2s(T.X[i] + T.RX[i] * o, T.Z[i] + T.RZ[i] * o);
    return { x: r.left + x, y: r.top + y, side, off: (side > 0 ? A.BR : A.BL)[i] - T.W[i] / 2, bars: e.barList().length }; }, AT);
  console.log('barrier there:', JSON.stringify(at));
  await pg.waitForTimeout(800);
  await pg.mouse.click(at.x, at.y); await pg.waitForTimeout(300);
  const sel = await scr(() => { const e = window.__svgp.editor; const b = e.barList()[e.barSel]; return b ? { n: e.barSel, nodes: b.pts.length, side: b.side, type: b.type } : null; });
  console.log('picked:', JSON.stringify(sel));
  // its nearest node: drag it 8 m further out
  const nd = await scr((AT) => { const e = window.__svgp.editor, b = e.barList()[e.barSel], L = e.T.L; let k = 0, bd = 1e9; b.pts.forEach((p, q) => { const dd = Math.abs(((p[0] - AT + L * 1.5) % L) - L / 2); if (dd < bd) { bd = dd; k = q; } });
    const r = e.canvas.getBoundingClientRect(), [x, y] = e.w2s(...e.barXZ(b.side, ...b.pts[k])), [x2, y2] = e.w2s(...e.barXZ(b.side, b.pts[k][0], b.pts[k][1] + 8)); return { k, d: b.pts[k][0], off: b.pts[k][1], x: r.left + x, y: r.top + y, x2: r.left + x2, y2: r.top + y2 }; }, AT);
  await pg.mouse.move(nd.x, nd.y); await pg.mouse.down(); for (let q = 1; q <= 10; q++) await pg.mouse.move(nd.x + (nd.x2 - nd.x) * q / 10, nd.y + (nd.y2 - nd.y) * q / 10); await pg.mouse.up();
  await pg.waitForTimeout(500);
  console.log('node moved:', await scr((k) => { const e = window.__svgp.editor, b = e.barList()[e.barSel]; return JSON.stringify({ own: e.barsOwn(), node: b.pts[k] }); }, nd.k), 'was', nd.off);
  await pg.click('#br-type button[data-v="tires"]'); await pg.waitForTimeout(300);
  await pg.screenshot({ path: join(out, 'edb_1.png') });
  console.log('wall in the game data now:', await scr((AT) => { const e = window.__svgp.editor, T = e.T, A = e.A, i = Math.round(AT / T.ds); return JSON.stringify({ L: A.HAS_L[i] ? +(A.BL[i] - T.W[i] / 2).toFixed(2) : null, R: A.HAS_R[i] ? +(A.BR[i] - T.W[i] / 2).toFixed(2) : null }); }, nd.d));
  // undo / redo
  await pg.keyboard.press('Control+z'); const u1 = await scr(() => window.__svgp.editor.barList()[window.__svgp.editor.barSel]?.type); await pg.keyboard.press('Control+Shift+z'); const u2 = await scr(() => window.__svgp.editor.barList()[window.__svgp.editor.barSel]?.type);
  console.log('undo type:', u1, 'redo type:', u2);
  // a new barrier: drag 60 m along, 15 m out on the left, 200 m on
  const nw = await scr((AT) => { const e = window.__svgp.editor, T = e.T, r = e.canvas.getBoundingClientRect(), pts = [];
    const i0 = Math.round((AT + 200) / T.ds); e.view.cx = T.X[i0]; e.view.cz = T.Z[i0]; e.dirty = true;
    for (let k = 0; k <= 30; k++) { const i = i0 + k, o = -(T.W[i] / 2 + 15); const [x, y] = e.w2s(T.X[i] + T.RX[i] * o, T.Z[i] + T.RZ[i] * o); pts.push([r.left + x, r.top + y]); }
    return { pts, n: e.barList().length }; }, AT);
  await pg.waitForTimeout(300);
  await pg.mouse.move(...nw.pts[0]); await pg.mouse.down(); for (const p of nw.pts.slice(1)) await pg.mouse.move(...p); await pg.mouse.up(); await pg.waitForTimeout(400);
  console.log('new barrier:', await scr(() => { const e = window.__svgp.editor, b = e.barList()[e.barSel]; return JSON.stringify({ count: e.barList().length, side: b && b.side, type: b && b.type, nodes: b && b.pts }); }), 'before', nw.n);
  await pg.screenshot({ path: join(out, 'edb_new.png') });
  // drive up to it
  await scr(() => { const e = window.__svgp.editor, t = JSON.parse(JSON.stringify(e.track)); window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu'); });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player, null, { timeout: 120000 }); await pg.waitForTimeout(1500);
  await scr((AT) => { const s = window.__svgp.sim, T = s.T, N = T.N, j = (Math.round((AT - 30) / T.ds) + N) % N, pl = s.player, p = pl.phys;
    s.paused = true; s.state = 'racing'; pl.idx = j; p.place(T.X[j], T.Z[j], Math.atan2(T.FX[j], T.FZ[j])); p.vx = p.vz = 0; p.u = 0;
    s.updateTracker(pl, true); s.placeModel(pl, 1); s.snapCamera(); for (let k = 0; k < 30; k++) s.updateCamera(0.05); }, nd.d);
  await pg.addStyleTag({ content: '*:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}' });
  await pg.waitForTimeout(1000);
  await pg.screenshot({ path: join(out, 'edb_2.png') });
} finally { await b.close(); server.kill(); }
