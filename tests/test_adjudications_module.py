# SPDX-License-Identifier: Apache-2.0
"""The Adjudications module (``capsuleviewer.adjudications/v0``): a module-slot
script (``static/adjudications_card.js``) pinned by its manifest, with its pack
compiled in. The manifest is schema-valid and pins what the generator writes;
the module is never co-matchable with another module this repository ships; the
script fetches nothing; the pack is a valid wording pack. The script itself is
tested directly in js-tests/adjudications_card.test.js."""
from __future__ import annotations

import hashlib
import io
import json
import re
import tarfile
from pathlib import Path

import jsonschema
import pytest

from capsule_viewer.adjudications import ADJUDICATIONS_ID, EXTENSION, adjudications_manifest, module_slot
from capsule_viewer.history import HISTORY_MANIFEST
from capsule_viewer.receipt.module_slot import KINDS
from capsule_viewer.receipt.module_slot import manifest as receipt_manifest
from capsule_viewer.registry import co_matchable
from capsule_viewer.rules import rules_manifest
from capsule_viewer.rules.fixture import RECORD_KIND
from capsule_viewer.standard_history import standard_history_manifest

ROOT = Path(__file__).resolve().parent.parent
AAC = ROOT / "tests" / "testdata" / "aac-presentation"
SCHEMA = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
BUILTINS = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((AAC / "builtin").glob("*.json"))]
MANIFEST = adjudications_manifest()


def _validator(ref: str) -> jsonschema.Draft202012Validator:
    return jsonschema.Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{ref}"})


def test_the_committed_script_and_manifest_are_what_the_generator_writes():
    assert module_slot.stale() == []


def test_the_manifest_is_schema_valid_and_pins_script_styles_and_words():
    assert list(_validator("PresentationManifest").iter_errors(MANIFEST)) == []
    assert MANIFEST["id"] == ADJUDICATIONS_ID
    assert MANIFEST["requires"]["extensions"]["required"] == [EXTENSION]
    pins = MANIFEST["executable"]
    assert pins["carrier"] == "module-slot"
    assert pins["script_sha256"] == hashlib.sha256(module_slot.SCRIPT.read_bytes()).hexdigest()
    assert pins["style_sha256"] == [hashlib.sha256(p.read_bytes()).hexdigest() for p in (module_slot.KIT_CSS, module_slot.CARD_CSS)]
    assert pins["wording_sha256"] == hashlib.sha256(module_slot.PACK.read_bytes()).hexdigest()


def test_the_script_carries_the_same_manifest_with_a_zero_pin():
    m = re.search(r"var MANIFEST = (\{.*\}); // @generated MANIFEST\n", module_slot.SCRIPT.read_text(encoding="utf-8"))
    zero = json.loads(json.dumps(MANIFEST))
    zero["executable"]["script_sha256"] = "0" * 64
    assert json.loads(m.group(1)) == zero


def test_the_script_fetches_nothing_and_imports_nothing():
    text = module_slot.SCRIPT.read_text(encoding="utf-8")
    for token in ("fetch(", "XMLHttpRequest", "WebSocket(", "<script", "import(", "require(", "http://", "https://",
                  "innerHTML", "eval(", "localStorage", "sendBeacon"):
        assert token not in text, token


def test_the_pack_is_a_wording_pack_and_its_only_percentages_are_the_two_derived_ones():
    pack = json.loads(module_slot.PACK.read_text(encoding="utf-8"))
    assert list(_validator("WordingPack").iter_errors(pack)) == []
    assert pack["id"] == "capsuleviewer.wording.adjudications-en/v0"
    assert sorted(k for k, v in pack["entries"].items() if "%" in v) == ["term.concurrence", "tile.percent.value"]
    assert "%" not in module_slot.CARD_CSS.read_text(encoding="utf-8")


@pytest.mark.parametrize("other", [HISTORY_MANIFEST, standard_history_manifest(), rules_manifest(RECORD_KIND),
                                   *(receipt_manifest(k) for k in KINDS), *(m for m in BUILTINS if not m["fallback"])],
                         ids=lambda m: m["id"])
def test_never_co_matchable_with_another_module(other):
    assert not co_matchable(MANIFEST, other)
    assert not co_matchable(other, MANIFEST)


def _unpack(blob: bytes) -> dict[str, bytes]:
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        return {m.name: tar.extractfile(m).read() for m in tar.getmembers() if m.isfile()}


def test_the_release_bundle_is_the_same_bytes_on_every_run_and_carries_what_the_manifest_pins():
    first = module_slot.bundle_tar()
    assert module_slot.bundle_tar() == first
    files = _unpack(first)
    entry = json.loads(files["adjudications-module/presentation.json"])
    assert entry["manifest"] == MANIFEST
    by_role: dict[str, list[str]] = {}
    for f in entry["files"]:
        assert f["path"].startswith("adjudications-module/") and ".." not in f["path"].split("/")
        assert hashlib.sha256(files[f["path"]]).hexdigest() == f["sha256"]
        by_role.setdefault(f["role"], []).append(f["sha256"])
    pins = MANIFEST["executable"]
    assert by_role == {"script": [pins["script_sha256"]], "style": pins["style_sha256"], "wording": [pins["wording_sha256"]]}
