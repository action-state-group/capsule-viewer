# SPDX-License-Identifier: Apache-2.0
"""The provider's own receipt page: a Mesh node's served exchange record and
the payments it received, cut by capsules-plugin's ``provider-receipt-bundle``.
It says whose half it is, shows each amount with its unit, and is not a deal
receipt (Mesh-LLM/capsules-plugin#134)."""
from __future__ import annotations

import copy
import re

import pytest
from receipt_helpers import load, render, report_for, visible_text

from capsule_viewer.receipt.provider import (
    NO_CONTENT,
    OWN_HALF,
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
    assert "Received in total 1990 msat" in text
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


@pytest.mark.parametrize("status", ["failed", "planned", "dispatched", "refused"])
def test_an_exchange_that_was_not_served_is_not_an_exchange_you_served(status):
    bundle, output = load(NAME)
    edited = copy.deepcopy(bundle)
    root = next(r for r in edited["records"] if r["capsule_id"] == edited["root"])
    root["effect"]["status"] = status
    context, _ = context_from_capsulectl(edited, report_for(edited, output))
    assert not ProviderReceiptModule().canRender(context)


def test_the_fee_says_what_it_is_the_fee_for_and_the_time_says_its_zone():
    text = visible_text(_page())
    assert "Fee for receiving" in text and "UTC" in text
