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
  ``failed``: a refusal, never a softer page. The one exception beside a
  producer's selection is a composition whose other member is a signed
  ``policy_declined`` refusal and nothing else failed (``_declined_only``):
  ``incomplete``, so the copy is shown with the declined ask as a limit;
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
# The finding capsulectl gives interval coverage for a selection the producer chose.
SELECTION_NOT_CHECKABLE = "selection_not_checkable"
# The one refusal reason a page reads as a limit, and the finding the check carries for it.
POLICY_DECLINED = "policy_declined"
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
    # capsulectl's reported status of the ``x-deal-v0`` check when the copy's
    # report is the standalone record in ``x-deal-report/v0`` (capsule-cli#294),
    # else None. Only the verifier checks that record's signature.
    report_checked: str | None = None


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


def _extensions(bundle: JsonObject) -> Mapping:
    extensions = bundle.get("extensions")
    return extensions if isinstance(extensions, Mapping) else {}


def _standalone_report_status(output: CapsulectlReport) -> str | None:
    """The status capsulectl reported for the ``x-deal-v0`` extension when it
    names the report as standalone; None when it did not say."""
    for entry in output.get("extensions") or ():
        if isinstance(entry, Mapping) and entry.get("kind") == "x-deal-v0" and entry.get("report") == "standalone":
            status = entry.get("status")
            return status if isinstance(status, str) else None
    return None


def _declined_only(
    bundle: JsonObject,
    output: CapsulectlReport,
    statuses: Mapping[str, tuple[str, str]],
    identity: Mapping[str, object],
    disclosure_status: Mapping[str, Mapping[str, str]],
) -> bool:
    """Whether the bundle's only INCOMPLETE cause is a composed/v1 member that
    is the other party's signed refusal for ``policy_declined``: nothing
    failed, the composition passed, the refusal's signature verified and its
    digest reproduced, and the refusal's reason, read from the bundle (the
    signature covers it), is ``policy_declined``. A declined ask is that
    party's limit on what they share, so the copy beside it is shown; any
    other refusal reason, or any other failure, stays ``failed``."""
    if output.get("verdict") != "INCOMPLETE":
        return False
    if not all(statuses[name][0] == "pass" for name in (*GATE_CLAIMS, "checkpoint", "producer_signatures")):
        return False
    if any(status == "fail" for status, _ in statuses.values()) or not all(v == "passed" for v in identity.values()):
        return False
    if any(s == "disclosure_mismatch" for members in disclosure_status.values() for s in members.values()):
        return False
    block = _composed_block(output)
    if (
        block.get("status") != "pass"
        or _mapping(block.get("composed_digest")).get("matches") is not True
        or _mapping(block.get("composition_closure")).get("status") != "pass"
        or block.get("findings")
    ):
        return False
    members = [_mapping(m) for m in _sequence(block.get("members"))]
    refusals = [m for m in members if m.get("outcome") == "refusal"]
    if len(refusals) != 1 or len(members) != 2 or any(m.get("outcome") not in ("artifact", "refusal") for m in members):
        return False
    refusal = refusals[0]
    if (
        refusal.get("body") != "carried"
        or refusal.get("digest") != "reproduced"
        or refusal.get("reads_as") != "INCOMPLETE"
        or refusal.get("findings")
        or _mapping(refusal.get("refusal_signature")).get("status") != "verified"
    ):
        return False
    declared = _mapping(_mapping(_mapping(bundle.get("extensions")).get("composed/v1")))
    raw = next((_mapping(m) for m in _sequence(declared.get("members")) if _mapping(m).get("id") == refusal.get("id")), {})
    return _mapping(raw.get("refusal")).get("reason") == POLICY_DECLINED


def _mapping(value: object) -> Mapping[str, object]:
    return value if isinstance(value, Mapping) else {}


def _sequence(value: object) -> Sequence[object]:
    return value if isinstance(value, Sequence) and not isinstance(value, str) else ()


def _composed_block(output: CapsulectlReport) -> Mapping[str, object]:
    for entry in _sequence(output.get("extensions")):
        if _mapping(entry).get("kind") == "composed/v1":
            return _mapping(_mapping(entry).get("composed"))
    return {}


def context_from_capsulectl(
    bundle: JsonObject, output: CapsulectlReport
) -> tuple[VerifiedBundleContext, Assurance]:
    """The context for *bundle*, and its assurance, from *output*: what
    ``capsulectl verify --bundle`` printed for that same bundle."""
    if output.get("spec_version") != REPORT_VERSION:
        raise VerifierReportError(f"not a {REPORT_VERSION} report: {output.get('spec_version')!r}")
    return context_from_bundle_report(bundle, output, allow_selection=True)


def context_from_bundle_report(
    bundle: JsonObject, output: CapsulectlReport, *, allow_selection: bool = False
) -> tuple[VerifiedBundleContext, Assurance]:
    """``context_from_capsulectl`` for one bundle's report inside a report
    already read: a composed/v1 member's, which capsulectl prints on the member
    without a ``spec_version`` of its own. The same binding holds: the report's
    ``bundle_digest`` must be the digest of exactly *bundle*. A producer-selected
    bundle passes with the outcome ``incomplete`` only when *allow_selection*,
    which a member of a composition is not given: its page would show it with no
    notice."""
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
    # A producer-selected bundle (capsulectl's `selection_not_checkable`): nothing
    # failed, the records it carries all check, and only the claim that nothing
    # is missing from the log cannot be made. Any other INCOMPLETE stays failed.
    selected = (
        allow_selection
        and not gate
        and "composed/v1" not in _extensions(bundle)
        and output.get("verdict") == "INCOMPLETE"
        and statuses["interval_coverage"] == ("withheld", SELECTION_NOT_CHECKABLE)
        and all(statuses[name][0] == "pass" for name in (*GATE_CLAIMS, "checkpoint", "producer_signatures") if name != "interval_coverage")
        and not any(status == "fail" for status, _ in statuses.values())
        and all(value == "passed" for value in identity.values())
        and not any(s == "disclosure_mismatch" for members in disclosure_status.values() for s in members.values())
    )
    declined = not gate and not selected and allow_selection and _declined_only(bundle, output, statuses, identity, disclosure_status)
    if declined:
        checks = (*checks, Check("declined member", "not_checked", POLICY_DECLINED))
    outcome = "verified" if gate else "incomplete" if selected or declined else "failed"
    verification = VerificationResult(VERIFIER, outcome, checks)
    countersignatures = tuple(
        str(c.get("status")) if isinstance(c, Mapping) else "unknown" for c in output.get("countersignatures") or ()
    )
    try:
        context = build_context(bundle, verification, disclosure_status)
    except ValueError as exc:  # a disclosure status outside the verifier's vocabulary
        raise VerifierReportError(str(exc)) from exc
    return context, Assurance(digest, statuses["witnesses"][0], countersignatures, _standalone_report_status(output))
