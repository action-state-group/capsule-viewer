# SPDX-License-Identifier: Apache-2.0
"""The fragment-carried BASE viewer + its domain-module plug-in seam
(``capsule_viewer/base_viewer.py``). Moved, with its test coverage, from
capsule-engine ([batch4-capsule-viewer-three-buckets]) -- capsule-engine
keeps no copy after the move.

Covers the public build/render surface and the two embed invariants
``render_base_viewer_html`` checks at runtime: exactly one fragment
placeholder in the shell, and the fragment never leaking into the boot
guard's literal comparison.
"""
from __future__ import annotations

import json

from capsule_viewer import (
    build_entry,
    build_payload,
    encode_fragment,
    render_base_viewer_html,
)


def test_build_entry_carries_the_capsule_and_a_default_undisclosed_conversation():
    entry = build_entry({"capsule_id": "abc123", "action_type": "fyi"})
    assert entry["capsule_id"] == "abc123"
    assert entry["record"] == {"capsule_id": "abc123", "action_type": "fyi"}
    assert entry["conversation"] == {"disclosed": False, "messages": []}


def test_build_entry_carries_a_disclosed_conversation_when_given_one():
    conversation = {"disclosed": True, "messages": [{"role": "user", "content": "hi"}]}
    entry = build_entry({"capsule_id": "abc123"}, conversation=conversation)
    assert entry["conversation"] == conversation


def test_build_payload_shape():
    entry = build_entry({"capsule_id": "abc123"})
    payload = build_payload([entry], operator="acme-corp", source="test-suite")
    assert payload["view_version"] == "capsule-base-1"
    assert payload["operator"] == "acme-corp"
    assert payload["source"] == "test-suite"
    assert payload["entries"] == [entry]


def test_render_base_viewer_html_is_self_contained_no_external_script_src():
    entry = build_entry({"capsule_id": "abc123"}, conversation={"disclosed": True, "messages": []})
    fragment = encode_fragment(build_payload([entry]))
    html = render_base_viewer_html(fragment)
    assert "<script src=" not in html
    # the base script, the conversation_exchange module, and the result/v0
    # module are all inlined
    assert "CapsuleViewer" in html
    assert "conv-card" in html
    assert 'register("result/v0"' in html


def test_render_base_viewer_html_embeds_exactly_the_given_fragment():
    fragment = encode_fragment(build_payload([build_entry({"capsule_id": "xyz"})]))
    html = render_base_viewer_html(fragment)
    assert f"window.__CAPSULE_FRAGMENT_B64U__={json.dumps(fragment)};" in html


def test_encode_fragment_round_trips_the_payload():
    import base64

    payload = build_payload([build_entry({"capsule_id": "abc123"})], operator="op")
    fragment = encode_fragment(payload)
    # base64url, no padding
    assert "+" not in fragment and "/" not in fragment and "=" not in fragment
    decoded = json.loads(base64.urlsafe_b64decode(fragment + "=" * (-len(fragment) % 4)))
    assert decoded == payload
