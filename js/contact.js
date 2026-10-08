// Contact: cars hitting cars and walls, as rigid bodies (top-down: position, heading, yaw).
// Each car is a box (bodyBox) around its centre of mass. Where two boxes overlap, the contact point and normal come
// from the separating axes; the impulse there is worked out from both cars' mass and yaw inertia, with a little bounce
// (restitution) and body-on-body friction. So a hit spins a car the way it was hit: a tap on the rear quarter turns it
// round, a hit through the middle shoves it sideways, a heavy car moves a light one more. Walls are the same, with the
// wall as an immovable body. Kept free of THREE / the DOM, like physics.js, so it runs in plain node.
//
// Axes (as in physics.js): a car at heading h faces f = (sin h, cos h) in (x, z); its +v side is s = (cos h, −sin h);
// yaw rate r turns f toward s. A point at offset (rx, rz) from the centre of mass moves at r·(rz, −rx), and a force
// (Fx, Fz) there makes the yaw torque rz·Fx − rx·Fz.

// the car's body: [front, rear] reach from the centre of mass and the half width (m). From the spec's axle positions
// plus its overhangs (ovh [front, rear]), and its track plus the tyres' width; or spec.body to set it outright
export function bodyBox(P) {
  if (P._box) return P._box;
  const [oF, oR] = P.ovh || [0.9, 0.9];
  const b = P.body ? { f: P.body[0], r: P.body[1], w: P.body[2] } : { f: P.a + oF, r: P.b + oR, w: (P.track ?? 1.6) / 2 + 0.2 };
  b.reach = Math.hypot(Math.max(b.f, b.r), b.w);
  Object.defineProperty(P, '_box', { value: b, enumerable: false, writable: true });
  return b;
}

// the four corners of a car's box, as offsets from its centre of mass: FL FR RL RR ([x, z] pairs into out)
export function corners(p, out = new Float64Array(8)) {
  const B = bodyBox(p.p), sn = Math.sin(p.h), cs = Math.cos(p.h);
  for (let k = 0; k < 4; k++) {
    const lx = k < 2 ? B.f : -B.r, ly = k & 1 ? B.w : -B.w;
    out[k * 2] = sn * lx + cs * ly; out[k * 2 + 1] = cs * lx - sn * ly;
  }
  return out;
}

// a world point in a car's own frame: [forward, +v side] from its centre of mass
export function toLocal(p, x, z) {
  const dx = x - p.x, dz = z - p.z, sn = Math.sin(p.h), cs = Math.cos(p.h);
  return [dx * sn + dz * cs, dx * cs - dz * sn];
}

// which part of the car a local point is on: 0 front, 1 rear, 2 side
export function partAt(p, lx) {
  const B = bodyBox(p.p);
  return lx > B.f * 0.5 ? 0 : lx < -B.r * 0.5 ? 1 : 2;
}

// Bodies are boxes with rounded corners (radius ROUND, in plan view): a corner-on-corner hit pushes on the slant of
// the corners, so a nose into a rear quarter shoves the tail sideways as well as forward (the push that turns a car
// round), and cars alongside slide off each other's corners instead of catching on them.
export const ROUND = 0.4;

const CA = new Float64Array(8), CB = new Float64Array(8), KA = new Float64Array(8), KB = new Float64Array(8);
// a car's box shrunk by d all round: its four corners, world positions (FL FR RR RL: in order round it)
function shrunk(p, d, out) {
  const B = bodyBox(p.p), sn = Math.sin(p.h), cs = Math.cos(p.h), f = B.f - d, r = B.r - d, w = B.w - d;
  const L = [f, f, -r, -r], Y = [-w, w, w, -w];
  for (let k = 0; k < 4; k++) { out[k * 2] = p.x + sn * L[k] + cs * Y[k]; out[k * 2 + 1] = p.z + cs * L[k] - sn * Y[k]; }
  return out;
}

