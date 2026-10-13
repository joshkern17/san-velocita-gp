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
| `js/contact.js` | Contact: cars hitting cars and walls as rigid bodies (boxes with rounded corners from each spec's `body`, mass + yaw inertia, restitution, body friction), `knock` (the yaw aids stand back after a real hit), `rock` (the body jolts on its springs). No THREE. Used by `race.js` `collideCars` / `barriers` / `pitWall`. |
| `js/aids.js` | Driver aids, presets, Career bonus, `physAids()` → `CarPhysics.aid` / `aidBase`. AI drives with `AI_AIDS` (= Standard). |
| `js/race.js` | `learnLimits` (the AI learns a speed plan per circuit + car by driving laps), `limitsFor` (+ session cache + localStorage `svgp.aiPlans`, keyed by `PHYS_VERSION`), `simLap` / `referenceTelemetry` / `lapFaults` (Lap Review reference + ghost), `brakeAssist`, `feel()` (pad rumble mix), `aiControls` (AI driver). |
| `js/telemetry.js` | Lap recorder (per 2 m sample), corner analysis + coaching tips (Lap Review). |
| `js/input.js` | Pad steering curve / deadzone / smoothing, `rumble()`. |

Conventions in `CarPhysics.step`: `u` forward speed, `v` sideways speed (car frame), `r` yaw rate, `h` heading,
`beta` body slip angle, `delta` front wheel angle. Slip angles `af` / `ar`; slip ratios `kF` / `kR` (+ = wheel faster
than the road). `useF` / `useR` = share of each axle's grip in use, `gripF` / `gripR` = combined slip over its peak
(both read by the rumble). Four tyres (FL FR RL RR) on a sprung body since stage 2.

## The plan

1. **Stage 1: spinning wheels (DONE).** Per-axle wheel rotation with engine inertia through the gearbox; slip ratio
   with relaxation length (Pacejka's low-speed model, implicit decay, 4 sub-steps); combined slip by the similarity
   method (`tyreForce`); fixed brake torque + proportioning valve; ABS as a slip controller with EBD / cornering
   brake control; TC as a slip controller (with a drift mode for players: handbrake / >20° sideways; never for AI);
   stability control engine cut; engine braking; clutch-in handbrake; autobox on road speed.
2. **Stage 2: four tyres on a sprung body (DONE, see below).**
3. **Stage 3: aero + differential (DONE, see below).** Downforce that varies with ride height / pitch / yaw, a
   clutch-type limited-slip differential (preload + power / coast lock); `driftCarve`, `driftPush`, `aiCarve` and
   `gripK` removed.

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

**Current step:** stages 1-3 **done and released** (merged to `main`, `PHYS_VERSION` 6, `PROTO` 19). The agreed
physics plan is complete; what's next is the user's call (ideas: retune AI difficulty once they've raced the honest AI,
F1 dirty air / DRS / ERS, tyre temperatures, learning the AI plans in a Web Worker for faster first loads).

### Stage 3 in detail (2026-10-01)

- **Limited-slip differential** (`physics.js`, the axle mode solve): clutch-type (Salisbury). The clutches pass up to
  `preload + lock × |torque through the diff|` between the two wheels (`lsd: [preload N·m, power lock, coast lock]`;
  coast = engine braking). Implicit friction on the wheels' difference mode, so a locked pair stays locked at any step.
  Replaces the old viscous `diffVisc`. Values: F1 [100, 0.5, 0.3]; GT1 [120, 0, 0.25] (was 0.45 power lock: see the follow-up below); road default
  [50, 0.3, 0.15]; Kaze [80, 0.45, 0.3]; Pony (Torsen) [20, 0.43, 0.43]; 964 [60, 0.4, 0.4]; M5 [40, 0.25, 0.25];
  Testa Rossa [50, 0.4, 0.2]; GT-R rear [60, 0.35, 0.2], front open (`lsdF`) (the GT-R has since been replaced by the
  M3 GTR [60, 0.4, 0.25]); vans open. Effect: a bit more power
  oversteer on exits (both rears driven, the inside one no longer spins off the torque), a touch of push on the power
  in slow corners, and the car takes ~0.2 s longer to straighten after a fast flick (no oscillation).
- **Aero map** (`CarPhysics.aero`): `kd` / `aeroF` hold at the reference ride height (each axle squashed by its
  downforce at ~200 km/h, `susp.zRefF/R`); `aeroH [front, rear]` = share gained per cm lower (F1 [0.04, 0.02], GT
  [0.025, 0.012], road [0.01, 0.005]), clamped 0.7-1.3; `aeroYaw` = loss when sideways, 1 − aeroYaw·β² (F1 4, GT 3,
  road 2). Under hard braking the GT balance moves ~42% → ~44.5% front, F1 ~49 → 49.5%, and back past cruise on power.
  Online rivals' bodies use it too (`bodyFromG`).
- **Removed:** `driftCarve` (a held drift's direction of travel turned toward the nose), `driftPush` (free speed while
  drifting), `aiCarve` / `AI_CARVE` (AI turned round corners 0.12 rad/s faster than its tyres: worth ~0.4-0.75 g at
  30-60 m/s!), the `carve` term in `computeSpeedProfile`, `gripK` (+6% GT / +8% road grip). AI cars are flagged
  `phys.isAI` instead (it keeps them out of the TC's drift mode).
- **AI driver** (`aiControls`), skills it needed without the carve: eases the throttle when the rears are at their limit
  and working harder than the fronts (power oversteer); lifts (fully if need be) when the fronts are at their limit, the
  car is turning less than the line needs, it's > 0.5 m outside its line and < 2 m from the outside edge. (A version
  with a 30% throttle floor kept the car pushing wide whatever its speed plan said, so learning never converged; a
  version without the edge condition lifted the F1 too often in fast corners: −2.5%.)
- **Consequences (measured):** grip driving 6-8% less cornering g in road / GT cars (Kaze 1.25 → 1.17 g, M1 1.57 →
  1.46 g), stops ~7% longer. Held drifts (closed-loop `driftHold`): 22-25° for the whole run in every rear-drive car,
  at 1.1-1.2 g (road) / 1.4 g (GT), losing speed (was 1.4-1.7 g and gaining speed). **AI and reference laps in road /
  GT cars are much slower where the carve helped**: Maple Ridge M1 sim lap 66.9 → 78.0 s, Kaze 79.0 → 90.4 s; Auburn M1
  softs reference 1:40.0 → 1:47.6 (the old one wasn't drivable by a player). F1 unchanged (it never had the carve).
  Difficulty levels are still fractions of the learned limit, so "Hard" is now 94.5% of what the car can really do.
- **Follow-up (user: M1 ProCar on Standard aids "slipping and sliding like crazy while just accelerating,
  fishtailing")**, `PHYS_VERSION` 7, `PROTO` 20. Reproduced with `.devtest/padrun.mjs` (drives the real game, Auburn,
  stepping `sim.update` with a pad-like driver that floors it below the plan: counts slides > 5° and side-to-side swings
  over 4 min; runs vary by about ±25 swings, so compare sums over several cars). Old physics: M1 / Aventus / BX300
  51 swings, 25 s sliding; stage 3 as released 274 / 66 s. Cause: the diff's **power lock** together with **traction
  control**. With TC off, LSD and open diff behaved alike; with TC on, the TC cut and restored the torque several times
  a second (bang-bang recovery at 6/s), the power lock followed the torque, and in a fast corner the GT cars carry ~80% of
  the rear's load on the outside wheel, where a locked diff sends the drive: a yaw moment into the turn, pulsing. Fixes:
  TC recovers in proportion to how far under its slip target the wheels are (`6 · min(1, −2e)`: it settles instead of
  cycling); GT diffs `[120, 0, 0.25]` (preload + coast only); GT `rollBias` 0.12 (softer rear bar: fast-kink slides 5.4
  → 4.5°, no cornering grip lost). Result: GT 25-55 swings (M1 alone 12-20, old 11), street + F1 ≈ old. Trade-off: the
  GT cars no longer hold a drift with TC on (they do with TC off); road cars do. Tried and rejected: TC on the tyres'
  combined slip (worse: 117 swings on the M1), softer power lock 0.15-0.25 (still 60-86), drift-mode TC on the mean
  wheel slip (no help).
- **Follow-up 2 (user, 2026-10-04: street and GT cars "losing the back and fishtailing on straights"; "a small
  correction at high speed, the weight gets shifted, and then starts slowly slipping to that side"; worst in the Kaze,
  Testa Rossa, Mustang)**, `PHYS_VERSION` 9, `PROTO` 25. Cause: `tyreForce` blended one curve between the sideways
  shape (C/B) and the along-the-road shape (CX/BX) by slip direction, also under the peak. A driven rear on a straight
  has more slip ratio than slip angle, so it read the along-the-road curve, whose small-slip slope (CX·BX ≈ 2.6) is far
  below the sideways one (rears ≈ 4.2): any throttle took ~40% off the rears' cornering stiffness, and road / GT cars
  turned 1.3-2.1x the steering's kinematic yaw on full power (0.9x off it). Fix: under the peak (s < 1) each direction
  reads its own curve at the combined slip (Pacejka's theoretical-slip combination); past it the old blended curve
  (both are 1 at s = 1, so they meet). Slides, drifts, lock-ups unchanged (suite `drift`, `driftHold`, `brakeTurn`).
  Measured (`.devtest/weave.mjs`, and a release test: steer for 0.6 g on full power at 200 km/h, centre the stick):
  time to straighten Kaze > 3 s → 0.29 s, Mustang 2.2 → 0.28 s, Testa Rossa 1.2 → 0.22 s, M1 0.58 → 0.21 s; full-power
  yaw gain 0.75-1.1x. Part-throttle response is a touch more understeery at small angles (0.65-0.75x). `padrun.mjs`
  now also reports the straights alone (Kaze max slide 9.4 → 6.2°, swings 16 → 10; Mustang whole-lap swings 68 → 29).
  Not changed: after a swerve to the limit (~1 g at 150 km/h) on full power, the Kaze / Mustang (power lock 0.43-0.45)
  hold a ~6° slide with the stick centred, both axles at 100%: a real slide to catch (only an open power lock removes
  it, which would cost the road cars' held drifts).

- **Dirty air (2026-10-06, `PROTO` 26).** `phys.wake` 0..1 (race.js `slipstream`, next to the tow): a car ahead
  within 40 m, strongest right behind, the wake ~1.3 m + 3% of the gap wide, fading 1 m past that. `aero` takes
  `wake [front, rear]` × it off each axle's downforce (F1 [0.15, 0.06], GT [0.3, 0.12], default `WAKE` [0.25, 0.1]):
  right behind, an F1 at 200 km/h loses ~5% of its grip, mostly at the front (push); a GT car ~4%; road cars nothing.
  (F1 was [0.4, 0.18], ~14%, until 2026-10-09: true to modern F1, but a follower dropped out of reach and could never
  set up a pass: in two-car duels from every corner at Auburn, 0.15 kept the follower within reach in 54 of 55.) The AI slows by the worst-hit axle's grip loss (`aiControls`; by the average instead, F1
  wall hits per 2-lap race went 22 -> 41; with it 27, inside the usual 22-35). `opts.wake false` turns it off.
  Part of the sim-depth plan: next track rubbering in, tyre temperatures, a tuning menu with saved setups.
- **Track rubbering in (2026-10-06, `PROTO` 27, `js/rubber.js`).** 24 lanes across x every sample. The session starts
  with rubber on the line (permanent circuit 0.7, street (`theme` city) 0.35: each wheel track ~0.8 m off the line +
  a haze, darker where the line's plan brakes / corners / accelerates hard). Each car's wheels add `PASS` 0.0025 x
  (0.5 + tyre work) of the way to full per pass; practice / qualifying's simulated field lays it along the line
  (`field`). Grip per wheel (`wheelGround`, race cars only: `car.rub`, so the AI's learning laps don't see it) =
  1 + 0.05 (r - r at session start) - 0.07 wet r: the session starts at 1 (what the AI learned on), the line gains up
  to +1.5% (circuit) / +3% (street) over a weekend, and in the wet the rubbered line is the slippery one (rain also
  washes it off slowly). The AI's speed target follows it (`gk`). Carried practice -> qualifying -> race
  (`opts.rubber`, main.js weekend). Drawn by the road's shader (`patchRoad`: grain filled in, up to 72% darker, tyre
  streaks, a little shine dry, a lot wet); the old fixed dark band in the asphalt texture is gone.
  `.devtest/rubbershot.mjs <outdir>` shoots it (TV view of the fastest corner, session start vs a weekend).
- **Tyre temperatures (2026-10-06, `PROTO` 28, `CarPhysics.tyreHeat`).** Setting `temps` off / normal / realistic
  (Quick Race setup, online host; `tempMode` 0 / 1 / 2; learning and reference laps run without). Per tyre: heat from
  sliding (|F| x slide speed, per the tyre's load: `HEAT.slide` 0.42) and rolling (speed x sqrt(load / static),
  0.011), cooled toward `ambT` (30 °C dry day, 20 night, 16 rain) by the air (0.004 + 0.0004 v, x3.5 fully wet).
  Normal: one temperature. Realistic: a surface (3x the sliding heat, fast) over a core (the rolling heat, slow), grip
  from 65/35. Each compound has its best (`TYRES.opt`: soft 85, medium 95, hard 105, wet 55, dirt 50; the F1 car
  +20, `tyreT`); grip = 1 - k ((T - best)/win)^2, at most max (`TEMP`: Normal 35 °C / 0.02 / 8%, Realistic 25 / 0.03 /
  15%), per wheel in the grip (`tempG`). More than 12 °C over: wear x (1 + excess/20). F1 / GT1 fit tyres from warmers
  (best - 12), the rest at the air + 5. The AI's speed target follows the four's mean (`tempGrip`). Calibrated on AI
  laps of Auburn (`.devtest/physics/templap.mjs`, mediums): F1 fronts ~105 rears ~120-135, M1 ~90-110, J-Sport
  ~80-95; laps 0.1-0.3 s slower than with them off. Road cars from cold reach the window in about a lap.
  `.devtest/physics/tyretemp.mjs`: open-plane scenarios. HUD: the car diagram's tyres coloured by temperature (dull
  cold, blue in the window, orange to pink hot), `COLD` / `HOT` after the compound.
- **Setups / Tuning (2026-10-06, `js/setup.js`, `js/tuning.js`).** A setup is offsets on the car's spec (`applySetup`):
  wings (each end's downforce ±7%/step, drag follows: `kd`, `aeroF`, `drag`), ride height (`rideOff`: the aero map's
  height term and the bump travel; cgh moves 0.6x), springs (`springK`: frequency x(1 + 0.06 n), bars and aero
  reference stay on the standard springs, so stiffer springs ride higher and lose a little ground effect), dampers,
  anti-roll bars (`arbK`: ±12% of that axle's roll stiffness a step, allowed below zero bar on cars whose springs alone
  exceed the roll target: F1), camber (`camberGrip`: sideways best ~-2.5° to the road, along best upright; the body's
  roll x0.7 leans the outside wheel out; relative to the class standard `camber0`), toe (each wheel's own slip angle
  against `toe0`), brake bias / pressure (`brakeP`; brake torque from the standard `gearsRef`/`kdRef`), the driven
  axle's diff, final drive x(1 + 0.025 n) and each gear x0.8-1.2. The standard setup is bit-identical to the stock car
  (`.devtest/physics/setupcheck.mjs`). Your car (and an online player's own) races its active setup (`activeSetup`,
  `svgp.setups`); the AI never has one. `Race.applySetup(car)` swaps it on a car standing in the pit garage.
  `measure(spec)` (top speed, 0-100 / 0-60, steady grip at 60 and 200 km/h by a steer sweep, 160-0 stop, balance =
  rears' combined slip minus fronts' at the limit; a spin flags it) feeds the screen's Car Response panel.
  The screen edits a draft: nothing reaches the car until Save (Esc with unsaved changes warns once, then discards).
  The look (`carmodel.js setStance`, from `stanceOf`): body height and pitch from the ride height, each axle's wheels
  leaned by camber, against the standard (stock cars and the AI look as before); on your car in the race and live on
  the car behind the Tuning screen. True to scale (12 mm, a few degrees), so it's subtle; toe isn't drawn (< 0.5°).
- **Detailed damage, step 1: suspension per corner (2026-10-06, Realistic damage only: `phys.bentOn`).** A hit bends
  the corner nearest it (`Race.hitDamage` with the hit's lx / ly: side hits 0.7 of it, nose / tail hits 0.35 beside
  the wing's 0.8) into `phys.bent[k]` (FL FR RL RR, 0..1); the first knock decides its toe (`bentDir`, 70% out). That
  wheel: toe off by up to 3° (its own slip angle: the car pulls, the tyre scrubs and heats), 15% less grip. `dmg.ch`
  = the worst corner (repairs, pit calls, AI, career bills read it) and its own all-round grip loss / pull step back.
  Hands off at 40 m/s, a corner bent 0.25 turns the car ~10° in 3 s (about 2% of the steering to hold), fully bent
  ~20° (~7%): `.devtest/physics/bentcheck.mjs`. `repairAll()` fixes it (pit stop, garage). On the model the wheel sits
  6° out of true per full bend, camber and toe (`setBend`, live from the physics); the HUD diagram turns that tyre out
  of line, outlined in the damage colour (the body stays neutral). Not yet sent online (remote cars' wheels stay true).
- **Detailed damage, step 2: radiator + engine heat (2026-10-06, Realistic, `phys.engOn`).** `dmg.rad` from nose hits
  (sidepod hits on the F1 car: `Race.radDamage`). `engineHeat`: water temp from throttle x revs, cooled by the air
  through the radiator (speed, x(1 - 0.35 slip) in a tow, x(1 - 0.6 rad)), a thermostat holding ~88°C. Over 112°C
  power falls (`engK`, to 55%); time over 132°C cooks it (`engCook` > 140 °C·s: `engBlown`, `engineCheck` retires the
  car: yours with the crash-out moment titled ENGINE FAILURE). Lapping (`.devtest/physics/engcheck.mjs`): rad 0.35 ~100°C
  (F1 ~110), 0.5 ~110 (F1 ~122, -15%), 0.7 lets go in 2.5-4 min, 0.9 in 1-2. Radio at 115 / 128°C; AI pit for it;
  repairs, garage time, career bills count it. HUD car diagram redrawn (`hud.js drawCar`): each car to its own
  proportions (open-wheeler / closed, a wing if it has aero), tyres by temperature + wear numbers, bent corners, wings
  / bumpers / radiator, the water temperature; all condition colours on the green -> pink `condCol` scale.
- **Detailed damage, step 3: gearbox (2026-10-06, Realistic, `phys.engOn`).** `dmg.gb` from hits on the driven end
  (the tail; the nose of a front-wheel drive: `Race.gbDamage`) and from manual downshifts that spin the engine past
  106% of the redline (`shift`: (over) x 1.5). `gbShift`: shifts take x(1 + 3 gb); from 0.35 a shift can miss (0.45 s
  with no drive: `missT`); from 0.65 a gear is lost (`lostGear`, skipped by both boxes: `gbNext`); at 1 it's broken
  (`gbBroken` -> retired like a blown engine, GEARBOX FAILURE). 0-250 km/h in the M1 (`.devtest/physics/gbcheck.mjs`):
  12.9 s whole, 13.3 at 0.2, 13.8 at 0.45, 13.9-14.3 with a gear gone. Radio at 0.15 / 0.4 / a lost gear / the first
  over-rev; AI pit for it; repairs, garage time (2-6 min), career bills, the pit garage's Gearbox row. HUD: a block at
  the driven end in its condition, and GEARBOX · SLOW / MISSES / NO 4TH under the water line.
- **Detailed damage, step 4: repair choices (2026-10-06).** `Race.pitParts(car)`: each damaged part (front / rear
  wing, suspension (chassis or bent corners), radiator, gearbox) with its damage and the seconds it adds (x5 / 6 / 9 /
  8 / 10). `pitReq.repair` is true (all: the AI, the pit wall's calls), or { part: bool } (yours: the pit menu, each
  part worth it (> 0.08) set to fix on the way in; ‹ › leaves it); `serviceTime` adds up the chosen ones,
  `phys.repairParts` fixes just those. The menu shows each part's condition (green -> pink) and the stop's total. The
  pit garage's Repairs row opens the same list (each part's time off the session clock and, in World Career, its cost;
  Fix Everything): `garageRepair(car, keys)`.
- **Pit boxes and double stacking (2026-10-07).** `Race.boxSlot(teamIdx)`: teams by `teamKey` (World Career entries'
  tid: both cars, you and your teammate too, share a garage; else each car its own), yours the last box (nearest the
  exit: the most time to choose the stop on the way in), the rest their first car's slot or the next free one; online
  each car's own as before. `boxBusy(car)`: a team car already in the box (or nearer it, or just pulling out): the one
  behind stops 7.5 m short in the working lane (`pitControls`) and its stop can't start until it's clear (`pitWait`
  counts the wait). The AI won't stack unless it must come in (tyres gone, damage, weather) or a VSC / safety car makes
  it cheap. You: a radio warning, the pit menu's BEHIND <name> · WAIT x s. `.devtest/stacktest.mjs`: the second car
  waited 5.6 s, never closer than 6.7 m.
- **Detailed damage, step 5: floor and diffuser (2026-10-07, Realistic).** `floorCheck`: the floor's four corners at
  `floorH` (F1 8.5 cm, GT 8.7, road 17: the heights at which a car on its standard setup keeps ~8 mm on a clean lap of
  Auburn, `.devtest/physics/floorlap.mjs`; they're the model's, the body moves more than a real one) + the setup's ride
  height, moved by heave / pitch / roll and lifted by a curb (x0.3). Touching down closing > 0.25 m/s: `floorHit`
  (0.04 per m/s over); scraping wears it; two wheels in gravel / sand at speed grind it; a rear hit takes the diffuser.
  `dmg.fl` costs downforce, 20% front / 45% rear when gone. Lowered 12 mm: the 935 bottoms (4 hits, 22% in two laps),
  the F1 starts to touch. Radio at 0.2; repairs (pit menu Floor, garage 1.5-4.5 min), AI pit at 0.25. HUD: the floor
  between the axles (a panel; on an open-wheeler its outline round the sidepods) in its condition.
- **Dirty air on the HUD:** `DIRTY AIR` (Options: Dirty Air Indicator) in the slipstream's place when the wake is
  taking more than 2% of the car's grip and it's cornering (> 0.5 g): `wakeLoss` from `aero`.

What stage 2 is, and what was learned getting there:
- **Four wheels** (`js/physics.js`): per-wheel load / slip angle / spin / slip ratio / ABS; each axle pair solved as
  mean + difference modes (engine inertia on the mean, the diff on the driven pair: viscous in stage 2, a clutch LSD since stage 3); brakes inside the
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
- **2c, per-wheel road**: `race.js` `wheelGround` gives the physics each wheel's surface grip, drag and ground height
  (`surfaceKind` / `groundZ` / `SURFACES`; well inside the track edges it's skipped: all flat road). Each wheel is an
  unsprung mass on the tyre's spring (`tyreK`, default 230 kN/m), so kerb stripes shake the wheels and a wheel can
  lift; grass / gravel drag acts per wheel (two wheels off pull the car toward that side). Grass sits 8 cm below the
  road, undulating over ~4 / 7 m. The model's wheels follow the physics wheels (`bump`), and the old hand-made kerb /
  grass height offsets and random jitter in `placeModel` are gone (online rivals: centre-based height).
- **Runoff surfaces** (`js/runoff.js`, PROTO 24): the runoff beside the track is laid out like a real circuit's (paved
  off the white line, gravel traps on corner entries, paved exits; `env.runoffStyle` auto / mixed / paved / gravel /
  grass) and fast corners widen it (barriers moved out in `analyzeTrack`). `surfaceKind` reads the same cells the
  world draws (`runoffKind`): `runoff` (paved) grip 0.9, drag 6, flush with the road and counted as on-road for
  skids / spray / AI but still off-track for track limits, forced-off and drift; gravel 0.5 / 260 sinks 10 cm and is
  rougher. Corner gravel no longer comes from curvature alone (it used to cover both sides of any tight bend).
- **Follow-up (user: "looks too bouncy", sidewalks too tall / abrupt)**: suspension geometry added (`rcH` roll
  centre, `antiDive` / `antiSquat`: the links carry that share of the load transfer straight to the tyres, so the
  tyres' loads shift the same but the body leans / dives less); road cars `rollGrad` 2.2 (sports car), damping 0.65
  road / GT, 0.6 F1, vans 0.45 (rebound past level after braking 2-8% instead of 11-18%); tyre enveloping (the road
  height a tyre rides climbs at most ~35° per metre: steps and edges are rolled over, not jumped). Kerb / sidewalk
  heights are shared constants in `world.js` (`KERB_H` 0.05, `WALK_H` 0.10 (was 0.16), `WALK_RAMP` 0.9 m (was 0.5),
  `STREET_CURB` 0.14 (was 0.17)); a circuit sidewalk's ramp starts at the kerb's top, and public-road sidewalks are
  in the physics (`world.streetStep`). `PHYS_VERSION` 5, `PROTO` 18.
- Dev tools added: `.devtest/physics/ailog.mjs` (AI learning log + off-track points, `TRACE=1 FROM= TO=` to log a
  section, `TRACK=auburn`), `browser.mjs cpu` (+ `.devtest/physics/cpu.html`).

## Remaining fudges (to remove, and which stage removes them)

| Fudge | Where | Removed by |
|---|---|---|
| ~~`pitchK` + `pitchV` + `axLT` lag~~ | | removed in 2b (springs + dampers) |
| ~~`ltLoss`~~; `rollF` is now a real setup figure (anti-roll bar split) | | 2b |
| `rearGrip` multiplier (1.0-1.08: wider rear tyres, roughly) | `cars.js` | still there (stands in for wider rear tyres) |
| ~~`gripK`~~ | | removed in 3 (user agreed) |
| yaw damping `r *= 1 - dt*0.25`, the 1.6× yaw cap with SC off, kinematic blend at walking pace, low-speed lateral fade | `physics.js` | 2a/2b (re-check; low-speed handling may still need something) |
| ~~`driftCarve`, `driftPush`, `aiCarve`~~ | | removed in 3 (LSD + aero map) |
| `lowStop` direct stop at walking pace, TC drift mode's slip target | `physics.js` | stay (a tyre model can't hold a car still; the drift mode is what real cars' drift modes do) |
| Counter-steer help, steering assist, stability yaw cap / slide limiter, braking assist | aids | stay: they're the aids layer, by design |

## Testing

- `node .devtest/physics/suite.mjs`: plain-node scenarios (cornering, stops, brake + turn, launches, corner exits,
  fast kinks, lane-change stability, handbrake flick, held drift (open loop), `driftHold` (a closed-loop driver
  holding ~25°), `aero` (downforce balance cruising / braking / on power), rumble grip signal, CPU cost). Compares with
  `.devtest/physics/baseline.json` (the stage 2 state) and prints only what moved. `--save` to re-baseline once a
  change is accepted; `--only=stop,exit` for some groups.
- Contact (`js/contact.js`): `node .devtest/crash.mjs [car] [tires|wall|armco]` throws the player's car at a wall (25° /
  60°) and into an AI car (rear-end, rear quarter, PIT, side swipe) and logs speed / heading / yaw / damage;
  `node .devtest/racestart.mjs [car] [s]` runs a full AI grid's start and counts car contacts, wall incidents, spins
  and damage (noisy: compare several runs, `ROOT=` an older checkout); `node .devtest/carsize.mjs` measures each car's
  model in plan against its contact box (`body` in `cars.js`).
- `node .devtest/physics/browser.mjs ai | ref | load`: in-game checks (needs Chrome and `cd tools && npm install`).
  The AI learning bench, the Lap Review reference on the user's circuit `.devtest/auburn2.json` (they race the M1
  ProCar, `m1procar`, on softs there), and race build times.

### Targets (what changes must keep meeting; stage 3 numbers in brackets)

- Steady cornering (Kaze `jsport` ~108 km/h): ~1.15-1.2 g at the limit (no arcade grip since stage 3), front limited
  (mild understeer) [1.15-1.17 g].
- Held drift (`driftHold`): every rear-drive road car holds ~23° for the whole run, TC on or off; GT cars with TC off
  (with TC High it catches the slide in ~1 s: their diffs don't lock on the power) [6.8 s; GT TC High ~1 s].
- Pad driver in the real game (`node .devtest/padrun.mjs <car> 240`): no worse than the old physics' fishtails
  (M1 ~10-20 swings per 4 min on Auburn, Standard aids).
- Aero balance (`aero`): moves forward 2-3% under hard braking (GT), back on power; total ≈ kd·u² (±5%).
- Stops from 126 km/h (road car): ABS clearly shorter than locked (~50 m vs ~57 m); a stamp without ABS locks the
  fronts (not the rears: proportioning valve); F1 ABS ~29 m.
- Brake + turn: turns ~30° in 1.2 s with ABS, ~0° with ABS off (locked fronts don't steer); slide under ~12° [Kaze 30.6°, slide 2.5°].
- Fast kink (brake while turning at 245 km/h then power): every GT / road car under ~10° [4-5°].
- Corner exits with SC on: under ~7° even with TC off; TC High 2-5° (the rear working at its limit, not swinging).
  With TC + SC off the rear is the player's to manage (big slides are correct).
- Lane-change flick: settles, no oscillation (`flips` small, `yawAfter` ~0 by 2 s), never NaN.
- Rumble grip signal: silent cruising / brisk corners, light from ~88% grip use, strong past the peak.
- AI (`browser.mjs ai`): learns in under 40 rounds for every car, 0-4 offs per 5 laps at 95-97% pace [12-26 rounds, 0-1 offs].
- Reference lap (`browser.mjs ref`): M1 on softs at Auburn clean (faults 0-2) [1:47.6, faults 0].
- Load (`browser.mjs load`): first-time Auburn race ~4.4 s one class / ~6.7 s mixed; cached ~1.4 s [4.4 / 8.3 / 1.4].
  Don't make it much worse (idea for later: learn in a Web Worker).
- CPU: ~30 ms per simulated minute per car (12 cars at 240 Hz must stay smooth) [~20, warmed up].

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
- 2026-09-30: stage 2 done: four tyres on a sprung body, per-wheel kerbs / grass, SC braking, AI steering damping.
  `PHYS_VERSION` 4, `PROTO` 17. Suite re-baselined to this state.
- 2026-09-30: stage 2 follow-up (suspension geometry, firmer damping, tyre enveloping, lower sidewalks). `PHYS_VERSION`
  5, `PROTO` 18.
- 2026-10-01: stage 3 done: limited-slip diffs, aero map, drift / AI carve + push + `gripK` removed, AI throttle skills.
  `PHYS_VERSION` 6, `PROTO` 19. Suite re-baselined (new groups `driftHold`, `aero`).
- 2026-10-01: fishtailing fix (smoother TC, GT diffs without power lock, GT softer rear bar). `PHYS_VERSION` 7,
  `PROTO` 20. `.devtest/padrun.mjs` added.
- 2026-10-04: combined-slip fix (weaving on the straights under power, see Follow-up 2). `PHYS_VERSION` 9, `PROTO` 25.
  `.devtest/weave.mjs` added. Suite re-baselined.
- 2026-10-01: AI difficulty recalibrated for the honest physics (user: Pro and Legend GT AI "no contest" at Auburn;
  their M1 best 1:44.5, read from Lap Review's saved PB, AI best 1:47.2). Road / GT table: Rookie pace 0.85, Pro 0.93,
  Legend pace 1 + grip 1.03 / power 1.01, Alien grip 1.07 / power 1.04; the F1 class keeps the old table (`DIFF_F1`).
  A grip edge is learned with (`limitsFor(id, grip)`, plans saved per edge), else it barely helps. Measured (M1 /
  Aventus, Auburn): Rookie 1:53, Pro 1:49.5, Legend 1:46.4 / 1:45.5, Alien ~1:45 / 1:44. The edge is in the
  Difficulty description. (User agreed: "both, staged": labelled edge now, honest AI improvements later.)
- 2026-10-02: harder levels (user: Alien rivals them, Legend too easy, career needs levels you grow into). Measured
  across classes (GT-R / M1 / Aventus / F1 at Auburn, the table is in race.js): every class gains ~1.7-2% a lap per
  edge step and learns cleanly up to grip 1.25. Pace alone tops out (F1 pace 0.945 vs 0.99: 0.9 s), so levels above Pro
  are spaced by the edge. Road / GT: Legend 1.07 / 1.04 (old Alien), Alien 1.12 / 1.07, new Phantom 1.18 / 1.10,
  Godlike 1.25 / 1.14; F1 one step lower (Legend 1.03 / 1.01 ... Godlike 1.18 / 1.10). Fewer mistakes up the ladder.
  World Career difficulty can now be changed from the hub.
- 2026-10-02: rigid-body contact (user: "interactions between cars don't feel realistic"; walls too). Before: every car
  two 0.95 m circles (4.6 m long, smaller than the F1 model, so cars overlapped on screen before touching), a 50/50 push
  whatever the masses, no friction, and a random spin after every hit, which the stability cap then took away. Now
  (`js/contact.js`): each car a box with 0.4 m rounded corners sized from its model (`body` per spec), contact point +
  normal from the boxes, impulse from both cars' mass and yaw inertia (restitution 0.3 in a nudge falling to 0.05 in
  a big hit; body friction 0.2 car-on-car, 0.3 concrete / armco, 0.6 tyre walls). Walls: the corners past the wall
  face, so the corner that hits first turns the car. After a real hit (yaw kick > 0.5 rad/s or > 5 m/s) `hitT` holds
  the yaw cap + slide limiter off for 0.5-1.5 s, fading back (ESC braking stays). Damage by where the car was hit
  (side: suspension), a second slap on the same part within 0.6 s counting only what it adds.
  Crashing out (Realistic damage only, race.js `breakCheck`): a hit on a part at 26 m/s (wall) / 23 m/s (a car's
  share) always breaks the car, the odds falling off squared over the 6 m/s below; a chassis already at 1 goes on any
  hit over 12. A wheel off (open-wheelers 75% of corner hits, others 30%) or a corner folded; a yaw kick toward the
  broken corner, then 7 / 4.5 m/s² of drag and a pull round while it slides. Measured (Auburn, 12 cars, 4 laps): F1
  2, M1 1, M5 0 crash-outs (`.devtest/crashrate.mjs`); `.devtest/crashout.mjs` throws an AI car, then you, at the wall. AI follow / alongside
  gaps scale with the two cars' lengths (they were set for 4.6 m). Body friction 0.35 was too sticky (bumpers "held"
  and cancelled the spin); square corners gave no sideways shove from a corner-on-corner hit. Measured: AI bench 0
  offs, 12-17 rounds (M1 / F1 / GT-R); reference M1 soft 105.7 s, 0 faults; race starts (10 cars, 40 s) a little more
  contact than before for GT, about the same for F1. `PHYS_VERSION` 8, `PROTO` 23.
- 2026-10-03: wheels off the road (user: after a big hit the body flew up with the wheels glued to the road; and up a
  sidewalk the wheels stayed upright). Suspension travel (`travel [droop, bump]` per class: F1 4.5 / 3 cm, GT 7 / 5,
  road 11 / 8, van + hearse 15 / 14; the bump stop further in by the top-speed aero squat): past full droop the wheel
  hangs from the body and leaves the road (no load, no grip); a damped stop at each end (an undamped one bounced a car
  landing on one side clean off the road). Normal driving never reaches either (hard manoeuvres use at most ~70%; a
  pad lap at Auburn sits on a bump stop ~0.8 s, off the track). `contact.js` `rock` is now a trip: a hit lower than
  the centre of mass (0.4 m) tips the body over it (side-on into a wall the far wheels lift; nose first the nose dives),
  so a van tips a lot, a GT car barely and the F1 car a little the other way, held to just past wheel lift (≤ ~9°)
  however many pushes a car pressed against a wall gets. On screen every wheel tilts (`tiltWheels` in carmodel.js):
  half its axle's line, half the body's roll (independent suspension); a live rear axle (`solidR`: van, hearse) with
  the beam. `.devtest/wheelshot.mjs` (sidewalk + side-on wall hit, screenshots + per-frame roll / wheel heights / loads).

## Next: the AI's line through fast S-bends (where the edge should come from instead)

**2026-10-02: the car-fitted racing line (`js/raceline.js`), now the game's line.** The user: the min-curvature
line "is clearly not the line to follow", it never goes wide to turn in. raceline.js fits the line to a car: a
point-mass lap model (friction circle, power, drag, downforce, the line's real length) and a coordinate search on
control points every 10 m with a Catmull-Rom curve through them (no kinks), coarse to fine, deterministic (an evaluation
budget, not a time one), never returning a line the model rates slower than the one it started from. Calibration: grip
x1.05 matches the AI's real laps on the old line in GT-R / M1 / Aventus / F1 (1.1 used: a quick human); curvature over
a +-8 m chord (at +-4 m the model saw the old line's short kinks as slow corners the real car smooths across).
`Race.lineFor`: street / fun cars keep 2 m from the edges, the racing classes 1.6 m. The first time a circuit + car is
raced, `checkLine` learns both lines in the real physics and keeps the one with the quicker clean lap (and its plan):
Monaco keeps the smooth line in every class (the model's hairpins are off), Suzuka's GT-R too. Lines are cached
(`svgp.aiLines`, `LINE_VERSION`); plans learned on them are keyed `|l<LINE_VERSION>`. The menu backdrop never fits.
Clean AI laps, pace 1, no edge, smooth -> fitted: Auburn GT-R 2:03.0 -> 2:01.7, M1 1:47.0 -> 1:45.3, Aventus 1:47.4
-> 1:45.7, F1 1:27.2 -> 1:24.2; Suzuka M1 -1.7, F1 -2.4; Spa M1 -1.5, F1 -2.1; Maple Ridge -0.8..-2.2.
**Race starts and lap 1 (2026-10-02).** The user: against Alien they qualify ~8th but gain 5+ places off the start
("cars make a bolt for the line, go slow and don't push"). Measured (`.devtest/linebench/startpos.mjs`: a clean
Legend-pace driver with a human start from 8th of a grid in qualifying order): the AI collided 10-15 times on lap 1
(swerving onto the line off the grid; rear-ending in braking zones, up to 19 m/s at Auburn's T1), damaged wings kept
them slow all race, and a driver who should drop back ended lap 1 ~6th, sometimes leading. Fixes in aiControls: a
car ahead is followed by predicting it (its own plan ~0.5 s ahead, or its speed if lower; a 0.2 s gap; 13 m/s2) rather
than braking for its current speed; off the grid each AI keeps its lane and merges over ~12 s (`ai.lane`); reaction
0.12-0.32 s (was 0.15-0.6); squeezed alongside, only the car behind lifts. Lap-1 contacts 9.6 -> 6.4, that driver
ends lap 1 ~9th. 3 x 2-lap races at Alien: walls GT-R 41 -> 24, M1 32 -> 15, F1 45 -> 21; offs down; winners as
quick or quicker. Tighter following (0.05-0.1 s gap, 15-18 m/s2) brought the contacts back. Launch control for the AI
(less TC off the line) was mixed (an Aventus launched slower): not done. (`opts.follow 'old'`, `opts.startFix false`:
the old behaviour, for benches.)

**AI skill as technique (2026-10-02, `js/aiskill.js`).** The user asked why the AI drifts 2-6 m wide on exits. It's
not sloppiness at top skill: its learning (speeds pushed until it nears the edge) spends any spare room on speed.
Tried: throttle patience (ease off when the fronts saturate and it drifts: 1-4 s slower, drifted more) and shorter /
longer steering look-ahead (no gain): both dropped, the clean AI stays as it was. Instead, lower skill is shown as
flaws on top of it (`car.ai.skill`, applied in aiControls): `imp` (on the power early; with full traction control
it's free, so an impatient driver's TC is cut to 1 - imp/2), `wander` (the line drifts up to that many m, a new error
every 120-240 m), `brake` (braking-zone target speed x 1 +- that). Costs vary a lot by car (devstat.mjs, 6-lap
averages): full flaws M1 +0.2 s with TC at half / +6 s with TC off, F1 +3-10 s; scaled per class in aiskill.js.
Pace multipliers vary as much: an M1 at Auburn loses nothing at 0.97, an Aventus 0.7%; an F1 0.8% at 0.91. So
`Race.paceCurve` measures each car's curve on the circuit (clean 2-lap sims at 1 / 0.97 / 0.94 / 0.88, cached in
`svgp.paceCurves`) and `techPace` sets each driver's pace from it. World Career (`wcareer.raceKnobs`): the rating's
gap (`ratingGap`: the old pace multiplier's cost in a GT1 car, so the career's balance is unchanged and the Formula
field is no longer flat), flaws from pace (impatience; hothead +0.25) and consistency (wander / braking; metronome
half), counted as at most 40% of the gap (measuring flaw costs with hidden laps was too noisy: one off outweighs
everything). Dice-roll mistakes a little rarer (1.5 - cons x 1.1). Result (skillcheck.mjs, 4 laps): order follows
rating in every class; a 45 rating 0.8-1.4% off (target 1.2%). Quick Race Rookie / Pro get flaws (tech 1 / 0.5)
on top of their pace (making the pace up for them made Rookie winners ~4 s a lap quicker in an F1). Rookie races:
no more incidents than without. Open: the career's rating gaps are tiny (whole fields within 0.3-0.9%, Formula SV
0.09-0.41%), below the AI's lap-to-lap noise (~0.3-0.5%), so close drivers can swap order.

**Traffic.** On its own the fitted line put more AI in the walls (F1 at Auburn 17 -> 52-59 wall hits per 2-lap race):
cars off their line (alongside, pushed wide) still used the line's speeds, and the line runs nearer the edges. Fix in
`aiControls`: off its line by more than 0.8 m, an AI takes the corner ahead slower, sqrt(1 - 2 (off - 0.8) k) (k: the
line's tightest curvature ahead, min x0.6). With it (`.devtest/linebench/matrix.mjs`, 3 x 2-lap 12-car races, AI
mistakes off): Auburn M1 walls 38 -> 38, offs 7 -> 3, winner -4.8 s; F1 walls 22 -> 35, winner -6 s; Suzuka every
class equal or fewer walls and offs, winner -6..-8 s (GT-R +3.8). Street-class races are noisy (24-45 walls between
identical runs).
Tried and dropped: wider first search phases (swing a whole approach across: slower), combined-slip braking penalty
(COMB 0.8: no better in races), 5 m control points (Monaco better, wiggles elsewhere), wider margins for all classes
(M1 -1.9 s gain lost at 2.2 m), forcing the AI to hold its line in learning (every car slower).
Also found: the AI runs 2-6 m wide of its line on slow-corner exits (pure pursuit, 10-20 m look-ahead; the learned
plan only checks for the edge). **Next:** better line tracking (curvature feed-forward + lateral error feedback), then
narrow the margins again; fit a line per class for mixed fields (today every car uses the main car's line).
Difficulty with it: Legend no edge; road / GT Alien 1.04 + 1.02, Phantom 1.09 + 1.06, Godlike 1.13 + 1.08; F1 Alien
1.03 + 1.01, Phantom 1.07 + 1.04, Godlike 1.12 + 1.07 (table and lap times in race.js).

Comparing the user's Auburn PB with the AI lap: 1.6 s of the 2.8 s gap is one fast S-bend (samples ~100-300) the user
takes flat at ~252 km/h on an even ~1.8-2.3 g path, while the minimum-curvature line has kinks there (a moment of
~5 g at that speed: the track centreline's own corner leaks into the line) and swings full width; the AI learns to
brake to ~150. Forced flat, the AI lags the line at the apex and runs off on the swing back. Tried and rejected (all
slower: 107.2 → 107.0-114 s): narrower margins (to 0.3 m, with looser learning edge checks), node spacing 12-24 m,
world-space smoothing of the line, speed-weighted min curvature (v^2-v^6), weighting by how straight the centreline is
over ±40-60 m, wider curvature span in the speed plan, finer learning steps, sharper AI pedals, harder braking plan.
Ideas: learn the line too (per-section lateral nudges kept when the lap is faster, like the speed plan), or optimise
the line with the real physics (`simLap` laps) offline per circuit. Then shrink the Legend / Alien edge.
Note: the street-car AI at Auburn already had 20-70 `lapFaults` (wide by 0.3-1 m) at full pace before this change.
- Note: another local Claude session works on the same repo (pit lane, garages, practice sessions: mostly
  `race.js` pit / session code, `main.js` garage menus, `js/pitgarage.js`). Before editing shared files, `git pull`
  and check `git log`; keep edits to your own areas; whoever finishes last rebuilds `dist/` and takes the next
  `PROTO` number.
