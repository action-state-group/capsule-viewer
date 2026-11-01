# SPDX-License-Identifier: Apache-2.0
"""The receipt's sides: whose records the receipt holds, and the case they
make (History card 9b, the receipt primitive).

Three cases, read from what the verifier reported, never from a label a
producer sets:

* ``both``, **stamped by both**: a composition carrying both parties'
  copies, every join deriving ``agree`` as declared, each agreement
  corroborating on declared custody, and both copies naming one deal;
* ``one_sided``, **your receipt only**: one party's copy, and the other
  party's member an ``absence`` (asked, nothing came back by the window's
  end), every join deriving ``one_sided``. Until the ``receipt_document``
  record kind is in the spec, the recorded ask is what makes this case; the
  document will add a line to it, not change it;
* ``limit``, **a declined ask**: the same, but the other party's member is
  their signed ``policy_declined`` refusal. capsulectl reads it INCOMPLETE
  and the verifier report gate passes it only for that reason
  (``verifier_report._declined_only``). It is the other party's limit on what
  they share, never a no to the deal and never a finding; any other refusal
  reason is no receipt;
* ``none``, **no record**: one copy and nothing from the other side.

Two copies that do not meet ``both`` are ``not_agreed``: their own state,
never drawn like ``both``.

Ours is drawn blue (the kit's ``info`` tone), theirs amber (``caution``)
and always labelled "as received", a missing side grey and dashed
(``neutral``). Nothing here is ever the ``negative`` tone: one side missing
is not a finding. Only the holder's own page (a ``keep`` copy) says "your"
and offers the actions, sentences the holder says to their agent.
"""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from ..composed import KIND, Composition, Corroboration, Join
from ..context import Json, VerifiedBundleContext
from ..verifier_report import POLICY_DECLINED
from .model import ReceiptUnavailable

CASES: tuple[str, ...] = ("both", "one_sided", "limit", "none", "not_agreed")
# The case line's tone; a holder's own single copy (``none``) draws no case
# line, only the missing side.
CASE_TONE: Mapping[str, str] = {"both": "positive", "one_sided": "caution", "limit": "neutral", "not_agreed": "neutral"}
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:T|$)")
# The actions a holder's page offers, per case, as wording keys.
ACTIONS: Mapping[str, tuple[str, ...]] = {
    "both": ("actions.dispute", "actions.send", "actions.show_theirs"),
    "one_sided": ("actions.send", "actions.ask_again"),
    "limit": ("actions.send",),
    "none": ("actions.send", "actions.ask"),
    "not_agreed": ("actions.dispute", "actions.send", "actions.show_theirs"),
}


@dataclass(frozen=True)
class Missing:
    """The other party's member when it is not a copy: the recorded ask that
    went unanswered (``absence``), or their signed refusal of it
    (``refusal``), read from the bundle (its digest reproduced)."""

    member: str
    role: str | None
    window: tuple[str, str]  # the absence's from and to; a refusal's issued_at twice
    kind: str = "absence"  # absence | refusal
    reason: str | None = None  # a refusal's reason


def _map(value: object) -> Mapping[str, Json]:
    return value if isinstance(value, Mapping) else {}


def _str(value: object) -> str | None:
    return value if isinstance(value, str) else None


def missing_member(context: VerifiedBundleContext, composition: Composition) -> Missing | None:
    """The composition's one ``absence`` member, or ``None``. Its body is read
    from the bundle's own block: ``composition_problem`` accepts only a
    carried body whose digest the verifier reproduced, and the verifier
    refuses an absence without its window. ``ReceiptUnavailable`` if not."""
    members = [m for m in composition.members if m.outcome in ("absence", "refusal")]
    if len(members) != 1:
        return None
    member = members[0]
    observer = composition.observer(member.observer)
    block = _map(_map(_map(context.bundle).get("extensions")).get(KIND))
    raws = block.get("members")
    raw = next((_map(r) for r in (raws if isinstance(raws, (list, tuple)) else ()) if _map(r).get("id") == member.id), {})
    if member.outcome == "refusal":
        body = _map(raw.get("refusal"))
        issued, reason = _str(body.get("issued_at")), _str(body.get("reason"))
        if issued is None or reason != POLICY_DECLINED or member.refusal_signature != "verified":
            raise ReceiptUnavailable(f"the refusal member {member.id!r} is not a verified {POLICY_DECLINED} refusal")
        return Missing(member=member.id, role=observer.role if observer else None, window=(issued, issued), kind="refusal", reason=reason)
    window = _map(_map(raw.get("absence")).get("window"))
    start, end = _str(window.get("from")), _str(window.get("to"))
    if start is None or end is None:
        raise ReceiptUnavailable(f"the absence member {member.id!r} carries no window")
    return Missing(member=member.id, role=observer.role if observer else None, window=(start, end))


def plain_date(value: str) -> str:
    """An RFC 3339 timestamp's date, as "Oct 9, 2026"; anything else as it is."""
    m = _DATE.match(value)
    if m is None or not 1 <= int(m.group(2)) <= 12:
        return value
    return f"{_MONTHS[int(m.group(2)) - 1]} {int(m.group(3))}, {m.group(1)}"


def two_copy_case(deal_state: str, joins: Sequence[tuple[Join, Corroboration | None]]) -> str:
    """``both`` when both copies name one deal and every join derived
    ``agree`` as declared, corroborating; else ``not_agreed``. No join is no
    agreement."""
    agreed = bool(joins) and all(
        j.derived == "agree" and j.result == "derived_matches" and c is not None and c.result == "corroborating" for j, c in joins
    )
    return "both" if deal_state == "agree" and agreed else "not_agreed"