// Do two cars' bodies touch? → null, or { nx, nz (unit, from A toward B), pen (m), px, pz (the contact point) }
export function boxContact(A, B) {
  const a = shrunk(A, ROUND, KA), b = shrunk(B, ROUND, KB), R2 = 2 * ROUND;
  // the gap between the two cores (the rounded bodies touch where it's under twice the corner radius): every corner of
  // one against every side of the other
  let best = Infinity;
  const hits = [];
  const test = (P, Q, flip) => {
    for (let i = 0; i < 4; i++) {
      const vx = P[i * 2], vz = P[i * 2 + 1];
      for (let e = 0; e < 4; e++) {
        const ax = Q[e * 2], az = Q[e * 2 + 1], bx = Q[((e + 1) & 3) * 2], bz = Q[((e + 1) & 3) * 2 + 1];
        const ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((vx - ax) * ex + (vz - az) * ez) / (ex * ex + ez * ez)));
        const qx = ax + ex * t, qz = az + ez * t, d = Math.hypot(vx - qx, vz - qz);
        if (d >= R2) continue;
        if (d < best) best = d;
        hits.push(d, flip ? vx : qx, flip ? vz : qz, flip ? qx : vx, flip ? qz : vz); // (A's point, B's point)
      }
    }
  };
  if (!satOverlap(A, B, ROUND)) {
    test(a, b, true); test(b, a, false);
    if (best >= R2) return null;
    if (best > 0.02) {
      // the normal: the closest pair. The contact: the middle of the pairs as close and lying the same way (two sides
      // alongside each other: the middle of where they overlap)
      let k0 = 0;
      for (let k = 0; k < hits.length; k += 5) if (hits[k] === best) { k0 = k; break; }
      const nx = (hits[k0 + 3] - hits[k0 + 1]) / best, nz = (hits[k0 + 4] - hits[k0 + 2]) / best;
      let px = 0, pz = 0, n = 0;
      for (let k = 0; k < hits.length; k += 5) {
        if (hits[k] > best + 0.03 || ((hits[k + 3] - hits[k + 1]) * nx + (hits[k + 4] - hits[k + 2]) * nz) / hits[k] < 0.995) continue;
        px += (hits[k + 1] + hits[k + 3]) / 2; pz += (hits[k + 2] + hits[k + 4]) / 2; n++;
      }
      return { nx, nz, pen: R2 - best, px: px / n, pz: pz / n };
    }
  }
  return boxSat(A, B);
}

// do the boxes, shrunk by d, overlap? (separating axes)
function satOverlap(A, B, d) {
  const bA = bodyBox(A.p), bB = bodyBox(B.p);
  const fA = [Math.sin(A.h), Math.cos(A.h)], sA = [fA[1], -fA[0]], fB = [Math.sin(B.h), Math.cos(B.h)], sB = [fB[1], -fB[0]];
  const hA = (bA.f + bA.r) / 2 - d, hB = (bB.f + bB.r) / 2 - d, wA = bA.w - d, wB = bB.w - d;
  const oA = (bA.f - bA.r) / 2, oB = (bB.f - bB.r) / 2;
  const dx = B.x + fB[0] * oB - A.x - fA[0] * oA, dz = B.z + fB[1] * oB - A.z - fA[1] * oA;
  for (const L of [fA, sA, fB, sB]) {
    const rA = hA * Math.abs(fA[0] * L[0] + fA[1] * L[1]) + wA * Math.abs(sA[0] * L[0] + sA[1] * L[1]);
    const rB = hB * Math.abs(fB[0] * L[0] + fB[1] * L[1]) + wB * Math.abs(sB[0] * L[0] + sB[1] * L[1]);
    if (rA + rB <= Math.abs(dx * L[0] + dz * L[1])) return false;
  }
  return true;
}

