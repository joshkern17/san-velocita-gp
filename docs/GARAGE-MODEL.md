# Your pit garage model

During practice and qualifying you sit in your team's pit garage (`js/pitgarage.js`). (Your World Career home garage
is built from a kit of pieces instead: see [GARAGE-KIT.md](GARAGE-KIT.md). Without the kit, home uses this model too.) The game has a plain
placeholder room. Put your own model at **`models/garage.glb`** and it's used instead (the first time the garage
opens). For the Windows / single-file version, rebuild it (`cd tools && node build.mjs`); the model is packed inside.

## Start from the template

```
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-template.py
```

This writes `models/garage-start.blend`. Open it, **Save As** your own file (re-running the script overwrites
`garage-start.blend`), and build your garage around what's there:

- **GUIDES** collection: a car-sized red block (`GUIDE_Car`, the cone is the nose), the placeholder room as a
  wireframe, the box the default camera drifts in (`GUIDE_CameraKeepClear`) and the game's camera (`GUIDE_GameView`:
  press Numpad 0 to look through it, F12 to render it; move it to change the shot). Anything named `GUIDE...` is left out by the game, so
  there's no need to delete them before exporting.
- **Hooks** collection: the parts the game fills in. Move them, resize them, give them frames (see below).
- **Garage** collection: a starter floor and bay lines. Replace them with your own model: walls, ceiling,
  doors, benches, anything. The guides hide from renders; hide them in the viewport too (the eye icon)
  whenever they're in the way.

Already have a garage model? File → Append (or Import) it into the template, then line it up with the guides.

## Layout

- **Metres**, floor at **Z = 0**, the **car's spot at the origin**, the car's nose (and the door) towards **−Y**.
- Apply all transforms before exporting (Object → Apply → All Transforms), or at least scale.
- Don't model a car; the player's car is put on the spot.
- **The camera is yours:** `GUIDE_GameView` is the game's camera. Move it (and `GUIDE_CameraTarget`, the
  empty it points at) until Numpad 0 shows the shot you want, and change its field of view for a small room.
  The game uses exactly that shot and drifts slowly around it (a few degrees), so keep about half a metre
  between the camera and any wall. Export with **Cameras on**. Without it (or if you delete the camera) the
  game falls back to its own shot, which needs the full-size room.
- **What's on screen:** the menu covers the left third and an info panel covers the top right. The car, the floor
  around it and the back wall behind it are what you see most. Put your best detail there.

## Hooks (names the game looks for)

| Name | On | What the game does |
| --- | --- | --- |
| `TV_Screen...` | object (a flat plane, 1.6 : 1) | shows the live timing screen |
| `PC_Screen...` | object (a flat plane, about 1.27 : 1) | the computer's screen (World Career). The hub's camera frames the room from the car to this, and zooms into it when you sit down. Without one, an object named `CrtMonitor...` gets a screen laid over its glass. Move the desk anywhere: the shots follow it |
| `TeamBand...` | object (a flat plane, 4 : 1) | shows the team banner (name in team colours) |
| `ListNote...` | object (a flat plane, any size) | where your list is taped up (World Career): the sheet is centred on it, facing the way the plane faces. Without one it goes on the wall straight behind the computer, just above the screen |
| `TeamMain...` | material | colour set to the team's main colour |
| `TeamAccent...` | material | colour set to the team's accent colour |
| `TyreBand...` | material | colour set to the compound you'll go out on |
| `GUIDE_GameView` | camera | the garage shot |
| `GUIDE...` (others) | object | left out |

The names only have to *start* with these (`TV_Screen.001`, `TeamMain_Walls` are fine). Keep `TV_Screen` and
`TeamBand` as simple planes with their default 0–1 UVs, facing into the room. Model a bezel or frame around
them as separate objects. Give `TeamMain` / `TeamAccent` / `TyreBand` materials no texture (the colour is
replaced). All are optional.

## Materials and lighting

- Principled BSDF with image textures only. Procedural nodes don't export: bake them to images first.
- Keep **Metallic at 0** (or close). There's no reflection map, so metallic surfaces look black. Fake metal with a
  light grey base colour and low roughness.
- **Lighting, two ways:**
  - *No lights in your model:* the garage uses its own (sky light, a key light from above-left, light from the
    door, a warm light at the back). Bright and even.
  - *Your own lights (moody):* add Point / Spot lights in Blender. If the model has any, the game switches its
    own off and uses only yours, plus a very faint fill so dark corners aren't pure black. For a light bulb:
    a small sphere with **Emission** (strength 20–40: that's the glow you see, bloom adds a halo) and a
    **Point light** just inside it (that's what lights the walls and the car). Emission alone lights nothing in
    the game. Watts carry over roughly: a 300 W bulb about 3 m up lights the car in a warm pool. Set the
    light's colour in Blender (warm orange for old bulbs, cold blue-white for strip lights).
  - Nothing casts real-time shadows. For darker corners and contact shadows, **bake ambient occlusion**
    into your textures.
- Glass: set the material's Blend Mode / Render Method to Blended and lower Alpha.

## Export

File → Export → glTF 2.0:
- Format **glTF Binary (.glb)**, save as `models/garage.glb`.
- Include: **Cameras on** (your shot). **Punctual Lights on** if you added your own lights.
- Transform: **+Y Up** on.
- Data → Mesh: **Apply Modifiers** on.
- **Compression (Draco) OFF.** The game can't decode compressed meshes and the model won't load.
- Textures: 1K–2K, JPEG for colour where you can. Low-poly is fine (and matches the rest of the game).

## Checking it

Start the game (`serve.py` / Play San Velocita) and start a weekend with practice or qualifying. Or, from the
repo: `node .devtest/garage-test.mjs shot.png` opens the garage headless, prints what was hooked up and saves a
screenshot. If the placeholder room still shows, the file didn't load: check the name/location and that Draco
is off.
