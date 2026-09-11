#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PYTHONPATH="$ROOT"

printf '\n== UNIT TESTS ==\n'
python -m pytest -q --cov=app --cov-report=term-missing

printf '\n== STATIC CHECK ==\n'
python -m compileall -q app tests
python -m ruff check app tests

printf '\n== COMPOSE VALIDATION ==\n'
docker compose -f docker-compose.yml config >/tmp/andrew-cortex-compose.yml

printf '\nCERTIFICATION STATIC GATE: PASS\n'
printf 'Integration services require a Docker host with the pinned images available.\n'
