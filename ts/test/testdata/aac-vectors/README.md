# Agent Action Capsule vectors

Byte copies of files in agent-action-capsule, kept at the same path below
`aac-vectors/`: files under its `vectors/` at their path below `vectors/`.
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

`viewer-core-text/` (not in the table) is a byte copy of agent-action-capsule's
`vectors/viewer-core-text/` at `b76697d78dfe9d1f9a76a8d1a21dacba174c53a6`
(last changed there in `5e2c4d4`), with its own `SHA256SUMS`. It is read by
`test/viewer-core-text-vectors.test.ts`, which also checks every file
against those sums.
