// dev: the pit wall stands, their crews, the team flags, the flag marshal and the catch fence
//   [TRACK='Pinewood Sprint'] node .devtest/pitwallshot.mjs [outdir] [day|night] [fenceH]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp', TIME = process.argv[3] || 'day', FH = process.argv[4];
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 200)); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([TIME, FH, TRACK]) => {
    const { presetTracks } = await import('/js/track.js');
    const t = TRACK ? presetTracks().find(q => q.name === TRACK) : await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; t.env.time = TIME; t.env.barrier = 'concrete';
    if (FH !== undefined) t.env.fenceH = +FH;
    window.__svgp.startRace(t, { mode: 'race', laps: 10, opponents: 7, grid: 'back', strategy: false, car: window.__svgp.settings.car }, 'menu');
  }, [TIME, FH, process.env.TRACK]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV && window.__svgp.sim.pitLife, null, { timeout: 120000 });
  await pg.waitForFunction(() => window.__svgp.sim.pitLife.wall.people.length, null, { timeout: 30000 }).catch(() => console.log('no people'));
  await pg.waitForFunction(() => window.__svgp.sim.pitLife.wall.root.children.some(o => o.isInstancedMesh), null, { timeout: 30000 }).catch(() => console.log('no computers'));
  const info = await pg.evaluate(() => {
    const sim = window.__svgp.sim, w = sim.pitLife.wall;
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    window.__fixCam = null; const uc = sim.updateCamera.bind(sim);
    sim.updateCamera = (dt) => { if (window.__fixCam) { sim.camera.position.copy(window.__fixCam[0]); sim.camera.lookAt(window.__fixCam[1]); } else uc(dt); };
    let meshes = 0; w.root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) meshes++; });
    return { meshes, stands: w.stands.length, people: w.people.length, fin: w.finIdx, marshal: !!w.marshal, flag: !!(w.marshal && w.marshal.flag) };
  });
  console.log(JSON.stringify(info));
  await pg.addStyleTag({ content: '#hud, .screen, #toast, .hud { visibility: hidden !important; }' });
  const shot = async (name) => { await pg.waitForTimeout(700); await pg.screenshot({ path: join(OUT, name) }); console.log('shot', name); };
  // k: stand index; mode: 'lane' (from the pit lane behind), 'track' (from the track), 'far'
  const look = (k, mode) => pg.evaluate(([k, mode]) => {
    const sim = window.__svgp.sim, pl = sim.pitLife, w = pl.wall, T = sim.T, N = T.N, pit = sim.pit;
    const i = k < 0 ? w.finIdx : w.stands[k].b.bi, W = pit.WALL[i];
    const j = (d) => (i + Math.round(d / T.ds) + N) % N;
    if (mode === 'lane') window.__fixCam = [pl.at(j(-6), W + 6.5, 2.4), pl.at(i, W, 1.6)];
    else if (mode === 'track') window.__fixCam = [pl.at(j(-7), W - 7, 1.6), pl.at(i, W + 1, 1.8)];
    else if (mode === 'front') window.__fixCam = [pl.at(j(-1.5), W - 6, 2.6), pl.at(i, W + 1, 1.7)];
    else if (mode === 'close') window.__fixCam = [pl.at(j(-2.5), W + 3.2, 2.0), pl.at(i, W + 0.5, 1.5)];
    else if (mode === 'flags') window.__fixCam = [pl.at(j(-30), W - 4, 3), pl.at(j(0), W + 20, 8)];
    else window.__fixCam = [pl.at(j(-40), W - 3, 4), pl.at(j(10), W, 1)];
  }, [k, mode]);
  const tick = (n = 30) => pg.evaluate((n) => { const sim = window.__svgp.sim; for (let f = 0; f < n; f++) sim.pitLife.update(1 / 60); }, n);
  await look(2, 'lane'); await tick(); await shot('pw-lane.png');
  await look(2, 'close'); await tick(); await shot('pw-close.png');
  await look(2, 'track'); await tick(); await shot('pw-track.png');
  await look(1, 'front'); await tick(); await shot('pw-front.png');
  await look(2, 'far'); await shot('pw-far.png');
  await look(2, 'flags'); await shot('pw-flags.png');
  if (info.marshal) {
    await pg.evaluate(() => { const s = window.__svgp.sim; s.raceTime = 1; });
    await look(-1, 'track'); await tick(40); await shot('pw-green.png');
    await pg.evaluate(() => { const s = window.__svgp.sim; s.finishOrder.push(s.cars[1]); });
    await tick(25); await shot('pw-chequer.png');
    await look(-1, 'lane'); await tick(10); await shot('pw-chequer-lane.png');
  }
} finally { await b.close(); server.kill(); }
