// Simulate World Careers with different ways of playing, to tune the economy and the story (js/wcareer.js).
// Each career is founded like a real one (register, lottery, the cheapest decent car), then every round runs the week
// (the director, gigs, the day job), the payroll, and a simulated race; the player's choices come from a policy.
//
//   node tools/simcareer.mjs                       every policy, 40 careers each, 3 seasons
//   node tools/simcareer.mjs 100 2 --skill=0.25    100 careers, 2 seasons, a driver quicker than most of the field
//   node tools/simcareer.mjs 40 3 --policy=sketchy one policy, with a line per career
//   node tools/simcareer.mjs 40 3 --gt             win the Street Cup first (a quick driver), then GT seasons at --skill
//                                                  (--gentleman=no: no gentleman driver; --car=buy: buy, not lease)
//
// skill: where you'd qualify on pace alone, as a fraction down the field (0 = the fastest driver, 1 = the slowest).
import * as WC from '../js/wcareer.js';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const args = process.argv.slice(2), opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const GT = args.includes('--gt'), GENT = opt('gentleman', 'yes') !== 'no', CARHOW = opt('car', 'lease');
const N = +(args.find(a => /^\d+$/.test(a)) || 40), SEASONS = +(args.filter(a => /^\d+$/.test(a))[1] || 3), SKILL = +opt('skill', 0.4), ONLY = opt('policy', null);

const POOL = [['Pine Ridge', 'grass'], ['Mesa Loop', 'desert'], ['Harbour Run', 'coast'], ['Downtown GP', 'city'], ['Oak Valley', 'grass'], ['Red Rock', 'desert'], ['Bay Point', 'coast'], ['Uptown Ring', 'city']]
  .map(([name, theme]) => ({ name, env: { theme, time: 'day' } }));
const STREET = [['testarossa', 'Testa Rossa', 290000], ['jsport', 'Kaze Sports Coupe', 280000], ['rs964', 'Neun Elf RS', 195000], ['gtr', 'Godzilla R35', 400000], ['mustang', 'Pony GT 5.0', 320000], ['m5', 'Bavaria M5 E39', 294000]]
  .map(([key, name, p]) => ({ key, name, value: Math.round(12000 + p * 0.11) }));
// the GT cars (js/cars.js), for the customer programmes
const CAT = { gt1: [['aventus', 'Emery Aventus ’92', 470000, 1120], ['bx300', 'Horai BX300 ’96', 430000, 1040], ['rmx', 'Kineto RM-X ’94', 500000, 1180], ['m1procar', 'Bavaria M1 ProCar ’79', 400000, 1020], ['porsche935', 'Porsche 935', 480000, 1030]]
  .map(([key, name, w, kg]) => ({ key, name, hp: Math.round(w / 745.7), kg })), f1: [{ key: 'custom', name: 'SV-F spec chassis', hp: 900, kg: 600 }] };

// a seeded random for the policies (the world has its own)
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---------- ways of playing ----------
// tempt: which temptations to take (and when); work: how the week is spent; staff: who gets hired; diy: rebuild yourself
const POLICIES = {
  // pays everyone, works the week, says no to everything shady
  clean:   { tempt: () => 'no', inflate: 'real', work: 'hustle', staff: 'careful', diy: true },
  // races, and does nothing else: no day job, no gigs
  idle:    { tempt: () => 'no', inflate: 'real', work: 'none', staff: 'careful', diy: false },
  // works the week, takes the safer shortcuts (sponsor money, loans, rounding figures up) when it's tight
  grey:    { tempt: (w, m, d) => ['shady', 'shark'].includes(m.tempt) && d > 0.5 ? 'yes' : m.tempt === 'grey' ? 'yes' : 'no', inflate: 'inflate', work: 'hustle', staff: 'careful', diy: true },
  // takes every offer, throws races for Lenny when desperate
  sketchy: { tempt: (w, m, d) => m.tempt === 'bet' ? (d > 0.6 ? 'against' : 'for') : 'yes', inflate: 'inflate', work: 'hustle', staff: 'careful', diy: true, throwRaces: true },
  // hires a full crew straight away and spends on upgrades
  big:     { tempt: () => 'no', inflate: 'real', work: 'some', staff: 'full', diy: false, upgrades: true },
};

