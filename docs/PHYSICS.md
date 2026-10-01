# Car physics: plan, status and handoff

This is the working document for the physics rework. **Any session picking this up (local or cloud) should read it
first, then update the "Status" section as it goes** and commit + push at each milestone, so the next one can carry
on.

## What the user wants (and how they like to work)

- A **sim-racing core with adjustable aids**, like Forza / the F1 games: honest physics underneath, assists on top
  (ABS, TC, stability control, counter-steer help, braking / steering assist, presets Easy / Standard / Sim in
  `js/aids.js`). Drivable with a **controller** (no wheel), with pad **rumble** carrying the feel of the tyres.
- **Simulate the causes, not the outcome.** The user explicitly asked that behaviour come from modelled physics
  (tyres, wheels, suspension, aero, differential) using published models, not from fudge factors tuned to fake a
  result. When a shortcut is unavoidable, say so plainly and note it in "Remaining fudges" below.
- Work in **stages**, test each thoroughly, and **ask the user before starting the next stage**. Explain changes in
  plain language with before / after numbers; the user is not a vehicle-dynamics expert but cares a lot about feel.
- No loose ends: wire changes through everything (AI, ghost / Lap Review reference, rumble, HUD aid lights, help
  text in `index.html` + `js/aids.js` descriptions, online `PROTO`, the Windows build).

## Code map

| File | What's there |
|---|---|
| `js/physics.js` | `CarPhysics` (the vehicle model every car uses), `CARSPEC` (the F1 car), tyres, `PHYS_VERSION`. No THREE: runs in node. |
| `js/cars.js` | Every car's spec (`gt()` / `street()` helpers + per-car overrides). Field docs at the top. |
| `js/aids.js` | Driver aids, presets, Career bonus, `physAids()` → `CarPhysics.aid` / `aidBase`. AI drives with `AI_AIDS` (= Standard). |
| `js/race.js` | `learnLimits` (the AI learns a speed plan per circuit + car by driving laps), `limitsFor` (+ session cache + localStorage `svgp.aiPlans`, keyed by `PHYS_VERSION`), `simLap` / `referenceTelemetry` / `lapFaults` (Lap Review reference + ghost), `brakeAssist`, `feel()` (pad rumble mix), `aiControls` (AI driver). |
| `js/telemetry.js` | Lap recorder (per 2 m sample), corner analysis + coaching tips (Lap Review). |
| `js/input.js` | Pad steering curve / deadzone / smoothing, `rumble()`. |

Conventions in `CarPhysics.step`: `u` forward speed, `v` sideways speed (car frame), `r` yaw rate, `h` heading,
`beta` body slip angle, `delta` front wheel angle. Slip angles `af` / `ar`; slip ratios `kF` / `kR` (+ = wheel faster
than the road). `useF` / `useR` = share of each axle's grip in use, `gripF` / `gripR` = combined slip over its peak
(both read by the rumble). The model is still a **bicycle** (one tyre per axle) until stage 2.

## The plan

1. **Stage 1: spinning wheels (DONE).** Per-axle wheel rotation with engine inertia through the gearbox; slip ratio
   with relaxation length (Pacejka's low-speed model, implicit decay, 4 sub-steps); combined slip by the similarity
   method (`tyreForce`); fixed brake torque + proportioning valve; ABS as a slip controller with EBD / cornering
   brake control; TC as a slip controller (with a drift mode for players: handbrake / >20° sideways; never for AI);
   stability control engine cut; engine braking; clutch-in handbrake; autobox on road speed.
2. **Stage 2: four tyres on a sprung body (NEXT, see below).**
3. **Stage 3: aero + differential.** Downforce that varies with ride height / pitch (front / rear balance shifts as the
   nose dips), a limited-slip differential (power / coast lock) → replaces `driftCarve`, `driftPush`, `aiCarve`.

### Stage 2 in detail

Replace the bicycle with four tyres and a sprung body.

- **2a. Four tyres, same loads as now.** Split each axle into left / right wheels: per-wheel slip angle (track width,
  yaw rate), per-wheel load from the *existing* weight-transfer formulas (longitudinal as now; lateral split by the
  roll-stiffness share), per-wheel wheel spin + slip ratio + combined slip, open differential between the driven
  wheels for now. Goal: the suite's numbers stay close to the stage 1 baseline (it's a refactor of the model shape).
