# Test fixtures

Vendored byte-for-byte from `agent-action-capsule`'s
`vectors/evidence-result/` ([batch4-evidence-result-schema-v0], schema frozen
2026-09-22) -- the one synthetic OO positive fixture plus five negative
fixtures, each mutated from the positive by exactly one field. See that
repo's `vectors/evidence-result/README.md` for the full case table.

This is a copy for this repo's own render tests, not a second definition:
`spec/evidence-result-v0.md` and `schemas/evidence-result-v0.json` in
`agent-action-capsule` remain the normative source.

## Claim-type fixtures (PROPOSED, Steven's ruling 2026-09-25)

Vendored byte-for-byte from the same directory on the
`desk/result-v0-claim-types` branch of `agent-action-capsule` (the
`reconcile` / `close` claim types; `cmp`-verified against that branch's
`60d6e63`):

- `pos-oo-reconcile-result.json` (tallies keyed lowercase, as
  `schemas/judge/close-v1.json` keys them), `pos-oo-close-agreed-result.json`,
  `pos-oo-close-unilateral-result.json`,
  `pos-oo-close-unilateral-named-peer-result.json`,
  `pos-oo-close-contested-result.json` -- schema positives; the last four
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
`pos-oo-close-contested-result.json` is the negative fixture for "never the
agreed mark, never UNILATERAL's label" (the tests assert the absence on the
rendered row), and the vendored
`neg-close-contested-without-peer-close-ref.json` pins the refusal.
