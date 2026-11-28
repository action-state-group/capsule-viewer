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
    /**
     * Only the `witness` check, and only when its status is `not_run`, takes
     * values: `n`, the 1-based place of the checkpoint row the witness has not
     * registered yet, and `at`, that row's own cut time (an RFC 3339 instant the
     * view formats like the row's). Anything else is refused.
     */
    readonly values?: { readonly n: number; readonly at: string };
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

/** The card page's input (#384, design note section 11): a deal page drawn from its signed card bundle. */
export interface HistoryCardInput {
  readonly view: typeof HISTORY_VIEW;
  readonly kind: "deal";
  readonly surface: "neutral" | "product";
  /** `owner` draws Your History from the holder's own copy; `recipient` draws a card someone was sent. */
  readonly reader: "owner" | "recipient";
  readonly holder: { readonly name: string };
  /** `private` with `owner`, `shared` with `recipient`. */
  readonly audience: { readonly kind: "private" | "shared" };
  readonly built_at: string;
  readonly checked: { readonly where: "builder"; readonly by: string };
  readonly rows: readonly [];
  readonly checks: readonly [];
  readonly machine: {
    /** A plain `.json` file name: the download's name and the verify line's argument. */
    readonly file: string;
    /** The card bundle's canonical JSON (RFC 8785); its SHA-256 must be `verify.bundle_digest`. */
    readonly text: string;
    readonly verify: {
      readonly verdict: "VALID" | "INVALID";
      readonly bundle_digest: string;
      readonly checks: Readonly<
        Partial<
          Record<
            | "producer_signatures"
            | "interval_coverage"
            | "graph_closure"
            | "per_record_membership"
            | "checkpoint"
            | "witnesses",
            "pass" | "fail" | "withheld"
          >
        >
      >;
      /** Required exactly when `checks.witnesses` is `pass`. */
      readonly witness?: { readonly by: string; readonly at: string };
    };
  };
  /** Owner only: per deal entry id, what the holder's own book adds. */
  readonly deals?: Readonly<
    Record<
      string,
      {
        readonly item?: string;
        readonly amount?: {
          readonly value: string;
          readonly assetCode: string;
          readonly assetScale: number;
        };
        readonly recorded?: HistorySlot;
        readonly time_stamped?: HistorySlot;
        readonly countersigned?: HistorySlot;
        /** A plain `.html` file name: that deal's receipt page beside this one. */
        readonly receipt?: string;
      }
    >
  >;
  /** How many of the card's deals are sample history. */
  readonly sample?: number;
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

/** An attribute name: the view's own, never caller text. */
const ATTR_NAME = /^[a-zA-Z][a-zA-Z0-9-]*$/u;
/**
 * An attribute value may hold caller-derived text (a file name, a time, a
 * percent-encoded download) only without the characters whose attribute
 * serialization differs between engines; `&` is written as `&amp;`.
 */
const ATTR_VALUE = /^[^<>"\u00a0]*$/u;

function el(
  tag: string,
  attrs: Readonly<Record<string, string>> | null,
  ...children: readonly (HistoryElement | string | null | false)[]
): HistoryElement {
  const pairs = Object.entries(attrs ?? {});
  for (const [name, value] of pairs)
    if (!ATTR_NAME.test(name) || !ATTR_VALUE.test(value))
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
  const attrs = node.attrs
    .map(([n, v]) => ` ${n}="${v.replace(/&/gu, "&amp;")}"`)
    .join("");
  return `<${node.tag}${attrs}>${node.children.map(serializeHistoryElement).join("")}</${node.tag}>`;
}

const SVG_TAGS: ReadonlySet<string> = new Set([
  "svg",
  "path",
  "circle",
  "ellipse",
]);

/** The tree as DOM, text set as text nodes only. */
export function historyElementToDom(
  node: HistoryElement | string,
  doc: Document,
): Node {
  if (typeof node === "string") return doc.createTextNode(node);
  const out = SVG_TAGS.has(node.tag)
    ? doc.createElementNS("http://www.w3.org/2000/svg", node.tag)
    : doc.createElement(node.tag);
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
}

function parseInstant(s: string): Instant | undefined {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?([Zz]|[+-]\d{2}:\d{2})$/u.exec(
      s,
    );
  if (!m) return undefined;
  const [, y, mo, d, h, mi, se, , zone = "Z"] = m;
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
  return { ms };
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

/** The checkpoint a `witness` check says the witness has not registered. */
interface Unregistered {
  readonly n: number;
  readonly at: Instant;
}

/**
 * The witness check's `values`: `n` and `at` must name one of this page's
 * checkpoint rows that is not time-stamped, and `at` is that row's cut time,
 * so the line and the chip cannot name two different checkpoints.
 */
function readUnregistered(
  r: Reader,
  v: Json,
  path: string,
  kind: string | undefined,
  rows: readonly (ReadCheckpoint | ReadDeal)[],
): Unregistered | undefined {
  // An empty object says nothing, as it always did on every check.
  if (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v).length === 0
  )
    return undefined;
  const o = r.object(v, path, ["n", "at"], ["n", "at"]);
  if (!o || !("n" in o) || !("at" in o)) return undefined;
  const n = r.count(o["n"], `${path}.n`);
  const at = r.time(o["at"], `${path}.at`);
  if (kind !== "checkpoint") {
    r.refuse(path, "names a checkpoint, and only a checkpoint page has them");
    return undefined;
  }
  if (n === undefined || at === undefined) return undefined;
  const row = rows[n - 1];
  if (n < 1 || row === undefined || row.kind !== "checkpoint") {
    r.refuse(
      `${path}.n`,
      "is not the place of one of this page's rows (1 to the number of rows)",
    );
    return undefined;
  }
  if (row.witness.state === "passed") {
    r.refuse(`${path}.n`, "names a row whose time-stamp passed");
    return undefined;
  }
  if (row.cut.ms !== at.ms) {
    r.refuse(`${path}.at`, "is not the cut time of row n");
    return undefined;
  }
  return { n, at };
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

const EPOCH: Instant = { ms: 0 };

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

// --- the card page (#384) ---------------------------------------------------
//
// A deal page that carries its signed object (`machine`) is drawn from that
// object: the counts from its card, and on the holder's own copy one row per
// deal entry its x-standard-history/v0 block lists. The caller adds only what
// a deal entry does not carry and the holder's own book does (`deals`, keyed
// by the entry's id), and capsulectl verify's answer, which is bound to the
// object by its bundle digest: the SHA-256 of the object's text, which must be
// the bundle's canonical JSON, as capsulectl reports it.

/** SHA-256 of the UTF-8 bytes of `text`, as lowercase hex (synchronous). */
export function sha256Hex(text: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bytes = new TextEncoder().encode(text);
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
  view.setUint32(padded.length - 4, (len << 3) >>> 0);
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Array<number>(64);
  const rot = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] ?? 0;
      const b = w[i - 2] ?? 0;
      const s0 = rot(a, 7) ^ rot(a, 18) ^ (a >>> 3);
      const s1 = rot(b, 17) ^ rot(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) | 0;
    }
    let [a, b, c, d, e, f, g, k] = h as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let i = 0; i < 64; i++) {
      const t1 =
        (k +
          (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) +
          ((e & f) ^ (~e & g)) +
          (K[i] ?? 0) +
          (w[i] ?? 0)) |
        0;
      const t2 =
        ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) +
          ((a & b) ^ (a & c) ^ (b & c))) |
        0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    const add = [a, b, c, d, e, f, g, k];
    for (let i = 0; i < 8; i++) h[i] = ((h[i] ?? 0) + (add[i] ?? 0)) | 0;
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

/** The term-row statuses of AAC SH §11.2, in the order the page lists them. */
const ROW_STATUSES = [
  "not_reached",
  "not_due",
  "no_statement",
  "waiting",
  "uncontested",
  "agreed_so_far",
  "agreed",
  "in_disagreement",
  "in_dispute",
  "ruled",
] as const;
type RowStatus = (typeof ROW_STATUSES)[number];

interface TermResult {
  readonly holder: boolean;
  readonly status: RowStatus;
  readonly value: "met" | "not_met" | undefined;
  readonly remedy: string | undefined;
}

interface Amount {
  readonly value: string;
  readonly code: string;
  readonly scale: number;
}

interface CardDeal {
  readonly id: string;
  readonly agreed: Instant;
  readonly role: "provided" | "bought";
  readonly amount: Amount | undefined;
  readonly outcome: "held" | "did_not_hold" | "undecided" | undefined;
  readonly terms: readonly TermResult[] | undefined;
  readonly bothHalves: boolean;
}

interface DealExtra {
  readonly item: string | undefined;
  readonly amount: Amount | undefined;
  readonly recorded: Slot | undefined;
  readonly witness: Slot | undefined;
  readonly countersigned: Slot | undefined;
  readonly receipt: string | undefined;
}

