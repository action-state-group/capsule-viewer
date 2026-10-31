// SPDX-License-Identifier: BSD-3-Clause
/**
 * The chart renderer (capsule-viewer#82; docs/design/chart-spec.md section
 * 5): a checked chart (chart-spec.ts) drawn as inline SVG with DOM calls,
 * with its caption, the derived label and a text table of every group.
 *
 * Geometry is set as SVG attributes, never `style`, so the static page's CSP
 * needs no new hash. No producer text is drawn: every `title` in a spec is
 * ignored, axes are named by their field paths, and every other word is a
 * core wording key. The table is the chart's text alternative and what print
 * and a narrow screen fall back to; each value in it carries Show evidence
 * (the records it counts) or a label (acceptance 5a).
 */
import type { Words } from "./contract-report-wording.js";
import type {
  ChannelName,
  ChartGroup,
  CheckedChart,
  Scalar,
} from "./chart-spec.js";
import { OUTCOME_FRAME_VARS } from "./frame-tokens.generated.js";
import { numberAddress, recordAddress } from "./report-levels.js";

const SVG = "http://www.w3.org/2000/svg";
/** The chart section's marker attribute: the core's alone. */
export const CHART_ATTRIBUTE = "data-chart";

/** The charts' stylesheet: one of CORE_RUNTIME_STYLES, so the page's CSP lists its hash. */
export const CHART_CSS = `
.cv-charts{${OUTCOME_FRAME_VARS}max-width:1080px;margin:0 auto 16px;color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.cv-chart{margin:0 0 16px;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:#fff}
.cv-chart svg{display:block;width:100%;height:auto;max-height:280px}
.cv-chart figcaption{font-size:13px;color:var(--slate);margin:6px 0 8px}
.cv-chart .cv-chart-derived{display:inline-block;margin:0 0 8px;padding:2px 8px;border:1px solid var(--line);border-radius:8px;background:var(--cream);font-size:12px}
.cv-chart .cv-chart-no-runs{margin:0 0 8px;font-size:13px;color:var(--slate)}
.cv-chart .cv-chart-table{overflow-x:auto}
.cv-chart table{border-collapse:collapse;font-size:13px;min-width:100%}
.cv-chart caption{text-align:left;font-weight:600;margin:0 0 4px}
.cv-chart th,.cv-chart td{text-align:left;padding:3px 8px;border-top:1px solid var(--line);vertical-align:top}
.cv-chart td[data-not-run]{color:var(--slate);font-style:italic}
.cv-chart .cv-ev-label{font-size:12px;color:var(--slate)}
.cv-chart-refused{margin:0 0 16px;padding:10px 14px;border:1px solid var(--bad);border-radius:10px;background:var(--bad-l);font-size:14px}
@media print{.cv-chart{break-inside:avoid}}
.cv-view{margin:0 0 16px;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:#fff}
.cv-view figcaption{font-size:13px;color:var(--slate);margin:6px 0 8px}
.cv-view .cv-chart-derived{display:inline-block;margin:0 0 8px;padding:2px 8px;border:1px solid var(--line);border-radius:8px;background:var(--cream);font-size:12px}
.cv-view .cv-view-legend{margin:0 0 8px;padding:0;list-style:none;font-size:12px;color:var(--slate)}
.cv-view .cv-unplaced{margin:0 0 8px;font-size:13px;color:var(--slate)}
.cv-view .cv-view-table{overflow-x:auto;margin:0 0 8px}
.cv-view table{border-collapse:collapse;font-size:13px;min-width:100%}
.cv-view caption{text-align:left;font-weight:600;margin:0 0 4px}
.cv-view th,.cv-view td{text-align:left;padding:3px 8px;border:1px solid var(--line);vertical-align:top}
.cv-cal{table-layout:fixed;min-width:560px}
.cv-cal .cv-dn{font-weight:600;font-size:12px}
.cv-cal .cv-lane{margin:2px 0;overflow-wrap:anywhere}
.cv-cal td[data-not-run],.cv-period td[data-not-run]{color:var(--slate);font-style:italic;background:repeating-linear-gradient(45deg,var(--cream),var(--cream) 4px,#fff 4px,#fff 8px)}
.cv-view .cv-ev-label,.cv-view .cv-nr{font-size:12px;color:var(--slate)}
.cv-cal td[data-scale]{border-radius:6px}
.cv-cal td[data-scale=good],.cv-swatch[data-scale=good]{background:var(--ok-l);border-color:var(--ok)}
.cv-cal td[data-scale=some],.cv-swatch[data-scale=some]{background:var(--gold-l);border-color:var(--gold)}
.cv-cal td[data-scale=most],.cv-swatch[data-scale=most]{background:var(--bad-l);border-color:var(--bad)}
.cv-cal .cv-day-link{color:inherit;text-decoration:none}
.cv-cal .cv-day-link:hover,.cv-cal .cv-day-link:focus-visible{text-decoration:underline}
.cv-cal .cv-act{margin:2px 0;font-size:12px}
.cv-cal .cv-jdg{margin:2px 0 4px;font-size:11px;color:var(--slate)}
.cv-cal .cv-bar{display:block;width:100%;height:4px;border-radius:2px;overflow:hidden}
.cv-bar-good{fill:var(--ok)}.cv-bar-bad{fill:var(--bad)}.cv-bar-open{fill:var(--slate);fill-opacity:.45}
.cv-cal .cv-adj{margin-top:4px;padding:2px 4px;border-radius:4px;background:var(--person-l);color:var(--person);font-size:11px}
.cv-diamond{color:var(--person)}
.cv-view .cv-legend{display:flex;flex-wrap:wrap;gap:4px 18px;margin:8px 0;padding:0;list-style:none;font-size:12px;color:var(--slate)}
.cv-swatch{display:inline-block;width:12px;height:12px;border:1px solid var(--line);border-radius:3px;vertical-align:-2px}
.cv-day-section{margin:16px 0 0;padding-top:8px;border-top:1px solid var(--line)}
.cv-day-section h3{margin:0 0 6px;font-size:15px}
.cv-day-section .cv-k{margin:0 0 4px;font-size:12px;color:var(--slate)}
.cv-day-table{border-collapse:collapse;font-size:13px}
.cv-timeline{display:block;width:100%;min-width:560px;height:auto}
.cv-tl-text{font-size:11px;fill:var(--ink)}
.cv-tl-lane{font-family:ui-monospace,monospace}
.cv-tl-axis{stroke:var(--line);stroke-width:1}
.cv-tl-notrun{fill:var(--cream);fill-opacity:.9}
.cv-tl-mark{stroke-width:2}
path.cv-tl-mark{stroke:none}
line.cv-tl-good{stroke:var(--ok)}line.cv-tl-bad{stroke:var(--bad)}line.cv-tl-open{stroke:var(--slate)}
path.cv-tl-good{fill:var(--person)}path.cv-tl-bad{fill:var(--bad)}path.cv-tl-open{fill:var(--slate)}
.cv-tl-lists ul{margin:0 0 8px;padding-left:18px;font-size:13px}
.cv-tl-lists .cv-k{margin:6px 0 2px;font-size:12px;color:var(--slate)}
.cv-cofail{min-width:0}
.cv-cofail td[data-diagonal]{background:var(--person-l);font-weight:600}
.cv-cofail-total{margin:0 0 8px;font-size:13px}
@media print{.cv-view{break-inside:avoid}}
`;

