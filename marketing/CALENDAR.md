# Calendar and ledger

The plan (what's next) and the ledger (every post and how it did). The head of marketing keeps this current.

## Phase 0: foundations (now → mid Nov 2026)
| # | Task | Owner | Status |
|---|---|---|---|
| 0.1 | Strategy (STRATEGY.md) | HoM | done 2026-10-18, approved |
| 0.2 | Brand book (BRAND.md): sign off the [YOUR OK] items | dev | waiting |
| 0.3 | Pay Steam Direct fee ($100), create the app | dev | todo |
| 0.4 | Claim handles: TikTok, YouTube, Instagram, X, Bluesky, Reddit (HoM drafts bios + profile art) | dev (sign-ups), HoM (copy/art) | todo |
| 0.5 | Director mode: the game films itself (cameras, frame-stepped 60 fps, 9:16 + 16:9) | build | v1 done 2026-10-18 (tools/director: race rigs + in-sync engine sound); next: garage/editor/livery scenes, grid starts |
| 0.45 | Narrator voice: design in ElevenLabs (calm, earnest, "we"), dev picks from previews | HoM → dev OK | done 2026-10-18: SV narrator 001, id 7HQTSYjhnOsl76FVM9QA |
| 0.46 | First 6 explainer scripts (tire temps, AI learns each track, LiDAR circuits, pit crew mocap, draw a track, shitbox start) | HoM | todo |
| 0.51 | **Director films the track editor** (draw-a-track format + trailer + GIF 1): scripted mouse strokes drawing a road, the 3D view, Race It → the grid; 9:16 + 16:9 | HoM (marketing tooling) | todo, **first priority** after the Steam kit: none of the 7 ready videos shows pillar #1 |
| 0.52 | Director: livery designer + garage scenes in motion (stills exist: `tools/director/stills.mjs`) | HoM | stills done 2026-10-19; motion todo |
| 0.6 | Remotion templates: the narrated explainer (main) + the fast-cut Short (minor); captions, end card | HoM → dev OK | explainer v1 made 2026-10-18 (marketing/video TireTemps): waiting on dev OK |
| 0.71 | Website v1 on a free subdomain (dev chose free subdomain + email list): pitch, reel, pillars, email sign-up, socials | build | in progress 2026-10-18 |
| 0.72 | Content bank: 4 new explainers (engines, Spa scan, dirty air, what the AI sees) + 2 tire-temp hook variants | HoM | made 2026-10-18, all 6 READY after the dev's review (dirty air re-cut, Spa names re-voiced, clean re-shoots) |
| 0.7 | Steam Coming Soon page kit (`steam/`): copy, tags, 10 screenshots, capsule drafts, trailer plan | HoM → dev OK | kit drafted 2026-10-19, NEEDS OK (copy trademark question, capsule direction, trailer shot list) |
| 0.73 | Dev: Steamworks account verified → paste the kit → submit for review **by ~Nov 4** (3-5 business days) → live before Nov 13 | dev | waiting on account |
| 0.74 | Trailer render (after the dev OKs `steam/TRAILER.md`) | HoM | blocked on 0.51 + OK |
| 0.8 | Marketing Desk page (review queue) | build | todo |
| 0.9 | First batch: 6 clips × 3 hooks, ready the day the Steam page goes live | HoM | todo |

## Posting plan (updated 2026-10-19: 5 posts a week per platform, STRATEGY §4)
- **Weekly shape:**
  - **3 new videos** (Mon / Wed / Fri): 1 narrated explainer plus 2 quick broad formats.
  - **2 re-cuts of the week's best** (Tue / Sat).
- **When and where:** 6-9 pm US Eastern. Every post goes to TikTok, Reels and Shorts the same day (results don't
  transfer between platforms).
- **Variants:** a hook variant goes out 48-72 h after its original, never the same day.
- **Links:** until the Steam page is live, every post points to the website and its email list. Curator, Reddit and
  creator pushes wait for the page (STRATEGY §5).
- **Quick formats rotate:** draw a track → drive it, a livery that gets wrecked, an unscripted AI moment, "do Spa"
  replies.
  - **Draw-a-track runs first**, as soon as 0.51 lands.
  - Until then, the quick slots use unscripted AI moments.
  - Each format's first episode needs the dev's OK on its look.
- **Scorecard:** after 4 posts of each format, run it (STRATEGY §4) and record the result here.

### Weeks 1-3: the explainers and their re-cuts already made (the Mon slot + re-cut slots)
The original 3-a-week plan below now fills the explainer and re-cut slots. The 2 quick formats a week are new work
(to make).
| Slot | Post | Queue folder | Pillars | Lead car |
|---|---|---|---|---|
| Week 1 Mon | 001-C tire temps, hook "two temperatures" (the lead: dev's pick) | `2026-10-18-tire-temps-hook-c` | DRV + CAR | M1 ProCar |
| Week 1 Wed | 002 nobody recorded these engines | `2026-10-18-engines` | CAR + DRV | 935 |
| Week 1 Fri | 001-B tire temps, hook "Thirty-five degrees" (variant) | `2026-10-18-tire-temps-hook-b` | DRV + CAR | Miata |
| Week 2 Mon | 003 this isn't a copy of Spa | `2026-10-18-spa-scan` | TRK + DRV | F1 GTR |
| Week 2 Wed | 004 dirty air | `2026-10-18-dirty-air` | DRV + CAR | GT1 field (AI cars) |
| Week 2 Fri | 001 tire temps v2 (variant) | `2026-10-18-tire-temps` | DRV + CAR | Miata |
| Week 3 Mon | 005 what the AI sees | `2026-10-18-ai-sees` | DRV + TRK | R34 GT2 |
| Week 3 Wed | 002-B engines re-cut ("Same eight cylinders") | to make | CAR + DRV | F40 / M3 |
| Week 3 Fri | 003-B Spa, hook "Eau Rouge climbs 25 meters" | to make | TRK + DRV | F1 GTR |
Then: the winner of each pair gets re-cut again; the comment answers to "which track next?" become the next real-track video.

## Scorecard runs
| Date | Formats compared (4 posts each) | 2 s hold (median) | Completion (median) | Steam intent/1k (median) | Decision |
|---|---|---|---|---|---|

## Phase 1+ (see STRATEGY.md §5)
Dec–Jan: demo, Discord, creator outreach · Feb or Jun 2027: Next Fest · launch 6–12 months after the page.

## Ledger
Pillars: TRK tracks · DRV sim driving · LIV liveries · CAR career/garage · COOP co-op.

Scorecard columns (STRATEGY §4): 2 s hold, completion, Steam intent per 1k views (Steam clicks; profile visits before the page is live). Read 7 days after posting.

| Posted | ID | Platform | Format | Pillars | Hook (text) | 2 s hold | Completion | Steam intent/1k | Saves/1k | Views | Wishlists Δ | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
