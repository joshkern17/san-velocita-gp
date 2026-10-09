// dev: the acclimatization gates (practice.js) in a time trial: a bot drives the line at a fraction of the gates' speeds
//   node .devtest/gatestest.mjs [car] [laps] [pace] [shot.png]   (Auburn; pace 1 = the gates' own speeds)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', laps = +(process.argv[3] || 1), pace = +(process.argv[4] || 1), shot = process.argv[5];
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  if (process.env.BACK) await pg.addInitScript((v) => { window.__back = v; }, process.env.BACK);
  if (process.env.OVER) await pg.addInitScript((v) => { window.__over = v; }, process.env.OVER);
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async (id) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
    window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: window.__svgp.settings.car }, 'menu');
  }, id);
  await pg.waitForFunction(() => window.__svgp.screen === 'hud' && window.__svgp.sim && window.__svgp.sim.state === 'racing', null, { timeout: 90000 });
  const r = await pg.evaluate(({ laps, pace }) => {
    const sim = window.__svgp.sim, car = sim.player, p = car.phys, T = sim.T;
    sim.setProgramme('acclim');
    const G = sim.prog.gates, kinds = {}, RV = sim.referenceTelemetry(car.carId, sim.condTyre('soft')).ch.v, trace = []; for (const g of G) kinds[g.kind] = (kinds[g.kind] || 0) + 1;
    const res = {}, evs = [], RS = sim.referenceTelemetry(car.carId, sim.condTyre('soft')).ch.s;
    const REF = sim.referenceTelemetry(car.carId, sim.condTyre('soft'));
    const refOff = G.map(g => `${g.kind[0]}${g.i}:${(RS[g.i] - g.o).toFixed(1)}/w${(T.W[g.i] / 2).toFixed(1)}/l${sim.line[g.i].toFixed(1)}`).join(' ') + ` faults ${sim.lapFaults(REF)} t ${REF.time?.toFixed?.(2)}`, botOff = [];
    for (let f = 0; f < 60 * 130 * (laps + 0.6) && car.lapTimes.length < laps + 1; f++) {
      const i = car.idx, la = (i + Math.round((8 + p.speed * 0.35) / T.ds)) % T.N, off = sim.line[la];
      const tx = T.X[la] + T.RX[la] * off, tz = T.Z[la] + T.RZ[la] * off, dx = tx - p.x, dz = tz - p.z;
      const left = dx * Math.cos(p.h) - dz * Math.sin(p.h), fwd = dx * Math.sin(p.h) + dz * Math.cos(p.h);
      const sx = Math.max(-1, Math.min(1, -Math.atan2(left, fwd) * 2.5 + (p.beta || 0) * 1.2)), steer = Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
      const vt = RV[i] * pace, vt2 = RV[(i + Math.round(25 / T.ds)) % T.N] * pace;
      const thr = p.speed < Math.min(vt, vt2 + 6) ? 1 : 0, brk = p.speed > Math.min(vt, vt2 + 6) + 2 ? 1 : 0;
      sim.update(1 / 60, { steer, throttle: thr, brake: brk, handbrake: 0, analog: true, pad: true, lag: 0.05 }, {});
      if (f % 600 === 0) trace.push(`${f / 60}s i${car.idx} v${Math.round(p.speed * 3.6)} lap${car.lap} on${car.onRoad}`);
      while (sim.events.length) { const e = sim.events.shift(); if (e.type === 'gate') { res[e.res] = (res[e.res] || 0) + 1; } if (e.type === 'progLap' || (e.type === 'gate' && e.nailed)) evs.push(JSON.stringify(e)); }
    }
    return { refOff, trace: trace.join(' | '), gates: G.length, kinds, lapM: Math.round(T.L), res, evs, laps: car.lapTimes.map(x => x.toFixed(2)), tdata: sim.tdata, hud: sim.hudState().prog, cls: sim.prog.tol, half: sim.prog.half };
  }, { laps, pace });
  console.log(JSON.stringify(r, null, 1));
  if (shot) {
    // a frame with a gate ahead: the bot drives on (at OVER x the gates' speeds) until it's 40 m (BACK) short of a red one
    await pg.evaluate(() => { const sim = window.__svgp.sim, car = sim.player, p = car.phys, T = sim.T, RV = sim.referenceTelemetry(car.carId, sim.condTyre('soft')).ch.v, over = +(window.__over || 1.25), back = +(window.__back || 40);
      for (let f = 0; f < 60 * 200; f++) {
        const P = sim.prog, g = P.gates[P.next], ahead = ((g.i - car.idx + T.N) % T.N) * T.ds;
        if (g.kind === 'brake' && ahead < back && ahead > back - 15 && f > 120) break;
        const i = car.idx, la = (i + Math.round((8 + p.speed * 0.35) / T.ds)) % T.N, off = sim.line[la];
        const tx = T.X[la] + T.RX[la] * off, tz = T.Z[la] + T.RZ[la] * off, dx = tx - p.x, dz = tz - p.z;
        const left = dx * Math.cos(p.h) - dz * Math.sin(p.h), fwd = dx * Math.sin(p.h) + dz * Math.cos(p.h);
        const sx = Math.max(-1, Math.min(1, -Math.atan2(left, fwd) * 2.5 + (p.beta || 0) * 1.2)), steer = Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
        // (as fast as the gate wants, times over, until the gate; braking normally after)
        const vt = (ahead < 200 && g.kind === 'brake' ? g.v * over : RV[i]), vt2 = RV[(i + Math.round(25 / T.ds)) % T.N];
        sim.update(1 / 60, { steer, throttle: p.speed < vt ? 1 : 0, brake: p.speed > vt + 2 ? 1 : 0, handbrake: 0, analog: true, pad: true, lag: 0.05 }, {});
        sim.events.length = 0;
      }
      sim.setPaused(true); });
    await pg.waitForTimeout(1500);
    console.log(await pg.evaluate(() => { const sim = window.__svgp.sim, P = sim.prog, c = sim.camera.position;
      return JSON.stringify({ grp: P.group.visible, inScene: !!P.group.parent, car: sim.player.idx, cam: [c.x, c.y, c.z].map(Math.round), vis: P.gates.filter(g => g.obj.visible).map(g => ({ i: g.i, op: g.mat.opacity.toFixed(2), p: g.obj.position.toArray().map(Math.round) })) }); }));
    await pg.screenshot({ path: shot });
  }
} finally { await b.close(); server.kill(); }
