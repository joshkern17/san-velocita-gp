---
name: real-track
description: Add or rebuild a real-world circuit in the Racing Game (San Velocita GP) the way Circuit of the Americas was made in Oct 2026, the user's favorite track so far - the layout from OpenStreetMap + national LiDAR heights and camber, one smooth barrier per side following the gist of the mapped rails, paved / gravel runoff that reads as intentional, the pit lane, the real buildings and trees from the laser scan, the modular kit grandstands where the real stands are, and the circuit's landmark buildings scripted in Blender - then Track Check, chase shots, seeded AI races in street / GT1 / F1, perf, commit. Use whenever the user asks to add, import, make, detail, dress or fix up a real track or circuit (Spa, Suzuka, Laguna Seca, Silverstone, any named circuit), its barriers, runoff, pit lane, grandstands, buildings, trees or landmarks, or asks why something on a real track looks wrong - even if they don't say "real track".
---

# Real circuits, made like COTA

COTA (commit 168fd51, `tools/tracks/landmarks/cota*`, `tracks/real/{dress,scan}/cota.json`) is the reference: open
its files when a step below is unclear. The user's words for what made it good: barriers "simple and smooth, not a
bunch of little pieces", custom buildings, the modular grandstands, and runoff that "sorta matches but looks smooth
and intentional". Their standing rules apply: American English in any copy, never two headless Chrome or Blender jobs
at once (always through `.devtest/guard.sh`), verify like a player (shots round the lap, not just numbers), test
street + GT1 + F1, commit and push at milestones staging only your own hunks.

## The pipeline, in order

Each step writes a side file that `tools/tracks/build.mjs` re-applies on every rebuild, so later steps never undo
earlier ones and you can rebuild at any time. Doing them in this order avoids rework: barriers decide where stands
can go, and the scan has to exist before the kit stands clear trees out of it.

| # | Step | Command | Writes |
|---|------|---------|--------|
| 1 | Catalog entry | edit `tools/tracks/catalog.mjs` (field docs at its top; copy the `cota` entry) | |
| 2 | Build | `.devtest/guard.sh -m 7000 -t 900 node tools/tracks/build.mjs <id>` | `tracks/real/<id>.json`, `index.json` |
| 3 | Look at it | `node --import ./tools/tracks/three-hook.mjs .claude/skills/real-track/scripts/map.mjs <id> out.png --bar` | a PNG to Read |
| 4 | Barriers | `TYPE=armco node --import ./tools/tracks/three-hook.mjs tools/tracks/barriers.mjs <id> 16 --mapped --write` | `tracks/real/dress/<id>.json` `barriers` |
| 5 | Pit lane | Track Check tells you if the game invented one; else hand-place `dress.pit` (below) | `dress/<id>.json` `pit` |
| 6 | LiDAR scan (USA) | `.devtest/guard.sh -m 7000 -t 600 node tools/tracks/realscan.mjs <id> 250` | `tracks/real/scan/<id>.json` |
| 7 | Grandstands | `node --import ./tools/tracks/three-hook.mjs .claude/skills/real-track/scripts/stands.mjs <id> --kit`, edit into `tools/tracks/landmarks/<id>-kit.json`, then `node tools/tracks/kitstands.mjs <id>` | props + propLines |
| 8 | Landmarks | write `tools/tracks/landmarks/<id>.py` (lmkit), `Blender -b --python-exit-code 1 --python tools/tracks/landmarks/<id>.py`, then `node tools/tracks/landmarks.mjs <id>` | `models/landmarks/<id>.glb/.json` |
| 9 | Rebuild + check | build again, then `.devtest/guard.sh -m 7000 -t 600 node tools/tracks/check.mjs <id>` | `.devtest/out/trackcheck/` |
| 10 | Drive it | shots, AI, perf (below) | |

Step 2 needs `-m 7000` because the guard adds up every Chrome process and a bake goes past its 3000 MB default.

### 1-2. Catalog + build
- `guide: { f1: '<name in f1-circuits.json>' }` picks the right layout among the map's many. `skip` takes the pit
  lane and the other layouts' way names. Set `dem` to the country's LiDAR source (`usgs`, `ign`, `ahn`, `gsi`, `wallonia`).
