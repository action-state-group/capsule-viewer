# SPDX-License-Identifier: Apache-2.0
"""The URL-fragment codec every viewer surface in this package shares.

base64url(JSON), no padding: opaque and URL-transportable, matching the
disclosure line every card in this repo carries ("this page reads its data
from the link fragment -- a browser never sends that part over the wire").
This is NOT a security mechanism -- the payload is not encrypted, only
encoded -- so it must never be relied on to hide data from someone who has
the link.

Vendored here (not imported from capsule-engine) because this package is the
new, sole home of the fragment-carried viewer -- capsule-engine keeps no copy
after the move ([batch4-capsule-viewer-three-buckets]).
"""
from __future__ import annotations

import base64
import json

__all__ = ["encode_fragment", "decode_fragment"]


def encode_fragment(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_fragment(token: str) -> dict:
    token = token.lstrip("#")
    padding = "=" * (-len(token) % 4)
    raw = base64.urlsafe_b64decode(token + padding)
    return json.loads(raw.decode("utf-8"))
