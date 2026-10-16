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
- **Your car** parks at Y = 6.5, nose to the door: `REF_your_car` is its outline.

## Names the game looks for

| Name | What it does |
|---|---|
| `PLAYER_COMPUTER` | **Your computer** (the race-weekend menu's). It only appears in your box, and is never mirrored. The menu's camera shots are set from where it is. |
| `PLAYER_SCREEN` | The computer's glass: the computer's screen is drawn on this plane. Keep it parented to `PLAYER_COMPUTER`. |
| `PLAYER_*` | The rest of your desk (desk, chair, keyboard, lamp…): only in your box, never mirrored. Anything else that would stand where your desk is gets left out of your box. |
| `TIMING_SCREEN` | The glass on the wall: in your box the session's live timing shows here. |
| `TEAM_NAME` | The plane each team's name is written on. |
| `TEAM_MAIN`, `TEAM_ACCENT` (materials) | Painted in each team's colors. |
| `GLOW_*` (materials) | Lit up: drawn at full brightness, no shading. |
| `REF_*` | Left out by the game: the room (built to each box's width), your car's outline, the spare props. |

Everything else in the **Box** collection appears in every box. The room's light is baked into it when it's
loaded. Any object standing on the floor below head height also blocks you when walking the pit lane.

**Spare props** (hidden collection): one of each piece of furniture from the tools pack. Duplicate one (Shift+D)
into the Box collection to add it.

## Known limits

- **The crew's spots don't follow your edits:** the engineer at the bench, the mechanic leaning on the work bench
  and the others are placed in code (`js/pitlife.js`).
- **Lights and the room:** lights in the file are ignored, and so are changes to the floor, walls or ceiling.

## Remaking the file from the game

This overwrites your edits.

```
node tools/props/pitbox-dump.mjs /tmp/pitbox.json
blender -b --python tools/props/pitbox.py -- /tmp/pitbox.json models/pitprops.glb models/garage.glb assets/textures models/pitbox.blend models/pitbox.glb
```
