// Race Control: marshal sectors + flags, track limits, penalties and the stewards' messages.
// One per session. Flags are worked out from where every car is (so each online player sees the same yellows
// without sending them); track limits and penalties are judged by whoever owns the car (you for yours, the host
// for the AI) and a car's penalty seconds travel with its state.
import * as THREE from 'three';
import { placeName } from './realtracks.js';

// 'off': no flags, no penalties. 'arcade': flags + lenient limits (all four wheels past the kerb). 'realistic': the white line.
// kerbOk: the kerbs are part of the track. wideRoom: extra metres allowed past that on the OUTSIDE of a bend (running
// wide is forgiven far more than cutting the inside), wideStrikes: whether running wide can earn a warning at all.
// minT: seconds all four wheels must be out before it counts (a brush over the line doesn't).
// blueWarn/bluePen: seconds holding up a faster car under blue flags. vscWarn/vscPen: how far under the VSC delta
// (seconds) before a warning / a penalty. hit: closing speed (m/s) of a hit from behind that the stewards look at.
// meatball: 'dt' = a drive-through for ignoring the black and orange flag, 'dsq' = the black flag.
export const RULES = {
  off: null,
  arcade:    { kerbOk: true,  wideRoom: 3.0, wideStrikes: false, minT: 0.45, warnAt: 4, penAt: 5, every: 3, giveBack: 12, blueWarn: 8, bluePen: 16, vscWarn: 1.0, vscPen: 3.0, vscCrash: 30, hit: 10, meatball: 'dt' },
  realistic: { kerbOk: false, wideRoom: 1.3, wideStrikes: true,  minT: 0.25, warnAt: 3, penAt: 4, every: 2, giveBack: 8,  blueWarn: 5, bluePen: 10, vscWarn: 0.3, vscPen: 1.5, vscCrash: 26, hit: 7,  meatball: 'dsq' },
};
const PEN = 5;          // seconds per time penalty
const DT_LAPS = 3;      // laps to serve a drive-through
const DT_LATE = 20;     // seconds added for a drive-through never served
export const VSC_PACE = 0.6;   // VSC reference speed: this share of the racing speed plan
const CAR_HALF = 0.95;  // half a car's width: all four wheels are out once the centre is this far past the edge
const KERB_W = 1.3;     // (track.js / race.js surfaceEnv)
const SEV = { y: 1, dy: 2 };

// corners, numbered from the start line the same way trackStats counts them (the "Corners" figure on the setup screen)
export function findCorners(T) {
  const upto = T.open ? T.finish + 1 : T.N, out = [];
  let cur = null;
  for (let i = 0; i < upto; i++) {
    const a = Math.abs(T.K[i]);
    if (a > 1 / 150 && !cur) { cur = { n: out.length + 1, entry: i, apex: i, exit: i, peak: a, sum: 0 }; out.push(cur); }
    if (cur) {
      cur.sum += T.K[i] * T.ds;
      if (a > cur.peak) { cur.peak = a; cur.apex = i; }
      cur.exit = i;
      if (a < 1 / 250) cur = null;
    }
  }
  for (const c of out) c.dir = Math.sign(c.sum) || 1;
  // the corner at (or just before) every sample, for naming places: "Turn 4"
  const at = new Int16Array(T.N).fill(-1);
  for (const c of out) {
    const from = c.entry - Math.round(60 / T.ds), to = c.exit + Math.round(90 / T.ds);
    for (let i = from; i <= to; i++) at[(i + T.N) % T.N] = c.n;
  }
  return { list: out, at };
}

export class RaceControl {
  constructor(race, level) {
    this.race = race;
    this.level = level;
    this.R = RULES[level] || null;
    this.on = !!this.R && race.mode !== 'attract';
    const T = race.T;
    this.corners = race.corners || findCorners(T);
    // marshal sectors, ~220 m each (point-to-point: start to the end of the run-off; the grid lead-in counts as the first)
    const len = T.open ? T.D[T.cut] + T.ds : T.L;
    this.M = Math.max(6, Math.min(30, Math.round(len / 220)));
    this.secLen = len / this.M;
    this.SEC = new Uint8Array(T.N);
    for (let i = 0; i < T.N; i++) this.SEC[i] = T.open && i > T.cut ? 0 : Math.min(this.M - 1, Math.floor(T.D[i] / this.secLen));
    // which way the track is bending around each sample (+1 / -1, 0 on a straight): the inside of a bend is that side
    this.BEND = new Int8Array(T.N);
    const w = Math.max(1, Math.round(40 / T.ds));
    for (let i = 0; i < T.N; i++) {
      let k = 0; for (let j = -w; j <= w; j++) k += T.K[(i + j + T.N) % T.N];
      k /= 2 * w + 1;
      this.BEND[i] = Math.abs(k) > 1 / 400 ? Math.sign(k) : 0;
    }
    this.flag = new Array(this.M).fill(null);   // null | 'y' | 'dy' | 'g'
    this.greenT = new Float32Array(this.M);      // green shown for a few seconds after a yellow clears
    this.yellowSince = new Float32Array(this.M).fill(-99);
    this.feed = [];                              // newest last: { t, msg, me, cls }
    this.lastYellowMsg = -99;
    this.panels = [];
    this.vsc = null;       // { phase: 'on' | 'ending', until, endAt, why }
    this.sc = null;        // the safety car: { phase: 'out' | 'in', why } (race.js drives it: race.sc)
    this.lastVsc = -99;
    this.cases = [];       // collisions the stewards are looking at
    // online: only the host decides when the VSC comes out (everyone else follows its state)
    this.auth = !race.net || race.net.host;
    if (this.on && race.mode === 'race') this.buildPanels();
  }
  // (a VSC or the safety car: either way a stop is cheap and nobody overtakes)
  vscOn() { return !!this.vsc || !!this.sc; }

