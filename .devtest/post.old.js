// PS2-style post processing: low internal resolution, frame "trails", atmospheric fog (height mist + sun glow,
// from the depth buffer), low-res bloom, colour grade (split-tone looks per time of day / weather), ordered dither,
// scanlines, vignette. Everything runs at the low internal resolution, so it all dithers and bands like the real thing.
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// neutral defaults (garage, editor preview): no extra fog, no grading
export const NEUTRAL_LOOK = {
  shadow: [1, 1, 1], high: [1, 1, 1], lift: [0, 0, 0], sat: 1.08, contrast: 1.06, exposure: 1,
  bloom: 0.45, bloomThr: 0.8,
  haze: { density: 0, base: 0, falloff: 30, color: [0.8, 0.85, 0.9], sun: [1, 0.9, 0.7], sunAmt: 0, sunDir: [0, 1, 0] },
};

export class PS2Post {
  constructor(renderer) {
    this.r = renderer;
    this.quadScene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    // scene -> fog + chroma bleed + trails
    this.blend = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tDepth: { value: null }, tPrev: { value: null }, trails: { value: 0 }, texel: { value: new THREE.Vector2() },
        projInv: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, camPos: { value: new THREE.Vector3() },
        hDensity: { value: 0 }, hBase: { value: 0 }, hFall: { value: 30 }, hColor: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() },
        sunAmt: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, far: { value: 1500 },
      },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tScene, tDepth, tPrev; uniform float trails; uniform vec2 texel; varying vec2 vUv;
        uniform mat4 projInv, camWorld; uniform vec3 camPos, hColor, sunCol, sunDir; uniform float hDensity, hBase, hFall, sunAmt, far;
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          // composite-video style chroma bleed
          vec3 l = texture2D(tScene, vUv - vec2(texel.x, 0.)).rgb;
          c.r = mix(c.r, l.r, 0.35); c.b = mix(c.b, l.b, 0.2);
          if (hDensity > 0.0) {
            // where is this pixel in the world? (sky = far away along the view ray)
            float d = texture2D(tDepth, vUv).r;
            vec4 v = projInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
            vec3 wp = (camWorld * vec4(v.xyz, 1.0)).xyz, ray = wp - camPos;
            float dist = length(ray); vec3 rd = ray / max(dist, 1e-3);
            if (d > 0.99999) dist = far;
            dist = min(dist, far);
            // height fog: denser low down, thinning with altitude (analytic integral along the ray)
            float b = 1.0 / hFall, ry = rd.y * b;
            float amount = hDensity * exp(-(camPos.y - hBase) * b) * dist * (abs(ry * dist) > 1e-3 ? (1.0 - exp(-ry * dist)) / (ry * dist) : 1.0);
            float f = 1.0 - exp(-amount);
            // light scattering towards the sun: the haze glows warm around it
            float s = pow(max(dot(rd, sunDir), 0.0), 6.0) * sunAmt;
            vec3 fc = hColor + sunCol * s;
            c = mix(c, fc, clamp(f, 0.0, 0.97));
          }
          vec3 p = texture2D(tPrev, vUv).rgb;
          gl_FragColor = vec4(mix(c, p, trails), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    // bloom: bright pass into a quarter-res target, then a separable blur (blocky, soft, very PS2)
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, thr: { value: 0.8 }, texel: { value: new THREE.Vector2() } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tex; uniform float thr; uniform vec2 texel; varying vec2 vUv;
        void main(){
          vec3 c = (texture2D(tex, vUv + texel * vec2(-1.,-1.)).rgb + texture2D(tex, vUv + texel * vec2(1.,-1.)).rgb
                  + texture2D(tex, vUv + texel * vec2(-1., 1.)).rgb + texture2D(tex, vUv + texel * vec2(1., 1.)).rgb) * 0.25;
          float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * smoothstep(thr, thr + 0.5, l), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tex, vUv).rgb * 0.227;
          c += (texture2D(tex, vUv + dir * 1.38).rgb + texture2D(tex, vUv - dir * 1.38).rgb) * 0.316;
          c += (texture2D(tex, vUv + dir * 3.23).rgb + texture2D(tex, vUv - dir * 3.23).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    // light shafts: sky pixels near the sun, smeared radially towards it (quarter res)
    this.rays = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null }, sunUv: { value: new THREE.Vector2(0.5, 0.5) }, aspect: { value: 1.6 }, vis: { value: 0 } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tDepth; uniform vec2 sunUv; uniform float aspect, vis; varying vec2 vUv;
        float occ(vec2 uv){ if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return 0.; float d = texture2D(tDepth, uv).r;
          vec2 q = (uv - sunUv) * vec2(aspect, 1.); return step(0.99999, d) * smoothstep(0.32, 0.0, length(q)); }
        void main(){
          vec2 dir = (sunUv - vUv) / 28.0; vec2 uv = vUv; float acc = 0., w = 1.;
          for (int i = 0; i < 28; i++) { acc += occ(uv) * w; w *= 0.955; uv += dir; }
          gl_FragColor = vec4(vec3(min(acc / 20.0, 0.7) * vis), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.final = new THREE.ShaderMaterial({
      uniforms: {
        tex: { value: null }, tBloom: { value: null }, grade: { value: new THREE.Vector3(1, 1, 1) }, texel: { value: new THREE.Vector2() },
        lowRes: { value: new THREE.Vector2(640, 480) }, scan: { value: 0.12 }, vig: { value: 0.35 },
        sat: { value: 1.08 }, contrast: { value: 1.06 }, bloom: { value: 0.45 }, dither: { value: 1 }, fade: { value: 1 },
        shadowT: { value: new THREE.Vector3(1, 1, 1) }, highT: { value: new THREE.Vector3(1, 1, 1) }, lift: { value: new THREE.Vector3() }, exposure: { value: 1 },
        tRays: { value: null }, rayCol: { value: new THREE.Vector3() }, grain: { value: 0 }, time: { value: 0 }, tBloomS: { value: null }, fringe: { value: 0 },
      },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tex, tBloom, tBloomS, tRays; uniform vec3 grade, shadowT, highT, lift, rayCol; uniform vec2 texel, lowRes; uniform float scan, vig, sat, contrast, bloom, dither, fade, exposure, grain, time, fringe;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        varying vec2 vUv;
        float bayer(vec2 p){ int x = int(mod(p.x,4.)), y = int(mod(p.y,4.));
          int i = x + y*4; float m[16];
          m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
          for(int k=0;k<16;k++){ if(k==i) return m[k]/16.; } return 0.; }
        vec3 toSRGB(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
        void main(){
          vec3 c = texture2D(tex, vUv).rgb;
          if (fringe > 0.0) { // lens colour fringing, growing towards the edges
            vec2 fo = (vUv - 0.5) * dot(vUv - 0.5, vUv - 0.5) * fringe * 0.028;
            c.r = texture2D(tex, vUv + fo).r; c.b = texture2D(tex, vUv - fo).b;
          }
          c *= exposure;
          // bloom: a tight glow hugging bright shapes + a faint wide halo
          c += (texture2D(tBloomS, vUv).rgb * 0.75 + texture2D(tBloom, vUv).rgb * 0.45) * bloom;
          c += texture2D(tRays, vUv).r * rayCol;
          c = toSRGB(c);
          c *= grade;
          // split-tone look: shadows and highlights pushed towards their own colours, lifted blacks
          float lum0 = dot(c, vec3(0.299, 0.587, 0.114));
          c *= mix(shadowT, highT, smoothstep(0.08, 0.8, lum0));
          c += lift * (1.0 - c);
          c = (c - 0.5) * contrast + 0.5;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(lum), c, sat);
          vec2 q = vUv - 0.5;
          c *= 1.0 - vig * dot(q, q) * 1.8;
          if (grain > 0.0) {
            // film grain that changes ~12 times a second (stop-motion flicker), strongest in the mid-tones
            float fr = floor(time * 12.0);
            vec2 gp = floor(vUv * lowRes);
            float n = (hash(gp + fr * 17.31) + hash(gp * 1.37 + fr * 5.7) - 1.0);
            float lm = dot(c, vec3(0.299, 0.587, 0.114));
            c += n * grain * (0.55 + 1.8 * lm * (1.0 - lm));
            c *= 1.0 - grain * 0.6 * step(0.985, hash(vec2(fr, gp.y * 0.01))); // the odd darker frame
          }
          float row = fract(vUv.y * lowRes.y);
          c *= 1.0 - scan * (0.5 - 0.5 * cos(row * 6.2831));
          if (dither > 0.5) {
            vec2 lp = floor(vUv * lowRes);
            c = floor(c * 48.0 + bayer(lp)) / 48.0;
          }
          gl_FragColor = vec4(clamp(c, 0., 1.) * fade, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.mode = 'ps2';
    this.filter = 'soft';
    this.rts = null;
    this.firstFrame = true;
  }

  configure({ mode, filter, scanlines, trails, dither, grain, rays, fringe }) {
    if (grain !== undefined) this.final.uniforms.grain.value = ({ off: 0, light: 0.035, medium: 0.065, heavy: 0.11 })[grain === true ? 'medium' : grain === false ? 'off' : grain] ?? 0;
    if (fringe !== undefined) this.final.uniforms.fringe.value = fringe ? 1 : 0;
    if (rays !== undefined) this.raysOn = rays;
    if (mode) this.mode = mode;
    if (filter) this.filter = filter;
    if (scanlines !== undefined) this.final.uniforms.scan.value = scanlines ? 0.14 : 0;
    if (dither !== undefined) this.final.uniforms.dither.value = dither ? 1 : 0;
    if (trails !== undefined) this.trailsOn = trails;
    this.resize();
  }

  resize() {
    const r = this.r;
    const size = r.getSize(new THREE.Vector2());
    const pr = r.getPixelRatio();
    const W = Math.max(2, Math.floor(size.x * pr)), H = Math.max(2, Math.floor(size.y * pr));
    let h = this.mode === 'ps2' ? 448 : this.mode === 'hd' ? 720 : H;
    h = Math.min(h, H);
    const w = Math.round(h * (W / H));
    if (this.rts && this.rts.w === w && this.rts.h === h && this.rts.f === this.filter) return;
    if (this.rts) this.rts.list.forEach(t => t.dispose());
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    const filt = this.filter === 'sharp' ? THREE.NearestFilter : THREE.LinearFilter;
    const depthTexture = new THREE.DepthTexture(w, h); depthTexture.type = THREE.UnsignedIntType;
    const scene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0, depthTexture });
    const a = new THREE.WebGLRenderTarget(w, h, { ...opts, magFilter: filt, minFilter: THREE.LinearFilter });
    const b = new THREE.WebGLRenderTarget(w, h, { ...opts, magFilter: filt, minFilter: THREE.LinearFilter });
    const bw = Math.max(2, Math.round(w / 4)), bh = Math.max(2, Math.round(h / 4));
    const lin = { ...opts, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
    const b1 = new THREE.WebGLRenderTarget(bw, bh, lin), b2 = new THREE.WebGLRenderTarget(bw, bh, lin), g1 = new THREE.WebGLRenderTarget(bw, bh, lin);
    const hw2 = Math.max(2, Math.round(w / 2)), hh2 = Math.max(2, Math.round(h / 2));
    const s1 = new THREE.WebGLRenderTarget(hw2, hh2, lin), s2 = new THREE.WebGLRenderTarget(hw2, hh2, lin);
    this.rts = { w, h, bw, bh, hw2, hh2, f: this.filter, scene, a, b, b1, b2, g1, s1, s2, list: [scene, a, b, b1, b2, g1, s1, s2] };
    this.blend.uniforms.texel.value.set(1 / w, 1 / h);
    this.bright.uniforms.texel.value.set(1 / w, 1 / h);
    this.final.uniforms.texel.value.set(1 / w, 1 / h);
    this.final.uniforms.lowRes.value.set(w, h);
    this.firstFrame = true;
  }

  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.quadScene, this.cam); }

  // p: { trails, grade, fade, sat, look } (look: see NEUTRAL_LOOK / world.js envParams)
  render(scene, camera, p = {}) {
    if (!this.rts) this.resize();
    const r = this.r, R = this.rts, L = p.look || NEUTRAL_LOOK, H = L.haze || NEUTRAL_LOOK.haze;
    r.setRenderTarget(R.scene);
    r.render(scene, camera);
    // fog + trails
    const u = this.blend.uniforms;
    u.tScene.value = R.scene.texture; u.tDepth.value = R.scene.depthTexture; u.tPrev.value = R.b.texture;
    u.trails.value = this.firstFrame || !this.trailsOn ? 0 : (p.trails ?? 0.3);
    camera.updateMatrixWorld();
    u.projInv.value.copy(camera.projectionMatrixInverse); u.camWorld.value.copy(camera.matrixWorld); u.camPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.hDensity.value = H.density || 0; u.hBase.value = H.base || 0; u.hFall.value = H.falloff || 30; u.far.value = H.far || 1500;
    u.hColor.value.setRGB(...(H.color || [0.8, 0.85, 0.9])); u.sunCol.value.setRGB(...(H.sun || [1, 0.9, 0.7])); u.sunAmt.value = H.sunAmt || 0;
    u.sunDir.value.set(...(H.sunDir || [0, 1, 0])).normalize();
    this.pass(this.blend, R.a);
    // bloom
    const bloomOn = (L.bloom ?? 0.45) > 0;
    if (bloomOn) {
      this.bright.uniforms.tex.value = R.a.texture; this.bright.uniforms.thr.value = L.bloomThr ?? 0.8;
      // tight: half res, one small blur
      this.pass(this.bright, R.s1);
      this.blur.uniforms.tex.value = R.s1.texture; this.blur.uniforms.dir.value.set(1 / R.hw2, 0); this.pass(this.blur, R.s2);
      this.blur.uniforms.tex.value = R.s2.texture; this.blur.uniforms.dir.value.set(0, 1 / R.hh2); this.pass(this.blur, R.s1);
      // wide: quarter res, two blurs
      this.pass(this.bright, R.b1);
      this.blur.uniforms.tex.value = R.b1.texture; this.blur.uniforms.dir.value.set(1 / R.bw, 0); this.pass(this.blur, R.b2);
      this.blur.uniforms.tex.value = R.b2.texture; this.blur.uniforms.dir.value.set(0, 1 / R.bh); this.pass(this.blur, R.b1);
      this.blur.uniforms.tex.value = R.b1.texture; this.blur.uniforms.dir.value.set(2 / R.bw, 0); this.pass(this.blur, R.b2);
      this.blur.uniforms.tex.value = R.b2.texture; this.blur.uniforms.dir.value.set(0, 2 / R.bh); this.pass(this.blur, R.b1);
    }
    // light shafts towards the sun (when it's on screen, or just off it)
    let rayK = 0;
    const RY = L.rays || 0;
    if (this.raysOn !== false && RY > 0 && H.sunDir) {
      const sp = this._sp || (this._sp = new THREE.Vector3());
      sp.set(...H.sunDir).normalize().multiplyScalar(1000).add(u.camPos.value).project(camera);
      const behind = sp.z > 1 || sp.z < -1;
      const su = sp.x * 0.5 + 0.5, sv = sp.y * 0.5 + 0.5, off = Math.max(0, Math.max(Math.abs(su - 0.5), Math.abs(sv - 0.5)) - 0.5);
      rayK = behind ? 0 : RY * Math.max(0, 1 - off * 2.5);
      if (rayK > 0.01) {
        const ru = this.rays.uniforms;
        ru.tDepth.value = R.scene.depthTexture; ru.sunUv.value.set(su, sv); ru.aspect.value = R.w / R.h; ru.vis.value = 1;
        this.pass(this.rays, R.g1);
      }
    }
    // grade + output
    const f = this.final.uniforms;
    f.tRays.value = R.g1.texture; f.time.value = performance.now() / 1000;
    const sc = H.sun || [1, 0.9, 0.7]; f.rayCol.value.set(sc[0] * rayK, sc[1] * rayK, sc[2] * rayK);
    f.tex.value = R.a.texture; f.tBloom.value = R.b1.texture; f.tBloomS.value = R.s1.texture; f.bloom.value = bloomOn ? L.bloom : 0;
    if (p.grade) f.grade.value.set(p.grade[0], p.grade[1], p.grade[2]);
    f.fade.value = p.fade ?? 1;
    f.sat.value = p.sat ?? L.sat ?? 1.08;
    f.contrast.value = L.contrast ?? 1.06; f.exposure.value = L.exposure ?? 1;
    f.shadowT.value.set(...(L.shadow || [1, 1, 1])); f.highT.value.set(...(L.high || [1, 1, 1])); f.lift.value.set(...(L.lift || [0, 0, 0]));
    this.pass(this.final, null);
    [R.a, R.b] = [R.b, R.a];
    this.firstFrame = false;
  }
}
