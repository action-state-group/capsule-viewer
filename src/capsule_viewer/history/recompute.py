# SPDX-License-Identifier: Apache-2.0
"""The History Card check (docs/design/history-card.md, sections 1 to 3).

A History is an ``evidence-bundle/v2`` of a log of its own (log id
``deal-history/<nonce>``, the nonce the selection record seals: 64 lowercase
hex) whose root record, the selection record (action_id
``capsulectl-deal-history``), seals a selection of deal copies and is signed
by one key, K. The bundle's ``x-history-selection/v0`` extension carries:

    {"selection_record": <that record's capsule id>,
     "selection": [{"deal_id", "bundle_digest", "steps_after_checkpoint"}],   # equal to the sealed one
     "deals": {<deal id>: <that deal's copy for the audience, an evidence-bundle/v2>}}

Two reads are what the holder states, signed with the selection and checked
against no deal (``holder_stated``, as ``capsulectl verify`` reports it): the
sealed ``recipient``, who the History is for (required for the audience
``history``, absent for ``keep``), and each entry's
``steps_after_checkpoint``, how many steps the deal has after its copy's
checkpoint (a JSON integer >= 0). The page shows them as the holder's
statements and never as checked.

What a History shows is only that the holder of key K presents these copies,
each of which verifies on its own. A record's signature sits outside its
Capsule ID, so anyone can re-sign someone else's counterparty copies under a
fresh key and still get VALID: a History does not show that K's holder made,
took part in or owns those deals, and nothing here says it does.

Other fields this check does not know (in the sealed selection, in a selection
entry) are tolerated and never shown; the carried selection is still
compared with the sealed one entry for entry, every field included.

The copies a History is shown with are for the audience ``history``: each
withholds every record's payload, so only a record's time and an act's
``effect.status`` (both in the capsule) show. A deal's outcome and its acts'
action classes are in payloads, so a History does not prove them:
``not_proven`` is ``["outcome", "action_class"]``, as ``capsulectl verify``
reports it, derived here from the withheld payloads. Nothing is inferred
about them.

``check(bundle)`` returns everything the card needs: the findings (named as
``capsulectl verify`` names them where it has a name), a status per property
(PASS, FAIL, NOT_CHECKED, NOT_PRESENT), the state the page shows,
``not_proven`` and, only when the state is ``card``, the values.
``recompute_errors(bundle)`` is the findings alone.

This check reads the file alone. It recomputes record ids, disclosure
digests and nested bundle digests with this repository's own JCS
(``capsule_viewer.digest``). It does not verify signatures, checkpoints or
log membership: those are reported NOT_CHECKED, never as verified. Every
signature status is NOT_CHECKED in one wording: checked by capsulectl on the
sender's machine, not by this page. The page
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
# A History's own log: this prefix and the selection record's sealed nonce.
HISTORY_LOG_PREFIX = "deal-history/"
# The reads of a History that are what the holder states (capsulectl verify's "holder_stated", in its order).
HOLDER_STATED = ("recipient", "steps_after_checkpoint")
MAX_SAFE_INTEGER = 2**53 - 1
SELECTION_ACTION_ID = "capsulectl-deal-history"
DEAL_PROFILE = "x-deal-v0"
REPORT_POINTER = "sealed_report"
# "history" is the one shareable audience (neutral u888). A keep History (a
# copy to keep, with every payload) verifies but is never one to send. Any other sealed
# audience (counterparty, adjudicator: capsulectl refuses both for a History)
# fails capsulectl verify: selection_audience_not_history.
HISTORY_AUDIENCE = "history"
KEEP_AUDIENCE = "keep"
# What a history copy does not prove, in capsulectl verify's order (its History entry's "not_proven").
NOT_PROVEN = ("outcome", "action_class")
RECOMPUTED_KEYS = ("completeness", "effect_status", "period", "selected_count")
# The L0 counts (History Basic wording, FR-7a, section 5.2): K counts the deals with at least
# one record whose capsule states effect.status "confirmed" (agent-action-capsule:
# the result observed and bound), F the deals with at least one "failed".
# dispatched (sent, result not observed), planned and reverted count toward
# neither. capsule-cli writes only "dispatched" for a deal's act.
COMPLETED_STATUS = "confirmed"
FAILED_STATUS = "failed"
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
# L0's words, as the module compiles them in (history_card.js WORDS.l0*).
L0_TITLE = "History Card \u00b7 Delivery outcomes not established"
L0_DEALS = ("selected deal", "selected deals")
L0_COMPLETED = "with recorded completed steps"
L0_FAILED = "with a recorded failed step"
# The page check states (History Basic wording, FR-32).
PAGE_STATES = ("checking", "integrity_checked", "failed", "unable_to_verify")
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
    "holder_stated",
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


def effect_status(record: Mapping) -> str | None:
    """The status a record's capsule states for its effect (an act's), or ``None``."""
    status = _obj(record.get("effect")).get("status")
    return status if isinstance(status, str) and status else None


def derive(selected: list[dict], selected_count: int) -> dict:
    """The values, from ``selected_records`` entries and the number of selected
    deals. Only what each record's capsule states is read (its time, an act's
    effect status): never a payload, so nothing about an outcome or an action
    class is inferred."""
    statuses: dict[str, int] = {}
    for s in selected:
        status = effect_status(s["record"])
        if status is not None:
            statuses[status] = statuses.get(status, 0) + 1
    times = sorted(str(s["record"].get("timestamp")) for s in selected)
    return {
        "period": {"from": times[0] if times else None, "to": times[-1] if times else None, "temporal_provenance": "producer_asserted"},
        "selected_count": selected_count,
        "effect_status": dict(sorted(statuses.items())),
        "completeness": "not_asserted",
    }


def step_counts(selected: list[dict]) -> dict:
    """K and F for L0: ``{"completed", "failed"}``, each a number of deals (not records)."""
    completed = {s["deal"] for s in selected if effect_status(s["record"]) == COMPLETED_STATUS}
    failed = {s["deal"] for s in selected if effect_status(s["record"]) == FAILED_STATUS}
    return {"completed": len(completed), "failed": len(failed)}


def period_text(period: Mapping) -> str:
    """The period as L0 states it, from the records' own times (UTC, as
    written): ``Oct 2026``, ``Jan\u2013Sep 2026`` or ``Dec 2025\u2013Feb 2026``; the raw
    times when either does not start with a year and a month."""

    def at(t):
        m = re.match(r"(\d{4})-(\d{2})", t) if isinstance(t, str) else None
        return (m.group(1), MONTHS[int(m.group(2)) - 1]) if m and 1 <= int(m.group(2)) <= 12 else None

    start, end = at(period.get("from")), at(period.get("to"))
    if start is None or end is None:
        return f"{_js_str(period.get('from'))} to {_js_str(period.get('to'))}"
    if start[0] != end[0]:
        return f"{start[1]} {start[0]}\u2013{end[1]} {end[0]}"
    return ("" if start[1] == end[1] else f"{start[1]}\u2013") + f"{end[1]} {end[0]}"


def _js_str(v) -> str:
    # As the module's String(v): null for None.
    return "null" if v is None else str(v)


def l0_lines(values: Mapping, counts: Mapping) -> list[str]:
    """L0's first two lines (History Basic wording, section 5.2)."""
    n = values["selected_count"]
    deals = L0_DEALS[0] if n == 1 else L0_DEALS[1]
    return [
        L0_TITLE,
        f"{n} {deals} \u00b7 {period_text(values['period'])} \u00b7 "
        f"{counts['completed']} {L0_COMPLETED} \u00b7 {counts['failed']} {L0_FAILED}",
    ]


