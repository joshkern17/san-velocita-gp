// dev: the tire sound (audio.js TyreVoice) in a real test drive with sound on: a pad driver pushing past the plan
// (slides, run-offs), stepped at 60 fps. The squeal level is its target from the inputs (the smoothing and tiring run
// on the audio clock, which this stepped test outruns). Prints how often the squeal is on, the surfaces under the wheels, the loops
// loaded, and any page errors.
//   .devtest/guard.sh node .devtest/tyrecheck.mjs [car] [seconds] [push]   (push: the plan's speed x, default 1.12)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const id = process.argv[2] || 'm1procar', secs = +(process.argv[3] || 30), push = +(process.argv[4] || 1.12);
let errs = 0;
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => { errs++; console.log('PAGE ERROR', e.message); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async (id) => {
    (await import('/js/audio.js')).initAudio();
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
    window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: window.__svgp.settings.car }, 'menu');
  }, id);
  await pg.waitForFunction(() => window.__svgp.screen === 'hud' && window.__svgp.sim && window.__svgp.sim.state === 'racing', null, { timeout: 60000 }).catch(e => console.log('wait', e.message));
  await pg.waitForTimeout(1500); // (the loops decoding)
  const log = await pg.evaluate(({ secs, push }) => {
    const sim = window.__svgp.sim, car = sim.player, p = car.phys, T = sim.T, V = sim.tyres && sim.tyres[0];
    if (!V || !V.out) return ['NO TYRE VOICE (audio not started?)'];
    const R = { n: 0, on: 0, lock: 0, spin: 0, wheels: {}, qMax: 0, tiredMax: 0 };
    const o = V.update.bind(V);
    V.update = (s) => { o(s); R.n++; if (V.on) R.on++; if (s.lockF || s.lockR) R.lock++; if (s.spin > 0.05) R.spin++; for (const k of s.wheels || ['(none)']) R.wheels[k] = (R.wheels[k] || 0) + 1; R.qMax = Math.max(R.qMax, V.q); const g = Math.max((s.gripF || 0) * 0.92, s.gripR || 0), w = V.on ? Math.max(0, Math.min(1, (g - 0.97) / 0.5)) : 0, lv = w * Math.sqrt(w); R.lv = (R.lv || 0) + lv; if (lv > 0.05) R.a = (R.a || 0) + 1; if (lv > 0.2) R.b = (R.b || 0) + 1; if (lv > 0.5) R.c = (R.c || 0) + 1; R.tiredMax = Math.max(R.tiredMax, V.tired); };
    for (let f = 0; f < secs * 60; f++) {
      const i = car.idx, la = (i + Math.round((8 + p.speed * 0.35) / T.ds)) % T.N, off = sim.line[la];
      const tx = T.X[la] + T.RX[la] * off, tz = T.Z[la] + T.RZ[la] * off, dx = tx - p.x, dz = tz - p.z;
      const left = dx * Math.cos(p.h) - dz * Math.sin(p.h), fwd = dx * Math.sin(p.h) + dz * Math.cos(p.h);
      const sx = Math.max(-1, Math.min(1, -Math.atan2(left, fwd) * 2.5 + (p.beta || 0) * 1.2)), steer = Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
      const vt = sim.lineV[i] * push, vt2 = sim.lineV[(i + Math.round(25 / T.ds)) % T.N] * push;
      const thr = p.speed < Math.min(vt, vt2 + 6) ? 1 : 0, brk = p.speed > Math.min(vt, vt2 + 6) + 2 ? 1 : 0;
      sim.update(1 / 60, { steer, throttle: thr, brake: brk, handbrake: 0, analog: true, pad: true, lag: 0.05 }, {});
    }
    const pc = (x) => (100 * x / Math.max(1, R.n)).toFixed(0) + '%';
    const loaded = Object.entries(V.loops).filter(([, l]) => l.src).map(([k]) => k);
    return [`${R.n} frames | squeal on ${pc(R.on)} | q max ${R.qMax.toFixed(2)} | tired max ${R.tiredMax.toFixed(2)} | lock ${pc(R.lock)} spin ${pc(R.spin)}`,
      `squeal target level (0..1, before smoothing / tiring): mean ${(R.lv / R.n).toFixed(3)} | >0.05 ${pc(R.a || 0)} >0.2 ${pc(R.b || 0)} >0.5 ${pc(R.c || 0)}`, `wheels ${JSON.stringify(R.wheels)}`, `loops loaded (${loaded.length}/${Object.keys(V.loops).length}): ${loaded.join(' ')}`];
  }, { secs, push });
  log.forEach(l => console.log(l));
} finally { await b.close(); server.kill(); }
console.log(errs ? `${errs} page errors` : 'no page errors');
process.exit(errs ? 1 : 0);
