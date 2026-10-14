// Make an editor export the official version of a real circuit:
//   node tools/tracks/official.mjs ~/Downloads/Lime_Rock_Park.svgp.json
// It finds the circuit by the export's real.id, keeps what you changed in the editor (dressing, props, scenery
// settings, paint...) as tracks/real/edits/<id>.json, puts it into tracks/real/<id>.json and the index straight away,
// and build.mjs lays it over every rebuild (the road, heights and OSM surroundings still come from the build).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tracks/real');
const src = process.argv[2];
if (!src) { console.error('usage: node tools/tracks/official.mjs <export.svgp.json>'); process.exit(1); }

const ex = JSON.parse(fs.readFileSync(src, 'utf8'));
const id = ex.real && ex.real.id;
if (!id || !/^[a-z0-9_-]+$/.test(id)) { console.error('not a real circuit export (no real.id)'); process.exit(1); }
const f = path.join(OUT, id + '.json');
if (!fs.existsSync(f)) { console.error(`no tracks/real/${id}.json: build it first (node tools/tracks/build.mjs ${id})`); process.exit(1); }
const track = JSON.parse(fs.readFileSync(f, 'utf8'));

// what the editor changed: every key that differs from the built circuit (not its file name or the builder's data)
const SKIP = new Set(['file', 'version', 'osm', 'terrain', 'real', 'geo']);
const ef = path.join(OUT, 'edits', id + '.json');
const old = fs.existsSync(ef) ? JSON.parse(fs.readFileSync(ef, 'utf8')) : {};
const edits = { ...old };
for (const k of Object.keys(ex)) {
  if (SKIP.has(k)) continue;
  const empty = Array.isArray(ex[k]) && !ex[k].length && !(k in track);
  if (!empty && JSON.stringify(ex[k]) !== JSON.stringify(track[k])) edits[k] = ex[k];
}
for (const k of ['osm', 'terrain']) if (JSON.stringify(ex[k]) !== JSON.stringify(track[k])) console.log(`  note: the export's ${k} differs from the build; the build's is kept`);
if (edits.points) console.log('  note: you moved the road: your points are kept (heights come with them from the export)');

fs.mkdirSync(path.dirname(ef), { recursive: true });
fs.writeFileSync(ef, JSON.stringify(edits, null, 1));
Object.assign(track, edits);
fs.writeFileSync(f, JSON.stringify(track));

// the index the game reads (light: no terrain / scenery)
const xf = path.join(OUT, 'index.json'), index = JSON.parse(fs.readFileSync(xf, 'utf8'));
const { osm, terrain, dress, ...light } = track;
const i = index.findIndex(e => e.real && e.real.id === id);
if (i >= 0) index[i] = { ...light, file: id + '.json' }; else index.push({ ...light, file: id + '.json' });
fs.writeFileSync(xf, JSON.stringify(index));
console.log(`${track.name}: official now (${Object.keys(edits).join(', ')}) -> tracks/real/${id}.json, kept in tracks/real/edits/${id}.json`);
