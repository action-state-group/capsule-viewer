# SPDX-License-Identifier: Apache-2.0
"""The provider's own receipt page: a Mesh node's served exchange record and
the payments it received, cut by capsules-plugin's ``provider-receipt-bundle``.
It says whose half it is, shows each amount with its unit, and is not a deal
receipt (Mesh-LLM/capsules-plugin#134)."""
from __future__ import annotations

import copy
import json
import re
from pathlib import Path

import pytest
from receipt_helpers import load, render, report_for, visible_text

from capsule_viewer.receipt.provider import (
    MODEL_ASKED,
    NO_CONTENT,
    OWN_HALF,
    REASONS,
    RECORDED_AT,
    STATUS_DISPATCHED,
    STATUS_FAILED,
    TITLE_ASKED,
    ProviderReceiptModule,
    amount_text,
    provider_receipt_page,
)
from capsule_viewer.shell import INCOMPLETE_SELECTION
from capsule_viewer.verifier_report import context_from_capsulectl

NAME = "mesh-provider-selected"


def _page() -> str:
    context, _ = context_from_capsulectl(*load(NAME))
    return provider_receipt_page(context)


def test_the_page_says_whose_half_it_is_and_shows_each_amount_with_its_unit():
    text = visible_text(_page())
    assert OWN_HALF in text and NO_CONTENT in text
    assert "Received in total 1,990 msat" in text
    assert text.count("995 msat") == 2 and text.count("5 msat") >= 2
    assert "Model served m" in text
    # A bundle the producer selected: the shell's notice, and no verified banner above it.
    assert INCOMPLETE_SELECTION in text
    assert "Verified" not in text.split(INCOMPLETE_SELECTION)[0]


def test_the_page_is_not_a_deal_receipt_and_names_nobody_who_asked():
    html = _page()
    text = visible_text(html)
    # Outside the verifier's check list, no deal or offer wording and no counterparty.
    assert not re.search(r"\b(deal|offer)\b", text, re.I)
    bundle, _ = load(NAME)
    assert "payer-node" in str(bundle), "the records do name the requester"
    assert "payer-node" not in html, "the page does not"


@pytest.mark.parametrize(
    ("amount", "shown"),
    [
        ({"value": "995", "assetCode": "BTC", "assetScale": 11}, "995 msat"),
        ({"value": "0", "assetCode": "BTC", "assetScale": 11}, "0 msat"),
        ({"value": "5", "assetCode": "BTC", "assetScale": 11, "extra": 1}, None),
        ({"value": "0995", "assetCode": "BTC", "assetScale": 11}, None),
        ({"value": "7", "assetCode": "USD", "assetScale": -2}, None),
        ({"value": "7", "assetCode": "USD", "assetScale": 300}, None),
        ({"value": "7", "assetCode": "USD", "assetScale": 255}, "7 × 10^-255 USD"),
        ({"value": "12", "assetCode": "BTC", "assetScale": 8}, "12 × 10^-8 BTC"),
        ({"value": "7", "assetCode": "USD", "assetScale": 2}, "7 × 10^-2 USD"),
        ({"value": "995", "assetScale": 11}, None),
        ({"value": "995", "assetCode": "BTC"}, None),
        ({"value": "-5", "assetCode": "BTC", "assetScale": 11}, None),
        ({"value": "1.5", "assetCode": "BTC", "assetScale": 11}, None),
        ({"value": 995, "assetCode": "BTC", "assetScale": 11}, None),
        (None, None),
    ],
)
def test_an_amount_always_carries_its_unit_or_is_not_shown(amount, shown):
    assert amount_text(amount) == shown


def test_only_a_served_exchange_with_its_payments_is_this_modules():
    bundle, output = load(NAME)
    context, _ = context_from_capsulectl(bundle, output)
    module = ProviderReceiptModule()
    assert module.canRender(context)
    # A leg as the root: the exchange record is then an extra, non-leg record.
    edited = copy.deepcopy(bundle)
    leg = next(r["capsule_id"] for r in edited["records"] if "settlement" in r)
    edited["root"] = leg
    other, _ = context_from_capsulectl(edited, report_for(edited, output))
    assert not module.canRender(other)
    # A deal receipt is not this module's, and this bundle is not the deal modules'.
    deal, deal_output = load("mesh-payer-selected")
    deal_context, _ = context_from_capsulectl(deal, deal_output)
    assert not module.canRender(deal_context)
    # The page the Evidence tab asks for (`receipt_page`) resolves to this module for
    # the owner, and to nothing for another audience: the bundle is the owner's.
    assert OWN_HALF in visible_text(render(NAME, audience="keep"))
    assert "No presentation" in visible_text(render(NAME, audience="counterparty"))


