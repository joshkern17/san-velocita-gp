// dev: a real circuit's pit lane as the game lays it out: where it starts and ends, which way it was made (mapped /
// own / made up), the ramps, how far out, how steep, the bend of the track along it
//   node .devtest/pitinfo.mjs <id>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const id = process.argv[2] || 'laguna';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 });
  console.log(await pg.evaluate(async (id) => {
    const R = await import('./js/realtracks.js'); await R.realTracksReady();
    const t = await R.hydrateReal(JSON.parse(JSON.stringify(R.realTracks().find(t => t.real.id === id))));
    const TK = await import('./js/track.js'), RO = await import('./js/runoff.js');
    const T = TK.sampleTrack(t), A = TK.analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
    const p = TK.buildPitLane(T, A, t.env, t.osm && t.osm.pitLane, RO.surfaceGrid(t.osm && t.osm.surface), t.dress && t.dress.pit);
    if (!p) return 'no pit lane';
    const N = T.N, ds = T.ds, lines = [`${p.real ? 'mapped' : p.own ? 'own' : 'made up'}, side ${p.side}, ${T.D[p.start].toFixed(0)} -> ${T.D[p.end].toFixed(0)} m (${p.length.toFixed(0)} m), garages ${T.D[p.mainStart].toFixed(0)}-${T.D[p.mainEnd].toFixed(0)}, ramps ${(p.nRamp * ds).toFixed(0)} / ${((p.nRampOut ?? p.nRamp) * ds).toFixed(0)} m, ${p.boxes.length} boxes`];
    for (let k = 0; k <= p.count; k += Math.round(10 / ds)) {
      const i = (p.start + k) % N, j = (i + 1) % N, sl = Math.abs(p.CEN[j] - p.CEN[i]) / ds;
      lines.push(`${T.D[i].toFixed(0).padStart(5)} m  lane ${p.CEN[i].toFixed(1).padStart(5)} m out (edge ${(T.W[i] / 2).toFixed(1)})  ${(Math.atan(sl) * 57.3).toFixed(0).padStart(3)}°  track R ${(1 / Math.max(1e-6, Math.abs(T.K[i]))).toFixed(0)}${p.MAIN[i] ? '  garages' : ''}`);
    }
    return lines.join('\n');
  }, id));
} finally { await b.close(); server.kill(); }
