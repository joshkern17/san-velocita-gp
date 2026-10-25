// dev: models/pitprops.glb laid out in a row, seen from the front (the game's +Z) and a little to the right: each prop's
// name under it. node .devtest/pitpropsheet.mjs <out.png>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1600, height: 900 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 });
  await pg.evaluate(async () => {
    const THREE = await import('three'), { GLTFLoader } = await import('/vendor/addons/loaders/GLTFLoader.js');
    const g = await new GLTFLoader().loadAsync('/models/pitprops.glb');
    const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(1600, 900); r.outputColorSpace = THREE.SRGBColorSpace;
    Object.assign(r.domElement.style, { position: 'fixed', inset: 0, zIndex: 99999 }); document.body.appendChild(r.domElement);
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x30343c);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.2)); const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(2, 4, 5); sc.add(d);
    const kids = [...g.scene.children]; let x = 0, row = 0; const labels = [];
    kids.forEach((o, i) => {
      const bb = new THREE.Box3().setFromObject(o), w = Math.max(0.4, bb.max.x - bb.min.x);
      if (x + w > 9) { x = 0; row++; }
      o.position.set(x + w / 2, 0, -row * 3); x += w + 0.3; sc.add(o); labels.push([o.name, o.position.clone()]);
    });
    const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100); cam.position.set(4.6, 3.2, 9.5); cam.lookAt(4.6, 0.2, -3.5);
    r.render(sc, cam);
    for (const [n, p] of labels) { const v = p.clone().project(cam), el = document.createElement('div'); el.textContent = n;
      Object.assign(el.style, { position: 'fixed', left: ((v.x + 1) / 2 * 1600 - 30) + 'px', top: ((1 - v.y) / 2 * 900 + 6) + 'px', color: '#ff0', font: '12px monospace', zIndex: 100000 }); document.body.appendChild(el); }
  });
  await pg.waitForTimeout(500); await pg.screenshot({ path: process.argv[2] });
} finally { await b.close(); server.kill(); }
