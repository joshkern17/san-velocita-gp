// dev: the house builder's plans (js/housebuild.js planHouse) for a track's real houses (its Real Houses & Trees scan):
// how many wings, how well the squared outline covers the real one (area), storeys / eave / ridge, nothing broken.
// SHOW=n draws the first n plans (real outline red, wings white) to .devtest/out/houseplan.png
//   node --import ./tools/tracks/three-hook.mjs .devtest/houseplan.mjs <file.svgp.json>
import fs from 'node:fs';
import { execSync } from 'node:child_process';
await import('../js/track.js'); // (first: the import order the game has)
const { planHouse } = await import('../js/housebuild.js');
const { polyArea } = await import('../js/zones.js');
const t = (j => j.track || j)(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
const houses = t.scan.houses.filter(b => b.k === 'house');
const wn = {}, bad = [], cover = [];
for (const b of houses) {
  const pl = planHouse(b); if (!pl) { bad.push(['no plan', b.p.length]); continue; }
  wn[pl.wings.length] = (wn[pl.wings.length] || 0) + 1;
  const wa = pl.wings.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0), ra = Math.abs(polyArea(b.p));
  cover.push(wa / ra);
  if (![pl.eave, pl.ridge].every(Number.isFinite) || pl.ridge <= pl.eave || pl.wings.some(r => !(r.x1 > r.x0 && r.z1 > r.z0))) bad.push(['broken', JSON.stringify(pl.wings)]);
}
cover.sort((a, b) => a - b);
console.log(`${houses.length} houses: wings ${JSON.stringify(wn)}; squared area / real: median ${cover[cover.length >> 1].toFixed(2)}, 5% ${cover[Math.floor(cover.length * 0.05)].toFixed(2)}, 95% ${cover[Math.floor(cover.length * 0.95)].toFixed(2)}; broken ${bad.length}`);
const off = cover.filter(c => c < 0.8 || c > 1.25).length;
if (process.env.SHOW) {
  const n = +process.env.SHOW, C = 8, S = 90, img = Buffer.alloc((C * S) ** 2 * 3, 30), W = C * S;
  houses.slice(0, n).forEach((b, k) => {
    const pl = planHouse(b); if (!pl) return; const ox = (k % C) * S, oy = Math.floor(k / C) * S;
    let cx = 0, cz = 0; for (const q of b.p) { cx += q[0]; cz += q[1]; } cx /= b.p.length; cz /= b.p.length;
    const px = (x, z, c) => { const u = Math.round(ox + S / 2 + (x - cx) * 2.4), v = Math.round(oy + S / 2 + (z - cz) * 2.4); if (u < ox || v < oy || u >= ox + S || v >= oy + S) return; const i = (v * W + u) * 3; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; };
    const seg = (a, c, col) => { const L = Math.hypot(c[0] - a[0], c[1] - a[1]); for (let s = 0; s <= L; s += 0.15) px(a[0] + (c[0] - a[0]) * s / L, a[1] + (c[1] - a[1]) * s / L, col); };
    for (const r of pl.wings) { const q = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].map(([u, v]) => pl.toW(u, v)); for (let i = 0; i < 4; i++) seg(q[i], q[(i + 1) % 4], [235, 235, 235]); }
    for (let i = 0; i < b.p.length; i++) seg(b.p[i], b.p[(i + 1) % b.p.length], [230, 60, 60]);
  });
  const o = '.devtest/out/houseplan.png'; fs.writeFileSync(o + '.ppm', Buffer.concat([Buffer.from(`P6 ${W} ${W} 255\n`), img])); execSync(`magick ${o}.ppm ${o}`); fs.unlinkSync(o + '.ppm'); console.log('picture', o);
}
console.log(bad.length || off > houses.length * 0.05 ? `FAIL: ${bad.length} broken, ${off} squared outlines off the real area by 20%+` : 'PASS');
