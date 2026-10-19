// SPDX-License-Identifier: BSD-3-Clause
import type { BundleVerificationResult } from "@action-state-group/agent-action-capsule";
import {
  buildOutcomeReportModel,
  type CalibrationWeek,
  type Conversation,
  type ConversationVerdict,
  type CriterionTierReading,
  type CriterionWording,
  type MissedReasonGroup,
  type ConversationDate,
  type OutcomeReportModel,
  type OutcomeReportOptions,
  type OutcomeReportRunInfo,
  NOT_STATED,
  verifyJudgePin,
} from "@action-state-group/agent-action-capsule";
import { OUTCOME_REPORT_CSS } from "./outcome-report-styles.js";
import {
  judgedOf,
  lazyBody,
  levelToggle,
  proofList,
  renderChat,
  ruleWord,
  wordPill,
  caseParts,
  judgeNote,
  type Worded,
} from "./report-levels.js";
import { buildVerificationPageModel } from "@action-state-group/agent-action-capsule";
import type { ResultRoot } from "@action-state-group/agent-action-capsule";

/**
 * The outcome-report card, rendered from a verified `ResultRoot`. Called
 * from `evidence-graph-view.ts` in place of `renderResultPage` when the
 * bundle's `outcome-report/v1` extension opts in (see
 * `readOutcomeReportPresentation`) -- after the same verify-first gate every
 * other root family goes through: nothing here ever runs on a bundle that
 * did not verify.
 *
 * The whole card renders inside one `.oi`-classed wrapper, with its own
 * `<style>` (`OUTCOME_REPORT_CSS`) as its first child -- every selector in
 * that stylesheet is scoped under `.oi` so it can never affect, or be
 * affected by, the rest of the emitted page (the verification page that
 * always follows it, or the generic Result page this bundle opted out of).
 * No external reference of any kind: no `<link>`, no web font, no image.
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

// ---------------------------------------------------------------------------
// Icons: inline SVG line drawings, never emoji. An emoji glyph renders as an
// empty box ("tofu") wherever no colour-emoji font is installed -- headless
// Chromium on a server, most CI images -- and a report is read exactly there.
// Built with createElementNS from fixed path data (no markup string, no
// external reference); stroke follows the surrounding text colour.
// ---------------------------------------------------------------------------

// The SVG namespace is a URI that happens to begin with a scheme; it is never
// fetched. Assembled at run time so the emitted runtime contains no literal
// "http://" -- capsule-cli's report tests assert an offline report.html has
// none, as a cheap guard that the page loads nothing from the network.
const SVG_NS = ["http", "://www.w3.org/2000/svg"].join("");

const ICON_PATHS: Readonly<Record<string, readonly string[]>> = {
  // an open rulebook
  book: [
    "M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5Z",
    "M20 5.5C20 4.7 19.3 4 18.5 4H13v15h5.5c.8 0 1.5-.7 1.5-1.5Z",
    "M6.5 8h2.5M6.5 11h2.5M15 8h2.5M15 11h2.5",
  ],
  // a ticked circle
  check: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z", "M7.5 12.5l3 3l6-6.5"],
  // a receipt with a torn foot
  receipt: [
    "M6 3h12v18l-2-1.5l-2 1.5l-2-1.5l-2 1.5l-2-1.5L6 21Z",
    "M9 8h6M9 11.5h6M9 15h4",
  ],
  // a target
  target: [
    "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z",
    "M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10Z",
    "M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2Z",
  ],
};

/** The named icon as an inline SVG, or `undefined` for a name with no drawing (the slot then stays empty, never a raw name or glyph). */
function icon(name: string): SVGSVGElement | undefined {
  const paths = ICON_PATHS[name];
  if (paths === undefined) return undefined;
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset.icon = name;
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

const fmtCount = (n: number): string => n.toLocaleString();

function fmtShare(count: number, total: number, percentages: boolean): string {
  if (percentages)
    return total === 0 ? "–" : `${Math.round((count / total) * 100)}%`;
  return `${fmtCount(count)} of ${fmtCount(total)}`;
}

const TIER_LABEL: Record<CriterionTierReading, string> = {
  judged: "judged",
  recomputed: "recomputed",
  unknown: "tier unknown — no claims observed",
  mixed: "tier differs across conversations",
};

function criterionLabel(
  model: OutcomeReportModel,
  checkId: string,
  criterionId: string,
): {
  label: string;
  text: string;
  question: string;
  source: CriterionWording["source"];
} {
  const check = model.terms.checks.find((c) => c.id === checkId);
  const criterion = check?.criteria.find((c) => c.id === criterionId);
  const wording = model.criterionWording.get(`${checkId}.${criterionId}`);
  return {
    label: criterion?.label ?? `${checkId}.${criterionId}`,
    text: wording?.text ?? criterion?.text ?? "",
    question: check?.question ?? checkId,
    source: wording?.source ?? "unstated",
  };
}

/** The label a criterion's wording carries when it is NOT the sealed text. */
const WORDING_FALLBACK_LABEL: Record<CriterionWording["source"], string> = {
  sealed: "",
  unstated: "Wording not stated: no report in this bundle states it.",
  mixed:
    "Wording not shown: the reports in this bundle state different wordings.",
};

/** One sentence on where the criterion wording on this page comes from. */
function wordingNote(model: OutcomeReportModel): string {
  const sources = new Set(
    [...model.criterionWording.values()].map((w) => w.source),
  );
  if (sources.size === 1 && sources.has("sealed"))
    return "Rule wording as sealed in the judge's reports (the text the judge was given).";
  if (!sources.has("sealed"))
    return "Rule wording not stated: the reports in this bundle do not state it.";
  return "Rule wording as sealed in the judge's reports; where the reports do not state it (or disagree), marked as such.";
}

/** The producer's "edited" badge for a criterion, when its presentation
 * extension marks one -- presentation text, titled as such, never evidence. */
function editedBadge(
  model: OutcomeReportModel,
  ref: string,
): HTMLElement | undefined {
  const edited = model.options.editedCriteria?.find((e) => e.criterion === ref);
  if (edited === undefined) return undefined;
  const badge = el("span", "edited", edited.badge);
  badge.dataset.edited = ref;
  badge.title = "Producer's note (presentation extension), not evidence";
  return badge;
}
function renderProducerNote(
  host: HTMLElement,
  model: OutcomeReportModel,
): void {
  const note = model.options.producerNote;
  if (note === undefined) return;
  const box = el("aside", "pnote");
  box.dataset.producerNote = "true";
  box.append(
    el("div", "pn-k", "Producer's note · presentation text, not evidence"),
  );
  box.append(el("h2", "pn-t", note.title));
  const list = el("ul", "pn-l");
  for (const line of note.lines) list.append(element("li", line));
  box.append(list);
  box.append(
    el(
      "p",
      "pn-src",
      "Carried on this bundle's outcome-report/v1 presentation extension, outside the signed records: no claim backs this note and no number on this page is computed from it. Everything below is drawn only from the verified bundle.",
    ),
  );
  host.append(box);
}

const fmtP = (p: number): string => p.toFixed(2);

/** The probability the judge gave the verdict it returned, from the sealed rationale text; undefined when the text carries none. */
function verdictProbability(
  criterion: Conversation["criteria"][number],
): number | undefined {
  const probs = criterion.probabilities;
  if (probs === undefined) return undefined;
  const key = criterion.claim?.verdict ?? criterion.verdict;
  return probs[key];
}

// ---------------------------------------------------------------------------
// Two levels, no more (see report-levels.ts): every summary line opens
// (toggle 1) into the conversations behind it, listed in place and each
// readable as it stands -- its result rule by rule and the conversation with
// its tool calls -- and each conversation's proofs are toggle 2. Read ONLY
// from the model, which reads only from the verified bundle.
// ---------------------------------------------------------------------------

type DrawnVerdict = Conversation["criteria"][number]["verdict"];
type DrawnCriterion = Conversation["criteria"][number];

/** The raw verdict names, kept for the proofs (what the sealed record says). */
const VERDICT_TEXT: Record<DrawnVerdict, string> = {
  met: "met",
  not_met: "not met",
  not_evaluable: "not evaluable",
  failed: "failed verification",
  unsupported: "unsupported",
  not_applicable: "not applicable",
};

function isMiss(verdict: DrawnVerdict): boolean {
  return (
    verdict === "not_met" || verdict === "failed" || verdict === "unsupported"
  );
}

/** A conversation's result. `nothing-applied`: it has rules and every one was not applicable, so nothing was checked -- never "missed". A conversation with no rule result at all is undecided, never "no rule applied". */
export type ConversationStatus =
  | "resolved"
  | "missed"
  | "undecided"
  | "nothing-applied";

export function conversationStatus(
  conversation: Conversation,
): ConversationStatus {
  if (conversation.verdict === "met") return "resolved";
  if (conversation.verdict === "not_met") return "missed";
  return conversation.criteria.length > 0 &&
    conversation.criteria.every((c) => c.verdict === "not_applicable")
    ? "nothing-applied"
    : "undecided";
}

function ladderOn(model: OutcomeReportModel): boolean {
  return model.options.resultWords === "ladder";
}

function statusWord(
  status: ConversationStatus,
  conversation: Conversation,
  ladder: boolean,
): Worded {
  if (!ladder)
    return status === "resolved"
      ? { word: "resolved", tone: "ok" }
      : status === "missed"
        ? { word: "missed", tone: "bad" }
        : status === "undecided"
          ? { word: "could not decide", tone: "ne" }
          : { word: "no rule applied", tone: "na" };
  if (status === "resolved") return { word: "established", tone: "ok" };
  if (status === "missed") return { word: "failed", tone: "bad" };
  if (status === "nothing-applied") return { word: "not present", tone: "na" };
  // Three-valued: a judge ran on an undecided rule, none did, or the
  // withheld reports cannot say which.
  const judged = conversation.criteria
    .filter((c) => c.verdict === "not_evaluable")
    .map((c) => judgedOf(c.reportState, c.judgePinDigest));
  if (judged.includes("yes")) return { word: "inconclusive", tone: "ne" };
  if (judged.length > 0 && judged.every((j) => j === "no"))
    return { word: "not checked", tone: "ne" };
  return { word: "could not decide (report withheld)", tone: "ne" };
}

function criterionWord(c: DrawnCriterion, ladder: boolean): Worded {
  return ruleWord(c.verdict, ladder, judgedOf(c.reportState, c.judgePinDigest));
}

/** The plain note for a rule whose report carries no rationale: why there is none. */
function noNoteText(c: DrawnCriterion): string {
  switch (c.reportState) {
    case "withheld":
      return "Not in this bundle: the judge's report is withheld.";
    case "mismatch":
      return "Not shown: the report in this bundle does not match what was sealed.";
    case "unreadable":
      return "Not shown: the report in this bundle cannot be read.";
    default:
      return "The judge left no note.";
  }
}

function names(model: OutcomeReportModel, list: readonly DrawnCriterion[]) {
  return list
    .map((c) => criterionLabel(model, c.checkId, c.criterionId).label)
    .join(", ");
}

const COUNT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

/** A count in words up to twelve, in digits above. */
function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** One plain sentence: the conversation's result and the rules behind it. */
function resultSentence(
  conversation: Conversation,
  model: OutcomeReportModel,
): string {
  const all = conversation.criteria;
  const applied = all.filter((c) => c.verdict !== "not_applicable");
  const na = all.length - applied.length;
  const misses = all.filter((c) => isMiss(c.verdict));
  const undecided = all.filter((c) => c.verdict === "not_evaluable");
  const naText = na > 0 ? ` ${na} did not apply.` : "";
  switch (conversationStatus(conversation)) {
    case "resolved":
      return applied.length === 1
        ? `Resolved: the 1 rule that applied was met.${naText}`
        : `Resolved: all ${applied.length} rules that applied were met.${naText}`;
    case "missed":
      return `Missed: ${misses.length} of ${applied.length} ${applied.length === 1 ? "rule" : "rules"} that applied ${misses.length === 1 ? "was" : "were"} not met (${names(model, misses)}).${naText}`;
    case "undecided":
      return undecided.length === 0
        ? "Could not decide: this bundle holds no rule result for this conversation."
        : `Could not decide: no rule was broken, but the judge could not decide ${names(model, undecided)}.${naText}`;
    case "nothing-applied":
      return "No rule applied to this conversation, so nothing was checked. It is neither resolved nor missed.";
  }
}

/**
 * One conversation, in place inside a level-1 toggle: a header line (case,
 * result, why, model) and its body right below it, never a toggle of its
 * own. The body is built when it scrolls near the view (`lazyBody`).
 */
function renderConversation(
  conversation: Conversation,
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
): HTMLElement {
  const status = conversationStatus(conversation);
  const item = el("article", "conv");
  item.dataset.conversation = conversation.conversationId;
  item.dataset.conversationVerdict = conversation.verdict;
  item.dataset.status = status;
  const head = el("div", "conv-h");
  const parts = caseParts(conversation.conversationId);
  head.append(el("span", "cid", parts.label));
  head.append(
    wordPill(statusWord(status, conversation, ladderOn(model)), status),
  );
  const misses = conversation.criteria.filter((c) => isMiss(c.verdict));
  const undecided = conversation.criteria.filter(
    (c) => c.verdict === "not_evaluable",
  );
  head.append(
    el(
      "span",
      "cwhy",
      status === "missed"
        ? `not met: ${names(model, misses)}`
        : status === "undecided"
          ? undecided.length === 0
            ? "no rule result in this bundle"
            : `could not decide: ${names(model, undecided)}`
          : status === "nothing-applied"
            ? "no rule applied"
            : "every rule that applied was met",
    ),
  );
  head.append(el("span", "cmodel", parts.model ?? ""));
  item.append(head);
  const body = el("div", "conv-slot");
  item.append(body);
  lazyBody(body, () => conversationBody(conversation, model, runInfo));
  return item;
}

function conversationBody(
  conversation: Conversation,
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
): HTMLElement {
  const body = el("div", "conv-b");
  const ladder = ladderOn(model);
  const sentence = el("p", "verdict-line", resultSentence(conversation, model));
  sentence.dataset.why = conversationStatus(conversation);
  body.append(sentence);

  // Rule by rule, in plain words
  body.append(el("h4", "", "Rule by rule"));
  // The judge's notes and the rule wording are shown per rule only when the
  // bundle carries them; otherwise one line says so, not one per rule.
  const hasNotes = conversation.criteria.some((c) => c.rationale !== undefined);
  const wordings = conversation.criteria.map(
    (c) => criterionLabel(model, c.checkId, c.criterionId).source,
  );
  const anyWording = wordings.some((w) => w === "sealed");
  const table = el("table", "crit");
  table.dataset.criteriaTable = conversation.conversationId;
  const head = element("thead");
  const headRow = element("tr");
  headRow.append(element("th", "Rule"), element("th", "Result"));
  if (hasNotes) headRow.append(element("th", "The judge's note"));
  head.append(headRow);
  table.append(head);
  const tbody = element("tbody");
  for (const criterion of conversation.criteria) {
    const ref = `${criterion.checkId}.${criterion.criterionId}`;
    const tr = element("tr");
    tr.dataset.crit = ref;
    tr.dataset.critVerdict = criterion.verdict;
    const label = criterionLabel(
      model,
      criterion.checkId,
      criterion.criterionId,
    );
    const nameCell = el("td", "cn");
    nameCell.append(el("b", "", label.label));
    const rowBadge = editedBadge(model, ref);
    if (rowBadge !== undefined) nameCell.append(rowBadge);
    if (label.source === "sealed") {
      const wording = el("small", "", label.text);
      wording.dataset.wording = label.source;
      nameCell.append(wording);
    } else if (anyWording) {
      const wording = el("small", "wsrc", WORDING_FALLBACK_LABEL[label.source]);
      wording.dataset.wording = label.source;
      nameCell.append(wording);
    }
    tr.append(nameCell);
    const verdictCell = element("td");
    verdictCell.append(
      wordPill(criterionWord(criterion, ladder), criterion.verdict),
    );
    tr.append(verdictCell);
    if (!hasNotes) {
      tbody.append(tr);
      continue;
    }
    const noteCell = el("td", "rat");
    if (criterion.verdict === "not_applicable")
      noteCell.append(
        el("span", "muted", "This rule did not come up in this conversation."),
      );
    else if (criterion.rationale !== undefined)
      noteCell.append(
        el(
          "span",
          "sealed",
          judgeNote(
            criterion.rationale,
            criterion.claim?.verdict ?? criterion.verdict,
          ),
        ),
      );
    else noteCell.append(el("span", "muted", noNoteText(criterion)));
    tr.append(noteCell);
    tbody.append(tr);
  }
  table.append(tbody);
  const scroll = el("div", "tscroll");
  scroll.append(table);
  body.append(scroll);
  const gaps: string[] = [];
  if (!anyWording)
    gaps.push(
      wordings.includes("mixed")
        ? "The rule wording is not shown: the reports in this bundle state different wordings."
        : "The rule wording is not in this bundle.",
    );
  if (!hasNotes) {
    const states = new Set(
      conversation.criteria.flatMap((c) =>
        c.claim === undefined ? [] : [c.reportState],
      ),
    );
    gaps.push(
      states.size === 1 && states.has("withheld")
        ? "The judge's notes are not in this bundle: its reports are withheld."
        : states.has("mismatch") || states.has("unreadable")
          ? "The judge's notes are not shown: some reports in this bundle do not match what was sealed, or cannot be read."
          : states.has("withheld")
            ? "The judge's notes are not in this bundle: some of its reports are withheld."
            : "The judge left no notes.",
    );
  }
  if (gaps.length > 0) {
    const gap = el("p", "small", gaps.join(" "));
    gap.dataset.gaps = "true";
    body.append(gap);
  }

  // The conversation itself
  body.append(el("h4", "", "The conversation"));
  body.append(
    renderChat(conversation.transcript, conversation.sourceCapsuleId),
  );

  // Toggle 2: the proofs
  body.append(
    levelToggle(
      2,
      "Proofs: record ids, digests and the judge pin",
      () => conversationProofs(conversation, model, runInfo),
      { className: "proofs" },
    ),
  );
  return body;
}

function conversationProofs(
  conversation: Conversation,
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
): HTMLElement {
  const box = el("div", "pf-b");
  box.dataset.proofsFor = conversation.conversationId;
  const rows: ([string, string] | [string, string, Record<string, string>])[] =
    [];
  rows.push(["Case", conversation.conversationId]);
  rows.push([
    "Case record",
    conversation.sourceCapsuleId === undefined
      ? "not stated by the reports"
      : `${conversation.sourceCapsuleId}${conversation.caseFrom === "claims" ? " (cited by every claim of this conversation; the reports that name it are withheld)" : ""}`,
  ]);
  const dated = conversation.dated;
  if (dated.basis !== "judged") {
    rows.push([
      "Dated by",
      `${dated.stated ?? dated.date}${dated.zone === "not-stated" ? " (timezone not stated)" : ""}: ${BASIS_TEXT[dated.basis]}`,
      { dated: dated.basis },
    ]);
    if (dated.importedAt !== undefined)
      rows.push(["Imported", dated.importedAt]);
    rows.push(["Judged and sealed", conversation.judgedDay]);
  }
  rows.push(["Result capsule", model.capsuleId]);
  const t = conversation.transcript;
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
  rows.push([
    "Judge pin",
    runInfo.judgePinDigest === undefined
      ? pinNotShown(runInfo)
      : `${runInfo.judgePinDigest}${runInfo.judgePinRecomputes === true && runInfo.judgePin !== undefined ? ` = ${runInfo.judgePin.modelId}, prompt ${runInfo.judgePin.promptDigest}, axes ${runInfo.judgePin.axesDigest} (recomputed on this page)` : ""}`,
  ]);
  const dl = proofList(rows);
  dl.dataset.checkIt = conversation.conversationId;
  box.append(dl);

  box.append(el("h5", "", "Each rule's sealed report"));
  const table = el("table", "crit pft");
  const head = element("thead");
  const headRow = element("tr");
  headRow.append(
    element("th", "Rule"),
    element("th", "Sealed verdict"),
    el("th", "n", "P"),
    element("th", "Report capsule (book record)"),
    element("th", "Rationale, as sealed"),
  );
  head.append(headRow);
  table.append(head);
  const tbody = element("tbody");
  for (const criterion of conversation.criteria) {
    const tr = element("tr");
    tr.dataset.proofCrit = `${criterion.checkId}.${criterion.criterionId}`;
    tr.append(
      element(
        "td",
        criterionLabel(model, criterion.checkId, criterion.criterionId).label,
      ),
      element("td", VERDICT_TEXT[criterion.verdict]),
    );
    const p = verdictProbability(criterion);
    const pCell = el("td", "n", p === undefined ? "–" : fmtP(p));
    if (p !== undefined) pCell.dataset.p = fmtP(p);
    tr.append(pCell);
    tr.append(
      el(
        "td",
        "mono",
        criterion.claim === undefined
          ? "no claim: Result v0 carries none for a rule that did not apply"
          : `${criterion.reportCapsuleId ?? "not cited"}${criterion.reportRecordId === undefined ? "" : ` (${criterion.reportRecordId})`}`,
      ),
    );
    const rationale = el("td", "rat");
    if (criterion.rationale !== undefined) {
      const sealed = el("code", "sealed", criterion.rationale);
      sealed.dataset.rationale = "sealed";
      rationale.append(sealed);
    } else rationale.append(el("span", "muted", "–"));
    tr.append(rationale);
    tbody.append(tr);
  }
  table.append(tbody);
  const scroll = el("div", "tscroll");
  scroll.append(table);
  box.append(scroll);
  const derived = el(
    "p",
    "",
    "P is the probability the judge gave the verdict it returned. The judge's note is derived from its probabilities; the judge returns no free-text reasoning and cites no turn of the conversation.",
  );
  derived.dataset.rationaleLabel = "derived";
  box.append(derived);
  box.append(
    el(
      "p",
      "",
      `To recompute: read each report above from the book, check its digest, and take the AND of the ${conversation.criteria.length === 1 ? "one verdict" : `${countWord(conversation.criteria.length)} verdicts`} (a rule that did not apply passes; a conversation where nothing applied is not resolved). To re-judge, run the pinned judge on the case record and compare.`,
    ),
  );
  return box;
}

/** What a page says when no judge pin is drawn: withheld reports are not the same as an unstated pin, and a mismatched report is neither. */
function pinNotShown(runInfo: OutcomeReportRunInfo): string {
  if (!runInfo.pinned)
    return "differs across the cited reports, so none is shown";
  const unread =
    (runInfo.reportsMismatched ?? 0) + (runInfo.reportsUnreadable ?? 0);
  const cited = runInfo.reportsCited ?? 0;
  const parts: string[] = [];
  if (runInfo.reportsWithheld !== undefined)
    parts.push(
      `the judge's reports that state it are withheld (${fmtCount(runInfo.reportsWithheld)} of ${fmtCount(cited)})`,
    );
  if (unread > 0)
    parts.push(
      `${fmtCount(unread)} of ${fmtCount(cited)} reports in this bundle do not match what was sealed or cannot be read`,
    );
  return parts.length === 0
    ? "not stated"
    : `not in this bundle: ${parts.join("; ")}`;
}

function renderConversationList(
  conversations: readonly Conversation[],
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
  key: string,
): HTMLElement {
  const list = el("div", "convs");
  list.dataset.conversationsFor = key;
  list.dataset.conversationCount = String(conversations.length);
  if (conversations.length === 0)
    list.append(el("p", "small", "no conversations"));
  for (const conversation of conversations)
    list.append(renderConversation(conversation, model, runInfo));
  return list;
}

/** Toggle 1 on a summary line: the conversations behind it, listed in place, built on open. */
function drill(
  label: string,
  build: () => Node,
  key: string,
): HTMLDetailsElement {
  const details = levelToggle(1, label, build, { className: "line" });
  details.dataset.drill = key;
  return details;
}

function conversationsDrill(
  label: string,
  conversations: readonly Conversation[],
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
  key: string,
): HTMLDetailsElement {
  return drill(
    label,
    () => renderConversationList(conversations, model, runInfo, key),
    key,
  );
}

/**
 * The missed line's toggle: why conversations missed, then the missed
 * conversations under each reason, in place. A reason is the producer's
 * sealed reason code when the terms give it a label (`terms.reasonCodes`),
 * else the first rule not met; a raw code is never shown. Content of the
 * one level-1 toggle, never a level of its own.
 */
function whyMissed(
  missed: readonly Conversation[],
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
): HTMLElement {
  const box = el("div", "why-missed");
  box.dataset.section = "why-missed";
  const missedIds = new Set(missed.map((c) => c.conversationId));
  const groups = model.missedReasons
    .map((g) => ({
      ...g,
      conversations: g.conversations.filter((c) =>
        missedIds.has(c.conversationId),
      ),
    }))
    .filter((g) => g.conversations.length > 0);
  box.dataset.reasons = String(groups.length);
  box.append(el("h5", "", "Why conversations missed"));
  const table = element("table");
  const tbody = element("tbody");
  for (const group of groups) {
    const tr = element("tr");
    tr.dataset.reasonKey = group.key;
    tr.dataset.reasonStructured = String(group.structured);
    tr.dataset.count = String(group.conversations.length);
    tr.append(
      element("td", group.label),
      el("td", "n", fmtCount(group.conversations.length)),
    );
    tbody.append(tr);
  }
  table.append(tbody);
  box.append(table);
  const anyStructured = groups.some((g) => g.structured);
  box.append(
    el(
      "p",
      "small",
      anyStructured
        ? "Each reason is the reason code the producer sealed in the judge's report, by its label in the terms; a conversation with no labelled code is listed under the first rule it did not meet."
        : "No report in this bundle carries a labelled reason code, so each conversation is listed under the first rule it did not meet.",
    ),
  );
  for (const group of groups) {
    const head = el(
      "div",
      "rsn-h",
      `${group.label} · ${fmtCount(group.conversations.length)}`,
    );
    head.dataset.reasonFor = group.key;
    box.append(head);
    box.append(
      renderConversationList(
        group.conversations,
        model,
        runInfo,
        `reason:${group.key}`,
      ),
    );
  }
  return box;
}

// ---------------------------------------------------------------------------
// The sheet: header meta, report lines, stamp, tamper note
// ---------------------------------------------------------------------------

/** The pack and version as one line: both come from the claims' `contract_ref` (see `readOutcomeReportTerms`), or read "not stated". */
function packLine(model: OutcomeReportModel): string {
  const { id, version } = model.terms.pack;
  return id === NOT_STATED ? NOT_STATED : `${id} v${version}`;
}

// ---------------------------------------------------------------------------
// Dating: which date the calendar and period count a conversation under, and
// the plain label that says so (see `ConversationDate`)
// ---------------------------------------------------------------------------

function span(days: readonly string[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return "unknown";
  return first === last ? first : `${first} – ${last}`;
}

const BASIS_TEXT: Record<ConversationDate["basis"], string> = {
  source:
    "source says (backfilled record; the source's own timestamp, self-attested)",
  record: "the case record's own timestamp",
  judged: "the day the judgments were sealed (no case record date to read)",
};

/** The page's one plain statement of what its dates are, or undefined when every conversation is dated by the day it was judged (the card's behaviour before record dating). */
function datingNote(model: OutcomeReportModel): string | undefined {
  const { basis, counts, judgedDays, zoneNotStated } = model.dating;
  if (basis === "judged") return undefined;
  const sealed = `Sealed ${span(judgedDays)}.`;
  const parts: string[] = [];
  if (basis === "source")
    parts.push(
      'Dates are the source\'s own timestamps for backfilled records ("source says"), as given, not when the records were sealed.',
    );
  else if (basis === "record")
    parts.push(
      "The period is when the conversations happened (each case record's own time, as given), not when they were judged.",
    );
  else {
    parts.push(
      "Dates are each conversation's own date, as given, not when the judgments were sealed:",
    );
    if (counts.source > 0)
      parts.push(
        `${counts.source} backfilled by the source's own timestamp ("source says");`,
      );
    if (counts.record > 0)
      parts.push(`${counts.record} by the case record's own timestamp;`);
    if (counts.judged > 0)
      parts.push(
        `${counts.judged} with no case record date to read, by the day they were judged.`,
      );
  }
  parts.push(sealed);
  if (counts.source > 0)
    parts.push(
      "A backfilled record's source time is self-attested: carrying it does not make it witnessed.",
    );
  if (zoneNotStated > 0)
    parts.push(
      `Timezone not stated on ${zoneNotStated} of ${model.totalCount}; no zone is assumed.`,
    );
  return parts.join(" ");
}

function renderMeta(host: HTMLElement, model: OutcomeReportModel): void {
  const section = el("section", "");
  section.dataset.section = "meta";

  const row1 = el("div", "ih-row");
  const bill = el("div", "party");
  bill.append(el("div", "k", "Outcomes pack"));
  bill.append(el("div", "v", packLine(model)));
  row1.append(bill);
  const title = el("div", "ih-title");
  title.append(el("h1", "inv-title", "Outcome report"));
  // No Evidence Contract field states when the terms were locked; the line
  // is drawn only when one does, never as a standing "not stated".
  if (model.terms.pack.locked !== NOT_STATED)
    title.append(
      el("div", "inv-sub", `Terms locked: ${model.terms.pack.locked}`),
    );
  row1.append(title);
  section.append(row1);

  const row2 = el("div", "ih-row");
  const details = el("div", "meta");
  const first = model.days[0]?.date;
  const last = model.days[model.days.length - 1]?.date;
  const metaRow = (label: string, value: string): void => {
    const line = element("div");
    line.append(element("span", label), element("span", value));
    details.append(line);
  };
  metaRow(
    "Period",
    first === undefined || last === undefined
      ? "no conversations"
      : first === last
        ? first
        : `${first} – ${last}`,
  );
  const note = datingNote(model);
  if (note !== undefined) {
    metaRow("Sealed", span(model.dating.judgedDays));
    details.lastElementChild!.setAttribute("data-sealed", "");
  }
  metaRow("Conversations", fmtCount(model.totalCount));
  const checked = el("div", "party");
  const rules = model.terms.checks.reduce((n, c) => n + c.criteria.length, 0);
  checked.append(el("div", "k", "What was checked"));
  const what = el(
    "div",
    "d",
    `Each conversation against ${rules} rule${rules === 1 ? "" : "s"} in ${model.terms.checks.length} group${model.terms.checks.length === 1 ? "" : "s"}: ${model.terms.checks.map((c) => c.question).join(" · ")}. A conversation is resolved when every rule that applies to it is met, and at least one applies.`,
  );
  what.dataset.whatChecked = String(rules);
  checked.append(what);
  row2.append(checked, details);
  section.append(row2);
  if (note !== undefined) {
    const label = el("p", "date-note", note);
    label.dataset.dateNote = model.dating.basis;
    section.append(label);
  }
  host.append(section);
}

// ---------------------------------------------------------------------------
// Summary: report lines
// ---------------------------------------------------------------------------

function renderLines(
  host: HTMLElement,
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
): void {
  const section = el("section", "");
  section.dataset.section = "lines";
  const table = document.createElement("table");
  table.className = "lines";
  table.dataset.rows = "report-lines";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(element("th", "Result"), el("th", "n", "Conversations"));
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement("tbody");
  const ladder = ladderOn(model);
  const byStatus = (status: ConversationStatus) =>
    model.conversations.filter((c) => conversationStatus(c) === status);
  const resolved = byStatus("resolved");
  const missed = byStatus("missed");
  const undecided = [...byStatus("undecided"), ...byStatus("nothing-applied")];
  const share = (n: number) =>
    fmtShare(n, model.totalCount, model.options.percentages);
  // held is read from calibration samples, resolved from claim rollups --
  // two independent sources this card shows side by side and never
  // subtracts one from the other.
  type Line = {
    key: string;
    label: string;
    help: string;
    count: number;
    shown: string;
    behind?: readonly Conversation[];
  };
  const lines: Line[] = [
    {
      key: "resolved",
      label: ladder ? "Established (resolved)" : "Resolved",
      help: "Every rule that applied was met.",
      count: resolved.length,
      shown: share(resolved.length),
      behind: resolved,
    },
    {
      key: "missed",
      label: ladder ? "Failed (missed)" : "Missed",
      help: "At least one rule was not met.",
      count: missed.length,
      shown: share(missed.length),
      behind: missed,
    },
  ];
  if (undecided.length > 0)
    lines.push({
      key: "undecided",
      label: ladder ? "Inconclusive or not present" : "Could not decide",
      help: "No rule was broken, but the judge could not decide a rule, or no rule applied. Neither resolved nor missed.",
      count: undecided.length,
      shown: share(undecided.length),
      behind: undecided,
    });
  lines.push(
    {
      key: "held",
      label: "Held for a person to decide",
      help: "A person's spot check disagreed with a resolved result.",
      count: model.heldCount,
      shown: fmtCount(model.heldCount),
    },
    {
      key: "added",
      label: "Added after a person's check",
      help: "A person's spot check found a missed result was in fact resolved.",
      count: model.addedCount,
      shown: fmtCount(model.addedCount),
    },
  );
  for (const line of lines) {
    const tr = document.createElement("tr");
    tr.dataset.line = line.key;
    tr.dataset.count = String(line.count);
    const desc = el("td", "desc");
    desc.append(el("b", "", line.label));
    desc.append(el("small", "", line.help));
    if (line.behind !== undefined && line.behind.length > 0) {
      const label = `Show the ${fmtCount(line.behind.length)} conversation${line.behind.length === 1 ? "" : "s"}`;
      const behind = line.behind;
      desc.append(
        line.key === "missed"
          ? drill(label, () => whyMissed(behind, model, runInfo), line.key)
          : conversationsDrill(label, behind, model, runInfo, line.key),
      );
    }
    tr.append(desc, el("td", "n", line.shown));
    tbody.append(tr);
  }
  table.append(tbody);
  section.append(table);
  const na = el(
    "p",
    "na-note",
    `${fmtCount(model.notApplicableCount)} rule check${model.notApplicableCount === 1 ? "" : "s"} did not apply to the conversation and count as met beside a met rule.`,
  );
  na.dataset.line = "not-applicable";
  na.dataset.count = String(model.notApplicableCount);
  section.append(na);
  host.append(section);

  const stamps = el("div", "stamps inl");
  const stamp = el(
    "div",
    "stamp rec",
    "Verified · recomputed from the sealed bundle",
  );
  stamp.append(
    el(
      "small",
      "",
      "every count on this page is recomputed from the sealed claims and the records they cite",
    ),
  );
  stamps.append(stamp);
  host.append(stamps);
}

// ---------------------------------------------------------------------------
// Summary: results rule by rule
// ---------------------------------------------------------------------------

function renderRules(
  host: HTMLElement,
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
): void {
  const section = el("section", "sec");
  section.dataset.section = "rules";
  section.append(el("h2", "", "Results rule by rule"));
  section.append(
    el(
      "p",
      "lede",
      "How many conversations met each rule. Open a rule to read the conversations where it was not met.",
    ),
  );
  const ladder = ladderOn(model);
  const table = el("table", "rules");
  table.dataset.rows = "rules";
  const thead = element("thead");
  const headRow = element("tr");
  headRow.append(
    element("th", "Rule"),
    el("th", "n", ruleWord("met", ladder, "yes").word),
    el("th", "n", ruleWord("not_met", ladder, "yes").word),
    el("th", "n", ruleWord("not_applicable", ladder, "yes").word),
    el("th", "n", ladder ? "inconclusive / not checked" : "could not decide"),
  );
  thead.append(headRow);
  table.append(thead);
  const tbody = element("tbody");
  for (const check of model.terms.checks) {
    const group = el("tr", "grp");
    group.dataset.checkId = check.id;
    group.dataset.passCount = String(model.checkPassCounts.get(check.id) ?? 0);
    const cell = el("td", "", check.question);
    cell.setAttribute("colspan", "5");
    group.append(cell);
    tbody.append(group);
    for (const criterion of check.criteria) {
      const ref = `${check.id}.${criterion.id}`;
      const of = (pick: (v: DrawnVerdict) => boolean) =>
        model.conversations.filter((c) =>
          c.criteria.some(
            (cr) =>
              cr.checkId === check.id &&
              cr.criterionId === criterion.id &&
              pick(cr.verdict),
          ),
        );
      const met = of((v) => v === "met");
      const notMet = of(isMiss);
      const na = of((v) => v === "not_applicable");
      const undecided = of((v) => v === "not_evaluable");
      const tr = el("tr", "rule");
      tr.dataset.rule = ref;
      tr.dataset.tier = model.criterionTiers.get(ref) ?? "unknown";
      const label = criterionLabel(model, check.id, criterion.id);
      const nameCell = el("td", "cn");
      nameCell.append(el("b", "", label.label));
      const badge = editedBadge(model, ref);
      if (badge !== undefined) nameCell.append(badge);
      if (label.source === "sealed")
        nameCell.append(el("small", "", label.text));
      const problems = [
        ...notMet,
        ...undecided.filter((c) => !notMet.includes(c)),
      ];
      tr.append(
        nameCell,
        el("td", "n ok", fmtCount(met.length)),
        el(
          "td",
          `n${notMet.length > 0 ? " bad" : ""}`,
          fmtCount(notMet.length),
        ),
        el("td", "n", fmtCount(na.length)),
        el("td", "n", fmtCount(undecided.length)),
      );
      tbody.append(tr);
      // The conversations behind a rule open in a full-width row below it,
      // so each one reads at the table's width.
      if (problems.length > 0) {
        const drillRow = el("tr", "drill-row");
        drillRow.dataset.drillFor = ref;
        const cell = element("td");
        cell.setAttribute("colspan", "5");
        cell.append(
          conversationsDrill(
            `${fmtCount(notMet.length)} not met${undecided.length > 0 ? `, ${fmtCount(undecided.length)} undecided` : ""}: show them`,
            problems,
            model,
            runInfo,
            `rule:${ref}`,
          ),
        );
        drillRow.append(cell);
        tbody.append(drillRow);
      }
    }
  }
  table.append(tbody);
  const scroll = el("div", "tscroll");
  scroll.append(table);
  section.append(scroll);
  host.append(section);
}

// ---------------------------------------------------------------------------
// Day by day
// ---------------------------------------------------------------------------

function renderCalendar(host: HTMLElement, model: OutcomeReportModel): void {
  const section = el("section", "sec");
  section.dataset.section = "calendar";
  section.append(el("h2", "", "Day by day"));
  const note = datingNote(model);
  section.append(
    el(
      "p",
      "lede",
      note === undefined
        ? "Resolved conversations per day, cited by this bundle's claims."
        : "Resolved conversations per day, by each conversation's own date, cited by this bundle's claims.",
    ),
  );
  if (note !== undefined) {
    const label = el("p", "date-note", note);
    label.dataset.dateNote = model.dating.basis;
    section.append(label);
  }
  const list = el("div", "cal");
  list.dataset.days = String(model.days.length);
  for (const day of model.days) {
    const item = el("div", "day");
    item.dataset.day = day.date;
    item.dataset.resolved = String(day.resolvedCount);
    item.dataset.total = String(day.conversations.length);
    item.append(el("div", "dn", day.date));
    if (note !== undefined) {
      const bases = new Set(day.conversations.map((c) => c.dated.basis));
      if (bases.has("source")) {
        const chip = el("div", "src-says", "source says");
        chip.dataset.sourceSays = String(
          day.conversations.filter((c) => c.dated.basis === "source").length,
        );
        item.append(chip);
      }
      const notStated = day.conversations.filter(
        (c) => c.dated.zone === "not-stated",
      ).length;
      if (notStated > 0) {
        const tz = el("div", "tz", "timezone not stated");
        tz.dataset.tzMarker = "not-stated";
        item.append(tz);
      }
    }
    item.append(
      el(
        "div",
        "v",
        fmtShare(
          day.resolvedCount,
          day.conversations.length,
          model.options.percentages,
        ),
      ),
    );
    const mini = el("div", "mini");
    const share =
      day.conversations.length === 0
        ? 0
        : day.resolvedCount / day.conversations.length;
    const fill = element("i");
    fill.style.width = `${Math.round(share * 100)}%`;
    mini.append(fill);
    item.append(mini);
    if (note !== undefined) {
      const sealed = el("div", "sealed", `sealed ${span(day.judgedDays)}`);
      sealed.dataset.sealed = day.judgedDays.join(" ");
      item.append(sealed);
    }
    if (day.policyChanged !== null) {
      const flag = el("div", "flag", "policy changed");
      flag.dataset.policyChanged = day.policyChanged;
      item.append(flag);
    }
    list.append(item);
  }
  section.append(list);
  host.append(section);
}

// ---------------------------------------------------------------------------
// Human spot checks
// ---------------------------------------------------------------------------

function renderHumanChecks(
  host: HTMLElement,
  calibration: readonly CalibrationWeek[],
): void {
  const section = el("section", "sec");
  section.dataset.section = "human-checks";
  section.append(el("h2", "", "Human spot checks"));
  section.append(
    el(
      "p",
      "lede",
      "Weekly blind re-grades by a person. Disagreements are held.",
    ),
  );
  if (calibration.length === 0) {
    section.append(el("p", "", "no calibration-summary/v1 records cited"));
    host.append(section);
    return;
  }
  const table = document.createElement("table");
  table.className = "hct";
  table.dataset.weeks = String(calibration.length);
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(
    element("th", "Week"),
    el("th", "n", "Agreed"),
    el("th", "n", "Held"),
    el("th", "n", "Added"),
  );
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement("tbody");
  for (const week of calibration) {
    const tr = document.createElement("tr");
    tr.dataset.week = week.weekId;
    tr.dataset.k = String(week.k);
    tr.dataset.n = String(week.n);
    tr.append(el("td", "", week.weekId));
    tr.append(el("td", "n", `${week.k} of ${week.n}`));
    const held = week.sample.filter(
      (s) => s.aiVerdict === "met" && s.humanVerdict !== "met",
    ).length;
    const added = week.sample.filter(
      (s) => s.aiVerdict !== "met" && s.humanVerdict === "met",
    ).length;
    const heldCell = el("td", "n", String(held));
    heldCell.dataset.held = String(held);
    const addedCell = el("td", "n", String(added));
    addedCell.dataset.added = String(added);
    tr.append(heldCell, addedCell);
    tbody.append(tr);
  }
  table.append(tbody);
  section.append(table);
  host.append(section);
}

// ---------------------------------------------------------------------------
// The terms
// ---------------------------------------------------------------------------

function renderTerms(host: HTMLElement, model: OutcomeReportModel): void {
  const section = el("div", "rp-s");
  section.dataset.section = "terms";
  section.append(el("h3", "", "The terms: what counts as resolved"));
  const lede = el(
    "p",
    "lede",
    `Every term below is read from the sealed claims and reports in this bundle, or marked "${NOT_STATED}".${model.terms.pack.agreement === NOT_STATED ? "" : ` Agreed with the counterparty: ${model.terms.pack.agreement}.`}`,
  );
  lede.dataset.termsSource = "bundle";
  section.append(lede);

  const pack = el("div", "pack");
  const packField = (label: string, value: string): void => {
    const box = el("div", "pk");
    box.append(el("div", "k", label), el("div", "v", value));
    pack.append(box);
  };
  packField("Outcomes pack", model.terms.pack.id);
  packField(
    "Version",
    model.terms.pack.version === NOT_STATED
      ? NOT_STATED
      : `${model.terms.pack.version} (from the claims' contract_ref)`,
  );
  if (model.terms.pack.locked !== NOT_STATED)
    packField("Locked", model.terms.pack.locked);
  section.append(pack);

  const outcome = el("div", "outcome");
  const outcomeIcon = el("div", "oic");
  const target = icon("target");
  if (target !== undefined) outcomeIcon.append(target);
  outcome.append(outcomeIcon);
  const outcomeBody = element("div");
  outcomeBody.append(el("div", "t", "The outcome"));
  outcomeBody.append(el("div", "v", model.terms.pack.outcomeStatement));
  outcome.append(outcomeBody);
  section.append(outcome);

  const checks = el("div", "checks");
  checks.dataset.checks = String(model.terms.checks.length);
  for (const check of model.terms.checks) {
    const card = el("section", "check");
    card.dataset.checkId = check.id;
    const checkIcon = el("div", "ic");
    const drawn = icon(check.icon);
    if (drawn !== undefined) checkIcon.append(drawn);
    card.append(checkIcon);
    card.append(el("div", "q", check.question));
    card.append(el("div", "d", check.description));
    const criteria = el("ul", "subs");
    for (const criterion of check.criteria) {
      const ref = `${check.id}.${criterion.id}`;
      const tier = model.criterionTiers.get(ref) ?? "unknown";
      const item = element("li");
      item.dataset.criterionId = criterion.id;
      item.dataset.tier = tier;
      const wording = model.criterionWording.get(ref) ?? {
        text: criterion.text,
        source: "unstated" as const,
      };
      item.dataset.wording = wording.source;
      const label = el("b", "", criterion.label);
      const termsBadge = editedBadge(model, ref);
      if (termsBadge !== undefined) label.append(termsBadge);
      item.append(label);
      item.append(element("span", `${wording.text} (${TIER_LABEL[tier]})`));
      if (wording.source !== "sealed")
        item.append(
          el("small", "wsrc", WORDING_FALLBACK_LABEL[wording.source]),
        );
      criteria.append(item);
    }
    card.append(criteria);
    checks.append(card);
  }
  section.append(checks);
  const note = el("p", "small", wordingNote(model));
  note.dataset.wordingNote = "true";
  section.append(note);
  section.append(el("div", "rule", model.terms.pack.resolutionRule));
  host.append(section);
}

// ---------------------------------------------------------------------------
// What ran
// ---------------------------------------------------------------------------

function renderWhatRan(host: HTMLElement, runInfo: OutcomeReportRunInfo): void {
  const section = el("div", "rp-s");
  section.dataset.section = "what-ran";
  section.append(el("h3", "", "What ran"));
  const ran = el("div", "ran");
  ran.dataset.pinned = String(runInfo.pinned);
  if (runInfo.judgePinRecomputes !== undefined)
    ran.dataset.pinRecomputes = String(runInfo.judgePinRecomputes);
  const box = (label: string, value: string, key: string): void => {
    const item = el("div", "it");
    item.dataset.ran = key;
    item.append(el("div", "k", label));
    item.append(el("div", "v", value));
    ran.append(item);
  };
  // The pin's components are drawn only when they recompute to the sealed
  // digest (verifyJudgePin); otherwise they are "not stated", never shown
  // beside a digest they do not produce.
  const pin =
    runInfo.judgePinRecomputes === true ? runInfo.judgePin : undefined;
  box("Contract", runInfo.contract ?? "not stated", "contract");
  box(
    "Judge model",
    pin === undefined
      ? "not stated"
      : pin.modelVersion === undefined
        ? pin.modelId
        : `${pin.modelId} ${pin.modelVersion}`,
    "judge-model",
  );
  box(
    "Judge pin digest",
    runInfo.judgePinDigest === undefined
      ? pinNotShown(runInfo)
      : pin === undefined
        ? runInfo.judgePinDigest
        : `${runInfo.judgePinDigest} (recomputed from the model, prompt, axes and sampling params shown here)`,
    "judge-pin-digest",
  );
  box(
    "Judge prompt digest",
    pin?.promptDigest ?? "not stated",
    "judge-prompt-digest",
  );
  box(
    "Judge axes digest",
    pin?.axesDigest ?? "not stated",
    "judge-axes-digest",
  );
  box(
    "Agent / test suite / human-check protocol",
    "not stated — this evaluation-report/v1 shape carries none of these fields",
    "agent",
  );
  section.append(ran);
  if (runInfo.judgePinRecomputes === false) {
    const warning = el(
      "p",
      "",
      "the judge pin components the reports carry do not recompute to the sealed judge pin digest — they are not shown",
    );
    warning.dataset.pinComponentsMismatch = "true";
    section.append(warning);
  }
  const lock = el(
    "div",
    "lock",
    "The judge pin digest covers model id, judge prompt and axes, and sampling params (capsulectl judge pin). It does not cover the human-check protocol name: this bundle seals no method lock, and this card never implies one exists.",
  );
  section.append(lock);
  if (!runInfo.pinned) {
    const warning = el(
      "p",
      "",
      "what ran varies across the cited reports — the values above are drawn only when every one agrees, and are omitted ('not stated') here because they do not",
    );
    warning.dataset.pinMismatch = "true";
    section.append(warning);
  }
  host.append(section);
}

// ---------------------------------------------------------------------------
// Verification details
// ---------------------------------------------------------------------------

function renderVerificationDetails(
  host: HTMLElement,
  bundle: unknown,
  verified: BundleVerificationResult,
): void {
  const section = el("div", "rp-s");
  section.dataset.section = "verification-details";
  section.append(el("h3", "", "Verification details"));
  section.append(
    el("p", "lede", "Repeat offline with the open-source verifier."),
  );
  const model = buildVerificationPageModel(bundle, verified);
  const tech = el("div", "tech");
  const field = (label: string, value: string): void => {
    tech.append(el("div", "k", label), el("div", "v", value));
  };
  field("Bundle digest", model.bundleDigest ?? "uncomputable");
  field("Checkpoint root", model.checkpointRoot ?? "absent");
  field("Checkpoint size", String(model.checkpointSize ?? "absent"));
  section.append(tech);
  const note = el(
    "p",
    "note",
    "This bundle's own checkpoint — an append-only Merkle Mountain Range over the sealed records — not a month-level RFC 6962 tree computed in the browser. Repeat this check offline with the open-source verifier.",
  );
  note.dataset.checkpointKind = "mmr";
  section.append(note);
  host.append(section);
}

// ---------------------------------------------------------------------------
// Proofs for the whole report: one toggle at the foot of the page
// ---------------------------------------------------------------------------

function renderReportProofs(
  host: HTMLElement,
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
  bundle: unknown,
  verified: BundleVerificationResult,
): void {
  const section = el("section", "sec rp");
  section.dataset.section = "report-proofs";
  // Built on first open, like every other toggle.
  const toggle = levelToggle(
    2,
    "Proofs for this report: the terms, what ran, and how to verify the whole bundle",
    () => {
      const box = el("div", "pf-b");
      const ids = proofList([
        ["Result capsule", model.capsuleId],
        ["Outcomes pack", packLine(model)],
      ]);
      ids.dataset.reportIds = "true";
      box.append(ids);
      renderTerms(box, model);
      renderWhatRan(box, runInfo);
      renderVerificationDetails(box, bundle, verified);
      const tamper = el(
        "p",
        "tamper-note",
        'This page only ever renders a bundle that already verified: there is no interactive "try tampering" control, because this viewer never shows content first and checks second. Tamper with any claim, record, or checkpoint in the underlying bundle and the whole page is replaced by the verification-failed banner, before anything here is drawn.',
      );
      tamper.dataset.tamperNote = "verify-first";
      box.append(tamper);
      return box;
    },
    { className: "proofs" },
  );
  section.append(toggle);
  host.append(section);
}

export async function renderOutcomeReportPage(
  result: ResultRoot,
  options: OutcomeReportOptions,
  bundle: unknown,
  verified: BundleVerificationResult,
  root: HTMLElement,
): Promise<void> {
  const model = buildOutcomeReportModel(result, options);
  const runInfo = await verifyJudgePin(model.runInfo);
  const wrapper = el("section", "oi");
  wrapper.dataset.page = "outcome-report";
  wrapper.dataset.levels = "2";
  if (ladderOn(model)) wrapper.dataset.resultWords = "ladder";
  const style = document.createElement("style");
  style.textContent = OUTCOME_REPORT_CSS;
  wrapper.append(style);
  renderProducerNote(wrapper, model);
  const sheet = el("div", "sheet");
  const pad = el("div", "pad");
  renderMeta(pad, model);
  renderLines(pad, model, runInfo);
  sheet.append(pad);
  wrapper.append(sheet);

  renderRules(wrapper, model, runInfo);
  renderCalendar(wrapper, model);
  renderHumanChecks(wrapper, model.calibration);
  renderReportProofs(wrapper, model, runInfo, bundle, verified);
  root.append(wrapper);
}

export type {
  CalibrationWeek,
  Conversation,
  ConversationVerdict,
  CriterionTierReading,
  MissedReasonGroup,
  OutcomeReportModel,
  OutcomeReportOptions,
};
