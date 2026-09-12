#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing cortex/.env. Copy .env.example to .env and set real secrets." >&2
  exit 2
fi

docker compose up -d redis qdrant litellm cortex
cleanup() {
  docker compose down
}
trap cleanup EXIT

for attempt in $(seq 1 30); do
  if docker compose exec -T redis redis-cli ping >/dev/null 2>&1; then break; fi
  sleep 2
done

docker compose exec -T redis redis-cli ping
curl --fail --silent http://127.0.0.1:8080/health
printf '\nQdrant: '
curl --fail --silent http://127.0.0.1:6333/healthz || true
printf '\nLiteLLM: '
curl --fail --silent http://127.0.0.1:4000/health/liveliness || true
printf '\nCortex local stack smoke: PASS\n'
