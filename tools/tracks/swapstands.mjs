// The real circuits' old one-piece grandstands swapped for lines of covered / flag grandstands, 9 m apart
// (js/standlines.js; the importer makes those itself now).   node tools/tracks/swapstands.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { swapGrandstands } from '../../js/standlines.js';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tracks/real');
const index = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8'));
for (const e of index) {
  const f = path.join(OUT, e.file), t = JSON.parse(fs.readFileSync(f, 'utf8')), n = (t.props || []).filter(p => p.type === 'grandstand').length;
  if (!swapGrandstands(t)) continue;
  fs.writeFileSync(f, JSON.stringify(t));
  e.props = t.props; e.propLines = t.propLines;
  console.log(`${t.name}: ${n} grandstands -> ${t.propLines.length} lines, ${t.props.filter(p => p.ln).length} stands`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
