# PostHog Engineering Impact — Weave takehome

**Dashboard:** https://posthog-contribution.vercel.app · **Repo analysed:** PostHog/posthog · **Window:** 2026-06-04 → 2026-09-02 (90 days)

## What I mean by "impact"

Counting PRs at PostHog would be actively misleading: a large share of merged PRs are agent-authored, and
the top engineer by raw count has **1,472 fully autonomous agent PRs** merged under their account. Any
count-based metric crowns whoever runs the biggest agent fleet.

So the model scores **seven things a leader actually acts on**, and every one of them consumes a
*weighted* PR rather than a count:

| | Dimension | What it asks |
|---|---|---|
| 1 | Feature Delivery | New capability shipped, weighted by how load-bearing the code is |
| 2 | Reliability | Fix/perf work, scaled by whether their own features stayed fixed |
| 3 | Blast Radius | How much of the widely-shared code they operate across |
| 4 | Review Leverage | How many *different* engineers they unblock, and how fast |
| 5 | Review Depth | Whether their reviews actually changed the code |
| 6 | Ownership & Bus Factor | Whether they hold a critical area — two-signed: value and risk |
| 7 | Agent Leverage | Volume shipped through agents *that held up* |

**Per-PR weight** `W = C × A × S`. `C` centrality (0.6–2.0) from κ, the number of distinct engineers
shipping into that directory; `A` autonomy (1.0 human-driven or agent-assisted, 0.5 fully autonomous);
`S` size, log-scaled on effective lines with generated files stripped, capped at 1.4 and taking a 30%
haircut above 1,500 lines — PostHog's own p90, past which they say review quality drops. A PR into load-bearing code counts
for more than the same diff in a quiet corner — this is what stops "Feature Delivery" collapsing into a PR count.

**Attribution.** DRI = first assignee, falling back to author. PostHog's own PR template asks the directing
human to be the assignee, so agent-authored PRs still credit the engineer who drove them. Of 1,116
bot-authored PRs, **231 carried a human assignee and were re-credited**; the other 885 had none and are
excluded from person scoring entirely. All 28,850 bot reviews are dropped; only the 30,257 human reviews score.

**Scoring.** Each raw dimension becomes a **percentile rank inside the eligible cohort** (139 engineers with
≥5 merged PRs or ≥10 human reviews) — percentile, not z-score, because the distributions are heavily
right-skewed. The composite is `Contribution Score = Σ(w·pctl) ÷ Σ(w)`, w ∈ [0,5], computed in the browser.

## Why it's interactive

There is no single right answer to "what is impact", so the seven weights are the interface. Six presets
(Ship features, Stability first, Platform, Force multipliers, Key-person risk, Balanced) re-rank instantly.
The point isn't the default ranking — it's that a leader can ask *their* question and see who surfaces.

## Findings — top 5 under Balanced weights

| # | Engineer | Score | The short version |
|---|---|---|---|
| 1 | **pauldambra** | 95.8 | Top or near-top on six of seven. 141 features and 170 fixes, unblocked 43 engineers across 149 reviews at a **1.2h** median first response. |
| 2 | **Gilbert09** | 94.4 | 100th percentile on Feature Delivery, Reliability and Agent Leverage. Rework rate **50% vs 80% cohort median** — the strongest quality signal in the cohort, at the largest volume. |
| 3 | **andrewm4894** | 94.0 | 100th percentile Review Leverage: 354 reviews across 46 engineers at 2.9h, **66%** of them followed by new commits. |
| 4 | **rnegron** | 93.7 | 98.6th-percentile blast radius on the fewest features of the five (63) — a platform profile, not a shipping one. |
| 5 | **skoob13** | 92.3 | The only top-5 with Review Depth in the 96th percentile: reviews that materially change code. |

Every number on screen is traceable — hover any figure for its formula, raw value and cohort context; the
score itself shows its own arithmetic; each engineer links four real PRs backing the headline claims.

## Honest caveats (also surfaced in the UI)

- **Rework rate is a proxy.** A fix touching a file this feature changed within 14 days is not proof of a
  regression. Reverts are the hard signal (repo-wide revert rate 0.08%) and both are shown.
- **Ownership is two-signed** — it rewards holding a critical area and flags the continuity risk of it.
- **File lists are capped at 20 per PR** by the API pull; very large PRs are approximated from API totals.
- Work that never becomes a PR — design, incident response, mentoring — is invisible to any repo-derived
  model, this one included.

## Stack

Static single page: vanilla JS + Recharts (radar), no backend, no runtime API calls. One 336KB JSON payload,
computed once by `aggregate.py` from 14,546 merged PRs and their file lists pulled via the GitHub GraphQL API.
Loads in ~1s.

    data/pull.sh + pull_files.sh   GraphQL pull, day-sharded, resumable
    aggregate.py                   all scoring constants live here -> dashboard_data.json
    dashboard/                     the page (index.html, app.js, styles.css, vendored deps)

**Time:** see the timer note at the end of `CHAT_LOG.md`.

**Agent session export:** `sessions/` — two parallel Claude Code sessions (`01` analysis/data/formula,
`02` frontend/UI) plus research subagents. `CHAT_LOG.md` is the human-readable narrative of session 01.
