# UX round-0 comprehension fixtures

A synthetic Evidence Result v0 for a first comprehension test of the
`result/v0` card: can a first-time reader tell the three buckets apart,
drill from a bucket to the evidence behind a claim, and say what
"established" means for a claim? Nothing here is real: the insurer, the
jobs, the contract and every digest are invented (each digest is the
SHA-256 of a fixed label string).

| File | What it is | What a reader should notice |
|---|---|---|
| `round0-result.json` | 6 jobs × 4 requirements = 24 claims under `ec:example-motor-claims-settlement@0.3`; 16 `met`, 3 `not_met`, 5 `not_evaluable`; 3 requirements excluded as not applicable; 1 unresolved | Every check agrees. `not_evaluable` (not enough evidence to decide) is its own bucket, apart from `not_met` |
| `round0-result-hand-edited.json` | The same result with one claim (`J-1003/customer_notified`) moved from `not_evaluable` to `met` in the summary only. Still schema-valid | The `met` and `not_evaluable` bucket counts show `✗ disagrees with claims[]` |
| `round0-result-untiered.json` | The same result with the first claim's `tier` removed. Schema-invalid | That claim renders as a refusal row, and the coverage recount disagrees |

Claim ids are `<job>/<requirement>`. Result v0 has no job field, so the job
is carried in the id and the card lists claims flat.

## Build and render

```
python examples/ux-round0/build_fixtures.py              # rewrite the JSON
python examples/ux-round0/build_fixtures.py --html out/  # also write out/*.html
```

Each HTML file is self-contained: open it straight from disk, with no
server and no network. `tests/test_ux_round0_fixtures.py` fails if the
committed JSON drifts from the builder, or if a variant changes more than
its one field. `js-tests/ux_round0_fixtures.test.js` pins what the card
shows for each file.
