# Explainer 003: this isn't a copy of Spa

Pillars: TRK + DRV · Format: narrated feature explainer + animated physics beat (approved template) · Track: Spa-Francorchamps
Narrator: SV narrator 001 (`7HQTSYjhnOsl76FVM9QA`), eleven_v4. Written with the `explainer-script` skill.
Physics beat (pairing: LiDAR elevation + camber → real circuits): the lap's real elevation profile drawing on, then
Eau Rouge / Raidillon lifted into 3D from the game's own track data (`marketing/anim/spa-beat`).

## Fact sheet
| Fact | Source |
|---|---|
| Road outline from OpenStreetMap (Overpass), picked with the f1-circuits outline (MIT) | tools/tracks/catalog.mjs:20, :28-35; tools/tracks/osm.mjs |
| Road heights from the Service public de Wallonie MNT 2021-2022 LiDAR, 0.5 m grid, bare earth (Spa is in Wallonia, Belgium) | tools/tracks/dem.mjs:5, :47-55; catalog.mjs:30 |
| A LiDAR height about every 8 m along the road | tools/tracks/build.mjs:106 |
| Lowest to highest point of the lap: 102.2 m (build log "m from lowest to highest"; spa.json node heights 0 → 102.2) | build.mjs:135; tracks/real/spa.json |
| Eau Rouge low point 23.0 m (≈920 m into the lap); Raidillon tops out at 48.1 m: ≈25 m of climb | spa.json via sampleTrack (named ranges Eau Rouge 870-962 m, Raidillon 964-1182 m) |
| Steepest climb on the lap: Raidillon, 14.9% over 50 m (1,016-1,066 m) | spa.json via sampleTrack |
| Camber measured across the road from the same scan; every Spa node has one; max 4.0° at La Source | build.mjs:163-207 (roadCamber); spa.json `b` |
| 14 real circuits in the game; all built from open data (OSM + open elevation; 13 with laser/LiDAR road heights, Madring approximate) | tracks/real/index.json; catalog.mjs `dem` |
| Lap length 6,967 m in the game | spa.json via sampleTrack |
| Don't claim: "102 m is the official figure" (no source in the repo); "1.5 m from each edge" (old camber method); airborne survey (not in the repo); that the car goes light over the crest | project notes, agent check |

## Hooks
| Hook | Specific | Loop | Shown | Game | Keep |
|---|---|---|---|---|---|
| This isn't a copy of Spa. It's a scan. (the dev's line) | yes | yes: scanned how? | Eau Rouge from the heli | yes | **main** |
| Eau Rouge climbs twenty-five meters. We measured it. | yes, real number | yes | Raidillon climb | yes | variant |
| Every bump in this Spa came from a laser. | yes | yes | close bumper shot | yes | variant |
| We didn't model Spa by eye. | medium | weak | — | yes | no |
| This is the real Raidillon. | medium | weak | yes | yes | no |
Note: the main hook has the "it's not X, it's Y" shape the skill avoids. It's the dev's own line from the idea bank,
so it leads; the two variants avoid it, and the numbers decide.

## Script (~100 words, ~45 s + the beat, ~55 s with the end card)
| # | Line | Shot | Readout | Amber |
|---|---|---|---|---|
| 1 | This isn't a copy of Spa. It's a scan. | heli over Eau Rouge, F1 GTR leading a GT field | | scan |
| 2 | The road comes from map data. Every height on it comes from a Belgian laser survey, one point every half meter. | trackside long lens at Raidillon | | laser |
| 3 | From the lowest point of the lap to the highest… a hundred and two meters. | ANIM: the lap's elevation profile draws on | | 102 |
| 4 | Eau Rouge drops you into the valley. Then Raidillon climbs twenty-five meters, almost fifteen percent at its steepest. | ANIM: Eau Rouge / Raidillon lifted into 3D, a dot climbing it | | 15% |
| 5 | We even measured the tilt of the road, side to side. | ANIM: cross-section, camber angle | | tilt |
| 6 | So the hill you feel at Raidillon… is the real one. | chase cam up Raidillon | | real |
| 7 | Fourteen circuits so far, all built from open data. | dolly, Kemmel straight | | fourteen |
| 8 | If it's steep in the game, it's steep in Belgium. | trackside | | Belgium |
| 9 | Which track should we scan next? | orbit → end card | | |

## Alternative hooks for variants
- "Eau Rouge climbs twenty-five meters. We measured it."
- "Every bump in this Spa came from a laser."
