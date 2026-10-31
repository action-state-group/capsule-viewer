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
  conversationFold,
  evidenceAction,
  ruleWord,
  wordPill,
  caseParts,
  judgeNote,
  assuranceRow,
  reportSummary,
  type Worded,
} from "./report-levels.js";
import { buildVerificationPageModel } from "@action-state-group/agent-action-capsule";
import type { ResultRoot } from "@action-state-group/agent-action-capsule";
import { renderLegend, tagSource } from "./report-legend.js";
import { provenanceLines, renderProvenance } from "./report-provenance.js";
import {
  expandableRow,
  leadWithProvenance,
  renderCheckYourself,
} from "./report-front.js";
import type { Words } from "./contract-report-wording.js";

/**
 * The contract-report module's `lines` grouping (contract-report.ts): a
 * report read as result lines, results rule by rule, day by day and human
 * spot checks, rendered from a verified `ResultRoot`. The Outcomes report is
 * this grouping with the Outcomes wording pack. Drawn by the module in place
 * of `renderResultPage` when the bundle's `outcome-report/v1` extension opts
 * in (see `readOutcomeReportPresentation`) -- after the same verify-first
 * gate every other root family goes through: nothing here ever runs on a
 * bundle that did not verify.
 *
 * Every word on it is the wording pack's (`w`); nothing here chooses a word.
 *
 * The card renders into the host's three regions, one `.oi`-classed
 * wrapper in each; the L0 wrapper holds its `<style>` (`OUTCOME_REPORT_CSS`)
 * as its first child. Every selector in that stylesheet is scoped under
 * `.oi`, so it can never affect, or be affected by, the rest of the page
 * (the core's verification section, which opens L2 before the card's own
 * L2 detail, or the generic Result page this bundle opted out of).
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

function fmtShare(
  count: number,
  total: number,
  percentages: boolean,
  w: Words,
): string {
  if (percentages)
    return total === 0
      ? "–"
      : w.t("lines.share.percent", {
          p: String(Math.round((count / total) * 100)),
        });
  return w.t("lines.share", { count: fmtCount(count), total: fmtCount(total) });
}

const tierLabel = (tier: CriterionTierReading, w: Words): string =>
  w.t(`lines.tier.${tier}`);

/**
 * A rule's name and wording. The name is the pack's `row.<check>.<rule>.label`
 * when it sets one (contract-report/v1 section 3), else the contract's label.
 */
function criterionLabel(
  model: OutcomeReportModel,
  checkId: string,
  criterionId: string,
  w: Words,
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
    label:
      w.row(`${checkId}.${criterionId}`, "label") ??
      criterion?.label ??
      `${checkId}.${criterionId}`,
    text: wording?.text ?? criterion?.text ?? "",
    question: check?.question ?? checkId,
    source: wording?.source ?? "unstated",
  };
}

/** The label a criterion's wording carries when it is NOT the sealed text. */
const wordingFallback = (
  source: Exclude<CriterionWording["source"], "sealed">,
  w: Words,
): string => w.t(`lines.wording.${source}`);

/** One sentence on where the criterion wording on this page comes from. */
function wordingNote(model: OutcomeReportModel, w: Words): string {
  const sources = new Set(
    [...model.criterionWording.values()].map((c) => c.source),
  );
  if (sources.size === 1 && sources.has("sealed"))
    return w.t("lines.wording-note.sealed");
  if (!sources.has("sealed")) return w.t("lines.wording-note.unstated");
  return w.t("lines.wording-note.partly");
}

/** The producer's "edited" badge for a criterion, when its presentation
 * extension marks one -- presentation text, titled as such, never evidence. */
