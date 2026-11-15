#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
timeout 180 docker run --rm --network "${COMPOSE_PROJECT_NAME:-token-exchange-handson}_default" \
  --user "$(id -u):$(id -g)" -e IN_DOCKER=1 -v "$PWD:/work:ro" -w /work \
  node:22.14.0-bookworm-slim sh -c 'node --test test/security.test.mjs && node test/e2e.mjs'
