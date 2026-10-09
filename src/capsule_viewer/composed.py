# SPDX-License-Identifier: Apache-2.0
"""A ``composed/v1`` bundle as its verifier reported it, its carried parts as
contexts of their own, and the generic composition section.

Nothing here verifies. ``capsulectl verify --bundle`` verifies a composed/v1
block (draft-mih-zhang-agent-disclosure-bundle-01, "Verifying composed/v1",
through agent-action-capsule's ``go/bundle/composed.go``) and prints, beside
the containing bundle's claims: the recomputed composed digest, each member
(a carried member bundle assessed as its own Evidence Bundle), composition
closure, each join's declared and derived state, and per join whether an
agreement is redundant or corroborating on declared custody. This reads that
report:

* ``composition_from_capsulectl`` reads the block's result, with the observers
  as the block declares them (the report does not repeat them);
* ``carried_parts`` gives each carried artifact member its own context, from
  the member's own report, bound to the member's own bytes exactly as
  ``verifier_report`` binds a whole bundle. A part is only ever read through
  its own context: nothing of one part fills another;
* ``composition_section`` renders the result in agent-action-capsule's
  composition view words (``ts/src/composed-view.ts``): the core's generic
  surfacing of the block, with no product wording and no business role. An
  observer's ``role`` is shown as declared, uninterpreted.
"""
from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from html import escape

from .context import Frozen, Json, JsonObject, VerifiedBundleContext
from .kit.components import Markup
from .kit.contract import KitServices
from .verifier_report import Assurance, CapsulectlReport, VerifierReportError, context_from_bundle_report

KIND = "composed/v1"
NOT_APPLICABLE = "—"
SCOPE = "Composition closure covers the declared members only; it is not completeness of participation."
CUSTODY = (
    "Custody domains are labels declared by whoever composed this block. Identical labels make an agreeing pair "
    "redundant; distinct labels do not establish that two observers are independent."
)
_MEMBER_CLAIMS = ("graph_closure", "interval_coverage", "per_record_membership")


@dataclass(frozen=True)
class Claim:
    status: str
    findings: tuple[str, ...] = ()

    def text(self) -> str:
        return f"{self.status} ({', '.join(self.findings)})" if self.findings else self.status


@dataclass(frozen=True)
class Member:
    id: str
    observer: str
    outcome: str  # artifact | refusal | absence
    body: str  # carried | declared_missing | absent
    digest: str  # reproduced | mismatch | not_shown
    findings: tuple[str, ...]
    claims: tuple[Claim, ...] | None  # a carried artifact's graph closure, interval coverage, membership
    refusal_signature: str | None
    report: CapsulectlReport | None  # a carried artifact's own bundle report, as printed


@dataclass(frozen=True)
class Observer:
    id: str
    role: str
    custody_domain: str


@dataclass(frozen=True)
class JoinValue:
    member: str
    resolved: bool
    value: Json = None


@dataclass(frozen=True)
class Difference:
    pointer: str
    values: tuple[JoinValue, ...]


@dataclass(frozen=True)
class Join:
    members: tuple[str, str]
    basis: str
    declared: str
    derived: str | None  # None: not derivable
    result: str  # derived_matches | join_state_mismatch | not_derivable
    differences: tuple[Difference, ...]


@dataclass(frozen=True)
class Corroboration:
    members: tuple[str, str]
    result: str  # corroborating | redundant | not_applicable
    reasons: tuple[str, ...] = ()
    report: str | None = None


@dataclass(frozen=True)
class Composition:
    """One composed/v1 block's verification, as reported. A malformed block
    reports its status and findings only (``malformed``)."""

    status: str
    findings: tuple[str, ...]
    malformed: bool
    digest_declared: str = ""
    digest_recomputed: str = ""
    digest_matches: bool = False
    members: tuple[Member, ...] = ()
    observers: tuple[Observer, ...] = ()
    closure: Claim = Claim("fail")
    closure_missing: tuple[str, ...] = ()
    joins: tuple[Join, ...] = ()
    corroboration: tuple[Corroboration, ...] = ()

    def member(self, member_id: str) -> Member | None:
        return next((m for m in self.members if m.id == member_id), None)

    def observer(self, observer_id: str) -> Observer | None:
        return next((o for o in self.observers if o.id == observer_id), None)


@dataclass(frozen=True)
class Part:
    """A carried artifact member, as a bundle of its own."""

    member: Member
    observer: Observer | None
    context: VerifiedBundleContext
    assurance: Assurance


# ---- readers ----------------------------------------------------------------


def _map(value: object) -> Mapping[str, Json]:
    return value if isinstance(value, Mapping) else {}