/** capsulectl verify's checks the proof panel shows, in the receipt's order. */
const PROOF_CHECKS = [
  "producer_signatures",
  "interval_coverage",
  "graph_closure",
  "per_record_membership",
  "checkpoint",
] as const;

const FILE_JSON = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.json$/u;
const FILE_HTML = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.html$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
// An amount as the standard card reads one (standard_history_card.js VALUE,
// CURRENCY): an exact integer string, an ISO 4217 code or a CAIP-19 asset id,
// a scale 0 to 255.
const DIGITS = /^(0|[1-9][0-9]{0,299})$/u;
const CURRENCY =
  /^(?:[A-Z]{3}|[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128})$/u;

function isObj(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function count(v: Json): number | undefined {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0
    ? v
    : undefined;
}

function readAmount(r: Reader, v: Json, path: string): Amount | undefined {
  const o = r.object(
    v,
    path,
    ["value", "assetCode", "assetScale"],
    ["value", "assetCode", "assetScale"],
  );
  if (!o) return undefined;
  const value = typeof o["value"] === "string" ? o["value"] : "";
  const code = typeof o["assetCode"] === "string" ? o["assetCode"] : "";
  const scale = o["assetScale"];
  if (
    !DIGITS.test(value) ||
    !CURRENCY.test(code) ||
    typeof scale !== "number" ||
    !Number.isSafeInteger(scale) ||
    scale < 0 ||
    scale > 255
  ) {
    r.refuse(
      path,
      "is not an amount (an integer value, an ISO 4217 or CAIP-19 assetCode, assetScale 0 to 255)",
    );
    return undefined;
  }
  return { value, code, scale };
}

/** "1,000" for "1000": thousands with commas. */
function grouped(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}

/**
 * An amount in words: bitcoin amounts as sat, or msat when not a whole sat;
 * any other asset as its decimal value and code.
 */
export function amountText(a: {
  readonly value: string;
  readonly code: string;
  readonly scale: number;
}): string {
  if (a.code === "BTC" && a.scale <= 11) {
    const msat = a.value === "0" ? "0" : a.value + "0".repeat(11 - a.scale);
    if (msat === "0") return "0 sat";
    if (msat.length > 3 && msat.endsWith("000"))
      return `${grouped(msat.slice(0, -3))} sat`;
    return `${grouped(msat)} msat`;
  }
  if (a.scale === 0) return `${grouped(a.value)} ${a.code}`;
  const padded = a.value.padStart(a.scale + 1, "0");
  const whole = padded.slice(0, padded.length - a.scale);
  return `${grouped(whole)}.${padded.slice(padded.length - a.scale)} ${a.code}`;
}

/** What the card page reads from the signed object; refusals go to `r`. */
interface CardObject {
  readonly derivation: string;
  readonly keyId: string;
  readonly signedAt: Instant | undefined;
  readonly outcomes: {
    readonly of: number;
    readonly held: number;
    readonly didNotHold: number;
    readonly undecided: number;
  };
  readonly waiting: number;
  readonly asOf: Instant | undefined;
  readonly deals: readonly CardDeal[] | undefined;
}

function readCardObject(r: Reader, text: string): CardObject | undefined {
  let doc: Json;
  try {
    doc = JSON.parse(text) as Json;
  } catch {
    r.refuse("input.machine.text", "is not JSON");
    return undefined;
  }
  return readCardDoc(r, doc);
}

/** The card object from a parsed bundle (or, for the module page, the verified card set in a bundle's shape). */
function readCardDoc(r: Reader, doc: Json): CardObject | undefined {
  const bad = (why: string): undefined => {
    r.refuse("input.machine.text", why);
    return undefined;
  };
  if (!isObj(doc)) return bad("is not a bundle");
  const records = doc["records"];
  const root = Array.isArray(records) ? records[0] : undefined;
  if (!isObj(root)) return bad("has no root record");
  const cid = root["capsule_id"];
  const disclosures = doc["disclosures"];
  const disclosed =
    typeof cid === "string" && isObj(disclosures)
      ? disclosures[cid]
      : undefined;
  const card = isObj(disclosed) ? disclosed["agent_input"] : undefined;
  if (!isObj(card)) return bad("discloses no card on its root record");
  const derivation = card["derivation"];
  if (
    typeof derivation !== "string" ||
    !/^standard_history\/[1-4]$/u.test(derivation)
  )
    return bad("its card is not a standard_history card");
  const oc = card["outcomes"];
  if (
    isObj(oc) &&
    Object.keys(oc).some(
      (k) => !["of", "held", "did_not_hold", "undecided"].includes(k),
    )
  )
    return bad("its card's outcomes carry a member SH §4 does not have");
  const of = isObj(oc) ? count(oc["of"]) : undefined;
  const held = isObj(oc) ? count(oc["held"]) : undefined;
  const didNotHold = isObj(oc) ? count(oc["did_not_hold"]) : undefined;
  const undecided = isObj(oc) ? count(oc["undecided"]) : undefined;
  if (
    of === undefined ||
    held === undefined ||
    didNotHold === undefined ||
    undecided === undefined ||
    held + didNotHold + undecided !== of
  )
    return bad("its card's outcomes are not a tally");
  const nc = card["not_counted"];
  const waiting = isObj(nc) ? (count(nc["no_witness_time"]) ?? 0) : 0;
  const keyId = typeof root["key_id"] === "string" ? root["key_id"] : "";
  const signedAt =
    typeof root["timestamp"] === "string"
      ? parseInstant(root["timestamp"])
      : undefined;
  const ext = isObj(doc["extensions"])
    ? doc["extensions"]["x-standard-history/v0"]
    : undefined;
  const asOf =
    isObj(ext) &&
    isObj(ext["as_of"]) &&
    typeof ext["as_of"]["anchor_time"] === "string"
      ? parseInstant(ext["as_of"]["anchor_time"])
      : undefined;
  let deals: CardDeal[] | undefined;
  if (isObj(ext) && "deals" in ext) {
    deals = [];
    const list = ext["deals"];
    if (!Array.isArray(list)) return bad("its deals are not a list");
    for (const [i, d] of list.entries()) {
      const path = `input.machine.text deals[${i}]`;
      if (!isObj(d)) {
        r.refuse(path, "is not a deal entry");
        continue;
      }
      const id = typeof d["deal"] === "string" ? d["deal"] : "";
      const agreed =
        typeof d["agreed_at"] === "string"
          ? parseInstant(d["agreed_at"])
          : undefined;
      const role = d["role"];
      if (
        id === "" ||
        id.length > 200 ||
        agreed === undefined ||
        (role !== "provided" && role !== "bought")
      ) {
        r.refuse(path, "has no deal id, agreed time or role");
        continue;
      }
      const amount =
        "amount" in d
          ? readAmount(r, d["amount"], `${path}.amount`)
          : undefined;
      const outcome = d["outcome"];
      let terms: TermResult[] | undefined;
      if (Array.isArray(d["rows"])) {
        terms = [];
        for (const row of d["rows"]) {
          const status = isObj(row) ? row["status"] : undefined;
          const value = isObj(row) ? row["value"] : undefined;
          const remedy = isObj(row) ? row["remedy"] : undefined;
          if (
            !isObj(row) ||
            (row["owed_by"] !== "holder" &&
              row["owed_by"] !== "counterparty") ||
            typeof status !== "string" ||
            !(ROW_STATUSES as readonly string[]).includes(status) ||
            (value !== undefined && value !== "met" && value !== "not_met") ||
            (remedy !== undefined && typeof remedy !== "string")
          ) {
            r.refuse(path, "has a row that is not an SH §11.2 row result");
            continue;
          }
          terms.push({
            holder: row["owed_by"] === "holder",
            status: status as RowStatus,
            value: value as "met" | "not_met" | undefined,
            remedy: remedy as string | undefined,
          });
        }
      }
      deals.push({
        id,
        agreed,
        role,
        amount,
        outcome:
          outcome === "held" ||
          outcome === "did_not_hold" ||
          outcome === "undecided"
            ? outcome
            : undefined,
        terms,
        bothHalves: d["happened"] === "stamped_by_both",
      });
    }
  }
  return {
    derivation,
    keyId,
    signedAt,
    outcomes: { of, held, didNotHold, undecided },
    waiting,
    asOf,
    deals,
  };
}

const CARD_TOP = [
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
  "machine",
  "deals",
  "sample",
] as const;

/** The card page's element tree, or every reason it is refused. */
function buildCardPage(
  r: Reader,
  o: Record<string, Json>,
  overlay: unknown,
):
  | { readonly ok: true; readonly tree: HistoryElement }
  | { readonly ok: false; readonly reasons: readonly string[] } {
  for (const k of Object.keys(o))
    if (!(CARD_TOP as readonly string[]).includes(k))
      r.refuse(`input.${k}`, "is not a member of a card page");
  if (o["kind"] !== "deal")
    r.refuse("input.kind", "a card page is a deal page");
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
  const ho = r.object(o["holder"], "input.holder", ["name"], ["name"]);
  const name = ho ? r.string(ho["name"], "input.holder.name", 200) : undefined;
  const au = r.object(o["audience"], "input.audience", ["kind"], ["kind"]);
  const audience = au
    ? r.oneOf(au["kind"], "input.audience.kind", ["private", "shared"] as const)
    : undefined;
  if (reader === "owner" && audience !== undefined && audience !== "private")
    r.refuse("input.audience.kind", "the holder's own page is private");
  if (reader === "recipient" && audience !== undefined && audience !== "shared")
    r.refuse("input.audience.kind", "a card someone was sent is shared");
  const built = r.time(o["built_at"], "input.built_at") ?? EPOCH;
  const ck = r.object(
    o["checked"],
    "input.checked",
    ["where", "by"],
    ["where", "by"],
  );
  if (ck) {
    r.oneOf(ck["where"], "input.checked.where", ["builder"] as const);
    r.string(ck["by"], "input.checked.by", 200);
  }
  if (!Array.isArray(o["rows"]) || o["rows"].length > 0)
    r.refuse(
      "input.rows",
      "must be empty: a card page reads its rows from its object",
    );
  if (!Array.isArray(o["checks"]) || o["checks"].length > 0)
    r.refuse(
      "input.checks",
      "must be empty: a card page shows capsulectl verify's checks",
    );
  const sample =
    "sample" in o ? r.count(o["sample"], "input.sample") : undefined;

  // The object and capsulectl verify's answer on it.
  const mo = r.object(
    o["machine"],
    "input.machine",
    ["file", "text", "verify"],
    ["file", "text", "verify"],
  );
  const file = mo ? r.string(mo["file"], "input.machine.file", 160) : undefined;
  if (file !== undefined && !FILE_JSON.test(file))
    r.refuse("input.machine.file", "is not a plain .json file name");
  const text = mo
    ? r.string(mo["text"], "input.machine.text", 16_000_000)
    : undefined;
  const vo = mo
    ? r.object(
        mo["verify"],
        "input.machine.verify",
        ["verdict", "bundle_digest", "checks", "witness"],
        ["verdict", "bundle_digest", "checks"],
      )
    : null;
  const verdict = vo
    ? r.oneOf(vo["verdict"], "input.machine.verify.verdict", [
        "VALID",
        "INVALID",
      ] as const)
    : undefined;
  const digest = vo
    ? r.string(vo["bundle_digest"], "input.machine.verify.bundle_digest", 64)
    : undefined;
  if (digest !== undefined && !HEX64.test(digest))
    r.refuse("input.machine.verify.bundle_digest", "is not 64 lowercase hex");
  if (text !== undefined && digest !== undefined && sha256Hex(text) !== digest)
    r.refuse(
      "input.machine.text",
      "is not the bundle capsulectl verify answered for (its SHA-256 is not the bundle_digest)",
    );
  const proof: Record<string, "pass" | "fail" | "withheld"> = {};
  const cko = vo
    ? r.object(
        vo["checks"],
        "input.machine.verify.checks",
        [...PROOF_CHECKS, "witnesses"],
        [],
      )
    : null;
  if (cko)
    for (const [k, v] of Object.entries(cko)) {
      const s = r.oneOf(v, `input.machine.verify.checks.${k}`, [
        "pass",
        "fail",
        "withheld",
      ] as const);
      if (s) proof[k] = s;
    }
  let witnessBy: string | undefined;
  let witnessAt: Instant | undefined;
  if (vo && "witness" in vo) {
    const wo = r.object(
      vo["witness"],
      "input.machine.verify.witness",
      ["by", "at"],
      ["by", "at"],
    );
    witnessBy = wo
      ? r.string(wo["by"], "input.machine.verify.witness.by", 200)
      : undefined;
    witnessAt = wo
      ? r.time(wo["at"], "input.machine.verify.witness.at")
      : undefined;
  }
  if (proof["witnesses"] === "pass" && witnessAt === undefined)
    r.refuse(
      "input.machine.verify.witness",
      "is missing (a passed witness check names its witness and time)",
    );
  if (proof["witnesses"] !== "pass" && vo && "witness" in vo)
    r.refuse(
      "input.machine.verify.witness",
      "is only for a passed witness check",
    );

  const obj = text !== undefined ? readCardObject(r, text) : undefined;
  if (obj && reader === "recipient" && obj.deals !== undefined)
    r.refuse(
      "input.machine.text",
      "carries the holder's deal entries; a card someone was sent never does",
    );
  if (obj && reader === "owner" && obj.deals === undefined)
    r.refuse(
      "input.machine.text",
      "carries no deal entries; the holder's own page is drawn from its own copy",
    );

  // What the holder's own book adds per deal.
  const extras = new Map<string, DealExtra>();
  if ("deals" in o) {
    if (reader !== "owner")
      r.refuse("input.deals", "is only for the holder's own page");
    const dm = r.object(
      o["deals"],
      "input.deals",
      obj?.deals?.map((d) => d.id) ?? [],
      [],
    );
    if (dm)
      for (const [id, v] of Object.entries(dm)) {
        const path = `input.deals.${id}`;
        const e = r.object(
          v,
          path,
          [
            "item",
            "amount",
            "recorded",
            "time_stamped",
            "countersigned",
            "receipt",
          ],
          [],
        );
        if (!e) continue;
        const receipt =
          "receipt" in e
            ? r.string(e["receipt"], `${path}.receipt`, 160)
            : undefined;
        if (receipt !== undefined && !FILE_HTML.test(receipt))
          r.refuse(`${path}.receipt`, "is not a plain .html file name");
        extras.set(id, {
          item:
            "item" in e ? r.string(e["item"], `${path}.item`, 300) : undefined,
          amount:
            "amount" in e
              ? readAmount(r, e["amount"], `${path}.amount`)
              : undefined,
          recorded:
            "recorded" in e
              ? readSlot(r, e["recorded"], `${path}.recorded`, false)
              : undefined,
          witness:
            "time_stamped" in e
              ? readSlot(r, e["time_stamped"], `${path}.time_stamped`, true)
              : undefined,
          countersigned:
            "countersigned" in e
              ? readSlot(r, e["countersigned"], `${path}.countersigned`, true)
              : undefined,
          receipt,
        });
      }
  }

  if (r.reasons.length > 0 || !obj || name === undefined)
    return {
      ok: false,
      reasons: r.reasons.length > 0 ? r.reasons : ["input: no card"],
    };
  const parts = drawCardParts({
    owner: reader === "owner",
    words,
    name,
    obj,
    extras,
    sample,
    failed: verdict !== "VALID",
    machine: {
      text: text ?? "",
      file: file ?? "",
      verdict: verdict ?? "",
      digest: digest ?? "",
      proof,
      witnessBy,
      witnessAt,
      built,
    },
  });
  const owner = reader === "owner";
  const tree = el(
    "section",
    {
      class: "cv-history cvh-card",
      "data-history": "view",
      "data-kind": "deal",
      "data-surface": surface,
      "data-perspective": owner ? "yours" : "theirs",
      "data-verdict": parts.failed ? "failed" : "pass",
    },
    parts.header,
    el(
      "div",
      { class: "cvh-main" },
      parts.hero,
      parts.rows,
      owner ? null : parts.signed,
    ),
    el(
      "div",
      { class: "cvh-side" },
      parts.proof,
      parts.notProven,
      owner ? parts.signed : null,
    ),
    el("div", { class: "cvh-wide" }, parts.technical, parts.footer),
  );
  return { ok: true, tree };
}

/** What the caller's page shows beside the card: capsulectl verify's answer and the object's bytes. */
interface MachineFrame {
  readonly text: string;
  readonly file: string;
  readonly verdict: string;
  readonly digest: string;
  readonly proof: Readonly<Record<string, "pass" | "fail" | "withheld">>;
  readonly witnessBy: string | undefined;
  readonly witnessAt: Instant | undefined;
  readonly built: Instant;
}

/** What the module's page shows beside the card: the checks this page ran on it (history-view-module.ts). */
export interface ModuleFrame {
  readonly state:
    | "card"
    | "refused"
    | "unreadable"
    | "unverified"
    | "signature_failed";
  readonly signature: {
    readonly status: "PASS" | "FAIL" | "NOT_PRESENT" | "NOT_CHECKED";
    readonly key: string | null;
  };
  readonly properties: Readonly<Record<string, string>> | undefined;
  readonly fails: readonly string[];
  readonly skipped: readonly string[];
  readonly held:
    | {
        readonly policy: boolean;
        readonly as_of: boolean;
        readonly deals: boolean;
      }
    | undefined;
  readonly witness:
    | {
        readonly status: string;
        readonly shown: boolean;
        readonly witness?: string;
        readonly at?: number | null;
      }
    | undefined;
  readonly registration:
    | {
        readonly status: string;
        readonly shown: boolean;
        readonly service?: string;
        readonly at?: number | null;
      }
    | undefined;
}

/**
 * One card page's inputs: the card object and either the caller's
 * `machine` (the shaped-input page) or the module's checks. A module page has
 * no holder name (no sealed record holds one, evidencebook#1031).
 */
interface CardFrame {
  readonly owner: boolean;
  readonly words: Readonly<Record<string, string>>;
  readonly name: string | undefined;
  readonly obj: CardObject;
  readonly extras: ReadonlyMap<string, DealExtra>;
  readonly sample: number | undefined;
  /** No counts are drawn. */
  readonly failed: boolean;
  readonly machine?: MachineFrame;
  readonly module?: ModuleFrame;
}

/** The card page's parts; the caller's page and the module place them. */
interface CardParts {
  readonly failed: boolean;
  readonly header: HistoryElement | null;
  readonly hero: HistoryElement;
  readonly rows: HistoryElement | null;
  readonly signed: HistoryElement;
  readonly proof: HistoryElement;
  readonly notProven: HistoryElement;
  readonly technical: HistoryElement;
  readonly footer: HistoryElement | null;
}

function drawCardParts(f: CardFrame): CardParts {
  const { owner, words, name, obj, extras, sample, failed } = f;
  const m = f.machine;
  const mod = f.module;
  // The caller's page's own inputs; on a module page they are absent and the
  // parts that read them are not placed.
  const proof: Readonly<Record<string, "pass" | "fail" | "withheld">> =
    m?.proof ?? {};
  const witnessBy = m?.witnessBy;
  const witnessAt = m?.witnessAt;
  const digest = m?.digest;
  const verdict = m?.verdict;
  const file = m?.file;

  const say = (
    key: string,
    values: Readonly<Record<string, string>> = {},
  ): string => {
    const t = words[key] ?? BASE[key];
    if (t === undefined) throw new Error(`history-view: no words for ${key}`);
    return t.replace(PLACEHOLDER, (_, p: string) => {
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
    say(`${key}.${n === 1 ? "one" : "other"}`, {
      n: grouped(String(n)),
      ...values,
    });
  const short = (id: string): string =>
    id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
  // A time the scripted page rewrites into the reader's zone.
  const time = (t: Instant): HistoryElement =>
    el(
      "time",
      { datetime: new Date(t.ms).toISOString(), "data-time": "minute" },
      minuteOf(t),
    );
  // Header: title, tag, download (the caller's page only: on a module page
  // the core runtime draws the page's title and the bundle's download).
  const download = m
    ? el(
        "a",
        {
          class: "cvh-button",
          href: `data:application/json;charset=utf-8,${encodeURIComponent(m.text)}`,
          download: m.file,
          "data-history": "download",
        },
        say(owner ? "card.download.private" : "card.download"),
      )
    : null;
  const header = !m
    ? null
    : el(
        "header",
        { class: "cvh-header", "data-history": "header" },
        el(
          "h1",
          { class: "cvh-title" },
          owner
            ? say("card.title.owner")
            : say("card.title.recipient", { name: name ?? "" }),
        ),
        el(
          "p",
          { class: "cvh-tags" },
          el(
            "span",
            { class: "cvh-tag", "data-audience": owner ? "private" : "shared" },
            say(owner ? "card.tag.private" : "card.tag.shared"),
          ),
          download,
        ),
      );

  // The top line: the card's counts, as its holder reported them.
  const oc = obj.outcomes;
  const counts =
    oc.of === 0
      ? say("card.counts.none")
      : plural("card.counts", oc.of) +
        (oc.didNotHold === 0 && oc.undecided === 0
          ? say(oc.of === 1 ? "card.counts.all.one" : "card.counts.all")
          : say("card.counts.didnt", { k: grouped(String(oc.didNotHold)) }) +
            (oc.undecided > 0
              ? say("card.counts.open", { u: grouped(String(oc.undecided)) })
              : ""));
  const heroLines: (HistoryElement | null)[] = failed
    ? [
        el(
          "p",
          { class: "cvh-hero-line", "data-history": "top-line" },
          say(mod ? `card.module.${mod.state}` : "card.failed"),
        ),
        ...(mod?.state === "refused"
          ? [
              el(
                "ul",
                { class: "cvh-note", "data-history": "fails" },
                ...mod.fails.map((p) =>
                  el("li", null, say(`card.module.property.${p}`)),
                ),
              ),
            ]
          : []),
      ]
    : [
        el("p", { class: "cvh-hero-line", "data-history": "top-line" }, counts),
        el(
          "p",
          { class: "cvh-hero-note" },
          owner
            ? say("card.reported.owner")
            : name === undefined
              ? say("card.reported.unnamed")
              : say("card.reported", { name }),
        ),
        obj.waiting > 0
          ? el(
              "p",
              { class: "cvh-hero-note" },
              plural("card.waiting", obj.waiting),
            )
          : null,
        sample !== undefined && sample > 0
          ? el(
              "p",
              { class: "cvh-hero-note", "data-history": "sample" },
              plural("card.sample", sample),
            )
          : null,
        obj.asOf !== undefined
          ? el(
              "p",
              { class: "cvh-hero-note" },
              say("card.as_of.before"),
              time(obj.asOf),
              say("card.as_of.after"),
            )
          : null,
      ];
  const hero = el(
    "section",
    { class: "cvh-hero", "data-history": "hero" },
    ...heroLines,
  );

  // The rows: the holder's own deals, newest first.
  let rowList: HistoryElement | null = null;
  if (owner && !failed && obj.deals !== undefined && obj.deals.length > 0) {
    const sorted = [...obj.deals].sort(
      (a, b) =>
        b.agreed.ms - a.agreed.ms || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const stamp = (
      nameKey: string,
      state: string,
      line: (HistoryElement | string)[],
    ): HistoryElement =>
      el(
        "li",
        {
          class: "cvh-stamp",
          "data-filled": state === "filled" ? "yes" : "no",
          "data-state": state,
        },
        el("span", { class: "cvh-stamp-name" }, say(nameKey)),
        el("span", { class: "cvh-stamp-line" }, ...line),
      );
    const slotState = (s: Slot | undefined): string =>
      s === undefined || s.state === "not_checked"
        ? "not_checked"
        : s.state === "passed"
          ? s.through !== undefined && s.through.k < s.through.n
            ? "partial"
            : "filled"
          : s.state === "failed"
            ? "failed"
            : "open";
    const items = sorted.map((d) => {
      const x = extras.get(d.id);
      // No sealed record names the other side yet (evidencebook#1031), so the
      // row never names them (Sherlock2, #384 point 1).
      const title = say(
        d.role === "bought" ? "card.row.bought" : "card.row.sold",
      );
      // The row's top line, from its term results (SH §11.2) or, on a /1 or /2
      // card, its outcome. A History row has no settlement facts, so it never
      // says "settled" and never draws the Done seal.
      let line: string;
      let seal = false;
      const t = d.terms;
      if (t !== undefined && t.length > 0) {
        const ruled = t.find(
          (x) => x.status === "ruled" && x.value === "not_met",
        );
        if (ruled) {
          seal = true;
          line = say("card.row.ruled", {
            term: say(ruled.holder ? "card.term.yours" : "card.term.theirs"),
          });
          if (
            ruled.remedy === "made" ||
            ruled.remedy === "due" ||
            ruled.remedy === "not_honoured"
          )
            line += say(`card.row.remedy.${ruled.remedy}`);
        } else if (t.some((x) => x.status === "in_dispute"))
          line = say("card.row.in_dispute");
        else if (t.some((x) => x.status === "in_disagreement"))
          line = say("card.row.in_disagreement");
        else if (
          t.some(
            (x) =>
              x.value === "not_met" &&
              (x.status === "agreed" ||
                x.status === "agreed_so_far" ||
                x.status === "uncontested"),
          )
        ) {
          const stated = t.find(
            (x) =>
              x.value === "not_met" &&
              (x.status === "agreed" ||
                x.status === "agreed_so_far" ||
                x.status === "uncontested"),
          );
          line = say("card.row.not_met", {
            term: say(stated?.holder ? "card.term.yours" : "card.term.theirs"),
          });
          if (stated?.remedy === "made") line += say("card.row.remedy.made");
        } else if (t.every((x) => x.status === "agreed" && x.value === "met"))
          line = say("card.row.went");
        else if (
          t.every(
            (x) =>
              (x.status === "agreed" ||
                x.status === "uncontested" ||
                x.status === "ruled") &&
              x.value === "met",
          )
        )
          line = say("card.row.went.final");
        else if (t.every((x) => x.status === "not_due"))
          line = say("card.row.not_due");
        else if (t.every((x) => x.status === "not_reached"))
          line = say("card.row.not_reached");
        else line = say("card.row.open");
      } else
        line = say(
          d.outcome === "held"
            ? "card.row.outcome.held"
            : d.outcome === "did_not_hold"
              ? "card.row.outcome.did_not_hold"
              : "card.row.outcome.undecided",
        );
      const amount = x?.amount ?? d.amount;
      const facts: (HistoryElement | string)[] = [];
      const exact = x?.amount !== undefined || d.terms === undefined;
      // A band whose floor is 0 says nothing about the amount (Sherlock2).
      if (amount !== undefined && (exact || amount.value !== "0"))
        facts.push(
          exact
            ? amountText(amount)
            : say("card.row.amount.band", { amount: amountText(amount) }),
          " · ",
        );
      facts.push(say("card.row.agreed"), " ", time(d.agreed));
      // A side with more than one term numbers them, so the reader can tell
      // them apart (Sherlock2).
      const sides = { yours: 0, theirs: 0 };
      const many = (holder: boolean): boolean =>
        (t ?? []).filter((x) => x.holder === holder).length > 1;
      const label = (holder: boolean): string => {
        const side = holder ? "yours" : "theirs";
        sides[side] += 1;
        return many(holder)
          ? say(`card.term.${side}.label.n`, { n: String(sides[side]) })
          : say(`card.term.${side}.label`);
      };
      const termLine =
        t !== undefined && t.length > 0
          ? [...t]
              .sort((a, b) => (a.holder === b.holder ? 0 : a.holder ? -1 : 1))
              .map(
                (x) =>
                  `${label(x.holder)}: ${say(
                    x.value === "not_met" &&
                      x.status !== "ruled" &&
                      BASE[`card.status.${x.status}.not_met`] !== undefined
                      ? `card.status.${x.status}.not_met`
                      : `card.status.${x.status}`,
                  )}${x.status === "ruled" && x.value !== undefined ? say(`card.status.ruled.${x.value}`) : ""}`,
              )
              .join("; ")
          : null;
      // A slot that covers part of the deal's steps says how far, and is not
      // drawn filled (the receipt's partial stamp).
      const part = (
        key: string,
        s: Slot | undefined,
      ): (HistoryElement | string)[] =>
        s?.through !== undefined && s.at !== undefined
          ? [
              say(key, { k: String(s.through.k), n: String(s.through.n) }),
              " · ",
              time(s.at),
            ]
          : [];
      const rec = x?.recorded;
      const recState = slotState(rec);
      const recLine =
        recState === "partial"
          ? part("card.stamp.recorded.partial", rec)
          : recState === "filled" && rec?.at
            ? [say("card.stamp.recorded.filled"), " · ", time(rec.at)]
            : [say(`card.stamp.recorded.${recState}`)];
      const ts = x?.witness;
      const tsState = slotState(ts);
      const tsLine =
        tsState === "partial"
          ? [
              `${ts?.by ?? ""} · `,
              ...part("card.stamp.time_stamped.partial", ts),
            ]
          : tsState === "filled" && ts?.at
            ? [`${ts.by ?? ""} · `, time(ts.at)]
            : [say(`card.stamp.time_stamped.${tsState}`)];
      const cs = x?.countersigned;
      const csState = slotState(cs);
      const csLine =
        csState === "partial"
          ? [
              say("card.stamp.countersigned.by", { signer: cs?.by ?? "" }),
              " · ",
              ...part("card.stamp.countersigned.partial", cs),
            ]
          : csState === "filled" && cs?.at
            ? [
                say("card.stamp.countersigned.by", { signer: cs.by ?? "" }),
                " · ",
                time(cs.at),
                say("card.stamp.countersigned.clock"),
              ]
            : [say(`card.stamp.countersigned.${csState}`)];
      return el(
        "li",
        {
          class: "cvh-row",
          "data-history": "row",
          "data-deal-state": seal ? "not_as_agreed" : "plain",
        },
        el(
          "div",
          { class: "cvh-row-head" },
          seal ? sealSvg("not_as_agreed") : null,
          el(
            "div",
            null,
            el("p", { class: "cvh-row-title" }, title),
            x?.item !== undefined
              ? el("p", { class: "cvh-row-item" }, x.item)
              : null,
            el(
              "p",
              { class: "cvh-row-line", "data-history": "row-line" },
              line,
            ),
            seal
              ? el("p", { class: "cvh-sr" }, say("card.seal.not_as_agreed"))
              : null,
          ),
        ),
        el("p", { class: "cvh-row-detail" }, ...facts),
        termLine !== null
          ? el("p", { class: "cvh-row-detail" }, termLine)
          : null,
        d.bothHalves
          ? el(
              "p",
              { class: "cvh-row-detail", "data-history": "both-halves" },
              say("card.row.both_halves"),
            )
          : null,
        // A module page has nothing to fill a row's stamps with (the
        // holder's book is not in the bundle), so it draws none.
        mod
          ? null
          : el(
              "ul",
              { class: "cvh-stamps" },
              stamp("card.stamp.recorded", recState, recLine),
              stamp("card.stamp.time_stamped", tsState, tsLine),
              stamp("card.stamp.countersigned", csState, csLine),
            ),
        x?.receipt !== undefined
          ? el(
              "p",
              null,
              el(
                "a",
                {
                  class: "cvh-link",
                  href: x.receipt,
                  "data-history": "receipt",
                },
                say("card.row.receipt"),
              ),
            )
          : null,
      );
    });
    rowList = el(
      "section",
      { class: "cvh-rows-block" },
      el("h2", null, say("card.rows.heading")),
      el("ol", { class: "cvh-rows", "data-history": "rows" }, ...items),
    );
  }

  // Who signed the card, and what that shows. The caller's page takes
  // capsulectl verify's signature check; the module's page its own
  // (readerCardSignature, the root record's strict verdict).
  const sig: "pass" | "fail" | "absent" | "none" = m
    ? (m.proof["producer_signatures"] ?? "absent") === "pass"
      ? "pass"
      : m.proof["producer_signatures"] === "fail"
        ? "fail"
        : "absent"
    : mod?.signature.status === "PASS"
      ? "pass"
      : mod?.signature.status === "FAIL"
        ? "fail"
        : mod?.signature.status === "NOT_PRESENT"
          ? "none"
          : "absent";
  const signerKey =
    mod?.signature.status === "PASS" && mod.signature.key !== null
      ? mod.signature.key
      : obj.keyId;
  const signed = el(
    "section",
    { class: "cvh-panel", "data-history": "signed" },
    el("h2", null, say("card.signed.heading")),
    el(
      "p",
      null,
      // "Signed by" only when the signature check passed; otherwise the page
      // names the signer the card claims. The signature proves the key, not
      // the name: the name stays a label.
      say(
        (sig === "pass" ? "card.signed.by" : "card.signed.claimed") +
          (owner ? ".owner" : name === undefined ? ".unnamed" : ""),
        name === undefined
          ? { key: short(signerKey) }
          : { name, key: short(signerKey) },
      ),
      ...(obj.signedAt !== undefined ? [" · ", time(obj.signedAt)] : []),
    ),
    // What the signature shows is said only when the check passed.
    el(
      "p",
      {
        class: "cvh-note",
        "data-signature": m
          ? (m.proof["producer_signatures"] ?? "absent")
          : (mod?.signature.status ?? "NOT_CHECKED"),
      },
      say(
        sig === "pass"
          ? "card.signed.note"
          : m
            ? sig === "fail"
              ? "card.signed.failed"
              : "card.signed.unchecked"
            : sig === "none"
              ? "card.module.signed.none"
              : "card.module.signed.unchecked",
      ),
    ),
  );

  // "Is this record intact?": capsulectl verify's own answer per check.
  const statuses = PROOF_CHECKS.map((c) => proof[c]);
  const lede = failed
    ? "card.proof.lede.failed"
    : statuses.some((s) => s === "fail") || proof["witnesses"] === "fail"
      ? "card.proof.lede.failed"
      : statuses.every((s) => s === "pass")
        ? "card.proof.lede.passed"
        : "card.proof.lede.partial";
  const proofRow = (
    code: string,
    status: string,
    label: (HistoryElement | string)[],
  ): HistoryElement =>
    el(
      "li",
      {
        class: "cvh-proof-row",
        "data-check": code,
        "data-check-status": status,
      },
      el(
        "span",
        { class: "cvh-mark", "data-status": status },
        status === "pass" ? "✓" : status === "fail" ? "✗" : "–",
      ),
      el(
        "span",
        null,
        el(
          "span",
          { class: "cvh-sr" },
          `${say(`card.proof.status.${status}`)}: `,
        ),
        el("span", null, ...label),
        " ",
        el("code", { class: "cvh-code" }, code.replace(/_/gu, " ")),
      ),
    );
  const witnessStatus = proof["witnesses"] ?? "absent";
  const proofRows = [
    ...PROOF_CHECKS.map((c) =>
      proofRow(c, proof[c] ?? "absent", [say(`card.proof.${c}`)]),
    ),
    proofRow(
      "witnesses",
      witnessStatus,
      witnessStatus === "pass" && witnessAt !== undefined
        ? [
            say("card.proof.witness.filled", { witness: witnessBy ?? "" }),
            " ",
            time(witnessAt),
          ]
        : [
            say(
              witnessStatus === "fail"
                ? "card.proof.witness.failed"
                : "card.proof.witness.open",
            ),
          ],
    ),
  ];
  const command = `capsulectl verify --bundle ${file ?? ""}`;
  const callerProof = el(
    "section",
    { class: "cvh-panel", "data-history": "proof" },
    el("h2", null, say("card.proof.heading")),
    el(
      "p",
      { class: "cvh-note", "data-proof": lede.split(".").pop() ?? "" },
      say(lede),
    ),
    el("ul", { class: "cvh-proof-list" }, ...proofRows),
    el(
      "div",
      { class: "cvh-check", "data-history": "check" },
      el("p", { class: "cvh-check-title" }, say("card.check.title")),
      el("p", { class: "cvh-note" }, say("card.check.download")),
      el(
        "pre",
        { class: "cvh-command" },
        el("code", { "data-verify-command": "download" }, command),
      ),
      el(
        "p",
        { class: "cvh-note", "data-expect": digest ?? "" },
        say("card.check.expect", {
          verdict: verdict ?? "",
          fingerprint: short(digest ?? ""),
        }),
      ),
    ),
  );

  const proofPanel = mod ? moduleChecks(mod, say, time) : callerProof;

  const notProven = el(
    "section",
    { class: "cvh-panel cvh-callout", "data-history": "does-not-show" },
    el("h2", null, say("card.not_proven.heading")),
    el(
      "ul",
      null,
      el(
        "li",
        null,
        owner
          ? say("card.not_proven.true.owner")
          : name === undefined
            ? // "Only that its holder signed" only when this page checked the signature.
              say(
                sig === "pass"
                  ? "card.not_proven.true.unnamed"
                  : sig === "none"
                    ? "card.module.not_proven.true.unsigned.none"
                    : "card.module.not_proven.true.unsigned",
              )
            : say("card.not_proven.true", { name }),
      ),
      el(
        "li",
        null,
        owner
          ? say("card.not_proven.who.owner")
          : say("card.not_proven.who", name === undefined ? {} : { name }),
      ),
      el("li", null, say("card.not_proven.outside")),
    ),
  );

  const technical = el(
    "details",
    { class: "cvh-technical", "data-history": "technical" },
    el("summary", null, say("card.technical")),
    el(
      "dl",
      null,
      el("dt", null, say("card.technical.card")),
      el("dd", null, el("code", null, obj.derivation)),
      el("dt", null, say("card.technical.key")),
      el("dd", null, el("code", null, obj.keyId)),
      // The proof fingerprint is capsulectl verify's (the caller's page only).
      ...(m
        ? [
            el("dt", null, say("card.technical.digest")),
            el("dd", null, el("code", null, digest ?? "")),
          ]
        : []),
      ...(owner && obj.deals !== undefined
        ? [
            el("dt", null, say("card.technical.deals")),
            el(
              "dd",
              null,
              ...obj.deals.map((d) => el("code", { class: "cvh-id" }, d.id)),
            ),
          ]
        : []),
    ),
  );

  const footer = !m
    ? null
    : el(
        "footer",
        { class: "cvh-footer", "data-history": "footer" },
        el("p", { "data-history": "times" }, say("card.footer.utc")),
        el(
          "p",
          null,
          owner
            ? say("card.footer.private")
            : say("card.footer.shared", { name: name ?? "" }),
        ),
        el(
          "p",
          null,
          say("card.footer.built.before"),
          time(m.built),
          say("card.footer.built.after"),
        ),
      );

  return {
    failed,
    header,
    hero,
    rows: rowList,
    signed,
    proof: proofPanel,
    notProven,
    technical,
    footer,
  };
}

/**
 * The module page's own check panel (L2, after the core's verification
 * section): the card's SH 6 properties as this page checked them, what the
 * block does not carry, the snapshot's witness and the card statements'
 * registration under the reader's own list (the Python module's "Which
 * checks ran").
 */
function moduleChecks(
  mod: ModuleFrame,
  say: (key: string, values?: Readonly<Record<string, string>>) => string,
  time: (t: Instant) => HistoryElement,
): HistoryElement {
  const mark = (status: string): string =>
    status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "–";
  const rows = Object.entries(mod.properties ?? {}).map(([p, status]) =>
    el(
      "li",
      { class: "cvh-proof-row", "data-check": p, "data-check-status": status },
      el("span", { class: "cvh-mark", "data-status": status }, mark(status)),
      el(
        "span",
        null,
        el(
          "span",
          { class: "cvh-sr" },
          `${say(`card.module.status.${status}`)}: `,
        ),
        el("span", null, say(`card.module.property.${p}`)),
        mod.skipped.includes(p)
          ? el("span", { class: "cvh-note" }, say("card.module.skipped"))
          : null,
      ),
    ),
  );
  const missing = mod.held
    ? (["policy", "as_of", "deals"] as const).filter((k) => !mod.held![k])
    : [];
  const at = (seconds: number | null | undefined): HistoryElement[] =>
    typeof seconds === "number" && Number.isFinite(seconds)
      ? [time({ ms: seconds * 1000 })]
      : [];
  const w = mod.witness;
  const reg = mod.registration;
  return el(
    "section",
    { class: "cvh-panel", "data-history": "card-checks" },
    el("h2", null, say("card.module.checks.heading")),
    el("p", { class: "cvh-note" }, say("card.module.checks.lead")),
    el("ul", { class: "cvh-proof-list" }, ...rows),
    missing.length > 0
      ? el(
          "p",
          { class: "cvh-note", "data-history": "not-held" },
          say("card.module.not_held", {
            what: missing
              .map((k) => say(`card.module.not_held.${k}`))
              .join(", "),
          }),
        )
      : null,
    w?.shown && w.witness !== undefined
      ? el(
          "p",
          { "data-history": "witness" },
          say("card.module.witness.line", { witness: w.witness }),
          ...(at(w.at).length > 0 ? [" · ", ...at(w.at)] : []),
        )
      : w?.status === "NOT_CHECKED"
        ? el(
            "p",
            { class: "cvh-note", "data-history": "witness" },
            say("card.module.witness.came"),
          )
        : null,
    reg?.shown && reg.service !== undefined
      ? el(
          "p",
          { "data-history": "registration" },
          say("card.module.registration.line", { service: reg.service }),
          ...(at(reg.at).length > 0 ? [" · ", ...at(reg.at)] : []),
          el(
            "span",
            { class: "cvh-note" },
            ` ${say("card.module.registration.note")}`,
          ),
        )
      : reg?.status === "NOT_CHECKED"
        ? el(
            "p",
            { class: "cvh-note", "data-history": "registration" },
            say("card.module.registration.came"),
          )
        : reg?.status === "FAIL"
          ? el(
              "p",
              { class: "cvh-note", "data-history": "registration" },
              say("card.module.registration.failed"),
            )
          : null,
  );
}

/** The module page's card, read for the drawer from the module's view model. */
export interface ModuleCard {
  readonly frame: ModuleFrame;
  readonly own: boolean;
  /** The card (the root record's disclosed agent_input); absent unless the card is standard. */
  readonly card: Readonly<Record<string, unknown>> | undefined;
  readonly keyId: string;
  readonly signedAt: string;
  readonly asOf: Readonly<Record<string, unknown>> | undefined;
  /** Entries the module checked with the card's entry rule; absent when none is listed. */
  readonly deals: readonly unknown[] | undefined;
  /** The block carries entries that do not have that form. */
  readonly dealsUnreadable: boolean;
}

/**
 * The drawer's card object from the module's view model. The card and its
 * entries already passed the card's own check (standard-history-card.ts), so
 * this projects them and adds no rule of the shaped-input page (whose limits
 * on ids and amount members are a caller's, not the card's). It reads only
 * the members the card's entry rule checks under the card's token (SH 5.2;
 * 11.2 for /3 and /4): `rows` under /3 and /4, `outcome` under /1 and /2,
 * never the other. A card that is not drawn still names its key in "Who
 * signed this card".
 */
function moduleCardObject(mc: ModuleCard): CardObject {
  const card = mc.card ?? {};
  const byRows =
    card["derivation"] === "standard_history/3" ||
    card["derivation"] === "standard_history/4";
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);
  const oc = isObj(card["outcomes"]) ? card["outcomes"] : {};
  const nc = isObj(card["not_counted"]) ? card["not_counted"] : {};
  const asOf = mc.asOf?.["anchor_time"];
  const deals =
    mc.deals === undefined
      ? undefined
      : mc.deals.filter(isObj).map((d): CardDeal => {
          const amount = isObj(d["amount"]) ? d["amount"] : undefined;
          const outcome = byRows ? undefined : d["outcome"];
          return {
            id: typeof d["deal"] === "string" ? d["deal"] : "",
            // Checked by the card's entry rule (an IP 5.2 time, a role), so neither fallback is reached.
            agreed:
              (typeof d["agreed_at"] === "string"
                ? parseInstant(d["agreed_at"])
                : undefined) ?? EPOCH,
            role: d["role"] === "bought" ? "bought" : "provided",
            amount:
              amount === undefined
                ? undefined
                : {
                    value: String(amount["value"]),
                    code: String(amount["assetCode"]),
                    scale: num(amount["assetScale"]),
                  },
            outcome:
              outcome === "held" ||
              outcome === "did_not_hold" ||
              outcome === "undecided"
                ? outcome
                : undefined,
            terms:
              byRows && Array.isArray(d["rows"])
                ? d["rows"].filter(isObj).map((row) => ({
                    holder: row["owed_by"] === "holder",
                    status: row["status"] as RowStatus,
                    value:
                      row["value"] === "met" || row["value"] === "not_met"
                        ? row["value"]
                        : undefined,
                    remedy:
                      typeof row["remedy"] === "string"
                        ? row["remedy"]
                        : undefined,
                  }))
                : undefined,
            bothHalves: d["happened"] === "stamped_by_both",
          };
        });
  return {
    derivation:
      typeof card["derivation"] === "string" ? card["derivation"] : "",
    keyId: mc.keyId,
    signedAt: parseInstant(mc.signedAt),
    outcomes: {
      of: num(oc["of"]),
      held: num(oc["held"]),
      didNotHold: num(oc["did_not_hold"]),
      undecided: num(oc["undecided"]),
    },
    waiting: num(nc["no_witness_time"]),
    asOf: typeof asOf === "string" ? parseInstant(asOf) : undefined,
    deals,
  };
}

/**
 * The module page's three regions (history-view-module.ts): L0 the counts
 * and the holder's rows, L1 who signed it and what this does not prove, L2
 * the card's own checks and the technical details. Each region is a
 * `cv-history` element, so the view's stylesheet applies to it.
 */
export function historyModuleCardParts(mc: ModuleCard): {
  readonly L0: HistoryElement;
  readonly L1: HistoryElement;
  readonly L2: HistoryElement;
} {
  const failed = mc.frame.state !== "card" || mc.card === undefined;
  const obj = moduleCardObject(mc);
  const say0 = (key: string): string => {
    const t = BASE[key];
    if (t === undefined) throw new Error(`history-view: no words for ${key}`);
    return t;
  };
  const parts = drawCardParts({
    owner: mc.own,
    words: {},
    name: undefined,
    obj,
    extras: new Map(),
    sample: undefined,
    failed,
    module: mc.frame,
  });
  const region = (depth: string, ...children: (HistoryElement | null)[]) =>
    el(
      "section",
      {
        class: "cv-history cvh-card cvh-module",
        "data-history": "view",
        "data-depth": depth,
        "data-kind": "deal",
        "data-perspective": mc.own ? "yours" : "theirs",
        "data-verdict": parts.failed ? "failed" : "pass",
      },
      ...children,
    );
  return {
    L0: region(
      "L0",
      parts.hero,
      parts.rows,
      mc.dealsUnreadable && !failed
        ? el(
            "p",
            { class: "cvh-note", "data-history": "rows-unreadable" },
            say0("card.module.rows.unreadable"),
          )
        : null,
    ),
    L1: region("L1", parts.signed, parts.notProven),
    L2: region("L2", parts.proof, parts.technical),
  };
}

/** The harbour seal, as the receipt draws it (receipt_core.js SEAL_BODY and SEAL_MOODS; a test holds the two equal). */
export const SEAL_SHAPES: {
  readonly body: readonly (readonly [
    string,
    Readonly<Record<string, string>>,
  ])[];
  readonly moods: Readonly<
    Record<
      string,
      readonly (readonly [string, Readonly<Record<string, string>>])[]
    >
  >;
} = {
  body: [
    [
      "path",
      {
        d: "M22 106 C18 70 34 44 60 42 C86 44 102 70 98 106 Z",
        fill: "#7F96A8",
      },
    ],
    ["ellipse", { cx: "60", cy: "88", rx: "24", ry: "19", fill: "#C9D5DE" }],
    ["circle", { cx: "60", cy: "40", r: "26", fill: "#8FA5B6" }],
  ],
  moods: {
    not_as_agreed: [
      [
        "path",
        {
          d: "M45 31 L54 34 M75 31 L66 34",
          stroke: "#13202B",
          "stroke-width": "1.8",
          "stroke-linecap": "round",
        },
      ],
      ["circle", { cx: "50", cy: "39", r: "3.4", fill: "#13202B" }],
      ["circle", { cx: "70", cy: "39", r: "3.4", fill: "#13202B" }],
      ["ellipse", { cx: "60", cy: "49", rx: "9", ry: "6", fill: "#C9D5DE" }],
      [
        "ellipse",
        { cx: "60", cy: "46.5", rx: "3.2", ry: "2.2", fill: "#13202B" },
      ],
      [
        "path",
        {
          d: "M56.5 53 Q60 50.5 63.5 53",
          stroke: "#13202B",
          "stroke-width": "1.6",
          fill: "none",
          "stroke-linecap": "round",
        },
      ],
      ["path", { d: "M76 76 Q92 70 95 82 Q88 86 79 82 Z", fill: "#6E8597" }],
      ["circle", { cx: "96", cy: "78", r: "14", fill: "#D97A1E" }],
      [
        "path",
        {
          d: "M96 71 L96 79",
          stroke: "#FFFFFF",
          "stroke-width": "2.8",
          "stroke-linecap": "round",
        },
      ],
      ["circle", { cx: "96", cy: "84.5", r: "1.7", fill: "#FFFFFF" }],
    ],
  },
};

function sealSvg(mood: string): HistoryElement {
  const shapes = [...SEAL_SHAPES.body, ...(SEAL_SHAPES.moods[mood] ?? [])];
  return el(
    "svg",
    {
      viewBox: "0 0 120 120",
      width: "48",
      height: "48",
      "aria-hidden": "true",
      focusable: "false",
      class: "cvh-seal-art",
      "data-seal": mood,
    },
    ...shapes.map(([tag, attrs]) => el(tag, attrs)),
  );
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
  // A deal page that carries its signed object is the card page (#384).
  if (isObj(input) && "machine" in input) {
    if (input["view"] !== HISTORY_VIEW)
      r.refuse("input.view", `is not ${HISTORY_VIEW}`);
    return buildCardPage(r, input, overlay);
  }
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

  const checks: {
    id: string;
    status: CheckStatus;
    unregistered?: Unregistered | undefined;
  }[] = [];
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
      let unregistered: Unregistered | undefined;
      if ("values" in co) {
        if (id === "witness" && status === "not_run")
          unregistered = readUnregistered(
            r,
            co["values"],
            `${path}.values`,
            kind,
            rows,
          );
        else {
          const vo = r.object(co["values"], `${path}.values`, [], []);
          if (vo && Object.keys(vo).length > 0)
            r.refuse(
              `${path}.values`,
              "names a placeholder the check's words do not have",
            );
        }
      }
      if (id && checks.some((x) => x.id === id))
        r.refuse(`${path}.id`, "is listed twice");
      if (id && status) checks.push({ id, status, unregistered });
    });
    // A deal page's rows carry RECORDED only when the deal report check
    // passed; a page that does not list the check did not run it, and the
    // checks list says so once (Sherlock2, F10).
    if (kind === "deal" && !checks.some((x) => x.id === "deal_report"))
      checks.push({ id: "deal_report", status: "not_run" });
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
      // and is named in the one closing "this node's settings don't say" line.
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
  // When the deal_report check did not run, the checks list says so once for
  // the card (Sherlock2, F10); when it failed, the page draws no rows at all.
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

  // Header. A card titled with its holder's name (header.title.person) names
  // the holder in its callout too, from the same field (Sherlock2, F10).
  const personTitle =
    kind !== "checkpoint" && reader !== "owner" && audienceKind !== "shared";
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
    const items = rows.map((x) => {
      if (x.kind === "checkpoint") {
        return el(
          "li",
          { class: "cvh-row", "data-history": "row" },
          el(
            "p",
            { class: "cvh-row-title" },
            say("row.cut", { at: minuteOf(x.cut) }),
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
          // RECORDED means checkpointed (Steven, #384): the deal report check
          // says each deal was read with its own report, not that a checkpoint
          // covers it, so it fills no RECORDED stamp here.
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
                : personTitle
                  ? say("callout.deals.named", { name: name ?? "" })
                  : say("callout.deals"),
          ),
          kind === "checkpoint" && rows.length > 0
            ? el("p", null, say("callout.checkpoints.time"))
            : null,
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
                  (words[`shares.stranger.token.${t}`] ??
                    BASE[`shares.stranger.token.${t}`]) !== undefined
                    ? say(`shares.stranger.token.${t}`)
                    : t,
                )
                .join(", "),
            })
          : say("shares.stranger.none"),
      );
    const unstated: string[] = [];
    if (sharing.standard_history === undefined) unstated.push("standard");
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
    else unstated.push("segments");
    if (sharing.exchange_corroboration === undefined)
      unstated.push("corroboration");
    else if (sharing.exchange_corroboration)
      lines.push(say("shares.corroboration.on"));
    if (sharing.record_at_completion === undefined) unstated.push("completion");
    else
      lines.push(
        say(
          sharing.record_at_completion === "counterparty"
            ? "shares.completion.on"
            : "shares.completion.off",
        ),
      );
    if (sharing.adjudications === undefined) unstated.push("adjudications");
    else
      lines.push(
        say(
          sharing.adjudications === "deliver_to_subjects"
            ? "shares.adjudications.on"
            : "shares.adjudications.off",
        ),
      );
    if (sharing.adjudicate_differing_twins === undefined)
      unstated.push("twins");
    else if (sharing.adjudicate_differing_twins)
      lines.push(say("shares.twins.on"));
    if (sharing.witnesses === undefined) unstated.push("witnesses");
    else
      lines.push(
        sharing.witnesses.length > 0
          ? say("shares.witnesses", { witnesses: sharing.witnesses.join(", ") })
          : say("shares.witnesses.none"),
      );
    // The signed-request rule is the mesh plugin's, carried by its policy; a
    // policy that states no segments setting does not vouch for it. A stated
    // stranger_safe allowlist already says what a stranger gets, so the rule
    // is not also listed as unstated beside it (#266).
    if (sharing.history_segments !== undefined) lines.push(say("shares.never"));
    else if (sharing.stranger_safe === undefined) unstated.push("never");
    // One closing sentence names every setting the node does not state.
    if (unstated.length > 0)
      lines.push(
        unstated.length === 1
          ? say("shares.unstated.one", {
              item: say(`shares.unstated.${unstated[0]}`),
            })
          : say("shares.unstated", {
              items: unstated
                .map((k) => say(`shares.unstated.${k}`))
                .join("; "),
            }),
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
          c.unregistered
            ? say("check.line.unregistered", {
                status: say(`status.${c.status}`),
                name: say(`check.${c.id}`),
                n: String(c.unregistered.n),
                at: minuteOf(c.unregistered.at),
              })
            : say("check.line", {
                status: say(`status.${c.status}`),
                name: say(`check.${c.id}`),
              }),
        ),
      ),
    ),
    // The "ran" sentence only when a check passed or failed; all not-run says nothing it does not already.
    checks.some((c) => c.status === "pass" || c.status === "fail")
      ? el(
          "p",
          { class: "cvh-note" },
          where === "page"
            ? say("checked.where.page", { by: checkedBy })
            : say("checked.where.builder", {
                at: minuteOf(built),
                by: checkedBy,
              }),
        )
      : null,
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
  options: { readonly localTime?: boolean } = {},
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
  if (built.ok && options.localTime !== false) localTimes(container, overlay);
  return built.ok;
}

