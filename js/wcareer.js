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
  const w = { v: 1, kind: 'world', rs: (opts.seed || Date.now()) % 2147483646 + 1, nextId: 1, year: START_YEAR - PRE_YEARS, round: 0, over: false,
    opts: { len: opts.len || 6, difficulty: opts.difficulty || 'medium', laps: opts.laps || 5, weekend: opts.weekend || 'quali', pracLen: opts.pracLen || 1200, qualiLen: opts.qualiLen || 600, pool: opts.pool || 'presets' },
    people: {}, teams: {}, series: {}, news: [], msgs: [], mail: [], ledger: [], h2h: {}, seasons: [],
    player: { name: (opts.name || 'Driver').trim(), number: opts.number || 7, series: 'street', team: 'T0', starts: 0, wins: 0, pods: 0, titles: 0, hist: [], offer: null } };
  w.streetCars = opts.streetCars || []; // (the street-class cars, for the classifieds: [{ key, name, value }])
  // teams: yours in the Street Cup, 17 more across the ladder
  const pool = TEAM_POOL.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng(w) * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  let k = 0;
  for (const s of SERIES) {
    const ids = [];
    for (let t = 0; t < TEAMS_PER; t++) {
      const [name, main, accent] = pool[k++];
      const id = 'T' + (k);
      w.teams[id] = { id, name, main, accent, series: s.id, car: clamp(s.base + gauss(w) * 5, 20, 98), drivers: [] };
      ids.push(id);
    }
    w.series[s.id] = { teams: ids, cal: [], results: [] };
  }
  // your team: not in any series yet (it's founded once the history has run)
  w.teams.T0 = { id: 'T0', name: opts.teamName || 'Your Team', main: opts.colors?.[0] ?? 0xc8141c, accent: opts.colors?.[1] ?? 0xf2f2f2, series: null, car: SERIES[0].base - 4, mine: true, drivers: ['P'] };
  // drivers: two per team
  for (const s of SERIES) for (const tid of w.series[s.id].teams) {
    const t = w.teams[tid];
    for (let seat = 0; seat < SEATS; seat++) {
      const age = s.tier === 0 ? r0(18 + rng(w) * 9) : s.tier === 1 ? r0(21 + rng(w) * 13) : r0(22 + rng(w) * 14);
      const p = makePerson(w, { age, series: s.id, lvl: s.base + gauss(w) * s.spread * 0.4 });
      p.team = tid; t.drivers.push(p.id);
    }
  }
  // a few free agents waiting for a seat
  for (let i = 0; i < 6; i++) makePerson(w, { age: r0(17 + rng(w) * 4), series: null, lvl: 42 + gauss(w) * 6 });
  newCalendars(w, trackPool);
  prehistory(w, trackPool);
  seasonOpenNews(w);
  startMoney(w);
  w.founding = { reg: false, car: false };
  mail(w, 'San Velocita Business Registry', 'no-reply@registry.sv.gov', 'Action required: Form SV-1',
    [`Our records show that you intend to operate a motor racing team in the Province of San Velocita.`,
     `Before you can enter a series, open a business account or receive winnings as a business, you must complete Form SV-1 (Registration of a Sporting Enterprise). The form takes about four minutes. Our average processing time is eleven weeks.`,
     `A processing fee of $250 applies. The fee is non-refundable.`,
     `San Velocita Business Registry`],
    { link: ['registry', 'Open Form SV-1'] });
  return w;
}

