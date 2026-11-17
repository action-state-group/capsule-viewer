# SPDX-License-Identifier: Apache-2.0
"""Deprecated (capsule-viewer#71, #319): importing this package emits a DeprecationWarning.

What is left here is the provider's own receipt (``capsuleviewer.receipt.provider/v0``,
a Mesh node's served exchange and the payments it received) and its manifest.
The deal receipt modules (unilateral, seller, bilateral) were removed in #71:
they ship as the module-slot scripts ``static/receipt_*.js``, written by
``capsule_viewer.receipt_slot``. Whether the provider page is frozen and
deleted or gets a JS twin is open in #319."""
import warnings

from .provider import ProviderReceiptModule, provider_receipt_page

# Deprecated (capsule-viewer#71, #319): the deal receipt modules are gone; the
# provider page is the one Python receipt left, kept until #319 decides it.
warnings.warn(
    "capsule_viewer.receipt (now only the provider receipt page) is deprecated and "
    "may be removed in a later release; the deal receipts are the module-slot "
    "scripts written by capsule_viewer.receipt_slot. "
    "See https://github.com/action-state-group/capsule-viewer/issues/319",
    DeprecationWarning,
    stacklevel=2,
)

__all__ = ["ProviderReceiptModule", "provider_receipt_page"]
