// SPDX-License-Identifier: BSD-3-Clause
// The shared chart-spec vectors (vectors/chart-spec/). The committed files
// must equal what the generator writes, byte for byte, and every vector must
// pass when read back from disk alone. The Go package go/chartspec runs the
// same files.
//
//   AAC_WRITE_VECTORS=1 npx vitest run test/chart-spec-vectors.test.ts
//
// rewrites the corpus (and its SHA256SUMS) instead of comparing it.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ChartRefusal,
  checkChart,
  groupsAsValues,
  type ChartDataset,
} from "../src/chart-spec.js";
import {
  chartVectors,
  type ChartVector,
  type VectorDataset,
} from "./helpers/chart-vectors.js";

type Obj = Record<string, unknown>;
const DIR = resolvePath(process.cwd(), "..", "vectors", "chart-spec");
const sha256 = (bytes: Buffer | string): string =>
  createHash("sha256").update(bytes).digest("hex");

function toDataset(d: VectorDataset | undefined): ChartDataset | undefined {
  if (d === undefined) return undefined;
  return {
    plan: d.plan,
    rows: d.rows.map((r) => ({
      seq: r.seq as number,
      recordType: r.record_type as string,
      digest: r.digest as string,
      ...(r.header === undefined ? {} : { header: r.header as Obj }),
    })),
  };
}

function run(
  v: ChartVector,
  datasets: Readonly<Record<string, VectorDataset>>,
): { valid: true; values: Obj[] } | { reason: string } {
  const dataset = v.dataset === null ? undefined : datasets[v.dataset];
  if (v.dataset !== null && dataset === undefined)
    throw new Error(`${v.name} names no dataset ${v.dataset}`);
  try {
    return {
      valid: true,
      values: groupsAsValues(checkChart(v.spec, toDataset(dataset))),
    };
  } catch (e) {
    if (e instanceof ChartRefusal) return { reason: e.reason };
    throw e;
  }
}

const { cases: vectors, datasets } = await chartVectors();
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
  ) as ChartVector[];
  const onDiskDatasets = JSON.parse(
    readFileSync(resolvePath(DIR, "datasets.json"), "utf8"),
  ) as Record<string, VectorDataset>;
  const names = new Set<string>();
  for (const v of onDisk)
    it(v.name, () => {
      expect(names.has(v.name)).toBe(false);
      names.add(v.name);
      expect(run(v, onDiskDatasets)).toEqual(v.expect);
      // A negative changes one passing positive: its base draws, so the
      // refusal is this vector's change and nothing else.
      if (v.base !== undefined) {
        const base = onDisk.find((b) => b.name === v.base)!;
        expect(base.expect).toHaveProperty("valid", true);
        expect(run(base, onDiskDatasets)).toEqual(base.expect);
      }
    });
});

it("covers every refusal reason", () => {
  const reasons = new Set(
    vectors.flatMap((v) => ("reason" in v.expect ? [v.expect.reason] : [])),
  );
  expect([...reasons].sort()).toEqual(
    [
      "chart-aggregate-mismatch",
      "chart-aggregate-shape",
      "chart-dataset-invalid",
      "chart-field-missing",
      "chart-field-type",
      "chart-no-dataset",
      "chart-population-mismatch",
      "chart-row-withheld",
      "chart-runs-field-mismatch",
      "chart-runs-missing",
      "chart-runs-unsealed",
      "chart-unsupported-member",
      "chart-window-mismatch",
    ].sort(),
  );
});

it("the not-run positive draws 28 values, one of them 0, and 2 not run", () => {
  const v = vectors.find((c) => c.name === "pos-bar-cases-by-day")!;
  const values = (v.expect as { readonly values: readonly Obj[] }).values;
  expect(values).toHaveLength(30);
  expect(values.filter((g) => g.not_run === true).map((g) => g.x)).toEqual([
    "2026-09-10",
    "2026-09-20",
  ]);
  expect(values.filter((g) => g.y === 0).map((g) => g.x)).toEqual([
    "2026-09-15",
  ]);
});

it("a plan with no window node, or two, never says not run", () => {
  for (const name of ["pos-plan-without-window", "pos-plan-with-two-windows"]) {
    const v = vectors.find((c) => c.name === name)!;
    expect(JSON.stringify(v.expect)).not.toContain("not_run");
  }
});
