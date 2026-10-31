// SPDX-License-Identifier: BSD-3-Clause

// Calendar and by-period views (capsule-viewer#120;
// docs/design/report-views.md), drawn from the committed VALID book-form
// bundle test/testdata/views/month.bundle.json and the committed view
// entries test/testdata/views/views.json. Each view section must equal its
// golden byte for byte.
//
// UPDATE_GOLDENS=1 npx vitest run test/report-view-golden.test.ts
// rewrites the bundle, the entries and the goldens; review the diff.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  buildResultRoot,
  buildVerifiedBundleContext,
  bundleVerified,
} from "@action-state-group/agent-action-capsule";
import { renderEvidenceGraph } from "../src/browser.js";
import { chartDatasetOf } from "../src/chart-dataset.js";
import {
  ChartRefusal,
  compareScalar,
  type ChartDataset,
} from "../src/chart-spec.js";
import {
  availablePackagings,
  buildPresentation,
  PresentationBuildError,
} from "../src/presentation-builder.js";
import { checkView } from "../src/report-view.js";
import { chartBundleSource } from "./helpers/chart-bundle.js";
import {
  CASE_TYPE,
  WINDOW,
  datasetOf,
  datasetPlan,
} from "./helpers/chart-fixtures.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";
import {
  VIEW_RECORD_TYPES,
  viewCharts,
  viewHeaders,
  viewSpecs,
} from "./helpers/view-fixtures.js";

const host = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

type Obj = Record<string, unknown>;
const TESTDATA = resolve(process.cwd(), "test", "testdata", "views");
const GOLDENS = resolve(process.cwd(), "test", "goldens", "views");
const BUNDLE = join(TESTDATA, "month.bundle.json");
const VIEWS = join(TESTDATA, "views.json");
const write = process.env.UPDATE_GOLDENS === "1";

const { source } = await chartBundleSource({
  headers: viewHeaders(),
  recordTypes: VIEW_RECORD_TYPES,
});
const sealed = `${JSON.stringify((await sealEvidenceBundle(source)).bundle)}\n`;
const generated = viewSpecs();
const viewsText = `${JSON.stringify(
  [
    generated.calendar,
    generated.byPeriod,
    generated.cells,
    generated.timeline,
    generated.coFailure,
  ],
  null,
  2,
)}\n`;
if (write) {
  writeFileSync(BUNDLE, sealed);
  writeFileSync(VIEWS, viewsText);
}
const bundle = JSON.parse(readFileSync(BUNDLE, "utf8")) as Obj;
const [calendar, byPeriod, cells, timeline, coFailure] = JSON.parse(
  readFileSync(VIEWS, "utf8"),
) as Obj[] as [Obj, Obj, Obj, Obj, Obj];

async function render(entries: readonly unknown[]): Promise<HTMLElement> {
  const root = document.createElement("div");
  document.body.append(root);
  await renderEvidenceGraph(bundle, root, undefined, { charts: entries });
  root.remove();
  return root;
}

const context = await buildVerifiedBundleContext(bundle);
const dataset = await chartDatasetOf(
  context,
  (await buildResultRoot(context))!,
);

const refusal = (entry: unknown): ChartRefusal => {
  try {
    checkView(entry, dataset);
  } catch (err) {
    if (err instanceof ChartRefusal) return err;
    throw err;
  }
  throw new Error("the view was not refused");
};
const clone = (entry: Obj): Obj => structuredClone(entry);
const chartOf = (entry: Obj, path: (string | number)[]): Obj =>
  path.reduce<unknown>((at, k) => (at as Obj)[k as string], entry) as Obj;

it("the committed bundle and view entries are what the generator writes", () => {
  expect(readFileSync(BUNDLE, "utf8")).toBe(sealed);
  expect(readFileSync(VIEWS, "utf8")).toBe(viewsText);
});

it("the committed bundle verifies VALID", () => {
  expect(bundleVerified(context.verification)).toBe(true);
});

