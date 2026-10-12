# SPDX-License-Identifier: Apache-2.0
"""The History Card's mutants, each one edit of the real counterparty History
that ``cut_fixtures.sh`` wrote. Nothing is re-sealed or re-signed.

    python3 examples/history/make_mutants.py HISTORY OTHER SECOND OUT_DIR

HISTORY is the counterparty History; OTHER is a History of one more deal of
the same holder (same key, not picked); SECOND is a History of one deal of a
second profile (another key). Writes into OUT_DIR:

* ``mutant-flipped-outcome.bundle.json``: the closed deal's copy says the
  deal failed (its report's outcome step and its close line) where the real
  copy says it completed; the selection still names the real copy's digest;
* ``mutant-mixed-signer.bundle.json``: the second profile's deal spliced in
  beside the picked deals (records signed by another key);
* ``mutant-not-in-selection.bundle.json``: the holder's own unpicked deal
  spliced in beside the picked deals (same key, not in the sealed selection);
* ``mutant-selection-not-root.bundle.json``: the outer bundle's ``root``
  names another capsule id, so the selection record is not its root;
* ``mutant-not-history-log.bundle.json``: the outer bundle's completeness
  certificate names a deal's log (``deal-...``), not ``deal-history``.
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

EXT = "x-history-selection/v0"


def _load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _only_deal(history: dict) -> tuple[str, dict]:
    (deal_id, member), = history["extensions"][EXT]["deals"].items()
    return deal_id, member


def flipped_outcome(history: dict) -> dict:
    out = copy.deepcopy(history)
    flipped = 0
    for member in out["extensions"][EXT]["deals"].values():
        report = member["extensions"]["x-deal-v0"]
        for step in report.get("steps", []):
            if step.get("kind") == "outcome" and "(completed)" in step.get("line", ""):
                step["line"] = step["line"].replace("received (completed)", "not received (failed)")
                flipped += 1
        for did in report.get("did", []):
            if did.get("kind") == "close" and "completed as agreed" in did.get("text", ""):
                did["text"] = did["text"].replace("completed as agreed", "failed")
    if flipped != 1:
        raise SystemExit(f"expected one completed outcome step to flip, found {flipped}")
    return out


def spliced(history: dict, donor: dict) -> dict:
    out = copy.deepcopy(history)
    deal_id, member = _only_deal(donor)
    deals = out["extensions"][EXT]["deals"]
    if deal_id in deals:
        raise SystemExit(f"{deal_id} is already carried")
    deals[deal_id] = copy.deepcopy(member)
    return out


def selection_not_root(history: dict) -> dict:
    out = copy.deepcopy(history)
    if out["root"] != out["extensions"][EXT]["selection_record"]:
        raise SystemExit("the selection record is not the root of the History as cut")
    out["root"] = "0" * 64
    return out


def not_history_log(history: dict) -> dict:
    out = copy.deepcopy(history)
    cert = out["completeness_certificate"]
    if cert["log_id"] != "deal-history":
        raise SystemExit(f"the History as cut is on log {cert['log_id']!r}, not deal-history")
    cert["log_id"] = next(iter(out["extensions"][EXT]["deals"]))
    return out


def main(argv: list[str]) -> int:
    history, other, second, out_dir = argv
    base = _load(history)
    files = {
        "mutant-flipped-outcome": flipped_outcome(base),
        "mutant-mixed-signer": spliced(base, _load(second)),
        "mutant-not-in-selection": spliced(base, _load(other)),
        "mutant-selection-not-root": selection_not_root(base),
        "mutant-not-history-log": not_history_log(base),
    }
    for name, value in files.items():
        Path(out_dir, f"{name}.bundle.json").write_text(json.dumps(value, separators=(",", ":")), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
