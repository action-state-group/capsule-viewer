# SPDX-License-Identifier: Apache-2.0
"""The Rules module over a rules-comparison record: rendered from the
structured comparison alone, worded only by its wording pack, never changing an
identifier when the pack changes, and showing legacy ``report/v1`` rows only
under L2."""
from __future__ import annotations

import copy
import json
import re
from html.parser import HTMLParser
from types import MappingProxyType

import pytest

from capsule_viewer.context import build_context
from capsule_viewer.kit import KIT, check_module_renders
from capsule_viewer.rules import example_wording_pack, rules_page
from capsule_viewer.rules.fixture import (
    FAILED,
    LEGACY,
    PACK_DIGEST,
    RECORD_KIND,
    ROOT,
    RULE_WITHOUT_WORDS,
    STATUS,
    VERIFIED,
    bundle,
    fixture_context,
)
from capsule_viewer.rules.module import PLACEHOLDERS, RulesModule
from capsule_viewer.rules.page import FAILED as FAILED_SENTENCE
from capsule_viewer.rules.page import NO_PRESENTATION, REFUSAL
from capsule_viewer.wording import WordingPackError, load_wording_pack, sha256_hex

PACK = example_wording_pack()
SHA = sha256_hex(PACK)


def _page(ctx=None, pack: bytes = PACK, sha: str | None = None, depth: str = "L0") -> str:
    return rules_page(fixture_context() if ctx is None else ctx, pack, SHA if sha is None else sha, RECORD_KIND, depth=depth)


