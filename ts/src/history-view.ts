// SPDX-License-Identifier: Apache-2.0
/**
 * The History view (docs/design/history-view.md, capsule-viewer#247): one
 * History page for Muse's private History, the mesh-llm console's saved
 * History page and the Goose History card, on the actionstate-muse#203
 * anatomy.
 *
 * The view draws; it never fetches and never verifies. Its caller passes a
 * `history-view/v0` object built from what the caller itself checked, and
 * the view decides the layout, the words and which slots may fill. Unknown
 * members are refused, so a caller cannot pass words or a "filled" flag.
 *
 * The page is built once as an element tree and written two ways: as HTML
 * text (`historyViewHtml`, for static pages) and as DOM (`renderHistoryView`,
 * for scripted pages), so both are the same page. Caller text is only ever
 * text: it never goes in an attribute and is never parsed as HTML.
 */
import PACK from "./wording/history-view.en.json" with { type: "json" };

export const HISTORY_VIEW = "history-view/v0";

export type CheckStatus = "pass" | "fail" | "not_run";
export type SlotState = "passed" | "failed" | "none" | "not_checked";

export interface HistorySlot {
  readonly state: SlotState;
  readonly by?: string;
  readonly at?: string;
  readonly through?: { readonly k: number; readonly n: number };
}

export interface CheckpointRow {
  readonly kind: "checkpoint";
  readonly cut_at: string;
  readonly log_size: number;
  readonly anchor: string;
  readonly signature: CheckStatus;
  readonly witness: HistorySlot;
  readonly second_signature: HistorySlot;
}

export interface DealRow {
  readonly kind: "deal";
  readonly asked: string;
  readonly outcome: string;
  readonly money?: string;
  readonly opened_at: string;
  readonly last_at: string;
  readonly record: string;
  readonly witness: HistorySlot;
  readonly second_signature: HistorySlot;
}

const KNOWN_STRANGER_TOKENS: readonly string[] = ["history_card/1"];

export interface HistorySharing {
  /** Each of the first five is absent when the node does not state it (a Goose
   * node's advertised policy carries none of them). */
  readonly standard_history?: boolean;
  readonly history_segments?: "off" | "counterparties" | "peers";
  readonly record_at_completion?: "counterparty" | "off";
  readonly adjudications?: "deliver_to_subjects" | "off";
  readonly exchange_corroboration?: boolean;
  /** What a Goose node's advertised policy states: its half of an exchange goes
   * to that exchange's counterparty only. Absent when not stated; no line then. */
  readonly share_deal_half?: "counterparty";
  /** What the policy says it gives any stranger (short tokens such as
   * `history_card/1`). Absent when not stated; no line then. */
  readonly stranger_safe?: readonly string[];
  /** Absent when the node does not state it (an advertised policy lacks it). */
  readonly adjudicate_differing_twins?: boolean;
  /** Absent when the node does not state it (an advertised policy lacks it). */
  readonly witnesses?: readonly string[];
}

export interface HistoryViewInput {
  readonly view: typeof HISTORY_VIEW;
  readonly kind: "checkpoint" | "deal";
  readonly surface: "neutral" | "product";
  readonly reader: "owner" | "recipient";
  readonly holder: {
    readonly node?: string;
    readonly name?: string;
    readonly stream?: string;
  };
  readonly audience:
    | { readonly kind: "private" }
    | { readonly kind: "shared"; readonly for: string }
    | { readonly kind: "anyone" };
  readonly built_at: string;
  readonly checked: { readonly where: "page" | "builder"; readonly by: string };
  readonly outcome?:
    | { readonly kind: "answered" }
    | { readonly kind: "refused"; readonly reason: string }
    | { readonly kind: "unreadable" };
  readonly picked?: boolean;
  readonly rows: readonly (CheckpointRow | DealRow)[];
  readonly checks: readonly {
    readonly id: string;
    readonly status: CheckStatus;
    readonly values?: Readonly<Record<string, string>>;
  }[];
  readonly periods?: readonly {
    readonly from: string;
    readonly to: string;
    /** A count, or `withheld: true` where the node withholds a small count. */
    readonly cells: readonly {
      readonly what: string;
      readonly value?: string;
      readonly withheld?: true;
    }[];
  }[];
  readonly sharing?: HistorySharing;
  readonly signer_directory?: string;
  readonly period?: { readonly from: string; readonly to: string };
}

/** An overlay pack: a product caller's words for keys of the view's own pack. */
export interface HistoryViewOverlay {
  readonly id: string;
  readonly entries: Readonly<Record<string, string>>;
}

/** The view's check ids (design note §3). Words for each are `check.<id>`. */
export const HISTORY_CHECK_IDS = [
  "readable",
  "refusal",
  "artifact_digest",
  "card_digest",
  "checkpoint_signatures",
  "checkpoint_chain",
  "consistency",
  "anchor",
  "period_counts",
  "envelope_signature",
  "key_is_node",
  "reply_bound",
  "witness",
  "second_signature",
  "deal_report",
] as const;

/** Checks whose failure is drawn in its chip or row slot, never as the page's verdict. */
const SLOT_CHECKS: ReadonlySet<string> = new Set([
  "witness",
  "second_signature",
]);

const BASE: Readonly<Record<string, string>> = PACK.entries;

/** The view's wording pack, as shipped (neutral words only). */
export const HISTORY_VIEW_WORDING = PACK;

/** A refused input: every reason the view found. */
export class HistoryViewRefused extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(`history-view refused: ${reasons.join("; ")}`);
    this.name = "HistoryViewRefused";
    this.reasons = reasons;
  }
}

// --- the element tree ------------------------------------------------------

/** One element of the page. Attribute values are the view's own tokens. */
export interface HistoryElement {
  readonly tag: string;
  readonly attrs: readonly (readonly [string, string])[];
  readonly children: readonly (HistoryElement | string)[];
}

const TOKEN = /^[a-z0-9 _.-]*$/u;

function el(
  tag: string,
  attrs: Readonly<Record<string, string>> | null,
  ...children: readonly (HistoryElement | string | null | false)[]
): HistoryElement {
  const pairs = Object.entries(attrs ?? {});
  for (const [name, value] of pairs)
    if (!TOKEN.test(name) || !TOKEN.test(value))
      throw new Error(
        `history-view: attribute ${name}=${value} is not a view token`,
      );
  return {
    tag,
    attrs: pairs,
    children: children.filter(
      (c): c is HistoryElement | string => c !== null && c !== false,
    ),
  };
}