def page_state(state: str) -> str:
    """The page check state for a reading's state: the card is
    ``integrity_checked``; does not check, does not recompute and not
    shareable are ``failed``; a check that could not run (``not_checked``,
    the module's) is ``unable_to_verify``."""
    if state == "card":
        return "integrity_checked"
    if state == "not_checked":
        return "unable_to_verify"
    if state == "checking":
        return "checking"
    return "failed"


def not_proven(selected: list[dict], audience: str) -> list[str]:
    """What the History does not prove, from the payloads its copies withhold:
    a record whose payload is withheld shows no outcome and no action class,
    so for a History for the ``history`` audience whose selected records
    withhold a payload, both are not proven (``capsulectl verify``'s
    ``not_proven``, in its order). ``[]`` otherwise (a keep History discloses
    them; any other audience fails)."""
    if audience != HISTORY_AUDIENCE or not any(s["agent_input"] is None for s in selected):
        return []
    return list(NOT_PROVEN)


def payload_disclosed(member: Mapping) -> bool:
    """capsule-cli ``payloadDisclosed``: any disclosure entry of the copy is non-empty."""
    return any(isinstance(d, Mapping) and len(d) > 0 for d in _obj(member.get("disclosures")).values())


def step_count(value) -> int | None:
    """A sealed ``steps_after_checkpoint``: a JSON integer >= 0 (not a
    boolean, a float or text), as capsule-cli ``stepCount`` reads it; ``None``
    when it is not one. Bounded by the largest integer the page can read
    exactly (2**53 - 1)."""
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= MAX_SAFE_INTEGER:
        return None
    return value


