// dev: the crew pushing your car (js/pushcar.js): Drive Out from the garage menu (pushed out of the box into the lane,
// handed to you there, the chase cam eased on), then pulling up at the box (pushed back in, tail first, the menu's
// shot eased on). Screenshots on the way; checks the hand-over spots, the pushers' hands on the car, where it parks.
//   [TRACK='Pinewood Sprint'] node .devtest/pushshot.mjs [outdir]
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
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text().slice(0, 300)); });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async (TRACK) => {
    const { presetTracks } = await import('/js/track.js');
    const real = TRACK && (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    const t = real || presetTracks().find(q => q.name === (TRACK || 'Pinewood Sprint')); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: 5, pick: false }, 'setup', 'quali', [1200, 600]);
  }, process.env.TRACK);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await pg.waitForFunction(() => window.__svgp.sim.pitLife.mine?.brain?.people.length, null, { timeout: 30000 });
  await pg.waitForTimeout(1500);
  // the scene run on by hand (headless draws a few frames a second): n steps of dt, a shot after
  const step = (secs, dt = 1 / 30) => pg.evaluate(([secs, dt]) => { const P = window.__svgp.dbg.carPush; for (let t = 0; t < secs && P.active; t += dt) P.update(dt); return P.active ? P.phase : 'done'; }, [secs, dt]);
  const shot = async (name) => { await pg.waitForTimeout(700); for (let k = 0; k < 3; k++) { try { await pg.screenshot({ path: join(OUT, name), timeout: 20000 }); console.log('shot', name); return; } catch { console.log('(shot slow, again)'); } } };
  // the pushers' hands: how far each right hand is off the car's body (its box, in the car's own frame)
  const hands = () => pg.evaluate(async () => {
    const THREE = await import('three');
    const P = window.__svgp.dbg.carPush, g = P.carObj.group; g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), bb = new THREE.Box3(), all = new THREE.Box3(), m = new THREE.Matrix4();
    g.traverse(o => { if (o.isMesh && o.visible && o.geometry && o !== P.carObj.shadow) { o.geometry.computeBoundingBox(); all.union(bb.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); } });
    return P.crew.filter(c => c.slot.clip !== 'walk').map(c => { const h = c.ch.bone('RightHand'); const p = h.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      // (outside its box: how far off it, +; inside: how deep in, -)
      const d = all.distanceToPoint(p); if (d > 0) return +d.toFixed(2);
      return -Math.min(p.x - all.min.x, all.max.x - p.x, p.y - all.min.y, all.max.y - p.y, p.z - all.min.z, all.max.z - p.z).toFixed(2); });
  });
  // ---- out ----
  await pg.evaluate(() => { [...document.querySelectorAll('#m-pitgarage .item')].find(e => /Drive Out/i.test(e.textContent)).click(); });
  await pg.waitForTimeout(300);
  const st0 = await pg.evaluate(() => ({ active: window.__svgp.dbg.carPush.active, n: window.__svgp.dbg.carPush.crew?.length, len: window.__svgp.dbg.carPush.path?.len }));
  console.log('out', JSON.stringify(st0));
  check(st0.active && st0.n >= 3, `Drive Out starts the push (${st0.n} crew, ${st0.len?.toFixed(1)} m)`);
  console.log('phase', await step(1.2)); await shot('push-out-1.png');
  console.log('phase', await step(3)); await shot('push-out-2.png');
  for (let i = 0; i < 6 && (await pg.evaluate(() => window.__svgp.dbg.carPush.phase)) !== 'push'; i++) await step(1);
  console.log('phase', await step(4)); await shot('push-out-3.png');
  const h1 = await hands(); console.log('hands off the car (m)', JSON.stringify(h1));
  check(h1.length && h1.every(d => d < 0.25 && d > -0.3), `pushers' hands on the car (${JSON.stringify(h1)})`);
  console.log('phase', await step(5)); await shot('push-out-4.png');
  const end = await pg.evaluate(() => { const P = window.__svgp.dbg.carPush, e = P.path.P[P.path.P.length - 1], w = new (P.Mw.elements.constructor === Float32Array ? Object : Object)(); const v = { x: e.x, y: 0, z: e.z }; const m = P.Mw.elements; return { x: m[0] * v.x + m[8] * v.z + m[12], z: m[2] * v.x + m[10] * v.z + m[14] }; });
  console.log('phase', await step(30));
  const st1 = await pg.evaluate(() => { const s = window.__svgp.sim, p = s.player; return { screen: window.__svgp.screen, inGarage: p.inGarage, x: p.phys.x, z: p.phys.z, pit: p.pitPhase, blend: !!s.camBlend }; });
  console.log('after', JSON.stringify(st1), 'pushed to', JSON.stringify(end));
  check(st1.screen === 'hud' && !st1.inGarage && st1.pit === 'out', 'handed over: out on the lane, driving');
  check(Math.hypot(st1.x - end.x, st1.z - end.z) < 0.6, `your car where the crew left it (${Math.hypot(st1.x - end.x, st1.z - end.z).toFixed(2)} m off)`);
  await pg.waitForTimeout(400); await shot('push-out-5-handover.png');
  await pg.waitForTimeout(3000); await shot('push-out-6-chase.png');
  // ---- in: pulled up at the box (where it is now: just past it), stopped ----
  await pg.evaluate(() => { const s = window.__svgp.sim, p = s.player; p.pitting = true; p.pitPhase = 'in'; p.pitReq = { garage: true }; p.phys.vx = p.phys.vz = 0; p.phys.u = 0; });
  await pg.waitForFunction(() => window.__svgp.dbg.carPush.active, null, { timeout: 20000 });
  if (process.env.TRACE) await pg.evaluate(() => { const P = window.__svgp.dbg.carPush; for (const k of ['skip', 'finish']) { const f = P[k].bind(P); P[k] = (...a) => { console.warn('PUSH', k, P.phase, P.s.toFixed(2), P.path.len.toFixed(2), new Error().stack.split('\n').slice(2, 5).join(' | ')); return f(...a); }; } });
  check(true, 'pulling up at the box starts the push in');
  console.log('phase', await step(1.0)); await shot('push-in-1.png');
  for (let i = 0; i < 16 && (await pg.evaluate(() => window.__svgp.dbg.carPush.phase)) !== 'push'; i++) await step(0.5);
  console.log('phase', await step(1.5)); await shot('push-in-2.png');
  console.log('phase', await step(4)); await shot('push-in-3.png');
  const h2 = await hands(); console.log('hands off the car (m)', JSON.stringify(h2));
  check(h2.length && h2.every(d => d < 0.4 && d > -0.3), `pushers' hands on the car (${JSON.stringify(h2)})`);
  console.log('phase', await step(4)); await shot('push-in-4.png');
  console.log('phase', await step(40));
  const st2 = await pg.evaluate(() => { const s = window.__svgp.sim, p = s.player, PG = window.__svgp.dbg.pitGarage, c = PG.carCentre(); return { screen: window.__svgp.screen, inGarage: p.inGarage, from: !!PG.from, hud: document.getElementById('hud').style.opacity }; });
  console.log('after', JSON.stringify(st2));
  check(st2.screen === 's-pitgarage' && st2.inGarage, 'parked: back in the garage menu');
  await pg.waitForTimeout(500); await shot('push-in-5-menu.png');
  await pg.waitForTimeout(2500); await shot('push-in-6-menu.png');
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
