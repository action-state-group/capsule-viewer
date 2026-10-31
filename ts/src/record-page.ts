// SPDX-License-Identifier: BSD-3-Clause
import {
  committedDigest,
  disclosureOf,
  logCoordinates,
  type CountersignatureStamp,
  type ResultRoot,
  type VerifiedBundleContext,
} from "@action-state-group/agent-action-capsule";
import type { Words } from "./contract-report-wording.js";

/**
 * The lowest level (Steven's Outcomes frame 8): one record's envelope, its
 * capsule JSON, and the ladder of what each proof proves and its status on
 * this page. Level 3 of a report: a reader reaches it from a card's "Proofs"
 * link or from "Records in this bundle", and every record in the bundle has
 * the same page. It sits at the record's entry in the core's records list,
 * so it is a toggle of its own and never inside a level-1 or level-2 toggle
 * (`nestingProblems`), and it holds no toggle.
 *
 * Everything here is read from the verified context: the record's own bytes,
 * AAC's strict result, the membership claim, the witness receipts, the
 * countersignature stamps and the sealed Result. A rung whose material the
 * bundle does not carry says so (`NOT_PRESENT`), and a rung this page does
 * not run says so (`NOT_CHECKED`); nothing is filled in. The words are the
 * wording pack's (`record.*`), in the holder's voice (second person) in their
 * own preview and in the third person once shared.
 */

/** A rung's status on this page: the verifier's words, kept as data. */
export type RungStatus =
  | "PASS"
  | "FAIL"
  | "NOT_PRESENT"
  | "NOT_CHECKED"
  | "INCONCLUSIVE";

/** Whose copy this is: the holder's own preview or one that was shared. */
export type RecordVoice = "own" | "shared";

export interface RecordPageInput {
  readonly context: VerifiedBundleContext;
  readonly capsuleId: string;
  readonly stamps: readonly CountersignatureStamp[];
  readonly result?: ResultRoot | undefined;
  readonly voice: RecordVoice;
}

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const HEX = /^[0-9a-f]+$/u;

/** A digest or key shortened to its first and last four, as the canvas draws them. */
export function shortHex(value: string): string {
  return value.length > 12 && HEX.test(value)
    ? `${value.slice(0, 4)}…${value.slice(-4)}`
    : value;
}

// ---------------------------------------------------------------------------
// The envelope: COSE_Sign1, read just far enough to draw it
// ---------------------------------------------------------------------------

/** What an attached Producer Envelope says, read from its bytes. */
export interface EnvelopeView {
  readonly alg?: number;
  readonly contentType?: string;
  readonly kid?: string;
  readonly unprotectedEntries: number;
  readonly payloadHex?: string;
  readonly signatureBytes: number;
  readonly tagged: boolean;
}

type Cbor = bigint | Uint8Array | string | Cbor[] | Map<Cbor, Cbor> | null;

