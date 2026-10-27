# SPDX-License-Identifier: Apache-2.0
"""The receipt modules' module-slot scripts and their manifests, and how a
registry chooses between them and capsulectl's deal view.

The scripts' behaviour is tested against the Python modules in
``js-tests/receipt_parity.test.js``; this holds the files a plugin ships to
what ``module_slot.py`` writes from the Python side, and records the
co-match with ``capsulectl.deal-view/v0`` (capsule-cli
``internal/cli/assets/deal-view.manifest.json``, vendored from e9b1f21 in
``testdata/capsule-cli/``):

* agent-action-capsule's registry never orders two modules of one tier
  (``ts/src/presentation-registry.ts``: priority is not read by
  ``resolveModules``; ``register`` refuses a second module some descriptor
  could match together with one already registered, whatever the audience
  lists say when either is ``*``; a tie at resolution is
  ``PresentationAmbiguityError``, never first-wins);
* the deal view requires ``x-deal-v0``, forbids no extension and serves
  ``*``, so every specific module that renders a deal copy co-matches it:
  the unilateral and seller receipts do, the bilateral one (which forbids
  ``x-deal-v0``) does not. No forbids clause on the receipt side can part
  them: a real copy's descriptor matches both;
* ``presentation build`` puts the built-ins and the plugins' modules in a
  page, never the deal view, so the three receipts register there with no
  ambiguity and the page resolves a receipt copy to its receipt module;
  ``presentation list`` registers the deal view beside them and stops at
  registration (``AmbiguityError``). That is capsule-cli's to change.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path

import jsonschema
import pytest
from receipt_helpers import RECEIPTS, audience_of, load

from capsule_viewer.receipt import BILATERAL_MANIFEST, SELLER_MANIFEST, UNILATERAL_MANIFEST, module_slot
from capsule_viewer.registry import AmbiguityError, Registry, co_matchable, descriptor, matches
from capsule_viewer.verifier_report import context_from_capsulectl

ROOT = Path(__file__).resolve().parent.parent
AAC = ROOT / "tests" / "testdata" / "aac-presentation"
SCHEMA = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
BUILTINS = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((AAC / "builtin").glob("*.json"))}
DEAL_VIEW = json.loads((ROOT / "tests" / "testdata" / "capsule-cli" / "deal-view.manifest.json").read_text(encoding="utf-8"))
SLOT = {kind: json.loads(module_slot.manifest_path(kind).read_text(encoding="utf-8")) for kind in module_slot.KINDS}
PYTHON = {"unilateral": UNILATERAL_MANIFEST, "seller": SELLER_MANIFEST, "bilateral": BILATERAL_MANIFEST}
# capsule-cli internal/cli/plugin_presentations.go presentationFileLimit.
PRESENTATION_FILE_LIMIT = 1 << 20
# Real copies capsulectl (capsule-cli main) cut: main-buyer-* and main-seller-* by examples/receipt/cut_main_bundles.sh
# (e9b1f21; the report is a record on the log), main-standalone-* by examples/receipt/cut_standalone_bundles.sh (d8f58012;
# the report is the standalone record in x-deal-report/v0).
MAIN = ("main-buyer-keep", "main-buyer-counterparty", "main-standalone-keep", "main-standalone-counterparty", "main-seller-keep", "main-seller-counterparty")


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _generated(script: str, name: str) -> object:
    match = re.search(rf"^  var {name} = (.*); // @generated {name}$", script, re.MULTILINE)
    assert match, name
    return json.loads(match.group(1))


# ---- the shipped files ---------------------------------------------------------


def test_the_scripts_and_manifests_are_what_module_slot_writes():
    assert module_slot.stale() == []


@pytest.mark.parametrize("kind", module_slot.KINDS)
def test_each_manifest_is_schema_valid_and_pins_its_script_and_the_kit_stylesheet(kind):
    manifest = SLOT[kind]
    validator = jsonschema.Draft202012Validator({**SCHEMA, "$ref": "#/$defs/PresentationManifest"})
    assert list(validator.iter_errors(manifest)) == []
    assert manifest["executable"] == {
        "carrier": "module-slot",
        "script_sha256": _sha(module_slot.script_path(kind)),
        "style_sha256": [_sha(module_slot.KIT_CSS)],
    }
    # Everything else is the Python module's manifest: one id, one set of selection clauses, two carriers.
    assert {k: v for k, v in manifest.items() if k != "executable"} == {k: v for k, v in PYTHON[kind].items() if k != "executable"}
    assert PYTHON[kind]["executable"] == {"carrier": "core-runtime"}


@pytest.mark.parametrize("kind", module_slot.KINDS)
def test_each_script_carries_its_manifest_the_words_and_the_stylesheet(kind):
    script = module_slot.script_path(kind).read_text(encoding="utf-8")
    assert module_slot.script_path(kind).stat().st_size < PRESENTATION_FILE_LIMIT
    assert _generated(script, "KIND") == kind
    # A script cannot carry its own digest: all zeros there, as in capsulectl's deal view.
    assert _generated(script, "MANIFEST") == {**SLOT[kind], "executable": {**SLOT[kind]["executable"], "script_sha256": "0" * 64}}
    pack = module_slot.pack_bytes()
    assert _generated(script, "WORDS") == json.loads(pack)["entries"]
    assert _generated(script, "PACK") == {"id": json.loads(pack)["id"], "sha256": hashlib.sha256(pack).hexdigest()}
    assert _generated(script, "KIT_CSS") == module_slot.KIT_CSS.read_text(encoding="utf-8")


def test_one_script_per_module_registering_only_its_own():
    scripts = [module_slot.script_path(k).read_text(encoding="utf-8") for k in module_slot.KINDS]
    assert len({_sha(module_slot.script_path(k)) for k in module_slot.KINDS}) == 3
    for script in scripts:
        assert script.count("root.EvidenceGraph.registerPresentation(") == 1
        assert "import " not in script.split("(function (root)", 1)[1].split("\n", 1)[0]
        for forbidden in ("fetch(", "XMLHttpRequest", "innerHTML", "eval(", "new Function", "<script"):
            assert forbidden not in script, forbidden


# ---- the co-match with capsulectl's deal view -----------------------------------


def test_the_deal_view_co_matches_the_unilateral_and_seller_receipts_and_not_the_bilateral():
    assert DEAL_VIEW["id"] == "capsulectl.deal-view/v0" and DEAL_VIEW["fallback"] is False
    assert DEAL_VIEW["requires"]["extensions"]["required"] == ["x-deal-v0"]
    assert "extensions" not in DEAL_VIEW["forbids"] and DEAL_VIEW["audiences"] == ["*"]
    assert co_matchable(DEAL_VIEW, SLOT["unilateral"]) and co_matchable(SLOT["unilateral"], DEAL_VIEW)
    assert co_matchable(DEAL_VIEW, SLOT["seller"])
    # The bilateral receipt forbids x-deal-v0, which the deal view requires.
    assert not co_matchable(DEAL_VIEW, SLOT["bilateral"])


@pytest.mark.parametrize("name", MAIN)
def test_a_real_copy_matches_both_the_deal_view_and_its_receipt(name):
    # Not an artefact of the static test: the descriptor of a copy capsulectl
    # cut matches the deal view and the receipt module for it, at its audience.
    bundle, output = load(name)
    d = descriptor(context_from_capsulectl(bundle, output)[0])
    kind = "seller" if "seller" in name else "unilateral"
    audience = audience_of(name)
    assert matches(DEAL_VIEW, d, audience, "html")
    assert matches(SLOT[kind], d, audience, "html")
    other = "unilateral" if kind == "seller" else "seller"
    assert not matches(SLOT[other], d, audience, "html")


def test_no_receipt_side_forbids_can_part_them():
    # Forbidding any extension a real copy does not engage leaves the pair
    # co-matchable; forbidding one it engages stops the receipt matching that copy.
    engaged = set()
    for name in MAIN:
        engaged |= set(load(name)[0]["extensions"])
    assert engaged == {"x-cadence-witness/v0", "x-deal-report/v0", "x-deal-v0", "x-deal-seller/v0"}
    for kind in ("unilateral", "seller"):
        for kind_token in ("x-deal-v0", "x-deal-seller/v0", "x-cadence-witness/v0", "x-some-other/v0"):
            m = copy.deepcopy(SLOT[kind])
            if kind_token in m["requires"]["extensions"]["required"]:
                continue
            m["forbids"]["extensions"] = sorted(set(m["forbids"].get("extensions", [])) | {kind_token})
            renders_main = any(
                matches(m, descriptor(context_from_capsulectl(*load(n))[0]), audience_of(n), "html") for n in MAIN
            )
            assert co_matchable(DEAL_VIEW, m) or not renders_main, (kind, kind_token)


def test_the_deal_view_as_a_fallback_would_collide_with_the_builtin_fallback():
    # Why "make the deal view a fallback" is not the fix: the page's built-in
    # fallback requires nothing, so two fallbacks would co-match, and
    # capsulectl's own check on the deal view (dealViewModule) would refuse it.
    fallback = {k: v for k, v in DEAL_VIEW.items() if k != "priority"} | {"fallback": True}
    assert co_matchable(fallback, BUILTINS["builtin-no-aggregate"])


# ---- the two registries capsulectl builds ---------------------------------------


def _register(manifests) -> Registry:
    registry = Registry()
    for m in manifests:
        registry.register(m, lambda _c: True)
    return registry


def test_presentation_build_registers_the_builtins_and_the_three_receipts_without_ambiguity():
    # capsule-cli presentation_build.go: builtinPresentationManifests() and the plugins' modules.
    registry = _register([*BUILTINS.values(), *SLOT.values()])
    for name in MAIN:
        bundle, output = load(name)
        context, _ = context_from_capsulectl(bundle, output)
        resolution = registry.resolve(context, audience_of(name), "html")
        assert resolution.outcome == "module"
        assert resolution.entry.id == f"capsuleviewer.receipt.{'seller' if 'seller' in name else 'unilateral'}/v0"


def test_presentation_list_stops_at_registration_with_the_deal_view():
    # capsule-cli presentation_list.go presentationCandidates: the built-ins, then the deal view, then the plugins'.
    with pytest.raises(AmbiguityError) as raised:
        _register([*BUILTINS.values(), DEAL_VIEW, *SLOT.values()])
    assert sorted(raised.value.ids) == ["capsulectl.deal-view/v0", "capsuleviewer.receipt.unilateral/v0"]
    # Without the deal view in that list, it registers and resolves as the build does.
    _register([*BUILTINS.values(), *SLOT.values()])


def test_every_real_copy_is_a_fixture_here():
    assert sorted(p.name.removesuffix(".bundle.json") for p in RECEIPTS.glob("main-*.bundle.json")) == sorted(MAIN)
