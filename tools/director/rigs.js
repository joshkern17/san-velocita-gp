// Director mode camera rigs (marketing footage). Loaded into the game page by tools/director/director.mjs; it takes
// over Race.updateCamera while a shot runs. Rigs are calm on purpose (marketing/BRAND.md: slow drifting cameras, long
// holds): every moving rig eases toward its target instead of snapping, and nothing shakes.
//   rig(sim, car, cam, t, dt, P) - t = seconds into the shot, P = the shot's params; returns nothing, sets cam.
import * as THREE from 'three';
const V = (x, y, z) => ({ x, y, z });
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

// world helpers
const ground = (sim, x, z) => sim.world.groundHeight(x, z);
function look(cam, pos, at, fov) {
  cam.position.set(pos.x, pos.y, pos.z); cam.up.set(0, 1, 0); cam.lookAt(at.x, at.y, at.z);
  if (fov) cam.fov = fov; cam.updateProjectionMatrix();
}
// smoothed follow state per shot (critically damped toward the wanted point: a camera operator, not a rail)
function damp(S, key, want, dt, rate) {
  const cur = S[key]; if (!cur) { S[key] = { ...want }; return S[key]; }
  const k = 1 - Math.exp(-dt * rate);
  cur.x += (want.x - cur.x) * k; cur.y += (want.y - cur.y) * k; cur.z += (want.z - cur.z) * k; return cur;
}
// a point on the track's centreline, `ahead` metres past sample i, `side` metres to the right of it
function trackPoint(sim, i, ahead, side) {
  const T = sim.T, N = T.N, j = ((i + Math.round(ahead / T.ds)) % N + N) % N;
  return V(T.X[j] + T.RX[j] * side, T.Y[j], T.Z[j] + T.RZ[j] * side);
}
// Pick a camera spot near the track `ahead` metres on that can see the road the car covers during the shot. Tries
// both sides, a few distances and heights, nearest first; scores each by how many of the road points it sees
// (raycast against everything in the world, trees included). P.side / P.offset / P.h pin a choice if given.
const _ray = new THREE.Raycaster();
function sees(sim, from, to) {
  const dir = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z), dist = dir.length();
  _ray.camera = sim.camera; // (sprites need one to raycast)
  _ray.set(new THREE.Vector3(from.x, from.y, from.z), dir.normalize()); _ray.far = dist - 1.5;
  return _ray.intersectObject(sim.world.root, true).every(h => h.object.isSprite || h.object.material?.transparent && h.object.material.opacity < 0.2);
}
function clearSpot(sim, car, P, ahead, i0 = car.idx) {
  const travel = (car.phys.speed || 30) * (P.dur || 5), span = P.span || [ahead - travel * 0.8, ahead + 15];
  const road = [];
  for (let k = 0; k <= 6; k++) { const q = trackPoint(sim, i0, span[0] + (span[1] - span[0]) * k / 6, 0); q.y += 1.0; road.push(q); }
  const sides = P.side ? [P.side] : [1, -1], offs = P.offset ? [P.offset] : [10, 14, 20, 28], hs = P.h ? [P.h] : [1.6, 3.5, 6];
  let best = null, bestN = -1;
  for (const o of offs) for (const h of hs) for (const sd of sides) {
    const sp = trackPoint(sim, i0, ahead, sd * o); sp.y = Math.max(sp.y, ground(sim, sp.x, sp.z)) + h;
    const n = road.filter(q => sees(sim, sp, q)).length;
    if (n > bestN) { best = sp; bestN = n; }
    if (n === road.length) return sp;
  }
  return best;
}
const carAt = (car, up = 0.7) => V(car.phys.x, car.y + up, car.phys.z);
// the car's heading, smoothed (rigs ride with the car exactly but turn with it gently, like a camera car)
function heading(S, p, dt, rate = 3) {
  if (S.hd == null) return (S.hd = p.h);
  let d = p.h - S.hd; d = Math.atan2(Math.sin(d), Math.cos(d)); return (S.hd += d * (1 - Math.exp(-dt * rate)));
}
const axes = (h) => ({ f: V(Math.sin(h), 0, Math.cos(h)), r: V(Math.cos(h), 0, -Math.sin(h)) });

