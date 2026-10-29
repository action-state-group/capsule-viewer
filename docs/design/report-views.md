# Calendar and by-period views over the daily runs (design note)

Status: design for capsule-viewer#120. Builds on `docs/design/chart-spec.md`
(capsule-viewer#82, released in 0.4.0); read that first. Nothing here changes
the dataset contract of agent-action-capsule#443.

A Terms Pack month page needs two shapes the chart module does not draw: a
**calendar** (a Mon to Sun month, a cell per day) and a **by-period** table
(not met, by requirement and week). Both read the sealed dataset of the
monthly Result: its daily run records and its cases.

## Sources

| Ref | Where | What it fixes |
| --- | --- | --- |
| [120] | capsule-viewer#120 body and How ack (issuecomment-6463852182) | owner capsule-viewer; lanes come from the pack, never typed in the viewer; `out_of_scope` and `not_yet_in_force` in their own columns, never counted as met; "not run", never zero; each cell links to its evidence |
| [82] | `docs/design/chart-spec.md` | the checker, "not run", the dataset, Show evidence, the core's words |
| [daily] | capsule-viewer#82 comment 6500951953 (2026-10-29) | a monthly bundle carries its daily runs as a neutral run record type, not as `evidence_result` records |
| [brief] | Terms Pack engineering brief step 3 (2026-10-27) | Calendar4 and EUAcross5 boards |

## 1. The run record type: `daily_run`

[daily] left the name open for this item and evidencebook#107's producer. It is
**`daily_run`**, the name chart-spec.md already uses for its vectors and
golden. It is a `record_type` value, which agent-action-capsule treats as a
free string (the dataset plan's `record_types` list names it; no registry
holds the values), so it needs **no AAC REGISTRY entry and no one-way door
for Steven**. It carries no company business term. The viewer never names
it: a view reads it from the spec's `runs.filter` (chart-spec.md section 3),
so a pack that calls the record something else works unchanged.

evidencebook#107 built the dataset side only (`book result build --plan`).
Nothing in evidencebook yet appends `daily_run` records or compiles a pack's
lanes into specs. That is a separate evidencebook item, filed from this one.
Until it lands the goldens use a bundle the test sealer builds from literal
headers, as #82 did.

## 2. The shape: a view is chart specs laid out

The viewer does not get a second checker. A view is a **list of ordinary chart
specs** (chart-spec.md section 2), each checked by `checkChart` unchanged,
plus a layout. Every number a cell shows is a group `checkChart` recomputed
from the rows. A view adds only the rules that make the specs fit one grid.

A view is an entry of the existing `charts` setting, told from a chart spec by
its `view` member (a chart spec has `$schema`). No new builder setting, no new
packaging rule: `fragment` still reports `fragment-has-charts`, `static` draws
views at build time, `html` checks and draws them in the page runtime, and the
"How this page was checked" section states the SHA-256 of each entry.

```json
{ "view": "calendar",
  "lanes": [ { "id": "activity", "chart": { ...chart spec... } },
             { "id": "judgment", "chart": { ...chart spec... } } ] }

{ "view": "by-period",
  "count":   { "id": "not_met", "chart": { ...chart spec... } },
  "columns": [ { "id": "out_of_scope", "chart": { ... } },
               { "id": "not_yet_in_force", "chart": { ... } } ] }
```

Members are closed: any other member is refused (`view-unsupported-member`,
with its JSON pointer). `id` matches `^[a-z][a-z0-9_]{0,31}$` and is unique in
the view; the page draws it as code, like an axis field, never as a title. The
pack's `presentation.json` (compiled by evidencebook's `pack_compile.py`)
declares the lanes and columns; the pack compiler emits the entries. A lane the
pack doesn't declare is not drawn, because the viewer holds no lane list.

This is a **public format, a one-way door** in the sense of the #82 How ack.
Per asg-rules it is engineering's call (an additive page format with no new
product meaning and no spec text), recorded here with Sherlock2's door
confirmation. Widening the members later is additive; narrowing is a break.

### What each constituent chart must be

After `checkChart` passes, the view checks the checked chart (`CheckedChart`):

- a temporal `x` in the unit `utcyearmonthdate`, so each group is one UTC
  day (`view-chart-shape`);
- `runs: true`: the plan has exactly one window node and the chart states
  `runs`. A view is refused on a plan that cannot say "not run"
  (`view-runs-unsealed`), because a calendar that reads 0 for a day nothing
  ran is the failure #120 exists to remove;
- the aggregate is `count` (`view-chart-shape`);
- at most one key channel besides `x`. A calendar lane has none (a bar of
  counts per day) or one (a `rect` of day by value, for example the day's
  judgment). A by-period chart has exactly one, the requirement
  (`view-chart-shape`).

Across the charts of one view: the same `window` (`view-window-mismatch`) and
the same `runs` filter and field (`view-runs-mismatch`), so every lane agrees
on which days ran. A calendar's window is whole calendar months, because the
grid draws whole months (`view-window-not-months`). A by-period's window is any
window the charts agree on.

A refusal from `checkChart` is the view's refusal with the chart's own reason
and the chart's id in the message: one table of reasons for charts and views.

**By-period never counts a row twice.** The rows of `count` and of each
`columns` chart must be disjoint (`view-overlap`, naming the first shared
`seq`). A row counted as not met and also as `out_of_scope` is a producer
error. Because the `count` chart selects its verdict by `transform`, an
`out_of_scope` or `not_yet_in_force` row cannot reach the not-met cells; the
check keeps it that way when a pack edit widens a filter. No cell is ever
"met": the view has no such column.

