Status: READY

# Explainer 002: nobody recorded these engines
- File: `engines.mp4` (48.2 s, 1080×1920, −14 LUFS)
- Format: narrated feature explainer + physics beat (approved template) · Pillars: CAR + DRV
- Cars: Porsche 935 (hook, Silverline livery), F40 (flat-plane V8), M3 GTR (cross-plane V8), M1 ProCar (inline-six,
  dusk, live RPM readout), Miata (live RPM readout). Track: Laguna Seca. No pit lane in frame (checked every shot).
- Beat: `marketing/anim/engine-beat` (HyperFrames, 13.6 s): one cylinder with a valve at each end, pulses through the
  header, muffler and tailpipe, then the revs climb while the pipe's note stays put. Matches js/engineworklet.js.
- Narration: SV narrator 001, take 3 of 4 (`takes/`), word-perfect by whisper.
- Payoff: the engines come up to ~0.7 between "One barks…" and "…one burbles." Listen to that moment first.
- Edit: `marketing/video/src/specs/engines.json` → composition `Engines` (generic `Explainer.tsx`).
- Frame grabs: `grabs/`

## Hook
Nobody recorded these engines.

## Captions
- **TikTok:** Nobody recorded these engines. Every one is a physical model: tubes, valves and pulses of air, built from a 2015 paper on engine sound synthesis. #simracing #indiegame #racinggame #ps1graphics #gamedev
- **Reels:** Every engine in San Velocita GP is built from pipes and air. No recordings. Flat-plane or cross-plane? #simracing #indiegame #racinggame #gamedev
- **Shorts title:** Nobody recorded these engines #shorts #simracing #gamedev
- **Pinned comment (all):** Bark or burble? (Sound on.)
- Source for anyone who asks: Baldan et al. 2015, "Physically informed car engine sound synthesis for virtual and
  augmented environments", via Antonio-R1/engine-sound-generator (MIT).

## Hook variants (re-cuts of this footage + take, to make next)
1. "Same eight cylinders. Different headers. One barks… one burbles." first (F40 → M3 passes), then the rest.
2. "There isn't one sound file in this engine." (needs one new narrated line)

## When and where
All three platforms. Weekday evening, 6-9 pm US Eastern. Tell people to turn the sound on in the first comment, not
in the video. Ledger ID `002-A`.
