// SPDX-License-Identifier: BSD-3-Clause
import {
  EVIDENCE_STATUSES,
  GRADES,
  sha256Hex,
  SUFFICIENCIES,
  TIERS,
  type WordingPackInput,
} from "@action-state-group/agent-action-capsule";
import OUTCOMES_PACK from "./wording/contract-report-outcomes.en.json" with { type: "json" };
import EU_AI_ACT_PACK from "./wording/contract-report-eu-ai-act.en.json" with { type: "json" };

/**
 * The words of the contract-report module (contract-report.ts), and the
 * wording packs they come from.
 *
 * The module's own words on a contract report -- labels, headings, the
 * plain-language lines, the verdict words -- are each an entry of an
 * `aac.wording-pack/v0` pack (presentation contract section 7.4). Not
 * every word on the page is the pack's: the bundle's own producer-supplied
 * text and two lines agent-action-capsule's outcome model writes are not
 * (report-levels.ts's and compliance-view.ts's own docs say which). The
 * module ships two default packs, beside its code and never in a bundle
 * (section 6: this module's own wording never comes from the bundle):
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

/** Bidi and other invisible format controls: refused outright, never merely stripped for comparison, so the string this module checks is the string the browser renders. */
const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

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
    INVISIBLE.test(p.id) ||
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

/**
 * The text between each pair of consecutive `{placeholder}`s in `text`, in
 * order: one entry fewer than `placeholders(text)`. Used to catch a pack
 * that keeps a sentence's placeholder order but drops the word between two
 * of them, so two counts the sentence computed separately (a count and its
 * denominator) could run together on the page ("2 of 10" read as "210").
 */
function placeholderGaps(text: string): string[] {
  const matches = [...text.matchAll(PLACEHOLDER)];
  const gaps: string[] = [];
  for (let i = 1; i < matches.length; i++)
    gaps.push(
      text.slice(
        matches[i - 1]!.index + matches[i - 1]![0].length,
        matches[i]!.index,
      ),
    );
  return gaps;
}

const HAS_NON_SPACE = /\S/u;
const HAS_LETTER = /\p{L}/u;
/**
 * Latin letters (after `asRead` folds case and Cyrillic/Greek look-alikes)
 * that read as a digit between two counts: "{count}O{total}" or
 * "{count}O {total}" reads as one number ("59O 768" as 590 768), and
 * "{count} OOO {total}" as a thousands group (59 000 768), so a gap with
 * only these has no word in it -- unless it is one letter with a space on
 * both sides ("59 o 768" is Welsh for "59 of 768").
 */
const DIGIT_LIKE = /[oil]/gu;

// ---------------------------------------------------------------------------
// contract-report/v1 section 3: the keys the kind defines
// ---------------------------------------------------------------------------

/**
 * The enum values contract-report/v1 section 3 gives a word each, lowercased
 * (agent-action-capsule's TIERS, GRADES, SUFFICIENCIES and EVIDENCE_STATUSES).
 * The verdicts are the four Result v0 defines; this module's own extra drawn
 * verdicts (failed, unsupported, not applicable) keep their grouping keys.
 */
export const SECTION3_ENUMS = Object.freeze({
  verdict: ["met", "not_met", "not_evaluable", "out_of_scope"],
  tier: TIERS.map((v) => v.toLowerCase()),
  grade: GRADES.map((v) => v.toLowerCase()),
  sufficiency: SUFFICIENCIES.map((v) => v.toLowerCase()),
  status: EVIDENCE_STATUSES.map((v) => v.toLowerCase()),
} as const);

/**
 * A key whose meaning contract-report/v1 section 3 fixes. The module's own
 * keys never use these prefixes (`report.`, `group.`, `row.`, `verdict.`,
 * `sufficiency.`, `tier.`, `grade.`, `status.`, `applicability.`,
 * `contract_fact.`); its own words sit under `card.`, `lines.`, `groups.`
 * and the shared prefixes (`prov.`, `chat.`, `case.`, `judge.`).
 */
export const SECTION3_PREFIXES: readonly string[] = Object.freeze([
  "report.",
  "group.",
  "row.",
  "verdict.",
  "sufficiency.",
  "tier.",
  "grade.",
  "status.",
  "applicability.",
  "contract_fact.",
]);

/**
 * The section 3 keys that name the same thing a grouping already has a word
 * for, and that grouping's keys for it. A host pack's section 3 entry sets
 * each of them unless the same pack also sets the grouping's own key, which
 * is more specific and wins. The section 3 entry is then checked exactly as
 * that grouping key would be (placeholders, DISTINCT, the clean/not-clean
 * categories, locks): a section 3 word can never say what the grouping's own
 * key could not.
 */
const SECTION3_ALIASES: Readonly<
  Record<ContractReportGrouping, Readonly<Record<string, readonly string[]>>>
