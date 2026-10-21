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
 * fold one verdict into another. The lines that say what the page checked,
 * what the bundle withholds, and what is the producer's rather than evidence
 * are locked (LOCKED_ENTRIES): a pack cannot reword them. The raw verdict is
 * always on the element as data, whatever the words say.
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

/**
 * Every `{placeholder}` `text` uses, in the order it uses them, repeats and
 * all: a count and a denominator in one entry are two placeholders, not one,
 * and a replacement that reorders or drops a repeat changes what the
 * sentence can say with them.
 */
export function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]!);
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
  // The sealed verdicts as the Outcomes proofs name them.
  [
    "lines.pf.verdict.met",
    "lines.pf.verdict.not_met",
    "lines.pf.verdict.not_evaluable",
    "lines.pf.verdict.failed",
    "lines.pf.verdict.unsupported",
    "lines.pf.verdict.not_applicable",
  ],
  // The assurance tier (judged vs. recomputed) must stay a non-swappable
  // set too: a judgement must never read as a check anyone can repeat.
  [
    "groups.tier.judged",
    "groups.tier.recomputed",
    "groups.tier.mixed",
    "groups.tier.unstated",
  ],
  [
    "lines.tier.judged",
    "lines.tier.recomputed",
    "lines.tier.mixed",
    "lines.tier.unknown",
  ],
];

/**
 * Lines that state what this page checked or did not check, what the bundle
 * does not carry or withholds, and which text is the producer's rather than
 * sealed evidence. A pack may not reword them: they are the page's honesty,
 * not its voice. A pack that carries one of these entries with any text but
 * the default's is refused (a pack that repeats the default, as a copied
 * file does, changes nothing and passes).
 */
export const LOCKED_ENTRIES: ReadonlySet<string> = new Set([
  // The front block (report-provenance.ts): who judged, who witnessed, what verified.
  "prov.judge.none",
  "prov.judge.model.does-not-recompute",
  "prov.judge.model.differs",
  "prov.judge.model.partly-stated",
  "prov.judge.model.not-stated",
  "prov.judge.all-withheld",
  "prov.judge.some-withheld",
  "prov.judge.not-carried",
  "prov.judge.unread",
  "prov.judge.checker-not-stated",
  "prov.judge.recomputed",
  "prov.judge.unnamed",
  "prov.judge.nothing",
  "prov.witness.stated",
  "prov.witness.none",
  "prov.witness.receipt-not-stated",
  "prov.witness.stubs.one",
  "prov.witness.stubs.other",
  "prov.witness.malformed.one",
  "prov.witness.malformed.other",
  "prov.witness.about.unchecked",
  "prov.witness.about.unsigned",
  "prov.verifier.ran",
  "prov.verifier.ran.cll",
  "prov.verifier.ran.not-stated",
  "prov.verifier.commit.not-stated",
  "prov.verifier.built",
  "prov.verifier.built.not-stated",
  "prov.verifier.version.not-stated",
  // Both cards: a rule or conversation nobody could decide, by why.
  "status.undecided.unjudged",
  "status.undecided.withheld",
  "status.undecided.unavailable",
  // Both cards: dating, withheld reports, the conversation, the proofs.
  "report.not-stated",
  "report.span.unknown",
  "report.basis.source",
  "report.basis.record",
  "report.basis.judged",
  "report.dating.source",
  "report.dating.record",
  "report.dating.mixed",
  "report.dating.mixed.source",
  "report.dating.mixed.record",
  "report.dating.mixed.judged",
  "report.dating.self-attested",
  "report.dating.tz",
  "report.gap.notes.withheld",
  "report.gap.notes.unread",
  "report.gap.notes.some-withheld",
  "report.gap.notes.none",
  "report.pf.case-record.not-stated",
  "report.pf.dated.no-zone",
  "report.pf.input-digest.verified",
  "report.pf.input-digest.cited",
  "report.pf.transcript.absent",
  "report.pf.transcript.not-shown",
  "report.pf.transcript.default-reason",
  "report.pf.wording.default",
  "report.pf.wording.supplied",
  "report.pin.withheld",
  "report.pin.unread",
  "report.pin.not-in-bundle",
  "report.vd.uncomputable",
  "report.vd.absent",
  "chat.absent",
  "chat.record.not-stated",
  "chat.not-shown",
  "chat.not-shown.default-reason",
  "chat.state.cited",
  "chat.state.verified",
  "chat.lede",
  // The Outcomes report.
  "lines.tier.unknown",
  "lines.wording.unstated",
  "lines.wording.mixed",
  "lines.wording-note.sealed",
  "lines.wording-note.unstated",
  "lines.wording-note.partly",
  "lines.edited.title",
  "lines.producer-note.kicker",
  "lines.producer-note.source",
  "lines.no-note.withheld",
  "lines.no-note.mismatch",
  "lines.no-note.unreadable",
  "lines.no-note.invalid",
  "lines.no-note.none",
  "lines.line.unverified.help",
  "lines.gap.wording.mixed",
  "lines.gap.wording.none",
  "lines.pf.case-record.from-claims",
  "lines.pf.judge-pin.recomputed",
  "lines.pf.col.rationale",
  "lines.pf.no-claim",
  "lines.pf.not-cited",
  "lines.pf.derived",
  "lines.pf.sealed-rationale",
  "lines.pin.differs",
  "lines.pin.not-stated",
  "lines.why-missed.unstructured",
  "lines.stamp",
  "lines.stamp.small",
  "lines.hc.none",
  "lines.terms.lede",
  "lines.terms.lede.agreed",
  "lines.terms.version.value",
  "lines.ran.judge-pin.recomputed",
  "lines.ran.agent.value",
  "lines.ran.components-mismatch",
  "lines.ran.lock",
  "lines.ran.pin-mismatch",
  "lines.vd.note",
  "lines.rp.tamper",
  "lines.cal.source-says",
  "lines.cal.tz",
  // The EU AI Act Results.
  "groups.producer.title",
  "groups.tier.unstated",
  "groups.tier.judged.title",
  "groups.tier.recomputed.title",
  "groups.pack.not-stated",
  "groups.row.nothing",
  "groups.summary.basis",
  "groups.pf.case-record.from-claims",
  "groups.pf.no-claim",
  "groups.pf.rationale",
  "groups.pf.absent",
  "groups.pin.none",
  "groups.od.mapped",
  "groups.od.unmapped",
  "groups.od.wording.sealed",
  "groups.od.wording.mixed",
  "groups.od.wording.unstated",
  "groups.q.none",
  "groups.q.unspecified",
  "groups.vd.note",
]);

