# Coding agent session exports

Two Claude Code sessions ran in parallel on this takehome, plus research subagents.

| File | Session | Role |
|---|---|---|
| `01-analysis-agent_data-formula-verification.jsonl` | `c49626f2` | Repo recon, impact model design, GitHub data pull (2 passes, 14,546 PRs), aggregation, end-to-end verification |
| `02-frontend-agent_dashboard-ui.jsonl` | `b933ad94` | Dashboard UI built against the frozen `SCHEMA.md` contract |
| `subagents/*.jsonl` | — | Research subagents: engineering-productivity literature (DORA/SPACE/DX Core 4, critiques) and PostHog's own handbook/leadership statements |

The two sessions were deliberately decoupled by freezing `SCHEMA.md` + `dashboard_data.mock.json`
as a data contract, so the UI could be built while the 90-day data pull was still running.

`../CHAT_LOG.md` is the human-readable prompt-by-prompt narrative of session 01.
