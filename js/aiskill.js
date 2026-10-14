// An AI driver's skill as driving technique plus pace. A clean, quick driver drives the learned plan as it is; a less
// skilled one has flaws you can see (on the power too early, a line that wanders, braking points that vary) and, on
// top, a pace multiplier on the plan, so a driver's total gap to a clean lap is what their rating says in any car on
// any circuit, though each flaw and the pace multiplier cost different amounts in each (an M1 at Auburn barely
// notices pace 0.97, an Aventus loses 0.7%): race.js measures both when it builds the race (techFor, paceCurve) and
// aiControls applies the flaws (car.ai.skill).
// Measured 2026-10-02 at Auburn, three-lap averages (.devtest/linebench/devstat.mjs): see the tables.
// Free of THREE / the DOM.

// lap time lost (%) at a pace multiplier, by class: the plan's speed matters less where the car can't reach it anyway
// (an F1 barely notices 0.94; its straights and downforce corners are limited by the car, not by the plan)
const PACE_COST = {
  street: [[1, 0], [0.97, 0.35], [0.94, 1.2], [0.91, 2.25], [0.85, 5], [0.8, 8]],
  gt1:    [[1, 0], [0.97, 0.45], [0.94, 1.35], [0.91, 2.65], [0.85, 5.5], [0.8, 8.5]],
  gt2:    [[1, 0], [0.97, 0.4], [0.94, 1.3], [0.91, 2.45], [0.85, 5.25], [0.8, 8.25]], // (not measured: between street and GT1)
  f1:     [[1, 0], [0.97, 0.05], [0.94, 0.15], [0.91, 0.8], [0.85, 4], [0.8, 7]],
};
const clsOf = (cls) => PACE_COST[cls] ? cls : 'street'; // (the fun class drives like the street one)
const lerpTable = (tab, x, a, b) => {
  const e0 = tab[0][a], e1 = tab[tab.length - 1][a];
  x = Math.max(Math.min(e0, e1), Math.min(Math.max(e0, e1), x));
  for (let i = 1; i < tab.length; i++) {
    const p = tab[i - 1], q = tab[i];
    if ((x - p[a]) * (x - q[a]) <= 0) return p[b] + (q[b] - p[b]) * ((x - p[a]) / ((q[a] - p[a]) || 1));
  }
  return tab[tab.length - 1][b];
};
export const paceCost = (cls, pace) => lerpTable(PACE_COST[clsOf(cls)], Math.min(1, pace), 0, 1);
export const paceFor = (cls, cost) => lerpTable(PACE_COST[clsOf(cls)], Math.max(0, cost), 1, 0);

// Technique: f = how impatient on the power (0 = patient, 1 = raw), g = how imprecise (line and braking points).
// Each flaw costs a different amount by class (an F1 is very sensitive to them, a GT1 car shrugs them off), so the
// flaws are scaled per class to cost about TECH_FULL % at f = g = 1. An impatient driver also runs with less traction
// control (with full TC the extra throttle is caught and costs nothing).
const TECH_SCALE = { street: 0.75, gt2: 1.2, gt1: 1.6, f1: 0.35 };
const TECH_FULL = 1.2;
export function technique(cls, f, g) {
  const k = TECH_SCALE[clsOf(cls)], fi = Math.min(1, f * k);
  if (f <= 0 && g <= 0) return { skill: null, tc: 1, cost: 0 };
  return {
    skill: { imp: fi, wander: +(1.2 * g * k).toFixed(2), brake: +(0.04 * g * k).toFixed(4) },
    tc: 1 - 0.5 * fi,
    cost: TECH_FULL * Math.pow((f + g) / 2, 1.3),
  };
}

// a driver's knobs for a race: total = their gap to a clean lap (%), f / g their technique. The flaws are kept to about
// 70% of the gap (by the estimate above); race.js measures what they really cost in the car on the circuit (techFor)
// and sets the pace multiplier to make up the rest.
export function knobsFor(cls, total, f, g) {
  f = Math.max(0, Math.min(1, f)); g = Math.max(0, Math.min(1, g));
  let t = technique(cls, f, g);
  if (t.cost > 0.7 * total) {
    const s = total > 0 ? Math.pow(0.7 * total / t.cost, 1 / 1.3) : 0;
    t = technique(cls, f * s, g * s);
  }
  return { gap: total, skill: t.skill, tc: t.tc, cost: t.cost };
}

// A car's measured pace curve on a circuit (race.js paceCurve): [[1, 0], [0.97, c], [0.94, c], [0.88, c]], lap time
// lost (%) at each pace, read in straight lines between the points
export function curveCost(C, pace) {
  if (pace >= 1) return 0;
  for (let i = 1; i < C.length; i++) if (pace >= C[i][0]) { const [p0, c0] = C[i - 1], [p1, c1] = C[i]; return c0 + (c1 - c0) * (p0 - pace) / (p0 - p1); }
  const [p0, c0] = C[C.length - 2], [p1, c1] = C[C.length - 1];
  return c1 + (c1 - c0) * (p1 - pace) / (p0 - p1);
}
export function curvePace(C, cost) {
  if (cost <= 0) return 1;
  for (let i = 1; i < C.length; i++) if (cost <= C[i][1]) { const [p0, c0] = C[i - 1], [p1, c1] = C[i]; return p0 - (p0 - p1) * (cost - c0) / Math.max(1e-3, c1 - c0); }
  const [p0, c0] = C[C.length - 2], [p1, c1] = C[C.length - 1];
  return Math.max(0.7, p1 - (p0 - p1) * (cost - c1) / Math.max(1e-3, c1 - c0));
}

// the gap (%) a career rating stood for before techniques (race pace = 1 - (95 - r) * 0.0011 in a GT1 car), kept as the
// target so the World Career's balance (and its simulated races) stay as they were, now in every class (in an F1 that
// old pace multiplier barely separated anyone)
export const ratingGap = (r) => paceCost('gt1', Math.max(0.88, Math.min(1, 1 - (95 - r) * 0.0011)));
