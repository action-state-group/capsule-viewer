// SPDX-License-Identifier: BSD-3-Clause
import {
  sha256Hex,
  type WordingPackInput,
} from "@action-state-group/agent-action-capsule";
import OUTCOMES_PACK from "./wording/contract-report-outcomes.en.json" with { type: "json" };
import EU_AI_ACT_PACK from "./wording/contract-report-eu-ai-act.en.json" with { type: "json" };

/**
 * The words of the contract-report module (contract-report.ts), and the
 * wording packs they come from.
 *
 * Every word a reader sees on a contract report -- labels, headings, the
 * plain-language lines, the verdict words -- is an entry of an
 * `aac.wording-pack/v0` pack (presentation contract section 7.4). The
 * module ships two default packs, beside its code and never in a bundle
 * (section 6: wording never comes from the bundle):
 *
 *   wording/contract-report-outcomes.en.json   the Outcomes report
 *   wording/contract-report-eu-ai-act.en.json  the EU AI Act Results
 *
 * A host may hand a page a pack of its own (`renderEvidenceGraph`'s
 * `wording`, the same pack the presentation builder carries), bound to its
 * bytes by `wording_sha256`. Its entries replace the default pack's entry
 * for the same key; keys this module does not know (a page title, another
 * module's words) are left to their owners.
 *
 * A pack changes words only. It holds strings and nothing else; every count,
 * verdict, digest and record id on the page is computed by the module and
 * put into a pack's sentence through its `{placeholders}`, and a replacement
 * entry must carry exactly the placeholders of the entry it replaces, so a
 * pack can neither drop a count or a denominator nor invent one. The words
 * for two different verdicts must stay different words, so a pack cannot
 * fold one verdict into another. The raw verdict is always on the element
 * as data, whatever the words say.
 *
 * Plurals are two entries, `<key>.one` and `<key>.other`, chosen by count.
 */

export const WORDING_PACK_VERSION = "aac.wording-pack/v0";
const WORDING_KEY = /^[a-z0-9][a-z0-9._-]*$/u;
const LOCALE = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/u;
const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/gu;

/** A wording pack, read and shape-checked. */
export interface WordingPack {
  readonly id: string;
  readonly locale: string;
  readonly entries: Readonly<Record<string, string>>;
}

/** A pack that is not an `aac.wording-pack/v0` object, or does not fit this module. */
export class WordingPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WordingPackError";
  }
}

/** Shape-check a parsed pack (contract 7.4): id, locale and non-empty string entries, nothing else. */
export function readWordingPack(pack: unknown): WordingPack {
  const p = pack as Record<string, unknown>;
  const entries = p?.entries as Record<string, unknown> | undefined;
  if (
    pack === null ||
    typeof pack !== "object" ||
    Array.isArray(pack) ||
    Object.keys(p).some(
      (k) => !["wording_pack_version", "id", "locale", "entries"].includes(k),
    ) ||
    p.wording_pack_version !== WORDING_PACK_VERSION ||
    typeof p.id !== "string" ||
    typeof p.locale !== "string" ||
    !LOCALE.test(p.locale) ||
    entries === null ||
    typeof entries !== "object" ||
    Array.isArray(entries) ||
    Object.keys(entries).length === 0 ||
    Object.entries(entries).some(
      ([k, v]) => !WORDING_KEY.test(k) || typeof v !== "string" || v === "",
    )
  )
    throw new WordingPackError(
      `wording pack is not an ${WORDING_PACK_VERSION} object`,
    );
  return {
    id: p.id,
    locale: p.locale,
    entries: entries as Record<string, string>,
  };
}

/**
 * Check a distributed pack against its digest (the exact bytes, hashed as
 * given) and its shape, and read it.
 */
export async function checkWordingPackInput(
  wording: WordingPackInput,
): Promise<WordingPack> {
  if (!/^[0-9a-f]{64}$/u.test(wording.sha256))
    throw new WordingPackError("wording sha256 is not a lowercase hex SHA-256");
  const digest = await sha256Hex(new TextEncoder().encode(wording.pack));
  if (digest !== wording.sha256)
    throw new WordingPackError(
      "wording pack bytes do not hash to its wording_sha256",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(wording.pack);
  } catch {
    throw new WordingPackError("wording pack is not JSON");
  }
  return readWordingPack(parsed);
}

/** The `{placeholders}` an entry uses, sorted and de-duplicated. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]!))].sort();
}

// ---------------------------------------------------------------------------
// The default packs, and which grouping each is for
// ---------------------------------------------------------------------------

/** The two ways the module lays a report out; a pack names its own in `layout.grouping`. */
export type ContractReportGrouping = "lines" | "groups";

export const DEFAULT_PACKS: Readonly<
  Record<ContractReportGrouping, WordingPack>
> = Object.freeze({
  lines: readWordingPack(OUTCOMES_PACK),
  groups: readWordingPack(EU_AI_ACT_PACK),
});

/**
 * Entries whose words name a verdict. Within each set, no two keys may share
 * a word (except where the set says so), so a pack cannot make two verdicts
 * read alike. The three undecided variants of one verdict may share a word:
 * the default plain set does.
 */
