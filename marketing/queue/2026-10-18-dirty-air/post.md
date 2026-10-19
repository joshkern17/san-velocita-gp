Status: READY

# Explainer 004: dirty air (GT cars)
- File: `dirty-air.mp4` (43.7 s, 1080×1920, −14 LUFS)
- Format: narrated feature explainer + physics beat (approved template) · Pillars: DRV + CAR
- Cars: GT1 field (F40, 935, M1 ProCar, Capri) in the rival teams' liveries. No open-wheel F1. Track: Maple Ridge GP.
- **Re-cut 2026-10-18 after the dev's review** (every shot must match its line; no crashes unless the line is about one):
  - "Being close is easy. Getting past is the race." was the Capri sliding off into the pit lane; now two cars side by
    side going for a pass.
  - "On the straight, it flips. The same wake pulls you along…" opened on cars tangling in a turn ahead; now a car
    pulling into the tow, then a clean train (the first 1.4 s of that take dropped).
  - "So you hang back in the corners… and pounce" (a smoky trackside shot) is now a car following through a corner
    and lining up on the straight.
  - The closing orbit under "So… dive in the corner, or wait for the straight?" (and under the end card) was the 935
    sliding across the line into the pit lane and pitting. It's now the F40 alone on track, mid-lap, nowhere near the
    pits (re-filmed with the pit check, no warnings).
  - New takes filmed with clean racing (AI mistakes off) and the director's incident check: no warnings on any shot used.
- Verified first: dirty air is simulated for every car, player and AI (js/race.js:2987-3005, js/physics.js:304-313);
  GT cars lose 30% front / 12% rear downforce at full wake, and the AI slows its corner speed in it. The effect is
  small in total grip (~3-4.5% for a GT car at 200 km/h), so the script says "pushes wide", nothing bigger.
- Beat: `marketing/anim/wake-beat` (HyperFrames, 11.6 s): a car alone in clean air, then a car ahead and its wake;
  the front/rear downforce gauges drop by the game's own numbers as the gap closes from 40 m.
- Live readouts from the director's new per-frame wake/tow log: SLIPSTREAM DRAG on the straight (up to −26%), the
  AI car's DOWNFORCE FRONT/REAR in the corner (up to −18% / −7%), in the game's condition colors.
- Narration: SV narrator 001, take 1 of 4 (`takes/`), word-perfect by whisper.
- Edit: `marketing/video/src/specs/dirtyair.json` → composition `DirtyAir`.
- Frame grabs: `grabs/`

## Hook
Get this close, and the front loses thirty percent of its downforce.

## Captions
- **TikTok:** Get this close, and the front loses thirty percent of its downforce. Dirty air is simulated for every car in San Velocita GP, the AI included. #simracing #indiegame #racinggame #ps1graphics #gamedev
- **Reels:** Why the car behind can't follow: dirty air in San Velocita GP. Hang back in the corners, pounce on the straight. #simracing #indiegame #racinggame
- **Shorts title:** Why the car behind can't follow #shorts #simracing
- **Pinned comment (all):** Dive in the corner, or wait for the straight?

## Hook variants (to make next)
1. "The car behind can't follow. Here's why." (one new narrated line)
2. "On the straight he's faster. In the corner, he can't follow." (one new narrated line)

## When and where
All three platforms. Weekday evening, 6-9 pm US Eastern. Ledger ID `004-A`.
