// dev: your people at home (js/homecrew.js) in the Home Garage preview: the unit with everything bought and in use, the
// crew on: where each is and what they're doing, every few seconds for a minute, and shots round the room.
// PREMISES=unit|lockup, BUSY=0 for the stations idle.   node .devtest/crewshot.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const g = (x, y, z) => ({ x: x - 2.3, y: z, z: -y - 2.7 - 6.5 }); // (the unit's Blender coordinates -> the room's)
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('console:', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(({ p, busy }) => { const d = window.__svgp.dbg; d.openHomeView(); d.homeView({ premises: p, fac: { tools: 2, dyno: 1, fab: 1, sim: 1, data: 1 }, car2: true, crew: true, busy }); },
    { p: process.env.PREMISES || 'unit', busy: process.env.BUSY !== '0' });
  await pg.waitForFunction(() => { const h = window.__svgp.dbg.pitGarage.homeCrew; return !!(h && h.ready && h.floors); }, null, { timeout: 120000, polling: 500 });
  const where = () => pg.evaluate(() => window.__svgp.dbg.pitGarage.homeCrew.people.map(p => `${p.role}:${p.group ? 'talk' : p.path.length ? 'walk' : (p.act && p.act.clip)}@${p.spot ? (p.spot.st || p.spot.role) : '-'}(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)})`).join('  '));
  for (let i = 0; i < 6; i++) { console.log(`t=${i * 6}s`, await where()); await pg.waitForTimeout(6000); }
  const shots = [['room', null, null], ['bays', g(-7.2, -6.6, 3.3), g(2, 4, 1.2)], ['rail', g(-3, 3.9, 4.4), g(3, -3, 0.5)], ['door', g(3.8, -6.7, 1.7), g(1, 4, 1.5)], ['mezz', g(6.2, 3.9, 4.3), g(-3, 6.2, 2.9)]];
  for (const [n, pos, at] of shots) {
    if (pos) await pg.evaluate(({ pos, at }) => { const P = window.__svgp.dbg.pitGarage, V = P.camera.position.constructor; P.cine({ pos: new V(pos.x, pos.y, pos.z), at: new V(at.x, at.y, at.z), fov: 64, shift: 0.16 }, 0); }, { pos, at });
    await pg.waitForTimeout(700); await pg.screenshot({ path: join(out, `crew-${n}.png`) });
  }
} finally { await b.close(); server.kill(); }
