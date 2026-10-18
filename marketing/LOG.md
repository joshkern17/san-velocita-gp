# Head of marketing: run log

One entry per run, newest at the top: what it looked at, what it made, what it's waiting on. The next run starts by
reading the top entry.

## 2026-10-18 · first explainer: tire temperatures (read this first)
- Made `queue/2026-10-18-tire-temps/tire-temps-v1.mp4`, the first narrated explainer, end to end:
  - script (fact-checked against docs/PHYSICS.md);
  - narrator take 1 of 4 (eleven_v4; all four word-perfect by whisper);
  - director footage (GT race + a cold Miata at dawn);
  - the Remotion edit in `marketing/video` (composition `TireTemps`): brand captions, a live tire readout from the
    director's per-frame tire log, the end card;
  - mix: engines ~7 LU under the voice, then −14 LUFS overall.
- The director now logs tire surface/core temperatures per frame too.
- Status NEEDS OK: the template itself, plus °F vs °C on the readout.
- **Next, after the verdict:** hook variants, then the next explainers, then garage/editor/livery scenes.

## 2026-10-18 · narrator + director v1
- Narrator voice approved: "SV narrator 001 - calm dev", `7HQTSYjhnOsl76FVM9QA` (BRAND §4). Generate with eleven_v4,
  then check the first real line against the C audition before using it.
- Director mode v1 built: `tools/director/` (see its README). It films AI races with 7 calm rigs at a locked 60 fps,
  as 9:16 or 16:9, with no HUD, no racing line and seeded runs. Test reel: `marketing/footage/example/reel.mp4`.
- Engine sound added the same day: every shot now carries the game's own engines, in sync (README "Sound").
  The dev on the silent reel: "That reel looks so sick".
- **Next:**
  - Garage, editor and livery scenes.
  - Grid starts.
  - Then the narrated Remotion template (0.6) and the first explainer (tire temperatures).

## 2026-10-18 · style direction
- The dev pointed to @eatmeatgames (Sharp Flint) and @mixandjam (Eye of the Match). They want "an earnest or
  calming person talking over the cool, detailed, well crafted features".
- Reviewed 12 Reels → `research/reference-accounts.md`. Narrated = 66K–1.2M, music-only = 3–31K.
- **Decided:**
  - The main series is the narrated feature explainer (STRATEGY §4 "Main format", BRAND §8).
  - Narrator = a designed calm AI voice speaking as "we".
  - Later, A/B the dev's own voice on the same scripts.
  - The race engineer is only a radio cameo.
- This replaces the setup entry's "engineer-narrator idea".
- **Next:**
  - Design the narrator voice: description + a sample line from the first script (tire temperatures suggested); the dev picks from previews.
  - Director mode (0.5).
  - The narrated Remotion template (0.6).

## 2026-10-18 · setup
- Research done (Steam practice, short-form video, niche/rival) → STRATEGY.md; dev approved it incl. the $100 Steam
  fee, the mid-Nov page target and the engineer-narrator idea (narrator style still to approve with a sample).
- Made: BRAND.md draft, TASTE.md, CALENDAR.md, the agent and /marketing.
- Last commit seen: 0294e03.
- Waiting on dev: BRAND.md [YOUR OK] items, Steam fee + app, handle sign-ups.
- Next: director mode (0.5), then the Remotion template (0.6).
