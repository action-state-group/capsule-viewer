# SPDX-License-Identifier: Apache-2.0
"""The History Card design (docs/design/history-card.md): the fixture's recompute
check passes, each mutant flips it, and the manifest sketch is checked against
the presentation contract. No module is registered; the sketch is a design file."""
from __future__ import annotations

import copy
import json
from pathlib import Path

import jsonschema
import pytest
from history_recompute import SELECTION_EXTENSION, _digest, derive, recompute_errors

from capsule_viewer.registry import co_matchable

HERE = Path(__file__).parent
FIXTURE = HERE / "testdata" / "history" / "selection.bundle.json"
SKETCH = HERE.parent / "docs" / "design" / "history-card.manifest.json"
AAC = HERE / "testdata" / "aac-presentation"
RECEIPTS = HERE.parent / "src" / "capsule_viewer" / "receipt"


@pytest.fixture
def bundle() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _ext(b: dict) -> dict:
    return b["extensions"][SELECTION_EXTENSION]


def _drop(b: dict, index: int, *, reference_too: bool) -> str:
    rec = b["records"].pop(index)
    del b["disclosures"][rec["capsule_id"]]
    if reference_too:
        _ext(b)["account"]["selection"]["input_identity"]["references"].remove(rec["capsule_id"])
    return rec["capsule_id"]


def test_the_fixture_recomputes(bundle):
    assert recompute_errors(bundle) == []


def test_the_fixture_is_the_selection_the_design_describes(bundle):
    asserted = _ext(bundle)["account"]["asserted_result"]
    assert asserted["selected_count"] == len(bundle["records"]) == 8
    assert asserted["completeness"] == "not_asserted"
    assert sum(asserted["outcome_evidence"].values()) == asserted["selected_count"]
    assert asserted["outcome_evidence"] == {
        "action_class:money.refund": 1,
        "effect.status:dispatched": 4,
        "none": 2,
        "outcome:mismatch": 1,
    }
    # Both record forms are present: x-deal-v0 and the typed action-record/v0.
    forms = {"typed" if d["agent_input"].get("type") == "action-record/v0" else "x-deal-v0" for d in bundle["disclosures"].values()}
    assert forms == {"typed", "x-deal-v0"}


def test_the_definition_digest_agrees_with_the_account_core():
    # Pinned from capsule_emit.account's definition_digest() when the fixture was built
    # (examples/history/build_fixture.py); recomputed here with this repo's own JCS.
    bundle = json.loads(FIXTURE.read_text(encoding="utf-8"))
    pinned = "a6cf2944408ac0b8b0fe0adaf54d40631e9772376838bb413220e0c77f2da2b1"
    assert _ext(bundle)["account"]["derivation"]["definition_digest"] == pinned
    assert _digest(_ext(bundle)["definition"]) == pinned


@pytest.mark.parametrize("index", range(8))
def test_mutant_a_dropped_record_flips_the_check(bundle, index):
    cid = _drop(bundle, index, reference_too=False)
    assert any(cid in e and "selected but not disclosed" in e for e in recompute_errors(bundle))


@pytest.mark.parametrize("index", range(8))
def test_mutant_a_dropped_record_and_reference_flips_the_counts(bundle, index):
    _drop(bundle, index, reference_too=True)
    errors = recompute_errors(bundle)
    assert any(e.startswith("selected_count: recomputed 7 != asserted 8") for e in errors), errors
    assert any(e.startswith("outcome_evidence:") for e in errors), errors


def test_an_honest_smaller_selection_passes(bundle):
    # Dropping a record AND restating every count is a different, honest selection.
    # The check cannot tell, which is why the card never asserts completeness.
    _drop(bundle, 1, reference_too=True)
    _ext(bundle)["account"]["asserted_result"] = derive(bundle["records"], bundle["disclosures"])
    assert recompute_errors(bundle) == []


def test_mutant_an_edited_count_flips_the_check(bundle):
    _ext(bundle)["account"]["asserted_result"]["outcome_evidence"]["none"] = 1
    _ext(bundle)["account"]["asserted_result"]["outcome_evidence"]["effect.status:dispatched"] = 5
    assert any(e.startswith("outcome_evidence:") for e in recompute_errors(bundle))


