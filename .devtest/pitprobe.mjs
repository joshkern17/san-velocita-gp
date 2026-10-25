// dev: what the pit lane's draws are made of on a saved track: node .devtest/pitprobe.mjs ["track name"]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const which = process.argv[2] || 'Auburn GP2';
const all = JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.tracks.txt'), 'utf8')), track = (Array.isArray(all) ? all : Object.values(all)).find(t => t.name === which);
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 800, height: 450 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 });
  await pg.waitForTimeout(1500);
  await pg.evaluate(async (track) => { const G = window.__svgp; (await import('/js/world.js')).setWorldOptions({ shadows: G.settings.shadows }); G.startRace(track, { mode: 'test', laps: 9, opponents: 0 }, 'setup'); }, track);
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 120000 });
  await pg.waitForTimeout(3000);
  console.log(await pg.evaluate(() => {
    const sim = window.__svgp.sim, out = {};
    sim.scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const path = []; for (let q = o.parent; q && q !== sim.scene; q = q.parent) path.unshift(q.name || q.type);
      if (!/Pit|BoxDress/.test(path.join('>'))) return;
      const g = o.geometry, tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const k = `${path.join(' > ')} > ${o.name || o.type}${o.isSkinnedMesh ? ' skinned' : ''}${o.isInstancedMesh ? ' inst' : ''} ${o.material.type}${o.material.map ? ' map' : ''}`;
      const e = out[k] ||= { n: 0, tris: 0, shadow: 0 }; e.n++; e.tris += tris; if (o.castShadow) e.shadow++;
    });
    return Object.entries(out).sort((a, b) => b[1].n - a[1].n).slice(0, 40).map(([k, v]) => `${String(v.n).padStart(5)} ${String(Math.round(v.tris)).padStart(7)} tris sh${v.shadow}  ${k}`).join('\n');
  }));
} finally { await b.close(); server.kill(); }
