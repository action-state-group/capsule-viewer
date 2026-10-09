# SPDX-License-Identifier: Apache-2.0
"""The unilateral receipt manifest against agent-action-capsule's presentation
contract: schema-valid, selected for every receipt fixture and every audience
it serves, never ambiguous with the built-ins, the generic fallback or the
rules module, and refusing a composition (contract sections 4.3 to 4.5)."""
from __future__ import annotations

import copy
import json
from pathlib import Path

import jsonschema
import pytest
from receipt_helpers import FIXTURES, Doc, audience_of, load, report_for

from capsule_viewer.context import VerifiedBundleContext, build_context
from capsule_viewer.kit.components import VerificationResult
from capsule_viewer.receipt import UNILATERAL_MANIFEST, UnilateralReceiptModule, unilateral_manifest
from capsule_viewer.registry import (
    AmbiguityError,
    Entry,
    RegistrationError,
    Registry,
    co_matchable,
    descriptor,
)
from capsule_viewer.verifier_report import context_from_capsulectl
from capsule_viewer.wording import EMPTY_PACK

AAC = Path(__file__).parent / "testdata" / "aac-presentation"
SCHEMA = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
BUILTINS = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((AAC / "builtin").glob("*.json"))}
GENERIC = json.loads((AAC / "examples" / "example-generic-fallback.json").read_text(encoding="utf-8"))
# The rules module's manifest as the rules-presentation-module change files it:
# a specific module requiring the rules_compare profile.
RULES = {
    "spec_version": "aac.presentation-manifest/v0",
    "id": "org.example.rules/v0",
    "presentation_api": "aac.presentation-api/v0",
    "runtime_min": "0.1.0",
    "trust_class": "trusted-executable",
    "requires": {"bundle_kind": "evidence-bundle/v2", "profiles": ["spec_version:org.example.rules_compare/v0"]},
    "forbids": {"profiles": ["result_version:evidence-result-v0"]},
    "audiences": ["*"],
    "formats": ["html"],
    "fallback": False,
    "priority": 1,
    "executable": {"carrier": "core-runtime"},
}
UNILATERAL_ID = "capsuleviewer.receipt.unilateral/v0"
RULES_PROFILE = "spec_version:org.example.rules_compare/v0"
# The manifest as a deployment that also registers the rules module configures
# it at render time: forbidding the rules module's profile.
CONFIGURED = unilateral_manifest([RULES_PROFILE])


def _validator() -> jsonschema.Draft202012Validator:
    return jsonschema.Draft202012Validator({**SCHEMA, "$ref": "#/$defs/PresentationManifest"})


def _module(audience: str = "keep") -> UnilateralReceiptModule:
    return UnilateralReceiptModule(EMPTY_PACK, audience=audience, forbid_profiles=[RULES_PROFILE])


def full_registry(module: UnilateralReceiptModule | None = None) -> Registry:
    """The receipt module beside every manifest it must coexist with. The
    built-ins and the rules module are registered by manifest; this test
    exercises selection, so their canRender always says yes."""
    registry = Registry()
    for manifest in (*BUILTINS.values(), RULES, GENERIC):
        if manifest["id"] == "aac.builtin.no-aggregate/v0":
            continue  # a second fallback: the generic example stands for the fallback tier
        registry.register(manifest, lambda _c: True)
    module = module or _module()
    registry.register(module.manifest_json, module.canRender, module)
    return registry


def test_the_manifest_is_schema_valid():
    assert sorted(_validator().iter_errors(UNILATERAL_MANIFEST), key=str) == []


def test_the_schema_check_can_fail():
    bad = {**UNILATERAL_MANIFEST, "title": "words belong in the pack"}
    assert list(_validator().iter_errors(bad))


def test_the_module_carries_its_manifest():
    assert _module().manifest.id == UNILATERAL_ID
    assert UNILATERAL_MANIFEST["id"] == UNILATERAL_ID


SPECIFIC = [m for m in (*BUILTINS.values(), RULES) if not m["fallback"]]


