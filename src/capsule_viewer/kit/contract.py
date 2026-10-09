# SPDX-License-Identifier: Apache-2.0
"""The presentation-module contract -- a LOCAL DRAFT.

The normative module interface belongs to agent-action-capsule's presentation
contract, which has not landed. Until it does, this file is the draft the kit
is tested against, written so re-pointing it is mechanical:

* member names are the contract's own spelling (``manifest``, ``canRender``,
  ``buildModel``, ``render``), not Python-cased, so nothing is renamed later;
* ``Context`` stands in for the verified-bundle context type and becomes an
  import of it. A module is meant only to read a context; this draft does
  not enforce that (the contract's context type is expected to be immutable);
* ``ModuleManifest`` carries the manifest fields the plan names and is replaced
  by (or validated against) the contract's manifest schema.

The pattern: one ``typing.Protocol`` per output kind, plus a conformance check
every module must pass. A module produces exactly one output kind today --
an HTML fragment built from kit services (``HtmlPresentationModule``). Offline
page, permalink and embedded are the shell's packaging of that fragment, not
module outputs. ``KitServices`` is the Protocol the kit itself satisfies, so a
module is written against the Protocol, never the concrete functions.

A module never verifies: nothing in this contract hands it a verifier, and
``render`` receives only its model and the kit. The draft cannot stop a module
importing one; that is a review rule, not a check here.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Protocol, TypeVar, runtime_checkable

from . import components as _c

# Draft stand-in for the verified-bundle context type (see module docstring).
Context = object
ModelT = TypeVar("ModelT")

DRAFT_MANIFEST_NAMESPACE = "aac.presentation-manifest/v0"
REQUIRED_MODULE_MEMBERS: tuple[str, ...] = ("manifest", "canRender", "buildModel", "render")


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

    def section(self, title: str, *children: str, level: int = 2) -> _c.Markup: ...
    def metric_grid(self, metrics: Sequence[_c.Metric]) -> _c.Markup: ...
    def data_table(self, columns: Sequence[str], rows: Sequence[Sequence[str]], caption: str = "") -> _c.Markup: ...
    def calendar_grid(self, year: int, month: int, marks: Mapping[int, Sequence[_c.CalendarMark]]) -> _c.Markup: ...
    def disclosure_badge(self, state: str) -> _c.Markup: ...
    def verdict_pill(self, verdict: str) -> _c.Markup: ...
    def citation_list(self, citations: Sequence[_c.Citation]) -> _c.Markup: ...
    def drilldown(self, summary: str, *children: str, expanded: bool = False) -> _c.Markup: ...
    def evidence_details(self, items: Sequence[_c.EvidenceItem]) -> _c.Markup: ...
    def verification_details(self, result: _c.VerificationResult) -> _c.Markup: ...
    def party_card(self, party: _c.Party) -> _c.Markup: ...
    def timeline(self, events: Sequence[_c.TimelineEvent]) -> _c.Markup: ...


@runtime_checkable
class HtmlPresentationModule(Protocol[ModelT]):
    """A module whose output kind is an HTML fragment. ``ModelT`` is the
    module's own model type: what ``buildModel`` returns, ``render`` takes."""

    manifest: ModuleManifest

    def canRender(self, context: Context) -> bool: ...
    def buildModel(self, context: Context) -> ModelT: ...
    def render(self, model: ModelT, services: KitServices) -> str: ...


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
    if hasattr(module, "canRender") and not callable(module.canRender):
        problems.append("canRender is not callable")
    if hasattr(module, "buildModel") and not callable(module.buildModel):
        problems.append("buildModel is not callable")
    if hasattr(module, "render") and not callable(module.render):
        problems.append("render is not callable")
    if hasattr(module, "manifest"):
        manifest = module.manifest
        if not isinstance(manifest, ModuleManifest):
            problems.append(f"manifest is {type(manifest).__name__}, not ModuleManifest")
        else:
            if not manifest.id:
                problems.append("manifest.id is empty")
            if manifest.namespace != DRAFT_MANIFEST_NAMESPACE:
                problems.append(f"manifest.namespace {manifest.namespace!r} != {DRAFT_MANIFEST_NAMESPACE!r}")
    if problems:
        raise ModuleContractError(f"{type(module).__name__}: " + "; ".join(problems))


# What a module's HTML fragment may contain: the elements and attributes the
# kit itself emits, plus a little inline text markup. Anything else -- script,
# svg, iframe, object, form, a, img, link, style, any on* handler, href, src,
# srcdoc, action, style= -- is outside the list and rejected by name.
ALLOWED_ELEMENTS = frozenset(
    "section h2 h3 h4 div p span strong em code br ul ol li dl dt dd "
    "table caption thead tbody tr th td details summary".split()
)
ALLOWED_ATTRIBUTES = frozenset({"class", "title", "scope", "open", "aria-hidden", "aria-label"})


class _FragmentAudit(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.problems: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in ALLOWED_ELEMENTS:
            self.problems.append(f"element <{tag}>")
        for name, _value in attrs:
            if name not in ALLOWED_ATTRIBUTES and not name.startswith("data-"):
                self.problems.append(f"attribute {name}= on <{tag}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_comment(self, data: str) -> None:
        self.problems.append("comment")

    def handle_decl(self, decl: str) -> None:
        self.problems.append(f"declaration <!{decl}>")

    def handle_pi(self, data: str) -> None:
        self.problems.append("processing instruction")

    def unknown_decl(self, data: str) -> None:
        self.problems.append("marked section")


def check_fragment(html: str) -> list[str]:
    """Every element and attribute in *html* outside the allowlist, by name."""
    audit = _FragmentAudit()
    audit.feed(html)
    audit.close()
    return audit.problems


def check_module_renders(module: HtmlPresentationModule[ModelT], context: Context) -> str:
    """Behavioural conformance over one context the module claims it can render:
    ``canRender`` says yes, and ``buildModel`` then ``render`` with the kit
    yields a string whose every element and attribute is on the allowlist above
    (so no script, handler, link, embed or inline style). Returns the fragment."""
    check_module(module)
    if module.canRender(context) is not True:
        raise ModuleContractError(f"{module.manifest.id}: canRender returned non-True for its own fixture")
    html = module.render(module.buildModel(context), KIT)
    if not isinstance(html, str):
        raise ModuleContractError(f"{module.manifest.id}: render returned {type(html).__name__}, not str")
    problems = check_fragment(html)
    if problems:
        raise ModuleContractError(f"{module.manifest.id}: render output contains " + ", ".join(problems))
    return html
