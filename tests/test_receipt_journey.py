# SPDX-License-Identifier: Apache-2.0
"""The receipt's "How it went": the errand's journey (capsule-cli#340), read
from the sealed report and worded from the receipt's own pack, whose
``journey.*`` keys mirror capsulectl's (nothing imports capsule-cli)."""
from __future__ import annotations

import copy
import json
import re
from html import unescape

import pytest
from receipt_helpers import PACK, PACK_SHA, RECEIPTS, load, report_for

from capsule_viewer.binding import check_opening
from capsule_viewer.receipt import PLACEHOLDERS, UnilateralReceiptModule, build_receipt, receipt_page
from capsule_viewer.receipt.model import Move
from capsule_viewer.verifier_report import context_from_capsulectl
from capsule_viewer.wording import load_wording_pack

WORDS = load_wording_pack(PACK, PACK_SHA, PLACEHOLDERS)
MIRROR = json.loads((RECEIPTS / "capsulectl-journey-words.json").read_text(encoding="utf-8"))["entries"]
DEAL_VIEW = json.loads((RECEIPTS / "main-standalone-keep.deal-view-journey.json").read_text(encoding="utf-8"))["rows"]


def _model(name="main-standalone-keep", audience="keep", edit=None):
    bundle, output = copy.deepcopy(load(name))
    if edit:
        edit(bundle)
        output = report_for(bundle, output)
    context, assurance = context_from_capsulectl(bundle, output)
    return build_receipt(context, check_opening, assurance, audience), context, assurance


def _rows(html: str) -> list[tuple[str, str]]:
    """Who moved and the label of each row of "How it went", time left out."""
    section = html.split("How it went", 1)[1]
    section = section.split('<section class="cv-section" data-cv="section"><h2', 1)[0]
    texts = [unescape(t) for t in re.findall(r'<p data-sealed-text="item">(.*?)</p>', section)]
    rows = []
    for text in texts:
        parts = re.sub(r"^\d{4}-\d\d-\d\dT[\d:]+Z · ", "", text).split(" · ", 1)
        rows.append((parts[0], parts[1] if len(parts) > 1 else ""))
    return rows


def test_the_pack_holds_capsulectls_journey_words_exactly():
    mine = {k: v for k, v in WORDS.entries.items() if k.startswith("journey.")}
    assert mine == {k: v for k, v in MIRROR.items() if k.startswith("journey.")}
    # The contact classes a row puts into words (capsulectl's, not a token with its underscores undone).
    for key, text in MIRROR.items():
        if key.startswith("class."):
            assert WORDS.entries[key] == text, key
    # Every placeholder a journey word uses is one this module fills.
    for key, text in mine.items():
        assert set(re.findall(r"\{([a-z_]+)\}", text)) == set(PLACEHOLDERS.get(key, ())), key


def test_the_receipt_lists_the_journey_as_capsulectls_deal_page_words_it():
    model, context, assurance = _model()
    assert [m.key for m in model.report.journey][:2] == ["journey.user.asked", "journey.agent.searched"]
    page = receipt_page(context, assurance, PACK, PACK_SHA, audience="keep", depth="L2")
    assert _rows(page) == [(r["mover"], r["label"]) for r in DEAL_VIEW]


def test_a_switch_of_merchant_reads_as_the_users_move():
    model, *_ = _model()
    switched = next(m for m in model.report.journey if m.key == "journey.user.switched")
    assert switched.by == "user" and dict(switched.facts)["who"] == "Example Shop Three"


@pytest.mark.parametrize("name", ["main-standalone-counterparty", "main-buyer-keep"])
def test_a_copy_with_no_journey_shows_no_section(name):
    audience = "counterparty" if name.endswith("counterparty") else "keep"
    model, context, assurance = _model(name, audience)
    assert model.report.journey == ()
    assert "How it went" not in receipt_page(context, assurance, PACK, PACK_SHA, audience=audience, depth="L2")


def _label(move: Move) -> str:
    return UnilateralReceiptModule(WORDS, "L2", "keep", None)._journey_label(move)


def test_a_label_is_worded_only_from_what_is_sealed_and_the_pack():
    facts = lambda **kw: tuple(kw.items())  # noqa: E731
    assert _label(Move("agent", "journey.agent.act.pay.within", None, facts(amount="$35", limit="$40"), ())) == "Paid $35 within your $40 limit"
    assert _label(Move("agent", "journey.agent.couldnt", None, facts(reason="out_of_stock"), ())) == "Couldn't (out of stock)"
    assert _label(Move("agent", "journey.agent.couldnt", None, facts(reason="other", detail="the site was down"), ())) == "Couldn't (the site was down)"
    assert _label(Move("agent", "journey.agent.told", None, facts(who="Example Shop"), ("email", "phone", "name"))) == "Told Example Shop your email, phone and name"
    assert _label(Move("user", "journey.user.approved.share_contact", None, (), ("shipping_address",))) == "OK'd sharing your shipping address"
    # No word for the key, or no value for a placeholder: nothing is worded, and no value is invented.
    assert _label(Move("agent", "journey.agent.unknown", None, (), ())) == ""
    assert _label(Move("agent", "journey.agent.couldnt", None, (), ())) == ""
    assert _label(Move("agent", "journey.agent.couldnt", None, facts(reason="other"), ())) == ""
    # As capsulectl's page words them: a reason with no word and an empty list of classes are said as nothing.
    assert _label(Move("agent", "journey.agent.couldnt", None, facts(reason="new_reason"), None)) == "Couldn't ()"
    assert _label(Move("user", "journey.user.approved.share_contact", None, (), ())) == "OK'd sharing your "
    assert _label(Move("user", "journey.user.approved.share_contact", None, (), None)) == ""
    assert _label(Move("agent", "journey.agent.told", None, facts(who="Example Shop"), ("credential", "id_document", "other_contact"))) == "Told Example Shop your login, ID document and contact details"


def test_a_move_with_no_key_is_still_a_row_that_says_who_moved():
    def edit(bundle):
        report = bundle["extensions"]["x-deal-report/v0"]["agent_input"]["report"]
        report["journey"] = [{"by": "agent", "step": report["journey"][0]["step"], "facts": {}}, "not a move"]

    model, context, assurance = _model(edit=edit)
    assert [(m.by, m.key) for m in model.report.journey] == [("agent", "")]
    page = receipt_page(context, assurance, PACK, PACK_SHA, audience="keep", depth="L2")
    assert _rows(page) == [("Your agent", "")]
