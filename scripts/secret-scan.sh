#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Secret scan with gitleaks and the allowlists in .gitleaks.toml (spec 097).
#   scripts/secret-scan.sh tree      the working tree, without what git ignores (make secrets)
#   scripts/secret-scan.sh history   every commit of every branch (make secrets-history, CI)
# GITLEAKS names the pinned module, as the Makefile sets it. First a planted key must be
# found, so an allowlist that grew too wide fails here instead of hiding everything.
set -eu
cd "$(dirname "$0")/.."
: "${GITLEAKS:?set GITLEAKS to the pinned gitleaks module, as the Makefile does}"
mode=${1:-}

gitleaks() { go run "$GITLEAKS" "$@" --no-banner --redact --config .gitleaks.toml; }

canary=$(mktemp -d)
trap 'rm -rf "$canary"' EXIT
mkdir -p "$canary/internal/app"
# Built here, so the repository itself never holds a string that looks like a token.
token=$(od -An -N64 -tx1 /dev/urandom | tr -d ' \n' | head -c 36)
printf 'package app\n\nconst token = "ghp_%s"\n' "$token" > "$canary/internal/app/canary.go"
if gitleaks dir "$canary" >/dev/null 2>&1; then
  echo "secret scan: a planted token was not found; .gitleaks.toml allows too much" >&2
  exit 1
fi

case "$mode" in
  tree) gitleaks dir . ;;
  history) gitleaks git . --log-opts=--all ;;
  *) echo "usage: scripts/secret-scan.sh tree|history" >&2; exit 2 ;;
esac
