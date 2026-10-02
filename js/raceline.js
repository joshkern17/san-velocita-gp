// The racing line, fitted to a car: the fastest path around the circuit a point-mass model of that car can find.
// Starts from the smoothest line (track.js minCurvatureLine) and keeps nudging it in and out, a smooth bump at a time,
// keeping every change that makes the modelled lap quicker. The model knows the line's real length (going wide costs
// metres), that cornering grip is shared with braking and accelerating (so it brakes in a straight line and turns in
// from the outside), the car's power, drag and downforce. A powerful car gets a line that opens the exit; a light,
// grippy one carries speed through the middle.
// Free of THREE / the DOM (runs in plain node).

const G = 9.81;
// curvature is measured over a chord of ±S_CURV m: a real car can't follow a kink shorter than that (it smooths across
// it), so a model that sees short kinks thinks a kinked line is slower than the car finds it. Calibrated below.
export let S_CURV = 8;
export const setCurv = (m) => { S_CURV = m; };

// the model of a car (from its spec, see physics.js / cars.js). gripK: the model's grip over the spec's mu. Calibrated
// 2026-10-02 at Auburn on the old line: 1.05 matches the AI's real laps in the GT-R, M1, Aventus and F1 (all within
// ~1%); 1.1 is a quick human's (a little more than the AI uses).
export function lineCar(spec, { grip = 1, power = 1, gripK = 1.1 } = {}) {
  return {
    mu: spec.mu * gripK * grip, m: spec.mass, kd: spec.kd || 0, drag: spec.drag || 0.4, roll: spec.roll ?? 14,
    P: spec.power * power, Fmax: (spec.maxForce || 14000) * power, vmax: spec.gears[spec.gears.length - 1] * 0.99,
    brake: 1.05,
  };
}

// the line's shape at samples i0..i1 (may run past N: wraps): its points, segment lengths, curvature
function geom(T, O, S, i0 = 0, i1 = T.N - 1) {
  const N = T.N, { X, Z, RX, RZ } = T, { PX, PZ, L, K, k } = S, all = i1 - i0 >= N - 1;
  const r = (i) => ((i % N) + N) % N;
  const p0 = all ? 0 : i0 - k - 1, p1 = all ? N - 1 : i1 + k + 1;
  for (let n = p0; n <= p1; n++) { const i = r(n); PX[i] = X[i] + RX[i] * O[i]; PZ[i] = Z[i] + RZ[i] * O[i]; }
  for (let n = all ? 0 : i0 - k - 1; n <= (all ? N - 1 : i1 + k); n++) { const i = r(n), j = r(n + 1), dx = PX[j] - PX[i], dz = PZ[j] - PZ[i]; L[i] = Math.sqrt(dx * dx + dz * dz); }
  // curvature: the circle through the points k samples either side (a few metres: smooths sample noise, still sees kinks)
  for (let n = all ? 0 : i0 - k; n <= (all ? N - 1 : i1 + k); n++) {
    const i = r(n), a = r(n - k), b = r(n + k);
    const ax = PX[a], az = PZ[a], bx = PX[i], bz = PZ[i], cx = PX[b], cz = PZ[b];
    const A2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
    const d1 = (bx - ax) ** 2 + (bz - az) ** 2, d2 = (cx - bx) ** 2 + (cz - bz) ** 2, d3 = (cx - ax) ** 2 + (cz - az) ** 2;
    K[i] = (2 * A2) / Math.max(1e-6, Math.sqrt(d1 * d2 * d3));
  }
}
// lap time on the shape geom() last worked out
function passes(T, car, S) {
  const N = T.N, cut = T.cut ?? -1, { L, K, V } = S;
  const { mu, m, kd, drag, roll, P, Fmax, vmax, brake } = car, muG = mu * m * G, muKd = mu * kd;
  // the fastest each point can be taken at all (all the grip spent turning)
  for (let i = 0; i < N; i++) {
    const den = K[i] * m - muKd;
    V[i] = den <= 0 ? vmax : Math.min(vmax, Math.sqrt(muG / den));
  }
  // grip left for braking / accelerating with the rest spent turning (a friction circle)
  // braking: backwards from every corner (twice round a loop). Point-to-point: stop by the end of the run-off.
  if (cut >= 0) V[cut] = 0;
  for (let pass = 0; pass < (cut >= 0 ? 1 : 2); pass++) for (let i = N - 1; i >= 0; i--) {
    if (i === cut) continue;
    const j = i + 1 === N ? 0 : i + 1, v = V[j], v2 = v * v;
    const tot = muG + muKd * v2, lat = m * v2 * K[j];
    const F = (lat >= tot ? 0 : Math.sqrt(tot * tot - lat * lat)) * brake + drag * v2 + roll * v;
    const vb = Math.sqrt(v2 + 2 * F / m * L[i]);
    if (vb < V[i]) V[i] = vb;
  }
  // accelerating: forwards, power or grip limited, less drag (a point-to-point starts standing at the back of the grid)
  let t = 0;
  const start = cut >= 0 ? (cut + 1) % N : 0, laps = cut >= 0 ? 1 : 2;
  let v = cut >= 0 ? 0 : V[0];
  for (let pass = 0; pass < laps; pass++) {
    t = 0;
    for (let n = 0, i = start; n < N; n++, i = i + 1 === N ? 0 : i + 1) {
      if (i === cut) break;
      const j = i + 1 === N ? 0 : i + 1;
      if (V[i] < v) v = V[i];
      const v2 = v * v, tot = muG + muKd * v2, lat = m * v2 * K[i];
      const F = Math.min(P / (v > 5 ? v : 5), Fmax, lat >= tot ? 0 : Math.sqrt(tot * tot - lat * lat)) - drag * v2 - roll * v;
      let vn = Math.sqrt(Math.max(0, v2 + 2 * F / m * L[i]));
      if (V[j] < vn) vn = V[j];
      t += L[i] / Math.max(1, (v + vn) / 2);
      v = vn;
    }
  }
  return t;
}
function lapTime(T, O, car, S) { geom(T, O, S); return passes(T, car, S); }

