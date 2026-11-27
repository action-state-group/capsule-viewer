<!-- SPDX-License-Identifier: Apache-2.0 -->
# Golden pages and images

The PNGs here are review images of the viewer's pages at a phone width (390px) and a desktop width (1280px). Fonts differ between machines, so no test compares their pixels; each suite checks in a real browser what its images are meant to show and that one is committed for every page and width. The tests named below draw every file here, and `UPDATE_GOLDENS=1` rewrites the files of the tests it runs:

```sh
UPDATE_GOLDENS=1 npx vitest run js-tests/goldens.test.js js-tests/adjudications_card.test.js \
  js-tests/standard_history_card.test.js js-tests/receipt_deal_v1_surface.test.js
```

`js-tests/goldens.test.js` draws the Rules page and the unilateral and bilateral receipts (`rules-*`, `receipt-keep-*`, `receipt-counterparty-*`, `receipt-bilateral-*`); `js-tests/adjudications_card.test.js` and `js-tests/standard_history_card.test.js` draw the `adjudications-page-*` and `standard-history-*` images.

## The x-deal-v1 receipt

`js-tests/receipt_deal_v1_surface.test.js` draws three x-deal-v1 receipt pages with the deal module (`go/receipt/receipt_deal.js`), from the copies in [`../testdata/deal-v1/`](../testdata/deal-v1/README.md) and the capsulectl verify answer the test states for each copy (`envOf` and `GOLDEN_PAGES` in the test; not a capsulectl run). Each page is checked in as HTML, and each PNG is a screenshot of that same page.

| Page | Images | What it is |
|---|---|---|
| `receipt-deal-v1-own.html` | `receipt-deal-v1-own-{390,1280}.png` | The holder's own copy, as the holder's private page shows it: the seller's copy of the ARD demo's deal-fe219bb1ab3d4dec (`counterparty-copy.bundle.json`, read as the seller's keep copy), settled and paid, with a verified witness time stamp on the seller's book. A "Sale receipt". |
| `receipt-deal-v1-shared.html` | `receipt-deal-v1-shared-{390,1280}.png` | The same seller copy as shared with the other side (`--share counterparty`): no "your", no time on its steps, no holder's witness time. |
| `receipt-deal-v1-item.html` | `receipt-deal-v1-item-{390,1280}.png` | The buyer's own keep copy with the buyer's sealed offer (`offer/keep-copy.bundle.json`, `offer/offer.json`): an "Order receipt" with the item, quantity and total in the hero, nothing due yet and no payment record. |

The HTML pages are what a reader outside these tests opens to see a current deal receipt. Each is self-contained: its styles are inlined, and it carries no script and loads nothing over the network, so it opens from `file://`. It holds only the surface (L0) with every toggle closed: the "For checkers" and "Technical details" layers are not on it, and since it has no script, its "Download proof file" buttons do nothing. Judge the page's words and layout, not those buttons.

The test fails when a checked-in page is missing or differs from what the deal module draws now. A change to what the deal receipt draws regenerates the pages and images with `UPDATE_GOLDENS=1 npx vitest run js-tests/receipt_deal_v1_surface.test.js`, in the same pull request.
