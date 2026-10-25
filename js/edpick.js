// Circuit Designer: PICK ROADS (Location mode, K). Turn real streets into the track by clicking them: the streets in
// view come from OpenStreetMap, each click snaps to the nearest one, and the track follows the roads from click to
// click (js/roadpick.js). Click the first point again to close a loop; Make The Track turns the route into the track
// (a loop is a circuit, an open route a point-to-point). The route is kept with the track (track.pick) so it can be
// picked up again and changed later.
//   click a street: the next point;  click the route: a point there (drag it);  drag a point: re-route through it
//   Backspace: back a step (the loop open again, else the last point);  DEL: the point under the mouse;  Enter: make the track
import { importOSM } from './geo.js';
import { roadGraph, snapRoad, routeRoads, routeAll, routeLine, routeOverlaps, lineClashes, pickTrackPoints } from './roadpick.js';
import { sampleTrack } from './track.js';
import { projectOntoTrack, inGrid } from './terrain.js';
import { lidarCovers } from './lidar.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const MAX_AREA = 3000; // (m: the widest view whose streets are downloaded in one go)
const SNAP_PX = 28, HIT_PX = 10;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function installPickTool(Ed) {
  const P = Ed.prototype;

  // the tool's state: the streets downloaded (ways by id, the network, the area they cover), the clicks, the legs
  P.pk = function () {
    return this._pk ||= { ways: new Map(), G: null, boxes: [], clicks: [], legs: [], closed: false, hover: null, preview: null, line: null, status: '', loading: false };
  };
  P.pickEnter = function () {
    const t = this.track, k = this.pk();
    if (!t.geo) { this.toast('SET A LOCATION FIRST · SEARCH YOUR TOWN ON THE RIGHT'); return; }
    if (!this.pickCovered()) this.pickLoad();
    else if (!k.clicks.length && t.pick) this.pickRestore();
  };
  // is the view inside the streets already downloaded?
  P.pickCovered = function () {
    const k = this.pk(), [x0, z0] = this.s2w(0, 0), [x1, z1] = this.s2w(this.W, this.H);
    return k.boxes.some(b => x0 >= b[0] && z0 >= b[1] && x1 <= b[2] && z1 <= b[3]);
  };
  // (after a pan or zoom: the streets of the new view, once it's settled, if they aren't here yet)
  P.pickViewMoved = function () {
    clearTimeout(this._pkT);
    this._pkT = setTimeout(() => { if (this.tool !== 'pick' || !this.track.geo) return; if (!this.pickCovered()) this.pickLoad(); else this.renderPickTab(); }, 700);
  };
  P.pickLoad = async function () {
    const t = this.track, k = this.pk();
    if (!t.geo || k.loading) return;
    let [x0, z0] = this.s2w(0, 0), [x1, z1] = this.s2w(this.W, this.H);
    if (x1 - x0 > MAX_AREA || z1 - z0 > MAX_AREA) { k.status = 'Zoom in to your streets to load them (the view is too big to download in one go).'; this.renderPickTab(); return; }
    const mx = (x1 - x0) * 0.25, mz = (z1 - z0) * 0.25; x0 -= mx; x1 += mx; z0 -= mz; z1 += mz; // (a margin round the view)
    k.loading = true; k.status = 'Downloading the streets…'; this.renderPickTab();
    try {
      const res = await importOSM(t.geo, [x0, z0, x1, z1], { roads: true }, (msg) => { k.status = msg.replace('map data', 'the streets'); const s = $('pk-status'); if (s) s.textContent = k.status; });
      for (const w of res.ways || []) k.ways.set(w.id, w);
      k.boxes.push([x0, z0, x1, z1]);
      k.G = roadGraph([...k.ways.values()]);
      k.status = '';
      sfx.select();
      // (the clicks snap again onto the new network: their edges are numbered afresh)
      if (k.clicks.length) { k.clicks = k.clicks.map(c => snapRoad(k.G, c.x, c.z, 15) || c); this.pickRoute(); }
      else if (t.pick) this.pickRestore();
    } catch (e) { k.status = e.message; }
    k.loading = false;
    this.renderPickTab(); this.dirty = true;
  };
  // the route kept with the track, back as clicks
  P.pickRestore = function () {
    const t = this.track, k = this.pk(); if (!k.G || !t.pick) return;
    k.clicks = t.pick.clicks.map(([x, z]) => snapRoad(k.G, x, z, 15)).filter(Boolean);
    k.closed = !!t.pick.closed && k.clicks.length > 2;
    this.pickRoute();
  };
  // every leg again (changed: the clicks that moved: the other legs stay as they are)
  P.pickRoute = function (changed = null) {
    const k = this.pk();
    if (k.clicks.length < 2 || !k.G) { k.legs = []; k.line = null; this.pickChanged(); return; }
    k.legs = routeAll(k.G, k.clicks, k.closed, changed ? k.legs : null, changed);
    this.pickChanged();
  };
  P.pickChanged = function () {
    const k = this.pk();
    k.line = null; k.problems = null;
    if (k.legs.length && k.legs.every(Boolean)) {
      const r = routeLine(k.G, k.legs, k.closed);
      let len = 0; for (let i = 1; i < r.pts.length; i++) len += Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].z - r.pts[i - 1].z);
      k.line = { ...r, len, overlaps: routeOverlaps(k.G, k.legs), clash: lineClashes(r.pts, k.closed) };
    }
    this.renderPickTab(); this.dirty = true;
  };

  // ---------------- mouse ----------------
  P.pickSnap = function (sx, sy) { const k = this.pk(); if (!k.G) return null; const [wx, wz] = this.s2w(sx, sy); return snapRoad(k.G, wx, wz, SNAP_PX / this.view.scale); };
  P.pickHitClick = function (sx, sy) {
    const k = this.pk(); let best = -1, bd = HIT_PX;
    k.clicks.forEach((c, i) => { const [x, y] = this.w2s(c.x, c.z), d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  // which leg the route passes under the mouse (-1: none)
  P.pickHitLeg = function (sx, sy) {
    const k = this.pk(); let best = -1, bd = HIT_PX;
    k.legs.forEach((L, i) => {
      if (!L) return;
      for (let j = 1; j < L.pts.length; j++) {
        const [ax, ay] = this.w2s(L.pts[j - 1].x, L.pts[j - 1].z), [bx, by] = this.w2s(L.pts[j].x, L.pts[j].z), dx = bx - ax, dy = by - ay;
        const u = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(ax + dx * u - sx, ay + dy * u - sy);
        if (d < bd) { bd = d; best = i; }
      }
    });
    return best;
  };
  P.pickDown = function (sx, sy) {
    const k = this.pk();
    if (!k.G) { if (!k.loading) this.pickLoad(); return; }
    const hc = this.pickHitClick(sx, sy);
    // the first point again: the loop closes
    if (hc === 0 && !k.closed && k.clicks.length > 2) { k.closed = true; k.preview = null; sfx.place(); this.pickRoute(); this.toast('LOOP CLOSED · MAKE THE TRACK ON THE RIGHT'); return; }
    if (hc >= 0) { this.drag = { type: 'pickpt', i: hc, moved: false }; sfx.move(); return; }
    const s = this.pickSnap(sx, sy);
    if (!s) { sfx.error(); this.toast('NO STREET HERE · CLICK ON A ROAD'); return; }
    const hl = this.pickHitLeg(sx, sy);
    if (hl >= 0) { // (on the route: a new point in that leg, to drag where the route should go)
      k.clicks.splice(hl + 1, 0, s);
      this.drag = { type: 'pickpt', i: hl + 1, moved: false };
      this.pickRoute(); sfx.place(); return;
    }
    if (k.closed) { sfx.error(); this.toast('THE LOOP IS CLOSED · DRAG THE ROUTE TO CHANGE IT, OR UNDO THE LAST POINT'); return; }
    k.clicks.push(s); k.preview = null; sfx.place();
    this.pickRoute(new Set([k.clicks.length - 1]));
  };
  P.pickHover = function (sx, sy) {
    const k = this.pk(); if (!k.G) return;
    k.hover = this.pickHitClick(sx, sy) >= 0 ? null : this.pickSnap(sx, sy);
    k.hoverPt = this.pickHitClick(sx, sy);
    // the leg it would add, live
    k.preview = null;
    if (k.hover && k.clicks.length && !k.closed && this.pickHitLeg(sx, sy) < 0) {
      const last = k.legs.length ? k.legs[k.legs.length - 1] : null;
      k.preview = routeRoads(k.G, k.clicks[k.clicks.length - 1], k.hover, { leave: last ? (last.arrived === 'a' ? 'b' : 'a') : undefined });
    }
    this.dirty = true;
  };
  P.pickDrag = function (sx, sy) {
    const k = this.pk(), d = this.drag, s = this.pickSnap(sx, sy);
    if (!s) return;
    k.clicks[d.i] = s; d.moved = true;
    const near = new Set([d.i]); // (the legs either side of it, and on from there)
    k.legs = routeAll(k.G, k.clicks, k.closed, k.legs, near);
    this.pickChanged();
  };
  P.pickUp = function () { this.pickRoute(); };
  P.pickKey = function (e) {
    const k = this.pk();
    if (e.code === 'Enter') { this.pickMake(); return true; }
    if (e.code === 'Backspace' || e.code === 'Delete') {
      if (!k.clicks.length) return false;
      if (e.code === 'Delete' && k.hoverPt >= 0) { k.clicks.splice(k.hoverPt, 1); if (k.clicks.length < 3) k.closed = false; }
      else if (k.closed) k.closed = false; // (the last thing done: closing the loop)
      else k.clicks.pop();
      sfx.del(); this.pickRoute(); return true;
    }
    if (e.code === 'Escape' && k.preview) { k.preview = null; this.dirty = true; return true; }
    return false;
  };
  P.pickClear = function () { const k = this.pk(); k.clicks = []; k.legs = []; k.closed = false; k.preview = null; this.pickChanged(); };

  // ---------------- the track ----------------
  P.pickProblems = function () {
    const k = this.pk(), L = k.line, out = [];
    if (k.clicks.length < 2) return out;
    if (k.legs.some(l => !l)) out.push({ block: true, text: 'Two of the points aren\'t joined by any street in what\'s downloaded: move one, or zoom out and Load Streets Here.' });
    if (!L) return out;
    if (L.overlaps.length || L.clash.alongside.length) out.push({ block: true, text: 'The route drives the same street twice (there and back, or both sides of a divided road): the track would lie on itself. Drag a point so it doesn\'t.' });
    if (L.clash.crossings.length) out.push({ text: `It crosses itself ${L.clash.crossings.length > 1 ? L.clash.crossings.length + ' times' : 'once'} on the flat: the track needs a bridge there before it can be raced (raise one stretch in the elevation profile).` });
    const pins = L.corners.filter(c => c.hairpin).length;
    if (pins) out.push({ text: `${pins} hairpin${pins > 1 ? 's' : ''}: the streets turn back on themselves there, so the track is rounded a little wider than the junction.` });
    const min = k.closed ? 250 : 150;
    if (L.len < min) out.push({ block: true, text: `A ${k.closed ? 'circuit' : 'point-to-point'} needs ${min} m or more (this one is ${Math.round(L.len)} m).` });
    return out;
  };
  P.pickMake = function () {
    const k = this.pk(), t = this.track;
    if (!k.line) { sfx.error(); this.toast(k.clicks.length < 2 ? 'CLICK TWO STREETS OR MORE FIRST' : 'THE ROUTE ISN\'T FINISHED'); return; }
    const bad = this.pickProblems().find(p => p.block);
    if (bad) { sfx.error(); this.toast('CAN\'T MAKE THE TRACK YET · SEE THE PANEL'); return; }
    const pts = pickTrackPoints(k.line.pts, k.closed);
    this.push();
    const hadDress = !!t.dress;
    t.points = pts; t.open = !k.closed; t.start = 0;
    t.dress = null; // (curbs, barriers and the pit lane are placed by distance round the old layout)
    t.roads = (t.roads || []).filter(r => !r.osm); // (imported streets were joined to the old layout: import them again)
    t.pick = { clicks: k.clicks.map(c => [Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10]), closed: k.closed };
    let elev = '';
    if (t.terrain) {
      const T = sampleTrack(t); let inside = true;
      for (let i = 0; i < T.N; i += 10) if (!inGrid(t.terrain, T.X[i], T.Z[i])) { inside = false; break; }
      if (inside) { projectOntoTrack(t, sampleTrack); elev = ' · REAL ELEVATION ON'; } else { t.terrain = null; elev = ' · GET REAL ELEVATION AGAIN (MAP)'; }
      // (the LiDAR ground for the new route, where it's somewhere the tiles don't reach yet: heights again once it's in)
      if (t.terrain && lidarCovers(t.geo)) setTimeout(() => { this.recompute(); this.reprojectWithLidar('LIDAR GROUND FOR THE NEW ROUTE'); }, 0);
    }
    this.sel.clear();
    sfx.select();
    this.changed(true);
    this.toast(`${k.closed ? 'CIRCUIT' : 'POINT-TO-POINT'} MADE · ${(k.line.len / 1000).toFixed(2)} KM${hadDress ? ' · CURBS & BARRIERS RESET' : ''}${elev}`, 2600);
    this.renderPickTab();
  };

  // ---------------- the panel ----------------
  P.renderPickTab = function () {
    if (this.tool !== 'pick') return;
    const el = $('tab-node'), k = this.pk(), t = this.track, L = k.line;
    if (!t.geo) {
      el.innerHTML = `<h4>PICK ROADS</h4><p class="muted">Turn real streets into your track. First put the track on the map: search your town in <b>MAP</b> (on the right), then come back here and click the streets you want to race on.</p><button id="pk-map" class="hot wide">Find My Town</button>`;
      $('pk-map').addEventListener('click', () => { this.showTab('map'); const q = $('map-q'); if (q) q.focus(); });
      return;
    }
    const probs = this.pickProblems(), made = t.pick && JSON.stringify(t.pick.clicks) === JSON.stringify(k.clicks.map(c => [Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10])) && !!t.pick.closed === k.closed;
    const step = !k.G ? 'Downloading the streets in view…' : !k.clicks.length ? '<b>Click a street</b> where the race starts.' : k.clicks.length === 1 ? '<b>Click the next street</b> you want to drive: the track follows the real roads there.' : k.closed ? 'Loop closed. <b>Drag</b> any point or the route itself to change it.' : 'Keep clicking streets. <b>Click the first point</b> to close a loop, or make a point-to-point from start to here.';
    el.innerHTML = `
      <h4>PICK ROADS</h4>
      <p class="muted">${step}</p>
      <p class="muted">Whatever street you click is the one it takes: to turn at a junction, click just past it on the new street. Drag a point to move it, click the route to add one. <b>Backspace</b> takes the last point back.</p>
      ${L ? `<div class="map-cur"><b>${(L.len / 1000).toFixed(2)} km</b> · ${k.clicks.length} points · ${L.corners.filter(c => c.th > 0.5).length} junction corners · ${k.closed ? 'circuit' : 'point-to-point'}</div>` : ''}
      ${probs.map(p => `<p class="warn">${p.block ? '! ' : ''}${esc(p.text)}</p>`).join('')}
      <button id="pk-make" class="hot wide" ${L && !probs.some(p => p.block) && !made ? '' : 'disabled'}>${made ? 'Track Made From This Route' : t.pick ? 'Update The Track' : k.closed || k.clicks.length < 2 ? 'Make The Circuit' : 'Make The Point-To-Point'}</button>
      <div class="seg" style="margin-top:8px"><button id="pk-undo" ${k.clicks.length ? '' : 'disabled'}>Undo Point</button><button id="pk-clear" ${k.clicks.length ? '' : 'disabled'}>Start Again</button></div>
      <div class="seg" style="margin-top:8px"><button id="pk-load" ${k.loading ? 'disabled' : ''}>Load Streets Here</button></div>
      <div class="map-status" id="pk-status">${esc(k.status || (k.G && !this.pickCovered() ? 'Part of the view has no streets yet: Load Streets Here.' : ''))}</div>
      <p class="muted" style="margin-top:12px">Corners keep the size the real junction has: the streets run exactly where the map has them, and only turn inside the junction. Street data © OpenStreetMap contributors.</p>`;
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
    on('pk-make', () => this.pickMake());
    on('pk-undo', () => this.pickKey({ code: 'Backspace' }));
    on('pk-clear', () => { this.pickClear(); sfx.del(); });
    on('pk-load', () => this.pickLoad());
  };

  // ---------------- drawing ----------------
  P.drawPickEdit = function (c) {
    if (this.tool !== 'pick') return;
    const k = this.pk(), G = k.G, sc = this.view.scale;
    if (G) {
      // the streets you can pick: faint, the one under the mouse brighter
      c.save(); c.lineCap = 'round';
      const hw = k.hover ? G.E[k.hover.e].wi : -1;
      c.strokeStyle = 'rgba(216,230,255,0.28)'; c.lineWidth = Math.max(1, 1.2); c.beginPath();
      for (const e of G.E) { if (e.wi === hw) continue; const [ax, ay] = this.w2s(G.X[e.a], G.Z[e.a]), [bx, by] = this.w2s(G.X[e.b], G.Z[e.b]); c.moveTo(ax, ay); c.lineTo(bx, by); }
      c.stroke();
      if (hw >= 0) {
        c.strokeStyle = 'rgba(255,214,107,0.55)'; c.lineWidth = Math.max(3, G.W[hw].width * sc * 0.6); c.beginPath();
        for (const e of G.E) if (e.wi === hw) { const [ax, ay] = this.w2s(G.X[e.a], G.Z[e.a]), [bx, by] = this.w2s(G.X[e.b], G.Z[e.b]); c.moveTo(ax, ay); c.lineTo(bx, by); }
        c.stroke();
      }
      c.restore();
    }
    const path = (pts) => { c.beginPath(); pts.forEach((p, i) => { const [x, y] = this.w2s(p.x, p.z); i ? c.lineTo(x, y) : c.moveTo(x, y); }); };
    // the route: as wide as the road, the centre line over it
    const L = k.line;
    if (L) {
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      path(L.pts); if (k.closed) c.closePath();
      c.strokeStyle = 'rgba(255,43,0,0.32)'; c.lineWidth = Math.max(4, 10 * sc); c.stroke();
      c.strokeStyle = '#ff2b00'; c.lineWidth = 2.5; c.stroke();
      // where it runs alongside itself: amber
      c.strokeStyle = '#ffb020'; c.lineWidth = Math.max(5, 12 * sc);
      for (const [i0, i1] of L.clash.alongside) { path(L.pts.slice(i0, i1 + 1)); c.stroke(); }
      for (const i of L.clash.crossings) { const [x, y] = this.w2s(L.pts[i].x, L.pts[i].z); c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.stroke(); }
      c.restore();
    } else if (k.legs.length) { // (a leg that couldn't be routed: the ones that could)
      c.strokeStyle = '#ff2b00'; c.lineWidth = 2.5; for (const l of k.legs) if (l) { path(l.pts); c.stroke(); }
    }
    // the leg the next click would add
    if (k.preview && !this.drag) {
      c.save(); c.setLineDash([6, 5]); c.strokeStyle = 'rgba(255,214,107,0.9)'; c.lineWidth = 2.5; path(k.preview.pts); c.stroke(); c.restore();
    }
    // the points: the start green (a loop's start / finish), a point-to-point's last red (the finish), the rest white
    k.clicks.forEach((p, i) => {
      const [x, y] = this.w2s(p.x, p.z), hov = i === k.hoverPt || (this.drag && this.drag.type === 'pickpt' && this.drag.i === i);
      const r = hov ? 8 : 6.5;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = i === 0 ? '#6ae04a' : !k.closed && i === k.clicks.length - 1 && i > 0 ? '#ff6a5a' : '#ffffff';
      c.fill(); c.lineWidth = 2; c.strokeStyle = '#000'; c.stroke();
      if (i === 0 && !k.closed && k.clicks.length > 2 && hov) { c.font = '600 12px ' + getComputedStyle(document.body).getPropertyValue('--f-body'); c.fillStyle = '#6ae04a'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('CLOSE THE LOOP', x + 13, y); }
    });
    // where a click would land
    if (k.hover && !this.drag) {
      const [x, y] = this.w2s(k.hover.x, k.hover.z);
      c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.strokeStyle = '#ffd66b'; c.lineWidth = 2; c.stroke();
      const nm = G.W[G.E[k.hover.e].wi].name;
      if (nm) { c.font = '600 12px ' + getComputedStyle(document.body).getPropertyValue('--f-body'); c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(nm, x + 12, y - 12); c.fillStyle = '#ffd66b'; c.fillText(nm, x + 12, y - 12); }
    }
  };
}