def _list(value: object) -> Sequence[Json]:
    return value if isinstance(value, Sequence) and not isinstance(value, str) else ()


def _strings(value: object) -> tuple[str, ...]:
    return tuple(str(v) for v in _list(value))


def _claim(value: object) -> Claim:
    raw = _map(value)
    return Claim(str(raw.get("status")), _strings(raw.get("findings")))


def _pair(value: object) -> tuple[str, str]:
    a, b = (_strings(value) + ("", ""))[:2]
    return a, b


def _member(raw: Mapping[str, Json]) -> Member:
    report = raw.get("bundle")
    claims = tuple(_claim(_map(report).get(name)) for name in _MEMBER_CLAIMS) if isinstance(report, Mapping) else None
    signature = _map(raw.get("refusal_signature")).get("status")
    return Member(
        id=str(raw.get("id")),
        observer=str(raw.get("observer")),
        outcome=str(raw.get("outcome")),
        body=str(raw.get("body")),
        digest=str(raw.get("digest")),
        findings=_strings(raw.get("findings")),
        claims=claims,
        refusal_signature=signature if isinstance(signature, str) else None,
        report=report if isinstance(report, Mapping) else None,
    )


def _join(raw: Mapping[str, Json]) -> Join:
    differences = tuple(
        Difference(
            str(d.get("pointer")),
            tuple(
                JoinValue(str(v.get("member")), v.get("resolved") is True, v.get("value"))
                for v in (_map(v) for v in _list(d.get("values")))
            ),
        )
        for d in (_map(d) for d in _list(raw.get("differences")))
    )
    derived = raw.get("derived")
    return Join(
        members=_pair(raw.get("members")),
        basis=str(raw.get("basis")),
        declared=str(raw.get("declared")),
        derived=derived if isinstance(derived, str) else None,
        result=str(raw.get("result")),
        differences=differences,
    )


def _corroboration(raw: Mapping[str, Json]) -> Corroboration:
    report = raw.get("report")
    return Corroboration(_pair(raw.get("members")), str(raw.get("result")), _strings(raw.get("reasons")), report if isinstance(report, str) else None)


def composition_from_capsulectl(bundle: JsonObject, output: CapsulectlReport) -> Composition | None:
    """The composed/v1 result in *output* (``capsulectl verify --bundle``'s
    report on *bundle*), or ``None`` when it reports no composed/v1 block.
    Call it with a report ``context_from_capsulectl`` accepted for the same
    bundle: that is what binds the report to these bytes."""
    entry = next((e for e in _list(output.get("extensions")) if _map(e).get("kind") == KIND), None)
    if entry is None:
        return None
    raw = _map(_map(entry).get("composed"))
    if not raw:
        raise VerifierReportError("the report names a composed/v1 block and carries no result for it")
    if "composed_digest" not in raw:  # a malformed block reports nothing else
        return Composition(str(raw.get("status")), _strings(raw.get("findings")), malformed=True)
    digest = _map(raw.get("composed_digest"))
    closure = _map(raw.get("composition_closure"))
    declared = _map(_map(bundle.get("extensions")).get(KIND))
    return Composition(
        status=str(raw.get("status")),
        findings=_strings(raw.get("findings")),
        malformed=False,
        digest_declared=str(digest.get("declared")),
        digest_recomputed=str(digest.get("recomputed") or ""),
        digest_matches=digest.get("matches") is True,
        members=tuple(_member(_map(m)) for m in _list(raw.get("members"))),
        observers=tuple(
            Observer(str(o.get("id")), str(o.get("role")), str(o.get("custody_domain")))
            for o in (_map(o) for o in _list(declared.get("observers")))
        ),
        closure=_claim(closure),
        closure_missing=_strings(closure.get("missing")),
        joins=tuple(_join(_map(j)) for j in _list(raw.get("joins"))),
        corroboration=tuple(_corroboration(_map(c)) for c in _list(raw.get("corroboration"))),
    )


def thaw(value: Frozen) -> Json:
    """A context's frozen JSON as plain JSON again."""
    if isinstance(value, Mapping):
        return {k: thaw(v) for k, v in value.items()}
    if isinstance(value, tuple):
        return [thaw(v) for v in value]
    return value


