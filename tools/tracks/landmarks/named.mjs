// A real circuit's named places from the map (OSM, as the track build downloaded it: tools/tracks/cache), in the
// circuit's own frame: each one's outline, middle, and the oriented box round it (hw, hd, rot: what a landmark
// script builds to). For laying out a circuit's landmarks where the real ones are.
//   node tools/tracks/landmarks/named.mjs <id> [name filter, regex] [--json]
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const [id, filt = '.'] = process.argv.slice(2).filter(a => !a.startsWith('--')), JSONOUT = process.argv.includes('--json');
const index = JSON.parse(readFileSync(join(ROOT, 'tracks/real/index.json'), 'utf8'));
const t = index.find(e => e.real && e.real.id === id); if (!t) throw new Error('no circuit ' + id);
const geo = t.geo || t.real.geo, mLon = 111320 * Math.cos(geo.lat * Math.PI / 180), M_LAT = 110574;
const loc = (p) => [+((p.lon - geo.lon) * mLon).toFixed(1), +(-(p.lat - geo.lat) * M_LAT).toFixed(1)];
const re = new RegExp(filt, 'i'), seen = new Map();
const near = (g) => Math.abs(g.lat - geo.lat) < 0.03 && Math.abs(g.lon - geo.lon) < 0.05;
for (const f of readdirSync(join(ROOT, 'tools/tracks/cache')).filter(f => f.endsWith('.json'))) {
  let j; try { j = JSON.parse(readFileSync(join(ROOT, 'tools/tracks/cache', f), 'utf8')); } catch (e) { continue; }
  for (const e of j.elements || []) {
    const tg = e.tags || {}; if (!tg.name || !re.test(tg.name) || !e.geometry || e.geometry.length < 3 || !near(e.geometry[0])) continue;
    const kind = tg.building || tg.amenity || tg.tourism || tg.leisure || tg.man_made || tg.landuse || '';
    const key = tg.name + '|' + kind; if (seen.has(key)) continue;
    const P = e.geometry.map(loc);
    // the oriented box: the outline's longest edge sets the turn
    let best = 0, rot = 0;
    for (let k = 0; k + 1 < P.length; k++) { const dx = P[k + 1][0] - P[k][0], dz = P[k + 1][1] - P[k][1], l = Math.hypot(dx, dz); if (l > best) { best = l; rot = Math.atan2(dz, dx); } }
    const c = Math.cos(rot), s = Math.sin(rot);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of P) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    seen.set(key, { name: tg.name, kind, levels: tg['building:levels'] || null, height: tg.height || null, x: +(um * c - vm * s).toFixed(1), z: +(um * s + vm * c).toFixed(1), hw: +((u1 - u0) / 2).toFixed(1), hd: +((v1 - v0) / 2).toFixed(1), rot: +rot.toFixed(4), outline: P });
  }
}
const out = [...seen.values()];
if (JSONOUT) console.log(JSON.stringify(out));
else for (const o of out) console.log(`${o.name.padEnd(30)} ${o.kind.padEnd(12)} at ${o.x}, ${o.z}  ${(o.hw * 2).toFixed(0)} x ${(o.hd * 2).toFixed(0)} m  turned ${(o.rot * 180 / Math.PI).toFixed(0)}°${o.levels ? `  ${o.levels} levels` : ''}${o.height ? `  ${o.height} m` : ''}`);
