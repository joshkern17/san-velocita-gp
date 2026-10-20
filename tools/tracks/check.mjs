// Every real circuit checked the way a player would find it (tools/tracks/checklib.js: the road, crossings, pit lane,
// barriers, the edge, the ground, the scenery), with pictures: the chase camera every 500 m round the lap and at
// each failure. One browser, the circuits one after another. Writes <out>/<id>.json, <out>/<id>-*.jpg and a report
// card for them all, <out>/index.html.
//   node tools/tracks/check.mjs [ids|all] [--out=dir] [--no-shots] [--every=500] [--size=960x540]
// (a heavy circuit, Spa's 15,000 trees, can crash the software renderer at full size: --size=640x360)
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const args = process.argv.slice(2), opt = (k, d) => { const a = args.find(a => a.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const [VW, VH] = opt('size', '960x540').split('x').map(Number);
const OUT = opt('out', join(ROOT, '.devtest/out/trackcheck')), SHOTS = !args.includes('--no-shots'), EVERY = +opt('every', 500);
const index = JSON.parse(readFileSync(join(ROOT, 'tracks/real/index.json'), 'utf8'));
const all = (Array.isArray(index) ? index : index.tracks || Object.values(index)).filter(t => t && t.real).map(t => t.real.id);
const pick = args.filter(a => !a.startsWith('--'));
const ids = !pick.length || pick[0] === 'all' ? all : pick.flatMap(a => a.split(','));
mkdirSync(OUT, { recursive: true });

const PORT = 9300 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
// (a browser of its own for each circuit: one that's crashed, or grown big, never takes the next one down)
let b = null;
const launch = async () => { if (b) await b.close().catch(() => {}); b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); };
const stop = async (code) => { try { if (b) await b.close(); } catch (e) {} server.kill(); process.exit(code); };
let watchdog;
const arm = (s) => { clearTimeout(watchdog); watchdog = setTimeout(() => { console.log(`timed out (${s} s on one circuit)`); stop(1); }, s * 1000); };
try {
  const errors = []; let pg = null;
  const fresh = async () => { await launch(); pg = await b.newPage(); await pg.setViewportSize({ width: VW, height: VH }); await pg.addInitScript(() => { navigator.getGamepads = () => []; }); pg.on('pageerror', e => errors.push(e.message)); };
  for (const id of ids) for (let attempt = 0; attempt < 2; attempt++) try { await one(id); break; } catch (e) { console.log(`${id}: ${e.message.split('\n')[0]}${attempt ? '' : ' (trying again)'}`); }
  async function one(id) {
    await fresh(); arm(300); errors.length = 0;
    const t0 = Date.now();
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(600);
    const started = await pg.evaluate(async (id) => {
      const E = await import('./js/envlib.js'); await E.loadEnvCatalog(); await E.loadEnvModels();
      const R = await import('./js/realtracks.js'); await R.realTracksReady();
      const light = R.realTracks().find(t => t.real.id === id); if (!light) return false;
      const t = await R.hydrateReal(JSON.parse(JSON.stringify(light)));
      t.env.weather = 'clear'; t.env.time = 'day';
      window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu');
      return true;
    }, id);
    if (!started) { console.log(`${id}: not found`); return; }
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.T && window.__svgp.sim.player && window.__svgp.sim.world, null, { timeout: 240000 });
    await pg.waitForTimeout(1200);
    const R = await pg.evaluate(async () => { const C = await import('./tools/tracks/checklib.js'); return C.checkTrack(window.__svgp.sim); });
    R.errors = [...errors]; R.secs = Math.round((Date.now() - t0) / 1000);
    // pictures: the chase camera every EVERY m, and at each failure (round the lap: from behind; elsewhere: from above)
    R.shots = [];
    if (SHOTS) {
      await pg.addStyleTag({ content: '*:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}' });
      const spots = [];
      for (let d = 0; d < R.L; d += EVERY) spots.push({ kind: 'lap', d, label: `${d} m` });
      R.findings.forEach((f, k) => {
        if (!(f.sev === 'fail' || f.what === 'crossing') || spots.filter(s => s.kind !== 'lap').length >= 10) return;
        if (f.d != null) spots.push({ kind: 'chase', d: f.d, label: f.what, f: k }); else if (f.x != null) spots.push({ kind: 'xz', x: f.x, z: f.z, label: f.what, f: k });
      });
      for (const s of spots) {
        await pg.evaluate((s) => {
          const sim = window.__svgp.sim, T = sim.T, N = T.N; sim.paused = true; sim.state = 'racing';
          if (s.kind === 'xz') {
            let bi = 0, bd = Infinity; for (let k = 0; k < N; k++) { const d = Math.hypot(T.X[k] - s.x, T.Z[k] - s.z); if (d < bd) { bd = d; bi = k; } }
            const dx = T.X[bi] - s.x, dz = T.Z[bi] - s.z, l = Math.hypot(dx, dz) || 1, c = sim.camera; sim.updateCamera = () => {};
            c.position.set(s.x + dx / l * (l + 35), T.Y[bi] + 40, s.z + dz / l * (l + 35)); c.lookAt(s.x, T.Y[bi], s.z); c.updateMatrixWorld();
            return;
          }
          const j = ((Math.round((s.d - (s.kind === 'chase' ? 25 : 0)) / T.ds) % N) + N) % N, pl = sim.player, p = pl.phys; pl.idx = j;
          p.place(T.X[j], T.Z[j], Math.atan2(T.FX[j], T.FZ[j])); p.vx = p.vz = 0; p.u = 0;
          sim.updateTracker(pl, true); sim.placeModel(pl, 1); sim.snapCamera(); for (let k = 0; k < 30; k++) sim.updateCamera(0.05);
        }, s);
        await pg.waitForTimeout(450);
        const file = `${id}-${s.kind}-${s.kind === 'xz' ? `${s.x}_${s.z}` : s.d}.jpg`;
        await pg.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 72 });
        R.shots.push({ file, kind: s.kind, d: s.d, label: s.label, f: s.f });
      }
    }
    await pg.evaluate(() => { const s = window.__svgp.sim; if (s && s.dispose) s.dispose(); });
    writeFileSync(join(OUT, `${id}.json`), JSON.stringify(R, null, 1));
    console.log(`\n${R.name} (${id}, ${(R.L / 1000).toFixed(2)} km, ${R.secs} s): ${R.fails} fail, ${R.warns} warn${R.errors.length ? `, ${R.errors.length} page errors` : ''}`);
    for (const f of R.findings) console.log(`  ${f.sev.padEnd(4)} ${f.what}${f.d != null ? ` @${f.d} m` : ''}${f.at ? ` (${f.at})` : ''}${f.len ? ` ${f.len} m` : ''}: ${f.note || ''}`);
    for (const e of R.errors.slice(0, 3)) console.log('  PAGE ERROR', e);
  }
} finally { clearTimeout(watchdog); }
report();
await stop(0);

