// Racecraft: an AI driver's plan to pass the car ahead, decided early and held, the way a driver sets a move up.
// The old way only reacted: a car that caught another braked to sit ~0.2 s behind it, pulled out only when it was already
// quicker that instant (to whichever side was away from the line), and drifted back once it was out. So cars queued:
// within a second of each other a third of the race, alongside 0.1-0.5% of it.
//
// A plan (car.ai.pass), stage by stage:
//   tow    the target picked (the car ahead, within reach): follow closer than usual, in its slipstream
//   out    pulled out (late on the straight, to the inside of the next corner, or the outside on a long drag) to be
//          alongside by the braking point; the lateral spot is held, not re-decided every frame
//   dive   at the braking point with the overlap the rules ask for (front level with their mirror on the inside, ahead
//          of their nose on the outside): the corner's ours. The defender has to leave a car's width (race.js), and we
//          brake a little later than the plan (push), accepting a slower exit
//   cut    the defender has covered the inside: stay wide on the way in, square it off, and get the better exit (the
//          cut back); then tow again for the straight after
//   yield  no overlap at the braking point: drop in behind (follow them whatever the lane), then a cooldown
// Done once we're a car's length clear. Every try, claim, pass and give-up goes in race.passLog (dev: aiseed.mjs).
// How a driver goes about it is their aggression (ai.aggr: how close they follow, how much they push, how far back they
// will try from) and racecraft (ai.craft: reading a covered inside and cutting back rather than diving into a shut door).
// opts.pass 'old': none of this (race.js's old reactions).
// Free of THREE / the DOM.

import { CARS } from './cars.js';
import { bodyBox } from './contact.js';

const fwd = (T, a, b) => ((b - a + T.N) % T.N) * T.ds; // (m forward from sample a to b)
// how hard a hunting driver pushes, by class: an F1 runs out of grip a step past its plan (slid 4-5x as often at the
// street car's push), a GT1 car shrugs it off (as aiskill.js's TECH_SCALE)
const PUSH = { street: 1, gt2: 1.15, gt1: 1.3, f1: 0.35 };

// where the braking for corner c starts on a speed plan V: back from the apex while the plan keeps rising
const BP = new WeakMap();
export function brakePoint(T, V, c) {
  let m = BP.get(V); if (!m) BP.set(V, m = new Map());
  if (m.has(c)) return m.get(c);
  const N = T.N, n = Math.round(700 / T.ds);
  let vmax = V[c.apex], best = c.apex;
  for (let k = 1; k < n; k++) {
    const j = (c.apex - k + N) % N;
    if (V[j] > vmax + 0.02) { vmax = V[j]; best = j; } else if (V[j] < vmax - 0.6) break;
  }
  m.set(c, best);
  return best;
}

// the next corner whose apex is still ahead (and its braking point)
export function nextCorner(R, idx, V) {
  const T = R.T, L = R.corners.list;
  let c = null, d = Infinity;
  for (const x of L) { const k = fwd(T, idx, x.apex); if (k < d && k > 2) { d = k; c = x; } }
  if (!c) return null;
  const bp = brakePoint(T, V, c), dB = fwd(T, idx, bp);
  return { c, bp, dB: dB > d ? 0 : dB, dA: d }; // (dB 0: already in its braking zone)
}

