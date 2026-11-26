# SPDX-License-Identifier: Apache-2.0
"""Deprecated (capsule-viewer#71): importing this package emits a DeprecationWarning.

The deal receipt modules, unilateral (``capsuleviewer.receipt.unilateral/v0``,
a buyer's copy), seller (``capsuleviewer.receipt.seller/v0``, a seller's copy
of one buyer thread) and bilateral (``capsuleviewer.receipt.bilateral/v0``, a
composed/v1 bundle of both parties' copies), and their manifests.
``example_wording_pack`` returns the English wording pack
(``capsuleviewer.receipt.wording.en/v1``; the function keeps its old name), which lives
in ``capsule_viewer.receipt_slot``."""
import warnings

from .. import receipt_slot
from .bilateral import (
    BILATERAL_MANIFEST,
    BilateralModel,
    BilateralReceiptModule,
    bilateral_manifest,
    build_bilateral,
)
from .model import ReceiptModel, ReceiptUnavailable, build_receipt
from .module import PLACEHOLDERS, UNILATERAL_MANIFEST, UnilateralReceiptModule, unilateral_manifest
from .page import receipt_page, receipt_registry
from .provider import ProviderReceiptModule, provider_receipt_page
from .role import SELLER_KIND, sealed_party_role, sealed_side, seller_kind_engaged
from .seller import SELLER_MANIFEST, SellerModel, SellerReceiptModule, build_seller, seller_manifest

# Deprecated (capsule-viewer#71): the Python receipt modules are the test oracle
# for the JS module-slot scripts (their generator has moved to
# ``capsule_viewer.receipt_slot``); the receipt page is built by the TypeScript
# implementation (``buildPresentation`` with ``format: "static"``).
# They will be removed in a later release.
warnings.warn(
    "capsule_viewer.receipt (the Python unilateral, seller and bilateral receipt "
    "modules) is deprecated and will be removed in a later release; build receipt "
    "pages with the TypeScript implementation (buildPresentation, format 'static'). "
    "See https://github.com/action-state-group/capsule-viewer/issues/71",
    DeprecationWarning,
    stacklevel=2,
)


def example_wording_pack() -> bytes:
    """The exact bytes of the English wording pack, ``capsuleviewer.receipt.wording.en/v1``."""
    return receipt_slot.pack_bytes()


__all__ = [
    "ProviderReceiptModule",
    "provider_receipt_page",
    "BILATERAL_MANIFEST",
    "BilateralModel",
    "BilateralReceiptModule",
    "build_bilateral",
    "bilateral_manifest",
    "PLACEHOLDERS",
    "UNILATERAL_MANIFEST",
    "ReceiptModel",
    "ReceiptUnavailable",
    "SELLER_KIND",
    "SELLER_MANIFEST",
    "SellerModel",
    "SellerReceiptModule",
    "UnilateralReceiptModule",
    "build_receipt",
    "build_seller",
    "example_wording_pack",
    "receipt_page",
    "receipt_registry",
    "sealed_party_role",
    "sealed_side",
    "seller_kind_engaged",
    "seller_manifest",
    "unilateral_manifest",
]