// the report card: every circuit checked so far (whatever's in OUT), worst first
function report() {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const R = readdirSync(OUT).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(OUT, f), 'utf8'))).sort((a, b) => b.fails - a.fails || b.warns - a.warns);
  const card = (r) => `<section><h2>${esc(r.name)} <small>${(r.L / 1000).toFixed(2)} km · <b class="${r.fails ? 'f' : 'ok'}">${r.fails} fail</b> · ${r.warns} warn</small></h2>
<table>${r.findings.map((f, k) => `<tr class="${f.sev}"><td>${f.sev}</td><td>${esc(f.what)}${f.n ? ` ×${f.n}` : ''}</td><td>${f.d != null ? f.d + ' m' : ''}${f.at ? ` · ${esc(f.at)}` : ''}</td><td>${esc(f.note)}${r.shots.some(s => s.f === k) ? ` <a href="#${esc(r.id)}-${k}">picture</a>` : ''}</td></tr>`).join('')}</table>
<div class="shots">${r.shots.map(s => `<figure id="${s.f != null ? esc(r.id) + '-' + s.f : ''}" class="${s.kind}"><img loading="lazy" src="${esc(s.file)}"><figcaption>${esc(s.label)}${s.d != null && s.kind !== 'lap' ? ` · ${s.d} m` : ''}</figcaption></figure>`).join('')}</div></section>`;
  writeFileSync(join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Track Check</title><style>
body{font:14px/1.4 -apple-system,Helvetica,sans-serif;margin:24px;background:#111;color:#ddd}h2{margin:32px 0 8px}small{color:#999;font-weight:400}
table{border-collapse:collapse;width:100%}td{padding:3px 8px;border-bottom:1px solid #222;vertical-align:top}tr.fail td:first-child,.f{color:#ff5a3c}tr.warn td:first-child{color:#e8b93a}tr.info{color:#888}.ok{color:#5fd38a}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px;margin-top:10px}figure{margin:0}img{width:100%;display:block}figcaption{font-size:12px;color:#aaa}figure.chase figcaption,figure.xz figcaption{color:#ff8a70}a{color:#7ab8ff}
</style><h1>Track Check</h1><p>${R.length} circuits · ${R.reduce((s, r) => s + r.fails, 0)} fails · ${R.reduce((s, r) => s + r.warns, 0)} warnings</p>${R.map(card).join('')}`);
  console.log(`\nreport: ${join(OUT, 'index.html')}`);
}
