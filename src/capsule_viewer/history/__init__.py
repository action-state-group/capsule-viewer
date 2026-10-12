# SPDX-License-Identifier: Apache-2.0
"""The History Card (``capsuleviewer.history/v0``, docs/design/history-card.md).

The module is ``static/history_card.js``: a self-contained module-slot script
that registers with the page's runtime and carries the selection check, the
recompute and the card. This package holds what the tests and fixtures need
beside it: the manifest (``manifest.json``, pinning that script by its
SHA-256), the Python twin of the check (``recompute``), and the fixture
helpers (``fixture``)."""
import hashlib
import json
from importlib import resources

from .recompute import SELECTION_EXTENSION, check, derive, recompute_errors, selected_records, selection_block

HISTORY_ID = "capsuleviewer.history/v0"
SCRIPT = "history_card.js"


def history_script_bytes() -> bytes:
    """The exact bytes of the module-slot script."""
    return resources.files("capsule_viewer").joinpath("static", SCRIPT).read_bytes()


def history_manifest() -> dict:
    """The module's manifest, as shipped."""
    return json.loads(resources.files(__package__).joinpath("manifest.json").read_text(encoding="utf-8"))


def script_sha256() -> str:
    return hashlib.sha256(history_script_bytes()).hexdigest()


HISTORY_MANIFEST = history_manifest()

__all__ = [
    "HISTORY_ID",
    "HISTORY_MANIFEST",
    "SELECTION_EXTENSION",
    "check",
    "derive",
    "history_manifest",
    "history_script_bytes",
    "recompute_errors",
    "script_sha256",
    "selected_records",
    "selection_block",
]