def _repack(transform) -> bytes:
    raw = json.loads(PACK)
    raw["entries"] = {key: transform(text) for key, text in raw["entries"].items()}
    return json.dumps(raw, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


class _Regions(HTMLParser):
    """Text and data-* attributes, per depth region, plus the open state of
    every <details> in each region."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[str | None] = []
        self.text: dict[str | None, list[str]] = {}
        self.attrs: dict[str | None, list[tuple[str, str]]] = {}
        self.details: dict[str | None, list[bool]] = {}

    @property
    def level(self) -> str | None:
        return next((lvl for lvl in reversed(self.stack) if lvl), None)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.stack.append(a.get("data-level"))
        for name, value in attrs:
            if name.startswith("data-") and name not in ("data-label", "data-cv", "data-level"):
                self.attrs.setdefault(self.level, []).append((name, value or ""))
        if tag == "details":
            self.details.setdefault(self.level, []).append("open" in a)

    def handle_endtag(self, tag):
        if self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if data.strip():
            self.text.setdefault(self.level, []).append(data.strip())


def _regions(html: str) -> _Regions:
    parser = _Regions()
    parser.feed(html)
    parser.close()
    return parser


def _module_region(html: str) -> str:
    start = html.index('<div class="cv-rules"')
    return html[start : html.index("</main>")]


# ---- (1) renders from rules_compare/v0 alone ---------------------------------


def test_renders_from_the_comparison_alone_with_no_report_rows():
    raw = bundle()
    raw["records"] = [r for r in raw["records"] if r["capsule_id"] != LEGACY]
    del raw["disclosures"][LEGACY]
    html = _page(build_context(raw, VERIFIED, STATUS))
    regions = _regions(html)
    rule_ids = [v for n, v in regions.attrs["L1"] if n == "data-rule"]
    assert rule_ids == [row["rule_id"] for row in raw["disclosures"][ROOT]["agent_output"]["rows"]]
    assert "data-legacy-row" not in html
    assert "8 rules" in " ".join(regions.text["L0"])


def test_l0_is_one_summary_line_whose_counts_are_a_recount_of_the_rows():
    regions = _regions(_page())
    pairs = [v for n, v in regions.attrs["L0"] if n in ("data-disposition", "data-count")]
    assert pairs == ["DO", "2", "ASK", "4", "NEVER", "2"]
    assert " ".join(regions.text["L0"]).count("rules") == 2  # heading + the one line
    html = _page()
    assert html.count('data-l0-summary="true"') == 1


# ---- (2) swapping the pack changes words, never identifiers -------------------


def _identifiers(html: str) -> list[tuple[str, str]]:
    regions = _regions(html)
    found = [pair for level in regions.attrs.values() for pair in level if pair[0] != "data-wording-sha256"]
    # The wording_sha256 is presentation provenance, not an identifier of the
    # evidence: it is meant to change with the pack.
    page_sha = re.findall(r'data-wording-sha256="([0-9a-f]*)"', html)
    mono = [m for m in re.findall(r'class="[^"]*cv-mono[^"]*"[^>]*>([^<]+)<', html) if m not in page_sha]
    return sorted(found) + sorted(("mono", m) for m in mono)


EVIDENCE_ATTRS = {
    "data-rule", "data-rule-id", "data-legacy-row", "data-outcome", "data-state",
    "data-disposition", "data-count", "data-position", "data-activation",
}


def _evidence(html: str) -> tuple[list[tuple[str, str]], list[str]]:
    regions = _regions(html)
    attrs = sorted(p for level in regions.attrs.values() for p in level if p[0] in EVIDENCE_ATTRS)
    return attrs, sorted(set(re.findall(r"[0-9a-f]{64}", _module_region(html))) - {SHA})


def test_swapping_the_wording_pack_changes_the_text_and_no_identifier():
    other = _repack(lambda text: "ALT " + text)
    a, b = _page(), _page(pack=other, sha=sha256_hex(other))
    assert _regions(a).text != _regions(b).text
    assert all(t.startswith("ALT ") for t in _regions(b).text["L0"] if t != "·")
    assert _identifiers(a) == _identifiers(b)
    for digest in (ROOT, LEGACY, PACK_DIGEST):
        assert digest in a and digest in b
    assert re.findall(r'data-outcome="([a-z_]+)"', a) == re.findall(r'data-outcome="([a-z_]+)"', b)


# ---- (3) wording_sha256 on the page is the hash of the pack used --------------


def test_wording_sha256_on_the_page_is_the_sha256_of_the_pack_bytes():
    html = _page()
    assert re.findall(r'data-wording-sha256="([0-9a-f]*)"', html) == [SHA]
    assert SHA in " ".join(_regions(html).text["L2"])
    other = _repack(str.upper)
    assert re.findall(r'data-wording-sha256="([0-9a-f]*)"', _page(pack=other, sha=sha256_hex(other))) == [sha256_hex(other)]


def test_a_pack_whose_bytes_do_not_hash_to_the_given_sha_is_refused_and_labels_fall_back_to_keys():
    tampered = PACK.replace(b"Asks you first", b"Asks you, maybe")
    html = _page(pack=tampered, sha=SHA)
    assert 'data-notice="wording-refused"' in html
    assert "Asks you, maybe" not in html and "Asks you first" not in html
    assert 'data-wording-sha256=""' in html
    assert 'data-wording-missing="l0.heading"' not in html  # a heading is plain text: its key
    assert "l1.column.rule" in html
    # The evidence identifiers survive a refused pack too.
    assert _evidence(html) == _evidence(_page())


def test_a_pack_using_a_placeholder_the_module_does_not_fill_is_refused():
    stray = _repack(lambda text: text + " {amount}")
    with pytest.raises(WordingPackError, match="amount"):
        load_wording_pack(stray, sha256_hex(stray), PLACEHOLDERS)


# ---- (4) both rules_compare and report/v1: legacy rows only under L2 -----------


def test_a_bundle_with_both_renders_from_the_comparison_and_shows_legacy_rows_only_under_l2():
    regions = _regions(_page())
    legacy_text = {"asks first", "example reason text", "Example rules report"}
    for level in ("L0", "L1"):
        assert not legacy_text & set(regions.text[level])
        assert not any(n == "data-legacy-row" for n, _ in regions.attrs[level])
    assert {"asks first", "example reason text"} <= set(regions.text["L2"])
    assert [v for n, v in regions.attrs["L2"] if n == "data-legacy-row"] == [
        "r05-example-spending-limit",
        "r20-example-delete-data",
    ]
    # Rendered from the comparison: every rule is a row, not only the two legacy ones.
    assert len([1 for n, _ in regions.attrs["L1"] if n == "data-rule"]) == 8


def test_a_report_v1_root_is_not_this_module_s_bundle():
    raw = bundle()
    raw["root"] = LEGACY
    html = _page(build_context(raw, VERIFIED, STATUS))
    assert 'data-notice="no-presentation"' in html and NO_PRESENTATION in html
    assert "data-rule=" not in html


def test_a_withheld_comparison_is_not_rendered():
    status = {**STATUS, ROOT: {"agent_input": "disclosure_match", "agent_output": "withheld"}}
    ctx = build_context(bundle(), VERIFIED, status)
    assert RulesModule(load_wording_pack(PACK, SHA, PLACEHOLDERS), RECORD_KIND).canRender(ctx) is False
    assert 'data-notice="no-presentation"' in _page(ctx)


# ---- Invariants ---------------------------------------------------------------


def test_a_bundle_that_did_not_verify_gets_the_refusal_and_no_level():
    html = _page(fixture_context(verification=FAILED))
    assert REFUSAL in html
    assert "data-level=" not in html
    assert "r05-example-spending-limit" not in html
    assert "recomputed digest differs" in html  # the verifier's checks are shown


def test_an_enum_value_the_pack_does_not_know_is_shown_raw_and_never_dropped():
    raw = bundle()
    rows = raw["disclosures"][ROOT]["agent_output"]["rows"]
    rows[0]["action_state"]["disposition"] = "ASK_UNVERIFIED"
    rows[1]["platform_baseline"]["status"] = "some_new_status"
    regions = _regions(_page(build_context(raw, VERIFIED, STATUS)))
    unrecognized = [v for n, v in regions.attrs["L1"] if n == "data-unrecognized"]
    assert "ASK_UNVERIFIED" in unrecognized and "some_new_status" in unrecognized
    assert ("data-disposition", "ASK_UNVERIFIED") in regions.attrs["L0"]
    assert len([1 for n, _ in regions.attrs["L1"] if n == "data-rule"]) == 8


def test_a_rule_the_pack_has_no_words_for_shows_its_id():
    regions = _regions(_page())
    assert RULE_WITHOUT_WORDS in regions.text["L1"]
    assert "Purchases over the example limit" in regions.text["L1"]


def test_bundle_presentation_settings_never_change_the_module_region():
    plain = bundle()
    del plain["extensions"]
    altered = bundle()
    altered["extensions"]["presentation/v1"] = {"title": "ALTERED", "producer_display_name": "<b>x</b>", "depth": "L2"}
    pages = {_page(build_context(raw, VERIFIED, STATUS), depth="L1") for raw in (bundle(), plain, altered)}
    assert len(pages) == 1  # the whole page: title, banner, every level


@pytest.mark.parametrize(
    ("depth", "open_l1", "open_l2"),
    [("L0", False, False), ("L1", True, False), ("L2", True, True)],
)
def test_depth_opens_levels_and_every_level_is_always_present(depth, open_l1, open_l2):
    html = _page(depth=depth)
    regions = _regions(html)
    assert set(regions.text) >= {"L0", "L1", "L2"}
    assert set(regions.details["L1"]) == {open_l1}
    assert regions.details["L2"][0] is open_l2  # the collapsed proof section
    assert f'data-depth="{depth}"' in html


def test_the_page_language_is_the_pack_locale():
    raw = json.loads(PACK)
    raw["locale"] = "de"
    de = json.dumps(raw, sort_keys=True, separators=(",", ":")).encode()
    assert '<html lang="de">' in _page(pack=de, sha=sha256_hex(de))


def test_l2_names_the_record_its_checkpoint_position_and_activation_as_not_recorded():
    l2 = " ".join(_regions(_page()).text["L2"])
    assert ROOT in l2 and PACK_DIGEST in l2
    assert "In checkpointed log example-log, sequence 2, leaf 1" in l2
    assert "Activation: not recorded in this comparison" in l2


def test_the_module_passes_the_kit_contract_check():
    module = RulesModule(load_wording_pack(PACK, SHA, PLACEHOLDERS), RECORD_KIND, "L2")
    check_module_renders(module, fixture_context())


def test_render_is_a_function_of_the_model():
    module = RulesModule(load_wording_pack(PACK, SHA, PLACEHOLDERS), RECORD_KIND)
    model = module.buildModel(fixture_context())
    assert module.render(model, KIT) == module.render(copy.deepcopy(model), KIT)


def test_the_module_failing_collapses_to_the_refusal():
    # canRender accepts it; buildModel then meets a record the disclosure map
    # does not carry, and raises.
    ctx = fixture_context()
    broken = ctx.__class__(
        verification=ctx.verification,
        bundle_kind=ctx.bundle_kind,
        root=ctx.root,
        records=(*ctx.records, "not-in-disclosures"),
        disclosures=ctx.disclosures,
        memberships=ctx.memberships,
        bundle=ctx.bundle,
    )
    html = _page(broken)
    assert FAILED_SENTENCE in html and "data-level=" not in html


# ---- Context immutability (contract section 3.1) ------------------------------


def test_the_context_cannot_be_changed_and_does_not_share_the_callers_bundle():
    raw = bundle()
    ctx = build_context(raw, VERIFIED, STATUS)
    with pytest.raises(TypeError):
        ctx.disclosures[ROOT] = MappingProxyType({})
    with pytest.raises(TypeError):
        ctx.disclosed(ROOT, "agent_output")["rows"][0]["rule_id"] = "changed"
    raw["disclosures"][ROOT]["agent_output"]["rows"][0]["rule_id"] = "changed"
    assert ctx.disclosed(ROOT, "agent_output")["rows"][0]["rule_id"] == "r01-example-research"


def test_an_unknown_verifier_disclosure_status_is_refused():
    with pytest.raises(ValueError, match="unknown verifier disclosure status"):
        build_context(bundle(), VERIFIED, {ROOT: {"agent_input": "match"}})


# ---- The example pack -----------------------------------------------------------


def test_the_example_pack_is_distributed_in_jcs_form():
    raw = json.loads(PACK)
    assert PACK == json.dumps(raw, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    load_wording_pack(PACK, SHA, PLACEHOLDERS)


def test_the_example_pack_wording_never_describes_a_rule_as_protection_blocking_or_enforcement():
    # The pack's words only. Raw enum tokens shown as identifiers in L2 (such
    # as a platform status token) are data, not wording, and are not scanned.
    words = " ".join(json.loads(PACK)["entries"].values()).lower()
    assert not re.search(r"protect|block|stop|enforc", words)


# ---- Agreement with agent-action-capsule's gate and descriptor ------------------


def test_a_disclosure_mismatch_fails_the_gate_whatever_the_verifier_outcome():
    status = {**STATUS, LEGACY: {"agent_input": "disclosure_mismatch", "agent_output": "withheld"}}
    ctx = build_context(bundle(), VERIFIED, status)
    assert ctx.verified is False
    html = _page(ctx)
    assert REFUSAL in html and "data-level=" not in html


@pytest.mark.parametrize(
    ("member", "extra"),
    [
        ("agent_input", {"record_type": "evidence_result"}),
        ("agent_input", {"result_version": "evidence-result-v0"}),
        ("agent_output", {"result_version": "evidence-result-v0"}),
    ],
)
def test_a_root_that_carries_an_evidence_result_is_left_to_the_result_presentations(member, extra):
    raw = bundle()
    raw["disclosures"][ROOT][member].update(extra)
    ctx = build_context(raw, VERIFIED, STATUS)
    assert "result_version:evidence-result-v0" in ctx.profiles()
    assert 'data-notice="no-presentation"' in _page(ctx)


def test_the_profiles_of_the_fixture_root():
    assert fixture_context().profiles() == frozenset({f"spec_version:{RECORD_KIND}"})


def test_an_enum_value_in_another_spelling_is_unrecognized():
    raw = bundle()
    raw["disclosures"][ROOT]["agent_output"]["rows"][0]["action_state"]["disposition"] = "do"
    regions = _regions(_page(build_context(raw, VERIFIED, STATUS)))
    assert ("data-unrecognized", "do") in regions.attrs["L1"]
    assert ("data-unrecognized", "do") in regions.attrs["L0"]
    assert ("data-token", "do") not in regions.attrs["L1"]


@pytest.mark.parametrize(("key", "text"), [("l0.heading", "{platform} rules"), ("page.title", "{n} rules")])
def test_a_placeholder_the_module_does_not_fill_at_that_key_is_refused(key, text):
    raw = json.loads(PACK)
    raw["entries"][key] = text
    data = json.dumps(raw, sort_keys=True, separators=(",", ":")).encode()
    with pytest.raises(WordingPackError, match=key.replace(".", "[.]")):
        load_wording_pack(data, sha256_hex(data), PLACEHOLDERS)


def test_l2_lists_every_record_with_its_checkpoint_position():
    l2 = _regions(_page()).text["L2"]
    assert "In checkpointed log example-log, sequence 1, leaf 0" in l2
    assert LEGACY in l2 and ROOT in l2


def test_a_str_subclass_in_the_bundle_is_frozen_as_plain_text():
    from capsule_viewer.context import freeze
    from capsule_viewer.kit import Markup

    assert type(freeze(Markup("<b>x</b>"))) is str


# ---- The record kind is the deployer's, supplied at render time ----------------


def test_the_record_kind_is_a_render_time_parameter():
    assert 'data-module="capsuleviewer.rules/v0"' in _page()
    other = rules_page(fixture_context(), PACK, SHA, "org.example.another-kind/v0")
    assert 'data-notice="no-presentation"' in other and "data-rule=" not in other


@pytest.mark.parametrize("kind", ["", "has space/v0", "-leading-dash/v0"])
def test_a_record_kind_that_is_not_a_profile_token_value_is_refused(kind):
    with pytest.raises(ValueError, match="profile token value"):
        rules_page(fixture_context(), PACK, SHA, kind)
    with pytest.raises(ValueError, match="profile token value"):
        RulesModule(load_wording_pack(PACK, SHA, PLACEHOLDERS), kind)


def test_the_module_alone_declines_a_root_of_another_record_kind():
    pack = load_wording_pack(PACK, SHA, PLACEHOLDERS)
    assert RulesModule(pack, RECORD_KIND).canRender(fixture_context()) is True
    assert RulesModule(pack, "org.example.another-kind/v0").canRender(fixture_context()) is False
