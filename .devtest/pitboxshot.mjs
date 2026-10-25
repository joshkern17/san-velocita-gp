// dev: the race weekend's pit box model (js/pitbox.js), in your box at the track in qualifying, crew on: the garage
// menu's shot and five from inside the box (from the door, from the back, the left wall, the right wall, the island),
// then whether the crew sit at the computers and Drive Out pushes the car out of the door.
//   [TRACK='Spa-Francorchamps'] [GLB=models/pitbox_v2.glb] node .devtest/pitboxshot.mjs <outdir> [tag]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp', TAG = process.argv[3] || (process.env.GLB ? 'new' : 'old');
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0;
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  if (process.env.GLB) await pg.addInitScript((u) => { window.__SVGP_PITBOX_GLB = u; }, process.env.GLB);
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async (TRACK) => {
    const real = (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    real.env.weather = 'clear'; real.env.time = 'day';
    window.__svgp.dbg.startWeekend(real, { mode: 'race', laps: 3, opponents: 7, pick: false }, 'setup', 'quali', [1200, 600]);
  }, process.env.TRACK || 'Spa-Francorchamps');
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage' && window.__svgp.sim && window.__svgp.sim.pitLife && window.__svgp.sim.pitLife.boxModel, null, { timeout: 180000, polling: 500 });
  await pg.waitForTimeout(6000);
  await pg.screenshot({ path: join(OUT, `${TAG}-menu.png`) });
  // inside the box: the garage's orbit round the car (the menu's camera), five ways round, from high and far back
  await pg.addStyleTag({ content: '#s-pitgarage { visibility: hidden !important; }' });   // (the room, not the menu)
  await pg.evaluate(() => { const G = window.__svgp.dbg.pitGarage; G.look(0); });
  const shots = [['door', 0.0], ['back', Math.PI], ['left', Math.PI * 0.55], ['right', Math.PI * 1.45], ['island', Math.PI * 0.8], ['over', Math.PI * 0.9, 0.85, 9]];
  for (const [n, yaw, pitch = 0.3, dist = 8.5] of shots) {
    await pg.evaluate(({ yaw, pitch, dist }) => { const G = window.__svgp.dbg.pitGarage; G.orbit = { yaw, pitch, dist }; }, { yaw, pitch, dist });
    await pg.waitForTimeout(1500);
    await pg.waitForFunction(() => { const G = window.__svgp.dbg.pitGarage, c = G.camera.position; G._lp = G._lp || c.clone(); const d = G._lp.distanceTo(c); G._lp.copy(c); return d < 0.002; }, null, { timeout: 20000, polling: 300 }).catch(() => {});
    await pg.screenshot({ path: join(OUT, `${TAG}-${n}.png`) });
  }
  await pg.evaluate(() => { const G = window.__svgp.dbg.pitGarage; G.orbit = null; G.look(0); });
  await pg.addStyleTag({ content: '#s-pitgarage { visibility: visible !important; }' }); await pg.waitForTimeout(1500);
  // the crew: who's sat at a computer, in yours and across the lane
  const crew = await pg.evaluate(() => {
    const L = window.__svgp.sim.pitLife, out = { seatsInModel: L.boxModel.seatsT.length, boxes: 0, seated: 0, people: 0, mineSeated: 0 };
    for (const bx of L.boxes) if (bx.brain) { out.boxes++; for (const p of bx.brain.people) { out.people++; if (p.seat) { out.seated++; if (bx.mine) out.mineSeated++; } } }
    return out;
  });
  console.log(TAG, 'crew', JSON.stringify(crew));
  if (!crew.seatsInModel || !crew.seated) { console.log('FAIL nobody sits at the computers'); fails++; }
  // Drive Out: Enter on the menu's first item; the crew push the car out of the door
  await pg.evaluate(() => window.__svgp.dbg.pitGarage.cine && 0);
  await pg.keyboard.press('Enter');
  const t0 = Date.now(); let res = null;
  while (Date.now() - t0 < 45000) {
    res = await pg.evaluate(() => { const c = window.__svgp.dbg.carPush, s = window.__svgp.sim; return { phase: c.phase, active: c.active, screen: window.__svgp.screen, lane: s && s.player ? +(s.player.pitting ? 1 : 0) : null }; });
    if (res.screen === 'hud') break;
    await pg.waitForTimeout(700);
  }
  console.log(TAG, 'drive out', JSON.stringify(res), `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (!res || res.screen !== 'hud') { console.log('FAIL Drive Out never got the car out'); fails++; }
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'ok'); process.exit(fails ? 1 : 0);
