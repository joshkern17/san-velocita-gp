// Voice line generator: reads the lines file and makes one mp3 per line with ElevenLabs. In [booth], each exchange
// (an M line and the C lines straight after it) is one take of both commentators, made with Text to Dialogue.
//   node tools/voice/gen.mjs                      every voiced section, only lines that are new or changed
//   node tools/voice/gen.mjs --only a.b,c.d       just these ids (regenerates them even if unchanged)
//   node tools/voice/gen.mjs --section eng        one section
//   node tools/voice/gen.mjs --dry                list what would be made, spend nothing
//   node tools/voice/gen.mjs --custom-name Name   a player's own name: its calls (and it's added to names.txt)
//   node tools/voice/gen.mjs --prune              also remove clips whose line is gone (--prune-only: just that)
// Needs ELEVENLABS_API_KEY in the environment (~/.zshrc). Clips go to assets/voice/<section>/<id>.mp3, clean (the
// engineer's radio effect is added live in the game); assets/voice/manifest.json remembers what each clip was made from.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LINES = path.join(ROOT, 'assets/voice/san_velocita_lines_with_announcer.txt');
const OUT = path.join(ROOT, 'assets/voice');
const MANIFEST = path.join(OUT, 'manifest.json');
const MODEL = 'eleven_v4';
// the voices (the user's own, in their ElevenLabs account); a section not listed here isn't voiced
const VOICES = {
  eng: 'hoiJIjqBjNO1OD2v0ObR',       // SV engineer 001 - modern drawl
  announcer: 'JDrV7ejkLZSvqwpOlu3t', // SV announcer 002 - Modern American (main commentator)
  color: 'hQSbu3htRm8eJbMhfZcZ',     // SV announcer 004 (color commentator: a race car driver who happens to have a microphone)
  pbp: 'JDrV7ejkLZSvqwpOlu3t',       // the main commentator again, calling it live
  pbpc: 'hQSbu3htRm8eJbMhfZcZ',      // ...and the color commentator, now and then taking the call
};
// The calls with a name in them (assets/voice/calls.txt), recorded for every name in assets/voice/names.txt as whole
// sentences (call.<type>.<name>): [main] lines in the main commentator's voice, [color] in the color commentator's.
const NAMES = path.join(ROOT, 'assets/voice/names.txt'), CALLS = path.join(ROOT, 'assets/voice/calls.txt');
const CALL_VOICE = { main: 'JDrV7ejkLZSvqwpOlu3t', color: 'hQSbu3htRm8eJbMhfZcZ' };
const slugName = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, ''); // (js/broadcast.js: the same)

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const dry = args.includes('--dry');
const only = flag('--only') ? new Set(flag('--only').split(',').map(s => s.trim())) : null;
const section = flag('--section');

// [section] headers, "id = text" lines, # comments. In [booth] each line is led by M (main commentator) or C (color):
// an M line starts an exchange, the C/M lines right after it (no blank or comment line between) belong to it.
const BOOTH = { M: 'announcer', C: 'color' };
function parse(src) {
  const out = []; let sec = null, ex = null;
  for (const raw of src.split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) { ex = null; continue; }
    const h = l.match(/^\[([a-z]+)\]$/); if (h) { sec = h[1]; ex = null; continue; }
    // "M id = text" starts an exchange; "C id = text" (a reply) or "M = text" / "C = text" (no id) continue it
    const b = sec === 'booth' && l.match(/^([MC])\s+(?:([a-z0-9_.]+)\s*)?=\s*(.+)$/i);
    if (b) {
      const part = { who: b[1], text: b[3].trim() };
      if (ex && (!b[2] || b[1] === 'C')) { ex.parts.push(part); ex.text += ' | ' + part.text; continue; }
      if (!b[2]) { console.error(`A line with no id must follow an exchange: ${l}`); process.exit(1); }
      out.push(ex = { sec: 'booth', id: b[2], parts: [part], text: part.text }); continue;
    }
    const m = l.match(/^([a-z0-9_.]+)\s*=\s*(.+)$/i);
    if (m && sec && sec !== 'booth') out.push({ sec, id: m[1], text: m[2].trim() });
  }
  return out;
}
const voiceOf = (l) => l.sec === 'booth' ? l.parts.map(p => VOICES[BOOTH[p.who]]).join(',') : l.voice || VOICES[l.sec];

const key = process.env.ELEVENLABS_API_KEY;
if (!key && !dry) { console.error('ELEVENLABS_API_KEY is not set (run from a shell that loads ~/.zshrc)'); process.exit(1); }
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const hash = (l) => crypto.createHash('sha1').update(`${voiceOf(l)}|${MODEL}|${l.text}`).digest('hex').slice(0, 12);

