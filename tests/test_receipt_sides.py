# SPDX-License-Identifier: Apache-2.0
"""The receipt's three cases (``receipt/sides.py``), drawn from real
capsulectl bundles: stamped by both, your receipt only, no record. And the
negatives the 9b receipt rules set: one-sided is never drawn like agreed,
two copies that do not agree are never drawn like agreed, and a missing side
is never red.

``main-buyer-keep`` and ``main-seller-keep`` are copies capsulectl (capsule-cli
main) cut, the copies a Muse deal's receipt is made from; ``bilateral-keep``
composes both parties' copies; ``one-sided-keep`` is ``bilateral-keep`` with
the seller's member an absence (``examples/receipt/one_sided.py``), which
capsulectl verified as such."""
from __future__ import annotations

import copy
import hashlib
import re
from html.parser import HTMLParser

import pytest
from receipt_helpers import BILATERAL, SELLER, load, render, report_for

from capsule_viewer.receipt import example_wording_pack
from capsule_viewer.receipt.module import PLACEHOLDERS, UnilateralReceiptModule
from capsule_viewer.receipt.module_slot import KIT_CSS
from capsule_viewer.receipt.sides import plain_date
from capsule_viewer.wording import load_wording_pack


class _Halves(HTMLParser):
    """The page's sides: its case, and per half its kind, label and text,
    with every class on the half and inside it."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.cases: list[str] = []
        self.case_classes: list[str] = []
        self.halves: list[dict[str, object]] = []
        self.actions: list[str] = []
        self.stack: list[tuple[str, dict[str, object] | None]] = []
        self.in_case = False
        self.case_text: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if "data-receipt-case" in a:
            self.cases.append(a["data-receipt-case"] or "")
        if "data-case" in a:
            self.case_classes.append(cls)
            self.in_case = True
        if "data-action" in a:
            self.actions.append(a["data-action"] or "")
        half = None
        if "data-half" in a:
            half = {"kind": a["data-half"], "outcome": a.get("data-outcome"), "classes": [cls], "text": []}
            self.halves.append(half)
        elif self.stack and self.stack[-1][1] is not None:
            half = self.stack[-1][1]
            half["classes"].append(cls)  # type: ignore[union-attr]
        if tag not in ("br", "hr", "img", "input", "meta", "link"):
            self.stack.append((tag, half))

    def handle_endtag(self, tag):
        if self.stack:
            self.stack.pop()
        self.in_case = False

    def handle_data(self, data):
        if self.in_case:
            self.case_text.append(data)
        if self.stack and self.stack[-1][1] is not None:
            self.stack[-1][1]["text"].append(data)  # type: ignore[union-attr]


def halves(page: str) -> _Halves:
    parser = _Halves()
    parser.feed(page)
    return parser


def text(half: dict[str, object]) -> str:
    return " ".join(" ".join(half["text"]).split())  # type: ignore[arg-type]


# ---- the three cases, from real bundles ----------------------------------------


@pytest.mark.parametrize("name", ["main-buyer-keep", "main-seller-keep", "keep", "seller-keep", "seller-producer-keep"])
def test_a_holders_own_copy_alone_is_no_record(name):
    h = halves(render(name, depth="L0"))
    assert h.cases == ["none"]
    # The whole page is the holder's: the missing side alone, and no case line.
    assert [x["kind"] for x in h.halves] == ["missing"] and h.case_classes == []
    assert text(h.halves[0]) == "Their side No record. Nothing from their side is in this receipt."
    assert h.halves[0]["outcome"] == "none"
    # Nobody may have asked yet, so the holder asks, not asks again.
    assert h.actions == ["send", "ask"]


def test_both_copies_agreeing_are_stamped_by_both():
    h = halves(render("bilateral-keep", depth="L0"))
    assert h.cases == ["both"]
    assert "cv-tone--positive" in h.case_classes[0]
    assert [x["kind"] for x in h.halves] == ["ours", "theirs"]
    assert text(h.halves[1]).startswith("Their side · as received")
    assert h.actions == ["dispute", "send", "show_theirs"]


def test_our_copy_and_an_unanswered_ask_is_your_receipt_only():
    _, output = load("one-sided-keep")
    composed = next(e["composed"] for e in output["extensions"] if e["kind"] == "composed/v1")
    assert output["verdict"] == "VALID" and composed["status"] == "pass"
    assert [j["derived"] for j in composed["joins"]] == ["one_sided"]
    h = halves(render("one-sided-keep", depth="L0"))
    assert h.cases == ["one_sided"]
    assert "cv-tone--caution" in h.case_classes[0]
    assert [x["kind"] for x in h.halves] == ["ours", "missing"]
    assert h.halves[1]["outcome"] == "absence"
    assert text(h.halves[1]) == "Their side No record. Their side was asked on Oct 9, 2026 and had not answered by Oct 12, 2026. The ask is on record."
    assert h.actions == ["send", "ask_again"]


def test_a_shared_page_names_each_side_by_its_role_and_says_no_your():
    page = render("bilateral-counterparty", depth="L0")
    h = halves(page)
    assert h.cases == ["both"]
    assert [x["kind"] for x in h.halves] == ["theirs", "theirs"]
    assert all("as received" in text(x) for x in h.halves)
    assert "Your side" not in page and h.actions == []


def test_a_shared_one_sided_page_names_the_missing_side_by_its_role():
    page = render("one-sided-counterparty", depth="L0")
    h = halves(page)
    assert h.cases == ["one_sided"]
    assert " ".join(h.case_text) == "One side's record only: the other side's record is missing."
    assert [x["kind"] for x in h.halves] == ["theirs", "missing"]
    assert text(h.halves[1]).startswith("seller No record.")
    assert "Your " not in page and h.actions == []
    assert "two copies" not in page and "How the two copies line up" not in page


@pytest.mark.parametrize("name", [n for n, a in {**SELLER, "counterparty": "counterparty", "adjudicator": "adjudicator"}.items() if a != "keep"])
def test_a_single_copy_cut_for_someone_else_draws_no_sides(name):
    assert halves(render(name, depth="L0")).cases == []


# ---- negatives -------------------------------------------------------------------


def test_one_sided_is_never_drawn_like_agreed():
    page = render("one-sided-keep", depth="L2")
    h = halves(page)
    assert h.cases == ["one_sided"]
    assert not any(x["kind"] == "theirs" for x in h.halves)
    assert "cv-tone--positive" not in " ".join(h.case_classes)
    assert "Stamped by both" not in page
    assert "dispute" not in h.actions


def test_one_sided_declared_as_agreed_is_declined_not_drawn():
    """The composer declares the join ``agree`` over one copy: the verifier
    derives ``one_sided`` and fails the composition, and the bilateral
    module declines it, never drawing an agreement."""
    _, output = load("one-sided-keep")
    output = copy.deepcopy(output)
    composed = next(e["composed"] for e in output["extensions"] if e["kind"] == "composed/v1")
    composed["joins"][0].update(declared="agree", result="join_state_mismatch")
    composed["status"] = "fail"
    page = render("one-sided-keep", depth="L0", output=output)
    assert halves(page).cases == []
    assert "Stamped by both" not in page


def test_a_signed_policy_declined_refusal_is_drawn_as_a_limit():
    """capsulectl reads the refusal member INCOMPLETE and verifies its
    signature. The page draws the copy beside it and the declined ask as the
    other party's limit: a neutral case line, never the agreed or the
    one-sided case, never a no to the deal and never red."""
    _, output = load("one-sided-refusal-keep")
    composed = next(e["composed"] for e in output["extensions"] if e["kind"] == "composed/v1")
    assert output["verdict"] == "INCOMPLETE"
    assert composed["members"][1]["refusal_signature"]["status"] == "verified"
    page = render("one-sided-refusal-keep", depth="L0")
    h = halves(page)
    assert h.cases == ["limit"]
    assert [x["kind"] for x in h.halves] == ["ours", "missing"]
    assert h.halves[1]["outcome"] == "refusal"
    assert text(h.halves[1]) == (
        "Their side Not shared. Their side was asked for its record, and on Oct 10, 2026 signed a reply that its sharing "
        "policy does not allow it. This is a limit on what they share. They have not refused the deal."
    )
    assert "cv-tone--neutral" in h.case_classes[0] and "negative" not in " ".join(h.case_classes)
    assert " ".join(h.case_text).startswith("Your receipt only: the other side's record is not shared.")
    assert "Stamped by both" not in page and "did not verify" not in page
    assert h.actions == ["send"]
    # A banner the page cannot read as verified: the verification is incomplete.
    assert "Incomplete" in page


def test_a_shared_page_words_the_limit_without_your():
    """A counterparty or adjudicator page never says "your"; the case line
    for the limit has its own shared words, with the same neutral tone."""
    raw = example_wording_pack()
    module = UnilateralReceiptModule(load_wording_pack(raw, hashlib.sha256(raw).hexdigest(), PLACEHOLDERS))
    h = halves(str(module.sides("limit", [], keep=False)))
    assert h.cases == ["limit"]
    assert " ".join(h.case_text).startswith("One side's record only: the other side's record is not shared.")
    assert "Your" not in " ".join(h.case_text) and "cv-tone--neutral" in h.case_classes[0]


def _refusal_case(change):
    bundle, output = load("one-sided-refusal-keep")
    bundle, output = copy.deepcopy(bundle), copy.deepcopy(output)
    change(bundle, output)
    return render("one-sided-refusal-keep", depth="L0", bundle=bundle, output=report_for(bundle, output))


def _refusal_member(bundle):
    return bundle["extensions"]["composed/v1"]["members"][1]


def _composed(output):
    return next(e["composed"] for e in output["extensions"] if e["kind"] == "composed/v1")


@pytest.mark.parametrize(
    "change",
    [
        lambda b, o: _refusal_member(b)["refusal"].update(reason="other_reason"),
        lambda b, o: _composed(o)["members"][1].update(refusal_signature={"profile": "ed25519-jcs", "status": "invalid"}),
        lambda b, o: _composed(o)["members"][1].update(digest="mismatch"),
        lambda b, o: _composed(o).update(status="fail"),
        lambda b, o: o.update(checkpoint={"findings": ["x"], "status": "fail"}),
        lambda b, o: o.update(verdict="INVALID"),
        lambda b, o: _composed(o)["findings"].append("anything"),
    ],
    ids=["other-reason", "unverified-signature", "digest-mismatch", "composition-failed", "other-failure", "invalid", "composition-finding"],
)
def test_only_a_verified_policy_declined_refusal_with_nothing_else_wrong_is_a_limit(change):
    """Anything else about a refusal, or any other failure beside it, draws
    nothing: the generic did-not-verify page."""
    page = _refusal_case(change)
    assert halves(page).cases == [] and "not shared" not in page.lower() and "limit" not in page.lower().split("did not")[0]
    assert "did not verify" in page


def test_an_absence_the_bundle_does_not_carry_is_declined():
    """Only a carried absence, its digest reproduced, is an answer the page
    shows; one the composer only declared missing is none."""
    _, output = load("one-sided-keep")
    output = copy.deepcopy(output)
    composed = next(e["composed"] for e in output["extensions"] if e["kind"] == "composed/v1")
    composed["members"][1]["body"] = "declared_missing"
    page = render("one-sided-keep", depth="L0", output=output)
    assert halves(page).cases == [] and "Your receipt only" not in page


def test_an_absence_without_its_window_is_declined():
    bundle, output = load("one-sided-keep")
    bundle = copy.deepcopy(bundle)
    del bundle["extensions"]["composed/v1"]["members"][1]["absence"]["window"]
    page = render("one-sided-keep", depth="L0", bundle=bundle)
    assert halves(page).cases == [] and "Your receipt only" not in page


@pytest.mark.parametrize(
    ("name", "edit"),
    [
        ("bilateral-adjudicator", None),  # an agreeing join beside a mismatching one
        ("bilateral-two-deals", None),  # the copies name two deals
        ("bilateral-keep", {"result": "redundant", "reasons": ["same_custody_domain"]}),  # agreeing, not corroborating
    ],
)
def test_two_copies_that_do_not_show_one_agreement_are_not_drawn_as_agreed(name, edit):
    _, output = load(name)
    if edit is not None:
        output = copy.deepcopy(output)
        composed = next(e["composed"] for e in output["extensions"] if e["kind"] == "composed/v1")
        composed["corroboration"][0].update(edit)
    page = render(name, depth="L0", output=output)
    h = halves(page)
    assert h.cases == ["not_agreed"]
    assert "cv-tone--positive" not in " ".join(h.case_classes)
    assert "Stamped by both" not in page


ALL = sorted({*BILATERAL, *SELLER, "keep", "golden-2", "main-buyer-keep", "main-seller-keep", "one-sided-keep", "one-sided-counterparty", "one-sided-refusal-keep"})


@pytest.mark.parametrize("name", ALL)
def test_a_missing_side_is_never_red(name):
    h = halves(render(name, depth="L2"))
    for half in h.halves:
        if half["kind"] == "missing":
            assert not any("negative" in c for c in half["classes"]), half  # type: ignore[union-attr]
    assert not any("negative" in classes for classes in h.case_classes)


def test_the_stylesheet_never_draws_a_side_red():
    css = KIT_CSS.read_text(encoding="utf-8")
    rules = dict(re.findall(r"(\.cv-(?:sides|half)[^{]*)\{([^}]*)\}", css))
    assert any(".cv-half--missing" in k and "dashed" in v and "neutral" in v for k, v in rules.items())
    assert not any("negative" in v for v in rules.values())


@pytest.mark.parametrize(
    ("value", "date"),
    [("2026-10-09T18:00:00Z", "Oct 9, 2026"), ("2026-12-31", "Dec 31, 2026"), ("2026-13-01T00:00:00Z", "2026-13-01T00:00:00Z"), ("soon", "soon")],
)
def test_a_window_is_said_as_plain_dates(value, date):
    assert plain_date(value) == date


def test_the_actions_are_after_l1_not_in_l0():
    page = render("bilateral-keep", depth="L0")
    l0 = page.split('data-level="L1"')[0]
    assert "data-actions" not in l0 and 'data-actions="true"' in page
