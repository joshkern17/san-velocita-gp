// dev: walking the pit lane, you stand on the ground (js/pitwalk.js groundY): along the whole lane and in every open
// box, the walker's height against what's really under you (a ray down onto the lane's tarmac / the box's floor).
// FAIL lines are problems.   [TRACKS='Spa-Francorchamps,Pinewood Sprint'] node .devtest/pitground.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails++; };
const TRACKS = (process.env.TRACKS || 'Spa-Francorchamps,Pinewood Sprint').split(',');
try {
  for (const TRACK of TRACKS) {
    const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
    pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    await pg.addInitScript(() => { navigator.getGamepads = () => []; });
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
    await pg.evaluate(async (TRACK) => {
      const { presetTracks } = await import('/js/track.js');
      const real = (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
      const t = real || presetTracks().find(q => q.name === TRACK); t.env.weather = 'clear'; t.env.time = 'day';
      window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: 5, pick: false }, 'setup', 'quali', [1200, 600]);
    }, TRACK);
    await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
    await pg.waitForTimeout(800);
    await pg.evaluate(() => { [...document.querySelectorAll('#m-pitgarage .item')].find(e => /Walk The Pit Lane/i.test(e.textContent)).click(); });
    await pg.waitForFunction(() => window.__svgp.dbg.walk && window.__svgp.dbg.walk.active, null, { timeout: 30000 });
    const r = await pg.evaluate(async () => {
      const THREE = await import('three');
      const W = window.__svgp.dbg.walk, nav = W.nav, sim = window.__svgp.sim, A = W.pg.track.a, M = A.matrixWorld;
      // (what you could stand on: everything but the people, the cars, the see-through)
      const skip = new Set(); [W.me.object, W.pg.car && W.pg.car.group, ...(sim.pitLife ? sim.pitLife.boxes.flatMap(b => [...b.crew.map(m => m.ch.object), b.driver && b.driver.object]) : [])].forEach(o => o && o.traverse(c => skip.add(c)));
      const meshes = []; sim.scene.traverse(o => { if (o.isMesh && o.visible && !skip.has(o) && !(o.material && (o.material.transparent || o.material.depthWrite === false))) meshes.push(o); });
      const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
      const pts = [];
      // the lane: along the garage line, 2 m and 6 m out
      for (let j = 0; j < nav.line.length - 1; j++) for (const out of [2, 6]) { const a = nav.line[j], n = nav.nIn[j]; pts.push({ x: a.x - n.x * out, z: a.z - n.z * out, w: 'lane' }); }
      // the boxes: a few spots in each
      for (const fr of nav.rooms) for (const [x, z] of [[0, 1.5], [-fr.wx + 1, 7], [fr.wx - 1, 12], [0, 0.2]]) { const w = { x: 0, z: 0 }; nav.outFr(fr, { x, z }, w); pts.push({ x: w.x, z: w.z, w: 'box' }); }
      let worst = 0, bad = 0, n = 0, rise = 0, y0 = Infinity, y1 = -Infinity; const eg = [];
      for (const p of pts) {
        const gy = nav.groundY(p), o = new THREE.Vector3(p.x, gy + 1.2, p.z).applyMatrix4(M);
        ray.set(o, down); ray.far = 3;
        const hits = ray.intersectObjects(meshes, false); if (!hits.length) continue;
        const h = hits[0], ly = h.point.clone().applyMatrix4(M.clone().invert()).y; n++;
        y0 = Math.min(y0, gy); y1 = Math.max(y1, gy);
        const d = ly - gy; // (+: the ground's over your feet: you're sunk in it)
        if (Math.abs(d) > 0.12) { bad++; if (eg.length < 6) eg.push({ ...p, gy: +gy.toFixed(2), hit: +ly.toFixed(2), what: [h.object.name, h.object.parent?.name, h.object.parent?.parent?.name, h.object.material?.name, h.object.material?.map?.image?.src?.slice(-30)].join('|'), wz: +h.point.y.toFixed(2), dn: hits.slice(0,4).map(q => +(q.point.clone().applyMatrix4(M.clone().invert()).y).toFixed(2)) }); }
        worst = Math.max(worst, Math.abs(d));
      }
      return { n, bad, worst: +worst.toFixed(2), climb: +(y1 - y0).toFixed(2), eg };
    });
    console.log(TRACK, JSON.stringify(r));
    check(r.n > 20 && r.bad / r.n < 0.05, `${TRACK}: on the ground (${r.bad} of ${r.n} off by > 12 cm; the lane climbs ${r.climb} m)`);
    // and the walker really stands there: walk along the lane, feet on the ground
    const w = await pg.evaluate(() => {
      const W = window.__svgp.dbg.walk, nav = W.nav, far = nav.line[nav.line.length - 1], n = nav.nIn[nav.nIn.length - 1];
      W.input = { my: 0, mx: 0 }; let worst = 0;
      const tx = far.x - n.x * 3, tz = far.z - n.z * 3;
      for (let i = 0; i < 1500; i++) { const p = W.pos, vx = tx - p.x, vz = tz - p.z, d = Math.hypot(vx, vz); if (d < 0.5) break; p.x += vx / d * 0.08; p.z += vz / d * 0.08; W.push(); W.update(1 / 60); worst = Math.max(worst, Math.abs(W.pos.y - nav.groundY(W.pos))); }
      return { worst: +worst.toFixed(2), y: +W.pos.y.toFixed(2) };
    });
    check(w.worst < 0.15, `${TRACK}: walked the lane with feet on the ground (worst ${w.worst} m, ended at y ${w.y})`);
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
