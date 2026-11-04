// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
//
// The verification page draws AAC's `parentWitness` (parent-log-witness/v1,
// agent-action-capsule#347) and no "self-witnessed" line for such a bundle
// (capsule-viewer#237). The viewer computes nothing: the cases are AAC's
// vectors/bundle/parent-log-witness, verified under its witness directory.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildVerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import { renderEvidenceGraph } from "../src/browser.js";

interface Vectors {
  witness_directory: unknown;
  cases: { id: string; bundle: unknown }[];
}

let vectors: Vectors;
beforeAll(async () => {
  vectors = JSON.parse(
    await readFile(
      resolve(
        process.cwd(),
        "test",
        "testdata",
        "aac-vectors",
        "bundle",
        "parent-log-witness",
        "vectors.json",
      ),
      "utf8",
    ),
  ) as Vectors;
});

async function page(id: string, directory = true): Promise<HTMLElement> {
  const bundle = vectors.cases.find((c) => c.id === id)!.bundle;
  const context = await buildVerifiedBundleContext(bundle, {
    ...(directory ? { witnessDirectory: vectors.witness_directory } : {}),
  });
  const root = document.createElement("main");
  await renderEvidenceGraph(context, root);
  return root.querySelector<HTMLElement>('[data-page="verification"]')!;
}

describe("verification page: checkpoint witnessed through a parent log", () => {
  it("draws a wholly witnessed checkpoint with every entry and its receipt", async () => {
    const verification = await page("pos-witnessed-whole");
    const line = verification.querySelector<HTMLElement>(
      '[data-witness="parent"]',
    )!;
    expect(line.textContent).toBe(
      "witnessed through a parent log: every entry (3 of 3)",
    );
    expect(line.dataset.whole).toBe("true");
    const receipt = line.nextElementSibling!.querySelector("li")!.textContent!;
    expect(receipt).toMatch(
      /^https:\/\/cll-witness\.example · registered \d{4}-\d\d-\d\dT[\d:.]+Z$/u,
    );
    expect(verification.querySelector('[data-witness="self"]')).toBeNull();
  });

  it("draws a part extent as entry k of n", async () => {
    const verification = await page("pos-witnessed-part");
    const line = verification.querySelector<HTMLElement>(
      '[data-witness="parent"]',
    )!;
    expect(line.textContent).toBe(
      "witnessed through a parent log: entry 2 of 3",
    );
    expect(line.dataset.whole).toBe("false");
    expect(verification.querySelector('[data-witness="self"]')).toBeNull();
  });

  it("keeps the self-witnessed line and draws nothing when the witness is not checked", async () => {
    const verification = await page("pos-witnessed-whole", false);
    expect(verification.querySelector('[data-witness="parent"]')).toBeNull();
    expect(
      verification.querySelector('[data-witness="self"]')?.textContent,
    ).toBe("self-witnessed: no transparency-service receipt");
  });

  it("draws nothing for a bundle with no parent-log block", async () => {
    const verification = await page("pos-unwitnessed");
    expect(verification.querySelector('[data-witness="parent"]')).toBeNull();
  });

  it("draws nothing when a link is broken", async () => {
    const verification = await page("neg-path-edited");
    expect(verification.querySelector('[data-witness="parent"]')).toBeNull();
  });
});
