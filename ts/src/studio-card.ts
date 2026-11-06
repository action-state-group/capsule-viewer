// SPDX-License-Identifier: Apache-2.0
/**
 * The History card in its two forms (docs/design/studio-page.md section 5,
 * capsule-viewer#291): the card view, the card drawn in full, and the stapled
 * form, the compact line that travels in a first-contact header.
 *
 * The card is a `standard_history/1` or `/2` object (agent-action-capsule
 * spec/standard-history-v0.md section 4) as its JCS bytes; a stapled card is
 * those bytes with their SHA-256 (spec/bindings/evidence-commitment-carriers-v0.md,
 * `history_cards[]`, V3). One function reads the bytes and returns the facts;
 * both forms draw from `cardFacts`, so they cannot show different counts or a
 * different digest. This module draws and checks the card's own counting
 * rules; it does not verify a signature or a checkpoint.
 */
import {
  decodeStrictJson,
  jcs,
  sha256Hex,
} from "@action-state-group/agent-action-capsule";
import PACK from "./wording/studio-card.en.json" with { type: "json" };

export const STUDIO_CARD_WORDING = PACK;
const WORDS = PACK.entries as Readonly<Record<string, string>>;

/** A word of the pack with its `{name}` slots filled. */
function w(key: string, vars: Readonly<Record<string, string>> = {}): string {
  const t = WORDS[key];
  if (t === undefined) throw new Error(`studio-card: no word ${key}`);
  return t.replace(/\{([a-z_]+)\}/gu, (_, n: string) => vars[n] ?? "");
}

/** One number or word of a card, in the order both forms show it. */
export interface CardFact {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** Also shown in the stapled form. Every compact fact is in the card view with the same value. */
  readonly compact: boolean;
}

export interface CardFacts {
  readonly derivation: "standard_history/1" | "standard_history/2";
  /** SHA-256 of the card bytes, lowercase hex. */
  readonly digest: string;
  readonly facts: readonly CardFact[];
}

export type CardResult =
  | { readonly ok: true; readonly card: CardFacts }
  | { readonly ok: false; readonly reasons: readonly string[] };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const MEMBERS = [
  "derivation",
  "holder_kind",
  "controller_class",
  "anchor",
  "since",
  "window",
  "policy",
  "in_window",
  "class_missing",
  "outcomes",
  "bands",
  "roles",
  "happened",
  "disputes",
] as const;

const TALLIES: Readonly<Record<string, readonly string[]>> = {
  in_window: ["of", "counted", "not_counted"],
  class_missing: ["of", "count"],
  outcomes: ["of", "held", "did_not_hold", "undecided"],
  unpriced: ["of", "held", "did_not_hold", "undecided"],
  roles: ["of", "provided", "bought"],
  happened: ["of", "stamped_by_both", "receipt_only", "no_record"],
};

const OUTCOME_KEYS = [
  "open",
  "for",
  "against",
  "split",
  "no_finding",
  "withdrawn",
] as const;
const FORUM_KEYS = ["auto", "network", "rail", "external"] as const;

const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function exactKeys(o: Obj, keys: readonly string[]): boolean {
  const have = Object.keys(o);
  return have.length === keys.length && keys.every((k) => k in o);
}

function tally(
  card: Obj,
  name: string,
  reasons: string[],
): Record<string, number> | undefined {
  const keys = TALLIES[name]!;
  const v = card[name];
  if (!isObj(v) || !exactKeys(v, keys) || !keys.every((k) => count(v[k]))) {
    reasons.push(`${name} is not a tally of ${keys.join(", ")}`);
    return undefined;
  }
  const t = v as Record<string, number>;
  if (name === "class_missing") {
    if (t["count"]! > t["of"]!) reasons.push("class_missing.count exceeds of");
  } else if (
    keys.filter((k) => k !== "of").reduce((s, k) => s + t[k]!, 0) !== t["of"]
  )
    reasons.push(`${name} does not sum to its of`);
  return t;
}

