# Script writing and animated explainers: options (2026-10-18)

Prompted by the dev on explainer 001: "really close", wants scripts "more natural and engaging". Also an idea to
workshop: open some videos with beautiful animated **real-physics** explainers about real cars, then reveal it all
running in a game you can play in your browser. The look: the game's UI style, "in a more modern application of the
design".

## Script skills: the market is thin
| Skill | Signal | Verdict |
|---|---|---|
| samber/developer-relations-skills@technical-video-script | 7.2K installs, repo 3 stars | weak source |
| cdeistopened/skill-stack@youtube-scriptwriting | 503 installs, 30 stars | weak |
| mbfinotti/advertising-skills@ad-hook-analyzer | 13.8K installs, 1 star | inflated |
| jakeschincariol/youtube-agent-skill (yt-retention, hook formulas) | 1.7K stars | worth reading |
| (installed) copywriting, copy-editing, humanizer, social | reputable | use for the AI-tell pass |

**Plan:** write our own `explainer-script` skill from what's proven:
- the 12 reference transcripts (research/reference-accounts.md);
- the retention research (STRATEGY §4);
- script craft: write for the ear, open a loop in line one, use "you", give stakes, vary the rhythm, and land one
  quotable line;
- a humanizer pass and a read-aloud timing check.

**What v1 of tire temps got wrong:**
- Eight declarative sentences in the same rhythm, like a spec sheet.
- No person, no stakes, no moment.
- The opener is a fact, not a hook.
- Keep: "we didn't give you a grip slider" is the one line with a point of view.

## Animated explainers: can we? Yes. The tool isn't the limit; motion-design craft is.
- **Remotion** (already set up) is React. It can do 3D (`@remotion/three`, which could render the game's own car GLBs as
  wireframe or technical diagrams), SVG line-draws, kinetic type, plots that draw on, and springs. It can do anything
  the browser can draw.
- **HyperFrames** (heygen-com/hyperframes, 66.6K stars, Apache-2.0, active daily) is HTML + GSAP rendered to video,
  built for agents. Its value is the craft packed into its skills:
  - a motion doctrine: "the seam law", one continuous camera move, matched exits and entries;
  - a transitions catalog;
  - workflows for faceless explainers, motion graphics and general video;
  - creative direction: house style, beat direction, composition depth.
  - It wants a HeyGen sign-in only for its own voice and music; it works offline, and we'd use our ElevenLabs narrator.
- **Manim** (adithya-s-k/manim_skill, 1.2K stars) gives 3Blue1Brown-style precise math/physics plots. Optional, for
  graphs like the tire grip curve.
- Design-taste packs (pbakaus/impeccable 82K, leonxlnx/taste-skill 99K) are aimed at web UI, not video. Skip for now.

## Decided 2026-10-18: physics animations are a beat inside a feature video, never a reel of their own
The dev: real physics like slip angle "should be tied in with a gameplay mechanic video like tire heat … not a dedicated
reel to just an explainer … mix them in with other topics of the game."

- **Shape:** a gameplay moment → the animated "why" (5–10 s) → back to gameplay showing it → the payoff line.
- The animation may sometimes be the first 2–3 s, as a scroll-stopper, but it always lands in the game fast.
- Pairings (each physics beat goes with the feature where the player feels it):

| Physics beat | Feature video |
|---|---|
| Slip angle + the grip curve (past ~5–6° the tire slides, and sliding is heat) | tire temperatures (redo of 001) |
| Weight transfer under braking | trail braking / Lap Review coaching |
| Dirty air, downforce loss behind a car | AI racecraft, overtaking, the F1 class |
| Downforce / wings | tuning menu + car classes |
| Limited-slip diff | drifting / power out of corners |
| Exhaust-pipe physics (waveguide engine) | engines / car classes |
| LiDAR elevation + camber | real circuits / the track editor |

## Video idea bank (2026-10-18; hooks scored against the hook bar in the explainer-script skill)
| Hook | Pillars | Beat inside |
|---|---|---|
| "This isn't a copy of Spa. It's a scan." | real tracks | LiDAR elevation + camber, Eau Rouge in 3D |
| "Nobody recorded these engines." | cars | engine sound built from exhaust-pipe physics |
| "I drew this corner in 10 seconds. The AI learned it in 30." | tracks + AI | the AI's plan getting faster lap by lap |
| "This is everything the AI is thinking going into Turn 1." | AI | what the AI sees (below) |
| "The car behind can't follow. Here's why." (GT cars, not open-wheel F1) | racecraft | dirty air, downforce loss |
| "Your pit crew is motion-captured." | career + garage | the real stop sequence |
| "Week 1: a lottery win and a spec Miata. Week 40: a GT team." | career | the progression ladder |
| "We built a dyno that actually measures your engine." | garage | torque curve drawing live |
| "My co-op partner runs the strategy." | co-op | — |
| Comment replies: "make Monaco" → real Monaco | tracks | — |

