# SPDX-License-Identifier: Apache-2.0
"""The History Card check (docs/design/history-card.md, sections 1 to 3).

A History is an ``evidence-bundle/v2`` of a history log (log id
``deal-history``) whose root record, the selection record (action_id
``capsulectl-deal-history``), seals a selection of deal copies and is signed
by one key, K. The bundle's ``x-history-selection/v0`` extension carries:

    {"selection_record": <that record's capsule id>,
     "selection": [{"deal_id", "bundle_digest"}],   # equal to the sealed one
     "deals": {<deal id>: <that deal's copy for the audience, an evidence-bundle/v2>}}

What a History shows is only that the holder of key K presents these copies,
each of which verifies on its own. A record's signature sits outside its
Capsule ID, so anyone can re-sign someone else's counterparty copies under a
fresh key and still get VALID: a History does not show that K's holder made,
took part in or owns those deals, and nothing here says it does.

Fields this check does not know (in the sealed selection, in a selection
entry) are tolerated and never shown; the carried selection is still
compared with the sealed one entry for entry, every field included.

``check(bundle)`` returns everything the card needs: the findings (named as
``capsulectl verify`` names them where it has a name), a status per property
(PASS, FAIL, NOT_CHECKED, NOT_PRESENT), the state the page shows and, only
when the state is ``card``, the values. ``recompute_errors(bundle)`` is the
findings alone.

This check reads the file alone. It recomputes record ids, disclosure
digests and nested bundle digests with this repository's own JCS
(``capsule_viewer.digest``). It does not verify signatures, checkpoints or
log membership: those are reported NOT_CHECKED, never as verified. The page
runs the same check in ``static/history_card.js`` (``check``); there, and
only there, the selection record's identity and the history log's checkpoint
and membership are also read from the page's verifier (agent-action-capsule's
VerifiedBundleContext), which this file-only twin does not have.
"""
from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping

from ..digest import jcs

SELECTION_EXTENSION = "x-history-selection/v0"
HISTORY_LOG_ID = "deal-history"
SELECTION_ACTION_ID = "capsulectl-deal-history"
DEAL_PROFILE = "x-deal-v0"
REPORT_POINTER = "sealed_report"
# "history" is the one shareable audience (neutral u888). keep (never one to
# send), counterparty (the original participant's copy) and adjudicator
# (made for a dispute about that deal; open, failing closed) are never shown
# to anyone else.
SHAREABLE_AUDIENCES = ("history",)
UNSHAREABLE_AUDIENCES = ("keep", "counterparty", "adjudicator")
RECOMPUTED_KEYS = ("completeness", "outcome_evidence", "period", "selected_count")
# agent-action-capsule canonical.py: capsule_id and the local-only producer fields leave the preimage.
CAPSULE_ID_EXCLUDED = frozenset({"capsule_id", "signature", "key_id"})
DEAL_ID = re.compile(r"^deal-[0-9a-f]{16}$")
HEX_DIGEST = re.compile(r"^[0-9a-f]{64}$")

# The properties, in the order the page lists them.
PROPERTIES = (
    "selection_record",
    "selection_record_signature",
    "selection_root",
    "history_log",
    "selection_sealed",
    "membership",
    "member_digests",
    "audience",
    "signer_keys",
    "member_records",
    "member_signatures",
    "member_logs",
    "values",
)

PASS, FAIL, NOT_CHECKED, NOT_PRESENT = "PASS", "FAIL", "NOT_CHECKED", "NOT_PRESENT"


def _digest(value) -> str | None:
    try:
        return hashlib.sha256(jcs(value)).hexdigest()
    except (TypeError, ValueError):
        return None


def _obj(v) -> Mapping:
    return v if isinstance(v, Mapping) else {}


def _same(a, b) -> bool:
    try:
        return jcs(a) == jcs(b)
    except (TypeError, ValueError):
        return False


def selection_block(bundle: Mapping) -> object:
    """The ``x-history-selection/v0`` block of *bundle*, as carried (``None`` when absent)."""
    extensions = bundle.get("extensions") if isinstance(bundle, Mapping) else None
    return extensions.get(SELECTION_EXTENSION) if isinstance(extensions, Mapping) else None


