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
from capsule_viewer.result_v0 import DIGEST_HEX, build_result_entry, is_digest_ref, malformed_digest_refs

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
    "neg-close-agreed-relabelled-contested.json",
    "neg-render-reconcile-one-sided-only.json",
]

# The close fixtures ship the record headers their claim cites beside them
# (`<name>.records.json`, vendored with the fixtures); the card recomputes
# close_state from those records' links when the entry carries them.
CLOSE_FIXTURES = [
    "pos-oo-close-agreed-result.json",
    "pos-oo-close-contested-result.json",
    "pos-oo-close-unilateral-result.json",
    "pos-oo-close-unilateral-named-peer-result.json",
    "neg-close-agreed-relabelled-contested.json",
    # the maintainer's third pass (2026-09-29): the counterparty is the
    # named peer's book -- each asserts AGREED over an acknowledger that is
    # not that (the Close's own book; a third book; a Close naming no book)
    "neg-close-agreed-self-acknowledged.json",
    "neg-close-agreed-third-book.json",
    "neg-close-agreed-bookless-close.json",
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
        "rv0-close-recomputed",
        "rv0-close-producer-asserted",
        "rv0-close-state-mismatch",
        "rv0-close-ignored-link",
        "one side missing",
        "both sides disagree",
        "contested -- peer rebuts",
        "no peer record has responded to it",
    ):
        assert marker in html, marker
    # the ✓ affordance on AGREED is gone from the shipped bytes (2026-09-28)
    assert "rv0-close-agreed-mark" not in html
    assert "acknowledged by" not in html


# --- close_state is derivable: the records travel beside the Result ---------


@pytest.mark.parametrize("name", CLOSE_FIXTURES)
def test_records_travel_beside_the_result_byte_identical(name: str):
    result = load(name)
    records = load(name.replace(".json", ".records.json"))
    entry = build_result_entry(result, records=records)
    assert entry["records"] == records
    assert entry["record"] == result
    decoded = decode(encode_fragment(build_payload([entry])))
    assert decoded["entries"][0]["records"] == records
    assert decoded["entries"][0]["record"] == result
    # every digest the close claim cites names a record in the sidecar --
    # the vendored copy is the one the schema repo's checker walked
    cited = {result["claims"][1]["close"]["close_ref"]["digest"]}
    if "peer_close_ref" in result["claims"][1]["close"]:
        cited.add(result["claims"][1]["close"]["peer_close_ref"]["digest"])
    assert cited  # the card, not Python, digests the records (js-tests)


def test_entry_without_records_carries_no_records_key():
    entry = build_result_entry(load("pos-oo-close-agreed-result.json"))
    assert "records" not in entry
    decoded = decode(encode_fragment(build_payload([entry])))
    assert "records" not in decoded["entries"][0]


# --- digest format (maintainer's second pass, 2026-09-28) ------------------
#
# A digest-ref is SHA-256 + exactly 64 lowercase hex -- the form every
# vendored vector carries and the only one the card's jsonDigest port can
# ever match. The card refuses any other form at render time (js-tests);
# Python's half is the same predicate on the carrier side: `strict=True`
# refuses a malformed document before it is embedded, the default carries
# it byte-identical for the card to refuse visibly.

GOOD = "96d4eaee8c5957d488159dac6d5f40a1789aa9ee5190ed7f1131b22fa6c39c48"
MALFORMED = [
    ("sha256-prefixed", "sha256:" + GOOD),
    ("63-hex", GOOD[:63]),
    ("65-hex", GOOD + "0"),
    ("uppercase", GOOD.upper()),
    ("non-hex", "g" * 64),
    ("empty", ""),
    ("not-a-string", 12345678),
]

ALL_FIXTURES = sorted(p.name for p in TESTDATA.glob("*.json") if not p.name.endswith(".records.json"))


def test_is_digest_ref_accepts_exactly_the_vectors_form():
    assert DIGEST_HEX.match(GOOD)
    assert is_digest_ref({"digest_alg": "SHA-256", "digest": GOOD})
    assert not is_digest_ref({"digest_alg": "SHA-512", "digest": GOOD})
    assert not is_digest_ref({"digest": GOOD})
    assert not is_digest_ref(GOOD)
    for label, digest in MALFORMED:
        assert not is_digest_ref({"digest_alg": "SHA-256", "digest": digest}), label


@pytest.mark.parametrize("label,digest", MALFORMED)
def test_strict_refuses_a_malformed_close_ref_and_names_the_position(label: str, digest):
    result = load("pos-oo-close-agreed-result.json")
    result["claims"][1]["close"]["close_ref"]["digest"] = digest
    assert malformed_digest_refs(result) == ["claims[1].close.close_ref"], label
    with pytest.raises(ValueError, match=r"claims\[1\]\.close\.close_ref"):
        build_result_entry(result, records=load("pos-oo-close-agreed-result.records.json"), strict=True)


def test_malformed_digest_refs_walks_every_digest_position():
    result = load("pos-oo-close-agreed-result.json")
    result["claims"][0]["evidence"][0]["digest"] = "sha256:" + GOOD
    result["claims"][0]["proofs"][0]["digest"] = GOOD.upper()
    result["claims"][0]["presentation"]["evidence"][0]["digest_alg"] = "SHA-512"
    result["claims"][1]["close"]["peer_close_ref"]["digest"] = GOOD[:63]
    assert malformed_digest_refs(result) == [
        "claims[0].evidence[0]",
        "claims[0].proofs[0]",
        "claims[0].presentation.evidence[0]",
        "claims[1].close.peer_close_ref",
    ]


def test_default_carries_a_malformed_document_byte_identical_for_the_card_to_refuse():
    """The carrier never repairs: the card renders the refusal row
    (js-tests), so the malformed value must reach it exactly as written."""
    result = load("pos-oo-close-agreed-result.json")
    result["claims"][1]["close"]["close_ref"]["digest"] = "sha256:" + GOOD
    entry = build_result_entry(result)
    assert entry["record"] == result
    decoded = decode(encode_fragment(build_payload([entry])))
    assert decoded["entries"][0]["record"]["claims"][1]["close"]["close_ref"]["digest"] == "sha256:" + GOOD


@pytest.mark.parametrize("name", ALL_FIXTURES)
def test_every_vendored_fixture_is_in_the_vectors_digest_form(name: str):
    result = load(name)
    assert malformed_digest_refs(result) == []
    build_result_entry(result, strict=True)  # does not raise