const DISTINCT: readonly (readonly (string | readonly string[])[])[] = [
  [
    "verdict.met",
    "verdict.not_met",
    "verdict.not_applicable",
    "verdict.failed",
    "verdict.unsupported",
    [
      "verdict.not_evaluable.judged",
      "verdict.not_evaluable.unjudged",
      "verdict.not_evaluable.withheld",
      "verdict.not_evaluable.unavailable",
    ],
  ],
  [
    "status.resolved",
    "status.missed",
    "status.nothing-applied",
    "status.unverified",
    [
      "status.undecided.judged",
      "status.undecided.unjudged",
      "status.undecided.none",
      "status.undecided.withheld",
      "status.undecided.unavailable",
    ],
  ],
];

/**
 * Every problem with `pack` as a replacement for `defaults`: an entry whose
 * placeholders differ from the entry it replaces, a `layout.grouping` that is
 * not the default's, and verdict words two verdicts would share. Entries the
 * defaults do not have are not this module's and are not checked.
 */
export function wordingProblems(
  pack: WordingPack,
  defaults: WordingPack,
): string[] {
  const problems: string[] = [];
  for (const [key, text] of Object.entries(pack.entries)) {
    const base = defaults.entries[key];
    if (base === undefined) continue;
    if (key.startsWith("layout.")) {
      if (text !== base)
        problems.push(
          `${key} is ${JSON.stringify(text)}; this report is laid out as ${JSON.stringify(base)}`,
        );
      continue;
    }
    const want = placeholders(base);
    const got = placeholders(text);
    if (want.join(" ") !== got.join(" "))
      problems.push(
        `${key} uses {${got.join("} {")}}; it must use exactly {${want.join("} {")}}`,
      );
  }
  const merged = { ...defaults.entries, ...pack.entries };
  for (const set of DISTINCT) {
    const seen = new Map<string, string>();
    for (const member of set) {
      const keys = typeof member === "string" ? [member] : member;
      const words = new Set(keys.map((k) => merged[k]!));
      for (const word of words) {
        const other = seen.get(word);
        if (other !== undefined)
          problems.push(
            `${keys.join(" / ")} and ${other} read alike (${JSON.stringify(word)}); two verdicts must not share a word`,
          );
        else seen.set(word, keys.join(" / "));
      }
    }
  }
  return problems.map((p) => `${pack.id}: ${p}`);
}

// ---------------------------------------------------------------------------
// The words a card is drawn with
// ---------------------------------------------------------------------------

/** Where a card's words came from, for its proofs. */
export interface WordingSource {
  readonly id: string;
  /** The supplied pack's `wording_sha256`; absent for the default pack built into this viewer. */
  readonly sha256?: string;
}

export interface Words {
  /** Entry `key`, its `{placeholders}` filled from `vars`. */
  t(key: string, vars?: Readonly<Record<string, string | number>>): string;
  /** `key.one` when `count` is 1, else `key.other`; `{n}` is the count (as `toLocaleString()` writes it) unless `vars` gives it. */
  p(
    key: string,
    count: number,
    vars?: Readonly<Record<string, string | number>>,
  ): string;
  readonly grouping: ContractReportGrouping;
  readonly source: WordingSource;
}

function fill(
  key: string,
  text: string,
  vars: Readonly<Record<string, string | number>>,
): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    if (!Object.hasOwn(vars, name))
      throw new WordingPackError(`${key}: no value for {${name}}`);
    return String(vars[name]);
  });
}

/** The words over `defaults`, with `supplied`'s entries in place of the defaults' where it has them. */
export function wordsOf(
  defaults: WordingPack,
  supplied?: { readonly pack: WordingPack; readonly sha256?: string },
): Words {
  const entries: Readonly<Record<string, string>> =
    supplied === undefined
      ? defaults.entries
      : { ...defaults.entries, ...supplied.pack.entries };
  const t = (
    key: string,
    vars: Readonly<Record<string, string | number>> = {},
  ): string => {
    const text = entries[key];
    if (text === undefined)
      throw new WordingPackError(`${defaults.id}: no entry ${key}`);
    return fill(key, text, vars);
  };
  const grouping = entries["layout.grouping"];
  if (grouping !== "lines" && grouping !== "groups")
    throw new WordingPackError(
      `${defaults.id}: layout.grouping is ${JSON.stringify(grouping)}`,
    );
  return {
    t,
    p: (key, count, vars = {}) =>
      t(`${key}.${count === 1 ? "one" : "other"}`, {
        n: count.toLocaleString(),
        ...vars,
      }),
    grouping,
    source:
      supplied === undefined
        ? { id: defaults.id }
        : {
            id: supplied.pack.id,
            ...(supplied.sha256 === undefined
              ? {}
              : { sha256: supplied.sha256 }),
          },
  };
}

/**
 * The words for a card laid out as `grouping`: the default pack, or the
 * host's pack over it once it checks against its digest and fits this
 * module. Throws `WordingPackError` naming every problem; a card is never
 * drawn with words that did not check.
 */
export async function contractReportWords(
  grouping: ContractReportGrouping,
  wording?: WordingPackInput,
): Promise<Words> {
  const defaults = DEFAULT_PACKS[grouping];
  if (wording === undefined) return wordsOf(defaults);
  const pack = await checkWordingPackInput(wording);
  const problems = wordingProblems(pack, defaults);
  if (problems.length > 0) throw new WordingPackError(problems.join("; "));
  return wordsOf(defaults, { pack, sha256: wording.sha256 });
}

/** The default words of one grouping, for the shared parts' callers that are handed none. */
export const DEFAULT_WORDS: Readonly<Record<ContractReportGrouping, Words>> =
  Object.freeze({
    lines: wordsOf(DEFAULT_PACKS.lines),
    groups: wordsOf(DEFAULT_PACKS.groups),
  });
