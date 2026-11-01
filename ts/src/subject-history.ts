// SPDX-License-Identifier: BSD-3-Clause
import type { Words } from "./contract-report-wording.js";
import { levelToggle, type Tone } from "./report-levels.js";

/**
 * Same customer in this report (Terms Pack canvas, Outcomes frame 5,
 * capsule-viewer#122). One customer handle across the conversations of the
 * Result, each with its terms, request, band and outcome, drawn from the
 * pack-namespaced member the producer writes on the day Result
 * (`x-<pack>.subject_history`, evidencebook-skills#89 and #92: no AAC
 * vocabulary).
 *
 * Two tiers (`handle_scope.tier`):
 *
 *   operator  the handle and `follow_up_of` are drawn: the slice of one
 *             customer, a timeline with the follow-up link, tiles. The page is
 *             the holder's own preview, so it speaks to "you".
 *   shared    the same slice, in the third person, only when the handle is
 *             salted per share (`handle_scope.salting` is `per-share`,
 *             evidencebook-skills#93): one customer then has unrelated handles
 *             in two shares, so two receivers cannot link them. Any other
 *             shared member draws labels, band and halves only, with no
 *             customer grouping: the viewer ignores the handle and
 *             `follow_up_of` there, and at any unknown tier, whatever the
 *             document says.
 *
 * Read from the verified Result document, never invented: a field the
 * document lacks is not drawn, and a count is never drawn without the number
 * it is of. What the bundle does not carry is named in a locked line.
 */

const HEX64 = /^[0-9a-f]{64}$/u;
const BAND = /^e\+(\d{1,2})$/u;
const MAX_LABELS = 8;
const MAX_LABEL = 60;

/** The member of a Result document that carries the slice: `x-<pack>`. */
const EXTENSION = /^x-[a-z0-9][a-z0-9._-]*$/u;

export type SubjectTier = "operator" | "shared";

export interface SubjectScope {
  readonly pack: string;
  readonly tier: SubjectTier;
  readonly salting: string;
  readonly saltId: string;
}

export interface SubjectEntry {
  readonly requestLabels: readonly string[];
  /** The decimal exponent of the conversation's USD band: `e+2` is 10^2 to 10^3 - 1. */
  readonly bandExponent?: number;
  readonly halves?: { readonly present: number; readonly of: number };
  /** Read only when the handles are (`SubjectHistory.grouped`): the operator tier, or a shared tier salted per share. */
  readonly handle?: string;
  /** Read only when `grouped`, as `handle`: the id of the conversation this one follows up. */
  readonly followUpOf?: string;
}

