# SPDX-License-Identifier: Apache-2.0
"""The seller receipt module, ``capsuleviewer.receipt.seller/v0``: one buyer
thread of a sale, as the seller's agent sealed it, over an ``x-deal-v0``
copy that engages ``SELLER_KIND``.

Selection is two-sided (``role.py``): the manifest requires the seller kind,
so the registry offers it only seller copies, and ``canRender`` declines a
copy whose sealed records do not show a seller's side (``sealed_side``: the
opening record's ``party_role``, or, when a shared copy withholds it, records
only a seller's deal carries). The unilateral module forbids the kind and
declines a copy whose sealed records show a seller's side, so a seller's copy
is never drawn as a buyer's receipt. ``manifest-seller.json`` is completed by
``seller_manifest``, which adds the kind from its one constant: the file alone
is not the manifest a registry holds.

Depth (presentation contract section 9):

* **L0:** the item sold, the amount committed to, whether a payment is
  recorded, whether a handover is recorded and by whom (never as a bare
  fact: the seller's own record of a handover is the seller's claim), and
  where the thread stands; for a shared copy, whom it was cut for.
* **L1:** what the seller authorised (the public authority, and the lowest
  price as the copy carries it: a commitment, or WITHHELD), what the seller's
  agent told this buyer (in the agent's words only where their opening
  recomputes to the sealed commitment), the offers and which superseded
  which, what the buyer accepted (by the digest of the exact offer), payment,
  the handover with its provenance, what the agent gave the buyer (the
  address, as WITHHELD or committed), open obligations and the thread's
  close.
* **L2:** the verifier's checks and every record (the unilateral module's
  L2), then the supersession chain, the commitments each disclosed record
  seals, the settlement legs and the signing keys.

The counterparty copy is the buyer-facing receipt. The module shows what the
share builder disclosed and never decides it: a withheld step is shown
WITHHELD at its place in the log, an opening that is not in the copy is not
shown, and nothing is read from one copy into another.

A reference between records (an offer superseding another, an acceptance
naming the exact offer) is a record digest. The module finds the record a
reference names with the core's ``record_digest`` over each disclosed
record's payload; a reference that names no disclosed record is shown as
such, never guessed.
"""
from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from importlib import resources

from ..binding import check_opening
from ..context import Frozen, VerifiedBundleContext
from ..digest import NotCanonical, record_digest
from ..kit.components import Markup, Metric
from ..kit.contract import KitServices
from ..registry import Manifest
from ..verifier_report import Assurance
from ..wording import WordingPack
from .model import Binder, Fact, ReceiptModel, ReceiptUnavailable, build_receipt, format_amount, sealed_report
from .module import SHARED_AUDIENCES, Levels, UnilateralReceiptModule, _el, _join, draft_manifest
from .role import ACCEPTANCE_KIND, SELLER_KIND, sealed_side, seller_kind_engaged

_SHIPPED: Manifest = json.loads(resources.files(__package__).joinpath("manifest-seller.json").read_text(encoding="utf-8"))
# Where a handover could come from, in the order the page lists them. Only the
# seller's own record can be in a seller's copy today.
PROVENANCES = ("seller_observed", "carrier", "buyer_confirmed")


def seller_manifest(forbid_profiles: Sequence[str] = ()) -> Manifest:
    """The module's manifest: the shipped file with ``SELLER_KIND`` added to
    its required extensions, and *forbid_profiles* added to its ``forbids``
    (render-time configuration, as for ``unilateral_manifest``)."""
    requires, forbids = _SHIPPED["requires"], _SHIPPED["forbids"]
    required = [*requires["extensions"]["required"], SELLER_KIND]
    extra = [p for p in forbid_profiles if p not in forbids["profiles"]]
    return {
        **_SHIPPED,
        "requires": {**requires, "extensions": {"required": required}},
        "forbids": {**forbids, "profiles": [*forbids["profiles"], *extra]},
    }


SELLER_MANIFEST = seller_manifest()


@dataclass(frozen=True)
class Offer:
    """An offer or commit the seller's agent proposed (a disclosed
    ``proposed-action/v0``). ``supersedes``, ``superseded_by`` and
    ``accepted_by`` are step ids, set only when the other record is disclosed
    in this copy."""

    step: str
    action: str
    amount: Fact | None
    digest: str | None
    supersedes: str | None
    superseded_by: str | None
    accepted_by: str | None


