// SPDX-License-Identifier: BSD-3-Clause

// Charts on a report page (capsule-viewer#82), drawn from the committed
// VALID book-form bundle test/testdata/charts/book.bundle.json and the
// committed specs test/testdata/charts/specs.json (the chart-spec vectors'
// positives over the same book). The charts section must equal its golden
// byte for byte; every packaging path is exercised: html (the runtime
// checks and draws), static (drawn at build time, no script), fragment
// (unavailable), and a spec that does not match (the build refuses; a page
// that carries one anyway shows the notice, never the chart).
//
// UPDATE_GOLDENS=1 npx vitest run test/chart-golden.test.ts
// rewrites the bundle, the specs file and the golden; review the diff.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  buildVerifiedBundleContext,
  bundleVerified,
} from "@action-state-group/agent-action-capsule";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  availablePackagings,
  buildPresentation,
  PresentationBuildError,
} from "../src/presentation-builder.js";
import { chartBundleSource } from "./helpers/chart-bundle.js";
import { chartVectors } from "./helpers/chart-vectors.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

// The builder runs in node (the emitter reads its shell with node:fs), so
// this file keeps the node environment with a jsdom document of its own,
// as presentation-builder.test.ts does.
const host = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

type Obj = Record<string, unknown>;
const TESTDATA = resolve(process.cwd(), "test", "testdata");
const GOLDEN = resolve(process.cwd(), "test", "goldens", "charts", "book.html");
const BUNDLE = join(TESTDATA, "charts", "book.bundle.json");
const SPECS = join(TESTDATA, "charts", "specs.json");
const write = process.env.UPDATE_GOLDENS === "1";

const { source } = await chartBundleSource();
const sealed = `${JSON.stringify((await sealEvidenceBundle(source)).bundle)}\n`;
const { cases } = await chartVectors();
const specs = cases
  .filter((c) => c.dataset === "book" && "valid" in c.expect)
  .map((c) => c.spec);
const specsText = `${JSON.stringify(specs, null, 2)}\n`;
if (write) {
  writeFileSync(BUNDLE, sealed);
  writeFileSync(SPECS, specsText);
}
const bundle = JSON.parse(readFileSync(BUNDLE, "utf8")) as Obj;
const charts = JSON.parse(readFileSync(SPECS, "utf8")) as Obj[];

async function render(withCharts: readonly unknown[]): Promise<HTMLElement> {
  const root = document.createElement("div");
  document.body.append(root);
  await renderEvidenceGraph(bundle, root, undefined, { charts: withCharts });
  root.remove();
  return root;
}

it("the committed bundle and specs are what the generator writes", () => {
  expect(readFileSync(BUNDLE, "utf8")).toBe(sealed);
  expect(readFileSync(SPECS, "utf8")).toBe(specsText);
});

it("the committed bundle verifies VALID and its root is the monthly Result", async () => {
  const context = await buildVerifiedBundleContext(bundle);
  expect(bundleVerified(context.verification)).toBe(true);
});