// (m from a to b along the road, the shorter way: on the opening lap a grid that straddles the line has cars a lap
// apart on paper a few metres apart on the road; seen as 3.9 km ahead, a plan on one was dropped as soon as it was made)
const gapTo = (R, a, b) => { let g = b.progress - a.progress; const L = R.T.L; if (Math.abs(g) > L / 2 && a.lap <= 1 && b.lap <= 1) g = ((g % L) + L * 1.5) % L - L / 2; return g; };
// out-braking: the gap (m, centre to centre) we'll have when we reach our own latest braking point for corner c, at
// ~80% of our grip down to its apex speed; from the closing speed now and the car ahead's braking (we're not, yet)
function gapAtBrake(R, car, o, c, g, dv) {
  const T = R.T, p = car.phys, u = Math.max(0, p.u), V = car.lineV || R.lineV, toApex = fwd(T, car.idx, c.apex);
  if (toApex > T.L / 2) return { g, tB: 0 };
  const vA = V[c.apex] * (car.ai.pace || 1), aB = 0.8 * 9.81 * (p.p.mu || 1.3), dStop = Math.max(0, (u * u - vA * vA) / (2 * aB)), tB = Math.max(0, (toApex - dStop) / Math.max(10, u));
  return { g: g - Math.max(0, dv) * tB - 0.5 * Math.max(0, -(o.acc || 0)) * tB * tB, tB };
}
const racing = (o) => !o.gone && !o.wreck && !o.pitting && !o.finished && o.phys.speed > 12;

// the lane map (Speed Dreams Simplix's idea, our own code): where the cars round us will be over the next second or two,
// across the road. Each is carried on at its speed and braking now, keeping its distance off its racing line, so one
// whose line swings across the road swings with it. pathClear: does a move from where we are to spot `to` across the
// road, at vy m/s sideways, keep out of every other car's box (a margin round it) for H s? (only: just that car)
// Moves started without it were most of what went wrong: pulled out into the lane the car ahead was about to take, or
// a lunge's nose still behind the gearbox it was crossing (F1, lap 1: a 5.6 m lunge into the rear of the car ahead)
export function pathClear(R, car, to, vy = 3.5, H = 1.2, only = null) {
  const T = R.T, N = T.N, u = Math.max(0, car.phys.u), aA = car.acc || 0, bA = bodyBox(car.phys.p);
  for (const o of only ? [only] : R.cars) {
    if (o === car || !racing(o)) continue;
    const g0 = gapTo(R, car, o);
    if (g0 < -25 || g0 > 70) continue;
    const bO = bodyBox(o.phys.p), uo = Math.max(0, o.phys.u), ao = o.acc || 0, oOff = o.s - R.line[o.idx];
    const ahead = g0 > 0, len = (ahead ? bA.f + bO.r : bO.f + bA.r) + 0.8, wid = bA.w + bO.w + 0.4;
    for (let t = 0.1; t <= H + 1e-6; t += 0.1) {
      const g = g0 + (uo - u) * t + 0.5 * (ao - aA) * t * t;
      if (ahead ? g > len : g < -len) continue;
      if ((g > 0) !== ahead && Math.abs(g) > len) continue;
      const sMe = car.s + Math.max(-vy * t, Math.min(vy * t, to - car.s));
      const sO = R.line[(o.idx + Math.round((uo * t + 0.5 * Math.min(0, ao) * t * t) / T.ds) + N) % N] + oOff;
      if (Math.abs(sO - sMe) < wid) return false;
    }
  }
  return true;
}

