// dev: a saved track with three modular grandstands (S, M, L) along it (js/gstands.js), written as JSON for
// gstandshot.mjs. node --import ./tools/tracks/three-hook.mjs .devtest/gstandtrack.mjs "<track>" <out.json> [f1,f2,f3] [side]
import fs from 'node:fs';
const realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => (typeof u === 'string' && !/^https?:/.test(u) ? Promise.resolve({ ok: true, json: async () => JSON.parse(fs.readFileSync(u, 'utf8')) }) : realFetch(u, o));
const { loadEnvCatalog } = await import('../js/envlib.js'); await loadEnvCatalog();
const { sampleTrack, analyzeTrack } = await import('../js/track.js');
const { kitLineProps } = await import('../js/gstands.js');
const [name, out, fr = '0.12,0.42,0.72', sd = '-1'] = process.argv.slice(2);
const all = [JSON.parse(fs.readFileSync('saves/storage/svgp.editorWork.txt', 'utf8')), ...JSON.parse(fs.readFileSync('saves/storage/svgp.tracks.txt', 'utf8'))];
const t = structuredClone(all.find(q => q && q.name === name));
const T = sampleTrack(t), A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
t.props = (t.props || []).filter(p => !/^gs_/.test(p.type)); t.propLines = t.propLines || [];
const spots = [];
fr.split(',').map(Number).forEach((f, k) => {
  const i = Math.floor(f * (T.cut >= 0 ? T.cut : T.N)), side = +sd, off = side * ((side < 0 ? A.BL[i] : A.BR[i]) + 4);
  const cx = T.X[i] + T.RX[i] * off, cz = T.Z[i] + T.RZ[i] * off, L = { id: 900 + k, type: 'tp:gs_' + 'SML'[k], pts: [[cx - T.FX[i] * 30, cz - T.FZ[i] * 30], [cx + T.FX[i] * 30, cz + T.FZ[i] * 30]], gap: 12, look: '', seed: 0 };
  const nx = -T.RX[i] * side, nz = -T.RZ[i] * side; // (facing the track)
  const segs = [{ i: 0, s0: 0, l: 60 }];
  t.props.push(...kitLineProps(L, 'gs_' + 'SML'[k], segs, [[nx, nz]])); t.propLines.push(L);
  spots.push({ size: 'SML'[k], i, x: cx, z: cz, nx, nz, fx: T.FX[i], fz: T.FZ[i] });
});
fs.writeFileSync(out, JSON.stringify({ track: t, spots }));
console.log('props', t.props.filter(p => /^gs_/.test(p.type)).length, spots.map(s => s.size + '@' + s.i));
