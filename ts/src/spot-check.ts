// SPDX-License-Identifier: BSD-3-Clause
import {
  parseJudgeProbabilities,
  type ConversationTranscript,
  type ReportState,
} from "@action-state-group/agent-action-capsule";
import type { Words } from "./contract-report-wording.js";
import {
  judgeNote,
  levelToggle,
  renderChat,
  wordPill,
  type Worded,
} from "./report-levels.js";

/**
 * Spot check, side by side (Terms Pack canvas: Outcomes frame 3, EU AI Act
 * frame 10). One card per subject, always three columns, read-only:
 *
 *   what happened     the conversation, who said what and each tool call
 *   the criterion     the rule as the judge was given it (the sealed
 *                     `clause_claim`)
 *   the verdict, why  the verdict, the judge's words, the judge pin and
 *                     confidence, the blind adjudication
 *
 * Drawn only from what the verified bundle carries. Three things the canvas
 * shows are not in what the bundle's Result reader returns -- who produced
 * each turn, the "met when / not evaluable when" lines, and an adjudication
 * -- and the card says so in locked lines instead of drawing a stand-in
 * (capsule-viewer#184 names each producer gap).
 *
 * The card is a level-2 toggle, so it holds no other toggle: depth L1 leaves
 * it closed and depth L2 opens it with the rest of the conversation.
 */

/** One rule of one conversation or session, as the two cards already read it. */
export interface SpotCheckSubject {
  /** The rule's name as the page's own rows print it. */
  readonly name: string;
  /** The rule's id, for `data-crit`. */
  readonly ref: string;
  /** The verdict as the card words it, and the sealed verdict it comes from. */
  readonly worded: Worded;
  readonly verdict: string;
  /** The sealed verdict the judge's probability is read for (a claim's own, else `verdict`). */
  readonly drawnVerdict: string;
  /** The rule's wording as the page reads it from the sealed reports. */
  readonly wording: {
    readonly text: string;
    readonly source: "sealed" | "unstated" | "mixed";
  };
  readonly rationale?: string | undefined;
  /** Why there is no rationale, said once by the card that knows the report's state. */
  readonly noNote: string;
  readonly judgePinDigest?: string | undefined;
  readonly reportState?: ReportState | undefined;
  readonly transcript: ConversationTranscript;
  readonly caseRecord?: string | undefined;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const value = document.createElement(tag);
  value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function column(kind: string, heading: string): HTMLElement {
  const col = el("div", `sc-col sc-${kind}`);
  col.dataset.column = kind;
  col.append(el("h5", "sc-h", heading));
  return col;
}

function happened(s: SpotCheckSubject, w: Words): HTMLElement {
  const turns = s.transcript.turns;
  const shown =
    s.transcript.state === "verified" || s.transcript.state === "cited";
  const col = column(
    "happened",
    shown && turns !== undefined
      ? w.t("spot.col.happened.counted", {
          turns: w.p("spot.turns", turns.length, { n: String(turns.length) }),
          calls: w.p(
            "chat.calls",
            turns.reduce((n, t) => n + t.toolCalls.length, 0),
            { n: String(turns.reduce((n, t) => n + t.toolCalls.length, 0)) },
          ),
        })
      : w.t("spot.col.happened"),
  );
  col.append(renderChat(s.transcript, s.caseRecord, w));
  if (shown) col.append(el("p", "sc-gap", w.t("spot.gap.produced")));
  return col;
}

function criterion(s: SpotCheckSubject, w: Words): HTMLElement {
  const col = column("criterion", w.t("spot.col.criterion"));
  const term = el("div", "sc-box");
  term.dataset.wording = s.wording.source;
  if (s.wording.source === "sealed") {
    term.append(el("div", "sc-k", w.t("spot.term")));
    term.append(el("blockquote", "sc-q", s.wording.text));
  } else
    term.append(
      el(
        "p",
        "sc-gap",
        w.t(
          s.wording.source === "mixed"
            ? "spot.term.mixed"
            : "spot.term.unstated",
        ),
      ),
    );
  col.append(term);
  col.append(el("p", "sc-gap", w.t("spot.gap.when")));
  return col;
}

function verdictColumn(s: SpotCheckSubject, w: Words): HTMLElement {
  const col = column("verdict", w.t("spot.col.verdict"));
  const head = el("div", `sc-box sc-v ${s.worded.tone}`);
  head.append(wordPill(s.worded, s.verdict));
  if (s.rationale !== undefined) {
    head.append(el("div", "sc-k", w.t("spot.says")));
    head.append(el("p", "sc-q", judgeNote(s.rationale, s.drawnVerdict, w)));
  } else head.append(el("p", "sc-gap", s.noNote));
  col.append(head);
  const parsed =
    s.rationale === undefined ? {} : parseJudgeProbabilities(s.rationale);
  const facts: string[] = [];
  if (s.judgePinDigest !== undefined)
    facts.push(w.t("spot.pin", { digest: s.judgePinDigest }));
  if (parsed.confidence !== undefined)
    facts.push(w.t("spot.confidence", { c: parsed.confidence.toFixed(2) }));
  if (facts.length > 0) {
    const line = el("p", "sc-facts", facts.join(" · "));
    line.dataset.judge = "";
    col.append(line);
  }
  col.append(el("p", "sc-gap", w.t("spot.gap.adjudication")));
  return col;
}

/** One card: the three columns for one rule of one conversation. */
export function spotCheckCard(s: SpotCheckSubject, w: Words): HTMLElement {
  const card = el("article", "sc-card");
  card.dataset.spotCheck = s.ref;
  card.dataset.critVerdict = s.verdict;
  card.append(el("h4", "sc-t", s.name));
  const grid = el("div", "sc-grid");
  grid.append(happened(s, w), criterion(s, w), verdictColumn(s, w));
  card.append(grid);
  return card;
}

/** The toggle that opens one card per rule that has a claim behind it. Undefined when no rule has one. */
export function spotCheckToggle(
  subjects: readonly SpotCheckSubject[],
  w: Words,
): HTMLElement | undefined {
  if (subjects.length === 0) return undefined;
  const toggle = levelToggle(2, w.t("spot.toggle"), () => {
    const body = el("div", "sc-body");
    for (const subject of subjects) body.append(spotCheckCard(subject, w));
    return body;
  });
  toggle.dataset.section = "spot-check";
  return toggle;
}
