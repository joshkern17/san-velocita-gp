// dev: node .devtest/liveryprobe.mjs <car> <x0,x1,y0,y1,z0,z1>
import { spawn } from 'child_process'; import { dirname, join } from 'path'; import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 9300 + Math.floor(Math.random() * 100), server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try { const pg = await b.newPage(); pg.on('pageerror', e => console.log('ERR', e.message)); await pg.goto(`http://127.0.0.1:${PORT}/.devtest/liveryprobe.html?car=${process.argv[2]}&box=${process.argv[3]}${process.argv[4] ? '&' + process.argv[4] : ''}`); await pg.waitForFunction(() => window.done, null, { timeout: 90000 }); console.log(JSON.stringify(await pg.evaluate(() => window.out), null, 1)); } finally { await b.close(); server.kill(); }
