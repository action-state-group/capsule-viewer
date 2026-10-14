# SPDX-License-Identifier: Apache-2.0
"""The History Card (``capsuleviewer.history/v0``, docs/design/history-card.md).

The module is ``static/history_card.js``: a self-contained module-slot script
that registers with the page's runtime and carries the selection check, the
recompute and the card. This package holds what the tests and fixtures need
beside it: the manifest (``manifest.json``, pinning that script by its
SHA-256), the module's wording pack (``wording-en.json``, ``words``), the
Python twin of the check (``recompute``), and the fixture helpers
(``fixture``).

The script carries the pack as data: its lines marked ``@generated`` hold the
pack's exact bytes (as text) and capsule-viewer's version. ``python -m
capsule_viewer.history pin`` fills them (``filled_script``) and then pins the
script's digest in the manifest; ``pin --check`` exits 1 when either is stale."""
import hashlib
import json
import re
from importlib import resources

from ..version import VERSION
from .recompute import (
    PROPERTIES,
    SELECTION_EXTENSION,
    check,
    derive,
    recompute_errors,
    sealed_or_inline_report,
    sealed_selection,
    selected_records,
    selection_block,
)
from .words import history_pack_bytes

HISTORY_ID = "capsuleviewer.history/v0"
SCRIPT = "history_card.js"
_GENERATED = re.compile(r"^(  var (\w+) = ).*; // @generated \2$", re.MULTILINE)


def filled_script(source: str, pack: bytes | None = None) -> str:
    """*source* (the script's text) with its generated lines filled: the pack's
    bytes (*pack*, a test's stub; by default the shipped pack) and the version."""
    pack = history_pack_bytes() if pack is None else pack
    values = {
        "PACK_TEXT": json.dumps(pack.decode("utf-8"), ensure_ascii=False),
        "VERSION": json.dumps(VERSION),
    }
    if sorted(m.group(2) for m in _GENERATED.finditer(source)) != sorted(values):
        raise ValueError("history_card.js does not carry exactly the generated lines this fills")
    return _GENERATED.sub(lambda m: f"{m.group(1)}{values[m.group(2)]}; // @generated {m.group(2)}", source)


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
    "filled_script",
    "PROPERTIES",
    "SELECTION_EXTENSION",
    "check",
    "derive",
    "history_manifest",
    "history_script_bytes",
    "recompute_errors",
    "script_sha256",
    "sealed_or_inline_report",
    "sealed_selection",
    "selected_records",
    "selection_block",
]
