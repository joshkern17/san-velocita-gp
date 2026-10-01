// Lap Review drawing: the speed trace (you against the comparison lap) with the time gap and your pedals under it,
// the circuit map coloured by where you lost and gained, and the coaching notes (telemetry.js analyze()).

const COL = { you: '#ffd66b', cmp: '#7fa8ff', loss: '#ff5a4a', gain: '#3ddc84', grid: 'rgba(255,255,255,.07)', text: '#9fb0c8', thr: '#3ddc84', brk: '#ff5a4a' };

export const fmtSpeed = (mps, units) => units === 'mph' ? `${Math.round(Math.abs(mps) * 2.23694)} mph` : `${Math.round(Math.abs(mps) * 3.6)} km/h`;
export const fmtGap = (s) => (s >= 0 ? '+' : '−') + Math.abs(s).toFixed(s !== 0 && Math.abs(s) < 10 ? 3 : 1);
// coaching text placeholders: {kmh:x} a speed (m/s), {m:x} metres, {s:x} seconds
export const tipText = (t, units) => t.replace(/\{(kmh|m|s):(-?[\d.e-]+)\}/g, (_, k, v) => {
  v = +v;
  return k === 'kmh' ? fmtSpeed(v, units) : k === 'm' ? `${Math.round(Math.abs(v))} m` : `${Math.abs(v).toFixed(1)} s`;
});

