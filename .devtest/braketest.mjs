// dev: how often the player gets flagged for a brake test (race.js dirtyCheck) when they race cleanly.
//   node .devtest/braketest.mjs [car] [laps] [pace]   the player's car on the game's own driver (clean, by definition)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', laps = +(process.argv[3] || 3), pace = +(process.argv[4] || 0.9), early = +(process.env.EARLY || 0);
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  if (process.env.OPP) await pg.addInitScript((x) => { window.__OPP = x; }, process.env.OPP);
  if (process.env.BT) await pg.addInitScript(() => { window.__BT = 1; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ({ id, laps }) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
    window.__svgp.startRace(t, { mode: 'race', laps, opponents: 9, strategy: false, car: window.__svgp.settings.car }, 'menu');
  }, { id, laps });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player, null, { timeout: 90000 }).catch(e => console.log('wait', e.message));
  console.log(await pg.evaluate(() => `screen ${window.__svgp.screen} state ${window.__svgp.sim?.state}`));
  const out = await pg.evaluate(({ laps, pace, early }) => {
    const sim = window.__svgp.sim, me = sim.player, T = sim.T, rows = [];
    sim.confirmStrategy(null);
    for (let f = 0; f < 60 * 20 && sim.state !== 'racing'; f++) sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, { skip: true });
    sim.cars.forEach((o, i) => { if (o !== me) { o.pid ||= 'X' + i; if (o.ai) o.ai.pace = pace * (+(window.__OPP || 0.99) + 0.03 * Math.random()); } });
    me.ai ||= { pace, bias: 0, over: 0, stuckT: 0, react: 0 }; me.ai.pace = pace; sim.brakeAssist = (car) => sim.aiControlsFor(car, 1 / 60); // (the player's controls: the game's driver)
    const dirty = sim.dirty.bind(sim);
    sim.dirty = (kind, o) => {
      const v = me.phys.speed, n = Math.round(200 / T.ds); let mn = 99, at = 0;
      for (let k = 1; k <= n; k++) { const x = sim.lineV[(me.idx + k) % T.N]; if (x < mn) { mn = x; at = k * T.ds; } }
      rows.push({ kind, t: +sim.raceTime.toFixed(1), lap: me.lap, v: +v.toFixed(1), brk: +(me.ctl.brake || 0).toFixed(2), here: +sim.lineV[me.idx].toFixed(1),
        a60: +sim.lineV[(me.idx + Math.round(60 / T.ds)) % T.N].toFixed(1), minAhead: +mn.toFixed(1), minAt: Math.round(at), behind: +(me.progress - o.progress).toFixed(1), ov: +o.phys.speed.toFixed(1) });
      dirty(kind, o);
    };
    // EARLY=a: a human who brakes early, at a m/s² (the plan brakes on the limit): full pedal from where that's needed
    if (early) { const ai = sim.aiControlsFor.bind(sim); sim.aiControlsFor = (car, dt) => { const c = ai(car, dt); if (car !== me) return c;
      const v = me.phys.speed; let need = false;
      for (let k = 1, n = Math.round(250 / T.ds); k <= n; k++) { const x = sim.lineV[(me.idx + k) % T.N] * pace; if (v * v > x * x + 2 * early * k * T.ds) { need = true; break; } }
      return need ? { ...c, throttle: 0, brake: 1 } : c; }; }
    // BT=1: a real brake test now and then (on a straight, someone 4-14 m behind): the check must still catch these
    let stab = 0, tests = 0; const why = [];
    const reason = () => { const b = me.btk || {}, v = me.phys.speed; const r = { t: +(b.t || 0).toFixed(2), drop: +((b.v0 || 0) - v).toFixed(1), on: me.onRoad && me.surface !== 'runoff', pitReq: !!me.pitReq, sc: !!sim.sc, flag: sim.rc?.flagAhead?.(me.idx)?.f };
      r.ahead = sim.cars.filter(o => o !== me && !o.gone && o.progress - me.progress > -2 && o.progress - me.progress < 40).map(o => +(o.progress - me.progress).toFixed(1));
      r.behind = sim.cars.filter(o => o !== me && me.progress - o.progress > 0 && me.progress - o.progress < 25).map(o => [+(me.progress - o.progress).toFixed(1), +(o.phys.speed - v).toFixed(1), +(o.ctl?.brake || 0).toFixed(2)]); r.fired = sim.log.filter(e => e.type === 'braketest').length;
      let mn = 99; for (let k = -Math.round(30 / T.ds), n = Math.round(Math.min(500, b.v0 * b.v0 / 10 + 40) / T.ds); k <= n; k++) mn = Math.min(mn, sim.lineV[(me.idx + k + T.N) % T.N]); r.minV = +mn.toFixed(1); r.v0 = +(b.v0 || 0).toFixed(1); return r; };
    if (window.__BT) { const ai = sim.aiControlsFor.bind(sim); sim.aiControlsFor = (car, dt) => { const c = ai(car, dt); if (car !== me) return c;
      if (stab > 0) { stab -= dt; if (stab < 0.8 && stab + dt >= 0.8) why.push(reason()); return { ...c, throttle: 0, brake: 1 }; }
      const v = me.phys.speed; let fast = true; for (let k = 0, n = Math.round((v * v / 10 + 60) / T.ds); k <= n; k++) if (sim.lineV[(me.idx + k) % T.N] < v) { fast = false; break; }
      if (fast && v > 30 && sim.raceTime > 20 && !sim.cars.some(o => o !== me && o.progress - me.progress > -2 && o.progress - me.progress < 40)
        && sim.cars.some(o => o !== me && me.progress - o.progress > 4 && me.progress - o.progress < 14) && Math.random() < 0.05) { stab = 1.5; tests++; }
      return c; }; }
    const cnt = { near: 0, brk: 0, both: 0, faster: 0, pos: [] };
    for (let f = 0; f < 60 * 60 * 12 && !me.finished; f++) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      if (sim.raceTime < 8) continue;
      const near = sim.cars.filter(o => o !== me && !o.gone && me.progress - o.progress > 3 && me.progress - o.progress < 25);
      const bk = (me.ctl?.brake || 0) > 0.75 && me.phys.speed > 18;
      if (near.length) cnt.near++; if (bk) cnt.brk++; if (near.length && bk) { cnt.both++; if (near.some(o => o.phys.speed > me.phys.speed)) cnt.faster++; }
      if (f % 1800 === 0) cnt.pos.push(sim.order ? sim.order.indexOf(me) + 1 : -1); }
    cnt.tests = tests; cnt.why = why; rows.unshift(cnt);
    return { rows, time: sim.raceTime, log: sim.log.filter(e => e.a === 'P' && e.type !== 'pass').map(e => e.type) };
  }, { laps, pace, early });
  console.log(`${id} ${laps} laps pace ${pace}: ${out.time.toFixed(0)} s, flagged: ${JSON.stringify(out.log)}`);
  console.log(JSON.stringify(out.rows[0])); if (process.env.ROWS) for (const r of out.rows.slice(1)) console.log(JSON.stringify(r));
} finally { await b.close(); server.kill(); }
