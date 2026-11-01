// SPDX-License-Identifier: BSD-3-Clause
import type { BundleVerificationResult } from "@action-state-group/agent-action-capsule";
import {
  buildComplianceModel,
  type ComplianceModel,
  type ComplianceFindingModel,
  type ObligationModel,
  type ObligationRowModel,
  type Session,
  type SessionTest,
  type TierReading,
} from "./compliance.js";
import type { CompliancePresentation } from "./compliance-presentation.js";
import { COMPLIANCE_CSS } from "./compliance-styles.js";
import {
  datedText,
  datingStatement,
  notesGap,
  pinAbsence,
  span,
  transcriptRows,
  verificationRows,
  wordingRow,
} from "./outcome-report-view.js";
import { NOT_STATED } from "@action-state-group/agent-action-capsule";
import { spotCheckToggle } from "./spot-check.js";
import { DEFAULT_WORDS, type Words } from "./contract-report-wording.js";
import { ROW_TIERS, type RowTier, type TierOf } from "./evidence-contract.js";
import {
  caseParts,
  judgedOf,
  judgeNote,
  lazyBody,
  levelToggle,
  proofList,
  conversationFold,
  evidenceAction,
  ruleWord,
  wordPill,
  assuranceRow,
  withheldMark,
  reportSummary,
} from "./report-levels.js";
import type {
  ResultClaim,
  ResultRoot,
} from "@action-state-group/agent-action-capsule";
import { renderLegend } from "./report-legend.js";
import { provenanceLines, renderProvenance } from "./report-provenance.js";
import {
  renderCheckYourself,
  expandableRow,
  leadWithProvenance,
} from "./report-front.js";
import { buildVerificationPageModel } from "@action-state-group/agent-action-capsule";

/**
 * The contract-report module's `groups` grouping (contract-report.ts): a
 * report read as requirement groups and the tests under each. The EU AI Act
 * Results are this grouping with the EU AI Act wording pack; every word on
 * it is the pack's (`w`). Drawn by the module in place of `renderResultPage`
 * when the bundle's `eu-ai-act-compliance/v1` extension opts in, after the same verify-first
 * gate every other root family goes through -- nothing here ever runs on a
 * bundle that did not verify. See compliance.ts for where every value on the
 * page comes from: counts, verdicts, test wording, tiers and the pack from
 * the sealed records (or "not stated"); the regulatory mapping from the
 * producer's extension, labelled as such.
 *
 * Two levels and no more (report-levels.ts): the summary states what was
 * checked and the result per obligation and test; toggle 1 on a test opens
 * the sessions behind its exceptions, listed in place and each readable as
 * it stands (every test's result by name, the conversation and its tool
 * calls); toggle 2 in a session opens its proofs. The methodology, mapping and bundle checks sit
 * in one proofs toggle at the foot of the page.
 *
 * The whole card renders inside one `.cc`-classed wrapper with its own
 * `<style>` (`COMPLIANCE_CSS`) as its first child.
 */

function element(tag: string, text?: string): HTMLElement {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  return value;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const value = element(tag, text);
  value.className = className;
  return value;
}

/**
 * Producer text: the eu-ai-act-compliance/v1 mapping, carried beside the
 * signed records and signed by no one. Set in italics (`<i>`, the browser's
 * own style) and tagged `data-source="producer"`, so it never reads as a
 * sealed finding; the summary's basis line says what the italics mean.
 */
function producerText(w: Words, ...content: (string | Node)[]): HTMLElement {
  const value = element("i");
  value.append(...content);
  value.dataset.source = "producer";
  // The tooltip comes from the card's own pack, per render.
  value.title = w.t("groups.producer.title");
  return value;
}

/** `text` in an element of its own, as producer text when `producer` is true. */
function maybeProducer(
  w: Words,
  tag: string,
  className: string,
  text: string,
  producer: boolean,
): HTMLElement {
  if (!producer) return el(tag, className, text);
  const value = el(tag, className);
  value.append(producerText(w, text));
  return value;
}

const fmt = (n: number): string => n.toLocaleString();
/** `{n} <noun>` from the pack's `groups.count.<noun>.one|other`. */
const count = (w: Words, noun: string, n: number): string =>
  w.p(`groups.count.${noun}`, n, { n: fmt(n) });

const SEVERITY_CLASS: Record<string, string> = {
  High: "high",
  Medium: "medium",
  Low: "low",
};

/** The producer's severity, as the producer's: an unknown value gets no colour of its own, never "medium". */
function severityPill(severity: string, w: Words): HTMLElement {
  const cls = Object.hasOwn(SEVERITY_CLASS, severity)
    ? SEVERITY_CLASS[severity]
    : undefined;
  const pill = el("span", cls === undefined ? "sev" : `sev ${cls}`);
  pill.append(producerText(w, severity));
  return pill;
}

function tierBadge(tier: TierReading, w: Words): HTMLElement {
  const key =
    tier === "judged" || tier === "recomputed" || tier === "mixed"
      ? tier
      : "unstated";
  const badge = el(
    "span",
    `kind ${tier === "judged" || tier === "recomputed" ? tier : "unstated"}`,
    w.t(`groups.tier.${key}`),
  );
  badge.dataset.tier = tier;
  badge.title =
    tier === "judged" || tier === "recomputed"
      ? w.t(`groups.tier.${tier}.title`)
      : "";
  return badge;
}

function statusPill(statusClass: string, text: string): HTMLElement {
  return el("span", `st ${statusClass}`, text);
}

/**
 * A word a host pack sets for this contract (contract-report/v1 section 3:
 * `group.<segment>.title`, `row.<requirement_ref>.label` and the rest),
 * drawn in the page's own voice and tagged `data-wording="pack"`: never
 * producer text, never a sealed record.
 */
function packWord(tag: string, className: string, text: string): HTMLElement {
  const value = el(tag, className, text);
  value.dataset.wording = "pack";
  return value;
}

/** A test's name: the pack's `row.<ref>.label` when it sets one, else the producer's label or the test id made readable. */
function rowName(
  w: Words,
  tag: string,
  className: string,
  row: Pick<ObligationRowModel, "criterionId" | "name" | "producerName">,
): HTMLElement {
  const label = w.row(row.criterionId, "label");
  return label !== undefined
    ? packWord(tag, className, label)
    : maybeProducer(w, tag, className, row.name, row.producerName);
}