  // ---------- places ----------
  where(idx) {
    const c = this.corners.at[idx];
    const nm = placeName(this.race.track, idx * this.race.T.ds); // real circuits: 'Turn 3 (Eau Rouge)'
    return c > 0 ? 'Turn ' + c + (nm ? ` (${nm})` : '') : nm || 'Sector ' + (this.SEC[idx] + 1);
  }
  flagAt(idx) { return this.on ? this.flag[this.SEC[idx]] : null; }
  // the flag a driver at idx is being shown: this sector's, or a yellow in the next one when it is close
  flagAhead(idx) {
    if (!this.on) return null;
    if (this.vsc) return { f: 'vsc', k: this.SEC[idx] };
    if (this.sc) return { f: 'sc', k: this.SEC[idx] };
    const T = this.race.T, k = this.SEC[idx], here = this.flag[k];
    if (here === 'y' || here === 'dy') return { f: here, k };
    const nk = (k + 1) % this.M, next = this.flag[nk];
    const toNext = (nk * this.secLen - T.D[idx] + T.L) % T.L;
    if ((next === 'y' || next === 'dy') && toNext < 160 && !(T.open && nk === 0)) return { f: next, k: nk, ahead: true };
    return here === 'g' ? { f: 'g', k } : null;
  }

  // ---------- the stewards' feed (HUD) ----------
  say(msg, opt = {}) {
    const t = this.race.raceTime;
    this.feed.push({ t, msg, me: !!opt.me, cls: opt.cls || '' });
    if (this.feed.length > 12) this.feed.shift();
    this.race.events.push({ type: 'rc', msg, me: !!opt.me, cls: opt.cls || '' });
  }

  // ---------- per frame ----------
  update(dt) {
    if (!this.on) return;
    const race = this.race, T = race.T;
    const live = race.state === 'racing' || race.state === 'finished';
    if (!live) return;
    const now = race.raceTime;
    if (race.mode === 'race') { this.flags(dt, now); this.blueFlags(dt); this.vscUpdate(dt, now); this.stewards(now); }
    // 2. rules for the cars this machine owns
    for (const car of race.cars) {
      if (car.remote || car.gone) continue;
      this.trackLimits(car, dt);
      if (race.mode !== 'race') continue;
      this.yellowPasses(car, now);
      this.blueRules(car, dt);
      this.vscRules(car, dt);
      this.meatball(car);
      this.driveThroughDue(car);
    }
    for (const car of race.cars) car.rcProg = car.progress;
    this.updatePanels(now);
  }

  // 1. incidents -> sector flags
  flags(dt, now) {
    const race = this.race, T = race.T;
    const sev = new Uint8Array(this.M), cause = new Array(this.M).fill(null);
    for (const car of race.cars) {
      const inc = this.incident(car, dt, now);
      if (!inc) continue;
      const k = this.SEC[car.idx];
      if (inc.sev > sev[k]) { sev[k] = inc.sev; cause[k] = { car, why: inc.why }; }
      // close to the start of its sector: the marshal post before it waves a yellow too
      const into = T.D[car.idx] - k * this.secLen;
      const pk = (k - 1 + this.M) % this.M;
      if (into < 90 && !(T.open && k === 0) && sev[pk] < 1) { sev[pk] = 1; }
    }
    for (let k = 0; k < this.M; k++) {
      const was = this.flag[k], s = sev[k];
      if (s) {
        const f = s >= 2 ? 'dy' : 'y';
        if (was !== 'y' && was !== 'dy' && cause[k] && now - this.lastYellowMsg > 3) {
          this.lastYellowMsg = now;
          const c = cause[k];
          this.say(`${f === 'dy' ? 'Double yellow' : 'Yellow'} · ${this.where(c.car.idx)} · ${c.car.isPlayer ? 'You' : c.car.name} ${c.why}`, { cls: 'y', me: c.car.isPlayer });
        }
        if (was !== 'y' && was !== 'dy') this.yellowSince[k] = now;
        this.flag[k] = f; this.greenT[k] = 0;
      } else if (was === 'y' || was === 'dy') { this.flag[k] = 'g'; this.greenT[k] = 4; }
      else if (was === 'g') { this.greenT[k] -= dt; if (this.greenT[k] <= 0) this.flag[k] = null; }
    }
  }