// every name (surnames, nicknames; "Name = how to say it") x every call template
function nameLines(namesFile = NAMES) {
  if (!fs.existsSync(namesFile) || !fs.existsSync(CALLS)) return [];
  const calls = []; let sec = null;
  for (const raw of fs.readFileSync(CALLS, 'utf8').split('\n')) {
    const l = raw.trim(); if (!l || l.startsWith('#')) continue;
    const h = l.match(/^\[([a-z]+)\]$/); if (h) { sec = h[1]; continue; }
    const m = l.match(/^([a-z0-9_.]+)\s*=\s*(.+)$/i); if (m && CALL_VOICE[sec]) calls.push({ id: m[1], voice: CALL_VOICE[sec], text: m[2].trim() });
  }
  const out = [], seen = new Set();
  for (const raw of fs.readFileSync(namesFile, 'utf8').split('\n')) {
    const l = raw.trim(); if (!l || l.startsWith('#') || /^\[.*\]$/.test(l)) continue;
    const [name, say] = l.split('=').map(x => x.trim()), slug = slugName(name);
    if (!slug || seen.has(slug)) continue; // (a surname that's also a nickname: once)
    seen.add(slug);
    for (const c of calls) out.push({ sec: 'call', id: `${c.id}.${slug}`, voice: c.voice, text: c.text.replace(/\{N\}/g, say || name) });
  }
  return out;
}
// --custom-name "Name" [--say "spelling"]: a player's own name (serve.py /__voice/name): kept in names.txt [custom]
// (so it stays through later runs), and just its calls are made
const custom = flag('--custom-name');
if (custom) {
  const say = flag('--say'), slug = slugName(custom);
  if (!slug) { console.error('no name'); process.exit(1); }
  const txt = fs.readFileSync(NAMES, 'utf8'), has = txt.split('\n').some(l => slugName(l.split('=')[0]) === slug);
  if (!has) fs.writeFileSync(NAMES, txt.replace(/\n*$/, '\n') + (txt.includes('[custom]') ? '' : '\n[custom]\n# names players added for themselves (Options > Record Your Name)\n') + (say ? `${custom} = ${say}` : custom) + '\n');
}
const lines = [...parse(fs.readFileSync(LINES, 'utf8')), ...nameLines()].filter(l => (VOICES[l.sec] || l.sec === 'booth' || l.sec === 'call') && (!section || l.sec === section) && (!only || only.has(l.id))
  && (!custom || (l.sec === 'call' && l.id.endsWith('.' + slugName(custom)))));
const dup = lines.map(l => `${l.sec}/${l.id}`).filter((k, i, a) => a.indexOf(k) !== i);
if (dup.length) { console.error('Duplicate ids:', [...new Set(dup)].join(', ')); process.exit(1); }
const todo = lines.filter(l => {
  const m = manifest[l.sec]?.[l.id];
  return only || !m || m.hash !== hash(l) || !fs.existsSync(path.join(OUT, m.file));
});
// --prune: clips whose line is gone from the files (renamed, deleted): out of the manifest, off the disk
if ((args.includes('--prune') || args.includes('--prune-only')) && !only && !section) {
  const keep = new Set(lines.map(l => `${l.sec}/${l.id}`));
  for (const [sec, ids] of Object.entries(manifest)) for (const id of Object.keys(ids)) if (!keep.has(`${sec}/${id}`)) {
    if (!dry) { try { fs.unlinkSync(path.join(OUT, ids[id].file)); } catch (e) {} delete ids[id]; }
    console.log(`  pruned ${sec}/${id}`);
  }
  if (!dry) fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  if (args.includes('--prune-only')) process.exit(0);
}
const chars = todo.reduce((n, l) => n + l.text.length, 0);
console.log(`${lines.length} lines, ${todo.length} to make (${chars} characters)`);
if (dry) { todo.forEach(l => console.log(`  ${l.sec}/${l.id}: ${l.text}`)); process.exit(0); }

async function make(l) {
  const booth = l.sec === 'booth';
  const r = await fetch(booth ? 'https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128'
    : `https://api.elevenlabs.io/v1/text-to-speech/${voiceOf(l)}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify(booth ? { model_id: MODEL, inputs: l.parts.map(p => ({ voice_id: VOICES[BOOTH[p.who]], text: p.text })) }
      : { text: l.text, model_id: MODEL }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  const file = `${l.sec}/${l.id}.mp3`;
  fs.mkdirSync(path.join(OUT, l.sec), { recursive: true });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(await r.arrayBuffer()));
  (manifest[l.sec] ||= {})[l.id] = { file, hash: hash(l), text: l.text };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`  ok  ${file}`);
}

// a few at a time; one failure doesn't stop the rest
let failed = 0; const queue = [...todo];
await Promise.all(Array.from({ length: 3 }, async () => {
  for (let l; (l = queue.shift());) {
    try { await make(l); } catch (e) { failed++; console.error(`  FAIL ${l.sec}/${l.id}: ${e.message}`); }
  }
}));
console.log(failed ? `${failed} failed` : 'done');
process.exit(failed ? 1 : 0);
