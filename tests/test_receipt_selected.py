# SPDX-License-Identifier: Apache-2.0
"""A producer-selected receipt bundle (a Mesh payer's deal, cut from one shared
ledger; its report is sealed for the counterparty audience): its verified rows are shown with a notice that the selection cannot be
checked to be complete, and the page never reads as verified overall."""
from __future__ import annotations

from receipt_helpers import render, snapshot, visible_text

from capsule_viewer.shell import INCOMPLETE_SELECTION


def test_the_selected_receipt_shows_its_rows_and_says_the_selection_is_unchecked():
    html = render("mesh-payer-selected", audience="counterparty")
    text = visible_text(html)
    assert INCOMPLETE_SELECTION in text
    assert "This bundle did not verify" not in text
    assert "Incomplete" in text
    records = snapshot(html)
    shown = [r for r in records.values() if r["disclosure"] == "disclosed"]
    # The deal's steps; its report is the sealed text above them.
    assert [r["facts"]["record_type"] for r in shown] == ["baseline", "outcome", "close"]
    # What the report cites and the bundle does not carry (the exchange record,
    # the settlement legs) is "not present", never shown.
    assert all(r["disclosure"] in ("disclosed", "not_present") for r in records.values())


def test_a_complete_bundle_carries_no_such_notice():
    assert INCOMPLETE_SELECTION not in visible_text(render("keep"))