export const RIGS = {
  // the game's own cameras (chase / far / tcam / bumper), untouched
  game(sim, car, cam, t, dt, P, S) {
    const CAMS = ['chase', 'far', 'tcam', 'bumper'];
    sim.camMode = Math.max(0, CAMS.indexOf(P.mode || 'chase')); sim.focus = car;
    S.orig.call(sim, dt, t === 0);
  },

  // tracking dolly: rides alongside the car, slowly sliding from front quarter to rear quarter (or back)
  dolly(sim, car, cam, t, dt, P, S) {
    const p = car.phys, { f, r } = axes(heading(S, p, dt)), side = (P.side ?? 1) * (P.dist ?? 7);
    const k = ease(Math.min(1, t / (P.dur || 6)));
    const along = lerp(P.from ?? 2.5, P.to ?? -2.5, k);
    const pos = V(p.x + r.x * side + f.x * along, 0, p.z + r.z * side + f.z * along);
    pos.y = Math.max(car.y + (P.h ?? 0.9), ground(sim, pos.x, pos.z) + 0.6);
    look(cam, pos, carAt(car, 0.6), P.fov ?? 45);
  },

  // slow orbit around the car (works parked or moving)
  orbit(sim, car, cam, t, dt, P, S) {
    const p = car.phys, a = heading(S, p, dt) + (P.start ?? 2.4) + t * (P.speed ?? 0.18), d = P.dist ?? 6.5;
    const pos = V(p.x + Math.sin(a) * d, 0, p.z + Math.cos(a) * d);
    pos.y = Math.max(car.y + (P.h ?? 1.3), ground(sim, pos.x, pos.z) + 0.8);
    look(cam, pos, carAt(car, 0.5), P.fov ?? 45);
  },

  // a camera planted at the trackside ahead of the car: pans as it comes past, long lens. The spot is picked so it
  // can actually see the stretch the car will drive during the shot (trees, walls and buildings tested, not guessed)
  trackside(sim, car, cam, t, dt, P, S) {
    if (!S.spot) S.spot = clearSpot(sim, car, P, P.ahead ?? 80);
    const p = car.phys, at = damp(S, 'at', V(p.x + p.vx * 0.1, car.y + 0.6, p.z + p.vz * 0.1), dt, 9);
    const d = Math.hypot(S.spot.x - at.x, S.spot.z - at.z);
    // frame the car about the same size the whole pass (a long lens far away, wider as it nears)
    const fov = Math.max(P.minFov ?? 8, Math.min(P.maxFov ?? 55, 2 * Math.atan((P.frame ?? 7) / d) * 57.3));
    S.fov = S.fov ? lerp(S.fov, fov, 1 - Math.exp(-dt * 4)) : fov;
    look(cam, S.spot, at, S.fov);
  },

  // helicopter: high, behind and to the side, looking down the road ahead of the car
  heli(sim, car, cam, t, dt, P, S) {
    const p = car.phys, { f, r } = axes(heading(S, p, dt, 1.2)), back = P.back ?? 28, hgt = P.h ?? 22, side = (P.side ?? 1) * (P.offset ?? 10);
    const pos = V(p.x - f.x * back + r.x * side, 0, p.z - f.z * back + r.z * side);
    pos.y = Math.max(car.y + hgt, ground(sim, pos.x, pos.z) + 4);
    look(cam, pos, V(p.x + f.x * 12, car.y, p.z + f.z * 12), P.fov ?? 38);
  },

  // close on a wheel (front by default), low, riding with the car: tire detail shots
  wheel(sim, car, cam, t, dt, P, S) {
    const g = car.model.group; g.updateMatrixWorld();
    const Vec = cam.position.constructor; // (THREE.Vector3, without importing three here)
    const sx = (P.side ?? 1) * (P.out ?? 1.9), az = P.axle === 'rear' ? -(P.wb ?? 1.3) : (P.wb ?? 1.3);
    const pos = new Vec(sx, P.h ?? 0.35, az + (P.lead ?? 0.9)).applyMatrix4(g.matrixWorld);
    const at = new Vec(sx * 0.45, 0.3, az).applyMatrix4(g.matrixWorld);
    cam.position.copy(pos); cam.up.set(0, 1, 0); cam.lookAt(at); cam.fov = P.fov ?? 50; cam.updateProjectionMatrix();
  },

  // locked off: a fixed spot on the track (sample index or "ahead of the car when the shot starts"), no panning
  static(sim, car, cam, t, dt, P, S) {
    if (!S.spot) {
      const i = P.sample ?? car.idx, a = P.ahead ?? 40;
      S.spot = clearSpot(sim, car, { ...P, span: [a - 40, a + (P.lookAhead ?? -15)] }, a, i);
      S.at = trackPoint(sim, i, a + (P.lookAhead ?? -15), 0); S.at.y += 0.5;
    }
    look(cam, S.spot, S.at, P.fov ?? 35);
  },
};

// Install: wraps sim.updateCamera so the active shot's rig runs instead. Returns a controller the capture loop drives.
export function install(sim) {
  const orig = sim.updateCamera;
  const D = { shot: null, t: 0, S: { orig } };
  sim.updateCamera = function (dt) {
    if (!D.shot) return orig.call(this, dt);
    const car = D.car || this.focus;
    RIGS[D.shot.rig](this, car, this.camera, D.t, dt, D.shot, D.S);
  };
  D.start = (shot, car) => { D.shot = shot; D.car = car; D.t = 0; D.S = { orig }; };
  D.tick = (dt) => { D.t += dt; };
  return D;
}
