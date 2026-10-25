# Platform signals: what the recommenders weigh, what they demote, how to test (researched 2026-10-22)

Scope: TikTok, Instagram Reels, YouTube Shorts, for faceless 15-60 s game clips with a calm AI narrator. Web research only.
Source grades: **[P]** primary (platform docs, exec statements, peer-reviewed or arXiv papers). **[S]** reputable secondary reporting of a primary statement. **[W]** weak (vendor blog, guru list, creator survey). Treat [W] as a hypothesis at best.

---

## 1. What each recommender weighs

### Instagram Reels
- **Top three signals are watch time, likes and sends (DM shares).** Mosseri, Jan 2025: "The top three signals that matter most for ranking are watch time, likes and sends... pay close attention to average watch time, likes per reach, and sends per reach." **[S]** https://www.socialmediatoday.com/news/instagram-shares-algorithm-insights-2025/738034/ (2025-01-22)
- **Followers vs non-followers:** "Likes are slightly more important for connected content, and sends are slightly more important for unconnected content." (same source) **[S]**. Non-followers are the wishlist audience, so **sends per reach is the number to watch on IG**. The "sends are worth 3-5x a like" multiplier all over blogs has no primary source **[W]**, so ignore it.
- Official ranking explainer: the most important Reels predictions are "how likely you are to reshare a reel, watch a reel all the way through, like it, and go to the audio page". Instagram also runs surveys asking whether a reel is "worth their time or fun". **[P]** https://about.instagram.com/blog/announcements/instagram-ranking-explained (2023-05-31)
- Comments aren't in Mosseri's 2025 top three (SMT notes this). Saves aren't in it either.
- **Length:** Reels up to 3 min have been eligible for recommendation since Jan 2025. Before that, anything over 90 s wasn't recommended. Mosseri said the focus stays on short-form. **[S]** https://www.socialmediatoday.com/news/instagram-officially-expands-reels-length-to-3-minutes/737766/ (Jan 2025)

