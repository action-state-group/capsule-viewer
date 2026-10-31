// SPDX-License-Identifier: BSD-3-Clause
/**
 * Calendar and by-period views as DOM (capsule-viewer#120;
 * docs/design/report-views.md section 3), from the groups report-view.ts
 * recomputed. The grid is a `<table>`, so it is its own text alternative;
 * no SVG, no producer text (a lane's or column's id is drawn as code, like an
 * axis field), and every other word is a core wording key. Each count carries
 * Show evidence (chart-view.ts `valueEvidence`) or the `none` label.
 */
import type { Words } from "./contract-report-wording.js";
import { compareScalar, resolveField } from "./chart-spec.js";
import type {
  ChartGroup,
  CheckedChart,
  ChartRow,
  Scalar,
} from "./chart-spec.js";
import { CHART_ATTRIBUTE, valueEvidence } from "./chart-view.js";
import { recordAddress } from "./report-levels.js";
import type {
  CheckedByPeriod,
  CheckedCalendar,
  CheckedCoFailure,
  CheckedTimeline,
  CheckedView,
  LaneRole,
  ValueClass,
  ViewChart,
} from "./report-view.js";
const SVG = "http://www.w3.org/2000/svg";

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const code = (text: string): HTMLElement => el("code", undefined, text);

const scalarText = (value: Scalar | undefined): string =>
  value === undefined ? "" : String(value);

// Dates are ISO `YYYY-MM-DD`; arithmetic goes through Date with an explicit
// full year, since the constructor maps years 0 to 99 to 1900 to 1999.
function utcMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getTime();
}
const DAY = 86_400_000;
const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** Monday = 0 … Sunday = 6. */
const weekdayOf = (day: string): number =>
  (new Date(utcMs(day)).getUTCDay() + 6) % 7;
const mondayOf = (day: string): string =>
  isoOf(utcMs(day) - weekdayOf(day) * DAY);

