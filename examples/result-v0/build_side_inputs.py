# SPDX-License-Identifier: Apache-2.0
"""Build the synthetic inputs that travel beside the example Result v0: the
Evidence Contract its claims were evaluated under, the obligation register
that contract cites, and a per-requirement source coverage statement.

They feed the card's "Coverage and gaps" and "Obligations" sections
(``static/result_v0_panels.js``). Everything is invented: the policy, its
clauses, the sources and the producers name nothing real.

    python examples/result-v0/build_side_inputs.py   # rewrite the JSON

``tests/test_result_v0_side_inputs.py`` fails if the committed JSON drifts
from what this script builds.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent


def _load_result_builder():
    spec = importlib.util.spec_from_file_location("result_v0_examples_build", HERE / "build_fixtures.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACT_REF = _load_result_builder().CONTRACT_REF
CONTRACT_ID, CONTRACT_VERSION = CONTRACT_REF.split("@")
POLICY = "Example Change Management Policy (synthetic)"


def build_contract() -> dict[str, Any]:
    return {
        "id": CONTRACT_ID,
        "version": CONTRACT_VERSION,
        "subject": {
            "job_type": "software-release",
            "population_selector": "releases cut in evaluation_period",
        },
        "requirements": [
            {
                "id": "change_risk_assessed_correctly",
                "profile": "quality",
                "statement": "the change's risk was assessed and the assessment fits the change",
                "evidence_requirements": {
                    "accepted_epistemic_types": ["HUMAN_REPORT", "SEMANTIC_JUDGMENT", "SYSTEM_OF_RECORD_FACT"],
                    "required_sources": ["risk-review-record", "change-diff", "second-reviewer-signoff"],
                },
                "obligation_refs": ["CM-4.2"],
            },
            {
                "id": "tests_passed_on_release_commit",
                "profile": "process",
                "statement": "the required test suite passed on the exact commit released",
                "required_sequence": ["tests-passed", "release-cut"],
                "evidence_requirements": {
                    "accepted_epistemic_types": ["OBSERVED_EVENT", "SYSTEM_OF_RECORD_FACT"],
                    "required_sources": ["ci-run-record"],
                },
                # The second reference is deliberately absent from the register:
                # the view must say so, not drop it.
                "obligation_refs": ["CM-5.1", "CM-7.1"],
            },
            {
                # Cites no obligation: shown under "unmapped", never dropped.
                "id": "deployment_observed",
                "profile": "process",
                "statement": "the release was observed deployed to production",
                "required_sequence": ["release-cut", "deployed"],
                "evidence_requirements": {
                    "accepted_epistemic_types": ["OBSERVED_EVENT"],
                    "required_sources": ["deploy-log", "release-record"],
                },
            },
            {
                "id": "release_notes_published",
                "profile": "process",
                "statement": "release notes were published for the release",
                "required_sequence": ["release-cut", "notes-published"],
                "evidence_requirements": {
                    "accepted_epistemic_types": ["OBSERVED_EVENT", "SYSTEM_OF_RECORD_FACT"],
                    "required_sources": ["docs-site-publication-log", "release-record"],
                },
                "obligation_refs": ["CM-6.3"],
            },
        ],
        "temporal": {"evaluation_period": "2026-09"},
        "consequence": {"class": "report", "rule_ref": "example-release-approval-report-v1"},
    }


def _row(row_id: str, article: str, statement: str, evidence_class: str) -> dict[str, Any]:
    return {
        "id": row_id,
        "statement": statement,
        "source": POLICY,
        "scope": "every production release",
        "owner": "release-engineering",
        "version": "2.0.0",
        "evidence_class": evidence_class,
        "effective_from": "2026-01-01",
        "clause": {"instrument": POLICY, "article": article, "effective_from": "2026-01-01"},
    }


def build_register() -> dict[str, Any]:
    return {
        "register_id": "example/change-management-register/2.0.0",
        "rows": [
            _row("CM-4.2", "§4.2 (Risk assessment)", "Every release carries a risk assessment reviewed by a second engineer.", "JUDGED"),
            _row("CM-5.1", "§5.1 (Release testing)", "The required test suite passes on the commit that is released.", "RULE"),
            _row("CM-6.3", "§6.3 (Release notes)", "Release notes are published no later than the release itself.", "DOC"),
        ],
    }


def _source(name: str, present: bool, epistemic_type: str, producer: str) -> dict[str, Any]:
    return {"source": name, "present": present, "epistemic_type": epistemic_type, "producer": producer}


def build_coverage() -> dict[str, Any]:
    """Per requirement: which required sources were connected for the period.
    Proposed v0 shape, to be agreed with the per-requirement coverage report."""
    return {
        "coverage_version": "v0",
        "contract_ref": CONTRACT_REF,
        "requirements": [
            {
                "requirement_ref": "change_risk_assessed_correctly",
                "sources": [
                    _source("risk-review-record", True, "HUMAN_REPORT", "review-tool"),
                    _source("change-diff", True, "SYSTEM_OF_RECORD_FACT", "review-tool"),
                    _source("second-reviewer-signoff", False, "HUMAN_REPORT", "review-tool"),
                ],
                "missing_sources": ["second-reviewer-signoff"],
                # Both present sources come from one producer: they agree with each
                # other because they share it -- correlation, not corroboration.
                "corroboration": {"independent_producers": 1, "same_producer_spans": 2},
            },
            {
                "requirement_ref": "tests_passed_on_release_commit",
                "sources": [_source("ci-run-record", True, "SYSTEM_OF_RECORD_FACT", "ci-service")],
                "missing_sources": [],
                "corroboration": {"independent_producers": 1, "same_producer_spans": 1},
            },
            {
                "requirement_ref": "deployment_observed",
                "sources": [
                    _source("deploy-log", True, "OBSERVED_EVENT", "hosting-provider"),
                    _source("release-record", True, "SYSTEM_OF_RECORD_FACT", "release-tool"),
                ],
                "missing_sources": [],
                "corroboration": {"independent_producers": 2, "same_producer_spans": 0},
            },
            {
                "requirement_ref": "release_notes_published",
                "sources": [
                    _source("docs-site-publication-log", False, "OBSERVED_EVENT", "docs-site"),
                    _source("release-record", True, "SYSTEM_OF_RECORD_FACT", "release-tool"),
                ],
                "missing_sources": ["docs-site-publication-log"],
                "corroboration": {"independent_producers": 1, "same_producer_spans": 0},
            },
        ],
    }


def side_inputs() -> dict[str, dict[str, Any]]:
    return {
        "release-approval-contract.json": build_contract(),
        "release-approval-register.json": build_register(),
        "release-approval-coverage.json": build_coverage(),
    }


def serialize(doc: dict[str, Any]) -> str:
    return json.dumps(doc, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    for name, doc in side_inputs().items():
        (HERE / name).write_text(serialize(doc), encoding="utf-8")
        print(HERE / name)


if __name__ == "__main__":
    main()
