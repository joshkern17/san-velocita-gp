// The Paddock Wire: the world's news, written from what actually happened (js/wcareer.js keeps the facts; this
// turns them into articles). After every round: a race report for your series and briefs for the others, then
// whatever the round stirred up (feuds, teammates colliding, a team in trouble, a driver on a run, transfer
// rumours), and every other round the Pit Wall column. Articles are { head, body: [paragraphs], kind, by, s }:
// kind is report / paddock / opinion / brief (the site's sections). Plain and dry, like the rest of the game:
// the facts are the joke when there is one.
//
// K: the helpers it needs from wcareer.js (passed in, so the two modules don't import each other).

const STAFF = { report: ['Nadia Okafor', 'Tom Bracewell'], paddock: ['Nadia Okafor'], opinion: ['Ray Dunning'], brief: ['Wire staff'] };
const NUM = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const UP = (s) => s.toUpperCase();

export function roundPress(w, K) {
  const P = (w.press ??= { lead: {}, done: {}, n: 0 });
  const sid = w.player.series;
  for (const s of K.SERIES) {
    const res = w.series[s.id].results.at(-1); if (!res || res.round !== w.round) continue;
    if (s.id === sid) raceReport(w, K, s, res); else brief(w, K, s, res);
    const st = K.standings(w, s.id); if (st[0]) P.lead[s.id] = st[0].pid;
  }
  drama(w, K, sid);
  if (w.round % 2 === 1 && w.round < w.opts.len - 1) column(w, K, sid);
}

// ---------- names ----------
function who(w, K, pid) {
  if (pid === 'P') { const [first, ...rest] = w.player.name.split(' '); return { full: w.player.name, last: rest.join(' ') || first, first, p: null, team: w.teams[w.player.team] }; }
  const p = w.people[pid]; return p ? { full: `${p.first} ${p.last}`, last: p.last, first: p.first, p, team: w.teams[p.team] } : { full: 'A driver', last: 'Driver', first: '', p: null, team: null };
}
const traitsOf = (x) => (x.p && x.p.traits) || [];
const article = (w, K, kind, head, body, extra = {}) => K.news(w, head, body.filter(Boolean), { kind, by: K.pick(w, STAFF[kind]), ...extra });