export interface SubjectHistory {
  readonly tier: SubjectTier;
  /** True when the handles were read: the operator tier, or a shared tier salted per share. `scope` is then set. */
  readonly grouped: boolean;
  readonly scope?: SubjectScope;
  readonly entries: ReadonlyMap<string, SubjectEntry>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function str(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : undefined;
}

function readScope(value: unknown): SubjectScope | undefined {
  if (!isObj(value)) return undefined;
  const pack = str(value.pack, 120);
  const salting = str(value.salting, 60);
  const saltId = str(value.salt_id, 120);
  if (
    pack === undefined ||
    salting === undefined ||
    saltId === undefined ||
    (value.tier !== "operator" && value.tier !== "shared")
  )
    return undefined;
  return { pack, tier: value.tier, salting, saltId };
}

function readEntry(value: unknown, grouped: boolean): SubjectEntry | undefined {
  if (!isObj(value)) return undefined;
  const labels = value.request_labels;
  if (
    !Array.isArray(labels) ||
    labels.length > MAX_LABELS ||
    labels.some((l) => str(l, MAX_LABEL) === undefined)
  )
    return undefined;
  let bandExponent: number | undefined;
  if (value.usd_band !== undefined) {
    const band =
      typeof value.usd_band === "string" ? BAND.exec(value.usd_band) : null;
    if (band === null) return undefined;
    bandExponent = Number(band[1]);
  }
  let halves: SubjectEntry["halves"];
  if (value.halves !== undefined) {
    const h = value.halves;
    if (
      !isObj(h) ||
      !Number.isSafeInteger(h.present) ||
      !Number.isSafeInteger(h.of) ||
      (h.present as number) < 0 ||
      (h.of as number) < 1 ||
      (h.present as number) > (h.of as number)
    )
      return undefined;
    halves = { present: h.present as number, of: h.of as number };
  }
  let handle: string | undefined;
  let followUpOf: string | undefined;
  if (grouped) {
    if (value.customer_handle !== undefined) {
      if (
        typeof value.customer_handle !== "string" ||
        !HEX64.test(value.customer_handle)
      )
        return undefined;
      handle = value.customer_handle;
    }
    if (value.follow_up_of !== undefined) {
      followUpOf = str(value.follow_up_of, 200);
      if (followUpOf === undefined) return undefined;
    }
  }
  return {
    requestLabels: labels as string[],
    ...(bandExponent === undefined ? {} : { bandExponent }),
    ...(halves === undefined ? {} : { halves }),
    ...(handle === undefined ? {} : { handle }),
    ...(followUpOf === undefined ? {} : { followUpOf }),
  };
}

/**
 * The slice a Result document carries, or undefined when it carries none or
 * says it twice (two `x-` members with a `subject_history`: which is this
 * report's is not the viewer's to guess). An entry that does not read whole
 * is dropped whole. The handle and `follow_up_of` are read only when the
 * document's own `handle_scope.tier` is `operator`, or `shared` with
 * `salting` `per-share`.
 */
export function readSubjectHistory(
  document: unknown,
): SubjectHistory | undefined {
  if (!isObj(document)) return undefined;
  const found = Object.entries(document).filter(
    ([key, member]) =>
      EXTENSION.test(key) && isObj(member) && isObj(member.subject_history),
  );
  if (found.length !== 1) return undefined;
  const block = (found[0]![1] as Obj).subject_history as Obj;
  if (!isObj(block.conversations)) return undefined;
  const scope = readScope(block.handle_scope);
  const operator = scope?.tier === "operator";
  const grouped =
    operator || (scope?.tier === "shared" && scope.salting === "per-share");
  const entries = new Map<string, SubjectEntry>();
  for (const [id, value] of Object.entries(block.conversations)) {
    const entry = readEntry(value, grouped);
    if (entry !== undefined) entries.set(id, entry);
  }
  if (entries.size === 0) return undefined;
  return {
    tier: operator ? "operator" : "shared",
    grouped,
    ...(grouped && scope !== undefined ? { scope } : {}),
    entries,
  };
}

/** `10^n` to `10^(n+1) - 1`, as dollars: `e+1` is `$10-99`. */
export function usdRange(exponent: number): string {
  const low = 10n ** BigInt(exponent);
  const high = 10n ** BigInt(exponent + 1) - 1n;
  return `$${low.toLocaleString("en-US")}-${high.toLocaleString("en-US")}`;
}

/** The conversation as the Outcomes grouping read it: what this view draws, built by outcome-report-view.ts. */
export interface SubjectConversation {
  readonly id: string;
  /** `YYYY-MM-DD`, the date the conversation is counted under. */
  readonly date: string;
  /** `HH:MM` as the record states it, when it states one. */
  readonly time?: string;
  readonly status:
    | "resolved"
    | "missed"
    | "unverified"
    | "undecided"
    | "nothing-applied";
  readonly outcome: { readonly word: string; readonly tone: Tone };
  readonly terms: readonly {
    readonly ref: string;
    readonly label: string;
    readonly tone: Tone;
  }[];
  /** The terms that were not met or could not be decided, with the judge's words. */
  readonly open: readonly {
    readonly label: string;
    readonly wording: string;
    readonly verdict: string;
    readonly tone: Tone;
    readonly note: string;
  }[];
  readonly turns?: number;
  readonly calls?: number;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const fmt = (n: number): string => n.toLocaleString("en-US");

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

function dateWords(date: string, w: Words): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (m === null) return date;
  return `${w.t(`calendar.month.${Number(m[2])}`)} ${Number(m[3])}`;
}

const when = (c: SubjectConversation, w: Words): string =>
  c.time === undefined
    ? dateWords(c.date, w)
    : `${dateWords(c.date, w)} · ${c.time}`;

const requestOf = (e: SubjectEntry, w: Words): string =>
  e.requestLabels.length === 0
    ? w.t("lines.subject.request.none")
    : e.requestLabels.join(", ");

const bandOf = (e: SubjectEntry, w: Words): string =>
  e.bandExponent === undefined
    ? w.t("lines.subject.band.none")
    : w.t("lines.subject.band", { range: usdRange(e.bandExponent) });

const halvesOf = (e: SubjectEntry, w: Words): string =>
  e.halves === undefined
    ? w.t("lines.subject.halves.none")
    : w.t("lines.subject.halves", {
        present: fmt(e.halves.present),
        of: fmt(e.halves.of),
      });

/** `3f9a1c…d21e`: the head and tail of the handle, enough to tell two apart on the line of identity; `data-handle` holds the whole value read. */
export const shortHandle = (handle: string): string =>
  `${handle.slice(0, 6)}…${handle.slice(-4)}`;

function squares(c: SubjectConversation): HTMLElement {
  const box = el("span", "sh-sq");
  for (const term of c.terms) {
    const sq = el("i", `sq ${term.tone}`);
    sq.dataset.term = term.ref;
    sq.title = term.label;
    box.append(sq);
  }
  return box;
}

function card(c: SubjectConversation, w: Words): HTMLElement {
  const body = el("div", "sh-card");
  const happened = el("div", "sh-col");
  happened.append(el("h5", "sh-h", w.t("lines.subject.card.happened")));
  happened.append(
    el(
      "p",
      "",
      c.turns === undefined || c.calls === undefined
        ? w.t("lines.subject.card.no-transcript")
        : w.t("lines.subject.card.counts", {
            turns: w.p("spot.turns", c.turns, { n: fmt(c.turns) }),
            calls: w.p("chat.calls", c.calls, { n: fmt(c.calls) }),
          }),
    ),
  );
  const terms = el("div", "sh-col");
  terms.append(el("h5", "sh-h", w.t("lines.subject.card.terms")));
  if (c.open.length === 0)
    terms.append(el("p", "", w.t("lines.subject.card.all-met")));
  for (const o of c.open) {
    terms.append(el("p", "sh-term", o.label));
    if (o.wording !== "") terms.append(el("p", "sh-sub", o.wording));
  }
  const verdict = el("div", "sh-col");
  verdict.append(el("h5", "sh-h", w.t("lines.subject.card.verdict")));
  if (c.open.length === 0) verdict.append(el("p", "", c.outcome.word));
  for (const o of c.open) {
    const line = el("p", "");
    line.append(el("span", `pill ${o.tone}`, o.verdict), " ", o.note);
    verdict.append(line);
  }
  body.append(happened, terms, verdict);
  return body;
}

function tile(className: string, big: string, caption: string): HTMLElement {
  const box = el("div", `sh-tile ${className}`);
  box.append(el("b", "", big), el("span", "", caption));
  return box;
}

/** One customer's block: the line of identity, four tiles, the timeline, the table and its legend. */
function customerBlock(
  handle: string,
  rows: readonly SubjectConversation[],
  history: SubjectHistory,
  reportTotal: number,
  w: Words,
): HTMLElement {
  const block = el("article", "sh-cust");
  block.dataset.handle = handle;
  const n = rows.length;
  const count = (s: SubjectConversation["status"]): number =>
    rows.filter((r) => r.status === s).length;

  // The identity line: the handle, its scope, and the halves present, every
  // count beside what it is of.
  const core = el("p", "sh-core");
  core.append(
    el(
      "b",
      "",
      w.t("lines.subject.core.customer", { handle: shortHandle(handle) }),
    ),
  );
  const scope = history.scope;
  if (scope !== undefined)
    core.append(
      ` · ${w.t("lines.subject.core.scope", {
        pack: scope.pack,
        tier: scope.tier,
        salting: scope.salting,
        salt: scope.saltId,
      })}`,
    );
  const halves = rows.flatMap((r) => {
    const h = history.entries.get(r.id)?.halves;
    return h === undefined ? [] : [h];
  });
  if (halves.length > 0)
    core.append(
      ` · ${w.t("lines.subject.core.halves", {
        present: fmt(halves.reduce((a, h) => a + h.present, 0)),
        of: fmt(halves.reduce((a, h) => a + h.of, 0)),
        k: fmt(halves.length),
        n: fmt(n),
      })}`,
    );
  block.append(core);

  const dates = rows.map((r) => r.date).sort();
  const tiles = el("div", "sh-tiles");
  const of = (k: number): string =>
    w.t("lines.subject.share", { count: fmt(k), total: fmt(n) });
  tiles.append(
    tile(
      "all",
      fmt(n),
      w.t("lines.subject.tile.conversations", {
        first: dateWords(dates[0]!, w),
        last: dateWords(dates[dates.length - 1]!, w),
        total: fmt(reportTotal),
      }),
    ),
    tile("ok", of(count("resolved")), w.t("lines.subject.tile.resolved")),
    tile("bad", of(count("missed")), w.t("lines.subject.tile.missed")),
    tile("ne", of(count("undecided")), w.t("lines.subject.tile.undecided")),
  );
  block.append(tiles);
  const unverified = count("unverified");
  const nothing = count("nothing-applied");
  if (unverified + nothing > 0) {
    const rest = [
      ...(unverified > 0
        ? [
            w.t("lines.subject.note.unverified", {
              n: fmt(unverified),
              total: fmt(n),
            }),
          ]
        : []),
      ...(nothing > 0
        ? [
            w.t("lines.subject.note.nothing-applied", {
              n: fmt(nothing),
              total: fmt(n),
            }),
          ]
        : []),
    ];
    block.append(el("p", "sh-note", rest.join(" ")));
  }
  block.append(
    el("h3", "sh-head", w.t("lines.subject.headline", { n: fmt(n) })),
  );
  block.append(
    el(
      "p",
      "sh-lede",
      w.t(
        history.tier === "operator"
          ? "lines.subject.explain"
          : "lines.subject.explain.per-share",
        { n: fmt(n) },
      ),
    ),
  );

  block.append(timeline(rows, history, w));
  block.append(table(rows, history, w));
  const legend = el("p", "sh-legend");
  for (const [tone, key] of [
    ["ok", "met"],
    ["bad", "not-met"],
    ["ne", "undecided"],
  ] as const) {
    const item = el("span", "sh-key");
    item.append(el("i", `sq ${tone}`), w.t(`lines.subject.legend.${key}`));
    legend.append(item);
  }
  legend.append(el("span", "sh-key", w.t("lines.subject.legend.order")));
  block.append(legend);
  return block;
}

function timeline(
  rows: readonly SubjectConversation[],
  history: SubjectHistory,
  w: Words,
): HTMLElement {
  const section = el("div", "sh-time");
  section.append(el("h3", "sh-head", w.t("lines.subject.timeline.title")));
  const first = dayNumber(rows[0]!.date);
  const span = dayNumber(rows[rows.length - 1]!.date) - first;
  const at = (c: SubjectConversation): number =>
    span <= 0 ? 50 : ((dayNumber(c.date) - first) / span) * 100;
  const track = el("div", "sh-track");
  const byId = new Map(rows.map((r) => [r.id, r]));
  const list = el("ol", "sh-steps");
  for (const c of rows) {
    const dot = el("i", `sh-dot ${c.outcome.tone}`);
    dot.style.setProperty("--at", `${at(c).toFixed(2)}%`);
    dot.dataset.conversation = c.id;
    track.append(dot);
    const entry = history.entries.get(c.id)!;
    const step = el("li", "", `${when(c, w)} · ${requestOf(entry, w)} · `);
    step.append(el("span", `pill ${c.outcome.tone}`, c.outcome.word));
    list.append(step);
  }
  // The dashed link joins a follow-up to the earlier conversation it cites,
  // when both are this customer's and the earlier one is not later.
  for (const c of rows) {
    const target = byId.get(history.entries.get(c.id)?.followUpOf ?? "");
    if (target === undefined || target.id === c.id || target.date > c.date)
      continue;
    const days = dayNumber(c.date) - dayNumber(target.date);
    const link = el("span", "sh-link");
    link.dataset.followUp = c.id;
    link.dataset.of = target.id;
    link.style.setProperty("--from", `${at(target).toFixed(2)}%`);
    link.style.setProperty("--to", `${at(c).toFixed(2)}%`);
    link.append(
      el(
        "em",
        "",
        days === 0
          ? w.t("lines.subject.follow.same-day")
          : w.p("lines.subject.follow", days, { n: fmt(days) }),
      ),
    );
    track.append(link);
  }
  section.append(
    track,
    list,
    el("p", "sh-note", w.t("lines.subject.timeline.note")),
  );
  return section;
}

function table(
  rows: readonly SubjectConversation[],
  history: SubjectHistory,
  w: Words,
): HTMLElement {
  const section = el("div", "sh-table");
  section.append(el("h3", "sh-head", w.t("lines.subject.table.title")));
  const head = el("div", "sh-row sh-thead");
  for (const key of ["when", "request", "terms", "band", "halves", "outcome"])
    head.append(
      el(
        "span",
        "",
        key === "terms"
          ? w.t("lines.subject.col.terms", {
              n: fmt(Math.max(...rows.map((r) => r.terms.length))),
            })
          : w.t(`lines.subject.col.${key}`),
      ),
    );
  section.append(head);
  for (const c of rows) {
    const entry = history.entries.get(c.id)!;
    const summary = el("span", "sh-row");
    summary.append(
      el("span", "", when(c, w)),
      el("span", "", requestOf(entry, w)),
      squares(c),
      el("span", "sh-band", bandOf(entry, w)),
      el("span", "", halvesOf(entry, w)),
    );
    const outcome = el("span", `pill ${c.outcome.tone}`, c.outcome.word);
    summary.append(outcome);
    const row = levelToggle(2, summary, () => card(c, w), {
      className: "sh-conv",
    });
    row.dataset.conversation = c.id;
    section.append(row);
  }
  return section;
}

/**
 * The section: the slice of every customer with two or more conversations
 * when the handles were read (`grouped`), else one table of each
 * conversation's request, band and halves. Undefined when nothing is drawn.
 * `rows` are the Result's conversations as the Outcomes grouping reads them;
 * `reportTotal` is how many the Result holds, the denominator of every slice.
 */
export function renderSubjectHistory(
  rows: readonly SubjectConversation[],
  history: SubjectHistory,
  reportTotal: number,
  w: Words,
): HTMLElement | undefined {
  const drawn = rows
    .filter((r) => history.entries.has(r.id))
    .sort((a, b) =>
      a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
    );
  if (drawn.length === 0) return undefined;
  const section = el("section", "sec sh");
  section.dataset.section = "subject-history";
  section.dataset.tier = history.tier;
  section.append(el("h2", "sh-title", w.t("lines.subject.title")));
  if (history.grouped) {
    const groups = new Map<string, SubjectConversation[]>();
    for (const r of drawn) {
      const handle = history.entries.get(r.id)?.handle;
      if (handle === undefined) continue;
      groups.set(handle, [...(groups.get(handle) ?? []), r]);
    }
    const repeat = [...groups].filter(([, list]) => list.length >= 2);
    section.append(
      el(
        "p",
        "sh-slice",
        w.t(
          history.tier === "operator"
            ? "lines.subject.slice.operator"
            : "lines.subject.slice.per-share",
        ),
      ),
    );
    if (repeat.length === 0)
      section.append(el("p", "sh-lede", w.t("lines.subject.none")));
    repeat.sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
    for (const [handle, list] of repeat)
      section.append(customerBlock(handle, list, history, reportTotal, w));
  } else {
    section.append(el("p", "sh-slice", w.t("lines.subject.slice.shared")));
    section.append(table(drawn, history, w));
  }
  section.append(el("p", "sh-gap", w.t("lines.subject.gap")));
  return section;
}

/** The section's stylesheet, part of the outcome report's. */
export const SUBJECT_HISTORY_CSS = `
.oi .sh{max-width:1080px;margin:16px auto;padding:22px 24px;background:#fff;border:1px solid var(--line);border-radius:var(--r)}
.oi .sh-title{font-family:Georgia,"Iowan Old Style",Cambria,serif;font-size:22px;margin:0 0 10px}
.oi .sh-slice{background:var(--gold-l);border:1px solid #F0D7A8;border-radius:8px;padding:8px 12px;font-size:13px;margin:0 0 14px}
.oi .sh-cust{margin:0 0 22px;padding:14px 0 0;border-top:1px solid var(--line)}
.oi .sh-core{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--slate);margin:0 0 10px;overflow-wrap:anywhere}
.oi .sh-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 12px}
.oi .sh-tile{display:flex;flex-direction:column;gap:4px;background:var(--cream);border-radius:10px;padding:10px 14px}
.oi .sh-tile b{font-family:Georgia,"Iowan Old Style",Cambria,serif;font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums}
.oi .sh-tile span{font-size:12.5px;color:var(--slate)}
.oi .sh-tile.ok b{color:var(--ok)}.oi .sh-tile.bad b{color:var(--bad)}
.oi .sh-head{font-family:Georgia,"Iowan Old Style",Cambria,serif;font-size:18px;margin:16px 0 8px}
.oi .sh-lede,.oi .sh-note,.oi .sh-gap{font-size:13px;color:var(--slate);margin:6px 0}
.oi .sh-track{position:relative;height:34px;margin:8px 12px 4px;border-bottom:2px solid var(--line)}
.oi .sh-dot{position:absolute;bottom:-7px;left:var(--at);width:12px;height:12px;margin-left:-6px;border-radius:50%;border:2px solid var(--slate);background:#fff}
.oi .sh-dot.ok{border-color:var(--ok)}.oi .sh-dot.bad{border-color:var(--bad)}
.oi .sh-link{position:absolute;bottom:2px;left:var(--from);width:calc(var(--to) - var(--from));border-top:2px dashed var(--bad);text-align:center}
.oi .sh-link em{position:relative;top:-20px;font-size:11px;font-style:normal;color:var(--slate);white-space:nowrap}
.oi .sh-steps{margin:10px 0 0;padding-left:18px;font-size:13px}
.oi .sh-row{display:grid;grid-template-columns:minmax(110px,1fr) minmax(110px,1.4fr) minmax(130px,2fr) minmax(70px,.8fr) minmax(60px,.7fr) minmax(80px,.8fr);gap:8px;align-items:center;font-size:13px}
.oi .sh-thead{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--slate);border-bottom:2px solid var(--ink);padding:6px 0}
.oi .sh-conv{border-bottom:1px solid var(--line)}
.oi .sh-conv>summary{padding:8px 0;cursor:pointer;list-style:none}
.oi .sh-sq{display:inline-flex;gap:3px;flex-wrap:wrap}
.oi .sq{display:inline-block;width:14px;height:14px;border:1px solid var(--slate);border-radius:3px;background:#fff}
.oi .sq.ok{background:var(--ok-l);border-color:var(--ok)}.oi .sq.bad{background:var(--bad-l);border-color:var(--bad)}.oi .sq.ne,.oi .sq.na{background:#ECEAE4}
.oi .sh-band{font-family:ui-monospace,Menlo,monospace}
.oi .sh-card{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin:4px 0 10px;padding:12px 14px;background:var(--cream);border:1px solid var(--line);border-radius:8px;font-size:13px}
.oi .sh-h{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--slate);margin:0 0 6px}
.oi .sh-term{font-weight:600;margin:0}.oi .sh-sub{margin:0 0 6px;color:var(--slate)}
.oi .sh-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--slate);margin:10px 0 0}
.oi .sh-key{display:inline-flex;gap:6px;align-items:center}
@media (max-width:640px){.oi .sh{padding:16px}.oi .sh-row{grid-template-columns:1fr 1fr}.oi .sh-thead{display:none}}
`;
