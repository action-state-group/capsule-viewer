# SPDX-License-Identifier: Apache-2.0
"""The evidence report page: capsule-emit's verifier checks, this renders.

Every bundle here is produced by the donated libraries (capsule-emit,
checkpointed-local-log) and every result by capsule-emit's
``check_evidence_file``. These tests hold the page to three things: it shows
the verifier's statuses and not its own (a result altered after the check
renders as altered); it never renders one bundle's result over another
bundle's records; and it points the reader back at the donated verifier.
"""
from __future__ import annotations

import dataclasses
import html
import importlib.util
import json
import re

import pytest
from capsule_emit.evidence_file import Check, check_evidence_file
from evidence_report_helpers import banner_class, exported_bundle, whole_log_bundle

from capsule_viewer import evidence_report
from capsule_viewer.evidence_report import BundleMismatch, check_and_render, main, render_report_html
from capsule_viewer.shell import NOT_WITNESSED, WITNESS_UNREPORTED

FORBIDDEN = ["fetch(", "XMLHttpRequest", "WebSocket(", "<script", "import(", "navigator.sendBeacon", "@import", "url("]


def _verdict_class(page: str) -> str:
    start = page.index('<div class="verdict ') + len('<div class="verdict ')
    return page[start : page.index('"', start)]


def _tamper(bundle: dict) -> dict:
    """The same bundle with one record's content changed after sealing."""
    edited = json.loads(json.dumps(bundle))
    edited["records"][0]["timestamp"] = "1999-01-01T00:00:00Z"
    return edited


@pytest.fixture
def exported(tmp_path):
    return exported_bundle(tmp_path)


def test_a_whole_log_bundle_renders_the_verifiers_valid_result(tmp_path):
    bundle = whole_log_bundle(tmp_path)
    check, page = check_and_render(bundle, source="b.json")
    assert check.verdict == "VALID"
    # No witness directory, so no receipt is checked: the chain checks only
    # against its holder's own signatures, and the page says so.
    assert _verdict_class(page) == "withheld"
    assert html.escape(NOT_WITNESSED) in page and "Everything this file claims checks" not in page
    for c in check.checks:
        assert html.escape(c.plain) in page
    assert check.bundle_digest in page
    assert "test-log" in page and "signed the checkpoint and every record" in page
    assert page.count("<tr>") == 1 + len(bundle["records"])
    # payloads_mode "selected" with no disclosures: the text is not in the file.
    assert "The request and response text" in page


def test_an_exported_bundle_renders_exactly_what_the_verifier_reported(exported):
    path, bundle = exported
    check, page = check_and_render(bundle, source=path.name)
    # `capsule-emit bundle --all` proves the whole log, seq 1 to the
    # checkpoint tip, so every check passes, interval coverage included.
    assert check.verdict == "VALID"
    assert _verdict_class(page) == "withheld" and html.escape(NOT_WITNESSED) in page
    statuses = {c.name: c.status for c in check.checks}
    assert statuses["interval_coverage"] == "pass"
    for c in check.checks:
        assert f'<li class="{c.status}">' in page and html.escape(c.plain) in page
    assert "example-org/node-1" in page
    assert "capsule-emit verify --bundle bundle.json" in page


def test_a_tampered_record_renders_as_the_verifier_failed_it(exported):
    _, bundle = exported
    check, page = check_and_render(_tamper(bundle))
    assert check.verdict == "INVALID"
    assert _verdict_class(page) == "fail"
    assert "This file does not check" in page
    assert "record_identity_invalid:" in page


def test_the_page_shows_the_result_it_is_given_not_one_it_computes(tmp_path):
    """The result is the verifier's: a status changed after the check shows
    as changed, on a bundle that itself checks. If the page re-checked the
    bundle it would still say VALID."""
    bundle = whole_log_bundle(tmp_path)
    check = check_evidence_file(bundle)
    assert check.verdict == "VALID"
    altered = dataclasses.replace(
        check,
        checks=[Check(c.name, "fail", ("altered",)) if c.name == "graph_closure" else c for c in check.checks],
    )
    page = render_report_html(bundle, altered)
    assert _verdict_class(page) == "fail" and "altered" in page
    assert _verdict_class(render_report_html(bundle, check)) == "withheld"


@pytest.mark.parametrize(
    "status, words",
    [("pass", "witness.example: verified"), ("withheld", "witness.example: not checked (no key known)"),
     ("fail", "witness.example: <strong>does not verify</strong>")],
)
def test_the_witness_line_is_each_receipt_as_the_verifier_judged_it(tmp_path, status, words):
    """Render only: a receipt result in the shape check_evidence_file reports
    it (``witness_receipts``), on a bundle whose checkpoint verified."""
    bundle = whole_log_bundle(tmp_path)
    check = dataclasses.replace(
        check_evidence_file(bundle),
        witness=Check("witnesses", status),
        witness_receipts=[{"ts_url": "https://witness.example", "binding": "cll", "status": status, "reason": "r"}],
    )
    assert words in render_report_html(bundle, check)


