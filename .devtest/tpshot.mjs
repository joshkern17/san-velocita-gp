// dev: the race-track pack's props in a race (stands with fans, ad towers, flags, a gantry, floodlights) and the start
// lights, on Maple Ridge   node .devtest/tpshot.mjs <outdir> [day|dusk|night]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp', TIME = process.argv[3] || 'day';
const PORT = 9590 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 200)); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async ([TIME, LIGHT]) => {
    const { presetTracks, sampleTrack } = await import('/js/track.js');
    const t = presetTracks().find(t => t.name === 'Maple Ridge GP'); t.env.weather = 'clear'; t.env.time = TIME;
    const T = sampleTrack(t), N = T.N, at = (d, s) => { const i = ((Math.round(d / T.ds) % N) + N) % N; return { i, x: T.X[i] + T.RX[i] * s, z: T.Z[i] + T.RZ[i] * s, face: Math.atan2(-T.RX[i] * Math.sign(s), -T.RZ[i] * Math.sign(s)), along: Math.atan2(T.FX[i], T.FZ[i]) }; };
    // the right of the start straight (the pits are on the left here): two stands, towers, flags; a gantry and a mast
    const P = [];
    const put = (type, d, s, extra = {}) => { const q = at(d, s); P.push({ type, x: q.x, z: q.z, rot: q.face, ...extra }); };
    put('tp_stand_roof_a', -60, 30); put('tp_stand_flags_a', -45, 30); put('tp_stand_roof_b', -75, 30);
    for (let k = 0; k < 6; k++) put('tp_flag_' + k, -100 + k * 3, 21);
    for (let k = 0; k < 4; k++) put('tp_board_' + k, 20 + k * 7, 20);
    put('tp_adtower_0', -20, 26); put('tp_adtower_3', 10, 26);
    put('tp_floodmast', -110, 34, { light: LIGHT }); put('tp_stadium_light', 60, 34); put('tp_floodmast', 160, 34);
    { const q = at(120, 0); P.push({ type: 'tp_gantry_wide_0', x: q.x, z: q.z, rot: q.along }); }
    t.props = [...(t.props || []), ...P];
    // two logos of our own over the pack's (Pirelli, Monster)
    const mk = (txt, bg, fg, w = 400, h = 200) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2); return c.toDataURL('image/png'); };
    t.logos = { pirelli: mk('SAN VELOCITA', '#101010', '#ff2b00', 520, 200), monster: mk('TEAM 7', '#ffffff', '#1a40c0') };
    window.__tpTrack = t;
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 7, grid: 'front', strategy: false, car: window.__svgp.settings.car }, 'menu');
  }, [TIME, +(process.env.LIGHT || 1)]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV, null, { timeout: 120000 });
  await pg.addStyleTag({ content: '.screen { visibility: hidden !important; }' });
  await pg.evaluate(() => { const s = window.__svgp.sim; s.state = 'countdown'; s.stateT = 0;
    window.__fixCam = null; const uc = s.updateCamera.bind(s); s.updateCamera = (dt) => { if (window.__fixCam) { s.camera.position.set(...window.__fixCam[0]); s.camera.lookAt(...window.__fixCam[1]); } else uc(dt); }; });
  const waitFor = async (fn, max = 400) => { for (let k = 0; k < max; k++) { if (await pg.evaluate(fn)) return true; await pg.waitForTimeout(200); } return false; };
  await waitFor(() => window.__svgp.sim.lightsOn >= 3);
  await pg.waitForTimeout(3000); // (the crowd's characters load in)
  await pg.screenshot({ path: join(OUT, `tp-lights3-${TIME}.png`) });
  await waitFor(() => window.__svgp.sim.state === 'racing');
  await pg.screenshot({ path: join(OUT, `tp-go-${TIME}.png`) });
  // fixed views: the stands, the gantry over the track, the masts
  const view = (name, from, to) => pg.evaluate(([f, t]) => { window.__fixCam = [f, t]; }, [from, to]).then(() => pg.waitForTimeout(1500)).then(() => pg.screenshot({ path: join(OUT, `tp-${name}-${TIME}${process.env.LIGHT ? '-' + process.env.LIGHT : ''}.png`) }));
  const pos = await pg.evaluate(() => { const s = window.__svgp.sim, T = s.T, N = T.N; const at = (d, sd, h) => { const i = ((Math.round(d / T.ds) % N) + N) % N; return [T.X[i] + T.RX[i] * sd, T.Y[i] + h, T.Z[i] + T.RZ[i] * sd]; }; return { stA: at(-30, -4, 5), stB: at(-60, 30, 4), gA: at(60, 0, 2), gB: at(120, 0, 7), mA: at(-170, -6, 18), mB: at(-110, 34, 10), lA: at(-60, 0, 1.4), lB: at(0, 0, 6), sfA: at(-58, 8, 3), sfB: at(-60, 30, 3), twA: at(-24, 6, 15), twB: at(-20, 26, 14) }; });
  await view('tower', pos.twA, pos.twB);
  await view('stands', pos.stA, pos.stB);
  await view('standfront', pos.sfA, pos.sfB);
  await view('gantry', pos.gA, pos.gB);
  await view('mast', pos.mA, pos.mB);
  await view('startlights', pos.lA, pos.lB);
} finally { await b.close(); server.kill(); }