/** An obligation's heading after its article: the pack's `group.<segment>.title` when it sets one, else the producer's title. */
function obligationName(
  w: Words,
  obligation: ObligationModel,
  article: HTMLElement,
): (string | Node)[] {
  const title = w.group(obligation.key);
  if (title !== undefined)
    return [article, packWord("span", "", ` · ${title}`)];
  return obligation.mapped
    ? [producerText(w, article, ` · ${obligation.title}`)]
    : [article, element("span", ` · ${obligation.title}`)];
}

/** Each test's short name, by its criterion id, as producer text when it is the producer's label. */
function testNames(
  model: ComplianceModel,
  w: Words,
): (criterionId: string, tag: string, className: string) => HTMLElement {
  const rows = new Map(
    model.obligations.flatMap((o) =>
      o.rows.map((r) => [r.criterionId, r] as const),
    ),
  );
  return (criterionId, tag, className) => {
    const row = rows.get(criterionId);
    return rowName(w, tag, className, {
      criterionId,
      name: row?.name ?? criterionId,
      producerName: row?.producerName === true,
    });
  };
}

function sessionSpan(model: ComplianceModel, w: Words): string | undefined {
  const days = model.sessions
    .map((s) => s.day)
    .filter((d) => d !== NOT_STATED)
    .sort();
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return undefined;
  return first === last ? first : w.t("card.span", { from: first, to: last });
}

// ---------------------------------------------------------------------------
// Headline: how many sessions met every test that applied to them
// ---------------------------------------------------------------------------

/**
 * A session's result, by the rule the outcome card uses for a conversation
 * (`conversationStatus`): any not-met test makes it missed; failing that, a
 * test that could not be verified; failing that, one nobody could decide;
 * and a session with no test that applied is its own count, never "met".
 * Tests not yet in force are outside the session's population (Result v0
 * section 4.3).
 */
export type SessionStatus =
  | "met"
  | "missed"
  | "unverified"
  | "undecided"
  | "nothing-applied";

export function sessionStatus(
  session: Session,
  tierOf?: TierOf,
): SessionStatus {
  // A test the contract marks informational is reported, never in the
  // session's answer (contract-report/v1 section 2). A test whose tier is
  // not stated stays in.
  const applied = session.tests.filter(
    (t) =>
      (tierOf === undefined ||
        tierOf(t.claim?.contractRef, t.criterionId) !== "informational") &&
      t.verdict !== "not_applicable" &&
      t.verdict !== "out_of_scope" &&
      t.verdict !== "not_yet_in_force",
  );
  if (applied.some((t) => t.verdict === "not_met")) return "missed";
  if (
    applied.some((t) => t.verdict === "failed" || t.verdict === "unsupported")
  )
    return "unverified";
  if (applied.some((t) => t.verdict === "not_evaluable")) return "undecided";
  return applied.length === 0 ? "nothing-applied" : "met";
}

/** The page's one sentence of whole-number counts, as the canvas opens with them; empty when there is no session. */
export function headlineSentence(
  model: ComplianceModel,
  w: Words,
  tierOf?: TierOf,
): string {
  if (model.totalSessions === 0) return "";
  const by = (status: SessionStatus): number =>
    model.sessions.filter((s) => sessionStatus(s, tierOf) === status).length;
  const parts = [
    w.p("groups.headline", model.totalSessions, {
      met: fmt(by("met")),
      n: fmt(model.totalSessions),
    }),
    w.t("groups.headline.missed", { n: fmt(by("missed")) }),
  ];
  for (const [status, key] of [
    ["unverified", "groups.headline.unverified"],
    ["undecided", "groups.headline.undecided"],
    ["nothing-applied", "groups.headline.nothing-applied"],
  ] as const)
    if (by(status) > 0) parts.push(w.t(key, { n: fmt(by(status)) }));
  return parts.join(" ");
}

/**
 * The line an obligation's heading carries: its worst test, derived from
 * the sealed counts and never stated by the producer. Not met comes first,
 * then could not be verified, then could not be decided; the count is of the
 * sessions the test applied to (`population`). Undefined when no test of the
 * obligation has a result to read.
 */
