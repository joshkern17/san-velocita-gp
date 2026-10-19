# Taste log

Every verdict the dev gives on marketing work, newest at the top, with the reason in their words where possible.
The head of marketing reads this before making anything and treats patterns here as rules. When a pattern is clear
(3+ verdicts pointing the same way), promote it into BRAND.md and note that here.

Format:
```
## YYYY-MM-DD · <item id> · APPROVED | CHANGED | KILLED
What it was: <one line, pillars>
Said: "<their words>"
Lesson: <what to do differently / keep doing>
```

---

## 2026-10-19 · how marketing decisions get made · DIRECTION (rule)
What it was: the dev agreeing the cadence, the weekly mix, the scorecard and the Steam page plan.
Said (their concern, as relayed): their past products failed because they stuck to their own taste over what converts.
Lesson (a standing rule, STRATEGY §0):
- **Taste governs how it looks:** the brand book, the voice, the polish bar.
- **Data governs what we make:** topics, formats, hooks, length.
- The scorecard rules (STRATEGY §4) are fixed before any results.
- After 4 posts per format, the weaker format gets cut back regardless of preference, including mine and the dev's.
- If a winning format looks off-brand, I make it look right instead of dropping it.
- In this file, verdicts on *looks* stay binding; a verdict like "I don't like this format" is noted, but the scorecard
  decides.

## 2026-10-18 · Spa scan narration · CHANGED (pronunciation)
What it was: the narrator saying "Eau Rouge" and "Raidillon" with a proper French accent.
Said: it sounds weird, "because no american pronounces raidillon correctly".
Lesson: **foreign names (corners, tracks, cars) are said the way an American enthusiast says them.** Respell them
phonetically in the TTS prompt ("Oh Roozh", "Ray-dee-yon"), try 2-3 respellings, keep the take that sounds like a casual
American fan, and re-voice whole sentences (never splice words). Captions keep the real spellings.

## 2026-10-18 · content bank review · mostly APPROVED, dirty air CHANGED
What it was: engines, Spa scan, dirty air, AI sees, tire hooks B and C.
Said: "They are good for the most part, hook c is best for sure." On dirty air: the last shot ("getting close is
easy, getting past is the race") shows the Capri sliding off track and crashing into the pit lane, "which doesnt at
all fit what youre saying"; another shot has "two cars crash in front of the hero car on a turn which looks bad".
Lesson:
- **Every shot must match its line.** No crashes, offs, spins or wrecks unless the line is about one.
- Check every shot for incidents in frame, not just layout (AI mistakes happen in the races we film).
- Tire temps: hook C ("Every tire here has two temperatures.") is the lead post; B and v2 are the variants.

## 2026-10-18 · what the AI sees overlay · APPROVED
What it was: the AI's plan as a ribbon in the game's racing-line colors (green throttle / yellow lift / red brake),
red brake posts, apex speeds in mph, the pass planner's call.
Said: "Keep racing line colors"
Lesson: in-world game data keeps the game's own colors (racing line, tire temps), not the brand palette.

## 2026-10-18 · cars on screen · DIRECTION
Said: "avoid using the f1 cars for now. Stick to miatas, f40, f1, porsche 935, m1 pro car, ford capri, m3, skyline …
use a variety of them so people see what cool cars there are."
Lesson: no open-wheel F1 ("f1" in the list = McLaren F1 GTR). Rotate the hero cars (BRAND §5).
Also from the dev the same day: "what the AI sees" overlays (research/scripts-and-animation.md).

## 2026-10-18 · explainer 001 v2 tire temps (+ slip-angle beat) · APPROVED: template approved
What it was: tire-temps-v2.mp4. Script from the explainer-script skill (hook "This Miata's tires are at 35 degrees. They
want 70."), plus the HyperFrames slip-angle beat inside it.
Said: "Wow thats so cool. Great script, literally all perfect. We need to make sure hooks stay intriguing and attention
catching, and i think that was good."
Lesson:
- The narrated explainer + physics beat is the approved template: episodes in it no longer need per-item sign-off
  (BRAND §8).
- Hooks: lead with a specific, surprising, true number or contrast from the game itself. Always intriguing; test
  variants.

## 2026-10-18 · explainer 001 tire temps · CHANGED (close)
What it was: tire-temps-v1.mp4, the first narrated explainer (DRV + CAR).
Said: "it is really close" ... "wasnt bad at all tho"; wants scripts that are "more natural and engaging".
Lesson: the template is nearly there; the script is the weak link. Write more like a person talking, with more pull (see research on script skills).
Idea raised (needs workshopping): sometimes open with beautiful animated real-physics explainers (real cars), then reveal the game playable in the browser. The look: the game's UI style, "in a more modern application of the design".

## 2026-10-18 · director reel with engine sound · APPROVED
What it was: the same reel with the game's own engines in sync (camera-relative pan, distance, doppler).
Said: "wowwww thats so cool"
Lesson: the game's own engine sound under the footage is a keeper; engines lead the mix (BRAND §4).

## 2026-10-18 · director test reel · APPROVED
What it was: marketing/footage/example/reel.mp4: dolly, trackside long lens, wheel close-up, heli, orbit, chase (silent).
Said: "That reel looks so sick"
Lesson: the calm rigs and the game's own look (arcade preset, ps2/hd lines, soft upscale) are right. Keep them.

## 2026-10-18 · narrator voice · APPROVED
What it was: three designed previews of the tire-temperature line; picked C (slowest, ~2.5 words/s, 20 s).
Said: "C is perfect."
Lesson: slower and calmer wins. Voice id 7HQTSYjhnOsl76FVM9QA; generate with eleven_v4.

## 2026-10-18 · reference accounts · DIRECTION
What it was: the dev pointed to @eatmeatgames (Sharp Flint) and @mixandjam (Eye of the Match) as the style they like.
Said: "a sort of earnest or calming person talking over the cool, detailed, well crafted features of the game"
Lesson: the main series is a calm narrated feature explainer (see research/reference-accounts.md). Start with a
designed AI voice; later A/B the dev's own voice ("start with ai voice, then we can try my own voice and see what
the data says").

## Seeded from the game's own design feedback (before any marketing work)
- Dislikes lopsided, busy or oversized layouts: check symmetry, even spacing, centred text.
- Motion should feel 2005: snaps and fades, no sliding selectors, no flicker.
- Glow = same-colour soft blur, never a halo or dark drop shadow.
- Never claim something matches a reference without a side-by-side check.
- Music subtle under the engines; fade, never jump.
- Writing: subtle, dry, never explains its own joke.
- Engines must be clearly heard (dev, 2026-10-18: "way too quiet, you can barely hear them" in the engines video, at
  ~12 LU under the voice). Even out each clip to -18 LUFS with a fixed gain (never a one-pass loudnorm: it flattens
  pass-bys), then engines ~4 LU under the voice and level with it in the gaps. Spec field `eng` sets the default.
