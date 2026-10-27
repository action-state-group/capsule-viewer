# SPDX-License-Identifier: Apache-2.0
"""tokens/tokens.json is the one token source: every generated site (the kit's
TOKENS table and stylesheet block, both emitter shells, the report-frame
variables) must equal what scripts/gen-tokens.py generates from it."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "gen-tokens.py"


def test_generated_sites_match_the_token_source():
    run = subprocess.run([sys.executable, str(SCRIPT), "--check"], capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr


def test_a_changed_source_value_reports_every_site_that_carries_it(tmp_path):
    source = json.loads((ROOT / "tokens" / "tokens.json").read_text())
    source["palette"]["navy"] = "#000000"
    changed = tmp_path / "tokens.json"
    changed.write_text(json.dumps(source))
    run = subprocess.run(
        [sys.executable, str(SCRIPT), "--check", "--source", str(changed)], capture_output=True, text=True
    )
    assert run.returncode == 1
    for site in ("emitter-shell.html", "shell.html", "frame-tokens.generated.ts"):
        assert site in run.stdout
