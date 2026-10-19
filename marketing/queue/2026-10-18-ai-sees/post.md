Status: READY (dev 2026-10-18: "Keep racing line colors": the overlay look is approved).

# Explainer 005: what the AI sees
- File: `ai-sees.mp4` (43.4 s, 1080×1920, −14 LUFS)
- Format: narrated feature explainer with the overlay (look approved). Script and narration follow the approved
  template. Re-cut 2026-10-18: two shots where a car ahead spun in a cloud of smoke ("practice laps in secret",
  "slides or runs wide") and the orbit were re-filmed clean. No separate animated beat: the overlay is the "why" here.
- Pillars: DRV + TRK · Car: Skyline R34 GT2 (Bayside Blue livery) in a GT2 field · Track: Auburn (a drawn track, which
  also keeps us off the real tracks' broken pit lanes).
- How it's made: director option `"aiSees": true` (`tools/director/aisees.js`). Everything drawn is read live from the
  race, from the car's own plan as it drives it (`car._sv.V` / `car.lineV`): the ribbon's colors use the game's own
  racing-line thresholds; braking posts come from `brakePoint` (js/racecraft.js); apex speeds are its plan at each
  corner apex. Nothing in the game changed.
- Narration: SV narrator 001, take 2 of 4 (`takes/`), word-perfect by whisper.
- Edit: `marketing/video/src/specs/aisees.json` → composition `AiSees`.
- Frame grabs: `grabs/`

## Hook
This is everything the AI is thinking going into Turn One.

## Captions
- **TikTok:** This is everything the AI is thinking going into Turn One. It learned every number itself in hidden practice laps. #simracing #indiegame #racinggame #gameai #gamedev
- **Reels:** The AI in San Velocita GP practices every track in secret before it races you. Green throttle, yellow lift, red brake. #simracing #indiegame #gamedev
- **Shorts title:** What the AI sees going into Turn One #shorts #simracing #gamedev
- **Pinned comment (all):** Would you race it, or let it race for you?

## Hook variants (to make next)
1. "Red means it's about to brake. Watch." (one new narrated line)
2. "Nobody told this AI where to brake." (one new narrated line)
Pairs with the idea-bank video "I drew this corner in 10 seconds. The AI learned it in 30." (needs editor footage).

## When and where
All three platforms, weekday evening 6-9 pm US Eastern. Ledger ID `005-A`.
