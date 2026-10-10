# SPDX-License-Identifier: Apache-2.0
"""The receipt model: what a deal receipt shows, read from a verified context.

Two sources, never mixed up:

* **The sealed steps.** Each deal step is a record whose ``agent_input`` is an
  ``x-deal-v0`` record (``record_type`` baseline, check, verdict, approval,
  action, claim, ...). A step is shown by what the verifier resolved for it:
  ``disclosed`` (its facts are read from the disclosed payload), ``withheld``
  (only its identity and its place in the log) or ``not_present`` (the receipt
  cites it and the bundle does not carry it). Facts are ids, enums, amounts
  and short values; no prose is read from a step.
* **The sealed report.** capsulectl seals a ``deal_report`` record whenever it
  makes a receipt, one per audience, holding its own lines that summarise the
  steps. The bundle's ``x-deal-v0`` extension names it (``sealed_report``).
  Its lines are shown as the producer's sealed text (presentation contract
  section 7.1, mechanism 3) only when that record is disclosed, and only when
  no other ``deal_report`` is disclosed beside it: a second one means the text
  was swapped, and the module declines.

What a relying party gets is the share builder's decision, made when the copy
was cut. The model shows the outcome of that decision step by step and never
makes it. Committed words (what the user asked; what the user's agent told a
buyer) are shown only when their opening recomputes to the sealed commitment.
The model knows which commitment pairs with which opening; the recomputation
itself is the core's service (``capsule_viewer.binding.check_opening``),
handed in as ``bind``. The commitment is the one the verified record seals,
and the record is the one the verifier's report names for this exact bundle
(``verifier_report`` refuses a report for any other bytes).
"""
from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass

from ..binding import BindingState
from ..context import Frozen, VerifiedBundleContext
from ..kit.components import VerificationResult
from ..verifier_report import Assurance

EXTENSION = "x-deal-v0"
REPORT_TYPE = "deal_report"
# The action id capsulectl gives every report record; a withheld report is
# recognised by it, since its payload is not in the copy.
REPORT_ACTION_ID = "capsulectl-deal-report"
# L1's step sections, in page order. A disclosed step is placed by its sealed
# record_type; a withheld one by the report's name for it (its ``kind``).
SECTIONS: tuple[str, ...] = ("authorized", "proposed", "approved", "acted", "statements", "other")
_SECTION_BY_RECORD_TYPE = {
    "baseline": "authorized",
    "check": "proposed",
    "verdict": "proposed",
    "approval": "approved",
    "action": "acted",
    "claim": "statements",
    "task_authority": "authorized",
}
# A typed record (capsulectl ``--records typed``) names its kind in its own
# ``type``; each carries the body of the x-deal-v0 record type it stands for.
_RECORD_TYPE_BY_TYPED = {
    "proposed-action/v0": "check",
    "action-evaluation/v0": "verdict",
    "action-approval/v0": "approval",
    "action-record/v0": "action",
    "task-authority/v0": "task_authority",
}
_SECTION_BY_STEP_KIND = {
    "open": "authorized",
    "snapshot": "proposed",
    "check": "proposed",
    "approval": "approved",
    "act": "acted",
    "claim": "statements",
}
# Zero- and three-decimal ISO 4217 currencies; every other code has two.
_EXPONENT = {
    **dict.fromkeys(
        ("BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"), 0
    ),
    **dict.fromkeys(("BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"), 3),
}
Binder = Callable[[Frozen, Frozen, Frozen], BindingState]


@dataclass(frozen=True)
class LogPlace:
    log_id: str
    seq: int
    leaf_index: int


@dataclass(frozen=True)
class Fact:
    """One value read from a disclosed step. ``kind`` is how it is shown:
    ``token`` (an id or enum, verbatim), ``amount`` (already formatted from
    minor units) or ``count``."""

    name: str
    value: str
    kind: str = "token"


@dataclass(frozen=True)
class Step:
    capsule_id: str
    disclosure: str  # disclosed | withheld | not_present
    section: str
    record_type: str | None  # as sealed; None unless disclosed
    log: LogPlace | None
    key_id: str | None  # from the record header, carried even when withheld
    facts: tuple[Fact, ...] = ()
    # The sealed report's line for this step, its time and position.
    line: str | None = None
    at: str | None = None
    n: int | None = None


