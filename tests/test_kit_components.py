# SPDX-License-Identifier: Apache-2.0
"""The kit's components: closed vocabularies with visible refusals, caller
text always escaped, and nothing rendered that the caller did not give."""
from __future__ import annotations

import base64
import hashlib
import re
from html import unescape

import pytest

from capsule_viewer.kit import (
    CalendarMark,
    Check,
    Citation,
    EvidenceItem,
    Markup,
    Metric,
    Party,
    TimelineEvent,
    VerificationResult,
    calendar_grid,
    citation_list,
    data_table,
    disclosure_badge,
    drilldown,
    evidence_details,
    metric_grid,
    page,
    party_card,
    section,
    timeline,
    verdict_pill,
    verification_details,
)
from capsule_viewer.kit.contract import check_fragment
from capsule_viewer.kit.fixture import fixture_page

HOSTILE = "<script>window.pwned=1</script>\"'><img src=x onerror=1>"


@pytest.mark.parametrize(
    ("state", "label"),
    [
        ("disclosed", "DISCLOSED"),
        ("committed", "COMMITTED (opening not supplied)"),
        ("withheld", "WITHHELD"),
        ("not_present", "NOT PRESENT"),
    ],
)
def test_disclosure_badge_states_and_wording_are_exact(state, label):
    html = disclosure_badge(state)
    assert f'data-state="{state}"' in html
    assert f">{label}</span>" in html
    assert "data-refused" not in html


@pytest.mark.parametrize("state", ["DISCLOSED", "partially_shown", "", "committed "])
def test_disclosure_badge_refuses_any_other_state_visibly(state):
    html = disclosure_badge(state)
    assert 'data-refused="DisclosureBadge"' in html
    assert "data-state" not in html


@pytest.mark.parametrize(
    ("verdict", "canonical", "label"),
    [("met", "met", "met"), ("not_met", "not_met", "not met"), ("not_evaluable", "not_evaluable", "not evaluable")],
)
def test_verdict_pill_shows_the_verdict_given(verdict, canonical, label):
    html = verdict_pill(verdict)
    assert f'data-verdict="{canonical}"' in html and f">{label}</span>" in html
    assert "title=" not in html


def test_verdict_pill_reads_the_retired_spelling_as_not_evaluable_and_says_so():
    html = verdict_pill("insufficient_evidence")
    assert 'data-verdict="not_evaluable"' in html
    assert "stated as &#x27;insufficient_evidence&#x27;" in html


def test_verdict_pill_refuses_not_applicable():
    html = verdict_pill("not_applicable")
    assert 'data-refused="VerdictPill"' in html
    assert "population exclusion, not a verdict" in html
    assert "data-verdict" not in html


@pytest.mark.parametrize("verdict", ["MET", "pass", "", "unknown"])
def test_verdict_pill_refuses_unknown_verdicts(verdict):
    html = verdict_pill(verdict)
    assert 'data-refused="VerdictPill"' in html and "data-verdict" not in html


def test_verification_details_shows_the_given_outcome_and_never_upgrades_it():
    html = verification_details(
        VerificationResult("a verifier", "failed", (Check("signature", "not_checked"), Check("digest", "verified")))
    )
    assert html.count('data-outcome="failed"') == 1
    assert "Did not verify" in html
    assert html.count('data-outcome="not_checked"') == 1
    assert html.count('data-outcome="verified"') == 1  # the one check, not the result
    assert "a verifier" in html


def test_verification_details_refuses_an_unknown_outcome():
    html = verification_details(VerificationResult("v", "probably_fine"))
    assert 'data-refused="VerificationDetails"' in html and "data-outcome" not in html


def test_data_table_refuses_a_row_of_the_wrong_length():
    with pytest.raises(ValueError, match="row 1 has 1 cells for 2 columns"):
        data_table(["a", "b"], [["1", "2"], ["3"]])


def test_data_table_labels_every_cell_with_its_column_for_the_phone_layout():
    html = data_table(["Requirement", "Verdict"], [["r1", verdict_pill("met")]])
    assert '<td data-label="Requirement">r1</td>' in html
    assert '<td data-label="Verdict"><span class="cv-pill' in html


def test_calendar_grid_places_marks_and_refuses_days_outside_the_month():
    html = calendar_grid(2026, 2, {3: [CalendarMark("run", "positive")]})
    assert "February 2026" in html and "cv-tone--positive" in html
    assert html.count('class="cv-calendar__day"') == 28
    with pytest.raises(ValueError, match=r"\[29\]"):
        calendar_grid(2026, 2, {29: [CalendarMark("x")]})


