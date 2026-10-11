# SPDX-License-Identifier: Apache-2.0
"""Build the History Card design fixture, tests/testdata/history/selection.bundle.json.

    PYTHONPATH=CAPSULE_EMIT/python:AGENT_ACTION_CAPSULE/python \
        python3 examples/history/build_fixture.py

The account object comes from the merged account core (``capsule_emit.account``):
the definition document, its ``definition_digest``, ``build_account`` for an
``explicit_set`` selection, and ``verify_account`` (recompute+match) run once
here before anything is written. Record ids come from agent-action-capsule's
``compute_capsule_id`` and each disclosure's digest from its ``json_digest``.

Every value is synthetic: deal ids, amounts, counterparty fingerprints, key ids
and times are made up. The record SHAPES follow the x-deal-v0 history entries
capsulectl writes (v0.1.0-rc14 and capsule-cli main): a decided purchase, a
noted booking (both the x-deal-v0 form and the typed ``action-record/v0``
form), a noted refund that reverses an earlier act, and an outcome record.
The records carry no signature: this fixture pins selection and recompute, not
signing.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from agent_action_capsule.canonical import compute_capsule_id, json_digest
from capsule_emit.account import (
    Coverage,
    Selection,
    build_account,
    parse_definition,
    verify_account,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "testdata" / "history" / "selection.bundle.json"

SELECTION_EXTENSION = "x-history-selection/v0"

DEFINITION = {
    "name": "capsuleviewer.history.outcome_evidence/0",
    "selection_kind": "explicit_set",
    "reads": [
        "timestamp",
        "effect.status",
        "agent_input.body.outcome",
        "agent_input.body.action_class",
    ],
    "derivation_class": "deterministic",
}


def _fake(label: str) -> str:
    """A synthetic 64-hex value, stable across rebuilds."""
    return hashlib.sha256(f"history-card-fixture:{label}".encode()).hexdigest()


def _ref(label: str, rel: str | None = None, typ: str = "deal-record") -> dict:
    out = {"digest": _fake(label), "digest_alg": "SHA-256", "type": typ}
    if rel:
        out["rel"] = rel
    return out


PRODUCER = {"commit": _fake("producer-commit")[:40], "name": "capsulectl", "version": "v0.1.0-example"}
KEY_ID = _fake("holder-key")


def _xdeal(deal: str, seq: int, at: str, record_type: str, **extra) -> dict:
    x = {
        "at": at,
        "baseline_ref": _ref(f"{deal}/baseline"),
        "canonicalization": "jcs",
        "commit_alg": "sha256-jcs-nonce256",
        "deal_id": deal,
        "prev": _ref(f"{deal}/{seq - 1}"),
        "producer": PRODUCER,
        "profile": "x-deal-v0",
        "record_type": record_type,
        "seq": seq,
    }
    x.update(extra)
    return x


def _payee(name: str) -> dict:
    return {"fp_alg": "hmac-sha256-deal-key", "ids": {"payee": _fake(f"payee/{name}")}}


def purchase(deal: str, at: str, amount: int, payee: str) -> tuple[dict, dict]:
    body = {
        "action": "pay",
        "action_class": "money.purchase",
        "amount_minor": amount,
        "currency": "USD",
        "direction": "out",
        "rail": "card",
        "reference_commitment": _fake(f"{deal}/reference"),
        "spend_minor": amount,
        "taxonomy_version": "6",
    }
    agent_input = {
        "body": body,
        "x-deal-v0": _xdeal(
            deal, 6, at, "action", counterparty=_payee(payee), refs=[_ref(f"{deal}/5", "authorized_by")]
        ),
    }
    header = {
        "action_type": "decide",
        "assurance": {"attestation_mode": "self_attested", "effect_mode": "dispatched_unconfirmed", "ledger_mode": "chained"},
        "disposition": {"approver": "policy", "decision": "accept", "human_disposed": False, "verdict_class": "executed"},
        "effect": {
            "effect_attestation": "runtime_claimed",
            "irreversibility_class": "one_way_recoverable",
            "status": "dispatched",
            "type": "send_payment",
        },
    }
    return header, agent_input


def typed_purchase(deal: str, at: str, amount: int, payee: str) -> tuple[dict, dict]:
    header, _ = purchase(deal, at, amount, payee)
    agent_input = {
        "at": at,
        "body": {
            "action": "pay",
            "action_class": "money.purchase",
            "amount_minor": amount,
            "authority_basis": [{"ref": _ref(f"{deal}/authority", typ="record"), "type": "task_authority"}],
            "counterparty": {"fp_alg": "hmac-sha256-chain-key", "ids": {"payee": _fake(f"payee/{payee}")}},
            "currency": "USD",
            "direction": "out",
            "evaluation_ref": _ref(f"{deal}/5", typ="record"),
            "rail": "card",
            "reference_commitment": _fake(f"{deal}/reference"),
            "spend_minor": amount,
            "taxonomy_version": "6",
        },
        "canonicalization": "jcs",
        "chain_id": deal,
        "chain_root": _ref(f"{deal}/root", typ="record"),
        "commit_alg": "sha256-jcs-nonce256",
        "prev": _ref(f"{deal}/5", typ="record"),
        "producer": PRODUCER,
        "refs": [_ref(f"{deal}/5", "authorized_by", typ="record")],
        "seq": 6,
        "type": "action-record/v0",
    }
    return header, agent_input


def noted(deal: str, at: str, action_class: str, amount: int, payee: str, typed: bool = False, refs=None) -> tuple[dict, dict]:
    body = {
        "action_class": action_class,
        "amount_minor": amount,
        "currency": "USD",
        "direction": "in" if action_class == "money.refund" else "out",
        "rail": "card",
        "taxonomy_version": "6",
    }
    if typed:
        agent_input = {
            "at": at,
            "body": {**body, "counterparty": {"fp_alg": "hmac-sha256-chain-key", "ids": {"payee": _fake(f"payee/{payee}")}}},
            "canonicalization": "jcs",
            "chain_id": deal,
            "chain_root": _ref(f"{deal}/root", typ="record"),
            "commit_alg": "sha256-jcs-nonce256",
            "prev": _ref(f"{deal}/3", typ="record"),
            "producer": PRODUCER,
            "seq": 4,
            "type": "action-record/v0",
        }
    else:
        extra = {"counterparty": _payee(payee)}
        if refs:
            extra["refs"] = refs
        agent_input = {"body": body, "x-deal-v0": _xdeal(deal, 4, at, "action", **extra)}
    header = {
        "action_type": "fyi",
        "assurance": {"attestation_mode": "self_attested", "effect_mode": "not_applicable", "ledger_mode": "chained"},
    }
    return header, agent_input


def outcome(deal: str, at: str, amount: int) -> tuple[dict, dict]:
    agent_input = {
        "body": {
            "differences": [{"question": "asked", "rule": "no_sealed_approval"}],
            "outcome": "mismatch",
            "status": "unchecked_action",
            "unchecked": {
                "action": "pay",
                "amount_minor": amount,
                "currency": "USD",
                "direction": "out",
                "rail": "card",
                "reference_commitment": _fake(f"{deal}/reference"),
            },
        },
        "x-deal-v0": _xdeal(deal, 5, at, "outcome"),
    }
    header = {
        "action_type": "fyi",
        "assurance": {"attestation_mode": "self_attested", "effect_mode": "not_applicable", "ledger_mode": "chained"},
    }
    return header, agent_input


SELECTED = [
    ("deal-example-01", "2026-09-14T10:02:11Z", purchase, (2000, "shop-a")),
    ("deal-example-02", "2026-09-17T18:40:03Z", noted, ("booking.create", 5588, "inn-b")),
    ("deal-example-03", "2026-09-21T09:15:47Z", typed_purchase, (3000, "shop-c")),
    ("deal-example-04", "2026-09-24T12:00:00Z", purchase, (1250, "shop-a")),
    ("deal-example-05", "2026-09-28T16:31:20Z", noted, ("booking.create", 7400, "inn-d", True)),
    ("deal-example-01", "2026-10-01T08:05:59Z", noted, ("money.refund", 2000, "shop-a", False, None)),
    ("deal-example-06", "2026-10-04T21:12:30Z", outcome, (2000,)),
    ("deal-example-07", "2026-10-09T14:44:02Z", purchase, (900, "shop-e")),
]


def build_records() -> tuple[list[dict], dict]:
    records, disclosures = [], {}
    first_purchase_id = None
    for deal, at, make, args in SELECTED:
        if make is noted and args[0] == "money.refund":
            # The refund reverses the earlier purchase in the same deal: cite it.
            args = (*args[:4], [{"digest": first_purchase_id, "digest_alg": "SHA-256", "rel": "reverses", "type": "deal-record"}])
        header, agent_input = make(deal, at, *args)
        seq = (agent_input.get("x-deal-v0") or agent_input)["seq"]
        record = {
            "action_id": f"{deal}/{seq}",
            **header,
            "canonicalization_id": "jcs",
            "chain": {"parent_capsule_id": _fake(f"{deal}/{seq - 1}/capsule"), "relation": "follows"},
            "developer": "capsulectl-deal",
            "format_version": "4",
            "key_id": KEY_ID,
            "model_attestation": {"compute_attestation": {"agent_input_digest": json_digest(agent_input)}},
            "operator": "deal",
            "spec_version": "draft-mih-scitt-agent-action-capsule-05",
            "timestamp": at,
        }
        record["capsule_id"] = compute_capsule_id(record)
        if deal == "deal-example-01" and first_purchase_id is None:
            first_purchase_id = record["capsule_id"]
        records.append(record)
        disclosures[record["capsule_id"]] = {"agent_input": agent_input}
    return records, disclosures


def bucket(record: dict, agent_input: dict) -> str:
    """One bucket per record, first rule that applies (the doc's section 2)."""
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


def main() -> None:
    records, disclosures = build_records()
    definition = parse_definition(DEFINITION)
    selection = Selection(kind="explicit_set", coverage=Coverage(references=tuple(r["capsule_id"] for r in records)))
    account = build_account(definition=definition, selection=selection, asserted_result=derive(records, disclosures))

    by_id = {r["capsule_id"]: r for r in records}

    def recompute(sel: Selection) -> dict:
        chosen = [by_id[ref] for ref in sel.coverage.references]
        return derive(chosen, disclosures)

    result = verify_account(account, definition=definition, recompute=recompute)
    if not result.ok:
        raise SystemExit(f"account core refused the fixture: {result.reason}: {result.detail}")

    bundle = {
        "bundle_kind": "evidence-bundle/v2",
        "bundle_version": "2",
        "extensions": {
            "x-deal-v0": {},
            SELECTION_EXTENSION: {
                "definition": definition.canonical_document(),
                "account": account.to_document(),
                "holder_asserted": {
                    "records_held_in_period": {"value": 23, "label": "holder_asserted"},
                },
            },
        },
        "records": records,
        "disclosures": disclosures,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(records)} records, verify_account ok ({result.method})")
    print(f"definition_digest {definition.definition_digest()}")


if __name__ == "__main__":
    main()
