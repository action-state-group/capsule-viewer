// SPDX-License-Identifier: Apache-2.0
/**
 * The History card's reading rules (capsule-viewer#478; the receipt
 * view-model note, docs/design/receipt-view-model.md section 7 row 8): how a
 * verified `x-standard-history/v0` bundle becomes the card the History view
 * draws, and the card's own check (agent-action-capsule's
 * spec/standard-history-v0.md SH 4 to 6, 11 and 12, the twin of AAC's
 * reference `check_card`).
 *
 * Ported unchanged in behaviour from the Python package's module-slot script
 * `src/capsule_viewer/static/standard_history_card.js` (its check and its
 * `buildModelSync`), which stays until the u526 path retires it (note PR 12);
 * `test/history-view-module-parity.test.ts` holds the two to the same model on
 * every fixture. This file has no words and no DOM: the model carries raw
 * values, and the History view words them.
 */
import type { VerifiedBundleContext } from "@action-state-group/agent-action-capsule";

// The card and its block are JSON read at run time; every member is checked
// before it is trusted, so `any` here stands for "unchecked JSON".
/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export const STANDARD_HISTORY_EXTENSION = "x-standard-history/v0";
const BLOCK_MEMBERS = ["policy", "as_of", "deals", "card_statements"];
const AS_OF_WITNESS = ["checkpoint", "receipts"];

// ---- the check: SH 4 to 6, the twin of the reference check_card ----------

const DERIVATION = "standard_history/1";
// SH 4, 5.3: /2 also counts the counted deals with no recorded amount, in `unpriced`. SH 11: /3 counts each deal's
// outcome from its term rows. The check reads all of them; a /2 card is read under /1, so it is not a standard card.
const DERIVATION_2 = "standard_history/2";
const DERIVATION_3 = "standard_history/3";
// /4 is /3 but for a deal with no witnessed time: counted, never left out, its entry saying so in `no_witness_time` (SH 12).
const DERIVATION_4 = "standard_history/4";
export function shelf(d: unknown): boolean {
  return d === DERIVATION_3 || d === DERIVATION_4;
}

/** The six card properties of SH 6, in order. */
export const CARD_PROPERTIES = [
  "card_form",
  "counts_integral",
  "denominator",
  "window_from_policy",
  "as_of",
  "counts_recompute",
] as const;
export type CardProperty = (typeof CARD_PROPERTIES)[number];
export type PropertyStatus = "PASS" | "FAIL" | "NOT_CHECKED";
export type CardProperties = Record<CardProperty, PropertyStatus>;

const COUNTERPARTY_CLASSES = ["person_agent", "business_agent", "shop_preauth"];
const NOT_COUNTED = "shop_preauth";
const HOLDER_KINDS = ["person", "node"];
const CONTROLLER_CLASSES: Record<string, string> = {
  person: "person_declared",
  node: "node_declared",
};
const ROLES = ["provided", "bought"];
const OUTCOMES = ["held", "did_not_hold", "undecided"];
const HAPPENED = ["stamped_by_both", "receipt_only", "no_record"];
const SIDES = ["raised", "received"];
const DISPUTE_OUTCOMES = [
  "open",
  "for",
  "against",
  "split",
  "no_finding",
  "withdrawn",
];
const FORUMS = ["auto", "network", "rail", "external"];
const NOT_COUNTED_3 = ["shop_preauth", "no_witness_time"];
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
];
const VALUED = ["waiting", "uncontested", "agreed_so_far", "agreed", "ruled"];
const ROW_VALUES = ["met", "not_met"];
const REMEDIES = ["none", "due", "made", "not_honoured"];
const UNRULED_REMEDIES = ["none", "made"];
const UNMET_STATUSES = ["agreed_so_far", "agreed", "uncontested"];
const OWED_BY = ["holder", "counterparty"];
const ENTRY_MEMBERS_3 = [
  "deal",
  "agreed_at",
  "counterparty_class",
  "left_out",
  "role",
  "amount",
  "rows",
  "happened",
  "disputes",
];
const ENTRY_MEMBERS_4 = [
  "deal",
  "agreed_at",
  "counterparty_class",
  "no_witness_time",
  "role",
  "amount",
  "rows",
  "happened",
  "disputes",
];
const ROW_MEMBERS = ["owed_by", "status", "value", "remedy", "local"];
const BASE_TALLIES: [string, string[]][] = [
  ["in_window", ["counted", "not_counted"]],
  ["class_missing", ["count"]],
  ["outcomes", OUTCOMES],
  ["roles", ROLES],
  ["happened", HAPPENED],
];
// The tallies of the token's card, in the order its counts are drawn.
function talliesOf(derivation: string): [string, string[]][] {
  if (!shelf(derivation)) return BASE_TALLIES;
  const rest: [string, string[]][] = [
    ["remedied", ["count"]],
    ["not_honoured", ["count"]],
    ["local_times", ["count"]],
  ];
  // /4 has no not_counted tally: shop purchases are all it leaves out, and in_window.not_counted already says so (SH 12).
  return BASE_TALLIES.concat(
    derivation === DERIVATION_3 ? [["not_counted", NOT_COUNTED_3]] : [],
    rest,
  );
}
function membersOf(derivation: string): string[] {
  const base = [
    "derivation",
    "holder_kind",
    "controller_class",
    "anchor",
    "since",
    "window",
    "policy",
    "bands",
    "disputes",
  ].concat(BASE_TALLIES.map((t) => t[0]));
  if (derivation === DERIVATION) return base;
  if (derivation === DERIVATION_4)
    return base.concat([
      "unpriced",
      "coverage_start",
      "remedied",
      "not_honoured",
      "local_times",
    ]);
  return derivation === DERIVATION_3
    ? base.concat([
        "unpriced",
        "coverage_start",
        "not_counted",
        "remedied",
        "not_honoured",
        "local_times",
      ])
    : base.concat(["unpriced"]);
}
const BAND_KEYS = ["currency", "decade"];
const MAX_COUNT = 9007199254740991; // 2^53 - 1