  // is this car the cause of a yellow? { sev, why } (worked out from position + speed only, so it works for remote cars)
  incident(car, dt, now) {
    const race = this.race, T = race.T, p = car.phys;
    const st = car.rc || (car.rc = { off: 0, hold: 0, sev: 0, why: '' });
    if (car.gone || car.finished || car.pitting || car.lap === 0 || (T.open && car.lap > 1) || now < 3) { st.hold = 0; st.off = 0; return null; }
    const half = T.W[car.idx] / 2, as = Math.abs(car.s);
    const pit = race.pit, inPit = pit && pit.REG[car.idx] >= 0 && car.s * pit.side > half;
    if (inPit) { st.hold = 0; return null; }
    const onTrack = as < half + 1;
    const dot = Math.sin(p.h) * T.FX[car.idx] + Math.cos(p.h) * T.FZ[car.idx];
    st.off = as > half + 2.5 ? st.off + dt : 0;
    let s = 0, why = '';
    st.stopT = p.speed < 6 && onTrack ? (st.stopT || 0) + dt : 0;
    if (p.speed < 6) { s = onTrack ? 2 : 1; why = 'stopped'; }
    else if (dot < 0.3) { s = onTrack ? 2 : 1; why = 'spun'; }
    else if (st.off > 0.8) { s = 1; why = 'off'; }
    if (car.crashT && now - car.crashT < 1.5 && car.crashV > 16) { s = Math.max(s, car.crashV > 24 ? 2 : 1); why = why || 'crashed'; }
    if (s) { st.sev = Math.max(st.hold > 0 ? st.sev : 0, s); st.why = why || st.why; st.hold = 3; st.last = now; }
    else st.hold -= dt;
    if (st.hold <= 0) { st.sev = 0; return null; }
    return { sev: st.sev, why: st.why };
  }

  // ---------- track limits ----------
  // all four wheels past the white line (Arcade: past the kerb too). A lap with any excursion is deleted; in a race an
  // excursion that kept its speed (cut, or ran wide without losing out) is a strike.
  limitsOn() { return this.on && !this.race.drift && ['race', 'test', 'quali', 'practice'].includes(this.race.mode); }
  trackLimits(car, dt) {
    if (!this.limitsOn()) return;
    const race = this.race, T = race.T, p = car.phys;
    const tl = car.tl || (car.tl = { out: false, t: 0, v0: 0, vmin: 0, spun: false, idx: 0 });
    if (car.lap === 0 || car.finished || car.pitting || (T.open && car.lap > 1) || race.state !== 'racing') { tl.out = false; return; }
    const i = car.idx, half = T.W[i] / 2;
    const pit = race.pit, inPit = pit && pit.REG[i] >= 0 && car.s * pit.side > half - 0.5;
    // running wide (the outside of a bend, or off a straight) gets more room than cutting the inside
    const wide = this.BEND[i] === 0 || Math.sign(car.s) !== this.BEND[i];
    const legal = half + (this.R.kerbOk && race.A.KERB[i] ? KERB_W + 0.4 : 0) + (wide ? this.R.wideRoom : 0);
    const out = !inPit && Math.abs(car.s) - CAR_HALF > legal;
    if (out) {
      if (!tl.out) { tl.out = true; tl.t = 0; tl.v0 = p.speed; tl.vmin = p.speed; tl.spun = false; tl.idx = i; tl.wide = wide; }
      tl.t += dt; tl.vmin = Math.min(tl.vmin, p.speed);
      const dot = Math.sin(p.h) * T.FX[i] + Math.cos(p.h) * T.FZ[i];
      if (dot < 0.8) tl.spun = true;
      return;
    }
    if (!tl.out) return;
    tl.out = false;
    if (tl.t < this.R.minT) return;
    const where = this.where(tl.idx);
    const kept = tl.vmin > tl.v0 * 0.72 && tl.v0 > 12 && !tl.spun;
    // (Arcade: running wide and losing time doing it is its own punishment: the lap stands)
    if (tl.wide && !this.R.wideStrikes && !kept) return;
    if (!car.lapInvalid) {
      car.lapInvalid = where;
      if (car.isPlayer && race.mode !== 'race') this.say(`Lap deleted · track limits at ${where}`, { me: true, cls: 'w' });
    }
    if (race.mode !== 'race') return;
    if (kept && (!tl.wide || this.R.wideStrikes)) this.strike(car, where);
  }
  strike(car, where) {
    const R = this.R, n = car.strikes = (car.strikes || 0) + 1;
    if (car.isPlayer) {
      if (n < R.warnAt) this.say(`Track limits · ${where} · warning ${n} of ${R.warnAt - 1}`, { me: true, cls: 'w' });
      else if (n === R.warnAt) { car.bwT = this.race.raceTime; this.say(`Black and white flag · track limits`, { me: true, cls: 'bw' }); }
    }
    if (n >= R.penAt && (n - R.penAt) % R.every === 0) this.penalise(car, PEN, `track limits ${where.replace('Turn ', 'T')}`);
  }

