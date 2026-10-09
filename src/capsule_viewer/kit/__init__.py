# SPDX-License-Identifier: Apache-2.0
"""The presentation component kit: responsive server-rendered primitives, the
``--cv-*`` design tokens they are styled with, and the (draft) module contract.

See ``components`` for the primitives, ``tokens`` for the token source and its
drift guard, and ``contract`` for the module Protocols and conformance check.
"""
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
from .contract import (
    KIT,
    HtmlPresentationModule,
    KitServices,
    ModuleContractError,
    ModuleManifest,
    check_module,
    check_module_renders,
)
from .tokens import TOKENS, TokenDriftError, check_token_sync, kit_css

__all__ = [
    "KIT",
    "TOKENS",
    "CalendarMark",
    "Check",
    "Citation",
    "EvidenceItem",
    "HtmlPresentationModule",
    "KitServices",
    "Markup",
    "Metric",
    "ModuleContractError",
    "ModuleManifest",
    "Party",
    "TimelineEvent",
    "TokenDriftError",
    "VerificationResult",
    "calendar_grid",
    "check_module",
    "check_module_renders",
    "check_token_sync",
    "citation_list",
    "data_table",
    "disclosure_badge",
    "drilldown",
    "evidence_details",
    "kit_css",
    "metric_grid",
    "page",
    "party_card",
    "section",
    "timeline",
    "verdict_pill",
    "verification_details",
]
