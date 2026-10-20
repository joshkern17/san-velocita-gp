// dev: what one editor recompute costs on each real circuit, step by step (no browser)
//   node --import ./tools/tracks/three-hook.mjs .devtest/edperf.mjs
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = await import(join(ROOT, 'js/track.js')), R = await import(join(ROOT, 'js/roads.js')), O = await import(join(ROOT, 'js/runoff.js'));
globalThis.window ||= globalThis; const E = await import(join(ROOT, "js/edcheck.js"));
for (const f of readdirSync(join(ROOT, 'tracks/real')).filter(f => f.endsWith('.json') && f !== 'index.json')) {
  const t = JSON.parse(readFileSync(join(ROOT, 'tracks/real', f))); if (!t.points) continue;
  t.env = { ...T.defaultEnv(), ...(t.env || {}) }; t.paint ||= []; t.roads ||= []; t.zones ||= []; t.buildings ||= []; t.props ||= [];
  const ms = {}, tm = (k, fn) => { const a = performance.now(); const r = fn(); ms[k] = (ms[k] || 0) + performance.now() - a; return r; };
  let S, A, pit;
  for (let r = 0; r < 3; r++) {
    S = tm('sample', () => T.sampleTrack(t)); tm('raise', () => R.raiseTrackOverRoads(t, S));
    A = tm('analyze', () => T.analyzeTrack(S, t.env, t.paint, t.osm, t.dress));
    pit = tm('pit', () => T.buildPitLane(S, A, t.env, t.osm && t.osm.pitLane, O.surfaceGrid(t.osm && t.osm.surface), t.dress && t.dress.pit)); A.pit = pit;
    tm('roads', () => R.applyRoadsToCircuit(t, S, A)); tm('runoff', () => { A.run = O.runoffLayout(S, A, t); });
    tm('check', () => E.findProblems(t, S, A, pit));
  }
  const tot = Object.values(ms).reduce((a, b) => a + b, 0) / 3;
  console.log(f.padEnd(18), String(t.points.length).padStart(5), 'pts', tot.toFixed(0).padStart(5), 'ms |', Object.entries(ms).map(([k, v]) => `${k} ${(v / 3).toFixed(0)}`).join(' '));
}
