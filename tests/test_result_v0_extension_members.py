# SPDX-License-Identifier: Apache-2.0
"""Extension members (``x-``, Evidence Result v0 section 8a, agent-action-capsule
``7662a003``): ``build_result_entry`` -- default and ``strict=True`` -- carries a
Result with ``x-`` members at the document and claim level, byte-identical,
and never refuses one because of an ``x-`` member's presence or content.

How the card renders them (exactly as if they were absent) is pinned in
``js-tests/result_v0_extension_members.test.js``; both files pin the same
two vendored fixtures by sha256 (``tests/testdata/README.md``).
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import re
from pathlib import Path

import pytest

from capsule_viewer import build_payload, encode_fragment
from capsule_viewer.result_v0 import build_result_entry, malformed_digest_refs

ROOT = Path(__file__).resolve().parent.parent
TESTDATA = ROOT / "tests" / "testdata"
JS_TWIN = ROOT / "js-tests" / "result_v0_extension_members.test.js"

AAC_COMMIT = "7662a00362049bcf287108497a1e3a867141dd67"
PINNED = {
    "pos-example-org-extended-result.json": "f194bcb3baa4c3db25e6b13b7d8996d4e00ef4fcc6f7dac187a059e68af4ebb7",
    "pos-judge-producer-x-judge-result.json": "d8c1ee5b38ac7680ecfbfce1d24b605afbe4b21f4db62b4f6ad0f0668a577f70",
}
X_FIXTURES = sorted(PINNED)


def load(name: str) -> dict:
    return json.loads((TESTDATA / name).read_text(encoding="utf-8"))


def decode(fragment: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(fragment + "=" * (-len(fragment) % 4)))


def strip_extensions(result: dict) -> dict:
    """The same document with every ``x-`` member removed, at the two levels
    the slot admits (the document and each claim). Nothing else is touched."""
    out = {k: v for k, v in result.items() if not k.startswith("x-")}
    out["claims"] = [{k: v for k, v in c.items() if not k.startswith("x-")} for c in result["claims"]]
    return out


@pytest.mark.parametrize("name", X_FIXTURES)
def test_vendored_fixture_matches_its_pin(name: str):
    assert hashlib.sha256((TESTDATA / name).read_bytes()).hexdigest() == PINNED[name]


def test_js_twin_pins_the_same_files_and_digests():
    js = JS_TWIN.read_text(encoding="utf-8")
    assert dict(re.findall(r'"(pos-[a-z0-9-]+\.json)": "([0-9a-f]{64})"', js)) == PINNED
    assert AAC_COMMIT in (TESTDATA / "README.md").read_text(encoding="utf-8")


@pytest.mark.parametrize("name", X_FIXTURES)
def test_fixture_has_x_members_at_both_levels(name: str):
    result = load(name)
    assert any(k.startswith("x-") for k in result)
    assert any(k.startswith("x-") for c in result["claims"] for k in c)


def test_extended_positive_stripped_is_the_claims_positive():
    assert strip_extensions(load("pos-example-org-extended-result.json")) == load("pos-example-org-claims-result.json")


@pytest.mark.parametrize("strict", [False, True])
@pytest.mark.parametrize("name", X_FIXTURES)
def test_build_result_entry_carries_x_members_byte_identical(name: str, strict: bool):
    result = load(name)
    entry = build_result_entry(result, strict=strict)
    assert entry["record"] == result
    decoded = decode(encode_fragment(build_payload([entry])))
    assert decoded["entries"][0]["record"] == result


def test_strict_never_reads_an_x_member_even_one_shaped_like_a_bad_digest_ref():
    """Section 8a: a verifier MUST NOT reject a document because of an
    extension member's content. A malformed digest-ref inside an x- member is
    the producer's own data, not a digest position this carrier walks."""
    result = copy.deepcopy(load("pos-example-org-close-agreed-result.json"))
    bad = [{"digest_alg": "SHA-256", "digest": "sha256:" + "0" * 64}]
    result["x-evidence"] = bad
    for claim in result["claims"]:
        claim["x-evidence"] = bad
        claim["x-proofs"] = bad
        claim["x-close"] = {"close_ref": bad[0]}
    assert malformed_digest_refs(result) == []
    entry = build_result_entry(result, records=load("pos-example-org-close-agreed-result.records.json"), strict=True)
    assert entry["record"] == result


def test_strict_still_refuses_a_bad_defined_digest_ref_beside_x_members():
    """The slot is not a bypass: a malformed DEFINED position is still refused."""
    result = copy.deepcopy(load("pos-example-org-extended-result.json"))
    result["claims"][1]["evidence"][0]["digest"] = "sha256:" + "0" * 64
    with pytest.raises(ValueError, match=r"claims\[1\]\.evidence\[0\]"):
        build_result_entry(result, strict=True)