// A fixed palette for series; the chart draws no colour from the spec.
const SERIES = [
  "#232F42",
  "#E8A33D",
  "#2E7D5B",
  "#B5462F",
  "#5B4BA0",
  "#6B7482",
];
const W = 640;
const H = 240;
const PAD = { left: 44, right: 12, top: 12, bottom: 36 };

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const scalarText = (value: Scalar | undefined): string =>
  value === undefined ? "" : String(value);

/** The distinct values of one key channel, in group order. */
function domainOf(chart: CheckedChart, name: ChannelName): Scalar[] {
  const out: Scalar[] = [];
  const seen = new Set<string>();
  for (const g of chart.groups) {
    const v = g.key[name];
    if (v === undefined) continue;
    const k = `${typeof v}:${String(v)}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

const same = (a: Scalar | undefined, b: Scalar | undefined): boolean =>
  a === b && typeof a === typeof b;

/** Draw the SVG. The table, not the picture, is the text alternative. */
function drawSvg(chart: CheckedChart, index: number): SVGElement {
  const root = svg("svg", {
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    "aria-hidden": "true",
    focusable: "false",
  });
  const hatchId = `cv-chart-hatch-${index}`;
  const defs = svg("defs", {});
  const pattern = svg("pattern", {
    id: hatchId,
    width: 6,
    height: 6,
    patternUnits: "userSpaceOnUse",
    patternTransform: "rotate(45)",
  });
  pattern.append(svg("rect", { width: 6, height: 6, fill: "#FAF8F4" }));
  pattern.append(
    svg("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 6,
      stroke: "#6B7482",
      "stroke-width": 2,
    }),
  );
  defs.append(pattern);
  root.append(defs);

  const xs = domainOf(chart, "x");
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = xs.length === 0 ? plotW : plotW / xs.length;
  const xAt = (v: Scalar | undefined): number =>
    PAD.left + band * xs.findIndex((x) => same(x, v));
  const values = chart.groups.flatMap((g) =>
    g.value === undefined ? [] : [g.value],
  );
  // The value axis spans 0 and every value: a sum can be negative.
  const min = Math.min(0, ...values);
  const max = Math.max(min === 0 ? 1 : 0, ...values);
  const yAt = (v: number): number =>
    PAD.top + (plotH * (max - v)) / (max - min);
  const zero = yAt(0);

  // Axes: the zero line, 0 and the extreme values, and the field paths.
  root.append(
    svg("line", {
      x1: PAD.left,
      y1: zero,
      x2: W - PAD.right,
      y2: zero,
      stroke: "#6B7482",
    }),
  );
  root.append(
    svg("line", {
      x1: PAD.left,
      y1: PAD.top,
      x2: PAD.left,
      y2: PAD.top + plotH,
      stroke: "#6B7482",
    }),
  );
  const label = (
    text: string,
    attrs: Record<string, string | number>,
  ): void => {
    const t = svg("text", { "font-size": 11, fill: "#1F2733", ...attrs });
    t.textContent = text;
    root.append(t);
  };
  if (chart.mark !== "rect") {
    label("0", { x: PAD.left - 4, y: zero + 4, "text-anchor": "end" });
    if (max !== 0)
      label(String(max), {
        x: PAD.left - 4,
        y: PAD.top + 10,
        "text-anchor": "end",
      });
    if (min !== 0)
      label(String(min), {
        x: PAD.left - 4,
        y: PAD.top + plotH,
        "text-anchor": "end",
      });
  }
  const every = Math.max(1, Math.ceil(xs.length / 8));
  xs.forEach((x, i) => {
    if (i % every !== 0) return;
    label(scalarText(x), {
      x: PAD.left + band * i + band / 2,
      y: PAD.top + plotH + 14,
      "text-anchor": "middle",
    });
  });
  label(chart.channels.x?.field ?? "", {
    x: PAD.left + plotW / 2,
    y: H - 4,
    "text-anchor": "middle",
    "font-family": "ui-monospace,monospace",
  });

  // Not-run units: a hatched band the plot's height, no mark in it.
  const notRunX = new Set(
    chart.groups.filter((g) => g.notRun).map((g) => scalarText(g.key.x)),
  );
  xs.forEach((x, i) => {
    if (!notRunX.has(scalarText(x))) return;
    const cell = svg("rect", {
      x: PAD.left + band * i,
      y: PAD.top,
      width: band,
      height: plotH,
      fill: `url(#${hatchId})`,
    });
    cell.setAttribute("data-not-run", scalarText(x));
    root.append(cell);
  });

  if (chart.mark === "rect") {
    const ys = domainOf(chart, "y");
    const rowH = ys.length === 0 ? plotH : plotH / ys.length;
    ys.forEach((y, j) =>
      label(scalarText(y), {
        x: PAD.left - 4,
        y: PAD.top + rowH * j + rowH / 2 + 4,
        "text-anchor": "end",
      }),
    );
    for (const g of chart.groups) {
      if (g.value === undefined) continue;
      const j = ys.findIndex((y) => same(y, g.key.y));
      root.append(
        svg("rect", {
          x: xAt(g.key.x) + 1,
          y: PAD.top + rowH * j + 1,
          width: Math.max(1, band - 2),
          height: Math.max(1, rowH - 2),
          fill: SERIES[0]!,
          "fill-opacity": (
            0.08 +
            (0.92 * (g.value - min)) / (max - min)
          ).toFixed(3),
        }),
      );
    }
    return root;
  }

  const series =
    chart.channels.color === undefined ? [undefined] : domainOf(chart, "color");
  const inSeries = (g: ChartGroup, s: Scalar | undefined): boolean =>
    s === undefined || same(g.key.color, s);
  series.forEach((s, k) => {
    const colour = SERIES[k % SERIES.length]!;
    const groups = chart.groups.filter((g) => inSeries(g, s));
    if (chart.mark === "bar") {
      const sub = band / series.length;
      for (const g of groups) {
        if (g.value === undefined) continue;
        root.append(
          svg("rect", {
            x: xAt(g.key.x) + sub * k + 1,
            y: Math.min(yAt(g.value), zero),
            width: Math.max(1, sub - 2),
            height: Math.abs(zero - yAt(g.value)),
            fill: colour,
          }),
        );
      }
      return;
    }
    // line and point: a line breaks at a not-run unit, never through it.
    let segment: string[] = [];
    const flush = (): void => {
      if (chart.mark === "line" && segment.length > 1)
        root.append(
          svg("polyline", {
            points: segment.join(" "),
            fill: "none",
            stroke: colour,
            "stroke-width": 2,
          }),
        );
      segment = [];
    };
    for (const g of groups) {
      if (g.value === undefined) {
        flush();
        continue;
      }
      const cx = xAt(g.key.x) + band / 2;
      const cy = yAt(g.value);
      segment.push(`${cx.toFixed(2)},${cy.toFixed(2)}`);
      root.append(
        svg("circle", {
          cx: cx.toFixed(2),
          cy: cy.toFixed(2),
          r: 3,
          fill: colour,
        }),
      );
    }
    flush();
  });
  return root;
}

