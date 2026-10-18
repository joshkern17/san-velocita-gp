# Director mode

The game films itself for marketing. `director.mjs` loads the game in Chrome (GPU via Metal), starts an AI race (the AI
drives your car too), stops the game's own loop and steps the race exactly 1/60 s per frame. It puts the camera on a
rig (`rigs.js`) and grabs each frame straight off the canvas. That means a locked 60 fps at any machine speed, no HUD,
and the same race every time for the same seed.

```
node tools/director/director.mjs tools/director/shots/example.json            # film every shot
node tools/director/director.mjs tools/director/shots/example.json --only 3   # re-film shot 3 only (same race)
  --swiftshader   software GL, if the GPU path fails    --headed   watch it happen
```
- **Speed:** about 10–13 frames/s, so a 30 s shot list takes ~2.5 min.
- **Output:** `marketing/footage/<name>/NN-<rig>.mp4` (1080×1920 or 1920×1080, H.264 crf 14), plus `NN-<rig>.engine.json`,
  the focus car's rpm, speed and gear for every frame, for rendering engine audio in sync later. Footage is
  gitignored.

## Shot list
```json
{ "name": "tires-1", "aspect": "9:16", "seed": 3,
  "track": { "real": "spa" } | { "preset": "Maple Ridge GP" } | { "file": ".devtest/auburn2.json" },
  "env": { "time": "day|dawn|dusk|night", "weather": "clear|overcast|rain" },
  "race": { "car": "m1procar", "opponents": 7, "aiChassis": "class", "grid": "middle", "laps": 5, "extra": {} },
  "video": { "look": "arcade", "trails": true },   // optional overrides of the game's video settings
  "res": "hd",                                      // render lines: 9:16 defaults to hd (720), 16:9 to ps2 (448)
  "warmup": 12,                                     // seconds raced unfilmed before shot 1
  "shots": [ { "rig": "dolly", "dur": 5, "focus": "player" | "leader" | 3, ...rig params } ] }
```
- Shots run back to back on one continuous race. Every shot is its own file, so the edit cuts them.
- Car ids are in `models/cars/cars.json`. Real track ids are in `tracks/real/index.json`.

## Rigs (all calm: eased, no shake)
| rig | what | params (defaults) |
|---|---|---|
| `dolly` | rides alongside, sliding front quarter → rear quarter | `side` 1/-1, `dist` 7, `from` 2.5, `to` -2.5, `h` 0.9, `fov` 45 |
| `orbit` | slow circle around the car | `speed` 0.18 rad/s, `dist` 6.5, `h` 1.3, `start` 2.4, `fov` 45 |
| `trackside` | planted ahead, long lens, pans as it passes; picks a spot that can see the road (raycast, trees included) | `ahead` 80, `side`/`offset`/`h` to pin, `frame` 7, `minFov` 8, `maxFov` 55 |
| `heli` | high, behind and to the side, looking down the road | `back` 28, `h` 22, `offset` 10, `fov` 38 |
| `wheel` | close on a wheel, riding with the car | `axle` front/rear, `side`, `out` 1.9, `h` 0.35, `lead` 0.9, `fov` 50 |
| `static` | locked off on a clear spot | `ahead` 40, `lookAhead` -15, `side`/`offset`/`h`, `fov` 35 |
| `game` | the game's own cameras | `mode` chase/far/tcam/bumper |

## Not yet
- Audio: engines rendered offline from the `.engine.json` logs (next step).
- Garage, editor (draw-a-track) and livery-designer scenes.
- Grid starts: shots begin with the race already running.