function editedBadge(
  model: OutcomeReportModel,
  ref: string,
  w: Words,
): HTMLElement | undefined {
  const edited = model.options.editedCriteria?.find((e) => e.criterion === ref);
  if (edited === undefined) return undefined;
  const badge = el("span", "edited", edited.badge);
  badge.dataset.edited = ref;
  badge.title = w.t("lines.edited.title");
  return badge;
}
function renderProducerNote(
  host: HTMLElement,
  model: OutcomeReportModel,
  w: Words,
): void {
  const note = model.options.producerNote;
  if (note === undefined) return;
  const box = el("aside", "pnote");
  box.dataset.producerNote = "true";
  box.append(el("div", "pn-k", w.t("lines.producer-note.kicker")));
  box.append(el("h2", "pn-t", note.title));
  const list = tagSource(el("ul", "pn-l"), "producer");
  for (const line of note.lines) list.append(element("li", line));
  box.append(list);
  box.append(el("p", "pn-src", w.t("lines.producer-note.source")));
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
const verdictText = (verdict: DrawnVerdict, w: Words): string =>
  w.t(`lines.pf.verdict.${verdict}`);

/** A rule result the judge returned as not met. A failed or unsupported claim is not one: its verdict was never drawn (see `isUnverified`). */
function isMiss(verdict: DrawnVerdict): boolean {
  return verdict === "not_met";
}

/** A claim that failed verification, or whose cited evidence this bundle does not resolve: the records do not say whether the rule was met or not. */
function isUnverified(verdict: DrawnVerdict): boolean {
  return verdict === "failed" || verdict === "unsupported";
}

/**
 * A conversation's result. `nothing-applied`: it has rules and every one was
 * not applicable, so nothing was checked -- never "missed". A conversation
 * with no rule result at all is undecided, never "no rule applied".
 * `unverified`: the model rolls it up as not met only because a claim
 * failed verification or its evidence is missing, with no rule result "not
 * met" -- its own state, never counted as missed.
 */
export type ConversationStatus =
  | "resolved"
  | "missed"
  | "unverified"
  | "undecided"
  | "nothing-applied";

/** A rule that did not apply: not applicable, or judged out of scope ("did not arise", Result v0 section 4.2). Never met; out of scope is still counted on its own. */
function notApplying(verdict: DrawnVerdict): boolean {
  return verdict === "not_applicable" || verdict === "out_of_scope";
}

export function conversationStatus(
  conversation: Conversation,
): ConversationStatus {
  if (conversation.verdict === "met") return "resolved";
  if (conversation.criteria.some((c) => isMiss(c.verdict))) return "missed";
  if (conversation.criteria.some((c) => isUnverified(c.verdict)))
    return "unverified";
  if (conversation.verdict === "not_met") return "missed";
  return conversation.criteria.length > 0 &&
    conversation.criteria.every((c) => notApplying(c.verdict))
    ? "nothing-applied"
    : "undecided";
}

// Result words never come from the bundle (presentation contract section
// 6): they are the card's wording pack's.
export function statusWord(
  status: ConversationStatus,
  conversation: Conversation,
  w: Words,
): Worded {
  if (status === "resolved")
    return { word: w.t("lines.status.resolved"), tone: "ok" };
  if (status === "missed")
    return { word: w.t("lines.status.missed"), tone: "bad" };
  if (status === "unverified")
    return { word: w.t("lines.status.unverified"), tone: "ne" };
  if (status === "nothing-applied")
    return { word: w.t("lines.status.nothing-applied"), tone: "na" };
  // Three-valued: a judge ran on an undecided rule, none did, or the
  // withheld reports cannot say which. Since e1a44e0 the default pack gives
  // all of these the same plain word ("could not decide"); only the key
  // tells them apart.
  // A `no_claim` rule is undecided with no judge run on it (no claim, so no
  // report): it counts as unjudged.
  const judged = conversation.criteria
    .filter((c) => c.verdict === "not_evaluable" || c.verdict === "no_claim")
    .map((c) =>
      c.verdict === "no_claim"
        ? "no"
        : judgedOf(c.reportState, c.judgePinDigest),
    );
  if (judged.includes("yes"))
    return { word: w.t("lines.status.undecided.judged"), tone: "ne" };
  if (judged.length > 0 && judged.every((j) => j === "no"))
    return { word: w.t("lines.status.undecided.unjudged"), tone: "ne" };
  // No rule result at all for this conversation (no not_evaluable criterion
  // to point to a report state): the plain word set's own bare "could not
  // decide", never a report-specific claim this conversation's records
  // don't support.
  if (judged.length === 0)
    return { word: w.t("lines.status.undecided.none"), tone: "ne" };
  // "withheld" only when every report that would say is withheld; a report
  // in the bundle that cannot be read as sealed is never called withheld.
  return judged.every((j) => j === "withheld" || j === "no")
    ? { word: w.t("lines.status.undecided.withheld"), tone: "ne" }
    : { word: w.t("lines.status.undecided.unavailable"), tone: "ne" };
}

function criterionWord(c: DrawnCriterion, w: Words): Worded {
  // agent-action-capsule 0.8.0's `no_claim` (a missing claim the Result's
  // exclusions do not account for) is a gap that rolls up as not_evaluable,
  // so it takes not_evaluable's words. It carries no claim and so no report:
  // no judge ran on it, which is not_evaluable's unjudged word.
  return c.verdict === "no_claim"
    ? ruleWord("not_evaluable", "no", w)
    : ruleWord(c.verdict, judgedOf(c.reportState, c.judgePinDigest), w);
}

/** The plain note for a rule whose report carries no rationale: why there is none. */
function noNoteText(c: DrawnCriterion, w: Words): string {
  switch (c.reportState) {
    case "withheld":
    case "mismatch":
    case "unreadable":
    case "invalid":
      return w.t(`lines.no-note.${c.reportState}`);
    default:
      return w.t("lines.no-note.none");
  }
}

function names(
  model: OutcomeReportModel,
  list: readonly DrawnCriterion[],
  w: Words,
) {
  return list
    .map((c) => criterionLabel(model, c.checkId, c.criterionId, w).label)
    .join(", ");
}

/** A count in words up to twelve, in digits above. */
function countWord(n: number, w: Words): string {
  return Number.isInteger(n) && n >= 0 && n <= 12
    ? w.t(`lines.count.${n}`)
    : String(n);
}

/** The rules whose claim failed verification or whose evidence is missing, as one sentence: their verdict was never drawn. */
function unverifiedClause(
  model: OutcomeReportModel,
  list: readonly DrawnCriterion[],
  w: Words,
  lower = false,
): string {
  const failed = list.filter((c) => c.verdict === "failed");
  const unsupported = list.filter((c) => c.verdict === "unsupported");
  const parts: string[] = [];
  if (failed.length > 0)
    parts.push(
      w.t("lines.sentence.unverified.failed", {
        names: names(model, failed, w),
      }),
    );
  if (unsupported.length > 0)
    parts.push(
      w.t("lines.sentence.unverified.unsupported", {
        names: names(model, unsupported, w),
      }),
    );
  const text = `${parts.join(", and ")}, so the records do not say whether ${w.p("lines.word.that-rule-was", list.length)} met.`;
  return lower ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** One plain sentence: the conversation's result and the rules behind it. */
function resultSentence(
  conversation: Conversation,
  model: OutcomeReportModel,
  w: Words,
): string {
  const all = conversation.criteria;
  const applied = all.filter((c) => !notApplying(c.verdict));
  const outOfScope = all.filter((c) => c.verdict === "out_of_scope").length;
  const na = all.length - applied.length - outOfScope;
  const misses = all.filter((c) => isMiss(c.verdict));
  const unverified = all.filter((c) => isUnverified(c.verdict));
  // Undecided rules a judge could not decide, and gaps (`no_claim`): rules
  // the Result holds no claim for, which no judge ran on.
  const undecided = all.filter((c) => c.verdict === "not_evaluable");
  const gaps = all.filter((c) => c.verdict === "no_claim");
  const gapNote =
    gaps.length > 0
      ? w.t("lines.sentence.undecided.gap-note", {
          names: names(model, gaps, w),
        })
      : "";
  const naText = `${
    na > 0 ? ` ${w.t("lines.sentence.na", { n: String(na) })}` : ""
  }${
    outOfScope > 0
      ? ` ${w.t("lines.sentence.out-of-scope", { n: String(outOfScope) })}`
      : ""
  }`;
  const unverifiedText =
    unverified.length > 0 ? ` ${unverifiedClause(model, unverified, w)}` : "";
  switch (conversationStatus(conversation)) {
    case "resolved":
      return `${w.p("lines.sentence.resolved", applied.length, { n: String(applied.length) })}${naText}`;
    case "missed":
      return `${w.t("lines.sentence.missed", {
        misses: String(misses.length),
        applied: String(applied.length),
        rule: w.p("lines.word.rule", applied.length),
        was: w.p("lines.word.was", misses.length),
        names: names(model, misses, w),
      })}${unverifiedText}${naText}`;
    case "unverified":
      return `${w.t("lines.sentence.unverified", {
        clause: unverifiedClause(model, unverified, w, true),
        undecidedNote: `${
          undecided.length > 0
            ? w.t("lines.sentence.unverified.undecided-note", {
                names: names(model, undecided, w),
              })
            : ""
        }${gapNote}`,
      })}${naText}`;
    case "undecided":
      return undecided.length > 0
        ? `${w.t("lines.sentence.undecided", {
            names: names(model, undecided, w),
            thatRuleWas: w.p("lines.word.that-rule-was", undecided.length),
          })}${gapNote}${naText}`
        : gaps.length > 0
          ? `${w.t("lines.sentence.undecided.gaps", {
              names: names(model, gaps, w),
            })}${naText}`
          : w.t("lines.sentence.undecided.none");
    case "nothing-applied":
      return w.t("lines.sentence.nothing-applied");
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
  w: Words,
): HTMLElement {
  const status = conversationStatus(conversation);
  const item = el("article", "conv");
  item.dataset.conversation = conversation.conversationId;
  item.dataset.conversationVerdict = conversation.verdict;
  item.dataset.status = status;
  const head = el("div", "conv-h");
  const parts = caseParts(conversation.conversationId, w);
  head.append(el("span", "cid", parts.label));
  head.append(wordPill(statusWord(status, conversation, w), status));
  const misses = conversation.criteria.filter((c) => isMiss(c.verdict));
  const unverified = conversation.criteria.filter((c) =>
    isUnverified(c.verdict),
  );
  const undecided = conversation.criteria.filter(
    (c) => c.verdict === "not_evaluable" || c.verdict === "no_claim",
  );
  const outOfScope = conversation.criteria.filter(
    (c) => c.verdict === "out_of_scope",
  );
  head.append(
    el(
      "span",
      "cwhy",
      status === "missed"
        ? w.t("lines.why.missed", { names: names(model, misses, w) })
        : status === "unverified"
          ? w.t("lines.why.unverified", { names: names(model, unverified, w) })
          : status === "undecided"
            ? undecided.length === 0
              ? w.t("lines.why.undecided.none")
              : w.t("lines.why.undecided", {
                  names: names(model, undecided, w),
                })
            : status === "nothing-applied"
              ? w.t("lines.why.nothing-applied")
              : outOfScope.length === 0
                ? w.t("lines.why.resolved")
                : w.p(
                    "lines.why.resolved-out-of-scope",
                    conversation.criteria.length - outOfScope.length,
                    {
                      n: fmtCount(
                        conversation.criteria.length - outOfScope.length,
                      ),
                      oos: fmtCount(outOfScope.length),
                    },
                  ),
    ),
  );
  head.append(el("span", "cmodel", parts.model ?? ""));
  item.append(head);
  const body = el("div", "conv-slot");
  item.append(body);
  lazyBody(body, () => conversationBody(conversation, model, runInfo, w));
  return item;
}

function conversationBody(
  conversation: Conversation,
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
  w: Words,
): HTMLElement {
  const body = el("div", "conv-b");
  const sentence = el(
    "p",
    "verdict-line",
    resultSentence(conversation, model, w),
  );
  sentence.dataset.why = conversationStatus(conversation);
  body.append(sentence);

  // Rule by rule, in plain words
  body.append(el("h4", "", w.t("lines.h.rule-by-rule")));
  // The judge's notes and the rule wording are shown per rule only when the
  // bundle carries them; otherwise one line says so, not one per rule.
  const hasNotes = conversation.criteria.some((c) => c.rationale !== undefined);
  const wordings = conversation.criteria.map(
    (c) => criterionLabel(model, c.checkId, c.criterionId, w).source,
  );
  const anyWording = wordings.some((source) => source === "sealed");
  const table = el("table", "crit");
  table.dataset.criteriaTable = conversation.conversationId;
  const head = element("thead");
  const headRow = element("tr");
  headRow.append(
    element("th", w.t("lines.col.rule")),
    element("th", w.t("lines.col.result")),
  );
  if (hasNotes) headRow.append(element("th", w.t("lines.col.note")));
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
      w,
    );
    const nameCell = el("td", "cn");
    nameCell.append(el("b", "", label.label));
    const rowBadge = editedBadge(model, ref, w);
    if (rowBadge !== undefined) nameCell.append(rowBadge);
    if (label.source === "sealed") {
      const wording = tagSource(el("small", "", label.text), "producer");
      wording.dataset.wording = label.source;
      nameCell.append(wording);
    } else if (anyWording) {
      const wording = el("small", "wsrc", wordingFallback(label.source, w));
      wording.dataset.wording = label.source;
      nameCell.append(wording);
    }
    tr.append(nameCell);
    const verdictCell = element("td");
    verdictCell.append(
      wordPill(criterionWord(criterion, w), criterion.verdict),
    );
    tr.append(verdictCell);
    if (!hasNotes) {
      tbody.append(tr);
      continue;
    }
    const noteCell = el("td", "rat");
    if (criterion.verdict === "not_applicable")
      noteCell.append(el("span", "muted", w.t("lines.note.not-applicable")));
    else if (criterion.rationale !== undefined)
      noteCell.append(
        el(
          "span",
          "sealed",
          judgeNote(
            criterion.rationale,
            criterion.claim?.verdict ?? criterion.verdict,
            w,
          ),
        ),
      );
    else noteCell.append(el("span", "muted", noNoteText(criterion, w)));
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
      w.t(
        wordings.includes("mixed")
          ? "lines.gap.wording.mixed"
          : "lines.gap.wording.none",
      ),
    );
  if (!hasNotes)
    gaps.push(
      notesGap(
        conversation.criteria.flatMap((c) =>
          c.claim === undefined ? [] : [c.reportState],
        ),
        w,
      ),
    );
  if (gaps.length > 0) {
    const gap = el("p", "small", gaps.join(" "));
    gap.dataset.gaps = "true";
    body.append(gap);
  }

  // The conversation itself
  body.append(
    conversationFold(conversation.transcript, conversation.sourceCapsuleId, w),
  );

  // Toggle 2: the proofs
  body.append(
    levelToggle(
      2,
      w.t("card.proofs.toggle"),
      () => conversationProofs(conversation, model, runInfo, w),
      { className: "proofs" },
    ),
  );
  return body;
}

/** Why a conversation or session shows no judge's notes, from its reports' states. */
export function notesGap(
  states: readonly (string | undefined)[],
  w: Words,
): string {
  const set = new Set(states);
  return w.t(
    set.size === 1 && set.has("withheld")
      ? "card.gap.notes.withheld"
      : set.has("mismatch") || set.has("unreadable") || set.has("invalid")
        ? "card.gap.notes.unread"
        : set.has("withheld")
          ? "card.gap.notes.some-withheld"
          : "card.gap.notes.none",
  );
}

/** The proofs rows for a case's transcript, shared by both groupings. */
export function transcriptRows(
  t: Conversation["transcript"],
  w: Words,
): [string, string][] {
  if (t.state === "verified")
    return [
      [w.t("card.pf.transcript-record"), t.transcriptRecordId!],
      [
        w.t("card.pf.input-digest"),
        w.t("card.pf.input-digest.verified", { digest: t.inputDigest! }),
      ],
    ];
  if (t.state === "cited")
    return [
      [w.t("card.pf.transcript-record"), t.transcriptRecordId!],
      [
        w.t("card.pf.input-digest"),
        w.t("card.pf.input-digest.cited", { digest: t.inputDigest! }),
      ],
    ];
  return [
    [
      w.t("card.pf.transcript"),
      t.state === "absent"
        ? w.t("card.pf.transcript.absent")
        : w.t("card.pf.transcript.not-shown", {
            reason: t.reason ?? w.t("card.pf.transcript.default-reason"),
          }),
    ],
  ];
}

/** How a case is dated, in the proofs: the date as given, its zone, and the basis. */
export function datedText(dated: ConversationDate, w: Words): string {
  return w.t(
    dated.zone === "not-stated" ? "card.pf.dated.no-zone" : "card.pf.dated",
    { date: dated.stated ?? dated.date, basis: basisText(dated.basis, w) },
  );
}

function conversationProofs(
  conversation: Conversation,
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
  w: Words,
): HTMLElement {
  const box = el("div", "pf-b");
  box.dataset.proofsFor = conversation.conversationId;
  const rows: ([string, string] | [string, string, Record<string, string>])[] =
    [];
  rows.push([w.t("lines.pf.case"), conversation.conversationId]);
  rows.push([
    w.t("card.pf.case-record"),
    conversation.sourceCapsuleId === undefined
      ? w.t("card.pf.case-record.not-stated")
      : conversation.caseFrom === "claims"
        ? w.t("lines.pf.case-record.from-claims", {
            record: conversation.sourceCapsuleId,
          })
        : conversation.sourceCapsuleId,
  ]);
  const dated = conversation.dated;
  if (dated.basis !== "judged") {
    rows.push([
      w.t("lines.pf.dated-by"),
      datedText(dated, w),
      { dated: dated.basis },
    ]);
    if (dated.importedAt !== undefined)
      rows.push([w.t("card.pf.imported"), dated.importedAt]);
    rows.push([w.t("card.pf.judged-sealed"), conversation.judgedDay]);
  }
  rows.push([w.t("card.pf.result-capsule"), model.capsuleId]);
  rows.push(...transcriptRows(conversation.transcript, w));
  rows.push([
    w.t("lines.pf.judge-pin"),
    runInfo.judgePinDigest === undefined
      ? pinNotShown(runInfo, w)
      : runInfo.judgePinRecomputes === true && runInfo.judgePin !== undefined
        ? w.t("lines.pf.judge-pin.recomputed", {
            digest: runInfo.judgePinDigest,
            model: runInfo.judgePin.modelId,
            prompt: runInfo.judgePin.promptDigest,
            axes: runInfo.judgePin.axesDigest,
          })
        : runInfo.judgePinDigest,
  ]);
  const dl = proofList(rows);
  dl.dataset.checkIt = conversation.conversationId;
  box.append(dl);

  box.append(el("h5", "", w.t("lines.pf.h.each-report")));
  const table = el("table", "crit pft");
  const head = element("thead");
  const headRow = element("tr");
  headRow.append(
    element("th", w.t("lines.pf.col.rule")),
    element("th", w.t("lines.pf.col.verdict")),
    el("th", "n", w.t("lines.pf.col.p")),
    element("th", w.t("lines.pf.col.report")),
    element("th", w.t("lines.pf.col.rationale")),
    element("th", w.t("card.pf.assurance")),
  );
  head.append(headRow);
  table.append(head);
  const tbody = element("tbody");
  for (const criterion of conversation.criteria) {
    const tr = element("tr");
    tr.dataset.proofCrit = `${criterion.checkId}.${criterion.criterionId}`;
    // The sealed verdict as data, whatever the pack's word for it.
    tr.dataset.verdict = criterion.verdict;
    tr.append(
      element(
        "td",
        criterionLabel(model, criterion.checkId, criterion.criterionId, w)
          .label,
      ),
      element("td", verdictText(criterion.verdict, w)),
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
          ? w.t("lines.pf.no-claim")
          : `${criterion.reportCapsuleId ?? w.t("lines.pf.not-cited")}${criterion.reportRecordId === undefined ? "" : ` (${criterion.reportRecordId})`}`,
      ),
    );
    const rationale = el("td", "rat");
    if (criterion.rationale !== undefined) {
      const sealed = el("code", "sealed", criterion.rationale);
      sealed.dataset.rationale = "sealed";
      rationale.append(sealed);
    } else rationale.append(el("span", "muted", "–"));
    tr.append(rationale);
    // contract-report/v1 section 2: assurance stays on the claim.
    if (criterion.claim === undefined) tr.append(el("td", "muted", "–"));
    else {
      const [, text, data] = assuranceRow(criterion.claim, w);
      const cell = element("td", text);
      for (const [key, value] of Object.entries(data))
        cell.dataset[key] = value;
      tr.append(cell);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  const scroll = el("div", "tscroll");
  scroll.append(table);
  box.append(scroll);
  // "Derived from its probabilities" holds only when every sealed rationale
  // is the judge backend's own synthesized line; any other rationale is
  // shown as sealed, and `judgeNote` passes it through unchanged.
  const rationales = conversation.criteria
    .map((c) => c.rationale)
    .filter((r): r is string => r !== undefined);
  if (
    rationales.length > 0 &&
    rationales.every((r) => /^jev choice:/u.test(r))
  ) {
    const derived = el("p", "", w.t("lines.pf.derived"));
    derived.dataset.rationaleLabel = "derived";
    box.append(derived);
  } else if (rationales.length > 0) {
    const shown = el("p", "", w.t("lines.pf.sealed-rationale"));
    shown.dataset.rationaleLabel = "sealed";
    box.append(shown);
  }
  box.append(
    el(
      "p",
      "",
      w.t("lines.pf.recompute", {
        verdicts: w.p("lines.pf.verdicts", conversation.criteria.length, {
          n: countWord(conversation.criteria.length, w),
        }),
      }),
    ),
  );
  return box;
}

/**
 * The reasons a judge pin is not in the bundle, shared by both groupings:
 * withheld reports are not the same as an unstated pin, and a mismatched
 * report is neither. Empty when there is no such reason.
 */
export function pinAbsence(
  info: {
    readonly reportsMismatched?: number;
    readonly reportsUnreadable?: number;
    readonly reportsInvalid?: number;
    readonly reportsCited?: number;
    readonly reportsWithheld?: number;
  },
  w: Words,
): string | undefined {
  const unread =
    (info.reportsMismatched ?? 0) +
    (info.reportsUnreadable ?? 0) +
    (info.reportsInvalid ?? 0);
  const cited = fmtCount(info.reportsCited ?? 0);
  const parts: string[] = [];
  if (info.reportsWithheld !== undefined)
    parts.push(
      w.t("card.pin.withheld", {
        count: fmtCount(info.reportsWithheld),
        total: cited,
      }),
    );
  if (unread > 0)
    parts.push(
      w.t("card.pin.unread", { count: fmtCount(unread), total: cited }),
    );
  return parts.length === 0
    ? undefined
    : w.t("card.pin.not-in-bundle", { reasons: parts.join("; ") });
}

/** What a page says when no judge pin is drawn. */
function pinNotShown(runInfo: OutcomeReportRunInfo, w: Words): string {
  if (!runInfo.pinned) return w.t("lines.pin.differs");
  return pinAbsence(runInfo, w) ?? w.t("lines.pin.not-stated");
}

function renderConversationList(
  conversations: readonly Conversation[],
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
  key: string,
  w: Words,
): HTMLElement {
  const list = el("div", "convs");
  list.dataset.conversationsFor = key;
  list.dataset.conversationCount = String(conversations.length);
  if (conversations.length === 0)
    list.append(el("p", "small", w.t("lines.list.empty")));
  for (const conversation of conversations)
    list.append(renderConversation(conversation, model, runInfo, w));
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
  w: Words,
): HTMLDetailsElement {
  return drill(
    label,
    () => renderConversationList(conversations, model, runInfo, key, w),
    key,
  );
}

/** A criterion's label for a missed-reason group, from the terms; the id itself when the terms don't name it. */
function missedReasonLabel(
  terms: OutcomeReportModel["terms"],
  checkId: string,
  criterionId: string,
  w?: Words,
): string {
  const check = terms.checks.find((c) => c.id === checkId);
  const criterion = check?.criteria.find((c) => c.id === criterionId);
  return check === undefined || criterion === undefined
    ? `${checkId}.${criterionId}`
    : `${w?.row(`${checkId}.${criterionId}`, "label") ?? criterion.label} (${w === undefined ? check.question : groupTitle(check, w)})`;
}

/** A rule group's heading: the pack's `group.<check>.title` when it sets one (contract-report/v1 section 3), else the contract's question. */
function groupTitle(
  check: OutcomeReportModel["terms"]["checks"][number],
  w: Words,
): string {
  return w.group(check.id) ?? check.question;
}

/**
 * Group missed conversations by THIS view's own reason: the first criterion
 * where `isMiss` is true -- never AAC's `missedReasonGroups`, whose notion of
 * "missed" still includes `failed`/`unsupported` (0.5.0's `missedReasonGroups`
 * picks the first not_met/failed/unsupported criterion in criteria order, so
 * a conversation with [c1 failed, c2 not_met] files under c1, though this
 * view counts it missed only for c2's sake -- see `isMiss`, `isUnverified`).
 * A reason is the producer's sealed reason code when the terms give it a
 * label (`terms.reasonCodes`), else the first rule not met; a raw code is
 * never shown.
 */
export function groupMissedReasons(
  missed: readonly Conversation[],
  terms: OutcomeReportModel["terms"],
  w?: Words,
): readonly MissedReasonGroup[] {
  const labelledReasonCode = (code: string | undefined): string | undefined =>
    code === undefined ? undefined : terms.reasonCodes[code];
  const groups = new Map<string, Conversation[]>();
  const structured = new Map<string, boolean>();
  const labels = new Map<string, string>();
  for (const conversation of missed) {
    const first = conversation.criteria.find((c) => isMiss(c.verdict));
    if (first === undefined) continue;
    const label = labelledReasonCode(first.reasonCode);
    const key =
      label !== undefined
        ? first.reasonCode!
        : `${first.checkId}.${first.criterionId}`;
    const list = groups.get(key) ?? [];
    list.push(conversation);
    groups.set(key, list);
    structured.set(key, label !== undefined);
    labels.set(
      key,
      label ?? missedReasonLabel(terms, first.checkId, first.criterionId, w),
    );
  }
  return [...groups.entries()]
    .map(([key, conversations]) => ({
      key,
      label: labels.get(key)!,
      structured: structured.get(key)!,
      conversations,
    }))
    .sort((a, b) => b.conversations.length - a.conversations.length);
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
  w: Words,
): HTMLElement {
  const box = el("div", "why-missed");
  box.dataset.section = "why-missed";
  const groups = groupMissedReasons(missed, model.terms, w);
  box.dataset.reasons = String(groups.length);
  box.append(el("h5", "", w.t("lines.why-missed.h")));
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
      w.t(
        anyStructured
          ? "lines.why-missed.structured"
          : "lines.why-missed.unstructured",
      ),
    ),
  );
  for (const group of groups) {
    const head = el(
      "div",
      "rsn-h",
      w.t("lines.why-missed.reason", {
        reason: group.label,
        count: fmtCount(group.conversations.length),
      }),
    );
    head.dataset.reasonFor = group.key;
    box.append(head);
    box.append(
      renderConversationList(
        group.conversations,
        model,
        runInfo,
        `reason:${group.key}`,
        w,
      ),
    );
  }
  return box;
}

