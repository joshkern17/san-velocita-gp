// dev: a fingerprint of the world each real circuit builds (js/world.js buildWorld via race.js buildScenery): every
// mesh's vertices, colors, uvs, indices and instance matrices hashed (rounded to 1 mm / 1e-4), and how long the build
// took. Save one, change world.js, run again with the saved file: any mesh that changed is listed.
//   node .devtest/worldprint.mjs [--root dir] [--save out.json | --against base.json] [ids...]
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const ROOT = opt('--root') || HERE, SAVE = opt('--save'), BASE = opt('--against'), IDS = argv;
const { chromium } = await import(join(HERE, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 9600 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let res;
try {
  const pg = await (await b.newContext({ viewport: { width: 800, height: 450 } })).newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  res = await pg.evaluate(async (ids) => {
    const { cloneTrack } = await import('/js/track.js'); const R = await import('/js/realtracks.js'); const { buildScenery } = await import('/js/race.js');
    const { loadEnvModels } = await import('/js/envlib.js'); await loadEnvModels(); await R.realTracksReady();
    const h32 = (h, v) => Math.imul(h ^ v, 16777619) >>> 0;
    const hashArr = (a, q) => { let h = 2166136261; for (let i = 0; i < a.length; i++) h = h32(h, Math.round(a[i] * q) | 0); return h.toString(16); };
    const out = {};
    const { presetTracks } = await import('/js/track.js');
    const all = [...R.realTracks().map(p => [p.real.id, p]), ...presetTracks().map((p, k) => ['preset' + k, p])];
    for (const [id, p] of all) {
      if (ids.length && !ids.includes(id)) continue;
      const t = p.real ? await R.hydrateReal(cloneTrack(p)) : cloneTrack(p);
      buildScenery(cloneTrack(t)).dispose();
      const a = performance.now(); const S = buildScenery(cloneTrack(t)); const ms = performance.now() - a;
      const meshes = [];
      S.scene.traverse(o => {
        if (!o.isMesh && !o.isInstancedMesh && !o.isPoints && !o.isLine) return;
        o.updateMatrixWorld();
        const g = o.geometry, at = g.attributes, parts = [];
        for (const k of ['position', 'color', 'uv', 'run', 'gpaint']) if (at[k]) parts.push(k[0] + hashArr(at[k].array, k === 'position' ? 1000 : 10000));
        if (g.index) parts.push('i' + hashArr(g.index.array, 1));
        if (o.isInstancedMesh) parts.push('m' + hashArr(o.instanceMatrix.array.slice(0, o.count * 16), 1000));
        parts.push('w' + hashArr(o.matrixWorld.elements, 1000));
        meshes.push((o.name || o.type) + ' ' + parts.join(' '));
      });
      S.dispose();
      out[id] = { ms: Math.round(ms), meshes };
    }
    return out;
  }, IDS);
} finally { try { await b.close(); } catch (e) {} server.kill('SIGKILL'); }
if (SAVE) writeFileSync(SAVE, JSON.stringify(res));
const base = BASE ? JSON.parse(readFileSync(BASE)) : null;
let bad = 0;
for (const [id, r] of Object.entries(res)) {
  let note = `${r.meshes.length} meshes`;
  if (base && base[id]) {
    const A = base[id].meshes, B = r.meshes, diff = [];
    for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) diff.push(i);
    if (diff.length) { bad++; note += `  CHANGED ${diff.length}: ` + diff.slice(0, 4).map(i => `#${i} ${(B[i] || A[i] || '').split(' ')[0]}`).join(', '); }
    else note += '  same';
    note += `  ${base[id].ms} -> ${r.ms} ms`;
  } else note += `  ${r.ms} ms`;
  console.log(id.padEnd(13), note);
}
if (base) console.log(bad ? `${bad} circuits CHANGED` : 'every circuit identical');
process.exit(bad ? 1 : 0);