const HEX64 = /^[0-9a-f]{64}$/u;
const MONTH = /^[0-9]{4}-(?:0[1-9]|1[0-2])$/u;
const TIME =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z$/u;
const VALUE = /^(?:0|[1-9][0-9]*)$/u;
const CURRENCY =
  /^(?:[A-Z]{3}|[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128})$/u;

/** A malformed input (never a malformed card, which is a FAIL). Its text can quote a deal entry: it is never drawn. */
export class StandardHistoryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StandardHistoryInputError";
  }
}
const InputError = StandardHistoryInputError;

const own = (o: Json, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v: unknown): v is Record<string, Json> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number";
const has = (list: readonly unknown[], v: unknown): boolean =>
  list.indexOf(v) >= 0;
const keys = (o: object): string[] => Object.keys(o);
function sameSet(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x) => has(b, x));
}
function subset(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.every((x) => has(b, x));
}

// Python's == on JSON values: numbers by value, objects by member set, arrays in order.
function equal(a: Json, b: Json): boolean {
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => equal(x, b[i]))
    );
  if (isObj(a) || isObj(b))
    return (
      isObj(a) &&
      isObj(b) &&
      sameSet(keys(a), keys(b)) &&
      keys(a).every((k) => equal(a[k], b[k]))
    );
  return a === b;
}

