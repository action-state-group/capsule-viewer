# SPDX-License-Identifier: Apache-2.0
"""Which side of a deal a copy is from, two ways, and both must agree.

* **The packaging:** a seller's copy engages the bundle extension kind
  ``SELLER_KIND``, so a manifest can select the seller receipt by it
  (presentation contract section 4.2: a descriptor reads the root's profile
  tokens and the engaged extension kinds, nothing else). The extensions block
  is not sealed: anyone holding a copy can add or drop the kind.
* **The sealed fact:** the deal's opening record (``x-deal-v0`` record type
  ``baseline``, ``seq`` 1) seals ``intent.party_role``, ``buyer`` or
  ``seller``; absent means ``buyer`` (every deal sealed before the field
  was recorded is a buyer's). A shared copy may withhold that record (a
  buyer's always does). Then ``sealed_side`` reads the side from records
  capsulectl seals only on a seller's deal: an offer (capsulectl refuses one
  unless the user sells), the buyer's acceptance of an offer (it must name an
  offer's check), or a task authority carrying ``sale_authority_commitment``
  (sealed only for a sale). A copy with none of these and no disclosed
  opening is of no known side.

The receipt modules read both and decline when they disagree, so a relabelled
copy shows no receipt rather than the wrong one.

``SELLER_KIND`` is named here and nowhere else in this package: the manifests
get it from this constant.
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from ..context import Frozen, VerifiedBundleContext

SELLER_KIND = "x-deal-seller/v0"
DEAL_EXTENSION = "x-deal-v0"
PartyRole = Literal["buyer", "seller"]
ACCEPTANCE_KIND = "counterparty-acceptance-observation"


def _map(value: Frozen) -> Mapping[str, Frozen]:
    return value if isinstance(value, Mapping) else {}


def seller_kind_engaged(context: VerifiedBundleContext) -> bool:
    """Whether the copy's packaging names it a seller's: the kind is present."""
    return SELLER_KIND in _map(_map(context.bundle).get("extensions"))


def sealed_party_role(context: VerifiedBundleContext) -> PartyRole | None:
    """The party role the copy's opening record seals, or ``None`` when the
    copy does not disclose that record (a shared buyer's copy withholds it),
    or carries more than one, or seals a value outside ``buyer``/``seller``."""
    roles = []
    for cid in context.records:
        payload = _map(context.disclosed(cid, "agent_input"))
        block = _map(payload.get(DEAL_EXTENSION))
        if block.get("record_type") != "baseline" or block.get("seq") != 1:
            continue
        role = _map(_map(payload.get("body")).get("intent")).get("party_role", "buyer")
        roles.append(role)
    if len(roles) != 1 or roles[0] not in ("buyer", "seller"):
        return None
    return "seller" if roles[0] == "seller" else "buyer"


def _seller_only(payload: Mapping[str, Frozen]) -> bool:
    """Whether a disclosed record is one capsulectl seals only on a seller's deal."""
    body = _map(payload.get("body"))
    kind = payload.get("type") or _map(payload.get(DEAL_EXTENSION)).get("record_type")
    if kind in ("proposed-action/v0", "action-record/v0", "check", "action"):
        return body.get("action") == "offer"
    if kind == "action-approval/v0":
        return body.get("kind") == ACCEPTANCE_KIND
    if kind == "task-authority/v0":
        return "sale_authority_commitment" in body
    return False


def sealed_side(context: VerifiedBundleContext) -> PartyRole | None:
    """The side the copy's sealed records show: its opening record's
    ``party_role`` when disclosed; otherwise ``seller`` when a disclosed record
    is one only a seller's deal carries; otherwise ``None`` (unknown)."""
    role = sealed_party_role(context)
    if role is not None:
        return role
    for cid in context.records:
        if _seller_only(_map(context.disclosed(cid, "agent_input"))):
            return "seller"
    return None
