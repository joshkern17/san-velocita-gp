// Drift scoring: one DriftScore per car. Pure game logic (no DOM / audio), so the same scorer can run for every car in
// an online drift battle later; the HUD (drifthud.js) reads its state and events.
//
// A drift CHAIN starts when the car slides past START_ANGLE at speed. While it lasts:
//   points  flow in every second: speed x angle (steeper and faster = more)
//   mult    grows the longer you hold it (+0.5 every 2 s), +1 for every transition (the slide flips from one side to the
//           other, left-to-right), +0.5 for a big angle held, bonuses for long drifts. Capped at MAX_MULT.
//   grace   drop below the angle (or straighten between two corners) and the chain waits GRACE seconds for the next
//           drift, so connected drifts become one chain
// When the grace runs out the chain BANKS: points x mult go into the total.
// Crashing (wall / car contact), spinning out or running off the track during a chain LOSES it.

export const DRIFT = {
  START_ANGLE: 12,    // degrees of body slip to count as drifting
  MIN_SPEED: 8.3,     // m/s (30 km/h)
  GRACE: 1.25,        // s a chain survives between drifts
  RATE: 9,            // points per second per (m/s x angle factor)
  MAX_MULT: 10,
  CRASH_IMPACT: 4.5,  // m/s into a wall / another car
  SPIN_ANGLE: 115,    // degrees: past this you've spun
  OFFTRACK_T: 0.9,    // s off the tarmac before the chain is lost
  BIG_ANGLE: 45,      // degrees held for BIG_T for the big-angle bonus
  BIG_T: 0.8,
  COOLDOWN: 1.0,
  TRANSITION_ANGLE: 25, // degrees BOTH drifts must reach for a side-to-side flip to count (not a little fishtail)     // s after losing a chain before the next can start
};
const deg = (r) => r * 180 / Math.PI;

export class DriftScore {
  constructor() {
    this.total = 0; this.best = 0; this.chains = 0;
    this.events = [];
    this.reset();
  }
  reset() {
    this.active = false;     // a chain is running (drifting or in grace)
    this.drifting = false;   // sliding right now
    this.points = 0;         // raw chain points (banked as points x mult)
    this.mult = 1;
    this.chainT = 0;         // time spent drifting in this chain
    this.segT = 0;           // time in the current drift (since the last transition)
    this.graceT = 0;         // time since the slide stopped
    this.side = 0;           // which way we're sliding (+1 / -1)
    this.angle = 0;          // |slip| in degrees (for the meter)
    this.bigT = 0; this.bigGiven = false;
    this.offT = 0;
    this.nextLong = 5;       // next long-drift bonus (s)
    this.nextStep = 2;       // next duration multiplier step (s)
    this.transitions = 0;
    this.segMax = 0;         // biggest angle in the current drift
    this.pendingT = false;   // flipped sides after a proper drift: counts once this one gets big enough too
  }
  emit(type, extra = {}) { this.events.push({ type, ...extra }); }
  addMult(k, why) {
    const before = this.mult;
    this.mult = Math.min(DRIFT.MAX_MULT, Math.round((this.mult + k) * 10) / 10);
    if (this.mult > before) this.emit('mult', { mult: this.mult, why, gain: this.mult - before });
  }
  get value() { return Math.round(this.points * this.mult); }

