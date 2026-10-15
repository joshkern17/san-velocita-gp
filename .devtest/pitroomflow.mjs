// dev: the garage in your box through a weekend (js/pitgarage.js useTrack): go out, come back, the next session, home's
// room after. Prints what it finds; FAIL lines are problems. node .devtest/pitroomflow.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
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
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    const { presetTracks } = await import('/js/track.js');
    const t = presetTracks().find(q => q.name === 'Pinewood Sprint'); t.env.weather = 'clear';
    window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: 5, pick: false }, 'setup', 'full', [600, 300]);
  });
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  const state = () => pg.evaluate(() => {
    const g = window.__svgp, G = g.dbg.pitGarage, sim = g.sim, a = G.track && G.track.a;
    const inScene = (o) => { let p = o; while (p && p.parent) p = p.parent; return p; };
    return { screen: g.screen, kind: sim && sim.quali && sim.quali.kind, track: !!G.track, anchorInSim: !!(a && inScene(a) === sim.scene), hold: !!(sim && sim.camHold),
      camRoot: inScene(G.camera) === G.scene ? 'garage' : inScene(G.camera) === (sim && sim.scene) ? 'sim' : 'other', carIn: !!(G.car && G.car.group.parent === G.bay),
      simCamToCar: sim && sim.player ? +sim.camera.position.distanceTo(sim.player.model.group.position).toFixed(1) : null,
      pitGarages: sim ? sim.scene.children.filter(o => o.name === 'PitGarage').length : 0, bay: G.bay.visible };
  });
  let s = await state(); console.log(JSON.stringify(s));
  check(s.track && s.anchorInSim && s.hold && s.camRoot === 'sim' && s.carIn, 'practice opens in your box');
  // the session camera follows ours
  await pg.waitForTimeout(800);
  const d = await pg.evaluate(() => { const G = window.__svgp.dbg.pitGarage, sim = window.__svgp.sim; return sim.camera.position.distanceTo(G.camera.getWorldPosition(G.camera.position.clone())); });
  check(d < 0.5, `session camera with ours (${d.toFixed(2)} m)`);
  // the desk: the glass where it should be on screen
  await pg.evaluate(() => window.__svgp.dbg.pitGarage.setDesk(true));
  await pg.waitForFunction(() => window.__svgp.dbg.pitGarage.atDesk, null, { timeout: 60000, polling: 200 });
  await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => window.__svgp.dbg.pitGarage.screenRect());
  console.log('glass', JSON.stringify(r));
  check(r && r.x > 400 && r.x + r.w < 1280 && r.y > 0 && r.y + r.h < 720 && r.w > 500, 'desk: the glass right of the menu, on screen');
  await pg.evaluate(() => window.__svgp.dbg.pitGarage.setDesk(false));
  // out on track
  await pg.evaluate(() => { [...document.querySelectorAll('#m-pitgarage .item')].find(e => /Drive Out/i.test(e.textContent)).click(); });
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 20000 });
  await pg.waitForTimeout(1500);
  s = await state(); console.log(JSON.stringify(s));
  check(!s.hold && s.simCamToCar < 15, 'driving: the session camera is back on the car');
  check(!s.bay, "driving: the garage's copy of the car isn't left in the box");
  // back in
  await pg.evaluate(() => { const g = window.__svgp; g.sim.enterGarage(g.sim.player); g.handleRaceEvents(); });
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 20000 });
  s = await state(); console.log(JSON.stringify(s));
  check(s.track && s.hold && s.pitGarages === 1 && s.bay, 'back in your box, the car in it');
  // the next session: a new world, the box in it
  await pg.evaluate(() => window.__svgp.sim.qualiEnd());
  await pg.waitForFunction(() => window.__svgp.screen === 's-results', null, { timeout: 30000 });
  await pg.evaluate(() => { [...document.querySelectorAll('#s-results .item')].find(e => /Qualifying/.test(e.textContent)).click(); });
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage' && window.__svgp.sim.quali.kind === 'quali', null, { timeout: 120000 });
  s = await state(); console.log(JSON.stringify(s));
  check(s.track && s.anchorInSim && s.hold && s.pitGarages === 1, "qualifying opens in the new session's box");
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: process.argv[2] ? join(process.argv[2], 'flow-quali.png') : '/dev/null' }).catch(() => {});
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