function escapeText(text: string): string {
  return text.replace(/[&<> ]/gu, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&nbsp;",
  );
}

/** The tree as HTML, by the HTML fragment serialization rules. */
export function serializeHistoryElement(node: HistoryElement | string): string {
  if (typeof node === "string") return escapeText(node);
  const attrs = node.attrs.map(([n, v]) => ` ${n}="${v}"`).join("");
  return `<${node.tag}${attrs}>${node.children.map(serializeHistoryElement).join("")}</${node.tag}>`;
}

/** The tree as DOM, text set as text nodes only. */
export function historyElementToDom(
  node: HistoryElement | string,
  doc: Document,
): Node {
  if (typeof node === "string") return doc.createTextNode(node);
  const out = doc.createElement(node.tag);
  for (const [n, v] of node.attrs) out.setAttribute(n, v);
  for (const child of node.children)
    out.appendChild(historyElementToDom(child, doc));
  return out;
}

// --- reading the input -----------------------------------------------------

type Json = unknown;

class Reader {
  readonly reasons: string[] = [];
  refuse(path: string, why: string): void {
    this.reasons.push(`${path}: ${why}`);
  }
  object(
    v: Json,
    path: string,
    allowed: readonly string[],
    required: readonly string[],
  ): Record<string, Json> | null {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      this.refuse(path, "is not an object");
      return null;
    }
    const o = v as Record<string, Json>;
    for (const k of Object.keys(o))
      if (!allowed.includes(k))
        this.refuse(`${path}.${k}`, "is not a member of history-view/v0");
    for (const k of required)
      if (!(k in o)) this.refuse(`${path}.${k}`, "is missing");
    return o;
  }
  string(v: Json, path: string, max = 2000): string | undefined {
    if (typeof v !== "string" || v.length === 0 || v.length > max) {
      this.refuse(path, `is not a string of 1 to ${max} characters`);
      return undefined;
    }
    return v;
  }
  oneOf<T extends string>(
    v: Json,
    path: string,
    values: readonly T[],
  ): T | undefined {
    if (typeof v !== "string" || !(values as readonly string[]).includes(v)) {
      this.refuse(path, `is not one of ${values.join(", ")}`);
      return undefined;
    }
    return v as T;
  }
  bool(v: Json, path: string): boolean | undefined {
    if (typeof v !== "boolean") {
      this.refuse(path, "is not true or false");
      return undefined;
    }
    return v;
  }
  count(v: Json, path: string): number | undefined {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
      this.refuse(path, "is not a whole number of 0 or more");
      return undefined;
    }
    return v;
  }
  time(v: Json, path: string): Instant | undefined {
    const s = this.string(v, path, 64);
    if (s === undefined) return undefined;
    const t = parseInstant(s);
    if (t === undefined) this.refuse(path, "is not an RFC 3339 time");
    return t;
  }
  date(v: Json, path: string): Instant | undefined {
    const s = this.string(v, path, 64);
    if (s === undefined) return undefined;
    const t = /^\d{4}-\d{2}-\d{2}$/u.test(s)
      ? parseInstant(`${s}T00:00:00Z`)
      : parseInstant(s);
    if (t === undefined)
      this.refuse(path, "is not a date (YYYY-MM-DD) or an RFC 3339 time");
    return t;
  }
}

interface Instant {
  readonly ms: number;
  /** The fraction of the second as written, without the dot ("" when none). */
  readonly fraction: string;
}

function parseInstant(s: string): Instant | undefined {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?([Zz]|[+-]\d{2}:\d{2})$/u.exec(
      s,
    );
  if (!m) return undefined;
  const [, y, mo, d, h, mi, se, frac = "", zone = "Z"] = m;
  const month = Number(mo);
  const day = Number(d);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    Number(h) > 23 ||
    Number(mi) > 59 ||
    Number(se) > 59
  )
    return undefined;
  let ms = Date.UTC(
    Number(y),
    month - 1,
    day,
    Number(h),
    Number(mi),
    Number(se),
  );
  if (new Date(ms).getUTCDate() !== day) return undefined;
  if (zone !== "Z" && zone !== "z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    ms -=
      sign *
      (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6))) *
      60_000;
  }
  return { ms, fraction: frac };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const two = (n: number): string => String(n).padStart(2, "0");

