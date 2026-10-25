// dev: the race weekend garage's room and what's in it (js/pitboxes.js roomMeshes, models/pitbox.glb), the menu hidden,
// from five places round the car: in the door, from the back, each side, up high. Qualifying at TRACK (Spa by default).
//   [TRACK=...] [PITBOX=models/pitbox_v2.glb] [OLDROOM=1 (the old surfaces' textures)] node .devtest/pitroomlook.mjs <outdir> [tag]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp', TAG = process.argv[3] || 'room';
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  if (process.env.PITBOX) await pg.addInitScript((u) => { window.__SVGP_PITBOX_GLB = u; }, process.env.PITBOX);
  if (process.env.OLDROOM) await pg.addInitScript(() => { window.__SVGP_TEXTURES = { pit_epoxy: 'assets/textures/industrial_concrete_floor.png', pit_panel: 'assets/textures/plaster_wall.png', pit_ceiling: 'assets/textures/corrugated_metal.png' }; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async (TRACK) => {
    const real = (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    real.env.weather = 'clear'; real.env.time = 'day';
    window.__svgp.dbg.startWeekend(real, { mode: 'race', laps: 3, opponents: 5, pick: false }, 'setup', 'quali', [1200, 600]);
  }, process.env.TRACK || 'Spa-Francorchamps');
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await pg.waitForTimeout(4000);
  await pg.evaluate(() => { for (const id of ['s-pitgarage', 'hud']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } });
  const views = [['door', 0.0, 0.18, 6.8], ['back', Math.PI * 0.95, 0.26, 7.4], ['left', Math.PI * 0.5, 0.2, 5.4], ['right', -Math.PI * 0.55, 0.2, 6.2], ['high', Math.PI * 0.8, 0.75, 8.5]];
  for (const [n, yaw, pitch, dist] of views) {
    await pg.evaluate(([yaw, pitch, dist]) => { const G = window.__svgp.dbg.pitGarage; G.orbit = { yaw, pitch, dist }; }, [yaw, pitch, dist]);
    await pg.waitForTimeout(2500); await pg.screenshot({ path: join(OUT, `${TAG}-${n}.png`) });
  }
  console.log('shot', TAG);
} finally { await b.close(); server.kill(); }