@dataclass(frozen=True)
class Committed:
    """Committed words: ``state`` is the binding check's outcome (opened,
    committed, mismatch) or the step's disclosure (withheld, not_present).
    ``text`` is set only when ``state`` is ``opened``."""

    state: str
    step: str | None
    text: str | None = None
    label: str | None = None  # a statement's class, as sealed


@dataclass(frozen=True)
class Item:
    """A line of the sealed report and the steps it was read from."""

    text: str
    steps: tuple[str, ...] = ()
    at: str | None = None
    flagged: bool = False


@dataclass(frozen=True)
class Merchant:
    order_id: str | None
    verified: bool
    merchant_says: str
    we_say: str
    key_supplied: bool
    approved_basis: str | None
    rows: tuple[tuple[str, str], ...]  # (row key, value as the report states it)
    steps: tuple[str, ...]


@dataclass(frozen=True)
class Cancellation:
    proven: tuple[str, ...]
    not_proven: tuple[str, ...]
    confirmed: bool
    steps: tuple[str, ...]


@dataclass(frozen=True)
class Report:
    """The sealed report's lines: capsulectl's words for one audience."""

    capsule_id: str
    audience: str
    state: str | None
    did: tuple[Item, ...]
    money: str | None
    lifecycle: str | None
    later: tuple[Item, ...]
    may_change: str | None
    as_of: str | None
    scope: str | None
    did_line: str | None
    instructions: str | None
    told: tuple[Item, ...]
    deadlines: tuple[Item, ...]
    deadline_note: str | None
    cancellations: tuple[Cancellation, ...]
    merchant: tuple[Merchant, ...]
    email_scope: str | None
    agent_anomalies: tuple[Item, ...]
    counterparty_anomalies: tuple[Item, ...]
    withheld: tuple[str, ...]


@dataclass(frozen=True)
class Headline:
    """L0. Each part is a fact or the disclosure state that stands for it."""

    deal_type: Fact | str
    item: Fact | str
    amount: Fact | str
    state: str | None


@dataclass(frozen=True)
class ReceiptModel:
    deal_id: str
    demo: bool
    headline: Headline
    asked: Committed
    statements: tuple[Committed, ...]
    steps: tuple[Step, ...]  # every record carried and every step cited, report records last
    report: Report
    producers: tuple[str | None, ...]  # distinct, in record order; None = not recorded
    bundle_digest: str | None  # the digest the verifier's report is bound to
    witnessed: str  # the verifier's witnesses claim, or "absent"
    countersignatures: tuple[str, ...]  # each countersignature result's status
    verification: VerificationResult

    def step(self, capsule_id: str) -> Step | None:
        return next((s for s in self.steps if s.capsule_id == capsule_id), None)


class ReceiptUnavailable(Exception):
    """The context holds no receipt the module can show."""


# ---- small readers ----------------------------------------------------------


def _str(value: Frozen) -> str | None:
    return value if isinstance(value, str) else None


def _int(value: Frozen) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _strings(value: Frozen) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value,)
    return tuple(v for v in value if isinstance(v, str)) if isinstance(value, tuple) else ()


def _map(value: Frozen) -> Mapping[str, Frozen]:
    return value if isinstance(value, Mapping) else {}


def _seq(value: Frozen) -> tuple[Frozen, ...]:
    return value if isinstance(value, tuple) else ()


def format_amount(minor: int, currency: str) -> str:
    """Minor units as a decimal amount and its code: ``627, USD`` -> ``6.27 USD``."""
    exponent = _EXPONENT.get(currency, 2)
    sign = "-" if minor < 0 else ""
    whole, part = divmod(abs(minor), 10**exponent)
    return f"{sign}{whole}.{part:0{exponent}d} {currency}" if exponent else f"{sign}{whole} {currency}"


def _amount(name: str, minor: Frozen, currency: Frozen) -> Fact | None:
    m, c = _int(minor), _str(currency)
    return Fact(name, format_amount(m, c), "amount") if m is not None and c else None


def _token(name: str, value: Frozen) -> Fact | None:
    if isinstance(value, bool):
        return Fact(name, "true" if value else "false")
    if isinstance(value, int):
        return Fact(name, str(value), "count")
    if isinstance(value, str) and value:
        return Fact(name, value)
    if isinstance(value, tuple) and value and all(isinstance(v, str) for v in value):
        return Fact(name, ", ".join(value))
    return None


