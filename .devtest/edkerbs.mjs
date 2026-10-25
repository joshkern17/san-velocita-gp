// dev: the Circuit Designer's CURBS tool, used like a player: open a circuit, pick CURBS, drag a new curb along an
// edge with the mouse, click it, make it a tapered sausage, then drive past it (chase shot)
//   node .devtest/edkerbs.mjs <outdir> [id=zandvoort] [at=m along the lap]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', id = process.argv[3] || 'zandvoort', AT = +(process.argv[4] || 1000);
const PORT = 9300 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async (id) => { const { cloneTrack } = await import('/js/track.js'); const R = await import('/js/realtracks.js'); await R.realTracksReady();
    const t = await R.hydrateReal(cloneTrack(R.realTracks().find(p => p.real.id === id))); window.__svgp.openEditor(t); }, id);
  await pg.waitForTimeout(2500);
  await pg.click('#ed-tools [data-tool="kerbs"]');
  // frame the spot, and where its right edge is on screen
  const pts = await pg.evaluate((AT) => { const e = window.__svgp.editor, T = e.T, i0 = Math.round(AT / T.ds); e.view.cx = T.X[i0]; e.view.cz = T.Z[i0]; e.view.scale = 5; e.dirty = true;
    const r = e.canvas.getBoundingClientRect(), at = (i) => { const s = T.W[i] / 2 + 0.6; const [x, y] = e.w2s(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s); return [r.left + x, r.top + y]; };
    return [at(i0 - 10), at(i0), at(i0 + 10)]; }, AT);
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: join(out, 'edk_0.png') });
  // drag a new curb along the edge
  await pg.mouse.move(...pts[0]); await pg.mouse.down();
  for (let k = 1; k <= 20; k++) { const f = k / 20, p = f < 0.5 ? [pts[0][0] + (pts[1][0] - pts[0][0]) * f * 2, pts[0][1] + (pts[1][1] - pts[0][1]) * f * 2] : [pts[1][0] + (pts[2][0] - pts[1][0]) * (f - 0.5) * 2, pts[1][1] + (pts[2][1] - pts[1][1]) * (f - 0.5) * 2]; await pg.mouse.move(...p); }
  await pg.mouse.up(); await pg.waitForTimeout(600);
  console.log('after drag:', await pg.evaluate(() => { const e = window.__svgp.editor; return JSON.stringify({ sel: e.kerbSel, k: e.kerbList()[e.kerbSel], n: e.kerbList().length, own: e.kerbsOwn() }); }));
  // make it a blue / white sausage, tapered 5 m
  await pg.click('#kb-type button[data-v="sausage"]'); await pg.click('#kb-style button[data-v="bw"]');
  await pg.evaluate(() => { for (const [id, v] of [['kb-tin', 5], ['kb-tout', 5], ['kb-w', 1.6]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); } });
  await pg.waitForTimeout(800);
  console.log('edited:', await pg.evaluate(() => { const e = window.__svgp.editor; return JSON.stringify(e.kerbList()[e.kerbSel]); }));
  await pg.screenshot({ path: join(out, 'edk_1.png') });
  // undo / redo keep it
  await pg.keyboard.press('Control+z'); await pg.keyboard.press('Control+Shift+z');
  console.log('after undo/redo:', await pg.evaluate(() => { const e = window.__svgp.editor; return e.kerbList().filter(k => k.type === 'sausage').length; }));
  // drive past it
  await pg.evaluate(async (AT) => { const e = window.__svgp.editor, t = JSON.parse(JSON.stringify(e.track)); window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu'); }, AT);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player, null, { timeout: 120000 }); await pg.waitForTimeout(1500);
  await pg.evaluate((AT) => { const s = window.__svgp.sim, T = s.T, N = T.N, j = (Math.round((AT - 25) / T.ds) + N) % N, pl = s.player, p = pl.phys;
    s.paused = true; s.state = 'racing'; pl.idx = j; const o = T.W[j] / 2 - 2.5;
    p.place(T.X[j] + T.RX[j] * o, T.Z[j] + T.RZ[j] * o, Math.atan2(T.FX[j], T.FZ[j])); p.vx = p.vz = 0; p.u = 0;
    s.updateTracker(pl, true); s.placeModel(pl, 1); s.snapCamera(); for (let k = 0; k < 30; k++) s.updateCamera(0.05); }, AT);
  await pg.addStyleTag({ content: '*:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}' });
  await pg.waitForTimeout(1000);
  await pg.screenshot({ path: join(out, 'edk_2.png') });
} finally { await b.close(); server.kill(); }
