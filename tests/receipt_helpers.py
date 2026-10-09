# SPDX-License-Identifier: Apache-2.0
"""Shared by the receipt tests: the vendored fixtures and a semantic snapshot
of a rendered receipt page (what it shows, read from the page, never layout)."""
from __future__ import annotations

import hashlib
import json
import re
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import TypedDict

from capsule_viewer.context import Json
from capsule_viewer.digest import bundle_digest
from capsule_viewer.receipt import example_wording_pack, receipt_page
from capsule_viewer.verifier_report import context_from_capsulectl

RECEIPTS = Path(__file__).parent / "testdata" / "receipt"
PACK = example_wording_pack()
PACK_SHA = hashlib.sha256(PACK).hexdigest()
FIXTURES = ("keep", "counterparty", "adjudicator", "golden-2")
# A loaded JSON document the tests may change before rendering.
Doc = dict[str, Json]


class RecordSnapshot(TypedDict):
    disclosure: str | None
    log: str | None
    facts: dict[str, str]


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
    return "keep" if name.startswith("golden") else name


def render(name: str, depth: str = "L2", bundle: Doc | None = None, output: Doc | None = None, audience: str | None = None) -> str:
    raw_bundle, raw_output = load(name)
    bundle = bundle or raw_bundle
    output = output or (report_for(bundle, raw_output) if bundle is not raw_bundle else raw_output)
    context, assurance = context_from_capsulectl(bundle, output)
    return receipt_page(context, assurance, PACK, PACK_SHA, audience=audience or audience_of(name), depth=depth)


class _Snapshot(HTMLParser):
    """Per ``data-record`` element: its disclosure state, its log place and the
    facts it shows (``data-fact`` name -> text)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.records: dict[str, RecordSnapshot] = {}
        self.stack: list[tuple[str, str | None, str | None]] = []  # (tag, record, fact)
        self.text: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        record = a.get("data-record")
        fact = a.get("data-fact")
        if record is not None:
            entry = self.records.setdefault(record, {"disclosure": a.get("data-disclosure"), "log": a.get("data-log"), "facts": {}})
            entry["disclosure"] = a.get("data-disclosure")
        parent_record = next((r for _, r, _ in reversed(self.stack) if r), None)
        self.stack.append((tag, record or parent_record, fact))
        if fact is not None and parent_record is not None:
            self.records[parent_record]["facts"][fact] = ""

    def handle_endtag(self, tag):
        while self.stack:
            if self.stack.pop()[0] == tag:
                break

    def handle_data(self, data):
        self.text.append(data)
        for _, record, fact in reversed(self.stack):
            if fact is not None and record is not None:
                self.records[record]["facts"][fact] += data
                break


def snapshot(html: str) -> dict[str, RecordSnapshot]:
    parser = _Snapshot()
    parser.feed(html)
    return parser.records


def visible_text(html: str) -> str:
    """Every text node outside the head (of a page or a fragment), whitespace collapsed."""
    body = html.split("<body", 1)[-1]
    text = unescape(re.sub(r"<[^>]+>", " ", body))
    return re.sub(r"\s+", " ", text).strip()