## 3. Drawing

### Calendar

One `<table class="cv-cal">` per month in the window, Monday first. Padding
days outside the month are empty cells. A cell holds the day (`DD`) and:

- **a day that ran:** for each lane, in lane order, the lane id as code and the
  day's groups from that lane's chart: the count, or `key × count` for a lane
  with a key channel (a day with one `daily_run` whose `statement.judgment` is
  `not_met` draws `not_met × 1`). A lane with no group that day reads `0`,
  which `checkChart` has already shown means "ran, nothing matched" because
  the day ran. Each count carries Show evidence (chart-spec.md section 5,
  `valueEvidence`): the records it counts as links into the core's records
  section, or the `chart.evidence.none` label for a 0. That is the cell's link
  to its side-by-side.
- **a day that did not run:** the cell is hatched, reads `chart.not_run`, and
  draws no lane. The same days are not run in every lane (`view-runs-mismatch`),
  so one mark covers the cell.

The table is the text alternative, so there is no hidden SVG. Print keeps the
table; at 390 px it scrolls inside its own container (the same wrapper the
chart table uses). Weekday headers are core words.

### By-period

One `<table class="cv-period">`. Rows are the requirements: the union of the
`y` domains of all the view's charts, sorted. Columns, in order:

1. the requirement field, as code;
2. one column per Monday-start UTC week that has a day in the window, headed
   `period.week` ("Week of 2026-09-07", the week's Monday, which may fall
   before the window on the first week). Each cell is the `count` chart's sum
   over that week's days **that ran**; the cell also reads `period.not_run_days`
   ("2 days not run") when some of the week's days in the window did not run,
   and reads `chart.not_run` instead of a number when none of them ran;
3. one column per `columns` entry, headed by its id as code, holding the
   window total for that requirement from that chart (sum over run days).

`out_of_scope` and `not_yet_in_force` are therefore columns of their own and
are not in any week cell. A week cell and a column total carry Show evidence
(the union of the records of the groups they sum).

A week that straddles the window edge is one column with the days it has
inside the window. The cell never counts a day outside the sealed window.

### Words

Every new string is a core word, locked like the `chart.*` entries
(`LOCKED_ENTRIES`), and is public text for Sherlock2:

| Key | String |
| --- | --- |
| `calendar.weekday.1` to `.7` | `Mon` `Tue` `Wed` `Thu` `Fri` `Sat` `Sun` |
| `period.week` | `Week of {date}` |
| `period.not_run_days.one` / `.other` | `{n} day not run` / `{n} days not run` |

Reused: `chart.not_run`, `chart.window`, `chart.derived`,
`chart.population.*`, `chart.evidence.*`, `chart.refused`. A view carries the
derived label once, and a caption with its window and the number of records
its charts count together. `chart.refused` names a view's reason the same way;
the reasons are `view-*` strings or a chart reason.

## 4. Packagings and the Go twin

`html`, `embedded` and `static` draw views like charts. `fragment` is
unavailable (`fragment-has-charts`). Go's offline builder checks `charts`
entries with `go/chartspec`; an entry with a `view` member is not a chart spec
there and is refused (`chart-unsupported-member`), so a Go-built page can never
draw a view unchecked. The Go twin of the view checks is not in this item; the
browser runtime draws views on Go-built pages once Go accepts them. It is filed
as a follow-up (needs `go/chartspec` to read `view`).

## 5. Tests

Fixtures are literal objects (`ts/test/helpers/view-fixtures.ts`), a pure
function of that file, sealed into a committed VALID bundle by the test sealer
as #82's golden is (`ts/test/testdata/views/`). The book: September 2026, a
`daily_run` on 28 of 30 days dated by `event_time_claim`, each with
`statement.judgment`; case records carrying `statement.requirement` and
`statement.verdict`, among them `out_of_scope` and `not_yet_in_force`; and an
adjudication record on some days. A second month (an EU-shaped book with
different lane ids) shows the layout is the pack's.

- **Goldens** (byte for byte in CI): the calendar and the by-period section of
  the sealed page, from the committed bundle and committed view specs.
- **Negative, the day with no daily run:** the 2026-09-10 cell reads
  "Not run", not `0`, in every lane, and the old rendering (a view that counted
  the day as `0`, here the spec's own stated values) is refused by
  `chart-aggregate-mismatch`.
- **A week column:** one week with a not-run day reads its sum plus "1 day not
  run"; a week fully not run reads "Not run" and never `0`.
- **Refusals**, one case each, every negative naming the positive it changes:
  `view-unsupported-member`, `view-chart-shape` (a month unit, two key channels
  on a lane, a `sum`), `view-runs-unsealed`, `view-runs-mismatch`,
  `view-window-mismatch`, `view-window-not-months`, `view-overlap`, a
  constituent chart that fails its own check (`chart-field-missing` on a view
  field absent from the dataset), a view with no dataset (`chart-no-dataset`).
- **Pages:** html (checked and drawn), static (drawn at build time, passes
  `static-carries-script`), fragment (unavailable), a failed bundle (no L1),
  and a mismatching view (notice, never the table).
- **5a:** every nonzero cell value has Show evidence whose records are in the
  core's records section; every zero has the `none` label.
- **Go:** an entry with `view` is refused by `go/chartspec`.
- **Browser:** the calendar and the table, scripts on and off, print and 390 px,
  no CSP violation.
