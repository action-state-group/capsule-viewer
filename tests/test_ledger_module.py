# SPDX-License-Identifier: Apache-2.0
"""The Ledger module and its page: capsule-emit's ``ledger view --html``, moved
here (its HTML assertions came from capsule-emit's ``test_viewer.py``), under
agent-action-capsule's presentation contract.

Every ledger is sealed by capsule-emit and every result is capsule-emit's
``check_evidence_file`` of the ledger's one evidence file.
"""
from __future__ import annotations

import dataclasses
import importlib.util
import json
import re
from pathlib import Path

import jsonschema
import pytest
from capsule_emit import LocalKeypairSigner, seal
from capsule_emit.evidence_file import check_evidence_file
from capsule_emit.ledger import read_ledger
from evidence_report_helpers import frozen_check, no_link_or_script

from capsule_viewer.evidence_report import BundleMismatch
from capsule_viewer.kit.contract import check_fragment, check_module_renders
from capsule_viewer.ledger import (
    MANIFEST,
    LedgerModule,
    check_and_render,
    context_from_check,
    ledger_bundle,
    ledger_page,
    row,
)
from capsule_viewer.ledger.__main__ import main
from capsule_viewer.registry import AmbiguityError, Registry, co_matchable
from capsule_viewer.shell import FAILED, REFUSAL

AAC = Path(__file__).parent / "testdata" / "aac-presentation"
GOLDENS = Path(__file__).parent / "testdata" / "ledger"
CHECKS = [{"name": "AmountUnderCap", "passed": True, "reason": None}]
OVER_CAP = [{"name": "AmountUnderCap", "passed": False, "reason": "over cap"}, {"name": "VendorKnown", "passed": False, "reason": "unknown vendor"}]


def _seal(ledger: Path, signer: LocalKeypairSigner, n: int, **kw) -> dict:
    return seal({"step": n}, anchor=False, witness=False, signer=signer, ledger=ledger, **kw).capsule


@pytest.fixture
def ledger(tmp_path) -> Path:
    """A grant, a write under it that passed its gate, and one refused."""
    path = tmp_path / "ledger.jsonl"
    signer = LocalKeypairSigner(tmp_path / "k.pem")
    grant = _seal(path, signer, 0, action="grant", operator="acme-co", effect={"type": "memory_write", "status": "dispatched"})
    _seal(path, signer, 1, action="write_po", developer="po-agent@v1", effect={"type": "spend", "status": "dispatched"},
          confirms=grant["capsule_id"], extra_compute={"gate_checks": CHECKS})
    _seal(path, signer, 2, action="write_po", developer="po-agent@v1", verdict="blocked", decision="denied",
          effect={"type": "spend", "status": "planned"}, extra_compute={"gate_checks": OVER_CAP})
    return path


def _outcome(page: str) -> str:
    return re.search(r'data-outcome="([a-z_]+)">', page).group(1)


def _rows(page: str) -> int:
    body = page[page.index("<tbody>") : page.index("</tbody>")] if "<tbody>" in page else ""
    return body.count("<tr>")


# -- the page capsule-emit drew, moved -----------------------------------------


def test_every_record_is_a_row_with_its_id_action_and_actor(ledger):
    records = read_ledger(ledger)
    check, page = check_and_render(records, source="demo.jsonl")
    assert check.verdict == "INCOMPLETE"  # no signed checkpoint: not tied to any log
    assert _outcome(page) == "incomplete"
    assert _rows(page) == 3
    for record in records:
        assert record["capsule_id"][:16] in page
    assert "acme-co (authority-grant)" in page
    assert f"agent [↑ dispatched:{records[0]['capsule_id'][:8]}] (confirmed)" in page
    assert f"confirms→{records[0]['capsule_id'][:8]}…" in page
    assert "spend:applied" in page and "spend:rejected" in page


def test_a_refusal_is_marked_and_counted_and_a_normal_record_is_not(ledger):
    _, page = check_and_render(read_ledger(ledger), source="demo.jsonl")
    assert page.count('data-refusal="true"') == 1 and page.count('data-refusal="false"') == 2
    assert "REFUSED (over-authority)" in page
    assert re.search(r'<dt class="cv-metric__label">Records</dt><dd class="cv-metric__value">3</dd>', page)
    assert re.search(r'<dt class="cv-metric__label">Refusals</dt><dd class="cv-metric__value">1</dd>', page)
    assert "demo.jsonl" in page


