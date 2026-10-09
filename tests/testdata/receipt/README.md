# Receipt fixtures

The single copies are built by `examples/receipt/build_fixtures.sh CAPSULE_CLI_CHECKOUT` through the real
capsulectl, at capsule-cli `fde7ee0d29df980f7b202376023bc575f8794a37`. Synthetic: capsule-cli's
retail-checkout demo (an example shop, an example item), generated keys, no account or
session identifiers.

| Files | What they are |
| --- | --- |
| `keep.*`, `counterparty.*`, `adjudicator.*` | One deal and the three copies capsulectl cuts of it: the user's own (`keep`) and the shared copies for the other party and for an adjudicator. The same records, at the same log places, in all three; the share builder withheld what each audience must not get. |
| `golden-2.bundle.json`, `golden-2.snapshot.json` | capsule-cli's presentation golden for the unilateral receipt (`internal/cli/testdata/presentation/2-unilateral-receipt`), unchanged: the bundle, and the text deal-view.js showed for it, in order. `tests/test_receipt_golden.py` accounts for every line. |
| `bilateral-*.bundle.json` | Built by `examples/receipt/build_bilateral_fixtures.sh CAPSULE_CLI_CHECKOUT 53b9bdce7ab773f36271be1d3385cfb3dc94ae0b`. One synthetic deal seen by both parties: the buyer's agent (the retail-checkout demo) and the shop's agent recording the same sale (offer, the buyer's acceptance, commit; typed records). `compose_bilateral.py` puts two copies, byte for byte, into a `composed/v1` container capsulectl sealed and checkpointed: `-counterparty` (both counterparty copies, one agreeing join), `-adjudicator` (both adjudicator copies, an agreeing and a mismatching join), `-keep` (the buyer's own copy beside the seller's counterparty copy) and `-two-deals` (the buyer's counterparty copy beside a seller copy of another deal). No producer agrees one deal id between two parties yet, so the capsulectl built for these takes the deal id from `CAPSULE_FIXTURE_DEAL_ID` (a one-line change to a copy of the checkout, applied by the script). The joins are on the copies' root records and are the fixture composer's choice; the observers' roles and custody domains are declared by it. |
| `<name>.verify.json` | What `capsulectl verify --bundle` reported for that bundle, as written. The module's context is built from it; nothing in this package verifies. |

`../aac-presentation/` vendors agent-action-capsule's manifest schema
(`schemas/presentation-manifest-v0.json`), its built-in manifests and three example
manifests from `schemas/examples/presentation-manifest-v0/`, at agent-action-capsule
`67b056c`.
