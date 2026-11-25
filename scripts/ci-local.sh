#!/usr/bin/env bash
# Local gate, run from anywhere in the repository before every push:
#
#   scripts/ci-local.sh          # what ci.yml ran on a pull request before the
#                                # fast set: every job, the whole ts/ check
#   scripts/ci-local.sh --full   # also the ts/ check on Node 22 and 24, as
#                                # ts-full.yml runs it nightly and on main
#
# Needs python3, Node and npm, Go, Google Chrome (the ts/ browser tests skip
# without one; CI fails instead, and so does this) and network access to
# github.com: the agent-action-capsule comparisons fetch the revisions the
# scripts pin, as CI does. --full also needs npm's registry, to fetch Node 22
# and 24 with `npx node@<version>`.
set -euo pipefail
cd "$(dirname "$0")/.."

full=false
case "${1:-}" in
  "") ;;
  --full) full=true ;;
  *) echo "usage: scripts/ci-local.sh [--full]" >&2; exit 2 ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
aac=https://github.com/action-state-group/agent-action-capsule.git

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
# Warns, never fails, as in CI.
git clone -q --depth 1 "$aac" "$tmp/aac-main"
.venv/bin/python scripts/check-vendored-aac.py --aac "$tmp/aac-main" \
  || echo "warning: vendored agent-action-capsule files differ from its main; re-vendor them with the next AAC pin bump" >&2
.venv/bin/pytest -q .github/test_release.py

# ci.yml: js
npm install --no-audit --no-fund
npm test

# ci.yml: ts, whole (ts-full.yml); test/chart-browser.test.ts lists where
# the browser tests look for Chrome.
chrome=false
for c in /usr/bin/google-chrome /usr/bin/google-chrome-stable \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  [ -x "$c" ] && chrome=true
done
$chrome || { echo "error: no Google Chrome; the ts/ browser tests would skip" >&2; exit 1; }
(cd ts && npm ci --no-audit --no-fund && npm run check)

# ci.yml: go
(cd go && test -z "$(gofmt -l .)" && go mod tidy && test -z "$(git status --porcelain -- .)" \
  && go vet ./... && go test -race ./...)

# ci.yml: pageruntime
scripts/pageruntime.sh

if $full; then
  # ts-full.yml's matrix. `npx -p node@<v>` puts that Node first on PATH, so
  # npm and the scripts it runs use it.
  for v in 22 24; do
    echo "== ts/ npm run check on Node $v"
    (cd ts && npx -y -p "node@$v" -- npm ci --no-audit --no-fund \
      && npx -y -p "node@$v" -- npm run check)
  done
fi
