// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// The contract-report module: one view for the Outcomes report and the EU
// AI Act Results, every word from a wording pack. A pack changes words and
// nothing else; a pack that would drop a count, fold two verdicts into one
// word, or does not hash to its wording_sha256 is refused before anything is
// drawn. The nesting rule (SEAMS ruling 11) holds on both pages.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { sha256Hex } from "@action-state-group/agent-action-capsule";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  DEFAULT_PACK_SHA256,
  DEFAULT_PACKS,
  LOCKED_ENTRIES,
  placeholders,
  readWordingPack,
  SECTION3_ENUMS,
  SECTION3_PREFIXES,
  wordingProblems,
  wordsOf,
  WordingPackError,
  type WordingPack,
} from "../src/contract-report-wording.js";
import { nestingProblems, levelToggle } from "../src/report-levels.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";
import { ladderPack } from "./helpers/ladder-pack.js";

type Obj = Record<string, unknown>;

function fixture(name: string): Obj {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "test", "testdata", name), "utf8"),
  ) as Obj;
}

const CARDS = [
  {
    grouping: "lines",
    file: "outcome-report-bundle.json",
    page: "outcome-report",
  },
  { grouping: "groups", file: "compliance-bundle.json", page: "compliance" },
] as const;

function openAll(root: HTMLElement): void {
  for (;;) {
    const closed = [
      ...root.querySelectorAll<HTMLDetailsElement>("details"),
    ].filter((d) => !d.open);
    if (closed.length === 0) return;
    for (const details of closed) {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    }
  }
}

async function distributed(
  pack: WordingPack,
): Promise<{ pack: string; sha256: string }> {
  const text = JSON.stringify({
    wording_pack_version: "aac.wording-pack/v0",
    ...pack,
  });
  return {
    pack: text,
    sha256: await sha256Hex(new TextEncoder().encode(text)),
  };
}

/** The outcome fixture cut to its first three conversations, so a fully opened page renders fast. */
function cut(source: Obj): Obj {
  const result = (source.disclosures as Obj).result as Obj | undefined;
  const doc = result?.agent_input as Obj | undefined;
  if (doc === undefined || !String((doc.claims as Obj[])[0]?.id).includes("::"))
    return source;
  const conversation = (c: Obj): string => (c.id as string).split("::")[0]!;
  const all = doc.claims as Obj[];
  const keep = [...new Set(all.map(conversation))].slice(0, 3);
  const kept = all.filter((c) => keep.includes(conversation(c)));
  const buckets: Record<string, string[]> = {
    met: [],
    not_met: [],
    not_evaluable: [],
  };
  for (const c of kept) buckets[c.verdict as string]!.push(c.id as string);
  (source.disclosures as Obj).result = {
    agent_input: {
      ...doc,
      claims: kept,
      aggregate: { ...(doc.aggregate as Obj), buckets },
    },
  };
  return source;
}

/** Every 64-hex digest the page shows, text node by text node. */
function digests(node: Element): string[] {
  const walker = node.ownerDocument.createTreeWalker(node, 4 /* text */);
  const found: string[] = [];
  while (walker.nextNode())
    found.push(
      ...((walker.currentNode.textContent ?? "").match(
        /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/gu,
      ) ?? []),
    );
  return found;
}

async function render(
  file: string,
  wording?: { pack: string; sha256: string },
): Promise<HTMLElement> {
  const { bundle } = await sealEvidenceBundle(cut(fixture(file)));
  const root = document.createElement("main");
  await renderEvidenceGraph(
    bundle,
    root,
    undefined,
    wording === undefined ? {} : { wording },
  );
  return root;
}

/** The page with every word taken out: elements, classes, data and order only. */
function skeleton(node: Element): string {
  const copy = node.cloneNode(true) as Element;
  const walker = copy.ownerDocument.createTreeWalker(copy, 4 /* text */);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const t of texts)
    if (t.parentElement?.tagName !== "STYLE") t.textContent = "";
  for (const e of copy.querySelectorAll("[title]")) e.removeAttribute("title");
  // An expandable row's accessible name is its words, like a title.
  for (const e of copy.querySelectorAll("[aria-label]"))
    e.removeAttribute("aria-label");
  return copy.outerHTML;
}

