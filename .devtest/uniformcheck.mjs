// dev: how cleanly decals lie on the racer's kit (.devtest/uniformcheck.html does the measuring), scored like the cars.
//   node .devtest/uniformcheck.mjs <outdir> racer [test,test,...] [--base=<old outdir>] [--chars=<other characters.js>]
// Per car: each test decal painted alone, seven views, and in each picture the decal pixels that are spatter (cut-off
// shreds), ragged (saw-tooth edge) or holes (paint it missed inside its outline), as per-mille of the decal's area.
// Writes <outdir>/<car>.json and <outdir>/<car>/<test>_<view>.png (marked: spatter yellow, ragged cyan, holes red)
// for every picture with something wrong. With --base, prints the change from an earlier run beside each number.
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const args = process.argv.slice(2).filter(a => !a.startsWith('--')), flag = (k) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const out = args[0] || '/tmp/liverycheck'; mkdirSync(out, { recursive: true });
// (the livery cars, not the open-wheel F1: it has its own painter, glbcar.js)
const cars = (args[1] || 'racer').split(',');
const tests = args[2] || '', baseDir = flag('base');
const PORT = 9500 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const all = {};
try {
  const queue = [...cars];
  await Promise.all([0].map(async () => { // (one page at a time: see .devtest/guard.sh)
    for (let car; (car = queue.shift());) {
      const pg = await b.newPage();
      pg.on('pageerror', e => { console.log(car, 'PAGE ERROR', e.message); fails++; pg.evaluate(() => window.__err = 1).catch(() => {}); });
      await pg.goto(`http://127.0.0.1:${PORT}/.devtest/uniformcheck.html?car=${car}${tests ? '&tests=' + tests : ''}${flag('face') ? '&face=' + flag('face') : ''}${flag('dir') ? '&dir=' + flag('dir') : ''}${flag('g') ? '&g=' + flag('g') : ''}${flag('chars') ? '&chars=' + flag('chars') : ''}`);
      await pg.waitForFunction(() => window.done || window.__err, null, { timeout: 120000 });
      const { result, shots } = await pg.evaluate(() => ({ result: window.result, shots: window.shots }));
      await pg.close();
      if (!result) continue;
      all[car] = result; writeFileSync(join(out, car + '.json'), JSON.stringify(result, null, 1));
      mkdirSync(join(out, car), { recursive: true });
      for (const [k, url] of Object.entries(shots)) writeFileSync(join(out, car, k + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    }
  }));
} finally { await b.close(); server.kill(); }
// per-mille of the decal's area over all views
const score = (r) => { const s = { spatter: 0, ragged: 0, holes: 0 }; let a = 0; for (const t of Object.values(r.tests)) for (const v of Object.values(t.views)) { a += v.area; for (const k in s) s[k] += v[k]; } for (const k in s) s[k] = a ? 1000 * s[k] / a : 0; return s; };
const pad = (s, n) => String(s).padStart(n);
console.log('car          spatter  ragged   holes   (per-mille of decal pixels, all tests + views)');
for (const car of cars) {
  if (!all[car]) { console.log(car.padEnd(12), 'no result'); continue; }
  const s = score(all[car]), old = baseDir && existsSync(join(baseDir, car + '.json')) ? score(JSON.parse(readFileSync(join(baseDir, car + '.json')))) : null;
  const cell = (k) => pad(s[k].toFixed(1), 7) + (old ? ` (${s[k] - old[k] >= 0 ? '+' : ''}${(s[k] - old[k]).toFixed(1)})` : '');
  console.log(car.padEnd(12), cell('spatter'), cell('ragged'), cell('holes'));
  // the worst tests
  const worst = Object.entries(all[car].tests).map(([t, r]) => { const v = Object.values(r.views); const a = v.reduce((x, y) => x + y.area, 0) || 1; return [t, 1000 * v.reduce((x, y) => x + y.spatter + y.ragged + y.holes, 0) / a]; }).sort((x, y) => y[1] - x[1]).slice(0, 3);
  console.log('             worst:', worst.map(([t, v]) => `${t} ${v.toFixed(0)}`).join(', '));
}
process.exit(fails ? 1 : 0);
