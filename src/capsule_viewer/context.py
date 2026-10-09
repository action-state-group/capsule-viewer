# SPDX-License-Identifier: Apache-2.0
"""A verified bundle context for server-rendered modules.

agent-action-capsule's presentation contract (``spec/presentation-contract-v0.md``
section 3) hands every module one ``VerifiedBundleContext``, built once from one
verification run. Its reference type is TypeScript (``ts/src/bundle.ts``). This
is the subset a server-rendered module here reads, with the same meaning:

* ``verified`` is the viewer's gate over the verifier's report, as AAC's
  ``bundleVerified`` applies it: the verifier's outcome is ``verified`` and no
  disclosure is a ``disclosure_mismatch``. Nothing in this package checks a
  signature, digest or proof itself: ``build_context`` takes the verifier's
  result and its per-member disclosure statuses as given.
* ``disclosures`` maps each record's ``capsule_id`` to both disclosable members,
  resolved the way the reference context resolves them: ``disclosed`` (with the
  supplied value) only on the verifier's ``disclosure_match``;
  ``disclosure_mismatch`` on a mismatch; ``withheld`` otherwise.
* ``memberships`` is the bundle's ``completeness_certificate.memberships`` as
  supplied: the log coordinates a module shows beside a record.

The context is effectively immutable (contract section 3.1): it is built over a
deep copy of the bundle, every mapping is a read-only view and every list a
tuple, so an attempt to change it raises ``TypeError`` and the caller's own
bundle object is never reached.
"""
from __future__ import annotations

import copy
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Literal, TypeAlias

from .kit.components import VerificationResult

DISCLOSABLE_MEMBERS: tuple[str, ...] = ("agent_input", "agent_output")
RESULT_VERSION = "evidence-result-v0"
RESULT_RECORD_TYPE = "evidence_result"

# What a verifier reports for one disclosable member.
VerifierDisclosureStatus = Literal["disclosure_match", "disclosure_mismatch", "withheld"]
DisclosureState = Literal["disclosed", "disclosure_mismatch", "withheld"]

# A JSON value as decoded, and a JSON object.
Json: TypeAlias = "None | bool | int | float | str | Sequence[Json] | Mapping[str, Json]"
JsonObject: TypeAlias = "Mapping[str, Json]"

# A JSON value after freezing: objects are read-only mappings, arrays tuples.
Frozen: TypeAlias = "None | bool | int | float | str | tuple[Frozen, ...] | Mapping[str, Frozen]"


def freeze(value: object) -> Frozen:
    """A deep, read-only copy of a JSON value."""
    if isinstance(value, Mapping):
        return MappingProxyType({str(key): freeze(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(freeze(item) for item in value)
    if isinstance(value, str):
        return str(value)  # a str subclass (such as kit Markup) becomes plain text
    if value is None or isinstance(value, (bool, int, float)):
        return value
    raise TypeError(f"not a JSON value: {type(value).__name__}")


@dataclass(frozen=True)
class Disclosure:
    """One disclosable member of one record, as the verifier resolved it."""

    state: DisclosureState
    value: Frozen = None  # the supplied value, only when ``state`` is ``disclosed``


@dataclass(frozen=True)
class VerifiedBundleContext:
    verification: VerificationResult
    bundle_kind: str | None
    root: str | None
    # Record capsule_ids, in bundle order.
    records: tuple[str, ...]
    disclosures: Mapping[str, Mapping[str, Disclosure]]
    memberships: Mapping[str, Frozen]
    bundle: Frozen = field(repr=False, default=None)

    @property
    def verified(self) -> bool:
        return self.verification.outcome == "verified" and not any(
            entry.state == "disclosure_mismatch" for members in self.disclosures.values() for entry in members.values()
        )

    def disclosed(self, capsule_id: str, member: str) -> Frozen:
        """The member's value when it is ``disclosed``; ``None`` otherwise."""
        entry = self.disclosures.get(capsule_id, MappingProxyType({})).get(member)
        return entry.value if entry is not None and entry.state == "disclosed" else None

    def profiles(self) -> frozenset[str]:
        """The descriptor's profile tokens (contract section 4.2), derived as
        AAC's ``describeContext`` derives them. Empty when unverified.

        * ``spec_version:<v>`` from the root's disclosed ``agent_input``;
        * ``result_version:evidence-result-v0`` when the root carries an
          Evidence Result in a disclosed member: a payload whose
          ``result_version`` is ``evidence-result-v0``, or an ``agent_input``
          whose ``record_type`` is ``evidence_result`` (the book form)."""
        if not self.verified or self.root is None or self.root not in self.disclosures:
            return frozenset()
        tokens = set()
        root_input = self.disclosed(self.root, "agent_input")
        if isinstance(root_input, Mapping) and isinstance(root_input.get("spec_version"), str):
            tokens.add(f"spec_version:{root_input['spec_version']}")
        for member in ("agent_output", "agent_input"):
            payload = self.disclosed(self.root, member)
            if not isinstance(payload, Mapping):
                continue
            if payload.get("result_version") == RESULT_VERSION or (
                member == "agent_input" and payload.get("record_type") == RESULT_RECORD_TYPE
            ):
                tokens.add(f"result_version:{RESULT_VERSION}")
        return frozenset(tokens)


_RESOLVED: dict[str, DisclosureState] = {
    "disclosure_match": "disclosed",
    "disclosure_mismatch": "disclosure_mismatch",
    "withheld": "withheld",
}


def build_context(
    bundle: JsonObject,
    verification: VerificationResult,
    disclosure_status: Mapping[str, Mapping[str, VerifierDisclosureStatus]],
) -> VerifiedBundleContext:
    """The context for *bundle*, from a verifier's *verification* result and its
    per-record, per-member *disclosure_status*. A member the verifier did not
    report is ``withheld``; a status outside the verifier's vocabulary is a
    caller error."""
    own = freeze(copy.deepcopy(dict(bundle)))
    if not isinstance(own, Mapping):
        raise TypeError("bundle must be a JSON object")
    records = tuple(
        record["capsule_id"]
        for record in own.get("records", ())
        if isinstance(record, Mapping) and isinstance(record.get("capsule_id"), str)
    )
    supplied = own.get("disclosures")
    supplied = supplied if isinstance(supplied, Mapping) else MappingProxyType({})
    disclosures: dict[str, Mapping[str, Disclosure]] = {}
    for capsule_id in records:
        statuses = disclosure_status.get(capsule_id, {})
        values = supplied.get(capsule_id)
        values = values if isinstance(values, Mapping) else MappingProxyType({})
        members: dict[str, Disclosure] = {}
        for member in DISCLOSABLE_MEMBERS:
            status = statuses.get(member, "withheld")
            if status not in _RESOLVED:
                raise ValueError(f"{capsule_id} {member}: unknown verifier disclosure status {status!r}")
            state = _RESOLVED[status]
            members[member] = Disclosure(state, values.get(member) if state == "disclosed" else None)
        disclosures[capsule_id] = MappingProxyType(members)
    certificate = own.get("completeness_certificate")
    memberships = certificate.get("memberships") if isinstance(certificate, Mapping) else None
    root = own.get("root")
    bundle_kind = own.get("bundle_kind")
    return VerifiedBundleContext(
        verification=VerificationResult(verification.verifier, verification.outcome, tuple(verification.checks)),
        bundle_kind=bundle_kind if isinstance(bundle_kind, str) else None,
        root=root if isinstance(root, str) else None,
        records=records,
        disclosures=MappingProxyType(disclosures),
        memberships=memberships if isinstance(memberships, Mapping) else MappingProxyType({}),
        bundle=own,
    )
