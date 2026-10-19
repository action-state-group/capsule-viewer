// SPDX-License-Identifier: BSD-3-Clause
import {
  parseJudgeProbabilities,
  type ConversationTranscript,
  type ReportState,
} from "@action-state-group/agent-action-capsule";

/**
 * The two levels every human-facing report card has, and nothing deeper:
 *
 *   summary  -- what was checked and the result per rule, in plain words
 *   level 1  -- toggle: the conversations behind a line, listed in place,
 *               each one readable as it stands (its result, what the user
 *               and the agent said, which tools it called); a conversation
 *               is never a toggle of its own
 *   level 2  -- toggle: the proofs for one conversation (record ids,
 *               digests, judge pin, how to recompute)
 *
 * There is no third level: a reader toggles once to see the conversations
 * and the tools, toggles again for one conversation's proofs, and that is
 * all. No <details> ever sits inside more than one other <details>, and a
 * level-1 toggle never holds another level-1 toggle.
 *
 * Shared by the outcome card (outcome-report-view.ts) and the EU obligations
 * card (compliance-view.ts). Everything here draws only from values the
 * callers already read from the verified bundle; it reads nothing itself.
 * Toggles are native <details> (keyboard-accessible, no script-driven modal);
 * a toggle's body is built the first time it is opened, and inside an open
 * level-1 toggle each conversation's body is built when it scrolls near the
 * view (`lazyBody`), so a month of conversations does not multiply the
 * page's DOM for content nobody read.
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
// Toggles
// ---------------------------------------------------------------------------

/**
 * A level-1 or level-2 toggle. `summary` is what the closed toggle says;
 * `build` makes the body on first open (or at once with `eager`).
 */
export function levelToggle(
  level: 1 | 2,
  summary: string | HTMLElement,
  build: () => Node,
  options: { className?: string; eager?: boolean } = {},
): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = `lv lv${level}${options.className === undefined ? "" : ` ${options.className}`}`;
  details.dataset.level = String(level);
  const head = document.createElement("summary");
  if (typeof summary === "string") head.textContent = summary;
  else head.append(summary);
  details.append(head);
  let built = false;
  const fill = (): void => {
    if (built) return;
    built = true;
    details.append(build());
  };
  if (options.eager === true) fill();
  else
    details.addEventListener("toggle", () => {
      if (details.open) fill();
    });
  return details;
}

/** Opens a toggle and builds its body now (tests, print). */
export function openToggle(details: HTMLDetailsElement): void {
  details.open = true;
  details.dispatchEvent(new Event("toggle"));
}

/**
 * A conversation's body inside an open level-1 toggle, in place (never a
 * toggle). Built when it comes within a screen or so of the view; where the
 * browser has no IntersectionObserver it is built at once. `beforeprint`
 * builds every pending body so a printed page is whole.
 */
export function lazyBody(host: HTMLElement, build: () => Node): void {
  host.dataset.body = "pending";
  const fill = (): void => {
    if (host.dataset.body !== "pending") return;
    host.dataset.body = "built";
    host.append(build());
  };
  const Observer = (
    globalThis as {
      IntersectionObserver?: typeof IntersectionObserver;
    }
  ).IntersectionObserver;
  if (Observer === undefined) {
    fill();
    return;
  }
  const observer = new Observer(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        fill();
      }
    },
    { rootMargin: "1200px 0px" },
  );
  observer.observe(host);
  globalThis.addEventListener?.("beforeprint", fill, { once: true });
}

// ---------------------------------------------------------------------------
// Result words: plain by default, the grade ladder behind a flag
// ---------------------------------------------------------------------------

export type RuleVerdict =
  | "met"
  | "not_met"
  | "not_evaluable"
  | "failed"
  | "unsupported"
  | "not_applicable";

export type Tone = "ok" | "bad" | "na" | "ne";

export interface Worded {
  readonly word: string;
  readonly tone: Tone;
}

/**
 * Whether a judge ran on one rule, as far as the bundle shows: `yes` when
 * its disclosed report states a judge pin, `no` when the disclosed report
 * states none, `unknown` when the report is withheld (or supplied but not
 * readable), so the bundle cannot say.
 */
export type Judged = "yes" | "no" | "unknown";

export function judgedOf(
  reportState: ReportState | undefined,
  judgePinDigest: string | undefined,
): Judged {
  if (reportState !== "disclosed") return "unknown";
  return judgePinDigest === undefined ? "no" : "yes";
}

