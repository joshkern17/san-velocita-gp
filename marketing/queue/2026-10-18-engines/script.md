# Explainer 002: nobody recorded these engines

Pillars: CAR + DRV · Format: narrated feature explainer + animated physics beat (approved template) · Track: Laguna Seca
Narrator: SV narrator 001 (`7HQTSYjhnOsl76FVM9QA`), eleven_v4. Written with the `explainer-script` skill.
Physics beat (research/scripts-and-animation.md pairing): exhaust-pipe physics, a waveguide/pulse animation
(`marketing/anim/engine-beat`).

## Fact sheet
| Fact | Source |
|---|---|
| The engine sound is a physical tube model by default (`engineModel = 'phys'`); the older pulse-loop synth is only a fallback if the AudioWorklet fails | js/audio.js:5-6, :131, :186-187 |
| No recorded samples for engines: the only audio files the game loads are music and voice lines; the engine is code (a worklet loaded from a Blob) | js/audio.js:47, js/vo.js:31, js/engineworklet.js:12-13 |
| Based on Baldan et al. 2015, "Physically informed car engine sound synthesis for virtual and augmented environments", ported from Antonio-R1/engine-sound-generator (MIT) | js/engineworklet.js:1-3 |
| Every cylinder is a short tube with valves at both ends; intake tubes, exhaust tubes into per-cylinder headers, a shared straight pipe, a muffler, the outlet | js/engineworklet.js:5-8, :25-32, :63-67, :86-93 |
| The tube resonances stay put while the firing rate follows the rpm | js/engineworklet.js:7-8 |
| 15 engine profiles | js/engines.js:22-69 |
| F40 = `v8flat` (flat-plane V8: headers 85/90); M3 GTR = `v8cross` (headers 100/150 in the cross-plane bank pattern, "the burble comes from the uneven L/R bank pattern"). Both 8 cylinders | js/cars.js:122, :131; js/engines.js:29-34, :125-126 |
| 935 = `flat6turbo` (alternating long/short headers 80-130) | js/cars.js:106; js/engines.js:53-55, :133 |
| M1 ProCar = `i6` ("silky, rising howl"), redline 9000; on film the AI took it to 8,600 rpm | js/cars.js:100-102; js/engines.js:38-40; footage log engines-m1 |
| Miata = `i4`, redline 7200 | js/cars.js:189-192 |
| Don't claim: turbo whistle / blow-off come from the pipes (they're synth add-ons); the F40's turbos (its sound profile has turbo 0); a "V12" for the F1 GTR (it uses the flat-12 profile); "nine thousand" on screen (the AI shifts at ~8,600) | js/audio.js:149, :255, :277-295; js/engines.js |

## Hooks (hook bar: specific, open loop, true and shown, about the game)
| Hook | Specific | Loop | Shown | Game | Keep |
|---|---|---|---|---|---|
| Nobody recorded these engines. | yes | strong: then how? | the 935 at full noise | yes | **main** |
| Same eight cylinders. Listen to the difference. | yes | strong | F40 then M3 pass | yes | variant |
| There isn't one sound file in this engine. | yes | yes | the 935 | yes | variant |
| This engine is just pipes and air. | medium | yes | weak (needs the beat first) | yes | no |
| We built these engines out of pipes. | medium | weak | yes | yes | no |

## Script (~95 words, ~42 s + pauses + the beat, ~52 s with the end card)
| # | Line | Shot | Readout | Amber |
|---|---|---|---|---|
| 1 | Nobody recorded these engines. | 935, rear wheel close-up, revs rising | | recorded |
| 2 | Every one of them is built out of pipes. | 935 trackside pass | | pipes |
| 3 | Each cylinder is a short tube, with a valve at each end. | ANIM: a cylinder tube, valves at both ends opening and closing | | tube |
| 4 | Every firing sends a pulse through the headers, the muffler… and out the tailpipe. | ANIM: pulses travel along the exhaust path | | pulse |
| 5 | The pipes keep their own notes. The revs just set how often they're hit. | ANIM: firing rate speeds up, the pipe stays | | notes |
| 6 | Change the pipes, and you change the voice. | 935 dolly | | voice |
| 7 | Same eight cylinders. Different headers. | F40 dolly → M3 dolly | | headers |
| 8 | One barks… one burbles. | F40 trackside pass, then M3 trackside pass (engines up) | | barks / burbles (one per frame) |
| 9 | The M1's inline-six just keeps on climbing. | M1 chase at dusk, revs climbing to 8,600 | RPM | climbing |
| 10 | And the Miata… does its best. | Miata dolly | RPM | best |
| 11 | Fifteen engines. Every one starts as pipes and air. | Miata orbit | | air |
| 12 | So… bark, or burble? | orbit → end card | | |

Runtime check: read aloud at ~2.5 words/s ≈ 40 s of speech; with the beat and pauses for the engines ≈ 52 s.

## Alternative hooks for variants
- "Same eight cylinders. Listen to the difference." (open on line 7-8, then the rest)
- "There isn't one sound file in this engine."
