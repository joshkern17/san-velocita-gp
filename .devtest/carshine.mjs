// dev: the livery cars lit (.devtest/carshine.html), before (old=1) and after: node .devtest/carshine.mjs <outdir> [car,car,...]
// writes <outdir>/before.png + after.png
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp/carshine'; mkdirSync(out, { recursive: true });
const cars = process.argv[3] || 'm1procar,porsche935,capri,f40,m3gtr,r34gt2,r34,civic,miata,f1gtr';
const PORT = 9700 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
try {
  for (const mode of ['before', 'after']) {
    const pg = await b.newPage(); await pg.setViewportSize({ width: 1680, height: 700 });
    pg.on('console', m => m.type() === 'error' && console.log(mode, m.text().slice(0, 300))); pg.on('pageerror', e => { console.log(mode, 'PAGE ERROR', e.message); fails++; pg.evaluate(() => window.__err = 1).catch(() => {}); });
    await pg.goto(`http://127.0.0.1:${PORT}/.devtest/carshine.html?cars=${cars}${mode === 'before' ? '&old=1' : ''}`);
    await pg.waitForFunction(() => window.done || window.__err, null, { timeout: 120000 });
    await pg.locator('canvas').screenshot({ path: join(out, mode + '.png') });
    console.log('wrote', join(out, mode + '.png'));
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
process.exit(fails ? 1 : 0);
