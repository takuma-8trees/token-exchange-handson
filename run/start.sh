#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:22.14.0-bookworm-slim node run/setup.mjs
docker compose up -d --build
for url in http://localhost:19361/realms/exchange-lab/.well-known/openid-configuration http://localhost:19360/health http://localhost:19362/health; do
 attempt=0
 until curl -fsS --max-time 3 "$url" >/dev/null 2>&1; do
  attempt=$((attempt+1)); if [ "$attempt" -ge 120 ]; then echo "Readiness failed: $url" >&2; exit 1; fi
  sleep 1
 done
done
printf '%s\n' 'Ready: http://localhost:19360/ — credentials: .secrets/login.json'