describe("the calendar's cells (lanes with a role)", () => {
  const drawn = async (): Promise<HTMLElement> => {
    const root = await render([cells]);
    expect(root.querySelector("[data-chart-refused]")).toBeNull();
    return root;
  };

  it("matches its golden", async () => {
    const root = await drawn();
    const html = `${root.querySelector('[data-region="L1"] > [data-section="charts"]')!.outerHTML}\n`;
    const golden = join(GOLDENS, "calendar-cells.html");
    if (write) writeFileSync(golden, html);
    expect(html).toBe(readFileSync(golden, "utf8"));
  });

  it("a cell reads the day's activity, judgment, bar and adjudication chip", async () => {
    const root = await drawn();
    const cell = root.querySelector<HTMLElement>('td[data-day="2026-09-18"]')!;
    expect(cell.querySelector(".cv-act")!.textContent).toBe("1 case");
    expect(cell.querySelector(".cv-jdg")!.textContent).toBe(
      "judged · 0 met · 1 not met",
    );
    expect(cell.querySelector("svg.cv-bar rect.cv-bar-bad")).not.toBeNull();
    expect(cell.querySelector(".cv-adj")!.textContent).toBe(
      "◆ 1 adjudication recorded · all concur",
    );
    const link = cell.querySelector<HTMLAnchorElement>("a.cv-day-link")!;
    expect(root.querySelector(link.getAttribute("href")!)).not.toBeNull();
  });

  it("a wording pack gives the cell its nouns and verbs, and the legend its scale: Terms Pack's words are a pack's, not the viewer's", async () => {
    const text = JSON.stringify({
      wording_pack_version: "aac.wording-pack/v0",
      id: "test/terms-pack-calendar@1",
      locale: "en",
      entries: {
        "calendar.activity.one": "{n} conversation",
        "calendar.activity.other": "{n} conversations",
        "calendar.class.good": "{n} resolved",
        "calendar.class.bad": "{n} missed",
        "calendar.legend.good": "all but one resolved",
        "calendar.legend.some": "some missed",
        "calendar.legend.most": "most missed",
      },
    });
    const wording = {
      pack: text,
      sha256: createHash("sha256").update(text).digest("hex"),
    };
    const root = document.createElement("div");
    document.body.append(root);
    await renderEvidenceGraph(bundle, root, undefined, {
      charts: [cells],
      wording,
    });
    root.remove();
    const cell = root.querySelector<HTMLElement>('td[data-day="2026-09-18"]')!;
    expect(cell.querySelector(".cv-act")!.textContent).toBe("1 conversation");
    expect(cell.querySelector(".cv-jdg")!.textContent).toBe(
      "judged · 0 resolved · 1 missed",
    );
    expect(root.querySelector(".cv-legend li")!.textContent).toBe(
      " all but one resolved",
    );
  });

  it("an overturned ruling reads as a difference", async () => {
    const root = await drawn();
    const chip = root.querySelector<HTMLElement>(
      'td[data-day="2026-09-24"] .cv-adj',
    )!;
    expect(chip.textContent).toBe("◆ 1 adjudication recorded · 1 differs");
  });

  it("colours a day green, amber or red by its judged cases, and says so in a legend", async () => {
    const root = await drawn();
    const scales = new Set(
      [...root.querySelectorAll<HTMLElement>("td[data-scale]")].map(
        (td) => td.dataset.scale,
      ),
    );
    expect(scales).toEqual(new Set(["good", "most"]));
    expect(
      [...root.querySelectorAll(".cv-legend li")].map((li) => li.textContent),
    ).toEqual([
      " all but one met",
      " some not met",
      " most not met",
      "◆ adjudications recorded that day",
    ]);
  });

  it("gives every day that ran a section with its heading and records, and a cell never links to a day that did not run", async () => {
    const root = await drawn();
    const section = root.querySelector<HTMLElement>(
      '[data-day-section="2026-09-15"]',
    )!;
    expect(section.querySelector("h3")!.textContent).toBe(
      "Tuesday, September 15 · 1 case · judged · 1 met · 0 not met",
    );
    expect(section.querySelectorAll(".cv-day-table tbody tr")).toHaveLength(1);
    expect(root.querySelector('[data-day-section="2026-09-10"]')).toBeNull();
    const notRun = root.querySelector<HTMLElement>(
      'td[data-day="2026-09-10"]',
    )!;
    expect(notRun.querySelector("a")).toBeNull();
  });

  it("5a: every counted value in a day section has Show evidence, every 0 a label", async () => {
    const root = await drawn();
    for (const value of root.querySelectorAll<HTMLElement>(
      "[data-chart-value]",
    )) {
      const key = value.dataset.chartValue!;
      const evidence = root.querySelector(`[data-evidence-for="${key}"]`)!;
      expect(evidence).not.toBeNull();
      expect(evidence.hasAttribute("data-evidence-label")).toBe(
        value.textContent === "0",
      );
    }
  });

  it("refuses a role on two lanes, a value with no class, classes with no key, and a judgment lane without classes", async () => {
    const twice = clone(cells);
    (twice.lanes as Obj[])[1]!.role = "activity";
    expect(refusal(twice).reason).toBe("view-lane-role");
    const unclassed = clone(cells);
    delete ((unclassed.lanes as Obj[])[1]!.classes as Obj).not_yet_in_force;
    expect(refusal(unclassed).reason).toBe("view-lane-role");
    const keyless = clone(cells);
    (keyless.lanes as Obj[])[0]!.classes = { x: "good" };
    expect(refusal(keyless).reason).toBe("view-lane-role");
    const bare = clone(cells);
    delete (bare.lanes as Obj[])[1]!.classes;
    expect(refusal(bare).reason).toBe("view-lane-role");
    const badRole = clone(cells);
    (badRole.lanes as Obj[])[0]!.role = "headline";
    expect(refusal(badRole).reason).toBe("view-unsupported-member");
    const badClass = clone(cells);
    ((badClass.lanes as Obj[])[1]!.classes as Obj).met = "great";
    expect(refusal(badClass).reason).toBe("view-unsupported-member");
  });
});

