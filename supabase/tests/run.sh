#!/usr/bin/env bash
#
# Run the SQL assertions against a real database, inside a transaction that is
# always rolled back.
#
#   ./supabase/tests/run.sh                      every test, against production as it stands
#   ./supabase/tests/run.sh one_row_per_child    tests whose name contains this
#   ./supabase/tests/run.sh --replay <name>      apply the migration first, then assert
#   ./supabase/tests/run.sh --negative <name>    break the migration, require a failure
#
# TWO MODES, BECAUSE THEY ARE TWO DIFFERENT QUESTIONS.
#
#   default   "does production still behave the way we said it would?"
#             The assertions run against the schema as deployed. This is the
#             regression suite. Run it after a deploy, or when something is
#             behaving oddly and you want to know what changed.
#
#   --replay  "is this migration safe to push?"
#             BEGIN, the migration, the assertions, ROLLBACK. This is the mode
#             every one of these assertions was originally written in, and the
#             mode to use on the migration you are about to push.
#
# Replaying a SUPERSEDED migration is not a useful test and will usually fail
# on a collision - a later migration added an overload, widened a constraint,
# or changed a return type. That is the tree working as intended, not a bug.
# Running the whole suite in --replay mode is therefore not a thing to do.
#
# WHY THIS RUNS AGAINST PRODUCTION. `supabase db reset` does not replay this
# migration tree, so there is no scratch database to build. What there is, is
# a transaction: this composes one file and sends it as a single statement,
# and nothing it does outlives the call. It refuses to send a file that does
# not end in a rollback.
#
# REQUIRES: supabase CLI, logged in, project linked.

set -uo pipefail
cd "$(dirname "$0")/../.."

TESTS="supabase/tests"
MIGRATIONS="supabase/migrations"
PATCHES="$TESTS/negative-controls"
TMP="${TMPDIR:-/tmp}/kids-sql-tests.$$"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

MODE=head
FILTER=""
for arg in "$@"; do
  case "$arg" in
    --replay)   MODE=replay ;;
    --negative) MODE=negative ;;
    -h|--help)  sed -n '2,36p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *)  FILTER="$arg" ;;
  esac
done

if [ "$MODE" != head ] && [ -z "$FILTER" ]; then
  echo "--$MODE needs a migration name: it is for the one you are about to push," >&2
  echo "not for the whole tree. Replaying a superseded migration collides with" >&2
  echo "the later one that superseded it." >&2
  exit 2
fi

pass=0; fail=0; skip=0; failed=()

run_one() {  # $1 label, $2 composed sql, $3 "invert" to require failure
  local label="$1" sql="$2" invert="${3:-}"

  # The one check that must never be skipped.
  if [ "$(tail -1 "$sql")" != "rollback;" ]; then
    echo "REFUSED $label — composed file does not end in a rollback" >&2; exit 3
  fi

  supabase db query --linked -f "$sql" >"$TMP/out" 2>&1
  local rc=$?

  # An assertion that says SKIP is telling you the production data it needs is
  # not there any more. That is not a pass and it is not a failure.
  if grep -q 'SKIP:' "$TMP/out"; then
    echo "SKIP  $label  — $(grep -o 'SKIP:[^"\\]*' "$TMP/out" | head -1)"
    skip=$((skip+1)); return
  fi

  if [ -n "$invert" ]; then
    if [ $rc -ne 0 ]; then
      echo "PASS  $label  — caught: $(sed -n 's/.*ERROR: *//p' "$TMP/out" | head -1 | cut -c1-90)"
      pass=$((pass+1))
    else
      echo "FAIL  $label  — THE ASSERTION DID NOT FIRE. It is decorative."
      fail=$((fail+1)); failed+=("$label")
    fi
    return
  fi

  if [ $rc -eq 0 ] && grep -q 'ALL ASSERTIONS PASSED' "$TMP/out"; then
    echo "PASS  $label"; pass=$((pass+1))
  else
    echo "FAIL  $label"
    sed -n 's/.*ERROR: *//p' "$TMP/out" | head -2 | cut -c1-160 | sed 's/^/        /'
    grep -q 'ERROR' "$TMP/out" || tail -2 "$TMP/out" | sed 's/^/        /'
    fail=$((fail+1)); failed+=("$label")
  fi
}

compose() {  # $1 out, $2 test file, $3 optional migration body
  { echo "begin;"
    [ -n "${3:-}" ] && cat "$3"
    cat "$2"
    echo "select 'ALL ASSERTIONS PASSED' as result;"
    echo "rollback;"; } > "$1"
}

for test in "$TESTS"/*.test.sql; do
  [ -e "$test" ] || { echo "no tests found in $TESTS"; exit 2; }
  name="$(basename "$test" .test.sql)"
  [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]] && continue
  mig="$MIGRATIONS/$name.sql"

  case "$MODE" in
    head)
      compose "$TMP/run.sql" "$test"
      run_one "$name" "$TMP/run.sql"
      ;;

    replay)
      if [ ! -f "$mig" ]; then
        echo "SKIP  $name  (no migration — was it renamed?)"; skip=$((skip+1)); continue
      fi
      compose "$TMP/run.sql" "$test" "$mig"
      run_one "$name  [replay]" "$TMP/run.sql"
      ;;

    negative)
      # Each control is its own run. Applying two at once would only prove
      # that at least one assertion noticed, which is not the claim.
      controls=()
      [ -f "$PATCHES/$name.patch" ] && controls+=("$PATCHES/$name.patch")
      for extra in "$PATCHES/$name".[0-9].patch; do
        [ -e "$extra" ] && controls+=("$extra")
      done
      if [ ${#controls[@]} -eq 0 ]; then
        echo "SKIP  $name  (no negative control recorded)"; skip=$((skip+1)); continue
      fi

      # THE CONTROL ON THE CONTROL. A negative control is only evidence if the
      # UNBROKEN migration replays cleanly first. If it does not - because a
      # later migration added an overload or changed a return type - then the
      # broken version fails too, for a reason that has nothing to do with the
      # assertion, and the control reports a triumphant PASS having proved
      # nothing at all. That is worse than no control, because it reads as
      # confirmation.
      compose "$TMP/clean.sql" "$test" "$mig"
      if ! supabase db query --linked -f "$TMP/clean.sql" >"$TMP/cleanout" 2>&1; then
        echo "SKIP  $name  (superseded — the unbroken migration no longer replays,"
        echo "                so a failure here would prove nothing)"
        skip=$((skip+1)); continue
      fi

      for control in "${controls[@]}"; do
        cp "$mig" "$TMP/broken.sql"
        if ! patch --quiet "$TMP/broken.sql" < "$control" 2>/dev/null; then
          echo "SKIP  $name [${control##*/}]  (control no longer applies — the migration changed)"
          skip=$((skip+1)); continue
        fi
        compose "$TMP/run.sql" "$test" "$TMP/broken.sql"
        run_one "$name  [${control##*/}]" "$TMP/run.sql" invert
      done
      ;;
  esac
done

echo
echo "$pass passed, $fail failed, $skip skipped"
if [ ${#failed[@]} -gt 0 ]; then
  printf '  %s\n' "${failed[@]}"
  exit 1
fi
