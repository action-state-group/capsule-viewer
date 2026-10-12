# SPDX-License-Identifier: Apache-2.0
"""The History Card recompute check (docs/design/history-card.md, section 3).

``recompute_errors(bundle)`` returns every reason the bundle's history
selection does not hold, or ``[]``. It reads the bundle alone, and its deal
records only through ``selected_records``. It does not import
the account core; it re-derives the same things with this repo's own JCS
(``capsule_viewer.digest``), so the fixture (built through the core) and this
check are two implementations agreeing on one file. The page runs the same
check in ``static/history_card.js`` (``recomputeErrors``), a third.
"""
from __future__ import annotations

import hashlib
from collections.abc import Mapping

from ..digest import jcs

SELECTION_EXTENSION = "x-history-selection/v0"
RECOMPUTED_KEYS = frozenset({"period", "selected_count", "outcome_evidence", "completeness"})
# agent-action-capsule canonical.py: capsule_id and the local-only producer fields leave the preimage.
CAPSULE_ID_EXCLUDED = frozenset({"capsule_id", "signature", "key_id"})


def _digest(value) -> str:
    return hashlib.sha256(jcs(value)).hexdigest()


def selection_block(bundle: Mapping) -> object:
    """The ``x-history-selection/v0`` block of *bundle*, as carried (``None`` when absent)."""
    extensions = bundle.get("extensions") if isinstance(bundle, Mapping) else None
    return extensions.get(SELECTION_EXTENSION) if isinstance(extensions, Mapping) else None


def selected_records(bundle: Mapping) -> list[dict]:
    """Every deal record the nested per-deal bundles carry, each with its own
    bundle's disclosed ``agent_input`` (``None`` when none is disclosed):
    ``{"deal", "record", "agent_input"}``. The members are the selection
    block's ``deals`` (``{deal id: evidence-bundle/v2}``, one per picked deal,
    nested the way ``x-deal-sale/v0`` nests a sale's threads), in deal id order,
    each member's records in its own order.

    This is the one place a deal record is read from the input. Selection,
    recompute and drawing take only what it returns, so a different bundle
    shape changes this function and its twin in ``static/history_card.js``
    (``selectedRecords``), and nothing else."""
    block = selection_block(bundle)
    deals = block.get("deals") if isinstance(block, Mapping) else None
    out = []
    for deal in sorted(deals) if isinstance(deals, Mapping) else []:
        member = deals[deal] if isinstance(deals[deal], Mapping) else {}
        records = member.get("records")
        disclosures = member.get("disclosures") if isinstance(member.get("disclosures"), Mapping) else {}
        for r in records if isinstance(records, list) else []:
            if not isinstance(r, Mapping):
                continue
            entry = disclosures.get(r.get("capsule_id"))
            agent_input = entry.get("agent_input") if isinstance(entry, Mapping) else None
            out.append({"deal": deal, "record": r, "agent_input": agent_input})
    return out


def bucket(record: Mapping, agent_input: Mapping | None) -> str:
    """One bucket per record, the first rule that applies (section 2)."""
    body = (agent_input or {}).get("body") or {}
    if "outcome" in body:
        return f"outcome:{body['outcome']}"
    if body.get("action_class") == "money.refund":
        return "action_class:money.refund"
    status = (record.get("effect") or {}).get("status")
    if status:
        return f"effect.status:{status}"
    return "none"


def derive(selected: list[dict]) -> dict:
    """The four values, from ``selected_records`` entries."""
    breakdown: dict[str, int] = {}
    for s in selected:
        b = bucket(s["record"], s["agent_input"])
        breakdown[b] = breakdown.get(b, 0) + 1
    times = sorted(s["record"]["timestamp"] for s in selected)
    return {
        "period": {"from": times[0], "to": times[-1], "temporal_provenance": "producer_asserted"},
        "selected_count": len(selected),
        "outcome_evidence": dict(sorted(breakdown.items())),
        "completeness": "not_asserted",
    }


def recompute_errors(bundle: Mapping) -> list[str]:
    """``check`` over *bundle*'s selection block and ``selected_records``."""
    return check(selection_block(bundle), selected_records(bundle))


def check(ext: object, selected: list[dict]) -> list[str]:
    """Every reason the selection *ext* does not hold over *selected* (the
    output of ``selected_records``), or ``[]``."""
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
    by_id: dict[str, dict] = {}
    for s in selected:
        r = s["record"]
        cid = r.get("capsule_id")
        if cid != _digest({k: v for k, v in r.items() if k not in CAPSULE_ID_EXCLUDED}):
            errors.append(f"record {cid} does not recompute to its capsule_id")
        if cid in by_id:
            errors.append(f"record {cid} is carried twice")
        by_id[cid] = s
    missing = [ref for ref in refs if ref not in by_id]
    if missing:
        errors.append(f"selected but not disclosed: {missing}")
    unselected = sorted(set(by_id) - set(refs))
    if unselected:
        errors.append(f"in the bundle but not selected: {unselected}")
    for ref in refs:
        if ref not in by_id:
            continue
        disclosed = by_id[ref]["agent_input"]
        bound = ((by_id[ref]["record"].get("model_attestation") or {}).get("compute_attestation") or {}).get("agent_input_digest")
        if disclosed is None:
            errors.append(f"record {ref} has no disclosed agent_input")
        elif _digest(disclosed) != bound:
            errors.append(f"record {ref}: disclosed agent_input does not match its agent_input_digest")
    if errors:
        return errors

    # Recompute from the disclosed records and match.
    recomputed = derive([by_id[ref] for ref in refs])
    for key in sorted(RECOMPUTED_KEYS):
        if recomputed[key] != asserted.get(key):
            errors.append(f"{key}: recomputed {recomputed[key]!r} != asserted {asserted.get(key)!r}")
    return errors