  // car: race car (phys, onRoad, impact). racing: points only count once the race is on
  update(dt, car, racing = true) {
    const p = car.phys;
    const impact = car.impact || 0; car.impact = 0;
    if (!racing) { if (this.active) this.bank(); return; } // (crossing the line / pitting cashes the chain in)
    const u = p.u, v = p.v, speed = p.speed;
    const beta = speed > 3 ? deg(Math.atan2(v, Math.max(0.5, Math.abs(u)))) : 0;
    const a = Math.abs(beta);
    this.angle = a;
    const offRoad = !car.onRoad && car.surface !== 'kerb' && !car.publicRoad && car.surface !== 'walk';

    // chain killers
    if (this.active) {
      if (impact > DRIFT.CRASH_IMPACT) return this.lose('crash');
      if (a > DRIFT.SPIN_ANGLE && speed > 4) return this.lose('spin');
      if (u < -1) return this.lose('spin');
      this.offT = offRoad ? this.offT + dt : 0;
      if (this.offT > DRIFT.OFFTRACK_T) return this.lose('off');
    }

    // (after losing a chain there's a short cooldown before a new one can start)
    if (this.cool > 0) { this.cool -= dt; return; }
    const sliding = a >= DRIFT.START_ANGLE && speed >= DRIFT.MIN_SPEED && !offRoad && u > 0;
    if (sliding) {
      const side = Math.sign(beta);
      if (!this.active) {
        this.reset(); this.active = true; this.side = side;
        this.emit('start');
      } else if (side !== this.side) {
        // the slide flipped from one side to the other within the chain. It's a TRANSITION only if the drift we came
        // out of was a proper one, and it pays out once this one is proper too (a wobble just carries the chain on)
        this.pendingT = this.segMax >= DRIFT.TRANSITION_ANGLE;
        this.side = side; this.segT = 0; this.segMax = 0;
        this.bigT = 0; this.bigGiven = false;
      }
      this.segMax = Math.max(this.segMax, a);
      if (this.pendingT && a >= DRIFT.TRANSITION_ANGLE) {
        this.pendingT = false; this.transitions++;
        this.emit('transition', { n: this.transitions });
        this.addMult(1, 'TRANSITION');
      }
      this.drifting = true; this.graceT = 0;
      this.chainT += dt; this.segT += dt;
      // points: speed x angle factor (12 deg -> 0.2, 30 -> 1.1, 45 -> 1.85, 60+ -> 2.6)
      const af = Math.min(2.6, (a - 8) / 20);
      const gain = DRIFT.RATE * speed * af * dt;
      this.points += gain;
      // multiplier from holding the drift
      if (this.chainT >= this.nextStep) { this.nextStep += 2; this.addMult(0.5, 'HOLD'); }
      if (a >= DRIFT.BIG_ANGLE) {
        this.bigT += dt;
        if (!this.bigGiven && this.bigT >= DRIFT.BIG_T) { this.bigGiven = true; this.addMult(0.5, 'BIG ANGLE'); this.emit('bonus', { label: 'BIG ANGLE' }); }
      } else this.bigT = Math.max(0, this.bigT - dt * 2);
      if (this.chainT >= this.nextLong) {
        const s = this.nextLong; this.nextLong += 5;
        this.points += 250 * (s / 5);
        this.emit('bonus', { label: s >= 15 ? 'MARATHON DRIFT' : s >= 10 ? 'HUGE DRIFT' : 'LONG DRIFT', pts: 250 * (s / 5) });
      }
    } else if (this.active) {
      this.drifting = false;
      this.graceT += dt;
      if (this.graceT >= DRIFT.GRACE) this.bank();
    }
  }
  bank() {
    const pts = this.value;
    this.total += pts; this.chains++; this.best = Math.max(this.best, pts);
    this.emit('bank', { pts, mult: this.mult, raw: Math.round(this.points), total: this.total, t: this.chainT, transitions: this.transitions });
    this.reset();
  }
  lose(why) {
    const pts = this.value;
    this.emit('lose', { why, pts, mult: this.mult });
    this.reset();
    this.cool = DRIFT.COOLDOWN;
  }
  // for the HUD: grace left 0..1 (1 = just stopped sliding)
  get grace() { return this.active && !this.drifting ? 1 - this.graceT / DRIFT.GRACE : this.active ? 1 : 0; }
  // (online battles later: what to send / show for other players)
  snapshot() { return { total: this.total, value: this.active ? this.value : 0, mult: this.mult, active: this.active }; }
}
