# SPDX-License-Identifier: Apache-2.0
"""The consumer one-level-details convention, as an acceptance test over the
modules' rendered pages.

A consumer page has an always-visible L0 -- a title, the verification state and
one to three metrics per copy -- and then at most one level of ``<details>``:
no ``<details>`` is ever a descendant of another. This is a MODULE convention,
checked on the Rules module and both receipt modules (unilateral and
bilateral); the seller module's pages are held to the nesting rule too.

A page that did not verify shows the verification state and the refusal, and
nothing else: no L0, no toggles.

The checker is proved to bite on two committed negative fixtures
(``testdata/one-level/``): one with a details inside a details, one whose L0
sits behind a toggle. Each fixture has exactly one fault.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

import pytest
from receipt_helpers import BILATERAL, FIXTURES, SELLER, render

from capsule_viewer.rules import example_wording_pack, rules_page
from capsule_viewer.rules.fixture import FAILED, RECORD_KIND, fixture_context
from capsule_viewer.wording import sha256_hex

NEGATIVE = Path(__file__).parent / "testdata" / "one-level"
VOID = frozenset({"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"})
RULES_PACK = example_wording_pack()


@dataclass
class Shape:
    """What the one-level check reads from a page."""

    nested: list[int] = field(default_factory=list)  # source line of every details opened inside another
    details: int = 0
    l0_regions: int = 0
    l0_in_details: bool = False
    l0_titles: int = 0  # <h2> inside L0, outside every details
    l0_metric_groups: list[int] = field(default_factory=list)  # metrics per group, in L0
    outcomes: list[tuple[str, bool]] = field(default_factory=list)  # (outcome, inside a details), in page order
    private_banners: list[bool] = field(default_factory=list)  # (in L0 and outside every details) per PRIVATE banner


class _Reader(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.shape = Shape()
        # Per open element: (tag, is details, is L0 region, is metric group).
        self.stack: list[tuple[str, bool, bool, bool]] = []
        self.group = -1

    @property
    def depth(self) -> int:
        return sum(1 for _, d, _, _ in self.stack if d)

    @property
    def in_l0(self) -> bool:
        return any(l0 for _, _, l0, _ in self.stack)

    def handle_starttag(self, tag, attrs):
        a = {k: v or "" for k, v in attrs}
        classes = a.get("class", "").split()
        s = self.shape
        if tag == "details":
            s.details += 1
            if self.depth:
                s.nested.append(self.getpos()[0])
        is_l0 = a.get("data-level") == "L0"
        if is_l0:
            s.l0_regions += 1
            s.l0_in_details = s.l0_in_details or self.depth > 0
        if tag == "h2" and self.in_l0 and not self.depth:
            s.l0_titles += 1
        if "cv-verification__outcome" in classes and "data-outcome" in a:
            s.outcomes.append((a["data-outcome"], self.depth > 0))
        if a.get("data-banner") == "private":
            s.private_banners.append(self.in_l0 and not self.depth)
        # A metric group: the kit's metric grid, or the Rules L0 summary line.
        is_group = self.in_l0 and (a.get("data-cv") == "metric-grid" or a.get("data-l0-summary") == "true")
        if is_group:
            s.l0_metric_groups.append(0)
            self.group = len(self.stack)
        elif self.group >= 0 and ("cv-metric" in classes or "data-count" in a):
            s.l0_metric_groups[-1] += 1
        if tag not in VOID:
            self.stack.append((tag, tag == "details", is_l0, is_group))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        # Pop to the matching open tag: kit output is well formed, so this is
        # one pop; a stray end tag pops nothing rather than corrupt the stack.
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                if self.group >= i:
                    self.group = -1
                del self.stack[i:]
                return


def shape(html: str) -> Shape:
    reader = _Reader()
    reader.feed(html)
    reader.close()
    return reader.shape


def one_level_faults(html: str, *, verified: bool = True) -> list[str]:
    """Every way *html* breaks the consumer convention; empty when it holds."""
    s = shape(html)
    faults = [f"a <details> inside another <details> (line {line})" for line in s.nested]
    # The page's verification state is its first outcome (the banner); a
    # repeat of it with the checks, in L2, may sit inside that toggle.
    if not s.outcomes:
        faults.append("no verification state on the page")
    elif s.outcomes[0][1]:
        faults.append(f"the verification state {s.outcomes[0][0]!r} is inside a <details>")
    if not verified:
        # A page that did not verify shows its state and refusal, nothing else.
        if s.l0_regions or s.details:
            faults.append("a page that did not verify shows an L0 or a toggle")
        return faults
    if s.l0_regions != 1:
        faults.append(f"{s.l0_regions} L0 regions, not one")
    if s.l0_in_details:
        faults.append("L0 is inside a <details>")
    if s.l0_titles < 1:
        faults.append("L0 has no title outside every <details>")
    if not s.l0_metric_groups:
        faults.append("L0 has no metrics")
    faults += [f"an L0 metric group with {n} metrics, not 1 to 3" for n in s.l0_metric_groups if not 1 <= n <= 3]
    faults += ["the PRIVATE banner is not in L0 outside every <details>" for ok in s.private_banners if not ok]
    return faults


def _rules(depth: str = "L0", failed: bool = False) -> str:
    ctx = fixture_context(verification=FAILED) if failed else fixture_context()
    return rules_page(ctx, RULES_PACK, sha256_hex(RULES_PACK), RECORD_KIND, depth=depth)


# ---- the checker bites ------------------------------------------------------


def test_the_check_fails_a_details_inside_a_details():
    faults = one_level_faults((NEGATIVE / "neg-nested-details.html").read_text(encoding="utf-8"))
    assert len(faults) == 1 and faults[0].startswith("a <details> inside another <details>"), faults


def test_the_check_fails_an_l0_behind_a_toggle():
    faults = one_level_faults((NEGATIVE / "neg-l0-inside-details.html").read_text(encoding="utf-8"))
    assert faults == [
        "the verification state 'verified' is inside a <details>",
        "L0 is inside a <details>",
        "L0 has no title outside every <details>",
    ], faults


def test_the_check_fails_too_many_metrics_and_a_missing_title():
    html = _rules("L0")
    four = html.replace('data-l0-summary="true">', 'data-l0-summary="true"><span data-count="1">x</span>', 1)
    assert one_level_faults(four) == ["an L0 metric group with 4 metrics, not 1 to 3"]
    assert "L0 has no title outside every <details>" in one_level_faults(html.replace("<h2", "<h3").replace("</h2>", "</h3>"))


def test_the_check_fails_a_failed_page_that_shows_more_than_its_refusal():
    leaky = _rules("L0", failed=True).replace("</main>", '<div data-level="L0"><details><summary>x</summary></details></div></main>')
    assert one_level_faults(leaky, verified=False) == ["a page that did not verify shows an L0 or a toggle"]


# ---- the modules hold -------------------------------------------------------


@pytest.mark.parametrize("depth", ["L0", "L1", "L2"])
def test_rules_verified_is_one_level(depth):
    html = _rules(depth)
    assert one_level_faults(html) == []
    s = shape(html)
    assert s.details >= 2  # not vacuous: the per-rule toggles and the proof toggle are there
    assert s.outcomes[0] == ("verified", False)
    assert s.l0_metric_groups == [3]


def test_rules_failed_shows_its_state_and_nothing_else():
    html = _rules("L0", failed=True)
    assert one_level_faults(html, verified=False) == []
    assert shape(html).outcomes == [("failed", False)]


RECEIPT_PAGES = [*FIXTURES, *BILATERAL]


@pytest.mark.parametrize("depth", ["L0", "L2"])
@pytest.mark.parametrize("name", RECEIPT_PAGES)
def test_receipt_pages_are_one_level(name, depth):
    html = render(name, depth)
    assert one_level_faults(html) == []
    s = shape(html)
    assert s.details == 2  # L1 and L2, one toggle each, and nothing inside them
    assert s.outcomes[0] == ("verified", False)
    assert s.l0_titles >= 1 and s.l0_metric_groups


@pytest.mark.parametrize("name", SELLER)
def test_seller_pages_are_one_level(name):
    # The seller module is held to the same convention: a composition carries
    # a seller copy's L0, so its headline is three metrics too.
    assert one_level_faults(render(name, "L2")) == []


@pytest.mark.parametrize("name", ["keep", "golden-2", "bilateral-keep", "seller-keep", "seller-producer-keep", "main-buyer-keep", "main-seller-keep"])
def test_a_keep_copy_carries_the_private_banner_in_l0(name):
    html = render(name, "L0")
    assert shape(html).private_banners == [True]
    assert html.index('data-banner="private"') < html.index('data-level="L1"')


@pytest.mark.parametrize(
    "name",
    [
        "counterparty",
        "adjudicator",
        "bilateral-counterparty",
        "bilateral-adjudicator",
        "bilateral-two-deals",
        "seller-counterparty",
        "seller-adjudicator",
        "seller-declined",
        "seller-producer-counterparty",
        "main-buyer-counterparty",
        "main-seller-counterparty",
    ],
)
def test_a_copy_for_anyone_else_carries_no_private_banner(name):
    html = render(name, "L2")
    assert shape(html).private_banners == []
    assert "PRIVATE" not in html


# ---- not in this change -----------------------------------------------------


@pytest.mark.skip(
    reason="TODO, NOT TESTED: the 'unable to verify in this viewer' state (the fourth consumer state) does not exist "
    "in this viewer yet; its one-level check and its 390px golden are added with the WebCrypto-fallback change"
)
def test_unable_to_verify_in_this_viewer_is_one_level():
    raise AssertionError("unreachable until the 'unable to verify in this viewer' state exists")
