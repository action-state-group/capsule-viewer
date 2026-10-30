# SPDX-License-Identifier: Apache-2.0
"""The evidence report over the cases capsule-emit's own tests drew it for
(moved here with the page from ``test_evidence_file.py``,
``test_evidence_file_vectors.py`` and ``test_evidence_file_witnesses.py``),
and over the tamper, withholding and injection cases a third party's page has
to report. Each bundle is checked live by capsule-emit's
``check_evidence_file``; the page shows what it found.

The bundles come from ``tests/testdata/evidence-report`` (see
``test_evidence_report_golden.py``), so every case is the same bytes each run.
"""
from __future__ import annotations

import dataclasses
import html
import json
import re
from pathlib import Path

import pytest
from capsule_emit.evidence_file import Check, check_evidence_file
from evidence_report_helpers import banner_class, no_link_or_script

from capsule_viewer.evidence_report import check_and_render, main, render_report_html
from capsule_viewer.shell import NOT_WITNESSED

GOLDENS = Path(__file__).parent / "testdata" / "evidence-report"


def bundle(case: str) -> dict:
    return json.loads((GOLDENS / case / "bundle.json").read_text(encoding="utf-8"))


def verdict_class(page: str) -> str:
    return re.search(r'<div class="verdict ([a-z]+)">', page).group(1)


# -- moved from capsule-emit's test_evidence_file.py -------------------------


@pytest.mark.parametrize("field, value", [("log_id", "another-log"), ("root", "ef" * 32), ("timestamp", "2030-01-01T00:00:00Z")])
def test_a_checkpoint_copy_that_differs_from_the_signed_one_is_not_a_log(field, value):
    edited = bundle("whole-log")
    edited["checkpoint"][field] = value
    check, page = check_and_render(edited)
    assert check.verdict == "INVALID"
    assert f"checkpoint_field_mismatch:{field}" in page
    assert "does not match its signature" in page and "signed the checkpoint" not in page
    assert "<dt>Log</dt>" not in page


def test_a_hostile_record_is_reported_and_never_rendered_raw(tmp_path, capsys):
    path = tmp_path / "b.json"
    path.write_text((GOLDENS / "hostile-record" / "bundle.json").read_text(encoding="utf-8"))
    out = tmp_path / "r.html"
    assert main([str(path), "-o", str(out)]) == 1  # the edits break the records
    page = out.read_text(encoding="utf-8")
    no_link_or_script(page)
    assert "Fails." in page and "What this file does not show" in page
    assert "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;" in page


def test_a_whole_log_file_says_what_it_shows_and_where_to_check_it():
    _, page = check_and_render(bundle("whole-log"), source="b.json")
    assert html.escape(NOT_WITNESSED) in page  # no witness directory, so no receipt is checked
    assert "The request and response text" in page
    assert "capsule-emit verify --bundle b.json" in page


def test_an_unanchored_file_is_incomplete_and_names_no_log():
    _, page = check_and_render(bundle("unsigned-checkpoint"))
    assert "Incomplete: this file carries no signed checkpoint" in page
    assert "<dt>Log</dt>" not in page


# -- moved from test_evidence_file_vectors.py and test_evidence_file_witnesses.py


def test_a_live_evidence_file_renders():
    live = bundle("live-provider")
    check, page = check_and_render(live, source="two-node-provider.json")
    assert "Evidence report" in page and live["checkpoint"]["log_id"] in page
    assert verdict_class(page) == banner_class(check)


def test_a_witness_receipt_shows_as_the_verifier_judged_it(tmp_path, capsys):
    directory = GOLDENS / "witnessed" / "witnesses.json"
    path = tmp_path / "file.json"
    path.write_text((GOLDENS / "witnessed" / "bundle.json").read_text(encoding="utf-8"))
    out = tmp_path / "r.html"
    main([str(path), "--witness-directory", str(directory), "-o", str(out)])
    assert "witness.example: verified" in out.read_text(encoding="utf-8")
    main([str(path), "-o", str(out)])  # no directory: no witness is trusted
    assert "witness.example: not checked (no key known)" in out.read_text(encoding="utf-8")


# -- tampered signatures, proofs and roots -----------------------------------


def _edit(case: str, edit) -> dict:
    edited = bundle(case)
    edit(edited)
    return edited


def _flip_signature(b: dict) -> None:
    sig = b["records"][0]["signature"]
    b["records"][0]["signature"] = sig[:-4] + ("1111" if sig.endswith("0000") else "0000")


