// A real circuit's landmarks, made in the game's style (models/landmarks/<id>.glb + <id>.json: their footprints, from
// tools/tracks/landmarks/<id>.py): onto the track as track.landmarks, and the map's buildings, trees and grandstands
// inside those footprints cleared (they'd stand inside them). build.mjs does this on every build; on its own it patches
// a built track in place:
//   node tools/tracks/landmarks.mjs <id>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAND_GAP } from '../../js/standlines.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
export const landmarksFile = (id) => path.join(ROOT, 'models', 'landmarks', id + '.json');

// (inside a footprint grown by pad m: x, z in the track's frame; rot the footprint's heading in game space)
function inside(L, x, z, pad) {
  const c = Math.cos(L.rot || 0), s = Math.sin(L.rot || 0), dx = x - L.x, dz = z - L.z;
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  return Math.abs(u) <= L.hw + pad && Math.abs(v) <= L.hd + pad;
}

export function applyLandmarks(track, lm, log = console.log) {
  const items = lm.items, at = (x, z, pad) => items.some(L => inside(L, x, z, pad));
  const o = track.osm || {};
  const nb = (o.buildings || []).length, nt = (o.trees || []).length, np = (track.props || []).length;
  if (o.buildings) o.buildings = o.buildings.filter(b => !(b.p && (b.p.some(([x, z]) => at(x, z, 2)) || at(b.p.reduce((a, q) => a + q[0], 0) / b.p.length, b.p.reduce((a, q) => a + q[1], 0) / b.p.length, 4))));
  if (o.trees) o.trees = o.trees.filter(([x, z]) => !at(x, z, 4));
  if (track.props) track.props = track.props.filter(p => !at(p.x, p.z, 3));
  // (and the laser scan's real buildings and trees: tools/tracks/realscan.mjs)
  let scanned = 0;
  if (track.scan) {
    const S = track.scan, h0 = S.houses.length;
    S.houses = S.houses.filter(b => !(b.p.some(([x, z]) => at(x, z, 2)) || at(b.p.reduce((a, q) => a + q[0], 0) / b.p.length, b.p.reduce((a, q) => a + q[1], 0) / b.p.length, 4)));
    const raw = Buffer.from(S.trees || '', 'base64'), keep = [];
    for (let i = 0; i + 5 <= raw.length; i += 5) if (!at(raw.readInt16LE(i) / 2, raw.readInt16LE(i + 2) / 2, 4)) keep.push(raw.subarray(i, i + 5));
    scanned = h0 - S.houses.length + (raw.length / 5 - keep.length);
    track.scan = { ...S, trees: Buffer.concat(keep).toString('base64') };
  }
  if (track.propLines) { const live = new Set(track.props.map(p => p.ln)); track.propLines = track.propLines.filter(l => live.has(l.id)); }
  const cleared = np - (track.props || []).length;
  // (the map's other buildings on the circuit's grounds are its sheds, offices and stores, not homes: flat-roofed
  // utility buildings there, whatever the map calls them)
  let retyped = 0;
  if (lm.grounds && o.buildings) {
    const [x0, x1, z0, z1] = lm.grounds;
    for (const b of o.buildings) {
      const cx = b.p.reduce((a, q) => a + q[0], 0) / b.p.length, cz = b.p.reduce((a, q) => a + q[1], 0) / b.p.length;
      if (cx > x0 && cx < x1 && cz > z0 && cz < z1 && b.s !== 'warehouse') { b.s = 'warehouse'; b.r = 'flat'; delete b.m; retyped++; }
    }
    for (const b of (track.scan && track.scan.houses) || []) { // (the scan's too: zones.js femaKind makes a utility one a shed)
      const cx = b.p.reduce((a, q) => a + q[0], 0) / b.p.length, cz = b.p.reduce((a, q) => a + q[1], 0) / b.p.length;
      if (cx > x0 && cx < x1 && cz > z0 && cz < z1 && b.k !== 'utility') { b.k = 'utility'; retyped++; }
    }
  }
  // (the grandstands where the real ones are: curved lines of the trackside pack's covered / flags stands, a stand
  // at each node facing the track; the map's straight stand lines along them go)
  let added = 0, replaced = 0;
  if (lm.standLines && track.props) {
    track.propLines = track.propLines || []; let id = Math.max(0, ...track.propLines.map(q => q.id));
    const nodes = lm.standLines.flatMap(S => S.pts), n0 = track.props.length;
    const near = (p) => /^tp_stand_/.test(p.type) && nodes.some(q => Math.hypot(p.x - q[0], p.z - q[1]) < 25);
    const gone = new Set(track.props.filter(near).map(p => p.ln).filter(v => v != null));   // (a line touched goes whole)
    track.props = track.props.filter(p => !near(p) && !(/^tp_stand_/.test(p.type) && gone.has(p.ln)));
    replaced = n0 - track.props.length;
    for (const S of lm.standLines) {
      const ln = ++id, ids = S.fam === 'stand_roof' ? ['tp_stand_roof_a', 'tp_stand_roof_b'] : ['tp_stand_flags_a', 'tp_stand_flags_b'];
      track.propLines.push({ id: ln, type: 'tp:' + S.fam, pts: S.pts, gap: STAND_GAP, look: '', seed: ln });
      S.pts.forEach((q, k) => track.props.push({ type: ids[(ln + k) % 2], x: q[0], z: q[1], rot: Math.round(Math.atan2(S.f[k][0], S.f[k][1]) * 1000) / 1000, ln }));
      added += S.pts.length;
    }
    const live = new Set(track.props.map(p => p.ln)); track.propLines = track.propLines.filter(l => live.has(l.id));
  }
  // (nothing of the map's in a stand: its trees, and its buildings, which are mostly the stands themselves mapped)
  const standAt = (x, z, pad) => (track.props || []).some(p => /^tp_stand_/.test(p.type) && (() => { const c = Math.cos(p.rot), s2 = Math.sin(p.rot), dx = x - p.x, dz = z - p.z; return Math.abs(dx * c - dz * s2) < 7 + pad && Math.abs(dx * s2 + dz * c) < 6 + pad; })());
  const nt2 = (o.trees || []).length, nb2 = (o.buildings || []).length;
  if (o.trees) o.trees = o.trees.filter(([x, z]) => !standAt(x, z, 3));
  if (o.buildings) o.buildings = o.buildings.filter(b => !(b.p && b.p.some(([x, z]) => standAt(x, z, 1))));
  const inStands = nt2 - (o.trees || []).length + nb2 - (o.buildings || []).length;
  // (no two stands in one spot: the map's stand outlines overlap, and ours meet theirs)
  let stacked = 0;
  if (track.props) {
    const kept = [];
    track.props = track.props.filter(p => {
      if (!/^tp_stand_/.test(p.type)) return true;
      if (kept.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 6)) { stacked++; return false; }
      kept.push(p); return true;
    });
    const live = new Set(track.props.map(p => p.ln)); track.propLines = (track.propLines || []).filter(l => live.has(l.id));
  }
  // (its runoff: what it's made of where, as the reference has it; the physics reads it too)
  if (lm.surface) { o.surface = lm.surface; track.env.runoffStyle = 'real'; }
  track.landmarks = { url: lm.url, items };
  // (and the world's scattered trees kept out of the stands: world.js inLandmark)
  track.landmarks.stands = (track.props || []).filter(p => /^tp_stand_/.test(p.type)).map(p => [p.x, p.z, p.rot]);
  log(`  landmarks: ${items.length} of the circuit's own (${lm.url}); cleared under them ${nb - (o.buildings || []).length} map buildings, ${nt - (o.trees || []).length} trees, ${cleared} stands${scanned ? `, ${scanned} scanned buildings / trees` : ''}${retyped ? `; ${retyped} map buildings on the grounds made utility buildings` : ''}${added ? `; ${added} grandstands on curved lines where the real ones are (${replaced} of the map's straight ones replaced)` : ''}${stacked ? `; ${stacked} stacked stands dropped` : ''}${inStands ? `; ${inStands} map trees / buildings in the stands cleared` : ''}`);
  return track;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const id = process.argv[2]; if (!id) { console.error('usage: node tools/tracks/landmarks.mjs <id>'); process.exit(1); }
  const f = path.join(ROOT, 'tracks', 'real', id + '.json'), t = JSON.parse(fs.readFileSync(f, 'utf8'));
  applyLandmarks(t, JSON.parse(fs.readFileSync(landmarksFile(id), 'utf8')));
  fs.writeFileSync(f, JSON.stringify(t));
  // (and its entry in the index the game reads: the props live there, build.mjs's light copy)
  const xf = path.join(ROOT, 'tracks', 'real', 'index.json'), index = JSON.parse(fs.readFileSync(xf, 'utf8'));
  const { osm, terrain, dress, ground, scan, ...light } = t, k = index.findIndex(e => e.file === id + '.json');
  if (k >= 0) { index[k] = { ...light, file: id + '.json' }; fs.writeFileSync(xf, JSON.stringify(index)); }
  console.log('  ->', path.relative(ROOT, f), k >= 0 ? '+ index' : '');
}