def _facts(record_type: str | None, body: Mapping[str, Frozen]) -> tuple[Fact, ...]:
    """The facts a step of *record_type* shows, from its disclosed body. A type
    this module does not know shows none: its type and identity are still
    shown, never its payload."""
    terms = _map(body.get("terms"))
    currency = body.get("currency") or terms.get("currency")
    if record_type == "baseline":
        intent = _map(body.get("intent"))
        found = [
            _token("deal_type", body.get("deal_type")),
            *(_token(f"asked.{key}", value) for key, value in sorted(_map(intent.get("asked")).items())),
            _token("allowed", intent.get("allowed")),
            _token("item", terms.get("item")),
            _token("quantity", terms.get("quantity")),
            _amount("price", terms.get("price_minor"), terms.get("currency")),
            _token("expect_close_by", body.get("expect_close_by")),
        ]
    elif record_type == "check":
        found = [
            _token("action", body.get("action")),
            _token("action_class", body.get("action_class")),
            _amount("amount", body.get("amount_minor"), currency),
            _amount("authorized_max", body.get("authorized_max_minor"), currency),
            _token("item", terms.get("item")),
            _token("quantity", terms.get("quantity")),
            _token("material_fields_changed", body.get("material_fields_changed")),
            _token("offer_fields_changed", body.get("offer_fields_changed")),
        ]
    elif record_type == "verdict":
        differences = body.get("differences")
        found = [
            _token("result", body.get("result")),
            _token("disposition", body.get("disposition")),
            Fact("differences", str(len(differences)), "count") if isinstance(differences, tuple) else None,
            _token("judge", _map(body.get("judge")).get("kind")),
            _token("rules", _map(body.get("rules")).get("status")),
            _token("notes", body.get("notes")),
        ]
    elif record_type == "approval":
        found = [_token("approver", body.get("approver")), _token("choice", body.get("choice"))]
    elif record_type == "action":
        found = [
            _token("action", body.get("action")),
            _amount("amount", body.get("amount_minor"), currency),
            _token("direction", body.get("direction")),
            _token("rail", body.get("rail")),
        ]
    elif record_type == "claim":
        found = [_token("class", body.get("class")), _token("source_kind", body.get("source_kind"))]
    else:
        found = []
    return tuple(f for f in found if f is not None)


# ---- the report -------------------------------------------------------------


def _items(raw: Frozen, steps_key: str = "steps") -> tuple[Item, ...]:
    out = []
    for entry in _seq(raw):
        entry = _map(entry)
        text = _str(entry.get("text"))
        if text is not None:
            out.append(Item(text, _strings(entry.get(steps_key)), _str(entry.get("at"))))
    return tuple(out)


def _deadline(d: Mapping[str, Frozen]) -> Item:
    when = _str(d.get("cancel_by")) or _str(d.get("due_by")) or ""
    marking = _str(d.get("marking")) or _str(d.get("status")) or ""
    text = f"{when} · {marking}: {_str(d.get('text')) or ''}. {_str(d.get('holds')) or ''}".strip()
    return Item(text, flagged=d.get("status") in ("open", "carried_at_close"))


_MERCHANT_ROWS = ("approved", "agent_reported", "charged", "charged_on", "cancel_by", "domains", "key_size")


def _merchant(m: Mapping[str, Frozen]) -> Merchant:
    rows = tuple((key, _str(m.get(key)) or "") for key in _MERCHANT_ROWS if _str(m.get(key)))
    items = _strings(m.get("items"))
    if items:
        rows += (("items", " · ".join(items)),)
    return Merchant(
        order_id=_str(m.get("order_id")),
        verified=m.get("verified") is True,
        merchant_says=_str(m.get("merchant_says")) or "",
        we_say=_str(m.get("we_say")) or "",
        key_supplied=m.get("key_source") == "supplied",
        approved_basis=_str(m.get("approved_basis")),
        rows=rows,
        steps=_strings(m.get("steps")),
    )