def sealed_selection(bundle: Mapping) -> Mapping | None:
    """The selection record's disclosed ``agent_input`` (``None`` when not disclosed)."""
    record_id = _obj(selection_block(bundle)).get("selection_record")
    entry = _obj(_obj(_obj(bundle).get("disclosures")).get(record_id)) if isinstance(record_id, str) else {}
    sealed = entry.get("agent_input")
    return sealed if isinstance(sealed, Mapping) else None


def sealed_or_inline_report(member: Mapping) -> Mapping:
    """A deal copy's report, as capsule-cli's ``sealedOrInlineReport`` reads
    it: the sealed ``deal_report`` record's ``report`` when ``x-deal-v0``
    names one by ``sealed_report``, else the inline ``x-deal-v0`` block."""
    report = _obj(_obj(_obj(member).get("extensions")).get(DEAL_PROFILE))
    pointer = report.get(REPORT_POINTER)
    if isinstance(pointer, str):
        disclosed = _obj(_obj(_obj(member).get("disclosures")).get(pointer)).get("agent_input")
        return _obj(_obj(disclosed).get("report"))
    return report


def selected_records(bundle: Mapping) -> list[dict]:
    """Every record of every selected deal copy: the members of the
    extension's ``deals`` that its ``selection`` names, in selection order,
    each member's records in its own order, each with that member's disclosed
    ``agent_input`` (``None`` when withheld): ``{"deal", "record", "agent_input"}``.

    This is the one place a deal record is read from the input. A member the
    selection does not name is never read for values (it is a finding)."""
    block = _obj(selection_block(bundle))
    deals = _obj(block.get("deals"))
    selection = block.get("selection")
    out = []
    for entry in selection if isinstance(selection, list) else []:
        deal = _obj(entry).get("deal_id")
        member = deals.get(deal) if isinstance(deal, str) else None
        if not isinstance(member, Mapping):
            continue
        records = member.get("records")
        disclosures = _obj(member.get("disclosures"))
        for r in records if isinstance(records, list) else []:
            if not isinstance(r, Mapping):
                continue
            agent_input = _obj(disclosures.get(r.get("capsule_id"))).get("agent_input")
            out.append({"deal": deal, "record": r, "agent_input": agent_input if isinstance(agent_input, Mapping) else None})
    return out


def bucket(record: Mapping, agent_input: Mapping | None) -> str:
    """One bucket per record, the first rule that applies (design section 2)."""
    body = _obj(_obj(agent_input).get("body"))
    if "outcome" in body:
        return f"outcome:{body['outcome']}"
    if body.get("action_class") == "money.refund":
        return "action_class:money.refund"
    status = _obj(record.get("effect")).get("status")
    if status:
        return f"effect.status:{status}"
    if agent_input is None:
        return "withheld"
    return "none"


def derive(selected: list[dict], selected_count: int) -> dict:
    """The four values, from ``selected_records`` entries and the number of selected deals."""
    breakdown: dict[str, int] = {}
    for s in selected:
        b = bucket(s["record"], s["agent_input"])
        breakdown[b] = breakdown.get(b, 0) + 1
    times = sorted(str(s["record"].get("timestamp")) for s in selected)
    return {
        "period": {"from": times[0] if times else None, "to": times[-1] if times else None, "temporal_provenance": "producer_asserted"},
        "selected_count": selected_count,
        "outcome_evidence": dict(sorted(breakdown.items())),
        "completeness": "not_asserted",
    }


def _signed(record: Mapping) -> bool:
    return bool(record.get("key_id")) and bool(record.get("signature"))


def _record_findings(deal: str, member: Mapping) -> list[str]:
    """Record ids and disclosure digests of one member, recomputed."""
    out: list[str] = []
    records = member.get("records")
    disclosures = _obj(member.get("disclosures"))
    for r in records if isinstance(records, list) else []:
        r = _obj(r)
        if r.get("capsule_id") != _digest({k: v for k, v in r.items() if k not in CAPSULE_ID_EXCLUDED}):
            out.append(f"deal_record_id_mismatch:{deal}")
            continue
        disclosed = _obj(disclosures.get(r.get("capsule_id"))).get("agent_input")
        bound = _obj(_obj(r.get("model_attestation")).get("compute_attestation")).get("agent_input_digest")
        if disclosed is not None and _digest(disclosed) != bound:
            out.append(f"deal_disclosure_mismatch:{deal}")
    return sorted(set(out))