**The career currently starts in the Miata spec series, not the Civic** (dev, 2026-10-18). Show that.

## Idea from the dev (2026-10-18): "what the AI sees"
"Videos do well showing what the AI sees … overlay what they see with the track." The director draws the AI's
internals into the 3D world while it races:
- the learned speed plan (brake / coast / throttle colors along the road);
- braking markers and target corner speeds;
- the racing line;
- the overtake planner's gap and commit moment.

Hook: "This is everything the AI is thinking going into Turn 1." It pairs with the "I drew this corner, the AI learned
it" video (the plan getting faster lap by lap).

## Earlier concept (superseded in shape, kept for the topic list)
- **Shape:**
  1. A hook about real cars, as an animated technical explainer (15–25 s): modern motion, the game's tokens.
  2. The turn: "this is all running in a game you can play in your browser".
  3. Gameplay of the same effect, with the director's live telemetry readout.
- **Why it could work:**
  - It reaches car people, not just gamers (a much bigger audience).
  - "Real physics" earns credibility with the sim crowd.
  - The browser reveal is a surprise.
  - The real-world grounding beat already worked in the reference accounts.
- **Needs first:** a public browser demo before any video says "play it in your browser" (STRATEGY channel 3).
- **Topics the game really simulates** (each claim must be fact-checked with sources before scripting):
  - slip angle: why fast cars slide a little (the tire curve peaks around 5–6°);
  - weight transfer under braking (the sprung body);
  - why race tires need heat (surface vs core, the window);
  - downforce, and why F1 cars struggle to follow in dirty air (the aero map);
  - the limited-slip diff;
  - engine sound made from pipe physics (the waveguide engine model);
  - real circuits rebuilt from LiDAR, camber and all (Eau Rouge).
- **Look ("modern application of the design"):**
  - Keep the tokens: #FF2B00 red, SV blue, the signal ramp, Helvetica Now, hairlines, corner-bracket frames, the soft
    same-colour glow.
  - Move like now: eased line-draws, depth and parallax, the game's car models as glowing wireframe or technical
    cutaways, plots and force arrows that draw on.
  - This is an exception to the in-game "2005 motion" rule, at the dev's request, for these animated pieces only.

## Verified for scripts (2026-10-18, content bank)
Traced in the code before scripting; each video's `script.md` has the line-by-line fact sheet.
- **Engines:** a physical tube model by default (js/audio.js `engineModel = 'phys'`; js/engineworklet.js, after
  Baldan et al. 2015 via Antonio-R1/engine-sound-generator, MIT). No recorded engine samples. 15 engine profiles.
  Turbo whistle, blow-off and crackle are synth add-ons, not pipe physics. The F40's profile has no turbo; the F1 GTR
  uses the flat-12 profile (no V12). The AI shifts the M1 at ~8,600 rpm, not its 9,000 redline.
- **Spa:** road from OSM; heights from Wallonia's MNT 2021-22 LiDAR (0.5 m grid); a height every ~8 m; camber measured
  across the road (current method: 7 points to 1 m inside each edge). From the game's spa.json: 102.2 m lowest to
  highest, Eau Rouge dip 23.0 m → Raidillon top 48.1 m (+25 m), steepest 14.9% over 50 m, max camber 4.0° at La
  Source, 3.2° at Raidillon (1,040 m). Unverified: "102 m is official". 14 real circuits, 13 with laser road heights.
- **Dirty air:** real and in every car, player and AI; GT cars lose 30% front / 12% rear downforce at full wake (3 m),
  fading to none at 40 m; the tow cuts drag up to 30%. In total grip it's small (~3-4.5% for GT cars at 200 km/h),
  so script it as "the nose pushes wide". The pass planner (racecraft.js) doesn't read the wake.
- **AI plan:** each car learns its own speed plan in hidden practice laps (race.js learnLimits): slower (×0.965, and
  never that fast again) wherever it slides, runs wide or goes off; ×1.04 elsewhere; stops after two clean laps in a
  row (max 40). In the race it drives the plan scaled by its grip now (wear, temperature, damage, dirty air, rubber).
- **Filming lesson:** dirty air is hard to catch by chance. The director's `"until": {"wake": 0.8}` with the camera on a
  mid-pack AI car (`"focus": 3`) finds it in seconds; filming the player's car from the back of the grid didn't.
