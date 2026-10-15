# SPDX-License-Identifier: Apache-2.0
"""One offline page over a capsule ledger: the page capsule-emit's
``ledger view --html`` wrote, now under agent-action-capsule's presentation
contract.

The ledger is first made one evidence file (``evidence-bundle/v2``) over all
its records, by capsule-emit's own ``permalink.build_bundle``. capsule-emit's
verifier, ``check_evidence_file``, checks that file; its result becomes the
page's verification (:func:`verification_of`) and the context the module
reads, after :func:`~capsule_viewer.evidence_report.bind_result` has shown the
result is for this very file. The shell (:func:`capsule_viewer.shell.present`)
then draws the banner and the checks and resolves the Ledger module through a
registry; the module fills only the records, and the shell follows them with
the verifier's checks.

So the banner is the verifier's verdict, never the module's: VALID shows as
verified, INCOMPLETE as incomplete (a ledger with no signed checkpoint is not
tied to any log), and INVALID as the contract's refusal, with the checks that
failed and no record shown. A module that throws, or draws nothing, leaves the
banner and checks as they were; one that throws shows that the presentation
failed.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

from ..context import VerifiedBundleContext, build_context
from ..evidence_report import bind_result
from ..kit.components import Check, VerificationResult
from ..registry import Registry
from ..shell import present
from .module import MANIFEST, LedgerModule

if TYPE_CHECKING:
    from capsule_emit.evidence_file import EvidenceFileCheck

VERIFIER = "capsule-emit check_evidence_file"
_VERDICT = {"VALID": "verified", "INCOMPLETE": "incomplete", "INVALID": "failed"}
_STATUS = {"pass": "verified", "withheld": "not_checked", "fail": "failed"}


def verification_of(check: EvidenceFileCheck) -> VerificationResult:
    """capsule-emit's result, read unchanged: its verdict as the outcome; each
    of its checks and its witness-receipt check in their own plain words with
    their findings; what the file carries that nothing checked
    (countersignatures, extension blocks, cited records not in the file); and
    each record's log position, identity and signature as it judged them."""
    checks = [Check(c.plain, _STATUS.get(c.status, "failed"), ", ".join(c.findings)) for c in check.checks]
    if check.witness is not None:
        checks.append(Check(check.witness.plain, _STATUS.get(check.witness.status, "failed"), ", ".join(check.witness.findings)))
    if check.countersignatures:
        checks.append(Check(f"{check.countersignatures} countersignature(s): carried, not verified", "not_checked"))
    if check.extensions:
        checks.append(Check("Extension blocks: carried, not interpreted", "not_checked", ", ".join(check.extensions)))
    if check.missing:
        checks.append(Check(f"{len(check.missing)} cited record(s) not in the file", "not_checked", ", ".join(check.missing)))
    for r in check.records:
        if not r.identity_ok or r.signature == "invalid":
            outcome = "failed"
        else:
            outcome = "verified" if r.signature == "authored" else "not_checked"
        position = f"log position {r.seq}" if r.seq is not None else "no proven log position"
        intact = "intact" if r.identity_ok else "does not match its id"
        checks.append(Check(f"Record {r.capsule_id}", outcome, f"{position}; {intact}; signature {r.signature}"))
    return VerificationResult(VERIFIER, _VERDICT[check.verdict], tuple(checks))


def context_from_check(bundle: Any, check: EvidenceFileCheck) -> VerifiedBundleContext:
    """The context for *bundle* from capsule-emit's *check* of it. Raises
    :class:`~capsule_viewer.evidence_report.BundleMismatch` when the result is
    not for this bundle."""
    bind_result(bundle, check)
    if not isinstance(bundle, dict):
        raise TypeError("bundle must be a JSON object")
    # capsule-emit reports no per-member disclosure results, so every member
    # is withheld here; the Ledger module shows no payload.
    return build_context(bundle, verification_of(check), {})


def ledger_page(bundle: Any, check: EvidenceFileCheck, *, source: str = "", depth: str = "L1") -> str:
    """The page for *bundle* given capsule-emit's *check* of it. *source* names
    the ledger on the page; *depth* is the opening level (contract section 9):
    at L0 the rows are closed, at L1 and L2 open. The verifier's checks are the
    shell's, after the rows, at every depth."""
    context = context_from_check(bundle, check)
    module = LedgerModule(source, depth)
    registry = Registry()
    registry.register(MANIFEST, module.canRender, module)
    return present(context, registry, audience="*", core_checks=True)


def ledger_bundle(records: Sequence[dict]) -> dict:
    """One evidence file over every record of a ledger, as capsule-emit builds
    one (its ``permalink.build_bundle``; the root is the last record)."""
    from capsule_emit.permalink import build_bundle

    return build_bundle(list(records), bundle=True)


def check_and_render(records: Sequence[dict], *, source: str = "", depth: str = "L1") -> tuple[EvidenceFileCheck, str]:
    """The ledger's file, capsule-emit's check of it and the page."""
    from capsule_emit.evidence_file import check_evidence_file

    bundle = ledger_bundle(records)
    check = check_evidence_file(bundle)
    return check, ledger_page(bundle, check, source=source, depth=depth)
