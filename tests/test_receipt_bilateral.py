# SPDX-License-Identifier: Apache-2.0
"""The bilateral receipt module over real capsulectl copies composed into
composed/v1 bundles that capsulectl verified: selection beside every other
manifest, each copy read only through its own context, one deal or not, the
joins as the verifier derived them, the audiences, depth and every refusal."""
from __future__ import annotations

import copy
import json
import re
from dataclasses import replace
from pathlib import Path

import jsonschema
import pytest
from receipt_helpers import (
    BILATERAL,
    FIXTURES,
    PACK,
    PACK_SHA,
    Doc,
    audience_of,
    load,
    party_text,
    render,
    report_for,
    snapshot,
)

from capsule_viewer.binding import check_opening
from capsule_viewer.composed import Composition, carried_parts, composition_from_capsulectl, thaw
from capsule_viewer.context import build_context
from capsule_viewer.digest import bundle_digest
from capsule_viewer.kit.contract import check_module_renders
from capsule_viewer.receipt import (
    BILATERAL_MANIFEST,
    PLACEHOLDERS,
    BilateralReceiptModule,
    ReceiptUnavailable,
    UnilateralReceiptModule,
    bilateral_manifest,
    build_bilateral,
    build_receipt,
    receipt_page,
    unilateral_manifest,
)
from capsule_viewer.receipt.bilateral import one_deal, page_may_show
from capsule_viewer.receipt.model import named_deals
from capsule_viewer.registry import AmbiguityError, Registry, co_matchable
from capsule_viewer.shell import NO_PRESENTATION, present
from capsule_viewer.verifier_report import Assurance, context_from_capsulectl
from capsule_viewer.wording import load_wording_pack

AAC = Path(__file__).parent / "testdata" / "aac-presentation"
SCHEMA = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
BUILTINS = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((AAC / "builtin").glob("*.json"))}
GENERIC = json.loads((AAC / "examples" / "example-generic-fallback.json").read_text(encoding="utf-8"))
# agent-action-capsule ts/src/builtin-manifests.ts BUILTIN_MANIFEST_COMPOSED at
# ab4ee43: the generic composition section. It is a SECTION, resolved in a
# registry of its own and drawn after the page module, never a page module.
BUILTIN_COMPOSED = {
    "spec_version": "aac.presentation-manifest/v0",
    "id": "aac.builtin.composed/v0",
    "presentation_api": "aac.presentation-api/v0",
    "runtime_min": "0.1.0",
    "trust_class": "trusted-executable",
    "requires": {"bundle_kind": "evidence-bundle/v2", "extensions": {"required": ["composed/v1"]}},
    "audiences": ["*"],
    "formats": ["html", "fragment", "embedded"],
    "fallback": False,
    "priority": 1,
    "executable": {"carrier": "core-runtime"},
}
RULES_PROFILE = "spec_version:org.example.rules_compare/v0"
RULES = {
    "spec_version": "aac.presentation-manifest/v0",
    "id": "org.example.rules/v0",
    "presentation_api": "aac.presentation-api/v0",
    "runtime_min": "0.1.0",
    "trust_class": "trusted-executable",
    "requires": {"bundle_kind": "evidence-bundle/v2", "profiles": [RULES_PROFILE]},
    "forbids": {"profiles": ["result_version:evidence-result-v0"]},
    "audiences": ["*"],
    "formats": ["html"],
    "fallback": False,
    "priority": 1,
    "executable": {"carrier": "core-runtime"},
}
BILATERAL_ID = "capsuleviewer.receipt.bilateral/v0"
UNILATERAL_ID = "capsuleviewer.receipt.unilateral/v0"
CONFIGURED = bilateral_manifest([RULES_PROFILE])
WORDS = load_wording_pack(PACK, PACK_SHA, PLACEHOLDERS)
OK = ("bilateral-keep", "bilateral-counterparty", "bilateral-adjudicator")


