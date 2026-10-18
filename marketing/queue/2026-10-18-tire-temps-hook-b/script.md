# Explainer 001 v2, hook variant B: "Thirty-five degrees."

A re-cut of tire temps v2 (approved). One thing changes: the first line, narrated separately.
Everything after it is the v2 cut: same footage (`shots-gt.json`, `shots-club.json`), same take, same slip-angle beat.
Fact sheet: `../2026-10-18-tire-temps/script-v2.md` (the Miata starts the dawn race at ~35 °C against a best of 70 °C).

| # | Line | Shot | Readout | Amber |
|---|---|---|---|---|
| 1 | **Thirty-five degrees. That's how cold this Miata's tires are.** (new, take 3 of 4 in `takes/`, word-perfect) | dolly, Miata at dawn | yes (35 / best 70) | cold |
| 2-10 | as v2, from "Every tire here has two temperatures." | as v2 | as v2 | as v2 |

Hook bar: specific (a number on screen), open loop (so what?), shown (the readout says 35° in frame 1), about the
game. Variable tested against v2: hook wording only (number first vs "they want seventy").
Edit: `marketing/video/src/TireTempsHooks.tsx`, composition `TireTempsHookB`.
