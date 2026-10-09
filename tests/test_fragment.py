# SPDX-License-Identifier: Apache-2.0
"""The fragment codec writes the same token as Agent Action Capsule's
Fragment Codec (base64url, no padding, over UTF-8 JCS bytes), and still reads
tokens from this package's earlier encoder, which escaped non-ASCII and DEL.

``aac-presentation-fragment-vectors.json`` is copied byte-for-byte from
agent-action-capsule PR #209; ``fragment-codec-utf8-vectors.json`` carries
that repo's encoder output for the non-ASCII cases (see testdata/README.md).
The vectors are the arbiter, and they hold only strings, integers, booleans
and null: numbers keep ``json.dumps`` formatting, which is JCS for integers
within +/-(2**53 - 1) but not for larger integers or every float.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from capsule_viewer import encode_fragment
from capsule_viewer.fragment import decode_fragment

TESTDATA = Path(__file__).parent / "testdata"
AAC = json.loads((TESTDATA / "aac-presentation-fragment-vectors.json").read_text(encoding="utf-8"))
UTF8 = json.loads((TESTDATA / "fragment-codec-utf8-vectors.json").read_text(encoding="utf-8"))

# (name, payload, the token AAC's encoder writes) for all nine cases.
AAC_TOKENS = [
    (c["name"], c["payload"], c["fragment_py"] if c["ascii_json"] else UTF8["aac_tokens"][c["name"]])
    for c in AAC["cases"]
] + [(c["name"], c["payload"], c["token"]) for c in UTF8["cases"]]

# Tokens the earlier encoder wrote with \uXXXX escapes.
LEGACY = [(c["name"], c["payload"], c["fragment_py"]) for c in AAC["cases"] if not c["ascii_json"]]


def test_vector_files_cover_five_ascii_and_four_non_ascii_cases():
    assert sum(c["ascii_json"] for c in AAC["cases"]) == 5
    assert set(UTF8["aac_tokens"]) == {name for name, _, _ in LEGACY}
    assert len(AAC_TOKENS) == 9


@pytest.mark.parametrize(("name", "payload", "token"), AAC_TOKENS, ids=[n for n, _, _ in AAC_TOKENS])
def test_encoder_writes_the_aac_token(name, payload, token):
    assert encode_fragment(payload) == token


@pytest.mark.parametrize(("name", "payload", "token"), AAC_TOKENS, ids=[n for n, _, _ in AAC_TOKENS])
def test_decoder_reads_the_aac_token(name, payload, token):
    assert decode_fragment(token) == payload


@pytest.mark.parametrize(("name", "payload", "token"), LEGACY, ids=[n for n, _, _ in LEGACY])
def test_decoder_still_reads_an_escaped_token_from_the_earlier_encoder(name, payload, token):
    assert "\\u" in base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)).decode("utf-8")
    assert decode_fragment(token) == payload
    assert encode_fragment(payload) != token


def test_members_are_sorted_by_utf16_code_units_not_code_points():
    # U+1F600 is the surrogate pair D83D DE00, which sorts before U+FF61 in
    # UTF-16 although its code point is higher. Token from AAC's encoder.
    payload = {"｡": 1, "\U0001f600": 2}
    assert encode_fragment(payload) == "eyLwn5iAIjoyLCLvvaEiOjF9"


def test_member_order_is_canonical_at_every_depth():
    assert encode_fragment({"b": {"d": 1, "c": [{"f": 0, "e": 0}]}, "a": 0}) == encode_fragment(
        {"a": 0, "b": {"c": [{"e": 0, "f": 0}], "d": 1}}
    )