function frame(
  view: CheckedView,
  index: number,
  sha256: string,
  w: Words,
  parts: readonly ViewChart[],
): HTMLElement {
  const figure = el("figure", "cv-view");
  figure.setAttribute(CHART_ATTRIBUTE, String(index));
  figure.dataset.view = view.view;
  figure.dataset.chartSha256 = sha256;
  const caption = el(
    "figcaption",
    undefined,
    w.t("chart.window", { from: view.window.from, to: view.window.to }),
  );
  figure.append(caption);
  figure.append(el("p", "cv-chart-derived", w.t("chart.derived")));
  const legend = el("ul", "cv-view-legend");
  for (const { id, chart } of parts) {
    const item = el("li");
    item.dataset.viewChart = id;
    item.append(code(id), ` ${w.p("chart.population", chart.population)}`);
    legend.append(item);
  }
  figure.append(legend);
  if (view.unplaced > 0) {
    const note = el("p", "cv-unplaced", w.p("view.unplaced", view.unplaced));
    note.dataset.unplaced = String(view.unplaced);
    figure.append(note);
  }
  return figure;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function groupsOn(chart: CheckedChart, day: string): ChartGroup[] {
  return chart.groups.filter((g) => g.key.x === day);
}

function laneCell(
  lane: ViewChart,
  index: number,
  day: string,
  w: Words,
): HTMLElement {
  const wrap = el("div", "cv-lane");
  wrap.dataset.lane = lane.id;
  wrap.append(code(lane.id), " ");
  const groups = groupsOn(lane.chart, day);
  const counted = groups.filter((g) => (g.value ?? 0) > 0);
  // Nothing counted that day: a single 0. A lane whose category domain is
  // empty has no group at all, so the 0 is a group of no rows.
  const shown =
    counted.length > 0
      ? counted
      : groups.length > 0
        ? groups.slice(0, 1)
        : [{ key: {}, value: 0, notRun: false, rows: [], runRows: [] }];
  shown.forEach((g, i) => {
    const key = `view-${String(index)}-${lane.id}-${day}-${String(i)}`;
    const extra = lane.chart.keys.filter((k) => k !== "x");
    const name = extra.map((k) => scalarText(g.key[k])).join(" · ");
    if (extra.length > 0 && (g.value ?? 0) > 0)
      wrap.append(el("span", "cv-lane-key", `${name} × `));
    const value = el("span", undefined, String(g.value));
    value.dataset.chartValue = key;
    wrap.append(value, " ", valueEvidence(key, `${lane.id} ${day}`, g, w));
  });
  return wrap;
}

// ---------------------------------------------------------------------------
// Calendar cells (lanes with a role): the canvas's cell, its legend and the
// day's own section. Counts, classes and colours come from the checked groups
// alone; the nouns and verbs of a cell are wording-pack words.
// ---------------------------------------------------------------------------

const laneOf = (view: CheckedCalendar, role: LaneRole): ViewChart | undefined =>
  view.lanes.find((l) => l.role === role);

interface Tally {
  good: number;
  bad: number;
  open: number;
}

const keyOf = (chart: CheckedChart): "x" | "y" | "color" =>
  chart.keys.find((k) => k !== "x")!;

/** A keyed lane's day, summed by the class of each value. */
function tallyOf(lane: ViewChart, day: string): Tally {
  const tally: Tally = { good: 0, bad: 0, open: 0 };
  for (const g of groupsOn(lane.chart, day)) {
    const cls = lane.classes![String(g.key[keyOf(lane.chart)])] as ValueClass;
    tally[cls] += g.value ?? 0;
  }
  return tally;
}

const sumOf = (lane: ViewChart, day: string): number =>
  groupsOn(lane.chart, day).reduce((n, g) => n + (g.value ?? 0), 0);

type Scale = "good" | "some" | "most";

/**
 * Green when at most one judged case is not good and most are good, red when
 * more than half are bad, else amber. One judged case that was not met is
 * therefore red, never green.
 */
function scaleOf(t: Tally): Scale | undefined {
  const total = t.good + t.bad + t.open;
  if (total === 0) return undefined;
  if (total - t.good <= 1 && t.good * 2 > total) return "good";
  return t.bad * 2 > total ? "most" : "some";
}

const svgEl = (
  tag: string,
  attrs: Record<string, string | number>,
): SVGElement => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

/** The day's bar: good, bad and open shares of its judged cases, as SVG widths. */
function barOf(t: Tally): SVGElement {
  const total = t.good + t.bad + t.open;
  const root = svgEl("svg", {
    viewBox: "0 0 100 4",
    preserveAspectRatio: "none",
    class: "cv-bar",
    "aria-hidden": "true",
    focusable: "false",
  });
  let x = 0;
  for (const cls of ["good", "bad", "open"] as const) {
    if (t[cls] === 0) continue;
    const width = (100 * t[cls]) / total;
    root.append(
      svgEl("rect", {
        x: x.toFixed(2),
        y: 0,
        width: width.toFixed(2),
        height: 4,
        class: `cv-bar-${cls}`,
      }),
    );
    x += width;
  }
  return root;
}

/** "judged · 8 resolved · 1 missed": good and bad always, open when there is some. */
function judgedLine(t: Tally, w: Words): string {
  const parts = [
    w.t("calendar.judged"),
    w.t("calendar.class.good", { n: t.good }),
    w.t("calendar.class.bad", { n: t.bad }),
  ];
  if (t.open > 0) parts.push(w.t("calendar.class.open", { n: t.open }));
  return parts.join(" · ");
}

/** The adjudication chip: the count recorded, and how many concur or differ when the lane says. */
function adjudicationChip(
  lane: ViewChart,
  day: string,
  w: Words,
): HTMLElement | undefined {
  const keyed = lane.classes !== undefined;
  const t = keyed ? tallyOf(lane, day) : undefined;
  const n = t === undefined ? sumOf(lane, day) : t.good + t.bad + t.open;
  if (n === 0) return undefined;
  const parts = [w.p("calendar.adj.recorded", n)];
  if (t !== undefined) {
    if (t.bad === 0 && t.open === 0) parts.push(w.t("calendar.adj.concur"));
    if (t.bad > 0) parts.push(w.p("calendar.adj.differ", t.bad));
    if (t.open > 0) parts.push(w.t("calendar.adj.open", { n: t.open }));
  }
  const chip = el("div", "cv-adj");
  chip.dataset.adjudications = String(n);
  chip.append(el("span", "cv-diamond", "◆"), ` ${parts.join(" · ")}`);
  return chip;
}

const dayId = (index: number, day: string): string =>
  `cv-day-${String(index)}-${day}`;

function roleCell(
  view: CheckedCalendar,
  index: number,
  day: string,
  cell: HTMLElement,
  w: Words,
): void {
  const activity = laneOf(view, "activity");
  const judgment = laneOf(view, "judgment");
  const adjudication = laneOf(view, "adjudication");
  const number = el("div", "cv-dn");
  const link = el("a", "cv-day-link", String(Number(day.slice(8))));
  link.setAttribute("href", `#${dayId(index, day)}`);
  number.append(link);
  cell.replaceChildren(number);
  if (activity !== undefined)
    cell.append(
      el("div", "cv-act", w.p("calendar.activity", sumOf(activity, day))),
    );
  if (judgment !== undefined) {
    const t = tallyOf(judgment, day);
    const scale = scaleOf(t);
    if (scale !== undefined) cell.dataset.scale = scale;
    cell.append(el("div", "cv-jdg", judgedLine(t, w)));
    if (t.good + t.bad + t.open > 0) cell.append(barOf(t));
  }
  if (adjudication !== undefined) {
    const chip = adjudicationChip(adjudication, day, w);
    if (chip !== undefined) cell.append(chip);
  }
}

function legendOf(view: CheckedCalendar, w: Words): HTMLElement {
  const legend = el("ul", "cv-legend");
  if (laneOf(view, "judgment") !== undefined)
    for (const scale of ["good", "some", "most"] as const) {
      const item = el("li");
      const swatch = el("span", "cv-swatch");
      swatch.dataset.scale = scale;
      item.append(swatch, ` ${w.t(`calendar.legend.${scale}`)}`);
      legend.append(item);
    }
  if (laneOf(view, "adjudication") !== undefined) {
    const item = el("li");
    item.append(
      el("span", "cv-diamond", "◆"),
      ` ${w.t("calendar.legend.adjudication")}`,
    );
    legend.append(item);
  }
  return legend;
}

/** The time of day (UTC) of a row, from the chart's own time field. */
function timeOf(row: ChartRow, field: string): string {
  const v =
    row.header === undefined ? undefined : resolveField(row.header, field);
  const ms = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString().slice(11, 16);
}

/** One day's section: its heading, its counts with Show evidence, and the records it counts. */
function daySection(
  view: CheckedCalendar,
  index: number,
  day: string,
  w: Words,
): HTMLElement {
  const activity = laneOf(view, "activity");
  const judgment = laneOf(view, "judgment");
  const section = el("section", "cv-day-section");
  section.id = dayId(index, day);
  section.dataset.daySection = day;
  const [, m, d] = day.split("-").map(Number) as [number, number, number];
  const heading = [
    w.t("calendar.day.heading", {
      weekday: w.t(`calendar.weekday.long.${String(weekdayOf(day) + 1)}`),
      month: w.t(`calendar.month.${String(m)}`),
      day: d,
    }),
  ];
  if (activity !== undefined)
    heading.push(w.p("calendar.activity", sumOf(activity, day)));
  if (judgment !== undefined)
    heading.push(judgedLine(tallyOf(judgment, day), w));
  section.append(el("h3", undefined, heading.join(" · ")));

  const counts = el("div", "cv-day-counts");
  counts.append(el("p", "cv-k", w.t("calendar.day.counts")));
  for (const lane of view.lanes) counts.append(laneCell(lane, index, day, w));
  section.append(counts);

  const field = (activity ?? view.lanes[0]!).chart.channels.x!.field!;
  const rows = new Map<number, ChartRow>();
  if (activity !== undefined)
    for (const g of groupsOn(activity.chart, day))
      for (const row of g.rows) rows.set(row.seq, row);
  if (rows.size > 0) {
    const table = el("table", "cv-day-table");
    const head = el("tr");
    for (const key of ["calendar.day.time", "calendar.day.record"]) {
      const th = el("th", undefined, w.t(key));
      th.setAttribute("scope", "col");
      head.append(th);
    }
    const thead = el("thead");
    thead.append(head);
    const tbody = el("tbody");
    const ordered = [...rows.values()].sort(
      (a, b) =>
        timeOf(a, field).localeCompare(timeOf(b, field)) || a.seq - b.seq,
    );
    for (const row of ordered) {
      const tr = el("tr");
      tr.append(el("td", undefined, timeOf(row, field)));
      const td = el("td");
      if (row.recordId === undefined) td.append(code(`seq ${String(row.seq)}`));
      else {
        const a = el("a");
        a.setAttribute("href", `#${recordAddress(row.recordId)}`);
        a.append(code(row.recordId));
        td.append(a);
      }
      tr.append(td);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    const wrap = el("div", "cv-view-table");
    wrap.append(table);
    section.append(wrap);
  }
  return section;
}

export function renderCalendar(
  view: CheckedCalendar,
  index: number,
  sha256: string,
  w: Words,
): HTMLElement {
  const figure = frame(view, index, sha256, w, view.lanes);
  const first = view.lanes[0]!;
  const notRun = new Set(
    (first.chart.units ?? []).filter((u) => u.notRun).map((u) => u.unit),
  );
  const hasRoles = view.lanes.some((l) => l.role !== undefined);
  const months: string[] = [];
  for (
    let ms = utcMs(view.window.from);
    ms <= utcMs(view.window.to);
    ms += DAY
  ) {
    const month = isoOf(ms).slice(0, 7);
    if (months[months.length - 1] !== month) months.push(month);
  }
  const scroll = el("div", "cv-view-table");
  for (const month of months) {
    const table = el("table", "cv-cal");
    table.dataset.month = month;
    table.append(el("caption", undefined, month));
    const head = el("tr");
    for (let d = 1; d <= 7; d++) {
      const th = el("th", undefined, w.t(`calendar.weekday.${String(d)}`));
      th.setAttribute("scope", "col");
      head.append(th);
    }
    const thead = el("thead");
    thead.append(head);
    const tbody = el("tbody");
    const first1 = `${month}-01`;
    const last = (() => {
      const [y, m] = month.split("-").map(Number) as [number, number];
      const d = new Date(0);
      d.setUTCFullYear(y, m, 0);
      return d.getUTCDate();
    })();
    let row = el("tr");
    for (let pad = 0; pad < weekdayOf(first1); pad++)
      row.append(el("td", "cv-pad"));
    for (let n = 1; n <= last; n++) {
      const day = `${month}-${String(n).padStart(2, "0")}`;
      const cell = el("td", "cv-day");
      cell.dataset.day = day;
      cell.append(el("div", "cv-dn", String(n).padStart(2, "0")));
      if (notRun.has(day)) {
        cell.dataset.notRun = "";
        cell.append(el("div", "cv-nr", w.t("chart.not_run")));
      } else if (hasRoles) roleCell(view, index, day, cell, w);
      else
        for (const lane of view.lanes)
          cell.append(laneCell(lane, index, day, w));
      row.append(cell);
      if (weekdayOf(day) === 6 || n === last) {
        tbody.append(row);
        row = el("tr");
      }
    }
    table.append(thead, tbody);
    scroll.append(table);
  }
  figure.append(scroll);
  if (hasRoles) {
    figure.append(legendOf(view, w));
    for (const [day, ran] of (first.chart.units ?? []).map(
      (u) => [u.unit, !u.notRun] as const,
    ))
      if (ran) figure.append(daySection(view, index, day, w));
  }
  return figure;
}

// ---------------------------------------------------------------------------
// By period
// ---------------------------------------------------------------------------

interface Sum {
  value: number;
  rows: ChartRow[];
}

/** A synthetic group: the sum of several, for one Show evidence action. */
const groupOf = (sum: Sum): ChartGroup => ({
  key: {},
  value: sum.value,
  notRun: false,
  rows: sum.rows,
  runRows: [],
});

export function renderByPeriod(
  view: CheckedByPeriod,
  index: number,
  sha256: string,
  w: Words,
): HTMLElement {
  const parts = [view.count, ...view.columns];
  const figure = frame(view, index, sha256, w, parts);
  // The requirement is each chart's one key channel besides x: y on a rect,
  // color on a bar, line or point. The checker holds them to one field.
  const keyOf = (chart: CheckedChart): "x" | "y" | "color" =>
    chart.keys.find((k) => k !== "x")!;
  const field = view.count.chart.channels[keyOf(view.count.chart)]!.field!;
  // Rows are the checked values themselves (the checker holds the charts to
  // one type), ordered as the checker orders a domain.
  const requirements: Scalar[] = [];
  for (const p of parts)
    for (const g of p.chart.groups) {
      const v = g.key[keyOf(p.chart)]!;
      if (!requirements.some((r) => r === v)) requirements.push(v);
    }
  requirements.sort(compareScalar);

  // The weeks that have a day in the window, Monday first; per week, the
  // window's days in it and which of those did not run.
  const weeks = new Map<string, { days: string[]; notRun: Set<string> }>();
  for (const u of view.count.chart.units ?? []) {
    const monday = mondayOf(u.unit);
    const week = weeks.get(monday) ?? { days: [], notRun: new Set() };
    week.days.push(u.unit);
    if (u.notRun) week.notRun.add(u.unit);
    weeks.set(monday, week);
  }
  const windowNotRun = (view.count.chart.units ?? []).filter(
    (u) => u.notRun,
  ).length;
  const windowDays = (view.count.chart.units ?? []).length;
  const mondays = [...weeks.keys()].sort();

  const table = el("table", "cv-period");
  const top = el("tr");
  const reqHead = el("th");
  reqHead.setAttribute("scope", "col");
  reqHead.setAttribute("rowspan", "2");
  reqHead.append(code(field));
  const countHead = el("th");
  countHead.setAttribute("scope", "colgroup");
  countHead.setAttribute("colspan", String(mondays.length));
  countHead.append(code(view.count.id));
  top.append(reqHead, countHead);
  for (const col of view.columns) {
    const th = el("th");
    th.setAttribute("scope", "col");
    th.setAttribute("rowspan", "2");
    th.append(code(col.id));
    top.append(th);
  }
  const second = el("tr");
  for (const monday of mondays) {
    const th = el("th", undefined, w.t("period.week", { date: monday }));
    th.setAttribute("scope", "col");
    th.dataset.week = monday;
    second.append(th);
  }
  const thead = el("thead");
  thead.append(top, second);

  const sumOver = (
    chart: CheckedChart,
    requirement: Scalar,
    days: ReadonlySet<string> | undefined,
  ): Sum => {
    const sum: Sum = { value: 0, rows: [] };
    for (const g of chart.groups) {
      if (g.key[keyOf(chart)] !== requirement || g.notRun) continue;
      if (days !== undefined && !days.has(g.key.x as string)) continue;
      sum.value += g.value ?? 0;
      sum.rows.push(...g.rows);
    }
    return sum;
  };
  const tbody = el("tbody");
  requirements.forEach((requirement, r) => {
    const tr = el("tr");
    tr.dataset.requirement = String(requirement);
    const th = el("th", undefined, String(requirement));
    th.setAttribute("scope", "row");
    tr.append(th);
    mondays.forEach((monday, m) => {
      const week = weeks.get(monday)!;
      const td = el("td");
      td.dataset.week = monday;
      if (week.notRun.size === week.days.length) {
        td.dataset.notRun = "";
        td.textContent = w.t("chart.not_run");
      } else {
        const key = `view-${String(index)}-r${String(r)}-w${String(m)}`;
        const live = new Set(week.days.filter((d) => !week.notRun.has(d)));
        const sum = sumOver(view.count.chart, requirement, live);
        const value = el("span", undefined, String(sum.value));
        value.dataset.chartValue = key;
        td.append(
          value,
          " ",
          valueEvidence(
            key,
            `${String(requirement)} ${monday}`,
            groupOf(sum),
            w,
          ),
        );
        if (week.notRun.size > 0) {
          const note = el(
            "small",
            "cv-nr",
            w.p("period.not_run_days", week.notRun.size),
          );
          note.dataset.notRunDays = String(week.notRun.size);
          td.append(" ", note);
        }
      }
      tr.append(td);
    });
    view.columns.forEach((col, c) => {
      const td = el("td");
      td.dataset.column = col.id;
      if (windowNotRun === windowDays) {
        td.dataset.notRun = "";
        td.textContent = w.t("chart.not_run");
      } else {
        const key = `view-${String(index)}-r${String(r)}-c${String(c)}`;
        const sum = sumOver(col.chart, requirement, undefined);
        const value = el("span", undefined, String(sum.value));
        value.dataset.chartValue = key;
        td.append(
          value,
          " ",
          valueEvidence(
            key,
            `${String(requirement)} ${col.id}`,
            groupOf(sum),
            w,
          ),
        );
        if (windowNotRun > 0) {
          const note = el(
            "small",
            "cv-nr",
            w.p("period.not_run_days", windowNotRun),
          );
          note.dataset.notRunDays = String(windowNotRun);
          td.append(" ", note);
        }
      }
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(thead, tbody);
  const scroll = el("div", "cv-view-table");
  scroll.append(table);
  figure.append(scroll);
  return figure;
}

// ---------------------------------------------------------------------------
// Timeline: one row per lane, a mark on each day that has a count
// ---------------------------------------------------------------------------

const TL = { left: 150, right: 12, top: 22, row: 44, w: 760 };

/** A lane's row label: the wording pack's `lane.<id>.title` when it has one, else the id as code. */
function laneLabel(id: string, w: Words): HTMLElement | string {
  const word = w.section3(`lane.${id}.title`);
  return word ?? code(id);
}

export function renderTimeline(
  view: CheckedTimeline,
  index: number,
  sha256: string,
  w: Words,
): HTMLElement {
  const figure = frame(view, index, sha256, w, view.lanes);
  const units = view.lanes[0]!.chart.units ?? [];
  const plotW = TL.w - TL.left - TL.right;
  const band = plotW / Math.max(1, units.length);
  const height = TL.top + TL.row * view.lanes.length + 6;
  const root = svgEl("svg", {
    viewBox: `0 0 ${String(TL.w)} ${String(height)}`,
    class: "cv-timeline",
    "aria-hidden": "true",
    focusable: "false",
  });
  const dayAt = new Map(units.map((u, i) => [u.unit, i]));
  const text = (
    label: string,
    attrs: Record<string, string | number>,
  ): void => {
    const t = svgEl("text", { class: "cv-tl-text", ...attrs });
    t.textContent = label;
    root.append(t);
  };
  // Not-run days: a hatched band the height of the plot, no mark in it.
  units.forEach((u, i) => {
    if (!u.notRun) return;
    const rect = svgEl("rect", {
      x: (TL.left + band * i).toFixed(2),
      y: TL.top - 6,
      width: band.toFixed(2),
      height: TL.row * view.lanes.length,
      class: "cv-tl-notrun",
    });
    rect.setAttribute("data-not-run", u.unit);
    root.append(rect);
  });
  if (units.length > 0)
    for (const at of [0, Math.floor((units.length - 1) / 2), units.length - 1])
      text(units[at]!.unit, {
        x: (TL.left + band * at + band / 2).toFixed(2),
        y: 12,
        "text-anchor":
          at === 0 ? "start" : at === units.length - 1 ? "end" : "middle",
      });
  view.lanes.forEach((lane, row) => {
    const mid = TL.top + TL.row * row + TL.row / 2;
    root.append(
      svgEl("line", {
        x1: TL.left,
        x2: TL.w - TL.right,
        y1: mid,
        y2: mid,
        class: "cv-tl-axis",
      }),
    );
    const word = w.section3(`lane.${lane.id}.title`);
    text(word ?? lane.id, {
      x: 0,
      y: mid + 4,
      class: word === undefined ? "cv-tl-text cv-tl-lane" : "cv-tl-text",
    });
    const key = lane.classes === undefined ? undefined : keyOf(lane.chart);
    // One mark per day and class, its size the day's total in that class, so
    // two values of one class never draw over each other.
    const totals = new Map<string, number>();
    for (const g of lane.chart.groups) {
      if (g.notRun || (g.value ?? 0) === 0 || !dayAt.has(String(g.key.x)))
        continue;
      const cls =
        key === undefined ? "open" : lane.classes![String(g.key[key])]!;
      const id = `${String(g.key.x)}|${cls}`;
      totals.set(id, (totals.get(id) ?? 0) + g.value!);
    }
    for (const [id, total] of totals) {
      const [day, cls] = id.split("|") as [string, ValueClass];
      // The classes present on that day, spread about the day's centre.
      const present = (["good", "bad", "open"] as const).filter((c) =>
        totals.has(`${day}|${c}`),
      );
      const slot = present.indexOf(cls) - (present.length - 1) / 2;
      const cx = TL.left + band * dayAt.get(day)! + band / 2 + 8 * slot;
      const n = Math.min(total, 5);
      const mark =
        lane.mark === "diamond"
          ? svgEl("path", {
              d: `M${cx.toFixed(2)} ${String(mid - 6)} l6 6 l-6 6 l-6 -6 z`,
              class: `cv-tl-mark cv-tl-${cls}`,
            })
          : svgEl("line", {
              x1: cx.toFixed(2),
              x2: cx.toFixed(2),
              y1: mid - 4 - 3 * n,
              y2: mid + 4 + 3 * n,
              class: `cv-tl-mark cv-tl-tick cv-tl-${cls}`,
            });
      mark.setAttribute("data-day", day);
      root.append(mark);
    }
  });
  const scroll = el("div", "cv-view-table");
  scroll.append(root);
  figure.append(scroll);

  // The text alternative: each lane's marks as a list, each count with Show evidence.
  const lists = el("div", "cv-tl-lists");
  view.lanes.forEach((lane) => {
    const block = el("div", "cv-tl-lane");
    block.dataset.lane = lane.id;
    const head = el("p", "cv-k");
    head.append(laneLabel(lane.id, w));
    block.append(head);
    const list = el("ul");
    const key = keyOf(lane.chart);
    lane.chart.groups.forEach((g, gi) => {
      if (g.notRun || (g.value ?? 0) === 0) return;
      const item = el("li");
      const evidenceKey = `view-${String(index)}-${lane.id}-g${String(gi)}`;
      const name = [g.key.x, g.key[key]]
        .filter((v) => v !== undefined)
        .join(" · ");
      const value = el("span", undefined, String(g.value));
      value.dataset.chartValue = evidenceKey;
      item.append(
        `${String(g.key.x)} `,
        ...(lane.chart.keys.some((k) => k !== "x")
          ? [el("span", "cv-lane-key", `${String(g.key[key])} × `)]
          : []),
        value,
        " ",
        valueEvidence(evidenceKey, `${lane.id} ${name}`, g, w),
      );
      list.append(item);
    });
    block.append(list);
    if (list.children.length === 0)
      block.append(el("p", "cv-nr", w.t("chart.evidence.none")));
    const notRun = (lane.chart.units ?? []).filter((u) => u.notRun).length;
    if (notRun > 0)
      block.append(el("p", "cv-nr", w.p("period.not_run_days", notRun)));
    lists.append(block);
  });
  figure.append(lists);
  return figure;
}

// ---------------------------------------------------------------------------
// Co-failure: which requirements fail together
// ---------------------------------------------------------------------------

export function renderCoFailure(
  view: CheckedCoFailure,
  index: number,
  sha256: string,
  w: Words,
): HTMLElement {
  const figure = frame(view, index, sha256, w, [view.count]);
  figure.append(
    el("p", "cv-cofail-total", w.p("cofail.failing", view.failing)),
  );
  const table = el("table", "cv-cofail");
  const head = el("tr");
  const corner = el("th");
  corner.append(code(view.subject));
  head.append(corner);
  for (const req of view.requirements) {
    const th = el("th", undefined, String(req));
    th.setAttribute("scope", "col");
    head.append(th);
  }
  const thead = el("thead");
  thead.append(head);
  const tbody = el("tbody");
  view.requirements.forEach((req, a) => {
    const tr = el("tr");
    const th = el("th", undefined, String(req));
    th.setAttribute("scope", "row");
    tr.append(th);
    view.requirements.forEach((other, b) => {
      const cell = view.cells[a]![b]!;
      const td = el("td");
      if (a === b) td.dataset.diagonal = "";
      td.dataset.cofail = `${String(req)}|${String(other)}`;
      const key = `view-${String(index)}-co-${String(a)}-${String(b)}`;
      const value = el("span", undefined, String(cell.subjects));
      value.dataset.chartValue = key;
      td.append(
        value,
        " ",
        valueEvidence(
          key,
          `${String(req)} · ${String(other)}`,
          {
            key: {},
            value: cell.subjects,
            notRun: false,
            rows: cell.rows,
            runRows: [],
          },
          w,
        ),
      );
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(thead, tbody);
  const scroll = el("div", "cv-view-table");
  scroll.append(table);
  figure.append(scroll);
  return figure;
}

export function renderView(
  view: CheckedView,
  index: number,
  sha256: string,
  w: Words,
): HTMLElement {
  switch (view.view) {
    case "calendar":
      return renderCalendar(view, index, sha256, w);
    case "timeline":
      return renderTimeline(view, index, sha256, w);
    case "co-failure":
      return renderCoFailure(view, index, sha256, w);
    case "by-period":
      return renderByPeriod(view, index, sha256, w);
  }
}