> = Object.freeze({
  lines: {
    "report.title": ["lines.title"],
    // The rule table's pill and the proofs table's cell both name the
    // verdict, so a section 3 word reaches both.
    "verdict.met": ["lines.verdict.met", "lines.pf.verdict.met"],
    "verdict.not_met": ["lines.verdict.not_met", "lines.pf.verdict.not_met"],
    "verdict.not_evaluable": [
      "lines.verdict.not_evaluable.judged",
      "lines.verdict.not_evaluable.unjudged",
      "lines.verdict.not_evaluable.withheld",
      "lines.verdict.not_evaluable.unavailable",
      "lines.pf.verdict.not_evaluable",
    ],
    "verdict.out_of_scope": [
      "lines.verdict.out_of_scope",
      "lines.pf.verdict.out_of_scope",
    ],
    "tier.recomputed": ["lines.tier.recomputed"],
    "tier.judged": ["lines.tier.judged"],
  },
  groups: {
    "report.title": ["groups.kicker"],
    "verdict.met": ["groups.verdict.met"],
    "verdict.not_met": ["groups.verdict.not_met"],
    "verdict.not_evaluable": [
      "groups.verdict.not_evaluable.judged",
      "groups.verdict.not_evaluable.unjudged",
      "groups.verdict.not_evaluable.withheld",
      "groups.verdict.not_evaluable.unavailable",
    ],
    "verdict.out_of_scope": ["groups.verdict.out_of_scope"],
    "tier.recomputed": ["groups.tier.recomputed"],
    "tier.judged": ["groups.tier.judged"],
  },
});

/**
 * `pack` with each section 3 alias it carries copied onto the grouping keys
 * it names (SECTION3_ALIASES), where the pack does not set them itself.
 * Every check and every lookup reads this expanded form, so a section 3
 * word and a grouping word are one entry to the rest of this module.
 */
