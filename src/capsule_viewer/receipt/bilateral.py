# SPDX-License-Identifier: Apache-2.0
"""The bilateral receipt module, ``capsuleviewer.receipt.bilateral/v0``: one
deal as both parties hold it, over a ``composed/v1`` bundle.

The bundle's shape (agreed with the producer side; no producer emits it yet):
the outer bundle carries ``composed/v1`` and no ``x-deal-v0``; each carried
member is one party's own ``x-deal-v0`` copy, byte for byte, with its own
completeness proof. The manifest requires ``composed/v1`` (the module
declares it understands this composition) and forbids an outer
``x-deal-v0``, so it never matches a single copy, and the unilateral module,
which forbids ``composed/v1``, never matches a composition.

What the module shows, and where it comes from:

* **the parties**: each carried copy, read through its own context (built
  from the verifier's report on that member, bound to that member's bytes),
  by the unilateral receipt model, or by the seller receipt model when the
  copy engages the seller kind (``role.py``). A copy whose packaging and
  sealed ``party_role`` disagree (the kind without ``seller``, or ``seller``
  without the kind) declines the whole composition. One copy is never read through the other: what one
  leaves out stays left out;
* **one deal or not**: the deals each copy's disclosed records name (a
  record's deal id, else its chain id; a withheld record names nothing the
  page can read). Both name exactly one, the same: one deal. Anything else is
  shown as such and no deal is picked;
* **each join**: its basis, the state the composer declared and the state the
  verifier derived, and whether an agreement corroborates (all as the
  verifier reported them; the module derives nothing);
* in L2, the generic composition section (``capsule_viewer.composed``) and
  each copy's records.

Which copies a page may show: a page for one audience shows the copies cut
for that audience; the keep page may also show a counterparty cut (the other
party's copy as it was handed over), beside at most one keep copy. Any other
mix is declined, so no page shows a copy cut for someone else. The two
copies come from two observers as the composition declares them (which party
an observer is, the module does not judge).

The module declines a composition the verifier did not pass: the composed
digest, composition closure and each copy's digest must all hold.

Depth follows the unilateral module: L0 the deal, the joins and each copy's
headline; L1 each copy's why; L2 the verifier's checks, the composition and
each copy's records.
"""
from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from importlib import resources

from ..binding import check_opening
from ..composed import Composition, Corroboration, Join, Part, carried_parts, composition_section
from ..context import VerifiedBundleContext
from ..kit.components import Markup, VerificationResult
from ..kit.contract import KitServices, ModuleManifest
from ..registry import Manifest
from ..verifier_report import Assurance, VerifierReportError
from ..wording import WordingPack
from .model import (
    Binder,
    ReceiptModel,
    ReceiptUnavailable,
    build_receipt,
    copy_audience,
    named_deals,
)
from .module import DEPTHS, Levels, UnilateralReceiptModule, _el, _join, draft_manifest
from .role import sealed_side, seller_kind_engaged
from .seller import SellerModel, SellerReceiptModule, build_seller

BILATERAL_MANIFEST: Manifest = json.loads(
    resources.files(__package__).joinpath("manifest-bilateral.json").read_text(encoding="utf-8")
)
# The copies a page for each audience may carry.
CUTS: dict[str, tuple[str, ...]] = {
    "keep": ("keep", "counterparty"),
    "counterparty": ("counterparty",),
    "adjudicator": ("adjudicator",),
}


def bilateral_manifest(forbid_profiles: Sequence[str] = ()) -> Manifest:
    """The module's manifest with *forbid_profiles* added to its ``forbids``:
    render-time configuration, as for ``unilateral_manifest``."""
    forbids = BILATERAL_MANIFEST["forbids"]
    extra = [p for p in forbid_profiles if p not in forbids["profiles"]]
    return {**BILATERAL_MANIFEST, "forbids": {**forbids, "profiles": [*forbids["profiles"], *extra]}}


