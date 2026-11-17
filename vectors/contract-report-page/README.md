# Contract-report page vectors

Shared vectors for the page `contract-report/v1`
(`spec/contract-report-module-v1.md`) draws: each case is a Result-rooted
Bundle v2 and a view, and the page sections a conforming implementation draws
from them. The expected output is structured data, not HTML bytes, so an
implementation in another language asserts it without matching markup. The
fixtures are made up (a sample airline week, a sample EU AI Act pack); no case
carries a real party, amount or price.

They are normative for every implementation of the contract-report page
(`spec/contract-report-module-v1.md` is this repository's). Today that is the
TypeScript renderer (`ts/src/contract-report.ts`, `ts/src/core-strip.ts`),
which generates them:

```bash
cd ts && AAC_WRITE_VECTORS=1 npx vitest run test/contract-report-page-vectors.test.ts
```

Without `AAC_WRITE_VECTORS` the same test checks that the committed files are
exactly what the generator writes, and that each case holds when read back
from disk alone. The renderer's HTML goldens (`ts/test/goldens/contract-report`)
are separate and unchanged.

## `cases.json`

`{version: 1, cases: [...]}`; each case:

- `name`, `about` (what the case pins) and `grouping` (`generic` or
  `groups`, the module's row grouping).
- `bundle`: the sealed Result-rooted Bundle v2, as the page reads it.
- `view`: `{wording}`, the audience wording pack the page is drawn with
  (a file under `ts/src/wording/`, bound by its digest in
  `audience-packs.lock.json`), or `null` for the default pack. Every committed case uses the default pack: an audience pack changes words, and the vectors assert tokens and counts.
- `absent`: strings that must not appear anywhere in the page's text.
- `expected.core_strip` and `expected.module_rows`, asserted separately.

### `core_strip`

Read from the core's own markers on the strip (`data-core-strip`):

- `banner` and `banner_text`: the verification banner's markers
  (`verify`, `verdict`, `checkpoint`, `uncheckpointed`) and its line.
- `kicker` (the strip's first line: pack, version, generation time), `facts`
  (the Result identity line) and `mock_mark` (the mock-judge mark, `null`
  when absent).
- `coverage`: the coverage line's `data-*` figures (`evaluated`,
  `requirements`, `excluded`, `unknown`) and `coverage_text`, its words.
- `tiles`: the buckets in page order, each `{bucket, count, of, label}`: the
  count beside its denominator. No percentage and no single figure.

### `module_rows`

`{grouping, page, headline, rows}`, read with every toggle open. Every case
opts into `contract-report/v1` (an empty block), so the module resolves;
`page` lists the module page markers that drew the rows (`contract-report`
for the `generic` grouping, `compliance` for `groups`). Each row is the row's
`data-*` markers (the bundle's own tokens, with the `data-` prefix removed),
never wording: for `generic` one entry per claim (`row` the requirement,
`contract`, `claim`, `verdict`); for `groups` the obligation rows
(`obligation`) and test rows (`criterion`, `population`, `exceptions`,
`not-evaluable`, `out-of-scope`, `not-yet-in-force`, `unverified`).
`headline` is the module's headline words, `null` when it draws none. The
`lines` grouping is covered by the HTML goldens only: its fixture is a
megabyte, too large for a shared vector.

## Negative cases

- `result-generic-claim-not-carried`: the Result without `claim-3`. Its tiles
  and rows are those of two claims, and neither `claim-3` nor `req-3` appears
  anywhere in the page.
- `result-generic`: the claim the judge could not decide (`not_evaluable`,
  claim) is counted only in the "could not decide" tile and its
  row says `not_evaluable`: shown as such, never omitted and never upgraded
  to met.
