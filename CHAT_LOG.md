# Weave Engineering Impact Dashboard — Session Chat Log

Running transcript of every prompt/response in this build. Appended after each exchange.
Repo under analysis: https://github.com/PostHog/posthog
Started: 2026-09-02

---

## [1] User

> ok so I am working on a takehome assignment for https://weaveos.com/ Engineering Impact Dashboard Assignment
>
> **Overview**
> Welcome! At Weave, we help engineering teams understand their productivity and impact. For this assignment, you'll analyze real GitHub data to identify impactful engineers.
>
> **The Task**
> PostHog is a popular open-source company. Using the PostHog GitHub repository, create an analysis and dashboard that identifies the most impactful engineers.
>
> Every engineer knows that counting lines of code, commits, reviews, etc. does not define someone's impact. Think carefully about how you can meaningfully capture an engineer's contributions. This is the single thing we care the most about for this challenge. An ugly UI with creative analysis is better than a beautiful UI with a simple metric based on lines of code, number of commits, files changed, etc.
>
> The expected audience is a busy engineering leader on the PostHog team. Assume they understand the basics of what people do but they aren't in the weeds enough to read every line of code or PR description.
>
> The end result should fit onto a single page on a laptop screen.
>
> Your job:
> - Define what "impact" means for software engineers (there's no one right answer!)
> - Gather relevant data from the PostHog repo. Make sure to include all data from at least the last 90 days.
> - Analyze the data
> - Create an interactive dashboard showing who the top 5 most impactful engineers are and why
> - Host it somewhere we can view it
>
> Time limit: 1 hour 30 minutes. Start a timer when you begin, stop it when you finish, and report that time.
>
> Tech stack: Whatever you want
>
> **What to Submit** — Please submit with the button at the bottom of this page. You'll need: your dashboard URL, a short description of your approach, how long it took you (straight from the timer), an export of your coding agent sessions.
>
> **Evaluation Criteria** — Thoughtfulness (Can we understand it at a glance? Can we validate the findings?), Technical execution (Does it work? Is it clear?), Communication (Is your approach and reasoning clear?), Pragmatism (Did you scope appropriately for 1.5 hours?)
>
> **Red flags** — Link not accessible or doesn't load; Incorrect, incomplete or missing data; Buggy or broken UI; >10s to load; Does not answer the question "who are the most impactful engineers at PostHog"; Shows numbers with no way to understand how they were calculated (e.g. "Score: 207" with no additional context or vague description)
>
> ...with this being the exact repo we need to work with https://github.com/PostHog/posthog, I want you to create another file that records all of these chats we are having (including this one), tell me if you understand dont go any further

## [1] Claude

Confirmed understanding of the assignment. Created this chat log at `/Users/mihaiposea/Weave Takehome/CHAT_LOG.md` and will append every subsequent exchange. No analysis, data gathering, or dashboard work started yet — waiting for the go-ahead.

Key constraints noted:
- Impact definition must go beyond LOC/commit/review counts — this is the primary evaluation axis
- ≥90 days of PostHog repo data, complete and correct
- Single-page interactive dashboard, top 5 engineers with "why", loads in <10s, hosted publicly
- Every displayed number must be traceable to its calculation
- 1h30m timer, self-reported

---

## [2] User

> do you see my take home project for weave?

## [2] Claude

Located `/Users/mihaiposea/Weave Takehome`. Reported status: assignment recorded in `CHAT_LOG.md`; `SCHEMA.md` freezing the `dashboard_data.json` contract; `dashboard_data.mock.json` for building the UI ahead of real data; `FORMULA.tex` / `formula_render.html` holding the scoring math; and `data/pull.sh` mid-run — day-by-day GraphQL pull of PostHog merged PRs, at 2026-08-10 of 2026-09-02, 10,749 PRs in `prs.ndjson`, with `chain.sh` waiting to auto-start the file-level pass. No frontend built yet.

---

## [3] User

> Build the dashboard at /Users/mihaiposea/Weave Takehome/dashboard/. Read SCHEMA.md (v2) and build against dashboard_data.mock.json — same shape, real data drops in later. Do not call the GitHub API (shared rate limit with a running data pull) and do not touch data/. 7 sliders in dimensions[] order, 6 presets, composite is called Contribution Score. One laptop screen, no vertical scroll, every number traceable to its formula + evidence PRs on hover/click. also recird all prompts I give you and update the md file please, do it in the proper order

## [3] Claude

Re-read `SCHEMA.md` (v2) and the mock. Confirmed against the data rather than assuming: 7 dimensions in order `feature, reliability, blast, leverage, depth, ownership, agent`; 6 presets including `Platform`; `meta.score_name` = "Contribution Score"; `meta.counter_metrics` (revert %, PR line p50/p90) to be rendered as unscored context; per-engineer `archetype` and `stats.Q` present. Noted that `FORMULA.tex` is still v1 (6 dimensions, blast as a multiplier) — the frontend therefore reads all formula and blurb text from `dimensions[]` in the JSON rather than hardcoding it, so the real file drops in without a UI edit.

Built `dashboard/` as a static, zero-runtime-API page. No GitHub calls, no writes to `data/`.

---

## [4] User

> this is the ugliest thing ive ever seen [screenshot of the light-mode dashboard] there is too much going on a leader will never read all of this, first off go dark mode only for this, I want you to look at this repo for components: recharts , I want the the settings to be on click not the first thing someone sees, I want the leaderbaord on the left, I like the ability to click on hem and see their data on the right, thats good, [screenshot of the meta chip row] remove this crap, remove mock data, how is this scored should be shown by hovering over the score or have a less ugly button somewhere

## [4] Claude

Rebuilt the page against this direction:
- **Dark only.** New palette, seven dimension hues re-tuned for a dark ground.
- **Recharts**, vendored locally (`vendor/react.js`, `react-dom.js`, `prop-types.js`, `recharts.js`) so the hosted page has no CDN dependency and nothing to fail on load. A `RadarChart` in the detail panel plots the engineer's seven percentiles against a dashed cohort-median ring. Recharts' UMD build needs a `PropTypes` global — that was the one integration bug, caught from the console, not assumed.
- **Weights behind a click.** The slider stack and presets moved into a popover on a `Weighting: Balanced` button; the page now opens on the answer, not on the controls.
- **Leaderboard left, evidence right**, keeping click-to-inspect.
- **Meta chip row deleted**; those numbers (PRs analysed, bot re-attribution, bot reviews filtered, eligibility) moved into the Method modal where they belong. MOCK pill deleted.
- **Score explains itself on hover** — the big number in both the card and the detail header carries the full `Σ(w × pctl) ÷ Σw` arithmetic; the `Method` button holds the long form.

Two real bugs fixed on the way, both found by testing rather than by reading the code: the weight sliders were being re-rendered on every `input` event, which would have killed any live drag; and the method modal's `[hidden]` was overridden by `display:flex`, so it rendered open on load.

---

## [5] User

> [screenshot of the header sub-line] remove this

## [5] Claude

Removed the "rossgray, mariusandra, … — ranked by Contribution Score over …" sub-line and its render path. The leaderboard already names them.

---

## [6] User

> Who is having the most impact at PostHog? remove this as well wth

## [6] Claude

Removed the page title too. The header is now a single slim row holding only the `Weighting` and `Method` buttons; the reclaimed vertical space goes to the two panels.
