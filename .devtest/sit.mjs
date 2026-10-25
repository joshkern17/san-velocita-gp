// dev: sitting down at the desk and getting up (Home Garage > Walk Around: walk to the computer, Enter: you sit, then
// stand back up). Logs where you are and how far down; screenshots to argv[2].   node .devtest/sit.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__svgp.dbg.openHomeView());
  await pg.waitForFunction(() => window.__svgp.screen === 's-homeview' && /^home:/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 20000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(() => window.__svgp.dbg.startWalk());
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 20000 }); await pg.waitForTimeout(500);
  const st = () => pg.evaluate(() => { const w = window.__svgp.dbg.walk, a = w.act; const h = w.me && w.me.bone('Hips').getWorldPosition(w.pos.clone());
    return { act: a && a.kind + ':' + a.step, k: a && +(a.k || 0).toFixed(2), clip: w.me && w.me.clip, pos: w.pos.toArray().map(v => +v.toFixed(2)), hips: h && h.toArray().map(v => +v.toFixed(2)), spot: w.spot && w.spot.key, seat: (s => s && s.seat.toArray().map(v => +v.toFixed(2)))(w.deskSeat()) }; });
  // out in the room, a metre from the desk chair, facing it
  await pg.evaluate(() => { const w = window.__svgp.dbg.walk, s = w.deskSeat(); w.pos.set(s.seat.x - 0.9 * Math.sin(s.face), 0, s.seat.z - 0.9 * Math.cos(s.face) - 0.3); w.heading = Math.atan2(s.seat.x - w.pos.x, s.seat.z - w.pos.z); w.camYaw = w.heading; });
  await pg.waitForTimeout(400); console.log('at the desk', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'sit-0.png') });
  await pg.keyboard.press('Enter');
  for (let i = 1; i <= 14; i++) { await pg.waitForTimeout(400); const s = await st(); console.log((i * 0.4).toFixed(1) + 's', JSON.stringify(s)); if ([2, 4, 6, 8, 10, 12, 14].includes(i)) await pg.screenshot({ path: join(out, `sit-${i}.png`) }); }
  await pg.keyboard.down('KeyS'); await pg.waitForTimeout(900); await pg.keyboard.up('KeyS'); console.log('walked off', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'sit-off.png') });
  // a career: sat down, the computer opens; leave it and you get back up and walk on
  await pg.evaluate(() => window.__svgp.dbg.startWorld(false));
  await pg.waitForFunction(() => window.__svgp.screen === 's-hub' && window.__svgp.world, null, { timeout: 60000 });
  await pg.evaluate(() => { const d = window.__svgp.dbg; if (d.tsw && d.tsw.isOpen) d.tsw.close(); d.openHub(); });
  await pg.waitForFunction(() => /^home:/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 20000 }); await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__svgp.dbg.standUp()); await pg.waitForTimeout(1200);
  await pg.evaluate(() => window.__svgp.dbg.startWalk());
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 20000 }); await pg.waitForTimeout(500);
  await pg.evaluate(() => { const w = window.__svgp.dbg.walk, s = w.deskSeat(); w.pos.set(s.seat.x - 0.9 * Math.sin(s.face), 0, s.seat.z - 0.9 * Math.cos(s.face) - 0.3); w.heading = Math.atan2(s.seat.x - w.pos.x, s.seat.z - w.pos.z); w.camYaw = w.heading; });
  await pg.waitForTimeout(400);
  const cs = () => pg.evaluate(() => { const d = window.__svgp.dbg, w = d.walk, P = d.pitGarage; return { walking: w.active, act: w.act && w.act.kind + ':' + w.act.step, shot: P.shot, parked: !!P.parked, body: !!(w.me && w.me.object.parent), shown: !!(w.me && w.me.object.visible), pc: !!(d.pc && d.pc.isOpen), cls: document.getElementById('s-hub').className }; });
  await pg.screenshot({ path: join(out, 'career-0.png') });
  console.log('career at the desk', JSON.stringify(await cs()), 'spot', await pg.evaluate(() => window.__svgp.dbg.walk.spot && window.__svgp.dbg.walk.spot.key));
  await pg.keyboard.press('Enter');
  for (let i = 1; i <= 8; i++) { await pg.waitForTimeout(500); console.log('career ' + (i * 0.5).toFixed(1) + 's', JSON.stringify(await cs())); if (i === 3 || i === 5 || i === 8) await pg.screenshot({ path: join(out, `career-${i}.png`) }); }
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  for (let i = 1; i <= 6; i++) { await pg.waitForTimeout(500); console.log('leaving ' + (i * 0.5).toFixed(1) + 's', JSON.stringify(await cs())); if (i === 1 || i === 3 || i === 6) await pg.screenshot({ path: join(out, `career-up-${i}.png`) }); }
} finally { await b.close(); server.kill(); }
