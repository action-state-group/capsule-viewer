# Witnessed deal bundle fixtures (capsule-viewer#214)

`cadence-all.bundle.json` and `cadence-part.bundle.json` are deal bundles a real
capsulectl-deal wrote, each carrying an `x-cadence-witness/v0` chain: the deal's
checkpoint as a leaf of a cadence tick's tree, that tick's entry in the cadence
log, the cadence checkpoint and one witness receipt over it. In `cadence-part`
the deal has one more step after the tick, so the chain is over an earlier
checkpoint of the deal, which a consistency proof shows the bundle's checkpoint
extends (`extent: "part"`).

They were written by `generate_test.go.txt`, run as a test inside
evidencebook-deal `internal/deal` at `af543953ab11ca3d64db142ed80407ba3cc893b9`
(capsule-cli `v0.1.0-rc28`), with `VIEWER214_OUT` set to an output directory.
It uses that package's own test harness: the synthetic retail demo deal, a
generated profile key, and a generated witness key whose receipt is signed in
process (registration time 2026-10-04T09:00:05Z). No witness was contacted; the
receipts' `ts_url` is a local listener that never answers.

**Everything here is TEST-KEYED and synthetic.** No settlement or preimage is in
these bundles.

`expected.json` gives the witness's key as hex DER SubjectPublicKeyInfo (the
reader's witness list that accepts it) and what `capsulectl verify --bundle
--witness-directory` (capsule-cli's `cadenceClaim`) said for each bundle under a
directory with that key: `pass` for both. `ts/test/cadence-witness.test.ts`
holds the runtime's `readerCadenceWitness` to the same verdict, and tampers each
link to the finding capsule-cli names for it.
