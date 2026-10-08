# SPDX-License-Identifier: Apache-2.0
"""Module conformance: the check any presentation module must pass, shown
accepting a conforming module and rejecting each way of not conforming."""
from __future__ import annotations

import dataclasses

import pytest

from capsule_viewer.kit import (
    KIT,
    HtmlPresentationModule,
    KitServices,
    Metric,
    ModuleContractError,
    ModuleManifest,
    check_module,
    check_module_renders,
)
from capsule_viewer.kit.contract import REQUIRED_MODULE_MEMBERS

MANIFEST = ModuleManifest(id="example.counts/v0", bundle_kind="example", audiences=("keep",))
CONTEXT = {"kind": "example", "met": 2, "not_met": 1}


class CountsModule:
    """A minimal conforming module: shows two counts the context states."""

    manifest = MANIFEST

    def canRender(self, context):
        return context.get("kind") == "example"

    def buildModel(self, context):
        return [Metric("met", str(context["met"])), Metric("not met", str(context["not_met"]))]

    def render(self, model, services):
        return services.section("Counts", services.metric_grid(model))


def _without(member):
    attrs = {name: getattr(CountsModule, name) for name in REQUIRED_MODULE_MEMBERS if name != member}
    return type(f"No_{member}", (), attrs)()


def test_kit_satisfies_the_services_protocol():
    assert isinstance(KIT, KitServices)


def test_a_conforming_module_passes_structurally_and_behaviourally():
    module = CountsModule()
    assert isinstance(module, HtmlPresentationModule)
    check_module(module)
    html = check_module_renders(module, CONTEXT)
    assert 'data-cv="metric-grid"' in html and ">2<" in html


@pytest.mark.parametrize("member", REQUIRED_MODULE_MEMBERS)
def test_a_module_missing_a_required_member_is_rejected(member):
    module = _without(member)
    with pytest.raises(ModuleContractError, match=f"missing {member}"):
        check_module(module)


def test_the_required_members_are_exactly_the_contracts_four():
    assert REQUIRED_MODULE_MEMBERS == ("manifest", "canRender", "buildModel", "render")


def test_a_non_callable_method_is_rejected():
    module = CountsModule()
    module.render = "not a function"
    with pytest.raises(ModuleContractError, match="render is not callable"):
        check_module(module)


def test_a_manifest_that_is_not_a_module_manifest_is_rejected():
    module = CountsModule()
    module.manifest = {"id": "example.counts/v0"}
    with pytest.raises(ModuleContractError, match="manifest is dict, not ModuleManifest"):
        check_module(module)


@pytest.mark.parametrize(
    ("change", "expected"),
    [({"id": ""}, "manifest.id is empty"), ({"namespace": "presentation/v1"}, "manifest.namespace 'presentation/v1'")],
)
def test_a_bad_manifest_is_rejected(change, expected):
    module = CountsModule()
    module.manifest = dataclasses.replace(MANIFEST, **change)
    with pytest.raises(ModuleContractError, match=expected):
        check_module(module)


def test_a_module_that_declines_its_own_context_is_rejected():
    with pytest.raises(ModuleContractError, match="canRender returned non-True"):
        check_module_renders(CountsModule(), {"kind": "other"})


@pytest.mark.parametrize("injected", ["<script>x()</script>", '<a href="https://example.com">x</a>', '<p style="x">'])
def test_a_module_that_renders_script_links_or_inline_style_is_rejected(injected):
    class Leaky(CountsModule):
        def render(self, model, services):
            return services.section("Counts", services.metric_grid(model)) + injected

    with pytest.raises(ModuleContractError, match="render output contains"):
        check_module_renders(Leaky(), CONTEXT)


def test_a_module_whose_render_returns_a_non_string_is_rejected():
    class NotHtml(CountsModule):
        def render(self, model, services):
            return model

    with pytest.raises(ModuleContractError, match="render returned list, not str"):
        check_module_renders(NotHtml(), CONTEXT)
