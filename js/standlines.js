// A stretch of grandstand as the Circuit Designer's own kind: a line of covered grandstands or grandstands with flags
// (js/trackprops.js stand_roof / stand_flags), 9 m apart, every one facing the track, kept as a PROPS line
// (track.propLines + its props marked ln) so it can be moved, reshaped and re-spaced in the editor like one drawn by
// hand. Used by the real-circuit importer (tools/tracks/bake.js) and to swap the old one-piece 'grandstand' props.
export const STAND_GAP = 9;
const IDS = { stand_roof: ['tp_stand_roof_a', 'tp_stand_roof_b'], stand_flags: ['tp_stand_flags_a', 'tp_stand_flags_b'] };

// a line from a (x, z) to b, facing (fx, fz) (towards the track): { line, props }
export function standLine(id, a, b, fx, fz, fam = 'stand_roof', seed = 0) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.floor(len / STAND_GAP + 1e-6) + 1);
  const rot = Math.round(Math.atan2(fx, fz) * 1000) / 1000, ids = IDS[fam], props = [];
  for (let k = 0; k < n; k++) {
    const f = n > 1 ? (k * STAND_GAP) / len : 0;
    props.push({ type: ids[(seed + k) % ids.length], x: r1(a[0] + (b[0] - a[0]) * f), z: r1(a[1] + (b[1] - a[1]) * f), rot, ln: id });
  }
  return { line: { id, type: 'tp:' + fam, pts: [[r1(a[0]), r1(a[1])], [r1(b[0]), r1(b[1])]], gap: STAND_GAP, look: '', seed }, props };
}

// a stand len m long centred on (x, z), facing rot (atan2 towards the track): a line along its length
export function standLineAt(id, x, z, rot, len, fam, seed) {
  const fx = Math.sin(rot), fz = Math.cos(rot), ax = fz, az = -fx, h = Math.max(0, (Math.round(len / STAND_GAP) - 1) * STAND_GAP) / 2;
  return standLine(id, [x - ax * h, z - az * h], [x + ax * h, z + az * h], fx, fz, fam, seed);
}

// a track's old one-piece grandstands (type 'grandstand') swapped for lines of the new ones; true if any were
export function swapGrandstands(track) {
  const old = (track.props || []).filter(p => p.type === 'grandstand');
  if (!old.length) return false;
  track.propLines = track.propLines || [];
  let id = Math.max(0, ...track.propLines.map(q => q.id));
  const add = [];
  old.forEach((p, n) => {
    const L = standLineAt(++id, p.x, p.z, p.rot || 0, p.len || 50, n % 2 ? 'stand_flags' : 'stand_roof', n);
    track.propLines.push(L.line); add.push(...L.props.map(q => (p.y != null ? { ...q, y: p.y } : q)));
  });
  track.props = track.props.filter(p => p.type !== 'grandstand').concat(add);
  return true;
}

// no grandstands on the map: one line of covered grandstands along the main straight, across from the pit lane
// (pitLane: [[x, z], ...] or null), behind where the barrier stands (env.runoff out) with room to walk
export function straightStands(track, T, pitLane, id = 1) {
  const N = T.N, wrap = (i) => ((i % N) + N) % N, straight = (i) => Math.abs(T.K[wrap(i)]) < 1 / 600;
  // the straight the start is on (else the longest one)
  const runAt = (i) => { let a = i, b = i; while (straight(a - 1) && i - a < N) a--; while (straight(b + 1) && b - i < N) b++; return [a, b]; };
  let [a, b] = straight(0) ? runAt(0) : [0, -1];
  if ((b - a) * T.ds < 120) for (let i = 0; i < N; i += 5) if (straight(i)) { const r = runAt(i); if (r[1] - r[0] > b - a) [a, b] = r; }
  const len = Math.min(110, (b - a) * T.ds - 40);
  if (len < 30) return null;
  // centred on the start line if it's on this straight, else the straight's middle
  let mid = a <= 0 && b >= 0 ? 0 : Math.round((a + b) / 2);
  const h = Math.round(len / 2 / T.ds); mid = Math.max(a + h + 4, Math.min(b - h - 4, mid));
  // which side the pits are: the other one
  let side = 1;
  if (pitLane && pitLane.length) {
    let s = 0; for (const [x, z] of pitLane) { const i = wrap(mid); if (Math.hypot(x - T.X[i], z - T.Z[i]) < 300) s += (x - T.X[i]) * T.RX[i] + (z - T.Z[i]) * T.RZ[i]; }
    side = s > 0 ? -1 : 1;
  }
  const at = (i) => { i = wrap(i); const o = side * (T.W[i] / 2 + (track.env.runoff ?? 14) + 10); return [T.X[i] + T.RX[i] * o, T.Z[i] + T.RZ[i] * o]; };
  const i0 = wrap(mid - h), i1 = wrap(mid + h);
  return standLine(id, at(i0), at(i1), -T.RX[wrap(mid)] * side, -T.RZ[wrap(mid)] * side, 'stand_roof', 0);
}