// ---------- the race report ----------
function raceReport(w, K, s, res) {
  const rows = res.rows.slice().sort((a, b) => (a.dnf - b.dnf) || a.pos - b.pos), fin = rows.filter(r => !r.dnf);
  if (!fin.length) return;
  const W = who(w, K, fin[0].pid), second = fin[1] && who(w, K, fin[1].pid), third = fin[2] && who(w, K, fin[2].pid);
  const cal = w.series[s.id].cal[res.round] || {}, wet = res.weather === 'rain', night = cal.time === 'night';
  const prev = w.series[s.id].results.slice(0, -1), streak = (() => { let n = 1; for (let i = prev.length - 1; i >= 0; i--) { const r = prev[i].rows.find(x => x.pos === 1 && !x.dnf); if (r && r.pid === fin[0].pid) n++; else break; } return n; })();
  const winsNow = fin[0].pid === 'P' ? w.player.wins : W.p ? W.p.wins : 0, first = winsNow === 1;
  const ts = K.teamStandings(w, s.id), wTeam = K.teamOfPid(w, fin[0].pid), wTeamPos = ts.findIndex(e => e.tid === wTeam) + 1, underdog = wTeamPos > Math.ceil(ts.length / 2) && res.round >= 2;
  const fl = rows.find(r => r.fl), flW = fl && fl.pid !== fin[0].pid ? who(w, K, fl.pid) : null;
  // the headline
  const head = first && fin[0].pid !== 'P' ? `FIRST WIN FOR ${UP(W.last)}` : streak >= 3 ? `${UP(W.last)} MAKES IT ${['', '', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'][streak] || streak}`
    : wet ? `${UP(W.last)} WINS IN THE RAIN AT ${UP(res.track)}` : underdog ? `${UP(W.last)} WINS FOR ${UP(W.team?.name || 'THE MIDFIELD')}` : `${UP(W.last)} WINS AT ${UP(res.track)}`;
  // the lede
  const where = `at ${res.track}${wet ? ', in the rain' : night ? ', under the lights' : ''}`;
  const lede = first ? `${W.full} won a ${s.name} race for the first time ${where}, ${(() => { const n = fin[0].pid === 'P' ? w.player.starts : W.p ? W.p.starts : 1; return n <= 1 ? 'on debut' : `at the ${ordinal(n)} attempt`; })()}.`
    : streak >= 3 ? `${W.full} won ${where} for a ${NUM[streak] || ordinal(streak)} win in a row.`
    : `${W.full} won round ${res.round + 1} of the ${s.name} ${where}.`;
  const podium = second ? `${second.full}${third ? ` and ${third.full}` : ''} ${third ? 'completed the podium' : 'was second'}.` : '';
  const und = underdog ? ` It was a rare good day for ${W.team.name}, ${ordinal(wTeamPos)} of ${ts.length} in the team standings before the weekend.` : '';
  // the championship
  const st = K.standings(w, s.id), lead = st[0], ld = who(w, K, lead.pid), gap = st[1] ? lead.pts - st[1].pts : 0, left = w.opts.len - res.round - 1, before = w.press.lead[s.id];
  const champ = left <= 0 ? '' : before && before !== lead.pid && res.round > 0
    ? `${ld.full} now leads the championship, ${gap} point${gap === 1 ? '' : 's'} clear of ${who(w, K, st[1].pid).full}, with ${left} round${left === 1 ? '' : 's'} to go.`
    : `${ld.full} leads the championship by ${gap} point${gap === 1 ? '' : 's'} with ${left} round${left === 1 ? '' : 's'} left.${gap <= 5 && res.round >= 2 ? ' It is not comfortable.' : gap >= 30 ? ' It is starting to look comfortable.' : ''}`;
  // what went wrong for people
  const hits = w.ledger.filter(e => e.y === w.year && e.r === res.round && e.s === s.id && (e.type === 'contact' || K.DIRTY[e.type]));
  const out = rows.filter(r => r.dnf && !r.dsq);
  const inc = [];
  for (const e of hits.slice(0, 2)) {
    const A = who(w, K, e.a), B = who(w, K, e.b), ended = out.find(r => r.pid === e.b);
    if (K.DIRTY[e.type]) inc.push(`${B.full} was unhappy with ${A.full} after what looked like a ${K.DIRTY[e.type][0]}. The stewards took no action.`);
    else inc.push(`${A.full} and ${B.full} touched${ended ? `, which ended ${B.last}'s race` : ''}${e.blame ? `; most of the paddock put it on ${A.last}` : ''}.`);
  }
  const quiet = out.filter(r => !hits.some(e => e.b === r.pid || e.a === r.pid)).map(r => who(w, K, r.pid).full);
  if (quiet.length) inc.push(`${quiet.length === 1 ? `${quiet[0]} retired` : `${quiet.slice(0, -1).join(', ')} and ${quiet.at(-1)} retired`}${quiet.length > 2 ? ', which the teams concerned would rather not discuss' : ''}.`);
  if (flW) inc.push(`${flW.full} set the fastest lap.`);
  // the newcomers (you)
  const me = rows.find(r => r.pid === 'P'), mine = w.teams[w.player.team], mateId = mine.drivers.find(d => d !== 'P'), mr = mateId && rows.find(r => r.pid === mateId), M = mateId && who(w, K, mateId);
  let you = '';
  if (me && fin[0].pid !== 'P') {
    you = me.dnf ? `${mine.name}'s ${w.player.name} did not finish.` : me.pos <= 3 ? `${w.player.name} was ${ordinal(me.pos)} for ${mine.name}, a podium for the lottery-funded team.`
      : me.pos >= rows.length - 1 ? `${w.player.name} finished ${ordinal(me.pos)} for ${mine.name}.` : `${w.player.name} was ${ordinal(me.pos)} for ${mine.name}.`;
    if (mr && M) you += mr.dnf ? ` Teammate ${M.full} retired.` : ` Teammate ${M.full} was ${ordinal(mr.pos)}${!me.dnf && mr.pos < me.pos ? ', ahead of the team owner' : ''}.`;
    if (me.dnf && mr && mr.dnf) you += ' Neither car finished.';
  }
  // a quote: the winner most of the time; sometimes someone who got hit
  const hit = hits.find(e => e.type === 'contact' && e.blame && e.b !== 'P');
  const q = hit && K.rng(w) < 0.45 ? victimQuote(w, K, who(w, K, hit.b), who(w, K, hit.a)) : winnerQuote(w, K, W, { first, streak, wet, next: w.series[s.id].cal[res.round + 1]?.name });
  const close = left > 0 ? `Round ${res.round + 2} is at ${w.series[s.id].cal[res.round + 1].name}.` : '';
  article(w, K, 'report', head, [`${lede} ${podium}${und}`, champ, inc.join(' '), q, you, close], { report: { s: s.id, round: res.round }, s: s.id });
}
function winnerQuote(w, K, W, o) {
  const t = traitsOf(W);
  const lines = t.includes('digger') ? [`"I said at the start of the year I'd win races. Nobody wrote it down."`, `"People can stop asking if I'm quick enough now."`]
    : t.includes('mentor') ? [`"Still got it. You can write that down."`, `"The young ones keep me honest. Today I kept them honest."`]
    : t.includes('metronome') ? [`"Clean race. No drama. Same as always."`, `"I did the same lap forty times. It turns out that's enough."`]
    : t.includes('hothead') ? [`"I had to go for it. That's how I race."`, `"Nobody touched me today, which helps."`]
    : t.includes('rainman') && o.wet ? [`"The rain is the same for everyone. Some people just don't like it."`]
    : t.includes('paydriver') ? [`"My dad will be very pleased."`, `"Some people said I'm only here because of the money. I'm also here because of the money."`]
    : t.includes('loyal') ? [`"This one's for the team. It's been a long year for them."`]
    : W.p === null ? [`"I don't really know what to say. I'll think of something by the next round."`]
    : o.first ? [`"I've been waiting a long time for that."`, `"I'll enjoy tonight and think about ${o.next || 'the next one'} tomorrow."`]
    : [`"The car was good all weekend."`, `"We kept it clean and it paid off."`, `"I'll enjoy tonight and think about ${o.next || 'the next one'} tomorrow."`];
  const line = K.pick(w, lines);
  return K.rng(w) < 0.7 ? `${line.replace(/\."$/, ',"')} said ${W.last}.` : `${line.replace(/\."$/, ',"')} ${W.last} told the Wire.`;
}
function victimQuote(w, K, B, A) {
  const t = traitsOf(B);
  const lines = t.includes('metronome') ? [`"Racing incident. That's all I'm saying."`]
    : t.includes('hothead') ? [`"Next time I won't leave the door open."`, `"I'll be talking to ${A.last}. Not with words, maybe."`]
    : t.includes('digger') ? [`"I'd like to know what ${A.last} was thinking. I'd also like to know if ${A.last} was thinking."`]
    : [`"I'd like to see the replay. I'd like ${A.last} to see the replay too."`, `"I don't know what happened. I know who happened."`];
  return `${K.pick(w, lines).replace(/\."$/, ',"')} said ${B.last}.`;
}

// ---------- the other series: a brief ----------
function brief(w, K, s, res) {
  const fin = res.rows.filter(r => !r.dnf).sort((a, b) => a.pos - b.pos); if (!fin.length) return;
  const W = who(w, K, fin[0].pid), st = K.standings(w, s.id), ld = who(w, K, st[0].pid), gap = st[1] ? st[0].pts - st[1].pts : 0;
  article(w, K, 'brief', `${UP(W.last)} WINS ${UP(s.name)} ROUND AT ${UP(res.track)}`,
    [`${W.full} (${W.team?.name || ''}) won round ${res.round + 1} of the ${s.name} at ${res.track}${res.weather === 'rain' ? ' in the rain' : ''}, ahead of ${fin.slice(1, 3).map(r => who(w, K, r.pid).full).join(' and ')}. ${ld.full} leads the championship by ${gap} point${gap === 1 ? '' : 's'}.`],
    { report: { s: s.id, round: res.round }, s: s.id });
}

// ---------- the paddock: what the round stirred up (each story once) ----------
function drama(w, K, sid) {
  const P = w.press, once = (key) => { if (P.done[key]) return false; P.done[key] = w.year; return true; }, y = w.year;
  for (const s of K.SERIES) {
    const season = w.ledger.filter(e => e.y === y && e.s === s.id && e.type === 'contact');
    // a feud: the same two have touched twice or more this season
    const pairs = {};
    for (const e of season) { const k = [e.a, e.b].sort().join('|'); (pairs[k] ??= []).push(e); }
    for (const [k, es] of Object.entries(pairs)) {
      if (es.length < 2 || !es.some(e => e.r === w.round) || !once(`feud:${y}:${k}`)) continue;
      const [a, b] = k.split('|'), A = who(w, K, a), B = who(w, K, b), by = {};
      for (const e of es) if (e.blame) by[e.a] = (by[e.a] || 0) + 1;
      const worse = (by[a] || 0) >= (by[b] || 0) ? A : B, other = worse === A ? B : A;
      article(w, K, 'paddock', `BAD BLOOD BETWEEN ${UP(A.last)} AND ${UP(B.last)}`, [
        `That's ${es.length} times ${A.full} and ${B.full} have come together this ${s.name} season, and the paddock has stopped calling it a coincidence.`,
        `"I race everyone the same," said ${worse.last}. ${other.last} was asked about that and laughed for some time.`,
        a === 'P' || b === 'P' ? `${w.player.name}'s team declined to comment.` : `Neither team would say whether the two have spoken.`,
      ], { s: s.id });
      break;
    }
    // teammates in each other's way
    for (const e of season.filter(e => e.r === w.round)) {
      const ta = K.teamOfPid(w, e.a); if (!ta || ta !== K.teamOfPid(w, e.b) || !once(`mates:${y}:${w.round}:${ta}`)) continue;
      const t = w.teams[ta], A = who(w, K, e.a), B = who(w, K, e.b);
      article(w, K, 'paddock', `${UP(t.name)} TEAMMATES COLLIDE`, [
        `${A.full} and ${B.full} made contact at ${w.series[s.id].cal[w.round].name}, which is the one thing teammates are asked not to do.`,
        ta === w.player.team ? `As the owner of the team and one of the drivers involved, ${w.player.name} is in the unusual position of having to have a word with themselves.` : `"We'll talk about it on Monday," said a ${t.name} spokesperson. It was Sunday.`,
      ], { s: s.id });
    }
    const res = w.series[s.id].results, st = K.standings(w, s.id);
    if (s.id !== sid) continue; // (the other series: feuds and collisions only)
    // a team with nothing to show for it
    if (res.length >= 3) for (const e of K.teamStandings(w, s.id)) {
      if (e.pts > 0 || e.tid === w.player.team || !once(`crisis:${y}:${e.tid}`)) continue;
      const t = w.teams[e.tid];
      article(w, K, 'paddock', `PRESSURE BUILDS AT ${UP(t.name)}`, [
        `${res.length} rounds into the ${s.name} season, ${t.name} have not scored a point.`,
        `The team insists the car is "fundamentally good" and that results will come. It said the same thing last year.`,
      ], { s: s.id });
    }
    // a driver on a run: three podiums in a row
    if (res.length >= 3) for (const r of res.at(-1).rows) {
      if (r.dnf || r.pos > 3 || r.pid === 'P' || !res.slice(-3).every(x => { const q = x.rows.find(z => z.pid === r.pid); return q && !q.dnf && q.pos <= 3; }) || !once(`form:${y}:${r.pid}`)) continue;
      const D = who(w, K, r.pid);
      article(w, K, 'paddock', `${UP(D.last)}: THE ONE TO BEAT`, [
        `Three podiums in three races. ${D.full} has become the driver everyone else in the ${s.name} measures themselves against.`,
        traitsOf(D).includes('digger') ? `"I've been saying it for a while," said ${D.last}, who has.` : `"I'm just taking it one race at a time," said ${D.last}, which is what people say when it's going very well.`,
      ], { s: s.id });
      break;
    }
    // a rookie on the podium
    for (const r of res.at(-1)?.rows || []) {
      const p = w.people[r.pid]; if (!p || r.dnf || r.pos === 1 || r.pos > 3 || K.ageOf(w, p) > 21 || p.pods !== 1 || !once(`rookie:${p.id}`)) continue; // (a win has its own headline)
      article(w, K, 'paddock', `ROOKIE ${UP(p.last)} ON THE PODIUM`, [
        `${p.first} ${p.last}, ${K.ageOf(w, p)}, finished ${ordinal(r.pos)} at ${res.at(-1).track} for a first ${s.name} podium.`,
        p.team === w.player.team ? `Team owner ${w.player.name} says they always knew. They did not say so beforehand.` : `${w.teams[p.team].name} say they always knew. They did not say so beforehand.`,
      ], { s: s.id });
    }
    // last year's champion off the pace
    const champ = w.seasons.at(-1)?.champs?.[s.id];
    if (champ && champ !== 'P' && res.length >= 3 && w.people[champ]?.series === s.id && !res.slice(-3).some(x => { const q = x.rows.find(z => z.pid === champ); return q && !q.dnf && q.pos <= 3; }) && once(`slump:${y}:${champ}`)) {
      const D = who(w, K, champ);
      article(w, K, 'paddock', `WHAT'S WRONG WITH ${UP(D.last)}?`, [
        `Last year's ${s.name} champion has not been on the podium for three races. ${D.full} is ${ordinal(st.findIndex(e => e.pid === champ) + 1)} in the standings.`,
        `"There's nothing wrong," said ${D.last}. "Write that I said there's nothing wrong."`,
      ], { s: s.id });
    }
  }
  // the rumour mill: halfway through, the best driver below is linked with a team above
  if (w.round === Math.floor(w.opts.len / 2) && once(`silly:${y}`)) {
    for (const s of K.SERIES.slice(0, -1)) {
      const up = K.SERIES[s.tier + 1], st = K.standings(w, s.id), top = st.find(e => e.pid !== 'P'); if (!top) continue;
      const D = who(w, K, top.pid), teams = w.series[up.id].teams.map(t => w.teams[t]), t = teams[Math.floor(K.rng(w) * teams.length)];
      article(w, K, 'paddock', `${UP(D.last)} LINKED WITH ${UP(t.name)}`, [
        `${D.full}, ${ordinal(st.findIndex(e => e.pid === top.pid) + 1)} in the ${s.name}, has been seen in the ${t.name} hospitality unit at two ${up.name} rounds, according to people who notice these things.`,
        `${D.team?.name || 'The team'} say ${D.last} is "fully committed". ${t.name} said they don't comment on rumours, then commented on it.`,
      ], { s: s.id });
    }
  }
}

// ---------- the column: Pit Wall, by Ray Dunning (power rankings, and opinions nobody asked for) ----------
function column(w, K, sid) {
  const s = K.seriesById(sid), res = w.series[sid].results.slice(-3); if (res.length < 2) return;
  const form = {};
  for (const r of res) for (const row of r.rows) form[row.pid] = (form[row.pid] || 0) + (row.dnf ? 0 : Math.max(0, 13 - row.pos));
  const top = Object.entries(form).sort((a, b) => b[1] - a[1]).slice(0, 5);
  // (each phrase once per column)
  const used = new Set(), fresh = (a) => { const left = a.filter(x => !used.has(x)), x = K.pick(w, left.length ? left : a); used.add(x); return x; };
  const blurb = (pid, k) => {
    const D = who(w, K, pid), t = traitsOf(D);
    if (pid === 'P') return `${w.player.name}. I didn't expect to be writing this name here either.`;
    return D.full + fresh(k === 0 ? ['. Nobody\'s been better lately.', '. On this form, the others are racing for second.']
      : t.includes('hothead') ? ['. Fast, and aiming it in roughly the right direction.'] : t.includes('metronome') ? ['. Never spectacular. Always there.']
      : t.includes('digger') ? [', who will tell you they should be higher.', ', who has opinions about this list.'] : t.includes('mentor') ? ['. Older than most of the grid, quicker than most of it too.']
      : ['. Quietly doing everything right.', '. Better than the points suggest.', '. Consistent, which in this series counts for a lot.', '. Has stopped making mistakes, mostly.', '. Due a win, and probably aware of it.']);
  };
  const list = top.map(([pid], k) => `${k + 1}. ${blurb(pid, k)}`);
  const mine = w.teams[w.player.team].name, myRank = top.findIndex(([pid]) => pid === 'P');
  const aside = myRank >= 0 ? `A word for ${mine}, whose owner is in the top five above. I said in pre-season they wouldn't last until the summer. I'm keeping the column.`
    : K.pick(w, [`Also: ${mine}, the team bought with a lottery ticket, are still here. I give it that much.`, `Still no sign of ${mine} in my top five. Still no sign of them going away, either.`, `Spare a thought for ${mine}, who are learning that a racing team costs about what everyone said it would.`]);
  article(w, K, 'opinion', `PIT WALL: ${K.pick(w, [`WHO'S HOT IN THE ${UP(s.name)}`, `THE STATE OF THE ${UP(s.name)}`, `${UP(s.name)} POWER RANKINGS`])}`, [
    `My power rankings, after ${w.round + 1} rounds of the ${s.name}. Points are for accountants.`,
    ...list, aside,
  ], { s: sid });
}
