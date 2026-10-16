<!-- SPDX-License-Identifier: Apache-2.0 -->
# Releasing

capsule-viewer publishes two packages:

- the TypeScript package `@action-state-group/capsule-viewer` (`ts/`), which
  releases through the workflows below;
- the Go module `github.com/action-state-group/capsule-viewer/go` (`go/`),
  released by pushing a tag (see [Go](#go)).

The Python package at the repository root is not published; it is installed
from source. Publishing it later means adding a `releases.json` entry, a
publisher workflow and a PyPI trusted publisher, as capsule-emit does.

A TypeScript release is a merged version bump: you choose the bump, review it
as a pull request, and merging it tags and publishes. The packages are listed
in [`.github/releases.json`](.github/releases.json), which
[`.github/release.py`](.github/release.py) reads. `release.py` is shared, as
identical copies, by the action-state-group repositories: change it in all of
them together, never here alone.

| Package | Manifest | Tag | Publisher | Environment |
|---|---|---|---|---|
| `ts` | `ts/package.json` and `ts/package-lock.json` | `ts/v<version>` | `publish-ts.yml` | `npm` (tag rule `ts/v*`) |

The prefix is only on the Git tag. The registry version stays plain (`0.1.0`).

## Cutting a release

1. **Prepare.** Run [Release · Prepare](https://github.com/action-state-group/capsule-viewer/actions/workflows/prepare-release.yml)
   on `main`, choosing the package and `patch`, `minor` or `major`. It raises
   the version from the current one, commits the bump with a sign-off, and
   pushes `release/<package>-v<version>`.
2. **Review.** Open the pull request from the link in the run summary. Open it
   yourself: a pull request opened by the workflow would not start CI.
3. **Merge.** [Release · Tag](https://github.com/action-state-group/capsule-viewer/actions/workflows/tag-release.yml)
   runs on the merge. For each package whose version changed it creates the
   tag and GitHub Release on the merge commit and dispatches the package's
   publisher on that tag.
4. **Publish.** The publisher checks that the tag is the package's prefix plus
   its manifest version and that the commit is on `main`, runs `npm run check`,
   then uploads through OIDC trusted publishing from its environment. Confirm
   the run and the new version on the registry.

Bumping a version by hand in any pull request releases it the same way when it
merges.

If a publish fails after the tag exists:

- **A transient or configuration failure** (registry outage, trusted publisher
  or environment settings): fix it and re-run the failed publisher run. If npm
  already accepted the version, the re-run stops there: the version is
  released.
- **A defect in the code or the workflow:** a re-run uses the tagged commit
  again, so a fix merged to `main` does not reach it. Release the fix as a new
  version.
- **Release · Tag failed before dispatching** (no publisher run exists): re-run
  the Release · Tag run. It accepts a tag and GitHub Release it already created
  on the same commit and dispatches the publisher again.

## Safeguards

- **Guard.** `release.py check` refuses a tag from another package, a version
  that differs from the manifest, and a commit that is not on `main`.
  `publish-ts.yml` also refuses a version npm already has and runs the same
  `npm run check` as CI, including a packed-consumer import.
- **Environment.** `npm` accepts deployments only from `ts/v*` tags, so a job
  started from a branch or another tag cannot upload.
- **Tags.** The `release tags` ruleset lets only admins move or delete tags.
  Creating `go/v*` tags is also admin-only, because a Go release is the pushed
  tag itself, with no workflow in between.

## Go

An admin pushes `go/v<version>` on a `main` commit whose CI passed. The version
is fetchable as soon as the tag exists, so a bad release can only be withdrawn
with a `retract` directive in a later version. CI on `main` covers the module's
tests.

## Registry configuration

npm's trusted publisher names owner `action-state-group`, repository
`capsule-viewer`, the publisher workflow file and its environment:

| Registry | Package | Workflow | Environment |
|---|---|---|---|
| npm | `@action-state-group/capsule-viewer` | `publish-ts.yml` | `npm` |

It is set in the package's **Settings → Trusted Publisher** on npmjs.com. npm
offers that only for a package that exists, so the first version is published
by hand by an `@action-state-group` npm owner: after Release · Tag creates
`ts/v<version>`, its publisher run fails at the upload step, and the owner runs
`npm ci && npm run check && npm publish --access public` from `ts/` with that
tag checked out, then configures the trusted publisher. Do not re-run the failed
run after the manual publish; its check rejects a version npm already has.
Every later version goes through the flow above.

Renaming a publisher workflow breaks publishing until the registry is updated
first. No registry token is stored in this repository: trusted publishing
exchanges the workflow's OIDC identity for a short-lived upload credential, and
npm adds provenance automatically.
