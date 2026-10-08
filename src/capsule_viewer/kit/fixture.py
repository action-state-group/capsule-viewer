# SPDX-License-Identifier: Apache-2.0
"""One page showing every kit component, filled with the content that breaks
layouts: 64-hex digests, unbroken identifiers, a seven-column table, long
labels. ``js-tests/kit_layout.test.js`` opens it in headless Chromium at phone,
desktop and print widths and fails on any horizontal overflow; it is also the
page a reviewer opens to look at the kit. Synthetic values only.
"""
from __future__ import annotations

from .components import (
    CalendarMark,
    Check,
    Citation,
    EvidenceItem,
    Markup,
    Metric,
    Party,
    TimelineEvent,
    VerificationResult,
    calendar_grid,
    citation_list,
    data_table,
    disclosure_badge,
    drilldown,
    evidence_details,
    metric_grid,
    page,
    party_card,
    section,
    timeline,
    verdict_pill,
    verification_details,
)

DIGEST = "sha256:9f2c4e1a7b3d5f8e0c6a2b4d8f1e3c5a7b9d0f2e4c6a8b1d3f5e7c9a0b2d4f6e"
LONG_ID = "example-org.release-approval.contract.requirement-identifier-without-any-break-point-0042"


def _fixture(name: str, html: str) -> Markup:
    return Markup(f'<div data-fixture="{name}">{html}</div>')


def fixture_page() -> str:
    """The every-component fixture page (a complete HTML document)."""
    metrics = metric_grid(
        [
            Metric("Requirements evaluated", "27"),
            Metric("Met", "19", "as stated by the result"),
            Metric("Not met", "3"),
            Metric("Not evaluable", "5"),
            Metric("Bundle digest", DIGEST),
        ]
    )
    table = data_table(
        ["Requirement", "Verdict", "Tier", "Grade", "Disclosure", "Evidence", "Note"],
        [
            [LONG_ID, verdict_pill("met"), "recomputed", "witnessed", disclosure_badge("disclosed"), DIGEST, "-"],
            ["approval-recorded", verdict_pill("not_met"), "judged", "self-attested", disclosure_badge("withheld"), "-", "approver absent"],
            ["retired-spelling", verdict_pill("insufficient_evidence"), "judged", "countersigned", disclosure_badge("committed"), DIGEST, "-"],
        ],
        caption="Requirements",
    )
    cal = calendar_grid(
        2026,
        9,
        {
            1: [CalendarMark("run", "positive")],
            14: [CalendarMark("gap", "caution"), CalendarMark("2 not met", "negative")],
            30: [CalendarMark("close", "info")],
        },
    )
    badges = Markup(
        "<p>" + " ".join(disclosure_badge(s) for s in ("disclosed", "committed", "withheld", "not_present", "partially_shown")) + "</p>"
    )
    pills = Markup(
        "<p>" + " ".join(verdict_pill(v) for v in ("met", "not_met", "not_evaluable", "insufficient_evidence", "not_applicable")) + "</p>"
    )
    cites = citation_list(
        [
            Citation("Approval record", DIGEST),
            Citation("Release contract", LONG_ID + "@1.4.0", "the version the result was evaluated against"),
        ]
    )
    drill = drilldown(
        "Why this requirement is not met",
        Markup("<p>The approval step names an approver role that no record in the bundle carries.</p>"),
        cites,
    )
    evidence = evidence_details(
        [
            EvidenceItem("Approval record", "disclosed", DIGEST, "application/json"),
            EvidenceItem("Approver message", "committed", DIGEST, "text/plain", "the opening was not supplied with this bundle"),
            EvidenceItem("Reviewer notes", "withheld", DIGEST),
            EvidenceItem("Deployment log", "not_present"),
        ]
    )
    verification = verification_details(
        VerificationResult(
            "the bundle verifier",
            "verified",
            (
                Check("signature over the bundle", "verified", "key " + LONG_ID),
                Check("transparency receipt", "not_checked", "no receipt in the bundle"),
                Check("record digest " + DIGEST, "failed", "recomputed digest differs"),
            ),
        )
    )
    parties = Markup(
        party_card(Party("producer", "EXAMPLE-ORG release pipeline", (("key id", LONG_ID), ("digest", DIGEST))))
        + party_card(Party("counterparty", "EXAMPLE-ORG audit"))
    )
    events = timeline(
        [
            TimelineEvent("2026-09-01T09:00:00Z", "Release requested"),
            TimelineEvent("2026-09-01T09:04:12Z", "Approval recorded", "approver role " + LONG_ID),
            TimelineEvent("2026-09-01T09:30:00Z", "Deployed", DIGEST),
        ]
    )
    body = [
        _fixture("section", section("Section", Markup("<p>A titled block holding other components.</p>"))),
        _fixture("metric-grid", section("MetricGrid", metrics)),
        _fixture("data-table", section("DataTable", table)),
        _fixture("calendar-grid", section("CalendarGrid", cal)),
        _fixture("disclosure-badge", section("DisclosureBadge", badges)),
        _fixture("verdict-pill", section("VerdictPill", pills)),
        _fixture("citation-list", section("CitationList", cites)),
        _fixture("drilldown", section("Drilldown", drill)),
        _fixture("evidence-details", section("EvidenceDetails", evidence)),
        _fixture("verification-details", section("VerificationDetails", verification)),
        _fixture("party-card", section("PartyCard", parties)),
        _fixture("timeline", section("Timeline", events)),
    ]
    return page("Component kit fixture", *body)
