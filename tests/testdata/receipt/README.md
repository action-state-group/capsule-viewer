# Receipt fixtures

Built by `examples/receipt/build_fixtures.sh CAPSULE_CLI_CHECKOUT` through the real
capsulectl, at capsule-cli `fde7ee0d29df980f7b202376023bc575f8794a37`. Synthetic: capsule-cli's
retail-checkout demo (an example shop, an example item), generated keys, no account or
session identifiers.

| Files | What they are |
| --- | --- |
| `keep.*`, `counterparty.*`, `adjudicator.*` | One deal and the three copies capsulectl cuts of it: the user's own (`keep`) and the shared copies for the other party and for an adjudicator. The same records, at the same log places, in all three; the share builder withheld what each audience must not get. |
| `golden-2.bundle.json`, `golden-2.snapshot.json` | capsule-cli's presentation golden for the unilateral receipt (`internal/cli/testdata/presentation/2-unilateral-receipt`), unchanged: the bundle, and the text deal-view.js showed for it, in order. `tests/test_receipt_golden.py` accounts for every line. |
| `<name>.verify.json` | What `capsulectl verify --bundle` reported for that bundle, as written. The module's context is built from it; nothing in this package verifies. |

`../aac-presentation/` vendors agent-action-capsule's manifest schema
(`schemas/presentation-manifest-v0.json`), its built-in manifests and three example
manifests from `schemas/examples/presentation-manifest-v0/`, at agent-action-capsule
`67b056c`.
