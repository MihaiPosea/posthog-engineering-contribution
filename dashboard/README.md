# Engineering Contribution dashboard

Static, single-page, 100% client-side. No GitHub API calls at runtime, no build tooling.

    ./build.sh                          # data payload from ../dashboard_data.mock.json
    ./build.sh ../dashboard_data.json   # …from the real file when the pull finishes
    python3 -m http.server 8777         # then open http://localhost:8777

`build.sh` writes two copies of the payload: `dashboard_data.json` (fetched when served over
http) and `data.js` (embedded fallback so the page also works opened straight from disk).
Nothing else needs to change when the real data lands — the UI reads its dimension order,
labels, formulas, presets and score name out of the JSON.

    index.html     layout shell
    styles.css     dark theme, 1440x900 with no page scroll
    app.js         scoring, leaderboard, detail panel, Recharts radar
    vendor/        react, react-dom, prop-types, recharts (UMD, vendored — no CDN at runtime)

## Interaction
- **Weighting** button → presets + seven sliders. Re-sorts instantly; cards animate to their new rank.
- Click a leaderboard row (or a "next up" chip, or ↑/↓) to load that engineer on the right.
- Hover any number for its formula, raw value and cohort context. The score itself shows its arithmetic.
- **Method** for attribution, per-PR weighting, all seven formulas, presets, and the caveats.
