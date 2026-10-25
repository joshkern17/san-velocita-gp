// dev: BARRIERS straight stretches + handles, used like a player on a circuit file: pick the barrier on the outside
// of the tightest corner, drag its node there 10 m out: the stretches either side should run straight (world chord),
// the game's wall where the editor draws it; then pull a handle and the stretch bends; Follow The Track puts it back.
//   node .devtest/edbarstraight.mjs <file.json> <outdir>
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const file = process.argv[2], out = process.argv[3] || '/tmp';
const PORT = 9700 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.openEditor(t), JSON.parse(readFileSync(file, 'utf8')));
  await pg.waitForTimeout(2500);
  await pg.click('#ed-tools [data-tool="bars"]'); await pg.waitForTimeout(300);
  await pg.evaluate(async () => { const t = await import('/js/track.js'), eb = await import('/js/edbarriers.js'); window.__barLine = t.barrierLine; window.__offAt = eb.offAt; });
  const ev = (fn, a) => pg.evaluate(fn, a);
  // the outside of the tightest corner: which side, which barrier, its node nearest the apex
  const tgt = await ev(() => { const e = window.__svgp.editor, T = e.T; let bi = 0; for (let i = 0; i < T.N; i++) if (Math.abs(T.K[i]) > Math.abs(T.K[bi])) bi = i;
    // (a node on the outside of a bend: the track turns away from its side, at the node and both neighbours)
    const L = T.L, list = e.barList(), Kat = (d) => T.K[Math.round((((d % L) + L) % L) / T.ds) % T.N];
    let n = -1, k = -1, bk = 0, side = 1;
    list.forEach((w, q) => w.pts.forEach((p, j) => { if (j < 1 || j > w.pts.length - 2) return; const a0 = w.pts[j - 1][0], a1 = w.pts[j + 1][0], span = (((a1 - a0) % L) + L) % L, ks = []; for (let u = 0; u <= span; u += T.ds) ks.push(Kat(a0 + u)); const out = span < 200 && ks.every(v => v * w.side > 0.002 && Math.abs(v) < 0.03); const s2 = Math.abs(Kat(p[0])); if (out && s2 > bk) { bk = s2; n = q; k = j; side = w.side; } }));
    bi = Math.round(list[n].pts[k][0] / T.ds) % T.N;
    const w = list[n], p = w.pts[k]; e.view.cx = T.X[bi]; e.view.cz = T.Z[bi]; e.view.scale = 3; e.dirty = true;
    const r = e.canvas.getBoundingClientRect(), [x, y] = e.w2s(...e.barXZ(side, p[0], p[1])), [x2, y2] = e.w2s(...e.barXZ(side, p[0], p[1] + 10));
    return { apex: Math.round(T.D[bi]), side, n, k, node: p, x: r.left + x, y: r.top + y, x2: r.left + x2, y2: r.top + y2 }; });
  console.log('target', JSON.stringify(tgt));
  await pg.waitForTimeout(300);
  await pg.mouse.click(tgt.x, tgt.y); await pg.waitForTimeout(200);
  await pg.mouse.move(tgt.x, tgt.y); await pg.mouse.down(); for (let q = 1; q <= 10; q++) await pg.mouse.move(tgt.x + (tgt.x2 - tgt.x) * q / 10, tgt.y + (tgt.y2 - tgt.y) * q / 10); await pg.mouse.up();
  await pg.waitForTimeout(500);
  // straight? the editor's drawn line between node k-1 .. k+1 vs the chords
  const st = await ev(({ n, k }) => { const e = window.__svgp.editor, w = e.barList()[n], T = e.T, P = w.pts;
    const W = (p) => e.barXZ(w.side, p[0], p[1]), L0 = T.L, U = (d) => (((d - P[0][0]) % L0) + L0) % L0;
    // (the editor's drawn line, only between the two nodes)
    const seg = (a, b) => { const ua = U(P[a][0]), ub = U(P[b][0]), D = { pts: window.__barLine(w, T) }, out = []; for (let u = ua + 0.5; u < ub - 0.5; u += 1) out.push(e.barXZ(w.side, P[0][0] + u, window.__offAt(D, u, L0))); return out; };
    const dev = (A, B, pts) => { let m = 0; for (const [x, z] of pts) { const dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz, t = ((x - A[0]) * dx + (z - A[1]) * dz) / l2; m = Math.max(m, Math.hypot(A[0] + dx * t - x, A[1] + dz * t - z)); } return m; };
    const clear = (a, b) => window.__barLine(w, T).filter(p => U(p[0]) > U(P[a][0]) && U(p[0]) < U(P[b][0])).every(p => p[1] > 0.35);
    // the game's wall on that side, sampled halfway between node k and k+1
    const L = T.L, mid = P[k][0] + ((((P[k + 1][0] - P[k][0]) % L) + L) % L) / 2, i = Math.round(mid / T.ds) % T.N, A = e.A, off = (w.side > 0 ? A.BR : A.BL)[i];
    const gx = T.X[i] + T.RX[i] * off * w.side, gz = T.Z[i] + T.RZ[i] * off * w.side, A0 = W(P[k]), B0 = W(P[k + 1]);
    const dx = B0[0] - A0[0], dz = B0[1] - A0[1], t = ((gx - A0[0]) * dx + (gz - A0[1]) * dz) / (dx * dx + dz * dz), gdev = Math.hypot(A0[0] + dx * t - gx, A0[1] + dz * t - gz);
    return { node: P[k], free: !!(P[k][2] && P[k][2].f), prevFree: !!(P[k - 1][2] && P[k - 1][2].f), devIn: +dev(W(P[k - 1]), W(P[k]), seg(k - 1, k)).toFixed(2), devOut: +dev(W(P[k]), W(P[k + 1]), seg(k, k + 1)).toFixed(2), clearIn: clear(k - 1, k), clearOut: clear(k, k + 1), gameDev: +gdev.toFixed(2) }; }, tgt);
  console.log('after drag', JSON.stringify(st));
  ok(st.free && st.prevFree, 'both stretches beside the moved node run free');
  // (where the straight line would cut across the road, the wall hugs the edge instead: only measured where it's clear)
  ok((!st.clearIn || st.devIn < 0.3) && (!st.clearOut || st.devOut < 0.3) && (st.clearIn || st.clearOut), `they're straight (off the chord by ${st.devIn} / ${st.devOut} m; clear of the road ${st.clearIn} / ${st.clearOut})`);
  ok(st.gameDev < 0.8, `the game's wall is on that straight line (${st.gameDev} m off)`);
  await pg.screenshot({ path: join(out, 'bstraight_1.png') });
  // pull the out handle 15 m further out: the stretch bends away from the chord
  const hd = await ev(({ n, k }) => { const e = window.__svgp.editor, w = e.barList()[n], hs = e.barHandles(w, k), h = hs.find(q => q.end === 'ho'), r = e.canvas.getBoundingClientRect();
    const [x, y] = e.w2s(h.x, h.z), F = e.T, [nx, nz] = e.barXZ(w.side, w.pts[k][0], w.pts[k][1]); const vx = h.x - nx, vz = h.z - nz, l = Math.hypot(vx, vz);
    const [x2, y2] = e.w2s(h.x - vz / l * 12 * w.side * 0 + (h.x - nx) * 0, h.z); return { x: r.left + x, y: r.top + y, n: hs.length }; }, tgt);
  ok(hd.n === 2, `the picked node shows its 2 handles (${hd.n})`);
  const before = await ev(({ n }) => window.__svgp.editor.barLine(window.__svgp.editor.barList()[n]).length, tgt);
  // (12 m further from the track)
  const away = await ev(({ n, k }) => { const e = window.__svgp.editor, w = e.barList()[n], F = e.T, d = w.pts[k][0], i = Math.round(d / F.ds) % F.N, [ax, ay] = e.w2s(0, 0), [bx, by] = e.w2s(F.RX[i] * w.side * 12, F.RZ[i] * w.side * 12); return [bx - ax, by - ay]; }, tgt);
  await pg.mouse.move(hd.x, hd.y); await pg.mouse.down(); for (let q = 1; q <= 8; q++) await pg.mouse.move(hd.x + away[0] * q / 8, hd.y + away[1] * q / 8); await pg.mouse.up(); await pg.waitForTimeout(500);
  const bent = await ev(({ n, k }) => { const e = window.__svgp.editor, T = e.T, w = e.barList()[n], P = w.pts, W = (p) => e.barXZ(w.side, p[0], p[1]), A = W(P[k]), B = W(P[k + 1]), L0 = T.L, U = (d) => (((d - P[0][0]) % L0) + L0) % L0;
    const D = { pts: window.__barLine(w, T) }; let m = 0;
    for (let u = U(P[k][0]) + 0.5; u < U(P[k + 1][0]) - 0.5; u += 1) { const [x, z] = e.barXZ(w.side, P[0][0] + u, window.__offAt(D, u, L0)), dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz, t = ((x - A[0]) * dx + (z - A[1]) * dz) / l2; m = Math.max(m, Math.hypot(A[0] + dx * t - x, A[1] + dz * t - z)); }
    return { ho: P[k][2].ho, hi: P[k][2].hi, bend: +m.toFixed(2) }; }, tgt);
  console.log('after handle', JSON.stringify(bent));
  ok(bent.ho && bent.hi && bent.bend > 0.8 && bent.bend < 15, `the handle bends the stretch (${bent.bend} m off the chord), the other handle turned with it`);
  await pg.screenshot({ path: join(out, 'bstraight_2.png') });
  // undo, then Follow The Track
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(300);
  ok(await ev(({ n, k }) => { const p = window.__svgp.editor.barList()[n].pts[k]; return !(p[2] && p[2].ho); }, tgt), 'undo takes the handle off');
  await ev(({ n, k }) => { const e = window.__svgp.editor; e.barSel = n; e.barNode = k; e.renderNodeTab(); }, tgt);
  await pg.click('#br-follow'); await pg.waitForTimeout(400);
  const fol = await ev(({ n, k }) => { const P = window.__svgp.editor.barList()[n].pts; return { a: P[k - 1].length, b: P[k].length }; }, tgt);
  ok(fol.a === 2 && fol.b === 2, 'Follow The Track puts both stretches back along the track');
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
} finally { await b.close(); server.kill(); }
