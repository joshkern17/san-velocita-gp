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

## Real-physics series: concept to workshop
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
