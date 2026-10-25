// The map's grandstands (and pit building, amphitheatres, any name you match) round a built circuit, from the
// Overpass cache the build left in tools/tracks/cache: each outline's track-side edge (the kit stand's front line),
// its length, depth, distance from the road and lap metres. The start of a <id>-kit.json.
//   node --import ./tools/tracks/three-hook.mjs .claude/skills/real-track/scripts/stands.mjs <id> [--match=regex on name] [--json=out.json] [--kit]
//   --json: the outlines (for map.mjs --stands); --kit: print a draft kit json (size by length: S < 60 m < M < 150 m < L)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { sampleTrack } = await import(path.join(ROOT, 'js/track.js'));
const args = process.argv.slice(2), opt = (k) => { const a = args.find(a => a.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const id = args.find(a => !a.startsWith('--')), RX = new RegExp(opt('match') || 'grandstand|tribune|amphi|pit garage|pit building', 'i');
const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'tracks/real', id + '.json'), 'utf8')), T = sampleTrack(t), geo = t.geo;
const mLon = 111320 * Math.cos(geo.lat * Math.PI / 180), loc = (q) => [+((q.lon - geo.lon) * mLon).toFixed(1), +(-(q.lat - geo.lat) * 110574).toFixed(1)];
let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity; for (let i = 0; i < T.N; i++) { bx0 = Math.min(bx0, T.X[i]); bx1 = Math.max(bx1, T.X[i]); bz0 = Math.min(bz0, T.Z[i]); bz1 = Math.max(bz1, T.Z[i]); }
const out = [], seen = new Set(), CACHE = path.join(ROOT, 'tools/tracks/cache');
for (const f of fs.readdirSync(CACHE).filter(f => f.endsWith('.json'))) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8')); } catch (e) { continue; }
  for (const e of j.elements || []) {
    const tg = e.tags || {}; if (!e.geometry || seen.has(e.id)) continue;
    if (!(tg.building === 'grandstand' || tg.leisure === 'stadium' && tg.building || RX.test(tg.name || ''))) continue;
    const p = e.geometry.map(loc); if (!p.some(([x, z]) => x > bx0 - 300 && x < bx1 + 300 && z > bz0 - 300 && z < bz1 + 300)) continue;
    seen.add(e.id); out.push({ n: tg.name || tg.building, p });
  }
}
const near = (x, z) => { let b = 1e9, bi = 0; for (let i = 0; i < T.N; i += 2) { const d = Math.hypot(x - T.X[i], z - T.Z[i]); if (d < b) { b = d; bi = i; } } return [b - T.W[bi] / 2, bi]; };
const kit = { stands: [], clear: [] };
out.forEach((o, k) => {
  const P = o.p[0][0] === o.p[o.p.length - 1][0] && o.p[0][1] === o.p[o.p.length - 1][1] ? o.p.slice(0, -1) : o.p;
  const E = P.map((a, i) => { const b = P[(i + 1) % P.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return { a, b, l: Math.hypot(b[0] - a[0], b[1] - a[1]), d: near(...m) }; });
  const front = E.filter(e => e.l > 0.5 * Math.max(...E.map(e => e.l))).sort((x, y) => x.d[0] - y.d[0])[0]; // (the long edge nearest the road)
  const ux = (front.b[0] - front.a[0]) / front.l, uz = (front.b[1] - front.a[1]) / front.l;
  const depth = Math.max(...P.map(p => Math.abs((p[0] - front.a[0]) * -uz + (p[1] - front.a[1]) * ux)));
  console.log(String(k).padStart(2), o.n.slice(0, 22).padEnd(22), 'front', JSON.stringify([front.a, front.b]), `len ${front.l.toFixed(0)} depth ${depth.toFixed(0)} road ${front.d[0].toFixed(0)} m off, at ${Math.round(front.d[1] * T.ds)} m`);
  if (/grandstand|tribune/i.test(o.n)) kit.stands.push({ name: `Stand at ${Math.round(front.d[1] * T.ds)} m`, cls: front.l < 60 ? 'gs_S' : front.l < 150 ? 'gs_M' : 'gs_L', pts: [front.a, front.b] });
  kit.clear.push({ name: o.n, p: P });
});
if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(out));
if (args.includes('--kit')) console.log(`{ "replace": true,\n  "stands": [\n    ${kit.stands.map(q => JSON.stringify(q)).join(',\n    ')}\n  ],\n  "clear": [\n    ${kit.clear.map(q => JSON.stringify(q)).join(',\n    ')}\n  ] }`);
