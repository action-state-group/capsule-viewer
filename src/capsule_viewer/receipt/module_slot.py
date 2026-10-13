# SPDX-License-Identifier: Apache-2.0
"""The receipt modules as module-slot scripts: the three scripts a page builder
puts in a page's module slots (capsulectl ``presentation build``, with a
plugin carrying them), and the manifests that pin them.

``static/receipt_core.js`` is their one source. Each script is that file with
its ``@generated`` lines filled: the module it registers, its manifest (with
``script_sha256`` all zeros, as a script cannot carry its own digest), the
words of the example English wording pack (``wording-en.json``, compiled in:
the script reads no pack), the pack's id and sha256 (named in L2) and the kit
stylesheet (``static/kit.css``), which the script inserts once at render and
the manifest pins by ``style_sha256``, and the seller kind (``role.SELLER_KIND``,
named there and nowhere else).

One script per module, not one shared script for the three: a page builder
puts one script in the page per module it chose (``--module``, or the modules
for ``--audience``), so a shared script would register modules the builder
did not choose, and register them once per slot it was put in.

The manifests are the Python modules' (``UNILATERAL_MANIFEST``,
``SELLER_MANIFEST``, ``BILATERAL_MANIFEST``: the same ids, the same selection
clauses), with the module-slot carrier in place of ``core-runtime``. One
module id, two carriers: the Python module renders a page server-side, the
script renders it in the page; the parity test holds them to one output.

``python -m capsule_viewer.receipt.module_slot --write`` writes the scripts and
the manifests; ``--check`` exits 1 when a committed file is not what this
writes (``tests/test_receipt_module_slot.py`` runs the same check).
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections.abc import Mapping
from importlib import resources
from pathlib import Path

from ..registry import Manifest
from .bilateral import BILATERAL_MANIFEST
from .module import UNILATERAL_MANIFEST
from .role import SELLER_KIND
from .seller import SELLER_MANIFEST

KINDS: tuple[str, ...] = ("unilateral", "seller", "bilateral")
SOURCE_MANIFESTS: Mapping[str, Manifest] = {
    "unilateral": UNILATERAL_MANIFEST,
    "seller": SELLER_MANIFEST,
    "bilateral": BILATERAL_MANIFEST,
}
ZERO = "0" * 64
_PACKAGE = Path(__file__).resolve().parent
STATIC = _PACKAGE.parent / "static"
CORE = STATIC / "receipt_core.js"
KIT_CSS = STATIC / "kit.css"
_GENERATED = re.compile(r"^(  var (\w+) = ).*; // @generated \2$", re.MULTILINE)


def script_path(kind: str) -> Path:
    return STATIC / f"receipt_{kind}.js"


def manifest_path(kind: str) -> Path:
    return _PACKAGE / "module-slot" / f"manifest-{kind}.json"


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pack_bytes() -> bytes:
    return resources.files(__package__).joinpath("wording-en.json").read_bytes()


def _manifest(kind: str, script_sha256: str, style_sha256: str) -> Manifest:
    manifest = json.loads(json.dumps(SOURCE_MANIFESTS[kind]))
    manifest["executable"] = {"carrier": "module-slot", "script_sha256": script_sha256, "style_sha256": [style_sha256]}
    return manifest


def _js(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(", ", ": "))


def script_bytes(kind: str) -> bytes:
    """The script for *kind*: the core with its generated lines filled."""
    pack = pack_bytes()
    raw = json.loads(pack.decode("utf-8"))
    css = KIT_CSS.read_bytes()
    values = {
        "KIND": _js(kind),
        "MANIFEST": _js(_manifest(kind, ZERO, _sha(css))),
        "WORDS": _js(raw["entries"]),
        "PACK": _js({"id": raw["id"], "sha256": _sha(pack)}),
        "KIT_CSS": _js(css.decode("utf-8")),
        "SELLER_KIND": _js(SELLER_KIND),
    }
    source = CORE.read_text(encoding="utf-8")
    filled = _GENERATED.sub(lambda m: f"{m.group(1)}{values[m.group(2)]}; // @generated {m.group(2)}", source)
    if sorted(m.group(2) for m in _GENERATED.finditer(source)) != sorted(values):
        raise ValueError("receipt_core.js does not carry exactly the generated lines this fills")
    return filled.encode("utf-8")


def manifest(kind: str) -> Manifest:
    """The module-slot manifest for *kind*, pinning its script and stylesheet."""
    return _manifest(kind, _sha(script_bytes(kind)), _sha(KIT_CSS.read_bytes()))


def manifest_bytes(kind: str) -> bytes:
    return (json.dumps(manifest(kind), indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def outputs() -> dict[Path, bytes]:
    out: dict[Path, bytes] = {}
    for kind in KINDS:
        out[script_path(kind)] = script_bytes(kind)
        out[manifest_path(kind)] = manifest_bytes(kind)
    return out


def stale() -> list[Path]:
    """The committed files that are not what ``outputs`` writes."""
    return [path for path, data in outputs().items() if not path.exists() or path.read_bytes() != data]


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if args == ["--write"]:
        for path, data in outputs().items():
            path.write_bytes(data)
        return 0
    if args == ["--check"]:
        bad = stale()
        for path in bad:
            print(f"stale: {path}", file=sys.stderr)
        return 1 if bad else 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
