// SPDX-License-Identifier: BSD-3-Clause
import {
  parseJudgeProbabilities,
  type ConversationTranscript,
  type ReportState,
  type ResultClaim,
} from "@action-state-group/agent-action-capsule";
import type { Words } from "./contract-report-wording.js";

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
 * Shared by both groupings of the contract-report module (contract-report.ts:
 * outcome-report-view.ts and compliance-view.ts). Everything here draws only
 * from values the callers already read from the verified bundle; it reads
 * nothing itself. Its words come from the card's wording pack (`Words`).
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
    const body = build();
    details.append(body);
    openBuiltToDepth(details);
  };
  if (options.eager === true) fill();
  else
    details.addEventListener("toggle", () => {
      if (details.open) fill();
    });
  return details;
}

/**
 * The one nesting rule for every report page (SEAMS ruling 11): a level-2
 * toggle may sit inside a level-1 toggle, and nothing deeper. Returns every
 * breach in `root`, by the summary text of the offending toggle: a toggle
 * inside two others, a level-1 toggle inside another toggle, or a level-2
 * toggle inside anything but a level-1 toggle (another level 2, say).
 * Empty when the page keeps the rule. Run it over a page with every toggle
 * opened, so lazily built bodies are counted.
 */
export function nestingProblems(root: ParentNode): string[] {
  const problems: string[] = [];
  for (const details of root.querySelectorAll("details")) {
    const outer: HTMLDetailsElement[] = [];
    for (
      let at = details.parentElement?.closest("details");
      at !== null && at !== undefined;
      at = at.parentElement?.closest("details")
    )
      outer.push(at);
    const name = JSON.stringify(
      details.querySelector(":scope > summary")?.textContent ?? "",
    );
    if (outer.length > 1)
      problems.push(`${name} is nested ${outer.length + 1} toggles deep`);
    else if (outer.length === 1 && outer[0]!.dataset.level !== undefined) {
      if (details.dataset.level !== "2")
        problems.push(`${name} is not level 2 but sits inside a toggle`);
      else if (outer[0]!.dataset.level !== "1")
        problems.push(
          `${name} is level 2 but sits inside a level-${outer[0]!.dataset.level} toggle, not a level-1 one`,
        );
    }
  }
  return problems;
}

/**
 * At depth L2 everything is open (presentation contract section 9.1),
 * including the toggles a body holds when it is built after the page was
 * drawn: inside a region the host opened to L2 (`data-open-all`), a newly
 * built body's toggles open too.
 */
export function openBuiltToDepth(body: HTMLElement): void {
  if (body.closest("[data-open-all]") === null) return;
  for (const toggle of body.querySelectorAll<HTMLDetailsElement>("details.lv"))
    if (!toggle.open) openToggle(toggle);
}

/** Opens a toggle and builds its body now (tests, print). */
export function openToggle(details: HTMLDetailsElement): void {
  details.open = true;
  // The event of the element's own window: a static page is drawn into a
  // document that is not the global one.
  const view = details.ownerDocument.defaultView;
  details.dispatchEvent(new (view === null ? Event : view.Event)("toggle"));
}

/**
 * A conversation's body inside an open level-1 toggle, in place (never a
 * toggle). Built when it comes within a screen or so of the view; where the
 * browser has no IntersectionObserver it is built at once. `beforeprint`
 * builds every pending body so a printed page is whole.
 */
export function lazyBody(host: HTMLElement, build: () => Node): void {
  host.dataset.body = "pending";
  const Observer = (
    globalThis as {
      IntersectionObserver?: typeof IntersectionObserver;
    }
  ).IntersectionObserver;
  let observer: IntersectionObserver | undefined;
  const fill = (): void => {
    if (host.dataset.body !== "pending") return;
    observer?.disconnect();
    pendingBodies.delete(host);
    host.dataset.body = "built";
    host.append(build());
    openBuiltToDepth(host);
  };
  if (Observer === undefined) {
    fill();
    return;
  }
  observer = new Observer(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) fill();
    },
    { rootMargin: "1200px 0px" },
  );
  observer.observe(host);
  // No listener per body: one `beforeprint` listener for the whole page
  // fills the bodies still pending in the document. A body that was built,
  // or whose card a host has since unmounted, holds no listener, so nothing
  // keeps an old card's model alive.
  pendingBodies.set(host, fill);
  watchPrint(host.ownerDocument);
}

/** Each pending body's fill, keyed weakly by its host, so a host dropped from the page is collected with its model. */
const pendingBodies = new WeakMap<HTMLElement, () => void>();
const printWatched = new WeakSet<Document>();

/** One `beforeprint` listener per document: builds every body still pending in it, and only those still in the page. */
function watchPrint(doc: Document): void {
  const view = doc.defaultView;
  if (view === null || printWatched.has(doc)) return;
  printWatched.add(doc);
  view.addEventListener("beforeprint", () => {
    for (const host of doc.querySelectorAll<HTMLElement>(
      '[data-body="pending"]',
    ))
      pendingBodies.get(host)?.();
  });
}

