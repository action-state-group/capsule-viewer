<!-- SPDX-License-Identifier: Apache-2.0 -->

# capsulectl's verify report of an x-deal-v0 copy (capsule-viewer#383, CV3b)

The field contract a page reads (`ts/src/verifier-report.ts`, `verifierReportReading`) and the fixtures evidencebook's capsulectl (EB2a, evidencebook#869) tests its output against. Written by `ts/scripts/cut-deal-v0-report-fixtures.mjs` (run from `ts/`), deterministically.

## The contract

The report is `capsulectl deal verify --bundle` output (`capsule-cli-result/v1`), passed as a page's `verifierReport`. It is read only for its own bundle: `spec_version`, `bundle_digest` equal to the page's digest, and `record_identity` naming exactly the bundle's records. The bundle carries `x-deal-v0` and not `x-deal-v1`, and the report has exactly one `extensions[]` entry of kind `x-deal-v0`, in any report form (standalone, in the log, or inline).

In this order:

1. The entry's `status`: `fail` refuses the copy (capsulectl's "deal" failure line); anything but `pass` reads as no report.
2. `countersign` is bound to the copy, or ignored whatever it says: `countersignatures_sha256` is the lowercase hex SHA-256 of the JCS of the bundle's whole `countersignatures` array (outside the bundle digest), and `entries` has one entry per countersignature whose `signer.key_id` is that countersignature's, in order.
3. A bound entry in `state` `invalid` refuses the copy (capsulectl's "countersign" failure line), as `capsulectl deal report` refuses to show it.
4. The verdict: VALID, or INCOMPLETE only as a producer selection, as for x-deal-v1; otherwise the copy is refused with the verdict.
5. The display members. `countersign.directory` (a string) and each entry, capsule-cli's `CountersignatureReport` as `cli.VerifyCountersignatures` returns it: `state` one of `resolved`, `not_independent`, `unresolved_signer`, `unverified`; a resolved signer's `signer_name`; `receipt` (when present) one of `verified`, `absent`, `unverified`; `checks` (when present) a list of `{name, result}` strings. Any malformed one drops the whole member: the page keeps its own countersign line.
6. `witnessed`: `{status: "verified"|"failed"|"withheld", witness, at}`, as `deal verify --stamp-proof` reports it for x-deal-v1; `verified` needs a non-empty `witness` and `at` in UTC RFC 3339 to the second. Drawn only on the holder's own keep copy drawn for the holder (u219).

A page built by `capsulectl presentation build` through the handshake carries no report, so it shows neither line.

## Files

| File | What it is |
| --- | --- |
| `main-standalone-keep.verify.json`, `main-standalone-counterparty.verify.json`, `mesh-payer-selected.verify.json`, `seller-keep.verify.json` | `../receipt/<name>.verify.json` (what capsulectl printed for `../receipt/<name>.bundle.json`) with one member added by hand: `witnessed`, `{"status": "verified", "witness": "witness.example", "at": "2026-10-27T22:10:00Z"}`, in the `x-deal-v0` entry. capsulectl does not print it for x-deal-v0 yet; EB2a does. |
| `countersigned-keep.bundle.json` | `../receipt/main-standalone-keep.bundle.json` carrying three countersign/v1 entries over its digest, each signed by a generated TEST-ONLY Ed25519 key (seeds `11…`, `22…`, `33…`). The bundle digest is unchanged. |
| `countersigned-keep.verify.json` | `../receipt/main-standalone-keep.verify.json` with `witnessed` as above and a `countersign` member written by hand: what `VerifyCountersignatures` returns against `countersigners.json` with the `22…` key trusted as the producer's (`resolved`, `not_independent`, `unresolved_signer`), and the array's digest. |
| `countersigners.json` | The countersigner directory that lists the `11…` key, as "Example Countersigners Ltd". |
