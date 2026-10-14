// Simulate World Careers with different ways of playing, to tune the economy and the story (js/wcareer.js).
// Each career is founded like a real one (register, lottery, the cheapest decent car), then every round runs the week
// (the director, gigs, the day job), the payroll, and a simulated race; the player's choices come from a policy.
//
//   node tools/simcareer.mjs                       every policy, 40 careers each, 3 seasons
//   node tools/simcareer.mjs 100 2 --skill=0.25    100 careers, 2 seasons, a driver quicker than most of the field
//   node tools/simcareer.mjs 40 3 --policy=sketchy one policy, with a line per career
//   node tools/simcareer.mjs 40 3 --gt             win the Street Cup first (a quick driver), then GT seasons at --skill
//                                    (--to=gt: on up to GT1 (via GT2); default the rung above the Street Cup, GT2)
//                                                  (--gentleman=no: no gentleman driver; --car=buy: buy, not lease)
//   --street=0.02                                  (--gt) your pace in the Street Cup on the way up (default: quick)
//   --seasonly                                     where the money went, season by season (careers that last)
//   --seat=gent                                    the second seat in the season setup (gent, pro, share, junior)
//   --sellup=no                                    never sell the car or facilities when deep in the red
//   --len=6                                        rounds a season (4, 6, 8, 12)
//   --amb=par                                      each season's ambition: none, safe, par (default), push, title
//
// broke: the bank closed the account (js/wcareer.js bankCheck: past the limit for BANK_ROUNDS rounds)
// skill: where you'd qualify on pace alone, as a fraction down the field (0 = the fastest driver, 1 = the slowest).
import * as WC from '../js/wcareer.js';
import { writeFileSync } from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const args = process.argv.slice(2), opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const ENTRY = opt('entry', 'fresh'), MATE = opt('mate', 'pay'), GT = args.includes('--gt'), GENT = opt('gentleman', 'yes') !== 'no', CARHOW = opt('car', 'lease');
const HOSP = args.includes('--hosp'), WORKS = opt('works', 'yes') !== 'no', WORKSN = { offers: 0, took: 0 };
const INV = opt('inv', 'yes') !== 'no', INVS = [], INVOUT = [], OFFERS = { n: 0 }, MET = { n: 0 };
const TO = opt('to', 'gt2'); // (--gt: the series it moves up to and stays in)
const STREETSKILL = +opt('street', 0.02); // (--gt: your pace in the Street Cup, before GT)
const SEAT = opt('seat', 'gent'), SELLUP = opt('sellup', 'yes') !== 'no', LEN = +opt('len', 6), AMB = opt('amb', 'par'), SEASONLY = args.includes('--seasonly');
// a transaction's kind, for --seasonly
const cat = (what) => { const s = what.replace(/^[A-Z][\w' ]*?: (?=[a-z])/, ''); for (const [k, re] of [['prize', /prize money|prize fund/i], ['sponsors', /sponsor|bonus|associate|seat fee|seat money/i], ['entry+travel+crew', /^(entry fee|travel|pit crew)/i], ['tyres+fuel', /tyre|tire|fuel/i], ['repairs+parts', /repair|rebuild|part|Speed Parts|SVList/i], ['staff', /payroll|back pay|labour|wage/i], ['week', /fare|GigGo|Restwell|day job|track day|time attack|street race|appearance|coaching|hot laps|shift|winnings|stake|ride/i], ['facilities', /premises|facilit|unit|transporter|lift|tools|sim rig|built/i], ['projects', /project|wind tunnel|shop/i], ['bank', /overdraft|loan|interest/i]]) if (re.test(s)) return k; return 'other: ' + s.slice(0, 28); };
const N = +(args.find(a => /^\d+$/.test(a)) || 40), SEASONS = +(args.filter(a => /^\d+$/.test(a))[1] || 3), SKILL = +opt('skill', 0.4), ONLY = opt('policy', null);

const POOL = [['Pine Ridge', 'grass'], ['Mesa Loop', 'desert'], ['Harbour Run', 'coast'], ['Downtown GP', 'city'], ['Oak Valley', 'grass'], ['Red Rock', 'desert'], ['Bay Point', 'coast'], ['Uptown Ring', 'city']]
  .map(([name, theme]) => ({ name, env: { theme, time: 'day' } }));
const STREET = [['testarossa', 'Testa Rossa', 290000], ['jsport', 'Kaze Sports Coupe', 280000], ['rs964', 'Porsche 911 Carrera RS (964)', 195000], ['mustang', 'Pony GT 5.0', 320000], ['m5', 'Bavaria M5 E39', 294000], ['r34', 'Nissan Skyline GT-R R34', 245000]]
  .map(([key, name, p]) => ({ key, name, value: Math.round(12000 + p * 0.11) }));
// the GT cars (js/cars.js), for the customer programmes
const CAT = { gt2: [['m3gtr', 'BMW M3 GTR', 325000, 1150], ['rsr964', 'Porsche 911 Carrera RSR 3.8 (964)', 310000, 1100], ['r34gt2', 'Nissan Skyline GT-R R34 GT2', 340000, 1250]]
  .map(([key, name, w, kg]) => ({ key, name, hp: Math.round(w / 745.7), kg })), gt1: [['aventus', 'Emery Aventus ’92', 470000, 1120], ['bx300', 'Horai BX300 ’96', 430000, 1040], ['rmx', 'Kineto RM-X ’94', 500000, 1180], ['m1procar', 'Bavaria M1 ProCar ’79', 400000, 1020], ['porsche935', 'Porsche 935', 480000, 1030]]
  .map(([key, name, w, kg]) => ({ key, name, hp: Math.round(w / 745.7), kg })), f1: [{ key: 'custom', name: 'SV-F spec chassis', hp: 900, kg: 600 }], club: [{ key: 'miata', name: 'Mazda MX-5 Miata NA', hp: 114, kg: 1040 }] };

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
  // works the week, a mechanic when it can afford one, and spends what's spare on whatever buys the most lap time per
  // dollar (projects and parts, by the engineer's numbers), keeping a few rounds' costs in hand: a good player
  invest:  { tempt: () => 'no', inflate: 'real', work: 'hustle', staff: 'careful', diy: true, upgrades: 'smart' },
  // hires a full crew straight away and spends on upgrades
  big:     { tempt: () => 'no', inflate: 'real', work: 'some', staff: 'full', diy: false, upgrades: true },
};

function answerAll(w, P) {
  // an investor's question: read them right most of the time (--inv=no: never take the money)
  for (const m of (w.mail || []).filter(m => m.pitch && !m.replied)) { if (w.investor && w.investor.met === 1) MET.n++; const S = WC.investorStyle(w); const like = { numbers: 'numbers', dreamer: 'dream', cautious: 'risks' }[w.investor?.style]; WC.pitchDone(w, m.id, Math.random() < 0.7 ? like : WC.PITCHES[Math.floor(Math.random() * 4)][0]); }
  for (let pass = 0; pass < 3; pass++) for (const m of (w.mail || []).slice()) {
    if (!m.choices || m.answer || m.tried) continue;
    const d = WC.despOf(w);
    let key = 'no';
    if (m.lottery) continue;
    else if (m.sponsorOffer) key = 'yes';
    else if (m.offer) key = (P.moveUp || GT) && !(GT && w.player.series === TO) ? 'move' : 'stay'; // (--gt: up to GT, and stay there)
    else if (m.gent) key = GENT && !(w.mate && WC.traitsOf(w, w.people[w.mate.pid] || {}).includes('gentleman')) ? 'sign' : 'no';
    else if (m.dayJob) key = P.work === 'none' ? 'no' : 'go';
    else if (m.gig) key = P.work === 'none' ? 'no' : 'in';
    else if (m.appear) key = WC.daysLeft(w) > 1 ? 'go' : 'no';
    else if (m.event) key = 'yes';
    else if (m.invOffer) { key = INV ? 'yes' : 'no'; OFFERS.n++; }
    else if (m.worksOffer) { key = WORKS ? 'yes' : 'no'; WORKSN.offers++; }
    else if (m.invOut) key = w.money.balance > (w.investor?.buyout || 0) * 2 ? 'buy' : 'no';
    else if (m.tempt) key = P.tempt(w, m, d);
    else if (m.inflate) key = P.inflate;
    else if (m.arc) key = arcChoice(w, m, P);
    m.answer = key;
    let r = null;
    if (m.sponsorOffer) WC.answerSponsor(w, m, key);
    else if (m.offer) WC.answerOffer(w, key);
    else if (m.gig && key === 'in') { const x = WC.bookGig(w, m.gig); if (x !== 'ok' && x !== 'gone') r = { err: x }; }
    else if (m.appear && key === 'go') { if (!WC.appear(w, m.appear)) r = { err: 'days' }; }
    else if (m.event) WC.rsvpEvent(w, m.event, key);
    else if (m.worksOffer) { if (WC.answerWorks(w, key) === 'signed') WORKSN.took++; }
    else if (m.invOffer) { WC.answerInvestor(w, key); if (key === 'yes') INVS.push({ amt: w.investor.paid, share: w.investor.share, s: w.player.series, y: w.year }); }
    else if (m.invOut) { WC.answerBuyout(w, key); INVOUT.push(key); }
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
  for (const e of WC.openEvents(w)) WC.attendEvent(w, e.id); // (the sponsors' events: said yes, so go, before the week fills up)
  if (P.work !== 'none') {
    for (const g of WC.bookedGigs(w)) w.simWork = (w.simWork || 0) + (driveGig(w, g)?.net || 0);
    // GigGo: take what's offered while there are days
    for (const g of WC.weekOf(w).gigs.slice()) { if (WC.daysLeft(w) <= (P.work === 'some' ? 3 : 0)) break; if (WC.bookGig(w, g.id) === 'ok') w.simWork = (w.simWork || 0) + (driveGig(w, g)?.net || 0); }
  }
  // the car: rebuild what's worn (yourself if you can spare the day)
  const parts = WC.carParts(w);
  if (parts) for (const k of WC.PART_KEYS.slice().sort((a, b) => parts[a].cond - parts[b].cond)) if (parts[k].cond < (P.diy && WC.daysLeft(w) > 0 ? 0.7 : 0.55)) {
    if (P.diy && WC.daysLeft(w) > 0) { const save = WC.rebuildCost(w, k) - WC.selfCost(w, k); if (WC.rebuildSelf(w, k)) w.simWork = (w.simWork || 0) + save; } // (what doing it yourself saved counts as the week's work)
    else if (w.money.balance > WC.rebuildCost(w, k) * 2) WC.rebuildPart(w, k);
  }
  // the team: facilities when there's money to spare, and projects (worked on with your spare days)
  teamWork(w, P);
  if (P.upgrades === 'smart') {
    const C = WC.COSTS[w.player.series], keep = (C.entry + C.travel + C.crew + C.tyre * 3) * 4, K = WC.lapKOf(w.player.series);
    const worth = (x) => Object.entries(x.gains).reduce((a, [k, v]) => a + (K[k] || 0) * v, 0) * (x.q ?? 1);
    const c = WC.catalogue(w).filter(x => !WC.isFitted(w, x) && worth(x) > 0.0005).sort((a, b) => worth(b) / b.price - worth(a) / a.price)[0];
    if (c && w.money.balance - c.price > keep) WC.buyFit(w, c);
  } else if (P.upgrades && w.money.balance > 60000) { const c = WC.catalogue(w).filter(x => !WC.isFitted(w, x)).sort((a, b) => a.price - b.price)[0]; if (c && c.price < w.money.balance * 0.2) WC.buyFit(w, c); }
  if (P.work !== 'none') while (WC.daysLeft(w) > 0) w.simWork = (w.simWork || 0) + WC.workDay(w).amt;
  // tyres for the weekend
  const st = WC.stockOf(w), order = { soft: Math.max(0, 1 - st.soft), medium: Math.max(0, 1 - st.medium) };
  if (!WC.staffOf(w, 'manager')) WC.orderTyres(w, order);
  answerAll(w, P);
}
function teamWork(w, P) {
  if (args.includes('--nodev')) return;
  const t = WC.myTeam(w), b = w.money.balance, want = P.staff === 'full' ? ['tools', 'base', 'sim', 'dyno', 'fab', 'data'] : ['tools', 'sim', 'base', 'dyno'];
  // (moving up: what the series asks for comes first)
  const off = w.player.offer; if (off && off.answer === 'move') for (const [k] of WC.seriesMissing(t, off.to)) { const nx = WC.facNext(t, k); if (nx && b > nx.cost + 5000) WC.buildFacility(w, k); }
  // (keeping a few rounds' running costs in hand)
  const C = WC.COSTS[w.player.series], round = C.entry + C.travel + C.crew + C.tyre * 3, keep = round * (P.staff === 'full' ? 3 : 5);
  for (const k of want) { const nx = WC.facNext(t, k); if (nx && b > nx.cost * (P.staff === 'full' ? 1.5 : 2) + keep) { if (WC.buildFacility(w, k).ok) break; } }
  if (P.work === 'none' && P.staff !== 'full') return;
  const live = (w.projects || []).filter(x => !x.done);
  if (live.length < WC.maxProjects(w) && w.money.balance > keep * 0.6) {
    const K = WC.lapKOf(w.player.series);
    const opts = WC.projectList(w).filter(x => !x.locked && x.stat !== 'rel' && x.cost < (w.money.balance - keep * 0.6) * 0.3).sort((a, b) => b.gain * K[b.stat] / b.cost - a.gain * K[a.stat] / a.cost); // (lap time per dollar, as the engineer's numbers show it)
    if (opts[0]) WC.startProject(w, opts[0].key, 'team');
  }
  // a day or two of your own on them
  for (const x of (w.projects || []).filter(x => !x.done && !x.shop)) { if (WC.daysLeft(w) <= 3) break; WC.workOnProject(w, x.id); }
}
function hire(w, P) {
  if (!w.jobs) return;
  const want = P.staff === 'full' ? ['manager', 'mechanic', 'engineer'] : WC.runwayOf(w) > 6 ? ['mechanic'] : [];
  for (const role of want) if (!WC.staffOf(w, role)) { const j = w.jobs.filter(x => x.role === role).sort((a, b) => a.skill - b.skill)[Math.floor(w.jobs.filter(x => x.role === role).length / 2)]; if (j) WC.hireStaff(w, j.id); }
  // money's gone: pay what you can, the most important first
  if (WC.payrollShort(w)) for (const x of (w.staff || []).slice().sort((a, b) => (a.danny ? 1 : 0) - (b.danny ? 1 : 0))) if (w.money.balance < WC.payrollDue(w)) WC.setPay(w, x.id, 'half');
}

// the season setup (a series with seats): the cheapest car that's affordable, the --seat deal, the steady sponsor
function seasonSetup(w) {
  if (WC.setupDone(w) || WC.setupKind(w) !== 'season') return;
  const S = w.setup;
  if (S.cars.length) { const ok = S.cars.map((o, i) => [i, o]).filter(([i]) => { WC.setupPick(w, 'car', i); return WC.setupBudget(w).after >= 0; }); WC.setupPick(w, 'car', ok.length ? ok[0][0] : 0); }
  const k = S.seats.findIndex(d => d.kind === (GENT ? SEAT : 'pro')); WC.setupPick(w, 'seat', Math.max(0, k));
  if (S.sponsors.length) { const h = S.sponsors.findIndex(x => x.hosp); WC.setupPick(w, 'sponsor', HOSP && h >= 0 ? h : Math.min(+opt('spon', '1'), S.sponsors.length - 1)); }
  const r = WC.setupApply(w); if (!r.ok) { S.done = true; }
}
function career(P, s) {
  seed = s * 7919 + 13;
  const w = WC.newWorld({ name: 'Sim Driver', len: LEN, seed: s * 104729 + 1, streetCars: STREET, start: opt('start', 'street') }, POOL); // (--start=club: a new career's start)
  WC.setCarCatalog(w, CAT);
  WC.registerTeam(w, { name: 'Sim Driver', team: 'Sim Racing', colors: [0xc8141c, 0xf2f2f2], home: pick(['pinewood', 'gulch', 'city', 'azure']), background: pick(Object.keys(WC.BACKGROUNDS)), ex: 'Sam', years: 4 });
  WC.claimLottery(w, P.annuity ? 'annuity' : 'lump');
  // the setup wizard: the entry (--entry=fresh|takeover|running), a car if it didn't come with one, the steady sponsor,
  // a second driver (--mate=pay|quick|kid|keep)
  WC.setupPick(w, 'entry', ENTRY); if (WC.setupBudget(w).after < 0) WC.setupPick(w, 'entry', 'fresh');
  if (w.setup.picks.entry === 'fresh') WC.setupPick(w, 'car', w.ads[Math.min(1, w.ads.length - 1)].id);
  WC.setupPick(w, 'sponsor', +opt('spon', '1'));
  WC.setupPick(w, 'mate', w.setup.drivers[{ keep: 0, quick: 1, pay: 2, kid: 3 }[MATE] ?? 2] || w.setup.drivers[0]);
  const ok = WC.setupApply(w); if (!ok.ok) console.error('setup', ok.why);
  w.simSkill = GT ? STREETSKILL : SKILL;
  const out = { sl: [], seen: w.money.tx[0], start: w.money.balance, low: w.money.balance, bal: [], pos: [], broke: null, rounds: 0, flags: {}, gt: [] };
  for (let y = 0; y < SEASONS && out.broke == null; y++) {
    while (!w.over) {
      if (WC.needsCar(w) && w.car) { const c = CARHOW === 'used' ? WC.exWorks(w)[0] : WC.customerCars(w).sort((a, b) => (a.deposit + a.perRound * 6) - (b.deposit + b.perRound * 6))[0]; if (c) WC.acquireCar(w, CARHOW, CARHOW === 'used' ? c.id : c.key); }
      if (!w.car) { const a = (w.ads || []).slice().sort((x, y) => x.price - y.price)[0]; if (a && w.money.balance > a.price + 10000) WC.buyCar(w, a.id); }
      // (no race car and can't buy one: work the week and sit the round out)
      if (!w.car) { week(w, P); WC.sitOut(w); out.rounds++; out.sat = (out.sat || 0) + 1; out.low = Math.min(out.low, w.money.balance); if (w.ended) { out.broke = out.rounds; break; } continue; }
      // (deep in the red: sell what can be sold, the dearest first; then the car)
      if (SELLUP && w.money.balance < -10000) {
        for (const k of WC.FAC_KEYS.slice().sort((x, y) => (WC.facSale(w, y)?.value || 0) - (WC.facSale(w, x)?.value || 0))) { const x = WC.facSale(w, k); if (x && !x.why && w.money.balance < -10000) { WC.sellFacility(w, k); out.sold = (out.sold || 0) + 1; } }
        if (w.money.balance < -18000 && w.car) { WC.sellCar(w); out.soldCar = (out.soldCar || 0) + 1; continue; }
      }
      if (AMB !== 'none' && WC.ambitionDue(w)) { const c = WC.ambitionChoices(w), e = WC.seasonOutlook(w).pos; const x = { safe: c[0], par: c.find(o => o.t === e) || c[0], push: c.find(o => o.t < e && o.t > 1) || c.find(o => o.t < e) || c[0], title: c[c.length - 1] }[AMB]; WC.setAmbition(w, x.t); }
      week(w, P); hire(w, P);
      if (w.staff) { WC.managerRestock(w); WC.runPayroll(w); }
      const throwIt = P.throwRaces && w.bet && w.bet.type === 'against', keep = w.simSkill;
      if (throwIt) w.simSkill = 0.97;
      WC.simPlayerRound(w); w.simSkill = keep;
      if (SEASONLY) { const tx = w.money.tx, top = []; for (const t of tx) { if (t === out.seen) break; top.push(t); } out.seen = tx[0]; for (const t of top) { const k = cat(t.what); (out.sl[y] ??= {})[k] = ((out.sl[y] ??= {})[k] || 0) + t.amt; } }
      out.rounds++; out.low = Math.min(out.low, w.money.balance);
      if (w.ended) { out.broke = out.rounds; break; }
    }
    if (out.broke != null) break;
    out.bal.push(w.money.balance); out.pos.push(w.seasons.at(-1)?.you?.pos ?? null);
    // (your car against the median AI team's in the series, % of a lap: + = yours is quicker)
    { const sid = w.player.series, vs = w.series[sid].teams.filter(t => !w.teams[t].mine).map(t => WC.carValue(w, w.teams[t])).sort((a, b) => a - b);
      if (args.includes('--carwhy') && w.car) { const B = WC.carBreakdown(w), K = WC.lapKOf(w.player.series), by = {}; for (const ch of Object.keys(K)) for (const x of (B[ch] || [])) { const k = x.src + ':' + x.label.replace(/\(.*\)/, '').trim(); by[k] = (by[k] || 0) + (x.v || 0) * K[ch] * 100; } (globalThis.CARWHY ||= []).push([w.year, by]); }
      if (args.includes('--devref')) for (const S of WC.SERIES) { const vs = w.series[S.id].teams.filter(t => !w.teams[t].mine).map(t => (WC.carValue(w, w.teams[t]) - S.base) * 0.0275).sort((a, b) => a - b); ((globalThis.DEVREF ||= {})[S.id] ||= []).push(vs[Math.floor(vs.length / 2)]); }
      (out.car ||= []).push(w.car ? +((WC.carValue(w, WC.myTeam(w)) - vs[Math.floor(vs.length / 2)]) * 0.0275).toFixed(2) : null); }
    if (GT && w.player.series === TO) { out.gt.push(w.money.balance); (out.gtPos ||= []).push(w.seasons.at(-1)?.you?.pos ?? null); (out.gtCar ||= []).push(out.car?.at(-1) ?? null); }
    answerAll(w, P);
    { const t = WC.myTeam(w), off = w.player.offer; if (off && off.answer === 'move') for (const [k] of WC.seriesMissing(t, off.to)) { const nx = WC.facNext(t, k); if (nx && w.money.balance > nx.cost) WC.buildFacility(w, k); } }
    WC.nextSeason(w, POOL);
    seasonSetup(w);
    if (GT && w.player.series === TO) { w.simSkill = SKILL; out.gtStart ??= w.money.balance; answerAll(w, P); }
    // (--save=<file>: the first career to get there, saved as it starts its first season there: for .devtest/careerrace.mjs)
    if (GT && w.player.series === TO && opt('save', null) && !globalThis.SAVED) { globalThis.SAVED = 1; writeFileSync(opt('save', null), JSON.stringify(w)); }
  }
  if (args.includes('--ledger')) { const cat = {}; for (const t of w.money.tx) { const k = t.what.replace(/^[^:]+: /, '').replace(/\(.*?\)|\d[\d,]*/g, '').replace(/ +/g, ' ').trim().slice(0, 34); cat[k] = (cat[k] || 0) + t.amt; } (globalThis.LEDGER ??= []).push(cat); }
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
    if (globalThis.LEDGER) { const sum = {}; for (const c of LEDGER) for (const [k, v] of Object.entries(c)) sum[k] = (sum[k] || 0) + v / LEDGER.length; for (const [k, v] of Object.entries(sum).sort((a, b) => a[1] - b[1])) if (Math.abs(v) > 8000) console.log(`   ${k.padEnd(36)} ${Math.round(v / 1000)}k`); globalThis.LEDGER = null; }
    if (SEASONLY) { const ok = runs.filter(r => r.broke == null); for (let y = 0; y < SEASONS; y++) { const sum = {}; for (const r of ok) for (const [k, v] of Object.entries(r.sl[y] || {})) sum[k] = (sum[k] || 0) + v / ok.length; const net = Object.values(sum).reduce((a, b) => a + b, 0); console.log(`  season ${y + 1} net ${k$(net)}: ${Object.entries(sum).sort((a, b) => a[1] - b[1]).filter(([, v]) => Math.abs(v) > 2000).map(([k, v]) => `${k} ${k$(v).trim()}`).join(', ')}`); } }
    console.log(`${name.padEnd(8)} moved up ${up.length}/${N}  broke in GT ${pct(broke.length / Math.max(1, up.length))}  entering GT ${k$(med(up.map(r => r.gtStart)))}  after GT season ${[0, 1].map(i => k$(med(up.map(r => r.gt[i])))).join(' ')}  lowest ${k$(med(up.map(r => r.low)))}`);
    console.log(`  GT seasons: finish ${[0, 1, 2].map(i => med(up.map(r => r.gtPos?.[i] ?? null)) ?? '-').join('/')}, car vs the median team ${[0, 1, 2].map(i => { const v = med(up.map(r => r.gtCar?.[i] ?? null)); return v == null ? '-' : (v > 0 ? '+' : '') + v.toFixed(2); }).join(' / ')}, top 3 ${[0, 1, 2].map(i => `${Math.round(up.filter(r => r.gtPos?.[i] && r.gtPos[i] <= 3).length / Math.max(1, up.length) * 100)}%`).join(' / ')}`);
    if (WORKSN.offers) { console.log(`  works support: offered ${WORKSN.offers}, took ${WORKSN.took}`); WORKSN.offers = 0; WORKSN.took = 0; }
    if (INVS.length || INVOUT.length || OFFERS.n) { console.log(`  investors: met ${MET.n}, offers ${OFFERS.n}, took ${INVS.length} (${INVS.slice(0, 8).map(x => `${k$(x.amt).trim()} for ${Math.round(x.share * 100)}% ${x.s} ${x.y}`).join(', ')}), wanted out ${INVOUT.length} (${INVOUT.join(', ')})`); INVS.length = 0; INVOUT.length = 0; OFFERS.n = 0; MET.n = 0; }
  }
  process.exit(0);
}
console.log(`${N} careers per policy, ${SEASONS} seasons of 6 rounds, driver skill ${SKILL} (0 = fastest). Lump sum ${k$(WC.LOTTERY.lump).trim()}.`);
console.log(`policy    broke  start    end s1   end s2   end s3   lowest   fin s1/s2/s3  rep  arcs  work/yr  caught  flags`);
for (const [name, P] of Object.entries(POLICIES)) {
  if (ONLY && name !== ONLY) continue;
  const runs = []; for (let i = 0; i < N; i++) runs.push(career(P, i + 1));
  const broke = runs.filter(r => r.broke != null), caught = runs.filter(r => r.flags.greyCaught || r.flags.betCaught || r.flags.fraudCaught || r.flags.liesCaught).length;
  const fl = {}; for (const r of runs) for (const [k, v] of Object.entries(r.flags)) fl[k] = (fl[k] || 0) + v;
  console.log(`${name.padEnd(9)} ${pct(broke.length / N)}  ${k$(med(runs.map(r => r.start)))}  ${[0, 1, 2].map(i => k$(med(runs.map(r => r.bal[i])))).join('  ')}  ${k$(med(runs.map(r => r.low)))}  ${[0, 1, 2].map(i => String(med(runs.map(r => r.pos[i])) ?? '-')).join('/').padStart(8)}    ${String(Math.round(med(runs.map(r => r.rep)))).padStart(3)}  ${(runs.reduce((a, r) => a + r.arcs, 0) / N).toFixed(1).padStart(4)}  ${k$(med(runs.map(r => r.work)))}  ${pct(caught / N)}   ${Object.entries(fl).map(([k, v]) => `${k} ${(v / N).toFixed(2)}`).join(', ')}`);
  if (globalThis.LEDGER) { const sum = {}; for (const c of LEDGER) for (const [k, v] of Object.entries(c)) sum[k] = (sum[k] || 0) + v / LEDGER.length; for (const [k, v] of Object.entries(sum).sort((a, b) => a[1] - b[1])) if (Math.abs(v) > 1500) console.log(`   ${k.padEnd(36)} ${Math.round(v / 1000)}k`); globalThis.LEDGER = null; }
  { const sat = runs.filter(r => r.sat), sold = runs.filter(r => r.soldCar); if (sat.length || sold.length) console.log(`  sold the car ${pct(sold.length / N)}, sat rounds out ${pct(sat.length / N)} (${med(sat.map(r => r.sat)) ?? 0} rounds), of those broke ${pct(sat.filter(r => r.broke != null).length / Math.max(1, sat.length))}`); }
  if (caught && caught < N) { const was = (r) => r.flags.greyCaught || r.flags.betCaught || r.flags.fraudCaught || r.flags.liesCaught, cs = runs.filter(was), ns = runs.filter(r => !was(r));
    console.log(`  caught ${cs.length}: broke ${pct(cs.filter(r => r.broke != null).length / cs.length)}, end ${k$(med(cs.map(r => r.end)))}, finish s3 ${med(cs.map(r => r.pos[2])) ?? '-'}, rep ${Math.round(med(cs.map(r => r.rep)))}   never caught ${ns.length}: broke ${pct(ns.filter(r => r.broke != null).length / ns.length)}, end ${k$(med(ns.map(r => r.end)))}, finish s3 ${med(ns.map(r => r.pos[2])) ?? '-'}, rep ${Math.round(med(ns.map(r => r.rep)))}`); }
  if (SEASONLY) { const ok = runs.filter(r => r.broke == null); for (let y = 0; y < SEASONS; y++) { const sum = {}; for (const r of ok) for (const [k, v] of Object.entries(r.sl[y] || {})) sum[k] = (sum[k] || 0) + v / ok.length; const net = Object.values(sum).reduce((a, b) => a + b, 0); console.log(`  season ${y + 1} (${ok.length} that lasted) net ${k$(net)}: ${Object.entries(sum).sort((a, b) => a[1] - b[1]).filter(([, v]) => Math.abs(v) > 800).map(([k, v]) => `${k} ${k$(v).trim()}`).join(', ')}`); } }
  if (globalThis.DEVREF) { console.log('  median AI team car vs the series base (% of a lap; should be AI_AHEAD): ' + Object.entries(DEVREF).map(([k, a]) => { const b = a.slice().sort((x, y) => x - y); return `${k} ${b[Math.floor(b.length / 2)].toFixed(2)}`; }).join(', ')); globalThis.DEVREF = null; }
  if (globalThis.CARWHY) { const ys = [...new Set(CARWHY.map(x => x[0]))].sort(); for (const y of ys) { const rows = CARWHY.filter(x => x[0] === y), sum = {}; for (const [, by] of rows) for (const [k, v] of Object.entries(by)) sum[k] = (sum[k] || 0) + v / rows.length; console.log(`  ${y}: ` + Object.entries(sum).filter(([, v]) => Math.abs(v) > 0.02).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v.toFixed(2)}`).join(', ')); } CARWHY.length = 0; }
  console.log(`          car vs the median team (% of a lap, end of each season): ${[0, 1, 2].map(i => { const v = med(runs.map(r => r.car?.[i] ?? null)); return v == null ? '-' : (v > 0 ? '+' : '') + v.toFixed(2); }).join(' / ')}`);
  if (ONLY) for (const [i, r] of runs.entries()) console.log(`  #${i + 1} ${r.broke != null ? `broke after ${r.broke} rounds` : 'ok'}  end ${k$(r.end)}  low ${k$(r.low)}  finish ${r.pos.join('/')}  ${JSON.stringify(r.flags)}`);
}
