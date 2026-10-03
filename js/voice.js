// Character voices: the LLM layer. The written story stays as it's written; this adds people reacting to what you
// actually did. The game decides when someone reacts and hands over the facts (wcareer.js react(): a race, a car you
// bought, someone you let go, a deal with Sal...); with the player signed in with ChatGPT (serve.py + llm.py hold the
// account), the character writes the message: a text, or an email from the rival owner. They can only use the facts
// they're given: a reply with a number that isn't in them, or that runs long, is thrown away. Signed out, or the
// plan's limit reached: nobody reacts, and nothing else changes.
const TONE = `You write messages from characters in San Velocita Grand Prix, a racing game. The player is in their thirties, recently divorced, and spent a lottery win on a small racing team they run from their garage, driving one of the cars themselves. The writing is dry and understated; when there's humour it comes from plain statements of slightly absurd facts. Never explain a joke, never wink at the reader, no puns, no emoji, no hashtags. Speak to the player as "you"; if a pronoun for them is needed, use they/them.`;
const RULES = `Write one new message from this character to the player, reacting to what just happened (below). React the way this person would: pick the one detail they'd actually bring up, don't summarise. Use only the facts given: never invent events, people, places or numbers. One to three short sentences. Not every message needs a joke; sincere is fine. Reply with the message only: no quotes around it, no name or sign-off.`;
const CAST = {
  danny: () => `You are Danny, the player's best friend since school. Loyal, upbeat, a bit hopeless, usually behind on rent. He knows a guy for everything (his mate Kev, his cousin Sal, a bookie called Lenny) and never sees the problem with any of them. He texts casually, in lowercase, with normal punctuation and apostrophes, and writes "you", not "u". Never mean. Proud of the player and would never say so directly.`,
  mate: (r) => `You are ${r.from}, the player's teammate: the other driver in their team, so the player is also your boss. Competitive with them, polite about it, and keen to be seen as the quicker of the two. ${r.traits || ''} You text in normal sentences.`,
  rival: (r) => `You are ${r.from}, the old-money owner of a rival team. Condescending, impeccably polite, and quietly worried the newcomers might be any good. You write short, formal emails and never use exclamation marks.`,
  ex: (r) => `You are ${r.from}, the player's ex: recently divorced from them, not a villain, and not over it either. Wry, brief, a little guarded. You text in lowercase with normal punctuation.`,
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

// ---------- reactions ----------
const nums = (s) => (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => x.replace(/,/g, ''));
const tidy = (s) => s.trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/\r/g, '').trim();
// only what they were told: no number that isn't in the facts, and short
const fits = (facts, out) => out && out.split(/\s+/).length <= 70 && nums(out).every(n => nums(facts).includes(n));
// write whoever's waiting (a couple at a time); send(r, text) delivers each one (main.js: a text, or an email)
// ctx: a line about the player's situation, for colour
export async function voiceReacts(w, ctx, send) {
  if (voiceState.busy || !voiceState.signedIn || !w || !w.reacts) return;
  const todo = w.reacts.filter(r => !r.done && CAST[r.who]).slice(-3);
  if (!todo.length) return;
  voiceState.busy = true;
  try {
    for (const r of todo) {
      r.done = true;
      let res;
      try { res = await call('__llm/say', { instructions: `${TONE}\n\n${CAST[r.who](r)}\n\n${RULES}`, input: `The player's situation: ${ctx}\n\nWhat just happened: ${r.facts}` }); } catch (e) { break; }
      if (!res || res.error) { voiceState.error = res ? res.error : 'failed'; if (voiceState.error === 'signin' || voiceState.error === 'limit') break; continue; }
      const out = tidy(res.text || '');
      if (fits(r.facts + ' ' + ctx, out)) send(r, out);
    }
  } finally { voiceState.busy = false; }
}
