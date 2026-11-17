# SPDX-License-Identifier: Apache-2.0
"""Shared by the receipt tests: the vendored fixtures and the text a rendered
page shows (read from the page, never layout)."""
from __future__ import annotations

import json
import re
from html import unescape
from pathlib import Path

from capsule_viewer.context import Json
from capsule_viewer.digest import bundle_digest

RECEIPTS = Path(__file__).parent / "testdata" / "receipt"
FIXTURES = ("keep", "counterparty", "adjudicator", "golden-2")
# The composed/v1 fixtures, each a composition of both parties' copies of one
# deal, and the page audience each is for (the two-deals one is a
# counterparty composition whose copies name two deals).
BILATERAL = {
    "bilateral-keep": "keep",
    "bilateral-counterparty": "counterparty",
    "bilateral-adjudicator": "adjudicator",
    "bilateral-two-deals": "counterparty",
}
# The seller copies and the audience each was cut for. ``seller-producer-*`` are
# capsulectl's own seller copies (the producer engages the seller kind);
# ``seller-*`` are built by build_seller_fixtures.sh (the kind engaged by its
# fixture step), ``seller-declined`` a thread closed not_selected.
SELLER = {
    "seller-keep": "keep",
    "seller-counterparty": "counterparty",
    "seller-adjudicator": "adjudicator",
    "seller-declined": "counterparty",
    "seller-producer-keep": "keep",
    "seller-producer-counterparty": "counterparty",
    "seller-producer-adjudicator": "adjudicator",
}
# A loaded JSON document the tests may change before rendering.
Doc = dict[str, Json]


def load(name: str) -> tuple[Doc, Doc]:
    bundle = json.loads((RECEIPTS / f"{name}.bundle.json").read_text(encoding="utf-8"))
    output = json.loads((RECEIPTS / f"{name}.verify.json").read_text(encoding="utf-8"))
    return bundle, output


def report_for(bundle: Doc, output: Doc) -> Doc:
    """*output*, as a verifier's report on *bundle*'s exact bytes: the statuses
    the test set, bound to the edited bundle's digest. A test that edits a
    bundle states with this what the verifier said about the edited copy."""
    return {**output, "bundle_digest": bundle_digest(bundle)}


def audience_of(name: str) -> str:
    if name in BILATERAL:
        return BILATERAL[name]
    if name in SELLER:
        return SELLER[name]
    if name == "seller-bilateral" or name.startswith("buyer-producer-"):
        return "counterparty"
    if name.startswith("main-"):  # cut by examples/receipt/cut_main_bundles.sh: main-<side>-<audience>
        return name.rsplit("-", 1)[1]
    if name.startswith("one-sided-"):  # examples/receipt/one_sided.py over bilateral-<audience>
        return name.rsplit("-", 1)[1]
    return "keep" if name.startswith("golden") else name


def visible_text(html: str) -> str:
    """Every text node outside the head (of a page or a fragment), whitespace collapsed."""
    body = html.split("<body", 1)[-1]
    text = unescape(re.sub(r"<[^>]+>", " ", body))
    return re.sub(r"\s+", " ", text).strip()
