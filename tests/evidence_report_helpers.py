# SPDX-License-Identifier: Apache-2.0
"""Evidence files for the evidence report and Ledger tests, produced by the
donated libraries only (capsule-emit, agent-action-capsule,
checkpointed-local-log); nothing here checks one.

Records are built and signed in memory with ``capsule_emit.produce``; no
ledger is written.

* :func:`signed_record`: one record and its Producer Envelope, the envelope
  inlined as the record's ``signature`` and ``key_id``, as a bundle carries it.
* :func:`ledger_records`: a grant, a write under it that passed its gate, and
  one refused, the records the Ledger page tests draw.
* :func:`exported_bundle`: three records in capsule-emit's artifact store and
  a CLL log checkpointed by the node key, proven by agent-action-capsule's
  ``build_evidence_bundle``, the way a producer hands a third party an
  evidence file.
* :func:`whole_log_bundle`: a bundle over a whole three-record log with its
  completeness certificate, built as capsule-emit's own ``test_evidence_file``
  builds one; the verifier finds it VALID.
"""
from __future__ import annotations

import base64
import dataclasses
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

from agent_action_capsule import compute_capsule_id
from agent_action_capsule.bundle import build_evidence_bundle, proof_source_from_cll
from agent_action_capsule.canonical import jcs
from capsule_emit import LocalKeypairSigner
from capsule_emit.artifact import Record
from capsule_emit.artifact.memory import MemoryArtifactStore
from capsule_emit.evidence_file import Check, EvidenceFileCheck, RecordCheck
from capsule_emit.produce import (
    Chain,
    ComputeAttestation,
    Disposition,
    Effect,
    Input,
    SigningIdentity,
    build,
    digest_json,
    new_ed25519_signing_identity,
    sign,
)
from capsule_emit.produce.model import BuiltPayload
from cll.checkpoint import (
    CheckpointRecord,
    MemoryNodeStore,
    add_leaf,
    checkpoint_to_cose,
    core,
    leaf_hash,
    peaks,
    root_from_peaks,
)
from cll.log import AppendInput, CheckpointState, CllState
from cll.log.memory import MemoryStore
from cryptography.hazmat.primitives.serialization import load_pem_private_key

TIMESTAMP = "2026-10-01T00:00:00Z"
CHECKS = [{"name": "AmountUnderCap", "passed": True, "reason": None}]
OVER_CAP = [{"name": "AmountUnderCap", "passed": False, "reason": "over cap"}]


def node_key(path: Path) -> tuple[LocalKeypairSigner, SigningIdentity]:
    """One Ed25519 key as both signers: capsule-emit's, which signs a
    checkpoint, and the produce identity that signs Producer Envelopes."""
    signer = LocalKeypairSigner(path)  # writes the key file when it is missing
    return signer, new_ed25519_signing_identity(load_pem_private_key(path.read_bytes(), password=None))


def _built(capsule: Input, gate_checks: list | None) -> BuiltPayload:
    built = build(capsule)
    if gate_checks is None:
        return built
    # capsule_emit.produce has no member for gate checks; the Ledger module
    # reads them from compute_attestation, where seal()'s extra_compute put
    # them. Add the member and derive the id again before signing.
    value = json.loads(built.json)
    value.setdefault("model_attestation", {}).setdefault("compute_attestation", {})["gate_checks"] = gate_checks
    del value["capsule_id"]
    value["capsule_id"] = compute_capsule_id(value)
    return BuiltPayload(capsule_id=value["capsule_id"], value=value, json=jcs(value))


def signed_pair(identity: SigningIdentity, capsule: Input, *, payload: object = None,
                gate_checks: list | None = None) -> tuple[dict, bytes]:
    """``(capsule, envelope)``: the signature-free Capsule ``produce`` builds
    from ``capsule`` (``payload`` committed as its agent input digest) and
    its Producer Envelope."""
    if payload is not None:
        capsule = dataclasses.replace(capsule, compute=ComputeAttestation(agent_input_digest=digest_json(payload)))
    built = _built(capsule, gate_checks)
    return json.loads(built.json), sign(built, identity)


def signed_record(identity: SigningIdentity, capsule: Input, **kw) -> dict:
    """The record as a bundle carries it: the Capsule with its verified
    Producer Envelope inlined as ``signature`` and ``key_id``, as
    agent-action-capsule's bundle producer inlines a stored one."""
    record, envelope = signed_pair(identity, capsule, **kw)
    return {**record, "signature": envelope.hex(), "key_id": identity.public_key.hex()}


