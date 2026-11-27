<!-- SPDX-License-Identifier: Apache-2.0 -->
# An x-deal-v1 keep copy and the holder's own sealed offer

One sample deal (synthetic parties, generated keys), written for #498 by a throwaway test in evidencebook at `8ecabcd` that runs `agreedBoth` (`capsulectl/internal/deal/deal_v1_dispute_test.go`) with the offer's terms set to `{"item": "200 conference badges, delivered by Friday", "quantity": 200, "price_minor": 6000, "currency": "USD"}`, then has the buyer write its keep copy (`deal report --deal <id> --bundle <file>`). `keep-copy.verify.json` is what `capsulectl-deal verify --bundle` built from the same revision printed for it.

| File | What it is |
|---|---|
| `keep-copy.bundle.json` | The buyer's keep copy after both agreements. It carries no `book.offer`: evidencebook#1065 adds that member. |
| `keep-copy.verify.json` | `capsulectl-deal verify --bundle` on it: VALID, x-deal-v1 `pass`, report `standalone`. |
| `offer.pair.json` | The file the buyer's `deal offer --out` wrote, whole: the offer's sent pair `{record, agent_input}` (evidencebook `xdealv1.Pair`), the form evidencebook#1065 carries as `book.offer`. |
| `offer.json` | That pair's `agent_input`, the buyer's own sealed offer record (`{"x-deal-v1": …, "body": …}`), as a page is given it as `dealOffer` (#461). SHA-256 over its JCS bytes is `a4965bbb…c63b52`: the record's `agent_input_digest` and the digest the keep copy's sealed agreement cites as its `offer`. |