function answerAll(w, P) {
  for (let pass = 0; pass < 3; pass++) for (const m of (w.mail || []).slice()) {
    if (!m.choices || m.answer || m.tried) continue;
    const d = WC.despOf(w);
    let key = 'no';
    if (m.lottery) continue;
    else if (m.sponsorOffer) key = 'yes';
    else if (m.offer) key = P.moveUp || GT ? 'move' : 'stay';
    else if (m.gent) key = GENT && !(w.mate && WC.traitsOf(w, w.people[w.mate.pid] || {}).includes('gentleman')) ? 'sign' : 'no';
    else if (m.dayJob) key = P.work === 'none' ? 'no' : 'go';
    else if (m.gig) key = P.work === 'none' ? 'no' : 'in';
    else if (m.appear) key = WC.daysLeft(w) > 1 ? 'go' : 'no';
    else if (m.tempt) key = P.tempt(w, m, d);
    else if (m.inflate) key = P.inflate;
    else if (m.arc) key = arcChoice(w, m, P);
    m.answer = key;
    let r = null;
    if (m.sponsorOffer) WC.answerSponsor(w, m, key);
    else if (m.offer) WC.answerOffer(w, key);
    else if (m.gig && key === 'in') { const x = WC.bookGig(w, m.gig); if (x !== 'ok' && x !== 'gone') r = { err: x }; }
    else if (m.appear && key === 'go') { if (!WC.appear(w, m.appear)) r = { err: 'days' }; }
    else if (m.gent) WC.answerGent(w, m, key);
    else if (m.dayJob && key === 'go') { if (!WC.takeDayJob(w, m)) r = { err: 'days' }; }
    else if (m.tempt || m.arc || m.inflate) r = WC.answerStory(w, m, key);
    if (r && r.err) { m.answer = null; m.tried = true; }
  }
}
function arcChoice(w, m, P) {
  const keys = m.choices.map(c => c[0]);
  if (keys.includes('match')) return P.staff === 'full' || WC.despOf(w) < 0.4 ? 'match' : 'go';
  if (keys.includes('pay')) return 'pay';
  if (keys.includes('tip')) return P.tempt === POLICIES.sketchy.tempt ? 'tip' : 'yes';
  if (keys.includes('gift')) return 'gift';
  return keys[0];
}
// a gig, driven: how well depends on the driver
function driveGig(w, g) {
  const q = () => 1.08 + SKILL * 0.25 + gauss() * 0.05, laps = g.laps;
  const r = { finished: rnd() > 0.03, time: 0, ref: 1, dmg: Math.max(0, gauss() * 0.02 + SKILL * 0.01), comfort: 100, lapTimes: [], lapComfort: [], won: false };
  if (g.kind === 'courier') { r.ref = laps; r.time = laps * q(); }
  else if (g.kind === 'hearse') { r.ref = laps; r.time = laps * (1.4 + gauss() * 0.1); r.comfort = Math.min(100, 88 - SKILL * 10 + gauss() * 8); }
  else if (g.kind === 'rides') { for (let i = 0; i < laps; i++) { r.lapTimes.push(q()); r.lapComfort.push(Math.min(100, 82 - SKILL * 10 + gauss() * 14)); } }
  else if (g.kind === 'attack') { for (let i = 0; i < laps; i++) r.lapTimes.push(q() - 0.03); }
  else { r.won = rnd() < 0.62 - SKILL * 0.4; r.lapTimes = [1, 1]; }
  return WC.gigDone(w, g.id, r);
}
function week(w, P) {
  WC.weekOf(w);
  answerAll(w, P);
  if (P.work !== 'none') {
    for (const g of WC.bookedGigs(w)) w.simWork = (w.simWork || 0) + (driveGig(w, g)?.net || 0);
    // GigGo: take what's offered while there are days
    for (const g of WC.weekOf(w).gigs.slice()) { if (WC.daysLeft(w) <= (P.work === 'some' ? 3 : 0)) break; if (WC.bookGig(w, g.id) === 'ok') w.simWork = (w.simWork || 0) + (driveGig(w, g)?.net || 0); }
  }
  // the car: rebuild what's worn (yourself if you can spare the day)
  const parts = WC.carParts(w);
  if (parts) for (const k of WC.PART_KEYS) if (parts[k].cond < 0.55) {
    if (P.diy && WC.daysLeft(w) > 0) { const save = WC.rebuildCost(w, k) - WC.selfCost(w, k); if (WC.rebuildSelf(w, k)) w.simWork = (w.simWork || 0) + save; } // (what doing it yourself saved counts as the week's work)
    else if (w.money.balance > WC.rebuildCost(w, k) * 2) WC.rebuildPart(w, k);
  }
  if (P.upgrades && w.money.balance > 60000) { const c = WC.catalogue(w).filter(x => !WC.isFitted(w, x)).sort((a, b) => a.price - b.price)[0]; if (c && c.price < w.money.balance * 0.2) WC.buyFit(w, c); }
  if (P.work !== 'none') while (WC.daysLeft(w) > 0) w.simWork = (w.simWork || 0) + WC.workDay(w).amt;
  // tyres for the weekend
  const st = WC.stockOf(w), order = { soft: Math.max(0, 1 - st.soft), medium: Math.max(0, 1 - st.medium) };
  if (!WC.staffOf(w, 'manager')) WC.orderTyres(w, order);
  answerAll(w, P);
}
function hire(w, P) {
  if (!w.jobs) return;
  const want = P.staff === 'full' ? ['manager', 'mechanic', 'engineer'] : WC.runwayOf(w) > 6 ? ['mechanic'] : [];
  for (const role of want) if (!WC.staffOf(w, role)) { const j = w.jobs.filter(x => x.role === role).sort((a, b) => a.skill - b.skill)[Math.floor(w.jobs.filter(x => x.role === role).length / 2)]; if (j) WC.hireStaff(w, j.id); }
  // money's gone: pay what you can, the most important first
  if (WC.payrollShort(w)) for (const x of (w.staff || []).slice().sort((a, b) => (a.danny ? 1 : 0) - (b.danny ? 1 : 0))) if (w.money.balance < WC.payrollDue(w)) WC.setPay(w, x.id, 'half');
}

