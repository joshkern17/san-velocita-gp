// Circuit Designer: what's wrong with the track, shown where it is. Each problem is a stretch of road drawn red on the
// map with a numbered pin; the status in the top bar says "Ready to race" or how many there are, and selecting it
// jumps from one to the next with what to do about it. A flat crossing stops Race It (cars would drive through each
// other); the rest are warnings. Test Drive always goes.
import { sfx } from './audio.js';

const TIGHT = 14, STEEP = 0.2, NARROW = 7;

// track, T (sampleTrack), A (analyzeTrack), pit (buildPitLane): [{ kind, block, a, b (sample run, b may pass N on a
// loop), i (its middle), whole (no one place), text }]
export function findProblems(track, T, A, pit) {
  const out = [], N = T.N, upto = T.open ? T.finish + 1 : N;
  const runs = (flag, min = 1) => {
    const r = []; let s = -1;
    for (let i = 0; i < upto; i++) { if (flag(i)) { if (s < 0) s = i; } else if (s >= 0) { r.push([s, i - 1]); s = -1; } }
    if (s >= 0) r.push([s, upto - 1]);
    if (!T.open && r.length > 1 && r[0][0] === 0 && r[r.length - 1][1] === upto - 1) { const last = r.pop(); r[0] = [last[0], r[0][1] + N]; } // (one run across the start line)
    return r.filter(([a, b]) => b - a + 1 >= min);
  };
  for (const [a, b] of runs(i => A.LIFT[i] > 0))
    out.push({ kind: 'cross', block: true, a, b, text: 'Two stretches of road cross on the flat: cars would drive through each other. Raise one 5 m or more in the elevation profile for a bridge, or move them apart.' });
  for (const [a, b] of runs(i => Math.abs(T.K[i]) > 1 / TIGHT, 2)) {
    let r = Infinity; for (let k = a; k <= b; k++) r = Math.min(r, 1 / Math.abs(T.K[k % N]));
    out.push({ kind: 'tight', a, b, text: `A corner with a ${Math.round(r)} m radius: tighter than ${TIGHT} m, most cars can't get round it. Spread its points or open out its curve handles.` });
  }
  const w = Math.max(1, Math.round(10 / T.ds));
  for (const [a, b] of runs(i => Math.abs(T.Y[(i + w) % N] - T.Y[i]) / (w * T.ds) > STEEP, 2))
    out.push({ kind: 'steep', a, b, text: `Steeper than ${Math.round(STEEP * 100)}%: cars will bottom out and struggle up it. Even it out in the elevation profile.` });
  for (const [a, b] of runs(i => T.W[i] < NARROW, 2))
    out.push({ kind: 'narrow', a, b, text: `Narrower than ${NARROW} m: no room to pass. Widen the points here.` });
  // (free barriers stay where they're put: a road moved under one leaves it in the way)
  if (A.free) {
    const on = new Uint8Array(N);
    for (const { line } of A.free.lines) for (const [x, z] of line) A.hash.query(x, z, 30, (j) => { if (!A.BRIDGE[j] && Math.hypot(x - T.X[j], z - T.Z[j]) < T.W[j] / 2 + 0.3) on[j] = 1; });
    for (const [a, b] of runs(i => on[i]))
      out.push({ kind: 'barrier', a, b, text: 'A barrier stands on the road here: move it off (Trackside > Barriers), or open a gap in it with X.' });
  }
  if (track.env.pits !== false && !pit && !T.open)
    out.push({ kind: 'pit', a: 0, b: 0, text: 'No room for a pit lane by the start: give the start straight more space, or turn pits off (Circuit tab).' });
  if ((T.raceL ?? T.L) < (T.open ? 400 : 800))
    out.push({ kind: 'short', a: 0, b: 0, whole: true, text: T.open ? 'A short run (under 400 m): draw a longer road.' : 'A short circuit (under 800 m): draw a bigger loop.' });
  for (const p of out) p.i = Math.round((p.a + p.b) / 2) % N;
  // (one place, one problem: a crossing is met twice round the lap, and a run can break either side of the start line)
  const near = (p, q) => Math.hypot(T.X[p.i] - T.X[q.i], T.Z[p.i] - T.Z[q.i]) < 40;
  return out.filter((p, k) => p.whole || !out.some((q, j) => j < k && q.kind === p.kind && !q.whole && near(p, q)));
}

export function installCheck(Editor) {
  Object.assign(Editor.prototype, {
    // (after every recompute: the list, the top bar's status)
    checkTrack() {
      this.problems = this.T && this.A ? findProblems(this.track, this.T, this.A, this.pit) : [];
      if (this.probAt >= this.problems.length) this.probAt = -1;
      this.renderCheck();
    },
    blocking() { return (this.problems || []).filter(p => p.block); },
    renderCheck() {
      const el = document.getElementById('ed-check'); if (!el) return;
      const P = this.problems || [], blocks = P.filter(p => p.block).length;
      el.className = 'ed-check ' + (!this.T ? 'none' : !P.length ? 'ok' : blocks ? 'bad' : 'warn');
      el.innerHTML = !this.T ? 'No track yet' : !P.length ? '&#10003; Ready to race' : `${blocks ? '&#9888;' : '!'} ${P.length} problem${P.length === 1 ? '' : 's'}`;
      el.title = !P.length ? 'Nothing in the way of a race.' : 'Select to go to each one, with what to do about it.';
    },
    // to the next problem: the map on it, what it is in the toast and the stats box
    nextProblem() {
      const P = this.problems || []; if (!P.length) { sfx.select(); return this.toast(this.T ? 'NOTHING TO FIX: READY TO RACE' : 'NO TRACK YET'); }
      this.probAt = ((this.probAt ?? -1) + 1) % P.length;
      const p = P[this.probAt], T = this.T;
      if (!p.whole) { this.view.cx = T.X[p.i]; this.view.cz = T.Z[p.i]; this.view.scale = Math.max(this.view.scale, 1.2); }
      sfx.move(); this.dirty = true;
      this.toast(`${this.probAt + 1} of ${P.length}: ${p.text}`, 5200);
      this.refreshStats();
    },
    // red over each problem's stretch, a numbered pin beside it (the one being looked at stronger)
    drawProblems(c) {
      const P = this.problems, T = this.T; if (!P || !P.length || !T) return;
      const sc = this.view.scale, N = T.N;
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      P.forEach((p, k) => {
        if (p.whole) return;
        const on = k === this.probAt;
        c.strokeStyle = p.block ? `rgba(255,45,111,${on ? 0.75 : 0.5})` : `rgba(255,194,26,${on ? 0.7 : 0.42})`;
        c.lineWidth = Math.max(6, (T.W[p.i] + 6) * sc);
        c.beginPath();
        for (let j = p.a; j <= Math.max(p.b, p.a + 1); j++) { const i = j % N, [x, y] = this.w2s(T.X[i], T.Z[i]); j === p.a ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.stroke();
        const off = T.W[p.i] / 2 + 14, [px, py] = this.w2s(T.X[p.i] + T.RX[p.i] * off, T.Z[p.i] + T.RZ[p.i] * off), r = on ? 13 : 11;
        c.fillStyle = p.block ? '#ff2d6f' : '#ffc21a'; c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#05060c'; c.font = `bold ${on ? 14 : 12}px Arimo`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(k + 1), px, py + 1);
      });
      c.restore();
    },
  });
}