function fitCanvas(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
const niceStep = (range, target) => { const r = range / target, p = Math.pow(10, Math.floor(Math.log10(r))), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };

// o: { you, cmp (channel sets), an (analysis), focus (-1 = whole lap, else index into an.corners), ds, units }
export function drawChart(cv, o) {
  const { g, w, h } = fitCanvas(cv);
  const { you, cmp, an, ds, units } = o, n = an.n;
  const fc = o.focus >= 0 ? an.corners[o.focus] : null;
  // x range: the whole lap, or the focused corner's stretch
  let i0 = 0, i1 = n - 1;
  if (fc) { i0 = Math.max(0, fc.from - Math.round(20 / ds)); i1 = Math.min(n - 1, fc.to + Math.round(20 / ds)); }
  const L = 46, R = 14, top = 8, sH = h * 0.56, dT = top + sH + 12, dH = h * 0.2, pT = dT + dH + 10, pH = h - pT - 18;
  const X = (i) => L + (i - i0) / Math.max(1, i1 - i0) * (w - L - R);
  cv._xr = { i0, i1, L, R, w }; // (for chartHit)
  const kv = units === 'mph' ? 2.23694 : 3.6;
  let vmax = 0, vmin = Infinity;
  for (let i = i0; i <= i1; i++) { vmax = Math.max(vmax, you.v[i], cmp.v[i]); vmin = Math.min(vmin, you.v[i], cmp.v[i]); }
  vmax *= kv; vmin *= kv;
  const lo = fc ? Math.max(0, vmin - 15) : 0, hi = vmax + 10;
  const Y = (v) => top + sH - (v * kv - lo) / (hi - lo) * sH;
  g.font = '11px Anton, sans-serif'; g.textBaseline = 'middle';

  // corner stretches: alternate shading, number at the apex (the focused one lit)
  an.corners.forEach((c, k) => {
    if (c.to < i0 || c.from > i1) return;
    const a = X(Math.max(i0, c.from)), b = X(Math.min(i1, c.to));
    if (k % 2 === 0 || k === o.focus) { g.fillStyle = k === o.focus ? 'rgba(255,214,107,.06)' : 'rgba(255,255,255,.025)'; g.fillRect(a, top, b - a, h - top - 18); }
    if (c.apex >= i0 && c.apex <= i1) {
      g.fillStyle = k === o.focus ? COL.you : 'rgba(255,255,255,.45)'; g.textAlign = 'center';
      g.fillText('T' + c.n, X(c.apex), top + 8);
    }
  });
  // speed grid + labels
  const st = niceStep(hi - lo, 4);
  g.textAlign = 'right';
  for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) {
    const y = top + sH - (v - lo) / (hi - lo) * sH;
    g.strokeStyle = COL.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
    g.fillStyle = COL.text; g.fillText(String(Math.round(v)), L - 8, y);
  }
  const line = (ch, col, lw) => {
    g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round'; g.beginPath();
    const step = Math.max(1, Math.floor((i1 - i0) / (w * 1.5)));
    for (let i = i0; i <= i1; i += step) { const x = X(i), y = Y(ch.v[i]); i === i0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  };
  line(cmp, COL.cmp, 1.6);
  line(you, COL.you, 2.2);
  // the distance boards in view (a corner's close-up): a faint line and the number, where you'd see them from the car
  if (fc && o.boards) {
    g.font = '10px Anton, sans-serif'; g.textAlign = 'center';
    for (const b of o.boards) {
      if (b.i < i0 || b.i > i1) continue;
      const x = X(b.i);
      g.strokeStyle = 'rgba(242,239,230,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, top + 16); g.lineTo(x, top + sH); g.stroke();
      g.fillStyle = '#f2efe6'; g.fillRect(x - 11, top + sH - 14, 22, 13); g.fillStyle = '#111'; g.fillText(String(b.dist), x, top + sH - 7);
    }
    g.font = '11px Anton, sans-serif';
  }
  // braking points in the focused corner: where each lap started braking
  if (fc) {
    for (const [d, col] of [[fc.them, COL.cmp], [fc.you, COL.you]]) {
      if (d.brakeAt < 0) continue;
      const x = X(d.brakeAt); g.strokeStyle = col; g.setLineDash([4, 4]); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, top + 16); g.lineTo(x, top + sH); g.stroke(); g.setLineDash([]);
    }
  }
  // time gap: above the line you're losing (red), below gaining (green), from the start of the range
  const d0 = an.delta[i0];
  let dm = 0.05; for (let i = i0; i <= i1; i++) dm = Math.max(dm, Math.abs(an.delta[i] - d0));
  const DY = (d) => dT + dH / 2 - (d - d0) / dm * (dH / 2 - 2);
  g.strokeStyle = COL.grid; g.beginPath(); g.moveTo(L, dT + dH / 2); g.lineTo(w - R, dT + dH / 2); g.stroke();
  for (const [sign, col] of [[1, COL.loss], [-1, COL.gain]]) {
    g.fillStyle = col; g.globalAlpha = 0.55; g.beginPath(); g.moveTo(X(i0), dT + dH / 2);
    for (let i = i0; i <= i1; i++) { const d = an.delta[i] - d0; g.lineTo(X(i), DY(d0 + (sign * d > 0 ? d : 0))); }
    g.lineTo(X(i1), dT + dH / 2); g.closePath(); g.fill(); g.globalAlpha = 1;
  }
  const dEnd = fc ? fc.loss : an.total; // (the same figures as the summary: the corner's stretch, or the whole lap to the line)
  g.fillStyle = COL.text; g.textAlign = 'right'; g.fillText('GAP', L - 8, dT + dH / 2);
  g.font = '17px VT323, monospace'; g.fillStyle = dEnd > 0 ? COL.loss : COL.gain; g.textAlign = 'right'; g.fillText(fmtGap(dEnd) + ' s', w - R - 2, dT + 8);
  g.font = '11px Anton, sans-serif';
  // pedals: your throttle up from the middle (green), brake down (red); the comparison lap's brake as a blue line
  const mid = pT + pH / 2;
  g.fillStyle = COL.text; g.textAlign = 'right'; g.fillText('PEDALS', L - 8, mid);
  const bw = Math.max(1, (w - L - R) / Math.max(1, i1 - i0) + 0.5);
  for (let i = i0; i <= i1; i++) {
    const x = X(i);
    if (you.thr[i] > 0.02) { g.fillStyle = COL.thr; g.globalAlpha = 0.7; g.fillRect(x, mid - you.thr[i] * pH / 2, bw, you.thr[i] * pH / 2); }
    if (you.brk[i] > 0.02) { g.fillStyle = COL.brk; g.globalAlpha = 0.85; g.fillRect(x, mid, bw, you.brk[i] * pH / 2); }
  }
  g.globalAlpha = 1; g.strokeStyle = COL.cmp; g.lineWidth = 1.2; g.beginPath();
  for (let i = i0; i <= i1; i++) { const y = mid + cmp.brk[i] * pH / 2; i === i0 ? g.moveTo(X(i), y) : g.lineTo(X(i), y); }
  g.stroke();
  // distance along the bottom
  g.fillStyle = COL.text; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const span = (i1 - i0) * ds, dst = niceStep(span, 6);
  for (let m = Math.ceil(i0 * ds / dst) * dst; m <= i1 * ds; m += dst) g.fillText(m >= 1000 ? (m / 1000).toFixed(m % 1000 ? 1 : 0) + ' km' : Math.round(m) + ' m', X(m / ds), h - 3);
  // the cursor (hover / scrub): a line through all three strips, dots on both speed traces
  const cu = o.cursor;
  if (cu >= i0 && cu <= i1) {
    const x = X(cu);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, top); g.lineTo(x, h - 18); g.stroke();
    for (const [ch, col] of [[cmp, COL.cmp], [you, COL.you]]) { g.fillStyle = '#000'; g.beginPath(); g.arc(x, Y(ch.v[cu]), 5, 0, Math.PI * 2); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, Y(ch.v[cu]), 3.5, 0, Math.PI * 2); g.fill(); }
  }
}