function career(P, s) {
  seed = s * 7919 + 13;
  const w = WC.newWorld({ name: 'Sim Driver', len: 6, seed: s * 104729 + 1, streetCars: STREET }, POOL);
  WC.setCarCatalog(w, CAT);
  WC.registerTeam(w, { name: 'Sim Driver', team: 'Sim Racing', colors: [0xc8141c, 0xf2f2f2], home: pick(['pinewood', 'gulch', 'city', 'azure']), background: pick(Object.keys(WC.BACKGROUNDS)), ex: 'Sam', years: 4 });
  WC.claimLottery(w, P.annuity ? 'annuity' : 'lump');
  const ad = w.ads[Math.min(1, w.ads.length - 1)]; WC.buyCar(w, ad.id);
  w.simSkill = GT ? 0.02 : SKILL;
  const out = { start: w.money.balance, low: w.money.balance, bal: [], pos: [], broke: null, rounds: 0, flags: {}, gt: [] };
  for (let y = 0; y < SEASONS && out.broke == null; y++) {
    while (!w.over) {
      if (WC.needsCar(w) && w.car) { const c = CARHOW === 'used' ? WC.exWorks(w)[0] : WC.customerCars(w).sort((a, b) => (a.deposit + a.perRound * 6) - (b.deposit + b.perRound * 6))[0]; if (c) WC.acquireCar(w, CARHOW, CARHOW === 'used' ? c.id : c.key); }
      if (!w.car) { const a = (w.ads || [])[0]; if (a && w.money.balance > a.price) WC.buyCar(w, a.id); else { out.broke = out.rounds; break; } }
      week(w, P); hire(w, P);
      if (w.staff) { WC.managerRestock(w); WC.runPayroll(w); }
      const throwIt = P.throwRaces && w.bet && w.bet.type === 'against', keep = w.simSkill;
      if (throwIt) w.simSkill = 0.97;
      WC.simPlayerRound(w); w.simSkill = keep;
      out.rounds++; out.low = Math.min(out.low, w.money.balance);
      if (w.money.balance < -25000) { out.broke = out.rounds; break; }
    }
    if (out.broke != null) break;
    out.bal.push(w.money.balance); out.pos.push(w.seasons.at(-1)?.you?.pos ?? null);
    if (GT && w.player.series === 'gt') out.gt.push(w.money.balance);
    answerAll(w, P); WC.nextSeason(w, POOL);
    if (GT && w.player.series === 'gt') { w.simSkill = SKILL; out.gtStart ??= w.money.balance; answerAll(w, P); }
  }
  out.end = w.money.balance; out.work = (w.simWork || 0) / Math.max(1, out.rounds / 6); out.flags = { ...WC.record(w) }; out.rep = WC.repOf(w); out.arcs = (w.dir?.n || 0);
  out.dsq = w.series && Object.values(w.player.hist || []).length;
  return out;
}