def capsule_input(n: int, action: str, **kw) -> Input:
    return Input(**{"action_id": f"{action}/{n}", "action_type": "fyi", "operator": "example-org",
                    "developer": "agent@v1", "timestamp": f"2026-10-01T00:00:{n:02d}Z", **kw})


def ledger_records(identity: SigningIdentity, *, operator: str = "acme-co", developer: str = "po-agent@v1",
                   reason: str = "over cap", over_cap: list | None = None) -> list[dict]:
    """A grant, a write under it that passed its gate, and one refused
    (``reason`` is the refused gate check's reason, ``over_cap`` replaces
    its gate checks)."""
    executed = {"action_type": "decide",
                "disposition": Disposition(decision="accept", approver="policy", verdict_class="executed")}
    grant = signed_record(identity, capsule_input(0, "grant", operator=operator, **executed,
                          effect=Effect(type="memory_write", status="dispatched", irreversibility_class="two_way",
                                        effect_attestation="runtime_claimed")),
                          payload={"step": 0})
    write = signed_record(identity, capsule_input(1, "write_po", operator=operator, developer=developer, **executed,
                          effect=Effect(type="spend", status="dispatched", irreversibility_class="two_way",
                                        effect_attestation="runtime_claimed"),
                          chain=Chain(parent_capsule_id=grant["capsule_id"], relation="confirms")),
                          payload={"step": 1}, gate_checks=CHECKS)
    refused = signed_record(identity, capsule_input(2, "write_po", action_type="decide", operator=operator, developer="po-agent@v1",
                            disposition=Disposition(decision="denied", approver="policy", verdict_class="blocked"),
                            effect=Effect(type="spend", status="planned", irreversibility_class="two_way")),
                            payload={"step": 2},
                            gate_checks=over_cap or [{"name": "AmountUnderCap", "passed": False, "reason": reason}])
    return [grant, write, refused]


def _checkpointed_log(values: list[bytes], signer: LocalKeypairSigner, log_id: str) -> MemoryStore:
    """A CLL memory log of ``values``, checkpointed at its tip by ``signer``."""
    log = MemoryStore()
    nodes = MemoryNodeStore()
    appended_at = datetime(2026, 10, 1, tzinfo=timezone.utc)
    for value in values:
        log.append(AppendInput(value=value, appended_at=appended_at))
        add_leaf(nodes, leaf_hash(value))
    size = nodes.size()
    peak_hashes = [nodes.node(p) for p in peaks(size)]
    cp = CheckpointRecord(
        v=1, kind="mmr_checkpoint", log_id=log_id, mmr_size=size, root=root_from_peaks(peak_hashes).hex(),
        prev_size=0, prev_root="", key_id=signer.key_id, timestamp=TIMESTAMP, signature="",
    )
    cose = checkpoint_to_cose(cp, signer, peak_hashes)
    log.commit_cll(0, None, CllState(
        size=size, nodes=tuple(nodes.node(i) for i in range(size)), indexed_seq=len(values),
        checkpoint=CheckpointState(bytes=cose, size=size, indexed_seq=len(values), peaks=tuple(peak_hashes)),
    ))
    return log


def exported_bundle(tmp_path: Path) -> tuple[Path, dict]:
    """``(path, bundle)``: three records signed by the node key, put into
    capsule-emit's artifact store and appended to a CLL log the node key
    checkpointed, proven from seq 1 to the tip."""
    signer, identity = node_key(tmp_path / "node-key.pem")
    artifacts = MemoryArtifactStore("example-org", [identity.public_key])
    artifacts.init()
    ids = []
    for n, action in enumerate(("lookup_order", "issue_refund", "notify_customer")):
        capsule, envelope = signed_pair(identity, capsule_input(n, action), payload={"step": n})
        artifacts.put(Record(capsule_id=capsule["capsule_id"], capsule=jcs(capsule), producer_envelope=envelope))
        ids.append(capsule["capsule_id"])
    log = _checkpointed_log([bytes.fromhex(i) for i in ids], signer, "example-org/node-1")
    bundle = build_evidence_bundle(proof_source_from_cll(log, artifacts), root=ids[-1], interval_from=1)
    out = tmp_path / "bundle.json"
    out.write_text(json.dumps(bundle), encoding="utf-8")
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
    signer, identity = node_key(tmp_path / "k.pem")
    caps = [signed_record(identity, capsule_input(i, "step"), payload={"step": i}) for i in range(n)]
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
