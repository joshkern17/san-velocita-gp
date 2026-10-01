// Career (roguelike season) + Grand Prix (plain championship)
import { presetTracks } from './track.js';
import { TEAMS } from './car.js';

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const PRIZE = [500, 380, 300, 240, 190, 150, 120, 100, 80, 65, 50, 40]; // $k by finishing position

export const UPGRADES = {
  engine:  { label: 'Engine',          desc: '+2.5% power per level' },
  aero:    { label: 'Aero',            desc: '+4% downforce per level' },
  grip:    { label: 'Suspension',      desc: '+1.5% mechanical grip per level' },
  tyres:   { label: 'Tyre Management', desc: '-10% tyre wear per level' },
  armour:  { label: 'Durability',      desc: '-15% damage per level' },
  crew:    { label: 'Pit Crew',        desc: '-0.4s per pit stop per level' },
};
export const MAX_LEVEL = 5;
export const upgradeCost = (lvl) => [250, 450, 700, 1000, 1400][lvl] ?? Infinity;

export const PERKS = {
  slip:     { name: 'Slipstream King',   desc: 'Slipstream is 60% stronger for you.', tag: 'RACECRAFT' },
  whisper:  { name: 'Tyre Whisperer',    desc: 'Your tyres wear 20% slower.', tag: 'TYRES' },
  rain:     { name: 'Rain Dancer',       desc: '+6% grip whenever it is wet.', tag: 'WEATHER' },
  wizards:  { name: 'Pit Wizards',       desc: 'Pit stops are 1 second quicker.', tag: 'PITS' },
  glass:    { name: 'Glass Cannon',      desc: '+3% grip, but you take 80% more damage.', tag: 'RISKY' },
  hotmotor: { name: 'Hot Motor',         desc: '+4% power, but tyres wear 20% faster.', tag: 'RISKY' },
  frenzy:   { name: 'Sponsor Frenzy',    desc: 'All prize money +40%.', tag: 'MONEY' },
  lucky:    { name: 'Lucky Charm',       desc: 'Gain an extra star (up to 4).', tag: 'SAFETY', once: true },
  launch:   { name: 'Launch Control',    desc: '+25% power for the first 6 seconds of each race.', tag: 'STARTS' },
  df:       { name: 'Downforce Freak',   desc: '+6% downforce, +2% drag.', tag: 'AERO' },
  rep:      { name: 'Good Reputation',   desc: 'The Team Principal expects one place less every round.', tag: 'SAFETY' },
  brakes:   { name: 'Late Braker',       desc: 'Your brakes are 6% stronger.', tag: 'RACECRAFT' },
  iron:     { name: 'Iron Chassis',      desc: 'You take 40% less damage.', tag: 'SAFETY' },
  softs:    { name: 'Fresh Rubber',      desc: 'Start every race on Softs with 2% more grip.', tag: 'TYRES' },
  gamble:   { name: "Engineer's Gamble", desc: 'Instantly gain a free upgrade level (random).', tag: 'UPGRADE', once: true },
  cash:     { name: 'Cash Injection',    desc: 'Instantly receive $400k.', tag: 'MONEY', once: true },
};

const rnd = (seedObj) => { seedObj.s = (seedObj.s * 16807) % 2147483647; return (seedObj.s - 1) / 2147483646; };
const shuffle = (a, R) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------------- new runs ----------------
export function newCareer({ rounds = 4, hard = false, laps = 5, pool = null } = {}) {
  const seed = { s: (Date.now() % 2147483646) + 1 };
  const R = () => rnd(seed);
  const tracks = pool && pool.length ? pool : presetTracks();
  const sched = [];
  const order = shuffle(tracks.map((_, i) => i), R);
  for (let r = 0; r < rounds; r++) {
    const t = JSON.parse(JSON.stringify(tracks[order[r % order.length]]));
    // random conditions (weighted towards dry days)
    const x = R();
    t.env.time = x < 0.55 ? 'day' : x < 0.8 ? 'dusk' : 'night';
    const w = R();
    t.env.weather = w < 0.62 ? 'clear' : w < 0.8 ? 'overcast' : w < 0.94 ? 'rain' : 'fog';
    sched.push(t);
  }
  return base('career', sched, { hard, laps, stars: 3, money: 300, upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])), perks: [], seed: seed.s });
}

