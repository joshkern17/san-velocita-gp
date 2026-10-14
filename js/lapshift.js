// Moving a circuit's start/finish moves where its lap distances count from, and everything placed by them (barriers,
// curbs, walls, the pit lane, real corner names: m along the lap) would slide round with it. Before the start moves,
// lapShift(T, track, ns) puts every one of them where it was, counted from node ns instead.
// T: sampleTrack of the track as it is (the old start).
const norm = (d, L) => ((d % L) + L) % L;

// m along the lap (from the old start) of node ns (n nodes): where T.NODE (node index + how far to the next) passes it
export function nodeD(T, ns, n) {
  for (let i = 0; i < T.N; i++) {
    const a = T.NODE[i]; let b = i + 1 < T.N ? T.NODE[i + 1] : n + T.NODE[0];
    if (b < a) b += n;
    for (const m of [ns, ns + n]) if (a <= m && m < b) return T.D[i] + T.ds * (m - a) / (b - a);
  }
  return 0;
}

export function lapShift(T, track, ns) {
  if (track.open || !T || T.open) return;
  const L = T.L, d0 = nodeD(T, ns, track.points.length), sh = (d) => +norm(d - d0, L).toFixed(1);
  const dr = track.dress;
  if (dr) {
    for (const b of dr.barriers || []) b.pts = b.pts.map(p => [sh(p[0]), ...p.slice(1)]);
    for (const k of dr.kerbs || []) { k.a = sh(k.a); k.b = sh(k.b); }
    for (const w of dr.walls || []) { w.a = sh(w.a); w.b = sh(w.b); }
    if (dr.pit) {
      dr.pit.pts = dr.pit.pts.map(p => [sh(p[0]), ...p.slice(1)]);
      for (const k of ['main', 'wall']) if (Array.isArray(dr.pit[k])) dr.pit[k] = dr.pit[k].map(sh);
    }
  }
  // (a name the new line falls inside is split in two: up to the line, and on from it)
  if (track.real && track.real.names) track.real.names = track.real.names.flatMap(n => {
    const from = sh(n.from), to = sh(n.to);
    return to >= from ? [{ ...n, from, to }] : [{ ...n, from, to: +L.toFixed(1) }, { ...n, from: 0, to }];
  }).sort((a, b) => a.from - b.from).reduce((out, n) => { // (and one cut in two before, now in one piece: joined)
    const l = out[out.length - 1];
    if (l && l.name === n.name && n.from - l.to < 5) l.to = Math.max(l.to, n.to); else out.push(n);
    return out;
  }, []);
}