// the circuit, each corner's stretch coloured by the time lost (red) or gained (green) there; focus: one stretch lit
export function drawMap(cv, T, an, focus, cursor = -1, you = null) {
  const { g, w, h } = fitCanvas(cv);
  const n = an.n;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, T.X[i]); x1 = Math.max(x1, T.X[i]); z0 = Math.min(z0, T.Z[i]); z1 = Math.max(z1, T.Z[i]); }
  const pad = 20, k = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (z1 - z0 || 1));
  const ox = (w - (x1 - x0) * k) / 2, oz = (h - (z1 - z0) * k) / 2;
  const P = (i) => [ox + (T.X[i] - x0) * k, oz + (T.Z[i] - z0) * k];
  const path = (a, b) => { g.beginPath(); for (let i = a; i <= b; i++) { const [x, y] = P(Math.min(i, n - 1)); i === a ? g.moveTo(x, y) : g.lineTo(x, y); } if (!T.open && b >= n - 1) { const [x, y] = P(0); g.lineTo(x, y); } };
  g.lineCap = 'round'; g.lineJoin = 'round';
  path(0, n - 1); g.strokeStyle = '#000'; g.lineWidth = 9; g.stroke(); g.strokeStyle = '#2b3446'; g.lineWidth = 5; g.stroke();
  const colFor = (loss) => { const a = Math.min(1, Math.abs(loss) / 0.25); return loss > 0 ? `rgba(255,90,74,${0.25 + 0.75 * a})` : `rgba(61,220,132,${0.25 + 0.75 * a})`; };
  an.corners.forEach((c, i) => {
    path(c.from, c.to);
    g.strokeStyle = focus >= 0 && i !== focus ? 'rgba(255,255,255,.08)' : colFor(c.loss); g.lineWidth = i === focus ? 7 : 5; g.stroke();
  });
  // start / finish
  const [sx, sy] = P(0); g.fillStyle = '#fff'; g.fillRect(sx - 3, sy - 3, 6, 6);
  // the cursor: where you were
  if (cursor >= 0) { const [cx, cy] = P(cursor); g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffd66b'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill(); }
  // corner numbers, pushed off the track to the outside
  g.font = '10px Anton, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  an.corners.forEach((c, i) => {
    const [x, y] = P(c.apex), nx = -T.RX[c.apex] * c.dir, nz = -T.RZ[c.apex] * c.dir;
    const lx = x + nx * 13, ly = y + nz * 13;
    g.fillStyle = i === focus ? '#ffd66b' : 'rgba(10,14,22,.85)'; g.beginPath(); g.arc(lx, ly, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = i === focus ? '#1a1204' : '#dfe7f5'; g.fillText(String(c.n), lx, ly + 0.5);
  });
}