function disputeTally(
  card: Obj,
  side: "raised" | "received",
  reasons: string[],
): Obj | undefined {
  const outer = card["disputes"];
  if (!isObj(outer) || !exactKeys(outer, ["raised", "received"])) {
    reasons.push("disputes is not exactly raised and received");
    return undefined;
  }
  const d = outer[side];
  if (!isObj(d) || !exactKeys(d, ["of", "by_outcome", "by_forum"])) {
    reasons.push(`disputes.${side} is not a dispute tally`);
    return undefined;
  }
  const outcome = d["by_outcome"];
  const forum = d["by_forum"];
  const ok =
    count(d["of"]) &&
    isObj(outcome) &&
    exactKeys(outcome, ["of", ...OUTCOME_KEYS]) &&
    [...OUTCOME_KEYS, "of"].every((k) => count(outcome[k])) &&
    isObj(forum) &&
    exactKeys(forum, ["of", ...FORUM_KEYS]) &&
    [...FORUM_KEYS, "of"].every((k) => count(forum[k]));
  if (!ok) {
    reasons.push(`disputes.${side} is not a dispute tally`);
    return undefined;
  }
  const o = outcome as Record<string, number>;
  const f = forum as Record<string, number>;
  if (
    o["of"] !== d["of"] ||
    f["of"] !== d["of"] ||
    OUTCOME_KEYS.reduce((s, k) => s + o[k]!, 0) !== o["of"] ||
    FORUM_KEYS.reduce((s, k) => s + f[k]!, 0) !== f["of"]
  )
    reasons.push(`disputes.${side} does not sum to its of`);
  return d;
}

type Band = Record<string, number | string | null>;

const strs = (o: Record<string, number>): Record<string, string> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));

function bandTallies(v: unknown, reasons: string[]): Band[] | undefined {
  const keys = [
    "currency",
    "decade",
    "of",
    "held",
    "did_not_hold",
    "undecided",
  ];
  if (!Array.isArray(v)) {
    reasons.push("bands is not a list");
    return undefined;
  }
  const out: Band[] = [];
  for (const [i, b] of v.entries()) {
    const ok =
      isObj(b) &&
      exactKeys(b, keys) &&
      typeof b["currency"] === "string" &&
      /^([A-Z]{3}|[-a-z0-9]{3,8}:[-a-zA-Z0-9]{1,32}\/[a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128})$/u.test(
        b["currency"],
      ) &&
      (b["decade"] === null || Number.isSafeInteger(b["decade"])) &&
      ["of", "held", "did_not_hold", "undecided"].every((k) => count(b[k]));
    if (!ok) {
      reasons.push(`bands[${String(i)}] is not a band tally`);
      continue;
    }
    if ((b["of"] as number) < 1) {
      reasons.push(`bands[${String(i)}] has no counted deal`);
      continue;
    }
    if (
      (b["held"] as number) +
        (b["did_not_hold"] as number) +
        (b["undecided"] as number) !==
      b["of"]
    )
      reasons.push(`bands[${String(i)}] does not sum to its of`);
    out.push(b as Band);
  }
  // Sorted by currency (code point order), then decade with null first and
  // the rest numerically (SH section 4); one band per pair.
  const before = (x: Band, y: Band): boolean => {
    const cx = String(x["currency"]);
    const cy = String(y["currency"]);
    if (cx !== cy) return cx < cy;
    if (x["decade"] === null) return y["decade"] !== null;
    if (y["decade"] === null) return false;
    return (x["decade"] as number) < (y["decade"] as number);
  };
  for (let i = 1; i < out.length; i++)
    if (!before(out[i - 1]!, out[i]!))
      reasons.push("bands are not sorted by currency then decade, one each");
  return out.length === v.length ? out : undefined;
}

/**
 * Reads a card from its bytes: refuses a card that is not a `/1` or `/2` card
 * with exactly its members or whose tallies break the partition rules of
 * standard-history-v0 section 4, and returns the facts both forms draw.
 */