export function obligationWorst(
  obligation: ObligationModel,
  totalSessions: number,
  w: Words,
): { kind: string; text: string } | undefined {
  const inForce = obligation.rows.filter((r) => !nothingChecked(r));
  if (inForce.length === 0) return undefined;
  const most = (count: (r: ObligationRowModel) => number) =>
    inForce.reduce<ObligationRowModel | undefined>(
      (best, r) =>
        count(r) > (best === undefined ? 0 : count(best)) ? r : best,
      undefined,
    );
  const picks: [string, string, (r: ObligationRowModel) => number][] = [
    ["not_met", "groups.ob.worst.not_met", (r) => r.notMetCount],
    ["unverified", "groups.ob.worst.unverified", (r) => r.unverifiedCount],
    ["undecided", "groups.ob.worst.undecided", (r) => r.notEvaluableCount],
  ];
  for (const [kind, key, countOf] of picks) {
    const row = most(countOf);
    if (row === undefined) continue;
    return {
      kind,
      text: w.t(key, {
        n: fmt(countOf(row)),
        sessions: count(w, "session", population(row, totalSessions)),
      }),
    };
  }
  // "Met" is said only when every test with a result was met by a session:
  // a test whose sessions were all judged out of scope was never met.
  if (inForce.some((r) => r.metCount === 0)) return undefined;
  return { kind: "clean", text: w.t("groups.ob.worst.clean") };
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function renderHeader(
  host: HTMLElement,
  model: ComplianceModel,
  w: Words,
  tierOf: TierOf | undefined,
): void {
  const hd = el("div", "hd");
  hd.dataset.section = "header";
  // The report's name is the pack's (`groups.kicker`). The regulation is
  // the producer's mapping, so it opens L1 (renderSummary), never L0
  // (presentation contract section 6).
  hd.append(el("h1", "", w.t("groups.kicker")));
  const summary = reportSummary(w);
  if (summary !== undefined) hd.append(summary);
  const pack =
    model.pack.id === NOT_STATED
      ? w.t("groups.pack.not-stated")
      : w.t("groups.pack", { id: model.pack.id, version: model.pack.version });
  const period = sessionSpan(model, w);
  const vars = {
    pack,
    obligations: count(w, "obligation", model.obligations.length),
    sessions: count(w, "session", model.totalSessions),
  };
  hd.append(
    el(
      "div",
      "sub",
      period === undefined
        ? w.t("groups.sub", vars)
        : w.t(
            model.dating.basis === "judged"
              ? "groups.sub.judged"
              : "groups.sub.dated",
            { ...vars, period },
          ),
    ),
  );
  const sentence = headlineSentence(model, w, tierOf);
  if (sentence !== "") {
    const headline = el("p", "sub headline", sentence);
    headline.dataset.headline = "groups";
    hd.append(headline);
  }
  host.append(hd);
}

// ---------------------------------------------------------------------------
// Summary: what was checked and what we found
// ---------------------------------------------------------------------------

/** A test no session has a met, not-met, undecided or unverified result for: nothing was checked. */
function nothingChecked(row: ObligationRowModel): boolean {
  return (
    row.metCount +
      row.notMetCount +
      row.notEvaluableCount +
      row.outOfScopeCount +
      row.unverifiedCount ===
    0
  );
}

/** No session with a result for this test met it, did not, or was judged out of scope: every one was undecided or could not be verified. */
function noneDecided(row: ObligationRowModel): boolean {
  return (
    row.metCount === 0 && row.notMetCount === 0 && row.outOfScopeCount === 0
  );
}

/** The sessions a test's population counts: not the ones it did not apply to, and not the ones whose claim is not yet in force (Result v0 section 4.3). */
function population(row: ObligationRowModel, totalSessions: number): number {
  return totalSessions - row.notApplicableCount - row.notYetInForceCount;
}

/** Every claim for this test is not yet in force: readiness only, nothing in force to count (Result v0 section 4.3). */
function allLater(row: ObligationRowModel): boolean {
  return nothingChecked(row) && row.notYetInForceCount > 0;
}

/**
 * An obligation's status, from the sealed counts alone. Its applicability
 * (in force, or from a later date) is the producer's mapping: it is never
 * drawn in this pill, which speaks only for the records, and is shown
 * instead in the producer's own italic line beside the title.
 *
 * "No exceptions", in the ok tone, only when every one of its tests was met
 * by at least one session and no session's result for it was not met: an
 * obligation one of whose tests no session met (every result undecided,
 * unverified or absent) does not read clean. When none of its tests could
 * be checked it reads "Could not be checked"; when some could not, the pill
 * is neutral and says how many.
 */
export function obligationStatus(
  obligation: ObligationModel,
  w: Words = DEFAULT_WORDS.groups,
): {
  cls: string;
  text: string;
} {
  const exceptions = obligation.rows.reduce((sum, r) => sum + r.notMetCount, 0);
  // Result v0 section 4.3: only when every test is wholly later is there no
  // population to have no exceptions in. A test in force whose claims all
  // failed verification is still in force: its failure is never hidden
  // behind "Not yet in force".
  if (obligation.rows.length > 0 && obligation.rows.every(allLater))
    return { cls: "na", text: w.t("groups.ob.later") };
  // A wholly later test was not "could not be checked": it is not in force
  // yet, so it is left out of both counts.
  const inForce = obligation.rows.filter((r) => !allLater(r));
  const unchecked = inForce.filter((r) => noneDecided(r)).length;
  const unverified = obligation.rows.reduce(
    (sum, r) => sum + r.unverifiedCount,
    0,
  );
  const total = inForce.length;
  const uncheckedText =
    unchecked > 0
      ? w.t("groups.ob.unchecked-of", {
          unchecked: fmt(unchecked),
          total: count(w, "test", total),
        })
      : "";
  if (exceptions > 0)
    return {
      cls: "exc",
      text: `${count(w, "exception", exceptions)}${unchecked > 0 && unchecked < total ? uncheckedText : ""}`,
    };
  if (unchecked === total)
    return { cls: "ne", text: w.t("groups.ob.unchecked") };
  if (unchecked > 0)
    return { cls: "ne", text: `${w.t("groups.ob.ok.found")}${uncheckedText}` };
  if (unverified > 0)
    return {
      cls: "ne",
      text: w.t("groups.ob.ok.unverified", {
        unverified: count(w, "result", unverified),
      }),
    };
  return { cls: "ok", text: w.t("groups.ob.ok") };
}

/** A test's result in the summary: a status, and an optional note under it. */
export function rowStatus(
  row: ObligationRowModel,
  w: Words = DEFAULT_WORDS.groups,
): { cls: string; text: string; note?: string; producerNote?: true } {
  if (allLater(row))
    return {
      cls: "na",
      text: w.t("groups.row.later"),
      note: w.t("groups.row.later-note", { n: fmt(row.notYetInForceCount) }),
    };
  if (nothingChecked(row))
    return { cls: "ne", text: w.t("groups.row.nothing") };
  if (noneDecided(row)) {
    const packNotEvaluable =
      row.notEvaluableCount > 0
        ? w.row(row.criterionId, "not_evaluable")
        : undefined;
    // Module-only notes a producer or pack word never speaks for: unverified
    // and not-yet-in-force claims can coexist with an undecided row, and
    // both must still be said, whichever of the two branches below applies.
    const moduleNotes = [
      ...(row.unverifiedCount > 0
        ? [w.t("groups.row.unverified-note", { n: fmt(row.unverifiedCount) })]
        : []),
      ...(row.notYetInForceCount > 0
        ? [w.t("groups.row.later-note", { n: fmt(row.notYetInForceCount) })]
        : []),
    ];
    if (packNotEvaluable !== undefined)
      return {
        cls: "ne",
        text: w.t("groups.row.none-decided"),
        note: [packNotEvaluable, ...moduleNotes].join("; "),
      };
    if (row.notEvaluableNote !== undefined && row.notEvaluableCount > 0)
      return {
        cls: "ne",
        text: w.t("groups.row.none-decided"),
        note: row.notEvaluableNote,
        producerNote: true,
      };
    return {
      cls: "ne",
      text: w.t("groups.row.none-decided"),
      ...(moduleNotes.length > 0 ? { note: moduleNotes.join("; ") } : {}),
    };
  }
  const notes = [
    ...(row.notEvaluableCount > 0
      ? [w.t("groups.row.undecided-note", { n: fmt(row.notEvaluableCount) })]
      : []),
    ...(row.unverifiedCount > 0
      ? [w.t("groups.row.unverified-note", { n: fmt(row.unverifiedCount) })]
      : []),
    ...(row.outOfScopeCount > 0
      ? [w.t("groups.row.out-of-scope-note", { n: fmt(row.outOfScopeCount) })]
      : []),
    ...(row.notYetInForceCount > 0
      ? [w.t("groups.row.later-note", { n: fmt(row.notYetInForceCount) })]
      : []),
  ];
  const undecided = notes.length > 0 ? { note: notes.join("; ") } : {};
  if (row.notMetCount > 0)
    return {
      cls: "exc",
      text: w.p("groups.row.exceptions", row.notMetCount, {
        n: fmt(row.notMetCount),
      }),
      ...undecided,
    };
  // Every decided result was judged out of scope: it did not arise, which
  // is never met (Result v0 section 4.2), so never "no exceptions" either.
  if (row.metCount === 0)
    return { cls: "na", text: w.t("groups.row.out-of-scope"), ...undecided };
  // Neither word set says more than "no exceptions": a session's result
  // that was met is all the records show, never "established in every
  // session".
  return {
    cls: row.unverifiedCount > 0 ? "ne" : "ok",
    text: w.t(
      row.notEvaluableCount === 0
        ? "groups.row.ok.all-decided"
        : "groups.row.ok",
    ),
    ...undecided,
  };
}

function rowResult(
  row: ObligationRowModel,
  model: ComplianceModel,
  result: ResultRoot,
  w: Words,
): HTMLElement {
  const cell = document.createElement("td");
  const status = rowStatus(row, w);
  cell.append(statusPill(status.cls, status.text));
  if (status.note !== undefined)
    cell.append(
      maybeProducer(
        w,
        "div",
        "applic",
        status.note,
        status.producerNote === true,
      ),
    );
  // The pill and its note state a count per verdict: each count that is not
  // zero gets its own Show-evidence action, named by what it counts.
  const what: readonly [Bucket, string][] = [
    ["not_met", w.t("groups.verdict.not_met")],
    ["not_evaluable", w.t("groups.verdict.not_evaluable.judged")],
    [
      "unverified",
      `${w.t("groups.verdict.failed")} / ${w.t("groups.verdict.unsupported")}`,
    ],
    ["out_of_scope", w.t("groups.verdict.out_of_scope")],
    ["not_yet_in_force", w.t("groups.verdict.not_yet_in_force")],
  ];
  for (const [bucket, word] of what) {
    const ids = row.sessionsByVerdict.get(bucket) ?? [];
    const action = evidenceAction(
      `test:${row.criterionId}:${bucket}`,
      `${row.name} · ${word}: ${fmt(ids.length)}`,
      ids.map((id) => claimOf(model, id, row.criterionId)),
      result,
      w,
      w.t("evidence.show.for", { what: word }),
    );
    if (action !== undefined) cell.append(action);
  }
  return cell;
}

type Bucket = Parameters<ObligationRowModel["sessionsByVerdict"]["get"]>[0];

/** The claim behind one session's result for one test, if it has one. */
function claimOf(
  model: ComplianceModel,
  conversationId: string,
  criterionId: string,
): ResultClaim | undefined {
  return model.sessions
    .find((s) => s.conversationId === conversationId)
    ?.tests.find((t) => t.criterionId === criterionId)?.claim;
}

/**
 * The sessions a test's population counts (`population`), as claims: every
 * session but the ones it did not apply to and the ones not yet in force.
 */
function populationClaims(
  row: ObligationRowModel,
  model: ComplianceModel,
): (ResultClaim | undefined)[] {
  const outside = new Set([
    ...(row.sessionsByVerdict.get("not_applicable") ?? []),
    ...(row.sessionsByVerdict.get("not_yet_in_force") ?? []),
  ]);
  return model.sessions
    .filter((s) => !outside.has(s.conversationId))
    .map((s) => s.tests.find((t) => t.criterionId === row.criterionId)?.claim);
}

function renderSummary(
  host: HTMLElement,
  model: ComplianceModel,
  presentation: CompliancePresentation,
  result: ResultRoot,
  w: Words,
  tierOf: TierOf | undefined,
): void {
  const section = el("section", "");
  section.dataset.section = "summary";
  const regulation = maybeProducer(w, "p", "kicker", model.regulation, true);
  regulation.dataset.regulation = "";
  section.append(regulation, el("h2", "", w.t("groups.summary.h")));
  const tests = model.obligations.reduce((n, o) => n + o.rows.length, 0);
  section.append(
    el(
      "p",
      "lede",
      w.t("groups.summary.lede", {
        tests: count(w, "test", tests),
        obligations: count(w, "obligation", model.obligations.length),
      }),
    ),
  );
  const table = document.createElement("table");
  table.className = "grid sum";
  table.dataset.rows = "summary";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(
    element("th", w.t("groups.summary.col.test")),
    el("th", "n", w.t("groups.summary.col.checked-in")),
    element("th", w.t("groups.summary.col.result")),
  );
  thead.append(headRow);
  table.append(thead);
  // With a contract, each test's requirement tier (contract-report/v1
  // section 2): tests are drawn in tier sections, must-have first, then
  // informational, then those whose tier is not stated, and an obligation
  // heads each section it has tests in. Its worst line reads only that
  // section's tests, so an informational test changes no must-have line.
  // Without a contract, one section, as before.
  // Read by the contract_ref of the claims behind the test, as the
  // headline reads each session's test (`sessionStatus`).
  const tierOfRow = (row: ObligationRowModel): RowTier | undefined =>
    tierOf?.(
      model.sessions
        .flatMap((s) => s.tests)
        .find((t) => t.criterionId === row.criterionId && t.claim)?.claim
        ?.contractRef,
      row.criterionId,
    );
  const allRows = model.obligations.flatMap((o) => o.rows);
  const sections: readonly (RowTier | undefined)[] =
    tierOf === undefined
      ? [undefined]
      : ROW_TIERS.filter((tier) => allRows.some((r) => tierOfRow(r) === tier));
  for (const tier of sections) {
    if (tier !== undefined) {
      const head = document.createElement("tbody");
      head.dataset.requirementTier = tier;
      const tr = el("tr", "tier");
      tr.dataset.requirementTier = tier;
      const cell = el("td", "");
      cell.setAttribute("colspan", "3");
      cell.append(
        el(
          "b",
          "",
          w.t(`groups.rtier.${tier}.title`, {
            n: fmt(allRows.filter((r) => tierOfRow(r) === tier).length),
          }),
        ),
        el("small", "", w.t(`groups.rtier.${tier}.note`)),
      );
      tr.append(cell);
      head.append(tr);
      table.append(head);
    }
    for (const given of model.obligations) {
      const obligation: ObligationModel =
        tier === undefined
          ? given
          : { ...given, rows: given.rows.filter((r) => tierOfRow(r) === tier) };
      if (obligation.rows.length === 0) continue;
      const tbody = document.createElement("tbody");
      tbody.dataset.obligationGroup = obligation.key;
      const row = el("tr", "ob");
      row.dataset.obligation = obligation.key;
      // A group heading (contract-report/v1 section 2): its tests are the
      // rows. No tally sums the tests' sessions here. The heading opens to
      // the obligation's plain-language text and when it applies, kept
      // together (decision D3).
      const title = el("td", "");
      title.setAttribute("colspan", "3");
      const name = el("b", "obn");
      name.append(
        ...obligationName(w, obligation, el("span", "art", obligation.article)),
      );
      title.append(name);
      const worst = obligationWorst(obligation, model.totalSessions, w);
      if (worst !== undefined) {
        const line = el("div", "applic worst", worst.text);
        line.dataset.worst = worst.kind;
        title.append(line);
      }
      row.append(title);
      tbody.append(row);
      const about = el("tr", "drill-row ob-about");
      about.dataset.aboutFor = obligation.key;
      const aboutCell = el("td", "");
      aboutCell.setAttribute("colspan", "3");
      about.append(aboutCell);
      expandableRow(
        row,
        name,
        about,
        () => {
          const body = el("div", "ob-x");
          if (obligation.plain !== NOT_STATED)
            body.append(
              maybeProducer(w, "div", "plain", obligation.plain, true),
            );
          body.append(
            maybeProducer(
              w,
              "div",
              "applic",
              obligation.applicability.note,
              obligation.mapped,
            ),
          );
          return body;
        },
        tier === undefined
          ? `ob-${obligation.key}`
          : `ob-${obligation.key}-${tier}`,
        true,
      );
      tbody.append(about);
      for (const test of obligation.rows) {
        const tr = el("tr", "test");
        tr.dataset.criterion = test.criterionId;
        const counted = population(test, model.totalSessions);
        tr.dataset.population = String(counted);
        tr.dataset.outOfScope = String(test.outOfScopeCount);
        tr.dataset.notYetInForce = String(test.notYetInForceCount);
        tr.dataset.exceptions = String(test.notMetCount);
        tr.dataset.notEvaluable = String(test.notEvaluableCount);
        tr.dataset.unverified = String(test.unverifiedCount);
        const nameCell = el("td", "tn");
        const head = el("div", "tnh");
        const testName = rowName(w, "b", "", test);
        head.append(testName, tierBadge(test.tier, w));
        if (tier !== undefined) {
          tr.dataset.requirementTier = tier;
          const chip = el("span", "rtier", w.t(`requirement_tier.${tier}`));
          chip.dataset.requirementTier = tier;
          head.append(chip);
        }
        nameCell.append(head);
        const detail = w.row(test.criterionId, "detail");
        if (detail !== undefined)
          nameCell.append(packWord("div", "plain", detail));
        const sessionIds = [
          ...(test.sessionsByVerdict.get("not_met") ?? []),
          ...(test.sessionsByVerdict.get("unverified") ?? []),
          ...(test.sessionsByVerdict.get("not_evaluable") ?? []),
        ];
        const checkedIn = el("td", "n");
        checkedIn.dataset.column = "checked-in";
        checkedIn.append(el("span", "nv", count(w, "session", counted)));
        const action = evidenceAction(
          `test:${test.criterionId}:checked-in`,
          `${test.name} · ${w.t("groups.summary.col.checked-in")}: ${count(w, "session", counted)}`,
          populationClaims(test, model),
          result,
          w,
        );
        if (action !== undefined) checkedIn.append(action);
        tr.append(nameCell, checkedIn, rowResult(test, model, result, w));
        tbody.append(tr);
        // The row itself opens the sessions behind it, in a full-width row
        // below it, so each one reads at the table's width.
        if (sessionIds.length > 0) {
          const drillRow = el("tr", "drill-row");
          drillRow.dataset.drillFor = test.criterionId;
          const cell = document.createElement("td");
          cell.setAttribute("colspan", "3");
          drillRow.append(cell);
          const toggle = expandableRow(
            tr,
            testName,
            drillRow,
            () => renderSessionList(sessionIds, model, presentation, w),
            `test-${obligation.key}-${test.criterionId}`,
          );
          toggle.dataset.records = "sessions";
          toggle.dataset.drill = test.criterionId;
          tbody.append(drillRow);
        }
      }
      table.append(tbody);
    }
  }
  section.append(table);
  const notes = el("aside", "footnotes");
  notes.dataset.section = "footnotes";
  const basis = el("p", "", w.t("groups.summary.basis"));
  basis.dataset.basis = "terms";
  notes.append(basis);
  section.append(notes);
  host.append(section);
}

/**
 * The producer's findings (severity, recommendation), in one block under a
 * fixed label: presentation text, not evidence (presentation contract
 * section 6). Each finding's session count is the claims'; nothing here
 * tallies the findings themselves.
 */
function renderFindings(
  host: HTMLElement,
  model: ComplianceModel,
  w: Words,
): void {
  if (model.findings.length === 0) return;
  const section = el("section", "findings");
  section.dataset.section = "findings";
  section.dataset.producer = "";
  section.append(
    el("div", "plabel", w.t("front.findings.label")),
    el("h2", "", w.t("front.findings.h")),
  );
  for (const finding of model.findings)
    section.append(renderFinding(finding, w));
  host.append(section);
}

function renderFinding(finding: ComplianceFindingModel, w: Words): HTMLElement {
  const box = el("div", "fnd");
  box.dataset.finding = finding.id;
  const fh = el("div", "fh");
  fh.append(
    maybeProducer(w, "b", "", w.t("groups.finding", { id: finding.id }), true),
    severityPill(finding.severity, w),
    element("span", count(w, "session", finding.sessionIds.length)),
  );
  box.append(fh);
  box.append(maybeProducer(w, "div", "rec", finding.recommendation, true));
  const own = el("div", "own", w.t("groups.finding.owner"));
  own.append(producerText(w, finding.ownerDue));
  box.append(own);
  return box;
}

// ---------------------------------------------------------------------------
// Level 1: sessions, listed in place, each readable as it stands
// ---------------------------------------------------------------------------

function renderSessionList(
  conversationIds: readonly string[],
  model: ComplianceModel,
  presentation: CompliancePresentation,
  w: Words,
): HTMLElement {
  const byId = new Map(model.sessions.map((s) => [s.conversationId, s]));
  const list = el("div", "convs");
  list.dataset.sessionCount = String(conversationIds.length);
  for (const id of conversationIds) {
    const session = byId.get(id);
    if (session !== undefined)
      list.append(renderSession(session, model, presentation, w));
  }
  return list;
}

/**
 * A claim not yet in force, in words: its date as the producer copied it
 * from the contract, never checked here, and never counted; beside it, the
 * conditions that narrow when or to whom the obligation binds, in the
 * pack's words (`row.<ref>.detail`), never the presentation block's (a
 * hint with dates of its own). The date is never drawn alone (decision
 * D3): with no such words, the line says the conditions are not stated.
 */
function laterNote(test: SessionTest, w: Words, tag: string): HTMLElement {
  // A claim is later only when it carries applies_from (Result v0 4.3).
  const note = el(
    tag,
    "applic",
    w.t("groups.later.note", { date: test.claim?.appliesFrom ?? "" }),
  );
  const conditions = w.row(test.criterionId, "detail");
  note.append(
    " ",
    conditions === undefined
      ? w.t("groups.later.conditions-not-stated")
      : packWord("span", "", conditions),
  );
  return note;
}

function isException(test: SessionTest): boolean {
  return test.verdict === "not_met";
}

function isUnverified(test: SessionTest): boolean {
  return test.verdict === "failed" || test.verdict === "unsupported";
}

/** One session, in place inside a level-1 toggle: a header line and its body right below it, never a toggle of its own; the body is built when it scrolls near the view. */
function renderSession(
  session: Session,
  model: ComplianceModel,
  presentation: CompliancePresentation,
  w: Words,
): HTMLElement {
  const names = testNames(model, w);
  const exceptions = session.tests.filter(isException);
  const unverified = session.tests.filter(isUnverified);
  const undecided = session.tests.filter((t) => t.verdict === "not_evaluable");
  const parts = caseParts(session.conversationId, w);
  const item = el("article", "conv session");
  item.dataset.session = session.conversationId;
  const head = el("div", "conv-h");
  head.append(el("span", "cid", parts.label));
  head.append(
    exceptions.length > 0
      ? wordPill(
          { word: count(w, "exception", exceptions.length), tone: "bad" },
          "exceptions",
        )
      : unverified.length > 0
        ? wordPill(
            { word: w.t("groups.session.unverified"), tone: "ne" },
            "unverified",
          )
        : undecided.length > 0
          ? wordPill(
              { word: w.t("groups.session.undecided"), tone: "ne" },
              "undecided",
            )
          : session.tests.some((t) => t.verdict === "met")
            ? wordPill({ word: w.t("groups.session.ok"), tone: "ok" }, "ok")
            : wordPill(
                { word: w.t("groups.session.none"), tone: "na" },
                "none",
              ),
  );
  const why = el("span", "cwhy");
  (exceptions.length > 0
    ? exceptions
    : unverified.length > 0
      ? unverified
      : undecided
  ).forEach((t, i) => {
    if (i > 0) why.append(", ");
    why.append(names(t.criterionId, "span", ""));
  });
  head.append(why);
  head.append(el("span", "cmodel", parts.model ?? session.day));
  item.append(head);
  const body = el("div", "conv-slot");
  item.append(body);
  lazyBody(body, () => sessionBody(session, model, presentation, w));
  return item;
}

function sessionBody(
  session: Session,
  model: ComplianceModel,
  presentation: CompliancePresentation,
  w: Words,
): HTMLElement {
  const names = testNames(model, w);
  const body = el("div", "conv-b");
  body.append(el("h4", "", w.t("groups.h.test-by-test")));
  for (const test of session.tests) {
    const box = el("div", "ck");
    box.dataset.crit = test.criterionId;
    box.dataset.critVerdict = test.verdict;
    const h = el("div", "h");
    h.append(
      wordPill(
        ruleWord(
          test.verdict,
          judgedOf(test.reportState, test.judgePinDigest),
          w,
        ),
        test.verdict,
      ),
    );
    h.append(names(test.criterionId, "span", "tname"));
    if (
      test.verdict !== "not_applicable" &&
      test.verdict !== "not_yet_in_force"
    )
      h.append(tierBadge(test.tier, w));
    if (test.verdict === "failed" || test.verdict === "unsupported")
      h.append(el("span", "applic", w.t("groups.unverified-note")));
    if (test.verdict === "not_yet_in_force")
      h.append(laterNote(test, w, "span"));
    box.append(h);
    if (test.rationale !== undefined)
      box.append(
        el(
          "div",
          "why",
          judgeNote(test.rationale, test.claim?.verdict ?? test.verdict, w),
        ),
      );
    body.append(box);
  }
  if (session.tests.every((t) => t.rationale === undefined)) {
    const gap = el(
      "p",
      "small",
      notesGap(
        session.tests.flatMap((t) =>
          t.claim === undefined ? [] : [t.reportState],
        ),
        w,
      ),
    );
    gap.dataset.gaps = "true";
    body.append(gap);
  }
  const wordings = new Map(
    model.obligations.flatMap((o) =>
      o.rows.map((r) => [r.criterionId, r.wording] as const),
    ),
  );
  const spot = spotCheckToggle(
    {
      transcript: session.transcript,
      caseRecord: session.sourceCapsuleId,
      rules: session.tests.flatMap((test) => {
        if (test.claim === undefined) return [];
        return [
          {
            name: names(test.criterionId, "span", "").textContent ?? "",
            ref: test.criterionId,
            worded: ruleWord(
              test.verdict,
              judgedOf(test.reportState, test.judgePinDigest),
              w,
            ),
            verdict: test.verdict,
            drawnVerdict: test.claim.verdict,
            wording: wordings.get(test.criterionId) ?? {
              text: "",
              source: "unstated" as const,
            },
            rationale: test.rationale,
            noNote: notesGap([test.reportState], w),
            judgePinDigest: test.judgePinDigest,
            reportState: test.reportState,
          },
        ];
      }),
    },
    w,
  );
  if (spot !== undefined) body.append(spot);
  body.append(conversationFold(session.transcript, session.sourceCapsuleId, w));
  body.append(
    levelToggle(
      2,
      w.t("card.proofs.toggle"),
      () => sessionProofs(session, model, w),
      { className: "proofs" },
    ),
  );
  return body;
}

function sessionProofs(
  session: Session,
  model: ComplianceModel,
  w: Words,
): HTMLElement {
  const names = testNames(model, w);
  const box = el("div", "pf-b");
  box.dataset.proofsFor = session.conversationId;
  // Which date the session is counted under, verbatim, beside the sealed day:
  // the outcome card's rule, so a backfilled session never reads as if it
  // happened on the day it was sealed.
  const dated = session.dated;
  const dating: [string, string, Record<string, string>][] =
    dated.basis === "judged"
      ? []
      : [
          [w.t("groups.pf.dated"), datedText(dated, w), { dated: dated.basis }],
          ...(dated.importedAt === undefined
            ? []
            : [
                [
                  w.t("card.pf.imported"),
                  dated.importedAt,
                  { imported: "" },
                ] as [string, string, Record<string, string>],
              ]),
        ];
  const rows: ([string, string] | [string, string, Record<string, string>])[] =
    [
      [w.t("groups.pf.session"), session.conversationId],
      ...dating,
      [w.t("card.pf.judged-sealed"), session.judgedDay, { sealed: "" }],
      [
        w.t("card.pf.case-record"),
        session.sourceCapsuleId === undefined
          ? w.t("card.pf.case-record.not-stated")
          : session.caseFrom === "claims"
            ? w.t("groups.pf.case-record.from-claims", {
                record: session.sourceCapsuleId,
              })
            : session.sourceCapsuleId,
      ],
    ];
  rows.push(...transcriptRows(session.transcript, w));
  rows.push([w.t("card.pf.result-capsule"), model.capsuleId]);
  const dl = proofList(rows);
  dl.dataset.checkIt = session.conversationId;
  box.append(dl);
  box.append(el("h5", "", w.t("groups.pf.h.each-report")));
  for (const test of session.tests) {
    const ev = el("div", "ev");
    ev.dataset.proofCrit = test.criterionId;
    const label = names(test.criterionId, "b", "");
    label.append(": ");
    ev.append(label);
    if (test.verdict === "not_applicable") {
      ev.append(element("span", w.t("groups.pf.no-claim")));
    } else if (test.verdict === "not_yet_in_force") {
      ev.append(laterNote(test, w, "span"));
    } else {
      if (test.reportDigest !== undefined)
        ev.append(element("code", test.reportDigest));
      if (test.contract !== undefined)
        ev.append(element("code", test.contract));
      if (test.judgePinDigest !== undefined)
        ev.append(
          element(
            "code",
            w.t("groups.pf.judge-pin", { digest: test.judgePinDigest }),
          ),
        );
      if (test.rationale !== undefined) {
        const sealed = el(
          "div",
          "sealed",
          w.t("groups.pf.rationale", { rationale: test.rationale }),
        );
        sealed.dataset.rationale = "sealed";
        ev.append(sealed);
      }
      if (test.reportDigest === undefined)
        ev.append(element("span", w.t("groups.pf.absent")));
    }
    // contract-report/v1 section 2: assurance stays on the claim.
    if (test.claim !== undefined) {
      ev.append(proofList([assuranceRow(test.claim, w)]));
      const mark = withheldMark(test.claim, w);
      if (mark !== undefined) ev.append(mark);
    }
    box.append(ev);
  }
  return box;
}

// ---------------------------------------------------------------------------
// Proofs for the whole report
// ---------------------------------------------------------------------------

function pinText(model: ComplianceModel, w: Words): string {
  if (model.runInfo.judgePinDigest !== undefined)
    return model.runInfo.judgePinDigest;
  if (!model.runInfo.pinned) return w.t("groups.pin.differs");
  return pinAbsence(model.runInfo, w) ?? w.t("groups.pin.none");
}

function renderReportProofs(
  host: HTMLElement,
  model: ComplianceModel,
  bundle: unknown,
  verified: BundleVerificationResult,
  w: Words,
): void {
  const section = el("section", "rp");
  section.dataset.section = "report-proofs";
  section.append(
    levelToggle(
      2,
      w.t("groups.rp.toggle"),
      () => {
        const box = el("div", "pf-b");
        renderObligationDetails(box, model, w);
        renderQuality(box, model, w);
        renderWhatRan(box, model, w);
        renderVerificationDetails(box, bundle, verified, w);
        return box;
      },
      { className: "proofs" },
    ),
  );
  host.append(section);
}

function renderObligationDetails(
  host: HTMLElement,
  model: ComplianceModel,
  w: Words,
): void {
  const part = el("div", "rp-s");
  part.dataset.section = "obligation-detail";
  part.append(el("h3", "", w.t("groups.od.h")));
  for (const obligation of model.obligations) {
    const box = el("div", "obd");
    box.dataset.obligationDetail = obligation.key;
    box.dataset.mapped = String(obligation.mapped);
    const heading = element("h5");
    heading.append(
      ...obligationName(w, obligation, element("span", obligation.article)),
    );
    box.append(heading);
    box.append(
      el(
        "p",
        "na",
        w.t(obligation.mapped ? "groups.od.mapped" : "groups.od.unmapped"),
      ),
    );
    if (obligation.judgedTerms.length > 0) {
      const terms = el("p", "applic", w.t("groups.od.judged-terms"));
      terms.append(producerText(w, obligation.judgedTerms.join(", ")));
      box.append(terms);
    }
    box.append(maybeProducer(w, "p", "", obligation.method, obligation.mapped));
    for (const row of obligation.rows) {
      const rowBox = el("div", "ck");
      rowBox.dataset.wording = row.wording.source;
      const h = el("div", "h");
      h.append(rowName(w, "span", "", row), tierBadge(row.tier, w));
      rowBox.append(h);
      rowBox.append(
        el(
          "div",
          "why",
          row.wording.source === "sealed"
            ? w.t("groups.od.wording.sealed", { text: row.wording.text })
            : w.t(
                row.wording.source === "mixed"
                  ? "groups.od.wording.mixed"
                  : "groups.od.wording.unstated",
              ),
        ),
      );
      const packNote = w.row(row.criterionId, "not_evaluable");
      if (packNote !== undefined)
        rowBox.append(packWord("div", "ev", packNote));
      else if (row.notEvaluableNote !== undefined)
        rowBox.append(
          maybeProducer(w, "div", "ev", row.notEvaluableNote, true),
        );
      box.append(rowBox);
    }
    part.append(box);
  }
  host.append(part);
}

function renderQuality(
  host: HTMLElement,
  model: ComplianceModel,
  w: Words,
): void {
  const part = el("div", "rp-s");
  part.dataset.section = "quality";
  part.append(el("h3", "", w.t("groups.q.h")));
  const protocol = model.qualityProtocol;
  if (protocol === undefined) {
    part.append(el("p", "", w.t("groups.q.none")));
    host.append(part);
    return;
  }
  const line = el("p", "", w.t("groups.q.protocol"));
  line.append(
    protocol.protocol === undefined
      ? w.t("groups.q.unspecified")
      : producerText(w, protocol.protocol),
  );
  if (protocol.cadence !== undefined)
    line.append(", ", producerText(w, protocol.cadence));
  line.append(w.t("groups.q.tail"));
  part.append(line);
  if (protocol.note !== undefined)
    part.append(maybeProducer(w, "p", "na", protocol.note, true));
  host.append(part);
}

function renderWhatRan(
  host: HTMLElement,
  model: ComplianceModel,
  w: Words,
): void {
  const part = el("div", "rp-s");
  part.dataset.section = "methodology";
  part.append(el("h3", "", w.t("groups.ran.h")));
  const dl = proofList([
    [
      w.t("groups.ran.contract"),
      model.runInfo.contract ??
        w.t(
          model.runInfo.pinned
            ? "groups.ran.contract.none"
            : "groups.ran.contract.differs",
        ),
    ],
    [w.t("groups.ran.judge-pin"), pinText(model, w)],
    [w.t("groups.ran.sessions"), fmt(model.totalSessions)],
    ...(model.dating.from === undefined || model.dating.to === undefined
      ? []
      : [
          [
            w.t("groups.ran.period"),
            span([model.dating.from, model.dating.to], w),
            { period: "" },
          ] as [string, string, Record<string, string>],
        ]),
    ...(model.dating.basis === "judged"
      ? []
      : [
          [
            w.t("groups.ran.sealed"),
            span(model.dating.judgedDays, w),
            { sealed: "" },
          ] as [string, string, Record<string, string>],
        ]),
    [w.t("card.pf.result-capsule"), model.capsuleId],
    wordingRow(w),
  ]);
  dl.dataset.ran = "true";
  part.append(dl);
  const note = datingStatement(model.dating, model.totalSessions, w);
  if (note !== undefined) {
    const p = el("p", "na", note);
    p.dataset.dateNote = model.dating.basis;
    part.append(p);
  }
  host.append(part);
}

function renderVerificationDetails(
  host: HTMLElement,
  bundle: unknown,
  verified: BundleVerificationResult,
  w: Words,
): void {
  const part = el("div", "rp-s");
  part.dataset.section = "verification-details";
  part.append(el("h3", "", w.t("card.vd.h")));
  const model = buildVerificationPageModel(bundle, verified);
  part.append(proofList(verificationRows(model, w)));
  part.append(el("p", "", w.t("groups.vd.note")));
  host.append(part);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** The `groups` grouping's page wrapper: its element, class, page name and stylesheet. */
export const GROUPS_FRAME = {
  tag: "div",
  className: "cc",
  page: "compliance",
  css: COMPLIANCE_CSS,
} as const;

/**
 * Draw the `groups` grouping into `wrapper` (contract-report.ts made it and
 * put its stylesheet in it). Every word is `w`'s.
 */
export async function drawGroups(
  levels: {
    readonly L0: HTMLElement;
    readonly L1: HTMLElement;
    readonly L2: HTMLElement;
  },
  result: ResultRoot,
  presentation: CompliancePresentation,
  bundle: unknown,
  verified: BundleVerificationResult,
  w: Words,
  tierOf?: TierOf,
): Promise<void> {
  const model = buildComplianceModel(result, presentation);
  const claims = model.sessions.flatMap((s) =>
    s.tests.flatMap((t) => (t.claim === undefined ? [] : [t.claim])),
  );

  // L0, what matters, after the core's strip (the mock-judge mark and the
  // sealed aggregate, core-strip.ts): one card, the header.
  levels.L0.append(renderLegend(w));
  const sheet = el("div", "l0-card");
  renderHeader(sheet, model, w, tierOf);
  levels.L0.append(sheet);

  // L1, why: the tests, led by who judged, who witnessed, what verified.
  renderSummary(levels.L1, model, presentation, result, w, tierOf);
  leadWithProvenance(
    levels.L1,
    levels.L1.querySelector('[data-section="summary"]'),
    renderProvenance(
      await provenanceLines(result.records, claims, bundle, verified, w),
    ),
  );
  renderFindings(levels.L1, model, w);

  // L2, module detail after the core's verification section.
  levels.L2.append(renderCheckYourself(bundle, w));
  renderReportProofs(levels.L2, model, bundle, verified, w);
}

export type {
  ComplianceModel,
  ComplianceFindingModel,
  ObligationModel,
  ObligationRowModel,
  Session,
  SessionTest,
};