def test_mutant_asserted_completeness_flips_the_check(bundle):
    _ext(bundle)["account"]["asserted_result"]["completeness"] = "complete"
    assert any("completeness must be not_asserted" in e for e in recompute_errors(bundle))


def test_mutant_an_unlabelled_extra_count_flips_the_check(bundle):
    _ext(bundle)["account"]["asserted_result"]["records_held_in_period"] = 23
    assert any("nothing recomputes" in e for e in recompute_errors(bundle))
    bundle2 = json.loads(FIXTURE.read_text(encoding="utf-8"))
    _ext(bundle2)["holder_asserted"]["records_held_in_period"]["label"] = "verified"
    assert any("not labelled holder_asserted" in e for e in recompute_errors(bundle2))


def test_mutant_an_edited_disclosure_flips_the_check(bundle):
    cid = bundle["records"][0]["capsule_id"]
    bundle["disclosures"][cid]["agent_input"]["body"]["amount_minor"] += 1
    assert any("agent_input_digest" in e for e in recompute_errors(bundle))


def test_mutant_a_swapped_definition_flips_the_check(bundle):
    _ext(bundle)["definition"]["reads"].append("agent_input.body.amount_minor")
    assert any("definition_digest" in e for e in recompute_errors(bundle))


def test_mutant_an_unselected_record_in_the_bundle_flips_the_check(bundle):
    _ext(bundle)["account"]["selection"]["input_identity"]["references"].pop()
    assert any("in the bundle but not selected" in e for e in recompute_errors(bundle))


# --- the manifest sketch -------------------------------------------------------

SCHEMA = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
SKETCH_JSON = json.loads(SKETCH.read_text(encoding="utf-8"))
RECEIPT_MANIFESTS = {
    p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(RECEIPTS.glob("manifest-*.json"))
}
BUILTINS = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((AAC / "builtin").glob("*.json"))}


def test_the_sketch_is_schema_valid():
    validator = jsonschema.Draft202012Validator({**SCHEMA, "$ref": "#/$defs/PresentationManifest"})
    assert list(validator.iter_errors(SKETCH_JSON)) == []
    # It forbids only the three report/result profiles, the receipts' own profile forbids.
    assert SKETCH_JSON["forbids"] == {"profiles": RECEIPT_MANIFESTS["manifest-unilateral"]["forbids"]["profiles"]}


@pytest.mark.parametrize("name", sorted(n for n, m in BUILTINS.items() if not m["fallback"]))
def test_the_sketch_is_not_ambiguous_with_a_specific_builtin(name):
    assert not co_matchable(SKETCH_JSON, BUILTINS[name])


def test_without_its_forbids_the_sketch_would_be_ambiguous_with_every_specific_builtin():
    bare = {k: v for k, v in SKETCH_JSON.items() if k != "forbids"}
    assert sorted(n for n, m in BUILTINS.items() if not m["fallback"] and co_matchable(bare, m)) == sorted(
        n for n, m in BUILTINS.items() if not m["fallback"]
    )


def _viewer_specific_manifests() -> dict[str, dict]:
    from capsule_viewer.rules import rules_manifest
    from capsule_viewer.rules.fixture import RECORD_KIND

    return {**RECEIPT_MANIFESTS, "rules": rules_manifest(RECORD_KIND)}


def test_the_sketch_needs_each_viewer_module_to_forbid_the_selection_extension():
    # As they stand, the three receipt manifests and the Rules manifest each co-match the
    # sketch (a selection bundle may also engage x-deal-v0, composed/v1 or a rules profile),
    # and the registry refuses an ambiguous pair. Resolved by forbids, never priority.
    manifests = _viewer_specific_manifests()
    assert sorted(n for n, m in manifests.items() if co_matchable(SKETCH_JSON, m)) == [
        "manifest-bilateral",
        "manifest-seller",
        "manifest-unilateral",
        "rules",
    ]
    # With one forbids token added to each (the build item's change), none does.
    for m in manifests.values():
        patched = copy.deepcopy(m)
        patched.setdefault("forbids", {}).setdefault("extensions", []).append(SELECTION_EXTENSION)
        assert not co_matchable(SKETCH_JSON, patched)
