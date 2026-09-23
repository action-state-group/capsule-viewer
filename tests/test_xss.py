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

from capsule_viewer import build_payload, encode_fragment, render_base_viewer_html
from capsule_viewer.result_v0 import build_result_entry

PAYLOAD = "</script><script>window.pwned=1</script>"


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
