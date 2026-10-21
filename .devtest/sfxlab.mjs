// dev: render the sound lab (.devtest/sfxlab.html): each scenario's mix as a WAV, and a level table.
//   .devtest/guard.sh node .devtest/sfxlab.mjs [outdir] [scenario,scenario,...]
// writes <outdir>/<scenario>.wav and <scenario>_alone.wav (no engine) (default .devtest/out/sfxlab)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || join(ROOT, '.devtest/out/sfxlab'); mkdirSync(out, { recursive: true });
const only = process.argv[3] || '';
const PORT = 9700 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
let fail = 0;
try {
  const pg = await b.newPage();
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fail = 1; pg.evaluate(() => window.__err = 1).catch(() => {}); });
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 300)); });
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/sfxlab.html${only ? '?only=' + only : ''}`);
  await pg.waitForFunction(() => window.done || window.__err, null, { timeout: 150000 });
  const res = await pg.evaluate(() => window.result || {});
  console.log('scenario'.padEnd(18), 'engine(med)', 'new(loudest)', 'new-engine', 'new peak', 'mix peak');
  for (const [k, r] of Object.entries(res)) {
    writeFileSync(join(out, k + '.wav'), Buffer.from(r.wav, 'base64'));
    writeFileSync(join(out, k + '_alone.wav'), Buffer.from(r.alone, 'base64')); // (the new sounds without the engine)
    console.log(k.padEnd(18), String(r.eng.med).padStart(11), String(r.fx.max).padStart(12), String(+(r.fx.max - r.eng.med).toFixed(1)).padStart(10), String(r.fx.peak).padStart(8), String(r.mix.peak).padStart(8));
    console.log('  new, loudest per 0.5 s:', r.fx.half.join(' '));
  }
  console.log('wrote', out);
} finally { await b.close(); server.kill(); }
process.exit(fail);
