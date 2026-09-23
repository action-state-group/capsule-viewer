#!/usr/bin/env bash
# Local gate: the same checks .github/workflows/ci.yml runs. Run from the
# repo root before every push.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m venv .venv >/dev/null 2>&1 || true
.venv/bin/pip install -q -e ".[dev]"
.venv/bin/ruff check src tests
.venv/bin/pytest -q

npm install --no-audit --no-fund
npm test
