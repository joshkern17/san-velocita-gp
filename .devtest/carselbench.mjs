// dev: car select: how long swapping the car on the grid takes, per car of a class (the scroll hitch)
//   .devtest/guard.sh node .devtest/carselbench.mjs [class]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100), cls = process.argv[2] || 'street';
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  const ids = await pg.evaluate(async (cls) => {
    const S = window.__svgp, t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    const { CARS } = await import('/js/cars.js');
    const ids = Object.keys(CARS).filter(k => CARS[k].cls === cls);
    S.settings.car = { ...S.settings.car, chassis: ids[0] };
    S.startRace(t, { mode: 'race', laps: 3, opponents: 5, aiChassis: 'class', grid: 'back', car: S.settings.car, pick: true }, 'menu');
    return ids;
  }, cls);
  await pg.waitForFunction(() => window.__svgp.sim?.state === 'carselect', null, { timeout: 200000, polling: 300 });
  await pg.waitForTimeout(1500);
  if (process.env.PROF) {
    const cdp = await pg.context().newCDPSession(pg); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
    await pg.evaluate((id) => window.__svgp.sim.previewCar({ ...window.__svgp.settings.car, chassis: id }), process.env.PROF);
    const { profile } = await cdp.send('Profiler.stop'); const self = {}, byId = {}; for (const n of profile.nodes) byId[n.id] = n;
    const dt = profile.timeDeltas, cnt = {}; profile.samples.forEach((s, i) => cnt[s] = (cnt[s] || 0) + (dt[i] || 0));
    for (const n of profile.nodes) { const f = n.callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self[k] = (self[k] || 0) + (cnt[n.id] || 0); }
    // inclusive
    const kids = {}; for (const n of profile.nodes) for (const c of n.children || []) kids[c] = n.id;
    const incl = {}; for (const n of profile.nodes) { let t = cnt[n.id] || 0; if (!t) continue; const seen = new Set(); for (let p = n.id; p; p = kids[p]) { const f = byId[p].callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; if (seen.has(k)) continue; seen.add(k); incl[k] = (incl[k] || 0) + t; } }
    console.log('SELF'); Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log((v / 1000).toFixed(0).padStart(6), k));
    console.log('INCL'); Object.entries(incl).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log((v / 1000).toFixed(0).padStart(6), k));
  }
  else for (const pass of [1, 2]) for (const id of ids) {
    const ms = await pg.evaluate((id) => { const S = window.__svgp, t0 = performance.now(); S.sim.previewCar({ ...S.settings.car, chassis: id }); return performance.now() - t0; }, id);
    console.log(`pass ${pass} ${id.padEnd(12)} ${ms.toFixed(0)} ms`);
  }
} finally { await b.close(); server.kill(); }
