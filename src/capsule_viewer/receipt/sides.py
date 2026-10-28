# SPDX-License-Identifier: Apache-2.0
"""The receipt's sides: whose records the receipt holds, and the case they
make (History card 9b, the receipt primitive).

Three cases, read from what the verifier reported, never from a label a
producer sets:

* ``both``, **stamped by both**: a composition carrying both parties'
  copies, every join deriving ``agree`` as declared, each agreement
  corroborating on declared custody, and both copies naming one deal;
* ``one_sided``, **your receipt only**: one party's copy, and the other
  party's member an ``absence`` (asked, nothing came back) or a
  ``refusal`` (a signed no), every join deriving ``one_sided``. Until the
  ``receipt_document`` record kind is in the spec, the recorded ask is what
  makes this case; the document will add a line to it, not change it;
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

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from ..composed import KIND, Composition, Corroboration, Join
from ..context import Json, VerifiedBundleContext

CASES: tuple[str, ...] = ("both", "one_sided", "none", "not_agreed")
CASE_TONE: Mapping[str, str] = {"both": "positive", "one_sided": "caution", "none": "neutral", "not_agreed": "neutral"}
# The actions a holder's page offers, per case, as wording keys.
ACTIONS: Mapping[str, tuple[str, ...]] = {
    "both": ("actions.dispute", "actions.send", "actions.show_theirs"),
    "one_sided": ("actions.send", "actions.ask_again"),
    "none": ("actions.send", "actions.ask_again"),
    "not_agreed": ("actions.dispute", "actions.send", "actions.show_theirs"),
}


@dataclass(frozen=True)
class Missing:
    """The other party's member when it is not a copy: what the composition
    declares for it, read from the bundle (its digest reproduced)."""

    member: str
    role: str | None
    outcome: str  # absence | refusal
    window: tuple[str, str] | None = None  # an absence's from and to
    reason: str | None = None  # a refusal's reason


def _map(value: object) -> Mapping[str, Json]:
    return value if isinstance(value, Mapping) else {}


def _str(value: object) -> str | None:
    return value if isinstance(value, str) else None


def missing_member(context: VerifiedBundleContext, composition: Composition) -> Missing | None:
    """The composition's one member that is not an artifact, or ``None``.
    Its body is read from the bundle's own block; the verifier reproduced
    its digest (``composition_problem`` checks), so the body is the one the
    composer declared."""
    members = [m for m in composition.members if m.outcome != "artifact"]
    if len(members) != 1:
        return None
    member = members[0]
    observer = composition.observer(member.observer)
    block = _map(_map(_map(context.bundle).get("extensions")).get(KIND))
    raws = block.get("members")
    raw = next((_map(r) for r in (raws if isinstance(raws, (list, tuple)) else ()) if _map(r).get("id") == member.id), {})
    body = _map(raw.get(member.outcome))
    window = _map(body.get("window"))
    start, end = _str(window.get("from")), _str(window.get("to"))
    return Missing(
        member=member.id,
        role=observer.role if observer else None,
        outcome=member.outcome,
        window=(start, end) if start is not None and end is not None else None,
        reason=_str(body.get("reason")),
    )


def two_copy_case(deal_state: str, joins: Sequence[tuple[Join, Corroboration | None]]) -> str:
    """``both`` when both copies name one deal and every join derived
    ``agree`` as declared, corroborating; else ``not_agreed``. No join is no
    agreement."""
    agreed = bool(joins) and all(
        j.derived == "agree" and j.result == "derived_matches" and c is not None and c.result == "corroborating" for j, c in joins
    )
    return "both" if deal_state == "agree" and agreed else "not_agreed"
