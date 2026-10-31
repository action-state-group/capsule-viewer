<!-- SPDX-License-Identifier: Apache-2.0 -->
# Releasing

capsule-viewer publishes two packages:

- the TypeScript package `@action-state-group/capsule-viewer` (`ts/`), which
  releases through the workflows below;
- the Go module `github.com/action-state-group/capsule-viewer/go` (`go/`),
  released by pushing a tag (see [Go](#go)).

A viewer release `X` is both: `ts/vX`, then `go/vX` on the `main` commit that
ships the page runtime built at `ts/vX`. The runtime states `X` as its viewer
version, so the version a report page names is the release's, and the Go
module's runtime is the same bytes as the npm package's. Consumers pin the Go
tag (see [Pinning a viewer release](#pinning-a-viewer-release)).

Releases before this rule were not paired (`ts/v0.1.0`, `go/v0.2.0`). The first
paired release is `0.3.0`: set it by hand in the release pull request, since
Prepare's `minor` bump of `ts` would give `0.2.0`, which the Go module already
used.

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
   yourself: a pull request opened by the workflow would not start CI. Add the
   [CHANGELOG](CHANGELOG.md) entry on the same branch if it is not in yet; the
   GitHub Release notes point to it. For `ts`, also set `viewerVersion` in
   [`ts/src/viewer-build.ts`](ts/src/viewer-build.ts) to the new version on
   the same branch: report pages name it in their "Verified by" line, and
   `npm run check` fails until it matches `ts/package.json`. A dependency
   bump of `@action-state-group/agent-action-capsule` or
   `@action-state-group/cll` sets `verifierVersion` or `cllVersion` there the
   same way.
3. **Merge.** [Release · Tag](https://github.com/action-state-group/capsule-viewer/actions/workflows/tag-release.yml)
   runs on the merge. For each package whose version changed it creates the
   tag and GitHub Release on the merge commit and dispatches the package's
   publisher on that tag.
4. **Publish.** The publisher checks that the tag is the package's prefix plus
   its manifest version and that the commit is on `main`, runs `npm run check`,
   then uploads through OIDC trusted publishing from its environment. Confirm
   the run and the new version on the registry.
5. **Ship the runtime in Go.** On a clean checkout of the new
   `ts/v<version>` tag, run `scripts/pageruntime.sh --write`, commit the
   refreshed `go/pageruntime` on a branch cut from the tag, and merge it as a
   pull request with a merge commit (see [Go](#go)). If the refresh ships a
   name listed in `NOT_YET_SHIPPED` in `ts/test/emitter-iife.test.ts`, drop it
   there in the same pull request: the runtime's contract test fails until
   you do. Do not rebase the branch
   or update it from `main`.
6. **Tag the Go module.** An admin runs
   `scripts/go-release-check.sh <version>` on that pull request's head commit,
   the tag plus the refresh, then pushes `go/v<version>` on it, not on the
   merge commit, which carries whatever reached `main` after `ts/v<version>`. [Release · Go](https://github.com/action-state-group/capsule-viewer/actions/workflows/release-go.yml)
   checks it again and publishes its GitHub Release. The release also carries
   `standard-history-module-v<version>.tar.gz` (and its `.sha256`): the History
   card module's manifest, script, stylesheets and wording pack, and
   `presentation.json`, the `cli-plugin/v1` presentations entry a plugin copies.
   It is built by `python -m capsule_viewer.standard_history.module_slot --bundle`
   and is the same bytes on every run.

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
  tag itself: `scripts/go-release-check.sh` is the check before it, and
  Release · Go repeats it after.

## Go

An admin pushes `go/v<version>` on a `main` commit whose CI passed, after
[`scripts/go-release-check.sh`](scripts/go-release-check.sh) `<version>` passes
on it. The version is fetchable as soon as the tag exists, so a bad release can
only be withdrawn with a `retract` directive in a later version. The check
refuses the commit unless it is on `origin/main`, `ts/v<version>` exists, the
runtime was built at the `ts/v<version>` commit (`pageruntime.Commit`) and
states `viewerVersion` `<version>`, `go/` differs from that commit only by the
refresh (the runtime, its `.sha256` and `pageruntime.Commit`),
`scripts/pageruntime.sh` rebuilds it there
byte for byte, and the module's vet and tests pass.

The tag starts [`release-go.yml`](.github/workflows/release-go.yml)
(Release · Go). It runs the same check on the tag, then publishes the tag's
GitHub Release with the module's runtime files as assets:

| Asset | What it is |
|---|---|
| `evidence-graph.iife.js` | the page runtime, `pageruntime.IIFE` |
| `evidence-graph.iife.js.sha256` | its SHA-256 in hex, `pageruntime.SHA256` |
| `NOTICE`, `THIRD_PARTY_NOTICES.md` | the licenses of the components it bundles |
| `runtime-style-hashes.txt` | the CSP hashes of the styles it inserts (`go/emitter`) |
| `pageruntime-v<version>.sigstore.json` | the build provenance attestation over the files above |

The release notes name the SHA-256 and the commit the runtime was built from.
Check an asset with
`gh attestation verify FILE --bundle pageruntime-v<version>.sigstore.json --repo action-state-group/capsule-viewer --signer-workflow action-state-group/capsule-viewer/.github/workflows/release-go.yml`.

If Release · Go refuses a tag, the module version still exists. Release the
next version as a full viewer release, both `ts/v` and `go/v`, with a `retract`
of the refused version in `go/go.mod`; the refused version's `ts/v` tag stays
without a Go pair. If the run failed for another reason, fix the cause and
re-run it; it finishes a draft release it left, and never changes a published
one.

The module ships the page runtime as built (`go/pageruntime`). To ship a newer
one, run `scripts/pageruntime.sh --write` on a clean checkout of the commit
holding the change to `ts/`, and commit the refreshed files on top of it.
The build also reads whether the tag `ts/v<version>` points at that commit (a
page from any other commit says "plus unreleased changes" after the viewer
version), so the script fetches tags first, and a tag added later to the
commit `pageruntime.Commit` names changes the rebuild: refresh then too.
`pageruntime.Commit` must stay an ancestor of `main`, or the `pageruntime` CI
job fails: a squash or rebase merge rewrites that commit. So either merge the
`ts/` change first and refresh on the merged `main` commit, or keep both
commits in one pull request and merge it with a merge commit. A release always
refreshes on the merged `ts/v<version>` commit.

## Pinning a viewer release

Go consumers pin `go/v<version>`; npm consumers pin `<version>`. Both carry the
same page runtime. Today no consumer pins a viewer release: capsule-cli embeds
its own build of the runtime, which evidencebook's `report` passes on. The
switches are planned:

- **capsulectl**, through capsule-cli
  ([capsule-cli#472](https://github.com/action-state-group/capsule-cli/issues/472))
  and evidencebook's `report`
  ([evidencebook#152](https://github.com/action-state-group/evidencebook/issues/152)),
  will require `github.com/action-state-group/capsule-viewer/go v<version>` in
  `go.mod`. `go.sum` then holds the module's hash, which the Go checksum
  database fixes for the tag. Passing `pageruntime.IIFE` with
  `pageruntime.SHA256` as the emitter's `CoreRuntimeSHA256` makes the emitter
  re-check the runtime against its digest on every page it builds.
- **The evidence-network loop** has no viewer line in its `versions.lock` yet.
  Once capsulectl pins a release, it can name it as
  `capsule-viewer action-state-group/capsule-viewer go/v<version>`, the version
  the capsulectl it pins requires. The Release's assets let a check without Go
  compare a page's runtime with the release.

## Registry configuration

npm's trusted publisher names owner `action-state-group`, repository
`capsule-viewer`, the publisher workflow file and its environment:

| Registry | Package | Workflow | Environment |
|---|---|---|---|
| npm | `@action-state-group/capsule-viewer` | `publish-ts.yml` | `npm` |

It is set in the package's **Settings → Trusted Publisher** on npmjs.com. npm
offers that only for a package that exists, so an `@action-state-group` npm
owner published a `0.0.0` placeholder by hand, before the release flow existed,
and then configured the trusted publisher. The first OIDC release is `0.1.0`.

A new manifest counts as a version change, so the merge that added `ts/` at
`0.0.0` made Release · Tag create `ts/v0.0.0`. Its publisher run failed at the
"already published" check, as expected, and uploaded nothing. Do not re-run it.

Renaming a publisher workflow breaks publishing until the registry is updated
first. No registry token is stored in this repository: trusted publishing
exchanges the workflow's OIDC identity for a short-lived upload credential, and
npm adds provenance automatically.
