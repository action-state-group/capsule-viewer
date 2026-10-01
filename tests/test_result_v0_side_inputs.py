# SPDX-License-Identifier: Apache-2.0
"""The synthetic inputs in ``examples/result-v0/`` for the coverage and
obligation data (contract, register, and the Result carrying its coverage
report): the committed JSON is exactly what ``build_side_inputs.py`` builds,
they describe the contract the example Result cites, the Result is the
example Result plus its coverage report and nothing else, and the side
inputs travel byte-for-byte in a ``result/v0`` entry.

What the coverage-and-gaps and obligation data say about them is pinned in
``js-tests/result_v0_panels.test.js``.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from capsule_viewer import build_payload, encode_fragment, render_base_viewer_html
from capsule_viewer.result_v0 import build_result_entry

EXAMPLE_DIR = Path(__file__).resolve().parent.parent / "examples" / "result-v0"


def _load(name: str, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, EXAMPLE_DIR / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = _load("build_side_inputs.py", "result_v0_side_inputs_build")
INPUTS = builder.side_inputs()


def _committed(name: str) -> dict:
    return json.loads((EXAMPLE_DIR / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", sorted(INPUTS))
def test_committed_side_input_matches_the_builder(name):
    assert (EXAMPLE_DIR / name).read_text(encoding="utf-8") == builder.serialize(INPUTS[name])


def test_side_inputs_describe_the_results_contract():
    result = _committed("release-approval-result-with-coverage.json")
    contract = _committed("release-approval-contract.json")
    report = result["coverage_report"]
    contract_ref = f"{contract['id']}@{contract['version']}"
    assert {c["contract_ref"] for c in result["claims"]} == {contract_ref}
    assert report["contract_ref"] == contract_ref
    requirement_ids = [r["id"] for r in contract["requirements"]]
    assert {c["requirement_ref"] for c in result["claims"]} == set(requirement_ids)
    assert [r["requirement_ref"] for r in report["requirements"]] == requirement_ids
    for row, requirement in zip(report["requirements"], contract["requirements"], strict=True):
        assert row["obligation_refs"] == requirement.get("obligation_refs", [])


def test_result_with_coverage_is_the_example_plus_its_report():
    with_coverage = _committed("release-approval-result-with-coverage.json")
    without = dict(with_coverage)
    del without["coverage_report"]
    assert without == _committed("release-approval-result.json")


def test_coverage_report_counts_producers_not_records():
    rows = {r["requirement_ref"]: r for r in _committed("release-approval-result-with-coverage.json")["coverage_report"]["requirements"]}
    risk = rows["change_risk_assessed_correctly"]
    assert risk["independence"] == {"correlated_records": 11, "independent_producers": 1, "met": False, "required_producers": 2}
    assert [g["kind"] for g in risk["gaps"]] == ["missing_source", "correlated_only"]
    assert rows["deployment_observed"]["independence"]["independent_producers"] == 2


def test_side_inputs_say_they_are_synthetic():
    register = _committed("release-approval-register.json")
    assert register["register_id"].startswith("example/")
    assert all("(synthetic)" in row["source"] for row in register["rows"])


def test_side_inputs_travel_in_the_entry_and_the_artifact():
    result = _committed("release-approval-result-with-coverage.json")
    contract = _committed("release-approval-contract.json")
    register = _committed("release-approval-register.json")
    entry = build_result_entry(result, contract=contract, register=register, strict=True)
    assert entry["contract"] == contract
    assert entry["register"] == register
    assert entry["record"]["coverage_report"] == result["coverage_report"]
    html = render_base_viewer_html(encode_fragment(build_payload([entry])))
    assert "CapsuleViewerResultPanels" in html


def test_absent_side_inputs_add_no_keys():
    entry = build_result_entry(_committed("release-approval-result.json"))
    assert not {"contract", "register"} & set(entry)
