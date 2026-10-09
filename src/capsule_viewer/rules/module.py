# SPDX-License-Identifier: Apache-2.0
"""The Rules module: one page over a rules-comparison record.

The record kind is the deployer's: the root's ``agent_input.spec_version``
names it, and whoever deploys the module supplies that name at render time
(``record_kind``), like the wording pack. The manifest's required profile is
built from it, so this repository names no producer's record kind.

Input is the record's structured comparison (``RulesComparison/v0``): per rule,
``rule_id``, ``action_state.disposition`` and ``.assurance``,
``platform_baseline.status`` and ``.assurance``, and ``capability_refs``. Every
one is an id or an enum. The module's words come from the wording pack the
page is given; it turns enums into wording keys and never reads a word from the
bundle. The exceptions: ``platform.display_name``, which names the platform the
baseline describes and is shown as text inside a pack entry; the kit's own fixed
vocabulary (disclosure badges, verification outcomes); and identifiers shown raw
(rule ids, enum tokens and member names in L2).

Depth (presentation contract section 9):

* L0, what matters: one summary line, the number of rules and how many of them
  go ahead, ask you first, or will not do it and will not ask.
* L1, why: one row per rule (what it covers, what happens, what the platform
  does today), each opening onto how it is decided, what it applies to and how
  the platform's part is known.
* L2, verify: collapsed at the bottom. The verifier's checks, then the record's
  identifiers: capsule id, checkpoint position, pack id and definition digest,
  baseline envelope digest, each rule's raw tokens, every disclosure state, the
  ``wording_sha256`` of the pack used for this page, and any legacy
  ``report/v1`` rows the bundle also carries, as the producer wrote them.

The module never verifies. It reads only what the context resolved as
disclosed, and counts per disposition are a recount of the rows it shows.
"""
from __future__ import annotations

import copy
import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from html import escape
from importlib import resources
from typing import TypedDict

from ..context import DISCLOSABLE_MEMBERS, Frozen, VerifiedBundleContext
from ..kit.components import Citation, EvidenceItem, Markup, Metric
from ..kit.contract import KitServices, ModuleManifest
from ..wording import WORDING_KEY, WordingPack

# A profile token's value (the manifest schema's ProfileToken, after the key).
RECORD_KIND_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/@+-]*$")
COMPARISON_SCHEMA = "RulesComparison/v0"
LEGACY_ROWS = "report/v1"
DEPTHS = ("L0", "L1", "L2")
# Dispositions in the order the summary line counts them. Any other value is
# still counted and shown, as unrecognized.
DISPOSITIONS = ("DO", "ASK", "NEVER")
# The placeholders this module fills, per wording key. Any other key takes none.
PLACEHOLDERS: Mapping[str, frozenset[str]] = {
    "l0.summary.total": frozenset({"total"}),
    **{f"l0.summary.{d.lower()}": frozenset({"n"}) for d in DISPOSITIONS},
    "l1.column.platform": frozenset({"platform"}),
    "l2.position": frozenset({"log", "seq", "leaf"}),
}
# Each enum's values exactly as RulesComparison/v0 spells them, by wording-key
# prefix. A value spelled any other way is unrecognized, even when its
# lower-cased form would find an entry.
ENUMS: Mapping[str, frozenset[str]] = {
    "disposition.": frozenset(DISPOSITIONS),
    "mechanism.": frozenset({"ENFORCED", "ASKED", "UNKNOWN"}),
    "baseline.": frozenset(
        {
            "native_approval_required",
            "mechanically_enforced",
            "partly_protected",
            "model_judgment_only",
            "none_established",
            "not_currently_available",
            "unknown",
        }
    ),
    "basis.": frozenset(
        {
            "directly_observed",
            "visible_in_settings",
            "documented_by_platform",
            "model_instruction",
            "platform_self_report",
            "inferred",
            "unknown",
        }
    ),
    "capability.": frozenset(
        {
            "money.purchase",
            "money.transfer",
            "money.subscription",
            "money.refund",
            "booking.create",
            "booking.modify",
            "booking.cancel",
            "communication.send",
            "communication.publish",
            "disclosure.personal",
            "disclosure.secret",
            "agreement.accept",
            "marketplace.offer",
            "marketplace.sale",
            "data.delete",
            "account.security_change",
            "background.schedule",
            "external_commitment.other",
        }
    ),
}


