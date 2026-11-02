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
specs** (chart-spec.md section 2), each checked by `checkChart`, plus a layout.
Every number a cell shows is a group `checkChart` recomputed from the rows. A
view adds only the rules that make the specs fit one grid. The one change to
`checkChart` is additive: `CheckedChart.units`, a temporal chart's every unit
in order with whether it was not run. A chart whose other key channel has no
value after `transform` has no groups, so without `units` its days would not
say which ran (a month with no not-met cases would draw blanks where the
weeks read "Not run").

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
- exactly one key channel besides `x` in a by-period chart, the requirement:
  `y` on a `rect`, `color` on a `bar`, `line` or `point`. The view reads it as
  "the key channel that is not `x`", not as `y`. A calendar lane has none (a
  bar of counts per day) or that one (a `rect` of day by value, for example
  the day's judgment). The subset allows no more than one, so the lane rule
  needs no check of its own.

Across the charts of one view: **the same days not run**
(`view-runs-mismatch`), compared unit by unit from `units`, so every lane
agrees on which days ran even when two lanes name different `runs.filter`
predicates. A view needs no check that the windows agree: it needs a plan with
exactly one window node, and `checkChart` already holds every chart's window
to the sealed one. A by-period's charts all group by **one field**
(`view-chart-shape`, naming both fields): the rows of its table are the union
of their values, and two vocabularies in one row would draw a wrong figure. A
calendar's window is whole calendar months, because the grid draws whole
months (`view-window-not-months`); it is reachable when the sealed window is
not (a Terms Pack month sealed from the 2nd).

A refusal from `checkChart` is the view's refusal with the chart's own reason
and the chart's id in the message: one table of reasons for charts and views.

**By-period never counts a row twice.** The rows of `count` and of each
`columns` chart must be pairwise disjoint (`view-overlap`, naming the first
shared `seq`): a row counted as not met and also as `out_of_scope` is refused.
The guarantee is "disjoint across the charts the view declares". It does not
say a pack declared the right columns: `columns` may be empty, and a pack that
leaves `out_of_scope` out of it and out of `count`'s filter simply does not
show those rows. No cell is ever "met": the view has no such column, and the
`count` chart selects its verdict by `transform`.

**Which date puts a row in a day or a week.** The chart's `x` field, a
producer-set date such as `event_time_claim` (chart-spec.md section 4: never
`committed_at`). The How ack on #120 said a week by the subject's
`committed_at`; that is replaced, in the same comment thread, by this rule, so
a backfilled record lands in the week it is about, not the week it was
written. All days and weeks are UTC, and the caption says so (`chart.window`
ends "(UTC)").

## 3. Drawing

### Calendar

One `<table class="cv-cal">` per month in the window, Monday first. Padding
days outside the month are empty cells. A cell holds the day (`DD`) and:

- **a day that ran:** for each lane, in lane order, the lane id as code and the
  day's nonzero groups from that lane's chart: the count, or `key × count` for
  a lane with a key channel (a day with one `daily_run` whose
  `statement.judgment` is `not_met` draws `not_met × 1`, and `met × 0` is not
  drawn). A lane with no nonzero group that day reads a single `0`, which
  `checkChart` has shown means "ran, nothing matched" because the day ran.
  Each count carries Show evidence (chart-spec.md section 5, `valueEvidence`,
  exported and called with the group): the records it counts as links into the
  core's records section, or the `chart.evidence.none` label for a 0. That is
  the cell's link to its side-by-side.
- **a day that did not run:** the cell is hatched, reads `chart.not_run`, and
  draws no lane. The same days are not run in every lane (`view-runs-mismatch`),
  so one mark covers the cell. A record dated on such a day (chart-spec.md
  keeps it in the population) is in no cell, so the view says so once, under
  its legend: `view.unplaced` ("2 records are dated on days that did not run,
  so they are in no cell"), counting distinct records by `seq`.

The table is the text alternative, so there is no hidden SVG. Print keeps the
table; at 390 px it scrolls inside its own container (the same wrapper the
chart table uses). Weekday headers are core words.

### By-period

One `<table class="cv-period">`. Rows are the requirements: the union of the
values of each chart's key channel besides `x`, sorted as the checker sorts a domain, with their types kept (the charts must agree on one type). Columns, in order:

1. the requirement field, as code;
2. one column per Monday-start UTC week that has a day in the window, headed
   `period.week` ("Week of 2026-09-07", the week's Monday, which may fall
   before the window on the first week). Each cell is the `count` chart's sum
   over that week's days **that ran**; the cell also reads `period.not_run_days`
   ("2 days not run") when some of the week's days in the window did not run,
   and reads `chart.not_run` instead of a number when none of them ran. A
   requirement with no group in a week that ran reads `0` with the `none`
   label;
3. one column per `columns` entry, headed by its id as code, holding the
   window total for that requirement from that chart (sum over run days). It
   carries `period.not_run_days` for the days of the whole window that did not
   run, and reads `chart.not_run` when no day in the window ran.

`out_of_scope` and `not_yet_in_force` are therefore columns of their own and
are not in any week cell. A week cell and a column total carry Show evidence
(the union of the records of the groups they sum, as one synthetic group).

A week that straddles the window edge is one column with the days it has
inside the window. The cell never counts a day outside the sealed window.

### Calendar cells, timeline and co-failure (capsule-viewer#172, Steven's Terms Pack frames 2 and 11)

Status: additive members of the same public format. A door of the kind this
note already records (an additive page format with no new product meaning, no
spec text): engineering's call, with Sherlock2's door confirmation.

**Lane `role` and `classes` (calendar).** A calendar lane may carry `role`
(`activity`, `judgment`, `adjudication`, each on at most one lane) and, on a
keyed lane, `classes`: each value of the key channel, by its text, to `good`,
`bad` or `open`. A calendar with any `role` draws the canvas's cell; with none
it draws the lane list above, unchanged. A value with no class is refused
(`view-lane-role`): a value that counted as nothing would be a figure the page
made up. The viewer holds no list of values: the pack declares which verdicts
are good, bad or open.

The cell, from the checked groups alone: the day (a link to its section), the
activity lane's count, `judged · {good} · {bad}` (plus `{open}` when there are
some) from the judgment lane, a bar of those three shares (SVG widths) and, from
the adjudication lane, `◆ {n} recorded · all concur` or `· {k} differs` (the
lane's `good` values concur, its `bad` values differ; a lane with no `classes`
states only the count). The cell is green when at most one judged case is not
good and most are good, red when more than half are bad, and amber otherwise
(one judged case that was not met is red); a day with no judged
case is uncoloured. The legend states the three colours and the diamond. Each
day that ran has a section under the grid: the heading (weekday, month, day,
count, judged), the lanes' counts with Show evidence, and a table of the
activity lane's records (time in UTC from the chart's time field, and a link to
the record in the bundle). A day that did not run has no section and is not a
link. The nouns and verbs (`calendar.activity`, `calendar.class.*`,
`calendar.adj.*`, `calendar.legend.*`) are wording-pack words: the default packs
say "cases", "met" and "not met", and a pack such as Terms Pack's overrides
them ("conversations", "resolved", "missed").