def _read(name: str, bundle: Doc | None = None, output: Doc | None = None):
    raw_bundle, raw_output = load(name)
    bundle = bundle or raw_bundle
    output = output or (report_for(bundle, raw_output) if bundle is not raw_bundle else raw_output)
    context, assurance = context_from_capsulectl(bundle, output)
    return context, assurance, composition_from_capsulectl(bundle, output)


def _bilateral(name: str, audience: str | None = None, depth: str = "L2") -> BilateralReceiptModule:
    _, assurance, composition = _read(name)
    return BilateralReceiptModule(WORDS, depth, audience or audience_of(name), assurance, composition, forbid_profiles=[RULES_PROFILE])


def full_registry(name: str, audience: str | None = None) -> Registry:
    """Both receipt modules beside the built-ins, the rules module and the
    generic fallback, configured as a deployment registering the rules module."""
    registry = Registry()
    for manifest in (*BUILTINS.values(), RULES, GENERIC):
        if manifest["id"] == "aac.builtin.no-aggregate/v0":
            continue  # a second fallback: the generic example stands for the fallback tier
        registry.register(manifest, lambda _c: True)
    audience = audience or audience_of(name)
    _, assurance, _ = _read(name)
    unilateral = UnilateralReceiptModule(WORDS, "L2", audience, assurance, forbid_profiles=[RULES_PROFILE])
    registry.register(unilateral.manifest_json, unilateral.canRender, unilateral)
    bilateral = _bilateral(name, audience)
    registry.register(bilateral.manifest_json, bilateral.canRender, bilateral)
    return registry


# ---- the manifest ------------------------------------------------------------


def test_the_manifest_is_schema_valid():
    validator = jsonschema.Draft202012Validator({**SCHEMA, "$ref": "#/$defs/PresentationManifest"})
    assert sorted(validator.iter_errors(BILATERAL_MANIFEST), key=str) == []
    assert list(validator.iter_errors({**BILATERAL_MANIFEST, "title": "words belong in the pack"}))


def test_the_manifest_requires_the_composition_and_forbids_a_single_copy():
    assert BILATERAL_MANIFEST["id"] == BILATERAL_ID
    assert BILATERAL_MANIFEST["requires"]["extensions"]["required"] == ["composed/v1"]
    assert "x-deal-v0" in BILATERAL_MANIFEST["forbids"]["extensions"]
    assert not any(t.startswith("spec_version:org.") for t in BILATERAL_MANIFEST["forbids"]["profiles"])


SPECIFIC = [m for m in (*BUILTINS.values(), RULES, unilateral_manifest([RULES_PROFILE])) if not m["fallback"]]


def test_every_specific_manifest_is_compared():
    assert len(SPECIFIC) == 7  # five built-ins, the rules module and the unilateral receipt


@pytest.mark.parametrize("other", SPECIFIC, ids=lambda m: m["id"])
def test_never_ambiguous_with_a_specific_module(other):
    assert not co_matchable(CONFIGURED, other)


def test_the_two_receipt_manifests_exclude_each_other_both_ways():
    """Each forbids what the other requires: no bundle can match both."""
    assert not co_matchable(BILATERAL_MANIFEST, unilateral_manifest())
    loose = copy.deepcopy(unilateral_manifest())
    del loose["forbids"]["extensions"]
    assert not co_matchable(BILATERAL_MANIFEST, loose)  # the bilateral forbid alone holds it
    loose_bilateral = copy.deepcopy(BILATERAL_MANIFEST)
    del loose_bilateral["forbids"]["extensions"]
    assert co_matchable(loose_bilateral, loose)  # mutant: neither forbids, both match


def test_the_registration_test_bites():
    """Mutant: drop the profile forbids; registration must refuse it beside
    the report-rows built-in and, unconfigured, beside the rules module."""
    loose = copy.deepcopy(CONFIGURED)
    loose["forbids"]["profiles"] = []
    registry = Registry()
    registry.register(BUILTINS["builtin-report-rows"], lambda _c: True)
    with pytest.raises(AmbiguityError) as err:
        registry.register(loose, lambda _c: True)
    assert BILATERAL_ID in err.value.ids
    registry = Registry()
    registry.register(RULES, lambda _c: True)
    with pytest.raises(AmbiguityError):
        registry.register(BILATERAL_MANIFEST, lambda _c: True)
    registry.register(CONFIGURED, lambda _c: True)