/**
 * One rule's result in words. `judged` matters only on the ladder, for a
 * rule nobody could decide: "inconclusive" when a judge ran and could not
 * decide, "not checked" when none ran, and "could not decide (report
 * withheld)" when the bundle withholds the report that would say which. A
 * failed or unsupported claim reads the same on both word sets: it failed
 * verification, or its evidence is missing; it is never "not checked".
 */
export function ruleWord(
  verdict: RuleVerdict,
  ladder: boolean,
  judged: Judged,
): Worded {
  switch (verdict) {
    case "failed":
      return { word: "failed verification", tone: "bad" };
    case "unsupported":
      return { word: "evidence missing", tone: "bad" };
  }
  if (!ladder)
    switch (verdict) {
      case "met":
        return { word: "met", tone: "ok" };
      case "not_met":
        return { word: "not met", tone: "bad" };
      case "not_applicable":
        return { word: "did not apply", tone: "na" };
      case "not_evaluable":
        return { word: "could not decide", tone: "ne" };
    }
  switch (verdict) {
    case "met":
      return { word: "established", tone: "ok" };
    case "not_met":
      return { word: "failed", tone: "bad" };
    case "not_applicable":
      return { word: "not present", tone: "na" };
    case "not_evaluable":
      return judged === "yes"
        ? { word: "inconclusive", tone: "ne" }
        : judged === "no"
          ? { word: "not checked", tone: "ne" }
          : { word: "could not decide (report withheld)", tone: "ne" };
  }
}

/**
 * The judge's note in plain words. A sealed rationale that is the judge
 * backend's own synthesized line ("jev choice: not_met (probabilities={...},
 * confidence=...)") reads "The judge was 78% sure."; any other rationale (a
 * recomputed check's own explanation) is shown as sealed. Display only: the
 * proofs always carry the rationale exactly as sealed.
 */
export function judgeNote(rationale: string, verdict: string): string {
  if (!/^jev choice:/u.test(rationale)) return rationale;
  // The same parse the model uses for P (anchored on the probabilities
  // block, a value only in [0, 1]), so the note and the proofs agree.
  const probabilities = parseJudgeProbabilities(rationale).probabilities ?? {};
  const p = Object.hasOwn(probabilities, verdict)
    ? probabilities[verdict]
    : undefined;
  return p === undefined || !Number.isFinite(p) || p < 0 || p > 1
    ? rationale
    : `The judge was ${Math.round(p * 100)}% sure.`;
}

export function wordPill(worded: Worded, key: string): HTMLElement {
  const pill = el("span", `pill ${worded.tone}`, worded.word);
  pill.dataset.pill = key;
  return pill;
}

/**
 * `tau2:airline:<model>:task-20:trial-1` reads "task 20, trial 1" with the
 * model beside it; the older `tau2:airline:task-20:trial-0` reads "task 20,
 * trial 0"; any other id is shown whole.
 */
export function caseParts(conversationId: string): {
  label: string;
  model?: string;
} {
  const parts = conversationId.split(":");
  const at = parts.findIndex((p) => /^task-[0-9]+$/u.test(p));
  if (at === -1) return { label: conversationId };
  const task = parts[at]!.slice("task-".length);
  const trial = /^trial-([0-9]+)$/u.exec(parts[at + 1] ?? "")?.[1];
  const model = at > 2 ? parts.slice(2, at).join(":") : undefined;
  return {
    label: `task ${task}${trial === undefined ? "" : `, trial ${trial}`}`,
    ...(model === undefined || model.length === 0 ? {} : { model }),
  };
}

// ---------------------------------------------------------------------------
// The conversation, readable
// ---------------------------------------------------------------------------

const ROLE_LABEL: ReadonlyMap<string, string> = new Map([
  ["user", "User"],
  ["assistant", "Agent"],
  ["tool", "Tool result"],
  ["system", "Instructions given to the agent"],
]);

/** The text with every whitespace character outside JSON strings removed. */
function jsonWithoutSpace(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (!/\s/u.test(ch)) out += ch;
  }
  return out;
}

/**
 * A sealed tool argument or tool result, shown verbatim. It is indented for
 * reading only when doing so changes nothing but whitespace: JSON.parse then
 * JSON.stringify must give back exactly the original once whitespace outside
 * strings is set aside. A number JSON cannot hold exactly
 * (`{"id":12345678901234567890}`), a duplicate key, an escape written
 * differently: any of these, and the original text is shown as it is.
 */
export function exactText(text: string): { text: string; indented: boolean } {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { text, indented: false };
  }
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return { text, indented: false };
  }
  if (JSON.stringify(value) !== jsonWithoutSpace(trimmed))
    return { text, indented: false };
  return { text: JSON.stringify(value, null, 2), indented: true };
}

