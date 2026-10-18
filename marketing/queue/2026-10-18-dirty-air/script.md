# Explainer 004: dirty air (GT cars)

Pillars: DRV + CAR · Format: narrated feature explainer + animated physics beat (approved template) · Track: Maple Ridge GP (a preset; real tracks' pit lanes are off-limits for now)
Narrator: SV narrator 001 (`7HQTSYjhnOsl76FVM9QA`), eleven_v4. Written with the `explainer-script` skill.
Physics beat (pairing: dirty air, downforce loss behind a car): the wake behind a GT car and the follower's
downforce arrows shrinking, front more than rear (`marketing/anim/wake-beat`). GT cars only (no open-wheel F1).

## Verified first: dirty air is really simulated
- Every locally simulated car (player and AI) gets `phys.wake` 0..1 each frame from the car ahead: from 3 m (full) to
  40 m (none) behind, within a cone 1.3 m + 3% of the gap wide, once the car ahead is over 20 m/s
  (js/race.js:2987-3005).
- Downforce per axle: `Df *= 1 - W[0]·wake`, `Dr *= 1 - W[1]·wake` (js/physics.js:304-313). GT1/GT2 cars:
  W = [0.30, 0.12] (js/cars.js:70). Road/club cars [0.25, 0.10] on almost no downforce (Miata kd 0.06).
- The AI takes it into account: its grip factor includes `1 - wakeLoss` and its target speed drops in the wake
  (js/race.js:3377-3391).
- Size: right behind another car at 200 km/h a GT car loses ~2.5-4.5% of its total grip (F40 4.1%, F1 GTR 2.9%).
  Small, so the script says "pushes wide", not "spins".

## Fact sheet
| Fact | Source |
|---|---|
| Wake starts 40 m behind the car ahead, strongest right behind it | js/race.js:2998 |
| GT cars: right behind, the front loses 30% of its downforce, the rear 12% | js/cars.js:70; js/physics.js:304-313 |
| Front loses more than the rear → the nose pushes wide (front axle load drops ~4% at 200 km/h for the F1 GTR) | same; agent calc from kd, aeroF 0.42 |
| On the straight the tow cuts drag, up to 30% (towCut 0.3), from 45 m back | js/race.js:2992-3003; js/physics.js:797 |
| The AI slows its corner speed in the wake | js/race.js:3377-3391 |
| The HUD lights DIRTY AIR when you're losing grip to it in a corner | index.html:529; js/hud.js:183-189 |
| Real-world: downforce needs clean airflow; a following car's wings and floor work in slower, turbulent air and make less downforce | standard race-car aerodynamics (e.g. J. Katz, *Race Car Aerodynamics*, 1995). The front-vs-rear split and the percentages are the game's tuning, so the script says them as the game's numbers |
| Don't claim: real GT-car percentages; the passing planner reads the wake (it doesn't: racecraft.js has no wake input) | js/racecraft.js |

## Hooks
| Hook | Specific | Loop | Shown | Game | Keep |
|---|---|---|---|---|---|
| Get this close, and the front loses thirty percent of its downforce. | yes | yes: and then? | follow shot, readout | yes | **main** |
| The car behind can't follow. Here's why. (idea bank) | medium | strong | follow shot | yes | variant |
| On the straight he's faster. In the corner, he can't follow. | yes | yes | needs two shots in 2 s | yes | variant |
| The air behind a race car is broken. | medium | yes | no | general | no |
| Watch the gap grow in every corner. | yes | yes | only if the footage shows it | yes | no |

## Script (~100 words, ~45 s + the beat, ~55 s with the end card)
| # | Line | Shot | Readout | Amber |
|---|---|---|---|---|
| 1 | Get this close, and the front loses thirty percent of its downforce. | chase: a GT1 car nose-to-tail in a train (filmed at 80% wake) | | thirty |
| 2 | A race car leaves a wake of churned-up air behind it. | heli, three GT1 cars nose to tail | | wake |
| 3 | Downforce needs clean air. In the wake, the front gets the worst of it… so the nose starts to push wide. | ANIM: wake behind the lead car, the follower's arrows shrink, front most | | front |
| 4 | It starts about forty meters back, and gets worse the closer you get. | ANIM: gap shrinks, loss grows | | forty |
| 5 | On the straight, it flips. The same wake pulls you along, with less drag. | chase on a straight in the tow | SLIPSTREAM DRAG live | flips / drag |
| 6 | So you hang back in the corners… and pounce on the straight. | trackside pass | | pounce |
| 7 | The AI feels it too. It takes the corner a little slower in the wake. | dolly on an AI F40 following | DOWNFORCE FRONT / REAR live | AI / slower |
| 8 | Being close is easy. Getting past is the race. | chase | | race |
| 9 | So… dive in the corner, or wait for the straight? | orbit → end card | | |

Every car on screen is an AI car of the GT1 class (the director films whichever car is in the wake: `"until"`), wearing
the rival teams' liveries. Live readouts come from the director's per-frame log: front loss = wake × 30%, rear = wake ×
12% (the car's own `wakeK`), drag cut = tow × 30%. The hook has no readout: at 80% wake the front is down 24%, and
the line says thirty (the full-wake number the beat then shows).

## Alternative hooks for variants
- "The car behind can't follow. Here's why."
- "On the straight he's faster. In the corner, he can't follow."
