// dev: walk -> jog on the right trigger (Home Garage > Walk Around): a fake pad whose RT eases 0 -> 1 -> 0 while W is
// held; logs speed and the walk/jog weights and phases, screenshots to argv[2].   node .devtest/jog.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] }); // (uncapped: hundreds of fps, like a 120 Hz screen and faster; 60 hid a bug)
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => {
    window.__rt = 0; window.__ly = 0;
    const pad = () => ({ connected: true, index: 0, id: 'fake pad', mapping: 'standard', timestamp: performance.now(),
      axes: [0, window.__ly, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 7 && window.__rt > 0.5, value: i === 7 ? window.__rt : 0 })) });
    navigator.getGamepads = () => [pad()];
  });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__svgp.dbg.openHomeView());
  await pg.waitForFunction(() => window.__svgp.screen === 's-homeview' && /^home:/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 20000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(() => window.__svgp.dbg.startWalk());
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 20000 }); await pg.waitForTimeout(800);
  const st = () => pg.evaluate(() => { const w = window.__svgp.dbg.walk, me = w.me, a = me.action, j = me._pair;
    const ph = (x) => x ? +(x.time / x.getClip().duration % 1).toFixed(2) : null;
    return { rt: window.__rt, speed: +w.speed.toFixed(2), clip: me.clip, walk: a && +a.getEffectiveWeight().toFixed(2), jog: j && +j.getEffectiveWeight().toFixed(2), phase: [ph(a), ph(j)], pos: w.pos.toArray().map(v => +v.toFixed(2)) }; });
  // walk in from the door, down the room (the long way), with the stick
  await pg.evaluate(() => { window.__ly = -1; });
  for (let i = 0; i < 4; i++) { await pg.waitForTimeout(150); console.log('walk', JSON.stringify(await st())); }
  await pg.screenshot({ path: join(out, 'jog-1-walk.png') });
  for (const v of [0.25, 0.5, 0.75, 1]) { await pg.evaluate(v => { window.__rt = v; }, v); await pg.waitForTimeout(200); console.log('rt', JSON.stringify(await st())); if (v === 0.5) await pg.screenshot({ path: join(out, 'jog-2-half.png') }); }
  await pg.waitForTimeout(300); console.log('jog', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'jog-3-jog.png') });
  await pg.evaluate(() => { window.__rt = 0; }); for (let i = 0; i < 3; i++) { await pg.waitForTimeout(120); console.log('let go', JSON.stringify(await st())); }
  await pg.evaluate(() => { window.__ly = 0; }); for (let i = 0; i < 3; i++) { await pg.waitForTimeout(150); console.log('stop', JSON.stringify(await st())); }
} finally { await b.close(); server.kill(); }
