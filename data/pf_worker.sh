#!/bin/bash
# worker $1 = offset, $2 = stride  — day-sliced file pull, own output shard
set -uo pipefail
D="/Users/mihaiposea/Weave Takehome/data"
OFF=$1; STRIDE=$2
OUT="$D/files_$OFF.ndjson"; LOG="$D/files.log"
: > "$OUT"
for i in $(seq $OFF $STRIDE 90); do
  DAY=$(date -j -v+${i}d -f "%Y-%m-%d" "2026-06-04" +%Y-%m-%d)
  CURSOR=""
  while true; do
    if [ -z "$CURSOR" ]; then AFTER="null"; else AFTER="\"$CURSOR\""; fi
    cat > "$D/qf_$OFF.graphql" <<EOF
query {
  search(query:"repo:PostHog/posthog is:pr is:merged merged:$DAY..$DAY", type:ISSUE, first:100, after:$AFTER) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { number files(first:20){ totalCount nodes { path additions deletions } } } }
  }
}
EOF
    RESP=""
    for a in 1 2 3 4 5 6; do
      RESP=$(gh api graphql -F query=@"$D/qf_$OFF.graphql" 2>>"$LOG")
      echo "$RESP" | jq -e '.data.search.pageInfo' >/dev/null 2>&1 && break
      sleep $((a*6)); RESP=""
    done
    [ -z "$RESP" ] && { echo "w$OFF FAIL $DAY" >> "$LOG"; break; }
    echo "$RESP" | jq -c '.data.search.nodes[] | select(.number != null) | {n:.number, ftc:(.files.totalCount // 0), f:[.files.nodes[]? | {p:.path,a:.additions,d:.deletions}]}' >> "$OUT"
    [ "$(echo "$RESP" | jq -r '.data.search.pageInfo.hasNextPage')" != "true" ] && break
    CURSOR=$(echo "$RESP" | jq -r '.data.search.pageInfo.endCursor')
  done
  echo "w$OFF $DAY done" >> "$LOG"
done
echo "w$OFF COMPLETE $(wc -l < "$OUT")" >> "$LOG"
