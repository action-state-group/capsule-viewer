# SPDX-License-Identifier: Apache-2.0
"""The unilateral receipt module, ``capsuleviewer.receipt.unilateral/v0``: one
party's own receipt for one deal, over an ``x-deal-v0`` bundle that carries no
composition.

Depth (presentation contract section 9):

* **L0, what matters:** the deal, the item, the amount and where it stands;
  for a shared copy, which audience it was cut for and what was left out; the
  witness and countersign rungs. A part whose step is withheld shows WITHHELD
  in its place, never a guess.
* **L1, why:** what you asked (in your words, only when their opening matches
  the sealed commitment), what the agent proposed and how it was checked, what
  you approved, the merchant's own evidence, what the agent did, where the deal
  stands, statements made to the other side, what was told to whom, dates,
  cancellations, anomalies and what the receipt does not claim. Each step
  shows its disclosure state and its place in the log; a disclosed step also
  shows the facts it seals.
* **L2, verify:** the verifier's checks as reported, then every record with
  its disclosure state, place in the log and signing key, who sealed them and
  the wording pack this page was worded with.

Every word on the page is the wording pack's or the sealed report's (shown as
capsulectl's sealed text). Nothing is read from a bundle-carried presentation
setting. The module never verifies: the gate and every disclosure state arrive
decided, and committed words go through the core's binding service.

One instance renders one page: it is made with that page's wording pack,
depth, audience and the verifier's assurance for that bundle, and holds the
kit only for the render it is in.
"""
from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from html import escape
from importlib import resources

from ..binding import check_opening
from ..context import VerifiedBundleContext
from ..kit.components import EvidenceItem, Markup, Metric
from ..kit.contract import KitServices, ModuleManifest
from ..registry import Manifest
from ..verifier_report import Assurance
from ..wording import WordingPack
from .model import Binder, Committed, Fact, Item, ReceiptModel, ReceiptUnavailable, Step, build_receipt

DEPTHS = ("L0", "L1", "L2")
# The values this module fills, per wording key; every other key takes none.
PLACEHOLDERS: Mapping[str, frozenset[str]] = {
    "shared.counterparty": frozenset({"kinds"}),
    "shared.adjudicator": frozenset({"kinds"}),
    "countersign.some": frozenset({"statuses"}),
    "merchant.order": frozenset({"order"}),
    "merchant.signature": frozenset({"text"}),
    "merchant.seal": frozenset({"text"}),
    "merchant.approved_basis": frozenset({"basis"}),
    "lifecycle.as_of": frozenset({"text", "at"}),
    "lifecycle.later": frozenset({"text", "at"}),
    "step.position": frozenset({"n", "at"}),
    "step.line": frozenset({"text"}),
    "step.log": frozenset({"seq", "leaf", "log"}),
    "provenance.by": frozenset({"producers"}),
    "wording.provenance": frozenset({"id", "sha"}),
}
SHARED_AUDIENCES = ("counterparty", "adjudicator")


def _load(name: str) -> Manifest:
    return json.loads(resources.files(__package__).joinpath(name).read_text(encoding="utf-8"))


def draft_manifest(raw: Manifest) -> ModuleManifest:
    """The kit contract's draft manifest type, from the contract's JSON form."""
    requires, forbids = raw["requires"], raw.get("forbids", {})
    return ModuleManifest(
        id=raw["id"],
        bundle_kind=requires["bundle_kind"],
        audiences=tuple(raw["audiences"]),
        formats=tuple(raw["formats"]),
        profiles=tuple(requires.get("profiles", ())),
        extensions_required=tuple(requires.get("extensions", {}).get("required", ())),
        forbids=tuple(forbids.get("profiles", ())) + tuple(forbids.get("extensions", ())),
        fallback=raw["fallback"],
        priority=raw.get("priority", 0),
        namespace=raw["spec_version"],
    )


UNILATERAL_MANIFEST = _load("manifest-unilateral.json")


