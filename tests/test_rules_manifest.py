# SPDX-License-Identifier: Apache-2.0
"""The Rules module's manifest against agent-action-capsule's presentation
contract: schema-valid, requiring the rules_compare profile, and never
ambiguous with any built-in manifest (contract section 4.5)."""
from __future__ import annotations

import json
from itertools import combinations
from pathlib import Path

import jsonschema
import pytest

from capsule_viewer.rules import rules_manifest
from capsule_viewer.rules.fixture import RECORD_KIND
from capsule_viewer.rules.module import BASE_MANIFEST

AAC = Path(__file__).parent / "testdata" / "aac-presentation"
SCHEMA = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
MANIFEST_JSON = rules_manifest(RECORD_KIND)
BUILTINS = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((AAC / "builtin").glob("*.json"))}


def _validator(defn: str) -> jsonschema.Draft202012Validator:
    return jsonschema.Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{defn}"})


def _req(m, key):
    if key == "profiles":
        return set(m["requires"].get("profiles", ()))
    return set(m["requires"].get("extensions", {}).get("required", ()))


def _forb(m, key):
    return set(m.get("forbids", {}).get(key, ()))


def co_matchable(a, b) -> bool:
    """Contract section 4.5: some descriptor matches both manifests."""
    if a["requires"]["bundle_kind"] != b["requires"]["bundle_kind"]:
        return False
    aud_a, aud_b = set(a["audiences"]), set(b["audiences"])
    if not ("*" in aud_a or "*" in aud_b or aud_a & aud_b):
        return False
    if not set(a["formats"]) & set(b["formats"]):
        return False
    r_p = _req(a, "profiles") | _req(b, "profiles")
    r_e = _req(a, "extensions") | _req(b, "extensions")
    if r_p & (_forb(a, "profiles") | _forb(b, "profiles")) or r_e & (_forb(a, "extensions") | _forb(b, "extensions")):
        return False
    keys = [token.split(":", 1)[0] for token in r_p]
    return len(keys) == len(set(keys))


def test_the_manifest_is_schema_valid():
    errors = sorted(_validator("PresentationManifest").iter_errors(MANIFEST_JSON), key=str)
    assert errors == []


def test_the_schema_check_can_fail():
    bad = {**MANIFEST_JSON, "title": "words belong in the pack"}
    assert list(_validator("PresentationManifest").iter_errors(bad))


def test_the_example_wording_pack_is_schema_valid():
    from capsule_viewer.rules import example_wording_pack

    assert list(_validator("WordingPack").iter_errors(json.loads(example_wording_pack()))) == []


def test_the_shipped_manifest_names_no_record_kind():
    assert "profiles" not in BASE_MANIFEST["requires"]
    assert rules_manifest("org.example.other/v0")["requires"]["profiles"] == ["spec_version:org.example.other/v0"]
    assert "profiles" not in BASE_MANIFEST["requires"]  # building one does not change the base


def test_the_manifest_requires_the_record_kind_profile_and_is_a_specific_module():
    assert MANIFEST_JSON["requires"]["profiles"] == [f"spec_version:{RECORD_KIND}"]
    assert MANIFEST_JSON["fallback"] is False and MANIFEST_JSON["priority"] >= 1
    assert MANIFEST_JSON["trust_class"] == "trusted-executable"


def test_the_vendored_builtins_are_the_six_the_contract_lists():
    assert sorted(m["id"] for m in BUILTINS.values()) == [
        "aac.builtin.evaluation-summary-graph/v0",
        "aac.builtin.no-aggregate/v0",
        "aac.builtin.report-rows/v0",
        "aac.builtin.result-compliance/v0",
        "aac.builtin.result-outcome-report/v0",
        "aac.builtin.result/v0",
    ]


def test_the_static_test_finds_the_contracts_own_ambiguous_pair():
    pair = [json.loads((AAC / "neg-ambiguous-pair" / f"{n}.json").read_text(encoding="utf-8")) for n in ("a", "b")]
    assert co_matchable(*pair)


def test_the_static_test_finds_no_ambiguity_among_the_builtins():
    specific = [m for m in BUILTINS.values() if not m["fallback"]]
    assert [(a["id"], b["id"]) for a, b in combinations(specific, 2) if co_matchable(a, b)] == []


SPECIFIC = sorted(name for name, m in BUILTINS.items() if not m["fallback"])


def test_only_the_no_aggregate_builtin_is_a_fallback():
    # A fallback is a different tier: it is never ambiguous with this specific module.
    assert sorted(set(BUILTINS) - set(SPECIFIC)) == ["builtin-no-aggregate"]


@pytest.mark.parametrize("builtin", SPECIFIC)
def test_the_rules_manifest_is_not_ambiguous_with_a_specific_builtin(builtin):
    assert not co_matchable(MANIFEST_JSON, BUILTINS[builtin])


def test_without_its_forbids_the_rules_manifest_would_be_ambiguous_with_the_result_builtins():
    bare = {key: value for key, value in MANIFEST_JSON.items() if key != "forbids"}
    clashing = sorted(m["id"] for m in BUILTINS.values() if not m["fallback"] and co_matchable(bare, m))
    assert clashing == [
        "aac.builtin.result-compliance/v0",
        "aac.builtin.result-outcome-report/v0",
        "aac.builtin.result/v0",
    ]
