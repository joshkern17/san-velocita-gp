// Real-world circuits (built by tools/tracks/build.mjs from OpenStreetMap + real elevation).
// tracks/real/index.json lists them light (nodes, env, names: enough for menus, maps and online lobbies);
// the heavy part of each (terrain grid + imported buildings / trees) loads when you race or preview it.
// Single-file build: everything arrives in window.__SVGP_REAL = { index, files: { 'spa.json': {...} } }.
const embedded = () => (typeof window !== 'undefined' && window.__SVGP_REAL) || null;

let list = [];
const loaded = (async () => {
  try {
    const E = embedded();
    list = E ? E.index : await fetch('tracks/real/index.json').then(r => (r.ok ? r.json() : []));
  } catch (e) { list = []; }
  // (dev, parked: reference builds made locally from a reference model, tools/tracks/build.mjs --ref; only with ?ref in the URL, never in a release)
  if (!embedded() && /[?&]ref\b/.test(location.search)) try { const dev = await fetch('tools/tracks/cache/ref/list.json').then(r => (r.ok ? r.json() : [])); list = [...list, ...dev]; } catch (e) {}
  return list;
})();

export const realTracksReady = () => loaded;
// the circuits (light). Empty until the index has loaded (a fraction of a second after boot).
export const realTracks = () => list;
export const isReal = (t) => !!(t && t.real && t.real.id);
// true when a real circuit still needs its terrain + scenery before it can be built
// (the light copies have no terrain / osm keys at all; a copy whose terrain was removed in the editor has them as null)
export const needsHydrate = (t) => isReal(t) && !('terrain' in t) && !('osm' in t);

const fileOf = (t) => { const e = list.find(x => x.real && x.real.id === t.real.id); return e ? e.file : t.real.id + '.json'; };
const cache = new Map();
function full(file) {
  if (!cache.has(file)) {
    const E = embedded();
    const dev = list.find(x => x.file === file && x.path);
    cache.set(file, E ? Promise.resolve(E.files[file]) : fetch(dev ? dev.path : 'tracks/real/' + file).then(r => { if (!r.ok) throw new Error('Missing circuit data: ' + file); return r.json(); }));
  }
  return cache.get(file);
}
// fill in terrain + scenery (in place)
export async function hydrateReal(t) {
  if (!needsHydrate(t)) return t;
  const f = await full(fileOf(t));
  if (!f) return t;
  t.terrain = f.terrain || null;
  t.osm = f.osm || null;
  if (f.refModel) t.refModel = f.refModel;
  if (f.dress) t.dress = f.dress; // (its curbs and barriers as the real one has them: the Track Studio's)
  return t;
}

// The real name of the bit of track at distance d (m from the start line) — "Eau Rouge", "The Corkscrew" — or ''.
export function placeName(track, d) {
  const names = track && track.real && track.real.names; if (!names) return '';
  for (const s of names) if (d >= s.from - 15 && d <= s.to + 15) return s.name;
  return '';
}
// give the Lap Review's corners their real names (by the apex)
export function nameCorners(track, T, corners) {
  if (!track || !track.real || !corners) return corners;
  for (const c of corners) { const i = c.apex ?? c.entry ?? c.from; if (i != null) c.name = placeName(track, i * T.ds); }
  return corners;
}
