---
name: garage-station
description: Build or remake a detailed home-garage piece for the Racing Game (a facility station like the dyno, fab bay, data room, lift, sim rig, workbench, or a premises shell / prop set) with a scripted Blender model in the game's PS1-plus style - real-looking shapes, grimy PSX textures, AO baked into vertex colours, the kit's hooks - then check it, render it, shoot it in the game, and swap it in. Use this whenever the user asks to make, remake, improve, detail or "make look good / cool" any garage station, facility, workshop corner, garage building or garage prop, or to start the next garage (race workshop, factory / campus), even if they don't say Blender.
---

# Garage stations, made properly

The engine dyno (`tools/garage-dyno.py`, Oct 2026) set the bar the user loved: a believable test cell, not a bench of
boxes. This skill is how to get that again for any station or garage. Read `docs/GARAGE-KIT.md` for the kit's
contract (hooks, slots, BUSY_/IDLE_) if you haven't this session.

## What "the style" is

PS1-plus: chunky low-poly that reads as the real thing, PSX textures (64 px, nearest, 5-bit dither) with grime, and
pre-baked shading. What made the dyno work, in order of impact:

1. **Know the real thing first.** Before any code, write down what the real station is made of, the way someone who
   works in one would list it: the dyno was a V8 (banks at 45°, trumpets, headers into collectors, belt, filter), an
   eddy-current absorber (fins, trunnions, torque arm, load cell), a cell (mesh screen, acoustic panels, tread plate,
   extraction, cooling module, fuel cart) and an operator console (bridge, switches, throttle lever, E-stop, CRTs,
   rack). Twenty-odd recognisable parts beat one big accurate one. The user notices story details too (Danny's
   "DO NOT TOUCH" strip, the running sign).
2. **Shapes that aren't boxes.** Chamfer every box (`bbox`), turn round things on a lathe (`lathe`: trumpets, pulleys,
   drums, beacons, lamp shades, extinguishers), run pipes and hoses as smooth swept tubes (`sweep`), use real sections
   for steel (`ibeam`). A boxy engine was the thing that made the old dyno look cheap.
3. **Textures that run along things.** `sweep` gives UVs along the tube, so a header goes gold to blue with heat, a duct
   has ribs, a hose is braided. Cutouts (`cutout_mat`) for welded mesh, grating and fences you can see through.
4. **Grime on everything custom-built** (the user's standing rule): `grimy_tile` from the PSX Industrial textures, never
   a flat colour on a big surface. Pack models keep their own textures.
5. **Baked AO** (`bake_ao`): dark under the engine, in corners, where parts meet. Free at runtime, very PS1.
6. **Something that changes when it's in use**: BUSY_ pieces (the engine, glowing screens, a lit sign, a beacon and
   its light) and IDLE_ ones (dark screens, a covered bench, boxes). The crew works busy stations harder.

## Conventions (the game relies on these)

- One collection per piece, named `station_<key>` (key = the facility, or `<facility><level>` like `tools2`), built
  round its own origin: floor at z 0, its **back on y = 0 against the wall, its front down -Y**. Keep inside the old
  piece's footprint unless you also move the slot (measure the old one: its .glb or its collection's bounds).
