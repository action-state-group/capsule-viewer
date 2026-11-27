<!-- SPDX-License-Identifier: Apache-2.0 -->
# A paid buyer's x-deal-v1 keep copy

One sample deal (synthetic parties, generated keys), written for capsule-viewer#512 by `TestCV512BuyerPaid` in the throwaway generator kept as [`../view-model/generator.go.txt`](../view-model/generator.go.txt), run in evidencebook at `9b7a20d2` (`capsulectl/internal/deal`, `CV488_OUT=<dir> go test ./internal/deal/ -run TestCV512`), the same generator and revision as `../view-model/`. It is `cvSettled`'s flow with an offer whose terms are `{"item": "Oak desk lamp", "quantity": 1, "price_minor": 4500, "currency": "USD"}` and whose `paid_as_agreed` row owes 4500 USD minor: the buyer pays 4500, seals its payment record as settled, both sides say `paid_as_agreed=met`, the row's window passes, and the buyer writes its keep copy (`deal report --deal <id> --bundle <file>`). The price, the row and the payment agree, unlike `../view-model/settled.*` (row 6000, payment 4500), a differential-pair base.

| File | What it is |
|---|---|
| `keep-copy.bundle.json` | The buyer's keep copy: report `settled`, its one row `agreed`, `met`; the buyer's settled payment record for 45.00 USD. |
| `keep-copy.verify.json` | What `capsulectl-deal verify --bundle keep-copy.bundle.json` printed (capsulectl-deal built from the same revision): VALID, x-deal-v1 `pass`, report `standalone`. |
| `keep-copy.offer.json` | The buyer's own sealed offer record (the offer file's `agent_input`), which a page is given as `dealOffer` (#461). |

`js-tests/receipt_deal_v1_surface.test.js` draws it as the golden page `tests/goldens/receipt-deal-v1-buyer-paid.html` ([`../../../goldens/README.md`](../../../goldens/README.md)), and `ts/test/helpers/receipt-deal-v1-pages.ts` adds it to the view-model note's text and anti-hardcode tests.
