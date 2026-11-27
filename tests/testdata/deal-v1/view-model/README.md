<!-- SPDX-License-Identifier: Apache-2.0 -->
# x-deal-v1 fixtures for the receipt view-model note's section 5

Written for capsule-viewer#488 (`docs/design/receipt-view-model.md`, section 5: the anti-hardcode test and its differential pairs) by a throwaway test in evidencebook at `9b7a20d2` (`capsulectl/internal/deal`, run with `CV488_OUT=<dir> go test ./internal/deal/ -run TestCV488`), kept here as `generator.go.txt`. The same generator also writes `../buyer-paid/` (`-run TestCV512`, #512). Synthetic parties, generated keys: each run signs with new keys, so record ids and digests differ between files even where the deal does not. Each `*.verify.json` is what `capsulectl-deal verify --bundle` (built from the same evidencebook revision) printed for its bundle: every one VALID, x-deal-v1 `pass`, report `standalone`. Each `*.offer.json` is the holder's sealed offer record (the offer file's `agent_input`), which a page is given as `dealOffer` (#461).

| File | What it is |
|---|---|
| `settled.*` | The buyer's keep copy of a deal paid (4500 USD minor, "lamp") and settled: both sides said `paid_as_agreed=met` and the row's window passed, so the report is `settled` with the row `agreed`, `met`. |
| `adjudicator-copy.*` | The adjudicator copy the buyer cut of a disputed deal (`--share adjudicator --bundle`): rows withheld. |
| `full-adjudicator-copy.*` | The full adjudicator copy the buyer's answer to the adjudicator's request carries (`deal respond`, evidencebook#861): its book's `records` and `received`. |
| `pair/item-b.*` | As `settled`, with the offer's item "kettle": differs from `settled` in the item. |
| `pair/amount-b.*` | As `settled`, paid 4400: differs from `settled` in the amount. |
| `pair/ruled-a.*`, `pair/ruled-b.*` | The buyer's keep copy after a final ruling of `paid_as_agreed` not met, against the seller (`a`) and against the buyer (`b`): they differ in the ruling's `against`. |
