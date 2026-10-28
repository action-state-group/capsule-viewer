#!/usr/bin/env bash
# Local gate: the same checks .github/workflows/ci.yml runs. Run from the
# repo root before every push.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m venv .venv >/dev/null 2>&1 || true
.venv/bin/pip install -q -e ".[dev]"
.venv/bin/ruff check src tests
.venv/bin/pytest -q
.venv/bin/python schemas/check_presentation_manifest_examples.py
.venv/bin/python schemas/check_contract_report_examples.py
# Compares the moved spec text with agent-action-capsule when AAC_CHECKOUT
# names a clone of it; skipped otherwise.
.venv/bin/python scripts/check-moved-spec.py

npm install --no-audit --no-fund
npm test
.venv/bin/pytest -q .github/test_release.py

(cd ts && npm ci --no-audit --no-fund && npm run check)

(cd go && test -z "$(gofmt -l .)" && go mod tidy && test -z "$(git status --porcelain -- .)" \
  && go vet ./... && go test -race ./...)
scripts/pageruntime.sh
