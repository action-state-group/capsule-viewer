// SPDX-License-Identifier: BSD-3-Clause
import {
  ChartRefusal,
  checkChart,
  type ChartDataset,
  type ChartWindow,
  type CheckedChart,
} from "./chart-spec.js";

/**
 * Calendar and by-period views (capsule-viewer#120;
 * docs/design/report-views.md): ordinary chart specs laid out in a grid. The
 * data half only, with no DOM. Every number a view shows is a group
 * `checkChart` recomputed from the dataset's rows; this module adds the rules
 * that make several charts fit one grid and reads the entry's own members.
 */

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const refuse = (
  reason: ChartRefusal["reason"],
  message: string,
  pointer?: string,
): never => {
  throw new ChartRefusal(reason, message, pointer);
};

const ID = /^[a-z][a-z0-9_]{0,31}$/u;

/** True for an entry of the `charts` setting that is a view, not a chart spec. */
export const isView = (value: unknown): boolean =>
  isObj(value) && Object.hasOwn(value, "view");

export interface ViewChart {
  readonly id: string;
  readonly chart: CheckedChart;
}

export interface CheckedCalendar {
  readonly view: "calendar";
  readonly window: ChartWindow;
  /** Distinct records dated on a day that did not run: in no cell. */
  readonly unplaced: number;
  readonly lanes: readonly ViewChart[];
}

export interface CheckedByPeriod {
  readonly view: "by-period";
  readonly window: ChartWindow;
  readonly unplaced: number;
  readonly count: ViewChart;
  readonly columns: readonly ViewChart[];
}

export type CheckedView = CheckedCalendar | CheckedByPeriod;

/** A chart's one key channel besides x. */
const keyChannel = (chart: CheckedChart): "y" | "color" =>
  chart.keys.find((k) => k !== "x") as "y" | "color";

function onlyKeys(value: Obj, allowed: readonly string[], at: string): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      refuse(
        "view-unsupported-member",
        `${at}/${key} is not in the accepted subset`,
        `${at}/${key}`,
      );
}

/** `{id, chart}`: an id the page draws as code, and a chart spec. */
function readEntry(
  value: unknown,
  at: string,
  seen: Set<string>,
): { id: string; spec: unknown } {
  if (!isObj(value))
    return refuse("view-unsupported-member", `${at} must be an object`, at);
  onlyKeys(value, ["id", "chart"], at);
  const { id, chart } = value;
  if (typeof id !== "string" || !ID.test(id))
    refuse(
      "view-unsupported-member",
      `${at}/id must match ${ID.source}`,
      `${at}/id`,
    );
  if (seen.has(id as string))
    refuse("view-unsupported-member", `${at}/id ${String(id)} is repeated`, at);
  seen.add(id as string);
  if (chart === undefined)
    refuse("view-unsupported-member", `${at}/chart is missing`, `${at}/chart`);
  return { id: id as string, spec: chart };
}

const list = (value: unknown, at: string, min: number): unknown[] => {
  if (!Array.isArray(value) || value.length < min)
    refuse(
      "view-unsupported-member",
      `${at} must be a list of at least ${String(min)}`,
      at,
    );
  return value as unknown[];
};