@dataclass(frozen=True)
class PartyCopy:
    member: str
    observer: str
    role: str | None  # as the composition declares it, uninterpreted
    custody_domain: str | None
    audience: str  # the audience this copy was cut for
    deals: frozenset[str]
    assurance: Assurance
    receipt: ReceiptModel
    seller: SellerModel | None = None  # set when the copy is a seller's


@dataclass(frozen=True)
class JoinView:
    join: Join
    corroboration: Corroboration | None


@dataclass(frozen=True)
class BilateralModel:
    deal: str | None  # the one deal both copies name, else None
    deal_state: str  # agree | mismatch | unnamed
    named: tuple[str, ...]  # every deal any copy names, sorted
    parties: tuple[PartyCopy, ...]
    joins: tuple[JoinView, ...]
    composition: Composition
    bundle_digest: str | None
    verification: VerificationResult


def composition_problem(c: Composition) -> str | None:
    """Why the verifier's composed/v1 result is not a bilateral receipt's, or
    ``None``: the block must have passed (its digest reproduced, closure
    passed) and hold exactly two carried copies, under two member ids and two
    observers, each copy's digest reproduced, with one corroboration result per
    join. A malformed block reports no members, so it fails too."""
    if c.status != "pass" or not c.digest_matches or c.closure.status != "pass":
        return f"the composition did not pass (status {c.status}, closure {c.closure.status})"
    members = c.members
    if len(members) != 2 or any(m.body != "carried" or m.outcome != "artifact" for m in members):
        return "a bilateral receipt is exactly two carried copies"
    if any(m.digest != "reproduced" for m in members):
        return "a carried copy's digest was not reproduced"
    if len({m.id for m in members}) != 2 or len({m.observer for m in members}) != 2:
        return "the two copies are not from two observers"
    if len(c.corroboration) != len(c.joins):
        return "the report does not give one corroboration result per join"
    return None


def page_may_show(audience: str, cuts: Sequence[str]) -> bool:
    """Whether a page for *audience* may show copies cut for *cuts*: each one
    a cut ``CUTS`` allows that audience, and at most one ``keep`` copy."""
    allowed = CUTS.get(audience, ())
    return all(cut in allowed for cut in cuts) and sum(cut == "keep" for cut in cuts) <= 1


def one_deal(named: Sequence[frozenset[str]]) -> tuple[str, tuple[str, ...]]:
    """Whether copies naming *named* (each copy's set of deals) are of one
    deal: ``agree`` when every copy names exactly one and it is the same,
    ``unnamed`` when a copy names none, else ``mismatch``. Also every deal
    named, sorted. A copy naming two deals is a mismatch; none is picked."""
    every = tuple(sorted(set().union(*named)))
    if any(not deals for deals in named):
        return "unnamed", every
    if len(every) == 1:
        return "agree", every
    return "mismatch", every


def _party(part: Part, bind: Binder) -> PartyCopy:
    """One carried copy, read as a single copy: by the sealed report its own
    ``x-deal-v0`` extension names (a copy without one is declined)."""
    cut = copy_audience(part.context)
    observer = part.observer
    # A copy that engages the seller kind is read as a seller's; build_seller
    # declines it unless its opening record seals party_role seller. A copy
    # that seals seller without the kind is declined too: the packaging and
    # the sealed fact must agree either way.
    if not seller_kind_engaged(part.context) and sealed_side(part.context) == "seller":
        raise ReceiptUnavailable(f"{part.member.id} is sealed as a seller's copy and does not engage the seller kind")
    seller = build_seller(part.context, bind, part.assurance, cut) if seller_kind_engaged(part.context) else None
    return PartyCopy(
        member=part.member.id,
        observer=part.member.observer,
        role=observer.role if observer else None,
        custody_domain=observer.custody_domain if observer else None,
        audience=cut,
        deals=named_deals(part.context),
        assurance=part.assurance,
        receipt=build_receipt(part.context, bind, part.assurance, cut),
        seller=seller,
    )


