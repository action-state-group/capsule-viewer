# SPDX-License-Identifier: Apache-2.0
"""The History Card module (``capsuleviewer.history/v0``) as built from
docs/design/history-card.md: a module-slot script (``static/history_card.js``)
pinned by its manifest, which is the design's sketch; the registry resolves a
History (every real file capsulectl cut, the refused ones too) to it and to
nothing else; it is never co-matchable with a deal receipt; its words are clean. The script itself is tested directly in
js-tests/history_card.test.js."""
from __future__ import annotations

import copy
import hashlib
import json
import re
from collections.abc import Mapping
from pathlib import Path

import jsonschema
import pytest
from receipt_helpers import load

from capsule_viewer.history import (
    HISTORY_ID,
    HISTORY_MANIFEST,
    SELECTION_EXTENSION,
    history_script_bytes,
    selection_block,
)
from capsule_viewer.history.fixture import example_context
from capsule_viewer.receipt import BilateralReceiptModule, SellerReceiptModule, UnilateralReceiptModule
from capsule_viewer.registry import Registry, co_matchable, descriptor
from capsule_viewer.rules import rules_manifest
from capsule_viewer.rules.fixture import RECORD_KIND
from capsule_viewer.verifier_report import context_from_capsulectl
from capsule_viewer.wording import EMPTY_PACK

ROOT = Path(__file__).resolve().parent.parent
HISTORY = ROOT / "tests" / "testdata" / "history"
FILES = sorted(HISTORY.glob("*.bundle.json"))
SHAREABLE = HISTORY / "history-counterparty.bundle.json"
SKETCH = ROOT / "docs" / "design" / "history-card.manifest.json"
SCRIPT = ROOT / "src" / "capsule_viewer" / "static" / "history_card.js"
AAC = ROOT / "tests" / "testdata" / "aac-presentation"
SCHEMA = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
BUILTINS = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((AAC / "builtin").glob("*.json"))}
GENERIC = json.loads((AAC / "examples" / "example-generic-fallback.json").read_text(encoding="utf-8"))
AUDIENCES = ("keep", "counterparty", "adjudicator")
RULES_PROFILE = f"spec_version:{RECORD_KIND}"
# The module's text: the files the vocabulary grep (acceptance 4) reads.
MODULE_TEXT = sorted(p for p in (ROOT / "src" / "capsule_viewer" / "history").glob("*") if p.is_file()) + [SCRIPT]


def _bundle(path: Path = SHAREABLE) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _can_render(context) -> bool:
    # The script's canRender: any selection block.
    return isinstance(selection_block(context.bundle), Mapping)


def _zero_pin(manifest: dict) -> dict:
    out = copy.deepcopy(manifest)
    out["executable"]["script_sha256"] = "0" * 64
    return out


# ---- the manifest and its carrier ------------------------------------------------


def test_the_manifest_is_schema_valid_and_carried_in_the_module_slot():
    validator = jsonschema.Draft202012Validator({**SCHEMA, "$ref": "#/$defs/PresentationManifest"})
    assert list(validator.iter_errors(HISTORY_MANIFEST)) == []
    assert HISTORY_MANIFEST["id"] == HISTORY_ID == "capsuleviewer.history/v0"
    # capsulectl presentation build (capsule-cli #207) carries a plugin's module only as
    # "module-slot", pinned by script_sha256. No style and no wording pack is pinned.
    assert set(HISTORY_MANIFEST["executable"]) == {"carrier", "script_sha256"}
    assert HISTORY_MANIFEST["executable"]["carrier"] == "module-slot"


def test_the_manifest_pins_the_script_bytes():
    assert HISTORY_MANIFEST["executable"]["script_sha256"] == hashlib.sha256(SCRIPT.read_bytes()).hexdigest()
    assert history_script_bytes() == SCRIPT.read_bytes()


def test_the_manifest_is_the_design_sketch_but_for_the_pin():
    assert _zero_pin(HISTORY_MANIFEST) == json.loads(SKETCH.read_text(encoding="utf-8"))


def test_the_script_carries_the_same_manifest_with_a_zero_pin():
    m = re.search(r"var MANIFEST = (\{.*\});\n", SCRIPT.read_text(encoding="utf-8"))
    assert json.loads(m.group(1)) == _zero_pin(HISTORY_MANIFEST)


def test_the_script_fetches_nothing_and_imports_nothing():
    text = SCRIPT.read_text(encoding="utf-8")
    for token in ("fetch(", "XMLHttpRequest", "WebSocket(", "<script", "import(", "require(", "http://", "https://",
                  "innerHTML", "eval(", "localStorage", "TextEncoder", "crypto.subtle"):
        assert token not in text, token


# ---- acceptance (3): never co-matchable with a deal view ------------------------


def _receipt_modules():
    # As a deployment that also registers the Rules module configures them (render-time forbid).
    return (
        UnilateralReceiptModule(EMPTY_PACK, forbid_profiles=[RULES_PROFILE]),
        SellerReceiptModule(EMPTY_PACK, forbid_profiles=[RULES_PROFILE]),
        BilateralReceiptModule(EMPTY_PACK, forbid_profiles=[RULES_PROFILE]),
    )