export function passPlan(R, car, dt, yellow) {
  const ai = car.ai, T = R.T, p = car.phys, u = Math.max(0, p.u);
  const aggr = ai.aggr ?? 0.6, craft = ai.craft ?? 0.6;
  ai.passCd = (ai.passCd || 0) - dt;
  let P = ai.pass;
  const log = (ev, x = P) => { if (R.passLog && x) R.passLog.push({ t: +R.raceTime.toFixed(1), a: car.name, b: x.o.name, kind: x.kind, ev, lap: car.lap, g: +(x.o.progress - car.progress).toFixed(1), dv: +x.dv.toFixed(1), dB: R.passDbg ? R.passDbg(car) : undefined }); };
  const end = (ev, cd) => { log(ev); ai.pass = P = null; ai.passCd = cd; };
  const pack = R.opts.pack !== false; // (the start: racing from 3 s, side by side into the first corners. false: as before)
  const off = R.state !== 'racing' || yellow || (ai.lane && !(pack && R.raceTime > 3)) || car.pitting || car.giveBack || car.blue || ai.yieldTo || ai.err && ai.err.phase != null && ai.err.t > 0.2;
  if (P) {
    const o = P.o, g = gapTo(R, car, o);
    P.dv += ((u - Math.max(0, o.phys.u)) - P.dv) * Math.min(1, dt * 3);
    P.t += dt;
    const lenA = 2.3; // (half a car, about: the overlap tests below are on the cars' centres)
    if (off || !racing(o)) { end('abort', 2); return null; }
    if (g < -(2 * lenA + 1.5)) { log('done'); ai.pass = P = null; ai.passCd = 1; return null; } // past and clear
    if (g > 34 && P.stage !== 'yield') { end('drop', 2); return null; }
    const V = car.lineV || R.lineV, nc = nextCorner(R, car.idx, V);
    const W2 = T.W[car.idx] / 2 - 1.3;
    P.tb = nc ? nc.dB / Math.max(10, u) : 0; // (seconds to the next braking point: race.js lets a tow close right up until ~1 s out)
    if (P.stage === 'tow') {
      P.at = null;
      // the defender covering the inside of the corner coming up (moved over for it, or sat there)
      const cov = nc && ((o.s - R.line[o.idx]) * nc.c.dir > 1.2 || (o.ai && o.ai.dMove && o.ai.dMove.side === nc.c.dir));
      // read it: a good racer sees the door shut and goes for the cut back; a poor one may still dive
      if (nc && cov && nc.dB < 110 && g < 14 && P.dv > -1 && P.cTried !== nc.c) {
        P.cTried = nc.c;
        if (Math.random() < 0.25 + 0.7 * craft) { P.stage = 'cut'; P.c = nc.c; P.kind = 'cut'; log('try'); return P; }
      }
      // out-braking: sat on its gearbox as the braking zone comes, with the inside clear, a driver can go for it from
      // the tow: down the inside and on the brakes later than them (the dive's late braking, race.js), alongside by
      // turn-in or back out (as a lunge). Once a corner; the more aggressive from further back and more often. (Only
      // ever from alongside at the braking point, two equal cars never got there: most tries ended in a yield.)
      // opts.outbrake false: not this
      // (or already on the brakes and still closing, before turn-in: most of an out-braking move is made in the braking zone)
      // (in it: they're on the brakes, or we are. The corner list's braking point can't be trusted for one corner run
      // into the next: it put T4's 4 m before its apex while both cars were already braking for it)
      const onBrakes = (o.ctl && o.ctl.brake > 0.15) || (car.ctl && car.ctl.brake > 0.15);
      const brkWin = nc && nc.dA > 15 + 0.2 * u && (onBrakes ? P.dv > 0.5 : nc.dB > 0 && nc.dB < 18 + 0.35 * u && P.dv > -1.5);
      // (and from behind it or a little inside already: from its outside the cross behind it took the whole braking zone)
      // (opts.commit: only from on its gearbox. Over 16 seeded races a lunge from 8 m or more back, centre to centre, came
      // off 3 times in 130 whatever the closing speed or the predicted gap at the braking point said; from 6 m or less,
      // 13 of 15. Each one that backed out lost the run and the tow; false: from as far back as before)
      const reachL = R.opts.commit !== false ? 2 * lenA + 1.5 + aggr : 2 * lenA + 2.5 + 4 * aggr + Math.max(0, P.dv) * 1.0;
      if (nc && R.opts.outbrake !== false && !cov && P.lTried !== nc.c && brkWin && g < reachL && (car.s - o.s) * nc.c.dir > -0.8) {
        const ins = nc.c.dir, inRoom = ins * (o.s + ins * 2.9) <= W2 + 0.3 && !R.cars.some(x => x !== car && x !== o && racing(x) && Math.abs(gapTo(R, car, x)) < 9 && Math.abs(x.s - (o.s + ins * 2.9)) < 2.4);
        // (only a move that'll work: alongside, front at their mirror, by our own braking point; a hothead takes it on
        // with a car's length less in hand. Lunges from 12 m back nearly all backed out, and cost the time they took)
        const pred = gapAtBrake(R, car, o, nc.c, g, P.dv).g, will = pred < lenA - 0.4 + 1 + 3 * aggr * (1.2 - craft);
        // (and the way across clear of its gearbox and anyone else, as they'll move: the lane map. opts.laneMap false: not this)
        const way = R.opts.laneMap === false || !inRoom || !will || pathClear(R, car, Math.max(-W2, Math.min(W2, o.s + ins * 2.9)), 3.5, 1.2);
        if (inRoom && will && way) P.lTried = nc.c; // (one go a corner, once it's on)
        if (inRoom && will && way && Math.random() < 0.25 + 0.6 * aggr) { P.stage = 'dive'; P.side = ins; P.c = nc.c; P.kind = 'brake'; P.own = false; P.push = 0.012 + 0.025 * aggr; P.late = 1; P.turn = fwd(T, car.idx, P.c.apex) / 2; P.pred = pred; log('try'); log('lunge'); return P; }
      }
      // pull out (the slingshot): the tow's brought us onto its gearbox and we're still closing, with time left to get
      // alongside before the braking point; or clearly quicker anyway on a long straight (a drag past)
      if (nc && nc.dB > 15) {
        const tb = P.tb;
        const close = g < 2 * lenA + 2 + 2 * aggr && P.dv > 0.3 && tb > 0.8, quick = P.dv > 3 && tb > 2.5 && g < 12;
        // (the opening lap, the field still bunched: tucked up behind one with clear road beside it, a driver doesn't
        // queue, they pull alongside for the braking zone whether or not they're quicker; queued in single file, the
        // pack braked behind each other into every corner and a car from the back went round the lot of them)
        const bunched = pack && car.lap <= 1 && g < 2 * lenA + 3 + 2 * aggr && P.dv > -1.5 && tb > 1.2;
        // will we be there? the gap at the braking point at today's closing speed (a little of it is lost out of the tow)
        // (a driver who'll out-brake them counts on the braking zone to finish the job: up to a car and a half more, on
        // the inside, the more aggressive the more)
        const ob = R.opts.outbrake !== false && !cov ? 3 + 4 * aggr : 0;
        const there = g - Math.max(0, P.dv) * tb * 0.7 < 2 * lenA + 2 * aggr + ob;
        const closeB = ob && g < 2 * lenA + 2 + 2 * aggr + ob && P.dv > 0.3 && tb > 0.6 && tb < 3;
        if (((close || closeB) && there) || quick || bunched) {
          // (a car's width beside them at the braking point, where they'll be on their line: on a long straight the line
          // may sit on the inside now and only swing out for the corner later)
          const W2b = T.W[nc.bp] / 2 - 1.3, ins = nc.c.dir, room = (s) => s * (R.line[nc.bp] + s * 3.0) <= W2b;
          // (and nobody already there: in a pack the lane beside may be taken)
          // (with the lane map: that lane clear all the way out to it and on for a while, as everyone's line takes them)
          const free = (sd) => !R.cars.some(x => x !== car && x !== o && racing(x) && Math.abs(gapTo(R, car, x)) < 9 && Math.abs(x.s - (o.s + sd * 3.0)) < 2.4) && (R.opts.laneMap === false || pathClear(R, car, Math.max(-W2, Math.min(W2, o.s + sd * 3.0)), 3.5, Math.min(2, Math.max(1, tb))));
          // (room for it now as well, where they are: on the straight their line may run them along that edge for now; wait)
          const roomNow = (sd) => !pack || sd * (o.s + sd * 3.0) <= W2;
          let side = cov ? -ins : ins;
          if (closeB && !close && !quick && !bunched && (!room(ins) || !roomNow(ins) || !free(ins))) side = 0; // (the out-braking set-up is the inside or nothing)
          if (!room(side) && room(-side) && (tb > 2.5 || side !== ins)) side = -side;
          // (the outside: only with a long straight left to get by on, longer for a good racer)
          // (opts.commit: the outside is a drag past, decided 40 m before the braking point: only if we'll be ahead by then
          // at the closing speed we have, a little of it lost out of the tow, with a car's width beside their line all the
          // way there. Their line swinging out for the corner shut 141 of the Miatas' 397 tries: pulled out, tucked back in)
          const lane = (sd, to) => { for (let d = 0; d < to; d += 8) { const k = (car.idx + Math.round(d / T.ds)) % T.N; if (sd * (R.line[k] + sd * 3.0) > T.W[k] / 2 - 1.0) return false; } return true; };
          const toD = Math.max(0, nc.dB - 40), dragOk = R.opts.commit === false || bunched || side === ins || (g - Math.max(0, P.dv) * 0.8 * toD / Math.max(10, u) < -0.3 + 1.5 * aggr && lane(side, toD));
          if (side && dragOk && room(side) && roomNow(side) && free(side) && (side === ins || tb > 2.2 + 1.5 * craft)) { P.stage = 'out'; P.side = side; P.s0 = o.s; P.c = nc.c; P.kind = side === ins ? 'inside' : 'outside'; log('try'); }
        }
      }
    }
    if (P.stage === 'out') {
      P.at = Math.max(-W2, Math.min(W2, o.s + P.side * 3.0));
      // (the door shut on us: near the braking point, or anywhere before we're overlapping, the car ahead drifting back
      // across toward its line: tuck in behind rather than get squeezed against the edge into its gearbox)
      const shut = P.side * (o.s + P.side * 3.0) > W2 + 0.6;
      // (shut: they've moved across toward that side since we pulled out, or it's the braking zone. Their line running
      // along that edge on its own isn't a door being shut: called that, nearly every try was given up the frame it began)
      const moved = !pack || P.s0 == null || P.side * (o.s - P.s0) > 0.8;
      if (shut && (nc && nc.c === P.c && nc.dB < 50 || g > lenA + 1 && moved)) { P.stage = 'yield'; P.t = 0; log('shut'); }
      // at the braking point: the corner's ours if we're far enough alongside, else drop in behind
      // (on the outside it's decided earlier, 40 m out: turning in alongside a car on the inside that isn't behind
      // us is where the outside passes touched, as it ran out wide on the exit)
      else if (!nc || nc.c !== P.c || nc.dB < (P.side === P.c.dir ? 3 : 40)) {
        const inside = P.side === P.c.dir, own = inside ? g <= lenA - 0.4 : g <= -0.3;
        // (on the inside, a little short of it is still a go: brake later than them and be alongside by turn-in, halfway
        // to the apex; the more aggressive the driver, the further back they'll try it from)
        const reach = inside && g <= lenA + 1 + 3 * aggr * (1.2 - craft) + (R.opts.outbrake !== false ? 2 + 3 * aggr + Math.max(0, P.dv) * 0.5 : 0); // (a hothead lunges from further back; out-braking, further still: the braking zone's where it's won)
        if (own || reach) { P.stage = 'dive'; P.own = own; P.push = 0.012 + 0.025 * aggr; P.late = R.opts.outbrake !== false ? (own ? 0.5 : 1) : 0; P.turn = fwd(T, car.idx, P.c.apex) / 2; log(own ? 'own' : 'lunge'); }
        else if (g > -lenA) { P.stage = 'yield'; P.t = 0; log('yield'); }
      }
    }
    if (P.stage === 'dive') {
      P.at = Math.max(-W2, Math.min(W2, o.s + P.side * 2.9));
      // a lunge: alongside (front at their mirror) by turn-in makes the corner ours; not there by then, back out of it
      if (!P.own) {
        const toApex = fwd(T, car.idx, P.c.apex);
        // (out-braking: judged at our own latest braking point, not halfway in: will we be alongside by the time we have
        // to be on the brakes? Not, and it's back out while there's still the road to drop in behind; it was decided
        // later than that at lunge speed, and the give-up ran into the back of them)
        let out = toApex < P.turn || toApex > T.L / 2;
        if (P.late && toApex < T.L / 2) { const k = gapAtBrake(R, car, o, P.c, g, P.dv); out = k.tB < 0.15 && g - Math.max(0, P.dv) * 0.6 > lenA - 0.4; }
        if (g <= lenA - 0.4) { P.own = true; log('own'); }
        else if (out) { P.stage = 'yield'; P.push = P.late = 0; P.t = 0; log('backout'); return P; }
      }
      if (fwd(T, P.c.apex, car.idx) < T.L / 2) P.push = P.late = 0; // (past the apex: the late braking's done)
      const ex = fwd(T, P.c.exit, car.idx);
      if (ex > 25 && ex < T.L / 2) { P.own = false; P.stage = 'tow'; P.at = null; P.kind = 'tow'; } // (still behind out of it: the next straight)
    }
    if (P.stage === 'cut') {
      P.at = null; // (the racing line: wide in, tight out)
      const ex = fwd(T, P.c.apex, car.idx);
      if (ex > 20 && ex < T.L / 2) { P.stage = 'tow'; } // (the exit: now the straight)
    }
    if (P.stage === 'yield') { P.at = null; if (P.t > 2) end('gaveup', 2.5 + 2 * (1 - aggr)); }
    return P;
  }
  // a new plan: ten times a second, the nearest car ahead within reach
  ai.passT = (ai.passT || 0) - dt;
  if (off || ai.passCd > 0 || ai.passT > 0 || (car.lap < 1 && R.raceTime < (pack ? 3 : 10))) return null;
  ai.passT = 0.1;
  let o = null, g = Infinity;
  for (const x of R.cars) {
    if (x === car || !racing(x)) continue;
    const d = gapTo(R, car, x);
    if (pack && car.lap <= 1 && Math.abs(x.s - car.s) > 2.4) continue; // (in the opening lap's pack: the car in our lane, not one a column over on the grid)
    if (d > 1 && d < g) { g = d; o = x; }
  }
  if (!o || g > 14 + 18 * aggr || u < 15) return null;
  if (ai.hold && ai.hold.car === o && R.raceTime < ai.hold.until) return null; // (a teammate told to hold station)
  if (o.blue || (o.rc && o.rc.hold > 0)) return null; // (moving over for us anyway / owes the place back)
  // att: hunting it down, the driver pushes past the plan's corner speeds: the closing speed a pass needs between equal
  // cars comes from that risk (and what it costs: a wide exit, onto the sidewalk, from the physics). The aggressive push
  // hardest; good racecraft pushes less (an ace barely overdrives, waiting for the move; a hothead with poor racecraft
  // runs wide chasing it: most of the AI's time off the road in a race was cars hunting, on corner exits)
  ai.pass = P = { o, stage: 'tow', kind: 'tow', dv: u - Math.max(0, o.phys.u), t: 0, at: null, side: 0, own: false, push: 0, hw: 0.06 + 0.12 * (1 - aggr), att: (R.opts.attack ?? 1) * (PUSH[CARS[car.carId]?.cls] ?? 1) * (0.005 + 0.014 * aggr) * (1.3 - 0.7 * craft) };
  return P;
}

// the defender's side of it: a car that has claimed the corner off us (dive, alongside at the braking point), or sits
// in our blind side mid-move. Returns { side, s } for the attacker to leave room for, or null.
export function claimOn(car, o) {
  const P = o.ai && o.ai.pass;
  if (!P || P.o !== car) return null;
  if (P.stage === 'dive' && P.own) return { side: P.side, s: o.s };
  return null;
}