def test_every_specific_manifest_is_compared():
    assert len(SPECIFIC) == 6  # five built-ins and the rules module


@pytest.mark.parametrize("other", SPECIFIC, ids=lambda m: m["id"])
def test_never_ambiguous_with_a_specific_module(other):
    assert not co_matchable(CONFIGURED, other)


def test_the_shipped_manifest_names_no_producer_profile_and_needs_the_configuration():
    """Without the render-time forbid, the shipped manifest and a module selected
    by a producer-named profile could both match one bundle; with it, never."""
    assert not any(t.startswith("spec_version:org.") for t in UNILATERAL_MANIFEST["forbids"]["profiles"])
    assert co_matchable(UNILATERAL_MANIFEST, RULES)
    assert not co_matchable(CONFIGURED, RULES)
    assert all(not co_matchable(UNILATERAL_MANIFEST, m) for m in BUILTINS.values() if not m["fallback"])


@pytest.mark.parametrize("fallback", [BUILTINS["builtin-no-aggregate"], GENERIC], ids=lambda m: m["id"])
def test_a_fallback_matches_too_and_is_never_its_tie(fallback):
    """A fallback matches every receipt descriptor; it sits in the other tier,
    so the receipt is selected above it (see the resolution tests below)."""
    assert co_matchable(UNILATERAL_MANIFEST, fallback)
    registry = Registry()
    registry.register(fallback, lambda _c: True)
    registry.register(UNILATERAL_MANIFEST, lambda _c: True)


def test_the_registration_test_bites():
    """Mutant: drop the forbids that separate the receipt from the Result built-in
    and from the rules module; registration must then refuse it as ambiguous."""
    loose = copy.deepcopy(CONFIGURED)
    loose["forbids"]["profiles"] = []
    registry = Registry()
    registry.register(BUILTINS["builtin-result"], lambda _c: True)
    with pytest.raises(AmbiguityError) as err:
        registry.register(loose, lambda _c: True)
    assert UNILATERAL_ID in err.value.ids
    registry = Registry()
    registry.register(RULES, lambda _c: True)
    with pytest.raises(AmbiguityError):
        registry.register(loose, lambda _c: True)


def test_the_full_registry_registers():
    assert len(full_registry().entries) == len(BUILTINS) - 1 + 3


@pytest.mark.parametrize("name", FIXTURES)
def test_each_receipt_fixture_selects_only_the_unilateral_module(name):
    context, _ = context_from_capsulectl(*load(name))
    registry = full_registry(_module(audience_of(name)))
    matched = registry.list(context, audience_of(name), "html")
    assert [e.id for e in matched] == [GENERIC["id"], UNILATERAL_ID]  # one specific, one fallback: tiers never tie
    resolution = registry.resolve(context, audience_of(name), "html")
    assert resolution.outcome == "module"
    assert resolution.entry.id == UNILATERAL_ID
    assert resolution.refusals == ()


@pytest.mark.parametrize("audience", ["counterparty", "adjudicator"])
def test_a_copy_is_never_shown_as_another_audiences(audience):
    """The keep copy, asked for as a shared audience's page: the module declines
    (the copy's own sealed report says whom it was cut for), so none of the
    user's own content is shown as that audience's."""
    context, _ = context_from_capsulectl(*load("keep"))
    module = _module(audience)
    assert module.canRender(context) is False
    assert full_registry(module).resolve(context, audience, "html").entry.id == GENERIC["id"]


def test_an_audience_it_does_not_serve_falls_to_the_fallback():
    context, _ = context_from_capsulectl(*load("keep"))
    assert full_registry().resolve(context, "auditor", "html").entry.id == GENERIC["id"]


def test_a_format_it_does_not_produce_falls_to_the_fallback():
    context, _ = context_from_capsulectl(*load("keep"))
    assert full_registry().resolve(context, "keep", "fragment").entry.id == GENERIC["id"]


