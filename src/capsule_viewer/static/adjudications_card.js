// SPDX-License-Identifier: Apache-2.0
// The Adjudications page, in the page: capsuleviewer.adjudications/v0, which
// draws the Adjudications frame (Outcomes frame 4 of the Terms Pack report
// pages canvas) from the records a bundle carries: calibration-summary/v1,
// human-rating/v1 and evaluation-report/v1, as agent-action-capsule's
// schemas/judge/ define them (spec/judge-record-family-v1.md sections 5, 8).
//
// One self-contained module-slot script (the presentation contract). It imports
// nothing, reads no wording pack and never fetches. `python -m
// capsule_viewer.adjudications.module_slot --write` fills the lines marked
// "@generated": its manifest, its words (compiled in from
// adjudications/wording-en.json, whose id and sha256 the page names in L2) and
// the two stylesheets it inserts (static/kit.css and static/adjudications.css,
// pinned by the manifest's style_sha256).
//
// The input is an evidence-bundle/v2 with an x-adjudications/v0 block (closed:
// `own: true` marks the holder's own preview, drawn in the second person; a
// shared copy is drawn in the third) and the records above, each the
// disclosed agent_input of one record, found by its record_version. What it
// states, and from where:
//   - agreement is the calibration summaries' k of n (each clause's agreement,
//     summed); the only percentage drawn is computed from the k and n beside it
//     and never stored (AAC: no field in a calibration summary is a rate);
//   - when the human ratings are in the bundle, each is set against the verdict
//     of the one case in the report it cites, counted as the weekly run counts it
//     (both met or not met), and the recount must equal the summaries or the
//     page draws none of its counts;
//   - judged verdicts are the met and not_met cases of the reports in the bundle.
// What the bundle does not carry is named on the page and never drawn: the
// judge's and the adjudicator's own words, the term each case was judged on, the
// adjudicator's book and controller. All text is set with textContent.
(function (root) {
  "use strict";

  var MANIFEST = {"spec_version": "aac.presentation-manifest/v0", "id": "capsuleviewer.adjudications/v0", "presentation_api": "aac.presentation-api/v0", "runtime_min": "0.1.0", "trust_class": "trusted-executable", "requires": {"bundle_kind": "evidence-bundle/v2", "extensions": {"required": ["x-adjudications/v0"]}}, "forbids": {"profiles": ["spec_version:report/v1", "spec_version:evaluation-summary/v1", "result_version:evidence-result-v0", "spec_version:org.example.rules-comparison/v0"], "extensions": ["composed/v1", "x-deal-v0", "x-history-selection/v0", "x-standard-history/v0"]}, "audiences": ["*"], "formats": ["html"], "fallback": false, "priority": 1, "executable": {"carrier": "module-slot", "script_sha256": "0000000000000000000000000000000000000000000000000000000000000000", "style_sha256": ["246cfdc8ae83e682a220a2c13cef8134c7515999365b33965d4e924bb871f3ea", "a19676eaa32da4c369b8adc5bb79fa1cbdfaa43ef2269f906012b2ab5bba935a"], "wording_sha256": "13740bb23c761d7c9db4d16ab868f007820afcf8b1c7d8aa2611abceb7554f71"}}; // @generated MANIFEST
  var WORDS = {"module.title": "Adjudications", "page.title": "Adjudications", "title": "Adjudications", "banner.own.label": "Your own preview.", "banner.own.text": "This is the page as you see it, in the second person. A copy that is shared with someone else is drawn in the third person.", "bar.label": "Contents checked", "bar.text": "{cited} of {total} adjudication records cite a record in this bundle · {raters} · signatures not checked here", "raters.one": "{n} adjudicator", "raters.other": "{n} adjudicators", "core.label": "CORE", "core.terms.one": "{n} judged term", "core.terms.other": "{n} judged terms", "core.judge": "judge {model}", "core.judge.more": "{n} judge pins", "core.computed": "summaries computed {from}", "core.computed.range": "summaries computed {from} to {to}", "lede.own": "Adjudications are your pack's blind human sample of judged verdicts. This page shows what each adjudicator said, whether it matches the judge, and how often they agree, with the denominator every time.", "lede.shared": "Adjudications are the pack's blind human sample of judged verdicts. This page shows what each adjudicator said, whether it matches the judge, and how often they agree, with the denominator every time.", "tile.n.label": "adjudications", "tile.n.label.of": "adjudications · of {of} judged verdicts in this bundle", "tile.concur.value": "{k} of {n}", "tile.concur.label": "concur with the judge", "tile.differ.value": "{d} of {n}", "tile.differ.label": "do not concur", "tile.percent.value": "{p}%", "tile.percent.label": "concurrence · derived from the two counts beside it, never stored", "headline.one": "{n} blind re-grade, {k}", "headline.other": "{n} blind re-grades, {k}", "headline.agree.one": "{k} agrees with the judge", "headline.agree.other": "{k} agree with the judge", "blind.all.own": "Blind: every adjudication record you hold states it was rated blind, without the judge's verdict.", "blind.all.shared": "Blind: every adjudication record states it was rated blind, without the judge's verdict.", "none.title": "No adjudications sampled", "none.lead.own": "None of your judged verdicts was sampled for adjudication, so there is no agreement to state.", "none.lead.shared": "None of the judged verdicts was sampled for adjudication, so there is no agreement to state.", "section.term": "By term", "term.open": "open by default here", "col.term": "Judged term", "col.sampled": "Sampled", "col.concur": "Concur", "col.differ": "Differ", "col.concurrence": "Concurrence (derived)", "term.concurrence": "{k} of {n} · {p}%", "term.concurrence.none": "{k} of {n}", "term.note": "A term is named by its clause reference. Its own wording, and how many verdicts it judged, are not in this bundle.", "section.adjudicator": "By adjudicator", "adjudicator.hint": "closed; the reader opens it", "col.adjudicator": "Adjudicator", "adjudicator.book.missing": "The book and controller each adjudicator answered from are not in this bundle: an adjudication record names its rater only by an opaque reference.", "adjudicator.none": "The adjudication records themselves are not in this bundle, so no adjudicator is named.", "section.rows": "What each adjudicator said", "rows.none": "The adjudication records themselves are not in this bundle, so no row is drawn.", "col.subject": "Subject", "col.judge": "Judge said", "col.adjudicator.said": "Adjudicator said", "col.match": "Match", "col.when": "When", "verdict.met": "met", "verdict.not_met": "not met", "match.concurs": "concurs", "match.differs": "differs", "match.not_counted": "not counted", "match.unresolved": "not resolved", "rows.more.concur.one": "{n} more, and it concurs. Differences are listed first.", "rows.more.concur.other": "{n} more, all concur. Differences are listed first.", "rows.more.one": "{n} more. Differences are listed first.", "rows.more.other": "{n} more. Differences are listed first.", "subject.trial": "task {task}, trial {trial}", "panel.judge": "The judge", "panel.adjudicator": "The adjudicator", "panel.blind": "blind", "panel.judge.said": "said {verdict}", "panel.adjudicator.said": "said {verdict}", "panel.judge.words": "Its words are not in this bundle: a judged case in an evaluation report carries a verdict, not a rationale.", "panel.adjudicator.words": "Their words are not in this bundle: an adjudication record carries a label, not text.", "panel.not_counted": "This answer, {label}, is neither met nor not met, so it is in no count.", "panel.unresolved": "This record cites a report that is not in this bundle, or one that holds more than one case, so its judge's side is not drawn.", "date": "{weekday} {month} {day}", "weekday.0": "Sun", "weekday.1": "Mon", "weekday.2": "Tue", "weekday.3": "Wed", "weekday.4": "Thu", "weekday.5": "Fri", "weekday.6": "Sat", "month.1": "Jan", "month.2": "Feb", "month.3": "Mar", "month.4": "Apr", "month.5": "May", "month.6": "Jun", "month.7": "Jul", "month.8": "Aug", "month.9": "Sep", "month.10": "Oct", "month.11": "Nov", "month.12": "Dec", "refused.title": "These adjudications are not drawn", "unverified.lead": "This bundle did not pass the page's checks, so nothing from it is drawn.", "unreadable.lead": "A record this page reads is not in the form it reads, so none of its counts are drawn.", "mismatch.lead": "The adjudication records in this bundle do not add up to the calibration summary, so none of its counts are drawn.", "nosummary.lead": "This bundle carries no calibration summary, so there is nothing to state about agreement.", "heading.checks": "How this page was checked", "checks.lead": "Each line is a check this page ran on this bundle. It checks no record signature.", "checks.column.check": "Check", "checks.column.status": "Status", "check.bundle": "The bundle's records, disclosures and log position pass the page's gate", "check.summary": "Each calibration summary is in its schema's form, and every k is at most its n, for agreement and for drift", "check.recount": "The adjudication records, set against the judge's verdicts, recount to the summary's k and n", "status.pass": "Passed", "status.fail": "Failed", "status.not_checked": "Not checked here", "wording.provenance": "Words: {id}, sha256 {sha}.", "bar.none": "the adjudication records themselves are not in this bundle · signatures not checked here", "headline.summary.one": "{n} re-grade, {k}", "headline.summary.other": "{n} re-grades, {k}", "lede.summary.own": "This is the calibration summary's count of re-grades of your judged verdicts. The adjudication records themselves are not in this bundle, so this page cannot show who re-graded them or what they said.", "lede.summary.shared": "This is the calibration summary's count of re-grades of the judged verdicts. The adjudication records themselves are not in this bundle, so this page cannot show who re-graded them or what they said.", "ambiguous.lead": "This bundle carries more than one calibration summary, and without the adjudication records this page cannot tell whether they count the same re-grades twice, so none of its counts are drawn.", "check.records": "Each adjudication record and each evaluation report is in its schema's form"}; // @generated WORDS
  var PACK = {"id": "capsuleviewer.wording.adjudications-en/v0", "sha256": "13740bb23c761d7c9db4d16ab868f007820afcf8b1c7d8aa2611abceb7554f71"}; // @generated PACK
  var KIT_CSS = "/* SPDX-License-Identifier: Apache-2.0 */\n/*\n * kit.css -- the presentation component kit's stylesheet.\n *\n * The token block below is generated from capsule_viewer/kit/tokens.py\n * (python -m capsule_viewer.kit tokens --write); tests/test_kit_tokens.py\n * fails if the two disagree. Every colour in the component rules is a\n * var(--cv-*) reference -- the same test refuses a literal colour outside the\n * generated block.\n *\n * Phone behaviour lives here, in the primitives: each responsive component is\n * its own size container and reflows on ITS width (@container), so a module\n * that places a MetricGrid or DataTable in a narrow column gets the phone\n * layout without writing a media query. Nothing in the kit scrolls the page\n * sideways: long tokens (digests, ids) wrap anywhere.\n */\n/* BEGIN GENERATED TOKENS (capsule_viewer.kit.tokens) -- do not edit by hand */\n:root {\n  --cv-font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;\n  --cv-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;\n  --cv-font-size-sm: 0.8125rem;\n  --cv-font-size-md: 0.9375rem;\n  --cv-font-size-lg: 1.125rem;\n  --cv-line-height: 1.5;\n  --cv-space-1: 0.25rem;\n  --cv-space-2: 0.5rem;\n  --cv-space-3: 0.75rem;\n  --cv-space-4: 1rem;\n  --cv-space-5: 1.5rem;\n  --cv-radius: 0.5rem;\n  --cv-radius-pill: 999px;\n  --cv-color-text: #1b1f27;\n  --cv-color-text-muted: #4d5564;\n  --cv-color-surface: #ffffff;\n  --cv-color-surface-sunken: #f4f5f7;\n  --cv-color-border: #d3d7de;\n  --cv-color-accent: #2445a8;\n  --cv-color-positive-fg: #17603a;\n  --cv-color-positive-bg: #e6f3eb;\n  --cv-color-negative-fg: #a31d1d;\n  --cv-color-negative-bg: #fbe9e9;\n  --cv-color-caution-fg: #6f4700;\n  --cv-color-caution-bg: #fcf1dc;\n  --cv-color-neutral-fg: #3d4452;\n  --cv-color-neutral-bg: #eceef2;\n  --cv-color-info-fg: #1f3c94;\n  --cv-color-info-bg: #e7ecfb;\n}\n/* END GENERATED TOKENS */\n\n.cv-kit { font-family: var(--cv-font-sans); font-size: var(--cv-font-size-md); line-height: var(--cv-line-height); color: var(--cv-color-text); background: var(--cv-color-surface); overflow-wrap: anywhere; }\nbody.cv-kit { margin: 0; }\n.cv-page { max-width: 60rem; margin: 0 auto; padding: var(--cv-space-5) var(--cv-space-4); }\n.cv-kit *, .cv-kit *::before, .cv-kit *::after { box-sizing: border-box; }\n.cv-kit :where(h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0; padding: 0; }\n.cv-kit :where(ul, ol) { list-style: none; }\n.cv-mono { font-family: var(--cv-font-mono); font-size: var(--cv-font-size-sm); }\n.cv-muted { color: var(--cv-color-text-muted); }\n\n/* Section */\n.cv-section { margin: 0 0 var(--cv-space-5); }\n.cv-section__title { font-size: var(--cv-font-size-lg); font-weight: 600; margin-bottom: var(--cv-space-3); }\n.cv-section__body { display: flex; flex-direction: column; gap: var(--cv-space-3); min-width: 0; }\n\n/* MetricGrid: as many columns as fit, never narrower than the label needs; one column on a phone. */\n.cv-metrics-wrap { container-type: inline-size; }\n.cv-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr)); gap: var(--cv-space-3); }\n.cv-metric { min-width: 0; border: 1px solid var(--cv-color-border); border-radius: var(--cv-radius); padding: var(--cv-space-3); background: var(--cv-color-surface-sunken); }\n.cv-metric__label { font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); }\n.cv-metric__value { font-size: var(--cv-font-size-lg); font-weight: 600; }\n.cv-metric__note { font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); }\n@container (max-width: 24rem) { .cv-metrics { grid-template-columns: 1fr; } }\n\n/* DataTable: a real table when there is room; stacked label/value rows when there is not. */\n.cv-table-wrap { container-type: inline-size; }\n.cv-table { width: 100%; border-collapse: collapse; font-size: var(--cv-font-size-sm); }\n.cv-table caption { text-align: left; font-weight: 600; padding-bottom: var(--cv-space-2); }\n.cv-table th, .cv-table td { text-align: left; vertical-align: top; padding: var(--cv-space-2); border-bottom: 1px solid var(--cv-color-border); min-width: 0; }\n.cv-table th { color: var(--cv-color-text-muted); font-weight: 600; background: var(--cv-color-surface-sunken); }\n@container (max-width: 40rem) {\n  .cv-table, .cv-table tbody, .cv-table tr, .cv-table td { display: block; width: 100%; }\n  .cv-table caption { display: block; }\n  .cv-table thead { display: none; }\n  .cv-table tr { border: 1px solid var(--cv-color-border); border-radius: var(--cv-radius); margin-bottom: var(--cv-space-2); }\n  .cv-table td { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--cv-space-2); }\n  .cv-table td::before { content: attr(data-label); color: var(--cv-color-text-muted); font-weight: 600; }\n  .cv-table tr > td:last-child { border-bottom: 0; }\n}\n\n/* CalendarGrid: always seven columns; the cells shrink, the text wraps. */\n.cv-calendar { font-size: var(--cv-font-size-sm); }\n.cv-calendar__title { font-weight: 600; margin-bottom: var(--cv-space-2); }\n.cv-calendar__grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }\n.cv-calendar__dow { text-align: center; color: var(--cv-color-text-muted); font-weight: 600; padding: var(--cv-space-1) 0; }\n.cv-calendar__day { min-width: 0; min-height: 3rem; border: 1px solid var(--cv-color-border); border-radius: 4px; padding: 2px var(--cv-space-1); background: var(--cv-color-surface); }\n.cv-calendar__day--blank { border-color: transparent; background: transparent; }\n.cv-calendar__num { font-weight: 600; }\n.cv-calendar__mark { display: block; font-size: 0.6875rem; line-height: 1.25; border-radius: 3px; padding: 0 2px; }\n\n/* Tones shared by badges, pills, calendar marks and verification outcomes. */\n.cv-tone--positive { color: var(--cv-color-positive-fg); background: var(--cv-color-positive-bg); }\n.cv-tone--negative { color: var(--cv-color-negative-fg); background: var(--cv-color-negative-bg); }\n.cv-tone--caution { color: var(--cv-color-caution-fg); background: var(--cv-color-caution-bg); }\n.cv-tone--neutral { color: var(--cv-color-neutral-fg); background: var(--cv-color-neutral-bg); }\n.cv-tone--info { color: var(--cv-color-info-fg); background: var(--cv-color-info-bg); }\n\n/* Receipt sides: ours blue, theirs amber (always \"as received\"), a missing side grey and dashed. No side is ever the negative tone: one side missing is not a finding. */\n.cv-sides { display: flex; flex-direction: column; gap: var(--cv-space-2); margin: 0 0 var(--cv-space-3); }\n.cv-sides__case { padding: var(--cv-space-1) var(--cv-space-3); border-radius: var(--cv-radius); font-weight: 600; font-size: var(--cv-font-size-sm); }\n.cv-half { min-width: 0; border-radius: var(--cv-radius); padding: var(--cv-space-1) var(--cv-space-3) var(--cv-space-2); border: 1px solid var(--cv-color-border); }\n.cv-half > .cv-section { margin-bottom: 0; }\n.cv-half__label { font-size: var(--cv-font-size-sm); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--cv-color-text-muted); margin-bottom: var(--cv-space-1); }\n.cv-half--ours { background: var(--cv-color-info-bg); border-color: var(--cv-color-info-fg); }\n.cv-half--theirs { background: var(--cv-color-caution-bg); border-color: var(--cv-color-caution-fg); }\n.cv-half--missing { background: var(--cv-color-neutral-bg); border: 1px dashed var(--cv-color-neutral-fg); }\n.cv-actions { display: flex; flex-wrap: wrap; column-gap: var(--cv-space-3); font-size: var(--cv-font-size-sm); font-weight: 600; color: var(--cv-color-info-fg); }\n.cv-actions__heading { font-weight: 400; color: var(--cv-color-text-muted); }\n\n/* DisclosureBadge and VerdictPill. The pill is scoped to the kit wrapper: the page shell's verification banner is a .cv-pill outside it, and a module's stylesheet must not restyle the banner (the frame check refuses the module). */\n.cv-badge, .cv-kit .cv-pill { display: inline-block; max-width: 100%; font-size: var(--cv-font-size-sm); font-weight: 600; border-radius: var(--cv-radius-pill); padding: 0 var(--cv-space-2); border: 1px solid currentColor; }\n.cv-badge { letter-spacing: 0.02em; }\n/* A state label breaks between words, never inside one. */\n.cv-badge, .cv-kit .cv-pill { overflow-wrap: normal; }\n.cv-refusal { color: var(--cv-color-negative-fg); background: var(--cv-color-negative-bg); border: 1px dashed currentColor; }\n\n/* CitationList */\n.cv-citations { display: flex; flex-direction: column; gap: var(--cv-space-2); counter-reset: cv-cite; }\n.cv-citation { counter-increment: cv-cite; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--cv-space-2); }\n.cv-citation::before { content: \"[\" counter(cv-cite) \"]\"; color: var(--cv-color-text-muted); }\n.cv-citation__ref { display: block; color: var(--cv-color-text-muted); }\n\n/* Drilldown: native details/summary -- opens with no script; prints open. */\n.cv-drilldown { border: 1px solid var(--cv-color-border); border-radius: var(--cv-radius); background: var(--cv-color-surface); }\n.cv-drilldown > summary { cursor: pointer; padding: var(--cv-space-2) var(--cv-space-3); font-weight: 600; color: var(--cv-color-accent); }\n.cv-drilldown__body { padding: 0 var(--cv-space-3) var(--cv-space-3); display: flex; flex-direction: column; gap: var(--cv-space-2); min-width: 0; }\n\n/* EvidenceDetails */\n.cv-evidence { display: flex; flex-direction: column; gap: var(--cv-space-2); }\n.cv-evidence__item { border-left: 3px solid var(--cv-color-border); padding-left: var(--cv-space-3); display: flex; flex-direction: column; gap: var(--cv-space-1); }\n.cv-evidence__head { display: flex; flex-wrap: wrap; gap: var(--cv-space-2); align-items: baseline; }\n.cv-evidence__label { font-weight: 600; }\n\n/* VerificationDetails */\n.cv-verification { display: flex; flex-direction: column; gap: var(--cv-space-2); }\n.cv-verification__outcome { border-radius: var(--cv-radius); padding: var(--cv-space-2) var(--cv-space-3); font-weight: 600; }\n.cv-checks { display: flex; flex-direction: column; gap: var(--cv-space-1); }\n.cv-check { display: flex; flex-wrap: wrap; gap: var(--cv-space-2); align-items: baseline; }\n\n/* PartyCard */\n.cv-party { border: 1px solid var(--cv-color-border); border-radius: var(--cv-radius); padding: var(--cv-space-3); background: var(--cv-color-surface-sunken); }\n.cv-party__role { font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }\n.cv-party__name { font-weight: 600; }\n.cv-party__facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--cv-space-1) var(--cv-space-3); margin-top: var(--cv-space-2); font-size: var(--cv-font-size-sm); }\n.cv-party__facts dt { color: var(--cv-color-text-muted); }\n.cv-party-wrap { container-type: inline-size; }\n@container (max-width: 20rem) { .cv-party__facts { grid-template-columns: minmax(0, 1fr); } }\n\n/* Timeline: entries in the order given. */\n.cv-timeline { border-left: 2px solid var(--cv-color-border); padding-left: var(--cv-space-3); display: flex; flex-direction: column; gap: var(--cv-space-3); }\n.cv-timeline__at { display: block; color: var(--cv-color-text-muted); }\n.cv-timeline__label { font-weight: 600; }\n\n@media print {\n  .cv-kit { background: none; }\n  .cv-drilldown > summary { color: var(--cv-color-text); }\n  /* A closed drilldown still prints its body (Chromium's details-content). */\n  .cv-drilldown::details-content { content-visibility: visible; display: block; }\n  .cv-section, .cv-metric, .cv-party, .cv-table tr, .cv-evidence__item { break-inside: avoid; }\n}\n"; // @generated KIT_CSS
  var CARD_CSS = "/* SPDX-License-Identifier: Apache-2.0\n * The Adjudications page (capsuleviewer.adjudications/v0), on top of kit.css.\n * Colours are kit tokens only (var(--cv-*)). One column on a phone; the strip\n * of four tiles wraps by its own width, and a row's two panels sit side by side\n * from 36rem, one above the other below it. */\n.cv-adj { display: flex; flex-direction: column; gap: var(--cv-space-3); }\n.cv-adj__bar { border: 1px solid var(--cv-color-positive-fg); background: var(--cv-color-positive-bg); color: var(--cv-color-positive-fg); border-radius: var(--cv-radius); padding: var(--cv-space-2) var(--cv-space-3); display: flex; flex-wrap: wrap; column-gap: var(--cv-space-4); }\n.cv-adj__bar strong { font-weight: 700; }\n.cv-adj__core { font-size: var(--cv-font-size-sm); letter-spacing: 0.04em; text-transform: uppercase; color: var(--cv-color-text-muted); }\n.cv-adj__strip { border: 1px solid var(--cv-color-border); border-radius: var(--cv-radius); padding: var(--cv-space-3); display: flex; flex-direction: column; gap: var(--cv-space-3); }\n.cv-adj__tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: var(--cv-space-2); }\n.cv-adj__tile { background: var(--cv-color-surface-sunken); border-radius: var(--cv-radius); padding: var(--cv-space-3); display: flex; flex-direction: column; gap: var(--cv-space-1); }\n.cv-adj__num { font-size: 1.875rem; font-weight: 700; line-height: 1.1; }\n.cv-adj__label { font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); }\n.cv-adj__headline { font-size: 1.5rem; font-weight: 700; line-height: 1.2; }\n.cv-adj__sec-title { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; column-gap: var(--cv-space-3); }\n.cv-adj__num-cell { text-align: right; white-space: nowrap; }\n.cv-adj__rows { display: flex; flex-direction: column; }\n.cv-adj__head { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: var(--cv-space-2); padding: var(--cv-space-2) 0; font-size: var(--cv-font-size-sm); font-weight: 600; color: var(--cv-color-text-muted); border-bottom: 1px solid var(--cv-color-border); }\n.cv-adj__row > summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: var(--cv-space-2); align-items: baseline; cursor: pointer; padding: var(--cv-space-2) 0; border-top: 1px solid var(--cv-color-border); }\n.cv-adj__row:first-child > summary { border-top: none; }\n.cv-adj__pill { display: inline-block; font-size: var(--cv-font-size-sm); font-weight: 600; border-radius: var(--cv-radius-pill); padding: 0 var(--cv-space-2); }\n.cv-adj__pill--met { color: var(--cv-color-positive-fg); background: var(--cv-color-positive-bg); }\n.cv-adj__pill--not_met { color: var(--cv-color-negative-fg); background: var(--cv-color-negative-bg); }\n.cv-adj__pill--other { color: var(--cv-color-neutral-fg); background: var(--cv-color-neutral-bg); }\n.cv-adj__match--concurs { color: var(--cv-color-positive-fg); }\n.cv-adj__match--differs { color: var(--cv-color-caution-fg); font-weight: 600; }\n.cv-adj__match--not_counted, .cv-adj__match--unresolved { color: var(--cv-color-text-muted); }\n.cv-adj__panels { display: grid; grid-template-columns: 1fr; gap: var(--cv-space-2); padding: var(--cv-space-2) 0 var(--cv-space-3); }\n@container (min-width: 36rem) { .cv-adj__panels { grid-template-columns: 1fr 1fr; } }\n.cv-adj__panel { border-radius: var(--cv-radius); padding: var(--cv-space-3); display: flex; flex-direction: column; gap: var(--cv-space-1); }\n.cv-adj__panel--judge-not_met { background: var(--cv-color-negative-bg); }\n.cv-adj__panel--judge-met { background: var(--cv-color-positive-bg); }\n.cv-adj__panel--judge-other { background: var(--cv-color-neutral-bg); }\n.cv-adj__panel--adjudicator { background: var(--cv-color-caution-bg); }\n.cv-adj__panel-title { font-size: var(--cv-font-size-sm); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--cv-color-text-muted); }\n.cv-adj__more { color: var(--cv-color-text-muted); }\n.cv-adj__wrap { container-type: inline-size; }\n"; // @generated CARD_CSS

  var EXTENSION = "x-adjudications/v0";
  var CHECKS = ["bundle", "summary", "records", "recount"];
  var VERDICTS = ["met", "not_met", "not_evaluable", "out_of_scope"];
  var HEX64 = /^[0-9a-f]{64}$/;
  var MAX_SHOWN_AFTER_DIFFERENCES = 3;

  // `check` names the page check the unreadable record belongs to ("summary", or "records" for the rest).
  function InputError(message, check) { this.message = message; this.check = check || "records"; }
  InputError.prototype = Object.create(Error.prototype);
  InputError.prototype.name = "InputError";

  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var isObj = function (v) { return v !== null && typeof v === "object" && !Array.isArray(v); };
  var keys = function (o) { return Object.keys(o); };
  var isCount = function (v) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= 0 && v <= 9007199254740991; };
  var nonEmpty = function (v) { return typeof v === "string" && v.length > 0; };

  // ---- words -------------------------------------------------------------------

  function words(key, values) {
    var text = own(WORDS, key) ? WORDS[key] : key;
    return text.replace(/\{([a-z_]+)\}/g, function (m, name) { return values && own(values, name) ? String(values[name]) : m; });
  }
  var plural = function (base, n, values) { return words(base + (n === 1 ? ".one" : ".other"), values); };

  // Integer arithmetic only: the percentage is k of n, rounded half up, derived
  // where it is drawn and never read from a record.
  function percent(k, n) { return Math.floor((200 * k + n) / (2 * n)); }

  var SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  var TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  // A count in English words up to 99 (the canvas's "Thirty-eight blind re-grades"); digits above.
  function spell(n) {
    if (n < 20) return SMALL[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + SMALL[n % 10] : "");
    return String(n);
  }
  function grouped(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  // ---- reading the bundle ------------------------------------------------------

  // The runtime's verification gate (resolveModules, step 1), for a context the
  // runtime did not gate (a test, a host that calls the module directly).
  function bundleVerified(v) {
    var obj = function (x) { return isObj(x) ? x : {}; };
    var claim = function (c) { return { status: obj(c).status, findings: Array.isArray(obj(c).findings) ? obj(c).findings : [] }; };
    var m = claim(obj(v).perRecordMembership);
    var results = obj(obj(v).capsuleResults);
    var unbound = function (f) { return typeof f === "string" && f.indexOf("membership_record_unbound:") === 0; };
    return isObj(v) && claim(v.graphClosure).status === "pass" && claim(v.intervalCoverage).status === "pass" &&
      (m.status === "pass" || (m.status === "fail" && m.findings.length > 0 && m.findings.every(unbound))) &&
      keys(results).every(function (k) { return obj(results[k]).ok === true; }) &&
      Array.isArray(v.disclosures) && v.disclosures.every(function (d) { return obj(d).status === "disclosure_match" || obj(d).status === "withheld"; });
  }

  function block(bundle) {
    var ext = isObj(bundle) && isObj(bundle.extensions) ? bundle.extensions : {};
    return own(ext, EXTENSION) ? ext[EXTENSION] : undefined;
  }

  function readBlock(b) {
    if (!isObj(b)) throw new InputError("the " + EXTENSION + " block is not an object");
    keys(b).forEach(function (k) { if (k !== "own") throw new InputError("the block carries an unknown member: " + k); });
    if (own(b, "own") && typeof b.own !== "boolean") throw new InputError("the block's own is not a boolean");
    return { own: b.own === true };
  }

  function disclosed(context, id) {
    var r = context.resolvedDisclosures ? context.resolvedDisclosures.get(id) : undefined;
    var input = r && r.agent_input;
    return input && input.state === "disclosed" && isObj(input.payload) ? input.payload : null;
  }

  function digestRef(c, purpose) {
    if (!isObj(c) || !HEX64.test(String(c.digest)) || c.digest_alg !== "SHA-256" || (purpose && c.citation_purpose !== purpose)) throw new InputError("a citation is not in its schema's form");
    return c.digest;
  }

  function readSummary(p) {
    if (!nonEmpty(p.computed_at) || !isObj(p.judge_pin)) throw new InputError("a calibration summary lacks computed_at or judge_pin", "summary");
    digestRef(p.judge_pin, "calibrates");
    if (!Array.isArray(p.clauses) || p.clauses.length === 0) throw new InputError("a calibration summary has no clauses", "summary");
    return {
      computed_at: p.computed_at,
      clauses: p.clauses.map(function (c) {
        var a = isObj(c) ? c.agreement : null;
        var d = isObj(c) ? c.drift : null;
        // AAC section 8: k at most n is a MUST for agreement and for drift, which the schema cannot state.
        var tally = function (t) { return isObj(t) && isCount(t.k) && isCount(t.n) && t.k <= t.n; };
        if (!isObj(c) || !nonEmpty(c.clause_ref) || !tally(a) || !tally(d)) throw new InputError("a clause tally is not k of n with k at most n", "summary");
        return { clause_ref: c.clause_ref, k: a.k, n: a.n };
      }),
    };
  }

  function readRating(p) {
    if (p.blind !== true || !nonEmpty(p.rater_ref) || !nonEmpty(p.label) || !nonEmpty(p.rated_at)) throw new InputError("a human rating is not in its schema's form");
    return { rater: p.rater_ref, label: p.label, rated_at: p.rated_at, case_digest: digestRef(p.case, "rated_case") };
  }

  function readReport(p) {
    if (!Array.isArray(p.cases) || p.cases.length === 0 || !isObj(p.judge_pin) || !nonEmpty(p.judge_pin.model_id)) throw new InputError("an evaluation report is not in its schema's form");
    return {
      model: p.judge_pin.model_id,
      cases: p.cases.map(function (c) {
        if (!isObj(c) || !nonEmpty(c.case_id) || VERDICTS.indexOf(c.verdict) < 0 || !Array.isArray(c.acts)) throw new InputError("a report case is not in its schema's form");
        return { case_id: c.case_id, verdict: c.verdict, acts: c.acts.map(function (a) { return digestRef(a, "grounds"); }) };
      }),
    };
  }

  function counted(v) { return v === "met" || v === "not_met"; }

  // The model: what render draws. A record this page reads that is not in its
  // form throws, and the page draws none of its counts.
  function read(context) {
    var summaries = [], ratings = [], reports = {};
    (Array.isArray(context.bundle.records) ? context.bundle.records : []).forEach(function (r) {
      var id = isObj(r) ? r.capsule_id : undefined;
      var p = typeof id === "string" ? disclosed(context, id) : null;
      if (!p) return;
      if (p.record_version === "calibration-summary/v1") summaries.push(readSummary(p));
      else if (p.record_version === "human-rating/v1") ratings.push(readRating(p));
      else if (p.record_version === "evaluation-report/v1") reports[id] = readReport(p);
    });
    return { summaries: summaries, ratings: ratings, reports: reports };
  }

  function subjectOf(context, report) {
    var c = report.cases[0];
    var act = c.acts.length ? disclosed(context, c.acts[0]) : null;
    var s = act && isObj(act.case) ? act.case : null;
    if (s && nonEmpty(s.task_id) && isCount(s.trial)) return words("subject.trial", { task: s.task_id, trial: s.trial });
    return c.case_id;
  }

  function dateOf(t) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (!m) return t;
    var wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    return words("date", { weekday: words("weekday." + wd), month: words("month." + Number(m[2])), day: Number(m[3]) });
  }

  function buildModel(context) {
    var b = block(isObj(context) ? context.bundle : undefined);
    var ownCopy = isObj(b) && b.own === true;
    var checks = { bundle: "NOT_CHECKED", summary: "NOT_CHECKED", recount: "NOT_CHECKED" };
    if (!bundleVerified(context && context.verification)) return { state: "unverified", own: ownCopy, checks: checks };
    checks.bundle = "PASS";
    checks.records = "PASS";
    var inputs, data;
    try {
      inputs = readBlock(b);
      data = read(context);
    } catch (err) {
      if (!(err instanceof InputError)) throw err;
      checks[err.check] = "FAIL";
      // The error text can quote a record: it is never drawn.
      return { state: "unreadable", own: ownCopy, checks: checks };
    }
    if (data.summaries.length === 0) return { state: "nosummary", own: inputs.own, checks: checks };
    checks.summary = "PASS";

    var terms = {}, order = [], K = 0, N = 0, dates = [];
    data.summaries.forEach(function (s) {
      dates.push(s.computed_at.slice(0, 10));
      s.clauses.forEach(function (c) {
        if (!own(terms, c.clause_ref)) { terms[c.clause_ref] = { term: c.clause_ref, k: 0, n: 0 }; order.push(c.clause_ref); }
        terms[c.clause_ref].k += c.k;
        terms[c.clause_ref].n += c.n;
        K += c.k;
        N += c.n;
      });
    });
    dates.sort();
    var models = [];
    var judged = 0;
    keys(data.reports).forEach(function (id) {
      var r = data.reports[id];
      if (models.indexOf(r.model) < 0) models.push(r.model);
      r.cases.forEach(function (c) { if (counted(c.verdict)) judged += 1; });
    });
    models.sort();

    // Each rating against the one case of the report it cites.
    var rows = data.ratings.map(function (r) {
      var rep = own(data.reports, r.case_digest) ? data.reports[r.case_digest] : null;
      var row = { rater: r.rater, label: r.label, when: dateOf(r.rated_at), rated_at: r.rated_at, cited: rep !== null, judge: null, subject: null, model: null, match: "unresolved" };
      if (rep && rep.cases.length === 1) {
        row.judge = rep.cases[0].verdict;
        row.model = rep.model;
        row.subject = subjectOf(context, rep);
        row.match = counted(row.judge) && counted(r.label) ? (row.judge === r.label ? "concurs" : "differs") : "not_counted";
      }
      return row;
    });
    var resolved = rows.every(function (r) { return r.match !== "unresolved"; });
    if (rows.length && resolved) {
      var rk = rows.filter(function (r) { return r.match === "concurs"; }).length;
      var rn = rk + rows.filter(function (r) { return r.match === "differs"; }).length;
      // Fewer ratings than the summary counts is a gap (a record withheld), not a disagreement.
      var short = rn < N && rk <= K;
      checks.recount = short ? "NOT_CHECKED" : rk === K && rn === N ? "PASS" : "FAIL";
      if (checks.recount === "FAIL") return { state: "mismatch", own: inputs.own, checks: checks };
    }
    // Two summaries may cover one period twice: without the ratings to recount, their sum is not a count.
    if (data.summaries.length > 1 && checks.recount !== "PASS") return { state: "ambiguous", own: inputs.own, checks: checks };
    var rank = { differs: 0, concurs: 1, not_counted: 2, unresolved: 3 };
    rows.sort(function (a, b2) { return rank[a.match] - rank[b2.match] || (a.rated_at < b2.rated_at ? -1 : a.rated_at > b2.rated_at ? 1 : 0); });

    var raters = {}, raterOrder = [];
    rows.forEach(function (r) {
      if (!own(raters, r.rater)) { raters[r.rater] = { rater: r.rater, k: 0, n: 0, sampled: 0 }; raterOrder.push(r.rater); }
      raters[r.rater].sampled += 1;
      if (r.match === "concurs") { raters[r.rater].k += 1; raters[r.rater].n += 1; }
      if (r.match === "differs") raters[r.rater].n += 1;
    });
    raterOrder.sort();
    return {
      state: N === 0 ? "none" : "page",
      own: inputs.own,
      checks: checks,
      k: K, n: N, judged: judged, models: models,
      first: dates[0], last: dates[dates.length - 1],
      terms: order.sort().map(function (t) { return terms[t]; }),
      raters: raterOrder.map(function (r) { return raters[r]; }),
      rows: rows,
      cited: rows.filter(function (r) { return r.cited; }).length,
      blind: rows.length,
    };
  }

  // ---- drawing (the host's document; kit class names) --------------------------

  function el(doc, tag, attrs, children) {
    var node = doc.createElement(tag);
    keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
    });
    return node;
  }

  function section(doc, title, children, attrs) {
    var a = { class: "cv-section", "data-cv": "section" };
    keys(attrs || {}).forEach(function (k) { a[k] = attrs[k]; });
    return el(doc, "section", a, [
      el(doc, "h3", { class: "cv-section__title" }, [title]),
      el(doc, "div", { class: "cv-section__body" }, children),
    ]);
  }

  function drilldown(doc, summary, children, attrs) {
    var a = { class: "cv-drilldown", "data-cv": "drilldown" };
    keys(attrs || {}).forEach(function (k) { a[k] = attrs[k]; });
    return el(doc, "details", a, [el(doc, "summary", {}, [summary]), el(doc, "div", { class: "cv-drilldown__body" }, children)]);
  }

  var voice = function (m) { return m.own ? "own" : "shared"; };
  var code = function (doc, text) { return el(doc, "code", { class: "cv-mono" }, [text]); };

  function pill(doc, v) {
    var tone = v === "met" || v === "not_met" ? v : "other";
    var text = own(WORDS, "verdict." + v) ? words("verdict." + v) : v.replace(/_/g, " ");
    return el(doc, "span", { class: "cv-adj__pill cv-adj__pill--" + tone }, [text]);
  }

  function ratio(k, n) { return n === 0 ? words("term.concurrence.none", { k: k, n: n }) : words("term.concurrence", { k: k, n: n, p: percent(k, n) }); }

  function drawBanner(doc, m) {
    return m.own ? el(doc, "p", { class: "cv-notice cv-tone--caution", "data-banner": "own" }, [el(doc, "strong", {}, [words("banner.own.label")]), " ", words("banner.own.text")]) : null;
  }

  function drawBar(doc, m) {
    if (m.blind === 0) return el(doc, "p", { class: "cv-adj__bar", "data-adj": "contents-checked" }, [el(doc, "strong", {}, [words("bar.label")]), el(doc, "span", {}, [words("bar.none")])]);
    return el(doc, "p", { class: "cv-adj__bar", "data-adj": "contents-checked" }, [
      el(doc, "strong", {}, [words("bar.label")]),
      el(doc, "span", {}, [words("bar.text", { cited: m.cited, total: m.blind, raters: plural("raters", m.raters.length, { n: m.raters.length }) })]),
    ]);
  }

  function drawCore(doc, m) {
    var parts = [plural("core.terms", m.terms.length, { n: m.terms.length })];
    if (m.models.length === 1) parts.push(words("core.judge", { model: m.models[0] }));
    else if (m.models.length > 1) parts.push(words("core.judge.more", { n: m.models.length }));
    parts.push(m.first === m.last ? words("core.computed", { from: m.first }) : words("core.computed.range", { from: m.first, to: m.last }));
    return el(doc, "p", { class: "cv-adj__core", "data-adj": "core" }, [words("core.label") + " · " + parts.join(" · ")]);
  }

  function tile(doc, kind, value, label) {
    return el(doc, "div", { class: "cv-adj__tile", "data-adj-tile": kind }, [el(doc, "span", { class: "cv-adj__num" }, [value]), el(doc, "span", { class: "cv-adj__label" }, [label])]);
  }

  function drawStrip(doc, m) {
    var summed = m.blind === 0;
    var headline = plural(summed ? "headline.summary" : "headline", m.n, { k: plural("headline.agree", m.k, { k: spell(m.k) }), n: spell(m.n) });
    headline = headline.charAt(0).toUpperCase() + headline.slice(1);
    // A rating that is not blind is refused when it is read, so every one drawn states it.
    var blind = m.blind === 0 ? null : words("blind.all." + voice(m));
    return el(doc, "div", { class: "cv-adj__strip", "data-adj": "strip" }, [
      m.core,
      el(doc, "div", { class: "cv-adj__tiles" }, [
        tile(doc, "adjudications", grouped(m.n), m.judged > 0 ? words("tile.n.label.of", { of: grouped(m.judged) }) : words("tile.n.label")),
        tile(doc, "concur", words("tile.concur.value", { k: m.k, n: m.n }), words("tile.concur.label")),
        tile(doc, "differ", words("tile.differ.value", { d: m.n - m.k, n: m.n }), words("tile.differ.label")),
        tile(doc, "percent", words("tile.percent.value", { p: percent(m.k, m.n) }), words("tile.percent.label")),
      ]),
      el(doc, "h2", { class: "cv-adj__headline", "data-adj": "headline" }, [headline]),
      el(doc, "p", {}, [words((summed ? "lede.summary." : "lede.") + voice(m))]),
      blind ? el(doc, "p", { class: "cv-muted", "data-adj": "blind" }, [blind]) : null,
    ].filter(Boolean));
  }

  function table(doc, heads, rows) {
    return el(doc, "div", { class: "cv-table-wrap", "data-cv": "data-table" }, [el(doc, "table", { class: "cv-table" }, [
      el(doc, "thead", {}, [el(doc, "tr", {}, heads.map(function (h) { return el(doc, "th", { scope: "col" }, [h]); }))]),
      el(doc, "tbody", {}, rows),
    ])]);
  }

  function cells(doc, heads, values, attrs) {
    return el(doc, "tr", attrs || {}, values.map(function (v, i) {
      return el(doc, "td", { "data-label": heads[i], class: i > 0 ? "cv-adj__num-cell" : "" }, [v]);
    }));
  }

  function drawTerms(doc, m) {
    var heads = [words("col.term"), words("col.sampled"), words("col.concur"), words("col.differ"), words("col.concurrence")];
    var rows = m.terms.map(function (t) {
      return cells(doc, heads, [code(doc, t.term), String(t.n), String(t.k), String(t.n - t.k), ratio(t.k, t.n)], { "data-term": t.term, "data-k": String(t.k), "data-n": String(t.n) });
    });
    return section(doc, words("section.term"), [table(doc, heads, rows), el(doc, "p", { class: "cv-muted" }, [words("term.note")])], { "data-adj-section": "terms" });
  }

  function drawAdjudicators(doc, m) {
    var body;
    if (m.raters.length === 0) body = [el(doc, "p", {}, [words("adjudicator.none")])];
    else {
      var heads = [words("col.adjudicator"), words("col.sampled"), words("col.concur"), words("col.differ"), words("col.concurrence")];
      body = [
        table(doc, heads, m.raters.map(function (r) {
          return cells(doc, heads, [code(doc, r.rater), String(r.sampled), String(r.k), String(r.n - r.k), ratio(r.k, r.n)], { "data-adjudicator": r.rater });
        })),
        el(doc, "p", { class: "cv-muted" }, [words("adjudicator.book.missing")]),
      ];
    }
    return drilldown(doc, words("section.adjudicator") + " · " + words("adjudicator.hint"), body, { "data-adj-section": "adjudicators" });
  }

  function drawRow(doc, r) {
    var judge = r.judge === null ? null : pill(doc, r.judge);
    var summary = el(doc, "summary", {}, [
      el(doc, "span", {}, [r.subject === null ? "-" : r.subject]),
      el(doc, "span", {}, [code(doc, r.rater)]),
      el(doc, "span", { "data-label": words("col.judge") }, [judge || "-"]),
      el(doc, "span", { "data-label": words("col.adjudicator.said") }, [pill(doc, r.label)]),
      el(doc, "span", { class: "cv-adj__match--" + r.match }, [words("match." + r.match)]),
      el(doc, "span", {}, [r.when]),
    ]);
    var judgeTone = r.judge === "met" || r.judge === "not_met" ? r.judge : "other";
    var panels = r.judge === null
      ? [el(doc, "p", { class: "cv-muted" }, [words("panel.unresolved")])]
      : [
        el(doc, "div", { class: "cv-adj__panel cv-adj__panel--judge-" + judgeTone, "data-adj-panel": "judge" }, [
          el(doc, "p", { class: "cv-adj__panel-title" }, [words("panel.judge") + " · " + r.model]),
          el(doc, "p", {}, [words("panel.judge.said", { verdict: own(WORDS, "verdict." + r.judge) ? words("verdict." + r.judge) : r.judge })]),
          el(doc, "p", { class: "cv-muted" }, [words("panel.judge.words")]),
        ]),
        el(doc, "div", { class: "cv-adj__panel cv-adj__panel--adjudicator", "data-adj-panel": "adjudicator" }, [
          el(doc, "p", { class: "cv-adj__panel-title" }, [words("panel.adjudicator") + " · " + r.rater + " · " + words("panel.blind")]),
          el(doc, "p", {}, [words("panel.adjudicator.said", { verdict: own(WORDS, "verdict." + r.label) ? words("verdict." + r.label) : r.label })]),
          el(doc, "p", { class: "cv-muted" }, [words("panel.adjudicator.words")]),
          r.match === "not_counted" ? el(doc, "p", { class: "cv-muted" }, [words("panel.not_counted", { label: r.label })]) : null,
        ]),
      ];
    return el(doc, "details", { class: "cv-adj__row", "data-adj-row": r.match }, [summary, el(doc, "div", { class: "cv-adj__panels" }, panels)]);
  }

  function drawRows(doc, m) {
    if (m.rows.length === 0) return section(doc, words("section.rows"), [el(doc, "p", {}, [words("rows.none")])], { "data-adj-section": "rows" });
    var differs = m.rows.filter(function (r) { return r.match === "differs"; });
    var rest = m.rows.filter(function (r) { return r.match !== "differs"; });
    var shown = differs.concat(rest.slice(0, MAX_SHOWN_AFTER_DIFFERENCES));
    var hidden = rest.slice(MAX_SHOWN_AFTER_DIFFERENCES);
    var more = null;
    if (hidden.length) {
      var allConcur = hidden.every(function (r) { return r.match === "concurs"; });
      more = el(doc, "p", { class: "cv-adj__more", "data-adj": "more" }, [plural(allConcur ? "rows.more.concur" : "rows.more", hidden.length, { n: hidden.length })]);
    }
    return section(doc, words("section.rows"), [
      el(doc, "div", { class: "cv-adj__head", "aria-hidden": "true" }, [words("col.subject"), words("col.adjudicator"), words("col.judge"), words("col.adjudicator.said"), words("col.match"), words("col.when")].map(function (h) { return el(doc, "span", {}, [h]); })),
      el(doc, "div", { class: "cv-adj__rows" }, shown.map(function (r) { return drawRow(doc, r); })),
      more,
    ], { "data-adj-section": "rows" });
  }

  function drawChecks(doc, m) {
    var rows = CHECKS.map(function (c) {
      return el(doc, "tr", { "data-check": c, "data-check-status": m.checks[c] }, [
        el(doc, "td", { "data-label": words("checks.column.check") }, [words("check." + c)]),
        el(doc, "td", { "data-label": words("checks.column.status") }, [words("status." + m.checks[c].toLowerCase())]),
      ]);
    });
    return drilldown(doc, words("heading.checks"), [
      el(doc, "p", {}, [words("checks.lead")]),
      el(doc, "div", { class: "cv-table-wrap", "data-cv": "data-table" }, [el(doc, "table", { class: "cv-table" }, [
        el(doc, "thead", {}, [el(doc, "tr", {}, [el(doc, "th", { scope: "col" }, [words("checks.column.check")]), el(doc, "th", { scope: "col" }, [words("checks.column.status")])])]),
        el(doc, "tbody", {}, rows),
      ])]),
      el(doc, "p", { class: "cv-muted" }, [words("wording.provenance", { id: PACK.id, sha: PACK.sha256 || "-" })]),
    ], { "data-adj-level": "L2" });
  }

  function drawRefusal(doc, m) {
    var lead = { unverified: "unverified.lead", unreadable: "unreadable.lead", mismatch: "mismatch.lead", nosummary: "nosummary.lead", ambiguous: "ambiguous.lead" }[m.state];
    return el(doc, "div", { class: "cv-adj", "data-adj": m.state }, [
      drawBanner(doc, m),
      el(doc, "h2", {}, [words("refused.title")]),
      el(doc, "p", { class: "cv-notice cv-refusal" }, [words(lead)]),
    ]);
  }

  function drawNone(doc, m) {
    return el(doc, "div", { class: "cv-adj", "data-adj": "none" }, [
      drawBanner(doc, m),
      el(doc, "h2", {}, [words("none.title")]),
      el(doc, "p", {}, [words("none.lead." + voice(m))]),
    ]);
  }

  function ensureStyles(doc) {
    [["cv-kit-css", KIT_CSS], ["cv-adj-css", CARD_CSS]].forEach(function (s) {
      if (!s[1] || doc.getElementById(s[0])) return;
      var style = doc.createElement("style");
      style.id = s[0];
      style.textContent = s[1];
      (doc.head || doc.documentElement).appendChild(style);
    });
  }

  // ---- the module (presentation contract: canRender, buildModel, render) --------

  function canRender(context) { return block(isObj(context) ? context.bundle : undefined) !== undefined; }

  function render(model, host) {
    var doc = host.L0.ownerDocument;
    ensureStyles(doc);
    var l0, l1 = null, l2 = null;
    if (model.state === "page") {
      var strip = drawStrip(doc, Object.assign({}, model, { core: drawCore(doc, model) }));
      l0 = el(doc, "div", { class: "cv-adj", "data-adj": "page" }, [drawBanner(doc, model), drawBar(doc, model), strip]);
      l1 = el(doc, "div", { class: "cv-adj", "data-adj-level": "L1" }, [drawTerms(doc, model), drawAdjudicators(doc, model), drawRows(doc, model)]);
      l2 = el(doc, "div", { class: "cv-adj" }, [drawChecks(doc, model)]);
    } else if (model.state === "none") {
      l0 = drawNone(doc, model);
      l2 = el(doc, "div", { class: "cv-adj" }, [drawChecks(doc, model)]);
    } else {
      l0 = drawRefusal(doc, model);
      if (model.state !== "unverified") l2 = el(doc, "div", { class: "cv-adj" }, [drawChecks(doc, model)]);
    }
    [l0, l1, l2].forEach(function (part, i) {
      if (!part) return;
      var region = [host.L0, host.L1, host.L2][i];
      var wrap = doc.createElement("div");
      wrap.className = "cv-kit cv-adj__wrap";
      wrap.setAttribute("data-adj-module", "capsuleviewer.adjudications/v0");
      wrap.appendChild(part);
      wrap.normalize();
      region.appendChild(wrap);
    });
    if (host.depth === "L2") { var d = host.L2.querySelector("details"); if (d) d.open = true; }
    host.L0.setAttribute("data-adj-state", model.state);
    host.L0.setAttribute("data-adj-copy", model.own ? "own" : "shared");
  }

  var module = { manifest: MANIFEST, title: words("module.title"), canRender: canRender, buildModel: buildModel, render: render };

  root.CapsuleViewerAdjudications = {
    EXTENSION: EXTENSION,
    CHECKS: CHECKS,
    MANIFEST: MANIFEST,
    WORDS: WORDS,
    PACK: PACK,
    module: module,
    percent: percent,
    spell: spell,
    InputError: InputError,
  };
  if (typeof root.EvidenceGraph !== "undefined" && root.EvidenceGraph && typeof root.EvidenceGraph.registerPresentation === "function") {
    root.EvidenceGraph.registerPresentation(module);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