def test_the_own_half_line_is_the_go_packs_and_names_no_countersigner():
    # #460: Sherlock2's words, the same in the Go package's pack (provider.own_half),
    # so the scripts and this twin draw one sentence. A countersignature is a third
    # party re-checking a bundle, never the other party, so the line never says it.
    pack = json.loads((Path(__file__).parents[1] / "go" / "receipt" / "wording-en.json").read_text(encoding="utf-8"))
    assert OWN_HALF == pack["entries"]["provider.own_half"]
    assert OWN_HALF == (
        "This is this node's own record of its half of the exchange. "
        "It is not a joint record: the other party keeps its own."
    )
    assert "countersign" not in OWN_HALF.lower()


def test_a_bundle_that_did_not_verify_shows_no_rows():
    bundle, output = load(NAME)
    output = copy.deepcopy(output)
    output["checkpoint"]["status"] = "fail"
    context, _ = context_from_capsulectl(bundle, output)
    text = visible_text(provider_receipt_page(context))
    assert "This bundle did not verify" in text and OWN_HALF not in text


def _with_poc(edit):
    """The fixture with its exchange record's `x-mesh-poc-v1` block edited, and the
    verifier's report for the edited bundle."""
    bundle, output = load(NAME)
    edited = copy.deepcopy(bundle)
    root = next(r for r in edited["records"] if r["capsule_id"] == edited["root"])
    edit(root["model_attestation"]["compute_attestation"])
    return context_from_capsulectl(edited, report_for(edited, output))[0]


@pytest.mark.parametrize(
    "edit",
    [
        lambda ca: ca.update({"x-mesh-poc-v1": {}}),
        lambda ca: ca.update({"x-mesh-poc-v1": {"serving_provenance": {}, "role": "requested"}}),
        lambda ca: ca.update({"x-mesh-poc-v1": {"role": "served"}}),
        lambda ca: ca.pop("x-mesh-poc-v1"),
    ],
)
def test_a_record_that_is_not_the_nodes_served_exchange_is_not_rendered(edit):
    assert not ProviderReceiptModule().canRender(_with_poc(edit))


def test_the_manifest_matches_no_other_viewer_or_builtin_module():
    from test_history_card_design import BUILTINS, RECEIPT_MANIFESTS, _viewer_specific_manifests, co_matchable

    from capsule_viewer.receipt.provider import MANIFEST

    others = {**_viewer_specific_manifests(), **{n: m for n, m in BUILTINS.items() if not m["fallback"]}}
    others.pop("manifest-provider", None)
    assert RECEIPT_MANIFESTS["manifest-provider"] == MANIFEST
    assert sorted(n for n, m in others.items() if co_matchable(MANIFEST, m)) == []


@pytest.mark.parametrize("status", ["pending", "failed", "reversed", None, "missing"])
def test_a_leg_that_is_not_settled_is_not_a_payment_received(status):
    bundle, output = load(NAME)
    edited = copy.deepcopy(bundle)
    leg = next(r for r in edited["records"] if "settlement" in r)
    if status == "missing":
        del leg["settlement"]["status"]
    else:
        leg["settlement"]["status"] = status
    context, _ = context_from_capsulectl(edited, report_for(edited, output))
    assert not ProviderReceiptModule().canRender(context)


@pytest.mark.parametrize("status", ["planned", "refused", None, "missing", "no effect"])
def test_an_exchange_with_no_effect_this_page_draws_is_not_rendered(status):
    bundle, output = load(NAME)
    edited = copy.deepcopy(bundle)
    root = next(r for r in edited["records"] if r["capsule_id"] == edited["root"])
    if status == "missing":
        del root["effect"]["status"]
    elif status == "no effect":
        del root["effect"]
    else:
        root["effect"]["status"] = status
    context, _ = context_from_capsulectl(edited, report_for(edited, output))
    assert not ProviderReceiptModule().canRender(context)


def test_the_fee_says_what_it_is_the_fee_for_and_the_time_says_its_zone():
    text = visible_text(_page())
    assert "Fee for receiving" in text and "UTC" in text


@pytest.mark.parametrize(
    ("stamp", "shown"),
    [
        ("2026-10-30T19:50:00Z", "2026-10-30T19:50:00 UTC"),
        ("2026-10-30T19:50:00z", "2026-10-30T19:50:00 UTC"),
        ("2026-10-30T14:50:00-05:00", "2026-10-30T19:50:00 UTC"),
        ("2026-10-30T19:50:00+00:00", "2026-10-30T19:50:00 UTC"),
        ("2026-10-30T19:50:00", "?"),
        ("not a time", "?"),
        ("0001-01-01T00:00:00+01:00", "?"),
        ("9999-12-31T23:59:59-01:00", "?"),
        ("", "?"),
    ],
)
def test_the_time_is_shown_in_utc_or_not_at_all(stamp, shown):
    from capsule_viewer.receipt.provider import _utc

    assert _utc(stamp) == shown


