#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Starts Gotenberg as Kenwerk uses it. It reads hostile files, so it gets only what Kenwerk
# calls: HTML to PDF through Chromium and office files through LibreOffice. It fetches no
# address, runs no script in pages and no macro in files, calls no webhook, and refuses the
# PDF routes and stages Kenwerk never sends (ARC-085, ARC-094). Extra flags after the image
# name are passed on, so an operator can add one without rebuilding.
set -eu

# A password switches the check on, so an installation without one keeps working.
if [ -n "${GOTENBERG_API_BASIC_AUTH_PASSWORD:-}" ]; then
  set -- --api-enable-basic-auth "$@"
fi

exec gotenberg \
  --api-disable-download-from \
  --api-timeout=120s \
  --chromium-deny-private-ips \
  --chromium-deny-public-ips \
  --chromium-disable-javascript \
  --libreoffice-deny-private-ips \
  --libreoffice-deny-public-ips \
  --pdf-disable-routes \
  --pdf-disable-stages \
  --webhook-disable \
  --log-level=warn \
  "$@"
