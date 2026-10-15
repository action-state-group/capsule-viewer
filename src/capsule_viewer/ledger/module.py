# SPDX-License-Identifier: Apache-2.0
"""The Ledger module (``capsuleviewer.ledger/v0``): every record of a verified
bundle as one row, the way capsule-emit's ``ledger view --html`` drew a ledger.

The display semantics are capsule-emit's ``viewer.render_html``, moved here:
the action (``action_id`` up to its first ``/``), the actor with its lineage
label (an authority grant, an act under a grant, a confirmation, a memory
delta, or a refusal over a grant's authority), the disposition's verdict, the
effect's type and status, the chain label, each recorded gate check and the
record's time. A record whose disposition is ``denied``, or whose verdict is
``blocked`` or ``denied``, is a refusal: its row says so and the summary counts
it.

Depth (contract section 9): L0 is the ledger's name and its record and
refusal counts; L1 the rows, in one disclosure that is open at L1 and L2. L2
is the core's: the page's shell follows the module with the verifier's
checks, every record's position, identity and signature among them. The
module adds no L2 detail.

The module never verifies. It reads only the records from the context;
whether each record is intact and signed is the verifier's, shown in the
core's L2, never worked out by a row. Every value it shows is the record's,
escaped by the kit.

Manifest: a fallback over any ``evidence-bundle/v2``. It is the floor of the
ledger page's own registry and an alternative to agent-action-capsule's
``aac.builtin.no-aggregate/v0``: the two are never registered together, and a
registry refuses to hold both (contract section 4.5).
"""
from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from html import escape
from importlib import resources

from ..context import Frozen, VerifiedBundleContext
from ..kit.components import Markup, Metric
from ..kit.contract import KitServices, ModuleManifest

TITLE = "Capsule ledger"
DEPTHS = ("L0", "L1", "L2")
COLUMNS = ("Capsule id", "Action", "Actor", "Verdict", "Effect", "Chain", "Time")

# capsule-emit's effect status words, as its ledger view showed them.
_STATUS = {"confirmed": "applied", "dispatched": "applied", "planned": "pending", "failed": "rejected"}
_TONE = {"executed": "positive", "blocked": "negative", "denied": "negative", "pending": "caution"}


def _load_manifest() -> dict:
    return json.loads(resources.files(__package__).joinpath("manifest.json").read_text(encoding="utf-8"))


MANIFEST = _load_manifest()


@dataclass(frozen=True)
class GateCheck:
    name: str
    passed: bool
    reason: str


@dataclass(frozen=True)
class Row:
    capsule_id: str
    action: str
    actor: str
    verdict: str
    effect: str
    chain: str
    time: str
    refusal: bool
    gate_checks: tuple[GateCheck, ...]


@dataclass(frozen=True)
class LedgerModel:
    source: str
    rows: tuple[Row, ...]

    @property
    def refusals(self) -> int:
        return sum(1 for row in self.rows if row.refusal)


def _get(value: Frozen, key: str) -> Frozen:
    return value.get(key) if isinstance(value, Mapping) else None


def _text(value: Frozen) -> str:
    return "" if value is None or isinstance(value, (Mapping, tuple)) else str(value)


def _actor(record: Frozen, status: str, decision: str, relation: str, parent: str) -> str:
    short = parent[:8]
    if not parent and _text(_get(_get(record, "effect"), "type")) == "memory_write":
        return f"{_text(_get(record, 'operator')) or 'operator'} (authority-grant)"
    if status == "planned" and decision == "denied":
        return f"agent [↑ grant:{short}] — REFUSED (over-authority)"
    if relation == "acted_under_authority":
        return f"agent [↑ grant:{short}]"
    if relation == "confirms":
        return f"agent [↑ dispatched:{short}] (confirmed)"
    if relation == "memory_delta":
        return "agent (memory-delta)"
    return _text(_get(record, "developer")) or "agent"


def _gate_checks(record: Frozen) -> tuple[GateCheck, ...]:
    checks = _get(_get(_get(record, "model_attestation"), "compute_attestation"), "gate_checks")
    if not isinstance(checks, tuple):
        return ()
    return tuple(
        GateCheck(_text(_get(c, "name")), _get(c, "passed") is not False, _text(_get(c, "reason")))
        for c in checks
        if isinstance(c, Mapping)
    )


