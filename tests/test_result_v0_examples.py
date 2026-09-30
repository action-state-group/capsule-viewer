# SPDX-License-Identifier: Apache-2.0
"""The example Result v0 fixtures in ``examples/result-v0/``: the committed JSON is
exactly what ``build_fixtures.py`` builds, the positive is internally
consistent (every bucket and count traces to a claim), and each variant is
the positive with exactly the one change it claims to make.

How the card renders each file is pinned in
``js-tests/result_v0_examples.test.js``.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from capsule_viewer.result_v0 import build_result_entry, malformed_digest_refs

EXAMPLE_DIR = Path(__file__).resolve().parent.parent / "examples" / "result-v0"


def _load_builder():
    spec = importlib.util.spec_from_file_location("result_v0_examples_build", EXAMPLE_DIR / "build_fixtures.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = _load_builder()
FIXTURES = builder.fixtures()


def _committed(name: str) -> dict:
    return json.loads((EXAMPLE_DIR / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", sorted(FIXTURES))
def test_committed_fixture_matches_the_builder(name):
    assert (EXAMPLE_DIR / name).read_text(encoding="utf-8") == builder.serialize(FIXTURES[name])


@pytest.mark.parametrize("name", sorted(FIXTURES))
def test_every_digest_is_in_the_vectors_form(name):
    assert malformed_digest_refs(_committed(name)) == []
    build_result_entry(_committed(name), strict=True)


def test_positive_buckets_and_coverage_trace_to_claims():
    result = _committed("release-approval-result.json")
    claims = result["claims"]
    by_verdict = {"met": [], "not_met": [], "not_evaluable": []}
    for claim in claims:
        by_verdict[claim["verdict"]].append(claim["id"])
    assert result["aggregate"]["buckets"] == by_verdict
    coverage = result["aggregate"]["coverage"]
    assert coverage["evaluated_population"] == len(claims)
    assert coverage["unknown_count"] == sum(1 for c in claims if c["sufficiency"] == "UNKNOWN")
    # Every bucket populated, both tiers, all three grades, and a
    # not_evaluable claim under each carrier kind, so the example exercises
    # every distinction the card draws.
    assert all(by_verdict.values())
    assert {c["tier"] for c in claims} == {"recomputed", "judged"}
    assert {c["grade"] for c in claims} == {"self-attested", "witnessed", "countersigned"}
    gap_carriers = {c["presentation"]["kind"] for c in claims if c["verdict"] == "not_evaluable"}
    assert gap_carriers == {"disclosure", "analysis", "story"}
    assert {c["contract_ref"] for c in claims} == {builder.CONTRACT_REF}


def test_positive_says_it_is_synthetic():
    view = _committed("release-approval-result.json")["view"]
    assert "(synthetic)" in view["producer_name"]
    assert "synthetic" in view["title"]
    assert builder.CONTRACT_REF.startswith("ec:example-")


def test_hand_edited_variant_moves_one_bucket_entry_and_nothing_else():
    positive = _committed("release-approval-result.json")
    variant = _committed("release-approval-result-hand-edited.json")
    assert variant["claims"] == positive["claims"]
    assert variant["aggregate"]["coverage"] == positive["aggregate"]["coverage"]
    moved = builder.VARIANT_CLAIM
    assert moved in positive["aggregate"]["buckets"]["not_evaluable"]
    assert moved not in variant["aggregate"]["buckets"]["not_evaluable"]
    assert moved in variant["aggregate"]["buckets"]["met"]
    assert variant["aggregate"]["buckets"]["not_met"] == positive["aggregate"]["buckets"]["not_met"]


def test_untiered_variant_drops_exactly_one_tier():
    positive = _committed("release-approval-result.json")
    variant = _committed("release-approval-result-untiered.json")
    assert "tier" not in variant["claims"][0]
    restored = json.loads(json.dumps(variant))
    restored["claims"][0]["tier"] = positive["claims"][0]["tier"]
    assert restored == positive