/** Every entry a pack may reword rewritten to a different word, keeping its placeholders. */
function scrambled(base: WordingPack): WordingPack {
  return {
    id: `test/scrambled-${base.entries["layout.grouping"]}@1`,
    locale: "en",
    entries: Object.fromEntries(
      Object.entries(base.entries).map(([k, v]) => [
        k,
        k.startsWith("layout.") || LOCKED_ENTRIES.has(k)
          ? v
          : `«${k}»${placeholders(v)
              .map((p, i) => (i === 0 ? ` {${p}}` : ` is {${p}}`))
              .join("")}`,
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------
// The default packs
// ---------------------------------------------------------------------------

it("the two default packs are aac.wording-pack/v0, one per grouping, and share every word they have in common", () => {
  for (const name of [
    "contract-report-outcomes.en.json",
    "contract-report-eu-ai-act.en.json",
  ])
    expect(() =>
      readWordingPack(
        JSON.parse(
          readFileSync(resolve(process.cwd(), "src", "wording", name), "utf8"),
        ),
      ),
    ).not.toThrow();
  expect(DEFAULT_PACKS.lines.entries["layout.grouping"]).toBe("lines");
  expect(DEFAULT_PACKS.groups.entries["layout.grouping"]).toBe("groups");
  for (const [k, v] of Object.entries(DEFAULT_PACKS.lines.entries))
    if (!k.startsWith("lines.") && !k.startsWith("layout."))
      expect(DEFAULT_PACKS.groups.entries[k], k).toBe(v);
  // neither pack names the other's grouping
  expect(
    Object.keys(DEFAULT_PACKS.lines.entries).some((k) =>
      k.startsWith("groups."),
    ),
  ).toBe(false);
  expect(
    Object.keys(DEFAULT_PACKS.groups.entries).some((k) =>
      k.startsWith("lines."),
    ),
  ).toBe(false);
  for (const grouping of ["lines", "groups"] as const)
    expect(
      wordingProblems(DEFAULT_PACKS[grouping], DEFAULT_PACKS[grouping]),
    ).toEqual([]);
});

it("a supplied pack's id carrying a bidi or other invisible format character is refused outright (4343134020)", () => {
  const pack = (id: string): unknown => ({
    wording_pack_version: "aac.wording-pack/v0",
    id,
    locale: "en",
    entries: { "page.title": "x" },
  });
  expect(() => readWordingPack(pack("test/bad@1"))).not.toThrow();
  expect(() => readWordingPack(pack("test/‮bad‬@1"))).toThrow(WordingPackError);
});

it("the front says witnessed by as stated by the bundle, not checked here (SEAMS ruling 12)", () => {
  expect(DEFAULT_PACKS.lines.entries["prov.witness.label"]).toBe(
    "Witnessed by",
  );
  expect(DEFAULT_PACKS.lines.entries["prov.witness.stated"]).toBe(
    "{witnesses}: stated by the bundle, not checked here.",
  );
});

// ---------------------------------------------------------------------------
// The lines that say what the page checked are locked
// ---------------------------------------------------------------------------

// What a line that states the page's own checking, the bundle's gaps, or the
// producer's text reads like. Every default entry that reads like this must
// be locked, so a new honesty line cannot ship tunable by accident.
const HONESTY =
  /not (?:be )?checked|does not check|did not check|not evidence|not a sealed record|withheld|not stated|not shown|not in this bundle|this page|this card|as sealed|\(sealed\)|self-attested|as given|recomputed|absent|unknown|uncomputable|no signature|placeholder|failed verification|evidence missing|could not decide|no verdict drawn/iu;

it("every locked line is a default entry, and every default line that states what the page checked is locked", () => {
  const all = {
    ...DEFAULT_PACKS.lines.entries,
    ...DEFAULT_PACKS.groups.entries,
  };
  for (const key of LOCKED_ENTRIES)
    expect(Object.hasOwn(all, key), key).toBe(true);
  const unlocked = Object.entries(all)
    .filter(([k, v]) => HONESTY.test(v) && !LOCKED_ENTRIES.has(k))
    .map(([k]) => k);
  // Verdict and status words a pack may tune (DISTINCT keeps them from
  // reading like a different verdict; LOCKED_ENTRIES is not their guard),
  // not the page's own account of its checking -- even though the words
  // for "not evaluable", "not met" and the tier's name read, in English,
  // like an honesty line.
  expect(unlocked.sort()).toEqual([
    "groups.session.undecided",
    "groups.tier.recomputed",
    "groups.verdict.failed",
    "groups.verdict.not_evaluable.judged",
    "groups.verdict.not_evaluable.unavailable",
    "groups.verdict.not_evaluable.unjudged",
    "groups.verdict.not_evaluable.withheld",
    "groups.verdict.unsupported",
    "lines.pf.verdict.failed",
    "lines.rules.col.undecided",
    "lines.rules.col.unverified",
    "lines.sentence.unverified.undecided-note",
    "lines.status.undecided.judged",
    "lines.status.undecided.none",
    "lines.tier.recomputed",
    "lines.verdict.failed",
    "lines.verdict.not_evaluable.judged",
    "lines.verdict.not_evaluable.unavailable",
    "lines.verdict.not_evaluable.unjudged",
    "lines.verdict.not_evaluable.withheld",
    "lines.verdict.unsupported",
    "lines.why.undecided",
  ]);
});

for (const grouping of ["lines", "groups"] as const)
  it(`${grouping}: a pack rewording any locked line is refused, one line at a time`, () => {
    const defaults = DEFAULT_PACKS[grouping];
    const locked = Object.keys(defaults.entries).filter((k) =>
      LOCKED_ENTRIES.has(k),
    );
    expect(locked.length).toBeGreaterThan(40);
    for (const key of locked) {
      const base = defaults.entries[key]!;
      // the same placeholders, other words: only the lock refuses it
      const reworded = `Checked and confirmed${placeholders(base)
        .map((p) => ` {${p}}`)
        .join("")}`;
      expect(
        wordingProblems(
          { id: "test/locked@1", locale: "en", entries: { [key]: reworded } },
          defaults,
        ),
        key,
      ).toEqual([
        `test/locked@1: ${key}: this line states what the page checked and can't be reworded`,
      ]);
      // a one-character change is a rewording too
      expect(
        wordingProblems(
          { id: "test/locked@1", locale: "en", entries: { [key]: `${base} ` } },
          defaults,
        ),
        key,
      ).toHaveLength(1);
      // repeating the default (a copied file) changes nothing and passes
      expect(
        wordingProblems(
          { id: "test/locked@1", locale: "en", entries: { [key]: base } },
          defaults,
        ),
        key,
      ).toEqual([]);
    }
  });

// contract-report/v1 section 3: "each layer is checked on its own, and a
// refused layer contributes no words" -- a host pack that rewords a locked
// line is refused, but the card still draws, with the built-in words and a
// visible notice (report-levels.ts refusedWordingNotice); only the offline
// builder (presentation-builder.test.ts) refuses to write the page.
for (const { file, page } of CARDS)
  it(`${page}: a pack rewording "stated by the bundle, not checked here" is refused, and the card draws with the built-in words`, async () => {
    const root = await render(
      file,
      await distributed({
        id: "test/witness@1",
        locale: "en",
        entries: { "prov.witness.stated": "{witnesses}: checked." },
      }),
    );
    const card = root.querySelector(`[data-page="${page}"]`);
    expect(card).not.toBeNull();
    const notice = card!.querySelector('[data-wording="refused"]');
    expect(notice).not.toBeNull();
    expect(notice!.getAttribute("data-refusal")).toBe("fit");
    expect(root.textContent).not.toContain("{witnesses}: checked.");
    openAll(root);
    expect(root.textContent).toMatch(/was refused.*does not fit this card/u);
  });

// ---------------------------------------------------------------------------
// A pack swap changes words, and only words
// ---------------------------------------------------------------------------

/** The whole card: its three host regions (L0, L1, L2), copied in order into one element. */
function wholeCard(root: ParentNode, page: string): HTMLElement {
  const regions = [
    ...root.querySelectorAll<HTMLElement>(`[data-page="${page}"]`),
  ];
  expect(regions.map((r) => r.dataset.level)).toEqual(["L0", "L1", "L2"]);
  const card = document.createElement("div");
  for (const region of regions) card.append(region.cloneNode(true));
  return card;
}

for (const { grouping, file, page } of CARDS) {
  for (const [name, make] of [
    ["the grade ladder", () => ladderPack(grouping)],
    ["every entry rewritten", () => scrambled(DEFAULT_PACKS[grouping])],
  ] as const)
    it(`${page}: a pack (${name}) changes the words and nothing else`, async () => {
      const plain = await render(file);
      const wording = await distributed(make());
      const swapped = await render(file, wording);
      for (const root of [plain, swapped]) {
        expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
        openAll(root);
      }
      const a = wholeCard(plain, page);
      const b = wholeCard(swapped, page);
      expect(b).not.toBeNull();
      expect(b.textContent).not.toBe(a.textContent);
      // same elements, classes, verdicts, counts and record ids, in order
      expect(skeleton(b)).toBe(skeleton(a));
      // the counts and digests the pack's sentences carry are the module's
      expect(digests(a).length).toBeGreaterThan(0);
      // (the supplied pack's own wording_sha256 is named once more than the
      // default-only page names; the built-in default's digest is named on
      // both -- every layer applied, even a default-only page's one layer)
      const baseSha256 = DEFAULT_PACK_SHA256[grouping];
      expect(digests(b).filter((d) => d !== wording.sha256)).toEqual(
        digests(a),
      );
      expect(digests(b)).toContain(wording.sha256);
      expect(digests(a)).toContain(baseSha256);
      expect(digests(b)).toContain(baseSha256);
      // and the proofs say which pack drew the page
      expect(b.textContent).toContain(make().id);
    });
}

it("the proofs name every wording layer by digest, not only the supplied one", async () => {
  const wording = await distributed(ladderPack("lines"));
  const root = await render("outcome-report-bundle.json", wording);
  openAll(root);
  const text = root.textContent ?? "";
  expect(text).toContain(wording.sha256);
  expect(text).toContain(DEFAULT_PACK_SHA256.lines);
  expect(text).toContain(DEFAULT_PACKS.lines.id);
});

it("the proofs name the base layer's digest on a default-only page too (4343134014)", async () => {
  const root = await render("outcome-report-bundle.json");
  openAll(root);
  const text = root.textContent ?? "";
  expect(text).toContain(DEFAULT_PACK_SHA256.lines);
  expect(text).toContain(DEFAULT_PACKS.lines.id);
});

it("the default packs' digests are the sha256 of the files as this package ships them, not a re-serialized form (4343134014)", () => {
  for (const [grouping, file] of [
    ["lines", "contract-report-outcomes.en.json"],
    ["groups", "contract-report-eu-ai-act.en.json"],
  ] as const) {
    const bytes = readFileSync(resolve(process.cwd(), "src", "wording", file));
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(hash, file).toBe(DEFAULT_PACK_SHA256[grouping]);
  }
});

it("the ladder pack's words reach the page: a resolved line reads Established (resolved)", async () => {
  const root = await render(
    "outcome-report-bundle.json",
    await distributed(ladderPack("lines")),
  );
  const resolved = root.querySelector('tr[data-line="resolved"] b')!;
  expect(resolved.textContent).toBe("Established (resolved)");
});

it("two EU cards drawn at once, each with its own pack, keep their own words, and the producer tooltip stays locked", async () => {
  const pack = (name: string): WordingPack => ({
    id: `test/kicker-${name}@1`,
    locale: "en",
    entries: { "groups.kicker": `kicker ${name}` },
  });
  const { bundle } = await sealEvidenceBundle(
    cut(fixture("compliance-bundle.json")),
  );
  const packs = [
    await distributed(pack("a")),
    await distributed(pack("b")),
  ] as const;
  const roots = packs.map(() => document.createElement("main"));
  // Both renders in flight at once, so their awaits interleave.
  await Promise.all(
    packs.map((wording, i) =>
      renderEvidenceGraph(bundle, roots[i]!, undefined, { wording }),
    ),
  );
  for (const [i, own] of ["kicker a", "kicker b"].entries()) {
    const text = roots[i]!.textContent ?? "";
    expect(text).toContain(own);
    expect(text).not.toContain(own === "kicker a" ? "kicker b" : "kicker a");
    const producer = [
      ...roots[i]!.querySelectorAll<HTMLElement>('i[data-source="producer"]'),
    ];
    expect(producer.length).toBeGreaterThan(0);
    expect(new Set(producer.map((e) => e.title))).toEqual(
      new Set([DEFAULT_PACKS.groups.entries["groups.producer.title"]]),
    );
  }
});

// ---------------------------------------------------------------------------
// A pack that would change more than words is refused
// ---------------------------------------------------------------------------

it("a pack entry must carry exactly the placeholders of the entry it replaces: a count or denominator cannot be dropped or added", () => {
  const base = DEFAULT_PACKS.lines;
  const drop: WordingPack = {
    id: "test/drop@1",
    locale: "en",
    entries: {
      "lines.drill.show.other": "Show the conversations",
      "lines.share": "{count} of them",
      "prov.of": "{count} of {total} ({extra})",
    },
  };
  const problems = wordingProblems(drop, base);
  expect(problems).toHaveLength(3);
  expect(problems.join("\n")).toContain(
    "lines.drill.show.other uses {}; it must use exactly {n}",
  );
  expect(problems.join("\n")).toContain("lines.share uses {count}");
  expect(problems.join("\n")).toContain("prov.of uses {count} {total} {extra}");
});

it("placeholders are checked in order, with repeats: a pack cannot swap a count and a denominator, or run two numbers together", () => {
  // same set of placeholders, reordered: {total} of {count} instead of
  // {count} of {total} -- a set comparison would have missed this
  const swapped = wordingProblems(
    {
      id: "test/swap@1",
      locale: "en",
      entries: { "lines.share": "{total} of {count}" },
    },
    DEFAULT_PACKS.lines,
  );
  expect(swapped).toEqual([
    "test/swap@1: lines.share uses {total} {count}; it must use exactly {count} {total}",
  ]);
  // a repeated placeholder dropped to one use
  const deduped = wordingProblems(
    {
      id: "test/dedup@1",
      locale: "en",
      entries: {
        "lines.sentence.missed":
          "Missed: {misses} of {applied} {rule} not met.",
      },
    },
    DEFAULT_PACKS.lines,
  );
  expect(deduped).toEqual([
    "test/dedup@1: lines.sentence.missed uses {misses} {applied} {rule}; it must use exactly {misses} {applied} {rule} {was} {names}",
  ]);
  // the same two placeholders, same order, but with the word between them
  // dropped: "2 of 10" would read as "210"
  const ranTogether = wordingProblems(
    {
      id: "test/together@1",
      locale: "en",
      entries: { "lines.share": "{count}{total}" },
    },
    DEFAULT_PACKS.lines,
  );
  expect(ranTogether).toEqual([
    "test/together@1: lines.share runs {count} and {total} together with no word between them; two counts the page computes separately must not be able to read as one",
  ]);
  // a space alone is not a word between them either: still refused
  expect(
    wordingProblems(
      {
        id: "test/spaced@1",
        locale: "en",
        entries: { "lines.share": "{count} {total}" },
      },
      DEFAULT_PACKS.lines,
    ),
  ).toEqual([
    "test/spaced@1: lines.share runs {count} and {total} together with no word between them; two counts the page computes separately must not be able to read as one",
  ]);
  // a real word between them, even a short one, passes
  expect(
    wordingProblems(
      {
        id: "test/worded@1",
        locale: "en",
        entries: { "lines.share": "{count} of {total}" },
      },
      DEFAULT_PACKS.lines,
    ),
  ).toEqual([]);
  // a separator alone is not a word either: "59,768" reads as fifty-nine
  // thousand, not "59 of 768"
  expect(
    wordingProblems(
      {
        id: "test/comma@1",
        locale: "en",
        entries: { "lines.share": "{count},{total}" },
      },
      DEFAULT_PACKS.lines,
    ),
  ).toEqual([
    "test/comma@1: lines.share runs {count} and {total} together with no word between them; two counts the page computes separately must not be able to read as one",
  ]);
  // a digit alone is not a word either: "59" + "0" + "768" reads as "590768"
  expect(
    wordingProblems(
      {
        id: "test/digit@1",
        locale: "en",
        entries: { "lines.share": "{count}0{total}" },
      },
      DEFAULT_PACKS.lines,
    ),
  ).toEqual([
    "test/digit@1: lines.share runs {count} and {total} together with no word between them; two counts the page computes separately must not be able to read as one",
  ]);
  // an unspaced letter that reads as a digit is no word either: "59O768"
  // reads as one number, whether the O is Latin or a look-alike (Cyrillic o,
  // Cyrillic palochka, the dental click, dotless i)
  // -- and so is one with a space on only one side ("59O 768" reads as
  // 590 768 where a space groups thousands, a narrow one included)
  for (const gap of [
    "O",
    "l",
    "I",
    "\u043e",
    "\u04cf",
    "\u01c0",
    "\u0131",
    "O ",
    " O",
    "\u202fO",
    "l\u2009",
    // a spaced run of them reads as a thousands group ("59 OOO 768")
    " OOO ",
    " \u041e\u041e\u041e ",
    " lOO ",
    "\u202fOOO\u202f",
    " O.O ",
    " i i ",
  ])
    expect(
      wordingProblems(
        {
          id: "test/digit-like@1",
          locale: "en",
          entries: { "lines.share": `{count}${gap}{total}` },
        },
        DEFAULT_PACKS.lines,
      ),
      JSON.stringify(gap),
    ).toEqual([
      "test/digit-like@1: lines.share runs {count} and {total} together with no word between them; two counts the page computes separately must not be able to read as one",
    ]);
  // a real word between the counts still passes, in any script
  // (Welsh "o" is "of": spaced, it is a word between two counts)
  // (a one-letter word spaced on both sides is a word: " l " and " I " too)
  for (const gap of [" out of ", " из ", " από ", " o ", " l ", " I "])
    expect(
      wordingProblems(
        {
          id: "test/word-gap@1",
          locale: "en",
          entries: { "lines.share": `{count}${gap}{total}` },
        },
        DEFAULT_PACKS.lines,
      ),
      JSON.stringify(gap),
    ).toEqual([]);
});

it("a pack cannot fold two verdicts into one word, or change the grouping", () => {
  const fold: WordingPack = {
    id: "test/fold@1",
    locale: "en",
    entries: { "lines.verdict.not_met": "met", "layout.grouping": "groups" },
  };
  const problems = wordingProblems(fold, DEFAULT_PACKS.lines).join("\n");
  expect(problems).toMatch(
    /lines\.verdict\.not_met and lines\.verdict\.met read alike/u,
  );
  expect(problems).toContain('layout.grouping is "groups"');
});

it("verdict words are told apart as a reader reads them, and a pack cannot swap two verdicts' words", () => {
  const check = (entries: Record<string, string>): string =>
    wordingProblems(
      { id: "test/read@1", locale: "en", entries },
      DEFAULT_PACKS.lines,
    ).join("\n");
  // case, spacing and punctuation do not make two words
  expect(check({ "lines.verdict.not_met": "Met" })).toMatch(/read alike/u);
  expect(check({ "lines.verdict.not_met": " (met). " })).toMatch(/read alike/u);
  expect(check({ "lines.verdict.not_met": "..." })).toContain(
    "lines.verdict.not_met has no visible word",
  );
  // internal punctuation becomes a space, not nothing: "not-met" reads as
  // "not met", lines.verdict.not_met's own word, not as the unbroken "notmet"
  expect(check({ "lines.verdict.met": "not-met" })).toMatch(
    /lines\.verdict\.met and lines\.verdict\.not_met read alike/u,
  );
  // "\u0435" (Cyrillic) is a known homoglyph of Latin "e" (CONFUSABLES), but
  // mixesScripts judges the word before folding: a real Latin "m" and "t"
  // mixed with one genuine Cyrillic letter is still a mixed-script spoof,
  // never a folded collision
  expect(check({ "lines.verdict.not_met": "m\u0435t" })).toContain(
    "lines.verdict.not_met mixes Latin, Greek and Cyrillic letters",
  );
  // "\u0434" (Cyrillic de) has no Latin homoglyph in CONFUSABLES either, so
  // mixing it with Latin letters is caught the same way
  expect(check({ "lines.verdict.not_met": "m\u0434t" })).toContain(
    "lines.verdict.not_met mixes Latin, Greek and Cyrillic letters",
  );
  // "\u03bd" (Greek nu) is a homoglyph of Latin "v", but the same applies: a
  // real Latin word with one genuine Greek letter in it is a mixed-script
  // spoof, not a folded collision with "failed verification"
  expect(
    check({ "lines.verdict.unsupported": "failed \u03bderification" }),
  ).toContain(
    "lines.verdict.unsupported mixes Latin, Greek and Cyrillic letters",
  );
  // bidi and other invisible format controls are refused outright, not
  // merely stripped for the comparison: the checked string and the
  // rendered string must be the same string.
  expect(check({ "lines.verdict.not_met": " met\u200b " })).toContain(
    "lines.verdict.not_met carries a bidi or other invisible format character",
  );
  expect(check({ "lines.verdict.not_met": "\u202etem\u202c" })).toContain(
    "lines.verdict.not_met carries a bidi or other invisible format character",
  );
  // met and not met swapped: no word is shared, and still refused
  const swapped = check({
    "lines.verdict.met": "not met",
    "lines.verdict.not_met": "met",
  });
  expect(swapped).toContain(
    'lines.verdict.met reads "not met", the word for lines.verdict.not_met',
  );
  expect(swapped).toContain(
    'lines.verdict.not_met reads "met", the word for lines.verdict.met',
  );
  // the proofs' sealed-verdict words are verdict words too
  expect(check({ "lines.pf.verdict.not_met": "met" })).toMatch(
    /lines\.pf\.verdict\.not_met and lines\.pf\.verdict\.met read alike/u,
  );
  // a key Object.prototype has is not a default entry
  expect(check({ constructor: "x" })).toBe("");
  // the ladder pack still passes
  expect(wordingProblems(ladderPack("lines"), DEFAULT_PACKS.lines)).toEqual([]);
});

it("a genuine Cyrillic or Greek verdict word is not refused as mixing scripts (4344085081)", () => {
  const check = (entries: Record<string, string>): string =>
    wordingProblems(
      { id: "test/script@1", locale: "en", entries },
      DEFAULT_PACKS.lines,
    ).join("\n");
  // a real Russian word: some letters fold under CONFUSABLES (е, о, н), some
  // don't (ы, п, л) -- the folded form would mix scripts, but the word as
  // actually written is wholly Cyrillic and must not be refused
  expect(check({ "lines.verdict.not_met": "не выполнено" })).toBe("");
  // a real Greek word, likewise mixed under folding but wholly Greek as written
  expect(check({ "lines.verdict.not_met": "δεν πληρούται" })).toBe("");
  // an all-Cyrillic homoglyph of "met" is still caught: it folds to "met"
  // and collides with lines.verdict.met's default word
  expect(check({ "lines.verdict.not_met": "мет" })).toContain(
    'lines.verdict.not_met reads "met", the word for lines.verdict.met',
  );
  // all-Greek capitals that read as "MET" (Μ U+039C, Ε U+0395, Τ U+03A4)
  // fold to "met" too, so they collide rather than pass as a Greek word
  expect(check({ "lines.verdict.not_met": "\u039c\u0395\u03a4" })).toContain(
    'lines.verdict.not_met reads "met", the word for lines.verdict.met',
  );
  // and Cyrillic i, dze and komi de, which read as i, s and d, fold as well:
  // an all-Cyrillic "міѕѕеԁ" is "missed" to a reader
  expect(
    check({ "lines.status.resolved": "\u043c\u0456\u0455\u0455\u0435\u0501" }),
  ).toMatch(/read alike \("missed"\)/u);
  // a spoof mixing a real Latin letter with a Cyrillic lookalike is still
  // refused as mixing scripts, not accepted as a genuine word
  expect(check({ "lines.verdict.not_met": "mдt" })).toContain(
    "lines.verdict.not_met mixes Latin, Greek and Cyrillic letters",
  );
});

it("CONFUSABLES folds a word the same in any case (Greek eta; ΕΤΣΙ and ετσι)", () => {
  // CONFUSABLES is keyed by capital letter and asRead uppercases before it
  // folds, so an uppercase Η folds to H however it was written
  expect(
    wordingProblems(
      {
        id: "test/greek-case@1",
        locale: "en",
        entries: {
          "lines.status.resolved": "Η",
          "lines.verdict.not_met": "H",
        },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(/lines\.status\.resolved and lines\.verdict\.not_met read alike/u);
  // the same Greek word in capitals and in lowercase is one word: a met and a
  // not-met verdict must not differ only in case
  expect(
    wordingProblems(
      {
        id: "test/greek-case@1",
        locale: "el",
        entries: {
          "lines.verdict.met": "\u0395\u03a4\u03a3\u0399",
          "lines.verdict.not_met": "\u03b5\u03c4\u03c3\u03b9",
        },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(/lines\.verdict\.not_met and lines\.verdict\.met read alike/u);
  // likewise Cyrillic shha, whose capital is in CONFUSABLES only as a capital
  expect(
    wordingProblems(
      {
        id: "test/cyrillic-case@1",
        locale: "ru",
        entries: {
          "lines.verdict.met": "\u04ba\u0410",
          "lines.verdict.not_met": "\u04bb\u0430",
        },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(/lines\.verdict\.not_met and lines\.verdict\.met read alike/u);
  // German sharp s in either case (ß uppercases to SS, ẞ lowercases to ß)
  expect(
    wordingProblems(
      {
        id: "test/german-case@1",
        locale: "de",
        entries: {
          "lines.verdict.met": "ordnungsgem\u00e4\u00df",
          "lines.verdict.not_met": "ORDNUNGSGEM\u00c4\u1e9e",
        },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(/lines\.verdict\.not_met and lines\.verdict\.met read alike/u);
  // the same Greek word in two cases is one word even when it has a letter
  // (ν, η, μ) whose lowercase reads as a different Latin letter than its
  // capital: "ναι" and "ΝΑΙ" are both "yes"
  for (const [met, notMet] of [
    ["\u03bd\u03b1\u03b9", "\u039d\u0391\u0399"],
    ["\u03bc\u03b7", "\u039c\u0397"],
    [
      "\u03b9\u03ba\u03b1\u03bd\u03bf\u03c0\u03bf\u03b9\u03b5\u03af\u03c4\u03b1\u03b9",
      "\u0399\u039a\u0391\u039d\u039f\u03a0\u039f\u0399\u0395\u038a\u03a4\u0391\u0399",
    ],
  ])
    expect(
      wordingProblems(
        {
          id: "test/greek-case@1",
          locale: "el",
          entries: {
            "lines.verdict.met": met!,
            "lines.verdict.not_met": notMet!,
          },
        },
        DEFAULT_PACKS.lines,
      ).join("\n"),
      met,
    ).toMatch(/lines\.verdict\.not_met and lines\.verdict\.met read alike/u);
  // sentence case is the same word too
  expect(
    wordingProblems(
      {
        id: "test/greek-case@1",
        locale: "el",
        entries: {
          "lines.verdict.met": "\u039d\u03b1\u03b9",
          "lines.verdict.not_met": "\u03bd\u03b1\u03b9",
        },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(/lines\.verdict\.not_met and lines\.verdict\.met read alike/u);
  // the case-fold reading counts across categories too, outside any DISTINCT
  // set, and one key's collisions with two different keys are both named:
  // "nai" (clean) vs "ΝΑΙ" (exception) vs "ναι" (undecided)
  const across = wordingProblems(
    {
      id: "test/greek-category@1",
      locale: "el",
      entries: {
        "lines.status.resolved": "nai",
        "lines.verdict.not_met": "\u039d\u0391\u0399",
        "lines.pf.verdict.not_evaluable": "\u03bd\u03b1\u03b9",
      },
    },
    DEFAULT_PACKS.lines,
  ).join("\n");
  expect(across).toMatch(
    /lines\.status\.resolved and lines\.verdict\.not_met read alike .*a met\/clean result must not read like a not-met\/exception result/u,
  );
  expect(across).toMatch(
    /lines\.verdict\.not_met and lines\.pf\.verdict\.not_evaluable read alike .*a not-met\/exception result must not read like something nobody could decide/u,
  );
  // two keys whose words share both readings are still one problem per
  // check, not one per reading
  const twice = wordingProblems(
    {
      id: "test/greek-once@1",
      locale: "el",
      entries: {
        "lines.status.resolved": "\u039d\u0391\u0399",
        "lines.verdict.not_met": "\u039d\u0391\u0399",
      },
    },
    DEFAULT_PACKS.lines,
  );
  expect(
    twice.filter((p) =>
      p.includes("lines.status.resolved and lines.verdict.not_met read alike"),
    ),
  ).toHaveLength(1);
  // lowercase eta reads as Latin n: an all-Greek "ηοτ ΜΕΤ" is "not met"
  expect(
    wordingProblems(
      {
        id: "test/greek-eta@1",
        locale: "en",
        entries: {
          "lines.verdict.met": "\u03b7\u03bf\u03c4 \u039c\u0395\u03a4",
        },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(/read alike/u);
  // lowercase Greek nu reads as Latin v, not as its capital's N
  expect(
    wordingProblems(
      {
        id: "test/greek-nu@1",
        locale: "el",
        entries: {
          "lines.verdict.met": "V",
          "lines.verdict.not_met": "\u03bd",
        },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(/lines\.verdict\.not_met and lines\.verdict\.met read alike/u);
});

it("the spelled-out numbers are locked: a pack must not make 2 read as one hundred", () => {
  expect(
    wordingProblems(
      {
        id: "test/count@1",
        locale: "en",
        entries: { "lines.count.2": "one hundred" },
      },
      DEFAULT_PACKS.lines,
    ),
  ).toEqual([
    "test/count@1: lines.count.2: this line states what the page checked and can't be reworded",
  ]);
});

it("the assurance tier words are a distinct, non-swappable set: a judgement must never read as a check anyone can repeat", () => {
  expect(
    wordingProblems(
      {
        id: "test/tier@1",
        locale: "en",
        entries: { "groups.tier.judged": "recomputed" },
      },
      DEFAULT_PACKS.groups,
    ).join("\n"),
  ).toContain(
    'groups.tier.judged reads "recomputed", the word for groups.tier.recomputed',
  );
  expect(
    wordingProblems(
      {
        id: "test/tier@1",
        locale: "en",
        entries: { "lines.tier.recomputed": "judged" },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toContain(
    'lines.tier.recomputed reads "judged", the word for lines.tier.judged',
  );
  // the explanations behind the EU card's tier words are locked
  expect(
    wordingProblems(
      {
        id: "test/tier@1",
        locale: "en",
        entries: {
          "groups.tier.judged.title": "A fixed check anyone can repeat",
        },
      },
      DEFAULT_PACKS.groups,
    ),
  ).toEqual([
    "test/tier@1: groups.tier.judged.title: this line states what the page checked and can't be reworded",
  ]);
});

it("a clean word and a not-clean word must not read alike, across any set (4339689203)", () => {
  const check = (entries: Record<string, string>): string =>
    wordingProblems(
      { id: "test/clean@1", locale: "en", entries },
      DEFAULT_PACKS.lines,
    ).join("\n");
  // "resolved" is a met-family (clean) word; DISTINCT never compares
  // lines.verdict.* against lines.status.*/lines.line.* (different arrays),
  // so only this check catches a not-met verdict reading it -- and it names
  // both keys.
  expect(check({ "lines.verdict.not_met": "resolved" })).toMatch(
    /lines\.(line|status)\.resolved and lines\.verdict\.not_met read alike/u,
  );
  // case, spacing and punctuation still do not make it a different word
  expect(check({ "lines.verdict.not_met": "resolved." })).toMatch(
    /lines\.(line|status)\.resolved and lines\.verdict\.not_met read alike/u,
  );
  // a judged-tier label set to the recomputed tier's label is refused too
  expect(check({ "lines.tier.judged": "recomputed" })).toMatch(
    /lines\.tier\.recomputed and lines\.tier\.judged read alike/u,
  );
  // an all-Cyrillic homoglyph of "met" ("мет": U+043C U+0435 U+0442) is
  // "met" to a reader, letter for letter, but mixes no script -- only
  // CONFUSABLES folding catches it, not mixesScripts
  expect(check({ "lines.verdict.not_met": "мет" })).toMatch(
    /lines\.verdict\.met and lines\.verdict\.not_met read alike/u,
  );
  // "met" is lines.verdict.met's (clean) word; a missed headline row given
  // it would read as resolved
  expect(check({ "lines.line.missed": "met" })).toMatch(
    /lines\.verdict\.met and lines\.line\.missed read alike/u,
  );
  // an undecided session's pill given the EU card's own "no exceptions
  // found" word would read clean
  expect(
    wordingProblems(
      {
        id: "test/clean@1",
        locale: "en",
        entries: { "groups.session.undecided": "No exceptions found" },
      },
      DEFAULT_PACKS.groups,
    ).join("\n"),
  ).toMatch(/groups\.ob\.ok\.found and groups\.session\.undecided read alike/u);
  // "{n} met" on the red exceptions count would read as the clean verdict,
  // the count itself notwithstanding
  expect(
    wordingProblems(
      {
        id: "test/clean@1",
        locale: "en",
        entries: { "groups.row.exceptions.other": "{n} met" },
      },
      DEFAULT_PACKS.groups,
    ).join("\n"),
  ).toMatch(
    /groups\.verdict\.met and groups\.row\.exceptions\.other read alike/u,
  );
  // the two shipped default packs carry no such collision
  for (const grouping of ["lines", "groups"] as const)
    expect(
      wordingProblems(DEFAULT_PACKS[grouping], DEFAULT_PACKS[grouping]),
    ).toEqual([]);
});

it("a pack word of one GUARDED_CATEGORY must not read like a word of a different one (4344180862, 4344180866, 4344180870)", () => {
  // 4344180862: the failed/unsupported verdicts were not guarded at all --
  // each of the six keys, given a clean word, is now caught
  expect(
    wordingProblems(
      {
        id: "test/category@1",
        locale: "en",
        entries: { "lines.verdict.failed": "resolved" },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(
    /lines\.(line|status)\.resolved and lines\.verdict\.failed read alike/u,
  );
  const SIX_KEYS = [
    ["lines", "lines.verdict.failed"],
    ["lines", "lines.verdict.unsupported"],
    ["groups", "groups.verdict.failed"],
    ["groups", "groups.verdict.unsupported"],
    ["lines", "lines.pf.verdict.failed"],
    ["lines", "lines.pf.verdict.unsupported"],
  ] as const;
  // each given a clean word from a DIFFERENT set ("met" would already collide
  // with its own set's met verdict in DISTINCT), so only the category check
  // can catch it
  const CLEAN_WORD = { lines: "resolved", groups: "no exceptions" } as const;
  for (const [grouping, key] of SIX_KEYS)
    expect(
      wordingProblems(
        {
          id: "test/category@1",
          locale: "en",
          entries: { [key]: CLEAN_WORD[grouping] },
        },
        DEFAULT_PACKS[grouping],
      ).join("\n"),
      key,
    ).toMatch(
      /read alike .*a met\/clean result must not read like something that could not be verified/u,
    );
  // 4344180866: renaming the clean side frees its old default word for a
  // not-clean verdict -- comparing only the merged words would miss this,
  // since the clean side no longer reads "resolved" in the merged pack, but
  // the gap it left at the clean side's default word is still open
  expect(
    wordingProblems(
      {
        id: "test/category@1",
        locale: "en",
        entries: {
          "lines.line.resolved": "Completed",
          "lines.status.resolved": "completed",
          "lines.verdict.not_met": "resolved",
        },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(/read alike/u);
  // the other way round: a clean entry taking a renamed not-clean entry's
  // old default word ("failed verification") is refused just the same
  expect(
    wordingProblems(
      {
        id: "test/category@1",
        locale: "en",
        entries: {
          "lines.verdict.failed": "verification failed",
          "lines.pf.verdict.failed": "verification failed",
          "lines.line.resolved": "failed verification",
        },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(
    /lines\.line\.resolved and lines\.(pf\.)?verdict\.failed read alike/u,
  );
  // the proofs' undecided verdict, the did-not-apply entries and the
  // held/added headline rows are guarded too: none may read clean
  const MORE_KEYS = [
    ["lines", "lines.pf.verdict.not_evaluable"],
    ["lines", "lines.verdict.not_applicable"],
    ["lines", "lines.pf.verdict.not_applicable"],
    ["lines", "lines.status.nothing-applied"],
    ["lines", "lines.line.held"],
    ["lines", "lines.line.added"],
    ["groups", "groups.verdict.not_applicable"],
    ["groups", "groups.session.none"],
  ] as const;
  for (const [grouping, key] of MORE_KEYS)
    expect(
      wordingProblems(
        {
          id: "test/category@1",
          locale: "en",
          entries: { [key]: CLEAN_WORD[grouping] },
        },
        DEFAULT_PACKS[grouping],
      ).join("\n"),
      key,
    ).toMatch(/read alike .*a met\/clean result must not read like/u);
  // an entry the defaults don't have changes nothing on this page, so it is
  // not compared either: an EU key in a pack checked against the Outcomes
  // defaults passes
  expect(
    wordingProblems(
      {
        id: "test/category@1",
        locale: "en",
        entries: { "groups.verdict.failed": "resolved" },
      },
      DEFAULT_PACKS.lines,
    ),
  ).toEqual([]);
  // 4344180870: an exceptions count sharing the undecided note's word --
  // both NOT_CLEAN by the old check, so it let them share a word
  expect(
    wordingProblems(
      {
        id: "test/category@1",
        locale: "en",
        entries: {
          "groups.row.exceptions.other": "{n} could not be decided",
          "groups.count.exception.other": "{n} could not be decided",
        },
      },
      DEFAULT_PACKS.groups,
    ).join("\n"),
  ).toMatch(/read alike/u);
  // the two shipped default packs carry no cross-category collision
  for (const grouping of ["lines", "groups"] as const)
    expect(
      wordingProblems(DEFAULT_PACKS[grouping], DEFAULT_PACKS[grouping]),
    ).toEqual([]);
  // the grade-ladder pack carries none either
  expect(wordingProblems(ladderPack("lines"), DEFAULT_PACKS.lines)).toEqual([]);
  // nor do the real Russian and Greek verdict words from 4344085081
  expect(
    wordingProblems(
      {
        id: "test/script@1",
        locale: "en",
        entries: { "lines.verdict.not_met": "не выполнено" },
      },
      DEFAULT_PACKS.lines,
    ),
  ).toEqual([]);
  expect(
    wordingProblems(
      {
        id: "test/script@1",
        locale: "en",
        entries: { "lines.verdict.not_met": "δεν πληρούται" },
      },
      DEFAULT_PACKS.lines,
    ),
  ).toEqual([]);
});

it("sibling verdict and count surfaces outside the main verdict sets are still distinct (4343133993)", () => {
  // a missed conversation's reason swapped for an undecided one's
  expect(
    wordingProblems(
      {
        id: "test/why@1",
        locale: "en",
        entries: {
          "lines.why.missed": "could not decide: {names}",
          "lines.why.undecided": "not met: {names}",
        },
      },
      DEFAULT_PACKS.lines,
    ).join("\n"),
  ).toMatch(/lines\.why\.missed reads .*the word for lines\.why\.undecided/u);
  // the rules column heads and a test row's counts each stay a
  // non-swappable set too
  for (const [a, b] of [
    ["lines.rules.col.undecided", "lines.rules.col.unverified"],
  ] as const) {
    const base = DEFAULT_PACKS.lines.entries[b]!;
    expect(
      wordingProblems(
        { id: "test/swap@1", locale: "en", entries: { [a]: base } },
        DEFAULT_PACKS.lines,
      ).join("\n"),
      `${a} as ${b}'s word`,
    ).toMatch(/read alike/u);
  }
  for (const [a, b] of [
    ["groups.row.undecided-note", "groups.row.unverified-note"],
  ] as const) {
    const base = DEFAULT_PACKS.groups.entries[b]!;
    expect(
      wordingProblems(
        { id: "test/swap@1", locale: "en", entries: { [a]: base } },
        DEFAULT_PACKS.groups,
      ).join("\n"),
      `${a} as ${b}'s word`,
    ).toMatch(/read alike/u);
  }
});

// contract-report/v1 section 3: a refused layer (a fit failure such as
// verdict.met: "not met", or a digest mismatch) draws the default words with
// the refused notice and the proofs line naming the refused digest and the
// base; the presentation builder, not the live render, still refuses to
// write such a page (presentation-builder.test.ts).
for (const { grouping, file, page } of CARDS) {
  it(`${page}: a refused pack draws with the built-in words and the refused notice`, async () => {
    const bad = await distributed({
      id: "test/bad@1",
      locale: "en",
      entries: { [`${grouping}.verdict.not_met`]: "met" },
    });
    const root = await render(file, bad);
    const card = root.querySelector(`[data-page="${page}"]`);
    expect(card).not.toBeNull();
    const notice = card!.querySelector('[data-wording="refused"]');
    expect(notice).not.toBeNull();
    expect(notice!.getAttribute("data-refusal")).toBe("fit");
    // bytes that do not hash to the pack's wording_sha256: refused the same way
    const good = await distributed(ladderPack("lines"));
    const tampered = await render(file, { ...good, sha256: "0".repeat(64) });
    const tamperedCard = tampered.querySelector(`[data-page="${page}"]`);
    expect(tamperedCard).not.toBeNull();
    const tamperedNotice = tamperedCard!.querySelector(
      '[data-wording="refused"]',
    );
    expect(tamperedNotice).not.toBeNull();
    expect(tamperedNotice!.getAttribute("data-refusal")).toBe("digest");
  });
}

it("a pack's entries for other modules (a page title) are left alone", () => {
  const pack: WordingPack = {
    id: "test/title@1",
    locale: "en",
    entries: { "page.title": "September", "lines.verdict.met": "kept" },
  };
  expect(wordingProblems(pack, DEFAULT_PACKS.lines)).toEqual([]);
});

// ---------------------------------------------------------------------------
// One nesting rule (SEAMS ruling 11): level 2 inside level 1, never deeper
// ---------------------------------------------------------------------------

for (const { file, page } of CARDS)
  it(`${page}: no toggle is nested deeper than level 2, every toggle opened`, async () => {
    const root = await render(file);
    openAll(root);
    const card = wholeCard(root, page);
    expect(card.querySelectorAll("details").length).toBeGreaterThan(0);
    expect(nestingProblems(card)).toEqual([]);
  });

it("the nesting check fails on a toggle nested deeper than level 2, and on a level 1 inside a level 1", () => {
  const host = document.createElement("div");
  const one = levelToggle(1, "one", () => document.createElement("div"), {
    eager: true,
  });
  const two = levelToggle(2, "two", () => document.createElement("div"), {
    eager: true,
  });
  const three = levelToggle(2, "three", () => document.createElement("p"), {
    eager: true,
  });
  two.append(three);
  one.append(two);
  host.append(one);
  expect(nestingProblems(host)).toEqual(['"three" is nested 3 toggles deep']);
  three.remove();
  expect(nestingProblems(host)).toEqual([]);
  one.append(
    levelToggle(1, "inner one", () => document.createElement("p"), {
      eager: true,
    }),
  );
  expect(nestingProblems(host)).toEqual([
    '"inner one" is not level 2 but sits inside a toggle',
  ]);
});

it("the nesting check fails on a level-2 toggle directly inside another level-2 toggle", () => {
  const host = document.createElement("div");
  const outer = levelToggle(
    2,
    "outer two",
    () => document.createElement("div"),
    {
      eager: true,
    },
  );
  outer.append(
    levelToggle(2, "inner two", () => document.createElement("p"), {
      eager: true,
    }),
  );
  host.append(outer);
  expect(nestingProblems(host)).toEqual([
    '"inner two" is level 2 but sits inside a level-2 toggle, not a level-1 one',
  ]);
});

// ---------------------------------------------------------------------------
// contract-report/v1 section 3: the keys this kind defines
// ---------------------------------------------------------------------------

/** Render a bundle built from an already-mutated fixture source, with no
 * cut() trimming: `cut()` rebuilds buckets assuming only met/not_met/
 * not_evaluable, so it cannot carry a fixture this section mutates to add
 * an out_of_scope claim. */
async function renderSource(
  source: Obj,
  wording?: { pack: string; sha256: string },
): Promise<HTMLElement> {
  const { bundle } = await sealEvidenceBundle(source);
  const root = document.createElement("main");
  await renderEvidenceGraph(
    bundle,
    root,
    undefined,
    wording === undefined ? {} : { wording },
  );
  return root;
}

it("every default-pack key either is an exact section 3 key or starts with none of SECTION3_PREFIXES", () => {
  const exact = new Set<string>();
  for (const [family, values] of Object.entries(SECTION3_ENUMS))
    for (const value of values) exact.add(`${family}.${value}`);
  for (const grouping of ["lines", "groups"] as const) {
    const keys = Object.keys(DEFAULT_PACKS[grouping].entries);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const prefixed = SECTION3_PREFIXES.some((p) => key.startsWith(p));
      if (prefixed) expect(exact.has(key), `${grouping}: ${key}`).toBe(true);
    }
  }
});

it("a section 3 alias word is refused exactly where the grouping key would be (verdict.met: 'not met'; tier.judged equal to the recomputed word)", () => {
  // The bare section 3 key, once expandSection3 copies it onto the
  // grouping's own key, must be checked exactly as that grouping key would
  // be: the same problems, modulo the id the message quotes.
  const viaAlias = (
    grouping: "lines" | "groups",
    aliasKey: string,
    directKey: string | readonly string[],
    value: string,
  ): [string[], string[]] => {
    const alias = wordingProblems(
      { id: "test/pack@1", locale: "en", entries: { [aliasKey]: value } },
      DEFAULT_PACKS[grouping],
    );
    const direct = wordingProblems(
      {
        id: "test/pack@1",
        locale: "en",
        entries: Object.fromEntries(
          (typeof directKey === "string" ? [directKey] : directKey).map((k) => [
            k,
            value,
          ]),
        ),
      },
      DEFAULT_PACKS[grouping],
    );
    return [alias, direct];
  };
  for (const grouping of ["lines", "groups"] as const) {
    // On the Outcomes card verdict.met words both the rule pill and the
    // proofs cell.
    const [alias, direct] = viaAlias(
      grouping,
      "verdict.met",
      grouping === "lines"
        ? ["lines.verdict.met", "lines.pf.verdict.met"]
        : "groups.verdict.met",
      "not met",
    );
    expect(alias.length).toBeGreaterThan(0);
    expect(alias).toEqual(direct);
    expect(alias.join("\n")).toContain(
      `${grouping}.verdict.met reads "not met", the word for ${grouping}.verdict.not_met`,
    );
  }
  for (const grouping of ["lines", "groups"] as const) {
    const [alias, direct] = viaAlias(
      grouping,
      "tier.judged",
      `${grouping}.tier.judged`,
      "recomputed",
    );
    expect(alias.length).toBeGreaterThan(0);
    expect(alias).toEqual(direct);
    expect(alias.join("\n")).toContain(
      `${grouping}.tier.judged reads "recomputed", the word for ${grouping}.tier.recomputed`,
    );
  }
});

it("an invalid assembled key (a requirement_ref with an uppercase letter) is never resolved: the pack's entry is never found, and the caller falls back to its own name, never a guess", () => {
  const w = wordsOf(
    DEFAULT_PACKS.groups,
    {
      pack: {
        id: "test/case@1",
        locale: "en",
        entries: { "row.art5.foo.label": "SHOULD NEVER SHOW" },
      },
    },
    { singleContract: true },
  );
  // the pack's own (lowercase) entry key is valid and is found for the
  // matching lowercase ref
  expect(w.row("art5.foo", "label")).toBe("SHOULD NEVER SHOW");
  // but a Result claim's requirement_ref with an uppercase letter assembles
  // row.Art5.foo.label, not a valid WordingKey (contract-report/v1 section
  // 3): the lookup finds nothing, even though the lowercase entry exists
  expect(w.row("Art5.foo", "label")).toBeUndefined();
  expect(w.group("Art5")).toBeUndefined();
});

it("a multi-contract Result shows no row or group word, even from a pack that sets them: row.* and group.* apply only when every claim cites one contract_ref", async () => {
  const source = fixture("compliance-bundle.json");
  const doc = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  const claims = doc.claims as Obj[];
  // every claim of art5 now cites a second contract: the Result cites more
  // than one contract_ref (contract-report/v1 section 2's "several
  // contracts" rule; section 3's row.*/group.* gate on citesOneContract).
  for (const claim of claims)
    if ((claim.requirement_ref as string).startsWith("art5."))
      claim.contract_ref = "ec:other-pack:2026-09-23@1";
  const pack = await distributed({
    id: "test/multi@1",
    locale: "en",
    entries: {
      "row.art5.no_manipulation_or_deception.label": "SHOULD NEVER SHOW (row)",
      "group.art5.title": "SHOULD NEVER SHOW (group)",
    },
  });
  const root = await renderSource(source, pack);
  openAll(root);
  expect(root.textContent).not.toContain("SHOULD NEVER SHOW");
});

/** A §3 pack setting every key family this module reads, with markers
 * unique enough not to collide with any other text on the page. */
function section3Pack(groupKey: string, rowRef: string): WordingPack {
  return {
    id: "test/section3@1",
    locale: "en",
    entries: {
      "report.title": "S3-TITLE",
      "report.summary": "S3-SUMMARY",
      [`group.${groupKey}.title`]: "S3-GROUP",
      [`row.${rowRef}.label`]: "S3-ROW-LABEL",
      [`row.${rowRef}.detail`]: "S3-ROW-DETAIL",
      [`row.${rowRef}.not_evaluable`]: "S3-ROW-NE",
      "verdict.met": "S3-VERDICT-MET",
      "verdict.not_met": "S3-VERDICT-NOTMET",
      "verdict.not_evaluable": "S3-VERDICT-NE",
      "verdict.out_of_scope": "S3-VERDICT-OOS",
      "tier.recomputed": "S3-TIER-RECOMPUTED",
      "tier.judged": "S3-TIER-JUDGED",
      // grade.*, sufficiency.* and status.* are locked (the claim's own
      // account of its evidence): a pack that rewords them is refused.
    },
  };
}

const SECTION3_MARKERS_PRESENT = [
  "S3-TITLE",
  "S3-GROUP",
  "S3-ROW-LABEL",
  "S3-VERDICT-MET",
  "S3-VERDICT-NOTMET",
  "S3-VERDICT-NE",
  "S3-VERDICT-OOS",
  "S3-TIER-RECOMPUTED",
  "S3-TIER-JUDGED",
  "S3-SUMMARY",
  "S3-ROW-DETAIL",
];

function rebuildOutcomeBuckets(claims: Obj[]): Obj {
  const buckets: Record<string, string[]> = {
    met: [],
    not_met: [],
    not_evaluable: [],
    out_of_scope: [],
  };
  for (const claim of claims)
    buckets[claim.verdict as string]!.push(claim.id as string);
  if (buckets.out_of_scope!.length === 0) delete buckets.out_of_scope;
  return buckets;
}

it("a host pack that sets every section 3 key family shows each word: compliance (groups)", async () => {
  const source = fixture("compliance-bundle.json");
  const doc = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  const claims = doc.claims as Obj[];
  // task-0's art5 claim is judged out of scope, with a tier/grade/
  // sufficiency/status this row would not otherwise exercise; art5's other
  // claim stays not_met (naturally present), and
  // art50.disclosure_before_first_turn stays not_evaluable (naturally
  // present) -- met/not_met/not_evaluable/out_of_scope all land somewhere.
  const art5 = claims.filter((c) =>
    (c.requirement_ref as string).startsWith("art5."),
  );
  for (const c of art5) c.out_of_scope_allowed = true;
  const target = art5.find((c) =>
    (c.id as string).startsWith("tau2:airline:task-0"),
  )!;
  target.verdict = "out_of_scope";
  target.tier = "recomputed";
  target.grade = "witnessed";
  target.sufficiency = "SATISFIED";
  (target.presentation as Obj).status = "SATISFIED";
  const aggregate = doc.aggregate as Obj;
  (aggregate.buckets as Obj).met = [
    "tau2:airline:task-0:trial-0::art26.allowed_action_rules",
    "tau2:airline:task-0:trial-0::art26.consequential_actions_vs_instructions",
    "tau2:airline:task-1:trial-0::art50.disclosure_clear_or_obvious",
    "tau2:airline:task-1:trial-0::art26.consequential_actions_vs_instructions",
  ];
  (aggregate.buckets as Obj).out_of_scope = [
    "tau2:airline:task-0:trial-0::art5.no_manipulation_or_deception",
  ];
  const pack = await distributed(
    section3Pack("art5", "art5.no_manipulation_or_deception"),
  );
  const root = await renderSource(source, pack);
  openAll(root);
  const text = root.textContent ?? "";
  for (const marker of SECTION3_MARKERS_PRESENT)
    expect(text, marker).toContain(marker);
});

it("a host pack that sets every section 3 key family shows each word: outcome-report (lines)", async () => {
  const source = fixture("outcome-report-bundle.json");
  const doc = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  const claims = doc.claims as Obj[];
  const ref = "policy_compliance.confirmed_before_acting";
  const refClaims = claims.filter((c) => c.requirement_ref === ref);
  for (const c of refClaims) c.out_of_scope_allowed = true;
  const target = refClaims.find((c) => c.verdict === "met")!;
  target.verdict = "out_of_scope";
  target.tier = "recomputed";
  target.grade = "witnessed";
  target.sufficiency = "SATISFIED";
  (target.presentation as Obj).status = "SATISFIED";
  doc.aggregate = {
    ...(doc.aggregate as Obj),
    buckets: rebuildOutcomeBuckets(claims),
  };
  const pack = await distributed(section3Pack("policy_compliance", ref));
  const root = await renderSource(source, pack);
  openAll(root);
  const text = root.textContent ?? "";
  for (const marker of SECTION3_MARKERS_PRESENT)
    expect(text, marker).toContain(marker);
});

it("a host pack's row.<ref>.not_evaluable note shows on a row whose claims could not be decided", async () => {
  const pack = await distributed(
    section3Pack("art50", "art50.disclosure_before_first_turn"),
  );
  const root = await renderSource(fixture("compliance-bundle.json"), pack);
  openAll(root);
  expect(root.textContent).toContain("S3-ROW-NE");
});

// ---------------------------------------------------------------------------
// Review findings on #58: guards, the card's fit, verdict words in proofs
// ---------------------------------------------------------------------------

it("a pack that gives a section 3 word and its grouping key different words is refused", () => {
  for (const grouping of ["lines", "groups"] as const) {
    const problems = wordingProblems(
      {
        id: "test/pack@1",
        locale: "en",
        entries: {
          "tier.judged": "recomputed",
          [`${grouping}.tier.judged`]: "judged",
        },
      },
      DEFAULT_PACKS[grouping],
    );
    expect(problems.join("\n"), grouping).toContain(
      `tier.judged and ${grouping}.tier.judged name the same thing`,
    );
  }
});

it("a section 3 tier word is read through the grouping's own key", () => {
  const words = wordsOf(DEFAULT_PACKS.lines, {
    pack: {
      id: "test/pack@1",
      locale: "en",
      entries: { "lines.tier.judged": "S3-OWN" },
    },
  });
  expect(words.enumWord("tier", "JUDGED")).toBe("S3-OWN");
});

it("a claim's assurance words are locked: a pack cannot make WITHHELD read clean or self-attested read witnessed", () => {
  for (const [key, word] of [
    ["status.withheld", "clean"],
    ["grade.self-attested", "independently witnessed"],
    ["sufficiency.gap", "satisfied"],
  ] as const)
    for (const grouping of ["lines", "groups"] as const)
      expect(
        wordingProblems(
          { id: "test/pack@1", locale: "en", entries: { [key]: word } },
          DEFAULT_PACKS[grouping],
        ).join("\n"),
        `${grouping} ${key}`,
      ).toContain(`${key}: this line states what the page checked`);
});

it("a section 3 verdict word reaches the Outcomes proofs table as well as the rule pills", async () => {
  const pack = await distributed({
    id: "test/verdict@1",
    locale: "en",
    entries: { "verdict.met": "S3-MET" },
  });
  const root = await render("outcome-report-bundle.json", pack);
  openAll(root);
  const cells = [
    ...root.querySelectorAll<HTMLElement>(
      'tr[data-proof-crit][data-verdict="met"]',
    ),
  ];
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) expect(cell.textContent).toContain("S3-MET");
});

it("a Result whose claims the card cannot place one by one is drawn as the generic Result page, with a note", async () => {
  // a requirement judged twice in one conversation: the card would keep one
  const source = fixture("compliance-bundle.json");
  // opted into contract-report/v1, so the contract-report module draws it
  (source.extensions as Obj)["contract-report/v1"] = {};
  const doc = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  const claims = doc.claims as Obj[];
  const first = claims[0]!;
  const again = {
    ...structuredClone(first),
    id: `${first.id as string}::again`,
  };
  claims.push(again);
  const buckets = (doc.aggregate as Obj).buckets as Record<string, string[]>;
  buckets[first.verdict as string]!.push(again.id);
  const root = await renderSource(source);
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  expect(root.querySelector('[data-notice="card-unfit"]')).not.toBeNull();
  expect(root.querySelector('[data-page="compliance"]')).toBeNull();
  expect(root.querySelector('[data-page="result"]')).not.toBeNull();
  // every claim is listed, the re-judged one too
  expect(root.textContent).toContain(again.id);
});

for (const [name, file, change] of [
  [
    "an Outcomes claim whose requirement the terms do not place",
    "outcome-report-bundle.json",
    (claim: Obj) => {
      claim.requirement_ref = "extra";
    },
  ],
  [
    "a claim of a type the card does not know",
    "compliance-bundle.json",
    (claim: Obj) => {
      claim.type = "x-example";
    },
  ],
  [
    "a claim under a second contract",
    "compliance-bundle.json",
    (claim: Obj) => {
      claim.contract_ref = `${claim.contract_ref as string}-other`;
    },
  ],
] as const)
  it(`${name} sends the Result to the generic Result page, every claim listed`, async () => {
    const source = fixture(file);
    (source.extensions as Obj)["contract-report/v1"] = {};
    const doc = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
    const claim = (doc.claims as Obj[])[0]!;
    change(claim);
    const root = await renderSource(source);
    expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
    expect(root.querySelector('[data-notice="card-unfit"]')).not.toBeNull();
    expect(root.querySelector('[data-page="result"]')).not.toBeNull();
    expect(root.textContent).toContain(claim.id as string);
  });

// ---------------------------------------------------------------------------
// The sealed aggregate, the host's depth, and dates with their conditions
// ---------------------------------------------------------------------------

it("the aggregate is drawn as sealed; a number the claims disagree with carries a visible marker saying what they give", async () => {
  // cut() keeps three conversations' claims under the producer's coverage
  const root = await render("outcome-report-bundle.json");
  const line = root.querySelector<HTMLElement>(
    '[data-section="aggregate"] .agg-line',
  )!;
  const marker = line.querySelector<HTMLElement>(
    '[data-count-mismatch="evaluated_population"]',
  )!;
  expect(line.dataset.evaluated).toBe(marker.dataset.stated);
  expect(marker.dataset.recomputed).not.toBe(marker.dataset.stated);
  expect(marker.textContent).toBe(
    `count mismatch: the claims give ${Number(marker.dataset.recomputed).toLocaleString("en-US")}`,
  );
});

it("the generic Result page keeps its own visible count mismatch marker", async () => {
  const source = fixture("result-root-bundle.json");
  const doc = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  ((doc.aggregate as Obj).coverage as Obj).evaluated_population = 99;
  const root = await renderSource(source);
  const marker = root.querySelector<HTMLElement>(
    '[data-count-mismatch="evaluated_population"]',
  )!;
  expect(marker.textContent).toBe("count mismatch");
  expect(marker.dataset.stated).toBe("99");
});

async function renderAt(
  file: string,
  depth: "L0" | "L1" | "L2",
): Promise<HTMLElement> {
  const { bundle } = await sealEvidenceBundle(cut(fixture(file)));
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root, undefined, { depth });
  return root;
}

it("depth L1 opens the L1 region's toggles and none in L0", async () => {
  const root = await renderAt("outcome-report-bundle.json", "L1");
  const L0 = root.querySelector('[data-region="L0"]')!;
  const L1 = root.querySelector('[data-region="L1"]')!;
  expect(L0.querySelectorAll("details.lv").length).toBeGreaterThan(0);
  expect(L0.querySelectorAll("details.lv[open]")).toHaveLength(0);
  const rows = L1.querySelectorAll<HTMLDetailsElement>("details.rx");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.open).toBe(true);
});

it("depth L2 opens every toggle, including those built after the page was drawn", async () => {
  for (const file of ["outcome-report-bundle.json", "compliance-bundle.json"]) {
    const root = await renderAt(file, "L2");
    const all = root.querySelectorAll<HTMLDetailsElement>(
      '[data-region="L0"] details, [data-region="L1"] details, [data-region="L2-module"] details',
    );
    // the level-2 proofs exist only once a level-1 body is built
    expect(
      root.querySelectorAll('details[data-level="2"]').length,
      file,
    ).toBeGreaterThan(0);
    for (const toggle of all) expect(toggle.open, file).toBe(true);
  }
});

it("a date not yet in force is never drawn without its conditions (D3)", async () => {
  const source = fixture("compliance-bundle.json");
  const doc = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  const claims = doc.claims as Obj[];
  const later = "art50.disclosure_before_first_turn";
  for (const claim of claims)
    if (claim.requirement_ref === later) claim.applies_from = "2099-01-01";
  // a later claim is in no bucket and outside the population (ER 4.3)
  const aggregate = doc.aggregate as Obj;
  const coverage = aggregate.coverage as Obj;
  const buckets = aggregate.buckets as Record<string, string[]>;
  const laterIds = new Set(
    claims.filter((c) => c.requirement_ref === later).map((c) => c.id),
  );
  let moved = 0;
  for (const key of Object.keys(buckets)) {
    const kept = buckets[key]!.filter((id) => !laterIds.has(id));
    moved += buckets[key]!.length - kept.length;
    buckets[key] = kept;
  }
  coverage.evaluated_population =
    (coverage.evaluated_population as number) - moved;
  coverage.unknown_count = claims.filter(
    (c) => !laterIds.has(c.id) && c.sufficiency === "UNKNOWN",
  ).length;
  coverage.not_yet_in_force = laterIds.size;
  const { bundle } = await sealEvidenceBundle(source);
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root, undefined, { depth: "L2" });
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const notes = [
    ...root.querySelectorAll<HTMLElement>("article.session .applic"),
  ].filter((n) => n.textContent!.startsWith("Applies from"));
  expect(notes.length).toBeGreaterThan(0);
  // the conditions are the pack's words (row.<ref>.detail), never the
  // presentation block's hint with its own dates; the default pack sets
  // none for this test, so the line says so rather than drawing the date
  // alone
  for (const note of notes) {
    expect(note.querySelector('i[data-source="producer"]')).toBeNull();
    expect(note.textContent).toContain(
      "The conditions on when and to whom this applies are not stated in this report.",
    );
    expect(note.textContent).not.toContain("2 Dec 2027");
  }
});

it("a rule's not-applicable count is in its detail row before the row opens, so a static page shows it", async () => {
  // one rule check that did not apply: its claim is absent (no claim, by
  // construction), and the buckets no longer name it
  const source = cut(fixture("outcome-report-bundle.json"));
  const doc = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  const dropped = (doc.claims as Obj[])[0]!.id as string;
  doc.claims = (doc.claims as Obj[]).slice(1);
  const buckets = (doc.aggregate as Obj).buckets as Record<string, string[]>;
  for (const key of Object.keys(buckets))
    buckets[key] = buckets[key]!.filter((id) => id !== dropped);
  const { bundle } = await sealEvidenceBundle(source);
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root, undefined, { depth: "L0" });
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const lines = root.querySelectorAll<HTMLElement>("tr.x-detail .rule-na");
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    const row = line.closest("tr")!.previousElementSibling!;
    expect(row.querySelector<HTMLDetailsElement>("details.rx")!.open).toBe(
      false,
    );
  }
});
