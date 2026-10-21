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
import { NOT_STATED } from "@action-state-group/agent-action-capsule";
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
import { buildVerificationPageModel } from "@action-state-group/agent-action-capsule";

/**
 * The EU AI Act obligations-report card. Called from
 * `evidence-graph-view.ts` in place of `renderResultPage` when the bundle's
 * `eu-ai-act-compliance/v1` extension opts in, after the same verify-first
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
function producerText(...content: (string | Node)[]): HTMLElement {
  const value = element("i");
  value.append(...content);
  value.dataset.source = "producer";
  value.title = "The producer's mapping, not a sealed record";
  return value;
}

/** `text` in an element of its own, as producer text when `producer` is true. */
function maybeProducer(
  tag: string,
  className: string,
  text: string,
  producer: boolean,
): HTMLElement {
  if (!producer) return el(tag, className, text);
  const value = el(tag, className);
  value.append(producerText(text));
  return value;
}

const fmt = (n: number): string => n.toLocaleString();
const plural = (n: number, one: string, many: string): string =>
  `${fmt(n)} ${n === 1 ? one : many}`;

const SEVERITY_CLASS: Record<string, string> = {
  High: "high",
  Medium: "medium",
  Low: "low",
};

function severityPill(severity: string): HTMLElement {
  const cls = SEVERITY_CLASS[severity] ?? "medium";
  return el("span", `sev ${cls}`, severity);
}

function tierBadge(tier: TierReading): HTMLElement {
  const text =
    tier === "judged"
      ? "judged"
      : tier === "recomputed"
        ? "recomputed"
        : tier === "mixed"
          ? "tier differs across reports"
          : "tier not stated";
  const badge = el(
    "span",
    `kind ${tier === "judged" || tier === "recomputed" ? tier : "unstated"}`,
    text,
  );
  badge.dataset.tier = tier;
  badge.title =
    tier === "judged"
      ? "Decided by a pinned model applying a frozen rubric"
      : tier === "recomputed"
        ? "A fixed check anyone can repeat from the records"
        : "";
  return badge;
}

function statusPill(statusClass: string, text: string): HTMLElement {
  return el("span", `st ${statusClass}`, text);
}

function ladderOn(presentation: CompliancePresentation): boolean {
  return presentation.resultWords === "ladder";
}

/** Each test's short name, by its criterion id, as producer text when it is the producer's label. */
function testNames(
  model: ComplianceModel,
): (criterionId: string, tag: string, className: string) => HTMLElement {
  const rows = new Map(
    model.obligations.flatMap((o) =>
      o.rows.map((r) => [r.criterionId, r] as const),
    ),
  );
  return (criterionId, tag, className) => {
    const row = rows.get(criterionId);
    return maybeProducer(
      tag,
      className,
      row?.name ?? criterionId,
      row?.producerName === true,
    );
  };
}