describe("the timeline", () => {
  it("matches its golden: a row per lane, a mark on each day with a count, hatched days that did not run", async () => {
    const root = await render([timeline]);
    expect(root.querySelector("[data-chart-refused]")).toBeNull();
    const figure = root.querySelector('figure.cv-view[data-view="timeline"]')!;
    expect(
      figure.querySelectorAll("svg.cv-timeline .cv-tl-notrun"),
    ).toHaveLength(4);
    expect(
      figure.querySelector('[data-lane="rulings"] li')!.textContent,
    ).toContain("2026-09-06");
    const html = `${root.querySelector('[data-region="L1"] > [data-section="charts"]')!.outerHTML}\n`;
    const golden = join(GOLDENS, "timeline.html");
    if (write) writeFileSync(golden, html);
    expect(html).toBe(readFileSync(golden, "utf8"));
  });

  it("no mark on a day that did not run, and every count has Show evidence", async () => {
    const root = await render([timeline]);
    for (const day of ["2026-09-10", "2026-09-28"])
      expect(root.querySelector(`.cv-tl-mark[data-day="${day}"]`)).toBeNull();
    for (const value of root.querySelectorAll<HTMLElement>(
      "[data-chart-value]",
    ))
      expect(
        root.querySelector(`[data-evidence-for="${value.dataset.chartValue}"]`),
      ).not.toBeNull();
  });

  it("refuses an unknown mark and a value with no class", async () => {
    const bad = clone(timeline);
    (bad.lanes as Obj[])[0]!.mark = "bar";
    expect(refusal(bad).reason).toBe("view-unsupported-member");
    const unclassed = clone(timeline);
    delete ((unclassed.lanes as Obj[])[1]!.classes as Obj).overturned;
    expect(refusal(unclassed).reason).toBe("view-lane-role");
  });
});