/**
 * The conversation as a chat: who said what, and each tool the agent called
 * with its arguments. The words come from the transcript the caller has
 * already tied to the judged case by digest; nothing is reworded. Returns
 * the "not in this bundle" note when there is no verified transcript.
 */
export function renderChat(
  transcript: ConversationTranscript,
  caseRecord: string | undefined,
): HTMLElement {
  const wrap = el("div", "chat");
  wrap.dataset.transcript = transcript.state;
  if (transcript.state !== "verified") {
    wrap.append(
      el(
        "p",
        "absent",
        transcript.state === "absent"
          ? `The conversation is not in this bundle. It is sealed in the case record ${caseRecord ?? "(not stated)"}, which this report does not disclose, so this page cannot show it.`
          : `The conversation is not shown: ${transcript.reason ?? "the transcript in this bundle does not check against the case the judge read"}.`,
      ),
    );
    return wrap;
  }
  const turns = transcript.turns ?? [];
  const calls = turns.reduce((n, t) => n + t.toolCalls.length, 0);
  wrap.append(
    el(
      "p",
      "chat-k",
      `${turns.length} messages, ${calls} tool call${calls === 1 ? "" : "s"}. The exact conversation the judge read, checked on this page (see the proofs). Tool arguments and results are shown as sealed; JSON is only indented, and only where indenting changes nothing else.`,
    ),
  );
  const list = el("ol", "turns");
  turns.forEach((turn, index) => {
    const role =
      turn.role === "user" ||
      turn.role === "assistant" ||
      turn.role === "tool" ||
      turn.role === "system"
        ? turn.role
        : "other";
    const item = el("li", `turn ${role}`);
    item.dataset.turn = String(index);
    item.dataset.role = turn.role;
    item.append(el("div", "who", ROLE_LABEL.get(turn.role) ?? turn.role));
    if (turn.content !== undefined && turn.content.length > 0) {
      if (role === "tool") {
        const shown = exactText(turn.content);
        const pre = el("pre", "say", shown.text);
        pre.dataset.exact = shown.indented ? "indented" : "verbatim";
        item.append(pre);
      } else item.append(el("div", "say", turn.content));
    }
    for (const call of turn.toolCalls) {
      const line = el("div", "call");
      line.dataset.toolCall = call.name;
      line.append(el("span", "call-k", "called "));
      line.append(el("b", "", call.name));
      // The arguments exactly as the transcript gives them (compact JSON),
      // never re-keyed or reworded.
      if (call.arguments.length > 0) {
        const args = el("code", "call-a", call.arguments);
        args.dataset.exact = "verbatim";
        line.append(" ", args);
      }
      item.append(line);
    }
    list.append(item);
  });
  wrap.append(list);
  return wrap;
}

// ---------------------------------------------------------------------------
// Proofs: one definition list, ids in monospace
// ---------------------------------------------------------------------------

export function proofList(
  rows: readonly (
    | readonly [string, string]
    | readonly [string, string, Readonly<Record<string, string>>]
  )[],
): HTMLElement {
  const dl = el("dl", "pf");
  for (const [k, v, data] of rows) {
    const dd = element("dd", v);
    for (const [key, value] of Object.entries(data ?? {}))
      dd.dataset[key] = value;
    dl.append(element("dt", k), dd);
  }
  return dl;
}

