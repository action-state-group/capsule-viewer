# SPDX-License-Identifier: Apache-2.0
"""Build the synthetic inputs for the example Result v0's coverage and
obligation data: the Evidence Contract its claims were evaluated under, the
obligation register that contract cites, and the Result again carrying its
coverage report (coverage-report/v0: per requirement, the sources found,
their producers' independence, and each gap with what would close it).

They feed the card's "Coverage and gaps" and "Obligations" sections
(``static/result_v0_panels.js``). Everything is invented: the policy, its
clauses, the sources and the producers name nothing real.

    python examples/result-v0/build_side_inputs.py   # rewrite the JSON

``tests/test_result_v0_side_inputs.py`` fails if the committed JSON drifts
from what this script builds.
"""
from __future__ import annotations

import hashlib
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


RESULT_BUILDER = _load_result_builder()
CONTRACT_REF = RESULT_BUILDER.CONTRACT_REF
JOBS = RESULT_BUILDER.JOBS
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
                    # Two parties must stand behind the assessment; both sources
                    # present come from one review tool, so they only correlate.
                    "independence": "2",
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


# Synthetic records per (requirement, source): one per release unless a
# release is listed as lacking it. (producer, backfilled releases, epistemic type)
SOURCES: dict[str, list[tuple[str, str | None, list[str], str]]] = {
    # (source, producer -- None when no record exists, backfilled releases, epistemic type)
    "change_risk_assessed_correctly": [
        ("risk-review-record", "review-tool", ["R-101", "R-102"], "HUMAN_REPORT"),
        ("change-diff", "review-tool", [], "SYSTEM_OF_RECORD_FACT"),
        ("second-reviewer-signoff", None, [], "HUMAN_REPORT"),
    ],
    "tests_passed_on_release_commit": [("ci-run-record", "ci-service", [], "SYSTEM_OF_RECORD_FACT")],
    "deployment_observed": [
        ("deploy-log", "hosting-provider", [], "OBSERVED_EVENT"),
        ("release-record", "release-tool", [], "SYSTEM_OF_RECORD_FACT"),
    ],
    "release_notes_published": [
        ("docs-site-publication-log", None, [], "OBSERVED_EVENT"),
        ("release-record", "release-tool", [], "SYSTEM_OF_RECORD_FACT"),
    ],
}

# The connector that would capture each missing source. The correlated-only
# gap names none, so it is counted in summary.gaps_without_remedy.
REMEDIES = {
    "second-reviewer-signoff": {"connector": "human_approval", "raises_to": "committed"},
    "docs-site-publication-log": {"connector": "native_emission", "raises_to": "observed"},
}

STATUS_ORDER = ("NOT_FOUND", "INSUFFICIENT", "UNKNOWN", "SATISFIED")
STATUS_TO_SUFFICIENCY = {"SATISFIED": "SATISFIED", "NOT_FOUND": "GAP", "INSUFFICIENT": "INSUFFICIENT", "UNKNOWN": "UNKNOWN"}


def _record_digest(source: str, release: str) -> str:
    return hashlib.sha256(f"synthetic-example:record:{source}:{release}".encode()).hexdigest()


def _requirement_row(requirement: dict[str, Any], claim_ids: list[str]) -> dict[str, Any]:
    """One coverage row, computed the way coverage-report/v0 defines it:
    producers are counted, not records -- records from one producer
    correlate, they do not corroborate."""
    ref = requirement["id"]
    need = int(requirement["evidence_requirements"].get("independence", "1"))
    sources, gaps, records = [], [], {}
    for source, producer, backfilled, epistemic_type in SOURCES[ref]:
        releases = JOBS if producer else []
        evidence = [{"digest": _record_digest(source, r), "digest_alg": "SHA-256"} for r in releases]
        for r in releases:
            records[_record_digest(source, r)] = producer
        sources.append(
            {
                "backfilled_count": len(backfilled),
                "contemporaneous_count": len(releases) - len(backfilled),
                "duplicates_collapsed": 0,
                "epistemic_type": epistemic_type,
                "evidence": evidence,
                "producer_count": 1 if releases else 0,
                "record_count": len(releases),
                "source": source,
                "status": "SATISFIED" if releases else "NOT_FOUND",
            }
        )
        if not releases:
            gaps.append(
                {
                    "detail": f"no record from source {source!r} is in the evaluated records",
                    "kind": "missing_source",
                    "remedy": REMEDIES.get(source),
                    "source": source,
                }
            )
    producers = set(records.values())
    independent = len(producers)
    met = independent >= need
    statuses = [s["status"] for s in sources]
    if not met and records:
        statuses.append("INSUFFICIENT")
        gaps.append(
            {
                "detail": (
                    f"the requirement asks for {need} independent producer(s); its {len(records)} record(s) "
                    f"come from {independent} producer(s) -- records from one producer correlate, they do not "
                    "corroborate; add a source another party produces"
                ),
                "kind": "correlated_only",
                "remedy": None,
            }
        )
    status = next(s for s in STATUS_ORDER if s in statuses)
    return {
        "claim_ids": claim_ids,
        "gaps": gaps,
        "independence": {
            "correlated_records": len(records) - independent,
            "independent_producers": independent,
            "met": met,
            "required_producers": need,
        },
        "obligation_refs": list(requirement.get("obligation_refs", [])),
        "requirement_ref": ref,
        "sources": sources,
        "status": status,
        "sufficiency": STATUS_TO_SUFFICIENCY[status],
    }


def build_coverage_report(result: dict[str, Any], contract: dict[str, Any]) -> dict[str, Any]:
    rows = [
        _requirement_row(req, [c["id"] for c in result["claims"] if c["requirement_ref"] == req["id"]])
        for req in contract["requirements"]
    ]
    all_gaps = [g for row in rows for g in row["gaps"]]
    return {
        "contract_ref": CONTRACT_REF,
        "requirements": rows,
        "spec_version": "coverage-report/v0",
        "summary": {
            "gaps": len(all_gaps),
            "gaps_without_remedy": sum(1 for g in all_gaps if g["remedy"] is None),
            "requirements": len(rows),
            "satisfied": sum(1 for row in rows if row["status"] == "SATISFIED"),
            "with_gaps": sum(1 for row in rows if row["gaps"]),
        },
    }


def build_result_with_coverage() -> dict[str, Any]:
    """The example Result, carrying its coverage report."""
    result = RESULT_BUILDER.build_result()
    result["coverage_report"] = build_coverage_report(result, build_contract())
    return result


def side_inputs() -> dict[str, dict[str, Any]]:
    return {
        "release-approval-contract.json": build_contract(),
        "release-approval-register.json": build_register(),
        "release-approval-result-with-coverage.json": build_result_with_coverage(),
    }


def serialize(doc: dict[str, Any]) -> str:
    return json.dumps(doc, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    for name, doc in side_inputs().items():
        (HERE / name).write_text(serialize(doc), encoding="utf-8")
        print(HERE / name)


if __name__ == "__main__":
    main()
