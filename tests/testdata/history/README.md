# History Card fixtures

Every file here was written by a real capsulectl, built from capsule-cli
`7ebf00173c95e9287069a159a864e0793744da2e` (PR #209's head, branch
`deal-history-container-verb`), by `examples/history/cut_fixtures.sh` on
scratch profiles. Nothing was re-signed or re-sealed. The deals are the ones
capsule-cli's own `deal_history_test.go` makes; `cut.json` names their ids,
key K (`holder_key`, the key that signs the selection record), the second
profile's key and the private values the deals hold.

| File | What it is | `capsulectl verify --bundle` | The page |
| --- | --- | --- | --- |
| `history-counterparty.bundle.json` | `deal history` over the closed, private and floor deals (`--audience counterparty`, the default: the Standard preset) | VALID | the card |
| `history-adjudicator.bundle.json` | the same deals, `--audience adjudicator` | VALID | the card |
| `history-keep.bundle.json` | the same deals, `--audience keep` (the keep copy, never one to send) | VALID, audience `keep` | Not a shareable History |
| `mutant-flipped-outcome.bundle.json` | the counterparty History with the closed deal's report saying it failed | INVALID: `deal_bundle_not_the_selected_one` | This History does not check |
| `mutant-mixed-signer.bundle.json` | the counterparty History with a second profile's deal spliced in beside the picked ones | INVALID: `deal_not_in_selection`, `deal_signers_differ` | Not a shareable History |
| `mutant-not-in-selection.bundle.json` | the counterparty History with an unselected deal of the same key spliced in | INVALID: `deal_not_in_selection` | Not a shareable History |
| `mutant-selection-not-root.bundle.json` | the counterparty History with its `root` set to another capsule id | INVALID: `selection_record_not_root` | This History does not check |
| `mutant-not-history-log.bundle.json` | the counterparty History with its completeness certificate's `log_id` set to a deal's log | INVALID: `not_a_history_log` (and `checkpoint_field_mismatch:log_id`) | This History does not check |

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