/** The toggles', chat's and proofs' styles, scoped under the card's class. */
export function levelCss(scope: string): string {
  const s = `.${scope}`;
  return `
${s} details.lv{border:1px solid var(--line);border-radius:10px;background:#fff;margin-top:8px;padding:0}
${s} details.lv > summary{cursor:pointer;list-style:none;padding:8px 12px;font-size:13.5px;font-weight:600;color:var(--navy)}
${s} details.lv > summary::-webkit-details-marker{display:none}
${s} details.lv > summary:before{content:"";display:inline-block;width:0;height:0;border-left:5px solid var(--navy);border-top:4px solid transparent;border-bottom:4px solid transparent;margin-right:8px;vertical-align:1px;transition:transform .1s}
${s} details.lv[open] > summary:before{transform:rotate(90deg)}
${s} details.lv1.line{border:0;background:transparent;margin-top:4px}
${s} details.lv1.line > summary{padding:2px 0;font-size:13px}
${s} details.lv1.line > .convs,${s} details.lv1.line > .why-missed{margin-top:8px}
${s} tr.drill-row > td{padding:0 10px 12px;border-bottom:1px solid var(--line)}
${s} details.lv2{background:#FAF8F4;border-style:dashed}
${s} details.lv2 > summary{color:var(--slate);font-weight:600}
${s} details.lv2 > .pf-b{padding:4px 14px 14px;font-size:12.5px}
${s} .convs{display:grid;gap:12px}
${s} .conv{border:1px solid var(--line);border-radius:10px;background:#fff}
${s} .conv-h{display:grid;grid-template-columns:110px auto 1fr auto;gap:10px;align-items:center;padding:8px 12px;font-size:13.5px;background:#FAF8F4;border-bottom:1px solid var(--line);border-radius:10px 10px 0 0}
${s} .conv-h .cid{font-weight:700;color:var(--navy)}
${s} .conv-h .cwhy{color:var(--slate)}
${s} .conv-h .cmodel{color:var(--slate);font-family:ui-monospace,Menlo,monospace;font-size:11.5px;white-space:nowrap}
${s} .conv > [data-body="pending"]{min-height:160px}
${s} .conv-b{padding:4px 16px 16px;font-size:13.5px;font-weight:400;color:var(--ink)}
${s} .conv-b h4{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--slate);margin:16px 0 6px}
${s} .conv-b .small{font-size:12.5px;color:var(--slate);margin:6px 0}
${s} .conv-b .muted{color:var(--slate)}
${s} .why-missed h5{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--slate);margin:14px 0 6px}
${s} .why-missed table{border-collapse:collapse;font-size:13px;margin:0 0 8px}
${s} .why-missed td{padding:3px 12px 3px 0;border-bottom:1px solid var(--line)}
${s} .why-missed td.n{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:var(--bad)}
${s} .why-missed .rsn-h{margin:16px 0 6px;font-size:13.5px;font-weight:700;color:var(--navy)}
${s} .chat .absent{margin:0;padding:10px 12px;border:1px dashed #BFC4CC;border-radius:10px;background:#FAF8F4;color:var(--slate);word-break:break-word;font-size:13px}
${s} .chat .chat-k{font-size:12.5px;color:var(--slate);margin:4px 0 6px}
${s} .chat ol.turns{list-style:none;margin:0;padding:10px;display:grid;gap:6px;max-height:620px;overflow:auto;border:1px solid var(--line);border-radius:10px;background:#FAF8F4}
${s} .chat li.turn{border-radius:10px;padding:6px 10px;max-width:86%;background:#fff;border:1px solid var(--line);font-size:13.5px}
${s} .chat li.turn.user{justify-self:end;background:var(--person-l);border-color:transparent}
${s} .chat li.turn.assistant{justify-self:start}
${s} .chat li.turn.tool,${s} .chat li.turn.system{justify-self:center;max-width:96%;border-style:dashed;background:#fff}
${s} .chat li.turn .who{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--slate);margin-bottom:2px}
${s} .chat li.turn .say{white-space:pre-wrap;word-break:break-word}
${s} .chat li.turn pre.say{margin:0;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;max-height:180px;overflow:auto;color:var(--slate)}
${s} .chat li.turn.system .say{max-height:120px;overflow:auto;font-size:12px;color:var(--slate)}
${s} .chat .call{margin-top:4px;font-size:12.5px;background:var(--gold-l);border-radius:6px;padding:3px 8px;word-break:break-word}
${s} .chat .call .call-k{color:var(--slate)}
${s} .chat .call b{font-family:ui-monospace,Menlo,monospace;color:var(--navy);font-size:12px}
${s} .chat .call .call-a{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--ink);white-space:pre-wrap;word-break:break-all}
${s} dl.pf{display:grid;grid-template-columns:200px 1fr;gap:4px 12px;margin:6px 0;font-size:12px}
${s} dl.pf dt{color:var(--slate)}
${s} dl.pf dd{margin:0;font-family:ui-monospace,Menlo,monospace;word-break:break-all;color:var(--navy)}
${s} .pf-b p{margin:8px 0;color:var(--slate)}
${s} .pf-b h5{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--slate);margin:14px 0 4px}
${s} .pill{display:inline-block;padding:1px 9px;border-radius:99px;font-size:12px;font-weight:700;white-space:nowrap;text-align:center}
${s} .pill.ok{background:var(--ok-l);color:var(--ok)}
${s} .pill.bad{background:var(--bad-l);color:var(--bad)}
${s} .pill.na{background:#EEF0F3;color:var(--slate);border:1px dashed #BFC4CC}
${s} .pill.ne{background:var(--gold-l);color:#8A5A12}
@media (max-width:760px){${s} dl.pf{grid-template-columns:1fr}${s} .chat li.turn{max-width:100%}${s} .conv-h{grid-template-columns:1fr auto}${s} .conv-h .cmodel{display:none}}
`;
}
