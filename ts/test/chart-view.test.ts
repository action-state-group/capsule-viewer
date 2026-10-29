// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
// The renderer alone (chart-view.ts), over checked vector charts: what a
// chart says when its plan can't tell "not run" from 0.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { checkChart, type ChartDataset } from "../src/chart-spec.js";
import { renderChart } from "../src/chart-view.js";
import { DEFAULT_WORDS } from "../src/contract-report-wording.js";
import type { ChartVector, VectorDataset } from "./helpers/chart-vectors.js";

type Obj = Record<string, unknown>;
const DIR = resolve(process.cwd(), "..", "vectors", "chart-spec");
const cases = JSON.parse(
  readFileSync(resolve(DIR, "cases.json"), "utf8"),
) as ChartVector[];
const datasets = JSON.parse(
  readFileSync(resolve(DIR, "datasets.json"), "utf8"),
) as Record<string, VectorDataset>;

function draw(name: string): HTMLElement {
  const v = cases.find((c) => c.name === name)!;
  const d = datasets[v.dataset!]!;
  const dataset: ChartDataset = {
    plan: d.plan,
    rows: d.rows.map((r) => ({
      seq: r.seq as number,
      recordType: r.record_type as string,
      digest: r.digest as string,
      ...(r.header === undefined ? {} : { header: r.header as Obj }),
    })),
  };
  return renderChart(
    checkChart(v.spec, dataset),
    0,
    "0".repeat(64),
    DEFAULT_WORDS.lines,
  );
}

it("a time axis on a plan that can't say not run says so, and draws no not-run cell", () => {
  for (const name of ["pos-plan-without-window", "pos-plan-with-two-windows"]) {
    const figure = draw(name);
    expect(figure.querySelector("[data-chart-no-runs]")!.textContent).toBe(
      "This report's plan does not say which days ran, so a day with no records reads 0",
    );
    expect(figure.querySelector("[data-not-run]")).toBeNull();
  }
});

it("a chart that can say not run, or has no time axis, carries no such note", () => {
  for (const name of ["pos-bar-cases-by-day", "pos-bar-by-outcome"])
    expect(draw(name).querySelector("[data-chart-no-runs]")).toBeNull();
});

it("a negative sum draws from the zero line, with no negative size or opacity", () => {
  const rows: never[] = [];
  const figure = renderChart(
    {
      mark: "bar",
      channels: {
        x: { field: "statement.kind", type: "nominal" },
        y: {
          field: "statement.amount",
          type: "quantitative",
          aggregate: "sum",
        },
      },
      aggregate: "y",
      keys: ["x"],
      population: 2,
      runs: false,
      groups: [
        { key: { x: "refund" }, value: -5, notRun: false, rows, runRows: rows },
        { key: { x: "sale" }, value: 3, notRun: false, rows, runRows: rows },
      ],
    },
    0,
    "0".repeat(64),
    DEFAULT_WORDS.lines,
  );
  const bars = [
    ...figure.querySelectorAll("svg rect:not([data-not-run])"),
  ].filter((r) => r.closest("pattern") === null);
  expect(bars).toHaveLength(2);
  const zero = Number(
    [...figure.querySelectorAll("svg line")]
      .find((l) => l.getAttribute("y1") === l.getAttribute("y2"))!
      .getAttribute("y1"),
  );
  for (const bar of bars)
    expect(Number(bar.getAttribute("height"))).toBeGreaterThan(0);
  // The refund hangs below the zero line, the sale stands on it.
  expect(Number(bars[0]!.getAttribute("y"))).toBe(zero);
  expect(
    Number(bars[1]!.getAttribute("y")) +
      Number(bars[1]!.getAttribute("height")),
  ).toBeCloseTo(zero);
});