def test_gate_checks_show_with_their_reasons(ledger):
    _, page = check_and_render(read_ledger(ledger))
    assert '<span class="cv-muted" data-gate="pass">✓ AmountUnderCap</span>' in page
    assert '<span class="cv-tone--negative" data-gate="fail">✗ VendorKnown (unknown vendor)</span>' in page
    assert "over cap" in page


def test_each_records_identity_and_signature_are_the_verifiers(ledger):
    records = read_ledger(ledger)
    check, page = check_and_render(records)
    for record in records:
        assert f"Record {record['capsule_id']}" in page
    assert page.count("intact; signature authored") == 3
    assert [r.signature for r in check.records] == ["authored"] * 3


def test_a_tampered_record_is_the_refusal_with_no_row(ledger):
    records = read_ledger(ledger)
    records[1]["timestamp"] = "1999-01-01T00:00:00Z"
    check, page = check_and_render(records)
    assert check.verdict == "INVALID" and _outcome(page) == "failed"
    assert REFUSAL in page and _rows(page) == 0 and "REFUSED" not in page
    assert f"Record {records[1]['capsule_id']}" in page and "does not match its id" in page


def test_a_tampered_signature_is_the_refusal(ledger):
    records = read_ledger(ledger)
    sig = records[0]["signature"]
    records[0]["signature"] = sig[:-4] + ("1111" if sig.endswith("0000") else "0000")
    check, page = check_and_render(records)
    assert check.verdict == "INVALID" and REFUSAL in page and _rows(page) == 0
    assert "producer_signature_invalid:" in page and "signature invalid" in page


def test_the_page_is_offline(ledger):
    _, page = check_and_render(read_ledger(ledger))
    csp = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', page).group(1)
    assert "default-src &#x27;none&#x27;" in csp and "connect-src &#x27;none&#x27;" in csp
    assert not re.search(r"\s(src|href)=|<script|https?://|@import|url\(", page)


# -- the cli -------------------------------------------------------------------


def test_the_cli_writes_the_page_and_exits_with_the_verdict(ledger, tmp_path, capsys):
    out = tmp_path / "out.html"
    assert main([str(ledger), "-o", str(out)]) == 2  # INCOMPLETE
    assert "ledger: INCOMPLETE — wrote 3 record(s)" in capsys.readouterr().out
    page = out.read_text(encoding="utf-8")
    assert _rows(page) == 3 and "AmountUnderCap" in page


def test_the_cli_refuses_an_empty_or_missing_ledger(tmp_path, capsys):
    empty = tmp_path / "empty.jsonl"
    empty.write_text("")
    assert main([str(empty), "-o", str(tmp_path / "out.html")]) == 1
    assert main([str(tmp_path / "absent.jsonl")]) == 1
    assert "empty or not found" in capsys.readouterr().err
    assert not (tmp_path / "out.html").exists()


# -- the contract --------------------------------------------------------------


def test_a_result_for_another_ledger_is_refused(ledger, tmp_path):
    records = read_ledger(ledger)
    bundle = ledger_bundle(records)
    other = ledger_bundle(records[:2])
    with pytest.raises(BundleMismatch):
        ledger_page(bundle, check_evidence_file(other))


def test_a_module_failure_leaves_the_verification_as_it_was(ledger, monkeypatch):
    bundle = ledger_bundle(read_ledger(ledger))
    check = check_evidence_file(bundle)
    good = ledger_page(bundle, check)

    def boom(self, model, services):
        raise RuntimeError("module failure")

    monkeypatch.setattr(LedgerModule, "render", boom)
    failed = ledger_page(bundle, check)
    assert FAILED in failed and _rows(failed) == 0
    verification = re.compile(r'<div class="cv-verification" data-cv="verification-details">.*?</ul></div>', re.S)
    assert verification.findall(failed)[-1] == verification.findall(good)[-1]
    assert _outcome(failed) == _outcome(good) == "incomplete"


def test_an_altered_result_shows_as_altered(ledger):
    """The page shows the verifier's result, not one of its own: a VALID-looking
    result is never upgraded, a failed one never softened."""
    bundle = ledger_bundle(read_ledger(ledger))
    check = check_evidence_file(bundle)
    failed = dataclasses.replace(check, checks=[*check.checks[:2], dataclasses.replace(check.checks[2], status="fail")])
    assert REFUSAL in ledger_page(bundle, failed)
    assert _outcome(ledger_page(bundle, check)) == "incomplete"


