# SPDX-License-Identifier: Apache-2.0
"""The presentation-module contract -- a LOCAL DRAFT.

The normative module interface belongs to agent-action-capsule's presentation
contract, which has not landed. Until it does, this file is the draft the kit
is tested against, written so re-pointing it is mechanical:

* member names are the contract's own spelling (``manifest``, ``canRender``,
  ``buildModel``, ``render``), not Python-cased, so nothing is renamed later;
* ``Context`` stands in for the verified-bundle context type and becomes an
  import of it; the kit and every module only ever READ a context;
* ``ModuleManifest`` carries the manifest fields the plan names and is replaced
  by (or validated against) the contract's manifest schema.

The pattern: one ``typing.Protocol`` per output kind, plus a conformance check
every module must pass. A module produces exactly one output kind today --
an HTML fragment built from kit services (``HtmlPresentationModule``). Offline
page, permalink and embedded are the shell's packaging of that fragment, not
module outputs. ``KitServices`` is the Protocol the kit itself satisfies, so a
module is written against the Protocol, never the concrete functions.

A module never verifies. ``render`` receives a model built from an
already-verified context and the kit; it has no verifier to call.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from . import components as _c

# Draft stand-in for the verified-bundle context type (see module docstring).
Context = object

DRAFT_MANIFEST_NAMESPACE = "aac.presentation-manifest/v0"
REQUIRED_MODULE_MEMBERS: tuple[str, ...] = ("manifest", "canRender", "buildModel", "render")
_METHODS: tuple[str, ...] = ("canRender", "buildModel", "render")


@dataclass(frozen=True)
class ModuleManifest:
    """Declarative description of what a module can present."""

    id: str
    bundle_kind: str
    audiences: tuple[str, ...]
    formats: tuple[str, ...] = ("html",)
    profiles: tuple[str, ...] = ()
    extensions_required: tuple[str, ...] = ()
    forbids: tuple[str, ...] = ()
    fallback: bool = False
    priority: int = 0
    namespace: str = DRAFT_MANIFEST_NAMESPACE


@runtime_checkable
class KitServices(Protocol):
    """The kit primitives a module renders with."""

    def section(self, title: str, *children: str, level: int = 2) -> str: ...
    def metric_grid(self, metrics: Sequence[_c.Metric]) -> str: ...
    def data_table(self, columns: Sequence[str], rows: Sequence[Sequence[str]], caption: str = "") -> str: ...
    def calendar_grid(self, year: int, month: int, marks: Mapping[int, Sequence[_c.CalendarMark]]) -> str: ...
    def disclosure_badge(self, state: str) -> str: ...
    def verdict_pill(self, verdict: str) -> str: ...
    def citation_list(self, citations: Sequence[_c.Citation]) -> str: ...
    def drilldown(self, summary: str, *children: str, expanded: bool = False) -> str: ...
    def evidence_details(self, items: Sequence[_c.EvidenceItem]) -> str: ...
    def verification_details(self, result: _c.VerificationResult) -> str: ...
    def party_card(self, party: _c.Party) -> str: ...
    def timeline(self, events: Sequence[_c.TimelineEvent]) -> str: ...


@runtime_checkable
class HtmlPresentationModule(Protocol):
    """A module whose output kind is an HTML fragment."""

    manifest: ModuleManifest

    def canRender(self, context: Context) -> bool: ...
    def buildModel(self, context: Context) -> object: ...
    def render(self, model: object, services: KitServices) -> str: ...


class Kit:
    """The concrete ``KitServices``: the component functions, as methods."""

    section = staticmethod(_c.section)
    metric_grid = staticmethod(_c.metric_grid)
    data_table = staticmethod(_c.data_table)
    calendar_grid = staticmethod(_c.calendar_grid)
    disclosure_badge = staticmethod(_c.disclosure_badge)
    verdict_pill = staticmethod(_c.verdict_pill)
    citation_list = staticmethod(_c.citation_list)
    drilldown = staticmethod(_c.drilldown)
    evidence_details = staticmethod(_c.evidence_details)
    verification_details = staticmethod(_c.verification_details)
    party_card = staticmethod(_c.party_card)
    timeline = staticmethod(_c.timeline)


KIT = Kit()


class ModuleContractError(TypeError):
    """A module does not satisfy the presentation-module contract."""


def check_module(module: object) -> None:
    """Structural conformance: every required member present, methods callable,
    and a ``ModuleManifest`` with a non-empty id in the draft namespace.

    Raises ``ModuleContractError`` naming every problem at once.
    """
    problems = [f"missing {name}" for name in REQUIRED_MODULE_MEMBERS if not hasattr(module, name)]
    problems += [
        f"{name} is not callable" for name in _METHODS if hasattr(module, name) and not callable(getattr(module, name))
    ]
    manifest = getattr(module, "manifest", None)
    if manifest is not None:
        if not isinstance(manifest, ModuleManifest):
            problems.append(f"manifest is {type(manifest).__name__}, not ModuleManifest")
        else:
            if not manifest.id:
                problems.append("manifest.id is empty")
            if manifest.namespace != DRAFT_MANIFEST_NAMESPACE:
                problems.append(f"manifest.namespace {manifest.namespace!r} != {DRAFT_MANIFEST_NAMESPACE!r}")
    if problems:
        raise ModuleContractError(f"{type(module).__name__}: " + "; ".join(problems))


def check_module_renders(module: HtmlPresentationModule, context: Context) -> str:
    """Behavioural conformance over one context the module claims it can render:
    ``canRender`` says yes, ``buildModel`` then ``render`` with the kit yields an
    HTML fragment with no script and no link. Returns the fragment."""
    check_module(module)
    if module.canRender(context) is not True:
        raise ModuleContractError(f"{module.manifest.id}: canRender returned non-True for its own fixture")
    html = module.render(module.buildModel(context), KIT)
    if not isinstance(html, str):
        raise ModuleContractError(f"{module.manifest.id}: render returned {type(html).__name__}, not str")
    lowered = html.lower()
    for forbidden in ("<script", "href=", "src=", "<style", "style="):
        if forbidden in lowered:
            raise ModuleContractError(f"{module.manifest.id}: render output contains {forbidden!r}")
    return html