// ---------- report ----------
const med = (a) => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const k$ = (n) => n == null ? '   -   ' : `${n < 0 ? '-' : ' '}$${Math.abs(Math.round(n / 1000))}k`.padStart(7);
const pct = (n) => `${Math.round(n * 100)}%`.padStart(4);
if (GT) {
  for (const [name, P] of Object.entries(POLICIES)) {
    if (ONLY ? name !== ONLY : !['clean', 'idle', 'big'].includes(name)) continue;
    const runs = []; for (let i = 0; i < N; i++) runs.push(career(P, i + 1));
    const up = runs.filter(r => r.gtStart != null), broke = up.filter(r => r.broke != null);
    console.log(`${name.padEnd(8)} moved up ${up.length}/${N}  broke in GT ${pct(broke.length / Math.max(1, up.length))}  entering GT ${k$(med(up.map(r => r.gtStart)))}  after GT season ${[0, 1].map(i => k$(med(up.map(r => r.gt[i])))).join(' ')}  lowest ${k$(med(up.map(r => r.low)))}`);
  }
  process.exit(0);
}
console.log(`${N} careers per policy, ${SEASONS} seasons of 6 rounds, driver skill ${SKILL} (0 = fastest). Lump sum ${k$(WC.LOTTERY.lump).trim()}.`);
console.log(`policy    broke  start    end s1   end s2   end s3   lowest   finish s1  rep  arcs  work/yr  caught  flags`);
for (const [name, P] of Object.entries(POLICIES)) {
  if (ONLY && name !== ONLY) continue;
  const runs = []; for (let i = 0; i < N; i++) runs.push(career(P, i + 1));
  const broke = runs.filter(r => r.broke != null), caught = runs.filter(r => r.flags.greyCaught || r.flags.betCaught || r.flags.fraudCaught || r.flags.liesCaught).length;
  const fl = {}; for (const r of runs) for (const [k, v] of Object.entries(r.flags)) fl[k] = (fl[k] || 0) + v;
  console.log(`${name.padEnd(9)} ${pct(broke.length / N)}  ${k$(med(runs.map(r => r.start)))}  ${[0, 1, 2].map(i => k$(med(runs.map(r => r.bal[i])))).join('  ')}  ${k$(med(runs.map(r => r.low)))}  ${String(med(runs.map(r => r.pos[0])) ?? '-').padStart(6)}     ${String(Math.round(med(runs.map(r => r.rep)))).padStart(3)}  ${(runs.reduce((a, r) => a + r.arcs, 0) / N).toFixed(1).padStart(4)}  ${k$(med(runs.map(r => r.work)))}  ${pct(caught / N)}   ${Object.entries(fl).map(([k, v]) => `${k} ${(v / N).toFixed(2)}`).join(', ')}`);
  if (ONLY) for (const [i, r] of runs.entries()) console.log(`  #${i + 1} ${r.broke != null ? `broke after ${r.broke} rounds` : 'ok'}  end ${k$(r.end)}  low ${k$(r.low)}  finish ${r.pos.join('/')}  ${JSON.stringify(r.flags)}`);
}