def unilateral_manifest(forbid_profiles: Sequence[str] = ()) -> Manifest:
    """The module's manifest, with *forbid_profiles* added to its ``forbids``.

    The shipped manifest names no producer's profile. A deployment that also
    registers a module selected by a producer-named profile (a rules module,
    say) passes that profile here at render time, like the wording pack, so the
    two can never both match one bundle (contract section 4.4: precedence is
    stated with ``forbids``, never with a number)."""
    forbids = UNILATERAL_MANIFEST["forbids"]
    extra = [p for p in forbid_profiles if p not in forbids["profiles"]]
    return {**UNILATERAL_MANIFEST, "forbids": {**forbids, "profiles": [*forbids["profiles"], *extra]}}


def _m(text: str) -> Markup:
    return Markup(text)


def _el(tag: str, content: str, **attrs: str) -> Markup:
    # ``class_`` is ``class``; every other ``_`` in a keyword is ``-`` (``data_record`` -> ``data-record``).
    rendered = "".join(f' {k.rstrip("_").replace("_", "-")}="{escape(v, quote=True)}"' for k, v in attrs.items())
    body = content if isinstance(content, Markup) else escape(content)
    return _m(f"<{tag}{rendered}>{body}</{tag}>")


def _join(parts: Iterable[str]) -> Markup:
    return Markup("").join(parts)