function readCbor(
  bytes: Uint8Array,
  at: { i: number },
  depth = 0,
): Cbor | undefined {
  if (depth > 6 || at.i >= bytes.length) return undefined;
  const head = bytes[at.i++]!;
  const major = head >> 5;
  const info = head & 31;
  let n: number;
  if (info < 24) n = info;
  else if (info < 28) {
    const size = 1 << (info - 24);
    if (size > 4 || at.i + size > bytes.length) return undefined;
    n = 0;
    for (let k = 0; k < size; k++) n = n * 256 + bytes[at.i++]!;
  } else if (major === 7 && info === 22) return null;
  else return undefined;
  switch (major) {
    case 0:
      return BigInt(n);
    case 1:
      return -1n - BigInt(n);
    case 2:
    case 3: {
      if (at.i + n > bytes.length) return undefined;
      const slice = bytes.slice(at.i, at.i + n);
      at.i += n;
      return major === 2 ? slice : new TextDecoder().decode(slice);
    }
    case 4: {
      const out: Cbor[] = [];
      for (let k = 0; k < n; k++) {
        const item = readCbor(bytes, at, depth + 1);
        if (item === undefined) return undefined;
        out.push(item);
      }
      return out;
    }
    case 5: {
      const out = new Map<Cbor, Cbor>();
      for (let k = 0; k < n; k++) {
        const key = readCbor(bytes, at, depth + 1);
        const value = readCbor(bytes, at, depth + 1);
        if (key === undefined || value === undefined) return undefined;
        out.set(key, value);
      }
      return out;
    }
    case 6:
      return readCbor(bytes, at, depth + 1);
    default:
      return undefined;
  }
}

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The envelope's parts, or undefined when `hex` is not a COSE_Sign1 this page can read. */
export function readEnvelope(hex: string): EnvelopeView | undefined {
  if (hex.length % 2 !== 0 || !HEX.test(hex)) return undefined;
  const bytes = Uint8Array.from(
    hex.match(/../gu)!.map((pair) => parseInt(pair, 16)),
  );
  const tagged = bytes[0] === 0xd2;
  const outer = readCbor(bytes, { i: 0 });
  if (!Array.isArray(outer) || outer.length !== 4) return undefined;
  const [protectedBytes, unprotected, payload, signature] = outer;
  if (
    !(protectedBytes instanceof Uint8Array) ||
    !(unprotected instanceof Map) ||
    !(signature instanceof Uint8Array)
  )
    return undefined;
  const headers = readCbor(protectedBytes, { i: 0 });
  if (!(headers instanceof Map)) return undefined;
  const get = (label: bigint): Cbor | undefined => {
    for (const [k, v] of headers) if (k === label) return v;
    return undefined;
  };
  const alg = get(1n);
  const contentType = get(3n);
  const kid = get(4n);
  return {
    ...(typeof alg === "bigint" ? { alg: Number(alg) } : {}),
    ...(typeof contentType === "string" ? { contentType } : {}),
    ...(kid instanceof Uint8Array ? { kid: toHex(kid) } : {}),
    unprotectedEntries: unprotected.size,
    ...(payload instanceof Uint8Array ? { payloadHex: toHex(payload) } : {}),
    signatureBytes: signature.length,
    tagged,
  };
}

// ---------------------------------------------------------------------------
// The capsule JSON: each member in clear or by digest
// ---------------------------------------------------------------------------

/** How a member sits in the capsule: in the clear, or only its digest. */
export type FieldTag =
  | "clear"
  | "digest-only"
  | "bodies-by-digest"
  | "commitment";

export interface FieldRow {
  readonly label: string;
  readonly value: string;
  readonly tags: readonly FieldTag[];
  readonly note?: "recomputed";
}

/** The members the envelope carries, not part of the capsule JSON the id is over. */
const ENVELOPE_MEMBERS: ReadonlySet<string> = new Set(["signature", "key_id"]);

/** The canvas's rows, in its order; a row is drawn when the record carries any of its members. */
const FIELD_ROWS: readonly (readonly string[])[] = [
  ["spec_version"],
  ["format_version", "canonicalization_id"],
  ["capsule_id"],
  ["action_id", "action_type"],
  ["operator", "developer"],
  ["timestamp", "epoch_id"],
  ["model_attestation"],
  ["effect"],
  ["assurance"],
  ["disposition"],
  ["constraints"],
  ["chain"],
  ["references"],
  ["agent_input_digest", "agent_output_digest", "evidence_digest"],
  ["selective_disclosure"],
];

function show(value: unknown, depth = 0): string {
  if (typeof value === "string") return shortHex(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const items = value.map((v) => show(v, depth + 1));
    return depth > 0 ? `[${items.join(", ")}]` : items.join(" · ");
  }
  // Members in canonical order: the same text whichever way the bundle was
  // packaged (record-content.ts `canonicalText`).
  const entries = Object.entries(object(value)).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  if (depth > 1) return `{${entries.length} members}`;
  return entries.map(([k, v]) => `${k} ${show(v, depth + 1)}`).join(" · ");
}

