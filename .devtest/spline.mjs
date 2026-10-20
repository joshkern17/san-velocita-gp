// dev: js/spline.js measured on every built-in and real circuit (no browser): points before -> after Simplify, how
// far the line moves (worst, metres), the worst height change, the lap length change; and a drawn loop's points.
//   node --import ./tools/tracks/three-hook.mjs .devtest/spline.mjs [tol=1.5]
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = await import(join(ROOT, 'js/track.js')), S = await import(join(ROOT, 'js/spline.js'));
const tol = process.argv[2] ? +process.argv[2] : undefined; // (else simplifyTrack's own)
const tracks = [...T.presetTracks().map(t => [t.name, t])];
for (const f of readdirSync(join(ROOT, 'tracks/real')).filter(f => f.endsWith('.json') && f !== 'index.json')) {
  try { const t = JSON.parse(readFileSync(join(ROOT, 'tracks/real', f))); if (t.points) tracks.push([t.name || f, t]); } catch (e) {}
}
const lenOf = (D) => D.reduce((s, d, i) => i ? s + Math.hypot(d.x - D[i - 1].x, d.z - D[i - 1].z) : 0, 0);
// the refit as the game draws it against the road it replaces, every 2 m of that road: the distance to the refit's
// line itself (its nearest stretch between samples, followed along from the last match so a crossover's other level
// isn't picked), and its height / width / banking there
function compare(A, B, open) {
  const n = B.length; let wp = 0, we = 0, ww = 0, wb = 0, k = 0, f = 0;
  for (let i = 0; i < A.length; i++) {
    const g = k; let best = 1e18; // (followed along from the last match: never the other level of a crossover)
    for (let o = -8; o <= 40; o++) {
      const j = open ? g + o : ((g + o) % n + n) % n, j2 = open ? j + 1 : (j + 1) % n; if (j < 0 || j2 >= n) continue;
      const ax = B[j2].x - B[j].x, az = B[j2].z - B[j].z, l2 = ax * ax + az * az || 1;
      const u = Math.max(0, Math.min(1, ((A[i].x - B[j].x) * ax + (A[i].z - B[j].z) * az) / l2));
      const d = (A[i].x - B[j].x - ax * u) ** 2 + (A[i].z - B[j].z - az * u) ** 2; if (d < best) { best = d; k = j; f = u; }
    }
    const q = B[k], r = B[open ? k + 1 : (k + 1) % n] || q, at = (key) => q[key] + (r[key] - q[key]) * f;
    wp = Math.max(wp, Math.sqrt(best)); we = Math.max(we, Math.abs(A[i].e - at('e'))); ww = Math.max(ww, Math.abs(A[i].w - at('w'))); wb = Math.max(wb, Math.abs(A[i].b - at('b')));
  }
  return { wp, we, ww, wb };
}
const GATE = { line: 0.35, height: 0.12, width: 0.3, bank: 0.6, lap: 0.5 };
let worstAll = 0, bad = 0;
for (const [name, t0] of tracks) {
  const t = { ...t0, points: t0.points.map(p => ({ w: 13, e: 0, b: 0, ...p })) };
  const A = T.densePath(t, 2);
  const pts = S.simplifyTrack(t, T.densePath, tol);
  if (!pts) { console.log(`${name.padEnd(28)} ${String(t.points.length).padStart(4)} -> (no fewer)`); continue; }
  const B = T.densePath({ ...t, points: pts, start: 0 }, 0.25);
  const { wp, we, ww, wb } = compare(A, B, !!t.open), dl = lenOf(B) - lenOf(T.densePath(t, 0.25)); // (both lengths off the same fine samples)
  const fail = wp > GATE.line || we > GATE.height || ww > GATE.width || wb > GATE.bank || Math.abs(dl) > GATE.lap;
  worstAll = Math.max(worstAll, wp); if (fail) bad++;
  console.log(`${name.padEnd(28)} ${String(t.points.length).padStart(4)} -> ${String(pts.length).padStart(3)}   line ${wp.toFixed(2)} m   height ${we.toFixed(2)} m   width ${ww.toFixed(2)} m   bank ${wb.toFixed(1)}°   lap ${dl >= 0 ? '+' : ''}${dl.toFixed(2)} m of ${lenOf(A).toFixed(0)}${fail ? '   FAIL' : ''}`);
}
// a drawn loop: a wobbly hand-drawn kidney, 4 m spacing, as the editor's finishDraw smooths it
const stroke = [];
for (let k = 0; k < 400; k++) { const a = k / 400 * Math.PI * 2, r = 300 + 90 * Math.sin(2 * a) + 4 * Math.sin(37 * a); stroke.push([Math.cos(a) * r * 1.4, Math.sin(a) * r]); }
const sm = stroke.map((_, i) => { let x = 0, z = 0; for (let k = -4; k <= 4; k++) { const q = stroke[(i + k + stroke.length) % stroke.length]; x += q[0]; z += q[1]; } return [x / 9, z / 9]; });
const drawn = S.fitStroke(sm, false);
console.log(`drawn loop: ${stroke.length} stroke points -> ${drawn.length} points`);
console.log(bad ? `FAIL: ${bad} circuits off by more than ${JSON.stringify(GATE)}` : `ok: worst line move ${worstAll.toFixed(2)} m`);
