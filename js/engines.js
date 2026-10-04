// Engine sound profiles + the synthesis of their firing-pulse loops (played by EngineVoice in audio.js).
//
// Each engine is one looped buffer of a few 4-stroke cycles (720° of crank each) at REF_RPM, played faster / slower
// with the rpm. Every cylinder firing is an exhaust pulse: a low "thump", a ringing tone and a burst of rasp (noise).
// The firing angles and the bank each cylinder exhausts into make the character: a cross-plane V8's uneven bank
// pattern is its burble, a flat-plane V8 / V10 / V12 alternate banks evenly and scream, inline engines are even.
// A second "overrun" loop (throttle off: weaker, uneven, misfiring pulses) is cross-faded in when you lift.
//
// Profile fields:
//   cyl, fire: firing angles in degrees (0..720), bank: exhaust bank per firing (0 / 1)
//   ring: pulse tone Hz at REF_RPM (scales with rpm), ring2: bank 1's tone ratio, decay: ring time (s at REF_RPM)
//   thump: low pulse amount, rasp: noise amount, jitter: per-firing randomness, bankAmp: bank 1 loudness
//   clatter: diesel injector knock, drive: distortion, formants: fixed resonances [Hz, gain dB, Q] (exhaust / body),
//   lp: lowpass Hz [off throttle, full throttle], turbo: whistle + blow-off amount (0 none), flutter: blow-off chatter,
//   pops: overrun crackle amount, whine: electric / gear whine amount, gain: loudness trim
export const REF_RPM = 3000;
const CYCLES = 4; // cycles per loop: pulse-to-pulse variation without an audible repeat

const even = (n, off = 0) => Array.from({ length: n }, (_, k) => (k * 720) / n + off);
const alt = (n) => Array.from({ length: n }, (_, k) => k % 2);

