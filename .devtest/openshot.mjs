// dev: screenshots of the opening, stage by stage  node .devtest/openshot.mjs <outdir>
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
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message)); pg.on('console', m => m.type() === 'error' && console.log('ERR', m.text()));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 60000 }); await W(1000);
  await pg.evaluate(() => __svgp.dbg.openOpening()); await W(1200);
  await pg.waitForFunction(() => __svgp.dbg.opening.ready && __svgp.dbg.opening.remote, null, { timeout: 60000 });
  const O = (f, a) => pg.evaluate(f, a);
  const shot = async (n) => { await W(700); await pg.screenshot({ path: join(OUT, n + '.png') }); console.log('shot', n); };
  const only = process.argv[3] && process.argv[3] !== 'office' ? process.argv[3].split(',') : null, want = (n) => !only || only.includes(n);
  if (process.argv[3] === 'office') {
    await pg.waitForFunction(() => __svgp.dbg.opening.office.ready && __svgp.dbg.opening.office.clerk, null, { timeout: 60000 });
    await O(() => __svgp.dbg.opening.startOffice());
    const F = (f, a) => O(f, a), of = '__svgp.dbg.opening.office';
    await W(300); await F(() => { const f = __svgp.dbg.opening.office; f.t = 1.7; }); await W(600); await shot('o1flicker');
    await F(() => { const f = __svgp.dbg.opening.office; f.onT = 2; }); await W(400); await shot('o2lit');
    await F(() => { const f = __svgp.dbg.opening.office; f.onT = 3; }); await W(400);
    for (let i = 0; i < 6; i++) await F(() => { const f = __svgp.dbg.opening.office; f.lineT = 99; f.update(0.01); });
    await F(() => { const f = __svgp.dbg.opening.office; f.forms.forEach(x => x.k = 1); }); await shot('o3talk');
    for (let i = 0; i < 3; i++) await F(() => { const f = __svgp.dbg.opening.office; f.lineT = 99; f.update(0.01); });
    await W(500); await shot('o4choose');
    await F(() => { const o = __svgp.dbg.opening; o.nav(1); o.confirm(); o.office.forms[1].k = 1; }); await shot('o5held');
    await F(() => { const o = __svgp.dbg.opening; o.confirm(); o.office.signT = 1.0; }); await shot('o6signed');
    await F(() => { const f = __svgp.dbg.opening.office; f.signT = 2; f.update(0.01); f.forms.forEach(x => x.k = 1); f.stampAt = 0; f.update(0.01); }); await shot('o7stamp');
    console.log(await O(() => { const o = __svgp.dbg.opening.office; return o.stage + ' ' + o.choice + ' ' + o.lineI; }));
  } else {
  await O(() => { const o = __svgp.dbg.opening; o.stageT = 4; });
  await W(500); console.log(await O(() => { const o = __svgp.dbg.opening; return JSON.stringify({ st: o.stage, sT: o.stageT, t: o.t, cur: o.cur, tg: !!o.target }); })); if (want("1race")) await shot("1race");
  await O(() => { const o = __svgp.dbg.opening; const a = o.aimAt(o.target.at); o.yaw = a.yaw; o.pitch = a.pitch; });
  if (want('2pile')) { await W(1500); await shot('2pile'); console.log(await O(() => { const o = __svgp.dbg.opening; const cs = getComputedStyle(o.ui.tag), r = o.ui.tag.getBoundingClientRect(), sc = getComputedStyle(document.getElementById('s-opening')); return JSON.stringify({ tag: o.ui.tag.className, op: cs.opacity, disp: cs.display, vis: cs.visibility, r, z: cs.zIndex, scr: [sc.zoom, sc.transform, sc.opacity, sc.display] }); })); }
  await O(() => __svgp.dbg.opening.activate()); await W(1500);
  for (const n of ['3mag', '4div', '5notice', '6ticket']) { if (want(n)) await shot(n); else await W(300); await O(() => { const o = __svgp.dbg.opening; o.busy = false; }); if (n !== '6ticket') await O(() => __svgp.dbg.opening.next()); await W(900); }
  await O(() => { const o = __svgp.dbg.opening; o.busy = false; o.next(); }); await W(1200);
  if (want('7turn')) await shot('7turn');
  await O(() => { const o = __svgp.dbg.opening; o.yaw = 0; o.pitch = 0; o.activate(); });
  await W(400); await O(() => { __svgp.dbg.opening.remT = 0.95; }); if (want('8remote')) await shot('8remote');
  await W(2500); console.log(await O(() => { const o = __svgp.dbg.opening, c = o.camera; return JSON.stringify({ st: o.stage, tvT: o.tvT, ch: o.channel, white: o.ui.white.className, fov: c.fov, pos: c.position, yaw: o.yaw, pitch: o.pitch, lean: o.lean }); }));
  for (const [n, t] of [['9intro', 2], ['10drum', 6.5], ['11ball1', 8.6], ['12ball4', 27.5], ['13final', 40], ['14final', 43.8], ['15end', 47.5]]) {
    if (!want(n)) continue;
    await O((t) => { const o = __svgp.dbg.opening; o.tvT = t; o.pile[3].k = 1; }, t); await shot(n); console.log(await O(() => { const o = __svgp.dbg.opening, c = o.camera; return JSON.stringify({ st: o.stage, tvT: o.tvT, white: o.ui.white.className, fov: c.fov, pos: c.position, yaw: o.yaw, pitch: o.pitch, lean: o.lean, dim: o.dim, tk: (() => { const it = o.pile[3]; const l = c.worldToLocal(it.obj.position.clone()); return [it.state, it.k, l.x.toFixed(3), l.y.toFixed(3), l.z.toFixed(3)]; })(), tag: o.ui.tag.className, tgt: !!o.target }); }));
  }
  }
} finally { await b.close(); server.kill(); }
