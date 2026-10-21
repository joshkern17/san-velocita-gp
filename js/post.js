// Post processing, built on pmndrs/postprocessing (the one render owner: a single EffectComposer).
//
//   render → [trails] → [depth of field: photo mode only] → [speed blur] → PSX Fog (threejs-psx-shader FogEffect: depth fog with drifting noise)
//   → sun glow + violet distance tint + god rays (pmndrs GodRaysEffect) + bloom (mipmap) + grade (lookup table)
//   + [vignette] + fade → [colour fringe] → retro stage: PSX Pixelation (colour crush) + PSX Dithering (the PS1 GPU
//   kernel), or RetroPass (the library's class) → PSX CRT (the CRT, and/or its grain and scanlines) → screen.
// The threejs-psx-shader effects run unchanged: PSXLibPass hands them the same context their own PSXPipeline
// would (time, camera, low/out resolution, depth texture) and does the linear → display encode between stages.
//
// The world is drawn at a low resolution (240–720 lines, or native) and the browser upscales the canvas: crisp
// ("Sharp pixels") or smoothed ("Soft"). The HUD is HTML on top, so it stays sharp. PSX vertex snapping and affine
// texture warping are material patches (world.js, vendor/psx); their snap grid follows the resolution here.
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, Effect, EffectAttribute, BloomEffect, GodRaysEffect, BlendFunction, KernelSize, LUT3DEffect, LookupTexture, VignetteEffect, ChromaticAberrationEffect, DepthOfFieldEffect, Pass, CopyMaterial } from 'postprocessing';
import { psxGlobals } from '../vendor/psx/src/PSXMaterial.js';
import { PixelationEffect } from '../vendor/psx/src/effects/PixelationEffect.js';
import { DitheringEffect } from '../vendor/psx/src/effects/DitheringEffect.js';
import { FogEffect } from '../vendor/psx/src/effects/FogEffect.js';
import { CRTEffect } from '../vendor/psx/src/effects/CRTEffect.js';
import { FullScreenQuad, FULLSCREEN_VERTEX_SHADER } from '../vendor/psx/src/FullScreenQuad.js';
import { RetroPass } from '../vendor/retropass/RetroPass.js';
import { createColorPalette } from '../vendor/retropass/createColorPalette.js';

// neutral defaults (garage, editor preview): no extra fog, no grading
export const NEUTRAL_LOOK = {
  shadow: [1, 1, 1], high: [1, 1, 1], lift: [0, 0, 0], sat: 1.08, contrast: 1.06, exposure: 1,
  bloom: 0.45, bloomThr: 0.8,
  haze: { density: 0, base: 0, falloff: 30, color: [0.8, 0.85, 0.9], sun: [1, 0.9, 0.7], sunAmt: 0, sunDir: [0, 1, 0] },
};

