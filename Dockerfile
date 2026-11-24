# SPDX-License-Identifier: Apache-2.0
# Base images are pinned by digest, with the tag kept for reading; Renovate moves the
# digests (OPS-096).
FROM node:26-trixie-slim@sha256:615a27817f7b9508f0de73eb1cc8fc8894ab122bee56c1a7a568b72cd1032067 AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY web/ ./
RUN npx vite build

FROM golang:1.27@sha256:205c7636d74e0ffbe3d007162df7d74f859f5a8c8322dfb9f907977686c126cf AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
COPY --from=web /src/internal/webui/dist/ internal/webui/dist/
ARG VERSION=dev
# The date of the commit (git log -1 --format=%cs); empty for a developer build (spec 051).
ARG BUILD_DATE=
RUN CGO_ENABLED=0 go build -trimpath \
      -ldflags "-s -w -X github.com/kenwerk/kenwerk/internal/version.Version=${VERSION} -X github.com/kenwerk/kenwerk/internal/version.Date=${BUILD_DATE}" \
      -o /out/kenwerk ./cmd/kenwerk
RUN mkdir -p /out/data

# The backup service of compose.yaml (spec 054): pg_dump of the same major version as the
# database, gpg to encrypt, and the kenwerk binary of this build to note each backup.
# docker build . skips this stage; compose.yaml builds it with target: backup.
FROM postgres:16@sha256:3950ad7c3148ca2175ef1b6c36c9efbf78957ae8fbe8b3a5d7c35af50500382f AS backup
# The base is pinned by digest, so Debian's security updates since then come in here. gosu
# serves the entrypoint of the postgres image, which this stage replaces, so it goes (spec 067).
# ca-certificates lets pg_dump check a managed database's certificate with sslrootcert=system
# (spec 099).
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && apt-get install -y --no-install-recommends gnupg ca-certificates \
 && rm -rf /var/lib/apt/lists/* /usr/local/bin/gosu
COPY --from=build /out/kenwerk /usr/local/bin/kenwerk
COPY deploy/backup/backup-service.sh /usr/local/bin/kenwerk-backup
# Through bash, so the file needs no executable bit from the checkout.
ENTRYPOINT ["bash", "/usr/local/bin/kenwerk-backup"]
CMD ["loop"]

# Distroless: no shell, no package manager, runs as non-root.
FROM gcr.io/distroless/static-debian13:nonroot@sha256:8ce6dd87e9823c5b48dcfb2c8604714ccb351ce59607327bcc4957448da279b5
COPY --from=build /out/kenwerk /usr/local/bin/kenwerk
COPY --from=build --chown=nonroot:nonroot /out/data /var/lib/kenwerk
ENV KENWERK_HTTP_ADDR=:8080 \
    KENWERK_DATA_DIR=/var/lib/kenwerk
USER nonroot:nonroot
EXPOSE 8080
VOLUME ["/var/lib/kenwerk"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD ["/usr/local/bin/kenwerk", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/kenwerk"]
CMD ["serve"]