function sessionSpan(model: ComplianceModel): string | undefined {
  const days = model.sessions
    .map((s) => s.day)
    .filter((d) => d !== NOT_STATED)
    .sort();
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return undefined;
  return first === last ? first : `${first} – ${last}`;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function renderHeader(host: HTMLElement, model: ComplianceModel): void {
  const hd = el("div", "hd");
  hd.dataset.section = "header";
  hd.append(el("div", "kicker", "EU AI Act obligations report"));
  hd.append(el("h1", "", model.regulation));
  const pack =
    model.pack.id === NOT_STATED
      ? `Pack ${NOT_STATED}`
      : `Pack ${model.pack.id} v${model.pack.version}`;
  const period = sessionSpan(model);
  hd.append(
    el(
      "div",
      "sub",
      `${pack} · ${plural(model.obligations.length, "obligation", "obligations")} · ${plural(model.totalSessions, "session", "sessions")}${period === undefined ? "" : ` · judged ${period}`}`,
    ),
  );
  host.append(hd);
}

// ---------------------------------------------------------------------------
// Summary: what was checked and what we found
// ---------------------------------------------------------------------------

/** A test no session has a met, not-met or undecided result for: nothing was checked. */
function nothingChecked(row: ObligationRowModel): boolean {
  return row.metCount + row.notMetCount + row.notEvaluableCount === 0;
}

/** Every session with a result for this test could not be decided. */
function noneDecided(row: ObligationRowModel): boolean {
  return (
    row.metCount === 0 && row.notMetCount === 0 && row.notEvaluableCount > 0
  );
}

/**
 * An obligation's status. "No exceptions" only when at least one session
 * met one of its tests: an obligation whose tests no session met (every
 * result undecided, or no result at all) "could not be checked", in a
 * neutral tone, never a pass.
 */
export function obligationStatus(obligation: ObligationModel): {
  cls: string;
  text: string;
} {
  const exceptions = obligation.rows.reduce((sum, r) => sum + r.notMetCount, 0);
  const checked = obligation.rows.some((r) => r.metCount > 0);
  const future = obligation.applicability.status === "future";
  if (exceptions > 0)
    return future
      ? {
          cls: "future",
          text: `Not yet in force · ${plural(exceptions, "exception", "exceptions")} (readiness)`,
        }
      : {
          cls: "exc",
          text: `${plural(exceptions, "exception", "exceptions")}`,
        };
  if (!checked)
    return {
      cls: "ne",
      text: future
        ? "Not yet in force · could not be checked"
        : "Could not be checked",
    };
  return future
    ? { cls: "future", text: "Not yet in force · no exceptions" }
    : { cls: "ok", text: "No exceptions" };
}

/** A test's result in the summary: a status, and an optional note under it. */
export function rowStatus(
  row: ObligationRowModel,
  ladder: boolean,
): { cls: string; text: string; note?: string; producerNote?: true } {
  if (nothingChecked(row))
    return { cls: "ne", text: "Not checked: no session has a result" };
  if (noneDecided(row))
    return {
      cls: "ne",
      text: ladder ? "Not checked or inconclusive" : "Could not be checked",
      ...(row.notEvaluableNote === undefined
        ? {}
        : { note: row.notEvaluableNote, producerNote: true }),
    };
  const undecided =
    row.notEvaluableCount > 0
      ? { note: `${fmt(row.notEvaluableCount)} could not be decided` }
      : {};
  if (row.notMetCount > 0)
    return {
      cls: "exc",
      text: plural(
        row.notMetCount,
        ladder ? "failed" : "exception",
        ladder ? "failed" : "exceptions",
      ),
      ...undecided,
    };
  return {
    cls: "ok",
    text:
      ladder && row.notEvaluableCount === 0
        ? "Established in every session"
        : "No exceptions",
    ...undecided,
  };
}

function rowResult(row: ObligationRowModel, ladder: boolean): HTMLElement {
  const cell = document.createElement("td");
  const status = rowStatus(row, ladder);
  cell.append(statusPill(status.cls, status.text));
  if (status.note !== undefined)
    cell.append(
      maybeProducer("div", "applic", status.note, status.producerNote === true),
    );
  return cell;
}

function renderSummary(
  host: HTMLElement,
  model: ComplianceModel,
  presentation: CompliancePresentation,
): void {
  const section = el("section", "");
  section.dataset.section = "summary";
  section.append(el("h2", "", "What was checked and what we found"));
  const tests = model.obligations.reduce((n, o) => n + o.rows.length, 0);
  section.append(
    el(
      "p",
      "lede",
      `Each session (one conversation with the agent) was checked against ${plural(tests, "test", "tests")} under ${plural(model.obligations.length, "obligation", "obligations")}. Results are counts of sessions: there is no overall score. Open a test to read the sessions behind its exceptions.`,
    ),
  );
  const basis = el(
    "p",
    "na",
    `Every count and result is read from the sealed claims and reports in this bundle, or marked "${NOT_STATED}". Obligation titles, test names, the article, the plain-language summary, applicability, method, recommendations and the notes on undecided tests and quality checks are the producer's mapping, set in italics: carried beside the signed records, not in them.`,
  );
  basis.dataset.basis = "terms";
  section.append(basis);
  const ladder = ladderOn(presentation);
  const table = document.createElement("table");
  table.className = "grid sum";
  table.dataset.rows = "summary";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(
    element("th", "Obligation and test"),
    el("th", "n", "Checked in"),
    element("th", "Result"),
  );
  thead.append(headRow);
  table.append(thead);
  for (const obligation of model.obligations) {
    const tbody = document.createElement("tbody");
    tbody.dataset.obligationGroup = obligation.key;
    const row = el("tr", "ob");
    row.dataset.obligation = obligation.key;
    const status = obligationStatus(obligation);
    const title = el("td", "");
    title.setAttribute("colspan", "2");
    const name = el("div", "obn");
    const article = el("b", "", obligation.article);
    if (obligation.mapped)
      name.append(producerText(article, ` · ${obligation.title}`));
    else name.append(article, element("span", ` · ${obligation.title}`));
    title.append(name);
    if (obligation.plain !== NOT_STATED)
      title.append(maybeProducer("div", "plain", obligation.plain, true));
    title.append(
      maybeProducer(
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
        maybeProducer("b", "", test.name, test.producerName),
        tierBadge(test.tier),
      );
      nameCell.append(head);
      const finding = model.findings.find(
        (f) => f.criterionId === test.criterionId,
      );
      if (finding !== undefined) nameCell.append(renderFinding(finding));
      const sessionIds = [
        ...(test.sessionsByVerdict.get("not_met") ?? []),
        ...(test.sessionsByVerdict.get("not_evaluable") ?? []),
      ];
      tr.append(
        nameCell,
        el("td", "n", plural(population, "session", "sessions")),
        rowResult(test, ladder),
      );
      tbody.append(tr);
      // The sessions behind a test open in a full-width row below it, so
      // each one reads at the table's width.
      if (sessionIds.length > 0) {
        const toggle = levelToggle(
          1,
          `Show the ${plural(sessionIds.length, "session", "sessions")}${test.notEvaluableCount > 0 && test.notMetCount > 0 ? " (exceptions, then undecided)" : test.notMetCount > 0 ? " with exceptions" : " that could not be decided"}`,
          () => renderSessionList(sessionIds, model, presentation),
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

function renderFinding(finding: ComplianceFindingModel): HTMLElement {
  const box = el("div", "fnd");
  box.dataset.finding = finding.id;
  const fh = el("div", "fh");
  fh.append(
    el("b", "", `Finding ${finding.id}`),
    severityPill(finding.severity),
    element("span", plural(finding.sessionIds.length, "session", "sessions")),
  );
  box.append(fh);
  box.append(maybeProducer("div", "rec", finding.recommendation, true));
  const own = el("div", "own", "Owner · due: ");
  own.append(producerText(finding.ownerDue));
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
): HTMLElement {
  const byId = new Map(model.sessions.map((s) => [s.conversationId, s]));
  const list = el("div", "convs");
  list.dataset.sessionCount = String(conversationIds.length);
  for (const id of conversationIds) {
    const session = byId.get(id);
    if (session !== undefined)
      list.append(renderSession(session, model, presentation));
  }
  return list;
}

function isException(test: SessionTest): boolean {
  return (
    test.verdict === "not_met" ||
    test.verdict === "failed" ||
    test.verdict === "unsupported"
  );
}

/** One session, in place inside a level-1 toggle: a header line and its body right below it, never a toggle of its own; the body is built when it scrolls near the view. */
function renderSession(
  session: Session,
  model: ComplianceModel,
  presentation: CompliancePresentation,
): HTMLElement {
  const names = testNames(model);
  const exceptions = session.tests.filter(isException);
  const undecided = session.tests.filter((t) => t.verdict === "not_evaluable");
  const parts = caseParts(session.conversationId);
  const item = el("article", "conv session");
  item.dataset.session = session.conversationId;
  const head = el("div", "conv-h");
  head.append(el("span", "cid", parts.label));
  head.append(
    exceptions.length > 0
      ? wordPill(
          {
            word: plural(exceptions.length, "exception", "exceptions"),
            tone: "bad",
          },
          "exceptions",
        )
      : undecided.length > 0
        ? wordPill({ word: "could not decide", tone: "ne" }, "undecided")
        : wordPill({ word: "no exceptions", tone: "ok" }, "ok"),
  );
  const why = el("span", "cwhy");
  (exceptions.length > 0 ? exceptions : undecided).forEach((t, i) => {
    if (i > 0) why.append(", ");
    why.append(names(t.criterionId, "span", ""));
  });
  head.append(why);
  head.append(el("span", "cmodel", parts.model ?? session.day));
  item.append(head);
  const body = el("div", "conv-slot");
  item.append(body);
  lazyBody(body, () => sessionBody(session, model, presentation));
  return item;
}

function sessionBody(
  session: Session,
  model: ComplianceModel,
  presentation: CompliancePresentation,
): HTMLElement {
  const names = testNames(model);
  const ladder = ladderOn(presentation);
  const body = el("div", "conv-b");
  body.append(el("h4", "", "Test by test"));
  for (const test of session.tests) {
    const box = el("div", "ck");
    box.dataset.crit = test.criterionId;
    box.dataset.critVerdict = test.verdict;
    const h = el("div", "h");
    h.append(
      wordPill(
        ruleWord(
          test.verdict,
          ladder,
          judgedOf(test.reportState, test.judgePinDigest),
        ),
        test.verdict,
      ),
    );
    h.append(names(test.criterionId, "span", "tname"));
    if (test.verdict !== "not_applicable") h.append(tierBadge(test.tier));
    if (test.verdict === "failed" || test.verdict === "unsupported")
      h.append(el("span", "applic", "counted as an exception"));
    box.append(h);
    if (test.rationale !== undefined)
      box.append(
        el(
          "div",
          "why",
          judgeNote(test.rationale, test.claim?.verdict ?? test.verdict),
        ),
      );
    body.append(box);
  }
  if (session.tests.every((t) => t.rationale === undefined)) {
    const states = new Set(
      session.tests.flatMap((t) =>
        t.claim === undefined ? [] : [t.reportState],
      ),
    );
    const gap = el(
      "p",
      "small",
      states.size === 1 && states.has("withheld")
        ? "The judge's notes are not in this bundle: its reports are withheld."
        : states.has("mismatch") || states.has("unreadable")
          ? "The judge's notes are not shown: some reports in this bundle do not match what was sealed, or cannot be read."
          : states.has("withheld")
            ? "The judge's notes are not in this bundle: some of its reports are withheld."
            : "The judge left no notes.",
    );
    gap.dataset.gaps = "true";
    body.append(gap);
  }
  body.append(el("h4", "", "The conversation"));
  body.append(renderChat(session.transcript, session.sourceCapsuleId));
  body.append(
    levelToggle(
      2,
      "Proofs: record ids, digests and the judge pin",
      () => sessionProofs(session, model),
      { className: "proofs" },
    ),
  );
  return body;
}

function sessionProofs(session: Session, model: ComplianceModel): HTMLElement {
  const names = testNames(model);
  const box = el("div", "pf-b");
  box.dataset.proofsFor = session.conversationId;
  const rows: [string, string][] = [
    ["Session", session.conversationId],
    ["Judged on", session.day],
    [
      "Case record",
      session.sourceCapsuleId === undefined
        ? "not stated by the reports"
        : `${session.sourceCapsuleId}${session.caseFrom === "claims" ? " (cited by every claim of this session; the reports that name it are withheld)" : ""}`,
    ],
  ];
  const t = session.transcript;
  if (t.state === "verified") {
    rows.push(["Transcript record", t.transcriptRecordId!]);
    rows.push([
      "Case input digest",
      `${t.inputDigest!} (the transcript's digest equals what the judged case committed to, checked on this page)`,
    ]);
  } else
    rows.push([
      "Transcript",
      t.state === "absent"
        ? "not in this bundle"
        : `not shown: ${t.reason ?? "does not check"}`,
    ]);
  rows.push(["Result capsule", model.capsuleId]);
  const dl = proofList(rows);
  dl.dataset.checkIt = session.conversationId;
  box.append(dl);
  box.append(el("h5", "", "Each test's sealed report"));
  for (const test of session.tests) {
    const ev = el("div", "ev");
    ev.dataset.proofCrit = test.criterionId;
    const label = names(test.criterionId, "b", "");
    label.append(": ");
    ev.append(label);
    if (test.verdict === "not_applicable") {
      ev.append(
        element(
          "span",
          "no claim: Result v0 carries none for a test that did not apply",
        ),
      );
    } else {
      if (test.reportDigest !== undefined)
        ev.append(element("code", test.reportDigest));
      if (test.contract !== undefined)
        ev.append(element("code", test.contract));
      if (test.judgePinDigest !== undefined)
        ev.append(element("code", `judge pin ${test.judgePinDigest}`));
      if (test.rationale !== undefined) {
        const sealed = el(
          "div",
          "sealed",
          `Rationale, as sealed: ${test.rationale}`,
        );
        sealed.dataset.rationale = "sealed";
        ev.append(sealed);
      }
      if (test.reportDigest === undefined) ev.append(element("span", "absent"));
    }
    box.append(ev);
  }
  return box;
}

// ---------------------------------------------------------------------------
// Proofs for the whole report
// ---------------------------------------------------------------------------

function pinText(model: ComplianceModel): string {
  if (model.runInfo.judgePinDigest !== undefined)
    return model.runInfo.judgePinDigest;
  if (!model.runInfo.pinned) return "disagrees across sessions";
  const info = model.runInfo;
  const unread = (info.reportsMismatched ?? 0) + (info.reportsUnreadable ?? 0);
  const cited = info.reportsCited ?? 0;
  const parts: string[] = [];
  if (info.reportsWithheld !== undefined)
    parts.push(
      `the judge's reports that state it are withheld (${fmt(info.reportsWithheld)} of ${fmt(cited)})`,
    );
  if (unread > 0)
    parts.push(
      `${fmt(unread)} of ${fmt(cited)} reports in this bundle do not match what was sealed or cannot be read`,
    );
  return parts.length === 0
    ? "no judged sessions cited"
    : `not in this bundle: ${parts.join("; ")}`;
}

function renderReportProofs(
  host: HTMLElement,
  model: ComplianceModel,
  bundle: unknown,
  verified: BundleVerificationResult,
): void {
  const section = el("section", "rp");
  section.dataset.section = "report-proofs";
  section.append(
    levelToggle(
      2,
      "Proofs for this report: method, test wording, what ran, and how to verify the whole bundle",
      () => {
        const box = el("div", "pf-b");
        renderObligationDetails(box, model);
        renderQuality(box, model);
        renderWhatRan(box, model);
        renderVerificationDetails(box, bundle, verified);
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
): void {
  const part = el("div", "rp-s");
  part.dataset.section = "obligation-detail";
  part.append(el("h3", "", "Method and the wording each test ran"));
  for (const obligation of model.obligations) {
    const box = el("div", "obd");
    box.dataset.obligationDetail = obligation.key;
    box.dataset.mapped = String(obligation.mapped);
    box.append(
      maybeProducer(
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
        obligation.mapped
          ? "Title, article, summary, method, test names and the undecided-session note: the producer's mapping, in italics, not a sealed record."
          : `The producer's extension does not map this obligation: article, summary and method ${NOT_STATED}.`,
      ),
    );
    if (obligation.judgedTerms.length > 0) {
      const terms = el("p", "applic", "Judged terms: ");
      terms.append(producerText(obligation.judgedTerms.join(", ")));
      box.append(terms);
    }
    box.append(maybeProducer("p", "", obligation.method, obligation.mapped));
    for (const row of obligation.rows) {
      const rowBox = el("div", "ck");
      rowBox.dataset.wording = row.wording.source;
      const h = el("div", "h");
      h.append(
        maybeProducer("span", "", row.name, row.producerName),
        tierBadge(row.tier),
      );
      rowBox.append(h);
      rowBox.append(
        el(
          "div",
          "why",
          row.wording.source === "sealed"
            ? `Wording run (sealed): ${row.wording.text}`
            : row.wording.source === "mixed"
              ? `Wording ${NOT_STATED}: the cited reports state different wordings.`
              : `Wording ${NOT_STATED}: no cited report states it.`,
        ),
      );
      if (row.notEvaluableNote !== undefined)
        rowBox.append(maybeProducer("div", "ev", row.notEvaluableNote, true));
      box.append(rowBox);
    }
    part.append(box);
  }
  host.append(part);
}

function renderQuality(host: HTMLElement, model: ComplianceModel): void {
  const part = el("div", "rp-s");
  part.dataset.section = "quality";
  part.append(el("h3", "", "Quality of judged results"));
  const protocol = model.qualityProtocol;
  if (protocol === undefined) {
    part.append(el("p", "", "No quality protocol declared in this pack."));
    host.append(part);
    return;
  }
  const line = el("p", "", "Protocol ");
  line.append(
    protocol.protocol === undefined
      ? "unspecified"
      : producerText(protocol.protocol),
  );
  if (protocol.cadence !== undefined)
    line.append(", ", producerText(protocol.cadence));
  line.append(". Recomputed tests are not sampled.");
  part.append(line);
  if (protocol.note !== undefined)
    part.append(maybeProducer("p", "na", protocol.note, true));
  host.append(part);
}

function renderWhatRan(host: HTMLElement, model: ComplianceModel): void {
  const part = el("div", "rp-s");
  part.dataset.section = "methodology";
  part.append(el("h3", "", "What ran"));
  const dl = proofList([
    [
      "Contract",
      model.runInfo.contract ??
        (model.runInfo.pinned
          ? "no conversations"
          : "disagrees across sessions"),
    ],
    ["Judge pin digest", pinText(model)],
    ["Sessions", fmt(model.totalSessions)],
    ["Result capsule", model.capsuleId],
  ]);
  dl.dataset.ran = "true";
  part.append(dl);
  host.append(part);
}

function renderVerificationDetails(
  host: HTMLElement,
  bundle: unknown,
  verified: BundleVerificationResult,
): void {
  const part = el("div", "rp-s");
  part.dataset.section = "verification-details";
  part.append(el("h3", "", "Verification details"));
  const model = buildVerificationPageModel(bundle, verified);
  part.append(
    proofList([
      ["Bundle digest", model.bundleDigest ?? "uncomputable"],
      ["Checkpoint root", model.checkpointRoot ?? "absent"],
      ["Checkpoint size", String(model.checkpointSize ?? "absent")],
    ]),
  );
  part.append(
    el(
      "p",
      "",
      "This bundle's own checkpoint, an append-only Merkle Mountain Range over the sealed records. Repeat every check on this page offline with the open-source verifier. This page only ever renders a bundle that already verified: tamper with any claim, record or checkpoint and the whole page is replaced by the verification-failed banner.",
    ),
  );
  host.append(part);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function renderCompliancePage(
  result: ResultRoot,
  presentation: CompliancePresentation,
  bundle: unknown,
  verified: BundleVerificationResult,
  root: HTMLElement,
): void {
  const model = buildComplianceModel(result, presentation);
  const wrapper = el("div", "cc");
  wrapper.dataset.page = "compliance";
  wrapper.dataset.levels = "2";
  if (ladderOn(presentation)) wrapper.dataset.resultWords = "ladder";
  const style = document.createElement("style");
  style.textContent = COMPLIANCE_CSS;
  wrapper.append(style);

  renderHeader(wrapper, model);
  renderSummary(wrapper, model, presentation);
  renderReportProofs(wrapper, model, bundle, verified);
  root.append(wrapper);
}

export type {
  ComplianceModel,
  ComplianceFindingModel,
  ObligationModel,
  ObligationRowModel,
  Session,
  SessionTest,
};
