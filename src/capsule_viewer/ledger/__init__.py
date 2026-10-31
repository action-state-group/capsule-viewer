# SPDX-License-Identifier: Apache-2.0
"""The Ledger presentation module (``capsuleviewer.ledger/v0``) and its page:
capsule-emit's ``ledger view --html``, moved here. ``python -m
capsule_viewer.ledger BUNDLE.json -o OUTPUT.html`` writes the page over an
evidence file of the ledger, such as ``capsule-emit bundle LEDGER --all``
writes; any ``evidence-bundle/v2`` works, for example one ``capsulectl bundle
--profile NAME --root CAPSULE_ID --out bundle.json`` writes from a CLL entry
log plus artifact store."""
from .module import MANIFEST, LedgerModel, LedgerModule, Row, row
from .page import check_and_render, context_from_check, ledger_page, verification_of

__all__ = [
    "MANIFEST",
    "LedgerModel",
    "LedgerModule",
    "Row",
    "check_and_render",
    "context_from_check",
    "ledger_page",
    "row",
    "verification_of",
]
