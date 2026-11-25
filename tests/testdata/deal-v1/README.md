<!-- SPDX-License-Identifier: Apache-2.0 -->
# x-deal-v1 test data

| File | What it is |
|---|---|
| `report-vectors.json`, `report-verify-vectors.json`, `report-bundle-vectors.json` | evidencebook's x-deal-v1 report vectors, which the v1 receipt module is held to. |
| `keep-copy.bundle.json` | An x-deal-v1 keep copy as `capsulectl deal report --bundle` cuts it: a settled sample deal, its report standalone in `x-deal-report/v0`, with no counterparty half. Written by the tests of evidencebook PR #886 at `679d1c90` (lane eb-850). `capsulectl-deal verify --bundle` (built from evidencebook `c4da77ab`) reads it VALID, x-deal-v1 `pass`, report `standalone`. A page cannot check its report (capsule-viewer#405), so the receipt module draws only the can't-check line for it. Synthetic parties, generated keys. It is kept apart from `../receipt/`, whose bundles the frozen Python oracle reads. |
