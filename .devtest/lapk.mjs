// dev: what each car stat is worth in lap time, per class (for wcareer.js LAP_K). For each car a few copies with one
// stat changed (spec: power, mu, kd, drag, brakeK), each learned afresh on the preset circuits; the clean-lap change
// over the stat change is the weight (1% more of the stat -> x% less lap time).
//   node .devtest/lapk.mjs [class] [cars=3] [tracks=3]     LIMIT=secs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const LIMIT = +(process.env.LIMIT || 900);
let b = null; setTimeout(async () => { console.log(`GAVE UP after ${LIMIT}s`); try { await b?.close(); } catch {} server.kill(); process.exit(2); }, LIMIT * 1000).unref();
b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const cls = process.argv[2] || 'street', nCars = +(process.argv[3] || 3), nT = +(process.argv[4] || 3);
// [name, spec field, factor, how much of the stat that is (+: more of it)]
const VARS = [['power', 'power', 0.95, -0.05], ['grip', 'mu', 0.97, -0.03], ['downforce', 'kd', 1.1, 0.1], ['drag', 'drag', 0.95, -0.05], ['brake', 'brakeK', 1.1, 0.1]];
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  const ids = await pg.evaluate(async ([cls, n]) => { const { CARS } = await import('/js/cars.js'); return Object.keys(CARS).filter(k => CARS[k].cls === cls && CARS[k].spec).slice(0, n); }, [cls, nCars]);
  console.log(cls, 'cars:', ids.join(', '));
  const acc = Object.fromEntries(VARS.map(v => [v[0], []]));
  const T0 = +(process.env.T0 ?? 1); // (from the second circuit: Sakura Pass, a one-way touge, caps several cars at one speed)
  for (let ti = T0; ti < T0 + nT; ti++) for (const id of ids) {
    const r = await pg.evaluate(async ([ti, id, VARS]) => {
      const { presetTracks } = await import('/js/track.js'); const { CARS } = await import('/js/cars.js');
      const t = presetTracks()[ti]; t.env = { ...(t.env || {}), weather: 'clear' };
      const S = window.__svgp.settings; S.car = { ...S.car, chassis: id };
      const prev = window.__svgp.sim; if (prev) prev.setPaused(true);
      window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 1, aiChassis: 'same', car: S.car, extra: { balance: false } }, 'menu');
      for (let k = 0; k < 1500 && !(window.__svgp.sim && window.__svgp.sim !== prev && window.__svgp.sim.lineV); k++) await new Promise(r => setTimeout(r, 100));
      const sim = window.__svgp.sim; if (sim === prev) return null; sim.setPaused(true);
      const parked = sim.cars; sim.cars = [];
      const sp = CARS[id].spec, base = sim.simLap(id, { tyre: 'soft' }), out = { track: t.name, base };
      for (const [name, field, f] of VARS) {
        const vid = `${id}__${name}`; CARS[vid] = { ...CARS[id], spec: { ...sp, [field]: (sp[field] ?? (field === 'brakeK' ? 1.5 : 0)) * f } };
        out[name] = sim.simLap(vid, { tyre: 'soft' }); delete CARS[vid];
      }
      sim.cars = parked; return out;
    }, [ti, id, VARS]);
    if (!r) { console.log('  (no race)'); continue; }
    const line = VARS.map(([name, , , d]) => { const w = -(r[name] / r.base - 1) / d; acc[name].push(w); return `${name} ${w.toFixed(3)}`; }).join('  ');
    console.log(`  ${r.track.padEnd(18)} ${id.padEnd(11)} ${r.base.toFixed(2)}s  ${line}`);
  }
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  console.log(`${cls} WEIGHTS (median; mean): ` + VARS.map(([n]) => `${n} ${med(acc[n]).toFixed(3)}; ${(acc[n].reduce((x, y) => x + y, 0) / acc[n].length).toFixed(3)}`).join(' | '));
} finally { await b.close(); server.kill(); }