export const ENGINES = {
  // 1.6 V6 turbo hybrid: raspy, high revving, the turbo takes the edge off; MGU-K whine
  f1v6: { cyl: 6, fire: even(6), bank: alt(6), ring: 1150, ring2: 1.04, decay: 0.0012, thump: 0.25, rasp: 0.5, jitter: 0.03,
    bankAmp: 0.92, drive: 4, formants: [[900, 5, 1.2], [2600, 4, 2]], lp: [1500, 9000], turbo: 0.45, pops: 0.15, whine: 1, gain: 0.9 },
  // 3.0 V10 (the classic car): a clean, piercing scream
  v10: { cyl: 10, fire: even(10), bank: alt(10), ring: 1300, ring2: 1.02, decay: 0.0011, thump: 0.2, rasp: 0.22, jitter: 0.015,
    bankAmp: 0.95, drive: 5, formants: [[1600, 5, 1.5], [3400, 3, 2]], lp: [1800, 10000], turbo: 0, pops: 0.1, whine: 0, gain: 0.85 },
  // race V8, flat-plane crank: hard, even, metallic bark
  v8flat: { cyl: 8, fire: even(8), bank: alt(8), ring: 820, ring2: 1.05, decay: 0.0018, thump: 0.5, rasp: 0.4, jitter: 0.03,
    bankAmp: 0.9, drive: 6, formants: [[220, 5, 1], [1300, 4, 1.5]], lp: [1000, 7000], turbo: 0, pops: 0.6, whine: 0, gain: 1 },
  // cross-plane V8 (muscle / saloon): the burble comes from the uneven L/R bank pattern (firing order 1-8-4-3-6-5-7-2)
  v8cross: { cyl: 8, fire: even(8), bank: [0, 1, 0, 0, 1, 1, 1, 0], ring: 560, ring2: 1.12, decay: 0.0024, thump: 0.9, rasp: 0.3, jitter: 0.06,
    bankAmp: 0.72, drive: 7, formants: [[130, 7, 0.9], [620, 3, 1.2]], lp: [700, 5200], turbo: 0, pops: 0.7, whine: 0, gain: 1.05 },
  // big-block V8 in a hearse: lazy, deep, heavily silenced
  v8truck: { cyl: 8, fire: even(8), bank: [0, 1, 0, 0, 1, 1, 1, 0], ring: 380, ring2: 1.1, decay: 0.003, thump: 1, rasp: 0.12, jitter: 0.07,
    bankAmp: 0.7, drive: 4, formants: [[95, 8, 0.9], [420, 3, 1]], lp: [450, 2600], turbo: 0, pops: 0.15, whine: 0, gain: 1.1 },
  // straight six, NA: silky, rising howl (BMW M88)
  i6: { cyl: 6, fire: even(6), bank: new Array(6).fill(0), ring: 900, ring2: 1, decay: 0.0017, thump: 0.45, rasp: 0.28, jitter: 0.02,
    bankAmp: 1, drive: 5, formants: [[300, 4, 1], [1500, 4, 1.4]], lp: [1100, 7500], turbo: 0, pops: 0.45, whine: 0, gain: 0.95 },
  // straight six, twin turbo: smoother, muffled by the turbos, big whistle and blow-off
  i6turbo: { cyl: 6, fire: even(6), bank: new Array(6).fill(0), ring: 780, ring2: 1, decay: 0.0019, thump: 0.5, rasp: 0.35, jitter: 0.025,
    bankAmp: 1, drive: 5, formants: [[260, 4, 1], [1200, 3, 1.3]], lp: [900, 5600], turbo: 1, flutter: 0, pops: 0.35, whine: 0, gain: 0.95 },
  // V6 twin turbo (GT-R): gruff, lots of turbo
  v6turbo: { cyl: 6, fire: even(6), bank: alt(6), ring: 700, ring2: 1.06, decay: 0.002, thump: 0.6, rasp: 0.4, jitter: 0.035,
    bankAmp: 0.88, drive: 5, formants: [[210, 5, 1], [1100, 3, 1.3]], lp: [850, 5200], turbo: 1, flutter: 0, pops: 0.4, whine: 0, gain: 1 },
  // V6 NA, high revving (90s Japanese GT): sharp and eager
  v6na: { cyl: 6, fire: even(6), bank: alt(6), ring: 980, ring2: 1.05, decay: 0.0015, thump: 0.4, rasp: 0.35, jitter: 0.025,
    bankAmp: 0.9, drive: 6, formants: [[350, 4, 1], [1800, 4, 1.5]], lp: [1200, 8000], turbo: 0, pops: 0.5, whine: 0, gain: 0.95 },
  // flat six (air-cooled 911): the boxer's hollow, raspy growl
  flat6: { cyl: 6, fire: even(6), bank: alt(6), ring: 760, ring2: 1.09, decay: 0.002, thump: 0.6, rasp: 0.45, jitter: 0.04,
    bankAmp: 0.8, drive: 6, formants: [[240, 5, 1.1], [900, 4, 1.4], [2400, 2, 2]], lp: [950, 6500], turbo: 0, pops: 0.55, whine: 0, gain: 1 },
  // flat six, single big turbo (935): the boxer growl, a little muffled, with the whistle and blow-off
  flat6turbo: { cyl: 6, fire: even(6), bank: alt(6), ring: 740, ring2: 1.09, decay: 0.0021, thump: 0.6, rasp: 0.42, jitter: 0.04,
    bankAmp: 0.8, drive: 6, formants: [[230, 5, 1.1], [880, 4, 1.4], [2300, 2, 2]], lp: [900, 6000], turbo: 1, flutter: 0, pops: 0.5, whine: 0, gain: 1 },
  // flat twelve (Testarossa): smooth, many pulses, a rich wail
  // (flat 12: steadier timing than the rest, or 12 pulses smear into noise; unequal bank headers give it growl)
  flat12: { cyl: 12, fire: even(12), bank: alt(12), ring: 1050, ring2: 1.03, decay: 0.0014, thump: 0.35, rasp: 0.25, jitter: 0.02,
    bankAmp: 0.93, drive: 5, formants: [[280, 3, 1], [1400, 4, 1.4]], lp: [1100, 7500], turbo: 0, pops: 0.3, whine: 0, gain: 0.9 },
  // turbo four (Japanese sports coupe): buzzy, big blow-off flutter
  i4turbo: { cyl: 4, fire: even(4), bank: new Array(4).fill(0), ring: 720, ring2: 1, decay: 0.0022, thump: 0.55, rasp: 0.5, jitter: 0.04,
    bankAmp: 1, drive: 6, formants: [[280, 4, 1], [1300, 4, 1.5]], lp: [900, 6000], turbo: 1, flutter: 1, pops: 0.6, whine: 0, gain: 1 },
  // tired NA four (a '90s hatchback on its third owner): thin, buzzy, rattly exhaust, no turbo
  i4: { cyl: 4, fire: even(4), bank: new Array(4).fill(0), ring: 820, ring2: 1, decay: 0.0019, thump: 0.45, rasp: 0.55, jitter: 0.05,
    bankAmp: 1, drive: 5, formants: [[300, 3, 1], [1600, 4, 1.6]], lp: [1000, 6500], turbo: 0, pops: 0.25, whine: 0, gain: 0.95 },
  // turbo diesel four (the works van): clattery, gruff, lazy
  diesel: { cyl: 4, fire: even(4), bank: new Array(4).fill(0), ring: 420, ring2: 1, decay: 0.0026, thump: 1, rasp: 0.25, jitter: 0.05,
    bankAmp: 1, clatter: 1, drive: 3, formants: [[160, 6, 1], [2800, 5, 2.5]], lp: [900, 3800], turbo: 0.5, flutter: 0, pops: 0, whine: 0, gain: 1.1 },
};