def build_bilateral(
    context: VerifiedBundleContext, composition: Composition | None, bind: Binder, assurance: Assurance, audience: str
) -> BilateralModel:
    """The two copies in *context* for *audience*. *composition* is the
    verifier's composed/v1 result for this bundle. ``ReceiptUnavailable``
    unless the composition passed (``composition_passed``), it carries exactly
    two copies from two observers, and each is a copy this page may show."""
    if not context.verified:
        raise ReceiptUnavailable("the bundle did not verify")
    if composition is None:
        raise ReceiptUnavailable("no composed/v1 result was reported for this bundle")
    problem = composition_problem(composition)
    if problem is not None:
        raise ReceiptUnavailable(problem)
    try:
        parts = carried_parts(context, composition)
    except VerifierReportError as exc:
        raise ReceiptUnavailable(str(exc)) from exc
    if len(parts) != 2:
        raise ReceiptUnavailable("the bundle does not carry the two copies its report assessed")
    parties = tuple(_party(part, bind) for part in parts)
    if not page_may_show(audience, [p.audience for p in parties]):
        cuts = ", ".join(p.audience for p in parties)
        raise ReceiptUnavailable(f"a {audience!r} page does not show copies cut for {cuts}")
    deal_state, named = one_deal([p.deals for p in parties])
    # The verifier reports one corroboration result per join, in join order
    # (agent-action-capsule go/bundle/composed.go); a report that does not is
    # declined above, never paired by guess.
    joins = tuple(JoinView(j, c) for j, c in zip(composition.joins, composition.corroboration, strict=True))
    return BilateralModel(
        deal=named[0] if deal_state == "agree" else None,
        deal_state=deal_state,
        named=named,
        parties=parties,
        joins=joins,
        composition=composition,
        bundle_digest=assurance.bundle_digest,
        verification=context.verification,
    )