/**
 * A card page's times in the reader's own zone (the static page says them in
 * UTC), and its footer saying so. Pages without such times are unchanged.
 */
function localTimes(container: Element, overlay: unknown): void {
  const times = container.querySelectorAll("time[data-time]");
  if (times.length === 0) return;
  const view = container.ownerDocument.defaultView as
    | (Window & { Intl?: typeof Intl })
    | null;
  const I = view?.Intl ?? Intl;
  const fmt = new I.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  for (const t of times) {
    const at = Date.parse(t.getAttribute("datetime") ?? "");
    if (!Number.isNaN(at)) t.textContent = fmt.format(new Date(at));
  }
  const note = container.querySelector('[data-history="times"]');
  const words =
    isObj(overlay) && isObj(overlay["entries"])
      ? overlay["entries"]["card.footer.local"]
      : undefined;
  if (note)
    note.textContent =
      typeof words === "string" ? words : (BASE["card.footer.local"] ?? "");
}

/** The view's stylesheet: one column under 900px, two above, print, and a dark palette (with its own background) on a dark screen. */
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
.cvh-card{--cvh-ink:#1b1f27;--cvh-slate:#4d5564;--cvh-line:#d3d7de;--cvh-cream:#f4f5f7;--cvh-navy:#2445a8;--cvh-ok:#17603a;--cvh-bad:#a31d1d}
.cvh-card .cvh-header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between}.cvh-tags{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0}
.cvh-tag{border-radius:999px;padding:2px 10px;font-size:13px;background:#eceef2;color:#3d4452}.cvh-tag[data-audience=private]{background:#fcf1dc;color:#6f4700}
.cvh-button{display:inline-block;border-radius:8px;padding:6px 12px;font-weight:600;text-decoration:none;background:#e7ecfb;color:#1f3c94}
.cvh-card .cvh-hero,.cvh-panel,.cvh-card .cvh-row{background:#fff;border:1px solid var(--cvh-line);border-radius:16px;padding:14px 16px}
.cvh-card .cvh-hero-line{font-size:24px;line-height:1.25}.cvh-card .cvh-row{border-radius:12px}.cvh-card .cvh-row[data-deal-state=not_as_agreed]{border-color:#d97a1e;border-width:2px}
.cvh-row-head{display:flex;gap:12px;align-items:flex-start}.cvh-seal-art{flex:none}.cvh-row-item{font-weight:600}.cvh-row-line{font-size:17px}
.cvh-card .cvh-stamp{border-radius:8px;border:1px dashed var(--cvh-line);padding:5px 10px;font-size:13px;color:var(--cvh-slate)}
.cvh-card .cvh-stamp[data-filled=yes]{border:1px solid var(--cvh-ok);background:#e6f3eb;color:var(--cvh-ok)}.cvh-card .cvh-stamp[data-state=failed]{border:1px solid var(--cvh-bad);background:#fbe9e9;color:var(--cvh-bad)}
.cvh-card .cvh-stamp-name{letter-spacing:.06em;display:block}.cvh-card .cvh-stamp-line{margin:0}
.cvh-panel p{margin:0 0 8px}.cvh-panel ul{margin:0;padding-left:18px}.cvh-proof-list{list-style:none;padding:0!important;display:grid;gap:8px}
.cvh-proof-row{display:grid;grid-template-columns:20px minmax(0,1fr);gap:8px}.cvh-proof-row span span{display:block}.cvh-mark{font-weight:700;text-align:center}
.cvh-mark[data-status=pass]{color:var(--cvh-ok)}.cvh-mark[data-status=fail]{color:var(--cvh-bad)}.cvh-code{display:block;font-size:12px;color:var(--cvh-slate)}
.cvh-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cvh-card .cvh-check{background:var(--cvh-cream);border-radius:8px;padding:10px 12px;margin-top:12px}.cvh-check-title{font-weight:700}
.cvh-command{margin:0 0 8px;white-space:pre-wrap;overflow-wrap:anywhere;font:13px ui-monospace,Menlo,monospace}
.cvh-wide{display:grid;gap:12px}.cvh-technical summary{cursor:pointer;font-weight:700;color:var(--cvh-navy)}.cvh-technical dd{margin:0 0 8px;overflow-wrap:anywhere}.cvh-id{display:block}
.cvh-footer{font-size:13px;color:var(--cvh-slate)}.cvh-footer p{margin:0 0 4px}.cvh-link{color:var(--cvh-navy);font-weight:600}
@media screen and (prefers-color-scheme:dark){.cv-history{--cvh-ink:#e8eaee;--cvh-slate:#a3a9b3;--cvh-line:#33373e;--cvh-cream:#22262d;--cvh-navy:#c3d0e8;--cvh-ok:#5fcf90;--cvh-bad:#ff8f84;background:#16181c;color-scheme:dark}.cvh-badge[data-audience=private]{background:#3a2f1a;border-color:#e6b85c}.cvh-card .cvh-hero,.cvh-panel,.cvh-card .cvh-row{background:#1d2026}.cvh-tag,.cvh-button{background:#2a2f38;color:#dfe5f2}.cvh-tag[data-audience=private]{background:#3a2f1a;color:#f2d8a7}.cvh-card .cvh-stamp[data-filled=yes]{background:#173325}.cvh-card .cvh-stamp[data-state=failed]{background:#3a1d1d}}
@media (min-width:900px){.cv-history{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}.cvh-header{grid-column:1/-1}.cvh-wide{grid-column:1/-1}}
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
