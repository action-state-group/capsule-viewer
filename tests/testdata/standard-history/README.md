# History card (standard_history/1) fixtures

Every `*.bundle.json` here was written by a real capsulectl, built from
capsule-cli `f19729c15c88e8eba5e11cf62954c99cdc0f25d2` (main), by
`examples/standard-history/cut_fixtures.sh` on a scratch profile, and
`verify/<name>.json` is what `capsulectl verify --bundle` printed for it:
every file is VALID. `cut.json` names the holder's keys and the two commits.

Each bundle's root record carries one card as its `agent_input` (the payload
`capsulectl seal` takes) and an `x-standard-history/v0` block in its
extensions with what a receiver holds beside the card: `policy` {digest,
window} and `as_of` {anchor, anchor_time, first_checkpoint_time}. A block that
also carries `deals` (SH §5.2's deal entries) is the holder's own copy, named
`*-own`; no other file carries deal entries.

`cases.json` is what `examples/standard-history/cases.py` wrote with
agent-action-capsule's Python reference at `1037a1cf7f16bc48de3ed28efe6dfb7ef7908bb4`:
each case's card, block, and the properties and standard verdict the reference
`check_card` reports for them. The cards are AAC's vectors, except
`two-currencies-own` (USD and EUR in one decade) and `all-undecided-own`,
derived with the reference `derive_card` from entries cases.py writes.
The negatives (`neg-*`) are cards the holder signed that are not standard
cards. AAC's `percentage-fraction` is not among them: capsulectl seals no
float, so that card is tested only as a vector.

`aac/vectors.json` is a byte copy of agent-action-capsule's
`vectors/standard-history-v0/vectors.json` at `1037a1c` (sha256
`4126c66efaa5f5c94fa473432752f1eb596439a190476bd3799204afe3cb43c5`, as AAC's
`manifest.json` names it). js-tests run every vector through the module's
check. Every digest in it is a label digest, for those vectors only.