// ---------------------------------------------------------------------------
// Result words: from the card's wording pack
// ---------------------------------------------------------------------------

/**
 * Result words never come from the bundle: presentation contract section 6
 * forbids a bundle-carried setting from choosing wording. They come from the
 * card's wording pack (contract-report-wording.ts), which ships with the
 * viewer. The default packs speak the plain set (met, not met, did not
 * apply, could not decide); a pack may speak the grade ladder (established,
 * failed, not present, inconclusive, not checked) instead, and so tell the
 * three undecided cases apart.
 */

export type RuleVerdict =
  | "met"
  | "not_met"
  | "not_evaluable"
  | "failed"
  | "unsupported"
  | "not_applicable"
  // Result v0 section 4.2: judged, its own count, never met.
  | "out_of_scope"
  // Result v0 section 4.3: readiness only, never counted (EU card only:
  // the outcome card draws no criterion for a later claim).
  | "not_yet_in_force";

export type Tone = "ok" | "bad" | "na" | "ne";

export interface Worded {
  readonly word: string;
  readonly tone: Tone;
}

/**
 * Whether a judge ran on one rule, as far as the bundle shows: `yes` when
 * its disclosed report states a judge pin, `no` when the disclosed report
 * states none, `withheld` when the bundle withholds the report, `unknown`
 * when the report is supplied but does not match what was sealed, cannot be
 * read or does not check out, or is not carried at all. In every case but
 * `yes` and `no` the bundle cannot say.
 */
export type Judged = "yes" | "no" | "withheld" | "unknown";

export function judgedOf(
  reportState: ReportState | undefined,
  judgePinDigest: string | undefined,
): Judged {
  if (reportState === "withheld") return "withheld";
  if (reportState !== "disclosed") return "unknown";
  return judgePinDigest === undefined ? "no" : "yes";
}

/**
 * One rule's result in words, from the card's own grouping prefix
 * (`lines.verdict.*` or `groups.verdict.*`: the bare `verdict.*` namespace
 * stays contract-report/v1 §3's). `judged` picks among the pack's four
 * words for a rule nobody could decide: a judge ran and could not decide
 * (`.not_evaluable.judged`), none ran (`.unjudged`), the bundle
 * withholds the report that would say which (`.withheld`), or a judge's
 * report is cited but this bundle does not carry a readable copy of it --
 * mismatched, unreadable, invalid, or simply not carried (`.unavailable`),
 * never `.withheld`, which would claim more than those states show. A
 * failed or unsupported claim failed verification, or its evidence is
 * missing; it is never "not checked".
 */
export function ruleWord(
  verdict: RuleVerdict,
  judged: Judged,
  w: Words,
): Worded {
  const v = (key: string): string => w.t(`${w.grouping}.verdict.${key}`);
  switch (verdict) {
    case "failed":
      return { word: v("failed"), tone: "ne" };
    case "unsupported":
      return { word: v("unsupported"), tone: "ne" };
    case "met":
      return { word: v("met"), tone: "ok" };
    case "not_met":
      return { word: v("not_met"), tone: "bad" };
    case "not_applicable":
      return { word: v("not_applicable"), tone: "na" };
    case "out_of_scope":
      return { word: v("out_of_scope"), tone: "na" };
    case "not_yet_in_force":
      return { word: v("not_yet_in_force"), tone: "na" };
    case "not_evaluable":
      return {
        word: v(
          judged === "yes"
            ? "not_evaluable.judged"
            : judged === "no"
              ? "not_evaluable.unjudged"
              : judged === "withheld"
                ? "not_evaluable.withheld"
                : "not_evaluable.unavailable",
        ),
        tone: "ne",
      };
  }
}

/**
 * The judge's note in plain words. A sealed rationale that is the judge
 * backend's own synthesized line ("jev choice: not_met (probabilities={...},
 * confidence=...)") reads "The judge was 78% sure." (`judge.note.sure`); any
 * other rationale (a recomputed check's own explanation) is shown as sealed.
 * Display only: the proofs always carry the rationale exactly as sealed.
 */
export function judgeNote(
  rationale: string,
  verdict: string,
  w: Words,
): string {
  if (!/^jev choice:/u.test(rationale)) return rationale;
  // The same parse the model uses for P (anchored on the probabilities
  // block, a value only in [0, 1]), so the note and the proofs agree.
  const probabilities = parseJudgeProbabilities(rationale).probabilities ?? {};
  const p = Object.hasOwn(probabilities, verdict)
    ? probabilities[verdict]
    : undefined;
  return p === undefined || !Number.isFinite(p) || p < 0 || p > 1
    ? rationale
    : w.t("judge.note.sure", { p: Math.round(p * 100) });
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
export function caseParts(
  conversationId: string,
  w: Words,
): {
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
    label:
      trial === undefined
        ? w.t("case.label", { task })
        : w.t("case.label.trial", { task, trial }),
    ...(model === undefined || model.length === 0 ? {} : { model }),
  };
}

