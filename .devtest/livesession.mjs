// dev: a live session (js/livesession.js): the AI field driving their qualifying runs out of their garages. Stepped
// by hand (fast): who's where over the session, pushes out and in, laps posted at the line, nobody stuck or lost.
// FAIL lines are problems.   [TRACK='Pinewood Sprint'] [KIND=quali|practice] node .devtest/livesession.mjs [secs]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const SECS = +(process.argv[2] || 600), KIND = process.env.KIND || 'quali';
const PORT = 8990 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([TRACK, KIND]) => {
    const { presetTracks } = await import('/js/track.js');
    const real = TRACK && (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    const t = real || presetTracks().find(q => q.name === (TRACK || 'Pinewood Sprint')); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: 7, pick: false }, 'setup', KIND === 'practice' ? 'full' : 'quali', [1200, 1200]);
  }, [process.env.TRACK, KIND]);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 180000 });
  const info = await pg.evaluate(() => { const s = window.__svgp.sim; return { live: !!s.live, cars: s.cars.length, runners: s.live ? s.live.runners.length : 0, boxes: s.pitLife.boxes.length, time: s.quali.time, kind: s.quali.kind,
    shared: s.pitLife.boxes.filter(b => s.pitLife.boxCars(b).length > 1).map(b => b.k + ':' + s.pitLife.boxCars(b).map(c => c.name).join('+')) }; });
  console.log(JSON.stringify(info));
  check(info.live && info.runners > 0, 'live session with the field as cars');
  // step the session on: 60 Hz, a chunk at a time
  const t0 = Date.now(); let log = [], posts = 0;
  for (let done = 0; done < SECS; done += 20) {
    const r = await pg.evaluate(() => {
      const s = window.__svgp.sim, L = s.live, q = s.quali, el0 = q.time - q.left, t = performance.now();
      const ev = { out: 0, in: 0 };
      for (let i = 0; i < 60 * 20; i++) {
        const before = L.runners.map(R => R.st);
        s.update(1 / 60, { steer: 0, throttle: 0, brake: 0 }, {});
        L.runners.forEach((R, k) => { if (before[k] === 'garage' && R.st !== 'garage') ev.out++; if (before[k] !== 'garage' && R.st === 'garage') ev.in++; });
        if (q.done) break;
      }
      const st = {}; for (const R of L.runners) st[R.st] = (st[R.st] || 0) + 1;
      const posted = q.field.reduce((a, e) => a + e.plan.filter(r => r.done).length, 0);
      const blue = s.cars.filter(c => c.blue).map(c => c.name + '<' + c.blue.name);
      const stuck = L.runners.filter(R => R.st !== 'garage' && !R.push && !R.car.gone && R.car.phys.speed < 1).map(R => R.car.name + ':' + R.st + (R.car.pitting ? '/' + R.car.pitPhase : ''));
      return { el: Math.round(q.time - q.left), ms: Math.round((performance.now() - t) / 1200 * 100) / 100, st, posted, ev, blue, stuck, pushes: L.pushes.length, done: q.done };
    });
    console.log(JSON.stringify(r)); log.push(r);
    if (r.done) break;
  }
  // you out on track, crawling (an out lap), with them on flying laps: the blue flag on your HUD, and they get by
  if (process.env.DBG) await pg.evaluate(() => { window.__dbgBlue = true; });
  pg.on('console', m => { if (process.env.DBG && m.text().startsWith('{"i"')) console.log(m.text()); });
  const bl = await pg.evaluate(() => {
    const s = window.__svgp.sim, pl = s.player, L = s.live;
    if (s.quali.done) return null;
    s.leaveGarage(pl, 'flying'); pl.autoT = 0;
    let blueF = 0, hudBlue = 0, passed = 0, frames = 0; const ahead = new Map();
    for (let i = 0; i < 60 * 90 && !s.quali.done; i++) {
      s.update(1 / 60, { steer: 0, throttle: 0.18, brake: 0 }, {}); frames++;
      if (pl.blue) blueF++;
      if (window.__dbgBlue && i % 120 === 0) { const T = s.T, N = T.N; const near = L.runners.map(R => ({ n: R.car.name, st: R.st, gone: R.car.gone, pit: R.car.pitting, gap: Math.round(((pl.idx - R.car.idx + N) % N) * T.ds), v: R.car.phys.speed.toFixed(0) })).filter(x => !x.gone && x.gap < 300); L.blues(); console.log(JSON.stringify({ i, blue: pl.blue && pl.blue.name, bt: L.blueT, lap: pl.lap, pit: pl.pitting, v: pl.phys.speed.toFixed(1), near })); }
      const h = s.hudState(); if (h && h.rc && h.rc.blue) hudBlue++;
      for (const R of L.runners) { const c = R.car; if (c.gone) continue; const lead = c.progress > pl.progress; if (ahead.has(c) && !ahead.get(c) && lead) passed++; ahead.set(c, lead); }
    }
    return { blueF, hudBlue, passed, frames, pv: pl.phys.speed.toFixed(1) };
  });
  console.log('you slow on track', JSON.stringify(bl));
  if (bl) { check(bl.blueF > 0 && bl.hudBlue > 0, 'blue flag for you, on the HUD'); check(bl.passed > 0, 'they got by you'); }
  const outs = log.reduce((a, r) => a + r.ev.out, 0), ins = log.reduce((a, r) => a + r.ev.in, 0);
  check(outs > 0, `cars went out (${outs})`);
  check(ins > 0, `cars came back in (${ins})`);
  const end = await pg.evaluate(() => { const s = window.__svgp.sim, q = s.quali; return { rows: s.qualiRows().slice(0, 4).map(r => r.name + ' ' + (isFinite(r.best) ? r.best.toFixed(2) : '-')), lost: s.live.runners.filter(R => R.st !== 'garage' && R.car.gone && !R.push).length }; });
  console.log(JSON.stringify(end));
  check(end.lost === 0, 'nobody lost (off the track and not in a box)');
  console.log('wall', Math.round((Date.now() - t0) / 1000), 's');
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
