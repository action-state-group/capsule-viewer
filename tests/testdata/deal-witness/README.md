# Witnessed deal bundle fixtures

**Everything here is TEST-KEYED and synthetic.** No settlement or preimage is in
these bundles, and no witness was contacted: each receipt is signed in process
by a generated witness key, and its `ts_url` is a local listener that never
answers.

## parent-log-witness/v1 (capsule-viewer#237)

`parent-all.bundle.json` and `parent-part.bundle.json` are deal copies written
by today's capsulectl (`deal report --bundle`), each with the holder's
`parent-log-witness/v1` block put in. Since u225 a copy capsulectl writes
carries no witness chain; capsulectl still builds the block
(`capsulectl/internal/deal/deal_v0_witnessed.go`, `cadenceExtensionEntry`) and
hands it out only as a proof file. The block was put in with evidencebook's own
test helper `withHolderChain`, as a copy carried it before u225, and checked
with `requireParentWitness` (AAC's Go verifier) before it was written. In
`parent-part` the deal has one more step after the tick, so the chain covers an
earlier checkpoint of the deal (`extent: "part"`, 6 of 7 steps).

They were written by `generate-v1_test.go.txt`, run as a test inside
evidencebook `capsulectl/internal/deal` at
`979f2fbe56775f5ff4564b8a66734631fb1b5dd7` with `VIEWER237_OUT` set to an
output directory (`go test ./internal/deal -run TestViewer237Fixtures`). The
receipts' registration time is 2026-10-04T09:00:05Z. `witnesses.json` is the
witness directory, in AAC's form, that names the generated witness.
`ts/test/parent-witness-capsulectl.test.ts` draws the verification page for
each.

## x-cadence-witness/v0 (capsule-viewer#214)

`cadence-all.bundle.json` is a deal bundle an older capsulectl-deal wrote,
carrying the chain under its old name `x-cadence-witness/v0`. It was written by
`generate_test.go.txt`, run as a test inside evidencebook-deal `internal/deal`
at `af543953ab11ca3d64db142ed80407ba3cc893b9` (capsule-cli `v0.1.0-rc28`), with
`VIEWER214_OUT` set to an output directory. The viewer keeps it to show what a
page does for such a copy: AAC reads only `parent-log-witness/v1`, so the page
draws no parent-log line for it.
