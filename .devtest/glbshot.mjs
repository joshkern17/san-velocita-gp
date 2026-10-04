// dev: screenshot glbs  node .devtest/glbshot.mjs <out.png> "<query>"
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 900, height: 600 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/glbview.html?${process.argv[3]}`);
  await pg.waitForFunction(() => window.done, null, { timeout: 30000 });
  console.log((await pg.evaluate(() => window.info)).join('\n'));
  await pg.screenshot({ path: process.argv[2] });
} finally { await b.close(); server.kill(); }