  // ---------- no overtaking under yellow ----------
  yellowPasses(car, now) {
    if (!this.on || this.race.mode !== 'race' || this.race.state !== 'racing') return;
    const R = this.R;
    // a place to give back
    const gb = car.giveBack;
    if (gb) {
      const o = gb.car;
      // (they've since had their own moment: nothing to give back)
      if (o.rc && o.rc.hold > 0) { car.giveBack = null; if (car.isPlayer) this.say('No need to give the place back', { me: true, cls: 'g' }); return; }
      if (o.gone || o.finished || o.pitting || car.pitting || car.progress < o.progress) {
        car.giveBack = null; car.gaveBack = { car: o, t: now }; // (so their pass back isn't a pass under yellow: below)
        if (car.isPlayer && !o.gone && car.progress < o.progress) this.say('Position given back · no further action', { me: true, cls: 'g' });
      } else if (now > gb.until) {
        car.giveBack = null;
        this.penalise(car, PEN, gb.vsc ? 'passed under the VSC' : gb.sc ? 'passed under the safety car' : 'passed under yellow');
      }
      return;
    }
    if (car.lap === 0 || car.finished || car.pitting || car.rcProg === undefined) return;
    const fl = this.vsc ? 'vsc' : this.sc ? 'sc' : this.flagAt(car.idx);
    if (fl !== 'y' && fl !== 'dy' && fl !== 'vsc' && fl !== 'sc') return;
    for (const o of this.race.cars) {
      if (o === car || o.gone || o.finished || o.pitting || o.rcProg === undefined) continue;
      // passed this frame (and not by a mile: lap counting quirks)
      if (!(car.rcProg <= o.rcProg && car.progress > o.progress && car.progress - o.progress < 30)) continue;
      // passing the car that caused it, a crawling or off-track car, is fine
      // (under the VSC or the safety car everyone's slow: only a car that's stopped or crawling is fair game)
      // (crawling: well under even the VSC's pace for that bit of track)
      const crawl = fl === 'sc' || fl === 'vsc' ? Math.max(8, ((o.lineV || this.race.lineV)[o.idx] || 30) * 0.35) : Math.max(10, car.phys.speed * 0.6);
      // (and fair: taking back the place a car just gave you; a car just out of the pits; a move already happening as
      // the VSC or the safety car came out)
      const t0 = fl === 'sc' ? this.sc.t0 : fl === 'vsc' ? this.vsc.t0 : null;
      // (a pit stop under it reshuffles everyone: a car out of the pits in the last half minute, either one, isn't a pass)
      if ((o.gaveBack && o.gaveBack.car === car && now - o.gaveBack.t < 4) || o.blue === car || o.lap < car.lap || now - (o.pitOutT ?? -99) < 30 || now - (car.pitOutT ?? -99) < 30 || (t0 != null && now - t0 < 3)) continue;
      if ((o.rc && (o.rc.hold > 0 || now - (o.rc.last ?? -99) < 8)) || (o.giveBack && o.giveBack.car === car) || o.phys.speed < crawl || Math.abs(o.s) > this.race.T.W[o.idx] / 2 + 1) continue;
      const where = this.where(car.idx);
      car.giveBack = { car: o, until: now + R.giveBack, where, total: R.giveBack, vsc: fl === 'vsc', sc: fl === 'sc' };
      if (car.isPlayer) this.say(`Passed ${o.name} under ${fl === 'vsc' ? 'the VSC' : fl === 'sc' ? 'the safety car' : 'yellow'} · give it back`, { me: true, cls: 'y' });
      break;
    }
  }

  // ---------- penalties ----------
  // time penalties: served at your next pit stop (the car is held in the box), or added to your race time at the end
  penalise(car, sec, why) {
    car.pen = (car.pen || 0) + sec;
    car.penTotal = (car.penTotal || 0) + sec;
    car.penLog = car.penLog || []; car.penLog.push({ sec, why, lap: car.lap });
    this.say(`+${sec}s penalty · ${car.isPlayer ? 'You' : car.name} · ${why}`, { me: car.isPlayer, cls: 'pen' });
  }
  // a remote car's penalty arrived with its state
  remotePenalty(car, total) {
    const add = total - (car.penTotal || 0);
    car.penTotal = total;
    if (add > 0.01) this.say(`+${Math.round(add)}s penalty · ${car.name}`, { cls: 'pen' });
  }
  remoteDriveThrough(car, n) {
    const add = n > (car.dtTotal || 0);
    car.dtTotal = n;
    if (add) this.say(`Drive-through · ${car.name}`, { cls: 'pen' });
  }

