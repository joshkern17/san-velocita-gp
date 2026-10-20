// dev: share codes (js/edshare.js) round-trip every built-in and real circuit; code lengths, thumbnails drawn
//   node --import ./tools/tracks/three-hook.mjs .devtest/sharecode.mjs
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
globalThis.window ||= globalThis;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = await import(join(ROOT, 'js/track.js')), S = await import(join(ROOT, 'js/edshare.js'));
const tracks = T.presetTracks().map(t => [t.name, t]);
for (const f of readdirSync(join(ROOT, 'tracks/real')).filter(f => f.endsWith('.json') && f !== 'index.json')) tracks.push([f, JSON.parse(readFileSync(join(ROOT, 'tracks/real', f)))]);
let bad = 0;
for (const [n, t] of tracks) {
  const code = await S.shareCode(t), back = await S.readCode('  here: ' + code.replace(/(.{80})/g, '$1\n') + ' ');
  const lean = { ...t }; for (const k of ['osm', 'ground', 'terrain', 'saved']) delete lean[k];
  const same = JSON.stringify(back) === JSON.stringify(lean), th = S.trackThumb(t);
  if (!same || !th.svg) bad++;
  console.log(n.padEnd(22), String(code.length).padStart(6), 'chars', same ? 'same' : 'DIFFERENT', th.svg ? `thumb ${th.km.toFixed(2)} km` : 'NO THUMB');
}
for (const junk of ['', 'hello', 'SVGP1.abc', 'SVGP1.' + Buffer.from('xx').toString('base64url')]) { try { await S.readCode(junk); bad++; console.log('accepted junk', junk); } catch (e) {} }
console.log(bad ? `${bad} FAILED` : 'all good'); process.exit(bad ? 1 : 0);