describe("the html page", () => {
  it("draws every chart in L1, first, matching its golden", async () => {
    const root = await render(charts);
    const section = root.querySelector(
      '[data-region="L1"] > [data-section="charts"]',
    );
    expect(section).not.toBeNull();
    expect(root.querySelector('[data-region="L1"]')!.firstElementChild).toBe(
      section,
    );
    expect(section!.querySelectorAll("figure.cv-chart")).toHaveLength(
      charts.length,
    );
    expect(section!.querySelector("[data-chart-refused]")).toBeNull();
    const html = `${section!.outerHTML}\n`;
    if (write) writeFileSync(GOLDEN, html);
    expect(html).toBe(readFileSync(GOLDEN, "utf8"));
  });

  it("draws 2 not-run units and one 0 on the cases-by-day bar, never a 0 for not run", async () => {
    const root = await render([charts[0]]);
    const figure = root.querySelector("figure.cv-chart")!;
    const notRun = [...figure.querySelectorAll("td[data-not-run]")];
    expect(notRun).toHaveLength(2);
    expect(notRun.map((td) => td.textContent)).toEqual(["Not run", "Not run"]);
    expect(figure.querySelectorAll("svg rect[data-not-run]")).toHaveLength(2);
    const zeros = [...figure.querySelectorAll("[data-chart-value]")].filter(
      (v) => v.textContent === "0",
    );
    expect(zeros).toHaveLength(1);
  });

  it("5a: every charted value has Show evidence or a label", async () => {
    const root = await render(charts);
    const values = [
      ...root.querySelectorAll<HTMLElement>("[data-chart-value]"),
    ];
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      const key = value.dataset.chartValue!;
      const action = value.parentElement!.querySelector(
        `[data-evidence-for="${key}"]`,
      );
      expect(action, key).not.toBeNull();
      if (value.textContent === "0")
        expect(action!.getAttribute("data-evidence-label")).toBe("none");
      else {
        expect(action!.localName).toBe("details");
        // Every cited record is in the core's records section.
        for (const id of action!.getAttribute("data-cites")!.split(" "))
          expect(root.querySelector(`[id="record-${id}"]`), id).not.toBeNull();
      }
    }
  });

  it("every chart carries its caption, the derived label and its table", async () => {
    const root = await render(charts);
    for (const figure of root.querySelectorAll("figure.cv-chart")) {
      expect(figure.querySelector("figcaption")!.textContent).toMatch(
        /records?/u,
      );
      expect(figure.querySelector(".cv-chart-derived")!.textContent).toBe(
        "Derived from this report's records, not evidence itself",
      );
      expect(figure.querySelector("table caption")!.textContent).toBe(
        "The values in this chart",
      );
      // The picture is hidden from assistive technology; the table is the text.
      expect(figure.querySelector("svg")!.getAttribute("aria-hidden")).toBe(
        "true",
      );
      expect(figure.querySelector("svg [style]")).toBeNull();
    }
  });

  it("states each spec's SHA-256 under How this page was checked", async () => {
    const root = await render(charts);
    const checked = root.querySelector("[data-checked]")!.textContent!;
    for (const figure of root.querySelectorAll<HTMLElement>("figure.cv-chart"))
      expect(checked).toContain(figure.dataset.chartSha256!);
  });

  it("a spec that does not match is replaced by the notice, never drawn", async () => {
    const bad = structuredClone(charts[0]!);
    ((bad.usermeta as Obj).capsule as Obj).population = { count: 1 };
    const root = await render([bad]);
    expect(root.querySelector("figure.cv-chart")).toBeNull();
    const note = root.querySelector<HTMLElement>("[data-chart-refused]")!;
    expect(note.dataset.chartRefused).toBe("chart-population-mismatch");
    expect(note.textContent).toBe(
      "This chart was not drawn: its spec does not match the report's data (chart-population-mismatch).",
    );
    expect(root.querySelector("[data-checked]")!.textContent).toContain(
      "(not drawn: chart-population-mismatch)",
    );
  });

  it("the old rendering: a not-run day stated as 0 is refused, not drawn as 0", async () => {
    const lying = structuredClone(charts[0]!);
    const capsule = (lying.usermeta as Obj).capsule as Obj;
    capsule.values = (capsule.values as Obj[]).map((v) =>
      v.not_run === true ? { x: v.x, y: 0 } : v,
    );
    const root = await render([lying]);
    expect(root.querySelector("figure.cv-chart")).toBeNull();
    expect(
      root.querySelector<HTMLElement>("[data-chart-refused]")!.dataset
        .chartRefused,
    ).toBe("chart-aggregate-mismatch");
  });
});

describe("the builder", () => {
  const runtime = {
    code: readFileSync(
      resolve(process.cwd(), "dist", "evidence-graph.iife.js"),
      "utf8",
    ),
  };

  it("carries the specs in the offline page's bootstrap", async () => {
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "html",
      runtime,
      charts,
    });
    expect(built.format).toBe("html");
    if (built.format === "html") expect(built.html).toContain('"charts":[');
  });

  it("refuses a build whose spec does not match, naming it", async () => {
    const bad = structuredClone(charts[0]!);
    ((bad.usermeta as Obj).capsule as Obj).population = { count: 1 };
    await expect(
      buildPresentation(bundle, {
        presentation: "auto",
        audience: "*",
        format: "html",
        runtime,
        charts: [charts[1], bad],
      }),
    ).rejects.toThrow(/chart 2: chart-population-mismatch/u);
  });

  it("refuses charts for a bundle whose Result names no dataset", async () => {
    const plain = JSON.parse(
      readFileSync(join(TESTDATA, "result-root-bundle.sealed.json"), "utf8"),
    ) as Obj;
    await expect(
      buildPresentation(plain, {
        presentation: "auto",
        audience: "*",
        format: "html",
        runtime,
        charts: [charts[0]],
      }),
    ).rejects.toBeInstanceOf(PresentationBuildError);
  });

  it("fragment is unavailable with charts (fragment-has-charts); static draws them with no script", async () => {
    const available = await availablePackagings(bundle, {
      presentation: "auto",
      audience: "*",
      runtime,
      charts,
    });
    const fragment = available.find((a) => a.target === "fragment")!;
    expect(fragment.available).toBe(false);
    if (!fragment.available)
      expect(fragment.reason.code).toBe("fragment-has-charts");
    expect(available.find((a) => a.target === "static")!.available).toBe(true);
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "static",
      charts,
    });
    if (built.format !== "static") throw new Error("not static");
    expect(built.html).not.toMatch(/<script/iu);
    expect(built.html.match(/<figure class="cv-chart"/gu)).toHaveLength(
      charts.length,
    );
    expect(built.html).toContain("Not run");
  });
});

it("render-report --charts --format static writes the scripts-off copy", () => {
  const dir = mkdtempSync(join(tmpdir(), "cv-charts-"));
  const out = join(dir, "page.html");
  const log = execFileSync(
    process.execPath,
    [
      "scripts/render-report.mjs",
      BUNDLE,
      "--charts",
      SPECS,
      "--format",
      "static",
      "-o",
      out,
    ],
    { encoding: "utf8" },
  );
  expect(log).toContain(`static`);
  expect(log).toContain(`${charts.length} charts`);
  const html = readFileSync(out, "utf8");
  expect(html).not.toMatch(/<script/iu);
  expect(html).not.toContain("<noscript>");
  expect(html.match(/<figure class="cv-chart"/gu)).toHaveLength(charts.length);
});
