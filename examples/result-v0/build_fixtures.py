# SPDX-License-Identifier: Apache-2.0
"""Build the example Result v0 fixtures: one synthetic Evidence Result v0
document (a software release approval contract, 24 claims over six
releases) and two one-field variants of it, each rendered to a
self-contained viewer HTML file.

Everything here is synthetic. The producer, the releases, the contract and
every digest are invented; each digest is the SHA-256 of a fixed label string, so
the files are reproducible byte-for-byte and name nothing real.

    python examples/result-v0/build_fixtures.py            # rewrite the JSON fixtures
    python examples/result-v0/build_fixtures.py --html DIR  # also render DIR/*.html

The JSON files beside this script are the committed output;
tests/test_result_v0_examples.py fails if they drift from what this script
builds.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent

CONTRACT_REF = "ec:example-software-release-approval@0.3"
GENERATED_AT = "2026-09-30T00:00:00Z"

# requirement_ref -> tier. `change_risk_assessed_correctly` needs a judgment
# (a reviewer or model read the change); the other three are recomputed from
# records by a deterministic check.
REQUIREMENTS = [
    ("change_risk_assessed_correctly", "judged"),
    ("tests_passed_on_release_commit", "recomputed"),
    ("deployment_observed", "recomputed"),
    ("release_notes_published", "recomputed"),
]

JOBS = ["R-101", "R-102", "R-103", "R-104", "R-105", "R-106"]

# Every (job, requirement) outcome that is NOT the default (SATISFIED, met).
# Each entry: sufficiency, verdict, presentation status, and a carrier
# override where the evidence is not disclosed.
EXCEPTIONS: dict[tuple[str, str], dict[str, Any]] = {
    # Two clean failures: enough evidence, and it shows the requirement was not met.
    ("R-102", "tests_passed_on_release_commit"): {"sufficiency": "SATISFIED", "verdict": "not_met"},
    ("R-105", "change_risk_assessed_correctly"): {"sufficiency": "SATISFIED", "verdict": "not_met"},
    # A contradiction: the deployment log disagrees with the release record.
    ("R-104", "deployment_observed"): {
        "sufficiency": "SATISFIED",
        "verdict": "not_met",
        "status": "CONTRADICTED",
    },
    # Not enough evidence to decide -- NOT a failure.
    ("R-103", "release_notes_published"): {
        "sufficiency": "GAP",
        "verdict": "not_evaluable",
        "status": "NOT_FOUND",
    },
    ("R-106", "release_notes_published"): {
        "sufficiency": "GAP",
        "verdict": "not_evaluable",
        "carrier": "story",
        "status": "NOT_COMMITTED",
        "text": "The documentation site was not connected for this window, so no publication "
        "records were committed; the requirement could not be evaluated either way.",
    },
    ("R-103", "deployment_observed"): {
        "sufficiency": "GAP",
        "verdict": "not_evaluable",
        "carrier": "analysis",
        "status": "WITHHELD",
        "text": "The hosting provider confirmed a matching deployment record exists but withheld it "
        "under its own disclosure policy; the evaluator could not examine it.",
    },
    ("R-106", "change_risk_assessed_correctly"): {
        "sufficiency": "INSUFFICIENT",
        "verdict": "not_evaluable",
        "status": "INSUFFICIENT",
    },
    # Evaluated, but the outcome could not be resolved -- counted in coverage.unknown_count.
    ("R-104", "release_notes_published"): {
        "sufficiency": "UNKNOWN",
        "verdict": "not_evaluable",
        "status": "UNKNOWN",
    },
}

# Grades rotate so every grade appears under every verdict the fixture uses.
GRADES = ["witnessed", "self-attested", "countersigned"]

# Requirements the contract excluded as not applicable (never claims):
# the security sign-off rule only applies to releases that touch the
# authentication module, and three of the six releases did not.
EXCLUDED_NOT_APPLICABLE = 3


def digest(label: str) -> str:
    return hashlib.sha256(("synthetic-example:" + label).encode()).hexdigest()


def ref(label: str) -> dict[str, str]:
    return {"digest": digest(label), "digest_alg": "SHA-256"}


def claim_for(index: int, job: str, requirement: str, tier: str) -> dict[str, Any]:
    spec = EXCEPTIONS.get((job, requirement), {"sufficiency": "SATISFIED", "verdict": "met"})
    claim_id = f"{job}/{requirement}"
    evidence = [ref(f"{claim_id}:evidence:{n}") for n in range(1 if tier == "judged" else 2)]
    carrier = spec.get("carrier", "disclosure")
    status = spec.get("status", "SATISFIED")
    if carrier == "disclosure":
        presentation: dict[str, Any] = {"evidence": copy.deepcopy(evidence), "kind": "disclosure", "status": status}
    elif carrier == "analysis":
        presentation = {"kind": "analysis", "status": status, "summary": spec["text"]}
    else:
        presentation = {"kind": "story", "narrative": spec["text"], "status": status}
    proof_kind = "receipt" if tier == "judged" else "inclusion_proof"
    return {
        "contract_ref": CONTRACT_REF,
        "evidence": evidence,
        "grade": GRADES[index % len(GRADES)],
        "id": claim_id,
        "presentation": presentation,
        "proofs": [{**ref(f"{claim_id}:proof"), "kind": proof_kind}],
        "requirement_ref": requirement,
        "sufficiency": spec["sufficiency"],
        "tier": tier,
        "verdict": spec["verdict"],
    }


def build_result() -> dict[str, Any]:
    claims = []
    for job in JOBS:
        for requirement, tier in REQUIREMENTS:
            claims.append(claim_for(len(claims), job, requirement, tier))
    buckets: dict[str, list[str]] = {"met": [], "not_evaluable": [], "not_met": []}
    for claim in claims:
        buckets[claim["verdict"]].append(claim["id"])
    return {
        "aggregate": {
            "buckets": buckets,
            "coverage": {
                "evaluated_population": len(claims),
                "excluded_not_applicable": EXCLUDED_NOT_APPLICABLE,
                "unknown_count": sum(1 for c in claims if c["sufficiency"] == "UNKNOWN"),
            },
        },
        "claims": claims,
        "generated_at": GENERATED_AT,
        "result_version": "evidence-result-v0",
        "view": {
            "producer_name": "Example Project (synthetic)",
            "spec_version": "presentation/v1",
            "title": "Software release approval -- September (synthetic example)",
        },
    }


# The claim the two variants touch: a not_evaluable claim (a gap, not a failure).
VARIANT_CLAIM = "R-103/release_notes_published"


def build_hand_edited(result: dict[str, Any]) -> dict[str, Any]:
    """Variant: someone "tidied" the summary -- VARIANT_CLAIM moved from the
    not_evaluable bucket into met in aggregate.buckets. The claim itself is
    untouched, so the viewer's recount disagrees with the stated buckets."""
    doc = copy.deepcopy(result)
    buckets = doc["aggregate"]["buckets"]
    buckets["not_evaluable"].remove(VARIANT_CLAIM)
    buckets["met"].append(VARIANT_CLAIM)
    return doc


