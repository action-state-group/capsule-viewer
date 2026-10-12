# History Card fixtures

Every file here was written by a real capsulectl, built from capsule-cli
`521d41f315a69d38a1f793dfb159c249abbcfcb3` (PR #209, branch
`deal-history-container-verb`), by `examples/history/cut_fixtures.sh` on
scratch profiles. Nothing was re-signed or re-sealed. The deals are the ones
capsule-cli's own `deal_history_test.go` makes; `cut.json` names their ids,
the holder's key, the second profile's key and the private values the deals
hold.

When these were cut (2026-10-12), PR #209's published head was
`993949f8677db44a2d916ae067df40a2763e0095`, which still writes the earlier
`x-deal-history/v0` container with an unsigned selection. The commit above is
the one that writes the shape this page reads; it was not yet pushed to the PR.

| File | What it is | `capsulectl verify --bundle` | The page |
| --- | --- | --- | --- |
| `history-counterparty.bundle.json` | `deal history` over the closed, private and floor deals (`--audience counterparty`, the default: the Standard preset) | VALID | the card |
| `history-adjudicator.bundle.json` | the same deals, `--audience adjudicator` | VALID | the card |
| `history-keep.bundle.json` | the same deals, `--audience keep` (the holder's own copy) | VALID, audience `keep` | Not a shareable History |
| `mutant-flipped-outcome.bundle.json` | the counterparty History with the closed deal's report saying it failed | INVALID: `deal_bundle_not_the_selected_one` | This History does not check |
| `mutant-mixed-signer.bundle.json` | the counterparty History with a second profile's deal spliced in beside the picked ones | INVALID: `deal_not_in_selection`, `deal_signers_differ` | Not a shareable History |
| `mutant-not-in-selection.bundle.json` | the counterparty History with the holder's unpicked deal spliced in | INVALID: `deal_not_in_selection` | Not a shareable History |

`verify/<name>.json` is what `capsulectl verify --bundle` printed for each
file, as printed. The mutants are made by `examples/history/make_mutants.py`.

The shareable files (counterparty, adjudicator) carry none of the floor,
address, card, code or contact strings in `cut.json`; the keep file carries
them. `tests/test_history_card_design.py` scans the bytes.

## Recut

    go build -o capsulectl ./cmd/capsulectl          # in a capsule-cli checkout at the commit above
    examples/history/cut_fixtures.sh path/to/capsulectl path/to/capsule-cli

Keys, deal ids, nonces and times are new on every cut, so a recut rewrites
every file and `cut.json`. When #209's head moves, recut from it and update
the commit named above.
