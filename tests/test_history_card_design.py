# SPDX-License-Identifier: Apache-2.0
"""The History Card design (docs/design/history-card.md) against real
Histories: capsulectl ``deal history`` wrote every file under
``tests/testdata/history/`` (``examples/history/cut_fixtures.sh``) and
``verify/<name>.json`` is what ``capsulectl verify --bundle`` printed for it.
The check here (``capsule_viewer.history.recompute``) names what capsulectl
names, shows a card only for a shareable History, and never calls a signature,
checkpoint or log membership verified. The manifest sketch is checked against
the presentation contract."""
from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path

import jsonschema
import pytest

from capsule_viewer.digest import jcs
from capsule_viewer.history import (
    PROPERTIES,
    SELECTION_EXTENSION,
    check,
    recompute_errors,
    sealed_selection,
    selected_records,
)
from capsule_viewer.history.fixture import reseal_selection, with_asserted_result, with_audience
from capsule_viewer.registry import co_matchable

HERE = Path(__file__).parent
DATA = HERE / "testdata" / "history"
SKETCH = HERE.parent / "docs" / "design" / "history-card.manifest.json"
AAC = HERE / "testdata" / "aac-presentation"
RECEIPTS = HERE.parent / "src" / "capsule_viewer" / "receipt"
CUT = json.loads((DATA / "cut.json").read_text(encoding="utf-8"))
DEALS = CUT["deals"]
PICKED = sorted([DEALS["closed"], DEALS["private"], DEALS["floor"]])


def _copies(audience: str) -> list[str]:
    return [f"history_audience_{audience}"] + [f"deal_audience_{audience}:{d}" for d in PICKED]


# What the file-only check finds in each real file (the mutant matrix). 7ebf001
# writes no "history" audience, so every real file is a copy made for someone in
# particular: counterparty and adjudicator are not shareable either (u888), and
# each mutant of the counterparty History carries that beside its own finding.
CP = _copies("counterparty")
MATRIX = {
    "history-counterparty": ("not_shareable", CP),
    "history-adjudicator": ("not_shareable", _copies("adjudicator")),
    "history-keep": ("not_shareable", _copies("keep")),
    "mutant-flipped-outcome": ("not_shareable", [CP[0], f"deal_bundle_not_the_selected_one:{DEALS['closed']}", *CP[1:]]),
    "mutant-mixed-signer": ("not_shareable", [CP[0], f"deal_not_in_selection:{DEALS['second_profile']}", *CP[1:], "deal_signers_differ"]),
    "mutant-not-in-selection": ("not_shareable", [CP[0], f"deal_not_in_selection:{DEALS['other']}", *CP[1:]]),
    "mutant-selection-not-root": ("not_shareable", ["selection_record_not_root", *CP]),
    "mutant-not-history-log": ("not_shareable", ["not_a_history_log", *CP]),
}
# The mutants that edit the outer bundle's root or log id (everything else about them is as cut).
OUTER_EDITS = {"mutant-selection-not-root", "mutant-not-history-log"}


def _load(name: str) -> dict:
    return json.loads((DATA / f"{name}.bundle.json").read_text(encoding="utf-8"))


def _verify(name: str) -> dict:
    report = json.loads((DATA / "verify" / f"{name}.json").read_text(encoding="utf-8"))
    (entry,) = [e for e in report["extensions"] if e.get("kind") == SELECTION_EXTENSION]
    return {"verdict": report["verdict"], **entry}


def _history() -> dict:
    """The counterparty History re-sealed in memory for the audience "history"
    (fixture.with_audience): the shareable baseline until a producer that
    writes that audience (u888) is cut from."""
    return with_audience(_load("history-counterparty"), "history")


@pytest.fixture
def bundle() -> dict:
    return _history()


def _ext(b: dict) -> dict:
    return b["extensions"][SELECTION_EXTENSION]


# ---- the fixtures are real, and say where they came from ---------------------------


