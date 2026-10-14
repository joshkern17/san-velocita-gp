// Lets node import the game's js/ modules: 'three' (an import map in the browser) -> vendor/three.module.min.js.
//   node --import ./tools/tracks/three-hook.mjs script.mjs
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const THREE = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../vendor/three.module.min.js')).href;
registerHooks({ resolve: (spec, ctx, next) => (spec === 'three' ? { url: THREE, shortCircuit: true } : next(spec, ctx)) });