class BilateralReceiptModule:
    """``canRender`` / ``buildModel`` / ``render`` over one verified
    composition. The arguments are the unilateral module's, plus
    *composition*: the verifier's composed/v1 result for this bundle
    (``composition_from_capsulectl``)."""

    def __init__(
        self,
        pack: WordingPack,
        depth: str = "L0",
        audience: str = "keep",
        assurance: Assurance | None = None,
        composition: Composition | None = None,
        bind: Binder = check_opening,
        forbid_profiles: Sequence[str] = (),
    ) -> None:
        if depth not in DEPTHS:
            raise ValueError(f"depth must be one of {DEPTHS}, got {depth!r}")
        self.pack = pack
        self.depth = depth
        self.audience = audience
        self.assurance = assurance if assurance is not None else Assurance()
        self.composition = composition
        self.bind = bind
        self.manifest_json = bilateral_manifest(forbid_profiles)
        self.manifest: ModuleManifest = draft_manifest(self.manifest_json)

    @property
    def title(self) -> str:
        return self.w("bilateral.title")

    def canRender(self, context: VerifiedBundleContext) -> bool:  # noqa: N802 -- the contract's member name
        try:
            build_bilateral(context, self.composition, self.bind, self.assurance, self.audience)
        except ReceiptUnavailable:
            # Declining is canRender's answer: resolution moves on to the
            # fallback tier (contract 4.3), and nothing of this module is shown.
            return False
        return True

    def buildModel(self, context: VerifiedBundleContext) -> BilateralModel:  # noqa: N802 -- the contract's member name
        return build_bilateral(context, self.composition, self.bind, self.assurance, self.audience)

    def render(self, model: BilateralModel, services: KitServices) -> str:
        self.kit = services
        drawn = [self._levels(p, services) for p in model.parties]
        l1_open = self.depth in ("L1", "L2")
        l2_open = self.depth == "L2"

        l0: list[str] = [_el("h2", self.w("bilateral.title")), self._deal(model), self._joins(model)]
        for party, levels in zip(model.parties, drawn, strict=True):
            body = _join([levels.headline, *levels.notes])
            l0.append(_el("div", services.section(self._heading(party), body, level=3), data_party=party.member, data_cut=party.audience))
        l0.append(_el("p", self.w("parts.own"), class_="cv-muted"))

        l1 = [
            _el("div", services.drilldown(self._heading(p), *levels.l1, expanded=l1_open), data_party=p.member)
            for p, levels in zip(model.parties, drawn, strict=True)
        ]
        l2: list[str] = [services.verification_details(model.verification)]
        if model.bundle_digest:
            l2.append(_el("p", _join([self.w("l2.bundle_digest"), " ", _el("span", model.bundle_digest, class_="cv-mono", data_bundle_digest="true")])))
        l2.append(_el("div", services.drilldown(self.w("l2.composition"), composition_section(model.composition, services), expanded=l2_open), data_composition="true"))
        l2 += [
            _el("div", services.drilldown(self._heading(p), *levels.l2, expanded=l2_open), data_party=p.member)
            for p, levels in zip(model.parties, drawn, strict=True)
        ]
        return str(
            _join(
                [
                    _el("div", _join(l0), data_level="L0"),
                    _el("div", services.drilldown(self.w("depth.l1"), *l1, expanded=l1_open), data_level="L1"),
                    _el("div", services.drilldown(self.w("depth.l2"), *l2, expanded=l2_open), data_level="L2"),
                ]
            )
        )

    # ---- words --------------------------------------------------------------

    def w(self, key: str, **values: str) -> str:
        """The pack's words for *key*; a key the pack lacks is shown as such."""
        text = self.pack.fill(key, **values)
        return text if text is not None else f"[{key}]"

    def _token(self, prefix: str, value: str) -> str:
        """An enum's words, or the token itself when the pack has none."""
        return self.pack.get(f"{prefix}.{value}") or value

    def _levels(self, party: PartyCopy, services: KitServices) -> Levels:
        """One copy at this page's depth, drawn by the seller module when it is
        a seller's copy and by the unilateral module otherwise."""
        if party.seller is not None:
            seller = SellerReceiptModule(self.pack, self.depth, party.audience, party.assurance, self.bind)
            return seller.seller_levels(party.seller, services)
        return UnilateralReceiptModule(self.pack, self.depth, party.audience, party.assurance, self.bind).levels(party.receipt, services)

    def _heading(self, party: PartyCopy) -> str:
        role = party.role or self.w("party.role_undeclared")
        return self.w("party.heading", role=role, member=party.member)

    # ---- L0 -----------------------------------------------------------------

    def _deal(self, model: BilateralModel) -> Markup:
        if model.deal_state == "agree" and model.deal is not None:
            text = self.w("deal.agree", deal=model.deal)
        elif model.deal_state == "mismatch":
            text = self.w("deal.mismatch", deals=", ".join(model.named))
        else:
            text = self.w("deal.unnamed")
        return _el("p", text, data_deal_state=model.deal_state)

    def _joins(self, model: BilateralModel) -> Markup:
        if not model.joins:
            return self.kit.section(self.w("joins.heading"), _el("p", self.w("joins.none")), level=3)
        rows = []
        for view in model.joins:
            j = view.join
            derived = j.derived or "not_derivable"
            line = self.w(
                "join.line",
                basis=self._token("join.basis", j.basis),
                declared=self._token("join.state", j.declared),
                derived=self._token("join.state", derived),
            )
            parts: list[str] = [_el("span", line)]
            if j.result == "join_state_mismatch":
                parts.append(_el("span", " " + self.w("join.result.join_state_mismatch")))
            c = view.corroboration
            if c is not None and c.result == "corroborating":
                parts.append(_el("span", " " + self.w("corroboration.corroborating")))
            elif c is not None and c.result == "redundant":
                parts.append(_el("span", " " + self.w("corroboration.redundant", reasons=", ".join(c.reasons))))
            rows.append(
                _el("li", _join(parts), data_join_basis=j.basis, data_join_declared=j.declared,
                    data_join_derived=derived, data_join_result=j.result,
                    data_corroboration=c.result if c is not None else "none")
            )
        return self.kit.section(self.w("joins.heading"), _el("ul", _join(rows)), level=3)