/**
 * Show evidence for one charted value: the records it counts, each a link
 * to its entry in the core's records section, in the same shape as
 * report-levels.ts `evidenceAction` (so the core's "Cited by" lists read it
 * back). A value that counts no record carries the label instead.
 */
export function valueEvidence(
  key: string,
  name: string,
  group: ChartGroup,
  w: Words,
): HTMLElement {
  const ids = [
    ...new Set(
      group.rows.flatMap((r) => (r.recordId === undefined ? [] : [r.recordId])),
    ),
  ];
  if (ids.length === 0) {
    const label = el("span", "cv-ev-label", w.t("chart.evidence.none"));
    label.dataset.evidenceLabel = "none";
    label.dataset.evidenceFor = key;
    return label;
  }
  const details = document.createElement("details");
  details.className = "cv-ev";
  details.dataset.level = "2";
  details.id = numberAddress(key);
  details.dataset.evidenceFor = key;
  details.dataset.evidenceName = name;
  details.dataset.cites = ids.join(" ");
  details.append(el("summary", undefined, w.t("evidence.show")));
  const body = el("div", "cv-ev-body");
  body.append(el("p", "cv-ev-k", w.t("chart.evidence.records")));
  const list = el("ul", "cv-ev-list");
  for (const id of ids) {
    const item = el("li");
    item.dataset.cited = id;
    const link = el("a");
    link.setAttribute("href", `#${recordAddress(id)}`);
    link.append(el("code", undefined, id));
    item.append(link);
    list.append(item);
  }
  body.append(list);
  details.append(body);
  return details;
}

