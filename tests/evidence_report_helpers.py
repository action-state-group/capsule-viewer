# SPDX-License-Identifier: Apache-2.0
"""Evidence files for the evidence report tests, produced by the donated
libraries only (capsule-emit, checkpointed-local-log); nothing here checks one.

* :func:`exported_bundle`: a node ledger (three sealed records and a checkpoint
  signed by the node key) written out by ``capsule-emit bundle --all``, the way
  a producer hands a third party an evidence file.
* :func:`whole_log_bundle`: a bundle over a whole three-record log with its
  completeness certificate, built as capsule-emit's own ``test_evidence_file``
  builds one; the verifier finds it VALID.
"""
from __future__ import annotations

import base64
import dataclasses
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from types import SimpleNamespace

from capsule_emit import LocalKeypairSigner, seal
from capsule_emit.cli import main as capsule_emit_main
from capsule_emit.evidence_file import Check, EvidenceFileCheck, RecordCheck
from capsule_emit.ledger import read_ledger
from cll.checkpoint import (
    CheckpointRecord,
    MemoryNodeStore,
    MmrLedger,
    add_leaf,
    checkpoint_to_cose,
    core,
    emit_checkpoint,
    leaf_hash,
    peaks,
    root_from_peaks,
)


class _Log:
    def __init__(self) -> None:
        self.n = 0

    def append(self, capsule: dict, *, consequential: bool = True):  # noqa: ARG002
        self.n += 1
        return SimpleNamespace(seq=self.n, capsule_id=capsule["capsule_id"])

    def scan(self, *a, **k):  # noqa: ARG002
        return []


class _CheckpointSigner:
    """The checkpoint layer's signer over the node's own key."""

    def __init__(self, inner: LocalKeypairSigner) -> None:
        self._inner = inner
        self.key_id = inner.key_id

    def sign(self, digest_hex: str) -> str:
        return self._inner.sign(digest_hex.encode("ascii"))[0]


def exported_bundle(tmp_path: Path) -> tuple[Path, dict]:
    """``(path, bundle)`` of the evidence file ``capsule-emit bundle --all`` writes."""
    key = tmp_path / "node-key.pem"
    signer = LocalKeypairSigner(key)
    flat = tmp_path / "flat.jsonl"
    for action in ("lookup_order", "issue_refund", "notify_customer"):
        seal(None, action=action, operator="example-org", anchor=False, witness=False, signer=signer, ledger=flat)
    capsules = read_ledger(flat)
    mmr = MmrLedger(_Log())
    for capsule in capsules:
        mmr.append({"capsule_id": capsule["capsule_id"]})
    cp = emit_checkpoint(mmr, _CheckpointSigner(signer), log_id="example-org/node-1")
    ledger = tmp_path / "ledger"
    ledger.mkdir()
    (ledger / "capsules.jsonl").write_text("".join(json.dumps(c) + "\n" for c in capsules))
    (ledger / "checkpoints.jsonl").write_text(json.dumps(dataclasses.asdict(cp)) + "\n")
    out = tmp_path / "bundle.json"
    code = capsule_emit_main(["bundle", "--all", "--signing-key", str(key), "-o", str(out), str(ledger)])
    assert code == 0, "capsule-emit bundle did not write the evidence file"
    return out, json.loads(out.read_text(encoding="utf-8"))


def _proof(p) -> dict:
    return {
        "v": p.v,
        "kind": p.kind,
        "size": p.size,
        "leaf_index": p.leaf_index,
        "witness": list(p.witness),
        "peaks_left": list(p.peaks_left),
        "peaks_right": list(p.peaks_right),
    }