// ---------------- the years before you ----------------
// The world runs PRE_YEARS seasons on its own first, so everyone arrives with a career: starts, wins, titles, history
// and grudges. The Street Cup team whose entry you buy races through them too, then folds; your team takes its place.
const START_YEAR = 2026, PRE_YEARS = 10;
function prehistory(w, trackPool) {
  w.pre = true;
  for (let y = 0; y < PRE_YEARS; y++) {
    for (let r = 0; r < w.opts.len; r++) {
      for (const s of SERIES) scoreRound(w, s.id, simRace(w, s.id));
      roundNews(w, null);
      w.round++;
    }
    seasonEnd(w);
    nextSeason(w, trackPool);
  }
  // the old team folds: one of its drivers stays on (the seat comes with the entry), the other goes looking
  const S = w.series.street, old = w.teams[S.teams[S.teams.length - 1]], mine = w.teams.T0;
  const tst = w.seasons.at(-1)?.teamChamps;
  S.teams = S.teams.map(t => t === old.id ? 'T0' : t); mine.series = 'street';
  const [stay, go] = old.drivers.slice().sort((a, b) => ageOf(w, w.people[a]) - ageOf(w, w.people[b])); // (the younger one stays)
  if (go && w.people[go]) w.people[go].team = null;
  if (stay && w.people[stay]) { w.people[stay].team = 'T0'; mine.drivers.push(stay); }
  old.drivers = []; old.series = null; old.folded = w.year - 1;
  w.pre = false; w.prev = old.id; // (whose entry you bought)
  news(w, `${old.name.toUpperCase()} CLOSES ITS DOORS`, `After ${PRE_YEARS}${tst ? '' : ''} seasons in the Street Cup, ${old.name} has stopped racing. The team's entry has been sold to a new owner.`);
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
      cal.push({ name, time, weather, theme: tr?.env?.theme || 'grass' });
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
// use: what your weekend used (tyre sets, laps, damage), for the bill
export function recordPlayerRound(w, res, log = [], use = null) {
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
  const u = use || simUse(w), bill = w.money ? settleRound(w, u, me) : null;
  afterParts(w, u);
  return { ...afterRound(w, me), bill };
}
// testing: your race simulated too (you as a mid-field driver)
export function simPlayerRound(w) {
  const rows = simRace(w, w.player.series, true);
  // your car can let you down here too
  const f = w.car ? rollFailure(w) : null, mine = rows.find(r => r.pid === 'P');
  if (f && f.fatal && mine) mine.dnf = true;
  scoreRound(w, w.player.series, rows);
  const me = rows.find(r => r.pid === 'P');
  for (const r of rows) if (r.pid !== 'P') { const h = h2hOf(w, r.pid); h.races++; if (r.dnf && !me.dnf || (!me.dnf && me.pos < r.pos)) h.ahead++; else h.behind++; }
  if (w.money) { const u = { ...simUse(w), failed: f ? f.part : null, grid: me ? clamp(me.pos + Math.round(gauss(w) * 2), 1, 12) : null, blamed: rng(w) < 0.12 }; settleRound(w, u, me); afterParts(w, u); }
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

// after a round: the car wears (and whatever broke needs fixing), your engineer measures, new used parts appear
function afterParts(w, use) {
  if (w.founding && !w.founding.legacy) sponsorOffers(w);
  if (!w.car) return;
  wearCar(w, use.laps || 0, use.damage || 0, use.failed || null);
  measureParts(w);
  refreshUsedParts(w);
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
  for (const d of dealsOf(w).slice()) {
    const sp = sponsorById(d.sid), good = d.met >= d.misses;
    if (good) mail(w, sp.name, sponsorAddr(sp.name), `${w.year + 1} season`, [`Thank you for a good season. We'd like to continue in ${w.year + 1} on the same terms.`, sp.name], { sponsorOffer: { sid: d.sid, slot: d.slot, fee: d.fee, bonus: d.bonus }, choices: [['yes', 'Renew'], ['no', 'Decline']] });
  }
  w.deals = [];
  w.year++; w.round = 0; w.over = false;
  annuityDay(w);
  if (w.staff) w.jobs = makeJobs(w);
  if (w.payDriver && w.teams[w.player.team].drivers.includes(w.payDriver.pid)) { const p = w.people[w.payDriver.pid]; if (p) pay(w, w.payDriver.fee, `Seat fee for ${p.first} ${p.last}`); }
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

// ---------------- money ----------------
// You won the lottery and spent it on a racing team. The opening choice (lump sum or annuity) is an email; every round
// then costs money (entry, travel, the crew, tyres, fuel, repairs) and pays prize money. All in dollars; the scale is
// set so the Street Cup is survivable on the winnings, and every step up needs more than you have (sponsors, later).
export const LOTTERY = { jackpot: 3000000, lump: 825000, annuity: 70000, years: 30, saleRate: 0.25 }; // (selling the annuity: a quarter of what it's worth)
export const COSTS = {
  street:  { entry: 4000,  travel: 2000,  crew: 5000,  tyre: 900,  fuelLap: 35,  repair: 24000,  prize: [20000, 14000, 10000, 8000, 6500, 5000, 4000, 3000, 2000, 1500] },
  gt:      { entry: 15000, travel: 6000,  crew: 22000, tyre: 3200, fuelLap: 120, repair: 110000, prize: [80000, 56000, 40000, 32000, 26000, 20000, 16000, 12000, 8000, 6000] },
  formula: { entry: 40000, travel: 15000, crew: 90000, tyre: 6000, fuelLap: 300, repair: 450000, prize: [200000, 140000, 100000, 80000, 65000, 50000, 40000, 30000, 20000, 15000] },
};
// the annuity is a year's money; seasons of other lengths get it in proportion (a 12-round year pays twice a 6)
const annuityPay = (w) => Math.round(LOTTERY.annuity * (w.money?.loophole || 1) * w.opts.len / 6 / 100) * 100;
export const money$ = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const BANK = 'First Velocita Bank', BANK_ADDR = 'statements@firstvelocita.sv';
function startMoney(w) {
  w.money = { balance: 0, choice: null, annuityLeft: 0, tx: [] };
  const first = w.player.name.split(' ')[0];
  mail(w, 'San Velocita State Lottery', 'winners@svlottery.sv', 'Claiming your prize',
    [`Dear ${first},`, `Congratulations again on your win in the State Lottery draw: a jackpot of ${money$(LOTTERY.jackpot)}.`,
     `Before we can pay you, we need to know how you'd like to receive it:`,
     `LUMP SUM: the cash value of the jackpot, paid now. After tax you'll receive ${money$(LOTTERY.lump)}, in one payment.`,
     `ANNUITY: the full jackpot, paid in ${LOTTERY.years} yearly instalments. Spread out, far less of it goes in tax: you'll receive ${money$(LOTTERY.annuity)} a year (${money$(LOTTERY.annuity * LOTTERY.years)} in total), the first payment now.`,
     `Of the advertised jackpot, the Province retains a portion as a Prosperity Contribution, which funds the Lottery's advertising.`,
     `This choice is final. Most winners take the lump sum.`, `Winner Services, San Velocita State Lottery`],
    { lottery: true, choices: [['lump', `Lump sum: ${money$(LOTTERY.lump)} now`], ['annuity', `Annuity: ${money$(LOTTERY.annuity)} a year for ${LOTTERY.years} years`]] });
}
// money in or out, kept as the bank sees it
function pay(w, amt, what) {
  const m = w.money; m.balance += amt;
  m.tx.unshift({ y: w.year, when: whenOf(w), what, amt, bal: m.balance });
  if (m.tx.length > 200) m.tx.length = 200;
}
export function claimLottery(w, choice) {
  const m = w.money; if (m.choice) return;
  m.choice = choice;
  const k = bgOf(w).lottery || 1;
  if (k !== 1) m.loophole = k;
  if (choice === 'lump') pay(w, Math.round(LOTTERY.lump * k), 'State Lottery: lump sum' + (k !== 1 ? ' (with a loophole)' : ''));
  else { m.annuityLeft = LOTTERY.years; annuityDay(w); }
}
function annuityDay(w) {
  const m = w.money; if (!m || m.choice !== 'annuity' || m.annuityLeft <= 0) return;
  m.annuityLeft--; pay(w, annuityPay(w), `State Lottery: annuity payment (${m.annuityLeft} left)`);
}
// selling the rest of the annuity to a settlement company: cash now, a fraction of what it's worth
export const annuityOffer = (w) => w.money.choice === 'annuity' && w.money.annuityLeft > 0 ? Math.round(annuityPay(w) * w.money.annuityLeft * LOTTERY.saleRate / 1000) * 1000 : 0;
export function sellAnnuity(w) {
  const cash = annuityOffer(w); if (!cash) return 0;
  const left = w.money.annuityLeft; w.money.annuityLeft = 0;
  pay(w, cash, `Settlement: ${left} future annuity payments sold`);
  mail(w, 'QuickCash Settlements', 'deals@quickcash.sv', 'Your money is on its way!',
    [`Great news!`, `We've bought your remaining ${left} lottery payments (worth ${money$(annuityPay(w) * left)}) for ${money$(cash)}, paid today.`, `It's your money. Why wait for it?`, `The QuickCash Team`]);
  return cash;
}
// a weekend's bill: use = { sets, laps, damage: 0..1 of a write-off, aidPct: the driver-aids prize bonus (%) }, me = your
// classified row (prize money)
export function settleRound(w, use, me) {
  const c = COSTS[w.player.series], R = w.series[w.player.series].cal[w.round], trackName = R.name, bg = bgOf(w);
  const home = isHome(w, R), fx = staffEffects(w);
  const items = [
    ['Entry fee', -c.entry], [home ? 'Travel (home race: you drove)' : 'Travel and freight', home ? 0 : -Math.round(c.travel * fx.travel)], ['Pit crew (contract)', -c.crew],
    [`Tyres bought trackside (${use.trackside || 0} set${use.trackside === 1 ? '' : 's'})`, -Math.round((use.trackside || 0) * c.tyre * TRACKSIDE)],
    [`Fuel (${use.laps} lap${use.laps === 1 ? '' : 's'})`, -Math.round(use.laps * c.fuelLap * (bg.fuel || 1))],
  ];
  if (use.damage > 0.005) items.push([bg.repair ? 'Repairs (mostly done yourself)' : 'Repairs', -Math.round(use.damage * c.repair * (bg.repair || 1) * fx.repair / 100) * 100]);
  for (const it of sponsorRound(w, use, me)) items.push(it);
  const base = me && !me.dnf ? c.prize[me.pos - 1] || 0 : 0, pct = Math.max(0, use.aidPct || 0);
  const prize = Math.round(base * (1 + pct / 100) * (bg.prize || 1) * (home ? 1.1 : 1) / 10) * 10;
  if (prize) items.push([`Prize money (P${me.pos}${pct ? `, +${pct}% for fewer aids` : ''}${home ? ', home crowd' : ''})`, prize]);
  const before = w.money.balance;
  for (const [what, amt] of items) if (amt) pay(w, amt, `${trackName}: ${what[0].toLowerCase() + what.slice(1)}`);
  // overdrawn: the bank charges for it
  if (w.money.balance < 0) { const fee = Math.round(-w.money.balance * 0.015 / 10) * 10 + 250; pay(w, -fee, 'Overdraft interest and fee'); items.push(['Overdraft interest and fee', -fee]); }
  const net = w.money.balance - before;
  mail(w, BANK, BANK_ADDR, `Account activity: ${trackName}`,
    [`Here is the activity on your business account for round ${w.round + 1}, ${trackName}.`,
     w.money.balance < 0 ? `Your account is overdrawn by ${money$(-w.money.balance)}. Overdrawn balances are charged 1.5% a round plus a $250 fee. Please call your branch.` : `Your balance is ${money$(w.money.balance)}.`],
    { bill: { items, net, bal: w.money.balance } });
  return { items, net };
}
// what a repair (of this much damage: 0..1 of a write-off) costs, before you have it done
export const repairQuote = (w, dmg) => Math.round(dmg * COSTS[w.player.series].repair * (bgOf(w).repair || 1) * staffEffects(w).repair / 100) * 100;
export const tyreCost = (w) => COSTS[w.player.series].tyre;
// a round you didn't drive yourself (Sim Rest Of Season): a plain weekend, no damage; the tyres come out of your stock
export function simUse(w) {
  const R = w.series[w.player.series].cal[w.round], wet = R && R.weather === 'rain';
  const need = w.opts.weekend === 'full' ? 3 : w.opts.weekend === 'quali' ? 2 : 1;
  let trackside = 0;
  for (let i = 0; i < need; i++) if (!takeSet(w, wet ? 'wet' : i < need - 1 ? 'soft' : 'medium')) trackside++;
  return { trackside, laps: w.opts.laps + (w.opts.weekend === 'full' ? 18 : w.opts.weekend === 'quali' ? 6 : 0), damage: 0 };
}

// ---------------- tyres: what you have, what you order ----------------
// New sets in stock per compound, and used sets kept from earlier runs (with their wear). Order on the computer
// (paid when ordered, there for the next round); run out at a weekend and the trackside service sells you one at a
// premium. With a team manager, they keep you stocked for each round's forecast (and tell you what they ordered).
export const COMPOUNDS = ['soft', 'medium', 'hard', 'wet'];
export const TRACKSIDE = 1.5;
export const stockOf = (w) => (w.tyreStock = w.tyreStock || { soft: 0, medium: 0, hard: 0, wet: 0 });
export const usedOf = (w) => (w.usedTyres = w.usedTyres || []);
// a new set off the shelf (false: there isn't one)
export function takeSet(w, c) { const st = stockOf(w); if (st[c] > 0) { st[c]--; return true; } return false; }
export function keepUsed(w, set) { const u = usedOf(w); if (Math.min(set.wf, set.wr) > 0.1) u.push({ c: set.c, wf: +set.wf.toFixed(3), wr: +set.wr.toFixed(3) }); u.sort((a, b) => Math.min(b.wf, b.wr) - Math.min(a.wf, a.wr)); if (u.length > 8) u.length = 8; }
export function orderTyres(w, order) {
  const n = COMPOUNDS.reduce((a, c) => a + (order[c] || 0), 0); if (!n) return 0;
  const cost = n * COSTS[w.player.series].tyre, st = stockOf(w);
  for (const c of COMPOUNDS) st[c] += order[c] || 0;
  pay(w, -cost, `Velocita Tyre & Rubber: ${COMPOUNDS.filter(c => order[c]).map(c => `${order[c]} ${c}`).join(', ')}`);
  return cost;
}
export const buyTrackside = (w) => Math.round(COSTS[w.player.series].tyre * TRACKSIDE);
// what the next round needs: a soft for each session, a medium and a hard for the race, wets if it might rain
export function tyreNeeds(w) {
  const R = w.series[w.player.series].cal[w.round] || {}, wet = R.weather === 'rain' || R.weather === 'overcast';
  const sessions = w.opts.weekend === 'full' ? 2 : w.opts.weekend === 'quali' ? 1 : 0;
  return { soft: sessions + 1, medium: 1, hard: 1, wet: wet ? 2 : 0 };
}
// the team manager restocks for the next round (as you start it, or when the season rolls over)
export function managerRestock(w) {
  const m = staffOf(w, 'manager'); if (!m || w.restocked === w.year * 100 + w.round) return;
  w.restocked = w.year * 100 + w.round;
  const need = tyreNeeds(w), st = stockOf(w), order = {};
  for (const c of COMPOUNDS) order[c] = Math.max(0, need[c] - st[c]);
  const cost = orderTyres(w, order);
  if (cost) mail(w, `${m.first} ${m.last}`, `${m.first.toLowerCase()}@${w.teams[w.player.team].name.toLowerCase().replace(/[^a-z]+/g, '')}.sv`, 'Tyres ordered',
    [m.danny ? `ordered tyres for ${w.series[w.player.series].cal[w.round].name}:` : `I've ordered tyres for ${w.series[w.player.series].cal[w.round].name}:`,
     COMPOUNDS.filter(c => order[c]).map(c => `${order[c]} ${c}`).join(', ') + ` (${money$(cost)}).`,
     m.danny ? `forecast says ${w.series[w.player.series].cal[w.round].weather}. got u covered` : `The forecast is ${w.series[w.player.series].cal[w.round].weather}.`]);
}

// a round you didn't drive yourself: see simUse above

// ---------------- founding: the paperwork, the backstory, the car ----------------
// Form SV-1 (the registry website on the computer) sets the team's name, colours, home town, your background and a
// little backstory. Then your buddy finds you a car in the classifieds. Small perks: see TOWNS and BACKGROUNDS.
export const TOWNS = {
  pinewood: { name: 'Pinewood Falls', theme: 'grass', blurb: 'Population 4,210. Home of the Harvest Fair.' },
  gulch:    { name: 'Dry Gulch', theme: 'desert', blurb: 'Desert town. Two outlet malls.' },
  city:     { name: 'Velocita City', theme: 'city', blurb: 'The provincial capital.' },
  azure:    { name: 'Port Azure', theme: 'coast', blurb: 'Harbour town. Three yacht clubs.' },
};
export const HOME_PERK = 'Home races (circuits like home): no travel bill and 10% more prize money.';
export const BACKGROUNDS = {
  mechanic:   { name: 'Mechanic', perk: 'Repairs cost 30% less. You do most of them yourself.', repair: 0.7 },
  accountant: { name: 'Accountant', perk: '8% more from the lottery. You read the small print.', lottery: 1.08 },
  salesman:   { name: 'Car salesman', perk: 'Cars cost you 15% less. You know what they paid for it.', cars: 0.85 },
  karting:    { name: 'Ex-karting kid', perk: '10% more prize money. The press likes a comeback.', prize: 1.1 },
  simracer:   { name: 'Sim racer', perk: 'Fuel costs half as much. You drive economically.', fuel: 0.5 },
};
const bgOf = (w) => BACKGROUNDS[w.background] || {};
const isHome = (w, R) => !!(w.home && R && R.theme && TOWNS[w.home]?.theme === R.theme);
export const homeRound = (w, R) => isHome(w, R);
export const EX_NAMES = ['Dana', 'Chris', 'Jordan', 'Sam', 'Alex', 'Morgan', 'Casey', 'Robin', 'Jamie', 'Taylor'];
// the form, filed: { name, team, colors: [main, accent], home, background, ex, years }
export function registerTeam(w, f) {
  if (w.founding?.reg) return;
  w.founding = { ...(w.founding || {}), reg: true };
  w.player.name = f.name; w.home = f.home; w.background = f.background; w.backstory = { ex: f.ex, years: f.years };
  const t = w.teams[w.player.team]; t.name = f.team; [t.main, t.accent] = f.colors;
  pay(w, -250, 'Business Registry: Form SV-1 processing fee');
  const first = f.name.split(' ')[0];
  mail(w, 'San Velocita Business Registry', 'no-reply@registry.sv.gov', `Registration confirmed: ${f.team}`,
    [`Thank you for registering ${f.team}, a Sporting Enterprise based in ${TOWNS[f.home].name}.`, `Your processing fee of $250 has been collected. Please keep this email for your records.`, `San Velocita Business Registry`]);
  mail(w, 'Hargreave & Webb, Family Law', 'office@hargreavewebb.sv', `${f.ex} v. ${f.name.split(' ').pop()}: a quick question`,
    [`Dear ${first},`, `As you know, we act for ${f.ex}.`,
     `It has come to our attention that you won the State Lottery shortly after the decree was finalised. Congratulations. My client has asked us to confirm the date of the draw.`,
     `My client also asks us to pass on that starting a racing team is "exactly the kind of thing," and that they hope it goes really well.`, `Yours,`, `M. Hargreave`]);
  // a local business gets in touch
  repOf(w); sponsorOffers(w, true);
  // the second seat: a pay driver, with their parent's money
  const mate = w.people[w.teams[w.player.team].drivers.find(d => d !== 'P')];
  if (mate) {
    const fee = 40000, biz = pickLine(w, ['Carpets & Flooring', 'Discount Mattresses', 'Lawn Ornaments', 'Premium Gutters', 'Self Storage']);
    w.payDriver = { pid: mate.id, fee };
    pay(w, fee, `${mate.last} ${biz}: seat fee for ${mate.first}`);
    mail(w, `Gordon ${mate.last}`, `gordon@${mate.last.toLowerCase()}${biz.split(' ')[0].toLowerCase()}.sv`, `${mate.first}'s seat`,
      [`Hello,`, `Please find enclosed ${money$(fee)} for ${mate.first}'s seat in your team, as discussed with ${mate.first}, who discussed it with me afterwards.`,
       `${mate.first} tells me they are very fast. I have never seen them drive, because I am busy running ${mate.last} ${biz}, the third largest name in ${biz.toLowerCase()} in the province.`,
       `They will bring their own car. Please put our name on it somewhere tasteful.`, `Gordon ${mate.last}`]);
  }
  // your buddy, who knows a guy
  w.ads = makeAds(w);
  w.staff = []; w.jobs = makeJobs(w);
  // (the previous team left a couple of things behind)
  w.tyreStock = { soft: 0, medium: 0, hard: 0, wet: 0 }; w.usedTyres = [{ c: 'medium', wf: 0.72, wr: 0.7 }, { c: 'medium', wf: 0.55, wr: 0.58 }];
  mail(w, 'Danny', 'dannyboy1979@coolmail.sv', 'found u a car',
    [`saw the lottery thing on the news. congrats man!!! also saw the divorce thing on the news. less congrats`,
     `anyway if ur doing the racing team thing u need a car. there's some good ones on the classifieds rn. the cheap one is probably fine. probably`,
     `ps i can be ur team manager. i have managed a team before (fantasy football, 2nd place)`],
    { link: ['classifieds', 'Open the classifieds'] });
}
// the classifieds: a few used street cars, of very variable honesty
const AD_BLURBS = [
  ['Runs and drives. Some rust. Sold as is.', 0.62], ['Was running when parked. Needs some TLC.', 0.58],
  ['New tires, new battery, new clutch. Check engine light is on but it\'s nothing.', 0.7], ['Lots of new parts, too many to list.', 0.72],
  ['Recent service, all records. Minor scratches, see pics.', 0.8], ['One owner. Garage kept. Never tracked.', 0.86],
  ['Wife says it has to go.', 0.88], ['Immaculate. Serious buyers only. No lowballers, I know what I have.', 0.97],
  ['Selling for a friend, don\'t know much about it.', 0.66], ['Price is firm.', 0.82],
];
// the years each car was made (more or less), for the listings
const AD_YEARS = { testarossa: [1984, 1991], jsport: [1993, 2002], rs964: [1989, 1994], gtr: [2008, 2012], mustang: [1987, 1993], m5: [1998, 2003] };
// the colours they come in (until you paint them)
const AD_COLORS = [0xa81a1a, 0x1b1b1d, 0xe6e6e2, 0x24396e, 0x8c9198, 0x1f4a2c, 0xb8952a, 0x5e1822];
const AD_SELLERS = ['Dale', 'Rick (not a dealer)', 'Bev', 'Tony', 'mike_cars_cash', 'Desmond', 'Pauline', 'Gaz'];
const condWord = (c) => c >= 0.93 ? 'Like new' : c >= 0.82 ? 'Honest' : c >= 0.7 ? 'Tired' : 'Project';
export const condName = condWord;
function makeAds(w) {
  const cars = w.streetCars || [];
  const ads = [], blurbs = AD_BLURBS.slice().sort(() => rng(w) - 0.5);
  for (let i = 0; i < Math.min(6, Math.max(3, cars.length)); i++) {
    const car = cars[i % cars.length], [blurb, c0] = blurbs[i % blurbs.length];
    const cond = clamp(c0 + (rng(w) - 0.5) * 0.08, 0.5, 0.99);
    const price = Math.round(car.value * (0.45 + cond * 0.6) * (bgOf(w).cars || 1) / 100) * 100;
    ads.push({ id: 'ad' + (w.nextId++), chassis: car.key, name: car.name, cond, price, color: AD_COLORS[Math.floor(rng(w) * AD_COLORS.length)], miles: Math.round((1 - cond) * 260 + 25 + rng(w) * 40) * 1000, year: (([a, b]) => a + Math.floor(rng(w) * (b - a + 1)))(AD_YEARS[car.key] || [1986, 2003]), blurb, seller: AD_SELLERS[Math.floor(rng(w) * AD_SELLERS.length)] });
  }
  return ads.sort((a, b) => a.price - b.price);
}
export function buyCar(w, adId) {
  const ad = (w.ads || []).find(a => a.id === adId); if (!ad || w.car) return false;
  w.car = { chassis: ad.chassis, name: ad.name, cond: ad.cond, paid: ad.price, year: ad.year };
  w.founding.car = true; w.ads = w.ads.filter(a => a !== ad);
  carParts(w); refreshUsedParts(w);
  pay(w, -ad.price, `Classifieds: ${ad.year} ${ad.name} (from ${ad.seller})`);
  mail(w, ad.seller, `${ad.seller.split(' ')[0].toLowerCase().replace(/[^a-z_]/g, '')}@coolmail.sv`, `re: ${ad.year} ${ad.name}`,
    [`pleasure doing business`, `keys are under the mat`, condWord(ad.cond) === 'Project' ? `if it makes a noise thats normal` : `no refunds`]);
  return true;
}
// how much a car's condition holds it back (power): a project car is about 4% down until R&D sorts it out
export const condPower = (cond) => 0.9 + 0.1 * clamp(cond ?? 1, 0.5, 1);

// ---------------- the car: parts, wear, upgrades, reliability ----------------
// Six parts, each with a condition (0-1). Worn parts cost pace and, more importantly, can fail in a race (the chance
// grows with wear, with sketchy parts and with a poor or fed-up mechanic). Rebuild them (your mechanic; outsourced
// without one) or buy new. Upgrades go on a part: you never see their true effect, only how they feel, until your
// data engineer measures them. All of it reaches the car through the race's player modifiers (carMods).
export const PARTS = {
  engine:     { name: 'Engine', fail: 0.18, wear: 0.03, lap: 0.0012, cost: 0.22, fatal: 1,
                warn: ['Oil pressure is dropping. Nurse it.', 'Engine temps are climbing.'], why: ['A connecting rod has let go.', 'It has lost oil pressure.', 'The head gasket has gone.'] },
  gearbox:    { name: 'Gearbox', fail: 0.13, wear: 0.02, lap: 0.0008, cost: 0.12, fatal: 0.5,
                warn: ['The gearbox is making a noise.', 'Shifts are getting slow.'], why: ['The gearbox has seized.', 'It is stuck in neutral.'], hurt: 'Gearbox trouble: down on drive.' },
  brakes:     { name: 'Brakes', fail: 0.09, wear: 0.03, lap: 0.0015, cost: 0.05, fatal: 0,
                warn: ['Brake temperatures are very high.'], hurt: 'Brake fade: brake earlier.' },
  suspension: { name: 'Suspension', fail: 0.08, wear: 0.015, lap: 0.0006, cost: 0.08, fatal: 0,
                warn: ['Something is loose at the rear.'], hurt: 'A damper has failed: the car is floating.' },
  aero:       { name: 'Aero', fail: 0, wear: 0.005, lap: 0, cost: 0.06, fatal: 0 },
  chassis:    { name: 'Chassis', fail: 0, wear: 0.008, lap: 0, cost: 0.15, fatal: 0 },
};
export const PART_KEYS = Object.keys(PARTS);
export function carParts(w) {
  if (!w.car) return null;
  if (!w.car.parts) { const c0 = w.car.cond ?? 0.85; w.car.parts = {}; for (const k of PART_KEYS) w.car.parts[k] = { cond: +clamp(c0 + (rng(w) - 0.5) * 0.24, 0.35, 1).toFixed(3), fit: null }; }
  return w.car.parts;
}
// the car as the race sees it (World Career's player modifiers)
export function carMods(w) {
  const P = carParts(w); if (!P) return null;
  const c = (k) => P[k].cond, g = (k, stat) => P[k].fit?.gains?.[stat] || 0, sum = (stat) => PART_KEYS.reduce((a, k) => a + g(k, stat), 0);
  return { power: (0.9 + 0.1 * c('engine')) * (1 + sum('power')), grip: (0.96 + 0.04 * c('suspension')) * (1 + sum('grip')), brake: (0.9 + 0.1 * c('brakes')) * (1 + sum('brake')),
    downforce: 1 + sum('downforce'), drag: 1 + sum('drag'), damage: (1.15 - 0.15 * c('chassis')) * (1 + sum('damage')), rainGrip: 1, wear: 1, slip: 1, softs: false, launch: false };
}
const mechFactor = (w) => { const m = staffOf(w, 'mechanic'); return m ? (1.2 - 0.08 * m.skill) * (m.morale < 35 ? 1.3 : 1) : 1.25; };
// the chance each part fails this race (0..1)
export function failOdds(w) {
  const P = carParts(w), out = {}; if (!P) return out;
  for (const k of PART_KEYS) { const p = PARTS[k]; if (!p.fail) continue; out[k] = clamp(p.fail * (1 - P[k].cond) ** 2 * (P[k].fit ? 1.6 - P[k].fit.q : 1) * mechFactor(w), 0, 0.5); }
  return out;
}
export const failRisk = (w) => 1 - Object.values(failOdds(w)).reduce((a, p) => a * (1 - p), 1);
// does something break this race? { part, at (0..1 of the race), fatal, warn, why, hurt }
export function rollFailure(w) {
  for (const [k, p] of Object.entries(failOdds(w))) if (rng(w) < p) {
    const P = PARTS[k], fatal = rng(w) < P.fatal;
    return { part: k, name: P.name, at: 0.15 + rng(w) * 0.75, fatal, warn: pickLine(w, P.warn), why: fatal ? pickLine(w, P.why) : '', hurt: P.hurt || '' };
  }
  return null;
}
// a round's wear: laps, damage, and whatever broke
export function wearCar(w, laps, damage, failed) {
  const P = carParts(w); if (!P) return;
  for (const k of PART_KEYS) {
    const p = PARTS[k]; let d = p.wear + p.lap * laps;
    if (k === 'suspension') d += damage * 0.5; else if (k === 'aero') d += damage * 0.6; else if (k === 'chassis') d += damage * 0.4;
    P[k].cond = +clamp(P[k].cond - d * (0.8 + rng(w) * 0.4), 0.05, 1).toFixed(3);
  }
  if (failed && P[failed]) P[failed].cond = Math.min(P[failed].cond, 0.15);
}
// work on a part: a rebuild (your mechanic, or a shop) or a new one
export const rebuildCost = (w, k) => Math.round(PARTS[k].cost * COSTS[w.player.series].repair * (staffOf(w, 'mechanic') ? 1 : 1.5) * (bgOf(w).repair || 1) / 50) * 50;
export const newPartCost = (w, k) => Math.round(PARTS[k].cost * COSTS[w.player.series].repair * 2.2 / 50) * 50;
export function rebuildPart(w, k) {
  const P = carParts(w), m = staffOf(w, 'mechanic'), cost = rebuildCost(w, k);
  const to = m ? 0.68 + 0.05 * m.skill - (m.morale < 35 ? 0.08 : 0) + (rng(w) - 0.5) * 0.06 : 0.8;
  P[k].cond = +Math.max(P[k].cond, clamp(to, 0.4, 0.97)).toFixed(3);
  pay(w, -cost, `${PARTS[k].name} rebuild (${m ? m.first : 'outsourced'})`);
}
export function newPart(w, k) { const P = carParts(w), cost = newPartCost(w, k); P[k].cond = 1; pay(w, -cost, `New ${PARTS[k].name.toLowerCase()} (OEM)`); }

// upgrades: { id, name, slot, gains: { stat: fraction }, claim, q (0..1: how well made), price, used, blurb }
const KIT = {
  street: [
    ['engine', 'Sport exhaust', { power: 0.02 }, 0.9, 3200], ['engine', 'Performance chip', { power: 0.03 }, 0.72, 2600], ['engine', 'Ported cylinder head', { power: 0.045 }, 0.8, 7500],
    ['gearbox', 'Uprated clutch', { power: 0.006 }, 1, 1800], ['gearbox', 'Short-shift kit', { power: 0.004 }, 0.98, 900],
    ['suspension', 'Coilovers', { grip: 0.025 }, 0.9, 4800], ['suspension', 'Polyurethane bushings', { grip: 0.01 }, 0.95, 1200],
    ['brakes', 'Race pads', { brake: 0.06 }, 0.9, 1100], ['brakes', 'Big brake kit', { brake: 0.1 }, 0.95, 5500],
    ['aero', 'Front splitter', { downforce: 0.08, drag: 0.01 }, 1, 1600], ['aero', 'Rear wing', { downforce: 0.15, drag: 0.03 }, 1, 2900],
    ['chassis', 'Seam welding', { grip: 0.008, damage: -0.1 }, 1, 2000], ['chassis', 'Bolt-in roll cage', { damage: -0.2 }, 1, 3500],
  ],
};
const PRICE_K = { street: 1, gt: 3, formula: 9 };
const claimOf = (gains, k) => Object.fromEntries(Object.entries(gains).map(([s, v]) => [s, +(v * k).toFixed(3)]));
// the parts catalogue (new, from a supplier: the claims are the supplier's)
export function catalogue(w) {
  const kits = KIT[w.player.series] || KIT.street;
  return kits.map(([slot, name, gains, q, price], i) => ({ id: 'cat' + i, slot, name, gains, claim: claimOf(gains, i % 3 === 1 ? 1.5 : 1.2), q, price: Math.round(price * (PRICE_K[w.player.series] || 1)), used: false }));
}
const USED_BLURB = ['Came off my car, ran fine.', 'Bought it, never fitted it. Wife says it has to go.', 'Ex-race car part. Some wear.', 'Rebuilt by my brother-in-law.', 'Not sure what it fits. Probably yours.', 'Fell off a truck (not literally).', 'Low miles. Some surface rust.'];
// SVList's parts section: a fresh handful each round, of very variable honesty
export function refreshUsedParts(w) {
  const kits = KIT.street;
  w.usedParts = [];
  for (let i = 0; i < 5; i++) {
    const [slot, name, gains, q0, price] = kits[Math.floor(rng(w) * kits.length)], luck = 0.25 + rng(w) * 1.1;
    w.usedParts.push({ id: 'up' + (w.nextId++), slot, name, gains: Object.fromEntries(Object.entries(gains).map(([s, v]) => [s, +(v * luck).toFixed(4)])),
      q: +clamp(q0 - 0.15 - rng(w) * 0.45, 0.2, 0.95).toFixed(2), price: Math.round(price * (0.3 + rng(w) * 0.3) / 50) * 50, used: true, blurb: pickLine(w, USED_BLURB), seller: pick(w, AD_SELLERS) });
  }
  // Danny knows a guy (some rounds)
  if (w.dannyHired && rng(w) < 0.4) {
    const deal = w.usedParts[Math.floor(rng(w) * w.usedParts.length)]; deal.price = Math.round(deal.price * 0.7 / 50) * 50; deal.danny = true;
    text(w, 'Danny', pickLine(w, [`my cousin is selling a ${deal.name.toLowerCase()}. its on svlist. says he'll do ${money$(deal.price)}`, `found a ${deal.name.toLowerCase()} on svlist, guy owes me a favour. ${money$(deal.price)}`]));
  }
}
// how an upgrade feels from the driver's seat (honest-ish: you can fool yourself)
export function feelOf(w, part) {
  const [stat, v] = Object.entries(part.gains)[0] || ['power', 0], felt = v + (rng(w) - 0.5) * 0.02;
  const S = { power: ['pulls noticeably harder', 'feels a bit stronger', 'hard to say', 'feels flat, if anything'], grip: ['turns in much sharper', 'feels more planted', 'hard to tell', 'feels nervous'],
    brake: ['stops a lot shorter', 'better pedal', 'about the same', 'pedal feels long'], downforce: ['stuck down in fast corners', 'a bit more stable at speed', 'can\'t feel it', 'feels light'], damage: ['feels solid', 'feels solid', 'feels the same', 'feels the same'] }[stat] || ['?', '?', '?', '?'];
  return felt > 0.025 ? S[0] : felt > 0.008 ? S[1] : felt > -0.004 ? S[2] : S[3];
}
export function buyFit(w, part) {
  const P = carParts(w); if (!P || isFitted(w, part)) return false;
  const m = staffOf(w, 'mechanic'), fee = m ? 0 : 400;
  pay(w, -(part.price + fee), `${part.name}${part.used ? ' (used, SVList)' : ''}${fee ? ' + fitting at a shop' : ''}`);
  P[part.slot].fit = { name: part.name, gains: part.gains, q: part.q, used: part.used, claim: part.claim || null, feel: feelOf(w, part), measured: null };
  if (part.used) w.usedParts = (w.usedParts || []).filter(x => x.id !== part.id);
  return true;
}
// already on the car (the same part in its slot)
export const isFitted = (w, part) => { const P = carParts(w); return !!(P && P[part.slot]?.fit && P[part.slot].fit.name === part.name); };
export function removeFit(w, slot) { const P = carParts(w); if (P && P[slot]) P[slot].fit = null; }
// after a round: your data engineer measures what the upgrades really do (a junior roughly, a senior closely)
export function measureParts(w) {
  const P = carParts(w), lvl = dataLevel(w), e = staffOf(w, 'engineer'); if (!P || !lvl) return;
  for (const k of PART_KEYS) {
    const f = P[k].fit; if (!f || (f.measured && f.measured.lvl >= lvl)) continue;
    const [stat, v] = Object.entries(f.gains)[0] || []; if (!stat) continue;
    f.measured = { stat, val: +(v * (1 + gauss(w) * (lvl === 2 ? 0.12 : 0.45))).toFixed(4), lvl, by: e.first };
  }
}

// ---------------- staff and payroll ----------------
// Three jobs. Each person has a skill (1-5), a wage per round and a morale (0-100). Payroll runs as a round starts,
// by your standing instructions per person: pay on time, pay half, hold. Unpaid wages are owed; unhappy staff work
// worse and, owed money, walk out (and someone tells the press).
export const ROLES = {
  manager:  { name: 'Team manager', perk: 'Handles the logistics: travel costs 20% less.' },
  mechanic: { name: 'Chief mechanic', perk: 'Repairs cost less and pit stops are quicker, more so with a better one.' },
  engineer: { name: 'Data engineer', perk: 'Reads the telemetry. A junior gives you the charts; a senior adds notes on where the time went.' },
};
const ROLE_WAGE = { manager: [700, 160], mechanic: [1300, 650], engineer: [1100, 550] }; // (street: base + per skill level)
const WAGE_K = { street: 1, gt: 2.6, formula: 6.5 };
export const PAY_MODES = [['full', 'On time'], ['half', 'Half'], ['hold', 'Hold']];
const CV = {
  manager: ['Ran logistics for a touring circus for six years.', 'Former events coordinator, municipal parks.', 'Twenty years in freight. Knows every weighbridge in the province.'],
  mechanic: ['Fifteen years at a dealership service bay.', 'Ex-rally mechanic. Can rebuild a gearbox in a car park.', 'Built drag cars in his garage. Has opinions.', 'Former crew chief, defunct GT team. Available immediately.', 'Mechanical engineering degree. Has never held a wrench in anger.'],
  engineer: ['Graduate, applied mathematics. First job.', 'Six years in sim racing esports, data analyst.', 'Former telemetry engineer, Formula SV. Left "by mutual agreement".', 'Wrote a thesis on tyre thermals nobody has read.', 'Used to work in insurance, modelling crash rates.'],
};
function staffPerson(w, role, skill) {
  const nat = pick(w, NAT_KEYS), N = NATS[nat], [base, per] = ROLE_WAGE[role];
  return { id: 's' + (w.nextId++), role, first: pick(w, N.f), last: pick(w, N.l), nat, age: r0(24 + rng(w) * 30), skill,
    wage: Math.round((base + per * skill) * (0.9 + rng(w) * 0.2) / 50) * 50, cv: pick(w, CV[role]), morale: 70, owed: 0, pay: 'full' };
}
// applicants: two or three per job, refreshed each season (Danny applies to manage the team)
function makeJobs(w) {
  const jobs = [];
  for (const role of Object.keys(ROLES)) for (let i = 0; i < (role === 'manager' ? 2 : 3); i++) jobs.push(staffPerson(w, role, clamp(r0(1 + rng(w) * 4.6), 1, 5)));
  if (!w.dannyHired && !w.dannyGone) jobs.unshift({ id: 'sdanny', role: 'manager', first: 'Danny', last: 'Moretti', nat: 'USA', age: 34, skill: 2, wage: 650, morale: 90, owed: 0, pay: 'full', danny: true,
    cv: 'Fantasy football league commissioner, 2019-present (2nd place). Will work for cheap. Your friend.' });
  return jobs;
}
export const staffOf = (w, role) => (w.staff || []).find(x => x.role === role);
export const wageNow = (w, x) => Math.round(x.wage * (WAGE_K[w.player.series] || 1) / 50) * 50;
export function hireStaff(w, id) {
  const c = (w.jobs || []).find(j => j.id === id); if (!c) return false;
  const old = staffOf(w, c.role); if (old) fireStaff(w, old.id, true);
  w.staff = w.staff || []; w.staff.push({ ...c, hired: w.year, morale: c.danny ? 95 : 70 });
  w.jobs = w.jobs.filter(j => j !== c);
  if (c.danny) { w.dannyHired = true; text(w, 'Danny', pickLine(w, [`no way!!! ur not gonna regret this`, `TEAM MANAGER. i'm telling my mom`])); }
  else mail(w, `${c.first} ${c.last}`, `${c.first.toLowerCase()}.${c.last.toLowerCase()}@coolmail.sv`, `Re: ${ROLES[c.role].name}`, [`Thank you for the offer. I accept. I can start before the next round.`, `${c.first} ${c.last}`]);
  return true;
}
// letting someone go: what you owe them is still owed (it's paid with the next payroll)
export function fireStaff(w, id, replaced = false) {
  const x = (w.staff || []).find(s => s.id === id); if (!x) return;
  w.staff = w.staff.filter(s => s !== x);
  if (x.owed > 0) w.wageClaims = (w.wageClaims || 0) + x.owed;
  if (x.danny) { w.dannyGone = true; text(w, 'Danny', replaced ? `oh. ok. no that's fine. that makes sense` : `wow ok`); }
}
// the data engineer: how much of the telemetry you can read (0 nothing, 1 the charts, 2 the notes too)
export function dataLevel(w) {
  const e = staffOf(w, 'engineer'); if (!e) return 0;
  return clamp((e.skill >= 3 ? 2 : 1) - (e.morale < 35 ? 1 : 0), 0, 2);
}
// what the staff do to the bills and the car
export function staffEffects(w) {
  const m = staffOf(w, 'mechanic'), mgr = staffOf(w, 'manager');
  const sulk = m && m.morale < 35;
  return { travel: mgr ? 0.8 : 1, repair: (m ? 1 - 0.06 * m.skill : 1.1) * (sulk ? 1.15 : 1), pitTime: m ? -0.25 * m.skill + (sulk ? 1 : 0) : 0.5 };
}
// the money payroll needs this round, by the instructions
export function payrollDue(w) {
  return (w.staff || []).reduce((a, x) => a + (x.pay === 'full' ? wageNow(w, x) : x.pay === 'half' ? Math.round(wageNow(w, x) / 2) : 0), 0) + (w.wageClaims || 0);
}
export const payrollShort = (w) => (w.staff || []).length > 0 && w.money && w.money.balance < payrollDue(w) - (w.wageClaims || 0); // (claims get paid regardless)
// run it (as a round starts): pay, owe, and see who's had enough
export function runPayroll(w) {
  if (!w.staff || w.paidRound === w.year * 100 + w.round) return;
  w.paidRound = w.year * 100 + w.round;
  if (w.wageClaims) { pay(w, -w.wageClaims, 'Labour board: wage claims from former staff'); w.wageClaims = 0; }
  for (const x of w.staff.slice()) {
    const wage = wageNow(w, x), soft = x.danny ? 0.5 : 1;
    const paid = x.pay === 'full' ? wage : x.pay === 'half' ? Math.round(wage / 2) : 0;
    if (paid) pay(w, -paid, `Payroll: ${x.first} ${x.last} (${ROLES[x.role].name.toLowerCase()})${paid < wage ? ', part' : ''}`);
    x.owed += wage - paid;
    x.morale = clamp(x.morale + (paid === wage ? 4 : paid ? -9 * soft : -18 * soft), 0, 100);
    if (paid < wage) x.unpaidRounds = (x.unpaidRounds || 0) + 1; else x.unpaidRounds = 0;
    // walking out: miserable and owed money (Danny stays, and lets you know)
    if (!x.danny && x.morale < 25 && x.owed > 0 && rng(w) < 0.45) {
      mail(w, `${x.first} ${x.last}`, `${x.first.toLowerCase()}.${x.last.toLowerCase()}@coolmail.sv`, 'Resignation',
        [`I'm resigning, effective immediately.`, `I am owed ${money$(x.owed)}. I've been advised to take it up with the labour board, and I have.`, `${x.first}`]);
      if (x.owed >= wage * 2) news(w, `${w.teams[w.player.team].name.toUpperCase()} STAFF UNPAID, SOURCES SAY`, `A former ${ROLES[x.role].name.toLowerCase()} at the Street Cup newcomers says wages have gone unpaid for weeks.`);
      fireStaff(w, x.id);
    } else if (x.danny && x.unpaidRounds === 2) text(w, 'Danny', `hey so the payroll thing. no rush. just my landlord is asking`);
  }
}
// paying back what's owed
export function payBack(w, id) {
  const x = (w.staff || []).find(s => s.id === id); if (!x || !x.owed) return;
  pay(w, -x.owed, `Back pay: ${x.first} ${x.last}`); x.owed = 0; x.unpaidRounds = 0; x.morale = clamp(x.morale + 12, 0, 100);
}
export function setPay(w, id, mode) { const x = (w.staff || []).find(s => s.id === id); if (x) x.pay = mode; }

// ---------------- telemetry: what the data engineer reads ----------------
// a summary of each session's best lap against the reference, kept for the computer's Team app (the Data tab)
export function logTelemetry(w, t) {
  w.telemetry = w.telemetry || [];
  w.telemetry.unshift({ id: 't' + (w.nextId++), y: w.year, r: w.round, ...t });
  if (w.telemetry.length > 30) w.telemetry.length = 30;
}

// ---------------- sponsors ----------------
// A title sponsor (on the car) and up to two associates. Each pays a fee a round for being seen, plus a bonus when you
// meet that round's objective; miss too many and they walk. Who offers depends on your standing with sponsors (w.rep,
// 0-100: results, objectives met, staying out of trouble): your home town's businesses first, bigger names later.
// [name, home town (null: anyone), standing needed, fee (street, a round), patience (misses a season), objectives they like, colour]
const SPONSOR_POOL = [
  ["Dale's Tire & Lube", 'pinewood', 0, 1400, 3, ['finish', 'top'], 0x1f5c2a], ['Pinewood Feed & Seed', 'pinewood', 0, 1100, 4, ['finish', 'clean'], 0x7a5a2a],
  ['Pine Hollow Credit Union', 'pinewood', 10, 2000, 2, ['top', 'beat'], 0x1d3f7a],
  ['Gulch Outlet Center', 'gulch', 0, 1500, 3, ['top', 'gain'], 0xd8742a], ['Mesa Pawn & Gold', 'gulch', 0, 1200, 3, ['gain', 'beat'], 0xc8a020],
  ['Desert Rose Motel', 'gulch', 10, 1800, 2, ['finish', 'clean'], 0xd04070],
  ['Metro Cab Co.', 'city', 0, 1500, 3, ['finish', 'gain'], 0xf2c21a], ['Downtown Dental', 'city', 0, 1300, 4, ['clean', 'finish'], 0x2aa0c8],
  ['Capital Self Storage', 'city', 10, 2000, 2, ['top', 'beat'], 0xe0601a],
  ['Azure Marine Supply', 'azure', 0, 1500, 3, ['finish', 'top'], 0x1a6ab8], ['Harbour Fish Market', 'azure', 0, 1100, 4, ['finish', 'gain'], 0x2a8a8a],
  ['Port Azure Yacht Brokers', 'azure', 10, 2200, 2, ['top', 'beat'], 0x14284a],
  ['Hotline Pizza', null, 20, 2400, 3, ['gain', 'top'], 0xc8141c], ['Max Hardware', null, 25, 2600, 3, ['finish', 'clean'], 0xe08a1a],
  ['Sunrise Insurance', null, 30, 3000, 2, ['clean', 'finish'], 0x2a4fa0], ['Volta Cola', null, 40, 4200, 2, ['top', 'lead'], 0xd01818],
  ['Apex Energy', null, 45, 4500, 2, ['lead', 'gain'], 0x18c040], ['Velocita State Lottery', null, 50, 5000, 2, ['top', 'beat'], 0xf2d22a],
  ['Gold Coast Airlines', null, 60, 6500, 2, ['top', 'clean'], 0x1a3a7a], ['Triton Watches', null, 70, 8000, 1, ['top', 'lead'], 0x111111],
];
const SPONSOR_K = { street: 1, gt: 3, formula: 9 };
const ASSOC_K = 0.45;
export const SPONSOR_SLOTS = ['title', 'assoc', 'assoc'];
export const sponsorName = (id) => sponsorById(id)?.name || '';
export const sponsorInfo = (id) => sponsorById(id);
export const repOf = (w) => (w.rep ??= 15);
export const dealsOf = (w) => (w.deals ??= []);
const sponsorById = (id) => { const s = SPONSOR_POOL[+id.slice(2)]; return s && { id, name: s[0], town: s[1], rep: s[2], fee: s[3], patience: s[4], wants: s[5], color: s[6] }; };
const sponsorAddr = (name) => `marketing@${name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]+/g, '')}.sv`;
// what you're expected to manage this round: about where you stand in the championship (or mid-field to start)
function expectedPos(w) {
  const st = standings(w, w.player.series), k = st.findIndex(e => e.pid === 'P');
  return w.series[w.player.series].results.length && k >= 0 ? k + 1 : 7;
}
// this round's objective for a deal (set once a round, so you can see it before you race)
export function dealObjective(w, d) {
  const key = w.year * 100 + w.round;
  if (d.obj && d.obj.key === key) return d.obj;
  const sp = sponsorById(d.sid), type = sp.wants[Math.floor(rng(w) * sp.wants.length)], ex = expectedPos(w);
  const o = { key, type };
  if (type === 'top') o.n = clamp(ex, 3, 10);
  if (type === 'gain') o.n = 2;
  if (type === 'beat') {
    const ts = teamStandings(w, w.player.series), mine = ts.findIndex(e => e.tid === w.player.team);
    const rival = ts[Math.max(0, (mine >= 0 ? mine : ts.length) - 1)] || ts[0];
    o.tid = rival && rival.tid !== w.player.team ? rival.tid : w.series[w.player.series].teams.find(t => t !== w.player.team);
  }
  d.obj = o; return o;
}
export function objText(w, o) {
  return o.type === 'top' ? `Finish in the top ${o.n}` : o.type === 'finish' ? 'Finish the race' : o.type === 'clean' ? 'Finish without causing contact'
    : o.type === 'gain' ? `Gain ${o.n} places from your grid slot` : o.type === 'lead' ? 'Lead a lap' : `Beat both ${w.teams[o.tid]?.name || 'rival'} cars`;
}
// did you do it? r: { pos, dnf, grid, led, blamed }
function objMet(w, o, r, rows) {
  if (!r) return false;
  if (o.type === 'top') return !r.dnf && r.pos <= o.n;
  if (o.type === 'finish') return !r.dnf;
  if (o.type === 'clean') return !r.dnf && !r.blamed;
  if (o.type === 'gain') return !r.dnf && r.grid != null && r.grid - r.pos >= o.n;
  if (o.type === 'lead') return (r.led || 0) > 0;
  if (o.type === 'beat') { const theirs = rows.filter(x => teamOfPid(w, x.pid) === o.tid); return !r.dnf && theirs.every(x => x.dnf || x.pos > r.pos); }
  return false;
}
// a round's sponsorship: fees and bonuses (bill items), standing, and the sponsors' patience
function sponsorRound(w, use, me) {
  const items = [], deals = dealsOf(w), rows = w.series[w.player.series].results.at(-1)?.rows || [], K = SPONSOR_K[w.player.series] || 1;
  const r = me ? { ...me, grid: use.grid ?? null, led: use.led ?? (me.pos === 1 && !me.dnf ? 1 : 0), blamed: !!use.blamed } : null;
  for (const d of deals.slice()) {
    const sp = sponsorById(d.sid), o = dealObjective(w, d), met = objMet(w, o, r, rows);
    // no logo on the car, no money (and they notice): w.logoShown is the sponsors on the car (main.js; null: can't tell)
    if (w.logoShown && !w.logoShown.includes(d.sid)) {
      items.push([`${sp.name}: logo not on the car, not paid`, 0]);
      d.misses++; d.hidden = (d.hidden || 0) + 1; w.rep = clamp(repOf(w) - 2, 0, 100);
      if (d.hidden >= 2) { w.deals = deals.filter(x => x !== d); w.rep = clamp(repOf(w) - 4, 0, 100); mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`Our logo still isn't on your car. We're paying for exposure we aren't getting, so we're ending the sponsorship.`, sp.name]); }
      else mail(w, sp.name, sponsorAddr(sp.name), 'Where is our logo?', [`We watched the race and couldn't find our logo on the car. We don't pay for a round we weren't seen in.`, `Please have it on the car by the next round.`, sp.name]);
      d.obj = null; continue;
    }
    items.push([`${sp.name} (${d.slot === 'title' ? 'title sponsor' : 'associate'})`, d.fee]);
    if (met) { items.push([`${sp.name} bonus: ${objText(w, o).toLowerCase()}`, d.bonus]); d.met++; w.rep = clamp(repOf(w) + 1, 0, 100); }
    else {
      d.misses++; w.rep = clamp(repOf(w) - 1, 0, 100);
      if (d.misses >= sp.patience + 1) {
        w.deals = deals.filter(x => x !== d);
        mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`We've reviewed our sponsorship of ${w.teams[w.player.team].name} and decided to end it, effective immediately.`, `We wish you the best for the rest of the season.`, sp.name]);
        w.rep = clamp(repOf(w) - 4, 0, 100);
      } else if (d.misses === sp.patience) mail(w, sp.name, sponsorAddr(sp.name), 'A word about results', [`We were hoping for more by now. ${d.met} of ${d.met + d.misses} targets met so far.`, `We'd like to see an improvement over the next round.`, sp.name]);
    }
    d.obj = null;
  }
  // standing: results matter most
  if (me) w.rep = clamp(repOf(w) + (me.dnf ? -2 : me.pos <= 3 ? 4 : me.pos <= 6 ? 2 : me.pos <= 10 ? 1 : 0), 0, 100);
  return items;
}
// new offers: more likely with a free slot and a good standing
function sponsorOffers(w, force = false) {
  const deals = dealsOf(w), free = SPONSOR_SLOTS.length - deals.length; if (!free) return;
  const pending = (w.mail || []).filter(m => m.sponsorOffer && !m.answer).length; if (pending >= 2) return;
  if (!force && rng(w) > 0.3 + repOf(w) / 250) return;
  const S = seriesById(w.player.series), have = new Set([...deals.map(d => d.sid), ...(w.mail || []).filter(m => m.sponsorOffer && !m.answer).map(m => m.sponsorOffer.sid)]);
  const cands = SPONSOR_POOL.map((x, i) => sponsorById('sp' + i)).filter(sp => !have.has(sp.id) && sp.rep <= repOf(w) && (sp.town ? sp.town === w.home && S.tier < 2 : true));
  if (!cands.length) return;
  const sp = cands.sort((a, b) => b.rep - a.rep + (rng(w) - 0.5) * 30)[0];
  const title = !deals.some(d => d.slot === 'title') && (sp.rep >= 10 || !deals.length);
  const fee = Math.round(sp.fee * (SPONSOR_K[w.player.series] || 1) * (title ? 1 : ASSOC_K) * (0.85 + repOf(w) / 200 + rng(w) * 0.2) / 50) * 50;
  const offer = { sid: sp.id, slot: title ? 'title' : 'assoc', fee, bonus: Math.round(fee * 0.6 / 50) * 50 };
  const local = sp.town ? `As a ${TOWNS[sp.town].name} business, we like to back local people.` : `We've been following your results.`;
  mail(w, sp.name, sponsorAddr(sp.name), `Sponsorship: ${w.teams[w.player.team].name}`,
    [`Hello,`, `${local} We'd like to sponsor ${w.teams[w.player.team].name} for the rest of the ${w.year} season${title ? ', as title sponsor (our name on the car)' : ', as an associate sponsor'}.`,
     `We'd pay ${money$(fee)} a round, and ${money$(offer.bonus)} more each round you meet the target we set for that race (${sp.wants.map(x => ({ top: 'results', finish: 'finishing', clean: 'clean racing', gain: 'overtaking', lead: 'leading', beat: 'beating particular teams' })[x]).join(' and ')}, mostly).`,
     sp.patience <= 1 ? 'We expect results.' : `We'd hope to see targets met more often than not.`, sp.name],
    { sponsorOffer: offer, choices: [['yes', `Accept: ${money$(fee)} a round`], ['no', 'Decline']] });
}
export function answerSponsor(w, m, key) {
  const o = m.sponsorOffer, sp = sponsorById(o.sid), deals = dealsOf(w);
  if (key !== 'yes') return 'declined';
  const titleTaken = deals.some(d => d.slot === 'title');
  if (deals.length >= SPONSOR_SLOTS.length) return 'full';
  const slot = o.slot === 'title' && titleTaken ? 'assoc' : o.slot;
  deals.push({ sid: o.sid, slot, fee: slot === o.slot ? o.fee : Math.round(o.fee * ASSOC_K / 50) * 50, bonus: o.bonus, met: 0, misses: 0, since: w.year, obj: null });
  if (slot === 'title') { news(w, `${sp.name.toUpperCase()} BACKS ${w.teams[w.player.team].name.toUpperCase()}`, `${sp.name} is the new title sponsor of the ${seriesById(w.player.series).name} team.`); }
  mail(w, sp.name, sponsorAddr(sp.name), 'Welcome aboard', [`Delighted to be working with you. ${slot === 'title' ? 'Our name will be on the car from the next round.' : 'Our logo will be on the car from the next round.'}`, `Our target for each race will be in your team's sponsor page before the weekend.`, sp.name]);
  return slot;
}