@pytest.mark.parametrize(
    "witness, banner, headline",
    [("pass", "pass", "Everything this file claims checks"), ("withheld", "withheld", NOT_WITNESSED),
     (None, "withheld", WITNESS_UNREPORTED)],
)
def test_a_file_that_checks_reads_as_checking_in_full_only_when_witnessed(tmp_path, witness, banner, headline):
    """evidencebook#209: a page never says checked of a chain that only
    self-verifies. Every check passes in each case; only the witness result
    differs: a receipt the verifier checked, none, or a result from before
    witness checks (no ``witnesses`` at all)."""
    bundle = whole_log_bundle(tmp_path)
    check = dataclasses.replace(
        check_evidence_file(bundle), witness=None if witness is None else Check("witnesses", witness)
    )
    assert check.verdict == "VALID"
    page = render_report_html(bundle, check)
    assert _verdict_class(page) == banner
    assert html.escape(headline) in page
    if witness != "pass":
        assert "Everything this file claims checks" not in page


def test_a_result_for_another_bundle_is_refused(exported):
    _, bundle = exported
    check = check_evidence_file(bundle)
    with pytest.raises(BundleMismatch):
        render_report_html(_tamper(bundle), check)


def test_a_result_naming_no_digest_is_refused(exported):
    _, bundle = exported
    check = dataclasses.replace(check_evidence_file(bundle), bundle_digest=None)
    with pytest.raises(BundleMismatch):
        render_report_html(bundle, check)


def test_a_not_a_bundle_result_is_not_drawn_over_a_real_bundle(exported):
    """A result whose kind flag was flipped still carries the real file's
    digest and records: it is refused, not drawn under a fail headline."""
    _, bundle = exported
    flipped = dataclasses.replace(check_evidence_file(bundle), kind_ok=False)
    with pytest.raises(BundleMismatch):
        render_report_html(bundle, flipped)


def _with_float(bundle: dict) -> dict:
    """A file the verifier checks but gives no digest (a float is outside JCS)."""
    edited = json.loads(json.dumps(bundle))
    edited["extensions"] = {"x-example": 1.5}
    return edited


def test_a_file_with_no_digest_renders_as_capsule_emit_renders_it(exported, tmp_path, capsys):
    bundle = _with_float(exported[1])
    check, page = check_and_render(bundle)
    assert check.bundle_digest is None and check.kind_ok
    with pytest.raises(BundleMismatch):  # handed in from outside, it cannot be bound
        render_report_html(bundle, check)
    path = tmp_path / "float.json"
    path.write_text(json.dumps(bundle))
    out = tmp_path / "float.html"
    assert main([str(path), "-o", str(out)]) == {"VALID": 0, "INCOMPLETE": 2, "INVALID": 1}[check.verdict]
    assert out.read_text(encoding="utf-8") == check_and_render(bundle, source="float.json")[1]
    assert _verdict_class(page) == banner_class(check)


def test_a_file_that_is_not_an_evidence_bundle_renders_as_a_failure():
    check, page = check_and_render({"bundle_kind": "something-else"})
    assert not check.kind_ok and check.verdict == "INVALID"
    assert _verdict_class(page) == "fail" and "not an evidence file" in page


def test_without_a_signed_checkpoint_the_page_never_claims_a_log(tmp_path):
    check, page = check_and_render(whole_log_bundle(tmp_path, cose=False))
    assert check.verdict == "INCOMPLETE"
    assert "no signed checkpoint" in page and "signed the checkpoint" not in page
    assert "That these records are in any committed log" in page
    assert "<dt>Log</dt>" not in page


def test_the_page_is_offline_and_escapes_what_it_shows(exported):
    _, bundle = exported
    hostile = '<img src=x onerror="alert(1)">.json'
    _, page = check_and_render(bundle, source=hostile)
    assert hostile not in page and "&lt;img src=x" in page
    for token in FORBIDDEN:
        assert token not in page, token
    _, plain_page = check_and_render(bundle, source="bundle.json")
    assert not re.search(r"(src|href)=|https?://", plain_page)


def test_the_cli_writes_the_page_and_exits_with_the_verifiers_verdict(exported, tmp_path, capsys):
    path, _ = exported
    out = tmp_path / "report.html"
    assert main([str(path), "-o", str(out)]) == 0  # VALID, as capsule-emit exits
    assert "report: VALID" in capsys.readouterr().out
    assert _verdict_class(out.read_text(encoding="utf-8")) == "withheld"  # the page's reading, not the exit code
    tampered = tmp_path / "tampered.json"
    tampered.write_text(json.dumps(_tamper(json.loads(path.read_text()))))
    assert main([str(tampered), "-o", str(out)]) == 1
    assert main([str(tmp_path / "absent.json")]) == 1


def test_this_module_runs_no_check_of_its_own():
    """The only verifier this module calls is capsule-emit's."""
    source = importlib.util.find_spec("capsule_viewer.evidence_report").origin
    text = open(source, encoding="utf-8").read()
    for name in ("verify_bundle", "verify_capsule_signature", "checkpoint_from_cose", "inclusion_proof", "hashlib"):
        assert name not in text, name
    assert evidence_report.RERUN_COMMAND == "capsule-emit verify --bundle"
