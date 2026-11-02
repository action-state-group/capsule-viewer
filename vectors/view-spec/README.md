# View-spec vectors

Shared vectors for the view checks of `docs/design/report-views.md`: a view
entry of the `charts` setting (a calendar, by-period, timeline or co-failure
view) checked against a sealed dataset (agent-action-capsule
`spec/evidence-plan-ir-v0.md` §5.1 and §6.2). Built on the chart-spec vectors
(`vectors/chart-spec/`): a view is chart specs laid out, each checked by the
chart checker.

They are normative for every implementation of the view checker: the
TypeScript checker (`ts/src/report-view.ts`) and the Go package
`go/chartspec` (`CheckView`). Both run every case in CI, and a result that
differs from a case is a bug in the implementation. The TypeScript test
generates them from literal objects (`ts/test/helpers/view-fixtures.ts` and
`view-vectors.ts`):

```bash
cd ts && AAC_WRITE_VECTORS=1 npx vitest run test/view-spec-vectors.test.ts
```

Without `AAC_WRITE_VECTORS` the same test checks that the committed files are
exactly what the generator writes.

## Files

- `datasets.json`: datasets by name, each `{plan, rows}` as in
  `vectors/chart-spec/datasets.json`: the view book (September 2026, a daily
  run on 26 of 30 days, cases, adjudications) and three variants of it (a
  window sealed from the 2nd, a plan with no window node, a numeric
  requirement among the string ones).
- `cases.json`: the cases, positives first. Each is `{name, base?, note, view,
  dataset, expect}`. `view` is the entry; `dataset` names a member of
  `datasets.json`, or is `null` for a Result that names no dataset. `expect`
  is `{valid: true, view, window, unplaced, parts, ...}`, the checked view
  (each chart's id, its recomputed values in the spec's `values` form, a
  lane's `role`, `mark` and `classes`; a co-failure view adds `subject`,
  `requirements`, `failing`, and the subjects and record `seq`s of each
  matrix cell), or `{reason, pointer?}`, the refusal. The refusal's message is
  not compared.

A negative names its `base`: the positive it changes (in one way, except
`neg-no-dataset` and the negatives that change the dataset). A runner checks
that the base passes, so the refusal is that change's.
