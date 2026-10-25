// dev: the tower's intervals and the intro camera's step per frame (node .devtest/intervals.mjs)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 7, aiChassis: 'class', grid: 'back', strategy: false, car: window.__svgp.settings.car }, 'menu');
  });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const out = await pg.evaluate(() => {
    const sim = window.__svgp.sim, o = [];
    sim.state = 'intro'; sim.stateT = 0;
    const steps = []; let prev = null;
    for (let f = 0; f < 190 && sim.state === 'intro'; f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0 }, {});
      const p = sim.camera.position.clone(); if (prev) steps.push(p.distanceTo(prev)); prev = p;
    }
    const jerk = steps.slice(1).map((s, k) => Math.abs(s - steps[k]));
    o.push(`intro: ${steps.length} frames, step max ${Math.max(...steps).toFixed(3)} m, worst frame-to-frame change ${Math.max(...jerk).toFixed(3)} m`);
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    for (let f = 0; f < 60 * 50; f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0 }, {});
      if (f % 600 === 599) o.push(`t${sim.raceTime.toFixed(0)}: ` + sim.hudState().standings.map(r => r.gap || 'L').join(' '));
    }
    // flicker: how often the shown interval changes over 3 s
    const ch = new Map(); let last = null;
    for (let f = 0; f < 180; f++) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0 }, {}); const g = sim.hudState().standings.map(r => r.name + r.gap); if (last) g.forEach((x, k) => { if (x !== last[k]) ch.set(k, (ch.get(k) || 0) + 1); }); last = g; }
    o.push('changes per row in 3 s: ' + [...ch.entries()].map(([k, n]) => `P${k + 1}:${n}`).join(' '));
    const seq = []; let lg = null;
    for (let f = 0; f < 180; f++) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0 }, {}); const st = sim.hudState().standings; const g = st.map(r => r.gap).join(' '); if (g !== lg) seq.push(sim.raceTime.toFixed(2) + ' ' + g); lg = g; }
    o.push(seq.join('\n'));
    return o.join('\n');
  });
  console.log(out);
} finally { await b.close(); server.kill(); }
