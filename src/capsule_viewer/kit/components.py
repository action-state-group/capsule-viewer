# SPDX-License-Identifier: Apache-2.0
"""The presentation component kit: server-rendered HTML, no script, no network.

Each component is a function from plain values to a ``Markup`` string. Every
piece of text a caller passes is HTML-escaped; only ``Markup`` (another
component's output) passes through unescaped, so components compose without
double-escaping and caller data can never become markup. ``Markup`` stays
``Markup`` under ``+`` and ``join`` (a plain ``str`` operand is escaped on the
way in), so concatenated component output nests like a single component's.

Components render only what they are given. None of them computes a verdict,
a count, a disclosure state or a verification outcome: ``verdict_pill`` shows
the verdict it is handed, ``verification_details`` shows a verifier's result,
``timeline`` keeps the caller's order. A value outside a component's closed
vocabulary is shown as a visible refusal naming the value -- never dropped,
never defaulted to a neighbouring state.

No component emits a hyperlink, an image, a script or a style attribute:
every component's output passes ``contract.check_fragment``'s element and
attribute allowlist (``tests/test_kit_components.py``), and
``tests/test_no_network.py`` holds the stylesheet and pages to no network
reference.

The disclosure vocabulary here is the presentation one (``disclosed`` /
``committed`` / ``withheld`` / ``not_present``). A module reading a record whose
own status spelling differs maps it explicitly; the kit never guesses.
"""
from __future__ import annotations

import base64
import calendar
import hashlib
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from html import escape

from .tokens import kit_css


class Markup(str):
    """HTML this kit produced. Passed through as-is when nested."""

    def __add__(self, other: str) -> Markup:
        return Markup(str.__add__(self, _text(other)))

    def __radd__(self, other: str) -> Markup:
        return Markup(str.__add__(_text(other), self))

    def join(self, parts: Iterable[str]) -> Markup:
        return Markup(str.join(self, (_text(part) for part in parts)))


def _text(value: str) -> str:
    return value if isinstance(value, Markup) else escape(value, quote=True)


def _join(children: Iterable[str]) -> str:
    return "".join(_text(child) for child in children)


def _tag(name: str, cls: str = "", children: Iterable[str] = (), **attrs: str) -> Markup:
    if cls:
        attrs = {"class": cls, **attrs}
    rendered = "".join(f' {key.replace("_", "-")}="{escape(value, quote=True)}"' for key, value in attrs.items())
    return Markup(f"<{name}{rendered}>{_join(children)}</{name}>")


def _refusal(component: str, value: str, reason: str) -> Markup:
    return _tag(
        "span",
        "cv-refusal cv-badge",
        [f"{component} refused {value!r}: {reason}"],
        data_refused=component,
    )


# ---- Section ----------------------------------------------------------------


def section(title: str, *children: str, level: int = 2) -> Markup:
    """A titled block. ``level`` is the heading level (2-4)."""
    if level not in (2, 3, 4):
        raise ValueError(f"section level must be 2, 3 or 4, got {level}")
    heading = _tag(f"h{level}", "cv-section__title", [title])
    body = _tag("div", "cv-section__body", children)
    return _tag("section", "cv-section", [heading, body], data_cv="section")


# ---- MetricGrid -------------------------------------------------------------


@dataclass(frozen=True)
class Metric:
    label: str
    value: str
    note: str = ""


def metric_grid(metrics: Sequence[Metric]) -> Markup:
    """Label/value tiles; as many columns as fit, one column on a phone."""
    tiles = []
    for metric in metrics:
        parts = [
            _tag("dt", "cv-metric__label", [metric.label]),
            _tag("dd", "cv-metric__value", [metric.value]),
        ]
        if metric.note:
            parts.append(_tag("dd", "cv-metric__note", [metric.note]))
        tiles.append(_tag("div", "cv-metric", parts))
    return _tag("div", "cv-metrics-wrap", [_tag("dl", "cv-metrics", tiles)], data_cv="metric-grid")