// ---------------------------------------------------------------------------
// The sheet: header meta, report lines, stamp, tamper note
// ---------------------------------------------------------------------------

/** The pack and version as one line: both come from the claims' `contract_ref` (see `readOutcomeReportTerms`), or read "not stated". */
function packLine(model: OutcomeReportModel, w: Words): string {
  const { id, version } = model.terms.pack;
  return id === NOT_STATED
    ? w.t("card.not-stated")
    : w.t("lines.pack-line", { id, version });
}

// ---------------------------------------------------------------------------
// Dating: which date the calendar and period count a conversation under, and
// the plain label that says so (see `ConversationDate`)
// ---------------------------------------------------------------------------

export function span(days: readonly string[], w: Words): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined)
    return w.t("card.span.unknown");
  return first === last ? first : w.t("card.span", { from: first, to: last });
}

/** What a case's date is, in words. */
export const basisText = (basis: ConversationDate["basis"], w: Words): string =>
  w.t(`card.basis.${basis}`);

/** The page's one plain statement of what its dates are, or undefined when every conversation is dated by the day it was judged (the card's behaviour before record dating). */
function datingNote(model: OutcomeReportModel, w: Words): string | undefined {
  return datingStatement(model.dating, model.totalCount, w);
}

/** `datingNote` over any card's dating (both groupings share it), `total` being the conversations it counts. */
export function datingStatement(
  dating: OutcomeReportModel["dating"],
  total: number,
  w: Words,
): string | undefined {
  const { basis, counts, judgedDays, zoneNotStated } = dating;
  if (basis === "judged") return undefined;
  const sealed = w.t("card.dating.sealed", { span: span(judgedDays, w) });
  const parts: string[] = [];
  if (basis === "source") parts.push(w.t("card.dating.source"));
  else if (basis === "record") parts.push(w.t("card.dating.record"));
  else {
    parts.push(w.t("card.dating.mixed"));
    if (counts.source > 0)
      parts.push(w.t("card.dating.mixed.source", { n: String(counts.source) }));
    if (counts.record > 0)
      parts.push(w.t("card.dating.mixed.record", { n: String(counts.record) }));
    if (counts.judged > 0)
      parts.push(w.t("card.dating.mixed.judged", { n: String(counts.judged) }));
  }
  parts.push(sealed);
  if (counts.source > 0) parts.push(w.t("card.dating.self-attested"));
  if (zoneNotStated > 0)
    parts.push(
      w.t("card.dating.tz", {
        count: String(zoneNotStated),
        total: String(total),
      }),
    );
  return parts.join(" ");
}

