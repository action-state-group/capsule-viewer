# SPDX-License-Identifier: Apache-2.0
"""The deal receipt modules, unilateral (``capsuleviewer.receipt.unilateral/v0``,
a buyer's copy), seller (``capsuleviewer.receipt.seller/v0``, a seller's copy
of one buyer thread) and bilateral (``capsuleviewer.receipt.bilateral/v0``, a
composed/v1 bundle of both parties' copies), their manifests, and an example
English wording pack (``wording-en.json``) with neutral example wording."""
from importlib import resources

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
from .role import SELLER_KIND, sealed_party_role, sealed_side, seller_kind_engaged
from .seller import SELLER_MANIFEST, SellerModel, SellerReceiptModule, build_seller, seller_manifest


def example_wording_pack() -> bytes:
    """The exact bytes of the example English wording pack."""
    return resources.files(__package__).joinpath("wording-en.json").read_bytes()


__all__ = [
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