# ---- DataTable --------------------------------------------------------------


def data_table(columns: Sequence[str], rows: Sequence[Sequence[str]], caption: str = "") -> Markup:
    """A table that becomes stacked label/value rows when its box is narrow.

    Every row must have one cell per column; a short or long row is a caller
    error, not something to pad or truncate silently.
    """
    for index, row in enumerate(rows):
        if len(row) != len(columns):
            raise ValueError(f"data_table row {index} has {len(row)} cells for {len(columns)} columns")
    head = _tag("thead", "", [_tag("tr", "", [_tag("th", "", [c], scope="col") for c in columns])])
    body_rows = [
        _tag("tr", "", [_tag("td", "", [cell], data_label=col) for col, cell in zip(columns, row, strict=True)])
        for row in rows
    ]
    parts = [_tag("caption", "", [caption])] if caption else []
    table = _tag("table", "cv-table", [*parts, head, _tag("tbody", "", body_rows)])
    return _tag("div", "cv-table-wrap", [table], data_cv="data-table")


# ---- CalendarGrid -----------------------------------------------------------

TONES = ("positive", "negative", "caution", "neutral", "info")


@dataclass(frozen=True)
class CalendarMark:
    label: str
    tone: str = "neutral"


def calendar_grid(year: int, month: int, marks: Mapping[int, Sequence[CalendarMark]]) -> Markup:
    """One month, Monday first, with the given marks on their days."""
    if not 1 <= month <= 12:
        raise ValueError(f"calendar_grid month must be 1-12, got {month}")
    weeks = calendar.Calendar(firstweekday=0).monthdayscalendar(year, month)
    days_in_month = calendar.monthrange(year, month)[1]
    stray = sorted(day for day in marks if not 1 <= day <= days_in_month)
    if stray:
        raise ValueError(f"calendar_grid marks name days outside {year}-{month:02d}: {stray}")
    cells = [_tag("div", "cv-calendar__dow", [name], aria_hidden="true") for name in calendar.day_abbr]
    for week in weeks:
        for day in week:
            if day == 0:
                cells.append(_tag("div", "cv-calendar__day cv-calendar__day--blank"))
                continue
            content = [_tag("span", "cv-calendar__num", [str(day)])]
            for mark in marks.get(day, ()):
                content.append(_mark(mark))
            cells.append(_tag("div", "cv-calendar__day", content))
    title = _tag("div", "cv-calendar__title", [f"{calendar.month_name[month]} {year}"])
    return _tag("div", "cv-calendar", [title, _tag("div", "cv-calendar__grid", cells)], data_cv="calendar-grid")


def _mark(mark: CalendarMark) -> Markup:
    if mark.tone not in TONES:
        return _refusal("CalendarMark", mark.tone, f"tone must be one of {', '.join(TONES)}")
    return _tag("span", f"cv-calendar__mark cv-tone--{mark.tone}", [mark.label])


# ---- DisclosureBadge --------------------------------------------------------

# state -> (label, tone). The four states and their wording are fixed.
DISCLOSURE_STATES: dict[str, tuple[str, str]] = {
    "disclosed": ("DISCLOSED", "positive"),
    "committed": ("COMMITTED (opening not supplied)", "info"),
    "withheld": ("WITHHELD", "caution"),
    "not_present": ("NOT PRESENT", "neutral"),
}


def disclosure_badge(state: str) -> Markup:
    """The disclosure state of one piece of evidence, as given."""
    if state not in DISCLOSURE_STATES:
        return _refusal("DisclosureBadge", state, f"state must be one of {', '.join(DISCLOSURE_STATES)}")
    label, tone = DISCLOSURE_STATES[state]
    return _tag("span", f"cv-badge cv-tone--{tone}", [label], data_cv="disclosure-badge", data_state=state)


# ---- VerdictPill ------------------------------------------------------------