// the boxes deep in each other (their cores overlapping: a big hit within one step): the square boxes' separating
// axes, the contact where the other box's corners went deepest through the face
function boxSat(A, B) {
  const bA = bodyBox(A.p), bB = bodyBox(B.p);
  const fA = [Math.sin(A.h), Math.cos(A.h)], sA = [fA[1], -fA[0]], fB = [Math.sin(B.h), Math.cos(B.h)], sB = [fB[1], -fB[0]];
  // box centres (the boxes reach further one way than the other from the centre of mass)
  const oA = (bA.f - bA.r) / 2, oB = (bB.f - bB.r) / 2, hA = (bA.f + bA.r) / 2, hB = (bB.f + bB.r) / 2;
  const cAx = A.x + fA[0] * oA, cAz = A.z + fA[1] * oA, cBx = B.x + fB[0] * oB, cBz = B.z + fB[1] * oB;
  const dx = cBx - cAx, dz = cBz - cAz;
  let best = Infinity, nx = 0, nz = 0, ref = 0, refT = null, refE = 0, refR = 0;
  const axes = [[fA, 0, sA, bA.w], [sA, 0, fA, hA], [fB, 1, sB, bB.w], [sB, 1, fB, hB]];
  for (const [L, owner, T, E] of axes) {
    const rA = hA * Math.abs(fA[0] * L[0] + fA[1] * L[1]) + bA.w * Math.abs(sA[0] * L[0] + sA[1] * L[1]);
    const rB = hB * Math.abs(fB[0] * L[0] + fB[1] * L[1]) + bB.w * Math.abs(sB[0] * L[0] + sB[1] * L[1]);
    const d = dx * L[0] + dz * L[1], o = rA + rB - Math.abs(d);
    if (o <= 0) return null;
    // (a small preference for the boxes' own faces over a near tie: stops the normal flicking between two axes)
    if (o < best - 1e-3) { best = o; const sg = d < 0 ? -1 : 1; nx = L[0] * sg; nz = L[1] * sg; ref = owner; refT = T; refE = E; refR = owner ? rB : rA; }
  }
  // the contact point: the other box's corners that went deepest through the reference box's face, clipped to that face
  const inc = ref ? A : B, C = corners(inc, ref ? CA : CB);
  const fx = ref ? cBx - nx * refR : cAx + nx * refR, fz = ref ? cBz - nz * refR : cAz + nz * refR; // (the face's middle)
  const sgn = ref ? 1 : -1; // (A's corners go through B's face along +n; B's through A's along −n)
  let dMax = -Infinity;
  const dep = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) { dep[k] = ((inc.x + C[k * 2] - fx) * nx + (inc.z + C[k * 2 + 1] - fz) * nz) * sgn; dMax = Math.max(dMax, dep[k]); }
  let tMin = Infinity, tMax = -Infinity;
  for (let k = 0; k < 4; k++) {
    if (dep[k] < dMax - 0.15) continue;
    const t = (inc.x + C[k * 2] - fx) * refT[0] + (inc.z + C[k * 2 + 1] - fz) * refT[1];
    tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
  }
  tMin = Math.max(-refE, Math.min(refE, tMin)); tMax = Math.max(-refE, Math.min(refE, tMax));
  const tm = (tMin + tMax) / 2;
  return { nx, nz, pen: best, px: fx + refT[0] * tm + nx * sgn * best / 2, pz: fz + refT[1] * tm + nz * sgn * best / 2 };
}

// restitution: a little bounce in a nudge, almost none in a big hit (the bodywork crumples)
const bounceOf = (v, e0) => 0.05 + (e0 - 0.05) * Math.max(0, 1 - v / 14);