// the notes beside the map: the corners with the most time in them, or one corner in detail
export function notesHtml(an, focus, units, cmpName, zones = null) {
  const ti = turnIns(an, zones);
  const loss = (s) => `<em class="${s > 0 ? 'bad' : 'good'}">${fmtGap(s)}</em>`;
  if (focus < 0) {
    const worst = [...an.corners].filter(c => c.loss > 0.02).sort((a, b) => b.loss - a.loss).slice(0, 3);
    if (!worst.length) return `<div class="panel-title">WHERE THE TIME WENT</div><p class="rv-empty">You matched or beat ${cmpName} everywhere. Try a quicker comparison.</p>`;
    return `<div class="panel-title">WHERE THE TIME WENT</div>` + worst.map(c =>
      `<div class="rv-card"><div class="rv-card-h"><b>TURN ${c.n}</b>${loss(c.loss)}</div><p>${tipText(c.tips[0]?.text || '', units)}</p></div>`).join('');
  }
  const c = an.corners[focus], y = c.you, r = c.them, sp = (v) => fmtSpeed(v, units);
  const m = (v) => v == null ? '&mdash;' : Math.round(v) + ' m';
  const row = (k, a, b) => `<tr><td>${k}</td><td class="y">${a}</td><td class="c">${b}</td></tr>`;
  // (metres before the turn-in, the way the distance boards count)
  const brakeAt = (d) => d.brakeAt < 0 ? '&mdash;' : `${Math.round(Math.max(0, ti[focus] - d.brakeAt) * an.ds)} m out`;
  return `<div class="panel-title rv-title-row"><span>TURN ${c.n}</span>${loss(c.loss)}</div>
    <table class="rv-stats"><tr><th></th><th class="y">YOU</th><th class="c">${cmpName.toUpperCase()}</th></tr>
    ${row('Braking', brakeAt(y), brakeAt(r))}
    ${row('Turn-in', sp(y.entryV), sp(r.entryV))}${row('Slowest', sp(y.minV), sp(r.minV))}${row('Exit', sp(y.exitV), sp(r.exitV))}</table>
    ${c.tips.map(t => `<p class="rv-tip">${tipText(t.text, units)}</p>`).join('')}`;
}

// ---------------- the line map: your line and the comparison's on the real road, coloured by what the pedals did ----------------
const PEDAL = { brake: '#ff5a4a', throttle: '#3ddc84', part: '#a6e37f', coast: '#e8ecf4' };
export const pedalOf = (ch, i) => ch.brk[i] > 0.1 ? 'brake' : ch.thr[i] > 0.6 ? 'throttle' : ch.thr[i] > 0.1 ? 'part' : 'coast';
const posOf = (T, ch, i) => [T.X[i] + T.RX[i] * ch.s[i], T.Z[i] + T.RZ[i] * ch.s[i]];

