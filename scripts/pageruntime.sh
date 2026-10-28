#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Rebuild the page runtime go/pageruntime ships and compare it byte for byte:
#
#   scripts/pageruntime.sh           # check the shipped file against a rebuild at pageruntime.Commit
#   scripts/pageruntime.sh --write   # rebuild at HEAD and refresh the file, its .sha256 and pageruntime.Commit
#
# The build is ts/scripts/build-iife.mjs, run after `npm ci` in a clean
# worktree of the commit, so the bytes depend only on that commit's tree and
# lockfile, and on whether the tag ts/v<version> points at it (the page's
# "Verified by" line says "plus unreleased changes" when none does), so tags
# must be fetched: --write fetches them. --write needs a clean tracked tree, since the commit it records
# must be the one the runtime was built from. The refreshed files are then
# committed on top of that commit: the runtime never has to contain itself.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
dir="$root/go/pageruntime"
asset="$dir/evidence-graph.iife.js"
source_go="$dir/pageruntime.go"

case "${1:-}" in
  "") mode=check ;;
  --write) mode=write ;;
  *) echo "usage: scripts/pageruntime.sh [--write]" >&2; exit 2 ;;
esac

if [ "$mode" = write ]; then
  if [ -n "$(git -C "$root" status --porcelain --untracked-files=no)" ]; then
    echo "pageruntime: commit or discard tracked changes first; the runtime must be built from a commit" >&2
    exit 1
  fi
  git -C "$root" fetch --tags --quiet
  commit="$(git -C "$root" rev-parse HEAD)"
else
  commit="$(sed -n 's/^const Commit = "\([0-9a-f]\{40\}\)"$/\1/p' "$source_go")"
  if [ -z "$commit" ]; then
    echo "pageruntime: no 'const Commit = \"<40 hex>\"' line in $source_go" >&2
    exit 1
  fi
  if ! git -C "$root" merge-base --is-ancestor "$commit" HEAD; then
    echo "pageruntime: Commit $commit is not an ancestor of HEAD" >&2
    exit 1
  fi
fi

work="$(mktemp -d)"
cleanup() {
  git -C "$root" worktree remove --force "$work/tree" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
git -C "$root" worktree add --detach --quiet "$work/tree" "$commit"
(
  cd "$work/tree/ts"
  npm ci --no-audit --no-fund --loglevel=error >/dev/null
  npm run --silent emitter:iife
)
built="$work/tree/ts/dist/evidence-graph.iife.js"
sum="$(shasum -a 256 "$built" | cut -d' ' -f1)"

if [ "$mode" = write ]; then
  cp "$built" "$asset"
  echo "$sum" > "$asset.sha256"
  sed -i.bak "s/^const Commit = \"[0-9a-f]*\"$/const Commit = \"$commit\"/" "$source_go"
  rm -f "$source_go.bak"
  grep -q "^const Commit = \"$commit\"$" "$source_go"
  echo "pageruntime: wrote the runtime built at $commit (sha256 $sum); commit go/pageruntime"
  exit 0
fi

if ! cmp -s "$built" "$asset"; then
  echo "pageruntime: go/pageruntime/evidence-graph.iife.js is not the runtime built at $commit" >&2
  echo "  (the tag ts/v<version> on the commit is a build input: git fetch --tags, then rerun)" >&2
  echo "  shipped sha256 $(shasum -a 256 "$asset" | cut -d' ' -f1), rebuilt $sum" >&2
  exit 1
fi
if [ "$(cat "$asset.sha256")" != "$sum" ]; then
  echo "pageruntime: evidence-graph.iife.js.sha256 does not hold $sum" >&2
  exit 1
fi
echo "pageruntime: the shipped runtime is the one built at $commit (sha256 $sum)"