def recipient_of(sealed: Mapping) -> str:
    """The sealed ``recipient`` as capsulectl verify reports it: the string as
    sealed, or ``""`` when it is absent or not a string."""
    recipient = sealed.get("recipient")
    return recipient if isinstance(recipient, str) else ""


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
        "history_audience_keep",
        "deal_audience_keep",
    )


# capsulectl verify findings that make the History INVALID whatever else it
# holds: "This History does not check", never "Not a shareable History".
def _does_not_check(finding: str) -> bool:
    return finding.split(":")[0] in (
        "selection_audience_not_history",
        "deal_payload_disclosed",
        "selection_recipient_missing",
        "selection_entry_malformed",
    )


def check(bundle: Mapping) -> dict:
    """The whole reading of *bundle*: ``{"state", "page_state", "findings",
    "properties", "holder_key", "audience", "recipient", "holder_stated",
    "signer_keys", "deals", "not_proven", "values", "l0", "asserted",
    "mismatches"}``. ``values`` and
    ``l0`` are ``None`` unless ``state`` is ``card``."""
    bundle = _obj(bundle)
    block = selection_block(bundle)
    status = {p: PASS for p in PROPERTIES}
    failed: list[str] = []

    def fail(prop: str, finding: str) -> None:
        status[prop] = FAIL
        failed.append(finding)

    if not isinstance(block, Mapping) or bundle.get("bundle_kind") != "evidence-bundle/v2":
        return {
            "state": "invalid", "page_state": "failed", "findings": [f"no {SELECTION_EXTENSION} block in an evidence-bundle/v2"],
            "properties": {p: NOT_PRESENT for p in PROPERTIES}, "holder_key": "", "audience": "",
            "recipient": "", "holder_stated": [], "signer_keys": {}, "deals": [], "not_proven": [], "values": None, "l0": None, "asserted": False, "mismatches": [],
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
    # capsulectl verify: the bundle's root is the selection record, and its log
    # is the History's own, deal-history/ and the sealed nonce (64 hex).
    if not isinstance(record_id, str) or bundle.get("root") != record_id:
        fail("selection_root", "selection_record_not_root")
    checkpoint = _obj(bundle.get("checkpoint"))
    certificate = _obj(bundle.get("completeness_certificate"))
    nonce = _obj(sealed).get("nonce")
    log_id = HISTORY_LOG_PREFIX + nonce if isinstance(nonce, str) and HEX_DIGEST.match(nonce) else None
    if checkpoint and certificate:
        status["history_log"] = NOT_CHECKED
        if log_id is None or checkpoint.get("log_id") != log_id or certificate.get("log_id") != log_id:
            fail("history_log", "not_a_history_log")
    else:
        status["history_log"] = NOT_PRESENT
        failed.append("history_checkpoint_missing")

    sealed = _obj(sealed)
    if not _same(block.get("selection"), sealed.get("selection")):
        fail("selection_sealed", "selection_not_sealed")
    audience = sealed.get("audience") if isinstance(sealed.get("audience"), str) else ""
    # The holder's statements (capsulectl verify's holder_stated): present and
    # well formed, never checked against the deals, so NOT_CHECKED at best.
    recipient = recipient_of(sealed)
    status["holder_stated"] = NOT_CHECKED
    if audience == HISTORY_AUDIENCE and not recipient.strip():
        fail("holder_stated", "selection_recipient_missing")

    # The sealed selection's entries.
    listed = sealed.get("selection") if isinstance(sealed.get("selection"), list) else []
    if not listed:
        fail("membership", "selection_missing")
    picked: dict[str, str] = {}
    later: dict[str, int] = {}
    for raw in listed:
        e = _obj(raw)
        deal, digest = e.get("deal_id"), e.get("bundle_digest")
        steps = step_count(e.get("steps_after_checkpoint"))
        if (
            not isinstance(deal, str) or deal in picked or not DEAL_ID.match(deal)
            or not isinstance(digest, str) or not HEX_DIGEST.match(digest) or steps is None
        ):
            if steps is None:
                status["holder_stated"] = FAIL
            fail("membership", f"selection_entry_malformed:{deal if isinstance(deal, str) else ''}")
            continue
        picked[deal], later[deal] = digest, steps

    # capsulectl verify: the sealed audience is history, or keep (VALID, never one to send).
    if audience == KEEP_AUDIENCE:
        fail("audience", "history_audience_keep")
    elif audience != HISTORY_AUDIENCE:
        fail("audience", "selection_audience_not_history")

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
        entry = {"deal_id": deal, "steps_after_checkpoint": later[deal], "audience": "", "digest": "missing"}
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
        if copy_for == KEEP_AUDIENCE:
            fail("audience", f"deal_audience_keep:{deal}")
        if audience == HISTORY_AUDIENCE and payload_disclosed(member):
            fail("audience", f"deal_payload_disclosed:{deal}")
        keys, unsigned = note_keys(deal, member)
        if unsigned:
            any_unsigned = True
            failed.append(f"deal_record_unsigned:{deal}")
        for key in keys:
            if key != holder:
                fail("signer_keys", f"deal_signed_by_other_key:{deal}")
        record_findings = _record_findings(deal, member)
        for finding in record_findings:
            fail("member_records", finding)
        if record_findings:
            # A record that does not recompute: the copy cannot verify VALID on its own.
            fail("member_records", f"deal_invalid:{deal}")
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
    selected = selected_records(bundle)
    values = derive(selected, len(picked))
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
    if any(_does_not_check(f) for f in findings):
        state = "invalid"
    elif any(_not_shareable(f) for f in findings):
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
        "page_state": page_state(state),
        "findings": findings + mismatches,
        "properties": status,
        "holder_key": holder,
        "audience": audience,
        "recipient": recipient,
        "holder_stated": list(HOLDER_STATED),
        "signer_keys": dict(sorted(signers.items())),
        "deals": deals,
        "not_proven": not_proven(selected, audience),
        "values": values if state == "card" else None,
        "l0": l0_lines(values, step_counts(selected)) if state == "card" else None,
        "asserted": has_asserted,
        "mismatches": mismatches,
    }


def recompute_errors(bundle: Mapping) -> list[str]:
    """Every reason *bundle* is not a History this page can show, or ``[]``."""
    return check(bundle)["findings"]
