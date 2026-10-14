# History Card fixtures

Every file here was written by a real capsulectl, built from capsule-cli
`88503f966ce85c40e01705f37c9ef734678cfd59` (capsule-cli main, #209 merged
as squash 88503f96), by `examples/history/cut_fixtures.sh` on
scratch profiles. The deals are the ones capsule-cli's own
`deal_history_test.go` makes; `cut.json` names their ids, key K
(`holder_key`, the key that signs the selection record), the second profile's
key, the private values the deals hold, the two buyers' values, who each
History sent is for (`recipient`) and the step written after the floor deal's
checkpoint (`later_step`).

**D2, D3, D4.** Each History is on a log of its own, `deal-history/<nonce>`
(the 64-hex nonce its selection record seals). A History for the `history`
audience seals who it is for (`--to`, the sealed `recipient`: "a new buyer";
the two-buyer one "buyer B"); a keep History seals none. Each selection entry
seals `steps_after_checkpoint`: the floor deal has one message written after
its latest checkpoint, so its entry says 1 and no copy shows that step (the
History is still VALID). `capsulectl verify` reports `"holder_stated":
["recipient", "steps_after_checkpoint"]`, the recipient and each deal's count;
the page derives the same and shows them as the holder's statements, never as
checked. capsulectl refuses a History sent without `--to`
(`refused/no-recipient.txt`) and `--to` with `--audience keep`
(`refused/keep-with-recipient.txt`).

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
| `mutant-wrong-nonce.bundle.json` | its completeness certificate's `log_id` set to another History's log (`deal-history/` and that History's nonce) | INVALID: `not_a_history_log` | This History does not check (`history_bundle_unverified`: the checkpoint fails) |
| `mutant-recipient-missing.bundle.json` | the sealed `recipient` removed and the selection record re-sealed | INVALID: `selection_record_unsigned`, `selection_recipient_missing` | This History does not check (`history_bundle_unverified`, `history_log_unproven`) |
| `mutant-steps-negative.bundle.json` | the floor deal's sealed `steps_after_checkpoint` set to -1, re-sealed (the carried selection follows) | INVALID: `selection_record_unsigned`, `selection_entry_malformed`, `deal_not_in_selection` | This History does not check (`history_bundle_unverified`, `history_log_unproven`) |
| `mutant-steps-not-integer.bundle.json` | the same, set to the text `"1"` | INVALID: `selection_record_unsigned`, `selection_entry_malformed`, `deal_not_in_selection` | This History does not check (`history_bundle_unverified`, `history_log_unproven`) |

"The page" is the module under a context carrying capsulectl verify's verdicts
on the file (`js-tests/aacContext.js`). The file-only check (the Python twin,
and the module without a context) finds the same findings, but for
`history_bundle_unverified` and `history_log_unproven`, which come from the
page's verifier. capsulectl's `selection_record_unsigned` on the re-sealed
mutants is a signature that no longer verifies: the page checks no signature (NOT_CHECKED,
checked by capsulectl on the sender's machine, not by this page).

`verify/<name>.json` is what `capsulectl verify --bundle` printed for each
file, as printed. The mutants are made by `examples/history/make_mutants.py`;
only `mutant-audience-not-history`, `mutant-recipient-missing` and the two
`mutant-steps-*` are re-sealed, and none is re-signed.

One reading the page cannot match exactly: a `steps_after_checkpoint` written
`1.0`. capsulectl (`json.Number`) and the Python twin (a float) call it
malformed; the page's `JSON.parse` reads it as the integer 1. capsulectl
never writes one.

**Byte scans** (`tests/test_history_card_design.py`): the history History
carries none of the floor, address, card, code or contact strings in
`cut.json`; the keep History carries each kind. The two-buyer History carries
none of buyer A's name, contact, address, item, price (written every way
capsule-cli's test writes it) or message text, nor buyer B's; its keep copy
carries A's name, address, item and price (neither keep copy holds the
contact or message text). The floor deal's later step (`later_step` in
`cut.json`) is in neither the history nor the keep copy.

## Recut

    go build -o capsulectl ./cmd/capsulectl          # in a capsule-cli checkout at the commit above
    PYTHON=.venv/bin/python3 examples/history/cut_fixtures.sh path/to/capsulectl path/to/capsule-cli

Keys, deal ids, nonces and times are new on every cut, so a recut rewrites
every file and `cut.json`. When capsule-cli's `deal history` or the deal
copies it carries change, recut from the new commit and update the commit
named above.

**Wording data.** `l0-golden.json` holds the L0 goldens (History Basic wording, section 5.2):
section 5.2's example and a year-end case in memory, and the two real cards
(`history-history`, `history-two-buyers`: K = 0 and F = 0, since capsule-cli
writes only `dispatched`; Steven ruled on 2026-10-12 that the zeros stay). `t8-banned.json` is the T8 wording list: the three
banned deal-status phrases and the similarity-claim patterns. The Python and
JavaScript tests both read it, and other lints may reuse it.

## Re-pin to 88503f96

The fixtures were first cut on #209's head `cb68ea9`; #209 merged into
capsule-cli main as squash `88503f96` (its tree is #209's last head
`4b57c929`'s). Between the two, `deal_history.go` and `deal_sale_bundle.go`
are unchanged, but main brought in #216 (`composed.go` joins the parties'
copies on `deal_id`), and `deal.go` now seals the deal id as a top-level
`deal_id` member on every step's Capsule (`dealIDMember`).

What changed in the bytes: every file was recut (new keys, deal ids, nonces
and times, as on any recut). In each deal copy a History carries, every step
record (`action_id` `<deal id>/<n>`) now holds `deal_id`, equal to the
copy's key under `deals`; the deal-report records and the History's own
selection record hold none. The four Histories grow by 340 to 581 bytes.
`refused/` is byte-identical. Every `verify/` report gives the same verdict
and the same finding codes as before; only the ids and digests inside them,
and the order of entries in a report's `disclosures`, differ.

The `x-history-selection/v0` shape is unchanged: the extension's members
(`selection_record`, `selection`, `deals`), each selection entry's
`deal_id`, `bundle_digest` and `steps_after_checkpoint`, the sealed
selection record (`type` `history_selection`, `audience`, `nonce`,
`recipient`, `selection`), the log `deal-history/<nonce>`, and verify's
`holder_stated` and `not_proven` are what `deal_history.go` at 88503f96
writes and what `capsule_viewer/history/recompute.py` and
`static/history_card.js` read. A JSON key diff of every file before and
after shows one added path, `deals/<id>/records[]/deal_id` (a string). The
page reads a record's Capsule ID over every member but `capsule_id`,
`signature` and `key_id`, so the new member needs no change here.