  // drive-through: through the pit lane at the limiter without stopping, within 3 laps
  driveThrough(car, why) {
    if (car.dt) return this.penalise(car, PEN * 2, why); // (already owes one: 10 seconds instead)
    car.dt = { lap: car.lap + DT_LAPS - 1, why }; // (this lap counts as the first)
    car.dtTotal = (car.dtTotal || 0) + 1;
    this.say(`Drive-through · ${car.isPlayer ? 'You' : car.name} · ${why}`, { me: car.isPlayer, cls: 'pen' });
    if (car.isPlayer) this.race.events.push({ type: 'radio', msg: `Drive-through penalty. Come through the pits in the next <b>${DT_LAPS} laps</b>, no stop allowed.` });
  }
  driveThroughServed(car) {
    car.dt = null; car.dtServed = (car.dtServed || 0) + 1;
    if (car.isPlayer) this.say('Drive-through served', { me: true, cls: 'g' });
  }
  driveThroughDue(car) {
    if (!car.dt || car.finished || car.pitting) return;
    if (car.lap > car.dt.lap) {
      const why = car.dt.why; car.dt = null;
      if (this.R.meatball === 'dsq') this.blackFlag(car, 'drive-through not served');
      else this.penalise(car, DT_LATE, 'drive-through not served');
    }
  }

  // black flag: out of the race
  blackFlag(car, why) {
    if (car.dsq || car.gone) return;
    car.dsq = true;
    this.say(`Black flag · ${car.isPlayer ? 'You are' : car.name + ' is'} disqualified · ${why}`, { me: car.isPlayer, cls: 'bk' });
    this.race.disqualify(car);
  }

  // ---------- black and orange flag: a car with a wing hanging off has to come in for repairs ----------
  meatball(car) {
    if (!this.race.damageK || car.finished || car.dsq || car.wreck) return;
    const d = car.phys.dmg, broken = d.fw >= 0.72 || d.rw >= 0.72 || d.ch >= 0.85;
    if (!broken) { if (car.mo) { car.mo = null; if (car.isPlayer) this.say('Repairs done · black and orange flag withdrawn', { me: true, cls: 'g' }); } return; }
    if (!car.mo) {
      car.mo = { lap: car.lap + 1 }; // (this lap and the next)
      this.say(`Black and orange flag · ${car.isPlayer ? 'You' : car.name} · box for repairs`, { me: car.isPlayer, cls: 'mo' });
      if (car.isPlayer) this.race.events.push({ type: 'radio', msg: 'Black and orange flag! <b>Box, box</b> for a new wing within 2 laps.', big: true });
      return;
    }
    if (car.lap > car.mo.lap && !car.pitting) {
      car.mo.lap = car.lap + 1;
      if (this.R.meatball === 'dsq') this.blackFlag(car, 'ignored the black and orange flag');
      else this.driveThrough(car, 'ignored the black and orange flag');
    }
  }

  // ---------- blue flags: a car a lap down with the leaders right behind ----------
  blueFlags(dt) {
    const race = this.race, T = race.T, N = T.N, L = T.L;
    for (const c of race.cars) {
      let by = null;
      if (!c.gone && !c.finished && !c.pitting && c.lap > 0 && !(T.open)) {
        for (const f of race.cars) {
          if (f === c || f.gone || f.finished || f.pitting) continue;
          // a lap up on them by the lap count AND by distance (either alone trips up around the line)
          const lead = (f.raw ?? f.progress) - (c.raw ?? c.progress);
          if (f.lap - c.lap < 1 || lead < L * 0.5) continue;
          const gap = ((c.idx - f.idx + N) % N) * T.ds; // f is this far behind c on the road
          if (gap > 0 && gap < 70 && (!by || gap < by.gap)) by = { car: f, gap };
        }
      }
      if (by) { c.blue = by.car; c.blueHold = 1; }
      else if (c.blue) { c.blueHold -= dt; if (c.blueHold <= 0) c.blue = null; }
    }
  }
  // holding up the leaders: warnings, then a penalty
  blueRules(car, dt) {
    const R = this.R;
    if (!car.blue || car.pitting) { car.blueT = Math.max(0, (car.blueT || 0) - dt * 0.5); if (!car.blueT) car.blueWarned = false; return; }
    car.blueT = (car.blueT || 0) + dt;
    if (car.isPlayer && !car.blueWarned && car.blueT > R.blueWarn) { car.blueWarned = true; this.say(`Blue flags · let ${car.blue.name} through`, { me: true, cls: 'blue' }); }
    if (car.blueT > R.bluePen) { car.blueT = 0; car.blueWarned = false; this.penalise(car, PEN, 'ignored blue flags'); }
  }