export async function cardFacts(bytes: Uint8Array): Promise<CardResult> {
  let card: unknown;
  try {
    card = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, reasons: ["the card is not JSON"] };
  }
  if (!isObj(card))
    return { ok: false, reasons: ["the card is not an object"] };
  // The card travels as JCS (SH section 4): the bytes must be the canonical
  // form of what they say, with no duplicate member, float or other spelling.
  try {
    const canonical = jcs(decodeStrictJson(bytes));
    if (
      canonical.length !== bytes.length ||
      canonical.some((b, i) => b !== bytes[i])
    )
      throw new Error("differs");
  } catch {
    return {
      ok: false,
      reasons: ["the card's bytes are not its JCS (RFC 8785) form"],
    };
  }
  const derivation = card["derivation"];
  if (
    derivation !== "standard_history/1" &&
    derivation !== "standard_history/2"
  )
    return {
      ok: false,
      reasons: ["derivation is not standard_history/1 or standard_history/2"],
    };
  const reasons: string[] = [];
  const members: string[] =
    derivation === "standard_history/2"
      ? [...MEMBERS, "unpriced"]
      : [...MEMBERS];
  if (!exactKeys(card, members))
    reasons.push(`the card's members are not exactly ${members.join(", ")}`);
  const word = (v: unknown, ok: readonly string[]): boolean =>
    typeof v === "string" && ok.includes(v);
  if (!word(card["holder_kind"], ["person", "node"]))
    reasons.push("holder_kind is not person or node");
  else if (
    card["controller_class"] !==
    (card["holder_kind"] === "person" ? "person_declared" : "node_declared")
  )
    reasons.push("controller_class does not match holder_kind");
  for (const k of ["anchor", "policy"])
    if (typeof card[k] !== "string" || !/^[0-9a-f]{64}$/u.test(card[k]))
      reasons.push(`${k} is not 64 lowercase hex characters`);
  if (
    typeof card["since"] !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/u.test(card["since"])
  )
    reasons.push("since is not YYYY-MM");
  const win = card["window"];
  const windowText =
    isObj(win) &&
    exactKeys(win, ["months"]) &&
    Number.isSafeInteger(win["months"]) &&
    (win["months"] as number) > 0
      ? win["months"] === 1
        ? w("window.months.one")
        : w("window.months", { n: String(win["months"]) })
      : isObj(win) && exactKeys(win, ["all"]) && win["all"] === true
        ? w("window.all")
        : undefined;
  if (windowText === undefined)
    reasons.push("window is not {months: N} or {all: true}");
  const inWindow = tally(card, "in_window", reasons);
  const missing = tally(card, "class_missing", reasons);
  const outcomes = tally(card, "outcomes", reasons);
  const roles = tally(card, "roles", reasons);
  const happened = tally(card, "happened", reasons);
  const unpriced =
    derivation === "standard_history/2"
      ? tally(card, "unpriced", reasons)
      : undefined;
  const bands = bandTallies(card["bands"], reasons);
  const raised = disputeTally(card, "raised", reasons);
  const received = disputeTally(card, "received", reasons);
  if (
    inWindow !== undefined &&
    [missing, outcomes, roles, happened].some(
      (t) => t !== undefined && t["of"] !== inWindow["counted"],
    )
  )
    reasons.push("in_window.counted is not the of of the counted tallies");
  if (outcomes !== undefined && bands !== undefined) {
    const priced = (k: string): number =>
      bands.reduce((s, b) => s + (b[k] as number), 0);
    for (const k of ["of", "held", "did_not_hold", "undecided"]) {
      const total = priced(k) + (unpriced?.[k] ?? 0);
      if (total !== outcomes[k])
        reasons.push(
          `the bands${unpriced ? " and unpriced" : ""} do not sum to outcomes.${k}`,
        );
    }
  }
  if (
    reasons.length > 0 ||
    windowText === undefined ||
    inWindow === undefined ||
    outcomes === undefined ||
    roles === undefined ||
    happened === undefined ||
    raised === undefined ||
    received === undefined
  )
    return { ok: false, reasons };
  const n = (v: number): string => String(v);
  const raisedOf = raised["of"] as number;
  const receivedOf = received["of"] as number;
  const dispute = (id: string, side: string, t: Obj): CardFact[] => {
    const o = t["by_outcome"] as Record<string, number>;
    const fo = t["by_forum"] as Record<string, number>;
    const who = w("disputes.who.shared");
    return [
      f(
        `${id}_outcomes`,
        w("disputes.outcomes", { of: n(o["of"]!), who, ...strs(o) }),
        "",
      ),
      f(
        `${id}_forums`,
        w("disputes.forums", { of: n(fo["of"]!), ...strs(fo) }),
        "",
      ),
    ].map((x) => ({ ...x, label: `${side}: ${x.label}` }));
  };
  const of = (t: Record<string, number>, k: string): string =>
    w("count.of", { n: n(t[k]!), of: n(t["of"]!) });
  const f = (
    id: string,
    label: string,
    value: string,
    compact = true,
  ): CardFact => ({ id, label, value, compact });
  const facts: CardFact[] = [
    f(
      "holder",
      w(card["holder_kind"] === "person" ? "holder.person" : "holder.node"),
      "",
      false,
    ),
    f("since", w("holder.since", { month: String(card["since"]) }), "", false),
    f("window", windowText, "", false),
    f("in_window", w("deals.in_window"), n(inWindow["of"]!)),
    f("counted", w("deals.counted"), of(inWindow, "counted")),
    f(
      "not_counted",
      w("counts.not_counted.shared", {
        n: n(inWindow["not_counted"]!),
        of: n(inWindow["of"]!),
      }),
      "",
    ),
    f(
      "class_missing",
      w("counts.class_missing", {
        n: n(missing!["count"]!),
        of: n(missing!["of"]!),
      }),
      "",
    ),
    f("held", w("outcome.held"), of(outcomes, "held")),
    f("did_not_hold", w("outcome.did_not_hold"), of(outcomes, "did_not_hold")),
    f("undecided", w("outcome.undecided"), of(outcomes, "undecided")),
    ...(unpriced === undefined
      ? []
      : [
          f(
            "unpriced",
            w("deals.unpriced"),
            w("deals.unpriced.value", {
              n: n(unpriced["of"]!),
              of: n(outcomes["of"]!),
              held: n(unpriced["held"]!),
              did_not_hold: n(unpriced["did_not_hold"]!),
              undecided: n(unpriced["undecided"]!),
            }),
          ),
        ]),
    ...bands!.map((b, i) =>
      f(
        `band_${i}`,
        w("band", {
          currency: String(b["currency"]),
          decade:
            b["decade"] === null
              ? w("band.zero")
              : w("band.decade", { n: String(b["decade"]) }),
        }),
        w("band.value", {
          held: String(b["held"]),
          did_not_hold: String(b["did_not_hold"]),
          undecided: String(b["undecided"]),
          of: String(b["of"]),
        }),
      ),
    ),
    f("provided", w("role.provided.shared"), of(roles, "provided")),
    f("bought", w("role.bought.shared"), of(roles, "bought")),
    f(
      "stamped_by_both",
      w("happened.stamped_by_both"),
      of(happened, "stamped_by_both"),
    ),
    f(
      "receipt_only",
      w("happened.receipt_only.shared"),
      of(happened, "receipt_only"),
    ),
    f("no_record", w("happened.no_record"), of(happened, "no_record")),
    f("disputes_raised", w("disputes.raised.shared"), n(raisedOf)),
    ...dispute("disputes_raised", w("disputes.raised.shared"), raised),
    f("disputes_received", w("disputes.received.shared"), n(receivedOf)),
    ...dispute("disputes_received", w("disputes.received.shared"), received),
  ];
  return {
    ok: true,
    card: { derivation, digest: await sha256Hex(bytes), facts },
  };
}

