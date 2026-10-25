// dev: the elevation profile's zoom, used like a player: scroll in round a node, Alt + scroll for height, right-drag
// pan, drag a node while zoomed, double-click back to the whole lap.   node .devtest/edprofzoom.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
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
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async () => { const m = await import('./js/track.js'); window.__svgp.openEditor(m.presetTracks()[0]); }); await pg.waitForTimeout(2500);
  const ev = (fn, a) => pg.evaluate(fn, a);
  
  const box = await (await pg.$('#ed-profile')).boundingBox();
  ok(box && box.height > 40, `profile on screen (${box && Math.round(box.width)}x${box && Math.round(box.height)})`);
  await pg.screenshot({ path: join(out, 'prof_full.png'), clip: box });
  const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.6;
  await pg.mouse.move(cx, cy);
  const d0 = await ev(x => window.__svgp.editor.profileD(x), box.width * 0.5);
  for (let i = 0; i < 8; i++) { await pg.mouse.wheel(0, -60); await pg.waitForTimeout(40); }
  let v = await ev(() => window.__svgp.editor.profView()), L = await ev(() => window.__svgp.editor.profLen());
  const d1 = await ev(x => window.__svgp.editor.profileD(x), box.width * 0.5);
  ok(v.d1 - v.d0 < L / 5, `scroll zooms in (${Math.round(v.d1 - v.d0)} of ${Math.round(L)} m)`);
  ok(Math.abs(d1 - d0) < 3, `the spot under the cursor stays put (${d0.toFixed(1)} -> ${d1.toFixed(1)})`);
  await pg.keyboard.down('Alt'); for (let i = 0; i < 5; i++) { await pg.mouse.wheel(0, -60); await pg.waitForTimeout(40); } await pg.keyboard.up('Alt');
  const v2 = await ev(() => window.__svgp.editor.profView());
  ok(v2.e1 - v2.e0 < v.e1 - v.e0, `Alt + scroll zooms the height (${(v.e1 - v.e0).toFixed(1)} -> ${(v2.e1 - v2.e0).toFixed(1)} m)`);
  await pg.screenshot({ path: join(out, 'prof_zoom.png'), clip: box });
  await pg.mouse.down({ button: 'right' }); await pg.mouse.move(cx - 150, cy, { steps: 5 }); await pg.mouse.up({ button: 'right' });
  const v3 = await ev(() => window.__svgp.editor.profView());
  ok(v3.d0 > v2.d0 || v2.d1 >= L - 0.1, `right-drag pans (${Math.round(v2.d0)} -> ${Math.round(v3.d0)} m)`);
  // drag the nearest node while zoomed
  const nd = await ev(() => { const e = window.__svgp.editor, v = e.profView(); const i = e.track.points.findIndex((p, k) => e.nodeD[k] > v.d0 && e.nodeD[k] < v.d1); return i < 0 ? null : { i, x: e.profileX(e.nodeD[i]), y: e.profileY(e.track.points[i].e), ev: e.track.points[i].e }; });
  if (nd) {
    await pg.mouse.move(box.x + nd.x, box.y + nd.y); await pg.mouse.down(); await pg.mouse.move(box.x + nd.x, box.y + nd.y - 30, { steps: 4 }); await pg.mouse.up();
    const e2 = await ev(i => window.__svgp.editor.track.points[i].e, nd.i);
    ok(e2 > nd.ev && e2 - nd.ev < 8, `node drag while zoomed is fine-grained (${nd.ev} -> ${e2} m)`);
  } else ok(false, 'a node in view');
  await pg.mouse.dblclick(cx, cy); await pg.waitForTimeout(100);
  ok(await ev(() => window.__svgp.editor.pz === null), 'double-click fits the whole lap again');
} finally { await b.close(); server.kill(); }
process.exit(fails ? 1 : 0);
