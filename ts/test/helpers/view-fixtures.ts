// SPDX-License-Identifier: BSD-3-Clause
// The book and the view entries the calendar and by-period goldens draw
// (capsule-viewer#120; docs/design/report-views.md section 5), from literal
// objects: a pure function of this file. September 2026, UTC. A daily run
// record on 26 of 30 days: not run on the 10th (a Thursday) and on the 28th
// to the 30th (Monday to Wednesday, the month's last, partial week). Cases
// carry a requirement and a verdict, among them out_of_scope and
// not_yet_in_force; adjudications fall on some days. A case on the 10th and
// an adjudication on the 30th sit on days that did not run.
import {
  BOOK_ID,
  CASE_TYPE,
  RUN_TYPE,
  RUNS,
  WINDOW,
  dateTime,
  isType,
  spec,
  windowFilter,
} from "./chart-fixtures.js";
import { COUNT_Y, DAY_X, oracle, type OracleChannel } from "./chart-vectors.js";

type Obj = Record<string, unknown>;

export const ADJUDICATION_TYPE = "adjudication";
export const VIEW_RECORD_TYPES = [RUN_TYPE, CASE_TYPE, ADJUDICATION_TYPE];
export const VIEW_NOT_RUN_DAYS = [
  "2026-09-10",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
] as const;
const REQUIREMENTS = ["req-a", "req-b", "req-c"] as const;
const day = (d: number): string => `2026-09-${String(d).padStart(2, "0")}`;

export function viewHeaders(): Obj[] {
  const out: Obj[] = [];
  const push = (h: Obj): void => {
    out.push({
      v: 1,
      book_id: BOOK_ID,
      seq: out.length + 1,
      epistemic_type: "producer_claim",
      committed_at: `2026-10-01T00:00:${String(out.length % 60).padStart(2, "0")}Z`,
      ...h,
    });
  };
  for (let d = 1; d <= 30; d++) {
    const date = day(d);
    const ran = !(VIEW_NOT_RUN_DAYS as readonly string[]).includes(date);
    if (ran)
      push({
        record_type: RUN_TYPE,
        event_time_claim: `${date}T12:00:00Z`,
        statement: {
          generated_at: `${date}T23:30:00Z`,
          judgment: d % 5 === 0 ? "not_met" : "met",
        },
      });
    const verdict =
      d % 7 === 0
        ? "out_of_scope"
        : d % 11 === 0
          ? "not_yet_in_force"
          : d % 2 === 0
            ? "not_met"
            : "met";
    // The 29th has no case (a not-run day with none); the 10th keeps its case.
    if (d !== 29)
      push({
        record_type: CASE_TYPE,
        event_time_claim: `${date}T09:15:00Z`,
        statement: { requirement: REQUIREMENTS[d % 3], verdict, weight: d },
      });
    if (d % 4 === 0 && ran)
      push({
        record_type: CASE_TYPE,
        event_time_claim: `${date}T10:15:00Z`,
        statement: { requirement: "req-a", verdict: "not_met", weight: d },
      });
    if (d % 6 === 0)
      push({
        record_type: ADJUDICATION_TYPE,
        event_time_claim: `${date}T14:00:00Z`,
        statement: { ruling: "upheld" },
      });
  }
  return out;
}

export interface ViewOptions {
  /** The chart windows; default the whole month. */
  readonly window?: { readonly from: string; readonly to: string };
  /** The run records the charts state; `null` states none. */
  readonly runs?: Obj | null;
  /** The record type the oracle reads as a run. */
  readonly runType?: string;
}

const DAY: OracleChannel = {
  name: "x",
  field: "event_time_claim",
  unit: "day",
};
const MONTH: OracleChannel = { ...DAY, unit: "month" };

const verdictIs = (verdict: string): Obj => ({
  filter: { field: "statement.verdict", equal: verdict },
});

