# SPDX-License-Identifier: Apache-2.0
"""The History card fixtures' inputs: one card and one x-standard-history/v0
block per bundle that cut_fixtures.sh seals.

  cases.py AAC_PYTHON > cases.json

AAC_PYTHON is agent-action-capsule's python/ directory at the commit
tests/testdata/standard-history/README.md names. Most cards are AAC's own
vectors (tests/testdata/standard-history/aac/vectors.json, a byte copy); the
rest are derived here with the AAC reference, `derive_card`, from deal
entries written below, and each is checked with `check_card` before it is
written, so a case states what the reference says about it.

A shared card's block carries the policy and the anchor only (`policy`,
`as_of`). A block that also carries `deals` is the holder's own copy: the
deal entries never travel with a card someone else is sent (SH §5.2, §9).
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VECTORS = HERE.parents[1] / "tests" / "testdata" / "standard-history" / "aac" / "vectors.json"


def main() -> None:
    sys.path.insert(0, sys.argv[1])
    from agent_action_capsule.standard_history import check_card, derive_card, is_standard

    vectors = {c["id"]: c["inputs"] for c in json.loads(VECTORS.read_text("utf8"))["cases"]}

    def shared(inputs: dict) -> dict:
        return {"policy": inputs["policy"], "as_of": inputs["as_of"]}

    def own(inputs: dict) -> dict:
        return {**shared(inputs), "deals": inputs["deals"]}

    def entry(ref: str, agreed_at: str, role: str, value: str, code: str, scale: int, outcome: str,
              happened: str, cls: str | None = "person_agent", disputes: list | None = None) -> dict:
        d = {"deal": ref, "agreed_at": agreed_at, "role": role,
             "amount": {"assetCode": code, "assetScale": scale, "value": value},
             "outcome": outcome, "happened": happened, "disputes": disputes or []}
        if cls is not None:
            d["counterparty_class"] = cls
        return d

    def derived(base: dict, deals: list) -> dict:
        a = base["as_of"]
        card = derive_card(holder_kind=base["card"]["holder_kind"], controller_class=base["card"]["controller_class"],
                           anchor=a["anchor"], anchor_time=a["anchor_time"],
                           first_checkpoint_time=a["first_checkpoint_time"], policy=base["policy"], deals=deals)
        return {"card": card, "policy": base["policy"], "as_of": a, "deals": deals}

    person = vectors["person-3-months"]
    # Two currencies in one decade: 10 to under 100 USD and 10 to under 100 EUR stay two rows.
    two = derived(person, [
        entry("deal-a", "2026-09-01T10:00:00Z", "provided", "4500", "USD", 2, "held", "stamped_by_both"),
        entry("deal-b", "2026-09-05T10:00:00Z", "bought", "2500", "EUR", 2, "held", "receipt_only"),
        entry("deal-c", "2026-10-02T10:00:00Z", "provided", "6000", "EUR", 2, "undecided", "no_record", cls=None),
        entry("deal-d", "2026-10-10T10:00:00Z", "bought", "800", "USD", 2, "did_not_hold", "stamped_by_both",
              disputes=[{"side": "raised", "outcome": "for", "forum": "rail"}]),
    ])
    # Every counted deal undecided: nothing on the card is drawn as agreed.
    undecided = derived(person, [
        entry("deal-u1", "2026-09-01T10:00:00Z", "provided", "4500", "USD", 2, "undecided", "no_record"),
        entry("deal-u2", "2026-09-20T10:00:00Z", "bought", "1200", "USD", 2, "undecided", "receipt_only"),
        entry("deal-u3", "2026-10-15T10:00:00Z", "bought", "500", "USD", 2, "held", "receipt_only", cls="shop_preauth"),
    ])

    cases = [
        # Positive: shared cards (counts as the holder's statement) and the holder's own copies.
        ("person-shared", person["card"], shared(person)),
        ("person-own", person["card"], own(person)),
        ("person-card-only", vectors["person-3-months-card-only"]["card"], {}),
        ("node-shared", vectors["node-all"]["card"], shared(vectors["node-all"])),
        ("node-own", vectors["node-all"]["card"], own(vectors["node-all"])),
        ("small-and-zero-shared", vectors["year-end-small-and-zero"]["card"], shared(vectors["year-end-small-and-zero"])),
        ("empty-window-shared", vectors["empty-window"]["card"], shared(vectors["empty-window"])),
        ("two-currencies-own", two["card"], own(two)),
        ("all-undecided-own", undecided["card"], own(undecided)),
        # Negative: cards the holder signed that are not standard cards. The share stated as a
        # fraction (AAC's percentage-fraction) is not among them: capsulectl seals no float, so
        # that card exists only as the vector js-tests run.
        ("neg-percentage-member", vectors["percentage-member"]["card"], shared(vectors["percentage-member"])),
        ("neg-currency-free-text", vectors["currency-free-text"]["card"], shared(vectors["currency-free-text"])),
        ("neg-counted-shop-purchase-own", vectors["counted-shop-purchase"]["card"], own(vectors["counted-shop-purchase"])),
        ("neg-window-not-in-policy", vectors["window-not-in-policy"]["card"], shared(vectors["window-not-in-policy"])),
    ]
    out = []
    for name, card, block in cases:
        props = check_card(copy.deepcopy(card), policy=block.get("policy"), as_of=block.get("as_of"),
                           deals=block.get("deals"))
        out.append({"name": name, "card": card, "block": block,
                    "expected": {"properties": props, "standard": is_standard(props)}})
    json.dump(out, sys.stdout, indent=1, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
