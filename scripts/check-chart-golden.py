#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Check the chart golden's bundle with agent-action-capsule's own checkers.

ts/test/testdata/charts/book.bundle.json is sealed in this repository by the
test sealer (capsule-viewer#82), and the TS test checks it verifies. This
script holds its Result and its dataset to AAC's references instead of ours,
at the revision that defined them (AAC_REV, agent-action-capsule#443):

- the Result document (the root's book header `statement`) against
  schemas/evidence-result-v0.json, which carries plan_ref and dataset_ref;
- the dataset against its plan and the book's record headers with
  schemas/evidence_dataset.py `check_dataset`, the Python reference: it runs
  the plan again and requires exactly its rows;
- the Result's plan_ref and dataset_ref against the digests of those two.

Usage:
    python3 scripts/check-chart-golden.py [--aac PATH]
    python3 scripts/check-chart-golden.py --rev    # print AAC_REV

PATH (or the AAC_CHECKOUT environment variable) is a clone of
agent-action-capsule that holds AAC_REV. Without one the check is skipped with
a notice, as scripts/check-moved-spec.py does.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

AAC_REV = "8c673d1aaf6e1418f8bb708c215362712f471e50"
ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "ts" / "test" / "testdata" / "charts" / "book.bundle.json"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--aac", default=os.environ.get("AAC_CHECKOUT"))
    parser.add_argument("--rev", action="store_true", help="print AAC_REV and exit")
    args = parser.parse_args()
    if args.rev:
        print(AAC_REV)
        return 0
    if not args.aac:
        print(
            "SKIP: no agent-action-capsule checkout given (--aac PATH or AAC_CHECKOUT); "
            f"the chart golden was not checked against AAC at {AAC_REV}."
        )
        return 0
    with tempfile.TemporaryDirectory() as tmp:
        # The AAC sources at AAC_REV, whatever the checkout has checked out.
        archive = subprocess.run(
            ["git", "-C", args.aac, "archive", AAC_REV, "schemas"],
            check=True,
            capture_output=True,
        ).stdout
        subprocess.run(["tar", "-x", "-C", tmp], input=archive, check=True)
        schemas = Path(tmp) / "schemas"
        sys.path.insert(0, str(schemas))
        import jsonschema  # noqa: PLC0415
        from agent_action_capsule.canonical import json_digest  # noqa: PLC0415
        from evidence_dataset import check_dataset  # noqa: PLC0415

        bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
        headers = [
            d["agent_input"]
            for d in bundle["disclosures"].values()
            if isinstance(d.get("agent_input"), dict)
        ]
        by_type: dict[str, list[dict]] = {}
        for header in headers:
            by_type.setdefault(header["record_type"], []).append(header)
        [plan] = [h["statement"] for h in by_type["evidence_plan"]]
        [dataset] = [h["statement"] for h in by_type["evidence_dataset"]]
        root = bundle["disclosures"][bundle["root"]]["agent_input"]
        result = root["statement"]

        findings: list[str] = []
        schema = json.loads(
            (schemas / "evidence-result-v0.json").read_text(encoding="utf-8")
        )
        for error in jsonschema.Draft202012Validator(schema).iter_errors(result):
            findings.append(f"RESULT {list(error.absolute_path)}: {error.message}")
        try:
            check_dataset(plan, dataset, headers)
        except Exception as exc:  # DatasetError carries its reason
            findings.append(f"DATASET {getattr(exc, 'reason', type(exc).__name__)}: {exc}")
        if result.get("plan_ref", {}).get("digest") != json_digest(plan):
            findings.append("RESULT plan_ref is not the plan's digest")
        if result.get("dataset_ref", {}).get("digest") != json_digest(dataset):
            findings.append("RESULT dataset_ref is not the dataset's digest")
        for finding in findings:
            print(finding)
        if findings:
            return 1
        print(
            f"OK  the chart golden's Result and dataset ({len(dataset['rows'])} rows) "
            f"pass AAC's checkers at {AAC_REV[:7]}"
        )
        return 0


if __name__ == "__main__":
    sys.exit(main())
