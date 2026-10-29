# Charts from a declarative spec, checked against the dataset (design note)

Status: implemented for capsule-viewer#82 (`ts/src/chart-spec.ts`,
`chart-dataset.ts`, `chart-view.ts`; `go/chartspec`; vectors
`vectors/chart-spec/`). Section 4 follows the dataset contract as merged in
agent-action-capsule#443 (8c673d1).

Every chart on a report page comes from a chart spec, which is data. The
viewer checks the spec against the dataset the report was built from, refuses
the build on any mismatch, and draws the chart with its own code as SVG. No
script from the spec or its author reaches the page.

## Sources

| Ref | Where | What it fixes |
| --- | --- | --- |
| [82] | capsule-viewer#82 body and How ack (issuecomment-6399494886) | acceptance 1 to 5; owner capsule-viewer; a closed Vega-Lite subset; the format is a door, confirmed as engineering's call by Sherlock2 (buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=da697be1652f79095bfe2709c5f546eed7dcd41f22e3164e5ab5237eb937ef7f); a spec is never carried in a bundle |
| [107] | evidencebook#107 and Steven's 10-27 ruling on it | optional Result members `plan_ref` and `dataset_ref`; the dataset row format is defined in one AAC spec PR, "for example JCS rows of committed record refs" |
| [pb] | `spec/presentation-builder-v0.md` §1.1, §2.2 and §2.4 (main 9213caa) | availability reasons; the fragment payload rejects unknown members; the static page is the `html` page rendered at build time by the TS modules; `static-carries-script`; CSP `script-src 'none'`; there is no Go twin of the rendering |
| [brief] | Terms Pack engineering brief (2026-10-27), Calendar4 / EUAcross5 row and order of work step 3 | the calendar reads cited daily Results; "a day with no daily Result renders 'not run', never zero" |
| [120] | capsule-viewer#120 How ack | the `calendar` and `by-period` modules are #120's. Their cell specs are checked by this note's checker |

## 1. Where the spec lives and how each packaging carries it

