// dev: the livery texture's layout on each livery car (.devtest/liveryuv.html): which faces share texels with another
// surface (red) or are smeared from a sliver of the picture (orange).
//   node .devtest/liveryuv.mjs <outdir> [car,car,...]      writes <outdir>/<car>_uv.png, prints the areas
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const dirArg = (process.argv.find(a => a.startsWith('--dir=')) || '').slice(6), flips = process.argv.includes('--flips'); process.argv = process.argv.filter(a => !a.startsWith('--'));
const out = process.argv[2] || '/tmp/liveryuv'; mkdirSync(out, { recursive: true });
const cars = (process.argv[3] || 'm1procar,porsche935,capri,f40,m3gtr,r34gt2,r34,civic,miata,f1gtr').split(',');
const PORT = 9400 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
try {
  for (const car of cars) await (async () => { // (one page at a time: see .devtest/guard.sh)
    const pg = await b.newPage(); await pg.setViewportSize({ width: 2300, height: 760 });
    pg.on('pageerror', e => { console.log(car, 'PAGE ERROR', e.message); fails++; pg.evaluate(() => window.__err = 1).catch(() => {}); });
    await pg.goto(`http://127.0.0.1:${PORT}/.devtest/liveryuv.html?car=${car}${dirArg ? '&dir=' + dirArg : ''}${flips ? '&flips=1' : ''}`);
    await pg.waitForFunction(() => window.done || window.__err, null, { timeout: 120000 });
    const r = await pg.evaluate(() => window.result); if (!r) return;
    await pg.locator('canvas').screenshot({ path: join(out, car + '_uv.png') });
    console.log(car.padEnd(12), `${r.tris} tris  ${r.area.toFixed(1)} m² paint  shared ${(100 * r.shared / r.area).toFixed(1)}%  stretched ${(100 * r.stretched / r.area).toFixed(1)}%`);
    await pg.close();
  })();
} finally { await b.close(); server.kill(); }
process.exit(fails ? 1 : 0);
