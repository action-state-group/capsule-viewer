# SPDX-License-Identifier: Apache-2.0
"""The unilateral deal receipt module (``capsuleviewer.receipt.unilateral/v0``),
its manifest, and an example English wording pack (``wording-en.json``) with
neutral example wording."""
from importlib import resources

from .model import ReceiptModel, ReceiptUnavailable, build_receipt
from .module import PLACEHOLDERS, UNILATERAL_MANIFEST, UnilateralReceiptModule, unilateral_manifest
from .page import receipt_page, receipt_registry


def example_wording_pack() -> bytes:
    """The exact bytes of the example English wording pack."""
    return resources.files(__package__).joinpath("wording-en.json").read_bytes()


__all__ = [
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
