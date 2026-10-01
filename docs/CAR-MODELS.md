# Car models

The game has two chassis: **Your F1 Car** (the Blender model in `models/car.glb`, loaded by `js/glbcar.js`) and
**SVGP Classic** (procedural, `js/carmodel.js`). Pick yours in Garage → Chassis; Options → AI Car Model sets what
the AI teams drive (yours, classic or mixed).

## Updating your model

Export from Blender as `.glb` and save it over **`models/car.glb`**. The game picks it up next time it starts.
For the Windows / single-file version, rebuild it (`cd tools && node build.mjs`); the model is packed inside.

What the loader expects (it already matches your file):
- **Objects:** `Body_*` (moves on the springs), a `...FrontWing` and `...RearWing` object (bend and break off with
  damage), `Wheel_FL` / `FR` / `RL` / `RR` (tyre + rim together), `Arm_<corner>_<anything>` for suspension links
  (the end nearest the car's centre line is the chassis pivot), and a `Halo` object (the driver sits under it).
- **Materials:** `Livery` (painted), `Carbon`, `Tyre`, `TyreStripe` (compound colour), `Rim` (garage rim colour).
  Names containing Dark/Black or Metal/Steel/Chrome get those looks; anything else keeps its Blender colour.
- **Space:** metres, nose along Blender −Y, tyres on Z = 0, centred. Apply all transforms before exporting.
- **UVs:** any unwrap works. Liveries are painted by projection (below), so the UV layout doesn't matter.

## How liveries get onto it

Liveries are model-independent: decals are stored on named **panels** in metres (`sideL`, `sideR`, `podL`, `podR`,
`coverL`, `coverR`, `top`, `fwing`, `rwing`, `plateL`, `plateR`), never in texture pixels.

- **Your model (projected):** when the model loads, every texel of its livery texture is traced back to its
  spot on the car. The panels are then projected onto the surface: left/right sides from the side, top from
  above, wings from behind, sidepods and engine cover as windows of the side views. Any livery, including ones
  made for the classic car, lands in the same places. Garage → Livery Designer → Files → UV template shows which
  panel covers which part of your model's texture.
- **Classic car (atlas):** each panel is a rectangle of a hand-made UV layout, described by `MODEL` in
  `js/carmodel.js`.

A third model would work either way: register it in `CHASSIS` (see `js/glbcar.js` for a full example) and give
it either a projected panel set or an atlas `MODEL`.
## The contract

Export a `MODEL` object like the one in `js/carmodel.js`:

```js
export const MODEL = {
  id: 'my-new-car',
  aspect: 2,            // livery texture width / height
  helmetFront: 0.25,    // u of the visor on the helmet's equirectangular texture
  dark: [[u0, v0, u1, v1], ...],   // optional: atlas areas always painted in the detail colour (floor etc.)
  panels: {
    sideL: { rect: [u0, v0, u1, v1],  // where the panel sits in the atlas (UV, v up)
             o:  [u, v],              // rect-local UV of the panel's TOP-LEFT corner, seen from OUTSIDE the car
             ds: [du, dv],            // rect-local UV step for "right" (across the panel)
             dt: [du, dv],            // rect-local UV step for "down"
             W: 5.1, H: 0.5,          // physical size in metres (keeps decals in proportion)
             role: 'side',            // pattern hint: top | side | pod | cover | wing | plate
             nose: 'left',            // which edge points to the car's nose (left | right | top)
             pair: 'sideR',           // the mirror panel on the other side (for "both sides" decals)
             label: 'Left flank' },
    ...
  },
};
```

Use the same **panel names** so existing decals find a home:
`top, sideL, sideR, podL, podR, coverL, coverR, fwing, rwing, plateL, plateR`.
A model can leave panels out; decals placed on a missing panel simply aren't drawn. It can also add new panels.

## Easiest route (Blender or any modeller)

1. Open the game, go to Garage → Livery Designer → **Files** → **UV template (PNG)**. It shows every panel of
   the current car, labelled, with an arrow for "right as seen from outside" and its size in metres.
2. UV-unwrap the new car so each surface lands in the matching rectangle, facing the same way. Keep the
   texel density roughly even, and give left/right parts their own rects (don't overlap mirrored UVs).
3. Use one material for all livery surfaces. Its colour map is the livery canvas.
4. Copy `MODEL.panels` from `js/carmodel.js` for your model and adjust `rect` / `W` / `H` if your layout differs.
5. For a glTF model, load it with Three's `GLTFLoader`, set the livery `CanvasTexture` as the map on the livery
   material, call `paintCar(canvas, cfg, MODEL)` and then `texture.needsUpdate = true`. `buildF1()` in
   `js/carmodel.js` shows the rest of what the game expects from a car object (`group`, `wheels`,
   `animate()`, `setCompound()`, `setDamage()`, `repaint()`, `livTex`, `lightMat`, `coronaMat`, `shadow`).

**This livery's texture** (same tab) downloads the painted atlas, which is handy for checking a new unwrap.
The designer's click-to-place works on any model whose livery material uses `livTex`, because it raycasts
to a UV and asks `uvToPanel()` which panel it hit.
