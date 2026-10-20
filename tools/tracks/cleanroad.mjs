// The real circuits' roads with the map's glitches taken out (js/roadclean.js: zig-zags, corners tighter than the
// road is wide), as they are on disk: tracks/real/<id>.json's points, and its dressing (tracks/real/dress/<id>.json,
// placed by m along the lap) moved onto the cleaned road so it stays where it stood (js/spline.js remapDress).
//   node --import ./tools/tracks/three-hook.mjs tools/tracks/cleanroad.mjs [ids|all] [--write] [--again]
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TK = await import(join(ROOT, 'js/track.js')), RC = await import(join(ROOT, 'js/roadclean.js')), SP = await import(join(ROOT, 'js/spline.js'));
const args = process.argv.slice(2), WRITE = args.includes('--write');
const index = JSON.parse(readFileSync(join(ROOT, 'tracks/real/index.json'), 'utf8')), all = (Array.isArray(index) ? index : index.tracks || Object.values(index)).filter(t => t && t.real).map(t => t.real.id);
const list = Array.isArray(index) ? index : index.tracks || Object.values(index); let indexChanged = false;
const pick = args.filter(a => !a.startsWith('--')), ids = !pick.length || pick[0] === 'all' ? all : pick.flatMap(a => a.split(','));
for (const id of ids) {
  const file = join(ROOT, 'tracks/real', id + '.json'), t = JSON.parse(readFileSync(file, 'utf8'));
  // (once only: what can't be cleaned within the limits would move a little further each time; the build cleans the
  // map's road afresh every bake)
  if (t.real && t.real.cleaned && !args.includes('--again')) { console.log(`${id.padEnd(12)} already cleaned (--again to redo)`); continue; }
  const before = RC.roadFaults(t).faults, r = RC.cleanRoad(t);
  if (!before.length && !r.dips) { console.log(`${id.padEnd(12)} clean`); continue; }
  const t2 = { ...t, points: r.points, start: r.start };
  const T1 = TK.sampleTrack(t), T2 = TK.sampleTrack(t2);
  // the dressing onto the cleaned road: each node where it stands on the ground
  // (both copies: the Studio's file the build merges in, and the one in the circuit's file the game reads)
  const df = join(ROOT, 'tracks/real/dress', id + '.json'), dfile = existsSync(df) ? JSON.parse(readFileSync(df, 'utf8')) : null;
  const map = SP.lapRemap(TK.densePath(t, 1), TK.densePath(t2, 1), !!t.open);
  const place = (dd, off, side) => { const F = TK.trackFrame(T1, dd), o = side * (F.w / 2 + off), g = map(dd); return TK.trackProject(T2, F.x + F.rx * o, F.z + F.rz * o, side, g - 40, g + 40) || [g, off]; };
  const dress = dfile && SP.remapDress(dfile, map, place), inFile = t.dress && SP.remapDress(t.dress, map, place);
  const kinds = before.reduce((m, f) => (m[f.kind] = (m[f.kind] || 0) + 1, m), {});
  console.log(`${id.padEnd(12)} ${JSON.stringify(kinds)} samples at fault -> ${r.left} left · ${r.dips} dips / crests eased · ${r.merged} points merged · the most any point moved ${r.moved} m (point ${r.movedAt}) · lap ${T1.L.toFixed(1)} -> ${T2.L.toFixed(1)} m`);
  if (WRITE) {
    t.points = r.points; t.start = r.start; if (inFile) t.dress = inFile; if (t.real) t.real.cleaned = true; writeFileSync(file, JSON.stringify(t));
    if (dress) writeFileSync(df, JSON.stringify(dress));
    // (the picker's list carries each circuit's points too: the game draws the road from those)
    const e = list.find(x => x.real.id === id); if (e) { e.points = r.points; e.start = r.start; e.real.cleaned = true; indexChanged = true; }
  }
}
if (indexChanged) writeFileSync(join(ROOT, 'tracks/real/index.json'), JSON.stringify(index));
if (!WRITE) console.log('(a dry run: --write saves it)');
