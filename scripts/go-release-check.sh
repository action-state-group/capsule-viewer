#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Check that the checked-out commit can be tagged go/v<version>:
#
#   scripts/go-release-check.sh <version>
#
# An admin runs it on the commit before pushing the tag, since a pushed Go
# version cannot be withdrawn; release-go.yml runs it again on the tag. It
# refuses unless the commit is on origin/main, ts/v<version> exists, the page
# runtime go/pageruntime ships was built at the ts/v<version> commit and
# states viewerVersion <version>, go/ differs from that commit only by the
# runtime refresh, the runtime rebuilds byte for byte there
# (scripts/pageruntime.sh), and the Go module's vet and tests pass. Building
# the runtime at the ts tag makes it the same bytes as the npm release's
# dist/evidence-graph.iife.js. See RELEASING.md.
set -euo pipefail

version="${1:-}"
if ! printf '%s\n' "$version" | grep -Eqx '(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?'; then
  echo "usage: scripts/go-release-check.sh <major>.<minor>.<patch>[-<pre-release>]" >&2
  exit 2
fi

root="$(git rev-parse --show-toplevel)"
cd "$root"
head="$(git rev-parse HEAD)"

# The checks read the working tree, so it must be the commit being tagged.
[ -z "$(git status --porcelain)" ] \
  || { echo "go-release-check: commit or discard every change first; the tag gets $head, not the working tree" >&2; exit 1; }

git merge-base --is-ancestor "$head" origin/main \
  || { echo "go-release-check: $head is not on origin/main (fetch it first?)" >&2; exit 1; }

ts_commit="$(git rev-parse --verify --quiet "refs/tags/ts/v$version^{commit}")" \
  || { echo "go-release-check: no tag ts/v$version; release the npm package first" >&2; exit 1; }
runtime_commit="$(sed -n 's/^const Commit = "\([0-9a-f]\{40\}\)"$/\1/p' go/pageruntime/pageruntime.go)"
[ "$runtime_commit" = "$ts_commit" ] \
  || { echo "go-release-check: go/pageruntime was built at ${runtime_commit:-<none>}, not at ts/v$version ($ts_commit); run scripts/pageruntime.sh --write on ts/v$version" >&2; exit 1; }
grep -Fq "viewerVersion: \"$version\"," go/pageruntime/evidence-graph.iife.js \
  || { echo "go-release-check: go/pageruntime/evidence-graph.iife.js does not state viewerVersion $version" >&2; exit 1; }
# The Go module must be ts/v<version>'s code plus what pageruntime.sh --write
# changes (the runtime, its .sha256 and pageruntime.go's Commit line), so
# nothing merged after the ts release ships under its version. --no-renames
# lists a moved file under both paths.
changed="$(git diff --no-renames --name-only "$ts_commit" "$head" -- go/)"
other="$(printf '%s\n' "$changed" | { grep -Fvx \
  -e go/pageruntime/evidence-graph.iife.js \
  -e go/pageruntime/evidence-graph.iife.js.sha256 \
  -e go/pageruntime/pageruntime.go \
  -e '' || [ $? = 1 ]; })"
without_commit() { sed 's/^const Commit = "[0-9a-f]*"$/const Commit = ""/'; }
if [ "$(git show "$ts_commit:go/pageruntime/pageruntime.go" | without_commit)" \
  != "$(git show "$head:go/pageruntime/pageruntime.go" | without_commit)" ]; then
  other="${other:+$other
}go/pageruntime/pageruntime.go (beyond its Commit line)"
fi
[ -z "$other" ] \
  || { printf 'go-release-check: go/ differs from ts/v%s beyond the runtime refresh:\n%s\ntag the refresh commit made on a branch cut from ts/v%s instead\n' "$version" "$other" "$version" >&2; exit 1; }

scripts/pageruntime.sh
(cd go && go vet ./... && go test ./...)
echo "go-release-check: $head can be tagged go/v$version"
