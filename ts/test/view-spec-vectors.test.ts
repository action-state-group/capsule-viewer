// SPDX-License-Identifier: BSD-3-Clause
// The shared view-spec vectors (vectors/view-spec/): the committed files must
// equal what the generator writes, byte for byte, and every vector must pass
// when read back from disk alone. The Go package go/chartspec runs the same
// files (capsule-viewer#156).
//
//   AAC_WRITE_VECTORS=1 npx vitest run test/view-spec-vectors.test.ts
//
// rewrites the corpus (and its SHA256SUMS) instead of comparing it.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import type { VectorDataset } from "./helpers/chart-vectors.js";
import {
  runView,
  toChartDataset,
  viewVectors,
  type ViewVector,
} from "./helpers/view-vectors.js";

const DIR = resolvePath(process.cwd(), "..", "vectors", "view-spec");
const sha256 = (bytes: Buffer | string): string =>
  createHash("sha256").update(bytes).digest("hex");

const { cases: vectors, datasets } = await viewVectors();
const files: Record<string, string> = {
  "cases.json": `${JSON.stringify(vectors, null, 2)}\n`,
  "datasets.json": `${JSON.stringify(datasets)}\n`,
};
if (process.env.AAC_WRITE_VECTORS === "1") {
  mkdirSync(DIR, { recursive: true });
  for (const [name, text] of Object.entries(files))
    writeFileSync(resolvePath(DIR, name), text);
}

it("the committed corpus is exactly what the generator writes", () => {
  for (const [name, text] of Object.entries(files))
    expect(readFileSync(resolvePath(DIR, name), "utf8")).toBe(text);
  const sums = readdirSync(DIR)
    .filter((name) => name !== "SHA256SUMS")
    .sort()
    .map((name) => `${sha256(readFileSync(resolvePath(DIR, name)))}  ${name}`)
    .join("\n");
  if (process.env.AAC_WRITE_VECTORS === "1")
    writeFileSync(resolvePath(DIR, "SHA256SUMS"), `${sums}\n`);
  expect(readFileSync(resolvePath(DIR, "SHA256SUMS"), "utf8")).toBe(
    `${sums}\n`,
  );
});

describe("every vector, read back from disk", () => {
  const onDisk = JSON.parse(
    readFileSync(resolvePath(DIR, "cases.json"), "utf8"),
  ) as ViewVector[];
  const onDiskDatasets = JSON.parse(
    readFileSync(resolvePath(DIR, "datasets.json"), "utf8"),
  ) as Record<string, VectorDataset>;
  const names = new Set<string>();
  const run = (v: ViewVector): unknown =>
    runView(
      v.view,
      v.dataset === null
        ? undefined
        : toChartDataset(onDiskDatasets[v.dataset]),
    );
  for (const v of onDisk)
    it(v.name, () => {
      expect(names.has(v.name)).toBe(false);
      names.add(v.name);
      expect(run(v)).toEqual(v.expect);
      // A negative changes one passing positive: its base draws.
      if (v.base !== undefined) {
        const base = onDisk.find((b) => b.name === v.base)!;
        expect(base.expect).toHaveProperty("valid", true);
        expect(run(base)).toEqual(base.expect);
      }
    });
});

it("covers every view refusal reason and every view kind", () => {
  const reasons = new Set(
    vectors.flatMap((v) =>
      typeof v.expect.reason === "string" ? [v.expect.reason] : [],
    ),
  );
  for (const reason of [
    "view-unsupported-member",
    "view-chart-shape",
    "view-runs-unsealed",
    "view-runs-mismatch",
    "view-window-not-months",
    "view-overlap",
    "view-lane-role",
  ])
    expect(reasons.has(reason)).toBe(true);
  const kinds = new Set(
    vectors.flatMap((v) => (v.expect.valid === true ? [v.expect.view] : [])),
  );
  expect([...kinds].sort()).toEqual([
    "by-period",
    "calendar",
    "co-failure",
    "timeline",
  ]);
});
