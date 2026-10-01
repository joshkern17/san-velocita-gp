// Physically informed engine sound (AudioWorklet), after Baldan et al. 2015, "Physically informed car engine sound
// synthesis for virtual and augmented environments", ported from Antonio-R1/engine-sound-generator
// (MIT License, Copyright (c) 2021-2022 Antonio-R1).
//
// Every cylinder is a short tube with valves at both ends (their reflection factors open and close with the cam), fed by
// the piston motion and the ignition pulse. Intake tubes take filtered noise, exhaust tubes run into per-cylinder
// extractors (headers), then a shared straight pipe, a muffler (parallel tubes) and the outlet. The tube resonances
// stay put while the firing rate follows the rpm, which is what makes it sound like an engine rather than a synth.
// Changes from the original: firing phases + header lengths per cylinder (uneven = burble), throttle (load) drives the
// ignition and intake, one mixed output, a DC blocker, lengths scaled to the sample rate.
//
// Kept as a string so it can be loaded from a Blob URL (the single-file build has no separate files).
export const ENGINE_WORKLET = `
const SR = sampleRate, K = SR / 44100;
class LP { constructor(f) { const w = 2 * Math.PI * f / SR; this.a = w / (w + 1); this.v = 0; } run(x) { return (this.v += this.a * (x - this.v)); } }
class WG {
  constructor(n, rl, rr) { n = Math.max(1, Math.round(n * K)); this.u = new Float32Array(n); this.l = new Float32Array(n); this.n = n; this.i = 0; this.rl = rl; this.rr = rr; this.outL = 0; this.outR = 0; }
  add(vl, vr) {
    const lo = this.l[this.i], up = this.u[this.i];
    this.outL = lo * (1 - this.rl); this.outR = up * (1 - this.rr);
    this.u[this.i] = vl + lo * this.rl; this.l[this.i] = vr + up * this.rr;
    if (++this.i >= this.n) this.i = 0;
  }
}
class Cyl {
  constructor(o, extractor) {
    this.cyl = new WG(10, 0.75, 0.75);
    this.intake = new WG(o.intake, 0.01, o.inOpen);
    this.exhaust = new WG(o.exhaust, o.exClosed, 0.01);
    this.extractor = new WG(extractor, 0.01, 0.01);
    this.o = o;
  }
  update(noise, pipeLeft, x, load) {
    const o = this.o;
    const ex = x > 0.75 && x < 1 ? -Math.sin(4 * Math.PI * x) : 0;
    const iv = x > 0 && x < 0.25 ? Math.sin(4 * Math.PI * x) : 0;
    const piston = Math.cos(4 * Math.PI * x);
    const fire = x > 0 && x < 0.5 * o.ignition ? Math.sin(2 * Math.PI * (x / o.ignition)) : 0;
    const rIn = o.inOpen * iv + o.inClosed * (1 - iv), rEx = o.exOpen * ex + o.exClosed * (1 - ex);
    this.intake.rr = rIn; this.cyl.rl = rIn; this.exhaust.rl = rEx; this.cyl.rr = rEx;
    const amp = piston * 1.5 + fire * 5 * (0.25 + 0.75 * load);
    const exL = this.extractor.outL, cL = this.cyl.outL, cR = this.cyl.outR, inR = this.intake.outR;
    this.extractor.add(this.exhaust.outR, pipeLeft);
    this.exhaust.add(cR, exL);
    this.cyl.add(amp + inR * (1 - this.intake.rr), exL * (1 - this.exhaust.rl));
    this.intake.add(noise * iv, cL * (1 - this.intake.rr));
  }
}
class EngineProc extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'rpm', defaultValue: 900, minValue: 0 }, { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1 }]; }
  constructor(opts) {
    super();
    this.noiseLP = new LP(11000); this.crankLP = new LP(75); this.blockLP = new LP(125);
    this.rev = 0; this.x1 = 0; this.y1 = 0;
    this.setup(opts.processorOptions);
    this.port.onmessage = (e) => { if (e.data === 'stop') this.dead = true; else this.setup(e.data); };
  }
  setup(o) {
    this.o = o;
    const n = o.cyl;
    this.cyls = Array.from({ length: n }, (_, k) => new Cyl(o, o.extractors[k % o.extractors.length]));
    this.phase = Array.from({ length: n }, (_, k) => (o.phases ? o.phases[k] : k * (1 / n + 0.125))); // (no phases: the original's spacing)
    this.pipe = new WG(o.straight, o.pipeR, o.pipeR);
    this.muffler = o.muffler.map(len => new WG(len, 0, o.action));
    this.mInv = 1 / o.muffler.length;
    this.collK = 4 / n; this.flexK = Math.min(1, 7 / n);
    this.outlet = new WG(o.outlet, 0.01, 0.01);
    this.mOutL = 0; this.mOutR = 0;
  }
  process(ins, outs, P) {
    if (this.dead) return false;
    const out = outs[0][0], o = this.o, n = this.cyls.length, mix = o.mix;
    for (let s = 0; s < out.length; s++) {
      const rpm = P.rpm.length > 1 ? P.rpm[s] : P.rpm[0], load = P.throttle.length > 1 ? P.throttle[s] : P.throttle[0];
      const noise = this.noiseLP.run(Math.random() * 2 - 1) * (0.3 + 0.7 * load);
      const crank = this.crankLP.run(0.25 * Math.random()) - 0.125;
      let block = 0, intake = 0, pipeIn = 0;
      for (let k = 0; k < n; k++) {
        // (crank flex: later cylinders drift more, capped at a V8's worth: a 12 would smear into noise)
        let x = (this.rev + this.phase[k] + k * this.flexK * crank * o.jitter) % 1; if (x < 0) x += 1;
        const c = this.cyls[k];
        c.update(noise, this.pipe.outL, x, load);
        block += c.cyl.outL; intake += c.intake.outL; pipeIn += c.extractor.outR;
      }
      this.rev += rpm / 120 / SR; if (this.rev >= 1) this.rev -= 1;
      // straight pipe -> muffler -> outlet
      // (the collector: scaled to a 4-cylinder's worth, the original's tuning; more headers would feed back too hard)
      this.pipe.add(pipeIn * this.collK, this.mOutL);
      this.outlet.add(this.mOutR, 0);
      const mi = this.pipe.outR * this.mInv, mo = this.outlet.outL * this.mInv;
      let l = 0, r = 0;
      for (const m of this.muffler) { l += m.outL; r += m.outR; m.add(mi, mo); }
      this.mOutL = l; this.mOutR = r;
      const x = intake * mix[0] + this.blockLP.run(block) * mix[1] + this.outlet.outR * mix[2];
      // DC blocker
      const y = x - this.x1 + 0.995 * this.y1; this.x1 = x; this.y1 = y;
      // (safety: a runaway resonance resets the tubes rather than blasting)
      if (!(Math.abs(y) < 200)) { this.setup(o); this.x1 = this.y1 = 0; out[s] = 0; continue; }
      out[s] = y * o.gain;
    }
    return true;
  }
}
registerProcessor('svgp-engine', EngineProc);
`;
