// dev: screenshots of the opening's prologue  node .devtest/proshot.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '.';
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const W = (ms) => new Promise(r => setTimeout(r, ms));
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && console.log('ERR', m.text()));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 60000 }); await W(1000);
  await pg.evaluate(() => __svgp.dbg.openOpening());
  await pg.waitForFunction(() => __svgp.dbg.opening.stage === 'prologue', null, { timeout: 120000 });
  const O = (f, a) => pg.evaluate(f, a);
  const shot = async (n) => { await W(900); await pg.screenshot({ path: join(OUT, n + '.png') }); console.log('shot', n); };
  const steps = (await import('file://' + process.argv[3])).default;
  await steps(O, shot, W);
} finally { await b.close(); server.kill(); }
