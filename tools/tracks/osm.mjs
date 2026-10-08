// OpenStreetMap access for the real-circuit importer: Overpass queries (cached on disk), a road graph,
// and routing along it so a circuit's exact layout can be picked out of all the roads / layouts mapped there.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, 'cache');
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

export async function overpass(query, { label = '' } = {}) {
  fs.mkdirSync(CACHE, { recursive: true });
  const key = crypto.createHash('sha1').update(query).digest('hex').slice(0, 16);
  const file = path.join(CACHE, key + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  let lastErr;
  for (let round = 0; round < 2; round++) for (const url of ENDPOINTS) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 150000);
    try {
      process.stderr.write(`  overpass ${label} @ ${new URL(url).host}… `);
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), signal: ctl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SanVelocitaGP-track-importer/1.0' } });
      const txt = await r.text();
      if (!r.ok || txt[0] !== '{') throw new Error('HTTP ' + r.status + ' ' + txt.slice(0, 80).replace(/\s+/g, ' '));
      const j = JSON.parse(txt);
      if (j.remark && /runtime error|timed out/i.test(j.remark)) throw new Error(j.remark.slice(0, 120));
      fs.writeFileSync(file, txt);
      process.stderr.write(`ok (${j.elements.length})\n`);
      return j;
    } catch (e) { lastErr = e; process.stderr.write(`failed: ${e.message}\n`); }
    finally { clearTimeout(timer); }
  }
  throw lastErr;
}

// ---------- geometry ----------
const M_LAT = 110574;
const mLon = (lat) => 111320 * Math.cos(lat * Math.PI / 180);
export const toLocal = (geo, lat, lon) => [(lon - geo.lon) * mLon(geo.lat), -(lat - geo.lat) * M_LAT];
export const dist = (a, b) => Math.hypot((b.lon - a.lon) * mLon(a.lat), (b.lat - a.lat) * M_LAT);

// ---------- road graph ----------
// ways: Overpass elements with `nodes` + `geometry` (out body geom). skip(tags) drops ways (pit lanes etc.)
export function buildGraph(ways, skip = () => false) {
  const nodes = new Map(); // id -> { lat, lon, edges: [{ to, w, way }] }
  for (const w of ways) {
    if (w.type !== 'way' || !w.nodes || !w.geometry || skip(w.tags || {}, w)) continue;
    const oneway = 0; // (race day: the roads are closed, so one-way streets run either way)
    for (let i = 0; i < w.nodes.length; i++) {
      const id = w.nodes[i], g = w.geometry[i];
      if (!nodes.has(id)) nodes.set(id, { id, lat: g.lat, lon: g.lon, edges: [] });
    }
    for (let i = 1; i < w.nodes.length; i++) {
      // long straight segments get extra points every ~20 m so waypoints can snap anywhere along them
      const A = nodes.get(w.nodes[i - 1]), B = nodes.get(w.nodes[i]), k = Math.max(1, Math.ceil(dist(A, B) / 20));
      let a = A;
      for (let j = 1; j <= k; j++) {
        let b = B;
        if (j < k) { const id = `${w.id}:${i}:${j}`; b = { id, lat: A.lat + (B.lat - A.lat) * j / k, lon: A.lon + (B.lon - A.lon) * j / k, edges: [] }; nodes.set(id, b); }
        const d = dist(a, b);
        a.edges.push({ to: b.id, w: d, way: w });
        if (!oneway) b.edges.push({ to: a.id, w: d, way: w });
        a = b;
      }
    }
  }
  return nodes;
}

export function nearestNode(nodes, lat, lon) {
  let best = null, bd = Infinity;
  for (const n of nodes.values()) { const d = dist(n, { lat, lon }); if (d < bd) { bd = d; best = n; } }
  return { node: best, d: bd };
}

// shortest path a -> b; `avoid` = set of "u>v" edge keys already used (so a loop doesn't run back down the same road)
function dijkstra(nodes, a, b, avoid) {
  const D = new Map([[a, 0]]), prev = new Map(), done = new Set();
  const heap = [[0, a]];
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop();
    if (done.has(u)) continue; done.add(u);
    if (u === b) break;
    for (const e of nodes.get(u).edges) {
      const pen = avoid.has(u + '>' + e.to) || avoid.has(e.to + '>' + u) ? 50 : 1;
      const nd = d + e.w * pen;
      if (nd < (D.get(e.to) ?? Infinity)) { D.set(e.to, nd); prev.set(e.to, [u, e.way]); push([nd, e.to]); }
    }
  }
  if (!D.has(b)) return null;
  const path = [];
  for (let v = b; v !== a; v = prev.get(v)[0]) path.push([v, prev.get(v)[1]]);
  return path.reverse(); // [[nodeId, wayItCameAlong], ...] (excludes a)
}

// Route through waypoints ([lat, lon] list). loop: back to the first one at the end.
// Returns [{ lat, lon, way }] with the way each point was reached along (tags: layer / bridge / name ...).
export function route(nodes, waypoints, { loop = true, maxSnap = 60 } = {}) {
  const snap = waypoints.map(([lat, lon], k) => {
    const s = nearestNode(nodes, lat, lon);
    if (s.d > maxSnap) throw new Error(`waypoint ${k} (${lat}, ${lon}) is ${s.d.toFixed(0)} m from any road`);
    return s.node.id;
  });
  const seq = loop ? [...snap, snap[0]] : snap;
  const out = [{ ...pt(nodes.get(seq[0])), way: null }], used = new Set();
  for (let k = 1; k < seq.length; k++) {
    if (seq[k] === seq[k - 1]) continue;
    const p = dijkstra(nodes, seq[k - 1], seq[k], used);
    if (!p) throw new Error(`no road from waypoint ${k - 1} to ${k}`);
    let u = seq[k - 1];
    for (const [v, way] of p) { used.add(u + '>' + v); out.push({ ...pt(nodes.get(v)), way }); u = v; }
  }
  if (loop) { out[0].way = out[out.length - 1].way; out.pop(); }
  return out;
}
const pt = (n) => ({ lat: n.lat, lon: n.lon, id: n.id });
