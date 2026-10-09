# SPDX-License-Identifier: Apache-2.0
"""The unilateral receipt module over real capsulectl bundles: the kit
contract, the three audiences, disclosure per record, committed words, depth
and every refusal path."""
from __future__ import annotations

import copy
import json
import re
from dataclasses import replace
from html import unescape

import pytest
from receipt_helpers import FIXTURES, PACK, PACK_SHA, Doc, load, render, report_for, snapshot, visible_text

from capsule_viewer.binding import check_opening
from capsule_viewer.kit.contract import check_module_renders
from capsule_viewer.receipt import (
    PLACEHOLDERS,
    ReceiptModel,
    UnilateralReceiptModule,
    build_receipt,
    receipt_page,
    receipt_registry,
)
from capsule_viewer.shell import FAILED, NO_PRESENTATION, REFUSAL, present
from capsule_viewer.verifier_report import Assurance, VerifierReportError, context_from_capsulectl
from capsule_viewer.wording import load_wording_pack

WORDS = load_wording_pack(PACK, PACK_SHA, PLACEHOLDERS)


def model_audience(name: str) -> str:
    return "keep" if name.startswith("golden") else name


def _model(name: str, bundle: Doc | None = None) -> ReceiptModel:
    raw_bundle, output = load(name)
    context, assurance = context_from_capsulectl(bundle or raw_bundle, report_for(bundle, output) if bundle else output)
    return build_receipt(context, check_opening, assurance, model_audience(name))


@pytest.mark.parametrize("name", FIXTURES)
def test_the_module_meets_the_kit_contract(name):
    context, assurance = context_from_capsulectl(*load(name))
    html = check_module_renders(UnilateralReceiptModule(WORDS, "L2", model_audience(name), assurance), context)
    assert "data-level=\"L0\"" in html and "data-level=\"L1\"" in html and "data-level=\"L2\"" in html


# ---- acceptance (2): the counterparty copy against the keep copy -------------


def test_the_two_copies_are_of_one_deal():
    keep, counterparty = load("keep")[0], load("counterparty")[0]
    assert keep["root"] == counterparty["root"]
    shared = {r["capsule_id"] for r in keep["records"]} & {r["capsule_id"] for r in counterparty["records"]}
    assert len(shared) == len(keep["records"])


def test_counterparty_withheld_records_show_withheld_and_their_log_place_only():
    cp = snapshot(render("counterparty"))
    withheld = {cid: r for cid, r in cp.items() if r["disclosure"] == "withheld"}
    # Not vacuous: the share builder withheld four of the six steps.
    assert len(withheld) == 4
    for cid, record in withheld.items():
        assert record["facts"] == {}, cid
        assert re.fullmatch(r"deal/deal-[0-9a-f]+:\d+:\d+", record["log"]), cid


def test_counterparty_disclosed_subset_matches_the_keep_render():
    keep, cp = snapshot(render("keep")), snapshot(render("counterparty"))
    disclosed = [cid for cid, r in cp.items() if r["disclosure"] == "disclosed"]
    assert len(disclosed) == 2
    for cid in disclosed:
        assert cp[cid] == keep[cid], cid
    # The same records, at the same places, in both copies.
    assert {cid: r["log"] for cid, r in cp.items()} == {cid: r["log"] for cid, r in keep.items()}


def _leaks(cp_html: str) -> tuple[int, list[tuple[str, str, str]]]:
    """Each value the keep copy shows from a record the counterparty copy
    withholds, found on the counterparty page -- except where the share
    builder's own lines in that copy state it. Returns (values checked, leaks)."""
    keep, cp = snapshot(render("keep")), snapshot(render("counterparty"))
    cp_bundle = load("counterparty")[0]
    # Everything the share builder itself wrote into this copy's sealed report.
    shared_lines = json.dumps(cp_bundle["disclosures"][_report_id(cp_bundle)], ensure_ascii=False)
    text = visible_text(cp_html)
    checked, leaked = 0, []
    for cid, record in cp.items():
        if record["disclosure"] != "withheld":
            continue
        for name, value in keep[cid]["facts"].items():
            # A value under four characters ("1", "pay") is too short to find
            # by text; the structural check above (no facts at all on a
            # withheld record) covers it.
            if len(value) < 4 or value in shared_lines:
                continue
            checked += 1
            if re.search(rf"(?<![\w.-]){re.escape(value)}(?![\w.-])", text):
                leaked.append((cid, name, value))
    return checked, leaked


def test_counterparty_never_shows_what_the_withheld_records_hold():
    html = render("counterparty")
    checked, leaked = _leaks(html)
    assert checked >= 8  # not vacuous: the baseline, the check and the act hold these
    assert leaked == []
    text = visible_text(html)
    assert "Order the cat sticker" not in text  # the user's own words
    assert "cat sticker" not in text


