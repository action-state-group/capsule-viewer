# SPDX-License-Identifier: Apache-2.0
"""The URL-fragment codec every viewer surface in this package shares.

base64url(UTF-8 JSON), no padding, members in RFC 8785 (JCS) order -- the
same Fragment Codec Agent Action Capsule's builder uses, so both write the same
token for any payload that codec accepts (it refuses floats and integers
beyond +/-(2**53 - 1)). Opaque and URL-transportable, matching the
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


# A JSON object of any shape: a fragment payload has no fixed keys.
def _jcs_members(pairs: list[tuple[str, object]]) -> dict[str, object]:
    # JCS sorts members by UTF-16 code units; plain sort_keys sorts by code
    # point, which differs once keys mix U+E000..U+FFFF with astral characters.
    return dict(sorted(pairs, key=lambda pair: pair[0].encode("utf-16-be")))


def encode_fragment(payload: dict) -> str:
    # Only member order and string form are JCS here: numbers keep json.dumps
    # formatting, which matches JCS for integers within +/-(2**53 - 1) but not
    # for larger integers or for every float.
    ordered = json.loads(json.dumps(payload), object_pairs_hook=_jcs_members)
    raw = json.dumps(ordered, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_fragment(token: str) -> dict:
    # Also reads tokens from the earlier encoder, which wrote \uXXXX escapes.
    token = token.lstrip("#")
    padding = "=" * (-len(token) % 4)
    raw = base64.urlsafe_b64decode(token + padding)
    return json.loads(raw.decode("utf-8"))
