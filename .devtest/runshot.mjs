// dev: running in the pit lane (js/garagewalk.js: the trigger / Shift out of the garages is a run, the Running clip,
// SPRINT m/s; in a box it's still a jog). FAIL lines are problems.  node .devtest/runshot.mjs [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp';
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    const { presetTracks } = await import('/js/track.js');
    const t = presetTracks().find(q => q.name === 'Pinewood Sprint'); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: 5, pick: false }, 'setup', 'quali', [1200, 600]);
  });
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => { [...document.querySelectorAll('#m-pitgarage .item')].find(e => /Walk The Pit Lane/i.test(e.textContent)).click(); });
  await pg.waitForFunction(() => window.__svgp.dbg.walk && window.__svgp.dbg.walk.active, null, { timeout: 30000 });
  await pg.waitForTimeout(1500);
  // in your box: the run's a jog
  // (W and Shift held, as a player would)
  const go = async (secs) => {
    await pg.keyboard.down('Shift'); await pg.keyboard.down('w');
    for (let t = 0; t < secs; t += 0.5) { await pg.waitForTimeout(500); if (process.env.TRACE) console.log(await pg.evaluate(() => { const W = window.__svgp.dbg.walk; return JSON.stringify({ v: +W.speed.toFixed(2), x: +W.pos.x.toFixed(1), z: +W.pos.z.toFixed(1), h: +W.heading.toFixed(2), run: W.input.run, my: W.input.my }); })); }
    const r = await pg.evaluate(() => { const W = window.__svgp.dbg.walk; return { speed: +W.speed.toFixed(2), fast: W.me._fast, inBox: W.nav.inBox(W.pos) }; });
    await pg.keyboard.up('w'); await pg.keyboard.up('Shift'); return r;
  };
  await pg.evaluate(() => { const W = window.__svgp.dbg.walk; W.heading = W.camYaw = Math.PI; });
  const a = await go(0.6); console.log('in the box', JSON.stringify(a));
  check(a.inBox && a.fast === 'jog' && a.speed < 2.5, 'in your box: a jog');
  // out in the lane, running along it
  await pg.evaluate(() => { const W = window.__svgp.dbg.walk, L = W.nav.line, p = L[Math.floor(L.length / 2)], q = L[Math.floor(L.length / 2) + 1], n = W.nav.nIn[Math.floor(L.length / 2)];
    W.pos.set(p.x - n.x * 4, 0, p.z - n.z * 4); W.heading = W.camYaw = Math.atan2(q.x - p.x, q.z - p.z); W.input = {}; W.speed = 0; });
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: join(OUT, 'run-box.png') });
  const c = await go(14); // (headless runs a few frames a second: long enough for the run to build up) console.log('in the lane', JSON.stringify(c));
  check(!c.inBox && c.fast === 'run' && c.speed > 4.2, 'in the lane: a run');
  await pg.screenshot({ path: join(OUT, 'run-lane.png') });
  await pg.evaluate(() => { window.__svgp.dbg.walk.input = {}; });
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