/** Bidi and other invisible format controls: refused outright, never merely stripped for comparison, so the string this module checks is the string the browser renders. */
const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

/**
 * A word as a reader tells it apart: compatibility forms folded, whitespace
 * collapsed, case ignored, punctuation and symbols dropped. "Met", "met " and
 * "(met)." are one word to a reader; "✓ met" reads as "met" too, not as a
 * decorated word distinct from it.
 */
function asRead(word: string): string {
  return word
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/** Letters from more than one of Latin, Greek and Cyrillic: "mеt" with a Cyrillic е reads as "met". */
function mixesScripts(word: string): boolean {
  return (
    [/\p{Script=Latin}/u, /\p{Script=Greek}/u, /\p{Script=Cyrillic}/u].filter(
      (script) => script.test(word),
    ).length > 1
  );
}

/**
 * Every problem with `pack` as a replacement for `defaults`: a locked line
 * (LOCKED_ENTRIES) reworded, an entry whose placeholders differ from the
 * entry it replaces, a `layout.grouping` that is
 * not the default's, verdict words two verdicts would share (as read), a
 * verdict worded as another verdict reads by default, and a verdict word with
 * nothing visible in it. Entries the defaults do not have are not this
 * module's and are not checked.
 */
export function wordingProblems(
  pack: WordingPack,
  defaults: WordingPack,
): string[] {
  const problems: string[] = [];
  for (const [key, text] of Object.entries(pack.entries)) {
    if (INVISIBLE.test(text))
      problems.push(
        `${key} carries a bidi or other invisible format character, never only stripped for a check: refused outright`,
      );
    if (!Object.hasOwn(defaults.entries, key)) continue;
    const base = defaults.entries[key]!;
    if (LOCKED_ENTRIES.has(key)) {
      if (text !== base)
        problems.push(
          `${key}: this line states what the page checked and can't be reworded`,
        );
      continue;
    }
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
    const members = set.map((m) => (typeof m === "string" ? [m] : [...m]));
    // Each verdict's default words, as read: a pack may not give one verdict
    // the word another verdict reads as by default (met and not met swapped).
    const defaultOf = new Map<string, string>();
    for (const keys of members)
      for (const k of keys)
        if (Object.hasOwn(defaults.entries, k))
          defaultOf.set(asRead(defaults.entries[k]!), keys.join(" / "));
    const seen = new Map<string, string>();
    for (const keys of members) {
      const name = keys.join(" / ");
      const words = new Set<string>();
      for (const k of keys) {
        if (!Object.hasOwn(merged, k)) continue;
        const word = asRead(merged[k]!);
        if (word === "") problems.push(`${k} has no visible word`);
        else if (mixesScripts(word))
          problems.push(
            `${k} mixes Latin, Greek and Cyrillic letters (${JSON.stringify(word)}); a verdict word is written in one script`,
          );
        else words.add(word);
      }
      for (const word of words) {
        const other = seen.get(word);
        if (other !== undefined)
          problems.push(
            `${name} and ${other} read alike (${JSON.stringify(word)}); two verdicts must not share a word`,
          );
        else seen.set(word, name);
        const owner = defaultOf.get(word);
        if (owner !== undefined && owner !== name)
          problems.push(
            `${name} reads ${JSON.stringify(word)}, the word for ${owner}; a verdict must not take another verdict's word`,
          );
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
    const text = Object.hasOwn(entries, key) ? entries[key] : undefined;
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
