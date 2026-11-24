#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# The load smoke test of the CI job load-smoke (wave LT1): builds the binary from this checkout,
# starts it on a database of its own, seeds a small organisation through the API, and runs
# scripts/load/smoke.js with k6. It fails when a main read crosses its p95 budget, when more than
# 1% of requests fail, or on any server error. It finds a slow query early; it does not measure
# capacity, which the manual test of scripts/stress/ does on a server.
#
#   bash scripts/load/smoke.sh
#
# Needs Go, psql, curl, python3, tar and sha256sum, and KENWERK_TEST_DATABASE_URL pointing at a
# role that may create databases, as CI's runner and the development container have.
# LOAD_SMOKE_SUMMARY=<file> keeps k6's whole summary as JSON; LOAD_SMOKE_DURATION shortens or
# lengthens the run (default 150s).
set -euo pipefail
shopt -s inherit_errexit
here=$(cd "$(dirname "$0")/../.." && pwd)
: "${KENWERK_TEST_DATABASE_URL:?needs a test database}"

# k6 is pinned by version and by the sha256 of its release archive, as published in the
# release's k6-<version>-checksums.txt; docs/dependencies.md lists it.
K6_VERSION=v2.4.0
K6_SHA256=5a5ecf23529ccf93135bc7e5b0c1cd5126ecf5f2672e22eed1556a0ab74abb87
tools=$here/bin/load-tools

# The seeded organisation: small and fixed, so seeding takes a minute or two. The words of
# pages, the spaces' sizes and the grants follow seed.py, with its fixed random seed.
SEED_PEOPLE=200
SEED_GROUPS=10
SEED_SPACES=20
SEED_PAGES=2000
SEED_FILES=200
SEED_LABELS=500

port=${LOAD_SMOKE_PORT:-8095}
base_url=http://localhost:$port
work=$(mktemp -d)
db="kenwerk_smoke_$$"
db_base=${KENWERK_TEST_DATABASE_URL%%\?*}
db_base=${db_base%/*}
export KENWERK_DATABASE_URL="$db_base/$db?sslmode=disable"
export KENWERK_PUBLIC_URL=$base_url KENWERK_HTTP_ADDR=":$port" KENWERK_DATA_DIR=$work/data
export KENWERK_LOG_LEVEL=warn KENWERK_SHUTDOWN_DELAY=1s
server=

# stop_all ends the server and drops the database. When the run failed, at any step, the
# server's own lines come first, since a log needs a login to read and the cause is there.
# shellcheck disable=SC2329 # called by the trap below
stop_all() {
  local status=$1
  if [ "$status" -ne 0 ] && [ -s "$work/server.log" ]; then
    echo "--- the server's warnings and errors"
    grep -E '"level":"(WARN|ERROR)"' "$work/server.log" | tail -30 || tail -30 "$work/server.log"
  fi
  if [ -n "$server" ]; then
    kill -TERM "$server" 2>/dev/null || true
    wait "$server" 2>/dev/null || true
  fi
  psql "$KENWERK_TEST_DATABASE_URL" -q -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" || true
  rm -rf "$work"
}
trap 'stop_all $?' EXIT

# fetch_k6 downloads the pinned k6 once, and refuses it unless its sha256 is the pinned one.
fetch_k6() {
  local archive=$tools/k6-$K6_VERSION.tar.gz
  mkdir -p "$tools"
  if [ ! -s "$archive" ]; then
    curl -fsSL --retry 3 -o "$archive.part" \
      "https://github.com/grafana/k6/releases/download/$K6_VERSION/k6-$K6_VERSION-linux-amd64.tar.gz"
    mv "$archive.part" "$archive"
  fi
  if ! echo "$K6_SHA256  $archive" | sha256sum -c --quiet -; then
    rm -f "$archive"
    echo "k6 $K6_VERSION does not have the pinned sha256: refused" >&2
    return 1
  fi
  tar -xzf "$archive" -C "$tools" --strip-components=1 "k6-$K6_VERSION-linux-amd64/k6"
  "$tools/k6" version
}

echo "== k6 $K6_VERSION"
fetch_k6

echo "== build"
(cd "$here" && CGO_ENABLED=0 go build -trimpath -o "$work/kenwerk" ./cmd/kenwerk)

echo "== start on a database of its own"
psql "$KENWERK_TEST_DATABASE_URL" -q -c "CREATE DATABASE $db"
admin_password="Smoke-$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
echo "$admin_password" | "$work/kenwerk" user create-admin --email admin@example.test --name Admin >/dev/null
"$work/kenwerk" serve >"$work/server.log" 2>&1 &
server=$!
for _ in $(seq 1 100); do
  curl -sf "$base_url/readyz" >/dev/null && break
  sleep 0.2
done
if ! curl -sf "$base_url/readyz" >/dev/null; then
  echo "the server did not get ready:" >&2
  tail -30 "$work/server.log" >&2
  exit 1
fi

echo "== seed $SEED_PEOPLE people, $SEED_SPACES spaces, $SEED_PAGES pages"
started=$SECONDS
SEED_ADMIN_PASSWORD=$admin_password python3 -I "$here/scripts/stress/seed.py" --base "$base_url" \
  --admin-email admin@example.test --out "$work/seeded.json" --workers 8 \
  --people "$SEED_PEOPLE" --groups "$SEED_GROUPS" --spaces "$SEED_SPACES" --pages "$SEED_PAGES" \
  --comments 0 --commenters 0 --files "$SEED_FILES" --labels "$SEED_LABELS" 2>&1 | tee "$work/seed.log"
# seed.py counts a failed item and goes on; here every item must exist, or the run measures
# a smaller organisation than it says. (Its page plan rounds each space down, so it makes a
# few pages fewer than asked: 1,993 of 2,000.)
if grep -qE ', [1-9][0-9]* failed' "$work/seed.log"; then
  grep -E ', [1-9][0-9]* failed|answered' "$work/seed.log" | sed -n '1,10p' |
    while IFS= read -r line; do echo "::error title=load smoke seeding::$line"; done
  exit 1
fi
echo "seeded in $((SECONDS - started))s"

# The events of the seeding are handled before the measurement, so the consumers do not run
# beside it, and the planner has the statistics autovacuum would give it on a live instance.
for _ in $(seq 1 240); do
  [ "$(psql "$KENWERK_DATABASE_URL" -tAc 'SELECT count(*) FROM outbox_events WHERE published_at IS NULL')" = 0 ] && break
  sleep 0.5
done
psql "$KENWERK_DATABASE_URL" -q -c ANALYZE

echo "== k6 smoke: $base_url"
status=0
"$tools/k6" run --quiet -e BASE_URL="$base_url" -e SEED="$work/seeded.json" \
  -e DURATION="${LOAD_SMOKE_DURATION:-150s}" -e SUMMARY="${LOAD_SMOKE_SUMMARY:-}" \
  "$here/scripts/load/smoke.js" || status=$?
if [ "$status" -ne 0 ]; then
  echo "::error title=load smoke::k6 exited $status: a read crossed its budget, or requests failed"
fi
exit "$status"
