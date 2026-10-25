// dev: Form SV-1 at the registry desk, line by line (the zoom, the slide, the answer previewed)   node .devtest/sv1shot.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '.';
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const W = (ms) => new Promise(r => setTimeout(r, ms));
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 60000, polling: 200 }); await W(1000);
  await pg.evaluate(() => __svgp.dbg.openOpening()); await W(1200);
  await pg.waitForFunction(() => __svgp.dbg.opening.ready && __svgp.dbg.opening.office.ready && __svgp.dbg.opening.office.clerk, null, { timeout: 90000 });
  await pg.evaluate(() => { const o = __svgp.dbg.opening; o.startOffice(); o.office.toRegistry(); });
  // skip his lines as they come
  const skip = setInterval(() => pg.evaluate(() => { const f = __svgp.dbg.opening.office; if (f.lineWait) f.lineWait.t = 99; }).catch(() => {}), 200);
  const shot = async (n) => { await W(1600); await pg.screenshot({ path: join(OUT, n + '.png') }); console.log('shot', n, await pg.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(__svgp.dbg.opening.office.sv1.view || {}).map(([k, v]) => [k, +v.toFixed(3)]))))); };
  await pg.waitForFunction(() => __svgp.dbg.opening.office.stage === 'registry', null, { timeout: 60000 }); await shot('sv1-0-desk');
  await pg.waitForFunction(() => __svgp.dbg.opening.office.sv1.focus === 'team', null, { timeout: 60000 });
  await pg.evaluate(() => { const i = document.querySelector('#op-input input'); i.value = 'Indica Mot'; i.dispatchEvent(new Event('input')); });
  console.log(await pg.evaluate(() => { const o = __svgp.dbg.opening, f = o.office, sv = f.sv1, c = f.camera; const l = c.worldToLocal(sv.obj.position.clone());
    return JSON.stringify({ opStage: o.stage, stage: f.stage, light: f.light, onT: f.onT, vis: sv.obj.visible, state: sv.state, k: sv.k, local: [l.x, l.y, l.z].map(v => +v.toFixed(3)), yaw: f.yaw, pitch: f.pitch, cam: c.position, fov: c.fov, aspect: c.aspect }); }));
  await shot('sv1-1-team-typing');
  await pg.evaluate(() => { const i = document.querySelector('#op-input input'); i.value = 'Indica Motors'; __svgp.dbg.opening.inputOk(); });
  await pg.waitForFunction(() => __svgp.dbg.opening.office.sv1.focus === 'colors', null, { timeout: 20000 });
  await pg.evaluate(() => __svgp.dbg.opening.choiceNav(1)); // (on the second pair)
  await shot('sv1-2-colors-hover');
  await pg.evaluate(() => __svgp.dbg.opening.choiceOk());
  await pg.waitForFunction(() => __svgp.dbg.opening.office.sv1.focus === 'home', null, { timeout: 20000 });
  await W(250); await pg.screenshot({ path: join(OUT, 'sv1-3-sliding.png') }); console.log('shot sliding');
  await shot('sv1-4-home');
  // the rest, answered as they come, to the signature
  for (let i = 0; i < 40; i++) {
    const f = await pg.evaluate(() => { const o = __svgp.dbg.opening; if (o.office.sv1.focus === 'sign') return 'sign'; if (o.inputCb) o.inputOk(); else if (o.choice) o.choiceOk(); return o.office.sv1.focus; });
    if (f === 'sign') break; await W(400);
  }
  await shot('sv1-5-sign');
  clearInterval(skip);
} finally { await b.close(); server.kill(); }
