Status: NEEDS OK
Question: Is this the right look for the "what the AI sees" overlay: its plan as a ribbon on the road in the game's
own racing-line colors (green throttle, yellow lift, red brake), a red post where it starts braking, and its target
apex speed in orange mph numbers floating over each corner? (Or should it move to the brand's red/amber/blue and
show fewer labels?)

# Explainer 005: what the AI sees
- File: `ai-sees.mp4` (43.4 s, 1080×1920, −14 LUFS)
- Format: narrated feature explainer with a **new visual** (the overlay), so it waits for your OK on the look. Script
  and narration follow the approved template. No separate animated beat: the overlay is the "why" here.
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

## Captions (once the look is approved)
- **TikTok:** This is everything the AI is thinking going into Turn One. It learned every number itself in hidden practice laps. #simracing #indiegame #racinggame #gameai #gamedev
- **Reels:** The AI in San Velocita GP practices every track in secret before it races you. Green throttle, yellow lift, red brake. #simracing #indiegame #gamedev
- **Shorts title:** What the AI sees going into Turn One #shorts #simracing #gamedev
- **Pinned comment (all):** Would you race it, or let it race for you?

## Hook variants (to make next)
1. "Red means it's about to brake. Watch." (one new narrated line)
2. "Nobody told this AI where to brake." (one new narrated line)
Pairs with the idea-bank video "I drew this corner in 10 seconds. The AI learned it in 30." (needs editor footage).

## When and where
After your OK. All three platforms, weekday evening 6-9 pm US Eastern. Ledger ID `005-A`.
