// dev: in-game views of a track file, to find what's wrong where: VIEWS=high (oblique, 70 m up, every ~400 m round the
// lap, looking out to both sides) | jn (each junction where a street meets the track, from 25 m up) | at=x,z[,h]
// (one look at a spot). Weather clear, midday.
//   .devtest/guard.sh -t 400 node .devtest/trackshots.mjs <file.svgp.json> <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [src, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const j = JSON.parse(readFileSync(src, 'utf8')), track = j.track || j;
track.env.weather = 'clear'; track.env.time = 'day';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] }); // (no throttling: a world build stalled past 5 min now and then)
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  // (window.__svgp is there before the game has booted: a race started before boot() runs is thrown away when boot
  //  shows its own screen, which is what stalled these runs at 90% now and then. Wait for the boot screen first)
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 60000, polling: 200 }); await pg.waitForTimeout(300);
  await pg.evaluate((t) => window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu'), track);
  { const t0 = Date.now();
    for (let k = 0; ; k++) {
      if (await pg.evaluate(() => !!(window.__svgp.sim && window.__svgp.sim.world))) break;
      if (k % 20 === 19) console.log(`  ${k + 1} s: ${await pg.evaluate(() => { const e = document.getElementById('load-step'); return (e ? e.textContent : '?') + ' (' + window.__svgp.screen + ')'; })}`);
      if (Date.now() - t0 > 300000) { await pg.screenshot({ path: join(out, 'STUCK.png') }); throw new Error('the world never built'); }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`world built in ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
  await pg.waitForTimeout(3000);
  await pg.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
  await pg.evaluate(() => { const s = window.__svgp.sim, r = s.render; s.render = function (...a) { const c = window.__shot; if (c) { this.camera.position.set(...c.p); this.camera.lookAt(...c.l); this.camera.fov = c.fov || 64; this.camera.far = 6000; this.camera.updateProjectionMatrix(); this.world.root.traverse(o => { if (o.name === 'env-cell') o.visible = true; }); /* (the game hides scenery cells far from the car, which is on the grid: show them all for the shot) */ } return r.apply(this, a); }; });
  const mode = process.env.VIEWS || 'high';
  const views = await pg.evaluate((mode) => {
    const sim = window.__svgp.sim, T = sim.T, gh = sim.world.groundHeight, v = [];
    if (mode.startsWith('cam=')) { // free cameras: cam=px,ph,pz,lx,lh,lz;... (ph, lh: metres above the ground there)
      mode.slice(4).split(';').forEach((q, k) => { const [px, ph, pz, lx, lh, lz, fov = 60] = q.split(',').map(Number); v.push({ name: `cam${k}`, p: [px, gh(px, pz) + ph, pz], l: [lx, gh(lx, lz) + lh, lz], fov }); });
      return v;
    }
    if (mode.startsWith('top=')) { // straight down: top=x,z,h;x,z,h (a little tilt so the camera has an up)
      for (const q of mode.slice(4).split(';')) { const [x, z, h = 60] = q.split(',').map(Number); v.push({ name: `top_${x}_${z}`, p: [x, gh(x, z) + h, z + 0.01], l: [x, gh(x, z), z], fov: 70 }); }
      return v;
    }
    if (mode.startsWith('at=')) { // (several spots: at=x,z;x,z: each from 4 sides, 30 m up, and from the track 2 m up both ways)
      for (const q of mode.slice(3).split(';')) {
        const [x, z, h = 30] = q.split(',').map(Number); let bi = 0, bd = Infinity; for (let i = 0; i < T.N; i++) { const d = (T.X[i] - x) ** 2 + (T.Z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
        for (const [k, a] of [[0, 0.8], [1, 2.4], [2, 4], [3, 5.5]]) v.push({ name: `at_${x}_${z}_${k}`, p: [x + Math.cos(a) * h * 1.6, gh(x, z) + h, z + Math.sin(a) * h * 1.6], l: [x, gh(x, z), z] });
        for (const dir of [-1, 1]) { const i = ((bi - dir * Math.round(60 / T.ds)) % T.N + T.N) % T.N; v.push({ name: `at_${x}_${z}_drive${dir}`, p: [T.X[i], T.Y[i] + 2, T.Z[i]], l: [T.X[bi], T.Y[bi] + 1, T.Z[bi]], fov: 60 }); }
      }
      return v;
    }
    if (mode === 'water') { // the biggest three water areas: from the nearest bit of track (driver's eye, and 25 m up behind it), and from above
      const W = (sim.track.osm && sim.track.osm.water || []).map(w => { let a = 0, cx = 0, cz = 0; w.p.forEach((q, i) => { const r = w.p[(i + 1) % w.p.length], c = q[0] * r[1] - r[0] * q[1]; a += c; cx += (q[0] + r[0]) * c; cz += (q[1] + r[1]) * c; }); return { w, a: Math.abs(a / 2), cx: cx / (3 * a), cz: cz / (3 * a) }; }).sort((p, q) => q.a - p.a).slice(0, 3);
      W.forEach(({ w, cx, cz }, k) => {
        let bi = 0, bd = Infinity, bq = null; for (let i = 0; i < T.N; i += 2) for (const q of w.p) { const d = (T.X[i] - q[0]) ** 2 + (T.Z[i] - q[1]) ** 2; if (d < bd) { bd = d; bi = i; bq = q; } }
        const y = T.Y[bi];
        v.push({ name: `water${k}_eye`, p: [T.X[bi], y + 1.3, T.Z[bi]], l: [bq[0], gh(bq[0], bq[1]), bq[1]], fov: 70, at: [Math.round(T.X[bi]), Math.round(T.Z[bi])] });
        const dx = bq[0] - T.X[bi], dz = bq[1] - T.Z[bi], L = Math.hypot(dx, dz) || 1;
        v.push({ name: `water${k}_back`, p: [T.X[bi] - dx / L * 30, y + 25, T.Z[bi] - dz / L * 30], l: [bq[0] + dx / L * 20, gh(bq[0], bq[1]), bq[1] + dz / L * 20], fov: 70 });
        v.push({ name: `water${k}_shore`, p: [bq[0] - dx / L * 6 + dz / L * 25, gh(bq[0], bq[1]) + 6, bq[1] - dz / L * 6 - dx / L * 25], l: [bq[0] + dx / L * 15, gh(bq[0], bq[1]), bq[1] + dz / L * 15], fov: 70 });
      });
      return v;
    }
    if (mode === 'jn') { sim.A.roadL.junctions.forEach((jn, k) => { const ti = jn.ti, s = jn.side, ox = T.RX[ti] * s, oz = T.RZ[ti] * s; v.push({ name: `jn${k}`, p: [jn.x + ox * 30 - T.FX[ti] * 18, gh(jn.x, jn.z) + 24, jn.z + oz * 30 - T.FZ[ti] * 18], l: [jn.x, gh(jn.x, jn.z), jn.z] }); }); return v; }
    const step = Math.round(400 / T.ds);
    for (let i = 0, k = 0; i < T.N; i += step, k++) for (const s of [-1, 1]) {
      const x = T.X[i] + T.RX[i] * s * 40, z = T.Z[i] + T.RZ[i] * s * 40;
      v.push({ name: `high${String(k).padStart(2, '0')}${s < 0 ? 'L' : 'R'}`, p: [T.X[i] - T.RX[i] * s * 60, T.Y[i] + 70, T.Z[i] - T.RZ[i] * s * 60], l: [x, gh(x, z), z], fov: 70, at: [Math.round(T.X[i]), Math.round(T.Z[i])] });
    }
    return v;
  }, mode);
  if (process.env.WALLS) { // how high the ground behind each barrier stands over the track edge, round the lap (where a retaining wall goes)
    const res = await pg.evaluate(() => {
      const sim = window.__svgp.sim, T = sim.T, A = sim.A, gh = sim.world.groundHeight, out = [];
      for (const side of [-1, 1]) for (let k = 0; k < T.N; k += 2) {
        const off = side < 0 ? A.BL[k] : A.BR[k], s = side * off, x = T.X[k] + T.RX[k] * s, z = T.Z[k] + T.RZ[k] * s;
        const g = Math.max(gh(x, z), gh(x + T.RX[k] * side * 0.7, z + T.RZ[k] * side * 0.7)), h = g - T.Y[k];
        out.push([Math.round(T.D[k]), side, +h.toFixed(2), Math.round(x), Math.round(z)]);
      }
      return out;
    });
    const hist = [0, 0.12, 0.3, 0.5, 1, 2, 4].map((lo, q, arr) => [lo, res.filter(r => r[2] >= lo && (q + 1 === arr.length || r[2] < arr[q + 1])).length]);
    console.log('ground behind the barrier over the track edge (m): count of samples', hist.map(([a, n]) => `>=${a}: ${n}`).join(' | '));
    for (const r of res.filter(r => Math.abs(r[3] - 544) < 60 && Math.abs(r[4] - 340) < 60 && r[2] > 0.12).slice(0, 40)) console.log('  near spot 2:', JSON.stringify(r));
  }
  if (process.env.PROBE) { // which mesh is on top at each point of a grid: PROBE=x,z,half,step
    const res = await pg.evaluate(async (pr) => {
      const [cx, cz, hs, st] = pr.split(',').map(Number), THREE = await import('three'), sim = window.__svgp.sim, scene = sim.scene || sim.world.root.parent;
      const rc = new THREE.Raycaster(), out = {}, sw = sim.world.root;
      const meshes = []; sw.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
      const T = sim.T;
      for (let x = cx - hs; x <= cx + hs; x += st) for (let z = cz - hs; z <= cz + hs; z += st) {
        rc.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
        const h = rc.intersectObjects(meshes, false)[0]; if (!h) continue;
        const m = h.object.material, key = (h.object.name || h.object.parent?.name || '?') + ' | ' + (m.map && m.map.name || '') + ' #' + (m.color ? m.color.getHexString() : '');
        let bi = 0, bd = 1e18; for (let i = 0; i < T.N; i++) { const d = (T.X[i] - x) ** 2 + (T.Z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
        const lat = (x - T.X[bi]) * T.RX[bi] + (z - T.Z[bi]) * T.RZ[bi], bar = lat < 0 ? sim.A.BL[bi] : sim.A.BR[bi];
        (out[key] ||= []).push(`${x},${z} lat ${lat.toFixed(1)} bar ${bar.toFixed(1)}`);
      }
      return Object.entries(out).map(([k, v]) => [k, v.length, v.slice(0, 3)]);
    }, process.env.PROBE);
    for (const [k, n, ex] of res) console.log(n, k, ex.join(' ; '));
  }
  for (const v of views) {
    await pg.evaluate((v) => { window.__shot = v; }, v);
    await pg.waitForTimeout(500);
    await pg.screenshot({ path: join(out, v.name + '.png') });
    // PICK=fx,fy (0..1 across / down the picture): what's there, front to back (everything in the scene, not just the world)
    if (process.env.PICK) console.log(v.name, 'at', process.env.PICK, await pg.evaluate(async (pk) => {
      const THREE = await import('three'), sim = window.__svgp.sim, cam = sim.camera, [fx, fy] = pk.split(',').map(Number);
      let scene = sim.world.root; while (scene.parent) scene = scene.parent;
      const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(fx * 2 - 1, 1 - fy * 2), cam);
      const all = []; scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible) all.push(o); });
      return rc.intersectObjects(all, false).slice(0, 6).map(h => { let p = h.object, chain = []; while (p && chain.length < 4) { chain.push(p.name || p.type); p = p.parent; } return `${chain.join('<')} @${h.distance.toFixed(0)}m`; }).join(' | ') || '(nothing: sky)';
    }, process.env.PICK));
  }
  console.log(views.length, 'shots in', out, JSON.stringify(views.map(v => [v.name, v.at || v.l.map(Math.round)])));
} finally { await b.close(); server.kill(); }