// the stretch of lap a view shows: whole lap, or a corner with some run-up and run-off
export function lineRange(an, focus, ds) {
  if (focus < 0) return [0, an.n - 1];
  // (the braking zone to the exit: tight enough to tell the two lines apart)
  const c = an.corners[focus], bp = [c.you.brakeAt, c.them.brakeAt].filter(i => i >= 0), lo = Math.min(c.entry, ...bp) - Math.round(40 / ds);
  return [Math.max(c.from, lo), Math.min(c.to, c.exit + Math.round(70 / ds))];
}
// o: { T, you, cmp, an, focus, view: { k, cx, cz } | null (fit the range), cursor }. Returns the view it drew.
export function drawLineMap(cv, o) {
  const { g, w, h } = fitCanvas(cv);
  const { T, you, cmp, an } = o, n = an.n;
  const [i0, i1] = lineRange(an, o.focus, T.ds);
  let view = o.view;
  if (!view) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = i0; i <= i1; i++) { const W = T.W[i] / 2 + 4; x0 = Math.min(x0, T.X[i] - W); x1 = Math.max(x1, T.X[i] + W); z0 = Math.min(z0, T.Z[i] - W); z1 = Math.max(z1, T.Z[i] + W); }
    const k = Math.min((w - 40) / (x1 - x0 || 1), (h - 40) / (z1 - z0 || 1));
    view = { k, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
  }
  const k = view.k, S = (x, z) => [w / 2 + (x - view.cx) * k, h / 2 + (z - view.cz) * k];
  cv._xf = { view, S, T, you, n, w, h };
  g.lineCap = 'round'; g.lineJoin = 'round';
  // the road: a band as wide as the track, its edges once you're zoomed in
  const step = Math.max(1, Math.floor(1.5 / k)); // (about a point every pixel and a half)
  const poly = (fn) => { g.beginPath(); let first = true; for (let i = 0; i < n; i += step) { const [x, y] = fn(i); if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y); } if (!T.open) { const [x, y] = fn(0); g.lineTo(x, y); } };
  poly(i => S(T.X[i], T.Z[i]));
  g.strokeStyle = '#000'; g.lineWidth = Math.max(7, (T.W[0] + 1.5) * k); g.stroke();
  g.strokeStyle = '#262e3d'; g.lineWidth = Math.max(5, T.W[0] * k); g.stroke();
  if (k > 1.2) {
    for (const side of [1, -1]) {
      poly(i => S(T.X[i] + T.RX[i] * side * T.W[i] / 2, T.Z[i] + T.RZ[i] * side * T.W[i] / 2));
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2; g.stroke();
    }
  }
  // corner numbers, off to the outside
  g.font = '11px Anton, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  an.corners.forEach((c, idx) => {
    const off = T.W[c.apex] / 2 + Math.max(6, 16 / k);
    const [x, y] = S(T.X[c.apex] - T.RX[c.apex] * c.dir * off, T.Z[c.apex] - T.RZ[c.apex] * c.dir * off);
    if (x < -20 || y < -20 || x > w + 20 || y > h + 20) return;
    g.fillStyle = idx === o.focus ? '#ffd66b' : 'rgba(10,14,22,.9)'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = idx === o.focus ? '#1a1204' : '#dfe7f5'; g.fillText(String(c.n), x, y + 0.5);
  });
  // a line in runs of one pedal colour, over a halo that says whose it is
  const lineOf = (ch, halo, lw, dash) => {
    const from = o.focus >= 0 ? i0 : 0, to = o.focus >= 0 ? i1 : n - 1;
    const path = (a, b) => { g.beginPath(); for (let i = a; i <= b; i++) { const [x, y] = S(...posOf(T, ch, i)); i === a ? g.moveTo(x, y) : g.lineTo(x, y); } };
    path(from, to); g.setLineDash([]); g.strokeStyle = halo; g.lineWidth = lw + 3; g.globalAlpha = 0.9; g.stroke(); g.globalAlpha = 1;
    g.setLineDash(dash); g.lineWidth = lw;
    let a = from;
    for (let i = from + 1; i <= to + 1; i++) {
      if (i <= to && pedalOf(ch, i) === pedalOf(ch, a)) continue;
      path(a, Math.min(i, to)); g.strokeStyle = PEDAL[pedalOf(ch, a)]; g.stroke();
      a = i;
    }
    g.setLineDash([]);
  };
  drawBoardsOnMap(g, S, T, o.boards, k);
  const lw = Math.max(2, Math.min(5, 0.55 * k));
  lineOf(cmp, '#2f5fd0', lw * 0.8, k > 1.2 ? [6, 4] : []);
  lineOf(you, '#8a6410', lw, []);
  // start / finish
  { const [x, y] = S(T.X[0], T.Z[0]); g.fillStyle = '#fff'; g.fillRect(x - 3, y - 3, 6, 6); }
  // the cursor: where you and the comparison were at that point of the lap
  if (o.cursor >= 0) {
    const a = S(...posOf(T, you, o.cursor)), b = S(...posOf(T, cmp, o.cursor));
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
    for (const [p, col] of [[b, '#7fa8ff'], [a, '#ffd66b']]) { g.fillStyle = '#000'; g.beginPath(); g.arc(p[0], p[1], 6.5, 0, Math.PI * 2); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(p[0], p[1], 4.5, 0, Math.PI * 2); g.fill(); }
  }
  return view;
}
// the lap sample nearest a point on the line map (your line), or -1 if nothing's within reach
export function lineMapHit(cv, mx, my) {
  const f = cv._xf; if (!f) return -1;
  let best = -1, bd = 26 * 26;
  for (let i = 0; i < f.n; i++) { const [x, y] = f.S(f.T.X[i] + f.T.RX[i] * f.you.s[i], f.T.Z[i] + f.T.RZ[i] * f.you.s[i]); const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
// zoom the line map about a screen point (wheel), or pan it (drag)
export function lineMapZoom(cv, view, mx, my, factor) {
  const f = cv._xf; if (!f) return view;
  const k = Math.max(0.05, Math.min(40, view.k * factor));
  const wx = view.cx + (mx - f.w / 2) / view.k, wz = view.cz + (my - f.h / 2) / view.k;
  return { k, cx: wx - (mx - f.w / 2) / k, cz: wz - (my - f.h / 2) / k };
}
export const lineMapPan = (view, dx, dy) => ({ k: view.k, cx: view.cx - dx / view.k, cz: view.cz - dy / view.k });
// the lap sample under a point on the speed chart
export function chartHit(cv, mx) {
  const r = cv._xr; if (!r || mx < r.L || mx > r.w - r.R) return -1;
  return Math.round(r.i0 + (mx - r.L) / (r.w - r.L - r.R) * (r.i1 - r.i0));
}

// Each corner's turn-in, measured the way the track's distance boards are: where a braking zone has boards, their
// turn-in (so "50 m to Turn 1" is exactly at the 50 board); elsewhere the corner's own start.
export function turnIns(an, zones) {
  return an.corners.map(c => { const z = zones && zones.list.find(g => g.entry >= c.from && g.entry <= c.to); return z ? z.entry : c.entry; });
}
// where point i is against the corners: the metres to the corner coming up (to its turn-in), or how far into it.
// On the approach to a braking zone with boards, that's the distance to the turn-in the boards count down to, so
// the 50 board reads "50 m to" even with a kink or the tail of the last bend in between.
export function cornerWhere(i, an, T, zones) {
  const N = T.N, n = an.n, fwd = (a, b) => (T.open ? b - a : ((b - a) % N + N) % N) * T.ds, m = Math.round;
  const named = (e) => an.corners.find(c => e >= c.from && e <= c.to) || an.corners.find(c => c.entry >= e) || an.corners[0];
  let zone = null, zd = Infinity;
  for (const g of (zones ? zones.list : [])) {
    if (g.entry >= n) continue;
    const d = fwd(i, g.entry), lead = fwd(g.list[0].i, g.entry) + 60;
    if (d >= 0 && d <= lead && d < zd) { zd = d; zone = g; }
  }
  if (zone) return { text: `${m(zd)} m to Turn ${named(zone.entry).n}` };
  const ti = turnIns(an, zones);
  const k = an.corners.findIndex((c, j) => i >= ti[j] && i <= c.exit);
  if (k >= 0) return { text: `Turn ${an.corners[k].n} &middot; ${m((i - ti[k]) * T.ds)} m past turn-in` };
  let next = -1, best = Infinity;
  ti.forEach((e, j) => { const d = fwd(i, e); if (d >= 0 && d < best) { best = d; next = j; } });
  return next < 0 ? null : { text: `${m(best)} m to Turn ${an.corners[next].n}` };
}

// what the tooltip says about one point of the lap
export function popHtml(i, o) {
  const { T, you, cmp, an, units, cmpName } = o;
  const bw = cornerWhere(i, an, T, o.zones);
  const c = an.corners.find(x => i >= x.from && i <= x.to);
  const sp = (v) => fmtSpeed(v, units);
  const ped = (ch) => { const p = pedalOf(ch, i); return p === 'brake' ? `<i class="pb">BRAKE ${Math.round(ch.brk[i] * 100)}%</i>` : p === 'coast' ? '<i class="pc">COAST</i>' : `<i class="pt">THROTTLE ${Math.round(ch.thr[i] * 100)}%</i>`; };
  // your line against theirs: toward the inside of the bend, or out wide
  let line = '';
  const ds = you.s[i] - cmp.s[i];
  if (Math.abs(ds) > 0.3) {
    const a = Math.max(0, i - 8), b = Math.min(an.n - 1, i + 8);
    const turn = (T.FX[b] - T.FX[a]) * T.RX[i] + (T.FZ[b] - T.FZ[a]) * T.RZ[i]; // > 0: bending toward +R
    line = Math.abs(turn) > 0.02 && c && i >= c.entry - 10 && i <= c.exit + 10
      ? `${Math.abs(ds).toFixed(1)} m ${ds * Math.sign(turn) > 0 ? 'tighter' : 'wider'} than ${cmpName}`
      : `${Math.abs(ds).toFixed(1)} m off ${cmpName}'s line`;
  }
  const gapC = c ? an.delta[i] - an.delta[c.from] : null;
  const m = i * T.ds;
  return `<div class="pp-h">${m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m'}${c ? ` &middot; TURN ${c.n}` : ''}</div>
    ${bw ? `<div class="pp-b">${bw.text}</div>` : ''}
    <div class="pp-r y"><b>YOU</b><span>${sp(you.v[i])}</span><span>G${Math.max(1, Math.round(you.gear[i] || 1))}</span>${ped(you)}</div>
    <div class="pp-r c"><b>${cmpName.toUpperCase()}</b><span>${sp(cmp.v[i])}</span><span>${cmp.gear[i] ? 'G' + Math.round(cmp.gear[i]) : ''}</span>${ped(cmp)}</div>
    <div class="pp-f">${gapC != null ? `<span class="${gapC > 0 ? 'bad' : 'good'}">${fmtGap(gapC)} s</span> in this corner &middot; ` : ''}<span class="${an.delta[i] > 0 ? 'bad' : 'good'}">${fmtGap(an.delta[i])} s</span> on the lap${line ? `<br>${line}` : ''}</div>`;
}

// ---------------- the distance boards (150 / 100 / 50 m before a braking zone's turn-in) ----------------
// boards: world.boards [{ i, dist, entry, min }], grouped per braking zone: the Lap Review measures its distances to a
// corner from the same turn-in the boards count down to (see turnIns)
export function boardZones(boards, T) {
  const z = new Map();
  for (const b of boards || []) { const g = z.get(b.entry) || { entry: b.entry, min: b.min, list: [] }; g.list.push(b); z.set(b.entry, g); }
  const N = T.N, fwd = (a, b) => (T.open ? b - a : ((b - a) % N + N) % N) * T.ds;
  for (const g of z.values()) g.list.sort((a, b) => fwd(a.i, g.entry) < fwd(b.i, g.entry) ? 1 : -1); // (150 first)
  return { list: [...z.values()], fwd };
}
// board markers: on the line map (beside the road, on the outside) and as ticks on the chart
export function drawBoardsOnMap(g, S, T, boards, k) {
  if (!boards || k < 0.6) return;
  g.font = '9px Anton, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const b of boards) {
    const side = T.K[b.min] > 0 ? -1 : 1, off = T.W[b.i] / 2 + Math.max(3, 9 / k);
    const [x, y] = S(T.X[b.i] + T.RX[b.i] * side * off, T.Z[b.i] + T.RZ[b.i] * side * off);
    const [ex, ey] = S(T.X[b.i] + T.RX[b.i] * side * T.W[b.i] / 2, T.Z[b.i] + T.RZ[b.i] * side * T.W[b.i] / 2);
    g.strokeStyle = 'rgba(242,239,230,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(ex, ey); g.lineTo(x, y); g.stroke();
    g.fillStyle = '#f2efe6'; g.fillRect(x - 10, y - 6, 20, 12); g.strokeStyle = '#111'; g.lineWidth = 1.5; g.strokeRect(x - 10, y - 6, 20, 12);
    g.fillStyle = '#111'; g.fillText(String(b.dist), x, y + 0.5);
  }
}