def whole_log_bundle(tmp_path: Path, *, n: int = 3, cose: bool = True) -> dict:
    """A bundle over a whole ``n``-record log; ``cose=False`` leaves the
    checkpoint unsigned."""
    signer = LocalKeypairSigner(tmp_path / "k.pem")
    ledger = tmp_path / "whole-log.jsonl"
    caps = [
        seal({"step": i}, anchor=False, witness=False, signer=signer, ledger=ledger).capsule for i in range(n)
    ]
    store = MemoryNodeStore()
    for cap in caps:
        add_leaf(store, leaf_hash(bytes.fromhex(cap["capsule_id"])))
    size = store.size()
    peak_hashes = [store.node(p) for p in peaks(size)]
    root = root_from_peaks(peak_hashes).hex()
    cp = CheckpointRecord(
        v=1, kind="mmr_checkpoint", log_id="test-log", mmr_size=size, root=root, prev_size=0,
        prev_root="", key_id=signer.key_id, timestamp="2026-10-01T00:00:00Z", signature="",
    )
    checkpoint = dict(cp.__dict__)
    if cose:
        raw = checkpoint_to_cose(cp, signer, peak_hashes)
        checkpoint["cose"] = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    rp = core.range_proof(store, 0, n - 1, size)
    ids = [c["capsule_id"] for c in caps]
    return {
        "bundle_version": "2",
        "bundle_kind": "evidence-bundle/v2",
        "root": ids[-1],
        "records": caps,
        "completeness": {
            "closure_depth": 0, "records_mode": "complete", "payloads_mode": "selected", "suppressed_fields": [],
        },
        "completeness_certificate": {
            "log_id": "test-log", "range_root": root, "first_seq": 1, "last_seq": n, "body_digests": ids,
            "range_proof": {
                "from_seq": 1, "to_seq": n, "size": rp.size, "from_index": rp.from_index,
                "to_index": rp.to_index, "witness": list(rp.witness),
            },
            "memberships": {
                cid: {
                    "log_coordinates": {"log_id": "test-log", "seq": i + 1, "leaf_index": i},
                    "inclusion_proof": _proof(core.inclusion_proof(store, i, size)),
                }
                for i, cid in enumerate(ids)
            },
        },
        "checkpoint": checkpoint,
    }


class _Tags(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: list[tuple[str, list[tuple[str, str | None]]]] = []

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, attrs))


def no_link_or_script(page: str) -> None:
    """Nothing on the page loads, links or runs: as parsed, no element that
    fetches or runs, no handler or URL attribute, and no URL in the stylesheet
    (caller text may still spell those, escaped, as text)."""
    parser = _Tags()
    parser.feed(page)
    for tag, attrs in parser.tags:
        assert tag not in ("script", "img", "iframe", "a", "link", "object", "embed", "form"), tag
        for name, _ in attrs:
            assert name not in ("src", "href", "action", "srcdoc") and not name.startswith("on"), (tag, name)
    style = page[page.index("<style>") : page.index("</style>")]
    assert not re.search(r"https?://|@import|url\(", style)


def frozen_check(raw: dict) -> EvidenceFileCheck:
    """``check.json`` back into capsule-emit's result type."""
    check = lambda c: Check(c["name"], c["status"], tuple(c["findings"]))  # noqa: E731
    return EvidenceFileCheck(
        **{
            **raw,
            "checks": [check(c) for c in raw["checks"]],
            "records": [RecordCheck(**{**r, "messages": tuple(r["messages"])}) for r in raw["records"]],
            "missing": tuple(raw["missing"]),
            "extensions": tuple(raw["extensions"]),
            "witness": check(raw["witness"]) if raw["witness"] else None,
        }
    )


def banner_class(check: EvidenceFileCheck) -> str:
    """The report banner's class for *check*: the verdict's, except that a
    VALID file with no witness receipt the verifier checked is not shown as
    passing (evidencebook#209)."""
    if check.verdict == "VALID" and (check.witness is None or check.witness.status != "pass"):
        return "withheld"
    return {"VALID": "pass", "INCOMPLETE": "withheld", "INVALID": "fail"}[check.verdict]