VERDICTS: dict[str, tuple[str, str]] = {
    "met": ("met", "positive"),
    "not_met": ("not met", "negative"),
    "not_evaluable": ("not evaluable", "neutral"),
}
# A retired spelling a reader still accepts, and the verdict it reads as.
RETIRED_VERDICT_SPELLINGS: dict[str, str] = {"insufficient_evidence": "not_evaluable"}


def verdict_pill(verdict: str) -> Markup:
    """A verdict as given. ``not_applicable`` is refused: it excludes a
    requirement from the population, it is not a verdict on one."""
    if verdict == "not_applicable":
        return _refusal("VerdictPill", verdict, "a population exclusion, not a verdict")
    canonical = RETIRED_VERDICT_SPELLINGS.get(verdict, verdict)
    if canonical not in VERDICTS:
        return _refusal("VerdictPill", verdict, f"verdict must be one of {', '.join(VERDICTS)}")
    label, tone = VERDICTS[canonical]
    attrs = {"data_cv": "verdict-pill", "data_verdict": canonical}
    if canonical != verdict:
        attrs["title"] = f"stated as {verdict!r}, read as {canonical!r}"
    return _tag("span", f"cv-pill cv-tone--{tone}", [label], **attrs)


# ---- CitationList -----------------------------------------------------------


@dataclass(frozen=True)
class Citation:
    label: str
    ref: str  # an identifier or digest, shown as text -- never a link
    note: str = ""


def citation_list(citations: Sequence[Citation]) -> Markup:
    """Numbered citations. A ref is printed as text, never turned into a link."""
    items = []
    for cite in citations:
        parts = [_tag("span", "", [cite.label]), _tag("span", "cv-citation__ref cv-mono", [cite.ref])]
        if cite.note:
            parts.append(_tag("span", "cv-muted", [cite.note]))
        items.append(_tag("li", "cv-citation", [_tag("div", "", parts)]))
    return _tag("ol", "cv-citations", items, data_cv="citation-list")


# ---- Drilldown --------------------------------------------------------------


def drilldown(summary: str, *children: str, expanded: bool = False) -> Markup:
    """Native ``<details>``: opens with no script, survives a phone, prints open."""
    head = _tag("summary", "", [summary])
    body = _tag("div", "cv-drilldown__body", children)
    open_attr = " open" if expanded else ""
    return Markup(f'<details class="cv-drilldown" data-cv="drilldown"{open_attr}>{head}{body}</details>')


# ---- EvidenceDetails --------------------------------------------------------


@dataclass(frozen=True)
class EvidenceItem:
    label: str
    disclosure: str  # a DISCLOSURE_STATES key
    digest: str = ""
    media_type: str = ""
    note: str = ""


def evidence_details(items: Sequence[EvidenceItem]) -> Markup:
    """Each piece of evidence: label, disclosure state, digest and media type as given."""
    rows = []
    for item in items:
        head = _tag(
            "div",
            "cv-evidence__head",
            [_tag("span", "cv-evidence__label", [item.label]), disclosure_badge(item.disclosure)],
        )
        parts = [head]
        if item.media_type:
            parts.append(_tag("span", "cv-muted", [item.media_type]))
        if item.digest:
            parts.append(_tag("span", "cv-mono", [item.digest]))
        if item.note:
            parts.append(_tag("span", "", [item.note]))
        rows.append(_tag("li", "cv-evidence__item", parts))
    return _tag("ul", "cv-evidence", rows, data_cv="evidence-details")


# ---- VerificationDetails ----------------------------------------------------

# outcome -> (wording, tone). The wording never upgrades "integrity covered"
# into "understood" or "correct".
VERIFICATION_OUTCOMES: dict[str, tuple[str, str]] = {
    "verified": ("Verified", "positive"),
    "failed": ("Did not verify", "negative"),
    "not_checked": ("Not checked", "neutral"),
}


