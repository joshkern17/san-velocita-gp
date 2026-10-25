// dev: right-stick flick shifting, the rev bar's range per car, and the suggested-gear boards
//   node .devtest/stickshift.mjs   (Auburn; shots in .devtest/out/gearhint-<car>.png)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
mkdirSync(join(ROOT, '.devtest/out'), { recursive: true });
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };
const CARS = (process.argv[2] || 'civic,m3gtr,m1procar,f1').split(',');
try { for (const id of CARS) {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  await pg.addInitScript(() => {
    window.__pad = { rx: 0, ry: 0 };
    const btn = (v) => ({ pressed: v > 0.5, touched: v > 0, value: v });
    navigator.getGamepads = () => [{ id: 'fake', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
      axes: [0, 0, window.__pad.rx, window.__pad.ry], buttons: Array.from({ length: 17 }, () => btn(0)) }];
  });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message, (e.stack || '').slice(0, 300)); fail++; }); pg.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 300)));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);

  // ---- in a race, per car: flicks shift the box, the rev bar spans the car's range, the boards ----
  {
    await pg.evaluate(async (id) => {
      const S = window.__svgp; if (S.sim && S.sim.dispose) {} // (startRace replaces it)
      const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; t.env.time = 'noon';
      S.settings.gearbox = 'manual'; S.settings.gearHint = 'on'; S.settings.stickShift = 'on';
      S.settings.car = { ...S.settings.car, chassis: id };
      S.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: S.settings.car }, 'menu');
    }, id);
    await pg.waitForFunction(() => window.__svgp.screen === 'hud' && window.__svgp.sim && window.__svgp.sim.state === 'racing', null, { timeout: 90000 }).catch(e => console.log('wait', e.message));
    const info = await pg.evaluate(() => {
      const sim = window.__svgp.sim, P = sim.player.phys.p;
      return { auto: sim.player.phys.auto, n: sim.gearHints.length, gears: P.gears, idle: P.idle, red: P.redline,
        hints: sim.gearHints.map(h => `${Math.round(h.v * 3.6)}→${sim.gearFor(h.v, P)}${sim.gearFor(h.v, P) >= sim.gearFor(h.vIn, P, 0.95) ? '(skip)' : ''}`).join(' ') };
    });
    console.log(`${id}: idle ${info.idle} red ${info.red}, ${info.n} corners: ${info.hints}`);
    check(info.auto === false, `${id} manual box`);
    if (id === CARS[0]) {
      // the detector, through the whole chain: each sequence from 3rd, standing still, measured in gears
      const seqs = {
        'straight down': [[[0, 1, 80], [0, 0, 80]], -1],
        'straight up': [[[0, -1, 80], [0, 0, 80]], 1],
        'diagonal down (43°)': [[[0.7, 0.75, 80], [0, 0, 80]], -1],
        'steep diagonal down (55°)': [[[-0.85, 0.6, 80], [0, 0, 80]], -1],
        'sideways (73°) ignored': [[[1, 0.3, 80], [0, 0, 80]], 0],
        'two quick downs (~80 ms apart)': [[[0, 1, 45], [0, 0.1, 35], [0.3, 0.95, 45], [0, 0, 80]], -2],
        'spring-back overshoot ignored': [[[0, 1, 70], [0, 0, 16], [0, -0.7, 30], [0, 0, 80]], -1],
        'held down = one shift': [[[0, 1, 400], [0, 0, 80]], -1],
      };
      for (const [name, [steps, want]] of Object.entries(seqs)) {
        const d = await pg.evaluate(async (steps) => {
          const p = window.__svgp.sim.player.phys, wait = (ms) => new Promise(r => setTimeout(r, ms)), frames = async (n) => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); };
          window.__pad.rx = window.__pad.ry = 0; await frames(3); p.gear = 3;
          for (const [x, y, ms] of steps) { window.__pad.rx = x; window.__pad.ry = y; await wait(ms); }
          await frames(3); return p.gear - 3;
        }, steps);
        check(d === want, `${name}: ${d} gears (want ${want})`);
      }
      // three quick downs from 5th (a stop-watch run of flicks, ~80 ms each)
      const d3 = await pg.evaluate(async () => {
        const p = window.__svgp.sim.player.phys, wait = (ms) => new Promise(r => setTimeout(r, ms)), frames = async (n) => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); };
        window.__pad.rx = window.__pad.ry = 0; await frames(3); p.gear = 5;
        for (let k = 0; k < 3; k++) { window.__pad.ry = 1; await wait(40); window.__pad.ry = 0; await wait(40); }
        await frames(3); return p.gear - 5;
      });
      check(d3 === -3, `three quick downs in ~240 ms: ${d3} gears (want -3)`);
    }
    // flick up twice, then down once, in real time
    const fr = () => pg.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r)); });
    await pg.evaluate(() => { window.__svgp.sim.player.phys.gear = 2; }); await fr();
    const g0 = await pg.evaluate(() => window.__svgp.sim.player.phys.gear);
    for (const [y, ms] of [[-1, 60], [0, 60], [-1, 60], [0, 60], [1, 60], [0, 120]]) { await pg.evaluate((y) => { window.__pad.ry = y; }, y); await pg.waitForTimeout(ms); }
    await fr();
    const g1 = await pg.evaluate(() => window.__svgp.sim.player.phys.gear);
    check(g1 === g0 + 1, `${id} flicks up, up, down: gear ${g0} → ${g1}`);
    // the rev bar at the redline reads full, at idle empty
    const bar = await pg.evaluate(() => { const S = window.__svgp, hs = S.sim.hudState(), P = S.sim.player.phys.p, el = document.getElementById('h-rpm');
      const at = (rpm) => { S.hud.cache.rpm = -1; S.hud.update({ ...hs, rpm }, S.sim); return +el.style.getPropertyValue('--v'); };
      return { idle: at(P.idle), mid: at((P.idle + P.redline) / 2), red: at(P.redline), hot: (at(P.redline * 0.99), el.classList.contains('hot')) }; });
    check(bar.idle === 0 && Math.abs(bar.mid - 0.5) < 0.02 && bar.red === 1 && bar.hot, `${id} rev bar idle ${bar.idle} mid ${bar.mid} redline ${bar.red} hot ${bar.hot}`);
    // drive (the autopilot, in the manual box: it stays in a gear, fine for a look) until a board shows, then a shot
    const seen = await pg.evaluate(async () => {
      const sim = window.__svgp.sim, pl = sim.player, p = pl.phys, T = sim.T, N = T.N, frames = async (n) => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); };
      // the first corner that wants a downshift: the car placed 150 m before its board, on the line, at the plan's speed
      const h = sim.gearHints.find(h => sim.gearFor(h.v, p.p) < sim.gearFor(h.vIn, p.p, 0.95)); if (!h) return null;
      const i = (h.at - Math.round(150 / T.ds) + N) % N, j = (i + 1) % N, o = sim.line[i];
      const hd = Math.atan2(T.X[j] - T.X[i], T.Z[j] - T.Z[i]), v = sim.refV[i];
      p.place(T.X[i] + T.RX[i] * o, T.Z[i] + T.RZ[i] * o, hd); p.vx = Math.sin(hd) * v; p.vz = Math.cos(hd) * v; p.gear = sim.gearFor(v, p.p, 0.95);
      pl.idx = i; await frames(4);
      const sp = sim.gearSprite, d = Math.round(((h.at - pl.idx + N) % N) * T.ds);
      return { gear: p.gear, want: sim.gearFor(h.v, p.p), vis: sp.visible, op: +sp.material.opacity.toFixed(2), d, kmh: Math.round(h.v * 3.6) };
    });
    check(!!seen && seen.vis && seen.op > 0.5, `${id} a board came up ${JSON.stringify(seen)}`);
    await pg.screenshot({ path: join(ROOT, `.devtest/out/gearhint-${id}.png`) });
    await pg.close();
  }
} } finally { await b.close(); server.kill(); }
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exit(fail ? 1 : 0);
