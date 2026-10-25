# Tools, skills, APIs and stats for measuring short-form (research, 2026-10-22)

Research only. Nothing was installed. Star counts are from the GitHub API on 2026-10-22 ("pushed" = last push).

## 0. What is already installed

- Project `.claude/skills/`: `marketing`, `explainer-script`, `garage-station`.
- `~/.claude/skills/`: the coreyhaines31/marketingskills subset (ad-creative, ads, analytics, community-marketing, competitors, content-strategy, copy-editing, copywriting, customer-research, directory-submissions, events, image, influencer-marketing, launch, marketing-ideas, marketing-plan, marketing-psychology, public-relations, social, video), plus hyperframes (8 skills), remotion (8 skills), ffmpeg, humanizer, motion-graphics, gsap-*, dataviz-adjacent tools, skill-creator, find-skills.
- Not installed from marketingskills: **`ab-testing`**, **`attribution`**, `conversion-tracking`. The `analytics` skill points to `ab-testing` for test measurement. That is the one gap worth filling (repo is MIT, 55,979 stars, pushed 2026-10-22: https://github.com/coreyhaines31/marketingskills). It is written for web CRO tests, so it needs a short-form addendum (section 4).

## 1. Skills, plugins and MCP servers

| Need | Best candidate | Stars / pushed / license | Official? | Notes |
|---|---|---|---|---|
| Scheduling + analytics, free | **Buffer MCP + GraphQL API** (https://buffer.com/made-for/developers, buffer.com/mcp, developers.buffer.com) | n/a (hosted) | Official | Launched May 2026. API on all plans; Free = 1 API key, 3,000 req/month. Remote MCP. |
| Scheduling + analytics, free | **Metricool MCP** (https://help.metricool.com/faqs-about-the-metricool-mcp-1i3w0, PyPI `mcp-metricool`) | GitHub org repo `metricool/servers` 2 stars | Official | Works on the Free plan. Reads analytics, schedules posts, "best time" slot, creates posts for review. |
| Scheduling, self-host | **Postiz** (https://github.com/gitroomhq/postiz-app) | 37,585 / 2026-10-22 / AGPL-3.0 | Official OSS | Built-in MCP, CLI, public API, analytics. Self-host means you use **your own** TikTok/Meta/Google apps, and an unaudited TikTok app forces posts to private (section 3). |
| YouTube analytics | ZubeidHendricks/youtube-mcp-server | 588 / 2026-08-08 / MIT | Community | Mostly Data API (public stats, transcripts). For private Analytics API metrics see pauling-ai/youtube-mcp-server (29, 2026-09-04, MIT), i1s-abhishek/youtube-studio-mcp (19, 2026-04-20, MIT), adityaarsharma/youtube-marketing-skills (66, 2026-10-10, MIT). All are small. A ~100-line script is safer (section 2). |
| YouTube transcripts (reference accounts) | kimtaeyoon83/mcp-server-youtube-transcript | 604 / 2026-07-21 / MIT | Community | Handy for mining competitor hooks. |
| Instagram insights | BilalTariq01/instagram-analytics-mcp, AleemHaider/instagram-mcp | 6 stars each | Community | Too small to trust. Call the Graph API directly. |
| Meta ads (later, paid) | pipeboard-co/meta-ads-mcp | 1,324 / 2026-10-20 | Vendor | Not needed at $0. |
| TikTok own stats | none worth using | | | TikTok API exposes little (section 2). Scrapers violate ToS. |
| Comment mining / listening | **apify/apify-mcp-server** | 12,613 / 2026-10-22 / MIT | Official (Apify) | TikTok comment actors cost about $0.50 per 1,000 comments or $10-20/month, and some need a paid plan for API use. Not $0. Copying your own comments out of the app or Studio is free. |
| Reddit research | **adhikasp/mcp-reddit** | 430 / 2025-05-11 / MIT | Community | Read-only. Also Hawstein/mcp-server-reddit (184, 2026-06-10, MIT). Plain `curl https://www.reddit.com/r/<sub>/top.json?t=month` covers most needs with no install. |
| Steam store data | Sarg338/steam-mcp (read-only, 37 tools) | 7 / 2026-09-24 | Community | Also wazzapsenk/steamworks-mcp (8), jhomen368/steam-reviews-mcp (3). All tiny. For your own wishlists use the official Partner API (section 2). |
| Hook scoring | alphaparkinc "shortform-hook-retention-scorer" skills, subkap88-coder/Hook-Brain | 8-36 stars | Community | Unvalidated (section 5). Skip. |
| A/B stats | alphaparkinc/genpark-ab-test-calculator-skill (10), webtrends-optimize/claude-code-ab-testing-skills (1, GPL) | | Community | Not worth it. A 30-line script is better (section 4). |
| Humanizer | blader/humanizer | 59,583 / 2026-10-16 / MIT | Community | Already installed. |
| HyperFrames / Remotion | heygen-com/hyperframes (69,872, Apache-2.0), remotion-dev/skills (5,533) | | Official | Already installed. |

**Security.** Skills and MCP servers run with your user permissions: files, shell, and any tokens in env. Snyk's "ToxicSkills" audit (Feb 2026, as reported by secondary sources) found about 36% of registry skills had a flaw. Datadog notes that a skill's dynamic-context commands run *before* the model reads the skill (https://securitylabs.datadoghq.com/articles/malicious-skills-supply-chain-risks-in-coding-agents-with-dynamic-context/). Rules:
1. Prefer official hosted MCPs (Buffer, Metricool) or first-party APIs.
2. Read every file of a community skill before installing it, and pin to a commit.
3. Never give a small community MCP a write-scoped social token.
4. Keep API keys in a gitignored `.env`, and use read-only OAuth scopes for analytics.
5. The Steam Financial key can see all partner financials, so IP-whitelist it.

## 2. Official APIs: what is free and what you actually get

### YouTube (best of the three, and free)
- **Data API v3**: 10,000 units/day free. Uploads (`videos.insert`) dropped from about 1,600 to about 100 units on 2025-12-04 and have their own bucket of 100 per day since 2026-06-01 (https://developers.google.com/youtube/data/revision_history). **Catch:** uploads from an *unverified* API project created after 2020-07-28 are locked to private until the project passes a compliance audit. So upload manually, or through Buffer or Metricool, which are audited.
- **Analytics API** (read-only OAuth scope on your own channel, no audit needed): filter with `creatorContentType==SHORTS` (https://developers.google.com/youtube/analytics/dimensions). Metrics include `views`, **`engagedViews`**, `averageViewDuration`, `averageViewPercentage`, likes, shares, `subscribersGained`, and the **retention curve** (`audienceWatchRatio` by `elapsedVideoTimeRatio`, 100 points per video).
- Since 2025-03-31, a Shorts "view" counts every start or replay, while `engagedViews` keeps the old "watched past the first seconds" rule (https://www.tubefilter.com/2025/03/26/youtube-shorts-views-counting-stats/). **`engagedViews / views` is a free per-video hook-hold rate.** It is the best A/B metric available across all three platforms.
- Not in the API: thumbnail impressions/CTR and Studio's "viewed vs swiped away". Data lags about 48 h.

### Instagram Reels
- **Instagram API with Instagram Login** needs a professional (Business or Creator) account. **No Facebook Page is needed.** An app in development mode with you as the app role gets Standard Access for your own account, with no App Review or Business Verification (https://developers.facebook.com/docs/instagram-platform/overview). Scopes: `instagram_business_basic` and `instagram_business_manage_insights`. Tokens last 60 days and can be refreshed.
- Reels metrics (https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/): `views`, `reach`, `likes`, `comments`, `saved`, `shares`, `reposts`, `total_interactions`, **`ig_reels_avg_watch_time`**, `ig_reels_video_view_total_time`, and **`reels_skip_rate`** (share of views skipped in the first 3 s; "in development"). `plays` and `impressions` were removed 2025-04-21. Data can lag up to 48 h and is kept 2 years.
- **`1 - reels_skip_rate` is the IG hook-hold metric.**

### TikTok (the weakest)
- **Display API** `video.list` returns only public counters for the authorized user: `view_count`, `like_count`, `comment_count`, `share_count`. There is **no watch time, retention or completion** (https://developers.tiktok.com/doc/display-api-get-started/). It needs Login Kit + `video.list` scopes approved. TikTok's review guidelines say "Apps must not be for private or personal use" (https://developers.tiktok.com/doc/app-review-guidelines), so a solo-creator app may be rejected. Sandbox mode lets up to 10 accounts test without review (per a secondary source, unconfirmed for Display scopes).
- **Research API**: only non-profit academic or research bodies with ethics review. A student's own marketing does not qualify (https://developers.tiktok.com/products/research-api).
- **Content Posting API**: unaudited clients post **private only** (SELF_ONLY) and can have at most 5 posting users per 24 h. The audit takes about 2-6 weeks and requires TikTok-specific UX (https://developers.tiktok.com/doc/content-posting-api-get-started, https://docs.postiz.com/providers/tiktok.md).
- **What works:** TikTok Studio → Analytics → export (CSV/zip, one category at a time), or read the per-video screen. Average watch time, "watched full video" % and the retention curve are visible in Studio but are not in the public API. Plan on the dev doing **a 2-minute weekly export or screenshot** that Claude parses.

### Steam (once the store page is live)
- **UTM Analytics** (https://partner.steamgames.com/doc/marketing/utm_analytics): links to `store.steampowered.com/app/<id>?utm_source=tiktok&utm_campaign=<clip-id>`. The report shows visits, trusted/tracked visits, wishlists, purchases. Attribution window is 72 h, conversions are final after 4 days, and low-volume UTM combinations are hidden. **Export is dashboard CSV only, with no API.** You need the "View Marketing Traffic Data" permission.
- **Wishlist API**: `IPartnerFinancialsService/GetAppWishlistReporting` (adds, deletes, purchases, by country, language and platform, per day), with no settlement delay (https://partner.steamgames.com/doc/webapi/IPartnerFinancialsService). It needs a **Financial API Group key**, which you create on Manage Groups and IP-whitelist. This is the one Steam number you can pull automatically every day.
- Note: TikTok and IG bios allow only one link and in-app browsers often aren't logged into Steam, so tracked wishlists will undercount. Use one UTM per platform (bio link) rather than per clip, and treat the daily wishlist delta as the outcome.

## 3. Schedulers in 2026

| | Free tier | TikTok | Reels | Shorts | API / MCP | Verdict |
|---|---|---|---|---|---|---|
| **Buffer** (https://buffer.com/pricing) | 3 channels, 10 queued posts/channel, 30-day insights | yes (business profile) | yes (pro account) | yes | API (3k req/mo) + official MCP | **Best fit.** Exactly 3 channels, and its TikTok app is already audited, so posts go public. |
| **Metricool** | 1 brand, 20 scheduled posts/month, 30 days of data | yes | yes | yes | official MCP on Free | Good backup and good for analytics reads. 20 posts/month across 3 platforms is about 1.5 clips/week. |
| **Postiz self-host** | free (AGPL) | **private only** until you pass TikTok's audit | needs your own Meta app (dev mode is fine for yourself) | needs your own Google project, so the private-lock applies until audit | MCP, CLI, API | Not for TikTok. Postiz Cloud is paid. |
| Later | free plan mostly gone or very limited | | | | no public MCP | Skip. |

**Does scheduling hurt reach?** No good independent evidence says it does. Instagram's Mosseri said in March 2025 that scheduling doesn't affect reach either way. Hootsuite's 2025 IG test found no penalty (https://blog.hootsuite.com/experiment-third-party-scheduling-instagram/). Metricool's 202-video TikTok test found no difference (https://metricool.com/does-scheduling-social-media-posts-affect-reach/). All of these are vendors. **Real caveats:**
1. API posts can't attach TikTok or IG library *trending sounds* or native text/stickers. If you need a trending sound, post natively, or schedule as a draft and finish in the app.
2. Unaudited apps silently post private (TikTok, YouTube).
3. Posting time matters more than the posting method.

## 4. A/B testing with low, noisy view counts

The problem: the algorithm decides distribution. Views are not an outcome you control and they are not independent per viewer. One clip at 300 views and another at 3,000 is mostly distribution luck. So:

1. **Test rates, not counts.** Primary metric: hook-hold = YT `engagedViews/views`, IG `1 - reels_skip_rate`, TikTok Studio's 2-s or 5-s retention point. Secondary: completion (`averageViewPercentage`, `ig_reels_avg_watch_time / duration`), then shares+saves per view. Wishlists are too sparse for per-clip tests. Compare wishlist deltas by week or by platform instead.
2. **Design: matched pairs.** Same footage and length with only the first 1-2 s (hook/caption) changed. Post A and B at the same slot on consecutive days, or swap platforms (A on YT/B on IG today, reversed tomorrow). Randomize which goes first with a coin flip logged in the ledger. Never compare clips across platforms directly.
3. **Model: Bayesian beta-binomial per pair.** hold ~ Beta(1 + held, 1 + views - held). Report P(B > A) and expected lift, using Evan Miller's closed form (https://www.evanmiller.org/bayesian-ab-testing.html) or 100k Monte Carlo draws. Views are clustered and overdispersed, so **cap the effective n** (for example, treat each clip as at most 500 trials) or use a beta-binomial hierarchical model across clips. Otherwise 3,000 views gives false certainty.
4. **Across many pairs** (the real answer): log each pair's difference in logit(hold), then run a **sign test or a Bayesian paired model** over hook *types* (question vs crash vs "wait for it" vs text claim). After about 8-12 pairs per hook type you get a usable answer. One clip pair proves nothing.
5. **Sequential is fine in Bayes.** Look whenever you like, but stop on a pre-set rule: P(B > A) > 0.95 **and** at least 6 pairs, or call it a tie at 15 pairs. If you want frequentist instead, use mSPRT or always-valid p-values. Never repeatedly peek at a t-test.
6. **Minimum sample.** Detecting a 10-point change in hold rate (for example 55% to 65%) at about 80% power needs about 350-400 effective viewers per arm. Detecting 5 points needs about 1,500. At the dev's likely scale (hundreds of views), only big hook differences are detectable per pair. That is why pooling across pairs (point 4) matters.
7. **Explore/exploit later:** Thompson sampling over hook *templates* (sample from each template's Beta posterior, make the next clip with the winner) once there are 3+ templates with data.

Ready-made tools: nothing worth installing. bayesAB (R), and Python `scipy.stats.beta` or numpy is enough. Write `marketing/tools/abtest.py` (about 40 lines: read ledger CSV → per-pair P(B>A) + pooled paired model) and add the marketingskills `ab-testing` skill for the test-plan template.

## 5. Predicting hook strength or retention automatically

- **SnapUGC / VQualA 2025 (ICCV workshop)** is the only solid benchmark: engagement prediction on real Snapchat short videos (https://arxiv.org/html/2509.02969v1). The winner (VideoLLaMA2 + Qwen2.5-VL ensemble, code https://github.com/sunwei925/LMM-EVQA, 20 stars, no license) scored about 0.71 on the challenge's correlation metric. That is a population-level ranking of UGC, not "will this hook beat that hook on my account". It also needs a large GPU, so it is impractical here.
- **Kayal et al., ACL Findings 2025** "LLMs Are Natural Video Popularity Predictors" (https://preview.aclanthology.org/setup/2025.findings-acl.597): LLMs given title, frame descriptions and captions classify *already-popular* videos at about 82% accuracy. This is coarse classification, not hook-level.
- **arXiv 2512.21402** (Dec 2025, under review): a VLM rubric that regresses engagement on edutainment Shorts. It reports "strong correlations" with no numbers and no code.
- **Hook-Brain / TRIBE v2 wrappers** (Meta fMRI model → "virality score"): the brain-to-virality mapping is a heuristic. Higgsfield Virality Predictor is proprietary with no paper. Ignore both.
- **Verdict:** nothing predicts hook strength reliably for a single small account. Use the LLM as a **pre-filter, not an oracle.** Claude scores 5-10 hook drafts against a fixed rubric: first frame is motion, a claim or question lands in 1.5 s, car on screen at 0 s, readable text in the safe zone, no logo intro. Only the top 2 get filmed, and real `engagedViews/views` decides. After about 20 pairs, check whether Claude's rubric scores correlate with the measured hold. If they don't, drop the scoring.

## 6. Recommended minimal stack (in order)

1. **YouTube Analytics API script** (Google Cloud project, read-only `yt-analytics.readonly` scope, OAuth on the dev's channel). Free, no audit, and gives retention plus `engagedViews`. Claude writes `marketing/tools/yt_pull.mjs` and the dashboard reads its JSON. *Needs: dev's Google login once.*
2. **Buffer Free + Buffer MCP** to schedule TikTok, Reels and Shorts (3 channels = exactly the three) and pull basic insights. Its TikTok/YT apps are audited, so posts are public. *Needs: TikTok switched to a business profile (business accounts lose some commercial sounds, so check before switching), IG switched to Creator, and the dev's approval of each queued post.* Metricool Free is the fallback.
3. **Instagram API with Instagram Login, dev-mode app** for Reels insights (`reels_skip_rate`, avg watch time). *Needs: Meta developer account, IG professional account. No Page and no App Review.*
4. **TikTok: weekly Studio export** dropped into `marketing/data/tiktok/`, which Claude parses. Don't build a TikTok app.
5. **`ab-testing` skill** from marketingskills (read it first) + `abtest.py` (section 4) + an A/B column set in the ledger (pair id, slot, variant, hold, completion, shares/view).
6. **Steam, when the page is live**: per-platform UTM bio links, a weekly UTM CSV download, and a daily `GetAppWishlistReporting` pull. *Needs: Steamworks partner account, Financial API Group key (IP-whitelisted, kept out of git).*
7. Optional: adhikasp/mcp-reddit (read-only) for subreddit research. Apify only if comment mining at scale ever matters (it costs money).

Avoid: Postiz self-host for TikTok, small community IG/YT/TikTok MCPs with write tokens, scrapers (ToS), and paid "virality score" tools.