class _LeakyModule(UnilateralReceiptModule):
    """Mutant: shows the keep copy's facts for every step the counterparty copy withholds."""

    def buildModel(self, context):  # noqa: N802 -- the contract's member name
        model = super().buildModel(context)
        keep = _model("keep")
        steps = tuple(
            replace(s, facts=keep.step(s.capsule_id).facts, disclosure="disclosed") if s.disclosure == "withheld" and keep.step(s.capsule_id) else s
            for s in model.steps
        )
        return replace(model, steps=steps)


def test_the_leak_check_bites():
    context, assurance = context_from_capsulectl(*load("counterparty"))
    module = _LeakyModule(WORDS, "L2", "counterparty", assurance)
    html = present(context, receipt_registry(module), audience="counterparty")
    assert _leaks(html)[1] != []


def test_the_counterparty_copy_says_what_was_left_out():
    html = render("counterparty")
    model = _model("counterparty")
    shared = unescape(re.search(r'data-shared="counterparty">([^<]*)<', html).group(1))
    assert model.report.withheld and all(kind in shared for kind in model.report.withheld)
    assert 'data-shared' not in render("keep")


def test_the_l0_headline_shows_withheld_in_place_of_each_withheld_part():
    keep, cp = _model("keep").headline, _model("counterparty").headline
    assert (keep.deal_type.value, keep.item.value, keep.amount.value, keep.state) == ("purchase", "cat sticker", "6.27 USD", "open")
    assert (cp.deal_type, cp.item, cp.amount, cp.state) == ("withheld", "withheld", "withheld", "open")


def test_the_adjudicator_copy_renders_its_own_report():
    model = _model("adjudicator")
    assert model.report.audience == "adjudicator"
    reports = [s for s in model.steps if s.section == "report"]
    assert [s.disclosure for s in reports].count("disclosed") == 1
    assert 'data-shared="adjudicator"' in render("adjudicator")


# ---- committed words ---------------------------------------------------------


def test_the_asked_words_show_only_when_their_opening_matches():
    html = render("keep")
    assert 'data-committed="asked" data-state="opened"' in html
    assert "“Order the cat sticker in my cart at Example Stickers”" in visible_text(html)


def _report_id(bundle: Doc) -> str:
    return bundle["extensions"]["x-deal-v0"]["sealed_report"]


def test_a_tampered_opening_is_never_shown():
    bundle = copy.deepcopy(load("keep")[0])
    report = bundle["disclosures"][_report_id(bundle)]["agent_input"]["report"]
    report["asked_opening"]["text"] = "Order ten cat stickers"
    # A verifier report for the edited copy (its statuses as set): the
    # binding check alone decides whether the words show.
    context, _ = context_from_capsulectl(bundle, report_for(bundle, load("keep")[1]))
    assert context.verified
    model = build_receipt(context, check_opening, Assurance(), "keep")
    assert model.asked.state == "mismatch" and model.asked.text is None


def test_the_binding_check_bites():
    """Mutant: a binder that accepts any opening shows tampered words."""
    bundle = copy.deepcopy(load("keep")[0])
    bundle["disclosures"][_report_id(bundle)]["agent_input"]["report"]["asked_opening"]["text"] = "tampered"
    context, _ = context_from_capsulectl(bundle, report_for(bundle, load("keep")[1]))
    model = build_receipt(context, lambda *_: "opened", Assurance(), "keep")
    assert model.asked.text == "tampered"


def test_words_without_an_opening_are_committed_not_shown():
    bundle = copy.deepcopy(load("keep")[0])
    del bundle["disclosures"][_report_id(bundle)]["agent_input"]["report"]["asked_opening"]
    context, _ = context_from_capsulectl(bundle, report_for(bundle, load("keep")[1]))
    model = build_receipt(context, check_opening, Assurance(), "keep")
    assert (model.asked.state, model.asked.text) == ("committed", None)


# ---- disclosure states -------------------------------------------------------


def test_a_cited_step_the_bundle_does_not_carry_is_not_present():
    bundle = copy.deepcopy(load("keep")[0])
    missing = "f" * 64
    report = bundle["disclosures"][_report_id(bundle)]["agent_input"]["report"]
    report["did"][0]["steps"].append(missing)
    context, _ = context_from_capsulectl(bundle, report_for(bundle, load("keep")[1]))
    model = build_receipt(context, check_opening, Assurance(), "keep")
    assert model.step(missing).disclosure == "not_present"
    assert model.step(missing).log is None


def test_every_record_appears_once_with_its_disclosure_state():
    for name in FIXTURES:
        bundle, _ = load(name)
        model = _model(name)
        assert sorted(s.capsule_id for s in model.steps) == sorted(r["capsule_id"] for r in bundle["records"]), name


