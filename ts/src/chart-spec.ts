// SPDX-License-Identifier: BSD-3-Clause
import {
  isCalendarDate,
  utcDateOf,
} from "@action-state-group/agent-action-capsule";

/**
 * Charts from a checked spec (capsule-viewer#82; docs/design/chart-spec.md).
 *
 * A chart spec is a Vega-Lite v5 document in a closed subset. This module is
 * the data half: it reads a spec, checks it against the sealed dataset the
 * report's Result names (agent-action-capsule spec/evidence-plan-ir-v0.md
 * §5.1 and §6.2), and returns the groups the page draws, recomputed from the
 * rows. It touches no DOM. The Go twin (go/chartspec) runs the same vectors,
 * `vectors/chart-spec/`.
 */

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Why a chart was refused. Each has its own vector. */
export type ChartRefusalReason =
  | "chart-unsupported-member"
  | "chart-aggregate-shape"
  | "chart-no-dataset"
  | "chart-dataset-invalid"
  | "chart-row-withheld"
  | "chart-field-missing"
  | "chart-field-type"
  | "chart-window-mismatch"
  | "chart-runs-missing"
  | "chart-runs-field-mismatch"
  | "chart-runs-unsealed"
  | "chart-population-mismatch"
  | "chart-aggregate-mismatch"
  // A calendar or by-period view's own rules (report-view.ts).
  | "view-unsupported-member"
  | "view-chart-shape"
  | "view-runs-unsealed"
  | "view-runs-mismatch"
  | "view-window-not-months"
  | "view-overlap"
  | "view-lane-role";

/** A refused chart: its reason, the JSON pointer it names (if any) and why. */
export class ChartRefusal extends Error {
  readonly reason: ChartRefusalReason;
  readonly pointer: string | undefined;
  constructor(reason: ChartRefusalReason, message: string, pointer?: string) {
    super(`${reason}: ${message}`);
    this.name = "ChartRefusal";
    this.reason = reason;
    this.pointer = pointer;
  }
}

const refuse = (
  reason: ChartRefusalReason,
  message: string,
  pointer?: string,
): never => {
  throw new ChartRefusal(reason, message, pointer);
};

/**
 * One dataset row as the checker reads it: the row's own members and, when
 * the bundle discloses it, the record header the row's digest names.
 * `recordId` is the bundle record that carries the header, for the page's
 * links; the checker never reads it.
 */
export interface ChartRow {
  readonly seq: number;
  readonly recordType: string;
  readonly digest: string;
  readonly header?: Obj;
  readonly recordId?: string;
}

/** The sealed selection a chart is checked against: its plan and its rows, in `seq` order. */
export interface ChartDataset {
  readonly plan: Obj;
  readonly rows: readonly ChartRow[];
}

export type Scalar = string | number | boolean;
export type ChannelName = "x" | "y" | "color";
export type ChartMark = "bar" | "line" | "point" | "rect";
export type TimeUnit = "utcyearmonthdate" | "utcyearmonth";
type FieldType = "quantitative" | "ordinal" | "nominal" | "temporal";

export interface Channel {
  readonly field?: string;
  readonly type: FieldType;
  readonly aggregate?: "count" | "sum";
  readonly timeUnit?: TimeUnit;
}

export interface ChartWindow {
  readonly field: string;
  readonly from: string;
  readonly to: string;
}

/** One drawn group: its key, its value (absent when not run) and the rows it counts. */
export interface ChartGroup {
  readonly key: Readonly<Partial<Record<ChannelName, Scalar>>>;
  readonly value?: number;
  readonly notRun: boolean;
  readonly rows: readonly ChartRow[];
  /** On a temporal chart with `runs`: the run records dated in this group's unit. */
  readonly runRows: readonly ChartRow[];
}

export interface CheckedChart {
  readonly mark: ChartMark;
  readonly channels: Readonly<Partial<Record<ChannelName, Channel>>>;
  /** The channel that holds the number. */
  readonly aggregate: ChannelName;
  /** The key channels, in the order groups are sorted by. */
  readonly keys: readonly ChannelName[];
  readonly temporal?: ChannelName;
  readonly population: number;
  readonly window?: ChartWindow;
  /** True only when the chart can say "not run": a temporal chart with `runs` on a one-window plan. */
  readonly runs: boolean;
  /**
   * On a temporal chart, every unit of the window in order and whether it was
   * not run. A chart whose other key channel has no values after `transform`
   * has no groups, yet its units still say which days ran (report-view.ts).
   */
  readonly units?: readonly {
    readonly unit: string;
    readonly notRun: boolean;
  }[];
  readonly groups: readonly ChartGroup[];
}

