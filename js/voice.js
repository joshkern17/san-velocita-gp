// Character voices: the LLM layer. The story director (js/wcareer.js) decides every message and writes it plainly;
// here, when the player has signed in with ChatGPT (serve.py + llm.py hold the account), each message from a voiced
// character is reworded in that character's voice before it's read. The facts can't change: every amount, number
// and name in the written version has to come back, nothing new may appear, and the length has to stay close, or the
// written version stays. Anything that goes wrong (no server, signed out, the plan's limit) leaves the written text.
const VOICED = { Danny: 'danny' }; // (who has a voice so far: their name as a message's sender)

const TONE = `You write in-game messages for San Velocita Grand Prix, a racing game. The player is in their thirties, recently divorced, and spent a lottery win on a small racing team they run from their garage. The writing is dry and understated: the humour comes from plain statements of slightly absurd facts. Never explain a joke, never wink at the reader, no puns, no emoji, no hashtags. Refer to the player as "you"; if you need a pronoun for them, use they/them.`;
const RULES = `Rewrite the message you are given in the character's voice. Keep every fact exactly: every amount of money, every number, every name and place, and whatever is being asked or offered. Add nothing that changes the story: no new people, amounts, promises, events or decisions. Keep about the same length, never more than half as long again. Reply with the message text only: no quotes around it, no subject line, no preamble, no sign-off unless the original has one. Separate paragraphs with a blank line.`;
const CAST = {
  danny: `The character is Danny, the player's best friend since school. He's loyal, upbeat, a little hopeless and always slightly behind on rent. He knows a guy for everything (his mate Kev, his cousin Sal, a bookie called Lenny) and never sees the problem with any of them. He types the way he talks: all lowercase, hardly any punctuation, "u" and "ur", run-on sentences, the occasional typo. He's never mean. He's proud of the player and would never say so directly.`,
};

export const voiceState = { server: null, signedIn: false, email: '', model: null, error: '', busy: false };
const call = async (path, body) => {
  const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', body: JSON.stringify(body), cache: 'no-store' });
  if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('no server');
  return r.json();
};
// is serve.py there, and who's signed in?
export async function voiceStatus() {
  try { Object.assign(voiceState, await call('__llm/status'), { server: true }); }
  catch (e) { voiceState.server = false; voiceState.signedIn = false; }
  return voiceState;
}
// sign in: OpenAI's page opens in a browser tab; we watch for the sign-in to land (up to five minutes)
export async function voiceSignIn(onDone) {
  let url;
  try { url = (await call('__llm/signin', {})).url; } catch (e) { return false; }
  window.open(url, '_blank');
  const until = Date.now() + 300000;
  const poll = async () => {
    await voiceStatus();
    if (voiceState.signedIn) return onDone && onDone(true);
    if (Date.now() < until) setTimeout(poll, 2500); else onDone && onDone(false);
  };
  setTimeout(poll, 4000);
  return true;
}
export async function voiceSignOut() { try { await call('__llm/signout', {}); } catch (e) {} return voiceStatus(); }

// ---------- rewording ----------
const nums = (s) => (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => x.replace(/,/g, ''));
const words = (s) => s.split(/\s+/).filter(Boolean).length;
// does the new version say the same things? (every number kept, none invented, about the same length)
function keepsFacts(orig, out) {
  const a = nums(orig), b = nums(out);
  if (a.some(n => !b.includes(n)) || b.some(n => !a.includes(n))) return false;
  const wo = words(orig), wn = words(out);
  return wn >= wo * 0.5 && wn <= wo * 1.5 + 12;
}
const tidy = (s) => s.trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/\r/g, '').trim();
async function reword(who, kind, orig, ctx) {
  const input = `About the player right now: ${ctx}\n\nThe message to rewrite (${kind}):\n\n${orig}`;
  let r;
  try { r = await call('__llm/say', { instructions: `${TONE}\n\n${CAST[who]}\n\n${RULES}`, input }); } catch (e) { return null; }
  if (!r || r.error) { voiceState.error = r ? r.error : 'failed'; return null; }
  const out = tidy(r.text || '');
  return out && keepsFacts(orig, out) ? out : null;
}
// go through the world's unread messages from voiced characters, one at a time; onChange() after each one lands.
// ctx: a line about the player's situation (main.js), so the voice can lean on it
export async function voiceWorld(w, ctx, onChange) {
  if (voiceState.busy || !voiceState.signedIn || !w) return;
  const todo = [
    ...(w.msgs || []).filter(m => VOICED[m.from] && !m.read && !m.vtried).map(m => ({ m, kind: 'a text message', get: () => m.body, put: (t) => { m.body = t; } })),
    ...(w.mail || []).filter(m => VOICED[m.from] && !m.read && !m.vtried).map(m => ({ m, kind: `an email, subject "${m.subj}"`, get: () => m.body.join('\n\n'), put: (t) => { m.body = t.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean); } })),
  ];
  if (!todo.length) return;
  voiceState.busy = true;
  try {
    for (const t of todo) {
      if (!voiceState.signedIn) break;
      t.m.vtried = true;
      const orig = t.get(), out = await reword(VOICED[t.m.from], t.kind, orig, ctx);
      if (out && !t.m.read) { t.m.orig = orig; t.put(out); t.m.voiced = voiceState.model || true; onChange && onChange(); }
      if (voiceState.error === 'signin' || voiceState.error === 'limit') break;
    }
  } finally { voiceState.busy = false; }
}
