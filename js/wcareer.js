// World Career: a persistent motorsport world that keeps going whether or not you race in it.
// Three series (Street Cup -> GT Championship -> Formula SV), six teams of two in each, every driver a person with
// an age, stats that grow and fade, a career history and a record against you. Your races are real; the other series'
// rounds are simulated from the drivers' ratings. At the end of a season people age, retire, get promoted or dropped,
// and rookies arrive. News and texts (shown on the phone) are written from what actually happened.
// No story arcs yet (that's the director, later): this is the world they will read from.

// ---------------- data ----------------
export const SEASON_LENGTHS = [4, 6, 8, 12];
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SERIES = [
  { id: 'street', name: 'Street Cup', cls: 'street', tier: 0, base: 50, spread: 14 },
  { id: 'gt', name: 'GT Championship', cls: 'gt1', tier: 1, base: 63, spread: 12 },
  { id: 'formula', name: 'Formula SV', cls: 'f1', tier: 2, base: 76, spread: 10 },
];
export const seriesById = (id) => SERIES.find(s => s.id === id);
const TEAMS_PER = 6, SEATS = 2;

const TEAM_POOL = [
  ['Kobra Oil GP', 0x121214, 0xf2c21b], ['Azure Motorsport', 0x1d4fb8, 0xff7b1a], ['Verde Corse', 0x1c7a3a, 0xf0e6c8],
  ['Neon FM Racing', 0x8d2bd8, 0x3ef0ff], ['Sunset Motel', 0xf07a2a, 0x2a1a60], ['Silverline', 0xb8bcc4, 0x0bb3a8],
  ['Burger Duck', 0xf4c01a, 0xb31313], ['Rapid Tyres', 0xffffff, 0x1a4fb0], ['Bayside Blue', 0x0e2a55, 0xe8e8e8],
  ['Mesa Energy', 0x7a3b12, 0xffb13a], ['Pine Hollow', 0x2c3a2c, 0xa4e04a], ['Harbour Lights', 0x16324a, 0xffd84a],
  ['Kanjo Works', 0x0a0a0a, 0xff2b6a], ['Palm Bay Autosport', 0x14a39a, 0xff5a8a], ['Redline Garage', 0xb0101a, 0x101010],
  ['Northwind', 0xdfe8f2, 0x1a2a6a], ['Coastline Racing', 0x2a7fd0, 0xf2f2f2], ['Maple Motorsport', 0x8a1c1c, 0xf2c45a],
  ['Volt Arc', 0x22252c, 0x7dff3a], ['Copperhead', 0xb5652a, 0x1a1a1a],
];
const NATS = {
  ITA: { f: ['Luca', 'Marco', 'Giulia', 'Matteo', 'Sofia', 'Andrea', 'Elena'], l: ['Rossi', 'Bianchi', 'Moretti', 'Ferraro', 'Conti', 'Greco', 'Marino', 'Rinaldi'] },
  GBR: { f: ['Oliver', 'Jack', 'Amelia', 'Harry', 'Isla', 'George', 'Freya'], l: ['Hughes', 'Walker', 'Bennett', 'Shaw', 'Fletcher', 'Hale', 'Marsh', 'Price'] },
  JPN: { f: ['Kenta', 'Yuki', 'Haruto', 'Aoi', 'Ren', 'Sora', 'Mei'], l: ['Tanaka', 'Nakamura', 'Sato', 'Kobayashi', 'Mori', 'Ishida', 'Okada', 'Fujita'] },
  BRA: { f: ['Rafael', 'Lucas', 'Ana', 'Thiago', 'Beatriz', 'Pedro', 'Caio'], l: ['Ferreira', 'Souza', 'Almeida', 'Costa', 'Barbosa', 'Ribeiro', 'Lima', 'Teixeira'] },
  GER: { f: ['Lukas', 'Felix', 'Lena', 'Jonas', 'Mia', 'Paul', 'Nico'], l: ['Schmidt', 'Becker', 'Wagner', 'Hoffmann', 'Krause', 'Vogel', 'Brandt', 'Keller'] },
  FRA: { f: ['Julien', 'Hugo', 'Camille', 'Louis', 'Chloe', 'Theo', 'Manon'], l: ['Moreau', 'Laurent', 'Girard', 'Fontaine', 'Mercier', 'Dubois', 'Leroy', 'Picard'] },
  ESP: { f: ['Carlos', 'Diego', 'Lucia', 'Pablo', 'Marta', 'Alvaro', 'Ines'], l: ['Valdez', 'Ortega', 'Navarro', 'Romero', 'Serrano', 'Molina', 'Castillo', 'Rubio'] },
  SWE: { f: ['Erik', 'Oskar', 'Elsa', 'Viktor', 'Astrid', 'Nils', 'Linnea'], l: ['Lindqvist', 'Berg', 'Holm', 'Sandberg', 'Lund', 'Ek', 'Nyberg', 'Strand'] },
  POL: { f: ['Jakub', 'Kacper', 'Zofia', 'Filip', 'Maja', 'Tomasz', 'Ola'], l: ['Kowalski', 'Nowak', 'Wisniewski', 'Zielinski', 'Mazur', 'Krol', 'Wrobel', 'Dudek'] },
  NGA: { f: ['Emeka', 'Tunde', 'Ada', 'Chidi', 'Ngozi', 'Femi', 'Kemi'], l: ['Okonkwo', 'Okafor', 'Adeyemi', 'Eze', 'Balogun', 'Nwosu', 'Obi', 'Afolabi'] },
  USA: { f: ['Tyler', 'Cody', 'Madison', 'Logan', 'Avery', 'Mason', 'Riley'], l: ['Carter', 'Brooks', 'Hayes', 'Reed', 'Dalton', 'Parker', 'Quinn', 'Sawyer'] },
  AUS: { f: ['Liam', 'Cooper', 'Ruby', 'Harrison', 'Zoe', 'Mitchell', 'Tahlia'], l: ['Kelly', 'Doyle', 'Byrne', 'McRae', 'Gibbs', 'Tully', 'Lowe', 'Pearce'] },
  MEX: { f: ['Sergio', 'Mateo', 'Valeria', 'Emilio', 'Ximena', 'Rodrigo', 'Paola'], l: ['Herrera', 'Mendoza', 'Vargas', 'Rios', 'Cruz', 'Salazar', 'Guerra', 'Lozano'] },
  KOR: { f: ['Minjun', 'Jiho', 'Seoyeon', 'Hyun', 'Yuna', 'Doyun', 'Jisoo'], l: ['Kim', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon', 'Han', 'Seo'] },
};
const NAT_KEYS = Object.keys(NATS);

// ---------------- seeded random (the world is reproducible from its seed) ----------------
function rng(w) { w.rs = (w.rs * 16807) % 2147483647; return (w.rs - 1) / 2147483646; }
const gauss = (w) => { let s = 0; for (let i = 0; i < 4; i++) s += rng(w); return (s - 2) * 1.7; };
const pick = (w, a) => a[Math.floor(rng(w) * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r0 = (v) => Math.round(v);

// ---------------- people ----------------
function makePerson(w, { age, series, lvl }) {
  const nat = pick(w, NAT_KEYS), N = NATS[nat];
  let last, tries = 0;
  do { last = pick(w, N.l); tries++; } while (tries < 20 && Object.values(w.people).some(p => p.last === last && !p.retired));
  const id = 'd' + (w.nextId++);
  const pace = clamp(lvl + gauss(w) * 6, 25, 97);
  const p = {
    id, first: pick(w, N.f), last, nat, born: w.year - age,
    pace, cons: clamp(45 + (age - 17) * 2.2 + gauss(w) * 9, 20, 96), craft: clamp(pace - 5 + gauss(w) * 9, 20, 96),
    wet: clamp(50 + gauss(w) * 14, 15, 97), aggr: clamp(50 + gauss(w) * 16, 8, 96),
    // where their pace is heading: young drivers grow toward this, it peaks around peakAge, then fades
    pot: clamp(pace + Math.max(0, 26 - age) * (2.2 + rng(w) * 2.6) + gauss(w) * 6, pace, 93 + rng(w) * 4),
    peakAge: r0(26 + rng(w) * 5), retireAge: r0(33 + rng(w) * 7),
    series, team: null, retired: false,
    starts: 0, wins: 0, pods: 0, titles: 0, hist: [],
  };
  w.people[id] = p;
  return p;
}
export const ageOf = (w, p) => w.year - p.born;
export const nameOf = (p) => p ? `${p.first} ${p.last}` : '';
export const shortName = (p) => p ? `${p.first[0]}. ${p.last}`.toUpperCase() : '';

// ---------------- new world ----------------
// opts: { name, number, len, difficulty, laps, weekend, pracLen, qualiLen, pool, seed, teamName, colors: [main, accent] }
export function newWorld(opts, trackPool) {
  const w = { v: 1, kind: 'world', rs: (opts.seed || Date.now()) % 2147483646 + 1, nextId: 1, year: 2026, round: 0, over: false,
    opts: { len: opts.len || 6, difficulty: opts.difficulty || 'medium', laps: opts.laps || 5, weekend: opts.weekend || 'quali', pracLen: opts.pracLen || 1200, qualiLen: opts.qualiLen || 600, pool: opts.pool || 'presets' },
    people: {}, teams: {}, series: {}, news: [], msgs: [], mail: [], ledger: [], h2h: {}, seasons: [],
    player: { name: (opts.name || 'Driver').trim(), number: opts.number || 7, series: 'street', team: 'T0', starts: 0, wins: 0, pods: 0, titles: 0, hist: [], offer: null } };
  // teams: yours in the Street Cup, 17 more across the ladder
  const pool = TEAM_POOL.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng(w) * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  let k = 0;
  for (const s of SERIES) {
    const ids = [];
    for (let t = 0; t < TEAMS_PER; t++) {
      if (s.id === 'street' && t === 0) {
        w.teams.T0 = { id: 'T0', name: opts.teamName || 'Your Team', main: opts.colors?.[0] ?? 0xc8141c, accent: opts.colors?.[1] ?? 0xf2f2f2, series: s.id, car: s.base - 4, mine: true, drivers: [] };
        ids.push('T0'); continue;
      }
      const [name, main, accent] = pool[k++];
      const id = 'T' + (k);
      w.teams[id] = { id, name, main, accent, series: s.id, car: clamp(s.base + gauss(w) * 5, 20, 98), drivers: [] };
      ids.push(id);
    }
    w.series[s.id] = { teams: ids, cal: [], results: [] };
  }
  // drivers: two per team (your team: you + one AI teammate)
  for (const s of SERIES) for (const tid of w.series[s.id].teams) {
    const t = w.teams[tid];
    for (let seat = 0; seat < SEATS; seat++) {
      if (t.mine && seat === 0) { t.drivers.push('P'); continue; }
      const age = s.tier === 0 ? r0(18 + rng(w) * 9) : s.tier === 1 ? r0(21 + rng(w) * 13) : r0(22 + rng(w) * 14);
      const p = makePerson(w, { age, series: s.id, lvl: s.base + gauss(w) * s.spread * 0.4 });
      p.team = tid; t.drivers.push(p.id);
    }
  }
  // a few free agents waiting for a seat
  for (let i = 0; i < 6; i++) makePerson(w, { age: r0(17 + rng(w) * 4), series: null, lvl: 42 + gauss(w) * 6 });
  newCalendars(w, trackPool);
  seasonOpenNews(w);
  return w;
}

// a season's calendar per series: circuits drawn from the pool, conditions rolled per round
export function newCalendars(w, trackPool) {
  const names = trackPool.map(t => t.name);
  for (const s of SERIES) {
    const order = names.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng(w) * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const cal = [];
    for (let r = 0; r < w.opts.len; r++) {
      const name = order[r % order.length], tr = trackPool.find(t => t.name === name);
      const x = rng(w), time = x < 0.55 ? (tr?.env?.time || 'day') : x < 0.8 ? 'dusk' : 'night';
      const y = rng(w), weather = y < 0.7 ? 'clear' : y < 0.85 ? 'overcast' : y < 0.95 ? 'rain' : 'fog';
      cal.push({ name, time, weather });
    }
    w.series[s.id].cal = cal;
    w.series[s.id].results = [];
  }
}

// ---------------- ratings: what makes a driver fast in a race ----------------
export function rating(w, pid) {
  if (pid === 'P') return null;
  const p = w.people[pid], t = w.teams[p.team];
  return p.pace * 0.6 + (t ? t.car : 50) * 0.25 + 15 + (p.form || 0);
}
// race.js knobs for an AI driver: pace multiplier on the difficulty's pace, aggression, mistake rate
export function raceKnobs(w, pid, rain) {
  const p = w.people[pid], r = rating(w, pid);
  let pace = clamp(1 - (95 - r) * 0.0011, 0.88, 1);
  if (rain) pace *= 1 + (p.wet - 50) * 0.0004;
  return { pace, aggr: clamp(0.15 + p.aggr / 100 * 0.85, 0.1, 1), mistakes: clamp(1.8 - p.cons / 100 * 1.4, 0.35, 1.6) };
}

// the entry list of your series this round: 11 AI drivers in race slots 1..11 (slot 0 is yours), teammates side by side
export function raceEntries(w) {
  const S = w.series[w.player.series], round = S.cal[w.round], rain = round.weather === 'rain';
  const entries = {}, teamPace = {}, roster = [];
  let slot = 1;
  for (const tid of S.teams) {
    const t = w.teams[tid];
    for (const pid of t.drivers) {
      if (pid === 'P') continue;
      const p = w.people[pid], k = raceKnobs(w, pid, rain);
      entries[slot] = { pid, tid, teamNo: S.teams.indexOf(tid), name: shortName(p).replace(/^\w\. /, ''), team: { name: t.name, main: t.main, accent: t.accent, helmet: t.accent, driver: shortName(p) }, aggr: k.aggr, mistakes: k.mistakes };
      teamPace[slot] = k.pace;
      roster.push(slot++);
    }
  }
  return { entries, teamPace, roster };
}

// ---------------- results ----------------
function standings(w, sid) {
  const tab = {};
  const S = w.series[sid];
  for (const tid of S.teams) for (const pid of w.teams[tid].drivers) tab[pid] = { pid, pts: 0, wins: 0, pods: 0, best: 99, dnf: 0 };
  for (const res of S.results) for (const r of res.rows) {
    const e = tab[r.pid] || (tab[r.pid] = { pid: r.pid, pts: 0, wins: 0, pods: 0, best: 99, dnf: 0, gone: true });
    e.pts += r.pts; if (r.pos === 1 && !r.dnf) e.wins++; if (r.pos <= 3 && !r.dnf) e.pods++; if (!r.dnf) e.best = Math.min(e.best, r.pos); else e.dnf++;
  }
  return Object.values(tab).sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.best - b.best);
}
export function seriesStandings(w, sid) { return standings(w, sid); }
export function teamStandings(w, sid) {
  const st = standings(w, sid), by = {};
  for (const e of st) { const tid = teamOfPid(w, e.pid); if (!tid) continue; (by[tid] = by[tid] || { tid, pts: 0, wins: 0 }); by[tid].pts += e.pts; by[tid].wins += e.wins; }
  return Object.values(by).sort((a, b) => b.pts - a.pts || b.wins - a.wins);
}
export function teamOfPid(w, pid) { return pid === 'P' ? w.player.team : w.people[pid]?.team; }
export const personOf = (w, pid) => pid === 'P' ? null : w.people[pid];
export function displayName(w, pid, short = false) {
  if (pid === 'P') return short ? w.player.name.split(' ').pop().toUpperCase() : w.player.name;
  const p = w.people[pid]; return short ? shortName(p) : nameOf(p);
}

// points + bookkeeping for a finished round of one series. rows: [{ pid, pos, dnf, fl }]
function scoreRound(w, sid, rows, extra = {}) {
  const S = w.series[sid];
  rows.forEach(r => { r.pts = r.dnf || r.dsq ? 0 : (POINTS[r.pos - 1] || 0) + (r.fl && r.pos <= 10 ? 1 : 0); });
  S.results.push({ round: w.round, track: S.cal[w.round].name, weather: S.cal[w.round].weather, rows, ...extra });
  for (const r of rows) {
    const p = r.pid === 'P' ? w.player : w.people[r.pid]; if (!p) continue;
    p.starts++; if (!r.dnf) { if (r.pos === 1) p.wins++; if (r.pos <= 3) p.pods++; }
  }
}

// one simulated race: ratings + a random day + the odd retirement and collision (the ledger keeps them)
function simRace(w, sid, withPlayer = false) {
  const S = w.series[sid], cal = S.cal[w.round], rain = cal.weather === 'rain';
  const pids = [];
  for (const tid of S.teams) for (const pid of w.teams[tid].drivers) if (pid !== 'P' || withPlayer) pids.push(pid);
  const field = pids.map(pid => {
    let r, p = w.people[pid];
    if (pid === 'P') { const rs = pids.filter(x => x !== 'P').map(x => rating(w, x)).sort((a, b) => b - a); r = rs[Math.floor(rs.length * 0.4)]; p = { cons: 70, wet: 50, aggr: 50, craft: 60 }; }
    else r = rating(w, pid);
    let score = r + gauss(w) * (2.6 + (100 - p.cons) * 0.045) + (p.craft - 50) * 0.04;
    if (rain) score += (p.wet - 50) * 0.12 + gauss(w) * 2;
    const dnfP = 0.025 + (100 - p.cons) * 0.0005 + p.aggr * 0.00025 + (rain ? 0.03 : 0);
    return { pid, score, dnf: rng(w) < dnfP, aggr: p.aggr };
  }).sort((a, b) => (a.dnf - b.dnf) || b.score - a.score);
  // contact between cars fighting for position
  for (let i = 0; i < field.length - 1; i++) {
    const a = field[i], b = field[i + 1];
    if (a.dnf || b.dnf || Math.abs(a.score - b.score) > 2.5) continue;
    if (rng(w) < 0.035 * (a.aggr + b.aggr) / 100) {
      const blameB = rng(w) < b.aggr / (a.aggr + b.aggr);
      logLedger(w, { s: sid, type: 'contact', a: blameB ? b.pid : a.pid, b: blameB ? a.pid : b.pid, blame: true, sim: true });
      if (rng(w) < 0.35) { (blameB ? a : b).dnf = true; }
    }
  }
  field.sort((a, b) => (a.dnf - b.dnf) || b.score - a.score);
  const flPool = field.filter(f => !f.dnf).slice(0, 6), fl = flPool.length ? flPool[Math.floor(rng(w) * flPool.length)].pid : null;
  return field.map((f, k) => ({ pid: f.pid, pos: k + 1, dnf: f.dnf, fl: f.pid === fl }));
}

function logLedger(w, e) {
  w.ledger.push({ y: w.year, r: w.round, ...e });
  if (w.ledger.length > 3000) w.ledger.splice(0, w.ledger.length - 3000);
  // your head-to-head record lives with each driver
  if (e.a === 'P' || e.b === 'P') {
    const other = e.a === 'P' ? e.b : e.a, h = h2hOf(w, other);
    if (e.type === 'contact') { h.contacts++; if (e.blame) { if (e.a === 'P') h.youHit++; else h.hitYou++; } }
    if (e.type === 'pass') { if (e.a === 'P') h.youPassed++; else h.passedYou++; }
  }
}
export function h2hOf(w, pid) { return w.h2h[pid] || (w.h2h[pid] = { races: 0, ahead: 0, behind: 0, contacts: 0, youHit: 0, hitYou: 0, youPassed: 0, passedYou: 0 }); }

// ---------------- a round: your race, then everyone else's ----------------
// res: race.js results() rows (with pid: 'P' for you), log: race.js incident log ([{ type, a, b, blame }] by pid)
export function recordPlayerRound(w, res, log = []) {
  const sid = w.player.series;
  const rows = res.map(r => ({ pid: r.isPlayer ? 'P' : r.pid, pos: r.pos, dnf: !!(r.dnf || r.dsq), dsq: !!r.dsq, fl: false, best: r.best }));
  // fastest lap: the quickest best lap among the finishers
  let fl = null; for (const r of rows) if (!r.dnf && isFinite(r.best) && (!fl || r.best < fl.best)) fl = r;
  if (fl) fl.fl = true;
  const known = rows.filter(r => r.pid);
  scoreRound(w, sid, known);
  for (const e of log) if (e.a && e.b) logLedger(w, { s: sid, ...e });
  const me = known.find(r => r.pid === 'P');
  for (const r of known) if (r.pid !== 'P' && me) { const h = h2hOf(w, r.pid); h.races++; if (r.dnf && !me.dnf || (!me.dnf && me.pos < r.pos)) h.ahead++; else h.behind++; }
  return afterRound(w, me);
}
// testing: your race simulated too (you as a mid-field driver)
export function simPlayerRound(w) {
  const rows = simRace(w, w.player.series, true);
  scoreRound(w, w.player.series, rows);
  const me = rows.find(r => r.pid === 'P');
  for (const r of rows) if (r.pid !== 'P') { const h = h2hOf(w, r.pid); h.races++; if (r.dnf && !me.dnf || (!me.dnf && me.pos < r.pos)) h.ahead++; else h.behind++; }
  return afterRound(w, me);
}
function afterRound(w, me) {
  const before = {};
  for (const s of SERIES) if (s.id !== w.player.series) { const rows = simRace(w, s.id); scoreRound(w, s.id, rows); }
  roundNews(w, me);
  w.round++;
  if (w.round >= w.opts.len) seasonEnd(w);
  return { me, over: w.round >= w.opts.len };
}

// ---------------- the end of a season ----------------
function seasonEnd(w) {
  w.over = true;
  const summary = { year: w.year, champs: {}, teamChamps: {}, you: null };
  for (const s of SERIES) {
    const st = standings(w, s.id), tst = teamStandings(w, s.id);
    summary.champs[s.id] = st[0]?.pid; summary.teamChamps[s.id] = tst[0]?.tid;
    st.forEach((e, k) => {
      const tid = teamOfPid(w, e.pid), entry = { y: w.year, s: s.id, team: w.teams[tid]?.name || '', pos: k + 1, pts: e.pts, wins: e.wins, pods: e.pods };
      if (e.pid === 'P') { w.player.hist.push(entry); summary.you = entry; if (k === 0) w.player.titles++; }
      else if (w.people[e.pid]) { w.people[e.pid].hist.push(entry); if (k === 0) w.people[e.pid].titles++; }
    });
  }
  w.seasons.push(summary);
  // your options: move up if you finished in the top three (and there's a series above)
  const tier = seriesById(w.player.series).tier, up = SERIES[tier + 1];
  const you = summary.you;
  if (up && you && you.pos <= 3) {
    w.player.offer = { to: up.id, answer: null };
    mail(w, `${up.name} Entries`, addrOf(up, 'entries'), `An entry for ${w.year + 1}`,
      [`Dear ${w.player.name.split(' ')[0]},`, `Congratulations on finishing P${you.pos} in the ${seriesById(w.player.series).name} this year. We have an entry available in the ${up.name} for ${w.year + 1}, and we would like it to go to ${w.teams[w.player.team].name}.`, `Please let us know before the new season.`, `Entries Office, ${up.name}`],
      { offer: true, choices: [['move', `Accept: move up to the ${up.name}`], ['stay', `Decline: stay in the ${seriesById(w.player.series).name}`]] });
  }
  seasonEndNews(w, summary);
}

// answer a phone choice (the promotion offer)
export function answerOffer(w, ans) { if (w.player.offer) w.player.offer.answer = ans; }

// roll on to the next season: age everyone, retire, promote, sign rookies, new cars, new calendars
export function nextSeason(w, trackPool) {
  const moves = [];
  // last season's team standings, before anyone changes seats (a driver's results stay with the team they drove for)
  const prevTeams = {}; for (const sr of SERIES) prevTeams[sr.id] = teamStandings(w, sr.id).map(e => e.tid).filter(t => w.teams[t]?.series === sr.id);
  w.year++; w.round = 0; w.over = false;
  // people: grow, peak, fade
  for (const p of Object.values(w.people)) {
    if (p.retired) continue;
    const age = ageOf(w, p);
    if (age < p.peakAge) p.pace += Math.max(0, (p.pot - p.pace) * (0.28 + rng(w) * 0.2)) + gauss(w) * 1.2;
    else if (age > p.peakAge + 2) p.pace -= (age - p.peakAge - 2) * (0.5 + rng(w) * 0.6) + Math.max(0, gauss(w));
    else p.pace += gauss(w) * 0.8;
    p.pace = clamp(p.pace, 20, 99);
    p.form = gauss(w) * 2.2; // (a good year or a bad one: confidence, luck, the car suiting them)
    p.cons = clamp(p.cons + (age < 30 ? 1.5 : 0.3) + gauss(w) * 1.2, 20, 97);
    p.craft = clamp(p.craft + (age < 31 ? 1.2 : -0.3) + gauss(w), 20, 97);
  }
  // retirements: past their age, or out of a seat and going nowhere
  for (const p of Object.values(w.people)) {
    if (p.retired) continue;
    const age = ageOf(w, p);
    if (age >= p.retireAge || (age > 29 && !p.team && rng(w) < 0.5)) {
      p.retired = true; p.retiredYear = w.year - 1;
      if (p.team) { const t = w.teams[p.team]; t.drivers = t.drivers.filter(x => x !== p.id); p.team = null; }
      moves.push({ kind: 'retire', pid: p.id });
    }
  }
  // teams' cars: the top teams develop, the rest catch up (or not)
  for (const s of SERIES) {
    prevTeams[s.id].forEach((tid, k) => { const t = w.teams[tid]; if (!t.mine) t.car = clamp(t.car + (k < 2 ? 1.5 : k > 3 ? -1 : 0) + gauss(w) * 3 + (s.base - t.car) * 0.15, 20, 98); });
  }
  // driver market, top series first: the best of the series below take the seats; the slowest step down
  const prevStand = {}; for (const s of SERIES) prevStand[s.id] = standings(w, s.id).map(e => e.pid);
  for (let tier = SERIES.length - 1; tier >= 0; tier--) {
    const s = SERIES[tier], below = SERIES[tier - 1], above = SERIES[tier + 1];
    // drop the bottom two of this series (to the series below, if they're young enough to care)
    if (below) {
      const bottom = prevStand[s.id].filter(pid => pid !== 'P' && w.people[pid] && !w.people[pid].retired && w.people[pid].team && w.teams[w.people[pid].team].series === s.id).slice(-2);
      for (const pid of bottom) { const p = w.people[pid], t = w.teams[p.team]; t.drivers = t.drivers.filter(x => x !== pid); p.team = null; p.series = below.id; moves.push({ kind: 'down', pid, from: s.id, to: below.id }); }
    }
    // fill empty seats: candidates from the series below (by last season's standing, with a dash of luck), then free agents
    for (const tid of w.series[s.id].teams) {
      const t = w.teams[tid];
      while (t.drivers.length < SEATS) {
        let cand = null;
        if (below) cand = prevStand[below.id].filter(pid => pid !== 'P' && w.people[pid] && !w.people[pid].retired && w.people[pid].team && w.teams[w.people[pid].team].series === below.id)
          .slice(0, 4).sort(() => rng(w) - 0.5)[0];
        if (!cand) cand = Object.values(w.people).filter(p => !p.retired && !p.team && (p.series === s.id || p.series === null || (below && p.series === below.id)))
          .sort((a, b) => b.pace - a.pace)[0]?.id;
        if (!cand) cand = makePerson(w, { age: r0(17 + rng(w) * 3), series: s.id, lvl: s.base - 6 + gauss(w) * 5 }).id;
        const p = w.people[cand], from = p.team ? w.teams[p.team] : null;
        if (from) from.drivers = from.drivers.filter(x => x !== cand);
        const wasSeries = from ? from.series : null;
        p.team = tid; p.series = s.id; t.drivers.push(cand);
        moves.push({ kind: wasSeries && seriesById(wasSeries).tier < tier ? 'up' : wasSeries ? 'move' : p.starts ? 'return' : 'rookie', pid: cand, to: s.id, team: tid });
      }
    }
  }
  // you: move up (your team takes the place of the weakest team in the series above, which drops a level)
  const off = w.player.offer;
  if (off && off.answer === 'move') {
    const from = w.player.series, to = off.to, mine = w.teams[w.player.team];
    const ranked = prevTeams[to].filter(t => w.series[to].teams.includes(t)), weakest = ranked.length ? ranked[ranked.length - 1] : w.series[to].teams.at(-1);
    const swap = w.teams[weakest];
    w.series[to].teams = w.series[to].teams.map(t => t === weakest ? mine.id : t);
    w.series[from].teams = w.series[from].teams.map(t => t === mine.id ? weakest : t);
    swap.series = from; mine.series = to; w.player.series = to;
    for (const pid of swap.drivers) if (w.people[pid]) w.people[pid].series = from;
    // your teammate comes with you; the new series' level lifts your car a little
    for (const pid of mine.drivers) if (w.people[pid]) w.people[pid].series = to;
    mine.car = Math.max(mine.car, seriesById(to).base - 5);
    moves.push({ kind: 'you-up', to });
  }
  w.player.offer = null;
  w.lastMoves = moves;
  newCalendars(w, trackPool);
  seasonOpenNews(w, moves);
  return moves;
}

// ---------------- news (headlines) and texts (the phone) ----------------
function news(w, head, body = '', extra = {}) { w.news.unshift({ y: w.year, r: w.round, when: whenOf(w), head, body, ...extra }); if (w.news.length > 120) w.news.length = 120; }
// an email (the garage computer): { from, addr, subj, body: [paragraphs], choices?, offer?, report? }
// when it happened, as the inbox and the news site show it
export const whenOf = (w) => w.round >= w.opts.len ? 'Season end' : w.series[w.player.series].results.some(x => x.round === w.round) ? `Round ${w.round + 1}` : w.round === 0 ? 'Pre-season' : `Round ${w.round}`;
export function mail(w, from, addr, subj, body, extra = {}) {
  w.mail = w.mail || [];
  w.mail.unshift({ id: 'e' + (w.nextId++), y: w.year, r: w.round, when: whenOf(w), from, addr, subj, body, read: false, ...extra });
  if (w.mail.length > 150) w.mail.length = 150;
}
export const unreadMail = (w) => (w.mail || []).filter(m => !m.read).length;
// a series' made-up web address: street-cup.sv, entries@street-cup.sv
export const siteOf = (s) => s.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') + '.sv';
const addrOf = (s, who) => `${who}@${siteOf(s)}`;
// a text from someone: { from, body, choices?, offer? }
export function text(w, from, body, extra = {}) {
  w.msgs.unshift({ id: 'm' + (w.nextId++), y: w.year, r: w.round, from, body, read: false, ...extra });
  if (w.msgs.length > 80) w.msgs.length = 80;
}
export const unread = (w) => w.msgs.filter(m => !m.read).length;
const teammateOf = (w) => w.teams[w.player.team].drivers.find(d => d !== 'P');
const ord = (p) => p + (['th', 'st', 'nd', 'rd'][(p % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][p % 100] || 'th');
const pickLine = (w, a) => a[Math.floor(rng(w) * a.length)];

function seasonOpenNews(w, moves = []) {
  const s = seriesById(w.player.series), S = w.series[s.id], mate = w.people[teammateOf(w)];
  mail(w, `${s.name} Office`, addrOf(s, 'office'), `Welcome to the ${w.year} season`,
    [`Welcome to the ${w.year} ${s.name}.`, `${w.opts.len} rounds, ${S.teams.length * 2} drivers, ${S.teams.length} teams. The full calendar is on our website.`, `Round 1: ${S.cal[0].name}, ${S.cal[0].time}${S.cal[0].weather === 'clear' ? '' : ', ' + S.cal[0].weather}.`, `Good luck,`, `${s.name} Office`]);
  if (mate) {
    const fresh = !w.seasons.length || moves.some(m => m.pid === mate.id);
    text(w, mate.first, fresh ? pickLine(w, [`${mate.first} here. Looks like we're sharing a garage this year. Don't put me in the wall.`, `Hey, it's ${mate.first}. New season, new teammate. Let's make the others look slow.`, `${mate.first} ${mate.last}. I hear you're quick. We'll see.`])
      : pickLine(w, [`Another year in the same garage. I've been training all winter. Watch out.`, `Back at it. This is our year, I can feel it.`]));
  }
  let told = 0;
  for (const m of moves) {
    const p = w.people[m.pid];
    if (told >= 4 && m.kind !== 'you-up') continue;
    if (m.kind === 'up' && m.to !== 'formula') continue;
    told++;
    if (m.kind === 'retire' && p && (p.titles || p.wins >= 3)) news(w, `${p.last.toUpperCase()} HANGS UP THE HELMET`, `${nameOf(p)} retires at ${ageOf(w, p)} with ${p.wins} win${p.wins === 1 ? '' : 's'}${p.titles ? ` and ${p.titles} title${p.titles === 1 ? '' : 's'}` : ''}.`);
    else if (m.kind === 'up' && p) news(w, `${p.last.toUpperCase()} STEPS UP TO ${seriesById(m.to).name.toUpperCase()}`, `${nameOf(p)} joins ${w.teams[m.team].name}.`);
    else if (m.kind === 'rookie' && p && m.to !== 'street') news(w, `ROOKIE ${p.last.toUpperCase()} SIGNS FOR ${w.teams[m.team].name.toUpperCase()}`, `${nameOf(p)}, ${ageOf(w, p)}, gets a ${seriesById(m.to).name} seat.`);
    else if (m.kind === 'you-up') news(w, `${w.teams[w.player.team].name.toUpperCase()} MOVES UP`, `${w.player.name}'s team joins the ${seriesById(m.to).name} for ${w.year}.`);
  }
  news(w, `${w.year} SEASON PREVIEW`, `${s.name}: ${S.teams.map(t => w.teams[t].name).slice(0, 3).join(', ')} and more. Round 1 at ${S.cal[0].name}.`);
}

function roundNews(w, me) {
  const sid = w.player.series;
  for (const s of SERIES) {
    const res = w.series[s.id].results.at(-1); if (!res) continue;
    const win = res.rows.find(r => r.pos === 1 && !r.dnf); if (!win) continue;
    const firstWin = win.pid !== 'P' && w.people[win.pid] && w.people[win.pid].wins === 1;
    const rep = { report: { s: s.id, round: res.round } };
    if (win.pid === 'P') news(w, `${w.player.name.split(' ').pop().toUpperCase()} WINS AT ${res.track.toUpperCase()}`, `A ${s.name} win for ${w.teams[w.player.team].name}.`, rep);
    else news(w, `${firstWin ? 'FIRST WIN FOR' : ''} ${w.people[win.pid].last.toUpperCase()}${firstWin ? '' : ' WINS'} AT ${res.track.toUpperCase()}`.trim(), `${s.name}, round ${res.round + 1}${res.weather === 'rain' ? ', in the rain' : ''}.`, rep);
  }
  // texts about your race
  if (!me) return;
  const res = w.series[sid].results.at(-1), mateId = teammateOf(w), mate = w.people[mateId];
  const mr = res.rows.find(r => r.pid === mateId);
  if (me.pos === 1 && !me.dnf && w.player.wins === 1) mail(w, 'Press Office', addrOf(seriesById(sid), 'press'), 'Interview requests',
    [`${w.player.name.split(' ')[0]},`, `Your first win! The phones haven't stopped. We've had eleven interview requests since the flag, and counting.`, `Enjoy tonight. We'll sort the rest out tomorrow.`, `Press Office, ${seriesById(sid).name}`]);
  // the series office sends every team the classification
  { const s = seriesById(sid), st = standings(w, sid), cp = st.findIndex(e => e.pid === 'P') + 1, lead = st[0];
    mail(w, `${s.name} Office`, addrOf(s, 'results'), `Round ${res.round + 1} classification: ${res.track}`,
      [`Official classification for round ${res.round + 1} of the ${w.year} ${s.name} at ${res.track}.`,
       me.dnf ? `${w.player.name}: did not finish.` : `${w.player.name}: P${me.pos}, ${me.pts || 0} point${me.pts === 1 ? '' : 's'}.`,
       cp ? (cp === 1 ? `You lead the championship on ${lead.pts} points.` : `You are ${ord(cp)} in the championship on ${st[cp - 1].pts} points, ${lead.pts - st[cp - 1].pts} behind the leader.`) : '',
       w.round + 1 < w.opts.len ? `Next: round ${w.round + 2}, ${w.series[sid].cal[w.round + 1].name}.` : `That was the final round.`].filter(Boolean),
      { report: { s: sid, round: res.round } }); }
  if (mate && mr) {
    const beat = !me.dnf && (mr.dnf || me.pos < mr.pos);
    if (rng(w) < 0.6) text(w, mate.first, beat ? pickLine(w, [`Fair play. P${me.pos}. I'll have you next time.`, `Good race. Don't get used to finishing ahead of me.`, `Nice one today. The team's happy.`])
      : me.dnf ? pickLine(w, [`Rough day. Shake it off, next round's a fresh start.`, `Saw your car in the barrier. You OK?`])
      : pickLine(w, [`P${mr.pos} for me today. Drinks are on you.`, `Good points for the team. Even if they were mostly mine.`, `Tough one for you. Next time.`]));
  }
  // anyone who hit you (or whom you hit) gets in touch
  const hits = w.ledger.filter(e => e.y === w.year && e.r === w.round && e.type === 'contact' && e.blame && (e.a === 'P' || e.b === 'P'));
  for (const e of hits.slice(0, 2)) {
    const other = e.a === 'P' ? e.b : e.a, p = w.people[other]; if (!p) continue;
    const h = h2hOf(w, other);
    if (e.a === 'P') text(w, p.first, h.youHit > 1 ? `That's twice now. I won't forget it.` : p.aggr > 60 ? `Watch your mirrors next time. I won't forget that.` : `What happened back there? You ruined my race.`);
    else text(w, p.first, p.aggr > 60 ? `You left the door open. Not my fault.` : `Sorry about that one. Wasn't trying to take you out.`);
  }
}

function seasonEndNews(w, sum) {
  for (const s of SERIES) {
    const pid = sum.champs[s.id]; if (!pid) continue;
    if (pid === 'P') news(w, `${w.player.name.split(' ').pop().toUpperCase()} IS ${s.name.toUpperCase()} CHAMPION`, `${w.player.name} takes the ${w.year} title.`);
    else { const p = w.people[pid]; news(w, `${p.last.toUpperCase()} CLINCHES ${s.name.toUpperCase()} TITLE`, `${nameOf(p)} (${w.teams[p.team].name}) is the ${w.year} champion${p.titles > 1 ? ` again: title number ${p.titles}` : ''}.`); }
  }
  const you = sum.you;
  if (you) text(w, w.people[teammateOf(w)]?.first || 'Team', you.pos === 1 ? `CHAMPION! I knew it. Tonight we celebrate.` : `P${you.pos} in the championship. Not bad. Next year we go again.`);
}

// ---------------- save ----------------
const KEY = 'svgp.world';
export function saveWorld(w) { try { localStorage.setItem(KEY, JSON.stringify(w)); return true; } catch (e) { return false; } }
export function loadWorld() { try { const w = JSON.parse(localStorage.getItem(KEY)); if (!w || w.v !== 1) return null; w.mail = w.mail || []; return w; } catch (e) { return null; } }
export function clearWorld() { localStorage.removeItem(KEY); }