class _Extensions(TypedDict, total=False):
    required: list[str]


class _Requires(TypedDict, total=False):
    bundle_kind: str
    profiles: list[str]
    extensions: _Extensions


class _Forbids(TypedDict, total=False):
    profiles: list[str]
    extensions: list[str]


class _Executable(TypedDict, total=False):
    carrier: str


class PresentationManifestJson(TypedDict, total=False):
    """``aac.presentation-manifest/v0``, the members this module's manifest uses."""

    spec_version: str
    id: str
    presentation_api: str
    runtime_min: str
    trust_class: str
    requires: _Requires
    forbids: _Forbids
    audiences: list[str]
    formats: list[str]
    fallback: bool
    priority: int
    executable: _Executable


def _load_manifest() -> PresentationManifestJson:
    return json.loads(resources.files(__package__).joinpath("manifest.json").read_text(encoding="utf-8"))


# Every manifest member except the required profile, which rules_manifest adds.
BASE_MANIFEST = _load_manifest()


def rules_manifest(record_kind: str) -> PresentationManifestJson:
    """The module's manifest for rules-comparison records of *record_kind*: it
    requires the profile ``spec_version:<record_kind>``."""
    if not RECORD_KIND_PATTERN.match(record_kind):
        raise ValueError(f"record_kind {record_kind!r} is not a profile token value")
    manifest = copy.deepcopy(BASE_MANIFEST)
    manifest["requires"]["profiles"] = [f"spec_version:{record_kind}"]
    return manifest


def _draft_manifest(raw: PresentationManifestJson) -> ModuleManifest:
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


# ---- Model ------------------------------------------------------------------


@dataclass(frozen=True)
class RuleRow:
    rule_id: str
    disposition: str
    mechanism: str  # action_state.assurance
    baseline_status: str
    baseline_basis: str  # platform_baseline.assurance
    capability_refs: tuple[str, ...]


@dataclass(frozen=True)
class LegacyRow:
    capsule_id: str
    row_id: str
    status: str
    label: str
    reason: str


@dataclass(frozen=True)
class Position:
    log_id: str
    seq: str
    leaf_index: str


@dataclass(frozen=True)
class DisclosureLine:
    capsule_id: str
    member: str
    state: str


@dataclass(frozen=True)
class RulesModel:
    root: str
    platform: str
    pack_id: str
    pack_digest: str
    envelope_sha256: str
    rows: tuple[RuleRow, ...]
    counts: tuple[tuple[str, int], ...]
    position: Position | None
    positions: tuple[tuple[str, Position | None], ...]
    disclosures: tuple[DisclosureLine, ...]
    legacy: tuple[LegacyRow, ...]
    verification: object


