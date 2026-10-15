# SPDX-License-Identifier: Apache-2.0
"""The evidence report page, held to the page capsule-emit rendered before it
moved here.

``tests/testdata/evidence-report/<case>/`` holds a bundle, the result
capsule-emit's ``check_evidence_file`` gave for it, and the page capsule-emit's
own ``render_report_html`` drew from the two (capsule-emit 0.9.1, whose
renderer is byte-identical to capsule-emit main at 35b2b42; ``freeze.py``
there wrote them). The frozen result is rendered here, not re-checked, so
these hold the renderer to the donated one whatever the verifier later says;
``test_evidence_report.py`` holds the live check.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from capsule_emit.evidence_file import EvidenceFileCheck
from evidence_report_helpers import frozen_check

from capsule_viewer import evidence_report

GOLDENS = Path(__file__).parent / "testdata" / "evidence-report"
CASES = sorted(p.name for p in GOLDENS.iterdir() if p.is_dir())
SOURCE = "f.json"


def load(case: str) -> tuple[dict, EvidenceFileCheck, str]:
    path = GOLDENS / case
    return (
        json.loads((path / "bundle.json").read_text(encoding="utf-8")),
        frozen_check(json.loads((path / "check.json").read_text(encoding="utf-8"))),
        (path / "page.html").read_text(encoding="utf-8"),
    )


def test_every_verdict_and_shape_is_frozen():
    verdicts = {load(case)[1].verdict for case in CASES}
    assert verdicts == {"VALID", "INCOMPLETE", "INVALID"}
    assert {"no-digest", "not-a-bundle", "witnessed", "altered-result", "hostile-record"} <= set(CASES)


@pytest.mark.parametrize("case", CASES)
def test_the_page_is_the_one_capsule_emit_drew(case):
    bundle, check, golden = load(case)
    if check.kind_ok and check.bundle_digest is None:
        # No digest to bind a result handed in from outside: capsule-emit drew
        # it anyway, and so does check_and_render, which checks this object.
        with pytest.raises(evidence_report.BundleMismatch):
            evidence_report.render_report_html(bundle, check, source=SOURCE)
        assert evidence_report._page(bundle, check, SOURCE) == golden
        return
    assert evidence_report.render_report_html(bundle, check, source=SOURCE) == golden
