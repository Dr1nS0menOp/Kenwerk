#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Fuzzes every fuzz target of the Go code, each for its own time; the nightly CI job runs it
# as `make fuzz`. Run it in the development toolbox: scripts/dev bash scripts/fuzz.sh
#
# FUZZ_ONLY names one target to run alone, such as FuzzFromMarkdown.
#
# Go's fuzz coordinator can report "context deadline exceeded" when the time of a target runs
# out although the target never failed (golang/go#75804). Go 1.27.0 and later carry the fix
# (commit 184ce15 on the Go 1.27 release branch), so with the toolchain of go.mod the retry
# below should no longer fire; it stays as a narrow guard, and a RETRIED line in a nightly log
# now means the race is back. Such a failure writes no failing input, so a target that failed
# with that message and wrote nothing runs once more. A failure with an input, any other
# failure, or the same message twice fails.
set -uo pipefail

# Package, target and seconds of each target. Every fuzz target in the code must be listed:
# the run fails on one that is not, so a new target cannot stay unfuzzed.
targets=(
  ./internal/document/ FuzzFromMarkdown 60
  ./internal/office/ FuzzReadDOCX 60
  ./internal/exchange/ FuzzFrontMatter 30
  ./internal/exchange/ FuzzVerifyBundle 60
  ./internal/document/ FuzzNormalize 60
  ./internal/exchange/ FuzzHTMLImport 60
  ./internal/scim/ FuzzParseFilter 30
  ./internal/search/ FuzzParseQuery 30
  ./internal/exchange/ FuzzImportArchive 60
  ./internal/conditions/ FuzzEvaluationIsTotalAndBounded 30
  ./internal/publishing/ FuzzRewriteLeavesNoDraftID 30
  ./internal/workflow/ FuzzValidateNeverAcceptsAWorkflowWithoutAWayToApproval 30
)
only=${FUZZ_ONLY:-}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# unlisted_targets: prints each fuzz target in the code that the table above leaves out.
unlisted_targets() {
  local name listed i
  grep -rhoE '^func Fuzz[A-Za-z0-9_]+' --include='*_test.go' cmd internal | sed 's/^func //' | sort -u |
    while IFS= read -r name; do
      listed=
      for ((i = 1; i < ${#targets[@]}; i += 3)); do
        [ "${targets[i]}" = "$name" ] && listed=1
      done
      [ -n "$listed" ] || echo "$name"
    done
}

# corpus_files <folder>: lists the inputs a target has written, so a new one can be seen.
corpus_files() {
  [ -d "$1" ] && find "$1" -type f | sort
  return 0
}

# fuzz_once <package> <target> <seconds> <log>: one run of a target; its status is the result.
fuzz_once() {
  go test "$1" -run '^$' -fuzz "^$2\$" -fuzztime "$3s" 2>&1 | tee "$4"
  return "${PIPESTATUS[0]}"
}

# is_coordinator_race <log> <corpus before> <corpus after>: whether a failure is the race of
# golang/go#75804 and nothing else.
is_coordinator_race() {
  grep -q 'context deadline exceeded' "$1" &&
    ! grep -q 'Failing input written to' "$1" &&
    [ "$2" = "$3" ]
}

# fuzz_target <package> <target> <seconds>: fuzzes a target, once more after the race alone.
fuzz_target() {
  local pkg=$1 name=$2 secs=$3 corpus before after log="$work/$2.log"
  corpus="${pkg#./}testdata/fuzz/$name"
  before=$(corpus_files "$corpus")
  fuzz_once "$pkg" "$name" "$secs" "$log" && return 0
  after=$(corpus_files "$corpus")
  if is_coordinator_race "$log" "$before" "$after"; then
    echo "RETRIED $name: only \"context deadline exceeded\" and no failing input (golang/go#75804)"
    fuzz_once "$pkg" "$name" "$secs" "$log" && return 0
  fi
  local why
  why=$(grep -a -m1 -E 'Failing input written to|^--- FAIL|panic:|context deadline exceeded' "$log") ||
    why=$(grep -a -m1 . "$log")
  echo "FAILED  $name: $why"
  return 1
}

missing=$(unlisted_targets)
if [ -n "$missing" ]; then
  echo "$missing" | while IFS= read -r name; do echo "FAILED  $name is not listed in scripts/fuzz.sh"; done
  exit 1
fi
failed=0
ran=0
for ((i = 0; i < ${#targets[@]}; i += 3)); do
  [ -n "$only" ] && [ "${targets[i + 1]}" != "$only" ] && continue
  ran=$((ran + 1))
  fuzz_target "${targets[i]}" "${targets[i + 1]}" "${targets[i + 2]}" || failed=$((failed + 1))
done
if [ "$ran" -eq 0 ]; then
  echo "FAILED  no fuzz target is called $only"
  exit 2
fi
if [ "$failed" -gt 0 ]; then
  echo "$failed of $ran fuzz target(s) failed"
  exit 1
fi
echo "all $ran fuzz targets held"
