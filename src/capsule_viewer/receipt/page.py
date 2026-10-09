# SPDX-License-Identifier: Apache-2.0
"""A complete offline page for one deal receipt: both receipt modules
registered by their manifests (the unilateral one for a single copy, the
bilateral one for a composition of two), resolved through the registry,
worded by a wording pack whose bytes must hash to the ``wording_sha256``
given (contract section 7.4)."""
from __future__ import annotations

from collections.abc import Sequence

from ..binding import check_opening
from ..composed import Composition
from ..context import VerifiedBundleContext
from ..registry import Registry
from ..shell import PACK_REFUSED, notice, present
from ..verifier_report import Assurance
from ..wording import EMPTY_PACK, WordingPack, WordingPackError, load_wording_pack
from .bilateral import BilateralReceiptModule
from .module import PLACEHOLDERS, UnilateralReceiptModule


def receipt_registry(*modules: UnilateralReceiptModule | BilateralReceiptModule) -> Registry:
    """A registry holding the receipt modules given."""
    registry = Registry()
    for module in modules:
        registry.register(module.manifest_json, module.canRender, module)
    return registry


def receipt_page(
    context: VerifiedBundleContext,
    assurance: Assurance,
    pack_bytes: bytes,
    wording_sha256: str,
    *,
    audience: str,
    depth: str = "L0",
    fmt: str = "html",
    forbid_profiles: Sequence[str] = (),
    composition: Composition | None = None,
) -> str:
    """The page for *context* and *audience*, opened at *depth* (L0, L1, L2).
    *forbid_profiles* is render-time manifest configuration (see
    ``unilateral_manifest``). *composition* is the verifier's composed/v1
    result for this bundle, when it reported one
    (``capsule_viewer.composed.composition_from_capsulectl``)."""
    pack: WordingPack = EMPTY_PACK
    notices = []
    try:
        pack = load_wording_pack(pack_bytes, wording_sha256, PLACEHOLDERS)
    except WordingPackError as exc:
        notices.append(notice(PACK_REFUSED.format(reason=str(exc)), "wording-refused"))
    unilateral = UnilateralReceiptModule(pack, depth, audience, assurance, check_opening, forbid_profiles)
    bilateral = BilateralReceiptModule(pack, depth, audience, assurance, composition, check_opening, forbid_profiles)
    return present(context, receipt_registry(unilateral, bilateral), audience=audience, fmt=fmt, notices=notices)