def _break_proof(b: dict) -> None:
    proof = next(iter(b["completeness_certificate"]["memberships"].values()))["inclusion_proof"]
    proof["witness"][0] = "00" * 32


TAMPERED = {
    "signature": (_flip_signature, "signatures", "producer_signature_invalid:"),
    "inclusion proof": (_break_proof, "per_record_membership", "membership_proof_invalid:"),
    "range root": (lambda b: b["completeness_certificate"].update(range_root="ef" * 32), "interval_coverage",
                   "completeness_certificate_invalid"),
    "bundle root": (lambda b: b.update(root="ab" * 32), "graph_closure", "root_not_supplied_with_matching_identity"),
}


def test_the_untampered_file_checks():
    check, page = check_and_render(bundle("whole-log"))
    assert check.verdict == "VALID" and verdict_class(page) == "withheld"  # checks, but no receipt checked
    assert page.count("producer_signature_invalid") == 0


@pytest.mark.parametrize("what", sorted(TAMPERED))
def test_a_tampered_file_fails_on_the_check_it_breaks(what):
    edit, claim, finding = TAMPERED[what]
    check, page = check_and_render(_edit("whole-log", edit))
    assert check.verdict == "INVALID" and verdict_class(page) == "fail"
    failing = {c.name for c in check.checks if c.status == "fail"}
    assert claim in failing
    assert finding in page
    if what == "signature":
        assert '<span class="mark fail">✗</span> invalid' in page


# -- withheld payloads and disclosures ---------------------------------------


def test_a_withheld_payload_is_said_to_be_withheld_and_never_shown():
    b = bundle("whole-log")
    assert "disclosures" not in b and b["completeness"]["payloads_mode"] == "selected"
    _, page = check_and_render(b)
    assert "The request and response text. The records commit to it by digest only." in page
    assert '"step"' not in page and "agent_input_digest" not in page


def test_a_failed_disclosure_claim_is_drawn_as_a_failure():
    """Render only: a result whose disclosure claim failed, in the shape
    capsule-emit reports a claim. The page reads the verifier's statuses and
    has no disclosure logic of its own."""
    b = bundle("whole-log")
    cid = b["records"][0]["capsule_id"]
    check = check_evidence_file(b)
    failed = dataclasses.replace(check, checks=[*check.checks, Check("disclosures", "fail", (f"disclosure_mismatch:{cid}:agent_input",))])
    page = render_report_html(b, failed)
    assert verdict_class(page) == "fail" and f"disclosure_mismatch:{cid}:agent_input" in page


# -- malformed oversized bundle_ref, and injection ---------------------------


def test_a_malformed_oversized_bundle_ref_is_not_an_evidence_file(tmp_path, capsys):
    """A pointer permalink's ``bundle_ref`` is not a bundle: the file is
    refused as not an evidence file, nothing in it is followed or drawn as a
    link, and its size does not change that."""
    pointer = {
        "bundle_ref": {
            "digest": "zz" * 50_000,
            "root": "<script>alert(1)</script>",
            "locations": ["javascript:alert(1)", "https://bundles.example/b.json"] * 2_000,
        }
    }
    check, page = check_and_render(pointer)
    assert not check.kind_ok and check.verdict == "INVALID"
    assert verdict_class(page) == "fail" and "not an evidence file" in page
    no_link_or_script(page)
    assert "javascript:" not in page and "bundles.example" not in page
    path = tmp_path / "pointer.json"
    path.write_text(json.dumps(pointer))
    assert main([str(path), "-o", str(tmp_path / "p.html")]) == 1


def test_a_hostile_file_name_is_text():
    hostile = '"><script>alert(1)</script><a href="javascript:alert(1)">x</a>.json'
    _, page = check_and_render(bundle("whole-log"), source=hostile)
    no_link_or_script(page)
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in page


@pytest.mark.parametrize("case", sorted(p.name for p in GOLDENS.iterdir() if p.is_dir()))
def test_the_banner_never_claims_more_than_the_verdict(case):
    """agent-action-capsule#196: the banner and ``capsule-emit verify --bundle``
    agree, because the banner is that verdict: pass only on VALID, and only
    when a witness receipt was checked (evidencebook#209)."""
    check, page = check_and_render(bundle(case))
    assert verdict_class(page) == banner_class(check)
