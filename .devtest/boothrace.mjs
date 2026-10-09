// dev: the booth's director (js/broadcast.js) on a real AI race (you on the autopilot): every moment it noticed, and
// what it actually put on air, when. Each exchange "plays" for its clip's real length (assets/voice/manifest.json is
// read for the ids; a flat 10 s, as clip lengths aren't stored). node .devtest/boothrace.mjs [laps] [seed]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const laps = +(process.argv[2] || 3), seed = +(process.argv[3] || 3);
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([laps, seed]) => {
    let a = seed * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.commentary = 'full'; S.grid = 'middle'; S.damage = 'high';
    window.__svgp.startRace(t, { mode: 'race', laps, opponents: 11, aiChassis: 'class', car: S.car }, 'menu');
  }, [laps, seed]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 0 && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const out = await pg.evaluate(async () => {
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false; window.__svgp.sim = null;
    const bc = sim.bc; if (!bc) return { err: 'no director (commentary off?)' };
    const m = await (await fetch('/assets/voice/manifest.json')).json();
    bc.lines = new Set(Object.keys(m.booth));
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    const noticed = {}, said = [];
    const note = bc.note.bind(bc); bc.note = (id, cars, o) => { noticed[id] = (noticed[id] || 0) + 1; note(id, cars, o); };
    let talk = -1, f = 0;
    while ((sim.state === 'racing' || (sim.state === 'finished' && sim.stateT < 4)) && f < 60 * 60 * 12) {
      bc.busy = sim.raceTime < talk;
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); f++;
      for (const e of sim.events) if (e.type === 'booth') { said.push(`${sim.raceTime.toFixed(0).padStart(4)}s lap ${sim.order[0].lap}  ${e.id}${e.force ? '  (cut in)' : ''}${e.cap ? `   [${e.cap.tag} ${e.cap.name} · ${e.cap.sub}]` : ''}`); talk = sim.raceTime + 10; }
      sim.events.length = 0;
    }
    return { time: sim.raceTime.toFixed(0), said, noticed, winner: sim.finishOrder[0] && sim.finishOrder[0].name };
  });
  if (out.err) console.log(out.err);
  else {
    console.log(`race: ${out.time} s, won by ${out.winner}\nON AIR (${out.said.length}):\n  ${out.said.join('\n  ')}`);
    console.log('noticed (frames a moment was up for consideration):', Object.entries(out.noticed).map(([k, v]) => `${k} ${v}`).join(', '));
  }
} finally { await b.close(); server.kill(); }
