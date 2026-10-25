// dev: the commercial builder's buildings (js/housebuild.js buildShops) laid out in a row to look at outside the game:
// one of each kind on a plain outline, an L-shaped strip mall, a corner shop, and the real ones from a track file
// (its places' buildings, on their real outlines). Writes an OBJ + MTL with the game's own textures (and the sign
// sheet, drawn by Pillow the way the game draws it) to models/trackside/src/shops_preview/, for Blender.
//   node --import ./tools/tracks/three-hook.mjs .devtest/shoppreview.mjs [track.svgp.json]
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname);
await import('../js/track.js');
const { buildShops } = await import('../js/housebuild.js');
const { assignPlaces } = await import('../js/places.js');
const OUT = ROOT + 'models/trackside/src/shops_preview/'; fs.mkdirSync(OUT, { recursive: true });

// the lineup: [kind, name, outline (x, z from its own middle), height]
const rect = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
const L = (w, d, cw, cd) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + cd], [-w / 2 + cw, -d / 2 + cd], [-w / 2 + cw, d / 2], [-w / 2, d / 2]];
const items = [
  ['strip', 'Golden Dragon Chinese', rect(34, 18), 5.2],
  ['strip', 'Bella Nails', rect(14, 14), 4.6],
  ['strip', '', L(46, 34, 18, 16), 5.0],
  ['supermarket', 'Foothill Market', rect(60, 44), 7.5],
  ['autoshop', 'Main St Auto Repair', rect(26, 16), 6.0],
  ['bank', 'Sierra Savings Bank', rect(20, 16), 5.6],
  ['postoffice', 'Post Office', rect(30, 22), 5.2],
  ['school', 'Elm Street Elementary', L(70, 40, 20, 14), 5.0],
  ['civic', 'Fire Station 32', rect(24, 18), 6.4],
];
// the real ones from a track: the buildings its map places are in
const file = process.argv[2];
if (file) {
  const t = (j => j.track || j)(JSON.parse(fs.readFileSync(file, 'utf8')));
  const bs = [...((t.osm && t.osm.buildings) || []).map(b => ({ ...b, from: 'osm' })), ...((t.scan && t.scan.houses) || []).map(b => ({ ...b, from: 'scan' }))];
  assignPlaces(bs, t.osm && t.osm.street && t.osm.street.places);
  const KIND = { strip: 1, supermarket: 1, bank: 1, postoffice: 1, autoshop: 1, school: 1, civic: 1, fuel: 1 };
  for (const b of bs.filter(b => b.place && KIND[b.place])) {
    let cx = 0, cz = 0; for (const q of b.p) { cx += q[0]; cz += q[1]; } cx /= b.p.length; cz /= b.p.length;
    items.push([b.place === 'fuel' ? 'strip' : b.place, b.pname || '', b.p.map(q => [q[0] - cx, q[1] - cz]), b.h || 5]);
  }
}
// laid out in rows of 4, 25 m apart (from the widest), the street side facing -z (towards the camera in front)
const list = []; let x = 0, z = 0, rowD = 0, n = 0;
for (const [kind, name, p, h] of items) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  if (n && n % 4 === 0) { x = 0; z += rowD + 25; rowD = 0; }
  const ox = x - x0, oz = z - z0; x += (x1 - x0) + 20; rowD = Math.max(rowD, z1 - z0); n++;
  list.push({ b: { p: p.map(q => [q[0] + ox, q[1] + oz]), h }, kind, name: name || undefined, front: [0, -1] });
}
// the sign sheet: rows of 64 px, as the game's canvas (signSheet), drawn by Pillow
const sheetNames = [];
const res = buildShops(null, list, () => 0, { mats: (n) => n, sheet: (names) => { sheetNames.push(...(names.length ? names : [''])); const R = sheetNames.length; return { mat: 'shop_signs', rows: R, row: (i) => [0, 1 - (i * 64 + 2) / (R * 64), 1, 1 - ((i + 1) * 64 - 2) / (R * 64)] }; } }); // (v up, as the game's flipped canvas)
const py = `
from PIL import Image, ImageDraw, ImageFont
names = ${JSON.stringify(sheetNames)}
cols = ['#a8241c', '#1c4f8a', '#2a6a3a', '#7a2a6a', '#c07018', '#1e1e1e', '#6a4a2a', '#18707a']
H = 64; im = Image.new('RGB', (512, max(1, len(names)) * H)); d = ImageDraw.Draw(im)
f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf', 40) if __import__('os').path.exists('/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf') else ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 36)
for i, n in enumerate(names):
    h = 0
    for ch in n: h = (h * 31 + ord(ch)) & 0xffffffff
    if h >= 2**31: h -= 2**32
    d.rectangle([0, i * H, 511, i * H + H - 1], fill=cols[abs(h) % len(cols)])
    d.rectangle([0, i * H, 511, i * H + 2], fill='#f4efe2'); d.rectangle([0, i * H + H - 3, 511, i * H + H - 1], fill='#f4efe2')
    t = n.upper(); b = d.textbbox((0, 0), t, font=f); w = b[2] - b[0]
    tim = Image.new('RGBA', (w + 8, 56), (0, 0, 0, 0)); ImageDraw.Draw(tim).text((4 - b[0], 28 - (b[1] + b[3]) / 2), t, font=f, fill='#f4efe2')
    if w > 480: tim = tim.resize((480, 56))
    im.paste(tim, ((512 - tim.width) // 2, i * H + 4), tim)
im.save('${OUT}shop_signs.png')
`;
fs.writeFileSync(OUT + 'signs.py', py); execSync(`/usr/local/bin/python3 "${OUT}signs.py"`);
// OBJ (+Y up, as the game) and its MTL, with the game's textures copied in
let obj = 'mtllib shops.mtl\n', mtl = '', vi = 1;
for (const [m, S] of res.groups) {
  obj += `o ${m}\nusemtl ${m}\n`;
  for (let i = 0; i < S.pos.length; i += 3) obj += `v ${S.pos[i].toFixed(3)} ${S.pos[i + 1].toFixed(3)} ${S.pos[i + 2].toFixed(3)}\n`;
  for (let i = 0; i < S.uv.length; i += 2) obj += `vt ${S.uv[i].toFixed(4)} ${S.uv[i + 1].toFixed(4)}\n`;
  for (let k = 0; k < S.pos.length / 9; k++) { const a = vi + k * 3; obj += `f ${a}/${a} ${a + 1}/${a + 1} ${a + 2}/${a + 2}\n`; }
  vi += S.pos.length / 3;
  const tex = m === 'shop_signs' ? 'shop_signs.png' : m + '.png';
  if (m !== 'shop_signs') fs.copyFileSync(ROOT + 'assets/textures/' + tex, OUT + tex);
  mtl += `newmtl ${m}\nKd 1 1 1\nmap_Kd ${tex}\n\n`;
}
fs.writeFileSync(OUT + 'shops.obj', obj); fs.writeFileSync(OUT + 'shops.mtl', mtl);
// (labels for the Blender scene: each building's kind and name over its middle)
fs.writeFileSync(OUT + 'labels.json', JSON.stringify(list.map(e => { let cx = 0, cz = 0; for (const q of e.b.p) { cx += q[0]; cz += q[1]; } return { kind: e.kind, name: e.name || '', x: cx / e.b.p.length, z: cz / e.b.p.length, h: e.b.h }; })));
console.log(`${res.built} buildings (${items.length - 9} from the track), ${res.groups.size} materials -> ${OUT}shops.obj`);
