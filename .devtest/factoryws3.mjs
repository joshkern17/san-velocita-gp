// dev: the Factory's composites shop (station_fab2) and machine shop (station_tools3), bought: shots through the
// machine shop's glass from the atrium and inside each. (A copy of factoryshot.mjs.)  node .devtest/factoryws3.mjs <outdir>
// -- from factoryshot.mjs: World Career's Factory (models/garage/shell_factory.glb, tools/garage-factory.py): the hub's shot, shots round it
// (the Boulevard, the bays through the glass, the workshops, the tunnel, upstairs), and a walk from the Boulevard into
// the bays and up the stairs to race ops (your height on the way). FAC='all' by default. Screenshots to argv[2].   [SHELL_WS=shell_factory_<tag>] [SHOTS=1-entrance] [NOWALK=1] node .devtest/factoryshot.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const FAC = (process.env.FAC || 'all').split(',');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
// Blender (x, y, z) in the factory -> the game's room (BAY_1 at the origin, the glass down +Z)
const g = (x, y, z) => ({ x: x + 4.0, y: z, z: -y - 0.3 - 6.5 });   // (the room sits with BAY_1 6.5 m in: pitgarage CAR_Z)
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  // SHELL=shell_workshop_<tag>: that build of the workshop (tools/garage-workshop.py WS_TAG) in place of shell_workshop.glb
  if (process.env.SHELL_WS) await pg.addInitScript((sh) => { const m = {}; for (const n of ['shell_lockup', 'shell_unit', 'shell_workshop', 'shell_factory', 'station_tools', 'station_tools2', 'station_dyno', 'station_fab', 'station_sim', 'station_data']) m[n] = `models/garage/${n}.glb`;
    m.shell_factory = `models/garage/${sh}.glb`; window.__SVGP_KIT = m; }, process.env.SHELL_WS);
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  pg.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  for (let k = 0; k < 6 && await pg.evaluate(() => window.__svgp.screen) === 's-boot'; k++) { await pg.keyboard.press('Enter'); await pg.waitForTimeout(800); }   // (past the title screen)
  // the main menu's Home Garage (nothing saved): the unit, with what's bought
  await pg.evaluate((fac) => { const d = window.__svgp.dbg; d.openHomeView(); d.homeView({ premises: 'factory', fac: { tools: 3, fab: 2, sim: 1, dyno: 1, data: 1 }, car2: true, busy: true }); });
  await pg.waitForFunction(() => /^home:factory/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 30000 }); await pg.waitForTimeout(2500);
  console.log('factory:', JSON.stringify(await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, k = P.kit; return { custom: P.custom, shell: k && k.shell, stations: k && Object.keys(k.stations), nav: k && k.nav.map(n => n.name), screen: !!P.screen, car2: !!(P.car2 && P.car2.group.parent) }; })));
  await pg.screenshot({ path: join(out, 'fa-0-hub.png') });
  const shots = [['m1-machine-glass', g(-6.5, 3.6, 1.7), g(-13.5, 5.5, 1.0)], ['m2-machine-in', g(-9.0, 0.7, 1.9), g(-14.5, 6.2, 1.0)], ['m3-machine-left', g(-18.5, 1.0, 1.8), g(-13, 6, 1.0)],
    ['c1-comp-door', g(-0.8, 6.9, 1.7), g(2.5, 12.5, 1.0)], ['c2-comp-in', g(5.6, 8.0, 2.1), g(1.5, 13.0, 1.0)], ['c3-comp-left', g(-2.6, 8.1, 2.0), g(3.4, 12.6, 1.0)]];
  const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  for (const [n, pos, at] of shots.filter(s => !only || only.includes(s[0]))) {
    await pg.evaluate(({ pos, at }) => { const P = window.__svgp.dbg.pitGarage, V = P.camera.position.constructor; P.cine({ pos: new V(pos.x, pos.y, pos.z), at: new V(at.x, at.y, at.z), fov: 62, shift: 0 }, 0); }, { pos, at });
    await pg.waitForTimeout(500); await pg.screenshot({ path: join(out, `fa-${n}.png`) });
  }
  if (!process.env.NOWALK) {
  // walk: Walk Around, from the foot of the stairs straight up them, onto the landing, then right into the office
  await pg.evaluate(() => window.__svgp.dbg.startWalk());
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 15000 }); await pg.waitForTimeout(1500);
  const at = () => pg.evaluate(() => { const w = window.__svgp.dbg.walk; return [+w.pos.x.toFixed(2), +w.pos.y.toFixed(2), +w.pos.z.toFixed(2)]; });
  // from the Boulevard: in through the doorway by the stairs, up them, along the left walkway, into your office
  const walkTo = async (heading, ms) => { await pg.evaluate((h) => { const w = window.__svgp.dbg.walk; w.heading = h; w.camYaw = h; }, heading); await pg.keyboard.down('KeyW'); await pg.waitForTimeout(ms); await pg.keyboard.up('KeyW'); await pg.waitForTimeout(300); return at(); };
  await pg.evaluate((p) => { const w = window.__svgp.dbg.walk; w.pos.set(p.x, 0, p.z); w.camFrom = null; }, g(-5.7, -8.6, 0));
  console.log('through the doorway:', JSON.stringify(await walkTo(Math.PI, 2400)));
  await pg.evaluate((p) => { const w = window.__svgp.dbg.walk; w.pos.set(p.x, 0, p.z); }, g(-7.3, -5.9, 0));
  const ys = [];
  await pg.evaluate(() => { const w = window.__svgp.dbg.walk; w.heading = Math.PI; w.camYaw = Math.PI; }); await pg.keyboard.down('KeyW');
  for (let i = 0; i < 18; i++) { await pg.waitForTimeout(400); ys.push(await at()); if (i === 7) await pg.screenshot({ path: join(out, 'fa-13-stairs.png') }); }
  await pg.keyboard.up('KeyW');
  console.log('up the stairs (x, y, z):', JSON.stringify(ys));
  console.log('onto the walkway:', JSON.stringify(await walkTo(-Math.PI / 2, 1200)), 'along it:', JSON.stringify(await walkTo(0, 2600)), 'into the office:', JSON.stringify(await walkTo(-Math.PI / 2, 1800)));
  await pg.screenshot({ path: join(out, 'fa-14-office-walk.png') });
  }
} finally { await b.close(); server.kill(); }