- **2b. Sprung body.** Body pitch / roll / heave degrees of freedom with a spring + damper at each corner and
  anti-roll bars; per-wheel loads come from the suspension forces (geometric + elastic transfer), so weight transfer
  and its timing emerge. Remove: `pitchK`, the speed taper `pitchV`, the `axLT` lag, `rollF`, `ltLoss`, and most of
  the `rearGrip` balance tuning; drive the visible body roll / pitch (`race.js` `placeModel` → `model.animate`) from the
  physics instead of its own spring animation.
- **2c. Per-wheel road input.** Kerbs / bumps push individual wheels (`race.js` `surfaceEnv` / kerb data per side).
- New per-car data: spring + damper rates, anti-roll bars, track width (`track`), CG height (`cgh`), unsprung mass.
  Use realistic figures for each car's type and check against real-world references (skidpad g, braking distance,
  body roll per g, 0-100).

**Where the work happens:** branch `physics-stage2` (a git worktree next to the main folder:
`../Racing Game (physics stage 2)`), so `main`, which the user plays from, stays on the stable stage 1 physics until
stage 2 is finished and checked. Merge into `main` at the end (see the release checklist).

**Current step:** 2a + 2b done and checked (not yet released to `main`). Next: 2c (per-wheel kerbs / bumps), then
the release checklist and merge.

What 2a + 2b are, and what was learned getting there:
- **Four wheels** (`js/physics.js`): per-wheel load / slip angle / spin / slip ratio / ABS; each axle pair solved as
  mean + difference modes (engine inertia on the mean, viscous LSD `diffVisc` on the driven pair); brakes inside the
  mode solve (a brake stops a wheel, never reverses it). Rear ABS is **select-low** (both rears get the pressure that
  suits the one with less grip, as real ABS does), so braking never twists the car.
- **Sprung body** (`setupSuspension` / `bodyStep`): heave / pitch / roll on a spring + damper per corner and an
  anti-roll bar per axle, all derived from engineer's numbers per car (`rideHz`, `damp`, `rollGrad`, `rollF` or
  `rollBias`, `unsprung`, `track`; class defaults in `cars.js`, the F1's in `CARSPEC`). Tyre loads = static share +
  the suspension's force at that corner, so weight transfer and its timing come from the springs. `pitchK`, `pitchV`,
  `axLT`, `ltLoss` are gone. The car model's body roll / pitch / heave on screen now come from this (`race.js`
  `placeModel`), and online rivals' bodies run the same suspension from the g-forces they send (`bodyFromG`).
- **Roll stiffness split** defaults to front weight share + `rollBias` (road 0.1, GT / F1 0.05): real cars are set up
  so the front lets go first. With a neutral split (bias 0) the road cars spun in fast lane changes.
- **Road-car damping 0.5** (was 0.35): at 0.35 the AI's steering and the roll lag fell into a slow weave at 160 km/h.
- **Tyre calibration**: per-tyre load sensitivity (`loadK` 0.15) costs more grip than the old blanket roll loss, so
  every car's `mu` was raised ~5-7% (F1 2%) to keep its stage 1 cornering g.
- **Stability control brakes the outside front** (`escB`) when the rear is past its grip and the car rotates faster
  than the steering asks (plus the old engine cut). This is what real ESC does; it brought SC-on exits back in target.
- **AI driver** (`race.js` `aiControls`): yaw-rate damping on its pure-pursuit steering (stops weaving at speed), and it
  never turns the fronts past their peak slip angle (like the Steering Assist, but as driver skill). Result: 0 offs
  for every car at every pace on the bench, learning in 7-18 rounds.
- Measured (2026-09-30): suite all within targets; `browser.mjs ai` 0 offs everywhere; `ref` M1 softs Auburn 1:40.2,
  faults 0; `load` 4.0 s one class / 8.1 s mixed / 1.4 s cached (stage 1: 3.9 / 6.6 / 1.4); CPU 18 ms/sim-min.
- Open-loop drift script (`drift` group, TC off, steering held) ends in different places than stage 1: no driver is
  correcting it, so it isn't a regression signal. Drift feel is stage 3's job (LSD + removing the carve cheats).
- Dev tools added: `.devtest/physics/ailog.mjs` (AI learning log + off-track points, `TRACE=1 FROM= TO=` to log a
  section, `TRACK=auburn`), `browser.mjs cpu` (+ `.devtest/physics/cpu.html`).

## Remaining fudges (to remove, and which stage removes them)

