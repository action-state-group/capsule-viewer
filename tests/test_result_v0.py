# SPDX-License-Identifier: Apache-2.0
"""``build_result_entry`` + the assembled HTML for a Result v0 document.

The rendering behavior itself (aggregate recompute, refusal rows, tamper
detection) is JS -- covered in ``js-tests/result_v0_card.test.js`` against a
real jsdom DOM, since it is DOM-construction logic, not something meaningful
to re-test through a Python string search. This file covers what IS
Python's job: wrapping a Result document as a fragment entry, and the
embed/HTML-assembly invariants for the "result/v0" kind specifically.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from capsule_viewer import build_payload, encode_fragment, render_base_viewer_html
from capsule_viewer.result_v0 import build_result_entry

TESTDATA = Path(__file__).parent / "testdata"

# Claim-type fixtures (PROPOSED, ruling 2026-09-25): the five schema
# positives (the three Close states among them, UNILATERAL with and without
# the peer named), the schema negatives the card refuses, the schema
# negative the card renders as "unrecognized", and the viewer-owned render
# negative.
TYPED_FIXTURES = [
    "pos-oo-reconcile-result.json",
    "pos-oo-close-agreed-result.json",
    "pos-oo-close-unilateral-result.json",
    "pos-oo-close-unilateral-named-peer-result.json",
    "pos-oo-close-contested-result.json",
    "neg-close-agreed-without-peer.json",
    "neg-close-contested-without-peer-close-ref.json",
    "neg-reconcile-tallies-missing-state.json",
    "neg-unrecognized-claim-type.json",
    "neg-render-reconcile-one-sided-only.json",
]


def load(name: str) -> dict:
    return json.loads((TESTDATA / name).read_text(encoding="utf-8"))


def decode(fragment: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(fragment + "=" * (-len(fragment) % 4)))


def test_build_result_entry_carries_no_capsule_id():
    result = load("pos-oo-claims-result.json")
    entry = build_result_entry(result)
    assert entry["capsule_id"] is None
    assert entry["record"] == result
    assert entry["conversation"] == {"disclosed": False, "messages": []}


def test_result_entry_embeds_and_round_trips_through_the_fragment():
    result = load("pos-oo-claims-result.json")
    entry = build_result_entry(result)
    fragment = encode_fragment(build_payload([entry]))
    html = render_base_viewer_html(fragment)
    assert "<script src=" not in html
    assert 'register("result/v0"' in html
    # the fragment is base64url -- the claims content never appears as raw
    # JSON text in the shell (it only exists decoded, in-browser, at runtime)
    assert "OO Claims Result" not in html
    assert fragment in html


def test_result_entry_round_trips_byte_identical_claims():
    result = load("pos-oo-claims-result.json")
    entry = build_result_entry(result)
    payload = build_payload([entry])
    fragment = encode_fragment(payload)
    decoded = decode(fragment)
    assert decoded["entries"][0]["record"] == result


# --- Claim types (PROPOSED, ruling 2026-09-25) -------------------------------
#
# The rendering rules (one-sided never like conflicting, unilateral never
# like agreed, unrecognized never dropped) are DOM logic and live in
# js-tests/result_v0_card.test.js. Python's half is the carrier: a typed
# claim -- including one whose type nothing here recognizes -- must reach
# the browser byte-identical, with nothing dropped or normalized on the way,
# and the shell must actually ship the renderer that pins those rules.


@pytest.mark.parametrize("name", TYPED_FIXTURES)
def test_typed_claims_reach_the_browser_byte_identical_and_uncounted(name: str):
    result = load(name)
    entry = build_result_entry(result)
    decoded = decode(encode_fragment(build_payload([entry])))
    record = decoded["entries"][0]["record"]
    assert record == result
    # Nothing dropped by the carrier: same claim count, same types in order
    # (an absent `type` stays absent -- the card, not the carrier, reads it as
    # "requirement"; the carrier never fills it in).
    assert len(record["claims"]) == len(result["claims"])
    assert [c.get("type") for c in record["claims"]] == [c.get("type") for c in result["claims"]]


def test_unrecognized_type_is_neither_dropped_nor_rewritten_by_the_carrier():
    result = load("neg-unrecognized-claim-type.json")
    assert result["claims"][0]["type"] == "adjudication"  # the fixture's bogus type, as vendored
    decoded = decode(encode_fragment(build_payload([build_result_entry(result)])))
    assert decoded["entries"][0]["record"]["claims"][0]["type"] == "adjudication"
    assert len(decoded["entries"][0]["record"]["claims"]) == 3


def test_shell_ships_the_claim_type_renderer_that_pins_the_rules():
    """The inlined result_v0_card.js in the assembled HTML is the one that
    knows the three types -- the same bytes js-tests exercise, not a stale
    copy. Each marker is a load-bearing class the JS tests assert on."""
    html = render_base_viewer_html(
        encode_fragment(build_payload([build_result_entry(load("pos-oo-reconcile-result.json"))]))
    )
    assert "<script src=" not in html
    for marker in (
        'register("result/v0"',
        "rv0-claim-unrecognized",
        "rv0-rs-one-sided",
        "rv0-rs-finding",
        "rv0-close-unilateral",
        "rv0-close-agreed",
        "rv0-close-contested",
        "one side missing",
        "both sides disagree",
        "contested -- peer rebuts",
        "no peer record has responded to it",
    ):
        assert marker in html, marker
