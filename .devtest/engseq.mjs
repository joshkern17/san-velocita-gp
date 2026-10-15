// dev: the engineer's stitched radio answers (vo.js engSeq) play: every [engp] piece decodes, a few answers run
// start to finish through the radio chain (no errors, the engineer's "talking" while they do, and quiet after), and
// how long each one takes.   node .devtest/engseq.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let bad = 0;
try {
  const pg = await b.newPage();
  pg.on('pageerror', e => { bad++; console.log('PAGE ERROR', e.message); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.mode === 'attract', null, { timeout: 60000 }).catch(() => console.log('(no menu background race: going on)')); await pg.waitForTimeout(1500); // (the menu's background race starting stops any voice: after it)
  const r = await pg.evaluate(async () => {
    const vo = await import('/js/vo.js'), au = await import('/js/audio.js'); await vo.voReady();
    au.initAudio();
    const m = await fetch('/assets/voice/manifest.json').then(r => r.json()), ids = Object.keys(m.engp || {});
    const out = { pieces: ids.length, runs: [] };
    const answers = [['engp.s.ahead', 'engp.n.1', 'engp.pt.4', 'engp.quicker'], ['engp.tiresat', 'engp.pct.65', 'engp.about', 'engp.n.4', 'engp.u.laps', 'engp.dropoff', 'engp.rears'],
      ['engp.vs.ahead', 'engp.mostin', 'engp.turn.4', 'engp.pt.3', 'engp.why.early', 'engp.then', 'engp.turn.9', 'engp.pt.1', 'engp.why.thr']];
    for (const a of answers) { const t0 = performance.now(); const p = vo.engSeq(a); let talking = false; for (let k = 0; k < 30 && !talking; k++) { await new Promise(r => setTimeout(r, 100)); talking = vo.voState().eng; } const ok = await p; out.runs.push({ a: a.length, ok, talking, secs: +((performance.now() - t0) / 1000).toFixed(2), quiet: !vo.voState().eng }); }
    return out;
  });
  console.log('pieces in the manifest:', r.pieces);
  for (const x of r.runs) { console.log(`answer of ${x.a} pieces: played ${x.ok} talking ${x.talking} ${x.secs}s quiet after ${x.quiet}`); if (!x.ok || !x.talking) bad++; }
} finally { await b.close(); server.kill(); }
console.log(bad ? `FAILED (${bad})` : 'OK');
process.exit(bad ? 1 : 0);