/**
 * One checked chart as a figure: the SVG, the caption (population and
 * window), the derived label, and the table of every group.
 */
export function renderChart(
  chart: CheckedChart,
  index: number,
  sha256: string,
  w: Words,
): HTMLElement {
  const figure = el("figure", "cv-chart");
  figure.setAttribute(CHART_ATTRIBUTE, String(index));
  figure.dataset.chartSha256 = sha256;
  figure.append(drawSvg(chart, index));
  const caption = el("figcaption");
  const population = w.p("chart.population", chart.population);
  caption.textContent =
    chart.window === undefined
      ? population
      : `${population} · ${w.t("chart.window", { from: chart.window.from, to: chart.window.to })}`;
  figure.append(caption);
  figure.append(el("p", "cv-chart-derived", w.t("chart.derived")));
  // A time axis that cannot say "not run" says so: a unit without rows reads
  // 0 whether or not anything ran (a plan with no window node, or several).
  if (chart.temporal !== undefined && !chart.runs) {
    const note = el("p", "cv-chart-no-runs", w.t("chart.no_runs"));
    note.dataset.chartNoRuns = "";
    figure.append(note);
  }

  const wrap = el("div", "cv-chart-table");
  const table = el("table");
  table.append(el("caption", undefined, w.t("chart.table.caption")));
  const head = el("tr");
  for (const name of chart.keys) {
    const th = el("th");
    th.setAttribute("scope", "col");
    th.append(el("code", undefined, chart.channels[name]!.field!));
    head.append(th);
  }
  const agg = chart.channels[chart.aggregate]!;
  const valueHead = el("th");
  valueHead.setAttribute("scope", "col");
  if (agg.aggregate === "sum") {
    valueHead.append(`${w.t("chart.sum")} `, el("code", undefined, agg.field!));
  } else valueHead.textContent = w.t("chart.count");
  head.append(valueHead);
  const thead = el("thead");
  thead.append(head);
  const tbody = el("tbody");
  chart.groups.forEach((g, i) => {
    const row = el("tr");
    for (const name of chart.keys)
      row.append(el("td", undefined, scalarText(g.key[name])));
    const cell = el("td");
    if (g.notRun) {
      cell.dataset.notRun = "";
      cell.textContent = w.t("chart.not_run");
    } else {
      const key = `chart-${index}-${i}`;
      const name = chart.keys.map((k) => scalarText(g.key[k])).join(" · ");
      const value = el("span", undefined, String(g.value));
      value.dataset.chartValue = key;
      cell.append(value, " ", valueEvidence(key, name, g, w));
    }
    row.append(cell);
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrap.append(table);
  figure.append(wrap);
  return figure;
}

/** A chart the page refused to draw: the core's notice, never the chart. */
export function renderChartRefused(
  index: number,
  reason: string,
  w: Words,
): HTMLElement {
  const note = el("p", "cv-chart-refused", w.t("chart.refused", { reason }));
  note.setAttribute(CHART_ATTRIBUTE, String(index));
  note.dataset.chartRefused = reason;
  return note;
}

/** The charts section: a stylesheet and one figure (or notice) per spec, in order. */
export function renderCharts(parts: readonly HTMLElement[]): HTMLElement {
  const section = el("section", "cv-charts");
  section.dataset.section = "charts";
  const style = document.createElement("style");
  style.textContent = CHART_CSS;
  section.append(style, ...parts);
  return section;
}
