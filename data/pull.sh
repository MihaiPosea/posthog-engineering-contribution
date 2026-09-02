#!/bin/bash
# Full 90-day pull of MERGED PRs for PostHog/posthog, sliced one day at a time
# so GraphQL search never hits its 1000-result cap. Complete, no sampling.
set -uo pipefail
D="/Users/mihaiposea/Weave Takehome/data"
OUT="$D/prs.ndjson"; LOG="$D/pull.log"; DONEF="$D/days_done.txt"
touch "$DONEF"; [ -f "$OUT" ] || : > "$OUT"
START="2026-06-04"; DAYS=91

for i in $(seq 0 $((DAYS-1))); do
  DAY=$(date -j -v+${i}d -f "%Y-%m-%d" "$START" +%Y-%m-%d)
  grep -qx "$DAY" "$DONEF" && continue
  CURSOR=""; DAYTOTAL=0
  while true; do
    if [ -z "$CURSOR" ]; then AFTER="null"; else AFTER="\"$CURSOR\""; fi
    cat > "$D/q.graphql" <<EOF
query {
  rateLimit { remaining }
  search(query:"repo:PostHog/posthog is:pr is:merged merged:$DAY..$DAY", type:ISSUE, first:50, after:$AFTER) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number title createdAt mergedAt state isDraft
      additions deletions changedFiles
      author { login __typename }
      assignees(first:2) { nodes { login } }
      body
      commits(last:1) { nodes { commit { committedDate } } }
      reviews(first:20) { nodes { author { login __typename } state submittedAt comments { totalCount } } }
    } }
  }
}
EOF
    RESP=""
    for attempt in 1 2 3 4 5 6 7 8; do
      RESP=$(gh api graphql -F query=@"$D/q.graphql" 2>>"$LOG")
      if [ -n "$RESP" ] && echo "$RESP" | jq -e '.data.search.pageInfo' >/dev/null 2>&1; then break; fi
      echo "$DAY attempt $attempt failed" >> "$LOG"; sleep $((attempt*8)); RESP=""
    done
    [ -z "$RESP" ] && { echo "FATAL: $DAY gave up" >> "$LOG"; break; }

    echo "$RESP" | jq -c '.data.search.nodes[] | select(.number != null) | {
      n:.number, t:.title, ca:.createdAt, ma:.mergedAt, dr:.isDraft,
      add:.additions, del:.deletions, cf:.changedFiles,
      au:(.author.login // "ghost"), aut:(.author.__typename // "User"),
      asg:[.assignees.nodes[].login],
      lc:(.commits.nodes[0].commit.committedDate // null),
      auto:((.body // "") | if test("Autonomy[^\n]*Fully autonomous") and (test("Autonomy[^\n]*Human-driven")|not) then "autonomous"
                            elif test("Autonomy[^\n]*Human-driven") and (test("Autonomy[^\n]*Fully autonomous")|not) then "assisted"
                            elif test("Agent context") then "agent_unspecified" else "none" end),
      rv:[.reviews.nodes[] | {a:(.author.login // "ghost"), ty:(.author.__typename // "User"), s:.state, at:.submittedAt, ic:.comments.totalCount}]
    }' >> "$OUT"

    N=$(echo "$RESP" | jq '[.data.search.nodes[] | select(.number != null)] | length')
    CNT=$(echo "$RESP" | jq -r '.data.search.issueCount')
    DAYTOTAL=$((DAYTOTAL+N))
    HASNEXT=$(echo "$RESP" | jq -r '.data.search.pageInfo.hasNextPage')
    CURSOR=$(echo "$RESP" | jq -r '.data.search.pageInfo.endCursor')
    REM=$(echo "$RESP" | jq -r '.data.rateLimit.remaining')
    [ "$HASNEXT" != "true" ] && { echo "$DAY done got=$DAYTOTAL/$CNT rl=$REM" >> "$LOG"; break; }
    if [ "$REM" != "null" ] && [ "$REM" -lt 250 ] 2>/dev/null; then echo "throttle rl=$REM" >> "$LOG"; sleep 300; fi
  done
  echo "$DAY" >> "$DONEF"
done
echo "PULL COMPLETE rows=$(wc -l < "$OUT")" >> "$LOG"