describe("the co-failure matrix", () => {
  it("matches its golden", async () => {
    const root = await render([coFailure]);
    expect(root.querySelector("[data-chart-refused]")).toBeNull();
    const html = `${root.querySelector('[data-region="L1"] > [data-section="charts"]')!.outerHTML}\n`;
    const golden = join(GOLDENS, "co-failure.html");
    if (write) writeFileSync(golden, html);
    expect(html).toBe(readFileSync(golden, "utf8"));
  });

  it("counts a session once per requirement it fails, and pairs by sessions failing both", async () => {
    const checked = checkView(coFailure, dataset);
    if (checked.view !== "co-failure") throw new Error("not a co-failure view");
    const at = (r: string): number => checked.requirements.indexOf(r);
    // Session s4 fails req-b (its case) and req-a (the extra case).
    expect(checked.cells[at("req-a")]![at("req-b")]!.subjects).toBeGreaterThan(
      0,
    );
    // The matrix is symmetric.
    for (const a of checked.requirements.keys())
      for (const b of checked.requirements.keys())
        expect(checked.cells[a]![b]!.subjects).toBe(
          checked.cells[b]![a]!.subjects,
        );
    // No session fails more requirements than there are sessions that fail any.
    for (const a of checked.requirements.keys())
      expect(checked.cells[a]![a]!.subjects).toBeLessThanOrEqual(
        checked.failing,
      );
  });

  it("a diagonal cell is the sessions failing that requirement, whatever else they fail", async () => {
    const root = await render([coFailure]);
    const diagonal = root.querySelector<HTMLElement>("td[data-diagonal]")!;
    expect(diagonal.querySelector("[data-chart-value]")!.textContent).not.toBe(
      "0",
    );
  });

  it("refuses a subject field a row lacks, and a non-path subject", async () => {
    const lacking = clone(coFailure);
    lacking.subject = "statement.conversation";
    expect(refusal(lacking).reason).toBe("view-chart-shape");
    const bad = clone(coFailure);
    bad.subject = "not a path";
    expect(refusal(bad).reason).toBe("view-unsupported-member");
  });
});

describe("the calendar", () => {
  it("matches its golden, first in L1", async () => {
    const root = await render([calendar]);
    const figure = root.querySelector('[data-region="L1"] figure.cv-view')!;
    expect(figure.getAttribute("data-view")).toBe("calendar");
    expect(root.querySelector("[data-chart-refused]")).toBeNull();
    const html = `${root.querySelector('[data-region="L1"] > [data-section="charts"]')!.outerHTML}\n`;
    const golden = join(GOLDENS, "calendar.html");
    if (write) writeFileSync(golden, html);
    expect(html).toBe(readFileSync(golden, "utf8"));
  });

  it("runs Monday first: 2026-09-01 is a Tuesday, so one pad cell leads", async () => {
    const root = await render([calendar]);
    const heads = [...root.querySelectorAll(".cv-cal thead th")].map(
      (th) => th.textContent,
    );
    expect(heads).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    const firstRow = root.querySelector(".cv-cal tbody tr")!;
    expect(firstRow.children[0]!.classList.contains("cv-pad")).toBe(true);
    expect((firstRow.children[1] as HTMLElement).dataset.day).toBe(
      "2026-09-01",
    );
  });

  it("a day with no daily run reads Not run in every lane, never 0", async () => {
    const root = await render([calendar]);
    for (const date of [
      "2026-09-10",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
    ]) {
      const cell = root.querySelector<HTMLElement>(`td[data-day="${date}"]`)!;
      expect(cell.dataset.notRun).toBeDefined();
      expect(cell.textContent).toBe(`${date.slice(8)}Not run`);
      expect(cell.querySelector("[data-lane]")).toBeNull();
    }
    const ran = root.querySelector<HTMLElement>('td[data-day="2026-09-15"]')!;
    expect(ran.dataset.notRun).toBeUndefined();
    expect(ran.querySelectorAll("[data-lane]")).toHaveLength(3);
  });

  it("draws all three lanes from the pack's entry, including the adjudications", async () => {
    const root = await render([calendar]);
    const cell = root.querySelector<HTMLElement>('td[data-day="2026-09-12"]')!;
    expect(
      [...cell.querySelectorAll<HTMLElement>("[data-lane]")].map(
        (l) => l.dataset.lane,
      ),
    ).toEqual(["activity", "judgment", "adjudications"]);
    expect(
      cell.querySelector('[data-lane="adjudications"]')!.textContent,
    ).toContain("1");
  });

  it("a keyed lane with no rows at all reads 0 with its label on every day that ran", async () => {
    const quiet = clone(calendar);
    (quiet.lanes as Obj[]).push({
      id: "escalations",
      chart: viewCharts(viewHeaders()).keyedPerDay("escalation", "level"),
    });
    const root = await render([quiet]);
    expect(root.querySelector("[data-chart-refused]")).toBeNull();
    const lane = root.querySelector<HTMLElement>(
      'td[data-day="2026-09-15"] [data-lane="escalations"]',
    )!;
    expect(lane.querySelector("[data-chart-value]")!.textContent).toBe("0");
    expect(lane.querySelector("[data-evidence-label]")).not.toBeNull();
  });

  it("says how many records sit on days that did not run", async () => {
    const root = await render([calendar]);
    const note = root.querySelector<HTMLElement>("[data-unplaced]")!;
    expect(note.dataset.unplaced).toBe("4");
    expect(note.textContent).toBe(
      "4 records are dated on days that did not run, so they are in no cell",
    );
  });

  it("5a: every counted value has Show evidence in the records section, every 0 a label", async () => {
    const root = await render([calendar, byPeriod]);
    const values = [
      ...root.querySelectorAll<HTMLElement>("[data-chart-value]"),
    ];
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      const action = value.parentElement!.querySelector(
        `[data-evidence-for="${value.dataset.chartValue!}"]`,
      );
      expect(action, value.dataset.chartValue).not.toBeNull();
      if (value.textContent === "0")
        expect(action!.getAttribute("data-evidence-label")).toBe("none");
      else
        for (const id of action!.getAttribute("data-cites")!.split(" "))
          expect(root.querySelector(`[id="record-${id}"]`), id).not.toBeNull();
    }
  });
});

