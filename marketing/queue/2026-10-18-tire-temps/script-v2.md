# Explainer 001 v2: tire temperatures (with the slip-angle beat)

Written with the `explainer-script` skill after the dev's note on v1 ("really close … more natural and engaging").
Physics beat paired per research/scripts-and-animation.md: slip angle + the grip curve, inside the tire video.

## Fact sheet
| Fact | Source |
|---|---|
| Miata (club) best tire temp 70 °C; it starts the dawn race at ~35 °C | `TYRES.opt` −25 for Miata/Civic (docs/PHYSICS.md); director log, shots-club.json |
| Each tire: surface (fast, from sliding: 3× the sliding heat) over core (slow, from rolling); grip from 65/35 | docs/PHYSICS.md "Tyre temperatures"; physics.js tyreHeat |
| Grip peaks at ~5–6° of slip angle (slipPeak 0.085–0.11 rad), then falls as the tire slides | js/cars.js, js/physics.js slipPeak; docs/PHYSICS.md handling notes |
| Sliding heats the surface: heat = force × slide speed | physics.js tyreHeat (`HEAT.slide`) |
| F1 / GT1 cars fit tires from warmers (best − 12 °C); others start at air + 5 °C | docs/PHYSICS.md |
| Real-world: a tire's cornering force peaks at a small slip angle, then drops as it slides | standard vehicle dynamics (Milliken & Milliken, *Race Car Vehicle Dynamics*, ch. 2) |
| Don't claim: big grip loss when cold (Normal: −2% at 35° under, Realistic ~−6%) | `TEMP` in physics.js |

## Script (~85 words, ~38 s + pauses + the beat)
| # | Line | Shot | Readout | Amber |
|---|---|---|---|---|
| 1 | This Miata's tires are at thirty-five degrees. They want seventy. | dolly, Miata at dawn | yes (35 / best 70) | seventy |
| 2 | Every tire here has two temperatures. | wheel close-up, GT | yes | two |
| 3 | A tire grips best while it's slipping a little. About five or six degrees. | ANIM: tire from above, slip angle opening, grip curve drawing to its peak | | slipping |
| 4 | Past that, it starts to slide… and sliding makes heat. | ANIM: past the peak, curve falls, tread glows hot | | heat |
| 5 | The surface spikes in seconds. | trackside slide, GT | yes | surface |
| 6 | The core, underneath, takes laps. | heli | | core |
| 7 | The fast cars cheat a little. They leave the pits on warmers. | wheel rear, GT | yes | warmers |
| 8 | We could've given you a grip slider. We'd rather you learn your tires. | chase → bumper | | learn |
| 9 | So… slow out lap, or send it? | orbit → end card | | |

Alternative hooks for variants:
- "The F1 cars cheat. Everyone else has to earn it."
- "Your tires have two temperatures. Most games give you none."
- "Thirty-five degrees. That's how cold this Miata's tires are."
