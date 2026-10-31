// SPDX-License-Identifier: BSD-3-Clause
import {
  ChartRefusal,
  checkChart,
  compareScalar,
  resolveField,
  type ChartDataset,
  type ChartRow,
  type ChartWindow,
  type CheckedChart,
  type Scalar,
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

/** How a calendar cell reads a lane (docs/design/report-views.md section 3). */
export type LaneRole = "activity" | "judgment" | "adjudication";
/** What a value of a keyed lane counts as in a cell's bar and colour. */
export type ValueClass = "good" | "bad" | "open";

export interface ViewChart {
  readonly id: string;
  readonly chart: CheckedChart;
  /** A calendar lane only: the part of the cell this lane draws. */
  readonly role?: LaneRole;
  /** A calendar lane with a key channel only: the class of each key value, by its text. */
  readonly classes?: Readonly<Record<string, ValueClass>>;
  /** A timeline lane only: the mark drawn on each day with a count. */
  readonly mark?: TimelineMark;
}

export type TimelineMark = "tick" | "diamond";

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

export interface CheckedTimeline {
  readonly view: "timeline";
  readonly window: ChartWindow;
  readonly unplaced: number;
  readonly lanes: readonly ViewChart[];
}

/** One cell of the co-failure matrix: the subjects failing both requirements, and the rows that say so. */
export interface CoFailureCell {
  readonly subjects: number;
  readonly rows: readonly ChartRow[];
}

export interface CheckedCoFailure {
  readonly view: "co-failure";
  readonly window: ChartWindow;
  readonly unplaced: number;
  readonly count: ViewChart;
  readonly subject: string;
  /** The requirements with at least one failing subject, in the checker's order. */
  readonly requirements: readonly Scalar[];
  /** Distinct subjects that fail at least one requirement. */
  readonly failing: number;
  /** `cells[i][j]`: the subjects failing requirement i and j (i = j: failing i alone or with others). */
  readonly cells: readonly (readonly CoFailureCell[])[];
}

export type CheckedView =
  | CheckedCalendar
  | CheckedByPeriod
  | CheckedTimeline
  | CheckedCoFailure;

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

const ROLES: readonly LaneRole[] = ["activity", "judgment", "adjudication"];
const CLASSES: readonly ValueClass[] = ["good", "bad", "open"];

interface Entry {
  id: string;
  spec: unknown;
  role?: LaneRole;
  classes?: Record<string, ValueClass>;
  mark?: TimelineMark;
}

/** `{id, chart}` (a calendar lane also `role` and `classes`): an id the page draws as code, and a chart spec. */
function readEntry(
  value: unknown,
  at: string,
  seen: Set<string>,
  lane: "calendar" | "timeline" | false = false,
): Entry {
  if (!isObj(value))
    return refuse("view-unsupported-member", `${at} must be an object`, at);
  onlyKeys(
    value,
    lane === "calendar"
      ? ["id", "chart", "role", "classes"]
      : lane === "timeline"
        ? ["id", "chart", "mark", "classes"]
        : ["id", "chart"],
    at,
  );
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
  const out: Entry = { id: id as string, spec: chart };
  if (value.role !== undefined) {
    if (!ROLES.includes(value.role as LaneRole))
      refuse(
        "view-unsupported-member",
        `${at}/role must be one of ${ROLES.join(", ")}`,
        `${at}/role`,
      );
    out.role = value.role as LaneRole;
  }
  if (value.mark !== undefined) {
    if (value.mark !== "tick" && value.mark !== "diamond")
      refuse(
        "view-unsupported-member",
        `${at}/mark must be tick or diamond`,
        `${at}/mark`,
      );
    out.mark = value.mark as TimelineMark;
  }
  if (value.classes !== undefined) {
    const c = value.classes;
    if (!isObj(c) || Object.keys(c).length === 0)
      refuse(
        "view-unsupported-member",
        `${at}/classes must be a non-empty object`,
        `${at}/classes`,
      );
    const classes: Record<string, ValueClass> = Object.create(null) as Record<
      string,
      ValueClass
    >;
    for (const [k, v] of Object.entries(c as Obj)) {
      if (!CLASSES.includes(v as ValueClass))
        refuse(
          "view-unsupported-member",
          `${at}/classes/${k} must be one of ${CLASSES.join(", ")}`,
          `${at}/classes/${k}`,
        );
      classes[k] = v as ValueClass;
    }
    out.classes = classes;
  }
  return out;
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

/** A value with no class would be counted as nothing, so it is refused. */
function checkClasses(lanes: readonly ViewChart[]): void {
  lanes.forEach((lane, i) => {
    if (lane.classes === undefined) return;
    const key = keyChannel(lane.chart);
    for (const g of lane.chart.groups) {
      const v = String(g.key[key]);
      if (!Object.hasOwn(lane.classes, v))
        refuse(
          "view-lane-role",
          `${lane.id}: the value ${v} has no class`,
          `/lanes/${String(i)}/classes`,
        );
    }
  });
}

// The same grammar as a chart's field paths (chart-spec.ts).
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/u;

/**
 * The co-failure matrix, recomputed from the rows of one counted chart: a
 * subject (a session, a conversation) fails a requirement when a row of that
 * requirement names it, and cell (i, j) counts the subjects failing both. The
 * rows of a day that did not run are not counted, as in a by-period cell.
 */
function coFailureOf(
  part: ViewChart,
  subject: string,
  window: ChartWindow,
): CheckedCoFailure {
  const key = keyChannel(part.chart);
  const requirements: Scalar[] = [];
  const failures = new Map<string, Map<number, ChartRow[]>>();
  for (const g of part.chart.groups) {
    if (g.notRun || (g.value ?? 0) === 0) continue;
    const requirement = g.key[key]!;
    let at = requirements.findIndex((r) => r === requirement);
    if (at < 0) {
      requirements.push(requirement);
      at = requirements.length - 1;
    }
    for (const row of g.rows) {
      const who =
        row.header === undefined
          ? undefined
          : resolveField(row.header, subject);
      if (typeof who !== "string" && typeof who !== "number")
        refuse(
          "view-chart-shape",
          `${part.id}: row seq ${String(row.seq)} has no ${subject} to name its subject`,
        );
      const id = `${typeof who}:${String(who)}`;
      const byReq = failures.get(id) ?? new Map<number, ChartRow[]>();
      byReq.set(at, [...(byReq.get(at) ?? []), row]);
      failures.set(id, byReq);
    }
  }
  // Sort the requirements as the checker sorts a domain, keeping each one's index.
  const order = requirements
    .map((r, i) => ({ r, i }))
    .sort((a, b) => compareScalar(a.r, b.r));
  const rank = new Map(order.map((o, n) => [o.i, n]));
  const n = order.length;
  const subjects: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );
  const rows: Map<number, ChartRow>[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => new Map<number, ChartRow>()),
  );
  for (const byReq of failures.values()) {
    const mine = [...byReq.keys()].map((i) => rank.get(i)!);
    for (const a of mine)
      for (const b of mine) {
        subjects[a]![b]!++;
        for (const row of [
          ...byReq.get(order[a]!.i)!,
          ...byReq.get(order[b]!.i)!,
        ])
          rows[a]![b]!.set(row.seq, row);
      }
  }
  return {
    view: "co-failure",
    window,
    unplaced: unplacedOf([part]),
    count: part,
    subject,
    requirements: order.map((o) => o.r),
    failing: failures.size,
    cells: subjects.map((line, a) =>
      line.map((value, b) => ({
        subjects: value,
        rows: [...rows[a]![b]!.values()].sort((x, y) => x.seq - y.seq),
      })),
    ),
  };
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
      readEntry(raw, `/lanes/${String(i)}`, seen, "calendar"),
    );
    const checked = lanes.map((l, i): ViewChart => {
      const part = checkOne(l.id, l.spec, `/lanes/${String(i)}/chart`);
      return {
        ...part,
        ...(l.role === undefined ? {} : { role: l.role }),
        ...(l.classes === undefined ? {} : { classes: l.classes }),
      };
    });
    const roles = new Set<LaneRole>();
    checked.forEach((lane, i) => {
      const at = `/lanes/${String(i)}`;
      const keyed = lane.chart.keys.some((k) => k !== "x");
      if (lane.classes !== undefined && !keyed)
        refuse(
          "view-lane-role",
          `${lane.id}: classes name the values of a key channel, and this lane has none`,
          `${at}/classes`,
        );
      if (lane.role === undefined) return;
      if (roles.has(lane.role))
        refuse(
          "view-lane-role",
          `${lane.id}: role ${lane.role} is on two lanes`,
          `${at}/role`,
        );
      roles.add(lane.role);
      if (lane.role === "activity" && keyed)
        refuse(
          "view-lane-role",
          `${lane.id}: the activity lane counts per day and has no key channel`,
          `${at}/role`,
        );
      if (lane.role === "judgment" && (!keyed || lane.classes === undefined))
        refuse(
          "view-lane-role",
          `${lane.id}: the judgment lane needs a key channel and classes for its values`,
          `${at}/role`,
        );
      if (lane.role === "adjudication" && keyed && lane.classes === undefined)
        refuse(
          "view-lane-role",
          `${lane.id}: a keyed adjudication lane needs classes for its values`,
          `${at}/role`,
        );
    });
    for (const lane of checked)
      checkFit(lane.id, lane.chart, (n) => n <= 1, "at most one key channel");
    checkClasses(checked);
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
  if (kind === "timeline") {
    onlyKeys(value, ["view", "lanes"], "");
    const lanes = list(value.lanes, "/lanes", 1).map((raw, i) =>
      readEntry(raw, `/lanes/${String(i)}`, seen, "timeline"),
    );
    const checked = lanes.map((l, i): ViewChart => {
      const part = checkOne(l.id, l.spec, `/lanes/${String(i)}/chart`);
      return {
        ...part,
        mark: l.mark ?? "tick",
        ...(l.classes === undefined ? {} : { classes: l.classes }),
      };
    });
    for (const lane of checked)
      checkFit(lane.id, lane.chart, (n) => n <= 1, "at most one key channel");
    checkClasses(checked);
    const window = checkTogether(checked, false);
    return {
      view: "timeline",
      window,
      unplaced: unplacedOf(checked),
      lanes: checked,
    };
  }
  if (kind === "co-failure") {
    onlyKeys(value, ["view", "count", "subject"], "");
    const count = readEntry(value.count, "/count", seen);
    const part = checkOne(count.id, count.spec, "/count/chart");
    checkFit(
      part.id,
      part.chart,
      (n) => n === 1,
      "exactly one key channel, the requirement,",
    );
    const subject = value.subject;
    if (typeof subject !== "string" || !FIELD_PATH.test(subject))
      refuse(
        "view-unsupported-member",
        "/subject must be a field path",
        "/subject",
      );
    const window = checkTogether([part], false);
    return coFailureOf(part, subject as string, window);
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
    'view must be "calendar", "timeline", "co-failure" or "by-period"',
    "/view",
  );
}
