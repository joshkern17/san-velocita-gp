Status: READY

# Explainer 003: this isn't a copy of Spa
- File: `spa-scan.mp4` (43.6 s, 1080×1920, −14 LUFS)
- Format: narrated feature explainer + physics beat (approved template) · Pillars: TRK + DRV
- Car: McLaren F1 GTR (Gulfstream Racing livery) in a GT2 field. Track: Spa-Francorchamps (real, LiDAR heights + camber).
- Shots: Raidillon (heli, long lens, chase), Kemmel (heli, dolly, orbit), Bruxelles, Blanchimont. **No pit lane, start/finish straight or La
  Source in frame** (the dev's 2026-10-18 rule while the real-track pit lanes are broken). Two first-pass shots were
  dropped for it: the Eau Rouge heli (pit exit lane alongside) and a low Eau Rouge trackside (pit garages).
- Beat: `marketing/anim/spa-beat` (HyperFrames, 16.2 s), drawn from the game's own `tracks/real/spa.json`: the lap's
  elevation profile (102 m lowest to highest), Eau Rouge / Raidillon in 3D (height ×4, labeled; +25 m, 14.9% at the
  steepest), the camber measured across the road at Raidillon (3.2°; tilt drawn ×3, labeled).
- Narration: SV narrator 001, take 3 of 4 (`takes/`). Whisper can't spell the French names, so give "Eau Rouge" and
  "Raidillon" one listen before posting.
- Edit: `marketing/video/src/specs/spa.json` → composition `SpaScan`.
- Frame grabs: `grabs/`

## Hook
This isn't a copy of Spa. It's a scan.
(It has the "it's not X, it's Y" shape our copy rules avoid; it's your line from the idea bank, so it leads, and the
variants below test it.)

## Captions
- **TikTok:** This isn't a copy of Spa. It's a scan. Every road height comes from Wallonia's public laser survey, half a meter apart, camber and all. #simracing #indiegame #racinggame #spa #ps1graphics
- **Reels:** Spa in San Velocita GP is rebuilt from open map data and a laser survey of the real hill. Eau Rouge climbs 25 meters. #simracing #indiegame #racinggame #gamedev
- **Shorts title:** We scanned Spa for a PS1-style racing game #shorts #simracing
- **Pinned comment (all):** Which track should we scan next? (This is the comment-reply engine: the top answer is the next video.)
- Credit line if asked: map data © OpenStreetMap contributors (ODbL); relief: Service public de Wallonie, MNT LiDAR 2021-2022.

## Hook variants (to make next)
1. "Eau Rouge climbs twenty-five meters. We measured it." (one new narrated line)
2. "Every bump in this Spa came from a laser." (one new narrated line)

## When and where
All three platforms. Weekday evening, 6-9 pm US Eastern. Reply to the top "do X next" comment with the next real-track
video. Ledger ID `003-A`.
