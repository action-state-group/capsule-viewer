#!/usr/bin/env bash
# Local gate, run from anywhere in the repository before every push:
#
#   scripts/ci-local.sh          # every job ci.yml runs on a pull request,
#                                # the whole ts/ check on Node 22 and 24 included
#   scripts/ci-local.sh --full   # the same: nothing main or the nightly runs
#                                # is left out of the default
#
# Needs python3, Node and npm, Go, Google Chrome (the ts/ browser tests skip
# without one; CI fails instead, and so does this), network access to
# github.com (the agent-action-capsule comparisons fetch the revisions the
# scripts pin, as CI does) and npm's registry, to fetch Node 22 and 24 with
# `npx node@<version>`.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  "" | --full) ;;
  *) echo "usage: scripts/ci-local.sh [--full]" >&2; exit 2 ;;
esac

tmp="$(mktemp -d)"
light_pid=
# On exit or interrupt, stop the background sections first, then remove the
# directory they write to.
killtree() {
  local child
  for child in $(pgrep -P "$1"); do killtree "$child"; done
  kill -TERM "$1" 2>/dev/null || true
}
cleanup() {
  if [ -n "$light_pid" ]; then
    killtree "$light_pid"
    wait "$light_pid" 2>/dev/null || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
aac=https://github.com/action-state-group/agent-action-capsule.git

# The light sections (ci.yml's python, js, go and pageruntime jobs) run one
# after another in the background, beside the ts/ legs in the foreground: they
# share no files with ts/ (python uses .venv, js the root node_modules, go its
# module, pageruntime a worktree of its own), and running them one at a time
# keeps the machine at one vitest run plus one light section (#466).
light() {
  set -euo pipefail
  # ci.yml: python
  python3 -m venv .venv >/dev/null 2>&1 || true
  .venv/bin/pip install -q -e ".[dev]"
  .venv/bin/ruff check src tests
  .venv/bin/pytest -q
  .venv/bin/python schemas/check_presentation_manifest_examples.py
  .venv/bin/python schemas/check_contract_report_examples.py
  rev="$(.venv/bin/python scripts/check-moved-spec.py --rev)"
  vendored="$(.venv/bin/python scripts/check-vendored-aac.py --print-rev)"
  git init -q "$tmp/aac"
  git -C "$tmp/aac" fetch -q --depth 1 "$aac" "$rev" "$vendored"
  .venv/bin/python scripts/check-moved-spec.py --aac "$tmp/aac"
  .venv/bin/python scripts/check-vendored-aac.py --aac "$tmp/aac" --rev "$vendored"
  rev="$(.venv/bin/python scripts/check-chart-golden.py --rev)"
  git init -q "$tmp/aac-charts"
  git -C "$tmp/aac-charts" fetch -q --depth 1 "$aac" "$rev"
  .venv/bin/python scripts/check-chart-golden.py --aac "$tmp/aac-charts"
  # Warns, never fails, as in CI: a failed clone or comparison only warns.
  if ! { git clone -q --depth 1 "$aac" "$tmp/aac-main" \
    && .venv/bin/python scripts/check-vendored-aac.py --aac "$tmp/aac-main"; }; then
    echo "warning: vendored agent-action-capsule files differ from its main, or its main could not be fetched; re-vendor them with the next AAC pin bump" >&2
  fi
  .venv/bin/pytest -q .github/test_release.py

  # ci.yml: js
  npm install --no-audit --no-fund
  npm test

  # ci.yml: go
  (cd go && test -z "$(gofmt -l .)" && go mod tidy && test -z "$(git status --porcelain -- .)" \
    && go vet ./... && go test -race ./...)

  # ci.yml: pageruntime
  scripts/pageruntime.sh
}
light > "$tmp/light.log" 2>&1 &
light_pid=$!

# ci.yml: ts, as pull requests and ts-full.yml run it: the whole `npm run
# check` on Node 22 and 24, one after the other, since both use ts/node_modules
# and ts/dist. `npx -p node@<v>` puts that Node first on PATH, so npm and the
# scripts it runs use it. The Chrome candidates are
# test/chart-browser.test.ts's, without Playwright's own Chromium.
chrome=false
for c in "${AAC_CHROMIUM_PATH:-}" /usr/bin/google-chrome /usr/bin/google-chrome-stable \
  /usr/bin/chromium /usr/bin/chromium-browser \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  [ -n "$c" ] && [ -x "$c" ] && chrome=true
done
$chrome || { echo "error: no Chrome or Chromium; the ts/ browser tests would skip" >&2; exit 1; }
for v in 22 24; do
  echo "== ts/ npm run check on Node $v"
  (cd ts && npx -y -p "node@$v" -- npm ci --no-audit --no-fund \
    && npx -y -p "node@$v" -- npm run check)
done

# The light sections' result, and their log either way.
light_status=0
wait "$light_pid" || light_status=$?
light_pid=
cat "$tmp/light.log"
if [ "$light_status" -ne 0 ]; then
  echo "error: a light section (python, js, go or pageruntime) failed; its output is above" >&2
  exit "$light_status"
fi
echo "ci-local: every check passed"
