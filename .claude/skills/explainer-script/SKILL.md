---
name: explainer-script
description: Write or rewrite the narration script for a San Velocita GP marketing video (the narrated feature explainer, 25-60 s, calm narrator), including any animated physics beat inside it. Use whenever a marketing video needs a script, a hook, a voice-over line, or a rewrite because a script sounds stiff, listy, flat or AI-written - even if the request just says "write the video" or "make it more natural".
---

# Explainer scripts

The narrated explainer is the main series (marketing/STRATEGY.md §4). One calm voice, one feature, why it exists. The
script is the part the dev judged weakest on the first try ("really close … more natural and engaging"). The fix is
writing for the ear, with a person, stakes and a moment, instead of listing facts.

Read before writing: `marketing/research/reference-accounts.md` (the 12 transcripts and what won),
`marketing/TASTE.md` (verdicts), `marketing/BRAND.md` §1 (voice), and for a physics beat
`marketing/research/scripts-and-animation.md`.

## 1. Get the facts first
- Every claim about the game comes from the code or `docs/PHYSICS.md`. Write the fact sheet before the script, with
  numbers and where they come from. If a number would make a line better, find the real one; never round one into a
  better story.
- Real-world physics claims (a physics beat) need a source you can name. If you can't verify it, cut it.
- Prefer a number the viewer can see on screen (the director logs tire temperatures, rpm, speed, gear per frame).

## 2. Find the moment, not the topic
The topic is "tire temperatures". The moment is "lap one, turn one, you brake like it's lap ten and the car keeps
going". Every script opens on something the viewer has felt, seen or wondered, then explains it.

Hook patterns that worked (research/reference-accounts.md):
- a feeling: "You know that feeling when…"
- a bold claim: "We just made our most satisfying mechanic yet."
- a big, real number: "It would have taken six thousand years to make these by hand."
- a list that builds: "First we added speech. Then drawing…"
- a gap: "Nobody made a game about the VAR room, so I did."
- a contrast/opinion: "I don't want your character to get better. I want *you* to get better."

The first sentence must work alone, muted, as on-screen text. Fewer than ~12 words.

**Hook bar (the dev's rule: hooks must always be intriguing and attention-catching).** The approved benchmark is
"This Miata's tires are at 35 degrees. They want 70." It's specific, true, visible on screen, and it opens a question
the viewer needs answered. Every hook must pass all four:
1. **Specific:** a real number, name or image, not a category.
2. **Open loop:** the viewer can't guess the answer, and wants it.
3. **True and shown:** the thing it claims is on screen within 2 s.
4. **About the game:** no generic clickbait that the video doesn't pay off.

Write 5 candidate hooks, score them against the four, keep the best as the main cut and the next two as variants.

## 3. The shape (25-60 s, ~2.5 words/s, so 60-140 words)
1. **Moment / hook** (1 line): the feeling, the claim, the question.
2. **What it is** (1-2 lines): plainly.
3. **How it works**: shown while said. If there's real physics under it, the animated beat goes here (5-10 s,
   2-3 lines max), then straight back to the game showing the same thing.
4. **Why we did it**: a point of view. This is where the dev's voice lives: "We could've given you a grip slider.
   We'd rather you learn your tires."
5. **The line people quote**: short, rhythmic, against the genre's habit ("Mastery is the progression.").
6. **A question to the viewer**: one they can answer in a word or two ("Slow out lap, or send it?").

## 4. Writing for the ear
- **Talk to "you".** Second person, present tense. "You brake…", not "Players can brake…".
- **"We" for the team**, sincere, never salesy. No "we're excited to announce".
- **Vary the rhythm.** Mix a 3-word line with a 14-word one. Three same-length sentences in a row read as a list.
- **Contractions** (it's, we'd, you've). Plain words. Numbers spoken as people say them ("thirty-five degrees").
- **One idea per sentence.** If a sentence needs a comma to hold two facts, split it or cut one.
- **Concrete over general.** "The Miata starts at thirty-five degrees" beats "club cars start cold".
- **Let a pause do work.** An ellipsis or a line break where the narrator should breathe ("…and the car just keeps
  going.").
- **Dry, not jokey** (BRAND §1). One small aside at most. Never explain the joke.
- **American English.**
- **Banned:** "it's not X, it's Y" reveals; "no X, no Y, no Z" lists (EATMEAT gets away with it once, we don't need
  to); "game-changer", "insane", "next level", "immersive", "unleash"; rhetorical questions in the middle; a trailing
  clause after a comma that adds nothing.

## 5. Check it
1. **Read it aloud at ~2.5 words/s** and time it. Over 60 s: cut. Any line you'd stumble on: rewrite.
2. **Humanizer pass**: run the `humanizer` skill (or `copy-editing`) on the draft and take its AI-tell fixes,
   keeping the facts and the shape.
3. **The mute test**: the first line works as text alone.
4. **The stranger test**: someone who's never heard of the game knows by line 3 what it is and why it's different.
5. **Fact check**: every number traced to the fact sheet.

## 6. Output
Write `marketing/queue/<date>-<slug>/script.md` with:
- the fact sheet (with sources);
- the script as a table, one row per line: the line, the shot (director rig, or ANIM for the physics beat), the
  on-screen readout if any, and the one amber word;
- the estimated runtime;
- 2-3 alternative hook lines for the hook variants.

## Example: the tire video, v1 vs v2
v1 (too listy): "Every tire in San Velocita has two temperatures. The surface heats up in seconds when you slide. The
core warms slowly, lap after lap. Grip comes from both…"

v2 direction: "Lap one, turn one. You brake like it's lap ten… and the car just keeps going. / Every tire here has
two temperatures. The surface spikes the second you slide. The core, underneath, takes laps. / The F1 cars cheat a
little. They leave the pits on warmers. The Miata starts at thirty-five degrees. You earn the rest. / We could've
given you a grip slider. We'd rather you learn your tires. / So how do you bring yours in?"