def _str(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _strings(value: object) -> tuple[str, ...] | None:
    if not isinstance(value, Sequence) or isinstance(value, str):
        return None
    items = tuple(item for item in value if isinstance(item, str))
    return items if len(items) == len(value) else None


def _row(raw: object) -> RuleRow | None:
    if not isinstance(raw, Mapping):
        return None
    action_state, baseline = raw.get("action_state"), raw.get("platform_baseline")
    if not isinstance(action_state, Mapping) or not isinstance(baseline, Mapping):
        return None
    fields = (
        _str(raw.get("rule_id")),
        _str(action_state.get("disposition")),
        _str(action_state.get("assurance")),
        _str(baseline.get("status")),
        _str(baseline.get("assurance")),
    )
    refs = _strings(baseline.get("capability_refs"))
    if any(value is None for value in fields) or refs is None:
        return None
    return RuleRow(*fields, refs)


def _comparison(context: VerifiedBundleContext, record_kind: str) -> Mapping[str, Frozen] | None:
    """The root's disclosed comparison, when the root is a *record_kind* record."""
    if context.root is None or f"spec_version:{record_kind}" not in context.profiles():
        return None
    output = context.disclosed(context.root, "agent_output")
    if isinstance(output, Mapping) and output.get("schema") == COMPARISON_SCHEMA:
        return output
    return None


def _parse(comparison: Mapping[str, Frozen]) -> tuple[str, str, str, str, tuple[RuleRow, ...]] | None:
    pack, platform, raw_rows = comparison.get("pack"), comparison.get("platform"), comparison.get("rows")
    if not isinstance(pack, Mapping) or not isinstance(platform, Mapping):
        return None
    if not isinstance(raw_rows, Sequence) or isinstance(raw_rows, str) or not raw_rows:
        return None
    head = (
        _str(platform.get("display_name")),
        _str(pack.get("pack_id")),
        _str(pack.get("definition_digest")),
        _str(comparison.get("baseline_envelope_sha256")),
    )
    rows = tuple(_row(raw) for raw in raw_rows)
    if any(value is None for value in head) or any(row is None for row in rows):
        return None
    return (*head, rows)


def _position(context: VerifiedBundleContext, capsule_id: str) -> Position | None:
    entry = context.memberships.get(capsule_id)
    coords = entry.get("log_coordinates") if isinstance(entry, Mapping) else None
    if not isinstance(coords, Mapping):
        return None
    log_id, seq, leaf = coords.get("log_id"), coords.get("seq"), coords.get("leaf_index")
    if not isinstance(log_id, str) or not isinstance(seq, int) or not isinstance(leaf, int):
        return None
    return Position(log_id, str(seq), str(leaf))


def _legacy_rows(context: VerifiedBundleContext) -> tuple[LegacyRow, ...]:
    rows: list[LegacyRow] = []
    for capsule_id in context.records:
        payload = context.disclosed(capsule_id, "agent_input")
        if not isinstance(payload, Mapping) or payload.get("spec_version") != LEGACY_ROWS:
            continue
        raw_rows = payload.get("rows")
        for raw in raw_rows if isinstance(raw_rows, Sequence) and not isinstance(raw_rows, str) else ():
            if isinstance(raw, Mapping):
                rows.append(
                    LegacyRow(
                        capsule_id,
                        _str(raw.get("row_id")) or "",
                        _str(raw.get("status")) or "",
                        _str(raw.get("label")) or "",
                        _str(raw.get("reason")) or "",
                    )
                )
    return tuple(rows)


def _counts(rows: Sequence[RuleRow]) -> tuple[tuple[str, int], ...]:
    seen = [*DISPOSITIONS, *sorted({row.disposition for row in rows} - set(DISPOSITIONS))]
    return tuple((d, sum(1 for row in rows if row.disposition == d)) for d in seen)


# ---- Rendering helpers -------------------------------------------------------


def _element(tag: str, text: str, cls: str = "", **data: str) -> Markup:
    attrs = f' class="{escape(cls)}"' if cls else ""
    attrs += "".join(f' data-{key.replace("_", "-")}="{escape(value, quote=True)}"' for key, value in data.items())
    body = text if isinstance(text, Markup) else escape(text)
    return Markup(f"<{tag}{attrs}>{body}</{tag}>")


def _span(text: str, cls: str = "", **data: str) -> Markup:
    return _element("span", text, cls, **data)


def _p(*children: str, **data: str) -> Markup:
    attrs = "".join(f' data-{key.replace("_", "-")}="{escape(value, quote=True)}"' for key, value in data.items())
    return Markup(f"<p{attrs}>") + Markup("").join(children) + Markup("</p>")


def _region(level: str, *children: str) -> Markup:
    return Markup(f'<div class="cv-rules__level" data-level="{level}">') + Markup("").join(children) + Markup("</div>")


class _Words:
    """Wording lookups against one pack. A missing label shows its key; an enum
    value with no entry shows the raw token, marked unrecognized."""

    def __init__(self, pack: WordingPack) -> None:
        self.pack = pack

    def text(self, key: str, **values: str) -> str:
        """Plain text, for a kit argument the kit escapes (a title, a column
        name, a summary). A missing entry is its key."""
        text = self.pack.fill(key, **values)
        return key if text is None else text

    def label(self, key: str, **values: str) -> Markup:
        text = self.pack.fill(key, **values)
        if text is None:
            return _span(key, "cv-muted", wording_missing=key)
        return _span(text)

    def enum(self, prefix: str, token: str) -> Markup:
        key = prefix + token.lower()
        known = token in ENUMS.get(prefix, frozenset())
        text = self.pack.get(key) if known and WORDING_KEY.match(key) else None
        if text is None:
            return _span(
                Markup("").join([self.label("unrecognized"), Markup(" "), _span(token, "cv-mono")]),
                "cv-refusal",
                unrecognized=token,
            )
        return _span(text, token=token)

    def rule(self, rule_id: str) -> str:
        """What the rule covers, or its id when the pack has no words for it."""
        return self.pack.get("rule." + rule_id) or rule_id


# ---- The module --------------------------------------------------------------


class RulesModule:
    """``capsuleviewer.rules/v0``: a trusted-executable module. ``pack`` is the
    wording pack (already checked against its ``wording_sha256``),
    ``record_kind`` the rules-comparison record kind the deployer renders, and
    ``depth`` the shell's opening level; none of them comes from the bundle."""

    def __init__(self, pack: WordingPack, record_kind: str, depth: str = "L0") -> None:
        if depth not in DEPTHS:
            raise ValueError(f"depth must be one of {DEPTHS}, got {depth!r}")
        self.pack = pack
        self.record_kind = record_kind
        self.depth = depth
        self.manifest_json = rules_manifest(record_kind)
        self.manifest = _draft_manifest(self.manifest_json)

    def canRender(self, context: VerifiedBundleContext) -> bool:
        comparison = _comparison(context, self.record_kind)
        return comparison is not None and _parse(comparison) is not None

    def buildModel(self, context: VerifiedBundleContext) -> RulesModel:
        comparison = _comparison(context, self.record_kind)
        parsed = _parse(comparison) if comparison is not None else None
        if parsed is None or context.root is None:
            raise ValueError(f"{self.manifest.id}: buildModel called on a context canRender refuses")
        platform, pack_id, pack_digest, envelope, rows = parsed
        disclosures = tuple(
            DisclosureLine(capsule_id, member, context.disclosures[capsule_id][member].state)
            for capsule_id in context.records
            for member in DISCLOSABLE_MEMBERS
        )
        return RulesModel(
            root=context.root,
            platform=platform,
            pack_id=pack_id,
            pack_digest=pack_digest,
            envelope_sha256=envelope,
            rows=rows,
            counts=_counts(rows),
            position=_position(context, context.root),
            positions=tuple((capsule_id, _position(context, capsule_id)) for capsule_id in context.records),
            disclosures=disclosures,
            legacy=_legacy_rows(context),
            verification=context.verification,
        )

    def render(self, model: RulesModel, services: KitServices) -> str:
        words = _Words(self.pack)
        body = [
            _region("L0", self._level0(model, words, services)),
            _region("L1", self._level1(model, words, services)),
            _region("L2", self._level2(model, words, services)),
        ]
        sha = self.pack.wording_sha256
        return str(
            Markup(
                f'<div class="cv-rules" data-module="{escape(self.manifest.id)}" '
                f'data-depth="{self.depth}" data-wording-sha256="{escape(sha)}">'
            )
            + Markup("").join(body)
            + Markup("</div>")
        )

    def _level0(self, model: RulesModel, words: _Words, services: KitServices) -> Markup:
        parts = [words.label("l0.summary.total", total=str(len(model.rows)))]
        for disposition, n in model.counts:
            key = "l0.summary." + disposition.lower()
            if disposition in DISPOSITIONS:
                part = words.label(key, n=str(n))
            else:
                part = Markup("").join([_span(str(n)), Markup(" "), words.enum("disposition.", disposition)])
            parts.append(_span(part, disposition=disposition, count=str(n)))
        line = Markup(" · ").join(parts)
        return services.section(words.text("l0.heading"), _p(line, l0_summary="true"))

    def _level1(self, model: RulesModel, words: _Words, services: KitServices) -> Markup:
        expanded = self.depth in ("L1", "L2")
        table_rows = []
        for row in model.rows:
            applies = (
                Markup(", ").join(words.enum("capability.", ref) for ref in row.capability_refs)
                if row.capability_refs
                else words.label("l1.applies.none")
            )
            details = services.metric_grid(
                [
                    Metric(words.text("l1.detail.mechanism"), words.enum("mechanism.", row.mechanism)),
                    Metric(words.text("l1.detail.applies"), applies),
                    Metric(words.text("l1.detail.basis"), words.enum("basis.", row.baseline_basis)),
                ]
            )
            covers = services.drilldown(words.rule(row.rule_id), details, expanded=expanded)
            table_rows.append(
                [
                    _element("div", covers, rule=row.rule_id),
                    words.enum("disposition.", row.disposition),
                    words.enum("baseline.", row.baseline_status),
                ]
            )
        columns = [
            words.text("l1.column.rule"),
            words.text("l1.column.happens"),
            words.text("l1.column.platform", platform=model.platform),
        ]
        return services.section(words.text("l1.heading"), services.data_table(columns, table_rows))

    def _level2(self, model: RulesModel, words: _Words, services: KitServices) -> Markup:
        ids = [
            Citation(words.text("l2.record"), model.root),
            Citation(words.text("l2.pack"), model.pack_id),
            Citation(words.text("l2.pack_digest"), model.pack_digest),
            Citation(words.text("l2.envelope"), model.envelope_sha256),
            Citation(words.text("l2.wording"), self.pack.wording_sha256 or words.text("l2.wording.refused")),
        ]
        if model.position is None:
            position = words.label("l2.position.none")
        else:
            position = words.label(
                "l2.position", log=model.position.log_id, seq=model.position.seq, leaf=model.position.leaf_index
            )
        tokens = services.data_table(
            [words.text(f"l2.column.{name}") for name in ("rule_id", "disposition", "mechanism", "status", "basis", "applies")],
            [
                [
                    _span(row.rule_id, "cv-mono", rule_id=row.rule_id),
                    _span(row.disposition, "cv-mono"),
                    _span(row.mechanism, "cv-mono"),
                    _span(row.baseline_status, "cv-mono"),
                    _span(row.baseline_basis, "cv-mono"),
                    _span(" ".join(row.capability_refs), "cv-mono"),
                ]
                for row in model.rows
            ],
        )
        disclosures = services.evidence_details(
            [
                EvidenceItem(f"{line.member} · {line.capsule_id}", _BADGE.get(line.state, line.state))
                for line in model.disclosures
            ]
        )
        records = services.citation_list(
            [
                Citation(
                    words.text("l2.position.none")
                    if where is None
                    else words.text("l2.position", log=where.log_id, seq=where.seq, leaf=where.leaf_index),
                    capsule_id,
                )
                for capsule_id, where in model.positions
            ]
        )
        parts = [
            services.verification_details(model.verification),
            services.citation_list(ids),
            _p(position, position="true"),
            services.section(words.text("l2.records"), records, level=3),
            _p(words.label("l2.activation.none"), activation="not-recorded"),
            services.section(words.text("l2.rules"), tokens, level=3),
            services.section(words.text("l2.disclosures"), disclosures, level=3),
        ]
        if model.legacy:
            legacy = services.data_table(
                [words.text(f"l2.legacy.column.{name}") for name in ("row", "status", "label", "reason")],
                [[_span(r.row_id, "cv-mono", legacy_row=r.row_id), r.status, r.label, r.reason] for r in model.legacy],
            )
            parts.append(services.section(words.text("l2.legacy"), legacy, level=3))
        return services.drilldown(words.text("l2.heading"), *parts, expanded=self.depth == "L2")


# The context's disclosure states in the kit's DisclosureBadge vocabulary. A
# verified bundle has no mismatch; one would reach the badge unmapped and be
# shown as the badge's refusal, never as another state.
_BADGE = {"disclosed": "disclosed", "withheld": "withheld"}