@dataclass(frozen=True)
class Check:
    name: str
    outcome: str  # a VERIFICATION_OUTCOMES key
    detail: str = ""


@dataclass(frozen=True)
class VerificationResult:
    """What a verifier reported. The kit displays it; it never produces one."""

    verifier: str
    outcome: str  # a VERIFICATION_OUTCOMES key
    checks: Sequence[Check] = field(default_factory=tuple)


def _outcome(outcome: str, cls: str) -> Markup:
    if outcome not in VERIFICATION_OUTCOMES:
        return _refusal("VerificationDetails", outcome, f"outcome must be one of {', '.join(VERIFICATION_OUTCOMES)}")
    wording, tone = VERIFICATION_OUTCOMES[outcome]
    return _tag("span", f"{cls} cv-tone--{tone}", [wording], data_outcome=outcome)


def verification_details(result: VerificationResult) -> Markup:
    """A verifier's result: overall outcome, who reported it, and each check."""
    headline = _tag(
        "div",
        "cv-verification__outcome-row",
        [_outcome(result.outcome, "cv-verification__outcome cv-pill"), _tag("span", "cv-muted", [f" reported by {result.verifier}"])],
    )
    checks = []
    for check in result.checks:
        parts = [_outcome(check.outcome, "cv-pill"), _tag("span", "", [check.name])]
        if check.detail:
            parts.append(_tag("span", "cv-mono cv-muted", [check.detail]))
        checks.append(_tag("li", "cv-check", parts))
    return _tag("div", "cv-verification", [headline, _tag("ul", "cv-checks", checks)], data_cv="verification-details")


# ---- PartyCard --------------------------------------------------------------


@dataclass(frozen=True)
class Party:
    role: str
    name: str
    facts: Sequence[tuple[str, str]] = field(default_factory=tuple)  # (label, value), e.g. key id


def party_card(party: Party) -> Markup:
    """One party to the record: role, name, and the facts given about it."""
    facts = []
    for label, value in party.facts:
        facts += [_tag("dt", "", [label]), _tag("dd", "cv-mono", [value])]
    parts = [_tag("div", "cv-party__role", [party.role]), _tag("div", "cv-party__name", [party.name])]
    if facts:
        parts.append(_tag("dl", "cv-party__facts", facts))
    return _tag("div", "cv-party-wrap", [_tag("div", "cv-party", parts)], data_cv="party-card")


# ---- Timeline ---------------------------------------------------------------


@dataclass(frozen=True)
class TimelineEvent:
    at: str  # a timestamp as given; the kit never parses or re-sorts it
    label: str
    detail: str = ""


def timeline(events: Sequence[TimelineEvent]) -> Markup:
    """Events in the order given."""
    items = []
    for event in events:
        parts = [_tag("span", "cv-timeline__at cv-mono", [event.at]), _tag("span", "cv-timeline__label", [event.label])]
        if event.detail:
            parts.append(_tag("div", "cv-muted", [event.detail]))
        items.append(_tag("li", "cv-timeline__item", parts))
    return _tag("ol", "cv-timeline", items, data_cv="timeline")


# ---- Page -------------------------------------------------------------------


def _style_hash(css: str) -> str:
    return "sha256-" + base64.b64encode(hashlib.sha256(css.encode("utf-8")).digest()).decode("ascii")


def page(title: str, *children: str) -> Markup:
    """A complete, self-contained document: the kit stylesheet inlined in the
    head, no script, and a CSP that permits only that exact stylesheet."""
    css = "\n" + kit_css()
    csp = f"default-src 'none'; style-src '{_style_hash(css)}'; img-src 'none'; connect-src 'none'"
    return Markup(
        "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        f'<meta http-equiv="Content-Security-Policy" content="{escape(csp, quote=True)}">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{escape(title)}</title>\n<style>{css}</style>\n</head>\n"
        f'<body class="cv-kit">\n<main class="cv-page">{_join(children)}</main>\n</body>\n</html>\n'
    )
