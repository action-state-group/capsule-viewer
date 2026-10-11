# SPDX-License-Identifier: Apache-2.0
"""The three receipt manifests are disjoint over role x composition (seller
PRD section 7a): for each of four fixtures -- a buyer's single copy, a
composition carrying the buyer's own copy, a seller's single copy and a
composition carrying a seller's copy -- exactly one of
receipt.unilateral / receipt.seller / receipt.bilateral matches, each other
one fails a clause its own manifest states, and ``resolve`` selects the one
that matches without an ambiguity. Precedence is ``forbids``, never priority:
all three carry priority 1.

The resolve output for the four is committed beside the fixtures
(``testdata/receipt/disjointness.json``); ``python tests/test_receipt_disjointness.py``
rewrites it."""
from __future__ import annotations

import json
import sys
from itertools import combinations
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from receipt_helpers import PACK, PACK_SHA, RECEIPTS, audience_of, load  # noqa: E402 -- beside this file

from capsule_viewer.composed import composition_from_capsulectl  # noqa: E402
from capsule_viewer.receipt import (  # noqa: E402
    BILATERAL_MANIFEST,
    PLACEHOLDERS,
    SELLER_MANIFEST,
    UNILATERAL_MANIFEST,
    BilateralReceiptModule,
    SellerReceiptModule,
    UnilateralReceiptModule,
    receipt_registry,
    sealed_side,
)
from capsule_viewer.registry import co_matchable, descriptor, unmet  # noqa: E402
from capsule_viewer.verifier_report import context_from_capsulectl  # noqa: E402
from capsule_viewer.wording import load_wording_pack  # noqa: E402

UNILATERAL = "capsuleviewer.receipt.unilateral/v0"
SELLER = "capsuleviewer.receipt.seller/v0"
BILATERAL = "capsuleviewer.receipt.bilateral/v0"
RECEIPT_IDS = (UNILATERAL, SELLER, BILATERAL)
OUTPUT = RECEIPTS / "disjointness.json"
# (role, composition) -> the committed fixture that stands for it, and the
# module that must be the only one to match it. No fixture composes the
# seller's own keep copy; seller-bilateral carries thread A's seller copy
# (cut for the counterparty) beside a buyer's copy of the same deal.
CASES = {
    ("buyer", "unilateral"): ("keep", UNILATERAL),
    ("buyer", "composed"): ("bilateral-keep", BILATERAL),
    ("seller", "unilateral"): ("seller-keep", SELLER),
    ("seller", "composed"): ("seller-bilateral", BILATERAL),
}


def resolve_output(name: str) -> dict:
    """What the receipt registry, as ``receipt_page`` builds it, reports for
    fixture *name*: per module whether it matches and every clause it fails,
    and the resolution."""
    bundle, output = load(name)
    context, assurance = context_from_capsulectl(bundle, output)
    composition = composition_from_capsulectl(bundle, output)
    audience = audience_of(name)
    pack = load_wording_pack(PACK, PACK_SHA, PLACEHOLDERS)
    registry = receipt_registry(
        UnilateralReceiptModule(pack, audience=audience, assurance=assurance),
        SellerReceiptModule(pack, audience=audience, assurance=assurance),
        BilateralReceiptModule(pack, audience=audience, assurance=assurance, composition=composition),
    )
    d = descriptor(context)
    # Applicable: what the registry's own match (section 4.3 step 2) lists.
    listed = {e.id for e in registry.list(context, audience, "html")}
    modules = {e.id: {"applicable": e.id in listed, "unmet": list(unmet(e.manifest, d, audience, "html"))} for e in registry.entries}
    resolution = registry.resolve(context, audience, "html")
    return {
        "fixture": name,
        "audience": audience,
        "format": "html",
        "descriptor": {"bundle_kind": d.bundle_kind, "extensions": sorted(d.extensions), "profiles": sorted(d.profiles)},
        "sealed_side": sealed_side(context),
        "modules": modules,
        "resolution": {"outcome": resolution.outcome, "module": resolution.entry.id if resolution.entry else None},
    }


def all_outputs() -> dict:
    return {f"{role}/{comp}": resolve_output(name) for (role, comp), (name, _) in CASES.items()}


def test_the_three_receipt_manifests_are_pairwise_disjoint():
    manifests = (UNILATERAL_MANIFEST, SELLER_MANIFEST, BILATERAL_MANIFEST)
    assert {m["priority"] for m in manifests} == {1}  # priority separates nothing
    for a, b in combinations(manifests, 2):
        assert not co_matchable(a, b), (a["id"], b["id"])


@pytest.mark.parametrize("case", list(CASES), ids=lambda c: "/".join(c))
def test_exactly_one_receipt_module_is_applicable(case):
    name, expected = CASES[case]
    out = resolve_output(name)
    applicable = [mid for mid, m in out["modules"].items() if m["applicable"]]
    assert applicable == [expected]
    assert sorted(out["modules"]) == sorted(RECEIPT_IDS)
    for mid, m in out["modules"].items():
        assert m["applicable"] is (not m["unmet"]), mid  # the named reasons agree with the match
        if mid != expected:
            # Inapplicable for a clause its own manifest states, never for audience or format.
            assert m["unmet"], mid
            assert all(r.startswith(("requires ", "forbids ")) for r in m["unmet"]), (mid, m["unmet"])
    assert out["resolution"] == {"outcome": "module", "module": expected}


@pytest.mark.parametrize("case", list(CASES), ids=lambda c: "/".join(c))
def test_the_fixture_is_of_its_role(case):
    """The single copies' sealed records show their side; a composition's
    outer bundle carries no deal of its own, so it shows none."""
    role, comp = case
    name, _ = CASES[case]
    context, _ = context_from_capsulectl(*load(name))
    assert sealed_side(context) == (role if comp == "unilateral" else None)


def test_the_committed_resolve_output_is_current():
    committed = json.loads(OUTPUT.read_text(encoding="utf-8"))
    assert committed == all_outputs()


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps(all_outputs(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(OUTPUT)
