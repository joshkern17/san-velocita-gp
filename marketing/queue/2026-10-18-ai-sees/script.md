# Explainer 005: what the AI sees

Pillars: DRV + TRK · Format: narrated feature explainer with a NEW visual: the AI's plan drawn into the 3D world
(director option `"aiSees"`, tools/director/aisees.js) · Track: Auburn (drawn track; real tracks' pit lanes are off-limits for now)
Narrator: SV narrator 001 (`7HQTSYjhnOsl76FVM9QA`), eleven_v4. Written with the `explainer-script` skill.
Idea: the dev, 2026-10-18 ("videos do well showing what the AI sees… overlay what they see with the track").

## What's drawn (all read live from the race, nothing faked)
- **The plan:** a ribbon on the AI's racing line, ~300 m ahead of the car, colored by what its own speed plan does
  there: green = throttle, yellow = lift, red = brake. Thresholds are the game's own racing-line ones (deceleration of
  the plan under 0.6 m/s² = throttle, 0.6-1.2 = lift, over = brake; js/race.js `buildRacingLine` 4140-4160), run on
  the AI car's own plan as it drives it (`car._sv.V`, or `car.lineV`).
- **Braking points:** a marker where the plan starts braking for each corner ahead (`brakePoint`, js/racecraft.js:27).
- **Target corner speeds:** the plan's speed at each corner's apex (`sim.corners.list[].apex`), in mph.
- **The racing line:** the line it's following (`sim.line`, offsets from the centerline).

## Fact sheet
| Fact | Source |
|---|---|
| Each AI car has its own speed plan per car type and skill (`car.lineV = sim.limitsFor(carId, grip)`) | js/race.js:975, :660-684 |
| The plan is learned in hidden practice laps (`learnLimits`) the first time a car meets a track (then cached) | js/race.js:693-857; LIMITS_CACHE / savePlan |
| It starts from a textbook speed for each point, then laps: wherever it goes off, runs wide, slides or points the wrong way, it slows that stretch (from 140 m before to 10 m after) and never tries that fast there again; everywhere else it tries 4% faster | js/race.js:745-806 (`bad`, `cap`, `scale*0.965`, `*1.04`) |
| It stops after two clean laps in a row with nothing left to raise (max 40 rounds) | js/race.js:809-810, :741 |
| In the race it drives the plan scaled by its grip right now: tire wear and temperature, damage, dirty air, rubber | js/race.js:3504 (`drivenPlan`), :3380 |
| Every frame: throttle if under the plan's speed, brake if more than 0.6 m/s over it, coast in between | js/race.js:3455-3457 |
| It works the same on any track, including ones you draw in the editor (it runs whenever a track is raced) | js/race.js:975 (`limitsFor` → `learnLimits`) |
| Don't claim: the AI sees the player / reacts in the overlay; that the plan changes lap by lap in the race (it doesn't; it's scaled by grip) | race.js |

## Hooks
| Hook | Specific | Loop | Shown | Game | Keep |
|---|---|---|---|---|---|
| This is everything the AI is thinking going into Turn One. (idea bank) | yes | strong | the overlay, frame 1 | yes | **main** |
| Red means it's about to brake. Watch. | yes | yes | overlay | yes | variant |
| Nobody told this AI where to brake. | yes | yes | overlay | yes | variant |
| The AI practices every track in secret. | medium | yes | weak | yes | no |
| Our AI learns every corner you draw. | medium | yes | needs the editor | yes | no (later, with editor footage) |

## Script (~100 words, ~45 s, ~55 s with the end card)
| # | Line | Shot | Overlay | Amber |
|---|---|---|---|---|
| 1 | This is everything the AI is thinking going into Turn One. | chase, the R34 GT2 (AI-driven) into T1, plan drawn | on | thinking |
| 2 | Green, it's on the throttle. Yellow, it's lifting. Red, it's braking. | far chase, same corner | on | (none: the colors carry it) |
| 3 | Each number is the speed it wants at the apex. | heli | on | apex |
| 4 | Nobody typed those in. | heli (same shot) | on | typed |
| 5 | The first time it sees a track, it runs practice laps in secret. | far chase | on | secret |
| 6 | Wherever it slides or runs wide, it slows down there… and never tries that speed again. | heli, heli | on | slows / never |
| 7 | Everywhere else, it tries a little faster. Until it can do two clean laps in a row. | chase | on | clean |
| 8 | Then it races the plan, and trims it for worn tires and dirty air. | dolly | on | trims |
| 9 | Draw a new corner, and it learns that too. | orbit | off | learns |
| 10 | Would you race it, or let it race for you? | orbit → end card | off | |

## Alternative hooks for variants
- "Red means it's about to brake. Watch."
- "Nobody told this AI where to brake."
Note: the car filmed is your car slot, driven by the same AI code as every rival (the director hands it to the AI), so its plan is the AI's plan.
