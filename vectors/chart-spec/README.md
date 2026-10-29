# Chart-spec vectors

Shared vectors for the chart checker of `docs/design/chart-spec.md`: a chart
spec (a Vega-Lite v5 document in the closed subset) checked against a sealed
dataset (agent-action-capsule `spec/evidence-plan-ir-v0.md` §5.1 and §6.2).

They are normative for every implementation of the checker. Today that is the
TypeScript checker (`ts/src/chart-spec.ts`) and the Go package `go/chartspec`;
both run every case in CI, and a result that differs from a case is a bug in
the implementation. The TypeScript test generates them from literal objects
(`ts/test/helpers/chart-fixtures.ts` and `chart-vectors.ts`):

```bash
cd ts && AAC_WRITE_VECTORS=1 npx vitest run test/chart-spec-vectors.test.ts
```

Without `AAC_WRITE_VECTORS` the same test checks that the committed files are
exactly what the generator writes.

## Files

- `datasets.json`: datasets by name, each `{plan, rows}`. `plan` is a dataset
  plan; each row is a dataset row (`seq`, `record_type`, `digest_alg`,
  `digest`) with the record header it names under `header`, or no `header`
  when the bundle withholds that record.
- `cases.json`: the cases, positives first. Each is `{name, base?, note,
  spec, dataset, expect}`. `dataset` names a member of `datasets.json`, or is
  `null` for a Result that names no dataset. `expect` is `{valid: true,
  values}`, the groups the checker recomputes in order, in the spec's
  `usermeta.capsule.values` form, or `{reason}`, the refusal.

A negative names its `base`: the positive it changes in one way. A runner
checks that the base passes, so the refusal is that change's.

## The book

One book over September 2026: a run record (`daily_run`) on every day but
2026-09-10 and 2026-09-20, dated by `event_time_claim` inside its day, and
cases on every run day but 2026-09-15, one or two a day. The first case is at
2026-09-01T00:00:00Z, the last at 2026-09-30T23:59:59Z, and one is written at
+05:00 and falls on its UTC day. The dataset plan reads both types and keeps
2026-09-01 to 2026-09-30 by `event_time_claim`. Cases by day therefore draw
28 values, one of them 0 (2026-09-15), and 2 units not run.

Placeholders only (`example-book`, `example-org`): no fixture names a company.
