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

/** Every entry rewritten to a different word, keeping its placeholders. */
function scrambled(base: WordingPack): WordingPack {
  return {
    id: `test/scrambled-${base.entries["layout.grouping"]}@1`,
    locale: "en",
    entries: Object.fromEntries(
      Object.entries(base.entries).map(([k, v]) => [
        k,
        k.startsWith("layout.")
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