def test_the_generic_composition_section_is_not_a_page_module():
    """AAC's composition section matches every composition, so in the page
    registry it would tie with this module. It lives in a registry of its own;
    here the module draws it in L2."""
    assert co_matchable(BILATERAL_MANIFEST, BUILTIN_COMPOSED)
    html = render("bilateral-adjudicator", "L2")
    assert "Composition closure covers the declared members only" in html


# ---- acceptance (1): selection -------------------------------------------------


@pytest.mark.parametrize("name", OK)
def test_each_bilateral_fixture_selects_only_the_bilateral_module(name):
    context, _, _ = _read(name)
    registry = full_registry(name)
    matched = registry.list(context, audience_of(name), "html")
    assert [e.id for e in matched] == [GENERIC["id"], BILATERAL_ID]  # one specific, one fallback: tiers never tie
    resolution = registry.resolve(context, audience_of(name), "html")
    assert resolution.outcome == "module"
    assert resolution.entry.id == BILATERAL_ID


@pytest.mark.parametrize("name", FIXTURES)
def test_each_single_copy_still_selects_only_the_unilateral_module(name):
    context, _, composition = _read(name)
    assert composition is None
    registry = full_registry(name)
    assert [e.id for e in registry.list(context, audience_of(name), "html")] == [GENERIC["id"], UNILATERAL_ID]
    assert registry.resolve(context, audience_of(name), "html").entry.id == UNILATERAL_ID


def test_an_outer_deal_extension_is_not_this_shape():
    """The agreed shape carries x-deal-v0 inside the copies only. One on the
    outer bundle is forbidden: no receipt module takes it."""
    bundle = copy.deepcopy(load("bilateral-counterparty")[0])
    bundle["extensions"]["x-deal-v0"] = {"sealed_report": "0" * 64}
    context, _, _ = _read("bilateral-counterparty", bundle)
    assert full_registry("bilateral-counterparty").resolve(context, "counterparty", "html").entry.id == GENERIC["id"]
    loose = copy.deepcopy(BILATERAL_MANIFEST)
    loose["forbids"]["extensions"] = []
    registry = Registry()
    registry.register(loose, lambda _c: True)
    assert registry.resolve(context, "counterparty", "html").entry.id == BILATERAL_ID  # mutant: the forbid is what refuses it


# ---- each copy through its own context ----------------------------------------


@pytest.mark.parametrize("name", OK)
def test_the_module_meets_the_kit_contract(name):
    context, _, _ = _read(name)
    html = check_module_renders(_bilateral(name), context)
    assert all(f'data-level="{level}"' in html for level in ("L0", "L1", "L2"))


def test_each_copy_is_its_own_page_inside_the_composition():
    """Each copy's records show exactly as that copy rendered alone shows them:
    the same disclosure state, log place and facts."""
    bundle, output = load("bilateral-counterparty")
    page = snapshot(render("bilateral-counterparty"))
    context, _, composition = _read("bilateral-counterparty")
    parts = carried_parts(context, composition)
    assert len(parts) == 2
    for part in parts:
        alone = snapshot(receipt_page(part.context, part.assurance, PACK, PACK_SHA, audience="counterparty", depth="L2"))
        assert alone, part.member.id
        assert {cid: page[cid] for cid in alone} == alone


def test_no_copy_is_filled_from_the_other():
    """The seller's copy discloses the item and the amount; the buyer's copy
    withholds them. The buyer's copy still shows WITHHELD in their place."""
    html = render("bilateral-counterparty", "L2")
    buyer, seller = party_text(html, "party-a"), party_text(html, "party-b")
    assert "cat sticker" in seller and "6.27 USD" in seller
    assert "cat sticker" not in buyer and "6.27 USD" not in buyer
    assert re.search(r"Deal WITHHELD Item WITHHELD Amount WITHHELD", buyer)


