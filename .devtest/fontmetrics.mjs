// dev: where each UI font's capitals sit in its line box   node .devtest/fontmetrics.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage();
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 60000, polling: 200 }); await document_fonts(pg);
  await pg.evaluate(() => Promise.all(['SV UI', 'SV Body', 'SV Display', 'SV Num'].map(f => document.fonts.load(`500 100px '${f}'`))));
  console.log(await pg.evaluate(() => ['SV UI', 'SV Body', 'SV Display', 'SV Num'].map(f => {
    const c = document.createElement('canvas').getContext('2d'); c.font = `500 100px '${f}'`;
    const m = c.measureText('HXE'), x = c.measureText('x');
    // em box: ascent+descent; caps from baseline
    return `${f.padEnd(10)} fontAsc ${m.fontBoundingBoxAscent.toFixed(0)} fontDesc ${m.fontBoundingBoxDescent.toFixed(0)} cap ${m.actualBoundingBoxAscent.toFixed(0)} x ${x.actualBoundingBoxAscent.toFixed(0)}  (per 100px)`;
  }).join('\n')));
} finally { await b.close(); server.kill(); }
async function document_fonts(pg) { await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(500); }