export function newGrandPrix({ tracks, laps = 5, difficulty = 'medium' }) {
  return base('gp', tracks.map(t => JSON.parse(JSON.stringify(t))), { laps, difficulty });
}

function base(kind, schedule, extra) {
  const seed = { s: (Date.now() % 2147483646) + 7 };
  // team strength varies a little across the season (some teams are just better)
  const teamPace = TEAMS.map(() => 0.985 + rnd(seed) * 0.03);
  return {
    kind, schedule, round: 0, standings: {}, results: [], teamPace, history: [],
    created: Date.now(), over: false, fired: false, ...extra,
  };
}

// ---------------- per-round settings ----------------
export function roundDifficulty(c) {
  if (c.kind === 'gp') return c.difficulty;
  const t = c.schedule.length > 1 ? c.round / (c.schedule.length - 1) : 1;
  const ladder = c.hard ? ['hard', 'hard', 'alien', 'alien'] : ['easy', 'medium', 'medium', 'hard'];
  return ladder[Math.min(ladder.length - 1, Math.floor(t * ladder.length))];
}
export function roundTarget(c, field = 12) {
  if (c.kind !== 'career') return null;
  const t = c.schedule.length > 1 ? c.round / (c.schedule.length - 1) : 1;
  let target = Math.round(Math.min(field - 2, 8) + (3 - Math.min(field - 2, 8)) * t);
  if (hasPerk(c, 'rep')) target += 1;
  return Math.max(1, Math.min(field, target));
}
export const hasPerk = (c, k) => (c.perks || []).includes(k);

// physics / race modifiers for the player car from upgrades + perks
export function playerMods(c) {
  if (c.kind !== 'career') return null;
  const u = c.upgrades, p = (k) => hasPerk(c, k);
  return {
    power: (1 + 0.025 * u.engine) * (p('hotmotor') ? 1.04 : 1),
    downforce: (1 + 0.04 * u.aero) * (p('df') ? 1.06 : 1),
    drag: p('df') ? 1.02 : 1,
    grip: (1 + 0.015 * u.grip) * (p('glass') ? 1.03 : 1),
    wear: Math.pow(0.9, u.tyres) * (p('whisper') ? 0.8 : 1) * (p('hotmotor') ? 1.2 : 1),
    damage: Math.pow(0.85, u.armour) * (p('glass') ? 1.8 : 1) * (p('iron') ? 0.6 : 1),
    pitTime: -0.4 * u.crew - (p('wizards') ? 1 : 0),
    slip: p('slip') ? 1.6 : 1,
    rainGrip: p('rain') ? 1.06 : 1,
    brake: p('brakes') ? 1.06 : 1,
    launch: p('launch'),
    softs: p('softs'),
  };
}

// grid: round 1 random-ish from the back, afterwards championship order (leader on pole)
export function gridOrder(c, names) {
  if (c.round === 0) return null;
  const pts = (n) => c.standings[n]?.pts ?? 0;
  return [...names].sort((a, b) => pts(b) - pts(a));
}

