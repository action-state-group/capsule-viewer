# SPDX-License-Identifier: Apache-2.0
"""The History Card's words: its example English wording pack,
``history/wording-en.json`` (``aac.wording-pack/v0``), the one pack the module
is worded with. The script (``static/history_card.js``) carries the pack's
bytes as data and reads every word from it (``python -m
capsule_viewer.history pin`` puts them there); the Python twin
(``recompute``) reads the L0 words from the same pack here. The words are
Steven-gated: docs/design/history-card.md, "Wording (Steven-gated)"."""
from __future__ import annotations

from collections.abc import Mapping
from importlib import resources

from ..wording import WordingPack, load_wording_pack, sha256_hex

PACK_FILE = "wording-en.json"
# The values the module fills in, per key.
PLACEHOLDERS: Mapping[str, frozenset[str]] = {
    "period.range": frozenset({"from", "to"}),
    "period.one_month": frozenset({"month", "year"}),
    "period.months": frozenset({"from", "to", "year"}),
    "period.years": frozenset({"from", "from_year", "to", "to_year"}),
    "effect_status.gloss": frozenset({"status"}),
    "recipient": frozenset({"recipient"}),
}


def history_pack_bytes() -> bytes:
    """The History pack's exact bytes, as distributed."""
    return resources.files(__package__).joinpath(PACK_FILE).read_bytes()


def load_history_pack(data: bytes | None = None) -> WordingPack:
    data = history_pack_bytes() if data is None else data
    return load_wording_pack(data, sha256_hex(data), PLACEHOLDERS)


HISTORY_PACK: WordingPack = load_history_pack()


def word(key: str, **values: str) -> str:
    """The History pack's entry for *key*, its ``{name}`` placeholders filled."""
    text = HISTORY_PACK.fill(key, **values)
    if text is None:
        raise KeyError(f"the History wording pack has no entry {key!r}")
    return text
