# Characters

`models/characters.glb` holds the game's people: 16 looks on one Mixamo skeleton, plus every clip.
`js/characters.js` loads it and spawns them. `characters.html` previews them all.

## Sources (not in the repo: the pack's licence forbids redistributing it)

- **BitSoft "Rigged Low-Poly Male Job NPCs"**: the main `.blend` (12 looks) and the "t-shirt mod" `.blend` (4 looks).
- **Mixamo**: `T-Pose.fbx` (the skeleton, auto-rigged on *Male NPC worker gray.fbx*, No Fingers or any LOD) and one
  `.fbx` per clip, downloaded as *FBX Binary, Without Skin, 30 fps*, walks with *In Place* ticked.
  Everything sits loose in the pack folder (`~/Downloads/Male PSX Characters`).

## Rebuild

    tools/characters/build.sh ["<pack folder>"]

1. `rebuild.py` throws away the 12 Rigify rigs (222 bones each) and binds every mesh to one copy of the 35 deform
   bones. It appends the t-shirt looks and finds their textures.
2. `mixamo.py` imports `T-Pose.fbx`. The pack's meshes are modelled in an **A-pose** and Mixamo rests in a
   **T-pose**, so it swings the old limbs onto the Mixamo joints and bakes that into the meshes. Then it merges each
   Rigify weight group into its Mixamo bone (the pack's hand-painted weights, not Mixamo's), imports each clip as an
   NLA track and exports the GLB (nearest-filtered textures, 30 fps).
3. `render.py` makes Workbench stills for checking: `blender -b npcs.blend --python render.py -- <dir> walk:8,wave:8 [look]`.
   (`mixamo.py ... check` also saves the `.blend` next to the GLB.)

## Adding a clip

Download it from Mixamo (settings above), put it in the pack folder, add `'File Name': 'clip_name'` to `CLIPS` in
`mixamo.py` and `clip_name: { loop: true }` to `CLIP_INFO` in `js/characters.js`, then rebuild. A file that isn't
listed is skipped (and printed as SKIP).

## Measured (for CLIP_INFO)

- Standing: hips about 1.0 m up, toes on y = 0. Faces +Z.
- walk: 1.07 s cycle, about 1.35 m/s. walk_2: 1.5 s cycle, about 0.95 m/s.
- Sitting: hips 0.60 m up, straight above the origin, so the seat is about 0.48 m. sit_rub_arm: hips 0.69 m, so
  the seat is about 0.57 m.
