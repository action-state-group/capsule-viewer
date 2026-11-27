# SPDX-License-Identifier: Apache-2.0
"""The Python receipt modules as the test oracle for their module-slot twins.

``python tests/receipt_oracle.py`` prints, as one JSON document, what the
Python receipt modules make of every receipt fixture under
``testdata/receipt/`` (every ``*.bundle.json``: the single copies, the seller
and producer copies, the compositions and the golden), for each audience a
page may be for and each depth, and of a set of edited copies (the seller kind
dropped from a seller's copy, added to a buyer's; the provider's receipt with
its records edited). Per case and per module:
whether ``canRender`` accepts it, and when it does the model
(``dataclasses.asdict``, a carried member's raw verifier report left out) and
``render``'s output at each depth. The provider's module has one level, so its
output is under ``page``.

Beside each case it prints the inputs the page's runtime does not hand a
module and the Python twin reads from capsulectl's report: the verification
result, the assurance, and both for each carried copy of a composition.
``js-tests/receipt_parity.test.js`` hands the scripts these same inputs and
fails on any difference.

Regenerate the golden on Python 3.11 or later (CI's): the provider's time
cases rely on 3.11's ``datetime.fromisoformat``, which reads ``+05``,
``+0530`` and a time with no seconds; 3.10 reads none of them.
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
    ProviderReceiptModule,
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
    provider = ProviderReceiptModule()
    entry = {"can_render": provider.canRender(context)}
    if entry["can_render"]:
        model = provider.buildModel(context)
        entry["model"] = plain(model)
        entry["html"] = {"page": provider.render(model, KIT)}
    modules["provider"] = entry
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
    # A receipt whose records name no producer (a Goose-sealed one): the page
    # must not name one (capsule-viewer#328).
    bundle, output = load("keep")
    edited = copy.deepcopy(bundle)
    _strip_producers(edited)
    out.append(("keep+producer-removed", edited, report_for(edited, output), audience_of("keep")))
    # ... and one whose every record names the same producer: the page names it.
    edited = copy.deepcopy(bundle)
    name_every_producer(edited, {"name": "goose", "version": "1.2.3", "commit": "abc1234"})
    out.append(("keep+one-producer", edited, report_for(edited, output), audience_of("keep")))
    out.extend(provider_edits())
    return out


PROVIDER = "mesh-provider-selected"


def provider_edits() -> list[tuple[str, dict, dict, str]]:
    """The provider's receipt with its records edited: each way it stops being
    an exchange this node served with its payments (the cases
    tests/test_receipt_provider.py names), and amounts and times at the edges
    of what the page shows. The verifier's report is bound to the edited bytes."""
    bundle, output = load(PROVIDER)

    def edited(label: str, edit) -> tuple[str, dict, dict, str]:
        b = copy.deepcopy(bundle)
        root = next(r for r in b["records"] if r["capsule_id"] == b["root"])
        legs = [r for r in b["records"] if "settlement" in r]
        edit(b, root, legs)
        # An edit that drops records drops them from the verifier's per-record report too.
        ids = {r["capsule_id"] for r in b["records"]}
        trimmed = {**output, **{k: {i: v for i, v in output[k].items() if i in ids} for k in ("record_identity", "record_signatures")}}
        return (f"{PROVIDER}+{label}", b, report_for(b, trimmed), "keep")

    def poc(value):
        return lambda b, root, legs: root["model_attestation"]["compute_attestation"].__setitem__("x-mesh-poc-v1", value)

    def leg_status(status):
        def edit(b, root, legs):
            if status is ...:
                del legs[0]["settlement"]["status"]
            else:
                legs[0]["settlement"]["status"] = status
        return edit

    def effect_status(status):
        def edit(b, root, legs):
            if status is ...:
                del root["effect"]["status"]
            else:
                root["effect"]["status"] = status
        return edit

    def amount(member, value, index=0):
        def edit(b, root, legs):
            if value is ...:
                del legs[index]["settlement"][member]
            else:
                legs[index]["settlement"][member] = value
        return edit

    def stamp(value):
        return lambda b, root, legs: root.__setitem__("timestamp", value)

    out = [
        edited("root-is-a-leg", lambda b, root, legs: b.__setitem__("root", legs[0]["capsule_id"])),
        edited("poc-empty", poc({})),
        edited("poc-requested", poc({"serving_provenance": {}, "role": "requested"})),
        edited("poc-no-provenance", poc({"role": "served"})),
        edited("poc-gone", lambda b, root, legs: root["model_attestation"]["compute_attestation"].pop("x-mesh-poc-v1")),
        edited("poc-served", poc({"serving_provenance": {}, "role": "served"})),
        edited("poc-role-null", poc({"serving_provenance": {}, "role": None})),
        edited("no-model", lambda b, root, legs: root["model_attestation"].pop("model_id")),
    ]
    for status in ("pending", "failed", "reversed", None, ...):
        out.append(edited(f"leg-{'missing' if status is ... else status}", leg_status(status)))
    for status in ("failed", "planned", "dispatched", "refused", None, ...):
        out.append(edited(f"effect-{'missing' if status is ... else status}", effect_status(status)))
    out.append(edited("no-effect", lambda b, root, legs: root.pop("effect")))

    # capsule-viewer#465: a failed record, with each reason class the plugin
    # writes (x-mesh-poc-v1.failure_class) and one it predates; with no
    # payment (drawn only when failed); and the summary of unsealed failures.
    def failed(edit_poc=None, drop_legs=False, status="failed"):
        def edit(b, root, legs):
            root["effect"]["status"] = status
            poc = root["model_attestation"]["compute_attestation"]["x-mesh-poc-v1"]
            if status == "failed":
                poc["outcome"] = "failed"
            if edit_poc:
                edit_poc(poc)
            if drop_legs:
                b["records"] = [r for r in b["records"] if r["capsule_id"] == b["root"]]
        return edit

    for cls in ("payment_required", "refused", "upstream_error", "timeout", "dropped", "something_new"):
        out.append(edited(f"failed-{cls}", failed(lambda poc, cls=cls: poc.__setitem__("failure_class", cls))))
    for label, value in (("object", {"class": "timeout"}), ("list", [{"class": "timeout"}]), ("number", 7)):
        out.append(edited(f"failed-class-{label}", failed(lambda poc, value=value: poc.__setitem__("failure_class", value))))
    out.append(edited("failed-no-payment", failed(drop_legs=True)))
    out.append(edited("failed-timeout-no-payment", failed(lambda poc: poc.__setitem__("failure_class", "timeout"), drop_legs=True)))
    out.append(edited("dispatched-no-payment", failed(drop_legs=True, status="dispatched")))
    out.append(edited("confirmed-no-payment", failed(drop_legs=True, status="confirmed")))
    out.append(edited("dispatched-reason-ignored", failed(lambda poc: poc.__setitem__("failure_class", "refused"), status="dispatched")))
    out.append(edited(
        "failed-unsealed-summary",
        failed(lambda poc: poc.__setitem__("unsealed_failures", {"count": 3, "window_start": "2026-10-30T19:00Z", "window_s": 3600})),
    ))
    big = {"value": "9007199254740993995", "assetCode": "BTC", "assetScale": 11}
    for label, edit in (
        ("received-big", amount("received", big)),
        ("received-both-big", lambda b, root, legs: [leg["settlement"].__setitem__("received", dict(big)) for leg in legs]),
        ("received-usd", amount("received", {"value": "7", "assetCode": "USD", "assetScale": 2})),
        ("received-sats", amount("received", {"value": "12", "assetCode": "BTC", "assetScale": 8})),
        ("received-extra", amount("received", {"value": "5", "assetCode": "BTC", "assetScale": 11, "extra": 1})),
        ("received-leading-zero", amount("received", {"value": "0995", "assetCode": "BTC", "assetScale": 11})),
        ("received-negative", amount("received", {"value": "-5", "assetCode": "BTC", "assetScale": 11})),
        ("received-number", amount("received", {"value": 995, "assetCode": "BTC", "assetScale": 11})),
        ("received-scale-256", amount("received", {"value": "7", "assetCode": "USD", "assetScale": 256})),
        ("received-scale-255", amount("received", {"value": "7", "assetCode": "USD", "assetScale": 255})),
        ("received-scale-true", amount("received", {"value": "7", "assetCode": "USD", "assetScale": True})),
        ("received-no-code", amount("received", {"value": "995", "assetCode": "", "assetScale": 11})),
        ("received-gone", amount("received", ...)),
        ("fee-gone", amount("receive_fee", ..., 1)),
        ("fee-zero", amount("receive_fee", {"value": "0", "assetCode": "BTC", "assetScale": 11}, 1)),
        ("time-offset", stamp("2026-10-30T14:50:00-05:00")),
        ("time-lower-z", stamp("2026-10-30T19:50:00z")),
        ("time-fraction", stamp("2026-10-30T19:50:00.250+00:00")),
        ("time-no-seconds", stamp("2026-10-30T19:50Z")),
        ("time-space", stamp("2026-10-30 19:50:00+00:00")),
        ("time-short-offset", stamp("2026-10-30T19:50:00+05")),
        ("time-basic-offset", stamp("2026-10-30T19:50:00+0530")),
        ("time-no-offset", stamp("2026-10-30T19:50:00")),
        ("time-not-a-time", stamp("not a time")),
        ("time-year-0", stamp("0001-01-01T00:00:00+01:00")),
        ("time-year-10000", stamp("9999-12-31T23:59:59-01:00")),
        ("time-31-june", stamp("2026-06-31T10:00:00Z")),
        ("time-empty", stamp("")),
    ):
        out.append(edited(label, edit))
    return out


def name_every_producer(bundle: dict, producer: dict) -> None:
    """Every disclosed record names *producer*: in its x-deal-v0 block when it
    has one, else in its own header (a typed record, such as the sealed report)."""
    for disclosure in bundle["disclosures"].values():
        for payload in disclosure.values():
            block = payload.get("x-deal-v0")
            if isinstance(block, dict):
                block["producer"] = dict(producer)
            else:
                payload["producer"] = dict(producer)


def _strip_producers(node: object) -> None:
    if isinstance(node, dict):
        node.pop("producer", None)
        for value in node.values():
            _strip_producers(value)
    elif isinstance(node, list):
        for value in node:
            _strip_producers(value)


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
