// dev: World Career's Race Workshop (models/garage/shell_workshop.glb, tools/garage-workshop.py): the hub's shot, shots
// round the room, and a walk up the stairs, onto the landing and into the engineering office (your height on the way).
// FAC='all' by default (tools 2, sim, dyno, fab, data). Screenshots to argv[2].   [SHELL_WS=shell_workshop_<tag>] [SHOTS=1-front-corner,6-mess] node .devtest/workshopshot.mjs <outdir>
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
// Blender (x, y, z) in the workshop -> the game's room (BAY_1 at the origin, the door down +Z)
const g = (x, y, z) => ({ x: x + 8.0, y: z, z: -y - 3.0 - 6.5 });   // (the room sits with BAY_1 6.5 m in: pitgarage CAR_Z)
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  // SHELL=shell_workshop_<tag>: that build of the workshop (tools/garage-workshop.py WS_TAG) in place of shell_workshop.glb
  if (process.env.SHELL_WS) await pg.addInitScript((sh) => { const m = {}; for (const n of ['shell_lockup', 'shell_unit', 'shell_workshop', 'station_tools', 'station_tools2', 'station_dyno', 'station_fab', 'station_sim', 'station_data']) m[n] = `models/garage/${n}.glb`;
    m.shell_workshop = `models/garage/${sh}.glb`; window.__SVGP_KIT = m; }, process.env.SHELL_WS);
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  pg.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  // the main menu's Home Garage (nothing saved): the unit, with what's bought
  await pg.evaluate((fac) => { const d = window.__svgp.dbg; d.openHomeView(); d.homeView({ premises: 'workshop', fac: Object.fromEntries(fac.map(k => [k, k === 'tools' && fac.length > 4 ? 2 : 1])), car2: true }); }, FAC[0] === 'all' ? ['tools', 'sim', 'dyno', 'fab', 'data'] : FAC);
  await pg.waitForFunction(() => /^home:workshop/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 30000 }); await pg.waitForTimeout(2500);
  console.log('workshop:', JSON.stringify(await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, k = P.kit; return { custom: P.custom, shell: k && k.shell, stations: k && Object.keys(k.stations), nav: k && k.nav.map(n => n.name), screen: !!P.screen, car2: !!(P.car2 && P.car2.group.parent) }; })));
  await pg.screenshot({ path: join(out, 'ws-0-hub.png') });
  const shots = [['1-front-corner', g(-11.2, -8.4, 4.2), g(0, 3, 1.0)], ['2-door', g(-5.75, -8.6, 1.7), g(-4, 6, 1.5)],
    ['3-back-row', g(-3, -1.0, 1.7), g(-4, 8, 1.4)], ['4-mezz-front', g(-2, -6.5, 2.0), g(8, 0, 3.6)], ['5-reception', g(4.5, -7.8, 1.7), g(11.5, -5, 1.0)],
    ['6-mess', g(7.0, -2.5, 1.7), g(11, 3, 0.9)], ['7-office-up', g(6.8, -3.8, 4.7), g(10.5, 4, 3.6)], ['8-office-view', g(9, 0, 4.7), g(-8, -3, 0.5)],
    ['9-sim-room', g(10.8, -4.2, 4.7), g(10.5, -8.5, 3.6)], ['10-your-office', g(7.0, 4.9, 1.7), g(10, 8.8, 0.9)], ['11-dyno', g(-8.75, 2.5, 1.7), g(-8.75, 8, 1.0)]];
  const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  for (const [n, pos, at] of shots.filter(s => !only || only.includes(s[0]))) {
    await pg.evaluate(({ pos, at }) => { const P = window.__svgp.dbg.pitGarage, V = P.camera.position.constructor; P.cine({ pos: new V(pos.x, pos.y, pos.z), at: new V(at.x, at.y, at.z), fov: 62, shift: 0 }, 0); }, { pos, at });
    await pg.waitForTimeout(500); await pg.screenshot({ path: join(out, `ws-${n}.png`) });
  }
  if (!process.env.NOWALK) {
  // walk: Walk Around, from the foot of the stairs straight up them, onto the landing, then right into the office
  await pg.evaluate(() => window.__svgp.dbg.startWalk());
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 15000 }); await pg.waitForTimeout(1500);
  const at = () => pg.evaluate(() => { const w = window.__svgp.dbg.walk; return [+w.pos.x.toFixed(2), +w.pos.y.toFixed(2), +w.pos.z.toFixed(2)]; });
  await pg.evaluate((p) => { const w = window.__svgp.dbg.walk; w.pos.set(p.x, 0, p.z); w.heading = Math.PI; w.camYaw = Math.PI; w.camFrom = null; }, g(5.4, -1.6, 0));
  const ys = [];
  await pg.keyboard.down('KeyW');
  for (let i = 0; i < 16; i++) { await pg.waitForTimeout(400); ys.push(await at()); if (i === 6) await pg.screenshot({ path: join(out, 'ws-12-stairs.png') }); }
  await pg.keyboard.up('KeyW');
  console.log('up the stairs (x, y, z):', JSON.stringify(ys));
  await pg.evaluate(() => { const w = window.__svgp.dbg.walk; w.heading = Math.PI / 2; w.camYaw = Math.PI / 2; });
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(2200); await pg.keyboard.up('KeyW'); await pg.waitForTimeout(400);
  console.log('into the office:', JSON.stringify(await at()));
  await pg.screenshot({ path: join(out, 'ws-13-office-walk.png') });
  }
} finally { await b.close(); server.kill(); }
