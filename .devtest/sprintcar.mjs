// dev: node .devtest/sprintcar.mjs [out.png]  (run through .devtest/guard.sh): renders .devtest/sprintcar.html, prints its report
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp/sprintcar.png', PORT = 9300 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
try {
  const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message)); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/sprintcar.html${process.env.WING ? '?wing=1' : ''}`); await pg.waitForFunction(() => window.done, null, { timeout: 90000 });
  console.log(JSON.stringify(await pg.evaluate(() => window.report), null, 1));
  await (await pg.$('canvas'))?.screenshot({ path: out });
} finally { await b.close(); server.kill(); }
