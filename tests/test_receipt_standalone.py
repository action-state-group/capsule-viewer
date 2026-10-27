# SPDX-License-Identifier: Apache-2.0
"""The receipt modules over copies as capsulectl main cuts them: the report is
a standalone signed record in ``x-deal-report/v0``, on no log (capsule-cli#294).

This package cannot check that record's signature. It reads the report only
when capsulectl verify reported the check as passed, and it words nothing
about the record beyond that reported status."""
from __future__ import annotations

import copy

import pytest
from receipt_helpers import PACK, PACK_SHA, load, report_for, visible_text

from capsule_viewer.binding import check_opening
from capsule_viewer.receipt import (
    PLACEHOLDERS,
    ReceiptUnavailable,
    UnilateralReceiptModule,
    build_receipt,
    receipt_page,
)
from capsule_viewer.verifier_report import context_from_capsulectl
from capsule_viewer.wording import load_wording_pack

WORDS = load_wording_pack(PACK, PACK_SHA, PLACEHOLDERS)
COPIES = {"main-standalone-keep": "keep", "main-standalone-counterparty": "counterparty"}
X_REPORT = "x-deal-report/v0"


def _inputs(name, edit=None, status=None):
    bundle, output = copy.deepcopy(load(name))
    if edit:
        edit(bundle)
        output = report_for(bundle, output)
    if status is not None:
        entry = next(e for e in output["extensions"] if e["kind"] == "x-deal-v0")
        if status == "unreported":
            entry.pop("report", None)
        else:
            entry["status"] = status
    return context_from_capsulectl(bundle, output)


@pytest.mark.parametrize("name", COPIES)
def test_a_standalone_report_is_read_and_worded_by_capsulectls_status_only(name):
    context, assurance = _inputs(name)
    assert assurance.report_checked == "pass"
    model = build_receipt(context, check_opening, assurance, COPIES[name])
    assert model.report_checked == "pass" and model.report.did
    page = receipt_page(context, assurance, PACK, PACK_SHA, audience=COPIES[name], depth="L2")
    text = visible_text(page)
    assert "capsulectl verify reported its signature check as: pass" in text
    assert "This page did not check the signature itself." in text
    # The sentence for a report sealed as a record on the log is not said of this one.
    assert "sealed as a record in this file; the verifier checked that record" not in text


@pytest.mark.parametrize("status", ["fail", "withheld", "unreported"])
def test_a_standalone_report_without_a_passing_status_is_declined(status):
    context, assurance = _inputs("main-standalone-keep", status=status)
    assert assurance.report_checked != "pass"
    with pytest.raises(ReceiptUnavailable):
        build_receipt(context, check_opening, assurance, "keep")
    assert not UnilateralReceiptModule(WORDS, "L2", "keep", assurance).canRender(context)


def test_a_record_on_the_log_has_no_standalone_note():
    context, assurance = context_from_capsulectl(*load("main-buyer-keep"))
    model = build_receipt(context, check_opening, assurance, "keep")
    assert model.report_checked is None and assurance.report_checked is None


@pytest.mark.parametrize(
    "edit",
    [
        lambda b: b["extensions"][X_REPORT]["record"].update(capsule_id="0" * 64),
        lambda b: b["extensions"][X_REPORT]["record"].update(action_id="something-else"),
        lambda b: b["extensions"][X_REPORT].update(extra={}),
        lambda b: b["extensions"][X_REPORT]["agent_input"].update(type="not_a_report"),
        lambda b: b["extensions"][X_REPORT]["agent_input"].pop("report"),
        lambda b: b["extensions"].pop(X_REPORT),
    ],
    ids=["other-id", "other-action", "extra-member", "other-type", "no-report", "no-extension"],
)
def test_a_standalone_report_that_is_not_the_named_one_is_declined(edit):
    context, assurance = _inputs("main-standalone-keep", edit)
    with pytest.raises(ReceiptUnavailable):
        build_receipt(context, check_opening, assurance, "keep")


def test_a_standalone_report_beside_a_report_record_on_the_log_is_declined():
    """Two reports in one copy are two texts: neither is shown, whether or not
    the record on the log discloses its text."""

    def add_report_record(bundle):
        record = copy.deepcopy(bundle["records"][-1])
        record["capsule_id"] = "f" * 64
        record["action_id"] = "capsulectl-deal-report"
        bundle["records"].append(record)

    bundle, output = copy.deepcopy(load("main-standalone-keep"))
    add_report_record(bundle)
    output = report_for(bundle, output)
    output["record_identity"]["f" * 64] = "passed"
    context, assurance = context_from_capsulectl(bundle, output)
    with pytest.raises(ReceiptUnavailable, match="both in the bundle"):
        build_receipt(context, check_opening, assurance, "keep")