  // ---------- Virtual Safety Car ----------
  // out for a car stopped on the track, a big crash or debris. Everyone drives to a slow reference pace (their delta
  // shows how far they are above it: keep it positive) and nobody may overtake. Pitting under it is cheap.
  vscUpdate(dt, now) {
    const race = this.race;
    if (this.sc) return; // (race.js brings it in: scUpdate)
    if (this.vsc) {
      if (!this.auth) return;
      if (this.vsc.phase === 'on' && now > this.vsc.until) this.setVsc('ending');
      else if (this.vsc.phase === 'ending' && now > this.vsc.endAt) this.setVsc(null);
      return;
    }
    if (!this.auth || race.state !== 'racing' || now < 10 || now - this.lastVsc < 60) return;
    const lead = race.order && race.order[0];
    if (!lead || lead.lap >= race.laps || race.T.open) return; // (not on the last lap, not on a one-run sprint)
    for (const car of race.cars) {
      if (car.gone || car.finished || car.pitting) continue;
      // (the worst of them, a car stopped on the track or a heavy crash, now and then bring out the safety car instead)
      const sc = race.opts.safetyCar !== false && race.pit && race.deploySC;
      if (car.rc && car.rc.stopT > 5) return sc && Math.random() < 0.4 ? this.setSc('out', `${car.name} stopped at ${this.where(car.idx)}`) : this.setVsc('on', `${car.name} stopped at ${this.where(car.idx)}`);
      if (car.crashT && now - car.crashT < 0.1 && car.crashV >= this.R.vscCrash) return sc && car.crashV >= this.R.vscCrash + 8 && Math.random() < 0.6 ? this.setSc('out', `crash at ${this.where(car.idx)}`) : this.setVsc('on', `crash at ${this.where(car.idx)}`);
    }
  }
  // a car crashed out (race.js wreckCar): it's sitting broken by the track, so out comes the safety car (no pit lane,
  // or the safety car switched off: the VSC). Not on the last lap, and not over a safety car already out.
  crashOut(car) {
    if (!this.on || this.race.mode !== 'race') return;
    const race = this.race, where = this.where(car.idx), lead = race.order && race.order.find(c => !c.gone && !c.wreck);
    this.say(`Out · ${car.isPlayer ? 'You' : car.name} · crashed at ${where}`, { cls: 'y', me: true });
    if (!this.auth || race.state !== 'racing' || this.sc || !lead || lead.lap >= race.laps || race.T.open) return;
    const why = `${car.isPlayer ? 'your' : car.name + '\'s'} car stopped at ${where}`;
    if (race.opts.safetyCar !== false && race.pit && race.deploySC) this.setSc('out', why); else this.setVsc('on', why);
  }
  // a wing came off: debris on the track (a VSC half the time)
  debris(car) {
    if (!this.on || !this.auth || this.vsc || this.sc || this.race.mode !== 'race' || this.race.state !== 'racing') return;
    const now = this.race.raceTime, lead = this.race.order && this.race.order[0];
    if (now < 10 || now - this.lastVsc < 60 || !lead || lead.lap >= this.race.laps || this.race.T.open) return;
    if (Math.random() < 0.5) this.setVsc('on', `debris at ${this.where(car.idx)}`);
  }
  setVsc(phase, why = '') {
    const race = this.race, now = race.raceTime, was = this.vsc ? this.vsc.phase : null;
    if (phase === was) return;
    if (phase === 'on' && this.sc) return; // (never a VSC over the safety car: whatever calls for one)
    if (phase === 'on') {
      this.vsc = { phase: 'on', t0: now, until: now + 20 + Math.random() * 15, why };
      for (const c of race.cars) { c.vscDelta = 0; c.vscBad = 0; c.vscStrikes = 0; c.vscWarned = false; }
      this.say(`Virtual Safety Car${why ? ' · ' + why : ''}`, { cls: 'vsc', me: true });
      const pl = race.player, stop = pl && race.nextPlannedStop && race.nextPlannedStop(pl);
      if (pl && !pl.finished && stop && stop.lap - pl.lap <= 4) race.events.push({ type: 'radio', msg: 'VSC! <b>Box this lap</b> for a cheap stop.', big: true });
      else if (pl && !pl.finished) race.events.push({ type: 'radio', msg: 'Virtual Safety Car. Slow down and keep your delta positive.' });
    } else if (phase === 'ending') {
      this.vsc = { ...(this.vsc || {}), phase: 'ending', endAt: now + 5 };
      this.say('VSC ending · get ready', { cls: 'vsc', me: true });
    } else {
      this.vsc = null; this.lastVsc = now;
      for (let k = 0; k < this.M; k++) if (!this.flag[k]) { this.flag[k] = 'g'; this.greenT[k] = 4; }
      this.say('Green flag · racing resumes', { cls: 'g', me: true });
    }
  }
  // the safety car: out (race.js puts it ahead of the leader), in this lap, gone (green)
  setSc(phase, why = '') {
    const race = this.race, now = race.raceTime;
    if (phase === 'out') {
      const wasVsc = !!this.vsc; this.vsc = null; this.sc = { phase: 'out', t0: now, why }; race.deploySC(); // (it takes over from a VSC)
      this.say(`${wasVsc ? 'VSC now a ' : ''}Safety Car${why ? ' · ' + why : ''}`, { cls: 'vsc', me: true });
      race.events.push({ type: 'radio', msg: `${wasVsc ? 'The VSC\'s now a safety car.' : 'Safety car.'} It's coming out ahead of the leader: catch the queue, <b>no overtaking</b>. The pit lane's open.` });
    } else if (phase === 'in') { this.sc.phase = 'in'; this.say('Safety car in this lap', { cls: 'vsc', me: true }); }
    else { this.sc = null; this.lastVsc = now; for (let k = 0; k < this.M; k++) if (!this.flag[k]) { this.flag[k] = 'g'; this.greenT[k] = 4; } this.say('Green flag · racing resumes', { cls: 'g', me: true }); }
  }
  // your delta: seconds above the VSC reference time (positive = slow enough)
  vscRules(car, dt) {
    if (!this.vsc || this.sc) return;
    const race = this.race, R = this.R;
    if (car.pitting || car.finished || car.lap === 0 || car.rcProg === undefined) { car.vscBad = 0; return; }
    const LV = car.lineV || race.lineV, v = Math.max(8, LV[car.idx] * VSC_PACE);
    const ds = Math.max(0, Math.min(200, car.progress - car.rcProg));
    car.vscDelta = Math.min(2, (car.vscDelta || 0) + dt - ds / v); // (you can't bank more than 2 s)
    // the first few seconds are for slowing down to the VSC pace: the delta can't go negative yet
    if (race.raceTime - (this.vsc.t0 ?? -99) < 8) { car.vscDelta = Math.max(0, car.vscDelta); car.vscBad = 0; return; }
    if (car.vscDelta < -R.vscWarn) {
      car.vscBad += dt;
      if (car.isPlayer && !car.vscWarned && car.vscBad > 1) { car.vscWarned = true; this.say('Too fast under the VSC · slow down', { me: true, cls: 'y' }); }
      if (car.vscDelta < -R.vscPen && car.vscBad > 2) {
        car.vscBad = 0; car.vscDelta = 0; car.vscStrikes++;
        if (car.vscStrikes === 1) this.penalise(car, PEN, 'VSC delta');
        else this.driveThrough(car, 'VSC delta, again');
      }
    } else car.vscBad = 0;
  }

