# SPDX-License-Identifier: Apache-2.0
"""Fixture helpers for the History Card tests.

The fixtures under ``tests/testdata/history/`` are real: capsulectl ``deal
history`` wrote them (``examples/history/cut_fixtures.sh``), and
``verify/<name>.json`` is what ``capsulectl verify --bundle`` printed for
each. ``example_context`` hands a bundle to the registry under an example
verifier's result, only so resolution (which reads a verified context's
descriptor) can be tested without a binary; it says nothing about the bundle
verifying. ``capsulectl verify`` is the verifier.
"""
from __future__ import annotations

import copy
import hashlib
from collections.abc import Callable, Mapping

from ..context import VerifiedBundleContext, build_context
from ..digest import jcs
from ..kit.components import Check, VerificationResult
from .recompute import CAPSULE_ID_EXCLUDED, DEAL_PROFILE, REPORT_POINTER, SELECTION_EXTENSION, check

EXAMPLE_VERIFIER = "an example verifier (resolution tests only)"
VERIFIED = VerificationResult(EXAMPLE_VERIFIER, "verified", (Check("graph closure", "verified"), Check("record disclosures", "verified")))


def example_context(bundle: Mapping) -> VerifiedBundleContext:
    """*bundle* under the example verifier's result, every supplied
    top-level ``agent_input`` resolved as matching."""
    disclosures = bundle.get("disclosures") or {}
    status = {cid: {"agent_input": "disclosure_match"} for cid, d in disclosures.items() if isinstance(d, Mapping) and "agent_input" in d}
    return build_context(bundle, VERIFIED, status)


def with_asserted_result(bundle: Mapping, *, flip_status: tuple[str, str] | None = None) -> dict:
    """*bundle* with an ``asserted_result`` beside the selection: the values
    this page computes, or those values with one effect status renamed
    (``flip_status=(from, to)``). The selection record seals no values, so an
    asserted_result is the file's statement only; the page recomputes it."""
    out = copy.deepcopy(dict(bundle))
    reading = check(out)
    if reading["values"] is None:
        raise ValueError(f"the bundle renders no card: {reading['findings']}")
    values = copy.deepcopy(reading["values"])
    if flip_status is not None:
        old, new = flip_status
        statuses = values["effect_status"]
        if old not in statuses:
            raise ValueError(f"no effect status {old} to flip")
        statuses[new] = statuses.pop(old) + statuses.get(new, 0)
        values["effect_status"] = dict(sorted(statuses.items()))
    out["extensions"][SELECTION_EXTENSION]["asserted_result"] = values
    return out


def _sha(value) -> str:
    return hashlib.sha256(jcs(value)).hexdigest()


def _record_id(record: Mapping) -> str:
    return _sha({k: v for k, v in record.items() if k not in CAPSULE_ID_EXCLUDED})


def _rename_ids(bundle: dict, renamed: dict[str, str]) -> None:
    """Follow record ids that changed: the disclosure keys, the root, the
    certificate's memberships and the declared-missing list."""
    if not renamed:
        return
    bundle["disclosures"] = {renamed.get(k, k): v for k, v in (bundle.get("disclosures") or {}).items()}
    if bundle.get("root") in renamed:
        bundle["root"] = renamed[bundle["root"]]
    certificate = bundle.get("completeness_certificate")
    if isinstance(certificate, dict) and isinstance(certificate.get("memberships"), dict):
        certificate["memberships"] = {renamed.get(k, k): v for k, v in certificate["memberships"].items()}
    completeness = bundle.get("completeness")
    if isinstance(completeness, dict) and isinstance(completeness.get("missing"), list):
        completeness["missing"] = [renamed.get(k, k) for k in completeness["missing"]]


def _reseal_records(bundle: dict, sealed_ids: set[str]) -> dict[str, str]:
    """Re-seal the records in *sealed_ids* over their disclosed agent_input
    (agent_input_digest), recompute every record id in bundle order (a
    record citing a renamed one follows it) and return old -> new. The
    signatures are left as they were: they no longer sign the new ids."""
    renamed: dict[str, str] = {}
    disclosures = bundle.get("disclosures") or {}
    for record in bundle["records"]:
        old = record["capsule_id"]
        if old in sealed_ids:
            record["model_attestation"]["compute_attestation"]["agent_input_digest"] = _sha(disclosures[old]["agent_input"])
        chain = record.get("chain")
        if isinstance(chain, dict) and chain.get("parent_capsule_id") in renamed:
            chain["parent_capsule_id"] = renamed[chain["parent_capsule_id"]]
        for ref in record.get("references") or []:
            if isinstance(ref, dict) and ref.get("digest") in renamed:
                ref["digest"] = renamed[ref["digest"]]
        new = _record_id(record)
        if new != old:
            renamed[old] = new
            record["capsule_id"] = new
    _rename_ids(bundle, renamed)
    return renamed


def reseal_selection(bundle: Mapping, edit: Callable[[dict], None], *, carry: bool = True) -> dict:
    """*bundle* with its sealed selection (the selection record's agent_input)
    edited by *edit* and the selection record re-sealed over it; the carried
    selection follows unless ``carry`` is false. In memory only: the record's
    signature, the checkpoint and the log no longer match, and capsulectl
    verify would say so."""
    out = copy.deepcopy(dict(bundle))
    ext = out["extensions"][SELECTION_EXTENSION]
    old = ext["selection_record"]
    edit(out["disclosures"][old]["agent_input"])
    renamed = _reseal_records(out, {old})
    ext["selection_record"] = renamed.get(old, old)
    if carry:
        ext["selection"] = copy.deepcopy(out["disclosures"][ext["selection_record"]]["agent_input"]["selection"])
    return out


def with_audience(bundle: Mapping, audience: str) -> dict:
    """*bundle* re-sealed in memory for *audience*: each selected deal copy's
    report (its sealed deal report, or its inline x-deal-v0 block) says
    *audience*, each selection entry names the new copy's digest, and the
    selection record seals *audience* and those entries. Used to test the
    audiences capsulectl refuses to write a History for (counterparty,
    adjudicator); no capsulectl wrote these bytes and they do not verify."""
    out = copy.deepcopy(dict(bundle))
    ext = out["extensions"][SELECTION_EXTENSION]
    digests = {}
    for deal, member in ext["deals"].items():
        report = member["extensions"][DEAL_PROFILE]
        pointer = report.get(REPORT_POINTER)
        if isinstance(pointer, str):
            member["disclosures"][pointer]["agent_input"]["report"]["audience"] = audience
            renamed = _reseal_records(member, {pointer})
            report[REPORT_POINTER] = renamed.get(pointer, pointer)
        else:
            report["audience"] = audience
        digests[deal] = _sha(member)

    def edit(sealed: dict) -> None:
        sealed["audience"] = audience
        for entry in sealed["selection"]:
            if entry["deal_id"] in digests:
                entry["bundle_digest"] = digests[entry["deal_id"]]

    return reseal_selection(out, edit)