const TOKEN = /^[a-z0-9_-]+$/u;

function esc(text: string): string {
  return text.replace(/[&<>"']/gu, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}

/** Callers hold a `CardFacts` from `cardFacts`, but the renderers do not trust it: ids and digests are checked, text is escaped. */
function checked(card: CardFacts): string {
  const token = card.derivation.replace("/", "-");
  if (
    !TOKEN.test(token) ||
    !/^[0-9a-f]{64}$/u.test(card.digest) ||
    card.facts.some((f) => !TOKEN.test(f.id))
  )
    throw new Error("studio-card: not facts from cardFacts");
  return token;
}

/** The card view: every fact with its label, and the digest. */
export function cardViewHtml(card: CardFacts): string {
  const token = checked(card);
  const rows = card.facts
    .map(
      (f) =>
        `<div data-fact="${f.id}"><dt>${esc(f.label)}</dt>${f.value === "" ? "" : `<dd>${esc(f.value)}</dd>`}</div>`,
    )
    .join("");
  return `<section class="cv-card" data-card="view" data-derivation="${token}"><h3>${esc(w("card.title"))}</h3><dl>${rows}</dl><p data-card-statement>${esc(w("card.statement"))}</p><p>${esc(w("card.digest"))} <code data-card-digest>${card.digest}</code></p></section>`;
}

/** The stapled form: the compact facts, with the card view's own values, and the same digest, on one line. */
export function stapledCardHtml(card: CardFacts): string {
  const token = checked(card);
  const line = card.facts
    .filter((f) => f.compact)
    .map(
      (f) =>
        `<span data-fact="${f.id}">${esc(f.label)}${f.value === "" ? "" : ` <b>${esc(f.value)}</b>`}</span>`,
    )
    .join(" · ");
  return `<p class="cv-card-stapled" data-card="stapled" data-derivation="${token}">${line} · <span data-card-statement>${esc(w("card.statement.short"))}</span> · <code data-card-digest>${card.digest}</code></p>`;
}

/** A refused card, drawn as one visible refusal in either form. */
export function cardRefusalHtml(reasons: readonly string[]): string {
  return `<p class="cv-card-refused" data-card="refused">${esc(w("card.refused", { reasons: reasons.join("; ") }))}</p>`;
}
