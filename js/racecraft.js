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

const fwd = (T, a, b) => ((b - a + T.N) % T.N) * T.ds; // (m forward from sample a to b)
// how hard a hunting driver pushes, by class: an F1 runs out of grip a step past its plan (slid 4-5x as often at the
// street car's push), a GT1 car shrugs it off (as aiskill.js's TECH_SCALE)
const PUSH = { street: 1, gt1: 1.3, f1: 0.35 };

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
function nextCorner(R, idx, V) {
  const T = R.T, L = R.corners.list;
  let c = null, d = Infinity;
  for (const x of L) { const k = fwd(T, idx, x.apex); if (k < d && k > 2) { d = k; c = x; } }
  if (!c) return null;
  const bp = brakePoint(T, V, c), dB = fwd(T, idx, bp);
  return { c, bp, dB: dB > d ? 0 : dB, dA: d }; // (dB 0: already in its braking zone)
}

const racing = (o) => !o.gone && !o.wreck && !o.pitting && !o.finished && o.phys.speed > 12;

export function passPlan(R, car, dt, yellow) {
  const ai = car.ai, T = R.T, p = car.phys, u = Math.max(0, p.u);
  const aggr = ai.aggr ?? 0.6, craft = ai.craft ?? 0.6;
  ai.passCd = (ai.passCd || 0) - dt;
  let P = ai.pass;
  const log = (ev, x = P) => { if (R.passLog && x) R.passLog.push({ t: +R.raceTime.toFixed(1), a: car.name, b: x.o.name, kind: x.kind, ev, lap: car.lap, g: +(x.o.progress - car.progress).toFixed(1), dv: +x.dv.toFixed(1), dB: R.passDbg ? R.passDbg(car) : undefined }); };
  const end = (ev, cd) => { log(ev); ai.pass = P = null; ai.passCd = cd; };
  const off = R.state !== 'racing' || yellow || ai.lane || car.pitting || car.giveBack || car.blue || ai.yieldTo || ai.err && ai.err.phase != null && ai.err.t > 0.2;
  if (P) {
    const o = P.o, g = o.progress - car.progress;
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
      // pull out (the slingshot): the tow's brought us onto its gearbox and we're still closing, with time left to get
      // alongside before the braking point; or clearly quicker anyway on a long straight (a drag past)
      if (nc && nc.dB > 15) {
        const tb = P.tb;
        const close = g < 2 * lenA + 2 + 2 * aggr && P.dv > 0.3 && tb > 0.8, quick = P.dv > 3 && tb > 2.5 && g < 12;
        // will we be there? the gap at the braking point at today's closing speed (a little of it is lost out of the tow)
        const there = g - Math.max(0, P.dv) * tb * 0.7 < 2 * lenA + 2 * aggr;
        if ((close && there) || quick) {
          // (a car's width beside them at the braking point, where they'll be on their line: on a long straight the line
          // may sit on the inside now and only swing out for the corner later)
          const W2b = T.W[nc.bp] / 2 - 1.3, ins = nc.c.dir, room = (s) => s * (R.line[nc.bp] + s * 3.0) <= W2b;
          let side = cov ? -ins : ins;
          if (!room(side) && room(-side) && (tb > 2.5 || side !== ins)) side = -side;
          // (the outside: only with a long straight left to get by on, longer for a good racer)
          if (room(side) && (side === ins || tb > 2.2 + 1.5 * craft)) { P.stage = 'out'; P.side = side; P.c = nc.c; P.kind = side === ins ? 'inside' : 'outside'; log('try'); }
        }
      }
    }
    if (P.stage === 'out') {
      P.at = Math.max(-W2, Math.min(W2, o.s + P.side * 3.0));
      // (the door shut on us: near the braking point, or anywhere before we're overlapping, the car ahead drifting back
      // across toward its line: tuck in behind rather than get squeezed against the edge into its gearbox)
      const shut = P.side * (o.s + P.side * 3.0) > W2 + 0.6;
      if (shut && (nc && nc.c === P.c && nc.dB < 50 || g > lenA + 1)) { P.stage = 'yield'; P.t = 0; log('shut'); }
      // at the braking point: the corner's ours if we're far enough alongside, else drop in behind
      // (on the outside it's decided earlier, 40 m out: turning in alongside a car on the inside that isn't behind
      // us is where the outside passes touched, as it ran out wide on the exit)
      else if (!nc || nc.c !== P.c || nc.dB < (P.side === P.c.dir ? 3 : 40)) {
        const inside = P.side === P.c.dir, own = inside ? g <= lenA - 0.4 : g <= -0.3;
        // (on the inside, a little short of it is still a go: brake later than them and be alongside by turn-in, halfway
        // to the apex; the more aggressive the driver, the further back they'll try it from)
        const reach = inside && g <= lenA + 1 + 3 * aggr * (1.2 - craft); // (a hothead lunges from further back)
        if (own || reach) { P.stage = 'dive'; P.own = own; P.push = 0.012 + 0.025 * aggr; P.turn = fwd(T, car.idx, P.c.apex) / 2; log(own ? 'own' : 'lunge'); }
        else if (g > -lenA) { P.stage = 'yield'; P.t = 0; log('yield'); }
      }
    }
    if (P.stage === 'dive') {
      P.at = Math.max(-W2, Math.min(W2, o.s + P.side * 2.9));
      // a lunge: alongside (front at their mirror) by turn-in makes the corner ours; not there by then, back out of it
      if (!P.own) {
        const toApex = fwd(T, car.idx, P.c.apex);
        if (g <= lenA - 0.4) { P.own = true; log('own'); }
        else if (toApex < P.turn || toApex > T.L / 2) { P.stage = 'yield'; P.push = 0; P.t = 0; log('backout'); return P; }
      }
      if (fwd(T, P.c.apex, car.idx) < T.L / 2) P.push = 0; // (past the apex: the late braking's done)
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
  if (off || ai.passCd > 0 || ai.passT > 0 || (car.lap < 1 && R.raceTime < 10)) return null;
  ai.passT = 0.1;
  let o = null, g = Infinity;
  for (const x of R.cars) {
    if (x === car || !racing(x)) continue;
    const d = x.progress - car.progress;
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