# ---- depth -------------------------------------------------------------------


def _open(html: str, level: str) -> bool:
    region = html.split(f'data-level="{level}"', 1)[1]
    return re.match(r'>\s*<details[^>]*\sopen', region) is not None


@pytest.mark.parametrize(("depth", "l1", "l2"), [("L0", False, False), ("L1", True, False), ("L2", True, True)])
def test_depth_opens_levels_and_never_removes_one(depth, l1, l2):
    html = render("keep", depth)
    assert (_open(html, "L1"), _open(html, "L2")) == (l1, l2)
    # Every level is in the document at every depth (printing and I4).
    assert snapshot(html) == snapshot(render("keep", "L2"))


def _l0_l1(html: str) -> str:
    return html.split('data-level="L0"', 1)[1].split('data-level="L2"', 1)[0]


@pytest.mark.parametrize("depth", ["L0", "L1"])
def test_wording_and_depth_never_come_from_the_bundle(depth):
    """Contract section 6's behavioural test: the same bundle with its
    presentation settings absent, supplied, and with every string altered and
    every flag flipped renders L0 and L1 byte-identically, with the same levels
    open. (L2 differs only by the bundle digest, which the edit changes.)"""
    hints = {"title": "Example title", "producer_display_name": "Example", "depth": "L2", "open": True}
    altered = {"title": "ALTERED", "producer_display_name": "ALTERED", "depth": "L0", "open": False}
    pages = []
    for block in (None, hints, altered):
        bundle = copy.deepcopy(load("keep")[0])
        if block is not None:
            bundle["extensions"]["presentation/v1"] = block
        pages.append(render("keep", depth, bundle=bundle))
    assert _l0_l1(pages[0]) == _l0_l1(pages[1]) == _l0_l1(pages[2])
    assert [(_open(p, "L1"), _open(p, "L2")) for p in pages] == [(_open(pages[0], "L1"), _open(pages[0], "L2"))] * 3



# ---- refusals ------------------------------------------------------------------


def test_an_unverified_bundle_gets_the_refusal_and_nothing_of_the_receipt():
    bundle, output = load("keep")
    output = copy.deepcopy(output)
    output["verdict"] = "INVALID"
    html = render("keep", output=output)
    assert REFUSAL in visible_text(html)
    assert "cat sticker" not in html and "data-level" not in html


def test_a_verifier_report_for_another_bundle_is_refused():
    with pytest.raises(VerifierReportError):
        context_from_capsulectl(load("keep")[0], load("golden-2")[1])


class _Broken(UnilateralReceiptModule):
    def render(self, model, services):
        raise RuntimeError("broken")


def test_a_module_that_throws_shows_the_failure_never_a_partial_page():
    context, assurance = context_from_capsulectl(*load("keep"))
    html = present(context, receipt_registry(_Broken(WORDS, "L2", "keep", assurance)), audience="keep")
    assert FAILED in visible_text(html) and "data-level" not in html


def test_a_bundle_the_module_declines_gets_no_presentation():
    bundle = copy.deepcopy(load("keep")[0])
    del bundle["extensions"]["x-deal-v0"]["sealed_report"]
    assert NO_PRESENTATION in visible_text(render("keep", bundle=bundle))


def test_a_pack_whose_bytes_do_not_match_is_refused_and_keys_show():
    context, assurance = context_from_capsulectl(*load("keep"))
    html = receipt_page(context, assurance, PACK, "0" * 64, audience="keep")
    assert 'data-notice="wording-refused"' in html
    assert "[section.authorized]" in html


# ---- markup never comes from a payload -------------------------------------


def test_sealed_text_is_escaped():
    bundle = copy.deepcopy(load("keep")[0])
    bundle["disclosures"][_report_id(bundle)]["agent_input"]["report"]["scope"] = "<script>alert(1)</script>"
    html = render("keep", bundle=bundle)
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html


def test_the_example_pack_never_claims_enforcement():
    words = PACK.decode("utf-8").lower()
    # Consumer copy never says it protects, blocks or stops anything.
    for term in ("protect", "block", "stops"):
        assert term not in words, term


def test_the_l2_shows_the_bundle_digest_the_report_is_bound_to():
    _, output = load("keep")
    assert f'data-bundle-digest="true">{output["bundle_digest"]}<' in render("keep")


def test_a_witness_result_no_verifier_reported_is_not_called_absent():
    context, _ = context_from_capsulectl(*load("keep"))
    html = check_module_renders(UnilateralReceiptModule(WORDS, "L2", "keep"), context)
    text = visible_text(html)
    assert WORDS.get("rung.unreported") in text
    assert WORDS.get("rung.unwitnessed") not in text