def carried_parts(context: VerifiedBundleContext, composition: Composition) -> tuple[Part, ...]:
    """Each artifact member *context*'s composed/v1 block carries, in block
    order, as a context of its own built from that member's report.
    ``VerifierReportError`` when a carried member has no report, or a report
    that is not for exactly its bytes."""
    block = _map(_map(_map(context.bundle).get("extensions")).get(KIND))
    parts = []
    for raw in _list(block.get("members")):
        raw = _map(raw)
        body = raw.get("bundle")
        if raw.get("outcome") != "artifact" or not isinstance(body, Mapping):
            continue
        member = composition.member(str(raw.get("id")))
        if member is None or member.report is None:
            raise VerifierReportError(f"the report assesses no carried bundle for member {raw.get('id')!r}")
        part_context, assurance = context_from_bundle_report(thaw(body), member.report)
        parts.append(Part(member, composition.observer(member.observer), part_context, assurance))
    return tuple(parts)


# ---- the generic composition section ----------------------------------------


def _pair_text(members: tuple[str, str]) -> str:
    return f"{members[0]} – {members[1]}"


def _findings(findings: Sequence[str]) -> str:
    return ", ".join(findings) if findings else "none"


def _corroboration_text(c: Corroboration) -> str:
    if c.result == "redundant":
        return f"{c.report or 'redundant, not corroborating'} ({', '.join(c.reasons)})"
    if c.result == "corroborating":
        return "corroborating, on declared custody"
    return "not applicable: the join did not derive agree"


def _value_text(v: JoinValue) -> str:
    if not v.resolved:
        return f"{v.member}: does not resolve"
    return f"{v.member}: {json.dumps(v.value, ensure_ascii=False, separators=(',', ':'))}"


def _el(tag: str, *children: str, **attrs: str) -> Markup:
    rendered = "".join(f' {k.replace("_", "-")}="{escape(v, quote=True)}"' for k, v in attrs.items())
    return Markup(f"<{tag}{rendered}>") + Markup("").join(children) + Markup(f"</{tag}>")


def _p(text: str, **attrs: str) -> Markup:
    return _el("p", text, **attrs)


def composition_section(c: Composition, kit: KitServices) -> Markup:
    """agent-action-capsule's composition section, in its words, over *c*."""
    out: list[str] = [_p(f"composed/v1 check: {c.status}", data_composition_status=c.status)]
    if c.findings:
        out.append(_p(f"findings: {', '.join(c.findings)}"))
    if c.malformed:
        return kit.section("Composition", *out, level=3)
    out.append(_p(SCOPE))
    out.append(
        kit.section(
            "Composed digest",
            kit.data_table(
                ["declared", "recomputed", "matches"],
                [[c.digest_declared, c.digest_recomputed or "uncomputable", "yes" if c.digest_matches else "no"]],
            ),
            level=4,
        )
    )
    rows = [
        [
            m.id,
            m.observer,
            m.outcome,
            m.body,
            m.digest,
            *([claim.text() for claim in m.claims] if m.claims is not None else [NOT_APPLICABLE] * 3),
            m.refusal_signature or NOT_APPLICABLE,
            _findings(m.findings),
        ]
        for m in c.members
    ]
    out.append(
        kit.section(
            "Members",
            kit.data_table(
                ["member", "observer", "outcome", "body", "digest", "graph closure", "interval coverage",
                 "per-record membership", "refusal signature", "findings"],
                rows,
            ),
            level=4,
        )
    )
    out.append(
        kit.section(
            "Observers",
            kit.data_table(["observer", "role", "custody domain"], [[o.id, o.role, o.custody_domain] for o in c.observers]),
            _p(CUSTODY),
            level=4,
        )
    )
    missing = ", ".join(c.closure_missing) if c.closure_missing else "none"
    out.append(
        kit.section(
            "Composition closure",
            _p(f"{c.closure.status}; missing: {missing}; findings: {_findings(c.closure.findings)}", data_closure_status=c.closure.status),
            level=4,
        )
    )
    if not c.joins:
        out.append(kit.section("Joins", _p("No joins."), level=4))
        return kit.section("Composition", *out, level=3)
    joins: list[str] = [
        kit.data_table(
            ["members", "basis", "declared", "derived", "result"],
            [[_pair_text(j.members), j.basis, j.declared, j.derived or "not derivable", j.result] for j in c.joins],
        )
    ]
    for j in c.joins:
        if j.differences:
            lists = [
                _el("dl", _el("dt", d.pointer), *(_el("dd", _value_text(v)) for v in d.values), data_pointer=d.pointer)
                for d in j.differences
            ]
            joins.append(kit.drilldown(f"Differing values: {_pair_text(j.members)}", *lists))
    out.append(kit.section("Joins", *joins, level=4))
    out.append(
        kit.section(
            "Agreement",
            kit.data_table(["members", "result"], [[_pair_text(x.members), _corroboration_text(x)] for x in c.corroboration]),
            level=4,
        )
    )
    return kit.section("Composition", *out, level=3)