def test_the_readme_names_the_capsule_cli_commit_the_fixtures_were_cut_from():
    text = (DATA / "README.md").read_text(encoding="utf-8")
    assert re.search(r"capsule-cli\s+`7ebf00173c95e9287069a159a864e0793744da2e`", text), "the full SHA of the producer commit"
    assert "stand-in" not in text.lower()
    assert "521d41f" not in text and "993949f" not in text and "provisional" not in text.lower()


def test_every_file_is_a_history_bundle_of_the_holders_history_log():
    for name in MATRIX:
        b = _load(name)
        assert b["bundle_kind"] == "evidence-bundle/v2"
        ext = _ext(b)
        if name not in OUTER_EDITS:
            assert b["completeness_certificate"]["log_id"] == b["checkpoint"]["log_id"] == "deal-history"
            assert b["root"] == ext["selection_record"]
        assert set(ext) == {"selection_record", "selection", "deals"}
        record = next(r for r in b["records"] if r["capsule_id"] == ext["selection_record"])
        assert record["action_id"] == "capsulectl-deal-history"
        sealed = sealed_selection(b)
        assert set(sealed) == {"type", "profile", "audience", "nonce", "selection"}
        assert (sealed["type"], sealed["profile"]) == ("history_selection", SELECTION_EXTENSION)
        for entry in sealed["selection"]:
            assert set(entry) == {"deal_id", "bundle_digest"}
            assert re.fullmatch(r"deal-[0-9a-f]{16}", entry["deal_id"]) and re.fullmatch(r"[0-9a-f]{64}", entry["bundle_digest"])


@pytest.mark.parametrize("name", sorted(MATRIX))
def test_the_page_names_what_capsulectl_verify_names(name):
    reading, verified = check(_load(name)), _verify(name)
    state, findings = MATRIX[name]
    assert reading["state"] == state
    assert reading["findings"] == findings
    # capsulectl's findings are the page's (the page adds only what capsulectl reports as
    # audience or does not check: the keep marker).
    assert set(verified["findings"]) <= set(reading["findings"])
    assert (verified["verdict"] == "VALID") == (not verified["findings"])
    assert reading["holder_key"] == verified["holder_key"]
    assert reading["audience"] == verified["audience"]
    assert reading["signer_keys"] == verified["signer_keys"]
    # A card only for a file capsulectl passes and whose audience is "history" (none of 7ebf001's).
    assert (state == "card") == (verified["verdict"] == "VALID" and verified["audience"] == "history")
    assert state != "card"


@pytest.mark.parametrize("audience", ["counterparty", "adjudicator", "keep"])
def test_only_the_history_audience_is_shareable(audience):
    shareable = check(_history())
    assert shareable["state"] == "card" and shareable["audience"] == "history" and shareable["findings"] == []
    reading = check(with_audience(_load("history-counterparty"), audience))
    assert reading["state"] == "not_shareable" and reading["values"] is None
    assert reading["findings"] == _copies(audience)
    assert reading["properties"]["audience"] == "FAIL"
    # The sealed audience alone, the copies left as they are: still not shareable, and named.
    one = reseal_selection(_history(), lambda sealed: sealed.update(audience=audience))
    assert check(one)["state"] == "not_shareable"
    assert check(one)["findings"][0] == f"history_audience_{audience}"


def test_the_selection_record_must_be_the_root_and_the_log_deal_history():
    root = check(_load("mutant-selection-not-root"))
    assert root["properties"]["selection_root"] == "FAIL" and root["values"] is None
    log = check(_load("mutant-not-history-log"))
    assert log["properties"]["history_log"] == "FAIL" and log["values"] is None
    assert check(_history())["properties"]["selection_root"] == "PASS"
    # The same two checks in memory, on the checkpoint's log id and on a missing root.
    b = _history()
    b["checkpoint"]["log_id"] = DEALS["closed"]
    assert check(b)["findings"] == ["not_a_history_log"]
    b = _history()
    del b["root"]
    assert check(b)["findings"] == ["selection_record_not_root"]


