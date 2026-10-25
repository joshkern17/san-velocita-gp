// dev: crash scenarios in the real game (contact.js): the player's car thrown at a wall / into an AI car, logged
//   node .devtest/crash.mjs [car] [barrier tires|wall|armco]   (Auburn; ROOT=<another checkout> to compare)
// Scenarios (each from a fresh placement on the main straight, no driver input after the hit unless noted):
//   wall25   40 m/s, nose 25° into the wall
//   wall60   30 m/s, nose 60° into it
//   rearC    player 10 m/s faster, straight into the AI's gearbox
//   rearQ    15 m/s faster, offset 1.6 m: into the AI's rear quarter
//   pit      the player's nose beside the AI's rear wheel, swung 5 m/s into it (a PIT manoeuvre)
//   side     alongside at 40 m/s, the player drifting 3 m/s into the AI's flank
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', barrier = process.argv[3] || 'tires';
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, barrier]) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; t.env.barrier = barrier;
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 1, aiChassis: 'class', car: window.__svgp.settings.car }, 'menu');
  }, [id, barrier]);
  // (straight past the grid: no countdown)
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 1, null, { timeout: 90000 }).catch(e => console.log('wait', e.message));
  await pg.evaluate(() => { const sim = window.__svgp.sim; sim.state = 'racing'; sim.stateT = 99; sim.goAt = 0; });
  const log = await pg.evaluate(() => {
    const sim = window.__svgp.sim, T = sim.T, A = sim.A, me = sim.player, ai = sim.cars.find(c => c !== me), out = [];
    out.push(`player ${me.phys.p.mass} kg vs AI ${ai.phys.p.mass} kg`);
    // a long straight: the start of the lap, a little way down
    const i0 = (Math.round(60 / T.ds)) % T.N;
    const put = (car, i, s, ang, v, vs = 0) => {
      const h = Math.atan2(T.FX[i], T.FZ[i]) + ang, p = car.phys;
      p.place(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s, h);
      const fx = Math.sin(h), fz = Math.cos(h);
      p.vx = fx * v + T.RX[i] * vs; p.vz = fz * v + T.RZ[i] * vs;
      p.dmg = { fw: 0, rw: 0, ch: 0 }; car.model.setDamage(p.dmg); car.idx = i; sim.updateTracker(car, true);
    };
    const park = (car) => put(car, (i0 + Math.round(200 / T.ds)) % T.N, 0, 0, 0);
    const run = (name, setup, secs = 2, ctl = { steer: 0, throttle: 0, brake: 0 }) => {
      setup();
      const rows = [];
      let r0 = 0, minV = 1e9;
      for (let f = 0; f < secs * 60; f++) {
        sim.update(1 / 60, { ...ctl, handbrake: 0, analog: true }, {});
        if (ai.ai) ai.ai.stuckT = 0;
        const p = me.phys, q = ai.phys, rel = (c) => (((c.phys.h - Math.atan2(T.FX[c.idx], T.FZ[c.idx])) * 57.3 + 540) % 360 - 180);
        if (f % 12 === 0) rows.push(`  ${(f / 60).toFixed(2)}  me v${(p.speed * 3.6).toFixed(0).padStart(3)} hdg${rel(me).toFixed(0).padStart(4)}° r${p.r.toFixed(2).padStart(6)} s${me.s.toFixed(2).padStart(6)} hitT ${(p.hitT || 0).toFixed(2)} | ai v${(q.speed * 3.6).toFixed(0).padStart(3)} hdg${rel(ai).toFixed(0).padStart(4)}° r${q.r.toFixed(2).padStart(6)} s${ai.s.toFixed(2).padStart(6)}`);
        if (!isFinite(p.x) || !isFinite(q.x)) { rows.push('  NaN!'); break; }
      }
      const d = me.phys.dmg, e = ai.phys.dmg;
      out.push(`${name}  (wall: right at ${A.BR[i0].toFixed(1)} m)  dmg me fw${d.fw.toFixed(2)} rw${d.rw.toFixed(2)} ch${d.ch.toFixed(2)} | ai fw${e.fw.toFixed(2)} rw${e.rw.toFixed(2)} ch${e.ch.toFixed(2)}`, ...rows);
    };
    const W = A.BR[i0];
    run('wall25', () => { park(ai); put(me, i0, W - 6, 0.44, 40); });
    run('wall60', () => { park(ai); put(me, i0, W - 5, 1.05, 30); });
    run('rearC', () => { put(ai, i0 + Math.round(5.6 / T.ds), 0, 0, 30); put(me, i0, 0, 0, 40); }, 2);
    run('rearQ', () => { put(ai, i0 + Math.round(5.6 / T.ds), 0, 0, 30); put(me, i0, 1.6, 0, 45); }, 2);
    run('pit', () => { put(ai, i0 + Math.round(3.4 / T.ds), 0, 0, 40); put(me, i0, 2.05, 0, 41, -5); }, 2);
    run('side', () => { put(ai, i0, 0, 0, 40); put(me, i0, 2.05, 0, 40, -3); }, 2);
    return out;
  });
  log.forEach(l => console.log(l));
} finally { await b.close(); server.kill(); }
