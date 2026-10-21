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
import { DEFAULT_WORDS, type Words } from "./contract-report-wording.js";
import {
  caseParts,
  judgedOf,
  judgeNote,
  lazyBody,
  levelToggle,
  proofList,
  renderChat,
  ruleWord,
  wordPill,
} from "./report-levels.js";
import type { ResultRoot } from "@action-state-group/agent-action-capsule";
import { provenanceLines, renderProvenance } from "./report-provenance.js";
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
    return maybeProducer(
      w,
      tag,
      className,
      row?.name ?? criterionId,
      row?.producerName === true,
    );
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
  return first === last ? first : w.t("report.span", { from: first, to: last });
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function renderHeader(
  host: HTMLElement,
  model: ComplianceModel,
  w: Words,
): void {
  const hd = el("div", "hd");
  hd.dataset.section = "header";
  hd.append(el("div", "kicker", w.t("groups.kicker")));
  hd.append(maybeProducer(w, "h1", "", model.regulation, true));
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
      row.unverifiedCount ===
    0
  );
}

/** No session with a result for this test met it or did not: every one was undecided or could not be verified. */
function noneDecided(row: ObligationRowModel): boolean {
  return row.metCount === 0 && row.notMetCount === 0;
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
  const unchecked = obligation.rows.filter((r) => noneDecided(r)).length;
  const unverified = obligation.rows.reduce(
    (sum, r) => sum + r.unverifiedCount,
    0,
  );
  const total = obligation.rows.length;
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
  if (nothingChecked(row))
    return { cls: "ne", text: w.t("groups.row.nothing") };
  if (noneDecided(row))
    return {
      cls: "ne",
      text: w.t("groups.row.none-decided"),
      ...(row.notEvaluableNote !== undefined
        ? { note: row.notEvaluableNote, producerNote: true }
        : row.unverifiedCount > 0
          ? {
              note: w.t("groups.row.unverified-note", {
                n: fmt(row.unverifiedCount),
              }),
            }
          : {}),
    };
  const notes = [
    ...(row.notEvaluableCount > 0
      ? [w.t("groups.row.undecided-note", { n: fmt(row.notEvaluableCount) })]
      : []),
    ...(row.unverifiedCount > 0
      ? [w.t("groups.row.unverified-note", { n: fmt(row.unverifiedCount) })]
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

function rowResult(row: ObligationRowModel, w: Words): HTMLElement {
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
  return cell;
}

function renderSummary(
  host: HTMLElement,
  model: ComplianceModel,
  presentation: CompliancePresentation,
  w: Words,
): void {
  const section = el("section", "");
  section.dataset.section = "summary";
  section.append(el("h2", "", w.t("groups.summary.h")));
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
  const basis = el("p", "na", w.t("groups.summary.basis"));
  basis.dataset.basis = "terms";
  section.append(basis);
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
  for (const obligation of model.obligations) {
    const tbody = document.createElement("tbody");
    tbody.dataset.obligationGroup = obligation.key;
    const row = el("tr", "ob");
    row.dataset.obligation = obligation.key;
    const status = obligationStatus(obligation, w);
    const title = el("td", "");
    title.setAttribute("colspan", "2");
    const name = el("div", "obn");
    const article = el("b", "", obligation.article);
    if (obligation.mapped)
      name.append(producerText(w, article, ` · ${obligation.title}`));
    else name.append(article, element("span", ` · ${obligation.title}`));
    title.append(name);
    if (obligation.plain !== NOT_STATED)
      title.append(maybeProducer(w, "div", "plain", obligation.plain, true));
    title.append(
      maybeProducer(
        w,
        "div",
        "applic",
        obligation.applicability.note,
        obligation.mapped,
      ),
    );
    const statusCell = document.createElement("td");
    statusCell.append(statusPill(status.cls, status.text));
    row.append(title, statusCell);
    tbody.append(row);
    for (const test of obligation.rows) {
      const tr = el("tr", "test");
      tr.dataset.criterion = test.criterionId;
      const population = model.totalSessions - test.notApplicableCount;
      tr.dataset.population = String(population);
      tr.dataset.exceptions = String(test.notMetCount);
      tr.dataset.notEvaluable = String(test.notEvaluableCount);
      const nameCell = el("td", "tn");
      const head = el("div", "tnh");
      head.append(
        maybeProducer(w, "b", "", test.name, test.producerName),
        tierBadge(test.tier, w),
      );
      nameCell.append(head);
      const finding = model.findings.find(
        (f) => f.criterionId === test.criterionId,
      );
      if (finding !== undefined) nameCell.append(renderFinding(finding, w));
      const sessionIds = [
        ...(test.sessionsByVerdict.get("not_met") ?? []),
        ...(test.sessionsByVerdict.get("unverified") ?? []),
        ...(test.sessionsByVerdict.get("not_evaluable") ?? []),
      ];
      tr.append(
        nameCell,
        el("td", "n", count(w, "session", population)),
        rowResult(test, w),
      );
      tbody.append(tr);
      // The sessions behind a test open in a full-width row below it, so
      // each one reads at the table's width.
      if (sessionIds.length > 0) {
        const toggle = levelToggle(
          1,
          sessionListNote(test, count(w, "session", sessionIds.length), w),
          () => renderSessionList(sessionIds, model, presentation, w),
          { className: "line" },
        );
        toggle.dataset.records = "sessions";
        toggle.dataset.drill = test.criterionId;
        const drillRow = el("tr", "drill-row");
        drillRow.dataset.drillFor = test.criterionId;
        const cell = document.createElement("td");
        cell.setAttribute("colspan", "3");
        cell.append(toggle);
        drillRow.append(cell);
        tbody.append(drillRow);
      }
    }
    table.append(tbody);
  }
  section.append(table);
  host.append(section);
}

/** What the sessions behind a test are, in the order they are listed. */
function sessionListNote(
  test: ObligationRowModel,
  sessions: string,
  w: Words,
): string {
  const kinds = [
    ...(test.notMetCount > 0 ? [w.t("groups.drill.kind.exceptions")] : []),
    ...(test.unverifiedCount > 0 ? [w.t("groups.drill.kind.unverified")] : []),
    ...(test.notEvaluableCount > 0 ? [w.t("groups.drill.kind.undecided")] : []),
  ];
  if (kinds.length > 1)
    return w.t("groups.drill.mixed", {
      sessions,
      kinds: kinds.join(", then "),
    });
  if (test.notMetCount > 0) return w.t("groups.drill.exceptions", { sessions });
  if (test.unverifiedCount > 0)
    return w.t("groups.drill.unverified", { sessions });
  return w.t("groups.drill.undecided", { sessions });
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
    if (test.verdict !== "not_applicable") h.append(tierBadge(test.tier, w));
    if (test.verdict === "failed" || test.verdict === "unsupported")
      h.append(el("span", "applic", w.t("groups.unverified-note")));
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
  body.append(el("h4", "", w.t("report.h.conversation")));
  body.append(renderChat(session.transcript, session.sourceCapsuleId, w));
  body.append(
    levelToggle(
      2,
      w.t("report.proofs.toggle"),
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
                  w.t("report.pf.imported"),
                  dated.importedAt,
                  { imported: "" },
                ] as [string, string, Record<string, string>],
              ]),
        ];
  const rows: ([string, string] | [string, string, Record<string, string>])[] =
    [
      [w.t("groups.pf.session"), session.conversationId],
      ...dating,
      [w.t("report.pf.judged-sealed"), session.judgedDay, { sealed: "" }],
      [
        w.t("report.pf.case-record"),
        session.sourceCapsuleId === undefined
          ? w.t("report.pf.case-record.not-stated")
          : session.caseFrom === "claims"
            ? w.t("groups.pf.case-record.from-claims", {
                record: session.sourceCapsuleId,
              })
            : session.sourceCapsuleId,
      ],
    ];
  rows.push(...transcriptRows(session.transcript, w));
  rows.push([w.t("report.pf.result-capsule"), model.capsuleId]);
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
    box.append(
      maybeProducer(
        w,
        "h5",
        "",
        `${obligation.article} · ${obligation.title}`,
        obligation.mapped,
      ),
    );
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
      h.append(
        maybeProducer(w, "span", "", row.name, row.producerName),
        tierBadge(row.tier, w),
      );
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
      if (row.notEvaluableNote !== undefined)
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
    [w.t("report.pf.result-capsule"), model.capsuleId],
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
  part.append(el("h3", "", w.t("report.vd.h")));
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
  wrapper: HTMLElement,
  result: ResultRoot,
  presentation: CompliancePresentation,
  bundle: unknown,
  verified: BundleVerificationResult,
  w: Words,
): Promise<void> {
  const model = buildComplianceModel(result, presentation);
  renderHeader(wrapper, model, w);
  // Who judged, who witnessed, what verified: on the front, never in a toggle.
  wrapper.append(
    renderProvenance(
      await provenanceLines(
        result.records,
        model.sessions.flatMap((s) =>
          s.tests.flatMap((t) => (t.claim === undefined ? [] : [t.claim])),
        ),
        bundle,
        verified,
        w,
      ),
    ),
  );
  renderSummary(wrapper, model, presentation, w);
  renderReportProofs(wrapper, model, bundle, verified, w);
}

export type {
  ComplianceModel,
  ComplianceFindingModel,
  ObligationModel,
  ObligationRowModel,
  Session,
  SessionTest,
};
