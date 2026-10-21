// dev: drive the real game with a fake controller and log the player's car (slide angle, yaw, aids)
//   node .devtest/padrun.mjs [car] [seconds]   (Auburn, Standard aids; AIDS='{"tc":0}' to change them, TR=1 to trace,
//   ROOT=<another checkout> to drive that one: e.g. a worktree of an older commit, to compare)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', secs = +(process.argv[3] || 14);
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  await pg.addInitScript(() => {
    window.__pad = { steer: 0, thr: 0, brk: 0 };
    const btn = (v) => ({ pressed: v > 0.5, touched: v > 0, value: v });
    navigator.getGamepads = () => [{ id: 'fake', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
      axes: [window.__pad.steer, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => btn(i === 7 ? window.__pad.thr : i === 6 ? window.__pad.brk : 0)) }];
  });
  if (process.env.AIDS) await pg.addInitScript((a) => { window.__aids = JSON.parse(a); }, process.env.AIDS);
  if (process.env.NOISE) await pg.addInitScript((n) => { window.__noise = +n; }, process.env.NOISE);
  if (process.env.OLD) await pg.addInitScript(() => { globalThis.__padOld = 1; });
  if (process.env.TR) await pg.addInitScript(() => { window.__TR = 1; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async (id) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
    window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: window.__svgp.settings.car }, 'menu');
  }, id);
  await pg.waitForFunction(() => window.__svgp.screen === 'hud' && window.__svgp.sim && window.__svgp.sim.state === 'racing', null, { timeout: 60000 }).catch(e => console.log('wait', e.message));
  const log = await pg.evaluate((secs) => {
    // (stepped here, synchronously, with no rendering: the race at real speed whatever the machine)
    const sim = window.__svgp.sim, car = sim.player, p = car.phys, T = sim.T, out = [];
    if (window.__aids) p.setAids({ ...p.aidBase, ...window.__aids });
    out.push(`aids ${JSON.stringify(p.aid)} auto ${p.auto} tyre ${p.tyre.c}`);
    let slideT = 0, swings = 0, last = 0, maxB = 0, offT = 0, lapT = 0;
    // (on the straights only: the track's heading changes < 4° over the next 80 m)
    let sT = 0, sB2 = 0, sMax = 0, sSw = 0, sLast = 0;
    const hd = (k) => Math.atan2(T.X[(k + 1) % T.N] - T.X[k], T.Z[(k + 1) % T.N] - T.Z[k]);
    const st = { lag: 0.05, curve: 1.6, dz: 0.12 }; let nz = 0;
    for (let f = 0; f < secs * 60; f++) {
      const t = f / 60, i = car.idx, la = (i + Math.round((8 + p.speed * 0.35) / T.ds)) % T.N, off = sim.line[la];
      const tx = T.X[la] + T.RX[la] * off, tz = T.Z[la] + T.RZ[la] * off, dx = tx - p.x, dz = tz - p.z;
      const left = dx * Math.cos(p.h) - dz * Math.sin(p.h), fwd = dx * Math.sin(p.h) + dz * Math.cos(p.h);
      // a pad driver: steers for the line ahead (and counter-steers what it sees), floors it below the plan, brakes over
      // (NOISE=x: a thumb's wobble on top, ±x of stick, smoothed to a few Hz)
      nz += ((Math.random() * 2 - 1) * (window.__noise || 0) - nz) * 0.15;
      let sx = Math.max(-1, Math.min(1, -Math.atan2(left, fwd) * 2.5 + (p.beta || 0) * 1.2 + nz));
      const steer = Math.sign(sx) * Math.pow(Math.abs(sx), st.curve);
      const vt = sim.lineV[i] * 0.97, la2 = (i + Math.round(25 / T.ds)) % T.N, vt2 = sim.lineV[la2] * 0.97;
      const thr = p.speed < Math.min(vt, vt2 + 6) ? 1 : 0, brk = p.speed > Math.min(vt, vt2 + 6) + 2 ? 1 : 0;
      sim.update(1 / 60, { steer, throttle: thr, brake: brk, handbrake: 0, analog: true, pad: true, lag: st.lag }, {});
      const b = p.beta || 0; maxB = Math.max(maxB, Math.abs(b)); if (Math.abs(b) > 0.087) slideT += 1 / 60;
      const sg = Math.sign(b); if (Math.abs(b) > 0.05 && sg !== last) { if (last) swings++; last = sg; }
      if (!car.onRoad) offT += 1 / 60;
      { let dh = 0; const h0 = hd(i); for (let k = 1, n = Math.round(80 / T.ds); k <= n; k += 4) { let d = hd((i + k) % T.N) - h0; d = Math.atan2(Math.sin(d), Math.cos(d)); dh = Math.max(dh, Math.abs(d)); }
        if (dh < 0.07 && p.speed > 25) { sT += 1 / 60; sB2 += b * b / 60; sMax = Math.max(sMax, Math.abs(b)); if (Math.abs(b) > 0.035 && Math.sign(b) !== sLast) { if (sLast) sSw++; sLast = Math.sign(b); } } }
      if (window.__TR && f % 6 === 0) out.push(`${t.toFixed(2)} i${i} v${(p.speed * 3.6).toFixed(0)} g${p.gear} β${(b * 57.3).toFixed(1)} r${p.r.toFixed(2)} thr${thr} tcK${p.tcK.toFixed(2)} escB${p.escB.toFixed(2)} κ${Array.from(p.ks).map(x => x.toFixed(2)).join(',')} δ${(p.delta*57.3).toFixed(1)} st${steer.toFixed(2)} N${Math.round(p.wheelLoad[2])},${Math.round(p.wheelLoad[3])}`);
    }
    out.push(`laps ${car.lapTimes.map(x => x.toFixed(2)).join(' ')}  sliding >5°: ${slideT.toFixed(1)} s  swings (fishtails) ${swings}  max ${(maxB * 57.3).toFixed(0)}°  off-road ${offT.toFixed(1)} s | straights ${sT.toFixed(0)} s: β rms ${(Math.sqrt(sB2 / Math.max(sT, 1e-6)) * 57.3).toFixed(2)}° max ${(sMax * 57.3).toFixed(1)}° swings >2° ${sSw}`);
    return out;
  }, secs);
  log.forEach(l => console.log(l));
} finally { await b.close(); server.kill(); }