def test_signers_are_the_holder_key_or_a_second_profiles_key():
    assert _verify("history-counterparty")["signer_keys"] == {CUT["holder_key"]: PICKED}
    signers = check(_load("mutant-mixed-signer"))["signer_keys"]
    assert signers == {CUT["holder_key"]: PICKED, CUT["second_key"]: [DEALS["second_profile"]]}


# ---- the values ---------------------------------------------------------------------


def test_the_values_are_computed_from_the_selected_deals(bundle):
    reading = check(bundle)
    values = reading["values"]
    selected = selected_records(bundle)
    assert values["selected_count"] == 3 == len(_ext(bundle)["selection"])
    assert {s["deal"] for s in selected} == set(PICKED)
    assert sum(values["outcome_evidence"].values()) == len(selected) == sum(len(m["records"]) for m in _ext(bundle)["deals"].values())
    times = sorted(s["record"]["timestamp"] for s in selected)
    assert values["period"] == {"from": times[0], "to": times[-1], "temporal_provenance": "producer_asserted"}
    assert values["completeness"] == "not_asserted"
    # The counterparty copy withholds most bodies; the pay act's effect.status stays in its sealed header.
    assert values["outcome_evidence"]["effect.status:dispatched"] == 1
    assert values["outcome_evidence"]["withheld"] > 0
    assert reading["properties"]["values"] == "NOT_PRESENT"  # no asserted_result: computed by this page


def test_an_asserted_result_that_recomputes_is_shown_and_one_that_does_not_is_refused(bundle):
    stated = check(with_asserted_result(bundle))
    assert stated["state"] == "card" and stated["properties"]["values"] == "PASS"
    flipped = check(with_asserted_result(bundle, flip_bucket=("effect.status:dispatched", "effect.status:failed")))
    assert flipped["state"] == "mismatch" and flipped["values"] is None
    assert len(flipped["findings"]) == 1 and flipped["findings"][0].startswith("outcome_evidence: recomputed")
    extra = with_asserted_result(bundle)
    _ext(extra)["asserted_result"]["records_held_in_period"] = 23
    assert check(extra)["state"] == "mismatch"


# ---- the properties: FAIL, NOT_CHECKED and NOT_PRESENT ---------------------------------


def test_a_card_never_calls_a_signature_or_a_log_verified(bundle):
    props = check(bundle)["properties"]
    assert list(props) == list(PROPERTIES)
    for p in ("selection_record_signature", "history_log", "member_signatures", "member_logs"):
        assert props[p] == "NOT_CHECKED", p
    assert set(props.values()) <= {"PASS", "NOT_CHECKED", "NOT_PRESENT"}


def test_an_unsigned_stand_in_never_renders_as_a_history(bundle):
    for member in [bundle, *_ext(bundle)["deals"].values()]:
        for r in member["records"]:
            r.pop("signature")
    reading = check(bundle)
    assert reading["state"] == "invalid" and reading["values"] is None
    assert "selection_record_unsigned" in reading["findings"]
    assert all(f"deal_record_unsigned:{d}" in reading["findings"] for d in PICKED)
    assert reading["properties"]["selection_record_signature"] == "NOT_PRESENT"
    assert reading["properties"]["member_signatures"] == "NOT_PRESENT"


def test_a_history_without_checkpoints_never_renders(bundle):
    for member in [bundle, *_ext(bundle)["deals"].values()]:
        del member["checkpoint"]
    reading = check(bundle)
    assert reading["state"] == "invalid"
    assert reading["properties"]["history_log"] == "NOT_PRESENT" and reading["properties"]["member_logs"] == "NOT_PRESENT"


# ---- the not-shareable states, beyond the cut files -----------------------------------


def test_a_selected_deal_dropped_is_not_shareable(bundle):
    del _ext(bundle)["deals"][DEALS["floor"]]
    reading = check(bundle)
    assert reading["state"] == "not_shareable" and reading["findings"] == [f"deal_missing:{DEALS['floor']}"]
    assert reading["properties"]["membership"] == "FAIL"


