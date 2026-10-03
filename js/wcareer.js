import { roundPress } from './wpress.js';
// World Career: a persistent motorsport world that keeps going whether or not you race in it.
// Three series (Street Cup -> GT Championship -> Formula SV), six teams of two in each, every driver a person with
// an age, stats that grow and fade, a career history and a record against you. Your races are real; the other series'
// rounds are simulated from the drivers' ratings. At the end of a season people age, retire, get promoted or dropped,
// and rookies arrive. News and texts (shown on the phone) are written from what actually happened.
// No story arcs yet (that's the director, later): this is the world they will read from.
import { knobsFor, ratingGap } from './aiskill.js';

// ---------------- data ----------------
export const SEASON_LENGTHS = [4, 6, 8, 12];
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
// car: how you get a car for it (see 'moving up'): 'classifieds' (any road car, second-hand), 'customer' (homologated
// race cars from the makers' customer racing programmes: new, leased by the season, or ex-works), 'spec' (the series'
// one chassis, leased from the series). price: what a new car costs, cheapest to dearest. ballast: success ballast and
// balance of performance. gents: gentleman drivers pay for the second seat.
export const SERIES = [
  { id: 'street', name: 'Street Cup', cls: 'street', tier: 0, base: 50, spread: 14, car: 'classifieds' },
  { id: 'gt', name: 'GT Championship', cls: 'gt1', tier: 1, base: 63, spread: 12, car: 'customer', price: [240000, 330000], ballast: true, gents: true },
  { id: 'formula', name: 'Formula SV', cls: 'f1', tier: 2, base: 76, spread: 10, car: 'spec', price: [900000, 900000], gents: true },
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
  const pid = w.teams[w.player.team]?.drivers.find(d => d !== 'P'); if (!pid) return null;
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
  if (t.includes('paydriver')) return { wage: 0, fee: Math.round((25000 + (60 - Math.min(60, p.pace)) * 900) * (k > 1 ? k * 0.6 : 1) / 500) * 500 };
  let wage = DRIVER_WAGE(p.pace) * k;
  if (t.includes('digger')) wage *= 1.3; if (t.includes('loyal')) wage *= 0.8; if (p.titles) wage *= 1 + 0.15 * p.titles;
  return { wage: Math.round(wage / 50) * 50, fee: 0 };
}
// the people without a seat: kept at about ten (juniors after a first seat, drivers who lost theirs, the odd veteran)
function topUpFreeAgents(w) {
  const free = Object.values(w.people).filter(p => !p.retired && !p.team && ageOf(w, p) < 37);
  for (let i = free.length; i < 10; i++) {
    const x = rng(w), s = rng(w) < 0.7 ? SERIES[0] : SERIES[1];
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
  const okFree = (sid) => !sid || (seriesById(sid) && seriesById(sid).tier <= S.tier + 1);
  return Object.values(w.people).filter(p => !p.retired && p.id !== mateId && ageOf(w, p) < 40 && (
    (!p.team && okFree(p.series)) || (w.over && p.team && p.team !== w.player.team && ok(w.teams[p.team]?.series))))
    .sort((a, b) => b.pace - a.pace).slice(0, 14);
}
// will they sign? (an offer of their ask, or lowball = 75% of it)
export function offerDriver(w, pid, lowball = false) {
  const p = w.people[pid], a = askOf(w, p), h = h2hOf(w, pid);
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
export function extendMate(w) { const m = mateOf(w); if (!m) return; const a = askOf(w, w.people[m.pid]); m.wage = a.wage; m.until = Math.max(m.until, w.year) + 1; m.morale = clamp(m.morale + 10, 0, 100); w.drep = clamp(drepOf(w) + 2, 0, 100); }
export function setMatePay(w, mode) { const m = mateOf(w); if (m) m.pay = mode; }
// the teammate's payroll line (runPayroll): their mood shows in their form
function payMate(w) {
  const m = mateOf(w); if (!m || !m.wage) { if (m) m.morale = clamp(m.morale + 1, 0, 100); return; }
  const p = w.people[m.pid], t = traitsOf(w, p), wage = m.wage;
  const paid = m.pay === 'full' ? wage : m.pay === 'half' ? Math.round(wage / 2) : 0;
  if (paid) pay(w, -paid, `Payroll: ${p.first} ${p.last} (driver)${paid < wage ? ', part' : ''}`);
  m.owed += wage - paid;
  m.morale = clamp(m.morale + (paid === wage ? 3 : (t.includes('loyal') ? -5 : -14) * (paid ? 0.6 : 1)), 0, 100);
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
  topUpFreeAgents(w);
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
  return p.pace * 0.6 + (t ? carValue(w, t) : 50) * 0.25 + 15 + (p.form || 0) + (mateMentored(w, pid) ? 1 : 0);
}
// does this driver have a mentor in the other seat?
function mateMentored(w, pid) {
  const p = w.people[pid], t = p && w.teams[p.team]; if (!t) return false;
  return t.drivers.some(d => d !== pid && d !== 'P' && w.people[d]?.traits?.includes('mentor'));
}
// race.js knobs for an AI driver: their gap to a clean lap (%, from their rating), technique (aiskill.js: their flaws,
// which cost part of it; race.js measures how much and sets the pace to make up the rest), a pace multiplier (the wet), aggression, mistake rate. Their pace rating sets
// how impatient they are on the power (a hothead more so), consistency how much their line and braking points wander
// (a metronome's half as much). cls: the series' class (each flaw costs a different amount in each).
export function raceKnobs(w, pid, rain, cls = 'gt1') {
  const p = w.people[pid], r = rating(w, pid), tr = traitsOf(w, p);
  const f = clamp((88 - p.pace) / 40, 0, 1) + (tr.includes('hothead') ? 0.25 : 0);
  const g = clamp((85 - p.cons) / 45, 0, 1) * (tr.includes('metronome') ? 0.5 : 1);
  const k = knobsFor(cls, ratingGap(r), f, g);
  // (on top: the wet, and a mentor in the other seat, as a pace multiplier)
  const pace = (rain ? 1 + (p.wet - 50) * 0.0004 : 1) * (mateMentored(w, pid) ? 1.004 : 1);
  // (the dice-roll mistakes are a little rarer than before: an inconsistent driver's own technique now makes some)
  return { pace: Math.min(1.01, pace), gap: k.gap, skill: k.skill, tc: k.tc,
    aggr: clamp(0.15 + p.aggr / 100 * 0.85 + grudgeOf(w, pid) * 0.06, 0.1, 1), mistakes: clamp(1.5 - p.cons / 100 * 1.1, 0.35, 1.3) };
}

// the entry list of your series this round: 11 AI drivers in race slots 1..11 (slot 0 is yours), teammates side by side
export function raceEntries(w) {
  const S = w.series[w.player.series], round = S.cal[w.round], rain = round.weather === 'rain', cls = seriesById(w.player.series).cls;
  const entries = {}, teamPace = {}, roster = [];
  let slot = 1;
  for (const tid of S.teams) {
    const t = w.teams[tid];
    for (const pid of t.drivers) {
      if (pid === 'P') continue;
      const p = w.people[pid], k = raceKnobs(w, pid, rain, cls);
      entries[slot] = { pid, tid, teamNo: S.teams.indexOf(tid), name: shortName(p).replace(/^\w\. /, ''), team: { name: t.name, main: t.main, accent: t.accent, helmet: t.accent, driver: shortName(p) }, aggr: k.aggr, mistakes: k.mistakes, gap: k.gap, skill: k.skill, tc: k.tc };
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
      const rs = pids.filter(x => x !== 'P').map(x => rating(w, x)).sort((a, b) => b - a), sid0 = w.player.series;
      r = rs[Math.min(rs.length - 1, Math.floor(rs.length * (w.simSkill ?? 0.4)))] + (carValue(w, myTeam(w)) - seriesById(sid0).base) * 0.25; p = { cons: 70, wet: 50, aggr: 50, craft: 60 };
    }
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
    if (DIRTY[e.type] && e.a === 'P') { h.dirty = (h.dirty || 0) + 1; h.grudge = (h.grudge || 0) + DIRTY[e.type][1]; w.drep = clamp(drepOf(w) - 3, 0, 100); }
    if (e.type === 'contact' && e.blame && e.a === 'P') h.grudge = (h.grudge || 0) + 0.6;
  }
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
  text(w, p.first, h.grudge >= 3 ? `${pickLine(w, lines)} And it's not the first time.` : pickLine(w, lines));
  if (h.grudge >= 4 && !h.went) { h.went = true; news(w, `${p.last.toUpperCase()} HITS OUT AT ${w.player.name.split(' ').pop().toUpperCase()}`, `${nameOf(p)} says ${w.player.name} "races dirty and gets away with it".`); w.drep = clamp(drepOf(w) - 4, 0, 100); }
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
  grudgeTexts(w, log);
  const me = known.find(r => r.pid === 'P');
  for (const r of known) if (r.pid !== 'P' && me) { const h = h2hOf(w, r.pid); h.races++; if (r.dnf && !me.dnf || (!me.dnf && me.pos < r.pos)) h.ahead++; else h.behind++; }
  const u = use || simUse(w), bill = w.money ? settleRound(w, u, me) : null;
  afterParts(w, u);
  // who reacts (character voices): Danny always; your teammate half the time; the rival owner now and then (with how
  // their cars did); your ex after a podium
  if (me && use) {
    const facts = raceFacts(w, me, use, log);
    react(w, 'danny', facts);
    if (rng(w) < 0.5) react(w, 'mate', facts);
    if (w.rival && rng(w) < 0.35) { const theirs = w.series[sid].results.at(-1).rows.filter(r => teamOfPid(w, r.pid) === w.rival.tid); if (theirs.length) react(w, 'rival', `${facts} ${w.teams[w.rival.tid].name}'s cars finished ${theirs.map(r => r.dnf ? 'DNF' : ordinalOf(r.pos)).join(' and ')}.`); }
    if (!me.dnf && me.pos <= 3 && rng(w) < 0.4) react(w, 'ex', facts);
  }
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
  ballastRound(w, me);
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
      if (e.pid === 'P') { w.player.hist.push(entry); summary.you = entry; if (k === 0) w.player.titles++; }
      else if (w.people[e.pid]) { w.people[e.pid].hist.push(entry); if (k === 0) w.people[e.pid].titles++; }
    });
  }
  w.seasons.push(summary);
  // the series' prize fund, by championship position
  const fund = SEASON_FUND[w.player.series], me = summary.you;
  if (w.money && me && fund[me.pos - 1]) {
    pay(w, fund[me.pos - 1], `${seriesById(w.player.series).name} prize fund: P${me.pos} in the championship`);
    mail(w, `${seriesById(w.player.series).name} Office`, addrOf(seriesById(w.player.series), 'office'), `${w.year} prize fund`, [`Congratulations on finishing P${me.pos} in the ${w.year} championship. Your share of the prize fund, ${money$(fund[me.pos - 1])}, has been paid into your account.`, `${seriesById(w.player.series).name} Office`]);
  }
  // your options: move up if you finished in the top three (and there's a series above)
  const tier = seriesById(w.player.series).tier, up = SERIES[tier + 1];
  const you = summary.you;
  if (up && you && you.pos <= 3) {
    w.player.offer = { to: up.id, answer: null };
    const b = seasonBudget(w, up);
    mail(w, `${up.name} Entries`, addrOf(up, 'entries'), `An entry for ${w.year + 1}`,
      [`Dear ${w.player.name.split(' ')[0]},`, `Congratulations on finishing P${you.pos} in the ${seriesById(w.player.series).name} this year. We have an entry available in the ${up.name} for ${w.year + 1}, and we would like it to go to ${w.teams[w.player.team].name}.`,
       `For your planning, here is what our teams tell us a season costs: about ${money$(b.run)} to run a car (entry, travel, crew, tyres, fuel), plus the car${!b.lease ? '.' : `: ${up.car === 'spec' ? `the series chassis is leased from us, from ${money$(b.lease)} a season` : `leased from the makers' customer programmes from ${money$(b.lease)} a season, or from ${money$(b.buy)} to buy`}.`}`,
       up.gents ? `Most teams run a gentleman driver in the second car, who pays for the seat. Prize money for a mid-field season comes to about ${money$(b.prize)}.` : `Prize money for a mid-field season comes to about ${money$(b.prize)}.`,
       ...(SERIES_NEEDS[up.id] ? [`Entrants must have ${Object.entries(SERIES_NEEDS[up.id]).map(([k, n]) => needName(k, n)).join(' and ')} before the season starts.`] : []),
       `We mention this because several teams have asked us afterwards.`, `Please let us know before the new season.`, `Entries Office, ${up.name}`],
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
  { const m = w.mate, t = w.teams[w.player.team];
    if (m && m.until < w.year + 1 && t.drivers.includes(m.pid)) { const q = w.people[m.pid]; t.drivers = t.drivers.filter(d => d !== m.pid); q.team = null; w.mate = null; w.payDriver = null; text(w, q.first, `My contract's up. Thanks for the ride.`); } }
  for (const h of Object.values(w.h2h)) if (h.grudge) { h.grudge = +(h.grudge * 0.5).toFixed(2); if (h.grudge < 0.3) h.grudge = 0; h.went = false; }
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
    // (old hands become mentors)
    if (age >= 30 && traitsOf(w, p).length < 2 && !p.traits.includes('mentor') && rng(w) < 0.12) p.traits.push('mentor');
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
  // teams' cars: the AI teams' seasons (money, facilities, crews), and everyone's development fades
  aiSeason(w); devSeason(w); staffSeason(w);
  for (const s of SERIES) {
    void s; // (what each team's car is worth now comes from its development: aiSeason)
  }
  // driver market, top series first: the best of the series below take the seats; the slowest step down
  const prevStand = {}; for (const s of SERIES) prevStand[s.id] = standings(w, s.id).map(e => e.pid);
  for (let tier = SERIES.length - 1; tier >= 0; tier--) {
    const s = SERIES[tier], below = SERIES[tier - 1], above = SERIES[tier + 1];
    // drop the bottom two of this series (to the series below, if they're young enough to care)
    if (below) {
      const bottom = prevStand[s.id].filter(pid => pid !== 'P' && w.people[pid] && !w.people[pid].retired && w.people[pid].team && w.people[pid].team !== w.player.team && w.teams[w.people[pid].team].series === s.id).slice(-2);
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
  // you: move up (your team takes the place of the weakest team in the series above, which drops a level), if you
  // have what the series asks for
  const off = w.player.offer;
  if (off && off.answer === 'move' && seriesMissing(myTeam(w), off.to).length) {
    const miss = seriesMissing(myTeam(w), off.to).map(([k, n]) => needName(k, n));
    off.answer = 'stay';
    mail(w, `${seriesById(off.to).name} Entries`, addrOf(seriesById(off.to), 'entries'), `Your entry`, [`We're sorry to say we cannot accept your entry for ${w.year + 1}: entrants must have ${miss.join(' and ')}.`, `The offer will be considered again next year, results permitting.`, `Entries Office, ${seriesById(off.to).name}`]);
  }
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
    devReset(swap);
    moves.push({ kind: 'you-up', to });
  }
  const moved = off && off.answer === 'move';
  w.player.offer = null;
  w.lastMoves = moves;
  newCalendars(w, trackPool);
  // the new season's paperwork: where to get a car (you've moved up), GT's balance of performance, gentleman drivers
  if (!w.pre && w.money) {
    if (moved && needsCar(w)) carsMail(w);
    seasonBop(w); gentOffers(w);
  }
  if (!w.pre) topUpFreeAgents(w);
  seasonOpenNews(w, moves);
  return moves;
}

// ---------------- the teams: development, facilities, crews (every team, yours included) ----------------
// A car's pace is its chassis plus what its team has developed: dev { power, grip, downforce, brake } (fractions, each
// worth a share of lap time: LAP_K) and rel (fewer failures). Development comes from projects (PROJECTS: days of work
// and money, and a chance it works); how well they go depends on the team's facilities (FACILITIES) and its crew.
// Everyone's development fades a fifth every season (the series moves on), so standing still is going backwards.
// The AI teams run the same way, with their own money (prize money, sponsors, and an owner who tops it up) and their
// own priorities (t.style): that, not a difficulty setting, is why the fast teams are fast. (The difficulty setting is
// how well the AI drive, the same for every team.) In the race an AI car's development is part of its pace gap
// (rating -> raceKnobs); yours is in your car's modifiers (carMods).
const LAP_K = { power: 0.3, grip: 0.5, downforce: 0.05, brake: 0.08, drag: -0.15 }; // (lap time gained per unit of each)
const CAR_PTS = 1 / 0.000275; // (a team's car rating point: 0.0275% of a lap)
const DEV_REF = { street: 0.0083, gt: 0.0064, formula: 0.0034 }; // (the development a typical team carries: a car rating of the series' base)
const DEV_FADE = 0.8;
const COND_TYP = -0.012; // (what parts at about 80% cost a car in lap time: the condition a car is usually raced in)
const DEV_STATS = ['power', 'grip', 'downforce', 'brake', 'rel'];
const devZero = () => ({ power: 0, grip: 0, downforce: 0, brake: 0, rel: 0 });
const lapGain = (d) => Object.entries(LAP_K).reduce((a, [k, v]) => a + (d[k] || 0) * v, 0);
const tierOf = (sid) => (seriesById(sid) || SERIES[0]).id;
// how far each kind of development can go in a series (the rules, and physics): gains shrink as you approach it
const DEV_CAP = { street: { power: 0.03, grip: 0.015, downforce: 0.08, brake: 0.05, rel: 0.5 }, gt: { power: 0.02, grip: 0.015, downforce: 0.06, brake: 0.04, rel: 0.5 }, formula: { power: 0.03, grip: 0.02, downforce: 0.12, brake: 0.05, rel: 0.5 } };
// [key, area, name, stat, gain, days, cost, needs { facility: level }, joker (GT: homologated, two a season)]
export const devCapOf = (w) => DEV_CAP[tierOf(w.player.series)] || DEV_CAP.street;
export const PROJECTS = {
  street: [
    ['remap', 'engine', 'Dyno tune and remap', 'power', 0.0036, 2, 1800, { dyno: 1 }], ['head', 'engine', 'Port and polish the head', 'power', 0.006, 5, 4500],
    ['cams', 'engine', 'Hotter cams', 'power', 0.0048, 3, 3800], ['bottom', 'engine', 'Lightened rotating assembly', 'power', 0.0075, 7, 9000, { tools: 2 }],
    ['corner', 'chassis', 'Corner-weight the car', 'grip', 0.0018, 1, 500], ['strip', 'chassis', 'Strip out weight', 'grip', 0.003, 3, 1200],
    ['geo', 'chassis', 'Suspension geometry rework', 'grip', 0.0042, 4, 5000], ['shell', 'chassis', 'Stiffen the shell', 'grip', 0.0036, 5, 3500, { fab: 1 }],
    ['splitter', 'aero', 'Home-made splitter', 'downforce', 0.0125, 2, 900], ['wing', 'aero', 'Wing endplates and a gurney', 'downforce', 0.01, 2, 1300], ['floor', 'aero', 'Flat floor', 'downforce', 0.02, 5, 5500, { fab: 1 }],
    ['ducts', 'brakes', 'Brake cooling ducts', 'brake', 0.012, 2, 800], ['bias', 'brakes', 'Bias valve and braided lines', 'brake', 0.009, 1, 600],
    ['loom', 'reliability', 'Rebuild the wiring loom', 'rel', 0.1, 3, 1500], ['cooling', 'reliability', 'Uprated cooling', 'rel', 0.08, 2, 1900],
  ],
  gt: [
    ['evoeng', 'engine', 'Engine evolution (a joker)', 'power', 0.0045, 8, 60000, null, true], ['map', 'engine', 'Mapping, within the rules', 'power', 0.0015, 2, 8000, { dyno: 1 }],
    ['setup', 'chassis', 'Setup programme', 'grip', 0.0024, 3, 12000], ['dampers', 'chassis', 'Damper development', 'grip', 0.0036, 5, 30000], ['weight', 'chassis', 'Ballast placement', 'grip', 0.0018, 2, 6000],
    ['evoaero', 'aero', 'Aero evolution (a joker)', 'downforce', 0.015, 8, 70000, null, true],
    ['brakes', 'brakes', 'Brake cooling package', 'brake', 0.012, 3, 15000],
    ['relgt', 'reliability', 'Reliability programme', 'rel', 0.1, 4, 20000],
  ],
  formula: [
    ['pu', 'engine', 'Power unit upgrade', 'power', 0.0045, 10, 250000], ['susp', 'chassis', 'Suspension concept', 'grip', 0.0045, 8, 200000],
    ['fwing', 'aero', 'New front wing', 'downforce', 0.015, 8, 180000, { tunnel: 1 }], ['ffloor', 'aero', 'Floor development', 'downforce', 0.02, 10, 300000, { tunnel: 1 }],
    ['bbw', 'brakes', 'Brake-by-wire', 'brake', 0.012, 5, 90000], ['relf', 'reliability', 'Reliability', 'rel', 0.1, 5, 120000],
  ],
};
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
// what a series asks of a team before it can enter (a facility: the level it needs)
export const SERIES_NEEDS = { gt: { base: 1, truck: 1 }, formula: { base: 2, truck: 1, tunnel: 1 } };
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
export function carValue(w, t) {
  const base = (seriesById(t.series) || SERIES[0]).base;
  if (t.mine) {
    const m = w.car ? carMods(w) : null;
    const g = m ? (m.power - 1) * LAP_K.power + (m.grip - 1) * LAP_K.grip + (m.downforce - 1) * LAP_K.downforce + (m.brake - 1) * LAP_K.brake + (m.drag - 1) * LAP_K.drag : 0;
    return base + (g - COND_TYP) * CAR_PTS; // (yours, undeveloped and in fair condition, is a typical car: what the difficulty is set against)
  }
  return base + (lapGain(devOf(w, t)) - DEV_REF[tierOf(t.series)]) * CAR_PTS;
}
// how likely a project is to work, and how well: who's doing it (your days and your mechanic, or a shop), the tools,
// the facility for that kind of work, the data room
function projOdds(w, t, P, shop) {
  const F = (k) => facLevel(t, k), m = t.mine ? staffOf(w, 'mechanic') : null, mech = t.mine ? (m ? m.skill : 0) : (t.crew?.mech || 2);
  const area = P.area, spec = area === 'engine' ? F('dyno') * 0.12 : area === 'chassis' || area === 'aero' ? F('fab') * 0.08 + (area === 'aero' ? F('tunnel') * 0.1 : 0) : 0;
  const chance = shop ? 0.85 : clamp(0.5 + F('tools') * 0.08 + mech * 0.04 + spec + F('data') * 0.05, 0.3, 0.95);
  const q = 0.9 + spec * 1.2 + (shop ? 0 : mech * 0.02);
  return { chance, q };
}
// the cost of a project for a team (the composites shop makes chassis and aero work cheaper)
const projCost = (t, P, shop) => Math.round(P.cost * (shop ? 1.6 : 1) * ((P.area === 'aero' || P.area === 'chassis') && facLevel(t, 'fab') >= 2 ? 0.75 : 1) / 50) * 50;
// what it'd add now (gains shrink as the car nears what the rules allow)
export function projGain(w, t, P) { const cap = DEV_CAP[tierOf(t.series)] || DEV_CAP.street, cur = devOf(w, t)[P.stat] || 0; return P.gain * Math.max(0.15, 1 - cur / cap[P.stat]); }
// the projects you can start: [{ ...P, cost, shopCost, odds, gain, locked (why not) }]
export function projectList(w) {
  const t = myTeam(w), active = (w.projects || []).filter(x => !x.done), jok = jokersLeft(w);
  return projOf(w.player.series).map(P => {
    const miss = P.needs ? Object.entries(P.needs).filter(([k, n]) => facLevel(t, k) < n).map(([k, n]) => FACILITIES[k].levels[n - 1][0]) : [];
    const locked = !w.car || needsCar(w) ? 'No car for it' : miss.length ? `Needs: ${miss.join(', ')}` : active.some(x => x.key === P.key) ? 'Under way' : P.joker && jok <= 0 ? 'No jokers left this season' : null;
    return { ...P, cost: projCost(t, P, false), shopCost: projCost(t, P, true), odds: projOdds(w, t, P, false), gain: projGain(w, t, P), locked };
  });
}
export const maxProjects = (w) => 1 + Math.min(2, facLevel(myTeam(w), 'base'));
export const jokersLeft = (w) => JOKERS - ((w.jokers && w.jokers.y === w.year) ? w.jokers.n : 0);
// start one: 'team' (your days, your mechanic's time) or 'shop' (dearer, done by the next round, more likely to work)
export function startProject(w, key, who = 'team') {
  const P = projectList(w).find(x => x.key === key); if (!P || P.locked) return { ok: false, why: P ? P.locked : 'No such project.' };
  const shop = who === 'shop', cost = shop ? P.shopCost : P.cost;
  // (your premises have room for so many at once; a shop's work is done at the shop)
  if (!shop && (w.projects || []).filter(x => !x.done && !x.shop).length >= maxProjects(w)) return { ok: false, why: `You have room for ${maxProjects(w)} at a time. Bigger premises have room for more, or send one to a shop.` };
  pay(w, -cost, `${shop ? 'Outsourced: ' : 'Project: '}${P.name}`);
  if (P.joker) w.jokers = { y: w.year, n: (w.jokers && w.jokers.y === w.year ? w.jokers.n : 0) + 1 };
  (w.projects ??= []).unshift({ id: 'pj' + (w.nextId++), key, name: P.name, area: P.area, stat: P.stat, days: P.days, done: 0, who, shop, y: w.year });
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
function crewWork(w) {
  const m = staffOf(w, 'mechanic'); let cap = (m ? 1.5 + m.skill * 0.6 * (m.morale < 35 ? 0.5 : 1) : 0) + (m ? facLevel(myTeam(w), 'tools') * 0.4 : 0);
  for (const x of (w.projects || []).filter(p => !p.done).reverse()) {
    if (x.shop) { finishProject(w, x); continue; }
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
  const o = projOdds(w, t, P, x.shop), ok = rng(w) < o.chance, d = devOf(w, t);
  const g = ok ? projGain(w, t, P) * o.q * (0.8 + rng(w) * 0.4) : 0;
  if (ok) d[P.stat] = +((d[P.stat] || 0) + g).toFixed(4);
  x.ok = ok; x.got = +g.toFixed(4);
  const exact = (P.area === 'engine' && facLevel(t, 'dyno')) || dataLevel(w) >= 1;
  const said = !ok ? pickLine(w, [`Didn't work. We tried it three ways`, `No good. It's slower if anything, so it's coming off`, `Waste of time, honestly. My fault`])
    : P.stat === 'rel' ? `Done. Should be more reliable` : exact ? `Done. ${(g * 100).toFixed(1)}% more ${P.stat === 'grip' ? 'grip' : P.stat === 'brake' ? 'braking' : P.stat} on the numbers` : pickLine(w, [`Done. Feels better`, `Done. Hard to say how much till we race it`, `Finished. It's quicker, I think`]);
  const m = staffOf(w, 'mechanic');
  if (x.shop) mail(w, 'Precision Race Prep', 'workshop@precisionraceprep.sv', `Job complete: ${x.name}`, [`Your job is complete and the car is ready to collect.`, ok ? (exact ? `Measured gain: ${(g * 100).toFixed(1)}%.` : 'We are confident you will notice the difference.') : 'Unfortunately the modification did not deliver the expected gains. Labour is charged regardless.', 'Precision Race Prep']);
  else text(w, m ? m.first : 'Danny', `${x.name}: ${said}`);
}
// the season turns: development fades, GT's jokers reset (yours: on the car; the AI's: in aiSeason)
function devSeason(w) { if (w.car && w.car.dev) for (const k of DEV_STATS) w.car.dev[k] = +(w.car.dev[k] * DEV_FADE).toFixed(4); }

// ---- the AI teams: a business each ----
// t.bank (money), t.owner (what the owner puts in each season, by wealth), t.style ('build': facilities first,
// 'develop': projects, 'balanced'), t.crew { mech, eng } (1-5)
const AI_SPONSOR = { street: 5000, gt: 30000, formula: 100000 }; // (a round, for a mid-table team)
const AI_OWNER = { street: 75000, gt: 120000, formula: 300000 };  // (a season, for an owner of average wealth)
const STYLES = ['build', 'develop', 'balanced'];
function aiInit(w, t) {
  if (t.bank != null) return;
  t.wealth = +(0.4 + rng(w) * 1.3).toFixed(2); t.style = STYLES[Math.floor(rng(w) * 3)];
  t.crew = { mech: 1 + Math.floor(rng(w) * 3), eng: 1 + Math.floor(rng(w) * 3) };
  t.fac = { base: rng(w) < t.wealth / 2 ? 1 : 0 }; if (rng(w) < 0.5) t.fac.tools = 1;
  for (const [k, n] of Object.entries(SERIES_NEEDS[t.series] || {})) t.fac[k] = Math.max(t.fac[k] || 0, n); // (a team in a series has what it asks for)
  t.dev = devZero(); t.bank = Math.round(AI_OWNER[tierOf(t.series)] * t.wealth * 0.5); t.active = [];
}
// a round for an AI team: money in (prize money, sponsors), money out (running the cars, the facilities), and the
// development work: its crew's days go into projects it can afford
function aiRound(w, sid, rows) {
  const c = COSTS[sid], S = w.series[sid], ts = teamStandings(w, sid), n = S.teams.length;
  for (const tid of S.teams) {
    const t = w.teams[tid]; if (t.mine) continue; aiInit(w, t);
    const rank = Math.max(0, ts.findIndex(e => e.tid === tid)), rep = 1 - rank / Math.max(1, n - 1);
    const prize = Math.max(0, ...rows.filter(r => w.people[r.pid]?.team === tid && !r.dnf).map(r => c.prize[r.pos - 1] || 0));
    const run = c.entry + c.travel * (facLevel(t, 'truck') ? 0.65 : 1) + c.crew + c.tyre * 3 + c.fuelLap * 30 + facUpkeep(t) + (t.crew.mech + t.crew.eng) * 600 * (WAGE_K[sid] || 1);
    t.bank += prize + AI_SPONSOR[sid] * (0.5 + rep) - run;
    // projects: keep a reserve of a few rounds' running costs
    const reserve = run * (t.style === 'develop' ? 1.5 : 3);
    t.active = (t.active || []).filter(Boolean);
    const cap = 2 + t.crew.mech * 0.8 + facLevel(t, 'tools') * 0.4;
    const jok = (t.jokers && t.jokers.y === w.year) ? t.jokers.n : 0;
    while (t.active.length < 1 + Math.min(2, facLevel(t, 'base'))) {
      const opts = projOf(sid).filter(P => !t.active.some(a => a.key === P.key) && !(P.needs && Object.entries(P.needs).some(([k, l]) => facLevel(t, k) < l)) && !(P.joker && jok >= JOKERS));
      const P = opts.sort((a, b) => projGain(w, t, b) * LAP_K_OF(b) / projCost(t, b) - projGain(w, t, a) * LAP_K_OF(a) / projCost(t, a) + (rng(w) - 0.5) * 1e-6)[0];
      if (!P || t.bank - projCost(t, P) < reserve) break;
      t.bank -= projCost(t, P); t.active.push({ key: P.key, prog: 0 });
      if (P.joker) t.jokers = { y: w.year, n: jok + 1 };
    }
    let left = cap;
    for (const a of t.active) {
      const P = projOf(sid).find(p => p.key === a.key); if (!P) { a.done = true; continue; }
      const put = Math.min(left, P.days - a.prog); a.prog += put; left -= put;
      if (a.prog >= P.days) { a.done = true; const o = projOdds(w, t, P, false); if (rng(w) < o.chance) t.dev[P.stat] = +((t.dev[P.stat] || 0) + projGain(w, t, P) * o.q * (0.8 + rng(w) * 0.4)).toFixed(4); }
    }
    t.active = t.active.filter(a => !a.done);
  }
}
const LAP_K_OF = (P) => P.stat === 'rel' ? 0.02 : LAP_K[P.stat];
// an AI team's season: the owner's money, development fades, a facility if it can afford one, the crew
function aiSeason(w) {
  for (const t of Object.values(w.teams)) {
    if (t.mine || !t.series) continue; aiInit(w, t);
    for (const k of DEV_STATS) t.dev[k] = +(t.dev[k] * DEV_FADE).toFixed(4);
    t.bank += AI_OWNER[tierOf(t.series)] * t.wealth;
    t.wealth = clamp(t.wealth + gauss(w) * 0.08, 0.2, 2.2);
    // build: the first thing on its list it can afford (facilities first for builders)
    const order = t.style === 'build' ? ['base', 'tools', 'dyno', 'fab', 'data', 'truck', 'sim', 'tunnel'] : ['tools', 'base', 'dyno', 'fab', 'data', 'sim', 'truck', 'tunnel'];
    const keep = t.style === 'build' ? 1.2 : 2.5;
    for (const k of order) {
      const nx = facNext(t, k); if (!nx || facLevel(t, 'base') < nx.needsBase) continue;
      if (k === 'tunnel' && t.series !== 'formula') continue;
      if (k === 'base' && facLevel(t, 'base') >= ({ street: 2 }[t.series] ?? 3)) continue; // (no factories in the Street Cup)
      const run = COSTS[t.series].entry + COSTS[t.series].crew;
      if (t.bank > nx.cost + run * keep * w.opts.len / 2) { t.bank -= nx.cost; facOf(t)[k] = facLevel(t, k) + 1; if (!w.pre && t.series === w.player.series) news(w, `${t.name.toUpperCase()} INVESTS`, `${t.name} has added ${nx.name.toLowerCase().replace(/^(an?|the) /, '')} to its base.`); break; }
    }
    // the crew: rich teams hire better people; good people get better
    const flush = t.bank > AI_OWNER[tierOf(t.series)] * 0.5;
    for (const r of ['mech', 'eng']) if (rng(w) < 0.3) t.crew[r] = clamp(t.crew[r] + (flush ? 1 : t.bank < 0 ? -1 : 0), 1, 5);
    if (t.bank < 0) t.bank = Math.round(t.bank * 0.5); // (the owner pays off half the debt)
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
function devReset(t) { if (t.dev) t.dev = devZero(); t.active = []; }

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
      deposit: Math.round(price * 0.1 / 1000) * 1000, perRound: Math.round(price * 0.36 / L / 500) * 500, buy: !spec, lease: true };
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
  return { run, lease, buy, prize: L * (c.prize[5] || 0) + (SEASON_FUND[S.id]?.[5] || 0) };
}

// you've moved up: where the cars are
function carsMail(w) {
  const S = seriesById(w.player.series), b = seasonBudget(w, S);
  mail(w, `${S.name} Entries`, addrOf(S, 'entries'), `Your ${w.year} entry: the car`,
    [`Welcome to the ${S.name}.`, S.car === 'spec' ? `Every team races the series chassis, leased from us for the season (from ${money$(b.lease)}).` : `Cars must be homologated for the ${S.name}. The makers' customer racing programmes sell and lease them (a lease from ${money$(b.lease)} a season, or from ${money$(b.buy)} to buy), and teams sometimes sell last year's cars.`,
     w.car ? `Your ${w.car.name} is not eligible. Most dealers will take it in part exchange.` : '', `Entries Office, ${S.name}`].filter(Boolean),
    { link: ['customer', 'See the cars'] });
}

// ---------------- GT: balance of performance and success ballast ----------------
// The series evens the cars out each season (a few kilos here, a restrictor there: w.bop), and puts weight on whoever
// is winning (w.ballast, kg: +30 for a win, +20 second, +10 third, 10 off for anything else, 60 at most).
const BALLAST = [30, 20, 10], BALLAST_MAX = 60;
export const ballastOf = (w) => seriesById(w.player.series).ballast ? (w.ballast || 0) : 0;
export const bopOf = (w) => (seriesById(w.player.series).ballast && w.car && w.bop && w.bop.y === w.year && w.bop.k[w.car.chassis]) || 1;
// kilos as a power factor (0.06% a kilo, on a car of about 1100 kg), and back
const kgOf = (f) => Math.round((1 - f) / 0.0006 / 5) * 5;
function seasonBop(w) {
  const S = seriesById(w.player.series); if (!S.ballast) return;
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
  const S = seriesById(w.player.series); if (!S.gents || !w.money) return;
  const K = { gt: 1, formula: 4 }[S.id] || 1, L = w.opts.len;
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

// ---------------- the week, from GT up ----------------
// (a day's work you're asked to do: { what, pay, tag }; taken from the email)
export function takeDayJob(w, m) {
  const j = m.dayJob; if (!j || daysLeft(w) <= 0) return false;
  useDay(w, j.what, j.pay, j.tag); pay(w, j.pay, j.what);
  if (j.mate) { const q = mateOf(w) && w.people[mateOf(w).pid]; if (q) q.pace = clamp(q.pace + 0.6, 20, 99); }
  return true;
}

// ---------------- money ----------------
// You won the lottery and spent it on a racing team. The opening choice (lump sum or annuity) is an email; every round
// then costs money (entry, travel, the crew, tyres, fuel, repairs) and pays prize money. All in dollars; the scale is
// set so a Street Cup season loses money: the lump sum lasts about a season and a half on racing alone, and the
// week's work (day job, gigs) is what keeps you going. Every step up needs more than you have (sponsors).
export const LOTTERY = { jackpot: 400000, lump: 132000, annuity: 10000, years: 30, saleRate: 0.25 }; // (selling the annuity: a quarter of what it's worth)
export const COSTS = {
  street:  { entry: 3000,  travel: 2000,  crew: 2500,  tyre: 900,  fuelLap: 35,  repair: 24000,  prize: [12000, 8000, 6000, 4500, 3500, 2800, 2200, 1700, 1300, 1000] },
  gt:      { entry: 15000, travel: 6000,  crew: 22000, tyre: 3200, fuelLap: 120, repair: 110000, prize: [80000, 56000, 40000, 32000, 26000, 20000, 16000, 12000, 8000, 6000] },
  formula: { entry: 40000, travel: 15000, crew: 90000, tyre: 6000, fuelLap: 300, repair: 450000, prize: [200000, 140000, 100000, 80000, 65000, 50000, 40000, 30000, 20000, 15000] },
};
// the annuity is a year's money; seasons of other lengths get it in proportion (a 12-round year pays twice a 6)
const annuityPay = (w) => Math.round(LOTTERY.annuity * (w.money?.loophole || 1) * w.opts.len / 6 / 100) * 100;
// the end of the season: the series pays its prize fund by championship position
const SEASON_FUND = {
  street:  [25000, 16000, 11000, 8000, 6000, 4500, 3500, 2500, 1500, 1000],
  gt:      [100000, 64000, 44000, 32000, 24000, 18000, 14000, 10000, 6000, 4000],
  formula: [250000, 160000, 110000, 80000, 60000, 45000, 35000, 25000, 15000, 10000],
};
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
    ['Entry fee', -c.entry], [home ? 'Travel (home race: you drove)' : 'Travel and freight', home ? 0 : -Math.round(c.travel * fx.travel * (facLevel(myTeam(w), 'truck') ? 0.65 : 1))], ['Pit crew (contract)', -c.crew],
    ['Premises and facilities', -facUpkeep(myTeam(w))],
    [`Tyres bought trackside (${use.trackside || 0} set${use.trackside === 1 ? '' : 's'})`, -Math.round((use.trackside || 0) * c.tyre * TRACKSIDE)],
    [`Fuel (${use.laps} lap${use.laps === 1 ? '' : 's'})`, -Math.round(use.laps * c.fuelLap * (bg.fuel || 1))],
  ];
  if (w.car && w.car.lease) items.push([`Car lease (${w.car.lease.prog})`, -w.car.lease.perRound]);
  if (use.damage > 0.005) items.push([bg.repair ? 'Repairs (mostly done yourself)' : 'Repairs', -Math.round(use.damage * c.repair * (bg.repair || 1) * fx.repair / 100) * 100]);
  for (const it of sponsorRound(w, use, me)) items.push(it);
  for (const it of temptRound(w, use, me)) items.push(it);
  arcRound(w, me);
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

// ---------------- the week: five days between rounds ----------------
// Each round has a week before it: five days to spend on earning (the day job, gigs), on the team (rebuilding parts
// yourself, a test day, a sponsor's event), or on nothing. The gigs are short drives on the race engine (main.js plays
// them): courier runs and funeral transport through the GigGo app, track-day passenger rides and club time attacks by
// email, and Danny's street races. Booking one takes its day; a booking not driven by race day is a no-show.
export const WEEK_DAYS = 5;
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const weekKey = (w) => `${w.year}-${w.round}`;
export function weekOf(w) {
  if (!w.week || w.week.key !== weekKey(w)) {
    const prev = w.week;
    w.week = { key: weekKey(w), used: 0, log: [], booked: [], gigs: [], setup: false };
    if (prev && !w.pre) noShows(w, prev);
    if (!w.pre) w.weekN = (w.weekN || 0) + 1;
    if (!w.pre && !w.over && w.car && !needsCar(w) && w.money && w.money.choice) planWeek(w);
    director(w);
  }
  return w.week;
}
export const daysLeft = (w) => WEEK_DAYS - weekOf(w).used;
export const weekOpen = (w) => !!(w.car && !needsCar(w) && w.money && w.money.choice && !w.over);
// (tag: the calendar's short name for the day; gig: a booked drive, filled in when it's driven)
function useDay(w, what, amt = 0, tag = '', gig = null) { const wk = weekOf(w); wk.log.push({ day: wk.used, what, amt, tag, gig }); wk.used++; }
// (and a day spent on the team: what the week's log shows)
export function spendDay(w, what, tag = '') { if (daysLeft(w) <= 0) return false; useDay(w, what, 0, tag); return true; }

// the day job: whatever you did before the lottery, a day at a time
const DAY_JOBS = {
  mechanic:   { name: 'A shift at Kowalski Auto Repair', pay: 340 },
  accountant: { name: 'Freelance bookkeeping', pay: 400 },
  salesman:   { name: 'A day on the lot at Velocita Motors', pay: 180, sale: [0.35, 700] },
  karting:    { name: 'Instructing at Thunder Alley Karts', pay: 260 },
  simracer:   { name: 'Online sim coaching', pay: 280 },
};
export const dayJob = (w) => DAY_JOBS[w.background] || { name: 'A shift at the Gas-N-Go', pay: 210 };
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
export const gigRating = (w) => (w.gig ??= { rating: 4.8, jobs: 0, stars: [] }).rating;
const themeOf = (w) => TOWNS[w.home]?.theme || 'city';
function newGig(w, kind, o = {}) { return { id: 'g' + (w.nextId++), kind, laps: 1, theme: themeOf(w), ...o }; }
function planWeek(w) {
  const wk = w.week, r = gigRating(w), K = { street: 1, gt: 2.5, formula: 6 }[w.player.series] || 1, broke = w.money.balance < 25000;
  // GigGo: two or three offers (one, under review)
  const n = r < 4.2 ? 1 : r >= 4.8 ? 4 : 3;
  for (let i = 0; i < n; i++) {
    if (i === n - 1 && rng(w) < 0.4) { wk.gigs.push(newGig(w, 'hearse', { client: 'Restwell Funeral Home', title: 'Funeral transport', what: 'Please arrive within the window. The family will be following.', pay: 950, window: [1.3, 1.65] })); continue; }
    const [client, what, fragile, urgent] = pickLine(w, COURIER);
    const fare = Math.round((560 + rng(w) * 440 + (urgent ? 220 : 0)) * (r >= 4.8 ? 1.1 : 1) / 10) * 10;
    wk.gigs.push(newGig(w, 'courier', { client, what, fragile, urgent, title: `${client}: ${what.toLowerCase()}`, pay: fare, laps: rng(w) < 0.4 ? 2 : 1, tight: urgent ? 1.3 : 1.45 }));
  }
  // from GT up: corporate hot laps, and coaching people who've bought a car like yours
  if (seriesById(w.player.series).tier >= 1) { proWeek(w, K); }
  // track days and club events (your race car)
  else if (rng(w) < 0.55) offerGig(w, newGig(w, 'rides', { title: 'Passenger rides', client: 'SV Track Days', pay: 170, tip: 100, laps: 3, riders: [0, 1, 2].map(() => pickLine(w, RIDERS)) }), 'SV Track Days', 'bookings@svtrackdays.sv', 'Passenger rides this week?',
    [`Hi,`, `We've got three customers booked in for passenger rides in a "real race car" this week and our usual driver has done his back in.`, `It's three laps, one passenger a lap. We pay ${money$(170)} a ride, and they tip if they enjoy it. They don't tip if they're sick.`, `Your car, your fuel, your tyres.`, `SV Track Days`]);
  else if (rng(w) < 0.4) offerGig(w, newGig(w, 'attack', { title: 'Time attack', client: `${TOWNS[w.home]?.name || 'Velocita'} Auto Club`, entry: 100, prizes: [2000, 1200, 500], laps: 3 }), `${TOWNS[w.home]?.name || 'Velocita'} Auto Club`, 'events@autoclub.sv', 'Time attack, members and guests',
    [`Our monthly time attack is on this week. Three laps, your best one counts.`, `Prize money: ${money$(2000)} for the gold time, ${money$(1200)} silver, ${money$(500)} bronze. Entry is ${money$(100)}. Guests welcome.`, `Guests welcome. Helmets compulsory.`, `The Committee`]);
  // Danny knows a guy (more often when money's short)
  if (rng(w) < (broke ? 0.5 : 0.22)) {
    const pot = Math.round((1200 + rng(w) * 1600) * (broke ? 1.25 : 1) * K / 100) * 100, who = pickLine(w, ['Vince', 'a guy called Marco', 'Big Steve', 'Tash', 'Dmitri', 'this kid Jayden']);
    offerGig(w, newGig(w, 'street', { title: 'Street race', client: who, pay: pot, laps: 2, night: true, theme: 'city' }), 'Danny', 'dannyboy1979@coolmail.sv', 'friday',
      [`Yo so ${who} wants to race you. Friday night, the industrial estate, two laps`, `${money$(pot)} cash, winner takes it`, `Cops don't really go there. Mostly`]);
  }
  // a sponsor's event
  const deals = dealsOf(w);
  if (deals.length && rng(w) < 0.4) {
    const d = deals[Math.floor(rng(w) * deals.length)], sp = sponsorById(d.sid);
    const what = pickLine(w, ['our grand reopening', 'our summer sale', 'a customer appreciation day', 'our 25th anniversary', 'a charity car wash']);
    mail(w, sp.name, sponsorAddr(sp.name), `Will you come to ${what}?`,
      [`We're having ${what} this week and it would mean a lot to have the team there. Bring the car if you can.`, `Our customers would love to meet a real racing driver. Some of them have asked who you are.`, sp.name],
      { appear: d.sid, choices: [['go', 'Go (a day)'], ['no', 'Not this week']] });
  }
}
function proWeek(w, K) {
  const car = w.car ? w.car.name : 'your car';
  if (rng(w) < 0.6) offerGig(w, newGig(w, 'rides', { title: 'Corporate hot laps', client: 'Velocita Corporate Events', pay: Math.round(400 * K / 10) * 10, tip: Math.round(150 * K / 10) * 10, laps: 3, riders: [0, 1, 2].map(() => pickLine(w, RIDERS)) }), 'Velocita Corporate Events', 'events@velocitacorporate.sv', 'Hot laps for our client',
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
export const gigById = (w, id) => { const wk = weekOf(w); return wk.gigs.find(g => g.id === id) || (wk.offered || []).find(g => g.id === id) || wk.booked.find(g => g.id === id); };
// take one: its day goes now; drive it from the hub's This Week
export function bookGig(w, id) {
  const wk = weekOf(w), g = gigById(w, id);
  if (!g || g.booked) return 'gone';
  if (daysLeft(w) <= 0) return 'nodays';
  if (GIG_KINDS[g.kind].raceCar && needsCar(w)) return 'nocar';
  g.booked = true; wk.booked.push(g); wk.gigs = wk.gigs.filter(x => x !== g);
  if (g.entry) pay(w, -g.entry, `${g.client}: entry fee`);
  useDay(w, GIG_KINDS[g.kind].name, g.entry ? -g.entry : 0, GIG_KINDS[g.kind].tag, g.id);
  return 'ok';
}
export const bookedGigs = (w) => weekOf(w).booked.filter(g => !g.done);
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
// (0..100, hearse/rides), lapTimes, lapComfort, won } -> { rows: [[label, amt]], stars, net, head, line }
export function gigDone(w, id, r) {
  const g = gigById(w, id); if (!g || g.done) return null;
  g.done = true;
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
        line = late > 0 ? `${g.client} expected it ${Math.round((k - g.tight) * r.ref)} seconds sooner.` : broke > 0.05 ? (g.fragile ? 'The customer has sent photos.' : 'Some of it was dented.') : pickLine(w, ['The customer left a thumbs up.', 'Signed for by "J".', 'Left with a neighbour, as requested.']);
      } else {
        const [a, b] = g.window, comfort = r.comfort ?? 100;
        if (k < a) { add('Arrived early', -fare * 0.35); stars -= 1; line = 'You arrived before the family did.'; }
        else if (k > b) { add('Arrived late', -fare * Math.min(0.6, (k - b) * 3)); stars -= 2; line = 'The service started without you.'; }
        if (comfort < 85) { add('Complaint from the family', -fare * (1 - comfort / 100) * 1.5); stars -= comfort < 60 ? 2 : 1; line = line || 'The family has asked for a different driver next time.'; }
        if (r.dmg > 0.03) { add('Bodywork', -Math.min(fare, r.dmg * 2000)); stars -= 1; }
        head = stars >= 4 ? 'A dignified service' : 'Not ideal';
        line = line || 'Restwell would be happy to use you again.';
      }
      const fee = rows.reduce((a, x) => a + x[1], 0) > 0 ? rows.reduce((a, x) => a + x[1], 0) * 0.25 : 0;
      add('GigGo service fee (25%)', -fee); add('Trust & Safety fee', -3);
    }
    rateGig(w, clamp(stars, 1, 5));
  } else if (g.kind === 'rides') {
    const laps = r.lapTimes || [];
    laps.forEach((t, i) => {
      const c = (r.lapComfort || [])[i] ?? 100, quick = r.ref / t; // (1 = the reference pace)
      add(`Ride ${i + 1}: ${g.riders[i].split(',')[0]}`, g.pay);
      if (c < 55) add(`${g.riders[i].split(',')[0]} was sick: refund and cleaning`, -g.pay - 60);
      else if (quick > 0.9) add(`${g.riders[i].split(',')[0]}'s tip`, g.tip * clamp((quick - 0.9) * 8, 0.2, 1) * (c / 100));
    });
    head = laps.length ? `${laps.length} ride${laps.length === 1 ? '' : 's'}` : 'No rides';
    line = laps.length < g.laps ? `You left with ${g.laps - laps.length} customer${g.laps - laps.length === 1 ? '' : 's'} still waiting. SV Track Days refunded them.` : (r.lapComfort || []).some(c => c < 55) ? 'SV Track Days would like to know how the inside of the car is.' : 'SV Track Days say the customers were happy.';
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
      head += ', and the police came'; line = `Three points on your licence (${w.licence} now).`;
      if (w.licence >= 6) { news(w, `${w.teams[w.player.team].name.toUpperCase()} OWNER CAUGHT STREET RACING`, `A Street Cup team owner was among those stopped by police at an industrial estate on Friday night.`); w.rep = clamp(repOf(w) - 6, 0, 100); }
    }
  }
  // your race car paid for it too
  if (GIG_KINDS[g.kind].raceCar && w.car) { wearCar(w, r.lapTimes ? r.lapTimes.length : g.laps, r.dmg || 0, null); if ((r.dmg || 0) > 0.005) add('Repairs', -repairQuote(w, r.dmg)); }
  for (const [t, a] of rows) pay(w, a, `${g.client}: ${/^(GigGo|Trust)/.test(t) ? t : t[0].toLowerCase() + t.slice(1)}`);
  const net = rows.reduce((a, x) => a + x[1], 0);
  if (g.kind === 'street' || (stars != null && stars <= 2 && GIG_KINDS[g.kind].site) || (r.dmg || 0) > 0.15 || (g.kind === 'attack' && net > 0) || (g.kind === 'rides' && (r.lapComfort || []).some(c => c < 55)))
    react(w, 'danny', `The player did a side job this week: ${GIG_KINDS[g.kind].name.toLowerCase()} for ${g.client}${g.what ? ` (${g.what.toLowerCase()})` : ''}. How it went: ${head.toLowerCase()}. ${line} They made ${money$(net)} on it in the end.${(r.dmg || 0) > 0.15 ? ' The vehicle came back damaged.' : ''}`);
  const e = weekOf(w).log.find(x => x.gig === g.id);
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
  for (const g of wk.booked) if (!g.done) {
    if (GIG_KINDS[g.kind].site) rateGig(w, 1);
    else if (g.kind === 'street') texts(w, 'Danny', [`${g.client} says you bottled it`, `I told him you were busy`, `Were you busy`]);
    else mail(w, g.client, 'noreply@svtrackdays.sv', 'Where were you?', [`We had you down for this week and you didn't turn up. We won't be booking you again for a while.`, g.client]);
  }
}
// your own spanners: a rebuild for the price of the parts, and a day
export const selfCost = (w, k) => Math.round(rebuildCost(w, k) * (staffOf(w, 'mechanic') ? 0.45 : 0.3) * (w.background === 'mechanic' ? 0.8 : 1) / 50) * 50;
export function rebuildSelf(w, k) {
  const P = carParts(w); if (!P || daysLeft(w) <= 0) return false;
  const to = (w.background === 'mechanic' ? 0.84 : 0.72) + (rng(w) - 0.5) * 0.1;
  P[k].cond = +Math.max(P[k].cond, clamp(to, 0.4, 0.92)).toFixed(3);
  pay(w, -selfCost(w, k), `${PARTS[k].name}: parts for a rebuild (you did it)`);
  useDay(w, `Rebuilt the ${PARTS[k].name.toLowerCase()} yourself`, -selfCost(w, k), 'Rebuild');
  return true;
}
// a test day at the next round's circuit: track hire, then a practice session (main.js); enough laps and the setup
// is found for that round
export const testCost = (w) => ({ street: 1200, gt: 6000, formula: 25000 }[w.player.series] || 1200);
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
const KS = (w) => ({ street: 1, gt: 3, formula: 9 }[w.player.series] || 1);
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
// 0 (comfortable) .. 1 (desperate)
export function despOf(w) {
  if (!w.money || !w.money.choice) return 0;
  const r = runwayOf(w);
  let d = r < 0 ? 1 : r < 1 ? 0.85 : r < 2 ? 0.65 : r < 4 ? 0.4 : r < 7 ? 0.2 : 0.05;
  if ((w.staff || []).some(x => x.owed > 0)) d += 0.1;
  if (dealsOf(w).some(x => x.misses >= (sponsorById(x.sid)?.patience || 9))) d += 0.05;
  if ((w.loans || []).some(l => l.shark && !l.paid)) d += 0.1;
  return clamp(d, 0, 1);
}
const flag = (w, k) => { (w.flags ??= {})[k] = (w.flags[k] || 0) + 1; };
export const record = (w) => w.flags || {};
export function removeGrey(w) { w.grey = null; }

// ---------- the temptations ----------
// base: weekly chance when desperate enough (scaled by how desperate); min: desperation below which it never comes
const SHADY = ['Volt Rush Energy', 'Cloud Nine Vapor', 'QuickCash Loans', "Lucky Lou's Online Casino"];
const TEMPTS = {
  grey: { base: 0.16, min: 0.2, ok: (w) => w.car && !w.grey && !(w.flags?.greyCaught),
    offer(w) {
      const price = 1200 * KS(w);
      mail(w, 'Danny', 'dannyboy1979@coolmail.sv', 'the chip',
        [`Bro my boy Kev does engine maps. He plugged a laptop into a car at the gas station once and it went faster`, `He says your car's leaving power on the table. ${money$(price)} fitted`, `It's not technically legal. But technically nobody checks at street level. Kev says`],
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
  bet: { base: 0.14, min: 0.3, ok: (w) => !w.bet && !w.over,
    offer(w) {
      const stake = 1500 * KS(w);
      mail(w, 'Danny', 'dannyboy1979@coolmail.sv', 'lenny',
        [`Yo my guy Lenny takes bets on the Street Cup. He's got you at long odds which is kinda disrespectful`, `Top 5 this weekend pays 3 to 1. Or, and I'm only saying this cause Lenny said it, finishing outside the top 8 pays 2 to 1`, `${money$(stake)} stake. Cash`],
        { tempt: 'bet', stake, choices: [['for', 'Bet on yourself: top 5'], ['against', 'Bet against yourself: outside the top 8'], ['no', 'No']] });
    } },
  insure: { base: 0.08, min: 0.6, ok: (w) => w.car && !w.car.lease && !w.fraud && !w.flags?.fraudCaught,
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
    if (d < T.min || !T.ok(w) || (cool[id] || -99) > nowIdx(w) - 4) continue;
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
  if (m.tempt === 'grey') { pay(w, -m.price, 'Engine map (cash)'); w.grey = { uses: 0 }; flag(w, 'grey'); react(w, 'danny', `The player said yes to Danny's idea: Danny's mate Kev fitted an engine map to the race car for ${money$(m.price)} cash. It isn't legal, and the scrutineers might find it.`); return { msg: 'Kev fitted the map. The car pulls harder.' }; }
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
    news(w, `${sp.name.toUpperCase()} JOINS ${w.teams[w.player.team].name.toUpperCase()}`, `The Street Cup team has a new ${slot === 'title' ? 'title ' : ''}partner.`);
    return { msg: `${sp.name} is on board. Their logo needs to be on the car.` };
  }
  if (m.tempt === 'shark') { react(w, 'danny', `The player took a loan from Sal, Danny's cousin: ${money$(m.amt)} now, ${money$(m.back)} back in four rounds.`); pay(w, m.amt, 'Loan (Sal)'); (w.loans ??= []).push({ shark: true, owe: m.back, due: nowIdx(w) + 4, missed: 0, paid: false }); flag(w, 'shark'); return { msg: `${money$(m.amt)} from Sal. ${money$(m.back)} back in four rounds.` }; }
  if (m.tempt === 'bet') { react(w, 'danny', key === 'against' ? `The player put ${money$(m.stake)} with Lenny the bookie on themselves finishing outside the top 8 this weekend. Betting against yourself is against the rules.` : `The player put ${money$(m.stake)} with Lenny the bookie on themselves finishing in the top 5 this weekend.`); pay(w, -m.stake, 'Cash (Lenny)'); w.bet = { type: key, stake: m.stake, key: w.year * 100 + w.round }; flag(w, key === 'against' ? 'betAgainst' : 'betFor'); return { msg: key === 'against' ? 'Lenny has your money. Finish outside the top 8.' : 'Lenny has your money. Finish in the top 5.' }; }
  if (m.tempt === 'insure') {
    pay(w, m.pay, `Insurance: ${w.car.year} ${w.car.name}, total loss (fire)`);
    w.fraud = { since: nowIdx(w), pay: m.pay };
    news(w, `FIRE AT ${(TOWNS[w.home]?.name || 'LOCAL').toUpperCase()} RACING GARAGE`, `A race car was destroyed in a fire overnight. Nobody was hurt. The cause is not yet known.`);
    w.car = null; w.founding.car = false; w.ads = makeAds(w); w.grey = null; flag(w, 'insure');
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
    mail(w, sp.name, sponsorAddr(sp.name), 're: A word about results', [`Thanks for the figures. We hadn't realised the TV audience was that big. We're happy to carry on.`, sp.name]); return { msg: `${sp.name} are happy again.` }; }
  mail(w, sp.name, sponsorAddr(sp.name), 're: A word about results', [`Thanks for being straight with us. We'll see how the next round goes.`, sp.name]);
  return null;
}
// a round's consequences (bill items): scrutineering, bets, the shady sponsor, loans
function temptRound(w, use, me) {
  const items = [], K = KS(w), key = w.year * 100 + w.round, scored = w.series[w.player.series].results.find(x => x.round === w.round), row = scored?.rows.find(r => r.pid === 'P');
  const dsq = (why) => { if (row) { row.pts = 0; row.dnf = true; row.dsq = true; } if (me) { me.dsq = true; me.pts = 0; } w.rep = clamp(repOf(w) - 6, 0, 100); w.scandal = nowIdx(w); };
  if (w.grey) {
    w.grey.uses++;
    if (rng(w) < Math.min(0.035, 0.008 + 0.003 * w.grey.uses)) {
      dsq(); items.push(['Fine: illegal engine software', -2000 * K]); w.grey = null; flag(w, 'greyCaught');
      news(w, `${w.teams[w.player.team].name.toUpperCase()} DISQUALIFIED`, `Scrutineers found unapproved engine software on the car after the race at ${w.series[w.player.series].cal[w.round].name}. The team says it was fitted by a third party.`);
      texts(w, 'Danny', [`So Kev says he's never met you`, `Just so you know`]);
    }
  }
  if (w.bet && w.bet.key === key && me) {
    const b = w.bet, won = b.type === 'for' ? !me.dnf && me.pos <= 5 : me.dnf || me.pos > 8;
    if (won) items.push([`Cash (Lenny): ${b.type === 'for' ? '3 to 1' : '2 to 1'}`, b.stake * (b.type === 'for' ? 4 : 3)]);
    if (won && rng(w) < (b.type === 'against' ? 0.12 : 0.03)) {
      items.push(['Fine: betting on your own race', -3000 * K]); dsq(); flag(w, 'betCaught');
      news(w, `INTEGRITY UNIT LOOKS AT ${w.teams[w.player.team].name.toUpperCase()}`, `Street Cup officials are looking into betting on the ${w.series[w.player.series].cal[w.round].name} round. ${w.player.name} has been fined and their result removed.`);
    }
    w.bet = null;
  }
  // loans: the bank's instalments; Sal's due date
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
    news(w, `${w.teams[w.player.team].name.toUpperCase()}'S AUDIENCE FIGURES "DON'T ADD UP"`, `The Paddock Wire has seen sponsorship reports claiming TV audiences larger than the Street Cup's actual broadcast reach.`);
    for (const d of lied) { const sp = sponsorById(d.sid); mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`We've read the article. We're ending our sponsorship, effective immediately, and our lawyers will be in touch about the figures.`, sp.name]); }
    w.deals = dealsOf(w).filter(d => !d.lied); w.rep = clamp(repOf(w) - 8, 0, 100); w.lies = 0; w.scandal = nowIdx(w); flag(w, 'liesCaught');
  }
  if (w.fraud && !w.fraud.closed) {
    if (nowIdx(w) - w.fraud.since > 4) { w.fraud.closed = true; mail(w, 'Velocita Mutual Insurance', 'claims@velocitamutual.sv', 'Your claim: closed', [`Our investigation into the fire at your premises is now closed. The cause has been recorded as electrical.`, `Velocita Mutual`]); }
    else if (rng(w) < 0.08) {
      w.fraud.closed = true; flag(w, 'fraudCaught');
      pay(w, -w.fraud.pay - 5000 * KS(w), 'Insurance claim reversed, and a fine');
      news(w, `TEAM OWNER CHARGED OVER GARAGE FIRE`, `${w.player.name}, owner of ${w.teams[w.player.team].name}, has been charged with insurance fraud. A fuel can and a receipt were recovered from the scene.`);
      for (const d of dealsOf(w).slice()) if (rng(w) < 0.6) { const sp = sponsorById(d.sid); w.deals = dealsOf(w).filter(x => x !== d); mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`In light of the news, we're ending our sponsorship.`, sp.name]); }
      w.rep = clamp(repOf(w) - 15, 0, 100); w.scandal = nowIdx(w);
    }
  }
}
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
        [`I watched your car this weekend. Brave colours.`, `In my experience teams like yours last about a season and a half. I hope you're the exception.`, `If you'd like to sell your entry before then, do let me know. I'd give you a fair price for it, which is to say not much.`, `${R.name[0]} ${R.name[1]}`, `Team Owner, ${t.name}`]);
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
        news(w, `${w.rival.name[1].toUpperCase()}: NEWCOMERS "GOOD FOR THE SPORT, IN MODERATION"`, `The ${t.name} owner says the Street Cup has "room for everyone, for a while".`);
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
        [scandal ? `I'm writing about this week's news and I'd like to give you the chance to respond.` : `I'm writing a piece on the new teams in the Street Cup and I'd like to spend a day with yours.`, `It would mean a day of your week. I'd be fair.`, JOURNO[0], 'The Paddock Wire'],
        { arc: a.id, choices: [['yes', 'Yes (a day)'], ...(w.rival ? [['tip', `Off the record: tell her about ${w.rival.name[1]}`]] : []), ['no', 'Decline']] });
    },
    step() {},
    answer(w, a, m, key) {
      a.wait = null; a.done = true;
      const team = w.teams[w.player.team].name;
      if (key === 'yes') {
        if (daysLeft(w) <= 0) { a.done = false; a.wait = m.id; return { err: 'No days left this week. Ask her for next week instead.' }; }
        useDay(w, 'An interview with The Paddock Wire', 0, 'Interview'); w.press = pressOf(w) + 2; w.rep = clamp(repOf(w) + 2, 0, 100);
        news(w, `INSIDE ${team.toUpperCase()}: LOTTERY MONEY AND A LOT OF TYRES`, `"Everyone said I'd lose the lot," says the owner-driver. "I'm a bit behind schedule on that."`);
        return { msg: 'The piece comes out this week.' };
      }
      if (key === 'tip') {
        w.press = pressOf(w) + 1;
        news(w, `${w.rival.name[1].toUpperCase()}'S TEAM "RUNS ON INHERITANCE", SAYS PADDOCK SOURCE`, `A source close to the Street Cup says ${w.teams[w.rival.tid].name} has never turned a profit.`);
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
        [`Yo so the tyre place on Route 9 offered me a job. Assistant manager. Dental plan and everything`, `Told them I'd think about it. I thought about it a little. I don't wanna go`, `But you owe me ${money$(x.owed)} and my landlord doesn't know what a racing team is`],
        { arc: a.id, choices: [['pay', `Pay him the ${money$(x.owed)}`], ['wait', 'Ask him to hang on'], ['go', 'Tell him to take the job']] });
    },
    step(w, a) {
      if (a.asked && !a.wait) { // (he hung on once; it's still not paid)
        const x = (w.staff || []).find(s => s.danny);
        if (x && x.owed > 0) { fireStaff(w, x.id); texts(w, 'Danny', [`Took the tyre job`, `Still your boy. Still owed ${money$(x.owed)} but whatever`, `Come by and I'll hook you up on tyres`]); w.dannyGone = true; }
        a.done = true;
      }
    },
    answer(w, a, m, key) {
      const x = (w.staff || []).find(s => s.danny); a.wait = null;
      if (!x) { a.done = true; return null; }
      if (key === 'pay') { if (w.money.balance < x.owed) return (a.wait = m.id, { err: "You don't have it." }); payBack(w, x.id); x.morale = 100; w.dannyLoyal = true; a.done = true; texts(w, 'Danny', [`You're a real one`, `Told the tyre guy no. He said "ok" which kinda hurt`]); return { msg: 'Danny stays.' }; }
      if (key === 'wait') { a.asked = true; a.at = nowIdx(w) + 2; x.morale = clamp(x.morale - 10, 0, 100); return { msg: 'Danny will wait. For a bit.' }; }
      fireStaff(w, x.id); w.dannyGone = true; a.done = true; texts(w, 'Danny', [`All good, no hard feelings`, `I'll still send you stuff I find on SVList`]); return { msg: 'Danny has taken the tyre job.' };
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
        if (daysLeft(w) <= 0) { a.done = false; a.wait = m.id; return { err: 'No days left this week.' }; }
        useDay(w, `${ex}'s wedding`, 0, 'Wedding'); text(w, ex, `thank you for coming. brian says if you ever need a sponsor his business does bathrooms`);
        const i = SPONSOR_POOL.findIndex(s => s[0] === "Brian's Bathrooms & Kitchens");
        if (i >= 0 && dealsOf(w).length < SPONSOR_SLOTS.length) mail(w, "Brian's Bathrooms & Kitchens", 'brian@briansbathrooms.sv', 'Sponsorship', [`Great to see you at the wedding. ${ex} says you're a good driver, which I took on trust.`, `We'd like to put our name on your car. ${money$(Math.round(1300 * KS(w) * ASSOC_K / 50) * 50)} a round.`, 'Brian'],
          { sponsorOffer: { sid: 'sp' + i, slot: 'assoc', fee: Math.round(1300 * KS(w) * ASSOC_K / 50) * 50, bonus: Math.round(1300 * KS(w) * ASSOC_K * 0.6 / 50) * 50 }, choices: [['yes', 'Accept'], ['no', 'Decline']] });
        return { msg: 'You went. It was fine. It was nice, actually.' };
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
  adviser(w); consequences(w);
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
    + payrollDue(w) + (m && m.wage && m.pay !== 'hold' ? m.wage : 0) + (w.loans || []).filter(l => !l.paid && !l.shark).reduce((a, l) => a + l.per, 0);
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
    const g = storyGoal(w); if (g) targets.push({ text: g.text, who: rivalName(w) || 'Rivalry' });
    if (raced && i > 0) { const gap = st[i - 1].pts - st[i].pts; targets.push({ text: gap ? `Close the ${gap}-point gap to P${i}` : `Get ahead of P${i}: you're level on points`, who: 'Championship' }); }
    else if (raced && i === 0 && st[1]) targets.push({ text: `Stay ahead: P2 is ${st[0].pts - st[1].pts} point${st[0].pts - st[1].pts === 1 ? '' : 's'} behind`, who: 'Championship' });
    for (const x of bookedGigs(w)) targets.push({ text: `Drive the ${GIG_KINDS[x.kind].name.toLowerCase()} you booked`, who: x.client });
  }
  // what's going wrong (worst first)
  const r = runwayOf(w), cost = w.over ? 0 : weekendCost(w);
  if (w.money.balance < 0) watch.push({ text: `Overdrawn by ${money$(-w.money.balance)}: the bank charges 1.5% a round plus $250`, bad: true });
  else if (!w.over && w.money.balance < cost) watch.push({ text: `This weekend costs about ${money$(cost)}. You have ${money$(w.money.balance)}`, bad: true });
  if (w.money.balance >= 0 && r < 4) watch.push({ text: `At this rate the money lasts about ${Math.max(0, Math.floor(r))} more round${Math.floor(r) === 1 ? '' : 's'}`, bad: r < 2 });
  if (payrollShort(w)) watch.push({ text: `Payroll is ${money$(payrollDue(w))}: not enough to pay everyone`, bad: true });
  for (const x of (w.staff || [])) if (x.owed > 0) watch.push({ text: `You owe ${x.first} ${money$(x.owed)} in wages`, bad: x.owed >= wageNow(w, x) * 2 });
  for (const l of (w.loans || [])) if (l.shark && !l.paid) watch.push({ text: `Sal wants ${money$(l.owe)}${nowIdx(w) >= l.due ? ' now' : ` in ${l.due - nowIdx(w)} round${l.due - nowIdx(w) === 1 ? '' : 's'}`}`, bad: true });
  for (const d of dealsOf(w)) {
    const sp = sponsorById(d.sid);
    if (w.logoShown && !w.logoShown.includes(d.sid)) watch.push({ text: `${sp.name}'s logo isn't on the car: they won't pay`, bad: true });
    else if (!d.shady && d.misses >= sp.patience) watch.push({ text: `${sp.name}: miss this target and they walk`, bad: true });
  }
  const P = carParts(w);
  if (P) for (const k of PART_KEYS.slice().sort((a, b) => P[a].cond - P[b].cond)) if (P[k].cond < 0.5) watch.push({ text: `${PARTS[k].name} at ${Math.round(P[k].cond * 100)}%${PARTS[k].fail ? ': could fail in a race' : ''}`, bad: P[k].cond < 0.3 });
  if (!w.over && w.car && !staffOf(w, 'manager')) { const need = tyreNeeds(w), sk = stockOf(w); if (sk.soft < 1 || sk.medium < 1) watch.push({ text: `Low on tyres: trackside sets cost ${Math.round((TRACKSIDE - 1) * 100)}% more`, bad: false }); }
  if (w.grey) watch.push({ text: `Kev's engine map is on the car: scrutineers could find it`, bad: false });
  if (w.founding?.reg && needsCar(w)) watch.push({ text: w.car ? `You need a car for the ${seriesById(w.player.series).name}` : `You don't have a car`, bad: true });
  const ask = (w.mail || []).filter(m => m.choices && !m.answer && !m.lottery).length;
  if (ask) watch.push({ text: `${ask} email${ask === 1 ? '' : 's'} waiting for an answer`, bad: false });
  if (gigRating(w) < 4.2) watch.push({ text: `GigGo has your account under review (${gigRating(w).toFixed(2)}): fewer jobs`, bad: false });
  watch.sort((a, b) => b.bad - a.bad);
  // what to build up
  const n = st.length, up = SERIES[seriesById(sid).tier + 1], fund = SEASON_FUND[sid];
  goals.push({ label: 'Championship', value: raced ? `P${pos}` : '—', pct: raced ? (n - pos) / Math.max(1, n - 1) : 0 });
  const rep = repOf(w), next = SPONSOR_POOL.map((x, k) => sponsorById('sp' + k)).filter(x => x.rep > rep && x.rep < 999 && (!x.town || x.town === w.home)).sort((a, b) => a.rep - b.rep)[0];
  goals.push({ label: 'Reputation', value: STAND_WORDS(rep), pct: rep / 100 });
  goals.push({ label: 'Money', value: money$(w.money.balance), pct: clamp(r / 12, 0, 1) });
  // what you're saving for: what the series above asks for, else the next thing for the garage
  const sv = savingFor(w);
  if (sv) goals.push({ label: 'Saving for', value: sv.name, pct: clamp(w.money.balance / sv.cost, 0, 1) });
  // the hint: what each one is for, in a line
  const hints = [];
  if (up) hints.push(raced && pos <= 3 ? `Stay in the top 3 for a ${up.name} offer.` : `Top 3 at the end earns a ${up.name} offer${raced && fund[pos - 1] ? ` (P${pos} pays ${money$(fund[pos - 1])})` : ''}.`);
  // (money first when it's running out, else what reputation unlocks)
  if (r < 6) hints.unshift(`Money lasts about ${Math.max(0, Math.floor(r))} round${Math.floor(r) === 1 ? '' : 's'}: work the week, keep your sponsors.`);
  else if (sv && sv.why) hints.push(sv.why);
  else if (next) hints.push(`At reputation ${next.rep} bigger sponsors call (you're at ${rep}).`);
  const hint = hints.slice(0, 2).join(' ');
  return { targets, watch, goals, hint };
}