// ---------------- news (headlines) and texts (the phone) ----------------
function news(w, head, body = '', extra = {}) { if (w.pre && w.year < START_YEAR - 2) return; w.news.unshift({ y: w.year, r: w.round, when: whenOf(w), head, body, ...extra }); if (w.news.length > 120) w.news.length = 120; }
// an email (the garage computer): { from, addr, subj, body: [paragraphs], choices?, offer?, report? }
// when it happened, as the inbox and the news site show it
export const whenOf = (w) => w.round >= w.opts.len ? 'Season end' : w.series[w.player.series].results.some(x => x.round === w.round) ? `Round ${w.round + 1}` : w.round === 0 ? 'Pre-season' : `Round ${w.round}`;
export function mail(w, from, addr, subj, body, extra = {}) {
  if (w.pre) return;
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
  if (w.pre) return;
  w.msgs.unshift({ id: 'm' + (w.nextId++), y: w.year, r: w.round, from, body, read: false, ...extra });
  if (w.msgs.length > 80) w.msgs.length = 80;
}
export const unread = (w) => w.msgs.filter(m => !m.read).length;
const teammateOf = (w) => w.teams[w.player.team].drivers.find(d => d !== 'P');
const ord = (p) => p + (['th', 'st', 'nd', 'rd'][(p % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][p % 100] || 'th');
const pickLine = (w, a) => a[Math.floor(rng(w) * a.length)];

function seasonOpenNews(w, moves = []) {
  if (w.pre) return;
  const s = seriesById(w.player.series), S = w.series[s.id], mate = w.people[teammateOf(w)];
  const prev = w.prev && !w.player.starts && w.teams[w.prev] ? `Your entry was previously held by ${w.teams[w.prev].name}. Their pit garage has been reassigned to you, along with any items left in it.` : '';
  mail(w, `${s.name} Office`, addrOf(s, 'office'), `Welcome to the ${w.year} season`,
    [`Welcome to the ${w.year} ${s.name}.`, `${w.opts.len} rounds, ${S.teams.length * 2} drivers, ${S.teams.length} teams. The full calendar is on our website.`, ...(prev ? [prev] : []), `Round 1: ${S.cal[0].name}, ${S.cal[0].time}${S.cal[0].weather === 'clear' ? '' : ', ' + S.cal[0].weather}.`, `Good luck,`, `${s.name} Office`]);
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
// several careers: each in its own slot, with an index for the career screen
const OLD_KEY = 'svgp.world', INDEX = 'svgp.worlds', slot = (id) => 'svgp.world.' + id;
const readIndex = () => { try { return JSON.parse(localStorage.getItem(INDEX)) || []; } catch (e) { return []; } };
function migrate() {
  try {
    const old = localStorage.getItem(OLD_KEY); if (!old) return;
    const w = JSON.parse(old); if (w && w.v === 1) saveWorld(w);
    localStorage.removeItem(OLD_KEY);
  } catch (e) {}
}
export function listWorlds() { migrate(); return readIndex(); }
export function saveWorld(w) {
  try {
    w.id = w.id || 'w' + Date.now().toString(36);
    localStorage.setItem(slot(w.id), JSON.stringify(w));
    const idx = readIndex().filter(e => e.id !== w.id);
    idx.unshift({ id: w.id, team: w.teams[w.player.team].name, name: w.player.name, year: w.year, series: w.player.series, round: w.round, len: w.opts.len, over: w.over, saved: Date.now() });
    localStorage.setItem(INDEX, JSON.stringify(idx));
    return true;
  } catch (e) { return false; }
}
export function loadWorld(id) {
  migrate();
  try {
    const w = JSON.parse(localStorage.getItem(slot(id))); if (!w || w.v !== 1) return null;
    w.mail = w.mail || [];
    if (!w.money) startMoney(w);
    if (!w.founding) w.founding = { reg: true, car: true, legacy: true }; // (careers from before the founding: carry on as you were)
    return w;
  } catch (e) { return null; }
}
export function deleteWorld(id) { localStorage.removeItem(slot(id)); localStorage.setItem(INDEX, JSON.stringify(readIndex().filter(e => e.id !== id))); }
