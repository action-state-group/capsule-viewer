# SPDX-License-Identifier: Apache-2.0
"""A ``VerifiedBundleContext`` from what ``capsulectl verify --bundle`` reported.

Nothing here verifies. capsule-cli's verifier checks the bundle and prints a
``capsule-cli-result/v1`` document; this reads that document and hands
``build_context`` the verifier's own statuses, unchanged. The report's
provenance is the caller's to vouch for (it is what capsulectl printed); what
this checks is that the report names **this exact bundle**: its
``bundle_digest`` must equal the digest of the bundle supplied (``digest``),
so a verdict for one bundle, or for an edited copy of it, is refused.

* the gate: the verdict is ``VALID``; graph closure, interval coverage and
  per-record membership each ``pass``; no claim ``fail``; every record's
  identity ``passed``; no disclosure a mismatch. This is capsulectl's own
  verdict and deal-view.js's gate, and stricter than agent-action-capsule's
  ``bundleVerified`` (which does not read a verdict). Anything else is
  ``failed``: a refusal, never a softer page;
* each bundle claim, as one check, by the verifier's name for it;
* each record's disclosable members, as the verifier resolved them;
* beside the context, the bundle digest the report was bound to and the
  verifier's witness and countersignature results (``Assurance``).
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import TypedDict

from .context import JsonObject, VerifiedBundleContext, build_context
from .digest import NotCanonical, bundle_digest
from .kit.components import Check, VerificationResult

REPORT_VERSION = "capsule-cli-result/v1"
VERIFIER = "capsulectl verify --bundle"
GATE_CLAIMS: tuple[str, ...] = ("graph_closure", "interval_coverage", "per_record_membership")
# Every bundle claim the report carries, in the order the checks list them.
CLAIMS: tuple[str, ...] = (*GATE_CLAIMS, "checkpoint", "producer_signatures", "witnesses")
_OUTCOME = {"pass": "verified", "fail": "failed", "withheld": "not_checked"}


@dataclass(frozen=True)
class Assurance:
    """What the verifier reported beyond the context: the digest of the bundle
    its report is bound to, its witnesses claim status (``pass``, ``withheld``,
    ``fail``, or ``absent`` when no verifier said) and each countersignature
    result's status."""

    bundle_digest: str | None = None
    witnesses: str = "absent"
    countersignatures: tuple[str, ...] = ()


class Claim(TypedDict, total=False):
    status: str
    findings: list[str]


class DisclosureEntry(TypedDict):
    capsule_id: str
    member: str
    status: str


class CapsulectlReport(TypedDict, total=False):
    """The members of a ``capsule-cli-result/v1`` report this reads."""

    spec_version: str
    verdict: str
    bundle_digest: str
    graph_closure: Claim
    interval_coverage: Claim
    per_record_membership: Claim
    checkpoint: Claim
    producer_signatures: Claim
    witnesses: Claim
    record_identity: dict[str, str]
    disclosures: list[DisclosureEntry]
    countersignatures: list[dict[str, str]]


class VerifierReportError(ValueError):
    """A verifier report that cannot be read as one for this bundle."""


def _claim(output: CapsulectlReport, name: str) -> tuple[str, str]:
    claim = output.get(name)
    if not isinstance(claim, Mapping) or not isinstance(claim.get("status"), str):
        raise VerifierReportError(f"the report carries no status for {name}")
    findings = claim.get("findings") or ()
    return claim["status"], ", ".join(str(f) for f in findings)


def _record_ids(bundle: JsonObject) -> set[str]:
    records = bundle.get("records")
    if not isinstance(records, Sequence):
        return set()
    return {r["capsule_id"] for r in records if isinstance(r, Mapping) and isinstance(r.get("capsule_id"), str)}


def context_from_capsulectl(
    bundle: JsonObject, output: CapsulectlReport
) -> tuple[VerifiedBundleContext, Assurance]:
    """The context for *bundle*, and its assurance, from *output*: what
    ``capsulectl verify --bundle`` printed for that same bundle."""
    if output.get("spec_version") != REPORT_VERSION:
        raise VerifierReportError(f"not a {REPORT_VERSION} report: {output.get('spec_version')!r}")
    try:
        digest = bundle_digest(bundle)
    except NotCanonical as exc:
        raise VerifierReportError(f"the bundle has no canonical form: {exc}") from exc
    if output.get("bundle_digest") != digest:
        raise VerifierReportError(f"the report is for bundle {output.get('bundle_digest')!r}, not this one ({digest})")
    identity = output.get("record_identity")
    if not isinstance(identity, Mapping) or set(identity) != _record_ids(bundle):
        raise VerifierReportError("the report's record identities do not name this bundle's records")

    statuses = {name: _claim(output, name) for name in CLAIMS}
    disclosure_status: dict[str, dict[str, str]] = {}
    for entry in output.get("disclosures") or ():
        if not isinstance(entry, Mapping):
            raise VerifierReportError("a disclosure entry is not an object")
        disclosure_status.setdefault(str(entry.get("capsule_id")), {})[str(entry.get("member"))] = str(entry.get("status"))

    gate = (
        output.get("verdict") == "VALID"
        and all(statuses[name][0] == "pass" for name in GATE_CLAIMS)
        and not any(status == "fail" for status, _ in statuses.values())
        and all(value == "passed" for value in identity.values())
        and not any(s == "disclosure_mismatch" for members in disclosure_status.values() for s in members.values())
    )
    checks = tuple(
        Check(name.replace("_", " "), _OUTCOME.get(status, "failed"), findings)
        for name, (status, findings) in statuses.items()
    )
    verification = VerificationResult(VERIFIER, "verified" if gate else "failed", checks)
    countersignatures = tuple(
        str(c.get("status")) if isinstance(c, Mapping) else "unknown" for c in output.get("countersignatures") or ()
    )
    try:
        context = build_context(bundle, verification, disclosure_status)
    except ValueError as exc:  # a disclosure status outside the verifier's vocabulary
        raise VerifierReportError(str(exc)) from exc
    return context, Assurance(digest, statuses["witnesses"][0], countersignatures)
