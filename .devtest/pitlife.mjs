// dev: pit lane life. An AI car pits; pictures of the signs, the crew waiting, working, releasing.
//   node .devtest/pitlife.mjs [outdir] [time: day|night]
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
  await look(2, 'along'); await shot('pl-signs.png');
  // send an AI car in
  const k = await pg.evaluate(() => {
    const sim = window.__svgp.sim, c = sim.cars.find(c => !c.isPlayer && c.ai);
    window.__pc = c; const T = sim.T, N = T.N;
    // drive on until it's 260 m from the pit entry, then call it in
    for (let f = 0; f < 60 * 200; f++) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); const d = ((sim.pit.start - c.idx + N) % N) * T.ds; if (d < 260 && d > 200) break; }
    c.pitting = true; c.pitPhase = 'in'; c.pitReq = { tyre: 'soft', repair: false }; return sim.pitLife.boxes.findIndex(b => b.k === c.teamIdx % sim.pit.boxes.length);
  });
  console.log('box', k);
  await look(k, 'box');
  const run = (until, max) => pg.evaluate(([until, max]) => {
    const sim = window.__svgp.sim, c = window.__pc, b = sim.pitLife.boxes.find(b => b.k === c.teamIdx % sim.pit.boxes.length);
    for (let f = 0; f < max; f++) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); if (b.phase === until) return { f, phase: b.phase, pp: c.pitPhase, idx: c.idx, lift: c.lift }; }
    return { f: max, phase: b.phase, pp: c.pitPhase, idx: c.idx };
  }, [until, max]);
  console.log('ready', JSON.stringify(await run('ready', 60 * 120)));
  console.log(JSON.stringify(await run('__', 60 * 2)));
  await shot('pl-ready.png');
  console.log('work', JSON.stringify(await run('work', 60 * 60)));
  console.log(JSON.stringify(await run('__', 50)));
  await shot('pl-work.png');
  console.log('release', JSON.stringify(await run('release', 60 * 10)));
  console.log(JSON.stringify(await run('__', 20)));
  await shot('pl-release.png');
  console.log('home', JSON.stringify(await run('home', 60 * 20)));
  console.log(JSON.stringify(await run('__', 60 * 3)));
  await shot('pl-home.png');
} finally { await b.close(); server.kill(); }
