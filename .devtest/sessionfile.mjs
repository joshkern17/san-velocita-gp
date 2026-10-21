// dev: a short autopilot race (you on the AI too), then the session file js/session.js would save → .devtest/out/session.json
//   node .devtest/sessionfile.mjs [car] [laps]     TRK=/tracks/real/roadatlanta.json OPP=11     then: node tools/session.mjs .devtest/out/session.json
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', laps = +(process.argv[3] || 2);
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, laps, trk, opp]) => {
    const t = await (await fetch(trk)).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.difficulty = 'alien'; S.grid = 'back';
    window.__svgp.startRace(t, { mode: 'race', laps, opponents: opp, aiChassis: 'class', car: S.car }, 'menu');
  }, [id, laps, process.env.TRK || '/.devtest/auburn2.json', +(process.env.OPP || 5)]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 0 && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const t0 = Date.now();
  const f = await pg.evaluate(async () => {
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false; window.__svgp.sim = null;
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    let k = 0; while (sim.state === 'racing' && k < 60 * 60 * 10) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); k++; }
    const { sessionFile } = await import('/js/session.js');
    return JSON.stringify(sessionFile(sim));
  });
  fs.mkdirSync(join(ROOT, '.devtest/out'), { recursive: true });
  fs.writeFileSync(join(ROOT, '.devtest/out/session.json'), f);
  console.log(`${(f.length / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} finally { await b.close(); server.kill(); }
