Byte copies of agent-action-capsule's `vectors/bundle/parent-log-witness/vectors.json` and
`manifest.json`, taken at `e45db9a` (the ts 0.14.0 release, last changed there in `3c808e2`). They sit
outside `aac-vectors/` because `scripts/check-vendored-aac.py` compares every file there at one
older pinned AAC revision (`b646f94`), which does not hold this file; moving that pin means
re-vendoring the other copies too. `test/parent-witness-view.test.ts` checks `vectors.json` against
the SHA-256 in `manifest.json`.
