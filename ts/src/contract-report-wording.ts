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
    ["groups.ob.ok", "groups.ob.ok.found", "groups.ob.ok.unverified"],
  ],
  // A test row's summary pill (EU card).
  [
    "groups.row.nothing",
    "groups.row.none-decided",
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
  // The rules-table drill-down link's count suffixes (Outcomes card).
  ["lines.rules.drill.unverified-suffix", "lines.rules.drill.undecided-suffix"],
  // The rules table's column header for a rule nobody could decide, and for
  // one whose claim could not be verified (Outcomes card).
  ["lines.rules.col.undecided", "lines.rules.col.unverified"],
  // A test row's undecided and unverified counts (EU card).
  ["groups.row.undecided-note", "groups.row.unverified-note"],
  // The three kinds of session a test's drill-down can list (EU card).
  [
    "groups.drill.kind.exceptions",
    "groups.drill.kind.unverified",
    "groups.drill.kind.undecided",
  ],
];

/**
 * The entries that make a result read CLEAN: a rule was met, an obligation,
 * test row or session has no exceptions, or a tier is a check anyone can
 * repeat. Named here, and checked against NOT_CLEAN_WORD_KEYS below
 * (4339689203), because that swap crosses a DISTINCT array's own boundary --
 * DISTINCT only ever compares entries it lists together in the same array,
 * so it would not catch an Outcomes "resolved" word reused for the EU
 * card's "not met" verdict, or a judged-tier label reading like the other
 * pack's recomputed one.
 */
const CLEAN_WORD_KEYS: readonly string[] = [
  // States a rule's result was met.
  "lines.verdict.met",
  "groups.verdict.met",
  "lines.pf.verdict.met",
  "lines.line.resolved",
  "lines.status.resolved",
  // No exceptions: an obligation, a test row or a session read clean (the
  // count/unverified-qualified variants still open on "no exceptions").
  "groups.ob.ok",
  "groups.ob.ok.found",
  "groups.ob.ok.unverified",
  "groups.row.ok",
  "groups.row.ok.all-decided",
  "groups.session.ok",
  // A fixed check anyone can repeat from the records.
  "lines.tier.recomputed",
  "groups.tier.recomputed",
];

/**
 * The entries that make a result read NOT-CLEAN: a rule was not met, nobody
 * could decide it, a claim could not be verified, a row or session could
 * not be checked at all, or a tier is a judgement -- which must never read
 * like the recomputed tier above. Compared against CLEAN_WORD_KEYS only:
 * two members of this same set may share a word (lines.status.undecided.*
 * already do, by design), that is not this check's business.
 */
const NOT_CLEAN_WORD_KEYS: readonly string[] = [
  // States a rule's result was not met.
  "lines.verdict.not_met",
  "groups.verdict.not_met",
  "lines.pf.verdict.not_met",
  "lines.line.missed",
  "lines.status.missed",
  // Nobody could decide.
  "lines.line.undecided",
  "lines.status.undecided.judged",
  "lines.status.undecided.unjudged",
  "lines.status.undecided.none",
  "lines.status.undecided.withheld",
  "lines.status.undecided.unavailable",
  "lines.verdict.not_evaluable.judged",
  "lines.verdict.not_evaluable.unjudged",
  "lines.verdict.not_evaluable.withheld",
  "lines.verdict.not_evaluable.unavailable",
  "groups.verdict.not_evaluable.judged",
  "groups.verdict.not_evaluable.unjudged",
  "groups.verdict.not_evaluable.withheld",
  "groups.verdict.not_evaluable.unavailable",
  "groups.session.undecided",
  // A claim could not be verified.
  "lines.line.unverified",
  "lines.status.unverified",
  "groups.session.unverified",
  // Could not be checked at all.
  "groups.ob.unchecked",
  "groups.ob.unchecked-of",
  "groups.row.nothing",
  "groups.row.none-decided",
  // A judgement: must never read like the recomputed tier.
  "lines.tier.judged",
  "groups.tier.judged",
  // A test row's or an obligation's exceptions count: this is the red
  // count, and must never read as the clean "met" or "no exceptions".
  "groups.row.exceptions.one",
  "groups.row.exceptions.other",
  "groups.count.exception.one",
  "groups.count.exception.other",
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
  "report.pf.dated",
  "report.pf.dated.no-zone",
  "report.pf.input-digest.verified",
  "report.pf.input-digest.cited",
  "report.pf.transcript.absent",
  "report.pf.transcript.not-shown",
  "report.pf.transcript.default-reason",
  "report.pf.wording.default",
  "report.pf.wording.supplied.layered",
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
 * these two).
 */
