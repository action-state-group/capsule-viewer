# SPDX-License-Identifier: Apache-2.0
"""Base-level XSS guard: the shell embeds the fragment as base64url via
``json.dumps`` of an opaque token, never as raw JSON -- so attacker-supplied
field content (a Result's ``view.title``, a claim's ``presentation.summary``,
...) can never appear as literal bytes in the assembled HTML at all, let
alone break out of the embedding ``<script>`` tag. This is the string-level
half of the proof; ``js-tests/result_v0_card.test.js``'s XSS test covers the
DOM-construction half (every row is built with ``textContent``, never
``innerHTML``, so even a payload that DID reach the browser could not
execute).
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from capsule_viewer import build_payload, encode_fragment, render_base_viewer_html
from capsule_viewer.result_v0 import build_result_entry

PAYLOAD = "</script><script>window.pwned=1</script>"

TESTDATA = Path(__file__).parent / "testdata"

# The five typed-body strings the result/v0 card renders (claim types,
# ruling 2026-09-25): (fixture, path into claims[1]). The DOM half -- each
# reaches the page as textContent, never markup -- is js-tests' XSS suite;
# this is the string-level half for the same five fields.
TYPED_STRING_FIELDS = [
    ("pos-oo-reconcile-result.json", ("reconcile", "join_key")),
    ("pos-oo-reconcile-result.json", ("reconcile", "peer")),
    ("pos-oo-reconcile-result.json", ("reconcile", "state_of_record")),
    ("pos-oo-close-agreed-result.json", ("close", "peer")),
    ("pos-oo-close-agreed-result.json", ("close", "peer_close_ref", "digest")),
]
HOSTILE = [PAYLOAD, "<img src=x onerror=window.pwned=1>", "\"'><b onmouseover=window.pwned=1>x</b>"]


def test_malicious_field_content_never_appears_as_literal_bytes_in_the_shell():
    result = {
        "result_version": "evidence-result-v0",
        "generated_at": "2026-09-22T00:00:00Z",
        "claims": [],
        "aggregate": {
            "coverage": {"evaluated_population": 0, "excluded_not_applicable": 0, "unknown_count": 0},
            "buckets": {"met": [], "not_met": [], "not_evaluable": []},
        },
        "view": {"spec_version": "presentation/v1", "title": PAYLOAD},
    }
    entry = build_result_entry(result)
    fragment = encode_fragment(build_payload([entry]))
    html = render_base_viewer_html(fragment)

    # base64url's alphabet is [A-Za-z0-9_-] only -- the payload's special
    # characters cannot survive encoding, so the raw string is structurally
    # absent from the assembled shell.
    assert PAYLOAD not in html
    assert "</script><script>" not in html


@pytest.mark.parametrize("hostile", HOSTILE)
@pytest.mark.parametrize(("fixture", "path"), TYPED_STRING_FIELDS)
def test_hostile_typed_body_strings_never_appear_as_literal_bytes_and_round_trip_unchanged(
    fixture: str, path: tuple[str, ...], hostile: str
):
    result = json.loads((TESTDATA / fixture).read_text(encoding="utf-8"))
    target = result["claims"][1]
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = hostile

    fragment = encode_fragment(build_payload([build_result_entry(result)]))
    html = render_base_viewer_html(fragment)
    assert hostile not in html
    assert "<img src=x" not in html
    assert "onmouseover=" not in html
    assert "</script><script>" not in html

    # ...and the carrier did not mangle it either: the browser gets the exact
    # string, and the card (js-tests) is what keeps it text.
    decoded = json.loads(base64.urlsafe_b64decode(fragment + "=" * (-len(fragment) % 4)))
    assert decoded["entries"][0]["record"] == result
