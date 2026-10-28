# Charts from a declarative spec, checked against the dataset (design note)

Status: design only, for capsule-viewer#82. No code yet. Code waits on the
dataset contract from evidencebook#107 (section 6).

Every chart on a report page comes from a chart spec, which is data. The
viewer checks the spec against the dataset the report was built from, refuses
the build on any mismatch, and draws the chart with its own code as static
SVG. No script from the spec or its author reaches the page.

## Sources

| Ref | Where | What it fixes |
| --- | --- | --- |
| [82] | capsule-viewer#82 body and How ack (issuecomment-6399494886) | acceptance 1 to 5; owner capsule-viewer; a closed Vega-Lite subset; the format is a door, confirmed as engineering's call by Sherlock2 (buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=da697be1652f79095bfe2709c5f546eed7dcd41f22e3164e5ab5237eb937ef7f); a spec is never carried in a bundle |
| [107] | evidencebook#107 and Steven's 10-27 ruling on it | optional Result members `plan_ref` and `dataset_ref`; the dataset row format is defined in one AAC spec PR, "for example JCS rows of committed record refs" |
| [pb] | `spec/presentation-builder-v0.md` §2.4 (main 9213caa) | the static page is the `html` page rendered at build time by the TS modules; `static-carries-script`; CSP `script-src 'none'`, inline `style` attributes only by hash; there is no Go twin of the rendering |
| [brief] | Terms Pack engineering brief (2026-10-27), Calendar4 / EUAcross5 row and order of work step 3 | the calendar reads cited daily Results; "a day with no daily Result renders 'not run', never zero" |
| [120] | capsule-viewer#120 How ack | the `calendar` and `by-period` modules are #120's. Their cell specs are checked by this note's checker |

## 1. Where the spec lives

A chart spec is a build input, like a wording pack. It comes from the pack (or,
for an ad-hoc report, from the agent that wrote the plan) and is passed to the
builder next to the bundle. The page carries it as a JSON data element, the
same way it carries the wording pack, and states its SHA-256 in the "How this
page was checked" section. It is never a member of the bundle [82].

## 2. The format: a closed Vega-Lite v5 subset

A spec is a valid Vega-Lite v5 document, so a producer can write and preview it
with standard tools. The viewer accepts only the members below. Any other
member, at any depth, refuses the build (`chart-unsupported-member`, naming the
JSON pointer). This list is the one-way door [82] records. Widening it later is
additive. Narrowing it is a break.

| Member | Accepted values |
| --- | --- |
| `$schema` | exactly `https://vega.github.io/schema/vega-lite/v5.json` |
| `data` | `{"name": "dataset"}` only. No `url`, no `values`, no `sequence` |
| `mark` | `bar`, `line`, `point`, `rect`, as a string or `{"type": ...}` with no other key |
| `transform` | a list of `{"filter": P}`. P is a field predicate (`equal`, `oneOf`, `range`, `valid`) or `and` / `or` / `not` of them. Never an expression string |
| `encoding.x`, `.y`, `.color` | `field`, `type` (`quantitative`, `ordinal`, `nominal`, `temporal`), `aggregate` (`count`, `sum`, `min`, `max`), `timeUnit` (`yearmonthdate`, `yearweek`, `yearmonth`) on a temporal field only, `title` |
| `usermeta.capsule` | the statement the checker holds the chart to (section 3) |
| `title`, `description` | ignored. The core draws the caption in its own words (section 5) |

