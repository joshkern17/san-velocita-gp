# Your pit garage model

During practice and qualifying you sit in your team's pit garage (`js/pitgarage.js`). The game has a plain
placeholder room. Put your own model at **`models/garage.glb`** and it's used instead (the first time the garage
opens). For the Windows / single-file version, rebuild it (`cd tools && node build.mjs`); the model is packed inside.

## Start from the template

```
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-template.py
```

This writes `models/garage-start.blend`. Open it, **Save As** your own file (re-running the script overwrites
`garage-start.blend`), and build your garage around what's there:

- **GUIDES** collection: a car-sized red block (`GUIDE_Car`, the cone is the nose), the placeholder room as a
  wireframe, the box the camera drifts in (`GUIDE_CameraKeepClear`) and the game's camera (`GUIDE_GameView`:
  press Numpad 0 to look through it, F12 to render it). Anything named `GUIDE...` is left out by the game, so
  there's no need to delete them before exporting.
- **Hooks** collection: the parts the game fills in. Move them, resize them, give them frames (see below).
- **Garage** collection: a starter floor and bay lines. Replace them with your own model.

Already have a garage model? File → Append (or Import) it into the template, then line it up with the guides.

## Layout

- **Metres**, floor at **Z = 0**, the **car's spot at the origin**, the car's nose (and the door) towards **−Y**.
- Apply all transforms before exporting (Object → Apply → All Transforms), or at least scale.
- Don't model a car; the player's car is put on the spot.
- **The camera** sits about 4–5 m to the car's right and 5.5–6.5 m towards the door, 2 m up, looking back at
  the car. Keep `GUIDE_CameraKeepClear` empty, and keep walls further out than it (front wall at least 7 m from
  the origin, the right wall at least 5.5 m). The door is behind the camera, so you won't see out of it.
- **What's on screen:** the menu covers the left third and an info panel covers the top right. The car, the floor
  around it and the back wall behind it are what you see most. Put your best detail there.

## Hooks (names the game looks for)

| Name | On | What the game does |
| --- | --- | --- |
| `TV_Screen...` | object (a flat plane, 1.6 : 1) | shows the live timing screen |
| `TeamBand...` | object (a flat plane, 4 : 1) | shows the team banner (name in team colours) |
| `TeamMain...` | material | colour set to the team's main colour |
| `TeamAccent...` | material | colour set to the team's accent colour |
| `TyreBand...` | material | colour set to the compound you'll go out on |
| `GUIDE...` | object | left out |

The names only have to *start* with these (`TV_Screen.001`, `TeamMain_Walls` are fine). Keep `TV_Screen` and
`TeamBand` as simple planes with their default 0–1 UVs, facing into the room. Model a bezel or frame around
them as separate objects. Give `TeamMain` / `TeamAccent` / `TyreBand` materials no texture (the colour is
replaced). All are optional.

## Materials and lighting

- Principled BSDF with image textures only. Procedural nodes don't export: bake them to images first.
- Keep **Metallic at 0** (or close). There's no reflection map, so metallic surfaces look black. Fake metal with a
  light grey base colour and low roughness.
- **Lights from Blender are ignored.** The garage keeps its own (sky light, a key light from above-left, light
  from the door, a warm light at the back). For light panels and screens use **Emission**. For depth, **bake
  ambient occlusion / shadows** into your textures. Nothing in the garage casts real-time shadows.
- Glass: set the material's Blend Mode / Render Method to Blended and lower Alpha.

## Export

File → Export → glTF 2.0:
- Format **glTF Binary (.glb)**, save as `models/garage.glb`.
- Include: leave Cameras and Punctual Lights off.
- Transform: **+Y Up** on.
- Data → Mesh: **Apply Modifiers** on.
- **Compression (Draco) OFF.** The game can't decode compressed meshes and the model won't load.
- Textures: 1K–2K, JPEG for colour where you can. Low-poly is fine (and matches the rest of the game).

## Checking it

Start the game (`serve.py` / Play San Velocita) and start a weekend with practice or qualifying. Or, from the
repo: `node .devtest/garage-test.mjs shot.png` opens the garage headless, prints what was hooked up and saves a
screenshot. If the placeholder room still shows, the file didn't load: check the name/location and that Draco
is off.
