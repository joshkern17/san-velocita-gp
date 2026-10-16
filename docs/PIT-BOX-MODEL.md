# The pit box model

`models/pitbox.blend` is one team's pit box, as the game draws it. Edit it in Blender, export it to
`models/pitbox.glb`, and every team's box on every track is built from it (`js/pitbox.js`). Without
`models/pitbox.glb` the game falls back to its own built-in box.

## Exporting

File → Export → glTF 2.0, format **glTF Binary (.glb)**, saved over `models/pitbox.glb`. The default
settings are fine: +Y Up on, everything included (not just the selection). Then reload the game.

## The layout

- X runs across the box (to your right, stood in the door looking in), Y runs in from the door, Z is up.
- The floor's top is at Z = 0.06 m. The door is at Y = 0 and the back wall at Y = 14.
- The file is the usual 15 m wide box, with side walls at X = ±7.35. Boxes are 12-16 m wide along a pit lane.
  Anything more than 3.4 m off the middle keeps its distance from its own side wall. Anything nearer the middle
  stays where it is.
- On some pit lanes the boxes are mirror images (left and right swapped), as the built-in ones are.
- **The cars** park where `REF_your_car` is, nose to the door: yours in your box, each team's in theirs. Move it
  and they all move.

## Names the game looks for

| Name | What it does |
|---|---|
| `PLAYER_COMPUTER` | **Your computer** (the race-weekend menu's). It's in every box, but in your box its glass shows the computer's screen, and nobody else sits at it. |
| `PLAYER_SCREEN` | The computer's glass: the computer's screen is drawn on this plane. Keep it parented to `PLAYER_COMPUTER`. |
| anything with `COMPUTER` in its name | A crew computer (`CREW_COMPUTER`, `PLAYER_COMPUTER.001`…): an engineer sits at it if there's a chair beside it. |
| anything with `chair` or `stool` in its name | A seat: it belongs to the computer nearest it (within 1.6 m), and the engineer sits there facing that computer. |
| `TIMING_SCREEN` | The glass on the wall: in your box the session's live timing shows here. |
| `TEAM_NAME` | The plane each team's name is written on. |
| `TEAM_MAIN`, `TEAM_ACCENT` (materials) | Painted in each team's colors. |
| `GLOW_*` (materials) | Lit up: drawn at full brightness, no shading. |
| `REF_*` | Left out by the game: the room (built to each box's width), your car's outline, the spare props. |

Everything else (any collection) appears in every box. The little things (`box_`, `bucket`, `broom`, `jerry`,
`paint`, `spray`, `tape`, `screw_bin`, `toolbox`, `wrench`, `hammer`) differ from box to box: about a third are left out,
the rest are nudged and turned a little. The room's light is baked into it when it's
loaded. Any object standing on the floor below head height also blocks you when walking the pit lane.

**Spare props** (hidden collection): one of each piece of furniture from the tools pack. Duplicate one (Shift+D)
into the Box collection to add it.

## The people (`js/pitcrew.js`)

In practice and qualifying, each box's crew works out what to do from what's in the file:
- **Engineers** sit at the computers that have a chair.
- **The others** talk in twos to fours. They also go off to the tire stacks, tool chests (and anything with `tool` in
  its name), benches (they lean back on them), shelves, the timing screen, and the car's wheels.
- **Getting around:** they walk round whatever stands on the floor.
- **Car out on a run:** most go to the door to watch.

Every box rolls its own dice, so no two boxes are the same.

**Pushing your car (`js/pushcar.js`):**
- **Drive Out:** your crew pushes the car out of `REF_your_car`'s spot, through the door and round onto the lane.
- **Pulling up at your box** at the end of a run: they push it back in, tail first, to that same spot.

They take the four crew on their feet nearest the car and walk round what's in the box to get to it. So keep a way
clear from the car's spot to the door.

## Known limits
- **Lights and the room:** lights in the file are ignored, and so are changes to the floor, walls or ceiling.

## Remaking the file from the game

This overwrites your edits.

```
node tools/props/pitbox-dump.mjs /tmp/pitbox.json
blender -b --python tools/props/pitbox.py -- /tmp/pitbox.json models/pitprops.glb models/garage.glb assets/textures models/pitbox.blend models/pitbox.glb
```
