# SPDX-License-Identifier: Apache-2.0
"""The synthetic side inputs in ``examples/result-v0/`` (contract, register,
coverage): the committed JSON is exactly what ``build_side_inputs.py``
builds, they describe the same contract the example Result cites, and they
travel byte-for-byte in a ``result/v0`` entry.

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
    result = _committed("release-approval-result.json")
    contract = _committed("release-approval-contract.json")
    coverage = _committed("release-approval-coverage.json")
    contract_ref = f"{contract['id']}@{contract['version']}"
    assert {c["contract_ref"] for c in result["claims"]} == {contract_ref}
    assert coverage["contract_ref"] == contract_ref
    requirement_ids = [r["id"] for r in contract["requirements"]]
    assert {c["requirement_ref"] for c in result["claims"]} == set(requirement_ids)
    assert [r["requirement_ref"] for r in coverage["requirements"]] == requirement_ids


def test_side_inputs_say_they_are_synthetic():
    register = _committed("release-approval-register.json")
    assert register["register_id"].startswith("example/")
    assert all("(synthetic)" in row["source"] for row in register["rows"])


def test_side_inputs_travel_in_the_entry_and_the_artifact():
    result = _committed("release-approval-result.json")
    contract = _committed("release-approval-contract.json")
    register = _committed("release-approval-register.json")
    coverage = _committed("release-approval-coverage.json")
    entry = build_result_entry(result, contract=contract, register=register, coverage=coverage, strict=True)
    assert entry["contract"] == contract
    assert entry["register"] == register
    assert entry["coverage"] == coverage
    html = render_base_viewer_html(encode_fragment(build_payload([entry])))
    assert "CapsuleViewerResultPanels" in html


def test_absent_side_inputs_add_no_keys():
    entry = build_result_entry(_committed("release-approval-result.json"))
    assert not {"contract", "register", "coverage"} & set(entry)