  // ---------- collisions: the stewards look at hits from behind ----------
  // a front end into another car's rear, closing fast: under investigation. Guilty if the other car spun, went off or
  // got damaged in the next couple of seconds.
  contact(a, b, ia, ib, closing) {
    if (!this.on || this.race.mode !== 'race' || this.race.state !== 'racing') return;
    let hit, vic;
    if (ia === 0 && ib === 1) { hit = a; vic = b; } else if (ia === 1 && ib === 0) { hit = b; vic = a; } else return; // (side by side: a racing incident)
    if (hit.remote || hit.pitting || vic.pitting || closing < this.R.hit || (vic.rc && vic.rc.hold > 0)) return;
    const now = this.race.raceTime;
    const old = this.cases.find(c => c.hit === hit && c.vic === vic && now - c.t < 3);
    if (old) { old.v = Math.max(old.v, closing); return; }
    const d = vic.phys.dmg;
    this.cases.push({ hit, vic, t: now, v: closing, dmg0: d.fw + d.rw + d.ch, where: this.where(hit.idx) });
    if (hit.isPlayer && vic.pid) (this.race.bumpT ||= {})[vic.pid] = now; // (for a bump and run: race.js notePasses)
    if (hit.isPlayer || vic.isPlayer) this.say(`Incident · ${hit.isPlayer ? 'You' : hit.name} and ${vic.isPlayer ? 'you' : vic.name} · under investigation`, { me: true, cls: 'inv' });
  }
  stewards(now) {
    this.cases = this.cases.filter(c => {
      if (now - c.t < 2.5) return true;
      const d = c.vic.phys.dmg, hurt = d.fw + d.rw + d.ch - c.dmg0 > 0.15 || (c.vic.rc && (c.vic.rc.last ?? -99) >= c.t);
      if (c.hit.pid && c.vic.pid) this.race.log.push({ type: 'contact', a: c.hit.pid, b: c.vic.pid, blame: !!hurt, where: c.where, t: now });
      if (c.hit.isPlayer && c.vic.pid && hurt) { // (a bump and run: race.js notePasses)
        const R = this.race; (R.bumpHurt ||= {})[c.vic.pid] = c.t;
        if (((R.bumpPass || {})[c.vic.pid] ?? -99) >= c.t) R.dirty('bumprun', c.vic);
      }
      if (!c.hit.gone && !c.hit.dsq && hurt) this.penalise(c.hit, PEN, `caused a collision (${c.where.replace('Turn ', 'T')})`);
      else if (c.hit.isPlayer || c.vic.isPlayer) this.say('Incident reviewed · no further action', { me: true, cls: 'g' });
      return false;
    });
  }

  // online: the host's VSC state rides along with its car states
  netState() { return this.vsc ? { p: this.vsc.phase, w: this.vsc.why } : 0; }
  netApply(v) {
    if (this.auth || !this.on) return;
    const phase = v ? v.p : null, was = this.vsc ? this.vsc.phase : null;
    if (phase === was) return;
    if (phase === 'on') this.setVsc('on', v.w);
    else if (phase === 'ending') { if (!this.vsc) this.setVsc('on', v.w); this.setVsc('ending'); }
    else this.setVsc(null);
  }

