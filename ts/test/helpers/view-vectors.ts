// SPDX-License-Identifier: BSD-3-Clause
// The view-spec vector corpus (vectors/view-spec/), generated from
// view-fixtures.ts: every positive's expected summary comes from the
// TypeScript view checker over the book, every negative names the positive it
// changes (`base`) and the refusal it expects. The Go package go/chartspec
// runs the same files (capsule-viewer#156).
import { groupsAsValues, type ChartDataset } from "../../src/chart-spec.js";
import { ChartRefusal } from "../../src/chart-spec.js";
import { checkView } from "../../src/report-view.js";
import { CASE_TYPE, WINDOW, datasetOf, datasetPlan } from "./chart-fixtures.js";
import type { VectorDataset } from "./chart-vectors.js";
import {
  VIEW_RECORD_TYPES,
  viewCharts,
  viewHeaders,
  viewSpecs,
} from "./view-fixtures.js";

type Obj = Record<string, unknown>;

export interface ViewVector {
  readonly name: string;
  readonly base?: string;
  readonly note: string;
  readonly view: Obj;
  /** The name of a dataset in datasets.json, or null for a Result that names none. */
  readonly dataset: string | null;
  readonly expect: Obj;
}

export const toChartDataset = (
  d: VectorDataset | undefined,
): ChartDataset | undefined =>
  d === undefined
    ? undefined
    : {
        plan: d.plan,
        rows: d.rows.map((r) => ({
          seq: r.seq as number,
          recordType: r.record_type as string,
          digest: r.digest as string,
          ...(r.header === undefined ? {} : { header: r.header as Obj }),
        })),
      };

/** What a checked view must read the same in every implementation. */
export function runView(view: unknown, dataset: ChartDataset | undefined): Obj {
  try {
    const checked = checkView(view, dataset);
    const part = (p: {
      id: string;
      chart: Parameters<typeof groupsAsValues>[0];
      role?: string;
      mark?: string;
      classes?: Readonly<Record<string, string>>;
    }): Obj => ({
      id: p.id,
      ...(p.role === undefined ? {} : { role: p.role }),
      ...(p.mark === undefined ? {} : { mark: p.mark }),
      ...(p.classes === undefined ? {} : { classes: { ...p.classes } }),
      values: groupsAsValues(p.chart),
    });
    const out: Obj = {
      valid: true,
      view: checked.view,
      window: { ...checked.window },
      unplaced: checked.unplaced,
    };
    if (checked.view === "calendar" || checked.view === "timeline")
      out.parts = checked.lanes.map(part);
    else if (checked.view === "by-period")
      out.parts = [checked.count, ...checked.columns].map(part);
    else {
      out.parts = [part(checked.count)];
      out.subject = checked.subject;
      out.requirements = [...checked.requirements];
      out.failing = checked.failing;
      out.subjects = checked.cells.map((line) => line.map((c) => c.subjects));
      out.records = checked.cells.map((line) =>
        line.map((c) => c.rows.map((r) => r.seq)),
      );
    }
    return out;
  } catch (e) {
    if (e instanceof ChartRefusal)
      return {
        reason: e.reason,
        ...(e.pointer === undefined || e.pointer === ""
          ? {}
          : { pointer: e.pointer }),
      };
    throw e;
  }
}

const clone = <T>(v: T): T => structuredClone(v);

