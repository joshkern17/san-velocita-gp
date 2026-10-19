# Head of marketing: run log

One entry per run, newest at the top: what it looked at, what it made, what it's waiting on. The next run starts by
reading the top entry.

## 2026-10-18 · end shots: the dirty-air pit orbit, plus a pit check (read this first)
- **The miss:** the dev caught the dirty-air closing orbit (the 935 sliding into the pit lane and pitting). I'd
  wrongly left it in the last round.
- **Director:**
  - The AI never decides to pit while filming (`aiWantsPit` is overridden per race unless `"pits": true`).
  - The incident check now also flags a car pitting (in frame, or the shot's car) and the pit lane or garages in
    frame within 250 m.
  - Tested: an orbit at the Maple Ridge start/finish flags it every half second.
- **Replaced closing shots:**
  - Dirty air: the orbit is now the F40 mid-lap (`dirty-air-orbit/03`).
  - Engines: the Miata orbit was re-filmed mid-lap (`engines-miata-orbit/01`).
  - Tire temps v2, B and C: the orbit was re-filmed clean, with no smoke (`tire-temps-gt-orbit/03`).
  - Spa (Kemmel) and AI sees (city) checked: no pits.
- **Verified:** frame grabs of the last 12 s of all seven deliverables.

## 2026-10-18 · fixes after the dev's review of the content bank
- **Verdict (TASTE.md):**
  - Mostly good.
  - Hook C is the lead tire post; v2 and B are its variants.
  - The AI overlay look is approved, so ai-sees is READY.
  - Dirty air needed fixes.
  - The Spa corner names sounded French.
- **Rules added:**
  - Every shot must match its line, with no crash, spin or off unless the line is about one (BRAND §5, the
    explainer-script skill).
  - Foreign names are said the American-fan way: respelled in the TTS prompt, real spellings in the captions (TASTE,
    the skill).
- **Director:**
  - Clean racing is the default: `settings.aiMistakes = 'off'` unless the shot list sets `"incidents": true`.
  - A per-frame incident check covers cars in frame: contact, off road, spinning, wrecked. It's logged in
    `.engine.json` and printed as `WARNING shot N (name): 1.4s capri off road`.
  - The check caught real contact on two re-takes, and I didn't use them.
  - New: `"focus": "auto"` and `"until": { "pass": true }`.
- **Re-checked every queued video (1 s frame grids):**
  - **Dirty air:** re-cut.
    - The "getting past is the race" crash shot became a side-by-side pass.
    - "On the straight, it flips / pulls you along" became a car in the tow, then a clean train; the tangle in the
      turn was cut.
    - "Hang back… pounce" became a follow-and-line-up shot.
  - **AI sees:** re-cut. "Practice laps in secret" and "slides or runs wide" had a car spinning in smoke ahead, and the
    end orbit too; all three re-filmed clean.
  - **Tire temps, all three cuts (v2, B, C):** the whole GT shot list was re-filmed clean, and the readouts were
    rebuilt from the new log. The old heli shot had cars spinning ahead.
  - **Engines:** clean. Solo cars, nothing to fix.
  - **Spa:** clean (car on track in every shot).
- **Spa narration:** the three name sentences were re-voiced as "Oh Roozh" / "Ray-dee-yon" (picked over "Oh Rooj" /
  "Raid-ill-on") and cut in whole at the pauses.
- **Left as is:** GT1 cars throw tire smoke out of slow corners, so some shots still show puffs. The incident check
  sees no contact, offs or spins in any shot used.
- **ElevenLabs this round:** 1,404 credits (2 respellings × 4 takes). Run total: 11,091.
- **Not committed:** `queue/2026-10-18-tire-temps/post.md` was edited by another session (its READY status). I left
  it alone; its mp4 is now the clean re-cut.
- **Next:**
  - hook variants for 002-004;
  - "I drew this corner, the AI learned it";
  - Spa's start/finish once the pit lanes are fixed.

## 2026-10-18 · content bank: 4 explainers + 2 hook variants
- **READY:**
  - `tire-temps-hook-b`: a new narrated first line, "Thirty-five degrees. That's how cold this Miata's tires are."
  - `tire-temps-hook-c`: the first two lines swapped, no new audio.
  - `engines`: "Nobody recorded these engines." 935 / F40 / M3 GTR / M1 / Miata at Laguna Seca, with a pipe-physics
    beat and live RPM.
  - `spa-scan`: "This isn't a copy of Spa. It's a scan." F1 GTR; a LiDAR beat drawn from the game's own spa.json.
  - `dirty-air`: GT1 field, wake beat, live downforce and drag readouts.
- **NEEDS OK:** `ai-sees`, the new in-world overlay (`tools/director/aisees.js`). Question in its post.md.
- **Swapped:** nothing. Dirty air is really simulated for GT cars (30% front / 12% rear downforce at full wake), but
  small in total grip, so the script stays modest.
- **Pit lanes (dev, via the coordinator):** the real-track pit lanes are broken, so no pit lane, pit entry or exit in
  frame on any real track (rule added to BRAND §5).
  - Spa: dropped the Eau Rouge heli (pit exit alongside) and a low Eau Rouge trackside (pit garages). Re-filmed at
    Raidillon, Kemmel, Bruxelles and Blanchimont.
  - Dirty air moved to Maple Ridge GP, and the AI video to Auburn (both drawn tracks).
  - Engines (Laguna Seca): every shot checked, no pits in frame.
- **Director (marketing tooling only):**
  - `race.team` (rival liveries on the hero cars);
  - per-shot `"at"` (metres into the lap) and `"until"` (wake/tow state);
  - `"aiSees"`;
  - wake/tow columns in the per-frame log.
  - README updated.
- **Edit:** `marketing/video/src/Explainer.tsx` is the template driven by `src/specs/*.json`. Captions now
  balance their lines (no one-word second line).
- **Beats:** `marketing/anim/engine-beat`, `spa-beat`, `wake-beat` (HyperFrames, telemetry off).
- **Facts:** `research/scripts-and-animation.md`, "Verified for scripts".
- **ElevenLabs:** 9,687 credits (5 generations × 4 takes; no retries).
- **Last commit seen:** 87e944c (the site session's).
- **Waiting on:**
  - the dev's OK on the AI overlay look;
  - a listen to "Eau Rouge" / "Raidillon" in the Spa take;
  - accounts, before anything can post.
- **Next:**
  - hook variants for 002-004 (lines listed in each post.md);
  - "I drew this corner, the AI learned it" with editor footage;
  - re-film Spa's start/finish once the pit lanes are fixed.

## 2026-10-18 · tire temps v2 + animated beat
- Dev on v1: "really close"; wants scripts more natural and engaging. Physics animations go *inside* feature videos.
- Built:
  - the `explainer-script` skill (`.claude/skills/explainer-script`);
  - `script-v2.md`, fact-checked (cold grip loss is small, so the hook is the real number: 35° vs 70°);
  - narration v2 (take 3 of 4, word-perfect);
  - the slip-angle beat in HyperFrames (`marketing/anim/slip-beat`, 10 s, timed to the words);
  - the edit, `TireTempsV2` (39 s, −14.8 LUFS).
- Installed HyperFrames skills (heygen-com/hyperframes); its telemetry is disabled (`hyperframes telemetry disable`;
  also set HYPERFRAMES_NO_TELEMETRY=1). Its `init` added hyperframes-audio/registry/studio and media-use by itself.
- Waiting: the dev's verdict on v2; °F/°C.

## 2026-10-18 · first explainer: tire temperatures
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
