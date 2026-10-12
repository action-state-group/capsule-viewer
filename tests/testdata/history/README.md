# History Card fixtures

## `nested-selection.bundle.json` and `nested-mutant-flipped-outcome.bundle.json`: STAND-INS

These are hand-built stand-ins, pending the container verb (neutral
`[deal-history-container-verb]`), which does not exist yet. They pin the
nested shape the History Card reads (docs/design/history-card.md, sections 1
and 5), the selection and the recompute. They do not verify, and nothing here
claims they do:

- the container carries no records, log, checkpoint or certificate of its own;
- each member bundle under `extensions["x-history-selection/v0"].deals` is the
  design fixture's records for one deal, regrouped, with no checkpoint,
  completeness certificate or signature;
- nothing is signed or re-sealed. The records, capsule ids and disclosures are
  the design fixture's own bytes.

They are built by `examples/history/build_nested_fixture.py` from
`selection.bundle.json` (deterministic). The mutant is the same container with
one outcome flipped in what the card states (`outcome:mismatch` becomes
`outcome:match`), every record unchanged.

When the container verb exists, both are replaced by a container it writes
from real per-deal bundles, and that container is held to `capsulectl verify`.

## `selection.bundle.json`: the design fixture (flat, superseded shape)

The fixture the design was first read against (merged in #23): eight records
of seven deals in one flat bundle. That shape cannot verify on real binaries:
each real deal lives in its own log with its own checkpoint, and rc15's
`verify --bundle` reports it INVALID (`membership_record_unbound`). The module
does not read top-level records, so this file never renders a card; it is
kept as the source the stand-ins are regrouped from and for the definition
digest the account core pinned.