def test_each_party_shows_only_its_own_records():
    html = render("bilateral-counterparty", "L2")
    bundle = load("bilateral-counterparty")[0]
    members = {m["id"]: {r["capsule_id"] for r in m["bundle"]["records"]} for m in bundle["extensions"]["composed/v1"]["members"]}
    assert not members["party-a"] & members["party-b"]
    shown = snapshot(html)
    # Every step of both copies, and none of the container's records. (The
    # sealed reports are listed in each copy's L2 table, not as steps.)
    reports = {
        r["capsule_id"]
        for m in bundle["extensions"]["composed/v1"]["members"]
        for r in m["bundle"]["records"]
        if r["action_id"] == "capsulectl-deal-report"
    }
    assert reports
    assert set(shown) == (members["party-a"] | members["party-b"]) - reports
    for party, records in members.items():
        other = members["party-b" if party == "party-a" else "party-a"]
        text = party_text(html, party)
        assert all(cid not in text for cid in other), party
        assert all(cid in text for cid in records), party


def test_the_buyers_withheld_steps_show_withheld_and_their_log_place_only():
    page = snapshot(render("bilateral-counterparty"))
    buyer = load("bilateral-counterparty")[0]["extensions"]["composed/v1"]["members"][0]["bundle"]
    withheld = {r["capsule_id"] for r in buyer["records"]} & {cid for cid, r in page.items() if r["disclosure"] == "withheld"}
    assert len(withheld) == 4  # four of the six steps; the reports are not steps
    for cid in withheld:
        assert page[cid]["facts"] == {}, cid
        assert re.fullmatch(r"deal/deal-0b11a7e2a1c0ffee:\d+:\d+", page[cid]["log"]), cid


def _keep_only_values() -> dict[str, dict[str, str]]:
    """The buyer's keep copy's facts, per record (bilateral-keep, party-a)."""
    page = snapshot(render("bilateral-keep"))
    keep = load("bilateral-keep")[0]["extensions"]["composed/v1"]["members"][0]["bundle"]
    return {cid: page[cid]["facts"] for cid in (r["capsule_id"] for r in keep["records"]) if cid in page}


def _leaks(html: str) -> tuple[int, list[tuple[str, str]]]:
    """Each value the buyer's keep copy shows from a step the buyer's
    counterparty copy withholds, found in what the page shows for the buyer's
    copy -- except where the share builder's own lines in that copy state it."""
    keep = _keep_only_values()
    withheld = {cid for cid, r in snapshot(render("bilateral-counterparty")).items() if r["disclosure"] == "withheld"}
    copy_ = load("bilateral-counterparty")[0]["extensions"]["composed/v1"]["members"][0]["bundle"]
    shared_lines = json.dumps(copy_["disclosures"][copy_["extensions"]["x-deal-v0"]["sealed_report"]], ensure_ascii=False)
    buyer = party_text(html, "party-a")
    checked, leaked = 0, []
    for cid, facts in keep.items():
        if cid not in withheld:
            continue
        for value in facts.values():
            # Under four characters is too short to find by text; the
            # structural check (no facts on a withheld step) covers it.
            if len(value) < 4 or value in shared_lines:
                continue
            checked += 1
            if re.search(rf"(?<![\w.-]){re.escape(value)}(?![\w.-])", buyer):
                leaked.append((cid, value))
    return checked, leaked


def test_the_counterparty_page_never_shows_what_the_buyers_withheld_records_hold():
    checked, leaked = _leaks(render("bilateral-counterparty", "L2"))
    assert checked >= 8
    assert leaked == []


class _Filling(BilateralReceiptModule):
    """Mutant: fills the buyer copy's withheld steps from the buyer's keep copy."""

    def buildModel(self, context):  # noqa: N802 -- the contract's member name
        model = super().buildModel(context)
        keep_context, _, keep_composition = _read("bilateral-keep")
        keep_part = carried_parts(keep_context, keep_composition)[0]
        keep = build_receipt(keep_part.context, check_opening, keep_part.assurance, "keep")
        buyer = model.parties[0]
        steps = tuple(
            replace(s, facts=keep.step(s.capsule_id).facts, disclosure="disclosed")
            if s.disclosure == "withheld" and keep.step(s.capsule_id) else s
            for s in buyer.receipt.steps
        )
        return replace(model, parties=(replace(buyer, receipt=replace(buyer.receipt, steps=steps)), *model.parties[1:]))


