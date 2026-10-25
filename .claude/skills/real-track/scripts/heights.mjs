// The ground's height (the LiDAR / DEM the game uses) on a grid round a point: find bowls, banks and terraces to
// seat a landmark on.   node --import ./tools/tracks/three-hook.mjs .claude/skills/real-track/scripts/heights.mjs <id> <x> <z> <radius> <step>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
await import(path.join(ROOT, 'js/track.js'));
const { rawHeight } = await import(path.join(ROOT, 'js/terrain.js'));
const [id, ...n] = process.argv.slice(2), [cx, cz, R, st] = n.map(Number);
const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'tracks/real', id + '.json'), 'utf8'));
let hdr = '      '; for (let x = cx - R; x <= cx + R; x += st) hdr += String(x).padStart(7); console.log(hdr);
for (let z = cz - R; z <= cz + R; z += st) { let s = String(z).padStart(6); for (let x = cx - R; x <= cx + R; x += st) s += rawHeight(t.terrain, x, z).toFixed(1).padStart(7); console.log(s); }
