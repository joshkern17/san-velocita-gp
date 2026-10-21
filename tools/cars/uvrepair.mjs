// Gives a livery car's faces texels of their own (tools/cars/uvrepair.html says how and why), without changing its look.
//   node tools/cars/uvrepair.mjs <in.glb> [out.glb]        (out defaults to in; run after any re-export of a livery car)
//   node tools/cars/uvrepair.mjs --check <a.glb> [b.glb...] (writes nothing; exit 1 if any of them needs repairing)
// Prints what it moved. Safe to run again: a repaired car comes out unchanged.
import { spawn } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const check = process.argv.includes('--check'), files = process.argv.slice(2).filter(a => a !== '--check').map(f => resolve(f));
const src = files[0], dst = files[1] || files[0];
const PORT = 9200 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
let code = 0;
try {
  const pg = await b.newPage(); pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); code = 1; });
  await pg.goto(`http://127.0.0.1:${PORT}/tools/cars/uvrepair.html`); await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
  if (check) for (const f of files) {
    const r = await pg.evaluate((b64) => window.repair(b64), readFileSync(f).toString('base64'));
    const { insideOut = 0, shared = 0, stretched = 0, plain = 0 } = r.report;
    console.log(r.report.changed ? 'NEEDS REPAIR' : 'ok          ', f.split('/').pop(), r.report.changed ? `(inside-out ${insideOut}, shared ${shared}, stretched ${stretched}, collapsed ${plain})` : '');
    if (r.report.changed) code = 1;
  } else {
    // (again on its own output until nothing's left: faces moved to the strip can leave a sliver next door to tidy)
    let b64 = readFileSync(src).toString('base64'), any = false;
    for (let pass = 0; pass < 3; pass++) {
      const r = await pg.evaluate((b) => window.repair(b), b64);
      console.log(JSON.stringify(r.report));
      if (!r.glb) break;
      b64 = r.glb; any = true;
    }
    if (any) { writeFileSync(dst, Buffer.from(b64, 'base64')); console.log('wrote', dst); }
    else if (dst !== src) { writeFileSync(dst, readFileSync(src)); console.log('unchanged, copied to', dst); }
  }
} catch (e) { console.log(e.message); code = 1; } finally { await b.close(); server.kill(); }
process.exit(code);