function scratch(T) {
  const N = T.N;
  return { PX: new Float64Array(N), PZ: new Float64Array(N), L: new Float64Array(N), K: new Float64Array(N), V: new Float64Array(N), k: Math.max(1, Math.round(S_CURV / T.ds)) };
}
export function lineTime(T, O, car) { return lapTime(T, O, car, scratch(T)); }

// O0: the line to start from (the min-curvature one); margin: the car's centre stays this far inside the edges.
// The line is moved by control points every ~`spacing` m with a smooth curve (Catmull-Rom) through them, so it can't
// kink. Returns { O, time, from } (the model's lap time on the new line and on the one it started from). It stops
// after maxEvals tries at most, not after a time: the same circuit and car always give the same line, on any machine.
export function fastLine(T, O0, car, { margin = 1.6, spacing = 10, maxEvals = 60000 } = {}) {
  const N = T.N, S = scratch(T), now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), t0 = now();
  const open = (T.cut ?? -1) >= 0;
  const M = Math.max(12, Math.round(N * T.ds / spacing));
  // control points: sample index, and how far each may move (the narrowest bit of track it governs)
  const idx = new Int32Array(M), lo = new Float64Array(M), hi = new Float64Array(M), a = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    const i = open ? (T.cut + 1 + Math.round(j * (N - 1) / (M - 1))) % N : Math.round(j * N / M) % N; idx[j] = i;
    const lim = Math.max(0, T.W[i] / 2 - margin); lo[j] = -lim; hi[j] = lim;
    a[j] = Math.max(lo[j], Math.min(hi[j], O0[i]));
  }
  const O = new Float64Array(N);
  const w = (j) => open ? Math.max(0, Math.min(M - 1, j)) : ((j % M) + M) % M;
  // fill samples of segments j0..j1 (control point j moves segments j-2..j+1)
  const fill = (j0, j1) => {
    for (let jj = j0; jj <= j1; jj++) {
      if (open && (jj < 0 || jj >= M - 1)) continue;
      const j = w(jj), i0 = idx[j], nj = w(j + 1), i1raw = idx[nj], i1 = i1raw <= i0 ? i1raw + N : i1raw;
      const p0 = a[w(j - 1)], p1 = a[j], p2 = a[nj], p3 = a[w(j + 2)];
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / (i1 - i0), t2 = t * t, t3 = t2 * t;
        const v = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        const ii = i % N, lim = Math.max(0, T.W[ii] / 2 - margin);
        O[ii] = Math.max(-lim, Math.min(lim, v));
      }
    }
  };
  if (open) { for (let i = 0; i < N; i++) O[i] = O0[i]; }
  fill(0, M - 1);
  const from = lapTime(T, O, car, S);
  let best = from, evals = 0;
  const saveA = new Float64Array(M), saveO = new Float64Array(N);
  // coarse to fine: groups of control points move whole corners, single ones place apexes and turn-in points
  for (const [width, step] of [[5, 1.5], [3, 0.9], [2, 0.5], [1, 0.3], [1, 0.12]]) {
    for (let round = 0; round < 6; round++) {
      let gained = 0;
      for (let c = 0; c < M; c++) {
        if (evals >= maxEvals) return { O: Float32Array.from(O), time: best, from, evals, ms: now() - t0 };
        for (const dir of [1, -1]) {
          saveA.set(a);
          let changed = false;
          for (let q = -width + 1; q < width; q++) {
            const j = w(c + q), v = Math.max(lo[j], Math.min(hi[j], a[j] + dir * step * (0.5 + 0.5 * Math.cos(Math.PI * q / width))));
            if (v !== a[j]) { a[j] = v; changed = true; }
          }
          if (!changed) continue;
          const s0 = idx[w(c - width - 1)], s1r = idx[w(c + width + 1)], s1 = s1r < s0 ? s1r + N : s1r;
          for (let n = s0; n <= s1; n++) saveO[n % N] = O[n % N];
          fill(c - width - 1, c + width);
          geom(T, O, S, s0, s1);
          const t = passes(T, car, S); evals++;
          if (t < best - 1e-5) { gained += best - t; best = t; break; }
          a.set(saveA); for (let n = s0; n <= s1; n++) O[n % N] = saveO[n % N];
          geom(T, O, S, s0, s1);
        }
      }
      if (gained < 0.003) break;
    }
  }
  return { O: Float32Array.from(O), time: best, from, evals, ms: now() - t0 };
}

