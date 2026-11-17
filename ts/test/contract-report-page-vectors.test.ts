// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
// The contract-report page vectors (vectors/contract-report-page/). The
// committed files must equal what the generator writes from this renderer,
// byte for byte, and each case must hold when read back from disk alone:
// the page drawn from the case's bundle and view has the case's core strip
// and module rows, and none of its `absent` strings anywhere.
//
//   AAC_WRITE_VECTORS=1 npx vitest run test/contract-report-page-vectors.test.ts
//
// rewrites the corpus (and its SHA256SUMS) instead of comparing it.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  audiencePack,
  drawCase,
  generatePageVectors,
  pageText,
  type PageCase,
} from "./helpers/contract-report-page-vectors.js";

const DIR = resolve(process.cwd(), "..", "vectors", "contract-report-page");
const FILE = "cases.json";
const sha256 = (bytes: Buffer | string): string =>
  createHash("sha256").update(bytes).digest("hex");

function checksums(): string {
  const lines = readdirSync(DIR)
    .filter((name) => name !== "SHA256SUMS")
    .sort()
    .map((name) => `${sha256(readFileSync(resolve(DIR, name)))}  ${name}`);
  return `${lines.join("\n")}\n`;
}

const generated = `${JSON.stringify({ version: 1, cases: await generatePageVectors() }, null, 2)}\n`;
if (process.env.AAC_WRITE_VECTORS === "1") {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(resolve(DIR, FILE), generated);
  writeFileSync(resolve(DIR, "SHA256SUMS"), checksums());
}

it("the committed corpus is exactly what the generator writes", () => {
  expect(readFileSync(resolve(DIR, FILE), "utf8")).toBe(generated);
});

it("SHA256SUMS lists every file", () => {
  expect(readFileSync(resolve(DIR, "SHA256SUMS"), "utf8")).toBe(checksums());
});

const committed = JSON.parse(readFileSync(resolve(DIR, FILE), "utf8")) as {
  cases: PageCase[];
};

for (const c of committed.cases)
  it(`vector: ${c.name}`, async () => {
    const drawn = await drawCase(
      c.bundle,
      c.view.wording === null ? undefined : audiencePack(c.view.wording),
      c.grouping,
    );
    // The core strip and the module's rows are asserted apart.
    expect(drawn.core_strip).toEqual(c.expected.core_strip);
    expect(drawn.module_rows).toEqual(c.expected.module_rows);
    for (const gone of c.absent)
      expect(pageText(drawn.root), gone).not.toContain(gone);
  });

it("a claim the bundle does not carry never appears", () => {
  const c = committed.cases.find(
    (x) => x.name === "result-generic-claim-not-carried",
  )!;
  expect(c.expected.core_strip.tiles.map((t) => t.of)).toEqual(["2", "2", "2"]);
  expect(c.expected.core_strip.tiles.map((t) => t.count)).toEqual([
    "1",
    "1",
    "0",
  ]);
  expect(c.expected.module_rows.rows.map((r) => r.claim)).toEqual([
    "claim-1",
    "claim-2",
  ]);
});

it("a not-evaluable claim is shown as not evaluable, never omitted or upgraded", () => {
  const c = committed.cases.find((x) => x.name === "result-generic")!;
  const tile = (b: string) =>
    c.expected.core_strip.tiles.find((t) => t.bucket === b)!;
  expect(tile("not_evaluable").count).toBe("1");
  expect(tile("met").count).toBe("1");
  const row = c.expected.module_rows.rows.find((r) => r.claim === "claim-3")!;
  expect(row.verdict).toBe("not_evaluable");
});
