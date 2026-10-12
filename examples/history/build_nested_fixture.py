# SPDX-License-Identifier: Apache-2.0
"""Build the nested-shape History Card fixtures, a STAND-IN until the container
verb exists (neutral [deal-history-container-verb]; see
tests/testdata/history/README.md):

* tests/testdata/history/nested-selection.bundle.json: the design fixture's
  eight records regrouped into one member bundle per picked deal, nested under
  the selection block's ``deals`` the way ``x-deal-sale/v0`` nests a sale's
  threads;
* tests/testdata/history/nested-mutant-flipped-outcome.bundle.json: the same,
  with one outcome flipped in what the card states
  (``capsule_viewer.history.fixture.flip_one_outcome``).

    PYTHONPATH=src python3 examples/history/build_nested_fixture.py

Nothing is re-signed or re-sealed: the records, their capsule ids and their
disclosures are the design fixture's own bytes (built through the account core
and agent-action-capsule's ``compute_capsule_id``). The member bundles carry no
checkpoint, completeness certificate or signature, so none of these files
verifies; they pin the shape, the selection and the recompute only.
Deterministic: the same bytes every time.
"""
from __future__ import annotations

import json
from pathlib import Path

from capsule_viewer.history.fixture import flip_one_outcome

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "tests" / "testdata" / "history"
FLAT = DATA / "selection.bundle.json"
NESTED = DATA / "nested-selection.bundle.json"
MUTANT = DATA / "nested-mutant-flipped-outcome.bundle.json"
SELECTION_EXTENSION = "x-history-selection/v0"


def nested(flat: dict) -> dict:
    """*flat* with its records moved into one member bundle per deal, the deal
    being the sealed ``action_id``'s deal part (``deal-example-01/6``)."""
    deals: dict[str, dict] = {}
    for record in flat["records"]:
        deal = record["action_id"].split("/", 1)[0]
        member = deals.setdefault(deal, {
            "bundle_kind": "evidence-bundle/v2",
            "bundle_version": "2",
            "disclosures": {},
            "extensions": {"x-deal-v0": {}},
            "records": [],
        })
        member["records"].append(record)
        member["disclosures"][record["capsule_id"]] = flat["disclosures"][record["capsule_id"]]
    block = dict(flat["extensions"][SELECTION_EXTENSION])
    block["deals"] = deals
    return {
        "bundle_kind": flat["bundle_kind"],
        "bundle_version": flat["bundle_version"],
        "disclosures": {},
        "extensions": {SELECTION_EXTENSION: block},
        "records": [],
    }


def _dump(value: dict) -> str:
    return json.dumps(value, indent=1, sort_keys=True, ensure_ascii=False) + "\n"


def build() -> dict[Path, str]:
    container = nested(json.loads(FLAT.read_text(encoding="utf-8")))
    return {NESTED: _dump(container), MUTANT: _dump(flip_one_outcome(container))}


if __name__ == "__main__":
    for path, text in build().items():
        path.write_text(text, encoding="utf-8")
