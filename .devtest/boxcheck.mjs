// dev: the pit boxes on every track (presets + real circuits): each team box has its room, the rooms' straight
// fronts stay on the curved garage line, and nothing of the track runs through one
//   node .devtest/boxcheck.mjs [name ...]      (SCENERY=1: also builds each world and looks for scenery in the rooms:
//                                               trees, stands, boards, props, js/world.js keeps out with pitBlockTest)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 9490 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
let bad = 0;
try {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => console.log(m.text()));
  if (process.env.V) await pg.addInitScript(() => { window.__V = 1; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 });
  const res = await pg.evaluate(async ([only, SCENERY]) => {
    const M = await import('/js/track.js'), R = await import('/js/realtracks.js'), RO = await import('/js/runoff.js'), PB = await import('/js/pitboxes.js'), W = SCENERY ? await import('/js/world.js') : null, THREE = await import('three');
    const list = [...M.presetTracks()];
    for (const p of R.realTracks()) list.push(await R.hydrateReal(M.cloneTrack(p)));
    const out = [];
    for (const t of list) {
      if (only.length && !only.includes(t.name)) continue;
      try {
        const T = M.sampleTrack(t), A = M.analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
        const pit = M.buildPitLane(T, A, t.env, t.osm && t.osm.pitLane, RO.surfaceGrid(t.osm && t.osm.surface), t.dress && t.dress.pit);
        if (!pit) { out.push({ name: t.name, pit: false }); continue; }
        A.pit = pit;
        const L = PB.pitSlots(T, A, pit), { slots } = L, probs = [];
        const missing = pit.boxes.map((_, k) => k).filter(k => !slots.some(s => s.k === k));
        if (missing.length) probs.push('no room for box ' + missing.join(','));
        let worst = 0, intrude = 0; const widths = [];
        for (const s of slots) {
          if (s.k < 0) continue;
          const F = PB.boxFrame(T, A, pit, s.k);
          widths.push(F.x1 - F.x0);
          // how far the straight front strays from the curved garage line (the signs and crews stand by the line)
          const o = F.P(0, 0, 0), n = F.P(0, 1, 0), nx = n[0] - o[0], nz = n[2] - o[2];
          for (let q = 0; q < L.S.length; q++) {
            if (L.S[q] < s.s0 || L.S[q] > s.s1) continue;
            worst = Math.max(worst, Math.abs((L.G[q][0] - o[0]) * nx + (L.G[q][2] - o[2]) * nz));
          }
          // the track's own samples (away from the lane's stretch) inside the room's footprint
          for (let i = 0; i < T.N; i += 2) {
            if (pit.REG[i] >= 0) continue;
            for (const z of [2, 7, 12]) {
              const c = F.P(0, z, 0), r = Math.hypot(T.X[i] - c[0], T.Z[i] - c[2]);
              if (r < T.W[i] / 2 + 3) { intrude++; break; }
            }
          }
        }
        if (widths.length && Math.min(...widths) < 11.9) probs.push(`a room only ${Math.min(...widths).toFixed(1)} m wide`);
        if (worst > 0.6) probs.push(`front ${worst.toFixed(2)} m off the garage line`);
        if (intrude) probs.push(`track inside a room (${intrude} samples)`);
        // the scenery: anything small enough to be a thing (not the ground, the road, the lane) standing in a room
        if (W) {
          const inBlock = PB.pitBlockTest(T, A, pit), w = W.buildWorld(t, T, A), hits = new Map(), m4 = new THREE.Matrix4(), v = new THREE.Vector3();
          w.root.updateMatrixWorld(true);
          w.root.traverse(o => {
            if (!o.isMesh) return;
            for (let q = o.parent; q; q = q.parent) if (q.name === 'PitBoxes' || q.name === 'StartGantry') return; // (the gantry stands over the grid: on a tight street circuit its leg can be at a box's front)
            if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
            if (o.geometry.boundingSphere.radius > 30) return;
            if (o.geometry.isInstancedBufferGeometry) return; // (a shader's particles: rain, sparks)
            const key = o.name || o.material?.name || o.geometry.type, hit = () => hits.set(key, (hits.get(key) || 0) + 1);
            if (o.name === 'env-merged') { // (many things baked into one, in the world's frame: where its points are, below the roof)
              const P = o.geometry.attributes.position; let c = 0;
              for (let i = 0; i < P.count; i += 3) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); if (inBlock(v.x, v.z, -0.5, v.y)) c++; }
              if (c > 20) hits.set(key + ' points', (hits.get(key + ' points') || 0) + c);
              return;
            }
            const n = o.isInstancedMesh ? o.count : 1;
            for (let k = 0; k < n; k++) {
              if (o.isInstancedMesh) { o.getMatrixAt(k, m4); m4.premultiply(o.matrixWorld); v.copy(o.geometry.boundingSphere.center).applyMatrix4(m4); } else v.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
              if (inBlock(v.x, v.z, -0.5, v.y)) { hit(); if (window.__V) console.log('  in a room:', key, o.parent && o.parent.name, o.material && o.material.name, v.toArray().map(x => x.toFixed(1)).join(','), 'r', o.geometry.boundingSphere.radius.toFixed(1), 'chain:', (() => { const c = []; for (let q = o.parent; q; q = q.parent) c.push(q.name || q.type); return c.join('<'); })(), 'n', o.geometry.attributes.position.count, 'inst', o.isInstancedMesh ? o.count : '-', 'near:', (t.props || []).filter(q => Math.hypot(q.x - v.x, q.z - v.z) < 20).map(q => q.type + '@' + Math.hypot(q.x - v.x, q.z - v.z).toFixed(1)).join(' ')); }
            }
          });
          if (hits.size) probs.push('scenery in the rooms: ' + [...hits].map(([k, c]) => `${k} x${c}`).join(', '));
          // the ground (terrain, plots, runoff, roads: the big meshes) never above a room's floor: rays down through each room
          const big = []; w.root.traverse(o => {
            if (!o.isMesh || o.isInstancedMesh) return;
            for (let q = o.parent; q; q = q.parent) if (q.name === 'PitBoxes') return;
            if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
            if (o.geometry.boundingSphere.radius > 30) big.push(o);
          });
          const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0); let gWorst = 0, gWho = '', gN = 0;
          for (const s of slots) {
            const F = PB.boxFrame(T, A, pit, s.k < 0 ? null : s.k) || (() => null)();
            if (s.k < 0 || !F) continue;
            for (let x = F.x0 + 0.4; x <= F.x1 - 0.4; x += 1.0) for (let z = 0.3; z <= PB.BOX.depth - 0.3; z += 1.0) {
              const f = F.P(x, z, PB.BOX.floor);
              rc.set(new THREE.Vector3(f[0], f[1] + 3.5, f[2]), down); rc.far = 3.5;
              for (const h of rc.intersectObjects(big, false)) {
                const up = h.point.y - f[1]; if (up > 0.005) { gN++; if (up > gWorst) { gWorst = up; gWho = [h.object.name, h.object.material?.name, h.object.material?.type, h.object.parent?.name, h.object.geometry.attributes.position.count, Object.keys(h.object.geometry.attributes).join('+'), 'c' + h.object.material?.color?.getHexString(), 'side' + h.object.material?.side, !!h.object.material?.map].join('|') + ' at ' + h.point.toArray().map(v => v.toFixed(1)).join(','); } }
              }
            }
          }
          if (gN) probs.push(`ground above a room's floor: ${gN} points, up to ${gWorst.toFixed(2)} m (${gWho})`);
        }
        out.push({ name: t.name, slots: slots.length, walls: L.walls.length, boxes: pit.boxes.length, off: +worst.toFixed(2), w: widths.length ? [Math.min(...widths), Math.max(...widths)].map(x => +x.toFixed(1)) : [], probs });
      } catch (e) { out.push({ name: t.name, error: String(e).slice(0, 200) }); }
    }
    return out;
  }, [process.argv.slice(2), !!process.env.SCENERY]);
  for (const r of res) {
    const fail = r.error || (r.probs && r.probs.length);
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : 'ok  '} ${r.name.padEnd(28)} ${r.pit === false ? 'no pit lane' : r.error || `${r.boxes} boxes, ${r.slots} slots, ${r.walls} walls, rooms ${r.w.join('-')} m, front off line ${r.off} m ${r.probs.join('; ')}`}`);
  }
} finally { await b.close(); server.kill(); }
process.exit(bad ? 1 : 0);