def _context_with(extra_extensions: Doc, name: str = "keep") -> VerifiedBundleContext:
    bundle, output = load(name)
    bundle = copy.deepcopy(bundle)
    bundle["extensions"].update(extra_extensions)
    context, _ = context_from_capsulectl(bundle, report_for(bundle, output))
    return context


def test_a_composition_is_never_shown_as_a_unilateral_receipt():
    context = _context_with({"composed/v1": {"members": []}})
    assert "composed/v1" in descriptor(context).extensions
    resolution = full_registry().resolve(context, "keep", "html")
    assert resolution.entry.id == GENERIC["id"]


def test_the_composition_forbid_bites():
    """Mutant: without ``forbids composed/v1`` the receipt module would take a
    composed bundle -- the case the bilateral module exists for."""
    loose = copy.deepcopy(UNILATERAL_MANIFEST)
    del loose["forbids"]["extensions"]
    registry = Registry()
    module = _module()
    registry.register(loose, module.canRender, module)
    context = _context_with({"composed/v1": {"members": []}})
    assert registry.resolve(context, "keep", "html").entry.id == UNILATERAL_ID


def test_a_bundle_without_the_deal_extension_is_not_a_receipt():
    bundle, output = load("keep")
    bundle = copy.deepcopy(bundle)
    del bundle["extensions"]["x-deal-v0"]
    context, _ = context_from_capsulectl(bundle, report_for(bundle, output))
    assert full_registry().resolve(context, "keep", "html").entry.id == GENERIC["id"]


def test_an_unverified_bundle_resolves_to_the_refusal_and_calls_nothing():
    bundle, _ = load("keep")
    calls = []
    registry = Registry()
    registry.register(UNILATERAL_MANIFEST, lambda c: calls.append(c) or True)
    failed = build_context(bundle, VerificationResult("v", "failed"), {})
    assert registry.resolve(failed, "keep", "html").outcome == "refusal"
    assert calls == []


def test_a_receipt_the_module_declines_falls_to_the_fallback():
    """Two disclosed deal reports: the text may have been swapped, so the module
    declines and nothing of its is shown."""
    bundle, output = load("counterparty")
    keep_bundle, _ = load("keep")
    bundle = copy.deepcopy(bundle)
    keep_report = keep_bundle["extensions"]["x-deal-v0"]["sealed_report"]
    bundle["disclosures"][keep_report] = keep_bundle["disclosures"][keep_report]
    output = copy.deepcopy(output)
    for entry in output["disclosures"]:
        if entry["capsule_id"] == keep_report:
            entry["status"] = "disclosure_match"
    context, _ = context_from_capsulectl(bundle, report_for(bundle, output))
    module = _module("counterparty")
    assert module.canRender(context) is False
    assert full_registry(module).resolve(context, "counterparty", "html").entry.id == GENERIC["id"]


# ---- the registry's own rules ------------------------------------------------


def test_registering_an_id_twice_is_refused():
    registry = Registry()
    registry.register(UNILATERAL_MANIFEST, lambda _c: True)
    with pytest.raises(RegistrationError):
        registry.register(UNILATERAL_MANIFEST, lambda _c: True)


def test_a_dead_manifest_is_refused():
    dead = copy.deepcopy(UNILATERAL_MANIFEST)
    dead["forbids"]["extensions"] = ["x-deal-v0"]
    with pytest.raises(RegistrationError):
        Registry().register(dead, lambda _c: True)


def test_two_fallbacks_are_ambiguous():
    other = {**GENERIC, "id": "org.example.other-fallback/v0"}
    registry = Registry()
    registry.register(GENERIC, lambda _c: True)
    with pytest.raises(AmbiguityError):
        registry.register(other, lambda _c: True)


def test_ambiguity_at_resolution_names_both_and_calls_no_can_render():
    """A registry that skipped the static test still never picks first-wins."""
    calls = []
    registry = Registry()
    twin = {**UNILATERAL_MANIFEST, "id": "org.example.twin/v0"}
    registry.entries += [Entry(UNILATERAL_MANIFEST, lambda c: calls.append(1) or True), Entry(twin, lambda c: calls.append(2) or True)]
    context, _ = context_from_capsulectl(*load("keep"))
    with pytest.raises(AmbiguityError) as err:
        registry.resolve(context, "keep", "html")
    assert err.value.ids == ("capsuleviewer.receipt.unilateral/v0", "org.example.twin/v0")
    assert calls == []


