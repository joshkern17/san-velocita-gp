// A live practice or qualifying session: the AI field out on the track for real, not just times on the board. Each
// team's car sits in its garage, on its side of the box (js/pitlife.js parkPose), until it's time for one of its runs
// (race.js qualiStart's plan: when each lap's time goes up). Then its crew push it out onto the lane
// (js/pushcar.js BoxPush), it drives an out lap, a flying lap (the run's time goes up as it crosses the line), an in
// lap (practice: a second flying lap first), and back into the pit lane to its box, where the crew push it back in.
// Slow cars (an out lap, an in lap) get the blue flag for a car on a flying lap closing on them, you too, and the AI
// move over for it. Nobody leaves for the first stretch of the session: everyone's in the pits for a bit.
//
//   LiveSession.wanted(race)          // a session on a circuit with a pit lane
//
// Online (a co-op weekend): the host runs the field's cars as here, keyed 'a:<team>' so they go out with its other
// cars' states; the guest's is a follower (race.js netField makes it): the same cars, remote, standing in their boxes
// till the host's come out (race.js netApply / parkRemote moves them), its times posted on the plan's clock.
//   race.live = new LiveSession(race) // after qualiStart's field is made
//   race.live.update(dt)              // each frame
//   race.live.holds(e, r)             // the run r of field entry e is being driven: its time goes up at the line
//   race.live.arrive(car)             // a car of ours is at its box in the lane: true (the crew have it)
//   race.live.skip()                  // the session's clock jumped (the garage's skip): everyone back in their box
//   race.live.isIn(car)               // in its garage (parked, not being pushed)
//   race.live.board()                 // who's where: [{ name, color, st, label, x, z, isPlayer, lap }]
import * as THREE from 'three';
import { BoxPush } from './pushcar.js';

const SEE = 150;       // m: a box further than this from the camera has its car put out / in at once, no push
const QUIET = 35;      // s: nobody goes out before this (and each car its own while after it)