function expandSection3(
  pack: WordingPack,
  grouping: ContractReportGrouping,
): WordingPack {
  const aliases = SECTION3_ALIASES[grouping];
  const entries: Record<string, string> = { ...pack.entries };
  for (const [key, targets] of Object.entries(aliases))
    if (Object.hasOwn(pack.entries, key))
      for (const target of targets)
        if (!Object.hasOwn(pack.entries, target))
          entries[target] = pack.entries[key]!;
  return { ...pack, entries };
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
  // This module's own rule verdict words (contract-report.ts: the bare
  // `verdict.*` namespace stays contract-report/v1 §3's), one set per
  // grouping -- the Outcomes card's and the EU card's prefixes never
  // compare against each other, each pack names only its own.
  [
    "lines.verdict.met",
    "lines.verdict.not_met",
    "lines.verdict.not_applicable",
    "lines.verdict.failed",
    "lines.verdict.unsupported",
    "lines.verdict.out_of_scope",
    [
      "lines.verdict.not_evaluable.judged",
      "lines.verdict.not_evaluable.unjudged",
      "lines.verdict.not_evaluable.withheld",
      "lines.verdict.not_evaluable.unavailable",
    ],
  ],
  [
    "groups.verdict.met",
    "groups.verdict.not_met",
    "groups.verdict.not_applicable",
    "groups.verdict.failed",
    "groups.verdict.unsupported",
    "groups.verdict.out_of_scope",
    "groups.verdict.not_yet_in_force",
    [
      "groups.verdict.not_evaluable.judged",
      "groups.verdict.not_evaluable.unjudged",
      "groups.verdict.not_evaluable.withheld",
      "groups.verdict.not_evaluable.unavailable",
    ],
  ],
  [
    "lines.status.resolved",
    "lines.status.missed",
    "lines.status.nothing-applied",
    "lines.status.unverified",
    [
      "lines.status.undecided.judged",
      "lines.status.undecided.unjudged",
      "lines.status.undecided.none",
      "lines.status.undecided.withheld",
      "lines.status.undecided.unavailable",
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
    "lines.pf.verdict.out_of_scope",
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
  // The Outcomes headline row labels.
  [
    "lines.line.resolved",
    "lines.line.missed",
    "lines.line.undecided",
    "lines.line.unverified",
    "lines.line.held",
    "lines.line.added",
  ],
  // An obligation's summary pill (EU card): "could not be checked" must
  // never read as "no exceptions" or the reverse.
  [
    "groups.ob.unchecked",
    "groups.ob.later",
    ["groups.ob.ok", "groups.ob.ok.found", "groups.ob.ok.unverified"],
  ],
  // A test row's summary pill (EU card).
  [
    "groups.row.nothing",
    "groups.row.none-decided",
    "groups.row.out-of-scope",
    "groups.row.later",
    ["groups.row.ok", "groups.row.ok.all-decided"],
  ],
  // A session's pill inside a test's drill-down (EU card).
  [
    "groups.session.ok",
    "groups.session.undecided",
    "groups.session.unverified",
    "groups.session.none",
  ],
  // A conversation's "why" line (Outcomes card): the same {names} signature
  // on all three, so a pack could otherwise swap a missed conversation's
  // reason for an undecided one's, or the reverse.
  ["lines.why.missed", "lines.why.unverified", "lines.why.undecided"],
  // The rules table's column header for a rule nobody could decide, and for
  // one whose claim could not be verified (Outcomes card).
  ["lines.rules.col.undecided", "lines.rules.col.unverified"],
  // A test row's undecided and unverified counts (EU card).
  ["groups.row.undecided-note", "groups.row.unverified-note"],
];

/**
 * The semantic category of every entry a card's skeleton relies on reading
 * one way: a result is clean, an exception, something nobody could decide,
 * something that could not be verified, something that could not be checked
 * at all, something nothing applied to, a result held for a person or added
 * by one, or one of the two assurance tiers. Defined once, so every guarded
 * key is in exactly one category and `categoryCollisions` below has a single
 * map to walk, not two separate lists (4344180862, 4344180866, 4344180870:
 * the old CLEAN_WORD_KEYS / NOT_CLEAN_WORD_KEYS split only ever compared a
 * "clean" set against one catch-all "not-clean" set, so it missed the
 * failed/unsupported verdicts entirely, missed a pack that renames the
 * clean side and reopens its old default word on the not-clean side, and
 * missed two not-clean ideas -- an exceptions count and an undecided note --
 * reading alike). Words shared within one category stay allowed by design:
 * the undecided variants' default is one plain word.
 */
type GuardedCategory =
  | "clean"
  | "exception"
  | "undecided"
  | "unverifiable"
  | "unchecked"
  | "not-applicable"
  | "held"
  | "added"
  | "later"
  | "tier.recomputed"
  | "tier.judged";

const GUARDED_CATEGORY: Readonly<Record<string, GuardedCategory>> = {
  // met/clean: a rule was met, a row resolved, or nothing exceptioned.
  "lines.verdict.met": "clean",
  "groups.verdict.met": "clean",
  "lines.pf.verdict.met": "clean",
  "lines.line.resolved": "clean",
  "lines.status.resolved": "clean",
  "groups.ob.ok": "clean",
  "groups.ob.ok.found": "clean",
  "groups.ob.ok.unverified": "clean",
  "groups.row.ok": "clean",
  "groups.row.ok.all-decided": "clean",
  "groups.session.ok": "clean",

  // not-met/exception: a rule was not met or missed, or a row's or an
  // obligation's red exceptions count.
  "lines.verdict.not_met": "exception",
  "groups.verdict.not_met": "exception",
  "lines.pf.verdict.not_met": "exception",
  "lines.line.missed": "exception",
  "lines.status.missed": "exception",
  "groups.row.exceptions.one": "exception",
  "groups.row.exceptions.other": "exception",
  "groups.count.exception.one": "exception",
  "groups.count.exception.other": "exception",

  // could-not-decide: nobody could decide.
  "lines.line.undecided": "undecided",
  "lines.status.undecided.judged": "undecided",
  "lines.status.undecided.unjudged": "undecided",
  "lines.status.undecided.none": "undecided",
  "lines.status.undecided.withheld": "undecided",
  "lines.status.undecided.unavailable": "undecided",
  "lines.pf.verdict.not_evaluable": "undecided",
  "lines.verdict.not_evaluable.judged": "undecided",
  "lines.verdict.not_evaluable.unjudged": "undecided",
  "lines.verdict.not_evaluable.withheld": "undecided",
  "lines.verdict.not_evaluable.unavailable": "undecided",
  "groups.verdict.not_evaluable.judged": "undecided",
  "groups.verdict.not_evaluable.unjudged": "undecided",
  "groups.verdict.not_evaluable.withheld": "undecided",
  "groups.verdict.not_evaluable.unavailable": "undecided",
  "groups.session.undecided": "undecided",
  "groups.row.undecided-note": "undecided",

  // could-not-verify: a claim is unverified, or its verification failed or
  // is unsupported -- all six failed/unsupported verdict keys included.
  "lines.line.unverified": "unverifiable",
  "lines.status.unverified": "unverifiable",
  "groups.session.unverified": "unverifiable",
  "lines.verdict.failed": "unverifiable",
  "lines.verdict.unsupported": "unverifiable",
  "groups.verdict.failed": "unverifiable",
  "groups.verdict.unsupported": "unverifiable",
  "lines.pf.verdict.failed": "unverifiable",
  "lines.pf.verdict.unsupported": "unverifiable",
  "groups.row.unverified-note": "unverifiable",

  // could-not-check: nothing could be checked at all.
  "groups.ob.unchecked": "unchecked",
  "groups.ob.unchecked-of": "unchecked",
  "groups.row.nothing": "unchecked",
  "groups.row.none-decided": "unchecked",

  // did-not-apply: no rule or test applied, so nothing was checked; never
  // a met or a missed result.
  "lines.verdict.not_applicable": "not-applicable",
  "groups.verdict.not_applicable": "not-applicable",
  "lines.pf.verdict.not_applicable": "not-applicable",
  "lines.status.nothing-applied": "not-applicable",
  "groups.session.none": "not-applicable",
  // Judged out of scope (Result v0 section 4.2): it did not arise. Its own
  // count, never met, so it reads with did-not-apply, never with clean.
  "lines.verdict.out_of_scope": "not-applicable",
  "groups.verdict.out_of_scope": "not-applicable",
  "lines.pf.verdict.out_of_scope": "not-applicable",
  "groups.row.out-of-scope": "not-applicable",

  // later: a claim not yet in force (Result v0 section 4.3), readiness
  // only; never a result that counts.
  "groups.verdict.not_yet_in_force": "later",
  "groups.ob.later": "later",
  "groups.row.later": "later",

  // held: a person's spot check disagreed with a resolved result, which is
  // held back for a person to decide.
  "lines.line.held": "held",

  // added: a person's spot check graded a missed result as resolved; it must
  // not read as a plain resolved result, which no person overrode.
  "lines.line.added": "added",

  // recomputed tier: a fixed check anyone can repeat from the records.
  "lines.tier.recomputed": "tier.recomputed",
  "groups.tier.recomputed": "tier.recomputed",

  // judged tier: a judgement, which must never read like the recomputed
  // tier above.
  "lines.tier.judged": "tier.judged",
  "groups.tier.judged": "tier.judged",
};

/** A human-readable noun phrase for each GuardedCategory, for problem messages. */
const CATEGORY_LABEL: Readonly<Record<GuardedCategory, string>> = {
  clean: "a met/clean result",
  exception: "a not-met/exception result",
  undecided: "something nobody could decide",
  unverifiable: "something that could not be verified",
  unchecked: "something that could not be checked at all",
  "not-applicable": "something nothing applied to",
  held: "a result held for a person to decide",
  added: "a result a person's check added",
  later: "a claim not yet in force",
  "tier.recomputed": "the recomputed tier",
  "tier.judged": "the judged tier",
};

/**
 * Lines that state what this page checked or did not check, what the bundle
 * does not carry or withholds, and which text is the producer's rather than
 * sealed evidence. A pack may not reword them: they are the page's honesty,
 * not its voice. A pack that carries one of these entries with any text but
 * the default's is refused (a pack that repeats the default, as a copied
 * file does, changes nothing and passes).
 */
export const LOCKED_ENTRIES: ReadonlySet<string> = new Set([
  // contract-report/v1 section 3: the assurance words each claim shows (its
  // carrier status, grade and sufficiency). They state what the sealed claim
  // says about its own evidence, so a pack cannot make WITHHELD read as
  // clean or a self-attested grade read as witnessed.
  ...SECTION3_ENUMS.status.map((v) => `status.${v}`),
  ...SECTION3_ENUMS.grade.map((v) => `grade.${v}`),
  ...SECTION3_ENUMS.sufficiency.map((v) => `sufficiency.${v}`),
  // The shared front (report-front.ts): the mock-judge line, what the
  // aggregate's unknown count is, what the page and the bundle carry, and
  // the producer's findings label.
  "front.mock",
  "front.agg.unknown.one",
  "front.agg.unknown.other",
  "front.agg.mismatch",
  "front.agg.as-of",
  "front.agg.copied.both",
  "front.agg.copied.dates",
  "front.agg.copied.switch",
  // The bucket labels name a verdict: a pack cannot make one read as another.
  "front.agg.bucket.met",
  "front.agg.bucket.not_met",
  "front.agg.bucket.not_evaluable",
  "front.agg.bucket.out_of_scope",
  "front.check.s1",
  "front.check.s3.receipt",
  "front.check.s3.none",
  "front.findings.label",
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
  "prov.witness.about",
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
  "lines.status.undecided.unjudged",
  "lines.status.undecided.withheld",
  "lines.status.undecided.unavailable",
  // Both cards: dating, withheld reports, the conversation, the proofs.
  "card.not-stated",
  "card.span.unknown",
  "card.basis.source",
  "card.basis.record",
  "card.basis.judged",
  "card.dating.source",
  "card.dating.record",
  "card.dating.mixed",
  "card.dating.mixed.source",
  "card.dating.mixed.record",
  "card.dating.mixed.judged",
  "card.dating.self-attested",
  "card.dating.tz",
  "card.gap.notes.withheld",
  "card.gap.notes.unread",
  "card.gap.notes.some-withheld",
  "card.gap.notes.none",
  "card.pf.case-record.not-stated",
  "card.pf.dated",
  "card.pf.dated.no-zone",
  "card.pf.input-digest.verified",
  "card.pf.input-digest.cited",
  "card.pf.transcript.absent",
  "card.pf.transcript.not-shown",
  "card.pf.transcript.default-reason",
  "card.pf.wording.default",
  "card.pf.wording.supplied.layered",
  "card.pf.assurance",
  "card.pin.withheld",
  "card.pin.unread",
  "card.pin.not-in-bundle",
  "card.vd.uncomputable",
  "card.vd.absent",
  "chat.absent",
  "chat.record.not-stated",
  "chat.not-shown",
  "chat.not-shown.default-reason",
  "chat.state.cited",
  "chat.state.verified",
  "chat.lede",
  "chat.state.record",
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
  "lines.sentence.unverified.unsupported",
  "lines.sentence.unverified.failed",
  "lines.sentence.unverified",
  "lines.why.unverified",
  "lines.sentence.undecided",
  "lines.why.nothing-applied",
  "lines.cal.lede",
  "lines.line.resolved.help",
  "lines.line.missed.help",
  "lines.line.undecided.help",
  "lines.line.held.help",
  "lines.line.added.help",
  "lines.gap.wording.mixed",
  "lines.gap.wording.none",
  "lines.pf.case-record.from-claims",
  "lines.pf.judge-pin.recomputed",
  "lines.pf.col.rationale",
  "lines.pf.no-claim",
  "lines.pf.not-cited",
  "lines.pf.derived",
  "lines.pf.sealed-rationale",
  "lines.pf.recompute",
  "lines.pin.differs",
  "lines.pin.not-stated",
  "lines.why-missed.structured",
  "lines.why-missed.unstructured",
  // The folded provenance line is the only provenance a reader sees
  // without opening it: every entry is the page's own account.
  "prov.brief.judge.stated",
  "prov.brief.judge.mixed",
  "prov.brief.judge.partial",
  "prov.brief.judge.withheld",
  "prov.brief.judge.not-stated",
  "prov.brief.judge.mock",
  "prov.brief.witness.stated",
  "prov.brief.witness.mixed",
  "prov.brief.witness.not-stated",
  "prov.brief.verifier.stated",
  "prov.brief.verifier.not-stated",
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
  "lines.cal.lede.dated",
  "lines.cal.sealed",
  "lines.tier.mixed",
  "lines.meta.what-checked.text",
  // The spelled-out numbers up to twelve: a pack must not make "2" read as
  // "one hundred".
  "lines.count.0",
  "lines.count.1",
  "lines.count.2",
  "lines.count.3",
  "lines.count.4",
  "lines.count.5",
  "lines.count.6",
  "lines.count.7",
  "lines.count.8",
  "lines.count.9",
  "lines.count.10",
  "lines.count.11",
  "lines.count.12",
  // Has no placeholder of its own: a pack could otherwise make "1 verdict"
  // read as any count it likes ("one hundred verdicts").
  "lines.pf.verdicts.one",
  "lines.na-note.one",
  "lines.na-note.other",
  "lines.sentence.undecided.none",
  "lines.why.undecided.none",
  "lines.sentence.nothing-applied",
  "lines.note.not-applicable",
  // The EU AI Act Results.
  "groups.producer.title",
  "groups.tier.unstated",
  "groups.tier.judged.title",
  "groups.tier.recomputed.title",
  "groups.tier.mixed",
  "groups.pack.not-stated",
  "groups.row.nothing",
  "groups.row.none-decided",
  "groups.row.ok",
  "groups.row.ok.all-decided",
  "groups.row.unverified-note",
  "groups.unverified-note",
  "groups.ob.unchecked",
  "groups.ob.unchecked-of",
  "groups.ob.ok",
  "groups.ob.ok.found",
  "groups.ob.ok.unverified",
  "groups.summary.basis",
  "groups.summary.lede",
  "groups.pf.case-record.from-claims",
  "groups.pf.no-claim",
  "groups.pf.rationale",
  "groups.pf.absent",
  "groups.pin.none",
  "groups.pin.differs",
  "groups.od.mapped",
  "groups.od.unmapped",
  "groups.od.wording.sealed",
  "groups.od.wording.mixed",
  "groups.od.wording.unstated",
  "groups.q.none",
  "groups.q.unspecified",
  "groups.q.tail",
  "groups.ran.contract.differs",
  "groups.vd.note",
  // Out of scope and not yet in force (Result v0 sections 4.2, 4.3): what
  // they count and what is copied from the contract, not checked here.
  "lines.oos-note.one",
  "lines.oos-note.other",
  "groups.later.note",
  "groups.later.conditions-not-stated",
  "groups.row.later-note",
  // A refused wording layer (contract-report/v1 section 3): the page says
  // so, and which layer drew it.
  "card.wording.refused",
  "card.wording.refused.digest",
  "card.wording.refused.shape",
  "card.wording.refused.fit",
  "card.pf.wording.refused",
]);

/**
 * Cyrillic and Greek letters that are visual homoglyphs of a Latin letter,
 * folded to that Latin letter before any word comparison: a verdict word
 * written wholly in one of these scripts -- never mixing scripts, so
 * `mixesScripts` below would not catch it -- can otherwise read exactly
 * like a different verdict's Latin word (an all-Cyrillic "мет" is "met" to
 * a reader, letter for letter) and pass the DISTINCT and clean/not-clean
 * checks, which only compare the normalized text. Covers the letters
 * actually used in common script-spoofing lists, not a full confusables
 * table (uts39's is thousands of entries across every script, not only
 * these two). Keyed by capital (or caseless) letter only: `asRead`
 * uppercases before it folds, so a word and the same word in another case
 * always fold alike ("ΕΤΣΙ" and "ετσι" are one word to a reader).
 */
const CONFUSABLES: Readonly<Record<string, string>> = {
  А: "A",
  В: "B",
  Е: "E",
  З: "Z",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  У: "Y",
  Х: "X",
  І: "I",
  Ј: "J",
  Ѕ: "S",
  Ԛ: "Q",
  Ԝ: "W",
  Α: "A",
  Β: "B",
  Ε: "E",
  Ζ: "Z",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
  Ϲ: "C",
  Ϳ: "J",
  Һ: "H",
  Ԁ: "D",
  Ӏ: "I",
  ǀ: "l",
};
const CONFUSABLE = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "gu");

/**
 * Lowercase Greek letters that read as a different Latin letter than their
 * capital does (ν is "v" but Ν is "N"), folded before case is touched so
 * the capital's reading never stands in for theirs.
 */
const LOWER_CONFUSABLES: Readonly<Record<string, string>> = {
  ν: "v",
  η: "n",
  μ: "u",
};
const LOWER_CONFUSABLE = new RegExp(
  `[${Object.keys(LOWER_CONFUSABLES).join("")}]`,
  "gu",
);

/**
 * `word` with every `{placeholder}` dropped (a count the page fills in is
 * not part of the word itself: "{n} met" reads as "met"), compatibility
 * forms folded, punctuation and symbols turned into a space (so internal
 * punctuation still separates words: "not-met" reads as "not met", never
 * "notmet"), whitespace collapsed -- but case and homoglyphs both left
 * alone, so a genuine Cyrillic or Greek word still reads as the one script
 * it is written in (case does not affect which script a letter belongs to,
 * so leaving it be does not weaken `mixesScripts`). Used only for
 * `mixesScripts` and the "no visible word" check, both case-insensitive by
 * nature: a real word must be judged by the letters it actually has, not by
 * what CONFUSABLES maps some of them to.
 */
function asReadUnfolded(word: string): string {
  return word
    .replace(PLACEHOLDER, "")
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * A word as its homoglyph reading: `asReadUnfolded`, with the lowercase
 * letters that read unlike their capital folded first (LOWER_CONFUSABLES),
 * then lowercased and uppercased (so ß and ẞ both become SS), every
 * Cyrillic or Greek homoglyph folded to the Latin letter it reads as
 * (CONFUSABLES, keyed by capital letter), and case ignored. An
 * all-Cyrillic "мет" reads as "met", as does "ΜΕΤ"; "ν" reads as "v".
 * Because ν and Ν read as different Latin letters, this reading alone can
 * tell "ναι" from "ΝΑΙ": `readings` pairs it with a plain case fold.
 */
function asRead(word: string): string {
  return asReadUnfolded(word)
    .replace(LOWER_CONFUSABLE, (c) => LOWER_CONFUSABLES[c]!)
    .toLowerCase()
    .toUpperCase()
    .replace(CONFUSABLE, (c) => CONFUSABLES[c]!)
    .toLowerCase();
}

/**
 * Every way a reader may read `word`, for comparisons (DISTINCT,
 * categoryCollisions): its homoglyph reading (`asRead`) and its case fold in
 * its own script, so "Met", "met " and "(met)." are one word, as are "ναι"
 * and "ΝΑΙ" or "ordnungsgemäß" and "ORDNUNGSGEMÄẞ", and "мет" is "met". Two
 * words read alike when any reading of one is a reading of the other. Never
 * used for `mixesScripts`, which needs the word before any folding.
 */
function readings(word: string): string[] {
  const caseFolded = asReadUnfolded(word)
    .toLowerCase()
    .toUpperCase()
    .toLowerCase();
  const read = asRead(word);
  return read === caseFolded ? [read] : [read, caseFolded];
}

/** Letters from more than one of Latin, Greek and Cyrillic in `word` as actually written (`asReadUnfolded`, no homoglyph folded): a genuine word in one script never mixes, however many of its letters CONFUSABLES would fold; a spoof mixing a real Latin letter with a lookalike still does. */
function mixesScripts(word: string): boolean {
  return (
    [/\p{Script=Latin}/u, /\p{Script=Greek}/u, /\p{Script=Cyrillic}/u].filter(
      (script) => script.test(word),
    ).length > 1
  );
}

/**
 * Every pair of GUARDED_CATEGORY entries from two DIFFERENT categories that,
 * as read, are the same word (4344180862, 4344180866, 4344180870): a result
 * of one category must never read like a result of another. Compared are
 * both the merged word (`merged`, the pack's entries over the defaults --
 * the same lookup `wordingProblems` checks DISTINCT against) and each
 * entry's own shipped default, in both directions: comparing only the
 * merged words would miss a pack that renames its own clean-side entries
 * away from "resolved" while giving a not-clean entry the word "resolved"
 * -- the clean side no longer reads "resolved" in the merged pack, but the
 * gap it left at the clean side's default word is still open for the other
 * category to walk into. Two entries of the SAME category may share a word
 * (the undecided variants' shared "could not decide" by design): that is
 * not this check's business.
 */
function categoryCollisions(
  merged: Readonly<Record<string, string>>,
  defaults: WordingPack,
): string[] {
  const problems: string[] = [];
  // Single pass, the same owner-map style the DISTINCT loop above uses: the
  // first key to read a given word claims it, and any later key with a
  // different category reading the same word is refused against that owner.
  const seen = new Map<string, { key: string; category: GuardedCategory }>();
  // One problem per pair of keys, however many of their readings collide.
  const reported = new Set<string>();
  const visit = (
    key: string,
    category: GuardedCategory,
    source: Readonly<Record<string, string>>,
  ): void => {
    if (!Object.hasOwn(source, key)) return;
    for (const word of readings(source[key]!)) {
      if (word === "") continue;
      const owner = seen.get(word);
      if (owner === undefined) seen.set(word, { key, category });
      else if (
        owner.category !== category &&
        !reported.has(`${owner.key}\n${key}`)
      ) {
        reported.add(`${owner.key}\n${key}`);
        problems.push(
          `${owner.key} and ${key} read alike (${JSON.stringify(word)}); ${CATEGORY_LABEL[owner.category]} must not read like ${CATEGORY_LABEL[category]}, or the other way round`,
        );
      }
    }
  };
  for (const [key, category] of Object.entries(GUARDED_CATEGORY)) {
    visit(key, category, merged);
    visit(key, category, defaults.entries);
  }
  return problems;
}

/**
 * Every problem with `pack` as a replacement for `defaults`: a locked line
 * (LOCKED_ENTRIES) reworded, an entry whose placeholders differ from the
 * entry it replaces, a `layout.grouping` that is
 * not the default's, verdict words two verdicts would share (as read), a
 * verdict worded as another verdict reads by default, a verdict word with
 * nothing visible in it, and an entry of one GUARDED_CATEGORY reading like an
 * entry of a different one (a met result like a missed one, an exceptions
 * count like an undecided note, and so on). Entries the defaults do not have
 * are not this module's and are not checked.
 */
export function wordingProblems(
  supplied: WordingPack,
  defaults: WordingPack,
): string[] {
  const grouping = defaults.entries["layout.grouping"];
  const pack =
    grouping === "lines" || grouping === "groups"
      ? expandSection3(supplied, grouping)
      : supplied;
  const problems: string[] = [];
  if (grouping === "lines" || grouping === "groups")
    for (const [key, targets] of Object.entries(SECTION3_ALIASES[grouping]))
      if (Object.hasOwn(supplied.entries, key))
        for (const target of targets)
          if (
            Object.hasOwn(supplied.entries, target) &&
            supplied.entries[target] !== supplied.entries[key]
          )
            problems.push(
              `${key} and ${target} name the same thing and must say the same; this pack gives them different words`,
            );
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
    else {
      const baseGaps = placeholderGaps(base);
      const gotGaps = placeholderGaps(text);
      for (let i = 0; i < gotGaps.length; i++) {
        const baseGap = baseGaps[i]!;
        const gotGap = gotGaps[i]!;
        const runsTogether = HAS_LETTER.test(baseGap)
          ? !HAS_LETTER.test(gotGap) ||
            (!HAS_LETTER.test(asRead(gotGap).replace(DIGIT_LIKE, "")) &&
              !(/^\s[^]*\s$/u.test(gotGap) && [...asRead(gotGap)].length === 1))
          : HAS_NON_SPACE.test(baseGap) && !HAS_NON_SPACE.test(gotGap);
        if (runsTogether)
          problems.push(
            `${key} runs {${got[i]}} and {${got[i + 1]}} together with no word between them; two counts the page computes separately must not be able to read as one`,
          );
      }
    }
  }
  // Only entries the defaults have: a key this module does not own changes
  // nothing on the page, so it must not take part in any comparison either.
  const merged = { ...defaults.entries };
  for (const [key, text] of Object.entries(pack.entries))
    if (Object.hasOwn(defaults.entries, key)) merged[key] = text;
  for (const set of DISTINCT) {
    const members = set.map((m) => (typeof m === "string" ? [m] : [...m]));
    // Each verdict's default words, as read: a pack may not give one verdict
    // the word another verdict reads as by default (met and not met swapped).
    const defaultOf = new Map<string, string>();
    for (const keys of members)
      for (const k of keys)
        if (Object.hasOwn(defaults.entries, k))
          for (const word of readings(defaults.entries[k]!))
            defaultOf.set(word, keys.join(" / "));
    const seen = new Map<string, string>();
    for (const keys of members) {
      const name = keys.join(" / ");
      const words = new Set<string>();
      for (const k of keys) {
        if (!Object.hasOwn(merged, k)) continue;
        const unfolded = asReadUnfolded(merged[k]!);
        if (unfolded === "") problems.push(`${k} has no visible word`);
        else if (mixesScripts(unfolded))
          problems.push(
            `${k} mixes Latin, Greek and Cyrillic letters (${JSON.stringify(unfolded)}); a verdict word is written in one script`,
          );
        else for (const word of readings(merged[k]!)) words.add(word);
      }
      // One problem per pair of verdicts, however many readings collide.
      const shared = new Set<string>();
      const taken = new Set<string>();
      for (const word of words) {
        const other = seen.get(word);
        if (other !== undefined) {
          if (!shared.has(other))
            problems.push(
              `${name} and ${other} read alike (${JSON.stringify(word)}); two verdicts must not share a word`,
            );
          shared.add(other);
        } else seen.set(word, name);
        const owner = defaultOf.get(word);
        if (owner !== undefined && owner !== name && !taken.has(owner)) {
          problems.push(
            `${name} reads ${JSON.stringify(word)}, the word for ${owner}; a verdict must not take another verdict's word`,
          );
          taken.add(owner);
        }
      }
    }
  }
  problems.push(...categoryCollisions(merged, defaults));
  return problems.map((p) => `${pack.id}: ${p}`);
}

// ---------------------------------------------------------------------------
// The words a card is drawn with
// ---------------------------------------------------------------------------

/**
 * Where a card's words came from, for its proofs. `base` is this viewer's
 * own default pack -- present whether or not a host supplied one, since
 * contract-report/v1 §3 records every wording layer applied, including
 * the one layer a default-only page still has; `sha256` is the digest of
 * the pack actually named by `id`, absent only when a caller (a test) built
 * `Words` from a pack it never hashed. `refused` is a host layer that did
 * not check (§3: a refused layer contributes no words): the card is drawn
 * with the base layer alone, and says so.
 */
export interface WordingSource {
  readonly id: string;
  readonly sha256?: string;
  readonly base?: { readonly id: string; readonly sha256: string };
  readonly refused?: {
    /** The digest the host gave the layer, as given. */
    readonly sha256: string;
    /** Why, as a reason code, never the pack's own text. */
    readonly reason: "digest" | "shape" | "fit";
  };
}

/**
 * sha256 of each default pack exactly as this package ships it --
 * `wording/contract-report-outcomes.en.json` and
 * `wording/contract-report-eu-ai-act.en.json`, the literal file bytes, not
 * a re-serialized form -- so the proofs line's digest is the one a reader
 * who downloads this package and hashes the file themselves actually gets,
 * the same canonical form a supplied pack's `wording_sha256` already uses
 * (`checkWordingPackInput` hashes the bytes as given, never a re-encoding).
 * contract-report.test.ts hashes the real files on disk and checks these
 * still match; regenerate with `sha256sum ts/src/wording/*.en.json` after
 * editing either file.
 */
export const DEFAULT_PACK_SHA256: Readonly<
  Record<ContractReportGrouping, string>
> = Object.freeze({
  lines: "ba8d75cba5f0dfd3d2b799d57ff9306e6b8496af966f3c0dc9c30ecb082cbe57",
  groups: "dfc79c80d539b48f3208bfd4fb76e2922f2418c9de4841222043822008749f49",
});

export interface Words {
  /** Entry `key`, its `{placeholders}` filled from `vars`. */
  t(key: string, vars?: Readonly<Record<string, string | number>>): string;
  /** `key.one` when `count` is 1, else `key.other`; `{n}` is the count (as `toLocaleString()` writes it) unless `vars` gives it. */
  p(
    key: string,
    count: number,
    vars?: Readonly<Record<string, string | number>>,
  ): string;
  /**
   * A contract-report/v1 section 3 word, after layering: the entry for the
   * key `family` + `value` assemble to, or undefined when no layer has it or
   * the assembled key is not a valid WordingKey (§3: the caller then shows
   * the raw token or identifier, never a guess). `row` and `group` words
   * apply only when every claim cites the same `contract_ref`: otherwise
   * undefined, so a multi-contract Result shows raw identifiers.
   */
  section3(key: string): string | undefined;
  /** A section 3 enum word (`status`, `grade`, `sufficiency`, `tier`, `verdict`): the layered word for the lowercased value, or the raw value itself. */
  enumWord(
    family: "status" | "grade" | "sufficiency" | "tier" | "verdict",
    value: string,
  ): string;
  /** The `row.<ref>.<part>` word for this Result, or undefined (see `section3`). */
  row(
    requirementRef: string,
    part: "label" | "detail" | "not_evaluable",
  ): string | undefined;
  /** The `group.<segment>.title` word for this Result, or undefined (see `section3`). */
  group(segment: string): string | undefined;
  readonly grouping: ContractReportGrouping;
  readonly source: WordingSource;
}

/** How the Result a card draws bears on its words: whether the per-contract keys (`row.*`, `group.*`) apply. */
export interface WordsContext {
  /** True when every claim cites the same `contract_ref` (contract-report/v1 §3). */
  readonly singleContract: boolean;
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

/**
 * The words over `defaults`, with `supplied`'s entries in place of the
 * defaults' where it has them. `context` defaults closed
 * (`singleContract: false`): a caller that has not checked
 * `citesOneContract` itself gets raw identifiers for `row`/`group`, never a
 * guess that a multi-contract Result is safe to label per-contract.
 */
export function wordsOf(
  defaults: WordingPack,
  supplied?: {
    readonly pack: WordingPack;
    readonly sha256?: string;
  },
  context: WordsContext = { singleContract: false },
  refused?: WordingSource["refused"],
): Words {
  const declared = defaults.entries["layout.grouping"];
  const entries: Readonly<Record<string, string>> =
    supplied === undefined
      ? defaults.entries
      : {
          ...defaults.entries,
          ...(declared === "lines" || declared === "groups"
            ? expandSection3(supplied.pack, declared)
            : supplied.pack
          ).entries,
        };
  const t = (
    key: string,
    vars: Readonly<Record<string, string | number>> = {},
  ): string => {
    const text = Object.hasOwn(entries, key) ? entries[key] : undefined;
    if (text === undefined)
      throw new WordingPackError(`${defaults.id}: no entry ${key}`);
    return fill(key, text, vars);
  };
  const section3 = (key: string): string | undefined =>
    WORDING_KEY.test(key) && Object.hasOwn(entries, key)
      ? entries[key]
      : undefined;
  const grouping = entries["layout.grouping"];
  if (grouping !== "lines" && grouping !== "groups")
    throw new WordingPackError(
      `${defaults.id}: layout.grouping is ${JSON.stringify(grouping)}`,
    );
  const base = { id: defaults.id, sha256: DEFAULT_PACK_SHA256[grouping] };
  return {
    t,
    p: (key, count, vars = {}) =>
      t(`${key}.${count === 1 ? "one" : "other"}`, {
        n: count.toLocaleString(),
        ...vars,
      }),
    section3,
    // A section 3 word that names what the grouping already has a word
    // for (SECTION3_ALIASES) is read through the grouping's own key, the
    // one every check covers, so the two can never disagree on the page.
    enumWord: (family, value) => {
      const key = `${family}.${value.toLowerCase()}`;
      const target = SECTION3_ALIASES[grouping][key]?.[0];
      return target !== undefined ? t(target) : (section3(key) ?? value);
    },
    row: (requirementRef, part) =>
      context.singleContract
        ? section3(`row.${requirementRef}.${part}`)
        : undefined,
    group: (segment) =>
      context.singleContract ? section3(`group.${segment}.title`) : undefined,
    grouping,
    source:
      supplied === undefined
        ? {
            id: base.id,
            sha256: base.sha256,
            ...(refused === undefined ? {} : { base, refused }),
          }
        : {
            id: supplied.pack.id,
            ...(supplied.sha256 === undefined
              ? {}
              : { sha256: supplied.sha256 }),
            base,
          },
  };
}

/**
 * The words for a card laid out as `grouping`: the default pack, with the
 * host's pack over it entry by entry once it checks against its digest and
 * fits this module (contract-report/v1 §3 layering). A host layer that does
 * not check is refused and contributes no words: the card is drawn with the
 * default layer alone, and `source.refused` says why, so the page says so.
 * A builder that must refuse to write such a page (§3 allows it) checks the
 * pack itself first (`presentation-builder.ts` `checkWordingFits`), before
 * this function ever runs.
 */
export async function contractReportWords(
  grouping: ContractReportGrouping,
  wording?: WordingPackInput,
  context: WordsContext = { singleContract: false },
): Promise<Words> {
  const defaults = DEFAULT_PACKS[grouping];
  if (wording === undefined) return wordsOf(defaults, undefined, context);
  const refuse = (reason: "digest" | "shape" | "fit"): Words =>
    wordsOf(defaults, undefined, context, {
      sha256: /^[0-9a-f]{64}$/u.test(wording.sha256)
        ? wording.sha256
        : "(not a SHA-256)",
      reason,
    });
  let pack: WordingPack;
  try {
    pack = await checkWordingPackInput(wording);
  } catch (e) {
    if (!(e instanceof WordingPackError)) throw e;
    return refuse(/hash|sha256/u.test(e.message) ? "digest" : "shape");
  }
  const problems = wordingProblems(pack, defaults);
  if (problems.length > 0) return refuse("fit");
  return wordsOf(defaults, { pack, sha256: wording.sha256 }, context);
}

/** The default words of one grouping, for the shared parts' callers that are handed none. */
export const DEFAULT_WORDS: Readonly<Record<ContractReportGrouping, Words>> =
  Object.freeze({
    lines: wordsOf(DEFAULT_PACKS.lines),
    groups: wordsOf(DEFAULT_PACKS.groups),
  });
