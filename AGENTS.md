# Working in capsule-viewer

## Before you push

Before every push: `scripts/ci-local.sh` (about 20 min on an Apple-silicon
Mac; needs Google Chrome or Chromium, network access to github.com for the pinned
agent-action-capsule revisions, and npm's registry for Node 22 and 24). It
already runs everything main and the nightly run, so `scripts/ci-local.sh
--full` is the same command and no change needs more. Pull requests run only
the fast set; the whole `ts/` check (`test/presentation-builder.test.ts`) and
Node 22 run nightly and on main (`.github/workflows/ts-full.yml`).
