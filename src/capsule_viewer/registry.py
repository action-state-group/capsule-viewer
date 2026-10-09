# SPDX-License-Identifier: Apache-2.0
"""Module selection by manifest, after agent-action-capsule's presentation
contract (``spec/presentation-contract-v0.md``):

* ``descriptor`` derives the resolution inputs from a context (section 4.2):
  the gate, the bundle kind, the root's profile tokens and the engaged
  extension kinds. It reads the context and nothing else.
* ``Registry.register`` refuses a manifest whose id is taken, a dead manifest
  (one whose own ``requires`` and ``forbids`` meet, or that requires two values
  of one profile key) and any manifest that some descriptor would match
  together with one already registered in the same tier (section 4.5, the
  static ambiguity test).
* ``Registry.resolve`` is section 4.3: the gate, the match, the specific tier,
  the fallback tier. An ambiguous match raises ``AmbiguityError`` naming every
  colliding id; order, priority and ``canRender`` never break a tie.
* A manifest this runtime cannot honour (section 3.2) is registered like any
  other and refused when resolution reaches it: it is never selected, none of
  its methods is called, it takes part in the ambiguity test and the match,
  and a resolution that reaches it carries the refusal so the page can say so.

Manifests are plain JSON objects in ``aac.presentation-manifest/v0``. This
module does not validate them against the schema (the tests do); at
registration it refuses one missing a member resolution needs, and a fallback
that carries a priority or a specific module without one (section 4.4).
"""
from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Literal, TypedDict

from .context import VerifiedBundleContext

RUNTIME_APIS = frozenset({"aac.presentation-api/v0"})
RUNTIME_VERSION = "0.1.0"
_OBLIGATION_TEXT = ("key", "article", "title", "plain", "method")


def _recognizable_obligation(value: object) -> bool:
    """AAC's ``readObligation`` accepts it: five string members and an
    applicability whose status is ``in_force`` or ``future`` with a string note."""
    if not isinstance(value, Mapping) or not all(isinstance(value.get(k), str) for k in _OBLIGATION_TEXT):
        return False
    applicability = value.get("applicability")
    return (
        isinstance(applicability, Mapping)
        and applicability.get("status") in ("in_force", "future")
        and isinstance(applicability.get("note"), str)
    )


def _compliance_engaged(block: object) -> bool:
    if not isinstance(block, Mapping) or block.get("enabled") is not True:
        return False
    obligations = block.get("obligations")
    return isinstance(obligations, Sequence) and not isinstance(obligations, str) and any(
        _recognizable_obligation(o) for o in obligations
    )


# Extension readers that may decline a present block (section 4.2), as AAC's
# core readers decide (``readOutcomeReportPresentation``,
# ``readCompliancePresentation``). A kind not listed is engaged whenever present.
_DECLINING_READERS: Mapping[str, Callable[[object], bool]] = {
    "outcome-report/v1": lambda block: isinstance(block, Mapping) and block.get("enabled") is True,
    "eu-ai-act-compliance/v1": _compliance_engaged,
}

class Requires(TypedDict, total=False):
    bundle_kind: str
    profiles: list[str]
    extensions: dict[Literal["required"], list[str]]


class Forbids(TypedDict, total=False):
    profiles: list[str]
    extensions: list[str]


class Manifest(TypedDict, total=False):
    """An ``aac.presentation-manifest/v0`` manifest: the members resolution
    reads. The schema (vendored under ``tests/testdata``) is the full shape."""

    spec_version: str
    id: str
    presentation_api: str
    runtime_min: str
    trust_class: str
    requires: Requires
    forbids: Forbids
    audiences: list[str]
    formats: list[str]
    fallback: bool
    priority: int
    executable: dict[str, str]
    declarative: dict[str, str]


class AmbiguityError(Exception):
    """Two manifests of one tier match one descriptor (section 4.3, 4.5)."""

    def __init__(self, ids: Sequence[str]) -> None:
        self.ids = tuple(sorted(ids))
        super().__init__("ambiguous presentation: " + ", ".join(self.ids))


class RegistrationError(ValueError):
    """A manifest a registry must not hold."""


@dataclass(frozen=True)
class Descriptor:
    verified: bool
    bundle_kind: str | None
    profiles: frozenset[str]
    extensions: frozenset[str]


def descriptor(context: VerifiedBundleContext) -> Descriptor:
    """Section 4.2's descriptor for *context*."""
    extensions: set[str] = set()
    bundle = context.bundle if isinstance(context.bundle, Mapping) else {}
    blocks = bundle.get("extensions")
    if isinstance(blocks, Mapping):
        for kind, block in blocks.items():
            reader = _DECLINING_READERS.get(kind)
            if reader is None or reader(block):
                extensions.add(kind)
    return Descriptor(context.verified, context.bundle_kind, context.profiles(), frozenset(extensions))


_REQUIRED = ("spec_version", "id", "presentation_api", "runtime_min", "requires", "audiences", "formats", "fallback")


def _requires(m: Manifest, what: str) -> frozenset[str]:
    requires = m.get("requires") or {}
    if what == "profiles":
        return frozenset(requires.get("profiles") or ())
    return frozenset((requires.get("extensions") or {}).get("required") or ())


def _forbids(m: Manifest, what: str) -> frozenset[str]:
    return frozenset((m.get("forbids") or {}).get(what) or ())


