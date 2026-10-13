// dev: curve handles, used like a player on a circuit file: EDIT, click a node, drag its out-handle 25 m: the corner
// bends, the in-handle turns with it, undo / Reset Curve; then RUNOFF (R): pen a shape (clicks and click-drags),
// it closes with curved edges, the game reads gravel inside; pick a node, drag its handle, make it sharp.
//   node .devtest/edhandles.mjs <file.json> <outdir>
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const file = process.argv[2], out = process.argv[3] || '/tmp';
const PORT = 9800 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.openEditor(t), JSON.parse(readFileSync(file, 'utf8')));
  await pg.waitForTimeout(2500);
  const ev = (fn, a) => pg.evaluate(fn, a);
  const scr = (x, z) => ev(([x, z]) => { const e = window.__svgp.editor, r = e.canvas.getBoundingClientRect(), [sx, sy] = e.w2s(x, z); return [r.left + sx, r.top + sy]; }, [x, z]);
  // ---- track handles ----
  await pg.click('#ed-tools [data-tool="edit"]');
  const K = 10;
  const n0 = await ev((k) => { const e = window.__svgp.editor, p = e.track.points[k]; e.view.cx = p.x; e.view.cz = p.z; e.view.scale = 2.5; e.dirty = true; return { x: p.x, z: p.z, L: e.T.L }; }, K);
  await pg.waitForTimeout(300);
  let [x, y] = await scr(n0.x, n0.z); await pg.mouse.click(x, y); await pg.waitForTimeout(300);
  const hs = await ev(() => window.__svgp.editor.trackHandles());
  ok(hs.length === 2 && hs.every(h => !h.own), `a picked node shows 2 automatic handles (${hs.length})`);
  const ho = hs.find(h => h.end === 'ho'), len = Math.hypot(ho.x - n0.x, ho.z - n0.z);
  // drag it out to 2.5x as long: a wider, rounder corner
  const [hx, hy] = await scr(ho.x, ho.z), [tx, ty] = await scr(n0.x + (ho.x - n0.x) * 2.5, n0.z + (ho.z - n0.z) * 2.5);
  await pg.mouse.move(hx, hy); await pg.mouse.down(); for (let q = 1; q <= 10; q++) await pg.mouse.move(hx + (tx - hx) * q / 10, hy + (ty - hy) * q / 10); await pg.mouse.up(); await pg.waitForTimeout(500);
  const after = await ev(([k, x, z]) => { const e = window.__svgp.editor, p = e.track.points[k], T = e.T; let m = 0; // how far the road moved near the node (vs a straight copy of the old one)
    return { ho: p.ho, hi: p.hi, L: T.L, btn: !!document.getElementById('n-curve') }; }, [K, n0.x, n0.z]);
  const dot = after.ho && after.hi ? (after.ho[0] * after.hi[0] + after.ho[1] * after.hi[1]) / (Math.hypot(...after.ho) * Math.hypot(...after.hi)) : 0;
  ok(after.ho && Math.abs(Math.hypot(...after.ho) - len * 2.5) < 1.5, `the out-handle is where it was dragged (${after.ho && Math.hypot(...after.ho).toFixed(1)} m, wanted ${(len * 2.5).toFixed(1)})`);
  ok(dot < -0.999, `the in-handle turned with it, straight through the node (${dot.toFixed(4)})`);
  ok(Math.abs(after.L - n0.L) > 0.5, `the road changed shape (lap ${n0.L.toFixed(1)} -> ${after.L.toFixed(1)} m)`);
  ok(after.btn, 'Reset Curve is offered');
  await pg.screenshot({ path: join(out, 'hand_track.png') });
  await pg.click('#n-curve'); await pg.waitForTimeout(400);
  const reset = await ev((k) => { const e = window.__svgp.editor, p = e.track.points[k]; return { h: !!(p.hi || p.ho), L: e.T.L }; }, K);
  ok(!reset.h && Math.abs(reset.L - n0.L) < 0.05, `Reset Curve puts the corner back (lap ${reset.L.toFixed(1)} m)`);
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(300);
  ok(await ev((k) => !!window.__svgp.editor.track.points[k].ho, K), 'undo brings the handle back');
  // ---- RUNOFF pen ----
  await pg.mouse.move(700, 400); await pg.keyboard.press('r'); await pg.waitForTimeout(300);
  ok(await ev(() => { const e = window.__svgp.editor; return e.tool === 'paint' && e.paintMode === 'shape' && document.querySelector('[data-tool="runoff"]').classList.contains('on'); }), 'R: the RUNOFF tool (pen), its button lit');
  // a spot 30 m out beside node 20
  const c0 = await ev(() => { const e = window.__svgp.editor, T = e.T, i = Math.round(1500 / T.ds), o = -(T.W[i] / 2 + 30); const cx = T.X[i] + T.RX[i] * o, cz = T.Z[i] + T.RZ[i] * o; e.view.cx = cx; e.view.cz = cz; e.view.scale = 4; e.dirty = true; return [cx, cz]; });
  await pg.waitForTimeout(300);
  const P = [[-12, -10], [12, -10], [14, 10], [-12, 10]].map(([dx, dz]) => [c0[0] + dx, c0[1] + dz]);
  const click = async (p) => { const [sx, sy] = await scr(...p); await pg.mouse.click(sx, sy); await pg.waitForTimeout(120); };
  const dragAt = async (p, v) => { const [sx, sy] = await scr(...p), [ex, ey] = await scr(p[0] + v[0], p[1] + v[1]); await pg.mouse.move(sx, sy); await pg.mouse.down(); for (let q = 1; q <= 6; q++) await pg.mouse.move(sx + (ex - sx) * q / 6, sy + (ey - sy) * q / 6); await pg.mouse.up(); await pg.waitForTimeout(120); };
  await click(P[0]); await dragAt(P[1], [6, 0]); await click(P[2]); await dragAt(P[3], [-6, 0]); await click(P[0]); await pg.waitForTimeout(600);
  const sh = await ev(() => { const e = window.__svgp.editor, st = e.track.paint[e.track.paint.length - 1]; return st && { area: st.area, kind: st.kind, nodes: st.nodes && st.nodes.map(p => !!p[2]), outline: st.pts.length, n: e.track.paint.length }; });
  console.log('shape', JSON.stringify(sh));
  ok(sh && sh.area && sh.nodes && sh.nodes.join() === 'false,true,false,true', 'the pen made 4 nodes: sharp, smooth (dragged), sharp, smooth');
  ok(sh && sh.outline > 20, `its edges curve through the smooth ones (${sh && sh.outline} outline points)`);
  const surf = await ev((c) => import('/js/runoff.js').then(R => { const e = window.__svgp.editor, st = e.track.paint[e.track.paint.length - 1]; return { inside: R.strokeDist(st, c[0], c[1]), out: R.strokeDist(st, c[0] + 30, c[1]) }; }), c0);
  ok(surf.inside < 0 && surf.out > 0, `inside reads as inside (${surf.inside.toFixed(1)}), 30 m off as outside (${surf.out.toFixed(1)})`);
  await pg.screenshot({ path: join(out, 'hand_runoff.png') });
  // pick node 2 (smooth): drag its handle further, then make it sharp
  const [n2x, n2y] = await scr(...P[1]); await pg.mouse.click(n2x, n2y); await pg.waitForTimeout(300);
  const nd = await ev(() => { const e = window.__svgp.editor, st = e.track.paint[e.paintSel]; return { node: e.paintNode, h: e.shapeHandles(st.nodes, e.paintNode) }; });
  ok(nd.node === 1 && nd.h.length === 2, `clicking a smooth node picks it with its 2 handles (node ${nd.node})`);
  const hh = nd.h.find(h => h.end === 'ho');
  await dragAt([hh.x, hh.z], [0, 8]);
  const moved = await ev(() => { const e = window.__svgp.editor, st = e.track.paint[e.paintSel], o = st.nodes[1][2]; return { ho: o.ho, hi: o.hi }; });
  ok(moved.ho && Math.abs(moved.ho[1] - 8) < 1.5, `its handle moved (${JSON.stringify(moved.ho)}), the other turned (${JSON.stringify(moved.hi)})`);
  await pg.click('#ps-nk button[data-v="0"]'); await pg.waitForTimeout(300);
  ok(await ev(() => { const e = window.__svgp.editor, st = e.track.paint[e.paintSel]; return !st.nodes || !st.nodes[1][2]; }), 'Sharp Corner takes its handles off');
  await pg.screenshot({ path: join(out, 'hand_runoff2.png') });
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
} finally { await b.close(); server.kill(); }