**`timeline`.** `{"view": "timeline", "lanes": [{"id", "chart", "mark",
"classes"?}]}`: the same lane charts (a count per UTC day, at most one key
channel), each drawn as a row of marks on one shared day axis, `mark` being
`tick` (a bar whose height is the count, capped) or `diamond`. A mark's colour
is its value's class. Days that did not run are hatched across every lane. The
SVG is aria-hidden; the text alternative is each lane's list of days and counts
with Show evidence. A lane's label is the wording pack's `lane.<id>.title`
when it has one, else the id as code.

**`co-failure`.** `{"view": "co-failure", "count": {"id", "chart"}, "subject":
"<field path>"}`: the chart is a by-period `count` chart (one key channel, the
requirement, over the failing rows). `subject` names the field on each row that
says which session or conversation it belongs to. The viewer recomputes the
matrix from those rows: cell (a, b) is the number of distinct subjects with a
row in both requirement a and requirement b, the diagonal is the subjects
failing that requirement, and each cell carries Show evidence for the records
it counts. A row with no subject is refused (`view-chart-shape`).

**Not drawn, because no record carries it** (filed as producer gaps on
capsule-viewer#172): spans with a duration (the "routed to a person" lane's
resolution minutes) need a start and end per record; per-case columns in the
day section (request, per-requirement squares, band, outcome, card) need the
case's own fields; "judged Oct 30 02:00" needs the daily run's time; lane
titles beyond a wording pack's. Voice follows Sherlock2: the words above are
second person in the holder's own preview and third person when shared, set by
the wording pack the page is built with.

### Words

Every new string is a core word, locked like the `chart.*` entries
(`LOCKED_ENTRIES`), and is public text for Sherlock2:

| Key | String |
| --- | --- |
| `calendar.weekday.1` to `.7` | `Mon` `Tue` `Wed` `Thu` `Fri` `Sat` `Sun` |
| `period.week` | `Week of {date}` |
| `period.not_run_days.one` / `.other` | `{n} day not run` / `{n} days not run` |
| `view.unplaced.one` / `.other` | `{n} record is dated on a day that did not run, so it is in no cell` / `{n} records are dated on days that did not run, so they are in no cell` |

