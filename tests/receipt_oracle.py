# SPDX-License-Identifier: Apache-2.0
"""The Python receipt modules as the test oracle for their module-slot twins.

``python tests/receipt_oracle.py`` prints, as one JSON document, what the
three Python modules make of every receipt fixture under
``testdata/receipt/`` (every ``*.bundle.json``: the single copies, the seller
and producer copies, the compositions and the golden), for each audience a
page may be for and each depth, and of a set of edited copies (the seller kind
dropped from a seller's copy, added to a buyer's). Per case and per module:
whether ``canRender`` accepts it, and when it does the model
(``dataclasses.asdict``, a carried member's raw verifier report left out) and
``render``'s output at each depth.

Beside each case it prints the inputs the page's runtime does not hand a
module and the Python twin reads from capsulectl's report: the verification
result, the assurance, and both for each carried copy of a composition.
``js-tests/receipt_parity.test.js`` hands the scripts these same inputs and
fails on any difference.
"""
from __future__ import annotations

import copy
import dataclasses
import json
import sys
from collections.abc import Mapping
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from receipt_helpers import PACK, PACK_SHA, RECEIPTS, audience_of, load, report_for  # noqa: E402 -- beside this file

from capsule_viewer.binding import check_opening  # noqa: E402
from capsule_viewer.composed import carried_parts, composition_from_capsulectl  # noqa: E402
from capsule_viewer.kit.contract import KIT  # noqa: E402
from capsule_viewer.receipt import (  # noqa: E402
    PLACEHOLDERS,
    BilateralReceiptModule,
    SellerReceiptModule,
    UnilateralReceiptModule,
)
from capsule_viewer.verifier_report import VerifierReportError, context_from_capsulectl  # noqa: E402
from capsule_viewer.wording import load_wording_pack  # noqa: E402

AUDIENCES = ("keep", "counterparty", "adjudicator")
DEPTHS = ("L0", "L1", "L2")
SELLER_KIND = "x-deal-seller/v0"


def plain(value: object) -> object:
    """A model as JSON: dataclasses as objects, tuples as arrays, sets sorted."""
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        out = {f.name: plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
        if "report" in out and "refusal_signature" in out:  # composed.Member: the raw report is the oracle's input, not the model
            out["report"] = None
        return out
    if isinstance(value, Mapping):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [plain(v) for v in value]
    if isinstance(value, (set, frozenset)):
        return sorted(plain(v) for v in value)
    return value


def _module(kind: str, pack, depth: str, audience: str, assurance, composition):
    if kind == "unilateral":
        return UnilateralReceiptModule(pack, depth, audience, assurance, check_opening)
    if kind == "seller":
        return SellerReceiptModule(pack, depth, audience, assurance, check_opening)
    return BilateralReceiptModule(pack, depth, audience, assurance, composition, check_opening)


def case(name: str, bundle: dict, output: dict, audience: str, depths=DEPTHS, edited: bool = False) -> dict:
    context, assurance = context_from_capsulectl(bundle, output)
    composition = composition_from_capsulectl(bundle, output)
    pack = load_wording_pack(PACK, PACK_SHA, PLACEHOLDERS)
    members = {}
    if composition is not None:
        try:
            for part in carried_parts(context, composition):
                members[part.member.id] = {"verification": plain(part.context.verification), "assurance": plain(part.assurance)}
        except VerifierReportError:
            pass
    modules = {}
    for kind in ("unilateral", "seller", "bilateral"):
        module = _module(kind, pack, "L0", audience, assurance, composition)
        entry: dict = {"can_render": module.canRender(context)}
        if entry["can_render"]:
            model = module.buildModel(context)
            entry["model"] = plain(model)
            entry["html"] = {d: _module(kind, pack, d, audience, assurance, composition).render(model, KIT) for d in depths}
        modules[kind] = entry
    return {
        "name": name,
        "audience": audience,
        "bundle": bundle if edited else None,
        "verify": output if edited else None,
        "env": {"verification": plain(context.verification), "assurance": plain(assurance), "members": members},
        "modules": modules,
    }


def edits() -> list[tuple[str, dict, dict, str]]:
    """Copies whose packaging and sealed side disagree: the seller kind dropped
    from each seller's copy, added to each buyer's single copy. The verifier's
    report is the original one, bound to the edited bytes (the extensions block
    is not sealed, so every record still verifies)."""
    out = []
    for path in sorted(RECEIPTS.glob("*.bundle.json")):
        name = path.name.removesuffix(".bundle.json")
        bundle, output = load(name)
        extensions = bundle.get("extensions", {})
        if "composed/v1" in extensions:
            continue
        edited = copy.deepcopy(bundle)
        if SELLER_KIND in extensions:
            del edited["extensions"][SELLER_KIND]
            label = f"{name}+seller-kind-dropped"
        else:
            edited["extensions"][SELLER_KIND] = {}
            label = f"{name}+seller-kind-added"
        out.append((label, edited, report_for(edited, output), audience_of(name)))
    return out


def main() -> int:
    cases = []
    for path in sorted(RECEIPTS.glob("*.bundle.json")):
        name = path.name.removesuffix(".bundle.json")
        bundle, output = load(name)
        for audience in AUDIENCES:
            cases.append(case(name, bundle, output, audience))
    for label, bundle, output, audience in edits():
        cases.append(case(label, bundle, output, audience, depths=("L2",), edited=True))
    json.dump({"cases": cases, "audience_of": {c["name"]: audience_of(c["name"]) for c in cases if "+" not in c["name"]}}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