# Findings that make a file not a shareable History (design section 3).
def _not_shareable(finding: str) -> bool:
    return finding.split(":")[0] in (
        "deal_signers_differ",
        "deal_signed_by_other_key",
        "deal_not_in_selection",
        "deal_missing",
        *(f"history_audience_{a}" for a in UNSHAREABLE_AUDIENCES),
        *(f"deal_audience_{a}" for a in UNSHAREABLE_AUDIENCES),
    )


def check(bundle: Mapping) -> dict:
    """The whole reading of *bundle*: ``{"state", "findings", "properties",
    "holder_key", "audience", "signer_keys", "deals", "values", "asserted",
    "mismatches"}``. ``values`` is ``None`` unless ``state`` is ``card``."""
    bundle = _obj(bundle)
    block = selection_block(bundle)
    status = {p: PASS for p in PROPERTIES}
    failed: list[str] = []

    def fail(prop: str, finding: str) -> None:
        status[prop] = FAIL
        failed.append(finding)

    if not isinstance(block, Mapping) or bundle.get("bundle_kind") != "evidence-bundle/v2":
        return {
            "state": "invalid", "findings": [f"no {SELECTION_EXTENSION} block in an evidence-bundle/v2"],
            "properties": {p: NOT_PRESENT for p in PROPERTIES}, "holder_key": "", "audience": "",
            "signer_keys": {}, "deals": [], "values": None, "asserted": False, "mismatches": [],
        }

    # The selection record: the bundle's root, recomputing to its id, its disclosure bound, signed.
    record_id = block.get("selection_record")
    records = bundle.get("records") if isinstance(bundle.get("records"), list) else []
    record = next((_obj(r) for r in records if _obj(r).get("capsule_id") == record_id and isinstance(record_id, str)), None)
    sealed = sealed_selection(bundle)
    holder = ""
    if record is None or sealed is None:
        status["selection_record"] = NOT_PRESENT if record is None else FAIL
        failed.append("selection_record_unverified")
    else:
        bound = _obj(_obj(record.get("model_attestation")).get("compute_attestation")).get("agent_input_digest")
        if (
            record.get("action_id") != SELECTION_ACTION_ID
            or record.get("capsule_id") != _digest({k: v for k, v in record.items() if k not in CAPSULE_ID_EXCLUDED})
            or _digest(sealed) != bound
            or sealed.get("type") != "history_selection"
            or sealed.get("profile") != SELECTION_EXTENSION
        ):
            fail("selection_record", "selection_record_unverified")
        holder = record.get("key_id") if isinstance(record.get("key_id"), str) else ""
    if record is not None and _signed(record):
        status["selection_record_signature"] = NOT_CHECKED
    else:
        status["selection_record_signature"] = NOT_PRESENT
        failed.append("selection_record_unsigned")
    # capsulectl verify: the bundle's root is the selection record, and its log is deal-history.
    if not isinstance(record_id, str) or bundle.get("root") != record_id:
        fail("selection_root", "selection_record_not_root")
    checkpoint = _obj(bundle.get("checkpoint"))
    certificate = _obj(bundle.get("completeness_certificate"))
    if checkpoint and certificate:
        status["history_log"] = NOT_CHECKED
        if checkpoint.get("log_id") != HISTORY_LOG_ID or certificate.get("log_id") != HISTORY_LOG_ID:
            fail("history_log", "not_a_history_log")
    else:
        status["history_log"] = NOT_PRESENT
        failed.append("history_checkpoint_missing")

    sealed = _obj(sealed)
    if not _same(block.get("selection"), sealed.get("selection")):
        fail("selection_sealed", "selection_not_sealed")
    audience = sealed.get("audience") if isinstance(sealed.get("audience"), str) else ""

    # The sealed selection's entries.
    listed = sealed.get("selection") if isinstance(sealed.get("selection"), list) else []
    if not listed:
        fail("membership", "selection_missing")
    picked: dict[str, str] = {}
    for raw in listed:
        e = _obj(raw)
        deal, digest = e.get("deal_id"), e.get("bundle_digest")
        if not isinstance(deal, str) or deal in picked or not DEAL_ID.match(deal) or not isinstance(digest, str) or not HEX_DIGEST.match(digest):
            fail("membership", f"selection_entry_malformed:{deal if isinstance(deal, str) else ''}")
            continue
        picked[deal] = digest

    if audience in UNSHAREABLE_AUDIENCES:
        fail("audience", f"history_audience_{audience}")
    elif audience not in SHAREABLE_AUDIENCES:
        fail("audience", "history_audience_unknown")

    carried = _obj(block.get("deals"))
    signers: dict[str, list[str]] = {}

    def note_keys(deal: str, member: Mapping) -> tuple[list[str], bool]:
        keys, unsigned = set(), False
        for r in member.get("records") if isinstance(member.get("records"), list) else []:
            r = _obj(r)
            if not _signed(r):
                unsigned = True
            if isinstance(r.get("key_id"), str) and r.get("key_id"):
                keys.add(r["key_id"])
        for key in sorted(keys):
            signers.setdefault(key, []).append(deal)
        return sorted(keys), unsigned

    for deal in sorted(d for d in carried if d not in picked):
        fail("membership", f"deal_not_in_selection:{deal}")
        note_keys(deal, _obj(carried[deal]))

    deals = []
    any_checkpoint_missing = False
    any_unsigned = False
    for deal, digest in picked.items():
        member = carried.get(deal)
        entry = {"deal_id": deal, "audience": "", "digest": "missing"}
        deals.append(entry)
        if not isinstance(member, Mapping):
            fail("membership", f"deal_missing:{deal}")
            continue
        if member.get("bundle_kind") != "evidence-bundle/v2" or member.get("bundle_version") != "2":
            fail("member_digests", f"deal_not_a_bundle:{deal}")
            continue
        if _digest(member) == digest:
            entry["digest"] = "match"
        else:
            entry["digest"] = "mismatch"
            fail("member_digests", f"deal_bundle_not_the_selected_one:{deal}")
        copy_for = sealed_or_inline_report(member).get("audience")
        entry["audience"] = copy_for if isinstance(copy_for, str) else ""
        if copy_for != audience:
            fail("audience", f"deal_audience_not_selected:{deal}")
        if copy_for in UNSHAREABLE_AUDIENCES:
            fail("audience", f"deal_audience_{copy_for}:{deal}")
        keys, unsigned = note_keys(deal, member)
        if unsigned:
            any_unsigned = True
            failed.append(f"deal_record_unsigned:{deal}")
        for key in keys:
            if key != holder:
                fail("signer_keys", f"deal_signed_by_other_key:{deal}")
        for finding in _record_findings(deal, member):
            fail("member_records", finding)
        if not (_obj(member.get("checkpoint")) and _obj(member.get("completeness_certificate"))):
            any_checkpoint_missing = True
            failed.append(f"deal_checkpoint_missing:{deal}")
    if len(signers) > 1:
        fail("signer_keys", "deal_signers_differ")
    status["member_signatures"] = NOT_PRESENT if any_unsigned or not deals else NOT_CHECKED
    status["member_logs"] = NOT_PRESENT if any_checkpoint_missing or not deals else NOT_CHECKED

    # The values: computed here; compared with asserted_result only when the file states one.
    asserted = block.get("asserted_result")
    has_asserted = "asserted_result" in block
    values = derive(selected_records(bundle), len(picked))
    mismatches: list[str] = []
    if has_asserted:
        a = _obj(asserted)
        extra = sorted(set(a) - set(RECOMPUTED_KEYS))
        if extra:
            mismatches.append(f"asserted_result carries values nothing recomputes: {extra}")
        for key in RECOMPUTED_KEYS:
            if not _same(values[key], a.get(key)):
                mismatches.append(f"{key}: recomputed {values[key]!r} != asserted {a.get(key)!r}")
        status["values"] = FAIL if mismatches else PASS
    else:
        status["values"] = NOT_PRESENT

    findings = list(dict.fromkeys(failed))
    if any(_not_shareable(f) for f in findings):
        state = "not_shareable"
    elif findings:
        state = "invalid"
    elif mismatches:
        state = "mismatch"
    else:
        state = "card"
    for key in signers:
        signers[key].sort()
    return {
        "state": state,
        "findings": findings + mismatches,
        "properties": status,
        "holder_key": holder,
        "audience": audience,
        "signer_keys": dict(sorted(signers.items())),
        "deals": deals,
        "values": values if state == "card" else None,
        "asserted": has_asserted,
        "mismatches": mismatches,
    }


def recompute_errors(bundle: Mapping) -> list[str]:
    """Every reason *bundle* is not a History this page can show, or ``[]``."""
    return check(bundle)["findings"]
