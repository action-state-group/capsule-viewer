// SPDX-License-Identifier: BSD-3-Clause
import {
  parseJudgeProbabilities,
  type ConversationTranscript,
  type ReportState,
} from "@action-state-group/agent-action-capsule";
import type { Words } from "./contract-report-wording.js";
import { fieldText, tagSource } from "./report-legend.js";
import {
  judgeNote,
  levelToggle,
  recordAddress,
  renderChat,
  wordPill,
  type Worded,
} from "./report-levels.js";

/**
 * Spot check, side by side (Terms Pack canvas: Outcomes frame 3, EU AI Act
 * frame 10). One card per conversation, always three columns, read-only; the
 * conversation is drawn once, in the first column, and each rule that has a
 * claim is one row of the other two:
 *
 *   what happened     the conversation, who said what and each tool call
 *   the criterion     the rule as the judge was given it (the sealed
 *                     `clause_claim`)
 *   the verdict, why  the verdict, the judge's words, the judge pin and
 *                     confidence
 *
 * Drawn only from what the verified bundle carries. Three things the canvas
 * shows are not in what the bundle's Result reader returns -- who produced
 * each turn, the "met when / not evaluable when" lines, and the blind
 * adjudication -- and the card says so in locked lines instead of drawing a
 * stand-in (capsule-viewer#184 names each producer gap).
 *
 * The card is a level-2 toggle, so it holds no other toggle: depth L1 leaves
 * it closed and depth L2 opens it with the rest of the conversation. On a
 * page that runs no script its conversation becomes a link to the core's
 * record (`linkConversations`), so the page keeps each conversation once.
 */

/** One rule of the conversation, as the two cards already read it. */
export interface SpotCheckRule {
  /** The rule's name as the page's own rows print it. */
  readonly name: string;
  /** The rule's id, for `data-spot-rule`. */
  readonly ref: string;
  /** The verdict as the card words it, and the sealed verdict it comes from. */
  readonly worded: Worded;
  readonly verdict: string;
  /** The verdict the judge's probability is read for (a claim's own). */
  readonly drawnVerdict: string;
  /** The rule's wording as the page reads it from the sealed reports. */
  readonly wording: {
    readonly text: string;
    readonly source: "sealed" | "unstated" | "mixed";
  };
  readonly rationale?: string | undefined;
  /** Why there is no rationale, said by the card that knows the report's state. */
  readonly noNote: string;
  readonly judgePinDigest?: string | undefined;
  readonly reportState?: ReportState | undefined;
}

export interface SpotCheck {
  readonly transcript: ConversationTranscript;
  readonly caseRecord?: string | undefined;
  readonly rules: readonly SpotCheckRule[];
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const value = document.createElement(tag);
  value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function cell(kind: string, heading: string, rule?: string): HTMLElement {
  const col = el("div", `sc-col sc-${kind}`);
  col.dataset.column = kind;
  if (rule !== undefined) col.dataset.spotRule = rule;
  col.append(el("h5", "sc-h", heading));
  return col;
}

function happened(s: SpotCheck, w: Words): HTMLElement {
  const turns = s.transcript.turns;
  const shown =
    s.transcript.state === "verified" || s.transcript.state === "cited";
  const calls = turns?.reduce((n, t) => n + t.toolCalls.length, 0) ?? 0;
  const col = cell(
    "happened",
    shown && turns !== undefined
      ? w.t("spot.col.happened.counted", {
          turns: w.p("spot.turns", turns.length, { n: String(turns.length) }),
          calls: w.p("chat.calls", calls, { n: String(calls) }),
        })
      : w.t("spot.col.happened"),
  );
  col.style.setProperty("--span", String(s.rules.length));
  col.append(renderChat(s.transcript, s.caseRecord, w));
  if (shown) {
    const record = s.transcript.transcriptRecordId;
    if (record !== undefined) {
      // a page that runs no script keeps the conversation once, in the
      // core's records section: this link replaces the chat there
      col.dataset.record = record;
      const link = el("a", "chat-static", w.t("chat.read"));
      link.setAttribute("href", `#${recordAddress(record)}`);
      link.hidden = true;
      col.append(link);
    }
    col.append(el("p", "sc-gap", w.t("spot.gap.produced")));
  }
  return col;
}

function criterion(r: SpotCheckRule, w: Words): HTMLElement {
  const col = cell("criterion", w.t("spot.col.criterion"), r.ref);
  col.append(el("div", "sc-name", r.name));
  const term = el("div", "sc-box");
  term.dataset.wording = r.wording.source;
  if (r.wording.source === "sealed") {
    term.append(tagSource(el("div", "sc-k", w.t("spot.term")), "pack"));
    term.append(el("blockquote", "sc-q", r.wording.text));
  } else
    term.append(
      el(
        "p",
        "sc-gap",
        w.t(
          r.wording.source === "mixed"
            ? "spot.term.mixed"
            : "spot.term.unstated",
        ),
      ),
    );
  col.append(term);
  return col;
}

function verdictCell(r: SpotCheckRule, w: Words): HTMLElement {
  const col = cell("verdict", w.t("spot.col.verdict"), r.ref);
  const head = el("div", `sc-box sc-v ${r.worded.tone}`);
  head.append(wordPill(r.worded, r.verdict));
  if (r.rationale !== undefined) {
    head.append(tagSource(el("div", "sc-k", w.t("spot.says")), "pack"));
    head.append(el("p", "sc-q", judgeNote(r.rationale, r.drawnVerdict, w)));
  } else head.append(el("p", "sc-gap", r.noNote));
  col.append(head);
  const parsed =
    r.rationale === undefined ? {} : parseJudgeProbabilities(r.rationale);
  // The judge pin and the confidence are fields of the sealed report: drawn
  // as fields, with their path, not as the pack's words.
  const facts: HTMLElement[] = [];
  if (r.judgePinDigest !== undefined)
    facts.push(fieldText("judge_pin", r.judgePinDigest));
  if (parsed.confidence !== undefined)
    facts.push(fieldText("confidence", parsed.confidence.toFixed(2)));
  if (facts.length > 0) {
    const line = el("p", "sc-facts");
    facts.forEach((fact, i) =>
      line.append(...(i > 0 ? [" · ", fact] : [fact])),
    );
    line.dataset.judge = "";
    col.append(line);
  }
  return col;
}

/** The card: the conversation once, and one row of criterion and verdict per rule. */
export function spotCheckCard(s: SpotCheck, w: Words): HTMLElement {
  const card = el("article", "sc-card");
  card.dataset.spotCheck = "";
  const grid = el("div", "sc-grid");
  grid.append(happened(s, w));
  s.rules.forEach((rule, index) => {
    const row = index + 1;
    const c = criterion(rule, w);
    const v = verdictCell(rule, w);
    c.style.setProperty("--row", String(row));
    v.style.setProperty("--row", String(row));
    grid.append(c, v);
  });
  card.append(grid);
  const gaps = el("div", "sc-gaps");
  gaps.append(
    el("p", "sc-gap", w.t("spot.gap.when")),
    el("p", "sc-gap", w.t("spot.gap.adjudication")),
  );
  card.append(gaps);
  return card;
}

/** The toggle that opens the card. Undefined when no rule has a claim behind it. */
export function spotCheckToggle(
  s: SpotCheck,
  w: Words,
): HTMLElement | undefined {
  if (s.rules.length === 0) return undefined;
  const toggle = levelToggle(2, w.t("spot.toggle"), () => {
    const body = el("div", "sc-body");
    body.append(spotCheckCard(s, w));
    return body;
  });
  toggle.dataset.section = "spot-check";
  return toggle;
}