const hasDigest = (value: unknown): boolean =>
  Object.entries(object(value)).some(
    ([k, v]) => k.endsWith("_digest") || hasDigest(v),
  );

function tagsOf(members: readonly string[], record: Record<string, unknown>) {
  const present = members.filter((m) => Object.hasOwn(record, m));
  if (present.every((m) => m.endsWith("_digest"))) {
    const tags: FieldTag[] = ["digest-only"];
    return tags;
  }
  if (present.some((m) => /disclos|commit/u.test(m))) {
    const tags: FieldTag[] = ["commitment"];
    return tags;
  }
  const tags: FieldTag[] = ["clear"];
  if (present.some((m) => hasDigest(record[m]))) tags.push("bodies-by-digest");
  return tags;
}

/** The capsule's members as rows: the canvas's, then any member it has no row for. */
export function fieldRows(record: Record<string, unknown>): FieldRow[] {
  const drawn = new Set<string>();
  const rows: FieldRow[] = [];
  const add = (members: readonly string[]): void => {
    const present = members.filter((m) => Object.hasOwn(record, m));
    if (present.length === 0) return;
    for (const m of present) drawn.add(m);
    rows.push({
      label: present.join(" · "),
      value: present.map((m) => show(record[m])).join(" · "),
      tags: tagsOf(present, record),
      ...(present[0] === "capsule_id" ? { note: "recomputed" as const } : {}),
    });
  };
  for (const members of FIELD_ROWS) add(members);
  for (const key of Object.keys(record))
    if (!drawn.has(key) && !ENVELOPE_MEMBERS.has(key)) add([key]);
  return rows;
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

export interface Rung {
  readonly n: number;
  readonly key: string;
  readonly status: RungStatus;
  /** The status's own words beside the token, or undefined. */
  readonly note?: string;
  /** The line under the rung's name. */
  readonly sub: string;
}

const REF_TYPE = "agent-action-capsule";

/** The ladder for one record, each rung from what the verified context holds. */
export function ladder(input: RecordPageInput, w: Words): Rung[] {
  const { context, capsuleId } = input;
  const raw = object(context.recordIndex.get(capsuleId));
  const strict = context.strict?.records.find((r) => r.capsuleId === capsuleId);
  const t = (key: string, vars?: Record<string, string | number>) =>
    w.t(key, vars);
  const rungs: Rung[] = [];
  const add = (
    n: number,
    key: string,
    status: RungStatus,
    note: string | undefined,
    sub: string,
  ): void => {
    rungs.push({
      n,
      key,
      status,
      sub,
      ...(note === undefined ? {} : { note }),
    });
  };

  // 1 Payload digest: the verifier accepted the record's identity.
  add(
    1,
    "payload",
    context.recordIndex.has(capsuleId) &&
      (strict === undefined || strict.identityOk)
      ? "PASS"
      : "FAIL",
    undefined,
    t("record.rung.1.sub"),
  );

  // 2 Content digests: each committed member that was supplied matches.
  const fields = ["agent_input", "agent_output"] as const;
  const committed = fields.filter(
    (f) =>
      context.recordIndex.has(capsuleId) &&
      committedDigest(context.recordIndex.get(capsuleId)!, f) !== undefined,
  );
  const states = committed.map(
    (f) => disclosureOf(context, capsuleId, f).state,
  );
  const matched = states.filter((s) => s === "disclosed").length;
  const mismatched = states.filter((s) => s === "disclosure_mismatch").length;
  add(
    2,
    "content",
    mismatched > 0 ? "FAIL" : matched > 0 ? "PASS" : "NOT_PRESENT",
    committed.length === 0
      ? t("record.rung.2.none")
      : t("record.rung.2.count", { n: matched, of: committed.length }),
    t("record.rung.2.sub"),
  );

  // 3 Producer envelope: AAC's per-record signature verdict.
  const envelope = raw.signature !== undefined;
  add(
    3,
    "envelope",
    strict === undefined
      ? envelope
        ? "NOT_CHECKED"
        : "NOT_PRESENT"
      : strict.signature === "authored"
        ? "PASS"
        : strict.signature === "invalid"
          ? "FAIL"
          : "NOT_PRESENT",
    strict === undefined && envelope ? t("record.rung.3.unchecked") : undefined,
    t("record.rung.3.sub"),
  );

  // 4 Chain: the parent the record names is a record of this bundle.
  const chain = object(raw.chain);
  const parent =
    typeof chain.parent_capsule_id === "string"
      ? chain.parent_capsule_id
      : undefined;
  add(
    4,
    "chain",
    parent === undefined
      ? "NOT_PRESENT"
      : context.recordIndex.has(parent)
        ? "PASS"
        : "NOT_CHECKED",
    parent !== undefined && !context.recordIndex.has(parent)
      ? t("record.rung.4.parent-absent")
      : undefined,
    parent === undefined
      ? t("record.rung.4.sub.none")
      : t("record.rung.4.sub", { parent: shortHex(parent) }),
  );

  // 5 Inclusion: the record's log coordinates under the checkpoint.
  const at = logCoordinates(context.completeness.memberships, capsuleId);
  const claim = context.completeness.perRecordMembership.status;
  add(
    5,
    "inclusion",
    at === undefined
      ? "NOT_PRESENT"
      : claim === "pass"
        ? "PASS"
        : claim === "fail"
          ? "FAIL"
          : "NOT_CHECKED",
    undefined,
    at === undefined
      ? t("record.rung.5.sub.none")
      : t("record.rung.5.sub", { leaf: at.leafIndex, seq: at.seq }),
  );

  // 6 Checkpoint consistency: no retained head travels in a bundle.
  add(
    6,
    "consistency",
    "NOT_CHECKED",
    t("record.rung.6.gap"),
    t("record.rung.6.sub"),
  );

  // 7 Witness receipt: AAC's strict receipt results.
  const receipts = context.strict?.witnesses?.receipts ?? [];
  const passed = receipts.filter((r) => r.status === "pass").length;
  add(
    7,
    "witness",
    receipts.length === 0
      ? context.strict === undefined
        ? "NOT_CHECKED"
        : "NOT_PRESENT"
      : receipts.some((r) => r.status === "fail")
        ? "FAIL"
        : passed === receipts.length
          ? "PASS"
          : "NOT_CHECKED",
    receipts.length === 0
      ? t("record.rung.7.none")
      : t("record.rung.7.count", { n: passed, of: receipts.length }),
    t("record.rung.7.sub"),
  );

  // 8 Controller binding: not read by this page yet (a producer gap).
  add(
    8,
    "controller",
    "NOT_CHECKED",
    t("record.rung.8.gap"),
    t("record.rung.8.sub"),
  );

  // 9 References: each cited record is one this bundle carries.
  const refs = (Array.isArray(raw.references) ? raw.references : []).filter(
    (r) => object(r).type === REF_TYPE && typeof object(r).digest === "string",
  );
  const here = refs.filter((r) =>
    context.recordIndex.has(object(r).digest as string),
  ).length;
  add(
    9,
    "references",
    refs.length === 0
      ? "NOT_PRESENT"
      : here === refs.length
        ? "PASS"
        : "NOT_CHECKED",
    refs.length === 0
      ? undefined
      : t("record.rung.9.count", { n: here, of: refs.length }),
    t("record.rung.9.sub"),
  );

  // 10 Judgment: the sealed Result names this record.
  const result = input.result;
  const citing =
    result === undefined
      ? 0
      : result.claims.filter((c) =>
          c.evidence.some((e) => e.digest === capsuleId),
        ).length;
  const isResult = result?.capsuleId === capsuleId;
  add(
    10,
    "judgment",
    isResult || citing > 0 ? "PASS" : "NOT_PRESENT",
    isResult
      ? t("record.rung.10.is-result")
      : citing > 0
        ? t("record.rung.10.count", { n: citing })
        : undefined,
    t("record.rung.10.sub"),
  );

  // 11 Countersign: the stamps the page classified.
  const stamps = input.stamps;
  const kinds = new Set(stamps.map((s) => s.kind));
  add(
    11,
    "countersign",
    stamps.length === 0 || (kinds.size === 1 && kinds.has("hollow"))
      ? "NOT_PRESENT"
      : kinds.has("invalid")
        ? "FAIL"
        : stamps.every(
              (s) =>
                s.kind === "resolved" &&
                s.statement.checks.every((c) => c.result === "established"),
            )
          ? "PASS"
          : "NOT_CHECKED",
    undefined,
    t("record.rung.11.sub"),
  );
  return rungs;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const ALG_NAMES: ReadonlyMap<number, string> = new Map([
  [-8, "EdDSA, Ed25519"],
]);

/** The envelope card: protected header, unprotected header, payload, signature. */
function envelopeCard(input: RecordPageInput, w: Words): HTMLElement {
  const { context, capsuleId } = input;
  const voice = input.voice;
  const raw = object(context.recordIndex.get(capsuleId));
  const card = el("section", "l3-card");
  card.dataset.l3 = "envelope";
  card.append(el("h4", "l3-k", w.t("record.envelope.title")));
  const hex = typeof raw.signature === "string" ? raw.signature : undefined;
  const view = hex === undefined ? undefined : readEnvelope(hex);
  if (hex === undefined) {
    const none = el("p", "l3-note", w.t("record.envelope.none"));
    none.dataset.l3 = "no-envelope";
    card.append(none);
  } else if (view === undefined) {
    const bad = el("p", "l3-note", w.t("record.envelope.unreadable"));
    bad.dataset.l3 = "unreadable-envelope";
    card.append(bad);
  } else {
    const covered = (cls: string, tag: string): HTMLElement => {
      const chip = el("span", `l3-chip ${cls}`, tag);
      return chip;
    };
    const prot = el("div", "l3-box l3-prot");
    prot.dataset.l3 = "protected";
    const ph = el("p", "l3-h");
    ph.append(
      el("b", "", w.t("record.env.protected")),
      " ",
      covered("l3-green", w.t("record.env.covered")),
    );
    prot.append(ph);
    const dl = el("dl", "l3-kv");
    const row = (k: string, v: string): void => {
      dl.append(el("dt", "", k), el("dd", "", v));
    };
    if (view.alg !== undefined)
      row(
        w.t("record.env.alg"),
        `${view.alg} · ${ALG_NAMES.get(view.alg) ?? w.t("record.env.alg.other")}`,
      );
    if (view.contentType !== undefined)
      row(w.t("record.env.content-type"), view.contentType);
    if (view.kid !== undefined)
      row(
        w.t("record.env.kid"),
        w.t("record.env.kid.value", {
          kid: shortHex(view.kid),
          bytes: view.kid.length / 2,
        }),
      );
    prot.append(dl);
    const un = el("div", "l3-box l3-unprot");
    un.dataset.l3 = "unprotected";
    const uh = el("p", "l3-h");
    uh.append(
      el("b", "", w.t("record.env.unprotected")),
      " ",
      covered("l3-grey", w.t("record.env.not-signed")),
    );
    un.append(
      uh,
      el(
        "p",
        "",
        view.unprotectedEntries === 0
          ? w.t("record.env.unprotected.empty")
          : w.t("record.env.unprotected.entries", {
              n: view.unprotectedEntries,
            }),
      ),
    );
    const pay = el("div", "l3-box l3-payload");
    pay.dataset.l3 = "payload";
    const yh = el("p", "l3-h");
    yh.append(
      el("b", "", w.t("record.env.payload")),
      " ",
      covered("l3-green", w.t("record.env.covered")),
    );
    pay.append(
      yh,
      el(
        "p",
        "",
        view.payloadHex !== undefined && view.payloadHex === capsuleId
          ? w.t("record.env.payload.is-id", {
              bytes: view.payloadHex.length / 2,
            })
          : w.t("record.env.payload.other"),
      ),
    );
    const sig = el("div", "l3-box l3-sig");
    sig.dataset.l3 = "signature";
    sig.append(
      el("p", "", w.t("record.env.signature", { bytes: view.signatureBytes })),
    );
    card.append(prot, un, pay, sig);
  }
  card.append(el("p", "l3-note", w.t(`record.envelope.foot.${voice}`)));
  return card;
}

function tagWord(tag: FieldTag, w: Words): string {
  return w.t(`record.tag.${tag}`);
}

/** The capsule JSON card: every member, in clear or by digest. */
function capsuleCard(input: RecordPageInput, w: Words): HTMLElement {
  const raw = object(input.context.recordIndex.get(input.capsuleId));
  const card = el("section", "l3-card");
  card.dataset.l3 = "capsule";
  card.append(el("h4", "l3-k", w.t("record.capsule.title")));
  const dl = el("dl", "l3-fields");
  for (const row of fieldRows(raw)) {
    const dt = el("dt", "", row.label);
    const dd = el("dd");
    dd.append(row.value);
    if (row.note === "recomputed")
      dd.append(" · ", w.t("record.capsule.recomputed"));
    for (const tag of row.tags) {
      const chip = el("span", `l3-chip l3-tag-${tag}`, tagWord(tag, w));
      chip.dataset.tag = tag;
      dd.append(" ", chip);
    }
    dl.append(dt, dd);
  }
  card.append(dl);
  return card;
}

/** The ladder table. */
function ladderCard(input: RecordPageInput, w: Words): HTMLElement {
  const voice = input.voice;
  const card = el("section", "l3-card l3-ladder");
  card.dataset.l3 = "ladder";
  card.append(el("h3", "l3-title", w.t("record.ladder.title")));
  const table = el("table", "l3-table");
  const head = el("tr");
  for (const key of [
    "record.ladder.col.n",
    "record.ladder.col.proof",
    "record.ladder.col.proves",
    "record.ladder.col.status",
    "record.ladder.col.check",
  ])
    head.append(el("th", "", w.t(key)));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);
  const body = el("tbody");
  for (const rung of ladder(input, w)) {
    const tr = el("tr");
    tr.dataset.rung = String(rung.n);
    tr.dataset.rungStatus = rung.status;
    tr.append(el("td", "l3-n", String(rung.n)));
    const name = el("td");
    name.append(
      el("b", "", w.t(`record.rung.${rung.n}.title`)),
      el("div", "l3-sub", rung.sub),
    );
    tr.append(name, el("td", "", w.t(`record.rung.${rung.n}.proves.${voice}`)));
    const status = el("td");
    const chip = el("span", `l3-status l3-s-${rung.status}`, rung.status);
    chip.dataset.status = rung.status;
    status.append(chip);
    if (rung.note !== undefined) status.append(" ", rung.note);
    tr.append(status, el("td", "l3-cmd", w.t(`record.rung.${rung.n}.check`)));
    body.append(tr);
  }
  table.append(body);
  card.append(table);
  return card;
}

/** The three-column footer: why the order, what a status means, what the SDK gives. */
function footer(w: Words): HTMLElement {
  const foot = el("section", "l3-card l3-foot");
  foot.dataset.l3 = "foot";
  for (const key of ["order", "status", "sdk"]) {
    const col = el("p");
    col.append(
      el("b", "", w.t(`record.foot.${key}.k`)),
      ` ${w.t(`record.foot.${key}`)}`,
    );
    foot.append(col);
  }
  return foot;
}

/** The record page for `input.capsuleId`, in the record's entry. */
export function renderRecordPage(
  input: RecordPageInput,
  w: Words,
): HTMLElement {
  const raw = object(input.context.recordIndex.get(input.capsuleId));
  const page = el("div", "cv-l3");
  page.dataset.level = "3";
  page.dataset.recordPage = input.capsuleId;
  page.dataset.voice = input.voice;
  const actionId = typeof raw.action_id === "string" ? raw.action_id : "";
  page.append(
    el(
      "p",
      "l3-banner",
      w.t(`record.banner.${input.voice}`, { action: actionId }),
    ),
  );
  const cols = el("div", "l3-cols");
  cols.append(envelopeCard(input, w), capsuleCard(input, w));
  page.append(cols, ladderCard(input, w), footer(w));
  return page;
}

/** The page's styles, drawn once beside the records list. */
export const RECORD_PAGE_CSS = `
.cv-l3{display:grid;gap:12px;margin:8px 0}
.cv-l3 .l3-banner{margin:0;padding:10px 14px;border-radius:8px;background:#E4ECF7;border:1px solid #B9CBE4;font-size:13.5px}
.cv-l3 .l3-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:12px}
.cv-l3 .l3-card{border:1px solid #E3DED3;border-radius:10px;padding:12px 14px;background:#fff;min-width:0}
.cv-l3 .l3-k{margin:0 0 8px;font-size:11.5px;letter-spacing:.05em;text-transform:uppercase}
.cv-l3 .l3-title{margin:0 0 8px;font-size:20px}
.cv-l3 .l3-box{border:1px solid #E3DED3;border-radius:8px;padding:8px 10px;margin:0 0 8px;font-size:13px}
.cv-l3 .l3-prot{background:#E4ECF7;border-color:#B9CBE4}
.cv-l3 .l3-unprot{background:#F4F1EA;border-style:dashed}
.cv-l3 .l3-payload{background:#FBEFD9;border-color:#E9CE9B}
.cv-l3 .l3-h{margin:0 0 4px}
.cv-l3 .l3-kv{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:0;font-family:ui-monospace,Menlo,monospace;font-size:12px}
.cv-l3 .l3-kv dd,.cv-l3 .l3-fields dd{margin:0;overflow-wrap:anywhere}
.cv-l3 .l3-fields{display:grid;grid-template-columns:minmax(7rem,max-content) 1fr;gap:4px 12px;margin:0;font-size:12.5px}
.cv-l3 .l3-fields dt{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#5B5547}
.cv-l3 .l3-chip{display:inline-block;padding:0 6px;border-radius:5px;font-size:10.5px;background:#E8F1EA;color:#1F5F34}
.cv-l3 .l3-grey,.cv-l3 .l3-tag-digest-only,.cv-l3 .l3-tag-commitment{background:#FBEFD9;color:#7A4A00}
.cv-l3 .l3-note{margin:6px 0 0;font-size:12px;color:#5B5547}
.cv-l3 .l3-table{width:100%;border-collapse:collapse;font-size:13px}
.cv-l3 .l3-table th{text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;padding:6px;border-bottom:2px solid #1F2A44}
.cv-l3 .l3-table td{vertical-align:top;padding:8px 6px;border-bottom:1px solid #E3DED3}
.cv-l3 .l3-n{font-family:Georgia,serif;font-size:18px}
.cv-l3 .l3-sub{font-size:12px;color:#5B5547;overflow-wrap:anywhere}
.cv-l3 .l3-cmd{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.cv-l3 .l3-status{display:inline-block;padding:0 6px;border-radius:5px;font-size:11px;font-family:ui-monospace,Menlo,monospace;background:#ECE9E1}
.cv-l3 .l3-s-PASS{background:#E8F1EA;color:#1F5F34}
.cv-l3 .l3-s-FAIL{background:#F8E3E0;color:#9A1F12}
.cv-l3 .l3-foot{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr));gap:16px;font-size:12.5px}
.cv-l3 .l3-foot p{margin:0}
@media (max-width:40rem){.cv-l3 .l3-table,.cv-l3 .l3-table tbody,.cv-l3 .l3-table tr,.cv-l3 .l3-table td{display:block}.cv-l3 .l3-table thead{display:none}.cv-l3 .l3-table tr{border-bottom:1px solid #E3DED3;padding:6px 0}.cv-l3 .l3-table td{border:0;padding:3px 6px}}
`;
