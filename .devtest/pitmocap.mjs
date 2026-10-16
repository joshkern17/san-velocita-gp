// dev: the pit crew's mocap (js/pitlife.js MOCAP), close up: an AI car pits, pictures through the stop from beside
// the car and from ahead of it.   node .devtest/pitmocap.mjs [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp', TIME = process.argv[3] || 'day';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 200)); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async (TIME) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; t.env.time = TIME;
    window.__svgp.startRace(t, { mode: 'race', laps: 10, opponents: 7, grid: 'back', strategy: false, car: window.__svgp.settings.car }, 'menu');
  }, TIME);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV && window.__svgp.sim.pitLife, null, { timeout: 120000 });
  await pg.waitForFunction(() => window.__svgp.sim.pitLife.boxes.some(b => b.crew.length), null, { timeout: 30000 }).catch(() => console.log('no crews'));
  const info = await pg.evaluate(() => {
    const sim = window.__svgp.sim, pl = sim.pitLife;
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    window.__fixCam = null; const uc = sim.updateCamera.bind(sim);
    sim.updateCamera = (dt) => { if (window.__fixCam) { sim.camera.position.copy(window.__fixCam[0]); sim.camera.lookAt(window.__fixCam[1]); } else uc(dt); };
    return { boxes: pl.boxes.length, crews: pl.boxes.filter(b => b.crew.length).length, names: pl.boxes.map(b => b.sign.key + ' ' + b.team.name) };
  });
  console.log(JSON.stringify(info));
  // camera helpers: stand in the lane near box k looking along / at the box
  const look = (k, mode) => pg.evaluate(([k, mode]) => {
    const sim = window.__svgp.sim, pl = sim.pitLife, b = pl.boxes[k], T = sim.T, i = b.bi, sd = sim.pit.side, N = T.N;
    const THREE = sim.camera.position.constructor;
    if (mode === 'along') { const j = (i - Math.round(40 / T.ds) + N) % N; const p = pl.at(j, sim.pit.CEN[j] - 3, 2.2); const q = pl.at((i + Math.round(10 / T.ds)) % N, b.face - 1, 3); window.__fixCam = [p, q]; }
    else { const j = (i - Math.round(9 / T.ds) + N) % N; const p = pl.at(j, sim.pit.CEN[j] - 3.5, 3.0); const q = pl.at(i, sim.pit.CEN[i] + 2.4, 0.6); window.__fixCam = [p, q]; }
  }, [k, mode]);
  await pg.addStyleTag({ content: '#hud, .screen, #toast { visibility: hidden !important; }' });
  const shot = async (name) => { await pg.waitForTimeout(400); await pg.screenshot({ path: join(OUT, name) }); console.log('shot', name); };
  // (close: across the lane from the car, or ahead of it; aimed at where it stops)
  const close = (mode) => pg.evaluate((mode) => {
    const sim = window.__svgp.sim, c = window.__pc, p = c.phys, THREE = sim.camera.position.constructor;
    const fx = Math.sin(p.h), fz = Math.cos(p.h), T = sim.T, i = c.idx, sd = sim.pit.side;
    const gx = T.RX[i] * sd, gz = T.RZ[i] * sd; // (toward the garages)
    const y = sim.pitLife.laneY(i), at = new THREE(p.x, y + 0.7, p.z);
    if (mode === 'top') { window.__fixCam = [new THREE(p.x - gx * 0.5 + fx * 0.2, y + 9, p.z - gz * 0.5 + fz * 0.2), at]; return; }
    const cam = mode === 'side' ? new THREE(p.x - gx * 6.5 + fx * 1.0, y + 2.0, p.z - gz * 6.5 + fz * 1.0) : new THREE(p.x + fx * 7.5 - gx * 2.5, y + 2.2, p.z + fz * 7.5 - gz * 2.5);
    window.__fixCam = [cam, at];
  }, mode);
  const k = await pg.evaluate(() => {
    const sim = window.__svgp.sim, c = sim.cars.find(c => !c.isPlayer && c.ai);
    window.__pc = c; const T = sim.T, N = T.N;
    for (let f = 0; f < 60 * 200; f++) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); const d = ((sim.pit.start - c.idx + N) % N) * T.ds; if (d < 260 && d > 200) break; }
    c.pitting = true; c.pitPhase = 'in'; c.pitReq = { tyre: 'soft', repair: false }; return sim.pitLife.boxes.findIndex(b => b.k === c.teamIdx % sim.pit.boxes.length);
  });
  const run = (until, max) => pg.evaluate(([until, max]) => {
    const sim = window.__svgp.sim, c = window.__pc, b = sim.pitLife.boxes.find(b => b.k === c.teamIdx % sim.pit.boxes.length);
    for (let f = 0; f < max; f++) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      for (const bx of sim.pitLife.boxes) for (const m of bx.crew) if (m.jack && m.jack.visible) { const L = m.jack.getObjectByName('bar').scale.y; if (L > 3 && !window.__jl) { window.__jl = 1; console.warn('LONG JACK', bx.k, m.role, L.toFixed(1), 'phase', bx.phase, 'mc', !!m.mc, m.mc && m.mc.go, 'hands', m.ch.bone('LeftHand').getWorldPosition(new sim.camera.position.constructor()).toArray().map(v => v.toFixed(1)).join(','), 'obj', m.ch.object.position.toArray().map(v => v.toFixed(1)).join(',')); } }
      if (b.phase === until) return { f, phase: b.phase, pp: c.pitPhase, timer: +(c.pitTimer || 0).toFixed(2) }; }
    return { f: max, phase: b.phase, pp: c.pitPhase, timer: +(c.pitTimer || 0).toFixed(2), crew: b.crew.map(m => m.role + ':' + (m.ch.clip || '') + (m.mc ? '@' + m.ch.action.time.toFixed(2) : '')).join(' ') };
  }, [until, max]);
  console.log('ready', JSON.stringify(await run('ready', 60 * 120)));
  console.log(JSON.stringify(await run('__', 60 * 3)));
  await close('front'); await shot('pm-ready.png');
  console.log('work', JSON.stringify(await run('work', 60 * 60)));
  for (const [n, f] of [['a', 20], ['b', 70], ['c', 80]]) { console.log(JSON.stringify(await run('__', f))); await close('side'); await shot(`pm-work-${n}-side.png`); await close('top'); await shot(`pm-work-${n}-top.png`); await close('front'); await shot(`pm-work-${n}-front.png`); }
  console.log('JACKS', await pg.evaluate(() => { const sim = window.__svgp.sim, c = window.__pc, b = sim.pitLife.boxes.find(b => b.k === c.teamIdx % sim.pit.boxes.length);
    return JSON.stringify({ car: [c.phys.x.toFixed(1), c.phys.z.toFixed(1)], body: c.phys.p.body, a: c.phys.p.a, jacks: b.crew.filter(m => m.jack).map(m => { const f = m.jack.getObjectByName('foot'), r = m.jack.getObjectByName('bar'); return { role: m.role, vis: m.jack.visible, foot: f.position.toArray().map(v => +v.toFixed(1)), bar: r.position.toArray().map(v => +v.toFixed(1)), len: +r.scale.y.toFixed(2), grp: m.jack.parent && m.jack.parent.position.toArray(), me: m.ch.object.position.toArray().map(v => +v.toFixed(1)) }; }) }); }));
  console.log('release', JSON.stringify(await run('release', 60 * 10)));
  for (const [n, f] of [['a', 15], ['b', 45]]) { console.log(JSON.stringify(await run('__', f))); await close('front'); await shot(`pm-rel-${n}.png`); }
} finally { await b.close(); server.kill(); }
