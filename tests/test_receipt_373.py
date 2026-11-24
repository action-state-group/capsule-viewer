# SPDX-License-Identifier: Apache-2.0
"""Steven's hand run of the receipt page (capsule-viewer#373): the page says what the
verifier tested, states test money once, words raw codes, shortens record ids, groups
amounts, says times in words, and lists problems once."""
from __future__ import annotations

import re

from receipt_helpers import render, visible_text

from capsule_viewer.receipt.model import group_thousands
from capsule_viewer.receipt.sides import plain_time

SIMULATED = "main-standalone-simulated-keep"


def test_the_top_line_says_what_the_verifier_tested_and_that_the_page_checked_none_of_it():
    page = render("main-standalone-keep", "L0")
    text = visible_text(page)
    # No outcome badge of the shell's: the page's own line is the first one, with its explanation.
    first = page.index("<body")
    first = page.index("cv-verification__outcome", first)
    assert "reported this result, not this page." in page[first : first + 400]
    assert "reported by capsulectl verify --bundle" not in visible_text(page.split('data-level="L2"')[0])  # the shell's bare badge is gone
    assert "capsulectl verify --bundle reported this result, not this page." in text
    for test in ("graph closure", "interval coverage", "per record membership", "checkpoint", "producer signatures"):
        assert f"{test} (verified)" in text
    assert "witnesses (" not in text  # the one time-stamp sentence is the witness line
    assert "This page did not re-check any of it." in text


def test_an_incomplete_result_is_never_worded_as_verified():
    page = render("one-sided-refusal-keep", "L0")
    text = visible_text(page)
    assert re.search(r'data-outcome="incomplete">Incomplete</span> capsulectl verify --bundle reported this result', page)
    assert "(incomplete)" in text or "(not checked)" in text


def test_test_money_is_said_once_and_the_rail_row_is_not_repeated_per_step():
    page = render(SIMULATED, "L2")
    assert page.count('data-test-money="true"') == 1
    assert "no real money moved" in visible_text(page)
    assert 'data-fact="rail"' not in page and "simulated" not in visible_text(page).replace("a simulated rail", "")
    # A card payment says nothing of test money and keeps its rail row, in words with the code beside it.
    card = render("main-standalone-keep", "L2")
    assert "data-test-money" not in card
    assert re.search(r'data-fact="rail">Card <span class="cv-mono cv-muted" data-code="true">card</span>', card)


def test_raw_codes_read_as_words_with_the_code_kept_small():
    page = render("main-standalone-keep", "L2")
    for fact, word, code in (
        ("action", "Pay", "pay"),
        ("action_class", "Spend money on a purchase", "money.purchase"),
        ("choice", "Go ahead", "proceed"),
        ("direction", "Money going out", "out"),
    ):
        assert f'data-fact="{fact}">{word} <span class="cv-mono cv-muted" data-code="true">{code}</span>' in page


def test_a_token_the_pack_has_no_word_for_is_shown_as_sealed():
    assert 'data-fact="notes" class="cv-mono">first_time_counterparty' in render("main-standalone-keep", "L2") or "first_time_counterparty" in render("main-standalone-keep", "L2")


def test_records_table_shortens_each_id_and_the_step_keeps_the_whole_one():
    page = render("main-standalone-keep", "L2")
    ids = re.findall(r'<span class="cv-mono" data-capsule-id="([0-9a-f]{64})">([^<]*)</span>', page)
    assert ids and all(shown == f"{cid[:8]}…{cid[-4:]}" for cid, shown in ids)
    for cid, _ in ids:
        # The id is shown whole where the step itself is, one tap away in its drawer.
        assert f"<span class=\"cv-mono\">{cid}</span>" in page


def test_amounts_group_thousands():
    assert [group_thousands(n) for n in (0, 999, 1000, 2000, 1234567)] == ["0", "999", "1,000", "2,000", "1,234,567"]


def test_an_instant_is_said_in_utc_words_and_anything_else_is_left_alone():
    assert plain_time("2026-10-27T22:09:19Z") == "Oct 27, 2026, 22:09 UTC"
    assert plain_time("2026-10-27") == "2026-10-27"
    assert plain_time("2026-13-27T22:09:19Z") == "2026-13-27T22:09:19Z"
    page = render("main-standalone-keep", "L2")
    assert '<span data-time="2026-10-27T22:09:19Z">Oct 27, 2026, 22:09 UTC</span>' in page
    assert not re.search(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ[^\"]", visible_text(page))


def test_problems_are_one_section_with_one_none():
    text = visible_text(render("main-standalone-keep", "L2"))
    assert text.count("Problems spotted") == 1 and "Anomalies" not in text
    assert "Agent side" not in text and "Counterparty side" not in text
    assert text.count("None found.") == 1