def _told(t: Mapping[str, Frozen]) -> Item:
    parts = (_str(t.get("text")), _str(t.get("at")), _str(t.get("authority_text")))
    return Item(" · ".join(p for p in parts if p), _strings(t.get("steps")), flagged=t.get("authority") == "none")


def _report(capsule_id: str, raw: Mapping[str, Frozen]) -> Report:
    life = _map(raw.get("lifecycle"))
    deadlines = [_map(d) for d in _seq(raw.get("deadlines"))]
    anomalies = [_map(a) for a in _seq(raw.get("anomalies"))]

    def side(name: str) -> tuple[Item, ...]:
        return tuple(Item(_str(a.get("text")) or "", _strings(a.get("steps")), flagged=True) for a in anomalies if a.get("side") == name)

    return Report(
        capsule_id=capsule_id,
        audience=_str(raw.get("audience")) or "",
        state=_str(life.get("state")),
        did=_items(raw.get("did")),
        money=_str(_map(raw.get("money")).get("text")),
        lifecycle=_str(life.get("text")),
        later=_items(life.get("later"), "capsule_id"),
        may_change=_str(life.get("may_change")),
        as_of=_str(life.get("as_of")),
        scope=_str(raw.get("scope")),
        did_line=_str(raw.get("did_line")),
        instructions=_str(raw.get("instructions")),
        told=tuple(_told(_map(t)) for t in _seq(raw.get("told"))),
        deadlines=tuple(_deadline(d) for d in deadlines),
        deadline_note=_str(deadlines[0].get("note")) if deadlines else None,
        cancellations=tuple(
            Cancellation(_strings(c.get("proven")), _strings(c.get("not_proven")), c.get("merchant") == "confirmed", _strings(c.get("steps")))
            for c in (_map(c) for c in _seq(raw.get("cancellations")))
        ),
        merchant=tuple(_merchant(_map(m)) for m in _seq(raw.get("merchant"))),
        email_scope=_str(raw.get("email_scope")),
        agent_anomalies=side("agent"),
        counterparty_anomalies=side("counterparty"),
        withheld=_strings(raw.get("withheld")),
    )


# ---- the receipt ------------------------------------------------------------


class _Reader:
    """The context, read once: headers by id and disclosed deal payloads."""

    def __init__(self, context: VerifiedBundleContext) -> None:
        self.context = context
        records = _seq(_map(context.bundle).get("records"))
        self.headers: dict[str, Mapping[str, Frozen]] = {
            r["capsule_id"]: r for r in (_map(r) for r in records) if isinstance(r.get("capsule_id"), str)
        }

    def payload(self, capsule_id: str) -> Mapping[str, Frozen] | None:
        value = self.context.disclosed(capsule_id, "agent_input")
        return value if isinstance(value, Mapping) else None

    def disclosure(self, capsule_id: str) -> str:
        if capsule_id not in self.headers:
            return "not_present"
        return "disclosed" if self.payload(capsule_id) is not None else "withheld"

    def is_report(self, capsule_id: str) -> bool:
        payload = self.payload(capsule_id)
        if payload is not None:
            return payload.get("type") == REPORT_TYPE
        return self.headers.get(capsule_id, {}).get("action_id") == REPORT_ACTION_ID

    def log(self, capsule_id: str) -> LogPlace | None:
        coords = _map(_map(self.context.memberships.get(capsule_id)).get("log_coordinates"))
        log_id, seq, leaf = _str(coords.get("log_id")), _int(coords.get("seq")), _int(coords.get("leaf_index"))
        return LogPlace(log_id, seq, leaf) if log_id is not None and seq is not None and leaf is not None else None

    def sealed_report(self) -> tuple[str, Mapping[str, Frozen]]:
        extension = _map(_map(_map(self.context.bundle).get("extensions")).get(EXTENSION))
        named = _str(extension.get("sealed_report"))
        if named is None:
            raise ReceiptUnavailable("the x-deal-v0 extension names no sealed report")
        disclosed = [cid for cid in self.context.records if self.is_report(cid) and self.payload(cid) is not None]
        if disclosed != [named]:
            raise ReceiptUnavailable(f"disclosed deal reports {disclosed} are not exactly the named one, {named}")
        report = (self.payload(named) or {}).get("report")
        if not isinstance(report, Mapping):
            raise ReceiptUnavailable("the sealed report carries no report object")
        return named, report


