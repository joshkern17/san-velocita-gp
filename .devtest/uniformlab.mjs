// dev: the uniform lab (.devtest/uniformlab.html): stress-test decals on the racer's kit, eight views.
//   node .devtest/uniformlab.mjs <outdir> [name] [set,set,...] [views] [extra query]
// writes <outdir>/<car>.png
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp/liverylab'; mkdirSync(out, { recursive: true });
const cars = (process.argv[3] || 'racer').split(',');
const sets = process.argv[4] || 'grid,stripe,team', views = process.argv[5] || '', extra = process.argv[6] || '';
const PORT = 9700 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
try {
  for (const car of cars) await (async () => { // (one page at a time: see .devtest/guard.sh)
    const pg = await b.newPage(); await pg.setViewportSize({ width: 3200, height: 1100 });
    pg.on('console', m => console.log(car, m.type(), m.text().slice(0, 300))); pg.on('pageerror', e => { console.log(car, 'PAGE ERROR', e.message); fails++; pg.evaluate(() => window.__err = 1).catch(() => {}); });
    await pg.goto(`http://127.0.0.1:${PORT}/.devtest/uniformlab.html?set=${sets}${views ? '&views=' + views : ''}${extra}`);
    await pg.waitForFunction(() => window.done || window.__err, null, { timeout: 90000 });
    await pg.locator('canvas').screenshot({ path: join(out, car + '.png') });
    console.log('wrote', join(out, car + '.png'));
    await pg.close();
  })();
} finally { await b.close(); server.kill(); }
process.exit(fails ? 1 : 0);
