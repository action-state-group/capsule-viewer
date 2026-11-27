<!-- SPDX-License-Identifier: Apache-2.0 -->
# An x-deal-v1 keep copy and the holder's own sealed offer

One sample deal (synthetic parties, generated keys), written by a throwaway test in evidencebook at `ae4653df` that runs `agreedBoth` (`capsulectl/internal/deal/deal_v1_dispute_test.go`) with the offer's `terms.item` set to "200 conference badges, delivered by Friday", for #461: the receipt names the item from the holder's own sealed offer.

| File | What it is |
|---|---|
| `keep-copy.bundle.json` | The buyer's keep copy (`deal report --bundle`) after both agreements. |
| `keep-copy.verify.json` | `capsulectl verify --bundle` on it: VALID, x-deal-v1 `pass`, report `standalone`. |
| `offer.json` | The buyer's own sealed offer record (`{"x-deal-v1": …, "body": …}`, the `agent_input` of the offer `deal offer --out` wrote). SHA-256 over its JCS bytes is `b0904ce6…eabda`, the digest the keep copy's sealed agreement cites as its `offer`. |
