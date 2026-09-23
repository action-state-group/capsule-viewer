# SPDX-License-Identifier: Apache-2.0
"""capsule-viewer -- the offline, fragment-carried capsule/Result viewer.

Renders any conforming record on its ``CapsuleViewer.register(kind,
renderCard)`` seam: a sealed AAC capsule (e.g. ``conversation_exchange``) or
an Evidence Result v0 document (``result/v0``). Zero pack code, zero company
vocabulary, no network at render time -- the artifact this package builds
opens and verifies fully offline, on either end.
"""
from .base_viewer import (
    MODULE_SCRIPTS,
    build_entry,
    build_payload,
    encode_fragment,
    render_base_viewer_html,
)
from .result_v0 import build_result_entry

__all__ = [
    "MODULE_SCRIPTS",
    "render_base_viewer_html",
    "build_entry",
    "build_payload",
    "build_result_entry",
    "encode_fragment",
]
