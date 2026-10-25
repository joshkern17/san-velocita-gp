// What a real building is for, from the map: a shop or amenity point inside its outline (track.osm.street.places,
// streetdata.js), or the tag on the building itself (geo.js keeps it as b.u). Its kind decides what it's built as
// (js/housebuild.js buildShops, the street kit's pieces for the places that have their own look).
//
//   placeKind(tag)                 'shop:supermarket' / 'amenity:fuel' / a building's own u ... -> a kind:
//                                  supermarket | fuel | fastfood | strip (a shopfront: a restaurant, a salon, a phone
//                                  shop...) | bank | church | school | postoffice | autoshop | civic | null
//   assignPlaces(buildings, places)   sets b.place (the kind) and b.pname (its name) on each building a place is in
import { pointInPoly, centroid } from './zones.js';

const KIND = {
  supermarket: /^(shop:)?(supermarket|department_store|doityourself|hardware|wholesale|garden_centre|furniture)$/,
  fuel: /^(amenity:)?(fuel)$/,
  fastfood: /^(amenity:)?(fast_food)$/,
  bank: /^(amenity:)?(bank)$/,
  church: /^(amenity:)?(place_of_worship)$|^(church|chapel|cathedral|temple|mosque|synagogue)$/,
  school: /^(amenity:)?(school|kindergarten)$|^(school|kindergarten)$/,
  postoffice: /^(amenity:)?(post_office)$/,
  autoshop: /^(shop:)?(car_repair|car|tyres|car_parts|motorcycle)$|^amenity:car_wash$/,
  civic: /^(amenity:)?(fire_station|police|townhall|library|community_centre)$|^(civic|public|government|fire_station)$/,
};
export function placeKind(tag) {
  if (!tag) return null;
  for (const [k, re] of Object.entries(KIND)) if (re.test(tag)) return k;
  if (/^shop:|^amenity:(restaurant|cafe|bar|pharmacy|clinic|doctors|dentist|theatre|cinema)$|^(retail|commercial|shop)$/.test(tag)) return 'strip';
  return null;
}

export function assignPlaces(buildings, places = []) {
  const CELL = 30, grid = new Map();
  buildings.forEach((b, i) => { if (!b.p || b.p.length < 3) return; const [cx, cz] = centroid(b.p); const k = Math.floor(cx / CELL) + ',' + Math.floor(cz / CELL); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  for (const b of buildings) { const k = placeKind(b.u); if (k) b.place = k; } // (the building's own tag first)
  for (const q of places || []) {
    const kind = placeKind(q[2]); if (!kind) continue;
    let hit = null, near = null, nd = 15;
    const ci = Math.floor(q[0] / CELL), cj = Math.floor(q[1] / CELL);
    for (let a = -2; a <= 2 && !hit; a++) for (let c = -2; c <= 2 && !hit; c++) for (const i of grid.get((ci + a) + ',' + (cj + c)) || []) {
      const b = buildings[i]; if (pointInPoly(q[0], q[1], b.p)) { hit = b; break; }
      let d = Infinity; for (const p of b.p) d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1])); if (d < nd) { nd = d; near = b; }
    }
    const b = hit || near; if (!b) continue;
    // (a strip mall with a supermarket in it is a supermarket; a gas station's shop is the gas station)
    const rank = { fuel: 9, supermarket: 8, church: 7, school: 7, fastfood: 6, bank: 5, postoffice: 5, autoshop: 4, civic: 4, strip: 1 };
    if (!b.place || (rank[kind] || 0) > (rank[b.place] || 0)) { b.place = kind; if (q[3]) b.pname = q[3]; }
    if (q[3]) (b.pnames ||= []).includes(q[3]) || b.pnames.push(q[3]); // (every tenant's name: a strip mall's signs)
  }
}
