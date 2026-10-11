# SPDX-License-Identifier: Apache-2.0
"""The History Card recompute check (docs/design/history-card.md, section 3),
as test code: no viewer module exists yet.

``recompute_errors(bundle)`` returns every reason the bundle's history
selection does not hold, or ``[]``. It reads the bundle alone. It does not import
the account core; it re-derives the same things with this repo's own JCS
(``capsule_viewer.digest``), so the fixture (built through the core) and this
check are two implementations agreeing on one file.
"""
from __future__ import annotations

import hashlib

from capsule_viewer.digest import jcs

SELECTION_EXTENSION = "x-history-selection/v0"
RECOMPUTED_KEYS = frozenset({"period", "selected_count", "outcome_evidence", "completeness"})
# agent-action-capsule canonical.py: capsule_id and the local-only producer fields leave the preimage.
CAPSULE_ID_EXCLUDED = frozenset({"capsule_id", "signature", "key_id"})


def _digest(value) -> str:
    return hashlib.sha256(jcs(value)).hexdigest()


def bucket(record: dict, agent_input: dict) -> str:
    """One bucket per record, the first rule that applies (section 2)."""
    body = agent_input.get("body") or {}
    if "outcome" in body:
        return f"outcome:{body['outcome']}"
    if body.get("action_class") == "money.refund":
        return "action_class:money.refund"
    status = (record.get("effect") or {}).get("status")
    if status:
        return f"effect.status:{status}"
    return "none"


def derive(records: list[dict], disclosures: dict) -> dict:
    breakdown: dict[str, int] = {}
    for r in records:
        b = bucket(r, disclosures[r["capsule_id"]]["agent_input"])
        breakdown[b] = breakdown.get(b, 0) + 1
    times = sorted(r["timestamp"] for r in records)
    return {
        "period": {"from": times[0], "to": times[-1], "temporal_provenance": "producer_asserted"},
        "selected_count": len(records),
        "outcome_evidence": dict(sorted(breakdown.items())),
        "completeness": "not_asserted",
    }


def recompute_errors(bundle: dict) -> list[str]:
    ext = (bundle.get("extensions") or {}).get(SELECTION_EXTENSION)
    if not isinstance(ext, dict):
        return [f"no {SELECTION_EXTENSION} block"]
    errors: list[str] = []
    definition, account = ext.get("definition") or {}, ext.get("account") or {}
    derivation, selection = account.get("derivation") or {}, account.get("selection") or {}
    asserted = account.get("asserted_result") or {}

    # The definition binds: the account cites this document's digest, and its class.
    if derivation.get("definition_digest") != _digest(definition):
        errors.append("definition_digest does not match the definition document")
    if derivation.get("derivation_class") != "deterministic" or definition.get("derivation_class") != "deterministic":
        errors.append("a history card's counts are deterministic; nothing else is recomputed")
    if selection.get("kind") != "explicit_set" or definition.get("selection_kind") != "explicit_set":
        errors.append("a holder-directed selection is an explicit_set")

    # completeness is never asserted, and nothing un-recomputable sits beside the counts.
    if asserted.get("completeness") != "not_asserted":
        errors.append(f"completeness must be not_asserted, is {asserted.get('completeness')!r}")
    extra = set(asserted) - RECOMPUTED_KEYS
    if extra:
        errors.append(f"asserted_result carries values nothing recomputes: {sorted(extra)} (label them holder_asserted)")
    for key, entry in (ext.get("holder_asserted") or {}).items():
        if not isinstance(entry, dict) or entry.get("label") != "holder_asserted":
            errors.append(f"holder_asserted.{key} is not labelled holder_asserted")

    # Every reference resolves to exactly one disclosed record, and nothing else is in the bundle.
    refs = list((selection.get("input_identity") or {}).get("references") or [])
    if not refs:
        errors.append("the selection names no records")
    if len(set(refs)) != len(refs):
        errors.append("the selection names a record twice")
    records = bundle.get("records") or []
    disclosures = bundle.get("disclosures") or {}
    by_id: dict[str, dict] = {}
    for r in records:
        cid = r.get("capsule_id")
        if cid != _digest({k: v for k, v in r.items() if k not in CAPSULE_ID_EXCLUDED}):
            errors.append(f"record {cid} does not recompute to its capsule_id")
        by_id[cid] = r
    missing = [ref for ref in refs if ref not in by_id]
    if missing:
        errors.append(f"selected but not disclosed: {missing}")
    unselected = sorted(set(by_id) - set(refs))
    if unselected:
        errors.append(f"in the bundle but not selected: {unselected}")
    for ref in refs:
        if ref not in by_id:
            continue
        disclosed = (disclosures.get(ref) or {}).get("agent_input")
        bound = ((by_id[ref].get("model_attestation") or {}).get("compute_attestation") or {}).get("agent_input_digest")
        if disclosed is None:
            errors.append(f"record {ref} has no disclosed agent_input")
        elif _digest(disclosed) != bound:
            errors.append(f"record {ref}: disclosed agent_input does not match its agent_input_digest")
    if errors:
        return errors

    # Recompute from the disclosed records and match.
    recomputed = derive([by_id[ref] for ref in refs], disclosures)
    for key in sorted(RECOMPUTED_KEYS):
        if recomputed[key] != asserted.get(key):
            errors.append(f"{key}: recomputed {recomputed[key]!r} != asserted {asserted.get(key)!r}")
    return errors
