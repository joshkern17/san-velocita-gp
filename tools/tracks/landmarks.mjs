// A real circuit's landmarks, made in the game's style (models/landmarks/<id>.glb + <id>.json: their footprints, from
// tools/tracks/landmarks/<id>.py): onto the track as track.landmarks, and the map's buildings, trees and grandstands
// inside those footprints cleared (they'd stand inside them). build.mjs does this on every build; on its own it patches
// a built track in place:
//   node tools/tracks/landmarks.mjs <id>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { standLine } from '../../js/standlines.js';

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
  }
  // (the grandstands where the real ones are: lines of the trackside pack's covered / flags stands, where the map's
  // own lines don't already stand)
  let added = 0;
  if (lm.standLines && track.props) {
    track.propLines = track.propLines || []; let id = Math.max(0, ...track.propLines.map(q => q.id));
    const stands = track.props.filter(p => /^tp_stand_/.test(p.type));
    for (const S of lm.standLines) {
      const mid = [(S.a[0] + S.b[0]) / 2, (S.a[1] + S.b[1]) / 2];
      if ([S.a, mid, S.b].some(q => stands.some(p => Math.hypot(p.x - q[0], p.z - q[1]) < 14))) continue;
      const L = standLine(++id, S.a, S.b, S.f[0], S.f[1], S.fam, id);
      track.propLines.push(L.line); track.props.push(...L.props); added += L.props.length;
    }
  }
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
  track.landmarks = { url: lm.url, items };
  log(`  landmarks: ${items.length} of the circuit's own (${lm.url}); cleared under them ${nb - (o.buildings || []).length} map buildings, ${nt - (o.trees || []).length} trees, ${cleared} stands${retyped ? `; ${retyped} map buildings on the grounds made utility buildings` : ''}${added ? `; ${added} grandstands added where the real ones are` : ''}${stacked ? `; ${stacked} stacked stands dropped` : ''}`);
  return track;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const id = process.argv[2]; if (!id) { console.error('usage: node tools/tracks/landmarks.mjs <id>'); process.exit(1); }
  const f = path.join(ROOT, 'tracks', 'real', id + '.json'), t = JSON.parse(fs.readFileSync(f, 'utf8'));
  applyLandmarks(t, JSON.parse(fs.readFileSync(landmarksFile(id), 'utf8')));
  fs.writeFileSync(f, JSON.stringify(t));
  // (and its entry in the index the game reads: the props live there, build.mjs's light copy)
  const xf = path.join(ROOT, 'tracks', 'real', 'index.json'), index = JSON.parse(fs.readFileSync(xf, 'utf8'));
  const { osm, terrain, dress, ground, ...light } = t, k = index.findIndex(e => e.file === id + '.json');
  if (k >= 0) { index[k] = { ...light, file: id + '.json' }; fs.writeFileSync(xf, JSON.stringify(index)); }
  console.log('  ->', path.relative(ROOT, f), k >= 0 ? '+ index' : '');
}
