# SPDX-License-Identifier: Apache-2.0
# The helper for PDF files and office previews of compose.yaml: Gotenberg, with Debian's
# security updates since the upstream image was made, and Kenwerk's settings built in.
# Upstream builds its image from a fixed Debian snapshot, so its packages, Chromium among
# them, age until its next release; this image takes them current at every build. CI builds
# and scans it on every change and every night, and .github/workflows/pdf-image.yml publishes
# it at every release. The base is pinned by digest, with the tag kept for
# reading; Renovate moves both.
FROM gotenberg/gotenberg:9.9.3@sha256:9731688d1b6290e4c04d9a47dbd5fb29f92aa0076feb6592c5c777525892cd72

USER root
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*
COPY start.sh /usr/local/bin/kenwerk-pdf
USER gotenberg

# The name Kenwerk sends with the password (internal/exchange); the password comes from
# KENWERK_PDF_PASSWORD through compose.yaml.
ENV GOTENBERG_API_BASIC_AUTH_USERNAME=kenwerk
# tini, as upstream, so the processes of Chromium and LibreOffice are reaped.
ENTRYPOINT ["/usr/bin/tini", "--", "sh", "/usr/local/bin/kenwerk-pdf"]
CMD []