- The shell's `SLOT_<key>` empty places it; `stationKeys()` in `js/main.js` decides which keys exist.
- `STAND_<role>` empties where people work (custom props `clip`, `role`; they face the empty's local -Y). A
  `kneel*` STAND needs something solid 0.55 m in front at knee height or the crew won't use it. `busyOnly` stands are
  named like `STAND_dynobed`. Seats: `sit_desk` at a chair (the chair 0.48 m seat).
- `BUSY_<key>_...` / `IDLE_<key>_...` prefixes for in-use states; lights can be BUSY too (`BUSY_dyno_Light_Beacon`).
- `Light_*` point/spot lights export with the piece. Use few: every light costs every frame in the whole room.
- Screens: an emissive art card in front of a pack CRT. The CRT model's glass faces -Y; the card goes 0.17 m in front
  of its base and 0.09 m up, turned with it (see the dyno's loop).
- Printed art (signs, plates, panels, notes, screens) is drawn with PIL in `tools/garage-signs.py` (system python3,
  not Blender's). Make the image the card's aspect and check the text fits: the ENGINE RUNNING text overflowed once.
- Budget: ~15k triangles a station. Sweeps are the usual culprit: `per_m` 4-6 for cables, ~14 for headers, 8 for
  big ducts; `segs` 4-6 for thin things.

## The workflow

1. **Survey.** The old piece (its script section, its .glb stats, its hooks), its slot in each shell that uses it
   (`tools/garage-unit.py`, `tools/garage-kit.py`), and take baseline game shots:
   `node .devtest/stationshot.mjs .devtest/out/<key>/old <key>`.
2. **List the real thing** (see above) and lay it out on paper in the footprint: where people stand, where they walk
   in, what the player sees from the room (the front view matters most: don't hide the hero piece behind a rack).
3. **Write `tools/garage-<key>.py`**, starting from `tools/garage-dyno.py` (copy its header, setup, material and
   export sections). Shared helpers come from `tools/garagelib.py`:
   - `bbox lathe sweep ibeam tiled_card retile grid_out` + `bx cy rd cd` (garagelib's box/cyl/rod/card, registered
     for the AO bake; anything made another way: `mk(obj)`)
   - `grimy_tile` (metal, concrete, wood), `plain_mat` (laminate, plastic, painted board: metal tiles look like camo
     there), `px_tex`, `cutout_mat` (see-through from an array), `art_cutout` (a PNG with its own alpha: chalk,
     sparks, decals), `solid_mat`, `art_mat`, `mat_img`; `lib()`/`put()` for pack props
   - `bake_ao(coll, skip=(cutout mats,), wall=True)` (wall=False for a piece out in the room, like the lift bay),
     `export_station(coll, path)`, `tris(coll)`
   Default the output to `models/garage/station_<key>_v2.glb` while it's being compared; `--blend` saves
   `models/garage/<key>-start.blend` (gitignored, for looking at).
4. **Build** headless (≈10 s): `/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python tools/garage-<key>.py -- --blend`
5. **Check** (catches floating props, broken hooks, BUSY without IDLE, the budget; exit 1 on errors):
   `Blender -b models/garage/<key>-start.blend --python .claude/skills/garage-station/scripts/check_station.py -- station_<key> [budget]`
6. **Look at it**: `Blender -b models/garage/<key>-start.blend --python .claude/skills/garage-station/scripts/render_station.py -- station_<key> <outdir> [idle]`
   then Read `<outdir>/sheet.png`. Look like the user will: is anything floating, clipping, stretched (a texture over a
   whole panel instead of tiled), oddly coloured (oil-slick textures turn rainbow purple), backwards (screens), hidden?
7. **In the game**, side by side with the old one, without replacing it:
   `KIT=station_<key>=station_<key>_v2 node .devtest/stationshot.mjs .devtest/out/<key>/new <key>` and put old/new
   in one image. In-game lighting is darker and flatter than Blender's: judge there.
8. **Show the user** both, and load it into their Blender if the MCP add-on is connected (see the
   `reference-blender-mcp` memory): append the collection from the .blend into a scene of its own, never touch their
   scene. Iterate on what they point at.
9. **Swap in** when they say so: output to `station_<key>.glb`, make the old script's exporter skip that collection
   (`tools/garage-stations.py` export_kit `SKIP`), rerun the station and crew checks (`.devtest/crewcheck.mjs`), then
   commit only your files (see the staging memory: other sessions share this tree) and push if they want it live.

## Pitfalls already hit

- Props set at the height of something that later moved float (the dyno's CRTs). Place things on surfaces by the
  surface's own number (`TOPZ`), and let `check_station.py` catch the rest.
- A texture on a card is stretched over the whole card unless tiled: `tiled_card(..., tile=0.3)`; lathed/swept
  cutouts need their UVs scaled too.
- Blender 5 materials default to `surface_render_method = 'DITHERED'`; don't use it to find cutouts.
- `oil_slick_*` textures read as purple rainbows at PSX resolution; a dark glossy puddle reads as oil.
- The headless render lighting isn't the game's; always confirm in a game shot.
- Big, few-vertex faces get no AO detail: `grid_out` plain boxes (floor plates, panels), not bevelled ones.
- A newly made object's `matrix_world` is stale until `bpy.context.view_layer.update()`: moving things by their world
  matrix before that sends them to the origin.
- A piece that isn't against a wall (a lift in a car bay): `bake_ao(wall=False)`, and pass `nowall` to the checker and
  `nowall studio` to the renderer (studio adds soft lights for pieces with few of their own).
- Thin walls (bins, trays) under 6 mm don't count as support in the checker: make them 8 mm.
- The game camera in `stationshot.mjs` stands at a fixed spot: if the hero piece is out of its frame, write your own
  framing (`.devtest/dataShot.mjs`, `.devtest/simshot.mjs` are examples) rather than moving the piece for the camera.
- Seats: the sit clips expect a 0.48 m seat (`CLIP_INFO` in js/characters.js); sitting clips are relaxed poses, hands
  in the lap, not on a wheel.
