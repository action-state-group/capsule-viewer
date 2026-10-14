# SPDX-License-Identifier: Apache-2.0
"""The History Card design (docs/design/history-card.md) against real
Histories: capsulectl ``deal history`` wrote every file under
``tests/testdata/history/`` (``examples/history/cut_fixtures.sh``) and
``verify/<name>.json`` is what ``capsulectl verify --bundle`` printed for it.
The check here (``capsule_viewer.history.recompute``) names what capsulectl
names, shows a card only for a shareable History (audience ``history``), shows
outcome and action class as not proven, as capsulectl does, and never calls a
signature, checkpoint or log membership verified. The manifest sketch is checked against
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


# What the file-only check finds in each real file (the mutant matrix), cut from
# 88503f9: the history History renders the card; the keep History is VALID but
# never one to send; each mutant of the history History is named as capsulectl
# names it. capsulectl refuses a History of counterparty or adjudicator copies
# (refused/<audience>.txt): those are in-memory edits below.
CLOSED, PRIVATE_DEAL, FLOOR = DEALS["closed"], DEALS["private"], DEALS["floor"]
KEEP = ["history_audience_keep"] + [f"deal_audience_keep:{d}" for d in PICKED]
MATRIX = {
    "history-history": ("card", []),
    "history-keep": ("not_shareable", KEEP),
    "history-two-buyers": ("card", []),
    "history-two-buyers-keep": ("not_shareable", ["history_audience_keep"] + [f"deal_audience_keep:{d}" for d in sorted([DEALS["sale_a"], DEALS["sale_b"]])]),
    "mutant-flipped-status": ("invalid", [f"deal_bundle_not_the_selected_one:{CLOSED}", f"deal_record_id_mismatch:{CLOSED}", f"deal_invalid:{CLOSED}"]),
    "mutant-mixed-signer": ("not_shareable", [f"deal_not_in_selection:{DEALS['second_profile']}", "deal_signers_differ"]),
    "mutant-not-in-selection": ("not_shareable", [f"deal_not_in_selection:{DEALS['other']}"]),
    "mutant-selection-not-root": ("invalid", ["selection_record_not_root"]),
    "mutant-not-history-log": ("invalid", ["not_a_history_log"]),
    "mutant-payload-disclosed": ("invalid", [f"deal_bundle_not_the_selected_one:{CLOSED}", f"deal_payload_disclosed:{CLOSED}"]),
    "mutant-counterparty-member": ("invalid", [f"deal_bundle_not_the_selected_one:{PRIVATE_DEAL}", f"deal_audience_not_selected:{PRIVATE_DEAL}", f"deal_payload_disclosed:{PRIVATE_DEAL}"]),
    "mutant-audience-not-history": ("invalid", ["selection_audience_not_history", *(f"deal_audience_not_selected:{d}" for d in PICKED)]),
    "mutant-wrong-nonce": ("invalid", ["not_a_history_log"]),
    "mutant-recipient-missing": ("invalid", ["selection_recipient_missing"]),
    "mutant-steps-negative": ("invalid", [f"selection_entry_malformed:{FLOOR}", f"deal_not_in_selection:{FLOOR}"]),
    "mutant-steps-not-integer": ("invalid", [f"selection_entry_malformed:{FLOOR}", f"deal_not_in_selection:{FLOOR}"]),
}
# The mutants that edit the outer bundle's root or log id (everything else about them is as cut).
OUTER_EDITS = {"mutant-selection-not-root", "mutant-not-history-log", "mutant-wrong-nonce"}
# The mutants whose sealed selection is re-sealed (make_mutants.py).
RESEALED = {"mutant-audience-not-history", "mutant-recipient-missing", "mutant-steps-negative", "mutant-steps-not-integer"}
# What capsulectl verify finds that this page cannot: a signature that does not
# verify (the page checks no signature; NOT_CHECKED). The re-sealed selection
# record keeps its old signature.
SIGNATURE_ONLY = {name: {"selection_record_unsigned"} for name in RESEALED}


def _load(name: str) -> dict:
    return json.loads((DATA / f"{name}.bundle.json").read_text(encoding="utf-8"))


def _verify(name: str) -> dict:
    report = json.loads((DATA / "verify" / f"{name}.json").read_text(encoding="utf-8"))
    (entry,) = [e for e in report["extensions"] if e.get("kind") == SELECTION_EXTENSION]
    return {"verdict": report["verdict"], **entry}


def _history() -> dict:
    """The history History, as capsulectl wrote it: the shareable baseline."""
    return _load("history-history")


@pytest.fixture
def bundle() -> dict:
    return _history()


def _ext(b: dict) -> dict:
    return b["extensions"][SELECTION_EXTENSION]


# ---- the fixtures are real, and say where they came from ---------------------------


def test_the_readme_names_the_capsule_cli_commit_the_fixtures_were_cut_from():
    text = (DATA / "README.md").read_text(encoding="utf-8")
    commit = CUT["producer_commit"]
    assert re.fullmatch(r"[0-9a-f]{40}", commit), "cut.json names the producer commit as a full SHA"
    assert commit == "88503f966ce85c40e01705f37c9ef734678cfd59"
    assert re.search(r"capsule-cli\s+`" + commit + "`", text), "the README names cut.json's producer commit, full SHA"
    design = (HERE.parent / "docs" / "design" / "history-card.md").read_text(encoding="utf-8")
    assert re.search(r"capsule-cli\s+`" + commit + "`", design), "the design's producer row names cut.json's producer commit"
    assert "stand-in" not in text.lower()
    assert "ff8daad" not in text and "7ebf001" not in text and "521d41f" not in text and "993949f" not in text and "provisional" not in text.lower()


@pytest.mark.parametrize("audience", ["counterparty", "adjudicator"])
def test_the_producer_refuses_a_history_of_counterparty_or_adjudicator_copies(audience):
    text = (DATA / "refused" / f"{audience}.txt").read_text(encoding="utf-8")
    assert f"--audience {audience} is a copy of one deal for someone in it" in text
    assert text.rstrip().endswith("exit status: 2")
    assert not (DATA / f"history-{audience}.bundle.json").exists()


@pytest.mark.parametrize("name", ["no-recipient", "keep-with-recipient"])
def test_the_producer_requires_a_recipient_for_a_history_and_refuses_one_for_keep(name):
    text = (DATA / "refused" / f"{name}.txt").read_text(encoding="utf-8")
    expected = {
        "no-recipient": "deal history needs --to: who the History is for, as sealed in its selection record",
        "keep-with-recipient": "--to names who a History is for; --audience keep is your own copy, never one to send",
    }[name]
    assert expected in text
    assert text.rstrip().endswith("exit status: 2")


def test_every_file_is_a_history_bundle_of_its_own_log():
    nonces = set()
    for name in MATRIX:
        if name in RESEALED:
            continue  # its sealed selection is re-sealed (make_mutants.py); the rest is as below
        b = _load(name)
        assert b["bundle_kind"] == "evidence-bundle/v2"
        ext = _ext(b)
        sealed = sealed_selection(b)
        # D4: the History's own log, deal-history/ and the 64-hex nonce its selection record seals.
        assert re.fullmatch(r"[0-9a-f]{64}", sealed["nonce"])
        nonces.add(sealed["nonce"])
        if name not in OUTER_EDITS:
            assert b["completeness_certificate"]["log_id"] == b["checkpoint"]["log_id"] == f"deal-history/{sealed['nonce']}"
            assert b["root"] == ext["selection_record"]
        assert set(ext) == {"selection_record", "selection", "deals"}
        record = next(r for r in b["records"] if r["capsule_id"] == ext["selection_record"])
        assert record["action_id"] == "capsulectl-deal-history"
        # D2: a recipient for audience history, none for keep.
        keep = sealed["audience"] == "keep"
        assert set(sealed) == {"type", "profile", "audience", "nonce", "selection"} | (set() if keep else {"recipient"})
        assert (sealed["type"], sealed["profile"]) == ("history_selection", SELECTION_EXTENSION)
        # D3: each entry states the deal's steps after its copy's checkpoint, a JSON integer >= 0.
        for entry in sealed["selection"]:
            assert set(entry) == {"deal_id", "bundle_digest", "steps_after_checkpoint"}
            assert re.fullmatch(r"deal-[0-9a-f]{16}", entry["deal_id"]) and re.fullmatch(r"[0-9a-f]{64}", entry["bundle_digest"])
            assert type(entry["steps_after_checkpoint"]) is int and entry["steps_after_checkpoint"] >= 0
    # Each History is on a log of its own.
    assert len({_load(n)["completeness_certificate"]["log_id"] for n in ("history-history", "history-keep", "history-two-buyers", "history-two-buyers-keep")}) == 4


def test_the_floor_deal_has_a_step_after_its_checkpoint_and_says_so():
    # The cut writes one message on the floor deal after its latest checkpoint: no copy shows it,
    # its selection entry seals steps_after_checkpoint 1, and capsulectl verify reports it (VALID).
    for name in ("history-history", "history-keep"):
        steps = {e["deal_id"]: e["steps_after_checkpoint"] for e in sealed_selection(_load(name))["selection"]}
        assert steps == {CLOSED: 0, PRIVATE_DEAL: 0, FLOOR: 1}
        assert _verify(name)["verdict"] == "VALID"
        assert _hits(name, CUT["later_step"]["text"]) == {}
    assert CUT["later_step"]["deal"] == FLOOR


@pytest.mark.parametrize("name", sorted(MATRIX))
def test_the_page_names_what_capsulectl_verify_names(name):
    reading, verified = check(_load(name)), _verify(name)
    state, findings = MATRIX[name]
    assert reading["state"] == state
    assert reading["findings"] == findings
    # capsulectl's findings are the page's, but for a signature the page does not check
    # (the page adds only the keep marker and the record-level reason a copy is INVALID).
    assert set(verified["findings"]) - SIGNATURE_ONLY.get(name, set()) <= set(reading["findings"])
    assert (verified["verdict"] == "VALID") == (not verified["findings"])
    assert reading["holder_key"] == verified["holder_key"]
    assert reading["audience"] == verified["audience"]
    assert reading["signer_keys"] == verified["signer_keys"]
    # D2/D3: the holder's statements, derived by the page as verify derives them.
    assert reading["holder_stated"] == verified["holder_stated"] == ["recipient", "steps_after_checkpoint"]
    assert reading["recipient"] == verified.get("recipient", "")
    assert [(d["deal_id"], d["steps_after_checkpoint"]) for d in reading["deals"]] == [
        (d["deal_id"], d["steps_after_checkpoint"]) for d in verified["deals"]
    ]
    # not_proven, derived by the page from the withheld payloads, is verify's field exactly.
    assert reading["not_proven"] == verified.get("not_proven", [])
    # A card only for a file capsulectl passes and whose audience is "history".
    assert (state == "card") == (verified["verdict"] == "VALID" and verified["audience"] == "history")


def test_a_history_does_not_prove_outcome_or_action_class(bundle):
    reading = check(bundle)
    assert reading["state"] == "card"
    assert reading["not_proven"] == ["outcome", "action_class"] == _verify("history-history")["not_proven"]
    # Every selected record's payload is withheld; nothing is read from one.
    assert all(s["agent_input"] is None for s in selected_records(bundle))
    assert set(reading["values"]) == {"period", "selected_count", "effect_status", "completeness"}
    # The keep History discloses them: verify says nothing is unproven, and so does the page.
    assert check(_load("history-keep"))["not_proven"] == [] and "not_proven" not in _verify("history-keep")


@pytest.mark.parametrize("audience", ["counterparty", "adjudicator"])
def test_a_history_for_a_refused_audience_does_not_check(audience):
    # capsulectl refuses to write these; re-sealed in memory, the page fails them as verify does.
    reading = check(with_audience(_history(), audience))
    assert reading["state"] == "invalid" and reading["values"] is None
    assert reading["findings"] == ["selection_audience_not_history"]
    assert reading["properties"]["audience"] == "FAIL"
    assert reading["not_proven"] == []
    # The sealed audience alone, the copies left as history copies: each copy is named too.
    one = reseal_selection(_history(), lambda sealed: sealed.update(audience=audience))
    assert check(one)["state"] == "invalid"
    assert check(one)["findings"] == ["selection_audience_not_history", *(f"deal_audience_not_selected:{d}" for d in PICKED)]


def test_a_keep_history_is_valid_and_never_shareable():
    assert _verify("history-keep")["verdict"] == "VALID" and _verify("history-keep")["audience"] == "keep"
    reading = check(with_audience(_history(), "keep"))
    assert reading["state"] == "not_shareable" and reading["findings"] == KEEP


def test_a_member_that_discloses_a_payload_does_not_check(bundle):
    # In memory, the digest kept right: only deal_payload_disclosed remains.
    member = _ext(_load("history-keep"))["deals"][CLOSED]
    record_id, disclosed = next((k, v) for k, v in member["disclosures"].items() if v)
    _ext(bundle)["deals"][CLOSED].setdefault("disclosures", {})[record_id] = disclosed

    def edit(sealed: dict) -> None:
        for e in sealed["selection"]:
            if e["deal_id"] == CLOSED:
                e["bundle_digest"] = hashlib.sha256(jcs(_ext(bundle)["deals"][CLOSED])).hexdigest()

    b = reseal_selection(bundle, edit)
    reading = check(b)
    assert reading["state"] == "invalid" and reading["findings"] == [f"deal_payload_disclosed:{CLOSED}"]


def test_the_selection_record_must_be_the_root_and_the_log_its_own():
    root = check(_load("mutant-selection-not-root"))
    assert root["properties"]["selection_root"] == "FAIL" and root["values"] is None
    log = check(_load("mutant-not-history-log"))
    assert log["properties"]["history_log"] == "FAIL" and log["values"] is None
    nonce = check(_load("mutant-wrong-nonce"))
    assert nonce["properties"]["history_log"] == "FAIL" and nonce["values"] is None
    assert check(_history())["properties"]["selection_root"] == "PASS"
    assert root["state"] == log["state"] == nonce["state"] == "invalid"
    # The same checks in memory: the checkpoint's log id, the fixed "deal-history" of earlier
    # heads, a sealed nonce that is not 64 hex (re-sealed), and a missing root.
    for log_id in (DEALS["closed"], "deal-history"):
        b = _history()
        b["checkpoint"]["log_id"] = log_id
        assert check(b)["findings"] == ["not_a_history_log"]
    b = _history()
    short = sealed_selection(b)["nonce"][:-2]

    def shorten(sealed: dict) -> None:
        sealed["nonce"] = short

    b = _reseal(b, shorten)
    for part in ("checkpoint", "completeness_certificate"):
        b[part]["log_id"] = f"deal-history/{short}"
    assert check(b)["findings"] == ["not_a_history_log"]
    b = _history()
    del b["root"]
    assert check(b)["findings"] == ["selection_record_not_root"]


def test_signers_are_the_holder_key_or_a_second_profiles_key():
    assert _verify("history-history")["signer_keys"] == {CUT["holder_key"]: PICKED}
    signers = check(_load("mutant-mixed-signer"))["signer_keys"]
    assert signers == {CUT["holder_key"]: PICKED, CUT["second_key"]: [DEALS["second_profile"]]}


# ---- the values ---------------------------------------------------------------------


def test_the_values_are_computed_from_the_selected_deals(bundle):
    reading = check(bundle)
    values = reading["values"]
    selected = selected_records(bundle)
    assert values["selected_count"] == 3 == len(_ext(bundle)["selection"])
    assert {s["deal"] for s in selected} == set(PICKED)
    assert len(selected) == sum(len(m["records"]) for m in _ext(bundle)["deals"].values())
    times = sorted(s["record"]["timestamp"] for s in selected)
    assert values["period"] == {"from": times[0], "to": times[-1], "temporal_provenance": "producer_asserted"}
    assert values["completeness"] == "not_asserted"
    # A history copy withholds every payload; the pay act's effect.status stays in its capsule.
    assert values["effect_status"] == {"dispatched": 1}
    assert sum(values["effect_status"].values()) == sum(1 for s in selected if (s["record"].get("effect") or {}).get("status"))
    assert reading["properties"]["values"] == "NOT_PRESENT"  # no asserted_result: computed by this page


def test_an_asserted_result_that_recomputes_is_shown_and_one_that_does_not_is_refused(bundle):
    stated = check(with_asserted_result(bundle))
    assert stated["state"] == "card" and stated["properties"]["values"] == "PASS"
    flipped = check(with_asserted_result(bundle, flip_status=("dispatched", "failed")))
    assert flipped["state"] == "mismatch" and flipped["values"] is None
    assert len(flipped["findings"]) == 1 and flipped["findings"][0].startswith("effect_status: recomputed")
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


def test_the_holders_own_copy_of_one_deal_spliced_in_does_not_check(bundle):
    # capsule-cli TestDealHistoryNamesACopyForAnotherAudience: the same three findings.
    keep = _ext(_load("history-keep"))["deals"][CLOSED]
    _ext(bundle)["deals"][CLOSED] = keep
    reading = check(bundle)
    assert reading["state"] == "invalid"
    assert reading["findings"] == [
        f"deal_bundle_not_the_selected_one:{CLOSED}",
        f"deal_audience_not_selected:{CLOSED}",
        f"deal_audience_keep:{CLOSED}",
        f"deal_payload_disclosed:{CLOSED}",
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
    member = _ext(bundle)["deals"][CLOSED]
    member["records"][0]["timestamp"] = "2026-01-01T00:00:00Z"
    assert recompute_errors(bundle) == [
        f"deal_bundle_not_the_selected_one:{CLOSED}", f"deal_record_id_mismatch:{CLOSED}", f"deal_invalid:{CLOSED}",
    ]


def test_a_nested_disclosure_edited_is_caught():
    # The keep History discloses payloads; one edited no longer matches its digest.
    bundle = _load("history-keep")
    member = _ext(bundle)["deals"][CLOSED]
    cid, entry = next((k, v) for k, v in member["disclosures"].items() if "agent_input" in v)
    entry["agent_input"]["body"]["edited"] = True
    expected = ["history_audience_keep"]
    for d in PICKED:
        if d == CLOSED:
            expected += [f"deal_bundle_not_the_selected_one:{d}", f"deal_audience_keep:{d}", f"deal_disclosure_mismatch:{d}", f"deal_invalid:{d}"]
        else:
            expected.append(f"deal_audience_keep:{d}")
    assert recompute_errors(bundle) == expected


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


def _carry(b: dict) -> dict:
    _ext(b)["selection"] = copy.deepcopy(sealed_selection(b)["selection"])
    return b


def test_the_holders_statements_are_read_and_never_checked(bundle):
    reading = check(bundle)
    assert reading["state"] == "card"
    assert reading["recipient"] == CUT["recipient"]["history-history"] == _verify("history-history")["recipient"]
    assert reading["holder_stated"] == ["recipient", "steps_after_checkpoint"]
    # Never a pass: what the holder states is checked against no deal.
    assert reading["properties"]["holder_stated"] == "NOT_CHECKED"
    assert {d["deal_id"]: d["steps_after_checkpoint"] for d in reading["deals"]} == {CLOSED: 0, PRIVATE_DEAL: 0, FLOOR: 1}
    # A keep History seals no recipient and needs none.
    keep = check(_load("history-keep"))
    assert keep["recipient"] == "" and "selection_recipient_missing" not in keep["findings"]
    assert keep["properties"]["holder_stated"] == "NOT_CHECKED"


@pytest.mark.parametrize("recipient", [None, "", "   ", 7])
def test_a_history_without_a_recipient_does_not_check(bundle, recipient):
    def edit(sealed: dict) -> None:
        if recipient is None:
            del sealed["recipient"]
        else:
            sealed["recipient"] = recipient

    reading = check(_reseal(bundle, edit))
    assert reading["findings"] == ["selection_recipient_missing"]
    assert reading["state"] == "invalid" and reading["values"] is None
    assert reading["properties"]["holder_stated"] == "FAIL"


@pytest.mark.parametrize("steps", [-1, 1.5, "1", True, None, 2**53])
def test_a_malformed_steps_after_checkpoint_is_a_malformed_entry(bundle, steps):
    def edit(sealed: dict) -> None:
        (entry,) = [e for e in sealed["selection"] if e["deal_id"] == FLOOR]
        if steps is None:
            del entry["steps_after_checkpoint"]
        else:
            entry["steps_after_checkpoint"] = steps

    if steps in (1.5, 2**53):
        # No JCS form here for a float or an integer past 2**53 - 1, so neither can be re-sealed:
        # set in place, sealed and carried alike.
        b = bundle
        for selection in (sealed_selection(b)["selection"], _ext(b)["selection"]):
            next(e for e in selection if e["deal_id"] == FLOOR)["steps_after_checkpoint"] = steps
    else:
        b = _carry(_reseal(bundle, edit))
    reading = check(b)
    assert f"selection_entry_malformed:{FLOOR}" in reading["findings"]
    assert f"deal_not_in_selection:{FLOOR}" in reading["findings"]
    assert reading["state"] == "invalid" and reading["values"] is None
    assert reading["properties"]["holder_stated"] == "FAIL"


def test_unknown_fields_do_not_break_the_parse_and_are_never_shown(bundle):
    marker = "unknown-field-not-shown-7f3a"

    def edit(sealed: dict) -> None:
        sealed["x_later_field"] = marker
        for entry in sealed["selection"]:
            entry["x_later_field"] = marker

    b = _carry(_reseal(bundle, edit))
    reading = check(b)
    assert reading["state"] == "card", reading["findings"]
    assert reading["values"] == check(_history())["values"]
    assert marker not in json.dumps(reading) and "x_later_field" not in json.dumps(reading)


def test_the_carried_selection_is_compared_entry_for_entry_steps_included(bundle):
    # One entry's steps_after_checkpoint differs in the carried copy: not the sealed selection.
    _ext(bundle)["selection"][0]["steps_after_checkpoint"] = 99
    assert check(bundle)["findings"] == ["selection_not_sealed"]
    b = _history()
    del _ext(b)["selection"][0]["steps_after_checkpoint"]
    assert check(b)["findings"] == ["selection_not_sealed"]


def test_a_file_with_no_selection_block_is_not_a_history(bundle):
    del bundle["extensions"][SELECTION_EXTENSION]
    reading = check(bundle)
    assert reading["state"] == "invalid" and set(reading["properties"].values()) == {"NOT_PRESENT"}


# ---- the byte scans --------------------------------------------------------------------

PRIVATE = [v for values in CUT["private_values"].values() for v in values]


def _hits(name: str, values: list[str]) -> dict[str, int]:
    raw = (DATA / f"{name}.bundle.json").read_bytes()
    return {v: raw.count(v.encode("utf-8")) for v in values if raw.count(v.encode("utf-8"))}


def test_the_history_copy_carries_none_of_the_floor_address_or_contact_strings():
    assert _hits("history-history", PRIVATE) == {}
    # Nor the step written after the floor deal's checkpoint (in no copy at all).
    assert _hits("history-history", CUT["later_step"]["text"]) == {}


def test_the_byte_scan_finds_them_in_the_keep_copy():
    # The scan's control: the keep History of the same deals carries them.
    for kind in ("address", "card", "code", "contact", "floor"):
        assert _hits("history-keep", CUT["private_values"][kind]), kind


BUYER_A = CUT["buyer_a"]


def test_a_history_sent_to_buyer_b_carries_nothing_of_buyer_a():
    # Two buyers of one seller (capsule-cli TestDealHistoryForAnotherBuyerCarriesNothingOfTheFirst):
    # the History of both sales, the one the seller sends to B, carries none of A's name, contact,
    # address, item, price or message text, nor B's own, nor the holder's other private values.
    assert sorted(BUYER_A) == ["address", "contact", "item", "message", "name", "price"]
    for kind, values in BUYER_A.items():
        assert _hits("history-two-buyers", values) == {}, kind
    for kind, values in CUT["buyer_b"].items():
        assert _hits("history-two-buyers", values) == {}, kind
    assert _hits("history-two-buyers", PRIVATE) == {}
    assert _verify("history-two-buyers")["verdict"] == "VALID"
    assert check(_load("history-two-buyers"))["state"] == "card"


def test_the_two_buyer_keep_control_carries_buyer_a():
    # As in capsule-cli's test, the keep copy carries A's name, address, item and price (its
    # deal report holds no contact or message text, in either copy).
    for kind in ("name", "address", "item", "price"):
        assert _hits("history-two-buyers-keep", BUYER_A[kind]), kind
    assert _verify("history-two-buyers-keep")["verdict"] == "VALID"
    assert _verify("history-two-buyers-keep")["audience"] == "keep"


# ---- the manifest sketch -------------------------------------------------------

SCHEMA = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
SKETCH_JSON = json.loads(SKETCH.read_text(encoding="utf-8"))
RECEIPT_MANIFESTS = {
    p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(RECEIPTS.glob("manifest-*.json"))
}
# The receipt modules' module-slot manifests (#27), written from the ones above.
MODULE_SLOT_MANIFESTS = {
    f"module-slot/{p.stem}": json.loads(p.read_text(encoding="utf-8")) for p in sorted((RECEIPTS / "module-slot").glob("manifest-*.json"))
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

    return {**RECEIPT_MANIFESTS, **MODULE_SLOT_MANIFESTS, "rules": rules_manifest(RECORD_KIND)}


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
        "module-slot/manifest-bilateral",
        "module-slot/manifest-seller",
        "module-slot/manifest-unilateral",
        "rules",
    ]
