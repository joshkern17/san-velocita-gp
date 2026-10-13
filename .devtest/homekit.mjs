// dev: World Career home garage from the kit (js/garagekit.js): the lock-up with both cars, then the tools and the sim
// rig bought (stations at their slots), then a race weekend's pit box (back to models/garage.glb) and home again.
// Screenshots to argv[2].   node .devtest/homekit.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const state = () => {
  const P = window.__svgp.dbg.pitGarage, k = P.kit;
  return { custom: P.custom, mode: P.mode, bays: k ? k.bays.map(x => x.name) : null, stations: k ? Object.keys(k.stations) : null, spawn: !!(k && k.spawn),
    stands: k ? k.stands.map(s => `${s.name}:${s.userData.clip}`) : null, car2: !!(P.car2 && P.car2.group.parent),
    car2At: P.car2 && P.car2.group.parent ? P.car2.group.position.toArray().map(v => +v.toFixed(2)) : null, screen: !!P.screen };
};
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  pg.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__svgp.dbg.startWorld(false));
  await pg.waitForFunction(() => window.__svgp.screen === 's-hub' && window.__svgp.world, null, { timeout: 60000 });
  await pg.evaluate(() => { const d = window.__svgp.dbg; if (d.tsw && d.tsw.isOpen) d.tsw.close(); d.openHub(); });
  const settle = (re) => pg.waitForFunction((src) => new RegExp(src).test(String(window.__svgp.dbg.pitGarage.custom)), re, { timeout: 20000 }).then(() => pg.waitForTimeout(2500));
  await settle('^home:');
  await pg.evaluate(() => window.__svgp.dbg.standUp()); await pg.waitForTimeout(1500);
  console.log('lock-up:', JSON.stringify(await pg.evaluate(state)));
  await pg.screenshot({ path: join(out, 'kit-1-lockup.png') });
  // the tools and the sim rig bought
  await pg.evaluate(() => { const w = window.__svgp.world, t = w.teams[w.player.team]; t.fac = { ...(t.fac || { base: 0 }), tools: 1, sim: 1 }; window.__svgp.dbg.renderHub(); });
  await settle('tools,sim');
  // (a new career has no car yet: car two put in by hand, the default car)
  await pg.evaluate(async () => { const { DEFAULT_CAR } = await import('/js/carmodel.js'); const P = window.__svgp.dbg.pitGarage; P.setCar(DEFAULT_CAR); P.showCar(true); P.setCar2({ ...DEFAULT_CAR, number: 8 }); });
  await pg.waitForTimeout(1500);
  console.log('bought:  ', JSON.stringify(await pg.evaluate(state)));
  await pg.screenshot({ path: join(out, 'kit-2-stations.png') });
  // a look at the stations: the camera put by hand (dev only)
  await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, k = P.kit; const at = (n) => k.stations[n].getWorldPosition(new P.camera.position.constructor());
    const a = at('tools'), s = at('sim'); P.cine({ pos: a.clone().add({ x: -3.1, y: 1.6, z: 1.1 }), at: a.clone().add({ x: 0, y: 0.6, z: 0 }), fov: 50, shift: 0 }, 0); });
  await pg.waitForTimeout(600); await pg.screenshot({ path: join(out, 'kit-3-tools.png') });
  await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, k = P.kit; const s = k.stations.sim.getWorldPosition(new P.camera.position.constructor());
    P.cine({ pos: s.clone().add({ x: -2.6, y: 1.7, z: -1.2 }), at: s.clone().add({ x: 0, y: 0.6, z: 0 }), fov: 50, shift: 0 }, 0); });
  await pg.waitForTimeout(600); await pg.screenshot({ path: join(out, 'kit-4-sim.png') });
  // a race weekend's pit box, then home again
  const track = JSON.parse(readFileSync(join(ROOT, '.devtest/auburn2.json'), 'utf8')); delete track.hidden; track.kerbs = track.kerbs || []; // (js/track.js mid-change trips on kerbs: null)
  await pg.evaluate(() => window.__svgp.dbg.pitGarage.close());
  await pg.evaluate((track) => window.__svgp.dbg.startWeekend(track, { mode: 'race', laps: 3, opponents: 3 }, 'setup'), track);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await settle('^pit$');
  console.log('pit box: ', JSON.stringify(await pg.evaluate(state)));
  await pg.screenshot({ path: join(out, 'kit-5-pitbox.png') });
  await pg.evaluate(() => { const d = window.__svgp.dbg; d.pitGarage.close(); d.openHub(); });
  await settle('^home:');
  console.log('home:    ', JSON.stringify(await pg.evaluate(state)));
} finally { await b.close(); server.kill(); }
