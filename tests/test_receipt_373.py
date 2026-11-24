# SPDX-License-Identifier: Apache-2.0
"""Steven's hand run of the receipt page (capsule-viewer#373): the page says what the
verifier tested, states test money once, words raw codes, shortens record ids, groups
amounts, says times in words, and lists problems once."""
from __future__ import annotations

import re
from types import SimpleNamespace

from receipt_helpers import PACK, PACK_SHA, render, visible_text

from capsule_viewer.receipt import PLACEHOLDERS, UnilateralReceiptModule
from capsule_viewer.receipt.model import Fact, Step, group_thousands
from capsule_viewer.receipt.module import _test_money
from capsule_viewer.receipt.sides import plain_time
from capsule_viewer.wording import load_wording_pack

SIMULATED = "main-standalone-simulated-keep"


def test_the_top_line_says_what_the_verifier_tested_and_that_the_page_checked_none_of_it():
    page = render("main-standalone-keep", "L0")
    text = visible_text(page)
    # No outcome badge of the shell's: the page's own line is the first one, with its explanation.
    first = page.index("<body")
    first = page.index("cv-verification__outcome", first)
    assert "Checked by capsulectl verify --bundle:" in page[first : first + 400]
    assert "reported by capsulectl verify --bundle" not in visible_text(page.split('data-level="L2"')[0])  # the shell's bare badge is gone
    assert "Checked by capsulectl verify --bundle:" in text
    for test in ("graph closure", "interval coverage", "per record membership", "checkpoint", "producer signatures"):
        assert test in text
    assert "(all verified)" in text
    assert "witnesses (" not in text  # the one time-stamp sentence is the witness line
    assert "it did not re-check anything itself." in text


def test_an_incomplete_result_is_never_worded_as_verified():
    page = render("one-sided-refusal-keep", "L0")
    text = visible_text(page)
    assert re.search(r'data-outcome="incomplete">Incomplete</span> Checked by capsulectl verify --bundle', page)
    assert "(incomplete)" in text or "(not checked)" in text


def test_test_money_is_said_once_and_the_rail_row_is_not_repeated_per_step():
    page = render(SIMULATED, "L2")
    assert page.count('data-test-money="true"') == 1
    assert "No real money moved." in visible_text(page)
    assert 'data-fact="rail"' not in page and "simulated" not in visible_text(page).replace("a simulated rail", "")
    # A card payment says nothing of test money and keeps its rail row, in words with the code beside it.
    card = render("main-standalone-keep", "L2")
    assert "data-test-money" not in card
    assert 'data-fact="rail" data-token="card">Card</dd>' in card  # the small code is left out when it only repeats the word


def test_raw_codes_read_as_words_with_the_code_kept_small():
    page = render("main-standalone-keep", "L2")
    for fact, word, code in (
        ("action", "Pay", None),
        ("rail", "Card", None),
        ("action_class", "Spend money on a purchase", "money.purchase"),
        ("choice", "Go ahead", "proceed"),
        ("direction", "Money going out", "out"),
    ):
        token = code or word.lower()
        shown = f'data-fact="{fact}" data-token="{token}">{word}</dd>' if code is None else f'data-fact="{fact}" data-token="{code}">{word} <span class="cv-mono cv-muted" data-code="true">{code}</span>'
        assert shown in page


def test_a_token_the_pack_has_no_word_for_is_shown_as_sealed():
    page = render("main-standalone-keep", "L2")
    assert re.search(r'<dd class="cv-mono" data-fact="notes">first_time_counterparty, new_profile</dd>', page)


def test_only_a_deal_whose_every_rail_is_simulated_is_test_money():
    def model_with(*rails):
        steps = tuple(Step("c" * 64, "disclosed", "acted", "action", None, None, (Fact("rail", r),)) for r in rails)
        return SimpleNamespace(steps=steps)

    assert _test_money(model_with("simulated", "simulated"))
    assert not _test_money(model_with("simulated", "card"))
    assert not _test_money(model_with("card"))
    assert not _test_money(model_with())


def test_a_sealed_value_holding_the_time_mark_cannot_move_the_instant():
    pack = load_wording_pack(PACK, PACK_SHA, PLACEHOLDERS)
    module = UnilateralReceiptModule(pack)
    shown = str(module._timed("lifecycle.as_of", "2026-10-27T22:09:19Z", text="a\x00b"))
    assert "\x00" not in shown and shown.index("ab") < shown.index("data-time")


def test_records_table_shortens_each_id_and_the_step_keeps_the_whole_one():
    page = render("main-standalone-keep", "L2")
    ids = re.findall(r'<span class="cv-mono" data-capsule-id="([0-9a-f]{64})">([^<]*)</span>', page)
    assert ids and all(shown == f"{cid[:8]}…{cid[-4:]}" for cid, shown in ids)
    for cid, _ in ids:
        # The id is shown whole where the step itself is, one tap away in its drawer.
        assert f"<span class=\"cv-mono\">{cid}</span>" in page


def test_amounts_group_thousands():
    assert [group_thousands(n) for n in (0, 999, 1000, 2000, 1234567, -200, -2000)] == ["0", "999", "1,000", "2,000", "1,234,567", "-200", "-2,000"]


def test_an_instant_is_said_in_utc_words_and_anything_else_is_left_alone():
    assert plain_time("2026-10-27T22:09:19Z") == "Oct 27, 2026, 22:09 UTC"
    assert plain_time("2026-10-27") == "2026-10-27"
    for odd in ("2026-13-27T22:09:19Z", "2026-02-31T99:99:00Z", "2026-10-27T22:09:19Z\n", "٢٠٢٦-10-27T22:09:19Z"):
        assert plain_time(odd) == odd
    page = render("main-standalone-keep", "L2")
    assert '<span data-time="2026-10-27T22:09:19Z">Oct 27, 2026, 22:09 UTC</span>' in page
    assert not re.search(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ[^\"]", visible_text(page))


def test_problems_are_one_section_with_one_none():
    text = visible_text(render("main-standalone-keep", "L2"))
    assert text.count("Problems spotted") == 1 and "Anomalies" not in text
    assert "Agent side" not in text and "Counterparty side" not in text
    assert text.count("None reported.") == 1


def test_a_module_that_does_not_state_the_outcome_keeps_the_shells_badge():
    # The provider page draws no receipt top line, so the shell's badge is its only one.
    page = render("mesh-provider-selected", "L0")
    assert "reported by capsulectl verify --bundle" in visible_text(page)


def test_the_pack_words_a_self_report_for_views_that_show_one():
    pack = load_wording_pack(PACK, PACK_SHA, PLACEHOLDERS)
    assert pack.fill("verify.self_reported", verifier="this node's own request log", checks="request logged (recorded)") == (
        "Reported by this node's own request log: request logged (recorded). This view shows that report; it did not re-check anything itself."
    )
