<!-- SPDX-License-Identifier: Apache-2.0 -->
# A countersigned x-deal-v1 deal

One sample deal (synthetic parties, generated keys), written by a throwaway test in evidencebook at `bf15ca27` that follows `TestAssuranceDocSequenceRunsOnAV1Deal` (`capsulectl/internal/deal/deal_assurance_doc_test.go`), for #456: the receipt page fills COUNTERSIGNED only from its own check of the countersigned copy it carries.

| File | What it is |
|---|---|
| `countersigned-copy.bundle.json` | The buyer's withheld bundle (`deal report --bundle FILE --withheld`) at the book's first checkpoint (1 record), with a `countersign/v1` entry by a test countersigner key attached, as `deal countersign` stores it. |
| `countersigners.json` | The countersigner rows that name that key "Example Countersigner" (`[{name, key_ids}]`). |
| `same-checkpoint.bundle.json`, `same-checkpoint.verify.json` | The buyer's keep copy (`deal report --bundle`) at the same checkpoint (1 record), and `capsulectl-deal verify --bundle` on it (VALID, x-deal-v1 `pass`). |
| `later-checkpoint.bundle.json`, `later-checkpoint.verify.json` | The keep copy after a statement and a tick (2 records), and its verify report. |
| `self-countersigned-copy.bundle.json`, `self-countersigners.json` | A withheld bundle at the first checkpoint countersigned by the buyer's own signing key (its declared producer key), and rows that list that key as "Looks Independent". |
| `two-record-countersigned-copy.bundle.json`, `two-record-countersigners.json` | The withheld bundle at the later checkpoint (2 records), countersigned by another test key, and its rows. |
