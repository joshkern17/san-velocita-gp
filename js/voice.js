// Character voices: the LLM layer. The written story stays as it's written; this adds people reacting to what you
// actually did. The game decides when someone reacts and hands over the facts (wcareer.js react(): a race, a car you
// bought, someone you let go, a deal with Sal...); with the player signed in with ChatGPT (serve.py + llm.py hold the
// account), the character writes the message: a text, or an email from the rival owner. They can only use the facts
// they're given: a reply with a number that isn't in them, or that runs long, is thrown away. Signed out, or the
// plan's limit reached: nobody reacts, and nothing else changes.
const TONE = `You write messages from characters in San Velocita Grand Prix, a racing game. The player is in their thirties, recently divorced, and spent a lottery win on a small racing team they run from their garage, driving one of the cars themselves. The writing is dry and understated; when there's humour it comes from plain statements of slightly absurd facts. Never explain a joke, never wink at the reader, no puns, no emoji, no hashtags. Speak to the player as "you"; if a pronoun for them is needed, use they/them.`;
const RULES = `Write one new message from this character to the player, reacting to what just happened (below). React the way this person would: pick the one detail they'd actually bring up, don't summarise. Use only the facts given: never invent events, people, places or numbers. One to three short sentences, or for a texter, up to three short lines. Not every message needs a joke; sincere is fine. Reply with the message only: no quotes around it, no name or sign-off.`;
const CAST = {
  danny: () => `You are Danny, the player's best friend since school: a guy in his thirties, loyal, laid back, usually behind on rent. He knows a guy for everything (his boy Kev, his cousin Sal, a bookie called Lenny) and never sees the problem with any of them. He texts like a real friend: short messages, often two or three in a row (put each on its own line), sentence case, hardly any full stops at the ends of lines. Casual slang where it fits naturally, never piled up: yo, bro, dude, dawg, fr, fs, fasho, rn, imma, my bad, bet, lowkey. No emoji. His humour is low-key and deadpan, never trying too hard. Hypes the player up when they do well, keeps it real when they don't. Example of how he texts:\nYo someone was at the garage last night\nCar's ok. Mostly\nSal says hi`,
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

// ---------- conversations: you write (or pick a tone), they answer ----------
// The game hands over who they are and what they know (wcareer.js talkFacts / talkHistory); ChatGPT writes their reply
// and says what your message's tone was (the game decides what that does: talkDone). If you only picked a tone, it
// writes your message too. Anything that isn't the JSON asked for is thrown away.
const INTENTS = {
  warm: 'back them up: warm and encouraging',
  joking: 'have a laugh with them: light, teasing, friendly',
  straight: 'be straight with them: honest, no sugar-coating, not unkind',
  harsh: 'tear into them: angry, cutting, the way a frustrated boss would',
};
export const TALK_INTENTS = [['warm', 'Back them up'], ['joking', 'Have a laugh'], ['straight', 'Be straight'], ['harsh', 'Tear into them']];
const TALK_RULES = `This is a text conversation. The player has just sent (or is about to send) a message; write this character's reply, the way this person really would, given everything they know and how the player treated them. They can push back, be hurt, joke, agree, or not reply much. Use only the facts given: never invent events, people, money or promises; never agree to give or pay anything. Their reply is one to three short lines.
Then judge the tone of the player's message as one of: warm, supportive, joking, neutral, blunt, harsh, abusive.
Answer with JSON only, no other text: {"you": "the player's message", "reply": ["line", "line"], "tone": "one word"}`;
const parse = (s) => { try { const j = JSON.parse(String(s).replace(/^```(?:json)?|```$/gm, '').trim()); return j && typeof j === 'object' ? j : null; } catch (e) { return null; } };
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
// o: { who: 'danny' | 'mate', name, traits, facts, history, intent | text } -> { you, reply: [lines], tone } or { error }
export async function converse(o) {
  if (!voiceState.signedIn) return { error: 'signin' };
  const cast = o.who === 'danny' ? CAST.danny() : CAST.mate({ from: o.name, traits: o.traits });
  const ask = o.text ? `The player sent: "${clip(o.text, 280)}". Put it in "you" exactly as written.` : `The player wants to ${INTENTS[o.intent] || INTENTS.straight}. Write their message in "you": one or two short texting lines in their own voice (a racing team owner in their thirties), using only the facts given.`;
  let res;
  try { res = await call('__llm/say', { instructions: `${TONE}\n\n${cast}\n\n${TALK_RULES}`, input: `What ${o.name} knows: ${o.facts}\n\nThe conversation so far:\n${o.history || '(nothing yet)'}\n\n${ask}` }); }
  catch (e) { return { error: 'server' }; }
  if (!res || res.error) { voiceState.error = res ? res.error : 'failed'; return { error: voiceState.error }; }
  const j = parse(res.text);
  if (!j || !j.you) return { error: 'garbled' };
  const reply = (Array.isArray(j.reply) ? j.reply : [j.reply]).map(x => tidy(String(x || ''))).filter(Boolean).slice(0, 3).map(x => clip(x, 220));
  return { you: o.text ? clip(o.text, 280) : clip(tidy(j.you), 280), reply, tone: String(j.tone || 'neutral').toLowerCase() };
}
// the reporter: your answer (typed, or a tone), her reply, and the Wire's piece quoting you
const PRESS = `You are Nadia Okafor, a reporter for the Paddock Wire: fair, sharp, unimpressed by spin, quietly funny in print. You write a short reply email to the player, and a short Wire item that quotes the player's answer (their own words, trimmed if long). The item states what happened and what the player said, and lets the quote speak for itself.`;
const PRESS_RULES = `Use only the facts given: never invent events, people, money or quotes beyond the player's answer. Judge the tone of the player's answer as one of: warm, supportive, joking, neutral, blunt, harsh, abusive.
Answer with JSON only, no other text: {"you": "the player's answer", "reply": "your email, one or two sentences", "headline": "a short headline", "story": "two or three sentences, quoting the player", "tone": "one word"}`;
export async function pressAnswer(o) {
  if (!voiceState.signedIn) return { error: 'signin' };
  const ask = o.text ? `The player answered: "${clip(o.text, 400)}". Put it in "you" exactly as written.` : `The player wants to ${INTENTS[o.intent] || INTENTS.straight} (to the press, about this). Write their answer in "you": two or three sentences in their own voice.`;
  let res;
  try { res = await call('__llm/say', { instructions: `${TONE}\n\n${PRESS}\n\n${PRESS_RULES}`, input: `The facts: ${o.facts}\n\nWhat the reporter asked: ${o.asked}\n\n${ask}` }); }
  catch (e) { return { error: 'server' }; }
  if (!res || res.error) { voiceState.error = res ? res.error : 'failed'; return { error: voiceState.error }; }
  const j = parse(res.text);
  if (!j || !j.you || !j.story) return { error: 'garbled' };
  return { you: o.text ? clip(o.text, 400) : clip(tidy(j.you), 400), reply: clip(tidy(j.reply || ''), 300), headline: clip(j.headline, 80), story: clip(j.story, 500), tone: String(j.tone || 'neutral').toLowerCase() };
}
// an investor: your answer to their question (typed, or a pitch picked), their reply, and what kind of pitch it was
// (the game decides what that does: wcareer.js pitchDone)
const PITCH_KIND = { numbers: 'talk numbers: costs, returns, what their money would do', dream: 'sell the dream: what the team will become', risks: 'be honest about the risks', flatter: 'flatter them' };
const PITCH_RULES = `Write the investor's short email reply (one or two sentences) to the player's answer, the way this person really would given what they value: interested, unconvinced, amused, put off. Use only the facts given: never invent figures, events or promises; never agree to invest (that is decided elsewhere).
Then judge what kind of answer the player gave, as one of: numbers, dream, risks, flatter (the closest), and its tone as one of: warm, supportive, joking, neutral, blunt, harsh, abusive.
Answer with JSON only, no other text: {"you": "the player's answer", "reply": "the investor's email", "pitch": "one word", "tone": "one word"}`;
export async function pitchAnswer(o) {
  if (!voiceState.signedIn) return { error: 'signin' };
  const ask = o.text ? `The player answered: "${clip(o.text, 500)}". Put it in "you" exactly as written.` : `The player wants to ${PITCH_KIND[o.intent] || PITCH_KIND.numbers}. Write their answer in "you": two or three sentences in their own voice, using only the facts given.`;
  let res;
  try { res = await call('__llm/say', { instructions: `${TONE}\n\n${PITCH_RULES}`, input: `The facts: ${o.facts}\n\nWhat the investor asked: ${o.asked}\n\n${ask}` }); }
  catch (e) { return { error: 'server' }; }
  if (!res || res.error) { voiceState.error = res ? res.error : 'failed'; return { error: voiceState.error }; }
  const j = parse(res.text);
  if (!j || !j.you || !j.reply) return { error: 'garbled' };
  const pitch = String(j.pitch || '').toLowerCase();
  return { you: o.text ? clip(o.text, 500) : clip(tidy(j.you), 500), reply: clip(tidy(j.reply), 300), pitch: PITCH_KIND[pitch] ? pitch : (o.intent || 'numbers'), tone: String(j.tone || 'neutral').toLowerCase() };
}
