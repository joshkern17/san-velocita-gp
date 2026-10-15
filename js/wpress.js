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
  const P = (w.wire ??= { lead: {}, done: {}, n: 0 }); // (w.press is the journalist's opinion of you: wcareer.js)
  const sid = w.player.series;
  for (const s of K.SERIES) {
    const res = w.series[s.id].results.at(-1); if (!res || res.round !== w.round) continue;
    if (s.id === sid) raceReport(w, K, s, res); else brief(w, K, s, res);
    remember(w, s, res);
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

// ---------- how the race went ----------
// race.js records the race as it runs (this.story: the order each time the leader crosses the line, the safety cars,
// the stops, the retirements); wcareer.js digests it into the round's result (res.story) with this, so the report can
// tell the race and not just the result. rows: the series' cars ({ pid, grid, time, lap }): a multiclass race's are
// one class, so every place here is a place in the class. (A simulated round has no story: the report does without.)
export function digestRace(raw, rows) {
  if (!raw || !raw.laps || !raw.laps.length) return null;
  const ids = new Set(rows.map(r => r.pid).filter(Boolean)), mine = (o) => o.filter(p => ids.has(p));
  const grid = Object.fromEntries(rows.filter(r => r.pid && r.grid).sort((a, b) => a.grid - b.grid).map((r, k) => [r.pid, k + 1]));
  const lap1 = Object.fromEntries(mine(raw.laps[0].o).map((p, k) => [p, k + 1]));
  const lead = [];
  for (const L of raw.laps) { const p = mine(L.o)[0]; if (!p) continue; const x = lead.at(-1); if (x && x.pid === p) x.to = L.n; else lead.push({ pid: p, from: L.n, to: L.n }); }
  // (the gap to second, the last few laps: only when the whole field is the one class, so second overall is second)
  const one = raw.laps.every(L => mine(L.o).length === L.o.length), gaps = one ? raw.laps.slice(-4).map(L => L.gap).filter(x => x != null) : [];
  const [a, b] = rows.filter(r => r.pid && r.time != null);
  const margin = a && b && a.lap === b.lap ? Math.round((b.time - a.time) * 100) / 100 : null;
  return { laps: raw.laps.at(-1).n, grid, lap1, lead, margin, gaps,
    yellow: raw.sc.map(x => ({ lap: x.lap, k: x.k, why: x.why || null })),
    stops: raw.stops.filter(x => ids.has(x.pid)), out: raw.out.filter(x => ids.has(x.pid)) };
}

// the Wire's memory of who won where (each series, each circuit): "last year's winner here"
function remember(w, s, res) {
  const fin = res.rows.filter(r => !r.dnf).sort((a, b) => a.pos - b.pos); if (!fin.length) return;
  const T = ((w.wire.past ??= {})[s.id] ??= {}), L = (T[res.track] ??= []);
  if (!L.some(x => x.y === w.year)) L.push({ y: w.year, pid: fin[0].pid });
}
const TYRE = { soft: 'softs', medium: 'mediums', hard: 'hards', wet: 'wets', inter: 'intermediates', dirt: 'dirt tires' };
const secs = (t) => t < 1 ? `${t.toFixed(2)} seconds` : t < 10 ? `${t.toFixed(1)} seconds` : `${Math.round(t)} seconds`;
const nWord = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
const laps = (n) => n === 1 ? 'the first lap' : `the first ${nWord(n)} laps`;
const outWhy = (o) => o.why === 'engine' ? 'when the engine let go' : o.why === 'failure' ? `with a broken ${o.part === 'suspension' ? 'suspension' : o.part || 'car'}` : o.why === 'crash' ? 'in a crash' : o.why === 'dsq' ? 'when the stewards stopped the car' : 'with a problem';

// ---------- the race report ----------
function raceReport(w, K, s, res) {
  const rows = res.rows.slice().sort((a, b) => (a.dnf - b.dnf) || a.pos - b.pos), fin = rows.filter(r => !r.dnf);
  if (!fin.length) return;
  const D = res.story || null, name = (pid) => who(w, K, pid);
  const W = who(w, K, fin[0].pid), second = fin[1] && who(w, K, fin[1].pid), third = fin[2] && who(w, K, fin[2].pid);
  const cal = w.series[s.id].cal[res.round] || {}, wet = res.weather === 'rain', night = cal.time === 'night';
  const prev = w.series[s.id].results.slice(0, -1), streak = (() => { let n = 1; for (let i = prev.length - 1; i >= 0; i--) { const r = prev[i].rows.find(x => x.pos === 1 && !x.dnf); if (r && r.pid === fin[0].pid) n++; else break; } return n; })();
  const winsNow = fin[0].pid === 'P' ? w.player.wins : W.p ? W.p.wins : 0, first = winsNow === 1;
  const ts = K.teamStandings(w, s.id), wTeam = K.teamOfPid(w, fin[0].pid), wTeamPos = ts.findIndex(e => e.tid === wTeam) + 1, underdog = wTeamPos > Math.ceil(ts.length / 2) && res.round >= 2;
  const fl = rows.find(r => r.fl), flW = fl && fl.pid !== fin[0].pid ? who(w, K, fl.pid) : null;
  const wGrid = D && D.grid[fin[0].pid], lastLead = D && D.lead.at(-1), late = lastLead && D.lead.length > 1 && lastLead.pid === fin[0].pid && D.laps - lastLead.from <= 3;
  // the headline
  const head = first && fin[0].pid !== 'P' ? `FIRST WIN FOR ${UP(W.last)}` : streak >= 3 ? `${UP(W.last)} MAKES IT ${['', '', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'][streak] || streak}`
    : late ? `${UP(W.last)} SNATCHES IT AT ${UP(res.track)}` : wGrid >= 6 ? `${UP(W.last)} WINS FROM ${UP(ordinal(wGrid))} AT ${UP(res.track)}`
    : wet ? `${UP(W.last)} WINS IN THE RAIN AT ${UP(res.track)}` : underdog ? `${UP(W.last)} WINS FOR ${UP(W.team?.name || 'THE MIDFIELD')}` : `${UP(W.last)} WINS AT ${UP(res.track)}`;
  // the lede
  const where = `at ${res.track}${wet ? ', in the rain' : night ? ', under the lights' : ''}`;
  const lede = first ? `${W.full} won a ${s.name} race for the first time ${where}, ${(() => { const n = fin[0].pid === 'P' ? w.player.starts : W.p ? W.p.starts : 1; return n <= 1 ? 'on debut' : `at the ${ordinal(n)} attempt`; })()}.`
    : streak >= 3 ? `${W.full} won ${where} for a ${NUM[streak] || ordinal(streak)} win in a row.`
    : `${W.full} won round ${res.round + 1} of the ${s.name} ${where}.`;
  const podium = second ? `${second.full}${third ? ` and ${third.full}` : ''} ${third ? 'completed the podium' : 'was second'}.` : '';
  const und = underdog ? ` It was a rare good day for ${W.team.name}, ${ordinal(wTeamPos)} of ${ts.length} in the team standings before the weekend.` : '';
  const hits = w.ledger.filter(e => e.y === w.year && e.r === res.round && e.s === s.id && (e.type === 'contact' || K.DIRTY[e.type]));
  const story = D ? raceStory(w, K, D, fin, hits) : [];
  // the finish: the margin (and whether it was shrinking), the closest of the year
  let finish = '';
  if (D && D.margin != null && second) {
    const g = D.gaps, closing = g.length >= 3 && g[0] - g.at(-1) >= 1 && D.margin < 3;
    const before = prev.map(x => x.story && x.story.margin).filter(x => x != null), closest = before.length >= 2 && D.margin < Math.min(...before);
    finish = D.margin < 0.3 ? `${W.last} crossed the line ${secs(D.margin)} ahead of ${second.last}${closest ? ', the closest finish of the season' : ''}.`
      : D.margin >= 15 ? `${W.last} won by ${secs(D.margin)}, which in the ${s.name} is a long way.`
      : `The winning margin was ${secs(D.margin)}${closing ? `, and ${second.last} was taking big chunks out of it at the end` : ''}${closest ? `. Nobody has won by less this season` : ''}.`;
  }
  // the championship
  const st = K.standings(w, s.id), lead = st[0], ld = who(w, K, lead.pid), gap = st[1] ? lead.pts - st[1].pts : 0, left = w.opts.len - res.round - 1, before = w.wire.lead[s.id];
  const most = 26, next = w.series[s.id].cal[res.round + 1];
  const champ = left <= 0 ? '' : (before && before !== lead.pid && res.round > 0
    ? `${ld.full} now leads the championship, ${gap} point${gap === 1 ? '' : 's'} clear of ${who(w, K, st[1].pid).full}, with ${left} round${left === 1 ? '' : 's'} to go.`
    : gap === 0 && st[1] ? `${ld.full} and ${who(w, K, st[1].pid).full} are level on points at the top, with ${left} round${left === 1 ? '' : 's'} left.`
    : `${ld.full} leads the championship by ${gap} point${gap === 1 ? '' : 's'} with ${left} round${left === 1 ? '' : 's'} left.${gap <= 5 && res.round >= 2 ? ' It is not comfortable.' : gap >= 30 && gap <= (left - 1) * most ? ' It is starting to look comfortable.' : ''}`)
    + (gap > left * most ? ` Nobody can catch ${ld.last} now; the rest of the season is a formality, and will be held anyway.` : gap > (left - 1) * most && next ? ` ${ld.last} can settle it at ${next.name}.` : '');
  // what went wrong for people: contact (the ledger), then retirements (when, and why, from the story)
  const out = rows.filter(r => r.dnf && !r.dsq), inc = [];
  for (const e of hits.slice(0, 2)) {
    const A = who(w, K, e.a), B = who(w, K, e.b), ended = out.find(r => r.pid === e.b), o = D && D.out.find(x => x.pid === e.b);
    if (K.DIRTY[e.type]) inc.push(`${B.full} was unhappy with ${A.full} after what looked like a ${K.DIRTY[e.type][0]}. The stewards took no action.`);
    else inc.push(`${A.full} and ${B.full} touched${ended ? `, which ended ${B.last}'s race${o ? ` on lap ${o.lap}` : ''}` : ''}${e.blame ? `; most of the paddock put it on ${A.last}` : ''}.`);
  }
  const named = new Set(D ? D.yellow.map(x => D.out.find(o => o.why === 'crash' && o.lap >= x.lap - 1 && o.lap <= x.lap)?.pid).filter(Boolean) : []);
  const quiet = out.filter(r => !hits.some(e => e.b === r.pid || e.a === r.pid) && !named.has(r.pid));
  if (D && quiet.length) {
    const said = quiet.map(r => ({ r, o: D.out.find(x => x.pid === r.pid) })).sort((a, b) => (a.o?.lap ?? 99) - (b.o?.lap ?? 99));
    for (const { r, o } of said.slice(0, 3)) inc.push(o ? `${name(r.pid).full} ${o.why === 'crash' ? `crashed out on lap ${o.lap}` : `retired on lap ${o.lap} ${outWhy(o)}`}.` : `${name(r.pid).full} retired.`);
    if (said.length > 3) inc.push(`${said.length - 3} more didn't make the finish, which the teams concerned would rather not discuss.`);
  } else if (quiet.length) { const q = quiet.map(r => name(r.pid).full); inc.push(`${q.length === 1 ? `${q[0]} retired` : `${q.slice(0, -1).join(', ')} and ${q.at(-1)} retired`}${q.length > 2 ? ', which the teams concerned would rather not discuss' : ''}.`); }
  if (flW) inc.push(`${flW.full} set the fastest lap.`);
  // the newcomers (you)
  const me = rows.find(r => r.pid === 'P'), mine = w.teams[w.player.team], mateId = mine.drivers.find(d => d !== 'P'), mr = mateId && rows.find(r => r.pid === mateId), M = mateId && who(w, K, mateId);
  let you = '';
  if (me && fin[0].pid !== 'P') {
    const g = D && D.grid.P, up = g && !me.dnf && g - me.pos >= 3, down = g && !me.dnf && me.pos - g >= 3;
    const was = up ? `came from ${ordinal(g)} on the grid to finish ${ordinal(me.pos)}` : down ? `started ${ordinal(g)} and finished ${ordinal(me.pos)}` : `${me.pos >= rows.length - 1 ? 'finished' : 'was'} ${ordinal(me.pos)}`;
    you = me.dnf ? `${mine.name}'s ${w.player.name} did not finish.` : me.pos <= 3 ? `${w.player.name} ${was} for ${mine.name}, a podium for the lottery-funded team.`
      : `${w.player.name} ${was} for ${mine.name}.`;
    if (mr && M) you += mr.dnf ? ` Teammate ${M.full} retired.` : ` Teammate ${M.full} was ${ordinal(mr.pos)}${!me.dnf && mr.pos < me.pos ? ', ahead of the team owner' : ''}.`;
    if (me.dnf && mr && mr.dnf) you += ' Neither car finished.';
  }
  // a quote: the winner most of the time; sometimes someone who got hit
  const hit = hits.find(e => e.type === 'contact' && e.blame && e.b !== 'P');
  const q = hit && K.rng(w) < 0.45 ? victimQuote(w, K, who(w, K, hit.b), who(w, K, hit.a)) : winnerQuote(w, K, W, { first, streak, wet, next: next?.name });
  const close = left > 0 ? `Round ${res.round + 2} is at ${next.name}.` : '';
  article(w, K, 'report', head, [`${lede} ${podium}${und}`, ...story, inc.join(' '), finish, q, context(w, K, s, res, fin, W, second, D, first), champ, you, close], { report: { s: s.id, round: res.round }, s: s.id });
}

// the race itself, from the story: the start, who led and how it changed hands, the yellows, who came through the field
function raceStory(w, K, D, fin, hits) {
  const name = (pid) => who(w, K, pid), win = fin[0].pid, W = name(win), out = [];
  const outOf = (pid, near) => D.out.find(o => o.pid === pid && Math.abs(o.lap - near) <= 1);
  const stopOf = (pid, near) => D.stops.find(x => x.pid === pid && Math.abs(x.lap - near) <= 1);
  // the start
  const g = D.grid[win], l1 = D.lap1[win], pole = Object.keys(D.grid).find(p => D.grid[p] === 1), start = [];
  if (g === 1 && D.lead.length === 1) start.push(`${W.last} started on pole and led every lap.`);
  else if (g) start.push(`${W.last} started ${ordinal(g)}${l1 && l1 < g ? `, and ${l1 === 1 ? 'was leading' : `was up to ${ordinal(l1)}`} by the end of the first lap` : ''}.`);
  if (pole && pole !== win && D.lap1[pole] > 1) { const P = name(pole); start.push(`${P.last} had pole and ${D.lap1[pole] >= 4 ? `was ${ordinal(D.lap1[pole])} a lap later` : 'lost the lead on the first lap'}.`); }
  else if (pole && pole !== win && D.out.some(o => o.pid === pole && o.lap <= 1)) start.push(`Polesitter ${name(pole).last} didn't get to the end of the first lap.`);
  const moved = Object.keys(D.lap1).filter(p => p !== win && D.grid[p]).map(p => ({ p, d: D.grid[p] - D.lap1[p] })).sort((a, b) => b.d - a.d);
  if (moved[0] && moved[0].d >= 3) start.push(`${name(moved[0].p).full} made up ${nWord(moved[0].d)} places off the line.`);
  const lost = moved.at(-1); if (lost && lost.d <= -4 && lost.p !== pole) start.push(`${name(lost.p).last} went the other way, from ${ordinal(D.grid[lost.p])} to ${ordinal(D.lap1[lost.p])}.`);
  if (start.length) out.push(start.join(' '));
  // the lead: who had it and how it changed hands
  const seg = D.lead, ld = [];
  if (seg.length > 5) {
    const names = [...new Set(seg.map(x => x.pid))].map(p => name(p).last);
    ld.push(`The lead changed hands ${seg.length - 1} times between ${names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ')}. ${W.last} took it for the last time on lap ${seg.at(-1).from}${D.laps - seg.at(-1).from <= 3 ? `, with ${nWord(D.laps - seg.at(-1).from + 1)} to go` : ''}.`);
  } else if (seg.length > 1) {
    ld.push(`${name(seg[0].pid).last} led ${laps(seg[0].to)}.`);
    for (let i = 1; i < seg.length; i++) {
      const A = name(seg[i - 1].pid), B = name(seg[i].pid), lap = seg[i].from, togo = D.laps - lap + 1, tail = togo <= 3 ? `, with ${togo === 1 ? 'one lap' : `${nWord(togo)} laps`} to go` : '';
      const o = outOf(seg[i - 1].pid, lap), pa = stopOf(seg[i - 1].pid, lap), pb = stopOf(seg[i].pid, lap), y = D.yellow.find(x => Math.abs(x.lap - lap) <= 1);
      const fight = hits.find(e => [e.a, e.b].includes(seg[i - 1].pid) && [e.a, e.b].includes(seg[i].pid));
      ld.push(o ? `${A.last}'s race ended ${outWhy(o)} on lap ${o.lap}, which handed the lead to ${B.last}.`
        : pa && !pb ? `${A.last} pitted on lap ${pa.lap}${pa.y || y ? ` under the ${y && y.k === 'vsc' ? 'virtual safety car' : 'safety car'}` : ''}; ${B.last} stayed out and took over${tail}.`
        : pa && pb ? `The stops on lap ${lap} put ${B.last} in front${tail}.`
        : fight ? `${B.last} and ${A.last} touched on lap ${lap}, and ${B.last} came out of it in the lead${tail}.`
        : `${B.last} got past ${A.last} on lap ${lap}${tail}.`);
    }
    const ledLaps = seg.filter(x => x.pid === win).reduce((a, x) => a + x.to - x.from + 1, 0);
    if (ledLaps && ledLaps <= 3 && D.laps >= 8) ld.push(`${W.last} led ${ledLaps === 1 ? 'one lap' : `${nWord(ledLaps)} laps`} all race. ${ledLaps === 1 ? 'It was the last one.' : 'They were the right ones.'}`);
  } else if (g && g !== 1) ld.push(`${W.last} was never headed after that.`);
  if (ld.length) out.push(ld.join(' '));
  // the yellows: when, why (a crash just before it), and who took a cheap stop
  const ys = [];
  for (const x of D.yellow.slice(0, 2)) {
    const crash = D.out.find(o => o.why === 'crash' && o.lap >= x.lap - 1 && o.lap <= x.lap), cheap = D.stops.filter(s => s.y && s.lap >= x.lap && s.lap <= x.lap + 2).length;
    const what = x.k === 'vsc' ? 'A virtual safety car' : 'The safety car';
    ys.push(`${what} came out on lap ${x.lap}${crash ? ` after ${name(crash.pid).last} crashed` : x.why ? `, for ${x.why}` : ''}${cheap >= 2 ? `, and ${nWord(cheap)} cars dived into the pits for a cheap stop` : ''}.`);
  }
  if (D.yellow.length > 2) ys.push(`There were ${nWord(D.yellow.length)} neutralizations in all.`);
  // the strategy: the top two on different plans
  if (fin[1]) {
    const s1 = D.stops.filter(x => x.pid === win), s2 = D.stops.filter(x => x.pid === fin[1].pid), two = name(fin[1].pid);
    const n = (k) => k === 0 ? 'no stops' : k === 1 ? 'one stop' : `${nWord(k)} stops`, tyre = s1.at(-1) && TYRE[s1.at(-1).c];
    if (s1.length !== s2.length && (s1.length || s2.length)) ys.push(`${W.last} made ${n(s1.length)}${tyre ? `, running ${tyre} to the end` : ''}, against ${n(s2.length)} for ${two.last}.`);
  }
  if (ys.length) out.push(ys.join(' '));
  // who came through the field
  const climb = fin.filter(r => D.grid[r.pid]).map(r => ({ pid: r.pid, from: D.grid[r.pid], to: r.pos, d: D.grid[r.pid] - r.pos })).filter(x => x.pid !== win && x.d >= 4).sort((a, b) => b.d - a.d)[0];
  if (climb) out.push(`The drive of the day might have been ${name(climb.pid).full}'s, from ${ordinal(climb.from)} on the grid to ${ordinal(climb.to)}.`);
  return out;
}

// what the Wire remembers: who won here before, the winner's record, the top two this season
function context(w, K, s, res, fin, W, second, D, first) {
  const out = [], win = fin[0].pid, prev = w.series[s.id].results.slice(0, -1);
  // this circuit
  const past = (w.wire.past?.[s.id]?.[res.track] || []).filter(x => x.y < w.year);
  if (past.length) {
    const last = past.at(-1), here = past.filter(x => x.pid === win).length, when = last.y === w.year - 1 ? 'last year' : `in ${last.y}`;
    if (last.pid === win) out.push(`${W.last} won here ${when} too${here >= 2 ? `, and has now won at ${res.track} ${nWord(here + 1)} times` : ''}.`);
    else { const L = who(w, K, last.pid), r = res.rows.find(x => x.pid === last.pid); out.push(`${L.full} won here ${when}${r ? r.dnf ? ` and didn't finish this time` : r.pos > 3 ? ` and was ${ordinal(r.pos)} this time` : '' : ''}.`); }
  }
  // the winner's record
  const wins = win === 'P' ? w.player.wins : W.p ? W.p.wins : 0, starts = win === 'P' ? w.player.starts : W.p ? W.p.starts : 0;
  const lastWin = prev.map((x, i) => ({ i, x })).filter(o => o.x.rows.some(r => r.pid === win && r.pos === 1 && !r.dnf)).at(-1);
  if (!first && [5, 10, 15, 20, 25, 30, 40, 50].includes(wins)) out.push(`It was the ${ordinal(wins)} win of ${W.last}'s career, in ${starts} starts.`);
  else if (!first && !lastWin && res.round >= 3) out.push(`It was ${W.last}'s first win of the season.`);
  else if (lastWin && res.round - lastWin.i >= 4) out.push(`${W.last} hadn't won since ${lastWin.x.track}, ${nWord(res.round - lastWin.i)} rounds ago.`);
  // the top two: how often it's been this way round
  if (second) {
    const behind = prev.filter(x => { const a = x.rows.find(r => r.pid === win), b = x.rows.find(r => r.pid === fin[1].pid); return a && b && a.pos === 1 && b.pos === 2; }).length;
    if (behind >= 1) out.push(`That's the ${ordinal(behind + 1)} time this season ${second.last} has finished right behind ${W.last}.`);
  }
  return out.join(' ');
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
  const P = w.wire, once = (key) => { if (P.done[key]) return false; P.done[key] = w.year; return true; }, y = w.year;
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
    for (const s of K.SERIES) {
      const up = K.nextUp(s.id); if (!up) continue;
      const st = K.standings(w, s.id), top = st.find(e => e.pid !== 'P'); if (!top) continue;
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
