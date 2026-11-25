# Working in capsule-viewer

## Before you push

Before every push: `scripts/ci-local.sh` (about 8 min on an Apple-silicon
Mac). Before pushing a change to `ts/`, `src/`, `tests/`, `vectors/`, `go/`,
`schemas/`, `examples/`, `js-tests/`, `tokens/` or the root `package.json`, also
`scripts/ci-local.sh --full` (about 23 min; needs Google Chrome, network
access to github.com for the pinned agent-action-capsule revisions, and npm's
registry for Node 22 and 24). Pull requests run only the fast set; the whole
`ts/` check (`test/presentation-builder.test.ts`) and Node 22 run nightly and
on main (`.github/workflows/ts-full.yml`).
