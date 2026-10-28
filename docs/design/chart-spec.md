# Charts from a declarative spec, checked against the dataset (design note)

Status: design only, for capsule-viewer#82. No code yet. Code waits on the
dataset contract from evidencebook#107 (section 6).

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
| `transform` | a list of `{"filter": P}`. P is a field predicate (`equal`, `oneOf`, or `range` with an optional `timeUnit`) or `and` / `or` / `not` of them. Never an expression string |
| `encoding.x`, `.y`, `.color` | `field`, `type` (`quantitative`, `ordinal`, `nominal`, `temporal`), `aggregate` (`count` or `sum`), `timeUnit` (`utcyearmonthdate`, `utcyearmonth`) on a temporal field only. `title` is accepted and ignored |
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
temporal axis's units have to tile the window exactly: a `utcyearmonth` chart
needs a window from the 1st of a month to a month's last day. Partial units are
refused (`chart-window-mismatch`), never drawn short. Weeks are left out of v0,
because a monthly report's sealed window (D4) never starts on Vega-Lite's
Sunday.

### Runs and "not run"

On a temporal axis, a unit is **run** when the dataset holds a run record for
it, and **not run** otherwise. `usermeta.capsule.runs` names the run records:
a filter predicate over the dataset (for example, the daily Results) and the
time field that dates each one. A temporal chart without `runs` is refused
(`chart-runs-missing`). A unit that was run and has no matching rows has a
value of `0`. A unit that was not run has no value. Its cell is hatched, it has
no bar or point, and its table row reads "not run". It is never drawn as zero.

### The statement

```json
{
  "population": { "count": 30 },
  "window": { "field": "generated_at", "from": "2026-09-01", "to": "2026-09-30" },
  "runs": { "filter": { "field": "record_type", "equal": "evidence-result" }, "field": "generated_at" },
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

The checker runs these checks in order. Each failure refuses the build with
its own reason and a vector:

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
2. **Window** (`chart-window-mismatch`), as above.
3. **Population matches** (`chart-population-mismatch`). The population is
   the rows that pass `transform`, run records included when the filter
   selects them, and it numbers exactly `population.count`. A chart of cases
   selects them by record type. Otherwise the daily Results count too, and a
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

## 4. The dataset, and what this note needs from #107

The dataset is the sealed record that the Result's `dataset_ref` names [107].
Its rows are read from the bundle, never from page-local state. A build given
`charts` for a bundle whose Result has no `dataset_ref`, or whose dataset
record isn't disclosed, is refused (`chart-no-dataset`). A build with no
`charts` is unaffected. The checker never falls back to the Result's own
claims or `evidence[]`, because that would make a second dataset definition
beside #107's. A row whose record the bundle doesn't disclose to this audience
is refused (`chart-row-withheld`), never dropped, because dropping it would
change the population.

What the checker needs from #107's row format, for the #107 lane to check
against:

- **D1.** The dataset record's bytes are what `dataset_ref` digests, so the
  checker verifies the rows before reading them.
- **D2.** Each row names exactly one committed record by digest (`digest`,
  `digest_alg`), and that record resolves in the bundle when disclosed.
- **D3.** The rows are the plan's whole population, with none dropped and no
  duplicates, so `count` and `sum` can be recomputed.
- **D4.** The plan's window (`from` and `to`, as UTC calendar days) is sealed
  data, in the plan that `plan_ref` names or in the dataset record. Otherwise
  "not run" can't be told from "outside the window", and
  `usermeta.capsule.window` has nothing sealed to agree with. The checker
  refuses a spec window that differs from the sealed window.
- **D5.** The run records, the daily Results for the calendar, are rows of the
  same dataset. Otherwise `runs` can't find them.
- **D6.** Each row (or its record) states its record type, so `runs` and
  `transform` can select by it.

The chart fields read through a row are dot paths into the referenced record.
For a daily Result these are `generated_at` and the `aggregate.coverage`
members (`evaluations`, `excluded_not_applicable`, `unknown_count`,
`not_yet_in_force`, `requirements_covered`). For case records they are the
record's own timestamp and the fields #120's cells use. If the AAC text gives
rows their own fields instead of refs, section 4 follows the AAC text and this
note is amended.

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
  TS shells get a `<noscript>` line, `page.noscript`, which says the page
  needs scripts and that a no-script copy can be built with the command above.
  `capsulectl report build` prints the same command, and its docs give it,
  because the static path needs Node, which a `capsulectl` user may not have.
  The shells belong to capsule-viewer#133's lane (viewer-109), so the
  `<noscript>` line lands after #133 merges. The `capsulectl` line is an
  evidencebook step. Both are tracked on #82.

### Words

Every chart is drawn with these, in the core's words (Sherlock2 reviews the
strings as public text):

| Key | String |
| --- | --- |
| `chart.population.one` / `.other` | `{count} record` / `{count} records` (the repository's plural convention, as in `front.agg.evaluations.one`) |
| `chart.window` | `{from} to {to} (UTC)` |
| `chart.derived` | `Derived from this report's records, not evidence itself` |
| `chart.not_run` | `Not run` |
| `chart.table.caption` | `The values in this chart` |
| `chart.refused` | `This chart was not drawn: its spec does not match the report's data ({reason}).` |
| `page.noscript` | `This page needs scripts to show the report. A copy that runs no scripts can be built from the same bundle; see capsule-viewer's render-report.` |

