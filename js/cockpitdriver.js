// The driver in an open cockpit (cars.js cockpit: {...}, the sprint car): the game's racer (js/characters.js, in the
// car's livery) seated and posed by a direct two-bone solve per limb: hips in the seat, leaning back, feet on the
// pedals, hands on the steering wheel's rim at 9 and 3. steer(angle) turns the hands with the wheel: the arms are
// solved again from the seated pose each time, so they never drift. Car space: +Y up, nose +Z, left +X.
// (No IK constraints or clips: the rig rests dead straight, which a constraint solver can't bend, and the imported
// bones' tails are guesses; aiming each bone at the next joint works for any rest pose. tools/cars/driverfit.py is
// the same pose in Blender, used to fit the car round him.)
import * as THREE from 'three';
import { loadCharacters, makeCharacter } from './characters.js';

const v3 = () => new THREE.Vector3();
const B = (ch, n) => ch.bone(n);

// world position of a bone's head
const head = (b) => b.getWorldPosition(v3());
// turn bone about its head (in the world) by the rotation q
function turn(bone, q) {
  const wq = bone.getWorldQuaternion(new THREE.Quaternion()), pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
  bone.updateMatrixWorld(true);
}
// turn bone so child's head points at target (world)
function aim(bone, child, target) {
  const h = head(bone), a = head(child).sub(h).normalize(), b = target.clone().sub(h).normalize();
  turn(bone, new THREE.Quaternion().setFromUnitVectors(a, b));
}
// upper -> mid -> end (shoulder / elbow / wrist, hip / knee / ankle): end on target, the middle joint bent toward bend
function twoBone(ch, upper, mid, end, target, bend) {
  const U = B(ch, upper), M = B(ch, mid), E = B(ch, end);
  const s0 = head(U), L1 = head(M).distanceTo(s0), L2 = head(E).distanceTo(head(M));
  const d = target.clone().sub(s0), dist = Math.min(d.length(), (L1 + L2) * 0.999), dn = d.normalize();
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
  const n = bend.clone().sub(dn.clone().multiplyScalar(bend.dot(dn))).normalize();
  aim(U, M, s0.clone().addScaledVector(dn, a).addScaledVector(n, h));
  aim(M, E, s0.clone().addScaledVector(dn, dist));
}

// space: the car's body group (the driver moves with its roll and pitch). spec: cars.js cockpit. wheel: { ctr, axis, r }
// in car space (the model's SteeringWheel). Resolves to { steer(angle), setLivery(cfg), dispose() }, or null without
// the characters file.
export async function seatDriver(space, spec, wheel, livery) {
  if (!(await loadCharacters())) return null;
  const ch = makeCharacter({ look: 'racer', livery, clip: null, tick: false });
  space.add(ch.object);
  const W = (p) => space.localToWorld(new THREE.Vector3(...p));                     // car space -> world
  const Wd = (d) => new THREE.Vector3(...d).applyQuaternion(space.getWorldQuaternion(new THREE.Quaternion())).normalize();
  space.updateWorldMatrix(true, true);

  // the body: Hips turned so the spine leans back RECLINE from upright and the hips face the nose, then moved into the seat
  const r = (spec.recline ?? 12) * Math.PI / 180;
  const up = Wd([0, Math.cos(r), -Math.sin(r)]), left = Wd([1, 0, 0]);
  const hips = B(ch, 'Hips');
  const basis = (u, l) => { const uu = u.clone().normalize(), ll = l.clone().sub(uu.clone().multiplyScalar(l.dot(uu))).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ll, uu, ll.clone().cross(uu))); };
  const cur = basis(head(B(ch, 'Head')).sub(head(hips)), head(B(ch, 'LeftUpLeg')).sub(head(B(ch, 'RightUpLeg'))));
  turn(hips, basis(up, left).multiply(cur.invert()));
  const off = space.worldToLocal(head(hips)); ch.object.position.add(new THREE.Vector3(...spec.hip).sub(off));
  ch.object.updateMatrixWorld(true);

  // legs: feet on the pedals, knees up; toes forward and up on the pedal
  const knee = Wd([0, 1, 0.2]);
  for (const [s, k] of [['Left', 1], ['Right', -1]]) {
    const ped = W([spec.pedal[0] * k, spec.pedal[1], spec.pedal[2]]);
    twoBone(ch, s + 'UpLeg', s + 'Leg', s + 'Foot', ped, knee);
    aim(B(ch, s + 'Foot'), B(ch, s + 'ToeBase'), head(B(ch, s + 'Foot')).addScaledVector(Wd([0, 0.45, 1]), 0.12));
  }
  // the seated arm pose every steer() starts from (so the solve never piles up twist)
  const ARM = ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'].map(n => B(ch, n));
  const rest = ARM.map(b => b.quaternion.clone());
  const elbow = [0, -1, -0.3];                       // elbows down (a touch back), inside the cage
  const ctr = new THREE.Vector3(...wheel.ctr), axis = new THREE.Vector3(...wheel.axis).normalize();
  const u0 = new THREE.Vector3(1, 0, 0).sub(axis.clone().multiplyScalar(axis.x)).normalize();   // 9 o'clock, from the driver
  const steer = (angle = 0) => {
    space.updateWorldMatrix(true, false);
    ARM.forEach((b, i) => b.quaternion.copy(rest[i]));
    ch.object.updateMatrixWorld(true);
    const u = u0.clone().applyAxisAngle(axis, angle);
    for (const [s, k] of [['Left', 1], ['Right', -1]]) {
      const grip = ctr.clone().addScaledVector(u, k * wheel.r);
      twoBone(ch, s + 'Arm', s + 'ForeArm', s + 'Hand', W(grip.toArray()), Wd(elbow));
    }
  };
  steer(0);
  return {
    character: ch, steer,
    setLivery: (cfg) => ch.setLivery(cfg),
    dispose: () => { space.remove(ch.object); ch.dispose(); },
  };
}