// ---------------- after a race ----------------
// aidPct: Career prize bonus (%) for racing with fewer driver aids (aids.js aidBonus)
export function recordRound(c, results, playerStartPos, aidPct = 0) {
  const fastest = results.reduce((b, r) => (isFinite(r.best) && (!b || r.best < b.best) ? r : b), null);
  const rows = results.map((r, k) => {
    // (retired or disqualified: no points, even in a small field)
    const out = r.dnf || r.dsq;
    const pts = k < 10 && !out ? POINTS[k] : 0;
    const fl = fastest && r === fastest && k < 10 && !out ? 1 : 0;
    return { name: r.name, team: r.team, color: r.color, isPlayer: r.isPlayer, pos: k + 1, pts: pts + fl, fl: !!fl, pen: r.pen || 0, dt: r.dt || 0, dsq: !!r.dsq };
  });
  for (const r of rows) {
    const s = c.standings[r.name] || (c.standings[r.name] = { name: r.name, team: r.team, color: r.color, isPlayer: r.isPlayer, pts: 0, wins: 0, podiums: 0 });
    s.pts += r.pts; if (r.pos === 1) s.wins++; if (r.pos <= 3) s.podiums++;
  }
  const me = rows.find(r => r.isPlayer);
  const out = { round: c.round, track: c.schedule[c.round].name, rows, player: me };
  if (c.kind === 'career' && me) {
    // money
    const pr = results.find(r => r.isPlayer);
    const prize = PRIZE[me.pos - 1] ?? 30;
    const gained = Math.max(0, (playerStartPos || me.pos) - me.pos) * 15;
    const flBonus = me.fl ? 60 : 0;
    const clean = pr && pr.cleanFinish ? 40 : 0;
    const aids = Math.round((prize + gained + flBonus + clean) * aidPct / 100);
    let total = prize + gained + flBonus + clean + aids;
    if (hasPerk(c, 'frenzy')) total = Math.round(total * 1.4);
    c.money += total;
    out.money = { prize, gained, flBonus, clean, aids, aidPct, total, frenzy: hasPerk(c, 'frenzy') };
    // expectations
    const target = roundTarget(c, results.length);
    out.target = target;
    out.hit = me.pos <= target;
    if (!out.hit) { c.stars -= 1; out.starLost = true; }
    if (c.stars <= 0) { c.over = true; c.fired = true; }
  }
  c.results.push(out);
  c.round++;
  if (c.round >= c.schedule.length) c.over = true;
  return out;
}

export function standingsList(c) {
  return Object.values(c.standings).sort((a, b) => b.pts - a.pts || b.wins - a.wins);
}

// three random perk cards (no duplicates of perks you already own)
export function drawCards(c, n = 3) {
  const seed = { s: (c.seed || 1) + c.round * 7919 };
  const R = () => rnd(seed);
  return shuffle(Object.keys(PERKS).filter(k => !c.perks.includes(k)), R).slice(0, n);
}
export function takePerk(c, k) {
  c.perks.push(k);
  if (k === 'lucky') c.stars = Math.min(4, c.stars + 1);
  if (k === 'cash') c.money += 400;
  if (k === 'gamble') {
    const opts = Object.keys(UPGRADES).filter(u => c.upgrades[u] < MAX_LEVEL);
    if (opts.length) c.upgrades[opts[Math.floor(Math.random() * opts.length)]]++;
  }
}
export function buyUpgrade(c, k) {
  const lvl = c.upgrades[k], cost = upgradeCost(lvl);
  if (lvl >= MAX_LEVEL || c.money < cost) return false;
  c.money -= cost; c.upgrades[k]++;
  return true;
}

// ---------------- persistence ----------------
const KEY = 'svgp.career';
export function saveRun(c) { try { localStorage.setItem(KEY + '.' + c.kind, JSON.stringify(c)); } catch (e) {} }
export function loadRun(kind) { try { return JSON.parse(localStorage.getItem(KEY + '.' + kind)); } catch (e) { return null; } }
export function clearRun(kind) { localStorage.removeItem(KEY + '.' + kind); }
export function recordHistory(c) {
  try {
    const h = JSON.parse(localStorage.getItem('svgp.careerHistory') || '[]');
    const me = standingsList(c).findIndex(s => s.isPlayer) + 1;
    h.unshift({ date: Date.now(), kind: c.kind, rounds: c.results.length, of: c.schedule.length, champPos: me, fired: c.fired, money: c.money });
    localStorage.setItem('svgp.careerHistory', JSON.stringify(h.slice(0, 20)));
  } catch (e) {}
}