def test_the_leak_check_bites():
    context, assurance, composition = _read("bilateral-counterparty")
    module = _Filling(WORDS, "L2", "counterparty", assurance, composition)
    registry = Registry()
    registry.register(module.manifest_json, module.canRender, module)
    assert _leaks(present(context, registry, audience="counterparty"))[1] != []


# ---- one deal, and the joins ---------------------------------------------------


@pytest.mark.parametrize("name", OK)
def test_the_copies_of_one_deal_say_so(name):
    html = render(name, "L0")
    assert 'data-deal-state="agree"' in html
    assert "Both copies name one deal: deal-0b11a7e2a1c0ffee." in html


def test_copies_of_two_deals_are_never_shown_as_one():
    html = render("bilateral-two-deals", "L0")
    assert 'data-deal-state="mismatch"' in html
    assert "deal-0b11a7e2a1c0ffee, deal-13e2031a72264d22" in html
    assert "Both copies name one deal" not in html
    context, assurance, composition = _read("bilateral-two-deals")
    model = build_bilateral(context, composition, check_opening, assurance, "counterparty")
    assert (model.deal_state, model.deal) == ("mismatch", None)
    assert model.named == ("deal-0b11a7e2a1c0ffee", "deal-13e2031a72264d22")


@pytest.mark.parametrize(
    ("named", "state"),
    [
        ([{"d1"}, {"d1"}], "agree"),
        ([{"d1"}, {"d2"}], "mismatch"),
        ([{"d1", "d2"}, {"d1"}], "mismatch"),  # a copy naming two deals: never picked
        ([{"d1", "d2"}, {"d1", "d2"}], "mismatch"),
        ([set(), {"d1"}], "unnamed"),
    ],
)
def test_one_deal_rule(named, state):
    assert one_deal([frozenset(n) for n in named])[0] == state


def test_each_join_shows_what_was_declared_and_what_the_verifier_derived():
    html = render("bilateral-adjudicator", "L0")
    joins = re.findall(r'<li data-join-basis="([^"]+)" data-join-declared="([^"]+)" data-join-derived="([^"]+)" data-join-result="([^"]+)" data-corroboration="([^"]+)"', html)
    assert joins == [
        ("pre_agreed_identifier", "agree", "agree", "derived_matches", "corroborating"),
        ("shared_artifact_digest", "mismatch", "mismatch", "derived_matches", "not_applicable"),
    ]
    assert "Shared artifact digest: declared mismatch; the verifier derived mismatch." in html


def test_the_joins_come_from_the_verifier_not_the_bundle():
    """The verifier's derived state is what is shown: a report that derived
    unjoined shows unjoined, whatever the block declares."""
    bundle, output = load("bilateral-counterparty")
    output = copy.deepcopy(output)
    composed = next(e for e in output["extensions"] if e["kind"] == "composed/v1")["composed"]
    composed["joins"][0].update(derived="unjoined", result="join_state_mismatch")
    composed["corroboration"][0] = {"members": ["party-a", "party-b"], "result": "not_applicable"}
    html = render("bilateral-counterparty", "L0", output=output, bundle=copy.deepcopy(bundle))
    assert 'data-join-derived="unjoined"' in html
    assert "What was declared is not what the verifier derived." in html


def test_the_composition_section_shows_the_differences():
    html = render("bilateral-adjudicator", "L2")
    assert "Differing values: party-a – party-b" in html
    assert "party-a: &quot;send_payment&quot;" in html and "party-b: does not resolve" in html
    assert "corroborating, on declared custody" in html


def test_roles_are_shown_as_declared():
    html = render("bilateral-counterparty", "L0")
    assert "buyer copy (party-a)" in html and "seller copy (party-b)" in html


