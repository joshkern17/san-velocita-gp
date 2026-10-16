// dev: F8 in a race (main.js -> race.js devPitStop): your car's put short of the pit entry, boxing, and the crew
// drives it in to a stop at your box. FAIL lines are problems.   node .devtest/f8pit.mjs [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.startRace(t, { mode: 'race', laps: 10, opponents: 5, grid: 'back', strategy: false, car: window.__svgp.settings.car }, 'menu');
  });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV && window.__svgp.sim.pitLife, null, { timeout: 180000 });
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 60000 }).catch(async () => console.log('screen', await pg.evaluate(() => window.__svgp.screen)));
  await pg.evaluate(() => { const sim = window.__svgp.sim; sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9; });
  await pg.waitForTimeout(1000);
  // (F8 on the HUD calls this; the strategy screen's in the way headless)
  console.log('devPitStop', await pg.evaluate(() => window.__svgp.sim.devPitStop()));
  const s0 = await pg.evaluate(() => { const p = window.__svgp.sim.player; return { pitting: p.pitting, phase: p.pitPhase, req: p.pitReq }; });
  console.log(JSON.stringify(s0));
  check(s0.pitting && s0.phase === 'in', 'F8: boxing');
  await pg.addStyleTag({ content: '#hud, .screen, #toast { visibility: hidden !important; }' });
  // pictures of your stop from the lane, side on and from ahead (the camera held there)
  await pg.evaluate(() => { const sim = window.__svgp.sim, uc = sim.updateCamera.bind(sim); window.__fixCam = null; sim.updateCamera = (dt) => { if (window.__fixCam) { sim.camera.position.copy(window.__fixCam[0]); sim.camera.lookAt(window.__fixCam[1]); } else uc(dt); }; });
  const runTo = (mark) => pg.evaluate((mark) => {
    const sim = window.__svgp.sim, p = sim.player, b = sim.pitLife.boxes.find(x => x.mine), L = sim.pitLife;
    for (let i = 0; i < 60 * 40; i++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0 }, {});
      const at = mark < 0 ? b.phase === 'ready' && ((b.bi - p.idx + sim.T.N) % sim.T.N) * sim.T.ds < 30 : b.phase === 'work' && L.stopP(b) >= mark;
      if (at || p.pitPhase === 'out') break;
    }
    const ph = p.phys, g = b.g || { x: 0, z: 1 }, f = { x: Math.sin(ph.h), z: Math.cos(ph.h) }, V = sim.camera.position.constructor;
    window.__fixCam = [new V(ph.x - g.x * 6.5 - f.x * 1.5, p.y + 2.2, ph.z - g.z * 6.5 - f.z * 1.5), new V(ph.x, p.y + 0.5, ph.z)];
    window.__front = [new V(ph.x + f.x * 7 - g.x * 2.5, p.y + 1.8, ph.z + f.z * 7 - g.z * 2.5), new V(ph.x, p.y + 0.6, ph.z)];
    const V3 = sim.camera.position.constructor, wp = (o) => { const v = o.getWorldPosition(new V3()); return [+v.x.toFixed(1), +v.y.toFixed(2), +v.z.toFixed(1)]; };
    const lp = b.crew.find(m => m.role === 'LP'), vis = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
    window.__dbg = { car: [+ph.x.toFixed(1), +p.y.toFixed(2), +ph.z.toFixed(1)], props: b.crew.filter(m => m.wheel).map(m => m.role + (m.prop ? (vis(m.prop) ? ' vis ' : ' hid ') + JSON.stringify(wp(m.prop)) + ' inRoot ' + !!m.prop.parent : ' none') + (m.mc ? ' t' + m.ch.action.time.toFixed(2) : ' nomc')), board: lp && lp.board ? (vis(lp.board.disc) ? 'vis ' : 'hid ') + JSON.stringify(wp(lp.board.disc)) + ' hand ' + JSON.stringify(wp(lp.ch.bone('RightHand'))) + ' clip ' + lp.ch.clip : 'none' };
    return { phase: b.phase, p: +L.stopP(b).toFixed(2), lift: [+(p.liftF || 0).toFixed(3), +(p.liftR || 0).toFixed(3)], wheels: p.model.wheels.map(w => w.mesh.visible ? 1 : 0).join('') };
  }, mark);
  for (const mark of [-1, 0.15, 0.35, 0.6, 0.9]) {
    const r = await runTo(mark); console.log('at', mark, JSON.stringify(r)); if (mark === 0.35) console.log(JSON.stringify(await pg.evaluate(() => window.__dbg), null, 1));
    await pg.evaluate(() => window.__svgp.sim.update(1 / 60, {}, {})); await pg.waitForTimeout(300);
    await pg.screenshot({ path: join(OUT, `f8-${mark}-side.png`) });
    await pg.evaluate(() => { window.__fixCam = window.__front; window.__svgp.sim.update(1 / 60, {}, {}); }); await pg.waitForTimeout(300);
    await pg.screenshot({ path: join(OUT, `f8-${mark}-front.png`) });
    if (mark === 0.35) { // (the lollipop, close: from beside it, out in the lane)
      await pg.evaluate(() => { const sim = window.__svgp.sim, b = sim.pitLife.boxes.find(x => x.mine), lp = b.crew.find(m => m.role === 'LP'), V = sim.camera.position.constructor;
        const d = lp.board.disc.getWorldPosition(new V()), p = sim.player.phys, f = { x: Math.sin(p.h), z: Math.cos(p.h) };
        window.__fixCam = [new V(d.x + f.x * 3.2 - b.g.x * 2.2, d.y + 0.6, d.z + f.z * 3.2 - b.g.z * 2.2), d]; sim.update(1 / 60, {}, {}); });
      await pg.waitForTimeout(300); await pg.screenshot({ path: join(OUT, 'f8-lollipop.png') });
      await pg.evaluate(() => { window.__fixCam = null; window.__svgp.sim.snapCamera(); window.__svgp.sim.update(1 / 60, {}, {}); }); // (the chase cam: what you see)
      await pg.waitForTimeout(300); await pg.screenshot({ path: join(OUT, 'f8-chase.png') });
      console.log('LP', JSON.stringify(await pg.evaluate(() => { const sim = window.__svgp.sim, b = sim.pitLife.boxes.find(x => x.mine), lp = b.crew.find(m => m.role === 'LP'), B = lp.board, V = sim.camera.position.constructor, Q = sim.camera.quaternion.constructor;
        const ws = (o) => { const v = new V(); o.getWorldScale(v); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; };
        const chain = []; for (let q = B.disc; q; q = q.parent) chain.push((q.name || q.type) + (q.visible ? '' : '(HIDDEN)'));
        return { discScale: ws(B.disc), gScale: ws(B.g), discPos: B.disc.getWorldPosition(new V()).toArray().map(x => +x.toFixed(2)), stick: B.g.children[0].getWorldPosition(new V()).toArray().map(x => +x.toFixed(2)), mat: { op: B.mat.opacity, vis: B.mat.visible, map: !!B.mat.map }, chain: chain.slice(0, 8), frustum: B.disc.frustumCulled, layers: B.disc.layers.mask };
      })));
    }
  }
  await pg.evaluate(() => { window.__fixCam = null; });
  // (headless is slow: the race run on by hand till the stop)
  const st = await pg.evaluate(() => {
    const sim = window.__svgp.sim, p = sim.player, seen = new Set();
    const log = [], b = sim.pitLife.boxes.find(x => x.mine);
    for (let i = 0; i < 60 * 40 && !(p.pitPhase === 'out' && seen.has('stop')); i++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0 }, {}); seen.add(p.pitPhase);
      if (b && b.phase !== 'home' && i % 30 === 0) log.push(`${b.phase} ${p.pitPhase} lift ${(p.liftF || 0).toFixed(2)}/${(p.liftR || 0).toFixed(2)} ` + b.crew.map(m => m.role + ':' + (m.ch.clip || '').replace('pit_', '') + (m.mc ? '@' + m.ch.action.time.toFixed(1) : '')).join(' '));
    }
    return { seen: [...seen], phase: p.pitPhase, tyre: p.phys.tyre.c, log };
  });
  for (const l of st.log || []) console.log('  ' + l); delete st.log;
  console.log(JSON.stringify(st));
  check(st.seen.includes('stop') && st.phase === 'out', `stopped at the box and out again (${st.seen.join(' > ')}, on ${st.tyre})`);
  await pg.screenshot({ path: join(OUT, 'f8-out.png') });
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