@dataclass(frozen=True)
class Acceptance:
    """The seller's agent's record that the buyer accepted an exact offer.
    ``offer`` is the disclosed offer whose digest ``offer_digest`` is, or
    ``None`` when that offer is not disclosed in this copy."""

    step: str
    channel: str | None
    observed_at: str | None
    offer_digest: str | None
    offer: str | None


@dataclass(frozen=True)
class EvidenceNote:
    """An evidence step: its source and whether it was verified when
    disclosed; only its disclosure state when withheld."""

    step: str
    disclosure: str
    source: str | None = None
    verified: bool | None = None


@dataclass(frozen=True)
class Handover:
    """The seller's own record of what was handed over: ``recorded`` (with
    what it says was delivered), ``withheld`` or ``not_present``."""

    state: str
    step: str | None = None
    facts: tuple[Fact, ...] = ()


@dataclass(frozen=True)
class SellerModel:
    receipt: ReceiptModel
    item: Fact | str
    amount: Fact | str
    outcome: str | None  # the close's sealed outcome, when the close is disclosed
    floor: str  # committed | withheld | not_present
    address: str  # committed | withheld | not_present
    authority: tuple[Fact, ...]
    offers: tuple[Offer, ...]
    acceptances: tuple[Acceptance, ...]
    evidence: tuple[EvidenceNote, ...]
    handover: Handover
    commitments: tuple[tuple[str, str, str], ...]  # (step, field, commitment), in record order
    keys: tuple[str, ...]  # distinct signing keys, in record order

    @property
    def demo(self) -> bool:
        return self.receipt.demo


# ---- small readers ----------------------------------------------------------


def _map(value: Frozen) -> Mapping[str, Frozen]:
    return value if isinstance(value, Mapping) else {}


def _str(value: Frozen) -> str | None:
    return value if isinstance(value, str) else None


def _amount(body: Mapping[str, Frozen], minor_key: str = "amount_minor") -> Fact | None:
    minor, currency = body.get(minor_key), _str(body.get("currency"))
    if isinstance(minor, int) and not isinstance(minor, bool) and currency:
        return Fact("amount", format_amount(minor, currency), "amount")
    return None


def _record_type(payload: Mapping[str, Frozen]) -> str | None:
    """A disclosed record's own type: a typed record's ``type``, else its
    ``x-deal-v0`` block's ``record_type``."""
    return _str(payload.get("type")) or _str(_map(payload.get("x-deal-v0")).get("record_type"))


def _ref_digests(payload: Mapping[str, Frozen], rel: str) -> tuple[str, ...]:
    """The digests *payload*'s references of relation *rel* name, from the
    typed record's ``refs`` or its ``x-deal-v0`` block's."""
    refs = payload.get("refs") or _map(payload.get("x-deal-v0")).get("refs")
    out = []
    for ref in refs if isinstance(refs, tuple) else ():
        ref = _map(ref)
        digest = _str(ref.get("digest"))
        if ref.get("rel") == rel and digest is not None:
            out.append(digest)
    return tuple(out)


def _digest(payload: Mapping[str, Frozen]) -> str | None:
    try:
        return record_digest(payload)
    except NotCanonical:
        # A payload outside the JCS domain has no digest, so no reference can
        # name it: the record is still shown, it is just never a reference's target.
        return None


def _commitments(step: str, body: Mapping[str, Frozen], prefix: str = "") -> list[tuple[str, str, str]]:
    """Every ``*_commitment`` member of *body* and of its nested objects."""
    out: list[tuple[str, str, str]] = []
    for key, value in sorted(body.items()):
        if key.endswith("_commitment"):
            commitment = _str(value)
            if commitment is not None:
                out.append((step, prefix + key, commitment))
            continue
        out += _commitments(step, _map(value), f"{prefix}{key}.")
    return out


# ---- the model --------------------------------------------------------------


