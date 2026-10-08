// dev: the editor's map of a preset's runoff (and its track tab)   node .devtest/runoffeditor.mjs <out.png> [preset] [zoom] [paint]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 9190 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(async ([name, paint]) => { const { presetTracks, cloneTrack } = await import('/js/track.js'); let t = presetTracks().find(t => t.name === name);
    if (!t) { const R = await import('/js/realtracks.js'); t = await R.hydrateReal(cloneTrack(R.realTracks().find(p => p.real.id === name || p.name === name))); }
    if (paint) t.paint = JSON.parse(paint); window.__svgp.openEditor(t); }, [process.argv[3] || 'Maple Ridge GP', process.env.PAINT || '']);
  await pg.waitForTimeout(2500);
  // STYLE=<runoff style>: clicked on the Circuit tab, as you would
  if (process.env.STYLE) { await pg.evaluate(() => window.__svgp.editor.showTab('track')); await pg.click(`#t-rstyle button[data-v="${process.env.STYLE}"]`); await pg.waitForTimeout(600); }
  // PAINTOUT=<kind>: paint that brush from the track edge out 30 m past the wall on the inside of corner C, then zoom
  if (process.env.PAINTOUT) await pg.evaluate(([kind, C]) => { const e = window.__svgp.editor, T = e.T, A = e.A, c = A.RZ.corners[C];
    const i = Math.round((c.a + c.b) / 2) % T.N, side = c.sg > 0 ? 1 : -1, off = side > 0 ? A.BR[i] : A.BL[i];
    const pts = []; for (let t = T.W[i] / 2 + 2; t < off + 30; t += 2.5) pts.push([T.X[i] + T.RX[i] * side * t, T.Z[i] + T.RZ[i] * side * t]);
    e.track.paint.push({ kind, r: 9, pts }); e.changed(); window.__before = off; window.__after = side > 0 ? e.A.BR[i] : e.A.BL[i]; }, [process.env.PAINTOUT, +(process.env.C || 2)]);
  if (process.env.PAINTOUT) console.log('wall', await pg.evaluate(() => [window.__before, window.__after]));
  const z = +(process.argv[4] || 0);
  if (z) await pg.evaluate(([z, C]) => { const e = window.__svgp.editor, T = e.T, c = e.A.RZ.corners[C] || e.A.RZ.corners[0]; const m = Math.round((c.a + c.b) / 2) % T.N; e.view.cx = T.X[m]; e.view.cz = T.Z[m]; e.view.scale = z; e.dirty = true; }, [z, +(process.env.C || 2)]);
  if (process.env.TAB) await pg.evaluate((t) => { const e = window.__svgp.editor; e.showTab ? e.showTab(t) : 0; e.renderPanels && e.renderPanels(); }, process.env.TAB);
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: process.argv[2] });
} finally { await b.close(); server.kill(); }