def _step(reader: _Reader, capsule_id: str, entry: Mapping[str, Frozen]) -> Step:
    payload = reader.payload(capsule_id)
    record_type = None
    body: Mapping[str, Frozen] = {}
    if payload is not None:
        typed = _str(payload.get("type"))
        record_type = (
            _str(_map(payload.get(EXTENSION)).get("record_type"))
            or _str(payload.get("record_type"))
            or (typed if typed in _RECORD_TYPE_BY_TYPED else None)
        )
        body = _map(payload.get("body"))
    kind = _RECORD_TYPE_BY_TYPED.get(record_type or "", record_type)
    if kind is not None:
        section = _SECTION_BY_RECORD_TYPE.get(kind, "other")
    else:
        section = _SECTION_BY_STEP_KIND.get(_str(entry.get("kind")) or "", "other")
    disclosure = reader.disclosure(capsule_id)
    return Step(
        capsule_id=capsule_id,
        disclosure=disclosure,
        section=section,
        record_type=record_type,
        log=reader.log(capsule_id),
        key_id=_str(reader.headers.get(capsule_id, {}).get("key_id")),
        facts=_facts(kind, body),
        line=_str(entry.get("line")),
        at=_str(entry.get("at")),
        n=_int(entry.get("n")),
    )


def _producer(payload: Mapping[str, Frozen]) -> str | None:
    """Who sealed a disclosed step, as it says: its x-deal-v0 block's producer
    or (a typed record) its own header's."""
    producer = _map(_map(payload.get(EXTENSION)).get("producer") or payload.get("producer"))
    version = _str(producer.get("version"))
    if version is None:
        return None
    return f"{_str(producer.get('name')) or 'capsulectl'} {version} ({_str(producer.get('commit')) or 'unknown'})"


def _committed(
    reader: _Reader,
    step_id: str | None,
    commitment_of: Callable[[Mapping[str, Frozen]], Frozen],
    nonce: Frozen,
    text: Frozen,
    bind: Binder,
    label: str | None = None,
) -> Committed:
    if step_id is None or reader.disclosure(step_id) == "not_present":
        return Committed("not_present", step_id, label=label)
    payload = reader.payload(step_id)
    if payload is None:
        return Committed("withheld", step_id, label=label)
    state = bind(commitment_of(payload), nonce, text)
    return Committed(state, step_id, _str(text) if state == "opened" else None, label)


def _asked(reader: _Reader, raw: Mapping[str, Frozen], bind: Binder) -> Committed:
    opening = _map(raw.get("asked_opening"))
    return _committed(
        reader,
        _str(raw.get("asked_step")),
        lambda p: _map(_map(p.get("body")).get("intent")).get("verbatim_commitment"),
        opening.get("nonce"),
        opening.get("text"),
        bind,
    )


def _statements(reader: _Reader, raw: Mapping[str, Frozen], bind: Binder) -> tuple[Committed, ...]:
    """What the user's agent told the other side, each statement's words checked
    against the commitment its sealed step carries. A statement that is not the
    agent's own is never shown as said: it is a mismatch."""
    out = []
    for r in (_map(r) for r in _seq(raw.get("representations"))):
        index = _int(r.get("index"))

        def claim_of(payload: Mapping[str, Frozen], index: int | None = index) -> Mapping[str, Frozen]:
            body = _map(payload.get("body"))
            if index is None:
                return body
            claims = _seq(body.get("claims"))
            return _map(claims[index]) if 0 <= index < len(claims) else {}

        def commitment_of(payload: Mapping[str, Frozen], claim_of=claim_of) -> Frozen:
            claim = claim_of(payload)
            return claim.get("text_commitment") if claim.get("source_kind") == "agent" else None

        step_id = _str(r.get("step"))
        payload = reader.payload(step_id) if step_id else None
        label = _str(claim_of(payload).get("class")) if payload is not None else None
        out.append(_committed(reader, step_id, commitment_of, r.get("nonce"), r.get("text"), bind, label))
    return tuple(out)


def _part(step: Step | None, name: str) -> Fact | str:
    if step is None:
        return "not_present"
    if step.disclosure != "disclosed":
        return step.disclosure
    return next((f for f in step.facts if f.name == name), "not_present")


