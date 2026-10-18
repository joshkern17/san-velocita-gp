---
name: marketing
description: Run San Velocita GP's head of marketing. Use when the dev types /marketing (optionally with a mode - run, review, research, week, or a free-form task), or asks what marketing is up to, what's in the review queue, or to make clips/posts/store copy.
---

# /marketing

The head of marketing is the `head-of-marketing` agent (`.claude/agents/head-of-marketing.md`). This command hands
it a run and relays what comes back. Its files live in `marketing/`.

## Modes (the argument after /marketing)
- **(none) / run**: the standing weekly run. Read the log and what shipped since last run, advance the next
  calendar items, make what's due, queue it, report.
- **review**: the dev is giving verdicts. Show each `marketing/queue/*/post.md` in turn (status, pillars, hooks,
  frame grabs via Read), take their verdict, and have the agent record it (TASTE.md, move the item, ledger).
  Do this one in the main session (it's a conversation), not in the background.
- **research**: refresh rival/niche listening and creator/curator lists; update STRATEGY.md's evidence if it moved.
- **week**: plan the next 7 days of posts (pillar pairs, formats, hooks) into CALENDAR.md, for the dev's glance.
- **anything else**: treat it as a task brief for the agent ("make a before/after clip of the Spa LiDAR build").
- **numbers**: the dev pastes stats; have the agent fill the ledger and say what it learned.

## How to run it
1. Launch the `head-of-marketing` agent in the background with: the mode, any brief, and today's date. It reads
   its own files; don't pre-read them into its prompt.
2. Tell the dev in one line that it's running, and carry on with whatever they're building.
3. When it reports back, relay it short: **ready** (what, where), **needs your eye** (each with its one question),
   **next**. Never claim something was posted; the agent prepares packages only.

## Guardrails (also in the agent file)
Never posts, messages, uploads, signs up or spends. Reddit is always posted by the dev by hand. Stages only its own
files; the dev often has uncommitted game work in progress.
