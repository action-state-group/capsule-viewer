<!-- SPDX-License-Identifier: BSD-3-Clause -->
# Schemas

The presentation manifest schema and its examples, and the checkers that run
them, moved here from agent-action-capsule at
`60a5b119a1a979b1970d22caec8577eac0bb59e8` (AAC#379). Their normative text is
`spec/presentation-contract-v0.md` and `spec/contract-report-module-v1.md`.

| Path | What it is |
| --- | --- |
| `presentation-manifest-v0.json` | The manifest and wording pack schema (JSON Schema 2020-12). |
| `examples/presentation-manifest-v0/` | The built-in manifests, the example manifests and wording packs, and the negatives (contract appendices A and B). |
| `check_presentation_manifest_examples.py` | Validates the examples, proves each negative with a mutant, and runs the resolution rule over them. |
| `check_contract_report_examples.py` | The pack half of AAC's checker of the same name: the contract-report wording keys, the example pack and the rendering cases. |

Run both with `python3 schemas/<checker>.py`; they need `jsonschema`
(`pip install -e ".[dev]"`). CI runs them on every pull request.

## Licence

Everything under `schemas/`, like the moved text under `spec/`, is
BSD-3-Clause, as it was in agent-action-capsule (its `LICENSING.md`
section 2); the licence text is `LICENSE-BSD-3-Clause` at the repository
root. The rest of capsule-viewer is Apache-2.0 (`LICENSE`).

## Vendored agent-action-capsule files

`vendor/agent-action-capsule/` holds byte copies of the agent-action-capsule
files `check_contract_report_examples.py` reads, at their AAC paths. AAC owns
the Evidence Result schema and its vectors, so they are not edited here: copy
a newer version over the file and update its row. The checker fails when a
file's bytes do not hash to its row, or a file and the table disagree.

Each row names the agent-action-capsule revision the file was copied at and
the revision that last changed it there.

| File | Copied at | Last changed | Read by | SHA-256 |
| --- | --- | --- | --- | --- |
| `schemas/evidence-result-v0.json` | `b646f94` | `5a0fe18` | enum values of the wording keys | `2776a4441b3ee2e3a9c30fe63c008efdebc5bf6450cdaf0a422ec6b5586352e4` |
| `schemas/examples/contract-report-v1/rendering-cases.json` | `b646f94` | `b646f94` | the rendering cases | `df3456f1e3d141974baaae9a4b5fb8f55033ee7608a231bb8cbe2a2a2637d3e5` |
| `vectors/evidence-result/pos-example-org-applicability-boundary-result.json` | `60a5b11` | `e706487` | named by a rendering case | `7a92bb4800f336c4f92cd69edd10f81ab911a3afe875f7046e6cdc3018c60e88` |
| `vectors/evidence-result/pos-example-org-applicability-in-force-result.json` | `60a5b11` | `e706487` | named by a rendering case | `4be041e36bfe3e852b11f2e5f09d20e767b937c1cd759c00a0a891387507f26c` |
| `vectors/evidence-result/pos-example-org-applicability-result.json` | `60a5b11` | `e706487` | named by a rendering case | `194e9b834218b02d5cd1fab4c378df72a10816cb5f3bbb6c16bbb8d364a94783` |
| `vectors/evidence-result/pos-example-org-out-of-scope-empty-result.json` | `60a5b11` | `e706487` | named by a rendering case | `b4abb34ef2068019952d6ebf416f04208d031e12ff922fee5ab19159af3b33a9` |
| `vectors/evidence-result/pos-example-org-out-of-scope-result.json` | `60a5b11` | `e706487` | named by a rendering case | `f1e1f8a29b077accbe2eca44346692c9c2c8e8a1cad12f145fe2c40b1689c067` |
