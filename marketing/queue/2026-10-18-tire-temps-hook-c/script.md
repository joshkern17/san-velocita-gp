# Explainer 001 v2, hook variant C: "Every tire here has two temperatures."

A re-cut of tire temps v2 (approved), with no new narration: the first two lines swap places, so the video opens on
the wheel close-up and its live surface/core readout, and the Miata's 35-vs-70 line comes second.
Fact sheet: `../2026-10-18-tire-temps/script-v2.md`.

| # | Line | Shot | Readout | Amber |
|---|---|---|---|---|
| 1 | Every tire here has two temperatures. | wheel close-up, M1 ProCar GT | yes (surface / core) | two |
| 2 | This Miata's tires are at 35 degrees. They want 70. | dolly, Miata at dawn | yes | 70 |
| 3-10 | as v2 | as v2 | as v2 | as v2 |

Variable tested against v2: first shot + first line (the two-temperatures idea first, the number second). This is
script-v2's alternative hook "Your tires have two temperatures…", without the "most games give you none" half (it
knocks other games, BRAND §1).
Edit: `marketing/video/src/TireTempsHooks.tsx`, composition `TireTempsHookC`.
