# SPDX-License-Identifier: Apache-2.0
"""The History card module (``capsuleviewer.standard-history/v0``): a
module-slot script (``static/standard_history_card.js``) pinned by its
manifest, with the ``consumer/en`` pack compiled in. The manifest is
schema-valid and pins what the generator writes; the module is never
co-matchable with another module this repository ships; the script fetches
nothing; the pack is a valid wording pack with no percentage. The script itself
is tested directly in js-tests/standard_history_card.test.js."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import jsonschema
import pytest

from capsule_viewer.history import HISTORY_MANIFEST
from capsule_viewer.receipt.module_slot import KINDS
from capsule_viewer.receipt.module_slot import manifest as receipt_manifest
from capsule_viewer.registry import co_matchable
from capsule_viewer.rules import rules_manifest
from capsule_viewer.rules.fixture import RECORD_KIND
from capsule_viewer.standard_history import (
    EXTENSION,
    STANDARD_HISTORY_ID,
    module_slot,
    standard_history_manifest,
)

ROOT = Path(__file__).resolve().parent.parent
AAC = ROOT / "tests" / "testdata" / "aac-presentation"
SCHEMA = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
BUILTINS = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((AAC / "builtin").glob("*.json"))]
DATA = ROOT / "tests" / "testdata" / "standard-history"
MANIFEST = standard_history_manifest()


def _validator(ref: str) -> jsonschema.Draft202012Validator:
    return jsonschema.Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{ref}"})


def test_the_committed_script_and_manifest_are_what_the_generator_writes():
    assert module_slot.stale() == []


def test_the_manifest_is_schema_valid_and_pins_script_styles_and_words():
    assert list(_validator("PresentationManifest").iter_errors(MANIFEST)) == []
    assert MANIFEST["id"] == STANDARD_HISTORY_ID
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
    # The SVG namespace is a name an element is created in (the outcome bar), never an address that is loaded.
    assert text.count("http://www.w3.org/2000/svg") == 1
    text = text.replace("http://www.w3.org/2000/svg", "")
    for token in ("fetch(", "XMLHttpRequest", "WebSocket(", "<script", "import(", "require(", "http://", "https://",
                  "innerHTML", "eval(", "localStorage", "sendBeacon"):
        assert token not in text, token


def test_the_pack_is_a_wording_pack_with_no_percentage():
    pack = json.loads(module_slot.PACK.read_text(encoding="utf-8"))
    assert list(_validator("WordingPack").iter_errors(pack)) == []
    assert pack["id"] == "capsuleviewer.wording.consumer-en/v0"
    assert [k for k, v in pack["entries"].items() if re.search(r"%|percent", v, re.I)] == []
    assert "%" not in module_slot.CARD_CSS.read_text(encoding="utf-8")


@pytest.mark.parametrize("other", [HISTORY_MANIFEST, rules_manifest(RECORD_KIND), *(receipt_manifest(k) for k in KINDS),
                                   *(m for m in BUILTINS if not m["fallback"])], ids=lambda m: m["id"])
def test_never_co_matchable_with_another_module(other):
    assert not co_matchable(MANIFEST, other)
    assert not co_matchable(other, MANIFEST)


def test_every_fixture_is_valid_and_carries_its_case():
    cases = json.loads((DATA / "cases.json").read_text(encoding="utf-8"))
    assert len(cases) == len(list(DATA.glob("*.bundle.json")))
    for case in cases:
        bundle = json.loads((DATA / f"{case['name']}.bundle.json").read_text(encoding="utf-8"))
        verify = json.loads((DATA / "verify" / f"{case['name']}.json").read_text(encoding="utf-8"))
        assert verify["verdict"] == "VALID", case["name"]
        assert bundle["disclosures"][bundle["root"]]["agent_input"] == case["card"]
        assert bundle["extensions"][EXTENSION] == case["block"]
        # Deal entries travel only in the holder's own copy, which the case name says.
        assert ("deals" in case["block"]) == case["name"].endswith("-own"), case["name"]


def _unpack(blob: bytes) -> dict[str, bytes]:
    import io
    import tarfile

    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        return {m.name: tar.extractfile(m).read() for m in tar.getmembers() if m.isfile()}


def test_the_release_bundle_is_the_same_bytes_on_every_run():
    first = module_slot.bundle_tar()
    assert module_slot.bundle_tar() == first
    members = _unpack(first)
    assert sorted(members) == [f"standard-history-module/{n}" for n in sorted(module_slot.bundle_files())]


def test_the_release_bundle_carries_the_bytes_the_manifest_pins_and_a_handshake_entry_for_them():
    files = _unpack(module_slot.bundle_tar())
    entry = json.loads(files["standard-history-module/presentation.json"])
    manifest = json.loads(files["standard-history-module/manifest.json"])
    assert entry["manifest"] == manifest == MANIFEST
    pins = manifest["executable"]
    by_role: dict[str, list[str]] = {}
    for f in entry["files"]:
        # A plugin's path is relative to its launcher's directory and stays inside it.
        assert f["path"].startswith("standard-history-module/") and ".." not in f["path"].split("/")
        data = files[f["path"]]
        assert hashlib.sha256(data).hexdigest() == f["sha256"]
        by_role.setdefault(f["role"], []).append(f["sha256"])
    assert by_role["script"] == [pins["script_sha256"]]
    assert by_role["style"] == pins["style_sha256"]
    assert by_role["wording"] == [pins["wording_sha256"]]
    assert set(by_role) == {"script", "style", "wording"}
    assert STANDARD_HISTORY_ID == manifest["id"]
    assert EXTENSION in manifest["requires"]["extensions"]["required"]


def test_the_bundle_command_writes_the_tar_and_its_sha256(tmp_path):
    out = tmp_path / "standard-history-module-v0.0.0.tar.gz"
    assert module_slot.main(["--bundle", str(out)]) == 0
    data = out.read_bytes()
    assert (tmp_path / (out.name + ".sha256")).read_text(encoding="utf-8").strip() == hashlib.sha256(data).hexdigest()
    assert sorted(_unpack(data)) == [f"standard-history-module/{n}" for n in sorted(module_slot.bundle_files())]
