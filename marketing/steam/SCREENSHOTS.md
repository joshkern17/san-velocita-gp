# Steam screenshots: 10, in upload order

Status: **READY to upload**, except the swaps flagged below. These are gameplay frames, so they don't touch a [YOUR OK]
item (BRAND §7 covers capsules, not screenshots). The brand-name notes are still yours to read.

- **Format:** all 1920×1080 PNG, 16:9, and none over 3.6 MB.
- **Upload order:** upload in the numbered order. Mark all 10 "suitable for all ages", because Valve needs at least 4.
- **Contact sheet:** `screenshots/order-sheet.png`.

## Why this order
- **The first 4 do most of the work.** Steam's search hover cycles them, and Valve's guidance is 4 distinct parts of
  the loop with at least one showing the HUD (`research/steam-store-specs.md`).
- **So the first 4 are one per pillar, in pillar order:**
  - you drive (with the HUD);
  - you make the track;
  - the real tracks;
  - your car.
- 1 and 3 are racing, so a shopper sees two of the four as driving. 2 and 4 show the two things the rival and the arcade
  racers don't have.

| # | File | Pillars | What it shows | Why here |
|---|---|---|---|---|
| 1 | `01-drive-hud-dirty-air.png` | DRV | M3 GTR at the back of a 10-car GT2 pack, chase cam, full HUD. **DIRTY AIR** is lit and the tires read **MEDIUM · COLD**; 118 mph. Maple Ridge GP. | Valve says lead with the HUD. It says "you drive this, and it's a sim" in one frame, with two sim words a racing fan recognizes. |
| 2 | `02-track-editor.png` | TRK | The Circuit Designer: a whole circuit with its runoff, buildings and trees, the tool column, and the elevation profile. | Pillar 1, the hook. It's the frame that separates us from every other racer on the hover. |
| 3 | `03-spa-lidar-pack.png` | TRK × DRV | Heli shot: the F40 leading an orange GT1 car through Les Combes at Spa (LiDAR heights). | A real place, a real race. It pays off the "race the real ones" line. |
| 4 | `04-livery-designer.png` | LIV | The Livery Designer: the M1 ProCar in an original white and red stripe livery, the DECALS tab (PNG/SVG, text, sponsors, shapes), and the driver in a matching suit. | Pillar 3. The car as yours. |
| 5 | `05-career-garage.png` | CAR | World Career: the rented lock-up, both team cars, the driver walking between them, the week planner (MON TODAY → SAT RACE), the bank and the phone. | Pillar 4: something to chase, in a place you walk around. |
| 6 | `06-rain-wheel-to-wheel.png` | DRV | Suzuka in the rain: the Capri and a blue GT1 car side by side through spray. | Weather and close racing; the most dramatic race frame we have. |
| 7 | `07-club-pack-limerock.png` | CAR × DRV | Heli shot: a 12-car Miata club field strung through Big Bend at Lime Rock. | The bottom rung of the career; a pack race on a real US track. |
| 8 | `08-editor-real-map.png` | TRK | The Circuit Designer over a satellite map of Laguna Seca, with the real elevation profile (the Corkscrew hill). | "Real tracks" and "make tracks" in one frame. |
| 9 | `09-night-pack.png` | DRV | Kanjo Night Loop (city, night): the R34 leading two cars under streetlights, headlights on. | Night, the look at its moodiest. |
| 10 | `10-laguna-935.png` | CAR | A low dolly on the 935 in an original blue and yellow livery at Laguna Seca. | A hero-car portrait to close on. Steam also uses the last screenshot as the page background if we don't upload one; we do upload one (capsules). |

## Checks done on every frame
- **Brand rules (BRAND §5):**
  - Hero cars only, rotated: M3 GTR, F40, M1, Miata, Capri, R34, 935, with no car twice in the top 4.
  - No open-wheel cars.
  - Our hero cars wear original liveries with in-game sponsors (VOLTA, KOBRA, MESA, SUNSET, PINE, NEON FM).
- **No pit lanes on real tracks:**
  - The director's pit check was clean on every kept still.
  - Two takes were thrown out for it: Watkins Glen from the start, and the Suzuka heli.
- **No crashes:**
  - The incident check was clean on every kept still.
  - A Watkins Glen take was dropped anyway: a car in a cloud of tire smoke reads as a crash even though nobody spun.
- **Sizes:** all 1920×1080.
- **Text:** no tool-tip boxes (the editor's and designer's hints are hidden in stills). The HUD is the real one.
- **Units:** mph, for the US audience.

## For you to look at
- **#4 and the M1's nose badge.** The model carries a small real manufacturer roundel on the nose and hood. It's
  part of the car model, so it's the same release-naming question as BRAND §5 [YOUR OK]. Swap: `raw/livery-capri.png`,
  but that shows the TEAM tab with "COLOURS" and "CENTRE STRIPE", British spellings in the game's own UI.
- **#8 uses Esri satellite imagery** ("Imagery © Esri, Maxar, Earthstar Geographics" in the corner). I'm not sure Esri's
  terms cover store marketing. If in doubt, drop #8. Then 9 shots remain, or add `raw/editor-maple-3d.png` or a second
  rain frame.
- **#5 and #7 show the Miata.** The audit says the Miata model's licence is "unknown (check before release)". If it
  can't be cleared, both need re-shooting with another car. The career's first series is a Miata series, so that's a
  game change first.
- **#1:** the strategy panel reads "TIRES 0 LAPS · PLAN TO THE END · PIT NOW P10". That's correct (a stop now would put
  you P10), but a stranger may find it odd.
- **#10:** a pale triangle sits in the haze on the left, probably a distant hill drawn flat. Alternate:
  `footage/steam-laguna/03-dolly-still-2.0s.png`.
- **The AI cars wear the famous-livery homages** (BRAND §5). In the kept frames they're small or far away. The closest
  is the blue car in #6.

## Not possible yet / not done
- **The track editor in motion** (drawing a road): the director can't film it yet (CALENDAR 0.51). These stills are
  the editor UI with a finished track.
- **The editor's 3D view** didn't make a good still (road and trees, nothing that reads at thumbnail size).

## Re-make any frame
- Race frames: `node tools/director/director.mjs tools/director/shots/steam/s-<spa|laguna|glen|limerock|night|rain>.json`
  (16:9, hd lines, `stills` per shot).
- UI frames (HUD, editor, designer, garage): `node tools/director/stills.mjs marketing/steam/screenshots/stills.json [--only name]`.
- Raw takes land in `screenshots/raw/` (gitignored).
