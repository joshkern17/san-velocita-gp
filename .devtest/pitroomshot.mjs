// dev: the race weekend's garage (js/pitgarage.js): the menu's shot, the desk's, the tuning orbit, at your real box on
// the track (js/pitboxes.js). [TRACK='Pinewood Sprint' | 'Spa-Francorchamps'] node .devtest/pitroomshot.mjs [outdir] [day|night]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp', TIME = process.argv[3] || 'day';
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 300)); });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  if (process.env.NOGLB) await pg.addInitScript(() => { window.__SVGP_GARAGE_GLB = 'models/none.glb'; }); // (no garage model: the fallback desk)
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([TIME, TRACK]) => {
    const { presetTracks } = await import('/js/track.js');
    const real = TRACK && (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    const t = real || presetTracks().find(q => q.name === (TRACK || 'Pinewood Sprint')); t.env.weather = 'clear'; t.env.time = TIME;
    window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: 5, pick: false }, 'setup', 'quali', [1200, 600]);
  }, [TIME, process.env.TRACK]);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  const pgx = () => pg.evaluate(() => { const G = window.__svgp.dbg.pitGarage, c = G.camera; c.updateMatrixWorld(); const p = c.getWorldPosition(c.position.clone()); return { track: !!G.track, cam: p.toArray().map(v => +v.toFixed(2)), screen: !!G.screen }; });
  // (headless draws slowly: wait for the camera to get there, not a fixed time)
  const settle = () => pg.waitForFunction(() => { const G = window.__svgp.dbg.pitGarage; if (G.orbit) { const c = G.camera.position; G._lp = G._lp || c.clone(); const d = G._lp.distanceTo(c); G._lp.copy(c); return d < 0.002; } return G.blendK >= 1; }, null, { timeout: 60000, polling: 300 }).catch(() => console.log('not settled'));
  const shot = async (name, wait = 1800) => { await pg.waitForTimeout(wait); await settle(); await pg.screenshot({ path: join(OUT, name) }); console.log('shot', name, JSON.stringify(await pgx())); };
  await shot(`pg-menu-${TIME}.png`, 3000);
  await pg.evaluate(() => window.__svgp.dbg.pitGarage.setDesk(true));
  await shot(`pg-desk-${TIME}.png`);
  await pg.evaluate(() => { const G = window.__svgp.dbg.pitGarage; G.setDesk(false); G.look(0); G.look(2.4, 0.1, 0.9); });
  await shot(`pg-orbit-${TIME}.png`);
  await pg.evaluate(() => { const G = window.__svgp.dbg.pitGarage; G.look(-1.2, -0.2, 1.2); });
  await shot(`pg-orbit2-${TIME}.png`);
  // from the back of the box, out of the door: the pit lane
  await pg.evaluate(() => { const G = window.__svgp.dbg.pitGarage; G.orbit = { yaw: Math.PI * 0.92, pitch: 0.22, dist: 7.2 }; });
  await shot(`pg-out-${TIME}.png`);
} finally { await b.close(); server.kill(); }
