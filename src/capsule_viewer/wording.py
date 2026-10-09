# SPDX-License-Identifier: Apache-2.0
"""Wording packs (``aac.wording-pack/v0``) and ``wording_sha256``.

agent-action-capsule's presentation contract, section 7.4: a wording pack is a
JSON object of presentation words, one locale per pack, never sealed.
``wording_sha256`` is the lowercase hex SHA-256 of the pack's exact bytes as
distributed; the bytes are hashed as they are, never re-serialized first, and a
pack whose bytes do not hash to the ``wording_sha256`` it was given is refused.

An entry may name values the module fills in, written ``{name}``. A module
declares, per key, the names it fills there, and ``load_wording_pack`` refuses
a pack whose entry uses any other name under that key, so an accepted pack
never asks for a value the module does not supply at that place.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType

WORDING_PACK_VERSION = "aac.wording-pack/v0"
# The contract schema's WordingKey, ManifestId and BCP 47 patterns.
WORDING_KEY = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
PACK_ID = re.compile(r"^[a-z0-9]+(\.[a-z0-9_-]+)+/v[0-9]+$")
LOCALE = re.compile(r"^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$")
PLACEHOLDER = re.compile(r"\{([a-z_]+)\}")


class WordingPackError(ValueError):
    """A wording pack that must not be used: wrong digest or wrong shape."""


@dataclass(frozen=True)
class WordingPack:
    id: str
    locale: str
    entries: Mapping[str, str]
    wording_sha256: str

    def get(self, key: str) -> str | None:
        return self.entries.get(key)

    def fill(self, key: str, **values: str) -> str | None:
        """The entry for *key* with its ``{name}`` placeholders filled, or
        ``None`` when the pack has no such entry."""
        template = self.entries.get(key)
        if template is None:
            return None
        return PLACEHOLDER.sub(lambda m: values[m.group(1)], template)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_wording_pack(data: bytes, wording_sha256: str, placeholders: Mapping[str, frozenset[str]]) -> WordingPack:
    """The pack in *data*, refused unless its bytes hash to *wording_sha256*, it
    has the contract's shape, and every placeholder an entry uses is one
    *placeholders* lists for that entry's key (a key it does not list takes none)."""
    actual = sha256_hex(data)
    if actual != wording_sha256:
        raise WordingPackError(f"wording pack bytes hash to {actual}, not the given wording_sha256 {wording_sha256}")
    try:
        raw = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise WordingPackError(f"wording pack is not UTF-8 JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise WordingPackError("wording pack is not a JSON object")
    problems = []
    unknown = sorted(set(raw) - {"wording_pack_version", "id", "locale", "entries"})
    if unknown:
        problems.append(f"unknown members {unknown}")
    if raw.get("wording_pack_version") != WORDING_PACK_VERSION:
        problems.append(f"wording_pack_version is not {WORDING_PACK_VERSION!r}")
    pack_id, locale, entries = raw.get("id"), raw.get("locale"), raw.get("entries")
    if not isinstance(pack_id, str) or not PACK_ID.match(pack_id):
        problems.append(f"id {pack_id!r} is not a module-style id")
    if not isinstance(locale, str) or not LOCALE.match(locale):
        problems.append(f"locale {locale!r} is not a BCP 47 tag")
    if not isinstance(entries, dict) or not entries:
        problems.append("entries is not a non-empty object")
        entries = {}
    for key, text in entries.items():
        if not WORDING_KEY.match(key):
            problems.append(f"key {key!r} is not a wording key")
        if not isinstance(text, str) or not text:
            problems.append(f"entry {key!r} is not a non-empty string")
            continue
        stray = sorted(set(PLACEHOLDER.findall(text)) - placeholders.get(key, frozenset()))
        if stray:
            problems.append(f"entry {key!r} uses placeholders {stray} the module does not fill there")
    if problems:
        raise WordingPackError("wording pack refused: " + "; ".join(problems))
    return WordingPack(pack_id, locale, MappingProxyType(dict(entries)), actual)


# The pack a renderer uses after refusing one: no entries, so every label falls
# back to its key or raw token, shown as unrecognized (contract section 7.4).
EMPTY_PACK = WordingPack("none.refused/v0", "en", MappingProxyType({}), "")
