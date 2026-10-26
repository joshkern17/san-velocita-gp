import { roundPress, digestRace } from './wpress.js';
import { pressQuestions, promiseText, penQuestion } from './wpressday.js';
// World Career: a persistent motorsport world that keeps going whether or not you race in it.
// Three series (Street Cup -> GT Championship -> Formula SV), six teams of two in each, every driver a person with
// an age, stats that grow and fade, a career history and a record against you. Your races are real; the other series'
// rounds are simulated from the drivers' ratings. At the end of a season people age, retire, get promoted or dropped,
// and rookies arrive. News and texts (shown on the phone) are written from what actually happened.
// No story arcs yet (that's the director, later): this is the world they will read from.
import { knobsFor } from './aiskill.js';
import { MATE_DAYS, fxText } from './matedays.js';
import { CARS, RETIRED } from './cars.js';
import { teamColors } from './teamliveries.js';

// ---------------- data ----------------
export const SEASON_LENGTHS = [4, 6, 8, 12];
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
// car: how you get a car for it (see 'moving up'): 'classifieds' (any road car, second-hand), 'customer' (homologated
// race cars from the makers' customer racing programmes: new, leased by the season, or ex-works), 'spec' (the series'
// one chassis, leased from the series). price: what a new car costs, cheapest to dearest. ballast: success ballast and
// balance of performance. gents: gentleman drivers pay for the second seat. seats: the second-seat deals its teams do
// (SEAT_KINDS), offered in the season setup at the start of each season there (none: sign whoever, on the computer).
// The ladder: tier is the rung (0 the shitbox league, 1 club racing, 2 Street Cup, 3 GT2, 4 GT1; gaps are rungs not
// built yet), path the career path it's on ('sportscar', 'formula'...). Several series can share a tier: finishing high
// enough earns an offer from each series of the next rung up (seriesUp), and you pick. tracks: the circuits it races
// at, first choice (from the career's pool; the rest of the pool fills a short list). ages: a new driver's age [from,
// spread]. oneMake: every car the same model (car two is an arrive-and-drive rental, not a hire car). lic: the racing licence grade an entrant needs (LICENSES). inv: how big an investor's money is here (GT = 1). pro: a professional series (corporate gigs, investors
// take notice). local: home-town sponsors still sign. gp: ends the year with the San Velocita Grand Prix.
// A new series is a line here, plus its costs (COSTS, SEASON_FUND, TEAM_FUND) and its cars: the rest builds itself.
export const SERIES = [
  { id: 'club', name: 'Spec Miata Club', cls: 'club', tier: 1, path: 'sportscar', oneMake: true, base: 44, spread: 14, car: 'classifieds', price: [14000, 14000], ages: [17, 12], inv: 0.4, local: true,
    tracks: ['Lime Rock Park', 'Summit Point', 'Thunderhill', 'Willow Springs', 'Pine Hollow Park', 'Maple Ridge GP', 'Watkins Glen', 'Laguna Seca'] },
  { id: 'street', name: 'Street Cup', cls: 'street', tier: 2, path: 'sportscar', base: 50, spread: 14, car: 'classifieds', bop: true, ages: [18, 9], inv: 0.6, local: true, lic: 2,
    tracks: ['Palm Bay Circuit', 'Lime Rock Park', 'Road Atlanta', 'Harborview Streets', 'Zandvoort', 'Watkins Glen', 'Indianapolis', 'Laguna Seca'] },
  // (the customer GT racers a class below GT1: the cars bought from the maker, balanced with ballast, the second seat
  // sold to a gentleman or a pro; the first rung with a truck to carry the car)
  { id: 'gt2', name: 'GT2 Championship', cls: 'gt2', tier: 3, path: 'sportscar', base: 57, spread: 13, car: 'customer', price: [95000, 140000], ballast: true, gents: true, seats: ['gent', 'pro', 'share', 'junior'], ages: [20, 12], inv: 0.8, pro: true, local: true, lic: 2,
    tracks: ['Laguna Seca', 'Lime Rock Park', 'Road Atlanta', 'Zandvoort', 'Watkins Glen', 'Circuit of the Americas', 'Indianapolis', 'Sebring International Raceway'] },
  { id: 'gt', name: 'GT Championship', cls: 'gt1', tier: 4, path: 'sportscar', base: 63, spread: 12, car: 'customer', price: [240000, 330000], ballast: true, gents: true, seats: ['gent', 'pro', 'share', 'junior'], works: true, hosp: true, ages: [21, 13], inv: 1, pro: true, local: true, lic: 2,
    tracks: ['Circuit of the Americas', 'Laguna Seca', 'Road Atlanta', 'Zandvoort', 'Watkins Glen', 'Spa-Francorchamps', 'Sebring International Raceway', 'Suzuka'] },
  // (the top of the ladder, for now: ground-effect prototypes, the 962C, the 787B and the XJR-9, balanced with ballast
  // as GT1 is; the year ends with the San Velocita Grand Prix, theirs)
  { id: 'groupc', name: 'Group C Championship', cls: 'groupc', tier: 5, path: 'sportscar', base: 69, spread: 11, car: 'customer', price: [480000, 650000], ballast: true, gents: true, seats: ['gent', 'pro', 'share', 'junior'], works: true, hosp: true, ages: [22, 14], inv: 1.8, pro: true, gp: true, local: true, lic: 2,
    tracks: ['Sebring International Raceway', 'Road Atlanta', 'Laguna Seca', 'Watkins Glen', 'Zandvoort', 'Spa-Francorchamps', 'Suzuka', 'Indianapolis'] },
  // (parked, 2026-10-25: still racing in the world, in the news, but off the ladder: nobody moves up into it)
  { id: 'formula', name: 'Formula SV', cls: 'f1', tier: 5, path: 'formula', base: 76, spread: 10, car: 'spec', price: [900000, 900000], gents: true, seats: ['gent', 'pro', 'share', 'junior'], hosp: true, ages: [22, 14], inv: 3, pro: true, parked: true, lic: 2,
    tracks: ['Madring', 'Monaco', 'Zandvoort', 'Spa-Francorchamps', 'Suzuka', 'Circuit of the Americas', 'Indianapolis'] },
];
export const seriesById = (id) => SERIES.find(s => s.id === id);
// where a new career starts (the entry you buy); a career keeps its own (w.start: careers from before the club
// started in the Street Cup)
export const START_SERIES = 'club';
export const startOf = (w) => w.start || 'street';
// the rungs either side: every series of the nearest tier above (below) that has one
const rung = (sid, dir) => {
  const t = seriesById(sid)?.tier ?? -1, near = SERIES.filter(s => !s.parked && (dir > 0 ? s.tier > t : s.tier < t));
  if (!near.length) return [];
  const n = dir > 0 ? Math.min(...near.map(s => s.tier)) : Math.max(...near.map(s => s.tier));
  return near.filter(s => s.tier === n);
};
export const seriesUp = (sid) => rung(sid, 1);
export const seriesDown = (sid) => rung(sid, -1);
// the one series up (down) to talk about: on the same path if there is one
const onPath = (list, sid) => list.find(s => s.path === seriesById(sid)?.path) || list[0] || null;
export const nextUp = (sid) => onPath(seriesUp(sid), sid);
export const nextDown = (sid) => onPath(seriesDown(sid), sid);
// 'the GT Championship or the Formula SV'
export const upNames = (sid) => seriesUp(sid).map(s => s.name).join(' or ');
// the series that ends the year with the Grand Prix
const gpSeries = () => SERIES.find(s => s.gp) || SERIES.reduce((a, s) => s.tier > a.tier ? s : a);
const TEAMS_PER = 6, SEATS = 2;

const TEAM_POOL = [
  ['Kobra Oil GP', 0x0a0a0c, 0xc9a23a], ['Azure Motorsport', 0x1450b4, 0xd0202a], ['Verde Corse', 0x1a8a3a, 0xf4f4f2],
  ['Neon FM Racing', 0xf4f4f2, 0x1c9a3a], ['Sunset Motel', 0xf06a1a, 0x111114], ['Silverline', 0xf4f4f2, 0x0e2a55],
  ['Burger Duck', 0xf4c01a, 0xd01818], ['Rapid Tyres', 0xf4f4f2, 0x0e2a55], ['Bayside Blue', 0x1a5ad0, 0xf4f4f2],
  ['Mesa Energy', 0xf4f4f2, 0x007a3a], ['Pine Hollow', 0x0f3a24, 0xf2d22a], ['Harbour Lights', 0xf2d21a, 0x111114],
  ['Kanjo Works', 0x0a0a0a, 0xe0102a], ['Palm Bay Autosport', 0x14b3a8, 0xff5a8a], ['Redline Garage', 0xf4f4f2, 0xd01818],
  ['Northwind', 0xf4f4f2, 0x14306a], ['Coastline Racing', 0x6ab8e8, 0xf4f4f2], ['Maple Motorsport', 0xf4f4f2, 0x7a1428],
  ['Volt Arc', 0x111114, 0x7dff3a], ['Copperhead', 0xd0101a, 0xf4f4f2],
  ['Dave\'s Transmission', 0x1a3a9a, 0xf4f4f2], ['Two Guys Racing', 0xff3a1a, 0xf4f4f2], ['Weekend Warriors', 0xf2d22a, 0x14306a],
  ['Lugnut Brothers', 0xf4f4f2, 0xd0202a], ['Budget Box Motorsport', 0xf2a0b0, 0x8a1020], ['Cul-de-Sac Racing', 0x3ec8c0, 0x14306a],
  ['Gulfstream Racing', 0x8fc8e8, 0xf07a1a], ['Stonebridge Competition', 0xb8bcc4, 0x00a19b], ['Apex Customer Racing', 0xd81e2a, 0xf4f4f2],
  ['Blackwater Engineering', 0x101418, 0x00d2be], ['Lakeside Motorsport', 0xf2d21a, 0x14306a], ['Ridgeway GT', 0x5a1a8a, 0xf4f4f2],
  ['Crown Point Racing', 0xf4f4f2, 0x2a2a8a], ['Old Mill Garage', 0x5a3a22, 0xf0e0b0],
  ['Silverlake Racing', 0x111114, 0xc9a23a], ['Sunrise Endurance', 0xf4f4f2, 0x1450b4],
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
  giveTraits(w, p);
  return p;
}
// ---------------- traits: who a driver is, beyond the numbers ----------------
export const TRAITS = {
  digger:    { name: 'Digger', desc: 'Quick, and knows it. Complains to the press when things go wrong, and wants to be number one.' },
  loyal:     { name: 'Loyal', desc: 'Sticks with a team through bad times. Asks for less, forgives late pay.' },
  hothead:   { name: 'Hothead', desc: 'Brilliant wheel to wheel, and in the wall more often than most.' },
  rainman:   { name: 'Rain master', desc: 'Comes alive in the wet.' },
  mentor:    { name: 'Mentor', desc: 'An old hand. Their teammate goes quicker for having them around.' },
  metronome: { name: 'Metronome', desc: 'Same lap time, every lap. Rarely spectacular.' },
  paydriver: { name: 'Pay driver', desc: 'Brings their own money. Not always the quickest.' },
  gentleman: { name: 'Gentleman driver', desc: 'Pays handsomely for the seat. Has a day job, and it shows.' },
};
function giveTraits(w, p) {
  p.traits = [];
  const age = ageOf(w, p), roll = () => rng(w);
  if (roll() < 0.14) { p.traits.push('digger'); p.pace = clamp(p.pace + 2, 20, 99); p.pot = clamp(p.pot + 2, 20, 99); }
  if (roll() < 0.12 && !p.traits.includes('digger')) p.traits.push('loyal');
  if (roll() < 0.12) { p.traits.push('hothead'); p.aggr = clamp(p.aggr + 22, 8, 98); p.cons = clamp(p.cons - 8, 20, 96); }
  if (roll() < 0.1) { p.traits.push('rainman'); p.wet = clamp(p.wet + 22, 15, 99); }
  if (age >= 30 && roll() < 0.3) p.traits.push('mentor');
  if (roll() < 0.1 && !p.traits.includes('hothead')) { p.traits.push('metronome'); p.cons = clamp(p.cons + 12, 20, 98); p.craft = clamp(p.craft - 5, 20, 96); }
  if (roll() < 0.08) { p.traits.push('paydriver'); p.pace = clamp(p.pace - 4, 20, 99); }
  if (p.traits.length > 2) p.traits.length = 2;
}
export const people = (w) => w.people;
export const traitsOf = (w, p) => { if (p && !p.traits) giveTraits(w, p); return p ? p.traits : []; };
// ---------------- your teammate: contracts and the driver market ----------------
// w.mate: { pid, wage (a round; 0 for a pay driver), fee (a pay driver's money, a season), until (last season),
// pay ('full' | 'half' | 'hold'), owed, morale }. Free agents can be signed any time; between seasons (the season
// over), drivers from other teams in your series and below too. Releasing someone mid-contract costs their wages to
// the end of the season, and drivers hear about it.
const DRIVER_WAGE = (pace) => Math.max(250, Math.round((300 + (pace - 40) * 65) / 50) * 50);
export function mateOf(w) {
  if (w.coop) coopSeat(w);
  const pid = w.teams[w.player.team]?.drivers.find(d => d !== 'P'); if (!pid) return null;
  if (w.coop && pid === w.coop.pid) { if (!w.mate || w.mate.pid !== pid) w.mate = { pid, wage: 0, fee: 0, until: 9999, pay: 'full', owed: 0, morale: 70, human: true }; return w.mate; }
  if (!w.mate || w.mate.pid !== pid) {
    // (a contract for whoever is in the seat: the pay driver you inherited, or someone the series placed there)
    const pd = w.payDriver && w.payDriver.pid === pid ? w.payDriver : null;
    w.mate = { pid, wage: pd ? 0 : askOf(w, w.people[pid]).wage, fee: pd ? pd.fee : 0, until: w.year, pay: 'full', owed: 0, morale: 65, auto: !pd };
  }
  return w.mate;
}
// what a driver wants: a wage a round (scaled to your series), or a pay driver's money a season
export function askOf(w, p) {
  const k = WAGE_K[w.player.series] || 1, t = traitsOf(w, p);
  if (t.includes('gentleman')) return { wage: 0, fee: p.purse || 150000 };
  if (t.includes('paydriver') && p.purse) return { wage: 0, fee: p.purse };
  if (t.includes('paydriver')) return { wage: 0, fee: Math.round((25000 + (60 - Math.min(60, p.pace)) * 900) * (k > 1 ? k * 0.6 : 1) / 500) * 500 };
  let wage = DRIVER_WAGE(p.pace) * k;
  if (t.includes('digger')) wage *= 1.3; if (t.includes('loyal')) wage *= 0.8; if (p.titles) wage *= 1 + 0.15 * p.titles;
  return { wage: Math.round(wage / 50) * 50, fee: 0 };
}
// a career saved before a series existed (the Spec Miata Club, 2026-10-13): the series joins the world as a new world
// would have it, six teams of two with this season's calendar (made from the circuits the other series race at, its own
// first); no history, it simply wasn't reported on
function addMissingSeries(w) {
  for (const s of SERIES) {
    if (w.series[s.id]) continue;
    const used = new Set(Object.values(w.teams).map(t => t.name)), free = TEAM_POOL.filter(([n]) => !used.has(n));
    let n = Math.max(0, ...Object.keys(w.teams).map(id => +id.slice(1) || 0));
    const ids = [];
    for (let t = 0; t < TEAMS_PER; t++) {
      const [name, main, accent] = free[t] || [`${s.name} Team ${t + 1}`, 0x777777, 0xffffff], id = 'T' + (++n);
      w.teams[id] = { id, name, main, accent, series: s.id, car: clamp(s.base + gauss(w) * 5, 20, 98), drivers: [] };
      for (let seat = 0; seat < SEATS; seat++) { const [a0, as] = s.ages || [21, 13]; const p = makePerson(w, { age: r0(a0 + rng(w) * as), series: s.id, lvl: s.base + gauss(w) * s.spread * 0.4 }); p.team = id; w.teams[id].drivers.push(p.id); }
      aiInit(w, w.teams[id]); ids.push(id);
    }
    // (the calendar: the rounds the others have, the circuits this series prefers first)
    const seen = new Map(); for (const S of Object.values(w.series)) for (const c of S.cal || []) if (!seen.has(c.name)) seen.set(c.name, c);
    const all = [...seen.values()], own = all.filter(c => (s.tracks || []).includes(c.name)), rest = all.filter(c => !own.includes(c));
    const order = [...own, ...rest], cal = [];
    for (let r = 0; r < w.opts.len && order.length; r++) { const c = order[r % order.length]; cal.push({ name: c.name, time: c.time, weather: c.weather, theme: c.theme, surface: c.surface }); }
    w.series[s.id] = { teams: ids, cal, results: [] };
  }
}
// the people without a seat: kept at about ten (juniors after a first seat, drivers who lost theirs, the odd veteran)
function topUpFreeAgents(w) {
  const free = Object.values(w.people).filter(p => !p.retired && !p.team && ageOf(w, p) < 37);
  for (let i = free.length; i < 10; i++) {
    const x = rng(w), s0 = seriesById(START_SERIES), s = rng(w) < 0.7 ? s0 : nextUp(s0.id) || s0;
    const age = x < 0.5 ? r0(17 + rng(w) * 3) : x < 0.85 ? r0(22 + rng(w) * 7) : r0(30 + rng(w) * 5);
    const p = makePerson(w, { age, series: null, lvl: s.base - 4 + gauss(w) * 6 + (age > 21 ? 3 : 0) });
    // (a career before you met them, for the older ones)
    if (age > 21) { const yrs = Math.min(age - 19, 8); p.starts = r0(yrs * w.opts.len * (0.5 + rng(w) * 0.5)); p.wins = rng(w) < 0.3 ? r0(rng(w) * 4) : 0; p.pods = p.wins + r0(rng(w) * 5); p.series = null; }
  }
}
export function driverMarket(w) {
  const S = seriesById(w.player.series), mateId = mateOf(w)?.pid;
  const ok = (sid) => sid && seriesById(sid) && seriesById(sid).tier <= S.tier;
  // (without a seat, a driver from the series above will drop down for a drive)
  const upTier = nextUp(S.id)?.tier ?? S.tier, okFree = (sid) => !sid || (seriesById(sid) && seriesById(sid).tier <= upTier);
  return Object.values(w.people).filter(p => !p.retired && p.id !== mateId && ageOf(w, p) < 40 && (
    (!p.team && okFree(p.series)) || (w.over && p.team && p.team !== w.player.team && ok(w.teams[p.team]?.series))))
    .sort((a, b) => b.pace - a.pace).slice(0, 14);
}
// will they sign? (an offer of their ask, or lowball = 75% of it)
export function offerDriver(w, pid, lowball = false) {
  const p = w.people[pid], a = askOf(w, p), h = h2hOf(w, pid);
  if (w.coop) return { ok: false, why: `The second car is ${coopPerson(w).first}'s. They own part of the team.` };
  if (grudgeOf(w, pid) >= 3) return { ok: false, why: `${p.first} won't drive for you. Not after the way you've raced them.` };
  if (drepOf(w) < 25 && !traitsOf(w, p).includes('paydriver')) return { ok: false, why: `${p.first} has heard how you treat drivers, and isn't interested.` };
  if (lowball && rng(w) > (p.team ? 0.15 : 0.45) + (traitsOf(w, p).includes('loyal') ? 0.1 : 0)) { w.drep = clamp(drepOf(w) - 1, 0, 100); return { ok: false, why: `${p.first} turned the offer down. "That's not serious money."` }; }
  // sign them: the seat's current driver is let go
  const cur = mateOf(w), team = w.teams[w.player.team];
  let comp = 0;
  if (cur) {
    // (someone the series put in the seat, let go before they've raced for you: nothing owed)
    const q = w.people[cur.pid], left = cur.until >= w.year && !w.over && !(cur.auto && w.round === 0) ? (w.opts.len - w.round) : 0;
    comp = left * cur.wage + (cur.owed || 0);
    if (comp) pay(w, -comp, `Released ${q.first} ${q.last}: rest of the contract`);
    if (left) { w.drep = clamp(drepOf(w) - 8, 0, 100); news(w, `${team.name.toUpperCase()} DROPS ${q.last.toUpperCase()}`, `${nameOf(q)} is out of the team mid-season.`); }
    team.drivers = team.drivers.filter(d => d !== cur.pid); q.team = null;
    text(w, q.first, traitsOf(w, q).includes('loyal') ? `I'd have stuck with you. Good luck.` : left ? `Mid-season? Wow. Thanks for nothing.` : `Fair enough. See you on track.`);
  }
  if (p.team) { const from = w.teams[p.team]; from.drivers = from.drivers.filter(d => d !== pid); }
  p.team = team.id; p.series = w.player.series; team.drivers.push(pid);
  const wage = lowball ? Math.round(a.wage * 0.75 / 50) * 50 : a.wage, fee = lowball ? a.fee : a.fee;
  w.mate = { pid, wage, fee, until: w.year + (w.over ? 1 : 0), pay: 'full', owed: 0, morale: lowball ? 55 : 75 };
  w.payDriver = null;
  if (fee) pay(w, fee, `${p.first} ${p.last}: seat money`);
  mail(w, `${p.first} ${p.last}`, `${p.first.toLowerCase()}.${p.last.toLowerCase()}@coolmail.sv`, 'Contract', [fee ? `Deal. My backers will send ${money$(fee)}.` : `Signed. ${money$(wage)} a round, through ${w.mate.until}. Let's go racing.`, p.first]);
  news(w, `${p.last.toUpperCase()} JOINS ${team.name.toUpperCase()}`, `${nameOf(p)} signs for the ${seriesById(w.player.series).name} team${fee ? ', bringing sponsorship with them' : ''}.`);
  return { ok: true, comp };
}
export function extendMate(w) { const m = mateOf(w); if (!m || m.human) return; const ask = mateAsk(w); if (ask == null) return; m.wage = ask; m.until = Math.max(m.until, w.year) + 1; m.morale = clamp(m.morale + 10, 0, 100); w.drep = clamp(drepOf(w) + 2, 0, 100); }
export function setMatePay(w, mode) { const m = mateOf(w); if (m) m.pay = mode; }

// ---------------- co-op: a friend buys into the team ----------------
// w.coop: { pid: 'C', token (their copy of the game), kind (how they bought in), stake (%), boss (a boss sponsor's
// company), since }. The friend is a person in your second car, co-owner of the team: no wage, no contract, no Trust,
// never retires. When they're not online their car is raced for them, as they'd drive it.
const COOP_K = { club: 0.6, street: 1, gt2: 2, gt: 4, groupc: 6, formula: 9 };
export const BUYINS = {
  car:    { name: 'Sell Your Car', short: 'Sell Your Car', cash: 16000, stake: 15, blurb: 'Your car goes on SVList and the money goes in the team account. You take the bus to work now.' },
  house:  { name: 'Remortgage The House', short: 'Remortgage', cash: 42000, stake: 30, blurb: 'The bank lends against your house and the money goes in the team account. The repayments are yours.' },
  boss:   { name: 'Get Your Boss To Sponsor You', short: 'Boss Sponsors You', per: 2000, stake: 10, blurb: "Your employer's name goes on your car and they pay the team every round. They'll want to see you at work." },
  talent: { name: 'Just Your Talent', short: 'Just Talent', stake: 5, blurb: "No money. You're here because you're quick, and you'll say so." },
};
const BOSSES = ['Pacific Cold Storage', 'Velocita Mutual Insurance', 'Hartmann Office Supply', 'Sunset Self Storage', 'BrightSmile Dental Group', 'Coastal Pest Control'];
export function buyinOf(w, kind) { const b = BUYINS[kind], k = COOP_K[w.player.series] || 1; return b && { ...b, kind, cash: Math.round((b.cash || 0) * k / 500) * 500, per: Math.round((b.per || 0) * k / 50) * 50 }; }
export const coopOf = (w) => w.coop || null;
export const coopPerson = (w) => w.coop ? w.people[w.coop.pid] : null;
// ---------------- co-op roles: who runs what (2026-10-25) ----------------
// Two co-owners, two jobs: the Team Principal runs the business, the Technical Director runs the cars. Both drive.
// Each team action belongs to one of them (OP_ROLES); the other one can suggest it (propose), and it waits for the
// owner to say yes (approveProp: done then, on the host's copy) or no. Their own days, their gigs, are their own.
export const COOP_ROLES = {
  boss: { name: 'Team Principal', short: 'Principal', does: ['Sponsors, deals and the email', 'Staff, wages and payroll', 'The money: the bank, loans', 'Facilities', 'The press and the series'] },
  tech: { name: 'Technical Director', short: 'Technical', does: ['The cars: buying and selling them', 'Parts, repairs and rebuilds', 'Development projects', 'Tires', 'Race-day strategy'] },
};
const OP_ROLES = {
  boss: ['answerPen', 'buildFacility', 'sellFacility', 'hireStaff', 'fireStaff', 'payBack', 'setPay', 'applyLoan', 'sellAnnuity', 'offerDriver', 'extendMate', 'setMatePay',
    'answerSponsor', 'answerWorks', 'answerInvestor', 'answerBuyout', 'answerPoach', 'answerGent', 'answerOffer', 'rsvpEvent'],
  tech: ['acquireCar', 'buyCar', 'sellCar', 'buyCar2', 'buyCar2Model', 'sellCar2', 'setCar2Fix', 'buyFit', 'removeFit', 'newPart', 'rebuildPart', 'startProject', 'workOnProject', 'orderTyres', 'removeGrey'],
};
export const opRole = (fn) => Object.keys(OP_ROLES).find(r => OP_ROLES[r].includes(fn)) || null;
// a co-owner's role ('P' you, 'C' the co-owner): the host runs the business unless the season setup said otherwise
export const roleOf = (w, pid) => !w.coop ? null : (w.coop.roles && w.coop.roles[pid]) || (pid === 'P' ? 'boss' : 'tech');
export const roleOwner = (w, role) => roleOf(w, 'P') === role ? 'P' : 'C';
// whose call an action is (null: anyone's, or not co-op)
export const opOwner = (w, fn) => { const r = w.coop && opRole(fn); return r ? roleOwner(w, r) : null; };
export function setRoles(w, hostRole) { if (w.coop && COOP_ROLES[hostRole]) w.coop.roles = { P: hostRole, C: hostRole === 'boss' ? 'tech' : 'boss' }; }
// suggestions: { id, by, fn, args (as sent: world things by reference), what, cost, y, r }; the owner's to answer
export function propose(w, by, fn, args, what, cost = 0) {
  if (!w.coop || !opRole(fn) || opOwner(w, fn) === by) return null;
  const p = { id: 'pr' + (w.nextId++), by, fn, args: args || [], what: String(what || fn).slice(0, 90), cost: +cost || 0, y: w.year, r: w.round };
  (w.props ??= []).push(p); if (w.props.length > 8) w.props.shift();
  return p;
}
export const propsFor = (w, pid) => (w.props || []).filter(p => p.by !== pid);       // (waiting for you to answer)
export const propsBy = (w, pid) => (w.props || []).filter(p => p.by === pid);        // (yours, waiting for them)
export const propsAnswered = (w, pid) => (w.propLog || []).filter(p => p.by === pid); // (yours, answered: newest first)
const unrefArg = (w, a) => {
  if (!a || typeof a !== 'object' || !a.$ref) return a;
  const arr = a.$ref.startsWith('week.') ? w.week?.[a.$ref.slice(5)] : w[a.$ref]; if (!Array.isArray(arr)) return null;
  return (a.id != null ? arr.find(x => x && x.id === a.id) : null) || arr[a.i] || null;
};
function answered(w, p, ok, why) { (w.propLog ??= []).unshift({ id: p.id, by: p.by, what: p.what, ok, why: why || '', y: w.year, r: w.round }); if (w.propLog.length > 12) w.propLog.length = 12; }
// yes: done now, as if the owner had done it themselves (what it returns: { ok, why } where the action says)
export function approveProp(w, id) {
  const i = (w.props || []).findIndex(p => p.id === id); if (i < 0) return null;
  const p = w.props.splice(i, 1)[0], f = OPS_RUN[p.fn]; if (!f) return null;
  let r; try { r = f(w, ...p.args.map(a => unrefArg(w, a))); } catch (e) { r = { ok: false, why: 'It couldn\'t be done.' }; }
  const bad = r && typeof r === 'object' && r.ok === false;
  answered(w, p, !bad, bad ? r.why : '');
  return r ?? { ok: true };
}
// what only the one in a role does with a day (co-op): the Principal works the business (a sponsor pitch, haggling the
// weekend down, a team meeting, the media), the Technical Director the cars (the dyno, the data, the wind tunnel). One
// of each a week; what they do counts this weekend (w.roleWk, this round's)
const roleWk = (w) => { const k = `${w.year}-${w.round}`; if (!w.roleWk || w.roleWk.key !== k) w.roleWk = { key: k, done: {} }; return w.roleWk; };
export const roleWeek = (w) => (w.roleWk && w.roleWk.key === `${w.year}-${w.round}` ? w.roleWk : { done: {} });
export function roleDays(w, pid) {
  const role = roleOf(w, pid); if (!role || w.over) return [];
  const R = roleWeek(w), t = myTeam(w), S = w.series[w.player.series], deals = dealsOf(w), c = COSTS[w.player.series], out = [];
  const day = (key, o) => out.push({ key, role, done: !!R.done[key], ...o });
  if (role === 'boss') {
    const free = SPONSOR_SLOTS.length - deals.length, title = deals.find(d => d.slot === 'title'), sp = title && sponsorById(title.sid);
    day('pitch', free ? { name: 'Sponsor pitch', short: 'Pitch', desc: 'Print the deck, put on the good shirt and do the rounds of the business park. Somebody wants their name on a race car. They just don\'t know it yet.', effect: 'A sponsor offer by email', money: 'Free' }
      : { name: `Lunch with ${sp ? sp.name : 'the sponsors'}`, short: 'Sponsors', desc: 'Remind them why they signed. Pick up the bill. Laugh at the joke about the marketing budget.', effect: title && title.misses ? 'A missed target forgiven' : '+1 reputation', money: `−${money$(roleLunch(w))}` });
    day('haggle', { name: 'Haggle the weekend down', short: 'Haggle', desc: 'The series office, the freight company, the hotel by the circuit. Every one of them has a discount if you stay on the phone long enough.', effect: `About ${money$(roleHaggle(w))} off this weekend's bill`, money: 'Free' });
    if ((w.staff || []).length) day('meeting', { name: 'Team meeting', short: 'Meeting', desc: 'Pizza, a whiteboard, and everyone says what\'s bothering them. It\'s mostly the coffee machine.', effect: 'Your staff happier: they work better', money: `−${money$(150)}` });
    day('media', { name: 'Media rounds', short: 'Media', desc: 'Local radio at 6 am, the paper at noon, a podcast in somebody\'s garage at 8 pm.', effect: '+2 press, +1 reputation', money: 'Free' });
  } else {
    if (facLevel(t, 'dyno')) day('dyno', { name: 'Dyno session', short: 'Dyno', desc: 'The engine on the dyno all day: every sensor checked, the tired bits found before the race finds them.', effect: 'Engine and gearbox far less likely to fail this weekend', money: 'Free' });
    if (S.results.length) day('data', { name: 'Data day', short: 'Data', desc: `Last race's data, lap by lap, both cars. ${facLevel(t, 'data') ? 'The data room makes short work of it.' : 'On a laptop, at the kitchen table.'}`, effect: 'Some of the setup found for this weekend', money: 'Free' });
    const aero = (w.projects || []).find(x => !x.done && !x.shop && x.area === 'aero');
    if (facLevel(t, 'tunnel') && aero) day('tunnel', { name: `Wind tunnel: ${aero.name}`, short: 'Tunnel', desc: 'A day in the tunnel with the model, smoke and a clipboard. Two days of guessing, settled in one.', effect: `${(aero.prog || 0).toFixed(1)} → ${Math.min(aero.days, (aero.prog || 0) + 2).toFixed(1)} of ${aero.days} days`, money: 'Free' });
  }
  return out;
}
const roleLunch = (w) => Math.round(120 * (PRICE_K[w.player.series] || 1) / 10) * 10;
const roleHaggle = (w) => { const c = COSTS[w.player.series]; return Math.round((c.entry + c.travel) * 0.25 / 50) * 50; };
// the haggled discount, if there is one this weekend (settleRound takes it off the bill)
export const roleDiscount = (w) => roleWeek(w).done.haggle ? roleHaggle(w) : 0;
// do it: the day goes from whoever's doing it (pid), { amt, line, note } or null
export function roleDay(w, pid, key) {
  const o = roleDays(w, pid).find(x => x.key === key); if (!o || o.done) return null;
  if (pid === 'C' ? coopDaysLeft(w) <= 0 : daysLeft(w) <= 0) return null;
  const R = roleWk(w), t = myTeam(w), use = (amt = 0) => pid === 'C' ? coopUse(w, o.name, amt, o.short) : useDay(w, o.name, amt, o.short);
  let amt = 0, note = '';
  if (key === 'pitch') {
    const free = SPONSOR_SLOTS.length - dealsOf(w).length;
    if (free) { const n = (w.mail || []).length; sponsorOffers(w, true); note = (w.mail || []).length > n ? `${w.mail[0].from} want to talk. It's in the email.` : 'Lots of business cards. Nobody bit. This time.'; }
    else { const d = dealsOf(w).find(x => x.slot === 'title'); amt = -roleLunch(w); pay(w, amt, 'Sponsor lunch');
      if (d && d.misses) { d.misses--; note = 'They\'ll overlook last time. They said so twice.'; } else { w.rep = clamp(repOf(w) + 1, 0, 100); note = 'They ordered the lobster.'; } }
  } else if (key === 'haggle') note = `${money$(roleHaggle(w))} off this weekend. The freight company threw in a calendar.`;
  else if (key === 'meeting') { amt = -150; pay(w, amt, 'Team meeting (pizza)'); for (const x of w.staff || []) x.morale = clamp((x.morale ?? 60) + 12, 0, 100); note = 'They fixed the coffee machine. Morale up.'; }
  else if (key === 'media') { w.press = pressOf(w) + 2; w.rep = clamp(repOf(w) + 1, 0, 100); note = pickLine(w, ['The radio host called the car "the little red one". It isn\'t red.', 'The podcast has eleven listeners. Nine of them are sponsors now.']); }
  else if (key === 'dyno') note = 'Found a tired bearing and a loose connector. Not any more.';
  else if (key === 'data') note = 'Braking too early into the hairpin. Both of you.';
  else if (key === 'tunnel') { const x = (w.projects || []).find(p => !p.done && !p.shop && p.area === 'aero'); if (!x) return null; x.prog = (x.prog || 0) + 2; if (x.prog >= x.days) finishProject(w, x); note = x.done ? 'Finished.' : `${Math.min(x.days, x.prog).toFixed(1)} of ${x.days} days of work done`; }
  R.done[key] = pid; use(amt);
  return { amt, line: o.name, note };
}
export function declineProp(w, id) { const i = (w.props || []).findIndex(p => p.id === id); if (i < 0) return; answered(w, w.props.splice(i, 1)[0], false, 'Not now'); }
// the friend signs: { first, last, number, kind, token }
export function coopJoin(w, o) {
  if (w.coop || !BUYINS[o.kind]) return null;
  const S = seriesById(w.player.series), b = buyinOf(w, o.kind), T = myTeam(w);
  const p = makePerson(w, { age: 35, series: S.id, lvl: S.base });
  delete w.people[p.id]; p.id = 'C'; w.people.C = p;
  Object.assign(p, { first: o.first, last: o.last, human: true, traits: [], number: o.number, retireAge: 999, pot: p.pace });
  w.coop = { pid: 'C', token: o.token, kind: o.kind, stake: b.stake, number: o.number, since: w.year, boss: o.kind === 'boss' ? pickLine(w, BOSSES) : null };
  // the seat: whoever's in it now goes (no compensation: the co-owner's taking it)
  const was = T.drivers.find(d => d !== 'P' && d !== 'C'), old = was && w.people[was];
  coopSeat(w);
  if (b.cash) pay(w, b.cash, `Buy-in: ${o.first} ${o.last} (${o.kind === 'car' ? 'sold their car' : 'remortgaged'})`);
  const you = w.player.name.split(' ')[0];
  news(w, `NEW MONEY AT ${T.name.toUpperCase()}: ${o.last.toUpperCase()} BUYS IN`,
    `${o.first} ${o.last} has bought ${b.stake}% of ${T.name} ${o.kind === 'car' ? 'with the proceeds of a 2011 hatchback' : o.kind === 'house' ? 'with a second mortgage' : o.kind === 'boss' ? `with backing from their employer, ${w.coop.boss}` : 'with what the paperwork describes as "talent"'}, and will drive the second car.${old ? ` ${nameOf(old)} is out.` : ''} "${you} called me at two in the morning," ${o.last} told the Wire. "I said yes before I was awake."`);
  if (old) text(w, old.first, pickLine(w, [`So your mate gets my seat. Cool. Cool cool cool.`, `Heard. Good luck to them, they'll need it in that car.`]));
  return { cash: b.cash, stake: b.stake };
}
// each driver's target (co-op): a place better than they've been finishing (their last three rounds; before any, the
// middle of the field), so a quicker and a slower driver both have something to race for. Met, it pays the team.
export function driverTarget(w, pid) {
  const sid = w.player.series, S = w.series[sid], n = S.teams.reduce((a, t) => a + w.teams[t].drivers.length, 0) || 12;
  const fins = S.results.filter(r => r.round < w.round).slice(-3).map(r => r.rows.find(x => x.pid === pid)).filter(Boolean).map(x => x.dnf ? n : x.pos);
  const base = fins.length ? fins.reduce((a, b) => a + b, 0) / fins.length : Math.ceil(n * 0.6) + 1;
  return clamp(Math.round(base) - 1, 1, n - 1);
}
export const targetBonus = (w) => Math.round((COSTS[w.player.series] || COSTS.street).prize[2] * 0.25 / 50) * 50;
// the second seat is the friend's: anyone else in it goes (a season's setup, a seat deal, a story)
function coopSeat(w) {
  const T = myTeam(w), pid = w.coop.pid; if (!T || !w.people[pid]) return;
  if (T.drivers.length === 2 && T.drivers[1] === pid) return;
  for (const d of T.drivers) if (d !== 'P' && d !== pid && w.people[d]) w.people[d].team = null;
  T.drivers = ['P', pid];
  const p = w.people[pid]; p.team = T.id; p.series = w.player.series;
  if (w.mate && w.mate.pid !== pid) w.mate = null;
  w.payDriver = null;
}
// the teammate's payroll line (runPayroll): their mood shows in their form
function payMate(w) {
  const m = mateOf(w); if (!m || !m.wage) { if (m) m.morale = clamp(m.morale + 1, 0, 100); return; }
  const p = w.people[m.pid], t = traitsOf(w, p), wage = m.wage;
  const paid = m.pay === 'full' ? wage : m.pay === 'half' ? Math.round(wage / 2) : 0;
  if (paid) pay(w, -paid, `Payroll: ${p.first} ${p.last} (driver)${paid < wage ? ', part' : ''}`);
  m.owed += wage - paid;
  m.morale = clamp(m.morale + (paid === wage ? 3 : (t.includes('loyal') ? -5 : -14) * (paid ? 0.6 : 1)) + (trustOf(w) - 50) / 25, 0, 100);
  if (paid < wage) w.drep = clamp(drepOf(w) - 1.5, 0, 100);
  p.form = (p.form || 0) + (m.morale - 60) / 40;
  if (t.includes('digger') && m.morale < 35 && !m.moaned) { m.moaned = true; news(w, `${p.last.toUpperCase()} UNHAPPY AT ${w.teams[w.player.team].name.toUpperCase()}`, `"I'm not being paid and I'm not being listened to," ${nameOf(p)} tells the Wire.`); }
}

// ---------------- grudges: what drivers remember about you ----------------
// Dirty moves the stewards missed (forcing off, bump and runs, brake tests: race.js) and blamed contact add to a
// driver's grudge against you; it fades a little every season. Holding one, they race harder, and they tell people.
export const DIRTY = { forcedoff: ['forced off the track', 1.5], bumprun: ['bump and run', 1.2], braketest: ['brake test', 1] };
export const drepOf = (w) => (w.drep ??= 50); // (your reputation with drivers, 0-100)
export const grudgeOf = (w, pid) => (w.h2h[pid] && w.h2h[pid].grudge) || 0;
export const ageOf = (w, p) => w.year - p.born;
export const nameOf = (p) => p ? `${p.first} ${p.last}` : '';
export const shortName = (p) => p ? `${p.first[0]}. ${p.last}`.toUpperCase() : '';

// ---------------- new world ----------------
// opts: { name, number, len, difficulty, laps, dist, weekend, pracLen, qualiLen, pool, seed, teamName, colors: [main, accent] }
export function newWorld(opts, trackPool) {
  const w = { v: 1, kind: 'world', rs: (opts.seed || Date.now()) % 2147483646 + 1, nextId: 1, year: START_YEAR - PRE_YEARS, round: 0, over: false,
    opts: { len: opts.len || 6, difficulty: opts.difficulty || 'medium', laps: opts.laps || 5, dist: opts.dist || null, weekend: opts.weekend || 'quali', pracLen: opts.pracLen || 1200, qualiLen: opts.qualiLen || 600, pool: opts.pool || 'presets' },
    people: {}, teams: {}, series: {}, news: [], msgs: [], mail: [], ledger: [], h2h: {}, seasons: [], streetPay: true,
    player: { name: (opts.name || 'Driver').trim(), number: opts.number || 7, series: opts.start || START_SERIES, team: 'T0', starts: 0, wins: 0, pods: 0, titles: 0, hist: [], offer: null } };
  w.start = w.player.series;
  w.streetCars = opts.streetCars || []; // (the street-class cars, for the classifieds: [{ key, name, value }])
  // teams: yours in the series you start in, the rest across the ladder (six a series)
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
  w.teams.T0 = { id: 'T0', name: opts.teamName || 'Your Team', main: opts.colors?.[0] ?? 0xc8141c, accent: opts.colors?.[1] ?? 0xf2f2f2, series: null, car: seriesById(START_SERIES).base - 4, mine: true, drivers: ['P'] };
  // drivers: two per team
  for (const s of SERIES) for (const tid of w.series[s.id].teams) {
    const t = w.teams[tid];
    for (let seat = 0; seat < SEATS; seat++) {
      const [a0, as] = s.ages || [21, 13], age = r0(a0 + rng(w) * as);
      const p = makePerson(w, { age, series: s.id, lvl: s.base + gauss(w) * s.spread * 0.4 });
      p.team = tid; t.drivers.push(p.id);
    }
  }
  // a few free agents waiting for a seat
  for (let i = 0; i < 6; i++) makePerson(w, { age: r0(17 + rng(w) * 4), series: null, lvl: 42 + gauss(w) * 6 });
  newCalendars(w, trackPool);
  prehistory(w, trackPool);
  startMoney(w); // (the season's welcome waits until the team's set up: setupFinish)
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
  topUpFreeAgents(w);
  // the old team folds: one of its drivers stays on (the seat comes with the entry), the other goes looking
  const S = w.series[startOf(w)], old = w.teams[S.teams[S.teams.length - 1]], mine = w.teams.T0;
  const tst = w.seasons.at(-1)?.teamChamps;
  S.teams = S.teams.map(t => t === old.id ? 'T0' : t); mine.series = startOf(w);
  const [stay, go] = old.drivers.slice().sort((a, b) => ageOf(w, w.people[a]) - ageOf(w, w.people[b])); // (the younger one stays)
  if (go && w.people[go]) w.people[go].team = null;
  if (stay && w.people[stay]) { w.people[stay].team = 'T0'; mine.drivers.push(stay); }
  old.drivers = []; old.series = null; old.folded = w.year - 1;
  w.pre = false; w.prev = old.id; // (whose entry you bought)
  news(w, `${old.name.toUpperCase()} CLOSES ITS DOORS`, `After ${PRE_YEARS}${tst ? '' : ''} seasons in the ${seriesById(startOf(w)).name}, ${old.name} has stopped racing. The team's entry has been sold to a new owner.`);
}

// race distance, F1's rule: the fewest laps that cover it (two at least). km: a lap's length
export const lapsForDistance = (dist, km) => Math.max(2, Math.ceil(dist / km - 0.05));
// a race's laps: from the career's race distance (a point-to-point circuit is one run); careers from before it have a
// set number of laps
export const raceLaps = (w, km, open) => open ? 1 : w.opts.dist && km > 0 ? lapsForDistance(w.opts.dist, km) : w.opts.laps;
// a circuit's lap in km, near enough (its control points joined up: the race itself measures the real line), for the
// rounds you don't drive; 0: point to point
const lapKmOf = (t) => { const p = t.points || []; if (t.open || p.length < 2) return 0; let L = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; L += Math.hypot(b.x - a.x, b.z - a.z); } return +(L / 1000).toFixed(2); };

// a round's forecast: the chance the weather changes during the race, which way, and about when (a share of the race
// distance; a shower stops again). Made the first time anyone looks; whether it comes true is the race's roll (raceWx)
export function forecastOf(w, R) {
  if (!R) return null;
  if (R.fc === undefined) { const k = { clear: 0.12, overcast: 0.55, rain: 0.4 }[R.weather] || 0;
    R.fc = k ? { to: R.weather === 'rain' ? 'dry' : 'rain', chance: Math.min(0.9, Math.round(k * (0.6 + rng(w) * 0.8) * 10) / 10), at: +(0.2 + rng(w) * 0.5).toFixed(2), shower: R.weather !== 'rain' && rng(w) < 0.4 } : null; }
  return R.fc;
}
// the forecast, as the weather app says it: '40% chance of rain from mid-race'
export function forecastText(f) {
  if (!f || !f.chance) return 'No change expected';
  const when = f.at < 0.35 ? 'early on' : f.at > 0.6 ? 'late on' : 'mid-race';
  return f.to === 'rain' ? `${Math.round(f.chance * 100)}% chance of ${f.shower ? 'a shower' : 'rain'} ${when}` : `${Math.round(f.chance * 100)}% chance it dries out ${when}`;
}
// the race's weather: does the forecast come true, and exactly when ({ to, at, until } for race.js, or null)
export function raceWx(w, R) {
  const f = forecastOf(w, R); if (!f || Math.random() >= f.chance) return null;
  const at = Math.max(0.1, Math.min(0.85, f.at + (Math.random() - 0.5) * 0.2));
  return { to: f.to, at, until: f.shower ? Math.min(0.95, at + 0.18 + Math.random() * 0.15) : null };
}
// a season's calendar per series: circuits drawn from the pool, conditions rolled per round
export function newCalendars(w, trackPool) {
  const names = trackPool.map(t => t.name);
  w.lapKm = Object.fromEntries(trackPool.filter(t => t.points).map(t => [t.name, lapKmOf(t)]));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng(w) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (const s of SERIES) {
    if (!w.series[s.id]) continue;   // (a series this world hasn't got yet: addMissingSeries)
    // (its own circuits, those the career has; the rest of the pool fills a short list; then the season's order)
    const own = s.tracks ? names.filter(n => s.tracks.includes(n)) : names;
    const order = shuffle([...shuffle(own.slice()), ...shuffle(names.filter(n => !own.includes(n)))].slice(0, Math.max(own.length, w.opts.len)));
    const cal = [];
    for (let r = 0; r < w.opts.len; r++) {
      const name = order[r % order.length], tr = trackPool.find(t => t.name === name);
      const x = rng(w), time = x < 0.55 ? (tr?.env?.time || 'day') : x < 0.8 ? 'dusk' : 'night';
      const y = rng(w), weather = y < 0.7 ? 'clear' : y < 0.85 ? 'overcast' : y < 0.95 ? 'rain' : 'fog';
      cal.push({ name, time, weather, theme: tr?.env?.theme || 'grass', surface: tr?.env?.surface === 'dirt' ? 'dirt' : 'tarmac' });
    }
    w.series[s.id].cal = cal;
    w.series[s.id].results = [];
    enduranceRound(w, s, cal);
  }
  gpRound(w, names);
}
// ---------------- endurance ----------------
// GT2 and GT1 (the sports car path, tier 3 up) run one 6-hour race a season: a timed race, your teammate sharing your
// car (race.js crew), the team's second car with two hired drivers. On the circuit with an endurance history if the
// calendar has one, else the second last round (the last is the title decider). Its race clock runs the season's
// endurance length (w.opts.endur: real minutes for 24 hours; a 6 Hours is a quarter of it)
export const ENDURANCE_HOURS = 6, ENDURANCE_START = 14.5; // (a 2.30 pm start: it finishes under the lights)
const ENDURANCE_TRACKS = ['Watkins Glen', 'Road Atlanta', 'Sebring International Raceway', 'Spa-Francorchamps', 'Suzuka', 'Laguna Seca'];
function enduranceRound(w, s, cal) {
  if (s.path !== 'sportscar' || s.tier < 3 || cal.length < 3) return;
  let k = -1;
  for (const n of ENDURANCE_TRACKS) { k = cal.findIndex((c, i) => c.name === n && i < cal.length - 1); if (k >= 0) break; }
  if (k < 0) k = cal.length - 2;
  cal[k].endur = { hours: ENDURANCE_HOURS }; cal[k].time = 'day'; // (it starts in the afternoon whatever: the clock takes it into the night)
}
export const isEndurance = (R) => !!(R && R.endur);
// the other class in a sports car endurance race (GT2's 6 Hours runs alongside GT1, GT1's alongside GT2): its series
export function enduranceOther(w, sid = w.player.series) {
  const s = seriesById(sid); if (!s || s.path !== 'sportscar' || s.tier < 3) return null;
  return SERIES.find(o => o.path === 'sportscar' && o.tier >= 3 && o.id !== sid && Math.abs(o.tier - s.tier) === 1) || null;
}
// its entries for the race, one car a team (its two drivers sharing, the first named): slots from slot0, as raceEntries
export function classEntries(w, sid, slot0) {
  const S = w.series[sid], s = seriesById(sid), rain = w.series[w.player.series].cal[w.round]?.weather === 'rain', med = seriesMedian(w, sid);
  const entries = {}, teamPace = {}, roster = [];
  let slot = slot0;
  for (const tid of S.teams) {
    const t = w.teams[tid], pid = t.drivers.find(d => d !== 'P' && w.people[d]); if (!pid) continue;
    const p = w.people[pid], k = raceKnobs(w, pid, rain, s.cls, med);
    entries[slot] = { pid, tid, other: sid, teamNo: 100 + S.teams.indexOf(tid), name: shortName(p).replace(/^\w\. /, ''), team: { name: t.name, main: t.main, accent: t.accent, helmet: t.accent, driver: shortName(p) }, aggr: k.aggr, craft: k.craft, mistakes: k.mistakes, gap: k.gap, skill: k.skill, tc: k.tc };
    teamPace[slot] = k.pace; roster.push(slot++);
  }
  return { entries, teamPace, roster };
}
export const enduranceName = (R) => `${R.name} ${R.endur.hours} Hours`;
// the race's real length (s) and its clock (race seconds a second)
export function enduranceClock(w, R) {
  const per24 = (w.opts.endur || 90) * 60, dur = Math.round(per24 * R.endur.hours / 24);
  return { duration: dur, clockK: R.endur.hours * 3600 / dur, startHour: ENDURANCE_START };
}
// the top series ends every year with the San Velocita Grand Prix, always on the same circuit (picked once)
function gpRound(w, names) {
  const cal = w.series[gpSeries().id]?.cal; if (!cal || !cal.length) return;
  if (!w.gpTrack || (names && !names.includes(w.gpTrack))) w.gpTrack = cal[cal.length - 1].name;
  const last = cal[cal.length - 1], dup = cal.findIndex((c, i) => i < cal.length - 1 && c.name === w.gpTrack);
  if (dup >= 0) cal[dup].name = last.name; // (it's only raced once a year)
  last.name = w.gpTrack; last.gp = true;
}
export const isGP = (R) => !!(R && R.gp);
// a series' recommended calendar (its own circuits, in a season's order, the finale last), of len rounds from the
// circuits there are (names): the first len - 1 and the finale, or round again if it's longer than the list
export function recommendedCal(sid, names, len) {
  const own = (seriesById(sid)?.tracks || []).filter(n => names.includes(n)), list = own.length ? own : names.slice();
  if (!list.length) return [];
  if (len <= list.length) return [...list.slice(0, len - 1), list[list.length - 1]];
  return Array.from({ length: len }, (_, r) => r === len - 1 ? list[list.length - 1] : list[r % (list.length - 1 || 1)]);
}
// the season's length and your series' circuits, set in the season setup (before its first race): every series'
// calendar drawn again at that length (pool: the career's circuits), yours the names given in order (all: every
// circuit, to look them up); the 6 Hours and the Grand Prix put back on
export function setSeasonCal(w, pool, all, len, names) {
  const sid = w.player.series; if (!sid || w.round !== 0 || w.series[sid].results.length) return false;
  if (SEASON_LENGTHS.includes(len)) w.opts.len = len;
  newCalendars(w, pool);
  if (names && names.length) {
    const s = seriesById(sid), cal = [];
    for (let r = 0; r < w.opts.len; r++) {
      const name = names[r % names.length], tr = all.find(t => t.name === name) || pool.find(t => t.name === name);
      const x = rng(w), time = x < 0.55 ? (tr?.env?.time || 'day') : x < 0.8 ? 'dusk' : 'night';
      const y = rng(w), weather = y < 0.7 ? 'clear' : y < 0.85 ? 'overcast' : y < 0.95 ? 'rain' : 'fog';
      cal.push({ name, time, weather, theme: tr?.env?.theme || 'grass', surface: tr?.env?.surface === 'dirt' ? 'dirt' : 'tarmac' });
      if (tr && tr.points) (w.lapKm ??= {})[name] = lapKmOf(tr);
    }
    w.series[sid].cal = cal; enduranceRound(w, s, cal);
    if (s.gp) { w.gpTrack = names.includes(w.gpTrack) ? w.gpTrack : null; gpRound(w, names); }
  }
  return true;
}

// ---------------- ratings: what makes a driver fast in a race ----------------
export function rating(w, pid) {
  if (pid === 'P') return null;
  const p = w.people[pid], t = w.teams[p.team];
  return p.pace * 0.6 + (t ? carValue(w, t, pid) : 50) * 0.25 + 15 + (p.form || 0) + (mateMentored(w, pid) ? 1 : 0);
}
// does this driver have a mentor in the other seat?
function mateMentored(w, pid) {
  const p = w.people[pid], t = p && w.teams[p.team]; if (!t) return false;
  return t.drivers.some(d => d !== pid && d !== 'P' && w.people[d]?.traits?.includes('mentor'));
}
// race.js knobs for an AI driver: their gap to a clean lap (%, from their rating), technique (aiskill.js: their flaws,
// which cost part of it; race.js measures how much and sets the pace to make up the rest), a pace multiplier (the wet), aggression, racecraft
// (0-1: how cleanly they defend), mistake rate. Their pace rating sets
// how impatient they are on the power (a hothead more so), consistency how much their line and braking points wander
// (a metronome's half as much). cls: the series' class (each flaw costs a different amount in each).
// the gap a rating stands for in the race (% of a clean lap at the difficulty): RATING_K a point, against the series'
// typical driver, whose gap is the series' level (SERIES_GAP: a little quicker each step up the ladder). The career's
// simulated races read a rating point as the same lap time, so a real race and a simulated one agree on who's quick.
// (It used aiskill's ratingGap, a pace multiplier read off a curve that flattens near the top: it squeezed a whole
// field, driving and car, into under 1%, which the car models' differences then swamped)
export const RATING_K = 0.11;
const SERIES_GAP = { club: 1.7, street: 1.5, gt2: 1.3, gt: 1.1, groupc: 0.9, formula: 0.7 };
function seriesMedian(w, sid) {
  const rs = w.series[sid].teams.flatMap(t => w.teams[t].drivers).filter(d => d !== 'P' && w.people[d]).map(d => rating(w, d)).sort((a, b) => a - b);
  return rs.length ? rs[Math.floor(rs.length / 2)] : seriesById(sid).base;
}
export const gapOf = (w, r, sid, med = seriesMedian(w, sid)) => Math.max(0, (SERIES_GAP[tierOf(sid)] ?? 1.5) + (med - r) * RATING_K);
export function raceKnobs(w, pid, rain, cls = 'gt1', med = null) {
  const p = w.people[pid], r = rating(w, pid), tr = traitsOf(w, p);
  const f = clamp((88 - p.pace) / 40, 0, 1) + (tr.includes('hothead') ? 0.25 : 0);
  const g = clamp((85 - p.cons) / 45, 0, 1) * (tr.includes('metronome') ? 0.5 : 1);
  const k = knobsFor(cls, gapOf(w, r, w.player.series, med ?? undefined), f, g);
  // (on top: the wet, and a mentor in the other seat, as a pace multiplier)
  const pace = (rain ? 1 + (p.wet - 50) * 0.0004 : 1) * (mateMentored(w, pid) ? 1.004 : 1);
  // (the dice-roll mistakes are a little rarer than before: an inconsistent driver's own technique now makes some)
  return { pace: Math.min(1.01, pace), gap: k.gap, skill: k.skill, tc: k.tc,
    aggr: clamp(0.15 + p.aggr / 100 * 0.85 + grudgeOf(w, pid) * 0.06, 0.1, 1), craft: clamp(((p.craft ?? 60) - 20) / 75, 0, 1), mistakes: clamp(1.5 - p.cons / 100 * 1.1, 0.35, 1.3) };
}

// who's got a story with you, for the race (your engineer brings it up when they're close: race.js storyRadio): a rival
// who keeps finishing just ahead, the one who put you out, a grudge. { pid: { kind, line (the engineer's), hard (they
// race you harder) } }; your teammate: owe (last race went badly between you)
function raceStories(w) {
  const out = {}, S = w.series[w.player.series];
  for (const x of storiesOf(w).filter(x => x.open && !x.paddock && x.pid && w.people[x.pid])) {
    const p = w.people[x.pid];
    if (x.kind === 'nemesis') { const n = S.results.slice(-4).filter(r => { const a = r.rows.find(y => y.pid === 'P'), b = r.rows.find(y => y.pid === x.pid); return a && b && !b.dnf && (a.dnf || b.pos < a.pos); }).length;
      out[x.pid] = { kind: 'nemesis', line: `That's ${p.last}. Finished just ahead of you ${n} of the last ${Math.min(4, S.results.length)}.`, hard: true }; }
    else if (x.kind === 'revenge') out[x.pid] = { kind: 'revenge', line: `${p.last}. The one who ${x.did || 'hit you'} at ${x.beats[0].track}.`, hard: true };
  }
  for (const pid of S.teams.flatMap(t => w.teams[t].drivers)) { if (out[pid] || pid === 'P' || !w.people[pid]) continue; const g = grudgeOf(w, pid);
    if (g >= 2) out[pid] = { kind: 'grudge', line: `${w.people[pid].last}. ${g >= 3 ? 'Still' : 'Probably still'} angry with you about last time.`, hard: g >= 3 }; }
  return out;
}
// the same, as a list (the Race Weekend app's Rivals: who's in this race with a score to settle)
export function raceStoryList(w) { const S = w.series[w.player.series], here = new Set(S.teams.flatMap(t => w.teams[t].drivers)); return Object.entries(raceStories(w)).filter(([pid]) => here.has(pid)).map(([pid, x]) => ({ pid, ...x })); }
// the entry list of your series this round: 11 AI drivers in race slots 1..11 (slot 0 is yours), teammates side by side
export function raceEntries(w) {
  const S = w.series[w.player.series], round = S.cal[w.round], rain = round.weather === 'rain', cls = seriesById(w.player.series).cls;
  const entries = {}, teamPace = {}, roster = [], stories = raceStories(w), m = mateOf(w), med = seriesMedian(w, w.player.series);
  let slot = 1;
  for (const tid of S.teams) {
    const t = w.teams[tid];
    for (const pid of t.drivers) {
      if (pid === 'P') continue;
      const p = w.people[pid], k = raceKnobs(w, pid, rain, cls, med);
      entries[slot] = { pid, tid, ...(t.mine ? { mate: true, trust: trustOf(w), owe: m && m.owe === `${w.year}:${w.round - 1}` ? m.oweWhy : null } : {}), ...(stories[pid] ? { story: stories[pid] } : {}), teamNo: S.teams.indexOf(tid), name: shortName(p).replace(/^\w\. /, ''), team: { name: t.name, main: t.main, accent: t.accent, helmet: t.accent, driver: shortName(p) }, aggr: k.aggr, craft: k.craft, mistakes: k.mistakes, gap: k.gap, skill: k.skill, tc: k.tc };
      teamPace[slot] = k.pace;
      roster.push(slot++);
    }
  }
  return { entries, teamPace, roster };
}

// the model a team races (keys: the class's race-ready cars). An AI team buys what its owner can afford, the richer
// the pricier (the balance of performance keeps the gap small), and keeps it while it's in that series; yours, and
// car 2 beside it, is your car
export function teamChassis(w, tid, keys) {
  const t = w.teams[tid];
  if (t.mine) return w.car && keys.includes(w.car.chassis) ? w.car.chassis : keys[0];
  if (t.chassis && keys.includes(t.chassis)) return t.chassis;
  aiInit(w, t);
  const S = seriesById(t.series) || seriesById(START_SERIES);
  const price = (k) => S.car === 'classifieds' ? (w.streetCars || []).find(c => c.key === k)?.value ?? 0 : customerCars(w, S).find(c => c.key === k)?.price ?? 0;
  const ranked = keys.slice().sort((a, b) => price(a) - price(b));
  const f = clamp((t.wealth - 0.4) / 1.3 + gauss(w) * 0.15, 0, 0.999);
  return t.chassis = ranked[Math.floor(f * ranked.length)];
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
  aiRound(w, sid, rows);
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
    // you (a simulated round): as good as the driver at w.simSkill down the field (0 = the best, default 0.4), give
    // or take what your car's condition and upgrades are worth
    if (pid === 'P') {
      // (the driver at simSkill down the field in a typical car, give or take what yours is worth against one)
      // (as in a real race: your driving, in your car, against their driving in theirs. The driving is the pace of the
      // driver at simSkill down the field; the car is yours, so a typical team's car being quicker shows)
      const ps = pids.filter(x => x !== 'P').map(x => w.people[x].pace).sort((a, b) => b - a);
      r = ps[Math.min(ps.length - 1, Math.floor(ps.length * (w.simSkill ?? 0.4)))] * 0.6 + carValue(w, myTeam(w)) * 0.25 + 15; p = { cons: 70, wet: 50, aggr: 50, craft: 60 };
    }
    else r = rating(w, pid);
    let score = r + gauss(w) * (2.6 + (100 - p.cons) * 0.045) + (p.craft - 50) * 0.04;
    if (rain) score += (p.wet - 50) * 0.12 + gauss(w) * 2;
    const dnfP = (0.025 + (100 - p.cons) * 0.0005 + p.aggr * 0.00025 + (rain ? 0.03 : 0)) * (pid === teammateOf(w) && sid === w.player.series ? car2Mods(w).fail : 1);
    return { pid, score, dnf: rng(w) < dnfP, aggr: p.aggr };
  }).sort((a, b) => (a.dnf - b.dnf) || b.score - a.score);
  // contact between cars fighting for position
  for (let i = 0; i < field.length - 1; i++) {
    const a = field[i], b = field[i + 1];
    if (a.dnf || b.dnf || Math.abs(a.score - b.score) > 2.5) continue;
    // (two who've got history race each other harder)
    // (and you and a teammate who doesn't trust you fight harder than teammates should)
    const usTwo = (a.pid === 'P' || b.pid === 'P') && [a.pid, b.pid].includes(teammateOf(w)), tk = usTwo ? (trustOf(w) < 30 ? 2 : trustOf(w) >= 60 ? 0.4 : 1) : 1;
    if (rng(w) < 0.035 * (a.aggr + b.aggr) / 100 * (1 + Math.min(1.5, feudG(w, a.pid, b.pid) * 0.5)) * tk) {
      const blameB = rng(w) < b.aggr / (a.aggr + b.aggr);
      logLedger(w, { s: sid, type: 'contact', a: blameB ? b.pid : a.pid, b: blameB ? a.pid : b.pid, blame: true, sim: true });
      if (rng(w) < 0.35) { (blameB ? a : b).dnf = true; }
    }
  }
  field.sort((a, b) => (a.dnf - b.dnf) || b.score - a.score);
  const flPool = field.filter(f => !f.dnf).slice(0, 6), fl = flPool.length ? flPool[Math.floor(rng(w) * flPool.length)].pid : null;
  return field.map((f, k) => ({ pid: f.pid, pos: k + 1, dnf: f.dnf, fl: f.pid === fl }));
}

const feudKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
function feudOf(w, a, b) { const F = (w.feuds ??= {}), k = feudKey(a, b); return F[k] || (F[k] = { n: 0, grudge: 0 }); }
const feudG = (w, a, b) => (w.feuds && w.feuds[feudKey(a, b)]?.grudge) || 0;
function logLedger(w, e) {
  w.ledger.push({ y: w.year, r: w.round, ...e });
  if (w.ledger.length > 3000) w.ledger.splice(0, w.ledger.length - 3000);
  // (between two other drivers: their own grudge, kept by the pair)
  if (e.type === 'contact' && e.a !== 'P' && e.b !== 'P' && w.people[e.a] && w.people[e.b]) {
    const f = feudOf(w, e.a, e.b); if (f.y !== w.year) { f.y = w.year; f.n = 0; }
    f.n++; f.grudge = +((f.grudge || 0) + (e.blame ? 0.8 : 0.4)).toFixed(2); f.last = { y: w.year, r: w.round, a: e.a, b: e.b, s: e.s };
  }
  // your head-to-head record lives with each driver
  if (e.a === 'P' || e.b === 'P') {
    const other = e.a === 'P' ? e.b : e.a, h = h2hOf(w, other);
    if (e.type === 'contact') { h.contacts++; if (e.blame) { if (e.a === 'P') h.youHit++; else h.hitYou++; } }
    if (e.type === 'pass') { if (e.a === 'P') h.youPassed++; else h.passedYou++; }
    if (DIRTY[e.type] && e.a === 'P') { h.dirty = (h.dirty || 0) + 1; h.grudge = (h.grudge || 0) + DIRTY[e.type][1]; w.drep = clamp(drepOf(w) - 3, 0, 100); }
    if (e.type === 'contact' && e.blame && e.a === 'P') h.grudge = (h.grudge || 0) + 0.6;
  }
}
// one text a round from anyone (your teammate, a driver you tangled with): the first thing they'd say is the one
// they send. true: pid hasn't texted this round, and now has
function roundOnce(w, pid) {
  const k = `${w.year}:${w.round}`; if (!w._once || w._once.k !== k) w._once = { k, ids: [] };
  if (w._once.ids.includes(pid)) return false; w._once.ids.push(pid); return true;
}
// after your race: the people you wronged say something (one text a round, the worst)
function grudgeTexts(w, log) {
  const mine = log.filter(e => DIRTY[e.type] && e.a === 'P' && w.people[e.b]);
  if (!mine.length) return;
  const e = mine.sort((a, b) => DIRTY[b.type][1] - DIRTY[a.type][1])[0], p = w.people[e.b], h = h2hOf(w, e.b), track = w.series[w.player.series].cal[w.round]?.name || '';
  const lines = {
    forcedoff: [`You put me on the grass at ${track}. The stewards missed it. I didn't.`, `Nice move at ${track}. Pushing me off the road. I'll remember that.`],
    bumprun: [`You punted me out of the way at ${track}. That's how you pass now?`, `Lift off next time. I was there first.`],
    braketest: [`Brake testing me? Really? Grow up.`, `You stood on the brakes in front of me on a straight. Try that again.`],
  }[e.type];
  if (roundOnce(w, e.b)) text(w, p.first, h.grudge >= 3 ? `${pickLine(w, lines)} And it's not the first time.` : pickLine(w, lines));
  if (h.grudge >= 4 && !h.went) { h.went = true; news(w, `${p.last.toUpperCase()} HITS OUT AT ${w.player.name.split(' ').pop().toUpperCase()}`, `${nameOf(p)} says ${w.player.name} "races dirty and gets away with it".`); w.drep = clamp(drepOf(w) - 4, 0, 100); }
}
// your teammate, after a race: the team's calls on the radio (who stopped first, who let who by), and hitting them,
// the quickest way to lose them (the dirty stuff is in grudgeTexts). And
// what trust does off the track: one who trusts you passes on what they've found for the next race; one who doesn't
// tells the Wire how it is (once a season)
function mateRace(w, log, use = null) {
  const m = mateOf(w); if (!m || w.pre || m.human) return;
  if (use && use.teamTrust) m.trust = clamp(trustOf(w) + use.teamTrust, 0, 100); // (the team's calls in the race: race.js)
  const p = w.people[m.pid], us = (e) => e.a === 'P' && e.b === m.pid || e.a === m.pid && e.b === 'P';
  const hit = log.find(e => e.a === 'P' && e.b === m.pid && (e.type === 'contact' && e.blame || DIRTY[e.type])), touch = log.find(e => us(e) && e.type === 'contact' && !e.blame);
  trustOf(w);
  const bad = hit || (use && use.teamTrust <= -4);
  if (bad) { m.owe = `${w.year}:${w.round}`; m.oweWhy = hit ? 'hit' : 'orders'; }
  if (hit) { m.trust = clamp(m.trust - 12, 0, 100); if (!DIRTY[hit.type] && roundOnce(w, m.pid)) text(w, p.first, pickLine(w, [`You hit me. Your own car. Both of them, technically.`, `Team meeting? Or do I just tell the Wire.`, `I'll fix the dent myself. Don't worry about it.`])); }
  else if (touch) m.trust = clamp(m.trust - 3, 0, 100);
  const t = m.trust, next = w.series[w.player.series].cal[w.round + 1];
  if (t >= 70 && next && rng(w) < 0.3 && roundOnce(w, m.pid)) { m.tipFor = `${w.year}:${w.round + 1}`; text(w, p.first, pickLine(w, [`Found something for ${next.name}. Softer rear bar. Trust me.`, `Looked at my data from ${next.name}. Try a click more rear wing. You're welcome.`, `${next.name}: brake earlier than you think into the last corner, carry more out. Worked for me.`])); }
  if (t < 25 && m.leaked !== w.year && rng(w) < 0.5) { m.leaked = w.year; w.drep = clamp(drepOf(w) - 2, 0, 100);
    news(w, `${p.last.toUpperCase()}: "I DRIVE THE OTHER CAR"`, `${nameOf(p)} has spoken out about life as ${w.player.name}'s teammate. "The new parts go on one car. Guess which," ${p.last} told the Wire. "I'm not saying I'm number two. The car is."`); }
}
// what your teammate wants to stay (a wage a round; null: they won't): trust moves it
export function mateAsk(w) { const m = mateOf(w); if (!m) return null; const t = trustOf(w), a = askOf(w, w.people[m.pid]).wage; return t < 15 ? null : Math.round(a * (t < 35 ? 1.25 : t >= 70 ? 0.9 : 1) / 50) * 50; }
export function h2hOf(w, pid) { return w.h2h[pid] || (w.h2h[pid] = { races: 0, ahead: 0, behind: 0, contacts: 0, youHit: 0, hitYou: 0, youPassed: 0, passedYou: 0 }); }

// ---------------- your racing license ----------------
// The San Velocita Motorsport Association's competition license: Novice, Regional, National. Clean races move you up
// (a race with no incidents of yours: a stamp on the card; a messy one takes a stamp back). A series asks for a grade
// (SERIES[].lic): the Street Cup and up want National. It's a card you can see: it hangs beside the list, in the
// grade's colour, the stamps toward the next grade printed on it (pitgarage.js licenseCard). Careers that started in
// the Street Cup came with a National license.
export const LICENSES = [{ name: 'Novice', col: '#f2c21b', need: 3 }, { name: 'Regional', col: '#2a7fd0', need: 4 }, { name: 'National', col: '#c8141c', need: 0 }];
const LIC_INC = { contact: 4, forcedoff: 4, bumprun: 4, braketest: 4 }; // (incident points for what you did; being hit costs you nothing)
export function licOf(w) {
  if (!w.lic) w.lic = { g: startOf(w) === 'club' ? 0 : 2, c: 0, no: 40000 + hashOf(w.player.name + w.rs) % 59999, since: Math.max(w.year, START_YEAR) }; // (no draw from the world's dice)
  return w.lic;
}
export const licName = (g) => LICENSES[clamp(g, 0, LICENSES.length - 1)].name;
// the grade a series asks for, and whether you have it
export const licNeed = (sid) => seriesById(sid)?.lic || 0;
export const licOk = (w, sid) => licOf(w).g >= licNeed(sid);
// clean races still to go to a grade (this grade's stamps left, and every grade's between)
export function licLeft(w, g) { const L = licOf(w); let n = 0; for (let k = L.g; k < g; k++) n += LICENSES[k].need - (k === L.g ? L.c : 0); return n; }
// after your race: the incidents that were yours (at-fault contact, the dirty stuff, a disqualification)
function licRace(w, log, me) {
  if (w.pre || !me) return;
  const L = licOf(w), top = LICENSES.length - 1;
  const inc = log.reduce((a, e) => a + (e.a === 'P' && (e.type !== 'contact' || e.blame) ? LIC_INC[e.type] || 0 : 0), 0) + (me.dsq ? 8 : 0);
  L.last = inc;
  if (L.g >= top) return;
  if (inc === 0) L.c++; else if (inc > 4) L.c = Math.max(0, L.c - 1);
  if (L.c < LICENSES[L.g].need) return;
  L.g++; L.c = 0; L.up = w.year;
  const G = licName(L.g), next = SERIES.filter(x => x.lic === L.g).sort((a, b) => a.tier - b.tier)[0];
  mail(w, 'SVMA Licensing', 'licensing@svma.sv', `License upgrade: ${G}`,
    [`Dear ${w.player.name.split(' ')[0]},`, `Following a review of your recent race reports, the stewards have approved an upgrade of your competition license to ${G}.`,
     next ? `A ${G} license meets the entry requirements of the ${next.name}.` : `Congratulations.`,
     `Your new card will arrive in 6 to 8 weeks. In the meantime please print the temporary license attached to this email. We are unable to attach it to this email.`, `SVMA Licensing`]);
  if (L.g === top) keepClip(w, 'license', `${w.player.name.split(' ').pop()} earns National license`);
}

// ---------------- the SVMA pathway: the ladder, as a poster on your garage wall ----------------
// Every rung of the sports car path from the bottom, the Formula branch beside the top, what each asks (license,
// premises) and roughly what a season costs; where you are (a pin), where you've been (your finish there) and what's
// not running yet. pitgarage.js hangPoster draws it; the walk spot ('SVMA Pathway') zooms in, with ladderNext's lines.
const PLANNED = [{ id: 'shitbox', name: 'Shitbox League', tier: 0, path: 'sportscar' }];
export function ladderOf(w) {
  const L = licOf(w), here = w.player.series, hist = w.player.hist || [];
  const rung = (S, soon) => {
    const been = hist.filter(h => h.s === S.id).map(h => ({ y: h.y, pos: h.pos })), need = SERIES_NEEDS[S.id] || null;
    const cost = soon || !COSTS[S.id] ? 0 : Math.round(seasonBudget(w, S).run / 1000) * 1000;
    return { id: S.id, name: S.name, tier: S.tier, path: S.path, soon: !!soon, lic: soon ? null : licNeed(S.id), licName: soon ? null : licName(licNeed(S.id)), licCol: soon ? null : LICENSES[licNeed(S.id)].col,
      needs: need ? Object.entries(need).map(([k, n]) => needName(k, n)) : [], cost, you: S.id === here, been, licOk: soon ? false : licOk(w, S.id) };
  };
  const rungs = [...SERIES.map(S => rung(S, false)), ...PLANNED.filter(x => !seriesById(x.id)).map(x => rung(x, true))].sort((a, b) => a.tier - b.tier || (a.path === 'sportscar' ? -1 : 1));
  return { rungs, lic: { g: L.g, name: licName(L.g), col: LICENSES[L.g].col }, rule: 'Finish top 3, or your team top 2, with the license the series asks for: every series on the next rung offers you an entry.' };
}
// what the poster's walk spot says, in two lines: the next rung up and what it takes from here
export function ladderNext(w) {
  const sid = w.player.series, up = nextUp(sid), L = licOf(w);
  if (!up) return [`You're at the top of the ladder.`, `Stay there.`];
  const left = licLeft(w, licNeed(up.id));
  const lic = licOk(w, up.id) ? `Your ${licName(L.g)} license is enough.` : `It needs a ${licName(licNeed(up.id))} license (yours is ${licName(L.g)}): ${left} more clean race${left === 1 ? '' : 's'}.`;
  const miss = seriesMissing(myTeam(w), up.id).map(([k, n]) => needName(k, n));
  return [`Next rung: ${upNames(sid)}. Finish top 3, or your team top 2.`, `${lic}${miss.length ? ` Entrants need ${miss.join(' and ')}.` : ''}`];
}
// has the ladder changed since you last looked (a rung opened, the license went up, an offer's waiting): its key
export const ladderKey = (w) => `${licOf(w).g}|${w.player.series}|${w.player.offer && !w.player.offer.answer ? 1 : 0}`;

// ---------------- a round: your race, then everyone else's ----------------
// res: race.js results() rows (with pid: 'P' for you), log: race.js incident log ([{ type, a, b, blame }] by pid)
// use: what your weekend used (tyre sets, laps, damage), for the bill; story: race.js's record of how the race went
// (digested onto the round's result for the Wire: wpress.js digestRace)
export function recordPlayerRound(w, res, log = [], use = null, story = null) {
  const sid = w.player.series;
  // (a multiclass race: your class's cars, at their places in it)
  const mine = seriesById(sid).cls, multi = res.some(r => r.cls && r.cls !== mine);
  const rows = res.filter(r => !multi || r.cls === mine).map(r => ({ pid: r.isPlayer ? 'P' : r.pid, pos: multi ? r.clsPos : r.pos, dnf: !!(r.dnf || r.dsq), dsq: !!r.dsq, fl: false, best: r.best }));
  // fastest lap: the quickest best lap among the finishers
  let fl = null; for (const r of rows) if (!r.dnf && isFinite(r.best) && (!fl || r.best < fl.best)) fl = r;
  if (fl) fl.fl = true;
  const known = rows.filter(r => r.pid);
  // (an endurance race: your teammate drove your car with you, and takes its result; car two's hired drivers don't score)
  { const R = w.series[sid].cal[w.round], m = mateOf(w), me0 = known.find(r => r.pid === 'P');
    if (isEndurance(R) && m && me0 && !known.some(r => r.pid === m.pid)) known.push({ pid: m.pid, pos: me0.pos, dnf: me0.dnf, dsq: me0.dsq, fl: me0.fl, best: me0.best }); }
  const told = story && digestRace(story, res.filter(r => !multi || r.cls === mine).map(r => ({ pid: r.isPlayer ? 'P' : r.pid, grid: r.grid, time: r.dnf || r.dsq ? null : r.time, lap: r.lap })));
  scoreRound(w, sid, known, told ? { story: told } : {});
  for (const e of log) if (e.a && e.b) logLedger(w, { s: sid, ...e });
  grudgeTexts(w, log);
  mateRace(w, log, use);
  const me = known.find(r => r.pid === 'P');
  licRace(w, log, me);
  for (const r of known) if (r.pid !== 'P' && me) { const h = h2hOf(w, r.pid); h.races++; if (r.dnf && !me.dnf || (!me.dnf && me.pos < r.pos)) h.ahead++; else h.behind++; }
  const u = use || simUse(w), bill = w.money ? settleRound(w, u, me) : null;
  afterParts(w, u);
  // who reacts (character voices): Danny always; your teammate half the time; the rival owner now and then (with how
  // their cars did); your ex after a podium
  if (me && use) {
    const facts = raceFacts(w, me, use, log);
    react(w, 'danny', facts);
    if (rng(w) < 0.5 && !w.coop) react(w, 'mate', facts);
    if (w.rival && rng(w) < 0.35) { const theirs = w.series[sid].results.at(-1).rows.filter(r => teamOfPid(w, r.pid) === w.rival.tid); if (theirs.length) react(w, 'rival', `${facts} ${w.teams[w.rival.tid].name}'s cars finished ${theirs.map(r => r.dnf ? 'DNF' : ordinalOf(r.pos)).join(' and ')}.`); }
    if (!me.dnf && me.pos <= 3 && rng(w) < 0.4) react(w, 'ex', facts);
  }
  listRound(w, me, use);
  if (me && use && !w.pre) { penNoComment(w); w.pen = penOf(w, me, use, log); }   // (the media pen: a question about this race; last race's, unanswered, is no comment)
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
  listRound(w, me, null);
  return afterRound(w, me);
}
function afterRound(w, me) {
  const before = {};
  for (const s of SERIES) if (s.id !== w.player.series) { const rows = simRace(w, s.id); scoreRound(w, s.id, rows); }
  roundNews(w, me);
  ballastRound(w, me);
  settlePromises(w, me);
  w.round++;
  if (w.round >= w.opts.len) seasonEnd(w);
  return { me, over: w.round >= w.opts.len };
}

// after a round: the car wears (and whatever broke needs fixing), your engineer measures, new used parts appear
function afterParts(w, use) {
  if (w.founding && !w.founding.legacy) sponsorOffers(w);
  if (!w.car) return;
  crewWork(w);
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
      if (e.pid === 'P') { if (w.car) { entry.car = w.car.chassis; entry.carName = w.car.name; } w.player.hist.push(entry); summary.you = entry; if (k === 0) w.player.titles++; }   // (the car: the factory's Boulevard shows every one)
      else if (w.people[e.pid]) { w.people[e.pid].hist.push(entry); if (k === 0) w.people[e.pid].titles++; }
    });
  }
  w.seasons.push(summary);
  settlePromises(w, null, true);
  // the Wire's report card on what was said at the launch
  { const pr = promisesOf(w), k = pr.filter(p => p.done === 'kept').length, T = myTeam(w).name;
    const said = (p) => { const n = promiseNow(w, p); return n.who ? `${n.text} (${n.who})` : n.text; }, K = pr.filter(p => p.done === 'kept').map(said), B = pr.filter(p => p.done !== 'kept').map(said);
    if (pr.length) news(w, `REPORT CARD: ${T.toUpperCase()} KEPT ${k} OF ${pr.length}`, `What ${T} said it would do at the ${w.year} season launch, and what it did. ${K.length ? `Kept: ${K.join('; ')}.` : ''} ${B.length ? `Broken: ${B.join('; ')}.` : ''} ${k === pr.length ? 'All of it. The Wire is as surprised as you are.' : !k ? 'None of it. The Wire has the tape.' : 'The Wire will be bringing the rest up next year.'}`.replace(/\s+/g, ' ')); }
  // the prize funds, the drivers' and the teams', by championship position: one email from the series office
  const S0 = seriesById(w.player.series), fund = fundOf(w, w.player.series), me = summary.you;
  const tpos = teamStandings(w, w.player.series).findIndex(e => e.tid === w.player.team) + 1, tfund = teamFundOf(w, w.player.series);
  const dPay = w.money && me ? fund[me.pos - 1] || 0 : 0, tPay = w.money && tpos > 0 ? tfund[tpos - 1] || 0 : 0;
  if (dPay) {
    pay(w, dPay, `${S0.name} prize fund: P${me.pos} in the championship`);
    { const I = investorIn(w); if (I) pay(w, -Math.round(dPay * I.share / 10) * 10, `${I.name.join(' ')}: ${Math.round(I.share * 100)}% of the prize fund`); }
  }
  if (tPay) pay(w, tPay, `${S0.name} teams' prize fund: P${tpos}`);
  if (dPay || tPay) mail(w, `${S0.name} Office`, addrOf(S0, 'office'), `${w.year} prize funds`,
    [...(dPay ? [`Drivers' championship: P${me.pos}. Your share of the prize fund, ${money$(dPay)}.`] : []), ...(tPay ? [`Teams' championship: ${w.teams[w.player.team].name}, P${tpos}. The team's share, ${money$(tPay)}.`] : []),
     `${dPay && tPay ? 'Both have' : 'This has'} been paid into your account.`, `${S0.name} Office`]);
  // your options: move up if you finished in the top three, or your team in the top two (and there's a series above):
  // every series of the rung above, in one email from the SVMA: an entry from each you have the license for (you pick
  // one, or stay), and what's missing for the others
  const ups0 = seriesUp(w.player.series), ups = ups0.filter(u => w.pre || licOk(w, u.id)), shut = w.pre ? [] : ups0.filter(u => !licOk(w, u.id));
  const you = summary.you, earned = you && (you.pos <= 3 || (tpos > 0 && tpos <= 2));
  if (ups.length && earned) w.player.offer = { to: nextUp(w.player.series).id, opts: ups.map(u => u.id), answer: null };
  if (earned && (ups.length || shut.length) && !w.pre) {
    const why = you.pos <= 3 ? `P${you.pos} in the drivers' championship` : `P${tpos} in the teams' championship`;
    const offerLine = (up) => { const b = seasonBudget(w, up), need = SERIES_NEEDS[up.id];
      return `${up.name}: an entry is yours if you want it. A season costs about ${money$(b.run)} to run a car, plus the car${!b.lease ? '' : up.car === 'spec' ? ` (the series chassis, leased, from ${money$(b.lease)})` : ` (leased from ${money$(b.lease)}, or from ${money$(b.buy)} to buy)`}.${up.gents ? ' Most teams sell the second seat to a gentleman driver.' : ''} Mid-field prize money: about ${money$(b.prize)}.${need ? ` Entrants need ${Object.entries(need).map(([k, n]) => needName(k, n)).join(' and ')} before the season starts.` : ''}`; };
    mail(w, 'SVMA Competitions', 'competitions@svma.sv', ups.length ? `Your options for ${w.year + 1}` : `Your ${w.year + 1} entry`,
      [`Dear ${w.player.name.split(' ')[0]},`, `Your ${why} qualifies ${w.teams[w.player.team].name} for the next rung.`,
       ...ups.map(offerLine),
       ...shut.map(up => `${up.name}: entrants must hold a ${licName(licNeed(up.id))} license. Yours is ${licName(licOf(w).g)}, so we can't offer this one yet. Licenses are upgraded on the strength of clean races.`),
       ups.length ? (ups.length > 1 ? `An entry can only be held in one series. Please choose before the new season.` : `Please let us know before the new season.`) : `We look forward to hearing from you once your license has caught up with your results.`,
       `SVMA Competitions`],
      ups.length ? { offer: 'multi', choices: [...ups.map(u => [`move:${u.id}`, `Move up to the ${u.name}`]), ['stay', `Stay in the ${S0.name}`]] } : {});
  }
  // this year's ambition, the investor's target, and the list
  if (!w.pre && w.money) { ambitionEnd(w, summary); investorSeason(w, summary); worksSeason(w, summary); }
  if (!w.pre) listCheck(w, { season: summary });
  seasonEndNews(w, summary);
}

// answer a promotion offer: 'move' takes that series' entry (to: its id; careers from before several offers: the one
// offer); 'stay' turns it down, and you stay once every series on offer has had its answer (or you took another)
export function answerOffer(w, ans, to) {
  const off = w.player.offer; if (!off) return;
  if (String(ans).startsWith('move:')) { to = ans.slice(5); ans = 'move'; } // (the one email with every series: 'move:<id>')
  if (ans === 'stay' && to === 'multi') { off.answer = 'stay'; off.no = [...(off.opts || [off.to])]; return; }
  const id = typeof to === 'string' ? to : off.to, opts = off.opts || [off.to];
  if (ans === 'move') { off.to = id; off.answer = 'move'; off.no = []; return; }
  if (off.answer === 'move' && off.to !== id) return;
  off.no = [...new Set([...(off.no || []), id])];
  off.answer = opts.every(o => off.no.includes(o)) ? 'stay' : null;
}

// roll on to the next season: age everyone, retire, promote, sign rookies, new cars, new calendars
// your team into series `to`, in the place of its weakest team (ranked: its teams, best first), which drops to yours
function swapUp(w, to, ranked) {
  const from = w.player.series, mine = w.teams[w.player.team];
  ranked = (ranked || []).filter(t => w.series[to].teams.includes(t));
  const weakest = ranked.length ? ranked[ranked.length - 1] : w.series[to].teams.at(-1), swap = w.teams[weakest];
  w.series[to].teams = w.series[to].teams.map(t => t === weakest ? mine.id : t);
  w.series[from].teams = w.series[from].teams.map(t => t === mine.id ? weakest : t);
  swap.series = from; mine.series = to; w.player.series = to;
  for (const pid of swap.drivers) if (w.people[pid]) w.people[pid].series = from;
  // your teammate comes with you; the new series' level lifts your car a little
  for (const pid of mine.drivers) if (w.people[pid]) w.people[pid].series = to;
  devReset(swap);
}
// a save repair: the move up a season-end should have offered, made before the first round of the new season (the
// 2026-10-24 co-op double-scoring bug ended a season early). Where to get a car comes by email, as after a move.
export function repairMoveUp(w, to) {
  if (w.round !== 0 || w.over || !seriesById(to) || w.player.series === to) return false;
  const ranked = teamStandings(w, to).map(e => e.tid);
  swapUp(w, to, ranked.length ? ranked : w.series[to].teams.slice().sort((a, b) => (w.teams[b].bank || 0) - (w.teams[a].bank || 0)));
  w.player.offer = null; w.setup = null;
  keepClip(w, 'up', `${w.player.name.split(' ').pop()} moves up to the ${seriesById(to).name}`); w._mumClip = null;
  seasonBop(w);
  if (needsCar(w) && seriesById(to).car === 'classifieds') w.ads = makeAds(w);
  if (w.founding?.reg) w.setup = newSeasonSetup(w, true); else if (needsCar(w)) carsMail(w);
  return true;
}
export function nextSeason(w, trackPool) {
  const moves = [];
  // last season's team standings, before anyone changes seats (a driver's results stay with the team they drove for)
  const prevTeams = {}; for (const sr of SERIES) prevTeams[sr.id] = teamStandings(w, sr.id).map(e => e.tid).filter(t => w.teams[t]?.series === sr.id);
  const upTo = w.player.offer?.answer === 'move' ? seriesById(w.player.offer.to) : null, wizardTitle = !!(upTo && upTo.seats);
  for (const d of dealsOf(w).slice()) {
    if (wizardTitle && d.slot === 'title') continue; // (the season setup picks the title sponsor for the new series)
    const sp = sponsorById(d.sid), good = d.met >= d.misses && !(w.excluded && w.excluded[w.year]);
    if (good) mail(w, sp.name, sponsorAddr(sp.name), `${w.year + 1} season`, [`Thank you for a good season. We'd like to continue in ${w.year + 1} on the same terms.`, sp.name], { sponsorOffer: { sid: d.sid, slot: d.slot, fee: d.fee, bonus: d.bonus }, choices: [['yes', 'Renew'], ['no', 'Decline']] });
  }
  w.deals = [];
  { const m = w.mate, t = w.teams[w.player.team];
    if (m && m.until < w.year + 1 && t.drivers.includes(m.pid)) { const q = w.people[m.pid]; t.drivers = t.drivers.filter(d => d !== m.pid); q.team = null; w.mate = null; w.payDriver = null; text(w, q.first, `My contract's up. Thanks for the ride.`); } }
  for (const h of Object.values(w.h2h)) if (h.grudge) { h.grudge = +(h.grudge * 0.5).toFixed(2); if (h.grudge < 0.3) h.grudge = 0; h.went = false; }
  for (const [k, f] of Object.entries(w.feuds || {})) { f.grudge = +(f.grudge * 0.5).toFixed(2); if (f.grudge < 0.3) delete w.feuds[k]; }
  w.year++; w.round = 0; w.over = false;
  annuityDay(w);
  if (w.staff) w.jobs = makeJobs(w);
  if (w.payDriver && w.teams[w.player.team].drivers.includes(w.payDriver.pid)) { const p = w.people[w.payDriver.pid]; if (p) pay(w, w.payDriver.fee, `Seat fee for ${p.first} ${p.last}`); }
  // people: grow, peak, fade
  for (const p of Object.values(w.people)) {
    if (p.retired || p.human) continue;
    const age = ageOf(w, p);
    if (age < p.peakAge) p.pace += Math.max(0, (p.pot - p.pace) * (0.28 + rng(w) * 0.2)) + gauss(w) * 1.2;
    else if (age > p.peakAge + 2) p.pace -= (age - p.peakAge - 2) * (0.5 + rng(w) * 0.6) + Math.max(0, gauss(w));
    else p.pace += gauss(w) * 0.8;
    p.pace = clamp(p.pace, 20, 99);
    p.form = gauss(w) * 2.2; // (a good year or a bad one: confidence, luck, the car suiting them)
    p.cons = clamp(p.cons + (age < 30 ? 1.5 : 0.3) + gauss(w) * 1.2, 20, 97);
    // (old hands become mentors)
    if (age >= 30 && traitsOf(w, p).length < 2 && !p.traits.includes('mentor') && rng(w) < 0.12) p.traits.push('mentor');
    p.craft = clamp(p.craft + (age < 31 ? 1.2 : -0.3) + gauss(w), 20, 97);
  }
  // retirements: past their age, or out of a seat and going nowhere
  for (const p of Object.values(w.people)) {
    if (p.retired || p.human) continue;
    const age = ageOf(w, p);
    if (age >= p.retireAge || (age > 29 && !p.team && rng(w) < 0.5)) {
      p.retired = true; p.retiredYear = w.year - 1;
      if (p.team) { const t = w.teams[p.team]; t.drivers = t.drivers.filter(x => x !== p.id); p.team = null; }
      moves.push({ kind: 'retire', pid: p.id });
    }
  }
  // teams' cars: the AI teams' seasons (money, facilities, crews), and everyone's development fades
  aiSeason(w); devSeason(w); staffSeason(w);
  for (const s of SERIES) {
    void s; // (what each team's car is worth now comes from its development: aiSeason)
  }
  // driver market, top series first: the best of the series below take the seats; the slowest step down
  const prevStand = {}; for (const s of SERIES) prevStand[s.id] = standings(w, s.id).map(e => e.pid);
  for (const s of SERIES.slice().sort((a, b) => b.tier - a.tier)) {
    // (the rung below: the series on this path drops its slowest there; the best of every series on it can step up)
    const below = nextDown(s.id), belows = seriesDown(s.id).map(x => x.id);
    // drop the bottom two of this series (to the series below, if they're young enough to care)
    if (below) {
      const bottom = prevStand[s.id].filter(pid => pid !== 'P' && w.people[pid] && !w.people[pid].retired && w.people[pid].team && w.people[pid].team !== w.player.team && w.teams[w.people[pid].team].series === s.id).slice(-2);
      for (const pid of bottom) { const p = w.people[pid], t = w.teams[p.team]; t.drivers = t.drivers.filter(x => x !== pid); p.team = null; p.series = below.id; moves.push({ kind: 'down', pid, from: s.id, to: below.id }); }
    }
    // the market: the most attractive teams (a quick car, and money to pay a driver) choose first. Candidates: the
    // series below's best from last season, free agents, and drivers at less attractive teams in this series
    const attr = (t) => { if (!t.mine) aiInit(w, t); return carValue(w, t) + (t.mine ? 0 : (t.bank || 0) / (AI_OWNER[tierOf(s.id)] || 1) * 8); };
    const order = w.series[s.id].teams.map(tid => w.teams[tid]).sort((x, y) => (x.mine - y.mine) || attr(y) - attr(x));
    const avail = (t) => {
      const later = order.slice(order.indexOf(t) + 1).filter(o => !o.mine).map(o => o.id);
      const fromBelow = belows.flatMap(b => prevStand[b].filter(pid => pid !== 'P' && w.people[pid] && !w.people[pid].retired && w.people[pid].team && w.teams[w.people[pid].team]?.series === b && !w.teams[w.people[pid].team].mine).slice(0, 6));
      const free = Object.values(w.people).filter(p => !p.retired && !p.team && ageOf(w, p) < 40 && (p.series === s.id || p.series === null || belows.includes(p.series))).map(p => p.id);
      const poach = later.flatMap(tid => w.teams[tid].drivers);
      return [...new Set([...fromBelow, ...free, ...poach])].map(pid => w.people[pid]).filter(p => p && !p.retired && !traitsOf(w, p).includes('gentleman'));
    };
    const sign = (t, p) => {
      const from = p.team ? w.teams[p.team] : null;
      if (from) from.drivers = from.drivers.filter(x => x !== p.id);
      const wasSeries = from ? from.series : null;
      p.team = t.id; p.series = s.id; t.drivers.push(p.id);
      moves.push({ kind: wasSeries && seriesById(wasSeries).tier < s.tier ? 'up' : wasSeries ? 'move' : p.starts ? 'return' : 'rookie', pid: p.id, to: s.id, team: t.id });
    };
    // a team that can do better replaces its slowest driver (they go looking for a seat)
    for (const t of order) {
      if (t.mine) continue;
      const worst = t.drivers.map(d => w.people[d]).filter(Boolean).sort((x, y) => x.pace - y.pace)[0];
      const best = avail(t).sort((x, y) => y.pace - x.pace)[0];
      if (worst && best && best.pace > worst.pace + 6 && rng(w) < 0.7) {
        t.drivers = t.drivers.filter(x => x !== worst.id); worst.team = null; worst.series = s.id;
        moves.push({ kind: 'dropped', pid: worst.id, from: s.id, team: t.id });
        sign(t, best);
      }
    }
    // then the empty seats, the most attractive first: the best they can get (give or take)
    for (const t of order) while (t.drivers.length < SEATS) {
      const p = avail(t).map(q => [q, q.pace + gauss(w) * 4]).sort((x, y) => y[1] - x[1])[0]?.[0] || makePerson(w, { age: r0(17 + rng(w) * 3), series: s.id, lvl: s.base - 6 + gauss(w) * 5 });
      sign(t, p);
    }
  }
  // you: move up (your team takes the place of the weakest team in the series above, which drops a level), if you
  // have what the series asks for
  const off = w.player.offer;
  if (off && off.answer === 'move' && seriesMissing(myTeam(w), off.to).length) {
    const miss = seriesMissing(myTeam(w), off.to).map(([k, n]) => needName(k, n));
    off.answer = 'stay';
    mail(w, `${seriesById(off.to).name} Entries`, addrOf(seriesById(off.to), 'entries'), `Your entry`, [`We're sorry to say we cannot accept your entry for ${w.year + 1}: entrants must have ${miss.join(' and ')}.`, `The offer will be considered again next year, results permitting.`, `Entries Office, ${seriesById(off.to).name}`]);
  }
  if (off && off.answer === 'move') { swapUp(w, off.to, prevTeams[off.to]); moves.push({ kind: 'you-up', to: off.to }); }
  const moved = off && off.answer === 'move';
  if (moved && !w.pre) { keepClip(w, 'up', `${w.player.name.split(' ').pop()} moves up to the ${seriesById(off.to).name}`); w._mumClip = null; }
  w.player.offer = null;
  w.lastMoves = moves;
  newCalendars(w, trackPool);
  // the new season's paperwork: where to get a car (you've moved up), GT's balance of performance, gentleman drivers
  if (!w.pre && w.money) {
    seasonBop(w);
    // (the season setup, at the start of every season: the car if you need one (off the classifieds, or a maker's
    // program), car two, the second seat where there's a market for it, a title sponsor after moving up)
    if (w.founding?.reg) { if (needsCar(w) && seriesById(w.player.series).car === 'classifieds') w.ads = makeAds(w); w.setup = newSeasonSetup(w, moved); }
    else {
      if (moved && needsCar(w) && seriesById(w.player.series).car === 'classifieds') { w.ads = makeAds(w); adsMail(w); }
      else if (moved && needsCar(w)) carsMail(w);
    }
    if (!seriesById(w.player.series).seats) gentOffers(w);
  }
  if (!w.pre) { topUpFreeAgents(w); paddockSeason(w); }
  seasonOpenNews(w, moves);
  return moves;
}

// ---------------- the teams: development, facilities, crews (every team, yours included) ----------------
// A car's pace is its chassis plus what its team has developed: dev { power, grip, downforce, brake } (fractions, each
// worth a share of lap time: LAP_KS, by series) and rel (fewer failures). Development comes from projects (PROJECTS: days of work
// and money, and a chance it works); how well they go depends on the team's facilities (FACILITIES) and its crew.
// Everyone's development fades a fifth every season (the series moves on), so standing still is going backwards.
// The AI teams run the same way, with their own money (prize money, sponsors, and an owner who tops it up) and their
// own priorities (t.style): that, not a difficulty setting, is why the fast teams are fast. (The difficulty setting is
// how well the AI drive, the same for every team.) In the race an AI car's development is part of its pace gap
// (rating -> raceKnobs); yours is in your car's modifiers (carMods).
// (lap time gained per unit of each, by series: measured with .devtest/lapk.mjs, clean laps of each class's cars with one
// stat changed at a time on the preset circuits, 2026-10-06. Power's worth a third of what was once assumed on these
// circuits, brakes next to nothing (they already out-stop the tires), and a Formula car's downforce a great deal)
export const LAP_KS = {
  club:    { power: 0.1, grip: 0.5,  downforce: 0.01, brake: 0.005, drag: -0.04 }, // (as the street cars: measure when the club has a grid of its own)
  street:  { power: 0.1, grip: 0.5,  downforce: 0.01, brake: 0.005, drag: -0.04 },
  gt2:     { power: 0.1, grip: 0.4,  downforce: 0.04, brake: 0.01,  drag: -0.04 }, // (between street and GT: measure when it's raced)
  gt:      { power: 0.1, grip: 0.32, downforce: 0.07, brake: 0.02,  drag: -0.04 },
  groupc:  { power: 0.12, grip: 0.4, downforce: 0.15, brake: 0.01,  drag: -0.05 }, // (ground effect: between GT and Formula, not measured)
  formula: { power: 0.2, grip: 0.65, downforce: 0.25, brake: 0.005, drag: -0.06 },
};
export const lapKOf = (sid) => LAP_KS[tierOf(sid)] || LAP_KS.street;
const CAR_PTS = 1 / 0.000275; // (a team's car rating point: 0.0275% of a lap)
const DEV_FADE = 0.8;
const COND_TYP = -0.0065; // (what parts at about 80% cost a car in lap time: the condition a car is usually raced in. Was 1.2% when power was thought worth three times as much: LAP_KS)
const DEV_STATS = ['power', 'grip', 'downforce', 'brake', 'rel'];
const devZero = () => ({ power: 0, grip: 0, downforce: 0, brake: 0, rel: 0 });
const lapGain = (d, sid) => Object.entries(lapKOf(sid)).reduce((a, [k, v]) => a + (d[k] || 0) * v, 0);
const tierOf = (sid) => (seriesById(sid) || seriesById(START_SERIES)).id;
// how far each kind of development can go in a series (the rules, and physics): gains shrink as you approach it
// (power: three times what it was in Street and GT, half as much again in Formula, since a percent of power was found
// to be worth that much less lap time: LAP_KS. The engine parts and projects were scaled with it)
const DEV_CAP = { club: { power: 0.03, grip: 0.01, downforce: 0.02, brake: 0.03, rel: 0.5 }, street: { power: 0.09, grip: 0.015, downforce: 0.08, brake: 0.05, rel: 0.5 }, gt2: { power: 0.06, grip: 0.015, downforce: 0.06, brake: 0.04, rel: 0.5 }, gt: { power: 0.06, grip: 0.015, downforce: 0.06, brake: 0.04, rel: 0.5 }, groupc: { power: 0.06, grip: 0.015, downforce: 0.08, brake: 0.04, rel: 0.5 }, formula: { power: 0.045, grip: 0.02, downforce: 0.12, brake: 0.05, rel: 0.5 } };
// [key, area, name, stat, gain, days, cost, needs { facility: level }, joker (GT: homologated, two a season)]
export const devCapOf = (w) => DEV_CAP[tierOf(w.player.series)] || DEV_CAP.street;
export const PROJECTS = {
  street: [
    ['remap', 'engine', 'Dyno tune and remap', 'power', 0.0108, 2, 1800, { dyno: 1 }], ['head', 'engine', 'Port and polish the head', 'power', 0.018, 5, 4500],
    ['cams', 'engine', 'Hotter cams', 'power', 0.0144, 3, 3800], ['bottom', 'engine', 'Lightened rotating assembly', 'power', 0.0225, 7, 9000, { tools: 2 }],
    ['corner', 'chassis', 'Corner-weight the car', 'grip', 0.0018, 1, 500], ['strip', 'chassis', 'Strip out weight', 'grip', 0.003, 3, 1200],
    ['geo', 'chassis', 'Suspension geometry rework', 'grip', 0.0042, 4, 5000], ['shell', 'chassis', 'Stiffen the shell', 'grip', 0.0036, 5, 3500, { fab: 1 }],
    ['splitter', 'aero', 'Home-made splitter', 'downforce', 0.0125, 2, 900], ['wing', 'aero', 'Wing endplates and a gurney', 'downforce', 0.01, 2, 1300], ['floor', 'aero', 'Flat floor', 'downforce', 0.02, 5, 5500, { fab: 1 }],
    ['ducts', 'brakes', 'Brake cooling ducts', 'brake', 0.012, 2, 800], ['bias', 'brakes', 'Bias valve and braided lines', 'brake', 0.009, 1, 600],
    ['loom', 'reliability', 'Rebuild the wiring loom', 'rel', 0.1, 3, 1500], ['cooling', 'reliability', 'Uprated cooling', 'rel', 0.08, 2, 1900],
  ],
  gt: [
    ['evoeng', 'engine', 'Engine evolution (a joker)', 'power', 0.0135, 8, 60000, null, true], ['map', 'engine', 'Mapping, within the rules', 'power', 0.0045, 2, 8000, { dyno: 1 }],
    ['setup', 'chassis', 'Setup program', 'grip', 0.0024, 3, 12000], ['dampers', 'chassis', 'Damper development', 'grip', 0.0036, 5, 30000], ['weight', 'chassis', 'Ballast placement', 'grip', 0.0018, 2, 6000],
    ['evoaero', 'aero', 'Aero evolution (a joker)', 'downforce', 0.015, 8, 70000, null, true],
    ['brakes', 'brakes', 'Brake cooling package', 'brake', 0.012, 3, 15000],
    ['relgt', 'reliability', 'Reliability program', 'rel', 0.1, 4, 20000],
  ],
  formula: [
    ['pu', 'engine', 'Power unit upgrade', 'power', 0.00675, 10, 250000], ['susp', 'chassis', 'Suspension concept', 'grip', 0.0045, 8, 200000],
    ['fwing', 'aero', 'New front wing', 'downforce', 0.015, 8, 180000, { tunnel: 1 }], ['ffloor', 'aero', 'Floor development', 'downforce', 0.02, 10, 300000, { tunnel: 1 }],
    ['bbw', 'brakes', 'Brake-by-wire', 'brake', 0.012, 5, 90000], ['relf', 'reliability', 'Reliability', 'rel', 0.1, 5, 120000],
  ],
};
// (GT2: GT's programme, at about half the price)
PROJECTS.gt2 = PROJECTS.gt.map(([key, area, name, stat, gain, days, cost, needs, joker]) => [key, area, name, stat, gain, days, Math.round(cost * 0.45 / 500) * 500, needs, joker]);
// (Group C: GT's, about twice the price, the aero worked in the wind tunnel if you've got one)
PROJECTS.groupc = PROJECTS.gt.map(([key, area, name, stat, gain, days, cost, needs, joker]) => [key, area, name, stat, gain, days, Math.round(cost * 1.8 / 500) * 500, needs, joker]);
export const JOKERS = 2;
const projOf = (sid) => (PROJECTS[tierOf(sid)] || PROJECTS.street).map(([key, area, name, stat, gain, days, cost, needs, joker]) => ({ key, area, name, stat, gain, days, cost, needs: needs || null, joker: !!joker }));

// facilities: a base (where you work: each step up has room for more) and what's in it. Each level: [name, cost,
// upkeep a round, the base it needs]
export const FACILITIES = {
  base:   { name: 'Premises', levels: [['Rented lock-up', 0, 300, 0], ['Industrial unit', 8000, 900, 0], ['Race workshop', 40000, 2500, 1], ['Factory', 250000, 9000, 2]], what: 'Where you work. Bigger premises have room for more.' },
  tools:  { name: 'Tools', levels: [['Proper tools', 3000, 0, 0], ['Lift and engine hoist', 9000, 50, 1], ['Machine shop', 45000, 500, 2]], what: 'Projects go better and rebuilds cost less.' },
  dyno:   { name: 'Engine dyno', levels: [['Engine dyno', 18000, 300, 1]], what: 'Engine projects go better, and you know exactly what they gained.' },
  fab:    { name: 'Fabrication', levels: [['Fabrication bay', 12000, 200, 1], ['Composites shop', 80000, 1200, 2]], what: 'Chassis and aero projects go better; the composites shop makes them cheaper too.' },
  sim:    { name: 'Simulator', levels: [['Sim rig', 6000, 50, 0], ['Pro simulator', 120000, 1500, 2]], what: 'A day on the sim learns the next circuit (a setup worth having on the weekend).' },
  data:   { name: 'Data room', levels: [['Data room', 25000, 400, 1]], what: 'Your data engineer gets more out of it, and projects go a little better.' },
  truck:  { name: 'Transporter', levels: [['Transporter', 30000, 500, 1]], what: 'Travel costs a third less. The GT Championship requires one.' },
  tunnel: { name: 'Wind tunnel', levels: [['Wind tunnel time', 150000, 6000, 2], ['Own wind tunnel', 1500000, 20000, 3]], what: 'Formula aero development needs one.' },
};
export const FAC_KEYS = Object.keys(FACILITIES);
// what a facility gives at a level, in the numbers the game uses: each perk a template ({} is the number) and the
// number at a level (null: not at that level). facPerks(w, k, n): [text]; facUpgrade(w, k, n): [text] from n to n + 1,
// what changes written 'now -> next'
function facPerkDefs(w, k) {
  const c = COSTS[w.player.series];
  return {
    base: [['Room for {} projects at once', n => 1 + Math.min(2, n)]],
    tools: [['Projects {} points more likely to work', n => n * 8], ['Rebuilds {}% cheaper', n => n * 10], ['Your days on a project go {}% further', n => n * 25], ['Your mechanic puts {} more days a round into projects', n => (n * 0.4).toFixed(1)]],
    dyno: [['Engine projects {} points more likely to work, and gain about 14% more', n => 12], ['You know exactly what engine work gained', n => '']],
    fab: [['Chassis and aero projects {} points more likely to work', n => n * 8], ['Chassis and aero projects gain about {}% more', n => n * 10], ['Chassis and aero projects 25% cheaper', n => n >= 2 ? '' : null]],
    sim: [['A sim session before a weekend: about {}% more grip there (a test day: 1.2%)', n => n === 1 ? '0.6' : '1.0'], ['No track hire, no fuel, no wear', n => '']],
    data: [['Projects {} points more likely to work', n => 5], ['Your data engineer reads the data a level deeper', n => '']],
    truck: [['Travel {}% cheaper: about ' + money$(c.travel * 0.35) + ' a round', n => 35], ['Required for the GT Championship', n => '']],
    tunnel: [['Aero projects {} points more likely to work', n => n * 10], ['Required for Formula SV aero development', n => '']],
  }[k] || [];
}
export function facPerks(w, k, n) { return n <= 0 ? [] : facPerkDefs(w, k).map(([t, f]) => { const v = f(n); return v == null ? null : t.replace('{}', v); }).filter(Boolean); }
// built and upgradable: every perk, the ones the next level changes written 'now -> next': [[text, changed]]
export function facCompare(w, k, n) {
  return facPerkDefs(w, k).map(([t, f]) => { const a = f(n), b = f(n + 1); if (a == null && b == null) return null;
    if (a == null) return ['New: ' + t.replace('{}', b), true]; if (String(a) === String(b)) return [t.replace('{}', a), false]; return [t.replace('{}', `${a} &rarr; ${b}`), true]; }).filter(Boolean);
}
export function facUpgrade(w, k, n) {
  return facPerkDefs(w, k).map(([t, f]) => { const a = n > 0 ? f(n) : null, b = f(n + 1); if (b == null) return null;
    if (a == null) return 'New: ' + t.replace('{}', b); if (String(a) === String(b)) return null; return t.replace('{}', `${a} &rarr; ${b}`); }).filter(Boolean);
}
// what a series asks of a team before it can enter (a facility: the level it needs)
export const SERIES_NEEDS = { gt2: { truck: 1 }, gt: { base: 1, truck: 1 }, groupc: { base: 2, truck: 1 }, formula: { base: 2, truck: 1, tunnel: 1 } };
export const facOf = (t) => (t.fac ??= { base: 0 });
export const facLevel = (t, k) => facOf(t)[k] || 0;
export const myTeam = (w) => w.teams[w.player.team];
// the next level of a facility: { name, cost, upkeep, needsBase } (or null: as good as it gets)
export function facNext(t, k) { const L = FACILITIES[k].levels[facLevel(t, k) + (k === 'base' ? 1 : 0)]; return L ? { name: L[0], cost: L[1], upkeep: L[2], needsBase: L[3] } : null; }
export const facName = (t, k) => { const n = facLevel(t, k); return k === 'base' ? FACILITIES.base.levels[n][0] : n ? FACILITIES[k].levels[n - 1][0] : null; };
export function facUpkeep(t) { let u = 0; for (const k of FAC_KEYS) { const n = facLevel(t, k); if (k === 'base') u += FACILITIES.base.levels[n][2]; else for (let i = 0; i < n; i++) u += FACILITIES[k].levels[i][2]; } return u; }
// a facility at a level, as you'd say it: 'an industrial unit', 'a transporter'
export const needName = (k, n) => { const nm = (k === 'base' ? FACILITIES.base.levels[n] : FACILITIES[k].levels[n - 1])[0].toLowerCase(); return (/^[aeiou]/.test(nm) ? 'an ' : 'a ') + nm; };
// what's missing for a series: [[facility, level]]
export const seriesMissing = (t, sid) => Object.entries(SERIES_NEEDS[sid] || {}).filter(([k, n]) => facLevel(t, k) < n);
export function buildFacility(w, k) {
  const t = myTeam(w), nx = facNext(t, k); if (!nx) return { ok: false, why: 'Nothing more to build.' };
  if (facLevel(t, 'base') < nx.needsBase) return { ok: false, why: `You need bigger premises first (${FACILITIES.base.levels[nx.needsBase][0]}).` };
  pay(w, -nx.cost, k === 'base' ? `Moved into: ${nx.name}` : `Built: ${nx.name}`);
  facOf(t)[k] = facLevel(t, k) + 1;
  if (k === 'base') news(w, `${t.name.toUpperCase()} MOVES`, `${t.name} has moved into ${nx.name.toLowerCase().replace(/^an? /, '')} premises.`);
  if (rng(w) < 0.6) react(w, 'danny', `The player's team just ${k === 'base' ? `moved into a ${nx.name.toLowerCase()}` : `got a ${nx.name.toLowerCase()}`} for ${money$(nx.cost)}.`);
  return { ok: true };
}

// ---- development on a car ----
// yours lives on the car (a new car starts again); an AI team's on the team (t.dev)
export const devOf = (w, t = myTeam(w)) => t.mine ? (w.car ? (w.car.dev ??= devZero()) : devZero()) : (t.dev ??= devZero());
// a team's car rating (the drivers' ratings use it): its series' base, give or take its development
export function carValue(w, t, pid = null) {
  const base = (seriesById(t.series) || seriesById(START_SERIES)).base;
  if (t.mine) {
    const m = w.car ? carMods(w, pid && pid !== 'P' && pid === teammateOf(w) ? 'mate' : 'me') : null;
    const K = lapKOf(t.series), g = m ? (m.power - 1) * K.power + (m.grip - 1) * K.grip + (m.downforce - 1) * K.downforce + (m.brake - 1) * K.brake + (m.drag - 1) * K.drag : 0;
    // (less the balance of performance: it's what makes the base car a typical one, as the AI teams' are taken to be;
    // in the race it reaches every car alike through race.js edgeFor)
    const [bp, bg] = w.car ? bopFor(w, w.car.chassis) : [1, 1], gb = g - ((bp - 1) * K.power + (bg - 1) * K.grip);
    return base + (gb - COND_TYP) * CAR_PTS; // (yours, undeveloped and in fair condition, is a typical car: what the difficulty is set against)
  }
  // (an AI team's car is on the same scale as yours: the same development and parts, the same speed. How far ahead of a
  // new arrival the field is comes from what the teams have spent: AI_DEVB, measured with simcareer)
  return base + (lapGain(devOf(w, t), t.series) + lapGain(aiKitOf(t), t.series)) * CAR_PTS;
}
// how likely a project is to work, and how well: who's doing it (your days and your mechanic, or a shop), the tools,
// the facility for that kind of work, the data room
function projOdds(w, t, P, shop) {
  const F = (k) => facLevel(t, k), m = t.mine ? staffOf(w, 'mechanic') : null, mech = t.mine ? (m ? m.skill : 0) : (t.crew?.mech || 2);
  const area = P.area, spec = area === 'engine' ? F('dyno') * 0.12 : area === 'chassis' || area === 'aero' ? F('fab') * 0.08 + (area === 'aero' ? F('tunnel') * 0.1 : 0) : 0;
  const eng = t.mine ? (staffOf(w, 'engineer')?.skill || 0) : (t.crew?.eng || 2);
  const chance = shop ? 0.85 : clamp(0.5 + F('tools') * 0.08 + mech * 0.04 + eng * 0.02 + spec + F('data') * 0.05, 0.3, 0.95);
  const q = 0.9 + spec * 1.2 + (shop ? 0 : mech * 0.02);
  return { chance, q };
}
// the cost of a project for a team (the composites shop makes chassis and aero work cheaper)
const projCost = (t, P, shop) => Math.round(P.cost * (shop ? 1.6 : 1) * ((P.area === 'aero' || P.area === 'chassis') && facLevel(t, 'fab') >= 2 ? 0.75 : 1) / 50) * 50;
// what it'd add now (gains shrink as the car nears what the rules allow)
export function projGain(w, t, P, to = 'me') { const cap = DEV_CAP[tierOf(t.series)] || DEV_CAP.street, cur = (to === 'mate' && t.mine ? dev2Of(w) : devOf(w, t))[P.stat] || 0; return P.gain * Math.max(0.15, 1 - cur / cap[P.stat]); }
// the projects you can start: [{ ...P, cost, shopCost, odds, gain, locked (why not) }]
export function projectList(w) {
  const t = myTeam(w), active = (w.projects || []).filter(x => !x.done), jok = jokersLeft(w);
  return projOf(w.player.series).map(P => {
    const miss = P.needs ? Object.entries(P.needs).filter(([k, n]) => facLevel(t, k) < n).map(([k, n]) => FACILITIES[k].levels[n - 1][0]) : [];
    const locked = !w.car || needsCar(w) ? 'No car for it' : miss.length ? `Needs: ${miss.join(', ')}` : active.some(x => x.key === P.key) ? 'Under way' : P.joker && jok <= 0 ? 'No jokers left this season' : null;
    return { ...P, cost: projCost(t, P, false), shopCost: projCost(t, P, true), odds: projOdds(w, t, P, false), gain: projGain(w, t, P), locked, both: BOTH_K };
  });
}
export const maxProjects = (w) => 1 + Math.min(2, facLevel(myTeam(w), 'base'));
export const jokersLeft = (w) => JOKERS - ((w.jokers && w.jokers.y === w.year) ? w.jokers.n : 0);
// start one: 'team' (your days, your mechanic's time) or 'shop' (dearer, done by the next round, more likely to work);
// for your car, your teammate's, or both (the parts twice over: BOTH_K the cost)
const BOTH_K = 1.6;
export function startProject(w, key, who = 'team', to = 'me') {
  const P = projectList(w).find(x => x.key === key); if (!P || P.locked) return { ok: false, why: P ? P.locked : 'No such project.' };
  if (!mateOf(w)) to = 'me';
  const shop = who === 'shop', cost = Math.round((shop ? P.shopCost : P.cost) * (to === 'both' ? BOTH_K : 1) / 50) * 50;
  // (your premises have room for so many at once; a shop's work is done at the shop)
  if (!shop && (w.projects || []).filter(x => !x.done && !x.shop).length >= maxProjects(w)) return { ok: false, why: `You have room for ${maxProjects(w)} at a time. Bigger premises have room for more, or send one to a shop.` };
  pay(w, -cost, `${shop ? 'Outsourced: ' : 'Project: '}${P.name}`);
  if (P.joker) w.jokers = { y: w.year, n: (w.jokers && w.jokers.y === w.year ? w.jokers.n : 0) + 1 };
  (w.projects ??= []).unshift({ id: 'pj' + (w.nextId++), key, name: P.name, area: P.area, stat: P.stat, days: P.days, done: 0, who, shop, y: w.year, to });
  if (w.projects.length > 30) w.projects.length = 30;
  return { ok: true };
}
// a day of your own on a project (the week's day picker)
export function workOnProject(w, id) {
  const x = (w.projects || []).find(p => p.id === id && !p.done && !p.shop); if (!x || daysLeft(w) <= 0) return false;
  useDay(w, `Worked on: ${x.name}`, 0, 'Car work'); x.prog = (x.prog || 0) + 1 + facLevel(myTeam(w), 'tools') * 0.25;
  if (x.prog >= x.days) finishProject(w, x);
  return true;
}
// your mechanic's week: they put their days into the projects (the oldest first)
// (a week's worth of your mechanic's project days)
export const mechRate = (w) => { const m = staffOf(w, 'mechanic'); return m ? 1.5 + m.skill * 0.6 * (m.morale < 35 ? 0.5 : 1) + facLevel(myTeam(w), 'tools') * 0.4 : 0; };
// your mechanic's days go in a share at a time, each day of the week (and what's left of the week when you go racing);
// the shop's work comes back after the race
function crewDay(w) {
  const wk = weekOf(w); if ((wk.crewDays || 0) >= WEEK_DAYS) return;
  wk.crewDays = (wk.crewDays || 0) + 1; crewWork(w, mechRate(w) / WEEK_DAYS, false);
}
function crewWork(w, cap = null, shops = true) {
  if (cap == null) { const wk = weekOf(w), left = WEEK_DAYS - (wk.crewDays || 0); wk.crewDays = WEEK_DAYS; cap = mechRate(w) * left / WEEK_DAYS; }
  for (const x of (w.projects || []).filter(p => !p.done).reverse()) {
    if (x.shop) { if (shops) finishProject(w, x); continue; }
    if (cap <= 0) continue;
    const need = x.days - (x.prog || 0), put = Math.min(cap, need); x.prog = (x.prog || 0) + put; cap -= put;
    if (x.prog >= x.days - 1e-6) finishProject(w, x);
  }
}
// done: did it work, and what did it give? (you know exactly with a dyno for engines, or a data engineer; otherwise
// it's how it feels)
function finishProject(w, x) {
  const t = myTeam(w), P = projOf(w.player.series).find(p => p.key === x.key); x.done = true;
  if (!P || !w.car) return;
  const to = x.to || 'me', o = projOdds(w, t, P, x.shop), ok = rng(w) < o.chance, d = devOf(w, t), d2 = dev2Of(w);
  const g = ok ? projGain(w, t, P, to) * o.q * (0.8 + rng(w) * 0.4) : 0;
  if (ok) { for (const dd of to === 'both' ? [d, d2] : to === 'mate' ? [d2] : [d]) dd[P.stat] = +((dd[P.stat] || 0) + g).toFixed(4); favor(w, to, x.name.toLowerCase()); }
  x.ok = ok; x.got = +g.toFixed(4);
  const exact = (P.area === 'engine' && facLevel(t, 'dyno')) || dataLevel(w) >= 1;
  const said = !ok ? pickLine(w, [`Didn't work. We tried it three ways`, `No good. It's slower if anything, so it's coming off`, `Waste of time, honestly. My fault`])
    : P.stat === 'rel' ? `Done. Should be more reliable` : exact ? `Done. ${(g * 100).toFixed(1)}% more ${P.stat === 'grip' ? 'grip' : P.stat === 'brake' ? 'braking' : P.stat} on the numbers` : pickLine(w, [`Done. Feels better`, `Done. Hard to say how much till we race it`, `Finished. It's quicker, I think`]);
  const m = staffOf(w, 'mechanic');
  if (x.shop) mail(w, 'Precision Race Prep', 'workshop@precisionraceprep.sv', `Job complete: ${x.name}`, [`Your job is complete and the car is ready to collect.`, ok ? (exact ? `Measured gain: ${(g * 100).toFixed(1)}%.` : 'We are confident you will notice the difference.') : 'Unfortunately the modification did not deliver the expected gains. Labour is charged regardless.', 'Precision Race Prep']);
  else text(w, m ? m.first : 'Danny', `${x.name}: ${said}`);
}
// the season turns: development fades, GT's jokers reset (yours: on the car; the AI's: in aiSeason)
function devSeason(w) { if (w.car) for (const D of [w.car.dev, w.car.dev2]) if (D) for (const k of DEV_STATS) D[k] = +(D[k] * DEV_FADE).toFixed(4); }

// ---- the AI teams: a business each ----
// t.bank (money), t.owner (what the owner puts in each season, by wealth), t.style ('build': facilities first,
// 'develop': projects, 'balanced'), t.crew { mech, eng } (1-5)
const AI_SPONSOR = { club: 1500, street: 5000, gt2: 14000, gt: 30000, groupc: 55000, formula: 100000 }; // (a round, for a mid-table team)
const AI_OWNER = { club: 45000, street: 100000, gt2: 140000, gt: 180000, groupc: 280000, formula: 450000 };  // (a season, for an owner of average wealth)
const STYLES = ['build', 'develop', 'balanced'];
function aiInit(w, t) {
  if (t.bank != null) return;
  t.wealth = +(0.4 + rng(w) * 1.3).toFixed(2); t.style = STYLES[Math.floor(rng(w) * 3)];
  t.crew = { mech: 1 + Math.floor(rng(w) * 3), eng: 1 + Math.floor(rng(w) * 3) };
  t.fac = { base: rng(w) < t.wealth / 2 ? 1 : 0 }; if (rng(w) < 0.5) t.fac.tools = 1;
  for (const [k, n] of Object.entries(SERIES_NEEDS[t.series] || {})) t.fac[k] = Math.max(t.fac[k] || 0, n); // (a team in a series has what it asks for)
  t.dev = devZero(); t.bank = Math.round(AI_OWNER[tierOf(t.series)] * t.wealth * 0.5); t.active = [];
}
// An AI team's development money: the owner sets a budget for the season (by how rich they are, less when the team's
// in debt) and the team spends it through the season, whatever's in the bank; a team whose car is behind yours spends
// faster, to catch up (the development race: build a quicker car and they come after you).
// t.devB { y, sid, budget, spent }; t.kit: the catalogue parts fitted ([name]), lost when the team changes series
const AI_KIT_KEEP = 0.4;
const AI_DEVB = { club: 2600, street: 6000, gt2: 16000, gt: 32000, groupc: 55000, formula: 100000 }; // (a season, an owner of average wealth)
function aiBudget(w, t, sid) {
  if (t.devB && t.devB.y === w.year && t.devB.sid === sid) return t.devB;
  const owner = AI_OWNER[tierOf(sid)], debt = t.bank < -owner * 0.5 ? 0.5 : 1;
  return (t.devB = { y: w.year, sid, budget: Math.round(AI_DEVB[tierOf(sid)] * (0.1 + 0.9 * t.wealth) * debt / 100) * 100, spent: 0 });
}
// the parts an AI team can buy (yours: catalogue())
const aiCatalogue = (sid) => { const own = KIT[sid], k = own ? 1 : PRICE_K[sid] || 1; return (own || KIT.street).map(([slot, name, gains, q, price]) => ({ slot, name, gains, q, price: Math.round(price * k) })); };
// what an AI team's fitted parts give (gains: { stat: fraction }, as made: q)
function aiKitOf(t) {
  const out = {}; if (!t.kit || !t.kit.length || !t.series) return out;
  for (const x of aiCatalogue(t.series)) if (t.kit.includes(x.name)) for (const [k, v] of Object.entries(x.gains)) out[k] = (out[k] || 0) + v * x.q;
  return out;
}
// how far behind your car an AI team's is (% of a lap; 0: level or ahead, or you're not in its series)
function aiBehind(w, sid, t) {
  if (w.pre || !w.car || w.player.series !== sid) return 0;
  return Math.max(0, (carValue(w, myTeam(w)) - carValue(w, t)) / CAR_PTS * 100);
}
// a team buried in debt is sold: a new owner, the debt written off (the team, its people and its car carry on)
function aiTakeover(w, t) {
  const owner = AI_OWNER[tierOf(t.series)]; if (t.bank > -owner * 1.5) return false;
  t.wealth = +(0.7 + rng(w) * 0.9).toFixed(2); t.bank = Math.round(owner * t.wealth * 0.5); t.devB = null;
  if (!w.pre && t.series === w.player.series) news(w, `${t.name.toUpperCase()} UNDER NEW OWNERSHIP`, `${t.name} has been sold. The new owner says the team's debts are "behind us" and that there will be "investment", which the team's suppliers will believe when they see it.`);
  return true;
}
// a round for an AI team: money in (prize money, sponsors), money out (running the cars, the facilities), and the
// development work: its crew's days go into projects it can afford
function aiRound(w, sid, rows) {
  const c = COSTS[sid], S = w.series[sid], ts = teamStandings(w, sid), n = S.teams.length;
  for (const tid of S.teams) {
    const t = w.teams[tid]; if (t.mine) continue; aiInit(w, t);
    const rank = Math.max(0, ts.findIndex(e => e.tid === tid)), rep = 1 - rank / Math.max(1, n - 1);
    const prize = Math.max(0, ...rows.filter(r => w.people[r.pid]?.team === tid && !r.dnf).map(r => c.prize[r.pos - 1] || 0));
    const run = c.entry + c.travel * (facLevel(t, 'truck') ? 0.65 : 1) + c.crew + c.tyre * 3 + c.fuelLap * 30 + facUpkeep(t) + (t.crew.mech + t.crew.eng) * 600 * (WAGE_K[sid] || 1)
      + t.drivers.reduce((a, d) => a + (w.people[d] ? DRIVER_WAGE(w.people[d].pace) * (WAGE_K[sid] || 1) : 0), 0); // (and the drivers' wages)
    t.bank += prize + AI_SPONSOR[sid] * (0.5 + rep) - run;
    // development: the season's budget, spent at the season's pace (faster when the car's behind yours)
    if (t.devB == null) aiTakeover(w, t); // (a team from an older save, deep in debt: sold now, not at the season's end)
    const B = aiBudget(w, t, sid), behind = aiBehind(w, sid, t), push = 1 + clamp(behind / 0.5, 0, 1) * 1.5;
    const room = () => Math.min(B.budget * push, B.budget * push * (w.round + 1.5) / w.opts.len) - B.spent;
    const spend = (c) => { t.bank -= c; B.spent += c; };
    t.active = (t.active || []).filter(Boolean);
    const cap = 2 + t.crew.mech * 0.8 + facLevel(t, 'tools') * 0.4;
    const jok = (t.jokers && t.jokers.y === w.year) ? t.jokers.n : 0;
    while (t.active.length < 1 + Math.min(2, facLevel(t, 'base'))) {
      const opts = projOf(sid).filter(P => !t.active.some(a => a.key === P.key) && !(P.needs && Object.entries(P.needs).some(([k, l]) => facLevel(t, k) < l)) && !(P.joker && jok >= JOKERS));
      const P = opts.sort((a, b) => projGain(w, t, b) * LAP_K_OF(b, sid) / projCost(t, b) - projGain(w, t, a) * LAP_K_OF(a, sid) / projCost(t, a) + (rng(w) - 0.5) * 1e-6)[0];
      if (!P || projCost(t, P) > room()) break;
      spend(projCost(t, P)); t.active.push({ key: P.key, prog: 0 });
      if (P.joker) t.jokers = { y: w.year, n: jok + 1 };
    }
    // a part from the catalogue (one a round: the most lap time for the money)
    { const K = lapKOf(sid), worth = (x) => Object.entries(x.gains).reduce((a, [k, v]) => a + (K[k] || 0) * v, 0) * x.q;
      const x = aiCatalogue(sid).filter(x => !(t.kit || []).includes(x.name) && worth(x) > 0).sort((a, b) => worth(b) / b.price - worth(a) / a.price)[0];
      if (x && x.price <= room()) { spend(x.price); (t.kit ??= []).push(x.name); } }
    let left = cap;
    for (const a of t.active) {
      const P = projOf(sid).find(p => p.key === a.key); if (!P) { a.done = true; continue; }
      const put = Math.min(left, P.days - a.prog); a.prog += put; left -= put;
      if (a.prog >= P.days) { a.done = true; const o = projOdds(w, t, P, false);
        if (rng(w) < o.chance) { const g = projGain(w, t, P) * o.q * (0.8 + rng(w) * 0.4); t.dev[P.stat] = +((t.dev[P.stat] || 0) + g).toFixed(4);
          // (the paddock notices a team catching up: an update, in the news)
          if (!w.pre && sid === w.player.series && behind > 0.3 && g * (LAP_K_OF(P, sid)) > 0.0008 && rng(w) < 0.5) news(w, `${t.name.toUpperCase()} BRINGS AN UPDATE`, `${t.name} arrives at ${w.series[sid].cal[Math.min(w.round + 1, w.series[sid].cal.length - 1)]?.name || 'the next round'} with ${P.name.toLowerCase().replace(/ \(a joker\)/, '')}. "We know where we are," says the team. "We know where we want to be."`); } }
    }
    t.active = t.active.filter(a => !a.done);
  }
}
const LAP_K_OF = (P, sid) => P.stat === 'rel' ? 0.02 : lapKOf(sid)[P.stat];
// an AI team's season: the owner's money, development fades, a facility if it can afford one, the crew
function aiSeason(w) {
  for (const t of Object.values(w.teams)) {
    if (t.mine || !t.series) continue; aiInit(w, t);
    for (const k of DEV_STATS) t.dev[k] = +(t.dev[k] * DEV_FADE).toFixed(4);
    if (t.kit) t.kit = t.kit.filter(() => rng(w) < AI_KIT_KEEP); // (parts wear out, get sold on, go missing over the winter)
    t.bank += AI_OWNER[tierOf(t.series)] * t.wealth * (t.bank > AI_OWNER[tierOf(t.series)] * 2 ? 0.3 : 1); // (an owner with money in the bank puts less in)
    t.wealth = clamp(t.wealth + gauss(w) * 0.08, 0.2, 2.2);
    // build: the first thing on its list it can afford (facilities first for builders)
    const order = t.style === 'build' ? ['base', 'tools', 'dyno', 'fab', 'data', 'truck', 'sim', 'tunnel'] : ['tools', 'base', 'dyno', 'fab', 'data', 'sim', 'truck', 'tunnel'];
    const keep = t.style === 'build' ? 1.2 : 2.5;
    for (const k of order) {
      const nx = facNext(t, k); if (!nx || facLevel(t, 'base') < nx.needsBase) continue;
      if (k === 'tunnel' && !SERIES_NEEDS[t.series]?.tunnel) continue;
      if (k === 'base' && facLevel(t, 'base') >= ({ club: 1, street: 2 }[t.series] ?? 3)) continue; // (no factories in the Street Cup)
      const run = COSTS[t.series].entry + COSTS[t.series].crew;
      if (t.bank > nx.cost + run * keep * w.opts.len / 2) { t.bank -= nx.cost; facOf(t)[k] = facLevel(t, k) + 1; if (!w.pre && t.series === w.player.series) news(w, `${t.name.toUpperCase()} INVESTS`, `${t.name} has added ${nx.name.toLowerCase().replace(/^(an?|the) /, '')} to its base.`); break; }
    }
    // the crew: rich teams hire better people; good people get better
    const flush = t.bank > AI_OWNER[tierOf(t.series)] * 0.5;
    for (const r of ['mech', 'eng']) if (rng(w) < 0.3) t.crew[r] = clamp(t.crew[r] + (flush ? 1 : t.bank < 0 ? -1 : 0), 1, 5);
    if (!aiTakeover(w, t) && t.bank < 0) t.bank = Math.round(t.bank * 0.5); // (the owner pays off half the debt)
  }
}
// your staff over the winter: some get better (good tools, a data room, being happy help), and the good ones get offers
const ROLE_WORD = { manager: 'manager', mechanic: 'chief mechanic', engineer: 'data engineer' };
function staffSeason(w) {
  if (w.pre || !w.staff || !w.money) return;
  const t = myTeam(w), rivals = w.series[w.player.series].teams.filter(x => x !== t.id);
  for (const x of w.staff) {
    const up = 0.22 + (x.role === 'mechanic' ? facLevel(t, 'tools') * 0.06 : x.role === 'engineer' ? facLevel(t, 'data') * 0.12 : 0) + (x.morale > 70 ? 0.1 : 0);
    if (x.skill < 5 && rng(w) < up) {
      x.skill++; x.wage = Math.round(x.wage + (ROLE_WAGE[x.role]?.[1] || 300) * 0.6);
      text(w, x.first, x.danny ? `Did a course over the winter. Logistics. I have a certificate` : pickLine(w, [`Good winter. I've learned a lot this year. I'd like that to show in my pay, which it now does, thank you`, `Did some courses over the off-season. I'm better at this than I was`]));
    }
    if (!x.danny && x.skill >= 4 && rng(w) < 0.3 && rivals.length) {
      const rt = w.teams[pick(w, rivals)], offer = Math.round(wageNow(w, x) * 1.35 / 50) * 50;
      mail(w, `${x.first} ${x.last}`, `${x.first.toLowerCase()}@${t.name.toLowerCase().replace(/[^a-z]+/g, '')}.sv`, 'An offer',
        [`I wanted you to hear it from me: ${rt.name} have offered me a job as their ${ROLE_WORD[x.role]}, at ${money$(offer)} a round.`, `I'd rather stay. But it's a lot of money.`, x.first],
        { poach: x.id, offer, from: rt.name, choices: [['match', `Match it: ${money$(offer)} a round`], ['go', `Let ${x.first} go`]] });
    }
  }
}
export function answerPoach(w, m, key) {
  const x = (w.staff || []).find(s => s.id === m.poach); if (!x) return 'gone';
  if (key === 'match') { x.wage = Math.round(x.wage * 1.35 / 50) * 50; x.morale = clamp(x.morale + 15, 0, 100); return 'kept'; }
  w.staff = w.staff.filter(s => s !== x); news(w, `${m.from.toUpperCase()} SIGNS ${x.last.toUpperCase()}`, `${m.from} has a new ${ROLE_WORD[x.role]}: ${x.first} ${x.last}, from ${myTeam(w).name}.`);
  return 'gone';
}
// a day on the sim rig: the next circuit learned (some of the setup a test day would find), no tyres, no fuel
export function simDay(w) {
  const n = facLevel(myTeam(w), 'sim'); if (!n || daysLeft(w) <= 0) return false;
  const wk = weekOf(w); if (wk.sim) return false;
  useDay(w, `Sim session: ${w.series[w.player.series].cal[w.round].name}`, 0, 'Sim'); wk.sim = n === 1 ? 1.5 : 2.5;
  return true;
}
// a team changes series (and so cars): the development starts again
function devReset(t) { if (t.dev) t.dev = devZero(); t.active = []; t.kit = []; t.devB = null; }

// ---------------- starting the team: the setup wizard (on the computer, after Form SV-1 and the lottery) ----------------
// Four choices, F1 My Team style: how you get in (the entry: a story-shaped difficulty), the car (unless the entry
// came with one), a title sponsor (one of three), and the second driver (one of four). w.setup: { step, entry, done,
// sponsors: [offer], drivers: [pid], scout: { pid: [lo, hi] } }. Careers from before it have none: done.
export const SETUP_STEPS = ['entry', 'car', 'sponsor', 'mate', 'ready'];
export const setupDone = (w) => !w.setup || w.setup.done;
export const setupKind = (w) => (w.setup && w.setup.kind) || 'team';
const BRAND = { clean: 'Family-run: hates seeing their name in a crash', top: 'Wants results, and says so', finish: 'Just wants to see the car at the end', gain: 'Likes a bit of action: overtakes', beat: 'Has a rival, and wants them beaten', lead: 'Wants their name at the front' };
function newSetup(w) {
  const local = SPONSOR_POOL.map((x, i) => sponsorById('sp' + i)).filter(sp => sp.rep <= 25 && sp.rep < 999 && (!sp.town || sp.town === w.home));
  const three = local.sort((a, b) => (a.town ? 0 : 1) - (b.town ? 0 : 1) || rng(w) - 0.5).slice(0, 3);
  // three shapes of deal: a big cheque from someone impatient, a steady one, a small one from someone patient
  const shapes = [{ k: 1.35, sign: 1, pat: -1, tag: 'Big money, impatient' }, { k: 1, sign: 2, pat: 0, tag: 'Steady' }, { k: 0.75, sign: 4, pat: 2, tag: 'Patient, big signing bonus' }];
  const base = three.reduce((a, sp) => a + sp.fee, 0) / Math.max(1, three.length); // (one base for all three, so the shapes differ)
  const sponsors = three.map((sp, i) => { const s = shapes[i], fee = Math.round(base * s.k * (0.97 + rng(w) * 0.06) / 50) * 50;
    return { sid: sp.id, fee, bonus: Math.round(fee * 0.6 / 50) * 50, signing: Math.round(fee * s.sign / 100) * 100, patience: clamp(sp.patience + s.pat, 1, 6), tag: s.tag, brand: BRAND[sp.wants[0]] || '' }; });
  // the second seat: whoever's in it now (the folded team's driver), someone quick, a pay driver, a teenager
  const T = w.teams[w.player.team], inherited = T.drivers.find(d => d !== 'P'), free = Object.values(w.people).filter(p => !p.retired && !p.team && ageOf(w, p) < 36 && !traitsOf(w, p).includes('gentleman'));
  const quick = free.filter(p => !traitsOf(w, p).includes('paydriver')).sort((a, b) => b.pace - a.pace)[0];
  let kid = free.filter(p => ageOf(w, p) <= 19 && p !== quick).sort((a, b) => b.pot - a.pot)[0];
  if (!kid) kid = makePerson(w, { age: 17, series: null, lvl: seriesById(startOf(w)).base - 8 });
  const payer = makePerson(w, { age: r0(19 + rng(w) * 6), series: null, lvl: seriesById(startOf(w)).base - 9 });
  payer.traits = ['paydriver']; payer.purse = Math.round((15000 + rng(w) * 8000) / 500) * 500; payer.biz = pickLine(w, ['Carpets & Flooring', 'Discount Mattresses', 'Lawn Ornaments', 'Premium Gutters', 'Self Storage']);
  const drivers = [inherited, quick && quick.id, payer.id, kid.id].filter(Boolean);
  // what your scouting says they could become: a range around the truth
  const scout = Object.fromEntries(drivers.map(pid => { const p = w.people[pid], e = gauss(w) * 4, wid = 6 + rng(w) * 6; return [pid, [r0(clamp(p.pot + e - wid / 2, p.pace, 99)), r0(clamp(p.pot + e + wid / 2, p.pace + 2, 99))]]; }));
  return { step: 0, at: 0, picks: {}, inherited, entry: null, done: false, sponsors, drivers, scout };
}
// the wizard's steps for the picks so far (an entry that comes with a car skips the car), your picks recorded as you go
// (Back and Next move freely; nothing's spent until setupApply, from the last step)
export function setupSteps(w) {
  if (setupKind(w) === 'season') { const S = w.setup, seats = !!seriesById(w.player.series).seats; return ['len', 'cal', ...(w.coop ? ['roles'] : []), ...(S.cars.length ? ['car'] : []), ...(w.coop ? (car2Models(w).length ? ['car2'] : []) : seats && S.seats.length ? ['seat'] : []), ...(S.sponsors.length ? ['sponsor'] : []), ...(setupChassis(w) ? ['livery'] : []), 'ready']; }
  // (a car bought before the setup, in careers from before it was the only way: starting from nothing keeps it)
  const e = w.setup?.picks?.entry; return ['len', 'cal', 'entry', ...((e && e !== 'fresh') || w.car ? [] : ['car']), 'sponsor', ...(w.coop ? [] : ['mate']), 'ready'];
}
// the model you'll race this season: the car picked in the season setup (bought when the lights go out), or yours
export function setupChassis(w) {
  const S = w.setup, o = S && S.kind === 'season' && S.picks.car != null ? S.cars[S.picks.car] : null;
  return o ? (o.how === 'ad' ? o.c.chassis : o.c.key || o.c.chassis) : w.car?.chassis || null;
}
export function setupPick(w, step, val) { const S = w.setup; if (!S || S.done) return; S.picks[step] = val; if (step === 'entry' && val !== 'fresh') delete S.picks.car; }
export function setupMove(w, d) { const S = w.setup; if (!S) return; S.at = clamp((S.at || 0) + d, 0, setupSteps(w).length - 1); }
// what your money would be after the picks so far: [{ what, amt }], and the total
export function setupBudget(w) {
  if (setupKind(w) === 'season') return seasonBudgetNow(w);
  const S = w.setup, P = S.picks, rows = [];
  const e = P.entry && setupEntries(w).find(x => x.key === P.entry); if (e && e.cost) rows.push([e.name, -e.cost]);
  const ad = P.car && (w.ads || []).find(a => a.id === P.car); if (ad) rows.push([`${ad.year} ${ad.name}`, -ad.price]);
  if (w.car && P.entry && P.entry !== 'fresh') { const v = tradeIn(w); if (v) rows.push([`Trade-in: ${w.car.year} ${w.car.name}`, v]); }
  const o = P.sponsor != null && S.sponsors[P.sponsor]; if (o && o.signing) rows.push([`${sponsorById(o.sid).name}: signing bonus`, o.signing]);
  const q = P.mate && w.people[P.mate]; if (q) { const a = askOf(w, q); if (a.fee) rows.push([`${q.first} ${q.last}: seat money`, a.fee]); }
  return { rows, after: w.money.balance + rows.reduce((a, r) => a + r[1], 0) };
}
// do it all: the entry, the car, the sponsor, the driver, then the Wire hears about it
export function setupApply(w) {
  if (w.setup) w.setup.newCar = setupKind(w) !== 'season' || w.setup.picks.car != null; // (for press day: a new car under the sheet)
  if (setupKind(w) === 'season') return seasonApply(w);
  const S = w.setup, P = S.picks; if (!S || S.done) return { ok: false, why: 'Already done.' };
  if (!P.entry || (P.entry === 'fresh' && !P.car && !w.car) || P.sponsor == null || !P.mate) return { ok: false, why: 'Something is still to choose.' };
  if (setupBudget(w).after < 0) return { ok: false, why: `That's more than you have. Go back and change something.` };
  let r = setupEntry(w, P.entry); if (!r.ok) return r;
  if (P.entry === 'fresh' && !w.car) { r = setupCar(w, P.car); if (!r.ok) return r; }
  setupSponsor(w, P.sponsor); setupMate(w, P.mate); setupFinish(w);
  passedOn(w, (S.drivers || []).filter(pid => pid !== P.mate), 'second seat');
  return { ok: true };
}
// the three ways in (cost: what it takes out of your winnings)
export function setupEntries(w) {
  const old = w.teams[w.prev], mate = w.people[w.teams[w.player.team].drivers.find(d => d !== 'P')];
  return [
    { key: 'fresh', name: 'Start from nothing', cost: 0, level: 'Hardest', blurb: 'A rented lock-up, a series license, and all of your money. You buy your own car and pick your own people.',
      gets: ['Rented lock-up', w.car ? `Your ${w.car.year} ${w.car.name}` : 'No car: the classifieds', 'No staff', 'All your money'] },
    w.again && old && old.id === w.again.fid
      ? { key: 'takeover', name: `Take back ${old.name}`, cost: 28000, level: 'Middling', blurb: `Your old team. The liquidators still have what the bank didn't want: ${w.prevCar ? `the ${w.prevCar.name}` : 'a tired car'}, the lease on the unit, the tools${mate && mate.id === w.again.mate ? `, and ${mate.first}, who says they'll give it another go` : ''}.`,
        gets: ['Industrial unit', 'Proper tools', w.prevCar ? `The ${w.prevCar.name} (yours, tired)` : 'A car (tired)', mate ? (mate.id === w.again.mate ? `${mate.first} ${mate.last}, again` : `${mate.first} ${mate.last}`) : 'No driver'] } :
    { key: 'takeover', name: `Take over ${old ? old.name : 'the old team'}`, cost: 28000, level: 'Middling', blurb: `${old ? old.name : 'The team whose entry you bought'} folded after ten seasons. The liquidators will sell you what's left: a tired car, the lease on their unit, their tools, and ${mate ? mate.first : 'a driver'}, still under contract.`,
      gets: ['Industrial unit', 'Proper tools', 'Their car (tired)', mate ? `${mate.first} ${mate.last}, under contract` : 'Their driver'] },
    { key: 'running', name: 'Buy a running team', cost: 100000, level: 'Easiest', blurb: 'A small team that wants out, with everything working: a good car with a season of development, a unit with a lift and a sim rig, and a chief mechanic.',
      gets: ['Industrial unit', 'Lift and engine hoist', 'Sim rig', 'A good, developed car', 'A three-star chief mechanic'] },
  ];
}
export function setupEntry(w, key) {
  const S = w.setup, e = setupEntries(w).find(x => x.key === key); if (!S || S.entry || !e) return { ok: false, why: 'Already chosen.' };
  if (w.money.balance < e.cost) return { ok: false, why: `That takes ${money$(e.cost)}. You have ${money$(w.money.balance)}.` };
  const t = myTeam(w); S.entry = key;
  if (e.cost) pay(w, -e.cost, `${e.name}`);
  if (key !== 'fresh') {
    if (w.car) { const v = tradeIn(w); if (v) pay(w, v, `Trade-in: ${w.car.year} ${w.car.name}`); w.car = null; } // (the car it comes with replaces one you'd bought)
    t.fac = { base: 1, tools: key === 'running' ? 2 : 1, ...(key === 'running' ? { sim: 1 } : {}) };
    const cars = adCars(w), c = cars[Math.floor(rng(w) * cars.length)], cls = seriesById(w.player.series).cls;
    // (taking back your own old team: your old car, as the liquidators left it)
    if (key === 'takeover' && w.again && w.prevCar) { w.car = { ...w.prevCar, cond: 0.6, parts: null }; w.prevCar = null; w.founding.car = true; carParts(w); }
    else if (c) { w.car = { chassis: c.key, name: c.name, cls, cond: key === 'running' ? 0.92 : 0.6, paid: Math.round(c.value * (key === 'running' ? 0.9 : 0.5)), year: adYear(w, c.key) }; w.founding.car = true; carParts(w);
      if (key === 'running') w.car.dev = { power: 0.003, grip: 0.002, downforce: 0.01, brake: 0.006, rel: 0.1 }; }
    if (key === 'running') { const m = staffPerson(w, 'mechanic', 3); m.cv = 'Came with the team. Knows where everything is.'; w.staff.push(m); }
  }
  return { ok: true };
}
export function setupCar(w, adId) { if (!buyCar(w, adId, true)) return { ok: false, why: 'That car has gone.' }; return { ok: true }; }
export function setupSponsor(w, i) {
  const S = w.setup, o = S && S.sponsors[i]; if (!o || S.sponsored) return { ok: false, why: 'Already chosen.' };
  const sp = sponsorById(o.sid); S.sponsored = o.sid;
  dealsOf(w).push({ sid: o.sid, slot: 'title', fee: o.fee, bonus: o.bonus, met: 0, misses: 0, since: w.year, obj: null, patience: o.patience });
  if (o.signing) pay(w, o.signing, `${sp.name}: signing bonus`);
  mail(w, sp.name, sponsorAddr(sp.name), 'Welcome aboard', [`We're delighted. Our name goes on the car from the first round.`, `${money$(o.fee)} a round, and ${money$(o.bonus)} more each time you meet the target we set for that race. ${o.brand ? o.brand + '.' : ''}`, sp.name], { read: true }); // (you just signed it in the setup)
  return { ok: true };
}
export function setupMate(w, pid) {
  const S = w.setup; if (!S || S.mateDone || !S.drivers.includes(pid)) return { ok: false, why: 'Already chosen.' };
  const T = w.teams[w.player.team], p = w.people[pid];
  for (const d of T.drivers.filter(d => d !== 'P' && d !== pid)) { const q = w.people[d]; T.drivers = T.drivers.filter(x => x !== d); if (q) { q.team = null; q.series = T.series; } }
  if (!T.drivers.includes(pid)) { if (p.team) { const from = w.teams[p.team]; from.drivers = from.drivers.filter(x => x !== pid); } p.team = T.id; p.series = T.series; T.drivers.push(pid); }
  const a = askOf(w, p), kept = S.entry === 'takeover' && pid === S.inherited; // (the old team's driver, on the contract they had)
  w.mate = { pid, wage: kept ? Math.round(a.wage * 0.8 / 50) * 50 : a.wage, fee: a.fee, until: w.year, pay: 'full', owed: 0, morale: kept ? 60 : 70 };
  if (a.fee) {
    pay(w, a.fee, `${p.last} ${p.biz || 'family'}: seat money for ${p.first}`);
    mail(w, `Gordon ${p.last}`, `gordon@${p.last.toLowerCase()}${(p.biz || 'family').split(' ')[0].toLowerCase()}.sv`, `${p.first}'s seat`,
      [`Hello,`, `Please find enclosed ${money$(a.fee)} for ${p.first}'s seat in your team, as discussed with ${p.first}, who discussed it with me afterwards.`,
       `${p.first} tells me they are very fast. I have never seen them drive, because I am busy running ${p.last} ${p.biz || 'Holdings'}, the third largest name in ${(p.biz || 'holdings').toLowerCase()} in the province.`,
       `Please put our name on the car somewhere tasteful.`, `Gordon ${p.last}`]);
  }
  S.mateDone = true;
  return { ok: true };
}
// done: the Wire hears about it
export function setupFinish(w) {
  const S = w.setup; if (!S || S.done) return;
  S.done = true; S.step = 5;
  const t = myTeam(w), mate = mateOf(w), sp = dealsOf(w).find(d => d.slot === 'title');
  if (!w.again) {
    seasonOpenNews(w, [], true);
    texts(w, 'Danny', [`Yo. Saw the lottery thing on the news. Congrats dude, for real`, `Also saw the divorce thing on the news. Less congrats`,
      ...(w.car ? [`${w.car.name} though. Nice`] : []), `Ps I could be your team manager. I've managed a team before (fantasy football, 2nd place)`]);
  }
  news(w, `NEW TEAM: ${t.name.toUpperCase()}`, `${t.name}, owned and driven by lottery winner ${w.player.name}, enters the ${seriesById(w.player.series).name}${sp ? ` with backing from ${sponsorById(sp.sid).name}` : ''}${mate ? `. ${nameOf(w.people[mate.pid])} drives the second car` : ''}.`);
}

// ---------------- moving up: each series' way in ----------------
// Every series says how you get a car for it (SERIES[].car). The Street Cup races road cars off the classifieds. GT
// races homologated cars, sold and leased by the makers' customer racing programmes (or an ex-works chassis, a season
// old, from a team in the series). Formula SV races one chassis, leased from the series. Moving up, your old car is
// traded in (or a lease handed back). The cars of each class come from main.js (setCarCatalog: { cls: [{ key, name,
// hp, kg }] }); a new series is a line in SERIES, its costs (COSTS, SEASON_FUND) and its cars.
export function setCarCatalog(w, cat) { w.carCat = cat; }
export const carClsOf = (w) => w.car ? (w.car.cls || 'street') : null;
// no car, or a car for the wrong series (you've moved up)
export const needsCar = (w) => !w.car || carClsOf(w) !== seriesById(w.player.series).cls;
// the series you're getting a car for: the one you're moving up to, else your own
export const carSeries = (w) => seriesById(w.player.offer?.answer === 'move' ? w.player.offer.to : w.player.series);
const hashOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const makerOf = (name) => name.split(/\s+/)[0];
// what the programme says about it (and how reliable it really is: a fault multiplier, 0.8-1.25)
const PROG_NOTES = [[0.85, 'Bulletproof, by GT standards. The customer teams love it.'], [0.95, 'Reliable, if you look after it.'], [1.05, 'Strong, once it is set up. Needs a good mechanic.'], [1.2, 'Fast, and fragile. Budget for engines.']];
// the cars a series' programme offers you: [{ key, name, hp, kg, maker, prog, price, deposit, perRound, rel, note, lease, buy }]
export function customerCars(w, S = carSeries(w)) {
  if (!S || S.car === 'classifieds') return [];
  const cars = (w.carCat && w.carCat[S.cls]) || [], L = w.opts.len;
  const pw = cars.map(c => c.hp / c.kg), lo = Math.min(...pw), hi = Math.max(...pw);
  return cars.map((c, i) => {
    const f = hi > lo ? (pw[i] - lo) / (hi - lo) : 0.5, h = hashOf(c.key) % 1000 / 1000;
    const price = Math.round((S.price[0] + (S.price[1] - S.price[0]) * (f * 0.6 + h * 0.4)) / 5000) * 5000;
    const rel = +(0.8 + h * 0.45).toFixed(2), note = PROG_NOTES.find(([k]) => rel <= k)?.[1] || PROG_NOTES.at(-1)[1];
    const spec = S.car === 'spec';
    return { ...c, maker: makerOf(c.name), prog: spec ? `${S.name} Technical` : `${makerOf(c.name)} Customer Racing`, price, rel, note: spec ? 'The series chassis. Everyone has the same one, in theory.' : note,
      deposit: Math.round(price * 0.1 / 1000) * 1000, perRound: Math.round(price * (spec ? 0.24 : 0.36) / L / 500) * 500, buy: !spec, lease: true }; // (the series' own chassis: leased cheaper, it's how they fill the grid)
  });
}
// ex-works cars: a season old, from teams in the series (a fresh pair each season)
export function exWorks(w, S = carSeries(w)) {
  if (!S || S.car !== 'customer') return [];
  if (w.exWorks && w.exWorks.y === w.year && w.exWorks.s === S.id) return w.exWorks.list;
  const cars = customerCars(w, S), teams = w.series[S.id].teams.filter(t => t !== w.player.team);
  const list = [0, 1].map(() => {
    const c = cars[Math.floor(rng(w) * cars.length)], cond = +(0.66 + rng(w) * 0.18).toFixed(2), t = w.teams[teams[Math.floor(rng(w) * teams.length)]];
    return c && { id: 'xw' + (w.nextId++), key: c.key, name: c.name, prog: c.prog, rel: c.rel, cond, team: t ? t.name : 'a customer team', year: w.year - 1, price: Math.round(c.price * (0.3 + cond * 0.3) / 5000) * 5000 };
  }).filter(Boolean);
  w.exWorks = { y: w.year, s: S.id, list };
  return list;
}
// what your car's worth to a dealer (a lease: nothing, it goes back)
export function tradeIn(w) {
  if (!w.car || w.car.lease) return 0;
  const P = carParts(w), avg = P ? PART_KEYS.reduce((a, k) => a + P[k].cond, 0) / PART_KEYS.length : (w.car.cond ?? 0.8);
  return Math.round((w.car.paid || 0) * (0.3 + 0.4 * avg) / 500) * 500;
}
// a lease handed back: the deposit, less what it'll cost them to put right
const depositBack = (w) => { const l = w.car?.lease; if (!l) return 0; const P = carParts(w), avg = P ? PART_KEYS.reduce((a, k) => a + P[k].cond, 0) / PART_KEYS.length : 0.8; return Math.round(l.deposit * clamp(1 - Math.max(0, 0.8 - avg) * 2, 0, 1) / 100) * 100; };
// get a car: how 'buy' | 'lease' (a programme's car, by key) | 'used' (an ex-works car, by id). The old one goes.
export function acquireCar(w, how, id) {
  const S = carSeries(w), c = how === 'used' ? exWorks(w, S).find(x => x.id === id) : customerCars(w, S).find(x => x.key === id);
  if (!c || (how === 'buy' && !c.buy)) return false;
  const old = w.car;
  if (old) {
    if (old.lease) { const back = depositBack(w); if (back) pay(w, back, `${old.lease.prog}: lease deposit returned (${old.name})`); }
    else { const v = tradeIn(w); if (v) pay(w, v, `Trade-in: ${old.year} ${old.name}`); }
  }
  const cond = how === 'used' ? c.cond : 1, prog = c.prog;
  w.car = { chassis: c.key, name: c.name, cls: S.cls, cond, paid: how === 'lease' ? 0 : c.price, year: how === 'used' ? c.year : w.year, rel: c.rel, prog,
    lease: how === 'lease' ? { prog, deposit: c.deposit, perRound: c.perRound, since: w.year } : null, from: how === 'used' ? c.team : null };
  w.founding = { ...(w.founding || {}), car: true };
  if (how === 'used') w.exWorks.list = w.exWorks.list.filter(x => x !== c);
  carParts(w); refreshUsedParts(w);
  if (how === 'lease') pay(w, -c.deposit, `${prog}: lease deposit (${c.name})`);
  else pay(w, -c.price, how === 'used' ? `${c.name}, ex-${c.team}` : `${prog}: new ${c.name}`);
  const addr = `customer@${c.maker ? c.maker.toLowerCase().replace(/[^a-z]/g, '') : 'formulasv'}racing.sv`;
  if (how === 'used') mail(w, c.team, `${c.team.toLowerCase().replace(/[^a-z]+/g, '')}@paddock.sv`, `Chassis ${c.id.slice(2)}`,
    [`It's yours. Logbook in the glovebox, setup sheets in the boot.`, `She's done a season with us. Don't believe anything the previous driver wrote on the setup sheets.`, c.team]);
  else mail(w, prog, addr, `Welcome to ${prog}`,
    [`Dear ${w.player.name.split(' ')[0]},`, how === 'lease' ? `Your ${c.name} is leased to ${w.teams[w.player.team].name} for the ${w.year} season: ${money$(c.perRound)} a round, taken with your entry. The engine and gearbox stay ours: we rebuild them between rounds.` : `Your new ${c.name} is ready for collection. It is yours: so is everything that happens to it.`,
     `Crash damage is the customer's. ${c.note}`, prog]);
  react(w, 'danny', `The player just ${how === 'lease' ? 'leased' : 'bought'} a ${c.name}${how === 'used' ? ` (a season old, from ${c.team})` : ''} for their move up to the ${S.name}${old ? `, and the ${old.name} they raced before ${old.lease ? 'went back' : 'was traded in'}` : ''}.`);
  return true;
}
// the series office's numbers for a season (the promotion email, the programme's page): what it costs to run a car,
// the cheapest car, and what a mid-field team gets back
export function seasonBudget(w, S) {
  const c = COSTS[S.id], L = w.opts.len, cars = customerCars(w, S);
  const run = L * (c.entry + c.travel + c.crew + c.tyre * 3 + c.fuelLap * 30);
  const lease = cars.length ? Math.min(...cars.map(x => x.deposit + x.perRound * L)) : 0, buy = cars.filter(x => x.buy).length ? Math.min(...cars.filter(x => x.buy).map(x => x.price)) : 0;
  return { run, lease, buy, prize: L * (c.prize[5] || 0) + (fundOf(w, S.id)[5] || 0) };
}

// you've moved up into a series that buys its cars second-hand: Danny's been looking
function adsMail(w) {
  const S = seriesById(w.player.series), cheap = Math.min(...(w.ads || []).map(a => a.price));
  mail(w, 'Danny', 'dannyboy1979@coolmail.sv', 'cars for the new series',
    [`Yo the ${S.name} is a big deal dude`, `Your ${w.car ? w.car.name : 'car'} won't cut it there. I looked on the classifieds, cheapest one's ${money$(cheap)}`, `Sell the old one when you buy, the dealer gives you something for it. Not much`],
    { link: ['classifieds', 'Open the classifieds'] });
}
// you've moved up: where the cars are
function carsMail(w) {
  const S = seriesById(w.player.series), b = seasonBudget(w, S);
  mail(w, `${S.name} Entries`, addrOf(S, 'entries'), `Your ${w.year} entry: the car`,
    [`Welcome to the ${S.name}.`, S.car === 'spec' ? `Every team races the series chassis, leased from us for the season (from ${money$(b.lease)}).` : `Cars must be homologated for the ${S.name}. The makers' customer racing programs sell and lease them (a lease from ${money$(b.lease)} a season, or from ${money$(b.buy)} to buy), and teams sometimes sell last year's cars.`,
     w.car ? `Your ${w.car.name} is not eligible. Most dealers will take it in part exchange.` : '', `Entries Office, ${S.name}`].filter(Boolean),
    { link: ['customer', 'See the cars'] });
}

// ---------------- GT: balance of performance and success ballast ----------------
// The series evens the cars out each season (a few kilos here, a restrictor there: w.bop), and puts weight on whoever
// is winning (w.ballast, kg: +30 for a win, +20 second, +10 third, 10 off for anything else, 60 at most).
const BALLAST = [30, 20, 10], BALLAST_MAX = 60;
export const ballastOf = (w) => seriesById(w.player.series).ballast ? (w.ballast || 0) : 0;
export const bopOf = (w) => (seriesById(w.player.series).ballast && w.car && w.bop && w.bop.y === w.year && typeof w.bop.k[w.car.chassis] === 'number' && w.bop.k[w.car.chassis]) || 1;
// kilos as a power factor (0.06% a kilo, on a car of about 1100 kg), and back
const kgOf = (f) => Math.round((1 - f) / 0.0006 / 5) * 5;
// The Street Cup's balance of performance (SERIES[].bop): an air restrictor (power) and ballast (in the physics, grip;
// written as the kilos it's worth) for every street car, from clean laps of each across the circuits
// (.devtest/carspread.mjs): over a season they're within about half a percent, the pricier cars a shade quicker, and
// each still has its circuits (it's the season that's even, not every race). A little moves each season. It's every
// car's, yours and the AI's alike (bopTable -> race.js edgeFor), so your own development still counts.
// { chassis: [power, grip] }
const BOP_BASE = {
  // (measured 2026-10-06 on the six preset circuits: 4.5% from first to last before, 1.1% after, each car quickest
  // somewhere. Remeasure when a street car is added or its spec changes)
  street: { testarossa: [0.93, 0.977], jsport: [0.988, 0.99], rs964: [1.1, 1.04], mustang: [1.1, 1.05], m5: [1.012, 1], r34: [0.943, 0.982],
    // (2026-10-24, the five real street cars: unbalanced they were +1.3 to +1.9% off the quickest, the M5's band (+1.9,
    // near neutral), so near-neutral figures, the pricier a shade quicker; the per-circuit trim does the rest. The Kaze
    // and Pony GT are retired, their figures kept for saves partway through a season)
    supra: [1.012, 1], nsx: [1.01, 1], rx7fd: [1, 1], corvettec4: [0.995, 1], p944turbo: [0.985, 0.997] },
};
const BOP_V = 2; // (2: the season's figures plus a trim at each circuit, race.js trimBop)
const bopKg = (g) => Math.round((1 - g) / 0.0004 / 5) * 5; // (1% of grip written as 25 kg: about what the weight costs these cars)
// a car's [power, grip] under its series' rules this season (GT: power only, as before)
export function bopFor(w, key, sid = w.player.series) {
  const S = seriesById(sid); if (!S || !key) return [1, 1];
  if (S.bop && S.id !== w.player.series) return BOP_BASE[S.id]?.[key] || [1, 1]; // (a series you're not in: its base figures)
  if (S.bop) { bopSeason(w, S); const v = w.bop.k[key]; return Array.isArray(v) ? v : [1, 1]; }
  if (S.ballast && w.bop && w.bop.y === w.year && typeof w.bop.k[key] === 'number') return [w.bop.k[key], 1];
  return [1, 1];
}
// the whole field's, for the race: { chassis: [power, grip] } (null: no balance of performance here)
export function bopTable(w, keys) {
  const S = seriesById(w.player.series); if (!S || !(S.bop || S.ballast)) return null;
  return Object.fromEntries(keys.map(k => [k, bopFor(w, k)]));
}
// what a car's figures say, as the bulletin and the classifieds put it: 'air restrictor (3% less power), 40 kg of ballast'
export function bopWords(f) {
  const [p, g] = f || [1, 1], kg = bopKg(g), pc = Math.round((1 - p) * 1000) / 10, out = [];
  if (pc > 0) out.push(`air restrictor (${pc}% less power)`); else if (pc < 0) out.push(`restrictor opened (${-pc}% more power)`);
  if (kg > 0) out.push(`${kg} kg of ballast`); else if (kg < 0) out.push(`minimum weight lowered by ${-kg} kg`);
  return out.length ? out.join(', ') : 'unchanged';
}
// the season's Street Cup figures (made once a season, or the first time a save without them needs them)
function bopSeason(w, S) {
  if (w.bop && w.bop.y === w.year && w.bop.sid === S.id && w.bop.v === BOP_V) return;
  const revised = !!(w.bop && w.bop.y === w.year && w.bop.sid === S.id); // (this season's, from an older version of the rules)
  const base = BOP_BASE[S.id] || {}, mid = !w.pre && w.round > 0; // (mid: a save from before it, partway through a season)
  w.bop = { y: w.year, sid: S.id, v: BOP_V, k: Object.fromEntries(Object.entries(base).map(([k, [p, g]]) => [k, [+(p * clamp(1 + gauss(w) * 0.006, 0.985, 1.015)).toFixed(4), g]])) };
  if (w.pre || !w.money || w.player.series !== S.id || (w.player.offer?.answer === 'move' && w.player.offer.to !== S.id)) return; // (the bulletin goes to the series' own teams: not to one leaving it)
  const names = Object.fromEntries((w.streetCars || []).map(c => [c.key, c.name]));
  mail(w, `${S.name} Technical`, addrOf(S, 'technical'), `Technical Bulletin ${w.year}-${mid ? String(w.round + 1).padStart(2, '0') : '01'}: balance of performance`,
    [`To all competitors,`, revised ? `Following further complaints, and an independent review that found the previous figures had been worked out at the wrong circuits, the balance of performance is revised from round ${w.round + 1}:` : mid ? `Following a number of complaints, some of them from the same competitor, the ${S.name} will balance the performance of its cars from round ${w.round + 1}:` : `Following analysis of last season's data, the balance of performance for ${w.year} is as follows:`,
     ...Object.keys(w.bop.k).filter(k => names[k]).map(k => `${names[k]}: ${bopWords(w.bop.k[k])}.`),
     `These are the season's figures. Each car's ballast is also adjusted at every circuit, so no car is more than about a percent quicker than the rest anywhere it suits.`,
     `Teams are reminded that the balance of performance applies to the car as delivered. What you do to it afterwards is your own business, within the rules.`, `${S.name} Technical Department`]);
}
function seasonBop(w) {
  const S = seriesById(w.player.series);
  if (S.bop) { bopSeason(w, S); return; }
  if (!S.ballast) return;
  const cars = (w.carCat && w.carCat[S.cls]) || [];
  w.bop = { y: w.year, k: Object.fromEntries(cars.map(c => [c.key, +clamp(1 + gauss(w) * 0.012, 0.975, 1.02).toFixed(4)])) };
  w.ballast = 0;
  const line = (c) => { const kg = kgOf(w.bop.k[c.key]); return kg > 0 ? `${c.name}: ${kg} kg added.` : kg < 0 ? `${c.name}: air restrictor enlarged (worth about ${-kg} kg).` : `${c.name}: unchanged.`; };
  mail(w, `${S.name} Technical`, addrOf(S, 'technical'), `Technical Bulletin ${w.year}-01: balance of performance`,
    [`To all competitors,`, `Following analysis of last season's data, the balance of performance for ${w.year} is as follows:`, ...cars.map(line),
     `Success ballast applies from round 2: ${BALLAST[0]} kg for a win, ${BALLAST[1]} kg for second, ${BALLAST[2]} kg for third, removed at 10 kg a round, to a maximum of ${BALLAST_MAX} kg.`, `These figures are final until they are changed.`, `${S.name} Technical Department`]);
}
function ballastRound(w, me) {
  const S = seriesById(w.player.series); if (!S.ballast || w.round + 1 >= w.opts.len) return;
  const was = w.ballast || 0, add = me && !me.dnf ? BALLAST[me.pos - 1] || -10 : -10;
  w.ballast = clamp(was + add, 0, BALLAST_MAX);
  if (w.ballast === was) return;
  mail(w, `${S.name} Technical`, addrOf(S, 'technical'), `Technical Bulletin ${w.year}-${String(w.round + 2).padStart(2, '0')}: success ballast`,
    [`To ${w.teams[w.player.team].name},`, w.ballast > was ? `Following your result at ${w.series[S.id].cal[w.round].name}, your car will carry ${w.ballast} kg of success ballast at the next round.` : w.ballast ? `Your success ballast is reduced to ${w.ballast} kg for the next round.` : `Your car will carry no success ballast at the next round.`,
     w.ballast > was ? `Congratulations.` : `${S.name} Technical Department`].concat(w.ballast > was ? [`${S.name} Technical Department`] : []));
}

// ---------------- gentleman drivers ----------------
// From GT up, the second car is paid for by someone who'd like to race and can afford to: a lot of money for the seat,
// not a lot of pace. Two get in touch at the start of each season (and when you move up).
const GENTS = [
  ['owns eleven car washes', 'I own eleven car washes, so I know a thing or two about cars.'],
  ['is an orthodontist', 'My practice is closed on Fridays and I can move my Mondays.'],
  ['is in commercial property', 'I have done a great deal of track days in my own car, which is the same as yours, but red.'],
  ['is heir to a frozen food fortune', 'My father has agreed to fund one season, after which, he says, we will see.'],
  ['is a retired anaesthetist', 'I am told I have very calm hands.'],
  ['owns a chain of tanning salons', 'I have been racing in my head for thirty years. I feel ready.'],
  ['sells yachts', 'I would like to be quick. Failing that, I would like to be photographed.'],
];
function gentOffers(w) {
  const S = seriesById(w.player.series); if (!S.gents || !w.money || w.coop) return;
  const K = { gt2: 0.5, gt: 1, groupc: 2, formula: 4 }[S.id] || 1, L = w.opts.len;
  for (const [biz, line] of GENTS.slice().sort(() => rng(w) - 0.5).slice(0, 2)) {
    const age = r0(44 + rng(w) * 14), p = makePerson(w, { age, series: S.id, lvl: S.base - 15 });
    p.traits = ['paydriver', 'gentleman']; p.retireAge = age + 4; p.biz = biz; p.pot = p.pace;
    p.purse = Math.round((135000 + rng(w) * 100000) * K * L / 6 / 5000) * 5000;
    mail(w, `${p.first} ${p.last}`, `${p.first[0].toLowerCase()}${p.last.toLowerCase()}@${pickLine(w, ['velocitamail', 'privatemail', 'goldline'])}.sv`, `Your second car`,
      [`Dear ${w.player.name.split(' ')[0]},`, `I understand you have a second car in the ${S.name}. ${line}`, `I would pay ${money$(p.purse)} for the seat for the ${w.year} season.`, `I have my own helmet.`, `${p.first} ${p.last}`],
      { gent: p.id, choices: [['sign', `Sign ${p.first}: ${money$(p.purse)}`], ['no', 'No thanks']] });
  }
}
export function answerGent(w, m, key) {
  if (key !== 'sign') return 'declined';
  const p = w.people[m.gent]; if (!p || p.team) return 'gone';
  const r = offerDriver(w, p.id);
  return r.ok ? 'signed' : r.why;
}

// ---------------- the second seat, and the season setup (series with seats) ----------------
// At the start of every season in a series with seats (SERIES[].seats), the season setup (the Team Setup's screen,
// w.setup.kind 'season'): a car if you need one, the second seat (one deal of each kind the series does), a title
// sponsor if you've just moved up, then the lights. Every deal pays its way differently:
//   gent: a wealthy amateur pays for the seat, a round at a time. Slow, crashes more (you pay for car 2), takes a day
//         of your week for coaching, and might walk after a big one (and the money with him)
//   pro: a real driver on a wage: points, car 2's prize money, the teams' championship
//   share: two amateurs taking turns: a little more in total, and one walking out doesn't take it all
//   junior: a maker places a young driver and pays a stipend; miss their target three times and they're taken back
export const SEAT_KINDS = {
  gent: { name: 'Gentleman driver', tag: 'Pays for the seat', blurb: 'A wealthy amateur pays for the seat, a round at a time. Slow, crashes more (you pay for the repairs), wants a day of your week for coaching, and might walk after a big one.' },
  pro: { name: 'Pro driver', tag: 'Scores points', blurb: 'A proper driver, on a wage. Points for the teams\' championship, prize money for the second car, and a better shot at moving up as a team.' },
  share: { name: 'Two gentlemen, sharing', tag: 'Steadier money', blurb: 'Two amateurs take turns in the car. A little more money in total, and if one walks the other is still paying. Each wants coaching on their weekends.' },
  junior: { name: "Maker's junior", tag: 'Free, with a target', blurb: 'A car maker places one of its young drivers with you, and pays you to run them. They have a target every round: miss it three times and the maker takes them back.' },
};
const SEAT_K = { gt2: 0.5, gt: 1, groupc: 1.8, formula: 3 }; // (the money in a second seat, by series: GT's numbers times this)
const seatK = (w, sid = w.player.series) => (SEAT_K[sid] ?? KS(w)) * w.opts.len / 6;
const JUNIOR_TOP = 8; // (the junior's target: finish in the top this many)
function makeGent(w, sid, share = 1) {
  const S = seriesById(sid), [biz, line] = pickLine(w, GENTS), age = r0(44 + rng(w) * 14), p = makePerson(w, { age, series: sid, lvl: S.base - 15 });
  p.traits = ['paydriver', 'gentleman']; p.retireAge = age + 4; p.biz = biz; p.line = line; p.pot = p.pace; p.cons = clamp(p.cons - 15, 20, 60);
  p.purse = Math.round((60000 + rng(w) * 35000) * share * seatK(w, sid) / 5000) * 5000;
  return p;
}
// the deals on offer this season (made once, kept in the setup): [{ kind, pids, per (money a round: + to you), wage, maker }]
function seatDeals(w) {
  const S = seriesById(w.player.series), L = w.opts.len, out = [];
  for (const kind of S.seats || []) {
    if (kind === 'gent') { const p = makeGent(w, S.id); out.push({ kind, pids: [p.id], per: Math.round(p.purse / L / 50) * 50, wage: 0 }); }
    if (kind === 'share') { const a = makeGent(w, S.id, 0.58), b = makeGent(w, S.id, 0.58); out.push({ kind, pids: [a.id, b.id], per: Math.round((a.purse + b.purse) / L / 50) * 50, wage: 0 }); }
    if (kind === 'pro') {
      const free = Object.values(w.people).filter(p => !p.retired && !p.team && ageOf(w, p) < 38 && !traitsOf(w, p).some(t => t === 'gentleman' || t === 'paydriver') && grudgeOf(w, p.id) < 3).sort((a, b) => b.pace - a.pace);
      const p = free[0] && free[0].pace >= S.base - 2 ? free[0] : makePerson(w, { age: r0(24 + rng(w) * 8), series: S.id, lvl: S.base + 2 });
      out.push({ kind, pids: [p.id], per: 0, wage: askOf(w, p).wage });
    }
    if (kind === 'junior') {
      const makers = [...new Set(customerCars(w, S).map(c => c.maker))], maker = makers.length ? pickLine(w, makers) : S.name;
      const p = makePerson(w, { age: r0(18 + rng(w) * 3), series: S.id, lvl: S.base - 3 }); p.pot = clamp(p.pace + 12 + rng(w) * 8, 0, 99); p.maker = maker;
      out.push({ kind, pids: [p.id], per: Math.round(2000 * KS(w) / 50) * 50, wage: 0, maker });
    }
  }
  return out;
}
// three title sponsors for a series you've just moved up to (the series' money, your reputation)
function seasonSponsors(w) {
  const K = SPONSOR_K[w.player.series] || 1, rep = repOf(w);
  const pool = SPONSOR_POOL.map((x, i) => sponsorById('sp' + i)).filter(sp => sp.rep <= rep + 10 && sp.rep < 999 && !sp.town && !SHADY.includes(sp.name)).sort((a, b) => b.rep - a.rep + (rng(w) - 0.5) * 20).slice(0, 3);
  const shapes = [{ k: 1.3, sign: 1, pat: -1, tag: 'Big money, impatient' }, { k: 1, sign: 2, pat: 0, tag: 'Steady' }, { k: 0.75, sign: 4, pat: 2, tag: 'Patient, big signing bonus' }];
  // (and in a series where companies buy hospitality: a big one that pays the most, for a day of your week, every week)
  if (seriesById(w.player.series).hosp) { const corp = SPONSOR_POOL.map((x, i) => sponsorById('sp' + i)).filter(sp => !pool.some(x => x.id === sp.id) && sp.rep <= rep + 10 && sp.rep < 999 && !sp.town && !SHADY.includes(sp.name)).sort((a, b) => b.fee - a.fee)[0];
    if (corp) { pool.push(corp); shapes.push({ k: 1.3, sign: 0, pat: 0, tag: 'Hospitality', hosp: true }); } }
  // (one base for all of them, so the deal's shape is what differs, not which company it is)
  const base = pool.slice(0, 3).reduce((a, sp) => a + sp.fee, 0) / Math.max(1, Math.min(3, pool.length));
  return pool.map((sp, i) => { const sh = shapes[i], fee = Math.round(base * K * sh.k * (0.95 + rng(w) * 0.1) / 50) * 50;
    return { sid: sp.id, fee, bonus: Math.round(fee * 0.6 / 50) * 50, signing: Math.round(fee * sh.sign / 100) * 100, patience: clamp(sp.patience + sh.pat, 1, 6), tag: sh.tag, hosp: !!sh.hosp, brand: BRAND[sp.wants[0]] || '' }; })
    // (hospitality always pays the most: it's paying for a day of your week as well)
    .map((o, i, all) => { if (!o.hosp) return o; const top = Math.max(...all.filter(x => !x.hosp).map(x => x.fee)), fee = Math.max(o.fee, Math.round(top * 1.15 / 50) * 50); return { ...o, fee, bonus: Math.round(fee * 0.6 / 50) * 50 }; });
}
// the cars, when you need one: two leases (the cheapest, the quickest), last year's car from a team, the cheapest to buy
export function seasonCars(w) {
  const S = seriesById(w.player.series);
  // (off the classifieds: every listing, cheapest first; the old car goes in part exchange)
  if (S.car === 'classifieds') return (w.ads || []).map(a => ({ how: 'ad', id: a.id, c: a }));
  const C = customerCars(w, S), byPrice = C.slice().sort((a, b) => a.price - b.price), quick = C.slice().sort((a, b) => b.hp / b.kg - a.hp / a.kg)[0], X = exWorks(w, S);
  const out = [];
  if (byPrice[0]) out.push({ how: 'lease', id: byPrice[0].key, c: byPrice[0] });
  if (quick && quick !== byPrice[0]) out.push({ how: 'lease', id: quick.key, c: quick });
  if (X[0]) out.push({ how: 'used', id: X[0].id, c: X[0] });
  const buy = byPrice.find(c => c.buy); if (buy) out.push({ how: 'buy', id: buy.key, c: buy });
  return out.slice(0, 4);
}
export function newSeasonSetup(w, moved) {
  const cars = needsCar(w) ? seasonCars(w) : [];
  return { kind: 'season', step: 0, at: 0, picks: {}, done: false, moved: !!moved, cars, seats: seatDeals(w), sponsors: moved && !dealsOf(w).some(d => d.slot === 'title') ? seasonSponsors(w) : [] };
}
const carPickOf = (w) => { const v = w.setup.picks.car; return v != null ? w.setup.cars[v] : null; };
// what the car costs today (and what the old one brings): a lease's deposit, or the price
const carToday = (w, o) => o.how === 'lease' ? o.c.deposit : o.c.price;
function seasonBudgetNow(w) {
  const S = w.setup, P = S.picks, rows = [];
  const o = carPickOf(w); if (o) { rows.push([o.how === 'ad' ? `${o.c.year} ${o.c.name} (from ${o.c.seller})` : `${o.c.name} (${o.how === 'lease' ? 'lease deposit' : o.how === 'used' ? 'ex-works' : 'new'})`, -carToday(w, o)]); const old = w.car && !w.car.lease ? tradeIn(w) : w.car?.lease ? depositBack(w) : 0; if (old) rows.push([w.car.lease ? 'Old lease: deposit back' : `Trade-in: ${w.car.name}`, old]); }
  const m2 = P.car2 && car2Models(w).find(c => c.key === P.car2); if (m2) { rows.push([`Car 2: a ${m2.name} (${coopPerson(w).first}'s pick)`, -m2.price]); if (car2Sale(w)) rows.push([`Car 2 sold (${w.car2.name})`, car2Sale(w)]); }
  const sp = P.sponsor != null && S.sponsors[P.sponsor]; if (sp && sp.signing) rows.push([`${sponsorById(sp.sid).name}: signing bonus`, sp.signing]);
  return { rows, after: w.money.balance + rows.reduce((a, r) => a + r[1], 0), season: seasonRoughly(w) };
}
// the season with these choices, before prize money: what's certain once it's signed (the running costs, the lease, the
// staff, the sponsors' fees, the seat deal). Prize money is what your racing decides, so it isn't guessed at here.
export function seasonRoughly(w, picks = w.setup?.picks || {}) {
  const S = w.setup, sid = w.player.series, c = COSTS[sid], L = w.opts.len, rows = [];
  rows.push(['Running the cars', -L * (c.entry + Math.round(c.travel * staffEffects(w).travel * (facLevel(myTeam(w), 'truck') ? 0.65 : 1)) + c.crew + c.tyre * 2 + c.fuelLap * 30)]);
  const o = picks.car != null ? S.cars[picks.car] : null, lease = o && o.how === 'lease' ? o.c.perRound * L : !o && w.car?.lease ? w.car.lease.perRound * L : 0;
  if (lease) rows.push(['Car lease', -lease]);
  { const W = worksOf(w), name = o ? o.c.name : w.car?.name; if (W && worksCar(w, name)) rows.push([`${W.maker} works support`, W.per * L]); }
  const pay = (w.staff || []).reduce((a, x) => a + wageNow(w, x), 0) * L + facUpkeep(myTeam(w)) * L; if (pay) rows.push(['Staff and premises', -pay]);
  const sp = picks.sponsor != null ? S.sponsors[picks.sponsor] : null, fees = (sp ? sp.fee : 0) + dealsOf(w).filter(d => !d.shady).reduce((a, d) => a + d.fee, 0);
  if (fees) rows.push(['Sponsors (fees)', fees * L]);
  const d = picks.seat != null ? S.seats[picks.seat] : null;
  if (d && d.per) rows.push([d.kind === 'junior' ? `${d.maker}: junior stipend` : 'Seat money', d.per * L]);
  if (d && d.wage) rows.push(['Driver wage', -d.wage * L]);
  return { rows, net: rows.reduce((a, r) => a + r[1], 0) };
}
function seasonApply(w) {
  const S = w.setup, P = S.picks; if (S.done) return { ok: false, why: 'Already done.' };
  if (S.cars.length && P.car == null) return { ok: false, why: 'Pick a car.' };
  const seatStep = setupSteps(w).includes('seat');
  if ((P.seat == null && seatStep) || (S.sponsors.length && P.sponsor == null)) return { ok: false, why: 'Something is still to choose.' };
  if (seasonBudgetNow(w).after < 0) return { ok: false, why: `That's more than you have. Go back and change something.` };
  const o = carPickOf(w); if (o && !(o.how === 'ad' ? buyCar(w, o.id, true) : acquireCar(w, o.how, o.id))) return { ok: false, why: 'That car has gone.' };
  if (S.sponsors.length) { S.sponsored = null; const x = S.sponsors[P.sponsor]; dealsOf(w).push({ sid: x.sid, slot: 'title', fee: x.fee, bonus: x.bonus, met: 0, misses: 0, since: w.year, obj: null, patience: x.patience, hosp: x.hosp || undefined }); if (x.signing) pay(w, x.signing, `${sponsorById(x.sid).name}: signing bonus`); }
  if (w.coop) { if (P.roles) setRoles(w, P.roles); if (P.car2) buyCar2Model(w, P.car2); S.done = true; return { ok: true }; } // (the second car is the co-owner's: their pick of model, or the one they had)
  if (!seatStep) { S.done = true; return { ok: true }; } // (no market for the seat here: your teammate's contract carries on)
  const was = teammateOf(w); signSeat(w, S.seats[P.seat]);
  passedOn(w, S.seats.filter((d, i) => i !== P.seat && d.kind !== 'gent' && d.kind !== 'share').flatMap(d => d.pids), 'second seat');
  S.done = true; mateHello(w, [], teammateOf(w) !== was); // (new in the seat, or another year together)
  const t = myTeam(w), d = S.seats[P.seat], q = w.people[d.pids[0]];
  news(w, `${t.name.toUpperCase()}: ${q.first.toUpperCase()} ${q.last.toUpperCase()} IN THE SECOND CAR`, d.kind === 'gent' ? `${nameOf(q)}, who ${q.biz}, joins ${t.name} for the ${w.year} ${seriesById(w.player.series).name}.` : d.kind === 'share' ? `${nameOf(q)} and ${nameOf(w.people[d.pids[1]])} will share ${t.name}'s second car.` : d.kind === 'junior' ? `${d.maker} places its junior ${nameOf(q)} with ${t.name}.` : `${t.name} signs ${nameOf(q)}.`);
  return { ok: true };
}
// the second seat: whoever's in it goes, the deal's driver comes in (a share: the first one; they swap each round)
export function signSeat(w, d) {
  const T = myTeam(w);
  for (const pid of T.drivers.filter(x => x !== 'P')) { const q = w.people[pid]; if (q) q.team = null; }
  const pid = d.pids[0], p = w.people[pid];
  T.drivers = ['P', pid]; p.team = T.id; p.series = w.player.series;
  w.mate = { pid, wage: d.wage, fee: 0, until: w.year, pay: 'full', owed: 0, morale: 75, seat: { kind: d.kind, pids: d.pids.slice(), per: d.per, maker: d.maker || null, misses: 0 } };
  w.payDriver = null;
}
const seatOf = (w) => (w.mate && w.mate.seat) || null;
// a round's money for the second seat (settleRound): seat money or the stipend, car 2's crash, a walk-out, the junior's target
function seatRound(w) {
  const d = seatOf(w); if (!d) return [];
  const items = [], c = COSTS[w.player.series], res = w.series[w.player.series].results.find(x => x.round === w.round), row = res && res.rows.find(r => r.pid === w.mate.pid), p = w.people[w.mate.pid];
  if (d.per && d.kind !== 'junior') items.push([`Seat money: ${p.first} ${p.last}`, d.per]);
  if (d.kind === 'junior') {
    items.push([`${d.maker}: junior program`, d.per]);
    if (row && (row.dnf || row.pos > JUNIOR_TOP)) {
      d.misses++;
      if (d.misses >= 3) { mail(w, `${d.maker} Motorsport`, `juniors@${d.maker.toLowerCase().replace(/[^a-z]/g, '')}.sv`, `${p.first} ${p.last}`, [`${p.first} has missed the target we agreed three times. We're moving ${p.first} to another team, with immediate effect.`, `Thank you for running our driver. The stipend stops this round.`, `${d.maker} Motorsport`]); seatGone(w); }
      else mail(w, `${d.maker} Motorsport`, `juniors@${d.maker.toLowerCase().replace(/[^a-z]/g, '')}.sv`, `${p.first} ${p.last}: round ${w.round + 1}`, [`${p.first} finished ${row.dnf ? 'out of the race' : `P${row.pos}`}. The target is the top ${JUNIOR_TOP}. That's ${d.misses} of the 3 we can accept.`, `${d.maker} Motorsport`]);
    }
  }
  // (an amateur in a race car: a DNF usually means a repair bill, and sometimes the end of their interest)
  if (row && row.dnf && !row.dsq) {
    const gent = d.kind === 'gent' || d.kind === 'share', bill = Math.round(c.repair * (gent ? 0.08 : 0.05) / 100) * 100;
    items.push([`Repairs, car 2 (${p.first})`, -bill]);
    if (gent && rng(w) < 0.12) {
      texts(w, p.first, [`I've had a think after this weekend`, `My wife has had a think too`, `I'm going to step back. Thank you for everything`]);
      if (d.kind === 'share' && d.pids.length > 1) { d.pids = d.pids.filter(x => x !== p.id); d.per = Math.round(d.per / 2 / 50) * 50; const q = w.people[d.pids[0]]; myTeam(w).drivers = ['P', q.id]; q.team = myTeam(w).id; p.team = null; w.mate.pid = q.id; }
      else seatGone(w);
    }
  }
  return items;
}
// the seat's empty: the driver's gone, and so is their money (sign someone on the computer: Team, Drivers)
function seatGone(w) {
  const T = myTeam(w), pid = w.mate && w.mate.pid;
  if (pid && w.people[pid]) w.people[pid].team = null;
  T.drivers = T.drivers.filter(x => x === 'P'); w.mate = null;
}
// each week: an amateur wants a day of yours (a share: whoever's driving this round); a share swaps drivers
function seatWeek(w) {
  const d = seatOf(w); if (!d || w.over) return;
  if (d.kind === 'share' && d.pids.length > 1) { const pid = d.pids[w.round % 2], q = w.people[pid], T = myTeam(w); if (w.mate.pid !== pid) { const old = w.people[w.mate.pid]; if (old) old.team = null; T.drivers = ['P', pid]; q.team = T.id; w.mate.pid = pid; } }
  if ((d.kind === 'gent' || d.kind === 'share') && weekOpen(w) && freeDays(w) > 0) { const q = w.people[w.mate.pid]; bookDay(w, { fx: 'seat', what: `Coaching ${q.first} ${q.last}`, tag: 'Coaching' }); }
}

// ---------------- talking (character voices on: js/voice.js writes the words) ----------------
// You can text Danny and your teammate any time, and answer the Paddock Wire's reporter by email. ChatGPT writes what
// they say (and your message, if you only picked a tone), and says what your message's tone was; the game decides what
// that does, small and capped: your teammate's morale (it feeds their form), Danny's friendship (sore with you, he
// stops bringing you his ideas for a while), the press and your reputation. Once a week per person; after that it's
// just talk. tone: warm | supportive | joking | neutral | blunt | harsh | abusive
export const TALK_TONES = ['warm', 'supportive', 'joking', 'neutral', 'blunt', 'harsh', 'abusive'];
const TALK_FX = {
  mate: { warm: 5, supportive: 7, joking: 3, neutral: 0, blunt: -2, harsh: -8, abusive: -15 },
  danny: { warm: 2, supportive: 2, joking: 2, neutral: 0, blunt: -1, harsh: -4, abusive: -8 },
  press: { warm: [1, 1], supportive: [1, 1], joking: [1, 0], neutral: [0, 0], blunt: [0, -1], harsh: [-1, -2], abusive: [-2, -4] },
};
const bondOf = (w, k) => ((w.bonds ??= {})[k] || 0);
export const dannyCold = (w) => bondOf(w, 'danny') <= -6;
// the people in your phone (always there, even before they've texted): Danny, and your teammate
export function talkContacts(w) { const m = mateOf(w), p = m && w.people[m.pid]; return ['Danny', ...(p ? [p.first] : [])]; }
export function talkWho(w, name) { const m = mateOf(w), p = m && w.people[m.pid]; return name === 'Danny' ? 'danny' : p && name === p.first ? 'mate' : null; }
// what they know, for their reply: the facts, never more
export function talkFacts(w, who) {
  const sid = w.player.series, S = w.series[sid], last = S.results.at(-1), st = standings(w, sid), cp = st.findIndex(e => e.pid === 'P') + 1, me = last && last.rows.find(r => r.pid === 'P');
  const base = `${w.player.name} owns and drives for ${w.teams[w.player.team].name} in the ${seriesById(sid).name}, ${w.year} season, round ${Math.min(w.round + 1, w.opts.len)} of ${w.opts.len}. ${last ? `Last race (${last.track}): the player ${me ? (me.dnf ? 'did not finish' : `finished P${me.pos}`) : 'did not race'}.` : 'No races yet this season.'} ${cp && last ? `The player is P${cp} in the championship.` : ''} Money in the bank: ${money$(w.money?.balance || 0)}.`;
  if (who === 'mate') {
    const m = mateOf(w), p = w.people[m.pid], row = last && last.rows.find(r => r.pid === m.pid), h = h2hOf(w, m.pid);
    return `${base} You are ${p.first} ${p.last}, ${ageOf(w, p)}, the team's other driver. Your last race: ${row ? (row.dnf ? 'did not finish' : `P${row.pos}`) : 'not raced yet'}. Your wage is ${money$(m.wage || 0)} a round${m.owed ? `, and the team owes you ${money$(m.owed)} in back pay` : ''}. Your morale is ${m.morale >= 70 ? 'good' : m.morale >= 45 ? 'so-so' : 'low'}.${h.grudge >= 2 ? ' The player has raced you dirty before.' : ''}`;
  }
  if (who === 'investor') { const I = w.investor, S = INV_STYLES[I.style];
    return `${base} Reputation ${repOf(w)}/100.${stainOf(w) ? ' The team was caught cheating recently.' : ''} You are ${I.name.join(' ')}, a wealthy investor who ${S.intro}; you are considering buying a share of the team. You value answers that are ${{ numbers: 'about figures: costs, returns, what the money does', dream: 'about the vision: what the team will become', risks: 'frank about what could go wrong' }[S.likes]}, and dislike ${{ dream: 'vague dreaming', numbers: 'dry figures with no story', flatter: 'flattery' }[S.hates]}.`; }
  if (who === 'danny') return `${base} Danny's friendship with the player right now: ${bondOf(w, 'danny') >= 4 ? 'great' : bondOf(w, 'danny') <= -4 ? 'strained, he feels taken for granted' : 'fine'}.${(w.staff || []).some(x => x.danny && x.owed > 0) ? ' The team owes Danny wages.' : ''}`;
  return base;
}
// the conversation so far (oldest first), for context: "You: ..." / "Danny: ..."
export function talkHistory(w, name, n = 8) {
  return (w.msgs || []).filter(m => m.from === name && !m.note).slice(0, n).reverse().map(m => `${m.mine ? 'You' : name}: ${m.body}`).join('\n');
}
// what was said (res: { you, reply: [lines], tone }): into the thread, then what it did (a note under it)
export function talkDone(w, name, res) {
  const who = talkWho(w, name); if (!who) return null;
  text(w, name, res.you, { mine: true, read: true });
  if (res.reply && res.reply.length) texts(w, name, res.reply, { read: true });
  const tone = TALK_TONES.includes(res.tone) ? res.tone : 'neutral', key = `${who}:${nowIdx(w)}`;
  (w.talked ??= {});
  let note = null;
  if (w.talked[who] === nowIdx(w)) note = null; // (only the first exchange of the week counts)
  else {
    w.talked[who] = nowIdx(w);
    if (who === 'mate') { const m = mateOf(w), d = TALK_FX.mate[tone]; m.morale = clamp(m.morale + d, 0, 100); if (tone === 'abusive') w.drep = clamp(drepOf(w) - 2, 0, 100); note = d ? `Morale ${d > 0 ? '+' : ''}${d}` : null; }
    if (who === 'danny') { const d = TALK_FX.danny[tone], b = (w.bonds ??= {}); b.danny = clamp(bondOf(w, 'danny') + d, -12, 12); note = d ? `Friendship ${d > 0 ? '+' : ''}${d}${dannyCold(w) ? ': he\'s keeping his ideas to himself' : ''}` : null; }
  }
  if (note) text(w, name, note, { note: true, read: true });
  void key;
  return { tone, note };
}
// answering the reporter by email (res: { you, reply, headline, story, tone }): her reply, the Wire's piece quoting you,
// and what it did
export function pressDone(w, mid, res) {
  const m = (w.mail || []).find(x => x.id === mid); if (!m || m.replied) return null;
  m.replied = res.you;
  const tone = TALK_TONES.includes(res.tone) ? res.tone : 'neutral', [dp, dr] = TALK_FX.press[tone];
  if (res.reply) mail(w, JOURNO[0], JOURNO[1], `Re: ${m.subj}`, [res.reply, JOURNO[0]]);
  if (res.headline && res.story) news(w, res.headline.toUpperCase(), res.story);
  w.press = pressOf(w) + dp; w.rep = clamp(repOf(w) + dr, 0, 100);
  return { tone, note: [dp ? `Press ${dp > 0 ? '+' : ''}${dp}` : '', dr ? `Reputation ${dr > 0 ? '+' : ''}${dr}` : ''].filter(Boolean).join(' · ') };
}
export const isPressMail = (m) => !!m && m.from === JOURNO[0];

// ---------------- investors: money for a share of the team, and a say ----------------
// Once the team's getting noticed (above the Street Cup with a name, or a win), Gerald introduces a client. Each has a
// style you read from how they write: numbers (made it in spreadsheets: wants figures), dreamer (wants a story to belong
// to), cautious (hates hype: wants the risks said out loud). You work them over dinners (a day in the planner); after
// each, they email a question, and how you answer (a pitch: numbers, the dream, the risks, flattery) against their
// style, and how the team's actually doing, moves their interest. Enough, and they offer: money now for a share of every
// prize payment from then on, and a target for each season. Miss it twice and they want out: buy them back (for more
// than they paid), or they sell their stake to the rival owner. w.investor = { name, style, interest, stage
// (dinner | asked | offer | in | out | gone), offer, share, target, misses, paid, holder }
export const investorStyle = (w) => (w.investor ? INV_STYLES[w.investor.style] : null);
export const PITCHES = [['numbers', 'Talk numbers'], ['dream', 'Sell the dream'], ['risks', 'Be honest about the risks'], ['flatter', 'Flatter them']];
const INV_STYLES = {
  numbers: { likes: 'numbers', hates: 'dream', intro: 'made a great deal of money from spreadsheets, and reads them for fun', ask: `Walk me through your numbers. What does a season cost, what comes back, and what would my money do?` },
  dreamer: { likes: 'dream', hates: 'numbers', intro: 'sold a company young and has been looking for something to belong to ever since', ask: `Tell me what this team is going to be. Not the budget. The thing itself.` },
  cautious: { likes: 'risks', hates: 'flatter', intro: 'inherited a family firm and has kept it going by never once being impressed', ask: `What could go wrong? I'd rather hear it from you than find out.` },
};
const INV_NAMES = [['Victor', 'Lindqvist'], ['Celeste', 'Okonkwo-Hart'], ['Raymond', 'Faulkner'], ['Imogen', 'Achterberg'], ['Desmond', 'Vale'], ['Priya', 'Castellanos']];
export const investorOf = (w) => w.investor || null;
export const investorIn = (w) => (w.investor && w.investor.stage === 'in' ? w.investor : null);
const INV_ADDR = (I) => `${I.name[0][0].toLowerCase()}.${I.name[1].toLowerCase().replace(/[^a-z]/g, '')}@${pickLineStable(I.name[1])}.sv`;
const pickLineStable = (s) => ['meridiancap', 'valecapital', 'northgateholdings', 'brightwaterpartners'][[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 4];
// how big a deal: by the series (SERIES[].inv: GT-level numbers; a Formula-level series x3)
const invK = (w) => seriesById(w.player.series).inv ?? 1;
// someone new, when the team's noticed and nobody's around (and not straight after the last one)
function investorWeek(w) {
  const I = w.investor;
  if (I && I.stage === 'in') return;
  if (I && I.stage !== 'gone' && I.stage !== 'out') return;
  if (I && nowIdx(w) - (I.left || 0) < 10) return;
  // (noticed: above the Street Cup, with a name or a win; a lost one doesn't come back soon)
  const noticed = !!seriesById(w.player.series).pro && (repOf(w) >= 45 || lastMe(w)?.pos === 1);
  if (!noticed || rng(w) > 0.06) return;
  const style = pickLine(w, Object.keys(INV_STYLES)), name = pickLine(w, INV_NAMES), J = { name, style, interest: 30 + Math.round(repOf(w) / 5), stage: 'dinner', misses: 0, met: 0 };
  w.investor = J;
  mail(w, ADVISER[0], ADVISER[1], 'A client of mine', [`A client of mine, ${name.join(' ')}, has been following your team and would like to have dinner. ${name[0]} ${INV_STYLES[style].intro}.`, `I'd go. Be yourself. Or, if that seems unwise, be whoever ${name[0]} would want to invest in.`, `Gerald`]);
  investorDinner(w);
}
// a dinner this week: a day in the planner (the sponsors' events, the same way)
function investorDinner(w) {
  const I = w.investor, wk = weekOf(w), by = Math.min(4, (wk.used || 0) + 1 + Math.floor(rng(w) * 2));
  (wk.events ??= []).push({ id: 'ev' + (w.nextId++), inv: true, what: `Dinner with ${I.name.join(' ')}`, by, rsvp: 'yes', done: false });
  I.stage = 'dinner';
}
// the dinner: a day, then their question by email (answer it with a pitch)
export function attendDinner(w, id) {
  const e = eventById(w, id), I = w.investor; if (!e || e.done || !I || daysLeft(w) <= 0) return false;
  e.done = true; useDay(w, e.what, 0, 'Dinner'); I.met++;
  I.stage = 'asked';
  mail(w, I.name.join(' '), INV_ADDR(I), 'Thank you for dinner', [`Thank you for dinner. ${I.met > 1 ? 'Good to see you again.' : 'I enjoyed it, mostly.'}`, INV_STYLES[I.style].ask, I.name[0]], { pitch: true });
  return true;
}
// your answer (pitch: numbers | dream | risks | flatter, from a choice or what ChatGPT made of what you wrote): their
// interest moves on the fit, the team's form, and anything rude. Returns { note, reply? } for the written version
export function pitchDone(w, mid, pitch, res = {}) {
  const m = (w.mail || []).find(x => x.id === mid), I = w.investor; if (!m || m.replied || !I) return null;
  m.replied = res.you || (PITCHES.find(p => p[0] === pitch) || [])[1] || pitch;
  const S = INV_STYLES[I.style], fit = pitch === S.likes ? 14 : pitch === S.hates ? -10 : 4;
  const form = Math.round((repOf(w) - 40) / 8) + (lastMe(w) && !lastMe(w).dnf && lastMe(w).pos <= 3 ? 4 : 0) + (w.money.balance < 0 ? -6 : 0) + (stainOf(w) ? -10 : 0);
  const rude = res.tone === 'abusive' ? -25 : res.tone === 'harsh' ? -10 : 0;
  const d = fit + form + rude; I.interest = clamp(I.interest + d, 0, 100);
  const name = I.name.join(' ');
  const said = res.reply || (fit > 0 ? `That's what I wanted to hear. Let me think about it.` : fit < 0 ? `Hm. That isn't really what I asked.` : `Fair enough. I'll think about it.`);
  mail(w, name, INV_ADDR(I), `Re: ${m.subj}`, [said, I.name[0]]);
  if (I.interest >= 70) investorOffer(w);
  else if (I.interest < 20) { I.stage = 'gone'; I.left = nowIdx(w); mail(w, name, INV_ADDR(I), 'Thank you', [`I've decided not to go ahead. I wish you and the team well, I think.`, I.name[0]]); }
  else { I.stage = 'dinner'; I.next = nowIdx(w) + 2; } // (another dinner in a couple of weeks)
  return { note: `${I.name[0]}'s interest ${d >= 0 ? '+' : ''}${d}`, interest: I.interest };
}
// another dinner, when it's time (from the week)
function investorFollow(w) { const I = w.investor; if (I && I.stage === 'dinner' && I.next && nowIdx(w) >= I.next) { I.next = null; investorDinner(w); } }
function investorOffer(w) {
  const I = w.investor, k = invK(w), share = (3 + Math.round(rng(w) * 3)) / 20, amt = Math.round(share * (650000 + rng(w) * 250000) * k / 5000) * 5000;
  const target = clamp(seasonOutlook(w).pos - 1, 1, 12);
  I.stage = 'offer'; I.offer = { amt, share, target };
  mail(w, I.name.join(' '), INV_ADDR(I), 'A proposal', [`I'd like to invest ${money$(amt)} in ${w.teams[w.player.team].name}, for ${Math.round(share * 100)}% of the team.`, `In practice that means ${Math.round(share * 100)}% of the prize money from now on, and that each season we agree a target. This season: the top ${target}. If we miss it, I'll want to talk. If we miss it twice, I'll want out.`, `No hurry. Well, some hurry.`, I.name[0]],
    { invOffer: true, choices: [['yes', `Accept: ${money$(amt)} for ${Math.round(share * 100)}%`], ['no', 'Decline']] });
}
export function answerInvestor(w, key) {
  const I = w.investor; if (!I || I.stage !== 'offer') return null;
  if (key !== 'yes') { I.stage = 'gone'; I.left = nowIdx(w); return 'declined'; }
  I.stage = 'in'; I.share = I.offer.share; I.target = I.offer.target; I.paid = I.offer.amt; I.since = w.year;
  pay(w, I.offer.amt, `${I.name.join(' ')}: investment for ${Math.round(I.share * 100)}% of the team`);
  news(w, `${I.name[1].toUpperCase()} BUYS INTO ${w.teams[w.player.team].name.toUpperCase()}`, `${I.name.join(' ')} has bought ${Math.round(I.share * 100)}% of ${w.teams[w.player.team].name}. Terms were not disclosed, which in our experience means they were generous.`);
  return 'in';
}
// the season's over: the target met or missed; twice missed, they want out (buy them back, or they sell to the rival)
function investorSeason(w, sum) {
  const I = investorIn(w), you = sum.you; if (!I || !you) return;
  const name = I.name.join(' ');
  if (you.pos <= I.target) { I.misses = 0; mail(w, name, INV_ADDR(I), `${w.year}`, [`P${you.pos}. Target met. I'm pleased, and I don't say that often.`, `Next season: the top ${Math.max(1, I.target - 1)}.`, I.name[0]]); I.target = Math.max(1, I.target - 1); return; }
  I.misses++;
  if (I.misses < 2) { mail(w, name, INV_ADDR(I), `${w.year}`, [`We said the top ${I.target}. We finished P${you.pos}.`, `I'm not going anywhere yet. But I'll be watching more closely.`, I.name[0]]); return; }
  const price = Math.round(I.paid * 1.5 / 5000) * 5000; I.buyout = price;
  const ro = rivalOwner(w);
  mail(w, name, INV_ADDR(I), 'I want out', [`Two seasons, two missed targets. I'd like my stake back out of the team.`, `I'll sell it to you for ${money$(price)}. If you can't, I'll sell it to someone who'll take it. I understand ${ro ? `${ro.name.join(' ')} of ${w.teams[ro.tid].name}` : 'one of the other owners'} is interested.`, I.name[0]],
    { invOut: true, choices: [['buy', `Buy it back: ${money$(price)}`], ['no', `Let ${I.name[0]} sell it`]] });
}
export function answerBuyout(w, key) {
  const I = investorIn(w); if (!I || !I.buyout) return null;
  if (key === 'buy') { if (w.money.balance < I.buyout) return { err: `That's ${money$(I.buyout)}. You have ${money$(w.money.balance)}.` }; pay(w, -I.buyout, `${I.name.join(' ')}: stake bought back`); I.stage = 'out'; I.left = nowIdx(w); return { msg: 'The team is yours again.' }; }
  // (sold on: the rival owner now takes the share)
  const ro = rivalOwner(w), r = ro ? ro.name : ['An', 'Anonymous Buyer'];
  I.name = r; I.style = 'numbers'; I.misses = 0; I.buyout = null; I.holder = 'rival'; I.target = Math.max(I.target, 3);
  news(w, `${r.join(' ').toUpperCase()} BUYS A SHARE OF ${w.teams[w.player.team].name.toUpperCase()}`, `${r.join(' ')} now owns ${Math.round(I.share * 100)}% of a rival team. "Purely an investment," ${r[1]} said, smiling.`);
  return { msg: `${r.join(' ')} owns ${Math.round(I.share * 100)}% of your team now.` };
}

// ---------------- works support: a maker backs the team that's winning in its car ----------------
// In a series with customer cars (SERIES[].works), a strong season in a maker's car (the top 5, or three podiums)
// brings an offer from its motorsport department: money every round, a bonus for each podium, and a target for the
// season. It lasts while you race their car in that series (the season setup's car cards say which cars keep it), and
// it's renewed each season the target's met. w.works = { maker, sid, per, podium, target, since }
export const worksOf = (w) => (w.works && w.works.sid === w.player.series ? w.works : null);
const worksAddr = (m) => `motorsport@${m.toLowerCase().replace(/[^a-z]/g, '')}.sv`;
export const worksCar = (w, name) => { const W = worksOf(w); return !!(W && name && makerOf(name) === W.maker); };
function worksSeason(w, sum) {
  const S = seriesById(w.player.series), you = sum.you, W = worksOf(w); if (!you || !w.car) return;
  if (W) {
    if (you.pos <= W.target) { W.target = Math.max(1, W.target - 1); mail(w, `${W.maker} Motorsport`, worksAddr(W.maker), `${w.year + 1}`, [`P${you.pos}. Target met: we'll continue our support next season, on the same terms.`, `Next season we're looking for the top ${W.target}. In one of our cars, naturally.`, `${W.maker} Motorsport`]); }
    else { w.works = null; mail(w, `${W.maker} Motorsport`, worksAddr(W.maker), 'Our support', [`We asked for the top ${W.target}. P${you.pos} is not the top ${W.target}.`, `We'll be focusing our support on other customers next season. Thank you for racing ${W.maker}.`, `${W.maker} Motorsport`]); }
    return;
  }
  if (!S.works || !w.car.lease && !w.car.prog) return;
  const pods = (w.series[w.player.series].results || []).filter(r => r.rows.some(x => x.pid === 'P' && !x.dnf && x.pos <= 3)).length;
  if (you.pos > 5 && pods < 3) return;
  const maker = makerOf(w.car.name), c = COSTS[w.player.series], per = Math.round(c.crew * 0.45 / 500) * 500, podium = Math.round(per * 0.5 / 500) * 500, target = clamp(you.pos, 1, 5);
  w.worksOffer = { maker, sid: S.id, per, podium, target };
  mail(w, `${maker} Motorsport`, worksAddr(maker), 'Works support', [`We've watched your season in the ${w.car.name} with interest. ${pods ? `${pods} podium${pods === 1 ? '' : 's'}` : `P${you.pos} in the championship`}, in a customer car, is the kind of thing our board likes to see in a brochure.`,
    `We'd like to support the team next season: ${money$(per)} a round, ${money$(podium)} more for each podium, our engineers on call. In return you race one of our cars, and we're looking for the top ${target}.`, `${maker} Motorsport`],
    { worksOffer: true, choices: [['yes', `Accept: ${money$(per)} a round`], ['no', 'No thanks']] });
}
export function answerWorks(w, key) {
  const o = w.worksOffer; if (!o) return null; w.worksOffer = null;
  if (key !== 'yes') return 'declined';
  w.works = { ...o, since: w.year + 1 };
  news(w, `${o.maker.toUpperCase()} BACKS ${w.teams[w.player.team].name.toUpperCase()}`, `${o.maker} will support ${w.teams[w.player.team].name} next season. "We see a lot of ourselves in them," a spokesperson said, of a team that had until recently been running out of a lock-up.`);
  return 'signed';
}
// the round's money (and the deal ends the moment you're in someone else's car)
function worksRound(w, me) {
  const W = worksOf(w); if (!W) return [];
  if (!worksCar(w, w.car && w.car.name)) { w.works = null; mail(w, `${W.maker} Motorsport`, worksAddr(W.maker), 'Our support', [`We notice you are no longer racing a ${W.maker}. Our support was for teams racing a ${W.maker}. We trust you understand.`, `${W.maker} Motorsport`]); return []; }
  const out = [[`${W.maker} works support`, W.per]];
  if (me && !me.dnf && me.pos <= 3) out.push([`${W.maker}: podium bonus (P${me.pos})`, W.podium]);
  return out;
}

// ---------------- the week, from GT up ----------------
// (a day's work you're asked to do: { what, pay, tag }; taken from the email)
// (booked: it's in the day planner, and paid when it's done)
export function takeDayJob(w, m) {
  const j = m.dayJob; if (!j || freeDays(w) <= 0) return false;
  bookDay(w, { fx: 'job', what: j.what, tag: j.tag, pay: j.pay, mate: !!j.mate, from: m.from, addr: m.addr });
  return true;
}

// ---------------- money ----------------
// You won the lottery and spent it on a racing team. The opening choice (lump sum or annuity) is an email; every round
// then costs money (entry, travel, the crew, tyres, fuel, repairs) and pays prize money. All in dollars; the scale is
// set so a Street Cup season loses money: the lump sum lasts about a season and a half on racing alone, and the
// week's work (day job, gigs) is what keeps you going. Every step up needs more than you have (sponsors).
export const LOTTERY = { jackpot: 400000, lump: 132000, annuity: 10000, years: 30, saleRate: 0.25 }; // (selling the annuity: a quarter of what it's worth)
export const COSTS = {
  club:    { entry: 1500,  travel: 1100,  crew: 1500,  tyre: 450,  fuelLap: 15,  repair: 9000,   prize: [5000, 3500, 2500, 2000, 1600, 1300, 1000, 800, 600, 500] }, // (club racing: cheap, and nobody's paid much)
  street:  { entry: 4000,  travel: 2400,  crew: 3500,  tyre: 900,  fuelLap: 35,  repair: 24000,  prize: [12000, 8250, 6000, 4500, 3750, 3000, 2250, 1800, 1500, 1200] }, // (a round, a car: both of yours are paid)
  gt2:     { entry: 8000,  travel: 4000,  crew: 10000, tyre: 1800, fuelLap: 70,  repair: 55000,  prize: [25000, 17000, 12500, 9500, 7500, 6000, 4500, 3500, 2500, 1800] },
  gt:      { entry: 15000, travel: 6000,  crew: 22000, tyre: 3200, fuelLap: 120, repair: 110000, prize: [50000, 34000, 24000, 19000, 15000, 12000, 9500, 7000, 5000, 3500] },
  groupc:  { entry: 22000, travel: 10000, crew: 38000, tyre: 4500, fuelLap: 200, repair: 250000, prize: [85000, 58000, 42000, 33000, 26000, 21000, 16000, 12000, 8500, 6000] },
  formula: { entry: 28000, travel: 15000, crew: 55000, tyre: 6000, fuelLap: 300, repair: 450000, prize: [120000, 85000, 60000, 48000, 39000, 30000, 24000, 18000, 12000, 9000] },
};
// the annuity is a year's money; seasons of other lengths get it in proportion (a 12-round year pays twice a 6)
const annuityPay = (w) => Math.round(LOTTERY.annuity * (w.money?.loophole || 1) * w.opts.len / 6 / 100) * 100;
// the teams' championship pays too (both cars' points)
const TEAM_FUND = { club: [4000, 2500, 1500, 1000, 600, 400], street: [10000, 6000, 4000, 2500, 1500, 1000], gt2: [25000, 15000, 10000, 6000, 4000, 2500], gt: [50000, 30000, 20000, 12000, 8000, 5000], groupc: [85000, 55000, 35000, 22000, 14000, 8500], formula: [120000, 80000, 50000, 32000, 20000, 12000] };
// the end of the season: the series pays its prize fund by championship position
// (steep at the top: a title pays for most of the next season, the middle of the table gets its costs back and little more)
const SEASON_FUND = {
  club:    [25000, 16000, 10000, 7000, 4500, 3000, 1800, 1200, 800, 500],
  street:  [60000, 40000, 26000, 17000, 11000, 7000, 4000, 2500, 1500, 1000],
  gt2:     [80000, 52000, 35000, 24000, 16000, 11000, 7000, 4500, 2500, 1500],
  gt:      [100000, 64000, 44000, 32000, 24000, 18000, 14000, 10000, 6000, 4000],
  groupc:  [170000, 110000, 76000, 55000, 41000, 31000, 24000, 17000, 10000, 7000],
  formula: [250000, 160000, 110000, 80000, 60000, 45000, 35000, 25000, 15000, 10000],
};
// the funds are for a six-round season: longer seasons cost more, so they pay in proportion
const fundOf = (w, sid) => SEASON_FUND[sid].map(v => Math.round(v * w.opts.len / 6 / 100) * 100);
const teamFundOf = (w, sid) => TEAM_FUND[sid].map(v => Math.round(v * w.opts.len / 6 / 100) * 100);
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
// the choice made at the claim office in the opening (js/claimoffice.js): it's paid once the team's registered (the
// background on Form SV-1 can change how much); the State Lottery's email becomes the receipt
export function pickLottery(w, choice) {
  const m = w.money; if (!m || m.choice || !['lump', 'annuity'].includes(choice)) return;
  m.pick = choice;
  const e = (w.mail || []).find(x => x.lottery);
  if (e) {
    e.answer = choice; e.subj = 'Your claim: received';
    e.body = [`Dear Claimant,`, `Thank you for attending Winner Services in person. We have received your Form ${choice === 'lump' ? 'L-1 (Lump Sum)' : `A-${LOTTERY.years} (Annuity)`}.`,
      choice === 'lump' ? `You will receive ${money$(LOTTERY.lump)}, in one payment, after tax.` : `You will receive ${money$(LOTTERY.annuity)} a year for ${LOTTERY.years} years, the first payment now.`,
      w.founding?.reg ? `Payment has been made to your registered business.` : `Winnings are only paid to a registered business. Payment will be made when you file Form SV-1.`, `This choice is final.`, `Winner Services, San Velocita State Lottery`];
  }
  if (w.founding?.reg) claimLottery(w, choice);
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
    ['Entry fee', -c.entry], [home ? 'Travel (home race: you drove)' : 'Travel and freight', home ? 0 : -Math.round(c.travel * fx.travel * (facLevel(myTeam(w), 'truck') ? 0.65 : 1))], ['Pit crew (contract)', -c.crew],
    ['Premises and facilities', -facUpkeep(myTeam(w))],
    ...(roleDiscount(w) ? [['Haggled down (the Principal)', roleDiscount(w)]] : []),
    [`Tires bought trackside (${use.trackside || 0} set${use.trackside === 1 ? '' : 's'})`, -Math.round((use.trackside || 0) * c.tyre * TRACKSIDE)],
    [`Fuel (${use.laps} lap${use.laps === 1 ? '' : 's'})`, -Math.round(use.laps * c.fuelLap * (bg.fuel || 1))],
  ];
  if (w.car && w.car.lease) items.push([`Car lease (${w.car.lease.prog})`, -w.car.lease.perRound]);
  // (co-op: what car two used, from the co-owner's race: their sets came out of the stock, short ones trackside)
  if (use.car2) { const t = use.car2.trackside || 0, l = use.car2.laps || 0;
    if (t) items.push([`Car two: tires bought trackside (${t} set${t === 1 ? '' : 's'})`, -Math.round(t * c.tyre * TRACKSIDE)]);
    if (l) items.push([`Car two: fuel (${l} lap${l === 1 ? '' : 's'})`, -Math.round(l * c.fuelLap * (bg.fuel || 1))]); }
  if (use.damage > 0.005) items.push([bg.repair ? 'Repairs (mostly done yourself)' : 'Repairs', -Math.round(use.damage * c.repair * (bg.repair || 1) * fx.repair / 100) * 100]);
  for (const it of sponsorRound(w, use, me)) items.push(it);
  for (const it of seatRound(w)) items.push(it);
  for (const it of car2Round(w, use)) items.push(it);
  // (co-op: each driver who met their target: driverTarget)
  if (w.coop) { const res = w.series[w.player.series].results.find(r => r.round === w.round);
    for (const pid of ['P', w.coop.pid]) { const t = driverTarget(w, pid), row = res && res.rows.find(r => r.pid === pid);
      if (row && !row.dnf && row.pos <= t) items.push([`Target met: ${pid === 'P' ? w.player.name.split(' ')[0] : w.people[pid].first} (P${row.pos}, aiming for top ${t})`, targetBonus(w)]); } }
  if (w.coop?.boss) { const seen = (w.week?.co?.work || 0) > 0; items.push([`${w.coop.boss}: sponsoring ${coopPerson(w).first}${seen ? '' : ' (half: they never saw them at work)'}`, Math.round(buyinOf(w, 'boss').per * (seen ? 1 : 0.5) / 10) * 10]); } // (a co-owner's boss: pays in full when they've turned up for a shift that week)
  for (const it of worksRound(w, me)) items.push(it);
  for (const it of temptRound(w, use, me)) items.push(it);
  arcRound(w, me);
  const base = me && !me.dnf ? c.prize[me.pos - 1] || 0 : 0, pct = Math.max(0, use.aidPct || 0);
  const prize = Math.round(base * (1 + pct / 100) * (bg.prize || 1) * (home ? 1.1 : 1) / 10) * 10;
  if (prize) items.push([`Prize money (P${me.pos}${pct ? `, +${pct}% for fewer aids` : ''}${home ? ', home crowd' : ''})`, prize]);
  // (and for the other car: the team's paid for both)
  if (isEndurance(R)) items.push([`Car two: two hired drivers for the ${R.endur.hours} Hours`, -Math.round(c.crew * 0.6 / 100) * 100]);
  { const res = w.series[w.player.series].results.find(r => r.round === w.round), mate = mateOf(w), row = isEndurance(R) ? (use.car2Pos ? { pos: use.car2Pos, dnf: !!use.car2Dnf } : null) : res && mate && res.rows.find(r => r.pid === mate.pid);
    const mp = row && !row.dnf ? Math.round((c.prize[row.pos - 1] || 0) * (bg.prize || 1) * (home ? 1.1 : 1) / 10) * 10 : 0;
    if (mp) items.push([isEndurance(R) ? `Prize money, second car (the hired drivers, P${row.pos})` : `Prize money, second car (${w.people[mate.pid].first}, P${row.pos})`, mp]); }
  // (whoever owns a share of the team takes it out of the prize money)
  { const I = investorIn(w), won = items.filter(([k, v]) => v > 0 && /^Prize money/.test(k)).reduce((a, [, v]) => a + v, 0); if (I && won) items.push([`Prize money share: ${I.name.join(' ')} (${Math.round(I.share * 100)}%)`, -Math.round(won * I.share / 10) * 10]); }
  const before = w.money.balance;
  for (const [what, amt] of items) if (amt) pay(w, amt, `${trackName}: ${what[0].toLowerCase() + what.slice(1)}`);
  overdraftFee(w, items);
  const net = w.money.balance - before;
  bankCheck(w);
  // (the weekend's money goes in the round's report, with the result: roundNews. A round with no report: the bank's own)
  w._bill = { track: trackName, items, net, bal: w.money.balance };
  return { items, net };
}
// ---------------- the bank's limit: how a career ends ----------------
// The bank lets the account go overdrawn, to a limit. Past the limit after a round, it gives you BANK_ROUNDS rounds to
// get back within it (a letter starts the clock; with one round left, the final notice: on the desk, a call, Gerald),
// and if you're still past it after that, it closes the account, and the team is finished (w.ended). Back within the
// limit after any round and the clock stops. w.bankNote = { left (rounds, the next one included), stage, when }
export const BANK_ROUNDS = 3;
export const bankLimit = (w) => 25000 * KS(w);
export const bankNote = (w) => (!w.ended && w.bankNote) || null;
// rounds left before the account closes (counting the coming one), or null
export const bankRoundsLeft = (w) => { const b = bankNote(w); return b ? b.left : null; };
function bankCheck(w) {
  if (w.pre || !w.money || w.ended) return;
  const L = bankLimit(w), bal = w.money.balance, b = w.bankNote;
  if (bal >= -L) {
    if (b) { w.bankNote = null; mail(w, BANK, BANK_ADDR, 'Your account', [`Your account is back within its agreed limit. Thank you.`, `We have cancelled the notice we sent you on ${b.when}. No further action is needed.`]); }
    return;
  }
  if (!b) {
    w.bankNote = { left: BANK_ROUNDS, stage: 1, when: whenOf(w) };
    mail(w, BANK, BANK_ADDR, 'Your account is over its limit', [`Your business account is overdrawn by ${money$(-bal)}, beyond its agreed limit of ${money$(L)}.`, `Please bring the account within its limit within ${BANK_ROUNDS} rounds. If it is still over the limit after that, we will close it, and ask for the balance in full.`, `If you would like to discuss this, please call your branch. Our lines are open, and busy.`], { bankNote: true });
    return;
  }
  b.left--;
  if (b.left <= 0) return endCareer(w, 'bank');
  if (b.left === 1 && b.stage < 2) {
    b.stage = 2;
    b.notice = mailId(w, BANK, BANK_ADDR, 'FINAL NOTICE', [`FINAL NOTICE.`, `Your account remains overdrawn by ${money$(-bal)}, beyond its agreed limit of ${money$(L)}.`, `Unless it is within its limit after your next round, we will close it without further notice.`, `This letter has also been sent by post.`], { bankNote: true, final: true });
    texts(w, BANK, [`Missed call`, `Voicemail: Hi, it's Karen from First Velocita, calling about your business account. Please give us a call back. Thanks. Bye. Bye.`]);
    mail(w, ADVISER[0], ADVISER[1], 'The bank', [`The bank called me, which they don't usually do.`, `You have one round. Sell something, sit a round out, take any work there is. I know you don't want to hear it.`, `Gerald`]);
  }
}
// the end (main.js plays it): why 'bank' (the account closed) | 'entry' (the series withdrew the entry)
function endCareer(w, why) {
  const L = bankLimit(w), bal = w.money.balance, t = w.teams[w.player.team], S = seriesById(w.player.series);
  w.ended = { y: w.year, r: w.round, why, bal, team: t.name, series: S.name };
  w.bankNote = null;
  if (why === 'bank') {
    mail(w, BANK, BANK_ADDR, 'Your account has been closed', [`We wrote to you about your account, which has been over its agreed limit of ${money$(L)} for ${BANK_ROUNDS} rounds.`, `We have now closed it. The balance of ${money$(-bal)} is due in full. A member of our recoveries team will be in touch.`, `Thank you for banking with First Velocita.`]);
    news(w, `${t.name.toUpperCase()} FOLDS`, `${t.name}, the team founded by ${epithetOf(w)} ${w.player.name}, has stopped racing after its bank closed its account. The team's car and equipment are expected to be sold.`);
  } else {
    mail(w, `${S.name} Entries`, addrOf(S, 'entries'), 'Withdrawal of your entry', [`${t.name} has now missed more rounds than our regulations allow. We have withdrawn its entry, with immediate effect, and offered it to the next team on our waiting list.`, `Thank you for your participation in the ${S.name}.`, `Entries Office, ${S.name}`]);
    news(w, `${t.name.toUpperCase()} LOSES ITS ${S.name.toUpperCase()} ENTRY`, `${t.name}, the team founded by ${epithetOf(w)} ${w.player.name}, has had its entry withdrawn after missing ${satOut(w)} rounds this season.`);
  }
  flag(w, 'folded');
}

// overdrawn: the bank charges for it (after a round's bill)
function overdraftFee(w, items) { if (w.money.balance < 0) { const fee = Math.round(-w.money.balance * 0.015 / 10) * 10 + 250; pay(w, -fee, 'Overdraft interest and fee'); items.push(['Overdraft interest and fee', -fee]); } }

// ---------------- getting out of a hole: sitting a round out, selling up ----------------
// Sitting out: the team doesn't start. No entry, travel, crew, fuel or tyres; the rent, the payroll, loans and a lease
// still go out, there's no prize money, and the sponsors have nothing to show for their money (no fee, and a missed
// target each). What it saves, before you choose:
export function sitOutSaves(w) {
  const c = COSTS[w.player.series], R = w.series[w.player.series].cal[w.round];
  const travel = isHome(w, R) ? 0 : Math.round(c.travel * staffEffects(w).travel * (facLevel(myTeam(w), 'truck') ? 0.65 : 1));
  const fees = dealsOf(w).filter(d => !d.shady).reduce((a, d) => a + d.fee, 0);
  return { saves: c.entry + travel + c.crew + Math.round(c.fuelLap * 14 * (bgOf(w).fuel || 1)), loses: fees }; // (your teammate's contract is paid either way)
}
// The series needs its entrants to start: a team that misses more than SIT_MAX rounds in a season loses its entry
// (a third of the season, at least one), which ends it. satOut(w): rounds missed this season
export const sitMax = (w) => Math.max(1, Math.floor(w.opts.len / 3));
export const satOut = (w) => (w.sat && w.sat.y === w.year ? w.sat.n : 0);
export function sitOut(w) {
  if (w.over || w.ended) return null;
  w.sat = { y: w.year, n: satOut(w) + 1 };
  if (w.staff) runPayroll(w);
  const R = w.series[w.player.series].cal[w.round], items = [['Premises and facilities', -facUpkeep(myTeam(w))]];
  if (w.car && w.car.lease) items.push([`Car lease (${w.car.lease.prog})`, -w.car.lease.perRound]);
  for (const d of dealsOf(w)) { if (d.shady) continue; d.misses++; d.obj = null; items.push([`${sponsorById(d.sid).name}: you didn't race, no fee`, 0]); }
  items.push(...loanRound(w));
  const before = w.money.balance;
  for (const [what, amt] of items) if (amt) pay(w, amt, `${R.name}: ${what[0].toLowerCase() + what.slice(1)}`);
  overdraftFee(w, items);
  const net = w.money.balance - before;
  bankCheck(w);
  // (the series office: a warning at the last one allowed; past it, the entry goes)
  const S = seriesById(w.player.series);
  if (!w.ended && w.sat.n > sitMax(w)) endCareer(w, 'entry');
  else if (!w.ended && w.sat.n === sitMax(w)) mail(w, `${S.name} Entries`, addrOf(S, 'entries'), 'Your entry', [`${w.teams[w.player.team].name} has not started ${w.sat.n} round${w.sat.n === 1 ? '' : 's'} of the ${w.year} season.`, `Our regulations allow an entrant to miss ${sitMax(w)} round${sitMax(w) === 1 ? '' : 's'} a season. If your team does not start the next round it misses, we will withdraw its entry and offer it to a team on our waiting list. The list is short, but it exists.`, `Entries Office, ${S.name}`]);
  mail(w, BANK, BANK_ADDR, `Account activity: ${R.name}`, [`Here is the activity on your business account for round ${w.round + 1}, ${R.name}. Your team did not start.`, w.money.balance < 0 ? `Your account is overdrawn by ${money$(-w.money.balance)}.` : `Your balance is ${money$(w.money.balance)}.`], { bill: { items, net, bal: w.money.balance } });
  // (neither of your cars starts: the rest of the field races without them)
  scoreRound(w, w.player.series, simRace(w, w.player.series, false).filter(r => teamOfPid(w, r.pid) !== w.player.team).map((r, k) => ({ ...r, pos: k + 1 })));
  news(w, `${w.teams[w.player.team].name.toUpperCase()} MISSES ${R.name.toUpperCase()}`, `${w.teams[w.player.team].name} did not start at ${R.name}. The team gave no reason. The team's owner did not return calls.`);
  const round = w.round;
  return { ...afterRound(w, null), bill: { items, net }, round };
}
// registering again: the lawyers write again, the Wire notices, the rival owner is gracious about it, Danny can't
// believe it
function againNews(w, f) {
  const first = f.name.split(' ')[0], A = w.again;
  mail(w, 'Hargreave & Webb, Family Law', 'office@hargreavewebb.sv', `${f.ex} v. ${f.name.split(' ').pop()}: another quick question`,
    [`Dear ${first},`, `We act, as before, for ${f.ex}.`, `It has come to our attention that you have won the State Lottery again. My client has asked us to confirm the date of this draw as well.`, `My client also asks us to pass on the word "seriously?", and nothing else.`, `Yours,`, `M. Hargreave`]);
  news(w, `LOTTERY WINNER WINS LOTTERY AGAIN`, `${f.name}, whose ${A.team} folded in ${A.y}, has won the State Lottery for a second time and registered a new racing team, ${f.team}. The Lottery says the odds against it are "very long" and that it is "looking into nothing".`);
  if (w.rival) mail(w, w.rival.name.join(' '), `${w.rival.name[0][0].toLowerCase()}.${w.rival.name[1].toLowerCase().replace(/[^a-z]/g, '')}@${(w.teams[w.rival.tid]?.name || 'team').toLowerCase().replace(/[^a-z]+/g, '')}.sv`, 'Welcome back',
    [`I read the news. Twice, to be sure.`, `I said a season and a half. I'm pleased to have been roughly right, and genuinely pleased to see you back. The paddock is duller without someone to beat.`, `Do try to make it to two seasons this time.`, w.rival.name[0]]);
  texts(w, 'Danny', [`Wait`, `You won AGAIN?`, `Bro I've been playing the same numbers for 11 years`]);
}

// ---------------- starting again, in the same world ----------------
// After an ending: the rest of that season goes on without you, the new season starts, and you (the same you) are back
// where a career starts: the lottery (again), Form SV-1, the setup. The world keeps what it knows about you: your
// history, the drivers' view of you (drep, grudges), the rival, the Wire, the bank (it won't lend: w.scandal), half
// your reputation, the list's crossed-off lines. The old business is gone with its debts; your folded team is a team of
// its own (w.again.fid), the one the setup offers to take back, with your old car if it wasn't sold. Always back in the
// Street Cup. trackPool: the next season's circuits.
export function restartWorld(w, trackPool) {
  const E = w.ended; if (!E) return null;
  const T = myTeam(w), fid = 'F' + (w.nextId++);
  (w.folds ??= []).push({ team: E.team, y: E.y, why: E.why, bal: E.bal, series: E.series });
  // the folded team: a team of its own now, out of racing, with what it owned
  w.teams[fid] = { id: fid, name: T.name, main: T.main, accent: T.accent, series: null, car: T.car, drivers: [], folded: E.y, fac: { ...facOf(T) } };
  // your teammate: still around if you treated them fairly (they'd come back), otherwise gone
  const mate = mateOf(w), mp = mate && w.people[mate.pid], fair = mp && !(mate.owed > 0) && !((h2hOf(w, mp.id).grudge || 0) >= 2);
  for (const pid of T.drivers.filter(d => d !== 'P')) { const p = w.people[pid]; if (p && !(fair && pid === mp.id)) { p.team = null; } }
  T.drivers = ['P', ...(fair ? [mp.id] : [])];
  const st = startOf(w), stCls = seriesById(st).cls;
  w.prevCar = w.car && !w.car.lease && carClsOf(w) === stCls ? { chassis: w.car.chassis, name: w.car.name, year: w.car.year, paid: w.car.paid, cls: stCls } : null;
  // the rest of the season, without you (nobody's founded anything yet: the list and the rest don't count it)
  w.founding = { reg: false, car: false };
  w.ended = null; w.mate = null; w.staff = []; w.deals = []; w.grey = null; w.bet = null; w.sat = null; w.bankNote = null; w.loans = [];
  while (!w.over) { const sid = w.player.series; scoreRound(w, sid, simRace(w, sid, false).filter(r => teamOfPid(w, r.pid) !== T.id).map((r, k) => ({ ...r, pos: k + 1 }))); afterRound(w, null); }
  w.player.offer = null;
  nextSeason(w, trackPool);
  // back to where you started: your entry takes the place of its strongest team, which moves up into the one you had
  if (T.series !== st) {
    const from = T.series, B = w.series[st].teams.map(id => w.teams[id]).filter(t => !t.mine).sort((a, b) => carValue(w, b) - carValue(w, a))[0];
    w.series[from].teams = w.series[from].teams.map(t => t === T.id ? B.id : t); w.series[st].teams = w.series[st].teams.map(t => t === B.id ? T.id : t);
    B.series = from; for (const pid of B.drivers) if (w.people[pid]) w.people[pid].series = from;
    T.series = st; for (const pid of T.drivers) if (w.people[pid]) w.people[pid].series = st;
    w.player.series = st;
  }
  // the business: gone. You: the same, with a past
  T.fac = { base: 0 }; devReset(T); T.dev = null;
  w.car = null; w.projects = []; w.jobs = null; w.payDriver = null; w.amb = null; w.ballast = 0; w.week = null; w.ads = [];
  w.lies = 0; w.fraud = null; w.livery = w.livery ? { ...w.livery } : null; w.liveryDone = false; w.logoShown = null;
  w.founding = { reg: false, car: false };
  w.rep = Math.max(10, Math.round(repOf(w) * 0.5)); w.scandal = nowIdx(w);
  w.again = { y: E.y, team: E.team, why: E.why, fid, mate: fair ? mp.id : null, n: (w.again?.n || 0) + 1 };
  w.prev = fid;
  // a new sheet: what you've done already comes crossed off; why, you'll write again
  if (w.list) w.list = { why: null, done: Object.fromEntries(Object.entries(w.list.done).map(([k, v]) => [k, { ...v, old: true }])), fresh: [], late: {} };
  w.mail = [];
  startMoney(w);
  mail(w, 'San Velocita Business Registry', 'no-reply@registry.sv.gov', 'Action required: Form SV-1',
    [`Our records show that you intend to operate a motor racing team in the Province of San Velocita.`, `Our records also show that you did this before. Please complete a new Form SV-1. The previous one cannot be reused.`, `San Velocita Business Registry`], { link: ['registry', 'Open Form SV-1'] });
  return w;
}

// what the car fetches this week (a dealer's price, or a lease's deposit back, less the damage), before you sell it
export function carSale(w) { if (!w.car) return null; return w.car.lease ? { lease: true, value: depositBack(w) } : { value: tradeIn(w) }; }
export function sellCar(w) {
  const s = carSale(w); if (!s) return null;
  const c = w.car;
  if (s.value) pay(w, s.value, s.lease ? `${c.lease.prog}: lease handed back (${c.name}), deposit returned` : `Sold: ${c.year} ${c.name}`);
  w.car = null; w.grey = null;
  if (seriesById(w.player.series).car === 'classifieds') w.ads = makeAds(w);
  news(w, `${w.teams[w.player.team].name.toUpperCase()} SELLS ITS CAR`, `${w.teams[w.player.team].name}'s ${c.name} has been ${s.lease ? 'handed back to the program' : 'sold'}. The team says it is "restructuring".`);
  react(w, 'danny', `The player just ${s.lease ? 'handed back the leased race car' : `sold the race car (the ${c.year} ${c.name}) for ${money$(s.value)}`} to pay the bills. No race car now.`);
  return s;
}
// what selling a facility (its top level; premises: moving out to the next ones down) brings, before you do it:
// { name, value, saves (upkeep a round) }, { why } when you can't, or null when there's nothing to sell
export function facSale(w, k) {
  const t = myTeam(w), n = facLevel(t, k); if (n <= 0) return null;
  const L = k === 'base' ? FACILITIES.base.levels[n] : FACILITIES[k].levels[n - 1];
  if (k === 'base') { const blocker = FAC_KEYS.find(x => x !== 'base' && facLevel(t, x) && FACILITIES[x].levels[facLevel(t, x) - 1][3] > n - 1); if (blocker) return { why: `The ${facName(t, blocker).toLowerCase()} needs these premises: sell it first.` }; }
  const need = SERIES_NEEDS[w.player.series]?.[k]; if (need && n <= need) return { why: `The ${seriesById(w.player.series).name} requires it.` };
  return { name: L[0], value: Math.round(L[1] * 0.4 / 100) * 100, saves: k === 'base' ? L[2] - FACILITIES.base.levels[n - 1][2] : L[2], to: k === 'base' ? FACILITIES.base.levels[n - 1][0] : null };
}
export function sellFacility(w, k) {
  const s = facSale(w, k); if (!s || s.why) return { ok: false, why: s?.why || 'Nothing to sell.' };
  pay(w, s.value, k === 'base' ? `Moved out of the ${s.name.toLowerCase()} (fittings sold)` : `Sold: ${s.name}`);
  facOf(myTeam(w))[k] = facLevel(myTeam(w), k) - 1;
  return { ok: true, ...s };
}

// what a repair (of this much damage: 0..1 of a write-off) costs, before you have it done
export const repairQuote = (w, dmg) => Math.round(dmg * COSTS[w.player.series].repair * (bgOf(w).repair || 1) * staffEffects(w).repair / 100) * 100;
export const tyreCost = (w) => { const m = staffOf(w, 'manager'); return Math.round(COSTS[w.player.series].tyre * (m ? mgrTyre(m.skill) : 1) / 10) * 10; };
// a round you didn't drive yourself (Sim Rest Of Season): a plain weekend, no damage; the tyres come out of your stock
export function simUse(w) {
  const R = w.series[w.player.series].cal[w.round], wet = R && R.weather === 'rain', km = R && w.lapKm ? w.lapKm[R.name] : undefined;
  const need = w.opts.weekend === 'full' ? 3 : w.opts.weekend === 'quali' ? 2 : 1;
  let trackside = 0;
  for (let i = 0; i < need; i++) if (!takeSet(w, wet ? 'wet' : i < need - 1 ? 'soft' : 'medium')) trackside++;
  return { trackside, laps: (km === undefined ? w.opts.laps : raceLaps(w, km, km === 0)) + (w.opts.weekend === 'full' ? 18 : w.opts.weekend === 'quali' ? 6 : 0), damage: 0 };
}

// ---------------- the week: five days between rounds ----------------
// Each round has a week before it: five days to spend on earning (the day job, gigs), on the team (rebuilding parts
// yourself, a test day, a sponsor's event), or on nothing. The gigs are short drives on the race engine (main.js plays
// them): courier runs and funeral transport through the GigGo app, track-day passenger rides and club time attacks by
// email, and Danny's street races. Booking one takes its day; a booking not driven by race day is a no-show.
export const WEEK_DAYS = 5;
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const weekKey = (w) => `${w.year}-${w.round}`;
export function weekOf(w) {
  if (w.lawyerDue && setupDone(w) && w.week && w.week.used > 0) lawyerMail(w);
  if (!w.week || w.week.key !== weekKey(w)) {
    const prev = w.week;
    w.week = { key: weekKey(w), used: 0, log: [], booked: [], gigs: [], setup: false };
    if (prev && !w.pre) { noShows(w, prev); if (prev.log.length) { const net = prev.log.reduce((a, e) => a + (e.amt || 0), 0); w.weekAvg = w.weekAvg == null ? net : Math.round(w.weekAvg * 0.6 + net * 0.4); } }
    if (!w.pre) w.weekN = (w.weekN || 0) + 1;
    if (!w.pre && !w.over && w.founding?.reg && w.money && w.money.choice) { planWeek(w); seatWeek(w); if (w.bonds && w.bonds.danny) w.bonds.danny -= Math.sign(w.bonds.danny); }
    director(w);
  }
  return w.week;
}
export const daysLeft = (w) => WEEK_DAYS - weekOf(w).used;
// (no race car needed: the day job and GigGo use your own wheels or theirs; what needs the race car says so)
export const weekOpen = (w) => !!(w.founding?.reg && w.money && w.money.choice && !w.over);
export const hasRaceCar = (w) => !!w.car && !needsCar(w);
// (tag: the calendar's short name for the day; gig: a booked drive, filled in when it's driven)
function useDay(w, what, amt = 0, tag = '', gig = null) { const wk = weekOf(w); wk.log.push({ day: wk.used, what, amt, tag, gig }); wk.used++; if (w.projects && !w.pre) crewDay(w); eventsMissed(w, wk); }
// (and a day spent on the team: what the week's log shows)
export function spendDay(w, what, tag = '') { if (daysLeft(w) <= 0) return false; useDay(w, what, 0, tag); return true; }
// (a day you've said yes to (an interview, a coaching day, a wedding): booked, not spent. It waits in the day planner
// and the day goes when you do it; still not done by race day and it's a no-show. fx: what doing it does, in doPlan)
function bookDay(w, p) { const wk = weekOf(w); (wk.plans ??= []).push({ id: 'pl' + (w.nextId++), done: false, ...p }); }
export const plansOf = (w) => (weekOf(w).plans || []).filter(p => !p.done);
// days spoken for (booked jobs and days still to do), and what's free besides
export const bookedDays = (w) => bookedGigs(w).length + plansOf(w).length;
export const freeDays = (w) => daysLeft(w) - bookedDays(w);
export function doPlan(w, id) {
  const p = plansOf(w).find(x => x.id === id); if (!p || daysLeft(w) <= 0) return null;
  p.done = true;
  if (p.fx === 'press') {
    useDay(w, p.what, 0, p.tag);
    if (!p.given) { w.press = pressOf(w) + 2; w.rep = clamp(repOf(w) + 2, 0, 100); news(w, `INSIDE ${w.teams[w.player.team].name.toUpperCase()}: LOTTERY MONEY AND A LOT OF TIRES`, `"Everyone said I'd lose the lot," says the owner-driver. "I'm a bit behind schedule on that."`); }
    return { line: p.what, note: 'She followed you round all day. The piece comes out this week.' };
  }
  if (p.fx === 'job') {
    useDay(w, p.what, p.pay, p.tag); pay(w, p.pay, p.what);
    if (p.mate) { const q = mateOf(w) && w.people[mateOf(w).pid]; if (q) q.pace = clamp(q.pace + 0.6, 20, 99); }
    return { amt: p.pay, line: p.what, note: p.mate ? 'It was the corners.' : 'He still has the car. For now.' };
  }
  if (p.fx === 'wedding') {
    const ex = p.who; useDay(w, p.what, 0, p.tag); text(w, ex, `thank you for coming. brian says if you ever need a sponsor his business does bathrooms`);
    const i = SPONSOR_POOL.findIndex(s => s[0] === "Brian's Bathrooms & Kitchens");
    if (i >= 0 && dealsOf(w).length < SPONSOR_SLOTS.length) mail(w, "Brian's Bathrooms & Kitchens", 'brian@briansbathrooms.sv', 'Sponsorship', [`Great to see you at the wedding. ${ex} says you're a good driver, which I took on trust.`, `We'd like to put our name on your car. ${money$(Math.round(1300 * KS(w) * ASSOC_K / 50) * 50)} a round.`, 'Brian'],
      { sponsorOffer: { sid: 'sp' + i, slot: 'assoc', fee: Math.round(1300 * (SPONSOR_K[w.player.series] || 1) * ASSOC_K / 50) * 50, bonus: Math.round(1300 * (SPONSOR_K[w.player.series] || 1) * ASSOC_K * 0.6 / 50) * 50 }, choices: [['yes', 'Accept'], ['no', 'Decline']] });
    return { line: p.what, note: 'You went. It was fine. It was nice, actually.' };
  }
  useDay(w, p.what, 0, p.tag); return { line: p.what, note: '' };
}
// race day came and a day you'd said yes to wasn't done
function plansMissed(w, wk) {
  for (const p of (wk.plans || []).filter(x => !x.done)) {
    p.done = p.missed = true;
    if (p.fx === 'press') { w.press = pressOf(w) - 1; mail(w, JOURNO[0], JOURNO[1], 'The piece', [`I waited at your garage most of the day. Your car was very helpful. The piece runs anyway.`, JOURNO[0]]); }
    else if (p.fx === 'job' && p.mate) { const q = mateOf(w) && w.people[mateOf(w).pid]; if (q) text(w, q.first, `I waited at the circuit all day. I have decided the corners will have to wait too.`); }
    else if (p.fx === 'job') mail(w, p.from || 'SV Track Days', p.addr || 'bookings@svtrackdays.sv', 'Where were you?', [`We had you down for a day's coaching and you didn't turn up. Our member taught himself. It went about how you'd expect.`, p.from || 'SV Track Days']);
    else if (p.fx === 'wedding') text(w, p.who, `you said you'd come. it's fine`);
  }
}

// ---------------- days with your teammate (js/matedays.js) ----------------
// Three ideas a week: one on track or in the gym, one day out, one wild card (what they like comes up more, what they
// hate less). They're kept on the week (wk.mateIdeas), so looking again doesn't change them; one done is crossed off.
const mateNeeds = (w, d) => !d.needs || (d.needs === 'sponsor' ? (w.deals || []).length > 0 : d.needs === 'sim' ? facLevel(myTeam(w), 'sim') > 0 : !!staffOf(w, 'engineer'));
export function mateIdeas(w) {
  const m = mateOf(w); if (!m || m.human || w.over || !w.founding?.reg) return [];
  const wk = weekOf(w); if (wk.mateIdeas) return wk.mateIdeas;
  const tr = traitsOf(w, w.people[m.pid]), last = m.lastIdeas || [];
  const weight = (d) => (d.likes || []).some(t => tr.includes(t)) ? 3 : (d.hates || []).some(t => tr.includes(t)) ? 0.4 : 1;
  const pool = MATE_DAYS.filter(d => mateNeeds(w, d) && !last.includes(d.key)), picks = [];
  const take = (f) => { const ds = pool.filter(d => f(d) && !picks.includes(d)); if (!ds.length) return; let r = rng(w) * ds.reduce((a, d) => a + weight(d), 0); picks.push(ds.find(d => (r -= weight(d)) <= 0) || ds[0]); };
  take(d => d.kind === 'drive' || d.kind === 'body'); take(d => d.kind === 'out'); take(() => true);
  wk.mateIdeas = picks.map(d => ({ key: d.key, place: d.places[Math.floor(rng(w) * d.places.length)], cost: Math.round((d.cost[0] + rng(w) * (d.cost[1] - d.cost[0])) / 5) * 5 }));
  m.lastIdeas = picks.map(d => d.key);
  return wk.mateIdeas;
}
// an idea, as the planner shows it: { name, short, desc, cost, does, likes, hates, done }
export function mateIdeaInfo(w, x) {
  const m = mateOf(w), p = m && w.people[m.pid], d = MATE_DAYS.find(y => y.key === x.key); if (!p || !d) return null;
  const tr = traitsOf(w, p), place = x.place === 'the next circuit' ? w.series[w.player.series].cal[w.round].name : x.place;
  const fill = (t) => t.replace('{p}', place).replace(/\{m\}/g, p.first);
  const likes = (d.likes || []).some(t => tr.includes(t)), hates = (d.hates || []).some(t => tr.includes(t));
  const desc = d.desc || (likes ? `Right up ${p.first}'s street.` : hates ? `Not really ${p.first}'s thing.` : d.kind === 'out' ? 'Nothing to do with racing. That\'s the point.' : d.kind === 'work' ? 'Work, technically. Together, at least.' : d.kind === 'body' ? 'Fitter is steadier, late in a race.' : 'Time in a car, or close to one.');
  return { key: d.key, kind: d.kind, name: fill(d.name), short: fill(d.name.replace(/(:| (at|on|up)) \{p\}$/, '')), desc, cost: x.cost, does: fxText(d), likes, hates, done: !!x.done };
}
// spend the day on idea i: { amt, line, note } (what they got out of it is in the note)
export function mateDay(w, i) {
  const m = mateOf(w), x = mateIdeas(w)[i]; if (!m || !x || x.done || daysLeft(w) <= 0) return null;
  const d = MATE_DAYS.find(y => y.key === x.key), p = w.people[m.pid], tr = traitsOf(w, p), I = mateIdeaInfo(w, x), wk = weekOf(w);
  const bad = I.hates && rng(w) < 0.5;
  // (the same thing twice in a season is worth less)
  if (m.didY !== w.year) { m.didY = w.year; m.did = {}; }
  const n = m.did[d.key] || 0, k = 0.6 ** n * (I.likes ? 1.4 : 1) * (bad ? 0.3 : 1); m.did[d.key] = n + 1;
  const got = [];
  for (const [s, v] of Object.entries(d.fx || {})) { const was = p[s], top = s === 'pace' ? Math.max(was, p.pot ?? 99) : 99; p[s] = +Math.min(top, was + v * k).toFixed(2); if (p[s] - was >= 0.05) got.push(`${{ pace: 'Pace', craft: 'Racecraft', cons: 'Consistency', wet: 'Wet' }[s]} +${(p[s] - was).toFixed(1)}`); }
  trustOf(w); m.trust = clamp(m.trust + (bad ? -3 : d.trust * 0.6 ** n * (I.likes ? 1.5 : 1) * (tr.includes('loyal') ? 1.2 : 1)), 0, 100);
  m.morale = clamp(m.morale + (bad ? -2 : 1), 0, 100);
  if (d.rep && !bad) w.rep = clamp(repOf(w) + d.rep, 0, 100);
  if (d.setup && !bad && !wk.setup) { wk.brief = (wk.brief || 0) + d.setup * 2.5; got.push('some setup for you'); }
  if (x.cost) pay(w, -x.cost, `${I.name}, with ${p.first}`);
  useDay(w, `${I.name}, with ${p.first}`, -x.cost, `With ${p.first}`);
  x.done = true;
  const say = (t) => t.replace(/\{m\}/g, p.first);
  const line = bad ? say(pickLine(w, d.bad || ['{m} didn\'t enjoy it, and didn\'t pretend to.'])) : say(pickLine(w, d.out));
  return { amt: -x.cost, line: I.name, note: `${line}${got.length ? `<small>${got.join(' &middot; ')}</small>` : ''}`, bad };
}
// the day job: whatever you did before the lottery, a day at a time
const DAY_JOBS = {
  mechanic:   { name: 'A shift at Kowalski Auto Repair', pay: 340 },
  accountant: { name: 'Freelance bookkeeping', pay: 400 },
  salesman:   { name: 'A day on the lot at Velocita Motors', pay: 180, sale: [0.35, 700] },
  karting:    { name: 'Instructing at Thunder Alley Karts', pay: 260 },
  simracer:   { name: 'Online sim coaching', pay: 280 },
};
export const dayJob = (w) => DAY_JOBS[w.background] || { name: 'A shift at the Gas-N-Go', pay: 210 };

// ---------------- the co-owner's week ----------------
// Their own five days beside yours (w.week.co: { used, log, work (shifts this week), ask }): their job, their car, a
// look round SVList, development, a day off; and days together: one of you asks (ask: { what, from: 'P' | 'C' }), the
// other says yes, and it's a day from each of you.
export const COOP_TOGETHER = {
  garage: { name: 'Work on the cars together', short: 'Both cars', does: 'Both cars fixed up, the project moves on' },
  promo:  { name: 'Promote the team together', short: 'Promo day', does: '+3 reputation' },
};
const coopWk = (w) => { const wk = weekOf(w); return (wk.co ??= { used: 0, log: [], work: 0, ask: null }); };
export function coopWeek(w) { const c = coopWk(w); return { used: c.used, log: c.log, left: WEEK_DAYS - c.used, booked: 0, ask: c.ask, work: c.work }; }
export const coopDaysLeft = (w) => WEEK_DAYS - coopWk(w).used;
function coopUse(w, what, amt = 0, tag = '', gig = null) { const c = coopWk(w); c.log.push({ day: c.used, what, amt, tag, gig }); c.used++; }
// the co-owner takes a GigGo job: theirs now (off your list), driven on their copy, paid to the team, a day of their week
export function coopGigTake(w, id) {
  const wk = weekOf(w), g = gigById(w, id); if (!w.coop || !g || g.booked || g.done || coopDaysLeft(w) <= 0) return false;
  g.booked = 'C'; wk.gigs = wk.gigs.filter(x => x !== g); wk.offered = (wk.offered || []).filter(x => x !== g); (coopWk(w).gigs ??= []).push(g); return true;
}
export const coopGigDone = (w, id, r) => gigDone(w, id, r, 'C');
// the Paddock Wire wants a day with the team: either of you can give it. The co-owner's yes books a day of their own
// week (it waits in their day planner), and the day they do it is theirs
export function coopInterview(w, mailId) {
  const m = (w.mail || []).find(x => x.id === mailId), a = m && m.arc && (w.dir?.arcs || []).find(x => x.id === m.arc);
  if (!w.coop || !m || m.answer || !a || a.type !== 'press') return { err: 'not theirs' };
  if (coopDaysLeft(w) - coopPlans(w).length <= 0) return { err: 'No days free this week. Ask her for next week instead.' };
  m.answer = 'yes'; a.wait = null; a.done = true;
  (coopWk(w).plans ??= []).push({ id: 'pl' + (w.nextId++), done: false, fx: 'press', what: 'An interview with The Paddock Wire', tag: 'Interview' });
  return { msg: 'It\'s in your week: do it from the day planner.' };
}
// the co-owner answers an email that's theirs to answer: a job offered (a track day, a run: it goes in their week, to drive
// from their day planner), or an interview (coopInterview). Anything else: { err: 'not theirs' }
export function coopAnswer(w, mailId, key) {
  const m = (w.mail || []).find(x => x.id === mailId); if (!w.coop || !m) return { err: 'not theirs' };
  if (m.answer) return { err: 'Already answered.' };
  if (m.gig) {
    if (key !== 'in') { m.answer = key; return {}; }
    if (coopDaysLeft(w) - coopPlans(w).length - coopGigs(w).length <= 0) return { err: 'Every day left this week is spoken for.' };
    if (!coopGigTake(w, m.gig)) return { err: 'That job has gone.' };
    m.answer = 'in'; return { msg: 'It\'s in your week: drive it from your day planner.' };
  }
  if (m.arc && key === 'yes') return coopInterview(w, mailId);
  return { err: 'not theirs' };
}
// the co-owner's jobs taken and not driven yet
export const coopGigs = (w) => (coopWk(w).gigs || []).filter(g => !g.done);
export const coopPlans = (w) => (coopWk(w).plans || []).filter(p => !p.done);
export function coopDoPlan(w, id) {
  const p = coopPlans(w).find(x => x.id === id); if (!p || coopDaysLeft(w) <= 0) return null;
  p.done = true;
  if (p.fx === 'press') {
    const C = w.people[w.coop.pid], T = w.teams[w.player.team];
    coopUse(w, p.what, 0, p.tag); w.press = pressOf(w) + 2; w.rep = clamp(repOf(w) + 2, 0, 100);
    news(w, `INSIDE ${T.name.toUpperCase()}: THE OTHER OWNER`, `"${w.player.name.split(' ')[0]} had the lottery money," says co-owner ${C.first} ${C.last}. "I had a ${w.coop.kind === 'car' ? 'car, until last month' : w.coop.kind === 'house' ? 'house. I still have most of it' : w.coop.kind === 'boss' ? 'job, and a boss who reads the Wire' : 'lot of confidence'}."`);
    return { line: p.what, note: 'Nadia followed you round all day. The piece comes out this week.' };
  }
  return null;
}
// their job: the boss's company if the boss is a sponsor, otherwise a warehouse; about what a day job pays
export function coopJob(w) { const pay = Math.round(dayJob(w).pay * 1.1 / 10) * 10; return { name: w.coop?.boss ? `A shift at ${w.coop.boss}` : 'A shift at the warehouse', pay }; }
// car two's own repair, by hand (an owned car: the hire company fixes theirs)
export const coopCarCost = (w) => Math.round((COSTS[w.player.series] || COSTS.street).repair * 0.025 / 10) * 10;
const projOpen = (w) => (w.projects || []).find(x => !x.done && !x.shop);
// a day of the co-owner's: { amt, line, note } (null: they can't)
export function coopDay(w, key) {
  if (!w.coop || coopDaysLeft(w) <= 0) return null;
  const C = w.people[w.coop.pid], c = coopWk(w);
  if (key === 'work') { const j = coopJob(w); pay(w, j.pay, `${j.name} (${C.first})`); coopUse(w, j.name, j.pay, 'Work'); c.work++;
    return { amt: j.pay, line: j.name, note: w.coop.boss ? pickLine(w, ['Your boss saw you in. That counts for something.', 'Someone asked about the race car. You talked for an hour.']) : pickLine(w, ['Forklift certified. Still.', 'Nobody at work believes you race.']) }; }
  if (key === 'car') { const c2 = car2Of(w); if (!car2Owned(c2) || c2.cond >= 0.99) return null;
    const was = c2.cond, cost = coopCarCost(w); c2.cond = +Math.min(1, c2.cond + 0.15).toFixed(3); pay(w, -cost, `Parts for car 2 (${C.first} fixed it)`); coopUse(w, 'Worked on car two', -cost, 'Car two');
    return { amt: -cost, line: 'Worked on your car', note: `${Math.round(was * 100)}% &rarr; ${Math.round(c2.cond * 100)}%` }; }
  if (key === 'scout') { const L = (w.usedParts || []).filter(x => !x.scouted); if (!L.length) return null;
    const x = L.sort((a, b) => b.price - a.price)[0], was = x.price; x.price = Math.round(x.price * 0.7 / 50) * 50; x.scouted = true; coopUse(w, 'Went through SVList', 0, 'SVList');
    return { line: 'Went through SVList', note: `Talked the seller of the ${x.name} down: ${money$(was)} &rarr; ${money$(x.price)}.` }; }
  if (key === 'proj') { const x = projOpen(w); if (!x) return null; x.prog = (x.prog || 0) + 1 + facLevel(myTeam(w), 'tools') * 0.25; coopUse(w, `Worked on: ${x.name}`, 0, 'Car work'); if (x.prog >= x.days) finishProject(w, x);
    return { line: `Worked on: ${x.name}`, note: x.done ? 'Finished.' : `${Math.min(x.days, x.prog).toFixed(1)} of ${x.days} days of work done` }; }
  if (key === 'off') { coopUse(w, 'A day off', 0, 'Day off'); return { line: 'A day off', note: 'You mowed the lawn. It needed it.' }; }
  return null;
}
// a day together: asked by one ('P' or 'C'), then done when the other says yes (a day from each)
export function coopAsk(w, what, from) { if (!w.coop || !COOP_TOGETHER[what]) return false; const c = coopWk(w); if (c.ask) return false; c.ask = { what, from }; return true; }
export function coopCancelAsk(w) { const c = coopWk(w); c.ask = null; }
export function coopTogether(w, by) {
  const c = coopWk(w), a = c.ask; if (!a || a.from === by || coopDaysLeft(w) <= 0 || daysLeft(w) <= 0) return null;
  const T = COOP_TOGETHER[a.what], C = w.people[w.coop.pid]; c.ask = null;
  let note = '', amt = 0;
  if (a.what === 'garage') {
    const P = carParts(w), worst = P ? PART_KEYS.slice().sort((x, y) => P[x].cond - P[y].cond)[0] : null, c2 = car2Of(w), x = projOpen(w), bits = [];
    if (worst) { P[worst].cond = +Math.min(1, P[worst].cond + 0.12).toFixed(3); bits.push(`car one's ${PARTS[worst].name.toLowerCase()} ${Math.round(P[worst].cond * 100)}%`); }
    if (car2Owned(c2)) { c2.cond = +Math.min(1, c2.cond + 0.12).toFixed(3); bits.push(`car two ${Math.round(c2.cond * 100)}%`); }
    if (x) { x.prog = (x.prog || 0) + 2; if (x.prog >= x.days) finishProject(w, x); bits.push(`${x.name} ${x.done ? 'finished' : 'moved on'}`); }
    amt = -coopCarCost(w); pay(w, amt, `Parts: a day on both cars (with ${C.first})`);
    note = bits.length ? bits.join(', ') + '.' : 'Everything got a clean.';
  } else { w.rep = clamp(repOf(w) + 3, 0, 100); note = pickLine(w, ['A radio station, a car dealer and a school. The kids asked who was faster.', 'You signed a lot of hats. One of them was a bucket.']); }
  coopUse(w, T.name, amt, T.short); useDay(w, T.name, amt, T.short);
  return { amt, line: T.name, note };
}
export function workDay(w) {
  if (daysLeft(w) <= 0) return null;
  const j = dayJob(w); let amt = j.pay, note = '';
  if (j.sale && rng(w) < j.sale[0]) { amt += j.sale[1]; note = 'You sold a car.'; }
  pay(w, amt, `${j.name}${note ? ' (and a commission)' : ''}`);
  useDay(w, j.name, amt, 'Day job');
  w.dayJobDays = (w.dayJobDays || 0) + 1;
  return { amt, note };
}

// ---------- gigs ----------
// kinds: courier, hearse (GigGo); rides, attack (email); street (Danny). Each: { id, kind, title, client, pay,
// laps, theme, night, ... }. GigGo's offers depend on your rating; the emails come and go.
// (the time attack's gold, silver and bronze times, against a clean lap at the car's limit)
export const ATTACK_TIERS = [1.06, 1.11, 1.18];
export const GIG_KINDS = {
  courier: { name: 'Courier run', tag: 'Courier', van: 'transit', site: true },
  hearse:  { name: 'Funeral transport', tag: 'Funeral', van: 'hearse', site: true },
  rides:   { name: 'Track-day passenger rides', tag: 'Track day', raceCar: true },
  attack:  { name: 'Club time attack', tag: 'Time attack', raceCar: true },
  street:  { name: 'Street race', tag: 'Street race', raceCar: true, night: true },
};
const COURIER = [
  ['Velocita Dental Lab', 'Impressions, three boxes', true, false], ['Hargrove Legal', 'Signed documents', false, true],
  ['Pinewood Florist', 'Wedding flowers', true, false], ['Gutierrez Auto Parts', 'Brake discs, pallet', false, false],
  ['Sweet Tiers Bakery', 'A three-tier cake', true, false], ['City Hospital Pharmacy', 'Prescriptions', false, true],
  ['A private seller', 'A vintage mirror', true, false], ['TechNest', 'Laptops (returns)', false, false],
];
const RIDERS = ['Gary, 54, dentist', 'Priya, 31, birthday present', 'Doug, 67, "used to race"', 'Kelsey, 24, influencer', 'Martin, 45, bought it at a charity auction', 'Sandra, 58, her son booked it', 'Theo, 19, wants to be a driver', 'Rob, 40, stag do'];
// what each passenger calls a good ride: excitement (0..100) to keep them in, and what they say when it isn't
// ([low, high, bored, scared]). Below it they're bored; above it they're scared, and feel it in their stomach
const RIDER_WANTS = {
  Sandra: [25, 46, 'Sandra says it was lovely, and that her son could have done it himself.', 'Sandra has phoned her son. He isn\'t answering.'],
  Gary: [30, 52, 'Gary says he\'s had more exciting fillings.', 'Gary gripped the seat so hard he\'s booked himself in for a wrist X-ray.'],
  Priya: [35, 58, 'Priya says it was "nice". She\'s asked for a voucher for next year instead.', 'Priya would like to know who bought her this.'],
  Martin: [42, 65, 'Martin paid four hundred dollars at auction for that. He\'s mentioned it.', 'Martin is donating his next one back to the charity.'],
  Doug: [50, 76, 'Doug says in his day they\'d have been sideways through there.', 'Doug says that was a bit much, even for 1974.'],
  Kelsey: [55, 82, 'Kelsey\'s video got eleven views.', 'Kelsey\'s video is mostly the floor of the car.'],
  Theo: [60, 88, 'Theo asked if he could drive it himself. You said no. He asked again.', 'Theo has decided to be an accountant.'],
  Rob: [66, 95, 'Rob\'s mates are calling it "the taxi ride".', 'Rob\'s mates have the video. It\'s the best man\'s speech now.'],
};
export const riderWants = (rider) => RIDER_WANTS[String(rider).split(',')[0]] || [35, 65, 'They say it was fine.', 'They say it was a lot.'];
export const gigRating = (w) => (w.gig ??= { rating: 4.8, jobs: 0, stars: [] }).rating;
const themeOf = (w) => TOWNS[w.home]?.theme || 'city';
// (three different people: one name twice read like a mistake)
function threeRiders(w) { const out = []; for (let i = 0; i < 20 && out.length < 3; i++) { const r = pickLine(w, RIDERS); if (!out.some(x => x.split(',')[0] === r.split(',')[0])) out.push(r); } while (out.length < 3) out.push(pickLine(w, RIDERS)); return out; }
function newGig(w, kind, o = {}) { return { id: 'g' + (w.nextId++), kind, laps: 1, theme: themeOf(w), ...o }; }
const fresh = (w) => w.round === 0 && !w.again && !w.player.starts; // (a new team, before its first race)
function planWeek(w) {
  const wk = w.week, r = gigRating(w), K = { club: 0.8, street: 1, gt2: 1.6, gt: 2.5, groupc: 4, formula: 6 }[w.player.series] || 1, broke = w.money.balance < 25000;
  // GigGo: two or three offers (one, under review)
  const n = r < 4.2 ? 1 : r >= 4.8 ? 4 : 3;
  for (let i = 0; i < n; i++) {
    if (i === n - 1 && rng(w) < 0.4) { wk.gigs.push(newGig(w, 'hearse', { client: 'Restwell Funeral Home', title: 'Funeral transport', what: 'Please arrive within the window. The family will be following.', pay: 950, window: [1.3, 1.65] })); continue; }
    const [client, what, fragile, urgent] = pickLine(w, COURIER);
    const fare = Math.round((560 + rng(w) * 440 + (urgent ? 220 : 0)) * (r >= 4.8 ? 1.1 : 1) / 10) * 10;
    wk.gigs.push(newGig(w, 'courier', { client, what, fragile, urgent, title: `${client}: ${what.toLowerCase()}`, pay: fare, laps: rng(w) < 0.4 ? 2 : 1, tight: urgent ? 1.3 : 1.45 }));
  }
  // from GT up: corporate hot laps, and coaching people who've bought a car like yours
  if (seriesById(w.player.series).pro) { proWeek(w, K); }
  // track days and club events (your race car); not in a new team's first week, before its first race
  else if (fresh(w)) { /* none yet */ }
  else if (rng(w) < 0.55) offerGig(w, newGig(w, 'rides', { title: 'Passenger rides', client: 'SV Track Days', pay: 320, tip: 150, laps: 3, riders: threeRiders(w) }), 'SV Track Days', 'bookings@svtrackdays.sv', 'Passenger rides this week?',
    [`Hi,`, `We've got three customers booked in for passenger rides in a "real race car" this week and our usual driver has done his back in.`, `It's three laps, one passenger a lap. We pay ${money$(320)} a ride, and they tip if they enjoy it. They don't tip if they're sick.`, `Your car, your fuel, your tires.`, `SV Track Days`]);
  else if (rng(w) < 0.4) offerGig(w, newGig(w, 'attack', { title: 'Time attack', client: `${TOWNS[w.home]?.name || 'Velocita'} Auto Club`, entry: 100, prizes: [2000, 1200, 500], laps: 3 }), `${TOWNS[w.home]?.name || 'Velocita'} Auto Club`, 'events@autoclub.sv', 'Time attack, members and guests',
    [`Our monthly time attack is on this week. Three laps, your best one counts.`, `Prize money: ${money$(2000)} for the gold time, ${money$(1200)} silver, ${money$(500)} bronze. Entry is ${money$(100)}. Guests welcome.`, `Guests welcome. Helmets compulsory.`, `The Committee`]);
  // Danny knows a guy (more often when money's short)
  if (!fresh(w) && rng(w) < (broke ? 0.5 : 0.22)) {
    const pot = Math.round((1200 + rng(w) * 1600) * (broke ? 1.25 : 1) * K / 100) * 100, who = pickLine(w, ['Vince', 'a guy called Marco', 'Big Steve', 'Tash', 'Dmitri', 'this kid Jayden']);
    offerGig(w, newGig(w, 'street', { title: 'Street race', client: who, pay: pot, laps: 2, night: true, theme: 'city' }), 'Danny', 'dannyboy1979@coolmail.sv', 'friday',
      [`Yo so ${who} wants to race you. Friday night, the industrial estate, two laps`, `${money$(pot)} cash, winner takes it`, `Cops don't really go there. Mostly`]);
  }
  // hospitality: their clients, a day every week (part of the deal: no invitation, it's in the planner till Friday)
  for (const d of dealsOf(w).filter(d => d.hosp)) {
    const what = pickLine(w, ['a golf day with their clients', 'a workshop tour for their clients', 'hot laps for their clients', 'lunch with their clients, and the car', 'their clients\' kids, and the car']);
    (wk.events ??= []).push({ id: 'ev' + (w.nextId++), sid: d.sid, what, by: 4, rsvp: 'deal', hosp: true, done: false });
  }
  // a sponsor's event: on a day this week (it's in the day planner until then)
  const deals = dealsOf(w).filter(d => !d.shady && !d.hosp);
  if (deals.length && !fresh(w) && rng(w) < 0.4) {
    const d = deals[Math.floor(rng(w) * deals.length)], sp = sponsorById(d.sid);
    const what = pickLine(w, ['our grand reopening', 'our summer sale', 'a customer appreciation day', 'our 25th anniversary', 'a charity car wash']);
    const ev = { id: 'ev' + (w.nextId++), sid: d.sid, what, by: 1 + Math.floor(rng(w) * 3), rsvp: null, done: false };
    (wk.events ??= []).push(ev);
    mail(w, sp.name, sponsorAddr(sp.name), `Will you come to ${what}?`,
      [`We're having ${what} on ${DAY_FULL_NAMES[ev.by]} and it would mean a lot to have the team there. Bring the car if you can.`, `Our customers would love to meet a real racing driver. Some of them have asked who you are.`, `Please let us know either way.`, sp.name],
      { event: ev.id, choices: [['yes', `I'll be there (${DAY_FULL_NAMES[ev.by]})`], ['no', "Sorry, can't make it"]] });
  }
}
// ---------- sponsors' events: a day this week, by a date; say no and they understand, don't turn up and they don't ----------
const DAY_FULL_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const eventById = (w, id) => (weekOf(w).events || []).find(e => e.id === id);
// still to go to (and still time): what the day planner offers
export const openEvents = (w) => (weekOf(w).events || []).filter(e => !e.done && e.rsvp !== 'no' && weekOf(w).used <= e.by && (e.inv || dealsOf(w).some(d => d.sid === e.sid)));
export function rsvpEvent(w, id, key) { const e = eventById(w, id); if (!e || e.done) return; e.rsvp = key; }
// (marked done before the day's used: using the day is what moves the week past its date)
export function attendEvent(w, id) { const e = eventById(w, id); if (e && e.inv) return attendDinner(w, id); if (!e || e.done) return false;
  // (hospitality: it's the job, so no favours owed)
  if (e.hosp) { if (daysLeft(w) <= 0) return false; e.done = true; useDay(w, `${sponsorById(e.sid).name}: ${e.what}`, 0, 'Sponsor'); return true; }
 e.done = true; if (!appear(w, e.sid)) { e.done = false; return false; } return true; }
// the day's gone past an event's date: they waited (said yes and didn't come: they waited longer)
function eventsMissed(w, wk = w.week) {
  for (const e of (wk && wk.events) || []) {
    if (e.done || e.missed || e.rsvp === 'no' || wk.used <= e.by) continue;
    e.missed = true;
    if (e.inv) { const I = w.investor; if (I && I.stage === 'dinner') { I.interest = clamp(I.interest - 15, 0, 100); I.next = nowIdx(w) + 2; mail(w, I.name.join(' '), INV_ADDR(I), 'Dinner', [`I waited forty minutes. I ordered for both of us, in the end, and ate both.`, I.name[0]]); } continue; }
    const d = dealsOf(w).find(x => x.sid === e.sid); if (!d) continue;
    if (e.hosp) { const sp = sponsorById(e.sid); d.misses += 1; w.rep = clamp(repOf(w) - 1, 0, 100); mail(w, sp.name, sponsorAddr(sp.name), 'Our clients', [`Our clients were expecting you this week (${e.what}). We had to tell them you were "unavoidably detained."`, `Hospitality is what we pay you for. It's in the contract, page four.`, sp.name]); continue; }
    const sp = sponsorById(e.sid), flaked = e.rsvp === 'yes';
    d.misses += flaked ? 2 : 1; w.rep = clamp(repOf(w) - (flaked ? 3 : 1), 0, 100);
    mail(w, sp.name, sponsorAddr(sp.name), flaked ? 'Where were you?' : 'We missed you', [flaked ? `We told our customers you'd be at ${e.what}. You weren't. Several of them asked for their balloons back.` : `We didn't hear back about ${e.what}, so we assume you were busy. It would have been nice to know.`, `We'll bear it in mind.`, sp.name]);
  }
}
function proWeek(w, K) {
  const car = w.car ? w.car.name : 'your car';
  if (rng(w) < 0.6) offerGig(w, newGig(w, 'rides', { title: 'Corporate hot laps', client: 'Velocita Corporate Events', pay: Math.round(400 * K / 10) * 10, tip: Math.round(150 * K / 10) * 10, laps: 3, riders: threeRiders(w) }), 'Velocita Corporate Events', 'events@velocitacorporate.sv', 'Hot laps for our client',
    [`Hello,`, `One of our clients is holding a team-building day at the circuit this week, and would like three of their senior people taken round in a real ${seriesById(w.player.series).name} car.`, `${money$(Math.round(400 * K / 10) * 10)} a passenger. They have been told it is safe. Please make it feel otherwise.`, `Velocita Corporate Events`]);
  if (rng(w) < 0.45) {
    const pay = Math.round((1500 + rng(w) * 1500) * K / 100) * 100;
    mail(w, 'SV Track Days', 'bookings@svtrackdays.sv', 'Coaching, one of our members',
      [`Hi,`, `One of our members has bought a ${car} and would like to learn how to drive it, ideally before he sells it.`, `A day's coaching, ${money$(pay)}. He supplies the car, the fuel and the nerves.`, `SV Track Days`],
      { dayJob: { what: 'Coaching a track day client', pay, tag: 'Coaching' }, choices: [['go', `Take it: ${money$(pay)} (a day)`], ['no', 'Not this week']] });
  }
  // your gentleman driver would like some help
  const m = mateOf(w), q = m && w.people[m.pid];
  if (q && traitsOf(w, q).includes('gentleman') && rng(w) < 0.5) {
    const pay = Math.round(2000 * K / 100) * 100;
    mail(w, `${q.first} ${q.last}`, `${q.first[0].toLowerCase()}${q.last.toLowerCase()}@velocitamail.sv`, 'A day at the track?',
      [`I wonder if you could spare a day this week to show me where I am losing the time. I have a theory that it is the corners.`, `I would of course pay you for your time: ${money$(pay)}.`, q.first],
      { dayJob: { what: `Coaching ${q.first}`, pay, tag: 'Coaching', mate: true }, choices: [['go', `Coach ${q.first}: ${money$(pay)} (a day)`], ['no', 'Not this week']] });
  }
}
function offerGig(w, g, from, addr, subj, body) {
  w.week.offered = (w.week.offered || []).concat([g]);
  mail(w, from, addr, subj, body, { gig: g.id, choices: [['in', g.kind === 'street' ? "I'm in" : `Book it (a day)`], ['no', 'Not this week']] });
}
// (the booked copy first: a save turns the one job in two lists into two copies)
export const gigById = (w, id) => { const wk = weekOf(w); return wk.booked.find(g => g.id === id) || wk.gigs.find(g => g.id === id) || (wk.offered || []).find(g => g.id === id) || (wk.co?.gigs || []).find(g => g.id === id); };
// take one: it holds a day of the week; drive it from the day planner (the day goes when you drive it)
export function bookGig(w, id) {
  const wk = weekOf(w), g = gigById(w, id);
  if (!g || g.booked) return 'gone';
  if (freeDays(w) <= 0) return 'nodays';
  if (GIG_KINDS[g.kind].raceCar && needsCar(w)) return 'nocar';
  g.booked = true; wk.booked.push(g); wk.gigs = wk.gigs.filter(x => x !== g);
  return 'ok';
}
// (a job done is done in every list it's in: saves from before that was kept had it done in just one)
export const bookedGigs = (w) => { const wk = weekOf(w), done = new Set([...wk.gigs, ...(wk.offered || []), ...wk.booked].filter(g => g.done).map(g => g.id)); return wk.booked.filter(g => !done.has(g.id)); };
// a sponsor's event: a day, and they remember it
export function appear(w, sid) {
  const d = dealsOf(w).find(x => x.sid === sid); if (!d || daysLeft(w) <= 0) return false;
  const sp = sponsorById(sid);
  useDay(w, `${sp.name}: an appearance`, 0, 'Sponsor event');
  d.misses = Math.max(0, d.misses - 1); w.rep = clamp(repOf(w) + 2, 0, 100);
  mail(w, sp.name, sponsorAddr(sp.name), 'Thank you!', [pickLine(w, [`Thanks for coming. Several customers asked if you were famous. We said yes.`, `Thank you for coming along. The photos came out well, apart from the ones with the car in them.`, `Thanks for being there. Sales were up 3% on the day, which our accountant says is not significant, but we think it is.`]), sp.name]);
  return true;
}

// what a drive earned. r: { finished, time (s), ref (the reference time for the distance, s), dmg (0..1), comfort
// (0..100, hearse), lapTimes, lapRides (rides: { in, lo, hi: shares of the lap; sick }), won } -> { rows: [[label, amt]], stars, net, head, line }
export function gigDone(w, id, r, who = 'P') {
  const g = gigById(w, id); if (!g || g.done) return null;
  g.done = true;
  // (co-op: the co-owner's job: a day of their week, their car two)
  const C = who === 'C' && !!w.coop, log = C ? coopWk(w).log : weekOf(w).log;
  // (the day it took, and the entry fee: now it's been driven. Jobs booked before that was so spent theirs on booking)
  if (!log.some(x => x.gig === g.id) && (C ? coopDaysLeft(w) : daysLeft(w)) > 0) {
    if (g.entry && !g.entryPaid) { g.entryPaid = true; pay(w, -g.entry, `${g.client}: entry fee`); }
    if (C) coopUse(w, GIG_KINDS[g.kind].name, g.entry ? -g.entry : 0, GIG_KINDS[g.kind].tag, g.id);
    else useDay(w, GIG_KINDS[g.kind].name, g.entry ? -g.entry : 0, GIG_KINDS[g.kind].tag, g.id);
  }
  { const wk = weekOf(w); for (const x of [...wk.gigs, ...(wk.offered || []), ...wk.booked]) if (x.id === id) x.done = true; }
  const rows = [], add = (t, a) => { if (a) rows.push([t, Math.round(a)]); };
  let stars = 5, head = '', line = '';
  if (g.kind === 'courier' || g.kind === 'hearse') {
    if (!r.finished) { stars = 1; head = 'Not delivered'; line = g.kind === 'hearse' ? 'Restwell have arranged another driver.' : 'The customer has been refunded. GigGo have noted it.'; }
    else {
      const k = r.time / r.ref; let fare = g.pay;
      add('Fare', fare);
      if (g.kind === 'courier') {
        const late = Math.max(0, k - g.tight);
        if (late > 0) { const cut = Math.min(0.6, late * 2.5) * fare; add('Late delivery adjustment', -cut); stars -= late > 0.12 ? 2 : 1; }
        const broke = clamp(r.dmg * (g.fragile ? 3.5 : 1.6), 0, 1);
        if (broke > 0.05) { add(g.fragile ? 'Damaged goods claim' : 'Damage claim', -broke * fare); stars -= broke > 0.4 ? 2 : 1; }
        head = late > 0 ? 'Delivered late' : broke > 0.4 ? 'Delivered (mostly)' : 'Delivered';
        line = late > 0 ? `${g.client} expected it ${Math.round((k - g.tight) * r.ref)} seconds sooner.` : broke > 0.05 ? (g.fragile ? 'The customer has sent photos.' : 'Some of it was dented.') : pickLine(w, ['The customer left a thumbs up.', 'Signed for by "J".', 'Left with a neighbor, as requested.']);
      } else {
        const [a, b] = g.window, comfort = r.comfort ?? 100;
        if (k < a) { add('Arrived early', -fare * 0.35); stars -= 1; line = 'You arrived before the family did.'; }
        else if (k > b) { add('Arrived late', -fare * Math.min(0.6, (k - b) * 3)); stars -= 2; line = 'The service started without you.'; }
        if (comfort < 80) { add('Complaint from the family', -fare * (1 - comfort / 100) * 1.5); stars -= comfort < 55 ? 2 : 1; line = line || 'The family has asked for a different driver next time.'; }
        if (r.dmg > 0.03) { add('Bodywork', -Math.min(fare, r.dmg * 2000)); stars -= 1; }
        head = stars >= 4 ? 'A dignified service' : 'Not ideal';
        line = line || 'Restwell would be happy to use you again.';
      }
      const fee = rows.reduce((a, x) => a + x[1], 0) > 0 ? rows.reduce((a, x) => a + x[1], 0) * 0.25 : 0;
      add('GigGo service fee (25%)', -fee); add('Trust & Safety fee', -3);
    }
    rateGig(w, clamp(stars, 1, 5));
  } else if (g.kind === 'rides') {
    // each ride: the share of the lap they spent where they wanted to be pays the tip; sick is a refund
    const laps = r.lapTimes || [], R = r.lapRides || [];
    laps.forEach((t, i) => {
      const who = g.riders[i].split(',')[0], x = R[i] || { in: 0, lo: 1, hi: 0, sick: false };
      add(`Ride ${i + 1}: ${who}`, g.pay);
      if (x.sick) add(`${who} was sick: refund and cleaning`, -g.pay - 60);
      else if (x.in >= 0.35) add(`${who}'s tip (${Math.round(x.in * 100)}% of the lap just right)`, g.tip * clamp((x.in - 0.35) / 0.45, 0.2, 1));
    });
    head = laps.length ? `${laps.length} ride${laps.length === 1 ? '' : 's'}` : 'No rides';
    // (everyone got the ride they wanted: they talk about it, and some of them know people)
    const clean = laps.length >= g.laps && R.slice(0, g.laps).every(x => !x.sick && x.in >= 0.6);
    if (clean) w.rep = clamp(repOf(w) + 1, 0, 100);
    const worst = R.map((x, i) => ({ ...x, i })).filter(x => !x.sick && x.in < 0.6).sort((a, b) => a.in - b.in)[0];
    line = laps.length < g.laps ? `You left with ${g.laps - laps.length} customer${g.laps - laps.length === 1 ? '' : 's'} still waiting. SV Track Days refunded them.` : R.some(x => x.sick) ? 'SV Track Days would like to know how the inside of the car is.' : clean ? 'Everyone got the ride they wanted. Word gets around (+1 reputation).' : worst ? riderWants(g.riders[worst.i])[worst.lo >= worst.hi ? 2 : 3] : 'SV Track Days say the customers were happy.';
  } else if (g.kind === 'attack') {
    const best = Math.min(...(r.lapTimes || [Infinity])), k = best / r.ref, tier = ATTACK_TIERS.findIndex(x => k <= x);
    if (tier >= 0) add(`${['Gold', 'Silver', 'Bronze'][tier]} time`, g.prizes[tier]);
    head = tier >= 0 ? `${['Gold', 'Silver', 'Bronze'][tier]} time` : 'No time';
    line = tier === 0 ? 'The Committee has asked whether you are a member.' : tier >= 0 ? 'Your name goes on the board in the clubhouse.' : 'Better luck next month.';
  } else if (g.kind === 'street') {
    if (r.won) { add(`Winnings from ${g.client}`, g.pay); head = 'You won'; line = `${g.client} paid up. Eventually.`; }
    else { add('Your stake', -g.pay / 2); head = r.finished ? 'You lost' : 'You didn\'t finish'; line = `${g.client} has your money.`; }
    w.street = (w.street || 0) + 1;
    if (rng(w) < 0.18) {
      w.licence = (w.licence || 0) + 3;
      add('Fine: street racing', -1500);
      head += ', and the police came'; line = `Three points on your license (${w.licence} now).`;
      if (w.licence >= 6) { news(w, `${w.teams[w.player.team].name.toUpperCase()} OWNER CAUGHT STREET RACING`, `A ${seriesById(w.player.series).name} team owner was among those stopped by police at an industrial estate on Friday night.`); w.rep = clamp(repOf(w) - 6, 0, 100); }
    }
  }
  // your race car paid for it too
  if (GIG_KINDS[g.kind].raceCar && w.car) {
    if (C) { const c2 = car2Of(w), laps = r.lapTimes ? r.lapTimes.length : g.laps; if (car2Owned(c2)) c2.cond = +Math.max(0.3, c2.cond - 0.01 * laps - (r.dmg || 0) * 0.6).toFixed(3); if ((r.dmg || 0) > 0.005) add('Repairs (car two)', -repairQuote(w, r.dmg)); }
    else { wearCar(w, r.lapTimes ? r.lapTimes.length : g.laps, r.dmg || 0, null); if ((r.dmg || 0) > 0.005) add('Repairs', -repairQuote(w, r.dmg)); }
  }
  for (const [t, a] of rows) pay(w, a, `${g.client}: ${/^(GigGo|Trust)/.test(t) ? t : t[0].toLowerCase() + t.slice(1)}`);
  const net = rows.reduce((a, x) => a + x[1], 0);
  if (!C && (g.kind === 'street' || (stars != null && stars <= 2 && GIG_KINDS[g.kind].site) || (r.dmg || 0) > 0.15 || (g.kind === 'attack' && net > 0) || (g.kind === 'rides' && (r.lapRides || []).some(x => x.sick))))
    react(w, 'danny', `The player did a side job this week: ${GIG_KINDS[g.kind].name.toLowerCase()} for ${g.client}${g.what ? ` (${g.what.toLowerCase()})` : ''}. How it went: ${head.toLowerCase()}. ${line} They made ${money$(net)} on it in the end.${(r.dmg || 0) > 0.15 ? ' The vehicle came back damaged.' : ''}`);
  const e = log.find(x => x.gig === g.id);
  if (e) { e.amt += net; e.what = `${GIG_KINDS[g.kind].name}: ${head.toLowerCase()}`; e.done = true; }
  return { rows, net, stars: GIG_KINDS[g.kind].site ? clamp(stars, 1, 5) : null, head, line };
}
function rateGig(w, s) {
  const G = w.gig ??= { rating: 4.8, jobs: 0, stars: [] };
  G.stars.push(s); if (G.stars.length > 20) G.stars.shift(); G.jobs++;
  G.rating = +((4.8 * 8 + G.stars.reduce((a, b) => a + b, 0)) / (8 + G.stars.length)).toFixed(2); // (new drivers start on 4.8: eight good reviews' worth)
}
// race day came and a booked gig wasn't driven
function noShows(w, wk) {
  wk.used = Math.max(wk.used, WEEK_DAYS); eventsMissed(w, wk); plansMissed(w, wk); // (the week's over: whatever's left was missed)
  const done = new Set([...wk.gigs, ...(wk.offered || []), ...wk.booked].filter(g => g.done).map(g => g.id));
  for (const g of wk.booked) if (!g.done && !done.has(g.id)) {
    if (GIG_KINDS[g.kind].site) rateGig(w, 1);
    else if (g.kind === 'street') texts(w, 'Danny', [`${g.client} says you bottled it`, `I told him you were busy`, `Were you busy`]);
    else mail(w, g.client, 'noreply@svtrackdays.sv', 'Where were you?', [`We had you down for this week and you didn't turn up. We won't be booking you again for a while.`, g.client]);
  }
}
// your own spanners: a rebuild for the price of the parts, and a day
export const selfCost = (w, k) => Math.round(rebuildCost(w, k) * (staffOf(w, 'mechanic') ? 0.45 : 0.3) * (w.background === 'mechanic' ? 0.8 : 1) / 50) * 50;
// (who: 'C', the co-owner did it: a day of their week)
export function rebuildSelf(w, k, who = 'P') {
  const C = who === 'C' && !!w.coop, P = carParts(w); if (!P || (C ? coopDaysLeft(w) : daysLeft(w)) <= 0) return false;
  const to = (w.background === 'mechanic' ? 0.84 : 0.72) + (rng(w) - 0.5) * 0.1;
  P[k].cond = +Math.max(P[k].cond, clamp(to, 0.4, 0.92)).toFixed(3);
  pay(w, -selfCost(w, k), `${PARTS[k].name}: parts for a rebuild (${C ? `${w.people[w.coop.pid].first} did it` : 'you did it'})`);
  if (C) coopUse(w, `Rebuilt the ${PARTS[k].name.toLowerCase()}`, -selfCost(w, k), 'Rebuild');
  else useDay(w, `Rebuilt the ${PARTS[k].name.toLowerCase()} yourself`, -selfCost(w, k), 'Rebuild');
  return true;
}
// a test day at the next round's circuit: track hire, then a practice session (main.js); enough laps and the setup
// is found for that round
export const testCost = (w) => ({ club: 600, street: 1200, gt2: 3000, gt: 6000, groupc: 12000, formula: 25000 }[w.player.series] || 1200);
export function bookTest(w) {
  if (daysLeft(w) <= 0) return false;
  const R = w.series[w.player.series].cal[w.round];
  pay(w, -testCost(w), `${R.name}: track hire, test day`);
  weekOf(w).tested = true;
  useDay(w, `Test day at ${R.name}`, -testCost(w), 'Test day');
  return true;
}
export function testDone(w, laps) {
  if (laps > 0) wearCar(w, laps, 0, null);
  const fuel = Math.round(laps * COSTS[w.player.series].fuelLap * (bgOf(w).fuel || 1)), e = weekOf(w).log.find(x => x.tag === 'Test day');
  pay(w, -fuel, `Test day: fuel (${laps} lap${laps === 1 ? '' : 's'})`); if (e) { e.amt -= fuel; e.done = true; }
  if (laps >= 5) weekOf(w).setup = true;
  return weekOf(w).setup;
}

// ---------------- temptations and the story director ----------------
// Between rounds (as each week starts) the director looks at the world: it moves on the stories already running,
// starts new ones when there's room, rolls the consequences of what you've done, and now and then puts a temptation
// in front of you. How desperate you are decides how often temptations come and how good they look. Everything
// arrives as mail (choices) or texts; answers come back through answerStory. Nothing here needs the race engine, so
// seasons can be simulated (tools/simcareer.mjs).
const KS = (w) => ({ club: 0.7, street: 1, gt2: 1.8, gt: 3, groupc: 5, formula: 9 }[w.player.series] || 1);
const nowIdx = (w) => w.weekN || 0;
// what an average round costs you, after what comes in (sponsors, a mid-field prize), at today's prices
export function roundBurn(w) {
  const c = COSTS[w.player.series], m = mateOf(w);
  const out = c.entry + c.travel * 0.7 + c.crew + c.tyre * 2.5 + c.fuelLap * 14 + c.repair * 0.08 + payrollDue(w) + (m && m.wage && m.pay !== 'hold' ? m.wage : 0)
    + (w.loans || []).filter(l => !l.paid && !l.shark).reduce((a, l) => a + l.per, 0);
  const inc = dealsOf(w).reduce((a, d) => a + d.fee, 0) + c.prize[5];
  return Math.max(500, out - inc);
}
export const runwayOf = (w) => w.money ? w.money.balance / roundBurn(w) : 99;
// ---------- the forecast (Team: Finances): what a round costs and brings in as things stand, where the money's going ----------
// Costs are what your setup costs now (staff on their pay settings, your premises, the lease, the loan); repairs are
// your average so far this season; prize money is for your average finishing positions; the week is your average.
// what a round's wear costs to put right, about (a race's laps on each part, rebuilt halfway between a shop's price
// and doing it yourself; a leased car's engine and gearbox are the programme's)
function wearCost(w) {
  if (!w.car || !carParts(w)) return 0;
  return PART_KEYS.reduce((a, k) => { if (w.car.lease && (k === 'engine' || k === 'gearbox')) return a; const p = PARTS[k], per = p.wear + p.lap * 14; return a + per / 0.3 * (rebuildCost(w, k) + selfCost(w, k)) / 2; }, 0);
}
export function finances(w) {
  if (!w.money || !w.money.choice) return null;
  const sid = w.player.series, c = COSTS[sid], S = w.series[sid], left = w.over ? 0 : w.opts.len - w.round, m = mateOf(w), t = myTeam(w), bg = bgOf(w);
  const yr = w.money.tx.filter(x => x.y === w.year), raced = S.results.length;
  const spent = (re) => -yr.filter(x => x.amt < 0 && re.test(x.what)).reduce((a, x) => a + x.amt, 0);
  const mgr = staffOf(w, 'manager'), mw = m && m.wage ? (m.pay === 'full' ? m.wage : m.pay === 'half' ? Math.round(m.wage / 2) : 0) : 0;
  const costs = [
    ['Entry fee', c.entry], ['Travel', Math.round(c.travel * staffEffects(w).travel * (facLevel(t, 'truck') ? 0.65 : 1))], ['Pit crew', c.crew],
    ['Tires', Math.round(tyreCost(w) * 2.5)], ['Fuel', Math.round(c.fuelLap * 14 * (bg.fuel || 1))],
    ['Wear and repairs', Math.max(raced ? spent(/rebuild \(|repairs|^new |crash|parts for a rebuild/i) / raced : 0, wearCost(w))],
    ['Premises', facUpkeep(t)], ['Staff wages', Math.max(0, payrollDue(w) - (w.wageClaims || 0))], ['Teammate', mw],
    ['Car lease', w.car?.lease?.perRound || 0], ['Bank loan', (w.loans || []).filter(l => !l.paid && !l.shark).reduce((a, l) => a + l.per, 0)],
  ].filter(x => x[1] > 0).map(([k, v]) => [k, Math.round(v / 10) * 10]);
  const avgPos = (pid) => { const r = S.results.flatMap(x => x.rows.filter(y => y.pid === pid && !y.dnf)); return r.length ? Math.round(r.reduce((a, y) => a + y.pos, 0) / r.length) : null; };
  const myPos = avgPos('P') || 7, matePos = m ? avgPos(m.pid) || 8 : null, job = dayJob(w);
  const hit = (d) => d.met + d.misses ? d.met / (d.met + d.misses) : 0.5;
  const income = [
    ['Sponsors', dealsOf(w).reduce((a, d) => a + d.fee + d.bonus * hit(d), 0)],
    [`Prize, you (P${myPos})`, (c.prize[myPos - 1] || 0) * (bg.prize || 1)],
    ...(m ? [[`Prize, car 2 (P${matePos})`, (c.prize[matePos - 1] || 0) * (bg.prize || 1)]] : []),
    [w.weekAvg != null ? 'Your weeks' : 'Your weeks (est.)', w.weekAvg != null ? w.weekAvg : job.pay * 3],
  ].filter(x => x[1] > 0).map(([k, v]) => [k, Math.round(v / 10) * 10]);
  const out = costs.reduce((a, x) => a + x[1], 0), inn = income.reduce((a, x) => a + x[1], 0), net = inn - out;
  // the season's end: the prize funds, at where you stand now
  const st = standings(w, sid), pos = raced ? st.findIndex(e => e.pid === 'P') + 1 : 7, tst = teamStandings(w, sid), tpos = raced ? tst.findIndex(e => e.tid === t.id) + 1 : 5;
  const fundEnd = Math.round(((fundOf(w, sid)[pos - 1] || 0) + (teamFundOf(w, sid)[tpos - 1] || 0)) / 10) * 10;
  const proj = [w.money.balance]; for (let i = 0; i < left; i++) proj.push(proj[i] + net);
  const end = proj.at(-1) + fundEnd, runway = net < 0 ? w.money.balance / -net : null;
  // what you could change (only what applies, with its numbers)
  const levers = [];
  if (net < 0 && (w.weekAvg ?? 0) < job.pay * 4) levers.push(`Work more of the week: a day job pays ${money$(job.pay)} a day, gigs more.${w.weekAvg != null ? ` Your weeks average ${money$(w.weekAvg)}.` : ''}`);
  if (mgr) { const save = Math.round((c.travel * (1 - mgrTravel(mgr.skill)) + c.tyre * 2.5 * (1 - mgrTyre(mgr.skill))) / 10) * 10, wage = wageNow(w, mgr); if (wage > save) levers.push(`Your manager costs ${money$(wage)} a round and saves about ${money$(save)} (plus ordering the tires).`); }
  const pd = Math.max(0, payrollDue(w) - (w.wageClaims || 0)); if (net < 0 && pd > 0) levers.push(`Paying staff half saves ${money$(pd / 2)} a round, but they're owed it, and they notice.`);
  if (mw) levers.push(`Your teammate costs ${money$(mw)} a round. A pay driver${seriesById(sid).gents ? ' or a gentleman driver' : ''} would bring money instead, and be slower.`);
  const open = SPONSOR_SLOTS.length - dealsOf(w).length; if (open) levers.push(`${open} sponsor slot${open === 1 ? '' : 's'} open: results, met targets and clean racing bring offers.`);
  if (raced && costs.find(x => x[0] === 'Repairs and rebuilds')?.[1] > c.repair * 0.04) levers.push(`Rebuild worn parts yourself on a spare day: a third to half of a shop's price.`);
  if (facUpkeep(t) > out * 0.12) levers.push(`Premises and facilities are ${money$(facUpkeep(t))} a round.`);
  if (!(w.loans || []).some(l => !l.paid && !l.shark)) { const L = loanTerms(w); levers.push(`The bank will lend ${money$(L.amt)}, repaid at ${money$(L.per)} a round for ${L.rounds} rounds.`); }
  if (annuityOffer(w)) levers.push(`QuickCash will buy the rest of your annuity for ${money$(annuityOffer(w))}. It's worth a lot more.`);
  // what finishing pays (a round, a car), and what you'd need to break even: the two cars side by side, the best pair
  // of places whose prize money covers the gap (null: even two wins wouldn't)
  const prize = c.prize.map(v => Math.round(v * (bg.prize || 1) / 10) * 10), prizeNow = (c.prize[myPos - 1] || 0) * (bg.prize || 1) + (m ? (c.prize[matePos - 1] || 0) * (bg.prize || 1) : 0);
  const need = out - (inn - prizeNow); let even = null;
  // (with the season's prize funds at those places, spread over the season: that's where winning pays)
  for (let p = 1; p <= prize.length; p++) { const pair = prize[p - 1] + (m ? prize[p] || 0 : 0), fund = ((fundOf(w, sid)[p - 1] || 0) + (teamFundOf(w, sid)[Math.max(0, Math.round(p / 2 + 0.4) - 1)] || 0)) / w.opts.len;
    if (pair + fund >= need) even = { you: p, mate: m ? p + 1 : null, pays: Math.round(pair), fund: Math.round(fund / 10) * 10 }; }
  return { costs, income, out, inn, net, left, proj, fundEnd, end, runway, levers, myPos, matePos, pos, tpos, prize, need, even,
    funds: { drivers: fundOf(w, sid), teams: teamFundOf(w, sid) } };
}
// 0 (comfortable) .. 1 (desperate)
export function despOf(w) {
  if (!w.money || !w.money.choice) return 0;
  const r = runwayOf(w);
  let d = r < 0 ? 1 : r < 1 ? 0.85 : r < 2 ? 0.65 : r < 4 ? 0.4 : r < 7 ? 0.2 : 0.05;
  if ((w.staff || []).some(x => x.owed > 0)) d += 0.1;
  if (dealsOf(w).some(x => x.misses >= patienceOf(x))) d += 0.05;
  if ((w.loans || []).some(l => l.shark && !l.paid)) d += 0.1;
  return clamp(d, 0, 1);
}
const flag = (w, k) => { (w.flags ??= {})[k] = (w.flags[k] || 0) + 1; };
export const record = (w) => w.flags || {};
export function removeGrey(w) { w.grey = null; }
// Kev's engine map: more power, and it runs the engine hot (it wears that much faster)
const GREY_POWER = 0.09, GREY_WEAR = 1.6; // (power: tripled with the engine parts, LAP_KS)

// ---------- the temptations ----------
// base: weekly chance when desperate enough (scaled by how desperate); min: desperation below which it never comes
const SHADY = ['Volt Rush Energy', 'Cloud Nine Vapor', 'QuickCash Loans', "Lucky Lou's Online Casino"];
const TEMPTS = {
  grey: { danny: true, base: 0.16, min: 0.2, ok: (w) => w.car && !w.grey && !(w.flags?.greyCaught),
    offer(w) {
      const price = 1200 * KS(w);
      mail(w, 'Danny', 'dannyboy1979@coolmail.sv', 'the chip',
        [`Bro my boy Kev does engine maps. He plugged a laptop into a car at the gas station once and it went faster`, `He says your car's leaving power on the table. ${money$(price)} fitted`, `It's not technically legal. But technically nobody checks at street level. Kev says`, `Runs a bit hot he said. That's normal for fast`],
        { tempt: 'grey', price, choices: [['yes', `Have Kev fit it (${money$(price)})`], ['no', 'No']] });
    } },
  shady: { base: 0.12, min: 0.3, ok: (w) => !dealsOf(w).some(d => d.shady) && dealsOf(w).length < SPONSOR_SLOTS.length,
    offer(w) {
      const name = pickLine(w, SHADY), i = SPONSOR_POOL.findIndex(s => s[0] === name), title = !dealsOf(w).some(d => d.slot === 'title');
      const fee = Math.round(1500 * 4 * KS(w) * (title ? 1 : ASSOC_K) / 50) * 50;
      mail(w, name, sponsorAddr(name), 'Partnership opportunity',
        [`Hi!!`, `${name} is looking for an exciting young motorsport brand to grow with. That's you!`, `We'd pay ${money$(fee)} a round${title ? ' for the name on the car' : ' for a logo'}. No targets. We just want to be seen.`, `Payment terms are 30 days.`, `The ${name} Partnerships Team`],
        { tempt: 'shady', sid: 'sp' + i, fee, slot: title ? 'title' : 'assoc', choices: [['yes', `Accept: ${money$(fee)} a round`], ['no', 'Decline']] });
    } },
  shark: { base: 0.3, min: 0.55, ok: (w) => !(w.loans || []).some(l => l.shark && !l.paid),
    offer(w) {
      const amt = 15000 * KS(w), back = 20000 * KS(w);
      mail(w, 'Sal', 'sal.v@coolmail.sv', 'from sal (dannys cousin)',
        [`Danny says you're having a hard time. I can help.`, `${money$(amt)} today. ${money$(back)} back in four rounds. No paperwork, no credit check.`, `I'm a reasonable person. Ask anyone. Ask Danny.`, `Sal`],
        { tempt: 'shark', amt, back, choices: [['yes', `Take ${money$(amt)}`], ['no', 'No thanks']] });
    } },
  bet: { danny: true, base: 0.14, min: 0.3, ok: (w) => !w.bet && !w.over,
    offer(w) {
      const stake = 1500 * KS(w);
      mail(w, 'Danny', 'dannyboy1979@coolmail.sv', 'lenny',
        [`Yo my guy Lenny takes bets on the ${seriesById(w.player.series).name}. He's got you at long odds which is kinda disrespectful`, `Top 5 this weekend pays 3 to 1. Or, and I'm only saying this cause Lenny said it, finishing outside the top 8 pays 2 to 1`, `${money$(stake)} stake. Cash`],
        { tempt: 'bet', stake, choices: [['for', 'Bet on yourself: top 5'], ['against', 'Bet against yourself: outside the top 8'], ['no', 'No']] });
    } },
  insure: { danny: true, base: 0.08, min: 0.6, ok: (w) => w.car && !w.car.lease && !w.fraud && !w.flags?.fraudCaught,
    offer(w) {
      const pay = Math.round((w.car.paid || 20000) * 0.9 / 100) * 100;
      mail(w, 'Danny', 'dannyboy1979@coolmail.sv', 'an idea (delete this)',
        [`Ok hear me out. Guy at the Gas-N-Go says cars catch fire all the time. Especially old ones. Especially in garages`, `You're insured for ${money$(pay)}. He's done it twice. Says third time's the charm`, `Imma delete this email after you read it. Idk how to do that actually`],
        { tempt: 'insure', pay, choices: [['yes', 'Let the car "catch fire"'], ['no', 'No']] });
    } },
};
function temptations(w) {
  const d = despOf(w), cool = (w.tcool ??= {});
  if (w.week.tempted) return;
  for (const [id, T] of Object.entries(TEMPTS).sort(() => rng(w) - 0.5)) {
    if (d < T.min || !T.ok(w) || (cool[id] || -99) > nowIdx(w) - 4 || (T.danny && dannyCold(w))) continue; // (Danny's ideas: not while he's sore with you)
    if (rng(w) < T.base * (0.4 + d * 1.6)) { T.offer(w); cool[id] = nowIdx(w); w.week.tempted = id; return; }
  }
}
// your answer to a temptation (or a story's question): { msg } to show, { err } to undo the answer
export function answerStory(w, m, key) {
  if (m.tempt) return answerTempt(w, m, key);
  if (m.arc) { const a = (w.dir?.arcs || []).find(x => x.id === m.arc); return a ? (ARCS[a.type].answer(w, a, m, key) || null) : null; }
  if (m.inflate) return answerInflate(w, m, key);
  return null;
}
function answerTempt(w, m, key) {
  if (key === 'no') return null;
  if (m.tempt === 'grey') { pay(w, -m.price * (m.fitTo === 'both' ? 2 : 1), `Engine map (cash)${m.fitTo === 'both' ? ', both cars' : m.fitTo === 'mate' ? ', car 2' : ''}`); w.grey = { uses: 0, on: mateOf(w) ? m.fitTo || 'me' : 'me' }; flag(w, 'grey'); react(w, 'danny', `The player said yes to Danny's idea: Danny's mate Kev fitted an engine map to the race car for ${money$(m.price)} cash. It isn't legal, and the scrutineers might find it.`); return { msg: 'Kev fitted the map. The car pulls harder.' }; }
  if (m.tempt === 'shady') {
    const deals = dealsOf(w); if (deals.length >= SPONSOR_SLOTS.length) return { err: 'You have no free sponsor slots.' };
    const slot = m.slot === 'title' && deals.some(d => d.slot === 'title') ? 'assoc' : m.slot, sp = sponsorById(m.sid);
    deals.push({ sid: m.sid, slot, fee: m.fee, bonus: 0, met: 0, misses: 0, since: w.year, obj: null, shady: true, owed: 0 });
    flag(w, 'shady');
    // the respectable ones notice
    for (const d of deals.filter(x => !x.shady)) if (rng(w) < 0.45) {
      const o = sponsorById(d.sid); w.deals = dealsOf(w).filter(x => x !== d);
      mail(w, o.name, sponsorAddr(o.name), 'Our partnership', [`We've seen the new name on your car. We don't think ${sp.name} is a good fit alongside ${o.name}, so we're ending our sponsorship, effective immediately.`, o.name]);
    }
    news(w, `${sp.name.toUpperCase()} JOINS ${w.teams[w.player.team].name.toUpperCase()}`, `The ${seriesById(w.player.series).name} team has a new ${slot === 'title' ? 'title ' : ''}partner.`);
    return { msg: `${sp.name} is on board. Their logo needs to be on the car.` };
  }
  if (m.tempt === 'shark') { react(w, 'danny', `The player took a loan from Sal, Danny's cousin: ${money$(m.amt)} now, ${money$(m.back)} back in four rounds.`); pay(w, m.amt, 'Loan (Sal)'); (w.loans ??= []).push({ shark: true, owe: m.back, due: nowIdx(w) + 4, missed: 0, paid: false }); flag(w, 'shark'); return { msg: `${money$(m.amt)} from Sal. ${money$(m.back)} back in four rounds.` }; }
  if (m.tempt === 'bet') { react(w, 'danny', key === 'against' ? `The player put ${money$(m.stake)} with Lenny the bookie on themselves finishing outside the top 8 this weekend. Betting against yourself is against the rules.` : `The player put ${money$(m.stake)} with Lenny the bookie on themselves finishing in the top 5 this weekend.`); pay(w, -m.stake, 'Cash (Lenny)'); w.bet = { type: key, stake: m.stake, key: w.year * 100 + w.round }; flag(w, key === 'against' ? 'betAgainst' : 'betFor'); return { msg: key === 'against' ? 'Lenny has your money. Finish outside the top 8.' : 'Lenny has your money. Finish in the top 5.' }; }
  if (m.tempt === 'insure') {
    pay(w, m.pay, `Insurance: ${w.car.year} ${w.car.name}, total loss (fire)`);
    w.fraud = { since: nowIdx(w), pay: m.pay };
    news(w, `FIRE AT ${(TOWNS[w.home]?.name || 'LOCAL').toUpperCase()} RACING GARAGE`, `A race car was destroyed in a fire overnight. Nobody was hurt. The cause is not yet known.`);
    w.car = null; w.ads = makeAds(w); w.grey = null; flag(w, 'insure');
    react(w, 'danny', `The player went through with it: the race car "caught fire" in the garage overnight and the insurance paid ${money$(m.pay)}. The fire was Danny's idea, from a guy at the Gas-N-Go. Now they need another car, and nobody can know.`);
    return { msg: 'The car is gone. The money is in the bank. You need another car.' };
  }
  return null;
}
// the sponsor's "a word about results" email, with a way out
function answerInflate(w, m, key) {
  const d = dealsOf(w).find(x => x.sid === m.inflate); if (!d) return null;
  const sp = sponsorById(d.sid);
  if (key === 'inflate') { d.misses = Math.max(0, d.misses - 2); d.lied = true; w.lies = (w.lies || 0) + 1; flag(w, 'lies');
    mail(w, sp.name, sponsorAddr(sp.name), 're: A word about results', [`Thanks for the figures. We hadn't realized the TV audience was that big. We're happy to carry on.`, sp.name]); return { msg: `${sp.name} are happy again.` }; }
  mail(w, sp.name, sponsorAddr(sp.name), 're: A word about results', [`Thanks for being straight with us. We'll see how the next round goes.`, sp.name]);
  return null;
}
// a round's consequences (bill items): scrutineering, bets, the shady sponsor, loans
function temptRound(w, use, me) {
  const items = [], K = KS(w), key = w.year * 100 + w.round, scored = w.series[w.player.series].results.find(x => x.round === w.round), row = scored?.rows.find(r => r.pid === 'P');
  if (w.grey) {
    w.grey.uses++;
    // (the scrutineers strip the podium cars; the rest get a look now and then)
    // (the scrutineers look at whichever car has it: yours on your result, car 2 on your teammate's)
    const on = w.grey.on || 'me', mrow = (on !== 'me') && mateOf(w) ? scored?.rows.find(r => r.pid === mateOf(w).pid) : null;
    const risk = 1 - (on === 'mate' ? 1 : 1 - scrutiny(w, me)) * (mrow ? 1 - scrutiny(w, mrow) : 1);
    if (rng(w) < risk) {
      w.grey = null; flag(w, 'greyCaught');
      items.push(...sanction(w, { what: 'unapproved engine software', exclude: true, fine: 2000 * K, rep: 12, stain: 8 }));
      news(w, `${w.teams[w.player.team].name.toUpperCase()} EXCLUDED`, `Scrutineers found unapproved engine software on the car after the race at ${w.series[w.player.series].cal[w.round].name}. ${w.teams[w.player.team].name} loses every point it has scored this season. The team says the software was fitted by a third party.`);
      texts(w, 'Danny', [`So Kev says he's never met you`, `Just so you know`]);
    }
  }
  if (w.bet && w.bet.key === key && me) {
    const b = w.bet, won = b.type === 'for' ? !me.dnf && me.pos <= 5 : me.dnf || me.pos > 8;
    if (won) items.push([`Cash (Lenny): ${b.type === 'for' ? '3 to 1' : '2 to 1'}`, b.stake * (b.type === 'for' ? 4 : 3)]);
    if (won && rng(w) < (b.type === 'against' ? 0.12 : 0.03)) {
      flag(w, 'betCaught');
      // (betting on yourself is a fine and the result; betting against yourself is fixing a race)
      items.push(...sanction(w, b.type === 'against' ? { what: 'betting against your own car', exclude: true, fine: 3000 * K, rep: 15, stain: 12 } : { what: 'betting on your own race', fine: 3000 * K, rep: 6, stain: 4 }));
      news(w, `INTEGRITY UNIT LOOKS AT ${w.teams[w.player.team].name.toUpperCase()}`, `Officials have looked into betting on the ${w.series[w.player.series].cal[w.round].name} round. ${w.player.name} has been fined${b.type === 'against' ? ' and excluded from this season\'s results' : ' and their result removed'}.`);
    }
    w.bet = null;
  }
  items.push(...loanRound(w));
  return items;
}
// loans, each round: the bank's instalments; Sal's due date
function loanRound(w) {
  const items = [], K = KS(w);
  for (const l of (w.loans || []).filter(x => !x.paid)) {
    if (!l.shark) { items.push([`Loan repayment (${BANK})`, -l.per]); l.left--; if (l.left <= 0) l.paid = true; continue; }
    if (nowIdx(w) < l.due) continue;
    if (w.money.balance >= l.owe) { items.push(['Loan repaid (Sal)', -l.owe]); l.paid = true; text(w, 'Sal', `Pleasure doing business.`); continue; }
    l.missed++; l.due = nowIdx(w) + 1; l.owe += 3000 * K;
    if (l.missed === 1) text(w, 'Sal', `You're late. That's fine. It's ${money$(l.owe)} now.`);
    else if (l.missed === 2) { const P = carParts(w); if (P) P.chassis.cond = +Math.max(0.1, P.chassis.cond - 0.3).toFixed(3); texts(w, 'Danny', [`Yo someone was at the garage last night`, `Car's ok. Mostly`, `Sal says hi`]); }
    else { const take = l.owe; items.push(['Collected (Sal)', -take]); l.paid = true; texts(w, 'Danny', [`Bro Sal took the money straight out of your account`, `Didn't know you could do that`, `He was real polite about it tho`]); }
  }
  return items;
}
// what follows you around: exposed lies, the fire investigation
function consequences(w) {
  if (w.lies && rng(w) < 0.006 * Math.min(4, w.lies) * (pressOf(w) < 0 ? 2 : 1)) {
    const lied = dealsOf(w).filter(d => d.lied);
    news(w, `${w.teams[w.player.team].name.toUpperCase()}'S AUDIENCE FIGURES "DON'T ADD UP"`, `The Paddock Wire has seen sponsorship reports claiming TV audiences larger than the ${seriesById(w.player.series).name}'s actual broadcast reach.`);
    for (const d of lied) { const sp = sponsorById(d.sid); mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`We've read the article. We're ending our sponsorship, effective immediately, and our lawyers will be in touch about the figures.`, sp.name]); }
    w.deals = dealsOf(w).filter(d => !d.lied); w.rep = clamp(repOf(w) - 8, 0, 100); w.lies = 0; flag(w, 'liesCaught');
    stain(w, 'inflated audience figures', 6);
  }
  if (w.fraud && !w.fraud.closed) {
    if (nowIdx(w) - w.fraud.since > 4) { w.fraud.closed = true; mail(w, 'Velocita Mutual Insurance', 'claims@velocitamutual.sv', 'Your claim: closed', [`Our investigation into the fire at your premises is now closed. The cause has been recorded as electrical.`, `Velocita Mutual`]); }
    else if (rng(w) < 0.08) {
      w.fraud.closed = true; flag(w, 'fraudCaught');
      pay(w, -w.fraud.pay - 5000 * KS(w), 'Insurance claim reversed, and a fine');
      news(w, `TEAM OWNER CHARGED OVER GARAGE FIRE`, `${w.player.name}, owner of ${w.teams[w.player.team].name}, has been charged with insurance fraud. A fuel can and a receipt were recovered from the scene.`);
      for (const d of dealsOf(w).slice()) if (rng(w) < 0.6) { const sp = sponsorById(d.sid); w.deals = dealsOf(w).filter(x => x !== d); mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`In light of the news, we're ending our sponsorship.`, sp.name]); }
      w.rep = clamp(repOf(w) - 15, 0, 100); stain(w, 'insurance fraud', 12);
    }
  }
}
// ---------- getting caught ----------
// How hard they look: the podium cars are stripped after every race, the rest checked now and then, and the longer
// something's been on the car the likelier it is to be noticed. me: your result this round
function scrutiny(w, me) {
  const pos = me && !me.dnf ? me.pos : 99;
  return (pos <= 3 ? 0.05 : pos <= 6 ? 0.02 : 0.008) + 0.0015 * (w.grey?.uses || 0);
}
// The stewards' decision (o: { what, exclude (every point this season), fine, rep, stain (rounds) }): their letter,
// the points, and the stain that follows. Returns the bill's items.
function sanction(w, o) {
  const sid = w.player.series, S = w.series[sid], R = S.cal[w.round], items = [];
  const res = S.results.find(x => x.round === w.round), row = res && res.rows.find(r => r.pid === 'P');
  if (row) { row.pts = 0; row.dnf = true; row.dsq = true; }
  const me = lastMe(w); if (me && me !== row) { me.pts = 0; me.dsq = true; }
  let lost = 0;
  if (o.exclude) for (const x of S.results) for (const r of x.rows) if (r.pid === 'P' && r.pts) { lost += r.pts; r.pts = 0; r.dsq = true; }
  if (o.fine) items.push([`Fine: ${o.what}`, -o.fine]);
  w.rep = clamp(repOf(w) - (o.rep || 0), 0, 100);
  if (o.exclude) (w.excluded ??= {})[w.year] = true;
  mail(w, `${seriesById(sid).name} Stewards`, addrOf(seriesById(sid), 'stewards'), `Decision of the Stewards: ${R.name}`,
    [`The Stewards have considered a report concerning ${w.teams[w.player.team].name} (${o.what}) and have decided as follows.`,
     o.exclude ? `The team is excluded from the results of every round of the ${w.year} season to date${lost ? `, and loses the ${lost} point${lost === 1 ? '' : 's'} scored` : ''}. It may continue to enter, and may score points from the next round.` : `The team is disqualified from the results of this round.`,
     ...(o.fine ? [`A fine of ${money$(o.fine)} has been taken from the team's prize money account.`] : []),
     `The Stewards`]);
  stain(w, o.what, o.stain || 0);
  return items;
}
// a stain: for a while after you're caught, respectable sponsors won't sign and some of the ones you have walk, drivers
// trust you less, the bank won't lend, and the Wire remembers (w.stain = { what, until (a week index), y })
function stain(w, what, rounds) {
  w.scandal = nowIdx(w);
  if (!rounds) return;
  w.stain = { what, until: Math.max(w.stain?.until || 0, nowIdx(w) + rounds), y: w.year };
  w.drep = clamp(drepOf(w) - 12, 0, 100);
  for (const d of dealsOf(w).slice()) if (!d.shady && rng(w) < 0.5) {
    const sp = sponsorById(d.sid); w.deals = dealsOf(w).filter(x => x !== d);
    mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`We've read the news. ${sp.name} can't be associated with ${what}, so we're ending our sponsorship, effective immediately.`, sp.name]);
  }
  for (const d of dealsOf(w)) if (!d.shady) d.misses++; // (the ones who stay are watching)
}
export const stainOf = (w) => w.stain && nowIdx(w) < w.stain.until ? w.stain : null;
// the bank: a business loan, if they like the look of you
export function loanTerms(w) { const amt = 20000 * KS(w); return { amt, per: Math.round(amt * 1.12 / 6 / 50) * 50, rounds: 6 }; }
export function applyLoan(w) {
  const t = loanTerms(w);
  if ((w.loans || []).some(l => !l.shark && !l.paid)) return { ok: false, why: 'You already have a loan with us.' };
  const ok = w.money.balance > 0 && repOf(w) >= 12 && !w.scandal;
  if (!ok) {
    mail(w, BANK, BANK_ADDR, 'Your loan application', [`Thank you for applying for a business loan.`, `Following a review of your application, we are unable to offer you credit at this time. ${w.money.balance <= 0 ? 'Your account is overdrawn.' : w.scandal ? 'Our decision took into account information in the public domain.' : 'Your business does not yet have enough of a trading history.'}`, `You may reapply in the future.`]);
    return { ok: false, why: 'The bank said no. The letter is in your mail.' };
  }
  pay(w, t.amt, `Business loan (${BANK})`);
  (w.loans ??= []).push({ shark: false, amt: t.amt, per: t.per, left: t.rounds, paid: false });
  mail(w, BANK, BANK_ADDR, 'Your loan', [`Your business loan of ${money$(t.amt)} has been paid into your account.`, `It will be repaid in ${t.rounds} instalments of ${money$(t.per)}, taken after each round.`]);
  return { ok: true };
}

// ---------- the people in the story ----------
const ADVISER = ['Gerald Pike, CFP', 'gerald@pikewealth.sv'];
// your financial adviser: the voice of sense, at a few thresholds a season
function adviser(w) {
  const r = runwayOf(w), seen = (w.advised ??= {}), y = w.year;
  const say = (k, body) => { if (seen[k] === y) return; seen[k] = y; mail(w, ADVISER[0], ADVISER[1], 'Checking in', body); };
  if (w.money.balance < 0) say('neg', [`I see the account is overdrawn. I'd recommend reducing expenses immediately.`, `I'd also recommend not owning a racing team, but we've discussed that.`, `Gerald`]);
  else if (r < 2) say('r2', [`A quick note. At your current rate of spending, the money lasts about ${Math.max(1, Math.floor(r))} more round${Math.floor(r) === 1 ? '' : 's'}.`, `Most of my clients who won the lottery bought a boat. A boat costs less than this.`, `Gerald`]);
  else if (r < 5) say('r5', [`Just keeping an eye on things. You're spending about ${money$(roundBurn(w))} a round more than comes in, which gives you around ${Math.floor(r)} rounds.`, `Let me know if you want to talk about a budget.`, `Gerald`]);
}
export const pressOf = (w) => w.press || 0;

// ---------------- press day: the season launch (js/wpressday.js has the questions) ----------------
// At the start of every season, once the setup's signed: three questions in front of the press in your garage, and the
// car's reveal after (js/launch.js). w.pressDay: { year, qs, answers: [answer index], quotes, done }. What an answer
// does is shown on it before you choose (pressFxTags); a promise goes in w.promises and the Wire holds you to it
// (settlePromises: after each round, and at the season's end).
const COOP_STAKE = { car: ['sold your car to buy in', 'car money'], house: ['remortgaged your house for this', 'house'], boss: ['got your boss to back you', 'job'] };
function pressContext(w) {
  const S = seriesById(w.player.series), last = w.seasons.at(-1), you = last && last.you && last.you.y === w.year - 1 ? last.you : null;
  const cal = w.series[w.player.series].cal, hr = Math.min(cal.length - 1, Math.floor(cal.length / 2)), title = dealsOf(w).find(d => d.slot === 'title'), sp = title && sponsorById(title.sid);
  const field = w.series[w.player.series].teams.reduce((a, t) => a + w.teams[t].drivers.length, 0) || 12;
  const rv = w.coop ? null : rivalOwner(w), C = w.coop && coopPerson(w), stake = w.coop ? COOP_STAKE[w.coop.kind] || ['bought in with what the paperwork calls talent', 'reputation'] : null;
  return { series: S.name, movedUp: !!(you && you.s !== w.player.series), fromSeries: you ? seriesById(you.s)?.name : '', lastPos: you ? you.pos : 0, topHalf: Math.ceil(field / 2),
    newCar: !!w.setup?.newCar, car: w.car?.name || 'car', homeRound: hr, homeTrack: cal[hr]?.name || 'the next round',
    coop: !!C, coopFirst: C?.first, coopStake: stake?.[0], coopStakeThing: stake?.[1], youFirst: w.player.name.split(' ')[0],
    rivalName: rv ? rv.name.join(' ') : '', rivalTeam: rv ? w.teams[rv.tid]?.name : '', rivalTid: rv?.tid,
    sponsor: sp?.name || '', sponsorWantsResults: !!(sp && sp.wants.some(k => k === 'top' || k === 'lead')) };
}
export const pressDue = (w) => !!(w.founding?.reg && setupDone(w) && w.car && !w.over && w.round === 0 && !w.preview && !(w.pressDay && w.pressDay.year === w.year && w.pressDay.done));
export function pressDayOf(w) {
  if (!w.pressDay || w.pressDay.year !== w.year) w.pressDay = { year: w.year, qs: pressQuestions(pressContext(w)), answers: [], quotes: [], done: false, crowd: pressCrowd(w), before: pressBefore(w) };
  return w.pressDay;
}
// what the answers can change, as it was before the day (pressDayReplay puts it back: the Development menu's replay)
const pressBefore = (w) => ({ rep: repOf(w), press: pressOf(w), drep: drepOf(w), heat: w.rival ? w.rival.heat || 0 : 0, morale: mateOf(w)?.morale ?? null,
  patience: dealsOf(w).map(d => patienceOf(d)) });
export function pressDayReplay(w) {
  const D = w.pressDay; if (!D || D.year !== w.year) return false;
  const b = D.before;
  if (b) {
    w.rep = b.rep; w.press = b.press; w.drep = b.drep; if (w.rival) w.rival.heat = b.heat;
    const m = mateOf(w); if (m && b.morale != null) m.morale = b.morale;
    dealsOf(w).forEach((d, i) => { if (b.patience[i] != null) d.patience = b.patience[i]; });
  }
  if (D.head) w.news = w.news.filter(n => !(n.y === w.year && n.head === D.head));   // (the Wire's headline, and the rival's reply)
  w.mail = (w.mail || []).filter(m => !(m.y === w.year && m.subj === 'Your little press conference'));
  w.promises = (w.promises || []).filter(p => !(p.year === w.year && D.quotes.includes(p.said)));
  w.pressDay = null;
  return true;
}
// what saying it does, as the tags on the answer: [{ text, good }]
export function pressFxTags(w, a) {
  const f = a.fx || {}, out = [], sg = (v) => (v > 0 ? '+' : '−') + Math.abs(v);
  const title = dealsOf(w).find(d => d.slot === 'title') || dealsOf(w)[0], spn = title ? sponsorName(title.sid) : '';
  if (f.rep) out.push({ text: `Reputation ${sg(f.rep)}`, good: f.rep > 0 });
  if (f.press) out.push({ text: `Press ${sg(f.press)}`, good: f.press > 0 });
  if (f.sponsor && spn) out.push({ text: f.sponsor > 0 ? `${spn} likes this` : `${spn} won't like it`, good: f.sponsor > 0 });
  if (f.mate && mateOf(w)) out.push({ text: `${w.people[mateOf(w).pid]?.first || 'Teammate'} ${f.mate > 0 ? 'likes this' : 'takes it personally'}`, good: f.mate > 0 });
  if (f.drep) out.push({ text: 'Drivers hear about it', good: false });
  if (f.rival && w.rival) out.push({ text: `${w.rival.name[0]} ${w.rival.name[1]} will reply`, good: false });
  if (a.promise) out.push({ text: `Promise: ${promiseText(a.promise)}`, promise: true });
  return out;
}
// what saying it does (a press day's answer, the media pen's)
function pressFx(w, f = {}) {
  if (f.rep) w.rep = clamp(repOf(w) + f.rep, 0, 100);
  if (f.press) w.press = pressOf(w) + f.press;
  if (f.sponsor) { const d = dealsOf(w).find(x => x.slot === 'title') || dealsOf(w)[0]; if (d) d.patience = clamp(patienceOf(d) + f.sponsor, 1, 9); }
  if (f.mate) { const m = mateOf(w); if (m) m.morale = clamp((m.morale ?? 65) + f.mate, 0, 100); }
  if (f.drep) w.drep = clamp(drepOf(w) + f.drep, 0, 100);
  if (f.rival && w.rival) w.rival.heat = (w.rival.heat || 0) + f.rival;
}
// ---------------- the media pen: one question after every race ----------------
// w.pen = { y, round, track, q (penQuestion), ans: null | index, by } for the round just raced; answered on the
// results screen by whoever runs the team (co-op: the Team Principal: answerPen is the Principal's call); no answer
// by the next round is "no comment" (and the press notice)
function penOf(w, me, use, log) {
  const sid = w.player.series, R = w.series[sid].cal[w.round], mid = teammateOf(w), mate = w.people[mid], res = w.series[sid].results.at(-1), mr = res && res.rows.find(r => r.pid === mid);
  const you = w.player.name.split(' ')[0], name = (pid) => pid === 'P' ? you : w.people[pid]?.first || '';
  const teamHit = log.some(e => e.type === 'contact' && ((e.a === 'P' && e.b === mid) || (e.b === 'P' && e.a === mid)));
  const hitE = log.find(e => e.type === 'contact' && e.a === 'P' && e.blame && e.b !== mid && w.people[e.b]);
  const c = { round: w.round, track: R.name, team: myTeam(w).name, you, mate: mate ? mate.first : '', pos: me.dnf ? 0 : me.pos, dnf: !!me.dnf, teamHit,
    hit: hitE ? `${w.people[hitE.b].first} ${w.people[hitE.b].last}` : '', hitWhose: me.dnf ? `${you}'s` : 'their', part: use.failed ? PARTS[use.failed]?.name.toLowerCase() || '' : '',
    mateAhead: !!(mr && !mr.dnf && (me.dnf || mr.pos < me.pos)), sponsor: !!dealsOf(w).length };
  if (c.pos === 1 && use.failed) c.part = ''; // (a win's the story)
  return { y: w.year, round: w.round, track: R.name, q: penQuestion(c), ans: null };
}
export const penOpen = (w) => w.pen && w.pen.ans == null && w.pen.y === w.year ? w.pen : null;
export function answerPen(w, ai) {
  const P = penOpen(w), a = P && P.q.answers[ai]; if (!a) return null;
  P.ans = ai; pressFx(w, a.fx);
  const T = myTeam(w), who = roleOf(w, 'P') === 'tech' && coopPerson(w) ? nameOf(coopPerson(w)) : w.player.name;
  news(w, `${T.name.toUpperCase()} AFTER ${P.track.toUpperCase()}: "${a.text.toUpperCase().replace(/\.$/, '')}"`, `${who}, in the media pen after round ${P.round + 1}, asked by ${P.q.who.name} (${P.q.who.outlet}): "${P.q.q}"`);
  return { quote: a.text, tags: pressFxTags(w, a) };
}
// (unanswered by the time the next race starts: no comment)
export function penNoComment(w) { const P = penOpen(w); if (!P) return; P.ans = -1; w.press = pressOf(w) - 1; }
export function answerPress(w, qi, ai) {
  const D = pressDayOf(w), q = D.qs[qi], a = q && q.answers[ai]; if (!a || D.answers[qi] != null) return null;
  D.answers[qi] = ai; D.quotes[qi] = a.text;
  pressFx(w, a.fx);
  if (a.promise) (w.promises ??= []).push({ ...a.promise, year: w.year, said: a.text, by: q.to, done: null });
  return { quote: a.text, tags: pressFxTags(w, a) };
}
// the day done (pressDayDone): the Wire runs it (the boldest thing said is the headline), and the rival owner answers back
export function pressDayDone(w) {
  const D = pressDayOf(w); if (D.done) return; D.done = true;
  const T = myTeam(w), pick = D.qs.map((q, i) => ({ q, a: q.answers[D.answers[i]] })).filter(x => x.a);
  const lead = pick.find(x => x.a.promise) || pick.find(x => x.a.tone === 'Cheeky') || pick[0];
  if (lead) news(w, D.head = `${T.name.toUpperCase()}: "${lead.a.text.toUpperCase().replace(/\.$/, '')}"`, `${lead.q.to === 'C' && coopPerson(w) ? nameOf(coopPerson(w)) : w.player.name} said it at the team's season launch, in front of ${D.crowd || pressCrowd(w)} members of the press and a box of donuts.${pick.filter(x => x !== lead).slice(0, 1).map(x => ` Also said: "${x.a.text}"`).join('')}`);
  if (w.rival && w.rival.heat > 0 && w.teams[w.rival.tid]) mail(w, w.rival.name.join(' '), rivalAddr(w), 'Your little press conference',
    [`I read the Wire this morning. Twice, to be sure I understood.`, w.rival.heat > 1 ? `Charming. I'll have it framed for the garage, next to our trophies. There's room, unlike yours.` : `Brave words. We'll see where they leave you in October.`, w.rival.name[0]]);
}
// how many came: a club team gets the local paper and a man with a camera; it grows with the team's name
export const pressCrowd = (w) => clamp(Math.round(3 + pressOf(w) * 0.4 + repOf(w) / 12 + (seriesById(w.player.series)?.tier || 1)), 4, 18);
// promises, kept or broken: a podium at a round (that round), podiums and a win (the moment they happen, or not by the
// season's end), the championship and the head-to-heads (at the season's end)
function settlePromises(w, me, end = false) {
  const open = (w.promises || []).filter(p => p.year === w.year && p.done == null); if (!open.length) return;
  const sid = w.player.series, st = standings(w, sid), pos = (pid) => st.findIndex(e => e.pid === pid) + 1, my = st.find(e => e.pid === 'P');
  const T = myTeam(w).name.toUpperCase();
  const settle = (p, kept) => {
    p.done = kept ? 'kept' : 'broken'; p.at = end ? w.round - 1 : w.round;   // (the round it was settled after, the last at the season's end: the results screen says so)
    w.rep = clamp(repOf(w) + (kept ? 3 : -2), 0, 100); w.press = pressOf(w) + (kept ? 2 : -1);
    news(w, kept ? `${T} KEPT ITS WORD` : `${T}: SO MUCH FOR THAT`, kept ? `At the launch it was "${p.said}" ${promiseText(p)}: done.` : `At the launch it was "${p.said}" The Wire would like to remind everyone it wrote that down.`);
  };
  for (const p of open) {
    if (p.kind === 'podium_at' && !end && w.round === p.round) settle(p, !!(me && !me.dnf && me.pos <= 3));
    else if (p.kind === 'podiums' && my && my.pods >= p.n) settle(p, true);
    else if (p.kind === 'win' && my && my.wins > 0) settle(p, true);
    else if (end) {
      if (p.kind === 'finish') settle(p, pos('P') > 0 && pos('P') <= p.pos);
      else if (p.kind === 'beat_mate') { const c = w.coop?.pid; settle(p, !!c && pos(c) > 0 && pos(c) < pos('P')); }
      else if (p.kind === 'beat_team') { const ts = teamStandings(w, sid).map(e => e.tid); settle(p, ts.indexOf(w.player.team) >= 0 && ts.indexOf(w.player.team) < ts.indexOf(p.tid)); }
      else settle(p, false);   // (podiums, a win, the round that's gone: not done)
    }
  }
}
export const promisesOf = (w) => (w.promises || []).filter(p => p.year === w.year);
// where a promise stands now, as the garage and the results show it: { text, state: 'kept' | 'broken' | 'on' (on course,
// or nothing to say yet) | 'off' (behind it), now: the numbers in a few words, here: it's this round's }
export function promiseNow(w, p) {
  const co = p.by === 'C' && w.coop && w.people[w.coop.pid], who = co ? co.first : null;   // (the co-owner's own: beating you)
  const text = co && p.kind === 'beat_mate' ? `Finish ahead of ${w.player.name.split(' ')[0]}` : promiseText(p), r = promiseNow2(w, p, text);
  return { ...r, who };
}
function promiseNow2(w, p, text) {
  if (p.done) return { text, state: p.done, now: p.done === 'kept' ? 'Kept' : 'Broken' };
  const sid = w.player.series, st = standings(w, sid), pos = (pid) => st.findIndex(e => e.pid === pid) + 1, my = st.find(e => e.pid === 'P'), raced = w.series[sid].results.length > 0;
  if (p.kind === 'podium_at') return { text, state: 'on', now: w.round === p.round ? 'This weekend' : `Round ${p.round + 1}`, here: w.round === p.round };
  if (p.kind === 'podiums') return { text, state: 'on', now: `${my ? my.pods : 0} of ${p.n} so far` };
  if (p.kind === 'win') return { text, state: 'on', now: 'Not yet' };
  if (!raced) return { text, state: 'on', now: 'No races yet' };
  if (p.kind === 'finish') { const n = pos('P'); return { text, state: n > 0 && n <= p.pos ? 'on' : 'off', now: `P${n} now` }; }
  if (p.kind === 'beat_mate') { const c = w.coop?.pid, a = pos('P'), b = c ? pos(c) : 0; return { text, state: b > 0 && b < a ? 'on' : 'off', now: b > 0 && b < a ? 'Ahead now' : 'Behind now' }; }
  if (p.kind === 'beat_team') { const ts = teamStandings(w, sid).map(e => e.tid), a = ts.indexOf(w.player.team), b = ts.indexOf(p.tid); return { text, state: a >= 0 && a < b ? 'on' : 'off', now: a >= 0 && a < b ? 'Ahead now' : 'Behind now' }; }
  return { text, state: 'on', now: '' };
}
// the old-money owner of a rival team: one per career, made when first needed
function rivalOwner(w) {
  if (w.rival && w.teams[w.rival.tid]?.series === w.player.series) return w.rival;
  const S = w.series[w.player.series], tids = S.teams.filter(t => t !== w.player.team);
  if (!tids.length) return null;
  const st = teamStandings(w, w.player.series), tid = (st.find(e => e.tid !== w.player.team && tids.includes(e.tid)) || { tid: tids[0] }).tid;
  const names = [['Charles', 'Ashby-Sterling'], ['Philippa', 'Vance-Holloway'], ['Rupert', 'Kingsley-Hume'], ['Margaret', 'Delacroix']];
  const [first, last] = w.rival?.name ? w.rival.name : pickLine(w, names);
  w.rival = { tid, name: [first, last] };
  return w.rival;
}
const rivalName = (w) => w.rival ? w.rival.name.join(' ') : '';
const rivalAddr = (w) => `${w.rival.name[0][0].toLowerCase()}.${w.rival.name[1].toLowerCase().replace(/[^a-z]/g, '')}@${w.teams[w.rival.tid].name.toLowerCase().replace(/[^a-z]+/g, '')}.sv`;
const JOURNO = ['Nadia Okafor', 'nadia.okafor@paddockwire.sv'];
const lastMe = (w) => { const r = w.series[w.player.series].results.at(-1); return r ? r.rows.find(x => x.pid === 'P') : null; };

// ---------- arcs ----------
// Each: kind (major/minor), cool (weeks before it can come again), trigger(w), start(w, a), step(w, a) (called each week
// once a.at comes round), answer(w, a, m, key). A story that's waiting on you has a.wait = the mail id.
const ARCS = {
  rival: { kind: 'major', cool: 8,
    trigger: (w) => w.round >= 2 && !!rivalOwner(w),
    start(w, a) {
      const R = rivalOwner(w), t = w.teams[R.tid];
      mail(w, rivalName(w), rivalAddr(w), 'Welcome to the paddock',
        [`I watched your car this weekend. Brave colors.`, `In my experience teams like yours last about a season and a half. I hope you're the exception.`, `If you'd like to sell your entry before then, do let me know. I'd give you a fair price for it, which is to say not much.`, `${R.name[0]} ${R.name[1]}`, `Team Owner, ${t.name}`]);
      a.at = nowIdx(w) + 1;
    },
    step(w, a) {
      const t = w.teams[w.rival.tid];
      if (a.step === 0) {
        a.step = 1; a.at = nowIdx(w) + 1;
        const x = (w.staff || []).filter(s => !s.danny).sort((p, q) => q.skill - p.skill)[0];
        if (!x) return;
        a.who = x.id;
        a.wait = mailId(w, `${x.first} ${x.last}`, `${x.first.toLowerCase()}.${x.last.toLowerCase()}@coolmail.sv`, 'An offer',
          [`I wanted you to hear it from me. ${t.name} have offered me a job: ${money$(Math.round(wageNow(w, x) * 1.4 / 50) * 50)} a round.`, `I'd rather stay. But I've got a mortgage.`, x.first],
          { arc: a.id, choices: [['match', `Match it (${money$(Math.round(wageNow(w, x) * 1.4 / 50) * 50)} a round)`], ['go', `Let ${x.first} go`]] });
        return;
      }
      if (a.step === 1) {
        a.step = 2; a.climax = w.year * 100 + w.round;
        w.dir.goal = { text: `Beat both ${t.name} cars`, tid: w.rival.tid, key: a.climax, arc: a.id };
        news(w, `${w.rival.name[1].toUpperCase()}: NEWCOMERS "GOOD FOR THE SPORT, IN MODERATION"`, `The ${t.name} owner says the ${seriesById(w.player.series).name} has "room for everyone, for a while".`);
        return;
      }
    },
    answer(w, a, m, key) {
      const x = (w.staff || []).find(s => s.id === a.who); a.wait = null;
      if (!x) return null;
      if (key === 'match') { x.wage = Math.round(x.wage * 1.4 / 50) * 50; x.morale = clamp(x.morale + 15, 0, 100); return { msg: `${x.first} stays, on more money.` }; }
      fireStaff(w, x.id, true); text(w, x.first, `Thanks for understanding. No hard feelings.`);
      return { msg: `${x.first} has gone to ${w.teams[w.rival.tid].name}.` };
    },
    // the climax: did you beat them?
    result(w, a, me) {
      const rows = w.series[w.player.series].results.at(-1)?.rows || [], theirs = rows.filter(r => teamOfPid(w, r.pid) === w.rival.tid);
      const won = me && !me.dnf && theirs.every(r => r.dnf || r.pos > me.pos);
      if (won) { mail(w, rivalName(w), rivalAddr(w), 'Congratulations', [`Well driven. Luck is a skill too, I'm told.`, w.rival.name[0]]); w.rep = clamp(repOf(w) + 4, 0, 100); news(w, `${w.teams[w.player.team].name.toUpperCase()} BEAT ${w.teams[w.rival.tid].name.toUpperCase()}`, `The newcomers finished ahead of both of ${rivalName(w)}'s cars.`); flag(w, 'beatRival'); }
      else mail(w, rivalName(w), rivalAddr(w), 'Better luck next time', [`Bad luck. Next year, perhaps. Or the one after.`, w.rival.name[0]]);
      return 'end';
    } },
  press: { kind: 'minor', cool: 6,
    trigger: (w) => { const me = lastMe(w); return (me && !me.dnf && me.pos <= 3) || (w.scandal && nowIdx(w) - w.scandal <= 1) || (w.round >= 3 && rng(w) < 0.2); },
    start(w, a) {
      const scandal = w.scandal && nowIdx(w) - w.scandal <= 1;
      a.wait = mailId(w, JOURNO[0], JOURNO[1], scandal ? 'Your side of the story?' : 'Interview request',
        [scandal ? `I'm writing about this week's news and I'd like to give you the chance to respond.` : `I'm writing a piece on the new teams in the ${seriesById(w.player.series).name} and I'd like to spend a day with yours.`, `It would mean a day of your week. I'd be fair.`, JOURNO[0], 'The Paddock Wire'],
        { arc: a.id, choices: [['yes', 'Yes (a day)'], ...(w.rival ? [['tip', `Off the record: tell her about ${w.rival.name[1]}`]] : []), ['no', 'Decline']] });
    },
    step() {},
    answer(w, a, m, key) {
      a.wait = null; a.done = true;
      const team = w.teams[w.player.team].name;
      if (key === 'yes') {
        if (freeDays(w) <= 0) { a.done = false; a.wait = m.id; return { err: 'No days free this week. Ask her for next week instead.' }; }
        bookDay(w, { fx: 'press', what: 'An interview with The Paddock Wire', tag: 'Interview' });
        return { msg: 'It\'s in your week: do it from the day planner.' };
      }
      if (key === 'tip') {
        w.press = pressOf(w) + 1;
        news(w, `${w.rival.name[1].toUpperCase()}'S TEAM "RUNS ON INHERITANCE", SAYS PADDOCK SOURCE`, `A source close to the ${seriesById(w.player.series).name} says ${w.teams[w.rival.tid].name} has never turned a profit.`);
        if (rng(w) < 0.4) mail(w, rivalName(w), rivalAddr(w), 'Sources', [`I read the Paddock Wire this morning. I know who the "paddock source" is.`, `I'll remember it.`, w.rival.name[0]]);
        flag(w, 'tip'); return { msg: 'The story runs this week, without your name on it.' };
      }
      w.press = pressOf(w) - 1;
      news(w, `${team.toUpperCase()} DECLINES TO COMMENT`, `The team did not respond to requests for an interview.`);
      return null;
    } },
  danny: { kind: 'minor', cool: 10,
    trigger: (w) => (w.staff || []).some(x => x.danny && (x.unpaidRounds || 0) >= 2),
    start(w, a) {
      const x = w.staff.find(s => s.danny);
      a.wait = mailId(w, 'Danny', 'dannyboy1979@coolmail.sv', 'so',
        [`Yo so the tire place on Route 9 offered me a job. Assistant manager. Dental plan and everything`, `Told them I'd think about it. I thought about it a little. I don't wanna go`, `But you owe me ${money$(x.owed)} and my landlord doesn't know what a racing team is`],
        { arc: a.id, choices: [['pay', `Pay him the ${money$(x.owed)}`], ['wait', 'Ask him to hang on'], ['go', 'Tell him to take the job']] });
    },
    step(w, a) {
      if (a.asked && !a.wait) { // (he hung on once; it's still not paid)
        const x = (w.staff || []).find(s => s.danny);
        if (x && x.owed > 0) { fireStaff(w, x.id); texts(w, 'Danny', [`Took the tire job`, `Still your boy. Still owed ${money$(x.owed)} but whatever`, `Come by and I'll hook you up on tires`]); w.dannyGone = true; }
        a.done = true;
      }
    },
    answer(w, a, m, key) {
      const x = (w.staff || []).find(s => s.danny); a.wait = null;
      if (!x) { a.done = true; return null; }
      if (key === 'pay') { if (w.money.balance < x.owed) return (a.wait = m.id, { err: "You don't have it." }); payBack(w, x.id); x.morale = 100; w.dannyLoyal = true; a.done = true; texts(w, 'Danny', [`You're a real one`, `Told the tire guy no. He said "ok" which kinda hurt`]); return { msg: 'Danny stays.' }; }
      if (key === 'wait') { a.asked = true; a.at = nowIdx(w) + 2; x.morale = clamp(x.morale - 10, 0, 100); return { msg: 'Danny will wait. For a bit.' }; }
      fireStaff(w, x.id); w.dannyGone = true; a.done = true; texts(w, 'Danny', [`All good, no hard feelings`, `I'll still send you stuff I find on SVList`]); return { msg: 'Danny has taken the tire job.' };
    } },
  ex: { kind: 'minor', cool: 99,
    trigger: (w) => !w.flags?.exDone && w.round >= 2 && ((lastMe(w) && !lastMe(w).dnf && lastMe(w).pos <= 3) || rng(w) < 0.12),
    start(w, a) { text(w, w.backstory?.ex || 'Sam', `saw you on the news. you look happy. or tired. hard to tell on my tv`); a.at = nowIdx(w) + 2; },
    step(w, a) {
      const ex = w.backstory?.ex || 'Sam';
      a.wait = mailId(w, ex, `${ex.toLowerCase()}.${(w.player.name.split(' ').pop() || 'x').toLowerCase()}@coolmail.sv`, 'news',
        [`I wanted to tell you before you heard it from someone else. I'm getting married again, to Brian. You met him once, at the hardware store.`, `It's in the spring. You're invited. You don't have to come.`, ex],
        { arc: a.id, choices: [['go', 'Say you\'ll come (a day)'], ['gift', 'Send a gift ($250)'], ['no', 'Don\'t reply']] });
    },
    answer(w, a, m, key) {
      const ex = w.backstory?.ex || 'Sam'; a.wait = null; a.done = true; flag(w, 'exDone');
      if (key === 'go') {
        if (freeDays(w) <= 0) { a.done = false; a.wait = m.id; return { err: 'No days free this week.' }; }
        bookDay(w, { fx: 'wedding', what: `${ex}'s wedding`, tag: 'Wedding', who: ex });
        return { msg: 'It\'s in your week: go from the day planner.' };
      }
      if (key === 'gift') { pay(w, -250, 'Wedding gift'); text(w, ex, `thank you for the toaster. we have three now. it's the nicest one`); return null; }
      text(w, ex, `ok`); return null;
    } },
};
function mailId(w, from, addr, subj, body, extra) { mail(w, from, addr, subj, body, extra); return w.mail[0]?.id; }
const MAX = { major: 1, minor: 2 };
// the weekly tick
export function director(w) {
  if (w.pre || !w.money || !w.money.choice || w.over) return;
  const D = w.dir ??= { arcs: [], cool: {}, quiet: 0, goal: null, n: 0 };
  adviser(w); consequences(w); investorWeek(w); investorFollow(w);
  for (const a of D.arcs) if (!a.done && !a.wait && a.at != null && nowIdx(w) >= a.at) ARCS[a.type].step(w, a);
  D.arcs = D.arcs.filter(a => { if (a.done || a.end) { D.cool[a.type] = nowIdx(w) + ARCS[a.type].cool; if (ARCS[a.type].kind === 'major') D.quiet = nowIdx(w) + 2; return false; } return true; });
  // room for another story?
  for (const [type, A] of Object.entries(ARCS).sort(() => rng(w) - 0.5)) {
    const running = D.arcs.filter(a => ARCS[a.type].kind === A.kind).length;
    if (running >= MAX[A.kind] || D.arcs.some(a => a.type === type) || (D.cool[type] || 0) > nowIdx(w) || (A.kind === 'major' && D.quiet > nowIdx(w))) continue;
    if (!A.trigger(w)) continue;
    const a = { id: 'a' + (++D.n), type, step: 0, at: null, wait: null, done: false };
    D.arcs.push(a); A.start(w, a);
    if (A.kind === 'major') break;
  }
  temptations(w);
}
// after a race: a story's climax resolves
function arcRound(w, me) {
  const D = w.dir, g = D && D.goal; if (!g || g.key !== w.year * 100 + w.round) return;
  const a = D.arcs.find(x => x.id === g.arc); D.goal = null;
  if (a && ARCS[a.type].result && ARCS[a.type].result(w, a, me) === 'end') a.end = true;
}
export const storyGoal = (w) => { const g = w.dir?.goal; return g && g.key === w.year * 100 + w.round ? g : null; };

// ---------- the briefing: what you're aiming at, what's going wrong, what to build up ----------
// For the garage: { targets: [{ text, who, amt? }], watch: [{ text, bad }], goals: [{ label, value, pct, note }] }
export const STAND_WORDS = (r) => r < 15 ? 'Unknown' : r < 30 ? 'Local' : r < 45 ? 'Noticed' : r < 60 ? 'Respected' : r < 75 ? 'Sought after' : 'A big name';
// what this weekend will cost, roughly: entry, travel, crew, fuel, tyres you haven't got, wages, loan instalments
export function weekendCost(w) {
  const c = COSTS[w.player.series], R = w.series[w.player.series].cal[w.round], m = mateOf(w);
  const need = tyreNeeds(w), st = stockOf(w), shortSets = staffOf(w, 'manager') ? 0 : ['soft', 'medium'].reduce((a, k) => a + Math.max(0, Math.min(need[k], 1) - st[k]), 0);
  return c.entry + (isHome(w, R) ? 0 : Math.round(c.travel * staffEffects(w).travel)) + c.crew + Math.round(c.fuelLap * 14 * (bgOf(w).fuel || 1)) + shortSets * Math.round(c.tyre * TRACKSIDE)
    + payrollDue(w) + (m && m.wage && m.pay !== 'hold' ? m.wage : 0) + (w.loans || []).filter(l => !l.paid && !l.shark).reduce((a, l) => a + l.per, 0) - roleDiscount(w);
}
export function briefing(w) {
  const sid = w.player.series, S = w.series[sid], c = COSTS[sid], targets = [], watch = [], goals = [];
  if (!w.money || !w.money.choice) return { targets, watch, goals, hint: '' };
  const st = standings(w, sid), i = st.findIndex(e => e.pid === 'P'), pos = i + 1, raced = S.results.length > 0;
  // this weekend
  if (!w.over) {
    for (const d of dealsOf(w)) {
      const sp = sponsorById(d.sid);
      if (d.shady) continue;
      targets.push({ text: objText(w, dealObjective(w, d)), who: sp.name, amt: d.bonus });
    }
    if (w.coop && w.people[w.coop.pid]) for (const pid of [w.coop.pid, 'P']) targets.unshift({ text: `Finish top ${driverTarget(w, pid)}`, who: `${pid === 'P' ? w.player.name.split(' ')[0] : w.people[pid].first}'s target`, amt: targetBonus(w) });
    const g = storyGoal(w); if (g) targets.push({ text: g.text, who: rivalName(w) || 'Rivalry' });
    if (raced && i > 0) { const gap = st[i - 1].pts - st[i].pts; targets.push({ text: gap ? `Close the ${gap}-point gap to P${i}` : `Get ahead of P${i}: you're level on points`, who: 'Championship' }); }
    else if (raced && i === 0 && st[1]) targets.push({ text: `Stay ahead: P2 is ${st[0].pts - st[1].pts} point${st[0].pts - st[1].pts === 1 ? '' : 's'} behind`, who: 'Championship' });
    for (const x of bookedGigs(w)) targets.push({ text: `Drive the ${GIG_KINDS[x.kind].name.toLowerCase()} you booked`, who: x.client });
    // (what you said at the launch: the one for this weekend first of all)
    for (const p of promisesOf(w).filter(p => !p.done)) { const n = promiseNow(w, p), t = { text: `${n.text}${n.now && !n.here ? ` (${n.now})` : ''}`, who: n.who ? `${n.who} promised` : 'You promised', promise: true, off: n.state === 'off' }; if (n.here) targets.unshift(t); else targets.push(t); }
  }
  // what's going wrong (worst first)
  const fz = finances(w), r = fz && fz.net < 0 ? fz.runway : 99, cost = w.over ? 0 : weekendCost(w);
  // (past the limit: the clock, first; else overdrawn: the fee, and how far the limit is)
  // (the sponsors' events, in one short line: the days they're on)
  { const q = (w.mail || []).find(m => m.pitch && !m.replied), I = w.investor; if (q && I) watch.push({ text: `${I.name.join(' ')} asked you something`, bad: false }); }
  { const din = w.money && !w.over ? openEvents(w).find(e => e.inv) : null; if (din) watch.push({ text: `${din.what}, ${DAY_FULL_NAMES[din.by]}`, bad: false }); }
  { const ev = w.money && w.founding?.reg && !w.over ? openEvents(w).filter(e => !e.inv) : []; if (ev.length) watch.push({ text: ev.length > 1 ? `Sponsor events: ${ev.map(e => DAY_NAMES[e.by]).join(', ')}` : `Sponsor event on ${DAY_FULL_NAMES[ev[0].by]}: ${sponsorById(ev[0].sid).name}`.slice(0, 48), bad: false }); }
  { const n = satOut(w), m = sitMax(w); if (n && !w.over) watch.push({ text: n >= m ? `Sat out ${n} of ${m} allowed: miss another and the entry goes` : `Sat out ${n} of ${m} rounds the series allows`, bad: n >= m }); }
  { const n = bankRoundsLeft(w), L = bankLimit(w);
    if (n != null) watch.push({ text: `Bank: above ${money$(-L)} in ${n} round${n === 1 ? '' : 's'} or it closes`, bad: true });
    else if (w.money.balance < 0) watch.push({ text: `Overdrawn by ${money$(-w.money.balance)}: the limit is ${money$(-L)}`, bad: true }); }
  if (w.money.balance >= 0 && !w.over && w.money.balance < cost) watch.push({ text: `This weekend costs about ${money$(cost)}. You have ${money$(w.money.balance)}`, bad: true });
  if (w.money.balance >= 0 && r < 4) watch.push({ text: `At this rate the money lasts about ${Math.max(0, Math.floor(r))} more round${Math.floor(r) === 1 ? '' : 's'}`, bad: r < 2 });
  if (payrollShort(w)) watch.push({ text: `Payroll is ${money$(payrollDue(w))}: not enough to pay everyone`, bad: true });
  for (const x of (w.staff || [])) if (x.owed > 0) watch.push({ text: `You owe ${x.first} ${money$(x.owed)} in wages`, bad: x.owed >= wageNow(w, x) * 2 });
  for (const l of (w.loans || [])) if (l.shark && !l.paid) watch.push({ text: `Sal wants ${money$(l.owe)}${nowIdx(w) >= l.due ? ' now' : ` in ${l.due - nowIdx(w)} round${l.due - nowIdx(w) === 1 ? '' : 's'}`}`, bad: true });
  for (const d of dealsOf(w)) {
    const sp = sponsorById(d.sid);
    if (w.logoShown && !w.logoShown.includes(d.sid)) watch.push({ text: `${sp.name}'s ${d.slot === 'title' ? 'name' : 'logo'} isn't on the car: they won't pay`, bad: true });
    else if (!d.shady && d.misses >= patienceOf(d)) watch.push({ text: `${sp.name}: miss this target and they walk`, bad: true });
  }
  const P = carParts(w);
  if (P) for (const k of PART_KEYS.slice().sort((a, b) => P[a].cond - P[b].cond)) if (P[k].cond < 0.5) watch.push({ text: `${PARTS[k].name} at ${Math.round(P[k].cond * 100)}%${PARTS[k].fail ? ': could fail in a race' : ''}`, bad: P[k].cond < 0.3 });
  if (!w.over && w.car && !staffOf(w, 'manager')) { const need = tyreNeeds(w), sk = stockOf(w); if (sk.soft < 1 || sk.medium < 1) watch.push({ text: `Low on tires: trackside sets cost ${Math.round((TRACKSIDE - 1) * 100)}% more`, bad: false }); }
  // (one short line each: the hub's card has room for that)
  { const st = stainOf(w); if (st) { const n = st.until - nowIdx(w); watch.push({ text: `Caught: no new sponsors or loans for ${n} round${n === 1 ? '' : 's'}`, bad: true }); } }
  if (w.excluded && w.excluded[w.year] && !w.over) watch.push({ text: `Excluded from ${w.year}'s results so far`, bad: true });
  if (w.grey) watch.push({ text: `Kev's map: ${Math.round(scrutiny(w, { pos: 3 }) * 100)}% risk on a podium, ${Math.round(scrutiny(w, { pos: 8 }) * 100)}% behind`, bad: false });
  if (w.founding?.reg && needsCar(w)) watch.push({ text: w.car ? `You need a car for the ${seriesById(w.player.series).name}` : `You don't have a car`, bad: true });
  const ask = (w.mail || []).filter(m => m.choices && !m.answer && !m.lottery).length;
  if (ask) watch.push({ text: `${ask} email${ask === 1 ? '' : 's'} waiting for an answer`, bad: false });
  if (gigRating(w) < 4.2) watch.push({ text: `GigGo has your account under review (${gigRating(w).toFixed(2)}): fewer jobs`, bad: false });
  watch.sort((a, b) => b.bad - a.bad);
  // what to build up
  const n = st.length, up = nextUp(sid), upName = upNames(sid), fund = fundOf(w, sid);
  const amb = ambitionOf(w);
  goals.push({ label: 'Championship', value: raced ? `P${pos}` : '—', pct: raced ? (n - pos) / Math.max(1, n - 1) : 0, aim: amb ? (n - amb.t) / Math.max(1, n - 1) : null });
  const rep = repOf(w), next = SPONSOR_POOL.map((x, k) => sponsorById('sp' + k)).filter(x => x.rep > rep && x.rep < 999 && (!x.town || x.town === w.home)).sort((a, b) => a.rep - b.rep)[0];
  goals.push({ label: 'Reputation', value: STAND_WORDS(rep), pct: rep / 100 });
  goals.push({ label: 'Money', value: money$(w.money.balance), pct: clamp(r / 12, 0, 1) });
  // what you're saving for: what the series above asks for, else the next thing for the garage
  const sv = savingFor(w);
  if (sv) goals.push({ label: 'Saving for', value: sv.name, pct: clamp(w.money.balance / sv.cost, 0, 1) });
  // the hint: what each one is for, in a line
  const hints = [];
  // one line: this year's ambition (how far off it you are) and anyone else's target, then the gate to the next rung,
  // always (the license it needs, or the promotion rule), so what you're chasing is never off the card
  let aim = '';
  if (amb && !w.over) {
    const gap = raced && pos > amb.t ? st[amb.t - 1].pts - st[pos - 1].pts : 0;
    aim = !raced ? `This year: ${amb.label.toLowerCase()}.` : pos <= amb.t ? `This year: ${amb.label.toLowerCase()}. You're P${pos}: on course.` : `This year: ${amb.label.toLowerCase()}. You're P${pos}, ${gap} point${gap === 1 ? '' : 's'} off.`;
  }
  { const I = investorIn(w); if (I && !w.over) aim += ` ${I.name[1]} (${Math.round(I.share * 100)}%) wants the top ${I.target}${I.misses ? ', or wants out' : ''}.`; }
  { const W = worksOf(w); if (W && !w.over) aim += ` ${W.maker} wants the top ${W.target}.`; }
  let gate = '';
  if (up && !w.over) {
    const short = upName.replace(/ Championship\b/g, '');
    if (!licOk(w, up.id)) { const left = licLeft(w, licNeed(up.id)); gate = `${up.name}: a ${licName(licNeed(up.id))} license, ${left} more clean race${left === 1 ? '' : 's'}.`; }
    else gate = raced && pos <= 3 ? `Top 3: on for a ${short} offer.` : `Top 3 or team top 2: a ${short} offer${raced && fund[pos - 1] && !aim ? ` (P${pos} pays ${money$(fund[pos - 1])})` : ''}.`;
  }
  const first = [aim.trim(), gate].filter(Boolean).join(' ');
  if (first) hints.push(first);
  // (money first when it's running out, else what reputation unlocks)
  if (r < 6) hints.unshift(`Money lasts about ${Math.max(0, Math.floor(r))} round${Math.floor(r) === 1 ? '' : 's'}: work the week, keep your sponsors.`);
  else if (sv && sv.why) hints.push(sv.why);
  else if (next) hints.push(`At reputation ${next.rep} bigger sponsors call (you're at ${rep}).`);
  const hint = hints.slice(0, watch.length >= 2 ? 1 : 2).join(' '); // (a busy card keeps it to one: the menu needs the room)
  return { targets, watch, goals, hint };
}

// the next thing worth saving for: { name, cost, why }
export function savingFor(w) {
  const t = myTeam(w), up = nextUp(w.player.series), to = w.player.offer?.answer === 'move' ? w.player.offer.to : up?.id;
  const miss = to ? seriesMissing(t, to) : [];
  if (miss.length) {
    const cost = miss.reduce((a, [k, n]) => { let c = 0; for (let l = facLevel(t, k) + (k === 'base' ? 1 : 0); l <= (k === 'base' ? n : n - 1); l++) c += FACILITIES[k].levels[l][1]; return a + c; }, 0);
    // (and a car for it: the cheapest lease's deposit, so the number's what getting in really takes)
    const S = seriesById(to), cars = S.car !== 'classifieds' ? customerCars(w, S) : [], dep = cars.length ? Math.min(...cars.map(c => c.deposit)) : 0;
    return { name: `The ${S.name}`, cost: cost + dep, why: `The ${S.name} needs ${miss.map(([k, n]) => needName(k, n)).join(' and ')}${dep ? `, and a car (a lease deposit from ${money$(dep)})` : ''}: ${money$(cost + dep)} to get in.` };
  }
  const opts = FAC_KEYS.map(k => ({ k, nx: facNext(t, k) })).filter(x => x.nx && x.k !== 'tunnel' && facLevel(t, 'base') >= x.nx.needsBase).sort((a, b) => a.nx.cost - b.nx.cost);
  return opts[0] ? { name: opts[0].nx.name, cost: opts[0].nx.cost, why: '' } : null;
}

// ---------------- the list: what you're chasing ----------------
// A sheet of paper taped to the garage wall, in your handwriting: why you're doing this (top), the ladder to the San
// Velocita Grand Prix (the middle: crossed off as it happens, close together at the start so the first ones go
// quickly), and this year's ambition (the bottom). Your why adds two lines of its own and decides who texts you when
// one is crossed off. w.list = { why, done: { key: { y, r, track, old } }, fresh: [keys not yet seen crossed off],
// late: { year: true } (someone wasn't paid on time) }. main.js + js/thelist.js draw it.
export const WHYS = {
  prove: { line: 'To prove them wrong.', name: 'To prove them wrong', who: 'Danny',
    desc: 'Adds <b>Beat whoever laughs first</b> and <b>Stop being "the lottery winner"</b> to the list. Danny keeps score with you, and your ex hears about the big ones.' },
  always: { line: "I've always wanted to.", name: "I've always wanted to", who: 'Mom',
    desc: 'Adds <b>Lead a lap</b> and <b>Win at home</b> to the list. Your mom follows every race, mostly through the paper.' },
  nothing: { line: 'Nothing else to do.', name: 'Nothing else to do', who: 'Danny',
    desc: 'Adds <b>Make it to the end of a season</b> and <b>Pay everyone on time, all season</b> to the list. Danny keeps an eye on you.' },
};
const won = (x) => x.me && !x.me.dnf && x.me.pos === 1;
// at: where it goes on the list. why: only on that list. round(w, x) / season(w, sum) / any(w): has it happened
// (x = { me, sid, R, led })
export const RUNGS = {
  start: { at: 1, text: () => 'Start a race', round: (w, x) => !!x.me },
  point: { at: 2, text: () => 'Score a point', round: (w, x) => !!x.me && x.me.pts > 0 },
  lead: { at: 3, why: 'always', text: () => 'Lead a lap', round: (w, x) => !!x.me && x.led > 0 },
  season: { at: 3.5, why: 'nothing', text: () => 'Make it to the end of a season', season: () => true },
  podium: { at: 4, text: () => 'Stand on a podium', round: (w, x) => !!x.me && !x.me.dnf && x.me.pos <= 3 },
  rival: { at: 4.5, why: 'prove', text: (w) => w.rival ? `Beat ${w.rival.name[1]}'s cars` : 'Beat whoever laughs first',
    round: (w, x) => { if (!w.rival || !x.me || x.me.dnf) return false; const th = (w.series[x.sid].results.at(-1)?.rows || []).filter(r => teamOfPid(w, r.pid) === w.rival.tid); return th.length > 0 && th.every(r => r.dnf || r.pos > x.me.pos); } },
  win: { at: 5, text: () => 'Win a race', round: (w, x) => won(x) },
  name: { at: 6, why: 'prove', text: () => 'Stop being "the lottery winner"', any: (w) => repOf(w) >= 45 },
  home: { at: 6, why: 'always', text: () => 'Win at home', round: (w, x) => won(x) && isHome(w, x.R) },
  paid: { at: 6, why: 'nothing', text: () => 'Pay everyone on time, all season', season: (w) => (w.staff || []).length > 0 && !listOf(w).late[w.year] },
  // (a career that started in the club: the license and the Street Cup first)
  license: { at: 6.5, start: 'club', text: () => 'Earn a National license', any: (w) => licOf(w).g >= 2 },
  street: { at: 6.8, start: 'club', text: () => 'Make the Street Cup', round: (w, x) => !!x.me && x.sid === 'street' },
  cup: { at: 7, text: () => 'Win the Street Cup', season: (w, s) => !!s.you && s.you.pos === 1 && s.you.s === 'street' },
  gt2: { at: 7.5, text: () => 'Make the GT2 Championship', round: (w, x) => !!x.me && x.sid === 'gt2' },
  gt: { at: 8, text: () => 'Race in GT1', round: (w, x) => !!x.me && x.sid === 'gt' },
  gtwin: { at: 9, text: () => 'Win a GT1 race', round: (w, x) => won(x) && x.sid === 'gt' },
  groupc: { at: 10, text: () => 'Race in Group C', round: (w, x) => !!x.me && x.sid === 'groupc' },
  gp: { at: 12, text: () => 'Win the San Velocita Grand Prix', round: (w, x) => won(x) && !!x.R?.gp },
};
export const GP_NAME = 'San Velocita Grand Prix';
export function listOf(w) {
  if (w.list) return w.list;
  const L = w.list = { why: null, done: {}, fresh: [], late: {} }, p = w.player, H = p.hist || [];
  // (a career from before the list: what's already happened comes crossed off)
  const old = (k) => { L.done[k] = { y: w.year, r: w.round, old: true }; };
  if (p.starts) old('start');
  if (H.some(h => h.pts > 0) || Object.values(w.series).some(S => S.results.some(r => r.rows.some(x => x.pid === 'P' && x.pts > 0)))) old('point');
  if (p.pods) old('podium');
  if (p.wins) old('win');
  if (H.some(h => h.s === 'street' && h.pos === 1)) old('cup');
  if (H.some(h => h.s === 'gt') || (p.series === 'gt' && p.starts && w.series.gt.results.some(r => r.rows.some(x => x.pid === 'P')))) old('gt');
  if (H.some(h => h.s === 'gt2' || h.s === 'gt') || p.series === 'gt') old('gt2'); // (a career that went to GT before there was a GT2)
  if (H.some(h => h.s === 'groupc') || (p.series === 'groupc' && w.series.groupc?.results.some(r => r.rows.some(x => x.pid === 'P')))) old('groupc');
  if (H.length) old('season');
  return L;
}
// the lines on your list, in order: [{ key, text, done }]
export function listRungs(w) {
  const L = listOf(w);
  return Object.entries(RUNGS).filter(([, r]) => (!r.why || r.why === L.why) && (!r.start || r.start === startOf(w))).sort((a, b) => a[1].at - b[1].at)
    .map(([key, r]) => ({ key, text: r.text(w), done: L.done[key] || null }));
}
export const listNext = (w) => listRungs(w).find(r => !r.done) || null;
export function setWhy(w, why) { if (!WHYS[why]) return; listOf(w).why = why; listCheck(w, null); }
// cross off whatever has just happened (ctx: a round { me, sid, R, led }, a season's end { season }, or null: anything
// that can happen any time)
function listCheck(w, ctx) {
  if (w.pre || !w.founding?.reg) return;
  const L = listOf(w);
  for (const [key, r] of Object.entries(RUNGS)) {
    if (L.done[key] || (r.why && r.why !== L.why) || (r.start && r.start !== startOf(w))) continue;
    const hit = ctx && ctx.season ? r.season && r.season(w, ctx.season) : ctx ? r.round && r.round(w, ctx) : r.any && r.any(w);
    if (!hit && !(r.any && r.any(w))) continue;
    L.done[key] = { y: w.year, r: w.round, track: ctx && ctx.R ? ctx.R.name : null };
    if (L.why) { L.fresh.push(key); listTexts(w, key); }
  }
}
// who tells you about it: Danny (prove them wrong, nothing else to do; your ex hears about the big ones if you set out to
// prove them wrong) or your mom (always wanted to)
const LIST_TEXTS = {
  Danny: {
    start: ['Saw the results', 'You actually did it lol', 'Still can\'t believe you own a race team'],
    point: ['A POINT', 'Framing that'],
    podium: ['Podium bro', 'Did they let you do the champagne or is that only the winner'],
    rival: ['Heard you beat that guy\'s cars', 'Double barrel name guy', 'Love that for you'],
    win: ['YOU WON', 'Like actually won', 'Telling everyone I know you'],
    name: ['Wire used your actual name today', 'Not lottery winner. Just you', 'Big'],
    season: ['Made it to the end of a season', 'Honestly didn\'t think you would', 'In a good way'],
    paid: ['Everyone got paid on time all season', 'Including me', 'Mostly me'],
    license: ['National license huh', 'Still not letting you drive my van'],
    street: ['Street Cup now', 'Real cars dude. Ones with doors that close'],
    cup: ['Street Cup champion', 'Gonna need you to sign my van'],
    gt2: ['GT2 bro', 'Proper race car. With a wing and everything'],
    gt: ['GT1 now huh', 'Don\'t forget the little people'],
    gtwin: ['You\'re winning in GT', 'This is insane man'],
    formula: ['Formula SV', 'Bro.'],
    groupc: ['Group C', 'The ones that look like spaceships', 'Bro.'],
    gp: ['I don\'t even know what to say', 'You won the actual Grand Prix', 'Remember when this was a lottery ticket'],
  },
  Mom: {
    start: ['I watched it on the computer. Linda from church showed me how.', 'Love, Mom'],
    point: ['One point! The paper says that\'s good.', 'Love, Mom'],
    lead: ['You were IN FRONT. I saw it.', 'I had to sit down. Love, Mom'],
    podium: ['A podium! I cut it out of the paper.', 'Love, Mom'],
    win: ['You won!! I told everyone at the store.', 'Even the people who weren\'t asking. Love, Mom'],
    home: ['You won at home. Half the street was there.', 'Mrs. Patel says she always knew. She did not. Love, Mom'],
    license: ['Your racing license came. I mean, you showed me a picture of it.', 'Love, Mom'],
    street: ['The Street Cup! Linda says that\'s the one with the real cars.', 'Love, Mom'],
    cup: ['Champion. The picture is going on the fridge.', 'Love, Mom'],
    gt2: ['Linda\'s son-in-law says GT2 is a very big deal. He sells boats.', 'Love, Mom'],
    gt: ['The GT Championship. Is that the one on television?', 'Love, Mom'],
    gtwin: ['Another win. I\'ve had to buy a second scrapbook.', 'Love, Mom'],
    formula: ['Formula SV! Please be careful in those little cars.', 'Love, Mom'],
    groupc: ['Your father had a poster of one of those cars. The blue and white one.', 'Please be careful, they look very fast. Love, Mom'],
    gp: ['You won the Grand Prix.', 'You used to watch it lying on the floor in front of the TV.', 'I\'m so proud of you. Love, Mom'],
  },
};
function listTexts(w, key) {
  const L = w.list, who = WHYS[L.why].who, lines = LIST_TEXTS[who][key];
  if (lines) { texts(w, who, lines); if (who === 'Mom') w._momTexted = nowIdx(w); } // (Mom's said it: her Sunday text about the paper waits)
  const ex = w.backstory?.ex;
  if (L.why === 'prove' && ex && (key === 'cup' || key === 'gp')) texts(w, ex, key === 'gp' ? ['Saw the news.', 'Congratulations. I mean that.'] : ['Saw you won something.', 'Good for you, I guess.']);
}
// after your round (recordPlayerRound / simPlayerRound): what it crossed off
function listRound(w, me, use) {
  const sid = w.player.series;
  // (the comeback: the new team's first podium makes the Wire)
  if (w.again && !w.again.back && me && !me.dnf && me.pos <= 3 && w.founding?.reg) { w.again.back = true; const t = w.teams[w.player.team].name; news(w, me.pos === 1 ? `${t.toUpperCase()} WINS: ${w.player.name.split(' ').pop().toUpperCase()} IS BACK` : `${w.player.name.split(' ').pop().toUpperCase()} BACK ON THE PODIUM`, `${w.player.name}, whose ${w.again.team} folded in ${w.again.y}, finished P${me.pos} at ${w.series[sid].cal[w.round]?.name || ''} with ${t}. "Second lottery, second team, first podium," said nobody, until now.`); }
  listCheck(w, { me, sid, R: w.series[sid].cal[w.round], led: use?.led ?? (me && me.pos === 1 && !me.dnf ? 1 : 0) });
}
// someone wasn't paid on time this year (runPayroll)
function listLate(w) { if (!w.pre) listOf(w).late[w.year] = true; }
// the crossings-off you haven't watched happen yet (main.js: the pen goes through them, then they're seen)
export const listFresh = (w) => w.list ? w.list.fresh : [];
export function listSeen(w) { if (w.list) w.list.fresh = []; }
// does the list want writing on (your why; this year's ambition, before the first race)?
export const listWants = (w) => !!w.founding?.reg && !!w.money?.choice && (!listOf(w).why || (ambitionDue(w) && setupDone(w))); // (the season's set up first: it changes where you should finish)

// ---------------- this year's ambition: a bet on yourself ----------------
// Before the first race of a season you write down what you're going for. Sponsors pay a little more for a bolder
// plan (and a little less for a timid one); at the end of the season, making it earns reputation (and, if it was a
// stretch, a bonus from your title sponsor), missing it costs reputation, and a missed stretch counts against renewal.
// stretch k: how far past where the team "should" finish (0: about there; below 0: playing it safe).
// w.amb = { y, series, t (target position), k, label, fee, repWin, repMiss, bonus, result }
export const ambitionOf = (w) => w.amb && w.amb.y === w.year && w.amb.series === w.player.series ? w.amb : null;
export const ambitionDue = (w) => !w.over && w.round === 0 && !ambitionOf(w) && !w.series[w.player.series].results.length;
// where the team ought to finish: its car against the field's (and, after a season here, where you did finish)
export function seasonOutlook(w) {
  const sid = w.player.series, S = w.series[sid], n = S.teams.length * SEATS, mine = myTeam(w);
  const vals = S.teams.map(t => carValue(w, w.teams[t])), mv = carValue(w, mine), rank = vals.filter(v => v > mv + 0.01).length; // (0: the quickest car)
  let e = rank * SEATS + 1.5;
  const last = w.player.hist.at(-1); if (last && last.s === sid) e = (e + last.pos) / 2;
  return { pos: clamp(Math.round(e), 1, n), rank: rank + 1, teams: S.teams.length, last: last && last.s === sid ? last.pos : null, n };
}
export function ambitionChoices(w) {
  const E = seasonOutlook(w), e = E.pos, n = E.n, fee = (dealsOf(w).find(d => d.slot === 'title') || {}).fee || 0;
  const ts = [...new Set([Math.min(n, e + 3), e, Math.max(1, Math.ceil(e / 2)), 1])].sort((a, b) => b - a);
  // (no room below where we should be, at the back of the field: a step between that and punching above it instead)
  if (ts.length < 4 && e > 3) { const mid = Math.round((e + Math.ceil(e / 2)) / 2); if (!ts.includes(mid)) { ts.push(mid); ts.sort((a, b) => b - a); } }
  const names = ['Keep it steady', 'Where we should be', 'Punch above our weight', 'Win it all', 'Push on'];
  return ts.map((t, i) => {
    const k = (e - t) / Math.max(2, e), stretch = Math.max(0, k);
    const label = t === 1 ? 'Win the title' : t === n ? 'Finish the season' : `Top ${t}`;
    return { t, k: +k.toFixed(3), label, name: t === 1 ? names[3] : t === e ? names[1] : t > e ? names[0] : t > Math.ceil(e / 2) ? names[4] : names[2],
      fee: +clamp(1 + 0.2 * k, 0.94, 1.2).toFixed(2), repWin: t > e ? 1 : Math.round(2 + 8 * stretch), repMiss: t > e ? 5 : Math.round(2 + 9 * stretch),
      bonus: Math.round(fee * w.opts.len * 0.4 * stretch / 500) * 500, renew: stretch > 0 };
  });
}
export function setAmbition(w, t) {
  const c = ambitionChoices(w).find(x => x.t === t); if (!c) return;
  w.amb = { y: w.year, series: w.player.series, ...c, result: null };
}
const ambFee = (w) => { const a = ambitionOf(w); return a ? a.fee : 1; };
// the end of the season: made it or not
function ambitionEnd(w, sum) {
  const a = ambitionOf(w), you = sum.you; if (!a || !you) return;
  const made = you.pos <= a.t, sp = dealsOf(w).find(d => d.slot === 'title'), spn = sp && sponsorById(sp.sid).name;
  a.result = { made, pos: you.pos };
  listOf(w).fresh.push('amb'); // (the tick or the line through it: main.js plays it at the list)
  if (made) {
    w.rep = clamp(repOf(w) + a.repWin, 0, 100);
    if (a.bonus && sp) { pay(w, a.bonus, `${spn}: bonus for making your season target (${a.label.toLowerCase()})`); mail(w, spn, sponsorAddr(spn), `${a.label}`, [`You said ${a.label.toLowerCase()}, and you did it. P${you.pos}.`, `As promised, ${money$(a.bonus)} is on its way.`, spn]); }
  } else {
    w.rep = clamp(repOf(w) - a.repMiss, 0, 100);
    if (a.renew) for (const d of dealsOf(w)) if (!d.shady) d.misses++;
    if (sp && a.k > 0) mail(w, spn, sponsorAddr(spn), 'Your season', [`You told us ${a.label.toLowerCase()}. You finished P${you.pos}.`, `We'll bear that in mind.`, spn]);
  }
}

// ---------------- tyres: what you have, what you order ----------------
// New sets in stock per compound, and used sets kept from earlier runs (with their wear). Order on the computer
// (paid when ordered, there for the next round); run out at a weekend and the trackside service sells you one at a
// premium. With a team manager, they keep you stocked for each round's forecast (and tell you what they ordered).
export const COMPOUNDS = ['soft', 'medium', 'hard', 'wet', 'dirt']; // (dirt: for the dirt rounds, R.surface)
export const TRACKSIDE = 1.5;
export const stockOf = (w) => { const s = (w.tyreStock = w.tyreStock || { soft: 0, medium: 0, hard: 0, wet: 0, dirt: 0 }); s.dirt ??= 0; return s; }; // (dirt: the shitbox league's dirt tracks, later)
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
  // (a dirt round runs on dirt tyres, all weekend, wet or dry)
  // (co-op: the co-owner's car runs on the same stock, so twice the sets)
  const n = w.coop ? 2 : 1;
  if (R.surface === 'dirt') return { soft: 0, medium: 0, hard: 0, wet: 0, dirt: (sessions + 2) * n };
  return { soft: (sessions + 1) * n, medium: n, hard: n, wet: wet ? 2 * n : 0, dirt: 0 };
}
// the team manager restocks for the next round (as you start it, or when the season rolls over)
export function managerRestock(w) {
  const m = staffOf(w, 'manager'); if (!m || w.restocked === w.year * 100 + w.round) return;
  w.restocked = w.year * 100 + w.round;
  const need = tyreNeeds(w), st = stockOf(w), order = {};
  for (const c of COMPOUNDS) order[c] = Math.max(0, need[c] - st[c]);
  const cost = orderTyres(w, order);
  if (cost) mail(w, `${m.first} ${m.last}`, `${m.first.toLowerCase()}@${w.teams[w.player.team].name.toLowerCase().replace(/[^a-z]+/g, '')}.sv`, 'Tires ordered',
    [m.danny ? `ordered tires for ${w.series[w.player.series].cal[w.round].name}:` : `I've ordered tires for ${w.series[w.player.series].cal[w.round].name}:`,
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
  w.founding = { ...(w.founding || {}), reg: true }; w.car2v = 1; // (car 2 is bought: careers from before it get theirs, car2Of)
  w.player.name = f.name; w.home = f.home; w.background = f.background; w.backstory = { ex: f.ex, years: f.years };
  const t = w.teams[w.player.team]; t.name = f.team; [t.main, t.accent] = f.colors;
  pay(w, -250, 'Business Registry: Form SV-1 processing fee');
  const first = f.name.split(' ')[0];
  mail(w, 'San Velocita Business Registry', 'no-reply@registry.sv.gov', `Registration confirmed: ${f.team}`,
    [`Thank you for registering ${f.team}, a Sporting Enterprise based in ${TOWNS[f.home].name}.`, `Your processing fee of $250 has been collected. Please keep this email for your records.`, `San Velocita Business Registry`], { read: true }); // (a receipt for what you just did: arrives read)
  for (const m of w.mail || []) if (m.link && m.link[0] === 'registry') m.read = true; // (filed: the reminder's done with)
  if (w.again) againNews(w, f);
  else w.lawyerDue = { ex: f.ex, first, last: f.name.split(' ').pop() }; // (their letter comes once you've spent a day: lawyerMail)
  // the classifieds (the setup's car step picks from them; Danny's marked one)
  w.ads = makeAds(w); dannyPick(w);
  w.staff = []; w.jobs = makeJobs(w);
  repOf(w); w.setup = newSetup(w);
  // (the previous team left a couple of things behind)
  w.tyreStock = { soft: 0, medium: 0, hard: 0, wet: 0, dirt: 0 }; w.usedTyres = [{ c: 'medium', wf: 0.72, wr: 0.7 }, { c: 'medium', wf: 0.55, wr: 0.58 }];
  if (w.money?.pick && !w.money.choice) claimLottery(w, w.money.pick); // (chosen at the claim office: paid now)
}
// your ex's lawyers: a letter once the dust has settled (the first day you spend, after the team's set up)
function lawyerMail(w) {
  const L = w.lawyerDue; if (!L) return; w.lawyerDue = null;
  mail(w, 'Hargreave & Webb, Family Law', 'office@hargreavewebb.sv', `${L.ex} v. ${L.last}: a quick question`,
    [`Dear ${L.first},`, `As you know, we act for ${L.ex}.`,
     `It has come to our attention that you won the State Lottery shortly after the decree was finalised. Congratulations. My client has asked us to confirm the date of the draw.`,
     `My client also asks us to pass on that starting a racing team is "exactly the kind of thing," and that they hope it goes really well.`, `Yours,`, `M. Hargreave`]);
}
// Danny's been through the listings: the best car for the money gets his mark (the setup's car step and SVList show it)
function dannyPick(w) {
  const ads = w.ads || []; if (!ads.length) return;
  const best = ads.slice().sort((a, b) => b.cond / b.price - a.cond / a.price)[0];
  for (const a of ads) a.tip = a === best ? pickLine(w, ['this one. trust me', 'this ones the move bro', 'get this one, the rest are cooked']) : null;
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
const AD_YEARS = { testarossa: [1984, 1991], jsport: [1993, 2002], rs964: [1989, 1994], mustang: [1987, 1993], m5: [1998, 2003], r34: [1999, 2002], miata: [1990, 1997],
  supra: [1993, 1998], nsx: [1990, 1997], rx7fd: [1992, 2002], corvettec4: [1990, 1995], p944turbo: [1986, 1991] };
const adYear = (w, key) => (([a, b]) => a + Math.floor(rng(w) * (b - a + 1)))(AD_YEARS[key] || [1986, 2003]);
// club racers selling their race cars (a one-make series: the car's the same, the history isn't)
const AD_BLURBS_CLUB = [
  ['Fresh motor last season. Cage, seat, belts in date. Spares package (2 sets of wheels).', 0.84], ['Logbook, all tech stickers. Small off at turn 1 last year, straightened.', 0.7],
  ['Ran mid-pack 3 seasons. Driver was the problem not the car.', 0.78], ['Selling to fund my kid\'s karting. Car is fast, ask anyone.', 0.8],
  ['Rolled once. Professionally fixed. Very professionally.', 0.6], ['Championship winning car (2 years ago). Comes with the trophy if you want it.', 0.86],
];
const AD_SELLERS_CLUB = ['Brent (Spec Miata #44)', 'Kev', 'Lou\'s Motorsport', 'Sandra (club racer)', 'miatajoe', 'Stu'];
// what's on the classifieds for a series that buys its cars there: the Street Cup's road cars (the list the save
// started with), or a one-make series' car, second-hand from other racers
const adCars = (w, S = seriesById(w.player.series)) => S.cls === 'street' ? (w.streetCars || [])
  : ((w.carCat && w.carCat[S.cls]) || []).map(c => ({ key: c.key, name: c.name, value: (S.price || [12000])[0] }));
// the colours they come in (until you paint them)
const AD_COLORS = [0xa81a1a, 0x1b1b1d, 0xe6e6e2, 0x24396e, 0x8c9198, 0x1f4a2c, 0xb8952a, 0x5e1822];
const AD_SELLERS = ['Dale', 'Rick (not a dealer)', 'Bev', 'Tony', 'mike_cars_cash', 'Desmond', 'Pauline', 'Gaz'];
const condWord = (c) => c >= 0.93 ? 'Like new' : c >= 0.82 ? 'Honest' : c >= 0.7 ? 'Tired' : 'Project';
export const condName = condWord;
function makeAds(w, S = seriesById(w.player.series)) {
  const cars = adCars(w, S), club = S.cls !== 'street';
  if (!cars.length) return [];
  const ads = [], blurbs = (club ? AD_BLURBS_CLUB : AD_BLURBS).slice().sort(() => rng(w) - 0.5), sellers = club ? AD_SELLERS_CLUB : AD_SELLERS;
  for (let i = 0; i < Math.max(3, cars.length); i++) { // (one listing per street car, so every one is on offer)
    const car = cars[i % cars.length], [blurb, c0] = blurbs[i % blurbs.length];
    const cond = clamp(c0 + (rng(w) - 0.5) * 0.08, 0.5, 0.99);
    const price = Math.round(car.value * (0.45 + cond * 0.6) * (bgOf(w).cars || 1) / 100) * 100;
    ads.push({ id: 'ad' + (w.nextId++), chassis: car.key, name: car.name, cls: S.cls, cond, price, color: AD_COLORS[Math.floor(rng(w) * AD_COLORS.length)], miles: Math.round((1 - cond) * 260 + 25 + rng(w) * 40) * 1000, year: adYear(w, car.key), blurb, seller: sellers[Math.floor(rng(w) * sellers.length)] });
  }
  return ads.sort((a, b) => a.price - b.price);
}
// the street cars as the game has them now (a save keeps the list from when it started): while you're still shopping,
// any car without a listing gets one (a car added since, or one the old six-listing cap left out)
export function syncStreetCars(w, cars) {
  if (!w || !cars || !cars.length) return;
  w.streetCars = cars;
  if (seriesById(w.player.series).cls !== 'street') return; // (the classifieds hold another series' cars)
  if (w.ads) w.ads = w.ads.filter(a => cars.some(c => c.key === a.chassis)); // (a car that's left the class comes off the classifieds)
  if (w.car || !w.ads || !w.ads.length) return;
  const fresh = cars.filter(c => !w.ads.some(a => a.chassis === c.key));
  if (!fresh.length) return;
  const all = w.streetCars; w.streetCars = fresh;
  w.ads = [...w.ads, ...makeAds(w).slice(0, fresh.length)].sort((a, b) => a.price - b.price);
  w.streetCars = all;
}
export const founding = (w) => !!(w.setup && !w.setup.done && setupKind(w) === 'team');
export function buyCar(w, adId, fromSetup = false) {
  const ad = (w.ads || []).find(a => a.id === adId); if (!ad || (w.car && !needsCar(w)) || (founding(w) && !fromSetup)) return false;
  // (moving up: the car you raced goes in part exchange)
  if (w.car) { const v = tradeIn(w); if (v) pay(w, v, `Trade-in: ${w.car.year} ${w.car.name}`); }
  w.car = { chassis: ad.chassis, name: ad.name, cls: ad.cls || 'street', cond: ad.cond, paid: ad.price, year: ad.year };
  w.founding.car = true; w.ads = w.ads.filter(a => a !== ad);
  carParts(w); refreshUsedParts(w);
  pay(w, -ad.price, `Classifieds: ${ad.year} ${ad.name} (from ${ad.seller})`);
  react(w, 'danny', `The player just bought their race car off the classifieds: a ${ad.year} ${ad.name} in ${condWord(ad.cond).toLowerCase()} condition, ${Math.round(ad.miles / 1000)}k miles, for ${money$(ad.price)}, from a seller called ${ad.seller}. Danny found the listings for them.`);
  mail(w, ad.seller, `${ad.seller.split(' ')[0].toLowerCase().replace(/[^a-z_]/g, '')}@coolmail.sv`, `re: ${ad.year} ${ad.name}`,
    [`pleasure doing business`, `keys are under the mat`, condWord(ad.cond) === 'Project' ? `if it makes a noise thats normal` : `no refunds`], { read: fromSetup });
  return true;
}
// how much a car's condition holds it back (power): a project car is about 4% down until R&D sorts it out
export const condPower = (cond) => 0.9 + 0.1 * clamp(cond ?? 1, 0.5, 1);

// ---------------- car 2: the car your teammate drives ----------------
// Your teammate needs a car. Until you buy one it's a hire car from the series' preferred supplier (a fee a round,
// down on pace, a little fragile); you can buy one like yours, or an older one (cheaper, slower, breaks more). A
// spec series (everyone the same chassis) leases it, a round at a time. A seat deal's driver (a gentleman, a shared
// seat, a maker's junior) comes with theirs. It wears every race and a DNF damages it; the repairs are on the round's
// bill: done properly, or patched (cheaper, and it breaks more). Careers from before car 2 had to be bought have one
// like yours already.
// w.car2: { kind: 'match' | 'old' | 'hire' | 'lease' | 'own', name, chassis, cond (0..1), paid, perRound, fix: 'full' | 'patch' }
// (co-op: 'own' is a model the co-owner picked themselves, another car of the class: car2Models / buyCar2Model)
const CAR2_HIRE = { club: 250, street: 300, gt2: 2500, gt: 6000, groupc: 14000, formula: 30000 }; // (a round)
// what the stand-in car two is called: a hire car, or in a one-make series an arrive-and-drive rental of the series' car
export const car2Hire = (w) => seriesById(w.player.series)?.oneMake ? 'an arrive-and-drive rental' : 'a hire car';
export function car2Of(w) {
  const m = mateOf(w); if (!m || !w.car) return null;
  const sd = seatOf(w); if (sd && ['gent', 'share', 'junior'].includes(sd.kind)) return { kind: 'theirs', name: `${w.people[m.pid].first}'s own`, cond: 1, fix: 'full' };
  // (a different series: the old car 2 isn't eligible; it's sold, for what it'll fetch)
  if (w.car2 && w.car2.series && w.car2.series !== w.player.series) { if (w.car2.paid) pay(w, Math.round(w.car2.paid * 0.4 * w.car2.cond / 500) * 500, `Car 2 sold (${w.car2.name})`); w.car2 = null; }
  if (!w.car2) {
    const S = seriesById(w.player.series);
    if (!w.car2v) w.car2 = { kind: 'match', name: w.car.name, cond: 0.85, paid: 0, fix: 'full' }; // (from before: theirs already)
    else if (S.car === 'spec') w.car2 = { kind: 'lease', name: w.car.name, cond: 1, perRound: car2Price(w).lease, fix: 'full' };
    else w.car2 = { kind: 'hire', name: S.oneMake ? `An arrive-and-drive ${w.car.name}` : 'A hire car', cond: 0.95, perRound: CAR2_HIRE[w.player.series] || CAR2_HIRE.street, fix: 'full' };
    w.car2.series = w.player.series;
  }
  return w.car2;
}
// what one would cost: { match (one like yours), old (an older one), lease (a round, a spec series) }
export function car2Price(w) {
  const S = seriesById(w.player.series), mine = w.car;
  const base = S.car === 'classifieds' ? Math.max(6000, mine?.paid || 0) : (customerCars(w, S).find(c => c.key === mine?.chassis) || customerCars(w, S)[0] || { price: (S.price || [200000])[0] }).price;
  const cc = customerCars(w, S).find(c => c.key === mine?.chassis);
  return { match: Math.round(base * 0.95 / 500) * 500, old: Math.round(base * 0.45 / 500) * 500, lease: cc ? cc.perRound : Math.round(base * 0.24 / w.opts.len / 500) * 500 };
}
// buy one (kind: 'match' | 'old'); the hire car goes back
export function buyCar2(w, kind) {
  const c2 = car2Of(w); if (!c2 || c2.kind === 'theirs' || c2.kind === 'lease' || c2.kind === kind) return false;
  const P = car2Price(w), price = kind === 'match' ? P.match : P.old;
  pay(w, -price, `Car 2: ${kind === 'match' ? `a ${w.car.name} like yours` : `an older ${w.car.name}`}`);
  w.car2 = { kind, name: w.car.name, chassis: w.car.chassis, cond: kind === 'match' ? 1 : 0.78, paid: price, fix: c2.fix || 'full', series: w.player.series };
  return true;
}
// a bought car two (one like yours, an older one, or the co-owner's own pick): it wears, it's repaired, it sells
export const car2Owned = (c) => !!c && ['match', 'old', 'own'].includes(c.kind);
// the model car two races: its own (co-op: the co-owner's pick), or yours
export const car2Chassis = (w) => (w.car2 && w.car2.kind === 'own' && w.car2.series === w.player.series && w.car2.chassis) || w.car?.chassis || null;
// co-op: the other cars of the class the co-owner can pick for car two instead of one like yours (a spec or one-make
// series: none, everyone's in the same car): [{ key, name, price }], new-ish, from the team's account
export function car2Models(w) {
  const S = seriesById(w.player.series); if (!w.coop || !w.car || S.car === 'spec' || S.oneMake) return [];
  const list = S.car === 'classifieds' ? adCars(w, S).map(c => ({ key: c.key, name: c.name, price: Math.round(c.value * 0.95 * (bgOf(w).cars || 1) / 500) * 500 }))
    : customerCars(w, S).map(c => ({ key: c.key, name: c.name, price: Math.round(c.price * 0.95 / 500) * 500 }));
  return list.filter(c => c.key !== w.car.chassis && c.price > 0);
}
export function buyCar2Model(w, key) {
  const c2 = car2Of(w), m = car2Models(w).find(c => c.key === key); if (!c2 || !m || c2.kind === 'theirs' || (c2.kind === 'own' && c2.chassis === key)) return false;
  if (car2Sale(w)) sellCar2(w); // (the one they had goes, for what it fetches)
  pay(w, -m.price, `Car 2: a ${m.name} (${coopPerson(w).first}'s pick)`);
  w.car2 = { kind: 'own', name: m.name, chassis: m.key, cond: 0.95, paid: m.price, fix: c2.fix || 'full', series: w.player.series };
  return true;
}
// selling car two (one you bought, not the hire car or a lease): what it fetches, the same as when a move up a series
// sells it for you; the hire car takes its place
export const car2Sale = (w) => { const c = w.car2; return car2Owned(c) && c.paid ? Math.round(c.paid * 0.4 * c.cond / 500) * 500 : 0; };
export function sellCar2(w) { const v = car2Sale(w); if (!v) return 0; pay(w, v, `Car 2 sold (${w.car2.name})`); w.car2 = null; return v; }
export function setCar2Fix(w, fix) { const c = car2Of(w); if (c && c.kind !== 'theirs') c.fix = fix; }
// what it does to the second car: { power, grip (multipliers), fail (the chance of a DNF, times), label }
export function car2Mods(w) {
  const c = car2Of(w); if (!c) return { power: 1, grip: 1, fail: 1, label: '' };
  const kindK = { old: [0.99, 0.995, 1.35], hire: [0.995, 0.997, 1.1] }[c.kind] || [1, 1, 1];
  return { power: kindK[0] * (0.96 + 0.04 * c.cond), grip: kindK[1], fail: kindK[2] * (1 + (1 - c.cond) * 1.5) * (c.fix === 'patch' ? 1.3 : 1),
    label: `Car 2 (${{ match: 'like yours', old: 'older', hire: 'hired', lease: 'leased', own: c.name }[c.kind] || 'theirs'}) at ${Math.round(c.cond * 100)}%` };
}
// after a round: what it went through, and the bill (the hire or the lease, the repairs)
// (use.car2.damage: co-op, what the co-owner's car really went through, 0..1 of a write-off, as yours is measured;
// otherwise a guess: a scrape, or worse if it didn't finish)
function car2Round(w, use = null) {
  const c = car2Of(w); if (!c || c.kind === 'theirs') return [];
  const items = [], cost = COSTS[w.player.series], m = mateOf(w), res = w.series[w.player.series].results.find(x => x.round === w.round), row = res && res.rows.find(r => r.pid === m.pid);
  if (c.perRound) items.push([c.kind === 'lease' ? `Car 2 lease (${w.car.name})` : `Car 2: ${car2Hire(w).replace(/^an? /, 'the ')}`, -c.perRound]);
  if (!row) return items;
  const real = use && use.car2 && use.car2.damage != null, dmg = real ? use.car2.damage : row.dnf && !row.dsq ? 0.2 + rng(w) * 0.3 : 0.02 + rng(w) * 0.04;
  // (a hire car: they fix it and bill the damage; yours: fixed properly, or patched)
  if (c.kind === 'hire' || c.kind === 'lease') { if ((real && dmg > 0.03) || (!real && row.dnf && !row.dsq)) items.push([`Car 2: damage (${seriesById(w.player.series)?.oneMake ? 'the rental' : 'the hire company'})`, -Math.round(dmg * cost.repair * 0.3 / 100) * 100]); return items; }
  const full = c.fix !== 'patch', bill = Math.round(dmg * cost.repair * (full ? 1 : 0.4) / 100) * 100;
  c.cond = +clamp(full ? Math.max(c.cond, 0.95) : c.cond - dmg * 0.5, 0.3, 1).toFixed(3);
  if (bill) items.push([`Car 2: repairs${full ? '' : ' (patched)'}${row.dnf ? ` (${w.people[m.pid].first} didn't finish)` : ''}`, -bill]);
  return items;
}
// ---------------- car two: your teammate's car ----------------
// The same chassis, but each upgrade goes on one car or both: a fitted part says which (on: 'me' | 'mate' | 'both';
// an older save's are on both), a project's gain goes into w.car.dev (yours) or w.car.dev2 (theirs). w.car.lean counts
// the upgrades yours has had that theirs hasn't (a new car starts level). Who gets what is your teammate's business
// too: Trust (w.mate.trust, 0..100) falls when you keep the new bits for yourself (more when they're the quicker
// one) and rises when they get them. It isn't a number anyone says out loud: it's how they are with you.
export const FIT_TO = ['me', 'mate', 'both'];
const onCar = (f, car) => (f.on || 'both') === 'both' || f.on === car;
export const dev2Of = (w) => w.car ? (w.car.dev2 ??= { ...(w.car.dev || devZero()) }) : devZero();
export const carLean = (w) => w.car && mateOf(w) ? w.car.lean || 0 : 0;
export const trustOf = (w) => { const m = mateOf(w); return m ? (m.trust ??= 60) : 60; };
export const trustWord = (v) => v >= 72 ? 'solid' : v >= 50 ? 'fine' : v >= 30 ? 'shaky' : 'gone';
// car two against yours, as you'd say it
export const leanText = (n) => !n ? 'Level with yours' : `${Math.abs(n)} upgrade${Math.abs(n) === 1 ? '' : 's'} ${n > 0 ? 'behind' : 'ahead of'} yours`;
// an upgrade went somewhere (what: what it was, for their texts)
function favor(w, to, what) {
  const m = mateOf(w); if (!m || !w.car) return;
  if (m.human) { w.car.lean = (w.car.lean || 0) + (to === 'me' ? 1 : to === 'mate' ? -1 : 0); return; } // (a co-owner keeps their own count)
  const p = w.people[m.pid], tr = traitsOf(w, p), h = h2hOf(w, m.pid), quicker = h.races >= 2 && h.behind * 2 > h.races, lean = w.car.lean || 0;
  trustOf(w);
  if (to === 'me') {
    w.car.lean = lean + 1;
    const k = (quicker ? 9 : 5) * (lean >= 2 ? 1.3 : 1) * (tr.includes('loyal') ? 0.6 : tr.includes('hothead') || tr.includes('digger') ? 1.3 : 1);
    m.trust = clamp(m.trust - k, 0, 100);
    if (lean + 1 >= 2 && rng(w) < 0.55) {
      text(w, p.first, pickLine(w, quicker
        ? [`Saw the new ${what} on your car. I'm the one beating you, but sure.`, `Another one for car one. Fastest driver, slowest car. Love that for me.`]
        : [`Nice ${what}. Mine must be in the post.`, `Saw the ${what}. Does car two get one or is that a premium thing.`, `Another one for car one. Cool cool cool.`]));
      react(w, 'mate', `The player, who owns the team, just put a new ${what} on their own car and not on ${p.first}'s. Car two is now ${w.car.lean} upgrades behind.${quicker ? ` ${p.first} has been finishing ahead of the player.` : ''}`);
    }
  } else if (to === 'mate') {
    w.car.lean = lean - 1;
    m.trust = clamp(m.trust + (lean <= -2 ? 2 : 6), 0, 100);
    if (rng(w) < 0.5) text(w, p.first, pickLine(w, [`The ${what}? On my car? Who are you and what have you done with the boss.`, `Fitted the ${what}. Feels mint. Cheers.`, `New ${what} on car two. I'll try not to beat you with it.`]));
  } else m.trust = clamp(m.trust + 1.5, 0, 100);
}
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
  if (!w.car.parts) { const c0 = w.car.cond ?? 0.85; w.car.parts = {}; for (const k of PART_KEYS) w.car.parts[k] = { cond: +clamp(c0 + (rng(w) - 0.5) * 0.24, 0.35, 1).toFixed(3), fits: [] }; }
  // (a part used to take one upgrade, a second replacing the first: now they stack, so older saves get a list)
  for (const k of PART_KEYS) { const p = w.car.parts[k]; if (p && !p.fits) { p.fits = p.fit ? [p.fit] : []; delete p.fit; } }
  return w.car.parts;
}
// Everything acting on the car, by what it changes (MOD_CH) and where it comes from (MOD_SRC): each item is
// { src, label, v (the true change, a fraction), shown (what you know of it), how ('exact' | 'measured' | 'claimed' |
// 'unknown'), part, add }. Upgrades on the same stat add up (add: true); everything else multiplies. carMods is the
// product of the true values; the car's spec sheet (js/carsheet.js) shows what you know.
export const MOD_CH = ['power', 'grip', 'brake', 'downforce', 'drag', 'damage'];
export const MOD_SRC = ['wear', 'parts', 'dev', 'week', 'rules'];
export function carBreakdown(w, car = 'me') {
  const P = carParts(w); if (!P) return null;
  const out = Object.fromEntries(MOD_CH.map(k => [k, []])), lvl = dataLevel(w), dyno = facLevel(myTeam(w), 'dyno');
  const put = (ch, src, label, v, o = {}) => { if (Math.abs(v) > 1e-6 || o.how) out[ch].push({ src, label, v, shown: o.shown ?? v, how: o.how || 'exact', part: o.part || null, add: !!o.add }); };
  const pc = (k) => Math.round(P[k].cond * 100);
  // wear (the condition of each part is always known)
  put('power', 'wear', `Engine at ${pc('engine')}%`, 0.1 * P.engine.cond - 0.1, { part: 'engine' });
  put('grip', 'wear', `Suspension at ${pc('suspension')}%`, 0.04 * P.suspension.cond - 0.04, { part: 'suspension' });
  put('brake', 'wear', `Brakes at ${pc('brakes')}%`, 0.1 * P.brakes.cond - 0.1, { part: 'brakes' });
  put('damage', 'wear', `Chassis at ${pc('chassis')}%`, 0.15 - 0.15 * P.chassis.cond, { part: 'chassis' });
  // upgrades: the engineer's measurement if there is one, else the maker's claim (used parts come with none)
  for (const k of PART_KEYS) {
    for (const f of P[k].fits) if (onCar(f, car)) for (const [stat, v] of Object.entries(f.gains || {})) {
      if (!out[stat]) continue;
      const m = f.measured && f.measured.stat === stat ? f.measured : null, cl = f.claim?.[stat];
      put(stat, 'parts', f.name, v, { add: true, part: k, ...(m ? { shown: m.val, how: m.lvl >= 2 ? 'measured' : 'rough' } : cl != null ? { shown: cl, how: 'claimed' } : { shown: 0, how: 'unknown' }) });
    }
  }
  if (w.grey && onCar({ on: w.grey.on || 'me' }, car)) put('power', 'parts', 'Engine map (Kev)', GREY_POWER, { part: 'engine' });
  // development (exact with a data engineer; engine work with a dyno too; otherwise you only know it's there)
  const D = (car === 'mate' ? dev2Of(w) : w.car.dev) || {};
  const AREA = { power: 'Engine', grip: 'Chassis', downforce: 'Aero', brake: 'Brakes' };
  for (const stat of ['power', 'grip', 'downforce', 'brake']) if (D[stat]) put(stat, 'dev', `${AREA[stat]} development`, D[stat], lvl >= 1 || (stat === 'power' && dyno) ? {} : { shown: 0, how: 'unknown' });
  // this week: a test day found the setup, or the sim rig some of it
  const wk = w.week && w.week.key === weekKey(w) ? w.week : null;
  if (roleWeek(w).done.data) put('grip', 'week', 'Data day setup', 0.005);   // (co-op: the Technical Director's data day)
  if (wk && wk.setup) put('grip', 'week', 'Test day setup', 0.012); else if (wk && (wk.sim || wk.brief)) put('grip', 'week', wk.sim ? 'Sim rig setup' : 'Your teammate\'s notes', 0.004 * ((wk.sim || 0) + (wk.brief || 0)));
  // car 2: its condition, and an older or hired car's deficit (car2Of)
  if (car === 'mate') { const c2 = car2Mods(w); if (c2.power !== 1) put('power', 'wear', c2.label, c2.power - 1); if (c2.grip !== 1) put('grip', 'wear', c2.label, c2.grip - 1); }
  // your teammate's notes for this race (one who trusts you shares them)
  const mt = mateOf(w); if (mt && mt.tipFor === `${w.year}:${w.round}`) put('grip', 'week', `${w.people[mt.pid].first}'s notes`, 0.004);
  // the rules: GT's balance of performance and success ballast
  const [bop, bopG] = bopFor(w, w.car.chassis), bl = ballastOf(w);
  if (bop !== 1) put('power', 'rules', 'Balance of performance', bop - 1);
  if (bopG !== 1) put('grip', 'rules', bopG < 1 ? 'Balance of performance (ballast)' : 'Balance of performance (weight)', bopG - 1);
  if (bl) put('power', 'rules', `Success ballast (${bl} kg)`, -bl * 0.0006);
  return out;
}
// one stat's total change (key 'v': the truth; 'shown': what you know), for the sources given
export function modOf(items, key = 'v', srcs = null) {
  let mul = 1, add = 0;
  for (const x of items) { if (srcs && !srcs.includes(x.src)) continue; if (x.add) add += x[key]; else mul *= 1 + x[key]; }
  return mul * (1 + add);
}
// the car as the race sees it (World Career's player modifiers)
export function carMods(w, car = 'me') {
  const B = carBreakdown(w, car); if (!B) return null;
  return { ...Object.fromEntries(MOD_CH.map(k => [k, modOf(B[k])])), rainGrip: 1, wear: 1, slip: 1, softs: false, launch: false };
}
const mechFactor = (w) => { const m = staffOf(w, 'mechanic'); return m ? (1.2 - 0.08 * m.skill) * (m.morale < 35 ? 1.3 : 1) : 1.25; };
// the chance each part fails this race (0..1)
export function failOdds(w) {
  const P = carParts(w), out = {}; if (!P) return out;
  const dyno = roleWeek(w).done.dyno ? 0.4 : 1;   // (co-op: the Technical Director's dyno day: the engine and gearbox checked)
  for (const k of PART_KEYS) { const p = PARTS[k]; if (!p.fail) continue; out[k] = clamp((k === 'engine' || k === 'gearbox' ? dyno : 1) * p.fail * (1 - P[k].cond) ** 2 * (P[k].fits.length ? 1.6 - Math.min(...P[k].fits.map(f => f.q ?? 1)) : 1) * mechFactor(w) * (w.car.rel || 1) * (1 - (w.car.dev?.rel || 0)), 0, 0.5); }
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
    const p = PARTS[k]; let d = (p.wear + p.lap * laps) * (k === 'engine' && w.grey && (w.grey.on || 'me') !== 'mate' ? GREY_WEAR : 1);
    if (k === 'suspension') d += damage * 0.5; else if (k === 'aero') d += damage * 0.6; else if (k === 'chassis') d += damage * 0.4;
    P[k].cond = +clamp(P[k].cond - d * (0.8 + rng(w) * 0.4), 0.05, 1).toFixed(3);
  }
  if (failed && P[failed]) P[failed].cond = Math.min(P[failed].cond, 0.15);
  // (a leased car's engine and gearbox go back to the programme between rounds, and come back rebuilt)
  if (w.car.lease) for (const k of ['engine', 'gearbox']) P[k].cond = Math.max(P[k].cond, 0.9);
}
// work on a part: a rebuild (your mechanic, or a shop) or a new one
export const rebuildCost = (w, k) => Math.round(PARTS[k].cost * COSTS[w.player.series].repair * (staffOf(w, 'mechanic') ? 1 : 1.5) * (bgOf(w).repair || 1) * (1 - 0.1 * facLevel(myTeam(w), 'tools')) / 50) * 50;
export const newPartCost = (w, k) => Math.round(PARTS[k].cost * COSTS[w.player.series].repair * 2.2 / 50) * 50;
// where a rebuild gets a part back to, about (your chief mechanic, or a shop)
export const rebuildTo = (w) => { const m = staffOf(w, 'mechanic'); return m ? 0.68 + 0.05 * m.skill - (m.morale < 35 ? 0.08 : 0) : 0.8; };
export function rebuildPart(w, k) {
  const P = carParts(w), m = staffOf(w, 'mechanic'), cost = rebuildCost(w, k);
  const to = rebuildTo(w) + (m ? (rng(w) - 0.5) * 0.06 : 0);
  P[k].cond = +Math.max(P[k].cond, clamp(to, 0.4, 0.97)).toFixed(3);
  pay(w, -cost, `${PARTS[k].name} rebuild (${m ? m.first : 'outsourced'})`);
}
export function newPart(w, k) { const P = carParts(w), cost = newPartCost(w, k); P[k].cond = 1; pay(w, -cost, `New ${PARTS[k].name.toLowerCase()} (OEM)`); }

// upgrades: { id, name, slot, gains: { stat: fraction }, claim, q (0..1: how well made), price, used, blurb }
const KIT = {
  street: [
    ['engine', 'Sport exhaust', { power: 0.0108 }, 0.9, 3200], ['engine', 'Performance chip', { power: 0.0162 }, 0.72, 2600], ['engine', 'Ported cylinder head', { power: 0.0243 }, 0.8, 7500],
    ['gearbox', 'Uprated clutch', { power: 0.0032 }, 1, 1800], ['gearbox', 'Short-shift kit', { power: 0.0022 }, 0.98, 900],
    ['suspension', 'Coilovers', { grip: 0.0045 }, 0.9, 4800], ['suspension', 'Polyurethane bushings', { grip: 0.0018 }, 0.95, 1200],
    ['brakes', 'Race pads', { brake: 0.0108 }, 0.9, 1100], ['brakes', 'Big brake kit', { brake: 0.018 }, 0.95, 5500],
    ['aero', 'Front splitter', { downforce: 0.0144, drag: 0.0018 }, 1, 1600], ['aero', 'Rear wing', { downforce: 0.027, drag: 0.0054 }, 1, 2900],
    ['chassis', 'Seam welding', { grip: 0.0014, damage: -0.1 }, 1, 2000], ['chassis', 'Bolt-in roll cage', { damage: -0.2 }, 1, 3500],
  ],
  // GT: homologated parts only (the cars are balanced, so the gains are small and dear)
  gt: [
    ['engine', 'Evo engine map (homologated)', { power: 0.0119 }, 1, 9000], ['engine', 'Lightweight flywheel', { power: 0.0079 }, 0.92, 6500],
    ['gearbox', 'Sequential gearbox', { power: 0.0079 }, 0.9, 28000], ['gearbox', 'Quick-change ratios', { power: 0.004 }, 1, 8000],
    ['suspension', 'Customer-spec dampers', { grip: 0.005 }, 0.95, 16000], ['suspension', 'Adjustable anti-roll bars', { grip: 0.0026 }, 1, 7000],
    ['brakes', 'Carbon brakes', { brake: 0.0264 }, 0.9, 22000], ['brakes', 'Endurance pads', { brake: 0.0099 }, 1, 3500],
    ['aero', 'Evo aero kit', { downforce: 0.0264, drag: 0.0033 }, 1, 30000], ['aero', 'Gurney flap', { downforce: 0.0099, drag: 0.0013 }, 1, 2500],
    ['chassis', 'Lightweight body panels', { grip: 0.0033, damage: 0.05 }, 0.9, 18000], ['chassis', 'FIA-spec roll cage', { damage: -0.15 }, 1, 12000],
  ],
};
// (GT2: GT's homologated parts, at about half the price)
KIT.gt2 = KIT.gt.map(([slot, name, gains, q, price]) => [slot, name, gains, q, Math.round(price * 0.5 / 100) * 100]);
KIT.groupc = KIT.gt.map(([slot, name, gains, q, price]) => [slot, name, gains, q, Math.round(price * 1.8 / 100) * 100]);
const PRICE_K = { club: 0.6, street: 1, gt2: 1.8, gt: 3, groupc: 5, formula: 9 };
const claimOf = (gains, k) => Object.fromEntries(Object.entries(gains).map(([s, v]) => [s, +(v * k).toFixed(3)]));
// the parts catalogue (new, from a supplier: the claims are the supplier's)
export function catalogue(w) {
  const own = KIT[w.player.series], kits = own || KIT.street, k = own ? 1 : PRICE_K[w.player.series] || 1; // (a series without its own list: the street parts, at its prices)
  return kits.map(([slot, name, gains, q, price], i) => ({ id: 'cat' + i, slot, name, gains, claim: claimOf(gains, i % 3 === 1 ? 1.5 : 1.2), q, price: Math.round(price * k), used: false }));
}
const USED_BLURB_PRO = ['Spare from last season. Never raced.', 'One event old. Crack-tested.', 'Surplus to requirements.', 'Removed after round 3. No reason given.', 'Ex-works. Paperwork available.'];
const USED_BLURB = ['Came off my car, ran fine.', 'Bought it, never fitted it. Wife says it has to go.', 'Ex-race car part. Some wear.', 'Rebuilt by my brother-in-law.', 'Not sure what it fits. Probably yours.', 'Fell off a truck (not literally).', 'Low miles. Some surface rust.'];
// SVList's parts section: a fresh handful each round, of very variable honesty
export function refreshUsedParts(w) {
  const kits = KIT[w.player.series] || KIT.street, k = KIT[w.player.series] ? 1 : PRICE_K[w.player.series] || 1;
  // (above the Street Cup, the used parts are other teams' spares)
  const classifieds = seriesById(w.player.series).car === 'classifieds', sellers = classifieds ? AD_SELLERS : w.series[w.player.series].teams.filter(t => t !== w.player.team).map(t => w.teams[t].name);
  w.usedParts = [];
  for (let i = 0; i < 5; i++) {
    const [slot, name, gains, q0, price] = kits[Math.floor(rng(w) * kits.length)], luck = 0.25 + rng(w) * 1.1;
    w.usedParts.push({ id: 'up' + (w.nextId++), slot, name, gains: Object.fromEntries(Object.entries(gains).map(([s, v]) => [s, +(v * luck).toFixed(4)])),
      q: +clamp(q0 - 0.15 - rng(w) * 0.45, 0.2, 0.95).toFixed(2), price: Math.round(price * k * (0.3 + rng(w) * 0.3) / 50) * 50, used: true, blurb: pickLine(w, classifieds ? USED_BLURB : USED_BLURB_PRO), seller: pick(w, sellers) });
  }
  // Danny knows a guy (some rounds)
  if (w.dannyHired && rng(w) < 0.4) {
    const deal = w.usedParts[Math.floor(rng(w) * w.usedParts.length)]; deal.price = Math.round(deal.price * 0.7 / 50) * 50; deal.danny = true;
    texts(w, 'Danny', pickLine(w, [[`Yo my cousin's selling a ${deal.name}`, `It's on SVList. Says he'll do ${money$(deal.price)}`], [`Found a ${deal.name} on SVList`, `Guy owes me a favor. ${money$(deal.price)}`]]));
  }
}
// how an upgrade feels from the driver's seat (honest-ish: you can fool yourself)
export function feelOf(w, part) {
  const [stat, v] = Object.entries(part.gains)[0] || ['power', 0], felt = v + (rng(w) - 0.5) * 0.02;
  const S = { power: ['pulls noticeably harder', 'feels a bit stronger', 'hard to say', 'feels flat, if anything'], grip: ['turns in much sharper', 'feels more planted', 'hard to tell', 'feels nervous'],
    brake: ['stops a lot shorter', 'better pedal', 'about the same', 'pedal feels long'], downforce: ['stuck down in fast corners', 'a bit more stable at speed', 'can\'t feel it', 'feels light'], damage: ['feels solid', 'feels solid', 'feels the same', 'feels the same'] }[stat] || ['?', '?', '?', '?'];
  return felt > 0.025 ? S[0] : felt > 0.008 ? S[1] : felt > -0.004 ? S[2] : S[3];
}
// to: your car, your teammate's, or both (two of them: twice the price; SVList has one of each)
export function buyFit(w, part, to = 'me') {
  if (!mateOf(w) || (part.used && to === 'both')) to = 'me';
  const P = carParts(w); if (!P || isFitted(w, part, to)) return false;
  const m = staffOf(w, 'mechanic'), fee = m ? 0 : 400, had = P[part.slot].fits.find(f => f.name === part.name);
  // (already on the other car: one more, and it's on both)
  const n = to === 'both' && !had ? 2 : 1;
  pay(w, -(part.price * n + fee), `${part.name}${n > 1 ? ' (two)' : ''}${part.used ? ' (used, SVList)' : ''}${to === 'mate' ? `, for ${w.people[mateOf(w).pid].first}'s car` : ''}${fee ? ' + fitting at a shop' : ''}`);
  const was = had && had.on;
  if (had) had.on = 'both';
  else P[part.slot].fits.push({ name: part.name, gains: part.gains, q: part.q, used: part.used, claim: part.claim || null, feel: feelOf(w, part), measured: null, on: mateOf(w) ? to : 'both' });
  favor(w, had ? (was === 'me' ? 'mate' : 'me') : to, part.name.toLowerCase());
  if (part.used) w.usedParts = (w.usedParts || []).filter(x => x.id !== part.id);
  if (rng(w) < 0.5) react(w, 'danny', `The player just bought and fitted a ${part.name} (${PARTS[part.slot]?.name.toLowerCase() || 'part'}) for ${money$(part.price)}${part.used ? ', second-hand off SVList' : ''}.`);
  return true;
}
// already on the car (the same part on that part of the car: upgrades stack, but not two of the same)
export const isFitted = (w, part, to = 'me') => { const P = carParts(w); return !!(P && P[part.slot]?.fits.some(f => f.name === part.name && (to === 'both' ? (f.on || 'both') === 'both' : onCar(f, to)))); };
// take an upgrade off (i: which, in the order they were fitted)
export function removeFit(w, slot, i = 0) { const P = carParts(w); if (P && P[slot]) P[slot].fits.splice(i, 1); }
// after a round: your data engineer measures what the upgrades really do (a junior roughly, a senior closely)
export function measureParts(w) {
  const P = carParts(w), lvl = dataLevel(w), e = staffOf(w, 'engineer'); if (!P || !lvl) return;
  for (const k of PART_KEYS) {
    for (const f of P[k].fits) {
      if (f.measured && f.measured.lvl >= lvl) continue;
      const [stat, v] = Object.entries(f.gains)[0] || []; if (!stat) continue;
      f.measured = { stat, val: +(v * (1 + gauss(w) * (lvl === 2 ? 0.12 : 0.45))).toFixed(4), lvl, by: e.first };
    }
  }
}

// ---------------- staff and payroll ----------------
// Three jobs. Each person has a skill (1-5), a wage per round and a morale (0-100). Payroll runs as a round starts,
// by your standing instructions per person: pay on time, pay half, hold. Unpaid wages are owed; unhappy staff work
// worse and, owed money, walk out (and someone tells the press).
export const ROLES = {
  manager:  { name: 'Team manager', perk: 'Handles the logistics: cheaper travel, tire orders, deals with suppliers. The better they are, the bigger the savings.' },
  mechanic: { name: 'Chief mechanic', perk: 'Works on the car: rebuilds, repairs, pit stops and your development projects. The better they are, the more of everything.' },
  engineer: { name: 'Data engineer', perk: 'Reads the data: telemetry, what your upgrades really gave, how quick the other cars are. A senior one says why.' },
};
const ROLE_WAGE = { manager: [700, 160], mechanic: [1300, 650], engineer: [1100, 550] }; // (street: base + per skill level)
const WAGE_K = { club: 0.8, street: 1, gt2: 1.6, gt: 2.6, groupc: 4, formula: 6.5 };
export const PAY_MODES = [['full', 'On time'], ['half', 'Half'], ['hold', 'Hold']];
const CV = {
  manager: ['Ran logistics for a touring circus for six years.', 'Former events coordinator, municipal parks.', 'Twenty years in freight. Knows every weighbridge in the province.'],
  mechanic: ['Fifteen years at a dealership service bay.', 'Ex-rally mechanic. Can rebuild a gearbox in a car park.', 'Built drag cars in his garage. Has opinions.', 'Former crew chief, defunct GT team. Available immediately.', 'Mechanical engineering degree. Has never held a wrench in anger.'],
  engineer: ['Graduate, applied mathematics. First job.', 'Six years in sim racing esports, data analyst.', 'Former telemetry engineer, Formula SV. Left "by mutual agreement".', 'Wrote a thesis on tire thermals nobody has read.', 'Used to work in insurance, modelling crash rates.'],
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
  if (c.danny) { w.dannyHired = true; texts(w, 'Danny', pickLine(w, [[`No way`, `Bro you're not gonna regret this`], [`TEAM MANAGER`, `I'm telling my mom`]])); }
  else { mail(w, `${c.first} ${c.last}`, `${c.first.toLowerCase()}.${c.last.toLowerCase()}@coolmail.sv`, `Re: ${ROLES[c.role].name}`, [`Thank you for the offer. I accept. I can start before the next round.`, `${c.first} ${c.last}`]);
    react(w, 'danny', `The player just hired ${c.first} ${c.last}, ${c.age}, as their ${ROLES[c.role].name.toLowerCase()}, for ${money$(wageNow(w, c))} a round. What their CV says: ${c.cv}`); }
  return true;
}
// letting someone go: what you owe them is still owed (it's paid with the next payroll)
export function fireStaff(w, id, replaced = false) {
  const x = (w.staff || []).find(s => s.id === id); if (!x) return;
  w.staff = w.staff.filter(s => s !== x);
  if (x.owed > 0) w.wageClaims = (w.wageClaims || 0) + x.owed;
  if (x.danny) { w.dannyGone = true; texts(w, 'Danny', replaced ? [`Oh`, `Ok. No that's fine, that makes sense`] : [`Wow ok`]); }
  else if (!replaced) react(w, 'danny', `The player just let ${x.first} ${x.last} go: the team's ${ROLES[x.role]?.name.toLowerCase() || 'staff member'}${x.owed ? `, still owed ${money$(x.owed)} in wages` : ''}.`);
}
// the data engineer: how much of the telemetry you can read (0 nothing, 1 the charts, 2 the notes too)
export function dataLevel(w) {
  const e = staffOf(w, 'engineer'); if (!e) return 0;
  return clamp((e.skill >= 3 ? 2 : 1) - (e.morale < 35 ? 1 : 0) + facLevel(myTeam(w), 'data'), 0, 2);
}
// what the staff do to the bills and the car
export function staffEffects(w) {
  const m = staffOf(w, 'mechanic'), mgr = staffOf(w, 'manager');
  const sulk = m && m.morale < 35;
  return { travel: mgr ? mgrTravel(mgr.skill) : 1, repair: (m ? 1 - 0.06 * m.skill : 1.1) * (sulk ? 1.15 : 1), pitTime: m ? -0.25 * m.skill + (sulk ? 1 : 0) : 0.5 };
}
// what the staff skills are worth (the same numbers the game uses)
const mgrTravel = (sk) => 1 - (0.1 + 0.04 * sk);   // (travel: 14% cheaper at one star, 30% at five)
const mgrTyre = (sk) => 1 - 0.03 * (sk - 1);       // (tyre orders: up to 12% off)
// what someone in a role does for you at a skill, said plainly, in numbers: [text]
export function staffPerks(w, role, skill) {
  const c = COSTS[w.player.series], pct = (f) => Math.round(f * 100);
  if (role === 'manager') return [
    `Travel ${pct(1 - mgrTravel(skill))}% cheaper: about ${money$(c.travel * (1 - mgrTravel(skill)))} a round`,
    skill > 1 ? `Tires ${pct(1 - mgrTyre(skill))}% cheaper: bulk deals with the supplier` : 'Tires at list price',
    'Orders the tires for every weekend (no trackside prices)'];
  if (role === 'mechanic') return [
    `Puts ${(1.5 + skill * 0.6).toFixed(1)} days a round into your projects`,
    `Rebuilds parts to about ${pct(0.68 + 0.05 * skill)}% (a shop: 80%, for half as much again)`,
    `Parts ${pct(1 - (1.2 - 0.08 * skill) / 1.25)}% less likely to fail`,
    `Crash repairs ${pct(1 - (1 - 0.06 * skill) / 1.1)}% cheaper; pit stops ${(0.5 + 0.25 * skill).toFixed(2)}s quicker`,
    `Projects ${pct(0.04 * skill)} points more likely to work`];
  return [
    skill >= 3 ? 'Telemetry with notes: where you lose time, and why' : 'Telemetry charts: where you lose time (a 3-star one says why)',
    'Measures what your upgrades and projects really gave',
    `Projects ${pct(0.02 * skill)} points more likely to work`,
    'Tells you whose car is quick on the series site'];
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
  payMate(w);
  if (w.wageClaims) { pay(w, -w.wageClaims, 'Labour board: wage claims from former staff'); w.wageClaims = 0; }
  for (const x of w.staff.slice()) {
    const wage = wageNow(w, x), soft = x.danny ? 0.5 : 1;
    const paid = x.pay === 'full' ? wage : x.pay === 'half' ? Math.round(wage / 2) : 0;
    if (paid) pay(w, -paid, `Payroll: ${x.first} ${x.last} (${ROLES[x.role].name.toLowerCase()})${paid < wage ? ', part' : ''}`);
    x.owed += wage - paid;
    x.morale = clamp(x.morale + (paid === wage ? 4 : paid ? -9 * soft : -18 * soft), 0, 100);
    if (paid < wage) { x.unpaidRounds = (x.unpaidRounds || 0) + 1; listLate(w); } else x.unpaidRounds = 0;
    // walking out: miserable and owed money (Danny stays, and lets you know)
    if (!x.danny && x.morale < 25 && x.owed > 0 && rng(w) < 0.45) {
      mail(w, `${x.first} ${x.last}`, `${x.first.toLowerCase()}.${x.last.toLowerCase()}@coolmail.sv`, 'Resignation',
        [`I'm resigning, effective immediately.`, `I am owed ${money$(x.owed)}. I've been advised to take it up with the labour board, and I have.`, `${x.first}`]);
      if (x.owed >= wage * 2) news(w, `${w.teams[w.player.team].name.toUpperCase()} STAFF UNPAID, SOURCES SAY`, `A former ${ROLES[x.role].name.toLowerCase()} at the ${seriesById(w.player.series).name} newcomers says wages have gone unpaid for weeks.`);
      fireStaff(w, x.id);
    } else if (x.danny && x.unpaidRounds === 2) texts(w, 'Danny', [`Hey so the payroll thing`, `No rush`, `My landlord's just asking`]);
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
  // (never offered the usual way: the temptations, and the people in the story)
  ['Volt Rush Energy', null, 999, 4500, 9, ['seen'], 0x9ae01a], ['Cloud Nine Vapor', null, 999, 4500, 9, ['seen'], 0x8a5ae0], ['QuickCash Loans', null, 999, 4500, 9, ['seen'], 0x1fa040],
  ["Lucky Lou's Online Casino", null, 999, 4500, 9, ['seen'], 0xe0b020], ["Brian's Bathrooms & Kitchens", null, 999, 1300, 4, ['finish', 'clean'], 0x2a6ab8],
];
const SPONSOR_K = { club: 1.2, street: 2, gt2: 2.5, gt: 3, groupc: 5, formula: 9 }; // (Street: enough that a mid-field team about breaks even, so seasons stuck there cost time, not the career)
const ASSOC_K = 0.45;
export const SPONSOR_SLOTS = ['title', 'assoc', 'assoc'];
export const sponsorName = (id) => sponsorById(id)?.name || '';
export const sponsorInfo = (id) => sponsorById(id);
export const repOf = (w) => (w.rep ??= 15);
export const dealsOf = (w) => (w.deals ??= []);
// how many targets a sponsor lets you miss (the deal's own, from the setup wizard, or the sponsor's)
export const patienceOf = (d) => d.patience ?? sponsorById(d.sid)?.patience ?? 9;
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
  return o.type === 'seen' ? 'Be seen' : o.type === 'top' ? `Finish in the top ${o.n}` : o.type === 'finish' ? 'Finish the race' : o.type === 'clean' ? 'Finish without causing contact'
    : o.type === 'gain' ? `Gain ${o.n} places from your grid slot` : o.type === 'lead' ? 'Lead a lap' : `Beat both ${w.teams[o.tid]?.name || 'rival'} cars`;
}
// did you do it? r: { pos, dnf, grid, led, blamed }
function objMet(w, o, r, rows) {
  if (!r) return false;
  if (o.type === 'seen') return true;
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
      const ours = d.slot === 'title' ? 'name' : 'logo';
      items.push([`${sp.name}: ${ours} not on the car, not paid`, 0]);
      d.misses++; d.hidden = (d.hidden || 0) + 1; w.rep = clamp(repOf(w) - 2, 0, 100);
      if (d.hidden >= 2) { w.deals = deals.filter(x => x !== d); w.rep = clamp(repOf(w) - 4, 0, 100); mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`Our ${ours} still isn't on your car. We're paying for exposure we aren't getting, so we're ending the sponsorship.`, sp.name]); }
      else mail(w, sp.name, sponsorAddr(sp.name), `Where is our ${ours}?`, [`We watched the race and couldn't find our ${ours} on the car. We don't pay for a round we weren't seen in.`, `Please have it on the car by the next round.`, sp.name]);
      d.obj = null; continue;
    }
    // (the shady ones: no targets, paid a round late, and one day they're gone)
    if (d.shady) {
      if (d.owed) items.push([`${sp.name} (last round's invoice)`, d.owed]);
      d.owed = d.fee; d.obj = null;
      if (rng(w) < 0.1) { w.deals = dealsOf(w).filter(x => x !== d); news(w, `${sp.name.toUpperCase()} COLLAPSES`, `${sp.name} has gone into administration owing money to suppliers, including a ${seriesById(w.player.series).name} team.`); items.push([`${sp.name}: in administration (this round's ${money$(d.owed)} unpaid)`, 0]); flag(w, 'shadyCollapse'); }
      continue;
    }
    const af = ambFee(w); // (more for a bold season target, a little less for a timid one)
    items.push([`${sp.name} (${d.slot === 'title' ? 'title sponsor' : 'associate'}${af > 1 ? `, +${Math.round((af - 1) * 100)}% for your ambition` : af < 1 ? `, \u2212${Math.round((1 - af) * 100)}% for a modest target` : ''})`, Math.round(d.fee * af / 10) * 10]);
    if (met) { items.push([`${sp.name} bonus: ${objText(w, o).toLowerCase()}`, d.bonus]); d.met++; w.rep = clamp(repOf(w) + 1, 0, 100); }
    else {
      d.misses++; w.rep = clamp(repOf(w) - 1, 0, 100);
      if (d.misses >= patienceOf(d) + 1) {
        w.deals = deals.filter(x => x !== d);
        mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`We've reviewed our sponsorship of ${w.teams[w.player.team].name} and decided to end it, effective immediately.`, `We wish you the best for the rest of the season.`, sp.name]);
        w.rep = clamp(repOf(w) - 4, 0, 100);
      } else if (d.misses === patienceOf(d)) mail(w, sp.name, sponsorAddr(sp.name), 'A word about results', [`We were hoping for more by now. ${d.met} of ${d.met + d.misses} targets met so far.`, `Before we decide anything, could you send us your exposure figures for the season: TV audience, attendance, social media?`, sp.name],
        { inflate: d.sid, choices: [['real', 'Send the real figures'], ['inflate', 'Round the figures up']] });
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
  if (stainOf(w)) return; // (nobody respectable signs with a team in the news for the wrong reasons)
  const cands = SPONSOR_POOL.map((x, i) => sponsorById('sp' + i)).filter(sp => !have.has(sp.id) && sp.rep <= repOf(w) && (sp.town ? sp.town === w.home && S.local : true));
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
  if (rng(w) < 0.5) react(w, 'danny', `${sp.name} just agreed to sponsor the player's team${slot === 'title' ? ' as title sponsor, so their name goes on the car' : ''}, for ${money$(deals.at(-1).fee)} a round.`);
  mail(w, sp.name, sponsorAddr(sp.name), 'Welcome aboard', [`Delighted to be working with you. ${slot === 'title' ? 'Our name will be on the car from the next round.' : 'Our logo will be on the car from the next round.'}`, `Our target for each race will be in your team's sponsor page before the weekend.`, sp.name]);
  return slot;
}

// ---------------- news (headlines) and texts (the phone) ----------------
function news(w, head, body = '', extra = {}) { if (w.pre && w.year < START_YEAR - 2) return; w.news.unshift({ y: w.year, r: w.round, when: whenOf(w), head, body, ...extra }); if (w.news.length > 200) w.news.length = 200; }
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
// a few texts in a row, the way people send them: the first line first (the inbox is newest first, so the last line
// ends up on top, and the phone's conversation reads them top to bottom)
export function texts(w, from, lines, extra = {}) { for (const l of lines) text(w, from, l, extra); }
export const unread = (w) => w.msgs.filter(m => !m.read).length;
export const unreadChats = (w) => new Set(w.msgs.filter(m => !m.read).map(m => m.from)).size;
// ---------------- reactions: someone writes to you about something you just did ----------------
// Only with character voices on (js/voice.js + ChatGPT): the game decides who reacts and gives them the facts; the
// words are theirs. who: danny / mate / rival / ex. facts: plain sentences about what happened (the only facts they
// may use). Without voices, these are never written and nothing else changes.
export function react(w, who, facts) {
  if (w.pre || !facts) return;
  const r = (w.reacts ??= []);
  const from = who === 'danny' ? 'Danny' : who === 'mate' ? (w.people[teammateOf(w)]?.first || '') : who === 'ex' ? (w.backstory?.ex || '') : who === 'rival' && w.rival ? w.rival.name.join(' ') : '';
  if (!from) return;
  const mate = who === 'mate' ? w.people[teammateOf(w)] : null;
  r.push({ id: 'r' + (w.nextId++), who, from, facts, y: w.year, r: w.round, done: false,
    traits: mate ? (mate.traits || []).map(t => TRAITS[t]?.desc).filter(Boolean).join(' ') : '',
    addr: who === 'rival' && w.rival ? `${w.rival.name[0][0].toLowerCase()}.${w.rival.name[1].toLowerCase().replace(/[^a-z]/g, '')}@${w.teams[w.rival.tid].name.toLowerCase().replace(/[^a-z]+/g, '')}.sv` : '' });
  // (only the latest few for each person: a backlog nobody would send)
  const mine = r.filter(x => !x.done && x.who === who); if (mine.length > 2) mine[0].done = true;
  if (r.length > 30) r.splice(0, r.length - 30);
}
// a race, in facts: where you finished and started, your teammate, who you hit or who hit you, the points
function raceFacts(w, me, use, log) {
  const sid = w.player.series, res = w.series[sid].results.at(-1), mateId = teammateOf(w), mate = w.people[mateId], mr = res.rows.find(r => r.pid === mateId);
  const st = standings(w, sid), cp = st.findIndex(e => e.pid === 'P') + 1, f = [];
  f.push(`Round ${res.round + 1} of the ${seriesById(sid).name} at ${res.track}${res.weather === 'rain' ? ', in the rain' : ''}. The player ${me.dnf ? (me.dsq ? 'was disqualified' : 'did not finish') : `finished ${ordinalOf(me.pos)} of ${res.rows.length}`}${use && use.grid ? ` after starting ${ordinalOf(use.grid)}` : ''}.`);
  if (use && use.failed) f.push(`The car's ${PARTS[use.failed]?.name.toLowerCase() || 'something'} failed during the race.`);
  if (mate && mr) f.push(`Their teammate ${mate.first} ${mate.last} ${mr.dnf ? 'did not finish' : `finished ${ordinalOf(mr.pos)}`}.`);
  for (const e of log.filter(e => e.type === 'contact' && (e.a === 'P' || e.b === 'P')).slice(0, 2)) { const o = w.people[e.a === 'P' ? e.b : e.a]; if (o) f.push(e.a === 'P' && e.blame ? `The player hit ${o.first} ${o.last}, and it was the player's fault.` : e.blame ? `${o.first} ${o.last} hit the player.` : `The player and ${o.first} ${o.last} touched.`); }
  const win = res.rows.find(r => r.pos === 1 && !r.dnf); if (win && win.pid !== 'P' && w.people[win.pid]) f.push(`${w.people[win.pid].first} ${w.people[win.pid].last} won.`);
  if (cp) f.push(`The player is now ${ordinalOf(cp)} in the championship.`);
  return f.join(' ');
}
const ordinalOf = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const teammateOf = (w) => w.teams[w.player.team].drivers.find(d => d !== 'P');
const ord = (p) => p + (['th', 'st', 'nd', 'rd'][(p % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][p % 100] || 'th');
const pickLine = (w, a) => a[Math.floor(rng(w) * a.length)];

function seasonOpenNews(w, moves = [], founding = false) {
  if (w.pre) return;
  const s = seriesById(w.player.series), S = w.series[s.id], mate = w.people[teammateOf(w)];
  const prev = w.prev && !w.player.starts && w.teams[w.prev] ? `Your entry was previously held by ${w.teams[w.prev].name}. Their pit garage has been reassigned to you, along with any items left in it.` : '';
  mail(w, `${s.name} Office`, addrOf(s, 'office'), `Welcome to the ${w.year} season`,
    [`Welcome to the ${w.year} ${s.name}.`, `${w.opts.len} rounds, ${S.teams.length * 2} drivers, ${S.teams.length} teams. The full calendar is on our website.`, ...(prev ? [prev] : []), `Round 1: ${S.cal[0].name}, ${S.cal[0].time}${S.cal[0].weather === 'clear' ? '' : ', ' + S.cal[0].weather}.`, `Good luck,`, `${s.name} Office`]);
  if (mate && !(w.setup && !w.setup.done && setupKind(w) === 'season')) mateHello(w, moves, founding); // (a season setup picks the seat: its hello comes after, seasonApply)
  let told = 0;
  for (const m of moves) {
    const p = w.people[m.pid];
    if (told >= 4 && m.kind !== 'you-up') continue;
    if (m.kind === 'up' && seriesUp(m.to).length) continue; // (only a step up into a top series is news)
    told++;
    if (m.kind === 'retire' && p && (p.titles || p.wins >= 3)) news(w, `${p.last.toUpperCase()} HANGS UP THE HELMET`, `${nameOf(p)} retires at ${ageOf(w, p)} with ${p.wins} win${p.wins === 1 ? '' : 's'}${p.titles ? ` and ${p.titles} title${p.titles === 1 ? '' : 's'}` : ''}.`);
    else if (m.kind === 'up' && p) news(w, `${p.last.toUpperCase()} STEPS UP TO ${seriesById(m.to).name.toUpperCase()}`, `${nameOf(p)} joins ${w.teams[m.team].name}.`);
    else if (m.kind === 'rookie' && p && m.to !== START_SERIES) news(w, `ROOKIE ${p.last.toUpperCase()} SIGNS FOR ${w.teams[m.team].name.toUpperCase()}`, `${nameOf(p)}, ${ageOf(w, p)}, gets a ${seriesById(m.to).name} seat.`);
    else if (m.kind === 'you-up') news(w, `${w.teams[w.player.team].name.toUpperCase()} MOVES UP`, `${w.player.name}'s team joins the ${seriesById(m.to).name} for ${w.year}.`);
  }
  news(w, `${w.year} SEASON PREVIEW`, `${s.name}: ${S.teams.map(t => w.teams[t].name).slice(0, 3).join(', ')} and more. Round 1 at ${S.cal[0].name}.`);
}
// your teammate's first text of the season (new to the team, or another year together)
function mateHello(w, moves = [], founding = false) {
  const mate = w.people[teammateOf(w)]; if (!mate) return;
  {
    const fresh = founding || !w.seasons.length || moves.some(m => m.pid === mate.id);
    text(w, mate.first, fresh ? pickLine(w, [`${mate.first} here. Looks like we're sharing a garage this year. Don't put me in the wall.`, `Hey, it's ${mate.first}. New season, new teammate. Let's make the others look slow.`, `${mate.first} ${mate.last}. I hear you're quick. We'll see.`])
      : pickLine(w, [`Another year in the same garage. I've been training all winter. Watch out.`, `Back at it. This is our year, I can feel it.`]));
  }
}

// the Paddock Wire's articles (js/wpress.js) get these to work with
const PRESS_KIT = { SERIES, seriesById, nextUp, standings: (w, sid) => standings(w, sid), teamStandings: (w, sid) => teamStandings(w, sid), teamOfPid: (w, pid) => teamOfPid(w, pid),
  ageOf: (w, p) => ageOf(w, p), DIRTY, news: (w, h, b, x) => news(w, h, b, x), pick: (w, a) => pickLine(w, a), rng: (w) => rng(w) };
// ---------------- storylines: the sim's own stories, sifted out of what happened ----------------
// After each round, a few patterns are looked for in the results and the incident ledger (a rival who keeps finishing
// just ahead, the driver who put you out and the race you got them back, your teammate's run, a streak, the driver you
// passed on winning elsewhere). Each story is one storyline with its own dated timeline: new chapters go on the end of
// it, and its one Wire article is updated (and moved back to the top when the chapter's a big one), so there's never
// more than one place to read it. At most one text a round comes from them (someone in the story).
// w.stories: [{ id, key, kind, pid, head, beats: [{ y, r, track, t }], open, last, heat }]
const storiesOf = (w) => (w.stories ??= []);
const storyOpen = (w, key) => storiesOf(w).find(x => x.key === key && x.open);
const lastName = (w, pid) => pid === 'P' ? w.player.name.split(' ').pop() : w.people[pid]?.last || '';
// the drivers you said no to (setup, season setup): one of them winning elsewhere is a story
function passedOn(w, pids, how) { for (const pid of pids) if (pid && w.people[pid]) (w.passedOn ??= []).push({ pid, y: w.year, how }); if (w.passedOn && w.passedOn.length > 24) w.passedOn.splice(0, w.passedOn.length - 24); }
// a chapter: on the end of the storyline (opening it if it's new); big ones put its article back on top
function storyBeat(w, key, o, t, heat = 1) {
  const res = w.series[o.sid || w.player.series].results.at(-1), beat = { y: w.year, r: res ? res.round : w.round, track: res ? res.track : '', t };
  let x = storyOpen(w, key);
  if (!x) { x = { id: 'st' + (w.nextId++), key, kind: o.kind, pid: o.pid || null, pid2: o.pid2 || null, paddock: !!o.paddock, series: o.sid || w.player.series, head: o.head, beats: [], open: true, heat: 0 }; storiesOf(w).push(x); if (o.first) x.beats.push(o.first); heat += 2; }
  x.beats.push(beat); x.last = nowIdx(w); x.heat = heat;
  if (o.lead) x.lead = o.lead;
  if (o.close) x.open = false;
  if (o.keep) keepClip(w, 'story', x.head);
  (w._told ??= []).push({ x, heat, text: o.text || null, from: o.from || null });
  return x;
}
// the Wire's one article for a storyline: the latest chapter on top, the story so far underneath
function storyArticle(w, x, bump) {
  const at = w.news.findIndex(n => n.story === x.id);
  const last = x.beats.at(-1), n = at >= 0 ? w.news[at] : { kind: 'story', story: x.id };
  Object.assign(n, { head: x.head, body: [x.lead || last.t], timeline: x.beats.map(b => ({ when: b.track ? `R${b.r + 1} ${b.y} · ${b.track}` : `${b.y}`, t: b.t })), y: w.year, r: w.round, when: whenOf(w), updated: x.beats.length > 1, closed: !x.open });
  if (at >= 0 && bump) w.news.splice(at, 1);
  if (at < 0 || bump) w.news.unshift(n);
  // (a big chapter: ChatGPT can write it up, if it's on)
  if (bump && !w.pre) { const q = (w.storyVoice ??= []).filter(id => id !== x.id); q.push(x.id); w.storyVoice = q.slice(-3); }
}
// what the Wire may say about a storyline: who's in it, and every dated chapter (nothing else)
export function storyFacts(w, id) {
  const x = storiesOf(w).find(s => s.id === id); if (!x) return null;
  const who = [x.pid, x.pid2].filter(Boolean).map(pid => { const p = w.people[pid]; return p ? `${nameOf(p)}, ${ageOf(w, p)}, drives for ${w.teams[p.team]?.name || 'no team'}${p.wins ? ` (${p.wins} career wins)` : ''}.` : ''; }).join(' ');
  const mates = x.pid && x.pid2 && w.people[x.pid]?.team && w.people[x.pid].team === w.people[x.pid2]?.team ? ' They are teammates.' : '';
  return `The story: ${x.head}. ${x.paddock ? '' : `The player is ${w.player.name}, owner and driver of ${myTeam(w).name}. `}${who}${mates}\nWhat has happened, in order:\n${x.beats.map(b => `- ${b.track ? `Round ${b.r + 1} of ${b.y}, ${b.track}` : b.y}: ${b.t}`).join('\n')}\nThe latest: ${x.lead || x.beats.at(-1).t}`;
}
// the written-up opening goes on the article (the template's back if the next chapter comes before ChatGPT does)
export function voiceStory(w, id, lead) { const x = storiesOf(w).find(s => s.id === id); if (!x || !lead) return; x.lead = lead; storyArticle(w, x, false); }
// the patterns, after each round (me: your row this round)
function siftRound(w, me) {
  if (w.pre || !me) return;
  w._told = [];
  const sid = w.player.series, S = w.series[sid], res = S.results.at(-1), rows = res.rows, row = (pid) => rows.find(r => r.pid === pid);
  const pos = (r) => r && !r.dnf ? r.pos : 99, mineAt = (r, pid) => { const a = r.rows.find(x => x.pid === 'P'), b = r.rows.find(x => x.pid === pid); return a && b ? [pos(a), pos(b)] : null; };
  const recent = S.results.slice(-4);
  // 1. a rival who keeps finishing just ahead of you (3 of the last 4)
  // (one rival at a time, never your own teammate: that's its own story)
  let nemOpen = storiesOf(w).find(x => x.open && x.kind === 'nemesis');
  for (const r of rows) {
    if (r.pid === 'P' || !w.people[r.pid] || r.pid === teammateOf(w)) continue;
    const key = 'nem:' + r.pid, p = w.people[r.pid], open = storyOpen(w, key);
    if (nemOpen && !open) continue;
    const just = recent.map(x => mineAt(x, r.pid)).filter(v => v && v[1] < v[0] && v[0] - v[1] <= 3 && v[0] < 99).length;
    const [a, b] = [pos(me), pos(r)];
    if (!open && just >= 3 && b < a) nemOpen = storyBeat(w, key, { kind: 'nemesis', pid: r.pid, head: `The ${p.last} problem`, lead: `For the third time in four races, ${nameOf(p)} has finished just ahead of ${w.player.name}.`, text: p.aggr > 55 || grudgeOf(w, r.pid) ? pickLine(w, [`P${b}. Again. Getting used to the view?`, `Same result as last time. And the time before.`]) : null, from: p.first }, `${p.last} P${b}, you P${a < 99 ? a : 'DNF'}: ahead of you for the third time in four races`, 4);
    else if (open && b < a && a - b <= 3) { open.far = 0; storyBeat(w, key, {}, `${p.last} ahead again: P${b} to your ${a < 99 ? 'P' + a : 'DNF'}`, 1); }
    else if (open && b < a) { open.far = (open.far || 0) + 1; if (open.far >= 2) open.open = false; } // (they've moved on up the field: it's not a fight any more)
    else if (open && a < b) { const beaten = (open.beatThem || 0) + 1; open.beatThem = beaten; storyBeat(w, key, { close: beaten >= 2, keep: beaten >= 2, lead: beaten >= 2 ? `${w.player.name} has now finished ahead of ${nameOf(p)} twice running. Problem solved, for now.` : `${w.player.name} finally finished ahead of ${nameOf(p)}.`, text: beaten === 1 ? pickLine(w, [`Fine. Enjoy it.`, `One race. Don't frame it.`]) : null, from: p.first }, beaten >= 2 ? `Ahead of ${p.last} again (P${a} to ${b < 99 ? 'P' + b : 'DNF'}): twice running` : `You beat ${p.last} at last: P${a} to ${b < 99 ? 'P' + b : 'DNF'}`, beaten >= 2 ? 4 : 5); }
  }
  // 2. the driver who put you out, and getting them back (they hit you, blamed, this round: it opens)
  const hit = w.ledger.filter(e => e.y === w.year && e.r === res.round && e.s === sid && e.b === 'P' && (e.type === 'contact' && e.blame || DIRTY[e.type]));
  for (const e of hit.slice(0, 1)) { const p = w.people[e.a]; if (!p) continue;
    const did = { forcedoff: 'forced you off', bumprun: 'punted you off', braketest: 'brake-tested you' }[e.type] || (me.dnf ? 'put you out' : 'hit you');
    const x0 = storyBeat(w, 'rev:' + e.a, { kind: 'revenge', pid: e.a, head: `${p.last} and the ${res.track} incident`, lead: `${nameOf(p)} ${did.replace('you', w.player.name)} at ${res.track}. The stewards ${e.blame ? 'saw it' : 'missed it'}.` }, `${p.last} ${did}`, me.dnf ? 4 : 2); x0.did = x0.did || did; }
  for (const x of storiesOf(w).filter(x => x.open && x.kind === 'revenge' && x.beats.at(-1).r !== res.round || x.open && x.kind === 'revenge' && x.beats.at(-1).y !== w.year)) {
    const r = row(x.pid); if (!r) { if (nowIdx(w) - x.last > 12) x.open = false; continue; }
    const p = w.people[x.pid];
    if (pos(me) < pos(r)) storyBeat(w, x.key, { close: true, keep: true, lead: `${w.player.name} finished ahead of ${nameOf(p)} at ${res.track}, the first race since ${p.last} ${(x.did || 'hit you').replace('you', 'them')} at ${x.beats[0].track}.`, text: pickLine(w, [`Alright. We're even.`, `Fair enough. Call it square.`, `Saw that. Fine.`]), from: p.first }, `Payback: you P${pos(me)}, ${p.last} ${pos(r) < 99 ? 'P' + pos(r) : 'DNF'}`, 5);
    else if (nowIdx(w) - x.last > 12) x.open = false;
  }
  // 3. your teammate's run (ahead of you three races in a row), and getting back on top
  { const mid = teammateOf(w), p = w.people[mid], mr = row(mid);
    for (const x of storiesOf(w)) if (x.open && x.kind === 'mate' && x.pid !== mid) x.open = false; // (they've left the team)
    if (p && mr) { const key = 'mate:' + mid, open = storyOpen(w, key), run = recent.slice(-3).map(x => mineAt(x, mid)).filter(v => v && v[1] < v[0]).length;
      if (!open && run >= 3 && recent.length >= 3) storyBeat(w, key, { kind: 'mate', pid: mid, head: `Who's number one at ${myTeam(w).name}?`, lead: `${nameOf(p)} has finished ahead of team owner ${w.player.name} three races running.`, text: pickLine(w, [`Three in a row. Just saying.`, `Should I ask for the number one car?`]), from: p.first }, `${p.last} ahead of you for the third race running`, 4);
      else if (open && pos(mr) < pos(me)) storyBeat(w, key, {}, `${p.last} ahead again: P${pos(mr)} to your ${pos(me) < 99 ? 'P' + pos(me) : 'DNF'}`, 1);
      else if (open && pos(me) < pos(mr)) storyBeat(w, key, { close: true, lead: `${w.player.name} is back ahead of ${nameOf(p)}. For now.`, text: pickLine(w, [`Alright boss. Normal service.`, `Good one. Don't get comfortable.`]), from: p.first }, `Back ahead of ${p.last}: P${pos(me)}`, 3); } }
  // 3b. car two left behind: the new bits all going on yours, and your teammate wary of you for it
  { const mid = teammateOf(w), p = w.people[mid], lean = carLean(w), key = 'two:' + mid, open = storyOpen(w, key);
    for (const x of storiesOf(w)) if (x.open && x.kind === 'two' && x.pid !== mid) x.open = false;
    if (p && !open && lean >= 3 && trustOf(w) < 45) { const x = storyBeat(w, key, { kind: 'two', pid: mid, head: `Number two at ${myTeam(w).name}?`, lead: `${nameOf(p)}'s car is ${lean} upgrades behind team owner ${w.player.name}'s. Asked about it, ${p.last} said "no comment" twice, then once more to be sure.` }, `Car two ${lean} upgrades behind yours`, 4); x.lean = lean; w.rep = clamp(repOf(w) - 1, 0, 100); }
    else if (p && open && lean > (open.lean || 0)) { open.lean = lean; storyBeat(w, key, { lead: `Another upgrade for ${w.player.name}'s car, none for ${nameOf(p)}'s. Car two is now ${lean} behind.` }, `Another one for car one: ${lean} behind`, 2); }
    else if (p && open && lean <= 1) storyBeat(w, key, { close: true, lead: `${nameOf(p)}'s car has caught up with ${w.player.name}'s. "Took a while," says ${p.last}.` }, `Car two caught up`, 2); }
  // 4. a run of bad luck (DNFs), or of podiums
  { const mine = S.results.slice(-3).map(x => x.rows.find(y => y.pid === 'P')).filter(Boolean), open = storyOpen(w, 'dnf'), podOpen = storyOpen(w, 'pods');
    if (me.dnf && (open || mine.slice(-2).filter(m => m.dnf).length >= 2)) storyBeat(w, 'dnf', { kind: 'streak', head: `${myTeam(w).name}'s bad run`, lead: `${w.player.name} has failed to finish ${open ? open.beats.length + 1 : 2} races in a row.`, first: open ? null : { y: w.year, r: res.round - 1, track: S.results.at(-2)?.track || '', t: 'Did not finish' } }, `Did not finish, again`, open ? 2 : 3);
    else if (!me.dnf && open) storyBeat(w, 'dnf', { close: true, lead: `${w.player.name} finally saw the flag at ${res.track}: P${me.pos}.` }, `Finished at last: P${me.pos}`, 3);
    const pods = mine.filter(m => !m.dnf && m.pos <= 3).length;
    if (pods >= 3 && mine.length >= 3 && !podOpen) storyBeat(w, 'pods', { kind: 'streak', head: `${myTeam(w).name} on a roll`, lead: `Three podiums in a row for ${w.player.name}.` }, `A third podium in a row: P${me.pos}`, 4);
    else if (podOpen && !me.dnf && me.pos <= 3) storyBeat(w, 'pods', { lead: `${podOpen.beats.length + 1} podiums in a row for ${w.player.name}.` }, `Another podium: P${me.pos}`, 3);
    else if (podOpen) storyBeat(w, 'pods', { close: true, lead: `${w.player.name}'s run of podiums ends at ${podOpen.beats.length}.` }, `The run ends: ${me.dnf ? 'DNF' : 'P' + me.pos}`, 2); }
  // 5. the one that got away: someone you passed on, winning (or on the podium) anywhere
  for (const g of (w.passedOn || []).filter(g => w.year - g.y <= 2)) {
    const p = w.people[g.pid]; if (!p || p.team === w.player.team) continue;
    const s2 = SERIES.find(s => w.series[s.id].results.at(-1)?.round === w.round && w.series[s.id].results.at(-1).rows.some(r => r.pid === g.pid)); if (!s2) continue;
    const r = w.series[s2.id].results.at(-1).rows.find(x => x.pid === g.pid); if (r.dnf || r.pos > (s2.id === sid ? 3 : 1)) continue;
    const key = 'away:' + g.pid, tn = w.teams[p.team]?.name || '', was = storyOpen(w, key);
    if (was && (r.pos !== 1 || nowIdx(w) - (was.last || 0) < 3)) continue; // (after the first: wins only, now and then)
    storyBeat(w, key, { kind: 'away', pid: g.pid, head: `The one that got away`, lead: `${nameOf(p)}, passed over by ${w.player.name} for the ${g.how} in ${g.y}, ${r.pos === 1 ? 'won' : `finished P${r.pos}`} for ${tn} at ${w.series[s2.id].results.at(-1).track}.`, first: { y: g.y, r: -1, track: '', t: `You passed on ${p.last} for the ${g.how}` }, text: r.pos === 1 && rng(w) < 0.5 ? pickLine(w, [`Thanks for passing on me btw. Worked out.`, `No hard feelings. Well. Some.`]) : null, from: p.first }, `${p.last} ${r.pos === 1 ? 'won' : 'P' + r.pos}${s2.id !== sid ? ` in the ${seriesById(s2.id).name}` : ''}, for ${tn}`, r.pos === 1 ? 5 : 3);
  }
  siftPaddock(w);
  // old storylines close themselves (nothing new for a while)
  for (const x of storiesOf(w)) if (x.open && nowIdx(w) - (x.last || 0) > 16) x.open = false;
  if (storiesOf(w).length > 40) w.stories = storiesOf(w).filter(x => x.open).concat(storiesOf(w).filter(x => !x.open).slice(-30));
  // the Wire: every storyline that moved is updated; the biggest chapter of the round goes back on top
  const told = w._told.sort((a, b) => (b.heat + (b.x.paddock ? 0 : 1)) - (a.heat + (a.x.paddock ? 0 : 1))), seen = new Set();
  for (const t of told) { if (seen.has(t.x)) continue; seen.add(t.x); storyArticle(w, t.x, t === told[0] && t.heat >= 3); }
  // one text, from someone in the biggest story that has one
  const tx = told.find(t => t.text && t.from && !t.x.paddock); if (tx) { text(w, tx.from, tx.text); w._texted = tx.x.pid; }
}
// the paddock's own stories: between the other drivers, but only people you've a reason to care about (your series,
// your old teammates, the ones you passed on, the rival owner's team). Two open at most, so it stays easy to follow.
const PADDOCK_MAX = 2;
function knownPids(w) {
  const k = new Set(), sid = w.player.series;
  for (const tid of w.series[sid].teams) for (const pid of w.teams[tid].drivers) if (pid !== 'P') k.add(pid);
  for (const g of w.passedOn || []) k.add(g.pid);
  for (const pid of w.exMates || []) k.add(pid);
  if (w.rival && w.teams[w.rival.tid]) for (const pid of w.teams[w.rival.tid].drivers) k.add(pid);
  return k;
}
function siftPaddock(w) {
  const sid = w.player.series, S = w.series[sid], res = S.results.at(-1), known = knownPids(w), L = w.opts.len;
  // (a teammate who's left is someone you know)
  { const m = teammateOf(w); if (w.lastMate && w.lastMate !== m && w.people[w.lastMate]) (w.exMates ??= []).includes(w.lastMate) || w.exMates.push(w.lastMate); w.lastMate = m; }
  const room = () => storiesOf(w).filter(x => x.open && x.paddock).length < PADDOCK_MAX;
  const nm = (pid) => w.people[pid]?.last || '', posOf = (r) => r && !r.dnf ? 'P' + r.pos : 'DNF';
  // 1. a feud: two drivers who keep hitting each other (twice this season), and every time they do it again
  for (const e of w.ledger.filter(e => e.y === w.year && e.r === res.round && e.type === 'contact' && e.a !== 'P' && e.b !== 'P' && known.has(e.a) && known.has(e.b))) {
    const f = feudOf(w, e.a, e.b), key = 'feud:' + feudKey(e.a, e.b), open = storyOpen(w, key), out = (S.results.at(-1).rows.find(r => r.pid === e.b) || {}).dnf;
    const sameTeam = w.people[e.a].team === w.people[e.b].team, tn = w.teams[w.people[e.a].team]?.name || '';
    const t = `${nm(e.a)} hit ${nm(e.b)}${out ? `, and ${nm(e.b)} was out` : ''}`;
    if (open) storyBeat(w, key, { lead: `${nameOf(w.people[e.a])} and ${nameOf(w.people[e.b])} have now collided ${f.n} times this season.` }, t, 3);
    // (or once, when they've been fighting over the same places all season: finished side by side twice)
    const close = S.results.filter(x => { const ra = x.rows.find(y => y.pid === e.a), rb = x.rows.find(y => y.pid === e.b); return ra && rb && !ra.dnf && !rb.dnf && Math.abs(ra.pos - rb.pos) === 1; }).length;
    if (!open && (f.n >= 2 || f.grudge >= 1.2 || close >= 2) && room()) storyBeat(w, key, { kind: sameTeam ? 'teamwar' : 'feud', paddock: true, pid: e.a, pid2: e.b, head: sameTeam ? `Trouble at ${tn}` : `${nm(e.a)} vs ${nm(e.b)}`,
      lead: sameTeam ? `${tn}'s drivers have collided ${f.n >= 2 ? f.n + ' times this season' : 'again'}. The team insists everything is fine, which is what teams say.` : f.n < 2 && close >= 2 ? `${nameOf(w.people[e.a])} ${out ? 'took out' : 'hit'} ${nameOf(w.people[e.b])} at ${res.track}, after a season of fighting over the same places. ${w.people[e.b].first} is not calling it an accident.` : f.n >= 2 ? `${nameOf(w.people[e.a])} and ${nameOf(w.people[e.b])} have collided for the ${f.n === 2 ? 'second' : f.n === 3 ? 'third' : f.n + 'th'} time this season. Neither is blaming themselves.` : `${nameOf(w.people[e.a])} and ${nameOf(w.people[e.b])} have collided again. Last season's business, it seems, is not finished.`,
      first: f.first || null }, t, 4);
    if (!f.first) f.first = { y: w.year, r: res.round, track: res.track, t };
  }
  // 2. the title fight: halfway through, the top two (not you: that's yours) within a race win of each other
  { const st = standings(w, sid), a = st[0], b = st[1], key = `title:${sid}:${w.year}`, open = storyOpen(w, key);
    if (a && b && a.pid !== 'P' && b.pid !== 'P') {
      const gap = a.pts - b.pts, lastLead = open && open.leader;
      if (!open && res.round + 1 >= Math.ceil(L / 2) && res.round + 1 < L && gap <= POINTS[0] && room()) { const x = storyBeat(w, key, { kind: 'title', paddock: true, pid: a.pid, pid2: b.pid, head: `${seriesById(sid).name}: ${nm(a.pid)} vs ${nm(b.pid)}`, lead: `${nameOf(w.people[a.pid])} leads ${nameOf(w.people[b.pid])} by ${gap} point${gap === 1 ? '' : 's'} with ${L - res.round - 1} round${L - res.round - 1 === 1 ? '' : 's'} to go.` }, `${nm(a.pid)} leads ${nm(b.pid)} by ${gap}`, 3); x.leader = a.pid; }
      else if (open && res.round + 1 < L && gap > (L - res.round - 1) * (POINTS[0] + 1)) storyBeat(w, key, { close: true, lead: `${nameOf(w.people[a.pid])} can't be caught now: ${gap} points clear with ${L - res.round - 1} to go.` }, `${nm(a.pid)} wraps it up, ${gap} clear`, 3);
      else if (open && res.round + 1 < L) { const t = lastLead !== a.pid ? `${nm(a.pid)} takes the lead, by ${gap}` : `${nm(a.pid)} leads by ${gap}`; storyBeat(w, key, { lead: `${nameOf(w.people[a.pid])} leads by ${gap} with ${L - res.round - 1} to go.` }, t, lastLead !== a.pid ? 4 : 1); open.leader = a.pid; }
      else if (open) storyBeat(w, key, { close: true, lead: `${nameOf(w.people[a.pid])} is the ${w.year} ${seriesById(sid).name} champion, ${gap} point${gap === 1 ? '' : 's'} ahead of ${nameOf(w.people[b.pid])}.` }, `${nm(a.pid)} is champion, by ${gap}`, 4);
    } else if (open) open.open = false; } // (you're in it now: it's your story)
  // 3. a last season: the veteran in your series who'll retire at the end of it (one, the one with most wins)
  if (res.round === 0) {
    const vet = [...known].map(pid => w.people[pid]).filter(p => p && !p.retired && p.team && w.teams[p.team]?.series === sid && ageOf(w, p) + 1 >= p.retireAge).sort((a, b) => b.wins - a.wins)[0];
    if (vet && room()) storyBeat(w, 'last:' + vet.id, { kind: 'last', paddock: true, pid: vet.id, head: `${vet.last}'s last season`, lead: `${nameOf(vet)}, ${ageOf(w, vet)}, starts what is expected to be a final season. ${vet.wins ? `${vet.wins} win${vet.wins === 1 ? '' : 's'} so far.` : 'Still looking for a first win.'}` }, `The last season begins: ${posOf(res.rows.find(r => r.pid === vet.id))}`, 2);
  }
  for (const x of storiesOf(w).filter(x => x.open && x.kind === 'last')) {
    const r = res.rows.find(r => r.pid === x.pid), p = w.people[x.pid]; if (!r || !p) continue;
    if (res.round + 1 >= L) storyBeat(w, x.key, { close: true, lead: `${nameOf(p)} has driven a last race, at ${res.track}: ${posOf(r)}.` }, `The last race: ${posOf(r)}`, 3);
    else if (!r.dnf && r.pos <= 3) storyBeat(w, x.key, { lead: r.pos === 1 ? `${nameOf(p)} has won at ${res.track}, in a final season.` : `A podium for ${nameOf(p)} at ${res.track}.` }, r.pos === 1 ? 'Wins, in the last season' : `On the podium: P${r.pos}`, r.pos === 1 ? 4 : 2);
  }
  // 4. a rookie on the rise: someone 21 or under, on the podium, anywhere you'd hear of them (one at a time)
  for (const s2 of SERIES) {
    const r2 = w.series[s2.id].results.at(-1); if (!r2 || r2.round !== res.round) continue;
    for (const r of r2.rows.filter(r => r.pid !== 'P' && !r.dnf && r.pos <= 3 && known.has(r.pid))) {
      const p = w.people[r.pid]; if (!p || ageOf(w, p) > 21) continue;
      const key = 'rook:' + p.id, open = storyOpen(w, key), any = storiesOf(w).some(x => x.open && x.kind === 'rookie');
      if (open) { if (r.pos === 1 || nowIdx(w) - (open.last || 0) >= 3) storyBeat(w, key, { sid: s2.id, lead: `${nameOf(p)}, ${ageOf(w, p)}, ${r.pos === 1 ? 'has won' : 'is on the podium again'} at ${r2.track}${s2.id !== sid ? ` in the ${s2.name}` : ''}.` }, r.pos === 1 ? `Wins at ${r2.track}` : `P${r.pos} at ${r2.track}`, r.pos === 1 ? 3 : 1); }
      else if (!any && room()) storyBeat(w, key, { kind: 'rookie', paddock: true, sid: s2.id, pid: p.id, head: `The rise of ${nameOf(p)}`, lead: `${nameOf(p)} is ${ageOf(w, p)} and ${r.pos === 1 ? 'has just won' : 'has just finished on the podium'} in the ${s2.name}, for ${w.teams[p.team]?.name || 'a team you could fit in a phone box'}.` }, r.pos === 1 ? `Wins at ${r2.track}, aged ${ageOf(w, p)}` : `P${r.pos} at ${r2.track}, aged ${ageOf(w, p)}`, 3);
    }
  }
}
// a new season: the paddock's stories that cross it (a rookie moving up a series)
function paddockSeason(w) {
  for (const x of storiesOf(w).filter(x => x.open && x.kind === 'rookie')) {
    const p = w.people[x.pid]; if (!p || !p.team) continue;
    const s2 = w.teams[p.team].series; if (x.series && s2 !== x.series && seriesById(s2).tier > seriesById(x.series).tier) { x.beats.push({ y: w.year, r: -1, track: '', t: `Moves up to the ${seriesById(s2).name}, with ${w.teams[p.team].name}` }); x.last = nowIdx(w); storyArticle(w, x, true); }
    x.series = s2;
  }
  for (const x of storiesOf(w).filter(x => x.open && (x.kind === 'feud' || x.kind === 'teamwar'))) x.open = false; // (a new season: the slate's clean, mostly)
}

// the hub's next race: the storyline that's live in it, in a line (or what happened here last time)
export function storyLine(w) {
  if (w.over || w.pre) return null;
  const sid = w.player.series, S = w.series[sid], next = S.cal[w.round], here = (pid) => pid && teamOfPid(w, pid) && w.teams[teamOfPid(w, pid)]?.series === sid;
  const live = storiesOf(w).filter(x => x.open && !x.paddock && (x.kind === 'streak' || here(x.pid))).sort((a, b) => b.heat - a.heat || b.last - a.last)[0];
  const tf = !live && storiesOf(w).find(x => x.open && x.kind === 'title');
  if (tf) { const st = standings(w, sid), a = st[0], b = st[1]; if (a && b) return { who: 'Title fight', text: `${lastName(w, a.pid)} leads ${lastName(w, b.pid)} by ${a.pts - b.pts}`, story: tf.id }; }
  if (live) { const p = w.people[live.pid];
    const rs = S.results.slice(-4), ahead = rs.filter(x => { const a = x.rows.find(y => y.pid === 'P'), b = x.rows.find(y => y.pid === live.pid); return a && b && !b.dnf && (a.dnf || b.pos < a.pos); }).length;
    return { who: live.kind === 'streak' ? 'Storyline' : p.last, text: { nemesis: rs.length ? `just ahead of you in ${ahead} of the last ${rs.length} races` : 'just ahead of you all last season', revenge: `${live.did || 'hit you'} at ${live.beats[0].track}`, mate: rs.length ? `your teammate, ahead of you in ${ahead} of the last ${rs.length}` : 'your teammate, and the one to beat', away: `the one you passed on`, two: `car two, ${carLean(w)} upgrades behind yours`, streak: live.beats.at(-1).t }[live.kind] || live.head, story: live.id }; }
  const been = (w.trackLog || {})[next?.name]?.at(-1);
  if (been && (been.dnf || been.pos === 1)) return { who: next.name, text: been.dnf ? `you didn't finish here in ${been.y}` : `you won here in ${been.y}` };
  return null;
}
// what you did at each circuit (for "back at the scene")
function trackRemember(w, me) { const res = w.series[w.player.series].results.at(-1); if (!me || !res) return; ((w.trackLog ??= {})[res.track] ??= []).push({ y: w.year, pos: me.pos, dnf: !!me.dnf }); }
// ---------------- the garage remembers ----------------
// Mum reads the hometown paper and cuts you out of it: the big moments (a first podium, a first win, a title, moving
// up, a storyline that ends your way) are clippings pinned beside the list. Trophies on the desk for what you've won;
// the bills pile up on it when the money's gone; and until the first season's done (or when you're broke again), the
// mattress in the corner. js/pitgarage.js puts them in the room (setMemories).
export const hometownPaper = (w) => `${(TOWNS[w.home] || TOWNS.pinewood).name} Gazette`;
const MUM_NOTES = { license: ['A real racing license!', 'Is it like a driving license? Love, Mom'], pod: ['Front page of sport!', 'I bought three copies'], win: ['WINNER!!', 'Showed the whole street'], title: ['CHAMPION! Love, Mom', 'Framed the other one'], up: ['Big leagues!', 'Mrs Patel asked for your autograph'], story: ['Is this good? Mum x', 'Saw this. Love, Mom'] };
function keepClip(w, kind, head) {
  if (w.pre) return;
  const res = w.series[w.player.series].results.at(-1), K = (w.keeps ??= []);
  K.push({ kind, head, y: w.year, r: res ? res.round : w.round, track: res ? res.track : '', paper: hometownPaper(w), note: pickLine(w, MUM_NOTES[kind] || MUM_NOTES.story) });
  // (eight on the wall at most: the titles stay, the oldest of the rest come down)
  while (K.length > 8) { const i = K.findIndex(k => k.kind !== 'title'); K.splice(i < 0 ? 0 : i, 1); }
  w._mumClip = kind;
}
// Mum, the Sunday after a race: when she's cut something out, or when it looked bad on the news (and early on, worried)
function mumSunday(w, me) {
  const k = w._mumClip; w._mumClip = null;
  if (k && w._momTexted !== nowIdx(w)) { text(w, 'Mom', pickLine(w, { pod: [`You were in the Gazette! I cut it out for you.`, `Mrs Patel showed me the Gazette. You're famous. I cut it out.`], win: [`You WON! It's in the Gazette. I've cut it out, it's going on your wall.`, `I told everyone at church. Then I cut you out of the Gazette.`], title: [`Champion! The Gazette did a whole piece. I've cut it out and I'm not giving it back. Fine, you can have it.`], up: [`The Gazette says you're moving up! Does that mean more money or less? I cut it out anyway.`], story: [`You're in the Gazette again. I don't understand it but I cut it out.`] }[k] || [`I cut you out of the Gazette.`])); return; }
  if (me && me.dnf && rng(w) < 0.4) { text(w, 'Mom', pickLine(w, [`I saw the race on the news. Are you hurt? Call me.`, `Was that your car upside down? Don't tell me. Just call.`, `They said someone crashed. Was it you? Call your mother.`])); return; }
  if (memoriesOf(w).mattress && rng(w) < 0.15) text(w, 'Mom', pickLine(w, [`Danny says you're sleeping at the garage. Are you eating?`, `There's a spare room here, you know. With a real bed.`]));
}
// what's in the room: clippings, trophies, the bills, the mattress
export function memoriesOf(w) {
  if (!w.money || !w.founding?.reg) return { clips: [], trophies: [], bills: 0, mattress: false };
  const p = w.player, titles = p.titles || 0, wins = p.wins || 0, pods = Math.max(0, (p.pods || 0) - wins);
  const trophies = [...Array(titles).fill('title'), ...Array(Math.min(wins, 5)).fill('win'), ...Array(Math.min(pods, 3)).fill('pod')].slice(0, 8);
  const bal = w.money.balance, bills = bal < 0 ? clamp(2 + Math.floor(-bal / 10000), 2, 7) : bal < 8000 ? 1 : 0;
  // (the license on its lanyard: grade, stamps toward the next, whose it is)
  const L = licOf(w), G = LICENSES[L.g];
  const lic = { g: L.g, name: G.name, col: G.col, c: L.c, need: G.need, next: LICENSES[L.g + 1]?.name || null, no: L.no, since: L.up || L.since, holder: p.name };
  return { clips: (w.keeps || []).slice(-8), trophies, bills, mattress: !(p.hist || []).length || bal < 0, lic, ladder: setupDone(w) ? ladderOf(w) : null, ...honorsOf(w) };
}
// the trophy cabinet (a premises with one: the Race Workshop): the big shelf's championship trophies (a title, or 2nd /
// 3rd in a series), the race trophies on the glass shelves (this season's by track, past seasons' by series), newest
// first; and the seasons for the photos either side
function honorsOf(w) {
  const p = w.player, H = [...(p.hist || [])].reverse(), SN = (id) => seriesById(id)?.name || id;
  const big = H.filter(h => h.pos <= 3).map(h => ({ kind: h.pos === 1 ? 'title' : 'season', pos: h.pos, line1: h.pos === 1 ? `${SN(h.s)} Champion` : `${SN(h.s)}, ${h.pos === 2 ? '2nd' : '3rd'}`, line2: String(h.y) }));
  const small = [];
  for (const sid of Object.keys(w.series || {})) for (const res of [...(w.series[sid].results || [])].reverse()) {
    const r = res.rows.find(q => q.pid === 'P'); if (r && !r.dnf && r.pos <= 3) small.push({ kind: r.pos === 1 ? 'win' : 'pod', pos: r.pos, line1: res.track, line2: `${SN(sid)} ${w.year}` });
  }
  for (const h of H) if (h.y < w.year) {   // (a past season's: how many, not where)
    for (let i = 0; i < (h.wins || 0); i++) small.push({ kind: 'win', pos: 1, line1: SN(h.s), line2: String(h.y) });
    for (let i = 0; i < Math.max(0, (h.pods || 0) - (h.wins || 0)); i++) small.push({ kind: 'pod', pos: 2 + (i % 2), line1: SN(h.s), line2: String(h.y) });
  }
  const seasons = H.slice(0, 4).map(h => ({ y: h.y, series: SN(h.s), pos: h.pos, wins: h.wins || 0, pods: h.pods || 0, team: h.team }));
  // the cars of your career, newest first, one each (the factory's Boulevard: a plinth a car): this season's, then the
  // seasons' (careers from before the seasons kept their car: just the one you have)
  const cars = [], ord = (p) => p === 1 ? 'Champions' : p ? `${p}${p === 2 ? 'nd' : p === 3 ? 'rd' : 'th'}` : '';
  if (w.car && w.car.chassis) cars.push({ chassis: w.car.chassis, name: w.car.name, years: [w.year], series: SN(w.player.series), result: 'This season' });
  for (const h of H) if (h.car) {
    const c = cars.find(x => x.chassis === h.car);
    if (c) { if (!c.years.includes(h.y)) c.years.push(h.y); continue; }
    cars.push({ chassis: h.car, name: h.carName || h.car, years: [h.y], series: SN(h.s), result: ord(h.pos) });
  }
  return { shelf: { big: big.slice(0, 4), small: small.slice(0, 12) }, seasons, cars: cars.slice(0, 8) };
}

// what the Wire calls you: the lottery winner, until you've earned something else
export function epithetOf(w) {
  const st = stainOf(w), t = w.player.titles, last = (w.player.hist || []).filter(h => h.pos === 1).at(-1);
  if (st) return 'scandal-hit team owner';
  if (t && last) return `${t > 1 ? `${t}-time ` : 'former '}${seriesById(last.s).name} champion`;
  if (w.again) return 'two-time lottery winner';
  if (repOf(w) >= 45 && w.player.wins) return 'race winner';
  if (repOf(w) >= 45) return 'team owner';
  return 'lottery winner';
}

// the bank's statement for a round, when no round report carries it (a round you sat out)
function billMail(w) {
  const B = w._bill; if (!B) return; w._bill = null;
  mail(w, BANK, BANK_ADDR, `Account activity: ${B.track}`,
    [`Here is the activity on your business account for ${B.track}.`, overdrawnLine(B.bal)], { bill: { items: B.items, net: B.net, bal: B.bal } });
}
const overdrawnLine = (bal) => bal < 0 ? `Your account is overdrawn by ${money$(-bal)}. Overdrawn balances are charged 1.5% a round plus a $250 fee. Please call your branch.` : `Your balance is ${money$(bal)}.`;
function roundNews(w, me) {
  const sid = w.player.series;
  if (!(w.pre && w.year < START_YEAR - 2)) roundPress(w, PRESS_KIT);
  // texts about your race
  if (!me) { billMail(w); return; }
  w._texted = null; trackRemember(w, me);
  if (!me.dnf && me.pos <= 3 && (w.player.pods || 0) === 1) keepClip(w, 'pod', `${w.player.name.split(' ').pop()} on the podium at ${w.series[sid].results.at(-1).track}`);
  if (!me.dnf && me.pos === 1) { const n = w.player.wins || 0; if (n <= 3) keepClip(w, 'win', n === 1 ? `Local driver wins at ${w.series[sid].results.at(-1).track}` : `${w.player.name.split(' ').pop()} wins again`); }
  siftRound(w, me); mumSunday(w, me);
  const res = w.series[sid].results.at(-1), mateId = teammateOf(w), mate = w.people[mateId];
  const mr = res.rows.find(r => r.pid === mateId);
  if (me.pos === 1 && !me.dnf && w.player.wins === 1) mail(w, 'Press Office', addrOf(seriesById(sid), 'press'), 'Interview requests',
    [`${w.player.name.split(' ')[0]},`, `Your first win! The phones haven't stopped. We've had eleven interview requests since the flag, and counting.`, `Enjoy tonight. We'll sort the rest out tomorrow.`, `Press Office, ${seriesById(sid).name}`]);
  // the round's report: the classification from the series office, and the weekend's money (one email, not the
  // office's and the bank's)
  { const s = seriesById(sid), st = standings(w, sid), cp = st.findIndex(e => e.pid === 'P') + 1, lead = st[0], B = w._bill; w._bill = null;
    mail(w, `${s.name} Office`, addrOf(s, 'results'), `Round ${res.round + 1}: ${res.track}`,
      [me.dnf ? `${w.player.name}: did not finish.` : `${w.player.name}: P${me.pos}, ${me.pts || 0} point${me.pts === 1 ? '' : 's'}.`,
       cp ? (cp === 1 ? `You lead the championship on ${lead.pts} points.` : `You are ${ord(cp)} in the championship on ${st[cp - 1].pts} points, ${lead.pts - st[cp - 1].pts} behind the leader.`) : '',
       w.round + 1 < w.opts.len ? `Next: round ${w.round + 2}, ${w.series[sid].cal[w.round + 1].name}.` : `That was the final round.`,
       ...(B ? [`The weekend's money is below. ${overdrawnLine(B.bal)}`] : [])].filter(Boolean),
      { report: { s: sid, round: res.round }, ...(B ? { bill: { items: B.items, net: B.net, bal: B.bal } } : {}) }); }
  if (mate && mr && w._texted !== mateId && rng(w) < 0.6 && roundOnce(w, mateId)) {
    const beat = !me.dnf && (mr.dnf || me.pos < mr.pos);
    text(w, mate.first, beat ? pickLine(w, [`Fair play. P${me.pos}. I'll have you next time.`, `Good race. Don't get used to finishing ahead of me.`, `Nice one today. The team's happy.`])
      : me.dnf ? pickLine(w, [`Rough day. Shake it off, next round's a fresh start.`, `Saw your car in the barrier. You OK?`])
      : pickLine(w, [`P${mr.pos} for me today. Drinks are on you.`, `Good points for the team. Even if they were mostly mine.`, `Tough one for you. Next time.`]));
  }
  // anyone who hit you (or whom you hit) gets in touch
  const hits = w.ledger.filter(e => e.y === w.year && e.r === w.round && e.type === 'contact' && e.blame && (e.a === 'P' || e.b === 'P'));
  for (const e of hits.slice(0, 2)) {
    const other = e.a === 'P' ? e.b : e.a, p = w.people[other]; if (!p || !roundOnce(w, other)) continue;
    const h = h2hOf(w, other);
    if (e.a === 'P') text(w, p.first, h.youHit > 1 ? `That's twice now. I won't forget it.` : p.aggr > 60 ? `Watch your mirrors next time. I won't forget that.` : `What happened back there? You ruined my race.`);
    else text(w, p.first, p.aggr > 60 ? `You left the door open. Not my fault.` : `Sorry about that one. Wasn't trying to take you out.`);
  }
}

function seasonEndNews(w, sum) {
  for (const s of SERIES) {
    const pid = sum.champs[s.id]; if (!pid) continue;
    if (pid === 'P') { keepClip(w, 'title', `${w.player.name.split(' ').pop()}: ${s.name} champion`); if (!w.pre) text(w, 'Mom', pickLine(w, [`CHAMPION! The Gazette did a whole page. I've cut it out.`, `My child, the champion. I cut it out of the Gazette.`])); w._mumClip = null; }
    if (pid === 'P') news(w, `${w.player.name.split(' ').pop().toUpperCase()} IS ${s.name.toUpperCase()} CHAMPION`, `${w.player.name} takes the ${w.year} title.`);
    else { const p = w.people[pid]; news(w, `${p.last.toUpperCase()} CLINCHES ${s.name.toUpperCase()} TITLE`, `${nameOf(p)} (${w.teams[p.team].name}) is the ${w.year} champion${p.titles > 1 ? ` again: title number ${p.titles}` : ''}.`); }
  }
  // the Grand Prix: the year's last race in the top series
  { const S = w.series[gpSeries().id], R = S.cal[S.cal.length - 1], res = S.results.at(-1), wn = R && R.gp && res && res.rows.find(r => r.pos === 1 && !r.dnf);
    if (wn) { const p = wn.pid === 'P' ? null : w.people[wn.pid]; news(w, `${p ? p.last.toUpperCase() : w.player.name.split(' ').pop().toUpperCase()} WINS THE ${GP_NAME.toUpperCase()}`, `${p ? nameOf(p) : w.player.name} (${w.teams[teamOfPid(w, wn.pid)]?.name || ''}) wins the ${w.year} ${GP_NAME} at ${R.name}.`); } }
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
    idx.unshift({ id: w.id, team: w.teams[w.player.team].name, name: w.player.name, year: w.year, series: w.player.series, round: w.round, len: w.opts.len, over: w.over, ended: w.ended ? w.ended.y : null, saved: Date.now() });
    localStorage.setItem(INDEX, JSON.stringify(idx));
    return true;
  } catch (e) { return false; }
}
// (careers from before the Street Cup's prize money went up by half and its sponsors' fees doubled: what they'd have
// had, back-paid. From the bank statements where they go back far enough (half again on the prize money, the sponsors'
// fees and bonuses again); past that, from where you finished that season and what the sponsors paid in the rounds we
// can see. The Street deals and offers on the table now go up too.)
function streetBackPay(w) {
  w.streetPay = true;
  if (!w.money) return;
  const S = seriesById('street'), years = new Set(w.player.hist.filter(h => h.s === 'street').map(h => h.y));
  if (w.player.series === 'street') years.add(w.year);
  const tx = w.money.tx, whole = tx.length < 200, L = w.opts.len, prize = COSTS.street.prize;
  let fromPrize = 0, fromSpon = 0, guessed = 0;
  for (const y of years) {
    const T = tx.filter(t => t.y === y), rounds = T.filter(t => /: entry fee$/.test(t.what)).length;
    const p = T.filter(t => t.amt > 0 && /: prize money( \(P|, second car)/.test(t.what)).reduce((a, t) => a + t.amt, 0);
    const s = T.filter(t => t.amt > 0 && (/ \((title sponsor|associate)/.test(t.what) || / bonus: /.test(t.what))).reduce((a, t) => a + t.amt, 0);
    fromPrize += p * 0.5; fromSpon += s;
    // (rounds older than the statements: your finish that season, for both cars, and the sponsors' average round)
    const h = w.player.hist.find(x => x.y === y && x.s === 'street'), missing = whole || !h ? 0 : Math.max(0, L - rounds);
    if (missing) guessed += missing * ((prize[h.pos - 1] || 0) * 2 / 3 + (rounds ? s / rounds : 3500));
  }
  const total = Math.round((fromPrize + fromSpon + guessed) / 10) * 10;
  if (w.player.series === 'street') {
    for (const d of dealsOf(w)) if (!d.shady) { d.fee *= 2; d.bonus *= 2; }
    for (const m of w.mail) if (m.sponsorOffer && !m.answer && !m.tempt) {
      const o = m.sponsorOffer, was = [money$(o.fee), money$(o.bonus)];
      o.fee *= 2; o.bonus *= 2;
      if (Array.isArray(m.body)) m.body = m.body.map(b => b.replace(was[0], money$(o.fee)).replace(was[1], money$(o.bonus)));
      if (m.choices) m.choices = m.choices.map(([k, t]) => [k, t.replace(was[0], money$(o.fee))]);
    }
  }
  if (total <= 0) return;
  pay(w, total, `${S.name} Office: revised prize fund and sponsor rates, back-paid`);
  mail(w, `${S.name} Office`, addrOf(S, 'office'), 'Revised prize fund (back-paid)',
    [`Following a review, the ${S.name} has raised its prize money by half, and its partners have agreed to double their rates for ${S.name} teams. The review found that the previous figures made it impossible to break even, which several teams had been pointing out, in writing, for some time.`,
     `The change is backdated to your first ${S.name} round. We have paid ${money$(total)} into your account: ${money$(Math.round(fromPrize / 10) * 10)} in prize money and ${money$(Math.round(fromSpon / 10) * 10)} from your sponsors${guessed ? `, plus ${money$(Math.round(guessed / 10) * 10)} for rounds older than your bank statements, worked out from where you finished` : ''}.`,
     ...(w.player.series === 'street' && dealsOf(w).some(d => !d.shady) ? [`Your current sponsors will pay the new rates from your next round.`] : []),
     `We appreciate your patience, and your letters.`, `${S.name} Office`]);
}
// (cars taken out of the game: the car you own, the classifieds, the cars on offer, the ballast table and the AI teams'
// cars move to the car that replaced them; the messages and the history keep the old name)
function retireCars(w) {
  const swap = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(swap);
    for (const f of ['chassis', 'key']) if (RETIRED[o[f]]) {
      const id = RETIRED[o[f]]; o[f] = id; if (typeof o.name === 'string') o.name = CARS[id].name;
      if (f === 'key' && typeof o.value === 'number') o.value = Math.round(12000 + CARS[id].spec.power * 0.11); // (the classifieds' price guide: main.js streetCarList)
    }
    for (const k of Object.keys(o)) if (RETIRED[k] && o[k] != null && typeof o[k] !== 'object') { if (!(RETIRED[k] in o)) o[RETIRED[k]] = o[k]; delete o[k]; }
    for (const v of Object.values(o)) if (v && typeof v === 'object') swap(v);
  };
  for (const k of ['car', 'prevCar', 'ads', 'streetCars', 'carCat', 'bop']) swap(w[k]);
  for (const t of Object.values(w.teams || {})) if (t && RETIRED[t.chassis]) t.chassis = RETIRED[t.chassis]; // (an AI team's model: teamChassis)
}
// (the BMW M3 GTR raced in GT1 until GT2 existed, 2026-10-13: a GT1 entry that owns one gets a GT1 car in exchange,
// the F40 LM, the nearest in pace; AI teams pick again from the class themselves, teamChassis)
function gt2Moves(w) {
  // (The List: a career already past it has 'Make the GT2 Championship' crossed off)
  if (w.list && !w.list.done.gt2 && ((w.player.hist || []).some(h => h.s === 'gt') || ['gt', 'formula'].includes(w.player.series))) w.list.done.gt2 = { y: w.year, r: w.round, old: true };
  if (!w.car || w.car.chassis !== 'm3gtr' || w.car.cls !== 'gt1') return;
  w.car.chassis = 'f40'; w.car.name = CARS.f40.name;
  mail(w, 'GT Championship Office', 'office@gtchampionship.sv', 'Your car: the M3 GTR moves to GT2',
    [`The BMW M3 GTR has been reclassified to the new GT2 class, where it was homologated in the first place. It is no longer eligible for the GT Championship.`,
     `Under the reclassification scheme your car has been exchanged, at no cost, for a ${CARS.f40.name} in the same condition and with the same parts. The M3 will be well looked after by someone else.`,
     `GT Championship Office`]);
}
export function loadWorld(id) {
  migrate();
  try {
    const w = JSON.parse(localStorage.getItem(slot(id))); if (!w || w.v !== 1) return null;
    w.mail = w.mail || [];
    for (const m of w.msgs || []) if (m.from === 'Mum') m.from = 'Mom'; // (one Mom: her two threads, together)
    addMissingSeries(w); // (a series added to the ladder since the save: its teams, drivers and calendar)
    for (const t of Object.values(w.teams)) if (t.id !== 'T0') { const c = teamColors(t); t.main = c.main; t.accent = c.accent; } // (the rival teams' colours since their liveries, teamliveries.js)
    if (w.car2 && w.car2.kind === 'hire' && w.car && seriesById(w.player.series)?.oneMake) w.car2.name = `An arrive-and-drive ${w.car.name}`; // (the club's car two: the series' rental)
    if (!w.money) startMoney(w);
    if (!w.founding) w.founding = { reg: true, car: true, legacy: true }; // (careers from before the founding: carry on as you were)
    if (!Object.values(w.series).some(S => S.cal.some(c => c.gp))) gpRound(w, null); // (careers from before the Grand Prix; one already this year in Formula SV, where it was before Group C: it stays there till the season's out)
    // (messages the old character voices reworded: back to how they were written)
    for (const m of [...(w.msgs || []), ...w.mail]) if (m.orig) { m.body = Array.isArray(m.body) ? m.orig.split(/\n\s*\n/) : m.orig; delete m.orig; delete m.voiced; }
    // (bursts of texts used to be filed last-first, so they read bottom to top: a burst is the one thing whose ids go up
    // as the inbox goes back in time, so put each of those runs back in order)
    if (!w.burstFix && w.msgs) {
      const M = w.msgs, idn = (m) => +String(m.id).slice(1);
      for (let i = 0; i < M.length;) { let j = i; while (j + 1 < M.length && M[j + 1].from === M[i].from && idn(M[j + 1]) === idn(M[j]) + 1) j++; if (j > i) M.splice(i, j - i + 1, ...M.slice(i, j + 1).reverse()); i = j + 1; }
      w.burstFix = true;
    }
    // (the brake test check used to call clean, early braking a brake test about every race: take those back, the
    // grudges and the reputation they cost with them)
    if (!w.btFix) {
      for (const e of w.ledger) if (e.type === 'braketest' && e.a === 'P') {
        const h = w.h2h[e.b]; if (h) { h.grudge = Math.max(0, +((h.grudge || 0) - DIRTY.braketest[1]).toFixed(2)); h.dirty = Math.max(0, (h.dirty || 0) - 1); }
        w.drep = clamp(drepOf(w) + 3, 0, 100);
      }
      w.ledger = w.ledger.filter(e => !(e.type === 'braketest' && e.a === 'P'));
      w.btFix = true;
    }
    if (!w.streetPay) streetBackPay(w);
    // (jobs and interviews said yes to by email used to spend their day on the spot: this week's undriven jobs and its
    // interview get their days back, and wait in the day planner instead; the interview's write-up already ran)
    if (!w.bookFix && w.week && w.week.log) {
      const wk = w.week, done = new Set([...(wk.gigs || []), ...(wk.offered || []), ...(wk.booked || [])].filter(g => g.done).map(g => g.id));
      const back = wk.log.filter(x => (x.gig && !x.done && !done.has(x.gig)) || (x.tag === 'Interview' && !x.gig));
      for (const x of back) {
        if (x.tag === 'Interview') (wk.plans ??= []).push({ id: 'pl' + (w.nextId++), done: false, fx: 'press', what: x.what, tag: x.tag, given: true });
        else { const g = (wk.booked || []).find(b => b.id === x.gig); if (g && g.entry) g.entryPaid = true; }
      }
      if (back.length) { wk.log = wk.log.filter(x => !back.includes(x)); const ds = [...new Set(wk.log.map(y => y.day))].sort((a, b) => a - b); wk.log.forEach(x => { x.day = ds.indexOf(x.day); }); wk.used = Math.max(0, wk.used - back.length); }
      w.bookFix = true;
    }
    retireCars(w);
    gt2Moves(w);
    return w;
  } catch (e) { return null; }
}
export function deleteWorld(id) { localStorage.removeItem(slot(id)); localStorage.setItem(INDEX, JSON.stringify(readIndex().filter(e => e.id !== id))); }
// (the actions a suggestion can be, by name, for approveProp)
const OPS_RUN = { answerPen, buildFacility, sellFacility, hireStaff, fireStaff, payBack, setPay, applyLoan, sellAnnuity, offerDriver, extendMate, setMatePay, answerSponsor, answerWorks, answerInvestor, answerBuyout, answerPoach, answerGent, answerOffer, rsvpEvent,
  acquireCar, buyCar, sellCar, buyCar2, buyCar2Model, sellCar2, setCar2Fix, buyFit, removeFit, newPart, rebuildPart, startProject, workOnProject, orderTyres, removeGrey };