/** Chart specs over the view book, each with the values the plain oracle computes. */
export function viewCharts(
  headers: readonly Obj[] = viewHeaders(),
  options: ViewOptions = {},
) {
  const window = options.window ?? WINDOW;
  const stated = { field: "event_time_claim", ...window };
  const runs = options.runs === undefined ? RUNS : options.runs;
  const runType = options.runType ?? RUN_TYPE;
  const days = { ...window, runs: runs !== null };
  const rows = headers.map((header) => ({ header }));
  const n = (keep: (h: Obj) => boolean): number => headers.filter(keep).length;
  const of = (type: string) => (h: Obj) => h.record_type === type;
  const inWindow = (h: Obj): boolean => {
    const d = new Date(Date.parse(h.event_time_claim as string))
      .toISOString()
      .slice(0, 10);
    return d >= window.from && d <= window.to;
  };
  const make = (
    mark: string,
    type: string,
    kept: (h: Obj) => boolean,
    encoding: Obj,
    keys: OracleChannel[],
    agg: { name: string; sum?: string },
    extra: Obj[] = [],
  ): Obj => {
    const keep = (h: Obj): boolean => kept(h) && inWindow(h);
    return spec({
      mark,
      transform: [windowFilter(window.from, window.to), isType(type), ...extra],
      encoding,
      capsule: {
        population: { count: n(keep) },
        window: stated,
        ...(runs === null ? {} : { runs }),
        values: oracle(rows, keep, keys, agg, days, runType),
      },
    });
  };
  return {
    perDay: (type: string): Obj =>
      make("bar", type, of(type), { x: DAY_X, y: COUNT_Y }, [DAY], {
        name: "y",
      }),
    sumPerDay: (type: string, field: string): Obj =>
      make(
        "bar",
        type,
        of(type),
        {
          x: DAY_X,
          y: {
            field: `statement.${field}`,
            aggregate: "sum",
            type: "quantitative",
          },
        },
        [DAY],
        { name: "y", sum: `statement.${field}` },
      ),
    perMonth: (type: string): Obj =>
      make(
        "bar",
        type,
        of(type),
        { x: { ...DAY_X, timeUnit: "utcyearmonth" }, y: COUNT_Y },
        [MONTH],
        { name: "y" },
      ),
    judgment: (): Obj =>
      make(
        "rect",
        RUN_TYPE,
        of(RUN_TYPE),
        {
          x: DAY_X,
          y: { field: "statement.judgment", type: "nominal" },
          color: COUNT_Y,
        },
        [DAY, { name: "y", field: "statement.judgment" }],
        { name: "color" },
      ),
    byVerdict: (verdict: string, field = "requirement"): Obj =>
      make(
        "rect",
        CASE_TYPE,
        (h) =>
          h.record_type === CASE_TYPE &&
          (h.statement as Obj).verdict === verdict,
        {
          x: DAY_X,
          y: { field: `statement.${field}`, type: "nominal" },
          color: COUNT_Y,
        },
        [DAY, { name: "y", field: `statement.${field}` }],
        { name: "color" },
        [verdictIs(verdict)],
      ),
  };
}

/** The calendar and by-period entries, as a pack's compiler would emit them. */
export function viewSpecs(headers: readonly Obj[] = viewHeaders()): {
  calendar: Obj;
  byPeriod: Obj;
} {
  const c = viewCharts(headers);
  return {
    calendar: {
      view: "calendar",
      lanes: [
        { id: "activity", chart: c.perDay(CASE_TYPE) },
        { id: "judgment", chart: c.judgment() },
        { id: "adjudications", chart: c.perDay(ADJUDICATION_TYPE) },
      ],
    },
    byPeriod: {
      view: "by-period",
      count: { id: "not_met", chart: c.byVerdict("not_met") },
      columns: [
        { id: "out_of_scope", chart: c.byVerdict("out_of_scope") },
        { id: "not_yet_in_force", chart: c.byVerdict("not_yet_in_force") },
      ],
    },
  };
}

export { dateTime };
