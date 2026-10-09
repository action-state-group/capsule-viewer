# SPDX-License-Identifier: Apache-2.0
"""A complete offline page for one deal receipt: the receipt module registered
by its manifest, resolved through the registry, worded by a wording pack whose
bytes must hash to the ``wording_sha256`` given (contract section 7.4)."""
from __future__ import annotations

from collections.abc import Sequence

from ..binding import check_opening
from ..context import VerifiedBundleContext
from ..registry import Registry
from ..shell import PACK_REFUSED, notice, present
from ..verifier_report import Assurance
from ..wording import EMPTY_PACK, WordingPack, WordingPackError, load_wording_pack
from .module import PLACEHOLDERS, UnilateralReceiptModule


def receipt_registry(module: UnilateralReceiptModule) -> Registry:
    """A registry holding the receipt module."""
    registry = Registry()
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
) -> str:
    """The page for *context* and *audience*, opened at *depth* (L0, L1, L2).
    *forbid_profiles* is render-time manifest configuration (see
    ``unilateral_manifest``)."""
    pack: WordingPack = EMPTY_PACK
    notices = []
    try:
        pack = load_wording_pack(pack_bytes, wording_sha256, PLACEHOLDERS)
    except WordingPackError as exc:
        notices.append(notice(PACK_REFUSED.format(reason=str(exc)), "wording-refused"))
    module = UnilateralReceiptModule(pack, depth, audience, assurance, check_opening, forbid_profiles)
    return present(context, receipt_registry(module), audience=audience, fmt=fmt, notices=notices)
