# SPDX-License-Identifier: Apache-2.0
"""Reading ``capsulectl verify --bundle``'s report: the gate, the per-member
disclosure states and the assurance, as the verifier reported them."""
from __future__ import annotations

import copy

import pytest
from receipt_helpers import FIXTURES, load

from capsule_viewer.binding import commitment
from capsule_viewer.digest import bundle_digest
from capsule_viewer.verifier_report import GATE_CLAIMS, VerifierReportError, context_from_capsulectl


@pytest.mark.parametrize("name", FIXTURES)
def test_every_fixture_verifies(name):
    context, assurance = context_from_capsulectl(*load(name))
    assert context.verified
    assert assurance.witnesses == "withheld" and assurance.countersignatures == ()


@pytest.mark.parametrize("claim", GATE_CLAIMS)
def test_a_gate_claim_that_did_not_pass_fails_the_gate(claim):
    bundle, output = load("keep")
    output = copy.deepcopy(output)
    output[claim]["status"] = "withheld"
    assert not context_from_capsulectl(bundle, output)[0].verified


def test_a_verdict_other_than_valid_fails_the_gate():
    bundle, output = load("keep")
    output = copy.deepcopy(output)
    output["verdict"] = "INCOMPLETE"
    assert not context_from_capsulectl(bundle, output)[0].verified


def test_a_record_identity_that_did_not_pass_fails_the_gate():
    bundle, output = load("keep")
    output = copy.deepcopy(output)
    first = next(iter(output["record_identity"]))
    output["record_identity"][first] = "failed"
    assert not context_from_capsulectl(bundle, output)[0].verified


def test_a_disclosure_mismatch_fails_the_gate():
    bundle, output = load("keep")
    output = copy.deepcopy(output)
    output["disclosures"][0]["status"] = "disclosure_mismatch"
    assert not context_from_capsulectl(bundle, output)[0].verified


def test_disclosures_are_the_verifiers():
    bundle, output = load("counterparty")
    context, _ = context_from_capsulectl(bundle, output)
    for entry in output["disclosures"]:
        state = context.disclosures[entry["capsule_id"]][entry["member"]].state
        assert state == {"disclosure_match": "disclosed", "withheld": "withheld"}[entry["status"]]


def test_another_report_version_is_refused():
    bundle, output = load("keep")
    with pytest.raises(VerifierReportError):
        context_from_capsulectl(bundle, {**output, "spec_version": "capsule-cli-result/v2"})


def test_a_report_without_a_claim_is_refused():
    bundle, output = load("keep")
    output = copy.deepcopy(output)
    del output["witnesses"]
    with pytest.raises(VerifierReportError):
        context_from_capsulectl(bundle, output)


@pytest.mark.parametrize("name", FIXTURES)
def test_the_bundle_digest_agrees_with_capsulectl(name):
    """Cross-implementation: the digest capsulectl's Go code reported for each
    fixture is the one computed here."""
    bundle, output = load(name)
    assert bundle_digest(bundle) == output["bundle_digest"]


def test_an_edited_bundle_under_its_original_report_is_refused():
    """The forgery a cold review demonstrated: edit the sealed report's money
    line, forge the user's words and recompute the baseline's commitment to
    match, then present the edited bundle with the original report."""
    bundle, output = load("keep")
    bundle = copy.deepcopy(bundle)
    report = bundle["disclosures"][bundle["extensions"]["x-deal-v0"]["sealed_report"]]["agent_input"]["report"]
    report["money"]["text"] = "Paid $9,999.00"
    report["asked_opening"]["text"] = "Order ten cat stickers"
    baseline = bundle["disclosures"][report["asked_step"]]["agent_input"]["body"]
    baseline["intent"]["verbatim_commitment"] = commitment(report["asked_opening"]["nonce"], "Order ten cat stickers")
    with pytest.raises(VerifierReportError, match="not this one"):
        context_from_capsulectl(bundle, output)


def test_a_failed_claim_fails_the_gate_even_under_valid():
    bundle, output = load("keep")
    output = copy.deepcopy(output)
    output["producer_signatures"]["status"] = "fail"
    assert not context_from_capsulectl(bundle, output)[0].verified


def test_an_unknown_disclosure_status_is_refused_not_raised_raw():
    bundle, output = load("keep")
    output = copy.deepcopy(output)
    output["disclosures"][0]["status"] = "partly"
    with pytest.raises(VerifierReportError):
        context_from_capsulectl(bundle, output)


def test_the_assurance_carries_the_bound_digest():
    bundle, output = load("keep")
    assert context_from_capsulectl(bundle, output)[1].bundle_digest == output["bundle_digest"]


def _selected():
    return load("mesh-payer-selected")


def test_a_producer_selected_bundle_is_incomplete_not_failed():
    """capsulectl reads a selection INCOMPLETE (`selection_not_checkable`) and
    every other claim passes: the gate passes with the outcome `incomplete`,
    never `verified`."""
    context, _ = context_from_capsulectl(*_selected())
    assert context.verified
    assert context.verification.outcome == "incomplete"


@pytest.mark.parametrize(
    "edit",
    [
        lambda o: o["interval_coverage"].update(findings=["other_reason"]),
        lambda o: o["interval_coverage"].update(findings=["selection_not_checkable", "other_reason"]),
        lambda o: o["per_record_membership"].update(status="withheld"),
        lambda o: o["graph_closure"].update(status="fail"),
        lambda o: o["checkpoint"].update(status="fail"),
        lambda o: o["checkpoint"].update(status="withheld"),
        lambda o: o["producer_signatures"].update(status="withheld"),
        lambda o: o["record_identity"].update({next(iter(o["record_identity"])): "failed"}),
        lambda o: o["disclosures"][0].update(status="disclosure_mismatch"),
        lambda o: o.update(verdict="INVALID"),
    ],
)
def test_any_other_incomplete_or_failure_still_fails_the_gate(edit):
    bundle, output = _selected()
    output = copy.deepcopy(output)
    edit(output)
    assert not context_from_capsulectl(bundle, output)[0].verified


def test_a_valid_verdict_with_a_withheld_interval_still_fails_the_gate():
    bundle, output = _selected()
    output = copy.deepcopy(output)
    output["verdict"] = "VALID"
    assert not context_from_capsulectl(bundle, output)[0].verified


def test_a_composed_bundle_or_a_member_report_never_passes_as_a_selection():
    from capsule_viewer.verifier_report import context_from_bundle_report

    bundle, output = _selected()
    assert not context_from_bundle_report(bundle, output)[0].verified  # a member: no notice would show
    composed = copy.deepcopy(bundle)
    composed["extensions"]["composed/v1"] = {}
    report = {**output, "bundle_digest": bundle_digest(composed)}
    assert not context_from_capsulectl(composed, report)[0].verified