@pytest.mark.parametrize("deal_view", _receipt_modules(), ids=lambda m: m.manifest_json["id"])
def test_history_and_each_deal_receipt_are_not_co_matchable(deal_view):
    assert not co_matchable(HISTORY_MANIFEST, deal_view.manifest_json)
    assert not co_matchable(deal_view.manifest_json, HISTORY_MANIFEST)
    # The one token that does it (design section 4): without it, they would be.
    bare = copy.deepcopy(deal_view.manifest_json)
    bare["forbids"]["extensions"].remove(SELECTION_EXTENSION)
    assert co_matchable(HISTORY_MANIFEST, bare)


def test_history_is_not_co_matchable_with_any_specific_builtin_or_the_rules_module():
    for m in BUILTINS.values():
        if not m["fallback"]:
            assert not co_matchable(HISTORY_MANIFEST, m), m["id"]
    assert not co_matchable(HISTORY_MANIFEST, rules_manifest(RECORD_KIND))


# ---- resolution: auto picks this module for a history container, and only for one ----


def viewer_registry() -> Registry:
    """Every module this repository ships, the specific built-ins and one
    fallback, registered by manifest: the static ambiguity test passes."""
    registry = Registry()
    for m in (*BUILTINS.values(), GENERIC):
        if m["id"] == "aac.builtin.no-aggregate/v0":
            continue  # a second fallback; the generic example stands for that tier
        registry.register(m, lambda _c: True)
    registry.register(rules_manifest(RECORD_KIND), lambda _c: True)
    for module in _receipt_modules():
        registry.register(module.manifest_json, module.canRender, module)
    registry.register(HISTORY_MANIFEST, _can_render)
    return registry


@pytest.mark.parametrize("audience", AUDIENCES)
def test_auto_resolves_the_history_container_to_the_history_module(audience):
    assert len(FILES) == 8
    for path in FILES:  # the refused ones too: shown as what is wrong, never handed elsewhere
        context = example_context(_bundle(path))
        assert descriptor(context).extensions == {SELECTION_EXTENSION}
        resolution = viewer_registry().resolve(context, audience, "html")
        assert resolution.outcome == "module" and resolution.entry.id == HISTORY_ID


def test_a_deal_bundle_never_resolves_to_the_history_module():
    bundle, output = load("keep")
    context, _ = context_from_capsulectl(bundle, output)
    resolution = viewer_registry().resolve(context, "keep", "html")
    assert resolution.entry is not None and resolution.entry.id == "capsuleviewer.receipt.unilateral/v0"


# ---- words: compiled in, and clean -------------------------------------------------


def test_no_wording_pack_is_read():
    for path in MODULE_TEXT:
        text = path.read_text(encoding="utf-8")
        assert "wording_pack" not in text and "wording-en.json" not in text and "wording_sha256" not in text, path.name


VOCABULARY = re.compile(r"score|rating|reputation|rank", re.IGNORECASE)


def test_acceptance_4_the_vocabulary_grep_returns_only_the_forbidding_sentence():
    hits = [
        (path.name, line.strip())
        for path in MODULE_TEXT
        for line in path.read_text(encoding="utf-8").splitlines()
        if VOCABULARY.search(line)
    ]
    assert hits == [
        (
            "history_card.js",
            'forbidding: "This card shows properties of the presented selection and never a score, rating, reputation, rank or trust number.",',
        )
    ]


def test_trust_appears_only_as_the_schema_member_and_in_the_forbidding_sentence():
    pattern = re.compile(r"trust", re.IGNORECASE)
    hits = [
        (path.name, line.strip())
        for path in MODULE_TEXT
        for line in path.read_text(encoding="utf-8").splitlines()
        if pattern.search(line)
    ]
    assert sorted(name for name, _ in hits) == ["history_card.js", "history_card.js", "manifest.json"]
    assert ("manifest.json", '"trust_class": "trusted-executable",') in hits
    # In the script: the forbidding sentence, and the manifest copy's schema member.
    assert all("forbidding:" in line or "var MANIFEST" in line for name, line in hits if name == "history_card.js")


# ---- the presenter limitation (a History shows who presents, not who made the deals) ----

LIMITATION = (
    "A History shows only that the holder of key K presents these copies, each of which verifies on its own. "
    "It does not show that the holder of key K made, took part in or owns these deals."
)


def test_the_l0_limitation_sentence_is_pinned():
    text = SCRIPT.read_text(encoding="utf-8")
    assert f'limitation: "{LIMITATION}",' in text
    # Drawn in L0 of the card, as a notice (js-tests/history_card.test.js checks the rendered text).
    assert '"data-history-limitation": "true" }, [WORDS.limitation]' in text


# Words that say or imply the key's holder made, took part in or owns the deals.
AUTHORSHIP = re.compile(
    r"holder'?s own|holder'?s pick|holder'?s selection|holder'?s producer|holder'?s history|holder'?s unpicked|"
    r"your deals|their deals|this person|a person|chose to show|"
    r"\b(?:his|her|their) (?:deals|history)\b|deals of (?:the )?holder|owner of the deals",
    re.IGNORECASE,
)


@pytest.mark.parametrize(
    "path",
    [SCRIPT, ROOT / "src" / "capsule_viewer" / "history" / "recompute.py", ROOT / "docs" / "design" / "history-card.md"],
    ids=lambda p: p.name,
)
def test_no_word_says_the_key_holder_made_or_owns_the_deals(path):
    hits = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if AUTHORSHIP.search(line)]
    assert hits == []