def build_untiered(result: dict[str, Any]) -> dict[str, Any]:
    """Variant: the first claim's `tier` is missing. The viewer must refuse
    the row visibly (and the recount then disagrees with the stated
    aggregate), never render it with a default tier."""
    doc = copy.deepcopy(result)
    del doc["claims"][0]["tier"]
    return doc


def fixtures() -> dict[str, dict[str, Any]]:
    result = build_result()
    return {
        "release-approval-result.json": result,
        "release-approval-result-hand-edited.json": build_hand_edited(result),
        "release-approval-result-untiered.json": build_untiered(result),
    }


def serialize(doc: dict[str, Any]) -> str:
    return json.dumps(doc, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def render_html(doc: dict[str, Any]) -> str:
    from capsule_viewer import build_payload, encode_fragment, render_base_viewer_html
    from capsule_viewer.result_v0 import build_result_entry

    return render_base_viewer_html(encode_fragment(build_payload([build_result_entry(doc)])))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--html", type=Path, help="also render each fixture to DIR/<name>.html")
    args = parser.parse_args()
    for name, doc in fixtures().items():
        (HERE / name).write_text(serialize(doc), encoding="utf-8")
        if args.html:
            args.html.mkdir(parents=True, exist_ok=True)
            out = args.html / name.replace(".json", ".html")
            out.write_text(render_html(doc), encoding="utf-8")
            print(out)


if __name__ == "__main__":
    main()
