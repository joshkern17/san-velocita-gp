// dev: World Career's Industrial unit (models/garage/shell_unit.glb, tools/garage-unit.py): the hub's shot, shots round
// the room, and a walk up the stairs to the mezzanine (your height on the way). FAC='tools,sim' (what's bought; 'all'
// for dyno/fab/data too: their junk goes). Screenshots to argv[2].   node .devtest/unitshot.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const FAC = (process.env.FAC || 'tools,sim').split(',');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
// Blender (x, y, z) in the unit -> the game's room (BAY_1 at the origin, the door down +Z)
const g = (x, y, z) => ({ x: x - 2.3, y: z, z: -y - 2.7 - 6.5 });   // (the room sits with BAY_1 6.5 m in: pitgarage CAR_Z)
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  pg.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  // the main menu's Home Garage (nothing saved): the unit, with what's bought
  await pg.evaluate((fac) => { const d = window.__svgp.dbg; d.openHomeView(); d.homeView({ premises: 'unit', fac: Object.fromEntries(fac.map(k => [k, k === 'tools' && fac.length > 4 ? 2 : 1])), car2: true }); }, FAC[0] === 'all' ? ['tools', 'sim', 'dyno', 'fab', 'data'] : FAC);
  await pg.waitForFunction(() => /^home:unit/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 30000 }); await pg.waitForTimeout(2500);
  console.log('unit:', JSON.stringify(await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, k = P.kit; return { custom: P.custom, shell: k && k.shell, stations: k && Object.keys(k.stations), nav: k && k.nav.map(n => n.name), screen: !!P.screen, car2: !!(P.car2 && P.car2.group.parent) }; })));
  await pg.screenshot({ path: join(out, 'unit-0-hub.png') });
  const shots = [['1-front-corner', g(-7.2, -6.6, 3.3), g(2, 4, 1.2)], ['2-from-rail', g(-3, 3.9, 4.4), g(3, -3, 0.5)], ['3-door', g(3.8, -6.7, 1.7), g(1, 4, 1.5)],
    ['4-right', g(1.8, -5.8, 1.8), g(7.5, -1, 1.3)], ['5-break', g(2.6, 1.2, 1.6), g(0.5, 6.5, 0.8)], ['6-left', g(-2, -5.2, 2.0), g(-7.5, 0, 0.8)],
    ['7-mezz', g(6.2, 3.9, 4.3), g(-6, 6.2, 2.9)], ['8-desk', g(2.4, 2.6, 1.7), g(6.5, 6.6, 0.9)]];
  for (const [n, pos, at] of shots) {
    await pg.evaluate(({ pos, at }) => { const P = window.__svgp.dbg.pitGarage, V = P.camera.position.constructor; P.cine({ pos: new V(pos.x, pos.y, pos.z), at: new V(at.x, at.y, at.z), fov: 62, shift: 0 }, 0); }, { pos, at });
    await pg.waitForTimeout(500); await pg.screenshot({ path: join(out, `unit-${n}.png`) });
  }
  // walk: Walk Around, then from the foot of the stairs straight up them (the camera behind), onto the deck
  await pg.evaluate(() => window.__svgp.dbg.startWalk());
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 15000 }); await pg.waitForTimeout(1500);
  await pg.evaluate((p) => { const w = window.__svgp.dbg.walk; w.pos.set(p.x, 0, p.z); w.heading = Math.PI; w.camYaw = Math.PI; w.camFrom = null; }, g(7.3, -1.2, 0));
  const ys = [];
  await pg.keyboard.down('KeyW');
  for (let i = 0; i < 14; i++) { await pg.waitForTimeout(400); ys.push(await pg.evaluate(() => { const w = window.__svgp.dbg.walk; return [+w.pos.x.toFixed(2), +w.pos.y.toFixed(2), +w.pos.z.toFixed(2)]; })); if (i === 5) await pg.screenshot({ path: join(out, 'unit-9-stairs.png') }); }
  await pg.keyboard.up('KeyW');
  console.log('up the stairs (x, y, z):', JSON.stringify(ys));
  // along the deck to the left, then look down at the bays
  await pg.evaluate(() => { const w = window.__svgp.dbg.walk; w.heading = -Math.PI / 2; w.camYaw = -Math.PI / 2; });
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(2500); await pg.keyboard.up('KeyW');
  console.log('along the deck:', JSON.stringify(await pg.evaluate(() => { const w = window.__svgp.dbg.walk; return [+w.pos.x.toFixed(2), +w.pos.y.toFixed(2), +w.pos.z.toFixed(2)]; })));
  await pg.evaluate(() => { const w = window.__svgp.dbg.walk; w.heading = 0; w.camYaw = 0.25; });
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(1500); await pg.keyboard.up('KeyW'); await pg.waitForTimeout(400);
  console.log('at the rail:', JSON.stringify(await pg.evaluate(() => { const w = window.__svgp.dbg.walk; return [+w.pos.x.toFixed(2), +w.pos.y.toFixed(2), +w.pos.z.toFixed(2)]; })));
  await pg.screenshot({ path: join(out, 'unit-10-rail.png') });
} finally { await b.close(); server.kill(); }