// ---------------------------------------------------------------------------
// The conversation, readable
// ---------------------------------------------------------------------------

/** The pack's label for a transcript role; an unknown role is shown as the transcript names it. */
function roleLabel(role: string, w: Words): string {
  return role === "user" ||
    role === "assistant" ||
    role === "tool" ||
    role === "system"
    ? w.t(`chat.role.${role}`)
    : role;
}

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
 * A sealed tool result, shown verbatim. It is indented for
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
 * already tied to the judged case by digest (`verified`), or to the case
 * every claim cites when the reports are withheld (`cited`, said as such);
 * nothing is reworded. Returns the "not in this bundle" note otherwise.
 */
export function renderChat(
  transcript: ConversationTranscript,
  caseRecord: string | undefined,
  w: Words,
): HTMLElement {
  const wrap = el("div", "chat");
  wrap.dataset.transcript = transcript.state;
  if (transcript.state !== "verified" && transcript.state !== "cited") {
    wrap.append(
      el(
        "p",
        "absent",
        transcript.state === "absent"
          ? w.t("chat.absent", {
              record: caseRecord ?? w.t("chat.record.not-stated"),
            })
          : w.t("chat.not-shown", {
              reason: transcript.reason ?? w.t("chat.not-shown.default-reason"),
            }),
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
      w.t("chat.lede", {
        messages: String(turns.length),
        calls: w.p("chat.calls", calls, { n: String(calls) }),
        state: w.t(
          transcript.state === "cited"
            ? "chat.state.cited"
            : "chat.state.verified",
        ),
      }),
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
    item.append(el("div", "who", roleLabel(turn.role, w)));
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
      line.append(el("span", "call-k", w.t("chat.called")));
      line.append(el("b", "", call.name));
      // The arguments as the outcome report model hands them over. At
      // agent-action-capsule 0.5.0 `transcriptTurns` re-serialises them
      // with JSON.stringify, so they are not the sealed bytes: a number
      // JSON cannot hold exactly is already rounded there. Never claimed
      // verbatim; this page rewords nothing further.
      if (call.arguments.length > 0) {
        const args = el("code", "call-a", call.arguments);
        args.dataset.exact = "as-modelled";
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
// contract-report/v1 section 3 words shared by both groupings
// ---------------------------------------------------------------------------

/**
 * The pack's `report.summary` line under the card's title, or nothing: the
 * module has no summary of its own, so a pack that sets none shows none.
 */
export function reportSummary(w: Words): HTMLElement | undefined {
  const text = w.section3("report.summary");
  if (text === undefined) return undefined;
  const p = el("p", "rsum", text);
  p.dataset.reportSummary = "";
  return p;
}

/**
 * One claim's assurance, as sealed on it (contract-report/v1 section 2:
 * assurance stays on the claim): its tier, grade, sufficiency and carrier
 * status, each in the layered section 3 word, or its raw value when no layer
 * has one. The raw values ride on the element as data.
 */
export function assuranceRow(
  claim: ResultClaim,
  w: Words,
): [string, string, Record<string, string>] {
  return [
    w.t("card.pf.assurance"),
    w.t("card.pf.assurance.line", {
      tier: w.enumWord("tier", claim.tier),
      grade: w.enumWord("grade", claim.grade),
      sufficiency: w.enumWord("sufficiency", claim.sufficiency),
      status: w.enumWord("status", claim.presentation.status),
    }),
    {
      tier: claim.tier,
      grade: claim.grade,
      sufficiency: claim.sufficiency,
      status: claim.presentation.status,
    },
  ];
}

/**
 * A wording layer the host supplied was refused (contract-report/v1 section
 * 3): one line at the top of the card, so a reader never takes the default
 * words for the ones the page was built to show.
 */
export function refusedWordingNotice(w: Words): HTMLElement | undefined {
  if (w.source.refused === undefined) return undefined;
  const p = el("p", "wref", w.t("card.wording.refused"));
  p.dataset.wording = "refused";
  p.dataset.refusal = w.source.refused.reason;
  return p;
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
${s} dl.prov{display:grid;grid-template-columns:110px 1fr;gap:4px 12px;margin:14px 0 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:12.5px}
${s} dl.prov dt{color:var(--slate);font-weight:600}
${s} dl.prov dd{margin:0;color:var(--ink);word-break:break-word}
@media (max-width:760px){${s} dl.pf,${s} dl.prov{grid-template-columns:1fr}${s} .chat li.turn{max-width:100%}${s} .conv-h{grid-template-columns:1fr auto}${s} .conv-h .cmodel{display:none}}
`;
}