// seeded random, so a profile always synthesises the same loop
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// the pulse loop of an engine as a Float32Array (one channel), for load 'on' (throttle) or 'off' (overrun)
export function synthEngine(E, sampleRate, mode = 'on') {
  const cycle = 120 / REF_RPM;                          // seconds per 720°
  const len = Math.round(cycle * CYCLES * sampleRate), out = new Float32Array(len);
  const R = rng(E.cyl * 7919 + (mode === 'on' ? 1 : 2) + Math.round(E.ring));
  const off = mode === 'off';
  const win = Math.round(Math.min(cycle / E.cyl * 2.5, 0.02) * sampleRate); // how long each pulse rings
  for (let c = 0; c < CYCLES; c++) {
    E.fire.forEach((deg, k) => {
      const bank = E.bank[k] || 0;
      const j = (R() - 0.5) * E.jitter;
      const t0 = (c + deg / 720 + j * E.cyl / 720 * 20) * cycle;
      // overrun: weak, uneven, now and then a misfire
      let amp = (bank ? E.bankAmp : 1) * (1 + (R() - 0.5) * E.jitter * 6);
      if (off) amp *= R() < 0.12 ? 0.15 : 0.35 + R() * 0.45;
      const f = E.ring * (bank ? E.ring2 : 1) * (1 + (R() - 0.5) * E.jitter * 0.6);
      const tau = E.decay * (off ? 1.4 : 1), tT = E.decay * 1.6;
      const rasp = E.rasp * (off ? 0.4 : 1), ph = R() * 6.28;
      const s0 = Math.round(t0 * sampleRate);
      for (let n = 0; n < win; n++) {
        const x = n / sampleRate;
        let v = Math.exp(-x / tau) * Math.sin(6.2832 * f * x + ph)                           // ring
          + E.thump * (x / tT) * Math.exp(1 - x / tT)                                            // thump
          + rasp * (R() * 2 - 1) * Math.exp(-x / (tau * 0.7));                                   // rasp
        if (E.clatter) v += E.clatter * 0.5 * Math.exp(-Math.max(0, x - 0.0009) / 0.00018) * (x > 0.0009 ? Math.sin(6.2832 * 3600 * x) : 0);
        out[(s0 + n) % len] += v * amp;
      }
    });
  }
  // no DC, then a common loudness (RMS), so profiles sit at similar levels
  let m = 0; for (let i = 0; i < len; i++) m += out[i]; m /= len;
  let rms = 0; for (let i = 0; i < len; i++) { out[i] -= m; rms += out[i] * out[i]; }
  rms = Math.sqrt(rms / len) || 1;
  const k = (off ? 0.18 : 0.3) / rms;
  for (let i = 0; i < len; i++) out[i] = Math.max(-1, Math.min(1, out[i] * k));
  return out;
}

// ---------- physical model presets (engineworklet.js) ----------
// Tube lengths in samples at 44.1 kHz (longer = lower resonance): intake / exhaust per cylinder, extractors = the
// header of each cylinder (uneven lengths = uneven pulses at the collector = burble), straight pipe to the muffler,
// muffler = parallel chambers, action = how much the muffler holds back (higher = quieter, duller), ignition = length
// of the combustion pulse (fraction of the cycle), mix = [intake, engine block, exhaust outlet], gain = loudness trim (levels matched at 3000 rpm, full throttle).
const PHYS_BASE = { intake: 100, exhaust: 100, inOpen: 0.01, inClosed: 0.95, exOpen: 0.01, exClosed: 0.95, ignition: 0.016,
  straight: 128, pipeR: 0.01, muffler: [10, 15, 20, 25], action: 0.1, outlet: 5, mix: [1, 1, 1], jitter: 1, gain: 1 };
