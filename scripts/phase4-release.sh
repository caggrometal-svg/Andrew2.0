#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPO='caggrometal-svg/Andrew2.0'
readonly PR='6'
readonly EXPECTED_SHA='f199cf8c516cd254f9a6eac4ad35c0f6a0d1479f'
readonly BASE='iac33-integration-next'
readonly PHASE4='phase4-tool-router'
readonly CI_RUN='34525856443'
readonly LEARNING_GATE_RUN='34525856427'

require() { command -v "$1" >/dev/null 2>&1 || { echo "missing_command:$1" >&2; exit 127; }; }
require gh
require git
require npm

repo_json="$(gh api "repos/${REPO}/pulls/${PR}")"
head_sha="$(jq -r '.head.sha' <<<"${repo_json}")"
base_ref="$(jq -r '.base.ref' <<<"${repo_json}")"
pr_state="$(jq -r '.state' <<<"${repo_json}")"

[[ "${head_sha}" == "${EXPECTED_SHA}" ]] || { echo "phase3_head_mismatch:${head_sha}" >&2; exit 20; }
[[ "${base_ref}" == "${BASE}" ]] || { echo "phase3_base_mismatch:${base_ref}" >&2; exit 21; }
[[ "${pr_state}" == 'open' ]] || { echo "pr_not_open:${pr_state}" >&2; exit 22; }

for run_id in "${CI_RUN}" "${LEARNING_GATE_RUN}"; do
  conclusion="$(gh api "repos/${REPO}/actions/runs/${run_id}" --jq '.conclusion')"
  status="$(gh api "repos/${REPO}/actions/runs/${run_id}" --jq '.status')"
  [[ "${status}" == 'completed' && "${conclusion}" == 'success' ]] || {
    echo "gate_failed:${run_id}:${status}:${conclusion}" >&2
    exit 23
  }
done

# GitHub App connector cannot perform the merge POST; this is the authoritative CLI merge step.
gh pr merge "${PR}" --repo "${REPO}" --merge --delete-branch=false

git fetch origin "${BASE}" "${PHASE4}" --prune
if git show-ref --verify --quiet "refs/remotes/origin/${PHASE4}"; then
  git checkout -B "${PHASE4}" "origin/${PHASE4}"
else
  git checkout -B "${PHASE4}" "origin/${BASE}"
fi

git pull --ff-only origin "${BASE}"

for file in \
  src/core/tools/tool-types.ts \
  src/core/tools/permission-gate.ts \
  src/core/tools/tool-router.ts \
  src/core/tools/builtins/memory-read.ts \
  src/core/tools/builtins/app-state.ts; do
  test -f "${file}" || { echo "missing_phase4_file:${file}" >&2; exit 24; }
done

grep -R --line-number --fixed-strings ': any' src/core/tools >/dev/null && {
  echo 'phase4_any_detected' >&2
  exit 25
} || true

grep -R --line-number --fixed-strings 'timeline-store' src/core/tools >/dev/null && {
  echo 'protected_timeline_store_touched' >&2
  exit 26
} || true

npm ci
npm run typecheck
npm test
npm run build

git status --short
git push -u origin "${PHASE4}"
echo "PHASE4_READY:${PHASE4}"
