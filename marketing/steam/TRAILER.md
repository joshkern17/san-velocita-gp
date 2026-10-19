# Steam trailer plan: "Draw it. Drive it." (about 40 s)

Status: **NEEDS OK.** Not rendered (by request). The question: *is this the shape: driving first, the pitch at 5 s,
draw-a-track as the turn, the wishlist end card? Should the on-screen pitch say "Gran Turismo 2 with a track editor",
or the ALT "Draw a track. Then drive it."?*

## What Valve and the evidence ask for (research/steam-store-specs.md)
- **The first 6 s are the trailer's shop window.** Steam cuts a 6 s looping microtrailer from the first trailer by
  itself, and nobody can edit it. So the first 6 s are the best driving we have, with no logo, no title card and no
  slow establishing shot.
- **Assume no sound and under 10 s.** The Discovery Queue autoplays muted, so the pitch is on-screen text by 5 s. The
  engines are still mixed properly for people who unmute.
- **Mostly gameplay, with the HUD visible** in some shots (Valve's advice), so it reads as a game you drive and not a
  render.
- **The file:** 1920×1080, 60 fps, H.264 at about 20 Mbps, AAC 48 kHz stereo, as an .mp4. One trailer, used as the
  first trailer.
- **Brand:** 2005 motion (hard cuts, type that snaps in, no whooshes, no glitch). The game's own engines lead, with the
  game's own soundtrack under them (BRAND §3-4). No narrator in this one: Valve says assume no sound, and the
  narrated explainers are the social series. One amber word per frame.
- **Footage rules (BRAND §5):**
  - Hero cars, rotated, with original liveries and no homage close-ups.
  - No open-wheel cars.
  - No pit lanes on real tracks.
  - No crashes. The director's incident check is clean on every shot used.

## Structure (40 s)
| Time | Shot | On screen (snap in, top third, Helvetica Now Cn Medium caps) | Sound |
|---|---|---|---|
| 0.0-2.5 | **Chase cam, HUD on**: the F40 in a GT1 pack up Raidillon at Spa. Cars ahead, tire temps visible. | none | Engines only, full |
| 2.5-5.0 | **Trackside long lens**: the pack streams past at Kemmel; the F40 pulls out of the tow. | none | Engines; the pass-by doppler |
| 5.0-7.5 | **Hard cut to the editor**, empty grid. A road is sketched with the mouse in one stroke, sped up 4×. | **DRAW A TRACK.** | Music enters low; mouse clicks |
| 7.5-9.0 | The editor: hills dragged up in the elevation profile; curbs and barriers appear (stepped). | (held) | |
| 9.0-10.5 | **RACE IT** pressed → a hard cut to the grid of that same track (low dolly down the grid). | **THEN DRIVE IT.** (amber: DRIVE) | Engines rev on the grid |
| 10.5-14.0 | Chase cam: the M1 through the first corner of the drawn track, with the field around it. | **GRAN TURISMO 2 WITH A TRACK EDITOR** (or the ALT) | Engines lead |
| 14.0-17.0 | **Laguna Seca, the Corkscrew**: trackside, low, as the 935 drops over the crest. | **OR RACE THE REAL ONES** | |
| 17.0-19.0 | **Spa heli** at Les Combes with a two-car train (the steam-spa heli still is this shot). | **SCANNED FROM LIDAR** | |
| 19.0-22.5 | **HUD close-up**: chase cam, the tire readout climbing from cold blue into the green window over two corners. | **TIRES THAT NEED HEAT** | Tire squeal audible |
| 22.5-25.5 | **Dirty air**: following close in the wake, then pulling out of the tow for the pass (`until: {pass: true}`). | **AI THAT LEARNS EVERY CORNER** | |
| 25.5-28.5 | **Livery designer**: a pattern switch, then a decal clicked on (stepped UI frames). Hard cut to that car at speed. | **YOUR CAR** | Music up a touch |
| 28.5-32.5 | **Career garage**: walking past the car in the lock-up, then the week planner, then a club-race start. | **YOUR TEAM** | Garage ambience into engines |
| 32.5-35.5 | Two quick conditions shots: the R34 at night on Kanjo, then the Capri in the rain at Suzuka (dolly). | none | Rain hiss, engines |
| 35.5-37.0 | The best pass-by of the lot (trackside), cut on the car leaving frame. | none | Engines, a hard cut to silence at the end |
| 37.0-40.0 | **End card** (BRAND §6): the wordmark, then **WISHLIST ON STEAM** in red, with a soft glow. | San Velocita GP | One engine fading out |

- **Pitch timing:** "DRAW A TRACK." lands at 5 s and the comparison at 10.5 s, so a muted viewer has the whole idea by
  12 s.
- **The 6 s microtrailer** is shots 1-2: a pack at Spa, the HUD, a pass-by. It works on its own.

## Shot list for the director (draft, not filmed)
16:9, `res: "hd"`, 60 fps. Each block is one shot list in `tools/director/shots/steam/trailer-*.json`, filmed when the
plan is approved. Times include handles of about 1.5 s each side.

| # | List | Track / env | Car (livery) | Rig and params | Dur | Notes |
|---|---|---|---|---|---|---|
| T1 | trailer-spa | Spa, day, clear | F40 (white/red sash, #40, VOLTA), 9 GT1 opponents | `game` chase, **HUD on**, `at: 950` | 5 | Needs the director's HUD capture (see below). |
| T2 | trailer-spa | same race | F40 | `trackside`, `at: 1500`, `ahead: 120` | 5 | Kemmel. Check: no pits within 250 m. |
| T3 | (editor) | new track, the grid | none | editor capture: DRAW stroke, profile drag, curbs | 6 | Needs 0.51. |
| T4 | trailer-drawn | the track drawn in T3 (`track.file`), day | M1 ProCar (white/red stripe, #79), 9 opponents | `dolly` down the grid, then `game` chase from the green flag | 3 + 5 | Needs grid starts (director "Not yet"). Fallback: a chase cam at lap 1, `warmup: 2`. |
| T5 | trailer-laguna | Laguna, **day**, clear | 935 (blue/yellow arrow, #35, MESA) | `trackside`, `at: 2480`, `ahead: 140`, low `h: 1.2` | 4 | Day, not dusk: the dusk take was too pink and dark. |
| T6 | trailer-spa | Spa | F40 + a chaser | `heli`, `at: 2300`, `back: 22`, `h: 14` | 4 | Already proven in steam-spa/03. |
| T7 | trailer-temps | Lime Rock, cool morning (`time: dawn`) | Miata (teal/white split, #12, PINE), cold tires | `game` chase, **HUD on**, `temps: realistic` | 5 | Cold → green, as in the tire explainer. |
| T8 | trailer-wake | Maple Ridge GP (drawn track; no pits issue) | Capri (red/black sash, #8, KOBRA), GT1 field | `dolly`, `until: {wake: 0.85}` then `until: {pass: true}`, `focus: auto` → player | 5 | The dirty-air rig from the explainer. |
| T9 | (livery) | the designer | M1 ProCar | stills/UI capture: a pattern click, then a decal placement | 4 | Stills work today; motion needs 0.52. |
| T10 | trailer-drawn | same as T4 | M1 in its new livery | `dolly`, `side: 1` | 3 | |
| T11 | (garage) | World Career hub | Miata | UI capture: a walk to the car, the planner | 4 | Needs 0.52; the Miata model's licence check is pending (COPY.md). |
| T12 | trailer-night | Kanjo Night Loop, night | R34 (yellow/black fade, #34, SUNSET) | `dolly`, `side: 1` | 2.5 | |
| T13 | trailer-rain | Suzuka, rain | Capri | `dolly`, `side: -1`, `at: 900` | 2.5 | |
| T14 | trailer-spa | Spa | F40 | `trackside`, `at: 4300` | 3 | |

## What the director needs before this can be filmed
1. **The track editor in motion (0.51).**
   - Load the editor, then script mouse strokes with the DRAW tool (hold the left button, move along a spline), drag
     profile nodes, and click the curb and barrier tools.
   - Grab frames with `page.screenshot` at a stepped 30 fps. The editor is DOM plus a 2D canvas, so frame-stepping
     isn't needed; we pace the inputs.
   - Then export that track's JSON so the race shots (T4, T10) run on the *same* track.
   - The editor's own help hint is already hidden in stills (`#ed-hint`).
2. **HUD capture in the director.** The director grabs only the 3D canvas; the HUD is DOM. For T1 and T7, call the
   game's `hud.update(sim.hudState(), sim)` each stepped frame and take a page screenshot instead of the canvas grab.
   It's slower, but only two shots need it. `tools/director/stills.mjs` already shows the HUD works at 1920×1080.
3. **Grid starts** (on the director's "Not yet" list) for T4. The fallback is noted in the table.
4. **UI motion for the livery designer and garage (0.52):** the same paced-input screenshot capture as the editor.

## Then
- Cut in Remotion (16:9 composition) with the brand captions and the end card.
- Mix: engines at -18 LUFS each with a fixed gain, music under them, the whole at -14 LUFS.
- Check frames at 0, 1, 2, 5, 6, 10, 20, 30 s and the end; then queue as NEEDS OK.
