// SPDX-License-Identifier: BSD-3-Clause
// The chart-spec vector corpus (vectors/chart-spec/cases.json), generated
// from chart-fixtures.ts. Each positive's stated values come from the small
// oracle below, which is written apart from the checker; each negative names
// the positive it changes in one way (`base`), and the test checks that the
// base passes.
import {
  bookHeaders,
  CASE_TYPE,
  datasetOf,
  datasetPlan,
  dateTime,
  isType,
  RUN_TYPE,
  RUNS,
  spec,
  WINDOW,
  windowFilter,
  type WindowParams,
} from "./chart-fixtures.js";

type Obj = Record<string, unknown>;
type Scalar = string | number | boolean;

export interface ChartVector {
  readonly name: string;
  readonly base?: string;
  readonly note: string;
  readonly spec: Obj;
  /** The name of a dataset in datasets.json, or null for a Result that names none. */
  readonly dataset: string | null;
  readonly expect:
    | { readonly valid: true; readonly values: readonly Obj[] }
    | { readonly reason: string };
}

const utcDay = (value: unknown): string =>
  new Date(Date.parse(value as string)).toISOString().slice(0, 10);

const get = (h: Obj, path: string): unknown =>
  path.split(".").reduce<unknown>((at, k) => (at as Obj | undefined)?.[k], h);

interface OracleChannel {
  readonly name: "x" | "y" | "color";
  readonly field: string;
  readonly unit?: "day" | "month";
}

/** The values a chart states, computed the plain way for the fixtures. */
function oracle(
  rows: readonly Obj[],
  keep: (h: Obj) => boolean,
  keys: readonly OracleChannel[],
  agg: { readonly name: string; readonly sum?: string },
  days?: { readonly from: string; readonly to: string; readonly runs: boolean },
): Obj[] {
  const headers = rows.map((r) => r.header as Obj).filter(keep);
  const val = (h: Obj, c: OracleChannel): Scalar => {
    const v = get(h, c.field) as Scalar;
    if (c.unit === undefined) return v;
    const d = utcDay(v);
    return c.unit === "month" ? `${d.slice(0, 8)}01` : d;
  };
  const units: string[] = [];
  if (days !== undefined)
    for (
      let t = Date.parse(`${days.from}T00:00:00Z`);
      t <= Date.parse(`${days.to}T00:00:00Z`);
      t += 86400000
    ) {
      const d = new Date(t).toISOString().slice(0, 10);
      const unit =
        keys.find((k) => k.unit !== undefined)!.unit === "month"
          ? `${d.slice(0, 8)}01`
          : d;
      if (!units.includes(unit)) units.push(unit);
    }
  const ran = new Set(
    rows
      .map((r) => r.header as Obj)
      .filter((h) => h.record_type === RUN_TYPE)
      .map((h) => {
        const d = utcDay(h.event_time_claim);
        return keys.find((k) => k.unit !== undefined)?.unit === "month"
          ? `${d.slice(0, 8)}01`
          : d;
      }),
  );
  const domain = (c: OracleChannel): Scalar[] =>
    c.unit !== undefined
      ? units
      : [...new Set(headers.map((h) => val(h, c)))].sort((a, b) =>
          typeof a === "number"
            ? a - (b as number)
            : String(a) < String(b)
              ? -1
              : 1,
        );
  const out: Obj[] = [];
  const walk = (i: number, key: Obj): void => {
    if (i === keys.length) {
      const unitKey = keys.find((k) => k.unit !== undefined);
      if (
        days?.runs === true &&
        unitKey !== undefined &&
        !ran.has(key[unitKey.name] as string)
      ) {
        out.push({ ...key, not_run: true });
        return;
      }
      const hit = headers.filter((h) =>
        keys.every((k) => val(h, k) === key[k.name]),
      );
      out.push({
        ...key,
        [agg.name]:
          agg.sum === undefined
            ? hit.length
            : hit.reduce((s, h) => s + (get(h, agg.sum!) as number), 0),
      });
      return;
    }
    for (const v of domain(keys[i]!))
      walk(i + 1, { ...key, [keys[i]!.name]: v });
  };
  walk(0, {});
  return out;
}

