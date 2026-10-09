// Voice clip checker: transcribes every generated clip (ElevenLabs speech-to-text) and compares it with the line it was
// made from, so a tag read out loud, a dropped word or a clipped ending shows up without listening to everything.
//   node tools/voice/check.mjs             every clip not checked since it was last made
//   node tools/voice/check.mjs --all       every clip
// Results are kept in assets/voice/check.json (keyed by the clip's hash, so a re-made clip is checked again).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V = path.join(ROOT, 'assets/voice');
const manifest = JSON.parse(fs.readFileSync(path.join(V, 'manifest.json'), 'utf8'));
const CHECK = path.join(V, 'check.json');
const done = fs.existsSync(CHECK) ? JSON.parse(fs.readFileSync(CHECK, 'utf8')) : {};
const all = process.argv.includes('--all');
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }

// words only: no tags, no punctuation, contractions and spellings the transcriber writes differently folded together
const SAME = { gonna: 'going to', ya: 'you', em: 'them', fixin: 'fixing', racin: 'racing', doin: 'doing', sittin: 'sitting',
  waitin: 'waiting', havin: 'having', gettin: 'getting', esses: "s's", alright: 'all right', okay: 'ok', wanna: 'want to', mist: 'missed', teammates: "teammate's", wings: "wing's" };
const words = (s) => s.toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ')
  .split(/\s+/).filter(Boolean).map(w => w.replace(/^'|'$/g, '')).map(w => SAME[w] || w).join(' ').split(' ');
// how much of the script's words come back, in order (longest common subsequence / script length)
function match(a, b) {
  const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
  return { score: d[a.length][b.length] / Math.max(1, a.length), extra: b.length - d[a.length][b.length] };
}

const todo = [];
for (const [sec, ids] of Object.entries(manifest)) for (const [id, m] of Object.entries(ids))
  if (all || done[`${sec}/${id}`]?.hash !== m.hash) todo.push({ sec, id, m });
console.log(`${todo.length} clips to check`);

async function check({ sec, id, m }) {
  const fd = new FormData();
  fd.append('model_id', 'scribe_v1');
  fd.append('file', new Blob([fs.readFileSync(path.join(V, m.file))]), path.basename(m.file));
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: fd });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 150)}`);
  const heard = (await r.json()).text || '';
  const { score, extra } = match(words(m.text.replace(/\|/g, ' ')), words(heard.replace(/\([^)]*\)/g, ' ')));
  const ok = score >= 0.9 && extra <= 3;
  done[`${sec}/${id}`] = { hash: m.hash, ok, score: +score.toFixed(2), extra, heard };
  fs.writeFileSync(CHECK, JSON.stringify(done, null, 1));
  console.log(`  ${ok ? 'ok  ' : 'LOOK'} ${sec}/${id}${ok ? '' : `  (${Math.round(score * 100)}% of the words, ${extra} extra)\n        heard: ${heard}`}`);
}

const queue = [...todo];
await Promise.all(Array.from({ length: 3 }, async () => {
  for (let t; (t = queue.shift());) { try { await check(t); } catch (e) { console.error(`  FAIL ${t.sec}/${t.id}: ${e.message}`); } }
}));
const bad = Object.entries(done).filter(([, v]) => !v.ok).map(([k]) => k);
console.log(bad.length ? `\nTo listen to: ${bad.join(', ')}` : '\nAll clips match their lines.');
