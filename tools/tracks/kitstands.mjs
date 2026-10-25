// A real circuit's grandstands from the modular kit (js/gstands.js: S club, M main, L two-deck), where the real ones
// stand: tools/tracks/landmarks/<id>-kit.json lists each stand's front line (the real stand's track-side edge, from the
// map) and its size. Each becomes a PROPS line (type tp:gs_<size>, as the Circuit Designer draws one), moved back
// whole behind the barrier where the map has it nearer, and the map's / the laser scan's buildings and trees inside
// it cleared; `clear` areas (the map's pit building: the game builds its own garages there) are cleared too.
// `replace`: the importer's covered / flag stand lines go. build.mjs does this on every build; on its own it patches a
// built track in place:
//   node tools/tracks/kitstands.mjs <id>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
export const kitFile = (id) => path.join(HERE, 'landmarks', id + '-kit.json');

// (the scenery's catalogue, as the game loads it: the kit pieces' sizes and offsets)
async function kit() {
  await import('./three-hook.mjs'); // ('three' for the game's modules, run from build.mjs too)
  globalThis.window ??= {};
  window.__SVGP_ENV ??= { catalog: JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/env/catalog.json'), 'utf8')) };
  const E = await import('../../js/envlib.js'); await E.loadEnvCatalog();
  return { ...(await import('../../js/gstands.js')), TK: await import('../../js/track.js'), SC: await import('../../js/scan.js'), Z: await import('../../js/zones.js') };
}

const BEHIND = 3; // m: a stand's front this far past the barrier at least
export async function applyKitStands(track, cfg, log = console.log) {
  const { kitLineProps, kitStands, TK, SC, Z } = await kit();
  const T = TK.sampleTrack(track), A = TK.analyzeTrack(T, track.env, track.paint, track.osm, track.dress);
  const nearest = (x, z) => { let b = 1e9, bi = 0; for (let i = 0; i < T.N; i++) { const d = Math.hypot(x - T.X[i], z - T.Z[i]) - T.W[i] / 2; if (d < b) { b = d; bi = i; } } return [bi, b]; };
  // (how far out the barrier stands there, on the side towards (x, z): the most within 10 m either way)
  const barrierOut = (i0, x, z) => {
    const side = ((x - T.X[i0]) * T.RX[i0] + (z - T.Z[i0]) * T.RZ[i0]) > 0 ? 1 : -1, O = side < 0 ? A.BL : A.BR, H = side < 0 ? A.HAS_L : A.HAS_R;
    let m = 0; for (let k = -5; k <= 5; k++) { const i = ((i0 + k) % T.N + T.N) % T.N; if (!H || H[i]) m = Math.max(m, O[i] - T.W[i] / 2); }
    return m;
  };
  track.props = track.props || []; track.propLines = track.propLines || [];
  if (cfg.replace) {
    const gone = new Set(track.props.filter(p => /^tp_stand_|^gs_[SML]_/.test(p.type)).map(p => p.ln));
    track.props = track.props.filter(p => !/^tp_stand_|^gs_[SML]_/.test(p.type));
    track.propLines = track.propLines.filter(l => !gone.has(l.id));
  }
  let id = Math.max(0, ...track.propLines.map(q => q.id));
  const made = [];
  for (const S of cfg.stands) {
    let P = S.pts.map(p => p.slice());
    // which way it faces: towards the track from its middle
    const a = P[0], b = P[P.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, [im] = nearest(mx, mz);
    let nx = -uz, nz = ux; if ((T.X[im] - mx) * nx + (T.Z[im] - mz) * nz < 0) { nx = -nx; nz = -nz; }
    // behind the barrier: the whole line moved back by the most any bit of its front needs
    let need = 0;
    for (let s = 0; s <= l; s += 4) { const x = a[0] + ux * s, z = a[1] + uz * s, [i, g] = nearest(x, z); need = Math.max(need, barrierOut(i, x, z) + BEHIND - g); }
    if (need > 0) P = P.map(([x, z]) => [+(x - nx * need).toFixed(1), +(z - nz * need).toFixed(1)]);
    const L = { id: ++id, type: 'tp:' + S.cls, pts: P, gap: 12, look: '', seed: id };
    const segs = [], side = []; let tot = 0;
    for (let k = 0; k + 1 < P.length; k++) { const sl = Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]); segs.push({ i: k, s0: tot, l: sl }); tot += sl; side.push([nx, nz]); }
    const props = kitLineProps(L, S.cls, segs, side);
    if (!props.length) { log(`  ${S.name}: no ${S.cls} pieces in the catalogue, left out`); continue; }
    track.propLines.push(L); track.props.push(...props);
    made.push({ S, props, need });
  }
  // the stands' outlines on the ground, and the cleared areas: nothing of the map's or the scan's inside them
  const stands = kitStands(track.props, () => 0), polys = [...stands.map(s => s.outline), ...(cfg.clear || []).map(c => c.p)];
  const grow = (p, pad) => { const c = p.reduce((s, q) => [s[0] + q[0] / p.length, s[1] + q[1] / p.length], [0, 0]); return p.map(([x, z]) => { const dx = x - c[0], dz = z - c[1], d = Math.hypot(dx, dz) || 1; return [x + dx / d * pad, z + dz / d * pad]; }); };
  const G = polys.map(p => grow(p, 3)), inAny = (x, z) => G.some(p => Z.pointInPoly(x, z, p));
  const hitB = (pts) => pts.some(([x, z]) => inAny(x, z)) || inAny(...pts.reduce((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length], [0, 0]))
    || G.some(g => g.some(([x, z]) => Z.pointInPoly(x, z, pts)));
  const o = track.osm || {}, n0 = [(o.buildings || []).length, (o.trees || []).length];
  if (o.buildings) o.buildings = o.buildings.filter(b => !(b.p && hitB(b.p)));
  if (o.trees) o.trees = o.trees.filter(([x, z]) => !inAny(x, z));
  let sh = 0, st = 0;
  if (track.scan) {
    const h0 = track.scan.houses.length; track.scan.houses = track.scan.houses.filter(b => !hitB(b.p)); sh = h0 - track.scan.houses.length;
    const trees = SC.scanTrees(track.scan), keep = trees.filter(([x, z]) => !inAny(x, z)); st = trees.length - keep.length;
    const bytes = new Uint8Array(keep.length * 5), dv = new DataView(bytes.buffer); // (packed as scan.js packs them)
    keep.forEach(([x, z, h], i) => { dv.setInt16(i * 5, Math.round(x * 2), true); dv.setInt16(i * 5 + 2, Math.round(z * 2), true); dv.setUint8(i * 5 + 4, Math.min(255, Math.round(h * 5))); });
    track.scan = { ...track.scan, trees: Buffer.from(bytes).toString('base64') };
  }
  for (const m of made) log(`  ${m.S.name.padEnd(18)} ${m.S.cls}: ${m.props.length} pieces${m.need > 0 ? `, moved ${m.need.toFixed(1)} m back behind the barrier` : ''}`);
  log(`  grandstands (kit): ${made.length} stands; cleared ${n0[0] - (o.buildings || []).length} map buildings, ${n0[1] - (o.trees || []).length} map trees, ${sh} scanned buildings, ${st} scanned trees`);
  return made.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const id = process.argv[2], f = path.join(ROOT, 'tracks/real', id + '.json');
  const track = JSON.parse(fs.readFileSync(f, 'utf8'));
  await applyKitStands(track, JSON.parse(fs.readFileSync(kitFile(id), 'utf8')));
  fs.writeFileSync(f, JSON.stringify(track));
  // (the light index carries the props and lines too)
  const xf = path.join(ROOT, 'tracks/real/index.json'), index = JSON.parse(fs.readFileSync(xf, 'utf8')), e = index.find(q => q.file === id + '.json');
  if (e) { e.props = track.props; e.propLines = track.propLines; fs.writeFileSync(xf, JSON.stringify(index)); }
  console.log(`written: tracks/real/${id}.json`);
}