export async function viewVectors(): Promise<{
  cases: ViewVector[];
  datasets: Record<string, VectorDataset>;
}> {
  const headers = viewHeaders();
  const datasets: Record<string, VectorDataset> = {};
  const build = async (
    name: string,
    windows: { field: string; from: string; to: string }[],
    book: Obj[] = headers,
  ): Promise<void> => {
    const plan = datasetPlan(book.length, windows, [], VIEW_RECORD_TYPES);
    const { rows } = await datasetOf(plan, book);
    datasets[name] = { plan, rows };
  };
  const stated = { field: "event_time_claim", ...WINDOW };
  await build("view-book", [stated]);
  await build("view-book-window-from-the-2nd", [
    { field: "event_time_claim", from: "2026-09-02", to: "2026-09-30" },
  ]);
  await build("view-book-no-window", []);
  const mixed = headers.map((h) =>
    h.record_type === CASE_TYPE &&
    (h.statement as Obj).verdict === "out_of_scope"
      ? { ...h, statement: { ...(h.statement as Obj), requirement: 7 } }
      : h,
  );
  await build("view-book-mixed-requirement-types", [stated], mixed);

  const c = viewCharts(headers);
  const specs = viewSpecs(headers);
  const out: ViewVector[] = [];
  const dataOf = (name: string | null): ChartDataset | undefined =>
    name === null ? undefined : toChartDataset(datasets[name]);
  const pos = (name: string, note: string, view: Obj): void => {
    out.push({
      name,
      note,
      view,
      dataset: "view-book",
      expect: runView(view, dataOf("view-book")),
    });
  };
  const neg = (
    name: string,
    base: string,
    note: string,
    reason: string,
    view: Obj,
    dataset: string | null = "view-book",
  ): void => {
    const expect = runView(view, dataOf(dataset));
    if (expect.reason !== reason)
      throw new Error(
        `${name}: expected ${reason}, the checker said ${JSON.stringify(expect)}`,
      );
    out.push({ name, base, note, view, dataset, expect });
  };
  const lanes = (...charts: Obj[]): Obj => ({
    view: "calendar",
    lanes: charts.map((chart, i) => ({ id: `lane_${String(i + 1)}`, chart })),
  });
  const laneOf = (view: Obj, i: number): Obj => (view.lanes as Obj[])[i]!;
  const columnOf = (view: Obj, i: number): Obj => (view.columns as Obj[])[i]!;

  // ---- Positives -------------------------------------------------------
  pos(
    "pos-calendar",
    "A calendar of three lanes: cases, the day's judgment, adjudications.",
    specs.calendar,
  );
  pos(
    "pos-calendar-one-lane",
    "A calendar of one keyless lane.",
    lanes(c.perDay(CASE_TYPE)),
  );
  pos(
    "pos-calendar-cells",
    "A calendar whose lanes carry roles and classes.",
    specs.cells,
  );
  pos(
    "pos-by-period",
    "A by-period table: not met, out of scope and not yet in force over the requirements.",
    specs.byPeriod,
  );
  pos(
    "pos-by-period-bar-keyed",
    "The same rows keyed by a color channel on a bar, not y on a rect.",
    {
      view: "by-period",
      count: { id: "not_met", chart: c.byVerdictBar("not_met") },
      columns: [],
    },
  );
  pos(
    "pos-timeline",
    "A timeline of a tick lane and a diamond lane.",
    specs.timeline,
  );
  pos(
    "pos-co-failure",
    "A co-failure matrix over the sessions failing each requirement.",
    specs.coFailure,
  );

  // ---- Negatives -------------------------------------------------------
  const calendar = specs.calendar;
  neg(
    "neg-member-extra",
    "pos-calendar",
    "A member outside the accepted subset.",
    "view-unsupported-member",
    { ...clone(calendar), title: "x" },
  );
  const badId = clone(calendar);
  laneOf(badId, 0).id = "Activity";
  neg(
    "neg-lane-id-not-code",
    "pos-calendar",
    "A lane id that is not a lowercase code.",
    "view-unsupported-member",
    badId,
  );
  const twice = clone(calendar);
  laneOf(twice, 1).id = "activity";
  neg(
    "neg-lane-id-repeated",
    "pos-calendar",
    "Two lanes with one id.",
    "view-unsupported-member",
    twice,
  );
  neg(
    "neg-no-lanes",
    "pos-calendar",
    "A calendar with no lanes.",
    "view-unsupported-member",
    { ...clone(calendar), lanes: [] },
  );
  neg(
    "neg-unknown-view",
    "pos-calendar",
    "A view kind the viewer does not draw.",
    "view-unsupported-member",
    { view: "grid" },
  );
  neg(
    "neg-chart-month-unit",
    "pos-calendar-one-lane",
    "A lane whose x is a month, not a day.",
    "view-chart-shape",
    lanes(c.perMonth(CASE_TYPE)),
  );
  neg(
    "neg-chart-sum",
    "pos-calendar-one-lane",
    "A lane that sums a field, not counts.",
    "view-chart-shape",
    lanes(c.sumPerDay(CASE_TYPE, "weight")),
  );
  const keyless = clone(specs.byPeriod);
  columnOf(keyless, 0).chart = c.perDay(CASE_TYPE);
  neg(
    "neg-by-period-keyless-column",
    "pos-by-period",
    "A by-period column with no key channel.",
    "view-chart-shape",
    keyless,
  );
  const other = clone(specs.byPeriod);
  columnOf(other, 0).chart = c.byVerdict("out_of_scope", "verdict");
  neg(
    "neg-by-period-different-fields",
    "pos-by-period",
    "A by-period column that groups by another field.",
    "view-chart-shape",
    other,
  );
  const mixedEntry = clone(specs.byPeriod);
  const cm = viewCharts(mixed);
  (mixedEntry.count as Obj).chart = cm.byVerdict("not_met");
  columnOf(mixedEntry, 0).chart = cm.byVerdict("out_of_scope");
  (mixedEntry.columns as Obj[]).pop();
  neg(
    "neg-by-period-mixed-types",
    "pos-by-period",
    "Requirement values of more than one type, over a book with a numeric requirement.",
    "view-chart-shape",
    mixedEntry,
    "view-book-mixed-requirement-types",
  );
  const missing = clone(calendar);
  ((laneOf(missing, 1).chart as Obj).encoding as { y: Obj }).y.field =
    "statement.missing";
  neg(
    "neg-chart-field-missing",
    "pos-calendar",
    "A lane whose chart reads a field the dataset lacks: the chart's own reason, the entry's pointer.",
    "chart-field-missing",
    missing,
  );
  const lying = clone(calendar);
  const capsule = ((laneOf(lying, 0).chart as Obj).usermeta as { capsule: Obj })
    .capsule;
  capsule.values = (capsule.values as Obj[]).map((v) =>
    v.not_run === true ? { x: v.x, y: 0 } : v,
  );
  neg(
    "neg-not-run-day-stated-as-zero",
    "pos-calendar",
    "A day nothing ran, stated as 0.",
    "chart-aggregate-mismatch",
    lying,
  );
  const narrow = { from: "2026-09-02", to: "2026-09-30" };
  neg(
    "neg-window-not-months",
    "pos-calendar-one-lane",
    "A calendar over a book whose sealed window starts on the 2nd.",
    "view-window-not-months",
    lanes(viewCharts(headers, { window: narrow }).perDay(CASE_TYPE)),
    "view-book-window-from-the-2nd",
  );
  neg(
    "neg-plan-without-window",
    "pos-calendar-one-lane",
    "A plan with no window node cannot say a day did not run.",
    "view-runs-unsealed",
    lanes(viewCharts(headers, { runs: null }).perDay(CASE_TYPE)),
    "view-book-no-window",
  );
  const asRuns = viewCharts(headers, {
    runs: {
      filter: { field: "record_type", equal: CASE_TYPE },
      field: "event_time_claim",
    },
    runType: CASE_TYPE,
  });
  neg(
    "neg-lanes-disagree-on-days-run",
    "pos-calendar-one-lane",
    "Two lanes that name different run records.",
    "view-runs-mismatch",
    lanes(c.perDay(CASE_TYPE), asRuns.perDay(CASE_TYPE)),
  );
  const wide = clone(specs.byPeriod);
  columnOf(wide, 0).chart = c.byVerdict("not_met");
  neg(
    "neg-by-period-overlap",
    "pos-by-period",
    "A column that selects the not_met rows the count chart already counts.",
    "view-overlap",
    wide,
  );

  const cells = specs.cells;
  const roleTwice = clone(cells);
  laneOf(roleTwice, 1).role = "activity";
  neg(
    "neg-role-on-two-lanes",
    "pos-calendar-cells",
    "One role on two lanes.",
    "view-lane-role",
    roleTwice,
  );
  const unclassed = clone(cells);
  delete (laneOf(unclassed, 1).classes as Obj).not_yet_in_force;
  neg(
    "neg-value-with-no-class",
    "pos-calendar-cells",
    "A value of a keyed lane with no class.",
    "view-lane-role",
    unclassed,
  );
  const keylessClasses = clone(cells);
  laneOf(keylessClasses, 0).classes = { x: "good" };
  neg(
    "neg-classes-on-keyless-lane",
    "pos-calendar-cells",
    "Classes on a lane with no key channel.",
    "view-lane-role",
    keylessClasses,
  );
  const bare = clone(cells);
  delete laneOf(bare, 1).classes;
  neg(
    "neg-judgment-lane-without-classes",
    "pos-calendar-cells",
    "A judgment lane with no classes.",
    "view-lane-role",
    bare,
  );
  const badRole = clone(cells);
  laneOf(badRole, 0).role = "headline";
  neg(
    "neg-role-unknown",
    "pos-calendar-cells",
    "A role the viewer does not draw.",
    "view-unsupported-member",
    badRole,
  );
  const badClass = clone(cells);
  (laneOf(badClass, 1).classes as Obj).met = "great";
  neg(
    "neg-class-unknown",
    "pos-calendar-cells",
    "A class the viewer does not draw.",
    "view-unsupported-member",
    badClass,
  );

  const timeline = specs.timeline;
  const tlKeyless = clone(timeline);
  laneOf(tlKeyless, 0).chart = c.perDay(CASE_TYPE);
  neg(
    "neg-timeline-classes-on-keyless-lane",
    "pos-timeline",
    "A timeline lane with classes but no key channel.",
    "view-lane-role",
    tlKeyless,
  );
  const tlMark = clone(timeline);
  laneOf(tlMark, 0).mark = "bar";
  neg(
    "neg-timeline-mark-unknown",
    "pos-timeline",
    "A mark the timeline does not draw.",
    "view-unsupported-member",
    tlMark,
  );
  const tlUnclassed = clone(timeline);
  delete (laneOf(tlUnclassed, 1).classes as Obj).overturned;
  neg(
    "neg-timeline-value-with-no-class",
    "pos-timeline",
    "A timeline value with no class.",
    "view-lane-role",
    tlUnclassed,
  );

  const lacking = clone(specs.coFailure);
  lacking.subject = "statement.conversation";
  neg(
    "neg-co-failure-subject-missing",
    "pos-co-failure",
    "A subject field the rows lack.",
    "view-chart-shape",
    lacking,
  );
  const badSubject = clone(specs.coFailure);
  badSubject.subject = "not a path";
  neg(
    "neg-co-failure-subject-not-a-path",
    "pos-co-failure",
    "A subject that is not a field path.",
    "view-unsupported-member",
    badSubject,
  );
  neg(
    "neg-view-not-an-object",
    "pos-calendar",
    "A view that is not an object.",
    "view-unsupported-member",
    [] as unknown as Obj,
  );
  const entryNotObject = clone(calendar);
  (entryNotObject.lanes as unknown[])[0] = "activity";
  neg(
    "neg-lane-not-an-object",
    "pos-calendar",
    "A lane that is not an object.",
    "view-unsupported-member",
    entryNotObject,
  );
  const noChart = clone(calendar);
  delete laneOf(noChart, 0).chart;
  neg(
    "neg-lane-chart-missing",
    "pos-calendar",
    "A lane with no chart.",
    "view-unsupported-member",
    noChart,
  );
  const emptyClasses = clone(cells);
  laneOf(emptyClasses, 1).classes = {};
  neg(
    "neg-classes-empty",
    "pos-calendar-cells",
    "Classes that name no value.",
    "view-unsupported-member",
    emptyClasses,
  );
  const columnsNotList = clone(specs.byPeriod);
  columnsNotList.columns = {};
  neg(
    "neg-by-period-columns-not-a-list",
    "pos-by-period",
    "Columns that are not a list.",
    "view-unsupported-member",
    columnsNotList,
  );
  const noSubject = clone(specs.coFailure);
  delete noSubject.subject;
  neg(
    "neg-co-failure-subject-missing-member",
    "pos-co-failure",
    "A co-failure view with no subject.",
    "view-unsupported-member",
    noSubject,
  );
  const keyedActivity = clone(cells);
  laneOf(keyedActivity, 0).chart = c.keyedPerDay(CASE_TYPE, "verdict");
  neg(
    "neg-activity-lane-keyed",
    "pos-calendar-cells",
    "An activity lane with a key channel.",
    "view-lane-role",
    keyedActivity,
  );
  const unclassedRulings = clone(cells);
  delete laneOf(unclassedRulings, 2).classes;
  neg(
    "neg-keyed-adjudication-lane-without-classes",
    "pos-calendar-cells",
    "A keyed adjudication lane with no classes.",
    "view-lane-role",
    unclassedRulings,
  );
  neg(
    "neg-no-dataset",
    "pos-calendar",
    "The Result names no dataset.",
    "chart-no-dataset",
    clone(calendar),
    null,
  );
  return { cases: out, datasets };
}
