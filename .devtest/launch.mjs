// dev: how quickly the AI gets off the line. A standing start (Auburn, you at the back, everyone AI-driven), and per car:
// speed at 2/4/6/10 s, mean throttle over the first 6 s, metres gained on the car's own grid slot, and how far behind
// a lone car of the same model (no one around it) each one is at 10 s
//   node .devtest/launch.mjs [car] [opponents]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', opp = +(process.argv[3] || 9);
const run = async (opp, id) => {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, opp]) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: opp, aiChassis: 'class', grid: 'back', car: window.__svgp.settings.car }, 'menu');
  }, [id, opp]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 0 && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const out = await pg.evaluate(() => {
    const sim = window.__svgp.sim;
    sim.state = 'racing'; sim.stateT = 0; sim.goAt = 0; sim.player.autoT = 1e9;
    for (const c of sim.cars) { c._p0 = c.raw ?? 0; c._thr = 0; c._v = []; c._s0 = c.s; }
    const lim = {};
    for (let f = 0; f < 600; f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      for (const c of sim.cars) { if (f < 360) c._thr += (c.ctl.throttle || 0) / 360; if ([120, 240, 360, 599].includes(f)) c._v.push(Math.round(c.phys.speed * 3.6)); if (f % 30 === 0) (c._s ||= []).push(c.s.toFixed(1)); if (f % 15 === 0 && f <= 180) (c._tr ||= []).push(`${(c.phys.speed*3.6).toFixed(0)}k gR${(c.phys.gripR||0).toFixed(2)} gF${(c.phys.gripF||0).toFixed(2)} t${(c.ctl.throttle||0).toFixed(2)} sr${(c.phys.slipR||0).toFixed(2)} g${c.phys.gear}`); }
    }
    return sim.cars.map(c => ({ n: c.isPlayer ? 'YOU(ai)' : c.name, grid: c.startPos, pace: c.ai ? +c.ai.pace.toFixed(3) : null, react: c.ai ? +c.ai.react.toFixed(2) : null, v: c._v, thr: +c._thr.toFixed(2), d10: Math.round(c.progress), pos: c.pos, lane: c._s.slice(0, 12).join(' '), tr: c._tr.join(' | '), pm: +c.phys.powerMul.toFixed(3), tc: c.phys.tc, id: c.carId, aids: JSON.stringify({ aid: c.phys.aid, launch: c.launch, gm: c.phys.gripMul, mass: c.phys.p.mass, auto: c.phys.auto }) }));
  });
  await pg.close(); return out;
};
try {
  const field = await run(opp, id), solo = {};
  for (const m of new Set(field.map(c => c.id))) { const r = (await run(0, m))[0]; solo[m] = r.d10; if (process.env.TR) console.log('alone', m, r.aids, r.tr); }
  console.log('solo progress @10s by model:', JSON.stringify(solo));
  let lost = 0;
  for (const c of field.sort((a, b) => a.grid - b.grid)) {
    const d = c.d10 - solo[c.id] + (c.grid - 1) * 8; lost += d;
    console.log(`P${String(c.grid).padStart(2)}→P${String(c.pos).padStart(2)} ${c.n.padEnd(16)} ${c.id.padEnd(11)} react ${c.react} kmh@2/4/6/10 ${c.v.join('/')}  thr0-6s ${c.thr}  ${d} m vs its model alone\n      lane: ${c.lane}` + (process.env.TR ? `\n      pm ${c.pm} ${c.aids}: ${c.tr}` : ''));
  }
  console.log(`mean ${(lost / field.length).toFixed(1)} m vs alone at 10 s`);
} finally { await b.close(); server.kill(); }
