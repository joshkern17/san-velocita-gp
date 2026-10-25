// dev: your pit stop (F8's), frame by frame: nobody jumps (a crew member's hips moving more than a stride in a frame),
// and the car never drives through anybody (while it's moving, nobody's hips inside its body, plus a margin).
// FAIL lines are problems.   node .devtest/stopclear.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async (car) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.startRace(t, { mode: 'race', laps: 10, opponents: 5, grid: 'back', strategy: false, extra: { car: car ? { ...window.__svgp.settings.car, chassis: car } : window.__svgp.settings.car, strategy: false, grid: 'back' } }, 'menu');
  }, process.env.CAR || null);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV && window.__svgp.sim.pitLife, null, { timeout: 180000 });
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 60000 }).catch(() => {});
  await pg.evaluate(() => { const sim = window.__svgp.sim; sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9; });
  await pg.waitForTimeout(500);
  await pg.evaluate(([t, tw]) => { window.__tw = tw; window.__trace = t; window.__svgp.sim.devPitStop(); }, [process.env.TRACE || '', process.env.TW ? process.env.TW.split('-').map(Number) : null]);
  const r = await pg.evaluate(() => {
    const sim = window.__svgp.sim, p = sim.player, b = sim.pitLife.boxes.find(x => x.mine), V = sim.camera.position.constructor;
    const P = p.phys.p, hw = (P.track ?? 1.6) / 2 + 0.25, fr = (P.body ? P.body[0] : (P.a ?? 1.6) + 0.9) + 0.15, rr = (P.body ? P.body[1] : (P.b ?? 1.6) + 0.9) + 0.15;
    const dodges = new Map(), TRACE = (window.__trace || '').split(','), trace = [], last = new Map(), jumps = [], hits = new Map(); let started = false, phases = [];
    for (let i = 0; i < 60 * 45; i++) {
      sim.update(1 / 60, { steer: 0, throttle: p.pitPhase === 'out' ? 0.7 : 0, brake: 0 }, {}); // (you drive it out)
      if (b.phase !== 'home') started = true;
      if (phases[phases.length - 1] !== b.phase + '/' + p.pitPhase) phases.push(b.phase + '/' + p.pitPhase);
      if (!started) continue;
      const visible = b.group.visible;
      for (const m of b.crew) {
        m.ch.object.updateMatrixWorld(true);
        const h = (m._hipsT ||= m.ch.bone('Hips')).getWorldPosition(new V());
        const l = last.get(m);
        if (l && visible && l.vis3 && Math.hypot(h.x - l.x, h.z - l.z) > 0.12) jumps.push(`${m.role} ${Math.hypot(h.x - l.x, h.z - l.z).toFixed(2)}m @${i} ${b.phase} ${m.mc ? m.mc.clip + '@' + m.ch.action.time.toFixed(2) : m.ch.clip}`);
        if (m.dg) { const d = Math.hypot(m.dg.x, m.dg.z), k = m.role + (m.mc ? ' (take)' : ''); if (d > (dodges.get(k) || 0)) dodges.set(k, +d.toFixed(2)); }
        last.set(m, { x: h.x, z: h.z, vis: visible, vis2: visible && !!(l && l.vis), vis3: visible && !!(l && l.vis2) });
        if (TRACE.includes(m.role) && (window.__tw ? i >= window.__tw[0] && i <= window.__tw[1] : i % 6 === 0)) trace.push(`${i} ${m.role} obj ${m.ch.object.position.x.toFixed(1)},${m.ch.object.position.z.toFixed(1)} hip ${h.x.toFixed(2)},${h.z.toFixed(2)} clip ${m.ch.clip} t${m.ch.action ? m.ch.action.time.toFixed(2) : '-'} k${m.k.toFixed(2)} yaw${m.yaw.toFixed(2)} dg${m.dg ? m.dg.x.toFixed(2) + ',' + m.dg.z.toFixed(2) : '-'} m ${m.x.toFixed(1)},${m.z.toFixed(1)} fo ${m.fo ? m.fo.x.toFixed(1) + ',' + m.fo.z.toFixed(1) + ' t' + m.fo.t.toFixed(2) : '-'} mc ${m.mc ? m.mc.ox.toFixed(1) + ',' + m.mc.oz.toFixed(1) : '-'} vis ${visible}`);
        if (false) { const dx = h.x - p.phys.x, dz = h.z - p.phys.z; trace.push(`${i} ${m.role} ${b.phase}/${p.pitPhase} v${p.phys.speed.toFixed(1)} f${(dx * Math.sin(p.phys.h) + dz * Math.cos(p.phys.h)).toFixed(2)} s${(dx * Math.cos(p.phys.h) - dz * Math.sin(p.phys.h)).toFixed(2)} ${m.mc ? m.mc.clip + '@' + m.ch.action.time.toFixed(2) + (m.mc.go ? 'G' : '') : m.ch.clip} t${(m.tx - p.phys.x).toFixed(1)},${(m.tz - p.phys.z).toFixed(1)} vis${visible ? 1 : 0}`); }
        // inside the moving car's body?
        if (p.phys.speed > 0.3 && visible) {
          const dx = h.x - p.phys.x, dz = h.z - p.phys.z, f = dx * Math.sin(p.phys.h) + dz * Math.cos(p.phys.h), s = dx * Math.cos(p.phys.h) - dz * Math.sin(p.phys.h);
          if (f < fr && f > -rr && Math.abs(s) < hw) { const k = m.role + ' ' + b.phase + '/' + p.pitPhase; hits.set(k, (hits.get(k) || 0) + 1); }
        }
      }
      if (b.phase === 'home' && p.pitPhase === 'out' && b.crew.every(m => Math.hypot(m.tx - m.x, m.tz - m.z) < 0.06)) break;
    }
    return { dodges: [...dodges], trace, phases, jumps: jumps.slice(0, 60), nj: jumps.length, hits: [...hits] };
  });
  for (const t of r.trace) console.log(t);
  console.log('car', await pg.evaluate(() => window.__svgp.sim.player.carId), r.phases.join(' > '));
  console.log('stepped aside (m):', r.dodges.map(d => d.join(' ')).join(', ') || 'nobody');
  for (const j of r.jumps) console.log('  jump', j);
  for (const h of r.hits) console.log('  hit', h.join(' x'));
  check(r.nj === 0, `nobody jumps (${r.nj})`);
  check(r.hits.length === 0, `the car drives through nobody (${r.hits.length})`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