| Fudge | Where | Removed by |
|---|---|---|
| ~~`pitchK` + `pitchV` + `axLT` lag~~ | | removed in 2b (springs + dampers) |
| ~~`ltLoss`~~; `rollF` is now a real setup figure (anti-roll bar split) | | 2b |
| `rearGrip` multiplier (1.0-1.08: wider rear tyres, roughly), `gripK` (arcade grip ×1.06-1.08) | `cars.js` | still there after 2b; ask the user about `gripK` |
| yaw damping `r *= 1 - dt*0.25`, the 1.6× yaw cap with SC off, kinematic blend at walking pace, low-speed lateral fade | `physics.js` | 2a/2b (re-check; low-speed handling may still need something) |
| `driftCarve`, `driftPush`, `aiCarve` (drift arcade cheats; AI gets carve to keep up with drifting players) | `physics.js`, `race.js` | 3 |
| Counter-steer help, steering assist, stability yaw cap / slide limiter, braking assist | aids | stay: they're the aids layer, by design |

## Testing

- `node .devtest/physics/suite.mjs`: plain-node scenarios (cornering, stops, brake + turn, launches, corner exits,
  fast kinks, lane-change stability, handbrake flick, held drift, rumble grip signal, CPU cost). Compares with
  `.devtest/physics/baseline.json` (the stage 1 state) and prints only what moved. `--save` to re-baseline once a
  change is accepted; `--only=stop,exit` for some groups.
- `node .devtest/physics/browser.mjs ai | ref | load`: in-game checks (needs Chrome and `cd tools && npm install`).
  The AI learning bench, the Lap Review reference on the user's circuit `.devtest/auburn2.json` (they race the M1
  ProCar, `m1procar`, on softs there), and race build times.

### Targets (stage 1 end state, what changes must keep meeting)

- Steady cornering (Kaze `jsport` ~108 km/h): ~1.25 g at the limit, front limited (mild understeer), not more.
- Stops from 126 km/h (road car): ABS clearly shorter than locked (~50 m vs ~57 m); a stamp without ABS locks the
  fronts (not the rears: proportioning valve); F1 ABS ~29 m.
- Brake + turn: turns ~30° in 1.2 s with ABS, ~0° with ABS off (locked fronts don't steer); slide under ~12°.
- Fast kink (brake while turning at 245 km/h then power): every GT / road car under ~10°.
- Corner exits with SC on: under ~7° even with TC off; TC High 2-5° (the rear working at its limit, not swinging).
  With TC + SC off the rear is the player's to manage (big slides are correct).
- Lane-change flick: settles, no oscillation (`flips` small, `yawAfter` ~0 by 2 s), never NaN.
- Rumble grip signal: silent cruising / brisk corners, light from ~88% grip use, strong past the peak.
- AI (`browser.mjs ai`): learns in under 40 rounds for every car, 0-4 offs per 5 laps at 95-97% pace.
- Reference lap (`browser.mjs ref`): M1 on softs at Auburn clean (faults 0-2), ~1:46.
- Load (`browser.mjs load`): first-time Auburn race ~4.4 s one class / ~6.7 s mixed; cached ~1.4 s. Don't make it
  much worse (idea for later: learn in a Web Worker).
- CPU: ~30 ms per simulated minute per car (12 cars at 240 Hz must stay smooth).

## Releasing a physics change (checklist)

1. Suite + browser checks pass the targets; numbers that moved are explained.
2. Bump `PHYS_VERSION` in `js/physics.js` (saved AI plans relearn) and `PROTO` in `js/net.js` (append a note to its
   comment; old and new builds mustn't race online).
3. Update player-facing text if behaviour changed (`js/aids.js` descriptions, How To Play in `index.html`).
4. `node tools/build.mjs` rebuilds the Windows single-file build in `dist/` (not in git; the user sends it to a friend).
5. Re-baseline the suite (`--save`), update "Status" in this file, commit, push.

## Status log

- 2026-09-30: stage 1 done (+ follow-up: full weight transfer under acceleration, SC engine cut, rumble on grip use).
  `PHYS_VERSION` 3, `PROTO` 16. Physics moved to `js/physics.js`; test suite + this doc added.
- Note: another local Claude session works on the same repo (pit lane, garages, practice sessions: mostly
  `race.js` pit / session code, `main.js` garage menus, `js/pitgarage.js`). Before editing shared files, `git pull`
  and check `git log`; keep edits to your own areas; whoever finishes last rebuilds `dist/` and takes the next
  `PROTO` number.
