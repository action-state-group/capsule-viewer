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
import type {
  ChartGroup,
  CheckedChart,
  ChartRow,
  Scalar,
} from "./chart-spec.js";
import { CHART_ATTRIBUTE, valueEvidence } from "./chart-view.js";
import type {
  CheckedByPeriod,
  CheckedCalendar,
  CheckedView,
  ViewChart,
} from "./report-view.js";

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
  const shown = counted.length > 0 ? counted : groups.slice(0, 1);
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
      } else
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
  const requirements = [
    ...new Set(
      parts.flatMap((p) =>
        p.chart.groups.map((g) => scalarText(g.key[keyOf(p.chart)])),
      ),
    ),
  ].sort();
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
    requirement: string,
    days: ReadonlySet<string> | undefined,
  ): Sum => {
    const sum: Sum = { value: 0, rows: [] };
    for (const g of chart.groups) {
      if (scalarText(g.key[keyOf(chart)]) !== requirement || g.notRun) continue;
      if (days !== undefined && !days.has(g.key.x as string)) continue;
      sum.value += g.value ?? 0;
      sum.rows.push(...g.rows);
    }
    return sum;
  };
  const tbody = el("tbody");
  for (const requirement of requirements) {
    const tr = el("tr");
    tr.dataset.requirement = requirement;
    const th = el("th", undefined, requirement);
    th.setAttribute("scope", "row");
    tr.append(th);
    for (const monday of mondays) {
      const week = weeks.get(monday)!;
      const td = el("td");
      td.dataset.week = monday;
      if (week.notRun.size === week.days.length) {
        td.dataset.notRun = "";
        td.textContent = w.t("chart.not_run");
      } else {
        const key = `view-${String(index)}-${requirement}-${monday}`;
        const live = new Set(week.days.filter((d) => !week.notRun.has(d)));
        const sum = sumOver(view.count.chart, requirement, live);
        const value = el("span", undefined, String(sum.value));
        value.dataset.chartValue = key;
        td.append(
          value,
          " ",
          valueEvidence(key, `${requirement} ${monday}`, groupOf(sum), w),
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
    }
    for (const col of view.columns) {
      const td = el("td");
      td.dataset.column = col.id;
      if (windowNotRun === windowDays) {
        td.dataset.notRun = "";
        td.textContent = w.t("chart.not_run");
      } else {
        const key = `view-${String(index)}-${requirement}-${col.id}`;
        const sum = sumOver(col.chart, requirement, undefined);
        const value = el("span", undefined, String(sum.value));
        value.dataset.chartValue = key;
        td.append(
          value,
          " ",
          valueEvidence(key, `${requirement} ${col.id}`, groupOf(sum), w),
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
    }
    tbody.append(tr);
  }
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
  return view.view === "calendar"
    ? renderCalendar(view, index, sha256, w)
    : renderByPeriod(view, index, sha256, w);
}