def test_calendar_mark_refuses_an_unknown_tone():
    assert 'data-refused="CalendarMark"' in calendar_grid(2026, 1, {1: [CalendarMark("x", "purple")]})


def test_timeline_keeps_the_callers_order():
    html = timeline([TimelineEvent("2026-09-02", "second"), TimelineEvent("2026-09-01", "first")])
    assert html.index("second") < html.index("first")


def test_drilldown_is_native_details_and_closed_unless_asked():
    closed = drilldown("why", "body")
    assert closed.startswith('<details class="cv-drilldown" data-cv="drilldown">')
    assert "<summary>why</summary>" in closed
    assert drilldown("why", "body", expanded=True).startswith('<details class="cv-drilldown" data-cv="drilldown" open>')


def _every_component(text: str) -> list[str]:
    return [
        section(text, text),
        metric_grid([Metric(text, text, text)]),
        data_table([text], [[text]], caption=text),
        calendar_grid(2026, 1, {1: [CalendarMark(text, "info")]}),
        citation_list([Citation(text, text, text)]),
        drilldown(text, text),
        evidence_details([EvidenceItem(text, "withheld", text, text, text)]),
        verification_details(VerificationResult(text, "verified", (Check(text, "verified", text),))),
        party_card(Party(text, text, ((text, text),))),
        timeline([TimelineEvent(text, text, text)]),
        disclosure_badge(text),
        verdict_pill(text),
    ]


def test_caller_text_is_escaped_in_every_component():
    for html in _every_component(HOSTILE):
        assert "<script>" not in html and "<img" not in html and HOSTILE not in html
        assert "&lt;script&gt;" in html


def test_nested_component_output_is_not_double_escaped():
    html = section("t", verdict_pill("met"))
    assert '<span class="cv-pill' in html and "&lt;span" not in html
    assert isinstance(html, Markup)


def test_every_component_stays_inside_the_element_and_attribute_allowlist():
    for html in [*_every_component("plain"), *_every_component(HOSTILE)]:
        assert check_fragment(html) == [], html


def test_the_fixture_page_has_no_link_image_script_or_inline_style():
    lowered = fixture_page().lower()
    for forbidden in ("href=", "src=", "<script", "<img", "<a ", "style=\"", "<link", "<svg", "<iframe"):
        assert forbidden not in lowered, forbidden


def test_concatenated_component_output_stays_markup_and_nests_unescaped():
    pair = verdict_pill("met") + disclosure_badge("withheld")
    assert isinstance(pair, Markup)
    html = drilldown("x", pair)
    assert "&lt;span" not in html and html.count('<span class="cv-') == 2
    joined = Markup(" ").join([verdict_pill("met"), disclosure_badge("withheld")])
    assert isinstance(joined, Markup) and "&lt;span" not in section("t", joined)


def test_plain_text_concatenated_onto_markup_is_escaped():
    assert "<script>" not in verdict_pill("met") + HOSTILE
    assert "<script>" not in HOSTILE + verdict_pill("met")
    assert "<script>" not in Markup(" ").join([verdict_pill("met"), HOSTILE])


def test_page_inlines_the_kit_stylesheet_under_a_hash_pinned_csp():
    html = page("t", "x")
    css = re.search(r"<style>(.*?)</style>", html, flags=re.S).group(1)
    csp = unescape(re.search(r'http-equiv="Content-Security-Policy" content="([^"]*)"', html).group(1))
    digest = base64.b64encode(hashlib.sha256(css.encode("utf-8")).digest()).decode("ascii")
    assert f"style-src 'sha256-{digest}'" in csp
    assert "default-src 'none'" in csp and "connect-src 'none'" in csp
    assert "--cv-color-text" in css


def test_page_csp_hash_follows_the_stylesheet_it_inlines(monkeypatch):
    import capsule_viewer.kit.components as components

    before = page("t", "x")
    monkeypatch.setattr(components, "kit_css", lambda: "body { color: red; }")
    after = page("t", "x")
    expected = base64.b64encode(hashlib.sha256(b"\nbody { color: red; }").digest()).decode("ascii")
    assert f"sha256-{expected}" in unescape(after)
    assert f"sha256-{expected}" not in unescape(before)


def test_page_csp_allows_no_image_script_or_connection():
    csp = unescape(re.search(r'Content-Security-Policy" content="([^"]*)"', page("t", "x")).group(1))
    assert "img-src 'none'" in csp and "connect-src 'none'" in csp and "script-src" not in csp
