# SPDX-License-Identifier: Apache-2.0
"""Boundary check: this viewer opens and verifies fully offline. Neither the
static JS modules nor the assembled HTML may reference the network in any
form -- no external <script src>, no fetch/XHR/WebSocket, no remote import.
"""
from __future__ import annotations

from importlib import resources

from capsule_viewer import (
    MODULE_SCRIPTS,
    build_entry,
    build_payload,
    encode_fragment,
    render_base_viewer_html,
)
from capsule_viewer.result_v0 import build_result_entry

FORBIDDEN = ["fetch(", "XMLHttpRequest", "WebSocket(", "<script src", "import(", "navigator.sendBeacon"]


def _all_static_sources() -> list[tuple[str, str]]:
    static_dir = resources.files("capsule_viewer").joinpath("static")
    sources = [("capsule_viewer.js", static_dir.joinpath("capsule_viewer.js").read_text(encoding="utf-8"))]
    for name in MODULE_SCRIPTS:
        sources.append((name, static_dir.joinpath(name).read_text(encoding="utf-8")))
    return sources


def test_no_network_primitive_in_any_static_module():
    for name, source in _all_static_sources():
        for token in FORBIDDEN:
            assert token not in source, f"{name} contains forbidden network primitive: {token}"


def test_no_network_primitive_in_assembled_html_for_capsule_and_result_entries():
    entries = [
        build_entry({"capsule_id": "abc123"}, conversation={"disclosed": True, "messages": []}),
        build_result_entry({"result_version": "evidence-result-v0", "claims": [], "aggregate": {}}),
    ]
    html = render_base_viewer_html(encode_fragment(build_payload(entries)))
    for token in FORBIDDEN:
        assert token not in html, f"assembled HTML contains forbidden network primitive: {token}"


# The presentation kit: its stylesheet and the page it assembles carry no
# network reference of any kind -- no link, no remote url(), no @import, no
# external font -- so a kit page opens offline exactly like the base viewer.
KIT_FORBIDDEN = [*FORBIDDEN, "http://", "https://", "url(", "@import", "@font-face", "href=", "src="]


def test_no_network_reference_or_external_href_in_the_kit():
    from capsule_viewer.kit import kit_css, page
    from capsule_viewer.kit.fixture import fixture_page

    for name, source in [("kit.css", kit_css()), ("kit page", page("t", "x")), ("kit fixture page", fixture_page())]:
        lowered = source.lower()
        for token in KIT_FORBIDDEN:
            assert token not in lowered, f"{name} contains forbidden network reference: {token}"