const SCHEMA = "https://vega.github.io/schema/vega-lite/v5.json";
const MARKS: readonly ChartMark[] = ["bar", "line", "point", "rect"];
const TYPES: readonly FieldType[] = [
  "quantitative",
  "ordinal",
  "nominal",
  "temporal",
];
const UNITS: readonly TimeUnit[] = ["utcyearmonthdate", "utcyearmonth"];
const CHANNELS: readonly ChannelName[] = ["x", "y", "color"];
// The same grammar as agent-action-capsule's dataset plan field paths (§5.1).
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/u;

const pointerOf = (base: string, key: string | number): string =>
  `${base}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;

function onlyKeys(value: Obj, allowed: readonly string[], at: string): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      refuse(
        "chart-unsupported-member",
        `${pointerOf(at, key) || "/"} is not in the accepted subset`,
        pointerOf(at, key),
      );
}

function need<T>(ok: boolean, value: T, at: string, what: string): T {
  if (!ok)
    refuse("chart-unsupported-member", `${at || "/"} must be ${what}`, at);
  return value;
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

export type Predicate =
  | { readonly kind: "equal"; readonly field: string; readonly value: Scalar }
  | {
      readonly kind: "oneOf";
      readonly field: string;
      readonly values: readonly Scalar[];
    }
  | {
      readonly kind: "range";
      readonly field: string;
      readonly from: string;
      readonly to: string;
    }
  | { readonly kind: "and" | "or"; readonly items: readonly Predicate[] }
  | { readonly kind: "not"; readonly item: Predicate };

const isScalar = (value: unknown): value is Scalar =>
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));

function readField(value: unknown, at: string): string {
  return need(
    typeof value === "string" && FIELD_PATH.test(value),
    value as string,
    at,
    "a field path (name, dot-separated)",
  );
}

/** A Vega-Lite DateTime `{year, month, date, utc: true}` naming a real day, as `YYYY-MM-DD`. */
function readDay(value: unknown, at: string): string {
  if (isObj(value)) {
    onlyKeys(value, ["year", "month", "date", "utc"], at);
    const { year, month, date, utc } = value;
    if (
      utc === true &&
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(date)
    ) {
      const day = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
      if (
        (year as number) >= 1 &&
        (year as number) <= 9999 &&
        isCalendarDate(day)
      )
        return day;
    }
  }
  return refuse(
    "chart-unsupported-member",
    `${at} must be a UTC DateTime {year, month, date, utc: true} naming a real day`,
    at,
  );
}

export function readPredicate(value: unknown, at: string): Predicate {
  need(isObj(value), undefined, at, "a predicate object");
  const p = value as Obj;
  for (const kind of ["and", "or"] as const)
    if (Object.hasOwn(p, kind)) {
      onlyKeys(p, [kind], at);
      const items = p[kind];
      need(
        Array.isArray(items) && items.length > 0,
        undefined,
        pointerOf(at, kind),
        "a non-empty list of predicates",
      );
      return {
        kind,
        items: (items as unknown[]).map((item, i) =>
          readPredicate(item, pointerOf(pointerOf(at, kind), i)),
        ),
      };
    }
  if (Object.hasOwn(p, "not")) {
    onlyKeys(p, ["not"], at);
    return { kind: "not", item: readPredicate(p.not, pointerOf(at, "not")) };
  }
  if (Object.hasOwn(p, "equal")) {
    onlyKeys(p, ["field", "equal"], at);
    const field = readField(p.field, pointerOf(at, "field"));
    return {
      kind: "equal",
      field,
      value: need(
        isScalar(p.equal),
        p.equal as Scalar,
        pointerOf(at, "equal"),
        "a string, number or boolean",
      ),
    };
  }
  if (Object.hasOwn(p, "oneOf")) {
    onlyKeys(p, ["field", "oneOf"], at);
    const field = readField(p.field, pointerOf(at, "field"));
    const values = p.oneOf;
    need(
      Array.isArray(values) && values.length > 0 && values.every(isScalar),
      undefined,
      pointerOf(at, "oneOf"),
      "a non-empty list of strings, numbers or booleans",
    );
    return { kind: "oneOf", field, values: values as Scalar[] };
  }
  if (Object.hasOwn(p, "range")) {
    onlyKeys(p, ["field", "range", "timeUnit"], at);
    const field = readField(p.field, pointerOf(at, "field"));
    need(
      p.timeUnit === "utcyearmonthdate",
      undefined,
      pointerOf(at, "timeUnit"),
      '"utcyearmonthdate"',
    );
    const range = p.range;
    need(
      Array.isArray(range) && range.length === 2,
      undefined,
      pointerOf(at, "range"),
      "a list of two days",
    );
    const [lo, hi] = range as unknown[];
    const from = readDay(lo, pointerOf(pointerOf(at, "range"), 0));
    const to = readDay(hi, pointerOf(pointerOf(at, "range"), 1));
    if (from > to)
      refuse(
        "chart-unsupported-member",
        `${at}: the range ends before it starts`,
        pointerOf(at, "range"),
      );
    return { kind: "range", field, from, to };
  }
  return refuse(
    "chart-unsupported-member",
    `${at} is not an accepted predicate (equal, oneOf, range, and, or, not)`,
    at,
  );
}

// ---------------------------------------------------------------------------
// Rows and fields
// ---------------------------------------------------------------------------

const MISSING = Symbol("missing");

/** A field path resolved on a record header: each name an own member of the object before it. */
export function resolveField(
  header: Obj,
  path: string,
): unknown | typeof MISSING {
  let at: unknown = header;
  for (const name of path.split(".")) {
    if (!isObj(at) || !Object.hasOwn(at, name)) return MISSING;
    at = at[name];
  }
  return at;
}

const rowName = (row: ChartRow): string =>
  `row seq ${row.seq} (${row.recordType})`;

function headerOf(row: ChartRow): Obj {
  // Withheld rows are refused before any field is read.
  return row.header as Obj;
}

function evaluate(p: Predicate, row: ChartRow): boolean {
  switch (p.kind) {
    case "and":
      return p.items.every((item) => evaluate(item, row));
    case "or":
      return p.items.some((item) => evaluate(item, row));
    case "not":
      return !evaluate(p.item, row);
    default: {
      // A predicate is false on a row that lacks its field, as in
      // Vega-Lite: that is how a filter selects one record type.
      const value = resolveField(headerOf(row), p.field);
      if (value === MISSING) return false;
      if (p.kind === "range") {
        const day = utcDateOf(value);
        if (day === undefined)
          refuse(
            "chart-field-type",
            `${rowName(row)}: ${p.field} is not an RFC 3339 date-time with an offset`,
          );
        return (day as string) >= p.from && (day as string) <= p.to;
      }
      if (!isScalar(value))
        refuse(
          "chart-field-type",
          `${rowName(row)}: ${p.field} is not a string, number or boolean`,
        );
      return p.kind === "equal"
        ? value === p.value
        : p.values.some((v) => v === value);
    }
  }
}

// ---------------------------------------------------------------------------
// The spec
// ---------------------------------------------------------------------------

interface Statement {
  readonly population: number;
  readonly window?: ChartWindow;
  readonly runs?: { readonly filter: Predicate; readonly field: string };
  readonly values: readonly Obj[];
}

export interface ChartSpec {
  readonly mark: ChartMark;
  readonly transform: readonly Predicate[];
  readonly channels: Readonly<Partial<Record<ChannelName, Channel>>>;
  readonly aggregate: ChannelName;
  readonly keys: readonly ChannelName[];
  readonly temporal?: ChannelName;
  readonly statement: Statement;
}

function readChannel(value: unknown, at: string): Channel {
  need(isObj(value), undefined, at, "an encoding object");
  const c = value as Obj;
  onlyKeys(c, ["field", "type", "aggregate", "timeUnit", "title"], at);
  const type = need(
    TYPES.includes(c.type as FieldType),
    c.type as FieldType,
    pointerOf(at, "type"),
    "quantitative, ordinal, nominal or temporal",
  );
  const out: {
    field?: string;
    type: FieldType;
    aggregate?: "count" | "sum";
    timeUnit?: TimeUnit;
  } = { type };
  if (Object.hasOwn(c, "aggregate"))
    out.aggregate = need(
      c.aggregate === "count" || c.aggregate === "sum",
      c.aggregate as "count" | "sum",
      pointerOf(at, "aggregate"),
      "count or sum",
    );
  if (Object.hasOwn(c, "field")) {
    if (out.aggregate === "count")
      refuse(
        "chart-unsupported-member",
        `${at}: a count names no field`,
        pointerOf(at, "field"),
      );
    out.field = readField(c.field, pointerOf(at, "field"));
  } else if (out.aggregate !== "count")
    refuse(
      "chart-unsupported-member",
      `${at} must name a field`,
      pointerOf(at, "field"),
    );
  if (out.aggregate !== undefined && type !== "quantitative")
    refuse(
      "chart-unsupported-member",
      `${at}: an aggregate is quantitative`,
      pointerOf(at, "type"),
    );
  if (Object.hasOwn(c, "timeUnit")) {
    out.timeUnit = need(
      type === "temporal" && UNITS.includes(c.timeUnit as TimeUnit),
      c.timeUnit as TimeUnit,
      pointerOf(at, "timeUnit"),
      "utcyearmonthdate or utcyearmonth, on a temporal field",
    );
  } else if (type === "temporal")
    refuse(
      "chart-unsupported-member",
      `${at}: a temporal field needs a timeUnit (utcyearmonthdate or utcyearmonth)`,
      pointerOf(at, "timeUnit"),
    );
  return out;
}

function readWindow(value: unknown, at: string): ChartWindow {
  need(isObj(value), undefined, at, "{field, from, to}");
  const w = value as Obj;
  onlyKeys(w, ["field", "from", "to"], at);
  const field = readField(w.field, pointerOf(at, "field"));
  const from = need(
    isCalendarDate(w.from),
    w.from as string,
    pointerOf(at, "from"),
    "a calendar day YYYY-MM-DD",
  );
  const to = need(
    isCalendarDate(w.to),
    w.to as string,
    pointerOf(at, "to"),
    "a calendar day YYYY-MM-DD",
  );
  if (from > to)
    refuse(
      "chart-unsupported-member",
      `${at}: the window ends before it starts`,
      at,
    );
  return { field, from, to };
}

function readStatement(value: unknown, at: string): Statement {
  need(isObj(value), undefined, at, "an object");
  const s = value as Obj;
  onlyKeys(s, ["population", "window", "runs", "values"], at);
  const pop = s.population;
  need(isObj(pop), undefined, pointerOf(at, "population"), "{count}");
  onlyKeys(pop as Obj, ["count"], pointerOf(at, "population"));
  const count = (pop as Obj).count;
  need(
    Number.isInteger(count) && (count as number) >= 0,
    undefined,
    pointerOf(pointerOf(at, "population"), "count"),
    "a non-negative integer",
  );
  const out: {
    population: number;
    window?: ChartWindow;
    runs?: { filter: Predicate; field: string };
    values: Obj[];
  } = { population: count as number, values: [] };
  if (Object.hasOwn(s, "window"))
    out.window = readWindow(s.window, pointerOf(at, "window"));
  if (Object.hasOwn(s, "runs")) {
    const r = s.runs;
    const rat = pointerOf(at, "runs");
    need(isObj(r), undefined, rat, "{filter, field}");
    onlyKeys(r as Obj, ["filter", "field"], rat);
    out.runs = {
      filter: readPredicate((r as Obj).filter, pointerOf(rat, "filter")),
      field: readField((r as Obj).field, pointerOf(rat, "field")),
    };
  }
  const values = s.values;
  need(
    Array.isArray(values),
    undefined,
    pointerOf(at, "values"),
    "a list of groups",
  );
  (values as unknown[]).forEach((v, i) => {
    const vat = pointerOf(pointerOf(at, "values"), i);
    need(isObj(v), undefined, vat, "a group object");
    onlyKeys(v as Obj, [...CHANNELS, "not_run"], vat);
    if (Object.hasOwn(v as Obj, "not_run"))
      need(
        (v as Obj).not_run === true,
        undefined,
        pointerOf(vat, "not_run"),
        "true",
      );
    out.values.push(v as Obj);
  });
  return out;
}

/**
 * The first number in a spec that is not a safe integer, by its pointer. A
 * spec is hashed (JCS) for the page and carried in its render options, and
 * JCS here has no form for a fraction or an unsafe integer; a record header
 * holds none either, so no such number can match the data.
 */
function inexactNumber(value: unknown, at: string): string | undefined {
  if (typeof value === "number")
    return Number.isSafeInteger(value) ? undefined : at || "/";
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = inexactNumber(value[i], pointerOf(at, i));
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (isObj(value))
    for (const [k, v] of Object.entries(value)) {
      const found = inexactNumber(v, pointerOf(at, k));
      if (found !== undefined) return found;
    }
  return undefined;
}

/** Read a spec in the closed subset, or refuse it (structure only; no data is read). */
export function readChartSpec(value: unknown): ChartSpec {
  need(isObj(value), undefined, "", "a Vega-Lite object");
  const inexact = inexactNumber(value, "");
  if (inexact !== undefined)
    refuse(
      "chart-unsupported-member",
      `${inexact} is a fraction or an integer beyond 2^53; a spec holds integers only`,
      inexact,
    );
  const spec = value as Obj;
  onlyKeys(
    spec,
    [
      "$schema",
      "data",
      "mark",
      "transform",
      "encoding",
      "usermeta",
      "title",
      "description",
    ],
    "",
  );
  need(spec.$schema === SCHEMA, undefined, "/$schema", SCHEMA);
  const data = spec.data;
  need(isObj(data), undefined, "/data", '{"name": "dataset"}');
  onlyKeys(data as Obj, ["name"], "/data");
  need((data as Obj).name === "dataset", undefined, "/data/name", '"dataset"');

  let mark: ChartMark;
  if (isObj(spec.mark)) {
    onlyKeys(spec.mark, ["type"], "/mark");
    mark = need(
      MARKS.includes(spec.mark.type as ChartMark),
      spec.mark.type as ChartMark,
      "/mark/type",
      "bar, line, point or rect",
    );
  } else
    mark = need(
      MARKS.includes(spec.mark as ChartMark),
      spec.mark as ChartMark,
      "/mark",
      "bar, line, point or rect",
    );

  const transform: Predicate[] = [];
  if (Object.hasOwn(spec, "transform")) {
    need(
      Array.isArray(spec.transform),
      undefined,
      "/transform",
      "a list of filters",
    );
    (spec.transform as unknown[]).forEach((t, i) => {
      const at = pointerOf("/transform", i);
      need(isObj(t), undefined, at, "{filter: predicate}");
      onlyKeys(t as Obj, ["filter"], at);
      need(
        Object.hasOwn(t as Obj, "filter"),
        undefined,
        at,
        "{filter: predicate}",
      );
      transform.push(readPredicate((t as Obj).filter, pointerOf(at, "filter")));
    });
  }

  const encoding = spec.encoding;
  need(isObj(encoding), undefined, "/encoding", "an object");
  onlyKeys(encoding as Obj, CHANNELS, "/encoding");
  const channels: Partial<Record<ChannelName, Channel>> = {};
  for (const name of CHANNELS)
    if (Object.hasOwn(encoding as Obj, name))
      channels[name] = readChannel(
        (encoding as Obj)[name],
        pointerOf("/encoding", name),
      );

  const usermeta = spec.usermeta;
  need(isObj(usermeta), undefined, "/usermeta", "{capsule: statement}");
  onlyKeys(usermeta as Obj, ["capsule"], "/usermeta");
  const statement = readStatement(
    (usermeta as Obj).capsule,
    "/usermeta/capsule",
  );

  // Exactly one channel aggregates: y for bar, line and point; color for rect.
  const aggregating = CHANNELS.filter((c) => channels[c]?.aggregate);
  const want: ChannelName = mark === "rect" ? "color" : "y";
  const required: readonly ChannelName[] =
    mark === "rect" ? ["x", "y", "color"] : ["x", "y"];
  if (
    aggregating.length !== 1 ||
    aggregating[0] !== want ||
    required.some((c) => channels[c] === undefined)
  )
    refuse(
      "chart-aggregate-shape",
      mark === "rect"
        ? "a rect chart encodes x and y and aggregates color, and nothing else aggregates"
        : `a ${mark} chart encodes x and aggregates y, and nothing else aggregates`,
      "/encoding",
    );
  const keys = CHANNELS.filter((c) => channels[c] !== undefined && c !== want);
  const temporals = keys.filter((c) => channels[c]!.type === "temporal");
  // A key is a category or a time unit: the renderer places keys in bands,
  // so a quantitative key would draw its distances wrong.
  for (const c of keys)
    if (channels[c]!.type === "quantitative")
      refuse(
        "chart-unsupported-member",
        `${c} is a key, so it is nominal, ordinal or temporal; only the aggregate is quantitative`,
        pointerOf(pointerOf("/encoding", c), "type"),
      );
  // The time axis is x: "not run" is drawn as a column of x.
  for (const c of temporals)
    if (c !== "x")
      refuse(
        "chart-unsupported-member",
        "only x can be temporal",
        pointerOf(pointerOf("/encoding", c), "type"),
      );
  return {
    mark,
    transform,
    channels,
    aggregate: want,
    keys,
    ...(temporals[0] === undefined ? {} : { temporal: temporals[0] }),
    statement,
  };
}

// ---------------------------------------------------------------------------
// Time units
// ---------------------------------------------------------------------------

// Days in a month of the proleptic Gregorian calendar, by arithmetic: Date.UTC
// maps years 0-99 to 1900-1999.
const MONTH_DAYS = (year: number, month: number): number =>
  month === 2
    ? (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;

/** The unit a UTC day falls in, named by its first day. */
function unitOf(day: string, unit: TimeUnit): string {
  return unit === "utcyearmonth" ? `${day.slice(0, 8)}01` : day;
}

function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const last = d === MONTH_DAYS(y, m);
  const ny = last && m === 12 ? y + 1 : y;
  const nm = last ? (m % 12) + 1 : m;
  const nd = last ? 1 : d + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Every unit of the window, in order; refuses a window the units don't tile. */
function unitsOf(window: ChartWindow, unit: TimeUnit): string[] {
  if (unit === "utcyearmonth") {
    const [ty, tm, td] = window.to.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    if (!window.from.endsWith("-01") || td !== MONTH_DAYS(ty, tm))
      refuse(
        "chart-window-mismatch",
        `a utcyearmonth chart's window runs from a month's first day to a month's last day; ${window.from} to ${window.to} does not`,
        "/usermeta/capsule/window",
      );
  }
  const out: string[] = [];
  // Stops at `to` itself: the day after 9999-12-31 has five year digits and
  // would sort before it.
  for (let day = window.from; ; day = nextDay(day)) {
    const u = unitOf(day, unit);
    if (out[out.length - 1] !== u) out.push(u);
    if (day === window.to) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/** The plan's `traditional.window` nodes' params: the sealed windows. */
function sealedWindows(plan: Obj): ChartWindow[] {
  const nodes = plan.nodes;
  if (!Array.isArray(nodes))
    refuse("chart-dataset-invalid", "the dataset plan has no nodes");
  const out: ChartWindow[] = [];
  for (const node of nodes as unknown[]) {
    if (!isObj(node) || node.operator !== "traditional.window") continue;
    const p = node.params;
    if (
      !isObj(p) ||
      typeof p.field !== "string" ||
      !isCalendarDate(p.from) ||
      !isCalendarDate(p.to)
    )
      refuse(
        "chart-dataset-invalid",
        "a window node of the dataset plan has no {field, from, to}",
      );
    const w = p as Obj;
    out.push({
      field: w.field as string,
      from: w.from as string,
      to: w.to as string,
    });
  }
  return out;
}

const sameWindow = (a: ChartWindow, b: ChartWindow): boolean =>
  a.field === b.field && a.from === b.from && a.to === b.to;

const describe = (w: ChartWindow): string => `${w.field} ${w.from} to ${w.to}`;

/** Compare two key values: false before true, numbers by value, strings by code point. */
export function compareScalar(a: Scalar, b: Scalar): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean")
    return Number(a) - Number(b);
  const x = [...String(a)].map((c) => c.codePointAt(0)!);
  const y = [...String(b)].map((c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++)
    if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}

const keyText = (
  keys: readonly ChannelName[],
  key: Partial<Record<ChannelName, Scalar>>,
): string => JSON.stringify(keys.map((k) => [typeof key[k], key[k]]));

/**
 * Check one spec against the dataset and return what the page draws. The
 * checks run in the design note's order (section 3), and each refuses with
 * its own reason: the subset; the dataset; withheld rows; fields; window;
 * runs; population; values.
 */
export function checkChart(
  value: unknown,
  dataset: ChartDataset | undefined,
): CheckedChart {
  const spec = readChartSpec(value);
  if (dataset === undefined)
    refuse(
      "chart-no-dataset",
      "the report's Result names no dataset (dataset_ref), or the bundle does not disclose it",
    );
  const { plan, rows } = dataset as ChartDataset;
  for (const row of rows)
    if (row.header === undefined)
      refuse(
        "chart-row-withheld",
        `${rowName(row)}: the bundle does not disclose its record to this audience, so the population can't be counted`,
      );
  const { statement, channels, keys, temporal } = spec;
  const aggregate = channels[spec.aggregate]!;

  // 1. Fields exist and have a type, on the rows they apply to.
  const selected = rows.filter((row) =>
    spec.transform.every((p) => evaluate(p, row)),
  );
  const timestamp = (row: ChartRow, field: string): string => {
    const v = resolveField(headerOf(row), field);
    if (v === MISSING)
      refuse("chart-field-missing", `${rowName(row)} has no ${field}`);
    const day = utcDateOf(v);
    if (day === undefined)
      refuse(
        "chart-field-type",
        `${rowName(row)}: ${field} is not an RFC 3339 date-time with an offset`,
      );
    return day as string;
  };
  const keyOf = new Map<ChartRow, Partial<Record<ChannelName, Scalar>>>();
  const amountOf = new Map<ChartRow, number>();
  for (const row of selected) {
    const key: Partial<Record<ChannelName, Scalar>> = {};
    for (const name of keys) {
      const c = channels[name]!;
      if (c.type === "temporal") {
        key[name] = unitOf(timestamp(row, c.field!), c.timeUnit!);
        continue;
      }
      const v = resolveField(headerOf(row), c.field!);
      if (v === MISSING)
        refuse("chart-field-missing", `${rowName(row)} has no ${c.field}`);
      if (c.type === "quantitative" ? typeof v !== "number" : !isScalar(v))
        refuse(
          "chart-field-type",
          `${rowName(row)}: ${c.field} is not ${c.type === "quantitative" ? "a number" : "a string, number or boolean"}`,
        );
      key[name] = v as Scalar;
    }
    keyOf.set(row, key);
    if (aggregate.aggregate === "sum") {
      const v = resolveField(headerOf(row), aggregate.field!);
      if (v === MISSING)
        refuse(
          "chart-field-missing",
          `${rowName(row)} has no ${aggregate.field}`,
        );
      if (typeof v !== "number" || !Number.isFinite(v))
        refuse(
          "chart-field-type",
          `${rowName(row)}: ${aggregate.field} is not a number, so it can't be summed`,
        );
      amountOf.set(row, v as number);
    }
    if (statement.window !== undefined) timestamp(row, statement.window.field);
  }
  for (const name of keys) {
    const types = new Set(selected.map((row) => typeof keyOf.get(row)![name]));
    if (types.size > 1)
      refuse(
        "chart-field-type",
        `${channels[name]!.field} holds values of more than one type`,
      );
  }

  // 2. Window: the statement, the transform's range filter and the seal agree.
  const windows = sealedWindows(plan);
  const window = statement.window;
  if (temporal !== undefined && window === undefined)
    refuse(
      "chart-window-mismatch",
      "a temporal chart states its window (usermeta.capsule.window)",
      "/usermeta/capsule",
    );
  if (window !== undefined) {
    const restated = spec.transform.some(
      (p) =>
        p.kind === "range" &&
        p.field === window.field &&
        p.from === window.from &&
        p.to === window.to,
    );
    if (!restated)
      refuse(
        "chart-window-mismatch",
        `the transform has no range filter over ${describe(window)} with timeUnit utcyearmonthdate`,
        "/transform",
      );
    if (temporal !== undefined && channels[temporal]!.field !== window.field)
      refuse(
        "chart-window-mismatch",
        `the time axis reads ${channels[temporal]!.field}, the window ${window.field}`,
        pointerOf(pointerOf("/encoding", temporal), "field"),
      );
    if (windows.length === 1 && !sameWindow(window, windows[0]!))
      refuse(
        "chart-window-mismatch",
        `the chart's window is ${describe(window)}, the sealed window ${describe(windows[0]!)}`,
        "/usermeta/capsule/window",
      );
    for (const sealed of windows)
      if (
        sealed.field === window.field &&
        (window.from < sealed.from || window.to > sealed.to)
      )
        refuse(
          "chart-window-mismatch",
          `the chart's window ${describe(window)} is not inside the sealed window ${describe(sealed)}`,
          "/usermeta/capsule/window",
        );
  }
  const units =
    temporal === undefined
      ? undefined
      : unitsOf(window!, channels[temporal]!.timeUnit!);

  // Runs: only a plan with exactly one window node can tell "not run" from
  // zero (spec/evidence-plan-ir-v0.md §5.1), by that node's own field.
  const runs = statement.runs;
  if (windows.length !== 1) {
    if (runs !== undefined)
      refuse(
        "chart-runs-unsealed",
        `the dataset plan has ${windows.length} window nodes, so no day can read "not run"; this chart states runs`,
        "/usermeta/capsule/runs",
      );
  } else if (temporal !== undefined) {
    if (runs === undefined)
      refuse(
        "chart-runs-missing",
        "a temporal chart over a windowed plan names its run records (usermeta.capsule.runs)",
        "/usermeta/capsule",
      );
  }
  if (runs !== undefined && windows.length === 1) {
    if (runs.field !== windows[0]!.field)
      refuse(
        "chart-runs-field-mismatch",
        `runs are dated by ${runs.field}; the sealed window field is ${windows[0]!.field}`,
        "/usermeta/capsule/runs/field",
      );
    if (temporal === undefined)
      refuse(
        "chart-runs-unsealed",
        "only a temporal chart can say a unit was not run; this chart has no time axis",
        "/usermeta/capsule/runs",
      );
  }
  const runRowsOf = new Map<string, ChartRow[]>();
  const drawsRuns =
    runs !== undefined && windows.length === 1 && temporal !== undefined;
  if (drawsRuns) {
    const unit = channels[temporal!]!.timeUnit!;
    for (const row of rows) {
      if (!evaluate(runs!.filter, row)) continue;
      const day = timestamp(row, runs!.field);
      if (day < window!.from || day > window!.to) continue;
      const u = unitOf(day, unit);
      const list = runRowsOf.get(u);
      if (list === undefined) runRowsOf.set(u, [row]);
      else list.push(row);
    }
  }

  // 3. Population.
  if (selected.length !== statement.population)
    refuse(
      "chart-population-mismatch",
      `${selected.length} rows pass the transform; the chart states ${statement.population}`,
      "/usermeta/capsule/population/count",
    );

  // 4. Values: every group of the domain, recomputed.
  const domains = keys.map((name) =>
    name === temporal
      ? (units as Scalar[])
      : [...new Set(selected.map((row) => keyOf.get(row)![name]!))].sort(
          compareScalar,
        ),
  );
  // The stated values list every group, so a domain of another size
  // refuses before it is enumerated: a spec can't make the check build a
  // domain far larger than itself.
  const size = domains.reduce((n, d) => n * d.length, 1);
  if (size !== statement.values.length)
    refuse(
      "chart-aggregate-mismatch",
      `the chart's domain has ${size} groups; the statement lists ${statement.values.length}`,
      "/usermeta/capsule/values",
    );
  const rowsByKey = new Map<string, ChartRow[]>();
  for (const row of selected) {
    const text = keyText(keys, keyOf.get(row)!);
    const list = rowsByKey.get(text);
    if (list === undefined) rowsByKey.set(text, [row]);
    else list.push(row);
  }
  const groups: ChartGroup[] = [];
  const product = (i: number, key: Partial<Record<ChannelName, Scalar>>) => {
    if (i === keys.length) {
      const counted = rowsByKey.get(keyText(keys, key)) ?? [];
      const unit = temporal === undefined ? undefined : key[temporal];
      const runRows =
        unit === undefined ? [] : (runRowsOf.get(unit as string) ?? []);
      const notRun = drawsRuns && runRows.length === 0;
      const value =
        aggregate.aggregate === "count"
          ? counted.length
          : counted.reduce((sum, row) => sum + amountOf.get(row)!, 0);
      groups.push({
        key: { ...key },
        ...(notRun ? {} : { value }),
        notRun,
        rows: counted,
        runRows,
      });
      return;
    }
    for (const v of domains[i]!) product(i + 1, { ...key, [keys[i]!]: v });
  };
  // A unit with rows but no run record is still not run (§5.1: "a day
  // without a run row was not run"); its rows stay in the population.
  product(0, {});

  const stated = new Map<string, Obj>();
  statement.values.forEach((v, i) => {
    const key: Partial<Record<ChannelName, Scalar>> = {};
    for (const name of keys)
      if (Object.hasOwn(v, name)) key[name] = v[name] as Scalar;
    const text = keyText(keys, key);
    if (stated.has(text))
      refuse(
        "chart-aggregate-mismatch",
        `the group ${text} is listed twice`,
        pointerOf("/usermeta/capsule/values", i),
      );
    stated.set(text, v);
  });
  const want = new Map(groups.map((g) => [keyText(keys, g.key), g]));
  for (const [text, v] of stated) {
    const g = want.get(text);
    const extra = Object.keys(v).filter(
      (k) =>
        k !== "not_run" &&
        k !== spec.aggregate &&
        !keys.includes(k as ChannelName),
    );
    const ok =
      g !== undefined &&
      extra.length === 0 &&
      (g.notRun
        ? v.not_run === true && !Object.hasOwn(v, spec.aggregate)
        : !Object.hasOwn(v, "not_run") && v[spec.aggregate] === g.value);
    if (!ok)
      refuse(
        "chart-aggregate-mismatch",
        g === undefined
          ? `the stated group ${text} is not in the chart's domain`
          : `the stated group ${text} does not match the data (${g.notRun ? "not run" : String(g.value)})`,
        "/usermeta/capsule/values",
      );
  }
  for (const [text, g] of want)
    if (!stated.has(text))
      refuse(
        "chart-aggregate-mismatch",
        `the group ${text} (${g.notRun ? "not run" : String(g.value)}) is missing from the stated values`,
        "/usermeta/capsule/values",
      );

  return {
    mark: spec.mark,
    channels,
    aggregate: spec.aggregate,
    keys,
    ...(temporal === undefined ? {} : { temporal }),
    population: selected.length,
    ...(window === undefined ? {} : { window }),
    runs: drawsRuns,
    ...(temporal === undefined
      ? {}
      : {
          units: (units as string[]).map((unit) => ({
            unit,
            notRun: drawsRuns && (runRowsOf.get(unit) ?? []).length === 0,
          })),
        }),
    groups,
  };
}

/** A checked chart's groups in the statement's `values` form, for vectors. */
export function groupsAsValues(chart: CheckedChart): Obj[] {
  return chart.groups.map((g) => ({
    ...g.key,
    ...(g.notRun ? { not_run: true } : { [chart.aggregate]: g.value }),
  }));
}