/** An IP 5.2 time, as the reference's datetime. */
export interface CardTime {
  readonly y: number;
  readonly mo: number;
  readonly d: number;
  readonly h: number;
  readonly mi: number;
  readonly s: number;
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function daysIn(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === 2 && leap ? 29 : (DAYS[month - 1] ?? 31);
}

/** An IP 5.2 time. Throws on any other text. */
export function cardTime(text: unknown): CardTime {
  const m = typeof text === "string" ? TIME.exec(text) : null;
  if (!m) throw new InputError(`not an IP §5.2 time: ${JSON.stringify(text)}`);
  const t = {
    y: +m[1]!,
    mo: +m[2]!,
    d: +m[3]!,
    h: +m[4]!,
    mi: +m[5]!,
    s: +m[6]!,
  };
  if (
    t.y < 1 ||
    t.mo < 1 ||
    t.mo > 12 ||
    t.d < 1 ||
    t.d > daysIn(t.y, t.mo) ||
    t.h > 23 ||
    t.mi > 59 ||
    t.s > 59
  )
    throw new InputError(`not an IP §5.2 time: ${JSON.stringify(text)}`);
  return t;
}
const time = cardTime;
function timeKey(t: CardTime): number[] {
  return [t.y, t.mo, t.d, t.h, t.mi, t.s];
}
function compare(a: CardTime, b: CardTime): number {
  const x = timeKey(a);
  const y = timeKey(b);
  for (let i = 0; i < x.length; i += 1)
    if (x[i] !== y[i]) return x[i]! < y[i]! ? -1 : 1;
  return 0;
}

/**
 * SH 5.1: the same time of day and day of the month, `months` calendar months
 * earlier, on the last day of a shorter month; null before year 1.
 */
export function windowStart(anchor: CardTime, months: number): CardTime | null {
  const total = anchor.y * 12 + (anchor.mo - 1) - months;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  if (year < 1) return null;
  return {
    y: year,
    mo: month,
    d: Math.min(anchor.d, daysIn(year, month)),
    h: anchor.h,
    mi: anchor.mi,
    s: anchor.s,
  };
}

function inWindow(agreedAt: CardTime, window: Json, anchor: CardTime): boolean {
  if (compare(agreedAt, anchor) > 0) return false;
  if (window.all === true) return true;
  const start = windowStart(anchor, window.months);
  return start === null || compare(agreedAt, start) >= 0;
}

// SH 5.3: digits(value) - assetScale - 1; null for a zero amount.
function decade(amount: Json): number | null {
  const value = amount.value;
  const scale = amount.assetScale;
  if (typeof value !== "string" || !VALUE.test(value))
    throw new InputError(
      `amount value is not an exact integer string: ${JSON.stringify(value)}`,
    );
  if (!Number.isInteger(scale) || scale < 0 || scale > 255)
    throw new InputError(
      `amount assetScale out of range: ${JSON.stringify(scale)}`,
    );
  return value === "0" ? null : value.length - scale - 1;
}

// SH 11.2: a row result, with value and remedy exactly where the status carries them, and local only as true.
function checkRow(ref: string, row: Json): void {
  const bad = (what: string) =>
    new InputError(`deal ${ref}: ${what} ${JSON.stringify(row)}`);
  if (!isObj(row) || !subset(keys(row), ROW_MEMBERS))
    throw bad("malformed row result");
  if (!has(OWED_BY, row.owed_by) || !has(ROW_STATUSES, row.status))
    throw bad("malformed row result");
  if (
    own(row, "value") !== has(VALUED, row.status) ||
    (own(row, "value") && !has(ROW_VALUES, row.value))
  )
    throw bad("row value");
  const unmet = has(UNMET_STATUSES, row.status) && row.value === "not_met";
  const allowed =
    row.status === "ruled" ? REMEDIES : unmet ? UNRULED_REMEDIES : [];
  if (
    own(row, "remedy") !== allowed.length > 0 ||
    (own(row, "remedy") && !has(allowed, row.remedy))
  )
    throw bad("row remedy");
  if (own(row, "local") && row.local !== true) throw bad("row local");
}

// The deal entry's form (SH 5.2; under /3, 11.2). A malformed entry is an input error, never a count.
function checkEntry(deal: Json, derivation: string): void {
  if (!isObj(deal)) throw new InputError("a deal entry is not an object");
  if (typeof deal.deal !== "string" || !deal.deal)
    throw new InputError("deal entry without a deal reference");
  const v3 = shelf(derivation);
  if (
    v3 &&
    !subset(
      keys(deal),
      derivation === DERIVATION_3 ? ENTRY_MEMBERS_3 : ENTRY_MEMBERS_4,
    )
  )
    throw new InputError(
      `deal ${deal.deal}: a member a /3 or /4 entry does not have`,
    );
  time(deal.agreed_at);
  if (
    own(deal, "counterparty_class") &&
    !has(COUNTERPARTY_CLASSES, deal.counterparty_class)
  )
    throw new InputError(
      `unknown counterparty_class: ${JSON.stringify(deal.counterparty_class)}`,
    );
  const enums: [string, string[]][] = [
    ["role", ROLES],
    ["happened", HAPPENED],
  ];
  if (!v3) enums.push(["outcome", OUTCOMES]);
  for (const [name, list] of enums)
    if (!has(list, deal[name]))
      throw new InputError(
        `deal ${deal.deal}: ${name} ${JSON.stringify(deal[name])}`,
      );
  if (v3) {
    if (
      derivation === DERIVATION_4 &&
      own(deal, "no_witness_time") &&
      deal.no_witness_time !== true
    )
      throw new InputError(
        `deal ${deal.deal}: no_witness_time ${JSON.stringify(deal.no_witness_time)}`,
      );
    if (own(deal, "left_out") && deal.left_out !== "no_witness_time")
      throw new InputError(
        `deal ${deal.deal}: left_out ${JSON.stringify(deal.left_out)}`,
      );
    if (!Array.isArray(deal.rows) || deal.rows.length === 0)
      throw new InputError(`deal ${deal.deal}: rows is not a non-empty array`);
    for (const r of deal.rows) checkRow(deal.deal, r);
  }
  if (own(deal, "amount") || derivation === DERIVATION) {
    const amount = deal.amount;
    if (
      !isObj(amount) ||
      typeof amount.assetCode !== "string" ||
      !CURRENCY.test(amount.assetCode)
    )
      throw new InputError(`deal ${deal.deal}: amount without an SR assetCode`);
    decade(amount);
  }
  if (!Array.isArray(deal.disputes))
    throw new InputError(`deal ${deal.deal}: disputes is not an array`);
  for (const d of deal.disputes)
    if (
      !isObj(d) ||
      !has(SIDES, d.side) ||
      !has(DISPUTE_OUTCOMES, d.outcome) ||
      !has(FORUMS, d.forum)
    )
      throw new InputError(
        `deal ${deal.deal}: malformed dispute ${JSON.stringify(d)}`,
      );
}

// SH 11.3 and 11.4: a counted /3 deal's outcome, the first rule that applies, and for a did_not_hold deal whether the
// holder did not honour a ruling or remedied its unmet rows. Only rows the holder owed can make a deal did_not_hold.
function outcomeOf(rows: Json[]): {
  outcome: string;
  detail: string | null;
} {
  const mine = rows.filter((r) => r.owed_by === "holder");
  if (mine.some((r) => r.status === "ruled" && r.remedy === "not_honoured"))
    return { outcome: "did_not_hold", detail: "not_honoured" };
  const unmet = mine.filter(
    (r) =>
      (has(UNMET_STATUSES, r.status) || r.status === "ruled") &&
      r.value === "not_met",
  );
  const failed = {
    outcome: "did_not_hold",
    detail: unmet.every((r) => r.remedy === "made") ? "remedied" : null,
  };
  // A final unmet row comes before the rows still open, so a dispute cannot hide it.
  if (unmet.some((r) => r.status !== "agreed_so_far")) return failed;
  if (
    rows.some(
      (r) =>
        r.status === "in_disagreement" ||
        r.status === "in_dispute" ||
        r.status === "no_statement" ||
        (r.status === "waiting" && r.value === "not_met"),
    )
  )
    return { outcome: "undecided", detail: null };
  if (unmet.length) return failed;
  // A row not reached comes after did_not_hold, so it cannot hide an unmet row.
  if (
    rows.some((r) =>
      has(["not_reached", "not_due", "waiting", "agreed_so_far"], r.status),
    )
  )
    return { outcome: "undecided", detail: null };
  return { outcome: "held", detail: null };
}

function zero(parts: string[]): Record<string, number> {
  const t: Record<string, number> = { of: 0 };
  for (const p of parts) t[p] = 0;
  return t;
}

// SH 4: by currency (code point order), then decade, the zero-amount band first.
function bandOrder(a: Json, b: Json): number {
  if (a.currency !== b.currency) return a.currency < b.currency ? -1 : 1;
  if ((a.decade === null) !== (b.decade === null))
    return a.decade === null ? -1 : 1;
  const x = a.decade === null ? 0 : a.decade;
  const y = b.decade === null ? 0 : b.decade;
  return x === y ? 0 : x < y ? -1 : 1;
}

// The tallies SH 5 (under /3, 11) derives from the deal entries.
function counts(
  deals: Json[],
  window: Json,
  anchor: CardTime,
  derivation: string,
): Record<string, Json> {
  const v3 = shelf(derivation);
  const t: Record<string, Json> = {};
  for (const [name, parts] of talliesOf(derivation)) t[name] = zero(parts);
  if (derivation !== DERIVATION) t["unpriced"] = zero(OUTCOMES);
  const bands: Record<string, Json> = {};
  const order: Json[] = [];
  const disputes: Record<string, Json> = {};
  for (const side of SIDES)
    disputes[side] = {
      of: 0,
      by_outcome: zero(DISPUTE_OUTCOMES),
      by_forum: zero(FORUMS),
    };
  for (const deal of deals) {
    checkEntry(deal, derivation);
    if (!inWindow(time(deal.agreed_at), window, anchor)) continue;
    t["in_window"].of += 1;
    // SH 11.2: under /3 a deal left out is not counted either.
    const shop = deal.counterparty_class === NOT_COUNTED;
    if (shop || (derivation === DERIVATION_3 && own(deal, "left_out"))) {
      t["in_window"].not_counted += 1;
      if (derivation === DERIVATION_3) {
        t["not_counted"].of += 1;
        t["not_counted"][shop ? "shop_preauth" : "no_witness_time"] += 1;
      }
      continue;
    }
    t["in_window"].counted += 1;
    t["class_missing"].of += 1;
    if (!own(deal, "counterparty_class")) t["class_missing"].count += 1;
    let result = deal.outcome;
    if (v3) {
      const r = outcomeOf(deal.rows);
      result = r.outcome;
      if (result === "did_not_hold")
        for (const name of ["remedied", "not_honoured"]) {
          t[name].of += 1;
          if (r.detail === name) t[name].count += 1;
        }
      t["local_times"].of += 1;
      if (
        deal.rows.some((x: Json) => x.local === true) ||
        deal.no_witness_time === true
      )
        t["local_times"].count += 1;
    }
    for (const [name, value] of [
      ["outcomes", result],
      ["roles", deal.role],
      ["happened", deal.happened],
    ] as const) {
      t[name].of += 1;
      t[name][value] += 1;
    }
    let band: Json;
    if (!own(deal, "amount")) {
      // SH 5.3: an unpriced deal (/2, /3) is in `unpriced` and in no band.
      band = t["unpriced"];
    } else {
      const d = decade(deal.amount);
      const key = JSON.stringify([deal.amount.assetCode, d]);
      if (!own(bands, key)) {
        bands[key] = {
          currency: deal.amount.assetCode,
          decade: d,
          of: 0,
          held: 0,
          did_not_hold: 0,
          undecided: 0,
        };
        order.push(bands[key]);
      }
      band = bands[key];
    }
    band.of += 1;
    band[result] += 1;
    for (const x of deal.disputes) {
      const tally = disputes[x.side];
      tally.of += 1;
      tally.by_outcome.of += 1;
      tally.by_outcome[x.outcome] += 1;
      tally.by_forum.of += 1;
      tally.by_forum[x.forum] += 1;
    }
  }
  t["bands"] = order.sort(bandOrder);
  t["disputes"] = disputes;
  return t;
}

function windowForm(w: Json): boolean {
  if (!isObj(w)) return false;
  if (sameSet(keys(w), ["all"])) return w.all === true;
  return sameSet(keys(w), ["months"]) && isNumber(w.months) && w.months >= 1;
}

function policyWindow(w: Json): boolean {
  return (
    windowForm(w) &&
    (own(w, "all") || (Number.isInteger(w.months) && w.months <= MAX_COUNT))
  );
}

// SH 6 card_form: exactly the tally's parts, each a number, and optionally `of`.
function tallyForm(t: Json, parts: string[]): boolean {
  if (!isObj(t)) return false;
  const k = keys(t);
  if (!subset(parts, k) || !subset(k, parts.concat(["of"]))) return false;
  return k.every((x) => isNumber(t[x]));
}

function cardForm(card: Json, derivation: string): boolean {
  if (!isObj(card) || !sameSet(keys(card), membersOf(derivation))) return false;
  if (card.derivation !== derivation || !has(HOLDER_KINDS, card.holder_kind))
    return false;
  if (card.controller_class !== CONTROLLER_CLASSES[card.holder_kind])
    return false;
  if (
    !["anchor", "policy"].every(
      (m) => typeof card[m] === "string" && HEX64.test(card[m]),
    )
  )
    return false;
  if (typeof card.since !== "string" || !MONTH.test(card.since)) return false;
  if (!windowForm(card.window)) return false;
  if (
    !talliesOf(derivation).every(([name, parts]) =>
      tallyForm(card[name], parts),
    )
  )
    return false;
  if (derivation !== DERIVATION && !tallyForm(card.unpriced, OUTCOMES))
    return false;
  if (shelf(derivation)) {
    if (
      typeof card.coverage_start !== "string" ||
      !MONTH.test(card.coverage_start) ||
      card.coverage_start < card.since
    )
      return false;
  }
  const bands = card.bands;
  if (!Array.isArray(bands)) return false;
  for (let i = 0; i < bands.length; i += 1) {
    const band = bands[i];
    if (!isObj(band) || !subset(BAND_KEYS, keys(band))) return false;
    if (typeof band.currency !== "string" || !CURRENCY.test(band.currency))
      return false;
    if (band.decade !== null && !isNumber(band.decade)) return false;
    const rest: Record<string, Json> = Object.create(null);
    for (const k of keys(band)) if (!has(BAND_KEYS, k)) rest[k] = band[k];
    if (!tallyForm(rest, OUTCOMES)) return false;
    if (i > 0 && bandOrder(bands[i - 1], band) >= 0) return false;
  }
  const disputes = card.disputes;
  if (!isObj(disputes) || !sameSet(keys(disputes), SIDES)) return false;
  return SIDES.every((side) => {
    const d = disputes[side];
    if (
      !isObj(d) ||
      !subset(["by_outcome", "by_forum"], keys(d)) ||
      !subset(keys(d), ["of", "by_outcome", "by_forum"])
    )
      return false;
    if (own(d, "of") && !isNumber(d.of)) return false;
    return (
      tallyForm(d.by_outcome, DISPUTE_OUTCOMES) && tallyForm(d.by_forum, FORUMS)
    );
  });
}

function numbers(v: Json, out: number[]): number[] {
  if (Array.isArray(v)) for (const x of v) numbers(x, out);
  else if (isObj(v)) for (const k of keys(v)) numbers(v[k], out);
  else if (isNumber(v)) out.push(v);
  return out;
}

function integral(n: number, low: number): boolean {
  return Number.isInteger(n) && n >= low && n <= MAX_COUNT;
}

// SH 6: every number an integer of at most 2^53 - 1 in magnitude, and 0 or more except a band's decade.
function countsIntegral(card: Json): boolean {
  const decades: Json[] = [];
  let rest: Json = card;
  if (isObj(card) && Array.isArray(card.bands)) {
    rest = Object.create(null);
    for (const k of keys(card)) rest[k] = card[k];
    rest.bands = card.bands.map((band: Json) => {
      if (!isObj(band) || !own(band, "decade")) return band;
      decades.push(band.decade);
      const copy: Record<string, Json> = Object.create(null);
      for (const k of keys(band)) if (k !== "decade") copy[k] = band[k];
      return copy;
    });
  }
  return (
    numbers(rest, []).every((n) => integral(n, 0)) &&
    numbers(decades, []).every((n) => integral(n, -MAX_COUNT))
  );
}

function sum(list: Json[], f: (x: Json) => number): number {
  return list.reduce((s: number, x: Json) => s + f(x), 0);
}
function partitions(t: Json, parts: string[]): boolean {
  return own(t, "of") && sum(parts, (p) => t[p]) === t.of;
}

// SH 4 "Denominators" (under /3, 11.6). Run only on a card whose form and counts are PASS.
function denominator(card: Json, derivation: string): boolean {
  const v3 = shelf(derivation);
  for (const [name, parts] of talliesOf(derivation)) {
    const t = card[name];
    if (!own(t, "of")) return false;
    if (
      name === "class_missing" ||
      name === "remedied" ||
      name === "not_honoured" ||
      name === "local_times"
    ) {
      if (t.count > t.of) return false;
    } else if (!partitions(t, parts)) return false;
  }
  const counted = card.in_window.counted;
  if (
    ["class_missing", "outcomes", "roles", "happened"].some(
      (n) => card[n].of !== counted,
    )
  )
    return false;
  if (
    v3 &&
    (card.local_times.of !== counted ||
      (derivation === DERIVATION_3 &&
        card.not_counted.of !== card.in_window.not_counted))
  )
    return false;
  if (
    card.bands.some((band: Json) => !partitions(band, OUTCOMES) || band.of < 1)
  )
    return false;
  // SH 4: on a /2 or /3 card the bands and `unpriced` together partition the outcomes.
  const priced: Json[] = card.bands.slice();
  if (derivation !== DERIVATION) {
    if (!partitions(card.unpriced, OUTCOMES)) return false;
    priced.push(card.unpriced);
  }
  if (
    ["of"]
      .concat(OUTCOMES)
      .some((o) => sum(priced, (b) => b[o]) !== card.outcomes[o])
  )
    return false;
  if (v3) {
    // SH 11.4: a did_not_hold deal is in at most one of the two counts.
    const dnh = card.outcomes.did_not_hold;
    if (
      ["remedied", "not_honoured"].some((n) => card[n].of !== dnh) ||
      card.remedied.count + card.not_honoured.count > dnh
    )
      return false;
  }
  return SIDES.every((side) => {
    const d = card.disputes[side];
    if (!own(d, "of")) return false;
    if (
      !partitions(d.by_outcome, DISPUTE_OUTCOMES) ||
      !partitions(d.by_forum, FORUMS)
    )
      return false;
    return d.by_outcome.of === d.of && d.by_forum.of === d.of;
  });
}

const status = (ok: boolean): PropertyStatus => (ok ? "PASS" : "FAIL");

/**
 * The six card properties of SH 6, in order, from what the caller holds:
 * `policy` {digest, window}, `asOf` {anchor, anchor_time,
 * first_checkpoint_time, and under /3 coverage_start_time}, `deals` (every
 * deal entry at the anchor), each optional (null or undefined); a property
 * that needs a missing one is NOT_CHECKED. Throws
 * {@link StandardHistoryInputError} on a malformed input, never on a malformed
 * card. `derivation` is the token the card is checked under.
 */
export function checkCard(
  card: Json,
  policy: Json,
  asOf: Json,
  deals: Json,
  derivation: string = DERIVATION,
): CardProperties {
  if (!has([DERIVATION, DERIVATION_2, DERIVATION_3, DERIVATION_4], derivation))
    throw new InputError(
      `not a standard_history token: ${JSON.stringify(derivation)}`,
    );
  const p = {} as Record<CardProperty, PropertyStatus>;
  p.card_form = status(cardForm(card, derivation));
  p.counts_integral = status(countsIntegral(card));
  p.denominator =
    p.card_form === "PASS" && p.counts_integral === "PASS"
      ? status(denominator(card, derivation))
      : "NOT_CHECKED";
  if (policy === null || policy === undefined) {
    p.window_from_policy = "NOT_CHECKED";
  } else {
    if (!policyWindow(policy.window))
      throw new InputError(
        `not a policy window: ${JSON.stringify(policy.window)}`,
      );
    p.window_from_policy = status(
      isObj(card) &&
        windowForm(card.window) &&
        equal(card.window, policy.window) &&
        card.policy === policy.digest,
    );
  }
  if (asOf === null || asOf === undefined) {
    p.as_of = "NOT_CHECKED";
  } else {
    time(asOf.first_checkpoint_time);
    let ok =
      isObj(card) &&
      card.anchor === asOf.anchor &&
      card.since === asOf.first_checkpoint_time.slice(0, 7);
    if (shelf(derivation)) {
      // SH 11.1, 11.7: the coverage start's month is the card's, and the anchor is at or after it.
      time(asOf.coverage_start_time);
      time(asOf.anchor_time);
      ok =
        ok &&
        card.coverage_start === asOf.coverage_start_time.slice(0, 7) &&
        asOf.coverage_start_time <= asOf.anchor_time;
    }
    p.as_of = status(ok);
  }
  // /1 recounts over the policy's window; /2 and /3 over the card's own window, as the reference does.
  const policyHeld =
    derivation !== DERIVATION || (policy !== null && policy !== undefined);
  const ready =
    deals !== null &&
    deals !== undefined &&
    policyHeld &&
    asOf !== null &&
    asOf !== undefined &&
    (["card_form", "counts_integral", "denominator"] as const).every(
      (k) => p[k] === "PASS",
    );
  if (!ready) {
    p.counts_recompute = "NOT_CHECKED";
  } else {
    const from = derivation === DERIVATION ? policy.window : card.window;
    const window = own(from, "all") ? { all: true } : { months: from.months };
    const derived = counts(deals, window, time(asOf.anchor_time), derivation);
    p.counts_recompute = status(
      keys(derived).every((k) => equal(card[k], derived[k])),
    );
  }
  return p;
}

/** SH 6: a standard card has no FAIL, and its form, counts and denominators PASS. */
export function isStandard(p: CardProperties): boolean {
  return (
    CARD_PROPERTIES.every((k) => p[k] === "PASS" || p[k] === "NOT_CHECKED") &&
    (["card_form", "counts_integral", "denominator"] as const).every(
      (k) => p[k] === "PASS",
    )
  );
}

// ---- reading the bundle ----------------------------------------------------

/**
 * The runtime's verification gate (resolveModules, step 1), for a context the
 * runtime did not gate (a test, a host that calls the module directly).
 */
export function cardBundleVerified(v: unknown): boolean {
  const obj = (x: Json): Record<string, Json> => (isObj(x) ? x : {});
  const claim = (c: Json) => ({
    status: obj(c).status,
    findings: Array.isArray(obj(c).findings) ? (obj(c).findings as Json[]) : [],
  });
  if (!isObj(v)) return false;
  const m = claim(v.perRecordMembership);
  const results = obj(v.capsuleResults);
  const unbound = (f: Json) =>
    typeof f === "string" && f.indexOf("membership_record_unbound:") === 0;
  return (
    claim(v.graphClosure).status === "pass" &&
    claim(v.intervalCoverage).status === "pass" &&
    (m.status === "pass" ||
      (m.status === "fail" &&
        m.findings.length > 0 &&
        m.findings.every(unbound))) &&
    keys(results).every((k) => obj(results[k]).ok === true) &&
    Array.isArray(v.disclosures) &&
    v.disclosures.every(
      (d: Json) =>
        obj(d).status === "disclosure_match" || obj(d).status === "withheld",
    )
  );
}

// Whether the checkpoint covers the root record itself: the gate lets a
// record whose log position is unbound through (membership_record_unbound).
function rootCovered(context: Json): boolean {
  const m =
    isObj(context.verification) &&
    isObj(context.verification.perRecordMembership)
      ? context.verification.perRecordMembership
      : {};
  if (m.status === "pass") return true;
  return (
    (Array.isArray(m.findings) ? m.findings : []).indexOf(
      `membership_record_unbound:${context.root}`,
    ) < 0
  );
}

/** The bundle's `x-standard-history/v0` block, or undefined. */
export function standardHistoryBlock(bundle: unknown): Json {
  const ext =
    isObj(bundle) && isObj(bundle["extensions"]) ? bundle["extensions"] : {};
  return own(ext, STANDARD_HISTORY_EXTENSION)
    ? ext[STANDARD_HISTORY_EXTENSION]
    : undefined;
}

const HEX_OCTETS = /^(?:[0-9a-f]{2})+$/u;
function hexOctets(v: unknown): boolean {
  return typeof v === "string" && HEX_OCTETS.test(v);
}

interface Block {
  readonly policy: Json;
  readonly as_of: Json;
  readonly deals: Json;
  readonly card_statements: string[] | null;
}

// The block's shape: closed; each member's own form is checkCard's (and the
// anchor's time is read for the dates the page draws).
function readBlock(b: Json): Block {
  if (!isObj(b))
    throw new InputError(
      `the ${STANDARD_HISTORY_EXTENSION} block is not an object`,
    );
  for (const k of keys(b))
    if (!has(BLOCK_MEMBERS, k))
      throw new InputError(`the block carries an unknown member: ${k}`);
  if (
    own(b, "policy") &&
    (!isObj(b.policy) ||
      !sameSet(keys(b.policy), ["digest", "window"]) ||
      typeof b.policy.digest !== "string")
  )
    throw new InputError("the block's policy is not {digest, window}");
  if (own(b, "as_of")) {
    const a = b.as_of;
    const base = ["anchor", "anchor_time", "first_checkpoint_time"];
    if (
      !isObj(a) ||
      !base.every((k) => own(a, k)) ||
      keys(a).some(
        (k) => !has(base.concat(AS_OF_WITNESS, ["coverage_start_time"]), k),
      ) ||
      typeof a.anchor !== "string"
    )
      throw new InputError(
        "the block's as_of is not {anchor, anchor_time, first_checkpoint_time} with optional coverage_start_time, checkpoint and receipts",
      );
    time(a.anchor_time);
    if (own(a, "coverage_start_time")) time(a.coverage_start_time);
    if (own(a, "checkpoint") && !hexOctets(a.checkpoint))
      throw new InputError("the block's as_of.checkpoint is not lowercase hex");
    if (
      own(a, "receipts") &&
      !(
        Array.isArray(a.receipts) &&
        a.receipts.length >= 1 &&
        a.receipts.length <= 64 &&
        a.receipts.every(hexOctets)
      )
    )
      throw new InputError(
        "the block's as_of.receipts is not 1 to 64 lowercase hex strings",
      );
  }
  if (own(b, "deals") && !Array.isArray(b.deals))
    throw new InputError("the block's deals is not an array");
  // card_statements (capsule-viewer#342; SH 13.3) is never checked here and never makes the block unreadable: an entry
  // that is not a string, or a member that is not an array, stands for a card statement that fails SH 13.1.
  let statements: string[] | null = null;
  if (own(b, "card_statements"))
    statements = Array.isArray(b.card_statements)
      ? b.card_statements.map((x: Json) => (typeof x === "string" ? x : ""))
      : [""];
  return {
    policy: own(b, "policy") ? b.policy : null,
    as_of: own(b, "as_of") ? b.as_of : null,
    deals: own(b, "deals") ? b.deals : null,
    card_statements: statements,
  };
}

function rootCard(context: Json): Json {
  const r =
    context.resolvedDisclosures && context.root
      ? context.resolvedDisclosures.get(context.root)
      : undefined;
  const input = r && r.agent_input;
  if (!input || input.state !== "disclosed")
    throw new InputError(
      "the root record's agent_input, the card, is not disclosed",
    );
  return input.payload;
}

/** What the anchor-witness step needs from the block. */
export interface WitnessIn {
  readonly anchor: string;
  readonly checkpoint: string | null;
  readonly receipts: readonly string[] | null;
}

export interface Held {
  readonly policy: boolean;
  readonly as_of: boolean;
  readonly deals: boolean;
}

interface Base {
  /** The holder's own copy: the block carries the deal entries. */
  readonly own: boolean;
  readonly properties: CardProperties;
}

/** The model before the signature, witness and registration steps. */
export type CardReading =
  | (Base & { readonly state: "unverified" | "unreadable" })
  | (Base & {
      readonly state: "refused";
      readonly held: Held;
      readonly witnessIn: WitnessIn | null;
      readonly registerIn: readonly string[] | null;
      readonly skipped: readonly CardProperty[];
      readonly fails: readonly CardProperty[];
    })
  | (Base & {
      readonly state: "card";
      readonly held: Held;
      readonly witnessIn: WitnessIn | null;
      readonly registerIn: readonly string[] | null;
      readonly skipped: readonly CardProperty[];
      /** Whether the checkpoint covers the root record itself. */
      readonly covered: boolean;
      /** The card as its holder signed it (SH 4): every member checked by card_form. */
      readonly card: Json;
      /** Under /3 and /4: the entries add up to the card (SH 11.7); counts_recompute is then NOT_CHECKED. */
      readonly entriesMatch: boolean;
      /** The block's as_of, when held (the anchor's and coverage start's times). */
      readonly asOf: Json;
      /** The block's deal entries (the holder's own copy), checked by the card's check when it ran. */
      readonly deals: readonly Json[] | null;
    });

function noneChecked(): CardProperties {
  const none = {} as CardProperties;
  for (const p of CARD_PROPERTIES) none[p] = "NOT_CHECKED";
  return none;
}

/**
 * The card a verified context carries, read with the Python module's rules
 * (`buildModelSync`): `unverified` (the context fails the verification gate),
 * `unreadable` (a malformed block or an undisclosed card), `refused` (the
 * card's SH check fails) or `card`.
 */
export function readStandardHistory(
  context: VerifiedBundleContext | Json,
): CardReading {
  const ctx: Json = context;
  const bundle = isObj(ctx) ? ctx.bundle : undefined;
  const b = standardHistoryBlock(bundle);
  const ownCopy = isObj(b) && own(b, "deals");
  if (!cardBundleVerified(ctx && ctx.verification))
    return { state: "unverified", own: ownCopy, properties: noneChecked() };
  let inputs: Block;
  let card: Json;
  let properties: CardProperties;
  let derivation: string;
  let entriesMatch = false;
  try {
    inputs = readBlock(b);
    card = rootCard(ctx);
    // The token is the card's own; any other reads under /1, where its form fails.
    derivation =
      isObj(card) && shelf(card["derivation"])
        ? card["derivation"]
        : DERIVATION;
    properties = checkCard(
      card,
      inputs.policy,
      inputs.as_of,
      inputs.deals,
      derivation,
    );
    // Under /3 the formal counts_recompute needs the whole-shelf handover (SH 11.7), which this page does not have:
    // the entries only add up to the card or not (entriesMatch), and a match leaves the property NOT_CHECKED. A
    // mismatch of the holder's own copy with its own card stays FAIL.
    if (shelf(derivation)) {
      entriesMatch = properties.counts_recompute === "PASS";
      if (entriesMatch) properties.counts_recompute = "NOT_CHECKED";
    }
  } catch (err) {
    if (!(err instanceof StandardHistoryInputError)) throw err;
    return { state: "unreadable", own: ownCopy, properties: noneChecked() };
  }
  const held: Held = {
    policy: inputs.policy !== null,
    as_of: inputs.as_of !== null,
    deals: inputs.deals !== null,
  };
  const asOf = inputs.as_of;
  const witnessIn: WitnessIn | null =
    asOf && (own(asOf, "receipts") || own(asOf, "checkpoint"))
      ? {
          anchor: asOf.anchor,
          checkpoint: own(asOf, "checkpoint") ? asOf.checkpoint : null,
          receipts: own(asOf, "receipts") ? asOf.receipts : null,
        }
      : null;
  const registerIn =
    inputs.card_statements && inputs.card_statements.length
      ? inputs.card_statements
      : null;
  // NOT_CHECKED because an earlier check failed, not because an input is missing.
  const first = (["card_form", "counts_integral"] as const).every(
    (k) => properties[k] === "PASS",
  );
  const skipped: CardProperty[] = [];
  if (!first) skipped.push("denominator");
  if (
    held.policy &&
    held.as_of &&
    held.deals &&
    !(first && properties.denominator === "PASS")
  )
    skipped.push("counts_recompute");
  if (!isStandard(properties))
    return {
      state: "refused",
      own: ownCopy,
      properties,
      held,
      witnessIn,
      registerIn,
      skipped,
      fails: CARD_PROPERTIES.filter((p) => properties[p] === "FAIL"),
    };
  return {
    state: "card",
    own: ownCopy,
    properties,
    held,
    skipped,
    witnessIn,
    registerIn,
    covered: rootCovered(ctx),
    card,
    entriesMatch,
    asOf,
    deals: inputs.deals,
  };
}