function renderMeta(
  host: HTMLElement,
  model: OutcomeReportModel,
  w: Words,
  notes: HTMLElement,
): void {
  const section = el("section", "");
  section.dataset.section = "meta";

  const row1 = el("div", "ih-row");
  const bill = el("div", "party");
  bill.append(el("div", "k", w.t("lines.meta.pack")));
  bill.append(el("div", "v", packLine(model, w)));
  row1.append(bill);
  const title = el("div", "ih-title");
  title.append(el("h1", "inv-title", w.t("lines.title")));
  const summary = reportSummary(w);
  if (summary !== undefined) title.append(summary);
  // No Evidence Contract field states when the terms were locked; the line
  // is drawn only when one does, never as a standing "not stated".
  if (model.terms.pack.locked !== NOT_STATED)
    title.append(
      el(
        "div",
        "inv-sub",
        w.t("lines.meta.locked", { locked: model.terms.pack.locked }),
      ),
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
    w.t("lines.meta.period"),
    first === undefined || last === undefined
      ? w.t("lines.meta.no-conversations")
      : first === last
        ? first
        : w.t("card.span", { from: first, to: last }),
  );
  const note = datingNote(model, w);
  if (note !== undefined) {
    metaRow(w.t("lines.meta.sealed"), span(model.dating.judgedDays, w));
    details.lastElementChild!.setAttribute("data-sealed", "");
  }
  metaRow(w.t("lines.meta.conversations"), fmtCount(model.totalCount));
  const checked = el("div", "party");
  const rules = model.terms.checks.reduce((n, c) => n + c.criteria.length, 0);
  checked.append(el("div", "k", w.t("lines.meta.what-checked")));
  const groups = model.terms.checks.length;
  const what = el(
    "div",
    "d",
    w.t("lines.meta.what-checked.text", {
      rules: w.p("lines.meta.rules", rules, { n: String(rules) }),
      groups: w.p("lines.meta.groups", groups, { n: String(groups) }),
      questions: model.terms.checks.map((c) => groupTitle(c, w)).join(" · "),
    }),
  );
  what.dataset.whatChecked = String(rules);
  checked.append(what);
  row2.append(checked, details);
  section.append(row2);
  if (note !== undefined) {
    const label = el("p", "date-note", note);
    label.dataset.dateNote = model.dating.basis;
    notes.append(label);
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
  w: Words,
  notes: HTMLElement,
): void {
  const section = el("section", "");
  section.dataset.section = "lines";
  const table = document.createElement("table");
  table.className = "lines";
  table.dataset.rows = "report-lines";
  const headline = el("p", "headline");
  headline.dataset.headline = "lines";
  section.append(headline);
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(
    element("th", w.t("lines.col.result")),
    el("th", "n", w.t("lines.lines.col.conversations")),
  );
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement("tbody");
  const byStatus = (status: ConversationStatus) =>
    model.conversations.filter((c) => conversationStatus(c) === status);
  const resolved = byStatus("resolved");
  const missed = byStatus("missed");
  const unverified = byStatus("unverified");
  const undecided = [...byStatus("undecided"), ...byStatus("nothing-applied")];
  const share = (n: number) =>
    fmtShare(n, model.totalCount, model.options.percentages, w);
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
  const line = (
    key: string,
    count: number,
    shown: string,
    behind?: readonly Conversation[],
  ): Line => ({
    key,
    label: w.t(`lines.line.${key}`),
    help: w.t(`lines.line.${key}.help`),
    count,
    shown,
    ...(behind === undefined ? {} : { behind }),
  });
  // The same counts as the table below, as the Terms Pack canvas opens with
  // them: whole numbers, never a share. The first carries the total the rest
  // are of. A conversation no rule applied to is not "could not be decided":
  // the judge had nothing to decide, and the table says so in its own words.
  const headlineParts = [
    w.p("lines.headline", model.totalCount, {
      resolved: fmtCount(resolved.length),
      n: fmtCount(model.totalCount),
    }),
    w.t("lines.headline.missed", { n: fmtCount(missed.length) }),
  ];
  const judgedUndecided = byStatus("undecided");
  const nothingApplied = byStatus("nothing-applied");
  if (unverified.length > 0)
    headlineParts.push(
      w.t("lines.headline.unverified", { n: fmtCount(unverified.length) }),
    );
  if (judgedUndecided.length > 0)
    headlineParts.push(
      w.t("lines.headline.undecided", {
        n: fmtCount(judgedUndecided.length),
      }),
    );
  if (nothingApplied.length > 0)
    headlineParts.push(
      w.t("lines.headline.nothing-applied", {
        n: fmtCount(nothingApplied.length),
      }),
    );
  // No conversation, no sentence: "0 of 0 resolved" says nothing true.
  headline.textContent = model.totalCount === 0 ? "" : headlineParts.join(" ");
  headline.hidden = model.totalCount === 0;
  const lines: Line[] = [
    line("resolved", resolved.length, share(resolved.length), resolved),
    line("missed", missed.length, share(missed.length), missed),
  ];
  if (unverified.length > 0)
    lines.push(
      line(
        "unverified",
        unverified.length,
        share(unverified.length),
        unverified,
      ),
    );
  if (undecided.length > 0)
    lines.push(
      line("undecided", undecided.length, share(undecided.length), undecided),
    );
  // A person's re-grades are lines only when this bundle has one; their
  // absence is said where the re-grade records are (renderHumanChecks).
  if (model.heldCount > 0)
    lines.push(line("held", model.heldCount, fmtCount(model.heldCount)));
  if (model.addedCount > 0)
    lines.push(line("added", model.addedCount, fmtCount(model.addedCount)));
  for (const line of lines) {
    const tr = document.createElement("tr");
    tr.dataset.line = line.key;
    tr.dataset.count = String(line.count);
    const desc = el("td", "desc");
    desc.append(el("b", "", line.label));
    desc.append(el("small", "", line.help));
    if (line.behind !== undefined && line.behind.length > 0) {
      const label = w.p("lines.drill.show", line.behind.length, {
        n: fmtCount(line.behind.length),
      });
      const behind = line.behind;
      desc.append(
        line.key === "missed"
          ? drill(label, () => whyMissed(behind, model, runInfo, w), line.key)
          : conversationsDrill(label, behind, model, runInfo, line.key, w),
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
    w.p("lines.na-note", model.notApplicableCount, {
      n: fmtCount(model.notApplicableCount),
    }),
  );
  na.dataset.line = "not-applicable";
  na.dataset.count = String(model.notApplicableCount);
  notes.append(na);
  // Result v0 section 4.2: out of scope is counted on its own, never as not
  // applicable and never as met; said only when a bundle has one.
  if (model.outOfScopeCount > 0) {
    const oos = el(
      "p",
      "na-note",
      w.p("lines.oos-note", model.outOfScopeCount, {
        n: fmtCount(model.outOfScopeCount),
      }),
    );
    oos.dataset.line = "out-of-scope";
    oos.dataset.count = String(model.outOfScopeCount);
    notes.append(oos);
  }
  host.append(section);
}

// ---------------------------------------------------------------------------
// Summary: results rule by rule
// ---------------------------------------------------------------------------

function renderRules(
  host: HTMLElement,
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
  result: ResultRoot,
  w: Words,
): void {
  const section = el("section", "sec");
  section.dataset.section = "rules";
  section.append(el("h2", "", w.t("lines.rules.h")));
  section.append(el("p", "lede", w.t("lines.rules.lede")));
  const table = el("table", "rules");
  table.dataset.rows = "rules";
  const thead = element("thead");
  const headRow = element("tr");
  // Not met leads; "did not apply" is in each row's expansion, and "could
  // not decide" stays on the row as its own count (Result v0 section 3).
  const columnWord = {
    not_met: ruleWord("not_met", "yes", w).word,
    met: ruleWord("met", "yes", w).word,
    undecided: w.t("lines.rules.col.undecided"),
    unverified: w.t("lines.rules.col.unverified"),
    out_of_scope: ruleWord("out_of_scope", "yes", w).word,
  };
  headRow.append(
    element("th", w.t("lines.col.rule")),
    el("th", "n", columnWord.not_met),
    el("th", "n", columnWord.met),
    el("th", "n", columnWord.undecided),
  );
  // A claim that failed verification or whose evidence is missing has its
  // own column, never folded into "not met"; drawn only when a bundle has
  // one.
  const anyUnverified = model.conversations.some((c) =>
    c.criteria.some((cr) => isUnverified(cr.verdict)),
  );
  if (anyUnverified) headRow.append(el("th", "n", columnWord.unverified));
  // Judged out of scope (Result v0 section 4.2) is its own column, never
  // folded into "did not apply" or "met"; drawn only when a bundle has one.
  const anyOutOfScope = model.outOfScopeCount > 0;
  if (anyOutOfScope) headRow.append(el("th", "n", columnWord.out_of_scope));
  const columns = String(4 + (anyUnverified ? 1 : 0) + (anyOutOfScope ? 1 : 0));
  thead.append(headRow);
  table.append(thead);
  const tbody = element("tbody");
  for (const check of model.terms.checks) {
    const group = el("tr", "grp");
    group.dataset.checkId = check.id;
    group.dataset.passCount = String(model.checkPassCounts.get(check.id) ?? 0);
    const cell = el("td", "", groupTitle(check, w));
    cell.setAttribute("colspan", columns);
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
      // Each count column's verdicts, read once: a cell's number and the
      // claims its Show-evidence action lists come from the same pick.
      const picks: Record<
        keyof typeof columnWord,
        (v: DrawnVerdict) => boolean
      > = {
        not_met: isMiss,
        met: (v) => v === "met",
        undecided: (v) => v === "not_evaluable" || v === "no_claim",
        unverified: isUnverified,
        out_of_scope: (v) => v === "out_of_scope",
      };
      const met = of(picks.met);
      const notMet = of(picks.not_met);
      const unverifiedHere = of(picks.unverified);
      const na = of((v) => v === "not_applicable");
      const outOfScopeHere = of(picks.out_of_scope);
      const undecided = of(picks.undecided);
      // One count cell: the number, and its Show-evidence action (or the
      // label that stands in for one) over the claims behind it on this rule.
      const countCell = (
        className: string,
        column: keyof typeof columnWord,
        counted: readonly Conversation[],
      ): HTMLElement => {
        const pick = picks[column];
        const cell = el("td", className);
        cell.dataset.column = column;
        cell.append(el("span", "nv", fmtCount(counted.length)));
        const action = evidenceAction(
          `rule:${ref}:${column}`,
          `${label.label} · ${columnWord[column]}: ${fmtCount(counted.length)}`,
          counted.map(
            (c) =>
              c.criteria.find(
                (cr) =>
                  cr.checkId === check.id &&
                  cr.criterionId === criterion.id &&
                  pick(cr.verdict),
              )?.claim,
          ),
          result,
          w,
        );
        if (action !== undefined) cell.append(action);
        return cell;
      };
      const tr = el("tr", "rule");
      tr.dataset.rule = ref;
      tr.dataset.tier = model.criterionTiers.get(ref) ?? "unknown";
      const label = criterionLabel(model, check.id, criterion.id, w);
      const nameCell = el("td", "cn");
      const ruleName = el("b", "", label.label);
      nameCell.append(ruleName);
      const badge = editedBadge(model, ref, w);
      if (badge !== undefined) nameCell.append(badge);
      if (label.source === "sealed")
        nameCell.append(el("small", "", label.text));
      // contract-report/v1 section 3: the pack's explanation of the rule,
      // and its note for a rule whose claims could not be decided.
      const detail = w.row(ref, "detail");
      if (detail !== undefined) {
        const line = el("small", "rdet", detail);
        line.dataset.wording = "pack";
        nameCell.append(line);
      }
      const undecidedNote = w.row(ref, "not_evaluable");
      if (undecidedNote !== undefined && undecided.length > 0) {
        const line = el("small", "rdet", undecidedNote);
        line.dataset.wording = "pack";
        line.dataset.note = "not-evaluable";
        nameCell.append(line);
      }
      const problems = [
        ...notMet,
        ...unverifiedHere.filter((c) => !notMet.includes(c)),
        ...undecided.filter(
          (c) => !notMet.includes(c) && !unverifiedHere.includes(c),
        ),
      ];
      tr.append(
        nameCell,
        countCell(`n${notMet.length > 0 ? " bad" : ""}`, "not_met", notMet),
        countCell("n ok", "met", met),
        countCell("n", "undecided", undecided),
      );
      if (anyUnverified)
        tr.append(countCell("n", "unverified", unverifiedHere));
      if (anyOutOfScope)
        tr.append(countCell("n", "out_of_scope", outOfScopeHere));
      tbody.append(tr);
      // The row opens: a full-width row below it holds how many
      // conversations the rule did not apply to and the conversations
      // behind its problems, each read at the table's width. A rule with
      // neither has nothing to open.
      if (problems.length === 0 && na.length === 0) continue;
      const drillRow = el("tr", "drill-row");
      drillRow.dataset.drillFor = ref;
      const cell = element("td");
      cell.setAttribute("colspan", columns);
      drillRow.append(cell);
      // The not-applicable count is drawn now, so a static page (which runs
      // no script to build a body) still shows it when the row opens.
      if (na.length > 0) {
        const naLine = el(
          "p",
          "rule-na",
          w.p("lines.rules.expand.na", na.length, {
            n: fmtCount(na.length),
          }),
        );
        naLine.dataset.count = String(na.length);
        cell.append(naLine);
      }
      const toggle = expandableRow(
        tr,
        ruleName,
        drillRow,
        () =>
          problems.length > 0
            ? renderConversationList(problems, model, runInfo, `rule:${ref}`, w)
            : document.createDocumentFragment(),
        `rule-${ref}`,
      );
      toggle.dataset.drill = `rule:${ref}`;
      tbody.append(drillRow);
    }
  }
  // Requirements of the cited contract the run did not cover (Result v0
  // section 3, `requirements_covered`): one row each, "not covered", under a group
  // of their own. They are in no conversation, count or column above: the
  // run never judged them, so no number on this page speaks for them.
  if (model.notRun.length > 0) {
    const group = el("tr", "grp");
    group.dataset.group = "not-run";
    const heading = el("td", "", w.t("lines.rules.not-run.h"));
    heading.setAttribute("colspan", columns);
    group.append(heading);
    tbody.append(group);
    for (const ref of model.notRun) {
      const [checkId = "", ...rest] = ref.split(".");
      const label = criterionLabel(model, checkId, rest.join("."), w);
      const tr = el("tr", "rule not-run");
      tr.dataset.rule = ref;
      tr.dataset.notRun = "true";
      const nameCell = el("td", "cn");
      nameCell.append(el("b", "", label.label));
      const status = el("td", "nr", w.t("lines.rules.not-run"));
      status.setAttribute("colspan", String(Number(columns) - 1));
      tr.append(nameCell, status);
      tbody.append(tr);
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

function renderCalendar(
  host: HTMLElement,
  model: OutcomeReportModel,
  w: Words,
): void {
  const section = el("section", "sec");
  section.dataset.section = "calendar";
  section.append(el("h2", "", w.t("lines.cal.h")));
  const note = datingNote(model, w);
  section.append(
    el(
      "p",
      "lede",
      w.t(note === undefined ? "lines.cal.lede" : "lines.cal.lede.dated"),
    ),
  );
  // The dating note itself is said once, in the sheet's footnotes.
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
        const chip = el("div", "src-says", w.t("lines.cal.source-says"));
        chip.dataset.sourceSays = String(
          day.conversations.filter((c) => c.dated.basis === "source").length,
        );
        item.append(chip);
      }
      const notStated = day.conversations.filter(
        (c) => c.dated.zone === "not-stated",
      ).length;
      if (notStated > 0) {
        const tz = el("div", "tz", w.t("lines.cal.tz"));
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
          w,
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
      const sealed = el(
        "div",
        "sealed",
        w.t("lines.cal.sealed", { span: span(day.judgedDays, w) }),
      );
      sealed.dataset.sealed = day.judgedDays.join(" ");
      item.append(sealed);
    }
    if (day.policyChanged !== null) {
      const flag = el("div", "flag", w.t("lines.cal.policy-changed"));
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
  w: Words,
): void {
  const section = el("section", "sec");
  section.dataset.section = "human-checks";
  section.append(el("h2", "", w.t("lines.hc.h")));
  section.append(el("p", "lede", w.t("lines.hc.lede")));
  if (calibration.length === 0) {
    section.append(el("p", "", w.t("lines.hc.none")));
    host.append(section);
    return;
  }
  const table = document.createElement("table");
  table.className = "hct";
  table.dataset.weeks = String(calibration.length);
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(
    element("th", w.t("lines.hc.col.week")),
    el("th", "n", w.t("lines.hc.col.agreed")),
    el("th", "n", w.t("lines.hc.col.held")),
    el("th", "n", w.t("lines.hc.col.added")),
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
    tr.append(
      el(
        "td",
        "n",
        w.t("lines.hc.agreed", { k: String(week.k), n: String(week.n) }),
      ),
    );
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

function renderTerms(
  host: HTMLElement,
  model: OutcomeReportModel,
  w: Words,
): void {
  const section = el("div", "rp-s");
  section.dataset.section = "terms";
  section.append(el("h3", "", w.t("lines.terms.h")));
  const lede = el(
    "p",
    "lede",
    model.terms.pack.agreement === NOT_STATED
      ? w.t("lines.terms.lede")
      : w.t("lines.terms.lede.agreed", {
          agreement: model.terms.pack.agreement,
        }),
  );
  lede.dataset.termsSource = "bundle";
  section.append(lede);

  const pack = el("div", "pack");
  const packField = (label: string, value: string): void => {
    const box = el("div", "pk");
    box.append(el("div", "k", label), el("div", "v", value));
    pack.append(box);
  };
  packField(w.t("lines.meta.pack"), model.terms.pack.id);
  packField(
    w.t("lines.terms.version"),
    model.terms.pack.version === NOT_STATED
      ? w.t("card.not-stated")
      : w.t("lines.terms.version.value", {
          version: model.terms.pack.version,
        }),
  );
  if (model.terms.pack.locked !== NOT_STATED)
    packField(w.t("lines.terms.locked"), model.terms.pack.locked);
  section.append(pack);

  const outcome = el("div", "outcome");
  const outcomeIcon = el("div", "oic");
  const target = icon("target");
  if (target !== undefined) outcomeIcon.append(target);
  outcome.append(outcomeIcon);
  const outcomeBody = element("div");
  outcomeBody.append(el("div", "t", w.t("lines.terms.outcome")));
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
    card.append(el("div", "q", groupTitle(check, w)));
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
      const label = el("b", "", w.row(ref, "label") ?? criterion.label);
      const termsBadge = editedBadge(model, ref, w);
      if (termsBadge !== undefined) label.append(termsBadge);
      item.append(label);
      item.append(
        element(
          "span",
          w.t("lines.terms.criterion", {
            text: wording.text,
            tier: tierLabel(tier, w),
          }),
        ),
      );
      if (wording.source !== "sealed")
        item.append(el("small", "wsrc", wordingFallback(wording.source, w)));
      criteria.append(item);
    }
    card.append(criteria);
    checks.append(card);
  }
  section.append(checks);
  const note = el("p", "small", wordingNote(model, w));
  note.dataset.wordingNote = "true";
  section.append(note);
  section.append(el("div", "rule", model.terms.pack.resolutionRule));
  host.append(section);
}

// ---------------------------------------------------------------------------
// What ran
// ---------------------------------------------------------------------------

function renderWhatRan(
  host: HTMLElement,
  runInfo: OutcomeReportRunInfo,
  w: Words,
): void {
  const section = el("div", "rp-s");
  section.dataset.section = "what-ran";
  section.append(el("h3", "", w.t("lines.ran.h")));
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
  const notStated = w.t("card.not-stated");
  box(w.t("lines.ran.contract"), runInfo.contract ?? notStated, "contract");
  box(
    w.t("lines.ran.judge-model"),
    pin === undefined
      ? notStated
      : pin.modelVersion === undefined
        ? pin.modelId
        : `${pin.modelId} ${pin.modelVersion}`,
    "judge-model",
  );
  box(
    w.t("lines.ran.judge-pin"),
    runInfo.judgePinDigest === undefined
      ? pinNotShown(runInfo, w)
      : pin === undefined
        ? runInfo.judgePinDigest
        : w.t("lines.ran.judge-pin.recomputed", {
            digest: runInfo.judgePinDigest,
          }),
    "judge-pin-digest",
  );
  box(
    w.t("lines.ran.judge-prompt"),
    pin?.promptDigest ?? notStated,
    "judge-prompt-digest",
  );
  box(
    w.t("lines.ran.judge-axes"),
    pin?.axesDigest ?? notStated,
    "judge-axes-digest",
  );
  box(w.t("lines.ran.agent"), w.t("lines.ran.agent.value"), "agent");
  section.append(ran);
  if (runInfo.judgePinRecomputes === false) {
    const warning = el("p", "", w.t("lines.ran.components-mismatch"));
    warning.dataset.pinComponentsMismatch = "true";
    section.append(warning);
  }
  const lock = el("div", "lock", w.t("lines.ran.lock"));
  section.append(lock);
  if (!runInfo.pinned) {
    const warning = el("p", "", w.t("lines.ran.pin-mismatch"));
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
  w: Words,
): void {
  const section = el("div", "rp-s");
  section.dataset.section = "verification-details";
  section.append(el("h3", "", w.t("card.vd.h")));
  section.append(el("p", "lede", w.t("lines.vd.lede")));
  const model = buildVerificationPageModel(bundle, verified);
  const tech = el("div", "tech");
  const field = (label: string, value: string): void => {
    tech.append(el("div", "k", label), el("div", "v", value));
  };
  for (const [label, value] of verificationRows(model, w)) field(label, value);
  section.append(tech);
  const note = el("p", "note", w.t("lines.vd.note"));
  note.dataset.checkpointKind = "mmr";
  section.append(note);
  host.append(section);
}

// ---------------------------------------------------------------------------
// Proofs for the whole report: one toggle at the foot of the page
// ---------------------------------------------------------------------------

/** The bundle's digest and checkpoint, for the report proofs of either grouping. */
export function verificationRows(
  model: ReturnType<typeof buildVerificationPageModel>,
  w: Words,
): [string, string][] {
  return [
    [
      w.t("card.vd.bundle-digest"),
      model.bundleDigest ?? w.t("card.vd.uncomputable"),
    ],
    [
      w.t("card.vd.checkpoint-root"),
      model.checkpointRoot ?? w.t("card.vd.absent"),
    ],
    [
      w.t("card.vd.checkpoint-size"),
      model.checkpointSize === undefined
        ? w.t("card.vd.absent")
        : String(model.checkpointSize),
    ],
  ];
}

/**
 * Which wording pack drew this card, in its report proofs: every layer
 * applied, by digest, not only the final one -- the base layer's digest is
 * named even on a default-only page (contract-report/v1 §3 records every
 * layer applied).
 */
export function wordingRow(w: Words): [string, string] {
  const refused = w.source.refused;
  return [
    w.t("card.pf.wording"),
    refused !== undefined
      ? w.t("card.pf.wording.refused", {
          sha256: refused.sha256,
          reason: w.t(`card.wording.refused.${refused.reason}`),
          baseId: w.source.base?.id ?? w.source.id,
          baseSha256: w.source.base?.sha256 ?? w.source.sha256 ?? "",
        })
      : w.source.base === undefined
        ? w.t("card.pf.wording.default", {
            id: w.source.id,
            sha256: w.source.sha256 ?? "",
          })
        : w.t("card.pf.wording.supplied.layered", {
            id: w.source.id,
            sha256: w.source.sha256 ?? "",
            baseId: w.source.base.id,
            baseSha256: w.source.base.sha256,
          }),
  ];
}

function renderReportProofs(
  host: HTMLElement,
  model: OutcomeReportModel,
  runInfo: OutcomeReportRunInfo,
  bundle: unknown,
  verified: BundleVerificationResult,
  w: Words,
): void {
  const section = el("section", "sec rp");
  section.dataset.section = "report-proofs";
  // Built on first open, like every other toggle.
  const toggle = levelToggle(
    2,
    w.t("lines.rp.toggle"),
    () => {
      const box = el("div", "pf-b");
      const ids = proofList([
        [w.t("card.pf.result-capsule"), model.capsuleId],
        [w.t("lines.meta.pack"), packLine(model, w)],
        wordingRow(w),
      ]);
      ids.dataset.reportIds = "true";
      box.append(ids);
      renderTerms(box, model, w);
      renderWhatRan(box, runInfo, w);
      renderVerificationDetails(box, bundle, verified, w);
      const tamper = el("p", "tamper-note", w.t("lines.rp.tamper"));
      tamper.dataset.tamperNote = "verify-first";
      box.append(tamper);
      return box;
    },
    { className: "proofs" },
  );
  section.append(toggle);
  host.append(section);
}

/** The `lines` grouping's page wrapper: its element, class, page name and stylesheet. */
export const LINES_FRAME = {
  tag: "section",
  className: "oi",
  page: "outcome-report",
  css: OUTCOME_REPORT_CSS,
} as const;

/**
 * Draw the `lines` grouping into `wrapper` (contract-report.ts made it and
 * put its stylesheet in it). Every word is `w`'s.
 */
export async function drawLines(
  levels: {
    readonly L0: HTMLElement;
    readonly L1: HTMLElement;
    readonly L2: HTMLElement;
  },
  result: ResultRoot,
  options: OutcomeReportOptions,
  bundle: unknown,
  verified: BundleVerificationResult,
  w: Words,
): Promise<void> {
  const model = buildOutcomeReportModel(result, options);
  const runInfo = await verifyJudgePin(model.runInfo);
  const claims = model.conversations.flatMap((c) =>
    c.criteria.flatMap((cr) => (cr.claim === undefined ? [] : [cr.claim])),
  );

  // L0, what matters, after the core's strip (the mock-judge mark and the
  // sealed aggregate, core-strip.ts): the header, then the per-conversation
  // lines, each opening its list.
  levels.L0.append(renderLegend(w));
  const sheet = el("div", "sheet");
  const pad = el("div", "pad");
  // Notes that explain a figure sit under the sheet, in small type, never
  // between the reader and the figures.
  const notes = el("aside", "footnotes");
  notes.dataset.section = "footnotes";
  renderMeta(pad, model, w, notes);
  renderLines(pad, model, runInfo, w, notes);
  if (notes.childElementCount > 0) pad.append(notes);
  sheet.append(pad);
  levels.L0.append(sheet);

  // L1, why: rule by rule, led by who judged, who witnessed, what verified.
  renderRules(levels.L1, model, runInfo, result, w);
  leadWithProvenance(
    levels.L1,
    levels.L1.querySelector('[data-section="rules"]'),
    renderProvenance(
      await provenanceLines(result.records, claims, bundle, verified, w),
    ),
  );

  // L2, module detail after the core's verification section.
  levels.L2.append(renderCheckYourself(bundle, w));
  renderCalendar(levels.L2, model, w);
  renderHumanChecks(levels.L2, model.calibration, w);
  renderProducerNote(levels.L2, model, w);
  renderReportProofs(levels.L2, model, runInfo, bundle, verified, w);
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
