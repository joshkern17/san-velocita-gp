// The real circuits' grandstands behind their barriers (js/standsbehind.js), as they are on disk: tracks/real/<id>.json,
// its index entry, and the walls it puts in front of stands in its dressing file (tracks/real/dress/<id>.json: the
// build merges that in).
//   node --import ./tools/tracks/three-hook.mjs tools/tracks/standsbehind.mjs [ids|all] [--write]
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { standsBehind } = await import(join(ROOT, 'js/standsbehind.js'));
const args = process.argv.slice(2), WRITE = args.includes('--write');
const xf = join(ROOT, 'tracks/real/index.json'), index = JSON.parse(readFileSync(xf, 'utf8'));
const pick = args.filter(a => !a.startsWith('--')), ids = !pick.length || pick[0] === 'all' ? index.filter(e => e.real).map(e => e.real.id) : pick.flatMap(a => a.split(','));
let indexChanged = false;
for (const id of ids) {
  const file = join(ROOT, 'tracks/real', id + '.json'), t = JSON.parse(readFileSync(file, 'utf8'));
  if (!(t.props || []).some(p => /^tp_stand_/.test(p.type))) { console.log(`${id.padEnd(12)} no stands`); continue; }
  const r = standsBehind(t);
  console.log(`${id.padEnd(12)} ${r.lines} lines: ${r.moved} moved back behind the barrier (the furthest ${r.worst.toFixed(1)} m), ${r.walled} with a wall put in front of them`);
  if (!WRITE) continue;
  writeFileSync(file, JSON.stringify(t));
  const df = join(ROOT, 'tracks/real/dress', id + '.json'), walls = ((t.dress && t.dress.walls) || []).filter(w => w.why === 'grandstand');
  if (walls.length || existsSync(df)) {
    const d = existsSync(df) ? JSON.parse(readFileSync(df, 'utf8')) : { kerbs: [], walls: [] };
    d.walls = [...(d.walls || []).filter(w => w.why !== 'grandstand'), ...walls]; writeFileSync(df, JSON.stringify(d));
  }
  const k = index.findIndex(e => e.real && e.real.id === id); if (k >= 0) { index[k].props = t.props; if (t.propLines) index[k].propLines = t.propLines; if (t.landmarks) index[k].landmarks = t.landmarks; indexChanged = true; }
}
if (indexChanged) writeFileSync(xf, JSON.stringify(index));
if (!WRITE) console.log('(a dry run: --write saves it)');