# ---- audiences -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("audience", "cuts", "ok"),
    [
        ("counterparty", ["counterparty", "counterparty"], True),
        ("adjudicator", ["adjudicator", "adjudicator"], True),
        ("keep", ["keep", "counterparty"], True),
        ("keep", ["counterparty", "counterparty"], True),
        ("keep", ["keep", "keep"], False),  # two parties' own copies on one page
        ("counterparty", ["keep", "counterparty"], False),
        ("adjudicator", ["counterparty", "adjudicator"], False),
        ("auditor", ["counterparty", "counterparty"], False),
    ],
)
def test_which_copies_a_page_may_show(audience, cuts, ok):
    assert page_may_show(audience, cuts) is ok


@pytest.mark.parametrize(("name", "audience"), [("bilateral-keep", "counterparty"), ("bilateral-keep", "adjudicator"), ("bilateral-counterparty", "adjudicator")])
def test_a_copy_cut_for_someone_else_is_never_shown(name, audience):
    """The buyer's keep copy asked for as a shared page: declined, and the
    page says no presentation is available."""
    context, _, _ = _read(name)
    assert _bilateral(name, audience).canRender(context) is False
    assert full_registry(name, audience).resolve(context, audience, "html").entry.id == GENERIC["id"]
    assert NO_PRESENTATION in render(name, audience=audience)


def test_the_keep_page_shows_the_own_copy_and_the_one_handed_over():
    html = render("bilateral-keep", "L0")
    assert re.findall(r'data-party="(party-[ab])" data-cut="(\w+)"', html) == [("party-a", "keep"), ("party-b", "counterparty")]


# ---- refusals ------------------------------------------------------------------


def test_no_composition_result_is_declined():
    context, assurance, _ = _read("bilateral-counterparty")
    with pytest.raises(ReceiptUnavailable):
        build_bilateral(context, None, check_opening, assurance, "counterparty")
    malformed = Composition("fail", ("observers",), malformed=True)
    with pytest.raises(ReceiptUnavailable):
        build_bilateral(context, malformed, check_opening, assurance, "counterparty")


@pytest.mark.parametrize("change", ["refusal", "declared_missing", "one"])
def test_only_two_carried_copies_are_a_bilateral_receipt(change):
    context, assurance, composition = _read("bilateral-counterparty")
    a, b = composition.members
    members = {
        "refusal": (a, replace(b, outcome="refusal")),
        "declared_missing": (a, replace(b, body="declared_missing")),
        "one": (a,),
    }[change]
    with pytest.raises(ReceiptUnavailable):
        build_bilateral(context, replace(composition, members=members), check_opening, assurance, "counterparty")
    assert build_bilateral(context, composition, check_opening, assurance, "counterparty").deal_state == "agree"


def test_a_copy_whose_report_is_for_other_bytes_is_declined():
    """The seller's copy edited inside the composition: the outer report is
    re-bound to the edited bundle, the member's own report is not. The copy's
    report then names other bytes, and the module declines."""
    bundle, output = load("bilateral-counterparty")
    bundle = copy.deepcopy(bundle)
    seller = bundle["extensions"]["composed/v1"]["members"][1]["bundle"]
    report_id = seller["extensions"]["x-deal-v0"]["sealed_report"]
    seller["disclosures"][report_id]["agent_input"]["deal_id"] = "deal-forged"
    context, assurance, composition = _read("bilateral-counterparty", bundle, report_for(bundle, output))
    with pytest.raises(ReceiptUnavailable, match="not this one"):
        build_bilateral(context, composition, check_opening, assurance, "counterparty")
    assert NO_PRESENTATION in render("bilateral-counterparty", bundle=bundle, output=report_for(bundle, output))


def test_an_unverified_composition_gets_the_refusal():
    bundle, output = load("bilateral-counterparty")
    output = {**copy.deepcopy(output), "verdict": "INVALID"}
    html = render("bilateral-counterparty", bundle=copy.deepcopy(bundle), output=report_for(bundle, output))
    assert "This bundle did not verify" in html
    assert "party-a" not in html