def test_a_module_this_runtime_cannot_honour_is_refused_out_loud():
    future = {**UNILATERAL_MANIFEST, "presentation_api": "aac.presentation-api/v99"}
    calls = []
    registry = Registry()
    registry.register(future, lambda _c: calls.append(1) or True)
    registry.register(GENERIC, lambda _c: True)
    context, _ = context_from_capsulectl(*load("keep"))
    resolution = registry.resolve(context, "keep", "html")
    assert resolution.entry.id == GENERIC["id"]
    assert [(r.id, r.reason) for r in resolution.refusals] == [(UNILATERAL_ID, "presentation_api_unsupported")]
    assert calls == []
    newer = {**UNILATERAL_MANIFEST, "runtime_min": "0.2.0"}
    registry = Registry()
    registry.register(newer, lambda _c: True)
    assert registry.resolve(context, "keep", "html").refusals[0].reason == "runtime_too_old"


OBLIGATION = {"key": "k", "article": "a", "title": "t", "plain": "p", "method": "m", "applicability": {"status": "in_force", "note": "n"}}


@pytest.mark.parametrize(
    ("block", "engaged"),
    [
        ({"enabled": True, "obligations": [OBLIGATION]}, True),
        ({"enabled": False, "obligations": [OBLIGATION]}, False),
        ({"enabled": True, "obligations": []}, False),
        ({"enabled": True, "obligations": [{**OBLIGATION, "method": None}]}, False),
        ({"enabled": True, "obligations": [{**OBLIGATION, "applicability": {"status": "repealed", "note": "n"}}]}, False),
        ({"enabled": True, "obligations": [{"key": "only"}, OBLIGATION]}, True),
    ],
)
def test_the_compliance_extension_is_engaged_as_aac_reads_it(block, engaged):
    context = _context_with({"eu-ai-act-compliance/v1": block})
    assert ("eu-ai-act-compliance/v1" in descriptor(context).extensions) is engaged


@pytest.mark.parametrize(("enabled", "engaged"), [(True, True), (False, False), ("true", False)])
def test_the_outcome_extension_is_engaged_only_when_enabled(enabled, engaged):
    context = _context_with({"outcome-report/v1": {"enabled": enabled}})
    assert ("outcome-report/v1" in descriptor(context).extensions) is engaged


@pytest.mark.parametrize("member", ["presentation_api", "runtime_min", "audiences", "formats", "fallback"])
def test_a_manifest_missing_a_member_is_refused_at_registration(member):
    broken = {k: v for k, v in UNILATERAL_MANIFEST.items() if k != member}
    with pytest.raises(RegistrationError, match=member):
        Registry().register(broken, lambda _c: True)


@pytest.mark.parametrize(
    "manifest",
    [{**GENERIC, "priority": 1}, {k: v for k, v in UNILATERAL_MANIFEST.items() if k != "priority"}],
    ids=["fallback-with-priority", "specific-without-priority"],
)
def test_priority_is_only_on_a_specific_module(manifest):
    with pytest.raises(RegistrationError, match="priority"):
        Registry().register(manifest, lambda _c: True)


def test_an_ambiguous_page_never_says_the_bundle_failed():
    from capsule_viewer.shell import AMBIGUOUS, REFUSAL, present

    twin = {**UNILATERAL_MANIFEST, "id": "org.example.twin/v0"}
    registry = Registry()
    registry.entries += [Entry(UNILATERAL_MANIFEST, lambda _c: True), Entry(twin, lambda _c: True)]
    context, _ = context_from_capsulectl(*load("keep"))
    html = present(context, registry, audience="keep")
    assert REFUSAL not in html
    assert AMBIGUOUS.split("(")[0] in html and "org.example.twin/v0" in html
