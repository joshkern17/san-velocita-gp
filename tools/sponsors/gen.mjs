// Sponsor logos via OpenAI image gen, styled after 1980s home-video / TV production idents.
// node tools/sponsors/gen.mjs [--model gpt-image-2] [--only "Volta Cola,Metro Cab Co."] [--out dir] [--n 6]
// Writes <out>/<slug>/master.png. Then variants.py, then install.py
import fs from 'node:fs';
import path from 'node:path';
import { SPONSORS } from './list.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = arg('model', 'gpt-image-2');
const OUT = arg('out', 'tools/sponsors/out'); // (pick, then variants.py + install.py put them in assets/sponsors)
const CONC = +arg('n', 6);
const only = arg('only', '');
const force = process.argv.includes('--force');
const list = only ? SPONSORS.filter(s => only.split(',').map(x => x.trim()).includes(s.name)) : SPONSORS;

const STYLE = `A 1980s home-video / TV production company ident logo, like the logos at the start of an
old VHS tape (Thorn EMI Video, Crown Video, Lightning Video, HBO-era idents, Vestron, Prism, Media Home Entertainment).
Era-correct details chosen to fit this brand: chrome or beveled extruded lettering, horizontal scan-line stripe
fills, neon tube outlines, bold geometric emblem, script logotype with a swoosh, small spaced-out caps sub-line.
Flat, crisp vector-like graphic, no photo, no scene, no background, no VHS noise, no frame or border box
around the image. Centered, filling the canvas with even margins. Spell every word exactly as given.
Transparent background.`;

const prompt = s => `${STYLE}
Brand name (exact spelling): "${s.name}".${s.sub ? ` Small sub-line: "${s.sub}".` : ''}
What it is: ${s.what}.
Main brand color: ${s.color}; use it as the dominant color with at most one or two supporting colors.
Idea for the emblem: ${s.idea}.`;

async function one(s) {
  const dir = path.join(OUT, s.slug);
  const file = path.join(dir, 'master.png');
  if (fs.existsSync(file) && !force) return `skip ${s.slug}`;
  fs.mkdirSync(dir, { recursive: true });
  const body = { model: MODEL, prompt: prompt(s), size: s.size || '1536x1024', quality: 'high', background: 'transparent', n: 1 };
  for (let tries = 0; ; tries++) {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.data?.[0]?.b64_json) { fs.writeFileSync(file, Buffer.from(j.data[0].b64_json, 'base64')); return `ok   ${s.slug}`; }
    const msg = j.error?.message || r.status;
    if (/transparent/i.test(msg) && body.background) { delete body.background; continue; }
    if (tries >= 1 || r.status < 429) return `FAIL ${s.slug}: ${msg}`;
    await new Promise(res => setTimeout(res, 5000));
  }
}

const queue = [...list];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (queue.length) { const s = queue.shift(); console.log(await one(s)); }
}));
