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

import json
from pathlib import Path

from capsule_viewer import build_payload, encode_fragment, render_base_viewer_html
from capsule_viewer.result_v0 import build_result_entry

TESTDATA = Path(__file__).parent / "testdata"


def load(name: str) -> dict:
    return json.loads((TESTDATA / name).read_text(encoding="utf-8"))


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
    import base64

    decoded = json.loads(base64.urlsafe_b64decode(fragment + "=" * (-len(fragment) % 4)))
    assert decoded["entries"][0]["record"] == result
