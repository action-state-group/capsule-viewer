# SPDX-License-Identifier: Apache-2.0
"""The text-binding check of the presentation contract, section 7.2:
``sha256-jcs-nonce256``.

    commitment = lowercase_hex(SHA-256(JCS({"nonce": N, "text": T})))

This is a core service: a module says which sealed commitment pairs with
which opening and calls it, and shows the words only on ``opened``; it never
hashes anything itself. For an object of
exactly two string members, JCS (RFC 8785) orders them ``nonce`` then ``text``
and escapes each string as ECMAScript's ``JSON.stringify`` does, which is what
``json.dumps`` with ``ensure_ascii=False`` produces for strings: the short
escapes for backspace, form feed, newline, carriage return and tab, ``\\u00xx``
for the other control characters, and every other character as itself.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Literal

COMMIT_ALG = "sha256-jcs-nonce256"
NONCE = re.compile(r"^[0-9a-f]{64}$")
COMMITMENT = re.compile(r"^[0-9a-f]{64}$")

# ``opened``: the opening recomputes to the commitment, so the text may be
# shown. ``committed``: there is a commitment and no opening, so the text is
# committed and not shown. ``mismatch``: an opening was supplied and does not
# recompute (or is malformed), so the text must not be shown.
BindingState = Literal["opened", "committed", "mismatch"]


def commitment(nonce: str, text: str) -> str:
    serialized = json.dumps({"nonce": nonce, "text": text}, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def check_opening(committed: object, nonce: object, text: object) -> BindingState:
    """The state of one committed text, given whatever opening was supplied
    (``None`` for none)."""
    if nonce is None and text is None:
        return "committed"
    if not (isinstance(committed, str) and COMMITMENT.match(committed)):
        return "mismatch"
    if not (isinstance(nonce, str) and NONCE.match(nonce) and isinstance(text, str)):
        return "mismatch"
    try:
        recomputed = commitment(nonce, text)
    except UnicodeEncodeError:
        # A lone surrogate has no UTF-8 form, so no JCS form: such an opening
        # cannot open any commitment, which is what "mismatch" says.
        return "mismatch"
    return "opened" if recomputed == committed else "mismatch"
