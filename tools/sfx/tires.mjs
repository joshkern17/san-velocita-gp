// The tire sounds (js/audio.js TyreVoice) from Sound Armoury's Skids & Surfaces pack (bought; commercial use, no
// attribution): the loops we use, as mono 44.1 kHz FLAC (lossless, so a loop stays seamless), each brought to the same
// loudness (-20 dBFS RMS) so the game's levels mean the same thing for every file. The squeal loops are made to loop;
// the surface recordings get a seam: their last second crossfaded (equal power) into their first, trimmed to `len` s.
//   node tools/sfx/tires.mjs "<path to SA_Skids&Surfaces_96k_v1.0>"    -> assets/sfx/tires/<name>.flac
import { execFileSync, spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PACK = process.argv[2];
if (!PACK || !existsSync(join(PACK, 'Audio'))) { console.error('usage: node tools/sfx/tires.mjs <Skids & Surfaces pack folder>'); process.exit(1); }
const A = join(PACK, 'Audio'), OUT = join(ROOT, 'assets/sfx/tires'); mkdirSync(OUT, { recursive: true });
const S = (d, f) => join(A, 'Skids', d, 'Loop', `VEHSkid_Car Skid, ${f}, Loop_SARM_SkidSurf.wav`);
const G = (d, f) => join(A, 'Surfaces', d, `VEHMisc_Driving Surface Noise, ${f}_SARM_SkidSurf.wav`);
// name: [source, made to loop already?, seconds to keep (surfaces)]
const FILES = {
  squeal: [S('High Squeal', 'High Squeal'), true],                       // a slide past the limit
  squeal_rough: [S('High Rough Squeal', 'Rough Squeal'), true],           // a big one
  spin: [S('High Stuttery Squeal', 'High Stuttery Squeal'), true],        // wheelspin
  lock: [S('Rough Stuttery Squeal', 'Rough and Stuttery Squeal'), true],  // locked wheels
  road: [G('Asphalt/Smooth', 'Asphalt, Smooth A'), false, 8],
  road_rough: [G('Asphalt/Rough', 'Asphalt, Rough A'), false, 8],         // paved runoff, sidewalks
  concrete: [G('Concrete', 'Concrete, Designed'), false, 8],              // street circuits
  wet: [G('Asphalt/Wet', 'Wet Asphalt, Designed'), false, 8],
  grass: [G('Grass', 'Grass, Designed'), false, 8],
  gravel: [G('Gravel', 'Gravel A'), false, 8],
  sand: [G('Sand', 'Sand, Designed'), false, 8],
  dirt: [G('Dirt', 'Dirt, Designed'), false, 8],
};
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 1 << 28 });
const rmsDb = (f) => { // mean RMS (dBFS) of the file as it'll be written (mono)
  const out = spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-ac', '1', '-af', 'astats=measure_perchannel=none', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return +(/RMS level dB:\s*(-?[\d.]+)/.exec(out) || [])[1];
};
const X = 1; // (the seam's crossfade, s)
for (const [name, [src, loops, len]] of Object.entries(FILES)) {
  if (!existsSync(src)) { console.error('missing', src); process.exitCode = 1; continue; }
  const out = join(OUT, name + '.flac'), db = rmsDb(src), gain = -20 - db;
  // a loop: body = [X, L - X], then the tail (L - X .. L fading out) over the head (0 .. X fading in); its end runs on
  // into the body's start, so the wrap is seamless
  const L = len;
  const filter = loops ? `volume=${gain.toFixed(2)}dB`
    : `atrim=0:${L},asetpts=PTS-STARTPTS,volume=${gain.toFixed(2)}dB,asplit=3[a][b][c];` +
      `[a]atrim=${X}:${L - X},asetpts=PTS-STARTPTS[body];` +
      `[b]atrim=${L - X}:${L},asetpts=PTS-STARTPTS,afade=t=out:d=${X}:curve=qsin[t1];` +
      `[c]atrim=0:${X},asetpts=PTS-STARTPTS,afade=t=in:d=${X}:curve=qsin[t2];` +
      `[t1][t2]amix=inputs=2:normalize=0[tail];[body][tail]concat=n=2:v=0:a=1`;
  ff(['-y', '-i', src, '-ac', '1', '-ar', '44100', loops ? '-af' : '-filter_complex', filter, '-sample_fmt', 's16', out]);
  console.log(name.padEnd(13), `${db.toFixed(1)} dB -> -20`, out.replace(ROOT + '/', ''));
}
