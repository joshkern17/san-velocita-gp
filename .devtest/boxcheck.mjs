// dev: the pit boxes on every track (presets + real circuits): each team box has its room, the rooms' straight
// fronts stay on the curved garage line, and nothing of the track runs through one
//   node .devtest/boxcheck.mjs [name ...]
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
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  const res = await pg.evaluate(async (only) => {
    const M = await import('/js/track.js'), R = await import('/js/realtracks.js'), RO = await import('/js/runoff.js'), PB = await import('/js/pitboxes.js');
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
        out.push({ name: t.name, slots: slots.length, walls: L.walls.length, boxes: pit.boxes.length, off: +worst.toFixed(2), w: widths.length ? [Math.min(...widths), Math.max(...widths)].map(x => +x.toFixed(1)) : [], probs });
      } catch (e) { out.push({ name: t.name, error: String(e).slice(0, 200) }); }
    }
    return out;
  }, process.argv.slice(2));
  for (const r of res) {
    const fail = r.error || (r.probs && r.probs.length);
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : 'ok  '} ${r.name.padEnd(28)} ${r.pit === false ? 'no pit lane' : r.error || `${r.boxes} boxes, ${r.slots} slots, ${r.walls} walls, rooms ${r.w.join('-')} m, front off line ${r.off} m ${r.probs.join('; ')}`}`);
  }
} finally { await b.close(); server.kill(); }
process.exit(bad ? 1 : 0);
