// dev: a real circuit's barriers from above (the line the game builds from tracks/real/<id>.json's dress.barriers, its
// nodes as dots), as a PNG.   node --import ./tools/tracks/three-hook.mjs .devtest/barplan.mjs <id> <out.png>
import fs from 'node:fs';
import { sampleTrack, barrierLine, trackFrame } from '../js/track.js';
const [id, out] = process.argv.slice(2), t = JSON.parse(fs.readFileSync(`tracks/real/${id}.json`, 'utf8')), T = sampleTrack(t);
const xs = [...T.X], zs = [...T.Z], x0 = Math.min(...xs) - 60, z0 = Math.min(...zs) - 60, W = Math.max(...xs) + 60 - x0, H = Math.max(...zs) + 60 - z0;
const at = (d, off, side) => { const F = trackFrame(T, d), s = side * (F.w / 2 + off); return [F.x + F.rx * s - x0, F.z + F.rz * s - z0]; };
const J = { W, H, road: [], bars: [] };
for (let i = 0; i <= T.N; i++) { const k = i % T.N; J.road.push([T.X[k] - x0, T.Z[k] - z0, T.W[k]]); }
for (const b of (t.dress?.barriers || [])) J.bars.push({ side: b.side, line: barrierLine(b, T).map(([d, o]) => at(d, o, b.side)), nodes: b.pts.map(n => at(n[0], n[1], b.side)) });
const tmp = out + '.json'; fs.writeFileSync(tmp, JSON.stringify(J));
const { execFileSync } = await import('node:child_process');
execFileSync('python3', ['-I', '-c', `
import json,sys
from PIL import Image, ImageDraw
J=json.load(open(sys.argv[1])); k=1600/max(J['W'],J['H']); im=Image.new('RGB',(int(J['W']*k)+1,int(J['H']*k)+1),(29,42,29)); d=ImageDraw.Draw(im)
d.line([(x*k,z*k) for x,z,w in J['road']], fill=(90,90,90), width=max(2,int(J['road'][0][2]*k)))
for b in J['bars']:
  d.line([(x*k,z*k) for x,z in b['line']], fill=(255,90,74) if b['side']<0 else (74,192,255), width=2)
  for x,z in b['nodes']: d.ellipse([x*k-3,z*k-3,x*k+3,z*k+3], fill=(255,255,255))
im.save(sys.argv[2])`, tmp, out]);
fs.unlinkSync(tmp);
