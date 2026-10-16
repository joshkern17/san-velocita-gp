// One pit box as the game builds it (js/pitboxes.js roomMeshes + dressFrame, js/pitprops.js layout), dumped as JSON
// for tools/props/pitbox.py to make models/pitbox.blend from. Coordinates are Blender's: X across the box (to your
// right stood in the door looking in), Y in from the door, Z up (the floor's top at Z = BOX.floor).
//   node tools/props/pitbox-dump.mjs out.json
import { register } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const THREE_URL = pathToFileURL(join(ROOT, 'vendor/three.module.min.js')).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`));
const THREE = await import('three');
const { BOX, roomMeshes, dressFrame } = await import(pathToFileURL(join(ROOT, 'js/pitboxes.js')).href);
const { layout } = await import(pathToFileURL(join(ROOT, 'js/pitprops.js')).href);

// a 15 m slot (the usual): its frame straight onto Blender's axes
const len = 15, F = { P: (x, z, y) => [x, z, y], x0: -len / 2, x1: len / 2, dw: Math.min(BOX.doorW, len - 3) / 2, wx: len / 2 - BOX.wallIn, mirror: false, n: [0, 1] };
// the team's colors, marked (tools/props/pitbox.py turns them into the TEAM_MAIN / TEAM_ACCENT materials)
const MAIN = 0xff00ff, ACCENT = 0x00ffff;
const C = new THREE.Color();
const dump = (m, kind) => {
  const g = m.geometry, p = g.attributes.position, c = g.attributes.color, uv = g.attributes.uv;
  const col = []; // (one color per triangle, as sRGB hex)
  if (c) for (let i = 0; i < p.count; i += 3) col.push(C.setRGB(c.getX(i), c.getY(i), c.getZ(i), THREE.LinearSRGBColorSpace).getHex() === MAIN ? 'MAIN' : C.getHex() === ACCENT ? 'ACCENT' : C.getHexString());
  return { name: m.name, kind, pos: Array.from(p.array, v => +v.toFixed(4)), uv: uv ? Array.from(uv.array, v => +v.toFixed(4)) : null, col, tex: m.userData.tex || null };
};
const out = { box: { wx: F.wx, dw: F.dw, depth: BOX.depth, ceil: BOX.ceil, floor: BOX.floor, doorH: BOX.doorH, frontT: BOX.frontT }, shell: [], dress: [], props: [] };
// the room: floor, walls, ceiling, the strip lights (the game builds these itself, to each box's width)
const TEXS = ['plain', 'industrial_concrete_floor', 'plaster_wall', 'dark_industrial_metal', 'corrugated_metal', 'hazard_stripes_01'];
const r = roomMeshes(F, 0);
r.inside.forEach((m, i) => { m.name = 'shell_' + TEXS[i]; m.userData.tex = i ? TEXS[i] : null; out.shell.push(dump(m, 'shell')); });
if (r.glow) { r.glow.name = 'shell_strip_lights'; out.shell.push(dump(r.glow, 'glow')); }
// the team's things: each its own mesh
const d = dressFrame(F, null, { main: MAIN, accent: ACCENT, split: true });
d.traverse(m => { if (m.isMesh) out.dress.push(dump(m, m.userData.glow ? 'glow' : 'dress')); });
// the furniture (models/pitprops.glb): which, where, facing
for (const q of layout(F)) out.props.push({ name: q.name, at: [q.x, q.z, q.y + BOX.floor], rot: Math.atan2(q.face[0], -q.face[1]) });
writeFileSync(process.argv[2], JSON.stringify(out));
console.log('shell', out.shell.length, 'dress', out.dress.map(m => m.name).join(' '), 'props', out.props.length);
