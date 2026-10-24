# Agent Action Capsule vectors

Byte copies of files in agent-action-capsule, kept at the same path below
`aac-vectors/`: files under its `vectors/` at their path below `vectors/`,
and its `schemas/examples/presentation-manifest-v0/` at `schemas/...`.
The table names the agent-action-capsule revision each was copied at and
the revision that last changed it there. Copy a newer version over the file
rather than editing it here, and update its row:
`test/aac-vectors-inventory.test.ts` fails when a file and its row differ
or a file has no row.

| File | Copied at | Last changed | Read by | SHA-256 |
| --- | --- | --- | --- | --- |
| `bundle/composed/vectors.json` | `f154515` | `a726b9f` | `test/composed-view.test.ts`, the resolution corpus | `205b72141a12169b8b53b2e4dd5725d3b14029c0f8b7ee9803114545553fa22e` |
| `bundle/producer-key/vectors.json` | `f154515` | `7204edc` | `test/presentation-registry.test.ts`, `test/registry-core.test.ts`, the resolution corpus | `979cc32898e30f4a961870c48e5766d022fb49e38040da20fdcd5e443896c433` |
| `bundle/report-single-record.json` | `60a5b11` | `d8f4a58` | the resolution corpus, `test/presentation-oracle.test.ts` | `5d679543af4b8592f2949690abbb65320c96056faae381cdbb1dd142e05d7e55` |
| `bundle/strict/vectors.json` | `60a5b11` | `30db069` | the resolution corpus (its producer-selected cases) | `d6dfcf5fc9db4d4a12deeb70062d7ff75db52001be184e98a458f881f829e6d6` |
| `minimum-necessary/bundle-internal-audit/input.json` | `f154515` | `7204edc` | `test/verification-check-lists-browser.test.ts` | `632ffa74d1e724495bebfcc37a39494601866979748670e132e7eb5c7f45e96f` |
| `schemas/examples/presentation-manifest-v0/builtin-evaluation-summary-graph.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `0747d86864c685d90e7dd9456bc8b378ff17dd5d2be9fa2f03a939f1ed00489b` |
| `schemas/examples/presentation-manifest-v0/builtin-no-aggregate.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `0ea7853f0bdc957c772cd019d3de78b525352c3ec61a427e1f0238c7495f0ee6` |
| `schemas/examples/presentation-manifest-v0/builtin-report-rows.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `b224a61b5494ba50e7b07b01d752972f1b46173deef17ffc46e608e286a81358` |
| `schemas/examples/presentation-manifest-v0/builtin-result-compliance.json` | `60a5b11` | `6f6c64a` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `7be762df73c93510c8011608f3595b27c9ab2861f9e28fb68e66a399f86831ec` |
| `schemas/examples/presentation-manifest-v0/builtin-result-contract-report.json` | `60a5b11` | `6f6c64a` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `94cec81a3f63cd8507abb8e5d9d3bcbe69bfc4d0cd2ceda6fb9ca28d0fe9a1e4` |
| `schemas/examples/presentation-manifest-v0/builtin-result-outcome-report.json` | `60a5b11` | `6f6c64a` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `6c15efd773dd13075fe23ffc204eb2540594765b47b6ee42a1280d9b30511547` |
| `schemas/examples/presentation-manifest-v0/builtin-result.json` | `60a5b11` | `6f6c64a` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `5a92f4b1c595488b48fb6b5db3ccd9f69e9d6eb10b41431cf0f3d1471a293650` |
| `schemas/examples/presentation-manifest-v0/example-composition-aware.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `ca98e004d50313e095030728f303731c1a8c5ac1600d36e17a54de61b627b47d` |
| `schemas/examples/presentation-manifest-v0/example-declarative-outcome.json` | `60a5b11` | `ffa1286` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `3c8751d2de9b6277d45e01dbd0160c4b467d26601e4ac39fd80cea5ba8980f9a` |
| `schemas/examples/presentation-manifest-v0/example-declarative-rules.json` | `60a5b11` | `ffa1286` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `065388baf7f05ee8877a086659339b0e7c31ecbae2f015647b8ebbd61aec58aa` |
| `schemas/examples/presentation-manifest-v0/example-generic-fallback.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `7cec1854d49f2a82a38855c2aa31c379678e7ab26044fef0f0625d27af037a6f` |
| `schemas/examples/presentation-manifest-v0/example-unilateral.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `7ea73393164bf2b8d60f034e80d844f1a18fd293796cb1f556587ce1039889b5` |
| `schemas/examples/presentation-manifest-v0/example-wording-pack-contract-report.json` | `60a5b11` | `e706487` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `162839dc65942994f03de89d26fa66590134e6fd3fd3305ef9421b0bb2992690` |
| `schemas/examples/presentation-manifest-v0/example-wording-pack-outcome.json` | `60a5b11` | `ffa1286` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `088cf0646d4a8fa063eb6d097aa8da77394dad470b20b2746d6964c91c3d29a3` |
| `schemas/examples/presentation-manifest-v0/example-wording-pack.json` | `60a5b11` | `ffa1286` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `0a04a729bf29caecda23cae6b5faa320f8aabc495458e99180150059e63c3730` |
| `schemas/examples/presentation-manifest-v0/neg-ambiguous-pair/a.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `8ab8639e35d46b00226d0f4ca674321275c5cc53f31f249d3ec63ab7df73216e` |
| `schemas/examples/presentation-manifest-v0/neg-ambiguous-pair/b.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `046776d5f7c31d96a8d06310eb0d5689f9a467ae09b50e66c6d2c5b553073785` |
| `schemas/examples/presentation-manifest-v0/neg-declarative-member.json` | `60a5b11` | `ffa1286` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `abcd2b24be4f31f23d5c1f38e596930013ac0801845b48e305946cad7e52d98b` |
| `schemas/examples/presentation-manifest-v0/neg-fallback-with-priority.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `01fdbeb1517a83367d846a19aec751cfb3b4a8f2c1d9a61f7206a7e9d124db21` |
| `schemas/examples/presentation-manifest-v0/neg-hint-wording-source.json` | `60a5b11` | `ffa1286` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `9aaa225ebe8fa0fb77cfe9c21f3b1fe85a413203d41b46a49e022f70d8d1980f` |
| `schemas/examples/presentation-manifest-v0/neg-missing-id.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `a20231ec0fe66c9c2c65bd2e1a3b2a1122d667eb705fbbc1e4de186f0e98bb37` |
| `schemas/examples/presentation-manifest-v0/neg-missing-presentation-api.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `900750f533c9473fe62cca942b8d8bbd22a54f0ac6648c94f42a42df0063a8d2` |
| `schemas/examples/presentation-manifest-v0/neg-presentation-v1-namespace.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `e1f661a98d01588246d15a9adfddf24a52eb96f74c68813b2cb352f269426772` |
| `schemas/examples/presentation-manifest-v0/neg-unknown-field.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `77d1823a741cfc9b508e25a7d51e8c842fd331ca6ee87c5155d45d2615f524b4` |
| `schemas/examples/presentation-manifest-v0/neg-unsupported-presentation-api.json` | `60a5b11` | `fa49b4d` | the resolution corpus generator, `test/builtin-manifests.test.ts`, Go `presentation` | `3764433f0c7f36ec451fb0db6e0008ef806f34d98ebc536f55dca4aea3781f6b` |

`viewer-core-text/` (not in the table) is a byte copy of agent-action-capsule's
`vectors/viewer-core-text/` at `b76697d78dfe9d1f9a76a8d1a21dacba174c53a6`
(last changed there in `5e2c4d4`), with its own `SHA256SUMS`. It is read by
`test/viewer-core-text-vectors.test.ts`, which also checks every file
against those sums.
