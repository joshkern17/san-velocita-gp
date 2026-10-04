# Characters

`models/characters.glb` holds the game's people: 16 NPC looks and the racer on one Mixamo skeleton, plus every clip.
`js/characters.js` loads it and spawns them. `characters.html` previews them all.

## Sources (not in the repo: the pack's licence forbids redistributing it)

- **BitSoft "Rigged Low-Poly Male Job NPCs"**: the main `.blend` (12 looks) and the "t-shirt mod" `.blend` (4 looks).
- **Mixamo**: `T-Pose.fbx` (the skeleton, auto-rigged on *Male NPC worker gray.fbx*, No Fingers or any LOD) and one
  `.fbx` per clip, downloaded as *FBX Binary, Without Skin, 30 fps*, walks with *In Place* ticked.
  Everything sits loose in the pack folder (`~/Downloads/Male PSX Characters`).

- **The racer**: `models/helmet-paint.glb`, exported from `models/racer/helmet-paint.blend` (the long-sleeve suit
  with gloves, made from the coveralls guy, and the helmet). That `.blend` is also where the helmet is painted.

- **The women's heads**: `models/heads-female.glb`, cut from BitSoft's *Rigged Low-Poly Female NPCs* (same licence)
  by `female_heads.py` (everything in the skin material above the neck, one head per face texture):
  `blender -b "<pack>/Rigged Low-Poly Female NPCs.blend" --python tools/characters/female_heads.py -- models/heads-female.glb`.
  The game fits them onto the racer's head bone in place of his head while the helmet's off (`FACES` then these).

## Painting the helmet

`models/racer/helmet-paint.blend` (made by `helmet_paint.py` from `Racer.glb`): Texture Paint tab, X mirror on.
`helmet_detail.png` is greyscale detail the game multiplies under every team's helmet design (white = untouched).
Two colours are instructions instead: **pure black = the visor** (painted in the livery's visor colour) and
**pure red = the visor strip** (team colour, sponsor name or off: Livery Designer → Helmet → Visor strip).
Save the image (Alt+S), export the `.blend` to `models/helmet-paint.glb`, rebuild. Don't reshape the helmet in that
file: its UVs come from `helmet_paint.py` (a world-map wrap matching `paintHelmet(..., front = 0.5)`).

## Rebuild

    tools/characters/build.sh ["<pack folder>"]

1. `rebuild.py` throws away the 12 Rigify rigs (222 bones each) and binds every mesh to one copy of the 35 deform
   bones. It appends the t-shirt looks and finds their textures.
2. `racer.py` adds the racer: skin weights copied from the coveralls guy by nearest surface, the helmet on the head
   bone, the suit split into torso / legs / arms with tube UVs (`UVSuit`, laid out like `paintSuit`) and the
   coveralls' creases baked into each part as greyscale detail. Boots keep their own texture (tinted in the game).
3. `mixamo.py` imports `T-Pose.fbx`. The pack's meshes are modelled in an **A-pose** and Mixamo rests in a
   **T-pose**, so it swings the old limbs onto the Mixamo joints and bakes that into the meshes. Then it merges each
   Rigify weight group into its Mixamo bone (the pack's hand-painted weights, not Mixamo's), imports each clip as an
   NLA track and exports the GLB (nearest-filtered textures, 30 fps).
4. `render.py` makes Workbench stills for checking: `blender -b npcs.blend --python render.py -- <dir> walk:8,wave:8 [look]`.
   (`CHECK=1 build.sh` also saves `models/characters.blend` next to the GLB: delete it after, it's big.)

## Adding a clip

Download it from Mixamo (settings above), put it in the pack folder, add `'File Name': 'clip_name'` to `CLIPS` in
`mixamo.py` and `clip_name: { loop: true }` to `CLIP_INFO` in `js/characters.js`, then rebuild. A file that isn't
listed is skipped (and printed as SKIP).

## Measured (for CLIP_INFO)

- Standing: hips about 1.0 m up, toes on y = 0. Faces +Z.
- walk: 1.07 s cycle, about 1.35 m/s. walk_2: 1.5 s cycle, about 0.95 m/s.
- Sitting: hips 0.60 m up, straight above the origin, so the seat is about 0.48 m. sit_rub_arm: hips 0.69 m, so
  the seat is about 0.57 m.