def _headline(steps: tuple[Step, ...], root: str | None, report: Report) -> Headline:
    opened = next((s for s in steps if s.section == "authorized"), None)
    item = _part(opened, "item")
    if item == "not_present":
        item = _part(opened, "asked.item")
    root_step = next((s for s in steps if s.capsule_id == root), None)
    acted = root_step if root_step is not None and root_step.section == "acted" else next(
        (s for s in reversed(steps) if s.section == "acted"), None
    )
    return Headline(_part(opened, "deal_type"), item, _part(acted, "amount"), report.state)


def sealed_report(context: VerifiedBundleContext) -> tuple[str, Mapping[str, Frozen]]:
    """The copy's sealed report: its record id and its report object, read as
    ``build_receipt`` reads it; ``ReceiptUnavailable`` when there is none."""
    return _Reader(context).sealed_report()


def copy_audience(context: VerifiedBundleContext) -> str:
    """The audience the copy in *context* was cut for, as its own sealed report
    names it; ``ReceiptUnavailable`` when it carries no readable sealed report."""
    _, raw = _Reader(context).sealed_report()
    audience = _str(raw.get("audience"))
    if audience is None:
        raise ReceiptUnavailable("the sealed report names no audience")
    return audience


def named_deals(context: VerifiedBundleContext) -> frozenset[str]:
    """Every deal the copy's disclosed records name: per record its deal id,
    else its chain id (typed records carry only a chain id). One copy of one
    deal names exactly one."""
    named = set()
    for cid in context.records:
        payload = context.disclosed(cid, "agent_input")
        if not isinstance(payload, Mapping):
            continue
        deal = _str(_map(payload.get(EXTENSION)).get("deal_id")) or _str(payload.get("deal_id")) or _str(payload.get("chain_id"))
        if deal is not None:
            named.add(deal)
    return frozenset(named)


def build_receipt(context: VerifiedBundleContext, bind: Binder, assurance: Assurance, audience: str) -> ReceiptModel:
    """The receipt in *context* for *audience*; ``ReceiptUnavailable`` when
    there is none. The copy's own sealed report names the audience it was cut
    for, and a copy is only ever shown as that audience's: a ``keep`` copy is
    never presented as a counterparty's page. *assurance* is the verifier's
    bundle digest, witness and countersignature results."""
    if not context.verified:
        raise ReceiptUnavailable("the bundle did not verify")
    reader = _Reader(context)
    report_id, raw = reader.sealed_report()
    report = _report(report_id, raw)
    if report.audience != audience:
        raise ReceiptUnavailable(f"this copy was cut for {report.audience!r}, not {audience!r}")

    entries = {
        cid: e for e in (_map(e) for e in _seq(raw.get("steps"))) if (cid := _str(e.get("capsule_id"))) is not None
    }
    order = [cid for cid in context.records if not reader.is_report(cid)]
    for cid in (*entries, *(c for i in (*report.did, *report.told, *report.later) for c in i.steps)):
        if cid not in order and not reader.is_report(cid):
            order.append(cid)
    steps = [_step(reader, cid, entries.get(cid, {})) for cid in order]
    # Report records last: identity and place only, the named one disclosed.
    steps += [
        Step(cid, reader.disclosure(cid), "report", REPORT_TYPE if cid == report_id else None, reader.log(cid),
             _str(reader.headers[cid].get("key_id")))
        for cid in context.records
        if reader.is_report(cid)
    ]
    steps_t = tuple(steps)

    payloads = [p for p in (reader.payload(cid) for cid in context.records) if p is not None]
    demo = any(
        _map(p.get(EXTENSION)).get("record_type") == "baseline" and _map(p.get("body")).get("demo") is True for p in payloads
    )
    return ReceiptModel(
        deal_id=_str(raw.get("deal_id")) or "",
        demo=demo,
        headline=_headline(steps_t, context.root, report),
        asked=_asked(reader, raw, bind),
        statements=_statements(reader, raw, bind),
        steps=steps_t,
        report=report,
        producers=tuple(dict.fromkeys(_producer(p) for p in payloads)),
        bundle_digest=assurance.bundle_digest,
        witnessed=assurance.witnesses,
        countersignatures=assurance.countersignatures,
        verification=context.verification,
    )