- env that worked for a modern GP venue: `runoffStyle: 'paved'`, `pitStyle: 'modern'`, `barrier: 'armco'`,
  `fenceH: 2.8`, `setting: { kind: 'none', flora: 'mixed' }`, and `scatter: { mix: 'meadow', r: 90, d: 0.12 }` for
  trees where the map has none. Older circuits suit `pitStyle` `classic` / `heritage` (see project-pit-styles).
- Edge paint: `edgeLine: 'band', edgeColor: '#c8102e'` gives the white / color / white band down both edges, past the
  curbs, like COTA's red one (the editor's Track tab › Edge line). Look at photos of the real track and use its
  color, or leave it off for the plain white line.

### 3. Read the map before deciding anything
`map.mjs` draws the road with a lap-metre label every 250 m, the map's rails, walls and fences, the pit lane, the
buildings (scan buildings in orange), the props and a world-coordinate grid. `--zoom=x,z,r` zooms in on a corner, and
`--stands=file` overlays outlines from `stands.mjs --json`. Use it to:
- name the turns by their lap metres;
- spot buildings the map tags wrongly. COTA's 76 m tower was mapped as a plain building, and only its baked height
  gave it away;
- see where the real stands, the pit building and the infield are.

### 4. Barriers: one smooth line per side
`--mapped` sets each side's distance from where the map's barriers roughly are (`track.osm.walls`). It takes a median
over 120 m and eases it, clamps it to 6-45 m and caps the inside of corners. A single pass then pulls the line in
where it cut a corner. `evenBarriers` fits the fewest cubic nodes that stay smooth, giving one barrier per side.
- `TYPE` is the barrier look (`armco`, `concrete`, `tires`). Without `--mapped`, the number is one distance all round.
- Expected and fine: the inside of a hairpin always folds in at the apex.
- Never trace the map's barrier pieces one by one (feedback: smooth runoff and barriers). The user wants an
  interpretation, not the noise.

### 5. Pit lane
The game makes up a pit lane when the mapped one sits too close to the track (`tidyRamps` rejects it), and it may put
it on the wrong side. You'll know because the made-up lane pushes the main stand inside the barrier, and Track Check
fails "stands inside the barrier". In that case place it by hand in `tracks/real/dress/<id>.json`:
```json
"pit": { "side": -1, "pts": [[5060,-0.8],[5085,1.5],[5110,5.5],[5135,8.6],[5150,9.5],[120,9.5],[150,8.6],[180,5.5],[210,1.5],[240,-0.8]], "main": [5165,105] }
```
- Each `[d, off]` is a lap metre and an offset from the track edge (side -1 = left). The lane is `PIT.width` 9 m wide.
- `main` holds the garage stretch: its start metre and its length.
- Ease in and out over about 75 m, and keep entry and exit on straights: a lane cutting inside a hairpin draws badly.

### 6. Real buildings and trees (USA)
`realscan.mjs` does what the editor's MAP › Get Real Houses & Trees does:
- the 1 m bare-earth LiDAR into `terrain.fine`;
- every FEMA building outline at its laser height;
- every scanned tree within the band.

The circuit's own buildings should not become houses or apartments. List the circuit's grounds in the landmark
script (`grounds=[x0, x1, z0, z1]` in `K.finish`); `landmarks.mjs` then retypes the map's and the scan's buildings
inside as utility sheds or warehouses. Outside the USA there's no scan: the map's buildings plus `scatter` will do.

### 7. Grandstands from the modular kit
`stands.mjs` reads the Overpass cache the build left behind. For each grandstand, tribune, amphitheater or pit
building outline it gives:
- the front line: the long edge nearest the road;
- its length, depth, distance from the road and lap metre;
- with `--kit`, a draft kit json, sized S under 60 m, M under 150 m, L above that.

