# Working in capsule-viewer

## Before you push

Before every push: `scripts/ci-local.sh` (under 10 min on an Apple-silicon
Mac; needs Google Chrome or Chromium, network access to github.com for the pinned
agent-action-capsule revisions, and npm's registry for Node 22 and 24). It runs
every job pull requests run, the whole `ts/` check on Node 22 and 24 included,
and nothing main or the nightly run checks is left out, so `scripts/ci-local.sh
--full` is the same command. The nightly `.github/workflows/ts-full.yml` runs
the `ts/` check again against the hosted runner's current Chrome.