// the next thing worth saving for: { name, cost, why }
export function savingFor(w) {
  const t = myTeam(w), up = SERIES[seriesById(w.player.series).tier + 1], to = w.player.offer?.answer === 'move' ? w.player.offer.to : up?.id;
  const miss = to ? seriesMissing(t, to) : [];
  if (miss.length) {
    const cost = miss.reduce((a, [k, n]) => { let c = 0; for (let l = facLevel(t, k) + (k === 'base' ? 1 : 0); l <= (k === 'base' ? n : n - 1); l++) c += FACILITIES[k].levels[l][1]; return a + c; }, 0);
    return { name: miss.map(([k, n]) => needName(k, n).replace(/^an? /, '')).join(' + '), cost, why: `The ${seriesById(to).name} needs ${miss.map(([k, n]) => needName(k, n)).join(' and ')}: ${money$(cost)}.` };
  }
  const opts = FAC_KEYS.map(k => ({ k, nx: facNext(t, k) })).filter(x => x.nx && x.k !== 'tunnel' && facLevel(t, 'base') >= x.nx.needsBase).sort((a, b) => a.nx.cost - b.nx.cost);
  return opts[0] ? { name: opts[0].nx.name, cost: opts[0].nx.cost, why: '' } : null;
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
    const fee = 15000, biz = pickLine(w, ['Carpets & Flooring', 'Discount Mattresses', 'Lawn Ornaments', 'Premium Gutters', 'Self Storage']);
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
  mail(w, 'Danny', 'dannyboy1979@coolmail.sv', 'found you a car',
    [`Yo. Saw the lottery thing on the news. Congrats dude, for real`, `Also saw the divorce thing on the news. Less congrats`,
     `Anyway if you're doing the racing team thing you need a car. There's some good ones on the classifieds rn. The cheap one's probably fine. Probably`,
     `Ps I could be your team manager. I've managed a team before (fantasy football, 2nd place)`],
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
  react(w, 'danny', `The player just bought their race car off the classifieds: a ${ad.year} ${ad.name} in ${condWord(ad.cond).toLowerCase()} condition, ${Math.round(ad.miles / 1000)}k miles, for ${money$(ad.price)}, from a seller called ${ad.seller}. Danny found the listings for them.`);
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
  const D = w.car.dev || {}, wk = w.week && w.week.key === weekKey(w) ? w.week : null;
  return { power: (0.9 + 0.1 * c('engine')) * (1 + sum('power')) * (1 + (D.power || 0)) * (w.grey ? 1.04 : 1) * bopOf(w) * (1 - ballastOf(w) * 0.0006), // (Kev's engine map; GT's balance of performance and success ballast)
    grip: (0.96 + 0.04 * c('suspension')) * (1 + sum('grip')) * (1 + (D.grip || 0)) * (wk && wk.setup ? 1.012 : wk && wk.sim ? 1 + 0.004 * wk.sim : 1), // (a test day found the setup; or the sim rig, some of it)
    brake: (0.9 + 0.1 * c('brakes')) * (1 + sum('brake')) * (1 + (D.brake || 0)),
    downforce: (1 + sum('downforce')) * (1 + (D.downforce || 0)), drag: 1 + sum('drag'), damage: (1.15 - 0.15 * c('chassis')) * (1 + sum('damage')), rainGrip: 1, wear: 1, slip: 1, softs: false, launch: false };
}
const mechFactor = (w) => { const m = staffOf(w, 'mechanic'); return m ? (1.2 - 0.08 * m.skill) * (m.morale < 35 ? 1.3 : 1) : 1.25; };
// the chance each part fails this race (0..1)
export function failOdds(w) {
  const P = carParts(w), out = {}; if (!P) return out;
  for (const k of PART_KEYS) { const p = PARTS[k]; if (!p.fail) continue; out[k] = clamp(p.fail * (1 - P[k].cond) ** 2 * (P[k].fit ? 1.6 - P[k].fit.q : 1) * mechFactor(w) * (w.car.rel || 1) * (1 - (w.car.dev?.rel || 0)), 0, 0.5); }
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
  // (a leased car's engine and gearbox go back to the programme between rounds, and come back rebuilt)
  if (w.car.lease) for (const k of ['engine', 'gearbox']) P[k].cond = Math.max(P[k].cond, 0.9);
}
// work on a part: a rebuild (your mechanic, or a shop) or a new one
export const rebuildCost = (w, k) => Math.round(PARTS[k].cost * COSTS[w.player.series].repair * (staffOf(w, 'mechanic') ? 1 : 1.5) * (bgOf(w).repair || 1) * (1 - 0.1 * facLevel(myTeam(w), 'tools')) / 50) * 50;
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
  // GT: homologated parts only (the cars are balanced, so the gains are small and dear)
  gt: [
    ['engine', 'Evo engine map (homologated)', { power: 0.012 }, 1, 9000], ['engine', 'Lightweight flywheel', { power: 0.008 }, 0.92, 6500],
    ['gearbox', 'Sequential gearbox', { power: 0.008 }, 0.9, 28000], ['gearbox', 'Quick-change ratios', { power: 0.004 }, 1, 8000],
    ['suspension', 'Customer-spec dampers', { grip: 0.015 }, 0.95, 16000], ['suspension', 'Adjustable anti-roll bars', { grip: 0.008 }, 1, 7000],
    ['brakes', 'Carbon brakes', { brake: 0.08 }, 0.9, 22000], ['brakes', 'Endurance pads', { brake: 0.03 }, 1, 3500],
    ['aero', 'Evo aero kit', { downforce: 0.08, drag: 0.01 }, 1, 30000], ['aero', 'Gurney flap', { downforce: 0.03, drag: 0.004 }, 1, 2500],
    ['chassis', 'Lightweight body panels', { grip: 0.01, damage: 0.05 }, 0.9, 18000], ['chassis', 'FIA-spec roll cage', { damage: -0.15 }, 1, 12000],
  ],
};
const PRICE_K = { street: 1, gt: 3, formula: 9 };
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
  const sellers = w.player.series === 'street' ? AD_SELLERS : w.series[w.player.series].teams.filter(t => t !== w.player.team).map(t => w.teams[t].name);
  w.usedParts = [];
  for (let i = 0; i < 5; i++) {
    const [slot, name, gains, q0, price] = kits[Math.floor(rng(w) * kits.length)], luck = 0.25 + rng(w) * 1.1;
    w.usedParts.push({ id: 'up' + (w.nextId++), slot, name, gains: Object.fromEntries(Object.entries(gains).map(([s, v]) => [s, +(v * luck).toFixed(4)])),
      q: +clamp(q0 - 0.15 - rng(w) * 0.45, 0.2, 0.95).toFixed(2), price: Math.round(price * k * (0.3 + rng(w) * 0.3) / 50) * 50, used: true, blurb: pickLine(w, w.player.series === 'street' ? USED_BLURB : USED_BLURB_PRO), seller: pick(w, sellers) });
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
export function buyFit(w, part) {
  const P = carParts(w); if (!P || isFitted(w, part)) return false;
  const m = staffOf(w, 'mechanic'), fee = m ? 0 : 400;
  pay(w, -(part.price + fee), `${part.name}${part.used ? ' (used, SVList)' : ''}${fee ? ' + fitting at a shop' : ''}`);
  P[part.slot].fit = { name: part.name, gains: part.gains, q: part.q, used: part.used, claim: part.claim || null, feel: feelOf(w, part), measured: null };
  if (part.used) w.usedParts = (w.usedParts || []).filter(x => x.id !== part.id);
  if (rng(w) < 0.5) react(w, 'danny', `The player just bought and fitted a ${part.name} (${PARTS[part.slot]?.name.toLowerCase() || 'part'}) for ${money$(part.price)}${part.used ? ', second-hand off SVList' : ''}.`);
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
  payMate(w);
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
      items.push([`${sp.name}: logo not on the car, not paid`, 0]);
      d.misses++; d.hidden = (d.hidden || 0) + 1; w.rep = clamp(repOf(w) - 2, 0, 100);
      if (d.hidden >= 2) { w.deals = deals.filter(x => x !== d); w.rep = clamp(repOf(w) - 4, 0, 100); mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`Our logo still isn't on your car. We're paying for exposure we aren't getting, so we're ending the sponsorship.`, sp.name]); }
      else mail(w, sp.name, sponsorAddr(sp.name), 'Where is our logo?', [`We watched the race and couldn't find our logo on the car. We don't pay for a round we weren't seen in.`, `Please have it on the car by the next round.`, sp.name]);
      d.obj = null; continue;
    }
    // (the shady ones: no targets, paid a round late, and one day they're gone)
    if (d.shady) {
      if (d.owed) items.push([`${sp.name} (last round's invoice)`, d.owed]);
      d.owed = d.fee; d.obj = null;
      if (rng(w) < 0.1) { w.deals = dealsOf(w).filter(x => x !== d); news(w, `${sp.name.toUpperCase()} COLLAPSES`, `${sp.name} has gone into administration owing money to suppliers, including a Street Cup team.`); items.push([`${sp.name}: in administration (this round's ${money$(d.owed)} unpaid)`, 0]); flag(w, 'shadyCollapse'); }
      continue;
    }
    items.push([`${sp.name} (${d.slot === 'title' ? 'title sponsor' : 'associate'})`, d.fee]);
    if (met) { items.push([`${sp.name} bonus: ${objText(w, o).toLowerCase()}`, d.bonus]); d.met++; w.rep = clamp(repOf(w) + 1, 0, 100); }
    else {
      d.misses++; w.rep = clamp(repOf(w) - 1, 0, 100);
      if (d.misses >= sp.patience + 1) {
        w.deals = deals.filter(x => x !== d);
        mail(w, sp.name, sponsorAddr(sp.name), 'Our partnership', [`We've reviewed our sponsorship of ${w.teams[w.player.team].name} and decided to end it, effective immediately.`, `We wish you the best for the rest of the season.`, sp.name]);
        w.rep = clamp(repOf(w) - 4, 0, 100);
      } else if (d.misses === sp.patience) mail(w, sp.name, sponsorAddr(sp.name), 'A word about results', [`We were hoping for more by now. ${d.met} of ${d.met + d.misses} targets met so far.`, `Before we decide anything, could you send us your exposure figures for the season: TV audience, attendance, social media?`, sp.name],
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
// a few texts in a row, the way people send them (filed last-first: the phone's inbox has the newest on top, so they
// read top to bottom)
export function texts(w, from, lines) { for (const l of lines.slice().reverse()) text(w, from, l); }
export const unread = (w) => w.msgs.filter(m => !m.read).length;
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

// the Paddock Wire's articles (js/wpress.js) get these to work with
const PRESS_KIT = { SERIES, seriesById, standings: (w, sid) => standings(w, sid), teamStandings: (w, sid) => teamStandings(w, sid), teamOfPid: (w, pid) => teamOfPid(w, pid),
  ageOf: (w, p) => ageOf(w, p), DIRTY, news: (w, h, b, x) => news(w, h, b, x), pick: (w, a) => pickLine(w, a), rng: (w) => rng(w) };
function roundNews(w, me) {
  const sid = w.player.series;
  if (!(w.pre && w.year < START_YEAR - 2)) roundPress(w, PRESS_KIT);
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
    // (messages the old character voices reworded: back to how they were written)
    for (const m of [...(w.msgs || []), ...w.mail]) if (m.orig) { m.body = Array.isArray(m.body) ? m.orig.split(/\n\s*\n/) : m.orig; delete m.orig; delete m.voiced; }
    return w;
  } catch (e) { return null; }
}
export function deleteWorld(id) { localStorage.removeItem(slot(id)); localStorage.setItem(INDEX, JSON.stringify(readIndex().filter(e => e.id !== id))); }