def test_hostile_record_text_and_ledger_name_are_text(tmp_path):
    path = tmp_path / "l.jsonl"
    signer = LocalKeypairSigner(tmp_path / "k.pem")
    hostile = '<script>alert(1)</script><a href="javascript:alert(1)">x</a>'
    _seal(path, signer, 0, action="write_po", developer=hostile, operator=hostile,
          extra_compute={"gate_checks": [{"name": hostile, "passed": False, "reason": hostile}]})
    _, page = check_and_render(read_ledger(path), source=hostile)
    no_link_or_script(page)
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in page


@pytest.mark.parametrize("outcome, gate", [("verified", True), ("incomplete", True), ("failed", False), ("not_checked", False)])
def test_the_gate_passes_only_a_result_where_nothing_failed(ledger, outcome, gate):
    bundle = ledger_bundle(read_ledger(ledger))
    context = context_from_check(bundle, check_evidence_file(bundle))
    altered = dataclasses.replace(context, verification=dataclasses.replace(context.verification, outcome=outcome))
    assert altered.verified is gate


def test_the_module_conforms_and_its_output_is_on_the_allowlist(ledger):
    bundle = ledger_bundle(read_ledger(ledger))
    context = context_from_check(bundle, check_evidence_file(bundle))
    fragment = check_module_renders(LedgerModule("demo.jsonl"), context)
    assert check_fragment(fragment) == []
    assert 'data-level="L0"' in fragment and 'data-level="L1"' in fragment and 'data-level="L2"' in fragment


def test_an_unverified_context_is_never_rendered(ledger):
    records = read_ledger(ledger)
    records[0]["operator"] = "edited"
    bundle = ledger_bundle(records)
    context = context_from_check(bundle, check_evidence_file(bundle))
    assert not context.verified and LedgerModule().canRender(context) is False
    with pytest.raises(ValueError):
        LedgerModule().buildModel(context)


def test_the_manifest_is_schema_valid_and_the_alternative_to_aacs_floor():
    schema = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
    validator = jsonschema.Draft202012Validator({**schema, "$ref": "#/$defs/PresentationManifest"})
    assert sorted(validator.iter_errors(MANIFEST), key=str) == []
    builtins = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((AAC / "builtin").glob("*.json"))}
    floors = [m for m in builtins.values() if m["fallback"]]
    assert [m["id"] for m in floors] == ["aac.builtin.no-aggregate/v0"]
    registry = Registry()
    registry.register(floors[0], lambda context: True)
    with pytest.raises(AmbiguityError):
        registry.register(MANIFEST, lambda context: True)
    # Never in the specific tier, so it never competes with a specific module.
    assert all(co_matchable(m, MANIFEST) and not m["fallback"] for m in builtins.values() if not m["fallback"])


def test_the_module_never_verifies():
    for name in ("capsule_viewer.ledger.module",):
        text = Path(importlib.util.find_spec(name).origin).read_text(encoding="utf-8")
        for forbidden in ("check_evidence_file", "verify", "hashlib", "bundle_digest", "disclosures"):
            assert forbidden not in text.replace("never verifies", ""), forbidden


@pytest.mark.parametrize(
    "record, actor",
    [
        ({"operator": "acme-co", "effect": {"type": "memory_write"}}, "acme-co (authority-grant)"),
        ({"chain": {"relation": "acted_under_authority", "parent_capsule_id": "aabbccdd1234"}}, "agent [↑ grant:aabbccdd]"),
        ({"chain": {"relation": "memory_delta", "parent_capsule_id": "aabbccdd1234"}}, "agent (memory-delta)"),
        ({"chain": {"relation": "acted_under_authority", "parent_capsule_id": "aabbccdd1234"},
          "effect": {"status": "planned"}, "disposition": {"decision": "denied"}}, "agent [↑ grant:aabbccdd] — REFUSED (over-authority)"),
        ({"developer": "agent@v1"}, "agent@v1"),
        ({}, "agent"),
    ],
)
def test_the_actor_lineage_labels_are_capsule_emits(record, actor):
    """Labels from older ledgers' chain relations too (capsule-emit's
    ``viewer._actor``, which its terminal table keeps)."""
    assert row(record).actor == actor


@pytest.mark.parametrize("case", sorted(p.name for p in GOLDENS.iterdir() if p.is_dir()))
def test_the_page_is_the_frozen_one(case):
    """``testdata/ledger/freeze.py`` wrote these; the JS offline test opens
    them. A change here is a change to the page: rerun it and review the diff."""
    path = GOLDENS / case
    bundle = json.loads((path / "bundle.json").read_text(encoding="utf-8"))
    check = frozen_check(json.loads((path / "check.json").read_text(encoding="utf-8")))
    assert ledger_page(bundle, check, source="ledger.jsonl") == (path / "page.html").read_text(encoding="utf-8")
