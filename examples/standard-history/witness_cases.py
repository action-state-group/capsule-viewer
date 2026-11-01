# SPDX-License-Identifier: Apache-2.0
"""The witnessed History card fixtures' inputs (capsule-viewer#183): one card
and one x-standard-history/v0 block per bundle that cut_witness_fixtures.sh
seals.

  witness_cases.py AAC_PYTHON > witness_cases.json

The card is AAC's `person-3-months` vector re-derived with the reference
`derive_card` over the anchor of AAC's anchor-witness-v1 vectors
(tests/testdata/standard-history/aac/anchor-witness-v1.json, a byte copy), so
the Receipts those vectors carry are Receipts for this card's anchor. The
Receipts are TEST-KEYED: the witnesses' keys derive from public labels and the
anchor is a label digest, for those vectors only (no cll-checkpoint hashes to
it, so these blocks carry no `checkpoint`). The reader's witness list that
accepts them is the vectors' `default` policy.
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[1] / "tests" / "testdata" / "standard-history" / "aac"
ANCHOR_CASE = "pass-eddsa-time"


def main() -> None:
    sys.path.insert(0, sys.argv[1])
    from agent_action_capsule.standard_history import check_card, derive_card, is_standard

    base = {c["id"]: c["inputs"] for c in json.loads((DATA / "vectors.json").read_text("utf8"))["cases"]}["person-3-months"]
    witness = {c["name"]: c for c in json.loads((DATA / "anchor-witness-v1.json").read_text("utf8"))["cases"]}
    anchor = witness[ANCHOR_CASE]["anchor"]
    as_of = {**base["as_of"], "anchor": anchor}
    card = derive_card(holder_kind=base["card"]["holder_kind"], controller_class=base["card"]["controller_class"],
                       anchor=anchor, anchor_time=as_of["anchor_time"],
                       first_checkpoint_time=as_of["first_checkpoint_time"], policy=base["policy"], deals=base["deals"])

    def block(case: str | None) -> dict:
        b = {"policy": base["policy"], "as_of": dict(as_of)}
        if case is not None:
            assert witness[case]["anchor"] == anchor
            b["as_of"]["receipts"] = list(witness[case]["receipts"])
        return b

    cases = [
        # (name, AAC witness vector it takes its Receipts from, or None for a card with none)
        ("person-shared-unwitnessed", None),
        ("person-shared-witnessed", "pass-eddsa-time"),
        ("person-shared-witnessed-untimed", "pass-eddsa-no-time"),
        ("person-shared-witnessed-es256", "pass-es256-time"),
        ("person-shared-witness-unlisted", "unlisted-witness"),
        ("person-shared-witness-tampered", "signature-tampered"),
        ("person-shared-witnessed-asof-fails", "pass-eddsa-time"),
    ]
    out = []
    for name, case in cases:
        b = block(case)
        if name.endswith("asof-fails"):
            # The Receipts pass, but the snapshot's first checkpoint is another month than the card's `since`.
            b["as_of"]["first_checkpoint_time"] = "2026-01-05T00:00:00Z"
        props = check_card(copy.deepcopy(card), policy=b["policy"], as_of=b["as_of"], deals=None)
        out.append({"name": name, "card": card, "block": b, "witness_case": case,
                    "witness_expected": witness[case]["expected"] if case else None,
                    "expected": {"properties": props, "standard": is_standard(props)}})
    json.dump(out, sys.stdout, indent=1, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
