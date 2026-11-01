# Witnessed History card fixtures (capsule-viewer#183)

Every `*.bundle.json` here was written by a real capsulectl, built from
capsule-cli `e89c807ff7b3bfd5a069bd7e101aeb3e71349da5` (tag `v0.1.0-rc28`), by
`examples/standard-history/cut_witness_fixtures.sh` on a scratch profile;
`verify/<name>.json` is what `capsulectl verify --bundle` printed for it (all
VALID). `cut.json` names the holder's keys and both commits; AAC's Python
reference ran at `d89f4600d53fb17fcb15d28ff77723c9310d3c8e` (`ts/v0.13.0`).

**The Receipts are TEST-KEYED.** Each block's `as_of.receipts` comes from
agent-action-capsule's `anchor-witness-v1` vectors (a byte copy is
`../aac/anchor-witness-v1.json`, sha256
`21544e319dd46320f0c388b13080235fe0a258d0d8621bd1e77fbcf11253e59d`). The
witnesses' keys derive from public labels and the anchor is a label digest,
for those vectors only: no cll-checkpoint hashes to it, so no block here
carries `as_of.checkpoint`, and no public witness was contacted. The reader's
witness list that accepts them is the vectors' `default` policy.

`witness_cases.json` is what `witness_cases.py` wrote: the card (AAC's
`person-3-months` vector re-derived over the vectors' anchor), the block, the
vector each Receipt comes from (`witness_case`), the report AAC expects for it
(`witness_expected`) and the reference `check_card` properties.

| Bundle | Receipts | Under the vectors' list the page draws |
|---|---|---|
| `person-shared-unwitnessed` | none | nothing about a witness |
| `person-shared-witnessed` | EdDSA, with `iat` | "Snapshot recorded Nov 1, 2026 08:04 UTC by witness-a" |
| `person-shared-witnessed-untimed` | EdDSA, no `iat` | "Snapshot recorded by witness-a" |
| `person-shared-witnessed-es256` | ES256 | "... by witness-b" |
| `person-shared-witness-unlisted` | a key the list does not name (FAIL) | nothing about a witness |
| `person-shared-witness-tampered` | one signature bit flipped (FAIL) | nothing about a witness |
| `person-shared-witnessed-asof-fails` | passes, but the card's as_of fails | refused: no card, no line |

Under no list (the default) every bundle with Receipts says only that a witness
receipt came with the card, not checked. The real check runs in
`ts/test/standard-history-witness.test.ts`; the Chromium pages in
`js-tests/standard_history_card.test.js` stand in for it with the report AAC's
vector expects.