A chart spec is a build input, like a wording pack. It comes from the pack (or,
for an ad-hoc report, from the agent that wrote the plan). It is never a
member of the bundle [82]. The builder takes a new setting, `charts`: an
ordered list of specs. The page draws them in L1, under the core strip
(capsule-viewer#81), in that order. The "How this page was checked" section
states each spec's SHA-256.

| Packaging | Carries |
| --- | --- |
| `html` (TS and Go) | the specs as one JSON data element beside the wording pack. The page runtime checks and draws them |
| `embedded` | the same data element in the host element |
| `static` | the drawn SVG and its table, with no spec element. The digests are stated in text |
| `fragment` | nothing: a build with `charts` is unavailable for `fragment`, with a new reason `fragment-has-charts`. A reader gets the charts from the `html` or `static` packaging. Carrying specs would need a new member in `aac.presentation-fragment/v0` and would spend the link budget, which v0 doesn't need |

The new setting and the new reason change `spec/presentation-builder-v0.md`
(§1 and the §1.1 table) in the same PR as the code.

## 2. The format: a closed Vega-Lite v5 subset

A spec is a valid Vega-Lite v5 document. The vectors are validated against the
pinned Vega-Lite v5 JSON schema in CI, as a dev-only step. A producer can
preview a spec in standard tools, but the preview is not the rendered output:
the captions, the table, the "not run" cells and the labels are the viewer's.

The viewer accepts only the members below. Any other member, at any depth,
refuses the build (`chart-unsupported-member`, naming the JSON pointer). This
list is the one-way door [82] records. Widening it later is additive.
Narrowing it is a break.

| Member | Accepted values |
| --- | --- |
| `$schema` | exactly `https://vega.github.io/schema/vega-lite/v5.json` |
| `data` | `{"name": "dataset"}` only. No `url`, no `values`, no `sequence` |
| `mark` | `bar`, `line`, `point`, `rect`, as a string or `{"type": ...}` with no other key |
| `transform` | a list of `{"filter": P}`. P is a field predicate (`equal` or `oneOf` over strings, numbers and booleans, or `range` of two UTC DateTime objects `{year, month, date, utc: true}` with `timeUnit: "utcyearmonthdate"`) or `and` / `or` / `not` of them. Never an expression string |
| `encoding.x`, `.y`, `.color` | `field`, `type` (`quantitative`, `ordinal`, `nominal`, `temporal`), `aggregate` (`count`, which names no field, or `sum`, both `quantitative`), `timeUnit` (`utcyearmonthdate`, `utcyearmonth`), required on a temporal field and only there. At most one channel is temporal. `title` is accepted and ignored |
| `usermeta.capsule` | the statement the checker holds the chart to (section 3) |
| `title`, `description` | accepted and ignored |

Exactly one channel aggregates: `y` for `bar`, `line` and `point`, and `color`
for `rect`. A spec with no aggregate, or with two, is refused
(`chart-aggregate-shape`). Raw point plots are left out of v0.

Refused by construction: `params`, signals, selections, `calculate`, `lookup`,
`href`, `tooltip`, any `transform` other than `filter`, any `expr` member, any
string that Vega would evaluate, local (non-`utc`) time units, week units, `mean`, `min`,
`max` and other aggregates, and `layer`, `concat`, `facet` and `repeat`. A
chart that needs a ratio shows both counts, following Steven's ruling against
a single figure.

The page never draws producer text. Every `title` is ignored. Axes are named
by their field paths, shown as code, and every other word is a core wording
key (section 5).

## 3. What the checker proves

### Time

All time is UTC, read from an RFC 3339 timestamp with an explicit offset. A
time field that has no offset, or isn't a timestamp, is refused
(`chart-field-type`). The existing calendar's per-record dating model
(`dated.zone`, `outcome-report-view.ts`) is not used here, because a chart's
units have to fall the same way in Go, at build time and in every browser.

The window is a `range` filter in `transform`, on the window field, with
`timeUnit: "utcyearmonthdate"`. Both ends are inclusive calendar days, so
standard tools filter the same rows the viewer does. `usermeta.capsule.window`
restates that filter, and the two have to match (`chart-window-mismatch`). A
temporal chart states a window, and its time axis reads the window field. On a
plan with one window node the chart's window equals the sealed one (D4); on a
plan with several, it lies inside each one on the same field. A
temporal axis's units have to tile the window exactly: a `utcyearmonth` chart
needs a window from the 1st of a month to a month's last day. Partial units are
refused (`chart-window-mismatch`), never drawn short. Weeks are left out of v0,
because a monthly report's sealed window (D4) never starts on Vega-Lite's
Sunday.

### Runs and "not run"

On a temporal axis, a unit is **run** when the dataset holds a run record for
it, and **not run** otherwise. `usermeta.capsule.runs` names the run records:
a filter predicate over the dataset (for example, the daily run records) and the
time field that dates each one. Only a plan with exactly one window node can
tell "not run" from zero (agent-action-capsule `spec/evidence-plan-ir-v0.md`
§5.1), and a run's day is the UTC day of that node's field:

- On such a plan, a temporal chart without `runs` is refused
  (`chart-runs-missing`), and `runs.field` has to be the sealed window field
  (`chart-runs-field-mismatch`).
- On a plan with no window node, or more than one, `runs` is refused
  (`chart-runs-unsealed`), so no unit reads "not run": a unit without rows
  reads 0. A non-temporal chart stating `runs` is refused the same way.
- A unit with rows but no run record is still not run; its rows stay in the
  population. A unit that was run and has no matching rows has a
value of `0`. A unit that was not run has no value. Its cell is hatched, it has
no bar or point, and its table row reads "not run". It is never drawn as zero.

### The statement

```json
{
  "population": { "count": 30 },
  "window": { "field": "event_time_claim", "from": "2026-09-01", "to": "2026-09-30" },
  "runs": { "filter": { "field": "record_type", "equal": "daily_run" }, "field": "event_time_claim" },
  "values": [
    { "x": "2026-09-01", "y": 4 },
    { "x": "2026-09-02", "y": 0 },
    { "x": "2026-09-03", "not_run": true }
  ]
}
```

**Groups.** A group's key is the values of every encoded channel that doesn't
aggregate: `x` alone, `x` and `color` for a series, `x` and `y` for a `rect`
cell. The group domain is the product of each key channel's domain. A temporal
channel's domain is every unit in the window. Any other channel's domain is the
values seen in the rows that pass `transform`. Every group in the domain is
listed. On a run unit, or on a chart with no temporal channel, a group with no
rows has the value `0`. On a not-run unit, every group is not run.

`values` holds one object per group, keyed by channel (`x`, `y`, `color`). A
temporal key is the ISO date of the unit's first day, in UTC. The aggregate
channel holds the number. A not-run group has no aggregate key and has
`"not_run": true`. Order doesn't matter, and a group listed twice is refused.

The checker runs these checks in order, after the spec's shape
(`chart-unsupported-member`, `chart-aggregate-shape`), the dataset
(`chart-no-dataset`, `chart-dataset-invalid`) and every row's record
(`chart-row-withheld`). Each failure refuses the build with its own reason and
a vector:

1. **Fields exist and have a type** (`chart-field-missing`, `chart-field-type`).
   A dataset mixes record types (D5), so each field is checked on the rows it
   applies to (section 4 says how a field resolves). A `transform` or
   `runs.filter` predicate is false on a row that lacks its field, as in
   Vega-Lite, and that is how a filter selects one record type. Every
   `encoding` field and `window.field` has to resolve on every row that passes
   `transform`. `runs.field` has to resolve on every row that matches
   `runs.filter`. A resolved value has to have the type the spec uses: a number
   under `sum` or `quantitative`, an RFC 3339 timestamp under `temporal`, a
   string or number under `equal`/`oneOf`. A field missing from a selected row
   is refused, never treated as zero.
2. **Window and runs** (`chart-window-mismatch`, `chart-runs-missing`,
   `chart-runs-field-mismatch`, `chart-runs-unsealed`), as above.
3. **Population matches** (`chart-population-mismatch`). The population is
   the rows that pass `transform`, run records included when the filter
   selects them, and it numbers exactly `population.count`. A chart of cases
   selects them by record type. Otherwise the run records count too, and a
   producer who counted only cases is refused.
4. **Values match** (`chart-aggregate-mismatch`). The checker recomputes every
   group, including the run and not-run units, from the filtered rows and the
   run records. The result has to equal `values` exactly. The chart is drawn
   from the recomputed values, never from `values`. `values` exists so that a
   producer's stated figure that disagrees with the data fails loudly instead
   of being silently replaced.

The check is data logic only, with no DOM. The TS implementation runs in the
page runtime and in the static build. Its Go twin is a package beside
`go/presentation` (not the emitter, which owns only the shell and CSP). The Go
offline builder calls it, and so must evidencebook's `capsulectl report build`,
which is a cross-repository step tracked on #82. Both implementations run one
shared vector set, `vectors/chart-spec/`, the same way
`vectors/presentation-resolution/` keeps TS and Go resolution in step. The
page runtime runs the check again before it draws. A page that reaches a
reader with a mismatch shows `chart.refused` in place of the chart, never the
chart.

## 4. The dataset

The dataset is the sealed selection the Result names (agent-action-capsule
`spec/evidence-result-v0.md` §7.3): `plan_ref` digests a dataset plan
(`spec/evidence-plan-ir-v0.md` §5.1) and `dataset_ref` the dataset document
it selected (§6.2 there), each over `UTF8(JCS(value))`. Both are documents of
their own. The reader (`chart-dataset.ts`; Go `chartspec.DatasetOf`) takes any
disclosed member, or the `statement` of a disclosed evidence-book record
header, whose digest is the ref. A build given `charts` for a bundle whose
Result has neither, or that does not disclose both documents, is refused
(`chart-no-dataset`). A dataset that is not an `evidence-dataset-v0` document,
whose `plan_ref` is not the Result's, whose rows are not in `seq` order, or
whose plan's window node has no params, is refused (`chart-dataset-invalid`).
A build with no `charts` is unaffected. The checker never falls back to the
Result's own claims or `evidence[]`.

A row names one record header by the digest of its JCS. The bundle carries the
header as the record's disclosed `agent_input`, whose digest the record
commits to (a record the book sealed), or inline in its `evidence_record_header`
member (a record its caller sealed). A row's `seq` and `record_type` have to
equal its header's. A row whose header the bundle does not disclose to this
audience is refused (`chart-row-withheld`), never dropped, because dropping it
would change the population.

The reader does not run the plan again: that needs every header of the
population, which a bundle that withholds any of them cannot give (§6.2). It
checks what the bundle can show: both digests, the dataset's own `plan_ref`,
and each disclosed row against its header.

Field paths are header paths, as the plan's are: the first name is a header
member and a payload member is `statement.<name>`. A run is dated by a field
the producer sets, such as `event_time_claim` or `statement.generated_at`,
never `committed_at`.

**Daily run records.** agent-action-capsule's Result reader allows one Result
per bundle (the 2026-09-28 one-headline-document rule): a monthly Result's
bundle cannot also disclose daily Results as `evidence_result` records. The
vectors and goldens date runs by a neutral run record type (`daily_run`, as
the AAC vectors use `example-run`). How a Terms Pack month carries its daily
runs is open for #120 and evidencebook#107.

## 5. Drawing, scripts off, and words

### The renderer

The viewer draws the accepted subset itself, as inline SVG built with DOM
calls: bars, lines, points and `rect` cells, with a pattern for not-run
cells. Geometry is set as SVG attributes, not `style`, so the static page's
CSP needs no new hashes. This replaces the How ack's plan to depend on `vega`
and `vega-lite`, for three reasons:

- Go-built pages draw in the reader's browser through the TS page runtime. A
  build-time-only Vega render would not reach them. Shipping Vega inside the
  page runtime would add a dataflow and expression interpreter to the page,
  which is the surface acceptance 2 exists to keep out.
- The subset is small enough that our own renderer is shorter than the
  wrapper around Vega would be.
- The static page needs nothing new. It is the same render in jsdom [pb].

The spec format stays Vega-Lite, so the door [82] records is unchanged. Only
the renderer, a two-way door, changes.

### Scripts off (acceptance 2)

- **No author script in any packaging.** A spec is data. The only code that
  draws it is the viewer's own runtime, pinned by version and hash like every
  other module.
- **Scripts off means the static packaging.** It draws every chart at build
  time, and `static-carries-script` refuses any script. That holds for any
  sealed bundle, including one `capsulectl` built:
  `node ts/scripts/render-report.mjs BUNDLE.json --charts CHARTS.json --format static -o PAGE.html`
  writes the scripts-off copy. `--charts` (a JSON list of specs, in page order,
  passed to the `charts` setting) and `--format` are new flags in this PR.
  The static acceptance test runs this command with a charts file.
- **A Go-built offline page is a scripted page.** Its whole body is drawn by
  the runtime (`go/emitter/shell.html` has no content outside its scripts),
  so with scripts off it shows nothing at all, charts or not. Giving Go its own
  SVG renderer would draw charts with no page around them, and would make a
  second renderer that has to match the TS one byte for byte. A Go static
  packaging would be a Go twin of all of [pb] §2.4, which is its own item, not
  #82's.
- **A reader with scripts off is told where the static copy is.** The Go and
  TS shells carry a `<noscript>` line which says the page needs scripts and
  that a no-script copy can be built with the command above. It is fixed shell
  text, not a wording key: the shell is written before any pack is read, and
  the static page has no `<noscript>`.
  `capsulectl report build` prints the same command, and its docs give it,
  because the static path needs Node, which a `capsulectl` user may not have.
  The `<noscript>` line lands with this item's code. The `capsulectl` line
  is an evidencebook step, tracked on #82.

### Words

Every chart is drawn with these, in the core's words (Sherlock2 reviews the
strings as public text):

