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
| `bundle/strict/vectors.json` | `b646f94` | `c290041` | the resolution corpus (its producer-selected cases) | `759c69c029097dc54112c29bc3366679a7a58535507f3cbe7952df9631023b46` |
| `minimum-necessary/bundle-internal-audit/input.json` | `f154515` | `7204edc` | `test/verification-check-lists-browser.test.ts` | `632ffa74d1e724495bebfcc37a39494601866979748670e132e7eb5c7f45e96f` |

`viewer-core-text/` (not in the table) is a byte copy of agent-action-capsule's
`vectors/viewer-core-text/` at `b646f94aaad7c9fdabc553c458fabd7e28619c65`
(last changed there in `b646f94`), with its own `SHA256SUMS`. It is read by
`test/viewer-core-text-vectors.test.ts`, which also checks every file
against those sums.
