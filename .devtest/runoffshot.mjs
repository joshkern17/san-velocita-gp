// dev: photograph the runoff at a track's corners   node .devtest/runoffshot.mjs '<query>' <out.png>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8990 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1300, height: 1100 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message)); pg.on('console', m => m.type() === 'error' && console.log('ERR', m.text()));
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/runoff.html?${process.argv[2] || ''}`);
  await pg.waitForFunction(() => window.done, null, { timeout: 180000 });
  await pg.locator('canvas').first().screenshot({ path: process.argv[3] || '/tmp/runoff.png' });
} finally { await b.close(); server.kill(); }
