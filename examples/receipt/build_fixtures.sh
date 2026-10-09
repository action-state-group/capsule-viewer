#!/usr/bin/env bash
# build_fixtures.sh -- (re)build the receipt module's fixtures in
# tests/testdata/receipt/ from a capsule-cli checkout, through the real CLI:
#
#   examples/receipt/build_fixtures.sh CAPSULE_CLI_CHECKOUT
#
# * keep / counterparty / adjudicator: ONE synthetic deal (capsule-cli's
#   retail-checkout demo: an example shop, an example item), and the three
#   copies capsulectl cuts of it -- the user's own, and the shared copies for
#   the other party and for an adjudicator. A shared copy writes only its page,
#   so its bundle is the one the page carries.
# * golden-2: capsule-cli's own presentation golden for the unilateral receipt
#   (internal/cli/testdata/presentation/2-unilateral-receipt), the bundle and
#   the snapshot of what deal-view.js showed for it, copied unchanged.
# * <name>.verify.json: what `capsulectl verify --bundle` reports for each
#   bundle -- the verifier result the module's context is built from.
#
# Keys and capsule ids are fresh on every run, so a rebuild rewrites every
# fixture except golden-2. Needs bash, go, jq and perl. Writes only the
# fixtures' directory and its own temp directory.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cli="$(cd "${1:?usage: build_fixtures.sh CAPSULE_CLI_CHECKOUT}" && pwd)"
out="$root/tests/testdata/receipt"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

(cd "$cli" && go build -o "$work/capsulectl" ./cmd/capsulectl)
capsulectl() { "$work/capsulectl" "$@"; }
mkdir -p "$out"
cd "$work"
export XDG_CONFIG_HOME="$work/config" CAPSULE_DEAL_CHECK_URL=

demo="$cli/skills/deal/demo/retail-checkout"
capsulectl deal init --profile deal --dir ./deal --no-witness \
  --materiality "$cli/skills/deal/profile/materiality-predicate/neutral.json" >/dev/null
id=$(capsulectl --profile deal deal open --input "$demo/open.json" | jq -r .deal_id)
capsulectl --profile deal deal check --deal "$id" --input "$demo/check-pay.json" >/dev/null
capsulectl --profile deal deal note --deal "$id" --kind act --input "$demo/act-pay.json" >/dev/null
capsulectl --profile deal deal report --deal "$id" --html keep.html --bundle keep.json >/dev/null
for audience in counterparty adjudicator; do
  capsulectl --profile deal deal report --deal "$id" --share "$audience" --to "the $audience" --html "$audience.html" >/dev/null
  perl -ne 'print "$1\n" if /^\s*<script>window\.__BUNDLE__ = (.*);<\/script>$/' "$audience.html" >"$audience.json"
done

golden="$cli/internal/cli/testdata/presentation/2-unilateral-receipt"
cp "$golden/bundle.json" golden-2.json
cp "$golden/snapshot.json" "$out/golden-2.snapshot.json"

for name in keep counterparty adjudicator golden-2; do
  [ "$name" = golden-2 ] && cp golden-2.json "$out/golden-2.bundle.json" || jq -S . "$name.json" >"$out/$name.bundle.json"
  # Verify the file as written, so the report is for exactly those bytes.
  capsulectl verify --bundle "$out/$name.bundle.json" | jq -S . >"$out/$name.verify.json"
  echo "$name: $(jq -r .verdict "$out/$name.verify.json")"
done