def build_seller(context: VerifiedBundleContext, bind: Binder, assurance: Assurance, audience: str) -> SellerModel:
    """The seller receipt in *context* for *audience*; ``ReceiptUnavailable``
    unless the copy engages ``SELLER_KIND`` and its sealed records show a
    seller's side (``sealed_side``; the two must agree), and it is a receipt
    the unilateral model can read for that audience."""
    if not seller_kind_engaged(context):
        raise ReceiptUnavailable(f"the copy does not engage {SELLER_KIND}")
    role = sealed_side(context)
    if role != "seller":
        raise ReceiptUnavailable(f"the copy engages {SELLER_KIND} and its sealed records show side {role!r}, not 'seller'")
    receipt = build_receipt(context, bind, assurance, audience)
    _, raw = sealed_report(context)

    payloads: dict[str, Mapping[str, Frozen]] = {}
    for step in receipt.steps:
        payload = context.disclosed(step.capsule_id, "agent_input")
        if isinstance(payload, Mapping) and step.section != "report":
            payloads[step.capsule_id] = payload
    kind_of = {
        cid: kind
        for entry in (_map(e) for e in raw.get("steps") or ())
        if (cid := _str(entry.get("capsule_id"))) is not None and (kind := _str(entry.get("kind"))) is not None
    }

    def bodies(record_type: str) -> list[tuple[str, Mapping[str, Frozen]]]:
        return [(cid, _map(p.get("body"))) for cid, p in payloads.items() if _record_type(p) == record_type]

    def withheld(kind: str) -> list[str]:
        return [s.capsule_id for s in receipt.steps if s.disclosure == "withheld" and kind_of.get(s.capsule_id) == kind]

    by_digest = {d: cid for cid, p in payloads.items() if (d := _digest(p)) is not None}

    acceptances = []
    for cid, body in bodies("action-approval/v0"):
        if body.get("kind") != ACCEPTANCE_KIND:
            continue
        named = _str(_map(body.get("proposed_action_ref")).get("digest"))
        acceptances.append(
            Acceptance(cid, _str(body.get("channel")), _str(body.get("observed_at")), named, by_digest.get(named) if named else None)
        )

    proposed = [(cid, body) for cid, body in bodies("proposed-action/v0") if body.get("action") in ("offer", "commit")]
    superseded_by = {old: cid for cid, _ in proposed for d in _ref_digests(payloads[cid], "supersedes") if (old := by_digest.get(d))}
    accepted_by = {a.offer: a.step for a in acceptances if a.offer is not None}
    offers = tuple(
        Offer(
            step=cid,
            action=str(body.get("action")),
            amount=_amount(body),
            digest=_digest(payloads[cid]),
            supersedes=next((by_digest[d] for d in _ref_digests(payloads[cid], "supersedes") if d in by_digest), None),
            superseded_by=superseded_by.get(cid),
            accepted_by=accepted_by.get(cid),
        )
        for cid, body in proposed
    )

    evidence = [EvidenceNote(cid, "disclosed", _str(b.get("source")), b.get("verified") is True) for cid, b in bodies("evidence")]
    evidence += [EvidenceNote(cid, "withheld") for cid in withheld("evidence")]

    handover = Handover("not_present")
    delivered = [(cid, _map(b.get("delivered"))) for cid, b in bodies("action-outcome/v0") if _map(b.get("delivered"))]
    if delivered:
        cid, terms = delivered[-1]
        facts = [Fact(k, str(terms[k]), "count" if k == "quantity" else "token") for k in ("item", "quantity") if k in terms]
        price = _amount(terms, "price_minor")
        handover = Handover("recorded", cid, (*facts, *((Fact("price", price.value, "amount"),) if price else ())))
    elif withheld("outcome"):
        handover = Handover("withheld", withheld("outcome")[-1])

    closes = bodies("close")
    outcome = _str(closes[-1][1].get("outcome")) if closes else None

    opening = next((b for _, b in bodies("baseline")), {})
    authority_body = next((b for _, b in bodies("task-authority/v0")), {})
    intent = _map(opening.get("intent"))
    terms = _map(opening.get("terms"))
    item: Fact | str = Fact("item", terms["item"]) if _str(terms.get("item")) else "not_present"
    if isinstance(item, str) and _str(_map(intent.get("asked")).get("item")):
        item = Fact("item", str(_map(intent.get("asked"))["item"]))

    commit = [o for o in offers if o.action == "commit"]
    acted = [b for _, b in bodies("action-record/v0") if b.get("action") == "commit"]
    amount: Fact | str = "not_present"
    if acted and _amount(acted[-1]):
        amount = _amount(acted[-1]) or "not_present"
    elif commit and commit[-1].amount:
        amount = commit[-1].amount
    elif any(kind_of.get(s.capsule_id) == "act" and s.disclosure == "withheld" for s in receipt.steps):
        amount = "withheld"

    bounds_sealed = bool(_str(authority_body.get("bounds_commitment")) or _str(intent.get("bounds_commitment")))
    if raw.get("bounds_openings"):
        floor = "committed"
    elif bounds_sealed or withheld("task_authority") or withheld("open"):
        floor = "withheld"
    else:
        floor = "not_present"

    address_steps = [
        cid
        for told in (_map(t) for t in raw.get("told") or ())
        if any(_map(f).get("class") == "address" for f in told.get("fields") or ())
        for cid in (_str(c) for c in told.get("steps") or ())
        if cid is not None and kind_of.get(cid) == "disclosure"
    ]
    address_steps += [
        cid for cid, b in bodies("disclosure") if any(_map(f).get("class") == "address" for f in b.get("fields") or ()) and cid not in address_steps
    ]
    if any(cid in payloads for cid in address_steps):
        address = "committed"
    elif address_steps:
        address = "withheld"
    else:
        address = "not_present"

    authority = tuple(
        f
        for f in (
            Fact("allowed_actions", ", ".join(str(a) for a in authority_body.get("allowed_actions") or ())) if authority_body.get("allowed_actions") else None,
            Fact("outcome_id", str(authority_body["outcome_id"])) if _str(authority_body.get("outcome_id")) else None,
        )
        if f is not None
    )
    commitments = tuple(c for cid, p in payloads.items() for c in _commitments(cid, _map(p.get("body"))))
    keys = tuple(dict.fromkeys(s.key_id for s in receipt.steps if s.key_id))
    return SellerModel(
        receipt=receipt,
        item=item if opening or not withheld("open") else "withheld",
        amount=amount,
        outcome=outcome,
        floor=floor,
        address=address,
        authority=authority,
        offers=offers,
        acceptances=tuple(acceptances),
        evidence=tuple(evidence),
        handover=handover,
        commitments=commitments,
        keys=keys,
    )