def test_the_holders_own_copy_of_one_deal_spliced_in_is_not_shareable(bundle):
    keep = _ext(_load("history-keep"))["deals"][DEALS["closed"]]
    _ext(bundle)["deals"][DEALS["closed"]] = keep
    reading = check(bundle)
    assert reading["state"] == "not_shareable"
    closed = DEALS["closed"]
    assert reading["findings"] == [
        f"deal_bundle_not_the_selected_one:{closed}",
        f"deal_audience_not_selected:{closed}",
        f"deal_audience_keep:{closed}",
    ]


def test_another_key_under_a_picked_deals_name_is_not_shareable(bundle):
    second = _ext(_load("mutant-mixed-signer"))["deals"][DEALS["second_profile"]]
    _ext(bundle)["deals"][DEALS["closed"]] = second
    reading = check(bundle)
    assert reading["state"] == "not_shareable"
    assert f"deal_signed_by_other_key:{DEALS['closed']}" in reading["findings"] and "deal_signers_differ" in reading["findings"]


# ---- what capsulectl verify catches by the seal, the page catches too ---------------------


def test_the_carried_selection_edited_is_not_sealed(bundle):
    _ext(bundle)["selection"] = _ext(bundle)["selection"][:2]
    reading = check(bundle)
    assert reading["findings"][0] == "selection_not_sealed" and reading["state"] != "card"


def test_the_sealed_selection_edited_does_not_match_its_seal(bundle):
    sealed = sealed_selection(bundle)
    sealed["selection"] = sealed["selection"][:2]
    _ext(bundle)["selection"] = copy.deepcopy(sealed["selection"])
    reading = check(bundle)
    assert reading["findings"][0] == "selection_record_unverified" and reading["state"] != "card"


def test_an_empty_selection_is_missing(bundle):
    sealed_selection(bundle)["selection"] = []
    _ext(bundle)["selection"] = []
    assert "selection_missing" in recompute_errors(bundle)


def test_a_nested_record_edited_is_caught_by_its_id_and_its_deals_digest(bundle):
    member = _ext(bundle)["deals"][DEALS["closed"]]
    member["records"][0]["timestamp"] = "2026-01-01T00:00:00Z"
    closed = DEALS["closed"]
    assert recompute_errors(bundle) == [f"deal_bundle_not_the_selected_one:{closed}", f"deal_record_id_mismatch:{closed}"]


def test_a_nested_disclosure_edited_is_caught(bundle):
    member = _ext(bundle)["deals"][DEALS["closed"]]
    cid, entry = next((k, v) for k, v in member["disclosures"].items() if "agent_input" in v)
    entry["agent_input"]["body"]["edited"] = True
    closed = DEALS["closed"]
    assert recompute_errors(bundle) == [f"deal_bundle_not_the_selected_one:{closed}", f"deal_disclosure_mismatch:{closed}"]


# ---- forward compatibility: fields a later #209 may add -------------------------------------


def _digest(value) -> str:
    return hashlib.sha256(jcs(value)).hexdigest()


def _reseal(b: dict, edit) -> dict:
    """*b* with its sealed selection edited by *edit* and the selection record
    re-sealed over it: agent_input_digest, capsule id, disclosure key, root and
    selection_record follow. (The signature no longer matches; this page does
    not check one, capsulectl verify would.)"""
    ext = _ext(b)
    old = ext["selection_record"]
    sealed = b["disclosures"].pop(old)
    edit(sealed["agent_input"])
    record = next(r for r in b["records"] if r["capsule_id"] == old)
    record["model_attestation"]["compute_attestation"]["agent_input_digest"] = _digest(sealed["agent_input"])
    record["capsule_id"] = _digest({k: v for k, v in record.items() if k not in ("capsule_id", "signature", "key_id")})
    b["disclosures"][record["capsule_id"]] = sealed
    b["root"] = ext["selection_record"] = record["capsule_id"]
    return b