// The impulse at a contact between A and B (B null: a wall). n points from A toward B; mA / mB: 0 = immovable (an
// online rival this machine doesn't simulate). mu: body-on-body friction. Changes both cars' velocities and yaw.
// → { j (normal impulse, N s), jt (friction, N s), vn (closing speed at the point, m/s), vt (sliding speed), dwA, dwB }
export function impulse(A, B, c, { mu = 0.35, e0 = 0.3, fixA = false, fixB = false } = {}) {
  const iMA = fixA ? 0 : 1 / A.p.mass, iIA = fixA ? 0 : 1 / A.p.inertia;
  const iMB = !B || fixB ? 0 : 1 / B.p.mass, iIB = !B || fixB ? 0 : 1 / B.p.inertia;
  const { nx, nz, px, pz } = c;
  const rAx = px - A.x, rAz = pz - A.z, rBx = B ? px - B.x : 0, rBz = B ? pz - B.z : 0;
  const vel = () => {
    const ax = A.vx + A.r * rAz, az = A.vz - A.r * rAx;
    const bx = B ? B.vx + B.r * rBz : 0, bz = B ? B.vz - B.r * rBx : 0;
    return [bx - ax, bz - az];
  };
  const push = (jx, jz) => { // (impulse +J on B, −J on A)
    A.vx -= jx * iMA; A.vz -= jz * iMA; A.r -= (rAz * jx - rAx * jz) * iIA;
    if (B) { B.vx += jx * iMB; B.vz += jz * iMB; B.r += (rBz * jx - rBx * jz) * iIB; }
  };
  const rA0 = A.r, rB0 = B ? B.r : 0;
  let [vx, vz] = vel();
  const vn = vx * nx + vz * nz;
  if (vn >= 0 || iMA + iMB === 0) return null; // (separating already)
  const cnA = rAz * nx - rAx * nz, cnB = rBz * nx - rBx * nz;
  const K = iMA + iMB + cnA * cnA * iIA + cnB * cnB * iIB;
  const j = -(1 + bounceOf(-vn, e0)) * vn / K;
  push(nx * j, nz * j);
  // friction: against the sliding along the contact, up to mu times the normal impulse
  [vx, vz] = vel();
  const vn2 = vx * nx + vz * nz, tx = vx - vn2 * nx, tz = vz - vn2 * nz, vt = Math.hypot(tx, tz);
  let jt = 0;
  if (vt > 1e-4) {
    const ux = tx / vt, uz = tz / vt, ctA = rAz * ux - rAx * uz, ctB = rBz * ux - rBx * uz;
    const Kt = iMA + iMB + ctA * ctA * iIA + ctB * ctB * iIB;
    jt = Math.min(vt / Kt, mu * j);
    push(-ux * jt, -uz * jt);
  }
  return { j, jt, vn: -vn, vt, dwA: A.r - rA0, dwB: B ? B.r - rB0 : 0 };
}

// After a hit: for a moment the yaw-rate cap and the slide limiter (stability aids that hold a car to what its tyres
// can do) stand back, so the spin the hit gave the car plays out; then the tyres catch it, or don't.
// (physics.js CarPhysics.step fades them back in as hitT runs out)
// (a brush or a nudge doesn't: the aids carry on as if nothing happened)
export function knock(p, dw, dv) {
  const a = Math.abs(dw);
  if (a < 0.5 && dv < 5) return;
  p.hitT = Math.max(p.hitT || 0, Math.min(1.5, 0.5 * Math.max(a - 0.5, 0) + 0.04 * Math.max(dv - 5, 0) + 0.5));
}

// The body jolts with a hit. A push below the centre of mass trips the car: a wall catches the wheels and sills first,
// low down, so the body carries on over them (sliding sideways into a wall, the far side's wheels lift; nose first, the
// nose dives and the tail lifts). A tall car (a van) trips a lot, a low one (the F1 car, its centre of mass lower than
// what touches) hardly at all, even the other way. Then the body swings on its springs (bodyStep), and past full droop
// the wheels come up with it. J: the impulse on this car, world (N s).
// (however hard the hit, or however many pushes a car pressed against a wall gets, the jolt is held to what tips the car
// up on two wheels and back down, not over: the physics has no rollover)
const TRIP_H = 0.4; // m: the height a car is hit at, between its wheels and sills and the doors above them
export function rock(p, jx, jz) {
  if (!p.body || !p.susp) return;
  const S = p.susp, B = p.body, sn = Math.sin(p.h), cs = Math.cos(p.h), d = S.h - TRIP_H;
  const lon = jx * sn + jz * cs, lat = jx * cs - jz * sn;
  B.vth = cap(B.vth, lon * d / S.Iyy, 0.1 * S.wPitch);
  // (the most it tips: a little past where the far side's wheels hang at full droop, at most ~9°. A stiff car on short
  // travel, the F1 car, barely leaves the road: tipped further it slammed onto its bump stops and bounced off the road)
  const tip = Math.min(0.15, 1.4 * S.droop / (S.tw / 2));
  B.vph = cap(B.vph, lat * d / S.Ixx, tip * S.wRoll);
}
// v plus dv, but no further past ±lim than it already was
const cap = (v, dv, lim) => { const n = v + dv; return Math.abs(n) <= lim || Math.abs(n) < Math.abs(v) ? n : Math.sign(n) * Math.max(Math.abs(v), lim); };
