# SPDX-License-Identifier: Apache-2.0
"""The words of the shared components: the kit's closed vocabularies (the
disclosure states, the verification outcomes, who reported a result) and the
composition section (``capsule_viewer.composed``), from the kit's example
English wording pack, ``kit/wording-en.json`` (``aac.wording-pack/v0``).

The receipt module-slot scripts carry their own copy of these components
(``static/receipt_core.js``); ``receipt.module_slot`` puts this same pack in
each script as data, so both carriers read one pack. The pack is the
package's own, read once at import and refused like any pack whose entries
ask for values a component does not fill (``wording.load_wording_pack``). A
key it lacks is a packaging error, raised where it is asked for."""
from __future__ import annotations

from collections.abc import Mapping
from importlib import resources

from ..wording import WordingPack, load_wording_pack, sha256_hex

PACK_FILE = "wording-en.json"
# The values a component fills in, per key.
PLACEHOLDERS: Mapping[str, frozenset[str]] = {
    "kit.reported_by": frozenset({"verifier"}),
    "composed.check": frozenset({"status"}),
    "composed.findings": frozenset({"findings"}),
    "composed.closure.line": frozenset({"status", "missing", "findings"}),
    "composed.joins.differences": frozenset({"pair"}),
    "composed.joins.unresolved": frozenset({"member"}),
}


def kit_pack_bytes() -> bytes:
    """The kit pack's exact bytes, as distributed."""
    return resources.files(__package__).joinpath(PACK_FILE).read_bytes()


def _load() -> WordingPack:
    data = kit_pack_bytes()
    return load_wording_pack(data, sha256_hex(data), PLACEHOLDERS)


KIT_PACK: WordingPack = _load()


def word(key: str, **values: str) -> str:
    """The kit pack's entry for *key*, its ``{name}`` placeholders filled."""
    text = KIT_PACK.fill(key, **values)
    if text is None:
        raise KeyError(f"the kit wording pack has no entry {key!r}")
    return text
