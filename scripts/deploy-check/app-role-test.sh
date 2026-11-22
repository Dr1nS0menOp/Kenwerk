#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Tests "kenwerk-backup app-role" (spec 099) against a real PostgreSQL, set up as a managed
# database is: the owner of the database is no superuser, but may create roles. Run by
# scripts/deploy-check.sh; needs Docker and POSTGRES_IMAGE.
set -eu
cd "$(dirname "$0")/../.."
: "${POSTGRES_IMAGE:?set POSTGRES_IMAGE}"
name=kenwerk-app-role-test-$$
net=$name
work=$(mktemp -d)
failures=0
fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

docker network create "$net" >/dev/null
docker run -d --name "$name" --network "$net" -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=admin \
  -e POSTGRES_DB=postgres "$POSTGRES_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U admin -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done
admin() { docker exec -i "$name" psql -X -q -tA -v ON_ERROR_STOP=1 -U admin -h 127.0.0.1 "$@"; }
admin -d postgres <<'SQL'
CREATE ROLE kenwerk_owner LOGIN CREATEROLE PASSWORD 'owner-pw';
CREATE DATABASE kenwerk OWNER kenwerk_owner;
SQL

# run_app_role writes both addresses as files and runs the command in the image of the backup
# service's base, with the script from this checkout. It prints the script's log.
run_app_role() {
  local app_url=$1 owner_url=${2:-postgres://kenwerk_owner:owner-pw@$name:5432/kenwerk?sslmode=disable}
  printf '%s' "$app_url" >"$work/database_url"
  printf '%s' "$owner_url" >"$work/migrate_database_url"
  chmod 644 "$work"/*_url
  docker run --rm --network "$net" -v "$PWD/deploy/backup:/script:ro" -v "$work:/run/secrets:ro" \
    --entrypoint bash "$POSTGRES_IMAGE" /script/backup-service.sh app-role 2>&1
}
# login_as says whether role can connect to kenwerk with password. It goes through the
# container's own name, not 127.0.0.1, which the image trusts without a password.
login_as() {
  docker exec -e PGPASSWORD="$2" "$name" psql -X -tA -U "$1" -h "$name" -d kenwerk -c 'SELECT 1' 2>/dev/null | grep -qx 1
}

out=$(run_app_role "postgres://kenwerk_app:first%2Fpw@$name:5432/kenwerk?sslmode=disable") ||
  fail "the first run failed: $out"
login_as kenwerk_app first/pw || fail "the new role cannot log in with the decoded password"
[ "$(admin -d kenwerk -c "SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = 'kenwerk_app'")" = f ] ||
  fail "the new role holds more than login"
[ "$(admin -d kenwerk -c "SELECT has_schema_privilege('kenwerk_app', 'public', 'USAGE')")" = t ] ||
  fail "the new role cannot use the schema"

out=$(run_app_role "postgres://kenwerk_app:second-pw@$name:5432/kenwerk?sslmode=disable") ||
  fail "a second run failed: $out"
login_as kenwerk_app second-pw || fail "a second run did not set the new password"
login_as kenwerk_app first/pw && fail "the old password still works after a second run"

if out=$(run_app_role "postgres://kenwerk_owner:owner-pw@$name:5432/kenwerk?sslmode=disable"); then
  fail "the owner was accepted as the application role"
fi
grep -q 'may not be the owner' <<<"$out" || fail "refusing the owner does not say why: $out"

admin -d kenwerk -c 'ALTER ROLE kenwerk_app CREATEROLE' >/dev/null
if out=$(run_app_role "postgres://kenwerk_app:second-pw@$name:5432/kenwerk?sslmode=disable"); then
  fail "a role that may create roles was accepted"
fi
grep -q 'give it a plain role' <<<"$out" || fail "refusing a role that may create roles does not say why: $out"
admin -d kenwerk -c 'ALTER ROLE kenwerk_app NOCREATEROLE' >/dev/null

# A role made by someone else, which holds the owner's rights through membership. PostgreSQL
# itself already stops the owner from setting its password, so either refusal will do.
admin -d kenwerk -c "CREATE ROLE heir LOGIN PASSWORD 'heir-pw'" -c 'GRANT kenwerk_owner TO heir' >/dev/null
if out=$(run_app_role "postgres://heir:heir-pw@$name:5432/kenwerk?sslmode=disable"); then
  fail "a role with the owner's rights was accepted"
fi
grep -Eq 'give it a plain role|could not be made or given its password' <<<"$out" ||
  fail "refusing a member of the owner does not say why: $out"

if out=$(run_app_role "host=$name user=kenwerk_app password=x"); then
  fail "an address without postgres:// was accepted"
fi
grep -q 'must be postgres://' <<<"$out" || fail "refusing a key=value address does not say why: $out"

out=$(run_app_role "postgres://Kenwerk-App:pw@$name:5432/kenwerk?sslmode=disable") ||
  fail "a role name that needs quoting failed: $out"
login_as Kenwerk-App pw || fail "a role name that needs quoting was not made as written"

if [ "$failures" -gt 0 ]; then
  echo "app-role: $failures failure(s)" >&2
  exit 1
fi
echo "app-role: every case passed"
