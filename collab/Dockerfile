# SPDX-License-Identifier: Apache-2.0
FROM node:26-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:26-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5
# The service runs on node alone. npm and corepack, with the packages they bring, stay in
# the stage above, so the image ships only what runs (spec 067).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.mjs access.mjs document.mjs presence.mjs ./
USER node
EXPOSE 1234
CMD ["node", "server.mjs"]
