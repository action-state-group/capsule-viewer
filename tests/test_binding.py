# SPDX-License-Identifier: Apache-2.0
"""``sha256-jcs-nonce256`` (presentation contract section 7.2): agreement with
the commitments capsulectl's Go code sealed, and with the JavaScript
construction deal-view.js used, on strings JCS escapes differently from naive
serialisers."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess

import pytest
from receipt_helpers import load

from capsule_viewer.binding import check_opening, commitment

NONCE = "a" * 64


@pytest.mark.parametrize("name", ["keep", "golden-2"])
def test_agrees_with_the_commitment_capsulectl_sealed(name):
    """Two independent capsulectl runs: the baseline's verbatim_commitment
    (computed in Go) recomputes from the sealed report's opening."""
    bundle, _ = load(name)
    report_id = bundle["extensions"]["x-deal-v0"]["sealed_report"]
    report = bundle["disclosures"][report_id]["agent_input"]["report"]
    baseline = bundle["disclosures"][report["asked_step"]]["agent_input"]["body"]
    opening = report["asked_opening"]
    assert commitment(opening["nonce"], opening["text"]) == baseline["intent"]["verbatim_commitment"]
    assert check_opening(baseline["intent"]["verbatim_commitment"], opening["nonce"], opening["text"]) == "opened"


TRICKY = [
    "plain",
    'quote " and backslash \\',
    "controls \b\f\n\r\t and \x00\x01\x1f",
    "delete \x7f stays raw",
    "line separators    stay raw",
    "non-ASCII é 日本 and an emoji 🧾",
    "</script><b>markup</b>",
]


@pytest.mark.parametrize("text", TRICKY)
def test_agrees_with_javascript_json_stringify(text):
    node = shutil.which("node")
    if node is None:
        if os.environ.get("CI"):
            pytest.fail("node is required under CI for the cross-implementation check")
        pytest.skip("SKIPPED: node not found; the JavaScript agreement check did not run")
    script = (
        "const [n, t] = JSON.parse(require('fs').readFileSync(0, 'utf8'));"
        "const s = `{\"nonce\":${JSON.stringify(n)},\"text\":${JSON.stringify(t)}}`;"
        "process.stdout.write(require('crypto').createHash('sha256').update(s, 'utf8').digest('hex'));"
    )
    js = subprocess.run([node, "-e", script], input=json.dumps([NONCE, text]), capture_output=True, text=True, check=True).stdout
    assert commitment(NONCE, text) == js


def test_states():
    good = commitment(NONCE, "words")
    assert check_opening(good, NONCE, "words") == "opened"
    assert check_opening(good, None, None) == "committed"
    assert check_opening(good, NONCE, "other words") == "mismatch"
    assert check_opening(good, NONCE.upper(), "words") == "mismatch"  # uppercase hex is not a valid nonce
    assert check_opening(good, NONCE[:-1], "words") == "mismatch"
    assert check_opening(good, NONCE, None) == "mismatch"
    assert check_opening(None, NONCE, "words") == "mismatch"
    assert check_opening(good.upper(), NONCE, "words") == "mismatch"
    assert check_opening(good, NONCE, "\ud800") == "mismatch"  # a lone surrogate has no UTF-8 form


def test_the_serialisation_is_jcs_member_order():
    expected = hashlib.sha256(('{"nonce":"' + NONCE + '","text":"x"}').encode()).hexdigest()
    assert commitment(NONCE, "x") == expected