- The caption gives the population and the window, from the checked
  statement. The noun is the core's fixed "records". A pack noun would put
  producer text in a core caption.
- The text table of every drawn group, not-run units included, is the chart's
  text alternative and what print and the 390 px layout fall back to.
- Every chart carries the derived label. Every chart in the subset is a count
  or sum over records, which is a trend or a comparison, so no chart can leave
  the label off and the spec has no flag for it.
- #120's `calendar.not_run` reuses `chart.not_run`, since a calendar unit is a
  run.

Build refusals (`chart-no-dataset` and the reasons in section 3) are builder
errors with a `message`, not page text.

## 6. Blockers

1. **The dataset row format** (evidencebook#107, AAC spec PR). That PR isn't
   open yet. D1 to D6 in section 4 are what this note needs from it.
2. **A committed VALID bundle that carries a dataset.** Goldens need one. No
   committed fixture has a `dataset_ref` or daily Results today. evidencebook's
   `4-monthly-outcome` Result cites only `evaluation-report/v1` records. One
   comes from `book result build` once #107's code lands.

Code waits for the #107 spec PR to merge (coordinator, 2026-10-28).

## 7. Tests

The vectors are data. Each one is a spec plus either no dataset or a dataset
of rows, each row with its resolved record or a `withheld: true` marker. TS
and Go run them.

- One passing spec per mark, each validated against the Vega-Lite v5 schema.
- One vector per refusal reason: `chart-unsupported-member` (for `expr`,
  `url`, `params`, `calculate` and a local time unit), `chart-aggregate-shape`,
  `chart-field-missing`, `chart-field-type` (a string under `sum` and a
  timestamp with no offset), `chart-window-mismatch` (a differing statement, a
  partial week), `chart-runs-missing`, `chart-population-mismatch`,
  `chart-aggregate-mismatch`, `chart-row-withheld` and `chart-no-dataset`.
- Time: a timestamp at 23:59:59Z and one at 00:00:00Z on the window's last and
  first days; a `utcyearmonth` window that isn't whole months is refused.
- Not run: 30 days, daily Results on 28 of them. One of the 28 days has no
  rows after the filter. That draws 28 values, one of them `0`, and 2 "not
  run" cells.
- Groups: a `color` series where one key has no rows on a run day lists that
  group as `0`. A `rect` with two cells at the same x and different y lists
  two groups.
- Mixed dataset: daily Results and cases in one dataset. A case chart whose
  `transform` selects cases by record type passes, and a case field missing
  from the daily Results doesn't refuse it. The same spec without the
  record-type filter is refused (`chart-population-mismatch`).
- Derived: a two-category `bar` with no `color` carries the label.
- Static page: `render-report.mjs --charts … --format static` builds a page
  with its charts and passes `static-carries-script`. `fragment` with `charts` reports
  `fragment-has-charts`.
- Goldens (after #107): the outcome and EU months, re-rendered byte for byte
  in CI, through the existing accessibility, 390 px and print checks.