# ---- depth and words -----------------------------------------------------------


@pytest.mark.parametrize(("depth", "l1", "l2"), [("L0", False, False), ("L1", True, False), ("L2", True, True)])
def test_depth_opens_levels_and_never_removes_one(depth, l1, l2):
    html = render("bilateral-counterparty", depth)
    for level, opened in (("L1", l1), ("L2", l2)):
        region = html.split(f'data-level="{level}"', 1)[1]
        assert (re.match(r">\s*<details[^>]*\sopen", region) is not None) is opened, level
    # Every level is in the document at every depth (printing and I4).
    assert snapshot(html) == snapshot(render("bilateral-counterparty", "L2"))


def test_every_bilateral_word_is_in_the_pack_and_takes_its_placeholders():
    used = {"bilateral.title", "deal.agree", "deal.mismatch", "deal.unnamed", "party.heading", "party.role_undeclared",
            "parts.own", "joins.heading", "joins.none", "join.line", "join.result.join_state_mismatch",
            "corroboration.corroborating", "corroboration.redundant", "l2.composition", "fact.disposition"}
    assert used <= set(WORDS.entries)
    for name in BILATERAL:
        assert not re.search(r"\[[a-z0-9_]+(\.[a-z0-9_]+)+\]", render(name, "L2")), name  # a key the pack lacks


def test_the_example_pack_never_claims_enforcement():
    words = " ".join(WORDS.entries.values()).lower()
    assert not re.search(r"\b(protect|protects|protected|block|blocks|blocked|stop|stops|stopped)\b", words)


def test_typed_records_show_their_sealed_type_and_facts():
    """The seller's copy is in typed records: each shows its own type as
    sealed, and the act its amount."""
    context, assurance, composition = _read("bilateral-keep")
    seller = build_bilateral(context, composition, check_opening, assurance, "keep").parties[1].receipt
    types = [s.record_type for s in seller.steps if s.disclosure == "disclosed"]
    assert "proposed-action/v0" in types and "action-record/v0" in types
    acted = [s for s in seller.steps if s.record_type == "action-record/v0"]
    assert [f.value for s in acted for f in s.facts if f.name == "amount"] == ["6.27 USD", "6.27 USD"]
    assert seller.headline.amount.value == "6.27 USD"


def test_the_assurance_shown_is_each_copys_own():
    context, assurance, composition = _read("bilateral-counterparty")
    model = build_bilateral(context, composition, check_opening, assurance, "counterparty")
    digests = {p.member: p.assurance.bundle_digest for p in model.parties}
    declared = {m["id"]: m["digest"] for m in load("bilateral-counterparty")[0]["extensions"]["composed/v1"]["members"]}
    assert digests == declared
    assert model.bundle_digest == assurance.bundle_digest != Assurance().bundle_digest


def _rebound(bundle: Doc, output: Doc) -> Doc:
    """*output* as a verifier's report on the edited *bundle*: each member's
    report bound to that member's edited bytes, the outer one to the outer."""
    output = copy.deepcopy(output)
    composed = next(e for e in output["extensions"] if e["kind"] == "composed/v1")["composed"]
    for member, report in zip(bundle["extensions"]["composed/v1"]["members"], composed["members"], strict=True):
        report["bundle"]["bundle_digest"] = bundle_digest(member["bundle"])
    return report_for(bundle, output)


def test_a_copy_without_its_deal_extension_is_declined():
    """Even with every report bound to the edited bytes: the copy names no
    sealed report, so it is not read as a receipt."""
    bundle, output = load("bilateral-counterparty")
    bundle = copy.deepcopy(bundle)
    del bundle["extensions"]["composed/v1"]["members"][1]["bundle"]["extensions"]["x-deal-v0"]
    context, assurance, composition = _read("bilateral-counterparty", bundle, _rebound(bundle, output))
    with pytest.raises(ReceiptUnavailable, match="names no sealed report"):
        build_bilateral(context, composition, check_opening, assurance, "counterparty")


