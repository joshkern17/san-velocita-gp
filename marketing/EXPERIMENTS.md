# Experiments

Pre-registered tests: each question, its variants, the metric and the stopping rule are written down **before** the
first post, so nobody (dev or head of marketing) can pick a favorite after seeing the numbers (STRATEGY §0). Score them
with `python3 marketing/abtest.py marketing/ledger.csv`.

## How every test runs
- **Assign across videos, not duplicates.** TikTok removes reused material from the For You feed, so we don't post the
  same video twice with one change.
  - Each new video is assigned an arm of the running test by coin flip (logged in the ledger).
  - Results pool across many videos and topics.
  - Topic noise averages out; the arm is the only thing assigned at random.
- **One variable per test.** Everything else follows the template.
- **Same slot.** Every post goes out in the same evening slot, so time of day isn't a variable.
- **Rates, not views.** Read 7 days after posting, never sooner:
  1. **Hold:** YouTube `engagedViews / views`; Instagram `1 - reels_skip_rate`; TikTok "viewed vs swiped".
  2. **Completion:** % watched to the end (Instagram/YouTube: average % viewed).
  3. **Sends per 1k reach:** Instagram DM shares, TikTok shares.
  4. **Comments per 1k views.**
  5. **AI-accusation comments:** count of comments calling it AI or slop (only for E1).
- **Scoring:** a Bayesian beta-binomial per arm on the hold rate.
  - Each post's viewers are capped at 500 (views within one post move together).
  - P(arm beats the other) comes from 20k draws.
- **Stopping rule:**
  - An arm **wins** at P > 0.95 with at least 6 posts per arm.
  - At 12 posts per arm with no winner it's a **tie**: keep the cheaper arm.
  - A **guardrail** stops a test early: if an arm draws AI-accusation comments on 2 or more posts, it pauses for the
    dev's call.
- **Small numbers warning:** ~300 viewers per arm can only show gaps of 10+ points. Early weeks will mostly end in ties,
  and that's fine. The tests get sharper as the account grows.

## E1 · Voice (first test, starts with the first post)
- **Decided 2026-10-22 (dev):**
  - **"I made a game where…" (V06) is always the dev's own voice,** never tested against AI. The sincerity is the
    point, and an AI voice saying "I" would read as a lie if found out.
- **The test covers the feature explainers only:**
  - **A, Narrator 001 with the AI label on** (platform label, plus a caption line and the bio line in DISCLOSURE.md).
  - **B, text and engine sound only.** No narration. The script's lines become on-screen captions, and the engines
    carry the sound.
  Both arms can be made without the dev, so whichever wins keeps the explainers automated.
- **Why first:** player backlash against AI voices is the biggest risk found (PLAYBOOK §3). This measures what the
  label actually costs.
- **Metric:** hold first, then completion; the AI-accusation guardrail.
- **Needs:** the 7 finished explainers already are arm A. Arm B versions are cut from the same edits.
  - Each video is posted in only one arm, so nothing goes up twice (TikTok's reused-content rule).

## E2 · Hook type (starts after E1 picks a voice)
- **Question:** which first-second hook holds best?
- **Arms:**
  - **A, claim:** "Nobody recorded these engines."
  - **B, number:** "Thirty-five degrees."
  - **C, "I made a game where…":** the premise as on-screen text.
- **Metric:** hold.

## E3 · Closing question (runs alongside E2)
- **Question:** does an open question at the end raise comments without costing completion?
- **Arms:**
  - **A:** the video ends on an open question ("Which track should I scan next?").
  - **B:** the video ends on the end card only, with the question in the pinned comment.
- **Metric:** comments per 1k views; completion as the guardrail.
- **Rule:** never "comment X". Open questions only (PLAYBOOK §2).

## E4 · Length (later)
- **Question:** does a 25 s cut beat a 45 s cut of the same explainer?
- **Arms:** a 25 s cut vs a 45 s cut, each a real edit of different footage, never one trimmed version of the other.
- **Metric:** completion and hold together.

## E5 · Search phrase (later, TikTok and Shorts)
- **Question:** does "PS1 racing game" in the caption and on-screen text bring more search traffic?
- **Arms:** with the phrase vs without.
- **Metric:** % of views from search (TikTok traffic sources; YouTube traffic source report).

## E6 · Playtest keyword DM (Instagram only, starts with the Steam Playtest)
- **Question:** does a keyword-to-DM playtest offer cost reach to non-followers on Instagram?
- **Arms:**
  - **A:** the video ends with "Comment PLAYTEST and I'll DM you the link."
    - An official-API automation DMs **anyone** who comments; no follow is required.
    - The DM links to the Steam page, where Join the Playtest and Wishlist sit together.
  - **B:** the same weekly mix with an open question, and "playtest link in bio".
- **Metric:**
  - **Primary:** the share of reach from non-followers (Instagram insights) and hold.
  - **Also read:** comments per 1k views, playtest sign-ups, and Steam clicks from the DM link (its own UTM).
- **Stopping rule:** the standard one, plus a **guardrail**. If arm A's non-follower reach share falls 20+ points
  below arm B's over 4 posts, stop A.
- **Never:** follow-gating, or asking for likes or shares in exchange for a key. Never on TikTok; there the keyword
  becomes an open question plus "playtest link in bio".
- **Needs:**
  - the Steamworks app (tax review);
  - a packaged desktop build with Steam Playtest set up (CALENDAR 1.1-1.2);
  - a build the dev is happy for strangers to play;
  - a comment-to-DM tool on the official API. ManyChat's free tier is one, but read its terms first.

## Results
| Test | Started | Posts A / B / C | P(best) | Result | Decision |
|---|---|---|---|---|---|
| E1 voice | not started | | | | |