const evenPh = (n) => Array.from({ length: n }, (_, k) => k / n);
const CROSS = (a, b) => [a, b, a, a, b, b, b, a]; // cross-plane V8 banks, firing order 1-8-4-3-6-5-7-2
export const PHYS = {
  orig: { cyl: 4, gain: 0.352, extractors: [100] }, // the original demo engine, for reference
  f1v6: { cyl: 6, gain: 0.5, phases: evenPh(6), extractors: [60, 64], intake: 70, exhaust: 70, straight: 70, muffler: [6, 9, 12, 15], action: 0.05, ignition: 0.012, mix: [0.6, 0.5, 1.2] },
  v10: { cyl: 10, gain: 0.513, phases: evenPh(10), extractors: [55, 58], intake: 60, exhaust: 60, straight: 60, muffler: [5, 8, 11, 14], action: 0.03, ignition: 0.01, mix: [0.7, 0.4, 1.2] },
  v8flat: { cyl: 8, gain: 0.409, phases: evenPh(8), extractors: [85, 90], straight: 100, muffler: [8, 12, 16, 20], action: 0.06, ignition: 0.014, mix: [0.8, 0.8, 1.1] },
  v8cross: { cyl: 8, gain: 0.37, phases: evenPh(8), extractors: CROSS(100, 150), straight: 170, muffler: [20, 30, 40, 50], action: 0.15, ignition: 0.018, mix: [0.6, 1.2, 1] },
  v8truck: { cyl: 8, gain: 0.347, phases: evenPh(8), extractors: CROSS(130, 195), intake: 130, exhaust: 130, straight: 230, muffler: [30, 45, 60, 75], action: 0.2, ignition: 0.022, mix: [0.4, 1.4, 0.8] },
  i6: { cyl: 6, gain: 0.416, phases: evenPh(6), extractors: [95], straight: 130, action: 0.08, ignition: 0.015, mix: [0.9, 0.8, 1] },
  i6turbo: { cyl: 6, gain: 0.384, phases: evenPh(6), extractors: [95], straight: 140, action: 0.22, ignition: 0.016, mix: [0.4, 0.9, 1] },
  v6turbo: { cyl: 6, gain: 0.7, phases: evenPh(6), extractors: [90, 120, 95, 125, 100, 115], straight: 140, action: 0.2, mix: [0.4, 1, 1] },
  v6na: { cyl: 6, gain: 0.408, phases: evenPh(6), extractors: [75, 80], intake: 85, exhaust: 85, straight: 100, action: 0.07, ignition: 0.013, mix: [1, 0.7, 1] },
  flat6: { cyl: 6, gain: 0.425, phases: evenPh(6), extractors: [80, 130, 85, 125, 90, 120], straight: 115, muffler: [12, 18, 24, 30], action: 0.1, mix: [0.8, 1, 1] },
  flat6turbo: { cyl: 6, gain: 0.425, phases: evenPh(6), extractors: [80, 130, 85, 125, 90, 120], straight: 115, muffler: [12, 18, 24, 30], action: 0.18, mix: [0.8, 1, 1] },
  flat12: { cyl: 12, gain: 0.748, phases: evenPh(12), jitter: 0.45, extractors: [70, 90], intake: 80, exhaust: 80, straight: 110, action: 0.08, ignition: 0.013, mix: [0.8, 0.6, 1] },
  i4turbo: { cyl: 4, gain: 0.395, extractors: [100], straight: 128, action: 0.18, mix: [0.5, 1, 1] },
  i4: { cyl: 4, gain: 0.395, extractors: [90], straight: 110, action: 0.12, ignition: 0.014, mix: [0.8, 1, 1] },
  diesel: { cyl: 4, gain: 0.13, phases: evenPh(4), extractors: [160], intake: 140, exhaust: 140, straight: 220, muffler: [25, 35, 45, 55], action: 0.3, ignition: 0.03, mix: [0.5, 1.6, 0.8] },
};
// every tube a bit longer than the presets say (lower, deeper resonances) and less intake hiss: the presets as written
// came out thin and tinny. body / throat / bright = the voice's low-shelf (170 Hz) / low-mid (320 Hz) / high-shelf (3 kHz) EQ in dB
// (per engine, optional; defaults 8 / 4.5 / -7).
const LEN = 1.25;
export function physOptions(id) {
  const o = { ...PHYS_BASE, ...(PHYS[id] || PHYS.orig) }, L = (v) => Math.round(v * LEN);
  return { ...o, intake: L(o.intake), exhaust: L(o.exhaust), straight: L(o.straight), extractors: o.extractors.map(L), muffler: o.muffler.map(L),
    mix: [o.mix[0] * 0.55, o.mix[1] * 1.15, o.mix[2]] };
}
