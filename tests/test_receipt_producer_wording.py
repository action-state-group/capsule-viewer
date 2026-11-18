# SPDX-License-Identifier: Apache-2.0
"""A receipt page names the tool that wrote its text only when the records
name it (capsule-viewer#328). A Goose-sealed deal_report carries no producer;
the page used to say capsulectl wrote it."""
from __future__ import annotations

import copy

from receipt_helpers import load, render, visible_text
from receipt_oracle import _strip_producers


def _text(name: str, bundle: dict | None) -> str:
    return visible_text(render(name, "L2", bundle=bundle))


def test_no_recorded_producer_says_the_producer():
    bundle, _ = load("keep")
    stripped = copy.deepcopy(bundle)
    _strip_producers(stripped)
    text = _text("keep", stripped)
    assert "written by the producer and sealed with the receipt" in text
    assert "read from the email by the producer" in text or "No merchant email" in text
    assert "written by capsulectl" not in text
    assert "an earlier capsulectl" not in text
    assert "read from the email by capsulectl" not in text


def test_one_recorded_producer_is_named_from_the_record():
    # Every step of this copy names the same producer.
    text = _text("main-standalone-keep", None)
    assert "written by capsulectl 0.1.0-dev (unknown) and sealed with the receipt" in text
    assert "written by the producer" not in text


def test_mixed_or_unrecorded_producers_say_the_producer():
    # keep: one step names a producer, another records none.
    text = _text("keep", None)
    assert "written by the producer and sealed with the receipt" in text
    assert "then a producer that did not record its version" in text