| Key | String |
| --- | --- |
| `chart.population.one` / `.other` | `{n} record` / `{n} records` (the repository's plural convention, as in `front.agg.evaluations.one`) |
| `chart.window` | `{from} to {to} (UTC)` |
| `chart.derived` | `Derived from this report's records, not evidence itself` |
| `chart.not_run` | `Not run` |
| `chart.table.caption` | `The values in this chart` |
| `chart.count` / `chart.sum` | `Count` / `Sum of` (the table's value column, the summed field path after it as code) |
| `chart.evidence.records` | `The records this value counts, each a link to its entry in this bundle's records` |
| `chart.evidence.none` | `Nothing counted: no record in this report's data falls here` |
| `chart.refused` | `This chart was not drawn: its spec does not match the report's data ({reason}).` |
| shell `<noscript>` (fixed text) | `This page needs scripts to show the report. A version without scripts can be built from the same bundle with render-report --format static.` |

`chart.derived`, `chart.not_run`, `chart.evidence.records`,
`chart.evidence.none` and `chart.refused` are locked: a pack cannot reword
them (`LOCKED_ENTRIES`).

- The caption gives the population and the window, from the checked
  statement. The noun is the core's fixed "records". A pack noun would put
  producer text in a core caption.
- The text table of every drawn group, not-run units included, is the chart's
  text alternative and what print and the 390 px layout fall back to.
- Every chart carries the derived label. Every chart in the subset is a count
  or sum over records, which is a trend or a comparison, so no chart can leave
  the label off and the spec has no flag for it.
- v0 limit: a category with no rows after `transform` is not in a
  non-temporal channel's domain, so it can't show as 0. Only temporal units
  are listed whether or not they have rows.
- #120's `calendar.not_run` reuses `chart.not_run`, since a calendar unit is a
  run.
- Acceptance 5a: every value in the table carries Show evidence, the records
  it counts as links to the core's records section (the same shape as
  `evidenceAction`, so the core's "Cited by" lists read it back), or, for a
  value that counts nothing, the `chart.evidence.none` label. The
  computation half of 5a is #146.

Build refusals (`chart-no-dataset` and the reasons in section 3) are builder
errors with a `message`, not page text.

## 6. What the code waits on

1. **An agent-action-capsule TS release with #443.** The published
   `ts/v0.9.0` predates #443, and its Result reader refuses `plan_ref` and
   `dataset_ref` as unknown members, so no page shows a Result that names a
   dataset until a release carries #443's `ts/src/result-root.ts`.
2. **An evidencebook-built bundle.** The golden bundle,
   `ts/test/testdata/charts/book.bundle.json`, is sealed in this repository
   by the test sealer from literal headers. One from `book result build` can
   replace it once evidencebook#107's code lands.

## 7. Tests

The vectors (`vectors/chart-spec/`) are data. Each one is a spec plus no
dataset or a named dataset of rows, each row with its header or none
(withheld). TS and Go run them. Each negative names the passing positive it
changes in one way, and both runners check that the positive passes, so each
refusal is that change's and a renderer without the check would have drawn
the negative.

- One passing spec per mark, each validated against the Vega-Lite v5 schema.
- One vector per refusal reason: `chart-unsupported-member` (for `expr`,
  `url`, `params`, `calculate`, a local time unit and `utcyearweek`), `chart-aggregate-shape`,
  `chart-field-missing`, `chart-field-type` (a string under `sum` and a
  timestamp with no offset), `chart-window-mismatch` (a differing statement, a
  `utcyearmonth` window from 2026-09-02 to 2026-09-30), `chart-runs-missing`,
  `chart-runs-field-mismatch`, `chart-runs-unsealed` (a plan with no window
  node, and one with two), `chart-population-mismatch`,
  `chart-aggregate-mismatch` (including a not-run day stated as 0),
  `chart-row-withheld`, `chart-no-dataset` and `chart-dataset-invalid`.
- No "not run" on a plan with no window node or two: a day without rows
  reads 0.
- Time: a timestamp at 23:59:59Z and one at 00:00:00Z on the window's last and
  first days; a `utcyearmonth` window that isn't whole months is refused.
- Not run: 30 days, daily run records on 28 of them. One of the 28 days has no
  rows after the filter. That draws 28 values, one of them `0`, and 2 "not
  run" cells.
- Groups: a `color` series where one key has no rows on a run day lists that
  group as `0`. A `rect` with two cells at the same x and different y lists
  two groups.
- Mixed dataset: daily run records and cases in one dataset. A case chart whose
  `transform` selects cases by record type passes, and a case field missing
  from the run records doesn't refuse it. The same spec without the
  record-type filter is refused (`chart-field-missing`, since check 1 runs
  first). A count of cases by day that uses only `event_time_claim`, which
  both record types have, and leaves out the record-type filter is refused
  (`chart-population-mismatch`), because the run records are counted too.
- Derived: a two-category `bar` with no `color` carries the label.
- Static page: `render-report.mjs --charts … --format static` builds a page
  with its charts and passes `static-carries-script`. `fragment` with `charts` reports
  `fragment-has-charts`.
- Golden: the book bundle's charts section, byte for byte
  (`ts/test/goldens/charts/book.html`), and the same charts with scripts on
  and off, in print and at 390 px, with no CSP violation
  (`chart-browser.test.ts`). The Terms Pack outcome and EU months follow
  when evidencebook builds them.
