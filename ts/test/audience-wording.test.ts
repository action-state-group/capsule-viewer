// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// The audience wording packs (consumer/en, operator/en, eu-deployer/en):
// each is digest-pinned in wording/audience-packs.lock.json, fits the
// built-in pack it layers over, and draws a page whose words, and only whose
// words, differ from the default's. Their golden pages are in
// contract-report-golden.test.ts.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  DEFAULT_PACKS,
  readWordingPack,
  wordingProblems,
} from "../src/contract-report-wording.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

const WORDING = resolve(process.cwd(), "src", "wording");
const LOCK = JSON.parse(
  readFileSync(resolve(WORDING, "audience-packs.lock.json"), "utf8"),
) as Record<string, { id: string; sha256: string }>;

const AUDIENCES = [
  { file: "contract-report-consumer.en.json", grouping: "lines" },
  { file: "contract-report-operator.en.json", grouping: "lines" },
  { file: "contract-report-eu-deployer.en.json", grouping: "groups" },
] as const;

it("the lock pins exactly the three audience packs", () => {
  expect(Object.keys(LOCK).sort()).toEqual(AUDIENCES.map((a) => a.file).sort());
});

for (const { file, grouping } of AUDIENCES) {
  const text = readFileSync(resolve(WORDING, file), "utf8");

  it(`${file}: the bytes hash to the pinned digest, and the pinned id is the pack's`, () => {
    expect(createHash("sha256").update(text).digest("hex")).toBe(
      LOCK[file]!.sha256,
    );
    expect(readWordingPack(JSON.parse(text)).id).toBe(LOCK[file]!.id);
  });

  it(`${file}: fits the ${grouping} default pack and names no certification or compliance`, () => {
    const pack = readWordingPack(JSON.parse(text));
    expect(wordingProblems(pack, DEFAULT_PACKS[grouping])).toEqual([]);
    expect(pack.entries["layout.grouping"]).toBe(grouping);
    for (const [k, v] of Object.entries(pack.entries))
      expect(v, k).not.toMatch(/complian|certif/iu);
  });
}

it("a pack whose bytes do not hash to the pinned digest is refused and the page keeps the built-in words", async () => {
  const text = readFileSync(resolve(WORDING, AUDIENCES[0].file), "utf8");
  const tampered = text.replace("Your outcome report", "Your results");
  expect(tampered).not.toBe(text);
  const source = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "test", "testdata", "outcome-report-bundle.json"),
      "utf8",
    ),
  ) as Obj;
  const { bundle } = await sealEvidenceBundle(source);
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root, undefined, {
    wording: { pack: tampered, sha256: LOCK[AUDIENCES[0].file]!.sha256 },
  });
  expect(root.querySelector('[data-wording="refused"]')).not.toBeNull();
  expect(root.textContent).toContain(
    DEFAULT_PACKS.lines.entries["lines.title"],
  );
  expect(root.textContent).not.toContain("Your results");
});