RECIPIENT = "recipient-not-shown-7f3a"


def _with_future_fields(sealed: dict) -> None:
    sealed["recipient"] = RECIPIENT
    for i, entry in enumerate(sealed["selection"]):
        entry["steps_after_checkpoint"] = i + 2


def test_a_recipient_and_steps_after_checkpoint_do_not_break_the_parse(bundle):
    b = _reseal(bundle, _with_future_fields)
    _ext(b)["selection"] = copy.deepcopy(sealed_selection(b)["selection"])
    reading = check(b)
    assert reading["state"] == "card", reading["findings"]
    assert reading["findings"] == []
    assert reading["values"]["selected_count"] == 3
    assert reading["values"] == check(_history())["values"]
    # Not displayed: neither field reaches what the page draws from.
    shown = json.dumps(reading)
    assert RECIPIENT not in shown and "recipient" not in shown and "steps_after_checkpoint" not in shown


def test_the_carried_selection_is_still_compared_entry_for_entry_with_the_future_fields(bundle):
    # The sealed entries carry steps_after_checkpoint; the carried ones do not: not the sealed selection.
    b = _reseal(bundle, _with_future_fields)
    reading = check(b)
    assert reading["findings"] == ["selection_not_sealed"] and reading["state"] == "invalid"
    # One entry's extra field differs: still not the sealed selection.
    b = _reseal(_history(), _with_future_fields)
    _ext(b)["selection"] = copy.deepcopy(sealed_selection(b)["selection"])
    _ext(b)["selection"][0]["steps_after_checkpoint"] = 99
    assert check(b)["findings"] == ["selection_not_sealed"]


def test_a_file_with_no_selection_block_is_not_a_history(bundle):
    del bundle["extensions"][SELECTION_EXTENSION]
    reading = check(bundle)
    assert reading["state"] == "invalid" and set(reading["properties"].values()) == {"NOT_PRESENT"}


# ---- the byte scan ------------------------------------------------------------------------

PRIVATE = [v for values in CUT["private_values"].values() for v in values]


@pytest.mark.parametrize("name", ["history-counterparty", "history-adjudicator"])
def test_a_shareable_history_carries_none_of_the_floor_address_or_contact_strings(name):
    raw = (DATA / f"{name}.bundle.json").read_bytes()
    hits = {v: raw.count(v.encode("utf-8")) for v in PRIVATE if raw.count(v.encode("utf-8"))}
    assert hits == {}


def test_the_byte_scan_finds_them_in_the_keep_copy():
    # The scan's control: the keep History of the same deals carries them.
    raw = (DATA / "history-keep.bundle.json").read_bytes()
    for kind in ("address", "card", "code", "floor"):
        assert any(raw.count(v.encode("utf-8")) for v in CUT["private_values"][kind]), kind


# ---- the manifest sketch -------------------------------------------------------

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
    assert SKETCH_JSON["executable"]["carrier"] == "module-slot"
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


def test_each_viewer_module_forbids_the_selection_extension_and_needs_to():
    # Each receipt manifest and the Rules manifest forbids x-history-selection/v0, and so
    # none co-matches the sketch. Without that one token each would, and the registry
    # refuses an ambiguous pair. Forbids, never priority.
    manifests = _viewer_specific_manifests()
    assert all(SELECTION_EXTENSION in m["forbids"]["extensions"] for m in manifests.values())
    assert sorted(n for n, m in manifests.items() if co_matchable(SKETCH_JSON, m)) == []
    unpatched = {}
    for name, m in manifests.items():
        bare = copy.deepcopy(m)
        bare["forbids"]["extensions"].remove(SELECTION_EXTENSION)
        unpatched[name] = bare
    assert sorted(n for n, m in unpatched.items() if co_matchable(SKETCH_JSON, m)) == [
        "manifest-bilateral",
        "manifest-seller",
        "manifest-unilateral",
        "rules",
    ]
