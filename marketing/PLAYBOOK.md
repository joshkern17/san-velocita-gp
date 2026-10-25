# Engagement playbook

Written 2026-10-22 from three research passes, with sources in `research/platform-signals.md`,
`research/indie-engagement-2026.md` and `research/tools-and-skills.md`. These are rules for every post. The test plan for
what's still unknown is in `EXPERIMENTS.md`.

Engagement means **watch time, sends and comments from real people**. Bots, bought views, engagement pods and anything
the platforms call bait stay out. They get videos pulled from the For You feed, and they don't turn into wishlists.

## 1. What the feeds actually reward
- **The first 1-3 seconds decide everything.** In 90k Snapchat videos (ECCV 2024), the share of viewers still there at 5 s
  predicted overall watch percentage almost perfectly (r = 0.93).
  - On-screen text predicted engagement. The spoken words didn't, because viewers decide before much is said.
  - **So the opening shot and its on-screen text do the hooking.** The narrator's first line never carries the hook alone.
- **Never open on a logo or title card.** A big central logo increases skipping (Marketing Science 2010). Short brand
  flashes later in the video don't.
- **A surprise first, then rising payoff.** This shape keeps people from skipping (JMR 2012). Our version is a hard
  cut into the feature working, then the engines coming up.
- **Sends (DM shares) are the signal for reaching non-followers on Instagram** (Mosseri, Jan 2025). Watch time and likes
  are the other two. Make things people send to a friend: co-op, "you'd love this", a track from their country.
- **Completion matters on TikTok.** Platforms correct for length, so cut every second the content doesn't hold. Don't
  pad a video to reach a length target.
- **YouTube Shorts** tests a video on a first batch of viewers and can take off days later. Never delete a slow Short.

## 2. What gets a video demoted (avoid)
- **Bait:** "comment RACE", "tag a friend", "like for part 2" (Instagram rule, Jun 2024), and anything that manipulates
  people into likes or follows (TikTok, effective 2026-09-24).
  - **Allowed:** open questions such as "Which track should I scan next?" or "Bark or burble?". Every video can end on
  one.
- **Reused material:** TikTok removes "unoriginal or reused material without anything new" from the For You feed.
  - **A re-cut has to be a real new edit:** a new first shot, a new hook, and new or reordered footage. Never a
  re-upload with new text.
  - Re-cuts go 48-72 h apart, and at most one per platform per week.
- **Watermarks:** render one clean master from our pipeline and upload it natively to each app. Never download from
  one app and post to another (YouTube adds a watermark on download, Instagram demotes other apps' marks).
- **Hashtags:** Instagram allows 5 at most, and they help search and topic, not reach.

## 3. AI disclosure (the biggest risk in our plan)
- **Players are hostile to AI.** 85% of 1,799 players are negative about generative AI in games, and 83% about AI
  dialogue (Quantic Foundry, Dec 2025). Steam games that disclosed AI got ~53% fewer reviews in 2025, though that may
  not be causal (Game Oracle).
- **Studios keep apologizing for AI in their marketing in 2026,** and solo devs get falsely accused all the time.
- **Disclosure costs a little:** AI-labelled TikTok posts got ~7-8% fewer likes, because viewers assume less effort
  (J. Consumer Research, May 2026). **Showing the effort softens it.**
- **YouTube's inauthentic-content rule** (Jul 2025) names "slideshows that all have the same narration". Our videos are
  real footage and each script is different, but a series that sounds identical every time edges toward it.
- **The rule from here:**
  - Disclose any AI voice up front (platform label + a caption line).
  - Make the hand-built work obvious on screen.
  - Test the voice itself first (EXPERIMENTS E1).
  - The in-game ElevenLabs voices also need Steam's AI disclosure on the store page. Draft that wording with the
    Steam kit.

## 4. Captions, search, timing
- **Search phrase in the caption and on screen:** "PS1 racing game", "sim racing game", "track editor". TikTok and
  Shorts search read both.
- **The game's name on screen in every video.** Most people search Steam by name instead of tapping a link.
- **Posting time isn't a ranking factor** on any platform. We keep one fixed evening slot so tests are comparable,
  not because the time is magic.
- **Frequency:** as often as quality holds (Mosseri). Our 3 new a week + re-cuts stays.

## 5. The one engagement tactic with proof: reply with a video
- **Reply to a real comment with a new video** that pins the comment on screen. Farewell North's reply boosted both
  clips (950k views, 830 wishlists).
- Comment-driven series are built on this: draw it in the comments (V07) and "do Spa" (V05).
- **Reply to every comment in text in the first hour** (the dev, or the head of marketing drafts for the dev). Early
  replies make a thread, which keeps people on the video.

## 6. Where it goes after our own posts
- **Reposts by curator accounts** bring the biggest spikes (Dreadmoor, The Cabin Factory). Clean masters, the game name
  on screen, and a pitch once the Steam page is live.
- **Reddit:** link in the comments, never a feedback request that's really an ad, one post per sub per month, genre
  subs first. Check each sub's sidebar by hand before posting. The dev posts, always.
- **Outlets that cover WIP indie racers:** Traxion.gg, Car Throttle's upcoming indie racers, Silent's Blog. Pitch after
  the page is live.

## 7. What a view is worth (keep expectations honest)
- ~5-7 wishlists per 1,000 views on average, with a wide range. 100k views is hundreds of wishlists, not thousands.
- Wishlists convert worse every year (0.7 copies per wishlist for the 2023-25 cohort). **Steady weekly growth after
  the page goes live** predicts sales almost as well as the total, so consistency beats one viral hit.
- Steam UTM tracking catches only a quarter of real wishlists, so compare versions against each other, never
  as absolute numbers.