Refused by construction: `params`, signals, selections, `calculate`, `lookup`,
`href`, `tooltip`, `transform` other than `filter`, any `expr` member, any
string that Vega would evaluate, and `layer`, `concat`, `facet` and `repeat`.
`mean` and other derived aggregates are left out of v0. A chart that needs a
ratio shows both counts (Steven's ruling against a single figure).

## 3. What the checker proves

`usermeta.capsule` states what the chart claims to show:

```json
{
  "population": { "count": 30 },
  "window": { "from": "2026-09-01", "to": "2026-09-30", "field": "generated_at" },
  "values": [ { "x": "2026-09-01", "y": 4 } ],
  "derived": true
}
```

The checker runs these checks in order. Each failure refuses the build with
its own reason and a fixture:

1. **Fields exist** (`chart-field-missing`). Every `field` the spec names
   resolves in every dataset row (section 4). A field that resolves in some
   rows but not others is refused too, never treated as zero.
2. **Population matches** (`chart-population-mismatch`). The rows that pass
   `transform` and fall in `window` number exactly `population.count`.
3. **Values match** (`chart-aggregate-mismatch`). The checker recomputes every
   aggregate from the filtered rows. Its result has to equal `values`, with
   the same keys and the same numbers. The chart is drawn from the recomputed
   values, never from `values`. `values` exists so a producer's stated figure
   that disagrees with the data fails loudly instead of being silently
   replaced.
4. **Window covers the chart** (`chart-window-mismatch`). A temporal axis
   spans exactly `window`, at its `timeUnit`.

The check is data logic only, with no DOM. It has a TS implementation (the page
runtime and the static build) and a Go twin (the Go emitter, so
`capsulectl report build` refuses at build time). Both run one shared vector
set, `vectors/chart-spec/`, the same way `vectors/presentation-resolution/`
keeps TS and Go resolution in step. The page runtime runs the check again
before it draws. A page that reaches a reader with a mismatch shows the
refusal in place of the chart, never the chart.

## 4. The dataset and its fields

The dataset is the sealed record that the Result's `dataset_ref` names [107].
Its rows are read from the bundle, never from page-local state. If Steven's
minimal row format is adopted (each row a committed record ref), a field
resolves as a dot path into the disclosed record that the row references. A
row whose record the bundle doesn't disclose to this audience is refused
(`chart-row-withheld`), never dropped, because dropping it would change the
population.

No `dataset_ref` means no dataset. A build given a chart spec for a bundle
whose Result has no `dataset_ref`, or whose dataset record isn't disclosed, is
refused (`chart-no-dataset`), because the spec can't be checked. A build with
no chart spec is unaffected. The checker never falls back to the Result's own
claims or `evidence[]`, because that would make a second dataset definition
beside #107's.

## 5. Drawing, words and the "not run" rule

The viewer draws the accepted subset itself, as inline SVG built with DOM calls:
bars, lines, points and `rect` cells. Geometry is set as SVG attributes, not
`style`, so the static page's CSP needs no new hashes. This replaces the How
ack's plan to depend on `vega` and `vega-lite`, for three reasons:

- Go-built pages draw in the reader's browser through the TS page runtime. A
  build-time-only Vega render would not reach them. Shipping Vega inside the
  page runtime would add a dataflow and expression interpreter to the page,
  which is the surface acceptance 2 exists to keep out.
- The subset is small enough that our own renderer is shorter than the
  wrapper around Vega would be.
- The static page then needs nothing new. It is the same render in jsdom
  [pb], so charts render with scripts off by the existing path, and
  `static-carries-script` still guards it.

The spec format stays Vega-Lite, so the door [82] records is unchanged. Only
the renderer, a two-way door, changes.

Every chart is drawn with these, in the core's words:

- a caption naming the population ("30 conversations") and the window
  ("1 to 30 Sep 2026"), from the checked statement;
- a text table of every drawn value, which is the chart's text alternative and
  what print and the 390 px layout fall back to;
- a "Derived, not evidence" label on every `line` chart and on any chart with
  `derived: true`;
- **not run**: on a temporal axis, every unit in `window` is drawn. A unit
  with no dataset row is drawn and tabled as "not run" (a hatched cell, no
  bar, no point), never as zero. An aggregate over no rows has no value; it
  is not `0`.

New wording keys, for Sherlock2's review as public text: `chart.population`,
`chart.window`, `chart.derived`, `chart.not_run`, `chart.table.caption`,
`chart.refused`, `chart.no_dataset`. #120's `calendar.not_run` can reuse
`chart.not_run` rather than add a second phrase.

## 6. Blockers and open questions

1. **The dataset row format** (evidencebook#107, AAC spec PR). That PR isn't
   open yet. Section 4 assumes Steven's example (rows of committed record
   refs). If the AAC text defines rows with their own fields, section 4's
   field resolution follows the AAC text and this note is amended.
2. **A committed VALID bundle that carries a dataset.** Goldens need one. No
   committed fixture has a `dataset_ref` or daily Results today. evidencebook's
   `4-monthly-outcome` Result cites only `evaluation-report/v1` records. It
   comes from `book result build` once #107's code lands.
3. Until both exist, the code can land the checker and renderer against the
   shared vectors, which are data rather than bundles. The goldens and the
   page wiring land after #107. Whether to split #82 that way is the
   coordinator's call.

## 7. Tests

- Vectors, run by TS and Go: one passing spec per mark; one fixture per
  refusal reason in section 3, plus `chart-unsupported-member` for `expr`,
  `url`, `params` and `calculate`, and `chart-row-withheld`.
- "Not run": a window of 30 days with rows on 28 of them draws 28 values and
  2 "not run" cells. No cell reads 0.
- Static page: a spec-driven chart builds with `static` and passes
  `static-carries-script`. The page has no element from the spec except data.
- Goldens (after #107): the outcome and EU months, re-rendered byte for byte
  in CI, through the existing accessibility, 390 px and print checks.
