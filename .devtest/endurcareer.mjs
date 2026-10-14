// dev: the World Career's endurance round, in node: one 6 Hours a season in GT2 and GT1 only (not the second-last
// round's title decider), your teammate taking your car's result, car two's hired drivers paid on their own result.
//   node .devtest/endurcareer.mjs <a GT2 save.json>   (tools/simcareer.mjs 6 4 --gt --to=gt2 --save=<file>)
import { readFileSync } from 'fs';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const WC = await import('../js/wcareer.js');
const w = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
for (const s of WC.SERIES) { const cal = w.series[s.id].cal, n = cal.filter(c => c.endur).length, k = cal.findIndex(c => c.endur);
  const want = s.path === 'sportscar' && s.tier >= 3;
  ok(want ? n === 1 && k < cal.length - 1 : n === 0, `${s.name}: ${n} endurance round${n === 1 ? ` (round ${k + 1} of ${cal.length}, ${WC.enduranceName(cal[k])})` : 's'}`); }
const sid = w.player.series, S = w.series[sid], k = S.cal.findIndex(c => c.endur);
w.round = k; const R = S.cal[k], clock = WC.enduranceClock(w, R);
ok(Math.abs(clock.duration - 1350) < 2 && Math.abs(clock.clockK - 16) < 0.1 && clock.startHour === 14.5, `Medium: 6 hours in ${clock.duration / 60} minutes (x${clock.clockK.toFixed(1)}), from 2.30 pm`);
// the race: you third, car two (hired) sixth, the others in turn
const m = WC.mateOf(w), ent = WC.raceEntries(w), pids = Object.values(ent.entries).map(e => e.pid).filter(p => p !== m.pid);
const res = [];
let pos = 1; for (const pid of pids) { if (pos === 3) res.push({ isPlayer: true, pos: pos++, best: 90 }); if (pos === 6) res.push({ pid: null, hired: true, pos: pos++, best: 91 }); res.push({ pid, pos: pos++, best: 92 }); }
const bal0 = w.money ? w.money.balance : 0;
const out = WC.recordPlayerRound(w, res, [], { trackside: 0, laps: 30, damage: 0, aidPct: 0, grid: 5, led: 0, blamed: false, teamTrust: 0, car2Pos: 6, car2Dnf: false });
const rows = S.results.find(r => r.round === k).rows, me = rows.find(r => r.pid === 'P'), mate = rows.find(r => r.pid === m.pid);
ok(me && mate && mate.pos === me.pos && mate.pts === me.pts && me.pts > 0, `your teammate scores your car's result (P${me && me.pos}, ${me && me.pts} points each)`);
ok(!rows.some(r => r.pid == null), "car two's hired drivers score no drivers' points");
const items = (out.bill || {}).items || [];
ok(items.some(([k]) => /two hired drivers/.test(k)), `the bill has car two's hired drivers (${(items.find(([k]) => /hired drivers/.test(k)) || [])[1]})`);
ok(items.some(([k]) => /Prize money, second car \(the hired drivers, P6\)/.test(k)), "and car two's prize money on its own result (P6)");
console.log('  bill:', items.map(([k, v]) => `${k} ${v}`).join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
