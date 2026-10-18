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
- **Output:** `marketing/footage/<name>/NN-<rig>.mp4` (1080×1920 or 1920×1080, H.264 crf 14), with the game's own engine
  sound under it. Also `NN-<rig>.wav` (24-bit, for the mix) and `NN-<rig>.engine.json` (the focus car's rpm, speed and
  gear per frame). Footage is gitignored.
- **Sound:** while filming, the director logs exactly what the race sends its engine voices each frame: your car,
  plus the two AI cars nearest the camera, with pan and doppler. Your car is made camera-relative, so it's quieter
  from a trackside camera far away and panned to where it is. After filming, it plays those logs back through the
  game's own engine synth (engine, tire squeal, wind, rumble) in real time and records the result, so the picture and
  sound line up exactly. It adds about the shot's length in time. `"silent": true` in the shot list skips it.

## Shot list
```json
{ "name": "tires-1", "aspect": "9:16", "seed": 3,
  "track": { "real": "spa" } | { "preset": "Maple Ridge GP" } | { "file": ".devtest/auburn2.json" },
  "env": { "time": "day|dawn|dusk|night", "weather": "clear|overcast|rain" },
  "race": { "car": "m1procar", "team": "Silverline", "opponents": 7, "aiChassis": "class", "grid": "middle", "laps": 5, "extra": {} },
  "video": { "look": "arcade", "trails": true },   // optional overrides of the game's video settings
  "res": "hd",                                      // render lines: 9:16 defaults to hd (720), 16:9 to ps2 (448)
  "warmup": 12,                                     // seconds raced unfilmed before shot 1
  "shots": [ { "rig": "dolly", "dur": 5, "focus": "player" | "leader" | 3, ...rig params } ] }
```
- `race.team`: a rival team's livery on your car (`js/teamliveries.js` names, e.g. "Gulfstream Racing"), so the hero
  cars don't all wear the default red/white #7.
- Per shot, where it starts (both race on unfilmed until true, max 240 s):
  - `"at": 870`: metres into the lap for the focus car (a shot at Eau Rouge, not "whenever").
  - `"until": { "wake": 0.85 }`: the focus car deep in a car's dirty air; `{ "slip": 0.6, "wakeBelow": 0.15 }`: in
    the tow on a straight.
- `"aiSees": true` on a shot draws the focus car's own plan into the world (`aisees.js`): its racing line colored
  throttle / lift / brake from its speed plan, a post at each braking point, the target speed (mph) over each apex,
  and the pass planner's move once it commits. Marketing overlay only; it never touches the race.
- The per-frame log (`NN-<rig>.engine.json`) also has the focus car's `wake` (0..1, dirty air) and `slip` (0..1,
  tow), plus `wakeK` (its front/rear downforce loss at full wake), for live readouts in the edit.
- Real tracks: until the dev fixes the pit lanes, keep the pit lane, pit entry and exit out of frame (BRAND §5).
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
- Sound follows your car and the two AI nearest the camera. A shot focused on another car still plays your car's engine.
- No crash or impact sounds yet; no music or voice (those go in the edit).
- Garage, editor (draw-a-track) and livery-designer scenes.
- Grid starts: shots begin with the race already running.
