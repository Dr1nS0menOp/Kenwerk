#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Tests scripts/fuzz.sh with a stand-in for `go`: a target runs once more only after the race
# of Go's fuzz coordinator, and every real failure fails the run. Run it from the repository
# root: bash scripts/fuzz-test.sh
set -u

src=$(pwd)
stub=$(mktemp -d)
# A target whose corpus folder is in the repository, so the test creates no folder.
target=FuzzFromMarkdown
corpus=$src/internal/document/testdata/fuzz/$target
planted=$corpus/planted-by-fuzz-test
trap 'rm -rf "$stub"; rm -f "$planted"' EXIT
failures=0

# The stand-in answers each call with the next line of $stub/answers, one of the cases below.
# It counts its calls in $stub/calls.
cat >"$stub/go" <<'EOF'
#!/usr/bin/env bash
calls=$(($(cat "$STUB_DIR/calls" 2>/dev/null || echo 0) + 1))
echo "$calls" >"$STUB_DIR/calls"
answer=$(sed -n "${calls}p" "$STUB_DIR/answers")
case "$answer" in
  pass) echo "ok"; exit 0 ;;
  race) echo "--- FAIL: $STUB_TARGET (60.01s)"; echo "    context deadline exceeded"; exit 1 ;;
  input) echo "--- FAIL: $STUB_TARGET (3.20s)"; echo "    Failing input written to testdata/fuzz/$STUB_TARGET/abc"; exit 1 ;;
  race-and-input) echo x >"$STUB_PLANT"; echo "    context deadline exceeded"; exit 1 ;;
  race-and-message) echo "    context deadline exceeded"; echo "    Failing input written to testdata/fuzz/$STUB_TARGET/abc"; exit 1 ;;
  other) echo "--- FAIL: $STUB_TARGET (0.01s)"; echo "    a seed input failed"; exit 1 ;;
  *) echo "the stand-in for go has no answer for call $calls" >&2; exit 9 ;;
esac
EOF
chmod +x "$stub/go"

# expect <name> <answers> <exit code> <calls> <text the output must hold>: one case.
expect() {
  local name=$1 answers=$2 want_status=$3 want_calls=$4 want_text=$5 out status calls
  rm -f "$stub/calls" "$planted"
  tr ' ' '\n' <<<"$answers" >"$stub/answers"
  out=$(PATH="$stub:$PATH" STUB_DIR=$stub STUB_TARGET=$target STUB_PLANT=$planted FUZZ_ONLY=$target \
    bash "$src/scripts/fuzz.sh" 2>&1)
  status=$?
  calls=$(cat "$stub/calls" 2>/dev/null || echo 0)
  if [ "$status" != "$want_status" ] || [ "$calls" != "$want_calls" ] || ! grep -qF -- "$want_text" <<<"$out"; then
    echo "FAIL $name: exit $status (want $want_status), $calls run(s) (want $want_calls), output:"
    while IFS= read -r line; do echo "    $line"; done <<<"$out"
    failures=$((failures + 1))
    return
  fi
  echo "ok   $name"
}

[ -d "$corpus" ] || { echo "the corpus folder $corpus is gone; pick another target"; exit 2; }
expect "a failing input fails at once" "input pass" 1 1 "FAILED  $target: "
expect "any other failure fails at once" "other pass" 1 1 "a seed input failed"
expect "the race with a failing input named fails at once" "race-and-message pass" 1 1 "Failing input written to"
expect "the race twice fails" "race race" 1 2 "context deadline exceeded"
expect "the race with a new input in the corpus fails at once" "race-and-input pass" 1 1 "FAILED  $target"
expect "a failure after the race fails" "race input" 1 2 "Failing input written to"
expect "the race once runs the target again" "race pass" 0 2 "RETRIED $target"
expect "a target that holds passes" "pass" 0 1 "all 1 fuzz targets held"
out=$(FUZZ_ONLY=FuzzNoSuchTarget PATH="$stub:$PATH" bash "$src/scripts/fuzz.sh" 2>&1)
if [ $? = 2 ] && grep -q 'no fuzz target is called FuzzNoSuchTarget' <<<"$out"; then
  echo "ok   an unknown target is not a pass"
else
  echo "FAIL an unknown target is not a pass: $out"
  failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures case(s) of scripts/fuzz.sh failed"
  exit 1
fi
echo "scripts/fuzz.sh behaves"
