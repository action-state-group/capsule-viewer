# SPDX-License-Identifier: Apache-2.0
"""The deal receipt modules, unilateral (``capsuleviewer.receipt.unilateral/v0``,
one party's copy) and bilateral (``capsuleviewer.receipt.bilateral/v0``, a
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
    "UnilateralReceiptModule",
    "build_receipt",
    "example_wording_pack",
    "receipt_page",
    "receipt_registry",
    "unilateral_manifest",
]