// Days in a month of the proleptic Gregorian calendar, by arithmetic.
const monthDays = (year: number, month: number): number =>
  month === 2
    ? (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;

function wholeMonths(window: ChartWindow): boolean {
  const [ty, tm, td] = window.to.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return window.from.endsWith("-01") && td === monthDays(ty, tm);
}

/** Each day of a checked chart and whether it was not run: from its units, which an empty category domain leaves intact. */
function daysOf(chart: CheckedChart): Map<string, boolean> {
  return new Map((chart.units ?? []).map((u) => [u.unit, u.notRun]));
}

/** The distinct records dated on a day that did not run: counted by the chart, shown in no cell. */
function unplacedOf(parts: readonly ViewChart[]): number {
  const seqs = new Set<number>();
  for (const { chart } of parts)
    for (const g of chart.groups)
      if (g.notRun) for (const row of g.rows) seqs.add(row.seq);
  return seqs.size;
}

/** A chart that fits a view's grid: one UTC day per x unit, a count, a plan that can say "not run". */
function checkFit(
  id: string,
  chart: CheckedChart,
  extraKeys: (n: number) => boolean,
  extraWhat: string,
): void {
  const x = chart.channels.x;
  if (
    chart.temporal !== "x" ||
    x === undefined ||
    x.timeUnit !== "utcyearmonthdate"
  )
    refuse(
      "view-chart-shape",
      `${id}: x must be a temporal field in the unit utcyearmonthdate, so each group is one UTC day`,
    );
  if (chart.channels[chart.aggregate]?.aggregate !== "count")
    refuse("view-chart-shape", `${id}: the aggregate must be count`);
  if (!extraKeys(chart.keys.filter((k) => k !== "x").length))
    refuse(
      "view-chart-shape",
      `${id}: ${extraWhat} besides x, or the chart fits no grid`,
    );
  if (!chart.runs || chart.window === undefined)
    refuse(
      "view-runs-unsealed",
      `${id}: the plan does not say which days ran (it needs exactly one window node and the chart's runs), so a day nothing ran would read 0`,
    );
}

/**
 * Checks across the charts of one view: one set of days not run and (when
 * `disjoint`) no row counted by two charts. One window needs no check of its
 * own: a view needs a plan with exactly one window node, and `checkChart`
 * holds every chart's window to it.
 */
function checkTogether(
  parts: readonly ViewChart[],
  disjoint: boolean,
): ChartWindow {
  const first = parts[0]!;
  const window = first.chart.window!;
  const days = daysOf(first.chart);
  const owner = new Map<number, string>();
  for (const { id, chart } of parts) {
    const mine = daysOf(chart);
    for (const [day, notRun] of days)
      if (mine.get(day) !== notRun)
        refuse(
          "view-runs-mismatch",
          `${id} and ${first.id} disagree on whether ${day} ran`,
        );
    if (!disjoint) continue;
    for (const g of chart.groups)
      for (const row of g.rows) {
        const was = owner.get(row.seq);
        if (was !== undefined && was !== id)
          refuse(
            "view-overlap",
            `record seq ${String(row.seq)} is counted by both ${was} and ${id}`,
          );
        owner.set(row.seq, id);
      }
  }
  return window;
}

/**
 * Read a view entry and check every chart in it against the dataset. Throws
 * a {@link ChartRefusal}: a `view-*` reason for the view's own rules, the
 * chart's own reason (with the chart's id in the message) when a chart in it
 * fails its check.
 */
export function checkView(
  value: unknown,
  dataset: ChartDataset | undefined,
): CheckedView {
  if (!isObj(value))
    return refuse("view-unsupported-member", "a view must be an object", "");
  const kind = value.view;
  const checkOne = (id: string, spec: unknown, at: string): ViewChart => {
    try {
      return { id, chart: checkChart(spec, dataset) };
    } catch (err) {
      if (err instanceof ChartRefusal)
        // The chart's pointer is relative to the chart; make it the entry's.
        throw new ChartRefusal(
          err.reason,
          `${id}: ${err.message.slice(err.reason.length + 2)}`,
          err.pointer === undefined ? at : `${at}${err.pointer}`,
        );
      throw err;
    }
  };
  const seen = new Set<string>();
  if (kind === "calendar") {
    onlyKeys(value, ["view", "lanes"], "");
    const lanes = list(value.lanes, "/lanes", 1).map((raw, i) =>
      readEntry(raw, `/lanes/${String(i)}`, seen),
    );
    const checked = lanes.map((l, i) =>
      checkOne(l.id, l.spec, `/lanes/${String(i)}/chart`),
    );
    for (const lane of checked)
      checkFit(lane.id, lane.chart, (n) => n <= 1, "at most one key channel");
    const window = checkTogether(checked, false);
    if (!wholeMonths(window))
      refuse(
        "view-window-not-months",
        `a calendar's window runs from a month's first day to a month's last day; ${window.from} to ${window.to} does not`,
      );
    return {
      view: "calendar",
      window,
      unplaced: unplacedOf(checked),
      lanes: checked,
    };
  }
  if (kind === "by-period") {
    onlyKeys(value, ["view", "count", "columns"], "");
    const count = readEntry(value.count, "/count", seen);
    const columns = (
      value.columns === undefined ? [] : list(value.columns, "/columns", 0)
    ).map((raw, i) => readEntry(raw, `/columns/${String(i)}`, seen));
    const all = [count, ...columns].map((e, i) =>
      checkOne(
        e.id,
        e.spec,
        i === 0 ? "/count/chart" : `/columns/${String(i - 1)}/chart`,
      ),
    );
    for (const part of all)
      checkFit(
        part.id,
        part.chart,
        (n) => n === 1,
        "exactly one key channel, the requirement,",
      );
    const field =
      all[0]!.chart.channels[all[0]!.chart.keys.find((k) => k !== "x")!]!.field;
    for (const part of all) {
      const mine =
        part.chart.channels[part.chart.keys.find((k) => k !== "x")!]!;
      if (mine.field !== field)
        refuse(
          "view-chart-shape",
          `${part.id} groups by ${String(mine.field)}, not ${String(field)}`,
        );
    }
    const types = new Set(
      all.flatMap((p) =>
        p.chart.groups.map((g) => typeof g.key[keyChannel(p.chart)]),
      ),
    );
    if (types.size > 1)
      refuse(
        "view-chart-shape",
        `the charts' ${String(field)} values are of more than one type (${[...types].sort().join(", ")}), so a row would join unlike values`,
      );
    const window = checkTogether(all, true);
    return {
      view: "by-period",
      window,
      unplaced: unplacedOf(all),
      count: all[0]!,
      columns: all.slice(1),
    };
  }
  return refuse(
    "view-unsupported-member",
    'view must be "calendar" or "by-period"',
    "/view",
  );
}
