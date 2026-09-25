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
`reconcile` / `close` claim types):

- `pos-oo-reconcile-result.json`, `pos-oo-close-agreed-result.json`,
  `pos-oo-close-unilateral-result.json` -- schema positives.
- `neg-close-agreed-without-peer.json`,
  `neg-reconcile-counts-missing-state.json` -- schema negatives; the card
  refuses both, never defaults a missing count to zero and never shows an
  agreed affordance for an agreement with nobody.
- `neg-unrecognized-claim-type.json` -- a schema NEGATIVE (closed-world
  `type` enum) that is a render POSITIVE here: the card shows the claim as
  an `unrecognized` row with the raw type and `contract_ref`, never drops
  it. The schema repo's README points at this repo for that half.

Viewer-OWNED render negatives (not vendored; derived from the positives
above so every digest is still real), pinning the ruling's rendering
constraints rather than leaving them to styling:

- `neg-render-reconcile-one-sided-only.json` -- `reconcile-1` with
  `A_ONLY 3 · B_ONLY 2 · CONFLICTING 0`: the one-sided rows are the only
  non-matched rows, and the finding class must still never attach to them;
  `CONFLICTING` still renders as the count `0`, never hidden.
- `neg-render-close-unilateral-with-peer-ref.json` -- a `UNILATERAL` close
  that also carries `peer` + `peer_close_ref`: refused, and nothing on the
  page may read as agreed.