// exact sRGB <-> linear (the composer works in linear light and encodes to sRGB once, at the very end)
const SRGB_GLSL = /* glsl */ `
vec3 psxToSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 psxToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
float psxHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

// ---------- atmosphere: height mist (+ drifting noise from the PSX FogEffect), distance tint, sun glow, shafts ----------
class AtmosEffect extends Effect {
  constructor() {
    super('AtmosEffect', SRGB_GLSL + /* glsl */ `
      uniform mat4 projInv, camWorld; uniform vec3 camPos, hColor, farColor, sunCol, sunDir;
      uniform float hDensity, hBase, hFall, sunAmt, farDist, noiseAmt, time, rayK;
      uniform vec2 sunUv; uniform float aspect;
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(psxHash(i), psxHash(i + vec2(1, 0)), u.x), mix(psxHash(i + vec2(0, 1)), psxHash(i + vec2(1, 1)), u.x), u.y); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        vec4 v = projInv * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0); v /= v.w;
        vec3 wp = (camWorld * vec4(v.xyz, 1.0)).xyz, ray = wp - camPos;
        float dist = length(ray); vec3 rd = ray / max(dist, 1e-3);
        if (depth > 0.99999) dist = farDist;
        dist = min(dist, farDist);
        if (hDensity > 0.0 && depth < 0.99999) {
          // (the fog itself is the PSX FogEffect) aerial tint: distance goes violet, and glows warm towards the sun
          float k = smoothstep(60.0, farDist, dist);
          float s = pow(max(dot(rd, sunDir), 0.0), 6.0) * sunAmt;
          c = mix(c, farColor + sunCol * s * 0.6, k * 0.45);
        }
        outputColor = vec4(c, inputColor.a);
      }`, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['projInv', new THREE.Uniform(new THREE.Matrix4())], ['camWorld', new THREE.Uniform(new THREE.Matrix4())], ['camPos', new THREE.Uniform(new THREE.Vector3())],
        ['hColor', new THREE.Uniform(new THREE.Color())], ['farColor', new THREE.Uniform(new THREE.Color())], ['sunCol', new THREE.Uniform(new THREE.Color())],
        ['sunDir', new THREE.Uniform(new THREE.Vector3(0, 1, 0))], ['hDensity', new THREE.Uniform(0)], ['hBase', new THREE.Uniform(0)], ['hFall', new THREE.Uniform(30)],
        ['sunAmt', new THREE.Uniform(0)], ['farDist', new THREE.Uniform(1500)], ['noiseAmt', new THREE.Uniform(0.35)], ['time', new THREE.Uniform(0)],
        ['rayK', new THREE.Uniform(0)], ['sunUv', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))], ['aspect', new THREE.Uniform(1.6)],
      ]),
    });
  }
}

// "Arcade Sunset" palette: ramps that keep road, car paint, sky, foliage and neon apart
export function ARCADE_PALETTE(n = 128) {
  if (n <= 16) return createColorPalette(16);
  const ramps = [
    ['#08070c', '#1e1a24', '#3a3440', '#5a5460', '#7e7884', '#a6a0aa', '#cfcad2', '#ffffff'], // asphalt / concrete greys (a touch violet)
    ['#1a1418', '#3a2e34', '#5e4c50', '#846e6e', '#b09a92'],             // warm dark ground / shadows
    ['#140c26', '#2c1f52', '#4a3a86', '#7462b4', '#a898dc', '#d6ccf4'],  // violet distance
    ['#2a1a2a', '#553550', '#80587a', '#ad84a2', '#dab8cc'],             // mauve dusk
    ['#061436', '#10306e', '#2256a8', '#3e82d4', '#78b0ee', '#bcdcff'],  // sky blues
    ['#4a1c26', '#8a3440', '#c85454', '#f07c6c', '#ffa890', '#ffd2bc'],  // coral / salmon sunset sky
    ['#401406', '#8a3408', '#d06014', '#ff9030', '#ffbc60', '#ffe29c', '#fff6dc'], // orange / peach / sun
    ['#081a0c', '#15381a', '#265a26', '#3c7e32', '#5ea444', '#96c870'],  // foliage
    ['#1e2410', '#3a4420', '#56642e', '#76863e', '#9aaa5a', '#c4d08c'],  // olive / grass / verges
    ['#46607e', '#6484a8', '#88a8cc', '#aec6e2', '#d4e4f4'],             // pale day sky / haze
    ['#241408', '#4c2c14', '#76482a', '#a46c44', '#cc9c70', '#ecd0aa'],  // brick / wood / skin
    ['#300404', '#700606', '#b41010', '#ec2a22', '#ff6a50'],             // car red
    ['#040830', '#0a2280', '#1450d0', '#4a92ff'],                        // car blue
    ['#302600', '#806400', '#d8b000', '#fff050'],                        // yellow
    ['#003030', '#007a7a', '#1ad4d4', '#9cffff'],                        // cyan neon
    ['#300030', '#860086', '#f02cc8', '#ffa4f0'],                        // magenta neon
    ['#083008', '#109028', '#3cec5a'],                                   // neon green
  ];
  // spread n colours over the ramps in proportion to their length (interpolating inside each ramp)
  const segs = ramps.reduce((s, r) => s + r.length - 1, 0), cols = [];
  for (const r of ramps) {
    const cnt = Math.max(r.length, Math.round((r.length - 1) / segs * (n - ramps.length)) + 1);
    for (let q = 0; q < cnt; q++) { const f = q / (cnt - 1) * (r.length - 1), k = Math.min(r.length - 2, Math.floor(f)); cols.push(new THREE.Color(r[k]).lerp(new THREE.Color(r[k + 1]), f - k)); }
  }
  while (cols.length > n) cols.splice(Math.floor(cols.length / 2 + (cols.length % 7) * 3) % cols.length, 1);
  return cols.slice(0, n);
}

// ---------- finish: the screen fade (grain and scanlines come from the PSX CRTEffect) ----------
class FinishEffect extends Effect {
  constructor() {
    super('FinishEffect', SRGB_GLSL + /* glsl */ `
      uniform float grain, scan, fade, time, rows;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = psxToSRGB(inputColor.rgb);
        outputColor = vec4(psxToLinear(clamp(c, 0.0, 1.0)) * fade, inputColor.a);
      }`, { uniforms: new Map([['grain', new THREE.Uniform(0)], ['scan', new THREE.Uniform(0)], ['fade', new THREE.Uniform(1)], ['time', new THREE.Uniform(0)], ['rows', new THREE.Uniform(360)]]) });
  }
}

// ---------- speed blur: the picture smears out from where you're heading, more towards the edges ----------
// (a zoom blur towards the vanishing point of the car's travel; the centre stays clear, and the car itself (rect:
// its box on screen, near: how far away it is) neither blurs nor bleeds onto the scenery behind it)
class SpeedBlurEffect extends Effect {
  constructor() {
    super('SpeedBlurEffect', /* glsl */ `
      uniform vec2 focus; uniform vec4 rect; uniform float amount, aspect, near;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        outputColor = inputColor;
        if (amount < 0.001) return;
        vec2 d = uv - focus; d.x *= aspect;
        float own = -getViewZ(depth);
        vec2 inR = smoothstep(rect.xy - 0.02, rect.xy + 0.02, uv) * (1.0 - smoothstep(rect.zw - 0.02, rect.zw + 0.02, uv));
        float onCar = inR.x * inR.y * (1.0 - smoothstep(near, near + 3.0, own));
        float s = amount * smoothstep(0.16, 0.8, length(d)) * (1.0 - onCar) * 0.09;
        if (s < 0.0004) return;
        vec3 acc = inputColor.rgb; float w = 1.0;
        for (int i = 1; i <= 10; i++) {
          float t = float(i) / 10.0;
          vec2 su = uv - (uv - focus) * s * t;
          float sd = -getViewZ(readDepth(su));
          float k = (sd < own - 4.0 && sd < near + 3.0) ? 0.0 : 1.0 - t * 0.5;
          acc += texture2D(inputBuffer, su).rgb * k; w += k;
        }
        outputColor = vec4(acc / w, inputColor.a);
      }`, {
      attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      uniforms: new Map([['focus', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))], ['rect', new THREE.Uniform(new THREE.Vector4(0, 0, 0, 0))],
        ['amount', new THREE.Uniform(0)], ['aspect', new THREE.Uniform(1.6)], ['near', new THREE.Uniform(0)]]),
    });
  }
}

// ---------- trails: the previous frame lingers a little (PS2 motion "trails") ----------
class TrailsPass extends Pass {
  constructor() {
    super('TrailsPass');
    this.blendMat = new THREE.ShaderMaterial({
      uniforms: { tNew: { value: null }, tPrev: { value: null }, k: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }',
      // NaN/Inf guard: one bad pixel (a degenerate normal, a half-float overflow) would otherwise live in the history
      // forever (mix(new, NaN, 0) is still NaN) and the bloom smears it over the whole screen: a black 3D view for good
      fragmentShader: /* glsl */ `uniform sampler2D tNew, tPrev; uniform float k; varying vec2 vUv;
        vec4 clean(vec4 c) { return (any(isnan(c)) || any(isinf(c))) ? vec4(0.0, 0.0, 0.0, 1.0) : clamp(c, 0.0, 64000.0); }
        void main(){ vec4 n = clean(texture2D(tNew, vUv)); gl_FragColor = k > 0.0 ? mix(n, clean(texture2D(tPrev, vUv)), k) : n; }`,
      depthTest: false, depthWrite: false,
    });
    this.copyMat = new CopyMaterial();
    this.fullscreenMaterial = this.blendMat;
    this.hist = [0, 1].map(() => new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.k = 0; this.first = true;
  }
  render(renderer, inputBuffer, outputBuffer) {
    const [prev, next] = this.hist;
    this.fullscreenMaterial = this.blendMat;
    this.blendMat.uniforms.tNew.value = inputBuffer.texture; this.blendMat.uniforms.tPrev.value = prev.texture;
    // (k is per 60 Hz frame: a slower frame fades the last one further, so the trail lasts as long at any frame rate
    // and a heavy stretch of track doesn't smear the picture)
    const now = performance.now(), dt = Math.min(0.1, Math.max(0.004, (now - (this.lastT || now - 16.7)) / 1000)); this.lastT = now;
    this.blendMat.uniforms.k.value = this.first ? 0 : Math.pow(this.k, dt * 60);
    renderer.setRenderTarget(next); renderer.render(this.scene, this.camera);
    this.fullscreenMaterial = this.copyMat; this.copyMat.inputBuffer = next.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer); renderer.render(this.scene, this.camera);
    this.hist = [next, prev]; this.first = false;
  }
  setSize(w, h) { for (const t of this.hist) t.setSize(w, h); this.first = true; }
  dispose() { super.dispose(); for (const t of this.hist) t.dispose(); this.blendMat.dispose(); this.copyMat.dispose(); }
}

// ---------- threejs-psx-shader effects inside the composer ----------
// The library's own PSXPipeline renders the scene itself; here the composer owns the render, so this pass feeds its
// effects exactly what that pipeline would: linear effects, then a gamma encode, then display effects, then the
// output effect (CRT) straight to the canvas (or a plain copy). Effects are the library's classes, unmodified.
const ENCODE_MAT = () => new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX_SHADER, depthTest: false, depthWrite: false, uniforms: { tDiffuse: { value: null } },
  fragmentShader: 'varying vec2 vUv; uniform sampler2D tDiffuse; ' + SRGB_GLSL + ' void main(){ vec4 t = texture2D(tDiffuse, vUv); gl_FragColor = vec4(psxToSRGB(clamp(t.rgb, 0.0, 1.0)), t.a); }' });
const COPY_MAT = () => new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX_SHADER, depthTest: false, depthWrite: false, uniforms: { tDiffuse: { value: null } },
  fragmentShader: 'varying vec2 vUv; uniform sampler2D tDiffuse; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }' });
class PSXLibPass extends Pass {
  // effects: library effect instances (their .space says where they run); final = this pass writes the canvas
  constructor(effects, final) {
    super('PSXLibPass');
    this.effects = effects; this.final = final; this.needsDepthTexture = effects.some(e => e.space === 'linear');
    this.quad = new FullScreenQuad(); this.encode = ENCODE_MAT(); this.copy = COPY_MAT();
    this.ping = [0, 1].map(() => new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    this.pi = 0; this.ctx = { time: 0, camera: null, lowRes: new THREE.Vector2(2, 2), outRes: new THREE.Vector2(2, 2), tDepth: null, getEffect: (n) => this.lookup(n) };
    this.lookup = () => null;
  }
  setDepthTexture(t) { this.ctx.tDepth = t; }
  setSize(w, h) { for (const t of this.ping) t.setSize(w, h); this.ctx.lowRes.set(w, h); this.ctx.outRes.set(w, h); }
  next() { this.pi ^= 1; return this.ping[this.pi]; }
  render(renderer, inputBuffer, outputBuffer) {
    const on = this.effects.filter(e => e.enabled);
    let read = inputBuffer.texture;
    for (const e of on) if (e.space === 'linear') { const t = this.next(); e.render(renderer, this.quad, this.ctx, read, t); read = t.texture; }
    if (!this.final) { // stays in linear light for the next composer pass
      this.copy.uniforms.tDiffuse.value = read; renderer.setRenderTarget(outputBuffer); this.quad.render(renderer, this.copy); return;
    }
    { const t = this.next(); this.encode.uniforms.tDiffuse.value = read; renderer.setRenderTarget(t); this.quad.render(renderer, this.encode); read = t.texture; }
    for (const e of on) if (e.space === 'display') { const t = this.next(); e.render(renderer, this.quad, this.ctx, read, t); read = t.texture; }
    const out = [...on].reverse().find(e => e.space === 'output');
    if (out) out.render(renderer, this.quad, this.ctx, read, null);
    else { this.copy.uniforms.tDiffuse.value = read; renderer.setRenderTarget(null); this.quad.render(renderer, this.copy); }
  }
}
// the sky has no depth: keep the PSX fog from swallowing it (the sky shader hazes its own horizon)
class SkyAwareFogEffect extends FogEffect {
  constructor(s) {
    super(s);
    this.material.fragmentShader = this.material.fragmentShader.replace('float dist = -viewZ;', 'float dist = depth > 0.99999 ? 260.0 : -viewZ;');
  }
}

// ---------- grade → lookup table (split tone, lifted blacks, contrast, saturation), made in sRGB ----------
function buildLUT(L, grade = [1, 1, 1]) {
  const N = 32, data = new Float32Array(N * N * N * 4);
  const sh = L.shadow || [1, 1, 1], hi = L.high || [1, 1, 1], lift = L.lift || [0, 0, 0], con = L.contrast ?? 1.06, sat = L.sat ?? 1.08;
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let i = 0;
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    let c = [r / (N - 1) * grade[0], g / (N - 1) * grade[1], b / (N - 1) * grade[2]];
    const l0 = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114, t = ss(0.08, 0.8, l0);
    c = c.map((v, k) => v * (sh[k] + (hi[k] - sh[k]) * t));
    c = c.map((v, k) => v + lift[k] * (1 - v));
    c = c.map(v => (v - 0.5) * con + 0.5);
    const l = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
    c = c.map(v => Math.max(0, Math.min(1, l + (v - l) * sat)));
    data[i++] = c[0]; data[i++] = c[1]; data[i++] = c[2]; data[i++] = 1;
  }
  const lut = new LookupTexture(data, N);
  lut.type = THREE.FloatType; lut.colorSpace = THREE.NoColorSpace; lut.needsUpdate = true; // (the effect converts its input to sRGB itself)
  return lut;
}

export class PS2Post {
  constructor(renderer) {
    this.r = renderer;
    this.cfg = { mode: 'r360', filter: 'sharp', scanlines: false, trails: true, retro: 'psx', grain: 'off', rays: true, fringe: false, palette: 128, bypass: false, crt: 'off', speedFx: true };
    this.speedBlur = new SpeedBlurEffect();
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.trails = new TrailsPass();
    this.atmos = new AtmosEffect();
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.8, luminanceSmoothing: 0.25, intensity: 0.8, radius: 0.72 });
    // light shafts: pmndrs GodRaysEffect from a sun disc kept in its own little scene (placed along the sun
    // direction every frame); the scene's depth occludes it, so buildings and trees cut the shafts
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(55, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffc080, fog: false, transparent: true, depthWrite: false }));
    this.sun.frustumCulled = false;
    this.godRays = new GodRaysEffect(this.renderPass.mainCamera, this.sun, { blendFunction: BlendFunction.SCREEN, samples: 48, density: 0.94, decay: 0.93, weight: 0.5, exposure: 0.55, clampMax: 1, blur: true, kernelSize: KernelSize.SMALL, resolutionScale: 0.5 });
    this.lutEffect = new LUT3DEffect(buildLUT(NEUTRAL_LOOK), { tetrahedralInterpolation: true });
    this.vignette = new VignetteEffect({ offset: 0.3, darkness: 0.42 });
    this.fringe = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0012, 0.0008), radialModulation: true, modulationOffset: 0.25 });
    // threejs-psx-shader effects (the library's classes)
    this.psxFog = new SkyAwareFogEffect({ density: 0.0015, offset: 5, noiseScale: 4, noiseSpeed: 0.08, noiseStrength: 0.4 });
    this.psxPixel = new PixelationEffect({ resolutionHeight: 360, colorCrush: true, steps: 32 });
    this.psxDither = new DitheringEffect({ pattern: 'psx', mode: 'add', strength: 1 });
    this.psxCRT = new CRTEffect({ bend: 0, scanlineWeight: 0.1, grainWeight: 0, chromatic: 0.35 });
    this.psxAll = [this.psxFog, this.psxDither, this.psxPixel, this.psxCRT]; // (the library's default chain order)
    // mesmotronic RetroPass (the library class, a three.js ShaderPass): runs in the final pass, before the gamma
    // encode, which is where it sits in a three.js composer (its palette colours are THREE.Colors, linear)
    this.retroPass = new RetroPass({ colorPalette: ARCADE_PALETTE(128), dithering: true, autoDitheringOffset: true, resolution: new THREE.Vector2(640, 360) });
    this.retroStep = { name: 'retropass', space: 'linear', enabled: false, render: (renderer, quad, ctx, read, target) => this.retroPass.render(renderer, target, { texture: read }) };
    this.finish = new FinishEffect();
    // depth of field (pmndrs DepthOfFieldEffect), only in photo mode: setDof({ target, range, scale }) or null.
    // target: the world point in focus; range: metres either side that stay sharp (js/photomode.js works it out
    // from the lens and aperture)
    this.dof = new DepthOfFieldEffect(this.renderPass.mainCamera, { focusDistance: 6, focusRange: 2, bokehScale: 2, resolutionScale: 0.5 });
    this.dofOn = false;
    this.lutKey = '';
    this.rebuild();
  }

  configure(o) {
    const c = this.cfg;
    if (o.mode) c.mode = o.mode;
    if (o.filter) c.filter = o.filter;
    if (o.scanlines !== undefined) c.scanlines = !!o.scanlines;
    if (o.trails !== undefined) c.trails = !!o.trails;
    if (o.rays !== undefined) c.rays = !!o.rays;
    if (o.fringe !== undefined) c.fringe = !!o.fringe;
    if (o.grain !== undefined) c.grain = o.grain === true ? 'medium' : o.grain === false ? 'off' : o.grain;
    if (o.retro !== undefined) c.retro = o.retro;
    if (o.palette !== undefined && o.palette !== c.palette) { c.palette = o.palette; this.retroPass.colorPalette = ARCADE_PALETTE(o.palette); }
    if (o.bypass !== undefined) c.bypass = !!o.bypass;
    if (o.crt !== undefined) c.crt = o.crt;
    if (o.speedFx !== undefined) c.speedFx = !!o.speedFx;
    // CRT (library): flat or curved; it then does the scanlines, vignette and colour fringe itself
    // the PSX CRTEffect: the CRT itself (flat / curved, with its vignette and fringe), and also the film grain and
    // scanlines on their own when the CRT filter is off (then it's a flat, clean screen with just those)
    const crt = c.crt !== 'off', grainW = ({ off: 0, light: 0.05, medium: 0.09, heavy: 0.15 })[c.grain] ?? 0;
    this.psxCRT.enabled = crt || grainW > 0 || c.scanlines;
    Object.assign(this.psxCRT.settings, crt
      ? { bend: c.crt === 'curved' ? 9 : 0, scanlineWeight: c.scanlines ? 0.14 : 0.06, chromatic: c.fringe ? 0.6 : 0.15, grainWeight: grainW, vignetteAmount: 0.6 }
      : { bend: 0, scanlineWeight: c.scanlines ? 0.14 : 0, chromatic: 0, grainWeight: grainW, vignetteAmount: 0 });
    this.finish.uniforms.get('scan').value = 0;
    // retro stage: PSX pixelation colour crush + PS1 dither, or RetroPass palette, or neither
    this.psxPixel.settings.colorCrush = c.retro === 'psx'; this.psxDither.settings.pattern = c.retro === 'psx' ? 'psx' : 'none';
    this.psxPixel.enabled = this.psxDither.enabled = c.retro === 'psx';
    this.retroStep.enabled = c.retro === 'palette';
    this.rebuild();
    this.resize();
  }

  // one composer, passes chosen from the config (no duplicate renders or quantisers)
  rebuild() {
    const c = this.cfg, comp = this.composer, cam = this.renderPass.mainCamera, crt = c.crt !== 'off';
    comp.removeAllPasses();
    comp.addPass(this.renderPass);
    const lib = (effects, final) => { const p = new PSXLibPass(effects, final); p.lookup = (n) => this.psxAll.find(e => e.name === n) ?? null; return p; };
    if (c.bypass) { comp.addPass(new EffectPass(cam, this.finish)); return; }
    if (c.trails) comp.addPass(this.trails);
    if (this.dofOn) comp.addPass(new EffectPass(cam, this.dof));
    if (c.speedFx) comp.addPass(new EffectPass(cam, this.speedBlur));
    comp.addPass(this.fogPass = lib([this.psxFog], false));                                  // PSX Fog (linear)
    comp.addPass(new EffectPass(cam, ...[this.atmos, c.rays ? this.godRays : null, this.bloom, this.lutEffect, crt ? null : this.vignette, this.finish].filter(Boolean)));
    if (c.fringe && !crt) comp.addPass(new EffectPass(cam, this.fringe));
    // last: RetroPass (linear), then the PSX display effects (dithering + pixelation colour crush) and the CRT
    if (c.retro !== 'off' || this.psxCRT.enabled) comp.addPass(this.outPass = lib([this.retroStep, this.psxDither, this.psxPixel, this.psxCRT], true));
  }

  setDof(d) {
    if (!!d !== this.dofOn) { this.dofOn = !!d; this.rebuild(); this.resize(); }
    if (d) { this.dof.target = d.target; this.dof.cocMaterial.focusRange = d.range; this.dof.bokehScale = d.scale ?? 2; }
  }
  setSharp(on) { if (!!on !== !!this.sharp) { this.sharp = !!on; this.resize(); } }
  resize() {
    const r = this.r, c = this.cfg;
    const cw = Math.max(2, window.innerWidth), ch = Math.max(2, window.innerHeight), dpr = window.devicePixelRatio || 1;
    // (sharp: full resolution for a while, e.g. sat at the garage computer, where there's text on a screen in the scene)
    const lines = this.sharp ? 0 : { r240: 240, r288: 288, r360: 360, ps2: 448, hd: 720 }[c.mode];
    // the PSX PixelationEffect's resolution settings drive the real render size (as in its own pipeline)
    Object.assign(this.psxPixel.settings, { pixelate: !!lines, resolutionHeight: lines || ch });
    // drawing buffer at the chosen number of lines; the browser upscales the canvas (crisp or soft)
    const ps = this.psxPixel.settings, ratio = ps.pixelate ? Math.min(dpr, ps.resolutionHeight / ch) : Math.min(dpr, 1.5);
    r.setPixelRatio(ratio);
    this.composer.setSize(cw, ch, false);
    const w = Math.round(cw * ratio), h = Math.round(ch * ratio);
    r.domElement.style.imageRendering = c.filter === 'sharp' && lines ? 'pixelated' : 'auto';
    psxGlobals.uniforms.uPsxSnapRes.value.set(w, h); // PSX vertex snapping lands on real virtual pixels
    this.finish.uniforms.get('rows').value = h;
    this.retroPass.resolution = new THREE.Vector2(w, h); // (no extra pixelation: the render is already this size)
    this.size = [w, h];
  }

  // p: { trails, grade, fade, sat, look, speed } (speed: { amount, focus: [u, v], rect: [u0, v0, u1, v1], near }, js/race.js) (look: see NEUTRAL_LOOK / world.js lookFor)
  render(scene, camera, p = {}) {
    if (!this.size) this.resize();
    const L = p.look || NEUTRAL_LOOK, H = L.haze || NEUTRAL_LOOK.haze, t = performance.now() / 1000;
    this.renderPass.mainScene = scene; this.renderPass.mainCamera = camera;
    for (const pass of this.composer.passes) if (pass !== this.renderPass && 'mainCamera' in pass) pass.mainCamera = camera;
    this.trails.k = p.trails ?? 0.3;
    { const b = this.speedBlur.uniforms, sp = p.speed;
      b.get('amount').value = sp ? sp.amount : 0;
      if (sp) { b.get('focus').value.set(...sp.focus); b.get('rect').value.set(...(sp.rect || [0, 0, 0, 0])); b.get('near').value = sp.near || 0; b.get('aspect').value = this.size[0] / this.size[1]; } }
    // atmosphere
    const u = this.atmos.uniforms, set = (k, v) => { u.get(k).value = v; };
    camera.updateMatrixWorld();
    u.get('projInv').value.copy(camera.projectionMatrixInverse); u.get('camWorld').value.copy(camera.matrixWorld);
    u.get('camPos').value.setFromMatrixPosition(camera.matrixWorld);
    set('hDensity', H.density || 0); set('hBase', H.base || 0); set('hFall', H.falloff || 30); set('farDist', H.far || 1500);
    u.get('hColor').value.setRGB(...(H.color || [0.8, 0.85, 0.9])); u.get('farColor').value.setRGB(...(H.farColor || H.color || [0.8, 0.85, 0.9]));
    u.get('sunCol').value.setRGB(...(H.sun || [1, 0.9, 0.7])); set('sunAmt', H.sunAmt || 0);
    u.get('sunDir').value.set(...(H.sunDir || [0, 1, 0])).normalize();
    set('noiseAmt', H.noise ?? 0.35); set('time', t); set('aspect', this.size[0] / this.size[1]);
    // god rays: the sun disc sits along the sun direction; strength from the look (0 = off, e.g. rain / night)
    if (this.cfg.rays) {
      const sd = (this._sp ||= new THREE.Vector3()).set(...(H.sunDir || [0, 1, 0])).normalize();
      // far beyond everything (real-elevation terrain reaches ~1.6 km: a nearer disc could sit in front of the hills
      // that hide the real sun, and the shafts would pour out of the landscape), inside the camera's far plane
      const dist = Math.min(4500, (camera.far || 5000) * 0.9);
      this.sun.position.copy(u.get('camPos').value).addScaledVector(sd, dist);
      this.sun.scale.setScalar(Math.max(0.1, (camera.fov || 64) / 64) * dist / 1500); // same size on screen (and when a TV camera zooms in)
      this.sun.updateMatrix(); // (GodRaysEffect moves the disc into its own scene with matrixAutoUpdate off, so refresh it here)
      this.sun.material.color.setRGB(...(H.sun || [1, 0.9, 0.7]));
      this.godRays.mainCamera = camera;
      this.godRays.blendMode.opacity.value = Math.min(1, (L.rays || 0) * 1.6);
    }
    // bloom + grade
    this.bloom.intensity = (L.bloom ?? 0.45) * 1.7;
    this.bloom.luminanceMaterial.threshold = (L.bloomThr ?? 0.8) * 0.85;
    const g = p.grade || [1, 1, 1], key = JSON.stringify([L.shadow, L.high, L.lift, L.contrast, p.sat ?? L.sat, g]);
    if (key !== this.lutKey) { this.lutKey = key; const old = this.lutEffect.lut; this.lutEffect.lut = buildLUT({ ...L, sat: p.sat ?? L.sat }, g); if (old && old !== this.lutEffect.lut) old.dispose(); }
    // PSX Fog from the look (colour between the near haze and the violet distance)
    const fs = this.psxFog.settings;
    fs.density = H.density || 0; fs.noiseStrength = H.noise ?? 0.4;
    fs.color = '#' + new THREE.Color().setRGB(...(H.color || [0.8, 0.85, 0.9])).lerp(new THREE.Color().setRGB(...(H.farColor || H.color || [0.8, 0.85, 0.9])), 0.35).getHexString();
    this.psxFog.enabled = fs.density > 0;
    for (const pass of this.composer.passes) if (pass instanceof PSXLibPass) { pass.ctx.time = t; pass.ctx.camera = camera; }
    this.finish.uniforms.get('fade').value = p.fade ?? 1;
    this.finish.uniforms.get('time').value = t;
    this.composer.render();
  }
}