describe("the by-period table", () => {
  it("matches its golden", async () => {
    const root = await render([byPeriod]);
    expect(root.querySelector("[data-chart-refused]")).toBeNull();
    const html = `${root.querySelector('[data-region="L1"] > [data-section="charts"]')!.outerHTML}\n`;
    const golden = join(GOLDENS, "by-period.html");
    if (write) writeFileSync(golden, html);
    expect(html).toBe(readFileSync(golden, "utf8"));
  });

  it("has week columns, then out_of_scope and not_yet_in_force of their own, and no met column", async () => {
    const root = await render([byPeriod]);
    const weeks = [...root.querySelectorAll<HTMLElement>("th[data-week]")].map(
      (th) => th.textContent,
    );
    expect(weeks).toEqual([
      "Week of 2026-08-31",
      "Week of 2026-09-07",
      "Week of 2026-09-14",
      "Week of 2026-09-21",
      "Week of 2026-09-28",
    ]);
    const row = root.querySelector('tr[data-requirement="req-a"]')!;
    expect(
      [...row.querySelectorAll<HTMLElement>("td[data-column]")].map(
        (td) => td.dataset.column,
      ),
    ).toEqual(["out_of_scope", "not_yet_in_force"]);
    expect(root.querySelector("figure")!.textContent).not.toMatch(
      /\bmet\b(?!\w)/u,
    );
  });

  it("a week with a day that did not run says so; a week with none that ran reads Not run, never 0", async () => {
    const root = await render([byPeriod]);
    const mixed = root.querySelector<HTMLElement>(
      'tr[data-requirement="req-a"] td[data-week="2026-09-07"]',
    )!;
    expect(mixed.querySelector("[data-not-run-days]")!.textContent).toBe(
      "1 day not run",
    );
    for (const tr of root.querySelectorAll("tr[data-requirement]")) {
      const last = tr.querySelector<HTMLElement>('td[data-week="2026-09-28"]')!;
      expect(last.dataset.notRun).toBeDefined();
      expect(last.textContent).toBe("Not run");
    }
  });

  it("the totals carry the days not run, and no cell counts a not-run day's case", async () => {
    const root = await render([byPeriod]);
    const total = root.querySelector<HTMLElement>(
      'tr[data-requirement="req-a"] td[data-column="out_of_scope"]',
    )!;
    expect(total.querySelector("[data-not-run-days]")!.textContent).toBe(
      "4 days not run",
    );
    // The 10th (a Thursday of the week of the 7th) has a not-met req-b case
    // and no daily run: the week's req-b cell counts no run day's case, so 0.
    const cell = root.querySelector<HTMLElement>(
      'tr[data-requirement="req-b"] td[data-week="2026-09-07"]',
    )!;
    expect(cell.querySelector("[data-chart-value]")!.textContent).toBe("0");
  });

  it("with no not-met row at all the weeks still read Not run or 0, never blank", async () => {
    const none = clone(byPeriod);
    (none.count as Obj).chart =
      viewCharts(viewHeaders()).byVerdict("never_recorded");
    const root = await render([none]);
    expect(root.querySelector("[data-chart-refused]")).toBeNull();
    const cell = root.querySelector<HTMLElement>(
      'tr[data-requirement="req-a"] td[data-week="2026-09-28"]',
    )!;
    expect(cell.textContent).toBe("Not run");
    const week = root.querySelector<HTMLElement>(
      'tr[data-requirement="req-a"] td[data-week="2026-09-14"]',
    )!;
    expect(week.querySelector("[data-chart-value]")!.textContent).toBe("0");
  });

  it("reads a requirement keyed by color (a bar) like one keyed by y", async () => {
    const bar = clone(byPeriod);
    (bar.count as Obj).chart =
      viewCharts(viewHeaders()).byVerdictBar("not_met");
    const root = await render([bar, byPeriod]);
    const [a, b] = [...root.querySelectorAll("figure.cv-view")].map((f) =>
      [...f.querySelectorAll("td[data-week]")].map((td) => td.textContent),
    );
    expect(a).toEqual(b);
  });

  it("every Show evidence anchor is unique, whatever characters a requirement has", async () => {
    const root = await render([byPeriod]);
    const ids = [...root.querySelectorAll("details.cv-ev")].map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the refusals, each the change of a passing view", () => {
  // A dataset over the view book for a plan other than the golden's, built
  // the way the golden's is, so a view can be refused for its own rule.
  const headers = viewHeaders();
  async function datasetWith(
    windows: { field: string; from: string; to: string }[],
    book: Obj[] = headers,
  ): Promise<ChartDataset> {
    const plan = datasetPlan(book.length, windows, [], VIEW_RECORD_TYPES);
    const { rows } = await datasetOf(plan, book);
    return {
      plan,
      rows: rows.map((r) => ({
        seq: r.seq as number,
        recordType: r.record_type as string,
        digest: r.digest as string,
        header: r.header as Obj,
      })),
    };
  }
  const refusalOn = (entry: unknown, on: ChartDataset): ChartRefusal => {
    try {
      checkView(entry, on);
    } catch (err) {
      if (err instanceof ChartRefusal) return err;
      throw err;
    }
    throw new Error("the view was not refused");
  };
  const lanes = (...charts: Obj[]): Obj => ({
    view: "calendar",
    lanes: charts.map((chart, i) => ({ id: `lane_${String(i + 1)}`, chart })),
  });

  it("both passing views pass", () => {
    expect(checkView(calendar, dataset).view).toBe("calendar");
    expect(checkView(byPeriod, dataset).view).toBe("by-period");
  });

  it("view-unsupported-member: an unknown member, a bad id, a repeated id, no lanes, an unknown view", () => {
    const extra = { ...clone(calendar), title: "x" };
    expect(refusal(extra).reason).toBe("view-unsupported-member");
    const badId = clone(calendar);
    (badId.lanes as Obj[])[0]!.id = "Activity";
    expect(refusal(badId).reason).toBe("view-unsupported-member");
    const twice = clone(calendar);
    (twice.lanes as Obj[])[1]!.id = "activity";
    expect(refusal(twice).reason).toBe("view-unsupported-member");
    expect(refusal({ ...clone(calendar), lanes: [] }).reason).toBe(
      "view-unsupported-member",
    );
    expect(refusal({ view: "grid" }).reason).toBe("view-unsupported-member");
  });

  it("view-chart-shape: a month unit, a sum, a keyless chart in a by-period", () => {
    const c = viewCharts(headers);
    expect(refusal(lanes(c.perMonth(CASE_TYPE))).reason).toBe(
      "view-chart-shape",
    );
    expect(refusal(lanes(c.sumPerDay(CASE_TYPE, "weight"))).reason).toBe(
      "view-chart-shape",
    );
    const keyless = clone(byPeriod);
    (keyless.columns as Obj[])[0]!.chart = c.perDay(CASE_TYPE);
    expect(refusal(keyless).reason).toBe("view-chart-shape");
  });

  it("view-chart-shape: the by-period charts group by different fields", () => {
    const c = viewCharts(headers);
    const other = clone(byPeriod);
    (other.columns as Obj[])[0]!.chart = c.byVerdict("out_of_scope", "verdict");
    const err = refusal(other);
    expect(err.reason).toBe("view-chart-shape");
    expect(err.message).toContain("statement.verdict");
  });

  it("view-chart-shape: requirement values of more than one type", async () => {
    const mixed = viewHeaders().map((h) =>
      h.record_type === CASE_TYPE &&
      (h.statement as Obj).verdict === "out_of_scope"
        ? { ...h, statement: { ...(h.statement as Obj), requirement: 7 } }
        : h,
    );
    const on = await datasetWith(
      [{ field: "event_time_claim", ...WINDOW }],
      mixed,
    );
    const c = viewCharts(mixed);
    const entry = clone(byPeriod);
    (entry.count as Obj).chart = c.byVerdict("not_met");
    (entry.columns as Obj[])[0]!.chart = c.byVerdict("out_of_scope");
    (entry.columns as Obj[]).pop();
    const err = refusalOn(entry, on);
    expect(err.reason).toBe("view-chart-shape");
    expect(err.message).toContain("more than one type");
  });

  it("a chart that fails its own check fails the view with its reason and its id", () => {
    const bad = clone(calendar);
    const chart = chartOf(bad, ["lanes", 1, "chart"]);
    ((chart.encoding as Obj).y as Obj).field = "statement.missing";
    const err = refusal(bad);
    expect(err.reason).toBe("chart-field-missing");
    expect(err.message).toContain("judgment:");
    expect(err.pointer ?? "").toMatch(/^\/lanes\/1\/chart/u);
  });

  it("the old rendering: a not-run day stated as 0 is refused", () => {
    const lying = clone(calendar);
    const capsule = (chartOf(lying, ["lanes", 0, "chart"]).usermeta as Obj)
      .capsule as Obj;
    capsule.values = (capsule.values as Obj[]).map((v) =>
      v.not_run === true ? { x: v.x, y: 0 } : v,
    );
    expect(refusal(lying).reason).toBe("chart-aggregate-mismatch");
  });

  it("view-window-not-months: a sealed window that starts on the 2nd", async () => {
    const part = { from: "2026-09-02", to: "2026-09-30" };
    const on = await datasetWith([{ field: "event_time_claim", ...part }]);
    const c = viewCharts(headers, { window: part });
    // The same chart over the whole month passes; only the window differs.
    expect(
      checkView(lanes(viewCharts(headers).perDay(CASE_TYPE)), dataset).view,
    ).toBe("calendar");
    expect(refusalOn(lanes(c.perDay(CASE_TYPE)), on).reason).toBe(
      "view-window-not-months",
    );
  });

  it("view-runs-unsealed: a plan with no window node cannot say a day did not run", async () => {
    const on = await datasetWith([]);
    const c = viewCharts(headers, { runs: null });
    expect(refusalOn(lanes(c.perDay(CASE_TYPE)), on).reason).toBe(
      "view-runs-unsealed",
    );
  });

  it("view-runs-mismatch: two lanes that disagree on which days ran", () => {
    // The second lane takes the case records as its runs, so it reads
    // different days as not run than the first.
    const cases = viewCharts(headers, {
      runs: {
        filter: { field: "record_type", equal: CASE_TYPE },
        field: "event_time_claim",
      },
      runType: CASE_TYPE,
    });
    const first = viewCharts(headers);
    const err = refusal(
      lanes(first.perDay(CASE_TYPE), cases.perDay(CASE_TYPE)),
    );
    expect(err.reason).toBe("view-runs-mismatch");
  });

  it("view-overlap: a column that selects the not_met rows too", () => {
    const wide = clone(byPeriod);
    (wide.columns as Obj[])[0]!.chart =
      viewCharts(headers).byVerdict("not_met");
    expect(refusal(wide).reason).toBe("view-overlap");
  });
});

it("by-period rows sort as the checker sorts a domain, by code point", () => {
  expect(["\u{1F600}", "\uE000"].sort(compareScalar)).toEqual([
    "\uE000",
    "\u{1F600}",
  ]);
});

describe("a month with no not-met case", () => {
  it("has no group in the count chart, yet its days still say which ran", async () => {
    const headers = viewHeaders()
      .filter(
        (h) =>
          !(
            h.record_type === CASE_TYPE &&
            (h.statement as Obj).verdict === "not_met"
          ),
      )
      .map((h, i) => ({ ...h, seq: i + 1 }));
    const plan = datasetPlan(headers.length, undefined, [], VIEW_RECORD_TYPES);
    const { rows } = await datasetOf(plan, headers);
    const empty: ChartDataset = {
      plan,
      rows: rows.map((r) => ({
        seq: r.seq as number,
        recordType: r.record_type as string,
        digest: r.digest as string,
        header: r.header as Obj,
      })),
    };
    const checked = checkView(
      {
        view: "by-period",
        count: {
          id: "not_met",
          chart: viewCharts(headers).byVerdict("not_met"),
        },
      },
      empty,
    );
    if (checked.view !== "by-period") throw new Error("not by-period");
    expect(checked.count.chart.groups).toEqual([]);
    const notRun = (checked.count.chart.units ?? [])
      .filter((u) => u.notRun)
      .map((u) => u.unit);
    expect(notRun).toEqual([
      "2026-09-10",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
    ]);
  });
});

describe("the pages", () => {
  const runtime = {
    code: readFileSync(
      resolve(process.cwd(), "dist", "evidence-graph.iife.js"),
      "utf8",
    ),
  };
  const entries = [calendar, byPeriod];

  it("carries the entries in the offline page's bootstrap", async () => {
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "html",
      runtime,
      charts: entries,
    });
    if (built.format === "html")
      expect(built.html).toContain('"view":"calendar"');
  });

  it("fragment is unavailable with views (fragment-has-charts); static draws them with no script", async () => {
    const available = await availablePackagings(bundle, {
      presentation: "auto",
      audience: "*",
      runtime,
      charts: entries,
    });
    const fragment = available.find((a) => a.target === "fragment")!;
    expect(fragment.available).toBe(false);
    if (!fragment.available)
      expect(fragment.reason.code).toBe("fragment-has-charts");
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "static",
      charts: entries,
    });
    if (built.format !== "static") throw new Error("not static");
    expect(built.html).not.toMatch(/<script/iu);
    expect(built.html.match(/<figure class="cv-view"/gu)).toHaveLength(2);
    expect(built.html).toContain("Not run");
  });

  it("a mismatching view builds nothing, and a page that carries one shows the notice", async () => {
    const bad = clone(calendar);
    const capsule = (chartOf(bad, ["lanes", 0, "chart"]).usermeta as Obj)
      .capsule as Obj;
    capsule.population = { count: 1 };
    await expect(
      buildPresentation(bundle, {
        presentation: "auto",
        audience: "*",
        format: "static",
        charts: [byPeriod, bad],
      }),
    ).rejects.toThrow(/chart 2: .*chart-population-mismatch/u);
    const root = await render([bad]);
    expect(root.querySelector("figure.cv-view")).toBeNull();
    expect(
      root.querySelector<HTMLElement>("[data-chart-refused]")!.dataset
        .chartRefused,
    ).toBe("chart-population-mismatch");
  });

  it("a view on a bundle whose Result names no dataset is refused", async () => {
    const plain = JSON.parse(
      readFileSync(
        join(
          resolve(process.cwd(), "test", "testdata"),
          "result-root-bundle.sealed.json",
        ),
        "utf8",
      ),
    ) as Obj;
    await expect(
      buildPresentation(plain, {
        presentation: "auto",
        audience: "*",
        format: "html",
        runtime,
        charts: [calendar],
      }),
    ).rejects.toBeInstanceOf(PresentationBuildError);
  });

  it("states each entry's SHA-256 under How this page was checked", async () => {
    const root = await render(entries);
    const checked = root.querySelector("[data-checked]")!.textContent!;
    for (const figure of root.querySelectorAll<HTMLElement>("figure.cv-view"))
      expect(checked).toContain(figure.dataset.chartSha256!);
  });

  it("render-report --charts --format static writes the scripts-off copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "cv-views-"));
    const out = join(dir, "page.html");
    execFileSync(
      process.execPath,
      [
        "scripts/render-report.mjs",
        BUNDLE,
        "--charts",
        VIEWS,
        "--format",
        "static",
        "-o",
        out,
      ],
      { encoding: "utf8" },
    );
    const html = readFileSync(out, "utf8");
    expect(html).not.toMatch(/<script/iu);
    expect(html.match(/<figure class="cv-view"/gu)).toHaveLength(5);
  });
});
