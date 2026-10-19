# San Velocita GP: Marketing Strategy

Draft 1, 2026-10-18. Built from three research passes, with sources at the end. Every rule here has a reason under it. If the reason stops being true, change the rule.
Updated 2026-10-19 with what the dev agreed: the taste/data rule (§0), the cadence and weekly mix, the scorecard (§4), and the
before-the-page rules (§5).

---

## 0. Taste governs how it looks; data governs what we make (agreed 2026-10-19)
**The dev's own concern, in their framing:** their past products failed because they stuck to their own taste over what
converts. So the two get separate jobs:
- **Taste (the dev's, TASTE.md and BRAND.md) governs how it looks:**
  - the brand book;
  - the narrator voice;
  - the polish bar;
  - type, motion and color;
  - "every shot matches its line."
  The dev's verdicts here are final.
- **Data governs what we make:**
  - topics;
  - formats;
  - hooks;
  - length;
  - which pillar pairs get more posts.
  These are decided by the §4 scorecard, with the rules fixed *before* the results come in.
  - A format the dev likes that loses on the scorecard gets cut back anyway.
  - A format nobody loves that wins gets more posts, made to the brand's polish bar.
- **When the two collide** (a winning format that looks off-brand), the fix is to make the winner look right, not to drop
  it. If it can't be made to look right, that's the one case for the dev's call, and it gets logged in TASTE.md as a
  taste-vs-data decision.

---

## 1. The goal: Steam wishlists
**Why:** Steam notifies every wishlister at launch and at every 20%+ discount. Wishlists still predict sales well (R² ≈ 0.77).
- They're worth less than they used to be. First-month sales per wishlist halved, from 0.45 (2020–22) to 0.22 (2023–25), and the median first week is about 0.15× wishlists.
- Targets (Zukowski benchmarks, Jun 2026): **8k wishlists at launch = "Silver"** ($10k–249k lifetime). **50k = "Gold"** ($250k–1M).
- Racing is a **weak Steam genre**: median lifetime revenue is about $958. A generic racer dies; only a sharp hook escapes. Old School Rally (solo dev, ~101k wishlists, ~$500k) shows the escape is real.
- **Our targets:** 2k before Next Fest, 10k by launch as the floor, 50k as the stretch.

## 2. Positioning
### The rival: Backseat Champions (solo dev, Early Access Nov 13 2026)
- Its "draw any shape → real 3D circuit → unscripted AI race" clip got 786k views through Indie Game Joe.
- It claims nearly our whole feature list: track drawing, ML-trained AI, livery editor, co-op career, tire compounds, safety car.
- **But you don't drive.** It's an auto-battler with cartoon art and no real places.
- After 786k views it has only ~8.7k wishlists. The clip proved people want the idea; the game didn't convert them.

### Our position: the game those commenters wanted
> **Draw a track, or race a real one scanned from LiDAR. Then drive it yourself, sim-deep, in PS1-era style, and take your own team from a shitbox to F1, solo or with a friend.**

**Pitch by comparison:** *"Gran Turismo 2 with a track editor."* Steam players decide what a game is in about 45 s, and an X-meets-Y comparison is the proven shortcut. Super Woden GP sold on "GT2 vibes".

### Pillars, in priority order
| # | Pillar | Why it ranks here |
|---|---|---|
| 1 | **Make tracks** (draw one, or real ones from LiDAR) | Proven viral unit in this exact niche: the rival at 786k, Traks on TikTok, PolyTrack's 32k-post track-sharing thread. LiDAR real places is the part nobody else can show. |
| 2 | **You drive it, sim-deep** | The difference from the rival. Credibility for r/simracing. Tire temps and AI that learns the track are the proof. |
| 3 | **Your car** (liveries) | The car-as-character drove Pacific Drive (1M sales) and Night-Runners. Very visual in the first second. |
| 4 | **Career + garages** | Gives solo players something to chase; Motor Town's #1 complaint is solo grind. Strong in before/after and progress formats. |
| 5 | **Co-op** | The "friends of wishlisters" channel is ~25% of wishlists for co-op games. "Send this to your friend" is a share trigger. |

**Rules:**
- Never punch at the rival. Show the thing they can't do (you, driving) and let the comments draw the comparison.
- Every video carries ~2 pillars, tagged in the queue so results can be traced to a pair.

## 3. Where wishlists actually come from
A publisher's estimate (unaudited, but it matches every case study):

| Source | Share | What it means for us |
|---|---|---|
| Other creators' short videos (curator reposts) | ~35% | **Our own clips mainly exist to be reposted.** Indie Game Joe made the rival; Indie Games Hub gave DREADMOOR +17k in one day. |
| Steam's own algorithm | ~25% | Comes from Steam reacting to player interest. Needs a good page and a demo. |
| Friends of wishlisters | ~25% | Co-op shows on screen in the demo and in the clips. |
| Streamers and YouTubers | ~10% | The most likely to buy, and their videos keep earning (half of one video's views came after day 9). |
| The developer's own posts | ~5% | Cheap, and they feed the 35% above. Not an end in themselves. |

**Channel priority:**
1. **The Steam page, as early as possible.** One clip got 3.8M views and 0 wishlists because there was no page. 48% of FREERIDE's TikTok traffic came from people searching the name on Steam. Until the page is live, posts point to the website and its email list, and the pushes that convert only through Steam wait for it (§5).
2. **A clip factory** (TikTok + Reels + Shorts), with clips built to be reposted.
3. **A demo:** Steam demo plus the browser build. PolyTrack spread on play-in-browser alone, and Night-Runners' free prologue earned 22.7k reviews.
4. **YouTube creators**, once the demo exists. This is the strongest documented lever (Dome Keeper +40k in a month).
5. **Reddit:** r/racinggames, r/simracing, r/IndieDev, r/lowpoly, Screenshot Saturday. A good post brings ~100–150 wishlists; the outlier is 11k.
6. **Festivals and Next Fest.** One Next Fest per game, and results track wishlists going in (r = 0.83). Enter only at 2k+ with the demo out early.
7. **Low priority:** press, which covers games after they're popular; X and Bluesky, at 0.1–1.8% of traffic; long-form devlogs, which mostly reach other developers. Paid ads stay out at $0.

## 4. How the videos get made
### Main format: the narrated feature explainer (added 2026-10-18)
- **The evidence:** `research/reference-accounts.md`, 12 Reels from EATMEAT Games and Mix and Jam.
  - Every Reel with a calm voice explaining a feature did **66K–1.2M**.
  - Every music-only or no-voice Reel did **3K–31K**, on both accounts.
- **One feature per video.** A calm voice explains *why* it exists, over long shots of it working.
- **Script shape:**
  1. A hook sentence: a feeling the viewer has had, a bold claim, a big number, a list that builds, or "nobody made X, so…".
  2. What it is.
  3. How it works, shown on screen.
  4. Why: the design reason and the real-world grounding (real tire physics, LiDAR).
  5. A quotable closing line.
  6. A question to the viewer.
- **Pacing:**
  - 25–60 s long.
  - Speech at ~2–2.5 words/s.
  - Shots held 3–6 s while the feature visibly works.
  - The game's own sound (engine, wheel gun, radio) is the payoff moment.
- **This overrides the general rules below** where they conflict: length, and cuts every 1–2 s. The fast-cut rules still apply to the minor formats (crash, loop, before/after montage).
- **Physics beats:** where a feature has real physics under it, a 5–10 s animated "why" sits inside the video (never a standalone reel). Pairings: research/scripts-and-animation.md.
- **Narrator:** start with a designed AI voice speaking as "we". Then A/B the dev's own recorded voice on the same scripts and keep whichever holds viewers longer.

### The format rules, and why
- **One idea, readable in 1–2 s, as on-screen text.** Viewers swipe in 1–2 s if the topic isn't clear (Derek Lieu, Zukowski).
- **Game name on screen.** About half of viewers search Steam by name instead of using a link.
- **15–30 s for the fast-cut minor formats; 25–60 s for the narrated main series.** Videos over 1M views averaged 27 s. Completion is TikTok's strongest stated signal.
- **The ending loops into the start.** Replays count as views.
- **Burned-in captions.** Many people watch muted.
- **A 3 s wishlist call to action at the end.**
- **Game audio and our own music, no trending licensed sounds.** Business accounts can't use them, and the engines are the sound of the game. The music sits under the engines.
- **Rough beats polished in feeds.** A plain "here's what the game is" clip beat a festival feature.

### The method: re-cut instead of reshooting
- This is the strongest repeated finding. The Matriarch's 7M-view video was a re-cut of a 10k-view one: faster cuts, 130% speed, shorter text. It took them from <500 to 23k wishlists.
- **Each clip gets 3–5 hook versions.** We vary the text, the first shot or the speed. One variable at a time, 48–72 h apart.
- **Every version goes to all three platforms**, because results don't transfer: one clip got 6k on TikTok and 23k on Reels. Clean exports, no watermarks.
- **Judge on** viewed-vs-swiped in the first 2 s, completion, and saves per view. Shares correlate weakly, so they don't count much.
- **Winners get re-cut again**, then pitched to curator accounts.
- **Cadence (agreed 2026-10-19):**
  - **3 new videos a week**, each cross-posted to TikTok, Reels and Shorts;
  - **plus 2 re-cuts of the week's best** (a new hook, first shot or speed);
  - that makes **5 posts a week per platform**, batch-made.
  - Data says posting often matters more than any one video.

### The weekly mix (agreed 2026-10-19)
- **1 narrated explainer.** This is the main series above, at 25-60 s.
- **2 quick, broad-audience formats**, at 15-30 s, rotating through four:
  1. **Draw a track → drive it.** The editor, a road sketched in, Race It, then flat out on it. Pillar 1 (TRK × DRV).
  2. **A livery that gets wrecked.** A 5 s paint time-lapse, then it gets wrecked (LIV × DRV). This is the one format
     where a crash *is* the line, so it's filmed with `"incidents": true`.
  3. **An unscripted AI moment.** A photo finish, a pass, a save (DRV × AI). It's real AI racing, never staged.
  4. **"Do Spa" comment replies.** A viewer names a real track; we reply with its LiDAR version and a lap (TRK × DRV).
     Until there are comments to answer, it runs on the rival's and r/simracing's most-asked tracks.
- **Draw-a-track goes first.** None of the 7 videos ready on 2026-10-19 shows pillar #1 (they are tire temps ×3,
  engines, Spa scan, dirty air, AI sees). **The director has to film the track editor first** (CALENDAR 0.51).
- Until the director can film the editor, the second quick slot is an unscripted AI moment.
- Each of these four formats is new, so the first episode of each needs the dev's OK on its look (BRAND §8).
  After that, episodes run inside the approved format.

### The scorecard: decision rules, fixed before any results (agreed 2026-10-19)
Written down before the first post so nobody, including the dev or me, can rationalize a favorite afterwards.
- **What's compared:** the formats in the weekly mix, each against the others, on the same platform.
- **When:** after **4 posts per format** (re-cuts count as posts of their format).
- **Three numbers per post,** read from each platform's analytics 7 days after posting:
  | Metric | What it is | Where |
  |---|---|---|
  | **2 s hold** | % of viewers still there at 2 s (viewed vs swiped) | TikTok "viewed vs swiped away" / Reels "skip rate" (100 − skip) / Shorts "stayed to watch" |
  | **Completion** | % who watched to the end | TikTok "watched full video" / Reels and Shorts average % viewed |
  | **Steam intent per 1k views** | Steam clicks per 1k views; until the page is live, profile visits per 1k views | UTM'd link clicks (Steam UTM report) / profile visits |
- **The rule:**
  - Rank the formats on each metric by their median over the 4 posts.
  - A format that ranks **last on 2 of the 3 metrics** gets cut back to one post every other week.
  - Its slot goes to the leader.
  - If it's a tie, Steam intent decides, because it's closest to a wishlist.
- **Regardless of preference.** The dev's taste can change how the winner looks, but not whether it runs (§0).
- **Re-checked every 4 weeks.** A cut format can come back only on new evidence, such as a new hook that beats it in a
  re-cut test.
- **The narrated explainer** is scored the same way against its own past episodes (topic vs topic). It's the approved
  main series, so it isn't cut. Its topics are chosen by the scorecard.
- **The ledger (CALENDAR.md)** carries these three columns for every post.

### Hook bank (pillar pair → template)
| Pair | Template | Evidence |
|---|---|---|
| Tracks × Drive | Empty editor → hard cut → you driving it flat out. *"I drew this in 2 minutes."* | Rival's 786k; before/after format (8.5M) |
| Tracks (LiDAR) × Comments | Reply to *"do Spa"* with real Spa scanned from LiDAR, then a lap. | Comment-reply videos "convert well" and boost the original |
| Livery × Crash | Paint a livery in a 5 s time-lapse, then it gets wrecked. *"spent an hour on this..."* | Crash clips are the proven viral driving format (BeamNG) |
| Drive × AI | Unscripted AI incident or photo finish. *"Nobody scripted this."* | Rival's payoff line; BeamNG crash channels |
| Career × Garage | *"Week 1 vs week 40 of my race team"*: the shitbox, then the GT workshop | Progress formats |
| Co-op × anything | *"My co-op partner did this"* | The share-to-a-friend loop (~25%) |
| Pitch | *"Gran Turismo 2, but you can draw the tracks."* | X-meets-Y pitch (DREADMOOR) |
| Satisfying | A PS1 drift that loops perfectly | Loops add replays |

### Faceless, with a recurring voice
- Face-cam does better on average, so the account needs a recurring voice instead.
- **Decided 2026-10-18:** the voice is the calm narrator of the main series (see "Main format" above): a designed AI voice first, the dev's own voice A/B tested later.
- The race engineer, already voiced, is an in-world radio cameo: *"Box, box. Actually, don't. You drew this corner."* He's a payoff line or a minor comedy series, not the narrator.

### The content engine
- **Director mode:** the game films itself. AI races, cinematic cameras, frame-stepped 60 fps, 9:16 and 16:9. That's what makes 3–5 hooks per clip and 3–4 posts a week free.
- **Remotion** applies the format rules as a template you approve once.

## 5. Timeline
70% of wishlists arrive in the last 4 months before launch. Top games open their page 6–12 months out.

| When | What | Why then |
|---|---|---|
| **Now–mid Nov 2026** | Brand book, accounts, director mode, Remotion template. **Steam Coming Soon page** with capsule art, a ~30 s trailer and tags (the kit: `steam/`). **Aim: the page live before Nov 13** (Backseat Champions' EA launch) if the dev's Steamworks account clears in time. Valve reviews a page in 3-5 business days, so it goes in by about **Nov 4**. Posting starts as soon as the accounts exist and doesn't wait for the page (see below). | Backseat Champions' launch (Nov 13) brings people who search this niche. |
| **Dec 2026–Jan 2027** | A demo built to hold players (Gold-tier demos hold a median 38 min). Browser build plus Steam demo. Small Discord. Creator outreach starts once the demo exists. | Demos released well before Next Fest earned ~2.5× more. Creators need something to play. |
| **Feb 2027 Next Fest** if at 2k+, otherwise **June 2027** | Next Fest push: batch 5–15 strong clips the week before. Look for the vehicle-themed Steam festival ("Start Your Engine", applications ~March). | One shot per game, so enter loaded. |
| **Launch: 6–12 months after the page** | Hard date (needed for players' personal calendars on Steam), launch trailer, creator keys. | Avoid the run-up to the big Steam sales. |

### Before the Steam page is live (agreed 2026-10-19)
- **Allowed now:**
  - Posting the weekly mix.
  - Every post and bio points to **the website and its email list** (a sign-up now becomes a launch email later).
- **Waits for the Steam page:**
  - curator pitches;
  - Reddit pushes;
  - creator outreach.
  These only pay off as wishlists, and a pitch without a page wastes the contact. A curator or creator usually gives
  a game one look.
- **The day the page goes live:**
  - Links switch to Steam (with UTM tags, for the scorecard's Steam intent).
  - The best clip so far gets a re-cut ending on "Wishlist on Steam".
  - The outreach queue opens.

### Money
- The **$100 Steam Direct fee** is the dev's, paid by them.
- Valve pays it back once the game makes **$1,000 adjusted gross revenue** (it shows in the payment after that point).
- Nothing else is spent (§6).

## 6. What the head of marketing does alone vs asks you
- **Alone:**
  - research and listening (rival comments, subreddits);
  - making clips and hook versions from approved templates;
  - captions and copy;
  - the calendar and the weekly numbers;
  - creator and curator lists;
  - draft pitches.
- **Your taste:**
  - the brand book and the narrator voice;
  - video templates, the capsule art and the trailer;
  - any new format.
- **Always asks:**
  - posting until you grant standing approval;
  - any spending (the **$100 Steam Direct fee** is unavoidable);
  - messages to creators, curators or press;
  - dates and prices;
  - Reddit posts. These are always yours, posted as you, because Reddit punishes automated self-promotion.

## Open risks
- **Wishlists are worth less every year.** Plan on 0.15–0.22× conversion, not old rules of thumb.
- **Most clips flop.** Expect <1k views on most; the system wins on volume and re-cuts, not on any one post.
- **The rival owns "draw → AI race" in the feed first.** Our hooks lead with *driving it yourself* and *real places*.
- **Views ≠ wishlists.** Traks' TikTok success led to 34 Steam followers. The page plus the name on screen plus the demo is what converts.

## Sources
- Zukowski benchmarks: https://howtomarketagame.com/benchmarks/
- Wishlist inflation: https://www.invenglobal.com/articles/27273/steam-wishlist-inflation-value-of-1-wishlist-cut-in-half-but-predictive-power-remains-unchanged
- GameDiscoverCo state of Steam: https://gamedevreports.substack.com/p/gamediscoverco-the-state-of-steam
- VG Insights wishlists: https://gamedevreports.substack.com/p/video-game-insights-steam-wishlists
- Valve wishlist docs: https://partner.steamgames.com/doc/marketing/wishlist
- Valve at GDC 2025: https://howtomarketagame.com/2025/04/14/what-i-heard-from-valve-at-gdc/
- Next Fest benchmarks: https://howtomarketagame.com/2025/03/26/benchmarks-how-many-wishlists-can-i-get-from-steam-next-fest/
- Creators: https://howtomarketagame.com/2025/09/16/10-reasons-why-you-shouldnt-hold-back-on-contacting-content-creators/
- Wishlist source split: https://wnhub.io/news/stores-and-publishing/item-51014
- Curator spikes (DREADMOOR): https://wnhub.io/news/stores-and-publishing/item-50914
- The Matriarch re-cut: https://www.gamedeveloper.com/game-platforms/from-400-to-20-000-wishlists-with-1-video-how-tiktok-can-make-your-game-go-viral
- TikTok case studies: https://howtomarketagame.com/2022/02/14/how-to-go-viral-on-tiktok/
- Studio TikTok dataset: https://newsletter.gamediscover.co/p/tiktok-how-data-changed-one-devs
- Mortal Rite: https://newsletter.gamediscover.co/p/this-game-used-tiktok-to-get-120m
- Rival clip: https://www.facebook.com/IndieGameJoe/videos/draw-any-shape-and-it-builds-into-a-real-3d-circuit-complete-with-unscripted-rac/4612024669029670/
- Rival Steam: https://store.steampowered.com/app/2174510/Backseat_Champions/
- Traks: https://ga-games.itch.io/traks
- PolyTrack: https://kodub.itch.io/polytrack
- Old School Rally: https://raijin.gg/app/2824660/Old_School_Rally
- Motor Town: https://raijin.gg/app/1369670/Motor_Town_Behind_The_Wheel
- Genre medians: https://profitable.app/steam/genres