class UnilateralReceiptModule:
    """``canRender`` / ``buildModel`` / ``render`` over one verified context.
    *pack* supplies every word, *depth* is the shell's opening level,
    *audience* is the audience the page is for (a copy cut for another is
    declined), *assurance* is the verifier's results for this bundle beyond the
    context, *bind* is the core's text-binding service, and *forbid_profiles*
    is render-time manifest configuration (``unilateral_manifest``)."""


    def __init__(
        self,
        pack: WordingPack,
        depth: str = "L0",
        audience: str = "keep",
        assurance: Assurance | None = None,
        bind: Binder = check_opening,
        forbid_profiles: Sequence[str] = (),
    ) -> None:
        if depth not in DEPTHS:
            raise ValueError(f"depth must be one of {DEPTHS}, got {depth!r}")
        self.pack = pack
        self.depth = depth
        self.manifest_json = unilateral_manifest(forbid_profiles)
        self.manifest: ModuleManifest = draft_manifest(self.manifest_json)
        self.audience = audience
        self.assurance = assurance if assurance is not None else Assurance()
        self.bind = bind

    @property
    def title(self) -> str:
        """The page title: chrome, from the wording pack."""
        return self.w("page.title")

    # ---- the contract -------------------------------------------------------

    def canRender(self, context: VerifiedBundleContext) -> bool:  # noqa: N802 -- the contract's member name
        try:
            build_receipt(context, self.bind, self.assurance, self.audience)
        except ReceiptUnavailable:
            # Declining is canRender's answer: resolution moves on to the
            # fallback tier (contract 4.3), and nothing of this module is shown.
            return False
        return True

    def buildModel(self, context: VerifiedBundleContext) -> ReceiptModel:  # noqa: N802 -- the contract's member name
        return build_receipt(context, self.bind, self.assurance, self.audience)

    def render(self, model: ReceiptModel, services: KitServices) -> str:
        # The kit for this render; the helpers below draw with it.
        self.kit = services
        l1_open = self.depth in ("L1", "L2")
        l2_open = self.depth == "L2"
        return str(
            _join(
                [
                    _el("div", self._l0(model), data_level="L0"),
                    _el("div", services.drilldown(self.w("depth.l1"), *self._l1(model, l1_open), expanded=l1_open), data_level="L1"),
                    _el("div", services.drilldown(self.w("depth.l2"), *self._l2(model), expanded=l2_open), data_level="L2"),
                ]
            )
        )

    # ---- words --------------------------------------------------------------

    def w(self, key: str, **values: str) -> str:
        """The pack's words for *key*. A key the pack lacks is shown as such,
        never guessed."""
        text = self.pack.fill(key, **values)
        if text is not None:
            return text
        return f"[{key}]"

    def _enum(self, prefix: str, value: str) -> Markup:
        text = self.pack.get(f"{prefix}.{value}")
        if text is not None:
            return Markup(escape(text))
        return _el("span", value, class_="cv-mono", data_unworded=f"{prefix}.{value}")

    def _p(self, text: str, **attrs: str) -> Markup:
        return _el("p", text, **attrs)

    def _note(self, text: str, **attrs: str) -> Markup:
        return _el("p", text, class_="cv-muted", **attrs)

    # ---- L0 -----------------------------------------------------------------

    def _part(self, part: Fact | str, prefix: str | None = None) -> str:
        if isinstance(part, Fact):
            return str(self._enum(prefix, part.value)) if prefix else part.value
        return self.kit.disclosure_badge(part)

    def _l0(self, model: ReceiptModel) -> Markup:
        h = model.headline
        state = self._enum("state", h.state) if h.state else Markup(escape(self.w("l0.state.missing")))
        metrics = self.kit.metric_grid(
            [
                Metric(self.w("l0.deal_type"), Markup(self._part(h.deal_type, "deal_type"))),
                Metric(self.w("l0.item"), Markup(self._part(h.item))),
                Metric(self.w("l0.amount"), Markup(self._part(h.amount))),
                Metric(self.w("l0.state"), state),
            ]
        )
        parts: list[str] = []
        if model.demo:
            parts.append(_el("p", self.w("badge.demo"), data_demo="true"))
        parts += [_el("h2", self.w("page.title")), _el("div", metrics, data_headline="true")]
        if model.report.audience in SHARED_AUDIENCES:
            kinds = ", ".join(model.report.withheld)
            parts.append(self._p(self.w(f"shared.{model.report.audience}", kinds=kinds), data_shared=model.report.audience))
        if model.report.scope:
            parts.append(self._p(model.report.scope, data_sealed_text="scope"))
        parts.append(self._p(self._witness(model), data_rung="witness"))
        parts.append(self._p(self._countersign(model), data_rung="countersign"))
        return _join(parts)

    def _witness(self, model: ReceiptModel) -> str:
        if model.witnessed == "pass":
            return self.w("rung.witnessed")
        if model.witnessed == "fail":
            return self.w("rung.witness_failed")
        if model.witnessed == "withheld":
            return self.w("rung.unwitnessed")
        return self.w("rung.unreported")

    def _countersign(self, model: ReceiptModel) -> str:
        if not model.countersignatures:
            return self.w("countersign.none")
        return self.w("countersign.some", statuses=", ".join(model.countersignatures))

    # ---- steps --------------------------------------------------------------

    def _step(self, step: Step) -> Markup:
        if step.n is not None and step.at:
            label = self.w("step.position", n=str(step.n), at=step.at)
        else:
            label = self.w("step.unnumbered")
        log = self.w("step.log", seq=str(step.log.seq), leaf=str(step.log.leaf_index), log=step.log.log_id) if step.log else self.w("step.no_log")
        parts: list[str] = [
            self.kit.evidence_details([EvidenceItem(label, step.disclosure, step.capsule_id, note=log)])
        ]
        if step.line:
            parts.append(self._p(self.w("step.line", text=step.line), data_sealed_text="step-line"))
        if step.disclosure == "disclosed":
            facts = [
                _join([_el("dt", self.w(f"fact.{f.name}")),
                       _el("dd", f.value, class_="cv-mono", data_fact=f.name)])
                for f in step.facts
            ]
            if step.record_type:
                facts.insert(0, _join([_el("dt", self.w("step.type")), _el("dd", step.record_type, class_="cv-mono", data_fact="record_type")]))
            parts.append(_el("dl", _join(facts), data_facts="true"))
        attrs = {"data_record": step.capsule_id, "data_disclosure": step.disclosure}
        if step.log:
            attrs["data_log"] = f"{step.log.log_id}:{step.log.seq}:{step.log.leaf_index}"
        return _el("div", _join(parts), **attrs)

    def _steps(self, model: ReceiptModel, ids: Sequence[str]) -> Markup:
        """The steps an item was read from, each as its own record shows it."""
        rows = []
        for cid in ids:
            step = model.step(cid)
            if step is None:
                rows.append(_el("li", _join([self.kit.disclosure_badge("not_present"), " ", _el("span", cid, class_="cv-mono")])))
                continue
            line = step.line or ""
            at = f"{step.at} · " if step.at else ""
            rows.append(
                _el("li", _join([self.kit.disclosure_badge(step.disclosure), " ", _el("span", at + line)]), data_step=cid)
            )
        return _el("ol", _join(rows))

    def _item(self, model: ReceiptModel, item: Item, *, open_: bool, prefix: str = "") -> Markup:
        text = prefix + (f"{item.at} · {item.text}" if item.at else item.text)
        if item.flagged:
            text = "⚠️ " + text
        if not item.steps:
            return self._p(text, data_sealed_text="item")
        return self.kit.drilldown(text, self.kit.section(self.w("steps.summary"), self._steps(model, item.steps), level=4), expanded=open_)

    def _section_steps(self, model: ReceiptModel, section: str) -> list[Markup]:
        return [self._step(s) for s in model.steps if s.section == section]

    # ---- L1 -----------------------------------------------------------------

    def _committed(self, c: Committed, prefix: str) -> Markup:
        if c.state == "opened" and c.text is not None:
            label = ""
            if c.label:
                worded = self.pack.get(f"class.{c.label}")
                label = f"{worded}: " if worded else ""
            return _join(
                [
                    _el("p", f"{label}“{c.text}”", data_committed=prefix, data_state="opened"),
                    self._note(self.w(f"{prefix}.opened")),
                ]
            )
        if c.state == "committed":
            return _join([self.kit.disclosure_badge("committed"), self._note(self.w(f"{prefix}.committed"), data_committed=prefix, data_state="committed")])
        if c.state in ("withheld", "not_present"):
            return _join([self.kit.disclosure_badge(c.state), self._note(self.w(f"{prefix}.{c.state}"), data_committed=prefix, data_state=c.state)])
        return self._p(self.w(f"{prefix}.mismatch"), data_committed=prefix, data_state="mismatch")

    def _l1(self, model: ReceiptModel, open_: bool) -> list[str]:
        r = model.report
        out: list[str] = [self._note(self.w("summary.sealed"), data_sealed="x-deal-v0")]

        out.append(self.kit.section(self.w("section.authorized"), self._committed(model.asked, "asked"), *self._section_steps(model, "authorized")))
        out.append(self.kit.section(self.w("section.proposed"), *self._section_steps(model, "proposed")))
        out.append(self.kit.section(self.w("section.approved"), *self._section_steps(model, "approved")))
        out.append(self.kit.section(self.w("section.merchant"), *self._merchant(model, open_)))

        acted: list[str] = [self._note(self.w("summary.lines"))]
        acted += [self._item(model, i, open_=open_) for i in r.did] or [self._note(self.w("acted.nothing"))]
        if r.money:
            acted.append(self._p(r.money, data_sealed_text="money"))
        acted += self._section_steps(model, "acted")
        if r.did_line:
            acted.append(self._note(r.did_line, data_sealed_text="did-line"))
        out.append(self.kit.section(self.w("section.acted"), *acted))

        if r.lifecycle:
            life: list[str] = [self._p(r.lifecycle, data_sealed_text="lifecycle")]
            life += [
                self._item(model, Item(self.w("lifecycle.later", at=i.at or "", text=i.text), i.steps), open_=open_)
                for i in r.later
            ]
            if r.may_change and r.as_of:
                life.append(self._note(self.w("lifecycle.as_of", text=r.may_change, at=r.as_of), data_sealed_text="may-change"))
            out.append(self.kit.section(self.w("section.lifecycle"), *life))

        if model.statements:
            heading = f"section.statements.{r.audience}" if r.audience in ("keep", *SHARED_AUDIENCES) else "section.statements.keep"
            body = [self._committed(c, "statement") for c in model.statements]
            out.append(self.kit.section(self.w(heading), *body, *self._section_steps(model, "statements")))

        told = [self._item(model, i, open_=open_) for i in r.told] or [self._note(self.w("told.none"))]
        out.append(self.kit.section(self.w("section.told"), *told, self._note(self.w("told.note"))))

        if r.deadlines:
            lines = _el("ul", _join(_el("li", d.text, data_flagged="true" if d.flagged else "false") for d in r.deadlines))
            extra = [self._note(r.deadline_note)] if r.deadline_note else []
            out.append(self.kit.section(self.w("section.deadlines"), lines, *extra))
        for c in r.cancellations:
            shows = self.kit.drilldown(
                self.w("cancellation.shows"),
                _el("ul", _join(_el("li", p) for p in c.proven)),
                self.kit.section(self.w("cancellation.not_shows"), _el("ul", _join(_el("li", p) for p in c.not_proven)), level=4),
                self._steps(model, c.steps),
                expanded=True,
            )
            out.append(self.kit.section(self.w("section.cancellation"), shows))

        anomalies: list[str] = []
        for side, items in (("agent", r.agent_anomalies), ("counterparty", r.counterparty_anomalies)):
            body = [self._item(model, i, open_=open_) for i in items] or [self._note(self.w("anomalies.none"))]
            anomalies.append(self.kit.section(self.w(f"anomalies.{side}"), *body, level=3))
        out.append(self.kit.section(self.w("section.anomalies"), *anomalies))

        other = self._section_steps(model, "other")
        if other:
            out.append(self.kit.section(self.w("section.other"), *other))

        claims = ["claims.tamper", "claims.reported", "claims.merchant"]
        if any(s.disclosure == "withheld" for s in model.steps):
            claims.append("claims.withheld")
        out.append(
            self.kit.section(
                self.w("section.claims"),
                _el("ul", _join(_el("li", self.w(k), data_claim=k) for k in claims)),
                self._note(self.w("claims.scope")),
            )
        )
        return out

    def _merchant(self, model: ReceiptModel, open_: bool) -> list[str]:
        r = model.report
        if not r.merchant:
            return [self._note(self.w("merchant.none"))]
        out: list[str] = [self._note(self.w("merchant.intro"))]
        if r.email_scope:
            out.append(self._p(r.email_scope, data_sealed_text="email-scope"))
        for m in r.merchant:
            rows = []
            for key, value in m.rows:
                label = self.w("merchant.approved_basis", basis=m.approved_basis) if key == "approved" and m.approved_basis else self.w(f"merchant.{key}")
                rows.append([label, value])
            body: list[str] = [
                self._p(self.w("merchant.signature", text=m.merchant_says), data_merchant_verified="true" if m.verified else "false"),
                self._note(self.w("merchant.seal", text=m.we_say)),
            ]
            if m.key_supplied:
                body.append(self._p(self.w("merchant.key_supplied")))
            if rows:
                body.append(self._facts_table(rows))
            body.append(self._steps(model, m.steps))
            title = self.w("merchant.order", order=m.order_id) if m.order_id else self.w("merchant.email")
            out.append(self.kit.drilldown(title, *body, expanded=True))
        return out

    def _facts_table(self, rows: Sequence[Sequence[str]]) -> Markup:
        return _el("dl", _join(_join([_el("dt", label), _el("dd", value)]) for label, value in rows))

    # ---- L2 -----------------------------------------------------------------

    def _l2(self, model: ReceiptModel) -> list[str]:
        out: list[str] = [self.kit.verification_details(model.verification)]
        if model.bundle_digest:
            out.append(_el("p", _join([self.w("l2.bundle_digest"), " ", _el("span", model.bundle_digest, class_="cv-mono", data_bundle_digest="true")])))
        rows = []
        for s in model.steps:
            position = str(s.n) if s.n is not None else (self.w("records.report") if s.section == "report" else "")
            kind = s.record_type or self.w("records.unknown")
            log = self.w("step.log", seq=str(s.log.seq), leaf=str(s.log.leaf_index), log=s.log.log_id) if s.log else self.w("step.no_log")
            rows.append([position, kind, self.kit.disclosure_badge(s.disclosure), log, _el("span", s.capsule_id, class_="cv-mono")])
        out.append(
            self.kit.section(
                self.w("section.records"),
                self.kit.data_table(
                    [self.w("records.step"), self.w("records.kind"), self.w("records.disclosure"), self.w("records.log"), self.w("records.id")],
                    rows,
                ),
                level=3,
            )
        )
        producers = self.w("provenance.then").join(p if p is not None else self.w("provenance.unrecorded") for p in model.producers)
        prov: list[str] = [self._note(self.w("provenance.by", producers=producers), data_provenance="true")]
        if model.report.instructions:
            prov.append(self._note(model.report.instructions, data_sealed_text="instructions"))
        prov.append(self._note(self.w("wording.provenance", id=self.pack.id, sha=self.pack.wording_sha256 or "-")))
        out.append(self.kit.section(self.w("section.provenance"), *prov, level=3))
        return out