### TikTok
- Official explainer: user interactions (likes, shares, follows, comments, videos you create), then video information (captions, sounds, hashtags), then device and account settings, which get "lower weight". Signals are weighted by strength. "Whether a user finishes watching a longer video from beginning to end" is the example of a strong signal. "Neither follower count nor whether the account has had previous high-performing videos are direct factors." **[P]** https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you/ (2020-06-18; still TikTok's canonical page, so it's old)
- Independent audits: Vombatkere et al., WWW 2024, used real donated TikTok timelines and measured how far watch duration, likes and follows drive personalization. **[P]** https://arxiv.org/abs/2403.12410. A SIGIR 2025 replication found audit results "often hold only in the short term" and depend on the platform's current state **[P]** https://arxiv.org/abs/2504.18140 (2025-04-25). Secondary summaries of these papers say **watch time is the strongest personalization signal and likes are weak**. That's consistent with TikTok's own "completion = strong" framing.
- Zannettou et al., CHI 2024 (347 users, 9.2M recommendations from data donations): attention stayed stable at about 45% (the share of a video watched). Users like followed creators' videos more than recommended ones. **[P]** https://arxiv.org/abs/2301.04945
- Creator Rewards (TikTok's monetization program) pays only for videos over 1 min. Its formula weights "originality, play duration, search value and audience engagement". This is a monetization rule, not proof the FYP favors long videos. **[S]** https://www.engadget.com/tiktok-to-creators-make-longer-videos-get-paid-055013923.html

### YouTube Shorts
- The Shorts feed has no thumbnails or impressions. YouTube's stand-in is **"viewed vs swiped away"** (now labelled "Stayed to watch"). Shorts compete with other Shorts. One that does worse than others in the feed "won't go much beyond those initial views", but it can take off on a later day. Initial views "are basically impressions". **[P]** Rene Ritchie interviewing Todd Sherman (head of Shorts): https://blog.youtube/creator-and-artist-stories/renes-top-five-march-4-2024/ (2024-03-04)
- **View counting changed on 2025-03-31.** A view now counts every time a Short starts or replays, with no minimum watch time. The old metric became **"Engaged views"**, which is what YPP uses. Compare engaged views, never raw views. **[P]** https://support.google.com/youtube/answer/10059070 (YouTube Help, current)
- Shorts can be up to 3 min (same help page). Ritchie says a Short should be "as long as it needs to be, but no longer" **[S, quoted second-hand]**.
- Benchmarks like "70-90% viewed vs swiped is good" or "under 50% means your hook is failing" come from vendors **[W]**. YouTube says to compare against your own channel.

**Takeaway across all three:** the first 1-3 s decide stay vs swipe (YT's explicit metric, TikTok's completion signal, IG's watch time). After that, **shares/sends** are the strongest signal for reaching non-followers. Likes matter mainly for followers.

---

## 2. Engagement-bait and demotion rules

**TikTok (Community Guidelines, effective 2026-09-24)** **[P]** https://www.tiktok.com/community-guidelines/en/integrity-authenticity
- FYF-ineligible: "Content that tries to manipulate people into giving gifts or inflating likes or follows."
- FYF-ineligible: "unoriginal or reused material without anything new."
- AI: creators must "label AI-generated or significantly edited content that shows realistic-looking scenes or people". Unlabelled content "may be removed, restricted, or labeled".
- The text doesn't name "comment YES" or "like for part 2". A third-party checklist lists "like-for-like" promises as an FYF risk **[W]**.

**Meta / Instagram**
- Meta defines engagement bait as posts that "explicitly request engagement (votes, shares, comments, tags, likes or other reactions)" for purposes other than a specific call to action. **[P]** https://transparency.meta.com/en-gb/features/approach-to-ranking/content-distribution-guidelines/engagement-bait/ (a Facebook page, live in 2026). The original 2017 taxonomy is vote-bait, react-bait, share-bait, tag-bait and comment-bait ("comment with specific answers").
- Instagram's Recommendation Guidelines list engagement bait as allowed on the platform but possibly not eligible for recommendation. **[P]** https://help.instagram.com/313829416281232 (the page wouldn't render here; content confirmed via search snippet)
- **Where the line sits (Instagram, June 2024):** "don't try to hack engagement... An example of this is asking people to comment with a specific word, number, or emoji." Also: "open-ended questions and call to actions, they're both fair game." **[S]** https://www.socialmediatoday.com/news/instagram-says-using-certain-ctas-can-impact-post-reach/717732/ (2024-06-02). A follow-up said earnest comment/DM engagement isn't bait and that tools like ManyChat are still usable **[S]** https://www.socialmediatoday.com/news/instagram-clarifies-advice-on-single-word-ctas-and-longer-reels/718151/
- Practical line for us. OK: "What corner should I scan next?" or "Which would you drive, the Civic or the 935?" These are genuine open questions with many possible answers. BAIT: "Comment RACE for the Steam link", "Tag a friend who...", "Like if you want part 2", "Type 1 if...".
- Misleading hooks: TikTok's FYF rules and Meta's content distribution guidelines also demote clickbait and misleading content. If a hook promises a payoff, the clip has to deliver it, or completion drops anyway.

**YouTube**
- Reused content: recommendations favor commentary, analysis and storytelling over re-uploads (Rene Ritchie, reported) **[S]** https://aiweekly.co/alerts/youtube-downranks-re-uploaded-shorts-ai-remix-status-unclear. Not a risk for us, since all our footage is our own.

**AI labels and whether they cost reach**
- **YouTube** **[P]** https://support.google.com/youtube/answer/14328491: disclosure is needed for realistic content that makes a real person say or do something, alters real events or places, or generates a realistic scene that didn't happen. AI help with scripts, captions, titles, thumbnails or voice repair needs no disclosure. "Disclosing AI content alone won't limit a video's audience or impact its eligibility to earn money." The page doesn't say whether a plain synthetic narrator needs a label. Stylized PS1 game footage plus a non-impersonating TTS voice doesn't fit any listed trigger.
- **TikTok:** the rule covers "realistic-looking scenes or people" (above). Low-poly game footage isn't realistic-looking. TikTok may auto-label content that carries C2PA metadata **[S]**. I found no primary TikTok statement on whether labels change distribution. The claim that "labels don't affect reach" comes from blogs **[W]**.
- **The audience effect is real even where the algorithm doesn't penalize.** Carney et al., *Journal of Consumer Research*, 2026-05-07, "Made With AI: Consumer Engagement With Social Media Containing AI Disclosures" (doi 10.1093/jcr/ucag013). TikTok field data plus six preregistered experiments. Disclosed-AI posts got about 7-8% fewer likes and about 7% less total engagement. The mechanism: viewers assume the creator put in less effort, which weakens the parasocial connection. Signalling effort softens the drop. **[P via S]** https://ssir.org/articles/entry/ai-disclosures-social-media-disengagement ; https://insider-gaming.com/ai-labels-can-reduce-social-media-engagement-study-finds/ (2026-07-04)
  - Our response: label whenever a rule requires it (never hide it), and make the human effort obvious ("one student, 14 LiDAR-scanned tracks"). The game is the hand-made thing. The narrator is a tool.

---

## 3. Cross-posting

- **Instagram:** since 2021 it has made Reels with other apps' logos or watermarks "less discoverable". Followers still see them. **[S]** https://tubefilter.com/2021/02/10/instagram-reels-with-tiktok-watermark-less-discoverable/. Mosseri says your own logo is fine. **[S]** https://www.socialmediatoday.com/news/instagram-clarifies-including-your-own-logo-on-a-reel-is-ok/730852/
- **Originality and aggregators:** Apr 2024: accounts that repost others' content they haven't materially enhanced (reported as 10+ times in 30 days; that number comes from trade press, not Instagram) stop being recommended. Identical reposts get replaced by the original in recommendations. **[S]** https://petapixel.com/2024/04/30/instagrams-new-algorithm-punishes-copycats-rewards-original-creators. Apr 30, 2026: extended to photos and carousels. Watermarks or speed changes don't count as transformation. Text, edits or voiceover do. **[S]** https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/. (The brief said "2025". The actual dates are April 2024 and April 2026.)
- **Does posting the same original clip on all three hurt?** No primary source says Instagram or TikTok penalizes your own original video for also existing elsewhere. These rules target *other people's* content and *visible other-app watermarks*. The "no cross-platform duplicate detector" claim is a vendor blog **[W]**. TikTok's "reused material without anything new" rule is aimed at reuploads of others' work.
- **YouTube adds a watermark to Shorts downloaded from Studio** **[S]** https://techcrunch.com/2022/08/18/youtube-shorts-will-start-adding-watermarks-to-discourage-cross-platform-sharing/. TikTok's own saves carry a watermark too.
- **Rule for us:** render one clean master from our own pipeline (no app watermark, no TikTok/CapCut end card), upload natively to each app, and never re-download from one app to post on another. Native captions, cover and first text line can be adjusted per platform.

---

## 4. Captions, text, hashtags, search, timing, frequency, length

- **Hashtags (IG):** capped at 5 per post since about Dec 2025. Mosseri: hashtags help people know what a post is about and help search, but don't widen reach. **[S]** https://www.socialmediatoday.com/news/instagrams-implementing-new-limits-on-hashtag-use/808309/. Use 2-4 specific ones (#simracing #indiegame #ps1graphics), not 30.
- **TikTok:** captions, sounds and hashtags are "video information" signals **[P, 2020 explainer]**. Claims that on-screen text and spoken words are indexed for search are plausible and widely repeated, but I found no current primary TikTok doc **[W]**. Put the searchable phrase ("PS1 racing game", "draw your own race track") in the caption *and* say it on screen. Creator Rewards names "search value" as a factor **[S]**.
- **YouTube Shorts:** appear in YouTube search (help page) **[P]**. Titles are up to 100 characters. No primary doc on Shorts SEO weighting.
- **Captions / burned-in subtitles:** the much-quoted "80% more likely to finish with captions" or "69% watch muted" figures come from 2019 Verizon/Publicis surveys **[W]**. Peer-reviewed support is indirect. A 2024 TikTok news-video paper cites prior work that "close-up shots and texts on video predict video virality" and that subtitles increase sharing (secondary citations, unverified). The ECCV 2024 Snapchat study below found title, description and captions improved engagement prediction, while spoken transcripts didn't. For a narrated format, keep the on-screen text.
- **Posting time:** no platform says time-of-day is a ranking factor. All "best time to post" lists are vendor aggregates or creator surveys (e.g. Adobe's 507-creator survey said 6-8 pm) **[W]**. Check your own audience-activity panel in TikTok Studio and IG insights once you have data.
- **Frequency:** Mosseri says more posts generally mean more reach, as long as quality and sustainability hold. Post as much as you can without the quality slipping. **[S]** https://routenote.com/blog/how-often-you-should-post-on-instagram/ ; https://www.kontentino.com/q-and-a/how-many-reels-per-day/ (Aug 2026 Q&A, secondary)
- **Length vs completion:** platforms correct for duration. Kuaishou's D2Q paper shows raw watch time is confounded by video length. Optimizing raw watch time drifted their impressions toward long videos, so they deconfound it. **[P]** https://arxiv.org/abs/2206.06003 (2022). In practice, a 20-s clip and a 50-s clip are judged relative to their length class. Make each video as long as its content holds people, and cut padding. The JMIR 2021 study of government TikTok accounts found longer videos got fewer likes (IRR 0.19) and comments (IRR 0.39) **[P]** https://www.jmir.org/2021/2/e21463/. A 2025 finfluencer study found no duration effect. The evidence is mixed and depends on the niche.

---

## 5. Academic findings on short-video engagement

- **The first 5 s predict everything.** Li et al., ECCV 2024, 90k Snapchat UGC Shorts **[P]** https://arxiv.org/abs/2410.00289. Engagement continuation rate (ECR, the share of viewers who watch past 5 s) correlates r = 0.926 with normalized average watch percentage. Text metadata and background-sound class improved prediction. **Speech transcripts did not**, partly because viewers decide in the first seconds, before much is said. Video "quality" scores (MOS) correlated weakly with engagement. **Implication: the opening visual and on-screen text do the hooking. The narrator's first line supports them and can't carry the hook alone.**
- **Audio matters for engagement prediction.** Models that use audio beat vision-only models (VQualA/ICCV 2025 winner) **[P]** https://arxiv.org/html/2508.02516v2
- **Emotion trajectory:** Teixeira, Wedel and Pieters, *JMR* 2012: in online video ads, surprise *level* concentrates attention, and *increases* in joy (its velocity) keep viewers from skipping. They suggest a quick surprise up front, then rising joy. **[P]** https://deepblue.lib.umich.edu/bitstream/handle/2027.42/63678/teixeira_1.pdf
- **Branding:** Teixeira, Wedel and Pieters, *Marketing Science* 2010: a big central brand logo increases avoidance. Short repeated brand flashes ("pulsing") reduce zapping. **[P]** https://pubsonline.informs.org/doi/10.1287/mksc.1100.0567. Don't open on a title card. Show the game, and flash the logo or name briefly and more than once.
- **Faces:** the presence and size of a human face raise engagement in brand TikToks (*Journal of Consumer Marketing*) **[P, abstract only]** https://www.emerald.com/jcm/article-abstract/42/3/318/1247037. We're faceless, so a driver's helmet cam, pit crew or in-game characters are the closest substitute (untested assumption).
- **AI voice perception:** humans narrating audiobooks scored higher on enjoyment, imagery, attention and recall than synthetic voices (Rodero and Lucas, *New Media & Society*) **[P]** https://repositori.upf.edu/items/429bf74a-a7a1-4c8f-a261-d0d368bf7afe. Modern TTS matched human voices on credibility and learning in Craig and Schroeder 2017/2019, education research (ReadSpeaker's summary is a vendor source). Stern et al. 1999: synthetic speech was rated less favorably but didn't reduce persuasion. A good TTS voice is acceptable for information. It loses some warmth, which the effort-signalling above can offset.
- **Comment-driving:** I found no robust short-video study on question prompts. "Second-person view" in TikTok news videos (*SSCR* 2024, doi 10.1177/08944393231178603) is the closest; I couldn't read the full text.
- **Caveat on all audit studies:** TikTok audit findings go stale fast (SIGIR 2025 replication above).

---

## 6. Native A/B tools and fair testing at low view counts

- **Instagram Trial Reels** **[P]** https://creators.instagram.com/blog/instagram-trial-reels (2024-12-10). The reel goes to non-followers first and stays off the grid and the followers' feed (it can still appear via DMs, audio or location pages). Metrics (views, likes, comments, shares) arrive after about 24 h, alongside a comparison with your previous trials. There's an optional auto-share to followers "if it performs well based on views in the first 72 hours". Eligibility: "eligible creators", with a widely reported (unconfirmed) bar of a public professional account and 1,000+ followers **[S]**. **This is the only native non-follower test**, so use it once IG has 1k followers.
- **YouTube Test & Compare:** "A/B testing is not available for Shorts." **[P]** https://support.google.com/youtube/answer/13861714. It covers long-form titles and thumbnails only and picks the winner by watch-time share, not CTR. It's useful for a trailer or devlog.
- **TikTok:** no native creator A/B test found. Its Symphony and ads split tests are paid ads only.
- **Fair testing with few views:**
  - Change one variable at a time (hook line *or* first shot *or* length), keeping the same footage and the same posting weekday and hour.
  - Compare **ratios against impressions**, not raw views. On YT that's stayed-to-watch % and engaged views. On IG it's average watch time, sends/reach and likes/reach. On TikTok it's average watch time, % watched in full and shares/views.
  - Statistics: a proportion near 30% measured on 300 views has SE ≈ 2.6 pp. The SE of a difference between two such arms is ≈ 3.7 pp, so you can only reliably detect gaps of about **10+ percentage points** (80% power). Below about 300 viewers per arm, treat results as noise. Pool by hook *type* across several videos, e.g. 4 "question hooks" vs 4 "visual-surprise hooks". Don't read a verdict into any single pair.
  - The delivery itself isn't randomized: each post gets a different seed audience, and a Short can take off days later. Judge on a fixed window (e.g. 7 days) and re-check the same metric for both arms.
  - The seeded-test rule from AI work applies here too: decide the metric and the window *before* posting.

---

## Confidence summary
- High (primary): IG's top-3 signals and the sends-for-non-followers split; TikTok's completion = strong, follower count not a direct factor; YT's viewed-vs-swiped and engaged views; TikTok FYF ineligibility for unoriginal content and engagement manipulation; Meta's engagement-bait definition; YT AI disclosure doesn't limit reach; no Test & Compare for Shorts; Trial Reels mechanics; the first-5-s → retention link (ECCV 2024); AI disclosure lowers audience engagement about 7% (JCR 2026).
- Medium: the IG comment-keyword guidance (from a deleted Instagram clip, reported by SMT); the Trial Reels 1k-follower bar; the 10-reposts-in-30-days aggregator threshold.
- Low / guru: posting-time lists, "70-90%" swipe benchmarks, "3-5x sends" multipliers, caption-completion survey stats, ideal-length numbers, "AI labels don't hurt reach on TikTok".
