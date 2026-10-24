// dev: does traction control hunt on a straight standing start? Each car alone on a flat plane, Standard aids,
// automatic, full throttle from rest for 3 s: the lowest power cut TC reaches (tcK, 1 = none), how many times it
// swings past 0.5 down and up again, and the speed at 1 and 3 s.   node .devtest/tchunt.mjs [ids...]
const ROOT = process.env.ROOT || new URL('..', import.meta.url).pathname;
const { CARS } = await import(ROOT + 'js/cars.js');
const { CarPhysics } = await import(ROOT + 'js/physics.js');
const { physAids, PRESETS } = await import(ROOT + 'js/aids.js');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CARS).filter(k => !['fun'].includes(CARS[k].cls));
for (const id of ids) {
  const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.fitTyres('soft'); p.place(0, 0, 0); p.auto = true; if (process.env.OLD) p.tcLowOff = true; // (OLD=1: as before the walking-pace fix)
  let mn = 1, sw = 0, low = false, v1 = 0;
  for (let i = 0; i < 3 * 240; i++) {
    p.step(1 / 240, { throttle: 1, brake: 0, steer: 0, handbrake: 0, analog: true, pad: true }, { mu: 1, extraDrag: 0, gF: 0, gL: 0 });
    const k = p.tcK ?? 1; mn = Math.min(mn, k);
    if (!low && k < 0.5) { low = true; sw++; } else if (low && k > 0.8) low = false;
    if (i === 239) v1 = p.speed * 3.6;
  }
  console.log(`${id.padEnd(11)} ${CARS[id].cls.padEnd(7)} tcK min ${mn.toFixed(2)}  dips ${sw}  1 s ${v1.toFixed(0)} km/h  3 s ${(p.speed * 3.6).toFixed(0)} km/h`);
}
