#!/bin/bash
# PASS 2: per-PR file paths (+ per-file line counts) for merged PRs in window.
# Needed for (a) per-file/dir centrality and (b) excluding generated files from size.
set -uo pipefail
D="/Users/mihaiposea/Weave Takehome/data"
OUT="$D/files.ndjson"; LOG="$D/files.log"; DONEF="$D/files_done.txt"
touch "$DONEF"; [ -f "$OUT" ] || : > "$OUT"
START="2026-06-04"; DAYS=91
for i in $(seq 0 $((DAYS-1))); do
  DAY=$(date -j -v+${i}d -f "%Y-%m-%d" "$START" +%Y-%m-%d)
  grep -qx "$DAY" "$DONEF" && continue
  CURSOR=""
  while true; do
    if [ -z "$CURSOR" ]; then AFTER="null"; else AFTER="\"$CURSOR\""; fi
    cat > "$D/qf.graphql" <<EOF
query {
  rateLimit { remaining }
  search(query:"repo:PostHog/posthog is:pr is:merged merged:$DAY..$DAY", type:ISSUE, first:100, after:$AFTER) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number
      files(first:20) { totalCount nodes { path additions deletions } }
    } }
  }
}
EOF
    RESP=""
    for attempt in 1 2 3 4 5 6 7 8; do
      RESP=$(gh api graphql -F query=@"$D/qf.graphql" 2>>"$LOG")
      if [ -n "$RESP" ] && echo "$RESP" | jq -e '.data.search.pageInfo' >/dev/null 2>&1; then break; fi
      echo "$DAY attempt $attempt failed" >> "$LOG"; sleep $((attempt*8)); RESP=""
    done
    [ -z "$RESP" ] && { echo "FATAL $DAY" >> "$LOG"; break; }
    echo "$RESP" | jq -c '.data.search.nodes[] | select(.number != null) | {
      n:.number, ftc:(.files.totalCount // 0),
      f:[.files.nodes[]? | {p:.path, a:.additions, d:.deletions}]
    }' >> "$OUT"
    HASNEXT=$(echo "$RESP" | jq -r '.data.search.pageInfo.hasNextPage')
    CURSOR=$(echo "$RESP" | jq -r '.data.search.pageInfo.endCursor')
    REM=$(echo "$RESP" | jq -r '.data.rateLimit.remaining')
    [ "$HASNEXT" != "true" ] && { echo "$DAY done rl=$REM" >> "$LOG"; break; }
    if [ "$REM" != "null" ] && [ "$REM" -lt 300 ] 2>/dev/null; then echo "throttle rl=$REM" >> "$LOG"; sleep 300; fi
  done
  echo "$DAY" >> "$DONEF"
done
echo "FILES PASS COMPLETE rows=$(wc -l < "$OUT")" >> "$LOG"