# ---- the module -------------------------------------------------------------


class SellerReceiptModule(UnilateralReceiptModule):
    """``canRender`` / ``buildModel`` / ``render`` over one seller copy. The
    arguments are the unilateral module's; the steps, committed words and the
    records table are drawn as that module draws them."""

    def __init__(
        self,
        pack: WordingPack,
        depth: str = "L0",
        audience: str = "keep",
        assurance: Assurance | None = None,
        bind: Binder = check_opening,
        forbid_profiles: Sequence[str] = (),
    ) -> None:
        super().__init__(pack, depth, audience, assurance, bind, forbid_profiles)
        self.manifest_json = seller_manifest(forbid_profiles)
        self.manifest = draft_manifest(self.manifest_json)

    @property
    def title(self) -> str:
        return self.w("seller.title")

    def canRender(self, context: VerifiedBundleContext) -> bool:  # noqa: N802 -- the contract's member name
        try:
            build_seller(context, self.bind, self.assurance, self.audience)
        except ReceiptUnavailable:
            # Declining is canRender's answer (contract 4.3): a copy whose
            # packaging and sealed role disagree shows no receipt at all.
            return False
        return True

    def buildModel(self, context: VerifiedBundleContext) -> SellerModel:  # noqa: N802 -- the contract's member name
        return build_seller(context, self.bind, self.assurance, self.audience)

    def render(self, model: SellerModel, services: KitServices) -> str:
        levels = self.seller_levels(model, services)
        l0: list[str] = []
        if model.demo:
            l0.append(_el("p", self.w("badge.demo"), data_demo="true"))
        l0 += [_el("h2", self.w("seller.title")), levels.headline, *levels.notes]
        return str(
            _join(
                [
                    _el("div", _join(l0), data_level="L0"),
                    _el("div", services.drilldown(self.w("seller.depth.l1"), *levels.l1, expanded=levels.l1_open), data_level="L1"),
                    _el("div", services.drilldown(self.w("depth.l2"), *levels.l2, expanded=levels.l2_open), data_level="L2"),
                ]
            )
        )

    def seller_levels(self, model: SellerModel, services: KitServices) -> Levels:
        """One seller copy at each depth: the pieces ``render`` lays out, and a
        composition lays out once per copy."""
        self.kit = services
        l1_open = self.depth in ("L1", "L2")
        return Levels(
            headline=_el("div", self._seller_headline(model), data_headline="true"),
            notes=tuple(self._seller_notes(model)),
            l1=tuple(self._seller_l1(model, l1_open)),
            l2=tuple(self._seller_l2(model)),
            l1_open=l1_open,
            l2_open=self.depth == "L2",
        )

    # ---- helpers --------------------------------------------------------------

    def _fact_label(self, name: str) -> str:
        """A step's fact, labelled from the seller's side where the pack has
        seller words for it (``seller.fact.<name>``), else as any step's."""
        return self.pack.get(f"seller.fact.{name}") or super()._fact_label(name)

    def _audience_key(self, prefix: str, model: SellerModel) -> str:
        audience = model.receipt.report.audience
        return f"{prefix}.{audience if audience in ('keep', *SHARED_AUDIENCES) else 'keep'}"

    def _n(self, model: SellerModel, step: str | None) -> str:
        found = model.receipt.step(step) if step else None
        return str(found.n) if found is not None and found.n is not None else "-"

    def _withheld_row(self, state: str, key: str, attr: str) -> Markup:
        return _el(
            "p",
            _join([self.kit.disclosure_badge(state), " ", _el("span", self.w(f"{key}.{state}"))]),
            data_seller=attr,
            data_state=state,
        )

    def _handover_text(self, h: Handover) -> Markup:
        if h.state == "recorded":
            return Markup(self.w("seller.handover.seller_observed"))
        if h.state == "withheld":
            return Markup(self.kit.disclosure_badge("withheld"))
        return Markup(self.w("seller.handover.none"))

    # ---- L0 -------------------------------------------------------------------

    def _seller_headline(self, model: SellerModel) -> Markup:
        if model.outcome:
            state: Markup = self._enum("seller.outcome", model.outcome)
        elif model.receipt.report.state:
            state = self._enum("state", model.receipt.report.state)
        else:
            state = Markup(self.w("l0.state.missing"))
        return self.kit.metric_grid(
            [
                Metric(self.w("seller.l0.item"), Markup(self._part(model.item))),
                Metric(self.w("seller.l0.amount"), Markup(self._part(model.amount))),
                # No deal record kind carries a payment the seller received
                # (evidence records do not say what they are about), so a
                # copy never has one to show: the tile says so.
                Metric(self.w("seller.l0.payment"), Markup(self.w("seller.payment.not_recorded"))),
                Metric(self.w("seller.l0.handover"), _el("span", self._handover_text(model.handover), data_handover=model.handover.state)),
                Metric(self.w("l0.state"), state),
            ]
        )

    def _seller_notes(self, model: SellerModel) -> list[Markup]:
        """The unilateral module's copy notes, with a shared copy's list of
        what it leaves out moved to L1 (``_left_out``): L0 says only whom the
        copy was cut for, so it stays one phone screen."""
        audience = model.receipt.report.audience
        notes = self._copy_notes(model.receipt)
        if audience in SHARED_AUDIENCES:
            notes[0] = self._p(self.w(f"seller.shared.{audience}"), data_shared=audience)
        return notes

    def _left_out(self, model: SellerModel) -> list[str]:
        audience = model.receipt.report.audience
        if audience not in SHARED_AUDIENCES:
            return []
        kinds = ", ".join(model.receipt.report.withheld)
        return [self.kit.section(self.w("seller.section.left_out"), self._p(self.w(f"shared.{audience}", kinds=kinds), data_left_out=audience))]

    # ---- L1 -------------------------------------------------------------------

    def _seller_l1(self, model: SellerModel, open_: bool) -> list[str]:
        r = model.receipt
        out: list[str] = [self._note(self.w("summary.sealed"), data_sealed="x-deal-v0"), *self._left_out(model)]

        authorised: list[str] = [self._committed(r.asked, "seller.asked")]
        if model.authority:
            authorised.append(
                _el("dl", _join(_join([_el("dt", self.w(f"seller.fact.{f.name}")), _el("dd", f.value, class_="cv-mono", data_fact=f.name)]) for f in model.authority))
            )
        authorised.append(self._withheld_row(model.floor, "seller.floor", "floor"))
        authorised += self._section_steps(r, "authorized")
        out.append(self.kit.section(self.w(self._audience_key("seller.section.authorised", model)), *authorised))

        told = [self._committed(c, "statement") for c in r.statements] or [self._note(self.w("seller.represented.none"))]
        out.append(self.kit.section(self.w(self._audience_key("seller.section.represented", model)), *told, *self._section_steps(r, "statements")))

        out.append(self.kit.section(self.w("seller.section.offers"), *self._offers(model), *self._section_steps(r, "proposed")))
        out.append(self.kit.section(self.w(self._audience_key("seller.section.accepted", model)), *self._acceptances(model), *self._section_steps(r, "approved")))

        payment: list[str] = [self._note(self.w("seller.payment.none"), data_seller="payment")]
        for e in model.evidence:
            if e.disclosure == "disclosed":
                verified = self.w("seller.evidence.verified" if e.verified else "seller.evidence.unverified")
                payment.append(_el("p", f"{self.w('seller.evidence.source')} {e.source or '-'} · {verified}", data_evidence=e.step))
            else:
                payment.append(_el("p", _join([self.kit.disclosure_badge(e.disclosure), " ", _el("span", self.w("seller.evidence.withheld"))]), data_evidence=e.step))
        out.append(self.kit.section(self.w("seller.section.payment"), *payment))

        out.append(self.kit.section(self.w("seller.section.handover"), *self._handover(model), *self._section_steps(r, "acted")))

        given: list[str] = [self._withheld_row(model.address, "seller.address", "address")]
        given += [self._item(r, i, open_=open_) for i in r.report.told]
        given.append(self._note(self.w("told.note")))
        out.append(self.kit.section(self.w(self._audience_key("seller.section.given", model)), *given))

        if r.report.deadlines:
            lines = _el("ul", _join(_el("li", d.text, data_flagged="true" if d.flagged else "false") for d in r.report.deadlines))
            out.append(self.kit.section(self.w("seller.section.obligations"), lines))
        else:
            out.append(self.kit.section(self.w("seller.section.obligations"), self._note(self.w("seller.obligations.none"))))

        stands: list[str] = []
        if model.outcome:
            stands.append(_el("p", self._enum("seller.outcome", model.outcome), data_outcome=model.outcome))
            if model.outcome == "not_selected":
                stands.append(self._note(self.w("seller.not_selected")))
        if r.report.lifecycle:
            stands.append(self._p(r.report.lifecycle, data_sealed_text="lifecycle"))
        stands.append(self._note(self.w("seller.threads")))
        out.append(self.kit.section(self.w("section.lifecycle"), *stands))

        other = self._section_steps(r, "other")
        if other:
            out.append(self.kit.section(self.w("section.other"), *other))

        claims = ["claims.tamper", "claims.reported", "seller.claims.handover"]
        if any(s.disclosure == "withheld" for s in r.steps):
            claims.append("claims.withheld")
        out.append(
            self.kit.section(
                self.w("section.claims"),
                _el("ul", _join(_el("li", self.w(k), data_claim=k) for k in claims)),
                self._note(self.w("claims.scope")),
            )
        )
        return out

    def _offers(self, model: SellerModel) -> list[str]:
        if not model.offers:
            return [self._note(self.w("seller.offers.none"))]
        rows = []
        for o in model.offers:
            if o.accepted_by:
                status = self.w("seller.offer.accepted")
            elif o.superseded_by:
                status = self.w("seller.offer.superseded")
            else:
                status = self.w("seller.offer.open")
            rows.append(
                [
                    self._n(model, o.step),
                    self._enum("seller.action", o.action),
                    o.amount.value if o.amount else "-",
                    _el("span", status, data_offer_status="accepted" if o.accepted_by else "superseded" if o.superseded_by else "open", data_offer=o.step),
                ]
            )
        return [
            self.kit.data_table(
                [self.w("records.step"), self.w("seller.offers.action"), self.w("seller.offers.amount"), self.w("seller.offers.status")], rows
            ),
            self._note(self.w("seller.offers.note")),
        ]

    def _acceptances(self, model: SellerModel) -> list[str]:
        if not model.acceptances:
            return [self._note(self.w("seller.accepted.none"))]
        out: list[str] = []
        for a in model.acceptances:
            offer = next((o for o in model.offers if o.step == a.offer), None)
            if offer is not None:
                named = self.w("seller.accepted.offer")
                detail = f"{self._n(model, offer.step)} · {offer.amount.value if offer.amount else '-'}"
            else:
                named = self.w("seller.accepted.offer_not_here")
                detail = ""
            parts: list[str] = [
                _el("p", _join([named, " ", _el("span", detail, data_accepted_offer=a.offer or "")])),
                _el("p", _join([self.w("seller.accepted.digest"), " ", _el("span", a.offer_digest or "-", class_="cv-mono", data_offer_digest="true")])),
            ]
            if a.channel or a.observed_at:
                parts.append(self._note(f"{a.channel or '-'} · {a.observed_at or '-'}"))
            parts.append(self._note(self.w("seller.accepted.words")))
            out.append(_el("div", _join(parts), data_acceptance=a.step))
        return out

    def _handover(self, model: SellerModel) -> list[str]:
        h = model.handover
        rows = []
        for provenance in PROVENANCES:
            if provenance == "seller_observed":
                state = h.state
            else:
                state = "not_present"
            word = self.w(f"seller.provenance.{provenance}")
            text = self.w(f"seller.provenance.{provenance}.{state}")
            rows.append(_el("li", _join([_el("strong", word), " ", _el("span", text)]), data_provenance=provenance, data_state=state))
        out: list[str] = [_el("ul", _join(rows))]
        if h.facts:
            out.append(
                _el("dl", _join(_join([_el("dt", self.w(f"seller.delivered.{f.name}")), _el("dd", f.value, class_="cv-mono", data_fact=f.name)]) for f in h.facts))
            )
        out.append(self._note(self.w("seller.handover.note")))
        return out

    # ---- L2 -------------------------------------------------------------------

    def _seller_l2(self, model: SellerModel) -> list[str]:
        out: list[str] = list(self._l2(model.receipt))
        chain = [
            [self._n(model, o.step), o.digest or "-", self._n(model, o.supersedes) if o.supersedes else "-", self._n(model, o.superseded_by) if o.superseded_by else "-"]
            for o in model.offers
        ]
        if chain:
            out.append(
                self.kit.section(
                    self.w("seller.section.chain"),
                    self.kit.data_table([self.w("records.step"), self.w("seller.chain.digest"), self.w("seller.chain.supersedes"), self.w("seller.chain.superseded_by")], chain),
                    level=3,
                )
            )
        opened = {(model.receipt.asked.step, "intent.verbatim_commitment")} if model.receipt.asked.state == "opened" else set()
        opened |= {(c.step, "text_commitment") for c in model.receipt.statements if c.state == "opened"}
        rows = [
            [self._n(model, step), field, _el("span", value, class_="cv-mono"), self.w("seller.commitment.opened" if (step, field) in opened else "seller.commitment.sealed")]
            for step, field, value in model.commitments
        ]
        out.append(
            self.kit.section(
                self.w("seller.section.commitments"),
                self.kit.data_table([self.w("records.step"), self.w("seller.commitment.field"), self.w("seller.commitment.value"), self.w("seller.commitment.state")], rows),
                level=3,
            )
        )
        legs = [
            [self.w("seller.leg.agreement"), self.w("seller.leg.recorded" if any(o.action == "commit" for o in model.offers) else "seller.leg.none")],
            [self.w("seller.leg.payment"), self.w("seller.leg.none")],
            [self.w("seller.leg.handover"), self.w(f"seller.provenance.seller_observed.{model.handover.state}")],
        ]
        out.append(self.kit.section(self.w("seller.section.legs"), self.kit.data_table([self.w("seller.leg.name"), self.w("seller.leg.state")], legs), level=3))
        out.append(
            self.kit.section(
                self.w("seller.section.keys"),
                _el("ul", _join(_el("li", k, class_="cv-mono", data_key="true") for k in model.keys)),
                level=3,
            )
        )
        return out
