# San Velocita GP: Brand Book (marketing)

The game's UI language (`docs/DESIGN.md`, "neon signal") carried over to videos, store art and posts. **Footage is
the hero; the brand is a light frame around it.** Items marked **[YOUR OK]** wait for the dev's sign-off; until then
the head of marketing proposes, never ships, anything that depends on them.

Status: draft 1, 2026-10-18.

## 1. Who we sound like
- **Dry, understated, tongue in cheek.** The World Career voice: write it straight and let the absurdity sit.
  Not every line is a joke; a joke never explains itself. Sly jabs at real-world systems are welcome.
- **Confident, never hype.** No "INSANE", "you won't BELIEVE", "game-changer", "next level". The footage makes the claim.
- **Never knock other games.** Show what we do; let the comments compare.
- **American English** (tire, curb, color, gray, center).
- **No emoji** in on-screen text or captions. Hashtags: 3–5, at the end, never in the hook.
- **No AI tells** (see the `copywriting` skill): no "it's not X, it's Y", no "no X, no Y, no Z", no trailing comma clauses, no rule-of-three filler.

## 2. On-screen text
| Role | Font | Style |
|---|---|---|
| Hook line (top third) | Helvetica Now Display Cn **Medium**, uppercase | `#FF2B00`, -2% tracking, the soft same-colour glow (two blurred copies, no crisp fill, no drop shadow) |
| One emphasis word | same | amber `#FFC21A`: **one per frame**, like the UI's one amber thing |
| Captions (speech) | Helvetica Now Display (not condensed) Medium, sentence case | `#FF2B00` soft glow over a `--sv-plate` dark plate when the world is bright |
| Numbers (lap times, km/h) | Helvetica Now Micro Cn, tabular | hot gradient (`#ff6a1c` → deep) for hero numbers |
| "Live / good" | same | SV blue `#2D36F2`, sparingly |

- Sizes stay modest (the dev dislikes oversized type). In 9:16 the hook is ~6% of frame height at most.
- **Safe zones (9:16):** keep text out of the bottom 22% and the right 14% (TikTok/Reels/Shorts buttons and captions).
- Text sits in fixed slots and changes in place; nothing jitters or reflows.
- Game name on screen for ≥1 s in every video (top or end card). Many viewers search Steam by name.

## 3. Motion: 2005, not 2025
- **Hard cuts and snaps.** Text appears by snap or a short one-way fade. Never slides, glides, bounces or morphs.
- Word-by-word captions **snap in place** (no pop-scale, no wobble).
- No zoom-punch transitions, no whoosh swipes, no glitch transitions, no fake CRT flicker.
- Speed ramps on footage are fine (re-cuts at ~110–130% speed are a tested lever); the type never ramps.
- Pacing: a new shot every 1–2 s in Shorts; hold on a payoff shot as long as it earns it.

## 4. Sound
- **Engines lead.** Game audio is the bed of every clip; music sits underneath and fades, never jumps.
- Music: the game's own soundtrack only. **No trending licensed sounds** (business accounts can't use them, and they bury the engines).
- **Narrator [YOUR OK]:** the race engineer ("SV engineer 001", the dev's designed voice, ElevenLabs
  `hoiJIjqBjNO1OD2v0ObR`, eleven_v4) through the in-game radio filter (`tools/voice/radiofx.sh`). He speaks as if
  on team radio to whoever is driving: short, deadpan, 1–2 lines a clip, never a voice-over announcer.
  Example: *"Box, box. Actually, don't. You drew this corner."*
- The announcer and color voices stay in the game. They're booth voices, not the brand.

## 5. Footage
- Gameplay first frame: **no logo intros**, no title cards before the hook.
- Shot from the game itself (director mode): chase, trackside, bumper, helicopter, garage walk. Native PS1 look, so no
  sharpening, no added film filters, no fake VHS.
- HUD: off for cinematic shots, on when the number matters (lap time, tire temps, positions).
- **Real brands [YOUR OK]:** cars use real names in game, and some liveries are homages of famous ones. Until the
  release naming decision, marketing avoids naming manufacturers in text/captions and avoids close-ups of homage
  liveries in paid or press material. Organic clips can show cars as they are.

## 6. The end card (every clip)
3 s: wordmark (`.logo`: title + G R A N D  P R I X caption + hairline + signal meter), then
**WISHLIST ON STEAM** in UI caps, red, soft glow. No URL text needed; the platform link and name search do the job.
Loops cleanly back into the first frame where possible.

## 7. Store art and thumbnails [YOUR OK]
- Capsule: one car, one track, the wordmark. Readable at 184×69 px (the wordmark must survive that size).
- Thumbnails (YouTube): a frame from the clip + at most 3 words in hook style. No arrows, no circles, no shocked faces.

## 8. Formats we use (see STRATEGY.md for why)
Each is a Remotion template once approved; episodes inside an approved template don't need per-item sign-off.
- **Before → after** (empty editor → racing it)
- **Comment reply** (viewer asks for a track/livery → we build it → lap)
- **Unscripted moment** (AI incident, photo finish, save)
- **Week 1 vs week N** (career/garage progress)
- **Pitch line** ("Gran Turismo 2 with a track editor")
- **Satisfying loop**
New format = needs the dev's OK on the first one.