const isCase = (h: Obj): boolean => h.record_type === CASE_TYPE;
const DAY_X = {
  field: "event_time_claim",
  type: "temporal",
  timeUnit: "utcyearmonthdate",
};
const COUNT_Y = { aggregate: "count", type: "quantitative" };
const WINDOW_STATED = { field: "event_time_claim", ...WINDOW };

export interface VectorDataset {
  readonly plan: Obj;
  readonly rows: readonly Obj[];
}

/** Every vector, positives first, and the datasets they name. */
export async function chartVectors(): Promise<{
  cases: ChartVector[];
  datasets: Record<string, VectorDataset>;
}> {
  const datasets: Record<string, VectorDataset> = {};
  const headers = bookHeaders();
  const through = headers.length;
  const plan = datasetPlan(through);
  const { rows } = await datasetOf(plan, headers);
  datasets.book = { plan, rows };
  const dataset = "book";
  const caseCount = rows.filter((r) => isCase(r.header as Obj)).length;
  const casesByDay = oracle(
    rows,
    isCase,
    [{ name: "x", field: "event_time_claim", unit: "day" }],
    { name: "y" },
    { ...WINDOW, runs: true },
  );

  const casesByDaySpec = (
    mark: unknown,
    values: Obj[] = casesByDay,
    capsule: Obj = {},
  ): Obj =>
    spec({
      mark,
      transform: [windowFilter(), isType(CASE_TYPE)],
      encoding: { x: DAY_X, y: COUNT_Y },
      capsule: {
        population: { count: caseCount },
        window: WINDOW_STATED,
        runs: RUNS,
        values,
        ...capsule,
      },
    });

  const out: ChartVector[] = [];
  const pos = (name: string, note: string, s: Obj, d = dataset): void => {
    out.push({
      name,
      note,
      spec: s,
      dataset: d,
      expect: {
        valid: true,
        values: (s.usermeta as Obj as { capsule: Obj }).capsule.values as Obj[],
      },
    });
  };

  // ---- Positives -------------------------------------------------------
  pos(
    "pos-bar-cases-by-day",
    "Cases by day over 30 days with daily Results on 28: 28 values, one of them 0 (ZERO_DAY), and 2 not run. The first case is at the window's first instant and the last at its last second; one case is written at +05:00 and falls on its UTC day.",
    casesByDaySpec("bar"),
  );
  pos(
    "pos-line-cases-by-day",
    "The same chart as a line, with the mark as an object.",
    casesByDaySpec({ type: "line" }),
  );
  const scoreByDay = oracle(
    rows,
    isCase,
    [{ name: "x", field: "event_time_claim", unit: "day" }],
    { name: "y", sum: "statement.score" },
    { ...WINDOW, runs: true },
  );
  pos(
    "pos-point-sum-by-day",
    "The sum of a case field by day.",
    spec({
      mark: "point",
      transform: [windowFilter(), isType(CASE_TYPE)],
      encoding: {
        x: DAY_X,
        y: { field: "statement.score", aggregate: "sum", type: "quantitative" },
      },
      capsule: {
        population: { count: caseCount },
        window: WINDOW_STATED,
        runs: RUNS,
        values: scoreByDay,
      },
    }),
  );
  const keysXY = [
    { name: "x" as const, field: "event_time_claim", unit: "day" as const },
    { name: "y" as const, field: "statement.outcome" },
  ];
  const rectValues = oracle(
    rows,
    isCase,
    keysXY,
    { name: "color" },
    { ...WINDOW, runs: true },
  );
  pos(
    "pos-rect-outcome-by-day",
    "A rect: two cells at the same x and different y are two groups; a run day with no case of one outcome lists it as 0, and a not-run day lists every outcome as not run.",
    spec({
      mark: "rect",
      transform: [windowFilter(), isType(CASE_TYPE)],
      encoding: {
        x: DAY_X,
        y: { field: "statement.outcome", type: "nominal" },
        color: COUNT_Y,
      },
      capsule: {
        population: { count: caseCount },
        window: WINDOW_STATED,
        runs: RUNS,
        values: rectValues,
      },
    }),
  );
  const seriesValues = oracle(
    rows,
    isCase,
    [
      { name: "x", field: "event_time_claim", unit: "day" },
      { name: "color", field: "statement.outcome" },
    ],
    { name: "y" },
    { ...WINDOW, runs: true },
  );
  pos(
    "pos-bar-color-series",
    "A color series: a key with no rows on a run day is listed as 0.",
    spec({
      mark: "bar",
      transform: [windowFilter(), isType(CASE_TYPE)],
      encoding: {
        x: DAY_X,
        y: COUNT_Y,
        color: { field: "statement.outcome", type: "nominal" },
      },
      capsule: {
        population: { count: caseCount },
        window: WINDOW_STATED,
        runs: RUNS,
        values: seriesValues,
      },
    }),
  );
  const byOutcome = oracle(
    rows,
    isCase,
    [{ name: "x", field: "statement.outcome" }],
    { name: "y" },
  );
  pos(
    "pos-bar-by-outcome",
    "Two categories and no time axis: a comparison, which carries the derived label like every chart.",
    spec({
      mark: "bar",
      transform: [isType(CASE_TYPE)],
      encoding: {
        x: { field: "statement.outcome", type: "nominal", title: "ignored" },
        y: COUNT_Y,
      },
      capsule: { population: { count: caseCount }, values: byOutcome },
    }),
  );
  pos(
    "pos-bar-month",
    "One utcyearmonth unit over a whole-month window: run, since daily Results fall in it.",
    spec({
      mark: "bar",
      transform: [windowFilter(), isType(CASE_TYPE)],
      encoding: { x: { ...DAY_X, timeUnit: "utcyearmonth" }, y: COUNT_Y },
      capsule: {
        population: { count: caseCount },
        window: WINDOW_STATED,
        runs: RUNS,
        values: [{ x: "2026-09-01", y: caseCount }],
      },
    }),
  );
  const withNotRunCase = bookHeaders([
    {
      record_type: CASE_TYPE,
      event_time_claim: "2026-09-10T08:00:00Z",
      statement: {
        task_id: "late",
        outcome: "pass",
        score: 1,
        decided_at: "2026-09-10T09:00:00Z",
      },
    },
  ]);
  const planNR = datasetPlan(withNotRunCase.length);
  const dsNR = await datasetOf(planNR, withNotRunCase);
  pos(
    "pos-case-on-a-not-run-day",
    "A case dated on a day with no daily Result: the day is not run (spec §5.1) and draws no value; the case stays in the population.",
    spec({
      mark: "bar",
      transform: [windowFilter(), isType(CASE_TYPE)],
      encoding: { x: DAY_X, y: COUNT_Y },
      capsule: {
        population: { count: caseCount + 1 },
        window: WINDOW_STATED,
        runs: RUNS,
        values: casesByDay,
      },
    }),
    ((datasets["book-with-a-case-on-a-not-run-day"] = {
      plan: planNR,
      rows: dsNR.rows,
    }),
    "book-with-a-case-on-a-not-run-day"),
  );
  // A plan with no window node, and one with two: no "not run" at all.
  const planNoWindow = datasetPlan(through, []);
  const dsNoWindow = await datasetOf(planNoWindow, headers);
  const zeroCases = oracle(
    dsNoWindow.rows,
    isCase,
    [{ name: "x", field: "event_time_claim", unit: "day" }],
    { name: "y" },
    { ...WINDOW, runs: false },
  );
  const noRunsSpec = (
    values: Obj[],
    from: string = WINDOW.from,
    to: string = WINDOW.to,
  ): Obj =>
    spec({
      mark: "bar",
      transform: [windowFilter(from, to), isType(CASE_TYPE)],
      encoding: { x: DAY_X, y: COUNT_Y },
      capsule: {
        population: {
          count: values.reduce(
            (s, v) => s + ((v.y as number | undefined) ?? 0),
            0,
          ),
        },
        window: { ...WINDOW_STATED, from, to },
        values,
      },
    });
  pos(
    "pos-plan-without-window",
    'A plan with no window node: no day reads "not run"; a day without a row reads 0, the 2 days with no daily Result included.',
    noRunsSpec(zeroCases),
    ((datasets["plan-without-window"] = {
      plan: planNoWindow,
      rows: dsNoWindow.rows,
    }),
    "plan-without-window"),
  );
  const twoWindows: WindowParams[] = [
    { field: "event_time_claim", ...WINDOW },
    { field: "event_time_claim", from: "2026-09-05", to: WINDOW.to },
  ];
  const planTwo = datasetPlan(through, twoWindows);
  const dsTwo = await datasetOf(planTwo, headers);
  const twoValues = oracle(
    dsTwo.rows,
    isCase,
    [{ name: "x", field: "event_time_claim", unit: "day" }],
    { name: "y" },
    { from: "2026-09-05", to: WINDOW.to, runs: false },
  );
  pos(
    "pos-plan-with-two-windows",
    'A plan with two window nodes: no day reads "not run", and the chart\'s window lies inside both.',
    noRunsSpec(twoValues, "2026-09-05"),
    ((datasets["plan-with-two-windows"] = { plan: planTwo, rows: dsTwo.rows }),
    "plan-with-two-windows"),
  );

  const lastMonth = Array.from({ length: 31 }, (_, i) => ({
    x: `9999-12-${String(i + 1).padStart(2, "0")}`,
    y: 0,
  }));
  pos(
    "pos-window-ends-9999-12-31",
    "A window that ends on the last day a date can name: every unit is listed, and the walk over the days stops there.",
    noRunsSpec(lastMonth, "9999-12-01", "9999-12-31"),
    "plan-without-window",
  );
  // ---- Negatives -------------------------------------------------------
  const byName = new Map(out.map((v) => [v.name, v]));
  const neg = (
    name: string,
    base: string,
    note: string,
    reason: string,
    change: (s: Obj) => Obj,
    d?: ChartVector["dataset"],
  ): void => {
    const b = byName.get(base)!;
    out.push({
      name,
      base,
      note,
      spec: change(structuredClone(b.spec)),
      dataset: d === undefined ? b.dataset : d,
      expect: { reason },
    });
  };
  const capsuleOf = (s: Obj): Obj => (s.usermeta as Obj).capsule as Obj;
  const enc = (s: Obj): Obj => s.encoding as Obj;

  neg(
    "neg-transform-expr",
    "pos-bar-cases-by-day",
    "A filter given as an expression string.",
    "chart-unsupported-member",
    (s) => {
      (s.transform as unknown[]).push({ filter: "datum.statement.score > 3" });
      return s;
    },
  );
  neg(
    "neg-data-url",
    "pos-bar-cases-by-day",
    "Data from a URL.",
    "chart-unsupported-member",
    (s) => ({ ...s, data: { url: "https://example.org/rows.json" } }),
  );
  neg(
    "neg-params",
    "pos-bar-cases-by-day",
    "A selection parameter.",
    "chart-unsupported-member",
    (s) => ({ ...s, params: [{ name: "pick", select: "point" }] }),
  );
  neg(
    "neg-calculate",
    "pos-bar-cases-by-day",
    "A calculate transform.",
    "chart-unsupported-member",
    (s) => {
      (s.transform as unknown[]).push({
        calculate: "datum.statement.score * 2",
        as: "double",
      });
      return s;
    },
  );
  neg(
    "neg-local-time-unit",
    "pos-bar-cases-by-day",
    "A local (non-UTC) time unit.",
    "chart-unsupported-member",
    (s) => {
      (enc(s).x as Obj).timeUnit = "yearmonthdate";
      return s;
    },
  );
  neg(
    "neg-week-unit",
    "pos-bar-cases-by-day",
    "A week unit.",
    "chart-unsupported-member",
    (s) => {
      (enc(s).x as Obj).timeUnit = "utcyearweek";
      return s;
    },
  );
  neg(
    "neg-mean",
    "pos-point-sum-by-day",
    "An aggregate outside count and sum.",
    "chart-unsupported-member",
    (s) => {
      (enc(s).y as Obj).aggregate = "mean";
      return s;
    },
  );
  neg(
    "neg-tooltip",
    "pos-bar-cases-by-day",
    "A tooltip channel.",
    "chart-unsupported-member",
    (s) => {
      enc(s).tooltip = { field: "statement.task_id", type: "nominal" };
      return s;
    },
  );
  neg(
    "neg-fraction-in-filter",
    "pos-bar-cases-by-day",
    "A fraction in a filter: a spec holds integers only (JCS has no form for a fraction, and no header holds one).",
    "chart-unsupported-member",
    (s) => {
      (s.transform as unknown[]).push({
        filter: { field: "statement.score", equal: 1.5 },
      });
      return s;
    },
  );
  neg(
    "neg-unsafe-integer-in-values",
    "pos-bar-by-outcome",
    "An integer beyond 2^53 in a stated value.",
    "chart-unsupported-member",
    (s) => {
      (capsuleOf(s).values as Obj[])[0]!.y = 2 ** 53;
      return s;
    },
  );
  neg(
    "neg-time-axis-not-x",
    "pos-rect-outcome-by-day",
    "A rect whose time axis is y: only x can be temporal, since not run is drawn as a column of x.",
    "chart-unsupported-member",
    (s) => {
      const e = enc(s);
      [e.x, e.y] = [e.y, e.x];
      return s;
    },
  );
  neg(
    "neg-quantitative-key",
    "pos-bar-by-outcome",
    "A quantitative x: keys are drawn in bands, so only the aggregate is quantitative.",
    "chart-unsupported-member",
    (s) => {
      enc(s).x = { field: "statement.score", type: "quantitative" };
      return s;
    },
  );
  neg(
    "neg-no-aggregate",
    "pos-bar-by-outcome",
    "No channel aggregates.",
    "chart-aggregate-shape",
    (s) => {
      enc(s).y = { field: "statement.score", type: "quantitative" };
      return s;
    },
  );
  neg(
    "neg-two-aggregates",
    "pos-bar-color-series",
    "Two channels aggregate.",
    "chart-aggregate-shape",
    (s) => {
      enc(s).color = COUNT_Y;
      return s;
    },
  );
  neg(
    "neg-case-field-without-type-filter",
    "pos-bar-by-outcome",
    "The case chart without its record-type filter: the daily Results have no statement.outcome (check 1 runs before the population).",
    "chart-field-missing",
    (s) => ({ ...s, transform: [] }),
  );
  neg(
    "neg-sum-of-string",
    "pos-point-sum-by-day",
    "A sum over a string field.",
    "chart-field-type",
    (s) => {
      (enc(s).y as Obj).field = "statement.outcome";
      return s;
    },
  );
  neg(
    "neg-range-field-without-offset",
    "pos-bar-cases-by-day",
    "A range filter on a field that is a timestamp with no offset.",
    "chart-field-type",
    (s) => {
      (s.transform as unknown[]).push({
        filter: {
          field: "statement.local_time",
          range: [dateTime("2026-09-01"), dateTime("2026-09-30")],
          timeUnit: "utcyearmonthdate",
        },
      });
      return s;
    },
  );
  neg(
    "neg-window-differs-from-seal",
    "pos-bar-cases-by-day",
    "The chart's window, restated in the transform, ends a day before the sealed window.",
    "chart-window-mismatch",
    (s) => {
      s.transform = [
        windowFilter(WINDOW.from, "2026-09-29"),
        isType(CASE_TYPE),
      ];
      capsuleOf(s).window = { ...WINDOW_STATED, to: "2026-09-29" };
      return s;
    },
  );
  neg(
    "neg-window-not-restated",
    "pos-bar-cases-by-day",
    "The statement's window differs from the transform's range filter.",
    "chart-window-mismatch",
    (s) => {
      s.transform = [windowFilter("2026-09-02"), isType(CASE_TYPE)];
      return s;
    },
  );
  neg(
    "neg-month-window-not-whole-months",
    "pos-plan-without-window",
    "A utcyearmonth chart whose window runs from 2026-09-02 to 2026-09-30.",
    "chart-window-mismatch",
    (s) => {
      s.transform = [windowFilter("2026-09-02"), isType(CASE_TYPE)];
      (enc(s).x as Obj).timeUnit = "utcyearmonth";
      capsuleOf(s).window = { ...WINDOW_STATED, from: "2026-09-02" };
      return s;
    },
  );
  neg(
    "neg-runs-missing",
    "pos-bar-cases-by-day",
    "A temporal chart over a one-window plan that names no run records.",
    "chart-runs-missing",
    (s) => {
      delete capsuleOf(s).runs;
      return s;
    },
  );
  neg(
    "neg-runs-field-differs-from-window",
    "pos-bar-cases-by-day",
    "Runs dated by statement.generated_at; the sealed window field is event_time_claim.",
    "chart-runs-field-mismatch",
    (s) => {
      capsuleOf(s).runs = { ...RUNS, field: "statement.generated_at" };
      return s;
    },
  );
  neg(
    "neg-runs-on-plan-without-window",
    "pos-plan-without-window",
    "Runs on a plan with no window node.",
    "chart-runs-unsealed",
    (s) => {
      capsuleOf(s).runs = RUNS;
      return s;
    },
  );
  neg(
    "neg-runs-on-plan-with-two-windows",
    "pos-plan-with-two-windows",
    "Runs on a plan with two window nodes.",
    "chart-runs-unsealed",
    (s) => {
      capsuleOf(s).runs = RUNS;
      return s;
    },
  );
  neg(
    "neg-population-counts-runs-too",
    "pos-bar-cases-by-day",
    "A count of cases by day with no record-type filter: the daily Results pass the transform too, and the stated count holds only the cases.",
    "chart-population-mismatch",
    (s) => {
      s.transform = [windowFilter()];
      return s;
    },
  );
  neg(
    "neg-population-off-by-one",
    "pos-bar-by-outcome",
    "The stated population is one short.",
    "chart-population-mismatch",
    (s) => {
      capsuleOf(s).population = { count: caseCount - 1 };
      return s;
    },
  );
  neg(
    "neg-not-run-stated-as-zero",
    "pos-bar-cases-by-day",
    "A not-run day stated as 0: the drawing the checker exists to refuse.",
    "chart-aggregate-mismatch",
    (s) => {
      capsuleOf(s).values = (capsuleOf(s).values as Obj[]).map((v) =>
        v.not_run === true ? { x: v.x, y: 0 } : v,
      );
      return s;
    },
  );
  neg(
    "neg-value-differs",
    "pos-bar-cases-by-day",
    "One stated value is one more than the data.",
    "chart-aggregate-mismatch",
    (s) => {
      const values = capsuleOf(s).values as Obj[];
      const at = values.findIndex(
        (v) => typeof v.y === "number" && (v.y as number) > 0,
      );
      values[at] = { ...values[at], y: (values[at]!.y as number) + 1 };
      return s;
    },
  );
  neg(
    "neg-group-listed-twice",
    "pos-bar-by-outcome",
    "A group listed twice in place of another, so the count of groups still matches.",
    "chart-aggregate-mismatch",
    (s) => {
      const values = capsuleOf(s).values as Obj[];
      values[1] = { ...values[0] };
      return s;
    },
  );
  neg(
    "neg-group-missing",
    "pos-bar-color-series",
    "A zero group left out of the stated values.",
    "chart-aggregate-mismatch",
    (s) => {
      const values = capsuleOf(s).values as Obj[];
      capsuleOf(s).values = values.filter(
        (v, i) => !(v.y === 0 && i === values.findIndex((w) => w.y === 0)),
      );
      return s;
    },
  );
  datasets["book-one-row-withheld"] = {
    plan,
    rows: rows.map((r, i) =>
      i === 3
        ? {
            seq: r.seq,
            record_type: r.record_type,
            digest_alg: r.digest_alg,
            digest: r.digest,
          }
        : r,
    ),
  };
  neg(
    "neg-row-withheld",
    "pos-bar-cases-by-day",
    "The bundle withholds one row's record from this audience.",
    "chart-row-withheld",
    (s) => s,
    "book-one-row-withheld",
  );
  neg(
    "neg-no-dataset",
    "pos-bar-cases-by-day",
    "The Result names no dataset.",
    "chart-no-dataset",
    (s) => s,
    null,
  );
  const badPlan = structuredClone(plan);
  delete ((badPlan.nodes as Obj[])[1] as Obj).params;
  datasets["plan-window-without-params"] = { plan: badPlan, rows };
  neg(
    "neg-plan-window-without-params",
    "pos-bar-cases-by-day",
    "The plan's window node carries no params.",
    "chart-dataset-invalid",
    (s) => s,
    "plan-window-without-params",
  );
  return { cases: out, datasets };
}
