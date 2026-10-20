// dev: what a car finds at and past a real track's edge (road widths, curbs, the runoff's surface 0.5/1.5/3 m out),
// for comparing two versions of a track:  node .devtest/edgegrip.mjs <a.json> [b.json]   (paths under the repo)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const kill = setTimeout(() => { b.close(); server.kill(); process.exit(1); }, 90000);
try {
  const pg = await b.newPage();
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  for (const f of process.argv.slice(2)) {
    const r = await pg.evaluate(async (f) => {
      const t = await (await fetch('/' + f)).json();
      const TK = await import('./js/track.js'), RO = await import('./js/runoff.js');
      const T = TK.sampleTrack(t), A = TK.analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
      const L = RO.runoffLayout(T, A, t), K = ['nat', 'paved', 'gravel', 'grass'];
      const w = [...T.W].sort((a, b) => a - b), q = p => w[Math.floor(p * (w.length - 1))].toFixed(1);
      const out = { L: T.L.toFixed(0), width: `min ${q(0)} med ${q(0.5)} max ${q(1)}`, kerb: 0 };
      for (const m of [0.5, 1.5, 3]) out[m + 'm'] = {};
      for (let i = 0; i < T.N; i++) for (const side of [-1, 1]) {
        const kw = TK.kerbW(A, i, side); if (kw > 0.05) out.kerb++;
        for (const m of [0.5, 1.5, 3]) { const o = out[m + 'm']; const k = m < kw ? 'kerb' : K[RO.runoffKind(L, i, side < 0 ? 0 : 1, m)] || '?'; o[k] = (o[k] || 0) + 1; }
      }
      const n = T.N * 2; out.kerb = (100 * out.kerb / n).toFixed(0) + '%';
      for (const m of [0.5, 1.5, 3]) for (const k in out[m + 'm']) out[m + 'm'][k] = (100 * out[m + 'm'][k] / n).toFixed(0) + '%';
      return out;
    }, f);
    console.log(f, JSON.stringify(r));
  }
} finally { clearTimeout(kill); await b.close(); server.kill(); }
