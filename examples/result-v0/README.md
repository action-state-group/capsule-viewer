# Example Result v0 fixtures

A synthetic Evidence Result v0 and two one-field variants of it, rendered by
the `result/v0` card. Nothing here is real: the producer, the releases, the
contract and every digest are invented (each digest is the SHA-256 of a
fixed label string).

| File | What it is | What the card shows |
|---|---|---|
| `release-approval-result.json` | 6 releases × 4 requirements = 24 claims under `ec:example-software-release-approval@0.3`; 16 `met`, 3 `not_met`, 5 `not_evaluable`; 3 requirements excluded as not applicable; 1 unresolved | Every check agrees. `not_evaluable` (not enough evidence to decide) is its own bucket, apart from `not_met` |
| `release-approval-result-hand-edited.json` | The same result with one claim (`R-103/release_notes_published`) moved from `not_evaluable` to `met` in the summary only. Still schema-valid | The `met` and `not_evaluable` bucket counts show `✗ disagrees with claims[]` |
| `release-approval-result-untiered.json` | The same result with the first claim's `tier` removed. Schema-invalid | That claim renders as a refusal row, and the coverage recount disagrees |

Claim ids are `<release>/<requirement>`. Result v0 has no job field, so the
job (here, a release) is carried in the id and the card lists claims flat.

## Build and render

```
python examples/result-v0/build_fixtures.py              # rewrite the JSON
python examples/result-v0/build_fixtures.py --html out/  # also write out/*.html
```

Each HTML file is self-contained: open it straight from disk, with no
server and no network. `tests/test_result_v0_examples.py` fails if the
committed JSON drifts from the builder, or if a variant changes more than
its one field. `js-tests/result_v0_examples.test.js` pins what the card
shows for each file.
