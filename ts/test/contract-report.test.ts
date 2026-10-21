// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// The contract-report module: one view for the Outcomes report and the EU
// AI Act Results, every word from a wording pack. A pack changes words and
// nothing else; a pack that would drop a count, fold two verdicts into one
// word, or does not hash to its wording_sha256 is refused before anything is
// drawn. The nesting rule (SEAMS ruling 11) holds on both pages.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { sha256Hex } from "@action-state-group/agent-action-capsule";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  DEFAULT_PACKS,
  LOCKED_ENTRIES,
  placeholders,
  readWordingPack,
  wordingProblems,
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
              .map((p) => ` {${p}}`)
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
  /not checked|does not check|did not check|not evidence|not a sealed record|withheld|not stated|not shown|not in this bundle|this page|this card|as sealed|\(sealed\)|self-attested|as given|recomputed|absent|unknown|uncomputable|no signature|placeholder/iu;

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
  // The tier's name and the quality-sampling note: words about the method,
  // which a pack may tune, not the page's account of its own checking.
  expect(unlocked.sort()).toEqual([
    "groups.q.tail",
    "groups.tier.recomputed",
    "lines.tier.recomputed",
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

for (const { file, page } of CARDS)
  it(`${page}: a pack rewording "stated by the bundle, not checked here" draws no card`, async () => {
    const root = await render(
      file,
      await distributed({
        id: "test/witness@1",
        locale: "en",
        entries: { "prov.witness.stated": "{witnesses}: checked." },
      }),
    );
    expect(root.querySelector(`[data-page="${page}"]`)).toBeNull();
    expect(
      root.querySelector('[data-refusal="presentation-failed"]'),
    ).not.toBeNull();
  });

// ---------------------------------------------------------------------------
// A pack swap changes words, and only words
// ---------------------------------------------------------------------------

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
      const a = plain.querySelector(`[data-page="${page}"]`)!;
      const b = swapped.querySelector(`[data-page="${page}"]`)!;
      expect(b).not.toBeNull();
      expect(b.textContent).not.toBe(a.textContent);
      // same elements, classes, verdicts, counts and record ids, in order
      expect(skeleton(b)).toBe(skeleton(a));
      // the counts and digests the pack's sentences carry are the module's
      expect(digests(a).length).toBeGreaterThan(0);
      // (the supplied pack's own wording_sha256 is named once, in the proofs)
      expect(digests(b).filter((d) => d !== wording.sha256)).toEqual(
        digests(a),
      );
      expect(digests(b)).toContain(wording.sha256);
      // and the proofs say which pack drew the page
      expect(b.textContent).toContain(make().id);
    });
}

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
  expect(problems.join("\n")).toContain("prov.of uses {count} {extra} {total}");
});

it("a pack cannot fold two verdicts into one word, or change the grouping", () => {
  const fold: WordingPack = {
    id: "test/fold@1",
    locale: "en",
    entries: { "verdict.not_met": "met", "layout.grouping": "groups" },
  };
  const problems = wordingProblems(fold, DEFAULT_PACKS.lines).join("\n");
  expect(problems).toMatch(/verdict\.not_met and verdict\.met read alike/u);
  expect(problems).toContain('layout.grouping is "groups"');
});

it("verdict words are told apart as a reader reads them, and a pack cannot swap two verdicts' words", () => {
  const check = (entries: Record<string, string>): string =>
    wordingProblems(
      { id: "test/read@1", locale: "en", entries },
      DEFAULT_PACKS.lines,
    ).join("\n");
  // case, spacing and invisible characters do not make two words
  expect(check({ "verdict.not_met": "Met" })).toMatch(/read alike/u);
  expect(check({ "verdict.not_met": " met\u200b " })).toMatch(/read alike/u);
  expect(check({ "verdict.not_met": "\u200b" })).toContain(
    "verdict.not_met has no visible word",
  );
  expect(check({ "verdict.not_met": "m\u0435t" })).toContain(
    "verdict.not_met mixes Latin, Greek and Cyrillic letters",
  );
  expect(check({ "verdict.not_met": "met\u2060" })).toMatch(/read alike/u);
  // met and not met swapped: no word is shared, and still refused
  const swapped = check({ "verdict.met": "not met", "verdict.not_met": "met" });
  expect(swapped).toContain(
    'verdict.met reads "not met", the word for verdict.not_met',
  );
  expect(swapped).toContain(
    'verdict.not_met reads "met", the word for verdict.met',
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

for (const { file, page } of CARDS) {
  it(`${page}: a refused pack draws no card, and the page says the presentation failed`, async () => {
    const bad = await distributed({
      id: "test/bad@1",
      locale: "en",
      entries: { "verdict.not_met": "met" },
    });
    const root = await render(file, bad);
    expect(root.querySelector(`[data-page="${page}"]`)).toBeNull();
    expect(
      root.querySelector('[data-refusal="presentation-failed"]'),
    ).not.toBeNull();
    // bytes that do not hash to the pack's wording_sha256: refused the same way
    const good = await distributed(ladderPack("lines"));
    const tampered = await render(file, { ...good, sha256: "0".repeat(64) });
    expect(tampered.querySelector(`[data-page="${page}"]`)).toBeNull();
  });
}

it("a pack's entries for other modules (a page title) are left alone", () => {
  const pack: WordingPack = {
    id: "test/title@1",
    locale: "en",
    entries: { "page.title": "September", "verdict.met": "kept" },
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
    const card = root.querySelector<HTMLElement>(`[data-page="${page}"]`)!;
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
