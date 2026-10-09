# SPDX-License-Identifier: Apache-2.0
"""A synthetic rules bundle, in the ``evidence-bundle/v2`` shape, and the
verifier result that goes with it. Example values only: example pack, example
platform, made-up digests.

The root record's ``agent_input`` names the record kind as its
``spec_version`` (the profile the module's manifest requires) and its
``agent_output`` is the ``RulesComparison/v0``. A second record carries a
legacy ``report/v1`` row set, so the fixture is also the "both" case: the
page renders from the comparison and shows the legacy rows only under L2.

This module states a verifier's result; it does not compute one. The tests
that use it test the presentation, not verification.
"""
from __future__ import annotations

from ..context import Json, VerifiedBundleContext, build_context
from ..kit.components import Check, VerificationResult


def _hex(seed: str) -> str:
    return (seed * 64)[:64]


# The example record kind: the root's spec_version, and the record_kind a
# deployer passes to render it.
RECORD_KIND = "org.example.rules-comparison/v0"
ROOT = _hex("a1b2c3d4")
LEGACY = _hex("e5f60718")
PACK_DIGEST = _hex("0f1e2d3c")
ENVELOPE = _hex("4b5a6978")
RULE_WITHOUT_WORDS = "r27-example-rule-identifier-the-wording-pack-does-not-cover-at-all"


def _row(rule_id: str, disposition: str, mechanism: str, status: str, basis: str, refs: list[str]) -> dict[str, Json]:
    return {
        "rule_id": rule_id,
        "platform_baseline": {"status": status, "assurance": basis, "capability_refs": refs},
        "action_state": {"disposition": disposition, "assurance": mechanism},
    }


def comparison() -> dict[str, Json]:
    return {
        "schema": "RulesComparison/v0",
        "pack": {"pack_id": "example/everyday/0.1.0", "definition_digest": PACK_DIGEST},
        "platform": {"id": "example-assistant", "display_name": "Example Assistant"},
        "baseline_envelope_sha256": ENVELOPE,
        "rows": [
            _row("r01-example-research", "DO", "ENFORCED", "unknown", "unknown", []),
            _row("r02-example-ordinary-purchase", "DO", "ENFORCED", "model_judgment_only", "model_instruction", ["money.purchase"]),
            _row("r05-example-spending-limit", "ASK", "ENFORCED", "native_approval_required", "platform_self_report", ["money.purchase"]),
            _row("r06-example-new-payee", "ASK", "ASKED", "partly_protected", "documented_by_platform", ["money.transfer", "money.purchase"]),
            _row("r09-example-subscription", "ASK", "ENFORCED", "none_established", "directly_observed", ["money.subscription"]),
            _row("r12-example-share-personal-details", "ASK", "ASKED", "mechanically_enforced", "visible_in_settings", ["disclosure.personal"]),
            _row("r20-example-delete-data", "NEVER", "ENFORCED", "not_currently_available", "inferred", ["data.delete"]),
            _row(RULE_WITHOUT_WORDS, "NEVER", "UNKNOWN", "unknown", "unknown", ["communication.send"]),
        ],
    }


def _record(capsule_id: str, action_id: str) -> dict[str, Json]:
    return {
        "action_id": action_id,
        "action_type": "fyi",
        "capsule_id": capsule_id,
        "operator": "example-operator",
        "timestamp": "2026-10-09T00:00:00Z",
    }


def bundle(unrecognized: str = "", legacy: bool = True) -> dict[str, Json]:
    """The fixture bundle. *unrecognized*, when given, replaces one rule's
    platform status with a value no wording pack knows; ``legacy=False`` leaves
    out the legacy ``report/v1`` record (the comparison alone)."""
    if not legacy:
        raw = bundle(unrecognized)
        raw["records"] = [r for r in raw["records"] if r["capsule_id"] != LEGACY]
        del raw["disclosures"][LEGACY]
        del raw["completeness_certificate"]["memberships"][LEGACY]
        return raw
    rules = comparison()
    if unrecognized:
        rules["rows"][1]["platform_baseline"]["status"] = unrecognized
    return {
        "bundle_kind": "evidence-bundle/v2",
        "root": ROOT,
        "records": [_record(LEGACY, "rules-report-example"), _record(ROOT, "rules-compare-example")],
        "disclosures": {
            ROOT: {
                "agent_input": {
                    "spec_version": RECORD_KIND,
                    "pack_id": "example/everyday/0.1.0",
                    "pack_definition_digest": PACK_DIGEST,
                    "envelope_sha256": ENVELOPE,
                },
                "agent_output": rules,
            },
            LEGACY: {
                "agent_input": {
                    "spec_version": "report/v1",
                    "title": "Example rules report",
                    "rows": [
                        {"row_id": "r05-example-spending-limit", "label": "Purchases over the example limit", "status": "asks first"},
                        {"row_id": "r20-example-delete-data", "label": "Deleting data", "status": "never", "reason": "example reason text"},
                    ],
                },
            },
        },
        "completeness_certificate": {
            "log_id": "example-log",
            "memberships": {
                ROOT: {"log_coordinates": {"log_id": "example-log", "seq": 2, "leaf_index": 1}},
                LEGACY: {"log_coordinates": {"log_id": "example-log", "seq": 1, "leaf_index": 0}},
            },
        },
        "extensions": {"presentation/v1": {"title": "Example title", "producer_display_name": "Example producer"}},
    }


VERIFIED = VerificationResult(
    "the example bundle verifier",
    "verified",
    (
        Check("graph closure", "verified"),
        Check("interval coverage", "verified"),
        Check("per-record membership", "verified"),
    ),
)
FAILED = VerificationResult(
    "the example bundle verifier",
    "failed",
    (Check("record identity " + ROOT, "failed", "recomputed digest differs"),),
)

STATUS = {
    ROOT: {"agent_input": "disclosure_match", "agent_output": "disclosure_match"},
    LEGACY: {"agent_input": "disclosure_match", "agent_output": "withheld"},
}


def fixture_context(raw: dict[str, Json] | None = None, verification: VerificationResult = VERIFIED) -> VerifiedBundleContext:
    return build_context(bundle() if raw is None else raw, verification, STATUS)