export class LiveSession {
  static wanted(race) {
    return !!race.quali && !!race.pit && !race.T.open && race.opts.live !== false && !!(race.quali.field && race.quali.field.length) && !!race.pitLife;
  }
  constructor(race) {
    this.race = race; this.runners = []; this.pushes = []; this.blueT = 0;
    this.follow = !!(race.net && !race.net.host);   // (online, not the host: its cars are the host's)
    const q = race.quali, R = Math.random;
    q.field.forEach((e, k) => {
      const car = race.addCar(e.team, 1 + k, false, e.teamIdx, race.net ? { key: 'a:' + e.teamIdx, remote: this.follow } : {});
      car.live = true; car.plan = null; car.qEntry = e;
      if (this.follow) { const R0 = { e, car, st: 'garage', run: null, laps: 0, push: null }; this.runners.push(R0); this.park(car); return; }
      if (car.ai) car.ai.pace = e.pace;
      car.phys.powerMul = car.basePower = e.power;
      const c = race.rain ? 'wet' : 'soft'; car.phys.fitTyres(c); car.model.setCompound(c);
      // (the first run each: not before the quiet start, staggered)
      const R0 = { e, car, st: 'garage', run: null, laps: 0, push: null, earliest: QUIET + R() * 70 + k * 4 };
      this.runners.push(R0);
      this.park(car);
    });
    this.byCar = new Map(this.runners.map(r => [r.car, r]));
  }
  // ---------- each frame ----------
  update(dt) {
    const race = this.race, q = race.quali; if (!q || !q.started) return;
    if (this.follow) { for (const R of this.runners) R.st = R.car.inGarage ? 'garage' : R.car.pitting ? 'in' : R.car.lap > 0 ? 'flying' : 'out'; return; }
    const el = q.time - q.left, T = race.T, N = T.N, pit = race.pit, cam = race.camera.position;
    for (const R of this.runners) {
      const { car, e } = R;
      if (R.push) { R.push.update(dt); continue; }
      if (R.st === 'garage') {
        this.show(car);
        // the next run: out in time to be on its flying lap when its time's due (an out lap, the lap, the push out)
        const next = !q.flag && !q.done && e.plan.find(r => !r.done);
        if (!next || el < R.earliest) continue;
        const lead = 2.25 * e.pot + 25;
        if (el >= next.at - lead) this.goOut(R, next, cam);
        continue;
      }
      // on track: the race doesn't decide when we pit, we do
      car.pitChecked = true;
      if (car.wreck || (car.gone && !car.inGarage)) { this.bringIn(R); continue; }
      // (a lap's gone by: its count moves on at the line)
      if (car.lap !== R.lap) {
        const was = R.lap; R.lap = car.lap;
        if (R.st === 'out' && !car.pitting && car.lap > was) { R.st = 'flying'; R.flyFrom = car.lap; if (car.ai) car.ai.pace = e.pace; }
        else if (R.st === 'flying' && car.lap > R.flyFrom) {
          // the flying lap's done: its time goes up now (the run's, as planned: the field's pace is the plan's)
          if (R.run && !R.run.done) race.qualiPost(e, R.run);
          R.laps++;
          const more = q.kind === 'practice' && R.laps < 2 && !q.flag;
          if (more) R.flyFrom = car.lap;
          else { R.st = 'in'; if (car.ai) car.ai.pace = e.pace * 0.8; }
        }
      }
      // the in lap: into the pit lane at the entry
      if (R.st === 'in' && !car.pitting) {
        const toEntry = ((pit.start - car.idx + N) % N) * T.ds;
        if (toEntry < 240 && toEntry > 120) { car.pitting = true; car.pitPhase = 'in'; car.pitReq = { garage: true }; }
      }
      // (gone wrong: far too long out, the session over, or stuck: back in the box)
      if (R.run && el > R.run.at + 4 * e.pot + 60 && R.st !== 'in') { R.st = 'in'; if (car.ai) car.ai.pace = e.pace * 0.8; }
      if (q.done && R.st !== 'in') { R.st = 'in'; if (car.ai) car.ai.pace = e.pace * 0.8; }
    }
    this.pushes = this.pushes.filter(p => p.active);
    if ((this.blueT += dt) > 0.2) { this.blueT = 0; this.blues(); }
  }
  // out: pushed onto the lane (where anyone might see), then away down it
  goOut(R, run, cam) {
    const race = this.race, car = R.car, pose = race.pitLife.parkPose(car);
    R.run = run; R.laps = 0; R.lap = 0; R.st = 'push';
    const fit = race.rain ? 'wet' : 'soft'; car.phys.fitTyres(fit); car.model.setCompound(fit); // (a new set each run)
    if (car.ai) car.ai.pace = R.e.pace * 0.86;
    const near = pose && new THREE.Vector3(...pose.at).distanceTo(cam) < SEE;
    const go = (ahead) => { R.push = null; this.leave(car, ahead); R.st = 'out'; };
    if (pose && near && pose.b.F) { R.push = new BoxPush(race, pose.b, car, 'out', go); this.pushes.push(R.push); }
    else go(6.5);
  }
  // on the lane, ahead m along from its box: driving (race.js leaveGarage's 'drive', without the camera)
  leave(car, ahead) {
    const race = this.race, pit = race.pit, T = race.T, N = T.N;
    const b = ((pit.boxes[race.boxSlot(car.teamIdx)] + Math.round(ahead / T.ds)) % N + N) % N, off = pit.side * (pit.CEN[b] + 2.4);
    car.inGarage = false; car.gone = false; car.model.group.visible = true;
    car.phys.place(T.X[b] + T.RX[b] * off, T.Z[b] + T.RZ[b] * off, Math.atan2(T.FX[b], T.FZ[b]));
    car.phys.vx = car.phys.vz = car.phys.r = 0;
    car.idx = b; car.laneSide = undefined; race.updateTracker(car, true);
    car.pitting = true; car.pitPhase = 'out'; car.pitReq = null; car.lap = 0; car.cpNext = 1; car.lapStart = race.raceTime;
    car.tl2 = null; car.blue = null; car.pitStuck = 0;
    race.placeModel(car, 1);
  }
  // race.js pitUpdate: one of ours stopped at its box at the end of a run: the crew push it in
  arrive(car) {
    const R = this.byCar.get(car); if (!R) return false;
    if (R.push) return true;
    const race = this.race, pose = race.pitLife.parkPose(car), cam = race.camera.position;
    // (out of the race's hands from here: parked, the crew have the car)
    this.stow(car);
    const near = pose && new THREE.Vector3(...pose.at).distanceTo(cam) < SEE;
    R.st = 'pushIn';
    const done = () => { R.push = null; this.park(car); };
    if (pose && near) { R.push = new BoxPush(race, pose.b, car, 'in', done); this.pushes.push(R.push); }
    else done();
    return true;
  }
  // straight back to the box (a wreck, stuck, the clock skipped on)
  bringIn(R) {
    if (R.push) R.push.skip();
    R.push = null; this.park(R.car);
  }
  skip() { for (const R of this.runners) if (R.st !== 'garage') this.bringIn(R); }
  // in the garage: off the track (the race's 'gone'), but stood in its box for anyone to see
  stow(car) {
    car.inGarage = true; car.gone = true; car.sec = null;
    car.pitting = false; car.pitPhase = null; car.pitReq = null; car.lap = 0; car.cpNext = 1; car.trace = null; car.lapInvalid = null;
    car.phys.vx = car.phys.vz = car.phys.r = 0; car.blue = null; car.pitChecked = true;
  }
  park(car) {
    this.stow(car);
    const R = this.byCar && this.byCar.get(car); if (R) { R.st = 'garage'; R.run = null; }
    car.parkShown = false; this.show(car);
  }
  // its model on its side of the box, nose to the door (once: it stays put)
  show(car) {
    if (car.parkShown) return;
    const pose = this.race.pitLife.parkPose(car), g = car.model.group;
    if (!pose) { g.visible = false; car.parkShown = true; return; }
    g.position.set(pose.at[0], pose.at[1], pose.at[2]); g.rotation.set(0, pose.h, 0); g.quaternion.setFromEuler(g.rotation);
    g.visible = true;
    car.model.animate && car.model.animate({ steer: 0, spin: 0, heave: 0, pitch: 0, roll: 0 });
    car.parkShown = true;
  }
  holds(e, r) {
    if (this.follow) return false;   // (the guest posts the field's times on the plan's clock)
    const R = this.runners.find(x => x.e === e);
    return !!R && R.run === r && R.st !== 'garage' && R.st !== 'pushIn';
  }
  isIn(car) {
    const R = this.byCar.get(car);
    if (!R) return !!car.inGarage;
    return R.st === 'garage' && !R.push;
  }
  // ---------- blue flags ----------
  // a car on a slow lap (out, in; yours: your out lap, or crawling) with a car on a flying lap closing on it from
  // behind gets the blue flag for it: the AI move over (race.js aiControls), you get the flag on the HUD
  blues() {
    const race = this.race, T = race.T, N = T.N, cars = race.cars.filter(c => !c.gone && !c.remote), quick = race.cars.filter(c => !c.gone);
    const flying = (c) => { const R = this.byCar.get(c); return R ? R.st === 'flying' : (c.isPlayer || (c.remote && c.human)) && c.lap > 0 && !c.pitting; };   // (online: your co-op partner on a lap too)
    for (const c of cars) {
      const R = this.byCar.get(c);
      let slow = R ? (R.st === 'out' || R.st === 'in') && !c.pitting : c.isPlayer && (c.lap === 0 || c.pitting);
      let by = null;
      for (const f of quick) {
        if (f === c || f.pitting) continue;
        const gap = ((c.idx - f.idx + N) % N) * T.ds; // (f this far behind c, on the road)
        const closing = f.phys.speed - c.phys.speed;
        // (you, a lot slower than anyone right behind you (whatever lap they're on, whatever yours is): the flag too)
        const crawl = c.isPlayer && gap < 45 && closing > 8;
        if (!flying(f) && !crawl) continue;
        if (gap > 0 && gap < 80 && (slow || crawl) && (gap < 40 || closing > 3) && (!by || gap < by.gap)) by = { car: f, gap };
      }
      if (by) { c.blue = by.car; c.blueCls = false; c.blueHold = 1.5; }
      else if (c.blue) { c.blueHold = (c.blueHold || 0) - 0.2; if (c.blueHold <= 0) c.blue = null; }
    }
  }
  // ---------- who's out ----------
  board() {
    const race = this.race, out = [], pl = race.player;
    const label = { garage: 'In the garage', push: 'Pushed out', out: 'Out lap', flying: 'Flying lap', in: 'In lap', pushIn: 'Pushed in' };
    const add = (c, st) => out.push({ name: c.name, color: '#' + (c.team.main ?? 0xffffff).toString(16).padStart(6, '0'), st, label: c.pitting && st !== 'garage' && st !== 'push' && st !== 'pushIn' ? 'Pit lane' : label[st], x: c.phys.x, z: c.phys.z, isPlayer: !!c.isPlayer, idx: c.idx });
    if (pl) add(pl, pl.inGarage ? 'garage' : pl.lap === 0 ? 'out' : 'flying');
    for (const R of this.runners) add(R.car, R.push ? (R.push.kind === 'out' ? 'push' : 'pushIn') : R.st);
    return out;
  }
}