def row(record: Frozen) -> Row:
    """One record's display fields."""
    effect, disposition, chain = _get(record, "effect"), _get(record, "disposition"), _get(record, "chain")
    status = _text(_get(effect, "status"))
    decision = _text(_get(disposition, "decision"))
    verdict = _text(_get(disposition, "verdict_class")) or decision
    relation, parent = _text(_get(chain, "relation")), _text(_get(chain, "parent_capsule_id"))
    shown_status = "rejected" if decision == "denied" else _STATUS.get(status, status)
    action_id = _text(_get(record, "action_id")) or "?"
    chain_label = ""
    if parent:
        chain_label = f"{relation}→{parent[:8]}…" if relation else f"→{parent[:8]}…"
    return Row(
        capsule_id=_text(_get(record, "capsule_id")) or "?",
        action=action_id.split("/")[0],
        actor=_actor(record, status, decision, relation, parent),
        verdict=verdict,
        effect=":".join(part for part in (_text(_get(effect, "type")), shown_status) if part),
        chain=chain_label,
        time=(_text(_get(record, "ts")) or _text(_get(record, "timestamp")))[:19],
        refusal=decision == "denied" or verdict in ("blocked", "denied"),
        gate_checks=_gate_checks(record),
    )


def _span(cls: str, text: str, **data: str) -> Markup:
    attrs = (f' class="{cls}"' if cls else "") + "".join(f' data-{k}="{escape(v, quote=True)}"' for k, v in data.items())
    return Markup(f"<span{attrs}>") + text + Markup("</span>")


def _actor_cell(r: Row) -> Markup:
    cell = _span("cv-tone--negative" if r.refusal else "", r.actor)
    for check in r.gate_checks:
        mark = "✓" if check.passed else "✗"
        line = f"{mark} {check.name}" + (f" ({check.reason})" if check.reason else "")
        cell += Markup("<br>") + _span(
            "cv-muted" if check.passed else "cv-tone--negative", line, gate=("pass" if check.passed else "fail")
        )
    return cell


def _verdict_cell(r: Row) -> Markup:
    if not r.verdict:
        return Markup("")
    tone = _TONE.get(r.verdict, "neutral")
    return _span(f"cv-pill cv-tone--{tone}", r.verdict, refusal=("true" if r.refusal else "false"))


class LedgerModule:
    """``capsuleviewer.ledger/v0``. ``source`` names the ledger on the page; it
    is the caller's (a path), never read from the bundle."""

    manifest_json = MANIFEST
    manifest = ModuleManifest(
        id=MANIFEST["id"],
        bundle_kind=MANIFEST["requires"]["bundle_kind"],
        audiences=tuple(MANIFEST["audiences"]),
        formats=tuple(MANIFEST["formats"]),
        fallback=MANIFEST["fallback"],
        namespace=MANIFEST["spec_version"],
    )
    title = TITLE

    def __init__(self, source: str = "", depth: str = "L1") -> None:
        if depth not in DEPTHS:
            raise ValueError(f"depth must be one of {DEPTHS}, got {depth!r}")
        self.source = source
        self.depth = depth

    def canRender(self, context: VerifiedBundleContext) -> bool:
        return context.verified and isinstance(_get(context.bundle, "records"), tuple)

    def buildModel(self, context: VerifiedBundleContext) -> LedgerModel:
        records = _get(context.bundle, "records")
        if not context.verified or not isinstance(records, tuple):
            raise ValueError(f"{self.manifest.id}: buildModel called on a context canRender refuses")
        return LedgerModel(self.source, tuple(row(r) for r in records if isinstance(r, Mapping)))

    def render(self, model: LedgerModel, services: KitServices) -> str:
        metrics = [Metric("Records", str(len(model.rows))), Metric("Refusals", str(model.refusals))]
        if model.source:
            metrics.insert(0, Metric("Ledger", model.source))
        table = services.data_table(
            COLUMNS,
            [
                (
                    _span("cv-mono", r.capsule_id[:16]),
                    r.action,
                    _actor_cell(r),
                    _verdict_cell(r),
                    r.effect,
                    r.chain,
                    _span("cv-mono", r.time),
                )
                for r in model.rows
            ],
        )
        rows = services.drilldown(f"Records ({len(model.rows)})", table, expanded=self.depth != "L0")
        return str(
            Markup(f'<div class="cv-ledger" data-module="{escape(self.manifest.id)}" data-depth="{self.depth}">')
            + Markup('<div data-level="L0">')
            + services.metric_grid(metrics)
            + Markup('</div><div data-level="L1">')
            + rows
            + Markup("</div></div>")
        )