function dateOf(t: Instant): string {
  const d = new Date(t.ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function minuteOf(t: Instant): string {
  const d = new Date(t.ms);
  return `${dateOf(t)}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
}
function shortMinuteOf(t: Instant): string {
  const d = new Date(t.ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
}
function secondOf(t: Instant, withFraction: boolean): string {
  const d = new Date(t.ms);
  const frac = withFraction && t.fraction ? `.${t.fraction}` : "";
  return `${dateOf(t)}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}${frac} UTC`;
}

const PLACEHOLDER = /\{([a-z_]+)\}/gu;
function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1] ?? "").sort();
}

function readOverlay(r: Reader, v: Json): Record<string, string> {
  const o = r.object(v, "overlay", ["id", "entries"], ["id", "entries"]);
  if (!o) return {};
  r.string(o["id"], "overlay.id", 200);
  const e = r.object(o["entries"], "overlay.entries", Object.keys(BASE), []);
  const out: Record<string, string> = {};
  if (!e) return out;
  for (const [k, text] of Object.entries(e)) {
    const base = Object.hasOwn(BASE, k) ? BASE[k] : undefined;
    const s = r.string(text, `overlay.entries.${k}`);
    if (base === undefined || s === undefined) continue;
    if (placeholders(base).join(",") !== placeholders(s).join(","))
      r.refuse(
        `overlay.entries.${k}`,
        `must use the placeholders ${JSON.stringify(placeholders(base))}`,
      );
    else out[k] = s;
  }
  return out;
}

interface Slot {
  readonly state: SlotState;
  readonly by: string | undefined;
  readonly at: Instant | undefined;
  readonly through: { readonly k: number; readonly n: number } | undefined;
}

function readSlot(r: Reader, v: Json, path: string, needBy: boolean): Slot {
  const o = r.object(v, path, ["state", "by", "at", "through"], ["state"]);
  const state = o
    ? (r.oneOf(o["state"], `${path}.state`, [
        "passed",
        "failed",
        "none",
        "not_checked",
      ] as const) ?? "not_checked")
    : "not_checked";
  const by = o && "by" in o ? r.string(o["by"], `${path}.by`, 200) : undefined;
  const at = o && "at" in o ? r.time(o["at"], `${path}.at`) : undefined;
  let through: Slot["through"];
  if (o && "through" in o) {
    const t = r.object(o["through"], `${path}.through`, ["k", "n"], ["k", "n"]);
    const k = t ? r.count(t["k"], `${path}.through.k`) : undefined;
    const n = t ? r.count(t["n"], `${path}.through.n`) : undefined;
    if (k !== undefined && n !== undefined) {
      if (k > n || n === 0)
        r.refuse(`${path}.through`, "k must be at most n, and n more than 0");
      else through = { k, n };
    }
  }
  if (state === "passed") {
    if (!o || !("at" in o)) r.refuse(path, "a passed slot needs at");
    if (needBy && !(o && "by" in o))
      r.refuse(path, "a passed second-signature slot needs by");
  }
  return { state, by, at, through };
}

interface ReadCheckpoint {
  readonly kind: "checkpoint";
  readonly cut: Instant;
  readonly logSize: number;
  readonly anchor: string;
  readonly signature: CheckStatus;
  readonly witness: Slot;
  readonly second: Slot;
}
interface ReadDeal {
  readonly kind: "deal";
  readonly asked: string;
  readonly outcome: string;
  readonly money: string | undefined;
  readonly opened: Instant;
  readonly last: Instant;
  readonly record: string;
  readonly witness: Slot;
  readonly second: Slot;
}

const EPOCH: Instant = { ms: 0, fraction: "" };

function readRow(
  r: Reader,
  v: Json,
  path: string,
  kind: "checkpoint" | "deal",
): ReadCheckpoint | ReadDeal | undefined {
  if (kind === "checkpoint") {
    const o = r.object(
      v,
      path,
      [
        "kind",
        "cut_at",
        "log_size",
        "anchor",
        "signature",
        "witness",
        "second_signature",
      ],
      [
        "kind",
        "cut_at",
        "log_size",
        "anchor",
        "signature",
        "witness",
        "second_signature",
      ],
    );
    if (!o) return undefined;
    if (o["kind"] !== "checkpoint")
      r.refuse(`${path}.kind`, "must be the page's kind, checkpoint");
    return {
      kind,
      cut: r.time(o["cut_at"], `${path}.cut_at`) ?? EPOCH,
      logSize: r.count(o["log_size"], `${path}.log_size`) ?? 0,
      anchor: r.string(o["anchor"], `${path}.anchor`, 200) ?? "",
      signature:
        r.oneOf(o["signature"], `${path}.signature`, [
          "pass",
          "fail",
          "not_run",
        ] as const) ?? "not_run",
      witness: readSlot(r, o["witness"], `${path}.witness`, false),
      second: readSlot(
        r,
        o["second_signature"],
        `${path}.second_signature`,
        true,
      ),
    };
  }
  const o = r.object(
    v,
    path,
    [
      "kind",
      "asked",
      "outcome",
      "money",
      "opened_at",
      "last_at",
      "record",
      "witness",
      "second_signature",
    ],
    [
      "kind",
      "asked",
      "outcome",
      "opened_at",
      "last_at",
      "record",
      "witness",
      "second_signature",
    ],
  );
  if (!o) return undefined;
  if (o["kind"] !== "deal")
    r.refuse(`${path}.kind`, "must be the page's kind, deal");
  return {
    kind,
    asked: r.string(o["asked"], `${path}.asked`) ?? "",
    outcome: r.string(o["outcome"], `${path}.outcome`, 200) ?? "",
    money:
      "money" in o ? r.string(o["money"], `${path}.money`, 200) : undefined,
    opened: r.time(o["opened_at"], `${path}.opened_at`) ?? EPOCH,
    last: r.time(o["last_at"], `${path}.last_at`) ?? EPOCH,
    record: r.string(o["record"], `${path}.record`, 200) ?? "",
    witness: readSlot(r, o["witness"], `${path}.witness`, false),
    second: readSlot(
      r,
      o["second_signature"],
      `${path}.second_signature`,
      true,
    ),
  };
}

// --- the page --------------------------------------------------------------

const TOP = [
  "view",
  "kind",
  "surface",
  "reader",
  "holder",
  "audience",
  "built_at",
  "checked",
  "outcome",
  "picked",
  "rows",
  "checks",
  "periods",
  "sharing",
  "signer_directory",
  "period",
] as const;

/**
 * The History view's element tree for `input`, or every reason it is
 * refused. `overlay` is a product caller's words (surface `product` only).
 */
export function buildHistoryView(
  input: unknown,
  overlay?: unknown,
):
  | { readonly ok: true; readonly tree: HistoryElement }
  | { readonly ok: false; readonly reasons: readonly string[] } {
  const r = new Reader();
  const o = r.object(input, "input", TOP, [
    "view",
    "kind",
    "surface",
    "reader",
    "holder",
    "audience",
    "built_at",
    "checked",
    "rows",
    "checks",
  ]);
  if (!o) return { ok: false, reasons: r.reasons };
  if (o["view"] !== HISTORY_VIEW)
    r.refuse("input.view", `is not ${HISTORY_VIEW}`);
  const kind =
    r.oneOf(o["kind"], "input.kind", ["checkpoint", "deal"] as const) ??
    "checkpoint";
  const surface =
    r.oneOf(o["surface"], "input.surface", ["neutral", "product"] as const) ??
    "neutral";
  const reader =
    r.oneOf(o["reader"], "input.reader", ["owner", "recipient"] as const) ??
    "recipient";

  let words: Record<string, string> = {};
  if (overlay !== undefined) {
    if (surface !== "product")
      r.refuse("overlay", "a neutral page takes no overlay");
    else words = readOverlay(r, overlay);
  }

  const ho = r.object(
    o["holder"],
    "input.holder",
    ["node", "name", "stream"],
    [],
  );
  const node =
    ho && "node" in ho
      ? r.string(ho["node"], "input.holder.node", 200)
      : undefined;
  const name =
    ho && "name" in ho
      ? r.string(ho["name"], "input.holder.name", 200)
      : undefined;
  const stream =
    ho && "stream" in ho
      ? r.string(ho["stream"], "input.holder.stream", 200)
      : undefined;
  if (kind === "checkpoint" && node === undefined && ho)
    r.refuse(
      "input.holder.node",
      "is missing (a checkpoint page names its node)",
    );

  const au = r.object(
    o["audience"],
    "input.audience",
    ["kind", "for"],
    ["kind"],
  );
  const audienceKind = au
    ? (r.oneOf(au["kind"], "input.audience.kind", [
        "private",
        "shared",
        "anyone",
      ] as const) ?? "anyone")
    : "anyone";
  const audienceFor =
    audienceKind === "shared" && au
      ? r.string(au["for"], "input.audience.for", 200)
      : undefined;
  if (audienceKind !== "shared" && au && "for" in au)
    r.refuse("input.audience.for", "is only for a shared audience");

  const built = r.time(o["built_at"], "input.built_at") ?? EPOCH;
  const ck = r.object(
    o["checked"],
    "input.checked",
    ["where", "by"],
    ["where", "by"],
  );
  const where = ck
    ? (r.oneOf(ck["where"], "input.checked.where", [
        "page",
        "builder",
      ] as const) ?? "builder")
    : "builder";
  const checkedBy = ck
    ? (r.string(ck["by"], "input.checked.by", 200) ?? "")
    : "";

  let outcome: "answered" | "refused" | "unreadable" = "answered";
  let refusedReason: string | undefined;
  if ("outcome" in o) {
    if (kind !== "checkpoint")
      r.refuse("input.outcome", "is only for a checkpoint page");
    const oc = r.object(
      o["outcome"],
      "input.outcome",
      ["kind", "reason"],
      ["kind"],
    );
    if (oc) {
      outcome =
        r.oneOf(oc["kind"], "input.outcome.kind", [
          "answered",
          "refused",
          "unreadable",
        ] as const) ?? "answered";
      if (outcome === "refused")
        refusedReason = r.string(oc["reason"], "input.outcome.reason", 200);
      else if ("reason" in oc)
        r.refuse("input.outcome.reason", "is only for a refused answer");
    }
  }

  const picked =
    "picked" in o ? r.bool(o["picked"], "input.picked") === true : false;
  if (picked && kind !== "deal")
    r.refuse("input.picked", "is only for a deal page");
  if (kind === "deal" && reader === "recipient" && name === undefined)
    r.refuse(
      "input.holder.name",
      "is missing (a deal page shown to someone else names whose it is)",
    );
  else if (picked && name === undefined)
    r.refuse(
      "input.holder.name",
      "is missing (a picked selection names who picked it)",
    );

  const rows: (ReadCheckpoint | ReadDeal)[] = [];
  if (Array.isArray(o["rows"])) {
    if (o["rows"].length > 10_000)
      r.refuse("input.rows", "has more than 10000 rows");
    o["rows"].forEach((row, i) => {
      const read = readRow(r, row, `input.rows[${i}]`, kind);
      if (read) rows.push(read);
    });
    if (outcome !== "answered" && o["rows"].length > 0)
      r.refuse("input.rows", "must be empty unless the node answered");
  } else r.refuse("input.rows", "is not a list");

  const checks: { id: string; status: CheckStatus }[] = [];
  if (Array.isArray(o["checks"])) {
    o["checks"].forEach((c, i) => {
      const path = `input.checks[${i}]`;
      const co = r.object(
        c,
        path,
        ["id", "status", "values"],
        ["id", "status"],
      );
      if (!co) return;
      const id = r.oneOf(co["id"], `${path}.id`, HISTORY_CHECK_IDS);
      const status = r.oneOf(co["status"], `${path}.status`, [
        "pass",
        "fail",
        "not_run",
      ] as const);
      if ("values" in co) {
        const vo = r.object(co["values"], `${path}.values`, [], []);
        if (vo && Object.keys(vo).length > 0)
          r.refuse(
            `${path}.values`,
            "names a placeholder the check's words do not have",
          );
      }
      if (id && checks.some((x) => x.id === id))
        r.refuse(`${path}.id`, "is listed twice");
      if (id && status) checks.push({ id, status });
    });
  } else r.refuse("input.checks", "is not a list");

  const periods: {
    from: Instant;
    to: Instant;
    cells: { what: string; value: string | undefined }[];
  }[] = [];
  if ("periods" in o) {
    if (kind !== "checkpoint")
      r.refuse("input.periods", "is only for a checkpoint page");
    if (Array.isArray(o["periods"]))
      o["periods"].forEach((p, i) => {
        const path = `input.periods[${i}]`;
        const po = r.object(
          p,
          path,
          ["from", "to", "cells"],
          ["from", "to", "cells"],
        );
        if (!po) return;
        const from = r.date(po["from"], `${path}.from`);
        const to = r.date(po["to"], `${path}.to`);
        const cells: { what: string; value: string | undefined }[] = [];
        if (Array.isArray(po["cells"]))
          po["cells"].forEach((c, j) => {
            const co = r.object(
              c,
              `${path}.cells[${j}]`,
              ["what", "value", "withheld"],
              ["what"],
            );
            const what = co
              ? r.string(co["what"], `${path}.cells[${j}].what`, 200)
              : undefined;
            const withheld = co !== null && "withheld" in co;
            if (withheld && co["withheld"] !== true)
              r.refuse(`${path}.cells[${j}].withheld`, "is not true");
            if (co && withheld === "value" in co)
              r.refuse(
                `${path}.cells[${j}]`,
                "carries either a value or withheld: true",
              );
            const value =
              co && "value" in co
                ? r.string(co["value"], `${path}.cells[${j}].value`, 40)
                : undefined;
            if (what !== undefined) cells.push({ what, value });
          });
        else r.refuse(`${path}.cells`, "is not a list");
        if (from && to) periods.push({ from, to, cells });
      });
    else r.refuse("input.periods", "is not a list");
  }

  let sharing: HistorySharing | undefined;
  if (kind === "checkpoint" && !("sharing" in o))
    r.refuse(
      "input.sharing",
      "is missing (a checkpoint page says what its node shares)",
    );
  if ("sharing" in o) {
    if (kind !== "checkpoint")
      r.refuse("input.sharing", "is only for a checkpoint page");
    const keys = [
      "standard_history",
      "history_segments",
      "record_at_completion",
      "adjudications",
      "exchange_corroboration",
      "adjudicate_differing_twins",
      "witnesses",
      "share_deal_half",
      "stranger_safe",
    ];
    const so = r.object(o["sharing"], "input.sharing", keys, []);
    if (so) {
      let witnesses: string[] | undefined;
      if ("witnesses" in so) {
        witnesses = [];
        if (Array.isArray(so["witnesses"]))
          for (const [i, w] of so["witnesses"].entries()) {
            const s = r.string(w, `input.sharing.witnesses[${i}]`, 300);
            if (s !== undefined) witnesses.push(s);
          }
        else r.refuse("input.sharing.witnesses", "is not a list");
      }
      let strangerSafe: string[] | undefined;
      if ("stranger_safe" in so) {
        strangerSafe = [];
        if (Array.isArray(so["stranger_safe"]))
          for (const [i, w] of so["stranger_safe"].entries()) {
            const t = r.string(w, `input.sharing.stranger_safe[${i}]`, 80);
            if (t !== undefined) strangerSafe.push(t);
          }
        else r.refuse("input.sharing.stranger_safe", "is not a list");
      }
      // Every member is optional: one the node does not state stays absent
      // and is drawn as "this node's settings don't say".
      const stated: Record<string, unknown> = {};
      let wrong = false;
      const take = (k: string, parse: () => unknown) => {
        if (!(k in so)) return;
        const v = parse();
        if (v === undefined) wrong = true;
        else stated[k] = v;
      };
      const on = (k: string) =>
        take(k, () => r.bool(so[k], `input.sharing.${k}`));
      const one = (k: string, values: readonly string[]) =>
        take(k, () => r.oneOf(so[k], `input.sharing.${k}`, values));
      on("standard_history");
      one("history_segments", ["off", "counterparties", "peers"]);
      one("record_at_completion", ["counterparty", "off"]);
      one("adjudications", ["deliver_to_subjects", "off"]);
      on("exchange_corroboration");
      on("adjudicate_differing_twins");
      one("share_deal_half", ["counterparty"]);
      if (!wrong)
        sharing = {
          ...(stated as HistorySharing),
          ...(witnesses !== undefined ? { witnesses } : {}),
          ...(strangerSafe !== undefined
            ? { stranger_safe: strangerSafe }
            : {}),
        };
    }
  }

  let directory: string | undefined;
  if ("signer_directory" in o) {
    if (kind !== "deal")
      r.refuse("input.signer_directory", "is only for a deal page");
    directory = r.string(o["signer_directory"], "input.signer_directory", 300);
    if (directory !== undefined && !directory.startsWith("https://"))
      r.refuse("input.signer_directory", "is not an https:// address");
  }

  let period: { from: Instant; to: Instant } | undefined;
  if ("period" in o) {
    const po = r.object(
      o["period"],
      "input.period",
      ["from", "to"],
      ["from", "to"],
    );
    const from = po ? r.date(po["from"], "input.period.from") : undefined;
    const to = po ? r.date(po["to"], "input.period.to") : undefined;
    if (from && to) period = { from, to };
  }

  if (r.reasons.length > 0) return { ok: false, reasons: r.reasons };

  const say = (
    key: string,
    values: Readonly<Record<string, string>> = {},
  ): string => {
    const text = words[key] ?? BASE[key];
    if (text === undefined)
      throw new Error(`history-view: no words for ${key}`);
    return text.replace(PLACEHOLDER, (_, p: string) => {
      const v = values[p];
      if (v === undefined) throw new Error(`history-view: ${key} needs {${p}}`);
      return v;
    });
  };
  const plural = (
    key: string,
    n: number,
    values: Record<string, string> = {},
  ): string =>
    say(`${key}.${n === 1 ? "one" : "other"}`, { n: String(n), ...values });
  const short = (id: string): string => (id.length > 12 ? id.slice(0, 12) : id);

  // One verdict for the page (design note §4).
  const failedCheck = checks.some(
    (c) => c.status === "fail" && !SLOT_CHECKS.has(c.id),
  );
  const failedRow = rows.some(
    (x) => x.kind === "checkpoint" && x.signature === "fail",
  );
  const failed = failedCheck || failedRow;
  const allPass =
    rows.length > 0 &&
    rows.every((x) => x.kind !== "checkpoint" || x.signature === "pass") &&
    checks
      .filter((c) => !SLOT_CHECKS.has(c.id) && c.status !== "not_run")
      .every((c) => c.status === "pass") &&
    (kind === "deal" ||
      checks.some(
        (c) => c.id === "checkpoint_signatures" && c.status === "pass",
      ));
  // "Every signature" only when the answer's own signature and the node's key
  // were checked too; otherwise the verdict names only what passed.
  const passed = (id: string): boolean =>
    checks.some((c) => c.id === id && c.status === "pass");
  const everySignature =
    allPass && passed("envelope_signature") && passed("key_is_node");
  const verdictKey = everySignature ? "verdict.pass.all" : "verdict.pass";
  const chipKey = everySignature
    ? "chip.signatures.pass.all"
    : "chip.signatures.pass";

  const statusOf = (id: string): CheckStatus | undefined =>
    checks.find((c) => c.id === id)?.status;
  const dealRecorded = statusOf("deal_report") === "pass";
  const witnessFailed = statusOf("witness") === "fail";
  const secondFailed = statusOf("second_signature") === "fail";
  // The seal's first lines say how the records are locked; only checks that
  // passed may say it.
  const lockChecked =
    kind === "checkpoint"
      ? statusOf("checkpoint_signatures") === "pass" &&
        statusOf("checkpoint_chain") === "pass" &&
        statusOf("consistency") === "pass"
      : dealRecorded;

  // Header.
  let title: string;
  if (kind === "checkpoint")
    title =
      stream !== undefined
        ? say("header.title.stream", { node: short(node ?? ""), stream })
        : say("header.title.node", { node: short(node ?? "") });
  else if (reader === "owner") title = say("header.title.owner");
  else
    title =
      audienceKind === "shared"
        ? say("header.title.shared", { name: name ?? "" })
        : say("header.title.person", { name: name ?? "" });
  const badge =
    audienceKind === "private"
      ? say("badge.private")
      : audienceKind === "shared"
        ? say("badge.shared", { who: audienceFor ?? "" })
        : say("badge.anyone");
  const header = el(
    "header",
    { class: "cvh-header", "data-history": "header" },
    el("h1", { class: "cvh-title" }, title),
    node !== undefined
      ? el(
          "details",
          { class: "cvh-proof" },
          el("summary", null, say("proof.node", { id: short(node) })),
          el("code", null, node),
        )
      : null,
    period
      ? el(
          "p",
          { class: "cvh-scope" },
          say("scope.period", {
            from: dateOf(period.from),
            to: dateOf(period.to),
          }),
        )
      : null,
    el("p", { class: "cvh-badge", "data-audience": audienceKind }, badge),
    el(
      "p",
      { class: "cvh-built" },
      say(reader === "owner" ? "built.owner" : "built.recipient", {
        at: minuteOf(built),
      }),
    ),
  );

  // Hero.
  const heroLines: string[] = [];
  let drawRows = false;
  if (outcome === "refused") {
    heroLines.push(say("hero.refused"));
    if (refusedReason !== undefined)
      heroLines.push(say("hero.refused.reason", { reason: refusedReason }));
  } else if (outcome === "unreadable") heroLines.push(say("hero.unreadable"));
  else if (failed) heroLines.push(say("hero.failed"));
  else if (rows.length === 0)
    heroLines.push(
      say(kind === "checkpoint" ? "hero.none.checkpoints" : "hero.none.deals"),
    );
  else {
    drawRows = true;
    if (kind === "checkpoint") {
      const cps = rows as ReadCheckpoint[];
      const last = cps.reduce((a, b) => (b.cut.ms > a.cut.ms ? b : a));
      const entries = Math.max(...cps.map((c) => c.logSize));
      heroLines.push(
        plural("hero.checkpoints", cps.length, {
          entries: plural("hero.entries", entries),
          at: shortMinuteOf(last.cut),
          verdict: say(allPass ? verdictKey : "verdict.unchecked"),
        }),
      );
    } else
      heroLines.push(
        picked
          ? plural("hero.deals.picked", rows.length, { name: name ?? "" })
          : plural("hero.deals", rows.length),
      );
  }
  const hero = el(
    "section",
    { class: "cvh-hero", "data-history": "hero" },
    ...heroLines.map((line, i) =>
      el("p", { class: i === 0 ? "cvh-hero-line" : "cvh-hero-note" }, line),
    ),
  );

  // Chips.
  let chips: HistoryElement | null = null;
  if (drawRows) {
    const stamped = rows.filter((x) => x.witness.state === "passed").length;
    const stampChip = witnessFailed
      ? say("chip.timestamped.failed")
      : stamped === 0 && rows.some((x) => x.witness.state === "not_checked")
        ? say("chip.timestamped.unchecked")
        : stamped === 0
          ? say("chip.timestamped.none")
          : stamped === rows.length
            ? say("chip.timestamped.all", { n: String(rows.length) })
            : say("chip.timestamped.some", {
                k: String(stamped),
                n: String(rows.length),
              });
    const items: string[] = [];
    if (kind === "checkpoint") {
      items.push(
        say(allPass ? chipKey : "chip.signatures.unchecked"),
        stampChip,
      );
      const first = (rows as ReadCheckpoint[]).reduce((a, b) =>
        b.cut.ms < a.cut.ms ? b : a,
      );
      items.push(say("chip.started", { date: dateOf(first.cut) }));
    } else {
      if (dealRecorded) items.push(say("chip.recorded"));
      items.push(stampChip);
    }
    chips = el(
      "ul",
      { class: "cvh-chips", "data-history": "chips" },
      ...items.map((t) => el("li", { class: "cvh-chip" }, t)),
    );
  }

  // Rows.
  const slotLine = (s: Slot, second: boolean): string => {
    if (s.state === "passed") {
      const at = s.at ? minuteOf(s.at) : "";
      let line = second
        ? say("slot.second.by", { by: s.by ?? "", at })
        : s.by !== undefined
          ? say("slot.timestamped.by", { at, by: s.by })
          : say("slot.timestamped.at", { at });
      if (s.through && s.through.k < s.through.n)
        line += ` · ${say("slot.part", { k: String(s.through.k), n: String(s.through.n) })}`;
      return line;
    }
    if (s.state === "failed") return say("slot.failed");
    if (s.state === "none")
      return say(second ? "slot.second.none" : "slot.timestamped.none");
    return say("slot.unchecked");
  };
  const stamp = (
    nameKey: string,
    filled: boolean,
    state: string,
    line: string | null,
  ): HistoryElement =>
    el(
      "li",
      {
        class: "cvh-stamp",
        "data-filled": filled ? "yes" : "no",
        "data-state": state,
      },
      el("span", { class: "cvh-stamp-name" }, say(nameKey)),
      line !== null ? el("span", { class: "cvh-stamp-line" }, line) : null,
    );
  const slotStamps = (row: ReadCheckpoint | ReadDeal): HistoryElement[] => [
    stamp(
      "stamp.timestamped",
      row.witness.state === "passed",
      row.witness.state,
      slotLine(row.witness, false),
    ),
    stamp(
      "stamp.second",
      row.second.state === "passed",
      row.second.state,
      slotLine(row.second, true),
    ),
  ];
  const proof = (key: string, id: string): HistoryElement =>
    el(
      "details",
      { class: "cvh-proof" },
      el("summary", null, say(key, { id: short(id) })),
      el("code", null, id),
    );

  let rowList: HistoryElement | null = null;
  if (drawRows) {
    const seconds = new Map<number, number>();
    if (kind === "checkpoint")
      for (const x of rows as ReadCheckpoint[])
        seconds.set(
          Math.floor(x.cut.ms / 1000),
          (seconds.get(Math.floor(x.cut.ms / 1000)) ?? 0) + 1,
        );
    const items = rows.map((x) => {
      if (x.kind === "checkpoint") {
        const tie = (seconds.get(Math.floor(x.cut.ms / 1000)) ?? 0) > 1;
        return el(
          "li",
          { class: "cvh-row", "data-history": "row" },
          el(
            "p",
            { class: "cvh-row-title" },
            say("row.cut", { at: secondOf(x.cut, tie) }),
          ),
          el(
            "p",
            { class: "cvh-row-detail" },
            plural("row.entries", x.logSize),
          ),
          proof("proof.checkpoint", x.anchor),
          el(
            "ul",
            { class: "cvh-stamps" },
            stamp(
              "stamp.recorded",
              x.signature === "pass",
              x.signature,
              x.signature === "pass" ? null : say("stamp.signature.unchecked"),
            ),
            ...slotStamps(x),
          ),
        );
      }
      const detail = [
        x.outcome,
        ...(x.money !== undefined ? [x.money] : []),
        say("row.opened", { at: minuteOf(x.opened) }),
        say("row.last", { at: minuteOf(x.last) }),
      ].join(" · ");
      return el(
        "li",
        { class: "cvh-row", "data-history": "row" },
        el("p", { class: "cvh-row-title" }, x.asked),
        el("p", { class: "cvh-row-detail" }, detail),
        proof("proof.record", x.record),
        el(
          "ul",
          { class: "cvh-stamps" },
          dealRecorded
            ? stamp("stamp.recorded", true, "passed", null)
            : stamp(
                "stamp.recorded",
                false,
                "not_checked",
                say("slot.unchecked"),
              ),
          ...slotStamps(x),
        ),
      );
    });
    rowList = el(
      "section",
      { class: "cvh-rows-block" },
      el(
        "h2",
        null,
        say(
          kind === "checkpoint"
            ? "rows.heading.checkpoints"
            : "rows.heading.deals",
        ),
      ),
      el("ol", { class: "cvh-rows", "data-history": "rows" }, ...items),
    );
  }

  const periodBlock =
    drawRows && periods.length > 0
      ? el(
          "section",
          { class: "cvh-periods", "data-history": "periods" },
          el("h2", null, say("periods.heading")),
          el(
            "ul",
            null,
            ...periods.map((p) =>
              el(
                "li",
                null,
                el(
                  "p",
                  null,
                  say("periods.row", {
                    from: dateOf(p.from),
                    to: dateOf(p.to),
                  }),
                ),
                el(
                  "ul",
                  null,
                  ...p.cells.map((c) =>
                    el(
                      "li",
                      null,
                      c.value === undefined
                        ? say("periods.cell.withheld", { what: c.what })
                        : say("periods.cell", { what: c.what, value: c.value }),
                    ),
                  ),
                ),
              ),
            ),
          ),
        )
      : null;

  const callout =
    outcome === "answered" && !failed
      ? el(
          "aside",
          { class: "cvh-callout", "data-history": "does-not-show" },
          el("h2", null, say("callout.heading")),
          el(
            "p",
            null,
            kind === "checkpoint"
              ? say("callout.checkpoints")
              : picked
                ? say("callout.deals.picked", { name: name ?? "" })
                : say("callout.deals"),
          ),
        )
      : null;

  let shares: HistoryElement | null = null;
  if (sharing) {
    const lines: string[] = [say("shares.summary")];
    // Stated only by a Goose node's policy; a node that does not state them
    // gets no line. They sit right after the first line, which they extend.
    // A token the pack names is drawn by its plain name, any other as it is.
    if (sharing.share_deal_half === "counterparty")
      lines.push(say("shares.dealhalf.counterparty"));
    if (sharing.stranger_safe !== undefined)
      lines.push(
        sharing.stranger_safe.length > 0
          ? say("shares.stranger", {
              items: sharing.stranger_safe
                .map((t) =>
                  KNOWN_STRANGER_TOKENS.includes(t)
                    ? say(`shares.stranger.token.${t}`)
                    : t,
                )
                .join(", "),
            })
          : say("shares.stranger.none"),
      );
    if (sharing.standard_history === undefined)
      lines.push(say("shares.standard.unstated"));
    else
      lines.push(
        say(
          sharing.standard_history
            ? "shares.standard.on"
            : "shares.standard.off",
        ),
      );
    if (sharing.history_segments === "counterparties")
      lines.push(say("shares.segments.counterparties"));
    else if (sharing.history_segments === "peers")
      lines.push(say("shares.segments.peers"));
    else if (sharing.history_segments === "off")
      lines.push(
        sharing.record_at_completion === "counterparty"
          ? `${say("shares.segments.off")} ${say("shares.segments.off.sealed")}`
          : say("shares.segments.off"),
      );
    else lines.push(say("shares.segments.unstated"));
    if (sharing.exchange_corroboration === undefined)
      lines.push(say("shares.corroboration.unstated"));
    else if (sharing.exchange_corroboration)
      lines.push(say("shares.corroboration.on"));
    if (sharing.record_at_completion === undefined)
      lines.push(say("shares.completion.unstated"));
    else
      lines.push(
        say(
          sharing.record_at_completion === "counterparty"
            ? "shares.completion.on"
            : "shares.completion.off",
        ),
      );
    if (sharing.adjudications === undefined)
      lines.push(say("shares.adjudications.unstated"));
    else
      lines.push(
        say(
          sharing.adjudications === "deliver_to_subjects"
            ? "shares.adjudications.on"
            : "shares.adjudications.off",
        ),
      );
    if (sharing.adjudicate_differing_twins === undefined)
      lines.push(say("shares.twins.unstated"));
    else if (sharing.adjudicate_differing_twins)
      lines.push(say("shares.twins.on"));
    if (sharing.witnesses === undefined)
      lines.push(say("shares.witnesses.unstated"));
    else
      lines.push(
        sharing.witnesses.length > 0
          ? say("shares.witnesses", { witnesses: sharing.witnesses.join(", ") })
          : say("shares.witnesses.none"),
      );
    // The signed-request rule is the mesh plugin's, carried by its policy; a
    // policy that states no segments setting does not vouch for it.
    lines.push(
      say(
        sharing.history_segments === undefined
          ? "shares.never.unstated"
          : "shares.never",
      ),
    );
    shares = el(
      "section",
      { class: "cvh-shares", "data-history": "shares" },
      el("h2", null, say("shares.heading")),
      el("ul", null, ...lines.map((l) => el("li", null, l))),
      el(
        "p",
        { class: "cvh-note" },
        say("shares.as_of", { at: minuteOf(built) }),
      ),
    );
  }

  let seal: HistoryElement | null = null;
  {
    const states = drawRows ? rows.map((x) => x.second.state) : [];
    const sealState =
      secondFailed || states.some((s) => s === "failed")
        ? "failed"
        : states.length === 0 || states.some((s) => s === "not_checked")
          ? "not_checked"
          : states.every((s) => s === "none")
            ? "none"
            : "mixed";
    // A failed row must not read as if the whole deal failed: when only some
    // of the countersigned rows failed, the slot gives its scope and points to
    // the rows. Rows nobody countersigned are not part of the count.
    const failedRows = states.filter((s) => s === "failed").length;
    const signedRows = states.filter(
      (s) => s === "failed" || s === "passed",
    ).length;
    const sealLine =
      sealState === "failed"
        ? failedRows > 0 && failedRows < signedRows
          ? say("seal.second.some_failed", {
              k: String(failedRows),
              n: String(signedRows),
            })
          : say("slot.failed")
        : sealState === "none"
          ? say("slot.second.none")
          : sealState === "not_checked"
            ? say("slot.unchecked")
            : say("seal.second.rows");
    seal = el(
      "section",
      { class: "cvh-seal", "data-history": "seal" },
      drawRows && lockChecked
        ? el("p", { class: "cvh-seal-title" }, say("seal.title"))
        : null,
      drawRows && lockChecked
        ? el(
            "p",
            null,
            say(kind === "checkpoint" ? "seal.checkpoints" : "seal.deals"),
          )
        : drawRows
          ? el("p", null, say("seal.unchecked"))
          : null,
      el(
        "p",
        {
          class: "cvh-seal-slot",
          "data-filled": "no",
          "data-state": sealState,
        },
        el("span", { class: "cvh-stamp-name" }, say("seal.second.label")),
        el("span", { class: "cvh-stamp-line" }, sealLine),
      ),
      directory !== undefined
        ? el(
            "p",
            { class: "cvh-note", "data-history": "directory" },
            say("seal.directory", { directory }),
          )
        : null,
    );
  }

  const checkedAttrs: Record<string, string> = {
    class: "cvh-checked",
    "data-history": "checked",
  };
  if (failed || outcome !== "answered") checkedAttrs["open"] = "";
  const panel = el(
    "details",
    checkedAttrs,
    el("summary", null, say("checked.heading")),
    el(
      "ul",
      null,
      ...checks.map((c) =>
        el(
          "li",
          { class: "cvh-check", "data-status": c.status },
          say("check.line", {
            status: say(`status.${c.status}`),
            name: say(`check.${c.id}`),
          }),
        ),
      ),
    ),
    el(
      "p",
      { class: "cvh-note" },
      where === "page"
        ? say("checked.where.page", { by: checkedBy })
        : say("checked.where.builder", { at: minuteOf(built), by: checkedBy }),
    ),
  );

  const tree = el(
    "section",
    {
      class: "cv-history",
      "data-history": "view",
      "data-kind": kind,
      "data-surface": surface,
      "data-verdict": failed ? "failed" : allPass ? "pass" : "unchecked",
    },
    header,
    el("div", { class: "cvh-main" }, hero, chips, rowList, periodBlock),
    el("div", { class: "cvh-side" }, callout, shares, seal, panel),
  );
  return { ok: true, tree };
}

/** The History view as HTML text; throws HistoryViewRefused on a refused input. */
export function historyViewHtml(input: unknown, overlay?: unknown): string {
  const built = buildHistoryView(input, overlay);
  if (!built.ok) throw new HistoryViewRefused(built.reasons);
  return serializeHistoryElement(built.tree);
}

/**
 * Draws the History view into `container`, replacing what it holds. A
 * refused input draws one visible refusal line and returns false.
 */
export function renderHistoryView(
  input: unknown,
  container: Element,
  overlay?: unknown,
): boolean {
  const doc = container.ownerDocument;
  const built = buildHistoryView(input, overlay);
  const node = built.ok
    ? historyElementToDom(built.tree, doc)
    : historyElementToDom(
        el(
          "p",
          { class: "cvh-refused", "data-history": "refused" },
          (BASE["refused"] ?? "").replace("{reasons}", () =>
            built.reasons.join("; "),
          ),
        ),
        doc,
      );
  container.replaceChildren(node);
  return built.ok;
}

/** The view's stylesheet: one column under 900px, two above, and print. */
export const historyViewStyles = `.cv-history{--cvh-ink:#1f2733;--cvh-slate:#6b7482;--cvh-line:#e3ded3;--cvh-cream:#f6f2ea;--cvh-navy:#232f42;--cvh-ok:#2e7d5b;--cvh-bad:#b5462f;font:16px/1.45 system-ui,sans-serif;color:var(--cvh-ink);max-width:1120px;margin:0 auto;padding:16px;display:grid;gap:16px}
.cv-history h1{font-size:22px;margin:0}.cv-history h2{font-size:15px;margin:0 0 8px;color:var(--cvh-navy)}
.cvh-header p{margin:4px 0}.cvh-badge{display:inline-block;border:1px solid var(--cvh-line);border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700;letter-spacing:.02em}
.cvh-badge[data-audience=private]{background:#fbefd9;border-color:#e8a33d}.cvh-built,.cvh-note{color:var(--cvh-slate);font-size:13px}
.cvh-hero-line{font-size:20px;font-weight:700;margin:0}.cvh-hero-note{margin:6px 0 0;color:var(--cvh-slate)}
.cvh-chips{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}.cvh-chip{background:var(--cvh-cream);border-radius:999px;padding:3px 10px;font-size:13px}
.cvh-rows{list-style:none;padding:0;margin:0}.cvh-row{border:1px solid var(--cvh-line);border-radius:10px;padding:10px 12px;margin:0 0 10px}
.cvh-row p{margin:0 0 4px}.cvh-row-title{font-weight:700}.cvh-row-detail{color:var(--cvh-slate);font-size:14px}
.cvh-proof summary{cursor:pointer;font-size:13px;color:var(--cvh-slate)}.cvh-proof code{font-size:12px;word-break:break-all}
.cvh-stamps{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-wrap:wrap;gap:8px}
.cvh-stamp,.cvh-seal-slot{border:2px solid var(--cvh-navy);border-radius:999px;padding:2px 10px;font-size:12px;color:var(--cvh-navy)}
.cvh-stamp[data-filled=no],.cvh-seal-slot[data-filled=no]{border-style:dotted;border-color:#9aa1ab;color:var(--cvh-slate)}
.cvh-stamp[data-state=failed]{border-color:var(--cvh-bad);color:var(--cvh-bad)}
.cvh-stamp-name{font-weight:800}.cvh-stamp-line{margin-left:6px}
.cvh-callout,.cvh-shares,.cvh-seal,.cvh-periods{border:1px solid var(--cvh-line);border-radius:10px;padding:12px}
.cvh-callout{background:var(--cvh-cream)}.cvh-callout p,.cvh-seal p{margin:0 0 6px}.cvh-shares ul,.cvh-periods ul{margin:0;padding-left:18px}
.cvh-seal-title{font-weight:700}.cvh-checked summary{cursor:pointer;font-weight:700;color:var(--cvh-navy)}
.cvh-check[data-status=fail]{color:var(--cvh-bad)}.cvh-check[data-status=pass]{color:var(--cvh-ok)}
.cvh-main,.cvh-side{display:grid;gap:16px;align-content:start}.cvh-refused{border:1px solid var(--cvh-bad);color:var(--cvh-bad);padding:8px 12px;border-radius:8px}
@media (min-width:900px){.cv-history{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}.cvh-header{grid-column:1/-1}}
@media print{.cv-history{max-width:none;grid-template-columns:1fr}.cvh-proof code{display:block}}
`;

/** A whole static page (no script) holding the History view; throws HistoryViewRefused. */
export function historyViewDocument(
  input: unknown,
  overlay?: unknown,
  title = "History",
): string {
  const body = historyViewHtml(input, overlay);
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(title)}</title><style>${historyViewStyles}</style></head><body>${body}</body></html>\n`;
}