Then hand-edit `<id>-kit.json`:
- Give the stands real names ("Turn 1", "Main Grandstand").
- Pick the sizes by look (COTA's 173 m Turn 15 stand works better as M).
- Keep `clear` holding the pit building and every map stand outline. Without that, the back half of a real stand is
  left standing as a FEMA box behind the kit stand.

`kitstands.mjs` moves each line back behind the barrier, builds the pieces (`kitLineProps`) and clears the map's and
the scan's buildings and trees inside. Never use the old default grandstand prop (feedback: grandstands).

### 8. Landmarks in Blender
Copy `tools/tracks/landmarks/cota.py`; the API is in the header of `lmkit.py`.
- **Setup and roots.** `K.setup(id, seed)` starts the script. Each landmark gets `K.root(key, x, z, hw, hd, rot)`, a
  root at the middle of its footprint with ground level 0. The game seats each root at the highest ground under it.
- **Building pieces.** `K.blk` / `K.face` / `K.cylv` / `K.rodv` / `K.flat_roof` and the `K.Frame` helpers, plus
  `G.lathe` / `G.sweep` from garagelib for round and curved parts (COTA's red veil is 17 swept Bézier tubes).
- **Finish.** End with `K.finish(id, stand_lines, grounds=[...])`.
- **Uneven ground.** Make each piece that sits on a slope its own root, like COTA's seat rows on the amphitheater
  bowl. Find the bowl with `heights.mjs <id> x z radius step`.
- **Position.** Take it from the map (`map.mjs`), and the height and look from web photos and the architect's pages.
- **Budget.** COTA's set is 72 pieces and 39k triangles.

### 10. Drive it like a player
- **Chase shots by lap metre, plus a probe of anything standing on the road:**
  `.devtest/guard.sh -m 7000 -t 300 node .claude/skills/real-track/scripts/shots.mjs <id> <outdir> --probe d150 d450 d850 t1:-200,30,600,-220,0,660`.
  Check.mjs also shoots every 500 m (`--every=250` for more). Read every picture.
- **Seeded AI:** `TRK=/tracks/real/<id>.json node .devtest/aibatch.mjs <car> 1 2` for a Civic, a CLK GTR and an F1.
  Use at least 2 laps (1 lap crashes on `bestMed toFixed`), and `OFFMAP=1` shows where they went off. Expect 0 walls
  and 0 wrecks. GT1 cars run off while racing in a train, which is a known racecraft issue, not the track's fault.
- **Performance:** `node .devtest/perfmap.mjs tracks/real/<id>.json 100`. The worst frame should be under ~16 ms
  (COTA: 12.9 ms, where the L stand bays are the biggest triangle cost).

## Gotchas already paid for
- **Big buildings inside the barrier.** Track Check's "scenery inside the barrier" catches this: anything from a town
  inside the barrier on its side. The first one was a gas station's price sign on COTA's Turn 3 curb. It came from an
  OSM building tagged `fuel`: the shop builder aims a gas station's front at the nearest road, which was the circuit.
  `js/housebuild.js` now keeps a shop's out-front pieces outside the barriers (`opts.clear`, from world.js), so fix
  the data, not the check.
- **A scanned shed can draw a graffiti warehouse model.** That's the wrong tone at an F1 venue; check the infield in
  the shots.
- **Tool quirks.**
  - Use `sips` or `rsvg-convert` for SVG to PNG: ImageMagick chokes on the fonts.
  - Use a background watchdog, because macOS has no `timeout`.
  - Running game modules from node needs `--import ./tools/tracks/three-hook.mjs`.
- **What a rebuild keeps.** The index (`tracks/real/index.json`) is the light list, and build.mjs keeps `osm`,
  `terrain` and `scan` out of it. Only hand-edit the side files (`dress/`, `scan/`, `-kit.json`, the landmark
  script). The built `<id>.json` is regenerated.

## Done means
- Track Check has 0 fails; each warning is understood and named in the report (a real tight hairpin is fine).
- You've looked at chase shots round the whole lap and at each landmark and stand.
- The AI runs clean in street, GT1 and F1, and the worst frame is in budget.
- The commit holds only your files (other sessions share this tree: rebuild the base plus your hunks, never
  `-U0 apply`), it's pushed, and `project-real-tracks` memory or a new project memory says what's left open.
