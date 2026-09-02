# dashboard_data.json — FROZEN CONTRACT (v2)

The dashboard is 100% client-side. It loads this ONE file and re-weights in the browser.
No API calls at runtime. Build the UI against the mock; the real file drops in unchanged.

```jsonc
{
  "meta": {
    "repo": "PostHog/posthog",
    "window_start": "2026-06-04", "window_end": "2026-09-02",
    "merged_prs": 13802,          // total merged PRs analyzed
    "bot_authored_prs": 2140,     // reattributed to human DRI via assignee
    "unattributed_prs": 890,      // fully autonomous, no assignee -> excluded from people
    "human_reviews": 18400, "bot_reviews": 24100,   // bot reviews are FILTERED OUT of scoring
    "eligible_engineers": 180, "generated_at": "2026-09-02T18:00:00Z"
  },

  // Ordered exactly as the slider stack renders, top to bottom.
  "dimensions": [
    { "key": "feature",     "label": "Feature Delivery", "default_weight": 3,
      "blurb": "New capability shipped, weighted by how central the code is.",
      "formula": "Σ W(pr) over merged feat PRs where DRI = engineer" },
    { "key": "reliability", "label": "Reliability",      "default_weight": 3, "blurb": "...", "formula": "..." },
    { "key": "leverage",    "label": "Review Leverage",  "default_weight": 3, "blurb": "...", "formula": "..." },
    { "key": "depth",       "label": "Review Depth",     "default_weight": 3, "blurb": "...", "formula": "..." },
    { "key": "ownership",   "label": "Ownership & Bus Factor", "default_weight": 3, "blurb": "...", "formula": "..." },
    { "key": "agent",       "label": "Agent Leverage",   "default_weight": 3, "blurb": "...", "formula": "..." }
  ],

  "presets": {
    "Balanced":         { "feature":3,"reliability":3,"leverage":3,"depth":3,"ownership":3,"agent":3 },
    "Ship features":    { "feature":5,"reliability":2,"leverage":2,"depth":1,"ownership":2,"agent":3 },
    "Stability first":  { "feature":1,"reliability":5,"leverage":3,"depth":4,"ownership":3,"agent":2 },
    "Force multipliers":{ "feature":1,"reliability":2,"leverage":5,"depth":5,"ownership":2,"agent":2 },
    "Key-person risk":  { "feature":3,"reliability":3,"leverage":1,"depth":1,"ownership":5,"agent":1 }
  },

  "engineers": [
    {
      "login": "example-dev",
      "avatar": "https://avatars.githubusercontent.com/u/123?v=4",
      "profile": "https://github.com/example-dev",

      // ---- SCORING: dashboard computes Score = sum(w*norm)/sum(w) from `norm` ----
      "norm": { "feature":91.2,"reliability":74.0,"leverage":88.5,"depth":95.1,"ownership":62.3,"agent":70.8 },
      "raw":  { "feature":48.3,"reliability":22.1,"leverage":41.7,"depth":180.4,"ownership":9.2,"agent":33.5 },

      // ---- EVIDENCE: every number on screen must be traceable to these ----
      "stats": {
        "merged_prs": 74, "feat_prs": 31, "fix_prs": 22, "perf_prs": 4, "chore_prs": 17,
        "reviews_given": 96, "distinct_authors_unblocked": 34,
        "median_review_latency_h": 3.1, "median_cycle_time_h": 18.4,
        "review_followup_rate": 0.71,        // % of their reviews followed by new commits
        "churn_rate": 0.14, "median_churn_rate": 0.19,   // theirs vs cohort median
        "reverts": 0,
        "agent_assisted_prs": 40, "agent_autonomous_prs": 6, "agent_share": 0.62,
        "top_scopes": [ {"scope":"error-tracking","prs":22,"share":0.41,"centrality":38} ],
        "key_person_flags": [ {"scope":"replay-vision","share":0.61,"contributors":3} ]
      },

      // ---- Human-readable "why", 2-3 bullets, pre-generated ----
      "why": [
        "Unblocked 34 different engineers with 96 human reviews at a 3.1h median response.",
        "71% of their reviews were followed by new commits - review that changes code, not rubber stamps."
      ],

      // ---- Spot-check links: real PRs backing the headline claims ----
      "evidence_prs": [
        { "n":92841, "title":"feat(error-tracking): ...", "type":"feat", "scope":"error-tracking",
          "url":"https://github.com/PostHog/posthog/pull/92841", "merged":"2026-08-14",
          "w":1.82, "why":"highest-centrality feature shipped" }
      ]
    }
  ]
}
```

## Rules for the frontend
1. **Never** call the GitHub API at runtime. Everything is in this file.
2. Score is computed in-browser from `norm` + slider weights. Re-sort must be instant (no refetch).
3. Every displayed number must be clickable/hoverable to its `formula` + `raw` + `evidence_prs`.
   Explicit red flag in the brief: "Score: 207 with no way to understand how it was calculated."
4. Must fit ONE laptop screen (~1440x900) without vertical scroll for the top-5 view.
5. Sliders are ONE stack, in `dimensions` order. Per-work-type weights go in a collapsed "Advanced".


---
## v2 CHANGES (read this if you started on v1)
- **7 dimensions, not 6.** Added `blast` (Blast Radius) in position 3. Order in `dimensions[]` IS the slider order.
- **6 presets, not 5.** Added `Platform`.
- The composite is called **"Contribution Score"** — never "Impact Score". `meta.score_name` carries it.
- `meta.counter_metrics` added: revert %, PR line p50/p90. Render as a small context strip, NOT scored.
- Each engineer has `archetype` (Tech Lead / Solver / Architect / Generalist) — a profile label, not a rank.
- `stats.Q` = the churn-quality factor, exposed so the reliability number is inspectable.

## Non-negotiables from the assignment brief
- Fits ONE laptop screen (1440x900), no vertical scroll for the top-5 view.
- Loads in <10s. Single static JSON, no runtime API calls.
- EVERY number must be traceable: hover/click reveals `formula` + `raw` + `evidence_prs`.
  Named red flag: "Score: 207 with no additional context."
- Answers "who are the most impactful engineers at PostHog" on arrival, before any interaction.
