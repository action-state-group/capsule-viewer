# SPDX-License-Identifier: Apache-2.0
"""The receipt's "How it went": the errand's journey (capsule-cli#340), worded
from the receipt's own pack, whose ``journey.*`` keys mirror capsulectl's
(nothing imports capsule-cli).

Two facts are held here: the pack holds capsulectl's journey words exactly, and
the receipt lists the journey as capsulectl's own deal page words it. The page
is the receipt script's L2 output for ``main-standalone-keep`` as frozen in
``testdata/receipt/oracle-golden.json.gz``."""
from __future__ import annotations

import gzip
import json
import re
from html import unescape

from receipt_helpers import RECEIPTS

from capsule_viewer import receipt_slot

MIRROR = json.loads((RECEIPTS / "capsulectl-journey-words.json").read_text(encoding="utf-8"))["entries"]
DEAL_VIEW = json.loads((RECEIPTS / "main-standalone-keep.deal-view-journey.json").read_text(encoding="utf-8"))["rows"]
PACK = json.loads(receipt_slot.pack_bytes())["entries"]
ORACLE = json.loads(gzip.decompress((RECEIPTS / "oracle-golden.json.gz").read_bytes()))


def _l2(name: str, audience: str) -> str:
    case = next(c for c in ORACLE["cases"] if c["name"] == name and c["audience"] == audience)
    return next(m for m in case["modules"].values() if m["can_render"])["html"]["L2"]


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
    mine = {k: v for k, v in PACK.items() if k.startswith("journey.")}
    assert mine == {k: v for k, v in MIRROR.items() if k.startswith("journey.")}
    # The contact classes a row puts into words (capsulectl's, not a token with its underscores undone).
    for key, text in MIRROR.items():
        if key.startswith("class."):
            assert PACK[key] == text, key


def test_the_receipt_lists_the_journey_as_capsulectls_deal_page_words_it():
    assert _rows(_l2("main-standalone-keep", "keep")) == [(r["mover"], r["label"]) for r in DEAL_VIEW]


def test_a_copy_with_no_journey_shows_no_section():
    for name, audience in (("main-standalone-counterparty", "counterparty"), ("main-buyer-keep", "keep")):
        assert "How it went" not in _l2(name, audience)