# capsule-viewer#465: a failed or dispatched exchange, drawn with its real
# status in Sherlock2's words (Steven's u1578 E and F, evidencebook#205).
def _edited(status, failure_class=..., legs=True):
    bundle, output = load(NAME)
    edited = copy.deepcopy(bundle)
    root = next(r for r in edited["records"] if r["capsule_id"] == edited["root"])
    root["effect"]["status"] = status
    poc = root["model_attestation"]["compute_attestation"]["x-mesh-poc-v1"]
    if status == "failed":
        poc["outcome"] = "failed"
    if failure_class is not ...:
        poc["failure_class"] = failure_class
    output = copy.deepcopy(output)
    if not legs:
        edited["records"] = [root]
        for key in ("record_identity", "record_signatures"):
            output[key] = {k: v for k, v in output[key].items() if k == root["capsule_id"]}
    context, _ = context_from_capsulectl(edited, report_for(edited, output))
    return context


def _failed(reason):
    return STATUS_FAILED.format(reason=f": {reason}" if reason else "")


@pytest.mark.parametrize(
    ("failure_class", "words"),
    [
        ("payment_required", "payment required"),
        ("refused", "refused"),
        ("upstream_error", "upstream error"),
        ("timeout", "timed out"),
        ("dropped", "dropped"),
        (..., None),
        ("something_new", None),
        (None, None),
    ],
)
def test_a_failed_exchange_says_it_failed_and_why_in_words(failure_class, words):
    html = provider_receipt_page(_edited("failed", failure_class))
    text = visible_text(html)
    assert _failed(words) in text
    # The owner's title is the page's <title>, not its visible text.
    assert f"<title>{TITLE_ASKED}</title>" in html and MODEL_ASKED in text and RECORDED_AT in text
    assert "Model served" not in text and "Served at" not in text and "you served" not in html
    # Never the raw code (refused and dropped are their own words).
    if isinstance(failure_class, str) and failure_class not in REASONS.values():
        assert failure_class not in text


def test_a_failed_exchange_with_no_payment_is_drawn_with_no_payment_row():
    module = ProviderReceiptModule()
    context = _edited("failed", "timeout", legs=False)
    model = module.buildModel(context)
    assert model.payments == () and model.reason == "timeout"
    text = visible_text(provider_receipt_page(context))
    assert _failed("timed out") in text and "Received (0)" in text


@pytest.mark.parametrize("status", ["confirmed", "dispatched"])
def test_only_a_failed_exchange_may_have_no_payment(status):
    assert not ProviderReceiptModule().canRender(_edited(status, legs=False))


def test_a_dispatched_exchange_says_no_response_was_recorded_and_names_no_reason():
    context = _edited("dispatched", "refused")
    assert ProviderReceiptModule().buildModel(context).reason is None
    html = provider_receipt_page(context)
    text = visible_text(html)
    assert STATUS_DISPATCHED in text and "refused" not in text
    assert f"<title>{TITLE_ASKED}</title>" in html and MODEL_ASKED in text and RECORDED_AT in text


def test_a_summary_of_unsealed_failures_is_not_one_exchange():
    bundle, output = load(NAME)
    edited = copy.deepcopy(bundle)
    root = next(r for r in edited["records"] if r["capsule_id"] == edited["root"])
    root["effect"]["status"] = "failed"
    poc = root["model_attestation"]["compute_attestation"]["x-mesh-poc-v1"]
    poc.update({"outcome": "failed", "unsealed_failures": {"count": 3, "window_start": "2026-10-30T19:00Z", "window_s": 3600}})
    context, _ = context_from_capsulectl(edited, report_for(edited, output))
    assert not ProviderReceiptModule().canRender(context)


def test_the_confirmed_page_draws_no_status_line():
    html = _page()
    assert 'data-provider="status"' not in html
    assert "<title>Your receipt for an exchange you served</title>" in html


def test_the_new_words_are_the_go_packs():
    # The scripts and this twin draw the same sentences (#465).
    entries = json.loads((Path(__file__).parents[1] / "go" / "receipt" / "wording-en.json").read_text(encoding="utf-8"))["entries"]
    assert entries["provider.title_asked"] == TITLE_ASKED
    assert entries["provider.model_asked"] == MODEL_ASKED
    assert entries["provider.recorded_at"] == RECORDED_AT
    assert entries["provider.status.dispatched"] == STATUS_DISPATCHED
    assert entries["provider.status.failed"] == STATUS_FAILED.format(reason="")
    assert entries["provider.status.failed_reason"] == STATUS_FAILED.format(reason=": {reason}")
    assert {k.removeprefix("provider.reason."): v for k, v in entries.items() if k.startswith("provider.reason.")} == REASONS
