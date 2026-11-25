<!-- SPDX-License-Identifier: Apache-2.0 -->
# x-deal-v1 test data

| File | What it is |
|---|---|
| `report-vectors.json`, `report-verify-vectors.json`, `report-bundle-vectors.json` | evidencebook's x-deal-v1 report vectors, which the v1 receipt module is held to. |
| `keep-copy.bundle.json` | An x-deal-v1 keep copy as `capsulectl deal report --bundle` cuts it: a settled sample deal, its report standalone in `x-deal-report/v0`, with no counterparty half. Written by the tests of evidencebook PR #886 at `679d1c90` (lane eb-850). `capsulectl-deal verify --bundle` (built from evidencebook `c4da77ab`) reads it VALID, x-deal-v1 `pass`, report `standalone`. A page cannot check its report itself (capsule-viewer#405): with no report from capsulectl the receipt module draws only the can't-check line; with `keep-copy.verify.json` as `verifierReport` it draws the receipt as capsulectl reported it. Synthetic parties, generated keys. It is kept apart from `../receipt/`, whose bundles the frozen Python oracle reads. |
| `keep-copy.verify.json` | What `capsulectl-deal verify --bundle keep-copy.bundle.json` printed (capsulectl-deal built from evidencebook `c4da77ab`): `capsule-cli-result/v1`, verdict VALID, x-deal-v1 `pass`, report `standalone`. A page carries it as `verifierReport` to draw the v1 receipt as capsulectl reported it (#405 route 1). |

`counterparty-copy.bundle.json` is a counterparty's copy (`--share counterparty`) of the ARD demo's deal-fe219bb1ab3d4dec (Alder's side, test data and keys, 2026-11-25), and `counterparty-copy.verify.json` is `capsulectl deal verify --bundle` on it (VALID). The receipt tests use them to check that a shared copy never shows the holder's witness time.