  // ---------- marshal light panels at every sector ----------
  buildPanels() {
    const race = this.race, T = race.T, A = race.A, world = race.world;
    const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2c32 });
    const postGeo = new THREE.BoxGeometry(0.18, 3.6, 0.18), boxGeo = new THREE.BoxGeometry(1.9, 1.25, 0.2), faceGeo = new THREE.PlaneGeometry(1.7, 1.05);
    const pitSide = race.pit ? race.pit.side : 1;
    for (let k = 0; k < this.M; k++) {
      let i = 0, best = Infinity;
      const d0 = k * this.secLen + 25; // just past the sector line, so it's in view as you arrive
      for (let j = 0; j < T.N; j++) { if (T.open && j > T.cut) continue; const d = Math.abs(T.D[j] - d0); if (d < best) { best = d; i = j; } }
      // on the outside of the next corner if there is one close by, else away from the pits
      const c = this.corners.at[(i + Math.round(80 / T.ds)) % T.N];
      const cor = c > 0 ? this.corners.list[c - 1] : null;
      let side = cor ? -cor.dir : -pitSide;
      const has = (sd) => sd < 0 ? A.HAS_L[i] : A.HAS_R[i];
      const bar = (sd) => sd < 0 ? A.BL[i] : A.BR[i];
      if (!has(side) && has(-side)) side = -side;
      const off = (has(side) ? bar(side) + 0.7 : T.W[i] / 2 + 5) * side;
      const x = T.X[i] + T.RX[i] * off, z = T.Z[i] + T.RZ[i] * off;
      const gy = world.groundHeight ? Math.max(T.Y[i] - 1, Math.min(T.Y[i] + 3, world.groundHeight(x, z))) : T.Y[i];
      const g = new THREE.Group();
      const post = new THREE.Mesh(postGeo, postMat); post.position.y = 1.8; g.add(post);
      const box = new THREE.Mesh(boxGeo, postMat); box.position.y = 3.3; g.add(box);
      const mat = new THREE.MeshBasicMaterial({ color: 0x121212, fog: false }); // (a light: it cuts through the haze)
      const face = new THREE.Mesh(faceGeo, mat); face.position.set(0, 3.3, 0.11); g.add(face);
      g.position.set(x, gy, z);
      // face the cars coming towards it, turned in a little towards the track
      g.rotation.y = Math.atan2(-T.FX[i], -T.FZ[i]) - side * 0.35;
      race.scene.add(g);
      this.panels.push({ k, mat, g });
    }
  }
  updatePanels(now) {
    // (blue where a lapped car is being caught, so the leaders can see it's being dealt with)
    const blue = new Uint8Array(this.M);
    for (const c of this.race.cars) if (c.blue && !c.gone) blue[this.SEC[c.idx]] = 1;
    for (const P of this.panels) {
      const f = this.vsc ? 'y' : this.flag[P.k];
      let col = 0x121212;
      if (f === 'y' || f === 'dy') { const hz = f === 'dy' ? 3 : 1.6; col = Math.floor(now * hz * 2) % 2 ? 0x1a1604 : 0xffc414; }
      else if (blue[P.k]) col = Math.floor(now * 3.2) % 2 ? 0x040a1a : 0x2a7aff;
      else if (f === 'g') col = 0x22e04a;
      P.mat.color.setHex(col);
    }
  }

  // what the HUD needs about you
  hudFor(car) {
    if (!this.on || !car) return null;
    const now = this.race.raceTime, a = this.race.state === 'racing' && !car.finished && !car.pitting ? this.flagAhead(car.idx) : null;
    const running = this.race.state === 'racing' && !car.finished;
    return {
      flag: a && a.f, ahead: !!(a && a.ahead), where: a ? this.where(car.idx) : '',
      bw: car.bwT !== undefined && now - car.bwT < 6,
      giveBack: car.giveBack ? { name: car.giveBack.car.name, left: Math.max(0, car.giveBack.until - now), total: car.giveBack.total } : null,
      blue: running && car.blue && !car.pitting ? car.blue.name : null,
      vsc: this.vsc && running ? { phase: this.vsc.phase, delta: car.vscDelta || 0, ok: (car.vscDelta || 0) >= -this.R.vscWarn } : null,
      sc: this.sc && running ? { phase: this.sc.phase } : null,
      mo: running && car.mo ? { laps: Math.max(0, car.mo.lap - car.lap + 1) } : null,
      dt: car.dt ? { laps: Math.max(0, car.dt.lap - car.lap + 1) } : null, dtTotal: car.dtTotal || 0,
      dsq: !!car.dsq,
      pen: car.pen || 0, penTotal: car.penTotal || 0, strikes: car.strikes || 0, warnAt: this.R.warnAt,
      invalid: this.limitsOn() && !!car.lapInvalid,
      limits: this.limitsOn(),
    };
  }
}
