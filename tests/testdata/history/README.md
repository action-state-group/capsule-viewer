# History Card fixtures

Every file here was written by a real capsulectl, built from capsule-cli
`ff8daad50dbb255053c3732684e81be516a461de` (PR #209's head, branch
`deal-history-container-verb`, built on #211 `e9b1f210`), by
`examples/history/cut_fixtures.sh` on scratch profiles. The deals are the ones
capsule-cli's own `deal_history_test.go` makes; `cut.json` names their ids,
key K (`holder_key`, the key that signs the selection record), the second
profile's key, the private values the deals hold and the two buyers' values.

**Audiences.** `deal history` writes `--audience history` by default: each
deal's copy withholds every record's payload, so only a record's time and an
act's `effect.status` show. That is the one shareable History, and the page
renders its card. `keep` is the copy to keep, every private value in it: VALID but never one to send.
capsulectl refuses `--audience counterparty` and `--audience adjudicator` for
a History: `refused/<audience>.txt` is what it printed (exit status 2), and
the tests build those Histories by re-sealing in memory
(`capsule_viewer.history.fixture.with_audience`).

**Not proven.** `capsulectl verify` reports `"not_proven": ["outcome",
"action_class"]` on every History for the `history` audience (not a finding:
it is still VALID). The page derives the same list from the payloads the
copies withhold and shows outcome and action class as "not proven: the copy
withholds the record payload". Proving them would need a per-step sealed
record disclosing only them: a producer decision for capsule-cli 0.1.5
(Steven's call).

| File | What it is | `capsulectl verify --bundle` | The page |
| --- | --- | --- | --- |
| `history-history.bundle.json` | `deal history` over the closed, private and floor deals (the default audience, history) | VALID, `not_proven: [outcome, action_class]` | the card |
| `history-keep.bundle.json` | the same deals, `--audience keep` | VALID, audience `keep` | Not a shareable History |
| `history-two-buyers.bundle.json` | the seller's two sales, to buyer A and to buyer B (the History sent to B) | VALID, `not_proven` | the card |
| `history-two-buyers-keep.bundle.json` | the same two sales, `--audience keep` (the scan's control) | VALID, audience `keep` | Not a shareable History |
| `mutant-flipped-status.bundle.json` | the history History with the pay act's `effect.status` set to failed | INVALID: `deal_bundle_not_the_selected_one`, `deal_invalid` | This History does not check |
| `mutant-mixed-signer.bundle.json` | a second profile's deal spliced in beside the picked ones | INVALID: `deal_not_in_selection`, `deal_signers_differ` | Not a shareable History |
| `mutant-not-in-selection.bundle.json` | an unselected deal of the same key spliced in | INVALID: `deal_not_in_selection` | Not a shareable History |
| `mutant-selection-not-root.bundle.json` | its `root` set to another capsule id | INVALID: `selection_record_not_root` | This History does not check (`history_bundle_unverified`: graph closure fails) |
| `mutant-not-history-log.bundle.json` | its completeness certificate's `log_id` set to a deal's log | INVALID: `not_a_history_log` | This History does not check (`history_bundle_unverified`: the checkpoint fails) |
| `mutant-payload-disclosed.bundle.json` | one payload of the closed deal disclosed (taken from its keep copy) | INVALID: `deal_bundle_not_the_selected_one`, `deal_payload_disclosed` | This History does not check |
| `mutant-counterparty-member.bundle.json` | the private deal's counterparty copy (`disclose --share counterparty`) in place of its history copy | INVALID: `deal_bundle_not_the_selected_one`, `deal_audience_not_selected`, `deal_payload_disclosed` | This History does not check |
| `mutant-audience-not-history.bundle.json` | the sealed audience set to counterparty and the selection record re-sealed (its old signature kept) | INVALID: `selection_record_unsigned`, `selection_audience_not_history`, `deal_audience_not_selected` x3 | This History does not check (`history_bundle_unverified`: the re-sealed root's membership fails) |

"The page" is the module under a context carrying capsulectl verify's verdicts
on the file (`js-tests/aacContext.js`). The file-only check (the Python twin,
and the module without a context) finds the same findings, but for
`history_bundle_unverified` and `history_log_unproven`, which come from the
page's verifier. capsulectl's `selection_record_unsigned` on the last mutant
is a signature that no longer verifies: the page checks no signature (NOT_CHECKED,
checked by capsulectl on the sender's machine, not by this page).

`verify/<name>.json` is what `capsulectl verify --bundle` printed for each
file, as printed. The mutants are made by `examples/history/make_mutants.py`;
only `mutant-audience-not-history` is re-sealed, and none is re-signed.

**Byte scans** (`tests/test_history_card_design.py`): the history History
carries none of the floor, address, card, code or contact strings in
`cut.json`; the keep History carries each kind. The two-buyer History carries
none of buyer A's name, contact, address, item, price (written every way
capsule-cli's test writes it) or message text, nor buyer B's; its keep copy
carries A's name, address, item and price (neither keep copy holds the
contact or message text).

## Recut

    go build -o capsulectl ./cmd/capsulectl          # in a capsule-cli checkout at the commit above
    PYTHON=.venv/bin/python3 examples/history/cut_fixtures.sh path/to/capsulectl path/to/capsule-cli

Keys, deal ids, nonces and times are new on every cut, so a recut rewrites
every file and `cut.json`. When #209's head moves, recut from it and update
the commit named above.

**Wording data.** `l0-golden.json` holds the L0 goldens (History Basic wording, section 5.2):
section 5.2's example and a year-end case in memory, and the two real cards
(`history-history`, `history-two-buyers`: K = 0 and F = 0, since capsule-cli
writes only `dispatched`). `t8-banned.json` is the T8 wording list: the three
banned deal-status phrases and the similarity-claim patterns. The Python and
JavaScript tests both read it, and other lints may reuse it.
