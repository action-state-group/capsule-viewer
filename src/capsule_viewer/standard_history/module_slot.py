# SPDX-License-Identifier: Apache-2.0
"""The History card as a module-slot script: ``static/standard_history_card.js``
with its ``@generated`` lines filled, and the manifest that pins it.

The generated lines are the manifest (with ``script_sha256`` all zeros, as a
script cannot carry its own digest), the words of the ``consumer/en`` pack
(``wording-consumer-en.json``, compiled in: the script reads no pack), the
pack's id and sha256 (named in L2), and the two stylesheets the script inserts
once at render (``static/kit.css`` and ``static/standard_history.css``), which
the manifest pins by ``style_sha256``. The manifest also pins the pack by
``wording_sha256``.

``--bundle FILE.tar.gz`` writes the release bundle (``bundle_files``) and
``FILE.tar.gz.sha256``; Release · Go attaches it to the release.

``python -m capsule_viewer.standard_history.module_slot --write`` rewrites the
script and the manifest in place; ``--check`` exits 1 when a committed file is
not what this writes (``tests/test_standard_history_module.py`` runs the same
check). A change to ``static/kit.css`` changes this script, as it changes the
receipt scripts.
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import re
import sys
import tarfile
from pathlib import Path

from . import EXTENSION, STANDARD_HISTORY_ID

ZERO = "0" * 64
_PACKAGE = Path(__file__).resolve().parent
STATIC = _PACKAGE.parent / "static"
SCRIPT = STATIC / "standard_history_card.js"
KIT_CSS = STATIC / "kit.css"
CARD_CSS = STATIC / "standard_history.css"
PACK = _PACKAGE / "wording-consumer-en.json"
MANIFEST = _PACKAGE / "manifest.json"
_GENERATED = re.compile(r"^(  var (\w+) = ).*; // @generated \2$", re.MULTILINE)

# The selection clauses. Every other module that reads a deal bundle's own
# extension is forbidden, so no bundle selects this module and another one.
SOURCE_MANIFEST = {
    "spec_version": "aac.presentation-manifest/v0",
    "id": STANDARD_HISTORY_ID,
    "presentation_api": "aac.presentation-api/v0",
    "runtime_min": "0.1.0",
    "trust_class": "trusted-executable",
    "requires": {"bundle_kind": "evidence-bundle/v2", "extensions": {"required": [EXTENSION]}},
    "forbids": {
        "profiles": ["spec_version:report/v1", "spec_version:evaluation-summary/v1", "result_version:evidence-result-v0"],
        "extensions": ["composed/v1", "x-deal-v0", "x-history-selection/v0"],
    },
    "audiences": ["*"],
    "formats": ["html"],
    "fallback": False,
    "priority": 1,
}


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _js(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(", ", ": "))


def _manifest(script_sha256: str) -> dict:
    manifest = json.loads(json.dumps(SOURCE_MANIFEST))
    manifest["executable"] = {
        "carrier": "module-slot",
        "script_sha256": script_sha256,
        "style_sha256": [_sha(KIT_CSS.read_bytes()), _sha(CARD_CSS.read_bytes())],
        "wording_sha256": _sha(PACK.read_bytes()),
    }
    return manifest


def script_bytes() -> bytes:
    """The script with its generated lines filled."""
    pack = PACK.read_bytes()
    raw = json.loads(pack.decode("utf-8"))
    values = {
        "MANIFEST": _js(_manifest(ZERO)),
        "WORDS": _js(raw["entries"]),
        "PACK": _js({"id": raw["id"], "sha256": _sha(pack)}),
        "KIT_CSS": _js(KIT_CSS.read_text(encoding="utf-8")),
        "CARD_CSS": _js(CARD_CSS.read_text(encoding="utf-8")),
    }
    source = SCRIPT.read_text(encoding="utf-8")
    if sorted(m.group(2) for m in _GENERATED.finditer(source)) != sorted(values):
        raise ValueError("standard_history_card.js does not carry exactly the generated lines this fills")
    return _GENERATED.sub(lambda m: f"{m.group(1)}{values[m.group(2)]}; // @generated {m.group(2)}", source).encode("utf-8")


def manifest() -> dict:
    """The module-slot manifest, pinning the script, its stylesheets and its wording pack."""
    return _manifest(_sha(script_bytes()))


def outputs() -> dict[Path, bytes]:
    return {SCRIPT: script_bytes(), MANIFEST: (json.dumps(manifest(), indent=2, ensure_ascii=False) + "\n").encode("utf-8")}


def stale() -> list[Path]:
    """The committed files that are not what ``outputs`` writes."""
    return [path for path, data in outputs().items() if not path.exists() or path.read_bytes() != data]


# The files a plugin carries to put this module in a page, by the role the
# cli-plugin/v1 handshake gives each (capsule-cli plugin_presentations.go).
BUNDLE_DIR = "standard-history-module"


def bundle_files() -> dict[str, bytes]:
    """The release bundle: the module's own files, and ``presentation.json``, the
    handshake's ``presentations`` entry for them (the manifest, and each file's
    role, path and sha256), so a plugin copies it and states nothing of its own.
    Every digest is the one the manifest pins, and the committed script and
    manifest are what ``--write`` produces, or this refuses to build."""
    script, kit, card, pack = script_bytes(), KIT_CSS.read_bytes(), CARD_CSS.read_bytes(), PACK.read_bytes()
    manifest_data = manifest()
    files = {
        "standard_history_card.js": ("script", script),
        "kit.css": ("style", kit),
        "standard_history.css": ("style", card),
        "wording-consumer-en.json": ("wording", pack),
    }
    if stale():
        raise ValueError("the committed script or manifest is not what --write produces: run --write first")
    entry = {
        "manifest": manifest_data,
        "files": [{"role": role, "path": f"{BUNDLE_DIR}/{name}", "sha256": _sha(data)} for name, (role, data) in files.items()],
    }
    out = {"manifest.json": (json.dumps(manifest_data, indent=2, ensure_ascii=False) + "\n").encode("utf-8")}
    out.update({name: data for name, (_, data) in files.items()})
    out["presentation.json"] = (json.dumps(entry, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    return dict(sorted(out.items()))


def bundle_tar() -> bytes:
    """``bundle_files`` as a gzip tar with nothing of the run in it: sorted names,
    no owner, no time. The bytes are the same on every run in one build
    environment; the deflate stream can differ with another zlib, so the
    release states the bundle's sha256 and attests that file."""
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.PAX_FORMAT) as tar:
        for name, data in bundle_files().items():
            info = tarfile.TarInfo(f"{BUNDLE_DIR}/{name}")
            info.size, info.mtime, info.mode = len(data), 0, 0o644
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            tar.addfile(info, io.BytesIO(data))
    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", mtime=0, filename="") as gz:
        gz.write(raw.getvalue())
    return out.getvalue()


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if args == ["--write"]:
        # The script first: the manifest pins the bytes it was just given.
        SCRIPT.write_bytes(script_bytes())
        MANIFEST.write_bytes(outputs()[MANIFEST])
        return 0
    if args == ["--check"]:
        bad = stale()
        for path in bad:
            print(f"stale: {path}", file=sys.stderr)
        return 1 if bad else 0
    if len(args) == 2 and args[0] == "--bundle":
        data = bundle_tar()
        Path(args[1]).write_bytes(data)
        Path(args[1] + ".sha256").write_text(f"{_sha(data)}\n", encoding="utf-8")
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
