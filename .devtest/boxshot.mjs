// dev: the pit boxes (js/pitboxes.js): looking in from the lane, out from inside, along the block, a shut one
//   [TRACK='Pinewood Sprint' | 'Spa-Francorchamps'] node .devtest/boxshot.mjs [outdir] [day|night]
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
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error') console.log(m.type(), m.text().slice(0, 300)); });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([TIME, TRACK]) => {
    const { presetTracks } = await import('/js/track.js');
    const real = TRACK && (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    const t = real || (TRACK ? presetTracks().find(q => q.name === TRACK) : await (await fetch('/.devtest/auburn2.json')).json()); t.env.weather = 'clear'; t.env.time = TIME;
    window.__svgp.startRace(t, { mode: 'race', laps: 10, opponents: 5, grid: 'back', strategy: false, car: window.__svgp.settings.car }, 'menu');
  }, [TIME, process.env.TRACK]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV && window.__svgp.sim.pitLife, null, { timeout: 120000 });
  await pg.waitForFunction(() => window.__svgp.sim.pitLife.boxes.some(b => b.crew.length), null, { timeout: 30000 }).catch(() => console.log('no crews'));
  const info = await pg.evaluate(() => {
    const sim = window.__svgp.sim, pl = sim.pitLife;
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    window.__fixCam = null; const uc = sim.updateCamera.bind(sim);
    sim.updateCamera = (dt) => { if (window.__fixCam) { sim.camera.position.copy(window.__fixCam[0]); sim.camera.lookAt(window.__fixCam[1]); } else uc(dt); };
    const pb = sim.scene.getObjectByName('PitBoxes');
    let tris = 0; pb?.traverse(o => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
    let dt = 0; pl.root.traverse(o => { if (o.isMesh && o.parent?.name === 'BoxDress') dt += o.geometry.attributes.position.count / 3; });
    return { boxes: sim.pit.boxes.length, teams: pl.boxes.length, ds: sim.T.ds, tris: Math.round(tris), dressTris: Math.round(dt), shut: pl.root.children.filter(o => o.name === 'Shutter').length };
  });
  console.log(JSON.stringify(info));
  await pg.addStyleTag({ content: '#hud, .screen, #toast, .hud { visibility: hidden !important; }' });
  const shot = async (name) => { await pg.waitForTimeout(700); await pg.screenshot({ path: join(OUT, name) }); console.log('shot', name); };
  const look = (k, mode) => pg.evaluate(([k, mode]) => {
    const sim = window.__svgp.sim, pl = sim.pitLife, T = sim.T, N = T.N;
    const b = pl.boxes[Math.min(k, pl.boxes.length - 1)], i = b.bi, F = b.face;
    const j = (d) => (i + Math.round(d / T.ds) + N) % N;
    if (mode === 'in') window.__fixCam = [pl.at(i, F - 9, 1.7), pl.at(i, F + 8, 1.6)];
    else if (mode === 'door') window.__fixCam = [pl.at(j(-3), F - 3, 1.7), pl.at(j(1), F + 6, 1.5)];
    else if (mode === 'out') window.__fixCam = [pl.at(j(2), F + 12.5, 1.75), pl.at(j(-1), F - 6, 1.3)];
    else if (mode === 'corner') window.__fixCam = [pl.at(j(5.5), F + 1.5, 2.2), pl.at(j(-3), F + 10, 1.0)];
    else window.__fixCam = [pl.at(j(-35), F - 9, 3.5), pl.at(j(20), F + 2, 2)];
  }, [k, mode]);
  const tick = (n = 30) => pg.evaluate((n) => { const sim = window.__svgp.sim; for (let f = 0; f < n; f++) sim.pitLife.update(1 / 60); }, n);
  await look(2, 'in'); await tick(); await shot(`box-in-${TIME}.png`);
  await look(2, 'door'); await shot(`box-door-${TIME}.png`);
  await look(2, 'out'); await shot(`box-out-${TIME}.png`);
  await look(2, 'corner'); await shot(`box-corner-${TIME}.png`);
  await look(0, 'far'); await shot(`box-far-${TIME}.png`);
} finally { await b.close(); server.kill(); }
