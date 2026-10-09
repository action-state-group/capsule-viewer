# SPDX-License-Identifier: Apache-2.0
"""What the deal-view.js receipt showed is preserved by the receipt module.

``testdata/receipt/golden-2.*`` is capsule-cli's presentation golden for the
unilateral receipt (``internal/cli/testdata/presentation/2-unilateral-receipt``
at capsule-cli fde7ee0): the bundle, and ``snapshot.json``, the text the
deal-view.js page showed for it, in order. Lines 0 to 49 are deal-view.js's
own, and every one of them is accounted for here: shown verbatim, reworded
(with the wording key that now says it and why) or dropped (with why). A line
the map does not account for fails, and so does a "dropped" line still shown.

Lines 50 on are the vendored agent-action-capsule viewer's verification page,
which deal-view.js did not write. This page's counterpart is its L2: the
verifier's checks and the bundle digest the report is bound to. Of that page's
two non-record identifiers the bundle digest is shown; the checkpoint root
(inside the COSE checkpoint) is not. Matching presence uses the line's exact
text anywhere on the page; order is checked for lines 8 to 24 only.
"""
from __future__ import annotations

import json
import re

import pytest
from receipt_helpers import RECEIPTS, load, render, visible_text

GOLDEN = json.loads((RECEIPTS / "golden-2.snapshot.json").read_text(encoding="utf-8"))
LINES = [" ".join(line.split()) for line in GOLDEN["text"]]
# deal-view.js wrote lines 0 to 49; from 50 on is the vendored AAC viewer's
# verification page, which deal-view.js did not write.
DEAL_VIEW = range(0, 50)
CORE_PAGE_FROM = 50

# Said differently here, because the deal-view.js words claimed the page
# checked itself. This page carries no script and checks nothing; the checks
# are the verifier's, shown in L2.
REWORDED = {
    7: "summary.lines",
    25: "summary.sealed",
    49: "claims.scope",
}
DROPPED = {
    # This page is built from the bundle and does not carry it, so there is no
    # "this file" for a reader to drop into a verifier or check offline; the
    # packaging that carries the bundle (an offline .html) states that.
    34: "self-check instruction for a page that carries the bundle",
    35: "offline-check instruction for a page that carries the bundle",
    36: "the check command names deal-view.js's own page file",
    # The comparison of the producer's version with the capsulectl that built
    # the page: this page is not built by capsulectl, and the kit emits no
    # links.
    39: "page-builder version comparison",
    40: "a link to release notes",
}


def _l1_text(html: str) -> str:
    return visible_text(html.split('data-level="L1"', 1)[1].split('data-level="L2"', 1)[0])


@pytest.fixture(scope="module")
def page() -> str:
    return render("golden-2", "L2")


def test_the_map_accounts_for_every_deal_view_line(page):
    text = visible_text(page)
    unaccounted = [(i, LINES[i]) for i in DEAL_VIEW if LINES[i] not in text and i not in REWORDED and i not in DROPPED]
    assert unaccounted == []


def test_most_deal_view_lines_are_shown_verbatim(page):
    text = visible_text(page)
    verbatim = [i for i in DEAL_VIEW if LINES[i] in text]
    assert len(verbatim) == len(DEAL_VIEW) - len(REWORDED) - len(DROPPED) == 42


def test_dropped_lines_are_really_gone(page):
    text = visible_text(page)
    assert [i for i in DROPPED if LINES[i] in text] == []
    assert "verify.agentactioncapsule.org" not in text


def test_reworded_lines_say_it_from_the_pack(page):
    pack = json.loads((RECEIPTS.parents[2] / "src" / "capsule_viewer" / "receipt" / "wording-en.json").read_text(encoding="utf-8"))
    text = visible_text(page)
    for key in REWORDED.values():
        assert " ".join(pack["entries"][key].split()) in text, key


def _out_of_order(text: str) -> list[int]:
    """Golden lines 8 to 24 -- what the agent did, each item's steps, the money,
    where the deal stands -- not found in the golden's order in *text*."""
    missing, at = [], 0
    for i in range(8, 25):
        found = text.find(LINES[i], at)
        if found < 0:
            missing.append(i)
            continue
        at = found + 1
    return missing


def test_what_the_agent_did_keeps_its_order(page):
    assert _out_of_order(_l1_text(page)) == []


def test_the_order_check_bites(page):
    """Mutant: swap the two things the agent did."""
    first, second = LINES[9], LINES[16]
    swapped = page.replace(first, "\0").replace(second, first).replace("\0", second)
    assert _out_of_order(_l1_text(swapped)) != []


def test_the_evidence_ids_deal_view_showed_are_shown(page):
    bundle, output = load("golden-2")
    record_ids = sorted(r["capsule_id"] for r in bundle["records"])
    shown = set(re.findall(r"\b[0-9a-f]{64}\b", page))
    assert set(record_ids) <= shown
    # The golden's two other ids are its core page's: the bundle digest (shown
    # here, in L2) and the checkpoint root (not shown).
    others = set(GOLDEN["evidence_ids"]) - set(record_ids)
    assert len(others) == 2 and output["bundle_digest"] in others
    assert output["bundle_digest"] in shown
    assert (others - {output["bundle_digest"]}).isdisjoint(shown)


def test_the_sealed_text_marker_is_kept(page):
    assert GOLDEN["verification"]["sealed"] == ["x-deal-v0"]
    assert 'data-sealed="x-deal-v0"' in page
