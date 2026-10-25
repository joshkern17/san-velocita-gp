// Street details from OpenStreetMap, for the street kit (js/streetkit.js): signs, signals, crosswalks, gates, power
// poles and lines, rail lines, waterways, driveways, and road barriers (guard rails, jersey barriers, walls, fences,
// hedges, bollards), as the track keeps them (track.osm.street). Fetched with the
// rest of the map import (geo.js importOSM, opts.street), or on its own for a track imported before.
//
//   STREET_QUERY(bb)            Overpass clauses for them
//   streetFeatures(els, geo)    Overpass elements (out geom) -> { stop, yield, signals, crossings, gates, poles, towers,
//                               bollards, power: [{ k, pts, v }], rail: [{ pts }], water: [{ k, w, pts }], drives: [{ pts }],
//                               barriers: [{ k (guard_rail | jersey_barrier | wall | retaining_wall | fence | hedge), pts, h, m }],
//                               places: [[x, z, 'shop:supermarket' | 'amenity:fuel' ..., name?]] }
//   streetCounts(street)        how many of each (for the editor)
// A point is [x, z] (metres, local), and where the map's way through it says which way it runs, [x, z, dx, dz]: the
// direction of the road / line there (a gate across its driveway, a pole's crossarm across its line, a crosswalk across
// its street).
import { toLocal } from './geo.js';

export const STREET_QUERY = (bb) =>
  `node["highway"~"^(stop|give_way|traffic_signals|crossing)$"](${bb});` +
  `node["barrier"~"^(gate|swing_gate|lift_gate)$"](${bb});` +
  `node["railway"~"^(level_crossing|crossing)$"](${bb});` +
  `way["power"~"^(line|minor_line)$"](${bb});node["power"~"^(pole|tower)$"](${bb});` +
  `way["railway"~"^(rail|light_rail)$"](${bb});` +
  `way["waterway"~"^(river|stream|canal|ditch|drain)$"](${bb});` +
  `way["highway"="service"](${bb});` +
  `way["barrier"~"^(guard_rail|jersey_barrier|wall|retaining_wall|fence|hedge)$"](${bb});node["barrier"="bollard"](${bb});` +
  `nwr["shop"](${bb});nwr["amenity"~"^(${PLACE_AMENITY})$"](${bb});`;

// the places a building can be (what a shop or amenity point inside it, or a shop / amenity tagged on it, says)
const PLACE_AMENITY = 'fuel|place_of_worship|school|post_office|restaurant|fast_food|bank|fire_station|pharmacy|cafe|library|police|townhall|community_centre|bar|car_wash|kindergarten|clinic|doctors|dentist|theatre|cinema';
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
// how wide a waterway is (m): its own width tag, else what that kind usually is round here
const WATER_W = { river: 14, canal: 6, stream: 2.5, ditch: 1.5, drain: 1.5 };
const num = (v) => { const m = v != null && String(v).match(/[\d.]+/); return m ? parseFloat(m[0]) : NaN; };

export function streetFeatures(els, geo) {
  const nodes = new Map(); // id -> { x, z, tags }
  for (const el of els) if (el.type === 'node' && el.tags) { const [x, z] = toLocal(geo, el.lat, el.lon); nodes.set(el.id, { x: r1(x), z: r1(z), tags: el.tags }); }
  // which way each tagged node lies on, and that way's direction there
  const dir = new Map(), onWay = new Map();
  const out = { stop: [], yield: [], signals: [], crossings: [], gates: [], poles: [], towers: [], railx: [], bollards: [], power: [], rail: [], water: [], drives: [], barriers: [], places: [] };
  // places: [x, z, kind, name] (kind: the shop's or amenity's own value, 'shop:supermarket', 'amenity:fuel'...)
  const placeOf = (t) => t.shop ? 'shop:' + t.shop : t.amenity && new RegExp('^(' + PLACE_AMENITY + ')$').test(t.amenity) ? 'amenity:' + t.amenity : null;
  for (const el of els) {
    const t = el.tags || {}, k = placeOf(t); if (!k) continue;
    let x, z;
    if (el.type === 'node') [x, z] = toLocal(geo, el.lat, el.lon);
    else if (el.geometry && el.geometry.length) { let a = 0, b = 0; for (const g of el.geometry) { a += g.lat; b += g.lon; } [x, z] = toLocal(geo, a / el.geometry.length, b / el.geometry.length); }
    else if (el.center) [x, z] = toLocal(geo, el.center.lat, el.center.lon);
    else continue;
    out.places.push(t.name ? [r1(x), r1(z), k, String(t.name).slice(0, 40)] : [r1(x), r1(z), k]);
  }
  for (const el of els) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const t = el.tags || {}, pts = el.geometry.map(g => { const [x, z] = toLocal(geo, g.lat, g.lon); return [r1(x), r1(z)]; });
    (el.nodes || []).forEach((id, i) => {
      const n = nodes.get(id); if (!n) return;
      // (a pole takes its power line's direction, anything else its road's, over whatever way came first)
      const mine = n.tags.power ? !!t.power : n.tags.railway === 'level_crossing' ? !!t.railway : !!t.highway;
      if (dir.has(id) && (!mine || onWay.get(id).mine)) return;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      dir.set(id, [r2((b[0] - a[0]) / l), r2((b[1] - a[1]) / l)]); onWay.set(id, { mine });
    });
    if (t.power === 'line' || t.power === 'minor_line') out.power.push({ k: t.power === 'line' ? 'line' : 'minor', pts, v: t.voltage ? +String(t.voltage).split(';')[0] || 0 : 0 });
    else if (t.railway === 'rail' || t.railway === 'light_rail') { if (t.tunnel !== 'yes') out.rail.push({ pts, bridge: t.bridge === 'yes' ? 1 : 0 }); }
    else if (t.waterway && WATER_W[t.waterway]) { if (t.tunnel !== 'yes' && t.tunnel !== 'culvert') out.water.push({ k: t.waterway, w: num(t.width) > 0 ? Math.min(60, num(t.width)) : WATER_W[t.waterway], pts }); }
    else if (t.highway === 'service' && (t.service === 'driveway' || !t.service) && t.area !== 'yes') out.drives.push({ pts, name: t.name || undefined });
    else if (t.barrier) out.barriers.push({ k: t.barrier, pts, h: num(t.height) > 0 ? Math.min(6, num(t.height)) : undefined, m: t.material || t.fence_type || undefined });
  }
  for (const [id, n] of nodes) {
    const t = n.tags, d = dir.get(id), p = d ? [n.x, n.z, d[0], d[1]] : [n.x, n.z];
    if (t.highway === 'stop') out.stop.push(t.direction ? [...p, t.direction] : p);
    else if (t.highway === 'give_way') out.yield.push(p);
    else if (t.highway === 'traffic_signals') out.signals.push(p);
    else if (t.highway === 'crossing' || t.railway === 'crossing') { if (t.crossing !== 'unmarked' && t.crossing !== 'no') out.crossings.push(p); }
    else if (t.railway === 'level_crossing') out.railx.push(p);
    else if (t.barrier === 'bollard') out.bollards.push(p);
    else if (t.barrier) out.gates.push(p);
    else if (t.power === 'pole') out.poles.push(p);
    else if (t.power === 'tower') out.towers.push(p);
  }
  return out;
}

export const streetCounts = (s) => s ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length])) : null;
