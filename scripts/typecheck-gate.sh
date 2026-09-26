#!/usr/bin/env bash
#
# Fail when the typecheck gets WORSE. Not when it is imperfect.
#
#   ./scripts/typecheck-gate.sh          check against the baseline
#   ./scripts/typecheck-gate.sh --update rewrite the baseline (after fixing some)
#
# THE PROBLEM THIS SOLVES. `npm run typecheck` reports 40 errors, all of them
# in budget/ and calendar/ and all of them older than this gate. Failing the
# build on those means a red build on day one, and a team that learns to
# ignore the colour — at which point the check is worse than not having one,
# because it looks like coverage.
#
# So the gate is on the DELTA. Errors in the baseline are tolerated; a new
# one, anywhere, fails. That is the question anyone actually cares about:
# did this change make it worse?
#
# It earns its keep. On 26 September a regeneration of the Supabase types
# dropped the count from 81 to 42, and the two that remained were real: a
# kiosk parent slip printing a blank service and date, and an RPC called with
# an argument it does not take. Both were invisible while 39 stale-type
# errors sat in front of them.
#
# HOW IT COMPARES. By file and error code, not by line and column — line
# numbers move every time anyone edits above them, and a gate that cries wolf
# on an unrelated edit gets switched off within a week. The consequence,
# stated plainly: a NEW error of an ALREADY-BASELINED code in an
# ALREADY-BASELINED file slips through. Given that all 40 live in two
# directories nobody is working in, that is an acceptable blind spot and not
# a permanent one — shrink the baseline and it shrinks too.

set -uo pipefail
cd "$(dirname "$0")/.."

BASELINE="scripts/typecheck-baseline.txt"
CURRENT="$(mktemp)"
trap 'rm -f "$CURRENT"' EXIT

npm run --silent typecheck 2>&1 \
  | grep -oE '^[^(]+\([0-9]+,[0-9]+\): error TS[0-9]+' \
  | sed -E 's/\([0-9]+,[0-9]+\): error /|/' \
  | sort | uniq -c | awk '{print $2" "$1}' | sort > "$CURRENT"

total() { awk '{s+=$2} END {print s+0}' "$1"; }

if [ "${1:-}" = "--update" ]; then
  cp "$CURRENT" "$BASELINE"
  echo "baseline updated: $(total "$BASELINE") errors across $(wc -l < "$BASELINE" | tr -d ' ') file/code pairs"
  exit 0
fi

if [ ! -f "$BASELINE" ]; then
  echo "no baseline at $BASELINE — create one with: $0 --update" >&2
  exit 2
fi

worse=0
while read -r pair count; do
  was=$(awk -v p="$pair" '$1==p {print $2}' "$BASELINE")
  was=${was:-0}
  if [ "$count" -gt "$was" ]; then
    echo "WORSE  ${pair%|*}  ${pair#*|}  ${was} -> ${count}"
    worse=1
  fi
done < "$CURRENT"

now=$(total "$CURRENT"); then_=$(total "$BASELINE")

if [ "$worse" = 1 ]; then
  echo
  echo "The typecheck got worse. Fix it, or if the new error is genuinely"
  echo "acceptable, run ./scripts/typecheck-gate.sh --update and say why in"
  echo "the commit message."
  exit 1
fi

if [ "$now" -lt "$then_" ]; then
  echo "typecheck improved: $then_ -> $now errors. Run --update to lock it in."
else
  echo "typecheck unchanged: $now known errors, none new."
fi
