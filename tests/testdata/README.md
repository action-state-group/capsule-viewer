# Test fixtures

Vendored byte-for-byte from `agent-action-capsule`'s
`vectors/evidence-result/` (schema frozen 2026-09-22) -- the one synthetic EXAMPLE-ORG positive fixture plus five negative
fixtures, each mutated from the positive by exactly one field. See that
repo's `vectors/evidence-result/README.md` for the full case table.

All vendored `agent-action-capsule` fixtures were re-synced byte-for-byte from
its `vectors/evidence-result/` on 2026-10-01, when the placeholder org became
`EXAMPLE-ORG`; the dated commit notes below describe the original vendoring.
`neg-render-reconcile-one-sided-only.json` was rebuilt from the re-synced
reconcile positive by the same four tally edits.

This is a copy for this repo's own render tests, not a second definition:
`spec/evidence-result-v0.md` and `schemas/evidence-result-v0.json` in
`agent-action-capsule` remain the normative source.

## Claim-type fixtures (PROPOSED, the 2026-09-25 ruling)

Vendored byte-for-byte from the same directory on a pre-merge branch of
`agent-action-capsule` (the
`reconcile` / `close` claim types; `cmp`-verified, all 29 vendored files,
against that branch's `963fe99` -- rebased onto main after the maintainer's
fourth pass, 2026-09-29, which changed no fixture (they are byte-identical
to the third pass's `1529b73`);
since the second pass the CONTESTED positive carries `verdict: not_met`,
bucketed under `not_met`: a contested Close never counts as met):

- `pos-example-org-reconcile-result.json` (tallies keyed lowercase, as
  `schemas/judge/close-v1.json` keys them), `pos-example-org-close-agreed-result.json`,
  `pos-example-org-close-unilateral-result.json`,
  `pos-example-org-close-unilateral-named-peer-result.json`,
  `pos-example-org-close-contested-result.json` -- schema positives; the last four
  are the Evidence Layer's three Close states
  (`draft-mih-agent-evidence-layer-00`, "Reconcile and Close"), each
  `close_state` the state READ from the Close's inbound links at build
  time. UNILATERAL comes both without and with the peer named: `peer` /
  `peer_close_ref` are optional there, and the named-peer positive is the
  render fixture for "naming the peer is not agreeing with it".
- `neg-close-agreed-without-peer.json`,
  `neg-close-contested-without-peer-close-ref.json`,
  `neg-reconcile-tallies-missing-state.json` -- schema negatives; the card
  refuses all three, never defaults a missing tally to zero, never shows an
  agreed affordance for an agreement with nobody, and never shows a contested
  state for a rebuttal it cannot cite.
- `neg-unrecognized-claim-type.json` -- a schema NEGATIVE (closed-world
  `type` enum) that is a render POSITIVE here: the card shows the claim as
  an `unrecognized` row with the raw type and `contract_ref`, never drops
  it. The schema repo's README points at this repo for that half.

Viewer-OWNED render negatives (not vendored; derived from the positives
above so every digest is still real), pinning the ruling's rendering
constraints rather than leaving them to styling:

- `neg-render-reconcile-one-sided-only.json` -- `reconcile-1` with
  `a_only 3 · b_only 2 · conflicting 0`: the one-sided rows are the only
  non-matched rows, and the finding class must still never attach to them;
  `CONFLICTING` still renders as the count `0`, never hidden.

(A former viewer-owned negative, `neg-render-close-unilateral-with-peer-ref`,
refused a `UNILATERAL` close that named its peer; the schema now permits
that, so the vendored named-peer positive replaced it -- the test asserts
the absence of every agreed affordance on the rendered row instead.)

## `close_state` is derivable -- the records sidecars (2026-09-28)

After the maintainer's adversarial review ("a contested close relabelled
'agreed' validates"), every close claim cites the Close it reports on
(`close_ref`) and its `close_state` is recomputed from the links other
records make to that Close, never trusted. Each close fixture is therefore
vendored with its **`<name>.records.json`** sidecar -- the record headers
the claim cites (`links[{type, target}]`, the evidence-book header shape),
the same objects the schema repo's checker walks. `build_result_entry(result,
records=...)` carries them under `entry.records`; the card indexes them by
digest (the base's `jsonDigest` port) and reads the `acknowledges` /
`rebuts` links at `close_ref`: any `rebuts` => `CONTESTED`, else
`acknowledges` => `AGREED`, else `UNILATERAL`.

- `neg-close-agreed-relabelled-contested.json` (+ `.records.json`) -- the
  CONTESTED positive with `close_state` relabelled `AGREED`, nothing else
  changed. **Schema-valid** (the hole); with its records supplied the card
  renders `CONTESTED` with a `state mismatch` marker (the asserted value on
  the marker's data attribute only, never in the text) -- never `AGREED`.
  Without records it renders the asserted `AGREED` under a
  `producer-asserted` chip, never bare.
- The `AGREED` row no longer carries a mark of its own: the former
  `✓ acknowledged by <peer>` affordance is gone (a check-mark beside a
  state the card may not have verified read as a verification it was not).
  `AGREED` is its label, the peer, and the peer's acknowledging Close by
  digest.

`CONTESTED` needs no viewer-owned negative of its own: the vendored
`pos-example-org-close-contested-result.json` is the negative fixture for "never the
agreed mark, never UNILATERAL's label" (the tests assert the absence on the
rendered row), and the vendored
`neg-close-contested-without-peer-close-ref.json` pins the refusal.

## Digest format (2026-09-28, maintainer's second pass)

Every digest in every vendored file is `SHA-256` + exactly 64 lowercase
hex (schema `$defs/HexDigest`; the output of the canonicalization's
`json_digest`, and the only form the card's `jsonDigest` port can match).
The card's `isDigestRef` and Python's `capsule_viewer.result_v0.is_digest_ref`
accept exactly that form -- no `sha256:` prefix, no uppercase, no other
length. A claim carrying any other form is **refused** at render time (a
refusal row; no state, no derivation chip, nothing resolved), and
`build_result_entry(..., strict=True)` refuses it before embedding;
`test_every_vendored_fixture_is_in_the_vectors_digest_form` pins that no
vendored file trips it. No fixture is vendored for this: the negatives are
mutations of the positives in the tests (`sha256:`-prefixed, 63/65 hex,
uppercase, non-hex, empty, non-string).

## The counterparty is the named peer's book (2026-09-29, maintainer's third pass)

"Neither book_id nor signer alone is enough, since a producer can mint a
second book or a second key equally easily." The card now applies the two
parts of the counterparty rule a record header can show: an
`acknowledges` / `rebuts` link makes a state only when the linking record's
**(1) `book_id`** is present and differs from the cited Close's and **(2)**
equals the claim's named **`peer`**; a Close whose header names no
`book_id` takes no link at all. Part **(3)** -- a different signer key --
is not visible in a record header (the vendored sidecars carry `v`,
`book_id`, `seq`, `links`, ...; no `key_id`), so it is the emitter's and the
CLI's, which verify the Producer Envelope under its `key_id`. Because the
card cannot check it, every row it draws `AGREED` carries a visible caveat
(fourth pass): `rv0-close-key-unchecked`, "peer key not checked -- this card
sees no signing keys, so it cannot show the peer's record was signed under
a key other than this Close's". An ignored link is listed on
the row with its reason (`rv0-close-ignored-link`), never counted. Three
link-walk negatives vendored byte-for-byte from `1529b73` (unchanged at `963fe99`), each schema-valid,
each asserting `AGREED`, each rendering `UNILATERAL` with a `state mismatch`
marker and never the agreed wording:

| File | The acknowledger | Why it makes no state |
|---|---|---|
| `neg-close-agreed-self-acknowledged` (+ `.records.json`) | book `example-org`, the Close's own (seq 42) | (1) a producer cannot agree with itself |
| `neg-close-agreed-third-book` (+ `.records.json`) | book `example-org-audit` (seq 7), not the named peer `example-org-sor` | (2) a different book is necessary, not sufficient |
| `neg-close-agreed-bookless-close` (+ `.records.json`) | the named peer `example-org-sor` (seq 20) -- but the cited Close names no `book_id` | a Close that names no book has no counterparty |

Still not vendored from `963fe99` (follow-up): `neg-close-contested-verdict-met`
(schema-rejected) and the link-walk negatives `neg-close-ref-not-in-evidence`,
`neg-close-peer-ref-not-in-evidence` (both refs must resolve inside
`evidence[]`). The card does not yet apply that walk rule, so vendoring the
fixtures before the rule would pin the wrong render.

## Coverage report fixtures (PROPOSED)

- `pos-coverage-report-result.json` -- vendored byte-for-byte from
  `capsule-engine`'s `tests/fixtures/evidence-result/coverage-report-result.json`
  (coverage per requirement, `coverage-report/v0`; proposed, not yet on that
  repo's main -- `cmp`-verified against its commit `3163f8d`; since then
  only `view.producer_name` changed, to `EXAMPLE-ORG`). Three
  requirements: one covered, one with a missing source and a named remedy,
  one whose records all come from one producer (correlated, not
  corroborated).
- `pos-coverage-report-contract.json` -- the contract it cites, vendored
  byte-for-byte from `capsule-engine`'s `examples/contracts/ai-act-human-oversight.json`.

## Epistemic types are lowercase (Steven's ruling, 2026-10-01)

`epistemic_type` values are the Evidence Layer's closed set spelled exactly
as `agent-action-capsule`'s `schemas/vendor/epistemic-types.json` spells
them: lowercase, underscore-separated (`observed_event`,
`system_of_record_fact`, ...). The viewer keys on those tokens. A document
from another tool that still writes a value in uppercase (`OBSERVED_EVENT`)
is folded to the lowercase token for lookup and read as recognized, with the
spelling it was written in kept beside it; a value not in the set in any
case is kept as written and marked unrecognized, never dropped.

`pos-coverage-report-contract.json` is still uppercase
(`accepted_epistemic_types: ["SYSTEM_OF_RECORD_FACT", ...]`) because its
upstream, `capsule-engine`'s `examples/contracts/ai-act-human-oversight.json`,
is still uppercase on that repo's `main`. It is not hand-edited here; it
re-vendors when upstream lowercases, and until then it is the fixture for
the legacy-uppercase reading.