// the model's speed (m/s) at each sample along a line, and the time to reach each sample from sample 0
export function lineProfile(T, O, car) {
  const S = scratch(T); geom(T, O, S); passes(T, car, S);
  const N = T.N, V = Float64Array.from(S.V), at = new Float64Array(N + 1);
  // (passes leaves V as the braking-limited envelope: redo the forward pass to get the speeds actually driven)
  const { mu, m, kd, drag, roll, P, Fmax } = car, muG = mu * m * G, muKd = mu * kd;
  let v = V[0];
  for (let lap = 0; lap < 2; lap++) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N; if (S.V[i] < v) v = S.V[i]; V[i] = v;
    const v2 = v * v, tot = muG + muKd * v2, lat = m * v2 * S.K[i];
    const F = Math.min(P / Math.max(v, 5), Fmax, lat >= tot ? 0 : Math.sqrt(tot * tot - lat * lat)) - drag * v2 - roll * v;
    let vn = Math.sqrt(Math.max(0, v2 + 2 * F / m * S.L[i])); if (S.V[j] < vn) vn = S.V[j];
    if (lap === 1) at[i + 1] = at[i] + S.L[i] / Math.max(1, (v + vn) / 2);
    v = vn;
  }
  return { V, at, K: Float64Array.from(S.K) };
}
