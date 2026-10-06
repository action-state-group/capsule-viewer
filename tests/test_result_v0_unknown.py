# SPDX-License-Identifier: Apache-2.0
"""The UNKNOWN-sufficiency Result fixtures, and a floor on the positive
fixture corpus so it never again lacks an UNKNOWN claim.

``pos-unknown-claim-result.json`` and ``pos-unknown-count-aggregate-result.json``
are the bytes capsule-engine's
``scripts/generate_evidence_result_unknown_fixtures.py`` writes to its
``tests/fixtures/evidence-result/unknown-*.json``; both repos pin the same
sha256. The card's half (rendered sufficiency in order, the unknown_count
recount, and the drop/remap mutants) is in ``js-tests/result_v0_unknown.test.js``.

The population is the POSITIVE fixtures: what a conforming implementation
must reproduce. ``neg-*`` files are vectors it must reject and are never
counted. Before these fixtures, the positive corpus across this repo and
capsule-engine was 23 claims / 9 files (SATISFIED 16, GAP 4,
INSUFFICIENT 3, UNKNOWN 0).
"""
from __future__ import annotations

import base64
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import TypedDict

import pytest

from capsule_viewer import build_payload, encode_fragment
from capsule_viewer.result_v0 import build_result_entry

TESTDATA = Path(__file__).parent / "testdata"

PINNED = {
    "pos-unknown-claim-result.json": "b963016e72560f17a34f071c1d79bc5518b3accd607fec0730f6b4574d675547",
    "pos-unknown-count-aggregate-result.json": "b0c78c24c892802357455081224142ad7e4a5d1db82750053c48798ba04f126e",
}


class ClaimDoc(TypedDict):
    id: str
    sufficiency: str


class CoverageDoc(TypedDict):
    unknown_count: int


class AggregateDoc(TypedDict):
    coverage: CoverageDoc


class ResultDoc(TypedDict):
    """The parts of a Result v0 document these checks read."""

    claims: list[ClaimDoc]
    aggregate: AggregateDoc


class EntryDoc(TypedDict):
    record: ResultDoc


class PayloadDoc(TypedDict):
    entries: list[EntryDoc]


def load(name: str) -> ResultDoc:
    return json.loads((TESTDATA / name).read_text(encoding="utf-8"))


def decode(fragment: str) -> PayloadDoc:
    return json.loads(base64.urlsafe_b64decode(fragment + "=" * (-len(fragment) % 4)))


def positive_result_fixtures(directory: Path) -> list[Path]:
    return sorted(
        p
        for p in directory.glob("*.json")
        if not p.name.startswith("neg-") and not p.name.endswith(".records.json")
    )


def sufficiency_counts(paths: list[Path]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for path in paths:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(doc.get("claims"), list):
            counts.update(claim.get("sufficiency") for claim in doc["claims"])
    return counts


def assert_corpus_exercises_unknown(paths: list[Path]) -> None:
    assert sufficiency_counts(paths)["UNKNOWN"] >= 1, f"no UNKNOWN claim in {len(paths)} positive Result fixtures"


@pytest.mark.parametrize("name", list(PINNED))
def test_fixture_bytes_match_the_engine_pin(name: str):
    assert hashlib.sha256((TESTDATA / name).read_bytes()).hexdigest() == PINNED[name]


@pytest.mark.parametrize("name", list(PINNED))
def test_unknown_claims_reach_the_browser_byte_identical(name: str):
    result = load(name)
    record = decode(encode_fragment(build_payload([build_result_entry(result, strict=True)])))["entries"][0]["record"]
    assert record == result
    assert [c["sufficiency"] for c in record["claims"]] == [c["sufficiency"] for c in result["claims"]]


def test_unknown_count_agrees_with_the_claims_array():
    doc = load("pos-unknown-count-aggregate-result.json")
    unknown = sum(1 for c in doc["claims"] if c["sufficiency"] == "UNKNOWN")
    assert unknown == 2
    assert doc["aggregate"]["coverage"]["unknown_count"] == unknown


def test_positive_corpus_exercises_unknown():
    assert_corpus_exercises_unknown(positive_result_fixtures(TESTDATA))


def test_negative_vectors_are_outside_the_population(tmp_path: Path):
    (tmp_path / "neg-planted.json").write_bytes((TESTDATA / "pos-unknown-claim-result.json").read_bytes())
    assert positive_result_fixtures(tmp_path) == []


def test_planted_control_corpus_without_unknown_reds_the_floor(tmp_path: Path):
    for path in positive_result_fixtures(TESTDATA):
        doc = json.loads(path.read_text(encoding="utf-8"))
        for claim in doc.get("claims", []):
            if claim.get("sufficiency") == "UNKNOWN":
                claim["sufficiency"] = "GAP"
        (tmp_path / path.name).write_text(json.dumps(doc), encoding="utf-8")
    planted = positive_result_fixtures(tmp_path)
    assert sufficiency_counts(planted)["UNKNOWN"] == 0
    with pytest.raises(AssertionError, match="no UNKNOWN claim"):
        assert_corpus_exercises_unknown(planted)