def test_a_copy_whose_records_name_two_deals_names_both():
    """A record's chain id that is not the deal its report names: the copy
    names two deals, and a composition holding it is a mismatch."""
    context, _, composition = _read("bilateral-keep")
    seller = carried_parts(context, composition)[1].context
    bundle = thaw(seller.bundle)
    typed = next(cid for cid, d in bundle["disclosures"].items() if d.get("agent_input", {}).get("chain_id"))
    bundle["disclosures"][typed]["agent_input"]["chain_id"] = "deal-0000000000000000"
    statuses = {cid: {m: "disclosure_match" for m in d} for cid, d in bundle["disclosures"].items()}
    edited = build_context(bundle, seller.verification, statuses)
    assert named_deals(seller) == {"deal-0b11a7e2a1c0ffee"}
    assert named_deals(edited) == {"deal-0b11a7e2a1c0ffee", "deal-0000000000000000"}
    assert one_deal([named_deals(edited), named_deals(seller)])[0] == "mismatch"


def _composed_report(output: Doc) -> Doc:
    return next(e for e in output["extensions"] if e["kind"] == "composed/v1")["composed"]


@pytest.mark.parametrize(
    "fail",
    ["status", "digest", "closure", "member_digest", "same_observer", "duplicate_id", "corroboration_count"],
)
def test_a_composition_the_verifier_did_not_pass_is_declined(fail):
    """Whatever the outer verdict says: a failed block, digest, closure or copy
    digest, one observer twice, one member id twice, or corroboration that
    does not line up with the joins -- the module declines."""
    bundle, output = load("bilateral-adjudicator")
    output = copy.deepcopy(output)
    c = _composed_report(output)
    if fail == "status":
        c["status"] = "fail"
    elif fail == "digest":
        c["composed_digest"]["matches"] = False
    elif fail == "closure":
        c["composition_closure"]["status"] = "fail"
    elif fail == "member_digest":
        c["members"][1]["digest"] = "mismatch"
    elif fail == "same_observer":
        c["members"][1]["observer"] = c["members"][0]["observer"]
    elif fail == "duplicate_id":
        c["members"][1]["id"] = c["members"][0]["id"]
    else:
        c["corroboration"] = c["corroboration"][:1]
    context, assurance, composition = _read("bilateral-adjudicator", copy.deepcopy(bundle), report_for(bundle, output))
    with pytest.raises(ReceiptUnavailable):
        build_bilateral(context, composition, check_opening, assurance, "adjudicator")
    clean, clean_assurance, clean_composition = _read("bilateral-adjudicator")
    assert build_bilateral(clean, clean_composition, check_opening, clean_assurance, "adjudicator").deal_state == "agree"


def test_a_copy_whose_own_report_failed_is_declined():
    bundle, output = load("bilateral-counterparty")
    output = copy.deepcopy(output)
    _composed_report(output)["members"][1]["bundle"]["verdict"] = "INVALID"
    context, assurance, composition = _read("bilateral-counterparty", copy.deepcopy(bundle), report_for(bundle, output))
    with pytest.raises(ReceiptUnavailable, match="did not verify"):
        build_bilateral(context, composition, check_opening, assurance, "counterparty")


def test_corroboration_is_read_in_join_order():
    context, assurance, composition = _read("bilateral-adjudicator")
    model = build_bilateral(context, composition, check_opening, assurance, "adjudicator")
    assert [(v.join.basis, v.corroboration.result) for v in model.joins] == [
        ("pre_agreed_identifier", "corroborating"),
        ("shared_artifact_digest", "not_applicable"),
    ]


def test_a_bundle_carrying_fewer_copies_than_its_report_assessed_is_declined():
    bundle, output = load("bilateral-counterparty")
    bundle = copy.deepcopy(bundle)
    del bundle["extensions"]["composed/v1"]["members"][1]["bundle"]
    context, assurance, composition = _read("bilateral-counterparty", bundle, report_for(bundle, output))
    with pytest.raises(ReceiptUnavailable, match="two copies its report assessed"):
        build_bilateral(context, composition, check_opening, assurance, "counterparty")