Reused: `chart.not_run`, `chart.window`, `chart.derived`,
`chart.population.*`, `chart.evidence.*`, `chart.refused`. A view carries the
derived label once, a caption with its window, and a legend with each chart's
id as code and its own population (`chart.population.*`); there is no total,
because two lanes that count the same record would add it twice. A month is
drawn as its ISO `YYYY-MM` in the table caption, which needs no word. `chart.refused` names a view's reason the same way;
the reasons are `view-*` strings or a chart reason.

## 4. Packagings and the Go twin

`html`, `embedded` and `static` draw views like charts. `fragment` is
unavailable (`fragment-has-charts`). Go's offline builder checks each `charts`
entry with `go/chartspec`: a chart spec with `Check`, an entry with a `view`
member with `CheckView`, the Go twin of `ts/src/report-view.ts`
(capsule-viewer#156). Both implementations run the shared vectors in
`vectors/view-spec/`, so a Go-built page carries a view only when the same
refusals that stop the TypeScript builder passed, and the browser runtime
draws it. `Check` itself still refuses a view entry
(`chart-unsupported-member`), so a caller that does not route by `IsView`
never draws a view unchecked.

## 5. Tests

Fixtures are literal objects (`ts/test/helpers/view-fixtures.ts`), a pure
function of that file, sealed into a committed VALID bundle by the test sealer
as #82's golden is (`ts/test/testdata/views/`). The book: September 2026, a
`daily_run` on 26 of 30 days dated by `event_time_claim`, each with
`statement.judgment`; case records carrying `statement.requirement` and
`statement.verdict`, among them `out_of_scope` and `not_yet_in_force`; and an
`adjudication` record on every sixth day. The calendar declares three lanes
(`activity`, `judgment`, `adjudications`, as #120 asks for the day's
activity, judgment and adjudications), so the third is under test. The days not
run are the 10th (a Thursday) and the 28th to 30th (the last partial week, fully
not run), so a mixed week and a fully not-run week are both golden. A case on
each of the 10th, 28th and 30th and an adjudication on the 30th sit on days that did not
run (the 29th has none):
`view.unplaced` reads 4. The lane ids and requirements are a fixture's, not
the viewer's: a second pack with other ids needs no code change.

- **Goldens** (byte for byte in CI): the calendar and the by-period section of
  the sealed page, from the committed bundle and committed view specs.
- **Negative, the day with no daily run:** the 2026-09-10 cell reads
  "Not run", not `0`, in every lane, and the old rendering (a view that counted
  the day as `0`, here the spec's own stated values) is refused by
  `chart-aggregate-mismatch`.
- **A week column:** the week of the 7th reads its sum plus "1 day not run"; the
  week of the 28th is fully not run and reads "Not run", never `0`. A column
  total carries "4 days not run".
- **Refusals**, one case each, every negative naming the positive it changes:
  `view-unsupported-member`, `view-chart-shape` (a month unit, a `sum`, a
  keyless chart in a by-period, charts grouping by different fields),
  `view-runs-unsealed` (a plan with no window node), `view-runs-mismatch`
  (two lanes naming different run records), `view-window-not-months` (a plan
  sealed from the 2nd), `view-overlap`, a constituent chart that fails its own
  check (`chart-field-missing` on a view field absent from the dataset), a view
  with no dataset (`chart-no-dataset`). A bar keyed by `color` as the
  requirement draws the same table as the `rect` keyed by `y`; a keyed lane
  that matches nothing reads `0` on every day that ran; a requirement field
  holding more than one type is refused (`view-chart-shape`). A chart's own
  refusal keeps its pointer, prefixed with the entry's (`/lanes/1/chart/...`).
- **Pages:** html (checked and drawn), static (drawn at build time, passes
  `static-carries-script`), fragment (unavailable), a failed bundle (no L1),
  and a mismatching view (notice, never the table).
- **5a:** every nonzero cell value has Show evidence whose records are in the
  core's records section; every zero has the `none` label.
- **Shared vectors** (`vectors/view-spec/`, capsule-viewer#156): the positives
  of every view kind and a negative per refusal above, each naming its base,
  generated from the fixtures above and run by `ts/test/view-spec-vectors.test.ts`
  and by `go/chartspec`. A vector states the reason and the pointer a refusal
  carries, and, for a view that draws, each chart's recomputed values and the
  co-failure matrix.
- **Go:** `go/emitter` builds a page from the committed bundle and view entries
  and carries every kind; a failing view refuses the build.
- **Empty category domain:** a by-period month with no not-met cases still
  reads "Not run" on the weeks no run covered (`units`).
- **Browser:** the calendar and the table, scripts on and off, print and 390 px,
  no CSP violation.
