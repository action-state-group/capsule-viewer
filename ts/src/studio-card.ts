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
import { sha256Hex } from "@action-state-group/agent-action-capsule";

/** One number or word of a card, in the order both forms show it. */
export interface CardFact {
  readonly id: string;
  readonly label: string;
  readonly value: string;
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
): number | undefined {
  const d = isObj(card["disputes"]) ? card["disputes"][side] : undefined;
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
  return d["of"] as number;
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
  const inWindow = tally(card, "in_window", reasons);
  const missing = tally(card, "class_missing", reasons);
  const outcomes = tally(card, "outcomes", reasons);
  const roles = tally(card, "roles", reasons);
  const happened = tally(card, "happened", reasons);
  if (derivation === "standard_history/2") tally(card, "unpriced", reasons);
  const raised = disputeTally(card, "raised", reasons);
  const received = disputeTally(card, "received", reasons);
  if (
    inWindow !== undefined &&
    [missing, outcomes, roles, happened].some(
      (t) => t !== undefined && t["of"] !== inWindow["counted"],
    )
  )
    reasons.push("in_window.counted is not the of of the counted tallies");
  if (
    inWindow !== undefined &&
    inWindow["counted"]! + inWindow["not_counted"]! !== inWindow["of"]
  )
    reasons.push("in_window does not sum to its of");
  if (
    reasons.length > 0 ||
    inWindow === undefined ||
    outcomes === undefined ||
    roles === undefined ||
    happened === undefined ||
    raised === undefined ||
    received === undefined
  )
    return { ok: false, reasons };
  const n = (v: number): string => String(v);
  const facts: CardFact[] = [
    {
      id: "in_window",
      label: "Deals in the window",
      value: n(inWindow["of"]!),
    },
    { id: "counted", label: "Counted", value: n(inWindow["counted"]!) },
    { id: "held", label: "Held", value: n(outcomes["held"]!) },
    {
      id: "did_not_hold",
      label: "Did not hold",
      value: n(outcomes["did_not_hold"]!),
    },
    { id: "undecided", label: "Undecided", value: n(outcomes["undecided"]!) },
    { id: "provided", label: "Provided", value: n(roles["provided"]!) },
    { id: "bought", label: "Bought", value: n(roles["bought"]!) },
    {
      id: "stamped_by_both",
      label: "Stamped by both",
      value: n(happened["stamped_by_both"]!),
    },
    {
      id: "receipt_only",
      label: "Receipt only",
      value: n(happened["receipt_only"]!),
    },
    { id: "no_record", label: "No record", value: n(happened["no_record"]!) },
    { id: "disputes_raised", label: "Disputes raised", value: n(raised) },
    { id: "disputes_received", label: "Disputes received", value: n(received) },
  ];
  return {
    ok: true,
    card: { derivation, digest: await sha256Hex(bytes), facts },
  };
}

/** The card view: every fact with its label, and the digest. */
export function cardViewHtml(card: CardFacts): string {
  const rows = card.facts
    .map(
      (f) =>
        `<div data-fact="${f.id}"><dt>${f.label}</dt><dd>${f.value}</dd></div>`,
    )
    .join("");
  return `<section class="cv-card" data-card="view" data-derivation="${card.derivation.replace("/", "-")}"><h3>History card</h3><dl>${rows}</dl><p>Card SHA-256 <code data-card-digest>${card.digest}</code></p></section>`;
}

/** The stapled form: the same facts and digest on one compact line. */
export function stapledCardHtml(card: CardFacts): string {
  const line = card.facts
    .map((f) => `<span data-fact="${f.id}">${f.label} ${f.value}</span>`)
    .join(" · ");
  return `<p class="cv-card-stapled" data-card="stapled" data-derivation="${card.derivation.replace("/", "-")}">${line} · <code data-card-digest>${card.digest}</code></p>`;
}

/** A refused card, drawn as one visible refusal in either form. */
export function cardRefusalHtml(reasons: readonly string[]): string {
  const text = reasons
    .join("; ")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;");
  return `<p class="cv-card-refused" data-card="refused">History card refused: ${text}</p>`;
}