def _one_per_key(tokens: frozenset[str]) -> bool:
    keys = [token.split(":", 1)[0] for token in tokens]
    return len(keys) == len(set(keys))


def _audiences_meet(a: Manifest, b: Manifest) -> bool:
    aud_a, aud_b = set(a["audiences"]), set(b["audiences"])
    return "*" in aud_a or "*" in aud_b or bool(aud_a & aud_b)


def co_matchable(a: Manifest, b: Manifest) -> bool:
    """Section 4.5: some verified descriptor, audience and format match both."""
    if a["requires"]["bundle_kind"] != b["requires"]["bundle_kind"]:
        return False
    if not _audiences_meet(a, b) or not set(a["formats"]) & set(b["formats"]):
        return False
    r_p = _requires(a, "profiles") | _requires(b, "profiles")
    r_e = _requires(a, "extensions") | _requires(b, "extensions")
    if r_p & (_forbids(a, "profiles") | _forbids(b, "profiles")):
        return False
    if r_e & (_forbids(a, "extensions") | _forbids(b, "extensions")):
        return False
    return _one_per_key(r_p)


def is_dead(m: Manifest) -> bool:
    """True when no descriptor can match *m* (section 4.5, last paragraph)."""
    return bool(
        _requires(m, "profiles") & _forbids(m, "profiles")
        or _requires(m, "extensions") & _forbids(m, "extensions")
        or not _one_per_key(_requires(m, "profiles"))
    )


def matches(m: Manifest, d: Descriptor, audience: str, fmt: str) -> bool:
    """Section 4.3, step 2, for one manifest."""
    audiences = m["audiences"]
    return (
        m["requires"]["bundle_kind"] == d.bundle_kind
        and _requires(m, "profiles") <= d.profiles
        and _requires(m, "extensions") <= d.extensions
        and not _forbids(m, "profiles") & d.profiles
        and not _forbids(m, "extensions") & d.extensions
        and (audience in audiences or "*" in audiences)
        and fmt in m["formats"]
    )


def _version(text: str) -> tuple[int, ...]:
    return tuple(int(part) for part in text.split("."))


def refusal_reason(m: Manifest) -> str | None:
    """Section 3.2: why this runtime refuses *m*, or ``None``."""
    if m["presentation_api"] not in RUNTIME_APIS:
        return "presentation_api_unsupported"
    if _version(RUNTIME_VERSION) < _version(str(m["runtime_min"])):
        return "runtime_too_old"
    return None


@dataclass(frozen=True)
class Refusal:
    id: str
    presentation_api: str
    runtime_min: str
    reason: str


@dataclass(frozen=True)
class Entry:
    manifest: Manifest
    # The module's canRender; never called for a refused entry.
    can_render: Callable[[VerifiedBundleContext], bool]
    module: object = None

    @property
    def id(self) -> str:
        return str(self.manifest["id"])


@dataclass(frozen=True)
class Resolution:
    """What ``resolve`` found: ``"module"`` (with ``entry``), ``"refusal"``
    (the bundle did not verify) or ``"none"`` (no presentation), plus every
    refusal met on the way."""

    outcome: str
    entry: Entry | None = None
    refusals: tuple[Refusal, ...] = ()


@dataclass
class Registry:
    entries: list[Entry] = field(default_factory=list)

    def register(self, manifest: Manifest, can_render: Callable[[VerifiedBundleContext], bool], module: object = None) -> None:
        mid = manifest.get("id")
        missing = [k for k in _REQUIRED if k not in manifest] + (
            [] if "bundle_kind" in manifest.get("requires", {}) else ["requires.bundle_kind"]
        )
        if missing:
            raise RegistrationError(f"{mid} is missing {', '.join(missing)}")
        if manifest["fallback"] == ("priority" in manifest):
            raise RegistrationError(f"{mid}: a fallback carries no priority and a specific module must carry one")
        if any(e.id == mid for e in self.entries):
            raise RegistrationError(f"{mid} is already registered")
        if is_dead(manifest):
            raise RegistrationError(f"{mid} can never match: its requires and forbids meet")
        for other in self.entries:
            if other.manifest["fallback"] == manifest["fallback"] and co_matchable(other.manifest, manifest):
                raise AmbiguityError([other.id, str(mid)])
        self.entries.append(Entry(manifest, can_render, module))

    def list(self, context: VerifiedBundleContext, audience: str, fmt: str) -> tuple[Entry, ...]:
        """Every registered entry the context's descriptor matches (step 2)."""
        d = descriptor(context)
        return tuple(e for e in self.entries if matches(e.manifest, d, audience, fmt))

    def resolve(self, context: VerifiedBundleContext, audience: str, fmt: str) -> Resolution:
        if not context.verified:
            return Resolution("refusal")
        candidates = self.list(context, audience, fmt)
        refusals: list[Refusal] = []
        for fallback in (False, True):
            tier = [e for e in candidates if bool(e.manifest["fallback"]) is fallback]
            if len(tier) >= 2:
                raise AmbiguityError([e.id for e in tier])
            if not tier:
                continue
            entry = tier[0]
            reason = refusal_reason(entry.manifest)
            if reason is not None:
                m = entry.manifest
                refusals.append(Refusal(entry.id, str(m["presentation_api"]), str(m["runtime_min"]), reason))
                continue
            if entry.can_render(context) is True:
                return Resolution("module", entry, tuple(refusals))
        return Resolution("none", None, tuple(refusals))
