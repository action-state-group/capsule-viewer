# SPDX-License-Identifier: Apache-2.0
"""The Evidence Bundle digest: lowercase hex SHA-256 of the RFC 8785 (JCS)
serialisation of the bundle without ``countersignatures`` -- the definition
agent-action-capsule's ``bundle_digest`` and capsulectl both use.

The page builder uses it for one thing: to check that a verifier's report
names this exact bundle (``verifier_report``). It does not verify anything.

JCS here covers the value domain the capsule profile permits: null, booleans,
strings, integers within +/-(2**53 - 1), arrays and objects. A float or a
larger integer is refused (``NotCanonical``) rather than serialised by a
best-effort number algorithm, as agent-action-capsule's ``canonical.jcs`` does.
"""
from __future__ import annotations

import hashlib
from collections.abc import Mapping, Sequence

from .context import Json, JsonObject

MAX_SAFE_INTEGER = 2**53 - 1
_SHORT_ESCAPES = {'"': '\\"', "\\": "\\\\", "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r"}


class NotCanonical(ValueError):
    """A value outside the profile's JCS domain."""


def _string(s: str) -> str:
    out = ['"']
    for ch in s:
        if ch in _SHORT_ESCAPES:
            out.append(_SHORT_ESCAPES[ch])
        elif ord(ch) < 0x20:
            out.append(f"\\u{ord(ch):04x}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _value(v: Json) -> str:
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, str):
        return _string(v)
    if isinstance(v, int):
        if abs(v) > MAX_SAFE_INTEGER:
            raise NotCanonical(f"integer {v} is outside +/-{MAX_SAFE_INTEGER}")
        return str(v)
    if isinstance(v, float):
        raise NotCanonical("a JSON float has no canonical form in this profile")
    if isinstance(v, Mapping):
        # RFC 8785 3.2.3: members sorted by the UTF-16 code units of their names.
        items = sorted(v.items(), key=lambda kv: kv[0].encode("utf-16-be"))
        return "{" + ",".join(_string(k) + ":" + _value(val) for k, val in items) + "}"
    if isinstance(v, Sequence):
        return "[" + ",".join(_value(x) for x in v) + "]"
    raise NotCanonical(f"{type(v).__name__} is not a JSON value")


def jcs(value: Json) -> bytes:
    try:
        return _value(value).encode("utf-8")
    except UnicodeEncodeError as exc:  # a lone surrogate has no UTF-8 form
        raise NotCanonical("a string holds a lone surrogate") from exc


def bundle_digest(bundle: JsonObject) -> str:
    return hashlib.sha256(jcs({k: v for k, v in bundle.items() if k != "countersignatures"})).hexdigest()