const CONFUSABLES: Readonly<Record<string, string>> = {
  а: "a",
  в: "b",
  е: "e",
  з: "z",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
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
  α: "a",
  β: "b",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "y",
  χ: "x",
  Α: "A",
  Β: "B",
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
};
const CONFUSABLE = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "gu");

/**
 * A word as a reader tells it apart: every `{placeholder}` dropped (a count
 * the page fills in is not part of the word itself: "{n} met" reads as
 * "met"), a Cyrillic or Greek homoglyph folded to the Latin letter it reads
 * as (CONFUSABLES), compatibility forms folded, punctuation and symbols
 * turned into a space (so internal punctuation still separates words:
 * "not-met" reads as "not met", never "notmet"), whitespace collapsed, case
 * ignored. "Met", "met " and "(met)." are one word to a reader; "✓ met"
 * reads as "met" too, not as a decorated word distinct from it.
 */
function asRead(word: string): string {
  return word
    .replace(PLACEHOLDER, "")
    .replace(CONFUSABLE, (c) => CONFUSABLES[c]!)
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/** Letters from more than one of Latin, Greek and Cyrillic, after any homoglyph is folded (CONFUSABLES) to the Latin letter it reads as: a script this module does not fold mixed with Latin still reads as decorated, not a different word. */
function mixesScripts(word: string): boolean {
  return (
    [/\p{Script=Latin}/u, /\p{Script=Greek}/u, /\p{Script=Cyrillic}/u].filter(
      (script) => script.test(word),
    ).length > 1
  );
}

/**
 * Every CLEAN_WORD_KEYS entry that, as read, equals a NOT_CLEAN_WORD_KEYS
 * entry, or the other way round (4339689203): a clean result must never
 * read like a not-clean one. `merged` is the pack's entries over the
 * defaults, the same lookup `wordingProblems` checks DISTINCT against, so a
 * pack that rewords only one side of a pair is caught too.
 */
function cleanNotCleanCollisions(
  merged: Readonly<Record<string, string>>,
): string[] {
  const wordOf = (key: string): string | undefined =>
    Object.hasOwn(merged, key) ? asRead(merged[key]!) : undefined;
  const problems: string[] = [];
  for (const cleanKey of CLEAN_WORD_KEYS) {
    const cleanWord = wordOf(cleanKey);
    if (cleanWord === undefined || cleanWord === "") continue;
    for (const notCleanKey of NOT_CLEAN_WORD_KEYS) {
      const notCleanWord = wordOf(notCleanKey);
      if (cleanWord === notCleanWord)
        problems.push(
          `${cleanKey} and ${notCleanKey} read alike (${JSON.stringify(cleanWord)}); a clean result must not read like a not-clean one, or the other way round`,
        );
    }
  }
  return problems;
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
    else {
      const baseGaps = placeholderGaps(base);
      const gotGaps = placeholderGaps(text);
      for (let i = 0; i < gotGaps.length; i++)
        if (
          !HAS_NON_SPACE.test(gotGaps[i]!) &&
          HAS_NON_SPACE.test(baseGaps[i]!)
        )
          problems.push(
            `${key} runs {${got[i]}} and {${got[i + 1]}} together with no word between them; two counts the page computes separately must not be able to read as one`,
          );
    }
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
  problems.push(...cleanNotCleanCollisions(merged));
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
 * `Words` from a pack it never hashed.
 */
export interface WordingSource {
  readonly id: string;
  readonly sha256?: string;
  readonly base?: { readonly id: string; readonly sha256: string };
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
  lines: "a40030f29980786b229f817d906dc60d661a61e1703d0d85290bcbb3b7fc3571",
  groups: "c00f7be097975f23ce22414630f80239dd9546a6bde8d2282f7439006119ab92",
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
  supplied?: {
    readonly pack: WordingPack;
    readonly sha256?: string;
  },
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
  const base = { id: defaults.id, sha256: DEFAULT_PACK_SHA256[grouping] };
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
        ? { id: base.id, sha256: base.sha256 }
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
